import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, exists, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { trustCommand } from '../src/commands/trust.js';
import { runSync } from '../src/commands/sync.js';
import {
  loadBundledAgentConfig,
  loadAgentConfig,
} from '../src/core/agentConfig.js';
import { detectConfig } from '../src/core/configDetect.js';
import { UsageError } from '../src/core/errors.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';
beforeEach(async () => {
  project = await makeTempDir('cfg');
  market = await makeTempDir('cmkt');
});
afterEach(async () => {
  if (project) await rmrf(project);
  if (market) await rmrf(market);
});

describe('loadBundledAgentConfig', () => {
  it('返回 8 个内置 agent', async () => {
    const configs = await loadBundledAgentConfig();
    const names = configs.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['claude', 'cursor', 'copilot', 'codex', 'cline', 'windsurf', 'trae', 'lingma']),
    );
    expect(names).toHaveLength(8);
  });
  it('claude supports rule/skill/mcp，rule 逐文件到 .claude/rules/<id>.md', async () => {
    const configs = await loadBundledAgentConfig();
    const claude = configs.find((c) => c.name === 'claude')!;
    expect(claude.supports).toEqual(['rule', 'skill', 'mcp']);
    const rule = claude.mappings.rule!;
    expect(rule.targetPath).toBe('.claude/rules/{id}.md');
    expect(rule.aggregate).toBe(false);
    expect(rule.transform).toBe('rule-md');
    expect(rule.aggregateSource).toBeUndefined();
  });
  it('cursor rule 为 1:1 .mdc，transform=rule-mdc', async () => {
    const cursor = (await loadBundledAgentConfig()).find((c) => c.name === 'cursor')!;
    const rule = cursor.mappings.rule!;
    expect(rule.targetPath).toBe('.cursor/rules/{id}.mdc');
    expect(rule.aggregate).toBe(false);
    expect(rule.transform).toBe('rule-mdc');
  });
  it('trae: .trae/rules/{id}.md + .trae/mcp.json，supports rule/mcp', async () => {
    const trae = (await loadBundledAgentConfig()).find((c) => c.name === 'trae')!;
    expect(trae.supports).toEqual(['rule', 'mcp']);
    expect(trae.mappings.rule!.targetPath).toBe('.trae/rules/{id}.md');
    expect(trae.mappings.rule!.transform).toBe('rule-mdc');
    expect(trae.mappings.mcp!.targetPath).toBe('.trae/mcp.json');
  });
  it('lingma: .qoder/rules/{id}.md，supports 仅 rule（MCP 走 IDE 设置）', async () => {
    const lingma = (await loadBundledAgentConfig()).find((c) => c.name === 'lingma')!;
    expect(lingma.supports).toEqual(['rule']);
    expect(lingma.mappings.rule!.targetPath).toBe('.qoder/rules/{id}.md');
    expect(lingma.mappings.rule!.transform).toBe('rule-mdc');
    expect(lingma.mappings.mcp).toBeUndefined();
  });
});

describe('项目覆盖 .agents/agents.json', () => {
  it('新增自定义 agent（纯配置即生效）', async () => {
    const override = {
      agents: {
        myagent: {
          markers: ['.myagent'],
          supports: ['rule'],
          env: { executables: ['myagent'], globalDirs: [], registryNames: [] },
          mappings: {
            rule: {
              targetPath: '.myagent/rules.md',
              aggregate: true,
              action: 'copy',
              transform: 'rule-aggregate-md',
            },
          },
        },
      },
    };
    await fs.mkdir(path.join(project, '.agents'), { recursive: true });
    await fs.writeFile(
      path.join(project, '.agents', 'agents.json'),
      JSON.stringify(override),
      'utf8',
    );
    const configs = await loadAgentConfig(project);
    const my = configs.find((c) => c.name === 'myagent');
    expect(my).toBeTruthy();
    expect(my!.mappings.rule!.targetPath).toBe('.myagent/rules.md');
    // 内置 8 个仍在
    expect(configs).toHaveLength(9);
  });
  it('细粒度覆盖：改 cursor rule 目标路径，其余字段保留', async () => {
    const override = {
      agents: {
        cursor: {
          mappings: {
            rule: { targetPath: '.cursor/rules/custom-{id}.mdc', aggregate: false, transform: 'rule-mdc' },
          },
        },
      },
    };
    await fs.mkdir(path.join(project, '.agents'), { recursive: true });
    await fs.writeFile(path.join(project, '.agents', 'agents.json'), JSON.stringify(override), 'utf8');
    const cursor = (await loadAgentConfig(project)).find((c) => c.name === 'cursor')!;
    expect(cursor.mappings.rule!.targetPath).toBe('.cursor/rules/custom-{id}.mdc');
    // 未覆盖的字段从内置继承
    expect(cursor.mappings.mcp!.targetPath).toBe('.cursor/mcp.json');
    expect(cursor.markers).toEqual(['.cursor', '.cursorrules']);
  });
});

describe('detectConfig（项目配置探测）', () => {
  it('标记存在 -> true', async () => {
    await fs.mkdir(path.join(project, '.claude'), { recursive: true });
    const claude = (await loadBundledAgentConfig()).find((c) => c.name === 'claude')!;
    expect(await detectConfig(claude, project)).toBe(true);
  });
  it('标记不存在 -> false', async () => {
    const claude = (await loadBundledAgentConfig()).find((c) => c.name === 'claude')!;
    expect(await detectConfig(claude, project)).toBe(false);
  });
});

const ASSETS: AssetSpec[] = [
  { id: 'rule-1', type: 'rule', body: 'Rule one' },
  { id: 'skill-1', type: 'skill', body: 'Skill one' },
  { id: 'mcp-1', type: 'mcp', body: '{ "command": "npx", "args": ["-y", "pkg@1.0.0"] }' },
];

describe('sync --agent 多选', () => {
  it('claude,cursor 同时渲染（无需建标记目录）', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1', 'skill-1', 'mcp-1'], { market, copy: true });
    await trustCommand(project, 'mcp-1', { market });

    const placements = await runSync(project, { agent: 'claude,cursor', copy: true });
    const agents = [...new Set(placements.map((p) => p.agent))];
    expect(agents).toEqual(expect.arrayContaining(['claude', 'cursor']));
    expect(await exists(path.join(project, '.claude', 'rules', 'rule-1.md'))).toBe(true);
    expect(await exists(path.join(project, '.cursor', 'rules', 'rule-1.mdc'))).toBe(true);
  });
  it('未知 agent 报 UsageError', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1'], { market, copy: true });
    await expect(runSync(project, { agent: 'nope' })).rejects.toThrow(UsageError);
  });
  it('多选中部分未知 -> 报错并列出', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1'], { market, copy: true });
    await expect(runSync(project, { agent: 'claude,nope' })).rejects.toThrow(/未知 agent/);
  });
});

describe('trae / lingma 渲染', () => {
  it('trae: rule -> .trae/rules/<id>.md，mcp -> .trae/mcp.json', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1', 'mcp-1'], { market, copy: true });
    await trustCommand(project, 'mcp-1', { market });
    await runSync(project, { agent: 'trae', copy: true });
    expect(await exists(path.join(project, '.trae', 'rules', 'rule-1.md'))).toBe(true);
    expect(await exists(path.join(project, '.trae', 'mcp.json'))).toBe(true);
  });
  it('lingma: rule -> .qoder/rules/<id>.md，mcp 被 skip（supports 不含 mcp）', async () => {
    await makeMarket(market, ASSETS);
    await initCommand(project, { market });
    await treatCommand(project, ['rule-1', 'mcp-1'], { market, copy: true });
    await trustCommand(project, 'mcp-1', { market });
    const placements = await runSync(project, { agent: 'lingma', copy: true });
    expect(await exists(path.join(project, '.qoder', 'rules', 'rule-1.md'))).toBe(true);
    const mcpSkip = placements.find(
      (p) => p.agent === 'lingma' && p.assetIds.includes('mcp-1') && p.action === 'skip',
    );
    expect(mcpSkip).toBeTruthy();
  });
});
