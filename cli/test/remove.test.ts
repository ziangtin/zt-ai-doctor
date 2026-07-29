import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, exists, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { removeCommand } from '../src/commands/remove.js';
import { runSync } from '../src/commands/sync.js';
import { readLockfile } from '../src/core/lockfile.js';
import { lockfilePath } from '../src/core/paths.js';
import { UsageError } from '../src/core/errors.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';
beforeEach(async () => {
  project = await makeTempDir('rm');
  market = await makeTempDir('rmmkt');
});
afterEach(async () => {
  if (project) await rmrf(project);
  if (market) await rmrf(market);
});

const ASSETS: AssetSpec[] = [
  { id: 'rule-a', type: 'rule', body: 'Rule A' },
  { id: 'rule-b', type: 'rule', body: 'Rule B' },
];

describe('remove', () => {
  it('移除资产 + lockfile + sync GC 清理受管目标', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-a', 'rule-b'], { market, copy: true });
    await fs.mkdir(path.join(project, '.cursor'), { recursive: true });
    await runSync(project, { agent: 'cursor', copy: true });
    const aMdc = path.join(project, '.cursor', 'rules', 'rule-a.mdc');
    const bMdc = path.join(project, '.cursor', 'rules', 'rule-b.mdc');
    expect(await exists(aMdc)).toBe(true);
    expect(await exists(bMdc)).toBe(true);

    await removeCommand(project, 'rule-b', { agent: 'cursor', copy: true });

    // .agents 文件删
    expect(await exists(path.join(project, '.agents', 'rules', 'rule-b.md'))).toBe(false);
    expect(await exists(path.join(project, '.agents', 'rules', 'rule-a.md'))).toBe(true);
    // lockfile 移除
    const lock = await readLockfile(lockfilePath(project));
    expect(lock?.assets.find((a) => a.id === 'rule-b')).toBeUndefined();
    expect(lock?.assets.find((a) => a.id === 'rule-a')).toBeTruthy();
    // GC 清理 rule-b.mdc，保留 rule-a.mdc
    expect(await exists(bMdc)).toBe(false);
    expect(await exists(aMdc)).toBe(true);
  });

  it('未安装资产抛 UsageError', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await expect(removeCommand(project, 'nope', {})).rejects.toThrow(UsageError);
  });

  it('未建档抛 UsageError', async () => {
    await expect(removeCommand(project, 'x', {})).rejects.toThrow(UsageError);
  });
});
