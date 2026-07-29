import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { AssetMeta, LoadedAsset, ManifestAssetEntry } from './types.js';
import { agentsDir } from './paths.js';
import { validateAssetMeta } from './schema.js';

/**
 * 扫描项目资产：.agents/<type>/*.md，layer 取自 frontmatter（baseline/personal/company）。
 * 用户覆盖（override）文件 <id>.override.md 也在同一目录，frontmatter 标 layer: company。
 */
export interface LoadProjectResult {
  assets: LoadedAsset[];
  /** 加载失败的 .md（缺 id/type frontmatter 等），不阻塞扫描 */
  errors: string[];
}

export async function loadProjectAssets(projectRoot: string): Promise<LoadProjectResult> {
  const dir = agentsDir(projectRoot);
  const assets: LoadedAsset[] = [];
  const errors: string[] = [];

  for (const sub of ['rules', 'skills', 'mcp', 'prompts']) {
    await loadDir(path.join(dir, sub), dir, assets, errors);
  }
  return { assets, errors };
}

async function loadDir(
  subDir: string,
  baseDir: string,
  assets: LoadedAsset[],
  errors: string[],
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
    let meta: AssetMeta;
    try {
      meta = validateAssetMeta(parsed.data);
    } catch (e) {
      errors.push(`${path.relative(baseDir, full)}: ${(e as Error).message}`);
      continue;
    }
    const hash = createHash('sha256').update(raw).digest('hex');
    const entry: ManifestAssetEntry = {
      id: meta.id,
      type: meta.type,
      path: path.relative(baseDir, full),
    };
    assets.push({ entry, meta, raw, content: parsed.content, hash });
  }
}
