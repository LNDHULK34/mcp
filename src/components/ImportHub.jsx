import React, { useRef, useState } from 'react';
import {
  FolderOpen,
  GitBranch,
  FileArchive,
  Globe,
  UploadCloud,
  RefreshCw,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Eye,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { readDroppedItems, readFileList } from '../lib/folderReader';

const SOURCE_TABS = [
  { id: 'local', label: 'Local Folder / .md', icon: FolderOpen },
  { id: 'github', label: 'GitHub Repo Sync', icon: GitBranch },
  { id: 'zip', label: '.ZIP Archive', icon: FileArchive },
  { id: 'urls', label: 'Direct URLs', icon: Globe },
];

const GITHUB_EXAMPLES = [
  {
    label: 'anthropics/skills (frontend-design)',
    url: 'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
  },
  {
    label: 'anthropics/skills (mcp-builder)',
    url: 'https://github.com/anthropics/skills/tree/main/skills/mcp-builder',
  },
  {
    label: 'anthropics/skills (webapp-testing)',
    url: 'https://github.com/anthropics/skills/tree/main/skills/webapp-testing',
  },
];

export default function ImportHub({ sources = [], onImported, notify }) {
  const [activeTab, setActiveTab] = useState('local');

  // Shared parsing & conflict options
  const [parseMode, setParseMode] = useState('smart');
  const [conflictStrategy, setConflictStrategy] = useState('overwrite');
  const [defaultCategory, setDefaultCategory] = useState('');

  // Local folder state
  const [isDragging, setIsDragging] = useState(false);
  const [stagedLocalFiles, setStagedLocalFiles] = useState([]);
  const [localLabel, setLocalLabel] = useState('');
  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);

  // GitHub state
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [subpath, setSubpath] = useState('');
  const [ghToken, setGhToken] = useState('');
  const [syncingSourceId, setSyncingSourceId] = useState(null);

  // ZIP state
  const [zipFile, setZipFile] = useState(null);
  const zipInputRef = useRef(null);

  // Direct URLs state
  const [urlsText, setUrlsText] = useState('');

  // Preview & Busy status
  const [busy, setBusy] = useState(false);
  const [previewItems, setPreviewItems] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const resetMessages = () => {
    setErrorMsg('');
    setPreviewItems(null);
  };

  // --- LOCAL FOLDER HANDLERS ---
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    resetMessages();

    // Check if user dropped a single .zip file onto local dropzone -> smart switch!
    const rawFiles = Array.from(e.dataTransfer?.files || []);
    if (rawFiles.length === 1 && rawFiles[0].name.toLowerCase().endsWith('.zip')) {
      setZipFile(rawFiles[0]);
      setActiveTab('zip');
      notify?.(`Staged ZIP archive "${rawFiles[0].name}"`);
      return;
    }

    try {
      const { files, rootLabel } = await readDroppedItems(e.dataTransfer);
      if (files.length === 0) {
        setErrorMsg('No Markdown files (.md, .mdx, .mdc) found in dropped selection.');
        return;
      }
      setStagedLocalFiles(files);
      setLocalLabel(rootLabel || 'Dropped Folder');
    } catch (err) {
      setErrorMsg(`Failed reading dropped folder: ${err.message}`);
    }
  };

  const handleFileInputChange = async (e) => {
    resetMessages();
    try {
      const { files, rootLabel } = await readFileList(e.target.files);
      if (files.length === 0) {
        setErrorMsg('No Markdown files (.md, .mdx, .mdc) found in selected directory.');
        return;
      }
      setStagedLocalFiles(files);
      setLocalLabel(rootLabel || 'Local Folder');
    } catch (err) {
      setErrorMsg(err.message);
    }
    e.target.value = '';
  };

  const submitLocalImport = async (previewOnly = false) => {
    if (stagedLocalFiles.length === 0) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await api.importLocalFiles({
        files: stagedLocalFiles,
        mode: parseMode,
        defaultCategory,
        conflictStrategy,
        previewOnly,
        folderLabel: localLabel || 'Local Folder',
      });

      if (previewOnly) {
        setPreviewItems(res.detected || []);
      } else {
        notify?.(
          `Imported ${res.totalDetected} skill(s) (${res.createdCount} new, ${res.updatedCount} updated)`
        );
        setStagedLocalFiles([]);
        setPreviewItems(null);
        await onImported?.();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  // --- GITHUB IMPORT & SYNC HANDLERS ---
  const submitGitHubImport = async (previewOnly = false) => {
    if (!repoUrl.trim()) {
      setErrorMsg('Enter a GitHub repository URL or owner/repo shorthand.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await api.importGitHub({
        repoUrl: repoUrl.trim(),
        branch: branch.trim(),
        subpath: subpath.trim(),
        token: ghToken.trim(),
        mode: parseMode,
        defaultCategory,
        conflictStrategy,
        previewOnly,
      });

      if (previewOnly) {
        setPreviewItems(res.detected || []);
      } else {
        notify?.(
          `Synced ${res.totalDetected} skill(s) from GitHub (${res.createdCount} added, ${res.updatedCount} updated)`
        );
        setPreviewItems(null);
        await onImported?.();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncTrackedSource = async (sourceId) => {
    setSyncingSourceId(sourceId);
    setErrorMsg('');
    try {
      const res = await api.syncSource(sourceId);
      notify?.(
        `Synced ${res.totalDetected} skill(s) (${res.createdCount} added, ${res.updatedCount} updated)`
      );
      await onImported?.();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSyncingSourceId(null);
    }
  };

  const handleRemoveTrackedSource = async (sourceId) => {
    try {
      await api.deleteSource(sourceId);
      notify?.('Removed tracked GitHub sync source (imported skills remain in vault)');
      await onImported?.();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // --- ZIP IMPORT HANDLER ---
  const submitZipImport = async (previewOnly = false) => {
    if (!zipFile) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('archive', zipFile);
      fd.append('mode', parseMode);
      fd.append('defaultCategory', defaultCategory);
      fd.append('conflictStrategy', conflictStrategy);
      fd.append('previewOnly', String(previewOnly));

      const res = await api.importZip(fd);
      if (previewOnly) {
        setPreviewItems(res.detected || []);
      } else {
        notify?.(
          `Extracted ${res.totalDetected} skill(s) from ${zipFile.name}`
        );
        setZipFile(null);
        setPreviewItems(null);
        await onImported?.();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  // --- DIRECT URLS HANDLER ---
  const submitUrlsImport = async () => {
    if (!urlsText.trim()) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await api.importUrls({
        urls: urlsText,
        defaultCategory: defaultCategory || 'imported',
        conflictStrategy,
        token: ghToken.trim(),
      });
      notify?.(`Imported ${res.totalDetected} Markdown URL skill(s)`);
      setUrlsText('');
      await onImported?.();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-800/80 pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Import & Sync Markdown Skills
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload nested local Markdown folders, connect GitHub skill repositories with one-click re-sync, extract{' '}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">.zip</code> bundles, or fetch direct URLs.
        </p>
      </div>

      {/* Import Source Tabs */}
      <div className="flex flex-wrap gap-2">
        {SOURCE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                resetMessages();
              }}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition cursor-pointer ${
                active
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Shared Parsing Settings Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-4 sm:grid-cols-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Folder Parsing Mode
          </label>
          <select
            value={parseMode}
            onChange={(e) => {
              setParseMode(e.target.value);
              setPreviewItems(null);
            }}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="smart">Smart Auto-Detect (SKILL.md packages + standalone .md)</option>
            <option value="per-file">Treat Every .md File as Separate Skill</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Duplicate Slug Handling
          </label>
          <select
            value={conflictStrategy}
            onChange={(e) => setConflictStrategy(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="overwrite">Update / Overwrite Existing Skill</option>
            <option value="skip">Skip Existing Slugs</option>
            <option value="duplicate">Keep Both (Append Number)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Default Category Override (Optional)
          </label>
          <input
            type="text"
            value={defaultCategory}
            onChange={(e) => setDefaultCategory(e.target.value)}
            placeholder="Auto-inferred from folder path"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
          />
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: LOCAL FOLDER & MARKDOWN FILES */}
      {activeTab === 'local' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
              isDragging
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-zinc-800 bg-zinc-900/35 hover:border-zinc-700'
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400 mb-3">
              <UploadCloud className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Drag & Drop any Local Folder or Markdown Files here
            </h3>
            <p className="mt-1 max-w-md text-xs text-zinc-400">
              Preserves nested subdirectories, parses YAML frontmatter automatically, and bundles{' '}
              <code className="text-zinc-300">SKILL.md</code> folders with sibling reference files.
            </p>

            {/* Hidden Native Inputs */}
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
            <input
              ref={filesInputRef}
              type="file"
              accept=".md,.mdx,.mdc,.markdown"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 transition cursor-pointer"
              >
                <FolderOpen className="h-4 w-4" />
                <span>Choose Local Folder</span>
              </button>
              <button
                type="button"
                onClick={() => filesInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              >
                <span>Select .md Files</span>
              </button>
            </div>
          </div>

          {stagedLocalFiles.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-zinc-100">
                    Staged {stagedLocalFiles.length} Markdown file(s) from "{localLabel}"
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submitLocalImport(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview Skills
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submitLocalImport(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? 'Importing...' : `Import ${stagedLocalFiles.length} File(s)`}
                  </button>
                </div>
              </div>

              <div className="max-h-36 overflow-y-auto rounded-lg bg-zinc-950 border border-zinc-800/80 p-2.5 font-mono text-[11px] text-zinc-400 space-y-1">
                {stagedLocalFiles.map((f) => (
                  <div key={f.path} className="truncate">
                    {f.path}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GITHUB REPOSITORY & SUBFOLDER SYNC */}
      {activeTab === 'github' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-200 mb-1.5">
                GitHub Repository URL, Tree Subfolder, or <code className="text-emerald-400">owner/repo</code>
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/anthropics/skills/tree/main/skills  or  owner/my-skills-repo"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
              />

              {/* One-click quick test pills */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 inline-flex items-center gap-1 mr-1">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  Try real GitHub examples:
                </span>
                {GITHUB_EXAMPLES.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    onClick={() => setRepoUrl(ex.url)}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300 transition cursor-pointer"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Branch (Optional)
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="Auto-detect default branch"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Subfolder Path Filter (Optional)
                </label>
                <input
                  type="text"
                  value={subpath}
                  onChange={(e) => setSubpath(e.target.value)}
                  placeholder="e.g. skills or .claude/commands"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Personal Access Token (Private Repos)
                </label>
                <input
                  type="password"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder="Optional ghp_... token"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => submitGitHubImport(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Preview Detected Skills</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => submitGitHubImport(false)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
              >
                <GitBranch className="h-4 w-4" />
                <span>{busy ? 'Fetching Repository...' : 'Import & Track GitHub Source'}</span>
              </button>
            </div>
          </div>

          {/* Saved / Tracked GitHub Repositories for One-Click Sync */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Tracked GitHub Sources ({sources.length})
            </h3>
            {sources.length === 0 ? (
              <p className="rounded-xl border border-zinc-800/70 bg-zinc-900/25 px-4 py-4 text-xs text-zinc-500">
                No GitHub repositories tracked yet. Imported GitHub repos appear here so you can pull upstream changes anytime in one click.
              </p>
            ) : (
              <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-sky-400 shrink-0" />
                        <span className="font-mono text-xs font-semibold text-zinc-100">
                          {src.owner}/{src.repo}
                          {src.subpath ? `/${src.subpath}` : ''}
                        </span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                          @{src.branch || 'main'}
                        </span>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-500 hover:text-zinc-200"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {src.skillCount} skill(s) · Last synced{' '}
                        {new Date(src.lastSyncedAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={syncingSourceId === src.id}
                        onClick={() => handleSyncTrackedSource(src.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            syncingSourceId === src.id ? 'animate-spin text-emerald-400' : ''
                          }`}
                        />
                        <span>{syncingSourceId === src.id ? 'Syncing...' : 'Sync Now'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveTrackedSource(src.id)}
                        title="Stop tracking repository"
                        className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:border-red-900 hover:text-red-300 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ZIP ARCHIVE UPLOAD */}
      {activeTab === 'zip' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-6 space-y-4">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 p-8 text-center">
            <FileArchive className="h-9 w-9 text-purple-400 mb-3" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Upload a .ZIP Skill Bundle or Obsidian / Notion Markdown Export
            </h3>
            <p className="mt-1 max-w-md text-xs text-zinc-400">
              All nested <code className="text-zinc-300">.md</code>, <code className="text-zinc-300">.mdx</code>, and{' '}
              <code className="text-zinc-300">SKILL.md</code> files are automatically unpacked and indexed.
            </p>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                setZipFile(e.target.files?.[0] || null);
                resetMessages();
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => zipInputRef.current?.click()}
              className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-800 cursor-pointer"
            >
              {zipFile ? `Selected: ${zipFile.name}` : 'Select .ZIP File'}
            </button>
          </div>

          {zipFile && (
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => submitZipImport(true)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                Preview Skills
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => submitZipImport(false)}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'Extracting...' : 'Extract & Import Skills'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DIRECT MARKDOWN URLS */}
      {activeTab === 'urls' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-200 mb-1.5">
              Markdown URLs (One URL per line)
            </label>
            <textarea
              rows={5}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder={`https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md\nhttps://raw.githubusercontent.com/owner/repo/main/prompts/review.md`}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy || !urlsText.trim()}
              onClick={submitUrlsImport}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Fetching URLs...' : 'Fetch & Import URLs'}
            </button>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW TABLE OF DETECTED SKILLS */}
      {previewItems && (
        <div className="rounded-xl border border-emerald-500/30 bg-zinc-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-emerald-300">
              Preview: Detected {previewItems.length} Skill Package(s)
            </h3>
            <button
              type="button"
              onClick={() => setPreviewItems(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800/80 rounded-lg border border-zinc-800 bg-zinc-950">
            {previewItems.map((item, idx) => (
              <div key={`${item.slug}-${idx}`} className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-100">{item.name}</span>
                    <span className="font-mono text-[11px] text-emerald-400">skill://{item.slug}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate max-w-xl">{item.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  <span className="rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-zinc-300">
                    {item.category}
                  </span>
                  {item.references?.length > 0 && (
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                      +{item.references.length} refs
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
