export const DEFAULT_SKILLS = [
  {
    name: 'Modern React & UI Architecture',
    slug: 'modern-react-ui-architecture',
    description:
      'Guidelines for building responsive, accessible React interfaces with clean component boundaries, predictable state management, and zero layout jank.',
    category: 'frontend',
    tags: ['react', 'ui', 'tailwind', 'accessibility', 'components'],
    source: { type: 'seed', label: 'Starter Library' },
    enabled: true,
    content: `---
name: Modern React & UI Architecture
description: Guidelines for building responsive, accessible React interfaces with clean component boundaries, predictable state management, and zero layout jank.
category: frontend
tags:
  - react
  - ui
  - tailwind
  - accessibility
---

# Modern React & UI Architecture

Use this skill whenever designing, refactoring, or building interactive frontend components and web applications.

## Core Principles

1. **Colocate State Near Usage**
   - Keep ephemeral UI state (dropdown open, search input, active tab) inside the leaf component unless sibling views genuinely depend on it.
   - Derive computed values during render instead of syncing duplicate state via \`useEffect\`.

2. **Explicit Loading, Empty, and Error States**
   - Every async view must handle four states deliberately: **loading skeleton**, **empty state with primary action**, **recoverable error banner**, and **populated content**.
   - Preserve user input across failed submissions so work is never lost.

3. **Keyboard & Screen Reader First**
   - Use native semantic elements (\`<button>\`, \`<nav>\`, \`<dialog>\`, \`<label>\`) before reaching for custom ARIA attributes.
   - Ensure every interactive control has visible \`:focus-visible\` styling and works with \`Enter\` / \`Escape\`.

## Verification Checklist

- [ ] No raw \`useEffect\` chains mirroring props into state
- [ ] Mobile viewport (375px) and desktop viewport (1440px) render without horizontal overflow
- [ ] Optimistic or disabled button states prevent duplicate mutations
`,
    references: [
      {
        path: 'references/state-patterns.md',
        content: `# State Pattern Reference

## Prefer Derived State Over Sync Effects

\`\`\`jsx
// Good: derived directly during render
const filteredItems = items.filter((item) =>
  item.title.toLowerCase().includes(query.trim().toLowerCase())
);
\`\`\`

## URL & Query State

When filters or tabs represent shareable views, sync the active tab or filter key with \`URLSearchParams\` so refreshing preserves context.
`,
      },
    ],
  },
  {
    name: 'REST & MCP API Design',
    slug: 'rest-and-mcp-api-design',
    description:
      'Conventions for designing clean HTTP APIs and MCP tools with clear schemas, actionable error messages, and deterministic responses.',
    category: 'backend',
    tags: ['api', 'mcp', 'nodejs', 'validation', 'architecture'],
    source: { type: 'seed', label: 'Starter Library' },
    enabled: true,
    content: `---
name: REST & MCP API Design
description: Conventions for designing clean HTTP APIs and MCP tools with clear schemas, actionable error messages, and deterministic responses.
category: backend
tags:
  - api
  - mcp
  - nodejs
  - validation
---

# REST & MCP API Design

Apply these standards whenever creating backend routes, webhooks, or Model Context Protocol (MCP) tools.

## MCP Tool Design Rules

1. **Self-Documenting Tool Schemas**
   - Write concise, high-signal tool descriptions explaining *when* an agent should call the tool and what data shape it returns.
   - Constrain string parameters with clear defaults, enums, and limits so models succeed on the first tool call.

2. **Token-Conscious Outputs**
   - Provide summary/index endpoints (\`list_skills\`, \`search_skills\`) separate from full payload fetchers (\`get_skill\`).
   - Return structured markdown or compact JSON without redundant wrapper boilerplate.

3. **Actionable Error Responses**
   - Never return opaque \`500 Internal Error\` strings when validation fails. Explain which field failed and show a valid example or closest match.
`,
    references: [],
  },
  {
    name: 'Systematic Debugging Playbook',
    slug: 'systematic-debugging-playbook',
    description:
      'Root-cause debugging workflow: reproduce reliably, isolate minimal failing cases, verify hypotheses with evidence, and lock fixes with regression tests.',
    category: 'engineering',
    tags: ['debugging', 'testing', 'root-cause', 'reliability'],
    source: { type: 'seed', label: 'Starter Library' },
    enabled: true,
    content: `---
name: Systematic Debugging Playbook
description: Root-cause debugging workflow: reproduce reliably, isolate minimal failing cases, verify hypotheses with evidence, and lock fixes with regression tests.
category: engineering
tags:
  - debugging
  - testing
  - root-cause
---

# Systematic Debugging Playbook

Follow this four-step loop whenever investigating bugs, flaky tests, build failures, or unexpected runtime behavior.

## 1. Reproduce Before Editing

- Capture the exact command, request payload, or user interaction that triggers the failure.
- Read the full stack trace and check the *first* error in the chain rather than secondary cascade errors.

## 2. Narrow the Blast Radius

- Trace data flow boundary-by-boundary: input payload -> parser -> storage -> API response -> UI state.
- Form a single falsifiable hypothesis at a time instead of changing three layers simultaneously.

## 3. Fix at the Root Cause

- Fix invalid assumptions at the boundary where bad data enters rather than patching symptoms downstream.
- Check sibling code paths for the exact same pattern.

## 4. Lock with a Regression Test

- Add an automated test that fails without your fix and passes with it before marking the task complete.
`,
    references: [],
  },
  {
    name: 'Git & Pull Request Craft',
    slug: 'git-and-pull-request-craft',
    description:
      'Clean commit hygiene, atomic branch workflows, security pre-checks, and high-signal pull request summaries.',
    category: 'devops',
    tags: ['git', 'github', 'code-review', 'ci-cd'],
    source: { type: 'seed', label: 'Starter Library' },
    enabled: true,
    content: `---
name: Git & Pull Request Craft
description: Clean commit hygiene, atomic branch workflows, security pre-checks, and high-signal pull request summaries.
category: devops
tags:
  - git
  - github
  - code-review
---

# Git & Pull Request Craft

Use this workflow before committing code, pushing branches, or opening pull requests.

## Pre-Commit Safety Checks

1. Run \`git status\` and \`git diff --stat\` to ensure no secrets (\`.env\`, tokens, private keys), build artifacts (\`dist/\`, \`node_modules/\`), or unintended edits are staged.
2. Verify the project builds and passes tests cleanly before creating the commit.

## Commit & PR Structure

- Keep commits atomic and scoped to a coherent change.
- Write imperative subject lines focusing on *why* and *what* changed.
- Structure pull request bodies with:
  - **Summary** (2-4 concise bullets)
  - **Architecture / Key Changes**
  - **Verification Steps Run**
`,
    references: [],
  },
];
