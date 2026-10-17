#!/usr/bin/env bash
# shellcheck disable=SC2015,SC2002 # `test && ok || bad` is the assertion idiom here
# =============================================================================
# server.test.sh — offline tests of server.sh: argument parsing, the start
# preflight, the stop refusal logic and signal order, verify, wait.
#
#   bash art-prompts/v2/server.test.sh        (no network, no ssh, no real signals)
#
# How: SERVER_SH_REMOTE="bash -c" runs server.sh's remote scripts on this machine,
# with fake ss / ps / nvidia-smi / curl / df / du / nohup / sleep first on PATH,
# reading a fake skynet2 ("world") from a temp dir, and an exported shell function
# `kill` (functions win over the builtin) that logs every signal and edits the
# world instead of signalling anything.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$HERE/server.sh"
ROOT_TMP="$(mktemp -d "${TMPDIR:-/tmp}/server-test.XXXXXX")"
trap 'rm -rf "$ROOT_TMP"' EXIT
PASS=0
FAIL=0
CURRENT=""

# --- the fake commands ---------------------------------------------------------
make_bin() {
  local b="$1/bin"
  mkdir -p "$b"
  cat >"$b/ps" <<'EOF'
#!/usr/bin/env bash
cat "$W/procs"
EOF
  cat >"$b/ss" <<'EOF'
#!/usr/bin/env bash
cat "$W/ss"
EOF
  cat >"$b/nvidia-smi" <<'EOF'
#!/usr/bin/env bash
case "$*" in *--query-compute-apps*) cat "$W/apps" ;; *) cat "$W/gpus" ;; esac
EOF
  cat >"$b/df" <<'EOF'
#!/usr/bin/env bash
printf 'Avail\n %sG\n' "$(cat "$W/disk")"
EOF
  cat >"$b/du" <<'EOF'
#!/usr/bin/env bash
printf '1.0G\t%s\n' "${@: -1}"
EOF
  cat >"$b/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  cat >"$b/nohup" <<'EOF'
#!/usr/bin/env bash
echo "nohup $*" >>"$W/launch.log"
[ "$(cat "$W/on-launch" 2>/dev/null)" = die ] && exit 1
echo "$$ 2045521 $$ 0 bash $3" >>"$W/procs"
EOF
  cat >"$b/curl" <<'EOF'
#!/usr/bin/env bash
# fake curl: http://host:PORT/path → $W/health.PORT (status codes, one line per call,
# the last one sticks) or $W/models.PORT (a /v1/models body)
url="" code=0 out=""
while [ $# -gt 0 ]; do
  case "$1" in
  -w) [ "$2" = '%{http_code}' ] && code=1; shift ;;
  -o) out=$2; shift ;;
  --max-time) shift ;;
  http://* | https://*) url=$1 ;;
  esac
  shift
done
echo "curl $url" >>"$W/curl.log"
hp=${url#*://}; path="/${hp#*/}"; hp=${hp%%/*}; port=${hp##*:}
if [ "$code" = 1 ]; then
  f="$W/health.$port"; [ "$path" = /health_generate ] && f="$W/healthgen.$port"
  if [ -f "$f" ]; then
    printf '%s' "$(head -n 1 "$f")"
    [ "$(wc -l <"$f")" -gt 1 ] && sed -i 1d "$f"
  else
    printf 000
  fi
  exit 0
fi
if [ "$path" = /v1/models ] && [ -f "$W/models.$port" ]; then
  if [ -n "$out" ]; then cat "$W/models.$port" >"$out"; else cat "$W/models.$port"; fi
  exit 0
fi
exit 7
EOF
  chmod +x "$b"/*
}

# the fake `kill`: logs, and on INT / TERM / KILL edits the world per $W/on-<sig>
kill() {
  printf 'kill %s\n' "$*" >>"$W/kill.log"
  local sig=$1 t g
  shift
  [ "${1:-}" = -- ] && shift
  t=$1
  if [ "$sig" = -0 ]; then
    if [ "${t#-}" != "$t" ]; then
      awk -v g="${t#-}" '$3 == g { f = 1 } END { exit !f }' "$W/procs"
    else
      awk -v p="$t" '$1 == p { f = 1 } END { exit !f }' "$W/procs"
    fi
    return
  fi
  case "$sig" in
  -INT)
    g=$(awk -v p="$t" '$1 == p { print $3 }' "$W/procs")
    case "$(cat "$W/on-int" 2>/dev/null)" in
    exit) [ -n "$g" ] && world_drop_group "$g" ;;
    protect) echo 'LISTEN 0 1 0.0.0.0:30000 0.0.0.0:* users:(("evil",pid=1771855,fd=3))' >>"$W/ss" ;;
    esac
    ;;
  -TERM) [ "$(cat "$W/on-term" 2>/dev/null)" = exit ] && world_drop_group "${t#-}" ;;
  -KILL) [ "$(cat "$W/on-kill" 2>/dev/null)" = ignore ] || world_drop_group "${t#-}" ;;
  esac
  return 0
}
world_drop_group() {
  local alive
  awk -v g="$1" '$3 != g' "$W/procs" >"$W/procs.tmp" && mv "$W/procs.tmp" "$W/procs"
  alive=" $(awk '{ printf "%s ", $1 }' "$W/procs")"
  awk -v a="$alive" '{ if (match($0, /pid=[0-9]+/)) { p = substr($0, RSTART + 4, RLENGTH - 4); if (index(a, " " p " ") == 0) next } print }' \
    "$W/ss" >"$W/ss.tmp" && mv "$W/ss.tmp" "$W/ss"
  awk -F', *' -v a="$alive" 'index(a, " " $2 " ")' "$W/apps" >"$W/apps.tmp" && mv "$W/apps.tmp" "$W/apps"
  awk -F', *' -v OFS=', ' 'FILENAME == ARGV[1] { busy[$1] = 1; next } { if (!($2 in busy)) $3 = 5; print }' "$W/apps" "$W/gpus" >"$W/gpus.tmp" &&
    mv "$W/gpus.tmp" "$W/gpus"
}
export -f kill world_drop_group

# --- worlds --------------------------------------------------------------------
# base: the LLM on GPUs 0,1 :30000, cards 2,3 idle, :30001 free, 400 GB free
world() {
  CURRENT="$1"
  W="$ROOT_TMP/$1"
  export W
  rm -rf "$W"
  mkdir -p "$W/root" "$W/state"
  make_bin "$W"
  cat >"$W/procs" <<'EOF'
      1       0       1  99999 /sbin/init
 482537       1  482537   9000 tmux new -s 1
1750898  482537 1750898   1200 /bin/bash /root/run_sglang_qwenflashnext9b.sh
1750900 1750898 1750898   1190 /root/sglang/.venv/bin/python3 /root/sglang/.venv/bin/sglang serve --model-path Qwen/Qwen3.8-Flash-Next-FP8 --tp 2 --ep 2 --api-key sk-SECRETSECRET --port 30000 --host 0.0.0.0
1751414 1750900 1750898   1180 sglang::scheduler_TP0_EP0
1751690 1750900 1750898   1180 sglang::scheduler_TP1_EP1
2045521  482537 2045521   5000 /bin/bash
EOF
  cat >"$W/ss" <<'EOF'
LISTEN 0      2048         0.0.0.0:30000      0.0.0.0:*    users:(("sglang",pid=1750900,fd=66))
LISTEN 0      128        127.0.1.1:39701      0.0.0.0:*    users:(("sglang::schedul",pid=1751690,fd=69))
LISTEN 0      128                *:29988            *:*    users:(("sglang::schedul",pid=1751414,fd=59))
EOF
  printf '%s\n' '0, GPU-a0, 90514, 97887' '1, GPU-a1, 90514, 97887' '2, GPU-a2, 5, 97887' '3, GPU-a3, 5, 97887' >"$W/gpus"
  printf '%s\n' 'GPU-a0, 1751414, sglang::scheduler_TP0_EP0, 90456' 'GPU-a1, 1751690, sglang::scheduler_TP1_EP1, 90456' >"$W/apps"
  echo 400 >"$W/disk"
  echo 200 >"$W/health.30000"
  echo exit >"$W/on-int"
  echo exit >"$W/on-term"
  local n m
  for n in flux1dev:black-forest-labs/FLUX.1-dev flux2dev:black-forest-labs/FLUX.2-dev qwenimage:Qwen/Qwen-Image \
    stablediffusion35large:stabilityai/stable-diffusion-3.5-large ltxvideo:Lightricks/LTX-Video \
    ltx25:Lightricks/LTX-2.5-Diffusers wan22:Wan-AI/Wan2.2-T2V-A14B-Diffusers; do
    m=${n#*:}
    n=${n%%:*}
    printf 'source ~/sglang/.venv/bin/activate\nHF_TOKEN=hf_FAKETOKENFAKETOKEN CUDA_VISIBLE_DEVICES=2,3 sglang serve --model-path %s --num-gpus 2 --host 0.0.0.0 --port 30001\n' \
      "$m" >"$W/root/run_sglang_images_${n}-1.sh"
  done
}

# FLUX.2-dev loaded on cards 2,3 (process group 1771402, led by the run script)
add_flux2_loading() {
  cat >>"$W/procs" <<'EOF'
1771402 2045521 1771402    600 /bin/bash ./run_sglang_images_flux2dev-1.sh
1771404 1771402 1771402    590 /root/sglang/.venv/bin/python3 /root/sglang/.venv/bin/sglang serve --model-path black-forest-labs/FLUX.2-dev --transformer-weights-path lmsys/flux2-dev-modelopt-fp8-sglang-transformer --num-gpus 2 --port 30001 --host 0.0.0.0
1771855 1771404 1771402    580 sgl_diffusion::scheduler
1771856 1771404 1771402    580 sgl_diffusion::scheduler
EOF
  echo 'LISTEN 0 128 *:30005 *:* users:(("sgl_diffusion::",pid=1771855,fd=67))' >>"$W/ss"
  printf '%s\n' 'GPU-a2, 1771855, sgl_diffusion::scheduler, 40000' 'GPU-a3, 1771856, sgl_diffusion::scheduler, 40000' >>"$W/apps"
  sed -i 's/^\(2\|3\), \(GPU-a[23]\), 5,/\1, \2, 40131,/' "$W/gpus"
}
add_flux2() {
  add_flux2_loading
  echo 'LISTEN 0 2048 0.0.0.0:30001 0.0.0.0:* users:(("sglang",pid=1771404,fd=70))' >>"$W/ss"
  echo 200 >"$W/health.30001"
  echo '{"object":"list","data":[{"id":"black-forest-labs/FLUX.2-dev","object":"model"}]}' >"$W/models.30001"
}

# --- running and asserting -----------------------------------------------------
run() {
  set +e
  OUT=$(PATH="$W/bin:$PATH" SERVER_SH_REMOTE="bash -c" SERVER_SH_REMOTE_DIR="$W/root" SERVER_SH_STATE_DIR="$W/state" \
    SERVER_SH_POLL=15 SERVER_SH_PUBLIC_HOST=skynet2.test "$SERVER" "$@" 2>&1)
  RC=$?
  set -e
  LAST="server.sh $*"
}
ok() { PASS=$((PASS + 1)); }
bad() {
  FAIL=$((FAIL + 1))
  printf 'FAIL [%s] %s: %s\n' "$CURRENT" "$LAST" "$1"
  printf '%s\n' "$OUT" | sed 's/^/    | /' | head -n 40
}
expect_rc() { if [ "$RC" = "$1" ]; then ok; else bad "exit $RC, expected $1"; fi; }
expect_out() { if printf '%s' "$OUT" | grep -qF -- "$1"; then ok; else bad "output lacks: $1"; fi; }
expect_not_out() { if printf '%s' "$OUT" | grep -qF -- "$1"; then bad "output has: $1"; else ok; fi; }
signals() { [ -f "$W/kill.log" ] && grep -v '^kill -0 ' "$W/kill.log" | paste -sd ';' - || true; }
expect_signals() {
  local got
  got=$(signals)
  if [ "$got" = "$1" ]; then ok; else bad "signals [$got], expected [$1]"; fi
}
no_secrets() { expect_not_out hf_FAKE; expect_not_out SECRETSECRET; }

# =============================================================================
echo "server.sh offline tests"

# --- argument parsing (no world needed, never reaches the remote) -------------------
world args
echo false >"$W/bin/never" && chmod +x "$W/bin/never"
run; expect_rc 2; expect_out "USAGE"
run help; expect_rc 0; expect_out "server.sh stop <name>"
run bogus; expect_rc 2; expect_out 'unknown command "bogus"'
run start; expect_rc 2; expect_out "missing <name>"
run start nope; expect_rc 2; expect_out 'unknown name "nope"'
run stop --dry-run; expect_rc 2; expect_out 'unknown name "--dry-run"'
run stop flux2dev --pgid; expect_rc 2; expect_out "--pgid needs a process group id > 1"
run stop flux2dev --pgid abc; expect_rc 2; expect_out "--pgid needs"
run stop flux2dev --pgid 1; expect_rc 2; expect_out "--pgid needs"
run stop flux2dev extra; expect_rc 2; expect_out 'unexpected argument "extra"'
run wait flux2dev 0; expect_rc 2; expect_out "whole number of seconds"
run wait flux2dev 10 20; expect_rc 2; expect_out 'unexpected argument "20"'
run wait flux2dev 1x; expect_rc 2
run verify --dry-run; expect_rc 2; expect_out "--dry-run applies to start and stop"
run status --pgid 5; expect_rc 2; expect_out "--pgid applies to stop and wait"
run start flux2dev --deep; expect_rc 2; expect_out "--deep applies to verify"
run start flux2dev --min-free-gb x; expect_rc 2
run stop flux2dev --min-free-gb 10; expect_rc 2
run start flux2dev --frobnicate; expect_rc 2; expect_out 'unknown option "--frobnicate"'
OUT=$(SERVER_SH_REMOTE="$W/bin/never" "$SERVER" names 2>&1) && RC=0 || RC=$?
LAST="server.sh names"; expect_rc 0; expect_out "run_sglang_images_stablediffusion35large-1.sh"; expect_out "Wan-AI/Wan2.2-T2V-A14B-Diffusers"
[ ! -f "$W/kill.log" ] && [ ! -f "$W/launch.log" ] && ok || bad "argument errors reached the remote"

# --- status ----------------------------------------------------------------------
world status-llm-only
run status; expect_rc 0
expect_out "LLM      :30000 pid 1750900 pgid 1750898"; expect_out "GPUs 0,1 health 200"
expect_out "GPU 2    5/97887 MiB  no compute processes"; expect_out ":30001   nothing listens"
expect_out "cards 2,3 and :30001 are free"; no_secrets

world status-flux2
add_flux2
run status; expect_rc 0
expect_out "GPU 2    40131/97887 MiB  flux2dev (pgid 1771402)"; expect_out ":30001   pid 1771404 pgid 1771402 model black-forest-labs/FLUX.2-dev health 200"
expect_out "process group 1771402 (flux2dev"; expect_out "are busy"; no_secrets

# --- start -----------------------------------------------------------------------
world start-dry
run start flux2 --dry-run; expect_rc 0
expect_out "DRY RUN — would run on the box:"; expect_out "nohup setsid bash $W/root/run_sglang_images_flux2dev-1.sh >$W/root/sglang_flux2dev_"
[ ! -f "$W/launch.log" ] && ok || bad "dry-run launched"
[ ! -f "$W/state/llm.baseline" ] && ok || bad "dry-run wrote state"
no_secrets

world start-real
run start flux2dev; expect_rc 0
expect_out "started flux2dev"; expect_out "PGID="
grep -qx "nohup setsid bash $W/root/run_sglang_images_flux2dev-1.sh" "$W/launch.log" && ok || bad "launch command: $(cat "$W/launch.log" 2>/dev/null)"
[ "$(cat "$W/state/llm.baseline" 2>/dev/null | cut -d' ' -f1)" = 1750900 ] && ok || bad "LLM baseline not recorded"
[ -s "$W/state/flux2dev.launch" ] && ok || bad "launch state not recorded"
expect_signals ""

world start-dies
echo die >"$W/on-launch"
run start qwenimage; expect_rc 1; expect_out "exited at once"

world start-busy
add_flux2
run start qwenimage; expect_rc 3
expect_out "REFUSED: :30001 is held by pid 1771404"; expect_out "an image/video launcher already runs — process group 1771402 (flux2dev"
expect_out "REFUSED: GPU 2 is held by flux2dev (pgid 1771402)"; expect_out "nothing was started"
[ ! -f "$W/launch.log" ] && ok || bad "busy start launched"

world start-loading
add_flux2_loading
run start wan22 --dry-run; expect_rc 3; expect_out "launcher already runs — process group 1771402"

world start-llm-on-cards
printf '%s\n' 'GPU-a2, 1751414, sglang::scheduler_TP0_EP0, 90456' >>"$W/apps"
run start flux2dev --dry-run; expect_rc 3; expect_out "REFUSED: GPU 2 is held by LLM (pgid 1750898)"

world start-memory
sed -i 's/^2, GPU-a2, 5,/2, GPU-a2, 3000,/' "$W/gpus"
run start flux2dev --dry-run; expect_rc 3; expect_out "GPU 2 has 3000 MiB in use with no compute process"
run start flux2dev --dry-run --free-gpu-mib 4096; expect_rc 0

world start-disk
echo 90 >"$W/disk"
run start flux2dev --dry-run; expect_rc 3; expect_out "only 90 GB free"
run start flux2dev --dry-run --min-free-gb 50; expect_rc 0

world start-bad-script
sed -i 's/--port 30001/--port 30000/' "$W/root/run_sglang_images_flux2dev-1.sh"
sed -i 's/CUDA_VISIBLE_DEVICES=2,3/CUDA_VISIBLE_DEVICES=0,1/' "$W/root/run_sglang_images_qwenimage-1.sh"
sed -i 's#Qwen/Qwen-Image#Qwen/Qwen-Image-Edit-2511#' "$W/root/run_sglang_images_wan22-1.sh"
rm "$W/root/run_sglang_images_ltx25-1.sh"
run start flux2dev --dry-run; expect_rc 3; expect_out "binds '--port 30000', expected only '--port 30001'"; no_secrets
run start qwenimage --dry-run; expect_rc 3; expect_out "pins 'CUDA_VISIBLE_DEVICES=0,1'"
run start ltx25 --dry-run; expect_rc 3; expect_out "run_sglang_images_ltx25-1.sh does not exist"

# --- stop: refusals (nothing may be signalled) -----------------------------------------
world stop-nothing
run stop flux2dev; expect_rc 0; expect_out "nothing to stop"; expect_signals ""

world stop-wrong-model
add_flux2
run stop qwenimage; expect_rc 3; expect_out "no listener (or its parent in the same group) runs --model-path Qwen/Qwen-Image"
expect_out "nothing was signalled"; expect_signals ""

world stop-loading-needs-pgid
add_flux2_loading
run stop flux2dev; expect_rc 3; expect_out "still loading"; expect_out "--pgid <pgid>"; expect_signals ""

world stop-llm-group
cat >>"$W/procs" <<'EOF'
1760000 1750898 1750898     50 /root/sglang/.venv/bin/python3 /root/sglang/.venv/bin/sglang serve --model-path black-forest-labs/FLUX.2-dev --port 30001
EOF
echo 'LISTEN 0 2048 0.0.0.0:30001 0.0.0.0:* users:(("sglang",pid=1760000,fd=70))' >>"$W/ss"
run stop flux2dev; expect_rc 3; expect_out "process group 1750898 is protected"; expect_signals ""
run stop flux2dev --dry-run; expect_rc 3; expect_signals ""

world stop-pgid-is-llm
run stop flux2dev --pgid 1750898; expect_rc 3; expect_out "process group 1750898 is protected"; expect_signals ""

world stop-llm-down-port-arg
# the LLM restarting: not bound to :30000 yet, but its cmdline names --port 30000
sed -i '/0.0.0.0:30000/d' "$W/ss"
run stop flux2dev --pgid 1750898; expect_rc 3; expect_out "is protected"; expect_signals ""

world stop-pgid-1
echo '   4242       1       1     30 /root/sglang/.venv/bin/python3 /root/sglang/.venv/bin/sglang serve --model-path black-forest-labs/FLUX.2-dev --port 30001' >>"$W/procs"
echo 'LISTEN 0 2048 0.0.0.0:30001 0.0.0.0:* users:(("sglang",pid=4242,fd=70))' >>"$W/ss"
run stop flux2dev; expect_rc 3; expect_out "process group 1 is <= 1"; expect_signals ""

world stop-foreign-leader
# started without job control from the owner's shell: the group is the shell's own
echo '4343 2045521 2045521 30 /root/sglang/.venv/bin/python3 /root/sglang/.venv/bin/sglang serve --model-path black-forest-labs/FLUX.2-dev --port 30001' >>"$W/procs"
echo 'LISTEN 0 2048 0.0.0.0:30001 0.0.0.0:* users:(("sglang",pid=4343,fd=70))' >>"$W/ss"
run stop flux2dev; expect_rc 3; expect_out "process group 2045521 is led by '/bin/bash', not run_sglang_images_flux2dev-1.sh"; expect_signals ""

world stop-pgid-mismatch
add_flux2
run stop flux2dev --pgid 2045521; expect_rc 3; expect_out "--pgid 2045521 does not own :30001"; expect_signals ""

world stop-pgid-unrelated
run stop flux2dev --pgid 2045521; expect_rc 3; expect_out "process group 2045521 is led by '/bin/bash'"; expect_signals ""

# --- stop: dry run and the signal order ----------------------------------------------
world stop-dry
add_flux2
run stop flux2dev --dry-run; expect_rc 0
expect_out "plan     kill -INT 1771404 (wait <= 45 s) -> kill -TERM -- -1771402 (<= 10 s) -> kill -KILL -- -1771402"
expect_out "DRY RUN — nothing was signalled"; expect_signals ""; no_secrets
[ ! -f "$W/state/llm.baseline" ] && ok || bad "dry-run stop wrote state"

world stop-int
add_flux2
run stop flux2dev; expect_rc 0
expect_signals "kill -INT 1771404"; expect_out "stopped  flux2dev: process group 1771402 is gone"; expect_out "VERIFY OK"
expect_out "not restarted since the baseline"; no_secrets

world stop-stubborn
add_flux2
echo ignore >"$W/on-int"; echo ignore >"$W/on-term"
run stop flux2dev; expect_rc 0
expect_signals "kill -INT 1771404;kill -TERM -- -1771402;kill -KILL -- -1771402"; expect_out "VERIFY OK"

world stop-term
add_flux2
echo ignore >"$W/on-int"
run stop flux2dev; expect_rc 0; expect_signals "kill -INT 1771404;kill -TERM -- -1771402"

world stop-survivors
add_flux2
echo ignore >"$W/on-int"; echo ignore >"$W/on-term"; echo ignore >"$W/on-kill"
run stop flux2dev; expect_rc 1; expect_out "SURVIVORS in process group 1771402"; expect_not_out "VERIFY OK"

world stop-becomes-protected
add_flux2
echo protect >"$W/on-int"
run stop flux2dev; expect_rc 3; expect_out "ABORT: process group 1771402 is now protected"; expect_signals "kill -INT 1771404"

world stop-loading-pgid
add_flux2_loading
run stop flux2dev --pgid 1771402 --dry-run; expect_rc 0; expect_out "plan     kill -INT 1771404"; expect_signals ""
run stop flux2dev --pgid 1771402; expect_rc 0; expect_signals "kill -INT 1771404"; expect_out "VERIFY OK"

world stop-alias
add_flux2
sed -i 's#black-forest-labs/FLUX.2-dev --transformer#stabilityai/stable-diffusion-3.5-large --transformer#; s/run_sglang_images_flux2dev-1.sh/run_sglang_images_stablediffusion35large-1.sh/' "$W/procs"
run stop sd35 --dry-run; expect_rc 0; expect_out "target   stablediffusion35large (stabilityai/stable-diffusion-3.5-large)"

# --- verify --------------------------------------------------------------------------
world verify-ok
run verify; expect_rc 0; expect_out "VERIFY OK"; expect_out "no baseline recorded"; expect_out "ok    GPU 3 freed"
echo "1750900 $(($(date +%s) - 1190))" >"$W/state/llm.baseline"
run verify; expect_rc 0; expect_out "not restarted since the baseline"
echo "1750900 $(($(date +%s) - 5000))" >"$W/state/llm.baseline"
run verify; expect_rc 1; expect_out "the LLM was restarted"
echo "999 $(($(date +%s) - 1190))" >"$W/state/llm.baseline"
run verify; expect_rc 1; expect_out "baseline pid 999"

world verify-busy
add_flux2
run verify; expect_rc 1
expect_out "FAIL  :30001 is held by pid 1771404"; expect_out "FAIL  launcher still running: process group 1771402 (flux2dev"
expect_out "FAIL  GPU 2 is held by flux2dev"; expect_out "VERIFY FAILED"; no_secrets

world verify-llm-sick
echo 503 >"$W/health.30000"
run verify; expect_rc 1; expect_out "FAIL  LLM :30000 health 503"
echo 200 >"$W/health.30000"; echo 503 >"$W/healthgen.30000"
run verify --deep; expect_rc 1; expect_out "FAIL  LLM /health_generate 503"

world verify-llm-gone
sed -i '/0.0.0.0:30000/d' "$W/ss"
run verify; expect_rc 1; expect_out "FAIL  nothing listens on :30000"

world verify-memory
sed -i 's/^3, GPU-a3, 5,/3, GPU-a3, 2163,/' "$W/gpus"
run verify; expect_rc 1; expect_out "GPU 3 has 2163 MiB in use"
run verify --free-gpu-mib 4096; expect_rc 0

# --- wait ----------------------------------------------------------------------------
world wait-ready
add_flux2
printf '%s\n' 000 503 200 >"$W/health.30001"
run wait flux2dev 600; expect_rc 0
expect_out "not bound yet (loading, or downloading the weights)"; expect_out "health   200 after 30s"
expect_out "models   :30001 serves black-forest-labs/FLUX.2-dev"; expect_out "READY    flux2dev"

world wait-wrong-model
add_flux2
echo '{"object":"list","data":[{"id":"Qwen/Qwen-Image"}]}' >"$W/models.30001"
run wait flux2dev 60; expect_rc 3; expect_out "does not list black-forest-labs/FLUX.2-dev"

world wait-dead
echo "Downloading ... HF_TOKEN=hf_FAKETOKENFAKETOKEN failed" >"$W/root/sglang_flux2dev_20261016T200000.log"
run wait flux2dev 60; expect_rc 1; expect_out "launcher is not running"; expect_out "hf_***"; no_secrets

world wait-timeout
add_flux2_loading
echo 503 >"$W/health.30001"
run wait flux2dev 30; expect_rc 124; expect_out "TIMEOUT after 30s"; expect_signals ""

world wait-pgid-from-start
run start flux2dev; expect_rc 0
pg=$(cut -d' ' -f1 "$W/state/flux2dev.launch")
echo 200 >"$W/health.30001"
echo '{"data":[{"id":"black-forest-labs/FLUX.2-dev"}]}' >"$W/models.30001"
run wait flux2dev; expect_rc 0; expect_out "launcher group $pg"; expect_out "READY"

# =============================================================================
echo "passed $PASS, failed $FAIL"
[ "$FAIL" = 0 ]
