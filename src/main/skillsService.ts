import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type {
  SkillDeleteRequest,
  SkillInfo,
  SkillReadRequest,
  SkillReadResult,
  SkillRevealRequest,
  SkillScope,
  SkillWriteRequest,
  SkillWriteResult,
  SkillsListResult,
} from '../shared/protocol';

const SKILL_FILE = 'SKILL.md';
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FRONTMATTER_MAX_BYTES = 4096;

export interface SkillsServiceOptions {
  getWorkspacePath: () => string;
  getGlobalSkillsRoot: () => string;
}

function withinRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function parseFrontmatter(raw: string): { description: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { description: '' };
  const body = match[1];
  const description = body.match(/^description:\s*(.+)\s*$/m)?.[1]?.trim() ?? '';
  return { description: description.replace(/^["']|["']$/g, '') };
}

async function scanRoot(scope: SkillScope, root: string): Promise<SkillInfo[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: SkillInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(root, entry.name);
    const filePath = path.join(dirPath, SKILL_FILE);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(filePath);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    let description = '';
    let hasScripts = false;
    try {
      const handle = await fsp.open(filePath, 'r');
      try {
        const { buffer, bytesRead } = await handle.read(
          Buffer.alloc(FRONTMATTER_MAX_BYTES),
          0,
          FRONTMATTER_MAX_BYTES,
          0,
        );
        description = parseFrontmatter(buffer.toString('utf8', 0, bytesRead)).description;
      } finally {
        await handle.close();
      }
      const siblings = await fsp.readdir(dirPath);
      hasScripts = siblings.some((name) => name !== SKILL_FILE);
    } catch {
      // Keep skill visible even if auxiliary reads fail.
    }
    skills.push({
      scope,
      name: entry.name,
      description,
      dirPath,
      filePath,
      hasScripts,
      mtimeMs: stat.mtimeMs,
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function createSkillsService(options: SkillsServiceOptions) {
  function resolveRoot(scope: SkillScope): string | null {
    if (scope === 'global') {
      const root = path.normalize(options.getGlobalSkillsRoot());
      return root ? root : null;
    }
    const workspace = options.getWorkspacePath().trim();
    if (!workspace) return null;
    return path.join(path.normalize(workspace), '.claude', 'skills');
  }

  /** Resolve a skill dir/file under a validated root; returns null on invalid name/escape. */
  function resolveSkillDir(scope: SkillScope, name: string): { root: string; dir: string; file: string } | null {
    const root = resolveRoot(scope);
    if (!root) return null;
    if (!NAME_PATTERN.test(name)) return null;
    const dir = path.join(root, name);
    if (!withinRoot(root, dir)) return null;
    return { root, dir, file: path.join(dir, SKILL_FILE) };
  }

  return {
    async list(): Promise<SkillsListResult> {
      try {
        const [project, global] = await Promise.all([
          (async () => (resolveRoot('project') ? scanRoot('project', resolveRoot('project')!) : []))(),
          (async () => (resolveRoot('global') ? scanRoot('global', resolveRoot('global')!) : []))(),
        ]);
        return { ok: true, skills: [...project, ...global] };
      } catch (e) {
        return { ok: false, skills: [], error: String(e) };
      }
    },

    async read(req: SkillReadRequest): Promise<SkillReadResult> {
      const resolved = resolveSkillDir(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的技能名或未设置工作区' };
      try {
        const content = await fsp.readFile(resolved.file, 'utf8');
        return { ok: true, content, filePath: resolved.file };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    async write(req: SkillWriteRequest): Promise<SkillWriteResult> {
      const resolved = resolveSkillDir(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的技能名或未设置工作区' };
      try {
        await fsp.mkdir(resolved.dir, { recursive: true });
        await fsp.writeFile(resolved.file, req.content, 'utf8');
        return { ok: true, filePath: resolved.file };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    async remove(req: SkillDeleteRequest): Promise<{ ok: boolean; error?: string }> {
      const resolved = resolveSkillDir(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的技能名或未设置工作区' };
      try {
        await fsp.rm(resolved.dir, { recursive: true, force: true });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    async reveal(req: SkillRevealRequest): Promise<{ ok: boolean; error?: string }> {
      const resolved = resolveSkillDir(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的技能名或未设置工作区' };
      try {
        await fsp.access(resolved.file);
        // Lazy import keeps shell usage colocated with its handler.
        const { shell } = await import('electron');
        shell.showItemInFolder(resolved.file);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
  };
}
