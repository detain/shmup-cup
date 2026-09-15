/**
 * # scenes — scene stack / game state machine
 *
 * **Responsibility.** The scene stack that sequences the game (shmup_feat.md §17 "scene flow"):
 * **Boot → Title → Game ⇄ Pause → Stage clear / Game over → Title** in M1, with the pause menu, the
 * confirm dialog, the stage-clear and game-over screens as **overlays** (the scene below keeps
 * being drawn, frozen). Scenes read the same action snapshot as gameplay, so the remote, a gamepad
 * and the keyboard all drive the menus; each scene declares the binding context it wants
 * ({@link Scene.inputContext}, decision D15 — `'game'` while playing, `'menu'` everywhere else).
 *
 * - **{@link SceneStack}** — up to {@link SCENE_STACK_DEPTH} (8) scenes; only the top one ticks.
 *   `push` / `pop` / `replace` / `reset` requested **while a scene ticks are deferred to the end of
 *   that tick** (in request order), so a scene never runs half a tick after it left; requested
 *   outside a tick (a platform resume) they apply at once. Lifecycle hooks: `enter` (pushed or
 *   replaced in), `exit` (popped, replaced or reset out), `cover` / `uncover` (a scene was pushed
 *   on top / the one on top was popped).
 * - **{@link SceneFlow}** — the M1 scene set and its rules, built by {@link createSceneFlow}:
 *   - {@link BootScene}: a progress bar until the host calls {@link SceneFlow.finishBoot}; then the
 *     title.
 *   - {@link TitleScene}: the logo, a blinking `PRESS OK`, then the **mode select** (M2-15) 1
 *     PLAYER / 2 PLAYERS / PRACTICE / OPTIONS / SOUND TEST / EXIT — EXIT only when the platform can
 *     quit (`platform.exit`); 2 PLAYERS (M2-06) makes the next games co-op ones (`core/config`
 *     `withCoop` — player 2 drops in with START). Shows the saved hi-score, plays the title music;
 *     left alone on `PRESS OK` it hands over to the attract loop (below).
 *   - {@link DifficultyScene} (overlay, M2-01 — START): EASY / NORMAL / HARD / ARCADE with the
 *     focused preset's lives, continues and hi-score; OK chooses that preset (its World gets
 *     `core/config` `withDifficulty` of the host config — {@link SceneFlow.gameConfig}) and opens
 *     the ship select (skipped with a single ship in the content), Back returns to the title menu.
 *   - {@link ShipSelectScene} (overlay, M2-05 — after the difficulty menu): the content's ships
 *     (KESTREL — the power meter —, MANTA — Direct mode) with the focused one's picture, power-up
 *     model and hints; OK chooses it (`core/config` `withShip`: `shipId` and `powerUpMode` for
 *     every difficulty's config) and opens the weapon select for a meter ship or starts the game
 *     for a Direct-mode one; Back returns to the difficulty menu.
 *   - {@link WeaponSelectScene} (M2-03 — after the difficulty menu): TYPE A–D or EDIT (Weapon
 *     Edit: each of the MISSILE / DOUBLE / LASER weapons), the Option type (M2-04), the `?` and
 *     `!` choices, Auto Power-Up and its ORDER ({@link AutoOrderScene}, an overlay editor), START —
 *     with a live preview (a mini World on the weapon range, drawn full screen behind the panel);
 *     START starts the game with that loadout (`core/config` `withArsenal`), Back returns to the
 *     ship select.
 *   - {@link GameScene}: **owns the World** — every start (and RETRY STAGE) creates a fresh one;
 *     ticks it with the snapshot; Pause (remote Play/Pause, Back — bound to Pause in the game
 *     context) opens the pause menu — except the START of a co-op player who may drop in, which is
 *     its join (M2-06); `stageClear` / `gameOver` open their screens after a short delay; draws the
 *     HUD (`core/ui` {@link Hud}) and the boss WARNING band.
 *   - {@link PauseScene} (overlay): RESUME / OPTIONS / RETRY STAGE / QUIT TO TITLE — the last one
 *     through the {@link ConfirmDialog}; Pause or Back resumes.
 *   - {@link OptionsScene} (overlay, M1-17 — from the title and the pause menu): MASTER / MUSIC /
 *     SFX sliders (levels 0–10, applied **live** through `UserOption` events the host turns into
 *     bus volumes), CONTROLS — the keyboard / remote input profile, shown by its label (applied
 *     live the same way) — and BACK, which (like the Back button) stores the options in the save
 *     and writes it when something changed (shmup_feat.md §21).
 *   - {@link StageClearScene} (overlay): the tally (score, hi-score), then `TO BE CONTINUED` (M1
 *     has one zone), then the title; OK skips ahead.
 *   - {@link ContinueScene} (overlay, M2-01): a game over with continues left counts down 10 s;
 *     OK continues at the last checkpoint (`core/world` `continueWorld`), Back or the timeout →
 *     the game-over screen.
 *   - {@link GameOverScene} (overlay): OK (after a short lock) or 10 s → title.
 *
 *   **Campaign runs (M2-10).** When the host config's stage is the start zone of the content's
 *   campaign (`ContentDb.campaign` — the shipped game), a game is a **run** across the zone map
 *   ({@link SceneFlow.run}, `./run.ts` {@link RunState}): every zone is a fresh World built from
 *   the run state (`runWorldConfig` / `prepareRunWorld`: the zone's stage, the rank's stage term,
 *   the players carried in — score, lives, loadout, meter cursor, shield). The game scene shows the
 *   zone's title card (`ZONE B` / its name, {@link ZONE_CARD_TICKS}) during the launch fly-in; after
 *   the boss (the ships fly out — `core/player` `flyOutPlayer`) the stage-clear screen is the
 *   **zone result tally** (kill rate and boss time bonus, paid, the players carried out), then:
 *   - {@link MapScene}: the node graph of the campaign, Up / Down choose one of the cleared zone's
 *     exits, OK launches (`SimEventKind.PrepareStage` — the host prepares the next zone's music
 *     meanwhile), Back asks "quit to title?";
 *   - the host's music set follows the stage about to play: the title prepares the next run's
 *     start stage again (a run that went through the map left the last zone's set resident), a
 *     run start and a practice start prepare their own stage — each `PrepareStage` only when the
 *     stage differs from the one last prepared (the host config's stage at boot);
 *   - {@link EndingScene} after the final zone: the ending `core/data` `selectCampaignEnding`
 *     picked from the final zone and the run's flags (no death, no continue, a bonus stage
 *     cleared, a boss escaped), the route and the score — the run is recorded then. Since M2-14
 *     it plays the ending's sprite scene (the citadel falling, the ship rising out of the deep —
 *     a dawn for a flawless run, the flagship sailing off when a boss escaped) and its epilogue,
 *     then the result card, then {@link CreditsScene}: the campaign's credits scrolling up to the
 *     ending and credits themes.
 *
 *   **Hidden bonus stages (M2-10).** A World's opened bonus entrance (`core/stage`
 *   `BonusEntrances`) flies the players into the bonus stage after {@link BONUS_WARP_TICKS} (the
 *   game scene swaps its World, carrying the players); a death there brings them back to the
 *   entrance after {@link BONUS_FAIL_TICKS}, the zone's entrances locked; clearing it counts as the
 *   zone's clear (the boss is skipped) — `BONUS STAGE CLEAR` in the tally. Single-stage runs have
 *   bonus stages too (their clear is the M1 stage clear).
 *
 *   **Practice (M2-10 plumbing, M2-15 select).** PRACTICE opens the {@link PracticeScene} (zone,
 *   checkpoint, loadout), then the difficulty / ship / weapon select as a game start does; their
 *   last OK plays the zone from the checkpoint ({@link SceneFlow.startPractice}: its rank stage
 *   term, the chosen starting loadout). Its clear or game over returns to the title through the
 *   name entry; its scores go into the **practice tables** only (`core/save`
 *   `hiScoreModeKey(…, 'practice')`) and never raise the session hi-score.
 *
 *   **Front end (M2-15).** The **attract loop** (shmup_feat.md §17): the title idles
 *   {@link TITLE_ATTRACT_TICKS} on `PRESS OK`, then the {@link DemoScene} plays the next of the
 *   content's demos (`ContentDb.demos`, the 4-way bot's recordings — `core/replay`
 *   `createDemoPlayback`, hashes checked, silent), the {@link HiScoreScene} shows the tables, the
 *   {@link StoryScene} crawls the campaign's story over sprite scenes, and the title comes back;
 *   any input on those returns to the title. A game that ends (game over, a stage clear, the
 *   credits) with a score in its table goes to the {@link NameEntryScene} (3 letters with the four
 *   directions and OK), then the {@link HiScoreScene} with the new rows lit, then the title. The
 *   hi-score tables are per difficulty × ship × mode (1 PLAYER, 2 PLAYERS, PRACTICE — `core/save`
 *   `hiScoreModeKey`). The {@link SoundTestScene} plays the host's music tracks
 *   ({@link SoundTestSetup}, `SimEventKind.SoundTest`) and every SFX cue; the continue countdown
 *   got a draining bar, the score and a `PRESS OK` prompt.
 *
 *   **Saves (M1-17).** The flow plays with a `core/save` {@link SaveStore} (the host's, loaded
 *   before the title — or a memory-only one): the session hi-score of each difficulty starts from
 *   the saved best of its table ({@link SceneFlow.modeKey}: power-up mode and difficulty); when a
 *   game ends on the game-over or stage-clear screen its score is inserted into its table (as `---`,
 *   named by the name entry afterwards — M2-15), the statistics count, and the save is written
 *   (only when it changed); closing the Options screen writes the options the same way.
 *   - {@link ConfirmDialog} (overlay): YES / NO, focused on NO — the Tizen **exit confirmation**
 *     (Back on the title, or EXIT: `platform.exit()` runs only after YES — shmup_feat.md §23) and
 *     "quit to title?".
 *
 *   A platform resume while the game scene is on top pushes the pause menu (the player returns to a
 *   paused game — shmup_feat.md §23); Play/Pause toggles pause. **Back** walks the stack: game →
 *   pause, pause → resume, menus → back, title → exit confirmation. The flow composes what the
 *   renderer draws: the World's view and HUD while the game scene is visible (under overlays) — or
 *   the weapon select's preview World (no HUD) while that screen is visible (M2-03) —, one UI draw
 *   list with every visible scene's widgets (rebuilt only when a visible scene's look changed),
 *   and the dim of the top overlay. Menu sounds, the pause toggle and the title / stage clear /
 *   game over music are pushed into the game's event queue.
 *
 * Nothing allocates per tick or per frame: every scene, menu and draw list is created with the
 * flow; only a World is created per game start and per visit of the weapon select (its preview) —
 * scene transitions, not ticks. (The preview's range spawns targets whose behaviour coroutines are
 * created per spawn, decision D29 — the same small cost as a stage's spawns in a game.)
 *
 * **Where it runs.** Hosts rarely call {@link createSceneFlow} themselves: `core/game`
 * `createGame(platform, overrides, content, { scenes: 'boot' | 'title' | 'game' })` builds the flow
 * on the session (its config, content, one event queue, `platform.exit`, a World factory), ticks it
 * from `Game.step`, forwards a platform resume to {@link SceneFlow.onResume} and composes
 * `Game.renderFrame()` from {@link SceneFlow.view}. Without `options.scenes` the session stays bare
 * gameplay (no scenes at all). The browser shell's default scene `'game'` runs the flow from
 * `'boot'` and calls {@link SceneFlow.finishBoot} after its loading phase.
 *
 * Input by scene (every player's input merged; the game table maps OK to PowerUp instead):
 * - **Title** — OK: `PRESS OK` → menu, then activate; Back: exit confirmation (when the platform
 *   can exit) or back to `PRESS OK`; Up / Down: move (auto-repeat).
 * - **Difficulty** — Up / Down: move; OK: choose the focused preset (→ ship select); Back: title
 *   menu.
 * - **Ship select** — Up / Down: move; OK: choose the focused ship (a meter ship → weapon select, a
 *   Direct-mode ship → the game); Back: difficulty menu.
 * - **Weapon select** — Up / Down: move; Left / Right (or OK): change the focused value; OK on
 *   ORDER: the order editor; OK on START: start the game; Back: ship select.
 * - **Order editor** — Up / Down: move; Left / Right (or OK): change a row; DONE or Back: store
 *   and close.
 * - **Continue** — OK: continue (in a co-op game: the players who press it); Back: give up (both
 *   after a 30-tick lock).
 * - **Game** — Pause or Back: pause menu; in a co-op game (M2-06) the START / OK of a player who
 *   may drop in joins instead (the World reads it — `core/world` `JOIN_ACTIONS`).
 * - **Pause** — Pause or Back: resume; OK: activate; Up / Down: move.
 * - **Options** — Up / Down: move; Left / Right: change the slider / profile (OK steps the profile
 *   too); Back or BACK: save and close.
 * - **Confirm** — Left / Up: YES, Right / Down: NO; OK: answer; Back: NO.
 * - **Stage clear** — OK: skip ahead. **Game over** — OK or Back (after a 30-tick lock): the name
 *   entry (a new hi-score) or the title.
 * - **Zone map** (M2-10) — Up / Down: choose the next zone; OK: launch; Back: "quit to title?".
 * - **Ending** (M2-10; M2-14) — OK (after a 60-tick lock): the whole epilogue, then the result card,
 *   then the credits (or the name entry / title without credits).
 * - **Credits** (M2-14) — OK or Back (after a 60-tick lock): the name entry or the title.
 * - **Name entry** (M2-15) — Up / Down: the letter; Right or OK: next; Left or Back: back; OK on
 *   END: done. **Hi-score table** after a game — OK or Back (after a 30-tick lock): title.
 * - **Demo play, hi-score tables, story** (the attract loop, M2-15) — any input: title.
 * - **Practice select** (M2-15) — Up / Down: move; Left / Right (or OK): change; OK on START: the
 *   difficulty menu; Back: mode select.
 * - **Sound test** (M2-15) — Up / Down: move; Left / Right: choose; OK: play (MUSIC, SFX) / stop
 *   (STOP) / close (BACK); Back: close.
 *
 * **Implements.**
 * - shmup_feat.md §17 Screens, UI flow & HUD — scene flow, title / pause / game over / stage clear
 * - shmup_feat.md §22 — scene stack / state machine
 * - shmup_feat.md §23 — Tizen Back key and exit confirmation, pause on resume
 * - shmup_feat.md §4 — rule 8: menus fully D-pad + OK + Back navigable
 * - shmup_feat.md §21 — the Options menu (audio sliders, controls profile) and saved hi-scores
 * - shmup_feat.md §16 — difficulty select, weapon select / Weapon Edit (M2-03); §10 — continues
 *   (the countdown); §6A — the editable Auto Power-Up order, §7A — the `!` choices
 * - shmup_feat.md §5 — ship selection: the meter ship or the Direct-mode ship (M2-05)
 * - shmup_feat.md §16 — 2-player simultaneous co-op: `2 PLAYERS` on the title, the drop-in join,
 *   per-player continues and both players' scores on the end screens (M2-06)
 * - shmup_feat.md §14 — the branching zone map, the run carried between zones, hidden bonus stages
 *   (entry, lock-out, the boss skipped); §17 — zone map, zone result tally, ending; §5 — the zone's
 *   launch intro card; §15 — the time bonus and the ending chosen by route and flags (M2-10)
 * - shmup_feat.md §17 — the ending(s) and the credits; §15 — multiple endings: one scene per final
 *   zone and a no-death variant (M2-14)
 * - shmup_feat.md §17 — the attract loop (story crawl ⇄ title ⇄ demo play ⇄ hi-score table), the
 *   mode select, name entry, hi-score tables, the continue countdown; §16 — attract / demo mode,
 *   practice (zone, checkpoint, loadout; separate score table); §15 — the hi-score table per
 *   difficulty / mode; §21 — the sound test (M2-15)
 *
 * **Public API.** {@link SceneStack}, {@link createSceneStack}, {@link SCENE_STACK_DEPTH},
 * {@link Scene}, {@link SceneId}, {@link SceneFlow}, {@link SceneFlowHost}, {@link SceneStart},
 * {@link createSceneFlow}, {@link mergeMenuInput}, the scenes ({@link BootScene},
 * {@link TitleScene}, {@link DifficultyScene}, {@link ShipSelectScene} (M2-05),
 * {@link WeaponSelectScene}, {@link AutoOrderScene},
 * {@link GameScene}, {@link PauseScene}, {@link OptionsScene}, {@link StageClearScene},
 * {@link ContinueScene}, {@link GameOverScene}, {@link ConfirmDialog}), {@link ConfirmPurpose},
 * the weapon select's items and labels ({@link WeaponSelectItem}, {@link MEGA_CHOICE_LABELS},
 * {@link SHIELD_CHOICE_LABELS}, {@link OPTION_CHOICE_LABELS} (M2-04), {@link WEAPON_EDIT_LABEL},
 * {@link AUTO_ORDER_LABELS}, {@link AUTO_ORDER_ROWS}) and its preview ({@link WEAPON_RANGE_STAGE},
 * {@link PREVIEW_SHIP_X}, {@link PREVIEW_WEAVE_TICKS}, {@link PREVIEW_OPTIONS},
 * {@link PREVIEW_SPREAD_TICKS}), the ship select's labels ({@link SHIP_MODE_LABELS},
 * {@link SHIP_MODE_HINTS} — M2-05),
 * {@link InputProfileSetup}, the menu item indices ({@link TitleItem}, {@link PauseItem},
 * {@link OptionsItem} — BULLETS since M2-02, SCALE / SHAKE / FLASHES / HITBOX since M2-08, BOSS HP
 *   since M2-09 —),
 * the Options screen's labels ({@link BULLET_PALETTE_LABELS}, M2-02; {@link SCALE_MODE_LABELS},
 * {@link FLASH_LABELS}, M2-08) and the timing constants ({@link STAGE_CLEAR_DELAY_TICKS},
 * {@link GAME_OVER_DELAY_TICKS}, {@link GAME_OVER_TIMEOUT_TICKS}, {@link GAME_OVER_LOCK_TICKS},
 * {@link STAGE_CLEAR_TALLY_TICKS}, {@link STAGE_CLEAR_CONTINUED_TICKS}, {@link PAUSE_DIM},
 * {@link CONTINUE_COUNTDOWN_TICKS}, {@link CONTINUE_LOCK_TICKS}); M2-10: {@link MapScene},
 * {@link EndingScene}, {@link BONUS_WARP_TICKS}, {@link BONUS_FAIL_TICKS}, {@link ZONE_CARD_TICKS},
 * {@link ZONE_TALLY_TICKS}, {@link MAP_LAUNCH_TICKS}, {@link ENDING_LOCK_TICKS},
 * {@link ENDING_TIMEOUT_TICKS}; M2-14: {@link CreditsScene}, {@link ENDING_LINE_TICKS},
 * {@link ENDING_STORY_HOLD_TICKS}, {@link CREDITS_SCROLL_TICKS}, {@link CREDITS_ROW_HEIGHT},
 * {@link CREDITS_LOCK_TICKS}, {@link CREDITS_HOLD_TICKS}, {@link CREDITS_STRING_SLOTS}; M2-15:
 * {@link NameEntryScene}, {@link HiScoreScene}, {@link DemoScene}, {@link StoryScene},
 * {@link PracticeScene}, {@link SoundTestScene}, {@link SoundTestSetup}, {@link PracticeItem},
 * {@link SoundTestItem}, {@link PRACTICE_LOADOUTS}, {@link PRACTICE_LOADOUT_LABELS},
 * {@link SFX_TEST_LABELS}, {@link HI_SCORE_MODE_LABELS}, {@link HI_SCORE_RANK_LABELS},
 * {@link TITLE_ATTRACT_TICKS}, {@link HI_SCORE_PAGE_TICKS}, {@link HI_SCORE_ATTRACT_PAGES},
 * {@link HI_SCORE_RESULT_TICKS}, {@link HI_SCORE_LOCK_TICKS}, {@link NAME_ENTRY_TIMEOUT_TICKS},
 * {@link STORY_SCROLL_TICKS}, {@link STORY_ROW_HEIGHT}, {@link STORY_HOLD_TICKS},
 * {@link STORY_STRING_SLOTS} and, from
 * `./run.ts`, {@link RunState}, {@link CarryState},
 * {@link CarriedPlayer}, {@link captureCarry}, {@link applyCarry}, {@link copyShieldState},
 * {@link worldDeaths}, {@link ZoneResult}, {@link tallyZone}, {@link awardZoneBonus},
 * {@link runWorldConfig}, {@link prepareRunWorld}, {@link RunFlag},
 * {@link KILL_BONUS_PER_PERCENT}, {@link TIME_BONUS_PAR_TICKS}, {@link TIME_BONUS_PER_SECOND}.
 *
 * **Co-op (M2-06).** {@link SceneFlow.coop} is the title's choice; {@link SceneFlow.inputSeats}
 * tells the host's input adapter whether player 2's seat is routed (a co-op game or its continue
 * countdown on top). A co-op game records its scores with the hi-score mode `2p`.
 *
 * **Planned.** More option groups (controls rebinding, game — M2-16).
 *
 * @module
 */
import {
  BULLET_PALETTES,
  SCALE_MODES,
  DEFAULT_DIFFICULTY_TABLE,
  DIFFICULTY_PRESETS,
  MAX_AUTO_POWER_UP_ORDER,
  MEGA_CHOICES,
  METER_SLOT_NAMES,
  OPTION_CHOICES,
  POWER_UP_MODES,
  SHIELD_CHOICES,
  VOLUME_LEVELS,
  PLAYFIELD_W,
  arsenalMatches,
  resolveGameConfig,
  withArsenal,
  withCoop,
  withDifficulty,
  withShip,
  type ArsenalChoice,
  type ShipChoice,
  type DifficultyPreset,
  type GameConfig,
  type StartingLoadout,
  type InputProfileChoice,
  type MeterSlotName,
  type UserOptions,
  type WeaponEdit,
} from '../config/index.js';
import {
  MAX_ENDING_TEXT_LINES,
  MAX_ZONE_PREVIEW_LINES,
  STORY_SCENES,
  campaignZoneIndex,
  selectCampaignEnding,
  type CampaignSpec,
  type ContentDb,
  type PlayerShipSpec,
  type WeaponPresetSpec,
  type WeaponSlot,
  type WeaponSpec,
} from '../data/index.js';
import { createDebugFlags, type DebugFlags } from '../debug/index.js';
import {
  MUSIC_CUES,
  SFX_CUES,
  SFX_CUE_NAMES,
  SimEventKind,
  UserOptionKind,
  createEventQueue,
  type EventQueue,
  type SimEvent,
} from '../events/index.js';
import {
  Action,
  MAX_PLAYERS,
  createInputSnapshot,
  type InputContext,
  type InputSnapshot,
  type PlayerInput,
} from '../input/index.js';
import { defineModule } from '../module-info.js';
import { TextAlign, createDrawList, type DrawList, type WorldView } from '../presentation/index.js';
import { createDemoPlayback, type DemoPlayback } from '../replay/demo.js';
import { decodeReplay, type Replay } from '../replay/format.js';
import {
  HI_SCORE_MODES,
  HI_SCORE_TABLE_SIZE,
  createHiScoreEntry,
  createSaveStore,
  hiScoreModeKey,
  parseHiScoreModeKey,
  type HiScoreEntry,
  type HiScoreMode,
  type SaveStore,
} from '../save/index.js';
import { DEFAULT_PLAYER_SHIP } from '../player/index.js';
import { MAX_SCORE } from '../scoring/index.js';
import {
  CONFIRM_STRING_SLOTS,
  ConfirmChoice,
  HUD_COMMAND_COUNT,
  HUD_STRING_COUNT,
  MenuResult,
  NAME_ENTRY_STRING_SLOTS,
  UI_COLORS,
  confirmTick,
  createChoice,
  createConfirm,
  createHud,
  createListMenu,
  createNameEntry,
  createSlider,
  createToggle,
  drawConfirm,
  drawMenu,
  drawNameEntry,
  drawPanel,
  menuResultSfx,
  menuStringSlots,
  menuTick,
  nameEntryTick,
  resolveUiSprites,
  type Choice,
  type Confirm,
  type Hud,
  type ListMenu,
  type MenuItemSpec,
  type MenuLayout,
  type NameEntry,
  type Slider,
  type Toggle,
  type UiSprites,
} from '../ui/index.js';
import {
  MainWeapon,
  WeaponRole,
  resolveRoleWeapons,
  weaponLabel,
  weaponsOfSlot,
} from '../weapons/index.js';
import {
  JOIN_ACTIONS,
  canContinue,
  continueWorld,
  continuesLeft,
  createWorld,
  playerCanJoin,
  stepWorld,
  type World,
} from '../world/index.js';
import {
  RunFlag,
  RunState,
  awardZoneBonus,
  captureCarry,
  prepareRunWorld,
  runWorldConfig,
  tallyZone,
  worldDeaths,
  type CarryState,
} from './run.js';

export {
  CarriedPlayer,
  CarryState,
  KILL_BONUS_PER_PERCENT,
  RunFlag,
  RunState,
  TIME_BONUS_PAR_TICKS,
  TIME_BONUS_PER_SECOND,
  ZoneResult,
  applyCarry,
  awardZoneBonus,
  captureCarry,
  copyShieldState,
  prepareRunWorld,
  runWorldConfig,
  tallyZone,
  worldDeaths,
} from './run.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'scenes',
  status: 'implemented',
  specRefs: [
    'shmup_feat.md §17',
    'shmup_feat.md §22',
    'shmup_feat.md §23',
    'shmup_feat.md §4',
    'shmup_feat.md §21',
    'shmup_feat.md §16',
    'shmup_feat.md §10',
    'shmup_feat.md §5',
    'shmup_feat.md §14',
    'shmup_feat.md §15',
  ],
});

/**
 * Scene identifiers (the M1 set, the difficulty menu and continue countdown of M2-01, the weapon
 * select and its order editor of M2-03, the ship select of M2-05, the zone map and the ending of
 * M2-10, the credits of M2-14, and the front end of M2-15 — the attract loop's demo play and story
 * crawl, the name entry, the hi-score tables, the practice select and the sound test; the
 * placeholder ids `attract` and `select` of the skeleton became `demo` / `story` and the title's
 * mode select).
 */
export type SceneId =
  | 'boot'
  | 'title'
  | 'game'
  | 'pause'
  | 'stageClear'
  | 'gameOver'
  | 'confirm'
  | 'difficulty'
  | 'shipSelect'
  | 'weaponSelect'
  | 'autoOrder'
  | 'continue'
  | 'map'
  | 'options'
  | 'nameEntry'
  | 'hiScore'
  | 'ending'
  | 'credits'
  | 'demo'
  | 'story'
  | 'practice'
  | 'soundTest';

/** A scene on the stack. */
export interface Scene {
  /** Which scene this is. */
  readonly id: SceneId;
  /** Overlays (pause, dialogs) let the scene below keep rendering (frozen — only the top ticks). */
  readonly overlay: boolean;
  /** The binding table the input adapters should use while this scene is on top (decision D15). */
  readonly inputContext: InputContext;
  /** Darkening of the world and HUD under the UI while this scene is on top, 0…1. */
  readonly dim: number;
  /**
   * Increases whenever what {@link Scene.drawUi} draws changes; the flow redraws the UI list only
   * then.
   */
  readonly uiRevision: number;
  /** Called when the scene becomes part of the stack (pushed or replaced in). */
  enter(): void;
  /** Called when the scene leaves the stack (popped, replaced or reset out). */
  exit(): void;
  /** Called when another scene was pushed on top of it. */
  cover(): void;
  /** Called when the scene on top of it was popped (it is the top again). */
  uncover(): void;
  /**
   * One simulation tick with this tick's input. Only the top scene ticks.
   *
   * @param input - This tick's input snapshot (read-only).
   */
  tick(input: InputSnapshot): void;
  /**
   * Appends the scene's widgets to the UI draw list (the flow cleared it and draws every visible
   * scene bottom to top). Uses only the scene's own string slots.
   *
   * @param list - The UI draw list.
   */
  drawUi(list: DrawList): void;
}

// ------------------------------------------------------------------------------ stack

/** Most scenes on a {@link SceneStack}. */
export const SCENE_STACK_DEPTH = 8;

/** Most transitions queued during one tick. */
const MAX_PENDING = 8;

/** Queued transition codes. */
const Op = { Push: 1, Pop: 2, Replace: 3, Reset: 4 } as const;

/**
 * A fixed-depth stack of scenes with deferred transitions (see the module docs). A class: no
 * allocation after creation.
 *
 * @example
 * ```ts
 * const stack = createSceneStack();
 * stack.push(title);           // outside a tick: title.enter() runs now
 * stack.tick(input);           // title.tick(input); a push it requested applies afterwards
 * stack.top?.inputContext;     // → 'menu'
 * ```
 */
export class SceneStack {
  /** Most scenes on the stack ({@link SCENE_STACK_DEPTH}). */
  readonly capacity = SCENE_STACK_DEPTH;
  /** Increases on every applied transition. */
  revision = 0;
  private readonly scenes: Array<Scene | null> = [];
  private size = 0;
  private readonly ops = new Uint8Array(MAX_PENDING);
  private readonly args: Array<Scene | null> = [];
  private pendingCount = 0;
  private ticking = false;
  private flushing = false;

  /** Creates an empty stack (use {@link createSceneStack}). */
  constructor() {
    for (let i = 0; i < SCENE_STACK_DEPTH; i++) this.scenes.push(null);
    for (let i = 0; i < MAX_PENDING; i++) this.args.push(null);
  }

  /** Scenes on the stack. */
  get depth(): number {
    return this.size;
  }

  /** The top scene (the one that ticks), or `null` when empty. */
  get top(): Scene | null {
    return this.size > 0 ? this.scenes[this.size - 1] : null;
  }

  /** Transitions waiting for the end of the current tick. */
  get pending(): number {
    return this.pendingCount;
  }

  /**
   * The scene at a depth.
   *
   * @param index - 0 = bottom … `depth − 1` = top.
   * @returns The scene, or `null` outside the stack.
   */
  sceneAt(index: number): Scene | null {
    return index >= 0 && index < this.size ? this.scenes[index] : null;
  }

  /**
   * Whether a scene is on the stack.
   *
   * @param scene - The scene.
   * @returns `true` when it is at any depth.
   */
  contains(scene: Scene): boolean {
    for (let i = 0; i < this.size; i++) if (this.scenes[i] === scene) return true;
    return false;
  }

  /**
   * Pushes a scene on top (deferred during a tick). The previous top gets `cover()`, the new one
   * `enter()`.
   *
   * @param scene - Scene to activate; must not be on the stack already.
   * @throws {RangeError} When applied on a full stack, the scene is already on it, or too many
   *   transitions were queued in one tick (programming errors).
   */
  push(scene: Scene): void {
    this.request(Op.Push, scene);
  }

  /**
   * Removes the top scene (deferred during a tick): it gets `exit()`, the one below `uncover()`.
   * Popping an empty stack does nothing.
   *
   * @throws {RangeError} When too many transitions were queued in one tick.
   */
  pop(): void {
    this.request(Op.Pop, null);
  }

  /**
   * Swaps the top scene for another (deferred during a tick): `exit()` then `enter()`; on an empty
   * stack it pushes.
   *
   * @remarks
   * Replacing the top with itself does nothing (no hooks run). The scene below gets no hook.
   *
   * @param scene - Scene to activate.
   * @throws {RangeError} When the scene is already on the stack (below the top), or too many
   *   transitions were queued in one tick.
   */
  replace(scene: Scene): void {
    this.request(Op.Replace, scene);
  }

  /**
   * Empties the stack (every scene gets `exit()`, top first), then pushes `scene` (deferred during
   * a tick) — "quit to title".
   *
   * @remarks
   * `scene` gets `enter()` even when it was on the stack before (it left with `exit()` first); no
   * `cover` / `uncover` hooks run.
   *
   * @param scene - The new root scene.
   * @throws {RangeError} When too many transitions were queued in one tick.
   */
  reset(scene: Scene): void {
    this.request(Op.Reset, scene);
  }

  /**
   * Ticks the top scene, then applies the transitions it (or anything it called) requested, in
   * order. Does nothing on an empty stack. Never allocates.
   *
   * @remarks
   * When the scene's `tick` throws, the error propagates but the stack leaves its "ticking" state,
   * so later requests apply at once again; the requests queued before the throw stay queued until
   * the next flush.
   *
   * @param input - This tick's input.
   * @throws Whatever the top scene's `tick` throws, and {@link SceneStack.flush}'s `RangeError`.
   */
  tick(input: InputSnapshot): void {
    const top = this.top;
    if (top === null) return;
    this.ticking = true;
    try {
      top.tick(input);
    } finally {
      this.ticking = false;
    }
    this.flush();
  }

  /**
   * Applies every queued transition now (the end of a tick). Transitions requested by the
   * `enter` / `exit` hooks it runs are applied in the same call.
   *
   * @throws {RangeError} When the transitions keep requesting new ones (more than 64 in a row).
   */
  flush(): void {
    if (this.flushing) return;
    this.flushing = true;
    try {
      let guard = 0;
      while (this.pendingCount > 0) {
        if (++guard > 64) throw new RangeError('scene transitions keep requesting transitions');
        const op = this.ops[0];
        const scene = this.args[0];
        for (let i = 1; i < this.pendingCount; i++) {
          this.ops[i - 1] = this.ops[i];
          this.args[i - 1] = this.args[i];
        }
        this.pendingCount--;
        this.args[this.pendingCount] = null;
        this.apply(op, scene);
      }
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Queues a transition and applies it at once outside a tick.
   *
   * @param op - Transition code.
   * @param scene - Its scene (null for pop).
   * @throws {RangeError} When the queue is full.
   */
  private request(op: number, scene: Scene | null): void {
    if (this.pendingCount >= MAX_PENDING) {
      throw new RangeError(`more than ${MAX_PENDING} scene transitions in one tick`);
    }
    this.ops[this.pendingCount] = op;
    this.args[this.pendingCount] = scene;
    this.pendingCount++;
    if (!this.ticking) this.flush();
  }

  /**
   * Applies one transition.
   *
   * @param op - Transition code.
   * @param scene - Its scene.
   * @throws {RangeError} On a full stack or a scene already on it.
   */
  private apply(op: number, scene: Scene | null): void {
    const scenes = this.scenes;
    if (op === Op.Pop) {
      if (this.size === 0) return;
      const top = scenes[--this.size];
      scenes[this.size] = null;
      this.revision++;
      top?.exit();
      this.top?.uncover();
      return;
    }
    if (scene === null) return;
    if (op === Op.Reset) {
      while (this.size > 0) {
        const top = scenes[--this.size];
        scenes[this.size] = null;
        top?.exit();
      }
      this.revision++;
      scenes[this.size++] = scene;
      scene.enter();
      return;
    }
    if (op === Op.Replace && this.size > 0) {
      for (let i = 0; i < this.size - 1; i++) {
        if (scenes[i] === scene)
          throw new RangeError(`scene '${scene.id}' is already on the stack`);
      }
      const top = scenes[this.size - 1];
      if (top === scene) return;
      this.revision++;
      top?.exit();
      scenes[this.size - 1] = scene;
      scene.enter();
      return;
    }
    if (this.size >= SCENE_STACK_DEPTH) {
      throw new RangeError(`the scene stack is full (${SCENE_STACK_DEPTH} scenes)`);
    }
    if (this.contains(scene)) throw new RangeError(`scene '${scene.id}' is already on the stack`);
    const below = this.top;
    scenes[this.size++] = scene;
    this.revision++;
    below?.cover();
    scene.enter();
  }
}

/**
 * Creates an empty scene stack of depth {@link SCENE_STACK_DEPTH}.
 *
 * @returns The stack.
 */
export function createSceneStack(): SceneStack {
  return new SceneStack();
}

/**
 * Merges every player's input into one (menus answer to any controller). Never allocates.
 *
 * @remarks
 * The flow merges once per tick into {@link SceneFlow.menuInput}; every menu scene reads that, so
 * player 2's pad can drive the title and the pause menu. The game scene steps the World with the
 * unmerged snapshot.
 *
 * @param snapshot - This tick's input.
 * @param out - The merged input (overwritten): the OR of every player's masks, player 1's device.
 * @returns `out`.
 */
export function mergeMenuInput(snapshot: Readonly<InputSnapshot>, out: PlayerInput): PlayerInput {
  const players = snapshot.players;
  let held = 0;
  let pressed = 0;
  let released = 0;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    held |= p.held;
    pressed |= p.pressed;
    released |= p.released;
  }
  out.held = held;
  out.pressed = pressed;
  out.released = released;
  out.device = players.length > 0 ? players[0].device : 'none';
  return out;
}

// ------------------------------------------------------------------------------ flow

/** What the flow needs from its game (the `core/game` session). */
export interface SceneFlowHost {
  /** The session config (the World's). */
  readonly config: GameConfig;
  /** Validated content (sprite ids for the HUD and logo, the stage name). */
  readonly content: ContentDb;
  /** The session's presentation event queue (menu sounds and music are pushed into it). */
  readonly events: EventQueue;
  /**
   * Quits the app (`platform.exit`), or `null` when the platform cannot — then the title has no
   * EXIT item and Back on the title only backs out of the menu. Read when the flow is created
   * (the title's items) and when a confirmed exit runs.
   */
  readonly exit: (() => void) | null;
  /**
   * Creates a fresh gameplay World for a new game (pushing into {@link SceneFlowHost.events}).
   *
   * @remarks
   * Called once when the flow is created (the game scene's placeholder World) and on every game
   * start and RETRY STAGE — scene transitions, never inside the per-tick hot path of a World.
   *
   * @param config - The config of the game (the difficulty chosen under START —
   *   `core/config` `withDifficulty` of {@link SceneFlowHost.config}); omitted = the host's
   *   config.
   * @returns The World at tick 0.
   */
  createWorld(config?: GameConfig): World;
  /**
   * The save the flow plays with (loaded by the host before the title — `core/save` `loadSave` +
   * `createSaveStore`): the options the Options screen shows and stores, the hi-score tables. When
   * omitted or `null` the flow uses a memory-only store with the defaults (nothing persists).
   */
  readonly save?: SaveStore | null;
  /**
   * The keyboard / remote input profiles the Options screen's CONTROLS item offers, and the one in
   * use. Omitted or `null` (or no choices): CONTROLS is disabled.
   */
  readonly inputProfiles?: InputProfileSetup | null;
  /**
   * What the sound test offers besides the SFX cues (M2-15): the music library's track titles.
   * Omitted or `null` (or no titles): the sound test's MUSIC row is disabled.
   */
  readonly soundTest?: SoundTestSetup | null;
}

/** The input profiles a host lets the player choose from (the Options screen's CONTROLS). */
export interface InputProfileSetup {
  /** The profiles, in the order the selector steps through them. */
  readonly choices: readonly InputProfileChoice[];
  /** Id of the profile in use when the flow starts (`null` or unknown: the first choice is shown). */
  readonly active: string | null;
}

/** Where a flow starts: the boot screen, the title, or straight in a game (dev / tests). */
export type SceneStart = 'boot' | 'title' | 'game';

/** Why the {@link ConfirmDialog} is open. */
export const ConfirmPurpose = {
  /** Quit the app (Tizen exit confirmation). */
  Exit: 0,
  /** Abandon the game and return to the title. */
  QuitToTitle: 1,
} as const;

/** A {@link ConfirmPurpose} code. */
export type ConfirmPurpose = (typeof ConfirmPurpose)[keyof typeof ConfirmPurpose];

/**
 * The title's menu items — the **mode select** (M2-15; indices into the title menu; EXIT only
 * exists when the platform can quit — the TV): `1 PLAYER` (`Start`), `2 PLAYERS` (a co-op game —
 * M2-06; both open the difficulty menu), PRACTICE (the {@link PracticeScene} — M2-15; disabled
 * without a campaign), OPTIONS (the {@link OptionsScene}), SOUND TEST (the {@link SoundTestScene} —
 * M2-15), EXIT. OPTIONS and EXIT moved down one row in M2-06 and again (OPTIONS 3, EXIT 5) in
 * M2-15.
 */
export const TitleItem = {
  Start: 0,
  TwoPlayers: 1,
  Practice: 2,
  Options: 3,
  SoundTest: 4,
  Exit: 5,
} as const;

/**
 * Pause menu items: RESUME, OPTIONS (the {@link OptionsScene} over the paused game), RETRY STAGE
 * (no confirmation), QUIT TO TITLE (through the {@link ConfirmDialog}).
 */
export const PauseItem = { Resume: 0, Options: 1, Retry: 2, Quit: 3 } as const;

/**
 * Options screen items: the three volume sliders, the input profile, the bullet palette (M2-02),
 * the display options (M2-08), the boss HP bar (M2-09), BACK.
 */
export const OptionsItem = {
  /** MASTER volume slider. */
  Master: 0,
  /** MUSIC volume slider. */
  Music: 1,
  /** SFX volume slider (menu sounds follow it). */
  Sfx: 2,
  /** CONTROLS: the input profile choice (disabled when the host offers none). */
  Controls: 3,
  /** BULLETS: the enemy bullet palette choice (M2-02). */
  Bullets: 4,
  /** SCALE: how the frame fills the display — `SCALE_MODES` (M2-08). */
  Scale: 5,
  /** SHAKE: screen shake on / off (M2-08). */
  Shake: 6,
  /** FLASHES: normal / reduced flashing (M2-08). */
  Flashes: 7,
  /** HITBOX: the ships' hitbox markers off / on (M2-08). */
  Hitbox: 8,
  /** BOSS HP: the boss HP bar in the top HUD bar off / on (M2-09). */
  BossHp: 9,
  /** BACK: store the options, write the save and close (index 10 since M2-09 — was 9, 5, 4). */
  Back: 10,
} as const;

/** The Options screen's BULLETS labels, in `BULLET_PALETTES` order (M2-02). */
export const BULLET_PALETTE_LABELS: readonly string[] = Object.freeze([
  'STANDARD',
  'DEUTERANOPIA',
  'PROTANOPIA',
  'TRITANOPIA',
]);

/** The Options screen's SCALE labels, in `SCALE_MODES` order (M2-08). */
export const SCALE_MODE_LABELS: readonly string[] = Object.freeze(['INTEGER', 'FIT', 'STRETCH']);

/** The Options screen's FLASHES labels (M2-08): index 0 = normal, 1 = reduced flashing. */
export const FLASH_LABELS: readonly string[] = Object.freeze(['NORMAL', 'REDUCED']);

/** Ticks the game runs on after `stageClear` before the stage-clear screen opens. */
export const STAGE_CLEAR_DELAY_TICKS = 90;

/** Ticks the game runs on after `gameOver` before the game-over screen opens. */
export const GAME_OVER_DELAY_TICKS = 30;

/** Ticks the game-over screen stays before it returns to the title by itself (10 s). */
export const GAME_OVER_TIMEOUT_TICKS = 600;

/** Ticks the game-over screen ignores OK (so a mashed button does not skip it). */
export const GAME_OVER_LOCK_TICKS = 30;

/** Ticks of the stage-clear tally before `TO BE CONTINUED`. */
export const STAGE_CLEAR_TALLY_TICKS = 240;

/** Ticks `TO BE CONTINUED` stays before the title. */
export const STAGE_CLEAR_CONTINUED_TICKS = 240;

/** Dim of the world under the pause menu and the dialogs. */
export const PAUSE_DIM = 0.5;

/**
 * Ticks the game runs on after a hidden bonus-stage entrance opened before the players are in the
 * bonus stage (the warp — M2-10).
 */
export const BONUS_WARP_TICKS = 40;

/**
 * Ticks after the first death in a bonus stage before the players are back in the zone, the
 * entrance locked (M2-10 — "dying locks you out"; shorter than a death's explosion and dead time,
 * so the bonus stage never reaches its game over).
 */
export const BONUS_FAIL_TICKS = 60;

/** World ticks the zone title card shows at the start of a campaign zone (the launch intro). */
export const ZONE_CARD_TICKS = 150;

/** Ticks of the zone result tally (M2-10) before the zone map, the ending or the title. */
export const ZONE_TALLY_TICKS = 300;

/**
 * Ticks between the zone map's OK and the next zone: the next stage is prepared meanwhile
 * (`SimEventKind.PrepareStage`) and `LAUNCH` blinks.
 */
export const MAP_LAUNCH_TICKS = 60;

/** Ticks the ending ignores OK (so a mashed button does not skip it). */
export const ENDING_LOCK_TICKS = 60;

/**
 * Ticks the ending's result card stays before it moves on by itself (20 s — to the credits, or the
 * title without them; M2-14: counted from the card, after the story).
 */
export const ENDING_TIMEOUT_TICKS = 1200;

/** Ticks between two lines of an ending's epilogue appearing (M2-14). */
export const ENDING_LINE_TICKS = 90;

/** Ticks the whole epilogue stays after its last line before the result card (M2-14). */
export const ENDING_STORY_HOLD_TICKS = 240;

/** Ticks per pixel of the credits scroll (M2-14: 2 — 30 px a second). */
export const CREDITS_SCROLL_TICKS = 2;

/** Height of one credits row in pixels (M2-14). */
export const CREDITS_ROW_HEIGHT = 11;

/** Ticks the credits ignore OK and Back (M2-14). */
export const CREDITS_LOCK_TICKS = 60;

/** Ticks the credits hold after the scroll stopped, before the title (M2-14). */
export const CREDITS_HOLD_TICKS = 240;

/** String slots of the credits: rows on screen at once, taken by row number (M2-14). */
export const CREDITS_STRING_SLOTS = 24;

/** Screen row of the first credits row before the scroll (just below the screen). */
const CREDITS_TOP = 216;

/** Screen row the last credits row scrolls up to before the scroll stops. */
const CREDITS_STOP_Y = 100;

/** Ticks of the continue countdown (10 s — shmup_feat.md §17 "continue countdown"). */
export const CONTINUE_COUNTDOWN_TICKS = 600;

/** Ticks the continue countdown ignores OK and Back (so a mashed button decides nothing). */
export const CONTINUE_LOCK_TICKS = 30;

/** Ticks a menu ignores input after it opened (a buffered OK still counts). */
const MENU_OPEN_LOCK_TICKS = 2;

/** `PRESS OK` blinks with this half-period. */
const PROMPT_BLINK_TICKS = 32;

/** Fade length of the scene music changes, in ticks. */
const MUSIC_FADE_TICKS = 30;

/** Screen row of the WARNING band's top edge (the playfield's middle). */
const WARNING_BAND_Y = 76;

/** Height of the WARNING band. */
const WARNING_BAND_H = 48;

/** Screen row of the zone title card's top edge (above the ship's fly-in row). */
const ZONE_CARD_Y = 36;

/** Frame centre x. */
const CX = 192;

/**
 * String slots of the UI list (M2-10: 224 — the zone map, the zone tally and the ending; M2-14:
 * 256 — the ending's epilogue lines and the credits' rows; M2-15: 384 — the name entry, the
 * hi-score table's rows, the story crawl, the practice select and the sound test).
 */
const UI_STRINGS = 384;

/** Commands of the UI list (M2-10: 384 — the zone map's graph). */
const UI_COMMANDS = 384;

/** Where the title menu is drawn (a constant: redrawing allocates nothing). */
const TITLE_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: CX,
  y: 118,
  align: TextAlign.Center,
  cursorX: CX - 40,
});

/** Where the pause menu is drawn. */
const PAUSE_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: CX,
  y: 86,
  align: TextAlign.Center,
  cursorX: CX - 60,
});

/** The Options screen's panel: left, top, width, height (taller since M2-09: eleven rows). */
const OPTIONS_PANEL = Object.freeze({ x: 48, y: 12, w: 288, h: 192 });

/** Where the Options menu is drawn (labels left, values from x 150). */
const OPTIONS_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: 72,
  y: 38,
  lineHeight: 14,
  cursorX: 62,
  valueX: 150,
});

/**
 * The flow's side of the scenes (what they call back). Built by {@link createSceneFlow} before
 * the scenes, which receive it in their constructors (the scene fields are filled right after).
 */
interface FlowControl {
  /** The flow's stack. */
  readonly stack: SceneStack;
  /** The session the flow runs on. */
  readonly host: SceneFlowHost;
  /** The UI kit's sprite ids in the session's content (logo, HUD pieces). */
  readonly sprites: UiSprites;
  /** Every player's input of the current tick merged ({@link mergeMenuInput}; reused). */
  readonly menuInput: PlayerInput;
  /** The boot screen. */
  readonly boot: BootScene;
  /** The title. */
  readonly title: TitleScene;
  /** The game. */
  readonly game: GameScene;
  /** The pause menu. */
  readonly pause: PauseScene;
  /** The stage-clear screen. */
  readonly stageClear: StageClearScene;
  /** The game-over screen. */
  readonly gameOver: GameOverScene;
  /** The YES / NO dialog. */
  readonly confirm: ConfirmDialog;
  /** The Options screen. */
  readonly options: OptionsScene;
  /** The difficulty menu under START. */
  readonly difficultyMenu: DifficultyScene;
  /** The ship select after the difficulty menu (M2-05). */
  readonly shipSelect: ShipSelectScene;
  /** The weapon select after the ship select (M2-03). */
  readonly weaponSelect: WeaponSelectScene;
  /** The Auto Power-Up order editor (M2-03). */
  readonly autoOrder: AutoOrderScene;
  /** The continue countdown. */
  readonly continueScreen: ContinueScene;
  /** The zone map between the zones of a campaign run (M2-10). */
  readonly map: MapScene;
  /** The ending after a campaign run's final zone (M2-10). */
  readonly ending: EndingScene;
  /** The credits scroll after the ending (M2-14). */
  readonly credits: CreditsScene;
  /** The name entry after a game whose score entered a hi-score table (M2-15). */
  readonly nameEntry: NameEntryScene;
  /** The hi-score tables: the attract loop's and a game's result (M2-15). */
  readonly hiScores: HiScoreScene;
  /** The attract loop's demo play (M2-15). */
  readonly demo: DemoScene;
  /** The attract loop's story crawl (M2-15). */
  readonly story: StoryScene;
  /** The practice select (M2-15). */
  readonly practiceSelect: PracticeScene;
  /** The sound test (M2-15). */
  readonly soundTest: SoundTestScene;
  /**
   * The content's demos, decoded (M2-15; a demo that does not decode or names a stage the content
   * lacks is left out).
   */
  readonly demos: readonly Replay[];
  /** The music titles the sound test offers (the host's; empty: MUSIC is disabled). */
  readonly soundTracks: readonly string[];
  /** The practice select's choice, waiting for the difficulty / ship / weapon select (M2-15). */
  readonly practice: PracticeChoice;
  /** The rows of the game just ended that wait for a name (the first `pendingCount`, M2-15). */
  readonly pendingNames: readonly PendingName[];
  /** How many of {@link FlowControl.pendingNames} are in use. */
  pendingCount: number;
  /** The table the game just ended recorded into (`''` before the first). */
  resultKey: string;
  /**
   * The title waited on `PRESS OK`: the attract loop starts — the demo play, or the hi-score tables
   * without demos (M2-15).
   */
  startAttract(): void;
  /**
   * An attract screen ended: demo → hi-score tables → story (when the campaign has one) → title.
   *
   * @param from - The screen that ended.
   */
  nextAttract(from: Scene): void;
  /**
   * A game ended on its last screen (game over, stage clear, credits): the name entry when a score
   * of it entered a table, else the title (M2-15).
   */
  finishGame(): void;
  /** The name entry is done: the game's table with its new rows (M2-15). */
  showResults(): void;
  /**
   * Whether a hi-score row is one the game just ended recorded (the result table lights it).
   *
   * @param row - A row of a table.
   * @returns `true` for a pending row (named or not).
   */
  isNewRow(row: HiScoreEntry): boolean;
  /**
   * The hi-score screen's title line of a table: the ship, the difficulty and the mode
   * (`KESTREL  NORMAL  1 PLAYER`). Builds a string — the screen's `enter` only.
   *
   * @param key - A mode key.
   * @returns The line (the key itself when it is not a mode key).
   */
  tableTitle(key: string): string;
  /**
   * What a hi-score row's zone column shows: the campaign zone's map label of the stage reached,
   * `-` for another stage or none. Never allocates (a lookup).
   *
   * @param stage - The row's `reached` stage id.
   * @returns The label.
   */
  zoneLabel(stage: string): string;
  /**
   * Starts the game the menus set up (the last select's OK): the practice run the practice select
   * chose, else a new game (a transition).
   */
  launchGame(): void;
  /**
   * Starts a practice run of a campaign zone (M2-10 plumbing; M2-15 the practice select and its
   * loadout).
   *
   * @param zone - Campaign zone index.
   * @param checkpoint - Checkpoint index into its stage's checkpoints (-1 = the start).
   * @param loadout - The starting loadout (`null` = the config's).
   * @returns `true` when the practice game starts (with the next applied transition).
   */
  beginPractice(zone: number, checkpoint: number, loadout: StartingLoadout | null): boolean;
  /** The run in progress (M2-10: zone, route, carried players, bonus stage, flags). */
  readonly run: RunState;
  /**
   * The campaign the runs follow (M2-10): the content's, when the host config's stage is its start
   * zone's stage — else `null` (a single-stage run: the M1 stage clear, no map).
   */
  readonly campaign: CampaignSpec | null;
  /**
   * Starts a new run (a game start from the menus): the campaign's first zone or the stage — its
   * music set prepared ({@link FlowControl.prepareStage}).
   */
  beginRun(): void;
  /**
   * The content stage index whose music set the host last prepared (M2-10): the host config's
   * stage's at boot (the shell prepares it while loading), -1 for none (open space).
   */
  readonly preparedStage: number;
  /**
   * Has the host prepare a stage's music set (`SimEventKind.PrepareStage`, id = its content index)
   * unless it is the set last prepared ({@link FlowControl.preparedStage}); an unknown or `null`
   * stage changes nothing. The zone map's launch, the title (the next run's start stage), a run
   * start and a practice start call it. Never allocates.
   *
   * @param stage - A stage id (`null`: none).
   */
  prepareStage(stage: string | null): void;
  /**
   * Creates the World the run plays now — the current zone's stage, the bonus stage while inside
   * one — with the rank's stage term, the practice checkpoint or the bonus entrance to return to,
   * the entrances' lock, and the carried players (a transition: allocates the World).
   *
   * @param carry - The players to carry in (`null` or invalid: the config's fresh start).
   * @returns The World at tick 0.
   */
  createRunWorld(carry: CarryState | null): World;
  /** Flies the players into the bonus stage the game World's entrance opened (M2-10). */
  enterBonus(): void;
  /** A death in the bonus stage: back to its zone at the entrance, now locked (M2-10). */
  failBonus(): void;
  /**
   * Moves the run to a zone the map chose and marks the game scene to play it (M2-10).
   *
   * @param zone - Campaign zone index.
   */
  advanceZone(zone: number): void;
  /** The save the flow plays with. */
  readonly save: SaveStore;
  /**
   * The ships the ship select offers (M2-05): the content's, in content order (the built-in
   * default ship when it has none).
   */
  readonly ships: readonly PlayerShipSpec[];
  /** Index into {@link FlowControl.ships} of the ship the next game flies. */
  shipIndex: number;
  /** The ship chosen in the ship select (`null` until the first choice: the host config's ship). */
  readonly ship: ShipChoice | null;
  /**
   * Index into {@link FlowControl.bests} of a preset's session hi-score for the next game's
   * power-up mode (one table per mode and difficulty, like the save's).
   *
   * @param preset - The preset.
   * @returns The index.
   */
  bestIndex(preset: DifficultyPreset): number;
  /**
   * Chooses the ship of the next games (the ship select's OK, M2-05): every difficulty's config
   * gets its id and power-up model (`core/config` `withShip`).
   *
   * @param index - Index into {@link FlowControl.ships}.
   */
  chooseShip(index: number): void;
  /**
   * The hi-score table of the chosen difficulty's games ({@link hiScoreModeKey} of
   * {@link FlowControl.worldConfig} — the co-op table for a co-op game since M2-15).
   */
  readonly modeKey: string;
  /** The difficulty the next game plays (the host config's until one is chosen under START). */
  difficulty: DifficultyPreset;
  /** Whether the next game is a two-player co-op one (the title's `2 PLAYERS`, M2-06). */
  readonly coop: boolean;
  /**
   * Chooses one or two players for the next games (the title's `1 PLAYER` / `2 PLAYERS`, M2-06):
   * every difficulty's config gets `core/config` `withCoop`.
   *
   * @param coop - `true` for a co-op game.
   */
  choosePlayers(coop: boolean): void;
  /**
   * The config of each difficulty preset, in {@link DIFFICULTY_PRESETS} order: the host's config
   * for its own preset, `withDifficulty` of it for the others (built with the flow).
   */
  readonly configs: readonly GameConfig[];
  /**
   * The session hi-score of each power-up mode and preset (`mode index × 4 + preset index`, in
   * `POWER_UP_MODES` / {@link DIFFICULTY_PRESETS} order — {@link FlowControl.bestIndex}), starting
   * from the save's best of each table.
   */
  readonly bests: Float64Array;
  /**
   * The config the next game's World gets: {@link FlowControl.difficulty}'s with the weapon
   * select's loadout ({@link FlowControl.arsenal}).
   */
  readonly worldConfig: GameConfig;
  /** The loadout chosen in the weapon select (empty until the first START — M2-03). */
  readonly arsenal: ArsenalChoice;
  /** The input profiles CONTROLS offers (empty: CONTROLS disabled). */
  readonly profiles: readonly InputProfileChoice[];
  /** Index of the profile in use in {@link FlowControl.profiles} (-1 = none of them). */
  activeProfile: number;
  /**
   * Pushes a `UserOption` event (the host applies it).
   *
   * @param kind - A `UserOptionKind` code.
   * @param value - The new value.
   */
  userOption(kind: number, value: number): void;
  /**
   * A game ended on its end screen: records every playing player's score in its table — the
   * difficulty × ship × mode table (`core/save` `hiScoreModeKey`: one player, co-op, or a practice
   * run's own — M2-15) —, notes the rows that entered for the name entry, counts the statistic (not
   * for practice) and writes the save when it changed.
   *
   * @param cleared - `true` for a stage clear (a run's final zone), `false` for a game over.
   * @returns Player 1's rank in the table (0 = best), or -1 when the score did not enter.
   */
  recordRun(cleared: boolean): number;
  /**
   * Pushes an SFX event at x 0 (menu sounds — their cues play unpanned on the UI bus).
   *
   * @param cue - An `SFX_CUES` id.
   */
  sfx(cue: number): void;
  /**
   * Pushes a music event.
   *
   * @param cue - A `MUSIC_CUES` id.
   * @param fade - Fade length in ticks (the event's `param`).
   */
  music(cue: number, fade: number): void;
  /**
   * Pushes the sound of a widget result (none for `None`).
   *
   * @param result - A {@link MenuResult} code.
   */
  menuSound(result: number): void;
  /**
   * Opens the confirm dialog for a purpose (with the select sound).
   *
   * @param purpose - Why it opens.
   */
  ask(purpose: ConfirmPurpose): void;
  /** Resets the stack to the title. */
  toTitle(): void;
  /** The best score of the session for the chosen difficulty (hi-score across games). */
  readonly hiScore: number;
  /**
   * Raises the chosen difficulty's session hi-score (a lower value changes nothing).
   *
   * @param value - A score (floored, capped at `MAX_SCORE` + 9 — a continue digit).
   */
  raiseHiScore(value: number): void;
  /**
   * Chooses the difficulty of the next game (the difficulty menu).
   *
   * @param difficulty - The preset.
   */
  chooseDifficulty(difficulty: DifficultyPreset): void;
  /**
   * Chooses the loadout of the next games (the weapon select's START): every difficulty's config
   * gets it (`core/config` `withArsenal`).
   *
   * @param arsenal - The loadout.
   * @throws RangeError when the loadout fails `resolveGameConfig` (a programming error).
   */
  chooseArsenal(arsenal: ArsenalChoice): void;
}

/**
 * Shared state and defaults of the scenes: not an overlay, the `'menu'` binding context, no dim;
 * `enter` and `uncover` bump {@link Scene.uiRevision} so the flow redraws the scene.
 */
abstract class SceneBase implements Scene {
  /** See {@link Scene.id}. */
  abstract readonly id: SceneId;
  /** See {@link Scene.overlay} (default `false`). */
  readonly overlay: boolean = false;
  /** See {@link Scene.inputContext} (default `'menu'`). */
  readonly inputContext: InputContext = 'menu';
  /** See {@link Scene.dim} (default 0). */
  readonly dim: number = 0;
  /** See {@link Scene.uiRevision}. */
  uiRevision = 0;
  /** First string slot of the scene in the UI list (assigned by the flow). */
  stringBase = 0;

  /**
   * Creates the scene.
   *
   * @param flow - The flow it belongs to.
   */
  constructor(protected readonly flow: FlowControl) {}

  /**
   * String slots the scene uses in the UI list (from {@link SceneBase.stringBase}); the flow gives
   * every scene a disjoint range, so the scenes drawn together never overwrite each other's text.
   */
  abstract get stringSlots(): number;

  /** See {@link Scene.enter}. */
  enter(): void {
    this.uiRevision++;
  }

  /** See {@link Scene.exit}. */
  exit(): void {}

  /** See {@link Scene.cover}. */
  cover(): void {}

  /** See {@link Scene.uncover}. */
  uncover(): void {
    this.uiRevision++;
  }

  /**
   * See {@link Scene.tick}.
   *
   * @param input - This tick's input snapshot (menus read the merged `flow.menuInput` instead).
   */
  abstract tick(input: InputSnapshot): void;

  /**
   * See {@link Scene.drawUi}.
   *
   * @param list - The UI draw list.
   */
  abstract drawUi(list: DrawList): void;
}

/**
 * The boot screen: a progress bar until the host finishes loading.
 *
 * @remarks
 * It holds until {@link SceneFlow.finishBoot}; the next tick replaces it with the title. The
 * browser shell finishes it right after its own loading phase (which it shows on its 2D overlay
 * bar, before the renderer exists), so in the apps the boot scene is only up for the first tick;
 * {@link SceneFlow.setBootProgress} is for hosts that load after the flow started.
 */
export class BootScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'boot' as const;
  /** Loading progress 0…1 shown by the bar. */
  progress = 0;
  /** Text above the bar. */
  label = 'LOADING';
  /** Set by {@link SceneFlow.finishBoot}: the next tick shows the title. */
  done = false;

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 1;
  }

  /** Moves on to the title once loading is done. */
  tick(): void {
    if (this.done) this.flow.stack.replace(this.flow.title);
  }

  /**
   * Draws the label and the bar.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    list.setString(this.stringBase, this.label);
    list.text(this.stringBase, CX, 96, UI_COLORS.text, TextAlign.Center);
    list.rect(CX - 80, 110, 160, 6, UI_COLORS.track);
    const w = Math.round(160 * (this.progress < 0 ? 0 : this.progress > 1 ? 1 : this.progress));
    if (w > 0) list.rect(CX - 80, 110, w, 6, UI_COLORS.title);
  }
}

/** Title phases. */
const TitlePhase = { Prompt: 0, Menu: 1 } as const;

/**
 * The title: logo, `PRESS OK`, then the mode select — 1 PLAYER / 2 PLAYERS / PRACTICE / OPTIONS /
 * SOUND TEST / EXIT (M2-15).
 *
 * @remarks
 * Draws the `ui/logo` sprite (or `SHMUP CUP` as text when the content lacks it), a `PRESS OK` that
 * blinks with a 32-tick half-period, and the session hi-score of the chosen difficulty (from the
 * save's best at start). OK opens the menu (locked for 2 ticks, focus on 1 PLAYER). 1 PLAYER /
 * 2 PLAYERS open the difficulty menu ({@link DifficultyScene}) over the title, which starts the
 * game; PRACTICE opens the {@link PracticeScene}, OPTIONS the {@link OptionsScene}, SOUND TEST the
 * {@link SoundTestScene} — all over the title; EXIT and Back open the exit confirmation when the
 * platform can exit — otherwise Back returns from the menu to `PRESS OK` (and does nothing on
 * `PRESS OK`). Entering the title always shows `PRESS OK` and queues the title music.
 *
 * **Attract loop (M2-15).** The title is one screen of the attract loop (shmup_feat.md §17): after
 * {@link TITLE_ATTRACT_TICKS} on `PRESS OK` without any input the loop moves on — the demo play
 * ({@link DemoScene}), the hi-score tables ({@link HiScoreScene}), the story crawl
 * ({@link StoryScene}) and back to the title; any input on those returns here.
 */
export class TitleScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'title' as const;
  /**
   * The title menu (1 PLAYER / 2 PLAYERS / OPTIONS / EXIT — EXIT only when the platform can quit;
   * M2-06 added 2 PLAYERS).
   */
  readonly menu: ListMenu;
  /** 0 = `PRESS OK`, 1 = the menu. */
  phase: number = TitlePhase.Prompt;
  /**
   * Ticks on `PRESS OK` without any input (M2-15): at {@link TITLE_ATTRACT_TICKS} the attract loop
   * moves on.
   */
  idle = 0;
  /** Ticks since the title (or its prompt) was shown — the blink's clock. */
  private ticks = 0;

  /**
   * Creates the title.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const items = ['1 PLAYER', '2 PLAYERS', 'PRACTICE', 'OPTIONS', 'SOUND TEST'];
    if (flow.host.exit !== null) items.push('EXIT');
    this.menu = createListMenu(items, {
      // Practice plays a campaign zone (M2-15).
      disabledMask: flow.host.content.campaign === null ? 1 << TitleItem.Practice : 0,
    });
  }

  /** Whether the menu is showing (else `PRESS OK`). */
  get menuOpen(): boolean {
    return this.phase === TitlePhase.Menu;
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 3 + menuStringSlots(this.menu);
  }

  /**
   * Back to `PRESS OK`, title music; the next run's start stage (the host config's) has its music
   * set prepared again when another stage's was prepared since (M2-10: a run through the zone
   * map, a practice run).
   */
  override enter(): void {
    super.enter();
    this.phase = TitlePhase.Prompt;
    this.ticks = 0;
    this.idle = 0;
    this.flow.music(MUSIC_CUES.Title, MUSIC_FADE_TICKS);
    this.flow.prepareStage(this.flow.host.config.stage);
  }

  /** The dialog closed (answered NO): the menu takes input again after a short lock. */
  override uncover(): void {
    super.uncover();
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * `PRESS OK` → menu (idle there: the attract loop); 1 PLAYER / 2 PLAYERS → the difficulty menu
   * (then the game — one player or a co-op game, M2-06); PRACTICE → the practice select; OPTIONS →
   * the Options screen; SOUND TEST → the sound test; EXIT / Back → exit confirmation (when the
   * platform can quit). Reads the merged menu input. Never allocates (the attract loop's demo
   * creates its World — a transition).
   */
  tick(): void {
    const flow = this.flow;
    const input = flow.menuInput;
    this.ticks++;
    if (this.phase === TitlePhase.Prompt) {
      if (this.ticks % PROMPT_BLINK_TICKS === 0) this.uiRevision++;
      this.idle = input.pressed !== 0 || input.held !== 0 ? 0 : this.idle + 1;
      if (this.idle >= TITLE_ATTRACT_TICKS) {
        this.idle = 0;
        flow.startAttract();
        return;
      }
      if ((input.pressed & Action.Back) !== 0) {
        if (flow.host.exit !== null) flow.ask(ConfirmPurpose.Exit);
        return;
      }
      if ((input.pressed & Action.Confirm) !== 0) {
        this.phase = TitlePhase.Menu;
        this.menu.open(MENU_OPEN_LOCK_TICKS);
        this.menu.focusFirstEnabled(TitleItem.Start);
        this.uiRevision++;
        flow.sfx(SFX_CUES.MenuSelect);
      }
      return;
    }
    const menu = this.menu;
    const before = menu.revision;
    const result = menuTick(menu, input);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      if (flow.host.exit !== null) {
        flow.ask(ConfirmPurpose.Exit);
      } else {
        this.phase = TitlePhase.Prompt;
        this.ticks = 0;
        this.uiRevision++;
        flow.sfx(SFX_CUES.MenuBack);
      }
      return;
    }
    if (result === MenuResult.Confirmed) {
      if (menu.focus === TitleItem.Start || menu.focus === TitleItem.TwoPlayers) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.practice.active = false;
        flow.choosePlayers(menu.focus === TitleItem.TwoPlayers);
        flow.stack.push(flow.difficultyMenu);
      } else if (menu.focus === TitleItem.Practice) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.push(flow.practiceSelect);
      } else if (menu.focus === TitleItem.Options) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.push(flow.options);
      } else if (menu.focus === TitleItem.SoundTest) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.push(flow.soundTest);
      } else if (menu.focus === TitleItem.Exit) {
        flow.ask(ConfirmPurpose.Exit);
      }
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the logo, the prompt or the menu, and the session hi-score.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const logo = this.flow.sprites.logo;
    list.setString(base, 'SHMUP CUP');
    list.setString(base + 1, 'PRESS OK');
    list.setString(base + 2, 'HI');
    if (logo >= 0) list.sprite(logo, 0, CX, 64);
    else list.text(base, CX, 60, UI_COLORS.focus, TextAlign.Center);
    if (this.phase === TitlePhase.Prompt) {
      if (Math.floor(this.ticks / PROMPT_BLINK_TICKS) % 2 === 0) {
        list.text(base + 1, CX, 136, UI_COLORS.text, TextAlign.Center);
      }
    } else {
      drawMenu(list, this.menu, base + 3, TITLE_MENU_LAYOUT);
    }
    list.text(base + 2, CX - 40, 196, UI_COLORS.focus);
    list.number(this.flow.hiScore, CX - 24, 196, 8, UI_COLORS.text);
  }
}

/**
 * The game: owns the World, draws the HUD and the WARNING band.
 *
 * @remarks
 * The only scene with the `'game'` binding context. Every `enter` (a game start) and every
 * {@link GameScene.restart} (RETRY STAGE) creates a **new World object** through the host — with
 * the config of the difficulty chosen under START, seeded the same way, so the same inputs replay
 * the same game — with that difficulty's session hi-score, and fades the music out (the new World
 * queues its stage theme). Under an overlay the World is not stepped, so it freezes. After the
 * World's status turns `stageClear` / `gameOver` it keeps running for
 * {@link STAGE_CLEAR_DELAY_TICKS} / {@link GAME_OVER_DELAY_TICKS} ticks (counted only while this
 * scene ticks) before the end screen opens — for a game over with continues left
 * (`core/world` `canContinue`) the {@link ContinueScene} instead of the game-over screen. The HUD
 * list ({@link GameScene.hudList}) is rebuilt by the flow's `updateFrame` through
 * {@link GameScene.hud}; `drawUi` only draws the boss
 * WARNING band (the one the flight scene drew before M1-16: black at alpha 144, red edges, the
 * World's text alternating red / yellow every 16 ticks).
 */
export class GameScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'game' as const;
  /** `'game'`: the gameplay binding table while the game is on top. */
  override readonly inputContext: InputContext = 'game';
  /** The HUD draw list (the frame's `hud` while the game is visible). */
  readonly hudList: DrawList = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
  /** The HUD's change detection. */
  readonly hud: Hud;
  /** The World being played (a placeholder before the first start). */
  world: World;
  /** Games started so far (retries included). */
  starts = 0;
  /** Ticks this scene has stepped the World since its status turned `stageClear` / `gameOver`. */
  private endTicks = 0;
  /** What the WARNING band shows: 0 nothing, 1 red text, 2 yellow text. */
  private warningLook = 0;
  /** Ticks since the World's bonus entrance opened (the warp — M2-10). */
  private bonusTicks = 0;
  /** Ticks since the first death in a bonus stage (M2-10). */
  private failTicks = 0;
  /** Whether the zone title card shows (M2-10): 0 no, 1 yes. */
  private cardLook = 0;
  /** The title card's first line (`ZONE B`, `BONUS STAGE`; built per World). */
  private cardTitle = '';
  /** The title card's second line (the zone's or stage's name). */
  private cardName = '';

  /**
   * Creates the scene with a placeholder World (so `world` is never null).
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    this.hud = createHud(flow.sprites);
    this.world = flow.host.createWorld();
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 3;
  }

  /**
   * A new game — a fresh run (counted as a game start) — or the next zone of the run the zone map
   * or practice prepared (M2-10): its World.
   */
  override enter(): void {
    super.enter();
    const flow = this.flow;
    const run = flow.run;
    if (run.pendingStart) {
      run.pendingStart = false;
    } else {
      flow.beginRun();
      flow.save.count('gamesStarted');
    }
    this.restart(false);
  }

  /** The game ends: its score joins the session hi-score. */
  override exit(): void {
    this.recordHiScore();
  }

  /**
   * Starts the run's current zone over with a fresh World (RETRY STAGE; with `retry` `false` the
   * start of a zone from {@link GameScene.enter}): the music fades out (the new World queues its
   * stage theme), the session hi-score carries over.
   *
   * @remarks
   * Allocates the new World (a scene transition, never a tick) through
   * `FlowControl.createRunWorld` with the zone's entry state (M2-10: the players carried in from
   * the zone before — none at a run's first zone). The old World's best score is recorded first
   * (into the session hi-score — the saved tables only take finished games); a retry counts the
   * old World's deaths and continues for the run, leaves a bonus stage (its lock lifted — the zone
   * starts over) and counts a game start in the save (written with the next save write); the
   * end-screen delay, the WARNING look and the bonus timers reset, the HUD is invalidated.
   *
   * @param retry - `true` (default) for RETRY STAGE.
   */
  restart(retry = true): void {
    this.recordHiScore();
    const flow = this.flow;
    const run = flow.run;
    if (retry) {
      run.noteWorldEnd(this.world);
      run.leaveBonus(false);
      flow.save.count('gamesStarted');
    }
    flow.music(MUSIC_CUES.Silence, MUSIC_FADE_TICKS);
    this.useWorld(flow.createRunWorld(run.entry));
    this.starts++;
  }

  /**
   * Plays another World from now on (M2-10: into a bonus stage and back — the stage's own theme
   * comes with it): the timers reset, the HUD is invalidated. A transition.
   *
   * @param world - The World (built by `FlowControl.createRunWorld`).
   */
  swapWorld(world: World): void {
    this.recordHiScore();
    this.useWorld(world);
  }

  /**
   * Makes a World the one this scene steps and draws.
   *
   * @param world - The World.
   */
  private useWorld(world: World): void {
    const flow = this.flow;
    const run = flow.run;
    // A practice run or a co-op game plays against its own table's best (M2-15 — one table per
    // mode); a one-player game against the session hi-score.
    const mode: HiScoreMode = run.practice ? 'practice' : world.config.coop ? '2p' : '1p';
    world.scoring.board.setHiScore(
      mode === '1p'
        ? flow.hiScore
        : Math.min(MAX_SCORE, flow.save.bestScore(hiScoreModeKey(world.config, mode))),
    );
    this.world = world;
    const campaign = run.campaign;
    this.cardTitle = 'STAGE';
    this.cardName = world.stage === null ? '' : world.stage.stage.name;
    if (run.inBonus) {
      this.cardTitle = 'BONUS STAGE';
    } else if (campaign !== null && run.zone >= 0) {
      const zone = campaign.zones[run.zone];
      this.cardTitle = 'ZONE ' + zone.label;
      this.cardName = zone.name;
    }
    this.endTicks = 0;
    this.warningLook = 0;
    this.bonusTicks = 0;
    this.failTicks = 0;
    this.cardLook = campaign !== null ? 1 : 0;
    this.hud.invalidate();
    this.uiRevision++;
  }

  /**
   * Raises the session hi-score of the World's power-up mode and difficulty (the one-player
   * tables') from the World's — not for a practice run or a co-op game (M2-15: their scores stay
   * in their own tables).
   */
  private recordHiScore(): void {
    const world = this.world;
    if (this.flow.run.practice || world.config.coop) return;
    const preset = DIFFICULTY_PRESETS.indexOf(world.config.difficulty);
    const mode = POWER_UP_MODES.indexOf(world.config.powerUpMode);
    const bests = this.flow.bests;
    const best = world.scoring.board.hiScore;
    const index = (mode >= 0 ? mode : 0) * DIFFICULTY_PRESETS.length + preset;
    if (preset >= 0 && best > bests[index]) bests[index] = best;
  }

  /**
   * Pause (or Back) opens the pause menu; otherwise the World advances one tick and its status
   * decides whether the stage-clear or game-over screen opens. Never allocates.
   *
   * @remarks
   * Pause / Back are read from every player's input (any player pauses); on that tick the World
   * does not step. The remote's game table binds Back to Pause anyway; Back is checked too so a
   * table that keeps `Action.Back` in the game context still pauses. In a co-op game (M2-06) the
   * press of a player who may drop in (`core/world` `playerCanJoin`) is its **join** instead
   * (`JOIN_ACTIONS` — the World brings it in), so it does not pause.
   *
   * @param input - This tick's input (the World gets it unmerged — per player).
   */
  tick(input: InputSnapshot): void {
    const flow = this.flow;
    const world = this.world;
    const players = input.players;
    for (let p = 0; p < players.length; p++) {
      const pressed = players[p].pressed;
      if ((pressed & (Action.Pause | Action.Back)) === 0) continue;
      if ((pressed & JOIN_ACTIONS) !== 0 && playerCanJoin(world, p)) continue;
      flow.sfx(SFX_CUES.PauseToggle);
      flow.stack.push(flow.pause);
      return;
    }
    stepWorld(world, input);
    const status = world.status;
    const run = flow.run;
    if (run.inBonus) {
      // A death in a bonus stage locks the players out (shmup_feat.md §14): back to the zone —
      // even when the bonus stage ends meanwhile (a death always comes before its clear screen:
      // BONUS_FAIL_TICKS < STAGE_CLEAR_DELAY_TICKS).
      if (worldDeaths(world) > 0) {
        this.failTicks++;
        if (this.failTicks >= BONUS_FAIL_TICKS) {
          flow.failBonus();
          return;
        }
      }
    } else if (world.bonus.entered >= 0 && (status === 'playing' || status === 'bossWarning')) {
      // A hidden entrance opened (M2-10): a short warp, then the bonus stage.
      this.bonusTicks++;
      if (this.bonusTicks >= BONUS_WARP_TICKS) {
        flow.enterBonus();
        return;
      }
    }
    const card = run.campaign !== null && world.tick < ZONE_CARD_TICKS ? 1 : 0;
    if (card !== this.cardLook) {
      this.cardLook = card;
      this.uiRevision++;
    }
    if (status === 'stageClear' || status === 'gameOver') {
      this.endTicks++;
      const delay = status === 'stageClear' ? STAGE_CLEAR_DELAY_TICKS : GAME_OVER_DELAY_TICKS;
      if (this.endTicks === delay) {
        flow.stack.push(
          status === 'stageClear'
            ? flow.stageClear
            : canContinue(world)
              ? flow.continueScreen
              : flow.gameOver,
        );
      }
    } else {
      this.endTicks = 0;
    }
    const warning = world.bosses.warning;
    const look = !warning.active ? 0 : ((warning.ticks >> 4) & 1) === 0 ? 1 : 2;
    if (look !== this.warningLook) {
      this.warningLook = look;
      this.uiRevision++;
    }
  }

  /**
   * Draws the zone title card at a campaign zone's start (M2-10 — `ZONE B` over the zone's name,
   * or `BONUS STAGE` over the bonus stage's, for {@link ZONE_CARD_TICKS} World ticks) and the boss
   * WARNING band while it plays (its text in red / yellow every 16 ticks).
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    if (this.cardLook === 1) this.drawCard(list);
    const look = this.warningLook;
    if (look === 0) return;
    list.setString(this.stringBase, this.world.bosses.warning.text);
    list.rect(0, WARNING_BAND_Y, 384, WARNING_BAND_H, 0x000000, 144);
    list.rect(0, WARNING_BAND_Y, 384, 1, UI_COLORS.alert);
    list.rect(0, WARNING_BAND_Y + WARNING_BAND_H - 1, 384, 1, UI_COLORS.alert);
    list.text(
      this.stringBase,
      CX,
      WARNING_BAND_Y + 9,
      look === 1 ? UI_COLORS.alert : UI_COLORS.focus,
      TextAlign.Center,
    );
  }

  /**
   * Draws the zone title card (its strings are built when a World starts, never here).
   *
   * @param list - The UI list.
   */
  private drawCard(list: DrawList): void {
    const base = this.stringBase;
    list.setString(base + 1, this.cardTitle);
    list.setString(base + 2, this.cardName);
    list.rect(0, ZONE_CARD_Y, 384, 32, 0x000000, 128);
    list.text(base + 1, CX, ZONE_CARD_Y + 5, UI_COLORS.focus, TextAlign.Center);
    list.text(base + 2, CX, ZONE_CARD_Y + 18, UI_COLORS.title, TextAlign.Center);
  }
}

/**
 * The pause menu: RESUME / OPTIONS / RETRY STAGE / QUIT TO TITLE.
 *
 * @remarks
 * An overlay over the frozen game, dimmed by {@link PAUSE_DIM}. Opening it focuses RESUME and locks
 * activation for 2 ticks (a buffered OK still counts). Pause, Back and RESUME close it with the
 * pause sound; RETRY STAGE restarts the game scene with a fresh World and closes it (no
 * confirmation); QUIT TO TITLE opens the {@link ConfirmDialog}, which is drawn over the still
 * visible menu. OPTIONS opens the {@link OptionsScene} over the menu (the game stays frozen).
 */
export class PauseScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'pause' as const;
  /** An overlay: the game stays visible (frozen) under it. */
  override readonly overlay = true;
  /** {@link PAUSE_DIM}. */
  override readonly dim = PAUSE_DIM;
  /** The pause menu. */
  readonly menu: ListMenu = createListMenu(['RESUME', 'OPTIONS', 'RETRY STAGE', 'QUIT TO TITLE']);

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 1 + menuStringSlots(this.menu);
  }

  /** Focus on RESUME. */
  override enter(): void {
    super.enter();
    this.menu.focus = PauseItem.Resume;
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /** The dialog closed: the menu takes input again. */
  override uncover(): void {
    super.uncover();
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /** Leaves the pause menu (back to the running game). */
  private resume(): void {
    this.flow.sfx(SFX_CUES.PauseToggle);
    this.flow.stack.pop();
  }

  /**
   * Pause / Back / RESUME resume; OPTIONS opens the Options screen; RETRY STAGE restarts; QUIT TO
   * TITLE asks first. Never allocates.
   */
  tick(): void {
    const flow = this.flow;
    const input = flow.menuInput;
    if ((input.pressed & Action.Pause) !== 0) {
      this.resume();
      return;
    }
    const menu = this.menu;
    const before = menu.revision;
    const result = menuTick(menu, input);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      this.resume();
      return;
    }
    if (result === MenuResult.Confirmed) {
      if (menu.focus === PauseItem.Resume) {
        this.resume();
      } else if (menu.focus === PauseItem.Options) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.push(flow.options);
      } else if (menu.focus === PauseItem.Retry) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.game.restart();
        flow.stack.pop();
      } else if (menu.focus === PauseItem.Quit) {
        flow.ask(ConfirmPurpose.QuitToTitle);
      }
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the panel, `PAUSE` and the menu.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    drawPanel(list, CX - 76, 60, 152, 84);
    list.setString(base, 'PAUSE');
    list.text(base, CX, 68, UI_COLORS.title, TextAlign.Center);
    drawMenu(list, this.menu, base + 1, PAUSE_MENU_LAYOUT);
  }
}

/**
 * The Options screen: MASTER / MUSIC / SFX sliders, CONTROLS (the input profile), BULLETS (the
 * enemy bullet colour set — plan M2-02), the display options SCALE (integer / fit / stretch),
 * SHAKE (on / off), FLASHES (normal / reduced) and HITBOX (off / on) — plan M2-08 —, BOSS HP
 * (off / on — the boss HP bar in the top HUD bar, plan M2-09), BACK
 * (shmup_feat.md §21, plan M1-17).
 *
 * @remarks
 * An overlay (dim {@link PAUSE_DIM}) with an opaque panel, opened from the title and from the pause
 * menu (both stay drawn under it; a game under the pause menu stays frozen). Opening it reads the
 * save's options into the sliders (levels `0…`{@link VOLUME_LEVELS}) and the profile in use into
 * CONTROLS, focuses MASTER and locks activation for 2 ticks. Every change applies **live**: a
 * slider pushes a `UserOption` event with its level (`MasterVolume` / `MusicVolume` /
 * `SfxVolume`), CONTROLS — Left / Right, or OK stepping forward, wrapping — one with the profile's
 * index (`InputProfile`), BULLETS one with the palette's index in `BULLET_PALETTES`
 * (`BulletPalette` — the host swaps the renderer's bullet sprites), SCALE / SHAKE / FLASHES /
 * HITBOX one with the choice's index (`ScaleMode` — the index in `SCALE_MODES` —,
 * `ScreenShake`, `ReduceFlashing`, `ShowHitbox` — 1 = on; the host applies them to the renderer —
 * SHAKE and HITBOX are toggles: Left = OFF, Right = ON, OK flips), BOSS HP one with 1 = on
 * (`BossHpBar`, M2-09 — a toggle; the game's HUD follows the saved value once the screen closes);
 * all play the move sound (at the new volume). BACK or the Back button stores the sliders, the
 * display options and — when it changed — the profile id in the save, writes the save when
 * anything differs from what is stored (`SaveStore.flush`), plays `MenuBack` and closes. CONTROLS
 * is disabled when the host offers no profiles (it then shows `DEFAULT`).
 */
export class OptionsScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'options' as const;
  /** An overlay: the title or the paused game stays visible under it. */
  override readonly overlay = true;
  /** {@link PAUSE_DIM}. */
  override readonly dim = PAUSE_DIM;
  /** MASTER level. */
  readonly master: Slider = createSlider(0, VOLUME_LEVELS, 1, VOLUME_LEVELS);
  /** MUSIC level. */
  readonly music: Slider = createSlider(0, VOLUME_LEVELS, 1, VOLUME_LEVELS);
  /** SFX level. */
  readonly sfx: Slider = createSlider(0, VOLUME_LEVELS, 1, VOLUME_LEVELS);
  /** CONTROLS: the profile labels (`DEFAULT` alone when the host offers none). */
  readonly controls: Choice;
  /** BULLETS: the enemy bullet colour set (`BULLET_PALETTES`, M2-02). */
  readonly bullets: Choice = createChoice(BULLET_PALETTE_LABELS, 0);
  /** SCALE: the scale mode (`SCALE_MODES`, M2-08). */
  readonly scale: Choice = createChoice(SCALE_MODE_LABELS, 0);
  /** SHAKE: screen shake on / off (M2-08). */
  readonly shake: Toggle = createToggle(true);
  /** FLASHES: 0 = normal, 1 = reduced flashing (M2-08). */
  readonly flashes: Choice = createChoice(FLASH_LABELS, 0);
  /** HITBOX: the ships' hitbox markers on / off (M2-08). */
  readonly hitbox: Toggle = createToggle(false);
  /** BOSS HP: the boss HP bar on / off (M2-09). */
  readonly bossHp: Toggle = createToggle(false);
  /** The menu. */
  readonly menu: ListMenu;
  /** The CONTROLS index when the screen opened (a different one on close is saved). */
  private openedProfile = 0;

  /**
   * Creates the screen.
   *
   * @param flow - The flow (its profile choices must be set).
   */
  constructor(flow: FlowControl) {
    super(flow);
    const profiles = flow.profiles;
    const labels: string[] = [];
    for (const profile of profiles) labels.push(profile.label);
    if (labels.length === 0) labels.push('DEFAULT');
    this.controls = createChoice(labels, 0);
    this.menu = createListMenu(
      [
        { label: 'MASTER', slider: this.master },
        { label: 'MUSIC', slider: this.music },
        { label: 'SFX', slider: this.sfx },
        { label: 'CONTROLS', choice: this.controls },
        { label: 'BULLETS', choice: this.bullets },
        { label: 'SCALE', choice: this.scale },
        { label: 'SHAKE', toggle: this.shake },
        { label: 'FLASHES', choice: this.flashes },
        { label: 'HITBOX', toggle: this.hitbox },
        { label: 'BOSS HP', toggle: this.bossHp },
        'BACK',
      ],
      { disabledMask: profiles.length === 0 ? 1 << OptionsItem.Controls : 0 },
    );
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 1 + menuStringSlots(this.menu);
  }

  /** Reads the save's volumes and the profile in use; focus on MASTER, locked for 2 ticks. */
  override enter(): void {
    super.enter();
    const flow = this.flow;
    const audio = flow.save.options.audio;
    this.master.value = audio.master;
    this.music.value = audio.music;
    this.sfx.value = audio.sfx;
    this.controls.index = flow.activeProfile >= 0 ? flow.activeProfile : 0;
    this.openedProfile = this.controls.index;
    const display = flow.save.options.display;
    const palette = BULLET_PALETTES.indexOf(display.bulletPalette);
    this.bullets.index = palette >= 0 ? palette : 0;
    const scale = SCALE_MODES.indexOf(display.scaleMode);
    this.scale.index = scale >= 0 ? scale : 0;
    this.shake.value = display.screenShake;
    this.flashes.index = display.reduceFlashing ? 1 : 0;
    this.hitbox.value = display.showHitbox;
    this.bossHp.value = display.bossHpBar;
    this.menu.focus = OptionsItem.Master;
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * Stores the options in the save, writes it when anything changed, and closes the screen.
   */
  private close(): void {
    const flow = this.flow;
    const save = flow.save;
    const chosen = this.controls.index;
    const profileId =
      chosen !== this.openedProfile && chosen < flow.profiles.length
        ? flow.profiles[chosen].id
        : save.options.input.profileId;
    const options: UserOptions = {
      audio: { master: this.master.value, music: this.music.value, sfx: this.sfx.value },
      input: { profileId },
      display: {
        bulletPalette: BULLET_PALETTES[this.bullets.index] ?? 'standard',
        scaleMode: SCALE_MODES[this.scale.index] ?? 'integer',
        screenShake: this.shake.value,
        reduceFlashing: this.flashes.index === 1,
        showHitbox: this.hitbox.value,
        bossHpBar: this.bossHp.value,
      },
    };
    save.setOptions(options);
    void save.flush();
    flow.sfx(SFX_CUES.MenuBack);
    flow.stack.pop();
  }

  /**
   * Moves the focus, applies a changed slider or profile at once, BACK / Back saves and closes.
   * Never allocates (closing builds the options object — a menu action, not a tick path).
   */
  tick(): void {
    const flow = this.flow;
    const menu = this.menu;
    const before = menu.revision;
    const result = menuTick(menu, flow.menuInput);
    if (menu.revision !== before) this.uiRevision++;
    if (
      result === MenuResult.Back ||
      (result === MenuResult.Confirmed && menu.focus === OptionsItem.Back)
    ) {
      this.close();
      return;
    }
    if (result === MenuResult.Changed) {
      switch (menu.focus) {
        case OptionsItem.Master:
          flow.userOption(UserOptionKind.MasterVolume, this.master.value);
          break;
        case OptionsItem.Music:
          flow.userOption(UserOptionKind.MusicVolume, this.music.value);
          break;
        case OptionsItem.Sfx:
          flow.userOption(UserOptionKind.SfxVolume, this.sfx.value);
          break;
        case OptionsItem.Controls:
          flow.activeProfile = this.controls.index;
          flow.userOption(UserOptionKind.InputProfile, this.controls.index);
          break;
        case OptionsItem.Bullets:
          flow.userOption(UserOptionKind.BulletPalette, this.bullets.index);
          break;
        case OptionsItem.Scale:
          flow.userOption(UserOptionKind.ScaleMode, this.scale.index);
          break;
        case OptionsItem.Shake:
          flow.userOption(UserOptionKind.ScreenShake, this.shake.value ? 1 : 0);
          break;
        case OptionsItem.Flashes:
          flow.userOption(UserOptionKind.ReduceFlashing, this.flashes.index);
          break;
        case OptionsItem.Hitbox:
          flow.userOption(UserOptionKind.ShowHitbox, this.hitbox.value ? 1 : 0);
          break;
        case OptionsItem.BossHp:
          flow.userOption(UserOptionKind.BossHpBar, this.bossHp.value ? 1 : 0);
          break;
        default:
          break;
      }
    }
    // OK on a slider changes nothing and makes no sound.
    if (result === MenuResult.Confirmed) return;
    flow.menuSound(result);
  }

  /**
   * Draws the panel, `OPTIONS` and the menu.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const p = OPTIONS_PANEL;
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    list.setString(base, 'OPTIONS');
    list.text(base, CX, p.y + 8, UI_COLORS.title, TextAlign.Center);
    drawMenu(list, this.menu, base + 1, OPTIONS_MENU_LAYOUT);
  }
}

/** Stage-clear phases. */
const ClearPhase = { Tally: 0, Continued: 1 } as const;

/** Where the stage-clear screen goes after its tally (M2-10). */
const ClearNext = {
  /** `TO BE CONTINUED`, then the title (a single-stage run — the M1 screen). */
  Continued: 0,
  /** The zone map (a campaign zone with exits). */
  Map: 1,
  /** The ending (the campaign's final zone). */
  Ending: 2,
  /** The title (a practice run). */
  Title: 3,
} as const;

/**
 * Stage clear: the tally, then `TO BE CONTINUED` (a single stage — M1), or — in a campaign run —
 * the **zone result tally** and then the zone map, the ending or the title (M2-10).
 *
 * @remarks
 * An overlay (dim 0.25) over the frozen game (the ships flew out — `core/player` `flyOutPlayer`).
 * Queues the stage-clear jingle with no fade (a boss's death already started it; the music player
 * does not restart a playing track).
 *
 * - **A single-stage run** (no campaign): a panel with `STAGE CLEAR`, player 1's score and the
 *   hi-score for {@link STAGE_CLEAR_TALLY_TICKS}, then `TO BE CONTINUED` for
 *   {@link STAGE_CLEAR_CONTINUED_TICKS}, then the name entry (a new hi-score — M2-15) or the
 *   title; OK skips each phase at once (Back does
 *   nothing). Entering it ends the run: the score goes into the saved hi-score table and the save
 *   is written.
 * - **A campaign zone** (M2-10): entering it tallies the zone (`ZoneResult`: the kill rate and the
 *   boss time bonus, paid to every player in play — `awardZoneBonus`), counts the World's deaths,
 *   continues and flags for the run, and carries the players' state out (`captureCarry`). The panel
 *   shows `ZONE X CLEAR` (`BONUS STAGE CLEAR` after a bonus stage — which skipped the zone's
 *   boss), the zone's name, the score(s), the kill rate and both bonuses for
 *   {@link ZONE_TALLY_TICKS} (OK skips). Then: a zone with exits → the zone map (counted as a
 *   cleared stage in the save); the final zone → the ending picked by `core/data`
 *   `selectCampaignEnding` from the run's flags (the run is recorded now); a practice run → the
 *   name entry or the title (M2-15: recorded in the practice table).
 */
export class StageClearScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'stageClear' as const;
  /** An overlay: the game stays visible (frozen) under it. */
  override readonly overlay = true;
  /** A light dim (0.25), so the final picture stays readable. */
  override readonly dim = 0.25;
  /** 0 = tally, 1 = `TO BE CONTINUED`. */
  phase: number = ClearPhase.Tally;
  /** Ticks in the current phase. */
  ticks = 0;
  /** Player 1's rank in the saved table (0 = best), or -1 when the score did not enter. */
  rank = -1;
  /** Whether the screen is the zone result tally of a campaign run (M2-10). */
  zoneMode = false;
  /** Where the screen goes after the tally (a `ClearNext` code). */
  next: number = ClearNext.Continued;
  /** The zone tally's title (`ZONE B CLEAR`, `BONUS STAGE CLEAR`; built when it opens). */
  private title = '';
  /** The zone's name. */
  private zoneName = '';

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 14;
  }

  /**
   * The tally starts — a single stage records the run; a campaign zone is tallied, paid and
   * carried out (see the class docs); the stage-clear jingle plays (not restarted when already
   * playing).
   */
  override enter(): void {
    super.enter();
    this.phase = ClearPhase.Tally;
    this.ticks = 0;
    const flow = this.flow;
    const run = flow.run;
    const campaign = run.campaign;
    this.zoneMode = campaign !== null;
    this.rank = -1;
    if (campaign === null) {
      this.next = ClearNext.Continued;
      this.rank = flow.recordRun(true);
    } else {
      const world = flow.game.world;
      const bonus = run.inBonus;
      tallyZone(world, run.result, bonus);
      awardZoneBonus(world, run.result);
      run.noteWorldEnd(world);
      if (bonus) run.flags |= RunFlag.Bonus;
      captureCarry(world, run.carry);
      const zone = run.zone >= 0 ? campaign.zones[run.zone] : null;
      this.title = bonus
        ? 'BONUS STAGE CLEAR'
        : 'ZONE ' + (zone === null ? '' : zone.label) + ' CLEAR';
      this.zoneName = zone === null ? '' : zone.name;
      if (run.practice) {
        // A practice clear goes into the practice table (M2-15), then the title.
        this.next = ClearNext.Title;
        this.rank = flow.recordRun(true);
      } else if (run.finalZone) {
        this.next = ClearNext.Ending;
        run.ending = selectCampaignEnding(campaign, run.zone, run.endingFlags);
        this.rank = flow.recordRun(true);
      } else {
        this.next = ClearNext.Map;
        flow.save.count('stagesCleared');
        void flow.save.flush();
      }
    }
    flow.music(MUSIC_CUES.StageClear, 0);
  }

  /**
   * Single stage: tally → `TO BE CONTINUED` → title, by time or OK. Campaign zone: tally → the map,
   * the ending or the title, by time or OK.
   */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    const ok = (flow.menuInput.pressed & Action.Confirm) !== 0;
    if (this.zoneMode) {
      if (ok || this.ticks >= ZONE_TALLY_TICKS) {
        if (ok) flow.sfx(SFX_CUES.MenuSelect);
        if (this.next === ClearNext.Map) flow.stack.reset(flow.map);
        else if (this.next === ClearNext.Ending) flow.stack.reset(flow.ending);
        else flow.finishGame();
      }
      return;
    }
    if (this.phase === ClearPhase.Tally) {
      if (ok || this.ticks >= STAGE_CLEAR_TALLY_TICKS) {
        this.phase = ClearPhase.Continued;
        this.ticks = 0;
        this.uiRevision++;
        if (ok) flow.sfx(SFX_CUES.MenuSelect);
      }
      return;
    }
    if (ok || this.ticks >= STAGE_CLEAR_CONTINUED_TICKS) {
      if (ok) flow.sfx(SFX_CUES.MenuSelect);
      flow.finishGame();
    }
  }

  /**
   * Draws `STAGE CLEAR` with the score (both players' in a co-op game — M2-06) and hi-score, or
   * `TO BE CONTINUED` — or the zone result tally of a campaign run (M2-10).
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    if (this.zoneMode) {
      this.drawZoneTally(list);
      return;
    }
    const base = this.stringBase;
    const world = this.flow.game.world;
    drawPanel(list, CX - 88, 64, 176, 72);
    list.setString(base, 'STAGE CLEAR');
    list.setString(base + 1, 'SCORE');
    list.setString(base + 2, 'HI');
    list.setString(base + 3, 'TO BE CONTINUED');
    list.setString(base + 4, '1P');
    list.setString(base + 5, '2P');
    if (this.phase === ClearPhase.Tally) {
      const scores = world.scoring.board.scores;
      list.text(base, CX, 74, UI_COLORS.focus, TextAlign.Center);
      if (world.players.length > 1 && world.players[1].active && scores.length > 1) {
        // Co-op (M2-06): both players' scores.
        list.text(base + 4, CX - 64, 90, UI_COLORS.title);
        list.number(scores[0].score, CX + 64, 90, 8, UI_COLORS.text, 2);
        list.text(base + 5, CX - 64, 102, UI_COLORS.title);
        list.number(scores[1].score, CX + 64, 102, 8, UI_COLORS.text, 2);
        list.text(base + 2, CX - 64, 116, UI_COLORS.focus);
        list.number(world.scoring.board.hiScore, CX + 64, 116, 8, UI_COLORS.text, 2);
        return;
      }
      list.text(base + 1, CX - 64, 96, UI_COLORS.title);
      list.number(scores[0].score, CX + 64, 96, 8, UI_COLORS.text, 2);
      list.text(base + 2, CX - 64, 110, UI_COLORS.focus);
      list.number(world.scoring.board.hiScore, CX + 64, 110, 8, UI_COLORS.text, 2);
    } else {
      list.text(base + 3, CX, 96, UI_COLORS.focus, TextAlign.Center);
    }
  }

  /**
   * Draws the zone result tally (M2-10): title, zone name, score(s), kill rate and bonuses.
   *
   * @param list - The UI list.
   */
  private drawZoneTally(list: DrawList): void {
    const base = this.stringBase + 6;
    const world = this.flow.game.world;
    const result = this.flow.run.result;
    const scores = world.scoring.board.scores;
    const coop = world.players.length > 1 && world.players[1].active && scores.length > 1;
    const left = CX - 92;
    const right = CX + 92;
    drawPanel(list, CX - 100, 44, 200, coop ? 124 : 112);
    list.setString(base, this.title);
    list.setString(base + 1, this.zoneName);
    list.setString(base + 2, coop ? '1P' : 'SCORE');
    list.setString(base + 3, '2P');
    list.setString(base + 4, 'KILLS');
    list.setString(base + 5, '%');
    list.setString(base + 6, 'KILL BONUS');
    list.setString(base + 7, result.bossSeconds >= 0 ? 'TIME BONUS' : 'NO BOSS TIME');
    list.text(base, CX, 52, UI_COLORS.focus, TextAlign.Center);
    list.text(base + 1, CX, 64, UI_COLORS.title, TextAlign.Center);
    let y = 82;
    list.text(base + 2, left, y, UI_COLORS.title);
    list.number(scores[0].score, right, y, 8, UI_COLORS.text, TextAlign.Right);
    if (coop) {
      y += 12;
      list.text(base + 3, left, y, UI_COLORS.title);
      list.number(scores[1].score, right, y, 8, UI_COLORS.text, TextAlign.Right);
    }
    y += 18;
    list.text(base + 4, left, y, UI_COLORS.text);
    list.number(result.killPercent, right - 8, y, 0, UI_COLORS.text, TextAlign.Right);
    list.text(base + 5, right, y, UI_COLORS.text, TextAlign.Right);
    y += 12;
    list.text(base + 6, left, y, UI_COLORS.text);
    list.number(result.killBonus, right, y, 0, UI_COLORS.focus, TextAlign.Right);
    y += 12;
    list.text(base + 7, left, y, UI_COLORS.text);
    list.number(result.timeBonus, right, y, 0, UI_COLORS.focus, TextAlign.Right);
  }
}

/**
 * Game over: OK (after a short lock) or 10 s → the name entry (a new hi-score — M2-15) or the
 * title.
 *
 * @remarks
 * An overlay (dim 0.35) over the frozen game: a red-edged panel with `GAME OVER` and player 1's
 * final score, the game-over music. OK or Back are ignored for {@link GAME_OVER_LOCK_TICKS}
 * ticks (a mashed button does not skip it), then move on — to the {@link NameEntryScene} when the
 * score entered its table, else the title; after {@link GAME_OVER_TIMEOUT_TICKS} it moves on by
 * itself. Entering it records the run: the score goes
 * into the saved hi-score table (`NEW HI-SCORE` under the panel when it is the new best) and the
 * save is written; the score joins the session hi-score when the game scene leaves the stack.
 */
export class GameOverScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'gameOver' as const;
  /** An overlay: the game stays visible (frozen) under it. */
  override readonly overlay = true;
  /** Dim 0.35. */
  override readonly dim = 0.35;
  /** Ticks since it opened. */
  ticks = 0;
  /** Player 1's rank in the saved table (0 = best), or -1 when the score did not enter. */
  rank = -1;

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 5;
  }

  /** Records the run (and saves), game-over music. */
  override enter(): void {
    super.enter();
    this.ticks = 0;
    this.rank = this.flow.recordRun(false);
    this.flow.music(MUSIC_CUES.GameOver, 0);
  }

  /** OK / Back after the lock, or the timeout → title. */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    const pressed = flow.menuInput.pressed & (Action.Confirm | Action.Back);
    if (
      (pressed !== 0 && this.ticks > GAME_OVER_LOCK_TICKS) ||
      this.ticks >= GAME_OVER_TIMEOUT_TICKS
    ) {
      if (pressed !== 0) flow.sfx(SFX_CUES.MenuSelect);
      flow.finishGame();
    }
  }

  /**
   * Draws `GAME OVER`, the final score (both players' in a co-op game — M2-06) and — when it is
   * the new best — `NEW HI-SCORE`.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const world = this.flow.game.world;
    const scores = world.scoring.board.scores;
    const coop = world.players.length > 1 && world.players[1].active && scores.length > 1;
    drawPanel(list, CX - 72, 80, 144, coop ? 56 : 44, UI_COLORS.panel, UI_COLORS.alert);
    list.setString(base, 'GAME OVER');
    list.setString(base + 1, 'SCORE');
    list.setString(base + 2, 'NEW HI-SCORE');
    list.setString(base + 3, '1P');
    list.setString(base + 4, '2P');
    list.text(base, CX, 88, UI_COLORS.alert, TextAlign.Center);
    if (coop) {
      // Co-op (M2-06): both players' final scores.
      if (this.rank === 0) list.text(base + 2, CX, 142, UI_COLORS.focus, TextAlign.Center);
      list.text(base + 3, CX - 56, 104, UI_COLORS.title);
      list.number(scores[0].score, CX + 56, 104, 8, UI_COLORS.text, 2);
      list.text(base + 4, CX - 56, 116, UI_COLORS.title);
      list.number(scores[1].score, CX + 56, 116, 8, UI_COLORS.text, 2);
      return;
    }
    if (this.rank === 0) list.text(base + 2, CX, 130, UI_COLORS.focus, TextAlign.Center);
    list.text(base + 1, CX - 56, 106, UI_COLORS.title);
    list.number(scores[0].score, CX + 56, 106, 8, UI_COLORS.text, 2);
  }
}

/**
 * The YES / NO dialog (exit confirmation, quit to title).
 *
 * @remarks
 * An overlay over whatever asked (the title, the pause menu — both stay drawn under its opaque
 * panel), focused on **NO** and locked for 2 ticks when it opens. Left / Up focus YES, Right /
 * Down focus NO. YES with purpose `Exit` pops the dialog and then calls the host's `exit` (so the
 * title is on top if the platform does not quit at once); YES with `QuitToTitle` resets the stack
 * to the title (the game's score joins the session hi-score). NO and Back close it with
 * `MenuBack`.
 */
export class ConfirmDialog extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'confirm' as const;
  /** An overlay: the scene that asked stays visible under it. */
  override readonly overlay = true;
  /** {@link PAUSE_DIM}. */
  override readonly dim = PAUSE_DIM;
  /** The prompt (focused on NO when opened). */
  readonly prompt: Confirm = createConfirm('');
  /** Why it is open. */
  purpose: ConfirmPurpose = ConfirmPurpose.Exit;

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return CONFIRM_STRING_SLOTS;
  }

  /**
   * Sets the question for a purpose (before the push).
   *
   * @param purpose - Why the dialog opens.
   */
  prepare(purpose: ConfirmPurpose): void {
    this.purpose = purpose;
    this.prompt.open(
      purpose === ConfirmPurpose.Exit ? 'EXIT SHMUP CUP?' : 'QUIT TO TITLE?',
      MENU_OPEN_LOCK_TICKS,
    );
    this.uiRevision++;
  }

  /**
   * YES runs the purpose (exit / back to the title); NO and Back close the dialog. Never
   * allocates.
   */
  tick(): void {
    const flow = this.flow;
    const prompt = this.prompt;
    const before = prompt.revision;
    const result = confirmTick(prompt, flow.menuInput);
    if (prompt.revision !== before) this.uiRevision++;
    if (result === MenuResult.Confirmed && prompt.focus === ConfirmChoice.Yes) {
      flow.sfx(SFX_CUES.MenuSelect);
      if (this.purpose === ConfirmPurpose.QuitToTitle) {
        flow.toTitle();
        return;
      }
      flow.stack.pop();
      const exit = flow.host.exit;
      if (exit !== null) exit();
      return;
    }
    if (result === MenuResult.Confirmed || result === MenuResult.Back) {
      flow.sfx(SFX_CUES.MenuBack);
      flow.stack.pop();
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the prompt in the middle of the screen.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    drawConfirm(list, this.prompt, this.stringBase, CX, 108);
  }
}

/** Where the difficulty menu is drawn (inside its panel). */
const DIFFICULTY_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: CX,
  y: 78,
  align: TextAlign.Center,
  cursorX: CX - 44,
});

/** The difficulty menu's panel: left, top, width, height. */
const DIFFICULTY_PANEL = Object.freeze({ x: CX - 88, y: 56, w: 176, h: 112 });

/** The labels of the difficulty menu, in {@link DIFFICULTY_PRESETS} order. */
const DIFFICULTY_LABELS: readonly string[] = Object.freeze(['EASY', 'NORMAL', 'HARD', 'ARCADE']);

/**
 * The difficulty menu under START (shmup_feat.md §16 "difficulty select", plan M2-01): EASY /
 * NORMAL / HARD / ARCADE.
 *
 * @remarks
 * An overlay over the title (dim {@link PAUSE_DIM}) with an opaque panel: `DIFFICULTY`, the four
 * presets, and for the focused one its starting lives, continues and saved / session hi-score
 * (from the flow's per-preset configs — `core/config` `withDifficulty`). Opening it focuses the
 * difficulty chosen last (at first the host config's) and locks activation for 2 ticks. OK
 * chooses the focused preset and opens the {@link ShipSelectScene} (M2-05; then the
 * {@link WeaponSelectScene} of M2-03 for a meter ship), whose choice starts the game on that
 * preset's config — with a single ship in the content the ship select is skipped: the weapon
 * select opens (a Direct-mode config starts the game at once); Back closes it (the title menu
 * takes input again). Up / Down move the focus (wrapping, auto-repeat) with the move sound.
 */
export class DifficultyScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'difficulty' as const;
  /** An overlay: the title stays visible under it. */
  override readonly overlay = true;
  /** {@link PAUSE_DIM}. */
  override readonly dim = PAUSE_DIM;
  /** The presets, in {@link DIFFICULTY_PRESETS} order. */
  readonly menu: ListMenu = createListMenu(DIFFICULTY_LABELS.slice());

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 4 + menuStringSlots(this.menu);
  }

  /** The preset the focus is on. */
  get focused(): DifficultyPreset {
    return DIFFICULTY_PRESETS[this.menu.focus] ?? 'normal';
  }

  /** Focus on the difficulty chosen last, locked for 2 ticks. */
  override enter(): void {
    super.enter();
    const index = DIFFICULTY_PRESETS.indexOf(this.flow.difficulty);
    this.menu.focus = index >= 0 ? index : 0;
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /** OK chooses and opens the ship select; Back closes the menu. Never allocates. */
  tick(): void {
    const flow = this.flow;
    const menu = this.menu;
    const before = menu.revision;
    const result = menuTick(menu, flow.menuInput);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      flow.sfx(SFX_CUES.MenuBack);
      flow.stack.pop();
      return;
    }
    if (result === MenuResult.Confirmed) {
      flow.sfx(SFX_CUES.MenuSelect);
      flow.chooseDifficulty(this.focused);
      // With a single ship there is nothing to choose (M2-05): straight to what it plays with.
      if (flow.ships.length > 1) flow.stack.push(flow.shipSelect);
      else if (flow.worldConfig.powerUpMode === 'direct') flow.launchGame();
      else flow.stack.push(flow.weaponSelect);
      return;
    }
    flow.menuSound(result);
  }

  /** Back from the ship select: the menu takes input again after a short lock. */
  override uncover(): void {
    super.uncover();
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * Draws the panel, `DIFFICULTY`, the presets and the focused preset's lives, continues and
   * hi-score (of the chosen ship's power-up mode).
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const p = DIFFICULTY_PANEL;
    const index = this.menu.focus;
    const config = this.flow.configs[index] ?? this.flow.worldConfig;
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    list.setString(base, 'DIFFICULTY');
    list.setString(base + 1, 'LIVES');
    list.setString(base + 2, 'CONTINUES');
    list.setString(base + 3, 'HI');
    list.text(base, CX, p.y + 8, UI_COLORS.title, TextAlign.Center);
    drawMenu(list, this.menu, base + 4, DIFFICULTY_MENU_LAYOUT);
    const y = p.y + p.h - 26;
    list.text(base + 1, p.x + 12, y, UI_COLORS.title);
    list.number(config.startingLives, p.x + 60, y, 0, UI_COLORS.text);
    list.text(base + 2, p.x + 80, y, UI_COLORS.title);
    list.number(config.continues, p.x + 164, y, 0, UI_COLORS.text, TextAlign.Right);
    list.text(base + 3, p.x + 12, y + 12, UI_COLORS.focus);
    const best = this.flow.bests[this.flow.bestIndex(this.focused)] ?? 0;
    list.number(best, p.x + 164, y + 12, 8, UI_COLORS.text, TextAlign.Right);
  }
}

/**
 * The continue countdown (shmup_feat.md §10 continues, §17 "continue countdown"; plan M2-01,
 * polished in M2-15).
 *
 * @remarks
 * An overlay (dim 0.35) over the frozen game, pushed instead of the game-over screen when the game
 * is over and continues are left (`core/world` `canContinue`). It fades the music out and counts
 * down {@link CONTINUE_COUNTDOWN_TICKS} ticks, showing the seconds left (9 … 0, a tick sound on
 * every change; the last three flash) over a draining time bar, the score and the continues left,
 * and — once OK counts — a blinking `PRESS OK` and `BACK: GIVE UP`. After {@link CONTINUE_LOCK_TICKS} ticks OK continues —
 * `continueWorld`: the stage restarts at its last checkpoint with fresh lives, the score's last
 * digit counts the continue — and closes the countdown (the game runs on); Back gives up. Giving up
 * or running out of time replaces it with the {@link GameOverScene} (which records the run). In a
 * co-op game (M2-06) each player's OK continues that player with its own continues (the panel
 * shows both players' credits); a player who does not press stays out and may drop back in later.
 */
export class ContinueScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'continue' as const;
  /** An overlay: the game stays visible (frozen) under it. */
  override readonly overlay = true;
  /** Dim 0.35. */
  override readonly dim = 0.35;
  /** Ticks since it opened. */
  ticks = 0;

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 7;
  }

  /** Seconds left on the countdown: 9 … 0. */
  get seconds(): number {
    const left = CONTINUE_COUNTDOWN_TICKS - this.ticks;
    return left > 0 ? Math.floor((left - 1) / 60) : 0;
  }

  /** The countdown starts; the music fades out. */
  override enter(): void {
    super.enter();
    this.ticks = 0;
    this.flow.music(MUSIC_CUES.Silence, MUSIC_FADE_TICKS);
  }

  /**
   * OK continues, Back or the timeout gives up (after the lock). In a co-op game (M2-06) OK
   * continues only the players who pressed it (each with its own continues — `core/world`
   * `continueWorld`'s `who`); the others stay out and may drop in later. Never allocates.
   *
   * @param input - This tick's input (per player: whose OK it was).
   */
  tick(input: InputSnapshot): void {
    const flow = this.flow;
    const before = this.seconds;
    this.ticks++;
    if (this.seconds !== before) {
      this.uiRevision++;
      flow.sfx(SFX_CUES.MenuMove);
    }
    // The draining bar (every 6 ticks), the prompt's blink and the last seconds' flash (M2-15).
    if (this.ticks % 6 === 0 || this.ticks === CONTINUE_LOCK_TICKS + 1) this.uiRevision++;
    const pressed = this.ticks > CONTINUE_LOCK_TICKS ? flow.menuInput.pressed : 0;
    if ((pressed & Action.Confirm) !== 0) {
      const world = flow.game.world;
      let who = 0;
      if (world.config.coop) {
        const players = input.players;
        for (let p = 0; p < players.length; p++) {
          if ((players[p].pressed & Action.Confirm) !== 0) who |= 1 << p;
        }
      } else {
        who = -1; // One player: any controller's OK.
      }
      if (continueWorld(world, who)) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.pop();
        return;
      }
    }
    if ((pressed & Action.Back) !== 0 || this.ticks >= CONTINUE_COUNTDOWN_TICKS) {
      if ((pressed & Action.Back) !== 0) flow.sfx(SFX_CUES.MenuBack);
      flow.stack.replace(flow.gameOver);
    }
  }

  /**
   * Draws `CONTINUE?`, the seconds left and the continues left — each player's in a co-op game
   * (M2-06).
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const world = this.flow.game.world;
    const scores = world.scoring.board.scores;
    drawPanel(list, CX - 80, 60, 160, 96, UI_COLORS.panel, UI_COLORS.alert);
    list.setString(base, 'CONTINUE?');
    list.setString(base + 1, 'CREDITS');
    list.setString(base + 2, '1P');
    list.setString(base + 3, '2P');
    list.setString(base + 4, 'PRESS OK');
    list.setString(base + 5, 'SCORE');
    list.setString(base + 6, 'BACK: GIVE UP');
    list.text(base, CX, 68, UI_COLORS.focus, TextAlign.Center);
    // The seconds (M2-15 polish): the last three flash red / yellow, a bar drains under them.
    const seconds = this.seconds;
    const flash = seconds < 3 && ((this.ticks >> 3) & 1) === 1;
    list.number(seconds, CX, 82, 0, flash ? UI_COLORS.focus : UI_COLORS.alert, TextAlign.Center);
    const left = CONTINUE_COUNTDOWN_TICKS - this.ticks;
    const bar = left > 0 ? Math.floor((120 * left) / CONTINUE_COUNTDOWN_TICKS) : 0;
    list.rect(CX - 60, 94, 120, 3, UI_COLORS.track);
    if (bar > 0) list.rect(CX - 60, 94, bar, 3, seconds < 3 ? UI_COLORS.alert : UI_COLORS.title);
    const coop = world.config.coop && world.players.length > 1 && world.players[1].active;
    if (coop) {
      // Co-op (M2-06): each player's own continues.
      list.text(base + 2, CX - 64, 106, UI_COLORS.title);
      list.number(continuesLeft(world, 0), CX - 16, 106, 0, UI_COLORS.text, TextAlign.Right);
      list.text(base + 3, CX + 16, 106, UI_COLORS.title);
      list.number(continuesLeft(world, 1), CX + 64, 106, 0, UI_COLORS.text, TextAlign.Right);
    } else {
      list.text(base + 5, CX - 64, 104, UI_COLORS.title);
      list.number(scores[0].score, CX + 64, 104, 8, UI_COLORS.text, TextAlign.Right);
      list.text(base + 1, CX - 64, 116, UI_COLORS.title);
      list.number(continuesLeft(world, 0), CX + 64, 116, 0, UI_COLORS.text, TextAlign.Right);
    }
    if (this.ticks > CONTINUE_LOCK_TICKS) {
      if (Math.floor(this.ticks / PROMPT_BLINK_TICKS) % 2 === 0) {
        list.text(base + 4, CX, 130, UI_COLORS.focus, TextAlign.Center);
      }
      list.text(base + 6, CX, 142, UI_COLORS.disabled, TextAlign.Center);
    }
  }
}

// ------------------------------------------------------------------------------ ship select

/**
 * The ship select's line for each power-up model, in `POWER_UP_MODES` order (M2-05): what the
 * focused ship plays with.
 */
export const SHIP_MODE_LABELS: readonly string[] = Object.freeze(['POWER METER', 'DIRECT ITEMS']);

/**
 * The ship select's three hint lines for each power-up model, in `POWER_UP_MODES` order (M2-05).
 */
export const SHIP_MODE_HINTS: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(['CAPSULES MOVE THE METER', 'OK EQUIPS THE LIT SLOT', 'OPTIONS COPY YOUR FIRE']),
  Object.freeze(['COLOUR ITEMS POWER UP', 'BLUE: THE ARM SHIELD', 'CH-: SPEED TOGGLE']),
]);

/** The ship select's panel: left, top, width, height. */
const SHIP_PANEL = Object.freeze({ x: CX - 104, y: 44, w: 208, h: 136 });

/** Where the ship select's menu is drawn (the ship names, left column). */
const SHIP_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: CX - 80,
  y: 70,
  lineHeight: 14,
  cursorX: CX - 92,
});

/**
 * The ship select (shmup_feat.md §5 "ship selection", §17 "Ship / Weapon select"; plan M2-05):
 * which ship — and so which power-up model — the next game plays.
 *
 * @remarks
 * An overlay (dim {@link PAUSE_DIM}) with an opaque panel over the difficulty menu: `SHIP SELECT`,
 * the content's ships by name (KESTREL, MANTA — the built-in default ship when the content has
 * none) and, for the focused one, its picture (frame 0 of its sprite), its power-up model
 * ({@link SHIP_MODE_LABELS}) and three hints ({@link SHIP_MODE_HINTS}). Opening it focuses the
 * ship chosen last (at first the host config's `shipId`) and locks activation for 2 ticks. OK
 * chooses the focused ship (`core/config` `withShip` for every difficulty's config — its
 * `shipId` and its `mode` as `powerUpMode`) and opens the {@link WeaponSelectScene} for a meter
 * ship, or starts the game at once for a Direct-mode one (it has no loadout to choose); Back
 * returns to the difficulty menu. Up / Down move the focus (wrapping, auto-repeat).
 */
export class ShipSelectScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'shipSelect' as const;
  /** An overlay: the title and the difficulty menu stay visible under it. */
  override readonly overlay = true;
  /** {@link PAUSE_DIM}. */
  override readonly dim = PAUSE_DIM;
  /** The ships, in {@link FlowControl.ships} order. */
  readonly menu: ListMenu;

  /**
   * Creates the screen from the flow's ships.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const labels: string[] = [];
    for (const ship of flow.ships) labels.push(ship.name.toUpperCase());
    this.menu = createListMenu(labels, { wrap: true });
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 6 + menuStringSlots(this.menu);
  }

  /** The ship the focus is on. */
  get focused(): PlayerShipSpec {
    const ships = this.flow.ships;
    return ships[this.menu.focus] ?? ships[0];
  }

  /** Focus on the ship chosen last, locked for 2 ticks. */
  override enter(): void {
    super.enter();
    const index = this.flow.shipIndex;
    this.menu.focus = index >= 0 && index < this.flow.ships.length ? index : 0;
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /** Back from the weapon select: the menu takes input again after a short lock. */
  override uncover(): void {
    super.uncover();
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * OK chooses the ship (→ the weapon select, or the game for a Direct-mode ship); Back closes the
   * screen. Never allocates (a choice re-arms the configs and a game start creates its World —
   * transitions).
   */
  tick(): void {
    const flow = this.flow;
    const menu = this.menu;
    const before = menu.revision;
    const result = menuTick(menu, flow.menuInput);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      flow.sfx(SFX_CUES.MenuBack);
      flow.stack.pop();
      return;
    }
    if (result === MenuResult.Confirmed) {
      flow.sfx(SFX_CUES.MenuSelect);
      flow.chooseShip(menu.focus);
      if (this.focused.mode === 'direct') flow.launchGame();
      else flow.stack.push(flow.weaponSelect);
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the panel, `SHIP SELECT`, the ships, the focused ship's picture, power-up model and
   * hints.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const p = SHIP_PANEL;
    const ship = this.focused;
    const mode = POWER_UP_MODES.indexOf(ship.mode);
    const m = mode >= 0 ? mode : 0;
    const hints = SHIP_MODE_HINTS[m];
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    list.setString(base, 'SHIP SELECT');
    list.setString(base + 1, SHIP_MODE_LABELS[m]);
    list.setString(base + 2, hints[0]);
    list.setString(base + 3, hints[1]);
    list.setString(base + 4, hints[2]);
    list.setString(base + 5, 'OK: CHOOSE');
    list.text(base, CX, p.y + 8, UI_COLORS.title, TextAlign.Center);
    drawMenu(list, this.menu, base + 6, SHIP_MENU_LAYOUT);
    if (ship.spriteId >= 0) list.sprite(ship.spriteId, 0, CX + 52, SHIP_MENU_LAYOUT.y + 10);
    list.text(base + 1, CX, p.y + 72, UI_COLORS.focus, TextAlign.Center);
    list.text(base + 2, CX, p.y + 88, UI_COLORS.text, TextAlign.Center);
    list.text(base + 3, CX, p.y + 98, UI_COLORS.text, TextAlign.Center);
    list.text(base + 4, CX, p.y + 108, UI_COLORS.text, TextAlign.Center);
    list.text(base + 5, CX, p.y + p.h - 14, UI_COLORS.disabled, TextAlign.Center);
  }
}

// ------------------------------------------------------------------------------ weapon select

/** Weapon select items (plan M2-03), top to bottom. */
export const WeaponSelectItem = {
  /** TYPE: a preset (`TYPE A` … `TYPE D`) or `EDIT` (Weapon Edit). */
  Type: 0,
  /** MISSILE: the Missile slot's weapon (chosen with EDIT, else the type's). */
  Missile: 1,
  /** DOUBLE: the Double slot's weapon. */
  Double: 2,
  /** LASER: the Laser slot's weapon. */
  Laser: 3,
  /** OPTION: how the Options fly (`GameConfig.optionChoice`, M2-04). */
  Option: 4,
  /** `?`: what the `?` slot grants (`GameConfig.shieldChoice`). */
  Shield: 5,
  /** `!`: what the `!` slot does (`GameConfig.megaChoice`). */
  Mega: 6,
  /** AUTO: Auto Power-Up on / off (`GameConfig.autoPowerUp`). */
  Auto: 7,
  /** ORDER: opens the Auto Power-Up order editor ({@link AutoOrderScene}). */
  Order: 8,
  /** START: starts the game with this loadout. */
  Start: 9,
} as const;

/** The `!` choices' labels, in `config` `MEGA_CHOICES` order. */
export const MEGA_CHOICE_LABELS: readonly string[] = Object.freeze([
  'MEGA CRASH',
  'NORMAL',
  'SPEED DOWN',
  'LIFE OPTION',
  'FULL BARRIER',
]);

/** The `?` choices' labels, in `config` `SHIELD_CHOICES` order. */
export const SHIELD_CHOICE_LABELS: readonly string[] = Object.freeze([
  'FORCE FIELD',
  'SHIELD',
  'FREE SHIELD',
  'ROTATE',
  'REDUCE',
]);

/** The Option types' labels, in `config` `OPTION_CHOICES` order (M2-04). */
export const OPTION_CHOICE_LABELS: readonly string[] = Object.freeze([
  'TRAIL',
  'SNAKE',
  'FORMATION',
  'ROTATE',
]);

/** The TYPE choice's label for Weapon Edit. */
export const WEAPON_EDIT_LABEL = 'EDIT';

/** The stage the weapon select's live preview flies (free flight when the content lacks it). */
export const WEAPON_RANGE_STAGE = 'weapon-range';

/** Screen x (playfield pixels) the preview ship is held at. */
export const PREVIEW_SHIP_X = 232;

/** Length of the preview ship's scripted weave (up, pause, down, pause), in ticks. */
export const PREVIEW_WEAVE_TICKS = 160;

/** Options the preview ship flies with. */
export const PREVIEW_OPTIONS = 2;

/**
 * Ticks between the preview's spread / retract toggles while OPTION is focused (a `Special` press
 * — the Formation and Rotate types show both states; M2-04).
 */
export const PREVIEW_SPREAD_TICKS = 90;

/** Rows of the Auto Power-Up order editor (the first entries of the order it edits). */
export const AUTO_ORDER_ROWS = 12;

/**
 * Labels of an order editor row: the meter slots in `config` `METER_SLOT_NAMES` order, then `-`
 * (no entry — rows set to `-` are left out of the order).
 */
export const AUTO_ORDER_LABELS: readonly string[] = Object.freeze([
  'SPEED',
  'MISSILE',
  'DOUBLE',
  'LASER',
  'OPTION',
  '?',
  '!',
  '-',
]);

/** One-letter codes of the meter slots for the ORDER summary, in slot order. */
const ORDER_CODES: readonly string[] = Object.freeze(['S', 'M', 'D', 'L', 'O', '?', '!']);

/** Entries the ORDER summary spells out before `+`. */
const ORDER_SUMMARY_ENTRIES = 8;

/**
 * The weapon select's panel (left half; the preview ship flies on the right): left, top, width,
 * height.
 */
const WEAPON_PANEL = Object.freeze({ x: 4, y: 12, w: 184, h: 192 });

/** Where the weapon select's menu is drawn (labels at x 18, values from x 72). */
const WEAPON_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: 18,
  y: 34,
  lineHeight: 13,
  cursorX: 9,
  valueX: 72,
});

/** The order editor's panel (right half, over the preview). */
const ORDER_PANEL = Object.freeze({ x: 196, y: 12, w: 184, h: 192 });

/** Where the order editor's menu is drawn. */
const ORDER_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: 218,
  y: 32,
  lineHeight: 12,
  cursorX: 207,
  valueX: 252,
});

/**
 * The TYPE label of a preset id: upper case, `-` → space (`type-b` → `TYPE B`).
 *
 * @param id - Preset id.
 * @returns The label.
 */
function presetLabel(id: string): string {
  return id.toUpperCase().replace(/-/g, ' ');
}

/**
 * The weapon select (shmup_feat.md §16 "Weapon select / Weapon Edit", §7A; plan M2-03): the
 * loadout the next game plays, with a live preview.
 *
 * @remarks
 * Pushed by the ship select's OK for a meter ship (M2-05; a full screen over the title, the
 * difficulty menu and the ship select). A
 * panel on the left lists TYPE (the content's presets — `TYPE A` … `TYPE D` — and `EDIT`), the
 * MISSILE / DOUBLE / LASER weapons (the type's, disabled; with EDIT every weapon of that slot can
 * be chosen — Weapon Edit), OPTION (TRAIL / SNAKE / FORMATION / ROTATE — M2-04), `?` (FORCE FIELD /
 * SHIELD / FREE SHIELD / ROTATE / REDUCE — M2-04), `!` (MEGA CRASH / NORMAL / SPEED DOWN / LIFE
 * OPTION / FULL BARRIER), AUTO (Auto Power-Up) with its ORDER (the one-letter
 * summary — OK opens the {@link AutoOrderScene}) and START. It opens focused on START (so OK starts
 * at once — the choice of the last visit is kept) and locks activation for 2 ticks. Left / Right
 * (or OK) change a value, OK on START starts the game (the stack is reset to the game scene, whose
 * World gets the difficulty's config with this loadout — `core/config` `withArsenal`), Back returns
 * to the ship select. The first visit starts from the host config's values.
 *
 * **Live preview.** A private mini World flies the {@link WEAPON_RANGE_STAGE} range (harmless
 * targets over a floor and a ceiling; free flight when the content lacks it), drawn full screen
 * behind the panel — not in a smaller viewport — with the chosen weapons
 * (`WeaponSystem.setArsenal` on every change), Missile, {@link PREVIEW_OPTIONS} Options and god
 * mode (its own debug flags): the ship is held at x {@link PREVIEW_SHIP_X}, right of the panel, and
 * weaves up and down (so the Free Way and the Options show), its main weapon follows the focused
 * row (MISSILE: the shot, DOUBLE: the Double slot's weapon, LASER: the Laser slot's, otherwise
 * Laser and Double take turns every 4 s; on OPTION the Options fly the chosen type and spread /
 * retract every {@link PREVIEW_SPREAD_TICKS} ticks), the range restarts when it ends, and its
 * presentation events go to its own queue, cleared every tick (no sound). The World is created
 * when the screen opens (a transition: its fly-in is skipped there) and dropped when it closes;
 * the flow shows its view instead of the game's while this screen is visible. Ticking never
 * allocates (the preview's input, event queue and role list are reused) — except that the range's
 * spawns create their behaviour coroutines (per spawn, decision D29), so the allocation guard
 * flies it without targets.
 */
export class WeaponSelectScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'weaponSelect' as const;
  /** TYPE: the presets' labels, then `EDIT` (when every slot has a weapon). */
  readonly type: Choice;
  /** MISSILE: the content's missile-slot weapons. */
  readonly missile: Choice;
  /** DOUBLE: the content's double-slot weapons. */
  readonly double: Choice;
  /** LASER: the content's laser-slot weapons. */
  readonly laser: Choice;
  /** OPTION: {@link OPTION_CHOICE_LABELS} (M2-04). */
  readonly option: Choice;
  /** `?`: {@link SHIELD_CHOICE_LABELS}. */
  readonly shield: Choice;
  /** `!`: {@link MEGA_CHOICE_LABELS}. */
  readonly mega: Choice;
  /** AUTO: Auto Power-Up. */
  readonly auto: Toggle;
  /** The menu ({@link WeaponSelectItem} order). */
  readonly menu: ListMenu;
  /**
   * The Auto Power-Up order as `MeterSlot` codes (the first {@link WeaponSelectScene.orderLength}
   * entries are in use).
   */
  readonly orderSlots = new Int8Array(MAX_AUTO_POWER_UP_ORDER);
  /** Entries of {@link WeaponSelectScene.orderSlots} in use. */
  orderLength = 0;
  /** The ORDER row's summary (`S M L O O O O ?`; `NONE` when empty). */
  orderLabel = '';
  /** The preview World while the screen is open, else `null`. */
  preview: World | null = null;
  /** The TYPE index of `EDIT` (-1 when Weapon Edit is not offered). */
  readonly editIndex: number;
  /** The presets TYPE offers (content order). */
  private readonly presets: readonly WeaponPresetSpec[];
  /** The weapon of each role per preset (`core/weapons` `resolveRoleWeapons`). */
  private readonly presetRoles: readonly (readonly (WeaponSpec | null)[])[];
  /** The weapons MISSILE, DOUBLE and LASER offer (`weaponsOfSlot`). */
  private readonly slotWeapons: readonly (readonly WeaponSpec[])[];
  /** The TYPE preset EDIT keeps the main shot of (the last preset chosen). */
  private basePreset = 0;
  /** The preview's input (its player 1 weaves; reused). */
  private readonly previewInput: InputSnapshot = createInputSnapshot();
  /** The preview's own event queue (cleared every tick: the preview makes no sound). */
  private readonly previewEvents: EventQueue = createEventQueue();
  /** The preview's debug switches (god mode). */
  private readonly previewFlags: DebugFlags = createDebugFlags();
  /** The arsenal handed to the preview (reused). */
  private readonly previewRoles: (WeaponSpec | null)[] = [null, null, null, null];
  /** Ticks the preview has flown (its weave's clock). */
  private previewTicks = 0;

  /**
   * Creates the screen from the content's presets and weapons and the host config's loadout.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const content = flow.host.content;
    const config = flow.host.config;
    this.presets = content.weaponPresets;
    const presetRoles: (readonly (WeaponSpec | null)[])[] = [];
    const typeLabels: string[] = [];
    for (const preset of this.presets) {
      presetRoles.push(Object.freeze(resolveRoleWeapons(content, preset)));
      typeLabels.push(presetLabel(preset.id));
    }
    if (presetRoles.length === 0) {
      presetRoles.push(Object.freeze(resolveRoleWeapons(content, null)));
      typeLabels.push('DEFAULT');
    }
    this.presetRoles = presetRoles;
    const slots: WeaponSlot[] = ['missile', 'double', 'laser'];
    const slotWeapons: (readonly WeaponSpec[])[] = [];
    const slotChoices: Choice[] = [];
    let editable = true;
    for (const slot of slots) {
      const list = weaponsOfSlot(content, slot);
      const labels: string[] = [];
      for (const weapon of list) labels.push(weaponLabel(weapon));
      if (labels.length === 0) {
        labels.push('NONE');
        editable = false;
      }
      slotWeapons.push(Object.freeze(list));
      slotChoices.push(createChoice(labels, 0));
    }
    this.slotWeapons = slotWeapons;
    this.editIndex = editable ? typeLabels.length : -1;
    if (editable) typeLabels.push(WEAPON_EDIT_LABEL);
    this.type = createChoice(typeLabels, 0);
    this.missile = slotChoices[0];
    this.double = slotChoices[1];
    this.laser = slotChoices[2];
    this.option = createChoice(
      OPTION_CHOICE_LABELS,
      Math.max(0, OPTION_CHOICES.indexOf(config.optionChoice)),
    );
    this.shield = createChoice(
      SHIELD_CHOICE_LABELS,
      Math.max(0, SHIELD_CHOICES.indexOf(config.shieldChoice)),
    );
    this.mega = createChoice(
      MEGA_CHOICE_LABELS,
      Math.max(0, MEGA_CHOICES.indexOf(config.megaChoice)),
    );
    this.auto = createToggle(config.autoPowerUp);
    this.menu = createListMenu(
      [
        { label: 'TYPE', choice: this.type },
        { label: 'MISSILE', choice: this.missile },
        { label: 'DOUBLE', choice: this.double },
        { label: 'LASER', choice: this.laser },
        { label: 'OPTION', choice: this.option },
        { label: '? SLOT', choice: this.shield },
        { label: '! SLOT', choice: this.mega },
        { label: 'AUTO', toggle: this.auto },
        'ORDER',
        'START',
      ],
      { focus: WeaponSelectItem.Start },
    );
    // The host config's loadout: its preset (else the first), its Weapon Edit, its order.
    let base = 0;
    for (let i = 0; i < this.presets.length; i++) {
      if (this.presets[i].id === config.weaponPreset) base = i;
    }
    this.basePreset = base;
    this.type.index = base;
    this.syncSlots();
    const edit = config.weaponEdit;
    if (edit !== null && this.editIndex >= 0) {
      this.type.index = this.editIndex;
      const ids = [edit.missile, edit.double, edit.laser];
      const choices = [this.missile, this.double, this.laser];
      for (let k = 0; k < 3; k++) {
        const at = slotWeapons[k].findIndex((weapon) => weapon.id === ids[k]);
        if (at >= 0) choices[k].index = at;
      }
    }
    this.syncDisabled();
    const order = config.autoPowerUpOrder;
    this.orderLength = 0;
    for (let i = 0; i < order.length && i < MAX_AUTO_POWER_UP_ORDER; i++) {
      const slot = METER_SLOT_NAMES.indexOf(order[i]);
      if (slot >= 0) this.orderSlots[this.orderLength++] = slot;
    }
    this.orderLabel = this.buildOrderLabel();
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 4 + menuStringSlots(this.menu);
  }

  /** Whether TYPE is on `EDIT` (Weapon Edit). */
  get editing(): boolean {
    return this.type.index === this.editIndex;
  }

  /** Focus on START, locked for 2 ticks; the preview World takes off. */
  override enter(): void {
    super.enter();
    this.menu.focus = WeaponSelectItem.Start;
    this.menu.open(MENU_OPEN_LOCK_TICKS);
    this.ensurePreview();
  }

  /**
   * The screen closes (back to the ship select, or the game starts): the preview is dropped.
   */
  override exit(): void {
    this.preview = null;
  }

  /** The order editor closed: the menu takes input again after a short lock. */
  override uncover(): void {
    super.uncover();
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * Replaces the Auto Power-Up order (the order editor's DONE) and rebuilds the ORDER summary.
   *
   * @remarks
   * Codes outside `0…METER_SLOT_COUNT − 1` are skipped. A menu action, not a tick (the summary
   * string is built here).
   *
   * @param slots - `MeterSlot` codes, in order (at most `MAX_AUTO_POWER_UP_ORDER` are kept).
   */
  setOrder(slots: readonly number[]): void {
    this.orderLength = 0;
    for (let i = 0; i < slots.length && i < MAX_AUTO_POWER_UP_ORDER; i++) {
      const slot = slots[i];
      if (slot >= 0 && slot < METER_SLOT_NAMES.length) this.orderSlots[this.orderLength++] = slot;
    }
    this.orderLabel = this.buildOrderLabel();
    this.uiRevision++;
  }

  /**
   * The loadout chosen now, as config fields (allocates — START only).
   *
   * @returns The {@link ArsenalChoice}: the preset (EDIT: the last preset chosen), the Weapon Edit
   *   (EDIT only), the Option type, the `?` / `!` choices, AUTO and the order.
   */
  arsenal(): ArsenalChoice {
    const preset = this.presets[this.basePreset];
    const order: MeterSlotName[] = [];
    for (let i = 0; i < this.orderLength; i++) order.push(METER_SLOT_NAMES[this.orderSlots[i]]);
    const edit: WeaponEdit | null = this.editing
      ? {
          missile: this.slotWeapons[0][this.missile.index].id,
          double: this.slotWeapons[1][this.double.index].id,
          laser: this.slotWeapons[2][this.laser.index].id,
        }
      : null;
    return {
      weaponPreset: preset === undefined ? this.flow.host.config.weaponPreset : preset.id,
      weaponEdit: edit,
      optionChoice: OPTION_CHOICES[this.option.index] ?? 'trail',
      shieldChoice: SHIELD_CHOICES[this.shield.index] ?? 'forceField',
      megaChoice: MEGA_CHOICES[this.mega.index] ?? 'megaCrash',
      autoPowerUp: this.auto.value,
      autoPowerUpOrder: order,
    };
  }

  /**
   * Menu input, then one preview tick. Never allocates (START builds the loadout and the game's
   * World — a transition).
   */
  tick(): void {
    const flow = this.flow;
    const menu = this.menu;
    const before = menu.revision;
    const result = menuTick(menu, flow.menuInput);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      flow.sfx(SFX_CUES.MenuBack);
      flow.stack.pop();
      return;
    }
    if (result === MenuResult.Confirmed) {
      if (menu.focus === WeaponSelectItem.Start) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.chooseArsenal(this.arsenal());
        flow.launchGame();
        return;
      }
      if (menu.focus === WeaponSelectItem.Order) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.push(flow.autoOrder);
        return;
      }
    } else {
      if (result === MenuResult.Changed) this.changed(menu.focus);
      flow.menuSound(result);
    }
    this.stepPreview();
  }

  /**
   * A value changed: TYPE sets the slot rows (and their disabled state), a weapon change swaps the
   * preview's arsenal.
   *
   * @param item - The {@link WeaponSelectItem} that changed.
   */
  private changed(item: number): void {
    if (item === WeaponSelectItem.Type) {
      if (!this.editing) {
        this.basePreset = this.type.index;
        this.syncSlots();
      }
      this.syncDisabled();
      this.uiRevision++;
      this.applyArsenal();
    } else if (
      item === WeaponSelectItem.Missile ||
      item === WeaponSelectItem.Double ||
      item === WeaponSelectItem.Laser
    ) {
      this.applyArsenal();
    } else if (item === WeaponSelectItem.Option) {
      this.applyOptionType();
    }
  }

  /** Hands the chosen Option type to the preview's ship (`OptionGroup.setFormation`, M2-04). */
  private applyOptionType(): void {
    const world = this.preview;
    if (world === null) return;
    const group = world.weapons.options[0];
    group.setFormation(OPTION_CHOICES[this.option.index] ?? 'trail');
    group.reset(world.players[0], world.camera);
  }

  /** Puts the slot rows on the base preset's weapons (the first of the slot when it has none). */
  private syncSlots(): void {
    const roles = this.presetRoles[this.basePreset] ?? this.presetRoles[0];
    this.missile.index = Math.max(
      0,
      this.slotWeapons[0].indexOf(roles[WeaponRole.Missile] as WeaponSpec),
    );
    this.double.index = Math.max(
      0,
      this.slotWeapons[1].indexOf(roles[WeaponRole.Double] as WeaponSpec),
    );
    this.laser.index = Math.max(
      0,
      this.slotWeapons[2].indexOf(roles[WeaponRole.Laser] as WeaponSpec),
    );
  }

  /** MISSILE / DOUBLE / LASER can be changed only with EDIT. */
  private syncDisabled(): void {
    const locked = !this.editing;
    this.menu.setDisabled(WeaponSelectItem.Missile, locked);
    this.menu.setDisabled(WeaponSelectItem.Double, locked);
    this.menu.setDisabled(WeaponSelectItem.Laser, locked);
  }

  /**
   * The ORDER row's summary (allocates — built when the order changes, never per tick).
   *
   * @returns One letter per entry separated by spaces (`S M L O O O O ?`), `+` after the first
   *   eight when there are more, or `NONE` when the order is empty.
   */
  private buildOrderLabel(): string {
    if (this.orderLength === 0) return 'NONE';
    const parts: string[] = [];
    for (let i = 0; i < this.orderLength && i < ORDER_SUMMARY_ENTRIES; i++) {
      parts.push(ORDER_CODES[this.orderSlots[i]]);
    }
    if (this.orderLength > ORDER_SUMMARY_ENTRIES) parts.push('+');
    return parts.join(' ');
  }

  /**
   * Creates the preview World (when the screen opens), its fly-in skipped.
   *
   * @remarks
   * A transition (allocates the World). Its config is the next game's
   * ({@link SceneFlow.gameConfig}) on the {@link WEAPON_RANGE_STAGE} (or free flight), with
   * autofire, remote mode, the default starting loadout, no Auto Power-Up and no Weapon Edit (the
   * arsenal and, since M2-04, the Option type are handed over afterwards); its events go to the
   * scene's own queue and god mode is on in its own debug flags. The fly-in is stepped through here
   * (at most 120 ticks) and its events dropped. Does nothing while a preview exists.
   */
  private ensurePreview(): void {
    if (this.preview !== null) return;
    const flow = this.flow;
    const content = flow.host.content;
    const config = resolveGameConfig({
      ...flow.worldConfig,
      stage: content.stageIndex.has(WEAPON_RANGE_STAGE) ? WEAPON_RANGE_STAGE : null,
      stageSkip: 'none',
      autofire: true,
      remoteMode: true,
      loadout: 'default',
      autoPowerUp: false,
      weaponEdit: null,
    });
    this.previewEvents.clear();
    this.previewFlags.godMode = true;
    const world = createWorld(config, content, {
      events: this.previewEvents,
      debugFlags: this.previewFlags,
    });
    const input = this.previewInput;
    input.players[0].held = 0;
    for (let i = 0; i < 120 && world.players[0].state !== 'alive'; i++) stepWorld(world, input);
    world.events.clear();
    this.preview = world;
    this.previewTicks = 0;
    this.applyArsenal();
    this.applyOptionType();
  }

  /** Hands the chosen weapons to the preview (`WeaponSystem.setArsenal`). */
  private applyArsenal(): void {
    const world = this.preview;
    if (world === null) return;
    const roles = this.previewRoles;
    const preset = this.presetRoles[this.basePreset] ?? this.presetRoles[0];
    roles[WeaponRole.Main] = preset[WeaponRole.Main];
    if (this.editing) {
      roles[WeaponRole.Missile] = this.slotWeapons[0][this.missile.index] ?? null;
      roles[WeaponRole.Double] = this.slotWeapons[1][this.double.index] ?? null;
      roles[WeaponRole.Laser] = this.slotWeapons[2][this.laser.index] ?? null;
    } else {
      roles[WeaponRole.Missile] = preset[WeaponRole.Missile];
      roles[WeaponRole.Double] = preset[WeaponRole.Double];
      roles[WeaponRole.Laser] = preset[WeaponRole.Laser];
    }
    world.weapons.setArsenal(roles);
  }

  /**
   * One preview tick: the loadout of the focused row, the weave, the World, the range's restart.
   */
  private stepPreview(): void {
    const world = this.preview;
    if (world === null) return;
    const loadout = world.weapons.loadouts[0];
    const focus = this.menu.focus;
    loadout.missile = true;
    loadout.options = PREVIEW_OPTIONS;
    loadout.main =
      focus === WeaponSelectItem.Missile
        ? MainWeapon.Basic
        : focus === WeaponSelectItem.Double
          ? MainWeapon.Double
          : focus === WeaponSelectItem.Laser
            ? MainWeapon.Laser
            : ((this.previewTicks / 240) & 1) === 0
              ? MainWeapon.Laser
              : MainWeapon.Double;
    const t = this.previewTicks % PREVIEW_WEAVE_TICKS;
    this.previewTicks++;
    const player = this.previewInput.players[0];
    player.held = t < 20 || t >= 140 ? Action.Up : t >= 60 && t < 100 ? Action.Down : 0;
    // On OPTION the Formation / Rotate types spread and retract now and then (a `Special` press).
    player.pressed =
      focus === WeaponSelectItem.Option && this.previewTicks % PREVIEW_SPREAD_TICKS === 0
        ? Action.Special
        : 0;
    const ship = world.players[0];
    if (ship.state === 'alive') ship.x = world.camera.x + PREVIEW_SHIP_X;
    stepWorld(world, this.previewInput);
    if (world.status !== 'playing') {
      // The range ended (or anything else): fly it again from the start.
      if (world.stage !== null) world.stage.restartAt(0);
      world.status = 'playing';
    }
    world.events.clear();
  }

  /**
   * Draws the panel, `WEAPON SELECT`, the menu, the ORDER summary and the hints.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const p = WEAPON_PANEL;
    const layout = WEAPON_MENU_LAYOUT;
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 232);
    list.setString(base, 'WEAPON SELECT');
    list.setString(base + 1, this.orderLabel);
    list.setString(base + 2, 'LEFT/RIGHT: CHANGE');
    list.setString(base + 3, 'OK ON START: GO');
    list.text(base, p.x + (p.w >> 1), p.y + 8, UI_COLORS.title, TextAlign.Center);
    const y = drawMenu(list, this.menu, base + 4, layout);
    const orderY = layout.y + WeaponSelectItem.Order * (layout.lineHeight ?? 12);
    const focused = this.menu.focus === WeaponSelectItem.Order;
    list.text(base + 1, layout.valueX ?? 72, orderY, focused ? UI_COLORS.focus : UI_COLORS.text);
    list.text(base + 2, p.x + 10, y + 8, UI_COLORS.disabled);
    list.text(base + 3, p.x + 10, y + 20, UI_COLORS.disabled);
  }
}

/**
 * The Auto Power-Up order editor (plan M2-03 "editable Auto Power-Up order"; shmup_feat.md §6A
 * Auto Power-Up) — opened by the weapon select's ORDER.
 *
 * @remarks
 * An overlay (dim 0.35) with a panel on the right: {@link AUTO_ORDER_ROWS} rows, each one of
 * `SPEED MISSILE DOUBLE LASER OPTION ? !` or `-` (no entry — Left / Right or OK step it), and DONE.
 * Opening it shows the weapon select's order (its first rows; the rest `-`), focuses row 1 and
 * locks activation for 2 ticks. DONE or Back stores the rows that are not `-`, in order, as the
 * order's first entries ({@link WeaponSelectScene.setOrder}) — entries past the
 * {@link AUTO_ORDER_ROWS} rows (a host config's longer order) are kept after them — and closes it.
 * A slot listed `n` times asks Auto Power-Up for `n` levels (`GameConfig.autoPowerUpOrder`).
 */
export class AutoOrderScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'autoOrder' as const;
  /** An overlay: the weapon select stays visible under it. */
  override readonly overlay = true;
  /** Dim 0.35. */
  override readonly dim = 0.35;
  /** One choice per row ({@link AUTO_ORDER_LABELS}). */
  readonly entries: readonly Choice[];
  /** The rows, then DONE. */
  readonly menu: ListMenu;

  /**
   * Creates the editor.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const entries: Choice[] = [];
    const items: MenuItemSpec[] = [];
    for (let i = 0; i < AUTO_ORDER_ROWS; i++) {
      const choice = createChoice(AUTO_ORDER_LABELS, AUTO_ORDER_LABELS.length - 1);
      entries.push(choice);
      items.push({ label: String(i + 1), choice });
    }
    items.push('DONE');
    this.entries = entries;
    this.menu = createListMenu(items);
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 1 + menuStringSlots(this.menu);
  }

  /** Shows the weapon select's order; focus on row 1, locked for 2 ticks. */
  override enter(): void {
    super.enter();
    const select = this.flow.weaponSelect;
    const none = AUTO_ORDER_LABELS.length - 1;
    for (let i = 0; i < AUTO_ORDER_ROWS; i++) {
      this.entries[i].index = i < select.orderLength ? select.orderSlots[i] : none;
    }
    this.menu.focus = 0;
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * Stores the rows as the order's first entries — the entries past the rows, which the editor
   * does not show, are kept after them — (allocates — a menu action) and closes.
   */
  private close(): void {
    const select = this.flow.weaponSelect;
    const slots: number[] = [];
    const none = AUTO_ORDER_LABELS.length - 1;
    for (const entry of this.entries) if (entry.index !== none) slots.push(entry.index);
    for (let i = AUTO_ORDER_ROWS; i < select.orderLength; i++) slots.push(select.orderSlots[i]);
    select.setOrder(slots);
    this.flow.sfx(SFX_CUES.MenuBack);
    this.flow.stack.pop();
  }

  /** Rows change with Left / Right / OK; DONE or Back stores and closes. Never allocates. */
  tick(): void {
    const flow = this.flow;
    const menu = this.menu;
    const before = menu.revision;
    const result = menuTick(menu, flow.menuInput);
    if (menu.revision !== before) this.uiRevision++;
    if (
      result === MenuResult.Back ||
      (result === MenuResult.Confirmed && menu.focus === AUTO_ORDER_ROWS)
    ) {
      this.close();
      return;
    }
    if (result === MenuResult.Confirmed) return;
    flow.menuSound(result);
  }

  /**
   * Draws the panel, `AUTO ORDER` and the rows.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const p = ORDER_PANEL;
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    list.setString(base, 'AUTO ORDER');
    list.text(base, p.x + (p.w >> 1), p.y + 8, UI_COLORS.title, TextAlign.Center);
    drawMenu(list, this.menu, base + 1, ORDER_MENU_LAYOUT);
  }
}

// ------------------------------------------------------------------------------ zone map

/** Screen x of the first and the last depth column of the zone map. */
const MAP_LEFT = 40;

/** Screen x of the last depth column. */
const MAP_RIGHT = 344;

/** Screen y of the top of the zone map's rows. */
const MAP_TOP = 40;

/** Screen y of the bottom of the zone map's rows. */
const MAP_BOTTOM = 136;

/** A zone node's box: width. */
const MAP_NODE_W = 18;

/** A zone node's box: height. */
const MAP_NODE_H = 12;

/** Dots drawn along one edge of the map (fewer on a map with many edges — `MapScene.edgeDots`). */
const MAP_EDGE_DOTS = 7;

/**
 * Most UI-list commands the zone map spends on its edges' dots: the rest of the list holds the
 * nodes (six commands each, up to `core/data` `MAX_CAMPAIGN_ZONES`), the preview panel and the
 * dialog over it — so even the largest map the content validation accepts fits in the list.
 */
const MAP_EDGE_DOT_BUDGET = 160;

/** Half-period of the focused choice's blink on the map, in ticks. */
const MAP_BLINK_TICKS = 16;

/** The zone map's preview panel: left, top, width, height. */
const MAP_PANEL = Object.freeze({ x: 24, y: 146, w: 336, h: 60 });

/**
 * The zone map (shmup_feat.md §14 "branching zone map", §17 "zone map"; plan M2-10): after a
 * campaign zone's tally, the player chooses the next zone.
 *
 * @remarks
 * A full screen (the title's drifting starfield behind it). The campaign's zones are drawn as a
 * node graph — one column per depth, the zones of a depth spread top to bottom in file order,
 * dotted edges between them — with the route so far lit, the zone just cleared in yellow, the
 * zones it leads to outlined and the focused one blinking; under the graph a panel previews the
 * focused zone (`ZONE C`, its name, its preview lines). Up / Down move between the exits of the
 * cleared zone (sorted top to bottom, wrapping, the UI kit's auto-repeat — `menuTick`), OK
 * launches: the chosen zone's stage is prepared (`SimEventKind.PrepareStage`, so the host loads
 * its music now), `LAUNCH` blinks for {@link MAP_LAUNCH_TICKS}, then the run moves on
 * (`FlowControl.advanceZone`: the carried players become the zone's entry state) and the game
 * scene plays it. Back asks "quit to title?" (the {@link ConfirmDialog}). Entering it fades the
 * music out. Drawing reads precomputed node positions and the content's own strings — it never
 * builds one.
 */
export class MapScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'map' as const;
  /** The campaign it draws (`null`: an empty map — the content has none). */
  readonly campaign: CampaignSpec | null;
  /** Per zone: its node's centre x. */
  readonly nodeX: Int16Array;
  /** Per zone: its node's centre y. */
  readonly nodeY: Int16Array;
  /** Per zone: its exits sorted top to bottom (the menu's order). */
  readonly exits: readonly (readonly number[])[];
  /**
   * Dots drawn along each edge: {@link MAP_EDGE_DOTS}, or fewer (at least one) when the map has so
   * many edges that they would not fit in the UI list (`MAP_EDGE_DOT_BUDGET`).
   */
  readonly edgeDots: number;
  /** Ticks since the map opened (the blink's clock). */
  ticks = 0;
  /** Ticks since OK (the launch), -1 while choosing. */
  launch = -1;
  /** The zone just cleared (the run's current zone when the map opened). */
  zone = -1;
  /** One menu per zone over its sorted exits (Up / Down, OK). */
  private readonly menus: readonly ListMenu[];

  /**
   * Lays the campaign's graph out.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const campaign = flow.host.content.campaign;
    this.campaign = campaign;
    const zones = campaign === null ? [] : campaign.zones;
    const depths = campaign === null ? 1 : campaign.depths;
    this.nodeX = new Int16Array(zones.length);
    this.nodeY = new Int16Array(zones.length);
    const perDepth: number[] = [];
    for (const zone of zones) perDepth[zone.depth] = (perDepth[zone.depth] ?? 0) + 1;
    const exits: number[][] = [];
    const menus: ListMenu[] = [];
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      const x =
        depths > 1
          ? MAP_LEFT + (zone.depth * (MAP_RIGHT - MAP_LEFT)) / (depths - 1)
          : (MAP_LEFT + MAP_RIGHT) / 2;
      const rows = perDepth[zone.depth] ?? 1;
      const y = MAP_TOP + ((zone.row + 0.5) * (MAP_BOTTOM - MAP_TOP)) / rows;
      this.nodeX[i] = Math.round(x);
      this.nodeY[i] = Math.round(y);
      const sorted = zone.exits.slice().sort((a, b) => zones[a].row - zones[b].row);
      exits.push(sorted);
      const labels: string[] = [];
      for (const exit of sorted) labels.push(zones[exit].name);
      if (labels.length === 0) labels.push('-');
      menus.push(createListMenu(labels, { wrap: true }));
    }
    this.exits = exits;
    this.menus = menus;
    const edges = campaign === null ? 0 : campaign.edges.length;
    const fit = edges > 0 ? Math.floor(MAP_EDGE_DOT_BUDGET / edges) : MAP_EDGE_DOTS;
    this.edgeDots = fit < 1 ? 1 : fit > MAP_EDGE_DOTS ? MAP_EDGE_DOTS : fit;
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 8 + MAX_ZONE_PREVIEW_LINES + (this.campaign === null ? 0 : this.campaign.zones.length);
  }

  /** The focused exit (a zone index), or -1 without one. */
  get focusedZone(): number {
    if (this.zone < 0 || this.zone >= this.exits.length) return -1;
    const list = this.exits[this.zone];
    const menu = this.menus[this.zone];
    return list.length === 0 ? -1 : (list[menu.focus] ?? list[0]);
  }

  /** The map opens on the run's zone: its first exit focused, locked for 2 ticks, music out. */
  override enter(): void {
    super.enter();
    const flow = this.flow;
    this.zone = flow.run.zone;
    this.ticks = 0;
    this.launch = -1;
    const menu = this.zone >= 0 ? this.menus[this.zone] : undefined;
    if (menu !== undefined) {
      menu.focus = 0;
      menu.open(MENU_OPEN_LOCK_TICKS);
    }
    flow.music(MUSIC_CUES.Silence, MUSIC_FADE_TICKS);
  }

  /** The "quit to title?" dialog answered NO: the choice takes input again. */
  override uncover(): void {
    super.uncover();
    if (this.zone >= 0 && this.zone < this.menus.length) {
      this.menus[this.zone].open(MENU_OPEN_LOCK_TICKS);
    }
  }

  /**
   * Up / Down choose, OK launches (then the next zone), Back asks "quit to title?". Never
   * allocates (the launch's transition creates the zone's World).
   */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    if (this.launch >= 0) {
      this.launch++;
      if (this.launch % 8 === 0) this.uiRevision++;
      if (this.launch >= MAP_LAUNCH_TICKS) {
        const next = this.focusedZone;
        if (next >= 0) {
          flow.advanceZone(next);
          flow.stack.reset(flow.game);
        } else {
          flow.toTitle();
        }
      }
      return;
    }
    if (this.ticks % MAP_BLINK_TICKS === 0) this.uiRevision++;
    if (this.zone < 0 || this.zone >= this.menus.length) {
      if ((flow.menuInput.pressed & (Action.Confirm | Action.Back)) !== 0) flow.toTitle();
      return;
    }
    const menu = this.menus[this.zone];
    const before = menu.revision;
    const result = menuTick(menu, flow.menuInput);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      flow.ask(ConfirmPurpose.QuitToTitle);
      return;
    }
    if (result === MenuResult.Confirmed) {
      const next = this.focusedZone;
      if (next < 0 || this.campaign === null) return;
      flow.sfx(SFX_CUES.MenuSelect);
      // The next zone's music (and whatever else it needs) is prepared while LAUNCH blinks.
      flow.prepareStage(this.campaign.zones[next].stage);
      this.launch = 0;
      this.uiRevision++;
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the title, the graph (edges, then nodes) and the preview panel.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const campaign = this.campaign;
    const base = this.stringBase;
    list.setString(base, campaign === null ? 'ZONE MAP' : campaign.name);
    list.setString(base + 1, 'CHOOSE YOUR COURSE');
    list.text(base, CX, 10, UI_COLORS.title, TextAlign.Center);
    if (campaign === null) return;
    const launching = this.launch >= 0;
    list.text(base + 1, CX, 22, UI_COLORS.disabled, TextAlign.Center);
    const zones = campaign.zones;
    const route = this.flow.run.route;
    const focused = this.focusedZone;
    const blinkOn = launching
      ? ((this.launch >> 3) & 1) === 0
      : Math.floor(this.ticks / MAP_BLINK_TICKS) % 2 === 0;
    const hw = MAP_NODE_W >> 1;
    const edges = campaign.edges;
    const dots = this.edgeDots;
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const a = edge.fromIndex;
      const b = edge.toIndex;
      let color: number = UI_COLORS.disabled;
      if (onRoute(route, a, b)) color = UI_COLORS.title;
      else if (a === this.zone) color = b === focused ? UI_COLORS.focus : UI_COLORS.text;
      if (a === this.zone && b === focused && !blinkOn) color = UI_COLORS.text;
      const x0 = this.nodeX[a] + hw;
      const y0 = this.nodeY[a];
      const x1 = this.nodeX[b] - hw;
      const y1 = this.nodeY[b];
      for (let k = 1; k <= dots; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / (dots + 1));
        const y = Math.round(y0 + ((y1 - y0) * k) / (dots + 1));
        list.rect(x - 1, y - 1, 2, 2, color);
      }
    }
    const choices = this.zone >= 0 && this.zone < this.exits.length ? this.exits[this.zone] : null;
    for (let i = 0; i < zones.length; i++) {
      const x = this.nodeX[i] - hw;
      const y = this.nodeY[i] - (MAP_NODE_H >> 1);
      const cleared = route.indexOf(i) >= 0;
      const choice = choices === null ? -1 : choices.indexOf(i);
      let fill: number = UI_COLORS.track;
      let border: number = UI_COLORS.disabled;
      let text: number = UI_COLORS.disabled;
      if (i === this.zone) {
        fill = UI_COLORS.panel;
        border = UI_COLORS.focus;
        text = UI_COLORS.focus;
      } else if (cleared) {
        fill = UI_COLORS.panel;
        border = UI_COLORS.title;
        text = UI_COLORS.title;
      } else if (choice >= 0) {
        fill = UI_COLORS.panel;
        border = i === focused && blinkOn ? UI_COLORS.focus : UI_COLORS.text;
        text = i === focused ? UI_COLORS.focus : UI_COLORS.text;
      }
      drawPanel(list, x, y, MAP_NODE_W, MAP_NODE_H, fill, border, 255);
      const slot = base + 8 + MAX_ZONE_PREVIEW_LINES + i;
      list.setString(slot, zones[i].label);
      list.text(slot, this.nodeX[i], y + 2, text, TextAlign.Center);
    }
    const p = MAP_PANEL;
    drawPanel(list, p.x, p.y, p.w, p.h);
    if (focused < 0) return;
    const zone = zones[focused];
    list.setString(base + 2, 'ZONE');
    list.setString(base + 3, zone.label);
    list.setString(base + 4, zone.name);
    list.setString(base + 5, launching ? 'LAUNCH' : 'UP/DOWN: CHOOSE  OK: LAUNCH');
    list.text(base + 2, p.x + 10, p.y + 6, UI_COLORS.title);
    list.text(base + 3, p.x + 44, p.y + 6, UI_COLORS.focus);
    list.text(base + 4, p.x + 64, p.y + 6, UI_COLORS.focus);
    for (let l = 0; l < MAX_ZONE_PREVIEW_LINES; l++) {
      const line = zone.preview[l];
      if (line === undefined) continue;
      list.setString(base + 8 + l, line);
      list.text(base + 8 + l, p.x + 10, p.y + 18 + l * 10, UI_COLORS.text);
    }
    if (!launching || blinkOn) {
      list.text(
        base + 5,
        p.x + p.w - 8,
        p.y + p.h - 10,
        launching ? UI_COLORS.focus : UI_COLORS.disabled,
        TextAlign.Right,
      );
    }
  }
}

/**
 * Whether an edge lies on the route so far (its two zones follow each other in it).
 *
 * @param route - Zone indices of the run.
 * @param a - The edge's first zone.
 * @param b - Its second zone.
 * @returns `true` when `b` directly follows `a` in the route.
 */
function onRoute(route: readonly number[], a: number, b: number): boolean {
  for (let i = 0; i + 1 < route.length; i++) if (route[i] === a && route[i + 1] === b) return true;
  return false;
}

// ------------------------------------------------------------------------------ ending

/** The ending's panel: left, top, width, height. */
const ENDING_PANEL = Object.freeze({ x: 40, y: 24, w: 304, h: 168 });

/** The epilogue's panel under the sprite scene: left, top, width, height (M2-14). */
const ENDING_TEXT_PANEL = Object.freeze({ x: 40, y: 124, w: 304, h: 88 });

/** The ending's flag lines, in `RunFlag` bit order. */
const ENDING_FLAG_LABELS: readonly string[] = Object.freeze([
  'A BOSS ESCAPED',
  'NO MISS',
  'NO CONTINUE',
  'BONUS STAGE CLEARED',
]);

/** Ending scene phases (M2-14): the sprite scene and its epilogue, then the result card. */
const EndingPhase = { Story: 0, Result: 1 } as const;

/** Sprite scene kinds, as codes (the `core/data` `ENDING_SCENES` order). */
const EndingSceneCode = { None: 0, Citadel: 1, Abyss: 2 } as const;

/**
 * Where the citadel scene's blasts go off, relative to the citadel's centre: x, y pairs, taken in
 * turn (a fixed table — no randomness in a scene).
 */
const CITADEL_BLASTS: readonly number[] = Object.freeze([
  -40, -12, 22, -28, -8, 10, 44, 4, -26, 22, 8, -30, 34, 18, -48, 2,
]);

/** The deep scene's bubbles: x, speed (px per 8 ticks), start offset — in turn (fixed). */
const ABYSS_BUBBLES: readonly number[] = Object.freeze([
  24, 3, 0, 70, 5, 40, 118, 4, 80, 166, 3, 20, 214, 6, 60, 262, 4, 10, 310, 5, 90, 350, 3, 50,
]);

/** Ticks the sprite scenes play before the citadel has fallen / the ship reaches the light. */
const ENDING_SCENE_TICKS = 480;

/**
 * The ending after a campaign run's final zone (plan M2-10 — the selection hook; M2-14 — the
 * ending scenes, the epilogue and the way to the credits).
 *
 * @remarks
 * The ending the run earned (`RunState.ending` — chosen by `core/data` `selectCampaignEnding` from
 * the final zone and the run's flags when the zone was cleared) names a **sprite scene**
 * (`core/data` `ENDING_SCENES`) and an **epilogue**:
 *
 * 1. **Story** (an ending with a scene or text): the scene plays in the upper part of the screen —
 *    `citadel`: the fortress breaking apart in chained blasts while the ship flies away; `abyss`:
 *    the ship rising out of the deep towards the light while the flagship's wreck sinks (or, when
 *    a boss escaped, sails off) — with a dawn sun for a flawless (`noDeath`) run; the epilogue's
 *    lines appear below it one every {@link ENDING_LINE_TICKS}. OK (after
 *    {@link ENDING_LOCK_TICKS}) shows every line at once, then moves on; so does the end of the
 *    last line's {@link ENDING_STORY_HOLD_TICKS}.
 * 2. **Result**: the card — `ENDING`, the ending's name, the route taken (the zones' labels), the
 *    final score(s), a line for each run flag set (no miss, no continue, a bonus stage cleared, a
 *    boss escaped) and `THANK YOU FOR PLAYING`. OK (after {@link ENDING_LOCK_TICKS}) or
 *    {@link ENDING_TIMEOUT_TICKS} → the **credits** ({@link CreditsScene}) when the campaign has
 *    any, else the title.
 *
 * An ending without scene and text (M2-10 content) opens on the result card at once. The final
 * zone's ending theme (its stage's `music.ending` cue — `Ending` in the shipped zones H and I)
 * starts when it opens. The run was recorded in the hi-score table when
 * the final zone was cleared. Nothing allocates per tick or redraw: the lines and names are the
 * content's strings, the route line is built on `enter`, the scene is arithmetic on the tick
 * count over fixed tables.
 */
export class EndingScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'ending' as const;
  /** Ticks since it opened. */
  ticks = 0;
  /** Ticks since the current phase began. */
  phaseTicks = 0;
  /** 0 = the story (scene and epilogue), 1 = the result card. */
  phase: number = EndingPhase.Story;
  /** Epilogue lines shown so far. */
  shown = 0;
  /** The sprite scene playing (an `EndingSceneCode`: 0 none, 1 citadel, 2 abyss). */
  scene: number = EndingSceneCode.None;
  /** The route as zone labels (`A B D F H`; built when it opens). */
  private routeText = '';
  /** Whether the run lost no ship (the dawn). */
  private flawless = false;
  /** Whether a boss escaped (the flagship sails off). */
  private escaped = false;

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 8 + ENDING_FLAG_LABELS.length + MAX_ENDING_TEXT_LINES;
  }

  /** The epilogue of the ending shown (empty without one). */
  get lines(): readonly string[] {
    const ending = this.flow.run.ending;
    return ending === null ? NO_LINES : ending.text;
  }

  /** Builds the route line, picks the scene and its variants, plays the ending theme. */
  override enter(): void {
    super.enter();
    this.ticks = 0;
    this.phaseTicks = 0;
    this.shown = 0;
    const run = this.flow.run;
    const campaign = run.campaign;
    const labels: string[] = [];
    if (campaign !== null) for (const zone of run.route) labels.push(campaign.zones[zone].label);
    this.routeText = labels.join(' ');
    const ending = run.ending;
    const name = ending === null ? 'none' : ending.scene;
    this.scene =
      name === 'citadel'
        ? EndingSceneCode.Citadel
        : name === 'abyss'
          ? EndingSceneCode.Abyss
          : EndingSceneCode.None;
    const flags = run.endingFlags;
    this.flawless = (flags & RunFlag.NoDeath) !== 0;
    this.escaped = (flags & RunFlag.BossEscaped) !== 0;
    const story = this.scene !== EndingSceneCode.None || this.lines.length > 0;
    this.phase = story ? EndingPhase.Story : EndingPhase.Result;
    // The final zone's ending theme (its stage's `music.ending`, prepared with its set).
    const cue = finalZoneCue(this.flow, false);
    if (cue > MUSIC_CUES.Silence) this.flow.music(cue, MUSIC_FADE_TICKS);
  }

  /** Whether the credits follow (the campaign has some). */
  private get creditsNext(): boolean {
    const campaign = this.flow.run.campaign;
    return campaign !== null && campaign.credits.length > 0;
  }

  /**
   * The story: lines in turn, OK reveals / moves on; the result: OK after the lock or the
   * timeout → credits (or the title). Never allocates.
   */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    this.phaseTicks++;
    // The scene moves: redraw every other tick while one plays.
    if (this.scene !== EndingSceneCode.None && (this.ticks & 1) === 0) this.uiRevision++;
    const confirm = (flow.menuInput.pressed & Action.Confirm) !== 0;
    if (this.phase === EndingPhase.Story) {
      const count = this.lines.length;
      if (this.shown < count && this.phaseTicks >= (this.shown + 1) * ENDING_LINE_TICKS) {
        this.shown++;
        this.uiRevision++;
      }
      const ok = confirm && this.ticks > ENDING_LOCK_TICKS;
      if (ok && this.shown < count) {
        flow.sfx(SFX_CUES.MenuSelect);
        this.shown = count;
        this.phaseTicks = count * ENDING_LINE_TICKS;
        this.uiRevision++;
        return;
      }
      const done = this.phaseTicks >= count * ENDING_LINE_TICKS + ENDING_STORY_HOLD_TICKS;
      if (ok || done) {
        if (ok) flow.sfx(SFX_CUES.MenuSelect);
        this.phase = EndingPhase.Result;
        this.phaseTicks = 0;
        this.uiRevision++;
      }
      return;
    }
    if (this.phaseTicks === ENDING_LOCK_TICKS + 1) this.uiRevision++; // `OK: …` appears
    const ok = confirm && this.phaseTicks > ENDING_LOCK_TICKS;
    if (ok || this.phaseTicks >= ENDING_TIMEOUT_TICKS) {
      if (ok) flow.sfx(SFX_CUES.MenuSelect);
      if (this.creditsNext) flow.stack.reset(flow.credits);
      else flow.finishGame();
    }
  }

  /**
   * Draws the scene, then the epilogue or the result card.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    if (this.scene === EndingSceneCode.Citadel) this.drawCitadel(list);
    else if (this.scene === EndingSceneCode.Abyss) this.drawAbyss(list);
    if (this.phase === EndingPhase.Story) this.drawStory(list);
    else this.drawResult(list);
  }

  /**
   * The epilogue's lines shown so far, in a panel under the scene (centred on the screen without
   * one).
   *
   * @param list - The UI list.
   */
  private drawStory(list: DrawList): void {
    const lines = this.lines;
    if (lines.length === 0) return;
    const base = this.stringBase + 8 + ENDING_FLAG_LABELS.length;
    const p = ENDING_TEXT_PANEL;
    const top = this.scene === EndingSceneCode.None ? 108 - lines.length * 5 : p.y + 5;
    if (this.scene !== EndingSceneCode.None) {
      drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    }
    for (let i = 0; i < this.shown && i < lines.length; i++) {
      list.setString(base + i, lines[i]);
      list.text(base + i, CX, top + i * 10, UI_COLORS.text, TextAlign.Center);
    }
  }

  /**
   * The result card.
   *
   * @param list - The UI list.
   */
  private drawResult(list: DrawList): void {
    const base = this.stringBase;
    const run = this.flow.run;
    const p = ENDING_PANEL;
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    list.setString(base, 'ENDING');
    list.setString(base + 1, run.ending === null ? 'THE END' : run.ending.name);
    list.setString(base + 2, 'ROUTE');
    list.setString(base + 3, this.routeText);
    list.setString(base + 4, '1P');
    list.setString(base + 5, '2P');
    list.setString(base + 6, 'THANK YOU FOR PLAYING');
    list.setString(base + 7, this.creditsNext ? 'OK: CREDITS' : 'OK: TITLE');
    list.text(base, CX, p.y + 8, UI_COLORS.title, TextAlign.Center);
    list.text(base + 1, CX, p.y + 22, UI_COLORS.focus, TextAlign.Center);
    list.text(base + 2, p.x + 16, p.y + 42, UI_COLORS.title);
    list.text(base + 3, p.x + 64, p.y + 42, UI_COLORS.text);
    const players = run.carry.players;
    list.text(base + 4, p.x + 16, p.y + 56, UI_COLORS.title);
    list.number(players[0].score, p.x + p.w - 16, p.y + 56, 8, UI_COLORS.text, TextAlign.Right);
    let y = p.y + 68;
    if (players.length > 1 && players[1].active) {
      list.text(base + 5, p.x + 16, y, UI_COLORS.title);
      list.number(players[1].score, p.x + p.w - 16, y, 8, UI_COLORS.text, TextAlign.Right);
      y += 12;
    }
    y += 6;
    const flags = run.endingFlags;
    for (let i = 0; i < ENDING_FLAG_LABELS.length; i++) {
      if ((flags & (1 << i)) === 0) continue;
      list.setString(base + 8 + i, ENDING_FLAG_LABELS[i]);
      list.text(base + 8 + i, CX, y, UI_COLORS.focus, TextAlign.Center);
      y += 11;
    }
    list.text(base + 6, CX, p.y + p.h - 30, UI_COLORS.text, TextAlign.Center);
    if (this.phaseTicks > ENDING_LOCK_TICKS) {
      list.text(base + 7, CX, p.y + p.h - 14, UI_COLORS.disabled, TextAlign.Center);
    }
  }

  /**
   * Draws player 1's ship (and player 2's, a little behind it, in a co-op run).
   *
   * @param list - The UI list.
   * @param x - Player 1's centre x.
   * @param y - Its centre y.
   */
  private drawShips(list: DrawList, x: number, y: number): void {
    const world = this.flow.game.world;
    const ship = world.ship;
    if (ship.spriteId >= 0) list.sprite(ship.spriteId, 0, x, y);
    const players = this.flow.run.carry.players;
    if (players.length > 1 && players[1].active) {
      const p2 = ship.spriteP2Id >= 0 ? ship.spriteP2Id : ship.spriteId;
      if (p2 >= 0) list.sprite(p2, 0, x - 22, y + 14);
    }
  }

  /**
   * The citadel scene: the fortress on the horizon, chained blasts over it until it falls in a
   * last cluster, the ship flying away to the right, a dawn sun rising for a flawless run.
   *
   * @param list - The UI list.
   */
  private drawCitadel(list: DrawList): void {
    const sprites = this.flow.sprites;
    const t = this.ticks;
    if (this.flawless && sprites.endingSun >= 0) {
      const rise = t < 120 ? 0 : t > 420 ? 30 : Math.floor((t - 120) / 10);
      list.sprite(sprites.endingSun, 0, 292, 118 - rise);
    }
    list.rect(0, 104, 384, 16, 0x0c1018);
    const fallen = t >= ENDING_SCENE_TICKS;
    if (!fallen && sprites.endingCitadel >= 0) {
      const sink = t < 360 ? 0 : Math.floor((t - 360) / 8);
      list.sprite(sprites.endingCitadel, 0, 100, 68 + sink);
    }
    if (sprites.endingBlast >= 0 && t < ENDING_SCENE_TICKS + 64) {
      // Four blasts at a time, each 24 ticks from a flash to smoke, round the fixed table.
      const count = CITADEL_BLASTS.length >> 1;
      for (let k = 0; k < 4; k++) {
        const age = t + k * 6;
        const n = Math.floor(age / 24) % count;
        const frame = (age % 24) >> 3;
        if (frame > 3) continue;
        const spread = fallen ? 2 : 1;
        const bx = 100 + CITADEL_BLASTS[n * 2] * spread;
        const by = 68 + CITADEL_BLASTS[n * 2 + 1];
        list.sprite(sprites.endingBlast, frame, bx, by);
      }
    }
    const x = t < 60 ? 150 : 150 + Math.floor(((t - 60) * (t - 60)) / 240);
    if (x < 420) this.drawShips(list, x, 64);
  }

  /**
   * The deep's scene: dark water under the surface's light, bubbles rising, the flagship's wreck
   * sinking — or sailing off when a boss escaped —, the ship rising towards the light, a dawn sun
   * above the surface for a flawless run.
   *
   * @param list - The UI list.
   */
  private drawAbyss(list: DrawList): void {
    const sprites = this.flow.sprites;
    const t = this.ticks;
    list.rect(0, 16, 384, 104, 0x061420);
    if (this.flawless && sprites.endingSun >= 0) {
      list.sprite(sprites.endingSun, 0, 300, 0);
    }
    if (sprites.endingSurface >= 0) {
      const drift = (t >> 2) % 64;
      for (let k = -1; k < 6; k++) list.sprite(sprites.endingSurface, 0, k * 64 + 32 + drift, 20);
    }
    if (sprites.endingArk >= 0) {
      if (this.escaped) {
        const ax = 250 + (t >> 2);
        if (ax < 460) list.sprite(sprites.endingArk, 0, ax, 74);
      } else {
        const ay = 74 + Math.floor(t / 8);
        if (ay < 112) list.sprite(sprites.endingArk, 0, 250, ay);
      }
    }
    if (sprites.endingBubble >= 0) {
      const count = ABYSS_BUBBLES.length / 3;
      for (let k = 0; k < count; k++) {
        const rise =
          (Math.floor((t * ABYSS_BUBBLES[k * 3 + 1]) / 8) + ABYSS_BUBBLES[k * 3 + 2]) % 92;
        list.sprite(sprites.endingBubble, 0, ABYSS_BUBBLES[k * 3], 116 - rise);
      }
    }
    const up = t < ENDING_SCENE_TICKS ? Math.floor((t * 80) / ENDING_SCENE_TICKS) : 80;
    const x = t < ENDING_SCENE_TICKS ? 110 : 110 + (((t - ENDING_SCENE_TICKS) * 3) >> 1);
    if (x < 420) this.drawShips(list, x, 110 - up);
  }
}

/** An empty epilogue (an ending without text). */
const NO_LINES: readonly string[] = Object.freeze([]);

/**
 * The ending or credits theme of the run's final zone: its stage's `music.ending` /
 * `music.credits` cue (M2-14 — the host prepared it with the zone's music set), -1 when the stage
 * names none (then the music playing goes on).
 *
 * @param flow - The flow (its game World plays the final zone's stage).
 * @param credits - The credits theme instead of the ending's.
 * @returns A `MUSIC_CUES` id, or -1.
 */
function finalZoneCue(flow: FlowControl, credits: boolean): number {
  const stage = flow.game.world.stage;
  if (stage === null) return -1;
  const music = stage.stage.music;
  return (credits ? music.creditsId : music.endingId) ?? -1;
}

// ------------------------------------------------------------------------------ credits

/**
 * The credits scroll after an ending (plan M2-14, shmup_feat.md §17 "credits"): the campaign's
 * `credits` (`core/data` `CampaignCreditsSection`) scroll up from below the screen, a section's
 * title in the title colour, its lines under it, a blank row between sections, one pixel every
 * {@link CREDITS_SCROLL_TICKS} ticks; when the last row has come up to the middle of the screen the
 * scroll stops for {@link CREDITS_HOLD_TICKS}, then the name entry (the run's score entered its
 * table — M2-15) or the title. OK or Back (after {@link CREDITS_LOCK_TICKS}) skip ahead. The final zone's credits theme (its stage's
 * `music.credits` cue — `Credits` in the shipped zones) plays.
 *
 * @remarks
 * The rows are flattened once, when the flow is built (the content's own strings — nothing is built
 * per tick); only the rows on screen are drawn, each through one of
 * {@link CREDITS_STRING_SLOTS} string slots taken by row number, so a long list costs no more than
 * a short one. A campaign without credits never opens it (the ending goes to the title).
 */
export class CreditsScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'credits' as const;
  /** Ticks since it opened. */
  ticks = 0;
  /** The rows' texts (a title, its lines, `''` for the blank row after a section). */
  readonly rows: readonly string[];
  /** Per row: 1 for a section's title, 0 otherwise. */
  private readonly titles: Uint8Array;

  /**
   * Flattens the campaign's credits into rows.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const campaign = flow.host.content.campaign;
    const credits = campaign === null ? [] : campaign.credits;
    const rows: string[] = [];
    const titles: number[] = [];
    for (const section of credits) {
      rows.push(section.title);
      titles.push(1);
      for (const line of section.lines) {
        rows.push(line);
        titles.push(0);
      }
      rows.push('');
      titles.push(0);
    }
    this.rows = rows;
    this.titles = Uint8Array.from(titles);
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return CREDITS_STRING_SLOTS;
  }

  /** Pixels scrolled so far (stops when the last row reached the middle of the screen). */
  get scroll(): number {
    const moved = Math.floor(this.ticks / CREDITS_SCROLL_TICKS);
    return moved < this.scrollEnd ? moved : this.scrollEnd;
  }

  /** The scroll at which the last row stands in the middle of the screen. */
  get scrollEnd(): number {
    return CREDITS_TOP + this.rows.length * CREDITS_ROW_HEIGHT - CREDITS_STOP_Y;
  }

  /** Whether the scroll has stopped (the hold before the title). */
  get stopped(): boolean {
    return Math.floor(this.ticks / CREDITS_SCROLL_TICKS) >= this.scrollEnd;
  }

  /** Starts from the bottom with the credits theme (the final zone's `music.credits`). */
  override enter(): void {
    super.enter();
    this.ticks = 0;
    const cue = finalZoneCue(this.flow, true);
    if (cue > MUSIC_CUES.Silence) this.flow.music(cue, MUSIC_FADE_TICKS);
  }

  /** Scrolls; OK / Back after the lock, or the end of the hold → title. Never allocates. */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    if (this.ticks % CREDITS_SCROLL_TICKS === 0) this.uiRevision++;
    const skip =
      this.ticks > CREDITS_LOCK_TICKS &&
      (flow.menuInput.pressed & (Action.Confirm | Action.Back)) !== 0;
    const over =
      this.ticks >=
      (this.scrollEnd > 0 ? this.scrollEnd : 0) * CREDITS_SCROLL_TICKS + CREDITS_HOLD_TICKS;
    if (skip || over) {
      if (skip) flow.sfx(SFX_CUES.MenuSelect);
      flow.finishGame();
    }
  }

  /**
   * Draws the rows on screen.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const scroll = this.scroll;
    const rows = this.rows;
    for (let r = 0; r < rows.length; r++) {
      const y = CREDITS_TOP + r * CREDITS_ROW_HEIGHT - scroll;
      if (y <= -CREDITS_ROW_HEIGHT || y >= 216) continue;
      const text = rows[r];
      if (text.length === 0) continue;
      const slot = base + (r % CREDITS_STRING_SLOTS);
      list.setString(slot, text);
      list.text(
        slot,
        CX,
        y,
        this.titles[r] === 1 ? UI_COLORS.title : UI_COLORS.text,
        TextAlign.Center,
      );
    }
  }
}

// ------------------------------------------------------------------------------ front end (M2-15)

/**
 * Ticks the title waits on `PRESS OK` without any input before the attract loop moves on to the
 * demo play (12 s — shmup_feat.md §17 "attract loop").
 */
export const TITLE_ATTRACT_TICKS = 720;

/** Ticks one hi-score table stays on screen in the attract loop (5 s). */
export const HI_SCORE_PAGE_TICKS = 300;

/** Most tables the attract loop's hi-score screen shows, one after the other. */
export const HI_SCORE_ATTRACT_PAGES = 4;

/** Ticks the hi-score table stays after a game's name entry before the title (15 s). */
export const HI_SCORE_RESULT_TICKS = 900;

/** Ticks the hi-score table after a game ignores OK and Back. */
export const HI_SCORE_LOCK_TICKS = 30;

/** Ticks a name entry waits before it takes the name as it stands (30 s, arcade style). */
export const NAME_ENTRY_TIMEOUT_TICKS = 1800;

/** Ticks per pixel of the story crawl (4 — 15 px a second). */
export const STORY_SCROLL_TICKS = 4;

/** Height of one story row in pixels. */
export const STORY_ROW_HEIGHT = 11;

/** Ticks the story stays after its last row has crawled out, before the title. */
export const STORY_HOLD_TICKS = 90;

/** String slots of the story crawl: rows in its window at once, taken by row number. */
export const STORY_STRING_SLOTS = 10;

/** Top of the story crawl's window (a row above it is not drawn). */
const STORY_WINDOW_TOP = 132;

/** Bottom of the story crawl's window: rows come in here. */
const STORY_WINDOW_BOTTOM = 206;

/**
 * How far a page's first row has crawled into the window (pixels) when its scene takes over:
 * half the window, so the scene changes while the page's text is on screen.
 */
const STORY_PAGE_LEAD = (STORY_WINDOW_BOTTOM - STORY_WINDOW_TOP) >> 1;

/** The story's text panel under the sprite scene: left, top, width, height. */
const STORY_PANEL = Object.freeze({ x: 40, y: 128, w: 304, h: 82 });

/** Ticks after which a demo's zone card (its zone's label and name) disappears. */
const DEMO_CARD_TICKS = 180;

/** The game modes' labels on the hi-score screen, in `core/save` `HI_SCORE_MODES` order. */
export const HI_SCORE_MODE_LABELS: readonly string[] = Object.freeze([
  '1 PLAYER',
  '2 PLAYERS',
  'PRACTICE',
]);

/** The hi-score table's rank column, best first ({@link HI_SCORE_TABLE_SIZE} labels). */
export const HI_SCORE_RANK_LABELS: readonly string[] = Object.freeze([
  '1ST',
  '2ND',
  '3RD',
  '4TH',
  '5TH',
  '6TH',
  '7TH',
  '8TH',
  '9TH',
  '10TH',
]);

/** The practice select's LOADOUT choices (`core/config` `StartingLoadout`s). */
export const PRACTICE_LOADOUTS: readonly StartingLoadout[] = Object.freeze(['default', 'full']);

/** The practice select's LOADOUT labels, in {@link PRACTICE_LOADOUTS} order. */
export const PRACTICE_LOADOUT_LABELS: readonly string[] = Object.freeze(['STANDARD', 'FULL POWER']);

/** The practice select's rows: ZONE, CHECKPOINT, LOADOUT, START. */
export const PracticeItem = { Zone: 0, Checkpoint: 1, Loadout: 2, Start: 3 } as const;

/** The sound test's rows: MUSIC, SFX, STOP (the music), BACK. */
export const SoundTestItem = { Music: 0, Sfx: 1, Stop: 2, Back: 3 } as const;

/**
 * The sound test's SFX labels, in `SFX_CUES` order: the cue names in words (`PlayerShot` →
 * `PLAYER SHOT`).
 */
export const SFX_TEST_LABELS: readonly string[] = Object.freeze(
  SFX_CUE_NAMES.map((name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()),
);

/** What a host offers the sound test besides the SFX cues (M2-15). */
export interface SoundTestSetup {
  /**
   * The music library's track titles, in the host's library order: the sound test's MUSIC row
   * offers them and pushes `SimEventKind.SoundTest` with the chosen index (`@shmup/shell` passes
   * the titles of `@shmup/audio-web`'s music content and plays the track).
   */
  readonly music: readonly string[];
}

/** A hi-score row of the game just ended that waits for its name (M2-15). */
class PendingName {
  /** The row's table (`core/save` `hiScoreModeKey`). */
  key = '';
  /** The row (the object the table holds; `null` = none). */
  row: HiScoreEntry | null = null;
  /** The player slot whose score it is. */
  player = 0;
}

/** The practice select's choice, waiting for the difficulty / ship / weapon select (M2-15). */
class PracticeChoice {
  /** Whether a practice run is being set up. */
  active = false;
  /** Campaign zone index. */
  zone = 0;
  /** Checkpoint index into the zone stage's checkpoints (-1 = its start). */
  checkpoint = -1;
  /** The starting loadout. */
  loadout: StartingLoadout = 'default';
}

/**
 * The name entry after a game whose score entered a hi-score table (shmup_feat.md §17 "name entry
 * (3 letters) → hi-score table → attract"; plan M2-15).
 *
 * @remarks
 * A full screen over the starfield: `NEW HI-SCORE`, whose score (`1P` / `2P` in a co-op game) and
 * rank, and the `core/ui` {@link NameEntry} — Up / Down pick a letter, Right / OK move on, Left (or
 * Back) goes back, OK on `END` finishes — **four directions and OK only**, so the remote enters a
 * name. The entry also finishes by itself after {@link NAME_ENTRY_TIMEOUT_TICKS}. The name goes into
 * the row the game recorded (`core/save` `SaveStore.renameScore` — `---` for a blank name); in a
 * co-op game player 2's row is named next (either controller types — menus merge the input). Then
 * the save is written and the {@link HiScoreScene} shows the table with the new rows lit. A row
 * that left the table meanwhile (player 2's score pushed player 1's tenth place out) is skipped.
 * The title theme plays.
 */
export class NameEntryScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'nameEntry' as const;
  /** The letter picker. */
  readonly entry: NameEntry = createNameEntry();
  /** Index of the pending row being named. */
  current = 0;
  /** Ticks since the current name was started. */
  ticks = 0;
  /** The current row's rank in its table (0 = best). */
  rank = 0;

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 8 + NAME_ENTRY_STRING_SLOTS;
  }

  /** Seconds left before the entry finishes by itself. */
  get seconds(): number {
    const left = NAME_ENTRY_TIMEOUT_TICKS - this.ticks;
    return left > 0 ? Math.ceil(left / 60) : 0;
  }

  /** Starts on the first pending row still in its table; the title theme. */
  override enter(): void {
    super.enter();
    this.current = -1;
    this.flow.music(MUSIC_CUES.Title, MUSIC_FADE_TICKS);
    this.next();
  }

  /**
   * Moves on to the next pending row still in its table (a transition), or — none left — writes
   * the save and shows the table.
   */
  private next(): void {
    const flow = this.flow;
    const pending = flow.pendingNames;
    for (let i = this.current + 1; i < flow.pendingCount; i++) {
      const item = pending[i];
      const row = item.row;
      if (row === null) continue;
      const rank = flow.save.hiScores(item.key).indexOf(row);
      if (rank < 0) continue;
      this.current = i;
      this.rank = rank;
      this.ticks = 0;
      this.entry.open(MENU_OPEN_LOCK_TICKS);
      this.uiRevision++;
      return;
    }
    void flow.save.flush();
    flow.showResults();
  }

  /** Letters, cursor, END; the timeout takes the name as it stands. Never allocates. */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    if (this.ticks % 16 === 0) this.uiRevision++; // the cursor's blink, the seconds
    const entry = this.entry;
    const before = entry.revision;
    const result = nameEntryTick(entry, flow.menuInput);
    if (entry.revision !== before) this.uiRevision++;
    if (entry.done || this.ticks >= NAME_ENTRY_TIMEOUT_TICKS) {
      flow.sfx(SFX_CUES.MenuSelect);
      const item = flow.pendingNames[this.current];
      const row = item.row;
      if (row !== null) {
        // Naming builds the name and a new row — once per finished entry, not per tick.
        const rank = flow.save.renameScore(item.key, row, entry.name);
        item.row = rank >= 0 ? flow.save.hiScores(item.key)[rank] : null;
      }
      this.next();
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the heading, the player's score and rank, the letter picker and the time left.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const flow = this.flow;
    const item = flow.pendingNames[this.current < 0 ? 0 : this.current];
    const score = item.row === null ? 0 : item.row.score;
    drawPanel(list, CX - 112, 28, 224, 164, UI_COLORS.panel, UI_COLORS.focus, 255);
    list.setString(base, 'NEW HI-SCORE!');
    list.setString(base + 1, item.player === 0 ? '1P' : '2P');
    list.setString(base + 2, 'SCORE');
    list.setString(base + 3, 'RANK');
    list.setString(base + 4, HI_SCORE_RANK_LABELS[this.rank] ?? '');
    list.setString(base + 5, 'ENTER YOUR NAME');
    list.setString(base + 6, '↑↓ LETTER  → NEXT  ← BACK');
    list.setString(base + 7, 'TIME');
    list.text(base, CX, 38, UI_COLORS.focus, TextAlign.Center);
    list.text(base + 1, CX - 96, 60, UI_COLORS.title);
    list.text(base + 2, CX - 72, 60, UI_COLORS.text);
    list.number(score, CX + 96, 60, 8, UI_COLORS.text, TextAlign.Right);
    list.text(base + 3, CX - 72, 74, UI_COLORS.text);
    list.text(base + 4, CX + 96, 74, UI_COLORS.focus, TextAlign.Right);
    list.text(base + 5, CX, 98, UI_COLORS.title, TextAlign.Center);
    const blinkOff = ((this.ticks >> 4) & 1) === 1;
    drawNameEntry(list, this.entry, base + 8, CX, 126, blinkOff);
    list.text(base + 6, CX, 158, UI_COLORS.disabled, TextAlign.Center);
    list.text(base + 7, CX - 20, 176, UI_COLORS.text);
    list.number(this.seconds, CX + 20, 176, 2, UI_COLORS.text, TextAlign.Right);
  }
}

/** Hi-score screen modes. */
const HiScoreScreen = {
  /** The attract loop: a few tables in turn, any input → title. */
  Attract: 0,
  /** After a name entry: the game's table with its new rows lit, OK / timeout → title. */
  Result: 1,
} as const;

/**
 * The hi-score tables (shmup_feat.md §15 "hi-score table: top 10, name, score, zone reached, per
 * difficulty / mode"; §17; plan M2-15): one table per difficulty × ship × game mode (`core/save`
 * `hiScoreModeKey` — 1 PLAYER, 2 PLAYERS, PRACTICE).
 *
 * @remarks
 * A full screen over the starfield: `HI-SCORES`, the table's ship, difficulty and mode, then ten
 * rows — rank, name, score, zone reached (the campaign zone's map label, `-` for another stage;
 * empty rows `---`).
 *
 * - **In the attract loop** it shows the table of the chosen ship and difficulty for one player,
 *   then every other table that has scores (up to {@link HI_SCORE_ATTRACT_PAGES} in all), each for
 *   {@link HI_SCORE_PAGE_TICKS}, then the story (or the title); any input returns to the title.
 * - **After a game's name entry** it shows that game's table with its new rows blinking for
 *   {@link HI_SCORE_RESULT_TICKS}; OK or Back (after {@link HI_SCORE_LOCK_TICKS}) → the title.
 *
 * The page titles are built when the screen opens; rows are drawn from the table's own strings.
 */
export class HiScoreScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'hiScore' as const;
  /** 0 = attract, 1 = after a game (see the class docs). */
  mode: number = HiScoreScreen.Attract;
  /** The tables shown, as mode keys (built on `enter`). */
  readonly pages: string[] = [];
  /** Each page's title line (`KESTREL  NORMAL  1 PLAYER`; built on `enter`). */
  private readonly titles: string[] = [];
  /** The page showing. */
  page = 0;
  /** Ticks since the screen (or its page) opened. */
  ticks = 0;
  /** The key of the table a game's result shows (set by {@link HiScoreScene.showResult}). */
  private resultKey = '';

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 7 + 3 * HI_SCORE_TABLE_SIZE;
  }

  /** The mode key of the table showing (`''` without one). */
  get key(): string {
    return this.pages[this.page] ?? '';
  }

  /**
   * Prepares the screen for the attract loop (before it is pushed).
   */
  showAttract(): void {
    this.mode = HiScoreScreen.Attract;
  }

  /**
   * Prepares the screen for a game's result (before it is pushed).
   *
   * @param key - The table the game's rows are in.
   */
  showResult(key: string): void {
    this.mode = HiScoreScreen.Result;
    this.resultKey = key;
  }

  /** Builds the pages and their titles; the title theme. */
  override enter(): void {
    super.enter();
    const flow = this.flow;
    this.page = 0;
    this.ticks = 0;
    this.pages.length = 0;
    this.titles.length = 0;
    if (this.mode === HiScoreScreen.Result) {
      this.pages.push(this.resultKey);
    } else {
      const first = hiScoreModeKey(flow.worldConfig);
      this.pages.push(first);
      for (const mode of POWER_UP_MODES) {
        for (const preset of DIFFICULTY_PRESETS) {
          for (const kind of HI_SCORE_MODES) {
            if (this.pages.length >= HI_SCORE_ATTRACT_PAGES) break;
            const key = hiScoreModeKey({ powerUpMode: mode, difficulty: preset }, kind);
            if (key === first || flow.save.hiScores(key).length === 0) continue;
            this.pages.push(key);
          }
        }
      }
    }
    for (const key of this.pages) this.titles.push(flow.tableTitle(key));
    flow.music(MUSIC_CUES.Title, MUSIC_FADE_TICKS);
  }

  /**
   * Attract: pages in turn, then the story; any input → title. Result: the blink, OK / Back
   * after the lock or the timeout → title. Never allocates.
   */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    const pressed = flow.menuInput.pressed;
    if (this.mode === HiScoreScreen.Attract) {
      if (pressed !== 0) {
        flow.toTitle();
        return;
      }
      if (this.ticks >= HI_SCORE_PAGE_TICKS) {
        this.ticks = 0;
        this.page++;
        this.uiRevision++;
        if (this.page >= this.pages.length) flow.nextAttract(this);
      }
      return;
    }
    if (this.ticks % 16 === 0) this.uiRevision++; // the new rows blink
    const leave =
      this.ticks > HI_SCORE_LOCK_TICKS && (pressed & (Action.Confirm | Action.Back)) !== 0;
    if (leave || this.ticks >= HI_SCORE_RESULT_TICKS) {
      if (leave) flow.sfx(SFX_CUES.MenuSelect);
      flow.toTitle();
    }
  }

  /**
   * Draws the title, the table's name and its ten rows.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const flow = this.flow;
    const key = this.key;
    const rows = key === '' ? NO_ROWS : flow.save.hiScores(key);
    list.setString(base, 'HI-SCORES');
    list.setString(base + 1, this.titles[this.page] ?? '');
    list.setString(base + 2, 'RANK');
    list.setString(base + 3, 'NAME');
    list.setString(base + 4, 'SCORE');
    list.setString(base + 5, 'ZONE');
    list.setString(base + 6, '---');
    drawPanel(list, CX - 124, 8, 248, 200, UI_COLORS.panel, UI_COLORS.border, 232);
    list.text(base, CX, 16, UI_COLORS.focus, TextAlign.Center);
    list.text(base + 1, CX, 30, UI_COLORS.title, TextAlign.Center);
    const rankX = CX - 108;
    const nameX = CX - 60;
    const scoreX = CX + 60;
    const zoneX = CX + 100;
    list.text(base + 2, rankX, 48, UI_COLORS.disabled);
    list.text(base + 3, nameX, 48, UI_COLORS.disabled);
    list.text(base + 4, scoreX, 48, UI_COLORS.disabled, TextAlign.Right);
    list.text(base + 5, zoneX, 48, UI_COLORS.disabled, TextAlign.Center);
    const blinkOff = ((this.ticks >> 4) & 1) === 1;
    for (let i = 0; i < HI_SCORE_TABLE_SIZE; i++) {
      const y = 62 + i * 14;
      const row = i < rows.length ? rows[i] : null;
      const lit = row !== null && this.mode === HiScoreScreen.Result && flow.isNewRow(row);
      const color = lit ? (blinkOff ? UI_COLORS.text : UI_COLORS.focus) : UI_COLORS.text;
      const rankSlot = base + 7 + i;
      list.setString(rankSlot, HI_SCORE_RANK_LABELS[i]);
      list.text(rankSlot, rankX, y, i === 0 ? UI_COLORS.focus : UI_COLORS.title);
      if (row === null) {
        list.text(base + 6, nameX, y, UI_COLORS.disabled);
        continue;
      }
      const nameSlot = base + 7 + HI_SCORE_TABLE_SIZE + i;
      const zoneSlot = base + 7 + 2 * HI_SCORE_TABLE_SIZE + i;
      list.setString(nameSlot, row.name);
      list.setString(zoneSlot, flow.zoneLabel(row.reached));
      list.text(nameSlot, nameX, y, color);
      list.number(row.score, scoreX, y, 8, color, TextAlign.Right);
      list.text(zoneSlot, zoneX, y, color, TextAlign.Center);
    }
  }
}

/** An empty hi-score table. */
const NO_ROWS: readonly HiScoreEntry[] = Object.freeze([]);

/**
 * The attract loop's demo play (shmup_feat.md §16 "attract / demo mode: plays bundled replays";
 * plan M2-15): one of the content's demos (`core/data` `ContentDb.demos` — the 4-way bot's
 * recordings of the zones) in turn, played through `core/replay` {@link createDemoPlayback} — the
 * replay playback path, hashes checked.
 *
 * @remarks
 * A full screen: the flow shows the demo World's view and its own HUD (`DEMO PLAY` blinking over
 * it, the zone's label and name at the start). Its presentation events go to a private queue and
 * are forwarded to the session's — particles, shake, flash, dim and score popups, but no sound
 * effects or music (the demo is silent; the music fades out when it starts). When the recording
 * ends (or a hash differs — a demo recorded against other content) the hi-score screen follows;
 * **any input** returns to the title. The World is created when the demo starts and dropped when
 * the scene leaves (transitions); a tick plays one recorded tick without allocating, apart from
 * the behaviour coroutines of the stage's spawns (decision D29 — as in a game).
 */
export class DemoScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'demo' as const;
  /** The HUD draw list of the demo World. */
  readonly hudList: DrawList = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
  /** The HUD's change detection. */
  readonly hud: Hud;
  /** The demo playing, or `null` (none — or the scene is not on the stack). */
  demo: DemoPlayback | null = null;
  /** Demos started so far (the next one is `started % demos`). */
  started = 0;
  /** Ticks since the demo started. */
  ticks = 0;
  /** The demo World's own event queue. */
  private readonly events: EventQueue = createEventQueue();
  /** Forwards one of the demo World's events to the session's queue (not sounds; bound once). */
  private readonly forward: (event: Readonly<SimEvent>) => void;
  /** The zone card's first line (`ZONE B`; built when the demo starts). */
  private cardTitle = '';
  /** The zone card's second line (the zone's name). */
  private cardName = '';

  /**
   * Creates the scene.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    this.hud = createHud(flow.sprites);
    const target = flow.host.events;
    this.forward = (event) => {
      const kind = event.kind;
      if (DEMO_SILENT_KINDS[kind] === 1) return;
      target.push(kind, event.id, event.x, event.y, event.param);
    };
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 4;
  }

  /** The demo's World, or `null`. */
  get world(): World | null {
    return this.demo === null ? null : this.demo.world;
  }

  /** Starts the next demo (the music fades out); a demo that cannot start ends at once. */
  override enter(): void {
    super.enter();
    const flow = this.flow;
    const demos = flow.demos;
    this.ticks = 0;
    this.demo = null;
    this.events.clear();
    flow.music(MUSIC_CUES.Silence, MUSIC_FADE_TICKS);
    if (demos.length === 0) return;
    const replay = demos[this.started % demos.length];
    this.started++;
    try {
      this.demo = createDemoPlayback(replay, flow.host.content, { events: this.events });
    } catch (_error) {
      this.demo = null;
      return;
    }
    this.cardTitle = 'STAGE';
    this.cardName = '';
    const world = this.demo.world;
    if (world.stage !== null) {
      const stage = world.stage.stage;
      this.cardName = stage.name;
      const campaign = flow.host.content.campaign;
      if (campaign !== null) {
        for (const zone of campaign.zones) {
          if (zone.stage !== stage.id) continue;
          this.cardTitle = 'ZONE ' + zone.label;
          this.cardName = zone.name;
        }
      }
    }
    // The events of the World's creation (its stage theme) are not the screen's.
    this.events.clear();
    this.hud.invalidate();
  }

  /** Drops the demo World. */
  override exit(): void {
    this.demo = null;
    this.events.clear();
  }

  /**
   * Any input → title; else one recorded tick (its visible events forwarded), and when the demo
   * is over, the hi-score screen. Never allocates (see the class remarks).
   */
  tick(): void {
    const flow = this.flow;
    if (flow.menuInput.pressed !== 0) {
      flow.toTitle();
      return;
    }
    this.ticks++;
    if (this.ticks % PROMPT_BLINK_TICKS === 0 || this.ticks === DEMO_CARD_TICKS) {
      this.uiRevision++;
    }
    const demo = this.demo;
    if (demo === null) {
      flow.nextAttract(this);
      return;
    }
    const going = demo.step();
    this.events.drain(this.forward);
    if (!going) flow.nextAttract(this);
  }

  /**
   * Draws `DEMO PLAY` (blinking) and, at the start, the zone card.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    list.setString(base, 'DEMO PLAY');
    list.setString(base + 1, 'PRESS OK');
    list.setString(base + 2, this.cardTitle);
    list.setString(base + 3, this.cardName);
    if (Math.floor(this.ticks / PROMPT_BLINK_TICKS) % 2 === 0) {
      list.text(base, CX, 14, UI_COLORS.focus, TextAlign.Center);
    } else {
      list.text(base + 1, CX, 14, UI_COLORS.text, TextAlign.Center);
    }
    if (this.demo !== null && this.ticks < DEMO_CARD_TICKS) {
      list.rect(0, ZONE_CARD_Y, 384, 32, 0x000000, 128);
      list.text(base + 2, CX, ZONE_CARD_Y + 5, UI_COLORS.focus, TextAlign.Center);
      list.text(base + 3, CX, ZONE_CARD_Y + 18, UI_COLORS.title, TextAlign.Center);
    }
  }
}

/**
 * Per `SimEventKind`: 1 for the kinds a demo does **not** forward to the session — sounds, music,
 * ducking, rumble and host requests (the demo is silent and changes nothing outside its World).
 */
const DEMO_SILENT_KINDS: Uint8Array = (() => {
  const kinds = new Uint8Array(32);
  kinds[SimEventKind.Sfx] = 1;
  kinds[SimEventKind.Music] = 1;
  kinds[SimEventKind.MusicDuck] = 1;
  kinds[SimEventKind.Rumble] = 1;
  kinds[SimEventKind.UserOption] = 1;
  kinds[SimEventKind.PrepareStage] = 1;
  kinds[SimEventKind.SoundTest] = 1;
  return kinds;
})();

/** Story scene kinds, as codes (the `core/data` `STORY_SCENES` order). */
const StorySceneCode = { None: 0, Dawn: 1, Invasion: 2, Launch: 3 } as const;

/** Where the invasion scene's blasts flash: x, y pairs taken in turn (a fixed table). */
const INVASION_BLASTS: readonly number[] = Object.freeze([
  40, 60, 92, 88, 64, 40, 120, 70, 30, 96, 108, 50, 76, 104, 52, 76,
]);

/**
 * The attract loop's story crawl (shmup_feat.md §17 "attract-mode story crawl — text over sprite
 * scenes"; plan M2-15): the campaign's story (`core/data` `CampaignStoryPage`s — original text)
 * crawls up through a panel at the bottom of the screen while each page's sprite scene plays
 * above it: `dawn` (a star rising out of a quiet sea), `invasion` (the enemy's fortress and
 * flagship closing in through chained blasts), `launch` (the player's ships launching one after
 * the other, then the logo).
 *
 * @remarks
 * The rows (every page's lines and a blank row after each page) are flattened when the flow is
 * built; they rise one pixel every {@link STORY_SCROLL_TICKS} ticks and only those inside the
 * panel are drawn, through {@link STORY_STRING_SLOTS} slots taken by row number. A page's scene
 * takes over when its first row has crawled half-way up the panel. When the last row has left the
 * panel (the panel goes with it) and
 * {@link STORY_HOLD_TICKS} more have passed the attract loop returns to the title; **any input**
 * returns at once. The scenes are arithmetic on the tick count over fixed tables and the
 * sprites the game already has (the content's ships, the ending pieces, the logo). The title
 * theme plays on.
 */
export class StoryScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'story' as const;
  /** Ticks since it opened. */
  ticks = 0;
  /** The rows' texts (a page's lines, `''` for the blank row after a page). */
  readonly rows: readonly string[];
  /** Per page: its sprite scene (a `StorySceneCode`). */
  private readonly scenes: Uint8Array;
  /** Per page: the index of its first row. */
  private readonly firstRows: Int32Array;

  /**
   * Flattens the campaign's story into rows.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const campaign = flow.host.content.campaign;
    const pages = campaign === null ? [] : campaign.story;
    const rows: string[] = [];
    this.scenes = new Uint8Array(pages.length);
    this.firstRows = new Int32Array(pages.length);
    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      this.scenes[p] = Math.max(0, STORY_SCENES.indexOf(page.scene));
      this.firstRows[p] = rows.length;
      for (const line of page.lines) rows.push(line);
      rows.push('');
    }
    this.rows = rows;
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return STORY_STRING_SLOTS;
  }

  /** Pixels crawled so far. */
  get scroll(): number {
    return Math.floor(this.ticks / STORY_SCROLL_TICKS);
  }

  /** Ticks the whole story takes: every row through the panel, then the hold. */
  get duration(): number {
    const travel = this.rows.length * STORY_ROW_HEIGHT + (STORY_WINDOW_BOTTOM - STORY_WINDOW_TOP);
    return travel * STORY_SCROLL_TICKS + STORY_HOLD_TICKS;
  }

  /**
   * The page whose scene plays: the last one whose first row has crawled half-way up the window
   * (0 before).
   */
  get page(): number {
    const scroll = this.scroll;
    let page = 0;
    for (let p = 1; p < this.firstRows.length; p++) {
      if (scroll >= this.pageStart(p)) page = p;
    }
    return page;
  }

  /**
   * The scroll at which a page's scene takes over.
   *
   * @param page - Page index.
   * @returns Pixels crawled.
   */
  private pageStart(page: number): number {
    return page <= 0 ? 0 : this.firstRows[page] * STORY_ROW_HEIGHT + STORY_PAGE_LEAD;
  }

  /** Starts from the bottom; the title theme plays on. */
  override enter(): void {
    super.enter();
    this.ticks = 0;
    this.flow.music(MUSIC_CUES.Title, MUSIC_FADE_TICKS);
  }

  /** Crawls; any input or the end → title. Never allocates. */
  tick(): void {
    const flow = this.flow;
    if (flow.menuInput.pressed !== 0) {
      flow.toTitle();
      return;
    }
    this.ticks++;
    if (this.ticks % STORY_SCROLL_TICKS === 0 || (this.ticks & 1) === 0) this.uiRevision++;
    if (this.ticks >= this.duration) flow.nextAttract(this);
  }

  /**
   * Draws the page's scene and the rows inside the panel.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const page = this.page;
    const since = this.ticks - this.pageStart(page) * STORY_SCROLL_TICKS;
    const t = since > 0 ? since : 0;
    const scene = page < this.scenes.length ? this.scenes[page] : StorySceneCode.None;
    if (scene === StorySceneCode.Dawn) this.drawDawn(list, t);
    else if (scene === StorySceneCode.Invasion) this.drawInvasion(list, t);
    else if (scene === StorySceneCode.Launch) this.drawLaunch(list, t);
    const base = this.stringBase;
    const scroll = this.scroll;
    const rows = this.rows;
    // The panel while a row can be in it (the hold after the last row shows the scene alone).
    const p = STORY_PANEL;
    if (scroll < rows.length * STORY_ROW_HEIGHT + (STORY_WINDOW_BOTTOM - STORY_WINDOW_TOP)) {
      drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 232);
    }
    for (let r = 0; r < rows.length; r++) {
      const y = STORY_WINDOW_BOTTOM + r * STORY_ROW_HEIGHT - scroll;
      if (y < STORY_WINDOW_TOP || y > STORY_WINDOW_BOTTOM - 8) continue;
      const text = rows[r];
      if (text.length === 0) continue;
      const slot = base + (r % STORY_STRING_SLOTS);
      list.setString(slot, text);
      list.text(slot, CX, y, UI_COLORS.text, TextAlign.Center);
    }
  }

  /**
   * The dawn: a star rising out of a quiet sea.
   *
   * @param list - The UI list.
   * @param t - Ticks since the page began.
   */
  private drawDawn(list: DrawList, t: number): void {
    const sprites = this.flow.sprites;
    const rise = t > 360 ? 60 : Math.floor(t / 6);
    if (sprites.endingSun >= 0) list.sprite(sprites.endingSun, 0, 192, 104 - rise);
    list.rect(0, 100, 384, 24, 0x0a1e3a);
    if (sprites.endingSurface >= 0) {
      const drift = (t >> 3) % 64;
      for (let k = -1; k < 6; k++) list.sprite(sprites.endingSurface, 0, k * 64 + 32 - drift, 98);
    }
  }

  /**
   * The invasion: the fortress and the flagship closing in, blasts flashing over the home world.
   *
   * @param list - The UI list.
   * @param t - Ticks since the page began.
   */
  private drawInvasion(list: DrawList, t: number): void {
    const sprites = this.flow.sprites;
    const near = t > 300 ? 0 : 300 - t;
    if (sprites.endingCitadel >= 0) list.sprite(sprites.endingCitadel, 0, 270 + (near >> 1), 70);
    if (sprites.endingArk >= 0) list.sprite(sprites.endingArk, 0, 330 + near, 100);
    if (sprites.endingBlast >= 0 && t > 60) {
      const count = INVASION_BLASTS.length >> 1;
      for (let k = 0; k < 3; k++) {
        const age = t + k * 8;
        const n = Math.floor(age / 24) % count;
        const frame = (age % 24) >> 3;
        list.sprite(sprites.endingBlast, frame, INVASION_BLASTS[n * 2], INVASION_BLASTS[n * 2 + 1]);
      }
    }
  }

  /**
   * The launch: the ships racing off one after the other, then the logo.
   *
   * @param list - The UI list.
   * @param t - Ticks since the page began.
   */
  private drawLaunch(list: DrawList, t: number): void {
    const flow = this.flow;
    const ships = flow.ships;
    for (let i = 0; i < ships.length && i < 2; i++) {
      const start = i * 90;
      if (t < start) continue;
      const u = t - start;
      const x = -16 + Math.floor((u * u) / 128);
      if (x > 420) continue;
      const y = 56 + i * 32;
      const sprite = ships[i].spriteId;
      if (sprite >= 0) list.sprite(sprite, 0, x, y);
      list.rect(x - 40, y, 24, 1, UI_COLORS.title, 160);
    }
    const logo = flow.sprites.logo;
    if (t > 240 && logo >= 0) list.sprite(logo, 0, CX, 72);
  }
}

/** The practice select's panel: left, top, width, height. */
const PRACTICE_PANEL = Object.freeze({ x: CX - 120, y: 52, w: 240, h: 116 });

/** Where the practice select's menu is drawn (labels left, values from `valueX`). */
const PRACTICE_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: CX - 104,
  y: 74,
  lineHeight: 14,
  cursorX: CX - 114,
  valueX: CX - 28,
});

/**
 * The practice select (shmup_feat.md §16 "practice / stage select: choose stage, checkpoint,
 * loadout; separate score table"; plan M2-15): PRACTICE on the mode select.
 *
 * @remarks
 * An overlay over the title (dim {@link PAUSE_DIM}) with an opaque panel: ZONE (the campaign's
 * zones — `A AZURE VERGE` …), CHECKPOINT (`START` or the zone's checkpoints after its start —
 * stepping wraps within the zone's), LOADOUT ({@link PRACTICE_LOADOUT_LABELS}: the config's
 * starting loadout or full power) and START. START goes on to the difficulty menu and the ship /
 * weapon select as a normal start does; their last OK starts the practice run (`SceneFlow`
 * `startPractice`): one zone from that checkpoint with the zone's rank stage term, its clear
 * returning to the title. A practice run's scores go into **their own tables** (`core/save`
 * `hiScoreModeKey(…, 'practice')`, with the name entry), never the game's, and do not raise the
 * session hi-score; the HUD's HI is the practice table's best. Back returns to the mode select.
 * The mode select disables PRACTICE when the content has no campaign.
 */
export class PracticeScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'practice' as const;
  /** An overlay: the title stays visible under it. */
  override readonly overlay = true;
  /** {@link PAUSE_DIM}. */
  override readonly dim = PAUSE_DIM;
  /** ZONE: the campaign's zones. */
  readonly zone: Choice;
  /** CHECKPOINT: `START`, then `CHECKPOINT 1` … (as many as the zone with the most has). */
  readonly checkpoint: Choice;
  /** LOADOUT: {@link PRACTICE_LOADOUT_LABELS}. */
  readonly loadout: Choice = createChoice(PRACTICE_LOADOUT_LABELS, 0);
  /** The menu ({@link PracticeItem} order). */
  readonly menu: ListMenu;
  /**
   * Per zone: the indices into its stage's checkpoints CHECKPOINT offers (those after the stage's
   * start — the one at x 0 is START).
   */
  readonly checkpoints: readonly (readonly number[])[];

  /**
   * Creates the screen from the content's campaign.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const content = flow.host.content;
    const campaign = content.campaign;
    const zones = campaign === null ? [] : campaign.zones;
    const labels: string[] = [];
    const checkpoints: (readonly number[])[] = [];
    let most = 0;
    for (const zone of zones) {
      labels.push(zone.label + ' ' + zone.name);
      const stage = content.stages[zone.stageId];
      const list: number[] = [];
      if (stage !== undefined) {
        for (let i = 0; i < stage.checkpoints.length; i++) {
          if (stage.checkpoints[i].x > 0) list.push(i);
        }
      }
      if (list.length > most) most = list.length;
      checkpoints.push(Object.freeze(list));
    }
    if (labels.length === 0) labels.push('NONE');
    const points = ['START'];
    for (let i = 1; i <= most; i++) points.push('CHECKPOINT ' + String(i));
    this.checkpoints = Object.freeze(checkpoints);
    this.zone = createChoice(labels, 0);
    this.checkpoint = createChoice(points, 0);
    this.menu = createListMenu([
      { label: 'ZONE', choice: this.zone },
      { label: 'CHECKPOINT', choice: this.checkpoint },
      { label: 'LOADOUT', choice: this.loadout },
      'START',
    ]);
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 3 + menuStringSlots(this.menu);
  }

  /** Checkpoints the focused zone offers after its start. */
  private get zoneCheckpoints(): number {
    const list = this.checkpoints[this.zone.index];
    return list === undefined ? 0 : list.length;
  }

  /** Focus on ZONE (the last choices kept), locked for 2 ticks. */
  override enter(): void {
    super.enter();
    this.menu.focus = PracticeItem.Zone;
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /** Back from the difficulty menu: the menu takes input again after a short lock. */
  override uncover(): void {
    super.uncover();
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * Keeps CHECKPOINT within the zone's checkpoints after a change.
   *
   * @remarks
   * The choice's labels run to the busiest zone's count, so a step can land past the focused
   * zone's last: on CHECKPOINT a step forward from the zone's last wraps to `START`, a step back
   * from `START` (the choice wrapped to its own last label) wraps to the zone's last; a ZONE change
   * to a zone with fewer checkpoints takes its last. The index stays within the zone's count after
   * every tick, so on CHECKPOINT only a step from `START` can be the backward wrap.
   *
   * @param focus - The row that changed.
   * @param before - CHECKPOINT's index before the change.
   */
  private clampCheckpoint(focus: number, before: number): void {
    const count = this.zoneCheckpoints;
    const choice = this.checkpoint;
    if (choice.index <= count) return;
    choice.index = focus === PracticeItem.Checkpoint && before !== 0 ? 0 : count;
  }

  /**
   * Moves the focus, changes a row, START → the difficulty menu (the practice run starts after the
   * ship / weapon select), Back → the mode select. Never allocates.
   */
  tick(): void {
    const flow = this.flow;
    const menu = this.menu;
    const before = menu.revision;
    const checkpointBefore = this.checkpoint.index;
    const result = menuTick(menu, flow.menuInput);
    if (result === MenuResult.Changed) this.clampCheckpoint(menu.focus, checkpointBefore);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      flow.practice.active = false;
      flow.sfx(SFX_CUES.MenuBack);
      flow.stack.pop();
      return;
    }
    if (result === MenuResult.Confirmed && menu.focus === PracticeItem.Start) {
      const practice = flow.practice;
      practice.active = true;
      practice.zone = this.zone.index;
      const index = this.checkpoint.index;
      const list = this.checkpoints[this.zone.index];
      practice.checkpoint = index > 0 && list !== undefined ? (list[index - 1] ?? -1) : -1;
      practice.loadout = PRACTICE_LOADOUTS[this.loadout.index] ?? 'default';
      flow.sfx(SFX_CUES.MenuSelect);
      flow.choosePlayers(false);
      flow.stack.push(flow.difficultyMenu);
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the panel, `PRACTICE`, the rows and the table hint.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const p = PRACTICE_PANEL;
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    list.setString(base, 'PRACTICE');
    list.setString(base + 1, 'SCORES GO TO THE PRACTICE TABLES');
    list.setString(base + 2, '');
    list.text(base, CX, p.y + 8, UI_COLORS.title, TextAlign.Center);
    drawMenu(list, this.menu, base + 3, PRACTICE_MENU_LAYOUT);
    list.text(base + 1, CX, p.y + p.h - 16, UI_COLORS.disabled, TextAlign.Center);
  }
}

/** The sound test's panel: left, top, width, height. */
const SOUND_TEST_PANEL = Object.freeze({ x: CX - 128, y: 52, w: 256, h: 112 });

/**
 * The x the sound test plays a cue at: the playfield's centre, so a positional cue (the `sfx` bus
 * pans by x relative to the camera — the title's backdrop camera stays at 0) plays centred.
 */
const SOUND_TEST_SFX_X = PLAYFIELD_W / 2;

/** Where the sound test's menu is drawn. */
const SOUND_TEST_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: CX - 112,
  y: 74,
  lineHeight: 14,
  cursorX: CX - 122,
  valueX: CX - 64,
});

/**
 * The sound test (shmup_feat.md §21 "sound test — both originals had one"; plan M2-15): SOUND TEST
 * on the mode select.
 *
 * @remarks
 * An overlay over the title (dim {@link PAUSE_DIM}): MUSIC (the host's music library by title —
 * {@link SoundTestSetup}; disabled without one), SFX (every `SFX_CUES` cue, {@link SFX_TEST_LABELS}),
 * STOP and BACK. Left / Right choose a track or a sound, **OK plays it** — the track through a
 * `SimEventKind.SoundTest` event (the host loads it if needed and plays it), the sound as an `Sfx`
 * event at the playfield's centre (panned to the middle); STOP fades the music out; BACK or Back brings the title theme back and closes the screen.
 */
export class SoundTestScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'soundTest' as const;
  /** An overlay: the title stays visible under it. */
  override readonly overlay = true;
  /** {@link PAUSE_DIM}. */
  override readonly dim = PAUSE_DIM;
  /** MUSIC: the host's track titles (`NONE` when it has none). */
  readonly music: Choice;
  /** SFX: {@link SFX_TEST_LABELS}. */
  readonly sound: Choice = createChoice(SFX_TEST_LABELS, 0);
  /** The menu ({@link SoundTestItem} order). */
  readonly menu: ListMenu;
  /** The input the menu reads: the menu input without OK on MUSIC / SFX (reused). */
  private readonly input: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'none' };

  /**
   * Creates the screen from the host's music titles.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const titles = flow.soundTracks;
    this.music = createChoice(titles.length > 0 ? titles : ['NONE'], 0);
    this.menu = createListMenu(
      [
        { label: 'MUSIC', choice: this.music },
        { label: 'SFX', choice: this.sound },
        'STOP',
        'BACK',
      ],
      { disabledMask: titles.length === 0 ? 1 << SoundTestItem.Music : 0 },
    );
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 3 + menuStringSlots(this.menu);
  }

  /** Focus on the first enabled row, locked for 2 ticks. */
  override enter(): void {
    super.enter();
    this.menu.focusFirstEnabled(SoundTestItem.Music);
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /** Brings the title theme back and closes the screen. */
  private close(): void {
    this.flow.sfx(SFX_CUES.MenuBack);
    this.flow.music(MUSIC_CUES.Title, MUSIC_FADE_TICKS);
    this.flow.stack.pop();
  }

  /**
   * Left / Right choose, OK plays (MUSIC, SFX) / stops (STOP) / closes (BACK); Back closes. Never
   * allocates.
   */
  tick(): void {
    const flow = this.flow;
    const menu = this.menu;
    const source = flow.menuInput;
    const input = this.input;
    const focus = menu.focus;
    const playable = focus === SoundTestItem.Music || focus === SoundTestItem.Sfx;
    const play = playable && menu.lockTicks === 0 && (source.pressed & Action.Confirm) !== 0;
    // OK on MUSIC / SFX plays instead of stepping the choice (the menu never sees it).
    input.held = source.held;
    input.pressed = playable ? source.pressed & ~Action.Confirm : source.pressed;
    input.released = source.released;
    input.device = source.device;
    if (play) {
      if (focus === SoundTestItem.Music) {
        flow.host.events.push(SimEventKind.SoundTest, this.music.index, 0, 0, 0);
      } else {
        flow.host.events.push(SimEventKind.Sfx, this.sound.index, SOUND_TEST_SFX_X, 0, 0);
      }
    }
    const before = menu.revision;
    const result = menuTick(menu, input);
    if (menu.revision !== before) this.uiRevision++;
    if (result === MenuResult.Back) {
      this.close();
      return;
    }
    if (result === MenuResult.Confirmed) {
      if (menu.focus === SoundTestItem.Back) {
        this.close();
      } else if (menu.focus === SoundTestItem.Stop) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.music(MUSIC_CUES.Silence, MUSIC_FADE_TICKS);
      }
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the panel, `SOUND TEST`, the rows and the hint.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const p = SOUND_TEST_PANEL;
    drawPanel(list, p.x, p.y, p.w, p.h, UI_COLORS.panel, UI_COLORS.border, 255);
    list.setString(base, 'SOUND TEST');
    list.setString(base + 1, '← → CHOOSE   OK PLAY');
    list.setString(base + 2, '');
    list.text(base, CX, p.y + 8, UI_COLORS.title, TextAlign.Center);
    drawMenu(list, this.menu, base + 3, SOUND_TEST_MENU_LAYOUT);
    list.text(base + 1, CX, p.y + p.h - 16, UI_COLORS.disabled, TextAlign.Center);
  }
}

/** The M1 scene flow (see the module docs). */
export interface SceneFlow {
  /** The scene stack. */
  readonly stack: SceneStack;
  /** The boot screen. */
  readonly boot: BootScene;
  /** The title. */
  readonly title: TitleScene;
  /** The game (owns the World). */
  readonly game: GameScene;
  /** The pause menu. */
  readonly pause: PauseScene;
  /** The stage-clear screen. */
  readonly stageClear: StageClearScene;
  /** The game-over screen. */
  readonly gameOver: GameOverScene;
  /** The YES / NO dialog. */
  readonly confirm: ConfirmDialog;
  /** The Options screen. */
  readonly options: OptionsScene;
  /** The difficulty menu under START (M2-01). */
  readonly difficultyMenu: DifficultyScene;
  /** The ship select after the difficulty menu (M2-05). */
  readonly shipSelect: ShipSelectScene;
  /** The weapon select after the ship select (M2-03). */
  readonly weaponSelect: WeaponSelectScene;
  /** The Auto Power-Up order editor of the weapon select (M2-03). */
  readonly autoOrder: AutoOrderScene;
  /** The continue countdown (M2-01). */
  readonly continueScreen: ContinueScene;
  /** The zone map between the zones of a campaign run (M2-10). */
  readonly map: MapScene;
  /** The ending after a campaign run's final zone (M2-10). */
  readonly ending: EndingScene;
  /** The credits scroll after the ending (M2-14). */
  readonly credits: CreditsScene;
  /** The name entry after a game whose score entered a hi-score table (M2-15). */
  readonly nameEntry: NameEntryScene;
  /** The hi-score tables — the attract loop's and a game's result (M2-15). */
  readonly hiScores: HiScoreScene;
  /** The attract loop's demo play (M2-15). */
  readonly demo: DemoScene;
  /** The attract loop's story crawl (M2-15). */
  readonly story: StoryScene;
  /** The practice select (M2-15). */
  readonly practiceSelect: PracticeScene;
  /** The sound test (M2-15). */
  readonly soundTest: SoundTestScene;
  /**
   * The demos the attract loop plays, decoded from the content (`ContentDb.demos`, M2-15 — a demo
   * that does not decode is left out).
   */
  readonly demos: readonly Replay[];
  /**
   * The run in progress (M2-10): the campaign zone, the route, the players carried between zones,
   * the bonus-stage state and the run's flags.
   */
  readonly run: RunState;
  /**
   * The campaign the runs follow (M2-10): the content's (`ContentDb.campaign`) when the host
   * config's stage is its start zone's stage — the shipped game —, else `null`: single-stage runs
   * (a dev stage, open space) with the M1 stage-clear screen.
   */
  readonly campaign: CampaignSpec | null;
  /**
   * Starts a practice run (plan M2-10 plumbing; M2-15: the practice select calls it after the
   * difficulty / ship / weapon select): one campaign zone at a checkpoint with the next game's
   * config — the zone's rank stage term, a fresh start with the given loadout; its scores go into
   * the practice tables (with the name entry), its clear returns to the title.
   *
   * @param zone - A campaign zone id (the content's campaign, even outside campaign mode).
   * @param checkpoint - Index into the zone stage's checkpoints (-1 = its start; default).
   * @param loadout - The starting loadout (default `null` — the config's).
   * @returns `true` when the practice game starts (on the next applied transition); `false`
   *   without a campaign, for an unknown zone or an out-of-range checkpoint.
   */
  startPractice(zone: string, checkpoint?: number, loadout?: StartingLoadout | null): boolean;
  /**
   * The save the flow plays with (the host's store, or a memory-only one): options, hi-score
   * tables, stats.
   */
  readonly save: SaveStore;
  /**
   * The hi-score table the next game goes into (`core/save` `hiScoreModeKey` of
   * {@link SceneFlow.gameConfig} — one table per power-up mode and difficulty; since M2-15 a co-op
   * game's own `-2p` table; a practice run records into its `-practice` table instead).
   */
  readonly modeKey: string;
  /** The difficulty the next game plays (the host config's until one is chosen under START). */
  readonly difficulty: DifficultyPreset;
  /**
   * The config the next game's World gets: the host's for its own difficulty, `withDifficulty` of
   * it for another (the content's `rules` table — or the built-in one — gives the preset fields),
   * with the weapon select's loadout (`withArsenal`, M2-03) and the ship select's ship
   * (`withShip`, M2-05).
   */
  readonly gameConfig: GameConfig;
  /** The loadout chosen in the weapon select (empty until its first START — M2-03). */
  readonly arsenal: ArsenalChoice;
  /**
   * The ship chosen in the ship select (M2-05; `null` until the first choice — the host config's
   * ship flies).
   */
  readonly ship: ShipChoice | null;
  /** The ships the ship select offers (the content's; M2-05). */
  readonly ships: readonly PlayerShipSpec[];
  /** The input profiles the Options screen offers (empty: CONTROLS disabled). */
  readonly inputProfiles: readonly InputProfileChoice[];
  /**
   * Index of the input profile in use in {@link SceneFlow.inputProfiles} (-1 = none of them —
   * the host's own default). Changed by the Options screen.
   */
  readonly activeInputProfile: number;
  /** The top scene's binding context (`'menu'` on an empty stack). */
  readonly inputContext: InputContext;
  /** Whether the next game is a two-player co-op one (the title's `2 PLAYERS`, M2-06). */
  readonly coop: boolean;
  /**
   * How many player seats the host's input adapter should route now (M2-06): `2` while a co-op
   * game is on top (the game scene with a `config.coop` World — player 2's controller drives player
   * 2, an unassigned one may join) or its continue countdown (whose OK continues the player who
   * pressed it), else `1` (other menus and one-player games: every controller drives player 1).
   * `Game.inputSeats` forwards it; `@shmup/input-web` `WebInput.setSeats` takes it.
   */
  readonly inputSeats: number;
  /** The World of the game scene (a fresh one per game; a placeholder before the first). */
  readonly world: World;
  /** Every player's input of the current tick merged (what the menus read; reused). */
  readonly menuInput: PlayerInput;
  /**
   * The best score of the session for the chosen difficulty (the title shows it; each new World
   * starts from it) — from the save's best of that difficulty's table at start.
   */
  readonly hiScore: number;
  /** What the renderer draws now (refreshed by {@link SceneFlow.updateFrame}). */
  readonly view: SceneFlowView;
  /**
   * One tick: merges the menu input, ticks the top scene, applies its transitions. Never allocates
   * (a game start creates its World).
   *
   * @param input - This tick's input.
   * @throws Whatever the top scene or a transition throws (see {@link SceneStack.tick}).
   */
  tick(input: InputSnapshot): void;
  /**
   * Refreshes {@link SceneFlow.view}: the World's view and HUD when the game is visible, the dim of
   * the top scene and the UI list (rebuilt only when a visible scene's look changed). Call once
   * per displayed frame. Never allocates.
   *
   * @remarks
   * The visible scenes are the topmost non-overlay scene and every overlay above it. The UI list
   * is cleared and redrawn (bottom to top) only when that set or one of their
   * {@link Scene.uiRevision}s changed since the last build; the HUD goes through
   * `Hud.update`, which rebuilds only on a change. `Game.renderFrame()` calls this.
   */
  updateFrame(): void;
  /**
   * Updates the boot screen's bar.
   *
   * @param fraction - Progress 0…1.
   * @param label - Text above the bar (kept when omitted).
   */
  setBootProgress(fraction: number, label?: string): void;
  /** Loading is over: the boot screen shows the title on the next tick. */
  finishBoot(): void;
  /**
   * The platform resumed (the app was hidden): a running game is paused, so the player comes back
   * to the pause menu (shmup_feat.md §23).
   *
   * @remarks
   * Only when the game scene is on top (pushes the pause menu at once, with the pause sound); on
   * any other scene — the pause menu, a dialog, the title — nothing changes. `createGame` calls it
   * from `platform.lifecycle.onResume`.
   */
  onResume(): void;
  /**
   * Raises the chosen difficulty's session hi-score (the flow starts from the save's best of each
   * difficulty's table); a lower value changes nothing.
   *
   * @param value - A hi-score (floored; capped at the scoring's `MAX_SCORE` like the board's).
   */
  setHiScore(value: number): void;
}

/** The parts of the render frame the flow decides (see {@link SceneFlow.updateFrame}). */
export interface SceneFlowView {
  /**
   * The simulation tick the frame shows: the World's tick while the game is visible — frozen under
   * the pause menu and the end screens, so the renderer's particles and effects freeze with it, and
   * back to 0 for a new World, which clears them — else the flow's own tick count (the title's
   * backdrop keeps drifting).
   */
  readonly tick: number;
  /**
   * The game's World view while the game scene is visible, the weapon select's preview while that
   * is visible (M2-03), else `null`.
   */
  readonly world: WorldView | null;
  /** The HUD list while the game scene is visible, else an empty list. */
  readonly hud: DrawList;
  /** Every visible scene's widgets. */
  readonly ui: DrawList;
  /** The top scene's dim. */
  readonly dim: number;
}

/**
 * Creates the M1 scene flow on top of a game session and starts it.
 *
 * @remarks
 * Every scene, menu and draw list is created here, plus the game scene's placeholder World (its
 * queued presentation events are dropped — the flow starts on the boot screen or the title, not in
 * the stage; note that this clears the whole `host.events` queue). `start` `'boot'` waits for
 * {@link SceneFlow.finishBoot}; `'title'` starts on the title (title music queued); `'game'`
 * starts a game at once (dev / tests). Each scene gets its own range of the UI list's 96 string
 * slots. The session hi-score starts from `host.save`'s best score of the config's mode (a
 * memory-only store with the defaults when the host has none). `core/game`
 * `createGame(…, { scenes, save, inputProfiles })` calls this for you.
 *
 * @param host - The session: config, content, event queue, exit, World factory, save, profiles.
 * @param start - First scene (default `'boot'`).
 * @returns The running flow.
 * @throws {RangeError} When the scenes need more string slots than the UI list has (a
 *   programming error), or whatever `host.createWorld()` throws (an unknown `config.stage`).
 *
 * @example
 * ```ts
 * const flow = createSceneFlow(host, 'title');
 * flow.tick(input); // the title reads OK / Back …
 * flow.updateFrame();
 * renderer.render({ ...frame, world: flow.view.world, hud: flow.view.hud, ui: flow.view.ui });
 * ```
 */
export function createSceneFlow(host: SceneFlowHost, start: SceneStart = 'boot'): SceneFlow {
  const stack = createSceneStack();
  const events = host.events;
  const menuInput: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'none' };
  const save = host.save ?? createSaveStore(null);
  // One config per difficulty preset (the difficulty menu): the host's for its own preset.
  const table = host.content.difficulty ?? DEFAULT_DIFFICULTY_TABLE;
  const configs: GameConfig[] = [];
  const presets = DIFFICULTY_PRESETS.length;
  // One session hi-score per power-up mode and preset (M2-05), from the save's tables.
  const bests = new Float64Array(POWER_UP_MODES.length * presets);
  for (let i = 0; i < presets; i++) {
    const preset = DIFFICULTY_PRESETS[i];
    const config =
      preset === host.config.difficulty ? host.config : withDifficulty(host.config, preset, table);
    configs.push(config);
    for (let m = 0; m < POWER_UP_MODES.length; m++) {
      const key = hiScoreModeKey({ powerUpMode: POWER_UP_MODES[m], difficulty: preset });
      bests[m * presets + i] = Math.min(MAX_SCORE, save.bestScore(key));
    }
  }
  // The same with the weapon select's loadout (M2-03) and the ship select's ship (M2-05): the
  // configs themselves until a choice.
  const armed: GameConfig[] = configs.slice();
  /**
   * Index of a preset in {@link DIFFICULTY_PRESETS} (0 for an unknown one).
   *
   * @param preset - The preset.
   * @returns Its index.
   */
  const presetIndex = (preset: DifficultyPreset): number => {
    const i = DIFFICULTY_PRESETS.indexOf(preset);
    return i >= 0 ? i : 0;
  };
  // The ships of the ship select (M2-05): the content's, the built-in one without any.
  const ships: readonly PlayerShipSpec[] =
    host.content.ships.length > 0 ? host.content.ships : [DEFAULT_PLAYER_SHIP];
  let firstShip = 0;
  for (let i = 0; i < ships.length; i++) if (ships[i].id === host.config.shipId) firstShip = i;
  /**
   * Rebuilds every difficulty's armed config from the loadout and the ship chosen so far (a
   * choice already in a config keeps its object).
   */
  const rearm = (): void => {
    for (let i = 0; i < configs.length; i++) {
      let config = configs[i];
      if (!arsenalMatches(config, control.arsenal)) config = withArsenal(config, control.arsenal);
      if (control.ship !== null) config = withShip(config, control.ship);
      armed[i] = withCoop(config, control.coop);
    }
  };
  // The campaign (M2-10): when the host's stage is its start zone's stage, games are campaign runs.
  const contentCampaign = host.content.campaign;
  const campaign =
    contentCampaign !== null &&
    host.config.stage !== null &&
    contentCampaign.zones[contentCampaign.startIndex].stage === host.config.stage
      ? contentCampaign
      : null;
  const run = new RunState();
  // The attract loop's demos (M2-15): decoded once; a demo that does not decode or names a stage
  // the content lacks is left out (the loop plays the others).
  const demos: Replay[] = [];
  for (const demo of host.content.demos) {
    if (demo.stage !== null && demo.stageIndex < 0) continue;
    try {
      demos.push(decodeReplay(demo.document));
    } catch (_error) {
      // A broken demo is skipped (`pnpm content:check` plays every shipped one).
    }
  }
  // The hi-score rows' zone column (M2-15): a stage's campaign label.
  const zoneLabels = new Map<string, string>();
  if (contentCampaign !== null) {
    for (const zone of contentCampaign.zones) zoneLabels.set(zone.stage, zone.label);
  }
  const soundTracks: readonly string[] =
    host.soundTest === undefined || host.soundTest === null ? [] : host.soundTest.music;
  const pendingNames: PendingName[] = [];
  for (let p = 0; p < MAX_PLAYERS; p++) pendingNames.push(new PendingName());
  const setup = host.inputProfiles ?? null;
  const profiles: readonly InputProfileChoice[] = setup === null ? [] : setup.choices;
  let activeProfile = -1;
  if (setup !== null) {
    for (let i = 0; i < profiles.length; i++)
      if (profiles[i].id === setup.active) activeProfile = i;
  }
  const control = {
    stack,
    host,
    sprites: resolveUiSprites(host.content),
    menuInput,
    save,
    run,
    campaign,
    beginRun(): void {
      run.begin(campaign, control.worldConfig.stage);
      // Rows of an earlier game are named already (or were never asked for — a quit).
      control.pendingCount = 0;
      // Pushed before the World's stage theme: a set already resident switches at once.
      control.prepareStage(run.stage);
    },
    // The shell prepares the host config's stage while loading.
    preparedStage:
      host.config.stage === null ? -1 : (host.content.stageIndex.get(host.config.stage) ?? -1),
    prepareStage(stage: string | null): void {
      const index = stage === null ? -1 : (host.content.stageIndex.get(stage) ?? -1);
      if (index < 0 || index === control.preparedStage) return;
      control.preparedStage = index;
      events.push(SimEventKind.PrepareStage, index, 0, 0, 0);
    },
    createRunWorld(carry: CarryState | null): World {
      const world = host.createWorld(runWorldConfig(control.worldConfig, run));
      return prepareRunWorld(world, run, carry);
    },
    enterBonus(): void {
      const world = control.game.world;
      const spec = host.content.stages[world.bonus.enteredStage()];
      if (spec === undefined) return;
      run.noteWorldEnd(world);
      captureCarry(world, run.carry);
      run.bonusReturnX = world.bonus.enteredX();
      run.inBonus = true;
      run.bonusStage = spec.id;
      control.game.swapWorld(control.createRunWorld(run.carry));
    },
    failBonus(): void {
      const world = control.game.world;
      run.noteWorldEnd(world);
      captureCarry(world, run.carry);
      run.leaveBonus(true);
      control.game.swapWorld(control.createRunWorld(run.carry));
    },
    advanceZone(zone: number): void {
      run.advance(zone);
      run.pendingStart = true;
    },
    difficulty: host.config.difficulty,
    coop: host.config.coop,
    choosePlayers(coop: boolean): void {
      if (control.coop === coop) return;
      control.coop = coop;
      rearm();
    },
    configs,
    bests,
    get worldConfig(): GameConfig {
      return armed[presetIndex(control.difficulty)];
    },
    arsenal: {},
    chooseArsenal(arsenal: ArsenalChoice): void {
      // A loadout the config already has keeps the config object (the host's, for its preset).
      control.arsenal = arsenal;
      rearm();
    },
    ships,
    shipIndex: firstShip,
    ship: null,
    chooseShip(index: number): void {
      const spec = ships[index];
      if (spec === undefined) return;
      control.shipIndex = index;
      control.ship = { shipId: spec.id, powerUpMode: spec.mode };
      rearm();
      control.title.uiRevision++;
    },
    bestIndex(preset: DifficultyPreset): number {
      const mode = POWER_UP_MODES.indexOf(control.worldConfig.powerUpMode);
      return (mode >= 0 ? mode : 0) * presets + presetIndex(preset);
    },
    get modeKey(): string {
      const config = control.worldConfig;
      return hiScoreModeKey(config, config.coop ? '2p' : '1p');
    },
    get hiScore(): number {
      return bests[control.bestIndex(control.difficulty)];
    },
    raiseHiScore(value: number): void {
      const i = control.bestIndex(control.difficulty);
      if (value > bests[i]) bests[i] = value > MAX_SCORE + 9 ? MAX_SCORE + 9 : Math.floor(value);
    },
    chooseDifficulty(difficulty: DifficultyPreset): void {
      if (DIFFICULTY_PRESETS.indexOf(difficulty) < 0) return;
      control.difficulty = difficulty;
      control.title.uiRevision++;
    },
    profiles,
    activeProfile,
    userOption(kind: number, value: number): void {
      events.push(SimEventKind.UserOption, kind, 0, 0, value);
    },
    recordRun(cleared: boolean): number {
      const world = control.game.world;
      const scores = world.scoring.board.scores;
      const reached = world.stage === null ? '' : world.stage.stage.id;
      // The World's own table: its difficulty (chosen under START), ship and mode name it — a
      // practice run has tables of its own (M2-15).
      const mode: HiScoreMode = run.practice ? 'practice' : world.config.coop ? '2p' : '1p';
      const key = hiScoreModeKey(world.config, mode);
      control.resultKey = key;
      control.pendingCount = 0;
      let rank = -1;
      for (let p = 0; p < scores.length && p < world.players.length; p++) {
        if (p > 0 && !world.players[p].active) continue;
        const r = save.recordScore(
          key,
          createHiScoreEntry(scores[p].score, {
            reached,
            mode,
            difficulty: world.config.difficulty,
          }),
        );
        if (p === 0) rank = r;
        if (r >= 0 && control.pendingCount < pendingNames.length) {
          // The name entry names the row the table now holds (found again by identity).
          const pending = pendingNames[control.pendingCount++];
          pending.key = key;
          pending.row = save.hiScores(key)[r] ?? null;
          pending.player = p;
        }
      }
      if (!run.practice) save.count(cleared ? 'stagesCleared' : 'gameOvers');
      void save.flush();
      return rank;
    },
    demos,
    soundTracks,
    practice: new PracticeChoice(),
    pendingNames,
    pendingCount: 0,
    resultKey: '',
    startAttract(): void {
      if (demos.length > 0) stack.reset(control.demo);
      else control.nextAttract(control.demo);
    },
    nextAttract(from: Scene): void {
      if (from === control.demo) {
        control.hiScores.showAttract();
        stack.reset(control.hiScores);
      } else if (from === control.hiScores && control.story.rows.length > 0) {
        stack.reset(control.story);
      } else {
        control.toTitle();
      }
    },
    finishGame(): void {
      if (control.pendingCount > 0) stack.reset(control.nameEntry);
      else control.toTitle();
    },
    showResults(): void {
      control.hiScores.showResult(control.resultKey);
      stack.reset(control.hiScores);
    },
    isNewRow(row: HiScoreEntry): boolean {
      for (let i = 0; i < control.pendingCount; i++) if (pendingNames[i].row === row) return true;
      return false;
    },
    tableTitle(key: string): string {
      const parts = parseHiScoreModeKey(key);
      if (parts === null) return key.toUpperCase();
      let ship = parts.powerUpMode.toUpperCase();
      for (let i = ships.length - 1; i >= 0; i--) {
        if (ships[i].mode === parts.powerUpMode) ship = ships[i].name.toUpperCase();
      }
      const preset = DIFFICULTY_PRESETS.indexOf(parts.difficulty as DifficultyPreset);
      const difficulty = preset >= 0 ? DIFFICULTY_LABELS[preset] : parts.difficulty.toUpperCase();
      const label = HI_SCORE_MODE_LABELS[HI_SCORE_MODES.indexOf(parts.mode)] ?? '';
      return ship + '  ' + difficulty + '  ' + label;
    },
    zoneLabel(stage: string): string {
      return zoneLabels.get(stage) ?? '-';
    },
    launchGame(): void {
      const practice = control.practice;
      if (practice.active) {
        practice.active = false;
        if (control.beginPractice(practice.zone, practice.checkpoint, practice.loadout)) return;
      }
      stack.reset(control.game);
    },
    beginPractice(zone: number, checkpoint: number, loadout: StartingLoadout | null): boolean {
      const practice = host.content.campaign;
      if (practice === null || zone < 0 || zone >= practice.zones.length) return false;
      const stage = host.content.stages[practice.zones[zone].stageId];
      if (stage === undefined) return false;
      if (!Number.isInteger(checkpoint) || checkpoint < -1) return false;
      if (checkpoint >= stage.checkpoints.length) return false;
      run.beginPractice(practice, zone, checkpoint, loadout);
      run.pendingStart = true;
      control.pendingCount = 0;
      control.prepareStage(run.stage);
      save.count('gamesStarted');
      stack.reset(control.game);
      return true;
    },
    sfx(cue: number): void {
      events.push(SimEventKind.Sfx, cue, 0, 0, 0);
    },
    music(cue: number, fade: number): void {
      events.push(SimEventKind.Music, cue, 0, 0, fade);
    },
    menuSound(result: number): void {
      const cue = menuResultSfx(result);
      if (cue >= 0) events.push(SimEventKind.Sfx, cue, 0, 0, 0);
    },
    ask(purpose: ConfirmPurpose): void {
      control.confirm.prepare(purpose);
      events.push(SimEventKind.Sfx, SFX_CUES.MenuSelect, 0, 0, 0);
      stack.push(control.confirm);
    },
    toTitle(): void {
      stack.reset(control.title);
    },
    // The scene fields are filled right below (the scenes take the control in their constructors).
  } as unknown as { -readonly [K in keyof FlowControl]: FlowControl[K] };
  control.boot = new BootScene(control);
  control.title = new TitleScene(control);
  control.game = new GameScene(control);
  control.pause = new PauseScene(control);
  control.stageClear = new StageClearScene(control);
  control.gameOver = new GameOverScene(control);
  control.confirm = new ConfirmDialog(control);
  control.options = new OptionsScene(control);
  control.difficultyMenu = new DifficultyScene(control);
  control.shipSelect = new ShipSelectScene(control);
  control.weaponSelect = new WeaponSelectScene(control);
  control.autoOrder = new AutoOrderScene(control);
  control.continueScreen = new ContinueScene(control);
  control.map = new MapScene(control);
  control.ending = new EndingScene(control);
  control.credits = new CreditsScene(control);
  control.nameEntry = new NameEntryScene(control);
  control.hiScores = new HiScoreScene(control);
  control.demo = new DemoScene(control);
  control.story = new StoryScene(control);
  control.practiceSelect = new PracticeScene(control);
  control.soundTest = new SoundTestScene(control);
  control.game.world.scoring.board.setHiScore(control.hiScore);
  // The placeholder World queued its stage theme; the flow does not start in the stage.
  events.clear();

  const scenes: SceneBase[] = [
    control.boot,
    control.title,
    control.game,
    control.pause,
    control.stageClear,
    control.gameOver,
    control.confirm,
    control.options,
    control.difficultyMenu,
    control.shipSelect,
    control.weaponSelect,
    control.autoOrder,
    control.continueScreen,
    control.map,
    control.ending,
    control.credits,
    control.nameEntry,
    control.hiScores,
    control.demo,
    control.story,
    control.practiceSelect,
    control.soundTest,
  ];
  let base = 0;
  for (const scene of scenes) {
    scene.stringBase = base;
    base += scene.stringSlots;
  }
  if (base > UI_STRINGS) throw new RangeError(`the scenes need ${base} string slots`);

  const ui = createDrawList(UI_COMMANDS, UI_STRINGS);
  const emptyHud = createDrawList(1, 1);
  const view: {
    tick: number;
    world: WorldView | null;
    hud: DrawList;
    ui: DrawList;
    dim: number;
  } = {
    tick: 0,
    world: null,
    hud: emptyHud,
    ui,
    dim: 0,
  };
  // What the UI list was last built from: the visible scenes and their looks.
  const drawnScenes: Array<Scene | null> = [];
  const drawnRevisions = new Int32Array(SCENE_STACK_DEPTH);
  for (let i = 0; i < SCENE_STACK_DEPTH; i++) drawnScenes.push(null);
  let drawnCount = -1;
  let flowTicks = 0;

  const flow: SceneFlow = {
    stack,
    boot: control.boot,
    title: control.title,
    game: control.game,
    pause: control.pause,
    stageClear: control.stageClear,
    gameOver: control.gameOver,
    confirm: control.confirm,
    options: control.options,
    difficultyMenu: control.difficultyMenu,
    shipSelect: control.shipSelect,
    weaponSelect: control.weaponSelect,
    autoOrder: control.autoOrder,
    continueScreen: control.continueScreen,
    map: control.map,
    ending: control.ending,
    credits: control.credits,
    nameEntry: control.nameEntry,
    hiScores: control.hiScores,
    demo: control.demo,
    story: control.story,
    practiceSelect: control.practiceSelect,
    soundTest: control.soundTest,
    demos,
    run,
    campaign,
    startPractice(zone: string, checkpoint = -1, loadout: StartingLoadout | null = null): boolean {
      const practice = host.content.campaign;
      if (practice === null) return false;
      const index = campaignZoneIndex(practice, zone);
      if (index < 0) return false;
      return control.beginPractice(index, checkpoint, loadout);
    },
    save,
    get modeKey(): string {
      return control.modeKey;
    },
    get difficulty(): DifficultyPreset {
      return control.difficulty;
    },
    get gameConfig(): GameConfig {
      return control.worldConfig;
    },
    get arsenal(): ArsenalChoice {
      return control.arsenal;
    },
    get ship(): ShipChoice | null {
      return control.ship;
    },
    ships,
    inputProfiles: profiles,
    get activeInputProfile(): number {
      return control.activeProfile;
    },
    get inputContext(): InputContext {
      const top = stack.top;
      return top === null ? 'menu' : top.inputContext;
    },
    get coop(): boolean {
      return control.coop;
    },
    get inputSeats(): number {
      // The game and its continue countdown (whose OK is per player) read player 2's seat.
      const top = stack.top;
      const perPlayer = top === control.game || top === control.continueScreen;
      return perPlayer && control.game.world.config.coop ? 2 : 1;
    },
    get world(): World {
      return control.game.world;
    },
    menuInput,
    get hiScore(): number {
      return control.hiScore;
    },
    view,
    tick(input) {
      mergeMenuInput(input, menuInput);
      stack.tick(input);
      flowTicks++;
    },
    updateFrame() {
      const depth = stack.depth;
      let bottom = depth - 1;
      while (bottom > 0 && stack.sceneAt(bottom)?.overlay === true) bottom--;
      if (bottom < 0) bottom = 0;
      const game = control.game;
      const select = control.weaponSelect;
      const demo = control.demo;
      let gameVisible = false;
      let selectVisible = false;
      let demoVisible = false;
      for (let i = bottom; i < depth; i++) {
        const scene = stack.sceneAt(i);
        if (scene === game) gameVisible = true;
        else if (scene === select) selectVisible = true;
        else if (scene === demo) demoVisible = true;
      }
      const preview = select.preview;
      const demoWorld = demo.world;
      if (demoVisible && demoWorld !== null) {
        // The attract loop's demo (M2-15): its World and its own HUD.
        view.tick = demoWorld.tick;
        view.world = demoWorld.view;
        demo.hud.showBossHp = control.save.options.display.bossHpBar;
        demo.hud.update(demoWorld, demo.hudList);
        view.hud = demo.hudList;
      } else if (gameVisible) {
        view.tick = game.world.tick;
        view.world = game.world.view;
        // The boss HP bar follows the saved display option (M2-09).
        game.hud.showBossHp = control.save.options.display.bossHpBar;
        game.hud.update(game.world, game.hudList);
        view.hud = game.hudList;
      } else if (selectVisible && preview !== null) {
        // The weapon select's live preview (M2-03): its World, no HUD.
        view.tick = preview.tick;
        view.world = preview.view;
        view.hud = emptyHud;
      } else {
        view.tick = flowTicks;
        view.world = null;
        view.hud = emptyHud;
      }
      const top = stack.top;
      view.dim = top === null ? 0 : top.dim;
      let dirty = depth - bottom !== drawnCount;
      for (let i = bottom; !dirty && i < depth; i++) {
        const scene = stack.sceneAt(i);
        const k = i - bottom;
        if (
          scene !== drawnScenes[k] ||
          (scene !== null && scene.uiRevision !== drawnRevisions[k])
        ) {
          dirty = true;
        }
      }
      if (!dirty) return;
      ui.clear();
      drawnCount = depth - bottom;
      for (let i = bottom; i < depth; i++) {
        const scene = stack.sceneAt(i);
        const k = i - bottom;
        drawnScenes[k] = scene;
        drawnRevisions[k] = scene === null ? 0 : scene.uiRevision;
        scene?.drawUi(ui);
      }
      for (let k = drawnCount; k < SCENE_STACK_DEPTH; k++) drawnScenes[k] = null;
    },
    setBootProgress(fraction, label) {
      const boot = control.boot;
      boot.progress = fraction;
      if (label !== undefined) boot.label = label;
      boot.uiRevision++;
    },
    finishBoot() {
      control.boot.done = true;
    },
    onResume() {
      if (stack.top === control.game) {
        control.sfx(SFX_CUES.PauseToggle);
        stack.push(control.pause);
      }
    },
    setHiScore(value) {
      // Capped like the scoring board's, so the title and a new World show the same value.
      control.raiseHiScore(value > MAX_SCORE ? MAX_SCORE : value);
      control.game.world.scoring.board.setHiScore(control.hiScore);
      control.title.uiRevision++;
    },
  };

  stack.reset(start === 'game' ? control.game : start === 'title' ? control.title : control.boot);
  return flow;
}
