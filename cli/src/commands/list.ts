import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { AssetMeta } from '../core/types.js';
import { loadManifest } from '../core/market.js';
import { readLockfile } from '../core/lockfile.js';
import { lockfilePath, resolveMarketPath } from '../core/paths.js';

/** list：列出药典资产 + 已装状态，可按 type/tag 筛选 */
export async function listCommand(
  projectRoot: string,
  opts: { market?: string; type?: string; tag?: string },
): Promise<void> {
  const marketPath = resolveMarketPath(opts.market);
  const manifest = await loadManifest(marketPath);
  const lock = await readLockfile(lockfilePath(projectRoot));
  const installedIds = new Set((lock?.assets ?? []).map((a) => a.id));

  const enriched: { meta: AssetMeta }[] = [];
  for (const entry of manifest.assets) {
    const raw = await fs.readFile(path.join(marketPath, entry.path), 'utf8');
    const meta = matter(raw).data as AssetMeta;
    enriched.push({ meta });
  }

  let filtered = enriched;
  if (opts.type) filtered = filtered.filter((e) => e.meta.type === opts.type);
  if (opts.tag) filtered = filtered.filter((e) => (e.meta.tags ?? []).includes(opts.tag as string));

  const filterNote = opts.type || opts.tag ? `，筛选后 ${filtered.length}` : '';
  console.log(`📖 药典 ${manifest.name}@${manifest.version}（共 ${enriched.length} 项${filterNote}）`);
  console.log(`   已建档：${lock ? `${lock.assets.length} 项` : '未建档'}`);
  console.log('');

  for (const { meta } of filtered) {
    const mark = installedIds.has(meta.id) ? '✓' : '·';
    const tags = (meta.tags ?? []).join(', ') || '-';
    const ver = meta.version ? `@${meta.version}` : '';
    console.log(`  ${mark} ${meta.id}${ver}  [${meta.type}]  tags: ${tags}`);
    if (meta.title) console.log(`      ${meta.title}`);
  }
}
