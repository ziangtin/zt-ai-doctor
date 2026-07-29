# agents.json 配置说明

`agents.json` 是 **agent 映射 + 探测的单一来源**：声明每个 agent 的

- 项目配置探测标记（`markers`）
- 环境探测信号（`env`：PATH 可执行 / 全局目录 / Windows 注册表）
- 渲染映射（`mappings`：目标路径 / 是否聚合 / action / 转换 profile）

renderer 不再硬编码这些，全部从配置读取。**新增 agent 或调整路径只需改配置，无需写 TS**（除非要新的转换样式）。

## 内置 agent

`cli/market/agents.json` 内置 8 个 agent：

| agent | 规则目标 | MCP 目标 | 说明 |
|---|---|---|---|
| claude | `CLAUDE.md`（聚合） | `.mcp.json` | + skill -> `.claude/skills/<id>/SKILL.md` |
| cursor | `.cursor/rules/{id}.mdc` | `.cursor/mcp.json` | |
| copilot | `.github/copilot-instructions.md`（聚合） | `.vscode/mcp.json` | |
| codex | `AGENTS.md`（聚合） | - | |
| cline | `.clinerules/{id}.md` | - | 纯 markdown，官方主格式为 `.clinerules/` 目录 |
| windsurf | `.windsurfrules`（聚合） | - | legacy 单文件仍有效；现代格式 `.devin/rules/*.md` 或 `.windsurf/rules/*.md`（带 `trigger` frontmatter） |
| trae | `.trae/rules/{id}.md` | `.trae/mcp.json` | ByteDance Trae IDE |
| lingma | `.qoder/rules/{id}.md` | - | Alibaba 通义灵码 / Qoder CN IDE（MCP 走 IDE 设置 UI，不自动写） |

> Lingma（原 Lingma IDE，现品牌 Qoder CN）配置目录为 `.qoder/`。若你的 Qoder CN 构建仍用 `.lingma/`，在 `.agents/agents.json` 覆盖 `lingma.mappings.rule.targetPath` 与 `markers` 即可。

## 位置与覆盖

| 层 | 路径 | 说明 |
|---|---|---|
| 内置默认 | `cli/market/agents.json` | 随包发布，开箱即用 |
| 项目覆盖 | `.agents/agents.json` | 按字段深合并覆盖内置；可新增 agent |

合并规则：项目配置**深合并**到内置——对象递归覆盖，数组/原始值整体替换。可只覆盖单个字段（如只改某 agent 某 type 的 `targetPath`），其余从内置继承。

## 完整示例

```jsonc
{
  "agents": {
    "claude": {
      "markers": [".claude", "CLAUDE.md"],          // 项目配置探测标记（相对 projectRoot）
      "supports": ["rule", "skill", "mcp"],          // 支持的资产类型（不支持的 sync 时 skip）
      "env": {                                        // 环境探测信号（detect 命令用）
        "executables": ["claude"],                    // PATH 上的可执行名（不带扩展，Windows 自动试 PATHEXT）
        "globalDirs": [".claude"],                    // 相对 home 的路径或 glob
        "registryNames": []                           // Windows 卸载项 DisplayName 子串
      },
      "mappings": {
        "rule": {
          "targetPath": "CLAUDE.md",                  // 目标路径模板，支持 {id} 占位
          "aggregate": true,                          // true=多资产聚合成单文件；false=一资产一文件
          "action": "symlink",                        // symlink | copy
          "transform": "rule-aggregate-md",           // 转换 profile 名（见下表）
          "aggregateSource": "README.md"              // 聚合产物源文件（相对 .agents/，可选；默认 .build/<agent>/<basename>）
        },
        "skill": {
          "targetPath": ".claude/skills/{id}/SKILL.md",
          "aggregate": false,
          "action": "symlink",
          "transform": "claude-skill"
        },
        "mcp": {
          "targetPath": ".mcp.json",
          "aggregate": true,
          "action": "symlink",
          "transform": "mcp-json"
        }
      }
    }
  }
}
```

## 转换 profile（transform 字段）

转换逻辑（frontmatter / 正文包装）仍保留在 TS（`cli/src/renderers/transforms.ts`），配置只引用 profile 名：

| profile | 类型 | 作用 |
|---|---|---|
| `rule-aggregate-md` | 聚合 | 多 rule 按 priority 降序拼成单个 markdown |
| `mcp-json` | 聚合 | 多 mcp 聚成 `{ mcpServers: { id: body } }`，非法 body 单独 skip |
| `rule-mdc` | 单资产 | 单 rule 包成规则 frontmatter（description/globs/alwaysApply）。Cursor `.mdc`、Trae `.md`、Qoder/Lingma `.md` 共用 |
| `rule-md` | 单资产 | 单 rule -> 纯 markdown（无 frontmatter），用于 Cline `.clinerules/<id>.md` |
| `claude-skill` | 单资产 | 单 skill 包成 `SKILL.md` frontmatter（name/description） |

> `aggregate: true` 必须配聚合型 profile；`aggregate: false` 必须配单资产型，且 `targetPath` 含 `{id}`。

## 环境探测信号（env 字段）

`zai-doctor detect` 用三类信号判断机器是否真装了 agent（区别于 `markers` 的项目配置探测）：

| 信号 | 字段 | 说明 |
|---|---|---|
| PATH 可执行 | `executables` | 跨平台查 PATH；Windows 自动试 PATHEXT（`.EXE/.CMD/...`） |
| 全局配置目录 | `globalDirs` | 相对 `~`，支持 glob（如 `.vscode/extensions/github.copilot-*`，覆盖 VS Code 扩展型 agent） |
| Windows 注册表 | `registryNames` | 查卸载项 DisplayName 子串（如 `Cursor`/`Windsurf`）；非 Windows 跳过 |

任一命中即视为已安装，并记录命中信号（`detect --verbose` 可见）。

## 新增 agent（纯配置）

例：加一个虚构 agent `myagent`，规则聚合到 `.myagent/rules.md`（copy 模式），环境探测查 `myagent` 可执行：

```jsonc
// .agents/agents.json
{
  "agents": {
    "myagent": {
      "markers": [".myagent"],
      "supports": ["rule"],
      "env": { "executables": ["myagent"], "globalDirs": [], "registryNames": [] },
      "mappings": {
        "rule": {
          "targetPath": ".myagent/rules.md",
          "aggregate": true,
          "action": "copy",
          "transform": "rule-aggregate-md"
        }
      }
    }
  }
}
```

之后 `zai-doctor sync --agent myagent` 即可渲染；`zai-doctor detect` 会探测其环境。无需改任何 TS。

> 若新 agent 需要全新的转换样式（非上表 profile），才需在 `transforms.ts` 加一个 profile 函数。

## 项目覆盖示例：微调路径

只改 cursor rule 的目标文件名，其余（mcp、markers、env）从内置继承：

```jsonc
{
  "agents": {
    "cursor": {
      "mappings": {
        "rule": { "targetPath": ".cursor/rules/custom-{id}.mdc", "aggregate": false, "transform": "rule-mdc" }
      }
    }
  }
}
```
