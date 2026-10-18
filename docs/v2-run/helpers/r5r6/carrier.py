"""carrier.py — which zone A enemies the other zones and the shared rosters use.

What it does: for each zone B … I, prints the zone A enemy ids its stage's `events` and `remix`
spawn (the finding: `tender`, zone A's capsule carrier, is spawned by every zone B–I, so its sim
fields are frozen in R5); then every zone A enemy with its sprite and script; then the ids,
sprites and scripts of the `bonus`, `extras`, `zone-h` and `advanced-bosses` rosters. Read-only.

Run (from anywhere; the root argument is optional and defaults to the checkout holding this file):
    python3 docs/v2-run/helpers/r5r6/carrier.py [ROOT]

Used by: `R5-01.S4a` (the frozen shared entries — `tender` in every zone, `picket` /
`halcyon-bulwark` in bonus-range; docs/v2-run/wave-10.md) and `R5-01.RV`; re-run it in each zone
lane's review to check that no frozen entry moved.
Delete when: R5 is on master (after R5-10).
Was: scratchpad r5r6/carrier.py of the R5/R6 re-plan scout (it hard-coded its worktree).
"""
import json
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
root = sys.argv[1] if len(sys.argv) > 1 else subprocess.run(
    ['git', 'rev-parse', '--show-toplevel'], cwd=here, capture_output=True, text=True, check=True
).stdout.strip()
os.chdir(root)
a = {e['id']: e for e in json.load(open('content/enemies/zone-a.enemies.json'))['enemies']}
for z in 'bcdefghi':
    d = json.load(open(f'content/stages/zone-{z}.stage.json'))
    used = set()
    for e in d['events'] + d.get('remix', []):
        if e.get('enemy') in a:
            used.add(e['enemy'])
    print(z, used)
print({k: (v.get('sprite'), v.get('script')) for k, v in a.items()})
for f in ['bonus', 'extras', 'zone-h', 'advanced-bosses']:
    d = json.load(open(f'content/enemies/{f}.enemies.json'))
    print(f, [(e['id'], e.get('sprite'), e.get('script')) for e in d['enemies']])
