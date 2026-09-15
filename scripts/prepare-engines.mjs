/**
 * Cross-compile Lab Code (cli-dev) for desktop installers.
 * Output: packaging/engine/<platform-arch>/{cli-dev[.exe], bin/rg[.exe], lab-agent.env.example}
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = path.join(root, 'agents/lab-coding');
const outRoot = path.join(root, 'packaging/engine');
const sdkRgRoot = path.join(
  engineDir,
  'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep',
);

const targets = [
  {
    dir: 'darwin-arm64',
    bunTarget: 'bun-darwin-arm64',
    bin: 'cli-dev',
    rgFrom: 'arm64-darwin/rg',
    rgTo: 'bin/rg',
  },
  {
    dir: 'win32-x64',
    bunTarget: 'bun-windows-x64',
    bin: 'cli-dev.exe',
    rgFrom: 'x64-win32/rg.exe',
    rgTo: 'bin/rg.exe',
  },
  {
    dir: 'linux-x64',
    bunTarget: 'bun-linux-x64',
    bin: 'cli-dev',
    rgFrom: 'x64-linux/rg',
    rgTo: 'bin/rg',
  },
];

function run(cmd, args, cwd) {
  console.log(`[prepare-engines] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed with ${r.status}`);
  }
}

function copyRipgrep(t, destDir) {
  const src = path.join(sdkRgRoot, t.rgFrom);
  if (!fs.existsSync(src)) {
    throw new Error(`[prepare-engines] missing ripgrep binary: ${src}`);
  }
  const dest = path.join(destDir, t.rgTo);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (!t.rgTo.endsWith('.exe')) fs.chmodSync(dest, 0o755);
  console.log(`[prepare-engines] → ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
}

fs.mkdirSync(outRoot, { recursive: true });

for (const t of targets) {
  const destDir = path.join(outRoot, t.dir);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  // Build into engine cwd as cli-dev / cli-dev.exe, then move
  const localName = t.bunTarget.includes('windows') ? 'cli-dev.exe' : 'cli-dev';
  for (const stale of ['cli-dev', 'cli-dev.exe', 'cli', 'cli.exe']) {
    const p = path.join(engineDir, stale);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  run('bun', ['run', './scripts/build.ts', '--dev', `--bun-target=${t.bunTarget}`], engineDir);

  const built = path.join(engineDir, localName);
  // Bun may write cli-dev without .exe then rename — check both
  const candidates = [built, path.join(engineDir, 'cli-dev'), path.join(engineDir, 'cli-dev.exe')];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`Engine binary missing after build for ${t.dir}`);
  }

  const destBin = path.join(destDir, t.bin);
  fs.renameSync(found, destBin);
  fs.chmodSync(destBin, 0o755);

  copyRipgrep(t, destDir);

  const envExample = path.join(engineDir, 'lab-agent.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(destDir, 'lab-agent.env.example'));
  }

  console.log(`[prepare-engines] → ${destBin} (${(fs.statSync(destBin).size / 1e6).toFixed(1)} MB)`);
}

console.log('[prepare-engines] done');
