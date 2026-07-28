import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { LoadedAsset, Manifest } from './types.js';
import { assertWithinBase, validateAssetMeta, validateManifest } from './schema.js';

/** 读取并校验药典 manifest */
export async function loadManifest(marketPath: string): Promise<Manifest> {
  const raw = await fs.readFile(path.join(marketPath, 'manifest.json'), 'utf8');
  return validateManifest(JSON.parse(raw));
}

/** 按 id 查找并加载资产（含路径越界防护、frontmatter 校验、manifest/frontmatter 一致性） */
export async function findAssetById(marketPath: string, id: string): Promise<LoadedAsset | null> {
  const manifest = await loadManifest(marketPath);
  const entry = manifest.assets.find((a) => a.id === id);
  if (!entry) return null;

  assertWithinBase(marketPath, entry.path, `manifest 资产 ${entry.id} 的 path`);

  const full = path.join(marketPath, entry.path);
  const raw = await fs.readFile(full, 'utf8');
  const parsed = matter(raw);
  const meta = validateAssetMeta(parsed.data);
  if (meta.id !== entry.id || meta.type !== entry.type) {
    throw new Error(
      `manifest 与 frontmatter 不一致: manifest=${entry.id}/${entry.type} frontmatter=${meta.id}/${meta.type}`,
    );
  }
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return { entry, meta, raw, content: parsed.content, hash };
}
