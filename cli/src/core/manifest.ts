import fs from 'node:fs/promises';
import path from 'node:path';
import type { PlacementRecord } from './types.js';
import { agentsDir } from './paths.js';

const FILE = 'placements.json';

export function manifestPath(projectRoot: string): string {
  return path.join(agentsDir(projectRoot), '.build', FILE);
}

export async function readManifest(projectRoot: string): Promise<Map<string, PlacementRecord>> {
  try {
    const raw = await fs.readFile(manifestPath(projectRoot), 'utf8');
    const data = JSON.parse(raw) as { placements: PlacementRecord[] };
    const map = new Map<string, PlacementRecord>();
    for (const p of data.placements ?? []) map.set(p.targetPath, p);
    return map;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw e;
  }
}

export async function writeManifest(projectRoot: string, records: PlacementRecord[]): Promise<void> {
  const p = manifestPath(projectRoot);
  await fs.mkdir(path.dirname(p), { recursive: true });
  // 原子写：临时文件 + rename
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ placements: records }, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, p);
}
