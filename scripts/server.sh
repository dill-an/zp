#!/usr/bin/env bash
# Start/stop a production server on a port with its own PID file.
# Usage: scripts/server.sh start <port> [DATABASE_PATH]  |  scripts/server.sh stop <port>  |  scripts/server.sh status <port>
set -u
cmd="${1:-status}"; port="${2:-3000}"; dbpath="${3:-}"
dir="$(cd "$(dirname "$0")/.." && pwd)"
pidfile="$dir/data/.server-$port.pid"
logfile="$dir/data/.server-$port.log"
case "$cmd" in
  start)
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "already running on $port (pid $(cat "$pidfile"))"; exit 0; fi
    cd "$dir"
    if [ -n "$dbpath" ]; then export DATABASE_PATH="$dbpath"; fi
    PORT="$port" setsid node node_modules/next/dist/bin/next start -p "$port" > "$logfile" 2>&1 &
    echo $! > "$pidfile"
    for i in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$port/api/health" && { echo "up on $port (pid $(cat "$pidfile"))"; exit 0; }; sleep 1; done
    echo "server did not come up; log:"; tail -20 "$logfile"; exit 1 ;;
  stop)
    if [ -f "$pidfile" ]; then pid=$(cat "$pidfile"); kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null; rm -f "$pidfile"; echo "stopped $port"; else echo "not running on $port"; fi
    # Also free the port if something else holds it.
    for p in $(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill "$p" 2>/dev/null; done ;;
  status)
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "running on $port (pid $(cat "$pidfile"))"; else echo "not running on $port"; fi ;;
  log) tail -n "${3:-40}" "$logfile" ;;
esac
