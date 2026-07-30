import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export type AssetType = 'rule' | 'skill' | 'mcp' | 'prompt';
export type Layer = 'baseline' | 'personal';

export interface AssetSpec {
  id: string;
  type: AssetType;
  layer?: Layer;
  priority?: number;
  agents?: string[];
  title?: string;
  description?: string;
  icon?: string;
  rules?: string[];
  stack?: { deps?: string[]; files?: string[] };
  tags?: string[];
  version?: string;
  body: string;
  filename?: string;
}

export interface MakeMarketOptions {
  /** 生成旧格式 manifest（单 path，无 versions）用于兼容性测试。默认 false（新格式 versions）。 */
  legacy?: boolean;
}

const SUBDIR: Record<AssetType, string> = {
  rule: 'rules',
  skill: 'skills',
  mcp: 'mcp',
  prompt: 'prompts',
};

let counter = 0;
/** 唯一临时目录 */
export async function makeTempDir(prefix = 't'): Promise<string> {
  const dir = path.join(os.tmpdir(), `zd-${prefix}-${process.pid}-${counter++}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

/** 在 dir 建一个 mini market（manifest + 资产文件），返回 dir。
 *  默认生成新格式 manifest（versions 数组）；opts.legacy=true 生成旧格式（单 path）用于兼容性测试。 */
export async function makeMarket(
  dir: string,
  assets: AssetSpec[],
  opts: MakeMarketOptions = {},
): Promise<string> {
  const entries: object[] = [];
  for (const a of assets) {
    const subdir = SUBDIR[a.type];
    const fname = a.filename ?? `${a.id}.md`;
    const p = path.join(dir, subdir, fname);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const fm: string[] = ['---', `id: ${a.id}`, `type: ${a.type}`];
    if (a.title) fm.push(`title: ${JSON.stringify(a.title)}`);
    if (a.description) fm.push(`description: ${JSON.stringify(a.description)}`);
    if (a.icon) fm.push(`icon: ${a.icon}`);
    if (a.layer) fm.push(`layer: ${a.layer}`);
    if (a.priority !== undefined) fm.push(`priority: ${a.priority}`);
    if (a.agents) fm.push(`agents: [${a.agents.join(', ')}]`);
    if (a.rules) fm.push(`rules: [${a.rules.join(', ')}]`);
    if (a.tags) fm.push(`tags: [${a.tags.join(', ')}]`);
    if (a.version) fm.push(`version: ${a.version}`);
    if (a.stack) {
      const parts: string[] = [];
      if (a.stack.deps?.length) parts.push(`deps: [${a.stack.deps.join(', ')}]`);
      if (a.stack.files?.length) parts.push(`files: [${a.stack.files.join(', ')}]`);
      if (parts.length) fm.push(`stack:\n  ${parts.join('\n  ')}`);
    }
    fm.push('---', '', a.body.trim(), '');
    await fs.writeFile(p, fm.join('\n'), 'utf8');
    const rel = `${subdir}/${fname}`;
    if (opts.legacy) {
      entries.push({ id: a.id, type: a.type, path: rel });
    } else {
      entries.push({ id: a.id, type: a.type, versions: [{ version: a.version ?? '1.0.0', path: rel }] });
    }
  }
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ name: 'test-market', version: '0.1.0', assets: entries }, null, 2),
    'utf8',
  );
  return dir;
}

export async function readText(p: string): Promise<string> {
  return fs.readFile(p, 'utf8');
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
