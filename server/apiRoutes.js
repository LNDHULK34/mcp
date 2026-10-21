import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSkills,
  getSkillByIdOrSlug,
  upsertManySkills,
  updateSkillById,
  deleteSkillsByIds,
  listProfiles,
  upsertProfile,
  deleteProfileById,
  generateApiKey,
  listSources,
  getRawSourceById,
  upsertSource,
  deleteSourceById,
  listMcpActivity,
  resolveProfile,
  DATA_DIR,
} from './store.js';
import { parseFilesIntoSkills, buildSkillRecord } from './parser.js';
import {
  fetchGitHubMarkdownFiles,
  extractMarkdownFromZipBuffer,
  fetchDirectUrls,
} from './importers.js';
import { createSkillsZipBuffer } from './exporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export function createApiRouter() {
  const router = Router();

  // Server metadata & connection info (uses request host dynamically so zero hardcoded localhost!)
  router.get('/server-info', (req, res) => {
    const skills = listSkills({ includeDisabled: true });
    const profiles = listProfiles();
    const sources = listSources();
    const activity = listMcpActivity(15);

    const categories = [...new Set(skills.map((s) => s.category).filter(Boolean))].sort();
    const tags = [...new Set(skills.flatMap((s) => s.tags || []).filter(Boolean))].sort();

    res.json({
      name: 'SkillVault MCP',
      version: '1.0.0',
      stdioScriptPath: path.join(REPO_ROOT, 'server', 'stdio.js'),
      dataDir: DATA_DIR,
      stats: {
        totalSkills: skills.length,
        enabledSkills: skills.filter((s) => s.enabled !== false).length,
        profilesCount: profiles.length,
        sourcesCount: sources.length,
        totalMcpCalls: activity.length,
      },
      categories,
      tags,
    });
  });

  // --- SKILLS CRUD ---
  router.get('/skills', (req, res) => {
    const { query = '', category = '', tag = '', sourceType = '' } = req.query;
    const skills = listSkills({ query, category, tag, sourceType, includeDisabled: true });
    res.json({ skills });
  });

  router.get('/skills/:id', (req, res) => {
    const skill = getSkillByIdOrSlug(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found.' });
    }
    res.json({ skill });
  });

  router.post('/skills', (req, res) => {
    try {
      const { name, slug, description, category, tags, content, references, enabled } = req.body || {};
      if (!name || !content) {
        return res.status(400).json({ error: 'Both skill name and Markdown content are required.' });
      }
      const parsed = buildSkillRecord({
        rawContent: content,
        fallbackName: name,
        fallbackSlug: slug || name,
        inferredCategory: category || 'general',
        references: Array.isArray(references) ? references : [],
        source: { type: 'manual', label: 'Web Editor' },
      });
      parsed.name = name;
      if (description) parsed.description = description;
      if (category) parsed.category = category;
      if (tags) parsed.tags = Array.isArray(tags) ? tags : String(tags).split(',').map((t) => t.trim());
      if (enabled !== undefined) parsed.enabled = Boolean(enabled);

      const result = upsertManySkills([parsed], { conflictStrategy: 'duplicate' });
      res.status(201).json({ skill: result.created[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/skills/:id', (req, res) => {
    try {
      const updated = updateSkillById(req.params.id, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: 'Skill not found.' });
      }
      res.json({ skill: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/skills/batch-action', (req, res) => {
    const { action, ids = [] } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No skills selected.' });
    }

    if (action === 'delete') {
      const deletedCount = deleteSkillsByIds(ids);
      return res.json({ ok: true, affected: deletedCount });
    }
    if (action === 'enable' || action === 'disable') {
      let count = 0;
      for (const id of ids) {
        if (updateSkillById(id, { enabled: action === 'enable' })) count++;
      }
      return res.json({ ok: true, affected: count });
    }

    return res.status(400).json({ error: `Unsupported batch action: ${action}` });
  });

  router.delete('/skills/:id', (req, res) => {
    const count = deleteSkillsByIds([req.params.id]);
    if (!count) return res.status(404).json({ error: 'Skill not found.' });
    res.json({ ok: true });
  });

  // --- IMPORT 1: LOCAL FOLDERS & MARKDOWN FILES ---
  router.post('/import/local', (req, res) => {
    try {
      const {
        files = [],
        mode = 'smart',
        defaultCategory = '',
        conflictStrategy = 'overwrite',
        previewOnly = false,
        folderLabel = 'Local Folder',
      } = req.body || {};

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No Markdown files were provided.' });
      }

      const detected = parseFilesIntoSkills(files, {
        mode,
        defaultCategory,
        source: { type: 'local', label: folderLabel },
      });

      if (detected.length === 0) {
        return res.status(400).json({
          error: 'No valid Markdown skill files (.md, .mdx, .mdc) found in the selected folder.',
        });
      }

      if (previewOnly) {
        return res.json({ preview: true, detected });
      }

      const summary = upsertManySkills(detected, { conflictStrategy });
      res.json({
        ok: true,
        totalDetected: detected.length,
        createdCount: summary.created.length,
        updatedCount: summary.updated.length,
        skippedCount: summary.skipped.length,
        skills: [...summary.created, ...summary.updated],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- IMPORT 2: ZIP ARCHIVE UPLOAD ---
  router.post('/import/zip', upload.single('archive'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Please upload a .zip archive file.' });
      }
      const mode = req.body?.mode || 'smart';
      const defaultCategory = req.body?.defaultCategory || '';
      const conflictStrategy = req.body?.conflictStrategy || 'overwrite';
      const previewOnly = req.body?.previewOnly === 'true' || req.body?.previewOnly === true;

      const files = await extractMarkdownFromZipBuffer(req.file.buffer);
      const detected = parseFilesIntoSkills(files, {
        mode,
        defaultCategory,
        source: { type: 'zip', label: req.file.originalname || 'ZIP Archive' },
      });

      if (detected.length === 0) {
        return res.status(400).json({
          error: 'No Markdown files (.md, .mdx, .mdc) were found inside the uploaded .zip file.',
        });
      }

      if (previewOnly) {
        return res.json({ preview: true, detected });
      }

      const summary = upsertManySkills(detected, { conflictStrategy });
      res.json({
        ok: true,
        totalDetected: detected.length,
        createdCount: summary.created.length,
        updatedCount: summary.updated.length,
        skippedCount: summary.skipped.length,
      });
    } catch (err) {
      res.status(500).json({ error: `ZIP import failed: ${err.message}` });
    }
  });

  // --- IMPORT 3: GITHUB REPOSITORY / SUBFOLDER / BLOB + SYNC ---
  router.post('/import/github', async (req, res) => {
    try {
      const {
        repoUrl,
        branch = '',
        subpath = '',
        token = '',
        mode = 'smart',
        defaultCategory = '',
        conflictStrategy = 'overwrite',
        previewOnly = false,
      } = req.body || {};

      const ghResult = await fetchGitHubMarkdownFiles({
        input: repoUrl,
        branch,
        subpath,
        token,
      });

      const sourceLabel = ghResult.subpath
        ? `${ghResult.owner}/${ghResult.repo}/${ghResult.subpath}`
        : `${ghResult.owner}/${ghResult.repo}`;

      const detected = parseFilesIntoSkills(ghResult.files, {
        mode,
        defaultCategory,
        source: {
          type: 'github',
          label: sourceLabel,
          url: ghResult.canonicalUrl,
          owner: ghResult.owner,
          repo: ghResult.repo,
          branch: ghResult.branch,
        },
      });

      if (detected.length === 0) {
        return res.status(404).json({
          error: `Connected to ${sourceLabel}@${ghResult.branch}, but no Markdown skill files (.md, .mdx, .mdc) were found at that path.`,
        });
      }

      if (previewOnly) {
        return res.json({
          preview: true,
          repoInfo: {
            owner: ghResult.owner,
            repo: ghResult.repo,
            branch: ghResult.branch,
            subpath: ghResult.subpath,
            url: ghResult.canonicalUrl,
          },
          detected,
        });
      }

      const summary = upsertManySkills(detected, { conflictStrategy });
      const savedSource = upsertSource({
        owner: ghResult.owner,
        repo: ghResult.repo,
        branch: ghResult.branch,
        subpath: ghResult.subpath,
        url: ghResult.canonicalUrl,
        mode,
        defaultCategory,
        skillCount: detected.length,
        token,
      });

      res.json({
        ok: true,
        source: savedSource,
        totalDetected: detected.length,
        createdCount: summary.created.length,
        updatedCount: summary.updated.length,
        skippedCount: summary.skipped.length,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Tracked GitHub sources list, re-sync, & delete
  router.get('/sources', (_req, res) => {
    res.json({ sources: listSources() });
  });

  router.post('/sources/:id/sync', async (req, res) => {
    try {
      const src = getRawSourceById(req.params.id);
      if (!src) {
        return res.status(404).json({ error: 'Tracked GitHub source not found.' });
      }

      const ghResult = await fetchGitHubMarkdownFiles({
        input: `${src.owner}/${src.repo}`,
        branch: src.branch,
        subpath: src.subpath,
        token: src.token || '',
      });

      const sourceLabel = ghResult.subpath
        ? `${ghResult.owner}/${ghResult.repo}/${ghResult.subpath}`
        : `${ghResult.owner}/${ghResult.repo}`;

      const detected = parseFilesIntoSkills(ghResult.files, {
        mode: src.mode || 'smart',
        defaultCategory: src.defaultCategory || '',
        source: {
          type: 'github',
          label: sourceLabel,
          url: ghResult.canonicalUrl,
          owner: ghResult.owner,
          repo: ghResult.repo,
          branch: ghResult.branch,
        },
      });

      const summary = upsertManySkills(detected, { conflictStrategy: 'overwrite' });
      const updatedSource = upsertSource({
        ...src,
        skillCount: detected.length,
      });

      res.json({
        ok: true,
        source: updatedSource,
        totalDetected: detected.length,
        createdCount: summary.created.length,
        updatedCount: summary.updated.length,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/sources/:id', (req, res) => {
    const removed = deleteSourceById(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Source not found.' });
    res.json({ ok: true });
  });

  // --- IMPORT 4: DIRECT MARKDOWN URLS ---
  router.post('/import/urls', async (req, res) => {
    try {
      const {
        urls = [],
        defaultCategory = 'imported',
        conflictStrategy = 'overwrite',
        token = '',
      } = req.body || {};

      const cleanUrls = (Array.isArray(urls) ? urls : String(urls).split('\n'))
        .map((u) => u.trim())
        .filter(Boolean);

      if (cleanUrls.length === 0) {
        return res.status(400).json({ error: 'Enter at least one Markdown URL to import.' });
      }

      const fetched = await fetchDirectUrls(cleanUrls, token);
      const detected = parseFilesIntoSkills(fetched, {
        mode: 'per-file',
        defaultCategory,
        source: { type: 'url', label: 'Direct URL Import' },
      });

      const summary = upsertManySkills(detected, { conflictStrategy });
      res.json({
        ok: true,
        totalDetected: detected.length,
        createdCount: summary.created.length,
        updatedCount: summary.updated.length,
        skippedCount: summary.skipped.length,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- EXPORT SKILLS BUNDLE (.zip) ---
  router.get('/export/zip', async (req, res) => {
    try {
      const { profileSlug = '', ids = '' } = req.query;
      let skills = [];

      if (ids) {
        const idSet = new Set(String(ids).split(',').filter(Boolean));
        skills = listSkills({ includeDisabled: true }).filter((s) => idSet.has(s.id) || idSet.has(s.slug));
      } else if (profileSlug) {
        const resolved = resolveProfile({ profileSlug });
        skills = resolved.ok ? listSkills({ profile: resolved.profile, includeDisabled: false }) : [];
      } else {
        skills = listSkills({ includeDisabled: true });
      }

      const buffer = await createSkillsZipBuffer(skills, 'skills');
      const fileLabel = profileSlug ? `skillvault-${profileSlug}.zip` : 'skillvault-skills.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileLabel}"`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- AGENT PROFILES & API KEYS ---
  router.get('/profiles', (_req, res) => {
    const profiles = listProfiles().map((p) => ({
      ...p,
      skillCount: listSkills({ profile: p, includeDisabled: false }).length,
    }));
    res.json({ profiles });
  });

  router.post('/profiles', (req, res) => {
    try {
      const saved = upsertProfile(req.body || {});
      res.json({
        profile: {
          ...saved,
          skillCount: listSkills({ profile: saved, includeDisabled: false }).length,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/profiles/:id/rotate-key', (req, res) => {
    const saved = upsertProfile({
      id: req.params.id,
      requireApiKey: true,
      apiKey: generateApiKey(),
    });
    res.json({
      profile: {
        ...saved,
        skillCount: listSkills({ profile: saved, includeDisabled: false }).length,
      },
    });
  });

  router.delete('/profiles/:id', (req, res) => {
    const ok = deleteProfileById(req.params.id);
    if (!ok) {
      return res.status(400).json({ error: 'Cannot delete the default profile or profile not found.' });
    }
    res.json({ ok: true });
  });

  // --- LIVE MCP TELEMETRY / ACTIVITY LOGS ---
  router.get('/activity', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 40, 80);
    res.json({ activity: listMcpActivity(limit) });
  });

  return router;
}
