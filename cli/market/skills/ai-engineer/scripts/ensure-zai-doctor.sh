#!/usr/bin/env sh
# ensure-zai-doctor.sh — 确保 zai-doctor CLI 可用，输出调用命令到 stdout。
#
# 用法：
#   export ZAI_REPO_URL="<内部 GitLab zai-doctor 仓库地址>"
#   ZAI_BIN=$(bash ensure-zai-doctor.sh)
#   $ZAI_BIN init / diagnose / ...
#
# 幂等：PATH 有用 PATH；缓存 ~/.zai-doctor 在用缓存；都没有才 clone + build（首次）。
# 认证依赖宿主机已配的 git 凭据（SSH key / credential helper），脚本里不出现 token。
# 跨平台 POSIX sh（Windows Git Bash / macOS / Linux 通用）。
set -e

ZAI_REPO_URL="${ZAI_REPO_URL:-$1}"
ZAI_CACHE="${ZAI_CACHE:-$HOME/.zai-doctor}"

# 1. PATH 上已有 -> 直接用
if command -v zai-doctor >/dev/null 2>&1; then
  echo "zai-doctor"
  exit 0
fi

# 2. 缓存已在 -> 用缓存
if [ -f "$ZAI_CACHE/dist/index.js" ]; then
  echo "node $ZAI_CACHE/dist/index.js"
  exit 0
fi

# 3. 都没有 -> clone + build（首次）
if [ -z "$ZAI_REPO_URL" ]; then
  echo "✗ 未知 zai-doctor 仓库地址。设置 ZAI_REPO_URL=<内部 GitLab url> 后重试，或先手动安装 zai-doctor。" >&2
  exit 1
fi
git clone "$ZAI_REPO_URL" "$ZAI_CACHE"
( cd "$ZAI_CACHE" && npm ci && npm run build )
echo "node $ZAI_CACHE/dist/index.js"

# 升级（手动）：cd "$ZAI_CACHE" && git pull && npm ci && npm run build
