import React, { useEffect, useState } from 'react';
import { Play, RefreshCw, Activity, Terminal } from 'lucide-react';
import { api } from '../lib/api';

const ACTIONS = [
  { id: 'list_skills', label: 'Tool: list_skills', rpcMethod: 'tools/call' },
  { id: 'search_skills', label: 'Tool: search_skills', rpcMethod: 'tools/call' },
  { id: 'get_skill', label: 'Tool: get_skill', rpcMethod: 'tools/call' },
  { id: 'tools_list', label: 'Protocol: tools/list', rpcMethod: 'tools/list' },
  { id: 'prompts_list', label: 'Protocol: prompts/list (Slash Commands)', rpcMethod: 'prompts/list' },
  { id: 'prompts_get', label: 'Protocol: prompts/get', rpcMethod: 'prompts/get' },
  { id: 'resources_list', label: 'Protocol: resources/list (skill://)', rpcMethod: 'resources/list' },
  { id: 'resources_read', label: 'Protocol: resources/read', rpcMethod: 'resources/read' },
];

export default function McpPlayground({
  profiles = [],
  skills = [],
  initialSkillSlug = '',
  activity = [],
  onRefreshActivity,
}) {
  const [selectedProfileSlug, setSelectedProfileSlug] = useState('all');
  const [actionId, setActionId] = useState(initialSkillSlug ? 'get_skill' : 'list_skills');
  const [slugArg, setSlugArg] = useState(
    initialSkillSlug || skills[0]?.slug || 'modern-react-ui-architecture'
  );
  const [queryArg, setQueryArg] = useState('react');
  const [categoryArg, setCategoryArg] = useState('');
  const [taskArg, setTaskArg] = useState('Build a responsive settings panel');
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [outputView, setOutputView] = useState('formatted'); // 'formatted' | 'wire'

  useEffect(() => {
    if (initialSkillSlug) {
      setSlugArg(initialSkillSlug);
      setActionId('get_skill');
    }
  }, [initialSkillSlug]);

  const activeProfile =
    profiles.find((p) => p.slug === selectedProfileSlug) || profiles[0] || {};

  const runMcpCall = async () => {
    setRunning(true);
    try {
      let method = 'tools/list';
      let params = {};

      if (actionId === 'list_skills') {
        method = 'tools/call';
        params = {
          name: 'list_skills',
          arguments: { ...(categoryArg ? { category: categoryArg } : {}) },
        };
      } else if (actionId === 'search_skills') {
        method = 'tools/call';
        params = {
          name: 'search_skills',
          arguments: { query: queryArg },
        };
      } else if (actionId === 'get_skill') {
        method = 'tools/call';
        params = {
          name: 'get_skill',
          arguments: { slug: slugArg, includeReferences: true },
        };
      } else if (actionId === 'prompts_list') {
        method = 'prompts/list';
      } else if (actionId === 'prompts_get') {
        method = 'prompts/get';
        params = {
          name: `skill-${slugArg}`,
          arguments: { task: taskArg },
        };
      } else if (actionId === 'resources_list') {
        method = 'resources/list';
      } else if (actionId === 'resources_read') {
        method = 'resources/read';
        params = { uri: `skill://${slugArg}` };
      }

      const res = await api.callMcpJsonRpc({
        profileSlug: selectedProfileSlug,
        apiKey: activeProfile.requireApiKey ? activeProfile.apiKey : '',
        method,
        params,
      });

      setLastResult(res);
      await onRefreshActivity?.();
    } catch (err) {
      setLastResult({
        status: 500,
        elapsedMs: 0,
        request: {},
        response: { error: { message: err.message } },
      });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runMcpCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSkillSlug]);

  const renderFormattedResult = () => {
    if (!lastResult) return null;
    const rpcRes = lastResult.response;
    if (rpcRes?.error) {
      return (
        <pre className="text-red-300 font-mono text-xs whitespace-pre-wrap">
          {JSON.stringify(rpcRes.error, null, 2)}
        </pre>
      );
    }
    const resultObj = rpcRes?.result;
    if (resultObj?.content?.[0]?.text) {
      return (
        <pre className="font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
          {resultObj.content[0].text}
        </pre>
      );
    }
    if (resultObj?.messages?.[0]?.content?.text) {
      return (
        <pre className="font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
          {resultObj.messages[0].content.text}
        </pre>
      );
    }
    if (resultObj?.contents?.[0]?.text) {
      return (
        <pre className="font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
          {resultObj.contents[0].text}
        </pre>
      );
    }
    return (
      <pre className="font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
        {JSON.stringify(resultObj, null, 2)}
      </pre>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-800/80 pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Live MCP Protocol Inspector
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Send real JSON-RPC 2.0 requests to your running <code className="text-emerald-400">/mcp</code> server and monitor incoming calls from connected AI agents.
        </p>
      </div>

      {/* Interactive Request Builder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900/45 p-5 space-y-4 h-fit">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Target Agent Profile Endpoint
            </label>
            <select
              value={selectedProfileSlug}
              onChange={(e) => setSelectedProfileSlug(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name} (/mcp{p.slug === 'all' ? '' : `/${p.slug}`})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              MCP Operation
            </label>
            <select
              value={actionId}
              onChange={(e) => setActionId(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
            >
              {ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Contextual Arguments */}
          {actionId === 'list_skills' && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Category Filter (Optional)
              </label>
              <input
                type="text"
                value={categoryArg}
                onChange={(e) => setCategoryArg(e.target.value)}
                placeholder="e.g. frontend"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200"
              />
            </div>
          )}

          {actionId === 'search_skills' && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Search Query
              </label>
              <input
                type="text"
                value={queryArg}
                onChange={(e) => setQueryArg(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200"
              />
            </div>
          )}

          {(actionId === 'get_skill' ||
            actionId === 'prompts_get' ||
            actionId === 'resources_read') && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Select Skill Slug
              </label>
              <select
                value={slugArg}
                onChange={(e) => setSlugArg(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200"
              >
                {skills.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.slug} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionId === 'prompts_get' && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Optional User Task Argument
              </label>
              <input
                type="text"
                value={taskArg}
                onChange={(e) => setTaskArg(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200"
              />
            </div>
          )}

          <button
            type="button"
            disabled={running}
            onClick={runMcpCall}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>{running ? 'Executing JSON-RPC...' : 'Send Live MCP Request'}</span>
          </button>
        </div>

        {/* Response Viewer */}
        <div className="lg:col-span-7 flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 min-h-[380px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <span className="font-medium text-zinc-200">MCP Server Response</span>
              {lastResult && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  HTTP {lastResult.status} · {lastResult.elapsedMs}ms
                </span>
              )}
            </div>

            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setOutputView('formatted')}
                className={`rounded-md px-2.5 py-1 cursor-pointer ${
                  outputView === 'formatted' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'
                }`}
              >
                Agent Payload
              </button>
              <button
                type="button"
                onClick={() => setOutputView('wire')}
                className={`rounded-md px-2.5 py-1 cursor-pointer ${
                  outputView === 'wire' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'
                }`}
              >
                JSON-RPC Wire
              </button>
            </div>
          </div>

          <div className="flex-1 max-h-[430px] overflow-y-auto p-4">
            {outputView === 'formatted' ? (
              renderFormattedResult()
            ) : (
              <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap">
                {JSON.stringify(
                  { request: lastResult?.request, response: lastResult?.response },
                  null,
                  2
                )}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Live Server Request Telemetry */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            Recent MCP Server Activity ({activity.length})
          </h2>
          <button
            type="button"
            onClick={onRefreshActivity}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/35 divide-y divide-zinc-800/80 max-h-64 overflow-y-auto">
          {activity.length === 0 ? (
            <p className="p-4 text-xs text-zinc-500">
              No MCP requests logged yet. Connect an AI agent or click "Send Live MCP Request" above.
            </p>
          ) : (
            activity.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-emerald-300">
                    {ev.transport}
                  </span>
                  <span className="font-mono font-medium text-zinc-200">{ev.method}</span>
                  <span className="text-zinc-400">{ev.detail}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500">
                  <span>profile:{ev.profile}</span>
                  <span>{ev.durationMs}ms</span>
                  <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
