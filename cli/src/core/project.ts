import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { AssetMeta, LoadedAsset, ManifestAssetEntry } from './types.js';
import { agentsDir } from './paths.js';
import { validateAssetMeta } from './schema.js';

/**
 * 扫描项目资产：.agents/<type>/*.md，layer 取自 frontmatter（baseline/personal）。
 * 注意：MCP 不在此扫描（单文件 .agents/mcp.json，见 mcpStore.loadProjectMcp）。
 * 残留的 <id>.override.md（已移除的 company 覆盖机制）一律跳过，不作为资产。
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

  for (const sub of ['rules', 'skills', 'prompts']) {
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
    if (f.endsWith('.override.md')) continue; // 残留覆盖文件，忽略
    const full = path.join(subDir, f);
    const raw = await fs.readFile(full, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    // 无 id 且无 type -> 非资产（项目自有 .md），跳过不校验、不报错、不参与 sync
    if (data.id === undefined && data.type === undefined) {
      continue;
    }
    let meta: AssetMeta;
    try {
      meta = validateAssetMeta(data);
    } catch (e) {
      errors.push(`${path.relative(baseDir, full)}: ${(e as Error).message}`);
      continue;
    }
    const hash = createHash('sha256').update(raw).digest('hex');
    const rel = path.relative(baseDir, full);
    const entry: ManifestAssetEntry = {
      id: meta.id,
      type: meta.type,
      path: rel,
      versions: [{ path: rel }],
    };
    assets.push({ entry, meta, raw, content: parsed.content, hash });
  }
}
