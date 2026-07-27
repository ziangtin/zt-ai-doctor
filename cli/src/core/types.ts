export type AssetType = 'rule' | 'skill' | 'mcp' | 'prompt';
export type Layer = 'baseline' | 'personal';

/** 资产 frontmatter（canonical 元数据，agent-agnostic） */
export interface AssetMeta {
  id: string;
  type: AssetType;
  title: string;
  description: string;
  tags: string[];
  agents: string[];
  layer: Layer;
  priority: number;
  stack?: { deps?: string[]; files?: string[] };
}

/** market/manifest.json 中的资产索引项 */
export interface ManifestAssetEntry {
  id: string;
  type: AssetType;
  path: string;
}

export interface Manifest {
  name: string;
  version: string;
  description?: string;
  assets: ManifestAssetEntry[];
}

/** lockfile 中每条已装资产记录 */
export interface LockfileEntry {
  id: string;
  type: AssetType;
  hash: string;
  installedAt: string;
  marketPath: string;
}

export interface Lockfile {
  version: string;
  market: { name: string; version: string };
  assets: LockfileEntry[];
}

/** 从 market 加载到内存的完整资产 */
export interface LoadedAsset {
  entry: ManifestAssetEntry;
  meta: AssetMeta;
  raw: string;
  hash: string;
}
