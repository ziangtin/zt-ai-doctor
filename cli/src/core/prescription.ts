import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir } from './paths.js';
import type { AssetMatch, ProjectStack } from './stack.js';
import type { LoadedAsset } from './types.js';

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

export interface McpPreview {
  command: string;
  args?: string[];
  unpinned: string | null;
  trusted: boolean;
}

export interface PrescriptionRec {
  asset: LoadedAsset;
  match: AssetMatch;
  mcp?: McpPreview;
}

export interface PrescriptionData {
  generatedAt: string;
  stack: ProjectStack;
  detectedAgents: string[];
  findings: { severity: 'block' | 'warn' | 'info'; message: string }[];
  recommended: PrescriptionRec[];
  optional: PrescriptionRec[];
}

export function prescriptionPath(projectRoot: string): string {
  return path.join(agentsDir(projectRoot), '.build', 'prescription.md');
}

function mcpLines(m: McpPreview): string[] {
  const out = [`  - MCP command: ${m.command}  args: ${JSON.stringify(m.args ?? [])}`];
  if (!m.trusted) out.push('  - ⚠ MCP 未信任，treat 前需 `zai-doctor trust <id>`');
  if (m.unpinned) out.push(`  - ⚠ ${m.unpinned} 未固定版本，建议改为 ${m.unpinned}@<version>`);
  return out;
}

/** 生成处方单 markdown 到 .agents/.build/prescription.md */
export async function writePrescription(projectRoot: string, data: PrescriptionData): Promise<void> {
  const p = prescriptionPath(projectRoot);
  await fs.mkdir(path.dirname(p), { recursive: true });

  const lines: string[] = ['# zai-doctor 处方单', ''];
  lines.push(`> 生成时间: ${data.generatedAt}`);
  const deps = [...data.stack.deps].slice(0, 20).join(', ');
  lines.push(`> 技术栈: ${data.stack.hasPackageJson ? `deps=[${deps}]` : '无 package.json'}`);
  lines.push(`> 已检测 agent: ${data.detectedAgents.join(', ') || '无'}`);
  lines.push('');

  if (data.findings.length) {
    lines.push('## 症状');
    for (const f of data.findings) {
      const icon = f.severity === 'block' ? '🔴' : f.severity === 'warn' ? '🟡' : '🟢';
      lines.push(`- ${icon} ${f.message}`);
    }
    lines.push('');
  }

  lines.push('## 推荐（按技术栈匹配）');
  if (data.recommended.length === 0) {
    lines.push('- （无匹配资产，看下方可选区）');
  } else {
    for (const r of data.recommended) {
      lines.push(`- [x] ${r.asset.meta.id}  [${r.asset.meta.type}]  置信度 ${r.match.confidence}`);
      lines.push(`  - 信号: ${r.match.matched.join(' | ') || '无'}`);
      if (r.asset.meta.description) lines.push(`  - 原因: ${r.asset.meta.description}`);
      if (r.mcp) lines.push(...mcpLines(r.mcp));
    }
  }
  lines.push('');

  lines.push('## 可选（无技术栈匹配，按需挑选）');
  if (data.optional.length === 0) {
    lines.push('- （无可选资产）');
  } else {
    for (const r of data.optional) {
      lines.push(`- [ ] ${r.asset.meta.id}  [${r.asset.meta.type}]`);
      lines.push(`  - 信号: ${r.match.noStack ? '无 stack 声明' : '未匹配'}`);
      if (r.asset.meta.description) lines.push(`  - 说明: ${r.asset.meta.description}`);
      const onlyClaude =
        r.asset.meta.agents?.length === 1 && r.asset.meta.agents[0] === 'claude';
      if (onlyClaude) lines.push('  - ⚠ skill 仅 Claude 可用，其它 agent sync 时 skip');
      if (r.mcp) lines.push(...mcpLines(r.mcp));
    }
  }
  lines.push('');

  lines.push('## 用法');
  lines.push('- 编辑上面的勾选 `[ ]`/`[x]`，运行 `zai-doctor treat`（不带 id）抓选中的药。');
  lines.push('- 或直接 `zai-doctor treat <id>` 抓指定药。');
  lines.push('- 不自动装、不自动信任；MCP 需先 `zai-doctor trust <id>`。');
  lines.push('');

  await fs.writeFile(p, lines.join('\n'), 'utf8');
}

/**
 * 读处方单中勾选 `[x]` 的资产 id。
 * 文件不存在返回 null；存在但无勾选返回 []。
 */
export async function readPrescriptionSelection(projectRoot: string): Promise<string[] | null> {
  let raw: string;
  try {
    raw = await fs.readFile(prescriptionPath(projectRoot), 'utf8');
  } catch {
    return null;
  }
  const ids: string[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*-\s*\[x\]\s+([a-z0-9][a-z0-9._-]*)/i);
    if (m && ID_RE.test(m[1])) ids.push(m[1]);
  }
  return ids;
}
