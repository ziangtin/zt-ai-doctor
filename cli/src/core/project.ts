import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { Layer, LoadedAsset, ManifestAssetEntry } from './types.js';
import { agentsDir } from './paths.js';
import { validateAssetMeta } from './schema.js';

/**
 * 扫描项目资产：
 * - .agents/<type>/  -> baseline + personal（layer 取自 frontmatter）
 * - .agents/company/<type>/ -> company 覆盖（layer 强制为 company）
 */
export async function loadProjectAssets(projectRoot: string): Promise<LoadedAsset[]> {
  const dir = agentsDir(projectRoot);
  const assets: LoadedAsset[] = [];

  for (const sub of ['rules', 'skills', 'mcp', 'prompts']) {
    await loadDir(path.join(dir, sub), dir, assets);
  }
  for (const sub of ['rules', 'skills', 'mcp', 'prompts']) {
    await loadDir(path.join(dir, 'company', sub), dir, assets, 'company');
  }
  return assets;
}

async function loadDir(
  subDir: string,
  baseDir: string,
  assets: LoadedAsset[],
  forceLayer?: Layer,
): Promise<void> {
  let files: string[];
  try {
    files = await fs.readdir(subDir);
  } catch {
    return; // 子目录不存在
  }
  for (const f of files.filter((x) => x.endsWith('.md'))) {
    const full = path.join(subDir, f);
    const raw = await fs.readFile(full, 'utf8');
    const parsed = matter(raw);
    const meta = validateAssetMeta(parsed.data);
    if (forceLayer) meta.layer = forceLayer;
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const entry: ManifestAssetEntry = {
      id: meta.id,
      type: meta.type,
      path: path.relative(baseDir, full),
    };
    assets.push({ entry, meta, raw, content: parsed.content, hash });
  }
}
