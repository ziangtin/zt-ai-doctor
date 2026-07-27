#!/usr/bin/env node
import { program } from 'commander';

const VERSION = '0.1.0';

program
  .name('zai-doctor')
  .description('agent-agnostic coding-agent engineering doctor: 建档 -> 诊断 -> 开方 -> 下药 -> 复诊')
  .version(VERSION);

// 建档
program
  .command('init')
  .description('建档：在项目建 .agents/ + 空 zai.lock.json')
  .action(() => {
    console.log('💊 [init] TODO: 建 .agents/ 与 zai.lock.json');
  });

// 诊断
program
  .command('diagnose')
  .description('诊断：查 agent 配置/资产/环境一致性，出症状报告')
  .action(() => {
    console.log('🩺 [diagnose] TODO: 扫描症状');
  });

// 开方
program
  .command('prescribe')
  .description('开方：诊断 + 读技术栈 -> 处方单 (.agents/.build/prescription.md)')
  .action(() => {
    console.log('📝 [prescribe] TODO: 生成处方单');
  });

// 下药
program
  .command('treat [ids...]')
  .description('下药：抓药 + sync 渲染软链 + placement 报告（不带 ids 则按处方单）')
  .action((ids: string[]) => {
    const what = ids.length ? ids.join(', ') : '(按处方单)';
    console.log(`💉 [treat] TODO: 抓药 ${what}`);
  });

// 换药
program
  .command('sync')
  .description('换药：仅重新渲染软链（不装新资产）')
  .option('--agent <name>', '指定单个 agent')
  .action((opts: { agent?: string }) => {
    const target = opts.agent ? ` (${opts.agent})` : '';
    console.log(`🔄 [sync] TODO: 渲染${target}`);
  });

// 药典更新
program
  .command('update')
  .description('药典更新：拉 market 最新版，更新 lockfile')
  .action(() => {
    console.log('📚 [update] TODO: 拉 market 新版本');
  });

program.parse();
