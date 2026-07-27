# zai-doctor

agent-agnostic 的个人 coding-agent 工程化工具。像医生一样：**建档 -> 诊断 -> 开方 -> 下药 -> 复诊**，对症下药。

面向主流 coding agent，不绑死某一家。前端优先。

> 当前为 **Phase 4 原型**：建档/诊断/下药/换药/覆盖/查药典已可用；开方与多 agent 扩展仍在规划。

## 它解决什么

- **统一来源**：项目里用 `.agents/` 存 agent-agnostic 的 canonical 资产（rules/skills/mcp）
- **同步转化**：一条命令把 `.agents/` 渲染成各 agent 原生配置（软链优先，降级 copy，受管文件冲突保护）
- **诊断**：检查项目 agent 配置工程化是否到位，出症状报告

## 命令

| 命令 | 状态 | 作用 |
|---|---|---|
| `init` | ✅ | 建档：建 `.agents/` + lockfile |
| `list` | ✅ | 查药典：列资产 + 已装状态（`--type`/`--tag` 筛选） |
| `info <id>` | ✅ | 查资产详情 + 已装状态 + hash 一致性 |
| `diagnose` | ✅ | 诊断：agent 配置/资产健康/药典新鲜度/环境，出症状报告（`--strict` 阻塞返回非零） |
| `treat <ids...>` | ✅ | 下药：装资产 + sync 渲染 + placement 报告（不支持无 id 处方单） |
| `override <id>` | ✅ | 覆盖：拷资产到 `.agents/company/` 作 company 覆盖起点 |
| `sync` | ✅ | 换药：渲染 `.agents/` 到 agent 配置（`--copy` 强制 copy） |
| `update` | ✅ 部分 | 仅刷新 lockfile 药典版本（暂不拉取远程） |
| `prescribe` | 🚧 规划 | 开方：技术栈检测 + 处方单（当前 stub） |

建议 `alias zd=zai-doctor`。

## Agent 支持

- **已实现**：Claude Code、Cursor
- **规划中**：Copilot、Codex、Cline、Windsurf

## 仓库结构

```
zt-ai-doctor/
├── cli/        # zai-doctor CLI（Node + TS）
├── market/     # canonical 资产（药典）
├── catalog/    # 静态站（规划中）
└── docs/       # 设计、计划、评审
```

## 开发

```bash
pnpm install
pnpm dev <command>        # 例：pnpm dev diagnose
pnpm lint
pnpm build
```

设计见 [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)，当前方案评审见 [docs/CURRENT_SOLUTION_REVIEW.md](docs/CURRENT_SOLUTION_REVIEW.md)。
