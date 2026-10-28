# What is left — every manual action, in one place

> **The code is finished. The product is not.**
>
> All 45 steps of [`shmup_plan.md`](../old/shmup_plan.md) are built, reviewed, tested and
> documented — and so is every step of v2's plan, [`plan_resolution.md`](../../plan_resolution.md):
> the 640×360 remaster is released as version **2.0.0** (2026-10-24). Everything still open needs
> something no agent in this repository has: **a monitor or a TV in your hands, a developer or store
> account, or a human with an eye or an ear** (a native speaker, a pixel artist, a musician).
> Nothing below is blocked on code; a few items will *produce* code once they are done, and those
> say so.

This page is the single list. It gathers what used to be spread over plan §8.2, §8.4 … §8.9 and
half a dozen client pages, and it says of each item **what it blocks**. The detailed recipes stay
where they were — each entry links to its page — because they are long and they belong next to the
thing they describe.

**Status note (2026-10-26, closed 2026-10-27):** the art round below ran to its end: the owner's
quality-first ruling (decision R6-D5) retired the SNES-era ceiling, the detail-regeneration
lanes re-queued every interim name, and the harvest that followed (REING-6 → PIXMAP-1, waves
14–15) took the class of names still served from an upscaled v2 pixel map **from 118 to zero** —
no name waits in the queue any more. That program blocked nothing on this page; its final state
reads in [real-assets.md](../dev/real-assets.md) and the art rows of §3.

## How to read the three groups

| Group | Meaning |
|---|---|
| [**Blocks a release on the Samsung monitors**](#1-blocks-a-release-on-the-samsung-monitors) | The primary target. Until these are done the game cannot be submitted, and it has never been seen running on the hardware it was written for. |
| [**Blocks one other platform each**](#2-blocks-one-other-platform-each) | LG webOS, Steam and the Steam Deck, itch.io. Each is independent: skipping one costs you that platform and nothing else. |
| [**Polish — blocks nothing**](#3-polish--blocks-nothing) | Worth doing, safe to defer. The game ships without any of it. |

A fourth thing is worth stating once, because it colours everything below. **The music and the
Spanish and Japanese translations are placeholders** — original, deliberate and complete (every
sound and all 387 strings in three languages exist), but written by an agent, not composed by a
musician or read by a native speaker. **The art is no longer one.** The R6-03.S3 real-art round
closed on 2026-10-27 at the end of its detail-regeneration program: **231 of the atlas's 619
sprites ship real AI-assisted art** (142 `.art.json` records plus the `@flash`, `@p2` and
`@palette` siblings the packer derives) and the class of names still served from an upscaled v2
pixel map stands at **zero** — the interim pool is empty on the live tree for the first time;
what remains procedural is the build's own v2 kit, chosen by measured evidence, and the
generation classes that stayed banked are listed in [real-assets.md](../dev/real-assets.md).
See [what "placeholder" means here](#what-placeholder-means-here).

---

## 1. Blocks a release on the Samsung monitors

The Samsung Smart Monitor M7 (Tizen 5.5) is what this game was written for, and the only hardware
the project has ever touched — and even there, only the **input probe** (2026-09-15,
[results](../dev/input-probe-results.md)) and the **TV render bench** (15 sessions on monitor
10.0.0.224, 2026-10-19, and the 2026-10-27 re-measure, read in §3) have run on it. **The game
itself has never been installed on a monitor.**

### 1.1 Play it on the monitors (plan §8.4, §8.5)

Everything else on this page can wait behind this one. Set up per
[`install-on-tv.md`](install-on-tv.md), then work the two checklists:

- **M1 checks** — plan [§8.4](../old/shmup_plan.md#84-m1-on-device-checks-both-monitors): launch
  ≤ 10 s, a crisp ×5 picture, zone A cleared with the remote alone — since R5-01 that means the
  remastered rim (`9d0b472`): its 2.25 px/tick blue lick and the 48-px spire gaps are exactly what
  a remote-only clear proves on hardware — Back / Home / exit behaviour,
  audio, saves across a relaunch and an update install, 15 minutes without a hitch, gamepad and
  keyboard. Guide: [`debug-tools.md`](debug-tools.md#the-m1-release-check).
- **The eight remaster sign-offs (waves 11–13)** — zones B (`1d3fd600`), C (`247e39fb`),
  D (`927b137f`), E (`fe4cdae3`), F (`5319d732`) and G (`66122e87`) each landed their remaster
  with recorded god-mode clears, zone H joined them in wave 12 (`a2d94928`) and zone I closed the
  set in wave 13 (`2d35a7a5`); none of the eight has been played on a monitor since. The owner's
  part per zone:
  a `build:dev` install on the M7, fly the stage, sign it off — the WARNING-to-boss stretch in
  particular, where each remaster's new set pieces arrive (the dive, the dune-surf, the chase,
  the shutters, in zone H the gate with its swinging plate slabs and the shadow they throw
  across the checkpoint's ship rows, and in zone I the trench and the ARK raid's 90 seconds).
- **M2 / v1.0 checks** — plan [§8.5](../old/shmup_plan.md#85-m2-on-device-checks-both-monitors):
  co-op, three routes to both endings, the attract loop, rebinding, the 30-minute soak, the update
  and uninstall save rules, live reload. Guide:
  [`release-candidate.md`](release-candidate.md#the-v10-checklist-both-monitors).
- **The M3-02b block inside §8.4** (the tuning the probe's findings produced): the overlay's `TPF`
  counters while flying, Home during play, the INPUT TEST's three-press exit.
- **The 2.0.0 release session** (plan_resolution.md R6-03): a `build:dev` install of the release
  line on an M7, the §8.4 checks at 640×360, the guided render capture (`rp-` — §3; it carries the
  boot ≤ 10 s and whole-process memory figures R6-02.P3 could not measure), and one complete route
  on a human's remote. The render budgets are already met on firmware (R6-02.P3, §3); the game's
  own frame on the monitors is the one number no bench can supply.
- **The 2.1.0 rebuild confirm** (plan v20x closeout — one install covers the era): the bitmap page
  decode (P0-1 `e519e80e` — the owner document's **−47…−56 %** file→GPU claim and the
  ≈1493→≈790 ms zone-load figure want the monitors' confirmation; the desktop gate proved
  byte-identity and the upload mechanism on SwiftShader only), the context-loss watchdog
  (P0-3 `628a1afa` — it cannot be provoked on the TV, so the reading is the **absence** of hangs),
  the TV resume (the checkpoint store and the title's CONTINUE? row; the `?scenario=rewind` bench
  row replaces the engine's **÷12 estimate** with a measured M7 figure — TL-4's verdict is
  ≈2–3 s for a full rewind at 5–10 k steps/s), the cutscene video (its two bench knob rows
  adjudicate the default flip — `VIDEO_DEFAULT_ON` is false pending the owner ruling of
  2026-10-27), and the ending stills (five paintings, default on). Plus the owner's UX call on the
  colour-key bindings P0-2 registered (`8cb4b0cf`): the shortlist is red→Special, green→Speed,
  yellow→palette cycle, blue→CRT toggle.

Results go into the checklists themselves and anything surprising into
[`docs/dev/input-probe-results.md`](../dev/input-probe-results.md).

### 1.2 Store readiness and the Seller Office (plan §8.6, §8.9)

Recipe: [`store-submission.md`](store-submission.md). **Nothing has been packaged or submitted.**

- A **Samsung TV Seller Office account** (Public Seller registration is US-only).
- The **trade-dress review**: the title, the logo and the key art must not read as Konami's or
  Taito's. Everything in the repo is original work, but no lawyer has looked at it.
- The **Tizen mandatory checklist** — launch time, no crash or freeze, Back / Exit behaviour,
  multitasking, resume from Smart Hub, uninstall deleting user data. Most of it overlaps §8.5.
- **Store assets.** `pnpm store:assets` generates the icons and placeholder store images, but
  **their sizes were never verified against the Seller Office's current requirements** — they are
  an assumption written from documentation. Check them before uploading.
- The **alpha test with ≤ 50 DUIDs** (the M70A is in the 2020 device group).

### 1.3 Decide what to do about the placeholder Spanish and Japanese

Plan §8.9. Shipping a language nobody who speaks it has read is a product decision, not a technical
one. There are two honest ways out, and both are cheap:

- **Have a native speaker read them.** It is an edit of two files,
  `content/strings/es.strings.json` and `ja.strings.json`; `pnpm content:check` enforces the rules
  (every id answered, the fixed ids unchanged, every character drawable). Rules and the reviewer's
  brief: [`content/strings/README.md`](../../content/strings/README.md).
- **Or ship English only** by deleting the two files — the LANGUAGE row is built from the string
  tables that are present, so removing them leaves ENGLISH as its only choice, with no code change.

The **84 katakana and 9 accented capitals** the Japanese and Spanish text needs were drawn by an
agent at 5×7 pixels. A pixel-font artist should pass over them before the Japanese is shown to
anyone who reads it — see [`real-assets.md`](../dev/real-assets.md).

### 1.4 The v2 manifest boot on the M7 (W3-7)

Since R1-05 the TV bundle keeps the atlas **manifest outside `app.js`** and fetches
`assets/atlas/main.json` by **XHR from `file://`**. The e2e specs drive the TV builds over
`file://` on desktop Chromium, but the path is **never verified on the real firmware** — the
owner's part of plan_resolution.md R2-01: install a current v2 build on an M7 and confirm it
**boots to the title**. If it ever stops on
**ATLAS MANIFEST FAILED TO LOAD**, the fix is one import line in the app's `main.ts`
(`virtual:shmup-assets-inline` inlines the manifest again) and the bundle check's rule 10 relaxed
in the same change — the recipe is in
[`build-test-deploy.md`](../dev/build-test-deploy.md#troubleshooting) and
[`rendering-and-shell.md`](../dev/rendering-and-shell.md#the-boot-sequence). The same install now
also confirms the **`String.prototype.matchAll` polyfill**: PixiJS 8.22 needs it and neither TV's
Chromium (69 / 68) has it, so both builds prepend it beside the globalThis file (landed 2026-10-20,
`2987d225`) — a boot to the title clears both at once. And it closes the **hitbox marker's
restyle** found on master (`b684a6c7`, wave 15): the marker filled a solid white core inside its
rim — 25 opaque px over the ship's centre at the KESTREL's hurt radius — where the review's verdict
was that the 7×7 box is the hurt truth but the **fill** was the problem; it now draws a 1-px rim
ring only, inside open. A rebuild and reinstall of a current `build:dev` is what confirms both on
hardware. This gates the v2 TV release like §1.1:
v1.0.0 shipped with the manifest inlined, so only v2 builds take this path, and the 2.0.0 release
session (§1.1) is where both are proven.

---

## 2. Blocks one other platform each

### 2.1 LG webOS (plan §8.7)

Recipe and the on-device checklist: [`webos.md`](webos.md). **`apps/webos` has never run on
hardware**: no LG TV, no LG developer account, no webOS SDK, and `ares-package` / `ares-install` /
`ares-launch` have never been executed. Treat the first run as untested code, not as a regression;
the boot itself rides the same polyfill pair the Tizen build carries (globalThis plus the
`String.prototype.matchAll` file PixiJS 8.22 needs, `2987d225`) — Chromium 68 has no `matchAll`, so
a title screen on the set is the proof.

Needed: a webOS **5.0 or newer** set, the webOS TV SDK, an LG developer account and Developer Mode
on the TV. Then build → package → install → run, and work the checklist — especially **Back (461)**
in every screen, **which event the TV fires** when the Home bar comes up (the adapter tracks both
`visibilitychange` and `blur` defensively because nobody could ask the hardware), and that
OPTIONS → CONTROLS offers **exactly one** profile.

### 2.2 Steam and the Steam Deck (plan §8.8)

Recipe: [`steam.md`](steam.md). **Nothing has touched Steam.** There is no partner account and no
app id, `steamworks-ffi-node` is deliberately not a dependency, and the code falls back to Valve's
public *Spacewar* test id (480) — a placeholder, not an allocation.

Needed, in order: a **partner account and a real app id**; the **11 achievements** created in the
partner site with exactly the API names the code uses (`FIRST_LAUNCH` … `ARCADE_DIFFICULTY`);
a Steam build that **supplies the binding** (one `load` callback — the seam is already there);
**Steam Cloud** enabled with a quota for `save.v1.json` and `window.json`; the **SteamPipe** upload.
Then **Steam Deck verification** — Game Mode and Desktop Mode, the pad through every menu, 1280×800
against the SCALE and ASPECT options, 60 Hz and 40 Hz, suspend/resume, battery and heat, a save
syncing with a desktop, the 6-px HUD text at 7 inches — and the **Deck Verified** submission.

### 2.3 itch.io (plan §8.9)

Recipe: [`web-release.md`](web-release.md). Needed: an **itch.io account**, then
`pnpm --filter @shmup/web build && pnpm itch:package` and the upload. **`pnpm itch:package` has
never been run against a real build here** — its tests pack temporary fixtures — so check the
archive in a browser before you publish it.

---

## 3. Polish — blocks nothing

- **The 240 fps latency video** (plan §8.2, §8.4). The only latency figure the project has came
  from a 30 fps camera, which cannot resolve one frame at 60 Hz. Film the probe's flash box and the
  game's ship reacting to a press. It measures; it changes nothing by itself.
- **Two gamepads at once on a monitor** (plan §8.2, §8.4). Co-op with two pads is tested in the
  suite and was played with a remote plus one pad; two pads on the TV has never been tried.
- **The M3-02f render-profile capture** (plan §8.4) — the one owner measurement the release leaves
  open. The guided on-screen checklist plus the log server fill
  [`input-probe-results.md` §11](../dev/input-probe-results.md); R6-02.P2 built the wave-13 kit and
  put its checklist in [`install-on-tv.md`](install-on-tv.md), and no `rp-` session has run since.
  Since M3-02e the headless bench already gates the render work, so this is confirmation on real
  silicon, not a gate — but the release's **boot ≤ 10 s** and **whole-process memory** figures ride
  on it (R6-02.P3 read them *not measured, not missed*), as does a fresh zone-load re-measure — the
  2026-10-19 numbers were taken on builds that pre-date the final art. Owner's recipe:
  [`debug-tools.md`](debug-tools.md#the-guided-capture-preferred).
- **The v2 TV-bench run on the M7** (plan_resolution.md R0-03, decisions W5-15 / W5-19) — **run and
  read: 2026-10-19, monitor 10.0.0.224, 15 committed sessions** (R0-02's 18-scenario matrix grown
  to **172 rows** — fifteen resolutions × two art densities + knob rows — plus the resolution
  sweeps; the tables and verdicts are in
  [`render-performance-review.md`](../dev/render-performance-review.md) and the
  [`input-probe-results.md`](../dev/input-probe-results.md) log record). Against the budgets
  (R6-02.P3): **zone load ≤ 2 s MET on firmware** — cold first atlas 1.48–1.59 s, zone change
  0.73–0.77 s — so W5-19's verdict is in (the ≈ 0.5 s headless projection was optimistic; the gate
  holds); **TPF 1 met** at the shipped Auto output (≥ 98 % of frames in the normal-play rows); the
  absolute render-ms reading misses the 8 ms budget **as a panel floor** — v1's own baseline shares
  it — while the scene-attributable reading is inside budget and the headless gate is green (worst
  p95 1.60 ms of 16 ms); **memory met** on every counted component (JS heap ≤ 30.8 MiB, atlas
  textures 8 MiB, counted total ≤ 21 MiB GPU, draw calls 11–16 against feat §22's 20–50). So **no
  TV mitigation ships**: P4a (parallax cap), P4b (half-res far layers), P4c (CRT off on the TV) and
  P4d (WebGL 2 by default) are recorded **not needed** — a mitigation ships only if the numbers miss
  a budget, and they do not. What the run leaves open for the rows above: the **second M7**
  (10.0.0.8 has only the 2026-09-15 probe sessions), the **WebGL context-loss** recovery on
  firmware (R3-04.M3d; `WEBGL_lose_context` in the remote Web Inspector does it on demand) and the
  lazy residency read on a set (**W5-15**, with **W5-2** — the ship's spawn row is the frame
  centre). Recipe:
  [`build-test-deploy.md` § The TV render bench](../dev/build-test-deploy.md#the-tv-render-bench-r0-02);
  commit the sessions to `tools/input-probe/results/<date>-m7-bench/` and print them with
  `results/analyze-bench.mjs` (it estimates from the measured stand-in pages since R3-04.M4a).
- **The 2026-10-27 M7 re-measure wants its repeat** (v2.1.0 hardware pass, plan R0-03). The run
  happened — the 174-scenario matrix on monitor 10.0.0.224 with the final art, committed in
  [`tools/input-probe/results/2026-10-27-m7-bench/`](../../tools/input-probe/results/2026-10-27-m7-bench/)
  with its README and partitioned tables (`3c24d608`, `898021ee`): 640×360 inside the Oct-19 band,
  §13's performance-step tier unchanged, zone load **measured** at 654 / 286 ms. But it is **one
  window per scenario** — no noise floor — so every small verdict rode in single-sample: the
  video-knob's sign (−4.7 / −4.5 pts at 640×360, the reading that adjudicates the default-ON
  flip), the ±0.1 / ±0.4 pt band overshoots, the fit/stretch deltas. What to do: one repeat run of
  the current **190-row** suite (`4b37d123`, ≈ 101 min at the measured ≈ 30.4 s-a-row pace) — two
  windows of one build give those verdicts their floor, which the folder's aborted-launch pair
  says is not kind (sync p95 median 16 %, two-tick 2.7 pts).
- **The hardware bench's S2 / S3 / S4 page bodies** (plan v20x HARBENCH): the plumbing shipped in
  v2.1.0 — the versioned `hb-` wire exported from `@shmup/shell` (`8ee8f91f`), the widget's
  `harb.ts` sender, the `?gm=` game-mode A/B flag and the five-key remote registration
  (`4b37d123`), and the rewind row already POSTs on it — but the boot + memory-soak, probe and
  input **page bodies** were dropped at the finish line by the owner's ruling. The record union
  carries their shapes (boot / memory / probe / input / watchdog) and waits for whoever times the
  pages.
- **The cullable-spike knob — dropped with reason** (v2.1.0 bench pass): a bench-only
  `cullable = true` flip would set Pixi flags on the engine-owned `SpriteBatch` structures, and
  the Culler's activation is unverifiable in this codebase without a real GPU draw-call reading —
  the kill rule wants a lane watching `drawCalls` on firmware, not a desktop knob. The
  zero-cullable greps stay untouched; the row returns only with a measured reason.
- **The tracker-music CPU benchmark** (plan §8.9). The *size* half is already answered in code —
  libopenmpt's worklet is ≈ 518 KB gzip against a 512 KB bundle budget, so a tracker player can
  only ever be a separately loaded file. The *CPU* half needs the library and a monitor. Doing it
  means writing code (a `TrackerBackend` over `chiptune3` in a dev build); the seam it plugs into
  ships today. Background: [`audio.md`](../dev/audio.md).
- **The v2 look on the M7** (plan_resolution.md R2-01 / R2-04, the owner part). The interim era is
  over — the shipped build draws v2's own art and the native 9×12 font — so what remains is the
  look during play: text readability on a TV (`build:dev` on the M7), the es / ja front end on a
  set, and a `V1 REPLAY` row (an old `replay.last` kept by a v2 build, shown delete-only —
  [`extra-modes-and-replays.md`](extra-modes-and-replays.md)). R2-04's play session asks for zones
  A, D and I on the M7 with the overlay's `TPF` and `RENDER` — and wave 11 wrote the last clause
  six times for zones B … G, wave 12 added H's 20,250 px (`a2d94928`) and wave 13 I (`2d35a7a5`):
  none of the eight remasters, and not the flipped frame itself, has ever drawn a frame on a TV.
  Every play in §1.1 runs on hardware for the first time.
- **Real art — the round is DONE (waves 14–15, closed 2026-10-27).** **231 of the atlas's 619
  sprites ship real AI-assisted art** — `node scripts/art-origins.mjs`: 142 `.art.json` records
  plus the 75 `@flash`, 5 `@p2` and 9 `@palette` siblings the packer derives, zero failures; the
  other 388 are procedural (the build's own generators and pixel maps) — the closeout had tallied
  150 records and 239 served before the closing day's two WEAPONLOOK retire rounds retired eight
  bolt overrides to hand-drawn pixel maps; the era-final arc of the
  interim pool reads in [real-assets.md](../dev/real-assets.md). The program: the S3 harvest landed
  **33 names** cut from the owner's 299 picker winners (zones A–I 25, the palette round 8); the
  GEN-1 re-ingests added **2 more names** (`tiles/terrain-prism-v2`, `fx/black-hole`)
  and re-cut two of the 33 from better cells; REING-2 shipped the two **capsules** (`items/capsule`,
  `capsule-blue`, 8 frames); and the owner-waived GEN-4 batch landed **42 never-picked names** in
  one commit (*"ai generate those other things too"*, 2026-10-26) — 16 enemies, 12 boss parts,
  8 decor, 4 fx glows, 2 shields — boss parts including the azure captain's shell and the
  storm-eye's cloud, core and ring, the herald, king, maw, scorpion and steed pieces, and the
  Direct arm and reduce pods. What
  stays procedural is **evidence, not caution** (the era's reports, `w15-GEN4/REING1/REING2-report.md`
  in the run record): terrain tilesets beyond prism die on the **green-anchor pathology** (cells read
  back at the key-green itself or near it, ≈ (68,254,0)–(93,194,37), with boundary ink 35–100 %,
  three attempts per sheet) — the tileset half of that verdict was cured the same day: GEN-5's
  ROUND B retried the proven contact-grid ask shape and five sheets came PROBE-OK (reef, magma,
  ridge, vault, citadel; only abyss still stops, on guide-line ink); REING-6 and REING-7 landed
  them all — four full grids and, by the wide-canvas cure (a 36-cell grid as one 9 × 4 opaque
  full-bleed contact sheet), terrain-ridge too; backdrop **wrap and flat
  bands** never wrap or flatten
  (edge-reach ≤ 6/256 rows in six tries) — the raster bands stay generators; **merged kit rows and
  wide silhouettes** fail the frame probes (aspect ratios 1.0–1.2 against slots ≥ 1.75); and the
  waiver's ten never-designed rows stopped with per-name probe numbers (gnat / dune-lance / skiff /
  skipper / lightbird / steed-mane / prism-glint / deep-tender / `items/point` / `fx/sparkle` — the
  STOP table). The six kit bosses whose re-poses would move anim frame **counts** (maw, widow,
  bastion, steed, sovereign, ark) stay owner pool decisions under the pool-paid rule — nothing of
  theirs moved. The four provenance stores stay committed:
  `winners/` (299 images + the 35 owner clips since wave 15), `gen3/` (62 approved-derivative rows,
  52 clean), `gen5/` (68 waived rows, 42 clean), `gen6/` — the owner-improvement round, 33 rows
  with 20 PROBE-OK sheets (the ship / option / item / player-shot redesigns and the five landed
  tilesets), generated without a pick under the same waiver, `6feb4e9c`). Three governance lines
  ride the whole set: the FLUX
  non-commercial basis of 2026-10-23 (§8 decision 1) — **before any paid distribution a BFL
  commercial licence (bfl.ai/licensing) must be in place**, the monetization row below carries it —
  and the 2026-10-26 picker waiver, with the halo-crystal's code re-lay owning the `code` row of
  `models.json` (own licence, section 2), and the 2026-10-26 quality-first ruling (R6-D5), which
  retires the SNES-era ceiling and governs every prompt the detail-regen rounds send. Nothing
  waits on FLUX any more — that gate was ruled on 2026-10-23. **The detail-regeneration program
  ran to its close (opened 2026-10-26, closed 2026-10-27):** REING-6 re-ingested the landed
  `gen6/` sheets (16 rows cost-0), the GEN-7..13 stores fed REING-7 → REING-123 round by round —
  the nine **zone-map planets** shipped first as the procedural generator (*"unique planets for
  each zone ... with the letters"*, 2026-10-26) and then as their own native art, the **weapon-
  family** and **Option** redesigns, **item flavours** and the ship heroes all landed, and the
  two classes no sheet ever drew (the kestrel thruster, the missile lance) were won back at
  **zero GPU cost** from committed code-frame recipes. The era closed with the interim pool at
  **0 names** — 79 records and 130 served sprites became 142 and 231 across the run (the round
  closed at 150 and 239, and the two WEAPONLOOK retire rounds of the closing day, 2026-10-27,
  retired the eight gen6 FLUX bolt overrides to hand-drawn pixel maps), every cap
  and floor raise dated and measured under the owner's carve-out (*"ok to go over the budget and
  to readd that stuff it removed"*, 2026-10-26). What generation will not draw is banked in
  [real-assets.md](../dev/real-assets.md) with its attempt counts. **Still open as
  taste, not as work:** zone F/G's shared
  regent / captain part-art families are an owner style call — GEN-4 landed only the zone-specific
  azure captain-shell. **Music, whenever it exists** — the hand-off is [`real-assets.md`](../dev/real-assets.md)
  and every replacement keeps the name of what it replaces, so nothing else has to change.
- **The v1-art clean-up after the release (decision RR-1).** Zone A's remaster deliberately runs
  two art lines side by side: v1's sprites still draw the scale-1 atlas behind its digest pin
  (`5c35219b…44b3`), the v2 azure set draws the art-scale build. After a v2.0.x release the owner
  schedules the clean-up that deletes the v1 sources and the pin's reason to exist — until then
  nothing waits on it and both builds stay green.
- **The campaign remaster's last zone.** Both finales have landed: zone H in wave 12 (`a2d94928`)
  and zone I in wave 13 (`2d35a7a5`) — the remastered abyss is the shipped stage on master now, and
  the run's last zone LAND is behind it; the zones' owner parts are the §1.1 hardware sign-off and
  their art rounds in the queue above. Zone I's band wall was **ruled on 2026-10-23**: the owner
  took option 2 (decision R5-D13), the god-mode run band's ceiling widened globally 360 → 420 s
  (4-to-7 min), and the LAND rode that ruling — the god run measured 369.25 s inside [240, 420],
  and zone I's four recordings re-blessed **last**, on settled numbers, as the wall's record
  demanded. Nothing here ships-blocked. Two R5-10 steps no longer wait behind the I-LAND: the
  ending's escape-sequence art (T2) and the grouped atlas pages (T8) stand **open in their own
  right** — neither has landed.
- **Fight-pacing taste rows — disclosed, not tuned.** The wave-11 reviews measured the landed
  remasters' boss clocks under the bot, and four sit under their design bands: SANDGRAVE WIDOW
  21.9 s, CINDER BASTION 14.0 s, SQUALL STEED 26.9 s (against the design's 40–50 s estimate — the
  record's 49.4 / 27.7 / 17.9 / 26.9 s are different measurement windows of one content), FACET
  MONARCH 31.2 s. Every hard gate stayed green and no boss parameter moved for a measurement;
  whether the bands still describe the fights the design wanted is an owner call with a controller.
  Wave 12 added a second pacing row: **under Arcade's rank-scaled fire the four-way bot now loses
  both its lives before IRON SOVEREIGN.** Zone H's arcade golden reports `gameOver` after 5,632
  ticks (deaths at 4,113 and 5,539, 3,130 points, the throne standing) under the identity law in
  its difficulty-rank form — §11's rank reading calls the loss legal, no content parameter moved
  for a measurement, and whether a human should still reach the throne on Arcade is the owner's
  call on a `build:dev` fly.
- **Zone G's gallery mouth (O1).** The remaster's first recorded death is the four-way bot's, at
  the bonus gallery's mouth near camera x ≈ 5,458 — outside the slide window the stage's design
  §10 quoted. The golden says so openly under the identity law
  ([debug-and-replays.md](../dev/debug-and-replays.md)) and CI is green; whether the mouth reads
  as too mean for human hands is the owner's taste call on a `build:dev` fly-through, and the
  same measurement law keeps it honest either way.
- **The pacing-lever watch bank (the R6-01 balance pass).** The eight zone reports of the pass
  closed with pacing notes; they are collected here verbatim, as **observations from the R6-01
  balance pass, NOT proposals** — the pass moved no content parameter for a measurement (the
  identity law); its shipped data changes were the milking cap (`repeatKills` 40 → 100), zone E's steed score and the en / es / ja caravan hints.
  A future zone lane reads this table as its watch list; the report file named per row is the
  record. Zone E carries no row: its report left no lever.

  | Zone | The note | Report |
  |---|---|---|
  | AZURE VERGE (A) | the kestrel's slow-start boss clock 36.6 s against the manta's ~10 s — "a pacing lever if A is ever touched"; A's kill% mean 61, the wide cheap swarm opening | w14-B3A-report.md |
  | BRINE NEBULA (B) | "gill-dart 45 is the first timeline kind above the 40-kill milking cap"; the levers are the instance count (the 154/45 density fact) and, only through the cap, the pay | w14-B3B-report.md |
  | DUNE EXPANSE (C) | "if wave 14 wants the depth-1 pair symmetric, the lever is instance count (and a check that easy AC's 5-death collapse at 104.8 s is a corridor/pattern question, not a pay question)" | w14-B3C-report.md |
  | MAGMA DEEP (D) | "the 2–7 s major fights read as an HP-vs-DPS fact for B3d pacing taste, not a score fact" — the fastest-melting major is manta × normal × ABD at 2.6 s; "ember-wisp 92 is the highest single-kind count in the shipped timelines" | w14-B3D-report.md |
  | CELL VAULT (F) | "cleared F plays average 3.0 deaths; soften in the patterns/timeline, not in the pay cells"; the economy "demonstrably funds the F/G wall"; "Speed is not the binding constraint anywhere in the 162 rows; density is." | w14-B3F-report.md |
  | PRISM LABYRINTH (G) | "G is the set's strongest single tuning signal — 9 of 24 plays end here and cleared plays burn 4–7 lives; wave 14 should fix the corridor/pattern density (the 4-way-clearable rule and checkpoints), and if it lifts kill% the gain gap closes by itself" | w14-B3G-report.md |
  | IRON CITADEL (H) | "H's low deaths with the top per-boss-count pay makes it the least tense deep stage; if wave 14 touches H at all, spend it on the parade's bullet pressure, not on pay." | w14-B3H-report.md |
  | ABYSSAL THRONE (I) | "the nine caps are a pacing observation (a 4-way bot with no evasion cannot close the king at rank 16 within ten minutes on some route histories); that is a human-pacing check for the zone lane, not a point-value case" | w14-B3I-report.md |

---

## What "placeholder" means here

It does not mean missing, and it does not mean broken. It means *made by the build, not by a
human*:

| What | State | Where it is described |
|---|---|---|
| Sprites, tiles, effects, the UI font | 142 records — 231 of the 619 sprites — ship AI-assisted real art with `.art.json` provenance (the wave-14/15 round, closed 2026-10-27: the detail-regeneration program the owner opened under decision R6-D5 ran to its end and took the interim pixel-map pool to **zero**; the same day's two WEAPONLOOK retire rounds retired eight bolt overrides to hand-drawn pixel maps); the rest of the atlas is the build's pixel maps and procedural rules — complete, consistent, original programmer art — kept by measured evidence, with the classes generation will not draw banked and dated. | [`real-assets.md`](../dev/real-assets.md), [`asset-pipeline.md`](../dev/asset-pipeline.md) |
| Music and sound effects | Deterministic synthesis plus a small sample bank. Every cue exists; none was composed. | [`audio.md`](../dev/audio.md), [`content/audio/README.md`](../../content/audio/README.md) |
| The English text | Written for the game and read by the people who built it. | [`content/strings/README.md`](../../content/strings/README.md) |
| The Spanish and Japanese text | Written by the build agent. **Nobody who speaks either language has read a line of it.** | [`content/strings/README.md`](../../content/strings/README.md) |
| The katakana and accented capitals | Drawn by an agent at 5×7 px inside the classic LCD kana box. | [`real-assets.md`](../dev/real-assets.md) |
| The store images | Generated at sizes taken from documentation, **not verified against the Seller Office**. | [`store-submission.md`](store-submission.md) |

Replacing any of them is a file swap, not a rewrite: the pipeline keys everything by name.

---

## The short version

| Item | Blocks | Recipe |
|---|---|---|
| Play the game on both M7 monitors (§8.4, §8.5) **and the 2.0.0 release session** (plan_resolution.md R6-03, §1.1) | Everything — it has never run on hardware | [`debug-tools.md`](debug-tools.md#the-m1-release-check), [`release-candidate.md`](release-candidate.md#the-v10-checklist-both-monitors) |
| The v2 manifest boot on an M7 (plan_resolution.md R1-05 / R2-01, W3-7) | The v2 TV release — `file://` XHR never on firmware | [§1.4](#14-the-v2-manifest-boot-on-the-m7-w3-7) |
| Seller Office account, trade dress, store assets, alpha test (§8.6, §8.9) | The Samsung release | [`store-submission.md`](store-submission.md) |
| A native speaker over `es` and `ja` (§8.9) | Shipping those two languages | [`content/strings/README.md`](../../content/strings/README.md) |
| A pixel artist over the 84 katakana + 9 capitals (§8.9) | Shipping Japanese well | [`real-assets.md`](../dev/real-assets.md) |
| An LG set, account and SDK (§8.7) | The webOS release only | [`webos.md`](webos.md) |
| Steam partner account, app id, achievements, Cloud, SteamPipe (§8.8) | The Steam release only | [`steam.md`](steam.md) |
| A Steam Deck (§8.8) | Deck Verified only | [`steam.md`](steam.md#steam-deck-verification-plan-88) |
| An itch.io account (§8.9) | The web release only | [`web-release.md`](web-release.md) |
| 240 fps latency video, two pads at once, the `rp-` render capture (§8.2, §8.4) | Nothing — but the release's boot ≤ 10 s and whole-process memory figures ride the capture (kit built, R6-02.P2) | [`debug-tools.md`](debug-tools.md#the-guided-capture-preferred) |
| The v2 TV-bench run on the M7 — **run 2026-10-19 on monitor 10.0.0.224, budgets met, P4a–d not needed** (R6-02.P3); open: the second monitor, firmware context loss, W5-2 / W5-15 | Nothing — the measured zone-load verdict is in | [§3](#3-polish--blocks-nothing), [`build-test-deploy.md`](../dev/build-test-deploy.md#the-tv-render-bench-r0-02) |
| The 2026-10-27 M7 re-measure — **run and committed** (`3c24d608`, `898021ee`); wants one repeat of the 190-row suite for the single-sample verdicts | Nothing — §13's tier is unchanged; the video-knob sign is the open call | [§3](#3-polish--blocks-nothing), [`results/2026-10-27-m7-bench/`](../../tools/input-probe/results/2026-10-27-m7-bench/) |
| The tracker-music CPU benchmark (§8.9) | Nothing — the seam ships unused | [`audio.md`](../dev/audio.md) |
| Real art — **the round CLOSED 2026-10-27 (142 records / 231 of 619 sprites ship AI-assisted art: the 79-name era of 2026-10-26 grew through REING-6 → REING-123 → PIXMAP-1 to 150 records and 239 served, and the closing day's two WEAPONLOOK retire rounds retired eight gen6 FLUX bolt overrides to hand-drawn pixel maps; FLUX on the non-commercial basis of 2026-10-23 — §8 decision 1, R6-D4 — with the BFL commercial licence to be in place before any paid distribution; picker waiver + art-budget carve-out both 2026-10-26)**: the interim pixel-map pool went 118 → … → **0**, the tileset class landed (four grids + the wide-canvas ridge), the two banked-impossible rows won back at zero GPU cost. What still stands not-generable is banked with its attempt counts in [`real-assets.md`](../dev/real-assets.md); music remains uncomposed. | Nothing — every batch landed on master | [`real-assets.md`](../dev/real-assets.md), [`art-provenance.md`](../dev/art-provenance.md) |
| **Paid/commercial distribution of the game (monetization)** — art made with FLUX.2-dev / FLUX.1-dev requires a **BFL commercial licence ([bfl.ai/licensing](https://bfl.ai/licensing)) in place before any paid distribution ships** (the 2026-10-23 ruling stands on the non-commercial basis alone — art-provenance.md §8 decision 1); the same re-check covers SD3.5's USD 1 M and LTX-2.5's USD 10 M revenue ceilings | Nothing while the game stays free, open-source (MPL-2.0) distribution | [`art-provenance.md`](../dev/art-provenance.md) |
| The eight remasters of zones B … I (waves 11–13) played on the M7 (§1.1) | The v2 TV submission — none has been seen on hardware | [`debug-tools.md`](debug-tools.md#the-m1-release-check) |
| Zone I's remaster — **discharged at the I-LAND** (`2d35a7a5`); its `R5-09.S3` art drop landed in the wave-14/15 round (the abyss roster names carry real art); the owner part that remains: the M7 play and sign-off of the remastered abyss | Nothing — the remastered abyss ships; R5-10's T2 escape art and T8 grouped pages stand open as run steps of their own | plan_resolution.md §17 / R5-D13 |
| Boss-fight pacing bands (C, D, E, G), zone G's gallery mouth, zone H's arcade pacing, the R6-01 pacing-lever watch bank | Nothing — disclosed by the goldens and the balance pass, not tuned | [§3](#3-polish--blocks-nothing) |
| The v1-art clean-up after a v2.0.x release (plan_resolution.md RR-1; zone A ships both art lines today) | Nothing — the interim rule keeps both builds alive | [`asset-pipeline.md`](../dev/asset-pipeline.md) |
