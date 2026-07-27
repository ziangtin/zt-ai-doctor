# 当前方案评审

> 评审日期：2026-07-27  
> 评审范围：当前仓库中的 CLI、market、实现计划与发布配置。  
> 验证情况：`tsc --noEmit` 与 ESLint 均通过；仓库暂未提供自动化测试或完整端到端验证。

## 1. 评审结论

当前方案方向合理、架构骨架清楚，但尚未达到“可稳定日常使用”的 MVP。

综合评分：**5.8 / 10**

- 作为概念验证：**7.5 / 10**
- 作为个人内部工具：**6 / 10**
- 作为可发布、可长期维护的产品：**4 / 10**

当前最需要补齐的不是 catalog 或更多 renderer，而是受管文件状态、验证边界、失败语义和测试矩阵。

## 2. 主要问题

### 2.1 Windows copy 降级会导致后续同步失效（高优先级）

软链失败后，`place` 会降级为普通文件 copy；下一次同步发现目标是普通文件，又会将其当作用户文件保护并跳过。

相关实现：

- copy 降级：`cli/src/core/place.ts`
- 普通文件保护及 skip：`cli/src/core/place.ts`

实际结果：

```text
首次 sync：软链失败 -> copy 成功
修改 canonical 资产
再次 sync：发现普通文件 -> skip
最终 agent 仍使用旧内容
```

这影响 Windows 默认主路径，与“修改源文件后重跑 sync 即更新”的核心承诺冲突。

建议引入 managed placement manifest，记录目标路径、生成 hash 和放置方式。只有目标仍等于上次生成 hash 时才允许覆盖；用户修改过时才报告冲突。

### 2.2 `agents` 兼容声明没有真正生效（高优先级）

资产定义了 `agents` 字段，类型模型也包含该字段，但 renderer 目前仅按 `type` 过滤，没有按 `meta.agents` 过滤，`AgentRenderer.supports` 也未被同步引擎统一使用。

当前样例暂时被 renderer 内的硬编码逻辑掩盖；market 增长后，可能把不兼容资产渲染给错误 agent。

建议在进入 renderer 前统一判断：

```text
asset.agents 包含目标 agent
AND renderer.supports 包含 asset.type
```

所有不兼容项都应产生明确的 skip 报告。

### 2.3 文档宣称的主流程尚未闭环（高优先级）

当前 README 描述了完整的“建档 -> 诊断 -> 开方 -> 下药 -> 复诊”流程，但实际情况是：

- `prescribe` 仅输出 Phase 5 TODO。
- `treat` 不带 ID 时还不能读取处方单。
- `update` 只刷新 lockfile 中的 market 版本，不会拉取 market。
- 实际只支持 Claude 和 Cursor，尚未支持 README 提到的 Copilot、Codex 和 Cline。

当前更准确的产品状态是“Phase 4 原型”，需要在 README 中明确区分已实现能力与规划能力。

### 2.4 缺少运行时 schema 和路径安全校验（高优先级）

manifest、frontmatter 和 lockfile 主要通过 TypeScript 类型断言读取，没有运行时结构校验。

潜在问题包括：

- manifest 中的 `path` 可使用 `../` 越出 market。
- asset `id` 可包含路径分隔符，并被 renderer 用于构造目标路径。
- manifest 的 id/type 与 frontmatter 不一致时不会阻止安装。
- MCP body JSON 无效时会被静默丢弃。
- lockfile 的结构和 schema 版本没有验证。

建议采用 Zod 或 JSON Schema 统一验证 manifest、frontmatter、lockfile 和 MCP body，并对最终路径执行 `path.resolve` 后的目录边界检查。

### 2.5 部分失败仍可能表现为命令成功（中高优先级）

当前存在以下情形：

- `treat` 遇到不存在的 ID 时记录错误但继续执行，进程仍可能返回 0。
- `--agent unknown` 只会表现为没有活动 agent。
- 没有检测到 agent 时，`sync` 返回空结果而不是失败。
- `diagnose` 发现 blocker 后不会设置非零退出码。
- MCP JSON 解析失败被静默忽略。

建议明确退出码语义：

- 配置或输入错误：退出码 2。
- 同步部分失败：退出码 1。
- `diagnose --strict` 发现 blocker：返回非零。
- 只有明确不支持的能力可以作为成功状态下的 skip。

### 2.6 生成物没有垃圾回收机制（中优先级）

资产卸载、重命名或不再支持某 agent 时，旧的 Cursor rules、Claude skills、`.agents/.build` 内容及 MCP 配置不会被可靠清理。目前也没有 remove/uninstall 命令。

建议基于 placement manifest 只清理“上一轮由工具管理且未被用户修改”的目标。

### 2.7 market 供应链设计尚未落地（中优先级）

计划提出 npm 分发、离线使用和版本锁定，但目前：

- workspace 只包含 CLI，market 尚不是独立包。
- `update` 不下载任何内容。
- lockfile 未记录 market 来源或包完整性。
- MCP 示例使用 `npx -y` 和未固定版本的第三方包。

建议固定 MCP 包版本，在 lockfile 中保存完整 SHA-256、source URI、source version/integrity，并在安装前展示 MCP 将执行的 command/args，要求显式信任。

## 3. 方案优点

1. **canonical source + renderer 的方向正确**：资产源与 agent 原生格式分离，比维护多份配置更容易扩展。
2. **分层覆盖模型简单清楚**：`company > personal > baseline`，同层按 priority 决策，易于理解和实现。
3. **有保护用户配置的意识**：不直接覆盖普通目标文件是正确的安全倾向；当前缺少的是区分用户文件和工具生成 copy 的能力。
4. **renderer 边界清晰**：Claude、Cursor 的格式差异被局部封装，后续增加 agent 的成本相对可控。
5. **可观测性方向正确**：sync report、diagnose report 和显式 skip 适合工程工具。
6. **技术栈克制**：Commander、gray-matter 和 Node 文件 API 足以支撑当前规模，没有明显过度设计。
7. **静态质量基线正常**：TypeScript 类型检查和 ESLint 均通过，代码规模较小，阅读成本不高。

## 4. 多维度评分

| 维度 | 得分 | 评价 |
|---|---:|---|
| 产品定位 | 7/10 | “统一 agent 资产来源”是真实痛点；医生隐喻有记忆点，但命令语义需要学习 |
| 架构设计 | 7/10 | canonical、renderer、layer、placement 分层合理 |
| 功能完整性 | 5/10 | Phase 1-4 有骨架，但 prescribe、真实 update、卸载、多 agent 未完成 |
| 核心正确性 | 4/10 | Windows copy 重同步、agent 过滤、旧生成物清理存在关键缺口 |
| 跨平台能力 | 4/10 | 考虑了 Windows，但默认降级路径本身无法持续同步 |
| 安全性 | 4/10 | 有普通文件保护，但缺路径校验、运行时 schema 和 MCP 信任控制 |
| 可维护性 | 6.5/10 | 模块较清楚；缺统一验证层、状态管理层和测试 |
| 可测试性 | 4/10 | 纯函数部分容易测试，但目前没有测试套件或 fixture |
| 可观测性 | 6.5/10 | 报告机制不错；异常吞没和退出码仍不可靠 |
| 性能 | 7/10 | 当前数据量下足够；串行读取不是现阶段瓶颈 |
| 发布成熟度 | 3.5/10 | 缺 market 包、发布元数据、CI、版本联动和安装验证 |
| 文档真实性 | 5/10 | 实施计划较详细，但 README 把部分规划功能写成已有能力 |

## 5. 补充方案与实施顺序

建议先将近期目标收缩为：**可靠管理 Claude + Cursor 的项目级 rules，skill/MCP 暂作为实验能力。**

### 5.1 第一阶段：修复核心正确性

- 引入 managed placement manifest。
- 修复 copy 后无法安全更新的问题。
- 统一执行 `agents` 和 `supports` 过滤。
- 清理不再生成的受管目标。
- 对未知 agent、缺失 ID、非法 MCP 返回明确失败。

### 5.2 第二阶段：建立可信数据边界

- 为 manifest、asset、lockfile、MCP 增加运行时 schema。
- 将 id 限制为类似 `^[a-z0-9][a-z0-9._-]*$` 的安全格式。
- 防止 market path 和 target path 越界。
- lockfile 使用完整 hash，并通过临时文件 + rename 原子写入。

### 5.3 第三阶段：补充端到端测试矩阵

至少覆盖：

- Linux/macOS symlink。
- Windows symlink 成功。
- Windows copy 降级后再次同步。
- 用户修改目标文件后的冲突保护。
- company/personal/baseline 覆盖。
- 非法 frontmatter 和 MCP JSON。
- 资产删除及旧生成物清理。
- Claude、Cursor 同时存在。

### 5.4 第四阶段：重新定义 update

第一阶段可将 market 随 CLI 包发布并固定版本，不急于支持任意远程 market。等本地闭环稳定后，再抽象 npm/git source adapter。

### 5.5 第五阶段：实现 prescribe

处方推荐不应只依赖简单的技术栈匹配。建议输出推荐原因、匹配信号、置信度、冲突项和即将执行的 MCP 命令，并继续保留人工确认。

## 6. 建议验收标准

达到下列条件后，可将项目从“Phase 4 原型”调整为“个人可用 MVP”：

- Windows copy 模式连续同步不会产生陈旧配置。
- 工具能够识别并保护被用户修改的目标文件。
- 非法资产不会越界读写或静默进入生成结果。
- 所有命令具有可用于 CI 的稳定退出码。
- 资产新增、更新、删除和 agent 切换均有端到端测试。
- README 中所有标为已支持的命令都具备真实实现。

完成上述整改后，预计整体成熟度可从当前约 **5.8 / 10** 提升到 **7.5 / 10** 左右。
