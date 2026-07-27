# zt-ai-doctor 实施计划

> 个人、agent-agnostic 的 coding-agent 工程化工具。前端优先，不绑 Claude。
> 本文档是 `/grill-me` 会话收敛后的落地计划。

---

## 1. 定位

一个 CLI 工具 + 一个版本化的资产 market，解决三件事：

1. **统一来源**：项目里用 `.agents/` 存 agent-agnostic 的 canonical 资产（rules/skills/mcp）
2. **同步转化**：一条命令把 `.agents/` 渲染成各 coding agent（Claude Code / Cursor / Copilot / Codex / Cline…）能读的原生配置
3. **诊断 + 推荐**：检查项目 agent 配置工程化是否到位；按技术栈推荐资产，人工挑选安装

不是知识库，是开发工具。个人积累、可跨公司迁移（baseline + 个人 curation 进 market，公司规则本地 overlay 不进 market）。

---

## 2. 仓库结构（工具本身）

```
zt-ai-doctor/
├── cli/                        # CLI 包（Node + TS）
│   ├── src/
│   │   ├── commands/           # init / install / sync / diagnose / detect / update
│   │   ├── renderers/          # 每个 agent 一个 renderer：claude.ts, cursor.ts, copilot.ts ...
│   │   ├── core/               # 层级合并、lockfile、placement 引擎
│   │   └── index.ts
│   └── package.json            # bin: { "zai-doctor": ./dist/index.js }
├── market/                     # canonical 资产（发布为 npm 包，catalog 从此构建）
│   ├── rules/
│   ├── skills/
│   ├── mcp/
│   └── manifest.json           # 单版本号 + 资产索引
├── catalog/                    # 静态站生成器（Astro/VitePress）
├── docs/
│   └── IMPLEMENTATION_PLAN.md  # 本文件
└── package.json                # monorepo（pnpm workspace）
```

- CLI bin 名 `zai-doctor`（建议 shell alias `zd=zai-doctor`）。
- MVP 阶段 market 和 CLI 同仓库，后续可拆。

---

## 3. 核心数据模型

### 3.1 项目内 `.agents/` 结构

```
<project>/.agents/
├── rules/           # canonical 源：每条规则一个 .md（frontmatter + id）← 在这里改
├── skills/          # Claude skill（Claude-only，文档标清）
├── mcp/             # MCP 配置资产（JSON body）
├── company/         # 公司 overlay（gitignored，不进 market）
├── README.md        # sync 聚合生成（rules 合并的统一来源/文档，gitignored，勿手改）
├── .build/          # sync 生成的 per-agent 产物（gitignored）
└── zai.lock.json    # 锁定的 market 版本 + 已装资产 + hash（提交）
```

### 3.2 资产 schema（frontmatter）

rule / skill（markdown）：

```yaml
---
id: react-ts-cursor-rules          # 稳定 id，per-rule 替换靠它对齐
type: rule                          # rule | skill | mcp | prompt
title: React + TS 项目 Cursor 规则
description: 约束 React/TS 代码风格与组件结构
tags: [react, ts, frontend]         # catalog 筛选 + detect 推荐
stack:                              # detect 用的信号匹配
  deps: [react, typescript]
  files: [tsconfig.json]
agents: [claude, cursor]            # 可渲染到的 agent；缺省=全部
layer: baseline                     # baseline | personal（curation 标记）
priority: 100                       # 同 id 同层内的排序
---
<agent-agnostic 的正文，渲染时由 renderer 套壳/转化>
```

mcp（json + sidecar 元数据，或 frontmatter + JSON body）：

```yaml
---
id: mcp-filesystem
type: mcp
title: Filesystem MCP
agents: [claude, cursor, copilot]
tags: [core]
---
{ "command": "npx", "args": ["-y","@modelcontextprotocol/server-filesystem","."] }
```

### 3.3 分层模型（per-rule 替换）

| 层 | 位置 | 进 market？ | 可迁移？ |
|---|---|---|---|
| baseline | `market/` | 是 | 是 |
| personal（curation） | `market/`（`layer: personal` + 你的筛选/排序） | 是 | 是 |
| company overlay | `<project>/.agents/company/`（gitignored） | 否 | 否 |

合并规则：**同 id，高优先级层整体替换低优先级层**。优先级 `company > personal > baseline`。同层同 id 冲突按 `priority` 取大者。合并产出 id -> asset 映射，再进 renderer。

---

## 4. sync 转换流程（核心技术）

### 4.1 管线

```
resolve layers (company > personal > baseline, by id)
        │
        ▼
merged asset set (id -> asset)
        │
        ▼
for each installed agent renderer:
   for each asset:
      if renderer.supports(type):
         transform(asset) -> .agents/.build/<agent>/<type>/<file>   # 构建产物
         placement = symlink(agentConfigPath -> buildArtifact)
      else:
         placement = skip(reason)                                   # 如 skill -> cursor
        │
        ▼
execute placements: try symlink; EPERM/Windows 无权限 -> 降级 copy
        │
        ▼
write placement 报告（.agents/.build/sync-report.md）
```

关键：**软链指向「构建产物」，不是 canonical 原文件**。因为各 agent 格式不兼容（Cursor `.mdc` 要 frontmatter、MCP 是 per-agent JSON），纯软链裸文件激活不了。转化产物才是软链目标。canonical 改了 -> 重跑 sync -> 产物更新 -> 软链自动指向新内容。

### 4.2 Renderer 接口

```ts
type AssetType = 'rule' | 'skill' | 'mcp' | 'prompt';
type Action = 'symlink' | 'copy' | 'skip';

interface Placement {
  assetId: string;
  agent: string;
  targetPath: string;       // 项目内 agent 配置路径，如 .cursor/rules/foo.mdc
  sourcePath: string;       // 构建产物路径（symlink 目标）
  action: Action;
  reason?: string;          // skip 原因
}

interface AgentRenderer {
  name: string;                          // 'claude' | 'cursor' | ...
  supports: AssetType[];                 // 该 agent 能消费的类型
  detect: (projectRoot: string) => boolean;   // 项目是否用此 agent（找 .cursor/ 等）
  render: (asset: Asset, projectRoot: string) => Placement[];
}
```

不同 agent 渲染策略不同，接口都能容纳：
- **Claude**：所有 rule 聚合成 `.agents/README.md`（统一来源/文档），项目根 `CLAUDE.md` 软链到它；skill 直接落到 `.claude/skills/`；MCP 写 `.mcp.json`
- **Cursor**：每条 rule -> `.cursor/rules/<id>.mdc`（套 frontmatter `description`/`globs`）；skill = skip；MCP 写 Cursor mcp 配置
- **Copilot**：rule -> `.github/copilot-instructions.md`（合并）；skill = skip；MCP -> `.vscode/mcp.json`

### 4.3 软链优先 / copy 降级

```ts
try {
  fs.symlinkSync(sourcePath, targetPath, type);   // Windows 需 type: 'file'|'dir'|'junction'
} catch (e) {
  if (e.code === 'EPERM' || e.code === 'EEXIST') {
    fs.copyFileSync(sourcePath, targetPath);      // 降级 copy
    placement.action = 'copy';
  } else throw e;
}
```

注意：Windows 上 symlink 需要开发者模式或管理员权限，所以降级路径是默认会走的，必须测。`junction` 对目录可用且不需要管理员，可优先用于目录场景。

### 4.4 placement 报告

每次 sync 输出 `.agents/.build/sync-report.md`，并在终端打印摘要：

```
✓ react-ts-cursor-rules  -> .cursor/rules/react-ts-cursor-rules.mdc  (symlink)
✓ mcp-filesystem         -> .mcp.json                                  (copy)
⤳ skill-frontend-review  -> [cursor] skip: skill not supported
✗ react-ts-cursor-rules  -> [copilot] fail: permission (fell back to copy)
```

静默跳过 = 坑，必须显式上报。

---

## 5. CLI 命令（zai-doctor）

bin 名 `zai-doctor`（建议 shell alias `zd=zai-doctor`）。整个流程按医生看诊走：**建档 -> 诊断 -> 开方 -> 下药 -> 复诊**，对症下药。

术语对照：资产=药，market=药典，配置缺失/失效=症状，推荐列表=处方。

| 命令 | 隐喻 | 作用 | 读写 | MVP |
|---|---|---|---|---|
| `zai-doctor init` | 建档 | 建 `.agents/` + 空 lockfile | 写 | ✓ |
| `zai-doctor diagnose` | 诊断 | 查 agent 配置有无 + 校验已引入资产 + 环境一致性，出症状报告 | 读 | ✓ |
| `zai-doctor prescribe` | 开方 | 先诊断再读技术栈 -> 出处方（推荐资产 + 标签筛选），人工挑 | 读 | ✓ |
| `zai-doctor treat [ids...]` | 下药 | 装处方/指定资产 + sync 渲染软链 + placement 报告 | 写 | ✓ |
| `zai-doctor override <id>` | 覆盖 | 从药典拷资产到 .agents/company/ 作 company 覆盖起点 | 写 | ✓ |
| `zai-doctor sync [--agent <name>]` | 换药 | 仅重新渲染软链（不装新资产） | 写 | ✓ |
| `zai-doctor update` | 药典更新 | 拉 market 最新版本，更新 lockfile | 写 | ✓ |
| `zai-doctor list` | 查药典 | 列出所有资产 + 已装状态（--type/--tag 筛选） | 读 | ✓ |
| `zai-doctor info <id>` | 查药典 | 看资产详情 + 已装状态 + hash 一致性 | 读 | ✓ |
| `zai-doctor search <tag>` | 查药典 | 全文/标签搜（catalog 站，Phase 6） | 读 | ✗ 用 web |

### 看诊流程（对症下药）

```
init        建档：建 .agents/
  │
diagnose    诊断：症状报告（缺哪些 agent 配置 / 资产失效 / 环境不一致）
  │
prescribe   开方：症状 + 技术栈 -> 推荐资产处方单（.agents/.build/prescription.md）
  │           人工在处方单上删减挑选
  │
treat       下药：抓处方资产 + sync 渲染软链 -> agent 配置就位 + placement 报告
  │
diagnose    复诊：再跑诊断，症状应消除
```

要点：
- `prescribe` 内部先跑诊断，所以 `diagnose` 单独用于纯体检。
- `treat` 不带参数 = 按当前处方单抓药；`treat <id>` 直接抓指定药。
- `install` 与 `detect` 已折进 `treat` 与 `prescribe`，不单列。
- 不自动装、不自动映射，只开方推荐 + 人工挑。

---

## 6. market 机制

- **版本**：`market/manifest.json` 单版本号（语义化，如 `1.2.0`）。每次内容变更 bump。
- **lockfile**：`<project>/.agents/zai.lock.json` 锁 market 版本 + 已装资产 id + 内容 hash。`zai-doctor sync` 校验 lockfile；`zai-doctor update` 更新。
- **分发**：market 作为 npm 包发布（如 `@zt/ai-doctor-market`），`zai-doctor treat` 从本地 node_modules / 缓存读，**离线可用**。CLI 包依赖或动态拉取 market 包。
- **catalog 静态站**：build 步骤扫 `market/` + frontmatter -> Astro/VitePress 站，部署 GitHub Pages。纯展示，无后端、无回传。

---

## 7. 技术选型

| 项 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript | 前端方向原生；CLI 生态成熟 |
| 运行时 | Node.js 20+ | 跨平台，symlink API 齐全 |
| CLI 框架 | `commander` | 轻量够用 |
| frontmatter | `gray-matter` | 标准 |
| 文件匹配 | `fast-glob` | 快 |
| 包管理 | pnpm workspace | 前端主流；monorepo 友好 |
| catalog 站 | Astro | 静态、内容导向、MDX |
| 测试 | vitest | 前端栈一致 |

---

## 8. MVP 任务拆解

**MVP（个人可用）= Phase 0–5。catalog 与多 agent 扩展其后。**

### Phase 0 — 资产模型 + 最小 market（1–2 天）
- [ ] 定 frontmatter schema，写 3–5 条真实资产（1 条 React+TS rule、1 个 skill、1 个 mcp）
- [ ] `market/manifest.json` 版本号
- [ ] `.agents/` 目录约定文档

### Phase 1 — CLI 骨架 + install（2–3 天）
- [x] `zai-doctor init` 建 `.agents/` + 空 lockfile（含 .agents/.gitignore）
- [x] `zai-doctor treat <id>` install 部分（装资产到 `.agents/`，写 lockfile；sync 见 Phase 2）
- [x] `zai-doctor update` 拉 market 新版本（MVP：刷新 lockfile 药典版本）

### Phase 2 — sync 引擎（3–5 天，核心）
- [x] 层级合并（先只 baseline，company/personal 留 Phase 3）
- [x] Claude renderer（rule 聚合成 `.agents/README.md`、`CLAUDE.md` 软链、skill、`.mcp.json`）
- [x] Cursor renderer（rule -> `.mdc` + frontmatter、mcp、skill=skip）
- [x] 软链优先 / copy 降级（Windows 必测）- 验证：开发者模式下 symlink 生效，copy 降级路径已实现
- [x] placement 报告
- [x] `treat` 串起 install + sync（含 placement 报告）

### Phase 3 — 分层覆盖（1–2 天）
- [x] company overlay（`.agents/company/`，gitignored）+ `override <id>` 命令建覆盖起点
- [x] personal 层（market 内 `layer: personal`，与 baseline 共存于 .agents/<type>/）
- [x] per-rule 替换 by id + priority（resolveAssets：company > personal > baseline）

### Phase 4 — diagnose（2 天）
- [ ] 检查各 agent 配置是否存在
- [ ] 校验已引入资产（schema、引用完整性）
- [ ] 环境一致性（Node 版本 / 包管理器 / agent 版本）——先做最小集

### Phase 5 — prescribe 开方（2 天）
- [ ] 技术栈信号扫描（deps / config files）
- [ ] stack 信号匹配 -> 推荐列表 + 标签筛选
- [ ] 处方单生成（`.agents/.build/prescription.md`），供 `treat` 读取

### Phase 6 — catalog 静态站（2–3 天）
- [ ] build 扫 `market/` -> Astro 站
- [ ] GitHub Pages 部署

### Phase 7 — 多 agent 扩展（按需）
- [ ] Copilot / Codex / Cline / Windsurf renderer
- [ ] 覆盖矩阵文档化（哪些类型在哪些 agent 不可达）

---

## 9. 已知风险 / 待验证

1. **Windows symlink**：默认会走 copy 降级；junction 用于目录可规避部分权限问题。需实测各 agent 是否跟随 symlink 读配置（Cursor 对 symlinked `.mdc` 行为待验证）。
2. **agent 是否跟随 symlink**：若某 agent 拒绝读 symlink 文件，该 agent 强制走 copy（renderer 声明 `forceCopy: true`）。
3. **覆盖矩阵有洞**：skill 在非 Claude agent 不可达，placement 报告必须显式 skip。
4. **分发方式**：market 走 npm 包是首选，但「个人 market 是否值得发 npm」可议；备选 = git submodule / 指定 commit sha 拉取。MVP 先 npm，不通再切。
5. **README.md / CLAUDE.md 是生成物**：rules 聚合成 `.agents/README.md`，项目根 `CLAUDE.md` 软链到它。拼接策略：按 priority 排序 + 分隔符。用户手改 `CLAUDE.md` 会被 sync 覆盖——改 canonical `rules/*.md`。

---

## 10. 下一步

1. 确认本计划 → `git init` + 起 pnpm workspace 骨架
2. 跑 Phase 0：先把 3–5 条真实资产和 schema 落地（这步定了，后面全顺）
3. Phase 2 sync 引擎是技术核心，优先攻
