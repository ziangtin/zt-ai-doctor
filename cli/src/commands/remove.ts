import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, assetSubdir, lockfilePath } from '../core/paths.js';
import { readLockfile, writeLockfile, removeAsset } from '../core/lockfile.js';
import { runSync } from './sync.js';
import { UsageError } from '../core/errors.js';

/**
 * remove <id>：移除已装资产。
 * 删 .agents/<type>/<file> + 从 lockfile 移除 + sync（GC 清理 agent 配置中的受管目标）。
 * company overlay 不动（用户覆盖，手动删）。
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

  // 删 .agents/<type>/<file>
  const targetFile = path.join(
    agentsDir(projectRoot),
    assetSubdir(entry.type),
    path.basename(entry.marketPath),
  );
  await fs.rm(targetFile, { force: true });

  // 从 lockfile 移除
  const updated = removeAsset(lock, id);
  await writeLockfile(lockPath, updated);

  console.log(`🗑 [remove] 已移除 ${id}（${entry.type}）`);
  console.log('   同步清理 agent 配置...');
  await runSync(projectRoot, { agent: opts.agent, copy: opts.copy });
}
