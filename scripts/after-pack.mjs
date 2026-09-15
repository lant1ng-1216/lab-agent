/**
 * electron-builder afterPack: ensure macOS .app is deeply ad-hoc signed
 * and passes `codesign --verify --deep --strict` (hard gate).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[after-pack] ad-hoc deep sign: ${appPath}`);
  const sign = spawnSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', appPath],
    { stdio: 'inherit' },
  );
  if (sign.status !== 0) {
    throw new Error(`[after-pack] codesign failed with status ${sign.status}`);
  }

  console.log(`[after-pack] verify: ${appPath}`);
  const verify = spawnSync(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { stdio: 'inherit' },
  );
  if (verify.status !== 0) {
    throw new Error(
      `[after-pack] codesign --verify FAILED — refusing to ship a Gatekeeper-"damaged" build`,
    );
  }
  console.log('[after-pack] codesign verify OK');
}
