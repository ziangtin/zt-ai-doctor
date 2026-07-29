import fs from 'node:fs/promises';
import path from 'node:path';
import type { Lockfile, LockfileEntry, MarketSource } from './types.js';
import { LOCKFILE_SCHEMA_VERSION, validateLockfile } from './schema.js';

export async function readLockfile(filePath: string): Promise<Lockfile | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return validateLockfile(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** 读取 lockfile，校验失败返回 null（用于 init 等容错场景） */
export async function readLockfileOrNone(filePath: string): Promise<Lockfile | null> {
  try {
    return await readLockfile(filePath);
  } catch {
    return null;
  }
}

export async function writeLockfile(filePath: string, lock: Lockfile): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // 原子写：临时文件 + rename
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, filePath);
}

export function emptyLockfile(
  marketName: string,
  marketVersion: string,
  source: MarketSource,
): Lockfile {
  return {
    version: LOCKFILE_SCHEMA_VERSION,
    market: { name: marketName, version: marketVersion },
    source,
    trustedMcp: [],
    assets: [],
  };
}

/** 同 id 替换（per-rule 替换模型的基础），保持按 id 排序 */
export function upsertAsset(lock: Lockfile, entry: LockfileEntry): Lockfile {
  const assets = lock.assets.filter((a) => a.id !== entry.id);
  assets.push(entry);
  assets.sort((a, b) => a.id.localeCompare(b.id));
  return { ...lock, assets };
}

/** 从 lockfile 移除已装资产记录 */
export function removeAsset(lock: Lockfile, id: string): Lockfile {
  return { ...lock, assets: lock.assets.filter((a) => a.id !== id) };
}

/** 标记信任某 MCP */
export function trustMcp(lock: Lockfile, id: string): Lockfile {
  const trustedMcp = lock.trustedMcp?.includes(id)
    ? lock.trustedMcp
    : [...(lock.trustedMcp ?? []), id].sort();
  return { ...lock, trustedMcp };
}
