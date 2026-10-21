# SkillVault MCP

**SkillVault MCP** is a JavaScript full-stack **Model Context Protocol (MCP) Skill Hub & Web Studio** that collects all your reusable Markdown (`SKILL.md`, `.md`, `.mdx`, `.mdc`) skills in one place and shares them across **every AI agent** (Claude Code, Cursor, Claude Desktop, Windsurf, VS Code Copilot, Cline, and any HTTP/SSE/Stdio MCP client).

---

## Features

### 1. Multi-Source Skill Importing & Syncing
- **Local Folder & Markdown Drag-and-Drop**: Drop nested local directories directly into the browser (preserves folder hierarchy, parses YAML frontmatter, and automatically bundles `SKILL.md` directories alongside sibling `references/*.md` files).
- **GitHub Repository & Subfolder Sync**: Import any public or private GitHub repo, branch, subfolder (`https://github.com/owner/repo/tree/main/skills/...`), or single file — and re-sync upstream updates anytime in one click.
- **`.ZIP` Archive Upload & Export**: Import or export entire skill libraries (or individual agent profiles) as clean `<slug>/SKILL.md` `.zip` archives.
- **Direct URLs & Split Live Editor**: Fetch raw Markdown URLs or author/edit skills live with a split Markdown + frontmatter editor and reference file tabs.

### 2. Universal MCP Server (Tools + Prompts + Resources)
Every enabled skill is automatically exposed across **all three native MCP primitives** with zero server restarts required:
- **MCP Tools**:
  - `list_skills` — Discover active skills by category or tag
  - `search_skills` — Ranked keyword search across titles, tags, descriptions, and Markdown bodies
  - `get_skill` — Load complete Markdown instructions + bundled reference documents
  - `get_skill_bundle` — Load multiple skills or an entire category at once
  - `save_skill` — Let AI agents save newly learned workflows directly back into SkillVault
- **MCP Slash Prompts**: `apply-skill` + dynamic `skill-<slug>` slash commands
- **MCP Resources**: `skill://catalog/index` + `skill://<slug>` Markdown resources

### 3. Hybrid Transports & Scoped Agent Profiles
- **Streamable HTTP**: `POST /mcp` (default all active skills) or `POST /mcp/<profile-slug>`
- **Legacy SSE**: `GET /sse` & `GET /sse/<profile-slug>` + `POST /messages`
- **Local Stdio CLI**: `npm run mcp:stdio -- --profile <profile-slug>`
- **Scoped Profiles & Optional Bearer API Keys**: Create per-agent profiles filtered by Categories, Tags, or Hand-Picked Skills, with optional `Bearer skv_...` authentication and read/write permissions.

---

## Quick Start

```bash
# Install dependencies
npm install

# Run full-stack development server (Web UI + MCP HTTP/SSE on port 3000)
npm run dev

# Run integration test suite (HTTP MCP + Stdio MCP + Local/ZIP/GitHub importers)
npm test

# Build & start production server
npm run build
npm start
```

### Connect via Local Stdio CLI

```json
{
  "mcpServers": {
    "skillvault": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/server/stdio.js"]
    }
  }
}
```

### Connect via Streamable HTTP (Claude Code example)

```bash
claude mcp add --transport http skillvault "http://localhost:3000/mcp"
```
