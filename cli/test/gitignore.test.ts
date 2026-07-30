import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { makeTempDir, makeMarket, rmrf, exists, readText, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { trustCommand } from '../src/commands/trust.js';
import { runSync } from '../src/commands/sync.js';
import { ignoreEntryFor, collectIgnoreEntries, updateGitignore } from '../src/core/gitignore.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

async function readGi(project: string): Promise<string | null> {
  const p = path.join(project, '.gitignore');
  if (!(await exists(p))) return null;
  return readText(p);
}

describe('ignoreEntryFor', () => {
  it('目录型（含 {id}）-> {id} 所在目录带尾 /', () => {
    expect(ignoreEntryFor('.claude/rules/{id}.md')).toBe('.claude/rules/');
    // {id} 后还有子路径（/SKILL.md）也归到 {id} 所在目录
    expect(ignoreEntryFor('.claude/skills/{id}/SKILL.md')).toBe('.claude/skills/');
    expect(ignoreEntryFor('.clinerules/{id}.md')).toBe('.clinerules/');
    expect(ignoreEntryFor('.cursor/rules/{id}.mdc')).toBe('.cursor/rules/');
  });

  it('聚合单文件型（无 {id}）-> 整路径，不忽略父目录', () => {
    expect(ignoreEntryFor('.mcp.json')).toBe('.mcp.json');
    expect(ignoreEntryFor('AGENTS.md')).toBe('AGENTS.md');
    expect(ignoreEntryFor('.github/copilot-instructions.md')).toBe('.github/copilot-instructions.md');
    expect(ignoreEntryFor('.vscode/mcp.json')).toBe('.vscode/mcp.json');
    expect(ignoreEntryFor('.windsurfrules')).toBe('.windsurfrules');
  });

  it('规范化：反斜杠转正斜杠，去前导 ./', () => {
    expect(ignoreEntryFor('./.cursor/rules/{id}.mdc')).toBe('.cursor/rules/');
    // 隐藏目录 .trae + 反斜杠分隔符：保留前导点，仅转斜杠
    expect(ignoreEntryFor('.trae\\rules\\{id}.md')).toBe('.trae/rules/');
  });
});

describe('collectIgnoreEntries', () => {
  it('去重 + 排序', () => {
    const entries = collectIgnoreEntries([
      { targetPath: '.mcp.json' },
      { targetPath: '.claude/rules/{id}.md' },
      { targetPath: '.claude/rules/{id}.md' },
      { targetPath: '.claude/skills/{id}/SKILL.md' },
    ]);
    expect(entries).toEqual(['.claude/rules/', '.claude/skills/', '.mcp.json']);
  });
});

describe('updateGitignore', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await makeTempDir('gi');
  });
  afterEach(async () => {
    if (dir) await rmrf(dir);
  });

  it('无文件时创建受管段', async () => {
    await updateGitignore(dir, ['.claude/rules/', '.mcp.json']);
    const raw = await readGi(dir);
    expect(raw).toBeTruthy();
    expect(raw).toContain('# >>> zai-doctor sync 产物');
    expect(raw).toContain('.claude/rules/');
    expect(raw).toContain('.mcp.json');
    expect(raw).toContain('# <<< zai-doctor sync 产物 <<<');
  });

  it('无标记段时追加（保留段外内容 + 空行分隔）', async () => {
    await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules/\n', 'utf8');
    await updateGitignore(dir, ['.mcp.json']);
    const raw = await readGi(dir);
    expect(raw).toMatch(/^node_modules\/\n/);
    expect(raw).toMatch(/node_modules\/\n\n# >>> zai-doctor/);
    expect(raw).toContain('.mcp.json');
  });

  it('有标记段时替换段内（幂等，保留段外）', async () => {
    const initial =
      'node_modules/\n\n# >>> zai-doctor sync 产物（自动管理，请勿手动编辑此段） >>>\nold/\n# <<< zai-doctor sync 产物 <<<\n';
    await fs.writeFile(path.join(dir, '.gitignore'), initial, 'utf8');
    await updateGitignore(dir, ['.claude/rules/', '.mcp.json']);
    const raw = await readGi(dir);
    expect(raw).not.toContain('old/');
    expect(raw).toContain('.claude/rules/');
    expect(raw).toContain('.mcp.json');
    expect(raw).toContain('node_modules/'); // 段外保留
    // 幂等：相同 entries 再跑一次，内容不变
    const raw2 = await readText(path.join(dir, '.gitignore'));
    await updateGitignore(dir, ['.claude/rules/', '.mcp.json']);
    const raw3 = await readText(path.join(dir, '.gitignore'));
    expect(raw3).toBe(raw2);
  });

  it('entries 为空时移除整段（保留段外）', async () => {
    const initial =
      'keep/\n\n# >>> zai-doctor sync 产物（自动管理，请勿手动编辑此段） >>>\n.claude/rules/\n# <<< zai-doctor sync 产物 <<<\n';
    await fs.writeFile(path.join(dir, '.gitignore'), initial, 'utf8');
    await updateGitignore(dir, []);
    const raw = await readGi(dir);
    expect(raw).not.toContain('zai-doctor');
    expect(raw).not.toContain('.claude/rules/');
    expect(raw).toContain('keep/');
  });

  it('entries 为空且无段时不改动', async () => {
    await fs.writeFile(path.join(dir, '.gitignore'), 'node_modules/\n', 'utf8');
    await updateGitignore(dir, []);
    const raw = await readGi(dir);
    expect(raw).toBe('node_modules/\n');
  });
});

describe('sync .gitignore 集成', () => {
  let project = '';
  let market = '';
  beforeEach(async () => {
    project = await makeTempDir('sgi');
    market = await makeTempDir('sgm');
  });
  afterEach(async () => {
    if (project) await rmrf(project);
    if (market) await rmrf(market);
  });

  const ASSETS: AssetSpec[] = [
    { id: 'rule-1', type: 'rule', body: 'Rule one body' },
    { id: 'skill-1', type: 'skill', body: 'Skill one', agents: ['claude'] },
    { id: 'mcp-1', type: 'mcp', body: '{ "command": "npx", "args": ["pkg@1.0.0"] }' },
  ];

  async function setup() {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1', 'skill-1', 'mcp-1'], { market, copy: true });
    await trustCommand(project, 'mcp-1', { market });
  }

  it('默认写入 .gitignore 受管段（目录型 + 单文件型，不误忽略整目录）', async () => {
    await setup();
    await runSync(project, { agent: 'claude', copy: true });
    const raw = await readGi(project);
    expect(raw).toBeTruthy();
    expect(raw).toContain('.claude/rules/');
    expect(raw).toContain('.claude/skills/');
    expect(raw).toContain('.mcp.json');
    // 绝不忽略 .claude/ 整目录（内有用户文件）
    expect(raw).not.toMatch(/^\.claude\/$/m);
  });

  it('gitignore:false 不写 .gitignore', async () => {
    await setup();
    await runSync(project, { agent: 'claude', copy: true, gitignore: false });
    expect(await exists(path.join(project, '.gitignore'))).toBe(false);
  });

  it('部分同步保留其他 agent 的条目（其记录仍在 manifest）', async () => {
    await setup();
    // 先全量同步 claude + cursor
    await runSync(project, { agent: 'claude,cursor', copy: true });
    expect((await readGi(project)) ?? '').toContain('.cursor/rules/');
    // 再只同步 claude：cursor 记录留在 manifest（keptPrev），条目应保留
    await runSync(project, { agent: 'claude', copy: true });
    const raw = await readGi(project);
    expect(raw).toContain('.claude/rules/');
    expect(raw).toContain('.cursor/rules/');
  });
});
