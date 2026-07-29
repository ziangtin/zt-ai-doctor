import fs from 'node:fs/promises';
import { z } from 'zod';
import { bundledAgentsConfigPath, projectAgentsConfigPath } from './paths.js';
import { agentsDir } from './paths.js';
import { UsageError } from './errors.js';
import type { AssetType } from './types.js';

const actionSchema = z.enum(['symlink', 'copy']);
const assetTypeSchema = z.enum(['rule', 'skill', 'mcp', 'prompt']);

/** 单个映射：agent×资产类型 -> 目标路径/聚合/action/转换 */
const mappingSchema = z.object({
  targetPath: z.string().min(1),
  aggregate: z.boolean(),
  action: actionSchema.default('symlink'),
  /** 转换 profile 名（见 renderers/transforms.ts） */
  transform: z.string().min(1),
  /** 聚合产物的源文件位置（相对 .agents/，默认 .build/<agent>/<basename>）。
   *  claude rules 用 README.md 以便人读。 */
  aggregateSource: z.string().optional(),
});

const envSchema = z.object({
  /** PATH 上的可执行名（不带扩展名，Windows 自动试 PATHEXT） */
  executables: z.array(z.string()).default([]),
  /** 相对 home 的路径或 glob（如 .vscode/extensions/foo-*） */
  globalDirs: z.array(z.string()).default([]),
  /** Windows 卸载项 DisplayName 子串（如 Cursor） */
  registryNames: z.array(z.string()).default([]),
});

const agentSchema = z.object({
  /** 项目配置探测标记（相对 projectRoot，文件或目录） */
  markers: z.array(z.string().min(1)).min(1),
  supports: z.array(assetTypeSchema).default([]),
  env: envSchema.default({ executables: [], globalDirs: [], registryNames: [] }),
  // string 键（非 enum）：允许只声明部分 type（如 codex 仅 rule），未知 type 渲染时自然忽略
  mappings: z.record(z.string(), mappingSchema).default({}),
});

const configSchema = z.object({
  agents: z.record(z.string(), agentSchema),
});

export interface Mapping {
  targetPath: string;
  aggregate: boolean;
  action: 'symlink' | 'copy';
  transform: string;
  aggregateSource?: string;
}

export interface AgentEnv {
  executables: string[];
  globalDirs: string[];
  registryNames: string[];
}

export interface AgentConfig {
  name: string;
  markers: string[];
  supports: AssetType[];
  env: AgentEnv;
  mappings: Partial<Record<AssetType, Mapping>>;
}

type RawConfig = { agents: Record<string, z.infer<typeof agentSchema>> };

/** 深合并：override 覆盖 base；对象递归，数组/原始值替换 */
function deepMerge<T>(base: T, override: T): T {
  if (override === undefined) return base;
  const b = base as unknown;
  const o = override as unknown;
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return override;
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return override;
  const out: Record<string, unknown> = { ...(b as Record<string, unknown>) };
  for (const k of Object.keys(o as Record<string, unknown>)) {
    out[k] = deepMerge(out[k], (o as Record<string, unknown>)[k]);
  }
  return out as T;
}

async function readJson(p: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 仅读内置默认（不含项目覆盖），用于帮助文本等 */
export async function loadBundledAgentConfig(): Promise<AgentConfig[]> {
  const raw = await readJson(bundledAgentsConfigPath());
  if (raw === null) {
    throw new UsageError(`内置 agents.json 缺失: ${bundledAgentsConfigPath()}（CLI 安装损坏）`);
  }
  const parsed = configSchema.parse(raw) as RawConfig;
  return Object.entries(parsed.agents).map(([name, a]) => ({ name, ...a }) as AgentConfig);
}

/** 加载并合并：内置默认 + 项目 .agents/agents.json 覆盖 */
export async function loadAgentConfig(projectRoot: string): Promise<AgentConfig[]> {
  const bundled = await readJson(bundledAgentsConfigPath());
  if (bundled === null) {
    throw new UsageError(`内置 agents.json 缺失: ${bundledAgentsConfigPath()}（CLI 安装损坏）`);
  }
  const projectPath = projectAgentsConfigPath(projectRoot);
  const project = await readJson(projectPath);

  const merged = project
    ? (deepMerge(bundled as Record<string, unknown>, project as Record<string, unknown>) as unknown)
    : bundled;
  const parsed = configSchema.parse(merged) as RawConfig;
  return Object.entries(parsed.agents).map(([name, a]) => ({ name, ...a }) as AgentConfig);
}

/** 查单个 agent 配置 */
export async function findAgentConfig(
  projectRoot: string,
  name: string,
): Promise<AgentConfig | undefined> {
  const configs = await loadAgentConfig(projectRoot);
  return configs.find((c) => c.name === name);
}

/** agentsDir 重导出（供 renderer 复用，避免多处直依赖 paths） */
export { agentsDir };
