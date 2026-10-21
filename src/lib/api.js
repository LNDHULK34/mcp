async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json()
    : { message: await res.text() };

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }

  return data;
}

export const api = {
  getServerInfo: () => request('/api/server-info'),

  // Skills
  getSkills: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/skills${suffix}`);
  },
  getSkill: (id) => request(`/api/skills/${encodeURIComponent(id)}`),
  createSkill: (payload) =>
    request('/api/skills', { method: 'POST', body: JSON.stringify(payload) }),
  updateSkill: (id, payload) =>
    request(`/api/skills/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSkill: (id) =>
    request(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  batchSkills: (action, ids) =>
    request('/api/skills/batch-action', {
      method: 'POST',
      body: JSON.stringify({ action, ids }),
    }),

  // Importers
  importLocalFiles: (payload) =>
    request('/api/import/local', { method: 'POST', body: JSON.stringify(payload) }),
  importZip: (formData) =>
    request('/api/import/zip', { method: 'POST', body: formData }),
  importGitHub: (payload) =>
    request('/api/import/github', { method: 'POST', body: JSON.stringify(payload) }),
  importUrls: (payload) =>
    request('/api/import/urls', { method: 'POST', body: JSON.stringify(payload) }),

  // GitHub Sync Sources
  getSources: () => request('/api/sources'),
  syncSource: (id) =>
    request(`/api/sources/${encodeURIComponent(id)}/sync`, { method: 'POST' }),
  deleteSource: (id) =>
    request(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Agent Profiles
  getProfiles: () => request('/api/profiles'),
  saveProfile: (payload) =>
    request('/api/profiles', { method: 'POST', body: JSON.stringify(payload) }),
  rotateProfileKey: (id) =>
    request(`/api/profiles/${encodeURIComponent(id)}/rotate-key`, { method: 'POST' }),
  deleteProfile: (id) =>
    request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Activity Log
  getActivity: (limit = 40) => request(`/api/activity?limit=${limit}`),

  // Live MCP JSON-RPC 2.0 call directly against /mcp or /mcp/:profileSlug
  callMcpJsonRpc: async ({ profileSlug = 'all', apiKey = '', method, params = {} }) => {
    const endpoint = profileSlug && profileSlug !== 'all' ? `/mcp/${profileSlug}` : '/mcp';
    const rpcPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const started = performance.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcPayload),
    });
    const elapsedMs = Math.round(performance.now() - started);
    const json = await res.json();

    return {
      status: res.status,
      elapsedMs,
      request: rpcPayload,
      response: json,
    };
  },
};

export function getPublicMcpOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}
