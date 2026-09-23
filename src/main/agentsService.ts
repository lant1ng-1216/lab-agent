import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type {
  AgentDeleteRequest,
  AgentInfo,
  AgentReadRequest,
  AgentReadResult,
  AgentRevealRequest,
  AgentScope,
  AgentWriteRequest,
  AgentWriteResult,
  AgentsListResult,
} from '../shared/protocol';

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FRONTMATTER_MAX_BYTES = 8192;

export interface AgentsServiceOptions {
  getWorkspacePath: () => string;
  getGlobalAgentsRoot: () => string;
}

function withinRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Minimal frontmatter reader for list display only (full file is kept verbatim). */
function parseFrontmatter(raw: string): { name: string; description: string; model: string; tools: string[] } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: '', description: '', model: '', tools: [] };
  const body = match[1];
  const unquote = (v: string) => v.replace(/^["']|["']$/g, '');
  const name = unquote(body.match(/^name:\s*(.+)\s*$/m)?.[1]?.trim() ?? '');
  const description = unquote(body.match(/^description:\s*(.+)\s*$/m)?.[1]?.trim() ?? '');
  const model = unquote(body.match(/^model:\s*(.+)\s*$/m)?.[1]?.trim() ?? '');
  const toolsRaw = unquote(body.match(/^tools:\s*(.+)\s*$/m)?.[1]?.trim() ?? '');
  const tools = toolsRaw
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return { name, description, model, tools };
}

async function scanRoot(scope: AgentScope, root: string): Promise<AgentInfo[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: AgentInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(root, entry.name);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      continue;
    }
    let parsed = { name: '', description: '', model: '', tools: [] as string[] };
    try {
      const handle = await fsp.open(filePath, 'r');
      try {
        const { buffer, bytesRead } = await handle.read(
          Buffer.alloc(FRONTMATTER_MAX_BYTES),
          0,
          FRONTMATTER_MAX_BYTES,
          0,
        );
        parsed = parseFrontmatter(buffer.toString('utf8', 0, bytesRead));
      } finally {
        await handle.close();
      }
    } catch {
      // Keep agent visible even if frontmatter read fails.
    }
    agents.push({
      scope,
      name: entry.name.slice(0, -3),
      agentType: parsed.name,
      description: parsed.description,
      model: parsed.model,
      tools: parsed.tools,
      filePath,
      mtimeMs: stat.mtimeMs,
    });
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export function createAgentsService(options: AgentsServiceOptions) {
  function resolveRoot(scope: AgentScope): string | null {
    if (scope === 'global') {
      const root = path.normalize(options.getGlobalAgentsRoot());
      return root ? root : null;
    }
    const workspace = options.getWorkspacePath().trim();
    if (!workspace) return null;
    return path.join(path.normalize(workspace), '.claude', 'agents');
  }

  /** Resolve an agent .md file under a validated root; returns null on invalid name/escape. */
  function resolveAgentFile(scope: AgentScope, name: string): { root: string; file: string } | null {
    const root = resolveRoot(scope);
    if (!root) return null;
    if (!NAME_PATTERN.test(name)) return null;
    const file = path.join(root, `${name}.md`);
    if (!withinRoot(root, file)) return null;
    return { root, file };
  }

  return {
    async list(): Promise<AgentsListResult> {
      try {
        const [project, global] = await Promise.all([
          (async () => (resolveRoot('project') ? scanRoot('project', resolveRoot('project')!) : []))(),
          (async () => (resolveRoot('global') ? scanRoot('global', resolveRoot('global')!) : []))(),
        ]);
        return { ok: true, agents: [...project, ...global] };
      } catch (e) {
        return { ok: false, agents: [], error: String(e) };
      }
    },

    async read(req: AgentReadRequest): Promise<AgentReadResult> {
      const resolved = resolveAgentFile(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的智能体名或未设置工作区' };
      try {
        const content = await fsp.readFile(resolved.file, 'utf8');
        return { ok: true, content, filePath: resolved.file };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    async write(req: AgentWriteRequest): Promise<AgentWriteResult> {
      const resolved = resolveAgentFile(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的智能体名或未设置工作区' };
      try {
        await fsp.mkdir(resolved.root, { recursive: true });
        await fsp.writeFile(resolved.file, req.content, 'utf8');
        return { ok: true, filePath: resolved.file };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    async remove(req: AgentDeleteRequest): Promise<{ ok: boolean; error?: string }> {
      const resolved = resolveAgentFile(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的智能体名或未设置工作区' };
      try {
        await fsp.rm(resolved.file, { force: true });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    async reveal(req: AgentRevealRequest): Promise<{ ok: boolean; error?: string }> {
      const resolved = resolveAgentFile(req.scope, req.name);
      if (!resolved) return { ok: false, error: '无效的智能体名或未设置工作区' };
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
