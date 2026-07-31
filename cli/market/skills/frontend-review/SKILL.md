---
id: frontend-review
type: skill
icon: 🔍
title: 前端代码审查
description: 前端 PR 审查 skill，检查组件/类型/可访问性
tags: [review, frontend]
rules: [react-ts]
layer: baseline
priority: 100
version: 1.0.0
---

# 前端代码审查 Skill

## 触发
当用户请求 review 前端代码时启用。

## 审查清单
1. **组件结构**：单一职责、文件命名、Props 类型完整。
2. **类型安全**：无 any、严格模式、导出类型。
3. **Hooks**：依赖数组完整、自定义 hook 命名。
4. **可访问性**：语义标签、aria、键盘可达。
5. **性能**：避免内联函数/对象 prop、合理 memo。

## 输出格式
按严重度分组：🔴 阻塞 / 🟡 建议 / 🟢 可选，每条附 `文件:行号`。
