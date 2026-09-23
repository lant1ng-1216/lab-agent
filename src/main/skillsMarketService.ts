import fsp from 'node:fs/promises';
import path from 'node:path';

import type {
  MarketInstallRequest,
  MarketInstallResult,
  MarketListResult,
  MarketPreviewRequest,
  MarketPreviewResult,
  MarketSkillInfo,
  MarketSourceInfo,
  SkillScope,
} from '../shared/protocol';

const SKILL_FILE = 'SKILL.md';
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FRONTMATTER_MAX_BYTES = 8192;
const SINGLE_FILE_MAX_BYTES = 1024 * 1024;
const SKILL_MD_MAX_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ASSETS_PER_SKILL = 20;

/**
 * Community skill sources. Each entry is a public GitHub repo whose layout is
 * `<skillsPath>/<skill-name>/SKILL.md`; entries are discovered through the
 * GitHub tree API and downloaded over raw.githubusercontent.com.
 */
const MARKET_SOURCES: MarketSourceInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic 官方',
    repo: 'anthropics/skills',
    branch: 'main',
    skillsPath: 'skills',
    description: 'Anthropic 官方技能集：文档处理、设计、前端与测试等通用能力。',
    homepage: 'https://github.com/anthropics/skills',
    supportsAssets: true,
  },
  {
    id: 'superpowers',
    label: 'Superpowers 工作流',
    repo: 'obra/superpowers',
    branch: 'main',
    skillsPath: 'skills',
    description: '面向开发流程的技能：规划、调试、代码评审、并行子代理。',
    homepage: 'https://github.com/obra/superpowers',
    supportsAssets: true,
  },
  {
    id: 'gentleman',
    label: 'Gentleman Skills',
    repo: 'Gentleman-Programming/Gentleman-Skills',
    branch: 'main',
    skillsPath: 'curated',
    description: '社区维护的框架向技能：Angular、Next.js、Playwright、Django 等。',
    homepage: 'https://github.com/Gentleman-Programming/Gentleman-Skills',
    supportsAssets: true,
  },
  {
    id: 'agent-skills',
    label: 'Agent Skills 精选',
    repo: 'addyosmani/agent-skills',
    branch: 'main',
    skillsPath: 'skills',
    description: '工程方法论类技能：TDD、性能优化、可观测性、安全加固。',
    homepage: 'https://github.com/addyosmani/agent-skills',
    supportsAssets: true,
  },
  {
    id: 'composio',
    label: 'Composio 精选',
    repo: 'ComposioHQ/awesome-claude-skills',
    branch: 'master',
    skillsPath: '',
    description: '内容创作与自动化方向的精选技能（仓库根目录下的技能目录）。',
    homepage: 'https://github.com/ComposioHQ/awesome-claude-skills',
    supportsAssets: true,
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot 社区',
    repo: 'github/awesome-copilot',
    branch: 'main',
    skillsPath: 'skills',
    description: 'GitHub 社区共建的技能库，覆盖工程、数据、云与运维场景。',
    homepage: 'https://github.com/github/awesome-copilot',
    supportsAssets: true,
  },
];

interface TreeEntry {
  path: string;
  type?: string;
  size?: number;
}

interface TreeResponse {
  tree?: TreeEntry[];
  truncated?: boolean;
  message?: string;
}

interface ContentsEntry {
  name?: string;
  type?: string;
  size?: number;
}

export interface SkillsMarketServiceOptions {
  getWorkspacePath: () => string;
  getGlobalSkillsRoot: () => string;
}

export interface MarketSkillMeta {
  id: string;
  description: string;
  declaredName: string;
}

export interface MarketDescribeResult {
  ok: boolean;
  metas: MarketSkillMeta[];
}

function withinRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Turn a SKILL.md frontmatter block into one-line display strings. */
function parseFrontmatter(raw: string): { name: string; description: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: '', description: '' };
  const body = match[1].slice(0, FRONTMATTER_MAX_BYTES);
  const unquote = (v: string) => v.replace(/^["']|["']$/g, '');
  const name = unquote(body.match(/^name:\s*(.+)\s*$/m)?.[1]?.trim() ?? '');
  let description = unquote(body.match(/^description:\s*(.+)\s*$/m)?.[1]?.trim() ?? '');
  // Fold `description: |` / `description: >` block scalars onto a single line.
  if (!description) {
    const lines = body.split(/\r?\n/);
    const idx = lines.findIndex((l) => /^description:\s*[|>>-]?\s*$/.test(l));
    if (idx >= 0) {
      for (let i = idx + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^[A-Za-z0-9_-]+:/.test(line)) break;
        if (!line.trim()) continue;
        description += (description ? ' ' : '') + line.trim();
      }
    }
  }
  return { name, description: description.replace(/\s+/g, ' ').trim() };
}

/** Install-name sanitizer — output always satisfies the skillsService name rule. */
export function sanitizeSkillName(raw: string): string {
  let name = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  if (!name) name = 'skill';
  if (!/^[A-Za-z0-9]/.test(name)) name = `s${name}`;
  if (name.length > 64) name = name.slice(0, 64).replace(/[-._]+$/, '');
  return NAME_PATTERN.test(name) ? name : 'skill';
}

function sourceById(id: string): MarketSourceInfo | null {
  return MARKET_SOURCES.find((s) => s.id === id) ?? null;
}

/** Market ids look like `<sourceId>/<dir>[/<subdir>]`; each segment must be a plain name. */
function parseSkillId(id: string): { source: MarketSourceInfo; relPath: string } | null {
  const raw = String(id || '');
  const slash = raw.indexOf('/');
  if (slash <= 0) return null;
  const source = sourceById(raw.slice(0, slash));
  if (!source) return null;
  const relPath = raw.slice(slash + 1).replace(/^\/+|\/+$/g, '');
  const segments = relPath.split('/');
  if (segments.length > 3) return null;
  if (segments.some((seg) => !NAME_PATTERN.test(seg))) return null;
  return { source, relPath };
}

async function fetchText(url: string, accept: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'lab-agent-desktop',
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function rawUrl(source: MarketSourceInfo, relPath: string): string {
  return `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${relPath}`;
}

function contentsUrl(source: MarketSourceInfo, relPath: string): string {
  return `https://api.github.com/repos/${source.repo}/contents/${relPath}?ref=${encodeURIComponent(source.branch)}`;
}

async function downloadText(url: string, maxBytes: number, label: string): Promise<string> {
  const text = await fetchText(url, 'text/plain; charset=utf-8');
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error(`${label} 过大`);
  return text;
}

/** List the auxiliary files shipped next to a SKILL.md (best-effort). */
async function listAssets(source: MarketSourceInfo, relPath: string): Promise<string[]> {
  try {
    const raw = await fetchText(contentsUrl(source, relPath), 'application/vnd.github+json');
    const entries = JSON.parse(raw) as ContentsEntry[];
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((e) => e.type === 'file' && e.name && e.name !== SKILL_FILE)
      .filter((e) => (e.size ?? 0) <= SINGLE_FILE_MAX_BYTES)
      .slice(0, MAX_ASSETS_PER_SKILL)
      .map((e) => e.name!);
  } catch {
    return [];
  }
}

/** One tree request per source yields every `<dir>/SKILL.md` in the repo. */
async function listSource(source: MarketSourceInfo): Promise<MarketSkillInfo[]> {
  const url = `https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(source.branch)}?recursive=1`;
  const text = await fetchText(url, 'application/vnd.github+json');
  let json: TreeResponse;
  try {
    json = JSON.parse(text) as TreeResponse;
  } catch {
    throw new Error('仓库目录解析失败（可能触发了 GitHub 限流）');
  }
  if (!Array.isArray(json.tree)) throw new Error(json.message || '仓库目录不可用');

  const prefix = source.skillsPath ? `${source.skillsPath}/` : '';
  const byDir = new Map<string, { skillFile?: TreeEntry; assets: number; bytes: number }>();
  for (const entry of json.tree) {
    if (entry.type !== 'blob' || !entry.path) continue;
    if (prefix && !entry.path.startsWith(prefix)) continue;
    const rest = prefix ? entry.path.slice(prefix.length) : entry.path;
    const segments = rest.split('/');
    const file = segments.pop() ?? '';
    const dir = segments.join('/');
    if (!dir) continue;
    let bucket = byDir.get(dir);
    if (!bucket) {
      bucket = { assets: 0, bytes: 0 };
      byDir.set(dir, bucket);
    }
    bucket.bytes += entry.size ?? 0;
    if (file === SKILL_FILE) bucket.skillFile = entry;
    else bucket.assets += 1;
  }

  const skills: MarketSkillInfo[] = [];
  for (const [dir, bucket] of byDir) {
    if (!bucket.skillFile) continue;
    const dirName = dir.split('/').pop() || dir;
    skills.push({
      id: `${source.id}/${dir}`,
      sourceId: source.id,
      name: dirName,
      path: bucket.skillFile.path,
      description: '',
      assetCount: bucket.assets,
      bytes: bucket.bytes,
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function createSkillsMarketService(options: SkillsMarketServiceOptions) {
  function resolveRoot(scope: SkillScope): string | null {
    if (scope === 'global') {
      const root = path.normalize(options.getGlobalSkillsRoot());
      return root ? root : null;
    }
    const workspace = options.getWorkspacePath().trim();
    if (!workspace) return null;
    return path.join(path.normalize(workspace), '.claude', 'skills');
  }

  function resolveSkillDir(
    scope: SkillScope,
    name: string,
  ): { root: string; dir: string; file: string } | null {
    const root = resolveRoot(scope);
    if (!root) return null;
    if (!NAME_PATTERN.test(name)) return null;
    const dir = path.join(root, name);
    if (!withinRoot(root, dir)) return null;
    return { root, dir, file: path.join(dir, SKILL_FILE) };
  }

  function resolveAssetPath(dir: string, relPath: string): string | null {
    const segments = relPath.split('/').filter(Boolean);
    if (!segments.length) return null;
    if (segments.some((seg) => seg === '.' || seg === '..')) return null;
    const target = path.join(dir, ...segments);
    return withinRoot(dir, target) ? target : null;
  }

  return {
    async list(): Promise<MarketListResult> {
      const errors: Record<string, string> = {};
      const results = await Promise.all(
        MARKET_SOURCES.map(async (source) => {
          try {
            return await listSource(source);
          } catch (e) {
            errors[source.id] = String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, '');
            return [] as MarketSkillInfo[];
          }
        }),
      );
      return {
        ok: Object.keys(errors).length < MARKET_SOURCES.length,
        sources: MARKET_SOURCES.map((s) => ({ ...s })),
        skills: results.flat(),
        errors,
      };
    },

    /** Frontmatter name/description for a batch of skills (bounded by the caller). */
    async describe(ids: string[]): Promise<MarketDescribeResult> {
      const metas = await Promise.all(
        ids.map(async (id): Promise<MarketSkillMeta> => {
          const parsed = parseSkillId(id);
          if (!parsed) return { id, description: '', declaredName: '' };
          try {
            const text = await downloadText(
              rawUrl(parsed.source, `${parsed.relPath}/${SKILL_FILE}`),
              SKILL_MD_MAX_BYTES,
              'SKILL.md',
            );
            const fm = parseFrontmatter(text);
            return { id, description: fm.description, declaredName: fm.name };
          } catch {
            return { id, description: '', declaredName: '' };
          }
        }),
      );
      return { ok: true, metas };
    },

    async preview(req: MarketPreviewRequest): Promise<MarketPreviewResult> {
      const parsed = parseSkillId(req.id);
      if (!parsed) return { ok: false, error: '无效的技能标识' };
      try {
        const content = await downloadText(
          rawUrl(parsed.source, `${parsed.relPath}/${SKILL_FILE}`),
          SKILL_MD_MAX_BYTES,
          'SKILL.md',
        );
        const assets = parsed.source.supportsAssets ? await listAssets(parsed.source, parsed.relPath) : [];
        return { ok: true, content, assets };
      } catch (e) {
        return { ok: false, error: String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, '') };
      }
    },

    async install(req: MarketInstallRequest): Promise<MarketInstallResult> {
      const parsed = parseSkillId(req.id);
      if (!parsed) return { ok: false, error: '无效的技能标识' };
      const { source, relPath } = parsed;
      const dirName = relPath.split('/').pop() || '';
      const name = sanitizeSkillName(req.name?.trim() || dirName);
      const resolved = resolveSkillDir(req.scope, name);
      if (!resolved) {
        return {
          ok: false,
          error: req.scope === 'project' ? '未设置工作区，无法安装到项目级' : '无效的技能名',
        };
      }

      let exists = false;
      try {
        await fsp.access(resolved.file);
        exists = true;
      } catch {
        exists = false;
      }
      if (exists && !req.overwrite) {
        return { ok: false, conflict: true, name, error: `已存在同名技能「${name}」` };
      }

      try {
        const content = await downloadText(
          rawUrl(source, `${relPath}/${SKILL_FILE}`),
          SKILL_MD_MAX_BYTES,
          'SKILL.md',
        );
        const assets = source.supportsAssets ? await listAssets(source, relPath) : [];

        // Download everything before touching disk: a half-written skill dir
        // would be picked up by the engine's hot detection in a broken state.
        const downloaded: { rel: string; text: string }[] = [];
        for (const asset of assets) {
          try {
            const text = await downloadText(
              rawUrl(source, `${relPath}/${asset}`),
              SINGLE_FILE_MAX_BYTES,
              asset,
            );
            downloaded.push({ rel: asset, text });
          } catch {
            // Skip an unusable auxiliary file rather than failing the install.
          }
        }

        if (exists) await fsp.rm(resolved.dir, { recursive: true, force: true });
        await fsp.mkdir(resolved.dir, { recursive: true });
        await fsp.writeFile(resolved.file, content, 'utf8');
        const files = [SKILL_FILE];
        for (const item of downloaded) {
          const target = resolveAssetPath(resolved.dir, item.rel);
          if (!target) continue;
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await fsp.writeFile(target, item.text, 'utf8');
          files.push(item.rel);
        }
        return { ok: true, name, files, replaced: exists };
      } catch (e) {
        if (!exists) {
          try {
            await fsp.rm(resolved.dir, { recursive: true, force: true });
          } catch {
            /* ignore rollback failure */
          }
        }
        return { ok: false, error: String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, '') };
      }
    },
  };
}
