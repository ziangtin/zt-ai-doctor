export type AssetType = 'rule' | 'skill' | 'mcp' | 'prompt';
export type Layer = 'baseline' | 'personal';

/** 层级覆盖记录（sync 时同 id 出现在多层） */
export interface LayerOverride {
  id: string;
  layers: string[];
  winner: string;
}

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
  /** 资产版本（semver，权威来源）。缺省视为 0.0.0（未版本化）。 */
  version?: string;
}

/** manifest 中某个资产的一个版本项 */
export interface ManifestVersion {
  /** 版本号（semver）。新格式声明；旧单 path 格式归一化时留空，从 frontmatter 读。 */
  version?: string;
  path: string;
}

/** market/manifest.json 中的资产索引项 */
export interface ManifestAssetEntry {
  id: string;
  type: AssetType;
  /** 最新版本 path（归一化填，兼容现有 entry.path 调用） */
  path: string;
  /** 所有版本；旧单 path 格式归一化为单元素数组（version 留空，从 frontmatter 读） */
  versions: ManifestVersion[];
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
  /** 装时版本快照（semver）。旧 lockfile 无此字段，视为 0.0.0。 */
  version?: string;
  installedAt: string;
  marketPath: string;
}

export interface MarketSource {
  type: 'local' | 'git' | 'npm';
  uri: string;
  ref: string;
  integrity: string; // sha256 of manifest.json (64 hex)
}

export interface Lockfile {
  version: string;
  market: { name: string; version: string };
  source: MarketSource;
  trustedMcp: string[];
  assets: LockfileEntry[];
}

/** 从 market / .agents/ 加载到内存的完整资产 */
export interface LoadedAsset {
  entry: ManifestAssetEntry;
  meta: AssetMeta;
  raw: string;
  /** 正文（去掉 frontmatter） */
  content: string;
  hash: string;
  /** 目录资产的目录绝对路径（skill <id>/SKILL.md）；单文件资产为 undefined。
   *  有 dirPath 即目录资产，hash 为目录聚合 hash。 */
  dirPath?: string;
}

/** sync 渲染后的一个放置项 */
export interface Placement {
  assetIds: string[];
  agent: string;
  targetPath: string;
  sourcePath: string;
  action: 'symlink' | 'copy' | 'skip';
  reason?: string;
  aggregate?: boolean;
  /** 放置形态：file 单文件（默认）/ dir 整个目录（skill 目录资产） */
  kind?: 'file' | 'dir';
}

/** placement manifest 中的一条受管记录（用于重同步与 GC） */
export interface PlacementRecord {
  targetPath: string;
  agent: string;
  action: 'symlink' | 'copy';
  /** 相对 projectRoot 的相对路径（不泄漏本地绝对路径）；运行期绝对路径见 Placement.sourcePath */
  sourcePath: string;
  hash: string;
  assetIds: string[];
  /** 放置形态：file 单文件（默认，兼容旧 manifest）/ dir 整个目录 */
  kind?: 'file' | 'dir';
}

export interface RenderContext {
  buildDir: string;
  projectRoot: string;
}

export interface AgentRenderer {
  name: string;
  supports: AssetType[];
  /** agent 配置探测：项目根下是否存在该 agent 的配置标记（不是机器是否安装，后者见 envDetect） */
  detectConfig: (projectRoot: string) => Promise<boolean>;
  renderAll: (assets: LoadedAsset[], ctx: RenderContext) => Promise<Placement[]>;
}
