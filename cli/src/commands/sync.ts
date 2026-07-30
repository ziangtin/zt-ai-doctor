import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, lockfilePath } from '../core/paths.js';
import { loadProjectAssets } from '../core/project.js';
import { loadProjectMcp } from '../core/mcpStore.js';
import { readLockfile } from '../core/lockfile.js';
import { place, removeIfManaged } from '../core/place.js';
import { resolveAssets } from '../core/layers.js';
import { readManifest, writeManifest } from '../core/manifest.js';
import { assertWithinBase } from '../core/schema.js';
import { UsageError } from '../core/errors.js';
import { loadRenderers } from '../renderers/index.js';
import { loadAgentConfig } from '../core/agentConfig.js';
import { detectAgentEnv } from '../core/envDetect.js';
import type {
  AgentRenderer,
  LayerOverride,
  LoadedAsset,
  Placement,
  PlacementRecord,
} from '../core/types.js';

/** MCP 命令预览（用于未信任时的提示） */
function mcpPreview(a: LoadedAsset): string {
  try {
    const b = JSON.parse(a.content) as { command?: string; args?: string[] };
    return `command=${b.command ?? '?'} args=${JSON.stringify(b.args ?? [])}`;
  } catch {
    return 'body 非法 JSON';
  }
}

/** 按 supports + meta.agents + MCP 信任过滤；不兼容的产出 skip（2.2 + 2.7） */
function applicableAssets(
  assets: LoadedAsset[],
  r: AgentRenderer,
  trustedMcp: Set<string>,
): { applicable: LoadedAsset[]; skips: Placement[] } {
  const applicable: LoadedAsset[] = [];
  const skips: Placement[] = [];
  for (const a of assets) {
    if (!r.supports.includes(a.meta.type)) {
      skips.push({
        assetIds: [a.meta.id],
        agent: r.name,
        targetPath: '',
        sourcePath: '',
        action: 'skip',
        reason: `${a.meta.type} 不被 ${r.name} 支持`,
      });
    } else if (a.meta.agents?.length && !a.meta.agents.includes(r.name)) {
      skips.push({
        assetIds: [a.meta.id],
        agent: r.name,
        targetPath: '',
        sourcePath: '',
        action: 'skip',
        reason: `资产未声明支持 ${r.name}`,
      });
    } else if (a.meta.type === 'mcp' && !trustedMcp.has(a.meta.id)) {
      skips.push({
        assetIds: [a.meta.id],
        agent: r.name,
        targetPath: '',
        sourcePath: '',
        action: 'skip',
        reason: `MCP 未信任（${mcpPreview(a)}）；运行 zai-doctor trust ${a.meta.id}`,
      });
    } else {
      applicable.push(a);
    }
  }
  return { applicable, skips };
}

/** 解析 --agent 逗号多选 -> renderer 列表；未知名报错 */
function parseAgents(
  raw: string | undefined,
  renderers: AgentRenderer[],
): { found: AgentRenderer[]; unknown: string[] } {
  const names = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const found: typeof renderers = [];
  const unknown: string[] = [];
  for (const n of names) {
    const r = renderers.find((x) => x.name === n);
    if (r) found.push(r);
    else unknown.push(n);
  }
  return { found, unknown };
}

/** sync 核心：读 .agents/ -> 层级合并 -> 按 agent + 信任过滤 -> 渲染 + 放置（受管）+ GC + 报告 */
export async function runSync(
  projectRoot: string,
  opts: { agent?: string; copy?: boolean; installedOnly?: boolean } = {},
): Promise<Placement[]> {
  const { assets, errors: loadErrors } = await loadProjectAssets(projectRoot);
  for (const e of loadErrors) console.log(`  ⚠ 跳过非法资产: ${e}`);
  const mcpAssets = await loadProjectMcp(projectRoot);
  if (assets.length === 0 && mcpAssets.length === 0) {
    console.log('🔄 [sync] .agents/ 无资产，先 zai-doctor treat <id>');
    return [];
  }
  const { resolved, overrides } = resolveAssets(assets);
  // MCP 单文件模型：从 .agents/mcp.json 加载，与分层合并后的 rule/skill/prompt 合并
  const resolvedAll = [...resolved, ...mcpAssets];

  const lock = await readLockfile(lockfilePath(projectRoot));
  const trustedMcp = new Set(lock?.trustedMcp ?? []);

  const renderers = await loadRenderers(projectRoot);
  const names = renderers.map((r) => r.name);

  // 选 renderer（--agent 支持逗号多选；未知名报错）
  let active: AgentRenderer[] = [];
  if (opts.agent) {
    const { found, unknown } = parseAgents(opts.agent, renderers);
    if (unknown.length) {
      throw new UsageError(`未知 agent: ${unknown.join(', ')}（可选: ${names.join(', ')}）`);
    }
    active = found;
  } else {
    for (const r of renderers) if (await r.detectConfig(projectRoot)) active.push(r);
    if (active.length === 0) {
      console.log(`🔄 [sync] 未检测到 agent 配置，用 --agent <${names.join('|')}> 指定`);
      return [];
    }
  }

  // --installed-only：按环境探测过滤（默认关，允许预生成配置）
  if (opts.installedOnly) {
    const configs = await loadAgentConfig(projectRoot);
    const filtered: AgentRenderer[] = [];
    for (const r of active) {
      const cfg = configs.find((c) => c.name === r.name);
      if (!cfg) continue;
      const env = await detectAgentEnv(cfg);
      if (env.installed) filtered.push(r);
      else console.log(`  ⏭ 跳过 ${r.name}（环境未检测到本体）`);
    }
    active = filtered;
    if (active.length === 0) {
      console.log('🔄 [sync] --installed-only 过滤后无活跃 agent');
      return [];
    }
  }

  const prevManifest = await readManifest(projectRoot);
  const activeNames = new Set(active.map((r) => r.name));
  const all: Placement[] = [];
  const newRecords: PlacementRecord[] = [];

  for (const r of active) {
    const ctx = {
      buildDir: path.join(agentsDir(projectRoot), '.build', r.name),
      projectRoot,
    };
    const { applicable, skips } = applicableAssets(resolvedAll, r, trustedMcp);
    const placements = await r.renderAll(applicable, ctx);
    for (const p of [...skips, ...placements]) {
      if (p.action === 'skip') {
        all.push(p);
        continue;
      }
      assertWithinBase(projectRoot, p.targetPath, `${r.name} target`);
      const prev = prevManifest.get(p.targetPath);
      const { placement, record } = await place(p, prev, opts.copy);
      all.push(placement);
      if (record) newRecords.push(record);
    }
  }

  // GC：上一轮受管、本轮活跃 agent、但本轮未再生成的目标（2.6）
  const newTargets = new Set(newRecords.map((r) => r.targetPath));
  const gcRemoved: string[] = [];
  const gcConflicts: string[] = [];
  for (const [target, rec] of prevManifest) {
    if (!activeNames.has(rec.agent)) continue;
    if (newTargets.has(target)) continue;
    const res = await removeIfManaged(rec);
    if (res === 'removed') gcRemoved.push(target);
    else if (res === 'conflict') gcConflicts.push(target);
  }

  const keptPrev = [...prevManifest.values()].filter((r) => !activeNames.has(r.agent));
  await writeManifest(projectRoot, [...keptPrev, ...newRecords]);

  if (overrides.length) {
    console.log('   层级覆盖：');
    for (const o of overrides) console.log(`   ↺ ${o.id}  [${o.layers.join(',')}]  -> ${o.winner}`);
  }
  if (gcRemoved.length) {
    console.log('   清理旧目标：');
    for (const t of gcRemoved) console.log(`   🗑 ${path.relative(projectRoot, t)}`);
  }
  if (gcConflicts.length) {
    console.log('   旧目标已被修改，未清理：');
    for (const t of gcConflicts) console.log(`   ⚠ ${path.relative(projectRoot, t)}`);
  }

  await writeReport(projectRoot, all, resolvedAll, overrides, gcRemoved, gcConflicts, lock);
  printSummary(projectRoot, all);
  return all;
}

export async function syncCommand(
  projectRoot: string,
  opts: { agent?: string; copy?: boolean; installedOnly?: boolean },
): Promise<void> {
  await runSync(projectRoot, opts);
}

async function writeReport(
  projectRoot: string,
  placements: Placement[],
  assets: LoadedAsset[],
  overrides: LayerOverride[],
  gcRemoved: string[],
  gcConflicts: string[],
  lock: Awaited<ReturnType<typeof readLockfile>>,
): Promise<void> {
  const lines: string[] = ['# zai-doctor sync 报告', ''];
  lines.push(`- 生成时间: ${new Date().toISOString()}`);
  lines.push(`- 药典: ${lock ? `${lock.market.name}@${lock.market.version}` : '未知'}`);
  if (lock?.source) {
    lines.push(`- 来源: ${lock.source.type} ${lock.source.uri}${lock.source.ref ? `@${lock.source.ref.slice(0, 8)}` : ''}`);
  }
  lines.push(`- 资产数: ${assets.length}（合并后）`);
  const agentNames = [...new Set(placements.map((p) => p.agent))];
  lines.push(`- 渲染 agent: ${agentNames.join(', ') || '无'}`);
  if (overrides.length) lines.push(`- 覆盖: ${overrides.length}`);
  if (gcRemoved.length) lines.push(`- 清理: ${gcRemoved.length}`);
  if (gcConflicts.length) lines.push(`- 冲突: ${gcConflicts.length}`);
  lines.push('');

  if (overrides.length) {
    lines.push('## 覆盖');
    for (const o of overrides) lines.push(`- ↺ ${o.id}  [${o.layers.join(',')}]  -> ${o.winner}`);
    lines.push('');
  }
  if (gcRemoved.length) {
    lines.push('## 清理');
    for (const t of gcRemoved) lines.push(`- 🗑 ${path.relative(projectRoot, t)}`);
    lines.push('');
  }

  for (const agent of agentNames) {
    lines.push(`## ${agent}`);
    for (const p of placements.filter((p) => p.agent === agent)) {
      const ids = p.assetIds.join(',');
      const target = p.targetPath ? path.relative(projectRoot, p.targetPath) : '-';
      if (p.action === 'skip') {
        lines.push(`- ⤳ ${ids}  -> ${target}  skip: ${p.reason ?? ''}`);
      } else {
        lines.push(`- ✓ ${ids}  -> ${target}  (${p.action})`);
      }
    }
    lines.push('');
  }

  const reportPath = path.join(agentsDir(projectRoot), '.build', 'sync-report.md');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8');
  console.log(`   报告: ${path.relative(projectRoot, reportPath)}`);
}

function printSummary(projectRoot: string, placements: Placement[]): void {
  const ok = placements.filter((p) => p.action !== 'skip').length;
  const skip = placements.filter((p) => p.action === 'skip').length;
  console.log('🔄 [sync] 渲染完成：');
  for (const p of placements) {
    const ids = p.assetIds.join(',');
    if (p.action === 'skip') {
      console.log(`  ⤳ ${ids}  -> [${p.agent}] skip: ${p.reason ?? ''}`);
    } else {
      const target = path.relative(projectRoot, p.targetPath);
      console.log(`  ✓ ${ids}  -> ${target}  (${p.action})`);
    }
  }
  console.log(`   成功 ${ok}，跳过 ${skip}`);
}
