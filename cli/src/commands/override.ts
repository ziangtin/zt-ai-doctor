import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, assetSubdir, resolveMarketPath } from '../core/paths.js';
import { findAssetById } from '../core/market.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * override <id>：从药典拷一个资产到 .agents/company/<type>/ 作为 company 覆盖起点。
 * 编辑后 sync 时按 id 覆盖 baseline/personal。不写 lockfile（company 是本地覆盖，不纳入药典版本）。
 */
export async function overrideCommand(
  projectRoot: string,
  id: string,
  opts: { market?: string },
): Promise<void> {
  const marketPath = resolveMarketPath(opts.market);
  const asset = await findAssetById(marketPath, id);
  if (!asset) {
    throw new Error(`药典中未找到: ${id}`);
  }

  const targetDir = path.join(agentsDir(projectRoot), 'company', assetSubdir(asset.meta.type));
  const targetFile = path.join(targetDir, path.basename(asset.entry.path));
  if (await exists(targetFile)) {
    throw new Error(
      `已存在 company 覆盖: ${path.relative(projectRoot, targetFile)}（直接编辑，或删除后重试）`,
    );
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetFile, asset.raw, 'utf8');
  console.log(`✓ company 覆盖已建：${path.relative(projectRoot, targetFile)}`);
  console.log(`   编辑该文件后运行 zai-doctor sync 生效（按 id 覆盖 baseline/personal）`);
}
