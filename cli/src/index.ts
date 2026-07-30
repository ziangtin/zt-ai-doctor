#!/usr/bin/env node
import path from 'node:path';
import { program } from 'commander';
import { initCommand } from './commands/init.js';
import { treatCommand } from './commands/treat.js';
import { updateCommand } from './commands/update.js';
import { syncCommand } from './commands/sync.js';
import { listCommand } from './commands/list.js';
import { infoCommand } from './commands/info.js';
import { overrideCommand } from './commands/override.js';
import { diagnoseCommand } from './commands/diagnose.js';
import { detectCommand } from './commands/detect.js';
import { trustCommand } from './commands/trust.js';
import { prescribeCommand } from './commands/prescribe.js';
import { removeCommand } from './commands/remove.js';
import { UsageError } from './core/errors.js';

const VERSION = '0.1.0';

program
  .name('zai-doctor')
  .description('agent-agnostic coding-agent engineering doctor: 建档 -> 诊断 -> 开方 -> 下药 -> 复诊')
  .version(VERSION);

/** 项目根目录：--project > cwd */
function projectRootOf(opts: { project?: string }): string {
  return opts.project ? path.resolve(opts.project) : process.cwd();
}

/** 统一捕获命令异常，打印友好错误 */
async function handle(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(e instanceof UsageError ? 2 : 1);
  }
}

// 建档
program
  .command('init')
  .description('建档：在项目建 .agents/ + 空 zai-doctor.lock.json')
  .option('--market <path>', '药典路径（默认 $ZAI_MARKET_PATH 或 ./market）')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (opts: { market?: string; project?: string }) =>
    handle(() => initCommand(projectRootOf(opts), opts)),
  );

// 查药典：列出资产
program
  .command('list')
  .description('查药典：列出所有资产 + 已装状态（可 --type/--tag 筛选）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .option('--type <type>', '按类型筛选（rule|skill|mcp|prompt）')
  .option('--tag <tag>', '按标签筛选')
  .action(
    async (opts: { market?: string; project?: string; type?: string; tag?: string }) =>
      handle(() => listCommand(projectRootOf(opts), opts)),
  );

// 查药典：看某个资产详情
program
  .command('info <id>')
  .description('查药典：看某个资产详情 + 已装状态 + hash 一致性（--full 显示正文）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .option('--full', '显示正文')
  .action(async (id: string, opts: { market?: string; project?: string; full?: boolean }) =>
    handle(() => infoCommand(projectRootOf(opts), id, opts)),
  );

// 诊断
program
  .command('diagnose')
  .description('诊断：查 agent 配置/资产/环境一致性，出症状报告')
  .option('--market <path>', '药典路径（用于新鲜度检查）')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .option('--strict', '发现阻塞症状时返回非零退出码')
  .action(async (opts: { market?: string; project?: string; strict?: boolean }) =>
    handle(() => diagnoseCommand(projectRootOf(opts), opts)),
  );

// 环境探测
program
  .command('detect')
  .description('环境探测：检测机器上实际安装了哪些 agent（PATH / 全局配置目录 / Windows 注册表）')
  .option('--project <path>', '项目根目录（默认 cwd；用于读项目覆盖配置与落盘报告）')
  .option('--json', '输出机器可读 JSON')
  .option('--verbose', '显示命中信号')
  .action(async (opts: { project?: string; json?: boolean; verbose?: boolean }) =>
    handle(() => detectCommand(projectRootOf(opts), opts)),
  );

// 开方
program
  .command('prescribe')
  .description('开方：诊断 + 读技术栈 -> 处方单（.agents/.build/prescription.md）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .option('--tag <tag>', '按标签筛选资产')
  .action(async (opts: { market?: string; project?: string; tag?: string }) =>
    handle(() => prescribeCommand(projectRootOf(opts), opts)),
  );

// 下药：install + sync
program
  .command('treat [ids...]')
  .description('下药：抓药 + sync 渲染软链 + placement 报告（不带 ids 则按处方单）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .option('--agent <name>', '同步到指定 agent，支持逗号多选（如 claude,cursor）')
  .option('--copy', '强制 copy（不用软链）')
  .option('--to <version>', '装指定版本（回退到旧版本）')
  .action(
    async (ids: string[], opts: { market?: string; project?: string; agent?: string; copy?: boolean; to?: string }) =>
      handle(() => treatCommand(projectRootOf(opts), ids, opts)),
  );

// 覆盖：建覆盖起点
program
  .command('override <id>')
  .description('覆盖：从药典拷资产到 .agents/<type>/<id>.override.md 作为覆盖起点（layer: company，sync 按 id 覆盖）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (id: string, opts: { market?: string; project?: string }) =>
    handle(() => overrideCommand(projectRootOf(opts), id, opts)),
  );

// 移除：删已装资产 + sync 清理
program
  .command('remove <id>')
  .description('移除：删已装资产 + sync 清理 agent 配置中的受管目标（override 文件不动）')
  .option('--agent <name>', '同步到指定 agent，支持逗号多选')
  .option('--copy', '强制 copy')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (id: string, opts: { agent?: string; copy?: boolean; project?: string }) =>
    handle(() => removeCommand(projectRootOf(opts), id, opts)),
  );

// 信任 MCP
program
  .command('trust <id>')
  .description('信任 MCP：展示 command/args + 未固定版本警告（treat 已自动信任，此命令用于显式审查）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (id: string, opts: { market?: string; project?: string }) =>
    handle(() => trustCommand(projectRootOf(opts), id, opts)),
  );

// 换药：仅 sync
program
  .command('sync')
  .description('换药：把 .agents/ 渲染成各 agent 配置（软链优先，降级 copy）')
  .option('--agent <name>', '同步到指定 agent，支持逗号多选（如 claude,cursor）')
  .option('--copy', '强制 copy（不用软链，适合无软链权限的环境）')
  .option('--installed-only', '仅同步环境探测已安装的 agent（默认关，允许预生成配置）')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (opts: { agent?: string; copy?: boolean; installedOnly?: boolean; project?: string }) =>
    handle(() => syncCommand(projectRootOf(opts), opts)),
  );

// 药典更新
program
  .command('update')
  .description('药典更新：刷新 lockfile 版本与 integrity（--source <git-url> 从 git 拉取）')
  .option('--market <path>', '药典路径')
  .option('--source <git-url>', '从 git 拉取药典')
  .option('--ref <ref>', 'git 分支/tag（配合 --source）')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(
    async (opts: { market?: string; source?: string; ref?: string; project?: string }) =>
      handle(() => updateCommand(projectRootOf(opts), opts)),
  );

program.parse();
