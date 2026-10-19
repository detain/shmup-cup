#!/usr/bin/env bash
#
# two-scale.sh — the R2-02 port kit (decision R2-N1; deleted by the port commit R2-02.S).
#
# Builds a throwaway git worktree at the CALLER's HEAD in which the shipped content is
# ported ×1.5 (scripts/content/rescale.mjs for real) and the code is flipped exactly as
# R2-02's port commit will flip it: WORLD_SCALE / WORLD_TOP_PAD, the scripts/frame.mjs
# mirror, the 15 frame-unit behaviour defaults, the content hand fixes
# (test/port-v2/handfix.patch) and the port-pending stub. Then it runs the given command
# inside that tree and reports its exit code, so every R2-02 prep subtask can prove its
# tests at BOTH scales: in its own tree (world ×1) and here (world ×1.5).
#
# The caller must COMMIT its work first: the tree is built from HEAD, so uncommitted
# edits are deliberately NOT in it. The kit only ever changes its own throwaway tree —
# never the caller's checkout, never master.
#
# Usage (from anywhere; the script finds the repository root it lives in):
#   bash test/port-v2/two-scale.sh -- <cmd…>          run <cmd…> in a fresh ported tree, remove it
#   bash test/port-v2/two-scale.sh --keep -- <cmd…>   same but keep the tree; its absolute path is
#                                                     printed as the script's LAST output line
#   bash test/port-v2/two-scale.sh --reuse <dir> -- <cmd…>
#                                                     run <cmd…> in a tree kept by an earlier
#                                                     --keep run (leaves it in place; remove it with
#                                                     `git worktree remove --force <dir>` when done)
#   bash test/port-v2/two-scale.sh apply              make the changes of the port (the rescale run,
#                                                     the hand-fix patch, the code flip and the
#                                                     stub) in the CURRENT tree — only R2-02.S runs
#                                                     this, in wave 4
#
# Throwaway trees are created next to the caller's checkout (override the parent with
# SHMUP_KIT_TMP). Exit codes: the command's in run modes; 1 on a failed step (a flip
# pattern that does not match exactly once fails loudly); 2 on a usage error.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
usage() {
	cat >&2 <<'USAGE'
two-scale.sh — the R2-02 port kit. Commit your work first: the kit tree is built from
HEAD, uncommitted edits are not in it. Usage (from anywhere; the kit tree is built next to
the checkout this script lives in, override the parent with SHMUP_KIT_TMP):

  bash test/port-v2/two-scale.sh -- <cmd…>               run <cmd…> in a fresh ported tree, remove it
  bash test/port-v2/two-scale.sh --keep -- <cmd…>        keep the tree; its absolute path is the last line
  bash test/port-v2/two-scale.sh --reuse <dir> -- <cmd…> run <cmd…> in a kept tree (remove with
                                                         `git worktree remove --force <dir>`)
  bash test/port-v2/two-scale.sh apply                   make the port's changes in the CURRENT tree
                                                         (only R2-02.S runs this, wave 4)

Exit codes: the command's in run modes; 1 when a step fails (a flip pattern that does not
match exactly once is reported); 2 on a usage error.
USAGE
	exit 2
}

# flip <file> <pattern> <replacement> — replace <pattern> (exact text, may span lines)
# in <file>; the pattern must match exactly once or the script fails with it printed.
flip() {
	FLIP_FILE="$1" FLIP_PATTERN="$2" FLIP_REPLACEMENT="$3" node -e '
    const fs = require("node:fs");
    const { FLIP_FILE: file, FLIP_PATTERN: pattern, FLIP_REPLACEMENT: replacement } = process.env;
    const parts = fs.readFileSync(file, "utf8").split(pattern);
    if (parts.length !== 2) {
      console.error(
        "two-scale.sh: pattern must match exactly once in " + file + " (matched " +
          String(parts.length - 1) + " times): " + JSON.stringify(pattern),
      );
      process.exit(1);
    }
    fs.writeFileSync(file, parts.join(replacement));
  '
}

# port_steps — the port itself: the rescale run, the hand fixes, the code flip, the stub.
# Throwaway mode runs it after `git worktree add` + install + assets; `apply` runs it in
# the current tree (only R2-02.S). The two must stay identical (reviewers diff them).
port_steps() {
	echo "two-scale: porting the content ×1.5 (the rescale tool, for real)" >&2
	node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --from-width 384 \
		--from-height 200 --tile-size 8 --to-width 640 --art-scale 1.5

	echo "two-scale: applying test/port-v2/handfix.patch (content-only hand fixes)" >&2
	git apply test/port-v2/handfix.patch

	echo "two-scale: flipping the code (WORLD_SCALE, WORLD_TOP_PAD, the frame.mjs mirror)" >&2
	local CFG=packages/core/src/config/index.ts
	flip "$CFG" 'WORLD_SCALE: number = 1' 'WORLD_SCALE: number = 3 / 2'
	flip "$CFG" 'WORLD_TOP_PAD: number = 0' 'WORLD_TOP_PAD: number = 36'
	flip scripts/frame.mjs 'export const WORLD_SCALE = 1;' 'export const WORLD_SCALE = 3 / 2;'

	echo "two-scale: flipping the 15 frame-unit behaviour defaults (13 replacements)" >&2
	local B=packages/core/src/behaviors/index.ts
	flip "$B" 'x: 256,' 'x: 416,'          # orbiter.loop x   (screen-x)
	flip "$B" 'y: 100,' 'y: 186,'          # orbiter.loop y   (world-y)
	flip "$B" 'meetX: 176' 'meetX: 296'    # cube.pincer meetX (screen-x); the token
	# only: line :703 also holds three world values R2-02.W6 rewrites in wave 2.
	flip "$B" 'turnX: 280,' 'turnX: 452,'  # rear.swoop turnX (screen-x)
	flip "$B" 'ramX: 40,' 'ramX: 60,'      # captain.ram ramX (screen-x)
	# 'minX: 250,' occurs twice (captain.crab, boss.widow): each two-line pattern below
	# carries its own maxX, so both matches stay unique; the maxX lines get no flip alone.
	flip "$B" '    minX: 250,
    maxX: 340,' '    minX: 407,
    maxX: 574,'      # captain.crab minX/maxX (screen-x)
	flip "$B" 'minY: 40,' 'minY: 60,'      # captain.crab minY (screen-y)
	flip "$B" 'maxY: 160,' 'maxY: 276,'    # captain.crab maxY (screen-y)
	flip "$B" '    minX: 250,
    maxX: 320,' '    minX: 407,
    maxX: 544,'    # boss.widow minX/maxX (screen-x)
	flip "$B" 'minY: 56,' 'minY: 102,'     # boss.widow minY (screen-y)
	flip "$B" 'maxY: 144,' 'maxY: 234,'    # boss.widow maxY (screen-y)
	flip "$B" 'frontX: 96,' 'frontX: 176,' # boss.walker frontX (screen-x; its start/centre tie
	# resolves to the centre)
	flip "$B" 'backX: 280,' 'backX: 452,' # boss.walker backX (screen-x)

	echo "two-scale: stubbing the port-pending gate (content/ is ported now)" >&2
	local P=packages/core/test/helpers/port-pending.ts
	flip "$P" 'export const CONTENT_PORT_PENDING: boolean = shippedTileSizes().some(
  ([, size]) => size !== TILE_SIZE,
);' 'export const CONTENT_PORT_PENDING: boolean = false;'
	flip "$P" 'checkPortPendingExpiry(FRAME_W, CONTENT_PORT_PENDING);
' ''
	# TILE_SIZE was read only by the replaced body and FRAME_W only by the removed call;
	# noUnusedLocals fails the typecheck if the import stays.
	flip "$P" "import { FRAME_W, TILE_SIZE } from '../../src/config/index.js';
" ''
}

MODE=run
KEEP=0
REUSE=
while [ $# -gt 0 ]; do
	case "$1" in
	apply)
		[ "$MODE" = run ] || usage
		MODE=apply
		shift
		;;
	--keep)
		[ "$MODE" = run ] || usage
		MODE=keep
		KEEP=1
		shift
		;;
	--reuse)
		[ "$MODE" = run ] || usage
		MODE=reuse
		[ $# -ge 2 ] || usage
		REUSE="$2"
		shift 2
		;;
	--)
		shift
		break
		;;
	*) usage ;;
	esac
done

if [ "$MODE" = apply ]; then
	[ $# -eq 0 ] || usage
	cd "$ROOT"
	port_steps
	echo "two-scale: apply done — the current tree is the ported tree (review the diff, then commit)" >&2
	exit 0
fi

[ $# -ge 1 ] || usage

if [ "$MODE" = reuse ]; then
	[ -d "$REUSE" ] || {
		echo "two-scale: no such kept tree: $REUSE" >&2
		exit 2
	}
	cd "$REUSE"
	"$@"
	exit $?
fi

# Throwaway (or kept) tree at the caller's HEAD.
TREE=""
cleanup() {
	if [ -n "$TREE" ] && [ "$KEEP" -eq 0 ] && [ -d "$TREE" ]; then
		git -C "$ROOT" worktree remove --force "$TREE"
	fi
}
trap cleanup EXIT

BASE="${SHMUP_KIT_TMP:-$(dirname "$ROOT")}"
mkdir -p "$BASE"
BASE="$(cd "$BASE" && pwd)"
TREE="$BASE/$(basename "$ROOT")-kit-$$"

echo "two-scale: building the ported tree at HEAD in $TREE" >&2
git -C "$ROOT" worktree add --detach "$TREE" HEAD >&2
cd "$TREE"
pnpm install --frozen-lockfile --prefer-offline >&2
pnpm assets >&2
port_steps

STATUS=0
"$@" || STATUS=$?

if [ "$KEEP" -eq 1 ]; then
	# The tree stays in place; its path is the last output line (see --reuse).
	trap - EXIT
	echo "$TREE"
fi
exit "$STATUS"
