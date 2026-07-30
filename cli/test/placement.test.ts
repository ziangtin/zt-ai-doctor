import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, exists, readText, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { runSync } from '../src/commands/sync.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';

async function setup(assets: AssetSpec[]): Promise<void> {
  project = await makeTempDir('place');
  market = await makeTempDir('mkt');
  await makeMarket(market, assets);
  await initCommand(project, { market });
}

afterEach(async () => {
  if (project) await rmrf(project);
  if (market) await rmrf(market);
});

describe('受管放置 (copy 模式)', () => {
  it('copy 降级后改 canonical 重同步会更新（评审 2.1 核心承诺）', async () => {
    await setup([{ id: 'react-ts', type: 'rule', body: 'Use React 18 with TS strict.' }]);
    await treatCommand(project, ['react-ts'], { market, copy: true });
    await runSync(project, { agent: 'claude', copy: true });
    const claudeRule = path.join(project, '.claude', 'rules', 'react-ts.md');
    expect(await exists(claudeRule)).toBe(true);

    // 改 canonical 源
    await fs.appendFile(path.join(project, '.agents', 'rules', 'react-ts.md'), '\n\n## NEW MARKER\n');
    await runSync(project, { agent: 'claude', copy: true });
    expect(await readText(claudeRule)).toContain('NEW MARKER');
  });

  it('用户手改目标文件后重同步不覆盖（conflict 保护）', async () => {
    await setup([{ id: 'react-ts', type: 'rule', body: 'Use React 18 with TS strict.' }]);
    await treatCommand(project, ['react-ts'], { market, copy: true });
    await runSync(project, { agent: 'claude', copy: true });
    const claudeRule = path.join(project, '.claude', 'rules', 'react-ts.md');
    const before = await readText(claudeRule);
    await fs.appendFile(claudeRule, '\nUSER EDIT\n');
    await runSync(project, { agent: 'claude', copy: true });
    const after = await readText(claudeRule);
    expect(after).toContain('USER EDIT');
    expect(after).toBe(before + '\nUSER EDIT\n');
  });

  it('资产删除后 GC 清理旧受管目标（仅未用户改过）', async () => {
    await setup([
      { id: 'rule-a', type: 'rule', body: 'Rule A body' },
      { id: 'rule-b', type: 'rule', body: 'Rule B body' },
    ]);
    await treatCommand(project, ['rule-a', 'rule-b'], { market, copy: true });
    await fs.mkdir(path.join(project, '.cursor'), { recursive: true });
    await runSync(project, { agent: 'cursor', copy: true });
    const aMdc = path.join(project, '.cursor', 'rules', 'rule-a.mdc');
    const bMdc = path.join(project, '.cursor', 'rules', 'rule-b.mdc');
    expect(await exists(aMdc)).toBe(true);
    expect(await exists(bMdc)).toBe(true);

    await fs.rm(path.join(project, '.agents', 'rules', 'rule-a.md'));
    await runSync(project, { agent: 'cursor', copy: true });
    expect(await exists(aMdc)).toBe(false); // GC 清理
    expect(await exists(bMdc)).toBe(true); // 保留
  });

  it('非活跃 agent 的受管目标不被 GC', async () => {
    await setup([{ id: 'rule-a', type: 'rule', body: 'Rule A body' }]);
    await treatCommand(project, ['rule-a'], { market, copy: true });
    await fs.mkdir(path.join(project, '.claude'), { recursive: true });
    await fs.mkdir(path.join(project, '.cursor'), { recursive: true });
    await runSync(project, { copy: true });
    const claudeRule = path.join(project, '.claude', 'rules', 'rule-a.md');
    const cursorMd = path.join(project, '.cursor', 'rules', 'rule-a.mdc');
    expect(await exists(claudeRule)).toBe(true);
    expect(await exists(cursorMd)).toBe(true);

    // 仅 sync claude -> cursor 目标应保留
    await runSync(project, { agent: 'claude', copy: true });
    expect(await exists(claudeRule)).toBe(true);
    expect(await exists(cursorMd)).toBe(true);
  });

  it('symlink 模式放置（环境支持时，否则跳过）', async () => {
    await setup([{ id: 'react-ts', type: 'rule', body: 'Use React 18.' }]);
    // 探测环境是否支持 symlink（Windows 默认无权限）
    const probe = path.join(project, '.agents', 'rules', '.probe');
    const link = path.join(project, '.agents', 'rules', '.probe-link');
    await fs.writeFile(probe, 'x');
    try {
      await fs.symlink('.probe', link, 'file');
    } catch {
      return; // 环境不支持 symlink
    }
    await fs.rm(link, { force: true });
    await fs.rm(probe, { force: true });

    await treatCommand(project, ['react-ts'], { market });
    await runSync(project, { agent: 'claude' });
    const claudeRule = path.join(project, '.claude', 'rules', 'react-ts.md');
    expect(await exists(claudeRule)).toBe(true);
    expect((await fs.lstat(claudeRule)).isSymbolicLink()).toBe(true);
  });
});
