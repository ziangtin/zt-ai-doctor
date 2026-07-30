import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, readText } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('treat 冲突保护', () => {
  let project = '';
  let market = '';
  beforeEach(async () => {
    project = await makeTempDir('treat');
    market = await makeTempDir('mkt');
    await makeMarket(market, [{ id: 'react-ts', type: 'rule', body: 'BASELINE BODY' }]);
    await initCommand(project, { market });
  });
  afterEach(async () => {
    if (project) await rmrf(project);
    if (market) await rmrf(market);
  });

  const file = (p: string) => path.join(p, '.agents', 'rules', 'react-ts.md');

  it('本地修改过的资产，re-treat 跳过覆盖', async () => {
    await treatCommand(project, ['react-ts'], { market, copy: true });
    await fs.writeFile(file(project), '---\nid: react-ts\ntype: rule\n---\nLOCAL EDIT\n', 'utf8');
    await treatCommand(project, ['react-ts'], { market, copy: true });
    const out = await readText(file(project));
    expect(out).toContain('LOCAL EDIT');
    expect(out).not.toContain('BASELINE BODY');
  });

  it('--force 强制覆盖本地修改', async () => {
    await treatCommand(project, ['react-ts'], { market, copy: true });
    await fs.writeFile(file(project), '---\nid: react-ts\ntype: rule\n---\nLOCAL EDIT\n', 'utf8');
    await treatCommand(project, ['react-ts'], { market, copy: true, force: true });
    const out = await readText(file(project));
    expect(out).toContain('BASELINE BODY');
    expect(out).not.toContain('LOCAL EDIT');
  });

  it('未修改的资产，re-treat 正常覆盖（幂等）', async () => {
    await treatCommand(project, ['react-ts'], { market, copy: true });
    await treatCommand(project, ['react-ts'], { market, copy: true });
    const out = await readText(file(project));
    expect(out).toContain('BASELINE BODY');
  });
});
