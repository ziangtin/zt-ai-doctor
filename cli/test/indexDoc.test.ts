import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, readText, exists } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { removeCommand } from '../src/commands/remove.js';
import { writeSubdirIndex } from '../src/core/indexDoc.js';
import { loadProjectAssets } from '../src/core/project.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const BEGIN = '<!-- zai:index-begin -->';
const END = '<!-- zai:index-end -->';

describe('索引 README 生成', () => {
  let project = '';
  let market = '';
  afterEach(async () => {
    if (project) await rmrf(project);
    if (market) await rmrf(market);
    project = '';
    market = '';
  });

  it('init 落空索引：含前言 + 标记段 + 空态占位', async () => {
    project = await makeTempDir('idx-init');
    await initCommand(project, {});

    const rules = await readText(path.join(project, '.agents', 'rules', 'README.md'));
    expect(rules).toContain('# 项目规范索引');
    expect(rules).toContain(BEGIN);
    expect(rules).toContain(END);
    expect(rules).toContain('暂无已安装规范');

    const skills = await readText(path.join(project, '.agents', 'skills', 'README.md'));
    expect(skills).toContain('name: project-skills-index');
    expect(skills).toContain('description: 项目的本地技能索引');
    expect(skills).toContain('# 项目技能索引');
    expect(skills).toContain('## 自封装技能列表');
    expect(skills).toContain('| 技能 | 功能描述 | 配套规范 | 适用应用 |');
    expect(skills).toContain('暂无已安装技能');
  });

  it('treat 后索引列出模块：emoji heading + 章节列表', async () => {
    project = await makeTempDir('idx-treat');
    market = await makeTempDir('mkt');
    await makeMarket(market, [
      {
        id: 'react-ts',
        type: 'rule',
        title: 'React + TypeScript 项目规则',
        icon: '💻',
        priority: 100,
        body: '## 组件\n- 函数组件\n## 类型\n- strict\n### 深层不收\n',
      },
    ]);
    await initCommand(project, { market });
    await treatCommand(project, ['react-ts'], { market, copy: true });

    const rules = await readText(path.join(project, '.agents', 'rules', 'README.md'));
    expect(rules).toContain('### 💻 [React + TypeScript 项目规则](./react-ts.md)');
    expect(rules).toContain('- 组件');
    expect(rules).toContain('- 类型');
    expect(rules).not.toContain('深层不收');
    // 不再有描述/元数据行
    expect(rules).not.toContain('v1.0.0');
    expect(rules).not.toContain('标签：');
    expect(rules).not.toContain('章节：');
  });

  it('icon 缺省按类型（rules 📋），frontmatter icon 优先', async () => {
    project = await makeTempDir('idx-icon');
    const dir = path.join(project, '.agents', 'rules');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'noicon.md'),
      '---\nid: noicon\ntype: rule\ntitle: 无图标\n---\n## 章节\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'withicon.md'),
      '---\nid: withicon\ntype: rule\ntitle: 有图标\nicon: 🎯\n---\n## 章节\n',
      'utf8',
    );
    await writeSubdirIndex(project, 'rule');
    const out = await readText(path.join(dir, 'README.md'));
    expect(out).toContain('### 📋 [无图标](./noicon.md)');
    expect(out).toContain('### 🎯 [有图标](./withicon.md)');
  });

  it('skills 索引为表格：技能/功能描述/配套规范/适用应用', async () => {
    project = await makeTempDir('idx-skill');
    market = await makeTempDir('mkt');
    await makeMarket(market, [
      {
        id: 'frontend-review',
        type: 'skill',
        title: '前端代码审查',
        icon: '🔍',
        description: 'Claude 专用的前端 PR 审查 skill',
        agents: ['claude'],
        rules: ['react-ts'],
        body: '## 触发\n## 审查清单\n',
      },
    ]);
    await initCommand(project, { market });
    await treatCommand(project, ['frontend-review'], { market, copy: true });

    const skills = await readText(path.join(project, '.agents', 'skills', 'README.md'));
    expect(skills).toContain('| 技能 | 功能描述 | 配套规范 | 适用应用 |');
    expect(skills).toContain('🔍 [前端代码审查](./frontend-review.md)');
    expect(skills).toContain('Claude 专用的前端 PR 审查 skill');
    expect(skills).toContain('[react-ts](../rules/react-ts.md)');
    expect(skills).toContain('claude');
  });

  it('章节列表封顶 4 项', async () => {
    project = await makeTempDir('idx-cap');
    const dir = path.join(project, '.agents', 'rules');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'many.md'),
      '---\nid: many\ntype: rule\n---\n## 一\n## 二\n## 三\n## 四\n## 五\n## 六\n',
      'utf8',
    );
    await writeSubdirIndex(project, 'rule');
    const out = await readText(path.join(dir, 'README.md'));
    expect(out).toContain('- 一');
    expect(out).toContain('- 四');
    expect(out).not.toContain('- 五');
    expect(out).not.toContain('- 六');
  });

  it('remove 后条目消失，回空态', async () => {
    project = await makeTempDir('idx-rm');
    market = await makeTempDir('mkt');
    await makeMarket(market, [{ id: 'react-ts', type: 'rule', body: '## 组件\n' }]);
    await initCommand(project, { market });
    await treatCommand(project, ['react-ts'], { market, copy: true });
    await removeCommand(project, 'react-ts', { copy: true });

    const rules = await readText(path.join(project, '.agents', 'rules', 'README.md'));
    expect(rules).toContain('暂无已安装规范');
    expect(rules).not.toContain('react-ts.md');
  });

  it('标记段外的自定义前言被保留', async () => {
    project = await makeTempDir('idx-preamble');
    const dir = path.join(project, '.agents', 'rules');
    await fs.mkdir(dir, { recursive: true });
    // 用户手写前言 + 已有标记段
    const custom = `# 我的规范\n\n这是团队自定义前言，不可覆盖。\n\n${BEGIN}\n## 规范模块列表\n\n_旧内容_\n${END}\n`;
    await fs.writeFile(path.join(dir, 'README.md'), custom, 'utf8');
    await fs.writeFile(
      path.join(dir, 'a.md'),
      '---\nid: a\ntype: rule\ntitle: A 规则\n---\n## 章节 A\n',
      'utf8',
    );

    await writeSubdirIndex(project, 'rule');
    const out = await readText(path.join(dir, 'README.md'));
    expect(out).toContain('这是团队自定义前言，不可覆盖。');
    expect(out).toContain('### 📋 [A 规则](./a.md)');
    expect(out).not.toContain('旧内容');
  });

  it('README / override / 无 frontmatter 的 .md 不被当成资产也不进索引', async () => {
    project = await makeTempDir('idx-skip');
    market = await makeTempDir('mkt');
    await makeMarket(market, [{ id: 'react-ts', type: 'rule', body: '## 组件\n' }]);
    await initCommand(project, { market });
    await treatCommand(project, ['react-ts'], { market, copy: true });

    const dir = path.join(project, '.agents', 'rules');
    // override 文件（同 id 覆盖，不应单列）
    await fs.writeFile(
      path.join(dir, 'react-ts.override.md'),
      '---\nid: react-ts\ntype: rule\nlayer: company\n---\nCOMPANY\n',
      'utf8',
    );
    // 项目自有笔记（无 id/type）
    await fs.writeFile(path.join(dir, 'NOTES.md'), '# 笔记\n无 frontmatter\n', 'utf8');
    await writeSubdirIndex(project, 'rule');

    const out = await readText(path.join(dir, 'README.md'));
    expect(out).toContain('react-ts.md');
    expect(out).not.toContain('override.md');
    expect(out).not.toContain('NOTES.md');

    // 扫描器不报错；README/NOTES 无 id 不入资产；override 同 id 入资产（分层合并用）
    const { assets, errors } = await loadProjectAssets(project);
    expect(errors).toHaveLength(0);
    expect(assets.map((a) => a.meta.id).sort()).toEqual(['react-ts', 'react-ts']);
  });

  it('按 priority 降序排序', async () => {
    project = await makeTempDir('idx-sort');
    const dir = path.join(project, '.agents', 'rules');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'low.md'),
      '---\nid: low\ntype: rule\ntitle: Low\npriority: 10\n---\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'high.md'),
      '---\nid: high\ntype: rule\ntitle: High\npriority: 100\n---\n',
      'utf8',
    );
    await writeSubdirIndex(project, 'rule');
    const out = await readText(path.join(dir, 'README.md'));
    const highIdx = out.indexOf('High');
    const lowIdx = out.indexOf('Low');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('空目录也安全：生成空态 README', async () => {
    project = await makeTempDir('idx-empty');
    await writeSubdirIndex(project, 'skill');
    const out = await readText(path.join(project, '.agents', 'skills', 'README.md'));
    expect(await exists(path.join(project, '.agents', 'skills', 'README.md'))).toBe(true);
    expect(out).toContain('暂无已安装技能');
    expect(out).toContain(BEGIN);
  });
});
