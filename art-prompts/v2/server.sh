#!/usr/bin/env bash
# =============================================================================
# server.sh — the ONLY way agents touch skynet2's image/video SGLang servers.
#
# Runbook: docs/dev/art-generation-server.md. Layout (owner decision 2026-10-16):
#   GPUs 0,1  :30000  the main LLM (/root/run_sglang_qwenflashnext9b.sh) — never
#                     started, stopped or signalled by this script
#   GPUs 2,3  :30001  ONE image/video model at a time, started from the unchanged
#                     /root/run_sglang_images_<name>-1.sh scripts (pinned to 2,3, :30001)
#
# USAGE
#   server.sh status                     LLM port / pgid / GPUs, what holds cards 2,3,
#                                        what is on :30001, free disk, weight cache
#   server.sh start <name> [--dry-run]   preflight (cards 2,3 free, :30001 free, disk,
#                                        the script's flags), then nohup setsid the
#                                        script with a timestamped log in /root/;
#                                        prints PGID=<n> and LOG=<path>
#   server.sh wait <name> [timeout-s] [--pgid N]
#                                        poll /health until 200 while the launcher lives
#                                        (default timeout 10800 s: a first start downloads
#                                        the weights), then check /v1/models
#   server.sh stop <name> [--pgid N] [--dry-run]
#                                        the safe stop: the launcher is found by port
#                                        30001 (or --pgid for one still loading), refused
#                                        unless its cmdline has the expected --model-path
#                                        and its group is not the LLM's; INT → TERM group
#                                        → KILL group; reports survivors, then verifies
#   server.sh verify [--deep]            LLM health 200 and not restarted, :30001 empty,
#                                        cards 2,3 memory freed (--deep: /health_generate)
#   server.sh names                      the name → script → model table
#
#   Options for start/verify: --free-gpu-mib N (a card counts as free below N MiB with no
#   processes; default 1024), --min-free-gb N (start; default 150).
#
# NAMES  flux1dev flux2dev qwenimage stablediffusion35large ltxvideo ltx25 wan22
#        (aliases = generate.mjs group keys: flux1 flux2 qwen qwenvl sd35)
#
# EXIT   0 ok · 1 failed (launcher died, survivors, verify failed, ssh error)
#        2 usage · 3 refused by a safety check · 124 wait timed out
#
# SAFETY RULES (skynet2 notes, 2026-10-16) — do not weaken them:
#   * never pkill / killall / `sglang killall`, never select processes by name or GPU;
#     the target is the listener on :30001 (or an explicit --pgid), confirmed by the
#     expected --model-path in its cmdline (or an ancestor's in the same group);
#   * refuse when the target group is the LLM's (the pgid of whatever owns :30000, or of
#     any process started with --port 30000), the script's own, or <= 1; every check is
#     repeated on the box right before each signal;
#   * never read or print the run scripts (the HF token is inline) or /proc/*/environ;
#     only `grep -o` of the --model-path / --port / CUDA_VISIBLE_DEVICES flags, and every
#     printed log or cmdline line is passed through a redaction filter.
#
# ENVIRONMENT
#   SERVER_SH_HOST         ssh target (default root@skynet2)
#   SERVER_SH_PUBLIC_HOST  host the generation clients use (default skynet2.interserver.net)
#   SERVER_SH_STATE_DIR    local state: the LLM baseline, the last launch per name
#                          (default ${XDG_STATE_HOME:-~/.local/state}/shmup-art-server)
#   SERVER_SH_REMOTE       TESTS ONLY: run the remote scripts with this command instead of
#                          ssh (e.g. "bash -c" with fake ss/ps/nvidia-smi on PATH)
#   SERVER_SH_REMOTE_DIR   where the run scripts and logs live on the box (default /root;
#                          sweep-models.sh passes its REMOTE_SCRIPT_DIR, the tests a fixture dir)
#   SERVER_SH_POLL         seconds between wait polls (default 15)
#
# Offline tests: bash art-prompts/v2/server.test.sh (fake ss/ps/nvidia-smi/curl/kill).
# =============================================================================
set -euo pipefail

SSH_TARGET="${SERVER_SH_HOST:-root@skynet2}"
PUBLIC_HOST="${SERVER_SH_PUBLIC_HOST:-skynet2.interserver.net}"
REMOTE_DIR="${SERVER_SH_REMOTE_DIR:-/root}"
STATE_DIR="${SERVER_SH_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/shmup-art-server}"
POLL="${SERVER_SH_POLL:-15}"
LLM_PORT=30000
IMAGE_PORT=30001
IMAGE_GPUS="2 3"
FREE_GPU_MIB=1024
MIN_FREE_GB=150
WAIT_DEFAULT=10800
NAMES="flux1dev flux2dev qwenimage stablediffusion35large ltxvideo ltx25 wan22"

die_usage() {
  echo "error: $*" >&2
  echo "run 'server.sh help' for usage" >&2
  exit 2
}

usage() { sed -n '/^# USAGE$/,/^# ENVIRONMENT$/p' "${BASH_SOURCE[0]}" | sed '$d; s/^# \{0,1\}//'; }

# name → "canonical|model path|kind|reference support"
name_row() {
  case "$1" in
  flux1dev | flux1) echo "flux1dev|black-forest-labs/FLUX.1-dev|image|text-to-image only" ;;
  flux2dev | flux2) echo "flux2dev|black-forest-labs/FLUX.2-dev|image|text-to-image + edits with one or more reference images" ;;
  qwenimage | qwen | qwenvl) echo "qwenimage|Qwen/Qwen-Image|image|text-to-image only" ;;
  stablediffusion35large | sd35) echo "stablediffusion35large|stabilityai/stable-diffusion-3.5-large|image|text-to-image only" ;;
  ltxvideo) echo "ltxvideo|Lightricks/LTX-Video|video|text-to-video + a start image (i2v)" ;;
  ltx25) echo "ltx25|Lightricks/LTX-2.5-Diffusers|video|text-to-video + a start image (i2v)" ;;
  wan22) echo "wan22|Wan-AI/Wan2.2-T2V-A14B-Diffusers|video|text-to-video only (the I2V weights are not installed)" ;;
  *) return 1 ;;
  esac
}

# Sets NAME, MODEL, SCRIPT from a name or alias.
resolve_name() {
  local row
  [ -n "${1:-}" ] || die_usage "missing <name> (one of: $NAMES)"
  row=$(name_row "$1") || die_usage "unknown name \"$1\" (one of: $NAMES; aliases flux1 flux2 qwen qwenvl sd35)"
  NAME=${row%%|*}
  row=${row#*|}
  MODEL=${row%%|*}
  SCRIPT="run_sglang_images_${NAME}-1.sh"
}

is_uint() { case "${1:-}" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }

# -----------------------------------------------------------------------------
# Remote scripts. Everything that looks at or signals processes runs ON THE BOX in
# one bash script per command, so the checks and the signals see the same state.
# -----------------------------------------------------------------------------

remote_lib() {
  cat <<'LIB'
export LC_ALL=C
refresh() {
  PS_SNAP=$(ps -e -ww -o pid=,ppid=,pgid=,etimes=,args= 2>/dev/null)
  SS_SNAP=$(ss -ltnpH 2>/dev/null)
}
gpu_refresh() {
  GPUS=$(nvidia-smi --query-gpu=index,uuid,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null)
  APPS=$(nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null)
}
redact() { sed -E 's/hf_[A-Za-z0-9]{8,}/hf_***/g; s/(--(api-key|admin-api-key|hf-token|token)[= ])[^ ]+/\1***/g'; }
short() { printf '%s\n' "$1" | cut -c1-"${2:-110}" | redact; }
dur() { printf '%dh%02dm%02ds' $(($1 / 3600)) $(($1 % 3600 / 60)) $(($1 % 60)); }
# pids listening on TCP port $1 (exact port match on the local address)
listen_pids() {
  printf '%s\n' "$SS_SNAP" | awk -v p="$1" '{ n = split($4, a, ":"); if (a[n] == p) print }' |
    grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -un
}
pfield() { [ -n "$1" ] && printf '%s\n' "$PS_SNAP" | awk -v p="$1" -v f="$2" '$1 == p { print $f; exit }'; }
pargs() {
  [ -n "$1" ] && printf '%s\n' "$PS_SNAP" | awk -v p="$1" '$1 == p {
    sub(/^[ \t]*[0-9]+[ \t]+[0-9]+[ \t]+[0-9]+[ \t]+[0-9]+[ \t]*/, ""); print; exit }'
}
members() { printf '%s\n' "$PS_SNAP" | awk -v g="$1" '$3 == g { print $1 }'; }
has_model() { case " $1 " in *" --model-path $2 "* | *" --model-path=$2 "*) return 0 ;; esac; return 1; }
arg_value() { printf '%s\n' "$1" | awk -v k="$2" '{ for (i = 1; i < NF; i++) if ($i == k) { print $(i + 1); exit } }'; }
# word 1 or 2 of a cmdline is a run_sglang_images_*-1.sh script → its name
script_name() {
  printf '%s\n' "$1" | awk '{ for (i = 1; i <= 2 && i <= NF; i++) if ($i ~ /(^|\/)run_sglang_images_[a-z0-9]+-1\.sh$/) {
    s = $i; sub(/.*run_sglang_images_/, "", s); sub(/-1\.sh$/, "", s); print s; exit } }'
}
hcode() {
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time "${2:-5}" "http://127.0.0.1:$1${3:-/health}" 2>/dev/null)
  printf '%s' "${c:-000}"
}
# process groups that must never be signalled: the LLM's and this script's own
protected_pgids() {
  {
    for p in $(listen_pids "$LLM_PORT"); do pfield "$p" 3; done
    printf '%s\n' "$PS_SNAP" | awk -v port="$LLM_PORT" '{
      for (i = 5; i <= NF; i++) if (($i == "--port" && $(i + 1) == port) || $i == ("--port=" port)) { print $3; next } }'
    pfield "$$" 3
  } | grep -E '^[0-9]+$' | sort -un
}
is_protected() { printf '%s\n' "$PROT" | grep -qx "$1"; }
# the LLM: the :30000 listener that names a --model-path, else the first one
llm_pid() {
  local p first=""
  for p in $(listen_pids "$LLM_PORT"); do
    [ -n "$first" ] || first=$p
    case " $(pargs "$p") " in *" --model-path"*) echo "$p"; return ;; esac
  done
  [ -n "$first" ] && echo "$first"
}
# image/video launcher groups: led by (or containing) a run_sglang_images_*-1.sh script,
# or holding :30001 — identification only, never used to pick a kill target
image_groups() {
  {
    printf '%s\n' "$PS_SNAP" | awk '{ for (i = 5; i <= 6 && i <= NF; i++) if ($i ~ /(^|\/)run_sglang_images_[a-z0-9]+-1\.sh$/) { print $3; next } }'
    for p in $(listen_pids "$IMAGE_PORT"); do pfield "$p" 3; done
  } | grep -E '^[0-9]+$' | sort -un | while read -r g; do is_protected "$g" || echo "$g"; done
}
group_label() {
  local p a n m
  for p in $(members "$1"); do
    a=$(pargs "$p")
    n=$(script_name "$a")
    [ -n "$n" ] && { echo "$n"; return; }
  done
  for p in $(members "$1"); do
    m=$(arg_value "$(pargs "$p")" --model-path)
    [ -n "$m" ] && { echo "model $m"; return; }
  done
  echo "unknown"
}
group_age() { # the oldest member's elapsed seconds
  printf '%s\n' "$PS_SNAP" | awk -v g="$1" '$3 == g && $4 > m { m = $4 } END { print m + 0 }'
}
describe_group() {
  local g=$1 p
  echo "  process group $g ($(group_label "$g"), up $(dur "$(group_age "$g")")):"
  for p in $(members "$g"); do echo "    pid $p  $(short "$(pargs "$p")" 100)"; done
}
gpu_uuid() { printf '%s\n' "$GPUS" | awk -F', *' -v i="$1" '$1 == i { print $2 }'; }
gpu_used() { printf '%s\n' "$GPUS" | awk -F', *' -v i="$1" '$1 == i { print $3 }'; }
gpu_total() { printf '%s\n' "$GPUS" | awk -F', *' -v i="$1" '$1 == i { print $4 }'; }
gpu_app_pids() { local u; u=$(gpu_uuid "$1"); [ -n "$u" ] && printf '%s\n' "$APPS" | awk -F', *' -v u="$u" '$1 == u { print $2 }'; }
gpu_holders() { # "LLM (pgid N)" / "flux2dev (pgid N)" / "pid N (not in ps)"
  local p g out=""
  for p in $(gpu_app_pids "$1"); do
    g=$(pfield "$p" 3)
    if [ -z "$g" ]; then out="$out|pid $p (not in ps)"
    elif is_protected "$g"; then out="$out|LLM (pgid $g)"
    else out="$out|$(group_label "$g") (pgid $g)"; fi
  done
  printf '%s\n' "${out#|}" | tr '|' '\n' | awk 'NF && !seen[$0]++' | paste -sd ',' - | sed 's/,/, /g'
}
gpus_of_group() { # comma list of GPU indices that hold a process of group $1
  local i p out=""
  for i in $(printf '%s\n' "$GPUS" | awk -F', *' 'NF { print $1 }'); do
    for p in $(gpu_app_pids "$i"); do
      [ "$(pfield "$p" 3)" = "$1" ] && { out="$out,$i"; break; }
    done
  done
  printf '%s' "${out#,}"
}
disk_gb() { df -BG --output=avail "$REMOTE_DIR" 2>/dev/null | tail -n 1 | tr -dc '0-9'; }
llm_line() {
  local p g e a m
  p=$(llm_pid)
  if [ -z "$p" ]; then
    echo "LLM      :$LLM_PORT — NOTHING LISTENS (the LLM is down or still starting; health $(hcode "$LLM_PORT"))"
    return 1
  fi
  g=$(pfield "$p" 3); e=$(pfield "$p" 4); a=$(pargs "$p"); m=$(arg_value "$a" --model-path)
  echo "LLM      :$LLM_PORT pid $p pgid $g up $(dur "$e") model ${m:-?} GPUs $(gpus_of_group "$g") health $(hcode "$LLM_PORT")"
  [ -n "$(pargs "$g")" ] && echo "         group leader: $(short "$(pargs "$g")" 90)"
  echo "LLM_BASELINE=$p:$(($(date +%s) - e))"
  return 0
}
card_problems() { # prints one line per reason cards IMAGE_GPUS are not free
  local i h u
  for i in $IMAGE_GPUS; do
    if [ -z "$(gpu_uuid "$i")" ]; then echo "GPU $i is not reported by nvidia-smi"; continue; fi
    h=$(gpu_holders "$i"); u=$(gpu_used "$i")
    if [ -n "$h" ]; then echo "GPU $i is held by $h ($u MiB)"; continue; fi
    case "$u" in
    '' | *[!0-9]*) echo "GPU $i reports memory.used '$u'" ;;
    *) [ "$u" -lt "$FREE_GPU_MIB" ] || echo "GPU $i has $u MiB in use with no compute process (threshold $FREE_GPU_MIB MiB)" ;;
    esac
  done
  return 0
}
LIB
}

op_status() {
  cat <<'OP'
refresh; gpu_refresh; PROT=$(protected_pgids)
echo "== skynet2 $(date '+%F %T %Z')"
llm_line || true
for i in $(printf '%s\n' "$GPUS" | awk -F', *' 'NF { print $1 }'); do
  h=$(gpu_holders "$i"); [ -n "$h" ] || h="no compute processes"
  echo "GPU $i    $(gpu_used "$i")/$(gpu_total "$i") MiB  $h"
done
lis=$(listen_pids "$IMAGE_PORT")
if [ -n "$lis" ]; then
  for p in $lis; do
    echo ":$IMAGE_PORT   pid $p pgid $(pfield "$p" 3) model $(arg_value "$(pargs "$p")" --model-path) health $(hcode "$IMAGE_PORT")"
  done
else
  echo ":$IMAGE_PORT   nothing listens (health $(hcode "$IMAGE_PORT"))"
fi
groups=$(image_groups)
if [ -n "$groups" ]; then
  echo "image/video launchers on cards ${IMAGE_GPUS// /,}:"
  for g in $groups; do describe_group "$g"; done
  [ -z "$lis" ] && echo "  (not bound to :$IMAGE_PORT yet — loading, or downloading its weights on a first start)"
fi
echo "disk     $(disk_gb) GB free on $REMOTE_DIR (start needs >= $MIN_FREE_GB GB)"
hub="$REMOTE_DIR/.cache/huggingface/hub"
for row in $NAME_TABLE; do
  n=${row%%=*}; m=${row#*=}
  d="$hub/models--$(printf '%s' "$m" | sed 's#/#--#')"
  s=$( [ -d "$d" ] && timeout 60 du -shL "$d" 2>/dev/null | cut -f1)
  echo "cache    $n: ${s:-none}  ($m)"
done
probs=$(card_problems)
if [ -z "$probs" ] && [ -z "$lis" ] && [ -z "$groups" ]; then
  echo "verdict  cards ${IMAGE_GPUS// /,} and :$IMAGE_PORT are free — 'server.sh start <name>' may run"
else
  echo "verdict  cards ${IMAGE_GPUS// /,} / :$IMAGE_PORT are busy — 'start' is refused until 'stop' frees them"
fi
OP
}

op_start() {
  cat <<'OP'
refresh; gpu_refresh; PROT=$(protected_pgids)
bad=0
refuse() { echo "REFUSED: $*"; bad=1; }
script="$REMOTE_DIR/$SCRIPT"
llm_line || echo "warning: the LLM is not on :$LLM_PORT — starting an image model is still allowed when cards ${IMAGE_GPUS// /,} are free"
if [ ! -f "$script" ]; then
  refuse "$script does not exist"
else
  mp=$(grep -o -E -e '--model-path[= ][^ ]+' "$script" | sed 's/=/ /' | sort -u | paste -sd ' ' -)
  ports=$(grep -o -E -e '--port[= ][0-9]+' "$script" | sed 's/=/ /' | sort -u | paste -sd ' ' -)
  cvd=$(grep -o -E 'CUDA_VISIBLE_DEVICES=[0-9,]+' "$script" | sort -u | paste -sd ' ' -)
  [ "$mp" = "--model-path $MODEL" ] || refuse "$SCRIPT has '${mp:-no --model-path}', expected '--model-path $MODEL'"
  [ "$ports" = "--port $IMAGE_PORT" ] || refuse "$SCRIPT binds '${ports:-no --port}', expected only '--port $IMAGE_PORT'"
  [ "$cvd" = "CUDA_VISIBLE_DEVICES=${IMAGE_GPUS// /,}" ] || refuse "$SCRIPT pins '${cvd:-no CUDA_VISIBLE_DEVICES}', expected 'CUDA_VISIBLE_DEVICES=${IMAGE_GPUS// /,}'"
fi
for p in $(listen_pids "$IMAGE_PORT"); do
  refuse ":$IMAGE_PORT is held by pid $p (pgid $(pfield "$p" 3)): $(short "$(pargs "$p")" 90)"
done
for g in $(image_groups); do
  refuse "an image/video launcher already runs — process group $g ($(group_label "$g"), up $(dur "$(group_age "$g")")); stop it first"
done
while read -r line; do [ -n "$line" ] && refuse "$line"; done <<EOF_CARDS
$(card_problems)
EOF_CARDS
free=$(disk_gb)
if [ -z "$free" ]; then refuse "could not read the free disk space of $REMOTE_DIR"
elif [ "$free" -lt "$MIN_FREE_GB" ]; then refuse "only $free GB free on $REMOTE_DIR (need >= $MIN_FREE_GB GB: a first start downloads the weights)"
else echo "disk     $free GB free on $REMOTE_DIR"; fi
[ "$bad" = 0 ] || { echo "start of $NAME refused — nothing was started"; exit 3; }
log="$REMOTE_DIR/sglang_${NAME}_$(date +%Y%m%dT%H%M%S).log"
if [ "$DRY" = 1 ]; then
  echo "preflight ok. DRY RUN — would run on the box:"
  echo "  cd $REMOTE_DIR && nohup setsid bash $script >$log 2>&1 </dev/null &"
  exit 0
fi
cd "$REMOTE_DIR" || exit 1
nohup setsid bash "$script" >"$log" 2>&1 </dev/null &
pid=$!
sleep 2
refresh
pg=$(pfield "$pid" 3)
if [ -z "$pg" ]; then
  echo "FAILED: the launcher (pid $pid) exited at once — log tail:"
  tail -n 30 "$log" 2>/dev/null | cut -c1-200 | redact
  exit 1
fi
[ "$pg" = "$pid" ] || echo "warning: launcher pid $pid is in process group $pg, not its own"
echo "started $NAME: pid $pid, process group $pg, log $log"
echo "PGID=$pg"
echo "LOG=$log"
OP
}

op_stop() {
  cat <<'OP'
refresh; gpu_refresh; PROT=$(protected_pgids)
refuse() { echo "REFUSED: $*"; echo "nothing was signalled"; exit 3; }
llm_line || echo "warning: nothing listens on :$LLM_PORT — the LLM is down or restarting; protected groups: ${PROT//$'\n'/ }"
lis=$(listen_pids "$IMAGE_PORT")
launcher=""
pg=""
if [ -n "$lis" ]; then
  # 1. the launcher: a :30001 listener, or its nearest ancestor in the same process group,
  #    whose cmdline names the expected --model-path
  for p in $lis; do
    q=$p
    for _ in 1 2 3 4 5; do
      [ -n "$q" ] || break
      if has_model "$(pargs "$q")" "$MODEL"; then launcher=$q; break 2; fi
      up=$(pfield "$q" 2)
      if [ -z "$up" ] || [ "$(pfield "$up" 3)" != "$(pfield "$p" 3)" ]; then break; fi
      q=$up
    done
  done
  if [ -z "$launcher" ]; then
    for p in $lis; do echo "  :$IMAGE_PORT pid $p pgid $(pfield "$p" 3): $(short "$(pargs "$p")" 100)"; done
    refuse ":$IMAGE_PORT is held, but no listener (or its parent in the same group) runs --model-path $MODEL — that is not $NAME"
  fi
  pg=$(pfield "$launcher" 3)
  for p in $lis; do
    [ "$(pfield "$p" 3)" = "$pg" ] || refuse "the listeners on :$IMAGE_PORT belong to several process groups — stop them by hand"
  done
  [ -z "$PGID_ARG" ] || [ "$PGID_ARG" = "$pg" ] || refuse "--pgid $PGID_ARG does not own :$IMAGE_PORT (process group $pg does)"
elif [ -n "$PGID_ARG" ]; then
  pg=$PGID_ARG
  if [ -z "$(members "$pg")" ]; then echo "nothing to stop: process group $pg has no processes"; exit 0; fi
  for p in $(members "$pg"); do has_model "$(pargs "$p")" "$MODEL" && { launcher=$p; break; }; done
else
  groups=$(image_groups)
  if [ -n "$groups" ]; then
    echo "nothing listens on :$IMAGE_PORT, but a launcher is still loading:"
    for g in $groups; do describe_group "$g"; done
    refuse "a launcher that has not bound :$IMAGE_PORT is stopped only by an explicit 'server.sh stop $NAME --pgid <pgid>'"
  fi
  echo "nothing to stop: :$IMAGE_PORT is free and no image/video launcher runs"
  exit 0
fi
# 2. the process group: a real one, not the LLM's, led by the expected script or process
case "$pg" in '' | *[!0-9]*) refuse "could not read the target's process group" ;; esac
[ "$pg" -gt 1 ] || refuse "process group $pg is <= 1"
is_protected "$pg" && refuse "process group $pg is protected (the LLM's or this script's; protected: ${PROT//$'\n'/ })"
leader=$(pargs "$pg")
if [ -n "$leader" ]; then
  [ "$(script_name "$leader")" = "$NAME" ] || has_model "$leader" "$MODEL" ||
    refuse "process group $pg is led by '$(short "$leader" 90)', not $SCRIPT — stop it by hand"
elif [ -z "$launcher" ]; then
  refuse "process group $pg shows neither $SCRIPT nor --model-path $MODEL"
fi
echo "target   $NAME ($MODEL):"
describe_group "$pg"
if [ -n "$launcher" ]; then
  echo "plan     kill -INT $launcher (wait <= 45 s) -> kill -TERM -- -$pg (<= 10 s) -> kill -KILL -- -$pg"
else
  echo "plan     (no process names --model-path $MODEL yet) kill -TERM -- -$pg (<= 10 s) -> kill -KILL -- -$pg"
fi
if [ "$DRY" = 1 ]; then echo "DRY RUN — nothing was signalled"; exit 0; fi
recheck() { # repeated before every group signal: the group must still be safe to signal
  refresh; PROT=$(protected_pgids)
  if is_protected "$pg"; then echo "ABORT: process group $pg is now protected — nothing more is signalled"; exit 3; fi
}
if [ -n "$launcher" ]; then
  recheck
  has_model "$(pargs "$launcher")" "$MODEL" || [ -z "$(pfield "$launcher" 1)" ] ||
    { echo "ABORT: pid $launcher no longer runs --model-path $MODEL"; exit 3; }
  echo "kill -INT $launcher"
  kill -INT "$launcher" 2>/dev/null
  for _ in $(seq 1 45); do kill -0 "$launcher" 2>/dev/null || break; sleep 1; done
fi
refresh
if [ -n "$(members "$pg")" ]; then
  recheck
  echo "kill -TERM -- -$pg"
  kill -TERM -- "-$pg" 2>/dev/null
  for _ in $(seq 1 10); do refresh; [ -z "$(members "$pg")" ] && break; sleep 1; done
fi
if [ -n "$(members "$pg")" ]; then
  recheck
  echo "kill -KILL -- -$pg"
  kill -KILL -- "-$pg" 2>/dev/null
  for _ in 1 2 3 4 5; do refresh; [ -z "$(members "$pg")" ] && break; sleep 1; done
fi
refresh
if [ -n "$(members "$pg")" ]; then
  echo "SURVIVORS in process group $pg:"
  for p in $(members "$pg"); do echo "    pid $p  $(short "$(pargs "$p")" 100)"; done
  exit 1
fi
for _ in $(seq 1 30); do # the driver releases the cards a moment after the processes exit
  gpu_refresh; refresh; PROT=$(protected_pgids)
  [ -z "$(card_problems)" ] && break
  sleep 1
done
for p in $(listen_pids "$IMAGE_PORT"); do
  echo "WARNING: :$IMAGE_PORT is held again, by pid $p (pgid $(pfield "$p" 3))"; exit 1
done
echo "stopped  $NAME: process group $pg is gone and :$IMAGE_PORT is free"
OP
}

op_verify() {
  cat <<'OP'
refresh; gpu_refresh; PROT=$(protected_pgids)
bad=0
ok() { echo "ok    $*"; }
nok() { echo "FAIL  $*"; bad=1; }
now=$(date +%s)
p=$(llm_pid)
if [ -z "$p" ]; then
  nok "nothing listens on :$LLM_PORT (the LLM)"
else
  c=$(hcode "$LLM_PORT")
  if [ "$c" = 200 ]; then ok "LLM :$LLM_PORT health 200"; else nok "LLM :$LLM_PORT health $c"; fi
  e=$(pfield "$p" 4); st=$((now - e)); g=$(pfield "$p" 3)
  if [ -n "$BASE_PID" ]; then
    if [ "$p" = "$BASE_PID" ] && [ $((st - BASE_START)) -le 5 ] && [ $((BASE_START - st)) -le 5 ]; then
      ok "LLM launcher pid $p (pgid $g) up $(dur "$e") — not restarted since the baseline"
    else
      nok "LLM launcher changed: baseline pid $BASE_PID (started $BASE_START), now pid $p (started $st, up $(dur "$e")) — the LLM was restarted"
    fi
  else
    ok "LLM launcher pid $p (pgid $g) up $(dur "$e") (no baseline recorded — check that this is not a fresh restart)"
  fi
  if [ "$DEEP" = 1 ]; then
    c=$(hcode "$LLM_PORT" 120 /health_generate)
    if [ "$c" = 200 ]; then ok "LLM /health_generate 200"; else nok "LLM /health_generate $c"; fi
  fi
fi
lis=$(listen_pids "$IMAGE_PORT")
if [ -n "$lis" ]; then
  for q in $lis; do nok ":$IMAGE_PORT is held by pid $q (pgid $(pfield "$q" 3)): $(short "$(pargs "$q")" 80)"; done
else
  ok ":$IMAGE_PORT is empty"
fi
for g in $(image_groups); do nok "launcher still running: process group $g ($(group_label "$g"), up $(dur "$(group_age "$g")"))"; done
probs=$(card_problems)
if [ -n "$probs" ]; then
  while read -r line; do [ -n "$line" ] && nok "$line"; done <<EOF_CARDS
$probs
EOF_CARDS
else
  for i in $IMAGE_GPUS; do ok "GPU $i freed ($(gpu_used "$i") MiB used, no compute processes)"; done
fi
if [ "$bad" = 0 ]; then echo "VERIFY OK"; else echo "VERIFY FAILED"; exit 1; fi
OP
}

op_probe() {
  cat <<'OP'
refresh; PROT=$(protected_pgids)
g=$PGID_ARG
if [ -z "$g" ]; then # the youngest group running this name's script
  g=$(for x in $(image_groups); do [ "$(group_label "$x")" = "$NAME" ] && echo "$(group_age "$x") $x"; done | sort -n | head -n 1 | cut -d' ' -f2)
fi
alive=0
[ -n "$g" ] && [ -n "$(members "$g")" ] && alive=1
log=$LOG_HINT
# shellcheck disable=SC2012 # our own log names: no odd characters
[ -n "$log" ] || log=$(ls -t "$REMOTE_DIR"/sglang_"$NAME"_*.log 2>/dev/null | head -n 1)
last=""
[ -n "$log" ] && [ -f "$log" ] && last=$(tail -n 1 "$log" 2>/dev/null | tr -d '\r' | cut -c1-160 | redact)
echo "PROBE alive=$alive pgid=${g:-none} health=$(hcode "$IMAGE_PORT") disk=$(disk_gb)"
echo "LAST $last"
if [ "$alive" = 0 ] && [ -n "$log" ] && [ -f "$log" ]; then
  echo "TAIL $log"
  tail -n 30 "$log" 2>/dev/null | cut -c1-200 | redact
fi
OP
}

op_models() {
  cat <<'OP'
curl -s --max-time 10 "http://127.0.0.1:$IMAGE_PORT/v1/models" 2>/dev/null | head -c 4000
echo
OP
}

remote_script() {
  local table="" n row
  for n in $NAMES; do
    row=$(name_row "$n")
    row=${row#*|}
    table="$table $n=${row%%|*}"
  done
  printf 'LLM_PORT=%q IMAGE_PORT=%q IMAGE_GPUS=%q REMOTE_DIR=%q\n' "$LLM_PORT" "$IMAGE_PORT" "$IMAGE_GPUS" "$REMOTE_DIR"
  printf 'FREE_GPU_MIB=%q MIN_FREE_GB=%q NAME_TABLE=%q\n' "$FREE_GPU_MIB" "$MIN_FREE_GB" "${table# }"
  printf 'NAME=%q SCRIPT=%q MODEL=%q PGID_ARG=%q DRY=%q\n' "${NAME:-}" "${SCRIPT:-}" "${MODEL:-}" "${PGID_ARG:-}" "${DRY:-0}"
  printf 'BASE_PID=%q BASE_START=%q DEEP=%q LOG_HINT=%q\n' "${BASE_PID:-}" "${BASE_START:-}" "${DEEP:-0}" "${LOG_HINT:-}"
  remote_lib
  "op_$1"
}

# Runs remote op $1 on the box; stdout is the op's report, the exit status its result.
run_remote() {
  local script
  script=$(remote_script "$1")
  if [ -n "${SERVER_SH_REMOTE:-}" ]; then
    # shellcheck disable=SC2086 # tests pass a command with arguments, e.g. "bash -c"
    $SERVER_SH_REMOTE "$script"
  else
    ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 "$SSH_TARGET" "bash -c $(printf '%q' "$script")"
  fi
}

# Runs an op, prints its report, and remembers the machine lines it emits.
run_op() {
  local out rc=0
  out=$(run_remote "$1") || rc=$?
  printf '%s\n' "$out" | grep -v -E '^(LLM_BASELINE|PGID|LOG)=' || true
  if [ "$rc" = 255 ] && [ -z "${SERVER_SH_REMOTE:-}" ]; then echo "error: ssh to $SSH_TARGET failed" >&2; fi
  OP_BASELINE=$(printf '%s\n' "$out" | sed -n 's/^LLM_BASELINE=//p' | tail -n 1)
  OP_PGID=$(printf '%s\n' "$out" | sed -n 's/^PGID=//p' | tail -n 1)
  OP_LOG=$(printf '%s\n' "$out" | sed -n 's/^LOG=//p' | tail -n 1)
  return "$rc"
}

save_baseline() {
  [ -n "${OP_BASELINE:-}" ] || return 0
  mkdir -p "$STATE_DIR"
  printf '%s %s\n' "${OP_BASELINE%%:*}" "${OP_BASELINE#*:}" >"$STATE_DIR/llm.baseline"
}

load_baseline() {
  BASE_PID=""
  BASE_START=""
  [ -f "$STATE_DIR/llm.baseline" ] || return 0
  read -r BASE_PID BASE_START <"$STATE_DIR/llm.baseline" || true
  if ! is_uint "$BASE_PID" || ! is_uint "$BASE_START"; then BASE_PID=""; BASE_START=""; fi
}

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

cmd_names() {
  local n row
  printf '%-24s %-48s %-40s %-6s %s\n' NAME SCRIPT "MODEL PATH" KIND "REFERENCE / EDIT SUPPORT"
  for n in $NAMES; do
    row=$(name_row "$n")
    IFS='|' read -r _ m k ref <<<"$row"
    printf '%-24s %-48s %-40s %-6s %s\n' "$n" "run_sglang_images_${n}-1.sh" "$m" "$k" "$ref"
  done
  echo "all: CUDA_VISIBLE_DEVICES=2,3, --port 30001, one at a time; the LLM is :30000 on GPUs 0,1"
}

cmd_status() { run_op status; }

cmd_start() {
  run_op start || return $?
  [ "${DRY:-0}" = 1 ] && return 0
  save_baseline
  if [ -n "$OP_PGID" ]; then
    mkdir -p "$STATE_DIR"
    printf '%s %s\n' "$OP_PGID" "$OP_LOG" >"$STATE_DIR/$NAME.launch"
    echo "PGID=$OP_PGID"
    echo "next: server.sh wait $NAME   (then generate, then: server.sh stop $NAME)"
  fi
}

cmd_verify() {
  load_baseline
  run_op verify
}

cmd_stop() {
  local rc=0
  run_op stop || rc=$?
  [ "${DRY:-0}" = 1 ] && return "$rc"
  save_baseline
  [ "$rc" = 0 ] || return "$rc"
  rm -f "$STATE_DIR/$NAME.launch"
  echo "-- verify"
  cmd_verify
}

cmd_wait() {
  local timeout=$1 waited=0 fails=0 out alive health disk pg last first_disk="" next_report=0 status
  LOG_HINT=""
  if [ -z "${PGID_ARG:-}" ] && [ -f "$STATE_DIR/$NAME.launch" ]; then
    read -r PGID_ARG LOG_HINT <"$STATE_DIR/$NAME.launch" || true
    is_uint "$PGID_ARG" || PGID_ARG=""
  fi
  echo "wait     $NAME ($MODEL): GET :$IMAGE_PORT/health until 200, up to ${timeout}s${PGID_ARG:+, launcher group $PGID_ARG}"
  while :; do
    if ! out=$(run_remote probe); then
      fails=$((fails + 1))
      echo "probe failed ($fails/5)"
      [ "$fails" -lt 5 ] || { echo "error: the box did not answer 5 probes in a row" >&2; return 1; }
    else
      fails=0
      read -r alive pg health disk <<<"$(printf '%s\n' "$out" | sed -n 's/^PROBE //p' | head -n 1)"
      alive=${alive#alive=}; pg=${pg#pgid=}; health=${health#health=}; disk=${disk#disk=}
      last=$(printf '%s\n' "$out" | sed -n 's/^LAST //p' | head -n 1)
      [ -n "$first_disk" ] || first_disk=$disk
      if [ "$health" = 200 ]; then
        echo "health   200 after ${waited}s"
        break
      fi
      if [ "$alive" != 1 ]; then
        echo "FAILED: the $NAME launcher is not running (process group ${pg}) and :$IMAGE_PORT/health answers $health"
        printf '%s\n' "$out" | sed -n '/^TAIL /,$p'
        return 1
      fi
      if [ "$waited" -ge "$next_report" ]; then
        case "$health" in
        000) status="not bound yet (loading, or downloading the weights)" ;;
        503) status="503 (warming up)" ;;
        *) status="$health" ;;
        esac
        if is_uint "$disk" && is_uint "$first_disk"; then
          status="$status; disk $disk GB free ($((first_disk - disk)) GB used since the first probe)"
        fi
        echo "[$(date +%H:%M:%S)] ${waited}s pgid $pg: $status${last:+ — $last}"
        next_report=$((waited + 60))
      fi
    fi
    if [ "$waited" -ge "$timeout" ]; then
      echo "TIMEOUT after ${timeout}s — $NAME is still not healthy; it keeps running (check 'server.sh status', or 'server.sh stop $NAME --pgid ${pg:-<pgid>}')"
      return 124
    fi
    sleep "$POLL"
    waited=$((waited + POLL))
  done
  out=$(run_remote models) || true
  if printf '%s' "$out" | tr -d ' \n' | grep -qF "\"id\":\"$MODEL\""; then
    echo "models   :$IMAGE_PORT serves $MODEL"
  else
    echo "REFUSED: :$IMAGE_PORT is healthy but /v1/models does not list $MODEL:"
    printf '%s\n' "$out" | cut -c1-400
    return 3
  fi
  if curl -s -o /dev/null --max-time 10 "http://$PUBLIC_HOST:$IMAGE_PORT/v1/models"; then
    echo "public   http://$PUBLIC_HOST:$IMAGE_PORT answers from this machine"
  else
    echo "warning: http://$PUBLIC_HOST:$IMAGE_PORT does not answer from this machine (firewall?) — generation clients use it"
  fi
  echo "READY    $NAME"
}

main() {
  local cmd=${1:-} timeout=""
  [ $# -gt 0 ] && shift
  NAME=""; MODEL=""; SCRIPT=""; PGID_ARG=""; DRY=0; DEEP=0
  case "$cmd" in
  '' | -h | --help | help) usage; [ -n "$cmd" ] || exit 2; exit 0 ;;
  names | status | verify) ;;
  start | stop | wait) resolve_name "${1:-}"; shift ;;
  *) die_usage "unknown command \"$cmd\"" ;;
  esac
  while [ $# -gt 0 ]; do
    case "$1" in
    --dry-run)
      [ "$cmd" = start ] || [ "$cmd" = stop ] || die_usage "--dry-run applies to start and stop"
      DRY=1 ;;
    --pgid)
      [ "$cmd" = stop ] || [ "$cmd" = wait ] || die_usage "--pgid applies to stop and wait"
      if ! is_uint "${2:-}" || [ "$2" -le 1 ]; then die_usage "--pgid needs a process group id > 1"; fi
      PGID_ARG=$2; shift ;;
    --deep)
      [ "$cmd" = verify ] || die_usage "--deep applies to verify"
      DEEP=1 ;;
    --free-gpu-mib)
      [ "$cmd" = start ] || [ "$cmd" = verify ] || [ "$cmd" = status ] || die_usage "--free-gpu-mib applies to start, status and verify"
      is_uint "${2:-}" || die_usage "--free-gpu-mib needs a number"
      FREE_GPU_MIB=$2; shift ;;
    --min-free-gb)
      [ "$cmd" = start ] || die_usage "--min-free-gb applies to start"
      is_uint "${2:-}" || die_usage "--min-free-gb needs a number"
      MIN_FREE_GB=$2; shift ;;
    -*) die_usage "unknown option \"$1\"" ;;
    *)
      if [ "$cmd" != wait ] || [ -n "$timeout" ]; then die_usage "unexpected argument \"$1\""; fi
      if ! is_uint "$1" || [ "$1" -eq 0 ]; then die_usage "the wait timeout must be a whole number of seconds"; fi
      timeout=$1 ;;
    esac
    shift
  done
  case "$cmd" in
  names) cmd_names ;;
  status) cmd_status ;;
  verify) cmd_verify ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  wait) cmd_wait "${timeout:-$WAIT_DEFAULT}" ;;
  esac
}

main "$@"
