import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf } from './helpers.js';
import { UsageError } from '../src/core/errors.js';
import { validateManifest, validateAssetMeta, validateMcpBody, validateLockfile } from '../src/core/schema.js';
import { findAssetById } from '../src/core/market.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { runSync } from '../src/commands/sync.js';
import { trustCommand } from '../src/commands/trust.js';
import { diagnoseCommand } from '../src/commands/diagnose.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('schema 校验（纯函数）', () => {
  it('非法 id 被 manifest schema 拒绝', () => {
    expect(() =>
      validateManifest({ name: 'x', version: '0', assets: [{ id: 'a/b', type: 'rule', path: 'rules/a.md' }] }),
    ).toThrow(UsageError);
  });

  it('非法 frontmatter id 被拒绝', () => {
    expect(() => validateAssetMeta({ id: 'Bad Id', type: 'rule' })).toThrow(UsageError);
  });

  it('MCP body 缺 command 被拒绝', () => {
    expect(() => validateMcpBody({ args: ['x'] })).toThrow(UsageError);
  });

  it('lockfile schema 版本不兼容被拒绝', () => {
    expect(() =>
      validateLockfile({
        version: '1',
        market: { name: 'x', version: '0' },
        source: { type: 'local', uri: '', ref: '', integrity: '' },
        trustedMcp: [],
        assets: [],
      }),
    ).toThrow(UsageError);
  });
});

describe('market 加载边界', () => {
  let market = '';
  beforeEach(async () => {
    market = await makeTempDir('vmkt');
  });
  afterEach(async () => {
    if (market) await rmrf(market);
  });

  it('manifest 与 frontmatter id 不一致被拒绝', async () => {
    await fs.mkdir(path.join(market, 'rules'), { recursive: true });
    await fs.writeFile(path.join(market, 'rules', 'a.md'), '---\nid: other\ntype: rule\n---\n\nbody\n', 'utf8');
    await fs.writeFile(
      path.join(market, 'manifest.json'),
      JSON.stringify({ name: 'm', version: '0.1.0', assets: [{ id: 'a', type: 'rule', path: 'rules/a.md' }] }),
      'utf8',
    );
    await expect(findAssetById(market, 'a')).rejects.toThrow(UsageError);
  });

  it('manifest path 越界（../）被拒绝', async () => {
    await fs.writeFile(
      path.join(market, 'manifest.json'),
      JSON.stringify({ name: 'm', version: '0.1.0', assets: [{ id: 'a', type: 'rule', path: '../escape.md' }] }),
      'utf8',
    );
    await expect(findAssetById(market, 'a')).rejects.toThrow(UsageError);
  });
});

describe('命令退出码语义', () => {
  let project = '';
  let market = '';
  beforeEach(async () => {
    project = await makeTempDir('vprj');
    market = await makeTempDir('vmkt');
  });
  afterEach(async () => {
    if (project) await rmrf(project);
    if (market) await rmrf(market);
  });

  it('sync 未知 agent 抛 UsageError', async () => {
    await makeMarket(market, [{ id: 'r', type: 'rule', body: 'x' }]);
    await initCommand(project, { market });
    await treatCommand(project, ['r'], { market, copy: true });
    await expect(runSync(project, { agent: 'unknown' })).rejects.toThrow(UsageError);
  });

  it('trust 非法 MCP body 抛 UsageError', async () => {
    await makeMarket(market, [{ id: 'bad', type: 'mcp', body: '{ not json' }]);
    await initCommand(project, { market });
    await expect(trustCommand(project, 'bad', { market })).rejects.toThrow(UsageError);
  });

  it('treat 未找到 id 调 process.exit(2)', async () => {
    await makeMarket(market, [{ id: 'r', type: 'rule', body: 'x' }]);
    await initCommand(project, { market });
    const spy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`exit:${code ?? 0}`);
      });
    await expect(treatCommand(project, ['nope'], { market, copy: true })).rejects.toThrow('exit:2');
    spy.mockRestore();
  });

  it('diagnose --strict 发现 blocker 调 process.exit(2)', async () => {
    const spy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`exit:${code ?? 0}`);
      });
    await expect(diagnoseCommand(project, { strict: true })).rejects.toThrow('exit:2');
    spy.mockRestore();
  });
});
