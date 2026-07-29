import path from 'node:path';
import fs from 'node:fs/promises';
import type { AgentConfig } from './agentConfig.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * agent 配置探测：检查项目根下是否存在该 agent 的配置标记文件/目录。
 * 语义=「项目里有没有给该 agent 建过配置」，不是「机器上装没装该 agent」（后者见 envDetect）。
 */
export async function detectConfig(cfg: AgentConfig, projectRoot: string): Promise<boolean> {
  for (const marker of cfg.markers) {
    if (await exists(path.join(projectRoot, marker))) return true;
  }
  return false;
}
