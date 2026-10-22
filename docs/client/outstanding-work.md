# What is left — every manual action, in one place

> **The code is finished. The product is not.**
>
> All 45 steps of [`shmup_plan.md`](../old/shmup_plan.md) are built, reviewed, tested and
> documented. Everything still open needs something no agent in this repository has: **a monitor or
> a TV in your hands, a developer or store account, or a human with an eye or an ear** (a native
> speaker, a pixel artist, a musician). Nothing below is blocked on code; a few items will *produce*
> code once they are done, and those say so.

This page is the single list. It gathers what used to be spread over plan §8.2, §8.4 … §8.9 and
half a dozen client pages, and it says of each item **what it blocks**. The detailed recipes stay
where they were — each entry links to its page — because they are long and they belong next to the
thing they describe.

## How to read the three groups

| Group | Meaning |
|---|---|
| [**Blocks a release on the Samsung monitors**](#1-blocks-a-release-on-the-samsung-monitors) | The primary target. Until these are done the game cannot be submitted, and it has never been seen running on the hardware it was written for. |
| [**Blocks one other platform each**](#2-blocks-one-other-platform-each) | LG webOS, Steam and the Steam Deck, itch.io. Each is independent: skipping one costs you that platform and nothing else. |
| [**Polish — blocks nothing**](#3-polish--blocks-nothing) | Worth doing, safe to defer. The game ships without any of it. |

A fourth thing is worth stating once, because it colours everything below: **the art, the music and
the two new translations are placeholders.** They are original, deliberate and complete — every
sprite, every sound and all 365 strings in three languages exist — but they were generated or
written by an agent, not made by an artist, a composer or a native speaker. See
[what "placeholder" means here](#what-placeholder-means-here).

---

## 1. Blocks a release on the Samsung monitors

The Samsung Smart Monitor M7 (Tizen 5.5) is what this game was written for, and the only hardware
the project has ever touched — and even there, only the **input probe** has run on it
([results](../dev/input-probe-results.md), 2026-09-15). **The game itself has never been installed
on a monitor.**

### 1.1 Play it on the monitors (plan §8.4, §8.5)

Everything else on this page can wait behind this one. Set up per
[`install-on-tv.md`](install-on-tv.md), then work the two checklists:

- **M1 checks** — plan [§8.4](../old/shmup_plan.md#84-m1-on-device-checks-both-monitors): launch
  ≤ 10 s, a crisp ×5 picture, zone A cleared with the remote alone — since R5-01 that means the
  remastered rim (`9d0b472`): its 2.25 px/tick blue lick and the 48-px spire gaps are exactly what
  a remote-only clear proves on hardware — Back / Home / exit behaviour,
  audio, saves across a relaunch and an update install, 15 minutes without a hitch, gamepad and
  keyboard. Guide: [`debug-tools.md`](debug-tools.md#the-m1-release-check).
- **M2 / v1.0 checks** — plan [§8.5](../old/shmup_plan.md#85-m2-on-device-checks-both-monitors):
  co-op, three routes to both endings, the attract loop, rebinding, the 30-minute soak, the update
  and uninstall save rules, live reload. Guide:
  [`release-candidate.md`](release-candidate.md#the-v10-checklist-both-monitors).
- **The M3-02b block inside §8.4** (the tuning the probe's findings produced): the overlay's `TPF`
  counters while flying, Home during play, the INPUT TEST's three-press exit.

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
[`rendering-and-shell.md`](../dev/rendering-and-shell.md#the-boot-sequence). This gates the v2 TV
release like §1.1: v1.0.0 shipped with the manifest inlined, so only v2 builds take this path.

---

## 2. Blocks one other platform each

### 2.1 LG webOS (plan §8.7)

Recipe and the on-device checklist: [`webos.md`](webos.md). **`apps/webos` has never run on
hardware**: no LG TV, no LG developer account, no webOS SDK, and `ares-package` / `ares-install` /
`ares-launch` have never been executed. Treat the first run as untested code, not as a regression.

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
- **The M3-02f render-profile capture** (plan §8.4). The guided on-screen checklist plus the log
  server fill [`input-probe-results.md` §11](../dev/input-probe-results.md). Since M3-02e the
  headless bench already gates the render work, so this is confirmation on real silicon, not a
  gate. Owner's recipe: [`debug-tools.md`](debug-tools.md#the-guided-capture-preferred).
- **The v2 TV-bench run on the M7** (plan_resolution.md R0-03, decisions W5-15 / W5-19). The
  2026-10-19 sessions ran R0-02's 18-scenario matrix and the synthetic decode pages; since then the
  matrix grew to **172 rows** (fifteen resolutions × two art densities + knob rows), R3-04.M4a
  rebuilt the decode load around the **stand-in zone pages** (real band PNG-8 pages, not synthetic
  sheets) and appended a last load, **`standin-zone`**, that draws a 640×360 frame from what it just
  decoded. That run *is* the measurement for decision **W5-19** — ≤ 2 s per zone load on the M7 —
  which today has only the headless-ratio projection (**≈ 0.5 s** against the 2 s gate, ~4×
  headroom; [render-performance-review.md § 7.6](../dev/render-performance-review.md#76-hard-limits-to-check-before-committing-to-b)).
  It also reads the **lazy residency's** timings on firmware (since R3-04.M3e pages fetch, decode
  and upload at the stage change — `data-shmup-atlas-load-ms` on the canvas covers the whole load),
  and while the TV is up: a WebGL context loss on the real device (the recovery re-fetches the
  resident pages — R3-04.M3d; `WEBGL_lose_context` in the remote Web Inspector does it on demand),
  and the two play confirmations the wave asks the owner to make — **W5-2** (the ship's spawn row is
  the frame centre) and **W5-15** (the lazy memory policy is the right one on a real set). Recipe:
  [`build-test-deploy.md` § The TV render bench](../dev/build-test-deploy.md#the-tv-render-bench-r0-02);
  commit the sessions to `tools/input-probe/results/<date>-m7-bench/` and print them with
  `results/analyze-bench.mjs` (it estimates from the measured stand-in pages since R3-04.M4a).
- **The tracker-music CPU benchmark** (plan §8.9). The *size* half is already answered in code —
  libopenmpt's worklet is ≈ 518 KB gzip against a 512 KB bundle budget, so a tracker player can
  only ever be a separately loaded file. The *CPU* half needs the library and a monitor. Doing it
  means writing code (a `TrackerBackend` over `chiptune3` in a dev build); the seam it plugs into
  ships today. Background: [`audio.md`](../dev/audio.md).
- **The interim look at 640×360** (plan_resolution.md R2-01, the owner part). The flipped game runs
  v1's art nearest-neighbour ×1.5 and the 6×8 font as a 9×12 block — interim by design until R4
  replaces it, but the owner should look: text readability of the interim build (`pnpm dev`, or a
  `build:dev` bundle on the M7), the es front end on a TV, and a `V1 REPLAY` row (an old
  `replay.last` kept by a v2 build, shown delete-only —
  [`extra-modes-and-replays.md`](extra-modes-and-replays.md)). R2-04's play session continues the
  look: zones A, D and I on the M7 with the overlay's `TPF` and `RENDER` — and zone A again after
  R5-01's remaster: the rebuilt 21,000 px of it has never been seen on a TV.
- **Real art and music**, whenever they exist. The hand-off is
  [`real-assets.md`](../dev/real-assets.md) and every replacement keeps the name of what it
  replaces, so nothing else has to change. R5-01's zone A joins that queue as complete
  procedural art — the twelve `azure-*` names plus the pipeline's six `@flash` siblings
  (five enemy types and the marshal's shell carry one each; the two parallax bands, three decor
  props and the 26-tile `terrain-azure` set carry none) — drawn by
  `scripts/assets/procedural/azure.mjs` and replaceable PNG for PNG through
  the ingest tool with a `.art.json` provenance record, no code change.
- **The v1-art clean-up after the release (decision RR-1).** Zone A's remaster deliberately runs
  two art lines side by side: v1's sprites still draw the scale-1 atlas behind its digest pin
  (`5c35219b…44b3`), the v2 azure set draws the art-scale build. After a v2.0.x release the owner
  schedules the clean-up that deletes the v1 sources and the pin's reason to exist — until then
  nothing waits on it and both builds stay green.

---

## What "placeholder" means here

It does not mean missing, and it does not mean broken. It means *made by the build, not by a
human*:

| What | State | Where it is described |
|---|---|---|
| Sprites, tiles, effects, the UI font | Generated from pixel maps and procedural rules. Complete, consistent, original — and clearly programmer art. | [`assets/README.md`](../../assets/README.md), [`asset-pipeline.md`](../dev/asset-pipeline.md) |
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
| Play the game on both M7 monitors (§8.4, §8.5) | Everything — it has never run on hardware | [`debug-tools.md`](debug-tools.md#the-m1-release-check), [`release-candidate.md`](release-candidate.md#the-v10-checklist-both-monitors) |
| The v2 manifest boot on an M7 (plan_resolution.md R1-05 / R2-01, W3-7) | The v2 TV release — `file://` XHR never on firmware | [§1.4](#14-the-v2-manifest-boot-on-the-m7-w3-7) |
| Seller Office account, trade dress, store assets, alpha test (§8.6, §8.9) | The Samsung release | [`store-submission.md`](store-submission.md) |
| A native speaker over `es` and `ja` (§8.9) | Shipping those two languages | [`content/strings/README.md`](../../content/strings/README.md) |
| A pixel artist over the 84 katakana + 9 capitals (§8.9) | Shipping Japanese well | [`real-assets.md`](../dev/real-assets.md) |
| An LG set, account and SDK (§8.7) | The webOS release only | [`webos.md`](webos.md) |
| Steam partner account, app id, achievements, Cloud, SteamPipe (§8.8) | The Steam release only | [`steam.md`](steam.md) |
| A Steam Deck (§8.8) | Deck Verified only | [`steam.md`](steam.md#steam-deck-verification-plan-88) |
| An itch.io account (§8.9) | The web release only | [`web-release.md`](web-release.md) |
| 240 fps latency video, two pads at once, the render capture (§8.2, §8.4) | Nothing — measurement | [`debug-tools.md`](debug-tools.md#the-guided-capture-preferred) |
| The v2 TV-bench run on the M7 — stand-in scenario, lazy-load and context-loss timings (plan_resolution.md R0-03, W5-15 / W5-19) | Nothing — it produces the measured zone-load verdict R3-04 waits on | [§3](#3-polish--blocks-nothing), [`build-test-deploy.md`](../dev/build-test-deploy.md#the-tv-render-bench-r0-02) |
| The tracker-music CPU benchmark (§8.9) | Nothing — the seam ships unused | [`audio.md`](../dev/audio.md) |
| Real art and music | Nothing — placeholders are complete | [`real-assets.md`](../dev/real-assets.md) |
| The v1-art clean-up after a v2.0.x release (plan_resolution.md RR-1; zone A ships both art lines today) | Nothing — the interim rule keeps both builds alive | [`asset-pipeline.md`](../dev/asset-pipeline.md) |
