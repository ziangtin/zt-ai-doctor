---
id: mcp-codegraph
type: mcp
title: CodeGraph MCP
description: 代码图查询/探索 MCP，基于 .codegraph 索引，支持符号源码与调用路径探索
tags: [code, dev, search]
agents: [claude, cursor, copilot]
layer: baseline
priority: 90
version: 1.0.0
---
{ "command": "codegraph", "args": ["serve", "--mcp"] }
