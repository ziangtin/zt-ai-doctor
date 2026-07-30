import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, lockfilePath, resolveMarketPath } from '../core/paths.js';
import { readLockfile } from '../core/lockfile.js';
import { loadProjectAssets } from '../core/project.js';
import { loadProjectMcp } from '../core/mcpStore.js';
import { findAssetById } from '../core/market.js';
import { hashFileFull } from '../core/hash.js';
import { loadRenderers } from '../renderers/index.js';
import { loadAgentConfig } from '../core/agentConfig.js';
import { detectAllEnv } from '../core/envDetect.js';
import { normalizeVersion } from '../core/semver.js';
import type { AssetType } from '../core/types.js';

type Severity = 'block' | 'warn' | 'info';

interface Finding {
  severity: Severity;
  category: string;
  message: string;
}

const VALID_TYPES: AssetType[] = ['rule', 'skill', 'mcp', 'prompt'];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function detectPm(projectRoot: string): Promise<string> {
  if (await exists(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm (pnpm-lock.yaml)';
  if (await exists(path.join(projectRoot, 'package-lock.json'))) return 'npm (package-lock.json)';
  if (await exists(path.join(projectRoot, 'yarn.lock'))) return 'yarn (yarn.lock)';
  return '未检测到锁文件';
}

/** diagnose：体检，出症状报告。--strict 时发现阻塞症状返回非零（2.5） */
export async function diagnoseCommand(
  projectRoot: string,
  opts: { market?: string; strict?: boolean },
): Promise<void> {
  const out: string[] = ['🩺 zai-doctor 诊断报告', ''];
  const findings: Finding[] = [];

  const lock = await readLockfile(lockfilePath(projectRoot));
  const { assets, errors: loadErrors } = await loadProjectAssets(projectRoot);
  const mcpAssets = await loadProjectMcp(projectRoot);
  const allAssets = [...assets, ...mcpAssets];
  const renderers = await loadRenderers(projectRoot);
  const detected: string[] = [];
  for (const r of renderers) {
    if (await r.detectConfig(projectRoot)) detected.push(r.name);
  }

  // 环境探测：机器上是否真装了 agent（区别于上面的项目配置探测）
  const configs = await loadAgentConfig(projectRoot);
  const envResults = await detectAllEnv(configs);
  const envByAgent = new Map(envResults.map((r) => [r.agent, r]));

  // 1. 建档状态
  out.push('建档状态');
  if (!lock) {
    out.push('  ✗ 未建档（运行 zai-doctor init）');
    findings.push({ severity: 'block', category: '建档', message: '未建档，运行 zai-doctor init' });
  } else {
    out.push(`  ✓ 已建档  药典 ${lock.market.name}@${lock.market.version}  资产 ${lock.assets.length} 项`);
  }
  out.push('');

  // 2. 资产健康
  out.push(`资产健康（.agents/ 共 ${allAssets.length} 项${loadErrors.length ? `，${loadErrors.length} 项加载失败` : ''}）`);
  for (const e of loadErrors) {
    out.push(`  🔴 ${e}`);
    findings.push({
      severity: 'block',
      category: '资产',
      message: `${e}（资产 .md 需 frontmatter 含 id + type）`,
    });
  }
  const lockById = new Map((lock?.assets ?? []).map((a) => [a.id, a]));
  const schemaIssues: string[] = [];
  const tampered: string[] = [];
  const missing: string[] = [];

  for (const a of assets) {
    if (!a.meta.id) schemaIssues.push(`${a.entry.path} 缺 id`);
    if (!a.meta.type) schemaIssues.push(`${a.entry.path} 缺 type`);
    else if (!VALID_TYPES.includes(a.meta.type))
      schemaIssues.push(`${a.entry.path} 未知 type=${a.meta.type}`);
    // tamper 仅检查 rule/skill/prompt（.md 文件）；mcp 单文件模型不参与 tamper
    const le = lockById.get(a.meta.id);
    if (le && le.hash !== a.hash) tampered.push(a.meta.id);
  }
  for (const le of lock?.assets ?? []) {
    if (!allAssets.find((a) => a.meta.id === le.id)) missing.push(le.id);
  }

  out.push(schemaIssues.length ? `  🔴 schema 问题 ${schemaIssues.length}` : '  ✓ schema 正常');
  if (lock) {
    out.push(
      tampered.length
        ? `  🟡 与 lockfile 不一致 ${tampered.length}：${tampered.join(', ')}`
        : '  ✓ 与 lockfile 一致',
    );
  } else {
    out.push('  · 未建档，跳过 lockfile 校验');
  }
  if (missing.length) out.push(`  🔴 lockfile 记录但文件缺失：${missing.join(', ')}`);

  for (const s of schemaIssues)
    findings.push({ severity: 'block', category: '资产', message: s });
  for (const t of tampered)
    findings.push({ severity: 'warn', category: '资产', message: `${t} 与 lockfile 不一致（可能被手改）` });
  for (const m of missing)
    findings.push({ severity: 'block', category: '资产', message: `${m} lockfile 记录但文件缺失` });
  out.push('');

  // 3. 药典新鲜度（需 market）
  out.push('药典新鲜度');
  try {
    const marketPath = resolveMarketPath(opts.market);
    // 药典整体一致性：当前 manifest integrity 与 lockfile 记录对比（跨成员用同一份药典的凭证）
    if (lock?.source) {
      const currentIntegrity = await hashFileFull(path.join(marketPath, 'manifest.json'));
      if (currentIntegrity !== lock.source.integrity) {
        out.push('  🟡 药典 manifest 与 lockfile 记录不一致（integrity 变化）');
        findings.push({
          severity: 'warn',
          category: '药典',
          message:
            '药典 manifest integrity 与 lockfile 不一致（团队可能用了不同药典，或药典已更新，重跑 init/update）',
        });
      }
    }
    const stale: string[] = [];
    const versionLag: string[] = [];
    const versionGone: string[] = [];
    const hashChangedNoBump: string[] = [];
    for (const le of lock?.assets ?? []) {
      const m = await findAssetById(marketPath, le.id);
      if (!m) continue;
      const mktVer = normalizeVersion(m.meta.version);
      // 仅当 lockfile 记录了 version 才做版本维度对比（旧 lockfile 无 version，只靠 hash）
      if (le.version) {
        const lockVer = normalizeVersion(le.version);
        const stillExists = m.entry.versions.some((v) => normalizeVersion(v.version) === lockVer);
        if (!stillExists) versionGone.push(`${le.id}@${lockVer}`);
        else if (lockVer !== mktVer) versionLag.push(`${le.id} ${lockVer} -> ${mktVer}`);
      }
      if (m.hash !== le.hash) {
        stale.push(le.id);
        if (le.version && normalizeVersion(le.version) === mktVer) hashChangedNoBump.push(le.id);
      }
    }
    if (versionLag.length) {
      out.push(`  🟡 版本滞后 ${versionLag.length}：${versionLag.join('；')}（重跑 treat 升级）`);
      for (const v of versionLag)
        findings.push({ severity: 'warn', category: '药典', message: `${v} 可更新` });
    }
    if (versionGone.length) {
      out.push(`  🟡 已装版本已从药典移除 ${versionGone.length}：${versionGone.join('；')}（回退或升级到现有版本）`);
      for (const v of versionGone)
        findings.push({ severity: 'warn', category: '药典', message: `${v} 已从药典移除` });
    }
    if (stale.length) {
      const note = hashChangedNoBump.length ? `（其中 ${hashChangedNoBump.length} 项版本号未更新）` : '';
      out.push(`  🟡 内容已变 ${stale.length}：${stale.join(', ')}${note}（重跑 treat）`);
      for (const s of stale)
        findings.push({ severity: 'warn', category: '药典', message: `${s} 内容已变，重跑 treat` });
    }
    if (!versionLag.length && !versionGone.length && !stale.length) {
      out.push('  ✓ 已装资产与药典一致');
    }
  } catch {
    out.push('  · 跳过（药典不可达，用 --market 指定）');
  }
  out.push('');

  // 4. Agent 探测（配置 + 环境）
  out.push('Agent 探测（配置 / 环境）');
  for (const r of renderers) {
    const cfgOn = detected.includes(r.name);
    const env = envByAgent.get(r.name);
    const envOn = env?.installed ?? false;
    const envDetail = env && envOn ? `（${env.signals.join(', ')}）` : '';
    out.push(
      `  ${cfgOn || envOn ? '✓' : '✗'} ${r.name}  配置${cfgOn ? '✓' : '✗'}  环境${envOn ? '✓' : '✗'}${envDetail}`,
    );
  }
  if (assets.length > 0 && detected.length === 0) {
    findings.push({
      severity: 'warn',
      category: 'agent',
      message: '有资产但未检测到 agent 配置，运行 zai-doctor sync',
    });
  }
  // 配置已存在但环境未装：仍可预生成，仅提示
  for (const r of renderers) {
    if (detected.includes(r.name) && !(envByAgent.get(r.name)?.installed ?? false)) {
      findings.push({
        severity: 'info',
        category: 'agent',
        message: `${r.name} 配置已存在但环境未检测到本体（配置仍可预生成）`,
      });
    }
  }
  out.push('');

  // 5. 环境
  out.push('环境');
  out.push(`  Node ${process.version}`);
  out.push(`  包管理器 ${await detectPm(projectRoot)}`);
  out.push('');

  // 6. 症状汇总
  if (findings.length) {
    out.push('症状');
    for (const f of findings) {
      const icon = f.severity === 'block' ? '🔴' : f.severity === 'warn' ? '🟡' : '🟢';
      out.push(`  ${icon} [${f.category}] ${f.message}`);
    }
    out.push('');
  }
  const blocks = findings.filter((f) => f.severity === 'block').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  out.push(`总结：${findings.length} 症状（${blocks} 阻塞 / ${warns} 建议）`);

  const report = out.join('\n');
  console.log(report);

  // 落盘报告（已建档时）
  if (lock) {
    const reportPath = path.join(agentsDir(projectRoot), '.build', 'diagnose-report.md');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, report, 'utf8');
  }

  if (opts.strict && blocks > 0) {
    process.exit(2);
  }
}
