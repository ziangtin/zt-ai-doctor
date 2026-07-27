import { findAssetById } from '../core/market.js';
import { readLockfile } from '../core/lockfile.js';
import { lockfilePath, resolveMarketPath } from '../core/paths.js';

/** info <id>：看某个资产详情 + 已装状态 + hash 一致性 */
export async function infoCommand(
  projectRoot: string,
  id: string,
  opts: { market?: string; full?: boolean },
): Promise<void> {
  const marketPath = resolveMarketPath(opts.market);
  const asset = await findAssetById(marketPath, id);
  if (!asset) {
    throw new Error(`药典中未找到: ${id}`);
  }
  const { meta, entry, hash, content } = asset;
  const lock = await readLockfile(lockfilePath(projectRoot));
  const installed = lock?.assets.find((a) => a.id === id);

  console.log(`📖 ${meta.id}`);
  console.log(`   type:        ${meta.type}`);
  console.log(`   title:       ${meta.title ?? '-'}`);
  console.log(`   description: ${meta.description ?? '-'}`);
  console.log(`   tags:        ${(meta.tags ?? []).join(', ') || '-'}`);
  console.log(`   agents:      ${(meta.agents ?? []).join(', ') || '-'}`);
  console.log(`   layer:       ${meta.layer ?? '-'}    priority: ${meta.priority ?? '-'}`);
  if (meta.stack) {
    console.log(
      `   stack:       deps=[${meta.stack.deps?.join(', ') ?? ''}] files=[${meta.stack.files?.join(', ') ?? ''}]`,
    );
  }
  console.log(`   marketPath:  ${entry.path}`);
  console.log(`   hash:        ${hash}`);
  console.log(`   药典版本:     ${lock?.market.version ?? '(未建档)'}`);
  if (installed) {
    const match = installed.hash === hash ? '' : '  ⚠ 与药典不一致（药典已更新，重跑 treat）';
    console.log(`   已装:        是  (hash ${installed.hash}${match})`);
  } else {
    console.log(`   已装:        否`);
  }

  if (opts.full) {
    console.log('');
    console.log('--- 正文 ---');
    console.log(content.trim());
  }
}
