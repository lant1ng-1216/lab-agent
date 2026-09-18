import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const VITE_PORT = 5173;

const mode = process.argv[2] === 'desktop' ? 'desktop' : 'dev';

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect({ port, host }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await portOpen(port, host)) return resolve(true);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timeout waiting for :${port}`));
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
  });
}

function electronBinary() {
  if (process.platform === 'darwin') {
    return path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  }
  if (process.platform === 'win32') {
    return path.join(root, 'node_modules/electron/dist/electron.exe');
  }
  return path.join(root, 'node_modules/electron/dist/electron');
}

function underCursor() {
  return Boolean(
    process.env.CURSOR_AGENT ||
      process.env.CURSOR_LAYOUT ||
      process.env.CURSOR_WORKSPACE_LABEL ||
      process.env.VSCODE_PID ||
      process.env.ELECTRON_RUN_AS_NODE === '1',
  );
}

function electronEnv() {
  const env = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  return env;
}

let viteOwned = false;

function launchElectron() {
  const bin = electronBinary();
  if (!fs.existsSync(bin)) {
    throw new Error(`Electron binary missing: ${bin}`);
  }

  if (underCursor()) {
    console.log('');
    console.log('⚠  检测到在 Cursor 里启动桌面端。');
    console.log('   请在系统「终端」里执行：');
    console.log(`   cd ${root} && npm run desktop`);
    console.log('');
  }

  const child = spawn(bin, [root], {
    cwd: root,
    stdio: 'inherit',
    env: electronEnv(),
  });
  console.log('[dev] electron pid', child.pid);
  child.on('exit', (code, signal) => {
    if (signal === 'SIGABRT' || code === 134) {
      console.error('[dev] Electron SIGABRT — 请改用系统终端运行: npm run desktop');
    }
    if (!viteOwned) {
      process.exit(code ?? 1);
    } else {
      console.log('[dev] Electron closed. Vite still on :5173 — Ctrl+C to stop.');
    }
  });
  return child;
}

async function ensureVite() {
  if (await portOpen(VITE_PORT)) {
    let matchesWorkspace = false;
    try {
      const response = await fetch(`http://127.0.0.1:${VITE_PORT}/__lab-agent-origin`);
      if (response.ok) {
        const info = await response.json();
        matchesWorkspace = path.resolve(info.root || '') === root;
      }
    } catch {
      /* The port may belong to an unrelated or older dev server. */
    }
    if (matchesWorkspace) {
      console.log(`[dev] reuse this checkout's Vite on :${VITE_PORT} (browser preview kept)`);
      return null;
    }
    throw new Error(
      `Port :${VITE_PORT} is occupied by an unverified/stale server. Stop the existing Vite/desktop dev process, then rerun npm run desktop so this checkout is used.`,
    );
  }

  console.log(`[dev] starting Vite on :${VITE_PORT}…`);
  const vite = spawn('npx', ['vite', '--config', 'vite.config.ts'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  await waitForPort(VITE_PORT);
  console.log('[dev] vite ready');
  return vite;
}

async function main() {
  await run('npx', ['tsc', '-p', 'tsconfig.json']);
  await run('node', ['scripts/copy-lab-coding.mjs']);

  // desktop / dev: both reuse Vite if up, otherwise start it
  const vite = await ensureVite();
  viteOwned = Boolean(vite);

  const electron = launchElectron();
  console.log(`[dev] mode=${mode}; :${VITE_PORT} ${viteOwned ? 'started' : 'reused'}`);

  if (vite) {
    const shutdown = () => {
      try { electron.kill(); } catch { /* ignore */ }
      try { vite.kill(); } catch { /* ignore */ }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    vite.on('exit', (code) => process.exit(code ?? 0));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
