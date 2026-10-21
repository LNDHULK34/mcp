import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listSkills,
  searchSkills,
  getSkillByIdOrSlug,
  upsertManySkills,
  recordMcpActivity,
} from './store.js';
import { buildSkillRecord } from './parser.js';

function formatSkillFullMarkdown(skill, includeReferences = true) {
  const sections = [
    `# Skill: ${skill.name}`,
    `- **Slug**: \`${skill.slug}\``,
    `- **Category**: \`${skill.category}\``,
    skill.tags?.length ? `- **Tags**: ${skill.tags.map((t) => `\`${t}\``).join(', ')}` : null,
    skill.description ? `- **Summary**: ${skill.description}` : null,
    '',
    '---',
    '',
    skill.body || skill.content || '',
  ].filter((line) => line !== null);

  if (includeReferences && Array.isArray(skill.references) && skill.references.length > 0) {
    sections.push('', '---', '', '## Supporting Reference Documents');
    for (const ref of skill.references) {
      sections.push('', `### File: \`${ref.path}\``, '', ref.content || '');
    }
  }

  return sections.join('\n');
}

export function createMcpServerInstance({ profile, transportName = 'http' } = {}) {
  const activeProfile = profile || {
    slug: 'all',
    name: 'All Active Skills',
    filterMode: 'all',
    allowWrite: true,
  };

  const server = new Server(
    {
      name: `skillvault-mcp (${activeProfile.slug})`,
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
      instructions:
        'SkillVault MCP provides curated reusable engineering & workflow skills authored in Markdown. Call `list_skills` or `search_skills` to discover relevant skills for the user task, then call `get_skill` to read the complete instructions before executing.',
    }
  );

  // 1. TOOLS LIST
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const start = Date.now();
    const tools = [
      {
        name: 'list_skills',
        description:
          'List all available reusable Markdown skills in this SkillVault profile, with optional category or tag filtering. Call this first to see available capabilities.',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Optional category folder filter (e.g., "frontend", "backend", "devops").',
            },
            tag: {
              type: 'string',
              description: 'Optional tag filter (e.g., "react", "testing").',
            },
          },
        },
      },
      {
        name: 'search_skills',
        description:
          'Search across all skills by keywords, topic, framework, or problem domain. Returns ranked matching skills with slugs and summaries.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search keywords (e.g., "react state", "debugging", "api design").',
            },
            category: {
              type: 'string',
              description: 'Optional category filter.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of matching skills to return (default 10).',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_skill',
        description:
          'Load the complete Markdown instructions (and optional reference files) for a specific skill by its slug or name.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Exact slug or title of the skill (from list_skills or search_skills).',
            },
            includeReferences: {
              type: 'boolean',
              description: 'Include supporting reference files bundled in the skill folder (default: true).',
            },
          },
          required: ['slug'],
        },
      },
      {
        name: 'get_skill_bundle',
        description:
          'Load multiple skills at once by an array of slugs or an entire category name.',
        inputSchema: {
          type: 'object',
          properties: {
            slugs: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of skill slugs to load together.',
            },
            category: {
              type: 'string',
              description: 'Load all enabled skills belonging to this category.',
            },
          },
        },
      },
    ];

    if (activeProfile.allowWrite !== false) {
      tools.push({
        name: 'save_skill',
        description:
          'Create a new reusable Markdown skill or update an existing one in SkillVault so all connected AI agents can use it.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Human-readable skill title.',
            },
            slug: {
              type: 'string',
              description: 'Optional kebab-case slug identifier.',
            },
            description: {
              type: 'string',
              description: 'Concise summary of when and why an agent should apply this skill.',
            },
            category: {
              type: 'string',
              description: 'Skill folder/category (e.g., "frontend", "backend", "workflows").',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional search tags.',
            },
            content: {
              type: 'string',
              description: 'Full Markdown body containing instructions, rules, checklists, and examples.',
            },
          },
          required: ['name', 'content'],
        },
      });
    }

    recordMcpActivity({
      transport: transportName,
      profile: activeProfile.slug,
      method: 'tools/list',
      detail: `Returned ${tools.length} MCP tools`,
      durationMs: Date.now() - start,
    });

    return { tools };
  });

  // 2. TOOL EXECUTION
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const start = Date.now();
    const { name, arguments: args = {} } = request.params;

    try {
      if (name === 'list_skills') {
        const skills = listSkills({
          profile: activeProfile,
          category: args.category || '',
          tag: args.tag || '',
          includeDisabled: false,
        });

        const payload = {
          profile: activeProfile.slug,
          total: skills.length,
          skills: skills.map((s) => ({
            slug: s.slug,
            name: s.name,
            category: s.category,
            tags: s.tags,
            description: s.description,
            referenceFilesCount: (s.references || []).length,
          })),
        };

        recordMcpActivity({
          transport: transportName,
          profile: activeProfile.slug,
          method: 'tools/call:list_skills',
          detail: `Listed ${skills.length} skill(s)`,
          durationMs: Date.now() - start,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      }

      if (name === 'search_skills') {
        const matches = searchSkills(args.query || '', {
          profile: activeProfile,
          category: args.category || '',
          limit: Math.min(Math.max(Number(args.limit) || 10, 1), 50),
        });

        const payload = {
          query: args.query,
          count: matches.length,
          results: matches.map((s) => ({
            slug: s.slug,
            name: s.name,
            category: s.category,
            tags: s.tags,
            description: s.description,
            referenceFilesCount: (s.references || []).length,
          })),
        };

        recordMcpActivity({
          transport: transportName,
          profile: activeProfile.slug,
          method: 'tools/call:search_skills',
          detail: `Query "${args.query}" -> ${matches.length} match(es)`,
          durationMs: Date.now() - start,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      }

      if (name === 'get_skill') {
        const skill = getSkillByIdOrSlug(args.slug, {
          profile: activeProfile,
          recordUsage: true,
        });

        if (!skill) {
          const allAvailable = listSkills({ profile: activeProfile, includeDisabled: false }).map(
            (s) => s.slug
          );
          recordMcpActivity({
            transport: transportName,
            profile: activeProfile.slug,
            method: 'tools/call:get_skill',
            detail: `Not found: "${args.slug}"`,
            durationMs: Date.now() - start,
            status: 'error',
          });
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Skill "${args.slug}" was not found in profile "${activeProfile.slug}". Available slugs: ${
                  allAvailable.join(', ') || '(none)'
                }`,
              },
            ],
          };
        }

        const includeRefs = args.includeReferences !== false;
        recordMcpActivity({
          transport: transportName,
          profile: activeProfile.slug,
          method: 'tools/call:get_skill',
          detail: `Loaded skill "${skill.slug}"`,
          durationMs: Date.now() - start,
        });

        return {
          content: [{ type: 'text', text: formatSkillFullMarkdown(skill, includeRefs) }],
        };
      }

      if (name === 'get_skill_bundle') {
        let selected = [];
        if (Array.isArray(args.slugs) && args.slugs.length > 0) {
          selected = args.slugs
            .map((slug) => getSkillByIdOrSlug(slug, { profile: activeProfile, recordUsage: true }))
            .filter(Boolean);
        } else if (args.category) {
          selected = listSkills({
            profile: activeProfile,
            category: args.category,
            includeDisabled: false,
          });
        }

        recordMcpActivity({
          transport: transportName,
          profile: activeProfile.slug,
          method: 'tools/call:get_skill_bundle',
          detail: `Bundled ${selected.length} skill(s)`,
          durationMs: Date.now() - start,
        });

        if (selected.length === 0) {
          return {
            content: [{ type: 'text', text: 'No matching enabled skills found for the requested bundle.' }],
          };
        }

        const combined = selected
          .map((s) => formatSkillFullMarkdown(s, true))
          .join('\n\n========================================\n\n');

        return {
          content: [{ type: 'text', text: combined }],
        };
      }

      if (name === 'save_skill') {
        if (activeProfile.allowWrite === false) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Profile "${activeProfile.name}" is read-only. Enable write access in Connect Agents to let agents save skills.`,
              },
            ],
          };
        }

        const frontmatterHeader = [
          '---',
          `name: ${JSON.stringify(args.name)}`,
          args.description ? `description: ${JSON.stringify(args.description)}` : null,
          args.category ? `category: ${JSON.stringify(args.category)}` : null,
          Array.isArray(args.tags) && args.tags.length > 0 ? `tags: ${JSON.stringify(args.tags)}` : null,
          '---',
          '',
        ]
          .filter((l) => l !== null)
          .join('\n');

        const rawDoc = String(args.content || '').trimStart().startsWith('---')
          ? String(args.content)
          : `${frontmatterHeader}${args.content}`;

        const parsed = buildSkillRecord({
          rawContent: rawDoc,
          fallbackName: args.name,
          fallbackSlug: args.slug || args.name,
          inferredCategory: args.category || 'agent-authored',
          source: { type: 'agent', label: `Saved via MCP (${activeProfile.slug})` },
        });

        const result = upsertManySkills([parsed], { conflictStrategy: 'overwrite' });
        const saved = result.created[0] || result.updated[0];

        recordMcpActivity({
          transport: transportName,
          profile: activeProfile.slug,
          method: 'tools/call:save_skill',
          detail: `Saved skill "${saved.slug}"`,
          durationMs: Date.now() - start,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: result.created.length > 0 ? 'created' : 'updated',
                  slug: saved.slug,
                  name: saved.name,
                  category: saved.category,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown MCP tool: "${name}"` }],
      };
    } catch (err) {
      recordMcpActivity({
        transport: transportName,
        profile: activeProfile.slug,
        method: `tools/call:${name}`,
        detail: err.message,
        durationMs: Date.now() - start,
        status: 'error',
      });
      return {
        isError: true,
        content: [{ type: 'text', text: `Error executing ${name}: ${err.message}` }],
      };
    }
  });

  // 3. PROMPTS (Slash commands for every skill!)
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const start = Date.now();
    const skills = listSkills({ profile: activeProfile, includeDisabled: false });

    const prompts = [
      {
        name: 'apply-skill',
        description: 'Inject any skill from SkillVault by slug along with your current task.',
        arguments: [
          { name: 'slug', description: 'Skill slug to load', required: true },
          { name: 'task', description: 'Optional user task or context', required: false },
        ],
      },
      ...skills.map((s) => ({
        name: `skill-${s.slug}`,
        description: `[${s.category}] ${s.description || s.name}`.slice(0, 240),
        arguments: [
          {
            name: 'task',
            description: 'Optional task instructions to execute using this skill',
            required: false,
          },
        ],
      })),
    ];

    recordMcpActivity({
      transport: transportName,
      profile: activeProfile.slug,
      method: 'prompts/list',
      detail: `Returned ${prompts.length} slash prompts`,
      durationMs: Date.now() - start,
    });

    return { prompts };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const start = Date.now();
    const { name, arguments: args = {} } = request.params;
    const targetSlug =
      name === 'apply-skill' ? args.slug : name.startsWith('skill-') ? name.slice(6) : name;

    const skill = getSkillByIdOrSlug(targetSlug, { profile: activeProfile, recordUsage: true });
    if (!skill) {
      throw new Error(`Skill prompt "${targetSlug}" not found.`);
    }

    const userText = args.task
      ? `Follow the **${skill.name}** skill instructions below to complete my task.\n\n## Current Task\n${args.task}\n\n---\n\n${formatSkillFullMarkdown(skill, true)}`
      : `Load and follow the **${skill.name}** skill instructions below for our conversation:\n\n${formatSkillFullMarkdown(skill, true)}`;

    recordMcpActivity({
      transport: transportName,
      profile: activeProfile.slug,
      method: 'prompts/get',
      detail: `Prompt invoked for "${skill.slug}"`,
      durationMs: Date.now() - start,
    });

    return {
      description: skill.description || skill.name,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: userText,
          },
        },
      ],
    };
  });

  // 4. RESOURCES (Native skill:// URIs)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const start = Date.now();
    const skills = listSkills({ profile: activeProfile, includeDisabled: false });

    const resources = [
      {
        uri: 'skill://catalog/index',
        name: 'SkillVault Complete Index',
        description: `Summary catalog of all ${skills.length} enabled skills in profile "${activeProfile.name}".`,
        mimeType: 'text/markdown',
      },
      ...skills.map((s) => ({
        uri: `skill://${s.slug}`,
        name: s.name,
        description: s.description || `Skill in ${s.category}`,
        mimeType: 'text/markdown',
      })),
    ];

    recordMcpActivity({
      transport: transportName,
      profile: activeProfile.slug,
      method: 'resources/list',
      detail: `Listed ${resources.length} skill resources`,
      durationMs: Date.now() - start,
    });

    return { resources };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: 'skill://{slug}',
        name: 'Skill Markdown Document',
        description: 'Fetch the complete Markdown instructions and reference docs for a skill by slug.',
        mimeType: 'text/markdown',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const start = Date.now();
    const uri = String(request.params.uri || '');

    if (uri === 'skill://catalog/index') {
      const skills = listSkills({ profile: activeProfile, includeDisabled: false });
      const indexMd = [
        `# SkillVault Catalog (${activeProfile.name})`,
        '',
        `Total active skills: **${skills.length}**`,
        '',
        ...skills.map(
          (s) =>
            `- **${s.name}** (\`skill://${s.slug}\`, category: \`${s.category}\`) — ${s.description}`
        ),
      ].join('\n');

      recordMcpActivity({
        transport: transportName,
        profile: activeProfile.slug,
        method: 'resources/read',
        detail: 'Read skill://catalog/index',
        durationMs: Date.now() - start,
      });

      return {
        contents: [{ uri, mimeType: 'text/markdown', text: indexMd }],
      };
    }

    const slug = uri.replace(/^skill:\/\//, '').replace(/\/+$/, '');
    const skill = getSkillByIdOrSlug(slug, { profile: activeProfile, recordUsage: true });
    if (!skill) {
      throw new Error(`Resource not found: ${uri}`);
    }

    recordMcpActivity({
      transport: transportName,
      profile: activeProfile.slug,
      method: 'resources/read',
      detail: `Read resource skill://${skill.slug}`,
      durationMs: Date.now() - start,
    });

    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: formatSkillFullMarkdown(skill, true),
        },
      ],
    };
  });

  return server;
}
