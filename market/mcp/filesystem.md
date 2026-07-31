---
id: mcp-filesystem
type: mcp
title: Filesystem MCP
description: 文件系统 MCP，让 agent 读写项目文件
tags: [core]
agents: [claude, cursor, copilot]
layer: baseline
priority: 100
version: 1.0.0
---

{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
}
