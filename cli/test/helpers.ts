import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export type AssetType = 'rule' | 'skill' | 'mcp' | 'prompt';
export type Layer = 'baseline' | 'personal' | 'company';

export interface AssetSpec {
  id: string;
  type: AssetType;
  layer?: Layer;
  priority?: number;
  agents?: string[];
  title?: string;
  body: string;
  filename?: string;
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

/** 在 dir 建一个 mini market（manifest + 资产文件），返回 dir */
export async function makeMarket(dir: string, assets: AssetSpec[]): Promise<string> {
  const entries: { id: string; type: AssetType; path: string }[] = [];
  for (const a of assets) {
    const subdir = SUBDIR[a.type];
    const fname = a.filename ?? `${a.id}.md`;
    const p = path.join(dir, subdir, fname);
    await fs.mkdir(path.dirname(p), { recursive: true });
    const fm: string[] = ['---', `id: ${a.id}`, `type: ${a.type}`];
    if (a.title) fm.push(`title: ${JSON.stringify(a.title)}`);
    if (a.layer) fm.push(`layer: ${a.layer}`);
    if (a.priority !== undefined) fm.push(`priority: ${a.priority}`);
    if (a.agents) fm.push(`agents: [${a.agents.join(', ')}]`);
    fm.push('---', '', a.body.trim(), '');
    await fs.writeFile(p, fm.join('\n'), 'utf8');
    entries.push({ id: a.id, type: a.type, path: `${subdir}/${fname}` });
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
