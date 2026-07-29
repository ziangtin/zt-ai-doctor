import path from 'node:path';
import { lockfilePath, marketSourceUri, resolveMarketPath } from '../core/paths.js';
import { loadManifest } from '../core/market.js';
import { readLockfile, writeLockfile } from '../core/lockfile.js';
import { hashFileFull } from '../core/hash.js';
import { syncGitSource, gitHead } from '../core/source.js';
import { UsageError } from '../core/errors.js';
import type { MarketSource } from '../core/types.js';

/**
 * 药典更新。
 * --source <git-url>：从 git 拉取到缓存（首次 clone，后续 pull），记录 git 来源与 commit。
 * 否则：刷新本地药典版本与 integrity。
 */
export async function updateCommand(
  projectRoot: string,
  opts: { market?: string; source?: string; ref?: string },
): Promise<void> {
  const lockPath = lockfilePath(projectRoot);
  const lock = await readLockfile(lockPath);
  if (!lock) {
    throw new UsageError('未建档，先运行 zai-doctor init');
  }

  const oldVer = lock.market.version;
  let marketPath = resolveMarketPath(opts.market);
  let source: MarketSource;

  if (opts.source) {
    marketPath = await syncGitSource(opts.source, opts.ref);
    const ref = await gitHead(marketPath);
    const manifest = await loadManifest(marketPath);
    const integrity = await hashFileFull(path.join(marketPath, 'manifest.json'));
    source = { type: 'git', uri: opts.source, ref, integrity };
    lock.market = { name: manifest.name, version: manifest.version };
  } else {
    const manifest = await loadManifest(marketPath);
    const integrity = await hashFileFull(path.join(marketPath, 'manifest.json'));
    source = { type: 'local', uri: marketSourceUri(marketPath), ref: '', integrity };
    lock.market = { name: manifest.name, version: manifest.version };
  }

  lock.source = source;
  await writeLockfile(lockPath, lock);

  console.log(`📚 [update] 药典 ${lock.market.name}：${oldVer} -> ${lock.market.version}`);
  console.log(`   source: ${source.type} ${source.uri}${source.ref ? `@${source.ref.slice(0, 8)}` : ''}`);
  console.log(`   integrity: ${source.integrity.slice(0, 16)}…`);
  if (opts.source) {
    console.log(`   已拉取到缓存，后续 treat/sync 用 --market ${marketPath} 或重跑 init`);
  }
}
