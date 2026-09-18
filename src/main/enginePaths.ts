import fs from 'node:fs'
import path from 'node:path'

export function engineBinaryName(platform: string): string {
  return platform === 'win32' ? 'cli-dev.exe' : 'cli-dev'
}

export function engineRootCandidates(options: {
  platform: string
  arch: string
  resourcesPath?: string
  repoRoot: string
  cwd: string
}): string[] {
  const roots = [
    options.resourcesPath ? path.join(options.resourcesPath, 'lab-coding') : '',
    path.join(options.repoRoot, 'agents/lab-coding'),
    path.join(options.repoRoot, 'packaging/engine', `${options.platform}-${options.arch}`),
    path.join(options.cwd, 'agents/lab-coding'),
  ].filter(Boolean)
  return [...new Set(roots.map((root) => path.resolve(root)))]
}

export function findEngineRoot(
  candidates: readonly string[],
  platform: string,
  exists: (file: string) => boolean = fs.existsSync,
): string {
  const binaryName = engineBinaryName(platform)
  return candidates.find((root) => exists(path.join(root, binaryName))) || candidates[0] || ''
}
