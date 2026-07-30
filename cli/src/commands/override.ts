import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { agentsDir, assetSubdir, resolveMarketPath } from '../core/paths.js';
import { findAssetById } from '../core/market.js';
import { UsageError } from '../core/errors.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * override <id>：从药典拷一个资产到 .agents/<type>/<id>.override.md 作为覆盖起点。
 * frontmatter 标记 layer: company，sync 时按 id 覆盖 baseline/personal。
 * 不写 lockfile（覆盖是本地定制，不纳入药典版本）。
 */
export async function overrideCommand(
  projectRoot: string,
  id: string,
  opts: { market?: string },
): Promise<void> {
  const marketPath = resolveMarketPath(opts.market);
  const asset = await findAssetById(marketPath, id);
  if (!asset) {
    throw new UsageError(`药典中未找到: ${id}`);
  }
  if (asset.meta.type === 'mcp') {
    throw new UsageError('MCP 不支持 override（单文件 .agents/mcp.json 模型，直接编辑该文件）');
  }

  const targetDir = path.join(agentsDir(projectRoot), assetSubdir(asset.meta.type));
  const targetFile = path.join(targetDir, `${asset.meta.id}.override.md`);
  if (await exists(targetFile)) {
    throw new UsageError(
      `已存在覆盖: ${path.relative(projectRoot, targetFile)}（直接编辑，或删除后重试）`,
    );
  }

  // 拷贝药典原文，强制 frontmatter layer: company（无 company/ 目录后靠 frontmatter 区分层级）
  // 用新对象而非修改 matter 返回的 data，避免污染同进程后续 matter() 调用
  const parsed = matter(asset.raw);
  const out = matter.stringify(parsed.content, { ...parsed.data, layer: 'company' });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetFile, out, 'utf8');
  console.log(`✓ 覆盖已建：${path.relative(projectRoot, targetFile)}`);
  console.log(`   编辑该文件后运行 zai-doctor sync 生效（layer: company，按 id 覆盖 baseline）`);
}
