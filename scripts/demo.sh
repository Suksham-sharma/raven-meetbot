#!/usr/bin/env bash
#
# One command: bring the whole stack up and send the bot into a meeting.
#
#   ./scripts/demo.sh https://meet.google.com/abc-defg-hij
#
# Everything here is idempotent — anything already running is left alone, so
# re-running between demo takes costs a few seconds, not a rebuild.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOGS="$ROOT/.demo-logs"
COOKIES="$LOGS/cookies.txt"
API=http://localhost:3001
WEB=http://localhost:3000

EMAIL="${RAVEN_EMAIL:-dev@raven.local}"
PASSWORD="${RAVEN_PASSWORD:-devpassword}"

MEET_URL="${1:-}"
BOT_NAME="${2:-Raven}"
MAX_MINUTES="${MAX_MINUTES:-60}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\033[2m→\033[0m %s\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -n "$MEET_URL" ] || fail "usage: ./scripts/demo.sh <meet-url> [bot-name]"
case "$MEET_URL" in
  https://meet.google.com/*) ;;
  *) fail "not a Google Meet URL: $MEET_URL" ;;
esac

mkdir -p "$LOGS" recordings screenshots

# Waits for a TCP port rather than sleeping a fixed amount — a cold tsx start is
# a few seconds, a warm one is instant, and the demo should not pay for the
# worst case every time.
wait_port() {
  local port=$1 name=$2 tries=${3:-60}
  for _ in $(seq 1 "$tries"); do
    nc -z localhost "$port" 2>/dev/null && return 0
    sleep 1
  done
  fail "$name never came up on :$port — see $LOGS/"
}

up() { nc -z localhost "$1" 2>/dev/null; }

# Background a long-running service only if its port is free. Logs go to a file
# because the demo needs this terminal back.
serve() {
  local port=$1 name=$2 dir=$3 script=$4
  if up "$port"; then step "$name already on :$port"; return; fi
  step "starting $name"
  ( cd "$dir" && nohup pnpm "$script" >"$LOGS/$name.log" 2>&1 & )
  wait_port "$port" "$name"
}

bold "Raven demo"

# ---- 1. infra -------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  step "starting Docker"
  open -a OrbStack
  for _ in $(seq 1 45); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || fail "Docker did not start"
fi

step "postgres + redis"
docker compose up -d postgres redis >/dev/null
for _ in $(seq 1 45); do
  docker compose exec -T postgres pg_isready -U postgres -d meetbot >/dev/null 2>&1 && break
  sleep 1
done

# ---- 2. bot image ---------------------------------------------------------
if ! docker image inspect meet-bot:latest >/dev/null 2>&1; then
  step "building meet-bot:latest (first run only, ~2-4 min)"
  docker build -t meet-bot:latest bot >"$LOGS/build.log" 2>&1 \
    || fail "bot image build failed — see $LOGS/build.log"
fi

# ---- 3. orchestrator config ----------------------------------------------
# The orchestrator talks to Docker through dockerode, which — unlike the docker
# CLI — does not read Docker contexts. It hardcodes /var/run/docker.sock, and
# OrbStack (and Docker Desktop) put the socket under $HOME instead, so spawning
# dies with ENOENT while every `docker` command in this same script works fine.
# Ask the CLI where the active endpoint actually is and hand it over explicitly.
DOCKER_SOCK="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
[ -n "$DOCKER_SOCK" ] || DOCKER_SOCK="unix:///var/run/docker.sock"
case "$DOCKER_SOCK" in
  unix://*) [ -S "${DOCKER_SOCK#unix://}" ] || fail "Docker socket not found at ${DOCKER_SOCK#unix://}" ;;
esac

# Written every run, not just when absent: the paths must be absolute (Docker
# rejects relative bind sources) and REDIS_URL must match the port the
# api-server actually enqueues to. A stale file here fails silently — the
# orchestrator connects to the wrong Redis and simply never sees a job.
cat > orchestrator/.env <<EOF
REDIS_URL=redis://localhost:6380
BOT_IMAGE=meet-bot:latest
DOCKER_HOST=$DOCKER_SOCK
SCREENSHOTS_HOST_PATH=$ROOT/screenshots
RECORDINGS_HOST_PATH=$ROOT/recordings
AUTH_STATE_HOST_PATH=$ROOT/bot/.auth
MAX_CONCURRENT_BOTS=10
DEEPGRAM_API_KEY=$(grep -E '^DEEPGRAM_API_KEY=' .env 2>/dev/null | cut -d= -f2-)
EOF

[ -f bot/.auth/state.json ] \
  || echo "  ! no bot/.auth/state.json — bot will join anonymously and Meet may block it (fix: cd bot && pnpm auth)"

# ---- 4. services ----------------------------------------------------------
serve 3001 api "$ROOT/api-server" dev
serve 3000 web "$ROOT/web" dev

# Workers and the orchestrator hold no port, so they are matched by command line.
run_bg() {
  local name=$1 dir=$2 script=$3 pattern=$4
  if pgrep -f "$pattern" >/dev/null 2>&1; then step "$name already running"; return; fi
  step "starting $name"
  ( cd "$dir" && nohup pnpm "$script" >"$LOGS/$name.log" 2>&1 & )
}

run_bg diarize "$ROOT/api-server" worker:diarize "diarize.worker.ts"
run_bg memory  "$ROOT/api-server" worker         "memory.worker.ts"
run_bg agent   "$ROOT/api-server" worker:agent   "agent.worker.ts"

# The orchestrator is restarted rather than skipped, because orchestrator/.env is
# rewritten above and a live process would keep the values it booted with — the
# exact failure this guards against (a stale DOCKER_HOST or REDIS_URL) is silent.
# Held back only while a bot container is up, since killing it mid-call would
# abandon the recording.
ORCH_PATTERN="orchestrator.*index.ts"
if [ -n "$(docker ps -q --filter ancestor=meet-bot:latest)" ]; then
  step "orchestrator left alone — a bot container is still running"
elif pgrep -f "$ORCH_PATTERN" >/dev/null 2>&1; then
  step "restarting orchestrator"
  pkill -f "$ORCH_PATTERN" || true
  sleep 1
  ( cd "$ROOT/orchestrator" && nohup pnpm dev >"$LOGS/orchestrator.log" 2>&1 & )
else
  step "starting orchestrator"
  ( cd "$ROOT/orchestrator" && nohup pnpm dev >"$LOGS/orchestrator.log" 2>&1 & )
fi

sleep 2

# ---- 5. dispatch ----------------------------------------------------------
step "signing in as $EMAIL"
code=$(curl -s -o "$LOGS/login.json" -w '%{http_code}' -X POST "$API/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -c "$COOKIES")
[ "$code" = "200" ] || fail "login failed (HTTP $code) — $(cat "$LOGS/login.json")"

step "dispatching bot to $MEET_URL"
code=$(curl -s -o "$LOGS/join.json" -w '%{http_code}' -X POST "$API/api/v1/join-meet" \
  -H 'Content-Type: application/json' -b "$COOKIES" \
  -d "{\"url\":\"$MEET_URL\",\"botName\":\"$BOT_NAME\",\"maxDurationMinutes\":$MAX_MINUTES}")
[ "$code" = "200" ] || fail "join-meet failed (HTTP $code) — $(cat "$LOGS/join.json")"

JOB=$(node -e "process.stdout.write(require('$LOGS/join.json').jobId||'')")

echo
bold "Bot dispatched — job $JOB"
cat <<EOF

  Admit "$BOT_NAME" into the call when it knocks.

  Dashboard   $WEB
  Live status curl -s $API/api/v1/bots/$JOB/status -b $COOKIES
  Recording   $ROOT/recordings/   (<meet-code>_<date>_<time>.webm)
  Logs        $LOGS/

  The .webm lands when the bot leaves or hits ${MAX_MINUTES}m. Transcription
  and ingest run after that, then the meeting appears on the dashboard.
EOF
