"""zonerefs.py — which tracked code and test files name which zones.

What it does: reads every tracked `.ts` / `.mjs` file under test/, packages/, apps/, scripts/
and tools/ and groups it by the zones it mentions — `zone-<x>` or one of the zone's names (its
title, its boss, a generator name: AZURE / HALCYON / bulwark for A, BRINE / GALVANIC / SPUME for
B, …). Prints one block per group: the group key (the zone letters, e.g. `a`, `ab`, `abcdefghi`),
its file count, then the files. Read-only.

Run (from anywhere; the root argument is optional and defaults to the checkout holding this file):
    python3 docs/v2-run/helpers/r5r6/zonerefs.py [ROOT] > /home/sites/shmup-cup-run/<id>-zonerefs.txt
(<id> = your subtask id: each lane writes its own file in the run directory, never a shared path.)

`zonerefs.txt` next to this file is its output at bc8e05d (2026-10-18). Re-run it before a zone's
fixture triage: R2-02 … R4 move files and tests, so the lists drift.

Used by: `R5-01.S6b` (docs/v2-run/wave-10.md), the fixture triage: the tests in group `a` pin
zone A's content and must follow its redesign; the other zones' lanes may read their own group
the same way.
Delete when: R5's zone lanes are on master (after zone H's LAND, `R5-08.S7`, wave 12;
W12.DOCS-A deletes it).
Was: scratchpad r5r6/zonerefs.py of the R5/R6 re-plan scout (it hard-coded its worktree).
"""
import collections
import os
import re
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
root = sys.argv[1] if len(sys.argv) > 1 else subprocess.run(
    ['git', 'rev-parse', '--show-toplevel'], cwd=here, capture_output=True, text=True, check=True
).stdout.strip()
os.chdir(root)
files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True, check=True).stdout.split('\n')
dirs = ('test/', 'packages/', 'apps/', 'scripts/', 'tools/')
pat = {z: re.compile(r"zone-" + z + r"\b") for z in 'abcdefghi'}
names = {
    'a': r'AZURE|HALCYON|bulwark', 'b': r'BRINE|GALVANIC|SPUME|brine|galvanic', 'c': r'DUNE|SANDGRAVE|dune\b|widow',
    'd': r'MAGMA|CINDER|magma|bastion', 'e': r'TEMPEST|SQUALL|tempest|steed', 'f': r'CELL VAULT|MANTLE|vault-|regent',
    'g': r'PRISM|FACET|prism|facet', 'h': r'CITADEL|SOVEREIGN|citadel|sovereign', 'i': r'ABYSS|HOLLOW|abyss|angler|ark\b'}
res = collections.defaultdict(list)
for f in files:
    if not f.startswith(dirs) or not (f.endswith('.ts') or f.endswith('.mjs')):
        continue
    try:
        t = open(f, encoding='utf-8').read()
    except Exception:
        continue
    hit = [z for z in 'abcdefghi' if pat[z].search(t) or re.search(names[z], t)]
    if hit:
        res[''.join(hit)].append(f)
for k in sorted(res, key=lambda k: (len(k), k)):
    print(k, len(res[k]))
    for f in res[k]:
        print('   ', f)
