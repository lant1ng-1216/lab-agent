/**
 * Cross-compile Lab Code (cli-dev) for desktop installers.
 * Output: packaging/engine/<platform-arch>/{cli-dev[.exe], lab-agent.env.example}
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = path.join(root, 'agents/lab-coding');
const outRoot = path.join(root, 'packaging/engine');

const targets = [
  { dir: 'darwin-arm64', bunTarget: 'bun-darwin-arm64', bin: 'cli-dev' },
  { dir: 'win32-x64', bunTarget: 'bun-windows-x64', bin: 'cli-dev.exe' },
  { dir: 'linux-x64', bunTarget: 'bun-linux-x64', bin: 'cli-dev' },
];

function run(cmd, args, cwd) {
  console.log(`[prepare-engines] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed with ${r.status}`);
  }
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

  const envExample = path.join(engineDir, 'lab-agent.env.example');
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(destDir, 'lab-agent.env.example'));
  }

  console.log(`[prepare-engines] → ${destBin} (${(fs.statSync(destBin).size / 1e6).toFixed(1)} MB)`);
}

console.log('[prepare-engines] done');
