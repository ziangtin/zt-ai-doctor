# Agent 类型覆盖矩阵

zai-doctor 各 renderer 对资产类型（rule/skill/mcp）的支持与目标路径。

## 矩阵

| agent | rule | skill | mcp | 配置探测标记 |
|---|---|---|---|---|
| claude | ✓ `CLAUDE.md`（聚合自 `.agents/README.md`） | ✓ `.claude/skills/<id>/SKILL.md` | ✓ `.mcp.json` | `.claude/` 或 `CLAUDE.md` |
| cursor | ✓ `.cursor/rules/<id>.mdc` | skip | ✓ `.cursor/mcp.json` | `.cursor/` 或 `.cursorrules` |
| copilot | ✓ `.github/copilot-instructions.md` | skip | ✓ `.vscode/mcp.json` | `.github/copilot-instructions.md` 或 `.vscode/mcp.json` |
| codex | ✓ `AGENTS.md` | skip | skip（全局 `~/.codex/config.toml`） | `AGENTS.md` |
| cline | ✓ `.clinerules/<id>.md` | skip | skip（全局 `~/.cline/`） | `.clinerules/` |
| windsurf | ✓ `.windsurfrules`（聚合，legacy 仍有效） | skip | skip（全局 `~/.codeium/`） | `.windsurfrules` |
| trae | ✓ `.trae/rules/<id>.md` | skip | ✓ `.trae/mcp.json` | `.trae/` |
| lingma | ✓ `.qoder/rules/<id>.md` | skip | skip（IDE 设置 UI） | `.qoder/` |

## 说明

- **rule**：各 agent 的项目级指令文件。聚合型（claude/codex/windsurf/copilot）按 `priority` 降序拼成单文件；单文件型（cursor/trae/lingma/cline）每条规则一文件（cursor/trae/lingma 带 `description/globs/alwaysApply` frontmatter 用 `rule-mdc`，cline 纯 markdown 用 `rule-md`）。
- **skill**：仅 Claude Code 有 skill 概念；其它 agent sync 时显式 skip（`skill 不被 <agent> 支持`）。
- **mcp**：
  - **项目级 MCP 配置**：Claude（`.mcp.json`）、Cursor（`.cursor/mcp.json`）、Copilot（`.vscode/mcp.json`）、Trae（`.trae/mcp.json`）。
  - **全局/UI 管理 MCP**：Codex（`~/.codex/config.toml`）、Cline（`~/.cline/`）、Windsurf（`~/.codeium/`）、Lingma（IDE 设置 UI）。zai-doctor **不自动改**这些，相关 mcp 资产 sync 时 skip；用各 agent 自身机制配置。
  - 所有 mcp 资产需先 `zai-doctor trust <id>` 才写入项目级配置。
- **trae**：ByteDance Trae IDE，规则/MCP 格式与 Cursor 一致（frontmatter + `{mcpServers}`），见 [docs.trae.ai](https://docs.trae.ai/ide/rules)。
- **lingma**：Alibaba 通义灵码 / Qoder CN IDE，规则 `.qoder/rules/`；MCP 经 IDE 设置 UI 管理（非项目级文件）。配置目录 `.qoder/`，若 Qoder CN 构建用 `.lingma/` 可在 `.agents/agents.json` 覆盖。见 [docs.qoder.com](https://docs.qoder.com/user-guide/rules)。
- **cline**：官方现以 `.clinerules/` 目录为主格式（每文件一规则，纯 markdown），见 [docs.cline.bot](https://docs.cline.bot/customization/cline-rules)。
- **windsurf**：已被 Cognition 收购（Devin Desktop），现代主格式为 `.devin/rules/*.md`（或 `.windsurf/rules/*.md`，带 `trigger` frontmatter）；单文件 `.windsurfrules` 官方说明仍会读取，故默认沿用。若要切目录格式可在 `.agents/agents.json` 覆盖。见 [Devin docs](https://docs.devin.ai/desktop/cascade/memories)。

## 风险 / 待验证

- 各 agent 是否跟随 symlink 读配置未完全验证（Windows 默认 copy 降级已覆盖；CI 上 symlink 待测）。
- agent 配置格式演进快，本表基于 2026-07 已知约定；若 agent 格式变更，renderer 需同步更新。
- `AGENTS.md` 是多 agent 约定，codex 的 detect 可能与其它工具重叠；用 `--agent codex` 显式指定。
