import React, { useMemo, useState } from 'react';
import {
  Plus,
  Copy,
  Check,
  KeyRound,
  RefreshCw,
  Trash2,
  ShieldCheck,
  Download,
  Edit3,
} from 'lucide-react';
import { api, getPublicMcpOrigin } from '../lib/api';

const CLIENT_TABS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'windsurf', label: 'Windsurf' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'generic', label: 'Cline / HTTP / SSE' },
];

export default function ConnectAgents({
  profiles = [],
  skills = [],
  serverInfo,
  onProfilesChanged,
  notify,
}) {
  const [selectedProfileId, setSelectedProfileId] = useState('default');
  const [clientTab, setClientTab] = useState('claude-code');
  const [copiedBlock, setCopiedBlock] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  // Profile form state
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formMode, setFormMode] = useState('categories');
  const [formCategories, setFormCategories] = useState([]);
  const [formTags, setFormTags] = useState([]);
  const [formSkillIds, setFormSkillIds] = useState([]);
  const [formRequireKey, setFormRequireKey] = useState(false);
  const [formAllowWrite, setFormAllowWrite] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) || profiles[0] || {},
    [profiles, selectedProfileId]
  );

  const allCategories = useMemo(
    () => [...new Set(skills.map((s) => s.category || 'general'))].sort(),
    [skills]
  );

  const allTags = useMemo(
    () => [...new Set(skills.flatMap((s) => s.tags || []))].sort(),
    [skills]
  );

  const openCreateForm = () => {
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setFormMode('categories');
    setFormCategories([]);
    setFormTags([]);
    setFormSkillIds([]);
    setFormRequireKey(false);
    setFormAllowWrite(false);
    setShowEditor(true);
  };

  const openEditForm = (p) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormDesc(p.description || '');
    setFormMode(p.filterMode || 'all');
    setFormCategories(p.categories || []);
    setFormTags(p.tags || []);
    setFormSkillIds(p.skillIds || []);
    setFormRequireKey(Boolean(p.requireApiKey));
    setFormAllowWrite(p.allowWrite !== false);
    setShowEditor(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await api.saveProfile({
        id: editingId || undefined,
        name: formName,
        description: formDesc,
        filterMode: formMode,
        categories: formCategories,
        tags: formTags,
        skillIds: formSkillIds,
        requireApiKey: formRequireKey,
        allowWrite: formAllowWrite,
      });
      setSelectedProfileId(res.profile.id);
      setShowEditor(false);
      notify?.(`Saved profile "${res.profile.name}"`);
      await onProfilesChanged?.();
    } catch (err) {
      notify?.(err.message);
    }
  };

  const handleRotateKey = async (profileId) => {
    const res = await api.rotateProfileKey(profileId);
    notify?.(`Generated new API key for "${res.profile.name}"`);
    await onProfilesChanged?.();
  };

  const handleDeleteProfile = async (profileId) => {
    await api.deleteProfile(profileId);
    setSelectedProfileId('default');
    notify?.('Deleted agent profile');
    await onProfilesChanged?.();
  };

  const toggleItem = (list, setList, value) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  // Compute live endpoints for selected profile
  const origin = getPublicMcpOrigin();
  const profilePathSuffix =
    selectedProfile.slug && selectedProfile.slug !== 'all' ? `/${selectedProfile.slug}` : '';
  const httpMcpUrl = `${origin}/mcp${profilePathSuffix}`;
  const sseMcpUrl = `${origin}/sse${profilePathSuffix}`;
  const stdioScript = serverInfo?.stdioScriptPath || '/path/to/mcp/server/stdio.js';
  const serverKeyName =
    selectedProfile.slug && selectedProfile.slug !== 'all'
      ? `skillvault-${selectedProfile.slug}`
      : 'skillvault';

  const authHeadersObj =
    selectedProfile.requireApiKey && selectedProfile.apiKey
      ? { Authorization: `Bearer ${selectedProfile.apiKey}` }
      : undefined;

  const snippets = useMemo(() => {
    const stdioArgs = [stdioScript];
    if (selectedProfile.slug && selectedProfile.slug !== 'all') {
      stdioArgs.push('--profile', selectedProfile.slug);
    }
    if (selectedProfile.requireApiKey && selectedProfile.apiKey) {
      stdioArgs.push('--api-key', selectedProfile.apiKey);
    }

    if (clientTab === 'claude-code') {
      const headerFlag = authHeadersObj
        ? ` \\\n  --header "Authorization: Bearer ${selectedProfile.apiKey}"`
        : '';
      return [
        {
          title: 'Option A — Streamable HTTP (Works Remotely & Locally)',
          code: `claude mcp add --transport http ${serverKeyName} "${httpMcpUrl}"${headerFlag}`,
        },
        {
          title: 'Option B — Local Stdio Process (Zero Network Port Needed)',
          code: `claude mcp add ${serverKeyName} -- node ${stdioArgs.map((a) => `"${a}"`).join(' ')}`,
        },
      ];
    }

    if (clientTab === 'cursor') {
      const remoteEntry = {
        url: httpMcpUrl,
        ...(authHeadersObj ? { headers: authHeadersObj } : {}),
      };
      const stdioEntry = {
        command: 'node',
        args: stdioArgs,
      };
      return [
        {
          title: 'Option A — .cursor/mcp.json (Streamable HTTP URL)',
          code: JSON.stringify({ mcpServers: { [serverKeyName]: remoteEntry } }, null, 2),
        },
        {
          title: 'Option B — .cursor/mcp.json (Local Stdio CLI)',
          code: JSON.stringify({ mcpServers: { [serverKeyName]: stdioEntry } }, null, 2),
        },
      ];
    }

    if (clientTab === 'claude-desktop') {
      return [
        {
          title: 'claude_desktop_config.json (Local Stdio)',
          code: JSON.stringify(
            {
              mcpServers: {
                [serverKeyName]: {
                  command: 'node',
                  args: stdioArgs,
                },
              },
            },
            null,
            2
          ),
        },
      ];
    }

    if (clientTab === 'windsurf') {
      return [
        {
          title: '~/.codeium/windsurf/mcp_config.json',
          code: JSON.stringify(
            {
              mcpServers: {
                [serverKeyName]: {
                  serverUrl: httpMcpUrl,
                  ...(authHeadersObj ? { headers: authHeadersObj } : {}),
                },
              },
            },
            null,
            2
          ),
        },
      ];
    }

    if (clientTab === 'vscode') {
      return [
        {
          title: '.vscode/mcp.json (GitHub Copilot Agent Mode)',
          code: JSON.stringify(
            {
              servers: {
                [serverKeyName]: {
                  type: 'http',
                  url: httpMcpUrl,
                  ...(authHeadersObj ? { headers: authHeadersObj } : {}),
                },
              },
            },
            null,
            2
          ),
        },
      ];
    }

    // Generic HTTP / Legacy SSE / cURL
    const curlAuth = authHeadersObj ? ` \\\n  -H "Authorization: Bearer ${selectedProfile.apiKey}"` : '';
    return [
      {
        title: 'Streamable HTTP Endpoint (MCP 2025-03-26+ Standard)',
        code: httpMcpUrl,
      },
      {
        title: 'Legacy SSE Endpoint (Cline / Roo Code / Older Clients)',
        code: sseMcpUrl,
      },
      {
        title: 'Quick Verify via cURL (Lists All Active Skills over JSON-RPC)',
        code: `curl -s -X POST "${httpMcpUrl}" \\\n  -H "Content-Type: application/json"${curlAuth} \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_skills","arguments":{}}}'`,
      },
    ];
  }, [clientTab, httpMcpUrl, sseMcpUrl, stdioScript, serverKeyName, selectedProfile, authHeadersObj]);

  const copySnippet = async (key, text) => {
    await navigator.clipboard.writeText(text);
    setCopiedBlock(key);
    notify?.('Copied configuration snippet to clipboard');
    setTimeout(() => setCopiedBlock(''), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Connect AI Agents & Scoped Profiles
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Share your entire skill vault through one universal MCP URL, or create scoped profiles with optional API keys per agent.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Agent Profile</span>
        </button>
      </div>

      {/* Create / Edit Profile Drawer Box */}
      {showEditor && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-emerald-500/35 bg-zinc-900/70 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">
              {editingId ? 'Edit Agent Profile' : 'Create Scoped Agent Profile'}
            </h3>
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Profile Name
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Frontend Cursor Agent"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Skill Filter Scope
              </label>
              <select
                value={formMode}
                onChange={(e) => setFormMode(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100"
              >
                <option value="all">All Enabled Skills</option>
                <option value="categories">Filter by Categories</option>
                <option value="tags">Filter by Tags</option>
                <option value="manual">Hand-Pick Individual Skills</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Purpose of this agent profile"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100"
              />
            </div>
          </div>

          {formMode === 'categories' && (
            <div>
              <span className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Select Categories Included:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleItem(formCategories, setFormCategories, cat)}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs cursor-pointer ${
                      formCategories.includes(cat)
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formMode === 'tags' && (
            <div>
              <span className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Select Tags Included:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleItem(formTags, setFormTags, tag)}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs cursor-pointer ${
                      formTags.includes(tag)
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formMode === 'manual' && (
            <div>
              <span className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Hand-Pick Skills ({formSkillIds.length} chosen):
              </span>
              <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                {skills.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formSkillIds.includes(s.id)}
                      onChange={() => toggleItem(formSkillIds, setFormSkillIds, s.id)}
                      className="accent-emerald-500"
                    />
                    <span className="truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-800">
            <div className="flex flex-wrap items-center gap-5 text-xs text-zinc-300">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formRequireKey}
                  onChange={(e) => setFormRequireKey(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span>Require Bearer API Key</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formAllowWrite}
                  onChange={(e) => setFormAllowWrite(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span>Allow Agent to Save New Skills (`save_skill`)</span>
              </label>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
            >
              Save Profile
            </button>
          </div>
        </form>
      )}

      {/* Main Two-Column Connect Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Profiles List */}
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            1. Select Profile Scope
          </h2>

          <div className="space-y-2.5">
            {profiles.map((p) => {
              const isSelected = p.id === selectedProfile.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProfileId(p.id)}
                  className={`rounded-xl border p-4 transition cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500/60 bg-zinc-900/90'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">{p.name}</span>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                          {p.skillCount ?? 0} skills
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        {p.description || `Endpoint path: /mcp${p.slug === 'all' ? '' : `/${p.slug}`}`}
                      </p>
                    </div>

                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => openEditForm(p)}
                        title="Edit profile scope & permissions"
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={`/api/export/zip?profileSlug=${p.slug}`}
                        title="Download this profile's skills as .zip"
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      {!p.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(p.id)}
                          title="Delete profile"
                          className="rounded p-1.5 text-zinc-400 hover:bg-red-950/60 hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Security & API Key Row */}
                  <div
                    className="mt-3 pt-2.5 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 text-zinc-400">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>
                        {p.requireApiKey ? 'API Key Protected' : 'Open Access'} ·{' '}
                        {p.allowWrite !== false ? 'Read/Write' : 'Read-Only'}
                      </span>
                    </div>

                    {p.requireApiKey && p.apiKey && (
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[10px] text-amber-300">
                          {p.apiKey.slice(0, 12)}...
                        </code>
                        <button
                          type="button"
                          onClick={() => handleRotateKey(p.id)}
                          title="Rotate API key"
                          className="rounded border border-zinc-800 p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Client Config Snippets */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            2. Copy Configuration for Your AI Agent
          </h2>

          {/* Agent Client Picker */}
          <div className="flex flex-wrap gap-1.5">
            {CLIENT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setClientTab(t.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  clientTab === t.id
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Generated Code Blocks */}
          <div className="space-y-4">
            {snippets.map((item, idx) => {
              const blockKey = `${clientTab}-${idx}`;
              return (
                <div
                  key={blockKey}
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
                    <span className="text-xs font-medium text-zinc-200">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => copySnippet(blockKey, item.code)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                    >
                      {copiedBlock === blockKey ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-zinc-200">
                    {item.code}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
