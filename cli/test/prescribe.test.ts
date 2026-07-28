import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, exists, readText } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { prescribeCommand } from '../src/commands/prescribe.js';
import { treatCommand } from '../src/commands/treat.js';
import { readPrescriptionSelection } from '../src/core/prescription.js';
import { detectStack } from '../src/core/stack.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';
beforeEach(async () => {
  project = await makeTempDir('rx');
  market = await makeTempDir('rmkt');
});
afterEach(async () => {
  if (project) await rmrf(project);
  if (market) await rmrf(market);
});

async function writePkg(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}) {
  await fs.writeFile(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: deps, devDependencies: devDeps }, null, 2),
    'utf8',
  );
}

describe('detectStack', () => {
  it('读 package.json 的 dependencies + devDependencies', async () => {
    await writePkg({ react: '18' }, { typescript: '5' });
    const s = await detectStack(project);
    expect(s.deps.has('react')).toBe(true);
    expect(s.deps.has('typescript')).toBe(true);
    expect(s.hasPackageJson).toBe(true);
  });

  it('无 package.json 返回空集', async () => {
    const s = await detectStack(project);
    expect(s.deps.size).toBe(0);
    expect(s.hasPackageJson).toBe(false);
  });
});

describe('readPrescriptionSelection', () => {
  it('文件不存在返回 null', async () => {
    expect(await readPrescriptionSelection(project)).toBeNull();
  });

  it('解析勾选 [x] 的 id，忽略未勾选', async () => {
    await fs.mkdir(path.join(project, '.agents', '.build'), { recursive: true });
    await fs.writeFile(
      path.join(project, '.agents', '.build', 'prescription.md'),
      ['# rx', '', '- [x] react-ts', '- [ ] other', '- [x] mcp-x', ''].join('\n'),
      'utf8',
    );
    expect(await readPrescriptionSelection(project)).toEqual(['react-ts', 'mcp-x']);
  });
});

describe('prescribe 处方单生成', () => {
  it('React+TS 项目：react-ts 进推荐（高置信度，默认勾选），无 stack 资产进可选', async () => {
    await makeMarket(market, [
      { id: 'react-ts', type: 'rule', body: 'r', stack: { deps: ['react', 'typescript'], files: ['tsconfig.json'] } },
      { id: 'frontend-review', type: 'skill', body: 's', agents: ['claude'] },
    ]);
    await writePkg({ react: '18' }, { typescript: '5' });
    await fs.writeFile(path.join(project, 'tsconfig.json'), '{}', 'utf8');
    await initCommand(project, { market });

    await prescribeCommand(project, { market });

    const sel = await readPrescriptionSelection(project);
    expect(sel).toContain('react-ts');
    expect(sel).not.toContain('frontend-review');
    const rx = await readText(path.join(project, '.agents', '.build', 'prescription.md'));
    expect(rx).toContain('置信度 高');
    expect(rx).toContain('可选');
    expect(rx).toContain('frontend-review');
    expect(rx).toMatch(/skill 仅 Claude/);
  });

  it('空项目（无 package.json）：无推荐，全进可选', async () => {
    await makeMarket(market, [
      { id: 'react-ts', type: 'rule', body: 'r', stack: { deps: ['react'] } },
      { id: 'mcp-x', type: 'mcp', body: '{ "command": "npx", "args": ["pkg@1.0.0"] }' },
    ]);
    await initCommand(project, { market });

    await prescribeCommand(project, { market });

    const sel = await readPrescriptionSelection(project);
    expect(sel).toEqual([]);
    const rx = await readText(path.join(project, '.agents', '.build', 'prescription.md'));
    expect(rx).toContain('可选');
    expect(rx).toContain('mcp-x');
    expect(rx).toContain('MCP command: npx');
  });

  it('--tag 筛选只含指定标签的资产', async () => {
    await makeMarket(market, [
      { id: 'react-ts', type: 'rule', body: 'r', tags: ['frontend'], stack: { deps: ['react'] } },
      { id: 'node-api', type: 'rule', body: 'n', tags: ['backend'], stack: { deps: ['express'] } },
    ]);
    await writePkg({ react: '18' });
    await initCommand(project, { market });
    await prescribeCommand(project, { market, tag: 'frontend' });
    const rx = await readText(path.join(project, '.agents', '.build', 'prescription.md'));
    expect(rx).toContain('react-ts');
    expect(rx).not.toContain('node-api');
  });
});

describe('treat 按处方单抓药', () => {
  it('不带 id 时读处方单勾选抓药', async () => {
    await makeMarket(market, [
      { id: 'react-ts', type: 'rule', body: 'r', stack: { deps: ['react'] } },
      { id: 'other', type: 'rule', body: 'o', stack: { deps: ['vue'] } },
    ]);
    await writePkg({ react: '18' });
    await initCommand(project, { market });
    await prescribeCommand(project, { market });

    await treatCommand(project, [], { market, copy: true });

    // react-ts 推荐默认勾选 -> 装入；other 未匹配不勾选 -> 不装
    expect(await exists(path.join(project, '.agents', 'rules', 'react-ts.md'))).toBe(true);
    expect(await exists(path.join(project, '.agents', 'rules', 'other.md'))).toBe(false);
  });

  it('无处方单时提示先 prescribe', async () => {
    await makeMarket(market, [{ id: 'r', type: 'rule', body: 'r' }]);
    await initCommand(project, { market });
    await treatCommand(project, [], { market, copy: true });
    // 未抛错、未装入
    expect(await exists(path.join(project, '.agents', 'rules', 'r.md'))).toBe(false);
  });
});
