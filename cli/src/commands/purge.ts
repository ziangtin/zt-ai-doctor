import path from 'node:path';
import { readManifest, writeManifest } from '../core/manifest.js';
import { removeIfManaged } from '../core/place.js';
import { loadAgentConfig } from '../core/agentConfig.js';
import { syncGitignore } from '../core/gitignore.js';
import { UsageError } from '../core/errors.js';

/**
 * purge <agent>：清除某个 agent 的全部受管配置（sync 渲染产物）。
 * 按 placement manifest 过滤该 agent 的受管目标，逐个安全删除（用户改过的冲突跳过，留盘），
 * 从 manifest 移除该 agent 记录，并刷新 .gitignore 受管段。
 * 不动 .agents/ 源资产与 lockfile，不影响其他 agent。
 */
export async function purgeCommand(projectRoot: string, agent: string): Promise<void> {
  const configs = await loadAgentConfig(projectRoot);
  const known = new Set(configs.map((c) => c.name));

  const prev = await readManifest(projectRoot);
  const agentRecords = [...prev.values()].filter((r) => r.agent === agent);

  if (agentRecords.length === 0) {
    if (known.has(agent)) {
      console.log(`🧹 [purge] ${agent} 无受管配置`);
      return;
    }
    throw new UsageError(`未知 agent: ${agent}（可选: ${[...known].join(', ')}）`);
  }

  const removed: string[] = [];
  const conflicts: string[] = [];
  for (const rec of agentRecords) {
    const res = await removeIfManaged(rec);
    if (res === 'conflict') conflicts.push(rec.targetPath);
    else removed.push(rec.targetPath); // 'removed' | 'gone'
  }

  // 从 manifest 移除该 agent 全部记录（含冲突--与 sync GC 一致：冲突文件留盘但不再受管）
  const remaining = [...prev.values()].filter((r) => r.agent !== agent);
  await writeManifest(projectRoot, remaining);

  // 刷新 .gitignore 受管段（基于剩余 manifest 的 agent 集合）
  const remainingAgents = new Set(remaining.map((r) => r.agent));
  await syncGitignore(projectRoot, remainingAgents, configs);

  console.log(`🧹 [purge] 已清除 ${agent} 的 ${removed.length} 项受管配置：`);
  for (const t of removed) console.log(`   🗑 ${path.relative(projectRoot, t)}`);
  if (conflicts.length) {
    console.log(`   ⚠ ${conflicts.length} 项已被修改未清除（手动删后重跑 purge）：`);
    for (const t of conflicts) console.log(`   ⚠ ${path.relative(projectRoot, t)}`);
  }
  console.log('   .gitignore：受管产物段已刷新');
}
