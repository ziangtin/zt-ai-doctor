# zai-doctor 对话化（MCP）形态设计

> 版本：0.1（设计草案）
> 日期：2026-07-30
> 状态：待评审
> 依据：当前仓库实现（cli/src）、PRODUCT_OPTIMIZATION_PLAN.md §2.1/§2.4/§5.3、架构图 catalog/guide/architecture.md
> 关联：[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)、[CURRENT_SOLUTION_REVIEW.md](./CURRENT_SOLUTION_REVIEW.md)

## 1. 背景与目标

### 1.1 现状

zai-doctor 当前是纯 CLI：用户手动跑 `init -> diagnose -> prescribe -> treat -> sync`，自己读 `diagnose-report.md` / `sync-report.md` / `prescription.md`，自己决策。

### 1.2 目标

**把地址（项目路径或 git URL）丢给某个 coding agent，由该 agent 通过对话驱动整个看诊工作流。** 保留现有 CLI 形态，新增"对话形态"。

### 1.3 核心判断

zai-doctor 的目标 agent（Claude Code / Cursor / Copilot / Codex / Cline / Windsurf）**本身就是对话型 LLM agent**，能读写文件、跑 shell、调 MCP、加载 skill。所以"对话化"不是"再造一个 chat 工具"，而是：

> **让 coding agent 自己驱动 建档→诊断→开方→下药→复诊 工作流；zai-doctor 只提供"能力"，agent 提供"对话"。**

这决定了能力层必须 agent-agnostic，与工具立身之本一致（[README.md](../../README.md) "不绑死某一家"、PRODUCT_OPTIMIZATION_PLAN.md §2.1"开放标准优先"）。

## 2. 方案选型

| 方案 | 形态 | agent-agnostic | 复用核心 | 对话增量 | 代价 |
|---|---|---|---|---|---|
| **A. MCP Server** | `zai-doctor mcp` 把核心操作暴露成 MCP 工具 | ✅ MCP 是开放标准，目标矩阵全覆盖 | ✅ 换传输层 | 高 | 中 |
| **B. Skill / 指令** | `ai-engineer` skill 或 AGENTS.md 受管块教 agent 调 CLI | ✅ agent-agnostic（skill 不绑 agent，按各 agent skill 映射同步） | ✅ 零基建 | 中 | 低 |
| **C. 内置 `zd chat` REPL** | CLI 自带 LLM 循环 | ✅ | ✅ | 低 | 高，且重复造 agent |
| **D. 纯 AGENTS.md 指令** | 一条受管指令 | ✅ | ✅ | 低 | 极低，最弱 |

**结论：A 为主（能力层，must）+ B/D 薄壳（编排层，optional 胶水）。不是二选一。**

- **C 排除**：用户已在用某个 coding agent，"丢给 agent"就是用*那个* agent；在 zai-doctor 内再造 LLM 循环重复且更弱，还需 API key，违反 §2.1。
- **MCP 是能力层**：给 agent 调用 zai-doctor 的能力，agent-agnostic。
- **Skill/AGENTS.md 是编排层**：给 agent 工作流剧本（何时诊断、症状→处方映射、何时求确认、复诊循环）。能力不依赖此层；任何装了 MCP 的 agent 裸调亦可，只是少引导。

**远端 URL 场景无需专门设计**：agent 用自身 shell `git clone`，再调 `zd_*` 工具传 `projectPath` 指向 clone 目录；MCP 工具本就接收 `projectPath`（对应 CLI `--project`）。

## 3. 关键约束：stdout 纪律与进程生命周期

读现有核心发现一个硬约束，是 MCP 形态的前置依赖：

1. **stdout 污染**：MCP stdio server 只能用 stdout 走 JSON-RPC。但 `runSync`（[sync.ts:97-223](../../cli/src/commands/sync.ts#L97-L223)）和 `diagnoseCommand`（[diagnose.ts:42-245](../../cli/src/commands/diagnose.ts#L42-L245)）大量 `console.log` 到 stdout，并内联写报告文件。这些必须从核心剥离，否则破坏协议。
2. **进程退出**：`diagnoseCommand` 在 `--strict` 时 `process.exit(2)`（[diagnose.ts:243](../../cli/src/commands/diagnose.ts#L243)）。常驻 MCP server 不能被 `process.exit` 杀掉，退出码语义只属于 CLI 退出层。
3. **结构化输出缺失**：`diagnose` 的 `Finding` 接口（[diagnose.ts:17-21](../../cli/src/commands/diagnose.ts#L17-L21)）是函数内私有，未导出；MCP 需要稳定的机器可读结构。

=> **core 参数化改造（§4）是 Phase A 的前置工作**，不是免费午餐。这与 PRODUCT_OPTIMIZATION_PLAN.md §4"`--json` 稳定输出"方向一致，改造一次两边受益。

## 4. Core 参数化改造

原则：**核心函数纯逻辑，返回结构化结果；CLI/MCP 各自做呈现层。** 每个命令拆成 `runXxx(projectRoot, opts): Promise<StructuredResult>`（纯，无 console.log、无 process.exit）+ `xxxCommand`（CLI 呈现：渲染文本、写报告、process.exit）。

### 4.1 diagnose

```ts
// 新：core/report.ts（共享类型，CLI 与 MCP 共用）
export interface Finding {
  severity: 'block' | 'warn' | 'info';
  category: string;
  code: string;          // 新增：稳定 code，供 --strict 与 MCP 消费方判断
  message: string;
  location?: string;     // 新增：文件/资产 id
  remediation?: string;  // 新增：修复建议
}
export interface DiagnoseResult {
  findings: Finding[];
  summary: { blocks: number; warns: number; infos: number };
  detected: { agent: string; config: boolean; env: boolean }[];
  reportText: string;    // 现有人类可读报告（落盘用）
}

// 新：commands/diagnose.ts
export async function runDiagnose(
  projectRoot: string,
  opts: { market?: string },
): Promise<DiagnoseResult> { /* 现有逻辑，不 console.log、不 process.exit */ }

export async function diagnoseCommand(projectRoot: string, opts): Promise<void> {
  const r = await runDiagnose(projectRoot, opts);
  console.log(r.reportText);
  if (lock) await fs.writeFile(..., r.reportText);
  if (opts.strict && r.summary.blocks > 0) process.exit(2);  // 退出码只留 CLI
}
```

### 4.2 sync：plan/apply 分离（为 dryRun 铺路）

`runSync` 现有结构已天然分两段：
- **plan**（[sync.ts:157-175](../../cli/src/commands/sync.ts#L157-L175)）：`applicableAssets` + `renderAll` 算出 `Placement[]`。
- **apply**（[sync.ts:177-220](../../cli/src/commands/sync.ts#L177-L220)）：`place` + `writeManifest` + GC + `.gitignore` + 写报告。

拆分：

```ts
export interface SyncPlan {
  placements: Placement[];      // 含 skip 项
  overrides: LayerOverride[];
  gcRemoved: string[];          // 预测（apply 前计算）
  gcConflicts: string[];
  activeAgents: string[];
}
export interface SyncResult extends SyncPlan { reportPath?: string }

export async function planSync(projectRoot, opts): Promise<SyncPlan> { /* 仅 plan 段，无副作用 */ }
export async function runSync(projectRoot, opts): Promise<SyncResult> { /* plan + apply，无 console.log */ }
export async function syncCommand(...) { /* 呈现 + console.log */ }
```

`planSync` 即天然 dryRun。MCP `zd_sync({dryRun:true})` 调 `planSync`，`dryRun:false` 调 `runSync`。

### 4.3 其它命令

`treat` / `remove` / `purge` / `prescribe` / `list` / `info` / `trust` 同模式：抽 `runXxx` 返回结构化结果。`prescribe` 的候选应带 match score 与命中/排除依据（PRODUCT_OPTIMIZATION_PLAN.md §5.2）。

### 4.4 日志去向

核心函数内所有现 `console.log` 改为：
- 结构化信息进返回值（供 MCP）；
- 进度/警告走 `console.error`（stderr，不污染 stdout，CLI 用户仍可见，MCP server 也不受影响）。

## 5. MCP 工具契约

`zai-doctor mcp` 子命令启动 stdio MCP server，工具 1:1 映射 `runXxx`。所有工具接收可选 `projectPath`（默认 server 进程 cwd）。**写操作默认 `dryRun: true`**（见 §6）。

| 工具 | 入参（要点） | 返回 | 对应核心 |
|---|---|---|---|
| `zd_diagnose` | `projectPath?`, `market?` | `DiagnoseResult` | `runDiagnose` |
| `zd_list` | `projectPath?`, `type?`, `tag?` | `{ assets: [{id,type,title,tags,installed,version?}] }` | `listCommand` 抽 run |
| `zd_info` | `projectPath?`, `id`, `full?` | `{ meta, installed, hashMatch, content? }` | `infoCommand` 抽 run |
| `zd_prescribe` | `projectPath?`, `tag?` | `{ candidates: [{id,title,score,reasons[]}] }` | `runPrescribe` |
| `zd_sync` | `projectPath?`, `agent?`, `copy?`, `installedOnly?`, `dryRun?` | `SyncPlan \| SyncResult` | `planSync` / `runSync` |
| `zd_treat` | `projectPath?`, `ids?`, `agent?`, `copy?`, `to?`, `force?`, `dryRun?` | `{ installed[], placements, reportPath? }` | `runTreat` |
| `zd_trust` | `projectPath?`, `id` | `{ id, preview }` | `runTrust` |
| `zd_remove` | `projectPath?`, `id`, `agent?` | `{ placements }` | `runRemove` |
| `zd_purge` | `projectPath?`, `agent` | `{ removed[] }` | `runPurge` |

随 roadmap 补 `zd_audit` / `zd_rollback`。

工具描述（`description`）须明示副作用等级：只读 / dryRun 可预览 / 写盘，便于 agent 自觉求确认。

## 6. 对话安全契约

把 PRODUCT_OPTIMIZATION_PLAN.md §2.4"安全默认值"落成对话 UX：

1. **写前必预览**：`zd_sync` / `zd_treat` / `zd_remove` / `zd_purge` 默认 `dryRun: true`，返回 diff/placement 预览。agent 用自然语言讲给用户，得到确认后才以 `dryRun: false` apply。
2. **信任不等于运行**：MCP 资产仍走 `trust` 流程，未信任的 MCP 在 `zd_sync` 中 skip 并返回原因（复用 [sync.ts:61-69](../../cli/src/commands/sync.ts#L61-L69)）。
3. **冲突保护复用**：`place` 的"用户改过则 skip 不覆盖"（[architecture.md](../../catalog/guide/architecture.md) 图 4）原样透传到 MCP 结果，agent 据此提示用户。
4. **退出码 → 结构化**：CLI 的 `--strict` 退出码（§4.4 退出码表）在 MCP 侧变为返回值里的 `severity`/`code`，agent 自行决定是否阻塞对话。

## 7. 自注册与 dogfood

zai-doctor 自身成为一个 MCP server，注册项就是它最熟悉的格式（[mcpStore.ts](../../cli/src/core/mcpStore.ts) 的 `mcpServers`）：

```json
{ "mcpServers": { "zai-doctor": { "command": "zai-doctor", "args": ["mcp"] } } }
```

- 作为一个 market 资产（`mcp/zai-doctor.md`）发布，`treat` 安装即把它写进各 agent 的 MCP 配置，**完全 dogfood 现有 treat+trust+sync 链路**。
- 首次启用走 `trust` 展示 command/args（即 `zai-doctor mcp`），符合"安装≠信任"。

## 8. 编排薄壳（可选）

能力层就绪后，加一层 agent-specific 剧本，dogfood skill 资产类型：

- **skill 资产**：`market/skills/ai-engineer/SKILL.md`（目录资产，agent-agnostic）。剧本：用户要工程化时 -> zd_diagnose -> 讲症状 -> zd_prescribe -> 呈候选求选 -> zd_treat {dryRun} -> 讲 diff 求确认 -> zd_treat {apply} -> zd_diagnose 复诊。按各 agent 的 skill 映射同步（目前仅 claude 声明 skill 映射）；未声明的 agent 不同步 skill，其剧本可另用 AGENTS.md 受管块。
- **Codex / 其它**：AGENTS.md 受管块（同剧本，agent-agnostic 指令格式）。

此层**仅编排**，不含能力；缺失它 agent 仍可裸调 MCP 工具。

## 9. 目录结构（新增）

```
cli/src/
├── core/
│   └── report.ts            # Finding / DiagnoseResult / SyncPlan 等共享结构化类型
├── mcp/                     # 新增：MCP server
│   ├── server.ts            # stdio server 入口（zai-doctor mcp）
│   └── tools.ts             # 工具定义 → 映射 runXxx
└── commands/                # 现有：每文件抽 runXxx，命令层只做呈现
```

`cli/src/index.ts` 注册新子命令：

```ts
program.command('mcp').description('启动 MCP server（stdio），供 coding agent 对话驱动').action(() => runMcpServer());
```

依赖：`@modelcontextprotocol/sdk`（轻量，仅 server 端）。

## 10. 分期

- **Phase A1（前置+只读，~1 周）**
  - §4 core 参数化：先做 `runDiagnose` + `runList` + `runInfo` + `runPrescribe`，剥离 console.log/process.exit。
  - `zai-doctor mcp` + 只读工具：`zd_diagnose` / `zd_list` / `zd_info` / `zd_prescribe`。
  - 验收：Claude Code 里"对话式诊断 + 开方"闭环；stdout 无非 JSON-RPC 污染。
- **Phase A2（写操作 + dryRun，~1-2 周）**
  - §4.2 `planSync`/`runSync` 分离；`runTreat`/`runRemove`/`runPurge`/`runTrust`。
  - 写工具全走 §6 dryRun→确认→apply 契约。
  - 验收：对话式"下药"全程写前预览；冲突/信任 skip 原因透传到对话。
- **Phase B（编排薄壳，~3 天）**
  - `market/skills/ai-engineer.md` + AGENTS.md 受管块；§7 `mcp/zai-doctor.md` 自注册资产；dogfood `treat` 自安装。
- **随 roadmap**：`zd_audit` / `zd_rollback` 等核心能力上线后同步暴露。

## 11. 风险与开放问题

1. **大报告与上下文**：`zd_diagnose`/`zd_sync` 结果可能较大。对策：工具返回摘要 + `reportPath`，agent 按需读文件全文；避免一次性灌入超大 JSON。
2. **`projectPath` 越权**：MCP server 默认 cwd，但 `projectPath` 可指向任意路径。对策：默认限制为 cwd 子树，越界需 server 启动参数显式授权 `--allow-root`（呼应 §2.4 安全默认）。
3. **dryRun 与 apply 间的状态漂移**：dryRun 预览后、apply 前项目可能被改。对策：apply 仍走 `place` 的 hash/冲突保护，不假设 dryRun 结果仍有效。
4. **多 agent 并发写**：同一项目多个 agent 同时调 `zd_sync`。对策：lockfile/manifest 写入走原子 rename（现有 `writeMcpJson` 已是 tmp+rename，[mcpStore.ts:36-41](../../cli/src/core/mcpStore.ts#L36-L41)），需补 manifest 同模式。
5. **SDK 依赖体积**：`@modelcontextprotocol/sdk` 进 dependencies 会增大 CLI 包。对策：评估是否拆 `zai-doctor-mcp` 独立包，或动态 import 仅 `mcp` 子命令时加载。
6. **编排薄壳的 agent 覆盖**：skill 不绑 agent，按各 agent skill 映射同步（目前仅 claude 声明）；未声明 skill 映射的 agent 不同步 skill，剧本可另用 AGENTS.md/原生规则。

## 12. 完成定义（Phase A）

1. `zai-doctor mcp` 启动 stdio server，Claude Code 配置后可调用全部 `zd_*` 工具。
2. core 层无 `console.log`（stdout）/`process.exit`；CLI 与 MCP 共享 `runXxx` + 结构化类型。
3. 写工具默认 dryRun，apply 前需显式确认；冲突/信任/不兼容原因结构化返回。
4. 远端 URL：agent `git clone` 后传 `projectPath` 即可走全流程，无需 zai-doctor 侧特化。
5. zai-doctor 自身作为 MCP 资产可被 `treat` 安装到各 agent（dogfood）。
6. 测试：core 参数化有回归测试；MCP 工具契约有 golden fixture（入参→结构化出参）；stdout 纯净度有断言。
