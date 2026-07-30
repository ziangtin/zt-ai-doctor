import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { runSync } from '../src/commands/sync.js';
import { diagnoseCommand } from '../src/commands/diagnose.js';
import { findAssetById } from '../src/core/market.js';
import { readLockfile } from '../src/core/lockfile.js';
import { lockfilePath } from '../src/core/paths.js';

// diagnose 内部 detectAllEnv 真实探测 PATH/注册表很慢，mock 掉避免并发测试超时
vi.mock('../src/core/envDetect.js', () => ({
  detectAllEnv: async () => [],
  detectAgentEnv: async () => ({ agent: '', installed: false, signals: [] }),
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';
beforeEach(async () => {
  project = await makeTempDir('ver');
  market = await makeTempDir('vmkt');
});
afterEach(async () => {
  if (project) await rmrf(project);
  if (market) await rmrf(market);
});

/** 建多版本 market：同 id 多个版本文件 + manifest versions 多项 */
async function makeVersionedMarket(
  dir: string,
  id: string,
  versions: { version: string; body: string }[],
): Promise<void> {
  const entries: { version: string; path: string }[] = [];
  for (const v of versions) {
    const fname = `${id}-${v.version}.md`;
    const p = path.join(dir, 'rules', fname);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const fm = ['---', `id: ${id}`, 'type: rule', `version: ${v.version}`, '---', '', v.body, ''].join('\n');
    await fs.writeFile(p, fm, 'utf8');
    entries.push({ version: v.version, path: `rules/${fname}` });
  }
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ name: 'test-market', version: '0.1.0', assets: [{ id, type: 'rule', versions: entries }] }, null, 2),
    'utf8',
  );
}

describe('findAssetById 多版本', () => {
  it('缺省取最高 semver', async () => {
    await makeVersionedMarket(market, 'r', [
      { version: '1.0.0', body: 'v1' },
      { version: '1.2.0', body: 'v2' },
      { version: '1.1.0', body: 'v1.1' },
    ]);
    const a = await findAssetById(market, 'r');
    expect(a).not.toBeNull();
    expect(a!.meta.version).toBe('1.2.0');
    expect(a!.content.trim()).toBe('v2');
  });
  it('指定版本取该版本', async () => {
    await makeVersionedMarket(market, 'r', [
      { version: '1.0.0', body: 'v1' },
      { version: '1.2.0', body: 'v2' },
    ]);
    const a = await findAssetById(market, 'r', '1.0.0');
    expect(a).not.toBeNull();
    expect(a!.meta.version).toBe('1.0.0');
    expect(a!.content.trim()).toBe('v1');
  });
  it('版本不存在返回 null', async () => {
    await makeVersionedMarket(market, 'r', [{ version: '1.0.0', body: 'v1' }]);
    expect(await findAssetById(market, 'r', '9.9.9')).toBeNull();
  });
});

describe('treat --to 版本安装与回退', () => {
  it('treat --to 装指定版本，lockfile 记 version', async () => {
    await makeVersionedMarket(market, 'r', [
      { version: '1.0.0', body: 'v1' },
      { version: '1.2.0', body: 'v2' },
    ]);
    await initCommand(project, { market });
    await treatCommand(project, ['r'], { market, to: '1.0.0', copy: true });
    const lock = await readLockfile(lockfilePath(project));
    const le = lock!.assets.find((a) => a.id === 'r');
    expect(le?.version).toBe('1.0.0');
    const body = await fs.readFile(path.join(project, '.agents', 'rules', 'r.md'), 'utf8');
    expect(body).toContain('v1');
  });
  it('treat --to 无效版本抛错并列出可用版本', async () => {
    await makeVersionedMarket(market, 'r', [{ version: '1.0.0', body: 'v1' }]);
    await initCommand(project, { market });
    await expect(treatCommand(project, ['r'], { market, to: '9.9.9', copy: true })).rejects.toThrow(/无版本 9.9.9/);
  });
  it('回退：装 1.2.0 后 treat --to 1.0.0 覆盖', async () => {
    await makeVersionedMarket(market, 'r', [
      { version: '1.0.0', body: 'v1' },
      { version: '1.2.0', body: 'v2' },
    ]);
    await initCommand(project, { market });
    await treatCommand(project, ['r'], { market, copy: true }); // 默认装 1.2.0
    let lock = await readLockfile(lockfilePath(project));
    expect(lock!.assets.find((a) => a.id === 'r')?.version).toBe('1.2.0');
    // 回退到 1.0.0
    await treatCommand(project, ['r'], { market, to: '1.0.0', copy: true });
    lock = await readLockfile(lockfilePath(project));
    expect(lock!.assets.find((a) => a.id === 'r')?.version).toBe('1.0.0');
    const body = await fs.readFile(path.join(project, '.agents', 'rules', 'r.md'), 'utf8');
    expect(body).toContain('v1');
    expect(body).not.toContain('v2');
  });
});

describe('diagnose 版本滞后检测', () => {
  it('lockfile 旧版本 vs 药典新版本 -> 报滞后', async () => {
    await makeVersionedMarket(market, 'r', [
      { version: '1.0.0', body: 'v1' },
      { version: '1.2.0', body: 'v2' },
    ]);
    await initCommand(project, { market });
    await treatCommand(project, ['r'], { market, to: '1.0.0', copy: true });
    await diagnoseCommand(project, { market });
    const report = await fs.readFile(path.join(project, '.agents', '.build', 'diagnose-report.md'), 'utf8');
    expect(report).toMatch(/版本滞后/);
    expect(report).toMatch(/1\.0\.0 -> 1\.2\.0/);
  });
});

describe('旧格式 manifest 兼容', () => {
  it('legacy market（单 path）treat/sync 正常，lockfile 无 version', async () => {
    const assets: AssetSpec[] = [{ id: 'r', type: 'rule', body: 'legacy body' }];
    await makeMarket(market, assets, { legacy: true });
    await initCommand(project, { market });
    await treatCommand(project, ['r'], { market, copy: true });
    const lock = await readLockfile(lockfilePath(project));
    const le = lock!.assets.find((a) => a.id === 'r');
    expect(le).toBeTruthy();
    expect(le?.version).toBeUndefined();
    await runSync(project, { agent: 'claude', copy: true });
    const out = await fs.readFile(path.join(project, '.claude', 'rules', 'r.md'), 'utf8');
    expect(out).toContain('legacy body');
  });
});
