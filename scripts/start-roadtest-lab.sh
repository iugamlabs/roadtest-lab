#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  -h|--help)
    echo '用法：bash scripts/start-roadtest-lab.sh [--stop]'
    exit 0
    ;;
  ''|--stop) ;;
  *) echo "未知参数：$1" >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  echo '用法：bash scripts/start-roadtest-lab.sh [--stop]' >&2
  exit 2
fi

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
runtime="${XDG_RUNTIME_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}}/roadtest-lab"
url=http://127.0.0.1:19237/
pid_file="$runtime/preview.pid"
log_file="$runtime/preview.log"
export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
umask 077
mkdir -p -- "$runtime"
read -r boot_id < /proc/sys/kernel/random/boot_id

notify() {
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -a '路考练习室' "$1" "${2:-}" || true
  fi
}

fail() {
  notify '路考练习室启动器' "$1"
  printf '%s\n' "$1" >&2
  exit 1
}

exec 9>"$runtime/launcher.lock"
flock -n 9 || fail '另一次启动或停止正在进行，请稍后再试。'

preview_started_at() {
  local pid=$1 stat
  local -a fields
  [[ "$pid" =~ ^[1-9][0-9]*$ && -r /proc/$pid/stat ]] || return 1
  IFS= read -r stat 2>/dev/null < "/proc/$pid/stat" || return 1
  # comm 可以含空格或括号。取最后一个右括号之后的字段。
  read -ra fields <<< "${stat##*) }"
  [[ ${fields[0]} != Z && ${fields[2]} == "$pid" && ${fields[3]} == "$pid" ]] || return 1
  printf '%s\n' "${fields[19]}"
}

stop_preview() {
  local saved_boot pid started i
  if [[ -f "$pid_file" ]] && read -r saved_boot pid started < "$pid_file" &&
    [[ "$saved_boot" == "$boot_id" && -n "$started" && $(preview_started_at "$pid") == "$started" ]]; then
    if kill -TERM -- "-$pid" 2>/dev/null; then
      for ((i = 0; i < 30; i++)); do
        [[ $(preview_started_at "$pid") == "$started" ]] || break
        sleep 0.1
      done
    fi
    [[ $(preview_started_at "$pid") != "$started" ]] || fail '预览服务尚未退出，请稍后重试。'
  fi
  rm -f -- "$pid_file"
}

if [[ ${1:-} == --stop ]]; then
  stop_preview
  notify '路考练习室已停止'
  exit 0
fi

for dependency in pnpm curl setsid; do
  command -v "$dependency" >/dev/null 2>&1 || fail "未找到 $dependency，请安装后重试。"
done
cd -- "$root"
stop_preview
if curl --noproxy '*' --silent --output /dev/null --max-time 1 "$url"; then
  fail '端口 19237 已有服务，请先在原终端停止该服务。'
fi

notify '正在准备路考练习室' '正在构建，请稍候。'
if ! pnpm build > "$log_file" 2>&1; then
  fail "构建失败，请查看 $log_file"
fi

# 关闭子进程中的锁描述符，预览在启动脚本退出后继续运行。
setsid pnpm preview --strictPort 9>&- </dev/null >> "$log_file" 2>&1 &
pid=$!
started=
for ((i = 0; i < 80; i++)); do
  if [[ -z "$started" ]] && started=$(preview_started_at "$pid"); then
    printf '%s %s %s\n' "$boot_id" "$pid" "$started" > "$pid_file"
  fi
  kill -0 "$pid" 2>/dev/null || break
  if [[ -n "$started" ]] && grep -Fq -- "$url" "$log_file" &&
    curl --noproxy '*' --fail --silent --output /dev/null --max-time 1 "$url"; then
    for browser in google-chrome-stable google-chrome chromium chromium-browser xdg-open; do
      if command -v "$browser" >/dev/null 2>&1; then
        nohup "$browser" "$url" 9>&- </dev/null >> "$log_file" 2>&1 &
        notify '路考练习室已启动' '正在打开浏览器。'
        exit 0
      fi
    done
    notify '路考练习室已启动' "请在浏览器打开 $url"
    printf '请在浏览器打开 %s\n' "$url"
    exit 0
  fi
  sleep 0.25
done

stop_preview
fail "预览启动失败，请查看 $log_file"
