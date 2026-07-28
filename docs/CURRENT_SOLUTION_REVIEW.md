# 当前方案评审

> 初评日期：2026-07-27｜复评日期：2026-07-28
> 评审范围：CLI、market、实现计划与发布配置。
> 验证情况：`tsc --noEmit`（含 test）、ESLint、`vitest run`（21 测试）均通过。

## 0. 修复进展

### 第一阶段（2026-07-27）：评审 2.1–2.7 主干修复

- **2.1** 引入 placement manifest（`.agents/.build/placements.json`），`place()` 用 hash 区分受管 copy 与用户改动；copy 降级后改 canonical 重跑 sync 会更新。
- **2.2** sync 引擎统一按 `renderer.supports` + `meta.agents` 过滤，不兼容项产出明确 skip。
- **2.5** treat 未找到 id / `sync --agent unknown` / `diagnose --strict` 阻塞均返回非零退出码；非法 MCP body 产出 skip 报告。
- **2.6** sync 基于 manifest GC 上一轮受管、本轮未再生成的目标（未被用户改过才清理）。
- 新增 `--copy`、`diagnose --strict`。
- **2.3** README 用状态表区分已实现/规划中，agent 支持只声明 Claude+Cursor。
- **2.4** Zod 校验 manifest/frontmatter/lockfile（含 schema 版本）；id 格式 `^[a-z0-9][a-z0-9._-]*$`；manifest path `assertWithinBase`；id/type 一致性；lockfile 原子写。
- **2.7** lockfile 记录 `source`（type/uri/ref/integrity，sha256 of manifest）；`update --source <git-url>` 从 git clone/pull 到缓存并记录 commit；MCP 信任控制；lockfile schema v2。

### 第二阶段（2026-07-28）：补齐第一阶段遗留缺口 + 测试矩阵

复评发现 2.4/2.5/2.7 的边界细节未完全落地，本轮补齐：

- **2.4 补齐**：MCP body 加 zod schema（`mcpBodySchema`：command 必填、args 可选、passthrough）；`trust` 与 renderer `aggregateMcp` 统一走 `validateMcpBody`，缺字段不再静默。
- **2.5 补齐**：退出码区分 `exit(2)`（参数/schema/配置错误）vs `exit(1)`（运行失败）；新增 `UsageError`，schema 校验失败、路径越界、未知 agent、未建档、未找到资产、非法 MCP、`diagnose --strict` 均走 `exit(2)`。
- **2.7 补齐**：`placements.json` 原子写（tmp+rename）；资产/受管文件 hash 改完整 SHA-256（64 hex，原 16 位截断）。
- **2.5 补齐**：sync 前对 target path 显式 `assertWithinBase(projectRoot, target)`，与 id 正则共同防 target 注入。
- **测试矩阵**：新增 vitest，5 文件 30 测试，覆盖 copy 重同步、用户冲突、GC、非活跃 agent 保留、symlink（条件）、分层覆盖、priority、非法 id/frontmatter/MCP/路径越界/不一致/lockfile 版本、退出码、双 agent + supports skip、未信任 MCP skip、prescribe 技术栈匹配/处方单/标签筛选/treat 读处方单。

### 第三阶段（2026-07-28）：Phase 5 prescribe 开方

- `prescribe` 命令：读项目 package.json 依赖 + 检测 agent + 匹配药典资产 `stack`（deps/files）-> 生成处方单（`.agents/.build/prescription.md`）。
- 处方单含：技术栈、症状、推荐区（置信度 高/中 + 信号 + 原因，默认勾选）、可选区（无 stack/无匹配，含 MCP command/args + 未信任/未固定版本警告 + skill 仅 Claude 提示）、用法说明。
- `treat` 不带 id 改为读处方单勾选 `[x]` 抓药；无处方单/无勾选给明确提示。
- `prescribe --tag` 按标签筛选资产。
- 不自动装、不自动信任，保留人工挑选。

## 1. 评审结论

综合评分：**7.5 / 10**（初评 5.8，二评 7.2）

- 作为概念验证：8.5 / 10
- 作为个人内部工具：8 / 10
- 作为可发布、可长期维护的产品：5.5 / 10

核心正确性、安全边界与测试矩阵已达到"个人可用 MVP"门槛，Phase 5 prescribe 闭环看诊流程（建档->诊断->开方->下药->复诊）。剩余短板集中在发布成熟度（无 CI、market 未独立包、无 remove 命令）与多 agent 扩展。

## 2. 主要问题（初评 2.1–2.7，均已修复）

逐项状态见第 0 节。初评列出的 7 项主干问题与边界缺口均已落地并有测试覆盖。当前无新增高优先级问题。

## 3. 方案优点

1. **canonical source + renderer 的方向正确**：资产源与 agent 原生格式分离，比维护多份配置更容易扩展。
2. **分层覆盖模型简单清楚**：`company > personal > baseline`，同层按 priority 决策。
3. **有保护用户配置的意识**：现已能区分受管 copy 与用户文件，冲突时显式 skip 不覆盖。
4. **renderer 边界清晰**：Claude、Cursor 的格式差异被局部封装。
5. **可观测性方向正确**：sync report、diagnose report、显式 skip、稳定退出码（0/1/2）。
6. **技术栈克制**：Commander、gray-matter、zod、vitest 足以支撑当前规模。
7. **静态质量基线正常**：TypeScript 类型检查、ESLint、vitest 均通过，且有 typecheck 专项 script 覆盖 test 目录。

## 4. 多维度评分

| 维度 | 初评 | 复评 | 评价 |
|---|---:|---:|---|
| 产品定位 | 7 | 7 | 不变 |
| 架构设计 | 7 | 7 | 不变 |
| 功能完整性 | 5 | 7 | prescribe 已实现（技术栈匹配+处方单+--tag），treat 读处方单；update 支持 git source；仍无 remove 命令、仅 Claude+Cursor |
| 核心正确性 | 4 | 8 | copy 重同步/agent 过滤/GC/冲突保护均修复并有测试 |
| 跨平台能力 | 4 | 7 | copy 降级重同步修复 + 测试；symlink 条件测试 |
| 安全性 | 4 | 7.5 | 运行时 schema/路径边界/MCP 信任/完整 hash + 测试 |
| 可维护性 | 6.5 | 7.5 | 统一 errors/schema 层；测试 fixture 清晰 |
| 可测试性 | 4 | 8 | 21 测试 + typecheck + fixture |
| 可观测性 | 6.5 | 7 | 退出码语义清晰；skip 报告完整 |
| 性能 | 7 | 7 | 不变 |
| 发布成熟度 | 3.5 | 5 | git source + lockfile v2 + integrity + 测试；仍无 CI/发布元数据/market 独立包 |
| 文档真实性 | 5 | 7 | README 区分已实现/规划；计划 checklist 与代码对齐 |

## 5. 剩余短板与下一步

1. **无 remove/uninstall 命令**：资产卸载靠删 `.agents/<type>/<id>.md` 后 sync GC，无显式命令。
2. **发布成熟度**：无 CI、无自动化发布、market 未独立成包。
3. **多 agent**：仅 Claude+Cursor；Copilot/Codex/Cline 在 Phase 7。
4. **conflict 退出码**：用户改过目标文件时 sync 当前 `exit 0`（conflict 作 skip 报告），未算部分失败。若 CI 需 stricter 语义可调整为 `exit 1`。
5. **symlink 实测**：Windows 默认环境跳过 symlink 断言；需在 Linux/macOS 或 Windows 开发者模式 CI 上验证各 agent 是否跟随 symlink 读配置。

按 IMPLEMENTATION_PLAN 第 10 节，下一步进入 Phase 6（catalog 静态站）。

## 6. 验收标准达成情况

初评第 6 节"个人可用 MVP"验收标准：

- ✅ Windows copy 模式连续同步不会产生陈旧配置（placement.test.ts 验证）
- ✅ 识别并保护被用户修改的目标文件（placement.test.ts 验证）
- ✅ 非法资产不会越界读写或静默进入生成结果（validation.test.ts 验证）
- ✅ 所有命令具有可用于 CI 的稳定退出码（0/1/2 + 测试）
- ✅ 资产新增、更新、删除和 agent 切换均有端到端测试
- ✅ README 中所有标为已支持的命令都具备真实实现（prescribe 明确标 Phase 5）

MVP 验收标准达成。
