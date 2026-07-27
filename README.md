# zai-doctor

agent-agnostic 的个人 coding-agent 工程化工具。像医生一样：**建档 → 诊断 → 开方 → 下药 → 复诊**，对症下药。

不绑 Claude，面向主流 coding agent（Claude Code / Cursor / Copilot / Codex / Cline…）。前端优先。

## 它解决什么

- **统一来源**：项目里用 `.agents/` 存 agent-agnostic 的 canonical 资产（rules/skills/mcp）
- **同步转化**：一条命令把 `.agents/` 渲染成各 agent 能读的原生配置（软链优先，权限不足降级 copy）
- **诊断 + 开方**：检查项目 agent 配置工程化是否到位；按技术栈开方推荐资产，人工挑药

## 命令

```
zai-doctor init        建档：建 .agents/ + lockfile
zai-doctor diagnose    诊断：查 agent 配置/资产/环境，出症状报告
zai-doctor prescribe   开方：诊断 + 读技术栈 -> 处方单（人工挑）
zai-doctor treat       下药：抓药 + sync 渲染软链 + placement 报告
zai-doctor sync        换药：仅重新渲染软链
zai-doctor update      药典更新：拉 market 最新版
```

建议 `alias zd=zai-doctor`。

## 仓库结构

```
zt-ai-doctor/
├── cli/        # zai-doctor CLI（Node + TS）
├── market/     # canonical 资产（药典）
├── catalog/    # 静态站（Phase 6）
└── docs/       # 设计与计划
```

## 状态

骨架阶段。设计见 [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)。

## 开发

```bash
pnpm install
pnpm dev <command>        # 例：pnpm dev diagnose（在 cli/ 下直接 npx tsx src/index.ts <command>）
pnpm build
```
