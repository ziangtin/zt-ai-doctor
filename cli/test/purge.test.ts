import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { makeTempDir, makeMarket, rmrf, exists, readText, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { trustCommand } from '../src/commands/trust.js';
import { runSync } from '../src/commands/sync.js';
import { purgeCommand } from '../src/commands/purge.js';
import { readManifest } from '../src/core/manifest.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';
beforeEach(async () => {
  project = await makeTempDir('pg');
  market = await makeTempDir('pgm');
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

async function manifestAgents(): Promise<Set<string>> {
  const m = await readManifest(project);
  return new Set([...m.values()].map((r) => r.agent));
}

describe('purge <agent>', () => {
  it('清除该 agent 全部受管配置，不影响其他 agent', async () => {
    await setup();
    await runSync(project, { agent: 'claude,cursor', copy: true });
    await purgeCommand(project, 'claude');

    // claude 产物已删
    expect(await exists(path.join(project, '.claude', 'rules', 'rule-1.md'))).toBe(false);
    expect(await exists(path.join(project, '.claude', 'skills', 'skill-1', 'SKILL.md'))).toBe(false);
    expect(await exists(path.join(project, '.mcp.json'))).toBe(false);
    // cursor 产物保留
    expect(await exists(path.join(project, '.cursor', 'rules', 'rule-1.mdc'))).toBe(true);
    expect(await exists(path.join(project, '.cursor', 'mcp.json'))).toBe(true);
    // manifest 仅剩 cursor
    const agents = await manifestAgents();
    expect(agents.has('claude')).toBe(false);
    expect(agents.has('cursor')).toBe(true);
    // .gitignore 移除 claude 条目，保留 cursor
    const gi = await readText(path.join(project, '.gitignore'));
    expect(gi).not.toContain('.claude/rules/');
    expect(gi).toContain('.cursor/rules/');
  });

  it('未同步过的 agent：无受管配置，不影响已同步 agent', async () => {
    await setup();
    await runSync(project, { agent: 'claude', copy: true });
    await purgeCommand(project, 'cursor'); // cursor 未同步
    expect(await exists(path.join(project, '.claude', 'rules', 'rule-1.md'))).toBe(true);
    const agents = await manifestAgents();
    expect(agents.has('claude')).toBe(true);
  });

  it('未知 agent 抛 UsageError', async () => {
    await setup();
    await expect(purgeCommand(project, 'foo')).rejects.toThrow(/未知 agent/);
  });

  it('用户改过的受管文件冲突跳过（留盘），记录仍从 manifest 移除', async () => {
    await setup();
    await runSync(project, { agent: 'cursor', copy: true });
    // 改动 cursor 的 rule 文件（copy 模式下是真实文件，hash 将不再匹配）
    const ruleFile = path.join(project, '.cursor', 'rules', 'rule-1.mdc');
    await fs.writeFile(ruleFile, (await readText(ruleFile)) + '\n# user edit\n', 'utf8');
    await purgeCommand(project, 'cursor');
    // 改过的文件留盘（冲突）
    expect(await exists(ruleFile)).toBe(true);
    // 未改的 mcp.json 已删
    expect(await exists(path.join(project, '.cursor', 'mcp.json'))).toBe(false);
    // cursor 记录全部从 manifest 移除（含冲突项，与 sync GC 一致）
    const agents = await manifestAgents();
    expect(agents.has('cursor')).toBe(false);
  });
});
