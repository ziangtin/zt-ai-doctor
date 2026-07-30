import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import { makeTempDir, makeMarket, rmrf, exists, readText, type AssetSpec } from './helpers.js';
import { initCommand } from '../src/commands/init.js';
import { treatCommand } from '../src/commands/treat.js';
import { removeCommand } from '../src/commands/remove.js';
import { trustCommand } from '../src/commands/trust.js';
import { runSync } from '../src/commands/sync.js';
import { readMcpJson } from '../src/core/mcpStore.js';
import { readLockfile, writeLockfile, untrustMcp } from '../src/core/lockfile.js';
import { lockfilePath } from '../src/core/paths.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let project = '';
let market = '';
beforeEach(async () => {
  project = await makeTempDir('mcp');
  market = await makeTempDir('mmkt');
});
afterEach(async () => {
  if (project) await rmrf(project);
  if (market) await rmrf(market);
});

const ASSETS: AssetSpec[] = [
  { id: 'mcp-1', type: 'mcp', body: '{ "command": "npx", "args": ["-y", "pkg@1.0.0"] }' },
  { id: 'mcp-2', type: 'mcp', body: '{ "command": "node", "args": ["srv.js"] }' },
];

async function setup() {
  await makeMarket(market, ASSETS);
  await initCommand(project, { market });
}

describe('MCP 单文件模型', () => {
  it('treat mcp 写入 .agents/mcp.json（不再写 .md）', async () => {
    await setup();
    await treatCommand(project, ['mcp-1'], { market, copy: true });

    const mcpJsonPath = path.join(project, '.agents', 'mcp.json');
    expect(await exists(mcpJsonPath)).toBe(true);
    expect(await exists(path.join(project, '.agents', 'mcp', 'mcp-1.md'))).toBe(false);

    const { mcpServers } = await readMcpJson(project);
    expect(mcpServers['mcp-1']).toEqual({ command: 'npx', args: ['-y', 'pkg@1.0.0'] });
  });

  it('treat 多个 mcp 合并进同一 mcp.json', async () => {
    await setup();
    await treatCommand(project, ['mcp-1', 'mcp-2'], { market, copy: true });
    const { mcpServers } = await readMcpJson(project);
    expect(Object.keys(mcpServers).sort()).toEqual(['mcp-1', 'mcp-2']);
  });

  it('remove mcp 从 mcp.json 删条目', async () => {
    await setup();
    await treatCommand(project, ['mcp-1', 'mcp-2'], { market, copy: true });
    await removeCommand(project, 'mcp-1', { copy: true });
    const { mcpServers } = await readMcpJson(project);
    expect(mcpServers['mcp-1']).toBeUndefined();
    expect(mcpServers['mcp-2']).toBeDefined();
  });

  it('sync 受信 mcp 写入 .mcp.json', async () => {
    await setup();
    await treatCommand(project, ['mcp-1'], { market, copy: true });
    await trustCommand(project, 'mcp-1', { market });
    await runSync(project, { agent: 'claude', copy: true });
    const out = JSON.parse(await readText(path.join(project, '.mcp.json'))) as {
      mcpServers: Record<string, unknown>;
    };
    expect(out.mcpServers['mcp-1']).toEqual({ command: 'npx', args: ['-y', 'pkg@1.0.0'] });
  });

  it('treat 自动信任 mcp，sync 写入 .mcp.json', async () => {
    await setup();
    await treatCommand(project, ['mcp-1'], { market, copy: true });
    // treat 已自动信任，无需显式 trust
    await runSync(project, { agent: 'claude', copy: true });
    const out = JSON.parse(await readText(path.join(project, '.mcp.json'))) as {
      mcpServers: Record<string, unknown>;
    };
    expect(out.mcpServers['mcp-1']).toEqual({ command: 'npx', args: ['-y', 'pkg@1.0.0'] });
  });

  it('手动取消信任后 sync 不写入 .mcp.json（信任闸门）', async () => {
    await setup();
    await treatCommand(project, ['mcp-1'], { market, copy: true });
    // treat 自动信任后手动取消
    const lock = await readLockfile(lockfilePath(project));
    if (!lock) throw new Error('lockfile missing');
    await writeLockfile(lockfilePath(project), untrustMcp(lock, 'mcp-1'));
    const placements = await runSync(project, { agent: 'claude', copy: true });
    expect(await exists(path.join(project, '.mcp.json'))).toBe(false);
    const mcpSkip = placements.find((p) => p.assetIds.includes('mcp-1') && p.action === 'skip');
    expect(mcpSkip?.reason).toMatch(/未信任/);
  });

  it('treat 非法 MCP body 抛错', async () => {
    await makeMarket(market, [{ id: 'bad', type: 'mcp', body: 'not json' }]);
    await initCommand(project, { market });
    await expect(treatCommand(project, ['bad'], { market, copy: true })).rejects.toThrow(/非法/);
  });
});
