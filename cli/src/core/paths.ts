import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AssetType } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 包内 market：dist/core/paths.js -> ../../market（cli/market），随包发布 */
const BUNDLED_MARKET = path.resolve(__dirname, '..', '..', 'market');

/** 内置 agent 映射/探测配置：cli/market/agents.json（随包发布） */
export function bundledAgentsConfigPath(): string {
  return path.join(BUNDLED_MARKET, 'agents.json');
}

/** 项目级覆盖配置：.agents/agents.json */
export function projectAgentsConfigPath(projectRoot: string): string {
  return path.join(agentsDir(projectRoot), 'agents.json');
}

/** 项目级 .agents/ 目录 */
export function agentsDir(projectRoot: string): string {
  return path.join(projectRoot, '.agents');
}

export function lockfilePath(projectRoot: string): string {
  return path.join(agentsDir(projectRoot), 'zai-doctor.lock.json');
}

/** 可移植的药典来源标识（不暴露本地绝对路径，跨成员一致）。
 *  bundled：随包发布的药典；local：--market / $ZAI_MARKET_PATH / ./market 等本地路径。
 *  真正的一致性靠 source.integrity，uri 仅作来源提示。 */
export function marketSourceUri(marketPath: string): string {
  return path.resolve(marketPath) === BUNDLED_MARKET ? 'bundled' : 'local';
}

/** 资产类型 -> .agents/ 子目录名 */
export function assetSubdir(type: AssetType): string {
  switch (type) {
    case 'rule':
      return 'rules';
    case 'skill':
      return 'skills';
    case 'mcp':
      return 'mcp';
    case 'prompt':
      return 'prompts';
  }
}

/**
 * 解析药典路径：--market > $ZAI_MARKET_PATH > ./market
 * MVP 阶段药典是本地目录；后续可换成 npm 包 / git 源。
 */
export function resolveMarketPath(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const env = process.env.ZAI_MARKET_PATH;
  if (env) return path.resolve(env);
  // 默认：包内 market（随 cli 发布，离线可用）
  if (fs.existsSync(BUNDLED_MARKET)) return BUNDLED_MARKET;
  return path.resolve(process.cwd(), 'market');
}
