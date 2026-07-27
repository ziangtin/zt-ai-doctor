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
    process.exit(1);
  }
}

// 建档
program
  .command('init')
  .description('建档：在项目建 .agents/ + 空 zai.lock.json')
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
  .action(async (opts: { market?: string; project?: string }) =>
    handle(() => diagnoseCommand(projectRootOf(opts), opts)),
  );

// 开方（Phase 5）
program
  .command('prescribe')
  .description('开方：诊断 + 读技术栈 -> 处方单 [Phase 5]')
  .action(() => {
    console.log('📝 [prescribe] TODO: Phase 5');
  });

// 下药：install + sync
program
  .command('treat [ids...]')
  .description('下药：抓药 + sync 渲染软链 + placement 报告（不带 ids 则按处方单）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .option('--agent <name>', '同步到指定 agent（claude|cursor）')
  .action(
    async (ids: string[], opts: { market?: string; project?: string; agent?: string }) =>
      handle(() => treatCommand(projectRootOf(opts), ids, opts)),
  );

// 覆盖：建 company 覆盖
program
  .command('override <id>')
  .description('覆盖：从药典拷资产到 .agents/company/ 作为 company 覆盖起点（编辑后 sync 按 id 覆盖）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (id: string, opts: { market?: string; project?: string }) =>
    handle(() => overrideCommand(projectRootOf(opts), id, opts)),
  );

// 换药：仅 sync
program
  .command('sync')
  .description('换药：把 .agents/ 渲染成各 agent 配置（软链优先，降级 copy）')
  .option('--agent <name>', '指定单个 agent（claude|cursor）')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (opts: { agent?: string; project?: string }) =>
    handle(() => syncCommand(projectRootOf(opts), opts)),
  );

// 药典更新
program
  .command('update')
  .description('药典更新：拉 market 最新版，更新 lockfile')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (opts: { market?: string; project?: string }) =>
    handle(() => updateCommand(projectRootOf(opts), opts)),
  );

program.parse();
