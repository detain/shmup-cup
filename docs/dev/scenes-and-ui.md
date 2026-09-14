# Scenes, the canvas UI kit and the HUD

How the game goes from the title to a game and back — the scene stack, the M1 scene flow (boot,
title, game, pause, stage clear, game over, the YES / NO dialog), the canvas-drawn menus and the
in-game HUD. Filled in by plan step **M1-16**; **M1-17** added the Options screen (an overlay from
the title and the pause menu), the `Choice` widget and the saved hi-scores — the save itself, the
user options and their live application are [saves-and-options.md](saves-and-options.md).
**M2-01** added the difficulty menu under START and the continue countdown after a game over
(the presets, rank, extends and continues themselves are [difficulty-and-rank.md](difficulty-and-rank.md)).
**M2-03** added the weapon select after the difficulty menu — with its live preview and the Auto
Power-Up order editor — and the HUD meter's weapon names (the arsenal itself is
[meter-arsenal.md](meter-arsenal.md)). **M2-05** added the **ship select** between the difficulty
menu and the weapon select, per-mode session hi-scores and the HUD's Direct-mode **tier pips**
(Direct mode itself is [direct-mode.md](direct-mode.md)).

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#scenes--scene-stack-and-the-m1-flow-partial) (`scenes`) and
[api-reference.md](api-reference.md#ui--canvas-ui-kit-and-the-hud-partial) (`ui`); the TSDoc in
the sources (`packages/core/src/scenes`, `ui`, `game`; `packages/shell/src/scene-view`, `boot`;
`apps/tizen/src/boot`) is the authoritative reference. How draw lists reach the screen is
[rendering-and-shell.md](rendering-and-shell.md#draw-lists-drawlist); the menu / game binding
tables are [input-profiles.md](input-profiles.md).

Background: `shmup_feat.md` §17 (scene flow, screens, the HUD, the UI kit), §23 (Tizen Back key,
exit confirmation, pause on resume), §4 rule 8 (menus fully D-pad + OK + Back navigable, input
buffering); `shmup_tech.md` §4.10 (no UI framework: canvas menus and a bitmap font); plan §3.4
(render contract) and decisions **D15** (`game` / `menu` binding contexts) and **D20** (HUD bars
outside the playfield).

## The picture at a glance

```text
 @shmup/core                                                            @shmup/shell
┌──────────────────────────────────────────────────────────────┐    ┌────────────────────────────┐
│ createGame(platform, config, content, { scenes: 'boot' })    │    │ bootShell (scene 'game'):  │
│  ├─ one EventQueue for the session                           │    │  finishBoot() after the    │
│  └─ createSceneFlow(host, 'boot')                            │    │  loading phase             │
│      SceneStack (depth 8, deferred transitions)              │    │ frame loop:                │
│      ┌─────────┐   ┌──────────┐   ┌─────────┐                │    │  game.frame(now)           │
│      │ confirm │ ◄─│ pause    │ ◄─│  game   │ owns World     │    │  sceneView.follow()        │
│      │ (YES/NO)│   │ (overlay)│   │ (HUD,   │ (fresh per     │───►│  events.drain(dispatch)    │
│      └─────────┘   └──────────┘   │ WARNING)│  start/retry)  │    │  sceneView.update(         │
│      stageClear / continue / gameOver (overlays, frozen game)│    │    game.renderFrame())     │
│      boot → title (PRESS OK, START/OPTIONS/EXIT) → difficulty│    │  → renderer.render(frame)  │
│      → ship select → weapon select (preview World, ORDER)    │    │                            │
│  step(): poll → flow.tick(input) → top scene only            │    │ canvas data-shmup-scene    │
│  renderFrame(): flow.updateFrame() → world view + HUD while  │    └────────────────────────────┘
│    the game is visible, one UI list, the top scene's dim     │
└──────────────────────────────────────────────────────────────┘
 core/ui: ListMenu / Slider / Toggle / Choice / Confirm, menuTick / confirmTick, drawPanel /
          drawMenu / drawConfirm, buildHud + Hud (change detection) — plain state, numbers, draw
          lists. The Options overlay (M1-17) sits over the title or the pause menu
```

## Two ways to run a game

`createGame(platform, overrides, content, options)` gained `GameOptions.scenes`:

| `options.scenes` | The session | Used by |
|---|---|---|
| omitted / `null` | **Bare gameplay**, exactly as before M1-16: one World from creation, `stepWorld` every tick, nothing reacts to its status (it keeps simulating after a game over) | Every earlier test, the tools, the shell's dev scenes (`?scene=flight`, `showcase`, `calibration`, `fx-gallery`) |
| `'boot'` | The scene flow, starting on the boot scene until `game.scenes.finishBoot()` | The shell's default scene `game` (web and TV) |
| `'title'` | The flow, starting on the title | Tests |
| `'game'` | The flow, starting in a game | Tests, dev |

With the flow:

- `game.step()` polls once and calls `game.scenes.tick(input)` — only the **top** scene ticks.
- `game.world` is a getter for the game scene's World — **a new object per game start and per
  RETRY STAGE** (never keep it across a start); before the first start it is a placeholder World
  (so it is never `null`) whose queued stage theme the flow drops.
- `game.inputContext` is the top scene's (`'game'` only while the game scene is on top).
- `game.events` is one `EventQueue` for the whole session: every World is created with
  `WorldOptions.events` = that queue, and the menus' sounds and the scenes' music are pushed into
  it too. The host drains one queue, whichever World runs.
- A platform resume calls `game.scenes.onResume()`: with the game on top it pushes the pause
  menu, so the player comes back to a paused game (shmup_feat.md §23).
- `game.pause()` stays a **host-level** freeze (a debugger's pause); the pause *menu* is a scene
  and the flow keeps ticking under it.

## The scene stack (`SceneStack`)

A fixed array of at most `SCENE_STACK_DEPTH` = 8 scenes. Only the top one ticks.

| Call | Effect (hooks in order) |
|---|---|
| `push(scene)` | the old top gets `cover()`, the new one `enter()` |
| `pop()` | the top gets `exit()`, the one below `uncover()`; an empty stack does nothing |
| `replace(scene)` | the top gets `exit()`, the new one `enter()` (nobody is covered); on an empty stack it pushes; replacing the top with itself does nothing |
| `reset(scene)` | every scene gets `exit()`, top first, then `scene` is pushed and gets `enter()` — "quit to title" |

**Deferred transitions.** A request made while a scene ticks (`stack.tick` sets a flag) is queued
(at most 8 per tick) and applied **in request order at the end of the tick**, so a scene never
runs half a tick after it left. Requests made by the hooks the flush runs are applied in the same
flush; a chain of more than 64 throws (`scene transitions keep requesting transitions`). A request
made **outside** a tick — a platform resume, a host call — applies at once. A throwing scene does
not wedge the stack: the ticking flag is cleared in a `finally`.

Errors are programming errors and throw `RangeError`: a push on a full stack, a scene that is
already on the stack (scenes are singletons — the flow owns one instance of each), more than 8
requests in one tick.

The lookup method is `sceneAt(i)` (0 = bottom) — not `at(i)`: the Chrome-69 ESLint rule rejects
any `.at(` call, whatever the receiver ([conventions.md](conventions.md#chromium-69-rules)).

A `Scene` declares `id`, `overlay` (the scene below keeps being drawn — frozen, since only the
top ticks), `inputContext` (D15), `dim` (0…1 darkening of the world and HUD under the UI while it
is on top) and `uiRevision` (bumped whenever `drawUi` would draw something else).

## The M1 flow (`createSceneFlow`)

`createSceneFlow(host, start)` creates the thirteen scenes (eight in M1, the difficulty menu and the
continue countdown since M2-01, the weapon select and its order editor since M2-03, the ship
select since M2-05), their menus,
the UI draw list (256 commands, 192 string slots — 160 before M2-05, 96 before M2-03) and the game scene's placeholder World once, then `reset`s the stack to
the start scene. `SceneFlowHost` is what the flow needs from the session: `config`, `content`,
`events`, `exit` (`platform.exit` or `null`), `createWorld(config?)` (since M2-01 with the chosen
difficulty's config) and, since M1-17, `save` (a `core/save`
`SaveStore` — a memory-only one when omitted) and `inputProfiles` (`{ choices, active }` for the
Options screen's CONTROLS — disabled when omitted). `createGame` passes `GameOptions.save` /
`inputProfiles` through.

| Scene | Overlay / dim / context | Shows | Input (any player) | Leads to |
|---|---|---|---|---|
| `BootScene` | no / 0 / menu | `LOADING` (or a label) and a progress bar (`setBootProgress`) | — | title on the tick after `finishBoot()` (`replace`) |
| `TitleScene` | no / 0 / menu | `ui/logo` (or `SHMUP CUP` as text), `PRESS OK` blinking (32-tick half period), then the menu 1 PLAYER / 2 PLAYERS / OPTIONS / EXIT at y 118 (M2-06 — 1 PLAYER was START); `HI` and the session hi-score (the save's best at start) at the bottom | OK: prompt → menu (locked 2 ticks, focus 1 PLAYER); 1 PLAYER / 2 PLAYERS → `choosePlayers` (every difficulty's config `withCoop`, M2-06), then the difficulty menu (M2-01; before, the game); OPTIONS → Options; EXIT → confirm; Back: confirm if the platform can exit, else menu → `PRESS OK` | difficulty, options, confirm (`push`) |
| `DifficultyScene` (M2-01) | yes / 0.5 / menu | Opaque panel, `DIFFICULTY`, EASY / NORMAL / HARD / ARCADE (focus on the preset chosen last, at first the host config's), the focused preset's `LIVES`, `CONTINUES` and `HI` | Up / Down move (wrap); OK chooses the preset; Back closes | ship select (`push`, M2-05; with a single ship in the content the weapon select — M2-03 — or, for a Direct-mode config, the game), title menu (`pop`) |
| `ShipSelectScene` (M2-05) | yes / 0.5 / menu | Opaque 208×136 panel, `SHIP SELECT`, the content's ships by name (KESTREL, MANTA; focus on the ship chosen last, at first the host config's `shipId`), the focused ship's picture (frame 0 of its sprite), its model (`POWER METER` / `DIRECT ITEMS`) and three hints, `OK: CHOOSE` | Up / Down move (wrap); OK chooses the ship (`withShip` for every difficulty's config); Back closes | weapon select (`push`, a meter ship), game (`reset`, a Direct-mode ship — no loadout to choose), difficulty menu (`pop`) |
| `WeaponSelectScene` (M2-03) | no / 0 / menu | Panel on the left: `WEAPON SELECT`, TYPE (`TYPE A` … `TYPE D`, `EDIT`), MISSILE / DOUBLE / LASER (the type's weapons, disabled unless EDIT), OPTION (M2-04: `TRAIL` / `SNAKE` / `FORMATION` / `ROTATE`), `? SLOT` (five shields since M2-04), `! SLOT`, AUTO, ORDER (one-letter summary), START, two hints; behind it, full screen, the live preview World (no HUD) | Up / Down move (disabled rows skipped); Left / Right / OK change a value; OK on ORDER → the editor; OK on START starts; Back closes. Opens focused on START (2-tick lock) | game (`reset` — its World on the difficulty's config with this loadout, `withArsenal`, and the chosen ship), order editor (`push`), ship select (`pop`; the difficulty menu when it was skipped) |
| `AutoOrderScene` (M2-03) | yes / 0.35 / menu | Panel on the right: `AUTO ORDER`, rows `1` … `12` (a meter slot or `-`), DONE | Up / Down move; Left / Right / OK step a row; DONE or Back store the rows and close | weapon select (`pop`) |
| `GameScene` | no / 0 / **game** | The World (view + HUD), the boss WARNING band in the UI list | Pause or Back of any player → pause menu (that tick the World does not step) — except, in a co-op game (M2-06), the START / OK of a player who may drop in: the World joins it ([coop.md](coop.md#joining-coreworld)) | pause, stage clear (90 World ticks after `stageClear`), game over (30 after `gameOver`) — or, with continues left (`canContinue`), the continue countdown (M2-01) — all `push` |
| `PauseScene` | yes / 0.5 / menu | Panel, `PAUSE`, RESUME / OPTIONS / RETRY STAGE / QUIT TO TITLE | Pause, Back, RESUME → resume; OPTIONS → Options (the game stays frozen); RETRY STAGE → `game.restart()` + pop (no confirmation); QUIT TO TITLE → confirm | game (`pop`), options, confirm (`push`) |
| `OptionsScene` (M1-17) | yes / 0.5 / menu | Opaque panel, `OPTIONS`, MASTER / MUSIC / SFX sliders (0–10), CONTROLS (the input profile's label, a `Choice`), BULLETS (M2-02: the enemy bullet palette, a `Choice` of `BULLET_PALETTE_LABELS`), M2-08: SCALE (a `Choice` of `SCALE_MODE_LABELS`), SHAKE (a `Toggle`), FLASHES (a `Choice` of `FLASH_LABELS`), HITBOX (a `Toggle`), M2-09: BOSS HP (a `Toggle`) — eleven rows on a 288×192 panel —, BACK | Up / Down move; Left / Right change a slider, step CONTROLS / BULLETS / SCALE / FLASHES (OK steps them too) or set SHAKE / HITBOX / BOSS HP (OK flips them), each change pushed live as a `UserOption` event; BACK or Back store the options in the save, flush it and close | title / pause menu (`pop`) |
| `StageClearScene` | yes / 0.25 / menu | `STAGE CLEAR`, `SCORE` (`1P` / `2P` once player 2 joined a co-op game, M2-06), `HI` for 240 ticks, then `TO BE CONTINUED` for 240 | OK skips a phase; entering it records the run in the save (M1's run ends here) | title (`reset`) |
| `ContinueScene` (M2-01) | yes / 0.35 / menu | Red-edged panel, `CONTINUE?`, the seconds left (9 … 0, a tick sound each), `CREDITS` = continues left (`1P` / `2P` credits once player 2 joined, M2-06); the music fades out | OK / Back after 30 ticks: OK continues (`continueWorld` — checkpoint restart, fresh lives; in a co-op game only the players whose OK was pressed, M2-06), Back gives up | game (`pop`), game over (`replace`, also after 600 ticks) |
| `GameOverScene` | yes / 0.35 / menu | Red-edged panel, `GAME OVER`, the final score (both players', `1P` / `2P`, once player 2 joined a co-op game — M2-06); `NEW HI-SCORE` below it for a new best (player 1's place) | OK / Back after 30 ticks; entering it records the run in the save | title (`reset`) after OK / Back or 600 ticks |
| `ConfirmDialog` | yes / 0.5 / menu | Opaque panel, `EXIT SHMUP CUP?` or `QUIT TO TITLE?`, YES / NO focused on **NO** | Left / Up → YES, Right / Down → NO; OK answers; Back = NO | `Exit`: pop, then `host.exit()`; `QuitToTitle`: title (`reset`); NO: pop |

OPTIONS is **enabled** in both menus since M1-17 and pushes the `OptionsScene` over them (the
title or the paused game stays drawn under it). The disabled-item rule — the focus skips the item,
OK on it is `Denied` — is now used by the Options screen's CONTROLS when the host offers no
profiles. EXIT exists only when `platform.exit` does (the TV, Electron later); in a browser the
title's Back only backs out of the menu to `PRESS OK`.

**Saves in the flow (M1-17).** The flow's session hi-score starts from the save's best score of the
game's mode (`SceneFlow.modeKey`) — since M2-01 one per difficulty preset (`meter-easy` …
`meter-arcade`), since M2-05 one per power-up mode and preset (the MANTA's `direct-easy` …
`direct-arcade`), the chosen ship's and preset's shown on the title and the difficulty menu; the game-over and stage-clear screens
insert every playing player's score into its World's table, count the statistic and flush the save; every game start and
RETRY STAGE counts `gamesStarted`; QUIT TO TITLE and RETRY record no score. Details, the Options
screen and the live `UserOption` events are in [saves-and-options.md](saves-and-options.md).

### Back, Pause and the platform

| Where | Back (remote ↩, Esc / Backspace, pad Back) | Pause (Play/Pause, P, pad Start) |
|---|---|---|
| Title, `PRESS OK` | exit confirmation (can exit) / nothing (browser) | — |
| Title menu | exit confirmation (can exit) / back to `PRESS OK` (browser) | — |
| Game | pause menu (the game table binds remote Back to `Pause`; `Action.Back` is checked too) | pause menu |
| Pause menu | resume | resume |
| Options screen | store the options, write the save if they changed, close (back to the title or the pause menu) | — |
| Confirm dialog | NO (close) | — |
| Difficulty menu (M2-01) | back to the title menu | — |
| Weapon select (M2-03) | back to the difficulty menu (the choice made so far is kept, but only START hands it to a game) | — |
| Auto order editor (M2-03) | store the rows (like DONE) and close | — |
| Continue countdown (M2-01) | give up → game over (after the 30-tick lock) | — |
| Game over | title (after the 30-tick lock) | — |
| Stage clear | — | — |

**Tizen.** `apps/tizen` no longer exits on Back by itself. Its `watchBackKey` watcher is installed
before boot — the loading and boot error screens are the root screen, so Back exits there — and
removed once `bootShell` resolved; from then on Back is an ordinary remote key and the stack
decides: game → pause, pause → resume, menus → back, **title → exit confirmation → YES →
`platform.exit()`** (NO or Back keep the app running). The e2e suite checks the last part with a
fake `window.tizen` whose `exit()` is recorded.

**Resume.** `createGame` forwards `platform.lifecycle.onResume` to `flow.onResume()`, which pushes
the pause menu (with the pause sound) only when the game scene is on top — returning from the TV's
home screen never drops the player back into a running game. The flow's own music keeps playing
under the pause menu; the World is frozen.

### Menus answer to any player

`flow.tick(input)` first merges every player's masks into `flow.menuInput` (`mergeMenuInput`:
the OR of `held` / `pressed` / `released`, player 1's device), and every menu scene reads that —
player 2's pad can drive the title and the pause menu. The game scene steps the World with the
unmerged snapshot. Since M2-06 the input adapter itself routes by **seats**: outside a co-op game
(and its continue countdown) every device drives player 1 anyway (`SceneFlow.inputSeats` = 1 —
[coop.md](coop.md#input-routing-shmupinput-web-shmupshell)); the game scene reads Pause / Back per
player, and the co-op continue countdown reads whose OK it was. Because a menu opens with a 2-tick activation lock and the adapters switch the
binding tables without phantom presses ([input-profiles.md](input-profiles.md)), an OK that started
the game is never read as a PowerUp, and a held button crossing a context change keeps only what
both tables give it.

## Worlds, events and the frame

The game scene **owns the World**: its `enter()` (a game start) and `restart()` (RETRY STAGE) call
`host.createWorld(flow.gameConfig)` — a new World from the chosen difficulty's config (M2-01;
since M2-03 with the weapon select's loadout applied by `withArsenal`, since M2-05 with the ship
select's ship applied by `withShip`; the
same config for every start on that preset, so the same inputs replay the same game;
the flow's lockstep test runs two flows through menus and retries and compares `hashWorld`), with
the session hi-score set on its scoring board. Creating a World is a scene transition, never part
of a tick's hot path. `exit()` and `restart()` first raise the session hi-score from the old
World's (`flow.hiScore`, also shown on the title; `setHiScore(value)` raises it from outside,
floored and capped at `MAX_SCORE` like the board's). Since M1-17 it starts from the save's best score
of the session's mode; since M2-01 each difficulty keeps its own (`FlowControl.bests`) and the old
World's best goes to its own preset's — since M2-05 per power-up mode too (`bests[mode × 4 +
preset]`, `FlowControl.bestIndex`).

Music follows the scenes through the same event queue: the title queues `Music Title` (30-tick
fade), a game start `Music Silence` (the new World then queues its stage theme, if it has a stage),
the stage-clear and game-over screens `StageClear` / `GameOver` (no fade; a boss's death already
started the stage-clear jingle and the music player does not restart a playing track). The continue
countdown (M2-01) fades the music out (`Silence`, 30 ticks); a continue (`continueWorld`) queues the
stage theme again.

`Game.renderFrame()` calls `flow.updateFrame()` and copies its `view`:

| Frame field | While the game scene is visible (on top or under overlays) | Otherwise (boot, title) |
|---|---|---|
| `world` | the World's view | `null` — or, while the weapon select is visible (also under its order editor), its preview World's view (M2-03) |
| `tick` | the **World's** tick — frozen under the pause menu and the end screens, back to 0 for a new World | the flow's own tick count (the preview's tick while it shows) |
| `hud` | the game scene's HUD list (`Hud.update` — rebuilt only on a change) | an empty list |
| `ui` | every visible scene's widgets (one list) | same |
| `screen.dim` | the top scene's `dim` | same |

The renderer steps its particles, popups and screen effects by the frame's tick delta, so they
freeze under the pause menu with the World, and a tick going back (a new World) clears them. The
shell also clears the particles and popups when `sceneView.worldChanges` moves.

### One UI list for the whole stack

The visible scenes are the topmost non-overlay scene and every overlay above it (the game under
the pause menu under the dialog). `updateFrame()` rebuilds the UI list — `clear()`, then each
visible scene's `drawUi(list)` bottom to top — **only when** the visible set changed or one of
their `uiRevision`s moved since the last build; otherwise the list keeps its `revision` and the
renderer skips it. Each scene owns a disjoint range of the 192 string slots (160 before M2-05, 96 before M2-03; `stringBase`,
`stringSlots`, assigned in the flow's constructor — it throws if they do not fit), so scenes drawn
together never overwrite each other's text. That is why the confirm dialog sits over the still
visible pause menu; its panel is opaque (alpha 255) so the menu's text does not show through.

The boss **WARNING band** moved from the shell's flight scene into `GameScene.drawUi` (same look:
a black band at alpha 144 across screen rows 76–123, 1-px red edges, the World's WARNING text
centred at row 85, red and yellow alternating every 16 World ticks). The scene bumps its
`uiRevision` only when the look (off / red / yellow) changes.

## The UI kit (`core/ui`)

Widgets are plain state objects the scenes own; they know nothing about scenes, sounds or the
stack. They answer with a number (`MenuResult`) instead of callbacks and draw through string
slots, so a menu can be ticked and redrawn every frame without allocating.

### Widgets

- **`ListMenu`** (`createListMenu(items, { focus, disabledMask, wrap })`, 1–31 items): `items`
  are actions (a label), `Slider`s (`{ label, slider }`), `Toggle`s (`{ label, toggle }`) or
  `Choice`s (`{ label, choice }`, M1-17);
  `focus`; `disabledMask` (bit `i` = item `i` disabled); `wrap` (default on); `lockTicks`,
  `confirmBuffer`, `repeat` (a `DirectionRepeat`) and `revision`. `setDisabled(i, on)` passes the
  focus on when it disables the focused item; `open(lockTicks)` clears the transient input state
  (call it when a menu appears).
- **`Slider`** (`createSlider(min, max, step, value)` — the volumes 0–10 of M1-17): Left / Right
  change it by `step`, clamped. **`Toggle`**: Left = off, Right = on, OK flips it.
- **`Choice`** (`createChoice(labels, index)`, 1–255 labels — the Options screen's CONTROLS, M1-17, BULLETS, M2-02, and SCALE and FLASHES, M2-08):
  one of several labels; Left / Right step through them and **wrap**, OK steps forward; a single
  label never changes. A class, so its `index` stays a small integer.
- **`Confirm`** (`createConfirm(question)`): YES / NO, focused on **NO** whenever it opens, so a
  stray OK never confirms something destructive.

### `menuTick(menu, input)` in order

1. A Confirm press (re)fills the confirm buffer (`MENU_CONFIRM_BUFFER_TICKS` = 4).
2. Back wins → `Back` (the buffer is cleared).
3. While `lockTicks > 0` activation waits: the lock and the buffer count down (a press older than
   the buffer is dropped) — **the focus still moves and Back still answers**. Otherwise a buffered
   Confirm activates: a disabled item → `Denied`, a toggle → flips, `Changed`, a choice of two or
   more labels → steps forward, `Changed`, anything else → `Confirmed` (read `menu.focus`).
4. The auto-repeated direction (also while locked): Up / Down move over the enabled items (wrapping
   when `wrap`) → `Moved`; Left / Right change the focused slider, toggle or choice → `Changed`.

So a menu that just opened (the flow locks its menus for 2 ticks) holds back activation, and an OK
pressed during the lock fires when the lock ends if it is at most 3 ticks old. `confirmTick` does
the same for the prompt: Left / Up → YES, Right / Down → NO (no wrap), a buffered Confirm →
`Confirmed` (read `focus`), Back → `Back`.

**Held-duration auto-repeat** (`repeatDirections`): a newly pressed direction acts at once; the
held one again after `MENU_REPEAT_DELAY` = 18 ticks, then every `MENU_REPEAT_INTERVAL` = 6 ticks
(ticks 0, 18, 24, 30, …). Only the direction pressed last repeats (several pressed on one tick: the
lowest bit — Up, Down, Left, Right); releasing it stops the repeat. A tap latched between two
polls (pressed but no longer held) acts once. This is independent of any device key repeat — the
adapters drop those.

**Sounds.** `menuResultSfx(result)` maps `Moved` / `Changed` → `MenuMove`, `Confirmed` →
`MenuSelect`, `Back` **and** `Denied` → `MenuBack` (a refusal sounds like backing out — all menu
cues play on the unpanned UI bus, unlike the positional `PowerUpDenied`). The flow pushes them as
`Sfx` events at x 0, plus `PauseToggle` when the pause menu opens or closes.

### Builders

| Builder | Draws | String slots |
|---|---|---|
| `drawPanel(list, x, y, w, h, fill?, border?, alpha = 232)` | a filled box and a 1-px border (5 rects) | — |
| `drawMenu(list, menu, stringBase, layout)` | per item: the label (focused: `UI_COLORS.focus` and the `→` cursor at `cursorX`; disabled: dimmed), a slider's 50-px bar and value, a toggle's `ON` / `OFF`, a choice's current label at `valueX`; returns the y below the last row | `menuStringSlots(menu)` = items + 3 (`ON`, `OFF`, cursor) + one per choice item (its label, M1-17) |
| `drawConfirm(list, confirm, stringBase, cx, cy)` | a 176×52 opaque panel centred at `(cx, cy)`, the question (up to two lines), YES / NO with the cursor | `CONFIRM_STRING_SLOTS` = 4 |

Builders write a string slot only when its text changed (`setString` compares), so redrawing is
cheap. **A `MenuLayout` must be a constant** — the flow's are `Object.freeze`d module constants:
an object literal written at the call site allocates on every redraw.

## The HUD

```text
 x: 8    24             156  172            292  308
    1P   00012300           HI   00050000       2P   ------            ← top bar, y 0 (8 px)
 ...................................  playfield 384×200  ..................................
    ▲ ▲ ▲   [SPEED][MISSILE][DOUBLE][LASER][OPTION][ ? ][ ! ]  ■■■■□   ← bottom bar, y 208
 x: 4 (10 px apart)  58 + 40·slot (7 slots)                    344 (7 px apart)
```

`buildHud(world, list, sprites)` clears the list and draws: both bars (`HUD_COLORS.bar`, the
lifted navy of the VA panels); `1P`, `HI`, `2P` with 8-digit numbers 16 px after each label (the
`number` op — no strings), `------` in grey while player 2 is not playing (in a co-op game a
blinking `PRESS START` while it may join — M2-06); player 1's `lives − 1`
stock icons (`hud/life`; more than 5 show one icon and the count); the seven meter slots
(`hud/meter-slot`: frame 1 for the highlighted slot on the "on" half of its 8-tick flash
(`HUD_METER_FLASH_TICKS`), frame 2 for a slot `world.powerups.equippable(0)` excludes, frame 0
otherwise) with the slot's `hud/meter-labels` frame tinted white or grey; and, while the Force
Field is up, one pip per hit it can take (at most 5), cyan for the hits left. The labels are the
atlas's (`SPEED MISSILE DOUBLE LASER OPTION ? !`), not the plan's abbreviations; since M2-03
`meterLabelFrame(world, slot)` names the MISSILE / DOUBLE / LASER boxes after the session's
weapons (`SPREAD`, `TAIL`, `RIPPLE` for Type B, `2-WAY`, `VERTICAL`, `CYCLONE` for Type C,
`TORPEDO`, `FREE WAY`, `TWIN` for Type D — 16 frames in `METER_LABEL_FRAMES`); `?` and `!` keep
their symbols. Without the UI
sprites (a content table that lacks them, `EMPTY_CONTENT_DB`) icons and slots become rectangles and
the labels are left out. The worst case is 32 commands; the game scene's HUD list has
`HUD_COMMAND_COUNT` (100 since M2-09; 96 in M2-06) commands and `HUD_STRING_COUNT` (23 since
M2-09; 22 in M2-06) strings.

**The boss HP bar (M2-09).** `buildHud(world, list, sprites, bossHp)`: with `bossHp` (the
`bossHpBar` display option) and while `world.bosses.hpBar.visible` — a boss is flying in, fighting,
escaping or dying before its blast — the middle of the top bar shows `BOSS` in red (string slot
22) at x 148 and a 4-px frame (`HUD_COLORS.bossFrame`) `BOSS_HP_BAR_WIDTH` (64) px wide at x 176
with a 2-px red fill (`bossFill`) of `bossHpBarFill(bar, 62)` pixels, **instead of** `HI` and the
hi-score; when the bar goes, `HI` comes back. The fill is `⌈hp × width / maxHp⌉` (at least 1 px
while any hit point is left, full only at full strength — it fills up during the intro).

```text
 x: 8    24          148   176                  292  308
    1P   00012300    BOSS  [██████████▒▒▒▒▒▒]   2P   ------            ← top bar during a boss
```

`Hud.showBossHp` is the flag `update` passes on; the scene flow sets it from
`save.options.display.bossHpBar` on every displayed frame (so the HUD follows the **saved** value —
the Options screen's live `BossHpBar` event has no consumer), and `update` rebuilds only when the
fill's pixel count changes. The bar's model (which bosses and parts count) is `core/bosses`
`BossHpBar` — [advanced-bosses.md](advanced-bosses.md#the-boss-hp-bar).

**Direct mode (M2-05).** With `powerUpMode: 'direct'` the bottom bar shows the **tier pips**
instead of the meter and the Force Field pips:

```text
    ▲ ▲ ▲   SHOT ▪▪▪▪▪▫▫▫  SUB ▪▪▪▫▫▫▫▫  ARM ▪▪▫  SPD ▪▪▫  DISC      ← bottom bar, y 208
 x: 4       58 (+26, 5 px) 130 (+20)      196 (+20, 6 px) 252   306
```

`SHOT` has one 4×4 pip per level above 0 of the current main family (8 for its 9 levels), the
lit ones in the family's `HUD_FAMILY_COLORS` colour (Beam → Disc orange, Laser → Wave blue);
`SUB` the same for the sub-weapon (green); `ARM` one pip per hit the Arm can take, the hits left
in its tier's `HUD_ARM_COLORS` colour (green, silver, gold; nothing without an Arm); `SPD` one
pip per speed, the current level and those below lit; then the family's `label` (`DISC`,
`WAVE`). The labels use string slots 4–8 (`HUD_STRING_SLOTS.shot` … `family`); meter HUDs still
use 0–3 only ([direct-mode.md](direct-mode.md#the-hud-coreui)).

**Co-op (M2-06).** While **both** ships are active the bottom bar splits into two 192-px halves
(player 1 left, player 2 right — its stock icon `hud/life@p2`): each with the stock icon and count,
the seven meter slots as 20-px boxes with two-letter labels (`METER_SHORT_LABELS`) and the shield
pips — or the compact Direct pips `SH` / `SB` / `AR` / `SP`; an out player's half shows
`PRESS START` (it may continue) or `GAME OVER`. `hudPlayerState(world, slot)` decides what a player
shows; the co-op strings (slots 9–21) are written only when drawn, so one-player lists with 4 string
slots still work ([coop.md](coop.md#the-hud-coreui)).

`buildHud` **clears the scores' `displayDirty` and the board's `hiScoreDirty`**. `Hud.update(world,
list)` is the change detection around it: it rebuilds only when a dirty flag is set, a
player's HUD state, whether it plays, its lives, meter cursor, equippable mask, shield hits / max /
tier or — since M2-05 — its shot / sub levels, family or speed level changed (both players since
M2-06, kept in two typed arrays), the flash phase (only while a slot is highlighted) or the
`PRESS START` blink (only while a prompt shows) or — since M2-09, with `showBossHp` — the boss HP
bar's fill in pixels moved — or the World or list is another object
(`invalidate()` forces it; the game scene calls it on every new World). `builds` counts rebuilds
for tests and debug overlays. It runs once per **displayed frame** (from `updateFrame`), never per
tick.

## Sprites and the logo

`UI_SPRITES` (`hud/life`, `hud/meter-slot`, `hud/meter-labels`, `ui/logo`) joined the core's
`ENGINE_SPRITES`, so every host interns them with the content (`loadGameContent` passes
`ENGINE_SPRITES` as `extraSprites` by default) and `pnpm content:check` verifies them against the
atlas. `resolveUiSprites(content)` looks their ids up once (`-1` when missing).

`ui/logo` is a new procedural sprite (`scripts/assets/procedural/ui.mjs`): `SHMUP CUP` in
original 5×7 block letters drawn ×3 (`LOGO_SCALE`), a vertical yellow → orange → red gradient with
a one-pixel highlight on each letter row, a dark outline and a 2-px drop shadow — 165×27, anchored
at its centre. With it the atlas page grew to 512×512.

## The shell side

The shell's `ShellScene` gained `'game'` — the scene flow — **as the default** (`?scene=` missing
or unknown). `bootShell` creates the game with `{ scenes: 'boot' }` (since M1-17 also with the save
it read and the app's profile choices —
[saves-and-options.md](saves-and-options.md#the-shells-side)), prepares the title theme with
the stage's music set (and the stage-clear / game-over jingles in open space, where the stage names
none), and calls `game.scenes.finishBoot()` once its loading phase is over — so the boot scene is
only up for the first tick; the loading before the renderer exists stays on the 2D overlay bar.

`createSceneView(game)` (module `scene-view`) turns the flow's frame into what the renderer draws:

- **Outside the game** (boot, title — `frame.world === null`) a starfield **backdrop** (its own
  static camera, pre-bound at load) drifts behind the title with the flow's tick.
- **In a game in open space** a wrapper `WorldView` — two starfield batches, then the World's
  batches, on the World's camera with its terrain / laser / WARNING views — built **once per
  World** (a new object, bound by the renderer on its first frame). A stage's own view (it has
  parallax bands) is used as is. Since M2-03 "the World" is whichever World view the frame shows —
  the game's or the weapon select's preview (on the weapon range, a stage: used as is) — so opening
  the weapon select counts as a new World too.
- `camera` follows the World on screen (`follow()` after the ticks, before the drain — the audio
  pans against it); `worldChanges` counts new Worlds (the shell then clears particles and popups).
- `spriteNames` = the content's names, then `SCENE_VIEW_SPRITES` (the three star tiles).

The canvas carries `data-shmup-scene` (`SCENE_ATTRIBUTE`): the top scene's id (`boot`, `title`,
`difficulty`, `weaponSelect`, `autoOrder`, `game`, `pause`, `options`, `confirm`, `stageClear`,
`gameOver`, …) or the dev scene's name — the e2e tests wait
on it. `?scene=flight` keeps the old bare-gameplay free flight with its own dev HUD (`FREE
FLIGHT`, `ARROWS MOVE`, `GAME OVER` in the top bar); the gameplay e2e specs of M1-06…M1-15 open it.

## Determinism

The flow never changes simulated state except by creating Worlds: menus, timers and the stack are
presentation-side session state, not hashed, not in replays. A World created by the flow is the
same as one created by bare gameplay from the same config — `game.world` hashes identically for the
same inputs, and two flows fed the same snapshots through menus, pauses and retries stay in
lockstep (`scenes-flow.test.ts`, `scenes-flow-edge.test.ts`). The session hi-score is not hashed (as before),
and neither is anything the save holds: the options are presentation, the tables and stats live
outside the World.

## Zero allocation and the hot-path rules

- Every scene, menu, draw list and the HUD is created with the flow; `tick`, `updateFrame`,
  `menuTick`, `confirmTick`, the builders and `Hud.update` never allocate. The allocation guards
  drive the flow through a whole game (`scenes-alloc.test.ts`), the title and the exit confirmation
  for 20,000 ticks with a frame composed every tick (`scenes-menu-alloc.test.ts`), and the widgets
  and HUD (`ui-alloc.test.ts`).
- Widgets and the HUD are **classes** (`ListMenu`, `Confirm`, `DirectionRepeat`, `Hud`) so their
  counters stay small integers on one hidden class.
- Layouts for `drawMenu` are frozen module constants (a literal per redraw allocates).
- Text is `setString` into the scene's own slots only when it changes; numbers are `number`
  commands.
- The only allocation in the flow is `host.createWorld()` on a game start or RETRY — a scene
  transition — and since M2-03 the weapon select's preview World (created when the screen opens;
  its range's spawns create their behaviour coroutines, D29) and its START (the loadout and the
  armed configs), plus, in the shell, one wrapper view per open-space World. Since M1-17 also the
  save's new document when the Options screen closes or a game ends (menu actions, never ticks);
  the Options screen itself ticks and redraws allocation-free (`scenes-options-alloc.test.ts`).

## Extending it

| To add… | Do this |
|---|---|
| A new scene (the M2 screens; `OptionsScene` is the latest example) | A `SceneBase` subclass in `core/scenes` with its `id` (already in `SceneId` for the planned screens), `overlay` / `dim` / `inputContext`, `stringSlots`, `tick` (read `flow.menuInput`; request transitions on `flow.stack`) and `drawUi` (only its own string slots); create it in `createSceneFlow`, add it to the `scenes` array (the string-slot assignment) and to `SceneFlow`; bump `uiRevision` whenever its look changes |
| An Options item, a saved option | See [saves-and-options.md](saves-and-options.md#extending-it) |
| A menu with sliders, toggles or choices | `createListMenu([{ label: 'MUSIC', slider: createSlider(0, 10, 1, 7) }, { label: 'CONTROLS', choice: createChoice(['A', 'B']) }, …])`; `menuTick` returns `Changed` — read the item's `slider.value` / `toggle.value` / `choice.index`; give `drawMenu` a frozen layout with a `valueX`, and count `menuStringSlots(menu)` for the scene's slots (one per choice more) |
| A HUD element | Draw it in `buildHud` (keep within the HUD list's 64 commands) and add what it depends on to `Hud.update`'s comparison, or it will not redraw |
| A UI sprite | Add its name to `UI_SPRITES` and a field to `UiSprites` / `resolveUiSprites`; the atlas must have it (`pnpm content:check`) — draw a fallback for id `-1` |
| A new widget kind | A class with its own state and a `…Tick(widget, input) → MenuResult` function using `repeatDirections` and the same buffer / lock rules, plus a builder writing through string slots |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/ui/ui.test.ts`, `ui-edge.test.ts` | Navigation, wrap (also across disabled ends), disabled items and `Denied`, repeat timing over long holds / chords / latched taps, the Confirm buffer vs Back, a disabled item and a same-tick direction, lock lengths 1–4, sliders (overshoot, fractional steps, one-value ranges, NaN) and toggles, the YES / NO prompt, builder defaults, geometry, slot reuse and overflow |
| `packages/core/test/ui/ui-hud.test.ts`, `ui-hud-edge.test.ts` | The exact meter commands, the flash, greyed slots, pips, stock boundaries (0, 5, > 5) with and without sprites, partial sprites, player 2, change detection, the worst case within 64 commands, labels written once, big scores |
| `packages/core/test/ui/ui-alloc.test.ts` | Widgets, builders and the HUD without allocation |
| `packages/core/test/ui/ui-boss-hp.test.ts`, `ui-boss-hp-edge.test.ts` | M2-09: `bossHpBarFill` (whole pixels, ≥ 1 px while anything is left, full only at full strength; unusable, infinite and fractional values), `BOSS` and the bar in place of the hi-score only with the option and while a boss counts, rebuilds only when the fill's pixels or the option change; the e2e check is in `test/e2e/advanced-bosses.spec.ts` |
| `packages/core/test/scenes/scenes.test.ts`, `scenes-edge.test.ts` | Stack semantics, hook order, deferred vs immediate transitions, mid-tick self pop / pop + push / reset, exactly 8 queued, the runaway guard, transitions from hooks, a full stack, a throwing tick or hook, `mergeMenuInput` |
| `packages/core/test/scenes/scenes-flow.test.ts`, `scenes-flow-edge.test.ts` | The headless run title → game → pause → quit → title from snapshot inputs; exit only after YES on a fake platform; resume → pause on every scene; retry; end screens and their delays (frozen while paused, reset by RETRY); the WARNING band; the dialog's sounds; the game-over lock boundary; the stage-clear tally; the session hi-score; the frame on every screen; player 2 driving menus; lockstep across menus and retries |
| `packages/core/test/scenes/scenes-alloc.test.ts`, `scenes-menu-alloc.test.ts` | A whole game and 20,000 menu ticks without allocation |
| `packages/core/test/ui/ui-choice.test.ts`, `ui-choice-edge.test.ts` | The `Choice` widget (M1-17): label limits, clamping, wrap and repeat, Confirm stepping, disabled, the label's string slot |
| `packages/core/test/scenes/scenes-options.test.ts`, `scenes-options-edge.test.ts`, `scenes-options-alloc.test.ts` | The Options screen from the title and the pause menu, live `UserOption` events, saving on BACK / Back, hi-scores recorded on the end screens and `NEW HI-SCORE`, the hi-score persisting across game instances, allocation-free ticking (M1-17 — [saves-and-options.md](saves-and-options.md#tests)) |
| `packages/core/test/scenes/scenes-weapon-select.test.ts`, `-edge`, `-alloc` | M2-03: the weapon select (flow, TYPE / EDIT / locked rows, `?` / `!` / AUTO / ORDER into the config, Back, RETRY keeping the loadout, the live preview, no weapons / no range) and the order editor; allocation-free with the preview flying — [meter-arsenal.md](meter-arsenal.md#tests) |
| `packages/core/test/scenes/scenes-continue.test.ts`, `scenes-continue-edge.test.ts`, `scenes-continue-alloc.test.ts` | M2-01: the difficulty menu (order, wrap, sounds, Back, the World's preset, per-preset hi-scores) and the continue countdown (timing, lock, held OK, timeout, resume, the recorded score) — [difficulty-and-rank.md](difficulty-and-rank.md#tests) |
| `packages/core/test/scenes/scenes-coop.test.ts`, `scenes-coop-edge.test.ts`, `packages/core/test/ui/ui-hud-coop*.test.ts` | M2-06: 2 PLAYERS vs 1 PLAYER, the seats per scene, joining without pausing, the per-player continue countdown, both scores and `2p` rows on the end screens; the co-op HUD (the prompt, both halves, `hudPlayerState`, allocation) — see [coop.md](coop.md#tests) |
| `packages/core/test/game/game-scenes.test.ts`, `game-scenes-edge.test.ts` | `GameOptions.scenes`, `game.world` / `inputContext` across transitions, EXIT only with `platform.exit`, the dim cleared on resume, bare gameplay ignoring a game over |
| `packages/shell/test/boot/`, `scene-view/` | The flow's boot (title theme prepared, `finishBoot`, `data-shmup-scene`), the scene view (backdrop drift per layer, open-space starfield frozen under pause, the followed camera before a frame and after quitting, `worldChanges`; since M2-03 the weapon select's preview view — `scene-view-preview.test.ts`) |
| `apps/*/test/boot/boot-wiring.test.ts` | Title start and Back through the stack (Tizen: the exit confirmation, `exit` only after YES; a direct exit only from the boot error screen) |
| `test/e2e/scenes.spec.ts`, `boot.spec.ts`, `options.spec.ts` (M1-17: the Options screen and the save, both builds), `weapon-select.spec.ts` (M2-03) | Web: Enter starts the game from the title (past `PRESS OK`, START, then OK on the difficulty menu since M2-01 and OK on the weapon select's START since M2-03), Esc pauses (dimmed, frozen) and resumes, Back on the title only backs out; Tizen from disk: OK starts, Back (10009) pauses and resumes, with a fake `window.tizen` Back on the title opens the confirmation and `exit()` runs only after YES; both builds boot to the title (logo, no ship), `?scene=flight` to free flight |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| START does not start a game | Since M2-01 it opens the difficulty menu, and since M2-03 its OK opens the weapon select (focused on START) — two more OKs start. From `PRESS OK` a game takes four OKs |
| A game's weapons are not the host config's | The weapon select's START applied its loadout (`SceneFlow.arsenal`, `withArsenal`) to every difficulty's config for the rest of the session — read `game.world.config` |
| A game's World has another `difficulty` than `game.config` | The difficulty menu: the World runs `withDifficulty(host config, chosen)` — read `game.world.config` |
| A test or tool that keeps `game.world` sees a frozen game after START or RETRY | With the flow, every start creates a new World — read `game.world` again (or use bare gameplay: no `options.scenes`) |
| Events already in `host.events` when `createSceneFlow` ran are gone | The flow clears the queue after creating its placeholder World (to drop the stage theme it queued) — create the flow before pushing anything |
| `.at(` fails the lint on the stack | Use `sceneAt(i)` — the Chrome-69 rule rejects every `.at(` call |
| A scene's text shows another scene's words | It wrote outside its own string-slot range — use `this.stringBase + k` for `k < stringSlots`, and declare enough `stringSlots` |
| A menu change does not show | The scene did not bump its `uiRevision` (compare the widget's `revision` before and after `menuTick`, as the flow's scenes do) |
| The menu allocates every frame | A `MenuLayout` literal at the `drawMenu` call — make it a frozen constant |
| OK on the title does nothing the first time | Expected: the first OK only leaves `PRESS OK`; the menu then locks activation for 2 ticks (an OK in that window is buffered, not lost) |
| Back on the title does nothing in a browser | Expected on `PRESS OK`; in the menu it goes back to `PRESS OK`. The exit confirmation needs `platform.exit` (the TV) |
| OK on an Options slider does nothing | Expected: sliders change with Left / Right; OK is silent on them (it steps CONTROLS and activates BACK) |
| A new scene throws `RangeError` about string slots at flow creation | The scenes together need more than the UI list's 160 string slots (96 before M2-03) — a choice item takes one slot more than `items + 3` |
| The renderer shows a World while no game runs | The weapon select's live preview (M2-03) — `SceneFlowView.world` is its view while that screen is visible |
| The HUD never updates | Something else clears the scores' dirty flags (another HUD over the same World), or the new state is not in `Hud.update`'s comparison |
| The HUD shows rectangles instead of the meter boxes | The content was loaded without `ENGINE_SPRITES` (the UI sprites are in it since M1-16) or the atlas lacks them |
| Explosions of the last game show after RETRY | The host did not clear its particles on a new World — watch `sceneView.worldChanges` (the shell does) |
| The TV app exits on Back during play | An old build: since M1-16 the Back watcher is removed once the shell runs |

## Next steps that build on this page

- **M1-17** (done) — the Options scene (MASTER / MUSIC / SFX sliders, the controls profile, BACK
  saves), OPTIONS enabled in the title and pause menus, the `Choice` widget, the saved hi-scores
  ([saves-and-options.md](saves-and-options.md)).
- **M1-18** (done) — the apps hand the flow zone A as `GameConfig.stage` (`@shmup/shell`
  `defaultStageId`), so START and RETRY STAGE play AZURE VERGE on every build; with the web app's
  `?skip=boss` (`GameConfig.stageSkip`) every new World starts just before HALCYON BULWARK
  ([zone-a-and-playtest.md](zone-a-and-playtest.md)).
- **M1-19** (done) — debug controls on top of the flow (the stage jumps act only while the game
  scene is on top; frame advance freezes the menus too), `window.__shmupDebug.sceneId` for the
  smoke test; replays cover bare gameplay — recording the flow comes with attract mode (M2-15)
  ([debug-and-replays.md](debug-and-replays.md)).
- **M2-01** (done) — the difficulty menu under START (a config and a session hi-score per
  preset), the continue countdown between the game and the game-over screen
  ([difficulty-and-rank.md](difficulty-and-rank.md)).
- **M2-03** (done) — the weapon select after the difficulty menu (TYPE A–D / EDIT, `?`, `!`, AUTO,
  ORDER, START) with a live preview World and the Auto Power-Up order editor; the HUD meter names
  its MISSILE / DOUBLE / LASER boxes after the arsenal ([meter-arsenal.md](meter-arsenal.md)).
- **M2-04** (done) — the weapon select's OPTION row (`WeaponSelectItem.Option` 4, so `?` … START
  moved to 5–9) and the five `?` labels; the preview flies the chosen Option type and spreads it
  while OPTION is focused ([options-shields-hunter.md](options-shields-hunter.md#the-weapon-select-corescenes)).
- **M2-05** (done) — the ship select between the difficulty menu and the weapon select (skipped
  with a single ship; a Direct-mode ship starts the game at once), per-mode session hi-scores, the
  HUD's tier pips, 192 UI string slots ([direct-mode.md](direct-mode.md#the-ship-select-corescenes)).
- **M2-06** (done) — `1 PLAYER` / `2 PLAYERS` on the title (`TitleItem` Options 2, Exit 3), the
  co-op game scene (a joinable player's START joins instead of pausing), the per-player continue
  countdown, both scores on the end screens with `2p` hi-score rows, `inputSeats`, the co-op HUD
  halves ([coop.md](coop.md)).
- **M2-09** (done) — the boss HP bar in the top HUD bar (`bossHpBarFill`, `Hud.showBossHp`,
  `HUD_STRING_COUNT` 23, `HUD_COMMAND_COUNT` 100) behind the display option BOSS HP
  (`OptionsItem.BossHp` 9, BACK 10, the panel 288×192) ([advanced-bosses.md](advanced-bosses.md#the-boss-hp-bar)).
- **M2-10 / M2-15** — the zone map, attract mode, mode select, name
  entry, the hi-score table; **M2-16** — rebinding and accessibility options (and the loadout
  saved).
