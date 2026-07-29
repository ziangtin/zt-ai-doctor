# Changelog

所有版本变更记录。每个版本一个文件，命名 `v<版本号>.md`（如 `v0.2.0.md`）。

## 格式

参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，遵循 [SemVer](https://semver.org/lang/zh-CN/)。每个版本文件内按变更类型分段：

- **Added**：新增功能（feature）
- **Changed**：对既有功能的变更（update）
- **Fixed**：缺陷修复（fix）
- **Removed**：已移除的功能

## 模板

```markdown
# v0.2.0 - 2026-08-01

## Added
- 新增 `rollback` 命令，回滚最近一次写操作

## Changed
- `diagnose` 作为 `audit` 的 alias

## Fixed
- 修复删除最后一个资产不执行 GC 的问题

## Removed
- 移除尚不可用的 `prompt` 资产类型
```

## 约定

- 版本号与 `cli/package.json` 的 `version` 对齐。
- 破坏性变更在对应条目前标注 **BREAKING**，并附迁移说明。
- 未发布的变更先记在下一个版本文件中，发布日填到标题。
