#!/usr/bin/env bash
# One-click start for Game Designer (FastAPI backend + Vite frontend).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
BACKEND_PORT=8000
FRONTEND_PORT=5173
SKIP_INSTALL=0
NO_BROWSER=0
PIDS=()

usage() {
  echo "Usage: ./start.sh [--skip-install] [--no-browser]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1; shift ;;
    --no-browser) NO_BROWSER=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log() { printf '\n==> %s\n' "$1"; }
ok() { printf '    %s\n' "$1"; }

port_open() {
  python3 - "$1" <<'PY' 2>/dev/null || python - "$1" <<'PY' 2>/dev/null || return 1
import socket, sys
s = socket.socket()
s.settimeout(0.2)
try:
    s.connect(("127.0.0.1", int(sys.argv[1])))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
}

wait_http() {
  local url="$1" timeout="${2:-40}" start=$SECONDS
  while (( SECONDS - start < timeout )); do
    if command -v curl >/dev/null 2>&1 && curl -sf -o /dev/null "$url"; then
      return 0
    fi
    sleep 0.4
  done
  return 1
}

cleanup() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

resolve_python() {
  local cmd
  for cmd in python3 python; do
    if command -v "$cmd" >/dev/null 2>&1 && "$cmd" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
      echo "$cmd"
      return 0
    fi
  done
  echo "未找到 Python 3.11+。" >&2
  exit 1
}

if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  echo "请在仓库根目录运行本脚本。" >&2
  exit 1
fi

PY="$(resolve_python)"
if [[ -x "$VENV_DIR/bin/python" ]]; then
  VENV_PY="$VENV_DIR/bin/python"
else
  VENV_PY="$VENV_DIR/Scripts/python.exe"
fi

log "检查 Python 后端"
if [[ ! -x "$VENV_PY" ]]; then
  echo "    创建虚拟环境 .venv ..."
  "$PY" -m venv "$VENV_DIR"
  if [[ -x "$VENV_DIR/bin/python" ]]; then
    VENV_PY="$VENV_DIR/bin/python"
  else
    VENV_PY="$VENV_DIR/Scripts/python.exe"
  fi
fi

NEED_INSTALL=1
if [[ "$SKIP_INSTALL" -eq 1 ]]; then
  NEED_INSTALL=0
elif "$VENV_PY" -c "import fastapi, uvicorn, langgraph" >/dev/null 2>&1; then
  NEED_INSTALL=0
fi
if [[ "$NEED_INSTALL" -eq 1 ]]; then
  echo "    安装后端依赖（首次会稍慢）..."
  "$VENV_PY" -m pip install -U pip
  (cd "$BACKEND_DIR" && "$VENV_PY" -m pip install -e ".[dev]")
fi
ok "后端就绪：$VENV_PY"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "未找到 Node.js / npm。请先安装：https://nodejs.org/" >&2
  exit 1
fi

log "检查前端"
if [[ "$SKIP_INSTALL" -eq 0 && ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "    安装前端依赖（首次会稍慢）..."
  (cd "$FRONTEND_DIR" && npm install)
fi
ok "前端就绪"

if port_open "$BACKEND_PORT"; then
  log "后端已在 :$BACKEND_PORT 运行，跳过启动"
else
  log "启动后端  http://127.0.0.1:$BACKEND_PORT"
  (
    cd "$BACKEND_DIR"
    exec "$VENV_PY" -m app.main
  ) &
  PIDS+=($!)
fi

if port_open "$FRONTEND_PORT"; then
  log "前端已在 :$FRONTEND_PORT 运行，跳过启动"
else
  log "启动前端  http://127.0.0.1:$FRONTEND_PORT"
  (
    cd "$FRONTEND_DIR"
    exec npm run dev
  ) &
  PIDS+=($!)
fi

log "等待服务就绪"
if wait_http "http://127.0.0.1:$BACKEND_PORT/docs"; then
  ok "后端已就绪"
else
  echo "    后端暂未响应，请查看上方日志" >&2
fi
if wait_http "http://127.0.0.1:$FRONTEND_PORT/"; then
  ok "前端已就绪"
else
  echo "    前端暂未响应，请查看上方日志" >&2
fi

if [[ "$NO_BROWSER" -eq 0 ]]; then
  if command -v open >/dev/null 2>&1; then
    open "http://127.0.0.1:$FRONTEND_PORT"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:$FRONTEND_PORT" >/dev/null 2>&1 || true
  fi
fi

echo
echo "工作台:  http://127.0.0.1:$FRONTEND_PORT"
echo "API 文档: http://127.0.0.1:$BACKEND_PORT/docs"
echo
echo "按 Ctrl+C 停止全部服务。"
echo "模型需在工作台「设置」中配置。"

wait
