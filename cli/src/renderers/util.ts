import fs from 'node:fs/promises';
import type { LoadedAsset } from '../core/types.js';
import { validateMcpBody } from '../core/schema.js';

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 聚合 rules 成单一 markdown：按 priority 降序拼接 title + content */
export function aggregateRules(rules: LoadedAsset[]): string {
  const sorted = [...rules].sort((a, b) => (b.meta.priority ?? 0) - (a.meta.priority ?? 0));
  const parts = sorted.map((r) => `## ${r.meta.title ?? r.meta.id}\n\n${r.content.trim()}`);
  return [
    '# Agent Rules',
    '',
    '> 由 zai-doctor sync 生成，勿手改。改 `.agents/rules/*.md` 后重跑 `zai-doctor sync`。',
    '',
    parts.join('\n\n---\n\n'),
    '',
  ].join('\n');
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
      mcpServers[m.meta.id] = validateMcpBody(JSON.parse(m.content));
    } catch {
      errors.push(m.meta.id);
    }
  }
  return { mcpServers, errors };
}
