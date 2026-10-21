import React, { useState } from 'react';
import {
  BookOpen,
  UploadCloud,
  Share2,
  Terminal,
  Download,
  Copy,
  Check,
  Layers,
  Menu,
  X,
} from 'lucide-react';
import { getPublicMcpOrigin } from '../lib/api';

const NAV_ITEMS = [
  { id: 'library', label: 'Skills Library', icon: BookOpen, badgeKey: 'totalSkills' },
  { id: 'import', label: 'Import & Sync', icon: UploadCloud, badgeKey: 'sourcesCount' },
  { id: 'connect', label: 'Connect Agents', icon: Share2, badgeKey: 'profilesCount' },
  { id: 'playground', label: 'MCP Inspector', icon: Terminal, badgeKey: null },
];

export default function Sidebar({ activeTab, onSelectTab, serverInfo, onNewSkill }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const origin = getPublicMcpOrigin();
  const mcpUrl = `${origin}/mcp`;
  const stats = serverInfo?.stats || {};

  const copyMcpEndpoint = async () => {
    await navigator.clipboard.writeText(mcpUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between bg-zinc-950 border-r border-zinc-800/80 px-3.5 py-4 select-none">
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 py-1.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold tracking-tight text-zinc-100">
                  SkillVault
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
                  MCP
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">Universal Skill Hub</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Author Skill Button */}
        <button
          type="button"
          onClick={() => {
            onNewSkill();
            setMobileOpen(false);
          }}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 shadow-sm transition hover:bg-emerald-400 cursor-pointer"
        >
          <span>+ Create Markdown Skill</span>
        </button>

        {/* Primary Navigation */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const count = item.badgeKey ? stats[item.badgeKey] : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  setMobileOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition cursor-pointer ${
                  active
                    ? 'bg-zinc-900 text-zinc-100 border border-zinc-800'
                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 ${active ? 'text-emerald-400' : 'text-zinc-500'}`}
                  />
                  <span>{item.label}</span>
                </span>
                {typeof count === 'number' && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] ${
                      active
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-zinc-900 text-zinc-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Live MCP Endpoint Card + ZIP Export */}
      <div className="space-y-2.5 pt-4 border-t border-zinc-900">
        <div className="rounded-lg border border-zinc-800/90 bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              MCP Server Active
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {stats.enabledSkills ?? 0} active
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            <code className="flex-1 truncate rounded bg-zinc-950 border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
              {mcpUrl}
            </code>
            <button
              type="button"
              onClick={copyMcpEndpoint}
              title="Copy MCP Streamable HTTP URL"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-white transition cursor-pointer"
            >
              {copiedUrl ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        <a
          href="/api/export/zip"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white transition"
        >
          <Download className="h-3.5 w-3.5 text-zinc-400" />
          <span>Export All Skills (.zip)</span>
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Layers className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-zinc-100">SkillVault MCP</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-300"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {navContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
