#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveProfile } from './store.js';
import { createMcpServerInstance } from './mcpServer.js';

function parseArgs(argv) {
  let profileSlug = process.env.SKILLVAULT_PROFILE || 'all';
  let apiKey = process.env.SKILLVAULT_API_KEY || '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--profile' || arg === '-p') && argv[i + 1]) {
      profileSlug = argv[++i];
    } else if (arg.startsWith('--profile=')) {
      profileSlug = arg.split('=')[1];
    } else if ((arg === '--api-key' || arg === '-k') && argv[i + 1]) {
      apiKey = argv[++i];
    } else if (arg.startsWith('--api-key=')) {
      apiKey = arg.split('=')[1];
    }
  }
  return { profileSlug, apiKey };
}

async function main() {
  const { profileSlug, apiKey } = parseArgs(process.argv.slice(2));
  const resolved = resolveProfile({ profileSlug, apiKey });

  if (!resolved.ok) {
    process.stderr.write(`[skillvault-mcp] ${resolved.error}\n`);
    process.exit(1);
  }

  const server = createMcpServerInstance({
    profile: resolved.profile,
    transportName: 'stdio',
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[skillvault-mcp] Running on stdio | Profile: "${resolved.profile.name}" (${resolved.profile.slug})\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[skillvault-mcp] Fatal stdio error: ${err.stack || err.message}\n`);
  process.exit(1);
});
