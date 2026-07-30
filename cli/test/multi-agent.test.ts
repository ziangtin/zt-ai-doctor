import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, exists, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { runSync } from '../src/commands/sync.js';
import { trustCommand } from '../src/commands/trust.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';

beforeEach(async () => {
  project = await makeTempDir('multi');
  market = await makeTempDir('mmkt');
  await fs.mkdir(path.join(project, '.claude'), { recursive: true });
  await fs.mkdir(path.join(project, '.cursor'), { recursive: true });
});
afterEach(async () => {
  if (project) await rmrf(project);
  if (market) await rmrf(market);
});

const ASSETS: AssetSpec[] = [
  { id: 'rule-1', type: 'rule', body: 'Rule one' },
  { id: 'skill-1', type: 'skill', body: 'Skill one' },
  { id: 'mcp-1', type: 'mcp', body: '{ "command": "npx", "args": ["-y", "pkg@1.0.0"] }' },
];

describe('双 agent 同时存在', () => {
  it('claude 与 cursor 各自渲染，skill 在 cursor 被 skip', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1', 'skill-1', 'mcp-1'], { market, copy: true });
    await trustCommand(project, 'mcp-1', { market });

    const placements = await runSync(project, { copy: true });

    // claude 产物
    expect(await exists(path.join(project, '.claude', 'rules', 'rule-1.md'))).toBe(true);
    expect(await exists(path.join(project, '.mcp.json'))).toBe(true);
    expect(await exists(path.join(project, '.claude', 'skills', 'skill-1', 'SKILL.md'))).toBe(true);

    // cursor 产物
    expect(await exists(path.join(project, '.cursor', 'rules', 'rule-1.mdc'))).toBe(true);
    expect(await exists(path.join(project, '.cursor', 'mcp.json'))).toBe(true);

    // skill 在 cursor 被 skip（supports 不含 skill）
    const skillSkip = placements.find(
      (p) => p.agent === 'cursor' && p.assetIds.includes('skill-1'),
    );
    expect(skillSkip?.action).toBe('skip');
  });

  it('未信任的 MCP 在 sync 时被 skip', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1', 'mcp-1'], { market, copy: true });
    // 不 trust mcp-1
    const placements = await runSync(project, { copy: true });
    const mcpSkip = placements.find(
      (p) => p.assetIds.includes('mcp-1') && p.action === 'skip',
    );
    expect(mcpSkip?.reason).toMatch(/未信任/);
    expect(await exists(path.join(project, '.mcp.json'))).toBe(false);
  });
});
