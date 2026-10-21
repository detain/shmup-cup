#!/usr/bin/env bash
# land-zone.sh — LAND a zone's work (R5-P.LAND): squash the zone branch to one sources-only
# commit, regenerate every derived file under the land lock, prove the scope, push.
#
# What it does, in the checkout that holds this file (found from the script's own location, so
# it works from any clone or worktree — run it inside the zone worktree):
#   0. refuse while `git status --porcelain` prints anything — commit every source first (an
#      uncommitted file under test/golden, content/demos or docs/images would fail late at
#      step 1's rebase, be deleted by the abort rule's `git clean -fd`, or get staged by
#      step 9's `git add test/golden`);
#   1. `git fetch origin`; squash the branch to one commit (`git reset --soft` to the
#      merge-base with origin/master, `git commit -F <message>`); `git rebase origin/master` —
#      branch commits hold sources only, so a conflict is real: `git rebase --abort` and exit;
#   2. `pnpm install --frozen-lockfile --prefer-offline && pnpm assets`;
#   3. `SHMUP_ATLAS_GROUPS_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project
#      integration test/integration/atlas-groups.test.ts && pnpm assets` (R1-05's derived file);
#   4. `node scripts/golden-update.mjs --only <list>` (or plain, with --all) — the --only run
#      re-records only the listed zones' goldens and demos and VERIFIES every other one
#      (R5-P.P3: that verification is a LAND's first proof only its zone moved);
#   5. `SHMUP_FINGERPRINT_UPDATE=1` runs of the presentation and content-DB fingerprints
#      (--project integration) and of packages/shell/test/frame-fingerprint.test.ts
#      (--project shell) — the update mode rewrites each file's own PINNED (R5-P.P10);
#   6. `pnpm docs:images` (every plate redrawn; step 9 stages and lists only what changed);
#   7. the targeted checks: content-zone-<x> + the shared content.test.ts, atlas-zone-sprites,
#      frame-literals-repo, art-origins, provenance, playtest/zone-<x>, ALL of test/golden
#      (the scope proof); then, as its own command, the WHOLE release-audit.test.ts — no `-t`:
#      it audits all nine zones, and its `zone $label` cases carry the campaign's UPPER-CASE
#      labels, so a `-t "zone $z"` with the lower-case letter would select nothing; then the
#      three fingerprints again, without the update variable;
#   8. prove the scope: every changed or new test/golden/*.replay.json and
#      content/demos/*.replay.json (untracked included, from `git status --porcelain`) must
#      have a header.stageId in the --only list (read with a node one-liner); with --all the
#      check is skipped (everything re-recorded, the scope is the commit itself);
#   9. `git add` the explicit derived paths (test/golden, content/demos, the three fingerprint
#      test files, assets/source/atlas-groups.json, docs/images — never `git add -A`), save the
#      sources-only commit in $SOURCES, append `Changed plates:` and one docs/images path per
#      changed plate (or `none`) to a copy of the message file, `git commit --amend -F` it (the
#      zone's post-LAND check reads that list from the commit body), and
#      `git push origin HEAD:master` — only master, never the zone branch, never --force. On a
#      rejected push: `git reset --hard "$SOURCES"` (back to the sources-only commit; the
#      amended one holds derived files step 1 must re-squash over) and go back to step 1,
#      at most 5 times in all.
# On an abort (any step from 2 on fails, or step 8's scope check): before exiting non-zero the
# script runs `git restore --staged --worktree` on the derived paths step 9 lists and deletes
# the untracked files it created under them (`git clean -fd -- test/golden content/demos
# docs/images` — a new plate or replay is derived too), so the branch holds sources only again
# and `git status --short` is empty for the fixer. It logs which step failed.
#
# Run inside the zone worktree (every step logs to $RUN_DIR/land-<zone>-<date>.log, so RUN_DIR
# is required; the whole run is long — opencode's shell tool stops a foreground command after
# 2 minutes, so start it with the shell tool's `background: true`, or with nohup, and poll the
# log; <id> = your subtask id):
#   RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh \
#     --only zone-b --message /home/sites/shmup-cup-run/<id>-msg.txt --zone b
# Arguments:
#   --only <stageId,…>  the zone's own stage ids: step 4 re-records only these and step 8
#                       proves no other replay moved (the per-zone LAND mode)
#   --all               re-record every golden and demo and skip step 8 (the global
#                       re-blesses R5-P.P12, R6-01.B4); step 7 still runs the --zone checks
#   --message <file>    the commit message (its first line is the subject) — step 9 appends
#                       the `Changed plates:` list to a copy of it before the amend
#   --zone <x>          the zone letter a…I — names content-zone-<x>.test.ts,
#                       test/playtest/zone-<x>.test.ts and the log file
#   --dry-run           steps 1–8 in a throwaway `git worktree add --detach` copy of HEAD (the
#                       real origin/master, never a clone's stale local one); print what step 9
#                       would commit ("nothing derived changed" when that is the case), push
#                       nothing, remove the copy on every exit including a failed step (trap
#                       EXIT). The branch itself is not squashed or changed. Takes no lock.
# Exactly one of --only / --all is required, with --message and --zone.
# Environment:
#   RUN_DIR       REQUIRED — the script exits non-zero at once without it (every step logs to
#                 $RUN_DIR/land-<zone>-<date>.log)
#   LAND_LOCK     the machine-wide land lock (default /tmp/shmup-cup-land.lock); a real run
#                 takes it with `flock -w $LAND_LOCK_WAIT` so two LANDs never push over each
#                 other; --dry-run takes no lock
#   LAND_LOCK_WAIT  seconds to wait for the lock (default 5400 — a stuck holder shows)
# The script refuses to run when CI is set (the fingerprint update mode refuses there anyway).
#
# Traps it holds you to: never `git add -A`, never push the zone branch, never --force-push;
# docs/images plates it stages are listed in the commit body — the post-LAND check reads that
# list and flags any plate outside the zone's own enemy / boss set (plus the zone boss's echo,
# and only once a real-art S3 drop redrew the sprites the echo copies, R5-D6).
#
# Used by: every R5 zone lane's LAND (docs/v2-run/, plan_resolution.md §18), and the global
# re-blesses R5-P.P12 / R6-01.B4 in --all mode.
# Delete when: the v2 agent run ends (R6-03).
set -u

usage() { echo "usage: bash docs/v2-run/helpers/land-zone.sh (--only <stageId,…> | --all) --message <file> --zone <x> [--dry-run]" >&2; }

# The checkout that holds this script: the zone worktree to land (the script runs from any
# directory; an absolute path into another worktree's copy would act on THAT checkout).
MAIN=$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel) || exit 1
LAND_LOCK=${LAND_LOCK:-/tmp/shmup-cup-land.lock}
LAND_LOCK_WAIT=${LAND_LOCK_WAIT:-5400}

ONLY=""
ALL=0
MESSAGE=""
ZONE=""
DRY=0
while [ "$#" -gt 0 ]; do
	case "$1" in
	--only)
		if [ "$#" -ge 2 ]; then
			ONLY=$2
			shift 2
		else
			usage
			exit 2
		fi
		;;
	--all)
		ALL=1
		shift
		;;
	--message)
		if [ "$#" -ge 2 ]; then
			MESSAGE=$2
			shift 2
		else
			usage
			exit 2
		fi
		;;
	--zone)
		if [ "$#" -ge 2 ]; then
			ZONE=$2
			shift 2
		else
			usage
			exit 2
		fi
		;;
	--dry-run)
		DRY=1
		shift
		;;
	*)
		usage
		exit 2
		;;
	esac
done
ONLY=${ONLY// /}
if { [ -n "$ONLY" ] && [ "$ALL" = 1 ]; } || { [ -z "$ONLY" ] && [ "$ALL" = 0 ]; }; then
	usage
	echo "land-zone.sh: exactly one of --only <stageId,…> / --all is required" >&2
	exit 2
fi
case "$ZONE" in [a-i]) ;; *)
	usage
	echo "land-zone.sh: --zone wants one letter a…I, got '$ZONE'" >&2
	exit 2
	;;
esac
if [ -z "$MESSAGE" ] || [ ! -f "$MESSAGE" ] || [ ! -r "$MESSAGE" ]; then
	usage
	echo "land-zone.sh: --message needs a readable file" >&2
	exit 2
fi
MESSAGE=$(readlink -f "$MESSAGE")
# Every step logs to $RUN_DIR, so no RUN_DIR means no run (at once, before any lock or git).
if [ -z "${RUN_DIR:-}" ]; then
	echo "land-zone.sh: RUN_DIR is unset — every step logs to \$RUN_DIR/land-<zone>-<date>.log" >&2
	exit 1
fi
# CI never lands (the pin writer of step 5 refuses there anyway).
if [ -n "${CI:-}" ]; then
	echo "land-zone.sh: CI is set — the LAND never runs in CI" >&2
	exit 1
fi

LOG_DIR=$RUN_DIR
mkdir -p "$LOG_DIR" || exit 1
LOG=$LOG_DIR/land-$ZONE-$(date +%Y%m%d).log
exec >>"$LOG" 2>&1
echo "=== land-zone.sh (R5-P.LAND) start $(date +%FT%T) zone=$ZONE $([ "$ALL" = 1 ] && echo '--all' || echo "--only $ONLY")$([ "$DRY" = 1 ] && echo ' --dry-run')"
echo "checkout: $MAIN at $(git -C "$MAIN" rev-parse --short HEAD) (branch: $(git -C "$MAIN" symbolic-ref --quiet --short HEAD || echo detached))"
echo "log:      $LOG"

# The derived paths step 9 stages (and the abort rule restores). Explicit — never `git add -A`.
DERIVED=(test/golden content/demos
	test/integration/presentation-fingerprint.test.ts
	test/integration/content-db-fingerprint.test.ts
	packages/shell/test/frame-fingerprint.test.ts
	assets/source/atlas-groups.json docs/images)

# fail_step <where> <why> — the abort rule: restore the derived paths (a real run from step 2
# on, or step 8's scope check) and exit non-zero, logging the failed step. In a dry run the
# copy dies with the trap anyway; the restore keeps the log of both modes honest.
fail_step() {
	echo "LAND FAILED at $1: $2"
	echo "--- abort rule: git restore --staged --worktree on the derived paths"
	git restore --staged --worktree -- "${DERIVED[@]}" ||
		echo "(git restore reported a problem — inspect the derived paths by hand)"
	echo "--- abort rule: git clean -fd under the derived folders (a new plate or replay is derived too)"
	git clean -fdq -- test/golden content/demos docs/images || true
	echo "--- git status --short after the restore (empty = the branch holds sources only again):"
	git status --short
	exit 1
}

# run_step <label> <command…> — log the command, run it, and abort the LAND when it fails.
run_step() {
	local label=$1
	shift
	echo "=== $(date +%T) $label"
	echo "\$ $*"
	"$@" || fail_step "$label" "command failed (rc=$?)"
}

# A real run is serialised machine-wide; the dry run pushes nothing and works in its own copy.
if [ "$DRY" != 1 ]; then
	exec 9>"$LAND_LOCK" || exit 1
	flock -w "$LAND_LOCK_WAIT" 9 || {
		echo "LAND FAILED: $LAND_LOCK not free within ${LAND_LOCK_WAIT}s"
		exit 1
	}
	echo "took $LAND_LOCK"
fi

# --dry-run: a throwaway detached worktree of HEAD — it shares the repository, so
# `origin/master` is the real one (never a clone, whose origin would be this local checkout and
# its possibly stale master). Removed on every exit, a failed step included.
RUN=$MAIN
DRY_DIR=""
if [ "$DRY" = 1 ]; then
	DRY_DIR=$RUN_DIR/wt/land-zone-dry-$ZONE-$$
	trap 'if [ -n "${DRY_DIR:-}" ] && [ -e "$DRY_DIR" ]; then git -C "$MAIN" worktree remove --force "$DRY_DIR" 2>/dev/null || rm -rf "$DRY_DIR"; git -C "$MAIN" worktree prune 2>/dev/null || true; fi' EXIT
	git -C "$MAIN" worktree add --detach "$DRY_DIR" HEAD || exit 1
	RUN=$DRY_DIR
	echo "dry run: working in the throwaway copy $DRY_DIR"
fi
cd "$RUN" || exit 1

# Step 0 — a dirty checkout lands someone's uncommitted work: stop here, before anything
# squashes, and touch nothing (the abort rule's clean would delete the fixer's files).
if [ -n "$(git status --porcelain)" ]; then
	echo "--- git status --short:"
	git status --short
	echo "LAND FAILED at step 0: the checkout is not clean — commit every source first"
	exit 1
fi

PUSHED=""
for attempt in 1 2 3 4 5; do
	echo "===== land attempt $attempt of at most 5 ====="

	# Step 1 — squash the branch, then rebase on the real origin/master.
	run_step "step 1: git fetch origin" git fetch origin
	BASE=$(git merge-base HEAD origin/master) ||
		fail_step "step 1: merge-base" "HEAD and origin/master share no base"
	run_step "step 1: squash to one sources-only commit (base $(git rev-parse --short "$BASE"))" \
		git reset --soft "$BASE"
	run_step "step 1: git commit -F $MESSAGE" git commit -F "$MESSAGE"
	if ! git rebase origin/master; then
		git rebase --abort 2>/dev/null || true
		fail_step "step 1: git rebase origin/master" "a conflict — branch commits hold sources only, so a conflict is real (aborted the rebase)"
	fi

	# Step 2 — the tree and the atlas as their sources now say.
	run_step "step 2: pnpm install --frozen-lockfile --prefer-offline" \
		pnpm install --frozen-lockfile --prefer-offline
	run_step "step 2: pnpm assets" pnpm assets

	# Step 3 — the atlas groups file is derived from the content: re-derive, then repack.
	run_step "step 3: SHMUP_ATLAS_GROUPS_UPDATE=1 test/integration/atlas-groups.test.ts" \
		env SHMUP_ATLAS_GROUPS_UPDATE=1 VITEST_MAX_WORKERS=6 \
		pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts
	run_step "step 3: pnpm assets (the groups moved)" pnpm assets

	# Step 4 — the goldens and demos of this zone (or, with --all, every one).
	if [ -n "$ONLY" ]; then
		run_step "step 4: node scripts/golden-update.mjs --only $ONLY" \
			node scripts/golden-update.mjs --only "$ONLY"
	else
		run_step "step 4: node scripts/golden-update.mjs (--all: every golden and demo)" \
			node scripts/golden-update.mjs
	fi

	# Step 5 — the three fingerprints rewrite their own pins (R5-P.P10's update mode).
	run_step "step 5: SHMUP_FINGERPRINT_UPDATE=1 presentation + content-DB fingerprints" \
		env SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration \
		test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
	run_step "step 5: SHMUP_FINGERPRINT_UPDATE=1 shell frame fingerprint" \
		env SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell \
		packages/shell/test/frame-fingerprint.test.ts

	# Step 6 — every plate redrawn; step 9 stages only what changed and lists those.
	run_step "step 6: pnpm docs:images" pnpm docs:images

	# Step 7 — the scope proof: the zone's own checks and all of test/golden, the whole
	# release audit (as its own command, no -t — see the header), the three fingerprints.
	run_step "step 7: zone-$ZONE targeted checks + all of test/golden" \
		pnpm exec vitest run --project integration \
		test/integration/content-zone-"$ZONE".test.ts test/integration/content.test.ts \
		test/integration/atlas-zone-sprites.test.ts test/integration/frame-literals-repo.test.ts \
		test/scripts/art-origins.test.ts test/scripts/assets/provenance.test.ts \
		test/playtest/zone-"$ZONE".test.ts test/golden
	run_step "step 7: the whole release audit (all nine zones — no -t)" \
		pnpm exec vitest run --project integration test/integration/release-audit.test.ts
	run_step "step 7: the presentation + content-DB fingerprints, as pinned" \
		pnpm exec vitest run --project integration \
		test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
	run_step "step 7: the shell frame fingerprint, as pinned" \
		pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts

	# Step 8 — only the zone's own replays may have moved (--all: everything moved on purpose).
	if [ -n "$ONLY" ]; then
		echo "=== $(date +%T) step 8: the scope check (--only $ONLY)"
		SCOPE_BAD=0
		# -uall: an untracked new folder would otherwise collapse to its directory name
		# and slip past the .replay.json filter.
		CHANGED=$(git status --porcelain -uall -- test/golden content/demos |
			cut -c4- | sed 's/.* -> //' | grep '\.replay\.json$' || true)
		if [ -z "$CHANGED" ]; then
			echo "  no golden or demo changed"
		else
			for f in $CHANGED; do
				sid=$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).header.stageId))' "$f" 2>/dev/null) ||
					sid="<unreadable: new, deleted, or not JSON>"
				case ",$ONLY," in
				*,"$sid",*) echo "  in scope:  $f (stageId $sid)" ;;
				*)
					echo "  OUT OF SCOPE: $f (stageId $sid is not in --only $ONLY)"
					SCOPE_BAD=1
					;;
				esac
			done
		fi
		[ "$SCOPE_BAD" = 0 ] || fail_step "step 8: scope check" "a changed replay is outside --only $ONLY"
	else
		echo "=== step 8: skipped (--all re-records every replay; the commit itself is the scope)"
	fi

	# A dry run stops here: print what step 9 would commit, push nothing.
	if [ "$DRY" = 1 ]; then
		echo "=== $(date +%T) step 9 (dry run): what would be committed — push nothing"
		WOULD=$(git status --porcelain -uall -- "${DERIVED[@]}")
		if [ -z "$WOULD" ]; then
			echo "nothing derived changed"
		else
			echo "$WOULD"
			PLATES=$(echo "$WOULD" | cut -c4- | sed 's/.* -> //' | grep '^docs/images/' || true)
			echo "  commit body would append:"
			echo "    Changed plates:"
			if [ -n "$PLATES" ]; then echo "    ${PLATES//$'\n'/$'\n'    }"; else echo "    none"; fi
		fi
		echo "=== $(date +%T) DRY RUN OK: every step passed; nothing was committed or pushed; the copy dies with the trap"
		exit 0
	fi

	# Step 9 — stage the derived paths, amend the message with the plate list, push.
	SOURCES=$(git rev-parse HEAD)
	run_step "step 9: git add the explicit derived paths" git add -- "${DERIVED[@]}"
	PLATES=$(git diff --cached --name-only -- docs/images)
	MSG2=$(mktemp "$LOG_DIR/land-$ZONE-msg-XXXXXX")
	cp "$MESSAGE" "$MSG2"
	{
		echo "Changed plates:"
		if [ -n "$PLATES" ]; then echo "$PLATES"; else echo none; fi
	} >>"$MSG2"
	echo "step 9: the commit body gets:"
	echo "Changed plates:"
	if [ -n "$PLATES" ]; then echo "$PLATES"; else echo none; fi
	run_step "step 9: git commit --amend -F <message + plates>" git commit --amend -F "$MSG2"
	rm -f "$MSG2"
	if git push origin HEAD:master; then
		PUSHED=$(git rev-parse HEAD)
		break
	fi
	echo "push rejected (origin/master moved or a hook refused): reset --hard \$SOURCES ($SOURCES) — back to step 1"
	git reset --hard "$SOURCES"
	if [ "$attempt" = 5 ]; then
		fail_step "step 9: git push origin HEAD:master" "rejected five times — leave the squashed sources commit for the fixer"
	fi
done

echo "=== $(date +%T) LAND OK: pushed $PUSHED ($(git rev-parse --short HEAD)) to master"
exit 0
