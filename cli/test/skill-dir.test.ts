import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, rmrf, readText, exists } from './helpers.js';
import { findAssetById } from '../src/core/market.js';
import { hashDir } from '../src/core/hash.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { syncCommand } from '../src/commands/sync.js';
import { writeAllIndexes } from '../src/core/indexDoc.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

/** 建一个含目录 skill（SKILL.md + scripts/run.sh）的 mini market */
async function makeSkillMarket(market: string): Promise<void> {
  const dir = path.join(market, 'skills', 'my-skill');
  await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    [
      '---',
      'id: my-skill',
      'type: skill',
      'title: "我的技能"',
      'description: "test skill"',
      'version: 1.0.0',
      '---',
      '',
      '## 用法',
      '做点事。',
      '',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(path.join(dir, 'scripts', 'run.sh'), 'echo hi\n', 'utf8');
  await fs.writeFile(
    path.join(market, 'manifest.json'),
    JSON.stringify(
      {
        name: 'test-market',
        version: '0.1.0',
        assets: [
          { id: 'my-skill', type: 'skill', versions: [{ version: '1.0.0', path: 'skills/my-skill/SKILL.md' }] },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );
}

describe('skill 目录资产', () => {
  let project = '';
  let market = '';
  beforeEach(async () => {
    project = await makeTempDir('skilldir');
    market = await makeTempDir('skillmkt');
    await makeSkillMarket(market);
    await initCommand(project, { market });
  });
  afterEach(async () => {
    if (project) await rmrf(project);
    if (market) await rmrf(market);
  });

  const marketSkillDir = () => path.join(market, 'skills', 'my-skill');
  const projectSkillDir = () => path.join(project, '.agents', 'skills', 'my-skill');
  const claudeSkillDir = () => path.join(project, '.claude', 'skills', 'my-skill');

  it('hashDir 稳定且对内容敏感', async () => {
    const h1 = await hashDir(marketSkillDir());
    expect(await hashDir(marketSkillDir())).toBe(h1);
    await fs.writeFile(path.join(marketSkillDir(), 'scripts', 'run.sh'), 'echo changed\n', 'utf8');
    expect(await hashDir(marketSkillDir())).not.toBe(h1);
  });

  it('findAssetById 加载目录资产：带 dirPath，hash = hashDir', async () => {
    const a = await findAssetById(market, 'my-skill');
    expect(a).not.toBeNull();
    expect(a!.dirPath).toBe(marketSkillDir());
    expect(a!.hash).toBe(await hashDir(marketSkillDir()));
    expect(a!.content).toContain('做点事');
  });

  it('treat 装成目录（含 scripts/）', async () => {
    await treatCommand(project, ['my-skill'], { market, copy: true });
    expect(await exists(path.join(projectSkillDir(), 'SKILL.md'))).toBe(true);
    expect(await exists(path.join(projectSkillDir(), 'scripts', 'run.sh'))).toBe(true);
    expect(await readText(path.join(projectSkillDir(), 'scripts', 'run.sh'))).toBe('echo hi\n');
  });

  it('re-treat 冲突保护：本地改过 skip，--force 覆盖', async () => {
    await treatCommand(project, ['my-skill'], { market, copy: true });
    await fs.appendFile(path.join(projectSkillDir(), 'SKILL.md'), '<!-- local -->', 'utf8');
    await treatCommand(project, ['my-skill'], { market, copy: true });
    expect(await readText(path.join(projectSkillDir(), 'SKILL.md'))).toContain('local');
    await treatCommand(project, ['my-skill'], { market, copy: true, force: true });
    expect(await readText(path.join(projectSkillDir(), 'SKILL.md'))).not.toContain('local');
  });

  it('sync 把目录放到 .claude/skills/<id>/（含 scripts/ + 转换 frontmatter）', async () => {
    await treatCommand(project, ['my-skill'], { market, copy: true });
    // 删掉 treat 内置 sync 的产物，单独验 sync
    await fs.rm(path.join(project, '.claude'), { recursive: true, force: true });
    await syncCommand(project, { agent: 'claude', copy: true, gitignore: false });
    expect(await exists(path.join(claudeSkillDir(), 'SKILL.md'))).toBe(true);
    expect(await exists(path.join(claudeSkillDir(), 'scripts', 'run.sh'))).toBe(true);
    const skill = await readText(path.join(claudeSkillDir(), 'SKILL.md'));
    expect(skill).toContain('name: my-skill');
    expect(skill).not.toMatch(/^id: my-skill$/m); // zai-doctor frontmatter 已转 Claude 格式
  });

  it('indexDoc 索引列出目录 skill（链接 ./<id>/SKILL.md）', async () => {
    await treatCommand(project, ['my-skill'], { market, copy: true });
    await writeAllIndexes(project);
    const readme = await readText(path.join(project, '.agents', 'skills', 'README.md'));
    expect(readme).toContain('my-skill');
    expect(readme).toContain('./my-skill/SKILL.md');
  });
});
