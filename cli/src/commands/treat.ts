import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, assetSubdir, lockfilePath, resolveMarketPath } from '../core/paths.js';
import { findAssetById } from '../core/market.js';
import { readLockfile, upsertAsset, writeLockfile } from '../core/lockfile.js';
import { runSync } from './sync.js';
import { UsageError } from '../core/errors.js';
import { readPrescriptionSelection } from '../core/prescription.js';

/**
 * 下药：install + sync。
 * install：把指定资产从药典拷进 .agents/<type>/，更新 lockfile。
 * sync：渲染成各 agent 配置（软链优先/降级 copy）+ placement 报告。
 * 不带 ids 时按处方单（.agents/.build/prescription.md）勾选抓药。任意 id 未找到 -> 退出码 2（参数错误）。
 */
export async function treatCommand(
  projectRoot: string,
  ids: string[],
  opts: { market?: string; agent?: string; copy?: boolean },
): Promise<void> {
  let toInstall = ids;
  if (toInstall.length === 0) {
    const selected = await readPrescriptionSelection(projectRoot);
    if (selected === null) {
      console.log('💉 [treat] 无处方单，先运行 zai-doctor prescribe，或 zai-doctor treat <id> [id...]');
      return;
    }
    if (selected.length === 0) {
      console.log('💉 [treat] 处方单无勾选，编辑 .agents/.build/prescription.md 勾选 [x] 后重试');
      return;
    }
    toInstall = selected;
    console.log(`💉 [treat] 按处方单抓药：${toInstall.join(', ')}`);
  }

  const lockPath = lockfilePath(projectRoot);
  let lock = await readLockfile(lockPath);
  if (!lock) {
    throw new UsageError('未建档，先运行 zai-doctor init');
  }

  const marketPath = resolveMarketPath(opts.market);
  const lines: string[] = [];
  let notFound = 0;

  for (const id of toInstall) {
    const asset = await findAssetById(marketPath, id);
    if (!asset) {
      lines.push(`✗ ${id}  药典中未找到`);
      notFound++;
      continue;
    }
    const { entry, meta, raw, hash } = asset;
    const targetDir = path.join(agentsDir(projectRoot), assetSubdir(meta.type));
    const targetFile = path.join(targetDir, path.basename(entry.path));
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetFile, raw, 'utf8');
    lock = upsertAsset(lock, {
      id,
      type: meta.type,
      hash,
      installedAt: new Date().toISOString(),
      marketPath: entry.path,
    });
    lines.push(`✓ ${id}  -> ${path.relative(projectRoot, targetFile)}`);
  }

  await writeLockfile(lockPath, lock);
  console.log('💉 [treat] 抓药完成：');
  for (const line of lines) console.log(`  ${line}`);
  console.log(`   lockfile 已更新（共 ${lock.assets.length} 项）`);

  console.log('   同步到 agent 配置...');
  await runSync(projectRoot, { agent: opts.agent, copy: opts.copy });

  if (notFound > 0) {
    process.exit(2);
  }
}
