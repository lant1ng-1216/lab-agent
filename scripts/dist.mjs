/**
 * Full desktop release: engines → app build → electron-builder (mac arm64, win x64, linux x64).
 * macOS uses zip (adhoc-signed .app); DMG is skipped because hdiutil is unreliable in some CI/agent envs.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

run('npx', ['electron-builder', '--mac', '--arm64', '--publish', 'never']);
run('node', ['scripts/verify-mac-sign.mjs']);

// Ensure a ditto zip exists (electron-builder zip target also works; ditto preserves signatures well)
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const macZip = path.join(root, `release/Lab-Agent-${ver}-mac-arm64.zip`);
const app = path.join(root, 'release/mac-arm64/Lab Agent.app');
if (!fs.existsSync(macZip) && fs.existsSync(app)) {
  run('ditto', ['-c', '-k', '--keepParent', app, macZip]);
}

run('npx', ['electron-builder', '--win', '--x64', '--publish', 'never']);
run('npx', ['electron-builder', '--linux', '--x64', '--publish', 'never']);

console.log('[dist] artifacts in release/');
