/**
 * Full desktop release: engines → app build → electron-builder (mac arm64, win x64, linux x64).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args) {
  console.log(`[dist] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('node', ['scripts/prepare-engines.mjs']);
run('npm', ['run', 'build']);

// Separate invocations so --arch flags do not bleed across platforms
run('npx', ['electron-builder', '--mac', '--arm64', '--publish', 'never']);
run('npx', ['electron-builder', '--win', '--x64', '--publish', 'never']);
run('npx', ['electron-builder', '--linux', '--x64', '--publish', 'never']);

console.log('[dist] artifacts in release/');
