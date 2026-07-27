import fs from 'node:fs/promises';
import type { LoadedAsset } from '../core/types.js';

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 聚合多个 mcp 资产为 { mcpServers: { id: body } }，Claude/Cursor 通用。返回非法 body 的 id。 */
export function aggregateMcp(mcps: LoadedAsset[]): {
  mcpServers: Record<string, unknown>;
  errors: string[];
} {
  const mcpServers: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const m of mcps) {
    try {
      mcpServers[m.meta.id] = JSON.parse(m.content);
    } catch {
      errors.push(m.meta.id);
    }
  }
  return { mcpServers, errors };
}
