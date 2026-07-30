# 药典多版本（manifest versions）

药典资产支持多版本：同一个 id 可有多个版本，`treat --to <ver>` 装指定版本（含回退），`diagnose` 检测版本滞后。

## 设计原则

**hash 是内容真相，version 是表达层。**
- 检测更新/篡改以 hash 为准（不会漏报，不依赖人工 bump）。
- version 负责：直观展示版本迁移、回退锚点。
- 两者并存，不互相取代。

## 数据模型

### frontmatter（version 权威来源）
每个资产 `.md` 的 frontmatter 声明 `version`（semver `x.y.z`，不支持 pre-release）：
```yaml
---
id: react-ts
type: rule
version: 1.0.0
---
```
缺省视为 `0.0.0`（未版本化资产）。

### manifest.json（versions 索引）
新格式：一个 id 对应多个版本，每版本一个文件：
```json
{
  "id": "react-ts",
  "type": "rule",
  "versions": [
    { "version": "1.0.0", "path": "rules/react-ts/v1.0.0.md" },
    { "version": "1.1.0", "path": "rules/react-ts/v1.1.0.md" }
  ]
}
```
- `versions` 按 semver 取最高为"最新"，treat 不带 `--to` 装最新。
- manifest 声明的 `version` 必须与对应文件 frontmatter 的 `version` 一致（校验，同 id/type 一致性模式）。

### 旧格式兼容（单 path）
manifest 仍接受旧格式，读时归一化为单元素 `versions`（version 留空，从 frontmatter 读）：
```json
{ "id": "react-ts", "type": "rule", "path": "rules/react-ts.md" }
```
旧 lockfile（无 version 字段）视为 `0.0.0`，不影响使用。

## lockfile 记装时版本
`treat` 时 lockfile 记录装的是哪个版本：
```json
{
  "id": "react-ts", "type": "rule", "hash": "...",
  "version": "1.0.0",
  "installedAt": "...", "marketPath": "..."
}
```

## 版本滞后检测（diagnose）
`diagnose` 对比 lockfile 装时 version 与药典最新 version：

| 症状 | 触发条件 | 含义 |
|---|---|---|
| 版本滞后 | 装时 version ≠ 药典最新 | 显示 `1.0.0 -> 1.1.0`，重跑 treat 升级 |
| 已装版本已从药典移除 | 装时 version 不在药典 versions | 回退或升级到现有版本 |
| 内容已变但版本号未更新 | hash 变 + version 没变 | 作者忘 bump |

旧 lockfile（无 version）只靠 hash 检测内容变化，不报版本维度。

## 回退
`treat <id> --to <旧版本>` 即回退：按 id 覆盖目标文件（`.agents/<type>/<id>.md`），lockfile 的 version/hash 更新为旧版本。
```bash
zai-doctor treat react-ts             # 装最新（1.1.0）
zai-doctor treat react-ts --to 1.0.0  # 回退到 1.0.0
zai-doctor diagnose                   # 确认版本
```
版本不存在时报错并列出可用版本。

## 发新版本
1. 新建版本文件（如 `rules/react-ts/v1.1.0.md`），frontmatter `version: 1.1.0`
2. manifest 的 `versions` 数组加一项 `{ "version": "1.1.0", "path": "..." }`
3. `zai-doctor list` / `zai-doctor info <id>` 验证可用版本
4. 已装用户跑 `diagnose` 会看到版本滞后提示，`treat <id>` 升级

## 相关
- 使用说明：[使用文档](./usage)
- 架构与数据流：[架构与流程](./architecture)
