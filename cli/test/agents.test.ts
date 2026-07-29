import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, exists, readText, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { runSync } from '../src/commands/sync.js';
import { trustCommand } from '../src/commands/trust.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';
beforeEach(async () => {
  project = await makeTempDir('ag');
  market = await makeTempDir('amkt');
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

describe('Copilot renderer', () => {
  it('rule -> .github/copilot-instructions.md，mcp -> .vscode/mcp.json，skill skip', async () => {
    await setup();
    const placements = await runSync(project, { agent: 'copilot', copy: true });
    expect(await exists(path.join(project, '.github', 'copilot-instructions.md'))).toBe(true);
    expect(await exists(path.join(project, '.vscode', 'mcp.json'))).toBe(true);
    const skillSkip = placements.find(
      (p) => p.agent === 'copilot' && p.assetIds.includes('skill-1') && p.action === 'skip',
    );
    expect(skillSkip).toBeTruthy();
  });
});

describe('Codex renderer', () => {
  it('rule -> AGENTS.md，mcp/skill skip（supports 不含）', async () => {
    await setup();
    const placements = await runSync(project, { agent: 'codex', copy: true });
    expect(await exists(path.join(project, 'AGENTS.md'))).toBe(true);
    expect(await readText(path.join(project, 'AGENTS.md'))).toContain('Rule one body');
    const mcpSkip = placements.find(
      (p) => p.agent === 'codex' && p.assetIds.includes('mcp-1') && p.action === 'skip',
    );
    expect(mcpSkip).toBeTruthy();
    const skillSkip = placements.find(
      (p) => p.agent === 'codex' && p.assetIds.includes('skill-1') && p.action === 'skip',
    );
    expect(skillSkip).toBeTruthy();
  });
});

describe('Cline renderer', () => {
  it('rule -> .clinerules/<id>.md', async () => {
    await setup();
    await runSync(project, { agent: 'cline', copy: true });
    expect(await exists(path.join(project, '.clinerules', 'rule-1.md'))).toBe(true);
  });
});

describe('Windsurf renderer', () => {
  it('rule -> .windsurfrules', async () => {
    await setup();
    await runSync(project, { agent: 'windsurf', copy: true });
    expect(await exists(path.join(project, '.windsurfrules'))).toBe(true);
  });
});
