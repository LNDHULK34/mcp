import express from 'express';
import http from 'node:http';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServerInstance } from './mcpServer.js';
import { resolveProfile, loadState } from './store.js';
import { createApiRouter } from './apiRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function extractAuthFromReq(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.headers['x-api-key']) {
    return String(req.headers['x-api-key']).trim();
  }
  if (req.query.apiKey) {
    return String(req.query.apiKey).trim();
  }
  return '';
}

export async function createAppServer({
  isDev = process.env.NODE_ENV !== 'production',
  httpServer = null,
} = {}) {
  // Initialize vault seed data immediately on startup
  loadState();

  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: ['Mcp-Session-Id', 'mcp-session-id'],
    })
  );

  // Parse large JSON bodies for multi-file local folder uploads & JSON-RPC requests
  // Skip JSON body parsing on /messages so SSEServerTransport can read raw body if needed
  const jsonParser = express.json({ limit: '50mb' });
  app.use((req, res, next) => {
    if (req.path === '/messages') return next();
    return jsonParser(req, res, next);
  });

  // Health probe
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'skillvault-mcp' });
  });

  // =========================================================================
  // 1. STREAMABLE HTTP MCP ENDPOINTS (/mcp and /mcp/:profileSlug)
  // =========================================================================
  const handleStreamableMcp = async (req, res) => {
    // Ensure Accept header includes both json and event-stream so curl / simple HTTP callers succeed effortlessly
    const currentAccept = String(req.headers.accept || '');
    if (!currentAccept.includes('application/json') || !currentAccept.includes('text/event-stream')) {
      req.headers.accept = 'application/json, text/event-stream';
    }

    const profileSlug = req.params.profileSlug || req.query.profile || 'all';
    const apiKey = extractAuthFromReq(req);
    const resolved = resolveProfile({ profileSlug, apiKey });

    if (!resolved.ok) {
      return res.status(resolved.status || 401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: resolved.error },
        id: null,
      });
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      // Stateless Streamable HTTP mode does not maintain server push streams on standalone GET/DELETE
      return res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'SkillVault MCP runs stateless Streamable HTTP on POST /mcp (or connect via GET /sse for legacy SSE).',
        },
        id: null,
      });
    }

    const mcpServer = createMcpServerInstance({
      profile: resolved.profile,
      transportName: 'http',
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      mcpServer.close().catch(() => {});
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp-http] Error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: err.message },
          id: null,
        });
      }
    }
  };

  app.all('/mcp', handleStreamableMcp);
  app.all('/mcp/:profileSlug', handleStreamableMcp);

  // =========================================================================
  // 2. LEGACY SSE MCP ENDPOINTS (GET /sse, GET /sse/:profileSlug, POST /messages)
  // =========================================================================
  const sseTransports = new Map();

  const handleSseConnect = async (req, res) => {
    const profileSlug = req.params.profileSlug || req.query.profile || 'all';
    const apiKey = extractAuthFromReq(req);
    const resolved = resolveProfile({ profileSlug, apiKey });

    if (!resolved.ok) {
      return res.status(resolved.status || 401).json({ error: resolved.error });
    }

    const mcpServer = createMcpServerInstance({
      profile: resolved.profile,
      transportName: 'sse',
    });

    const transport = new SSEServerTransport('/messages', res);
    sseTransports.set(transport.sessionId, { transport, mcpServer });

    res.on('close', () => {
      sseTransports.delete(transport.sessionId);
      mcpServer.close().catch(() => {});
    });

    await mcpServer.connect(transport);
  };

  app.get('/sse', handleSseConnect);
  app.get('/sse/:profileSlug', handleSseConnect);

  app.post('/messages', async (req, res) => {
    const sessionId = String(req.query.sessionId || '');
    const active = sseTransports.get(sessionId);
    if (!active) {
      return res.status(400).json({ error: `Unknown or expired SSE sessionId "${sessionId}".` });
    }
    await active.transport.handlePostMessage(req, res);
  });

  // =========================================================================
  // 3. REST API FOR WEB DASHBOARD
  // =========================================================================
  app.use('/api', createApiRouter());

  // =========================================================================
  // 4. FRONTEND: VITE DEV MIDDLEWARE OR PRODUCTION STATIC BUILD
  // =========================================================================
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: ROOT_DIR,
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: httpServer ? { server: httpServer } : true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('{*splat}', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}

// Run directly when executed as main entry
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  const isDev = process.env.NODE_ENV !== 'production';
  const httpServer = http.createServer();

  createAppServer({ isDev, httpServer })
    .then((app) => {
      httpServer.on('request', app);
      httpServer.listen(PORT, HOST, () => {
        console.log(`
┌──────────────────────────────────────────────────────────────┐
│  SkillVault MCP Studio is live!                              │
│  Web UI        : http://${HOST}:${PORT}                            │
│  MCP HTTP      : http://${HOST}:${PORT}/mcp                        │
│  MCP SSE       : http://${HOST}:${PORT}/sse                        │
│  MCP Stdio CLI : npm run mcp:stdio                           │
└──────────────────────────────────────────────────────────────┘
`);
      });
    })
    .catch((err) => {
      console.error('Failed to start SkillVault MCP server:', err);
      process.exit(1);
    });
}
