import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { LoadedAsset, Manifest } from './types.js';

/** 读取药典 manifest */
export async function loadManifest(marketPath: string): Promise<Manifest> {
  const raw = await fs.readFile(path.join(marketPath, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Manifest;
}

/** 按 id 查找并加载资产（含 frontmatter 解析 + 内容 hash） */
export async function findAssetById(marketPath: string, id: string): Promise<LoadedAsset | null> {
  const manifest = await loadManifest(marketPath);
  const entry = manifest.assets.find((a) => a.id === id);
  if (!entry) return null;

  const full = path.join(marketPath, entry.path);
  const raw = await fs.readFile(full, 'utf8');
  const parsed = matter(raw);
  const meta = parsed.data as LoadedAsset['meta'];
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return { entry, meta, raw, hash };
}
