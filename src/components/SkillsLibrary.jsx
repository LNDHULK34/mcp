import React, { useMemo, useState } from 'react';
import {
  Search,
  FolderOpen,
  GitBranch,
  FileArchive,
  Globe,
  Sparkles,
  UploadCloud,
  Copy,
  Check,
  FileText,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Terminal,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';

function SourceBadge({ source }) {
  const type = source?.type || 'manual';
  const map = {
    github: { icon: GitBranch, text: source?.label || 'GitHub', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
    local: { icon: FolderOpen, text: source?.label || 'Local Folder', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
    zip: { icon: FileArchive, text: source?.label || 'ZIP Bundle', cls: 'text-purple-300 bg-purple-500/10 border-purple-500/20' },
    url: { icon: Globe, text: 'Direct URL', cls: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' },
    agent: { icon: Terminal, text: 'MCP Agent', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
    seed: { icon: Sparkles, text: 'Starter', cls: 'text-zinc-300 bg-zinc-800 border-zinc-700' },
  };
  const cfg = map[type] || { icon: FileText, text: source?.label || 'Editor', cls: 'text-zinc-300 bg-zinc-800 border-zinc-700' };
  const Icon = cfg.icon;

  return (
    <span
      title={cfg.text}
      className={`inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{cfg.text}</span>
    </span>
  );
}

export default function SkillsLibrary({
  skills,
  loading,
  onOpenSkill,
  onToggleSkill,
  onBatchAction,
  onNavigateImport,
  onTestSkillInMcp,
  notify,
}) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid');
  const [copiedId, setCopiedId] = useState(null);

  const categories = useMemo(() => {
    const counts = new Map();
    for (const s of skills) {
      const cat = s.category || 'general';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (selectedCategory !== 'all' && (s.category || 'general') !== selectedCategory) {
        return false;
      }
      if (selectedSource !== 'all' && (s.source?.type || 'manual') !== selectedSource) {
        return false;
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (s.content || '').toLowerCase().includes(q)
      );
    });
  }, [skills, query, selectedCategory, selectedSource]);

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (selectedIds.size === filteredSkills.length && filteredSkills.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSkills.map((s) => s.id)));
    }
  };

  const handleCopyPrompt = async (e, skill) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(skill.content || '');
    setCopiedId(skill.id);
    notify?.(`Copied "${skill.name}" Markdown to clipboard`);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const runBatch = async (action) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await onBatchAction(action, ids);
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Skills Library
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Every enabled skill is automatically exposed as MCP Tools, Slash Prompts, and{' '}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-emerald-400">
              skill://
            </code>{' '}
            Resources.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onNavigateImport}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-100 hover:border-emerald-500/50 hover:bg-zinc-800 transition cursor-pointer"
          >
            <UploadCloud className="h-4 w-4 text-emerald-400" />
            <span>Import Folder / GitHub</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills by name, slug, tag, category, or Markdown content..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="all">All Categories ({skills.length})</option>
            {categories.map(([cat, count]) => (
              <option key={cat} value={cat}>
                {cat} ({count})
              </option>
            ))}
          </select>

          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            aria-label="Filter by import source"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="all">All Sources</option>
            <option value="local">Local Folder</option>
            <option value="github">GitHub Sync</option>
            <option value="zip">ZIP Archive</option>
            <option value="url">Direct URL</option>
            <option value="manual">Web Editor</option>
            <option value="agent">MCP Agent</option>
            <option value="seed">Starter Skills</option>
          </select>

          <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={`rounded-md p-1.5 transition cursor-pointer ${
                viewMode === 'grid' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={`rounded-md p-1.5 transition cursor-pointer ${
                viewMode === 'list' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Batch Selection Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filteredSkills.length > 0 && selectedIds.size === filteredSkills.length}
              onChange={toggleSelectAllVisible}
              className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-emerald-500"
            />
            <span>
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `Showing ${filteredSkills.length} of ${skills.length} skill(s)`}
            </span>
          </label>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runBatch('enable')}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5 text-emerald-400" />
              Enable
            </button>
            <button
              type="button"
              onClick={() => runBatch('disable')}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
              Disable
            </button>
            <a
              href={`/api/export/zip?ids=${Array.from(selectedIds).join(',')}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-200 hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5 text-sky-400" />
              Export .zip
            </a>
            <button
              type="button"
              onClick={() => runBatch('delete')}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-900/50 bg-red-950/40 px-2.5 py-1 text-red-300 hover:bg-red-950/80 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Loading / Empty / Skill Cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-48 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5"
            />
          ))}
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-16 px-4 text-center">
          <FolderOpen className="h-9 w-9 text-zinc-600 mb-3" />
          <h3 className="text-sm font-medium text-zinc-200">No matching skills found</h3>
          <p className="mt-1 max-w-md text-xs text-zinc-400">
            Upload a local folder of Markdown files, sync a GitHub repository, or create a skill from scratch.
          </p>
          <button
            type="button"
            onClick={onNavigateImport}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 transition cursor-pointer"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Import Skills Now</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSkills.map((skill) => {
            const isSelected = selectedIds.has(skill.id);
            const refCount = (skill.references || []).length;

            return (
              <div
                key={skill.id}
                onClick={() => onOpenSkill(skill)}
                className={`group relative flex flex-col justify-between rounded-xl border p-4 transition cursor-pointer ${
                  isSelected
                    ? 'border-emerald-500/60 bg-zinc-900/90'
                    : skill.enabled !== false
                    ? 'border-zinc-800/90 bg-zinc-900/45 hover:border-zinc-700 hover:bg-zinc-900/80'
                    : 'border-zinc-900 bg-zinc-950/60 opacity-65 hover:opacity-90'
                }`}
              >
                <div>
                  {/* Card Top Row */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div
                      className="flex items-start gap-2.5 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(skill.id)}
                        aria-label={`Select ${skill.name}`}
                        className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-zinc-700 bg-zinc-900 accent-emerald-500 cursor-pointer"
                      />
                      <div className="min-w-0" onClick={() => onOpenSkill(skill)}>
                        <h3 className="truncate text-sm font-semibold text-zinc-100 group-hover:text-emerald-300 transition">
                          {skill.name}
                        </h3>
                        <p className="truncate font-mono text-[11px] text-zinc-500">
                          skill://{skill.slug}
                        </p>
                      </div>
                    </div>

                    {/* Enabled switch */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSkill(skill.id, !skill.enabled);
                      }}
                      title={
                        skill.enabled !== false
                          ? 'Exposed to MCP agents (click to disable)'
                          : 'Hidden from MCP agents (click to enable)'
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition cursor-pointer ${
                        skill.enabled !== false ? 'bg-emerald-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-zinc-950 transition ${
                          skill.enabled !== false ? 'translate-x-4.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Category & Source Badges */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-zinc-800/90 border border-zinc-700/70 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                      {skill.category || 'general'}
                    </span>
                    <SourceBadge source={skill.source} />
                    {refCount > 0 && (
                      <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                        +{refCount} ref{refCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                    {skill.description || 'No description provided.'}
                  </p>
                </div>

                {/* Footer Tags + Quick Actions */}
                <div className="mt-4 pt-3 border-t border-zinc-800/70 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1 overflow-hidden max-h-5">
                    {(skill.tags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-800/80"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleCopyPrompt(e, skill)}
                      title="Copy raw SKILL.md content"
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition cursor-pointer"
                    >
                      {copiedId === skill.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onTestSkillInMcp(skill)}
                      title="Test loading this skill via MCP Inspector"
                      className="rounded px-2 py-1 font-mono text-[11px] text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                    >
                      MCP
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              onClick={() => onOpenSkill(skill)}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-900/90 transition cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(skill.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelectOne(skill.id)}
                  className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-emerald-500"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-zinc-100 truncate">
                      {skill.name}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 hidden sm:inline">
                      skill://{skill.slug}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate max-w-2xl">
                    {skill.description}
                  </p>
                </div>
              </div>

              <div
                className="flex items-center gap-2.5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="hidden md:inline-block rounded bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {skill.category}
                </span>
                <SourceBadge source={skill.source} />
                <button
                  type="button"
                  onClick={() => onToggleSkill(skill.id, !skill.enabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition cursor-pointer ${
                    skill.enabled !== false ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-zinc-950 transition ${
                      skill.enabled !== false ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
