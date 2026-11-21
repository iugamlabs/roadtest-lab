#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
app_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
desktop_dir=${XDG_DESKTOP_DIR:-}
if [[ -z "$desktop_dir" ]] && command -v xdg-user-dir >/dev/null 2>&1; then
  desktop_dir=$(xdg-user-dir DESKTOP)
fi
desktop_dir=${desktop_dir:-$HOME/Desktop}

script="$root/scripts/start-roadtest-lab-gui.sh"
if [[ "$script" == *[$'\n\r']* ]]; then
  echo '项目路径不能包含换行符。' >&2
  exit 1
fi

if [[ ! -x "$script" ]]; then
  chmod +x -- "$script"
fi

# 先转义 Exec 的引号参数，再转义 desktop 文件的字符串值。
script=${script//%/%%}
script=${script//\\/\\\\}
script=${script//\"/\\\"}
script=${script//\$/\\\$}
script=${script//\`/\\\`}
script=${script//\\/\\\\}

mkdir -p -- "$app_dir"
launcher="$app_dir/roadtest-lab.desktop"
while IFS= read -r line; do
  if [[ "$line" == 'Exec=@START_SCRIPT@' ]]; then
    printf 'Exec=bash "%s"\n' "$script"
  else
    printf '%s\n' "$line"
  fi
done < "$root/scripts/roadtest-lab.desktop" > "$launcher"

if [[ -d "$desktop_dir" && "$desktop_dir" != "$HOME" ]]; then
  desktop_launcher="$desktop_dir/路考练习室.desktop"
  install -m 755 -- "$launcher" "$desktop_launcher"
  if command -v gio >/dev/null 2>&1; then
    gio set "$desktop_launcher" metadata::trusted true 2>/dev/null || true
  fi
  printf '已安装桌面图标：%s\n' "$desktop_launcher"
fi
printf '已安装应用菜单项：%s\n' "$launcher"
printf '桌面启动器已改为图形界面（托盘 + 启停）。命令行仍可用：\n'
printf '  bash scripts/start-roadtest-lab.sh\n'
printf '  bash scripts/start-roadtest-lab.sh --stop\n'
printf '  bash scripts/start-roadtest-lab-gui.sh\n'
