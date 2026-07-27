import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { AssetMeta, LoadedAsset, ManifestAssetEntry } from './types.js';
import { agentsDir } from './paths.js';

/** 扫描 .agents/{rules,skills,mcp,prompts} 下所有 .md 资产（Phase 2：只读 baseline） */
export async function loadProjectAssets(projectRoot: string): Promise<LoadedAsset[]> {
  const dir = agentsDir(projectRoot);
  const assets: LoadedAsset[] = [];

  for (const sub of ['rules', 'skills', 'mcp', 'prompts']) {
    const subDir = path.join(dir, sub);
    let files: string[];
    try {
      files = await fs.readdir(subDir);
    } catch {
      continue; // 子目录不存在
    }
    for (const f of files.filter((x) => x.endsWith('.md'))) {
      const full = path.join(subDir, f);
      const raw = await fs.readFile(full, 'utf8');
      const parsed = matter(raw);
      const meta = parsed.data as AssetMeta;
      const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
      const entry: ManifestAssetEntry = {
        id: meta.id,
        type: meta.type,
        path: path.relative(dir, full),
      };
      assets.push({ entry, meta, raw, content: parsed.content, hash });
    }
  }
  return assets;
}
