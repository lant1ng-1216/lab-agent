import { homedir } from 'node:os'
import path from 'node:path'

type Environment = Record<string, string | undefined>

/** Resolve the same per-user profile location used by Electron's userData. */
export function resolveLabAgentHome(
  platform: NodeJS.Platform = process.platform,
  env: Environment = process.env,
  homeDir = homedir(),
): string {
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const explicit = env.LAB_AGENT_HOME?.trim()
  if (explicit && pathApi.isAbsolute(explicit)) return pathApi.normalize(explicit)
  if (platform === 'darwin') {
    return pathApi.join(homeDir, 'Library', 'Application Support', 'Lab Agent', 'lab-coding-config')
  }
  if (platform === 'win32') {
    const appData = env.APPDATA?.trim() || path.win32.join(homeDir, 'AppData', 'Roaming')
    return path.win32.join(appData, 'Lab Agent', 'lab-coding-config')
  }
  const configHome = env.XDG_CONFIG_HOME?.trim() || path.posix.join(homeDir, '.config')
  return path.posix.join(configHome, 'Lab Agent', 'lab-coding-config')
}

/**
 * Set the engine's legacy storage alias to Lab Agent's own home and remove
 * inherited Claude Code/Cowork redirections before any engine config loads.
 */
export function initializeLabAgentEnvironment(): string {
  const home = resolveLabAgentHome()
  process.env.LAB_AGENT_HOME = home
  process.env.CLAUDE_CONFIG_DIR = home
  delete process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR
  delete process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE
  delete process.env.CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES
  delete process.env.CLAUDE_CODE_REMOTE
  delete process.env.CLAUDE_CODE_USE_COWORK_PLUGINS
  delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY
  delete process.env.CLAUDE_CODE_SIMPLE
  return home
}

/** Default read boundary shared by terminal sessions when no user settings override is supplied. */
export function labAgentMemoryGuardSettings(): string {
  return JSON.stringify({
    permissions: {
      deny: [
        'Read(~/.claude)',
        'Read(~/.claude/**)',
        'Grep(~/.claude)',
        'Grep(~/.claude/**)',
        'Glob(~/.claude)',
        'Glob(~/.claude/**)',
        'Bash(*.claude*)',
        'PowerShell(*.claude*)',
      ],
    },
    sandbox: { filesystem: { denyRead: ['~/.claude'] } },
  })
}
