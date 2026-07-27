#!/usr/bin/env node
import path from 'node:path';
import { program } from 'commander';
import { initCommand } from './commands/init.js';
import { treatCommand } from './commands/treat.js';
import { updateCommand } from './commands/update.js';

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

// 诊断（Phase 4）
program
  .command('diagnose')
  .description('诊断：查 agent 配置/资产/环境一致性，出症状报告 [Phase 4]')
  .action(() => {
    console.log('🩺 [diagnose] TODO: Phase 4');
  });

// 开方（Phase 5）
program
  .command('prescribe')
  .description('开方：诊断 + 读技术栈 -> 处方单 [Phase 5]')
  .action(() => {
    console.log('📝 [prescribe] TODO: Phase 5');
  });

// 下药
program
  .command('treat [ids...]')
  .description('下药：抓药 + sync 渲染软链 + placement 报告（不带 ids 则按处方单）')
  .option('--market <path>', '药典路径')
  .option('--project <path>', '项目根目录（默认 cwd）')
  .action(async (ids: string[], opts: { market?: string; project?: string }) =>
    handle(() => treatCommand(projectRootOf(opts), ids, opts)),
  );

// 换药（Phase 2）
program
  .command('sync')
  .description('换药：仅重新渲染软链（不装新资产）[Phase 2]')
  .option('--agent <name>', '指定单个 agent')
  .action(() => {
    console.log('🔄 [sync] TODO: Phase 2 sync 引擎');
  });

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
