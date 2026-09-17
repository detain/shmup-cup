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
  ≤ 10 s, a crisp ×5 picture, zone A cleared with the remote alone, Back / Home / exit behaviour,
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
- **The tracker-music CPU benchmark** (plan §8.9). The *size* half is already answered in code —
  libopenmpt's worklet is ≈ 518 KB gzip against a 512 KB bundle budget, so a tracker player can
  only ever be a separately loaded file. The *CPU* half needs the library and a monitor. Doing it
  means writing code (a `TrackerBackend` over `chiptune3` in a dev build); the seam it plugs into
  ships today. Background: [`audio.md`](../dev/audio.md).
- **Real art and music**, whenever they exist. The hand-off is
  [`real-assets.md`](../dev/real-assets.md) and every replacement keeps the name of what it
  replaces, so nothing else has to change.

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
| Seller Office account, trade dress, store assets, alpha test (§8.6, §8.9) | The Samsung release | [`store-submission.md`](store-submission.md) |
| A native speaker over `es` and `ja` (§8.9) | Shipping those two languages | [`content/strings/README.md`](../../content/strings/README.md) |
| A pixel artist over the 84 katakana + 9 capitals (§8.9) | Shipping Japanese well | [`real-assets.md`](../dev/real-assets.md) |
| An LG set, account and SDK (§8.7) | The webOS release only | [`webos.md`](webos.md) |
| Steam partner account, app id, achievements, Cloud, SteamPipe (§8.8) | The Steam release only | [`steam.md`](steam.md) |
| A Steam Deck (§8.8) | Deck Verified only | [`steam.md`](steam.md#steam-deck-verification-plan-88) |
| An itch.io account (§8.9) | The web release only | [`web-release.md`](web-release.md) |
| 240 fps latency video, two pads at once, the render capture (§8.2, §8.4) | Nothing — measurement | [`debug-tools.md`](debug-tools.md#the-guided-capture-preferred) |
| The tracker-music CPU benchmark (§8.9) | Nothing — the seam ships unused | [`audio.md`](../dev/audio.md) |
| Real art and music | Nothing — placeholders are complete | [`real-assets.md`](../dev/real-assets.md) |
