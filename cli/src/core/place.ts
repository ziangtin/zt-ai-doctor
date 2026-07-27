import fs from 'node:fs/promises';
import path from 'node:path';
import type { Placement } from './types.js';

/**
 * 执行放置：软链优先，权限不足降级 copy。
 * - 目标已是符号链接：删后重建
 * - 目标是普通文件/目录：不覆盖，转 skip（保护用户手写文件）
 * - Windows 软链需开发者模式/管理员权限，失败则自动 copy
 */
export async function place(p: Placement): Promise<Placement> {
  if (p.action === 'skip') return p;
  await fs.mkdir(path.dirname(p.targetPath), { recursive: true });

  // 处理已存在的目标
  try {
    const stat = await fs.lstat(p.targetPath);
    if (stat.isSymbolicLink()) {
      await fs.rm(p.targetPath);
    } else {
      return { ...p, action: 'skip', reason: '目标已是普通文件，未覆盖（删除后重跑 sync）' };
    }
  } catch {
    // ENOENT：目标不存在，继续
  }

  // 相对软链（可移植）
  const linkTarget = path.relative(path.dirname(p.targetPath), p.sourcePath);
  try {
    await fs.symlink(linkTarget, p.targetPath, 'file');
    return { ...p, action: 'symlink' };
  } catch {
    // 软链失败（EPERM 等）：降级 copy
    await fs.copyFile(p.sourcePath, p.targetPath);
    return { ...p, action: 'copy', reason: '软链失败（权限？），已 copy' };
  }
}
