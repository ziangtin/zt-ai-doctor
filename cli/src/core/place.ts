import fs from 'node:fs/promises';
import path from 'node:path';
import type { Placement, PlacementRecord } from './types.js';
import { hashFile, hashDir } from './hash.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export interface PlaceResult {
  placement: Placement;
  record: PlacementRecord | null;
}

/**
 * 放置一个产物。软链优先，权限不足降级 copy；forceCopy 时直接 copy。
 *
 * 受管文件冲突保护（修复 Windows copy 降级后重同步失效）：
 * - 目标是符号链接 -> 替换（我们的）
 * - 目标是普通文件，hash == 即将放置的内容 hash -> 已是最新，no-op
 * - 目标是普通文件，hash == 上次 manifest 记录的 hash -> 我们的受管 copy，源已更新，可覆盖
 * - 否则（用户改过 / 未知文件）-> 冲突，skip
 *
 * record.sourcePath 存相对 projectRoot 的相对路径（不泄漏本地绝对路径；
 * 源恒在 .agents/ 下，故 relative 不会越界）。内部 hash/copy/symlink 仍用 p.sourcePath 绝对路径。
 */
export async function place(
  p: Placement,
  prev: PlacementRecord | undefined,
  forceCopy: boolean,
  projectRoot: string,
): Promise<PlaceResult> {
  if (p.action === 'skip') return { placement: p, record: null };
  if (p.kind === 'dir') return placeDir(p, prev, forceCopy, projectRoot);
  await fs.mkdir(path.dirname(p.targetPath), { recursive: true });
  const sourceHash = await hashFile(p.sourcePath);
  const sourceRel = path.relative(projectRoot, p.sourcePath);

  if (await exists(p.targetPath)) {
    const stat = await fs.lstat(p.targetPath);
    if (stat.isSymbolicLink()) {
      await fs.rm(p.targetPath);
    } else {
      const targetHash = await hashFile(p.targetPath);
      if (targetHash === sourceHash) {
        // 已是最新：内容与即将放置的一致
        const action: 'symlink' | 'copy' = prev?.action ?? 'copy';
        const record: PlacementRecord = {
          targetPath: p.targetPath,
          agent: p.agent,
          action,
          sourcePath: sourceRel,
          hash: sourceHash,
          assetIds: p.assetIds,
        };
        return { placement: { ...p, action, reason: '已是最新' }, record };
      }
      if (prev && targetHash === prev.hash) {
        // 我们的受管 copy，源已更新 -> 覆盖
        await fs.rm(p.targetPath);
      } else {
        // 用户改动或未知 -> 冲突，不覆盖
        return {
          placement: { ...p, action: 'skip', reason: '目标已被修改，未覆盖（受管文件冲突，删除后重跑 sync）' },
          record: null,
        };
      }
    }
  }

  // 放置
  let action: 'symlink' | 'copy' = 'symlink';
  if (!forceCopy) {
    const linkTarget = path.relative(path.dirname(p.targetPath), p.sourcePath);
    try {
      await fs.symlink(linkTarget, p.targetPath, 'file');
    } catch {
      await fs.copyFile(p.sourcePath, p.targetPath);
      action = 'copy';
    }
  } else {
    await fs.copyFile(p.sourcePath, p.targetPath);
    action = 'copy';
  }

  const record: PlacementRecord = {
    targetPath: p.targetPath,
    agent: p.agent,
    action,
    sourcePath: sourceRel,
    hash: sourceHash,
    assetIds: p.assetIds,
  };
  return { placement: { ...p, action }, record };
}

/** 目录级放置（skill 目录资产）。软链目录优先，权限不足降级递归 copy；冲突保护用 hashDir。
 *  逻辑与 place() 单文件版对称：symlink 替换 / hash 一致 no-op / 受管可覆盖 / 否则冲突 skip。 */
async function placeDir(
  p: Placement,
  prev: PlacementRecord | undefined,
  forceCopy: boolean,
  projectRoot: string,
): Promise<PlaceResult> {
  await fs.mkdir(path.dirname(p.targetPath), { recursive: true });
  const sourceHash = await hashDir(p.sourcePath);
  const sourceRel = path.relative(projectRoot, p.sourcePath);

  if (await exists(p.targetPath)) {
    const stat = await fs.lstat(p.targetPath);
    if (stat.isSymbolicLink()) {
      await fs.rm(p.targetPath, { recursive: true });
    } else {
      const targetHash = await hashDir(p.targetPath);
      if (targetHash === sourceHash) {
        const action: 'symlink' | 'copy' = prev?.action ?? 'copy';
        const record: PlacementRecord = {
          targetPath: p.targetPath,
          agent: p.agent,
          action,
          sourcePath: sourceRel,
          hash: sourceHash,
          assetIds: p.assetIds,
          kind: 'dir',
        };
        return { placement: { ...p, action, reason: '已是最新' }, record };
      }
      if (prev && targetHash === prev.hash) {
        await fs.rm(p.targetPath, { recursive: true });
      } else {
        return {
          placement: { ...p, action: 'skip', reason: '目标目录已被修改，未覆盖（受管冲突，删除后重跑 sync）' },
          record: null,
        };
      }
    }
  }

  let action: 'symlink' | 'copy' = 'symlink';
  if (!forceCopy) {
    const linkTarget = path.relative(path.dirname(p.targetPath), p.sourcePath);
    try {
      await fs.symlink(linkTarget, p.targetPath, 'dir');
    } catch {
      await fs.cp(p.sourcePath, p.targetPath, { recursive: true });
      action = 'copy';
    }
  } else {
    await fs.cp(p.sourcePath, p.targetPath, { recursive: true });
    action = 'copy';
  }

  const record: PlacementRecord = {
    targetPath: p.targetPath,
    agent: p.agent,
    action,
    sourcePath: sourceRel,
    hash: sourceHash,
    assetIds: p.assetIds,
    kind: 'dir',
  };
  return { placement: { ...p, action }, record };
}

/** GC 用：清理上一轮受管、本轮未再生成的目标（仅当未被用户改过） */
export async function removeIfManaged(rec: PlacementRecord): Promise<'removed' | 'conflict' | 'gone'> {
  if (!(await exists(rec.targetPath))) return 'gone';
  const stat = await fs.lstat(rec.targetPath);
  if (stat.isSymbolicLink()) {
    await fs.rm(rec.targetPath, { recursive: true });
    return 'removed';
  }
  const h = rec.kind === 'dir' ? await hashDir(rec.targetPath) : await hashFile(rec.targetPath);
  if (h === rec.hash) {
    await fs.rm(rec.targetPath, { recursive: rec.kind === 'dir' });
    return 'removed';
  }
  return 'conflict';
}
