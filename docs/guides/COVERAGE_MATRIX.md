# Agent 类型覆盖矩阵

zai-doctor 各 renderer 对资产类型（rule/skill/mcp）的支持与目标路径。

## 矩阵

| agent | rule | skill | mcp | detect 文件 |
|---|---|---|---|---|
| claude | ✓ `CLAUDE.md`（聚合自 `.agents/README.md`） | ✓ `.claude/skills/<id>/SKILL.md` | ✓ `.mcp.json` | `.claude/` 或 `CLAUDE.md` |
| cursor | ✓ `.cursor/rules/<id>.mdc` | skip | ✓ `.cursor/mcp.json` | `.cursor/` 或 `.cursorrules` |
| copilot | ✓ `.github/copilot-instructions.md` | skip | ✓ `.vscode/mcp.json` | `.github/copilot-instructions.md` 或 `.vscode/mcp.json` |
| codex | ✓ `AGENTS.md` | skip | skip（全局 `~/.codex/config.toml`） | `AGENTS.md` |
| cline | ✓ `.clinerules` | skip | skip（全局 `~/.cline/`） | `.clinerules` |
| windsurf | ✓ `.windsurfrules` | skip | skip（全局 `~/.codeium/`） | `.windsurfrules` |

## 说明

- **rule**：各 agent 的项目级指令文件。zai-doctor 把 `.agents/rules/*.md` 聚合成单一 markdown（按 `priority` 降序拼接），软链/copy 到目标路径。
- **skill**：仅 Claude Code 有 skill 概念；其它 agent sync 时显式 skip（`skill 不被 <agent> 支持`）。
- **mcp**：
  - **项目级 MCP 配置**：Claude（`.mcp.json`）、Cursor（`.cursor/mcp.json`）、Copilot（`.vscode/mcp.json`）。
  - **全局 MCP 配置**：Codex（`~/.codex/config.toml`）、Cline（`~/.cline/`）、Windsurf（`~/.codeium/`）。zai-doctor **不自动改全局配置**，这些 agent 的 mcp 资产 sync 时 skip；用各 agent 自身机制配置全局 MCP。
  - 所有 mcp 资产需先 `zai-doctor trust <id>` 才写入项目级配置。

## 风险 / 待验证

- 各 agent 是否跟随 symlink 读配置未完全验证（Windows 默认 copy 降级已覆盖；CI 上 symlink 待测）。
- agent 配置格式演进快，本表基于 2026-07 已知约定；若 agent 格式变更，renderer 需同步更新。
- `AGENTS.md` 是多 agent 约定，codex 的 detect 可能与其它工具重叠；用 `--agent codex` 显式指定。
