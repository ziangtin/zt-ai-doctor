import fs from 'node:fs/promises';
import path from 'node:path';
import type { Lockfile, LockfileEntry } from './types.js';
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

export async function writeLockfile(filePath: string, lock: Lockfile): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // 原子写：临时文件 + rename
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, filePath);
}

export function emptyLockfile(marketName: string, marketVersion: string): Lockfile {
  return {
    version: LOCKFILE_SCHEMA_VERSION,
    market: { name: marketName, version: marketVersion },
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
