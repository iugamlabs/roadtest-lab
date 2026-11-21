#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo '用法：bash scripts/start-roadtest-lab.sh [--status|--open|--stop]'
  echo '  （无参数）  构建、启动预览并打开浏览器'
  echo '  --status    输出 JSON 状态，供桌面启动器读取'
  echo '  --open      服务已运行时打开浏览器'
  echo '  --stop      停止本项目的预览服务'
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  ''|--stop|--status|--open) ;;
  *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  usage >&2
  exit 2
fi

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
runtime="${XDG_RUNTIME_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}}/roadtest-lab"
port=19237
url=http://127.0.0.1:$port/
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

print_status_json() {
  local state=$1
  local message=${2:-}
  local pid=${3:-}
  STATE="$state" MESSAGE="$message" PID="$pid" URL="$url" LOG_FILE="$log_file" python3 - <<'PY'
import json
import os

payload = {
    "state": os.environ["STATE"],
    "url": os.environ["URL"],
    "logFile": os.environ["LOG_FILE"],
    "message": os.environ.get("MESSAGE", ""),
}
pid = os.environ.get("PID", "").strip()
if pid:
    payload["pid"] = int(pid)
print(json.dumps(payload, ensure_ascii=False))
PY
}

# /proc/<pid>/stat 中 comm 可含空格或括号；取最后一个右括号之后的字段。
# 返回：state ppid pgrp session starttime
proc_stat_fields() {
  local pid=$1 stat
  local -a fields
  [[ "$pid" =~ ^[1-9][0-9]*$ && -r /proc/$pid/stat ]] || return 1
  IFS= read -r stat 2>/dev/null < "/proc/$pid/stat" || return 1
  read -ra fields <<< "${stat##*) }"
  (( ${#fields[@]} >= 20 )) || return 1
  printf '%s %s %s %s %s\n' "${fields[0]}" "${fields[1]}" "${fields[2]}" "${fields[3]}" "${fields[19]}"
}

preview_started_at() {
  local pid=$1 state ppid pgrp session starttime
  read -r state ppid pgrp session starttime < <(proc_stat_fields "$pid") || return 1
  [[ "$state" != Z && "$pgrp" == "$pid" && "$session" == "$pid" ]] || return 1
  printf '%s\n' "$starttime"
}

# 占用 19237 的本机监听进程。
port_listener_pids() {
  local line pid
  local -A seen=()
  while IFS= read -r line; do
    while [[ "$line" =~ pid=([0-9]+) ]]; do
      pid=${BASH_REMATCH[1]}
      if [[ -z ${seen[$pid]+x} ]]; then
        seen[$pid]=1
        printf '%s\n' "$pid"
      fi
      line=${line#*pid=$pid}
    done
  done < <(ss -H -ltnp "( sport = :$port )" 2>/dev/null || true)
}

port_listening() {
  [[ -n $(ss -H -ltn "( sport = :$port )") ]]
}

is_our_preview_pid() {
  local pid=$1 vite
  local -a args
  [[ -O /proc/$pid && $(readlink "/proc/$pid/cwd" 2>/dev/null) == "$root" ]] || return 1
  mapfile -d '' -t args 2>/dev/null < "/proc/$pid/cmdline" || return 1
  [[ ${#args[@]} -ge 5 && ${args[2]} == preview ]] || return 1
  vite=$(readlink -f -- "$root/node_modules/vite/bin/vite.js") || return 1
  [[ $(readlink -f -- "${args[1]}") == "$vite" ]] || return 1
  local i
  for ((i = 3; i + 1 < ${#args[@]}; i++)); do
    if [[ ${args[i]} == --port && ${args[i+1]} == "$port" ]]; then
      return 0
    fi
  done
  return 1
}

signal_orphan_preview() {
  local pid=$1 state parent group session started
  read -r state parent group session started < <(proc_stat_fields "$pid") || return 0
  [[ "$parent" == 1 ]] && is_our_preview_pid "$pid" || return 0
  local observed_start=$started
  read -r state parent group session started < <(proc_stat_fields "$pid") || return 0
  if [[ "$parent" == 1 && "$started" == "$observed_start" ]]; then
    kill -TERM -- "$pid" 2>/dev/null || true
  fi
}

stop_preview() {
  local pid listener i
  if pid=$(recorded_preview_pid); then
    kill -TERM -- "-$pid" 2>/dev/null || true
  fi

  while IFS= read -r listener; do
    signal_orphan_preview "$listener"
  done < <(port_listener_pids)

  for ((i = 0; i < 30; i++)); do
    if ! recorded_preview_pid >/dev/null && ! our_listening_pid >/dev/null; then
      rm -f -- "$pid_file"
      return 0
    fi
    sleep 0.1
  done
  fail "端口上的预览尚未退出，请在原终端停止它后重试。"
}

port_busy_by_foreign() {
  port_listening && ! our_listening_pid >/dev/null
}

url_ready() {
  curl --noproxy '*' --fail --silent --output /dev/null --max-time 1 "$url"
}

recorded_preview_pid() {
  local saved_boot pid started
  [[ -f "$pid_file" ]] || return 1
  read -r saved_boot pid started < "$pid_file" || return 1
  [[ "$saved_boot" == "$boot_id" && -n "$pid" && -n "$started" ]] || return 1
  [[ $(preview_started_at "$pid" 2>/dev/null || true) == "$started" ]] || return 1
  printf '%s\n' "$pid"
}

our_listening_pid() {
  local listener
  while IFS= read -r listener; do
    [[ -n "$listener" ]] || continue
    if is_our_preview_pid "$listener"; then
      printf '%s\n' "$listener"
      return 0
    fi
  done < <(port_listener_pids)
  return 1
}

resolve_status() {
  local pid listener

  if port_busy_by_foreign; then
    print_status_json error "端口 $port 已被其他程序占用，请先在原终端停止该程序。"
    return 0
  fi

  if pid=$(recorded_preview_pid); then
    if url_ready; then
      print_status_json running '练习室服务运行中。' "$pid"
      return 0
    fi
    if kill -0 "$pid" 2>/dev/null; then
      print_status_json starting '练习室正在启动，请稍候。' "$pid"
      return 0
    fi
  fi

  if listener=$(our_listening_pid); then
    if url_ready; then
      print_status_json running '练习室服务运行中。' "$listener"
      return 0
    fi
    print_status_json starting '练习室正在启动，请稍候。' "$listener"
    return 0
  fi

  print_status_json stopped '练习室尚未启动。'
}

open_browser() {
  local browser
  for browser in google-chrome-stable google-chrome chromium chromium-browser xdg-open; do
    if command -v "$browser" >/dev/null 2>&1; then
      nohup "$browser" "$url" 9>&- </dev/null >/dev/null 2>&1 &
      return 0
    fi
  done
  return 1
}

if [[ ${1:-} == --status ]]; then
  resolve_status
  exit 0
fi

if [[ ${1:-} == --open ]]; then
  if url_ready && { recorded_preview_pid >/dev/null || our_listening_pid >/dev/null; }; then
    if open_browser; then
      notify '路考练习室' '正在打开浏览器。'
      exit 0
    fi
    fail "请在浏览器打开 $url"
  fi
  if port_busy_by_foreign; then
    fail "端口 $port 已被其他程序占用，请先在原终端停止该程序。"
  fi
  fail '练习室尚未启动，请先打开练习室。'
fi

exec 9>"$runtime/launcher.lock"
flock -n 9 || fail '另一次启动或停止正在进行，请稍后再试。'

if [[ ${1:-} == --stop ]]; then
  stop_preview
  if port_busy_by_foreign; then
    fail "端口 $port 仍被其他程序占用，请在原终端停止该程序。"
  fi
  notify '路考练习室已停止'
  exit 0
fi

for dependency in pnpm curl setsid ss; do
  command -v "$dependency" >/dev/null 2>&1 || fail "未找到 $dependency，请安装后重试。"
done
cd -- "$root"
stop_preview
if port_listening; then
  fail "端口 $port 已被占用，请先在原终端停止该程序。"
fi

notify '正在准备路考练习室' '正在构建，请稍候。'
if ! pnpm build > "$log_file" 2>&1; then
  fail "构建失败，请查看 $log_file"
fi

# 直接启动 vite，避免 pnpm 再拆进程组导致只杀掉外壳、预览残留。
# 关闭子进程中的锁描述符，预览在启动脚本退出后继续运行。
vite_bin="$root/node_modules/.bin/vite"
[[ -x "$vite_bin" ]] || fail "未找到本地 vite，请先在项目目录运行 pnpm install。"
setsid "$vite_bin" preview --host 127.0.0.1 --port "$port" --strictPort 9>&- </dev/null >> "$log_file" 2>&1 &
pid=$!
started=
for ((i = 0; i < 80; i++)); do
  if [[ -z "$started" ]] && started=$(preview_started_at "$pid"); then
    printf '%s %s %s\n' "$boot_id" "$pid" "$started" > "$pid_file"
  fi
  kill -0 "$pid" 2>/dev/null || break
  if [[ -n "$started" ]] && grep -Fq -- "$url" "$log_file" && url_ready; then
    if [[ "${ROADTEST_OPEN_BROWSER:-1}" != 0 ]]; then
      if open_browser; then
        notify '路考练习室已启动' '正在打开浏览器。'
        exit 0
      fi
      notify '路考练习室已启动' "请在浏览器打开 $url"
      printf '请在浏览器打开 %s\n' "$url"
      exit 0
    fi
    notify '路考练习室已启动'
    exit 0
  fi
  sleep 0.25
done

stop_preview
fail "预览启动失败，请查看 $log_file"
