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
- **FLUX.2-dev session (running since 2026-10-17 16:40, paused once, resumed 2026-10-18):** 199 followups from the
  winners, rebuilt from the current picks (`candidates/round2/worklist.json`; agents A = bosses 66, B = crafts, logos
  and enemies 60, C = fx, items, endings, stages and tiles 73 with `fx/black-hole/armed-scene` first), plus agent D's
  slot-a regenerations of `enemy/halo-crystal` and `tiles/azure-verge`. Followups land at
  `candidates/<winner slot>/<followup id>.png`; the patched picker shows each next to its winner.
- **Still to do after FLUX.2:** FLUX.1-dev slot c of `tiles/azure-verge`; LTX-2.5 for `video/blackhole-bomb-slowmo`
  from the armed-scene followup (slots a and b); after the owner re-picks halo-crystal and azure-verge, their four
  followups (frames, zone roster sheet, zone encounter; tileset) in a short FLUX.2 session; then the owner reviews
  round 2 on the picker, and winners go to `winners/<id>/`.

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
