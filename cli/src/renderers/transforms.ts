import type { LoadedAsset } from '../core/types.js';
import { validateMcpBody } from '../core/schema.js';

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

/** Cursor/Trae/Qoder(Lingma) 通用的规则 frontmatter：description/globs/alwaysApply */
export function renderMdc(rule: LoadedAsset): string {
  return [
    '---',
    `description: ${JSON.stringify(rule.meta.description ?? rule.meta.title ?? rule.meta.id)}`,
    'globs: ""',
    'alwaysApply: true',
    '---',
    '',
    rule.content.trim(),
    '',
  ].join('\n');
}

/** Claude skill SKILL.md 正文（来自 claude renderer） */
export function renderSkillBody(skill: LoadedAsset): string {
  return [
    '---',
    `name: ${skill.meta.id}`,
    `description: ${JSON.stringify(skill.meta.description ?? skill.meta.title ?? '')}`,
    '---',
    '',
    skill.content.trim(),
    '',
  ].join('\n');
}

/** 单条规则 -> 纯 markdown（无 frontmatter），用于 Cline .clinerules/<id>.md */
export function renderRuleMd(rule: LoadedAsset): string {
  return [`# ${rule.meta.title ?? rule.meta.id}`, '', rule.content.trim(), ''].join('\n');
}

export interface AggregateResult {
  content: string;
  /** 解析失败的资产 id（如 MCP body 非法 JSON） */
  errors?: string[];
}

/** 聚合型转换：多资产 -> 单文件。按 transform 名分发。 */
export const aggregateTransforms: Record<string, (assets: LoadedAsset[]) => AggregateResult> = {
  'rule-aggregate-md': (assets) => ({ content: aggregateRules(assets) }),
  'mcp-json': (assets) => {
    const { mcpServers, errors } = aggregateMcp(assets);
    return { content: JSON.stringify({ mcpServers }, null, 2), errors };
  },
};

/** 单资产型转换：一资产 -> 一文件。按 transform 名分发。 */
export const perAssetTransforms: Record<string, (asset: LoadedAsset) => string> = {
  'rule-mdc': renderMdc,
  'rule-md': renderRuleMd,
  'claude-skill': renderSkillBody,
};
