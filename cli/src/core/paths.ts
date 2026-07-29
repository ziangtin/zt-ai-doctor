import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AssetType } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 包内 market：dist/core/paths.js -> ../../market（cli/market），随包发布 */
const BUNDLED_MARKET = path.resolve(__dirname, '..', '..', 'market');

/** 项目级 .agents/ 目录 */
export function agentsDir(projectRoot: string): string {
  return path.join(projectRoot, '.agents');
}

export function lockfilePath(projectRoot: string): string {
  return path.join(agentsDir(projectRoot), 'zai.lock.json');
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
