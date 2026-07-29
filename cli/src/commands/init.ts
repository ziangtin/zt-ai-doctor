import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, lockfilePath, marketSourceUri, resolveMarketPath } from '../core/paths.js';
import { loadManifest } from '../core/market.js';
import { emptyLockfile, readLockfileOrNone, writeLockfile } from '../core/lockfile.js';
import { hashFileFull } from '../core/hash.js';
import type { MarketSource } from '../core/types.js';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** .agents/ 内自带的 gitignore：忽略生成物，保留 rules/skills/mcp 与用户覆盖（*.override.md） */
const AGENTS_GITIGNORE = `.build/
README.md
`;

export async function initCommand(projectRoot: string, opts: { market?: string }): Promise<void> {
  const dir = agentsDir(projectRoot);

  for (const sub of ['rules', 'skills', 'mcp', 'prompts', '.build']) {
    await fs.mkdir(path.join(dir, sub), { recursive: true });
  }
  await fs.writeFile(path.join(dir, '.gitignore'), AGENTS_GITIGNORE, 'utf8');

  const marketPath = resolveMarketPath(opts.market);
  const manifest = await loadManifest(marketPath);
  const integrity = await hashFileFull(path.join(marketPath, 'manifest.json'));
  const source: MarketSource = { type: 'local', uri: marketSourceUri(marketPath), ref: '', integrity };

  const lockPath = lockfilePath(projectRoot);
  // 迁移旧名 zai.lock.json -> zai-doctor.lock.json（仅当新不存在且旧存在时；老用户无感升级，不丢 assets/trustedMcp）
  const oldLockPath = path.join(dir, 'zai.lock.json');
  if (!(await pathExists(lockPath)) && (await pathExists(oldLockPath))) {
    await fs.rename(oldLockPath, lockPath);
    console.log(`💊 [init] 已迁移旧 lockfile -> ${path.relative(projectRoot, lockPath)}`);
  }
  const existing = await readLockfileOrNone(lockPath);
  const lock = existing ?? emptyLockfile(manifest.name, manifest.version, source);
  lock.market = { name: manifest.name, version: manifest.version };
  lock.source = source;
  await writeLockfile(lockPath, lock);

  console.log(`💊 [init] 建档完成：${path.relative(projectRoot, dir) || '.agents'}`);
  console.log(`   药典：${manifest.name}@${manifest.version}`);
  console.log(`   药典路径：${marketPath}`);
  console.log(`   lockfile：${path.relative(projectRoot, lockPath)}`);
  console.log(`   integrity：${integrity.slice(0, 16)}…`);
  console.log(`   已建档资产：${lock.assets.length}`);
}
