/**
 * First-run install helpers: copy into a stable location + Desktop shortcut.
 * Mac: /Applications + Desktop alias (users should not need to drag manually).
 * Win: %LOCALAPPDATA%\\Programs\\Lab Agent + Desktop .lnk
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { App } from 'electron';

export type InstallStatus = {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** Running from Downloads / App Translocation / not the stable install path */
  needsInstall: boolean;
  /** Stable install exists (or will) but Desktop shortcut missing */
  needsDesktopShortcut: boolean;
  currentAppPath: string;
  targetAppPath: string;
  desktopShortcutPath: string;
  hint: string;
};

function macBundleFromExe(exePath: string): string {
  // .../Lab Agent.app/Contents/MacOS/Lab Agent → .../Lab Agent.app
  return path.resolve(exePath, '../../..');
}

function winDirFromExe(exePath: string): string {
  // .../Lab Agent.exe → folder containing the unpacked app
  return path.dirname(exePath);
}

export function resolveInstallPaths(app: App): {
  currentAppPath: string;
  targetAppPath: string;
  desktopShortcutPath: string;
} {
  if (process.platform === 'darwin') {
    const current = app.isPackaged ? macBundleFromExe(app.getPath('exe')) : '';
    const target = '/Applications/Lab Agent.app';
    const desktop = path.join(app.getPath('desktop'), 'Lab Agent');
    return { currentAppPath: current, targetAppPath: target, desktopShortcutPath: desktop };
  }
  if (process.platform === 'win32') {
    const current = app.isPackaged ? winDirFromExe(app.getPath('exe')) : '';
    const target = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Lab Agent');
    const desktop = path.join(app.getPath('desktop'), 'Lab Agent.lnk');
    return { currentAppPath: current, targetAppPath: target, desktopShortcutPath: desktop };
  }
  // Linux: ~/.local/share/Lab Agent + desktop entry optional later
  const current = app.isPackaged ? path.dirname(app.getPath('exe')) : '';
  const target = path.join(os.homedir(), '.local', 'share', 'Lab Agent');
  const desktop = path.join(os.homedir(), 'Desktop', 'Lab Agent.desktop');
  return { currentAppPath: current, targetAppPath: target, desktopShortcutPath: desktop };
}

function isUnstableLocation(appPath: string): boolean {
  if (!appPath) return false;
  const lower = appPath.toLowerCase();
  if (lower.includes('/apptranslocation/')) return true;
  if (lower.includes('/downloads/') || lower.includes('\\downloads\\')) return true;
  if (lower.includes('/desktop/') && !lower.startsWith('/applications/')) {
    // Running a copy left on Desktop after unzip is fine for open, but still offer install
    // Only flag Desktop if it's clearly an unzipped folder name
    if (/lab-agent-\d/i.test(lower)) return true;
  }
  return false;
}

function desktopShortcutExists(shortcutPath: string): boolean {
  try {
    if (fs.existsSync(shortcutPath)) return true;
    // Finder aliases sometimes appear as "Lab Agent.app" on Desktop
    if (process.platform === 'darwin') {
      const alt = `${shortcutPath}.app`;
      if (fs.existsSync(alt)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function getInstallStatus(app: App): InstallStatus {
  const { currentAppPath, targetAppPath, desktopShortcutPath } = resolveInstallPaths(app);
  const packaged = app.isPackaged;
  const platform = process.platform;

  if (!packaged) {
    return {
      packaged,
      platform,
      needsInstall: false,
      needsDesktopShortcut: false,
      currentAppPath,
      targetAppPath,
      desktopShortcutPath,
      hint: '',
    };
  }

  if (platform !== 'darwin' && platform !== 'win32') {
    return {
      packaged,
      platform,
      needsInstall: false,
      needsDesktopShortcut: false,
      currentAppPath,
      targetAppPath,
      desktopShortcutPath,
      hint: '',
    };
  }

  const inTarget =
    platform === 'darwin'
      ? currentAppPath === targetAppPath || currentAppPath.toLowerCase() === targetAppPath.toLowerCase()
      : currentAppPath === targetAppPath || currentAppPath.startsWith(targetAppPath + path.sep);

  const unstable = isUnstableLocation(currentAppPath);
  const needsInstall = Boolean(currentAppPath) && (!inTarget || unstable);
  const needsDesktopShortcut = !desktopShortcutExists(desktopShortcutPath);

  let hint = '';
  if (needsInstall) {
    hint =
      platform === 'darwin'
        ? '点一下即可安装到「应用程序」，并在桌面放上打开图标。'
        : '点一下即可安装到本机，并在桌面创建快捷方式。';
  } else if (needsDesktopShortcut) {
    hint = '在桌面放上 Lab Agent 图标，方便下次打开。';
  }

  return {
    packaged,
    platform,
    needsInstall,
    needsDesktopShortcut,
    currentAppPath,
    targetAppPath,
    desktopShortcutPath,
    hint,
  };
}

function copyDirRecursive(src: string, dest: string) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: false });
}

function clearMacQuarantine(appPath: string) {
  try {
    execFileSync('xattr', ['-cr', appPath], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

function createMacDesktopAlias(targetApp: string, desktopAliasBase: string) {
  // Remove stale shortcuts
  for (const p of [desktopAliasBase, `${desktopAliasBase}.app`]) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  const script = `
set targetPosix to "${targetApp.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
set deskPosix to "${path.dirname(desktopAliasBase).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
tell application "Finder"
  set targetFile to (POSIX file targetPosix) as alias
  set deskFolder to (POSIX file deskPosix) as alias
  try
    set old to deskFolder as string & "Lab Agent"
    delete (alias file old)
  end try
  try
    set oldApp to deskFolder as string & "Lab Agent.app"
    delete (alias file oldApp)
  end try
  make new alias file at deskFolder to targetFile with properties {name:"Lab Agent"}
end tell
`;
  execFileSync('osascript', ['-e', script], { stdio: 'ignore' });
}

function createWinDesktopShortcut(targetDir: string, shortcutPath: string): void {
  const exe = path.join(targetDir, 'Lab Agent.exe');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shell } = require('electron') as typeof import('electron');
  try {
    if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath);
  } catch {
    /* ignore */
  }
  const ok = shell.writeShortcutLink(shortcutPath, {
    target: exe,
    cwd: targetDir,
    description: 'Lab Agent',
    icon: exe,
    iconIndex: 0,
  });
  if (!ok) throw new Error('无法创建桌面快捷方式');
}

export function ensureDesktopShortcut(app: App, status?: InstallStatus): { ok: boolean; error?: string } {
  const s = status || getInstallStatus(app);
  try {
    if (process.platform === 'darwin') {
      const target = fs.existsSync(s.targetAppPath) ? s.targetAppPath : s.currentAppPath;
      if (!target || !fs.existsSync(target)) return { ok: false, error: '找不到 Lab Agent.app' };
      createMacDesktopAlias(target, s.desktopShortcutPath);
      return { ok: true };
    }
    if (process.platform === 'win32') {
      const target = fs.existsSync(s.targetAppPath) ? s.targetAppPath : s.currentAppPath;
      if (!target || !fs.existsSync(target)) return { ok: false, error: '找不到安装目录' };
      createWinDesktopShortcut(target, s.desktopShortcutPath);
      return { ok: true };
    }
    return { ok: false, error: '当前系统暂不支持一键安装' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function installToStableLocation(app: App): { ok: boolean; error?: string; relaunchPath?: string } {
  const status = getInstallStatus(app);
  if (!app.isPackaged) return { ok: false, error: '开发模式无需安装' };
  if (!status.currentAppPath || !fs.existsSync(status.currentAppPath)) {
    return { ok: false, error: '找不到当前应用包' };
  }

  try {
    if (process.platform === 'darwin') {
      copyDirRecursive(status.currentAppPath, status.targetAppPath);
      clearMacQuarantine(status.targetAppPath);
      const desk = ensureDesktopShortcut(app, { ...status, needsInstall: false });
      if (!desk.ok) return { ok: false, error: desk.error || '桌面图标创建失败' };
      return {
        ok: true,
        relaunchPath: path.join(status.targetAppPath, 'Contents', 'MacOS', 'Lab Agent'),
      };
    }
    if (process.platform === 'win32') {
      copyDirRecursive(status.currentAppPath, status.targetAppPath);
      const desk = ensureDesktopShortcut(app, { ...status, needsInstall: false });
      if (!desk.ok) return { ok: false, error: desk.error || '桌面快捷方式创建失败' };
      return {
        ok: true,
        relaunchPath: path.join(status.targetAppPath, 'Lab Agent.exe'),
      };
    }
    return { ok: false, error: '当前系统暂不支持一键安装' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function relaunchFrom(app: App, execPath: string) {
  app.relaunch({ execPath });
  app.exit(0);
}
