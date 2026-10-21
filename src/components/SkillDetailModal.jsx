import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import {
  X,
  Save,
  Trash2,
  Copy,
  Check,
  FileText,
  Plus,
  Eye,
  Code2,
  Download,
} from 'lucide-react';

const STARTER_TEMPLATE = `---
name: Custom Workflow Skill
description: Concise summary explaining when an AI agent should invoke this skill.
category: workflows
tags:
  - automation
  - best-practices
---

# Custom Workflow Skill

Provide clear, step-by-step instructions, guardrails, and output formatting rules here.

## When to Use

- Describe the trigger conditions or tasks this skill covers.

## Instructions

1. Step one...
2. Step two...
3. Verification step...
`;

export default function SkillDetailModal({
  skill,
  isNew = false,
  onClose,
  onSave,
  onDelete,
  notify,
}) {
  const [mode, setMode] = useState(isNew ? 'split' : 'preview'); // 'preview' | 'edit' | 'split'
  const [name, setName] = useState(skill?.name || 'Custom Workflow Skill');
  const [slug, setSlug] = useState(skill?.slug || '');
  const [category, setCategory] = useState(skill?.category || 'workflows');
  const [description, setDescription] = useState(skill?.description || '');
  const [tagsInput, setTagsInput] = useState((skill?.tags || []).join(', '));
  const [enabled, setEnabled] = useState(skill?.enabled !== false);
  const [content, setContent] = useState(skill?.content || STARTER_TEMPLATE);
  const [references, setReferences] = useState(skill?.references || []);
  const [activeFileIdx, setActiveFileIdx] = useState(-1); // -1 means primary SKILL.md
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const activeText =
    activeFileIdx === -1 ? content : references[activeFileIdx]?.content || '';

  const renderedHtml = useMemo(() => {
    const cleanMd = String(activeText || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
    return marked.parse(cleanMd, { async: false });
  }, [activeText]);

  const handleActiveTextChange = (val) => {
    if (activeFileIdx === -1) {
      setContent(val);
    } else {
      setReferences((prev) =>
        prev.map((ref, idx) => (idx === activeFileIdx ? { ...ref, content: val } : ref))
      );
    }
  };

  const handleAddReference = () => {
    const index = references.length + 1;
    const newRef = {
      path: `references/guide-${index}.md`,
      content: `# Reference Guide ${index}\n\nSupporting notes or code examples for this skill.\n`,
    };
    setReferences((prev) => [...prev, newRef]);
    setActiveFileIdx(references.length);
    if (mode === 'preview') setMode('split');
  };

  const handleRemoveReference = (idx) => {
    setReferences((prev) => prev.filter((_, i) => i !== idx));
    setActiveFileIdx(-1);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        id: skill?.id,
        name,
        slug: slug || undefined,
        category,
        description,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        enabled,
        content,
        references,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeText);
    setCopied(true);
    notify?.('Copied Markdown content to clipboard');
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([activeText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      activeFileIdx === -1
        ? `${slug || 'SKILL'}.md`
        : references[activeFileIdx]?.path.split('/').pop() || 'reference.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6 backdrop-blur-xs">
      <form
        onSubmit={handleSave}
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5 bg-zinc-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-zinc-100">
                {isNew ? 'Author New Skill' : name}
              </h2>
              <p className="truncate font-mono text-[11px] text-zinc-400">
                {isNew ? 'Saved directly into your live MCP server' : `skill://${skill.slug}`}
              </p>
            </div>
          </div>

          {/* Mode Switcher + Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  mode === 'preview' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                type="button"
                onClick={() => setMode('split')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  mode === 'split' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                Split Editor
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              title="Copy Markdown"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Copy</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMd}
              title="Download .md file"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
            </button>

            {!isNew && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(skill.id)}
                title="Delete skill"
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/50 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/70 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving...' : isNew ? 'Create Skill' : 'Save Changes'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Metadata Strip */}
        <div className="grid grid-cols-1 gap-3 border-b border-zinc-800/80 bg-zinc-900/25 px-5 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">Skill Title</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">Category / Folder</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. frontend, backend, devops"
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="react, testing, api"
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">Short Agent Summary</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When should an AI agent load this skill?"
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
        </div>

        {/* File Tabs inside this Skill Package (SKILL.md + Supporting Reference Files) */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-800 bg-zinc-950 px-5 py-2">
          <button
            type="button"
            onClick={() => setActiveFileIdx(-1)}
            className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition cursor-pointer ${
              activeFileIdx === -1
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'
            }`}
          >
            SKILL.md
          </button>

          {references.map((ref, idx) => (
            <div
              key={`${ref.path}-${idx}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs ${
                activeFileIdx === idx
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'text-zinc-400 hover:bg-zinc-900 border-transparent'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveFileIdx(idx)}
                className="cursor-pointer"
              >
                {ref.path}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveReference(idx)}
                title="Remove reference file"
                className="text-zinc-500 hover:text-red-400 cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddReference}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-emerald-300 transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Reference .md</span>
          </button>
        </div>

        {/* Main Workspace: Split Raw Editor & Rendered Markdown Preview */}
        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
          {mode === 'split' && (
            <div className="flex flex-col min-h-0 bg-zinc-950">
              {activeFileIdx !== -1 && (
                <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2 bg-zinc-900/40">
                  <span className="text-[11px] text-zinc-400">Reference Path:</span>
                  <input
                    type="text"
                    value={references[activeFileIdx]?.path || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReferences((prev) =>
                        prev.map((r, i) => (i === activeFileIdx ? { ...r, path: val } : r))
                      );
                    }}
                    className="flex-1 rounded bg-zinc-950 border border-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-200"
                  />
                </div>
              )}
              <textarea
                value={activeText}
                onChange={(e) => handleActiveTextChange(e.target.value)}
                spellCheck={false}
                placeholder="Write Markdown instructions here..."
                className="flex-1 w-full resize-none bg-zinc-950 p-5 font-mono text-xs leading-relaxed text-zinc-200 focus:outline-none"
              />
            </div>
          )}

          <div
            className={`overflow-y-auto p-6 bg-zinc-950/60 ${
              mode === 'preview' ? 'lg:col-span-2 max-w-4xl mx-auto w-full' : ''
            }`}
          >
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
