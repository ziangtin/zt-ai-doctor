---
id: react-ts
type: rule
icon: 💻
title: React + TypeScript 项目规则
description: 约束 React/TS 代码风格、组件结构与类型规范
tags: [react, ts, frontend]
stack:
  deps: [react, typescript]
  files: [tsconfig.json]
agents: [claude, cursor, copilot]
layer: baseline
priority: 100
version: 1.0.0
---

# React + TypeScript 规则

## 组件
- 函数组件优先，禁用 class 组件。
- 组件文件 PascalCase，一个文件一个组件。
- Props 用 `interface` 或 `type` 显式声明，禁用 `any`。

## 类型
- 严格模式 `strict: true`。
- 公共 API 类型导出，内部类型不导出。
- 泛型具名，避免无意义单字母 `T`。

## Hooks
- 自定义 hook 以 `use` 开头，单独文件。
- 依赖数组完整，禁用对 `exhaustive-deps` 的 eslint-disable。

## 状态
- 跨组件状态优先 zustand/context；局部状态用 useState/useReducer。
- 副作用集中在 hook，组件内不直接 fetch。
