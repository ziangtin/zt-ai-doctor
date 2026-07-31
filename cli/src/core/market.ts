import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { LoadedAsset, Manifest, ManifestVersion } from './types.js';
import { assertWithinBase, validateAssetMeta, validateManifest } from './schema.js';
import { UsageError } from './errors.js';
import { normalizeVersion, maxVersionIndex } from './semver.js';
import { hashDir } from './hash.js';

/** 读取并校验药典 manifest */
export async function loadManifest(marketPath: string): Promise<Manifest> {
  const raw = await fs.readFile(path.join(marketPath, 'manifest.json'), 'utf8');
  return validateManifest(JSON.parse(raw));
}

/** 按 id 查找并加载资产（含路径越界防护、frontmatter 校验、manifest/frontmatter 一致性）。
 *  version 指定 -> 取该版本（找不到返回 null）；缺省 -> 取 semver 最高版本。 */
export async function findAssetById(
  marketPath: string,
  id: string,
  version?: string,
): Promise<LoadedAsset | null> {
  const manifest = await loadManifest(marketPath);
  const entry = manifest.assets.find((a) => a.id === id);
  if (!entry) return null;

  // 选版本：指定 -> 精确匹配（缺省视为 0.0.0）；缺省 -> semver 最高
  let v: ManifestVersion;
  if (version) {
    const want = normalizeVersion(version);
    const found = entry.versions.find((x) => normalizeVersion(x.version) === want);
    if (!found) return null;
    v = found;
  } else {
    const idx = maxVersionIndex(entry.versions);
    v = entry.versions[idx];
  }

  assertWithinBase(marketPath, v.path, `manifest 资产 ${entry.id}@${version ?? 'latest'} 的 path`);

  const full = path.join(marketPath, v.path);
  const raw = await fs.readFile(full, 'utf8');
  const parsed = matter(raw);
  const meta = validateAssetMeta(parsed.data);
  if (meta.id !== entry.id || meta.type !== entry.type) {
    throw new UsageError(
      `manifest 与 frontmatter 不一致: manifest=${entry.id}/${entry.type} frontmatter=${meta.id}/${meta.type}`,
    );
  }
  // manifest 声明 version 时，与 frontmatter version 一致性校验
  if (v.version && meta.version && v.version !== meta.version) {
    throw new UsageError(
      `manifest 与 frontmatter version 不一致: ${entry.id} manifest=${v.version} frontmatter=${meta.version}`,
    );
  }
  // 目录资产（skill <id>/SKILL.md）：hash 聚合整个目录；单文件资产（rule）：hash 文件内容
  const isDir = path.basename(v.path) === 'SKILL.md';
  const dirPath = isDir ? path.dirname(full) : undefined;
  const hash = isDir
    ? await hashDir(dirPath!)
    : createHash('sha256').update(raw).digest('hex');
  // entry.path 设为实际加载版本的 path，便于调用方展示
  return { entry: { ...entry, path: v.path }, meta, raw, content: parsed.content, hash, dirPath };
}
