/**
 * Post-build gate: mac DMG app must pass codesign --verify --deep --strict.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'release/mac-arm64/Lab Agent.app');

if (!fs.existsSync(app)) {
  console.error('[verify-mac] missing', app);
  process.exit(1);
}

const r = spawnSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
  stdio: 'inherit',
});
if (r.status !== 0) {
  console.error('[verify-mac] FAIL — do not publish this build');
  process.exit(r.status ?? 1);
}
console.log('[verify-mac] OK');
