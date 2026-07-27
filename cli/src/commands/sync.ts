import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, lockfilePath } from '../core/paths.js';
import { loadProjectAssets } from '../core/project.js';
import { readLockfile } from '../core/lockfile.js';
import { place } from '../core/place.js';
import { resolveAssets } from '../core/layers.js';
import { renderers } from '../renderers/index.js';
import type { AgentRenderer, LayerOverride, LoadedAsset, Placement } from '../core/types.js';

/** sync 核心：读 .agents/ 资产 -> 层级合并 -> 选 renderer -> 渲染 + 放置 + 报告 */
export async function runSync(
  projectRoot: string,
  opts: { agent?: string } = {},
): Promise<Placement[]> {
  const assets = await loadProjectAssets(projectRoot);
  if (assets.length === 0) {
    console.log('🔄 [sync] .agents/ 无资产，先 zai-doctor treat <id>');
    return [];
  }
  const { resolved, overrides } = resolveAssets(assets);

  const active: AgentRenderer[] = [];
  for (const r of renderers) {
    const use = opts.agent ? r.name === opts.agent : await r.detect(projectRoot);
    if (use) active.push(r);
  }
  if (active.length === 0) {
    console.log('🔄 [sync] 未检测到 agent，用 --agent <claude|cursor> 指定');
    return [];
  }

  const all: Placement[] = [];
  for (const r of active) {
    const ctx = {
      buildDir: path.join(agentsDir(projectRoot), '.build', r.name),
      projectRoot,
    };
    const placements = await r.renderAll(resolved, ctx);
    for (let p of placements) {
      if (p.action !== 'skip') p = await place(p);
      all.push(p);
    }
  }

  if (overrides.length) {
    console.log('   层级覆盖：');
    for (const o of overrides) {
      console.log(`   ↺ ${o.id}  [${o.layers.join(',')}]  -> ${o.winner}`);
    }
  }

  await writeReport(projectRoot, all, resolved, overrides);
  printSummary(projectRoot, all);
  return all;
}

export async function syncCommand(
  projectRoot: string,
  opts: { agent?: string },
): Promise<void> {
  await runSync(projectRoot, opts);
}

async function writeReport(
  projectRoot: string,
  placements: Placement[],
  assets: LoadedAsset[],
  overrides: LayerOverride[],
): Promise<void> {
  const lock = await readLockfile(lockfilePath(projectRoot));
  const lines: string[] = ['# zai-doctor sync 报告', ''];
  lines.push(`- 生成时间: ${new Date().toISOString()}`);
  lines.push(`- 药典: ${lock ? `${lock.market.name}@${lock.market.version}` : '未知'}`);
  lines.push(`- 资产数: ${assets.length}（合并后）`);
  const agentNames = [...new Set(placements.map((p) => p.agent))];
  lines.push(`- 渲染 agent: ${agentNames.join(', ') || '无'}`);
  if (overrides.length) lines.push(`- 覆盖: ${overrides.length}`);
  lines.push('');

  if (overrides.length) {
    lines.push('## 覆盖');
    for (const o of overrides) {
      lines.push(`- ↺ ${o.id}  [${o.layers.join(',')}]  -> ${o.winner}`);
    }
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
