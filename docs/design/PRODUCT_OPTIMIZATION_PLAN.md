# zai-doctor 产品优化落地方案

> 版本：1.0
> 日期：2026-07-29
> 状态：待执行
> 依据：当前仓库实现、`CURRENT_SOLUTION_REVIEW.md`、市场通用的 AGENTS.md、Agent Skills、MCP 与厂商 instructions/rules 方案。

## 1. 优化目标

将 zai-doctor 从“多 Agent 配置文件生成器”收敛为“开放标准优先的 Agent 工程治理工具”。

产品只聚焦三项核心能力：

1. **Audit**：发现、校验并解释项目中的 AGENTS.md、Agent Skills、MCP 和厂商配置。
2. **Install / Sync**：从可信来源安装资产，在不破坏已有配置的前提下完成结构化合并、更新和卸载。
3. **Policy**：治理 MCP 来源、命令、权限、版本和组织级允许列表。

目标用户：

- 同时使用两个及以上 coding agent 的个人开发者；
- 需要统一项目级 AI 开发规范的小团队；
- 需要审计 MCP 和 Agent 配置的工程平台团队。

暂不以“通用 Agent 资产商店”作为近期目标。资产数量、发布者体系和使用规模达到门槛后，再扩展 catalog。

## 2. 产品原则

### 2.1 开放标准优先

- 通用项目指令以 `AGENTS.md` 为首选 canonical 格式。
- 可复用工作流使用标准 Agent Skills 目录，即 `SKILL.md` 加可选的 `scripts/`、`references/`、`assets/`。
- 外部工具使用 MCP 标准数据模型；仅在落盘时转换为厂商配置格式。
- `.agents/` 不再承载一套与开放标准平行的规则正文格式，只保存资产索引、策略、安装状态和确有必要的中间数据。

### 2.2 无损优先，转换必须显式

转换不得把原生能力静默压平。以下语义必须保留：

- Cursor `globs`、`alwaysApply` 和 description；
- VS Code/Copilot `applyTo`；
- 嵌套 `AGENTS.md` 的目录作用域；
- Skill 的目录结构、脚本、引用材料和资源文件；
- MCP 的 command、args、env、cwd、transport 及厂商扩展字段。

转换结果分为三级：

| 等级 | 含义 | 行为 |
|---|---|---|
| `exact` | 目标格式可完整表达源语义 | 正常生成 |
| `degraded` | 部分语义无法表达 | 输出差异和原因，默认要求确认 |
| `unsupported` | 核心语义无法安全转换 | 拒绝生成，不做静默降级 |

每个 renderer 必须返回 capability report，不能只返回目标文件：

```ts
interface RenderResult {
  placements: Placement[];
  fidelity: 'exact' | 'degraded' | 'unsupported';
  losses: Array<{
    field: string;
    sourceValue: unknown;
    reason: string;
    remediation?: string;
  }>;
}
```

例如，将 `applyTo: "src/**/*.ts"` 转到只支持全局规则的目标时，必须报告作用域丢失，不能自动改成 `alwaysApply: true`。

### 2.3 不拥有用户的整个配置文件

- Markdown 使用带版本标识的 managed block，保留用户区段。
- JSON、JSONC、YAML、TOML 使用结构化 parser 合并目标字段。
- 无法可靠解析时停止，不通过字符串拼接覆盖。
- 所有写操作先生成 diff，并支持 `--dry-run`。
- 每次成功写入都保存可回滚快照和 operation journal。

### 2.4 安全默认值

- 安装不等于信任，信任不等于运行。
- MCP 首次启用前展示来源、命令、参数、环境变量名、工作目录和网络/文件权限声明。
- 默认拒绝未固定版本的可执行依赖进入团队策略。
- 远程资产必须有可验证来源；完整性 hash 只证明内容一致，不替代发布者身份。

## 3. 目标信息架构

### 3.1 项目结构

```text
<project>/
├── AGENTS.md                         # 通用根级指令，可含 zai-doctor managed block
├── packages/<name>/AGENTS.md         # monorepo 子树指令
├── .agents/
│   ├── manifest.json                 # 声明安装的资产、版本、目标与策略
│   ├── zai-doctor.lock.json          # 精确来源、版本、hash、依赖解析结果
│   ├── policies/
│   │   └── default.json              # MCP 与来源策略
│   ├── vendor/                       # 必要时保存不可直接采用开放格式的源资产
│   └── .build/                       # 报告、journal、备份，gitignored
├── .agents/skills/<skill>/SKILL.md   # 标准 Agent Skill，可随项目提交
├── .cursor/rules/*.mdc               # 仅保留 Cursor 特有规则
├── .github/instructions/*.instructions.md
└── 各 Agent 的 MCP 配置
```

### 3.2 资产模型 v3

```yaml
schemaVersion: 3
id: frontend.react-review
version: 1.2.0
kind: instruction # instruction | skill | mcp | bundle
title: React review conventions
source:
  type: git
  uri: https://example.com/org/agent-assets.git
  ref: v1.2.0
scope:
  applyTo:
    - "src/**/*.{ts,tsx}"
  roots:
    - "."
targets:
  include: [codex, claude, cursor, copilot]
compatibility:
  requires: []
  conflicts: []
  provides: [react-review]
permissions: []
```

规则正文优先引用标准文件，而不是嵌入 manifest。Skill 必须以目录为发布单元，MCP 必须保留完整结构化 body。

### 3.3 单资产版本和依赖

- market 整体版本不再代表所有资产版本。
- 每项资产必须有 semver。
- lockfile 记录解析后的确切版本、内容 hash、来源 commit 和依赖图。
- 支持 `requires`、`conflicts`、`provides`。
- 更新前展示 changelog、依赖变化和转换 fidelity 变化。

## 4. 命令设计

保留品牌表达，但主命令采用行业通用词汇：

| 新命令 | 作用 | 兼容旧命令 |
|---|---|---|
| `zai-doctor init` | 初始化状态和策略 | 保留 |
| `zai-doctor audit` | 校验配置、兼容性、安全和实际可达性 | `diagnose` 作为 alias |
| `zai-doctor recommend` | 根据确定性信号列候选资产 | `prescribe` 作为 alias |
| `zai-doctor install <id>` | 安装指定版本资产 | `treat` 作为 alias |
| `zai-doctor sync` | 预览并应用配置变化 | 保留 |
| `zai-doctor remove <id>` | 卸载并清理受管内容 | 保留 |
| `zai-doctor update [id]` | 解析并更新资产 | 保留 |
| `zai-doctor trust <id>` | 审批 MCP 或可执行 Skill | 保留 |
| `zai-doctor rollback [operation]` | 回滚最近一次写操作 | 新增 |

通用参数：

```text
--dry-run             只生成 diff 和报告
--json                输出稳定的机器可读结果
--strict              warning 或 degraded 是否导致非零退出
--agent <name>        限定目标 Agent
--scope <path>        限定 monorepo 子树
--allow-degraded      明确允许有损转换
--yes                 跳过非安全类交互确认
```

退出码：

| 退出码 | 含义 |
|---:|---|
| 0 | 成功且无阻塞问题 |
| 1 | 执行或写入失败 |
| 2 | 参数、schema 或策略错误 |
| 3 | 存在配置冲突，未写入 |
| 4 | 存在未批准的有损转换 |
| 5 | 安全策略拒绝 |

## 5. 核心能力改造

### 5.1 Audit

Audit 至少执行以下检查：

1. 发现根目录和子目录的 `AGENTS.md`，计算对指定文件生效的指令链。
2. 发现 Cursor、Copilot、Claude、Codex 等原生配置，并检测重复或冲突指令。
3. 校验 Agent Skills 目录结构、frontmatter、引用文件和脚本入口。
4. 校验 MCP schema、命令可用性、版本固定和所需环境变量是否声明。
5. 可选执行 MCP 启动与协议握手测试；默认不运行第三方命令。
6. 检查已安装资产与 lockfile、来源和策略的一致性。
7. 输出 JSON finding，每项包含稳定 code、severity、location、evidence 和 remediation。

配置文件存在只能证明“检测到”，不能证明 Agent 已加载。报告必须区分：

- `detected`：发现配置；
- `valid`：格式有效；
- `reachable`：目标 Agent 理论可读取；
- `verified`：通过 Agent 或 MCP 实际探测验证。

### 5.2 Recommendation

将“高/中置信度”改为可解释的 match score，不暗示未经验证的推荐质量。

信号来源：

- workspace 内全部 `package.json`；
- 框架和工具配置文件；
- package 版本范围；
- 目录语言分布；
- 已存在 Agent 配置；
- 资产 requires/conflicts；
- 目标 Agent capability。

推荐结果不得默认勾选可执行 MCP 或带脚本 Skill。每条候选项展示命中和排除依据。

### 5.3 Sync 和结构化合并

Sync 固定为四阶段：

```text
discover -> plan -> preview -> apply
```

1. `discover`：读取当前配置和上次 operation state。
2. `plan`：解析资产、作用域、依赖和 renderer capability。
3. `preview`：输出文件级和字段级 diff、转换损失、安全提示。
4. `apply`：创建 journal 和备份后原子写入；失败时自动恢复。

必须覆盖以下合并策略：

- `AGENTS.md` / `CLAUDE.md`：managed block；
- `.cursor/rules/*.mdc`：一资产一文件，保留 scope；
- `.github/instructions/*.instructions.md`：一资产一文件，生成 `applyTo`；
- MCP JSON/JSONC：只管理 `mcpServers.<id>`；
- TOML：只管理明确归属的 table；
- Skill：目录级安装，更新前检查用户修改。

### 5.4 Policy

第一版策略字段：

```json
{
  "sources": {
    "allowed": ["bundled", "git:https://github.com/example/*"],
    "requireSignedTags": false
  },
  "mcp": {
    "requirePinnedPackages": true,
    "allowedCommands": ["node", "npx", "uvx"],
    "blockedEnvPatterns": ["*_TOKEN", "*_SECRET"]
  },
  "skills": {
    "allowScripts": false
  },
  "conversion": {
    "allowDegraded": false
  }
}
```

策略判断必须进入 audit、install 和 sync，不能只停留在报告层。

## 6. Market 与 catalog 调整

### 6.1 资产门槛

在满足以下条件前，catalog 只做最小只读索引，不继续投入 UI：

- 至少 20 个经过实际验证的资产；
- 每项资产有版本、兼容矩阵、维护者、来源和 changelog；
- 至少覆盖 instruction、skill、MCP 三类中的两类；
- 每项资产有自动 schema 测试和至少一个目标 Agent fixture。

### 6.2 发布质量

每项资产页面展示：

- publisher/source；
- 最新版本和发布时间；
- 支持的 Agent 与 fidelity；
- 权限及可执行内容；
- 依赖和冲突；
- 校验状态；
- 更新 diff 和 changelog。

不实现评分、下载量和“热门推荐”，直到存在真实使用数据。

## 7. 分阶段实施计划

### Phase 0：纠偏和稳定基线，1 周

- 修复删除最后一个资产不执行 GC。
- 完成旧 `.agents/company/` 到 override 的兼容迁移。
- 修复损坏 lockfile 被 `init` 静默重置。
- 修复 git source `--ref` 缓存行为。
- 更新全部过期文档，由测试校验关键路径和命令名称。
- 删除或标记尚不可用的 `prompt` 类型。

验收：评审中已确认的高、中风险问题全部有回归测试。

### Phase 1：无损转换和 dry-run，2 周

- 引入 `RenderResult.fidelity/losses`。
- 扩展 scope 数据模型。
- Cursor 保留 globs/alwaysApply；Copilot 生成 applyTo；Codex 支持嵌套 AGENTS.md。
- 增加 `sync --dry-run --json`。
- 未指定 `--allow-degraded` 时拒绝有损转换。

验收：同一条带 scope 的规则在所有目标 Agent 上要么语义等价，要么明确失败；不得静默变成全局规则。

### Phase 2：结构化合并和回滚，2 至 3 周

- Markdown managed block。
- JSON/JSONC/TOML 结构化 merge。
- operation journal、备份和 rollback。
- 导入已有原生配置的只读分析与迁移预览。

验收：现有配置包含用户字段时，sync 只修改受管字段；任一写入阶段失败可恢复到执行前状态。

### Phase 3：标准 Skills 和资产 v3，2 周

- Skill 改为目录资产。
- 实现 schema v3、单资产版本、依赖和冲突。
- 为支持 Agent Skills 的目标提供 direct placement；仅对不支持者报告 unsupported。
- 提供 v2 到 v3 lockfile 和资产迁移命令。

验收：含 scripts/references/assets 的 Skill 安装后目录内容与 hash 完整一致。

### Phase 4：Audit 和 Policy，2 周

- 新增稳定 finding code 和 JSON schema。
- 实现 detected/valid/reachable/verified 状态。
- 增加 MCP 命令、环境变量、版本和可选握手检查。
- 策略文件进入 install/sync 阻断路径。

验收：CI 可仅依赖 `audit --strict --json` 判断配置、安全和转换问题。

### Phase 5：扩充经验证的资产，持续进行

- 先建设 20 个高质量资产，再升级 catalog。
- 每项资产必须有 owner、版本、兼容 fixture 和安全元数据。
- 收集真实安装和问题反馈后再决定是否建设公共 registry。

## 8. 测试矩阵

最低 CI 矩阵：Windows + Linux，Node 20 和当前 LTS。

必须增加：

- 空资产 GC；
- monorepo 与嵌套作用域；
- Cursor globs、Copilot applyTo 的无损转换；
- degraded/unsupported 退出码；
- existing Markdown/JSON/JSONC/TOML 合并；
- journal 中途失败和 rollback；
- Skill 目录完整性；
- 单资产版本、依赖、冲突解析；
- MCP policy 拒绝和显式批准；
- v2 到 v3 迁移；
- 各 renderer 的 golden fixtures。

涉及真实 Agent 是否加载配置的验证单独作为兼容性流水线运行，结果回写 capability matrix，不能用文件存在测试代替。

## 9. 产品指标

近期不使用页面访问量衡量价值，采用工程指标：

- 安装成功率；
- sync 无冲突率；
- 有损转换被提前发现的比例；
- rollback 成功率；
- MCP policy 拦截数量；
- 资产在真实 Agent 上的 verified 覆盖率；
- 文档示例与 CLI 契约测试通过率。

达到以下条件后再评估公共市场：

- 20 个以上 verified 资产；
- 3 个以上非作者团队持续使用；
- 连续两个版本无数据丢失或错误覆盖事故；
- 主要 Agent renderer 有自动兼容性验证。

## 10. 完成定义

优化版本完成必须同时满足：

1. 项目默认采用 AGENTS.md、Agent Skills 和 MCP 开放格式，不重复发明等价正文格式。
2. 任意转换损失均可见、可定位、可阻断，不存在静默语义降级。
3. sync 能与已有配置共存，支持 dry-run、结构化 diff 和 rollback。
4. monorepo、嵌套指令和条件作用域有端到端测试。
5. MCP 和可执行 Skill 受 policy 控制，安装、信任、运行三个状态分离。
6. audit 提供稳定 JSON 输出，并区分 detected、valid、reachable、verified。
7. catalog 中只展示具有版本、来源、安全元数据和兼容证据的资产。

完成上述条件后，zai-doctor 的核心价值将不再是“替用户复制配置”，而是“让跨 Agent 配置可验证、可治理、可安全演进”。
