import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentConfig } from './agentConfig.js';

/** 受管段标记：sync 产物在此段内自动维护，段外用户内容不动 */
const BEGIN = '# >>> zai-doctor sync 产物（自动管理，请勿手动编辑此段） >>>';
const END = '# <<< zai-doctor sync 产物 <<<';

/**
 * 从 mapping targetPath 推导 gitignore 条目：
 * - 含 {id}（目录型，如 .claude/rules/{id}.md、.clinerules/{id}.md）-> {id} 所在目录，带尾 /
 * - 不含 {id}（聚合单文件，如 .mcp.json、AGENTS.md、.github/copilot-instructions.md）-> 整路径
 *
 * 安全：只精确到受管子目录/文件，绝不忽略 .claude/、.github/、.vscode/ 等整目录（内有用户文件）。
 */
export function ignoreEntryFor(targetPath: string): string {
  const norm = targetPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const idIdx = norm.indexOf('{id}');
  if (idIdx < 0) return norm;
  // {id} 前缀即其所在目录，如 ".claude/rules/"、".claude/skills/"
  return norm.slice(0, idIdx).replace(/\/+$/, '/');
}

/** 收集去重 + 排序后的 ignore 条目 */
export function collectIgnoreEntries(mappings: { targetPath: string }[]): string[] {
  const set = new Set<string>();
  for (const m of mappings) set.add(ignoreEntryFor(m.targetPath));
  return [...set].sort();
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 匹配受管段（含首尾标记 + 末尾换行）；不带 g 标志，至多一段 */
function blockPattern(): RegExp {
  return new RegExp(`${escapeReg(BEGIN)}[\\s\\S]*?${escapeReg(END)}\\n?`);
}

/**
 * 重写 .gitignore 受管段：
 * - entries 非空：段存在则替换段内（含标记），不存在则追加（前置空行分隔）
 * - entries 为空：移除整段；若无段则不动
 * 段外用户内容与已存在的非段内重复条目均保留。
 */
export async function updateGitignore(projectRoot: string, entries: string[]): Promise<void> {
  const gi = path.join(projectRoot, '.gitignore');
  let raw = '';
  try {
    raw = await fs.readFile(gi, 'utf8');
  } catch {
    // 文件不存在时保持空串
  }

  const pattern = blockPattern();

  if (entries.length === 0) {
    const next = raw.replace(pattern, '');
    if (next === raw) return; // 无段，无需改动
    await fs.writeFile(gi, next, 'utf8');
    return;
  }

  const block = [BEGIN, ...entries, END].join('\n') + '\n';
  let next: string;
  if (pattern.test(raw)) {
    next = raw.replace(pattern, block);
  } else {
    let prefix = raw;
    if (prefix.length > 0 && !prefix.endsWith('\n')) prefix += '\n';
    if (prefix.length > 0 && !prefix.endsWith('\n\n')) prefix += '\n'; // 空行分隔
    next = prefix + block;
  }
  if (next !== raw) await fs.writeFile(gi, next, 'utf8');
}

/**
 * 按受管 agent 集合刷新 .gitignore 受管段：取这些 agent 的 mappings 推导条目并写入。
 * 返回写入的条目（供调用方报告）。sync / purge 共用。
 */
export async function syncGitignore(
  projectRoot: string,
  agents: Iterable<string>,
  configs: AgentConfig[],
): Promise<string[]> {
  const set = new Set(agents);
  const mappings: { targetPath: string }[] = [];
  for (const c of configs) {
    if (!set.has(c.name)) continue;
    for (const m of Object.values(c.mappings)) mappings.push(m);
  }
  const entries = collectIgnoreEntries(mappings);
  await updateGitignore(projectRoot, entries);
  return entries;
}
