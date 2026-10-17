# Art round status (plan step R0-04)

Live status of the early AI art round. The spec is in `plan_resolution.md` R0-04, the runbook in
`docs/dev/art-generation-server.md`, and the driver section in `prompt_resolution.md`'s "Art round".
Last updated 2026-10-18 12:45 EDT.

## Server layout (skynet2)

- **LLM:** GPUs 0,1, port **30000**, started by the owner with `/root/run_sglang_qwenflashnext9b.sh`.
  **Never touch it.**
- **Image/video models:** GPUs 2,3, port **30001**, one at a time, from `/root/run_sglang_images_<name>-1.sh`.
- **Only ever use `art-prompts/v2/server.sh`** (`status | start <name> | wait <name> | stop <name> |
  verify`). Never stop SGLang by name or by GPU — `pkill -f sglang` and the like kill the LLM.
- After every stop: `server.sh verify` must say `VERIFY OK`, meaning the LLM is healthy and was not
  restarted, :30001 is empty and GPUs 2,3 are freed.
- Weights now on disk: FLUX.2-dev, Qwen-Image, SD3.5-large, FLUX.1-dev, Wan2.2-T2V-A14B. LTX-2.5 will
  download on first start (~163 GiB; it fits). The LTX-Video fallback (~237 GiB) would **not** fit
  without deleting something.

## Round 1 — two (or three) candidates per subject

Picker: <http://mystage.interserver.net/shmup-cup/> (files in `/home/sites/mystage/public_html/shmup-cup/`,
choices in its `data/choices.json`). The owner picks there.

| Session | Model | What | Status |
|---|---|---|---|
| 1 | FLUX.2-dev | slot a for 84 subjects + slot b for the 7 text items | **done** (91/91) |
| 2 | Qwen-Image | slot b for 75 subjects + slot a for the 7 text items | **done** (82/82) |
| 3 | SD3.5-large | slot b for the 9 terrain swatches | **done** (9/9) |
| 4 | FLUX.1-dev | slot c for 29 sets (stage scenes, swatches, non-text key moments and promo) | **done** (29/29) |
| 5 | Wan2.2-T2V-A14B | video slot a for the 29 text-to-video clips | **done** (29: 27 ok, 2 failed but kept) |
| 6 | LTX-2.5 (`TI2V`) | video slot b for the same 29 clips, plus 4 of the 5 image-to-video clips (slots a and b) | **done** (29 + 8 takes, all ok; ~10 s a clip) |

Images: 211 candidates. Video: 29 text-to-video clips × 2 slots. Five image-to-video clips wait for
round 2 (they start from a winning still; Wan2.2's I2V weights are not on skynet2, so LTX-2.5 does them):

- `video/dawn-flight-home` ← `moment/ending-citadel-falls-silent`;
- `video/blackhole-bomb-slowmo` ← `fx/black-hole/armed-scene` (a round-2 followup still);
- `video/zone-magma-deep-cone` ← `stage/magma-deep`;
- `video/zone-prism-labyrinth-refraction` ← `stage/prism-labyrinth`;
- `video/zone-neon-dimension-rush` ← `stage/high-speed-dimension`.

**Known weak or failed candidates** (the best try was kept; the other slot usually covers it):

- Wan2.2 slot a (videos):
  - failed, take kept: `video/coop-two-ship` (oversized cartoon ships, no lane trading, comet-tailed bullets),
    `video/bullet-to-gold` (red football-shaped bullets never turn gold);
  - weak: `ark-diving-abyss` (hull reads as a battleship), `social-vertical` (trim the first 2 frames),
    `zone-brine-nebula-gassea` (craft looks like a saucer), `zone-dune-expanse-twinsuns` (canopy drawn as a glider
    wing), `zone-iron-citadel-chase` (forward dolly, not a side view), `zone-abyssal-throne-glow` (upward tilt, not a
    descent), `manta-blackhole-vortex` (craft not a flat ray), `hollow-king-lure` (cel-shaded, not pixel art);
  - the other takes are kept in the session scratchpad (`wan-a-1/`, `wan-a-2/`).
- LTX-2.5 slot b (videos): all ok after extra takes (clips cost ~10 s, so up to 5 takes were used on the weak ones);
  still soft: `coop-two-ship` (cartoon, manta not tiny), `kestrel-bullet-weave` (threads a gap, no dodge),
  `breaking-surface-sunrise` (ship larger than asked); `halcyon-bulwark-shield`, `galvanic-maw-jaw`,
  `squall-steed-storm` open with a few junk frames to trim. Parked takes: scratchpad `ltx-b-1/`, `ltx-b-2/`.

- Qwen slot b:
  - failed: `item/power-capsule` (draws cans or pills), `boss/squall-steed` (ground strip),
    `enemy/dune-worm`, `enemy/ember-wisp` (ground strips, croppable), `enemy/option-hunter` (beam
    spills onto the key);
  - weak: `fx/mega-crash`.
- SD3.5 slot b, weak: `tiles/azure-verge`, `tiles/brine-nebula`, `tiles/dune-expanse`, `tiles/cell-vault`.
- FLUX.1 slot c:
  - failed: `moment/ending-citadel-falls`, `moment/ending-flagship-slips-away`, `promo/wide-banner`;
  - `stage/brine-nebula` has letterbox bars to crop;
  - six swatches darken at the right and bottom edges (crop about 24 px).
- Counts the models would not respect: `enemy/halo-crystal` (8 satellites, not 6), `enemy/vane`
  (4 blades, not 3), `enemy/gyre` (8 spokes, not 4).
- Alternatives kept in the session scratchpad, outside the repo: a facet-monarch orbit version and an
  iron-citadel scene with stray text.

**Prompting lessons for later sessions:**
- Key green comes out as a slightly yellowish green, not pure #00FF00; ingest needs tolerance.
- Qwen adds shadows, ground strips and frames.
- FLUX.1 adds letterbox bars at 1536×640.
- Metaphors get drawn literally (chains, lanterns, stairways, hearts, sails).
- Say where the ship's nose and engines are so it faces right.
- Bullets must be described as round glowing orbs ("capsules" pulls them toward pills or footballs).
- Video models draw a "small" ship huge and cartoonish unless told "tiny sprite, a small fraction of the frame",
  point it left unless told "nose pointing right, flame trailing left", and add pilots unless the negative says
  "human pilot, people".
- LTX-2.5 (distilled, 8 steps, guidance 1): the negative prompt has little effect, so say everything in the positive
  prompt; open with "a retro 16-bit video game scene drawn in chunky pixel art with visible square pixels" or it looks
  3D; text-to-video often opens with 1–6 junk frames (trim ~0.25 s at ingest); keep a wordmark present and unlit from
  frame 0 ("the letters never move; only their light changes"); describe start and end states for a move; a small
  ship needs "a wide establishing shot … far away, only a few pixels tall" at the END of the prompt; "no cockpit, no
  canopy, no pilot" (a glass bubble becomes a seated figure); image-to-video defaults to a push-in — "the ship holds
  its place while the landscape scrolls by in parallax layers" keeps the still's layout. ~6–11 s per clip.
- Wan2.2 render times (server): 1280×720 81 frames ≈ 958 s at 40 steps / 838 s at 35; 832×480 ≈ 204 s at 35 steps.

## Round 2 — progress

- **Regenerations the owner asked for** (`enemy/halo-crystal`: 8 satellites, the design says 6; `tiles/azure-verge`:
  grass too close to the key green). Old files are in `candidates/history/2026-10-17/`; both sets' winners were
  cleared so the owner picks again.
  - Qwen-Image slot b of halo-crystal: weak — six satellites, but in two columns of three, with a small shadow.
    Qwen drifts back to 8 whenever it draws a round ring.
  - SD3.5 slot b of azure-verge: weak — no key-like pixels (round 1 had 5.5 %), but an isometric view, little
    vegetation and a dark frame. SD3.5 turns the word "moss" lime whatever the colour words say.
  - Slot a (FLUX.2) of both and slot c (FLUX.1) of azure-verge wait for the owner's FLUX licence decision
    (`docs/dev/art-provenance.md`).
- **The owner picked all 33 video sets** (no comments, no regenerations) and said to go on with the FLUX work
  (2026-10-17; the licence question in `docs/dev/art-provenance.md` is settled before anything ships).
- **FLUX.2-dev session (running since 2026-10-17 16:40, paused once, resumed the same day):** 199 followups from the
  winners, rebuilt from the current picks (`candidates/round2/worklist.json`; agents A = bosses 66, B = crafts, logos
  and enemies 60, C = fx, items, endings, stages and tiles 73 with `fx/black-hole/armed-scene` first), plus agent D's
  slot-a regenerations of `enemy/halo-crystal` and `tiles/azure-verge`. Followups land at
  `candidates/<winner slot>/<followup id>.png`; the patched picker shows each next to its winner.
- **FLUX.2 results** (all four agents done on 2026-10-17; 199 followups + 2 regenerations, 0 failed):
  - **D** (slot-a regenerations): `enemy/halo-crystal` ok, exactly six satellites on a hexagon, clean key, first try;
    `tiles/azure-verge` ok, 0 % key-like pixels, a front-on fern ledge on teal stone, third try (try 1 was a framed block
    on white, try 2 had white gaps between the leaf tips). Round-1 slot-a files archived to `candidates/history/2026-10-17/a/`.
    The round-1 slot-a azure swatch was 0 % key-like too: the green the owner flagged was in another slot's winner.
  - **A** (66 boss followups): 47 ok, 19 weak, 0 failed (127 runs). Parts sheets are weak 12 of 14 (the whole boss in
    every cell, a 4×4 or 3×3 grid, gutter lines; only `boss/mantle-regent/parts` is clean).
  - **B** (60 craft, logo and enemy followups): 48 ok, 12 weak, 0 failed (113 runs). Animation sheets barely animate
    (cells nearly the same pose): the KESTREL and MANTA in-game sheets, Option frames, several enemies.
    **`enemy/sentinel-walker/zone-encounter` is mirrored in all three tries — flip it horizontally.**
  - **C** (73 fx, item, ending, stage and tile followups): 47 ok, 26 weak, 0 failed (174 runs, about 5 h of GPU time
    shared with A, B and D).
    - `fx/black-hole/armed-scene` weak (three spiral arms and pink orbs streaming at the core, but about ten bullets
      drawn as small red canisters and the trails read as outward) — one more try follows, it is the LTX source.
    - Endings' second panels, posters, most layers and the store capsule: ok. The DUNE poster's fighter faces left in
      all three tries — flip it horizontally.
    - Weak, to paint out at cleanup: orbs drawn into four backdrop layers (BRINE near; DUNE far; TEMPEST mid and near).
    - Tilesets: asked for a 4×5 grid of 20; only DUNE and CELL VAULT came out with 20 (others 16, 22, 24 or 30), and
      DUNE and PRISM have 3D blocks.
    - The darker DUNE / TEMPEST / BRINE far layers meet the median ≤ 64 / p95 ≤ 140 budget but crush 36–45 % of the
      pixels below luma 16 (lift the darks at ingest); the TEMPEST mid-far ridge ignored the darker request (113 / 225).
    - Animation sheets again barely move (black-hole spin frames); the special-capsules sheet kept its reference's 4×4.
  - **Armed-scene retry** (the LTX source, 3 more tries): kept a new take without tails (seed 23051), ok — about 20
    round pink orbs on three smooth spiral bands, no canisters, no text. Tails always read as outward motion, so the
    still carries none and the clip adds the motion. C's take and the other tries are parked in the orchestrator's
    scratchpad (`flux2-r2-armed/tries/`).
- **FLUX.1-dev, slot c of `tiles/azure-verge`** (2026-10-17, 3 takes, all kept in `candidates/history/2026-10-17/c/`):
  take 3 (seed 4417263) is weak but usable — 0 % key-like pixels, front-on teal-turquoise ferns over horizontal
  green-teal strata, no text; a dark 6–10 px band on the left, right and bottom edges (crop it). Take 1 had a
  watermark-like word, take 2 two bright-green clumps.
- **LTX-2.5, `video/blackhole-bomb-slowmo`** (image-to-video from the armed-scene still, 736×736, 5 s):
  - slot a ok on the first take — the orbs slide inward along the arms, shrink and vanish into the core, the spiral
    turns, the camera holds still;
  - slot b weak after 3 takes (the lightning-roll idea) — the white-blue arc ring grows outward but the orbs survive
    it. A parked take (`ltx-r2-blackhole/takes/b2/` in the orchestrator's scratchpad) tells the story better (the orbs
    pop into sparkles) but drifts outward first — it can be swapped in if the owner prefers.
- **Image-to-video lessons (LTX-2.5):** "static locked camera, no zoom" at the start and the end stops the push-in;
  one continuous motion works first time, two events in a row get squeezed together; a cause is drawn but its effect
  on other objects is often dropped ("every orb it touches pops"); state the final frames or the picture fades; "one
  complete circle, centred on the core, grows outward like a ripple on water" gives a true expanding ring; measuring
  the orbs' distance from the centre over the frames catches drift that a contact sheet hides.
  - Per-job tables: the agents' `results` files in the orchestrator's scratchpad (`flux2-r2-A/`, `-B/`, `-C/`, `-D/`).
- **Prompt lessons from FLUX.2 (edit mode):**
  - In scene followups the small player craft is drawn from behind, pointing up or facing left, or as a generic jet.
    Adding the KESTREL winner as a second `--edit-from` reference fixed it in 16 of 17 scenes.
  - Words are drawn literally: "spent bullets" → brass casings, "canopy" → umbrella or hang-glider, "lantern core" → a
    camping lantern, "heart core" → an anatomical heart, "bullet like a needle" → an orb on a needle.
  - Bullets drift to pills, cylinders or canisters; "lone round glowing orb" fixes most.
  - Multi-cell sheets: FLUX.2 redraws the whole subject per cell, changes the grid and adds gutter lines; frames of an
    animation stay nearly identical.
  - A closing sentence about the enemy bullets ("round glowing orbs …") in a backdrop layer's prompt makes FLUX.2 draw
    orbs into the backdrop: leave it out of layer prompts.
  - Layers copy the reference scene or come out as a filled strip in a box; "a skyline against the key" or "separate
    pieces" fixes most. Grid counts in tileset prompts are not kept.
- **All round-2 generation is done** (2026-10-17 19:15; skynet2's cards 2 and 3 are empty, VERIFY OK). Still to do:
  1. The owner reviews round 2 on the picker (followups appear next to their winners: accept, comment or
     regenerate), flips `enemy/sentinel-walker/zone-encounter` and the DUNE poster horizontally, and re-picks
     `enemy/halo-crystal` and `tiles/azure-verge` (new candidates in every slot).
  2. A short FLUX.2 session for the four held followups of those two (halo frames, zone roster sheet, zone
     encounter; azure tileset), plus whatever comments and regenerations the owner asks for.
  3. Winners and followups go to `winners/<id>/` (decide on Git LFS first).

## Round 2 — after the owner says picking is done

Read `data/choices.json`:

1. **Followups** (203 in the manifest): generate with FLUX.2-dev, using the winner as reference
   (`gen-candidate.mjs --edit-from <winner.png>`).
2. **Comments:** apply each one as a FLUX.2 edit of the winner, written as a new file.
3. **`regenerate: true`:** new candidates in both slots with the round-1 slot models and a new idea.
4. **The five image-to-video clips:** LTX-2.5 from their winning stills (`--source`).
5. The owner picks again where needed. Winners and their followups are then copied to
   `art-prompts/v2/winners/<id>/` and committed (decide on Git LFS first if they get large).
   Candidates stay git-ignored.

One model session at a time; stop and verify after each.
