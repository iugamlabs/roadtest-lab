#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
export ROADTEST_LAB_ROOT="$root"
export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -a '路考练习室' '路考练习室启动器' '未找到 uv，请先安装 uv 后再试。' || true
  fi
  echo '未找到 uv，请先安装：https://docs.astral.sh/uv/' >&2
  exit 1
fi

project="$root/tools/roadtest-launcher"
if [[ ! -f "$project/pyproject.toml" ]]; then
  echo "找不到桌面启动器项目：$project" >&2
  exit 1
fi

cd -- "$project"
# 首次或依赖变化时自动同步；日常启动走本地 .venv。
uv sync --quiet
exec uv run roadtest-launcher
