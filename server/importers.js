import JSZip from 'jszip';
import { Parser as TarParser } from 'tar';
import { Readable } from 'node:stream';
import path from 'node:path';
import { isMarkdownSkillCandidate, normalizeRelPath } from './parser.js';

function githubHeaders(token, rawAccept = false) {
  const headers = {
    'User-Agent': 'SkillVault-MCP/1.0',
    Accept: rawAccept ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
  };
  if (token && String(token).trim()) {
    headers.Authorization = `Bearer ${String(token).trim()}`;
  }
  return headers;
}

export function parseGitHubInput(rawInput, explicitBranch = '', explicitSubpath = '') {
  const input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Please provide a GitHub repository URL or owner/repo shorthand.');
  }

  // Handle raw.githubusercontent.com/{owner}/{repo}/{branch}/{path...}
  const rawMatch = input.match(
    /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i
  );
  if (rawMatch) {
    return {
      owner: rawMatch[1],
      repo: rawMatch[2].replace(/\.git$/i, ''),
      branch: explicitBranch || decodeURIComponent(rawMatch[3]),
      subpath: explicitSubpath || normalizeRelPath(decodeURIComponent(rawMatch[4])),
      isBlob: true,
    };
  }

  // Handle github.com/{owner}/{repo}[/(tree|blob)/{branch}/{subpath...}]
  const ghUrlMatch = input.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)(?:\/(tree|blob)\/([^/#?]+)(?:\/([^#?]+))?)?/i
  );
  if (ghUrlMatch) {
    return {
      owner: ghUrlMatch[1],
      repo: ghUrlMatch[2].replace(/\.git$/i, ''),
      branch: explicitBranch || (ghUrlMatch[4] ? decodeURIComponent(ghUrlMatch[4]) : ''),
      subpath:
        explicitSubpath || (ghUrlMatch[5] ? normalizeRelPath(decodeURIComponent(ghUrlMatch[5])) : ''),
      isBlob: ghUrlMatch[3]?.toLowerCase() === 'blob',
    };
  }

  // Handle shorthand owner/repo[/optional/subpath]
  const shortMatch = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.+))?$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2].replace(/\.git$/i, ''),
      branch: explicitBranch || '',
      subpath: explicitSubpath || (shortMatch[3] ? normalizeRelPath(shortMatch[3]) : ''),
      isBlob: false,
    };
  }

  throw new Error(
    `Could not parse "${input}". Expected format like "owner/repo" or "https://github.com/owner/repo/tree/main/skills".`
  );
}

export async function fetchGitHubMarkdownFiles({
  input,
  branch: branchOverride = '',
  subpath: subpathOverride = '',
  token = '',
}) {
  const parsed = parseGitHubInput(input, branchOverride, subpathOverride);
  const { owner, repo } = parsed;
  let resolvedBranch = parsed.branch;
  const subpath = normalizeRelPath(parsed.subpath);

  // Resolve default branch via GitHub API if none provided
  if (!resolvedBranch) {
    const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: githubHeaders(token),
    });
    if (!metaRes.ok) {
      if (metaRes.status === 404) {
        throw new Error(
          `Repository "${owner}/${repo}" was not found (if private, provide a GitHub Personal Access Token).`
        );
      }
      throw new Error(`GitHub API error (${metaRes.status}) checking ${owner}/${repo}.`);
    }
    const meta = await metaRes.json();
    resolvedBranch = meta.default_branch || 'main';
  }

  // Single file blob download via GitHub Contents API
  if (parsed.isBlob || /\.(md|mdx|mdc|markdown)$/i.test(subpath)) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${subpath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?ref=${encodeURIComponent(resolvedBranch)}`;

    const fileRes = await fetch(apiUrl, { headers: githubHeaders(token, true) });
    if (fileRes.ok) {
      const content = await fileRes.text();
      return {
        owner,
        repo,
        branch: resolvedBranch,
        subpath,
        canonicalUrl: `https://github.com/${owner}/${repo}/blob/${resolvedBranch}/${subpath}`,
        files: [{ path: path.posix.basename(subpath), content }],
      };
    }
  }

  // Full repo or subfolder fast download via tarball stream
  const tarballUrl = token
    ? `https://api.github.com/repos/${owner}/${repo}/tarball/${encodeURIComponent(resolvedBranch)}`
    : `https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(resolvedBranch)}`;

  const tarRes = await fetch(tarballUrl, {
    headers: token ? githubHeaders(token) : { 'User-Agent': 'SkillVault-MCP/1.0' },
  });

  if (!tarRes.ok) {
    throw new Error(
      `Failed to fetch archive for ${owner}/${repo}@${resolvedBranch} (HTTP ${tarRes.status}). Check the branch name or access permissions.`
    );
  }

  const arrayBuffer = await tarRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const extractedFiles = await extractMarkdownFromTarGzBuffer(buffer, subpath);

  const canonicalUrl = subpath
    ? `https://github.com/${owner}/${repo}/tree/${resolvedBranch}/${subpath}`
    : `https://github.com/${owner}/${repo}/tree/${resolvedBranch}`;

  return {
    owner,
    repo,
    branch: resolvedBranch,
    subpath,
    canonicalUrl,
    files: extractedFiles,
  };
}

export async function extractMarkdownFromTarGzBuffer(buffer, subpathFilter = '') {
  const cleanSubpath = normalizeRelPath(subpathFilter);
  const files = [];

  await new Promise((resolve, reject) => {
    const parser = new TarParser({
      onReadEntry(entry) {
        if (entry.type !== 'File') {
          entry.resume();
          return;
        }
        // Strip GitHub's top-level "<owner>-<repo>-<sha>/" archive prefix
        const rawPath = normalizeRelPath(entry.path);
        const slashIdx = rawPath.indexOf('/');
        const repoRelPath = slashIdx !== -1 ? rawPath.slice(slashIdx + 1) : rawPath;

        if (cleanSubpath) {
          const matchesDir = repoRelPath.startsWith(`${cleanSubpath}/`);
          const matchesExact = repoRelPath === cleanSubpath;
          if (!matchesDir && !matchesExact) {
            entry.resume();
            return;
          }
        }

        const scopedRelPath =
          cleanSubpath && repoRelPath.startsWith(`${cleanSubpath}/`)
            ? repoRelPath.slice(cleanSubpath.length + 1)
            : repoRelPath;

        if (!isMarkdownSkillCandidate(scopedRelPath)) {
          entry.resume();
          return;
        }

        const chunks = [];
        entry.on('data', (chunk) => chunks.push(chunk));
        entry.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf8');
          files.push({ path: scopedRelPath, content });
        });
      },
    });

    parser.on('end', resolve);
    parser.on('close', resolve);
    parser.on('error', reject);

    Readable.from(buffer).pipe(parser);
  });

  return files;
}

export async function extractMarkdownFromZipBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = [];

  const entries = Object.values(zip.files);
  for (const zipEntry of entries) {
    if (zipEntry.dir) continue;
    const relPath = normalizeRelPath(zipEntry.name);
    if (!isMarkdownSkillCandidate(relPath)) continue;
    const content = await zipEntry.async('string');
    files.push({ path: relPath, content });
  }

  return files;
}

export async function fetchDirectUrls(urls, token = '') {
  const files = [];
  for (const rawUrl of urls) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) continue;

    // Smart handling if URL points to GitHub blob, tree, or raw.githubusercontent.com
    if (
      /github\.com\//i.test(trimmed) ||
      /raw\.githubusercontent\.com\//i.test(trimmed)
    ) {
      const result = await fetchGitHubMarkdownFiles({ input: trimmed, token });
      for (const f of result.files) {
        files.push({
          ...f,
          sourceUrl: trimmed,
        });
      }
      continue;
    }

    const res = await fetch(trimmed, {
      headers: {
        'User-Agent': 'SkillVault-MCP/1.0',
        Accept: 'text/markdown, text/plain, */*',
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${trimmed} (HTTP ${res.status})`);
    }
    const content = await res.text();
    const parsedUrl = new URL(trimmed);
    let baseName = path.posix.basename(parsedUrl.pathname) || 'imported-skill.md';
    if (!/\.(md|mdx|mdc|markdown)$/i.test(baseName)) {
      baseName = `${baseName}.md`;
    }
    files.push({ path: baseName, content, sourceUrl: trimmed });
  }
  return files;
}
