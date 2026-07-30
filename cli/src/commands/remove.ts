import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, assetSubdir, lockfilePath, projectMcpJsonPath } from '../core/paths.js';
import { readLockfile, writeLockfile, removeAsset, untrustMcp } from '../core/lockfile.js';
import { removeMcpServer } from '../core/mcpStore.js';
import { runSync } from './sync.js';
import { writeAllIndexes } from '../core/indexDoc.js';
import { UsageError } from '../core/errors.js';

/**
 * remove <id>：移除已装资产。
 * rule/skill/prompt：删 .agents/<type>/<file>；mcp：从 .agents/mcp.json 删条目。
 * 从 lockfile 移除 + sync（GC 清理 agent 配置中的受管目标）。
 */
export async function removeCommand(
  projectRoot: string,
  id: string,
  opts: { agent?: string; copy?: boolean },
): Promise<void> {
  const lockPath = lockfilePath(projectRoot);
  const lock = await readLockfile(lockPath);
  if (!lock) {
    throw new UsageError('未建档，先运行 zai-doctor init');
  }
  const entry = lock.assets.find((a) => a.id === id);
  if (!entry) {
    throw new UsageError(`未安装资产: ${id}`);
  }

  // 删已装资产（mcp 从单文件 mcp.json 删条目，其余删 .md 文件）
  if (entry.type === 'mcp') {
    await removeMcpServer(projectRoot, id);
  } else {
    const targetFile = path.join(
      agentsDir(projectRoot),
      assetSubdir(entry.type),
      path.basename(entry.marketPath),
    );
    await fs.rm(targetFile, { force: true });
  }

  // 从 lockfile 移除（MCP 同步取消信任，保持生命周期一致）
  let updated = removeAsset(lock, id);
  if (entry.type === 'mcp') updated = untrustMcp(updated, id);
  await writeLockfile(lockPath, updated);

  console.log(`🗑 [remove] 已移除 ${id}（${entry.type}）`);
  if (entry.type === 'mcp') {
    console.log(`   源：${path.relative(projectRoot, projectMcpJsonPath(projectRoot))}`);
  }
  // 先刷新索引 README，再 sync--确保 sync 镜像 README 时读到最新索引
  await writeAllIndexes(projectRoot);
  console.log('   索引：rules/README.md、skills/README.md 已刷新');
  console.log('   同步清理 agent 配置...');
  await runSync(projectRoot, { agent: opts.agent, copy: opts.copy });
}
