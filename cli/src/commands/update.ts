import { lockfilePath, resolveMarketPath } from '../core/paths.js';
import { loadManifest } from '../core/market.js';
import { readLockfile, writeLockfile } from '../core/lockfile.js';

/**
 * 药典更新（Phase 1）。
 * MVP：药典是本地目录，update 刷新 lockfile 里的药典版本。
 * 后续换成 npm/git 源时，这里加真正的拉取逻辑。
 */
export async function updateCommand(projectRoot: string, opts: { market?: string }): Promise<void> {
  const lockPath = lockfilePath(projectRoot);
  const lock = await readLockfile(lockPath);
  if (!lock) {
    throw new Error('未建档，先运行 zai-doctor init');
  }

  const marketPath = resolveMarketPath(opts.market);
  const manifest = await loadManifest(marketPath);
  const oldVer = lock.market.version;
  lock.market = { name: manifest.name, version: manifest.version };
  await writeLockfile(lockPath, lock);

  console.log(`📚 [update] 药典 ${manifest.name}：${oldVer} -> ${manifest.version}`);
  console.log(`   药典路径：${marketPath}`);
}
