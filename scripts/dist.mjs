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

const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const macZip = path.join(root, `release/Lab-Agent-${ver}-mac-arm64.zip`);
const app = path.join(root, 'release/mac-arm64/Lab Agent.app');
const firstOpen = path.join(root, 'scripts/mac-first-open.command');

// Always rebuild mac zip with helper script beside the .app (signature-safe via ditto)
if (fs.existsSync(app)) {
  const stage = path.join(root, 'release/mac-zip-stage');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  run('ditto', [app, path.join(stage, 'Lab Agent.app')]);
  if (fs.existsSync(firstOpen)) {
    fs.copyFileSync(firstOpen, path.join(stage, 'mac-first-open.command'));
    fs.chmodSync(path.join(stage, 'mac-first-open.command'), 0o755);
  }
  fs.rmSync(macZip, { force: true });
  // zip folder contents so unzip yields Lab Agent.app + helper at top level
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', stage, macZip]);
  // ditto --keepParent wraps stage/ — flatten: re-zip from inside stage
  fs.rmSync(macZip, { force: true });
  const r = spawnSync(
    'ditto',
    ['-c', '-k', '--sequesterRsrc', '.', macZip],
    { cwd: stage, stdio: 'inherit' },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
  fs.rmSync(stage, { recursive: true, force: true });
  console.log('[dist] mac zip →', macZip);
}

run('npx', ['electron-builder', '--win', '--x64', '--publish', 'never']);
run('npx', ['electron-builder', '--linux', '--x64', '--publish', 'never']);

console.log('[dist] artifacts in release/');
