import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import type { AgentConfig } from './agentConfig.js';

const pExecFile = promisify(execFile);

export interface EnvDetectResult {
  agent: string;
  installed: boolean;
  /** 命中信号（人读），如 "claude@PATH"、"~/.claude"、"registry:Cursor" */
  signals: string[];
}

/** PATH 查找可执行（不带扩展名时，Windows 自动试 PATHEXT）。返回命中路径或 null。 */
export function lookpath(name: string): string | null {
  const pathVar = process.env.PATH ?? '';
  if (!pathVar) return null;
  const dirs = pathVar.split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
      : [''];
  const flag = process.platform === 'win32' ? fsSync.constants.F_OK : fsSync.constants.X_OK;
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, process.platform === 'win32' ? name + ext : name);
      try {
        fsSync.accessSync(candidate, flag);
        return candidate;
      } catch {
        // continue
      }
    }
  }
  return null;
}

/** 检查 home 下路径或 glob 是否存在。返回命中路径或 null。 */
export async function checkGlobalDir(pattern: string, homeDir = os.homedir()): Promise<string | null> {
  const rel = pattern.replace(/^~[\\/]/, '');
  if (/[*?[\]{}]/.test(rel)) {
    const matches = await fg(rel, { cwd: homeDir, dot: true, onlyFiles: false });
    return matches.length > 0 ? path.join(homeDir, matches[0]) : null;
  }
  const full = path.join(homeDir, rel);
  try {
    await fsSync.promises.access(full);
    return full;
  } catch {
    return null;
  }
}

/** Windows 卸载项 DisplayName 子串匹配。非 Windows 返回 null。 */
export async function checkRegistry(name: string): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  for (const key of keys) {
    try {
      const { stdout } = await pExecFile('reg', ['query', key, '/s', '/f', name, '/d'], {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      if (stdout.includes(name)) return `registry:${name}`;
    } catch {
      // key missing or no match -> continue
    }
  }
  return null;
}

/** 环境探测单个 agent：PATH + 全局目录 + 注册表三类信号。 */
export async function detectAgentEnv(
  cfg: AgentConfig,
  homeDir = os.homedir(),
): Promise<EnvDetectResult> {
  const signals: string[] = [];

  for (const exe of cfg.env.executables) {
    const p = lookpath(exe);
    if (p) signals.push(`${exe}@PATH`);
  }

  for (const dir of cfg.env.globalDirs) {
    const p = await checkGlobalDir(dir, homeDir);
    if (p) signals.push(p.replace(homeDir, '~'));
  }

  for (const regName of cfg.env.registryNames) {
    const p = await checkRegistry(regName);
    if (p) signals.push(p);
  }

  return { agent: cfg.name, installed: signals.length > 0, signals };
}

/** 批量环境探测。 */
export async function detectAllEnv(
  configs: AgentConfig[],
  homeDir = os.homedir(),
): Promise<EnvDetectResult[]> {
  return Promise.all(configs.map((c) => detectAgentEnv(c, homeDir)));
}
