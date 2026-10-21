import YAML from 'yaml';
import path from 'node:path';

const ALLOWED_EXTENSIONS = new Set(['.md', '.mdx', '.mdc', '.markdown']);
const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', '__MACOSX', '.next', 'dist', 'build', '.github']);
const BOILERPLATE_FILENAMES = new Set([
  'changelog.md',
  'contributing.md',
  'code_of_conduct.md',
  'security.md',
  'license.md',
  'pull_request_template.md',
]);

export function slugify(text) {
  const base = String(text || 'untitled-skill')
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'skill';
}

export function normalizeRelPath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();
}

export function isMarkdownSkillCandidate(relPath) {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return false;
  const parts = normalized.split('/');
  if (parts.some((seg) => IGNORED_SEGMENTS.has(seg) || (seg.startsWith('.') && seg !== '.cursor' && seg !== '.claude'))) {
    return false;
  }
  const ext = path.posix.extname(normalized).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

export function parseFrontmatter(rawContent) {
  const text = String(rawContent ?? '').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  let attributes = {};
  let body = text;

  if (match) {
    body = text.slice(match[0].length);
    try {
      const parsed = YAML.parse(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        attributes = parsed;
      }
    } catch {
      // Fallback simple key: value line parser for slightly non-strict frontmatter
      for (const line of match[1].split('\n')) {
        const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
        if (kv) {
          attributes[kv[1].trim()] = kv[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    }
  }

  return { attributes, body: body.trim(), raw: text };
}

export function extractHeadingAndSummary(body) {
  const lines = String(body || '').split('\n');
  let heading = '';
  const summaryLines = [];
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || !line) {
      if (summaryLines.length > 0 && !inCodeBlock) break;
      continue;
    }
    if (!heading && /^#{1,3}\s+/.test(line)) {
      heading = line.replace(/^#{1,3}\s+/, '').trim();
      continue;
    }
    if (/^#{1,6}\s+/.test(line) || line.startsWith('>') || line.startsWith('---')) {
      continue;
    }
    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim();
    if (cleaned) {
      summaryLines.push(cleaned);
      if (summaryLines.join(' ').length >= 160) break;
    }
  }

  const summary = summaryLines.join(' ').slice(0, 240).trim();
  return { heading, summary };
}

export function normalizeTags(rawTags) {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) {
    return [...new Set(rawTags.map((t) => slugify(t)).filter(Boolean))];
  }
  if (typeof rawTags === 'string') {
    return [...new Set(rawTags.split(/[,;]+/).map((t) => slugify(t)).filter(Boolean))];
  }
  return [];
}

function humanizeName(slugOrFile) {
  return String(slugOrFile || '')
    .replace(/\.(md|mdx|mdc|markdown)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function stripSharedTopFolder(entries) {
  if (entries.length === 0) return { entries, rootName: '' };
  const splitPaths = entries.map((e) => e.path.split('/'));
  if (splitPaths.every((p) => p.length > 1 && p[0] === splitPaths[0][0])) {
    const rootName = splitPaths[0][0];
    // Preserve folder name if there's a single SKILL.md directly inside that single folder
    const isSingleSkillDir =
      entries.some((e) => e.path.toLowerCase() === `${rootName.toLowerCase()}/skill.md`) &&
      !entries.some((e) => {
        const lower = e.path.toLowerCase();
        return lower !== `${rootName.toLowerCase()}/skill.md` && lower.endsWith('/skill.md');
      });
    if (isSingleSkillDir) {
      return { entries, rootName };
    }
    return {
      rootName,
      entries: entries.map((e) => ({
        ...e,
        path: e.path.slice(rootName.length + 1),
      })),
    };
  }
  return { entries, rootName: '' };
}

export function parseFilesIntoSkills(rawFiles, options = {}) {
  const { mode = 'smart', defaultCategory = '', source = { type: 'local', label: 'Local Upload' } } = options;

  const validEntries = [];
  for (const item of rawFiles || []) {
    const cleanPath = normalizeRelPath(item.path || item.relativePath || item.name);
    if (!isMarkdownSkillCandidate(cleanPath)) continue;
    validEntries.push({
      path: cleanPath,
      content: String(item.content ?? ''),
    });
  }

  if (validEntries.length === 0) return [];

  const { entries, rootName } = stripSharedTopFolder(validEntries);
  const skipBoilerplate = entries.length > 1;
  const results = [];
  const consumedPaths = new Set();

  if (mode === 'smart') {
    // 1. Identify directories containing SKILL.md (or skill.md), sorted deepest path first
    const skillEntryFiles = entries
      .filter((e) => path.posix.basename(e.path).toLowerCase() === 'skill.md')
      .sort((a, b) => b.path.split('/').length - a.path.split('/').length);

    for (const mainFile of skillEntryFiles) {
      const dir = path.posix.dirname(mainFile.path); // '.' if at root
      const prefix = dir === '.' ? '' : `${dir}/`;

      const siblingRefs = [];
      for (const candidate of entries) {
        if (consumedPaths.has(candidate.path)) continue;
        if (candidate.path === mainFile.path) {
          consumedPaths.add(candidate.path);
          continue;
        }
        if (prefix === '' || candidate.path.startsWith(prefix)) {
          const subRel = prefix === '' ? candidate.path : candidate.path.slice(prefix.length);
          siblingRefs.push({
            path: subRel,
            content: candidate.content,
          });
          consumedPaths.add(candidate.path);
        }
      }

      const dirSegments = dir === '.' ? [] : dir.split('/');
      const fallbackDirName = dirSegments[dirSegments.length - 1] || rootName || 'skill';
      const parentCategory =
        dirSegments.length > 1 ? dirSegments.slice(0, -1).filter((s) => s !== 'skills').join('/') : '';

      results.push(
        buildSkillRecord({
          rawContent: mainFile.content,
          fallbackName: humanizeName(fallbackDirName),
          fallbackSlug: slugify(fallbackDirName),
          inferredCategory: defaultCategory || parentCategory || 'general',
          originalPath: mainFile.path,
          references: siblingRefs,
          source,
        })
      );
    }
  }

  // 2. Remaining standalone markdown files become individual skills
  for (const file of entries) {
    if (consumedPaths.has(file.path)) continue;
    const baseLower = path.posix.basename(file.path).toLowerCase();
    if (skipBoilerplate && BOILERPLATE_FILENAMES.has(baseLower)) {
      continue;
    }
    // Skip repo-root README.md only when other actual skill files already exist in repo import
    if (
      skipBoilerplate &&
      file.path.toLowerCase() === 'readme.md' &&
      (results.length > 0 || entries.length > 2)
    ) {
      continue;
    }

    const dir = path.posix.dirname(file.path);
    const fileStem = path.posix.basename(file.path, path.posix.extname(file.path));
    const effectiveStem =
      fileStem.toLowerCase() === 'readme' || fileStem.toLowerCase() === 'index'
        ? dir !== '.'
          ? path.posix.basename(dir)
          : rootName || 'skill'
        : fileStem;

    const categoryDir =
      dir === '.'
        ? defaultCategory || (rootName ? slugify(rootName) : 'general')
        : defaultCategory || dir;

    results.push(
      buildSkillRecord({
        rawContent: file.content,
        fallbackName: humanizeName(effectiveStem),
        fallbackSlug: slugify(effectiveStem),
        inferredCategory: categoryDir,
        originalPath: file.path,
        references: [],
        source,
      })
    );
  }

  return results;
}

export function buildSkillRecord({
  rawContent,
  fallbackName,
  fallbackSlug,
  inferredCategory = 'general',
  originalPath = '',
  references = [],
  source = { type: 'manual', label: 'Manual' },
}) {
  const { attributes, body, raw } = parseFrontmatter(rawContent);
  const { heading, summary } = extractHeadingAndSummary(body);

  const name = String(attributes.name || attributes.title || heading || fallbackName || 'Untitled Skill').trim();
  const slug = slugify(
    attributes.slug || attributes.id || (attributes.name ? attributes.name : fallbackSlug) || name
  );
  const description = String(
    attributes.description || attributes.summary || summary || `Instructions and workflow for ${name}.`
  ).trim();
  const category = String(attributes.category || inferredCategory || 'general')
    .trim()
    .replace(/^\/+|\/+$/g, '') || 'general';

  const inferredTags = normalizeTags(attributes.tags || attributes.keywords);
  if (category && category !== 'general') {
    for (const part of category.split('/')) {
      const clean = slugify(part);
      if (clean && !inferredTags.includes(clean)) inferredTags.push(clean);
    }
  }

  return {
    name,
    slug,
    description,
    category,
    tags: inferredTags.slice(0, 12),
    version: String(attributes.version || '1.0.0'),
    originalPath,
    content: raw,
    body,
    references: Array.isArray(references) ? references : [],
    source,
    enabled: attributes.enabled !== false,
  };
}
