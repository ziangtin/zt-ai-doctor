import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, rmrf } from './helpers.js';
import { lookpath, checkGlobalDir, checkRegistry, detectAgentEnv } from '../src/core/envDetect.js';
import type { AgentConfig } from '../src/core/agentConfig.js';
import { detectCommand } from '../src/commands/detect.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let home = '';
beforeEach(async () => {
  home = await makeTempDir('home');
});
afterEach(async () => {
  if (home) await rmrf(home);
});

describe('lookpath', () => {
  it('node 在 PATH 上应能找到', () => {
    expect(lookpath('node')).not.toBeNull();
  });
  it('不存在的可执行返回 null', () => {
    expect(lookpath('definitely-not-a-real-exe-zzz-123')).toBeNull();
  });
});

describe('checkGlobalDir', () => {
  it('存在的目录返回路径', async () => {
    await fs.mkdir(path.join(home, '.claude'), { recursive: true });
    expect(await checkGlobalDir('.claude', home)).toBe(path.join(home, '.claude'));
  });
  it('不存在的目录返回 null', async () => {
    expect(await checkGlobalDir('.nope', home)).toBeNull();
  });
  it('glob 命中扩展目录', async () => {
    await fs.mkdir(path.join(home, '.vscode', 'extensions', 'github.copilot-1.2.3'), {
      recursive: true,
    });
    const p = await checkGlobalDir('.vscode/extensions/github.copilot-*', home);
    expect(p).toBeTruthy();
    expect(p).toContain('github.copilot-1.2.3');
  });
  it('glob 无匹配返回 null', async () => {
    expect(await checkGlobalDir('.vscode/extensions/foo-*', home)).toBeNull();
  });
});

describe('checkRegistry', () => {
  it('不存在的应用返回 null 且不抛错', async () => {
    const r = await checkRegistry('DefinitelyNotAnApp_zzz_123');
    expect(r).toBeNull();
  });
});

describe('detectAgentEnv', () => {
  it('仅 globalDirs 命中 -> installed=true 且信号含 ~/', async () => {
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    const cfg: AgentConfig = {
      name: 'codex',
      markers: ['AGENTS.md'],
      supports: ['rule'],
      env: { executables: [], globalDirs: ['.codex'], registryNames: [] },
      mappings: {},
    };
    const r = await detectAgentEnv(cfg, home);
    expect(r.installed).toBe(true);
    expect(r.signals.some((s) => s.startsWith('~'))).toBe(true);
  });
  it('无任何信号 -> installed=false', async () => {
    const cfg: AgentConfig = {
      name: 'x',
      markers: ['x'],
      supports: [],
      env: { executables: [], globalDirs: ['.nope'], registryNames: [] },
      mappings: {},
    };
    const r = await detectAgentEnv(cfg, home);
    expect(r.installed).toBe(false);
    expect(r.signals).toHaveLength(0);
  });
});

describe('detect 命令 --json', () => {
  it('输出 6 个 agent 的 JSON 结构', async () => {
    vi.mocked(console.log).mockClear();
    await detectCommand(home, { json: true });
    const out = vi.mocked(console.log).mock.calls.at(-1)?.[0] as string;
    const parsed = JSON.parse(out) as Array<{ agent: string; installed: boolean; signals: string[] }>;
    expect(parsed).toHaveLength(8);
    expect(parsed.map((r) => r.agent)).toEqual(
      expect.arrayContaining(['claude', 'cursor', 'copilot', 'codex', 'cline', 'windsurf', 'trae', 'lingma']),
    );
    for (const r of parsed) {
      expect(typeof r.installed).toBe('boolean');
      expect(Array.isArray(r.signals)).toBe(true);
    }
  });
});
