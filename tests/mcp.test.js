import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'skillvault-test-'));
process.env.SKILLVAULT_DATA_DIR = tmpVault;

const { createAppServer } = await import('../server/index.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let httpServer;
let baseUrl;

test.before(async () => {
  const app = await createAppServer({ isDev: false });
  await new Promise((resolve) => {
    httpServer = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  fs.rmSync(tmpVault, { recursive: true, force: true });
});

test('1. Local nested folder upload parses SKILL.md package + standalone .md files cleanly', async () => {
  const res = await fetch(`${baseUrl}/api/import/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'smart',
      folderLabel: 'my-local-skills',
      files: [
        {
          path: 'my-skills/docker-hardening/SKILL.md',
          content: `---\nname: Docker Container Hardening\ndescription: Production security checklist for Dockerfiles.\ncategory: security\ntags: [docker, containers]\n---\n\n# Docker Hardening\n\nAlways run non-root users in containers.`,
        },
        {
          path: 'my-skills/docker-hardening/references/dockerfile-example.md',
          content: '# Example Dockerfile\n\n```dockerfile\nUSER node\n```',
        },
        {
          path: 'my-skills/database/postgres-indexing.md',
          content: '# Postgres Indexing Rules\n\nAlways inspect `EXPLAIN ANALYZE` before adding composite indexes.',
        },
      ],
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.totalDetected, 2);
});

test('2. Official MCP Streamable HTTP client connects and calls tools, prompts, and resources', async () => {
  const client = new Client({ name: 'integration-agent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await client.connect(transport);

  // List tools
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === 'list_skills'));
  assert.ok(tools.some((t) => t.name === 'search_skills'));
  assert.ok(tools.some((t) => t.name === 'get_skill'));
  assert.ok(tools.some((t) => t.name === 'save_skill'));

  // Search uploaded Docker skill
  const searchRes = await client.callTool({
    name: 'search_skills',
    arguments: { query: 'docker' },
  });
  const parsedSearch = JSON.parse(searchRes.content[0].text);
  assert.equal(parsedSearch.results[0].slug, 'docker-container-hardening');
  assert.equal(parsedSearch.results[0].referenceFilesCount, 1);

  // Read full skill with bundled reference doc
  const getRes = await client.callTool({
    name: 'get_skill',
    arguments: { slug: 'docker-container-hardening' },
  });
  assert.match(getRes.content[0].text, /Always run non-root users/);
  assert.match(getRes.content[0].text, /references\/dockerfile-example\.md/);

  // Save a brand-new skill from an AI agent via MCP
  await client.callTool({
    name: 'save_skill',
    arguments: {
      name: 'Agent Learned Skill',
      category: 'automation',
      content: '# Agent Skill\n\nReusable steps saved directly via MCP.',
    },
  });

  // Verify slash prompts & skill:// resources immediately reflect saved skill
  const { prompts } = await client.listPrompts();
  assert.ok(prompts.some((p) => p.name === 'skill-agent-learned-skill'));

  const { resources } = await client.listResources();
  assert.ok(resources.some((r) => r.uri === 'skill://agent-learned-skill'));

  await client.close();
});

test('3. Scoped Agent Profile enforces category filter and optional Bearer API key', async () => {
  const createProf = await fetch(`${baseUrl}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Security Only Agent',
      filterMode: 'categories',
      categories: ['security'],
      requireApiKey: true,
      allowWrite: false,
    }),
  });
  const { profile } = await createProf.json();
  assert.ok(profile.apiKey.startsWith('skv_'));

  // Without API key -> 401
  const unauthRes = await fetch(`${baseUrl}/mcp/${profile.slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  assert.equal(unauthRes.status, 401);

  // With valid Bearer API key -> only sees 'security' skill and no write tool
  const authRes = await fetch(`${baseUrl}/mcp/${profile.slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_skills', arguments: {} },
    }),
  });
  assert.equal(authRes.status, 200);
  const rpcJson = await authRes.json();
  const listData = JSON.parse(rpcJson.result.content[0].text);
  assert.equal(listData.total, 1);
  assert.equal(listData.skills[0].slug, 'docker-container-hardening');
});

test('4. ZIP export and re-import round-trip works end-to-end', async () => {
  const zipRes = await fetch(`${baseUrl}/api/export/zip`);
  assert.equal(zipRes.status, 200);
  const zipBuf = await zipRes.arrayBuffer();

  const fd = new FormData();
  fd.append('archive', new Blob([zipBuf], { type: 'application/zip' }), 'backup.zip');
  fd.append('previewOnly', 'true');

  const reimportRes = await fetch(`${baseUrl}/api/import/zip`, {
    method: 'POST',
    body: fd,
  });
  const preview = await reimportRes.json();
  assert.equal(reimportRes.status, 200);
  assert.ok(preview.detected.length >= 6);
});

test('5. MCP Stdio CLI server connects over StdioClientTransport', async () => {
  const stdioClient = new Client({ name: 'stdio-agent', version: '1.0.0' });
  const stdioTransport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(__dirname, '..', 'server', 'stdio.js')],
    env: {
      ...process.env,
      SKILLVAULT_DATA_DIR: tmpVault,
    },
  });

  await stdioClient.connect(stdioTransport);
  const { tools } = await stdioClient.listTools();
  assert.ok(tools.some((t) => t.name === 'get_skill'));
  await stdioClient.close();
});

test('6. Live GitHub repository subfolder import fetches real skill from github.com', async () => {
  const ghRes = await fetch(`${baseUrl}/api/import/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repoUrl: 'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
      previewOnly: true,
    }),
  });
  const ghData = await ghRes.json();
  assert.equal(ghRes.status, 200);
  assert.equal(ghData.preview, true);
  assert.ok(ghData.detected.length >= 1);
});
