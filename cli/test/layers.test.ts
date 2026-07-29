import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, readText, type Layer } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { overrideCommand } from '../src/commands/override.js';
import { runSync } from '../src/commands/sync.js';
import { resolveAssets } from '../src/core/layers.js';
import type { LoadedAsset } from '../src/core/types.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

function makeAsset(id: string, layer: Layer = 'baseline', priority = 0): LoadedAsset {
  return {
    entry: { id, type: 'rule', path: `rules/${id}.md` },
    meta: {
      id,
      type: 'rule',
      title: '',
      description: '',
      tags: [],
      agents: [],
      layer,
      priority,
    },
    raw: '',
    content: '',
    hash: '',
  };
}

describe('分层覆盖 resolveAssets（纯函数）', () => {
  it('company > personal > baseline', () => {
    const { resolved, overrides } = resolveAssets([
      makeAsset('a', 'baseline'),
      makeAsset('a', 'personal'),
      makeAsset('a', 'company'),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].meta.layer).toBe('company');
    expect(overrides[0].winner).toBe('company');
  });

  it('同层 priority 高者胜', () => {
    const { resolved } = resolveAssets([makeAsset('a', 'baseline', 10), makeAsset('a', 'baseline', 50)]);
    expect(resolved[0].meta.priority).toBe(50);
  });

  it('不同 id 共存，无覆盖记录', () => {
    const { resolved, overrides } = resolveAssets([makeAsset('a'), makeAsset('b')]);
    expect(resolved).toHaveLength(2);
    expect(overrides).toHaveLength(0);
  });
});

describe('company overlay 端到端', () => {
  let project = '';
  let market = '';
  afterEach(async () => {
    if (project) await rmrf(project);
    if (market) await rmrf(market);
  });

  it('company 覆盖 baseline，sync 输出 company 内容', async () => {
    project = await makeTempDir('layer');
    market = await makeTempDir('mkt');
    await makeMarket(market, [{ id: 'react-ts', type: 'rule', body: 'BASELINE BODY' }]);
    await initCommand(project, { market });
    await treatCommand(project, ['react-ts'], { market, copy: true });

    // 建覆盖起点（.agents/rules/react-ts.override.md，layer: company），覆写为 company 内容
    await overrideCommand(project, 'react-ts', { market });
    const overrideFile = path.join(project, '.agents', 'rules', 'react-ts.override.md');
    await fs.writeFile(
      overrideFile,
      '---\nid: react-ts\ntype: rule\nlayer: company\n---\n\nCOMPANY BODY\n',
      'utf8',
    );

    await fs.mkdir(path.join(project, '.claude'), { recursive: true });
    await runSync(project, { agent: 'claude', copy: true });
    const out = await readText(path.join(project, 'CLAUDE.md'));
    expect(out).toContain('COMPANY BODY');
    expect(out).not.toContain('BASELINE BODY');
  });
});
