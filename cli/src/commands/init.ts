import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, lockfilePath, resolveMarketPath } from '../core/paths.js';
import { loadManifest } from '../core/market.js';
import { emptyLockfile, readLockfileOrNone, writeLockfile } from '../core/lockfile.js';
import { hashFileFull } from '../core/hash.js';
import type { MarketSource } from '../core/types.js';

/** .agents/ 内自带的 gitignore：忽略生成物，保留 rules/skills/mcp/zai.lock.json */
const AGENTS_GITIGNORE = `.build/
README.md
company/
`;

export async function initCommand(projectRoot: string, opts: { market?: string }): Promise<void> {
  const dir = agentsDir(projectRoot);

  for (const sub of ['rules', 'skills', 'mcp', 'prompts', '.build']) {
    await fs.mkdir(path.join(dir, sub), { recursive: true });
  }
  for (const sub of ['rules', 'skills', 'mcp', 'prompts']) {
    await fs.mkdir(path.join(dir, 'company', sub), { recursive: true });
  }
  await fs.writeFile(path.join(dir, '.gitignore'), AGENTS_GITIGNORE, 'utf8');

  const marketPath = resolveMarketPath(opts.market);
  const manifest = await loadManifest(marketPath);
  const integrity = await hashFileFull(path.join(marketPath, 'manifest.json'));
  const source: MarketSource = { type: 'local', uri: marketPath, ref: '', integrity };

  const lockPath = lockfilePath(projectRoot);
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
