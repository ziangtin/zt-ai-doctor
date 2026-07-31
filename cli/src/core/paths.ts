import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { AssetType } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromHere = createRequire(import.meta.url);

/** 包内 market：zt-ai-doctor-market 包根目录，随 zai-doctor 发布。
 *  通过 require.resolve 定位，兼容 dev（workspace 软链）与 published（bundledDependencies 打入包内）。 */
let BUNDLED_MARKET: string;
try {
  BUNDLED_MARKET = path.dirname(requireFromHere.resolve('zt-ai-doctor-market/package.json'));
} catch {
  // 包未解析到（极少见，如依赖缺失）：退回占位路径，由 resolveMarketPath 的 existsSync 兜底走 ./market
  BUNDLED_MARKET = path.resolve(__dirname, '..', '..', 'market');
}

/** 内置 agent 映射/探测配置：cli/agents.json（随包发布；不随 --market 切换，因 transform 名与 CLI 实现绑定） */
export function bundledAgentsConfigPath(): string {
  return path.resolve(__dirname, '..', '..', 'agents.json');
}

/** 项目级覆盖配置：.agents/agents.json */
export function projectAgentsConfigPath(projectRoot: string): string {
  return path.join(agentsDir(projectRoot), 'agents.json');
}

/** 项目 MCP 单文件源：.agents/mcp.json（{mcpServers:{id:body}}），sync 同步到各 agent 的 mcp.json */
export function projectMcpJsonPath(projectRoot: string): string {
  return path.join(agentsDir(projectRoot), 'mcp.json');
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
  // 默认：包内 market（zt-ai-doctor-market，随包发布，离线可用）
  if (fs.existsSync(BUNDLED_MARKET)) return BUNDLED_MARKET;
  return path.resolve(process.cwd(), 'market');
}
