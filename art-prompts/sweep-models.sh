#!/usr/bin/env bash
# =============================================================================
# sweep-models.sh — overnight model sweep for the shmup-cup art-prompts library.
#
# Loop per model type: START the SGLang server on the remote box through
# v2/server.sh (preflight: cards 2,3 and :30001 free, disk) → wait until it
# answers → GENERATE everything for that kind with generate.mjs (outputs land
# in output/<group>/ — the per-model subdir is native to generate.mjs, so there
# is nothing to "move") → STOP the server with `server.sh stop <group> --pgid`
# (the safe recipe: never by name or GPU, never the LLM's group) → file a
# .sweep-complete marker so --resume can continue an interrupted sweep.
# Runbook: docs/dev/art-generation-server.md.
#
# SWEEP ORDER LAW: ALL_GROUPS runs ALL FOUR IMAGE GROUPS BEFORE the video
# groups on purpose — 25 video entries are i2v and pull their source still
# from the generated images (any group, newest mtime wins). Running a video
# group first would skip every i2v task with [i2v-skipped: no source still].
# If you --only/--skip into a video-only sweep, generate the stills first or
# accept the skips; --resume re-runs the video groups after images complete.
#
# NOT YET EXECUTED AGAINST THE LIVE SERVER. Built + verified with bash -n and
# --dry-run only (dry-run performs ZERO ssh and ZERO writes).
#
# -----------------------------------------------------------------------------
# WHAT THE REMOTE LAUNCHERS REVEAL (re-checked read-only 2026-10-16):
#   /root/run_sglang_images_{flux1dev,flux2dev,stablediffusion35large,
#                          qwenimage,ltx25,ltxvideo,wan22}-1.sh
#   Each is a bare foreground command (no nohup, no pidfile, no docker,
#   no stop logic), e.g.:
#     CUDA_VISIBLE_DEVICES=2,3 sglang serve --model-path <ID> … \
#       --host 0.0.0.0 --port 30001
#   Consequences designed into this script:
#   * SERVED MODEL ID = the --model-path string exactly (see registry).
#   * All seven scripts pin CUDA_VISIBLE_DEVICES=2,3 and --port 30001 → they
#     CANNOT run concurrently. One type at a time is mandatory. The main LLM
#     runs on GPUs 0,1 and PORT 30000 — never a target, never a probe origin
#     (an URL on :30000, or skynet2 on :80/:443 — nginx to the LLM — is
#     refused below).
#   * Start and stop go through v2/server.sh, the only tool allowed to touch
#     skynet2's processes: `start` launches under `nohup setsid` (the printed
#     pgid is the launcher's own group) after a preflight; `stop --pgid`
#     signals that group only after checking it is not the LLM's and that it
#     runs the expected script / --model-path. Never pkill / killall.
#   * The first start of each model downloads its weights (FLUX.2-dev: about
#     195 GB) — START_WAIT defaults to 3 hours for that reason.
#   * Client entry point: http://skynet2.interserver.net:30001 (same default as
#     generate.mjs — plain HTTP, the one model loaded on cards 2,3).
#     Readiness GATE (2026-10-07 warmup fix): primary = GET /health
#     must return 200 (SGLang answers 503 until warmup completes) — no
#     POST before that. The /v1/models modes below then run as
#     secondary confirmation of the served id. Modes logged:
#       (1) served-id match      — /v1/models discriminates models and
#                                  lists the expected served id; or
#       (2) newly-loaded-model heuristic — the listing CHANGED versus the
#          pre-launch snapshot (single-model proxy that only ever shows
#          one id): any different body under HTTP 200 counts as the new
#          model being up; generate.mjs auto-adopts a lone served id.
#     EXPECT_MODEL_ID=0 downgrades to plain HTTP-200 acceptance.
#     --start-probe-url (or PROBE_URL env) overrides where we poll; for a
#     box with direct port routing point PROBE_URL/GENERATE_BASE_URL at
#     http://skynet2.interserver.net:3000N equivalents.
#   * flux2's script adds --transformer-weights-path lmsys/flux2-dev-modelopt-
#     fp8-sglang-transformer; does not change the served id.
#
# -----------------------------------------------------------------------------
# USAGE (run from art-prompts/, or anywhere — paths anchor to this script)
#   bash sweep-models.sh --only qwenvl --dry-run       # smoke, no side effects
#   bash sweep-models.sh --list-models
#   bash sweep-models.sh --parallel 2                  # full overnight sweep
#   bash sweep-models.sh --resume                      # continue after interruption
#   bash sweep-models.sh --only flux1 --filter dir=30-bosses   # single dir
#   bash sweep-models.sh --skip flux2,ltxvideo         # drop groups from the sweep
#   SSH_HOST=user@host OUT_ROOT=/tmp/out bash sweep-models.sh  # env overrides
#
# ROUTING: generate.mjs queues only entries whose Models/Model line names the
# group (shmup routing law) — the sweep needs no per-group filters; an image
# group sweeps every image entry naming it, wan22 gets both wan2.2-t2v and
# wan2.2-i2v, ltxvideo gets ltx-video entries incl. its 8 i2v ones.
# LIBRARY SOURCE: since the 2026-10-07 conversion generate.mjs prefers the
# <stem>.json sidecars (schema shmup-art-prompt-library@1) over the .md files —
# re-run the converter after editing .md, or delete sidecars to parse .md.
# --filter k=v (k in category,dir,file,id,model) passes straight through.
#
# Deps: bash 4+, ssh, curl, node (generate.mjs + JSON probing), coreutils.
# =============================================================================
set -euo pipefail

# --- registry: group -> remote script | kind | served id | label | direct port
group_field() { # $1=group $2=field index (1 script, 2 kind, 3 served-id, 4 label, 5 port)
  local row
  case "$1" in
  flux1) row="run_sglang_images_flux1dev-1.sh|image|black-forest-labs/FLUX.1-dev|FLUX.1-dev|30001" ;;
  flux2) row="run_sglang_images_flux2dev-1.sh|image|black-forest-labs/FLUX.2-dev|FLUX.2-dev (fp8 transformer)|30001" ;;
  sd35) row="run_sglang_images_stablediffusion35large-1.sh|image|stabilityai/stable-diffusion-3.5-large|Stable Diffusion 3.5 large|30001" ;;
  qwenvl) row="run_sglang_images_qwenimage-1.sh|image|Qwen/Qwen-Image|Qwen-Image|30001" ;;
  wan22) row="run_sglang_images_wan22-1.sh|video|Wan-AI/Wan2.2-T2V-A14B-Diffusers|Wan 2.2 T2V A14B (text-to-video; no I2V weights)|30001" ;;
  ltxvideo) row="run_sglang_images_ltxvideo-1.sh|video|Lightricks/LTX-Video|LTX-Video (video incl. 8 i2v entries)|30001" ;;
  *) return 1 ;;
  esac
  echo "$row" | cut -d'|' -f"$2"
}
# ORDER IS LAW (see SWEEP ORDER LAW in the header): images first so the i2v
# source stills exist when the video groups run. ltx25 exists on the fleet
# but no shmup prompt names it — deliberately absent; this array is the
# edit point if that changes.
ALL_GROUPS=(flux1 flux2 sd35 qwenvl wan22 ltxvideo)

# --- defaults (env-overridable, flags win) ----------------------------------
SSH_HOST="${SSH_HOST:-root@skynet2}"
SCRIPT_DIR_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_ROOT="${OUT_ROOT:-$SCRIPT_DIR_ABS/output}" # generate.mjs appends <group>/ itself
PROMPT_DIR="${PROMPT_DIR:-$SCRIPT_DIR_ABS}"
REMOTE_SCRIPT_DIR="${REMOTE_SCRIPT_DIR:-/root}"
PROBE_URL="${PROBE_URL:-http://skynet2.interserver.net:30001}" # /v1/models polled here (owner v2 default: plain HTTP :30001, same origin generate.mjs defaults to)
HEALTH_URL="${HEALTH_URL:-$PROBE_URL/health}"                  # readiness primary gate (503 warmup -> 200 ready); env-overridable
START_WAIT="${START_WAIT:-10800}"                              # seconds — a first start downloads the weights
EXPECT_MODEL_ID="${EXPECT_MODEL_ID:-1}"                        # 0 = accept HTTP 200 alone (single-model proxy that hides ids)
GENERATE_BASE_URL="${GENERATE_BASE_URL:-}"                     # empty = generate.mjs default (same :30001 origin); set only for direct-port boxes
PARALLEL=2
AUTO_N=0
KEEP_RUNNING=0
RESUME=0
FAIL_FAST=0
DRY_RUN=0
ONLY=()
SKIP=()
FILTERS=() # raw "k=v" specs, passed through to generate.mjs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="$SCRIPT_DIR/generate.mjs"
SERVER_SH="$SCRIPT_DIR/v2/server.sh" # the only tool that starts / stops models on skynet2
LLM_PORT=30000                       # the main LLM — never an image/video origin

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] [%s] %s\n' "$(ts)" "${1:-sweep}" "$2" >&2; }
die() {
  log "${1:-sweep}" "FATAL: $2"
  exit 1
}

run_remote() { # ssh with a command; dry-run prints instead
  if [ "$DRY_RUN" = 1 ]; then
    printf '[dry-run] ssh %s %q\n' "$SSH_HOST" "$1" >&2
    return 0
  fi
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" "$1"
}

# --- arg parsing (hand-rolled) -----------------------------------------------
usage() { sed -n '/^# USAGE$/,/^# ===/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
  --only)
    local_ifs_backup=$IFS
    IFS=','
    read -ra _only <<<"${2:?--only needs groups}"
    IFS=$local_ifs_backup
    ONLY+=("${_only[@]}")
    shift 2
    ;;
  --skip)
    local_ifs_backup=$IFS
    IFS=','
    read -ra _skip <<<"${2:?--skip needs groups}"
    IFS=$local_ifs_backup
    SKIP+=("${_skip[@]}")
    shift 2
    ;;
  --dry-run)
    DRY_RUN=1
    shift
    ;;
  --filter)
    FILTERS+=("${2:?--filter needs k=v}")
    shift 2
    ;;
  --auto-n)
    AUTO_N=1
    shift
    ;;
  --parallel)
    PARALLEL="${2:?}"
    shift 2
    ;;
  --keep-running)
    KEEP_RUNNING=1
    shift
    ;;
  --start-wait)
    START_WAIT="${2:?}"
    shift 2
    ;;
  --start-probe-url)
    PROBE_URL="${2:?}"
    shift 2
    ;;
  --resume)
    RESUME=1
    shift
    ;;
  --fail-fast)
    FAIL_FAST=1
    shift
    ;;
  --list-models)
    printf '%-10s %-46s %-6s %-6s %s\n' GROUP REMOTE-SCRIPT KIND PORT LABEL
    for g in "${ALL_GROUPS[@]}"; do
      printf '%-10s %-46s %-6s %-6s %s\n' "$g" "$(group_field "$g" 1)" "$(group_field "$g" 2)" "$(group_field "$g" 5)" "$(group_field "$g" 4)"
    done
    exit 0
    ;;
  -h | --help)
    usage
    exit 0
    ;;
  *) die sweep "unknown flag: $1 (try --help)" ;;
  esac
done

for g in "${ONLY[@]:-}" "${SKIP[@]:-}"; do
  [ -z "$g" ] && continue
  group_field "$g" 1 >/dev/null 2>&1 || die sweep "unknown group \"$g\" (valid: ${ALL_GROUPS[*]})"
done

# Refuse any probe / generation origin that would reach the main LLM: port 30000,
# or the skynet2 host on :80 / :443 (its nginx proxies to :30000).
refuse_llm_url() { # $1 variable name, $2 URL
  local hp host port
  [ -n "$2" ] || return 0
  hp=${2#*://}
  hp=${hp%%/*}
  host=${hp%%:*}
  port=${hp##*:}
  [ "$port" = "$hp" ] && case "$2" in https://*) port=443 ;; *) port=80 ;; esac
  [ "$port" = "$LLM_PORT" ] && die sweep "$1=$2: port $LLM_PORT is the main LLM on skynet2, not an image/video server (models are on :30001)"
  case "$host" in skynet2 | skynet2.interserver.net | 173.225.108.102)
    if [ "$port" = 80 ] || [ "$port" = 443 ]; then die sweep "$1=$2: skynet2's nginx on :$port proxies to the LLM on :$LLM_PORT — use http://skynet2.interserver.net:30001"; fi ;;
  esac
  return 0
}
refuse_llm_url PROBE_URL "$PROBE_URL"
refuse_llm_url HEALTH_URL "${HEALTH_URL:-}"
refuse_llm_url GENERATE_BASE_URL "$GENERATE_BASE_URL"

# --- ctrl-C: stop a started-but-unstopped remote model ----------------------
CURRENT_PID=""
CURRENT_GROUP=""
PRE_SNORM="" # normalized /v1/models body captured before launch (readiness mode 2)
on_interrupt() {
  echo
  log "${CURRENT_GROUP:-sweep}" "interrupted — best-effort stop of remote pid ${CURRENT_PID:-none}"
  if [ -n "$CURRENT_PID" ] && [ "$DRY_RUN" = 0 ] && [ "$KEEP_RUNNING" = 0 ]; then
    SERVER_SH_HOST="$SSH_HOST" bash "$SERVER_SH" stop "$CURRENT_GROUP" --pgid "$CURRENT_PID" || true
  fi
  exit 130
}
trap on_interrupt INT TERM

# --- per-type phases ----------------------------------------------------------
launch_model() { # sets LAUNCH_PID (the launcher's process group) ; args: $1 group
  local g="$1" out
  log "$g" "start: server.sh start $g ($REMOTE_SCRIPT_DIR/$(group_field "$g" 1), preflight first)"
  if [ "$DRY_RUN" = 1 ]; then
    printf '[dry-run] SERVER_SH_HOST=%s bash %s start %s\n' "$SSH_HOST" "$SERVER_SH" "$g" >&2
    LAUNCH_PID="<remote-pgid>"
    return 0
  fi
  # server.sh refuses (exit 3) while cards 2,3 or :30001 are busy; on success it
  # prints PGID=<n> (nohup setsid: the launcher leads its own process group) and
  # LOG=<path> (a timestamped log in /root/).
  out=$(SERVER_SH_HOST="$SSH_HOST" SERVER_SH_REMOTE_DIR="$REMOTE_SCRIPT_DIR" bash "$SERVER_SH" start "$g" 2>&1) || {
    printf '%s\n' "$out" >&2
    log "$g" "start failed or refused (see above)"
    return 1
  }
  printf '%s\n' "$out" >&2
  LAUNCH_PID=$(printf '%s\n' "$out" | sed -n 's/^PGID=//p' | tail -n 1)
  REMOTE_LOG=$(printf '%s\n' "$out" | sed -n 's/^started .*, log //p' | tail -n 1)
  [ -n "$LAUNCH_PID" ] || {
    log "$g" "start failed: no pgid returned"
    return 1
  }
  log "$g" "remote process group $LAUNCH_PID"
}

health_code() { # GET /health status code; "000" when unreachable
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${HEALTH_URL:-$PROBE_URL/health}" 2>/dev/null || true)
  printf '%s' "${c:-000}"
}

wait_ready() { # $1 group — PRIMARY gate: GET /health 200 (warmup fix 2026-10-07);
  #   secondary: /v1/models served-id / listing-change; abort if remote pid died
  local g="$1" served waited=0 probe="$PROBE_URL/v1/models" health="${HEALTH_URL:-$PROBE_URL/health}" health_ok=0
  served="$(group_field "$g" 3)"
  local id_expect="ready via served-id match or listing-change heuristic"
  [ "$EXPECT_MODEL_ID" = 0 ] && id_expect="HTTP 200 suffices (EXPECT_MODEL_ID=0)"
  log "$g" "wait: $health (200 required) then $probe — $id_expect ($START_WAIT s budget)"
  while [ "$waited" -lt "$START_WAIT" ]; do
    if [ "$DRY_RUN" = 1 ]; then
      printf '[dry-run] GET %s == 200; then curl -sf --max-time 5 %s | grep -q "%s"  # then generate\n' "$health" "$probe" "$served" >&2
      return 0
    fi
    # PRIMARY GATE: /health holds 503 until warmup completes — never POST before 200.
    if [ "$health_ok" = 0 ]; then
      hcode="$(health_code)"
      if [ "$hcode" = 200 ]; then
        health_ok=1
        log "$g" "health 200 — confirming served id via $probe"
      else
        log "$g" "warmup: $health answered ${hcode} — still loading"
        if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" "kill -0 '$LAUNCH_PID'" 2>/dev/null; then
          log "$g" "remote pid $LAUNCH_PID died during startup — log tail:"
          ssh -o BatchMode=yes "$SSH_HOST" "tail -n 40 '$REMOTE_LOG' 2>/dev/null" >&2 || true
          return 1
        fi
        sleep 10
        waited=$((waited + 10))
        continue
      fi
    fi
    if body=$(curl -sf --max-time 5 "$probe" 2>/dev/null) && [ -n "$body" ]; then
      norm=$(printf '%s' "$body" | tr -d ' \n')
      # mode 1: the listing discriminates models and names ours
      if printf '%s' "$norm" | grep -qF "\"id\":\"$served\""; then
        log "$g" "ready — mode: served-id match (\"$served\" visible in /v1/models)"
        return 0
      fi
      # explicit opt-out of id checks
      if [ "$EXPECT_MODEL_ID" = 0 ]; then
        log "$g" "ready — mode: HTTP 200 only (EXPECT_MODEL_ID=0 skips id checks)"
        return 0
      fi
      # mode 2: single-model proxy — listing changed vs pre-launch snapshot
      if [ "$norm" != "$PRE_SNORM" ]; then
        new_ids=$(printf '%s' "$body" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | paste -sd ',' -)
        log "$g" "ready — mode: newly-loaded-model heuristic (listing changed from pre-launch snapshot; now serves: ${new_ids:-?})"
        if ! printf '%s' "$new_ids" | grep -qxF "$served"; then
          log "$g" "note: expected \"$served\" is NOT the listed id — generate.mjs auto-adopts the single served id (request shape for $g kept); override with --served-model/GENERATE_BASE_URL if that is wrong"
        fi
        return 0
      fi
      log "$g" "answered but served id \"$served\" not listed and listing unchanged vs pre-launch — another model is loaded, still waiting"
    fi
    # dead process? show the log tail and abort this type
    if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" "kill -0 '$LAUNCH_PID'" 2>/dev/null; then
      log "$g" "remote pid $LAUNCH_PID died during startup — log tail:"
      ssh -o BatchMode=yes "$SSH_HOST" "tail -n 40 '$REMOTE_LOG' 2>/dev/null" >&2 || true
      return 1
    fi
    sleep 10
    waited=$((waited + 10))
  done
  log "$g" "start-wait ${START_WAIT}s exhausted (still not serving \"$served\")"
  ssh -o BatchMode=yes "$SSH_HOST" "tail -n 20 '$REMOTE_LOG' 2>/dev/null" >&2 || true
  return 1
}

generate_all() { # $1 group
  local g="$1" args
  args=(--model "$g" --out "$OUT_ROOT" --parallel "$PARALLEL")
  [ "$AUTO_N" = 1 ] && args+=(--auto-n)
  [ -n "$GENERATE_BASE_URL" ] && args+=(--base-url "$GENERATE_BASE_URL")
  # generate.mjs walks images/*/*.md + video/*/*.md and applies the shmup
  # routing law (Models/Model line vs --model group) — no implicit filter
  # here; user --filter (category/dir/file/id/model) passes through.
  if [ "${#FILTERS[@]}" -gt 0 ]; then
    local f
    for f in "${FILTERS[@]}"; do args+=(--filter "$f"); done
  fi
  log "$g" "generate: node generate.mjs ${args[*]}"
  [ "$DRY_RUN" = 1 ] && return 0
  node "$GENERATOR" "${args[@]}" || return 1
}

stop_model() { # $1 group — server.sh's safe stop of the group we started, then verify
  local g="$1"
  if [ "$KEEP_RUNNING" = 1 ]; then
    log "$g" "keep-running: leaving process group $LAUNCH_PID up"
    return 0
  fi
  log "$g" "stop: server.sh stop $g --pgid $LAUNCH_PID (INT → TERM group → KILL group, never the LLM's group)"
  [ "$DRY_RUN" = 1 ] && {
    printf '[dry-run] SERVER_SH_HOST=%s bash %s stop %s --pgid %s\n' "$SSH_HOST" "$SERVER_SH" "$g" "$LAUNCH_PID" >&2
    return 0
  }
  # server.sh refuses anything that is not this group or that looks like the
  # LLM, reports survivors, and verifies (LLM healthy, :30001 empty, cards freed).
  # A failed stop aborts the sweep: the next start would be refused anyway.
  SERVER_SH_HOST="$SSH_HOST" SERVER_SH_REMOTE_DIR="$REMOTE_SCRIPT_DIR" bash "$SERVER_SH" stop "$g" --pgid "$LAUNCH_PID" >&2 ||
    die "$g" "server.sh stop $g --pgid $LAUNCH_PID failed — check 'bash $SERVER_SH status' before anything else"
}

manifest_tally() { # $1 group -> "ok=N failed=N existing=N i2vskip=N"
  local mf="$OUT_ROOT/$1/manifest.jsonl"
  [ -f "$mf" ] || {
    echo "ok=0 failed=0 existing=0 i2vskip=0"
    return
  }
  node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
    let ok = 0, failed = 0, existing = 0, i2vskip = 0;
    for (const l of lines) { try { const r = JSON.parse(l);
      if (r.status === "ok") ok++; else if (r.status === "failed") failed++;
      else if (r.status === "skipped-existing") existing++; else i2vskip++;
    } catch {} }
    console.log(`ok=${ok} failed=${failed} existing=${existing} i2vskip=${i2vskip}`);
  ' "$mf" 2>/dev/null || echo "ok=? failed=? existing=? i2vskip=?"
}

# --- main loop -----------------------------------------------------------------
TYPES=("${ALL_GROUPS[@]}")
if [ "${#ONLY[@]}" -gt 0 ]; then
  TYPES=()
  for g in "${ALL_GROUPS[@]}"; do for w in "${ONLY[@]}"; do [ "$g" = "$w" ] && TYPES+=("$g"); done; done
  [ "${#TYPES[@]}" -gt 0 ] || die sweep "--only matched no valid group"
fi
if [ "${#SKIP[@]}" -gt 0 ]; then
  KEPT=()
  for g in "${TYPES[@]}"; do
    keep=1
    for s in "${SKIP[@]}"; do [ "$g" = "$s" ] && keep=0; done
    [ "$keep" = 1 ] && KEPT+=("$g")
  done
  TYPES=("${KEPT[@]}")
fi

[ "$DRY_RUN" = 1 ] || mkdir -p "$OUT_ROOT"
[ -f "$GENERATOR" ] || die sweep "generate.mjs not found next to this script: $GENERATOR"

log sweep "host=$SSH_HOST out=$OUT_ROOT probe=$PROBE_URL resume=$RESUME dry=$DRY_RUN keep=$KEEP_RUNNING types=${TYPES[*]}"
RESULTS=()
FAILED_TYPES=()
for g in "${TYPES[@]}"; do
  marker="$OUT_ROOT/$g/.sweep-complete"
  if [ "$RESUME" = 1 ] && [ -f "$marker" ]; then
    log "$g" "resume: marker $marker exists — skipping"
    RESULTS+=("$g|resumed|$(manifest_tally "$g")")
    continue
  fi
  CURRENT_GROUP="$g"
  CURRENT_PID=""
  REMOTE_LOG=""
  # Snapshot the current /v1/models listing BEFORE launching so wait_ready
  # can detect a single-model proxy swapping in the new model (mode 2).
  # Dry-run: zero network, zero writes.
  if [ "$DRY_RUN" = 0 ]; then
    PRE_SNORM=$(curl -sf --max-time 5 "$PROBE_URL/v1/models" 2>/dev/null | tr -d ' \n' || true)
  else
    PRE_SNORM=""
  fi
  if ! launch_model "$g"; then
    RESULTS+=("$g|start-failed|")
    [ "$FAIL_FAST" = 1 ] && die "$g" "start failed (fail-fast)"
    continue
  fi
  [ "$DRY_RUN" = 1 ] || CURRENT_PID="$LAUNCH_PID" # ctrl-C now stops this group
  if ! wait_ready "$g"; then
    stop_model "$g"
    RESULTS+=("$g|not-ready|")
    [ "$FAIL_FAST" = 1 ] && die "$g" "never became ready (fail-fast)"
    continue
  fi
  if ! generate_all "$g"; then
    log "$g" "generate reported failures (exit != 0) — recording, stopping model"
    stop_model "$g"
    CURRENT_PID=""
    FAILED_TYPES+=("$g")
    RESULTS+=("$g|generate-failed|$(manifest_tally "$g")")
    [ "$FAIL_FAST" = 1 ] && die "$g" "generate failed (fail-fast)"
    continue
  fi
  stop_model "$g"
  CURRENT_PID=""
  tally=$(manifest_tally "$g")
  case "$tally" in
  *i2vskip=0*)
    [ "$DRY_RUN" = 1 ] || {
      mkdir -p "$OUT_ROOT/$g"
      date -Is >"$marker"
    }
    RESULTS+=("$g|done|$tally")
    ;;
  *)
    # Every remaining video task was i2v-skipped for a missing source
    # still: the group is NOT complete, so no .sweep-complete marker —
    # --resume will re-attempt it after the image groups have run.
    log "$g" "incomplete: i2v entries skipped for missing source stills — marker NOT written; finish image groups then re-run with --resume"
    RESULTS+=("$g|partial-i2v|$tally")
    ;;
  esac
done

log sweep "==== summary ===="
printf '%-10s %-16s %s\n' GROUP RESULT MANIFEST-TALLY
for r in "${RESULTS[@]}"; do
  IFS='|' read -r g res tally <<<"$r"
  printf '%-10s %-16s %s\n' "$g" "$res" "$tally"
done
[ "${#FAILED_TYPES[@]}" -eq 0 ] || {
  log sweep "failed types: ${FAILED_TYPES[*]} (see $OUT_ROOT/<group>/manifest.jsonl)"
  exit 1
}
log sweep "sweep complete"
