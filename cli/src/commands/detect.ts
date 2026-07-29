import fs from 'node:fs/promises';
import path from 'node:path';
import { agentsDir, lockfilePath } from '../core/paths.js';
import { readLockfile } from '../core/lockfile.js';
import { loadAgentConfig } from '../core/agentConfig.js';
import { detectAllEnv } from '../core/envDetect.js';

/**
 * detect：环境探测。检测机器上是否真的安装了各 agent（PATH / 全局配置目录 / Windows 注册表）。
 * 区别于 diagnose 里的「配置探测」（项目里有没有建过 agent 配置）。
 */
export async function detectCommand(
  projectRoot: string,
  opts: { json?: boolean; verbose?: boolean },
): Promise<void> {
  const configs = await loadAgentConfig(projectRoot);
  const results = await detectAllEnv(configs);

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const lines: string[] = ['🔍 zai-doctor 环境探测', ''];
  for (const r of results) {
    if (r.installed) {
      const detail = opts.verbose && r.signals.length ? `  (${r.signals.join(', ')})` : '';
      lines.push(`  ✓ ${r.agent}${detail}`);
    } else {
      lines.push(`  ✗ ${r.agent}（未检测到本体）`);
    }
  }
  const installed = results.filter((r) => r.installed).length;
  lines.push('');
  lines.push(`总结：${installed}/${results.length} 已安装`);
  const report = lines.join('\n');
  console.log(report);

  // 已建档时落盘报告
  const lock = await readLockfile(lockfilePath(projectRoot));
  if (lock) {
    const reportPath = path.join(agentsDir(projectRoot), '.build', 'detect-report.md');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, report, 'utf8');
  }
}
