# Shmup Cup — Feature & Functionality Catalog

> **Status:** research catalog (2026-09-10), now **implemented through [`shmup_plan.md`](shmup_plan.md)**: every
> [P0] feature shipped in M1 and every [P1] feature in M2 (`1.0.0-rc.1`). The [P2] features are M3, which is under way
> (2026-09-16: M3-01, M3-02 and M3-02b done — the last of those retuned §3 and §4 to what the input probe
> measured on the hardware —, M3-02c … M3-02e and M3-03 remaining). Where the build differs from this catalog, the plan's
> "As built" notes and [`shmup_progress.md`](shmup_progress.md) are authoritative. The catalog is the raw list of
> everything a Gradius III / Darius Twin–style horizontal shmup needs.
>
> **Goal:** a modern TypeScript 2D horizontal-scrolling shoot-'em-up that plays like a blend of
> **Gradius III** (Konami, 1989 arcade / 1990 SNES) and **Darius Twin** (Taito, SNES 1991) — retro
> SNES-era look, but with *fast, fluid, low-latency 60 fps* gameplay as the #1 priority. Targets:
> Samsung Tizen TV (primary), web browser (dev), Electron desktop (later), possibly LG webOS / Steam Deck.
>
> **Priority tags** (suggested, to be confirmed in planning):
> **[P0]** = needed for a playable vertical slice · **[P1]** = needed for a complete v1.0 · **[P2]** = nice-to-have / post-launch.
>
> **[?]** = detail from research that is uncertain / needs a design decision or hardware verification.

---

## Table of contents

1. [Design pillars](#1-design-pillars)
2. [Where the two source games differ (key design decisions)](#2-where-the-two-source-games-differ--key-design-decisions)
3. [Display, resolution & frame timing](#3-display-resolution--frame-timing)
4. [Controls & input](#4-controls--input)
5. [Player ship](#5-player-ship)
6. [Power-up systems](#6-power-up-systems)
7. [Weapons catalog](#7-weapons-catalog)
8. [Options / multiples](#8-options--multiples)
9. [Shields](#9-shields)
10. [Death, respawn & checkpoints](#10-death-respawn--checkpoints)
11. [Enemies](#11-enemies)
12. [Enemy bullets & attack patterns](#12-enemy-bullets--attack-patterns)
13. [Bosses & mid-bosses](#13-bosses--mid-bosses)
14. [Stages / zones](#14-stages--zones)
15. [Scoring, lives, rank & loops](#15-scoring-lives-rank--loops)
16. [Game modes](#16-game-modes)
17. [Screens, UI flow & HUD](#17-screens-ui-flow--hud)
18. [Visual look & effects](#18-visual-look--effects)
19. [Audio](#19-audio)
20. [Game feel / "juice"](#20-game-feel--juice)
21. [Meta systems: options, saves, replays, accessibility](#21-meta-systems-options-saves-replays-accessibility)
22. [Engine systems (technical requirements)](#22-engine-systems-technical-requirements)
23. [Platform layer (core lib + Tizen + Electron + web)](#23-platform-layer-core-lib--tizen--electron--web)
24. [Dev tooling & debug features](#24-dev-tooling--debug-features)
25. [Content / asset production list](#25-content--asset-production-list)
26. [Legal / IP notes](#26-legal--ip-notes)
27. [Open questions & things to verify on hardware](#27-open-questions--things-to-verify-on-hardware)
28. [Appendix A — Gradius III reference data](#appendix-a--gradius-iii-reference-data)
29. [Appendix B — Darius Twin reference data](#appendix-b--darius-twin-reference-data)
30. [Appendix C — Sources](#appendix-c--sources)

---

## 1. Design pillars

1. **Responsiveness first.** Rock-solid 60 Hz fixed-step simulation, ≤1 frame input-to-sim latency, zero GC hitches, no loading mid-stage. Performance beats visual fidelity, every time.
2. **Readable retro 2D.** Low internal resolution pixel art (SNES-like), integer-scaled, crisp. Bullets are always the most readable thing on screen.
3. **Best of both source games.**
   - From **Gradius III**: the *power meter* and weapon-loadout choice, *Options* that mimic your fire, terrain stages with gimmicks, core-style bosses, rank.
   - From **Darius Twin**: *2-player simultaneous co-op*, colored power-up items with visible tiers, the *branching zone map*, giant mechanical sea-creature battleships, the iconic **"WARNING!"** boss intro.
4. **Data-driven content.** Enemies, weapons, stages and patterns are defined as data and scripts so we can add content without touching the engine.
5. **Portable core.** The game is a platform-agnostic TS library; Tizen/Electron/web are thin adapters.
6. **Deterministic simulation.** Same inputs + seed ⇒ same game. Enables replays, attract mode, automated tests.

---

## 2. Where the two source games differ — key design decisions

These are the forks in the road where we must pick one approach (or support both as a mode/option). Decide during planning.

| Topic | Gradius III | Darius Twin | Suggested direction |
|---|---|---|---|
| **Power-up model** | Collect capsules → cursor moves along 7-slot meter → press button to buy highlighted slot | Colored items (red=shot, green=sub, blue=shield) upgrade directly | **[?]** Pick one as the core loop, or offer "Meter" vs "Direct" as a game-mode/ship choice. Meter = more depth; Direct = more accessible & co-op friendly. |
| **Ship speed** | 1 base + up to 5 Speed Ups | Fixed | Meter mode: speed-ups. Direct mode: fixed speed (+ optional speed toggle button). |
| **Options (drones)** | Up to 4, follow your trail, copy your weapons | None | Include Options (they are the Gradius signature). |
| **Death penalty** | Lose everything, restart at checkpoint (Beginner mode: lose one level at a time) | Keep shot & sub levels, lose only shield; respawn in place | **Configurable preset**: *Arcade* (lose all + checkpoint), *Classic* (lose 1 level, Gaiden-style), *Casual* (keep all, Twin-style). |
| **Terrain** | Heavy — corridors, walls kill you, destructible terrain | Mostly open space; some ground/ceiling zones | Mix: some open-space zones, some terrain zones. |
| **Stage progression** | Linear, 10 stages, loops | Branching zone map: 12 zones, 7 per run, 12 routes | **Branching map** (bigger replay value), each zone still hand-authored like a Gradius stage. |
| **Bosses** | Core bosses, organic/biomech; boss rush stage | Giant fish/sea-creature battleships, captains (mid-bosses), WARNING screen, boss-inside-boss, timers | Both styles; WARNING intro for every major boss. |
| **Players** | Alternating 2P (arcade) | Simultaneous 2P co-op | **Simultaneous co-op** (P1 feature). |
| **Controller** | Stick + 3 buttons | D-pad + 2 buttons | **Samsung TV remote is primary** (decided): always-on autofire, likely 4-way, OK = equip/special. Favors Direct items or Meter + Auto Power-Up. |
| **Difficulty** | Rank system tied to power level; loops get harder; revenge bullets on loop 2+ | Easy/Normal only (too easy — criticized) | Rank system + difficulty presets + Hard mode + loop 2. |
| **Bullet density** | Moderate, aimed at quantized angles | Low; enemies mostly ram | Moderate (retro, not bullet-hell), readable. |
| **Slowdown** | Heavy on SNES (arguably part of balance) | Nearly none | Optional deterministic "authentic slowdown" toggle; default off. |
| **Resolution** | 320×224 arcade / 256×224 SNES | 256×224 | 384×216 (16:9, integer ×5 on 1080p) — see §3. |

---

## 3. Display, resolution & frame timing

- **[P0] Internal resolution: 384×216** (16:9), rendered to an offscreen framebuffer, then **integer-upscaled** with nearest-neighbor.
  - 1080p ⇒ ×5 exact (no letterbox). 4K ⇒ ×10.
  - Tizen FHD TVs run web apps at **1280×720** ⇒ ×3 = 1152×648 with a small letterbox. **[?]** Alternative: 320×180 (integer ×4 at 720p and ×6 at 1080p) at the cost of less vertical playfield. Decide after testing.
  - Classic 256×224 / 320×224 "4:3 mode" with pillarbox side art can be a [P2] option.
- **[P0] Scale modes:** integer (default), fit (non-integer, nearest), stretch. CSS `image-rendering: pixelated`.
- **[P0] Pixel-perfect camera:** simulation uses sub-pixel positions; renderer rounds camera and sprites to integer pixels.
- **[P0] 60 Hz fixed-step simulation** in integer ticks (all timers expressed in frames).
  - On 60 Hz displays (most TVs): exactly one sim tick per `requestAnimationFrame` — lowest latency.
  - 120/144 Hz: accumulator + interpolated render. 50 Hz: accumulator + interpolation.
  - Refresh rate probed at boot (median rAF delta). Delta snapping to kill jitter. Max ticks/frame cap (anti spiral-of-death).
  - **Measured 2026-09-15 (M3-02b):** delta snapping alone is not enough on the M7 monitors. They deliver
    ~59 fps with a median rAF delta of 16.5 ms but 27–32 % of the deltas above 20 ms (p95 ≈ 30 ms), which
    the ±1 ms snap turns into 0-tick and 2-tick frames — visible judder although the average is right. The
    loop therefore has a **vsync lock** for fixed ~60 Hz displays (refresh probe reading 55–65 Hz, or the
    shell option `framePacing: 'lock'`): exactly **one tick per frame**, a second one only when the frame
    really covered two whole steps (a dropped frame, or a step of accumulated debt), the debt bounded to
    ±1 step and reset on resume. The free-running accumulator stays for every other refresh rate and for
    slow motion, frame advance and the game-speed assist. Presentation only — the same inputs still produce
    the same ticks, so replays and goldens are unaffected. See
    [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md).
- **[P0] Pause on `visibilitychange` / blur;** reset accumulator on resume (required for Tizen certification).
  - **Measured 2026-09-15 (M3-02b):** on the M7, **Home is an overlay** — the app keeps running and only
    the window's `blur` / `focus` fire, never `visibilitychange`. Both hosts' lifecycles therefore track
    *hidden* and *unfocused* as two independent reasons to be away and are **edge-triggered**: the suspend
    callbacks run once on the way into "away" (a `blur` + `hidden` pair suspends once) and the resume
    callbacks only when the app is visible *and* focused again. Pressing Home during play now opens the
    pause menu and suspends the audio; the game is still paused on return, with no catch-up burst.
- **[P2] Optional "authentic slowdown":** deterministic tick-skipping when on-screen object load exceeds a threshold (Gradius III SNES feel).

---

## 4. Controls & input

### Actions
| Action | Notes |
|---|---|
| Move (8-way) | D-pad / stick / arrows / WASD. **The Samsung remote is 4-way only** — measured 2026-09-15: while an arrow is held, a second arrow is never delivered (M3-02b) |
| Shot (main) | Hold = autofire (configurable rate) |
| Sub-weapon / Missile | Gradius "missile" / Darius "bomb"; can be merged with Shot via "fire both" option |
| Power-up (select) | Gradius meter mode only — buys highlighted slot. Hold on Option slot = spread/retract Formation/Rotate options |
| Special / Bomb | Mega Crash (Gradius `!`) or Darius Gaiden black-hole bomb, if included |
| Speed toggle / Focus | **[?]** optional: cycle ship speed (Direct mode) |
| Pause / Menu | Start / Esc / TV Back key |

### Input requirements
- **[P0] Keyboard:** `e.code` (layout independent), **ignore keydowns of keys that are already held** (not just the ones flagged `e.repeat` — the Samsung remote's auto-repeats are plain `keydown`s with `repeat === false`, M3-02b), `preventDefault` on arrows/space, clear all keys on `blur`. Event-driven keys latched into a per-tick bitmask with "pressed since last tick" edge flags so taps are never lost.
- **[P0] Gamepad API:** standard mapping (D-pad = buttons 12–15), radial deadzone ~0.2, stick → 8-way digital with hysteresis, polled once per rAF right before sim ticks. "Press any button" to activate (required on Tizen). Auto-pause on disconnect.
- **[P0] ⭐ Samsung remote is the PRIMARY controller (decided).** The user plans to play mostly with the Samsung Smart Remote on the M7 Smart Monitors. Gamepad/keyboard remain fully supported (keyboard is the browser dev input), but **every feature must be playable and fun on the remote alone.** See "Remote-first control design" below.

#### Remote-first control design [P0]

**Buttons on our Samsung Smart Remote** (M7 M70A remote — rechargeable, mic; verify exact codes with the probe): D-pad ring + center **OK/Select**, **Back/Return**, **Home** (system — never ours), **Play/Pause**, **Vol ±** rocker, **Ch ±** rocker, mic, **Color/Number** button (opens an on-screen pad — there are **no physical number keys**), streaming shortcut buttons (system — never ours). **Mouse is not usable in our app** (on the M7 it only works in the browser app).

| Key | Code | Available to app? | Proposed in-game use |
|---|---|---|---|
| Arrows | 37–40 | Always | Move ship / menu focus |
| OK / Enter | 13 | Always | Gradius mode: **equip highlighted power-up**. Direct mode: special/bomb. Menus: select |
| Back | 10009 | Always (must handle) | Pause menu (in game); back (menus); exit-confirm (title) |
| Play/Pause | 10252 | `registerKey('MediaPlayPause')` | Pause / resume |
| Ch + / Ch − | 427 / 428 | `registerKey('ChannelUp'/'ChannelDown')` — **confirmed 2026-09-15**; pressing the rocker *in* is Guide 458, the screen button Extra 10253 (both registrable, capturable in REBIND) | Candidates: special weapon / cycle speed / Option formation |
| Vol ± / Mute | 447–449 | `registerKey` accepts them (**confirmed 2026-09-15**) — but pressing the Vol rocker in reports Mute 449, and taking the volume keys from the viewer is never acceptable | Never registered; the rebind validator rejects them |
| Home, Exit (long-press Back), shortcut buttons | — | System | Never used |

**Design rules for remote play:**
1. **Always-on autofire** for both main shot *and* missile/sub-weapon — the player never holds a fire button. (Autofire-toggle option for gamepad players.)
2. **One key at a time — 4-way movement and no chords. Measured 2026-09-15 (M3-02b), and stricter than
   this rule assumed:** while any key is down the remote delivers **no other key at all** — not a second
   arrow, not OK, not Ch±, not on press and not on release — and the held arrow simply keeps repeating. So:
   - Level & pattern design must be **dodgeable with 4-way movement** (fewer diagonal-only gaps, slightly
     slower aimed bullets, more readable patterns). Diagonals are not a bonus that may still arrive: the
     hardware cannot send them, and the playtest bot flies under that model (`test/playtest/remote-strict.ts`).
   - Button presses must be **rare, non-urgent actions** (power-up equip, special), never something needed
     mid-dodge — and a press only registers once the direction is **released**, so the ship stops moving
     for the length of the tap (7–16 ticks; the fastest OK re-tap is ~276 ms).
   - Nothing may ask for a **held** Back or Play/Pause, or for two buttons at once: those two (and Mute)
     arrive as a keydown + keyup pair **when the button is released**, so they can never be held. The
     INPUT TEST is left with three Pause presses inside ~1.5 s, and the debug unlock is four taps.
   - The profile knob `singleKey` models this, so `keyboard-remote-emulation` on a desktop behaves like
     the real remote.
3. **Robust key-state tracking:** track held state from `keydown`/`keyup` only, and treat a `keydown` of a
   key that is already down as "still held" **whether or not `e.repeat` is set**. **Measured 2026-09-15
   (M3-02b):** the remote's auto-repeats are flagless `keydown`s — the first after ≈ 355 ms (≈ 21 ticks),
   then every ≈ 108 ms (≈ 6.5 ticks, ± 40 ms) — with **no fake keyup/keydown pairs and no bounces**; the
   real key-up follows 0–100 ms after the last repeat. The release-debounce is therefore **0 ticks** on the
   TV profile (the ~2–3 frame value this rule anticipated only added latency), and any code that counted
   `keydown`s (a debug unlock sequence, a toggle) must track held keys itself.
4. **Power-up model fit:** Darius-style **direct items** need zero buttons (ideal for remote). Gradius **meter** needs only OK = "equip" (fine, since it's infrequent). Offer **Auto Power-Up** as a remote-friendly option.
5. **Speed control:** with 4-way digital movement, ship speed matters a lot — Gradius Speed Ups (via meter) or a Ch± speed cycle. Default speed tuned for remote.
6. **Latency:** Bluetooth remote latency is unknown — measure it. The M7 **never enables Game Mode for built-in apps** (only for HDMI/USB-C inputs), so display latency is also higher than a TV in Game Mode. Keep sim input-to-render at ≤1 frame so the remote's and panel's own latency is the only extra.
7. **2-player co-op** on remotes: only one remote per display ⇒ P2 uses a gamepad (or a second paired remote **[?]**).
8. **Menus:** fully D-pad + OK + Back navigable; no mouse, no text entry (name entry = D-pad letter picker).

- **[P0] Input probe app (first spike):** a tiny `.wgt` that logs keyCode/`code`/`repeat`/timestamps for keydown/keyup, shows which keys are held simultaneously, measures repeat delay/interval, tests `registerKey` for Ch±/Play/Vol, and shows Gamepad API state. **Run on both M7 monitors on 2026-09-15** — results in [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md), applied by plan step M3-02b. (It measures with the handler clock: Tizen 5.5's `event.timeStamp` only advances in whole seconds.)
- **[P1] Gamepad & keyboard play** (full 8-way, manual fire buttons, rebinding). Our M7 displays accept Bluetooth *and* USB gamepads, keyboards and mice.
- **[P0] Autofire:** hold-to-fire, toggle mode, configurable rate; rate stored in replay header.
- **[P1] Rebinding** per device (keyboard / each gamepad / remote), conflict detection, reset to defaults, persistence.
- **[P1] SOCD resolution** (Left+Right both held): neutral or last-wins, configurable.
- **[P1] 2-player local co-op input:** "press Start to join", per-player device assignment, split-keyboard preset (WASD vs arrows — watch for keyboard ghosting).
- **[P1] Input buffering** for menus and power-meter presses (a few ticks).
- **[P2] Rumble** via `vibrationActuator.playEffect()` (supported on Samsung TVs with gamepads).
- **[P2] Konami-code-style secrets** (Gradius III SNES: pause + ↑↑↓↓LRLRBA = full power-up; ↑↑↓↓←→←→BA = self-destruct joke).

---

## 5. Player ship

- **[P0] Movement:** 8-way, no inertia, instant response. Diagonal normalization **[?]** (many retro games didn't normalize — design decision).
- **[P0] Speed levels:** Gradius: base + up to 5 Speed Ups (experts use 2–3; too fast is uncontrollable). Suggested px/frame at 384 wide: ~1.25 / 1.75 / 2.25 / 2.75 / 3.25 / 3.75 **[?]** tune. Darius: one fixed speed.
- **[P0] Hitbox:** tiny, centered, smaller than the sprite. **Two collision boxes** (Gradius III detail): a small one for bullets/enemies and a separate terrain box. Optional "show hitbox" display.
- **[P0] Terrain collision kills** (unless shielded — Darius shield absorbs terrain hits; Gradius does not).
- **[P0] Screen bounds:** ship clamped to the playfield.
- **[P1] Ship selection** [?]: e.g., "Vic-Viper-like" (meter mode) vs "Silver-Hawk-like" (direct mode); later more ship types (Darius Force had 3; Dariusburst up to 8). Co-op ships in different colors (Darius Twin: P1 red, P2 blue; solo green).
- **[P1] Respawn invincibility:** ~120–180 ticks of blinking.
- **[P1] Ship intro/launch animation** at stage start (SNES Gradius III "Catapult" launch; ship flies in from left).
- **[P1] Stage-clear fly-out animation.**

---

## 6. Power-up systems

### 6A. Gradius-style Power Meter ("Meter mode")
- **[P0] 7-slot meter** in the HUD: `SPEED UP | MISSILE | DOUBLE | LASER | OPTION | ? | !`.
- **[P0] Each power capsule advances the highlight one slot**; after `!` it wraps to SPEED UP.
- **[P0] Power-up button** equips the highlighted slot; highlight resets to "none".
- **[P0] Maxed slots can't be selected** (greyed/blank): Speed ×5, Missile ×1, Option ×4, `?` while shield active.
- **[P0] DOUBLE and LASER are mutually exclusive** (equipping one replaces the other).
- **[P0] Capsule sources:** (a) a special **red/orange-colored enemy** always drops one; (b) destroying **an entire formation** drops one. Capsule = 300 pts.
- **[P1] Weapon loadout selection** before the game (see §7): Type A–D presets or **Weapon Edit** (pick each slot's variant).
- **[P1] "Parking" strategy support:** players deliberately leave a slot highlighted — don't auto-equip.
- **[P1] Auto Power-Up option:** automatic equip order, e.g. Speed → Missile → Laser → Option ×4 → ? (PS2 "semi-auto").
- **[P1] Blue capsule** (earlier Gradius games): clears on-screen enemies. Gradius III dropped it in favor of `!` Mega Crash **[?]** include as rare pickup?
- **Do NOT reproduce** the Gradius III bug where multiple capsules grabbed in quick succession count as one.

### 6B. Darius-style direct items ("Direct mode")
- **[P0] Item carriers:** Darius Twin uses **waves of six cubes** (3 from top, 3 from bottom, converging); **the last cube destroyed drops the item.** Later zones: carriers come from behind. (Original Darius used colored lead enemies instead — either works.)
- **[P0] Item types:**
  | Item | Effect |
  |---|---|
  | Red | Main shot +1 level (9 levels: 0–8) |
  | Green | Sub-weapon +1 level (9 levels) |
  | Blue | Shield: grant / repair / advance tier |
  | Orange | 1UP (very rare — 2 per run in Twin) |
  | Yellow | Smart bomb (kills everything; heavy damage to mid-bosses) |
  | Red octagon | Switch main-shot **family** (e.g., Disc ↔ Wave) — 2 per run |
- **[P1] Visible tier pips in the HUD** (Darius Twin had *none* — improvement).
- **[P1] Co-op item sharing:** whoever grabs it gets it (Twin). Consider scaling item count in co-op.
- **[P1] Item drift behavior:** items drift slowly left / bounce, despawn after time **[?]**.

### 6C. Common
- **[P0] Pickup feedback:** distinct SFX, flash, optional voice callout ("SPEED UP!", "LASER!", "Destroy them all!" style — original voice lines).
- **[P1] Power level feeds rank** (see §15).

---

## 7. Weapons catalog

### 7A. Meter-mode weapons (Gradius III–derived)

**Missile slot**
| Weapon | Behavior |
|---|---|
| Missile | Drops diagonally down, then slides along ground. 2 on screen. |
| Spread Bomb | Falls in an arc, big explosion on impact (can hit twice). Strongest; explosion obscures bullets. |
| 2-Way Missile | One up, one down; detonate on impact; 1 volley at a time. |
| Photon Torpedo | Fast ground-hugger that **pierces** small enemies. |
| Control Missile | Flies horizontally, tracks ship's vertical movement. |
| Upper Missile | Missile fired upward (ceiling slider). |
| Small Spread | Rear-fired small spread bomb. |
| Hawk Wind | Fires up if ship above screen center, down if below; follows terrain. |
| 2-Way Back | 2-way fired backward. |

**Double slot**
| Weapon | Behavior |
|---|---|
| Double | Forward + 45° up. Can't refire until both shots gone. |
| Tail Gun | Forward + straight back. |
| Vertical | Forward + straight up. |
| Free Way | Second shot in 8 directions based on last input. |
| Spread Gun | Equip twice: 2-way diagonals, then 3-way. |
| Back Double | Forward + 45° up-back. |

**Laser slot**
| Weapon | Behavior |
|---|---|
| Laser | Long thin **piercing** beam. (Gradius quirk: enemies moving *into* the beam's middle aren't hit — **don't** copy.) |
| Ripple | Expanding ring, grows with distance, non-piercing, big coverage. |
| Cyclone Laser | Thicker swirling laser. |
| Twin Laser | Two short rapid parallel beams. |
| Energy Laser | Hold to charge; charged ball pierces, blocks bullets; tap = small shots. |

**Option slot** — see §8. **`?` slot** — see §9.

**`!` slot**
| Choice | Effect |
|---|---|
| Mega Crash | Screen clear: destroys bullets & small enemies, kills Option Hunter (frees stolen options). No boss damage. |
| Normal | Revert Double/Laser to basic shot. |
| Speed Down | Reduce speed one level. |
| Life Option | Convert extra lives into Options. |
| Full Barrier | Restore shield to full. |

**Preset loadouts** (Gradius III arcade):
| Type | Missile | Double | Laser |
|---|---|---|---|
| A | Missile | Double | Laser |
| B | Spread Bomb | Tail Gun | Ripple |
| C | 2-Way Missile | Vertical | Cyclone Laser |
| D | Photon Torpedo | Free Way | Twin Laser |

- **[P0]** Implement Type A first (Missile, Double, Laser, Option, Force Field, Mega Crash).
- **[P1]** Types B–D + Weapon Edit.
- **[P2]** "Extra Edit" (any combo) as an unlock.

### 7B. Direct-mode weapons (Darius Twin–derived)

**Main shot — two families, 9 levels each**
| Lv | Family 1: Beam → Disc (default) | Family 2: Laser → Wave (after red octagon) |
|---|---|---|
| 0 | Weak missile | Weak missile |
| 1 | Stronger, wider missile | Blue laser |
| 2 | Twin wide missiles | Wider blue laser |
| 3 | Small energy disc | Longer yellow laser |
| 4 | Two small discs | Round yellow laser, pierces |
| 5 | Three small discs | Small crescent wave, pierces |
| 6 | Bigger disc | Bigger crescent, pierces |
| 7 | Even bigger disc | Wider crescent, pierces |
| 8 | Largest disc (non-piercing) | Largest crescent, pierces |

**Sub-weapon (green) — 9 levels**
| Lv | Effect |
|---|---|
| 0 | 1 bomb arcing down-forward |
| 1 | 2 bombs, front diagonals |
| 2 | 4 bombs, all diagonals |
| 3 | 2 front diagonal lasers + 2 rear bombs |
| 4 | 4 diagonal lasers (X pattern) |
| 5 | 4 wider piercing lasers |
| 6 | 4 double piercing lasers |
| 7 | 4 piercing discs |
| 8 | 4 bigger piercing discs |

### 7C. Weapon system requirements
- **[P0] On-screen shot caps** per weapon (Gradius-style: e.g., 2 missiles, limited lasers) — getting closer = faster kills.
- **[P0] Piercing vs non-piercing** projectiles, per-projectile damage, damage-over-time for beams.
- **[P0] Ground-following projectiles** (missiles sliding on terrain need "find floor" queries).
- **[P0] Options copy all weapons** (§8).
- **[P1] Weapons defined in data** (`weapons.json`): sprite, speed, damage, cap, pierce, behavior id.
- **[P2] Modern series mechanics to consider** (pick at most one signature): Darius Gaiden **black-hole bomb** (vortex pulls bullets/enemies, then lightning); **captain capture** (Gaiden) / **capture ball** (G-Darius: capture an enemy as ally); **beam duel** (G-Darius: your big beam vs boss beam, button-mash); Dariusburst **burst beam** (meter-fed, deployable aimable beam pod).

---

## 8. Options / multiples

- **[P0] Standard Option:** up to 4; follows the ship's flown path (ring buffer of past positions; Option *k* at `history[k·N]`; buffer only advances on ticks the ship moves, so options bunch when idle). Invulnerable, pass through walls, copy every weapon.
- **[P1] Snake Option:** moves opposite the ship's direction, stays put when you stop — lets you hold formations.
- **[P1] Formation Option:** fixed V / ">" shape; hold Power-Up on Option slot to spread/retract.
- **[P1] Rotate Option:** orbits the ship; hold to extend radius.
- **[P1] Option Hunter enemy:** appears at scripted points, lines up, charges, **steals your options**; Mega Crash frees them (grey options re-collectable). 3 behavior variants.
- **[P2] Option recovery after death** (Gradius V style: options drift away and can be re-grabbed) — accessibility/casual preset.

---

## 9. Shields

### Meter-mode (`?` slot)
| Type | Behavior |
|---|---|
| Force Field | Surrounds ship; ~6 hits (arcade) / 3 (SNES); sprite size changes as it wears. |
| Shield (front pods) | Two pods attach at the nose, ~14 hits, each pod wears independently. |
| Free Shield | Pods attachable anywhere (equip multiple times). |
| Rotate Shield | Two pods orbit the ship, ~14 hits. |
| Reduce | Shrinks ship hitbox (2 steps); SNES version absorbs 2 hits. Does **not** shrink terrain box. |

### Direct-mode (blue item "Arm")
| Tier | Color | Hits | Blue items to reach |
|---|---|---|---|
| Arm | Green | 3 | 1 |
| Super Arm | Silver | 4 | 4 |
| Hyper Arm | Gold | 5 | 9 |

- Absorbs bullets, enemy contact **and terrain contact**. Further blue items repair. Visual shrink/wear per hit.

### Common
- **[P0]** Hit counter per shield, visible wear state, break SFX/effect.
- **[P1]** Shield-hit i-frames (a few ticks) so one bullet cluster doesn't drain it instantly **[?]**.

---

## 10. Death, respawn & checkpoints

- **[P0] One-hit death** without shield.
- **[P0] Death sequence:** big explosion, short hit-stop, **cancel all enemy bullets**, music duck, life decrement.
- **[P0] Respawn with invincibility** (~2–3 s blinking).
- **[P0] Death-penalty presets** (§2): *Arcade* (lose all power, restart at last checkpoint, meter cursor reset), *Classic* (lose one level per death: Option → Laser/Double → Missile → Speed; keep cursor), *Casual/Twin* (keep weapons, lose shield, respawn in place).
- **[P0] Invisible checkpoints** per stage (scroll position + event-cursor index + loadout rule). Several per stage.
- **[P1] Recovery design:** each checkpoint should be survivable from zero power (Gradius III's worst criticism is "unrecoverable" checkpoints). Place extra capsules after checkpoints.
- **[P1] Continues:** configurable credits (SNES Gradius: 3; Darius Twin: none). Continue at checkpoint; continue count shown/recorded in score's last digit (arcade convention).
- **[P1] Game over** → name entry if high score → hi-score table.
- **[P2] Death-bomb window** (bomb within a few frames after hit cancels death) — only if we include bombs.

---

## 11. Enemies

### Archetypes to implement
| Archetype | Behavior | Source |
|---|---|---|
| **Formation fliers / "fans"** | Fly in formation (line, V, sine wave, loop); kill all → capsule | Gradius |
| **Capsule carrier** | Single red/orange enemy, always drops capsule | Gradius |
| **Cube item carriers** | 6-cube pincer wave; last one killed drops item | Darius Twin |
| **Popcorn chains** | Long chains of weak ships, straight or sine | Both |
| **Pincers** | 3 from top + 3 from bottom, crossing | Darius |
| **Orbiters** | Loop mid-screen then exit; some fire lasers | Darius |
| **Rear attackers / jumpers** | Enter from behind (why Tail Gun / rear sub-weapons matter) | Both |
| **Hatches / spawners** | On floor/ceiling; keep releasing small fliers until destroyed | Gradius |
| **Turrets** | On terrain, aimed shots at quantized angles | Both |
| **Walkers ("Duckers")** | Walk on floor/ceiling, stop, shoot | Gradius |
| **Ground tanks** | Two-part: destroy top → base shoots up; destroy base → top flies at you | Darius |
| **Splitters** | Bubbles / fireballs / missiles that split into smaller pieces when shot | Both |
| **Ceiling droppers / falling rocks** | Drop when you pass underneath | Both |
| **Volcanoes** | Indestructible, lob rocks/bombs | Both |
| **Segmented worms** | Sand-dragon style chains bursting from terrain | Gradius |
| **Moai-style heads** | Big stationary heads spitting rings / mini-heads | Gradius |
| **Regenerating walls** | Organic tissue walls that regrow after being shot | Gradius |
| **Grabbers** | Tentacles that hold the ship | Gradius |
| **Cube rush** | Fast cubes that charge and **stack into walls** (make it seeded & readable, not random) | Gradius |
| **Bouncers** | Bouncing balls among walls ("meatballs") | Gradius |
| **Laser emitters** | Giant sweeping lasers | Gradius |
| **Option Hunter** | Steals options (§8) | Gradius |
| **Kamikaze/rammers** | Charge at player | Darius |

### Enemy system requirements
- **[P0] Movement primitives:** straight, sine wave, aimed dash, Catmull-Rom / Bézier spline paths (arc-length parameterized), waypoint enter→stop→shoot→leave, follow-the-leader formations (path history with tick delay), ground crawling (floor/ceiling snapping), homing with turn-rate cap.
- **[P0] Formation tracking:** wave ID, "all killed" detection → drop.
- **[P0] HP, score value, hurtbox, flash-on-hit, death explosion, drops** — defined in `enemies.json`.
- **[P0] Off-screen rules:** no firing while off-screen; settle time after entering before firing.
- **[P0] Coroutine AI scripts** (TS generators: `yield wait(30); ring(16); …`).
- **[P1] Revenge ("suicide") bullets** on higher rank/loop 2+.
- **[P1] Rank modifiers** per enemy (fire rate, bullet speed).

---

## 12. Enemy bullets & attack patterns

- **[P0] Bullet kinematics:** position, speed, angle, acceleration, angular velocity, min/max speed.
- **[P0] Pattern primitives:** aimed (quantized to 16 or 32 directions, retro feel), N-way spread, ring, spiral, stack (same angle, varied speeds), random spray (seeded RNG), homing (turn-rate capped), delayed/changing bullets.
- **[P0] Lasers:** straight lasers with **warning line telegraph** → grow → capsule hitbox active only at full width. **[P1] Bending lasers** (ring buffer of head positions, subsampled hitbox nodes).
- **[P0] Bullets die on terrain.**
- **[P1] BulletML-inspired pattern DSL** (nested actions, `fire`, `wait`, `repeat`, `changeSpeed`, `changeDirection`, `$rank` param) as TS/JSON — not XML.
- **[P1] Bullet cancel:** on boss death / player death / Mega Crash, bullets convert to points/sparkles.
- **[P1] Readability rules:** high-contrast core + dark rim, pink/red/purple palette (avoid clashing with gold items and orange explosions), directional sprites for fast bullets, drawn **above** explosions and items.
- **Budget:** ~512 enemy bullets max (retro density, not bullet hell).

---

## 13. Bosses & mid-bosses

### Presentation
- **[P0] "WARNING!" intro** (Darius signature, first game ever with boss warnings): screen dims/flashes, wailing siren, scrolling text *"WARNING! A HUGE BATTLESHIP `<NAME>` IS APPROACHING FAST"*, boss code number (e.g., `HH02`). Music switches to boss theme. Scroll locks.
- **[P0] Boss death sequence:** bullet cancel → chained explosions → big final blast → hit-stop → score tally → stage clear jingle.
- **[P1] Boss HP bar** (optional/modern; neither original had one) **[?]**.
- **[P1] Boss timer / escape:** boss leaves after a time limit (Darius; Gaiden ≈ 4 min). Timeout can affect ending.

### Mechanics
- **[P0] Multi-part bosses:** hierarchical parts with local transforms, per-part HP & hurtbox, destructible arms/turrets/shields.
- **[P0] Weak points:** core only vulnerable after shields destroyed (Gradius "Big Core": shoot through layered shield plates to the blue core); mouths vulnerable only while open (Darius).
- **[P0] Phase state machine:** intro (invulnerable) → phases by HP threshold or timer → death. Destroying parts changes pattern set.
- **[P1] Battleship raids:** huge bosses bigger than the screen that you fly around (Darius Twin: Hyper Great Thing, Super Alloy Lantern) — camera pans around the boss.
- **[P1] Boss inside a boss** (Lantern → Great Tusk).
- **[P1] Double bosses** (two ships alternating, survivor speeds up — Emperor/Queen Fossil).
- **[P1] Mid-bosses ("captains")** that stay until destroyed (Darius): wave shooter + ram; splitting-shark launcher; screen-crossing circler; ring-firing crab.
- **[P1] Boss rush stage** (Gradius III "Boss on Parade").
- **[P2] Suction boss** (pulls ship toward it — Choking Weed), **grabber boss**, **invincible walker** that must be dodged (Shadow Gear).

### Boss roster ideas (archetypes — rename & redesign, don't copy)
| Archetype | Inspiration | Key behavior |
|---|---|---|
| Core battleship | Big Core Mk II/III | Shield plates in front of cores; lasers; pattern changes as cores die |
| Crystal core | Crystal Core | Tentacle arms, core behind crystals |
| Insect / arachnid | Goliath / Earwig Scorpion | Spawns spiders, pincers, splitting shots |
| Bubble mass | Bubble Eye | Tunnel through bubbles to reach eye |
| Twin-headed serpent | Vulture Dragon | Wraps around screen, body segments stay dangerous |
| Moai wall | Vaif | Heads open in order; reset if you miss one |
| Mechanical fish | Killer Higia | Tracks Y, mouth weak point, homing rockets, cutters |
| Twin coelacanths | Emperor/Queen Fossil | Alternating front, lasers from mouths |
| Squid | Demon Sword | Tentacles guard weak point; break one = changes behavior |
| Lobster | Dual Shears | Detachable claw drones, then ram |
| Seahorse | Dark Coronatus | Opens chest to launch homing minis |
| Octopus | Red Mist | Tentacle whip, splitting orbs, mines |
| Sea turtle | Full Metal Shell | Circles screen, drone swarms, neck lasers |
| Whale battleship | Hyper Great Thing | Raid: circle it, turret rows, hooks |
| Anglerfish fortress | Super Alloy Lantern | Raid; lure; opens to reveal final boss |
| Final boss | Bacterion / Great Tusk | (both were anticlimactic — make ours a real finale) |

---

## 14. Stages / zones

### Structure
- **[P0] Scroll-driven stage timeline:** spawn events keyed to camera X (so they sync with terrain); time-keyed during scroll stops and boss fights. Pre-sorted event array + cursor index.
- **[P0] Scripted camera path:** auto-scroll speed changes with ramps, scroll stops, **vertical sections** (Gradius tall stages that pan up/down), diagonal scrolling (Darius Twin zones J/K), scroll lock for bosses, **high-speed sections** (scroll speed ×N).
- **[P0] Tilemap terrain** (8×8 or 16×16 tiles, chunked), separate visual & collision layers; collision types: solid, destructible, hazard. Slopes via per-tile height/mask.
- **[P0] Parallax background layers** (N layers with scroll factors, integer-snapped), line-band parallax via raster effect.
- **[P1] Destructible terrain** (dig through blocks; hidden falling rocks).
- **[P1] Moving floors/ceilings** (Gradius fortress, Darius zone D).
- **[P1] Stage gimmicks** as reusable modules (splitting bubbles, suction, regenerating walls, grabbing tentacles, cube rush, falling rocks, volcanoes).
- **[P1] Branching zone map** (Darius): after each boss choose upper/lower path. Twin layout: 12 zones in a diamond (A → B/C → D → E/F → G/H/I → J/K → L), 7 zones per run. **Improve on Twin:** make zones distinct (no palette swaps), and have **multiple final zones / endings**. **[P2]** G-Darius mid-stage forks.
- **[P1] In-stage branching paths** (event branch IDs chosen by region trigger/flags).
- **[P1] Hidden bonus stages** (Gradius III SNES): secret entrances with conditions (fly into a bubble hole, destroy all ground targets, specific score digit…); contain 1UPs, bonus capsules (1,000 pts), destructible barriers; clearing skips the boss; dying locks you out.
- **[P2] Pseudo-3D "high-speed dimension" stage** (Gradius III arcade stage 4: behind-the-ship view dodging walls) — Mode 7-style effect.
- **[P2] Escape sequence** (collapsing, fast-scrolling maze after final boss).
- **Stage length:** ~3–6 minutes each (Gradius III loop ≈ 40–50 min for 10 stages; Darius run = 7 zones).

### Theme ideas (from both games — use as inspiration, make original)
| Theme | Gimmicks | Source |
|---|---|---|
| Space intro / starfield | Popcorn waves, first capsules, tutorial pacing | Both |
| Desert | Sand worms bursting from dunes, ceiling enemies | GIII st.1 |
| Bubbles / aqua | Bubbles split when shot, enemies inside bubbles | GIII st.2 |
| Volcano → underground | Erupting volcanoes, falling rocks, dive into a hole, destructible maze | GIII st.3 |
| Moai / stone heads | Heads spit rings, rotating pillars | GIII st.5 |
| Organic cells | Chasing cells, regenerating tissue walls | GIII st.6 |
| Fire | Splitting fireballs, narrow corridors | GIII st.7 |
| Plant | Grabbing tentacles, suction boss | GIII st.8 |
| Crystal | Crystal walls, cube rush | GIII st.9 |
| Fortress / mechanical base | Hatches, laser emitters, moving floors, meatballs, escape | GIII st.10 |
| Coast / sea under sky | Ground tanks, turrets | Twin A |
| Enemy base | Floor/ceiling/floating blocks that move | Twin D |
| Mountains | Jagged terrain, rear-entering enemies | Twin E/F |
| Storm clouds | Open space, heavy weather parallax | Twin G/I |
| Underwater coral | Wavy haze raster effect, bomb volcanoes | Twin H |
| Diagonal mech base | Diagonal scrolling, floating obstacles | Twin J/K |
| Final gauntlet | All mid-bosses again, no items | Twin L |

### Stage data format
- **[P0]** JSON (validated with a schema, e.g. zod/TypeBox) — layers, tilemaps, paths, events `{x, type, enemy, formation, path, branch}`. Attack patterns live in TS code referenced by ID; tunables live in data.
- **[P1]** Authoring in **LDtk** or **Tiled** (entity at x → event at scroll x; polylines → paths).

---

## 15. Scoring, lives, rank & loops

- **[P0] Score:** per-enemy values (~100–500 small, 5,000–10,000+ bosses **[?]** tune), capsule 300, bonus capsule 1,000, formation bonus, boss time bonus. Per-player totals in co-op.
- **[P0] Hi-score** displayed; **[P1] hi-score table** (top 8–10; name 3 letters; score; stage/zone reached — Twin showed zone; per difficulty/mode).
- **[P0] Lives:** start 3 (configurable 1–5; secret code for more).
- **[P1] Extends:** score thresholds (Gradius: 20k then every 70k) and/or rare 1UP items (Twin: 2 per run). Lives cap.
- **[P1] Rank / dynamic difficulty** (Gradius III formula as starting point):
  - `rank = difficulty + loop/stage + powerUps + special`, range 0–31, capped at 16 on loop 1.
  - Difficulty: Easy 0 / Normal 2 / Hard 4 / Very Hard 6. Stage: `8×(loop−1) + (stage−1)`.
  - Power: Speed +0, Missile +1, Double +2, Laser +3, each Option +1, Shield +4 (Reduce +2).
  - Rank scales enemy speed, fire rate, bullet speed, boss behavior; higher steps matter more.
  - Expose rank in debug overlay.
- **[P1] Difficulty presets:** Easy / Normal / Hard / Arcade — each maps to rank base, rank growth, lives, extend thresholds, death-penalty preset.
- **[P2] Loops:** 2nd loop with remixed layouts, faster bullets, revenge bullets.
- **[P2] Score-milking guards / scoring depth** (e.g., Twin's 30,000-pt turtle drones invited milking — add caps).
- **[P2] Multiple endings** based on route, deaths, boss timeouts (Twin had 5 endings).

---

## 16. Game modes

| Mode | Priority | Notes |
|---|---|---|
| 1 Player | P0 | |
| 2 Player simultaneous co-op | P1 | Separate lives; items go to whoever grabs; drop-in join **[?]**. Twin had no continues. |
| Difficulty select | P1 | Easy/Normal/Hard/Arcade (+ hidden) |
| Weapon select / Weapon Edit | P1 | Meter mode |
| Practice / stage select | P1 | Choose stage, checkpoint, loadout; separate score table |
| Boss rush | P2 | |
| Attract / demo mode | P1 | Plays bundled replays; any input → title |
| Bonus stages | P2 | Hidden |
| Score attack / caravan (time-limited) | P2 | Modern addition |
| Loop 2 / Arcade mode | P2 | |

---

## 17. Screens, UI flow & HUD

### Scene flow
```
Boot (load assets, refresh probe, storage load)
  → Attract loop (intro story crawl ⇄ title ⇄ demo play ⇄ hi-score table)
  → Title ("PUSH START BUTTON")
  → Mode select (1P / 2P / Options / Practice)
  → Ship / Weapon select (Type A–D or Edit) → Shield select
  → Zone map (Darius-style route choice; "ROUND SELECT / PLANET <NAME>")
  → Stage intro (ship launch) → Play ⇄ Pause
       → Mid-boss → WARNING → Boss → Stage clear (tally)
       → Death/Respawn → Continue? → Game over
  → Zone map (next zone) … → Final boss → Escape → Ending → Credits
  → Name entry (3 letters) → Hi-score table → Attract
```
Pause and Options are overlays on a scene stack.

### Screens
- **[P0]** Title, pause, game over, stage clear.
- **[P1]** Attract-mode story crawl (text over sprite scenes — both games had one), options, weapon select, zone map, name entry, hi-score table, continue countdown, ending(s), credits.
- **[P1] Tizen exit confirmation** dialog on Back from title (store requirement).

### HUD
- **[P0]** Score (1P / HI / 2P), lives (ship icon + count), **power meter** (Meter mode, 7 labeled slots, highlighted slot flashes, maxed slots greyed) or **tier pips** (Direct mode: shot/sub/shield levels).
- **[?] HUD placement:** Gradius III puts HUD in a bottom strip *below* the playfield; Darius Twin overlays score at top and lives at bottom corners. Recommendation: thin top bar for score + bottom strip for meter, both outside the 384×216 playfield or overlaid with transparency — decide in mockups.
- **[P1]** Shield state indicator, boss HP bar (optional), rank display (debug), co-op P2 HUD, "PRESS START" join prompt for P2.
- **[P1] Bitmap font** (pixel font; digits must be very readable).
- **[P0] Canvas-drawn UI kit** (no DOM/React/Vue): list menu, slider, toggle, key-rebind prompt, 3-letter name entry, confirm dialog (incl. Tizen exit confirm) — focus moved by input actions (D-pad/remote/gamepad/keyboard).

---

## 18. Visual look & effects

- **[P0] Style:** SNES-era 16-bit pixel art: limited palettes per sprite (SNES used 16-color sprite palettes), bold outlines, saturated colors. Big detailed bosses (Darius), organic/mechanical terrain (Gradius). *Graphics don't need to be great* — clarity and speed first.
- **[P0] VA-panel-friendly palette:** our M7 test monitors are VA panels, which smear dark→bright transitions. Avoid pure-black (#000) backgrounds behind small bright bullets — use lifted dark backgrounds (deep navy/space-blue starfields) so bullets stay crisp while moving.
- **[P0] Sprite atlas** (single 2048² atlas where possible), batched rendering (one draw call per layer group).
- **[P0] Parallax starfields & layered backgrounds.**
- **[P0] Explosions:** larger than the enemy sprite, varied debris; bosses get chained multi-explosions.
- **[P0] Hit flash:** white flash 1–2 ticks on enemy hit (per-vertex tint so batching isn't broken), rate-limited to avoid strobing; "clink" sparks on invulnerable armor.
- **[P0] Draw order** (bottom→top): far BG → mid BG → terrain → ground enemies → air enemies → player shots → player → hitbox marker → items → explosions/particles → **enemy bullets** → HUD.
- **[P1] Palette effects:** palette swap (color variants of enemies / co-op ships), palette cycling (glowing cores, water, lava), flash on Mega Crash.
- **[P1] Raster/HDMA-style effects:** per-scanline offset table (1×H data texture) for wavy water, heat haze, per-line parallax floors.
- **[P1] Screen shake:** integer-pixel, decaying, 3 magnitudes, subtle (hurts readability) + off switch.
- **[P1] Hit-stop:** 4–5 ticks on boss kill / big events only (sim-side, deterministic).
- **[P1] Particles:** pooled, count-capped, additive blend, cosmetic RNG.
- **[P2] Mode 7-style effects:** scaling/rotation, pseudo-3D floor (per-row affine matrix in shader).
- **[P2] CRT / scanline filter:** Off / Light / Full (cap output to 1080p on TV for cost).
- **[P2] Widescreen "Darius-style" ultra-wide mode** for desktop.
- **Not needed:** sprite flicker / per-scanline sprite limits (use SNES limits only as art-direction constraints).

---

## 19. Audio

### Music
- **[P0] Music playback with intro + seamless loop** (`AudioBufferSourceNode` `loop`, `loopStart`, `loopEnd` in samples; OGG Vorbis — avoid MP3 because encoder padding breaks loop points).
- **[P0] Tracks needed** (original compositions in the style of Konami Kukeiha Club / Taito Zuntata — chip/FM/sampled SNES-like):
  - Title / attract intro, weapon select, zone map ("Next Trial"-style), one track per stage/zone theme, boss theme, final boss theme, special boss theme(s), stage clear jingle, game over, name entry, ending, credits, bonus stage, boss-rush, escape.
- **[P1] Memory budget:** decoded PCM is ~21 MB/min stereo at 44.1 kHz — decode only the current stage's track, or decode at 32 kHz, or **[?]** synthesize via a tracker/module player (tiny files, SNES-authentic; chiptune3 needs WASM + AudioWorklet, both available on our Tizen 5.5 target — benchmark CPU cost).
- **[P1] Ducking:** duck music on death, WARNING siren, pause.

### SFX
- **[P0] Core SFX:** player shot (per weapon), missile, laser hum, enemy hit (small tick), enemy explode (small/med/large), boss explode chain, player death, power capsule pickup, meter advance "ding", power-up equip, shield hit, shield break, 1UP, Mega Crash/bomb, menu move/select/back, pause.
- **[P0] WARNING siren** (sacred — Darius signature).
- **[P1] Voice callouts** (original recordings): power-up names, "Destroy them all!"-style lines, stage start, warning.
- **[P0] SFX voice management:** pre-decoded AudioBuffers (never decode mid-game — Tizen decode is slow), per-SFX instance cap (2–4), global voice cap (~12–16), priority tiers (death/1UP/warning uninterruptible), dedupe identical SFX within one tick. Mirrors SNES drivers (~6 music + 2 SFX channels).
- **[P0] Buses:** master / music / SFX / UI gain nodes with volume sliders.
- **[P0]** `AudioContext` with `latencyHint: 'interactive'`; `resume()` on first input (autoplay policy); `suspend()` on hidden.

---

## 20. Game feel / "juice"

- Hit flash + impact sparks + subtle hit SFX on every damaging shot.
- Distinct "clink" + no-damage spark on invulnerable parts.
- Big, satisfying explosions (bigger than enemy), score popups.
- Telegraphing: laser warning lines, charge-up anims, enemy settle time, WARNING screen.
- Enemy bullets always have a visible point of origin (no bullets from nowhere).
- Bullet cancel into points on boss death.
- Invincibility blink after respawn; clear death feedback.
- No input lag, no inertia, instant direction changes.
- Pickups: magnetized slightly toward the player? **[?]** (not in originals).
- Rumble on death / boss kill (gamepad).
- Screen shake used sparingly.

---

## 21. Meta systems: options, saves, replays, accessibility

### Options menu
- **[P0]** Audio: master / music / SFX sliders.
- **[P1]** Controls: rebind, autofire mode & rate, SOCD, remote mode.
- **[P1]** Display: scale mode, CRT filter, screen shake on/off, flash reduction, show hitbox.
- **[P1]** Game: difficulty, starting lives, death-penalty preset, auto power-up, language.
- **[P1]** Sound test (both originals had one).

### Saves
- **[P0]** Hi-scores + options persisted. Versioned JSON with migrations.
- **[P1]** Storage abstraction: `localStorage`/IndexedDB (web & Tizen) vs filesystem (Electron). Tizen: uninstall must delete user data.
- **[P1]** Unlocks (Extra Edit, stages, ships).

### Replays
- **[P1]** Input recording (per-tick bitmask per player, RLE-compressed; ~72 KB raw / 20 min / player).
- **[P1]** Header: build hash, seed, difficulty, all sim-affecting options (autofire rate, slowdown, death preset), start stage/checkpoint, loadout.
- **[P1]** Periodic state hash embedded to detect desyncs. Replays locked to build version.
- **[P1]** Attract mode uses the same playback path.
- **[P2]** Save/share replays, replay browser, fast-forward.

### Accessibility
- **[P1]** Full remapping, one-button play (autofire + auto power-up), colorblind bullet palettes + shape coding, reduced flashing (<3 flashes/sec), shake toggle.
- **[P2]** Game-speed assist (e.g., 75%), invincibility assist — both flag scores/replays as assisted.
- **[P2]** Localization via JSON string tables + bitmap font atlases (CJK = bigger atlases).

---

## 22. Engine systems (technical requirements)

### Architecture
- **[P0] Hard sim / presentation split.** The simulation is pure TS — no DOM, WebGL, or audio imports. It exposes read-only state + an **event queue** (SFX, particles, shake, flash) consumed by renderer and audio. Gives headless tests, fast-forward, replays, attract mode for free.
- **[P0] Scene stack / state machine:** Boot, Attract, Title, Select, Map, Game (sub-states: StageIntro, Play, BossWarning, Boss, StageClear, Death/Respawn, Continue, GameOver), NameEntry, HiScore; Pause & Options as overlays.
- **[P0] Hybrid data layout** (recommended over full ECS): high-count homogeneous things (enemy bullets, player shots, particles) in **struct-of-arrays typed-array pools**; enemies/bosses (≤ ~100) as plain TS objects composed of components (Mover, Hurtbox, Health, Script) driven by generators.
- **[P0] Data-driven content:** `enemies.json`, `weapons.json`, `stages/*.json`, schema-validated at load.

### Fixed tick order (deterministic)
`input → player move → stage event cursor / spawns → scripts (generators) → movement → collision → damage resolution → deferred removal → emit events to presentation`

### Determinism
- **[P0]** Seeded PRNG (sfc32 / mulberry32); **two streams**: gameplay RNG (affects replays) and cosmetic RNG (particles, shake).
- **[P0]** Precomputed sin/cos lookup tables with binary angles (256 or 1024 per circle) + table-based atan2 — `Math.sin/cos/atan2` can differ across engines.
- **[P0]** Never read `Date.now()` / `performance.now()` inside the sim.
- **[P1]** Cross-engine determinism test (same replay in Chrome, Firefox, Electron, real Tizen → compare state hashes).

### Performance / GC
- **[P0]** Zero per-frame allocations in hot loops (no `map/filter`, closures, spreads, `{x,y}` temporaries, `for…in`). Object pools preallocated. HUD strings rebuilt only on change. Reused vertex buffer.
- **[P0] Budgets (starting points — validate on the oldest supported TV):** sim ≤ 4 ms/tick, render ≤ 8 ms; ~512 enemy bullets, 64 player shots, 64 enemies/parts, 256 particles; ≤ 20–50 draw calls; 1–2 × 2048² atlases; < 100 MB total memory (Tizen dev installs are capped at 120 MB).

### Collision
- **[P0]** Circle-vs-circle for bullets (squared distances), AABB for enemies/terrain, capsule (point-to-segment) for straight lasers, circle chains for bending lasers.
- **[P0]** Enemy bullets vs player: brute force (only 1–2 players). Player shots × enemies: uniform grid (e.g., 32 px cells) rebuilt each tick via counting sort.
- **[P0]** Layer/mask bitfields per entity type.
- **[P0]** Terrain: tile lookup for cells overlapping the small terrain box; per-tile height/mask for slopes; "find floor" query for crawlers/missiles.
- **[P1]** Swept tests only for very fast shots/lasers (no general continuous collision).
- **[P2]** Graze detection (radius > hurtbox, per-bullet "grazed" bit) if we add grazing score.

### Rendering pipeline
- **[P0]** WebGL1 sprite batcher (WebGL2 if available, WebGL1 guaranteed) → low-res FBO → integer-upscale pass; Canvas2D fallback.
- **[P0]** Per-vertex tint/flash attribute; texture atlas; one dynamic VBO.
- **[P1]** Raster-effect shader (per-scanline offset table texture); palette texture for indexed-color sprites.
- **[P2]** Mode 7 shader; CRT shader.

### Audio engine
- **[P0]** Web Audio mixer: buses, voice cap, priorities, loop points, pre-decoded buffers, suspend/resume.

### Stage runtime
- **[P0]** Camera path runner, event cursor, spawner, checkpoint system, tilemap renderer + collider, parallax manager.

---

## 23. Platform layer (core lib + Tizen + Electron + web)

Language/platform verdict from research: **TypeScript web app** (Tizen `.wgt`). Tizen native C/C++ is effectively blocked for non-partners on retail TVs; Tizen .NET's UI stack (Xamarin.Forms) is EOL; WASM only helps if you already have a C++/Rust engine and needs 2020+ TVs; Unity dropped Tizen; Godot 4 web export on Tizen is unproven. (Details in `shmup_tech.md`.)

### Repo structure (to be finalized in planning)
```
shmup-core        # engine + game, platform-agnostic TS (no tizen/electron/DOM-platform globals)
shmup-web         # Vite dev target: keyboard + Gamepad API, localStorage, HMR
shmup-tizen       # config.xml, icons, key registration, keycode map, lifecycle, exit, wgt packaging
shmup-electron    # BrowserWindow fullscreen, file saves, optional Steamworks
(shmup-webos)     # later: LG webOS adapter (Back = 461, appinfo.json)
```
Monorepo (pnpm workspaces) vs separate repos with published `@shmup/core` package — decide in planning.

### `Platform` interface the core consumes
- `input.poll()` → action snapshot (adapters merge keyboard / remote / gamepad into actions; core never sees keycodes)
- `storage.get/set` (async)
- `audio.unlock()` (gesture unlock on web; no-op on TV/Electron)
- `lifecycle.onSuspend/onResume` (pause sim, suspend audio)
- `exit()` or `null` (hide "Quit" in browser)
- `display` size info; `caps` { gamepad, remoteOnly, webgl2 }

### Tizen-specific requirements
- **[P0]** Back key (10009): in-game → pause menu; on title → **exit confirmation popup** → `tizen.application.getCurrentApplication().exit()`. Don't register long-press Back (it's Exit).
- **[P0]** `registerKeyBatch` for media/color keys (Play/Pause 10252 → pause, colors 403–406 → optional).
- **[P0]** `visibilitychange` → pause game, suspend audio; don't trust wall clock on resume.
- **[P0]** Launch ≤ 10 s (5 s ideal); no crash/freeze; responsive after long sessions.
- **[P0] Target: Tizen 5.5+ (2020 models, Chromium 69) — decided.** Our two test displays are Tizen 5.5. Vite/esbuild `target: 'chrome69'`, single IIFE bundle (ES modules only "partially" supported), `globalThis` polyfill, avoid newer APIs (`Array.at`, `structuredClone`, `Object.hasOwn`, `replaceAll`, `Promise.allSettled`) or polyfill. WASM + AudioWorklet are available on 5.5.
- **[P0] No UI framework** (no React/Vue/Svelte) in the shipped game — HUD and all menus are canvas-drawn (sprites + bitmap font) on a scene stack, driven by the same input actions as gameplay. Frameworks allowed only in separate dev tools.
- **[P1]** Samsung author + distributor certificates (back up the author cert — needed for all updates); VS Code Tizen extension / `tizen` CLI packaging in CI; Developer Mode deploy via `sdb`; Chrome DevTools remote inspection.
- **[P1]** Gamepad metadata in `config.xml`; `use.game.mode` metadata **[?]** (may reduce panel latency — test).
- **[P1]** Store: Public Seller = US only; Partner Seller (contract) for other regions.

### Electron-specific
- **[P1]** Fullscreen BrowserWindow, vsync, file-based saves, gamepad, window/scale settings.
- **[P2]** Steamworks (achievements, cloud saves) via steamworks.js; Steam Deck verified.

### Web-specific
- **[P0]** Dev target with HMR; **[P2]** public itch.io / web release.

---

## 24. Dev tooling & debug features

- **[P0]** Debug overlay: hitboxes/hurtboxes, collision grid, pool usage, entity counts, tick ms / render ms, draw calls, FPS, rank, RNG call count, state hash.
- **[P0]** God mode, stage skip, jump to scroll X / checkpoint, frame advance (pause + step one tick), slow-mo.
- **[P1]** Spawn inspector (upcoming events vs scroll X), live-reload of JSON data and scripts ("restart stage at X").
- **[P1]** Auto-record replay every dev run (bug repro).
- **[P1]** Automated tests (Vitest, headless Node): golden replays asserting final state hash, pool/grid unit tests, headless ticks/sec benchmark in CI.
- **[P1]** Live reload to real TV (Samsung's HMR-over-WebSocket approach cuts iteration ~70 s → ~25 s).

---

## 25. Content / asset production list

| Asset | Count (v1 estimate) | Notes |
|---|---|---|
| Player ships | 1–2 (+ co-op palette) | 8–16 frame bank animation, thruster |
| Options / shields sprites | ~10 | Each shield type w/ wear states |
| Player weapons | ~20 projectile sprites | Per weapon/level |
| Small enemies | 25–40 types | 2–8 frames each |
| Mid-bosses | 4–6 | Multi-part |
| Bosses | 8–12 | Large multi-part, destructible parts |
| Items / capsules | ~8 | Capsule, colored items, 1UP, bonus |
| Enemy bullets | ~10 | Small/medium/large, lasers, rings |
| Explosions / particles | ~8 sets | Small, medium, large, boss chain, sparks, debris |
| Tilesets | 1 per stage theme (6–12) | Terrain + collision |
| Parallax backgrounds | 2–4 layers per stage | |
| UI | Title logo, fonts (bitmap), meter, icons, map screen, menus | |
| Music | ~20–25 tracks | See §19 |
| SFX | ~40–60 | See §19 |
| Voice clips | ~15 | Optional |
| Story/intro crawl | 1 | Text + sprite scenes |
| Endings | 2–5 | |

Tools (candidates — see `shmup_tech.md`): Aseprite/LibreSprite (pixel art), LDtk/Tiled (levels), TexturePacker/free-tex-packer (atlases), Furnace/OpenMPT (music), jsfxr/ChipTone (SFX), BMFont/Hiero (bitmap fonts).

---

## 26. Legal / IP notes

- Game **mechanics** (power meter, options, orb power-ups, branching zones) are not copyrightable, but **names, logos, characters, art, music and sound are.**
- Do **not** use: "Gradius", "Darius", "Vic Viper", "Silver Hawk", "Big Core", "Moai" boss names, Konami/Taito logos, ripped sprites/music/voice, or the exact "WARNING! A HUGE BATTLESHIP …" text verbatim **[?]** (paraphrase / restyle it).
- Create original ship, enemy and boss designs "in the spirit of", with original names and original music/SFX.
- Before store submission, have the title and key art reviewed for trade dress similarity.

---

## 27. Open questions & things to verify on hardware

**Design decisions**
- Meter vs Direct power-up model (or both as ship/mode choice)?
- Default death-penalty preset?
- Branching map vs linear stages for v1?
- HUD placement (bottom strip vs overlay)?
- Include Mega Crash / bomb / a modern signature mechanic (black hole, capture ball, burst beam)?
- Internal resolution 384×216 vs 320×180?
- ~~Minimum Tizen model year~~ → **decided: Tizen 5.5 (Chromium 69)**.
- ~~UI framework?~~ → **decided: none in the game** (canvas-drawn UI).
- Music format: OGG streams vs tracker modules (chiptune3 is viable on 5.5 — benchmark it)?

**To verify on our Tizen 5.5 displays (Samsung Smart Monitor M7 43", M70A — the performance floor; likely entry-level Kant-SU2 SoC; turn off Auto Source Switch+ on test rigs)**
- WebGL2 availability and `MAX_TEXTURE_SIZE` per model year.
- rAF rate on 120 Hz panels; 50 Hz behavior in PAL regions.
- Whether `use.game.mode` metadata lowers panel latency for a local game.
- **Remote (primary controller!):** can two arrows be held at once (diagonals)? Can OK be pressed while an arrow is held? Does holding a key send clean `keydown`…`keyup` or fake release/press pairs during repeat? Repeat delay/interval. Bluetooth remote latency. Which of Ch±, Play/Pause, Vol± can be registered.
- Gamepad API behavior per model year.
- Web Audio output latency, voice limits, `decodeAudioData` speed.
- localStorage/IndexedDB persistence across app updates.
- Actual memory limit for store-installed apps.
- Whether OS upgrades (e.g., Tizen 9 on a 2023 set) also upgrade the web engine.
- `Math.sqrt` / float determinism across engines (or use fixed-point / lookup tables).

---

## Appendix A — Gradius III reference data

- **Hardware:** arcade 320×224 @ ~59.19 Hz (Konami GX945: 68000 @ 10 MHz, Z80, YM2151 FM + K007232 PCM). SNES 256×224, stock 3.58 MHz 65816, heavy slowdown.
- **Arcade controls:** 8-way stick; A = power-up, B = shot, C = missile. SNES: freely assignable, Turbo Shot, Auto Power-Up, Easy/Normal/Hard + hidden Arcade.
- **Arcade extends:** 20k then every 70k (default DIP). Lives 2/3/5/7. SNES: 3 credits (code for ~9).
- **Death:** Technical course = lose everything, cursor reset. Beginner course = lose one level (Option → Laser/Double → Missile → Speed Up), cursor kept.
- **Arcade stages:** 1 Sand Storm (Goliath) · 2 Aqua Illusion (Bubble Eye) · 3 In the Wind → Underground (Big Core Mk III) · 4 High Speed Dimension (3D, no enemies) · 5 Easter Stone (Dogas → Vaif) · 6 Dead End Cell (Gregol) · 7 Fire Scramble (Wyvern → Vulture Dragon) · 8 Cosmo Plant (Choking Weed) · 9 Crystal Labyrinth + Cube Rush (Lizard Core) · 10-1 Boss on Parade (Tetran, Covered Core, Big Core Mk II, Crystal Core, Death Mk II, Dellinger Core) · 10-2 Mechanical Base (Disrupt → Shadow Gear → Bacterion). Hidden Salamander/Gradius warp stages via Bacterion's energy balls.
- **SNES stages:** Desert · Bubbles · Volcano/underground · Moai · Fire · Plant · High-speed "Accident Road" (Beacon) · Boss rush · Fortress · Cell (Bacterion). Cut: 3D stage, Crystal/Cube stage, half the maze. Added: 5 hidden bonus stages (1UPs, 1,000-pt capsules, skip boss).
- **Rank formula:** see §15.
- **Option Hunter:** 3 types, appears at set points, steals options; Mega Crash frees them.
- **Criticisms to avoid:** unrecoverable deaths, frame-counter-random Cube Rush, recycled content, slowdown, visual clutter (Spread Bomb / E.Laser), anticlimactic final boss, unfair Option Hunter timing.
- **Music (arcade):** Prelude of Legend, Invitation, Departure for Space, Sand Storm, Aqua Illusion, In the Wind, Underground, Dark Force (boss), Congratulations, High Speed Dimension, Easter Stone, Dead End Cell, Fire Scramble, Cosmo Plant, Crystal Labyrinth, Poison of Snake, Take Care!, Mechanical Base, Final Shot, Escape to Freedom, Return to the Star, King of Kings (name entry).

## Appendix B — Darius Twin reference data

- **Hardware:** SNES 256×224; smooth, almost no slowdown (low bullet count). JP mono, NA/EU stereo.
- **Controls:** D-pad; Y = main shot; B = sub-weapon; Start = pause. Options: player stock (per player, default 3), rapid fire, sound test, level (Normal/Easy).
- **Modes:** 1P (green ship), 2P simultaneous (red + blue). No continues.
- **Items:** 6-cube carrier waves (last killed drops item). Red = shot, green = sub, blue = shield, orange = 1UP (2 per run), yellow = smart bomb, red octagon = shot-family switch (2 per run). Per route: red 5–8, blue 13–19, green 11–14. Zone L has none.
- **Death:** keep shot/sub levels, lose shield.
- **Shield (Arm):** green (3 hits) → silver (4, after 4 blue) → gold (5, after 9 blue); also absorbs terrain.
- **Zone map:** A → B/C → D → E/F → G/H/I → J/K → L (7 per run, 12 routes).
- **Zones & bosses:** A coast (Killer Higia) · B/C space (Emperor + Queen Fossil) · D enemy base (Demon Sword) · E/F mountains (Dual Shears) · G/I storm clouds (Dark Coronatus) · H underwater (Red Mist) · J diagonal-down base (Full Metal Shell) · K diagonal-up base (Hyper Great Thing) · L final gauntlet (Super Alloy Lantern → Great Tusk).
- **Captains:** Dark Angel, Pente-Shark, Blowhard, Radiator.
- **Endings:** 5, depending on route / deaths / Lantern timeout **[?]**.
- **Hi-score table:** 8 entries, 3-letter name, score, zone reached. Default hi-score 100,000.
- **HUD:** top row 1P score / HI SCORE / 2P score; bottom corners lives; no power gauges.
- **Criticisms to avoid:** too easy, no Hard mode, empty starfield zones, palette-swap zones, weak/recycled bosses, anticlimactic final boss, large hitbox, only one final zone, grating instrumentation.
- **Series mechanics worth borrowing:** zone map with multiple final zones (Darius/Gaiden/G-Darius), black-hole bomb & captain capture (Gaiden), capture ball & beam duel (G-Darius), burst beam (Dariusburst), ship select (Force/Burst), manual turn-around (Burst AC).

## Appendix C — Sources

**Gradius III:** [shmups.wiki](https://shmups.wiki/library/Gradius_III:_Densetsu_kara_Shinwa_e) · [shmups.wiki Strategy](https://shmups.wiki/library/Gradius_III/Strategy) · [StrategyWiki Weapons](https://strategywiki.org/wiki/Gradius_III/Weapons) · [GameFAQs (Keene)](https://gamefaqs.gamespot.com/snes/588362-gradius-iii/faqs/5519) · [GameFAQs (jygting)](https://gamefaqs.gamespot.com/snes/588362-gradius-iii/faqs/35467) · [Hardcore Gaming 101](https://www.hardcoregaming101.net/gradius-iii/) · [Wikipedia](https://en.wikipedia.org/wiki/Gradius_III) · [Shmuplations interview](https://shmuplations.com/gpg-gradius/) · [SNES manual](http://www.world-of-nintendo.com/manuals/super_nes/gradius_3.shtml) · [arcade DIP switches](https://www.arcade-museum.com/dipswitch-settings/gradius-iii) · [MAME data](http://adb.arcadeitalia.net/?mame=gradius3) · [SA-1 patch](https://github.com/VitorVilela7/SA1-Root/blob/master/Gradius-III/README.md)

**Darius Twin:** [Wikipedia](https://en.wikipedia.org/wiki/Darius_Twin) · [Darius Wiki](https://darius.fandom.com/wiki/Darius_Twin) · [shmups.wiki](http://shmups.wiki/library/Darius_Twin) · [Hardcore Gaming 101](https://www.hardcoregaming101.net/darius-twin/) · [GameFAQs (DDCecil)](https://gamefaqs.gamespot.com/snes/588271-darius-twin/faqs/17710) · [GameFAQs (Rampidzier)](https://gamefaqs.gamespot.com/snes/588271-darius-twin/faqs/37600) · [GameFAQs item chart](https://gamefaqs.gamespot.com/snes/588271-darius-twin/faqs/21286) · [1CC Log](http://1cclog.blogspot.com/2010/07/darius-twin-snes.html) · [Nintendo Life](https://www.nintendolife.com/reviews/2010/12/darius_twin_virtual_console)

**Engine / design:** [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) · [Game Programming Patterns](https://gameprogrammingpatterns.com/) · [Boghog's bullet hell 101](https://shmups.wiki/library/Boghog's_bullet_hell_shmup_101) · [Anatomy of a Shmup](https://www.gamedeveloper.com/design/the-anatomy-of-a-shmup) · [Sparen's Danmaku Design Studio](https://sparen.github.io/ph3tutorials/danmakudesign.html) · [BulletML](https://www.asahi-net.or.jp/~cs8k-cyu/bulletml/index_e.html) · [SNESdev wiki](https://snes.nesdev.org/wiki/Sprites) · [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/basic/) · [Input in fixed timestep](https://jakubtomsu.github.io/posts/input_in_fixed_timestep/)

**Tizen:** [Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html) · [Remote Control](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html) · [Gamepad](https://developer.samsung.com/smarttv/develop/guides/user-interaction/gamepad.html) · [Screen resolution](https://developer.samsung.com/smarttv/develop/guides/fundamentals/managing-screen-resolution.html) · [Mandatory features checklist](https://developer.samsung.com/smarttv/develop/development-checklist/mandatory-features.html) · [Multitasking](https://developer.samsung.com/smarttv/develop/guides/fundamentals/multitasking.html)
