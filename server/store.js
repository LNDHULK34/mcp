import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SKILLS } from '../seeds/defaultSkills.js';
import { parseFrontmatter, slugify, normalizeTags } from './parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.SKILLVAULT_DATA_DIR || path.resolve(__dirname, '..', 'data');
const SKILLS_DISK_DIR = path.join(DATA_DIR, 'skills');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');

let cachedState = null;
let cachedMtimeMs = 0;

function ensureDirs() {
  fs.mkdirSync(SKILLS_DISK_DIR, { recursive: true });
}

function defaultState() {
  const now = new Date().toISOString();
  const seededSkills = DEFAULT_SKILLS.map((seed) => {
    const { body } = parseFrontmatter(seed.content);
    return {
      id: crypto.randomUUID(),
      name: seed.name,
      slug: seed.slug,
      description: seed.description,
      category: seed.category || 'general',
      tags: seed.tags || [],
      version: seed.version || '1.0.0',
      enabled: seed.enabled !== false,
      content: seed.content,
      body,
      references: seed.references || [],
      source: seed.source || { type: 'seed', label: 'Starter Library' },
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    version: 1,
    skills: seededSkills,
    profiles: [
      {
        id: 'default',
        name: 'All Active Skills (Default)',
        slug: 'all',
        description: 'Exposes every enabled skill in your library to any connected MCP agent.',
        filterMode: 'all', // 'all' | 'categories' | 'tags' | 'manual'
        categories: [],
        tags: [],
        skillIds: [],
        requireApiKey: false,
        apiKey: '',
        allowWrite: true,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    sources: [],
    activity: [],
  };
}

function writeSkillFilesToDisk(skill) {
  try {
    const skillDir = path.join(SKILLS_DISK_DIR, skill.slug);
    fs.rmSync(skillDir, { recursive: true, force: true });
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.content, 'utf8');

    for (const ref of skill.references || []) {
      const safeRel = String(ref.path || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter((p) => p && p !== '.' && p !== '..')
        .join('/');
      if (!safeRel) continue;
      const target = path.join(skillDir, safeRel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, String(ref.content ?? ''), 'utf8');
    }
  } catch (err) {
    console.error('[store] Failed writing skill mirror to disk:', err.message);
  }
}

function removeSkillFilesFromDisk(slug) {
  try {
    if (!slug) return;
    const skillDir = path.join(SKILLS_DISK_DIR, slug);
    fs.rmSync(skillDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup error
  }
}

function saveState(state) {
  ensureDirs();
  const tmpPath = `${INDEX_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, INDEX_PATH);
  const stat = fs.statSync(INDEX_PATH);
  cachedState = state;
  cachedMtimeMs = stat.mtimeMs;
}

export function loadState() {
  ensureDirs();
  if (!fs.existsSync(INDEX_PATH)) {
    const initial = defaultState();
    for (const skill of initial.skills) {
      writeSkillFilesToDisk(skill);
    }
    saveState(initial);
    return initial;
  }

  const stat = fs.statSync(INDEX_PATH);
  if (cachedState && stat.mtimeMs === cachedMtimeMs) {
    return cachedState;
  }

  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cachedState = {
      version: 1,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : defaultState().profiles,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    };
    cachedMtimeMs = stat.mtimeMs;
    return cachedState;
  } catch (err) {
    console.error('[store] Corrupt index.json, re-initializing backup:', err.message);
    const fresh = defaultState();
    saveState(fresh);
    return fresh;
  }
}

export function generateApiKey() {
  return `skv_${crypto.randomBytes(18).toString('hex')}`;
}

export function getSkillsForProfile(profile, includeDisabled = false) {
  const state = loadState();
  const pool = includeDisabled ? state.skills : state.skills.filter((s) => s.enabled !== false);
  if (!profile || profile.filterMode === 'all') {
    return pool;
  }
  if (profile.filterMode === 'categories') {
    const allowed = new Set((profile.categories || []).map((c) => c.toLowerCase()));
    return pool.filter((s) => allowed.has(String(s.category || '').toLowerCase()));
  }
  if (profile.filterMode === 'tags') {
    const allowed = new Set((profile.tags || []).map((t) => t.toLowerCase()));
    return pool.filter((s) => (s.tags || []).some((t) => allowed.has(t.toLowerCase())));
  }
  if (profile.filterMode === 'manual') {
    const allowed = new Set(profile.skillIds || []);
    return pool.filter((s) => allowed.has(s.id) || allowed.has(s.slug));
  }
  return pool;
}

export function resolveProfile({ profileSlug, apiKey } = {}) {
  const state = loadState();
  const cleanToken = String(apiKey || '').trim();

  // If API key matches a specific profile, resolve directly to it
  if (cleanToken) {
    const matchedByKey = state.profiles.find((p) => p.apiKey && p.apiKey === cleanToken);
    if (matchedByKey && (!profileSlug || matchedByKey.slug === profileSlug)) {
      return { ok: true, profile: matchedByKey };
    }
  }

  const targetSlug = profileSlug || 'all';
  const profile =
    state.profiles.find((p) => p.slug === targetSlug || p.id === targetSlug) || state.profiles[0];

  if (!profile) {
    return { ok: false, status: 404, error: `Agent profile "${targetSlug}" was not found.` };
  }

  if (profile.requireApiKey && profile.apiKey) {
    if (cleanToken !== profile.apiKey) {
      return {
        ok: false,
        status: 401,
        error: `Unauthorized: profile "${profile.name}" requires a valid Bearer API key.`,
      };
    }
  }

  return { ok: true, profile };
}

export function listSkills({ profile, query = '', category = '', tag = '', sourceType = '', includeDisabled = true } = {}) {
  let skills = profile ? getSkillsForProfile(profile, includeDisabled) : loadState().skills;

  if (!includeDisabled) {
    skills = skills.filter((s) => s.enabled !== false);
  }
  if (category && category !== 'all') {
    skills = skills.filter((s) => String(s.category || '').toLowerCase() === category.toLowerCase());
  }
  if (tag) {
    skills = skills.filter((s) => (s.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase()));
  }
  if (sourceType && sourceType !== 'all') {
    skills = skills.filter((s) => String(s.source?.type || '').toLowerCase() === sourceType.toLowerCase());
  }
  if (query && query.trim()) {
    return searchSkills(query, { pool: skills });
  }
  return [...skills].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function searchSkills(query, { profile, pool, category = '', tag = '', limit = 25 } = {}) {
  const basePool = pool || getSkillsForProfile(profile, false);
  let candidates = basePool;

  if (category) {
    candidates = candidates.filter((s) => String(s.category || '').toLowerCase() === category.toLowerCase());
  }
  if (tag) {
    candidates = candidates.filter((s) => (s.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase()));
  }

  const rawQ = String(query || '').trim().toLowerCase();
  if (!rawQ) return candidates.slice(0, limit);

  const terms = rawQ.split(/\s+/).filter(Boolean);
  const scored = [];

  for (const skill of candidates) {
    const nameL = skill.name.toLowerCase();
    const slugL = skill.slug.toLowerCase();
    const descL = (skill.description || '').toLowerCase();
    const catL = (skill.category || '').toLowerCase();
    const tagsL = (skill.tags || []).map((t) => t.toLowerCase());
    const bodyL = (skill.content || '').toLowerCase();
    const refsL = (skill.references || []).map((r) => `${r.path} ${r.content}`.toLowerCase()).join('\n');

    let score = 0;
    if (slugL === rawQ || nameL === rawQ) score += 120;
    else if (nameL.includes(rawQ) || slugL.includes(rawQ)) score += 70;
    if (tagsL.includes(rawQ)) score += 60;
    if (catL.includes(rawQ)) score += 35;
    if (descL.includes(rawQ)) score += 30;
    if (bodyL.includes(rawQ)) score += 15;

    for (const term of terms) {
      if (nameL.includes(term)) score += 25;
      if (slugL.includes(term)) score += 20;
      if (tagsL.some((t) => t.includes(term))) score += 18;
      if (catL.includes(term)) score += 12;
      if (descL.includes(term)) score += 10;
      if (bodyL.includes(term)) score += 5;
      if (refsL.includes(term)) score += 3;
    }

    if (score > 0) {
      scored.push({ skill, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  return scored.slice(0, limit).map((item) => item.skill);
}

export function getSkillByIdOrSlug(identifier, { profile, recordUsage = false } = {}) {
  const state = loadState();
  const pool = profile ? getSkillsForProfile(profile, false) : state.skills;
  const target = String(identifier || '').trim().toLowerCase();
  const cleaned = target.replace(/^skill:\/\//, '');

  const found = pool.find(
    (s) => s.id.toLowerCase() === cleaned || s.slug.toLowerCase() === cleaned || s.name.toLowerCase() === cleaned
  );

  if (found && recordUsage) {
    found.usageCount = (found.usageCount || 0) + 1;
    saveState(state);
  }
  return found || null;
}

export function upsertManySkills(incomingSkills, { conflictStrategy = 'overwrite' } = {}) {
  const state = loadState();
  const now = new Date().toISOString();
  const created = [];
  const updated = [];
  const skipped = [];

  for (const item of incomingSkills) {
    const desiredSlug = slugify(item.slug || item.name);
    const { body } = parseFrontmatter(item.content || '');
    const existingIndex = state.skills.findIndex((s) => s.slug === desiredSlug);

    if (existingIndex !== -1) {
      if (conflictStrategy === 'skip') {
        skipped.push(state.skills[existingIndex]);
        continue;
      }

      if (conflictStrategy === 'overwrite') {
        const prev = state.skills[existingIndex];
        const merged = {
          ...prev,
          name: item.name || prev.name,
          description: item.description ?? prev.description,
          category: item.category || prev.category || 'general',
          tags: normalizeTags(item.tags ?? prev.tags),
          version: item.version || prev.version || '1.0.0',
          enabled: item.enabled !== undefined ? Boolean(item.enabled) : prev.enabled,
          content: item.content ?? prev.content,
          body,
          references: Array.isArray(item.references) ? item.references : prev.references || [],
          source: item.source || prev.source,
          originalPath: item.originalPath ?? prev.originalPath,
          updatedAt: now,
        };
        state.skills[existingIndex] = merged;
        writeSkillFilesToDisk(merged);
        updated.push(merged);
        continue;
      }
    }

    // Create fresh unique slug if duplicate strategy or brand new skill
    let uniqueSlug = desiredSlug;
    let suffix = 2;
    while (state.skills.some((s) => s.slug === uniqueSlug)) {
      uniqueSlug = `${desiredSlug}-${suffix++}`;
    }

    const record = {
      id: crypto.randomUUID(),
      name: String(item.name || 'Untitled Skill').trim(),
      slug: uniqueSlug,
      description: String(item.description || '').trim(),
      category: String(item.category || 'general').trim() || 'general',
      tags: normalizeTags(item.tags),
      version: String(item.version || '1.0.0'),
      enabled: item.enabled !== false,
      content: String(item.content || ''),
      body,
      references: Array.isArray(item.references) ? item.references : [],
      source: item.source || { type: 'manual', label: 'Manual' },
      originalPath: item.originalPath || '',
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    state.skills.unshift(record);
    writeSkillFilesToDisk(record);
    created.push(record);
  }

  saveState(state);
  return { created, updated, skipped };
}

export function updateSkillById(id, patch) {
  const state = loadState();
  const idx = state.skills.findIndex((s) => s.id === id || s.slug === id);
  if (idx === -1) return null;

  const prev = state.skills[idx];
  let nextSlug = patch.slug ? slugify(patch.slug) : prev.slug;
  if (nextSlug !== prev.slug) {
    let candidate = nextSlug;
    let suffix = 2;
    while (state.skills.some((s, i) => i !== idx && s.slug === candidate)) {
      candidate = `${nextSlug}-${suffix++}`;
    }
    nextSlug = candidate;
    removeSkillFilesFromDisk(prev.slug);
  }

  const nextContent = patch.content !== undefined ? String(patch.content) : prev.content;
  const { body } = parseFrontmatter(nextContent);

  const updated = {
    ...prev,
    name: patch.name !== undefined ? String(patch.name).trim() || prev.name : prev.name,
    slug: nextSlug,
    description: patch.description !== undefined ? String(patch.description).trim() : prev.description,
    category: patch.category !== undefined ? String(patch.category).trim() || 'general' : prev.category,
    tags: patch.tags !== undefined ? normalizeTags(patch.tags) : prev.tags,
    version: patch.version !== undefined ? String(patch.version) : prev.version,
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : prev.enabled,
    content: nextContent,
    body,
    references: Array.isArray(patch.references) ? patch.references : prev.references || [],
    updatedAt: new Date().toISOString(),
  };

  state.skills[idx] = updated;
  writeSkillFilesToDisk(updated);
  saveState(state);
  return updated;
}

export function deleteSkillsByIds(ids) {
  const state = loadState();
  const targetSet = new Set(ids);
  const removed = state.skills.filter((s) => targetSet.has(s.id) || targetSet.has(s.slug));
  if (removed.length === 0) return 0;

  for (const s of removed) {
    removeSkillFilesFromDisk(s.slug);
  }
  state.skills = state.skills.filter((s) => !targetSet.has(s.id) && !targetSet.has(s.slug));
  saveState(state);
  return removed.length;
}

export function listProfiles() {
  return loadState().profiles;
}

export function upsertProfile(payload) {
  const state = loadState();
  const now = new Date().toISOString();
  const existingIdx = payload.id ? state.profiles.findIndex((p) => p.id === payload.id) : -1;

  if (existingIdx !== -1) {
    const prev = state.profiles[existingIdx];
    const nextRequireKey = payload.requireApiKey !== undefined ? Boolean(payload.requireApiKey) : prev.requireApiKey;
    let nextKey = payload.apiKey !== undefined ? String(payload.apiKey) : prev.apiKey;
    if (nextRequireKey && !nextKey) {
      nextKey = generateApiKey();
    }

    const updated = {
      ...prev,
      name: payload.name ? String(payload.name).trim() : prev.name,
      slug: prev.isDefault ? 'all' : payload.slug ? slugify(payload.slug) : prev.slug,
      description: payload.description !== undefined ? String(payload.description).trim() : prev.description,
      filterMode: prev.isDefault && !payload.filterMode ? prev.filterMode : payload.filterMode || prev.filterMode,
      categories: Array.isArray(payload.categories) ? payload.categories : prev.categories,
      tags: Array.isArray(payload.tags) ? payload.tags : prev.tags,
      skillIds: Array.isArray(payload.skillIds) ? payload.skillIds : prev.skillIds,
      requireApiKey: nextRequireKey,
      apiKey: nextKey,
      allowWrite: payload.allowWrite !== undefined ? Boolean(payload.allowWrite) : prev.allowWrite,
      updatedAt: now,
    };
    state.profiles[existingIdx] = updated;
    saveState(state);
    return updated;
  }

  let slug = slugify(payload.slug || payload.name || 'agent-profile');
  let suffix = 2;
  while (state.profiles.some((p) => p.slug === slug)) {
    slug = `${slug}-${suffix++}`;
  }

  const requireApiKey = Boolean(payload.requireApiKey);
  const created = {
    id: crypto.randomUUID(),
    name: String(payload.name || 'Agent Profile').trim(),
    slug,
    description: String(payload.description || '').trim(),
    filterMode: payload.filterMode || 'all',
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    skillIds: Array.isArray(payload.skillIds) ? payload.skillIds : [],
    requireApiKey,
    apiKey: requireApiKey ? payload.apiKey || generateApiKey() : '',
    allowWrite: payload.allowWrite !== undefined ? Boolean(payload.allowWrite) : false,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };

  state.profiles.push(created);
  saveState(state);
  return created;
}

export function deleteProfileById(id) {
  const state = loadState();
  const target = state.profiles.find((p) => p.id === id);
  if (!target || target.isDefault) return false;
  state.profiles = state.profiles.filter((p) => p.id !== id);
  saveState(state);
  return true;
}

export function sanitizeSource(src) {
  const { token, ...rest } = src;
  return {
    ...rest,
    hasToken: Boolean(token),
  };
}

export function listSources() {
  return loadState().sources.map(sanitizeSource);
}

export function getRawSourceById(id) {
  return loadState().sources.find((s) => s.id === id) || null;
}

export function upsertSource(sourcePayload) {
  const state = loadState();
  const now = new Date().toISOString();
  const key = sourcePayload.repoKey || `${sourcePayload.owner}/${sourcePayload.repo}:${sourcePayload.branch || 'HEAD'}:${sourcePayload.subpath || ''}`;
  const idx = state.sources.findIndex((s) => s.id === sourcePayload.id || s.repoKey === key);

  if (idx !== -1) {
    const prev = state.sources[idx];
    const updated = {
      ...prev,
      ...sourcePayload,
      repoKey: key,
      token: sourcePayload.token ? sourcePayload.token : prev.token || '',
      lastSyncedAt: now,
    };
    state.sources[idx] = updated;
    saveState(state);
    return sanitizeSource(updated);
  }

  const record = {
    id: crypto.randomUUID(),
    repoKey: key,
    owner: sourcePayload.owner,
    repo: sourcePayload.repo,
    branch: sourcePayload.branch || '',
    subpath: sourcePayload.subpath || '',
    url: sourcePayload.url || `https://github.com/${sourcePayload.owner}/${sourcePayload.repo}`,
    mode: sourcePayload.mode || 'smart',
    defaultCategory: sourcePayload.defaultCategory || '',
    skillCount: sourcePayload.skillCount || 0,
    token: sourcePayload.token || '',
    createdAt: now,
    lastSyncedAt: now,
  };
  state.sources.unshift(record);
  saveState(state);
  return sanitizeSource(record);
}

export function deleteSourceById(id) {
  const state = loadState();
  const before = state.sources.length;
  state.sources = state.sources.filter((s) => s.id !== id);
  if (state.sources.length === before) return false;
  saveState(state);
  return true;
}

export function recordMcpActivity(entry) {
  try {
    const state = loadState();
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      transport: entry.transport || 'http',
      profile: entry.profile || 'all',
      method: entry.method || 'unknown',
      detail: entry.detail || '',
      durationMs: entry.durationMs ?? 0,
      status: entry.status || 'ok',
    };
    state.activity.unshift(record);
    if (state.activity.length > 80) {
      state.activity = state.activity.slice(0, 80);
    }
    saveState(state);
  } catch {
    // Non-critical telemetry
  }
}

export function listMcpActivity(limit = 40) {
  return loadState().activity.slice(0, limit);
}
