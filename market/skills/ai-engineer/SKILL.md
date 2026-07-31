---
id: ai-engineer
type: skill
icon: 🩺
title: AI 工程化看诊
description: 对话式驱动 zai-doctor 把项目 AI 工程化：建档->诊断->开方->下药->复诊。
tags: [workflow, setup, engineering]
layer: baseline
priority: 50
version: 1.0.0
---

# AI 工程化看诊 Skill

> 本 skill 是 zai-doctor 的"对话外壳"：用自然语言带用户走完看诊流程，zai-doctor 在背后干脏活。
> sync 按各 agent 的 skill 映射规则软链到对应目录；agent 能否识别目录下的 skill 由 agent 自身决定，zai-doctor 不关心。

## 触发

当用户请求以下意图之一时启用：
- "把这个项目 AI 工程化 / 配 coding agent / 建规"
- "诊断一下这个项目的 agent 配置"
- 丢一个 git URL 让zai-doctor 像医生看诊：**建档 -> 诊断 -> 开方 -> 下药 -> 复诊**，对症下药。你的职责是把每一步的机器报告**翻译成自然语言**讲给用户，在**写盘前求确认**，循环到症状消除。不要让用户记命令。
你"弄一下 agent / rules / mcp"

## 心智模型


---

## 前置：确保 zai-doctor 可用

本 skill 目录下 `scripts/ensure-zai-doctor.sh` 负责探测/获取 zai-doctor CLI（幂等）。若未知仓库地址，先问用户："你们内部 zai-doctor 的 GitLab 仓库地址是？"

```sh
export ZAI_REPO_URL="<内部 GitLab zai-doctor 仓库地址>"
ZAI_BIN=$(bash scripts/ensure-zai-doctor.sh)   # 脚本位于本 skill 目录的 scripts/
# 之后所有命令用 $ZAI_BIN 跑
```

脚本逻辑：PATH 有用 PATH；缓存 `~/.zai-doctor` 在用缓存；都没有才 `git clone` + `npm ci && npm run build`（首次几十秒）。
- 认证依赖宿主机已配的 git 凭据（SSH key / credential helper），脚本里不出现 token。
- build 失败时告诉用户：内部 GitLab 不可达 / Node 缺失 / main 构建失败，可锁 tag 重试（改脚本里 `git clone` 加 `--branch v0.1.0`）。
- 升级：`(cd ~/.zai-doctor && git pull && npm ci && npm run build)`

之后所有命令用 `$ZAI_BIN` 跑。操作非当前目录的项目时加 `--project <path>`，或先 `cd` 进去。

---

## 看诊剧本

### 步骤 1：建档

```sh
$ZAI_BIN init
```

- 已建档（`zai-doctor.lock.json` 已在）-> 跳过，告诉用户"已建档，直接诊断"。
- 未建档 -> 跑 `init`，告诉用户建了 `.agents/` + lockfile。

### 步骤 2：诊断

```sh
$ZAI_BIN diagnose
```

- 读 `.agents/.build/diagnose-report.md`（已建档才落盘；未建档从 stdout 读）。
- **用自然语言讲症状**，按严重度分组：
  - 🔴 阻塞（如"未建档""资产 schema 缺 id"）-> 必须先处理。
  - 🟡 建议（如"react-ts 版本滞后""药典 manifest integrity 变化"）。
  - 🟢 提示（如"cursor 配置已存在但环境未装本体，仍可预生成"）。
- 有 🔴 阻塞 -> 先引导处理，不要进开方。

### 步骤 3：开方

```sh
$ZAI_BIN prescribe
```

- 读 `.agents/.build/prescription.md`。
- 处方单分两区：
  - **推荐**（按技术栈匹配，默认已勾 `[x]`，附置信度 + 命中信号）。
  - **可选**（未匹配，`[ ]`，按需挑）。
- 把推荐/可选列给用户，**附每条的命中理由**，问用户装哪些。
- 用户选定后，**两种抓药方式**：
  - 代用户编辑 `prescription.md` 的勾选（`[ ]` <-> `[x]`），再跑 `$ZAI_BIN treat`（不带 id，按勾选抓药）。
  - 或直接 `$ZAI_BIN treat <id1> <id2> ...`。
- MCP 资产若 `⚠ 未固定版本`，提示用户"建议改为 `pkg@<version>`"（仅提示，不阻塞）。

### 步骤 4：下药（写盘前必求确认）

抓药前**先讲清影响**，得到用户明确同意再跑：

- 会装哪些资产、写到 `.agents/<type>/` 还是 `.agents/mcp.json`。
- 会 sync 到哪些 agent、改哪些原生配置文件（`.claude/rules` / `.cursor/rules` / `.github/copilot-instructions.md` 等）。
- 若指定 `--agent` 限定目标，说明只动这些 agent。

```sh
$ZAI_BIN treat <ids...>           # 或 $ZAI_BIN treat（按处方单勾选）
# 可选：--agent claude,cursor  限定目标；--copy  强制 copy（无软链权限时）；--force  覆盖本地已改资产
```

跑完读输出 + `.agents/.build/sync-report.md`，**讲结果**：
- ✓ 装了哪些、`->` 落到哪个文件、`(symlink|copy)`。
- ⤳ skip 的及原因（如"资产未声明支持 codex""MCP 未信任""资产类型不被该 agent 支持"）。
- ⚠ 本地已修改而跳过覆盖的（冲突保护）：告诉用户"你改过 X，没覆盖；要覆盖请加 `--force`"。
- 🗑 GC 清理的旧目标。

> treat 已自动信任被装的 MCP 并自动 sync，无需用户再 `trust` / `sync`。
> 单独换药（只重渲染不装新资产）用 `$ZAI_BIN sync`；清理某 agent 全部受管配置用 `$ZAI_BIN purge <agent>`；卸载单资产用 `$ZAI_BIN remove <id>`。这些也都是写盘，同样先求确认。

### 步骤 5：复诊

```sh
$ZAI_BIN diagnose
```

- 看症状是否消除。
- 仍有 🟡/🔴 -> 回步骤 3 重新开方（可能是版本滞后需 `treat` 升级，或新装资产引出新的不兼容）。
- 全绿 -> 告诉用户"闭环完成"，总结项目现在有哪些 agent 配置、装了哪些资产。

---

## 远端项目（用户丢 git URL）

1. `git clone <url>` 到临时目录（复用宿主机凭据）。
2. `cd` 进 clone 目录，按上面剧本走（或全程加 `--project <clone路径>`）。
3. 完成后告诉用户配置落在哪个项目目录，提醒提交到版本控制（`.agents/` 入库；`.agents/.build/` 与 sync 产物按 `.gitignore` 受管段处理）。

## 安全契约（始终遵守）

1. **写盘前必求确认**：treat / sync / remove / purge 都先讲影响，用户同意才执行。
2. **冲突保护透传**：zai-doctor 不会覆盖用户改过的受管文件；出现 skip/冲突要原样告诉用户，不要静默吞掉。
3. **MCP 信任不等于运行**：treat 装的 MCP 会写入 agent 配置，但用户应知道每个 MCP 的 command/args；用户想审查时跑 `$ZAI_BIN trust <id>` 展示详情。
4. **不替用户决定装什么**：推荐只基于技术栈匹配，最终装哪些由用户拍板。

## 不该做的事

- 不要绕过 zai-doctor 直接手写 `.claude/rules` 等配置--那样绕过了受管冲突保护、GC、hash 校验，后续 `sync` 会冲突。
- 不要在未建档时跑 treat（会报错"未建档，先 init"）。
- 不要对 🔴 阻塞症状视而不见直接下药。
