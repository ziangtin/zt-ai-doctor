import path from 'node:path';
import { lockfilePath, resolveMarketPath } from '../core/paths.js';
import { readLockfile } from '../core/lockfile.js';
import { loadManifest, findAssetById } from '../core/market.js';
import { loadRenderers } from '../renderers/index.js';
import { detectStack, matchAsset } from '../core/stack.js';
import {
  writePrescription,
  prescriptionPath,
  type PrescriptionRec,
  type PrescriptionData,
} from '../core/prescription.js';
import { validateMcpBody, type McpBody } from '../core/schema.js';
import type { LoadedAsset } from '../core/types.js';

/** 检查 npx 命令是否固定了包版本，返回未固定的包名 */
function findUnpinnedPackage(body: McpBody): string | null {
  const cmd = String(body.command ?? '');
  const args = Array.isArray(body.args) ? body.args : [];
  if (cmd === 'npx' || cmd.endsWith('\\npx') || cmd.endsWith('/npx')) {
    const pkg = args.find((a) => !a.startsWith('-'));
    if (pkg && pkg.lastIndexOf('@') <= 0) return pkg; // 无 @version（scope 的 @ 在 index 0，不算固定）
  }
  return null;
}

/**
 * 开方：读技术栈 + 匹配药典资产 -> 生成处方单（.agents/.build/prescription.md）。
 * 不自动装、不自动信任，仅推荐 + 人工挑选。
 */
export async function prescribeCommand(
  projectRoot: string,
  opts: { market?: string; tag?: string },
): Promise<void> {
  const marketPath = resolveMarketPath(opts.market);
  const lock = await readLockfile(lockfilePath(projectRoot));
  const trustedMcp = new Set(lock?.trustedMcp ?? []);

  const stack = await detectStack(projectRoot);

  const detectedAgents: string[] = [];
  const renderers = await loadRenderers(projectRoot);
  for (const r of renderers) {
    if (await r.detectConfig(projectRoot)) detectedAgents.push(r.name);
  }

  // 轻量诊断
  const findings: PrescriptionData['findings'] = [];
  if (!lock) findings.push({ severity: 'block', message: '未建档，运行 zai-doctor init' });
  if (!stack.hasPackageJson || stack.deps.size === 0) {
    findings.push({ severity: 'warn', message: '未检测到依赖（无 package.json 或无 dependencies）' });
  }
  if (detectedAgents.length === 0) {
    findings.push({ severity: 'warn', message: '未检测到 agent 配置，sync 需 --agent' });
  }

  // 读药典资产
  const manifest = await loadManifest(marketPath);
  let loaded: LoadedAsset[] = [];
  const invalid: string[] = [];
  for (const entry of manifest.assets) {
    try {
      const a = await findAssetById(marketPath, entry.id);
      if (a) loaded.push(a);
    } catch (e) {
      invalid.push(`${entry.id}: ${(e as Error).message}`);
    }
  }

  if (opts.tag) {
    loaded = loaded.filter((a) => (a.meta.tags ?? []).includes(opts.tag as string));
  }

  // 匹配 -> 推荐 / 可选
  const recommended: PrescriptionRec[] = [];
  const optional: PrescriptionRec[] = [];
  for (const asset of loaded) {
    const match = await matchAsset(asset, projectRoot, stack);
    const rec: PrescriptionRec = { asset, match };
    if (asset.meta.type === 'mcp') {
      try {
        const body = validateMcpBody(JSON.parse(asset.content));
        rec.mcp = {
          command: body.command,
          args: body.args,
          unpinned: findUnpinnedPackage(body),
          trusted: trustedMcp.has(asset.meta.id),
        };
      } catch {
        rec.mcp = { command: '(非法 body)', unpinned: null, trusted: false };
      }
    }
    if (match.confidence) recommended.push(rec);
    else optional.push(rec);
  }

  const data: PrescriptionData = {
    generatedAt: new Date().toISOString(),
    stack,
    detectedAgents,
    findings,
    recommended,
    optional,
  };
  await writePrescription(projectRoot, data);

  console.log('📝 [prescribe] 处方单已生成：');
  console.log(`   技术栈: ${stack.hasPackageJson ? `${stack.deps.size} 依赖` : '无 package.json'}`);
  console.log(`   检测 agent: ${detectedAgents.join(', ') || '无'}`);
  console.log(`   推荐 ${recommended.length}，可选 ${optional.length}`);
  if (invalid.length) console.log(`   ⚠ ${invalid.length} 资产无效: ${invalid.join('; ')}`);
  for (const r of recommended) {
    console.log(
      `   ✓ ${r.asset.meta.id}  [${r.asset.meta.type}]  置信度 ${r.match.confidence}  (${r.match.matched.join(',')})`,
    );
  }
  for (const r of optional) {
    console.log(`   · ${r.asset.meta.id}  [${r.asset.meta.type}]  可选`);
  }
  console.log(`   处方单: ${path.relative(projectRoot, prescriptionPath(projectRoot))}`);
  console.log('   编辑勾选后运行 `zai-doctor treat` 抓药');
}
