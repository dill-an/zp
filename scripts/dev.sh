#!/usr/bin/env bash
# Per-agent dev server with its own database copy and build directory.
# Usage: scripts/dev.sh setup <key>            -> seeds data/agent-<key>.db (password gate skipped)
#        scripts/dev.sh start <key> <port>     -> starts next dev on <port> using that db and .next-<key>
#        scripts/dev.sh stop <key>             -> stops it
#        scripts/dev.sh log <key> [lines]      -> tails the log
set -u
cmd="${1:-}"; key="${2:-}"; port="${3:-}"
dir="$(cd "$(dirname "$0")/.." && pwd)"
[ -n "$key" ] || { echo "usage: scripts/dev.sh setup|start|stop|log <key> [port]"; exit 1; }
db="$dir/data/agent-$key.db"; pidfile="$dir/data/.dev-$key.pid"; logfile="$dir/data/.dev-$key.log"; portfile="$dir/data/.dev-$key.port"
case "$cmd" in
  setup)
    cd "$dir"; rm -f "$db" "$db-wal" "$db-shm"
    DATABASE_PATH="$db" SEED_SKIP_PASSWORD_CHANGE=1 npm run --silent db:migrate && DATABASE_PATH="$db" SEED_SKIP_PASSWORD_CHANGE=1 npm run --silent db:seed ;;
  start)
    [ -n "$port" ] || { echo "port required"; exit 1; }
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "already running (pid $(cat "$pidfile")) on port $(cat "$portfile" 2>/dev/null)"; exit 0; fi
    [ -f "$db" ] || "$0" setup "$key"
    cd "$dir"
    DATABASE_PATH="$db" NEXT_DIST_DIR=".next-$key" setsid node node_modules/next/dist/bin/next dev -p "$port" > "$logfile" 2>&1 &
    echo $! > "$pidfile"; echo "$port" > "$portfile"
    for i in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$port/api/health" && { echo "dev server up on http://127.0.0.1:$port (db $db, pid $(cat "$pidfile"))"; exit 0; }; sleep 1; done
    echo "dev server did not come up; log:"; tail -20 "$logfile"; exit 1 ;;
  stop)
    if [ -f "$pidfile" ]; then pid=$(cat "$pidfile"); kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null; rm -f "$pidfile"; echo "stopped $key"; else echo "not running"; fi
    if [ -f "$portfile" ]; then p=$(cat "$portfile"); for x in $(ss -ltnp 2>/dev/null | grep ":$p " | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill "$x" 2>/dev/null; done; rm -f "$portfile"; fi ;;
  log) tail -n "${3:-40}" "$logfile" ;;
  *) echo "unknown command $cmd"; exit 1 ;;
esac
