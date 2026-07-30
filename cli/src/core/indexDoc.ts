import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { agentsDir, assetSubdir } from './paths.js';

/** 标记段：工具只重写两个标记之间的列表，标记外的自定义前言/尾注一律保留。 */
const BEGIN = '<!-- zai:index-begin -->';
const END = '<!-- zai:index-end -->';

type IndexType = 'rule' | 'skill';

interface IndexEntry {
  file: string;
  id: string;
  title: string;
  icon: string;
  description: string;
  agents: string[];
  rules: string[];
  priority: number;
  sections: string[];
}

/** 首次生成（文件不存在）时使用的默认前言；之后重生成只动标记段，前言由用户保有。 */
const HEADERS: Record<IndexType, string> = {
  rule: `# 项目规范索引

本目录包含项目的开发规范，按模块分类组织，便于快速查找。

> 由 zai-doctor 自动维护：treat / remove 时刷新标记段内的列表；标记段之外的内容可自由编辑，不会被覆盖。`,
  skill: `---
name: project-skills-index
description: 项目的本地技能索引，帮助代理在具体开发场景下选择合适的技能文件。
---

# 项目技能索引

项目在 \`.agents/skills\` 下定义了一些与 RULE 配套的技能，用于承载**具体实践步骤与示例代码**，避免在 RULE 中塞入过多细节。

> 由 zai-doctor 自动维护：treat / remove 时刷新标记段内的列表；标记段之外的内容可自由编辑，不会被覆盖。`,
};

const LIST_TITLES: Record<IndexType, string> = {
  rule: '## 规范模块列表',
  skill: '## 自封装技能列表',
};

const EMPTY_HINTS: Record<IndexType, string> = {
  rule: '_暂无已安装规范，运行 `zai-doctor treat <id>` 抓药。_',
  skill: '_暂无已安装技能，运行 `zai-doctor treat <id>` 抓药。_',
};

/** heading emoji：frontmatter icon 优先，缺省按类型。 */
const DEFAULT_ICON: Record<IndexType, string> = {
  rule: '📋',
  skill: '🧩',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
/** 表格单元格转义：| 与换行会破坏表格结构。 */
function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** 抽取正文里二级标题（##）作为"章节"摘要；不收 ### 及更深层级。 */
function extractSections(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** 扫描目录下 *.md（排除 README.md 与 *.override.md），解析 frontmatter 成索引项。 */
async function collectEntries(dir: string, type: IndexType): Promise<IndexEntry[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const entries: IndexEntry[] = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    if (f === 'README.md') continue;
    if (f.endsWith('.override.md')) continue;
    const raw = await fs.readFile(path.join(dir, f), 'utf8');
    const parsed = matter(raw);
    const d = parsed.data as Record<string, unknown>;
    // 与 loadProjectAssets 一致：无 id 且无 type 视为项目自有 .md，跳过
    if (d.id === undefined && d.type === undefined) continue;
    const id = str(d.id);
    if (!id) continue;
    entries.push({
      file: f,
      id,
      title: str(d.title) || id,
      icon: str(d.icon) || DEFAULT_ICON[type],
      description: str(d.description),
      agents: strArr(d.agents),
      rules: strArr(d.rules),
      priority: num(d.priority),
      sections: extractSections(parsed.content),
    });
  }
  return entries;
}

function renderRuleEntry(e: IndexEntry): string {
  const sections = e.sections.slice(0, 4);
  const lines = [`### ${e.icon} [${e.title}](./${e.file})`];
  if (sections.length) {
    lines.push('');
    for (const s of sections) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

/** skills 用表格行：技能 | 功能描述 | 配套规范 | 适用应用 */
function renderSkillRow(e: IndexEntry): string {
  const skill = `${e.icon} [${cell(e.title)}](./${e.file})`;
  const desc = cell(e.description) || '-';
  const rules = e.rules.length
    ? e.rules.map((r) => `[${r}](../rules/${r}.md)`).join(' ')
    : '-';
  const apps = e.agents.length ? cell(e.agents.join(', ')) : '-';
  return `| ${skill} | ${desc} | ${rules} | ${apps} |`;
}

const SKILL_TABLE_HEADER = '| 技能 | 功能描述 | 配套规范 | 适用应用 |\n|------|----------|----------|----------|';

function buildListBlock(type: IndexType, entries: IndexEntry[]): string {
  const sorted = [...entries].sort(
    (a, b) => b.priority - a.priority || a.title.localeCompare(b.title),
  );
  const lines: string[] = [LIST_TITLES[type], ''];
  if (type === 'rule') {
    if (sorted.length === 0) {
      lines.push(EMPTY_HINTS[type]);
    } else {
      lines.push(sorted.map(renderRuleEntry).join('\n\n'));
    }
  } else {
    lines.push(SKILL_TABLE_HEADER);
    if (sorted.length === 0) {
      lines.push(`| ${EMPTY_HINTS[type]} |  |  |  |`);
    } else {
      for (const e of sorted) lines.push(renderSkillRow(e));
    }
  }
  return lines.join('\n');
}

/** 把生成的列表块注入 README：有标记段则替换段内；无标记段则保留已有内容作前言并追加。 */
function applyMarkers(existing: string, type: IndexType, listBlock: string): string {
  const generated = `${BEGIN}\n${listBlock}\n${END}`;
  if (existing === '') {
    return `${HEADERS[type]}\n\n${generated}\n`;
  }
  const beginIdx = existing.indexOf(BEGIN);
  const endIdx = existing.indexOf(END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + END.length);
    const result = `${before}${generated}${after}`;
    return result.endsWith('\n') ? result : `${result}\n`;
  }
  // 已存在但无标记段：整体当作用户前言保留，末尾追加标记段
  return `${existing.replace(/\n+$/, '')}\n\n${generated}\n`;
}

/** 重生成 .agents/<type>/README.md 索引。 */
export async function writeSubdirIndex(projectRoot: string, type: IndexType): Promise<void> {
  const dir = path.join(agentsDir(projectRoot), assetSubdir(type));
  await fs.mkdir(dir, { recursive: true });
  const entries = await collectEntries(dir, type);
  const listBlock = buildListBlock(type, entries);
  const readme = path.join(dir, 'README.md');
  let existing = '';
  try {
    existing = await fs.readFile(readme, 'utf8');
  } catch {
    // 文件不存在：保持空串，走首次生成分支
  }
  await fs.writeFile(readme, applyMarkers(existing, type, listBlock), 'utf8');
}

/** 重生成 rules + skills 两份索引（treat / remove / init 后调用）。 */
export async function writeAllIndexes(projectRoot: string): Promise<void> {
  await writeSubdirIndex(projectRoot, 'rule');
  await writeSubdirIndex(projectRoot, 'skill');
}
