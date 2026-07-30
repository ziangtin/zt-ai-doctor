import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { projectMcpJsonPath } from './paths.js';
import { validateMcpBody } from './schema.js';
import type { AssetMeta, LoadedAsset, ManifestAssetEntry } from './types.js';

/** `.agents/mcp.json` 结构：{ mcpServers: { id: body } } */
export interface McpJson {
  mcpServers: Record<string, unknown>;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 读 .agents/mcp.json；不存在返回空 {mcpServers:{}} */
export async function readMcpJson(projectRoot: string): Promise<McpJson> {
  const p = projectMcpJsonPath(projectRoot);
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<McpJson>;
    return { mcpServers: parsed.mcpServers ?? {} };
  } catch {
    return { mcpServers: {} };
  }
}

/** 原子写 .agents/mcp.json */
export async function writeMcpJson(projectRoot: string, data: McpJson): Promise<void> {
  const p = projectMcpJsonPath(projectRoot);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, p);
}

/** upsert 一个 MCP server 到 .agents/mcp.json */
export async function upsertMcpServer(
  projectRoot: string,
  id: string,
  body: unknown,
): Promise<void> {
  const data = await readMcpJson(projectRoot);
  data.mcpServers[id] = body;
  await writeMcpJson(projectRoot, data);
}

/** 从 .agents/mcp.json 删除一个 MCP server；返回是否曾存在 */
export async function removeMcpServer(projectRoot: string, id: string): Promise<boolean> {
  const data = await readMcpJson(projectRoot);
  if (!(id in data.mcpServers)) return false;
  delete data.mcpServers[id];
  await writeMcpJson(projectRoot, data);
  return true;
}

/** .agents/mcp.json 是否包含某 id */
export async function hasMcpServer(projectRoot: string, id: string): Promise<boolean> {
  const data = await readMcpJson(projectRoot);
  return id in data.mcpServers;
}

function hashContent(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * 从 .agents/mcp.json 加载 MCP 资产为 LoadedAsset[]（每条 mcpServers 一个）。
 * content = JSON.stringify(body)，供 aggregateMcp(JSON.parse) 往返。
 * hash = body 规范化 JSON 的 sha256。
 */
export async function loadProjectMcp(projectRoot: string): Promise<LoadedAsset[]> {
  if (!(await exists(projectMcpJsonPath(projectRoot)))) return [];
  const { mcpServers } = await readMcpJson(projectRoot);
  const assets: LoadedAsset[] = [];
  for (const [id, body] of Object.entries(mcpServers)) {
    const content = JSON.stringify(body);
    const meta: AssetMeta = {
      id,
      type: 'mcp',
      title: '',
      description: '',
      tags: [],
      agents: [],
      layer: 'baseline',
      priority: 0,
    };
    const entry: ManifestAssetEntry = { id, type: 'mcp', path: 'mcp.json', versions: [{ path: 'mcp.json' }] };
    assets.push({
      entry,
      meta,
      raw: content,
      content,
      hash: hashContent(content),
    });
  }
  return assets;
}

/** 校验 body 并返回规范化 body（command 必填、args 可选、其余透传） */
export function normalizeMcpBody(raw: unknown): unknown {
  return validateMcpBody(raw);
}

/** 重新导出供外部计算 body hash（treat 时 lockfile 记录） */
export function bodyHash(body: unknown): string {
  return hashContent(JSON.stringify(body));
}
