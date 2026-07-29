---
id: mcp-chrome-devtools
type: mcp
title: Chrome DevTools MCP
description: 浏览器自动化/检查 MCP，需 Chrome 以 --remote-debugging-port=9222 运行
tags: [browser, dev, debug]
agents: [claude, cursor, copilot]
layer: baseline
priority: 90
---
{ "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"] }
