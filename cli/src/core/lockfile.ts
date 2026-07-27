import fs from 'node:fs/promises';
import path from 'node:path';
import type { Lockfile, LockfileEntry } from './types.js';

const SCHEMA_VERSION = '1';

export async function readLockfile(filePath: string): Promise<Lockfile | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as Lockfile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeLockfile(filePath: string, lock: Lockfile): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
}

export function emptyLockfile(marketName: string, marketVersion: string): Lockfile {
  return {
    version: SCHEMA_VERSION,
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
