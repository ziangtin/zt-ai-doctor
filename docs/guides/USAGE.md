# zai-doctor 使用文档

agent-agnostic 的 coding-agent 工程化工具。像医生一样：**建档 -> 诊断 -> 开方 -> 下药 -> 复诊**，对症下药。

面向 Claude / Cursor / Copilot / Codex / Cline / Windsurf / Trae / Lingma，不绑死某一家。

---

## 1. 接入

### 前置
- Node.js 20+
- pnpm 10+

### 方式一：本地开发（当前推荐）
```bash
git clone https://github.com/ziangtin/zt-ai-doctor.git
cd zt-ai-doctor
pnpm install
# 用 dev 模式直接跑（tsx 实时编译）
pnpm --filter zai-doctor dev -- <command>
# 例：在当前项目建档
pnpm --filter zai-doctor dev -- init
```

### 方式二：全局链接
```bash
cd zt-ai-doctor/cli
pnpm install
pnpm build
pnpm link --global
# 之后全局可用
zai-doctor --version
zai-doctor init
```

### 方式三：npx（npm 发布后）
```bash
npx zai-doctor <command>
```
> 当前未发布 npm，用方式一/二。

### alias（建议）
```bash
alias zd=zai-doctor
```

### 验证
```bash
zai-doctor --version   # 0.1.0
zai-doctor --help      # 命令列表
```

---

## 2. 核心概念

### `.agents/` 目录
项目内 `.agents/` 存 agent-agnostic 的 canonical 资产：
```
.agents/
├── rules/           # 规则资产（.md：frontmatter + 正文）← 在这里改；本地覆盖用 <id>.override.md
│   └── README.md    # 规范模块索引（自动生成，见「目录索引 README」）
├── skills/          # skill 资产（Claude 专用）
│   └── README.md    # 技能模块索引（自动生成，见「目录索引 README」）
├── prompts/         # prompt 资产
├── .build/          # sync 生成物（gitignored）
│   ├── placements.json     # 受管记录（重同步 + GC 用）
│   ├── sync-report.md      # sync 报告
│   ├── prescription.md     # 处方单
│   ├── diagnose-report.md  # 诊断报告
│   └── detect-report.md    # 环境探测报告
├── mcp.json         # MCP 单文件源（{mcpServers:{id:body}}），treat 写入、trust 过滤、sync 渲染
├── agents.json      # agent 映射/探测覆盖（可选，覆盖内置 cli/market/agents.json）
├── zai-doctor.lock.json  # 锁文件（提交：market 版本 + 已装资产 + hash + 装时 version）
└── .gitignore
```

### 资产 frontmatter
```yaml
---
id: react-ts                    # 稳定 id，正则 ^[a-z0-9][a-z0-9._-]*$
type: rule                      # rule | skill | mcp | prompt
icon: 💻                        # 索引 README heading emoji（可选，缺省 rules 📋 / skills 🧩）
title: React + TypeScript 规则
description: 约束 React/TS 代码风格
tags: [react, ts, frontend]     # catalog 筛选 + prescribe 推荐
agents: [claude, cursor]        # 可渲染的 agent；缺省=全部
layer: baseline                 # baseline | personal | company
priority: 100                   # 同 id 同层内排序，大者胜
version: 1.0.0                  # 资产版本（semver），滞后检测与回退用；缺省 0.0.0
stack:                          # prescribe 技术栈匹配信号
  deps: [react, typescript]
  files: [tsconfig.json]
---
<agent-agnostic 的正文，渲染时由 renderer 转化>
```

MCP 资产的 body 是 JSON：
```yaml
---
id: mcp-filesystem
type: mcp
agents: [claude, cursor, copilot]
---
{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem@1.0.0", "."] }
```

### 分层覆盖
| 层 | 位置 | 进工具 market？ | 说明 |
|---|---|---|---|
| baseline | `cli/market/` | 是 | 默认资产 |
| personal | `cli/market/`（`layer: personal`） | 是 | 个人 curation |
| company | `.agents/<type>/<id>.override.md`（`layer: company`，提交到项目） | 否 | 项目级覆盖（`override <id>` 建起点） |

> company 层是**项目级覆盖**：用 `zai-doctor override <id>` 从药典拷一个 `.override.md` 到对应类型目录（frontmatter 标 `layer: company`），提交到项目 git，sync 时按 id 覆盖 baseline。**工具 market 的发布只在工具包 `cli/market/` 进行**，项目里的 override 不会发布到工具 market。

合并规则：**同 id，高优先级层整体替换低优先级层**（`company > personal > baseline`）；同层同 id 按 `priority` 取大。

### renderer 与 agent 配置目标
sync 把 canonical 资产渲染成各 agent 原生配置（软链优先，降级 copy）。目标路径 / 聚合 / action 全部由 `cli/market/agents.json` 配置驱动（项目可在 `.agents/agents.json` 覆盖或新增 agent，见 [AGENTS_CONFIG.md](./AGENTS_CONFIG.md)）：
- Claude：`.claude/rules/<id>.md` + `.claude/skills/<id>/SKILL.md` + `.mcp.json`
- Cursor：`.cursor/rules/<id>.mdc` + `.cursor/mcp.json`
- Copilot：`.github/copilot-instructions.md` + `.vscode/mcp.json`
- Codex：`AGENTS.md`
- Cline：`.clinerules/<id>.md`
- Windsurf：`.windsurfrules`
- Trae：`.trae/rules/<id>.md` + `.trae/mcp.json`
- Lingma：`.qoder/rules/<id>.md`（MCP 走 IDE 设置 UI，不自动写）

完整类型覆盖矩阵见 [COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md)。

### 两种 agent 探测
- **配置探测**：项目里有没有给某 agent 建过配置（看 `markers` 标记文件，如 `.claude`/`CLAUDE.md`）。`sync` 不带 `--agent` 时按此自动选择渲染目标。
- **环境探测**：机器上是否真装了某 agent（查 PATH / 全局配置目录 / Windows 注册表，见 `detect` 命令）。两者独立--配置可预生成在环境未装时。

---

## 3. 使用流程（看诊）

### ① 建档 `init`
```bash
zai-doctor init                    # 在当前项目建 .agents/ + lockfile
zai-doctor init --project ./my-app # 指定项目根
```

### ② 诊断 `diagnose`
```bash
zai-doctor diagnose            # 体检：建档/资产健康/药典新鲜度/agent 探测(配置+环境)/环境
zai-doctor diagnose --strict   # 发现阻塞症状返回非零（CI 用）
```

### ②.5 环境探测 `detect`
```bash
zai-doctor detect              # 查机器上实际装了哪些 agent（PATH / 全局配置目录 / Windows 注册表）
zai-doctor detect --verbose    # 显示命中信号
zai-doctor detect --json       # 机器可读 JSON
```
区别于 `diagnose` 的配置探测（项目里有没有建过 agent 配置），`detect` 查的是环境是否真装了 agent 本体。已建档时落盘 `.agents/.build/detect-report.md`。

### ③ 开方 `prescribe`
```bash
zai-doctor prescribe                  # 扫技术栈 + 匹配 -> 处方单
zai-doctor prescribe --tag frontend   # 按标签筛选
```
扫项目 `package.json` 依赖 + config files，匹配药典资产 `stack`，生成 `.agents/.build/prescription.md`：
- **推荐区**：置信度 高/中 + 信号 + 原因，默认勾选 `[x]`
- **可选区**：无 stack/无匹配资产，含 MCP command/args + 未信任/未固定版本警告
- 编辑勾选后 `treat` 抓药

### ④ 下药 `treat`
```bash
zai-doctor treat react-ts mcp-filesystem  # 装指定资产 + sync
zai-doctor treat                           # 不带 id：按处方单勾选抓药
zai-doctor treat react-ts --to 1.0.0       # 装指定版本（回退到旧版本）
```
从药典拷资产到 `.agents/<type>/`，更新 lockfile（含装时 version），sync 渲染到 agent 配置。
不带 `--to` 装最新版本；`--to <ver>` 装指定版本，可用于**回退**（装新版后 `treat <id> --to <旧版>` 覆盖）。多版本结构见 [MARKET.md](./MARKET.md)。
> `treat` 后自动刷新 `.agents/rules/README.md`、`.agents/skills/README.md` 模块索引（见 [目录索引 README](#目录索引-readme)）。

### ⑤ 换药 `sync`
```bash
zai-doctor sync                       # 渲染到所有配置探测到的 agent
zai-doctor sync --agent claude        # 指定单个 agent
zai-doctor sync --agent claude,cursor # 逗号多选
zai-doctor sync --copy                # 强制 copy（不用软链，无软链权限环境用）
zai-doctor sync --installed-only      # 仅同步环境探测已安装的 agent（默认关，允许预生成配置）
zai-doctor sync --no-gitignore        # 不自动写 .gitignore（默认写）
```
软链优先，权限不足降级 copy（受管，改 canonical 后重跑 sync 会更新）；用户改过的目标文件不覆盖（conflict skip）。

**自动 .gitignore**：sync 默认把生成的 agent 配置产物写入项目 `.gitignore` 的受管段（`# >>> zai-doctor sync 产物 >>>` … `# <<< zai-doctor sync 产物 <<<`），段外内容不动。粒度按 `agents.json` 的 mapping 推导：含 `{id}` 的目录型忽略整个受管子目录（如 `.claude/rules/`、`.clinerules/`），聚合单文件型忽略具体文件（如 `.mcp.json`、`AGENTS.md`、`.github/copilot-instructions.md`）--**只精确到受管子目录/文件，不会忽略 `.claude/`、`.github/` 等整目录**。以 sync 后的 manifest 为准，`--agent` 部分同步不会冲掉其他 agent 的条目。`treat`/`remove` 内部触发 sync 时同样维护。加 `--no-gitignore` 可跳过。

### ⑥ 复诊 `diagnose`
```bash
zai-doctor diagnose  # 再跑诊断，症状应消除
```

### ⑦ 移除 `remove`
```bash
zai-doctor remove react-ts  # 删 .agents 资产 + lockfile + sync GC 清理 agent 配置
```
company override 文件不动（手动删 `.agents/<type>/<id>.override.md`）。
> `remove` 后同步刷新目录索引 README。

---

## 4. 命令详解

| 命令 | 作用 | 常用选项 |
|---|---|---|
| `init` | 建档：建 `.agents/` + lockfile | `--market`, `--project` |
| `list` | 列药典资产 + 已装状态 | `--type`, `--tag` |
| `info <id>` | 看资产详情 + hash 一致性 | `--full`（显示正文） |
| `diagnose` | 诊断：agent 探测(配置+环境)/资产/药典 | `--strict` |
| `detect` | 环境探测：机器实际装了哪些 agent | `--json`, `--verbose` |
| `prescribe` | 开方：技术栈匹配 + 处方单 | `--tag` |
| `treat [ids...]` | 下药：装资产 + sync | `--agent`(多选), `--copy`, `--to <ver>` |
| `override <id>` | company 覆盖起点 | - |
| `remove <id>` | 移除资产 + GC | `--agent`(多选), `--copy` |
| `sync` | 换药：渲染到 agent 配置 | `--agent`(多选), `--copy`, `--installed-only`, `--no-gitignore` |
| `update` | 药典更新：刷新 lockfile | `--source <git-url>`, `--ref` |
| `trust <id>` | 信任 MCP | - |

**通用选项**：
- `--market <path>`：药典路径（默认包内 `cli/market`，或 `$ZAI_MARKET_PATH`）
- `--project <path>`：项目根（默认 cwd）

**退出码**：`0` 成功 ｜ `1` 运行/同步失败 ｜ `2` 参数/schema/配置错误

---

## 5. 资产管理

### 添加资产到药典
1. 在 `cli/market/<type>/` 建 `.md`（frontmatter + 正文，frontmatter 带 `version`）
2. 在 `cli/market/manifest.json` 加索引：`{ "id": "...", "type": "...", "versions": [{ "version": "1.0.0", "path": "<type>/<file>.md" }] }`
3. 验证：`zai-doctor list`

> 多版本结构（同 id 多版本 + 回退）见 [MARKET.md](./MARKET.md)。manifest 也兼容旧单 path 格式（`{ "id", "type", "path" }`）。

### company override
```bash
zai-doctor override react-ts   # 从药典拷到 .agents/rules/react-ts.override.md（layer: company）
# 编辑该 override 副本（公司/项目专属规则，提交到项目 git）
zai-doctor sync                # company 覆盖 baseline（同 id）
```

### 目录索引 README
`.agents/rules/README.md` 与 `.agents/skills/README.md` 是自动生成的模块索引，`init`/`treat`/`remove` 后刷新：
- **rules**：每个已装资产一项，`### {icon} [标题](./<id>.md)` + 2~4 个 `##` 章节作为列表项（封顶 4）
- **skills**：表格形式，列 `技能 | 功能描述 | 配套规范 | 适用应用`；配套规范取 skill frontmatter `rules: [<rule-id>...]` 渲染为链接
- heading emoji 取 frontmatter `icon`，缺省 rules 📋 / skills 🧩；按 `priority` 降序排序
- `README.md`、`*.override.md`、无 frontmatter 的 `.md` 不入索引，也不会被当资产
- 用 `<!-- zai:index-begin -->` / `<!-- zai:index-end -->` 标记段保护：**标记段外的自定义前言/尾注不会被覆盖**；skills README 带 `name`/`description` frontmatter
- **镜像到 agent 配置**：`sync` 时这两份 README 还会镜像到各 agent 的 rules/skills 目录（仅非聚合 mapping 才有目录），如 `.claude/rules/README.md`、`.claude/skills/README.md`、`.cursor/rules/README.md`、`.clinerules/README.md`；聚合型 agent（codex/windsurfrules/copilot 单文件）无目录则跳过

### MCP 信任
`treat <mcp-id>` 时自动信任，`sync` 直接写入 MCP 配置，无需先 `trust`。`trust` 命令保留为可选的显式审查（展示将执行的 command/args + 未固定版本警告）：
```bash
zai-doctor treat mcp-filesystem   # 自动信任，sync 即写 .mcp.json
zai-doctor trust mcp-filesystem   # 可选：查看 command/args + 版本固定提示
zai-doctor sync                   # 写入 MCP 配置
```
信任闸门仍在：手动从 `zai-doctor.lock.json` 的 `trustedMcp` 移除某 id 即可阻断其写入（`remove <mcp-id>` 会自动移除）。

### 药典更新
```bash
zai-doctor update                       # 刷新本地药典版本 + integrity
zai-doctor update --source <git-url>    # 从 git 拉取药典到缓存
zai-doctor update --source <git-url> --ref <branch>
```

---

## 6. catalog 静态站
药典资产的可浏览静态站：**https://ziangtin.github.io/zt-ai-doctor/**

- 首页：资产卡片 + 客户端 type/tag 筛选
- 详情页：元数据 + 正文渲染 + MCP body 预览

本地预览：
```bash
pnpm --filter catalog dev      # 本地预览
pnpm --filter catalog build    # 生成 catalog/dist
```
push main（`cli/market` 或 `catalog` 改动）自动重新部署。

---

## 7. 典型场景

### 场景 1：新项目接入
```bash
cd my-project
zai-doctor init
zai-doctor prescribe           # 看推荐
# 编辑 .agents/.build/prescription.md 勾选想要的
zai-doctor treat               # 抓药 + sync
zai-doctor diagnose            # 复诊
```

### 场景 2：改了 canonical 资产后更新
```bash
# 改 .agents/rules/react-ts.md
zai-doctor sync                # 重跑 sync，agent 配置更新
```

### 场景 3：加新 agent
```bash
# 方式 A：内置已支持的 agent，直接 sync
zai-doctor sync --agent cursor          # 渲染到 cursor（支持逗号多选）

# 方式 B：全新 agent，纯配置即可（见 AGENTS_CONFIG.md）
# 在 .agents/agents.json 加一段 agents.myagent {...}
zai-doctor sync --agent myagent
zai-doctor detect                       # 顺带探测它是否真装了
```

### 场景 4：公司规则覆盖
```bash
zai-doctor override react-ts   # 建 company 覆盖起点（.agents/rules/react-ts.override.md）
# 编辑该 override 文件（公司/项目规则，提交到项目 git）
zai-doctor sync                # company 胜出，.claude/rules/cursor 用公司规则
```

### 场景 5：Windows 无软链权限
```bash
zai-doctor sync --copy         # 强制 copy，受管可重同步
```

---

## 8. 配置

- **`ZAI_MARKET_PATH`**：环境变量，指定药典路径（覆盖默认包内 market）
- **`cli/market/agents.json`**：内置 agent 映射/探测配置（随包发布）
- **`.agents/agents.json`**：项目级覆盖（深合并覆盖内置；可新增 agent，见 [AGENTS_CONFIG.md](./AGENTS_CONFIG.md)）
- **`.agents/zai-doctor.lock.json`**：锁文件，提交到 git（记录 market 版本 + 已装资产 + 完整 SHA-256 + 装时 version）
- **`.agents/.build/`**：生成物，gitignored

设计见 [../design/IMPLEMENTATION_PLAN.md](../design/IMPLEMENTATION_PLAN.md)，当前方案评审见 [../design/CURRENT_SOLUTION_REVIEW.md](../design/CURRENT_SOLUTION_REVIEW.md)。
