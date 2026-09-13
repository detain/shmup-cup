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
 *   - {@link TitleScene}: the logo, a blinking `PRESS OK`, then the menu START / OPTIONS / EXIT —
 *     EXIT only when the platform can quit (`platform.exit`). Shows the saved hi-score, plays the
 *     title music.
 *   - {@link DifficultyScene} (overlay, M2-01 — START): EASY / NORMAL / HARD / ARCADE with the
 *     focused preset's lives, continues and hi-score; OK starts the game on that preset (its World
 *     gets `core/config` `withDifficulty` of the host config — {@link SceneFlow.gameConfig}), Back
 *     returns to the title menu.
 *   - {@link GameScene}: **owns the World** — every start (and RETRY STAGE) creates a fresh one;
 *     ticks it with the snapshot; Pause (remote Play/Pause, Back — bound to Pause in the game
 *     context) opens the pause menu; `stageClear` / `gameOver` open their screens after a short
 *     delay; draws the HUD (`core/ui` {@link Hud}) and the boss WARNING band.
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
 *   **Saves (M1-17).** The flow plays with a `core/save` {@link SaveStore} (the host's, loaded
 *   before the title — or a memory-only one): the session hi-score of each difficulty starts from
 *   the saved best of its table ({@link SceneFlow.modeKey}: power-up mode and difficulty); when a
 *   game ends on the game-over or stage-clear screen its score is inserted into its difficulty's
 *   table (name `---` until the name entry of M2-15), the statistics count, and the save is
 *   written (only when it changed); closing the Options screen writes the options the same way.
 *   - {@link ConfirmDialog} (overlay): YES / NO, focused on NO — the Tizen **exit confirmation**
 *     (Back on the title, or EXIT: `platform.exit()` runs only after YES — shmup_feat.md §23) and
 *     "quit to title?".
 *
 *   A platform resume while the game scene is on top pushes the pause menu (the player returns to a
 *   paused game — shmup_feat.md §23); Play/Pause toggles pause. **Back** walks the stack: game →
 *   pause, pause → resume, menus → back, title → exit confirmation. The flow composes what the
 *   renderer draws: the World's view and HUD while the game scene is visible (under overlays), one
 *   UI draw list with every visible scene's widgets (rebuilt only when a visible scene's look
 *   changed), and the dim of the top overlay. Menu sounds, the pause toggle and the title / stage
 *   clear / game over music are pushed into the game's event queue.
 *
 * Nothing allocates per tick or per frame: every scene, menu and draw list is created with the
 * flow; only a World is created per game start (a scene transition, not a tick).
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
 * - **Difficulty** — Up / Down: move; OK: start the game on the focused preset; Back: title menu.
 * - **Continue** — OK: continue; Back: give up (both after a 30-tick lock).
 * - **Game** — Pause or Back: pause menu.
 * - **Pause** — Pause or Back: resume; OK: activate; Up / Down: move.
 * - **Options** — Up / Down: move; Left / Right: change the slider / profile (OK steps the profile
 *   too); Back or BACK: save and close.
 * - **Confirm** — Left / Up: YES, Right / Down: NO; OK: answer; Back: NO.
 * - **Stage clear** — OK: skip ahead. **Game over** — OK or Back (after a 30-tick lock): title.
 *
 * **Implements.**
 * - shmup_feat.md §17 Screens, UI flow & HUD — scene flow, title / pause / game over / stage clear
 * - shmup_feat.md §22 — scene stack / state machine
 * - shmup_feat.md §23 — Tizen Back key and exit confirmation, pause on resume
 * - shmup_feat.md §4 — rule 8: menus fully D-pad + OK + Back navigable
 * - shmup_feat.md §21 — the Options menu (audio sliders, controls profile) and saved hi-scores
 * - shmup_feat.md §16 — difficulty select; §10 — continues (the countdown)
 *
 * **Public API.** {@link SceneStack}, {@link createSceneStack}, {@link SCENE_STACK_DEPTH},
 * {@link Scene}, {@link SceneId}, {@link SceneFlow}, {@link SceneFlowHost}, {@link SceneStart},
 * {@link createSceneFlow}, {@link mergeMenuInput}, the scenes ({@link BootScene},
 * {@link TitleScene}, {@link DifficultyScene}, {@link GameScene}, {@link PauseScene},
 * {@link OptionsScene}, {@link StageClearScene}, {@link ContinueScene}, {@link GameOverScene},
 * {@link ConfirmDialog}), {@link ConfirmPurpose},
 * {@link InputProfileSetup}, the menu item indices ({@link TitleItem}, {@link PauseItem},
 * {@link OptionsItem} — BULLETS since M2-02 —), the Options screen's bullet palette labels
 * ({@link BULLET_PALETTE_LABELS}, M2-02) and the timing constants ({@link STAGE_CLEAR_DELAY_TICKS},
 * {@link GAME_OVER_DELAY_TICKS}, {@link GAME_OVER_TIMEOUT_TICKS}, {@link GAME_OVER_LOCK_TICKS},
 * {@link STAGE_CLEAR_TALLY_TICKS}, {@link STAGE_CLEAR_CONTINUED_TICKS}, {@link PAUSE_DIM},
 * {@link CONTINUE_COUNTDOWN_TICKS}, {@link CONTINUE_LOCK_TICKS}).
 *
 * **Planned.** Attract mode, mode / ship / weapon select, the zone map, name entry, hi-score
 * table, ending and credits (M2); more option groups (controls rebinding, display, game — M2-16).
 *
 * @module
 */
import {
  BULLET_PALETTES,
  DEFAULT_DIFFICULTY_TABLE,
  DIFFICULTY_PRESETS,
  VOLUME_LEVELS,
  withDifficulty,
  type DifficultyPreset,
  type GameConfig,
  type InputProfileChoice,
  type UserOptions,
} from '../config/index.js';
import type { ContentDb } from '../data/index.js';
import {
  MUSIC_CUES,
  SFX_CUES,
  SimEventKind,
  UserOptionKind,
  type EventQueue,
} from '../events/index.js';
import { Action, type InputContext, type InputSnapshot, type PlayerInput } from '../input/index.js';
import { defineModule } from '../module-info.js';
import { TextAlign, createDrawList, type DrawList, type WorldView } from '../presentation/index.js';
import {
  createHiScoreEntry,
  createSaveStore,
  hiScoreModeKey,
  type SaveStore,
} from '../save/index.js';
import { MAX_SCORE } from '../scoring/index.js';
import {
  CONFIRM_STRING_SLOTS,
  ConfirmChoice,
  MenuResult,
  UI_COLORS,
  confirmTick,
  createChoice,
  createConfirm,
  createHud,
  createListMenu,
  createSlider,
  drawConfirm,
  drawMenu,
  drawPanel,
  menuResultSfx,
  menuStringSlots,
  menuTick,
  resolveUiSprites,
  type Choice,
  type Confirm,
  type Hud,
  type ListMenu,
  type MenuLayout,
  type Slider,
  type UiSprites,
} from '../ui/index.js';
import { canContinue, continueWorld, stepWorld, type World } from '../world/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'scenes',
  status: 'partial',
  specRefs: [
    'shmup_feat.md §17',
    'shmup_feat.md §22',
    'shmup_feat.md §23',
    'shmup_feat.md §4',
    'shmup_feat.md §21',
    'shmup_feat.md §16',
    'shmup_feat.md §10',
  ],
});

/**
 * Scene identifiers (the M1 set, the difficulty menu and continue countdown of M2-01, plus the M2
 * screens already named by the spec).
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
  | 'continue'
  | 'attract'
  | 'select'
  | 'map'
  | 'options'
  | 'nameEntry'
  | 'hiScore'
  | 'ending'
  | 'credits';

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
 * Title menu items (indices into the title menu; EXIT only exists when the platform can quit).
 * OPTIONS opens the {@link OptionsScene}.
 */
export const TitleItem = { Start: 0, Options: 1, Exit: 2 } as const;

/**
 * Pause menu items: RESUME, OPTIONS (the {@link OptionsScene} over the paused game), RETRY STAGE
 * (no confirmation), QUIT TO TITLE (through the {@link ConfirmDialog}).
 */
export const PauseItem = { Resume: 0, Options: 1, Retry: 2, Quit: 3 } as const;

/**
 * Options screen items: the three volume sliders, the input profile, the bullet palette (M2-02),
 * BACK.
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
  /** BACK: store the options, write the save and close (index 5 since M2-02 — was 4). */
  Back: 5,
} as const;

/** The Options screen's BULLETS labels, in `BULLET_PALETTES` order (M2-02). */
export const BULLET_PALETTE_LABELS: readonly string[] = Object.freeze([
  'STANDARD',
  'DEUTERANOPIA',
  'PROTANOPIA',
  'TRITANOPIA',
]);

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

/** Ticks of the continue countdown (10 s — shmup_feat.md §17 "continue countdown"). */
export const CONTINUE_COUNTDOWN_TICKS = 600;

/** Ticks the continue countdown ignores OK and Back (so a mashed button decides nothing). */
export const CONTINUE_LOCK_TICKS = 30;

/** The `mode` of the hi-score rows a game records (one player — shmup_feat.md §16). */
const HI_SCORE_MODE_1P = '1p';

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

/** Frame centre x. */
const CX = 192;

/** String slots of the UI list. */
const UI_STRINGS = 96;

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

/** The Options screen's panel: left, top, width, height. */
const OPTIONS_PANEL = Object.freeze({ x: 48, y: 44, w: 288, h: 128 });

/** Where the Options menu is drawn (labels left, values from x 150). */
const OPTIONS_MENU_LAYOUT: MenuLayout = Object.freeze({
  x: 72,
  y: 74,
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
  /** The continue countdown. */
  readonly continueScreen: ContinueScene;
  /** The save the flow plays with. */
  readonly save: SaveStore;
  /**
   * The hi-score table of the chosen difficulty's games ({@link hiScoreModeKey} of
   * {@link FlowControl.worldConfig}).
   */
  readonly modeKey: string;
  /** The difficulty the next game plays (the host config's until one is chosen under START). */
  difficulty: DifficultyPreset;
  /**
   * The config of each difficulty preset, in {@link DIFFICULTY_PRESETS} order: the host's config
   * for its own preset, `withDifficulty` of it for the others (built with the flow).
   */
  readonly configs: readonly GameConfig[];
  /** The session hi-score of each preset (same order), starting from the save's best. */
  readonly bests: Float64Array;
  /** The config the next game's World gets ({@link FlowControl.difficulty}'s). */
  readonly worldConfig: GameConfig;
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
   * A game ended on its end screen: records every playing player's score in the mode's table,
   * counts the statistic and writes the save when it changed.
   *
   * @param cleared - `true` for a stage clear, `false` for a game over.
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
 * The title: logo, `PRESS OK`, then START / OPTIONS / EXIT.
 *
 * @remarks
 * Draws the `ui/logo` sprite (or `SHMUP CUP` as text when the content lacks it), a `PRESS OK` that
 * blinks with a 32-tick half-period, and the session hi-score of the chosen difficulty (from the
 * save's best at start). OK opens the menu (locked for 2 ticks, focus on START). START opens the
 * difficulty menu ({@link DifficultyScene}) over the title, which starts the game;
 * OPTIONS opens the {@link OptionsScene} over the title; EXIT and Back open the exit
 * confirmation when the platform can exit — otherwise Back returns from the menu to `PRESS OK`
 * (and does nothing on `PRESS OK`). Entering the title always shows `PRESS OK` and queues the title
 * music.
 */
export class TitleScene extends SceneBase {
  /** See {@link Scene.id}. */
  readonly id = 'title' as const;
  /** The title menu (START / OPTIONS / EXIT — EXIT only when the platform can quit). */
  readonly menu: ListMenu;
  /** 0 = `PRESS OK`, 1 = the menu. */
  phase: number = TitlePhase.Prompt;
  /** Ticks since the title (or its prompt) was shown — the blink's clock. */
  private ticks = 0;

  /**
   * Creates the title.
   *
   * @param flow - The flow.
   */
  constructor(flow: FlowControl) {
    super(flow);
    const items = flow.host.exit !== null ? ['START', 'OPTIONS', 'EXIT'] : ['START', 'OPTIONS'];
    this.menu = createListMenu(items);
  }

  /** Whether the menu is showing (else `PRESS OK`). */
  get menuOpen(): boolean {
    return this.phase === TitlePhase.Menu;
  }

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 3 + menuStringSlots(this.menu);
  }

  /** Back to `PRESS OK`, title music. */
  override enter(): void {
    super.enter();
    this.phase = TitlePhase.Prompt;
    this.ticks = 0;
    this.flow.music(MUSIC_CUES.Title, MUSIC_FADE_TICKS);
  }

  /** The dialog closed (answered NO): the menu takes input again after a short lock. */
  override uncover(): void {
    super.uncover();
    this.menu.open(MENU_OPEN_LOCK_TICKS);
  }

  /**
   * `PRESS OK` → menu; START → the difficulty menu (then the game); OPTIONS → the Options screen;
   * EXIT / Back → exit confirmation (when the platform can quit). Reads the merged menu input.
   * Never allocates.
   */
  tick(): void {
    const flow = this.flow;
    const input = flow.menuInput;
    this.ticks++;
    if (this.phase === TitlePhase.Prompt) {
      if (this.ticks % PROMPT_BLINK_TICKS === 0) this.uiRevision++;
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
      if (menu.focus === TitleItem.Start) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.push(flow.difficultyMenu);
      } else if (menu.focus === TitleItem.Options) {
        flow.sfx(SFX_CUES.MenuSelect);
        flow.stack.push(flow.options);
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
  readonly hudList: DrawList = createDrawList(64, 4);
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
    return 1;
  }

  /** A new game: a fresh World. */
  override enter(): void {
    super.enter();
    this.restart();
  }

  /** The game ends: its score joins the session hi-score. */
  override exit(): void {
    this.recordHiScore();
  }

  /**
   * Starts over with a fresh World (a new game, RETRY STAGE): the music fades out (the new
   * World queues its stage theme), the session hi-score carries over.
   *
   * @remarks
   * Allocates the new World (a scene transition, never a tick). The old World's best score is
   * recorded first (into the session hi-score — the saved tables only take finished games); the
   * end-screen delay and the WARNING look reset, the HUD is invalidated; the save counts a game
   * start (written with the next save write).
   */
  restart(): void {
    this.recordHiScore();
    const flow = this.flow;
    flow.music(MUSIC_CUES.Silence, MUSIC_FADE_TICKS);
    const world = flow.host.createWorld(flow.worldConfig);
    world.scoring.board.setHiScore(flow.hiScore);
    this.world = world;
    this.starts++;
    flow.save.count('gamesStarted');
    this.endTicks = 0;
    this.warningLook = 0;
    this.hud.invalidate();
    this.uiRevision++;
  }

  /** Raises the session hi-score of the World's difficulty from the World's. */
  private recordHiScore(): void {
    const world = this.world;
    const index = DIFFICULTY_PRESETS.indexOf(world.config.difficulty);
    const bests = this.flow.bests;
    const best = world.scoring.board.hiScore;
    if (index >= 0 && best > bests[index]) bests[index] = best;
  }

  /**
   * Pause (or Back) opens the pause menu; otherwise the World advances one tick and its status
   * decides whether the stage-clear or game-over screen opens. Never allocates.
   *
   * @remarks
   * Pause / Back are read from the merged menu input (any player); on that tick the World does
   * not step. The remote's game table binds Back to Pause anyway; Back is checked too so a table
   * that keeps `Action.Back` in the game context still pauses.
   *
   * @param input - This tick's input (the World gets it unmerged — per player).
   */
  tick(input: InputSnapshot): void {
    const flow = this.flow;
    if ((flow.menuInput.pressed & (Action.Pause | Action.Back)) !== 0) {
      flow.sfx(SFX_CUES.PauseToggle);
      flow.stack.push(flow.pause);
      return;
    }
    const world = this.world;
    stepWorld(world, input);
    const status = world.status;
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
   * Draws the boss WARNING band while it plays (its text in red / yellow every 16 ticks).
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
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
 * enemy bullet colour set — plan M2-02), BACK (shmup_feat.md §21, plan M1-17).
 *
 * @remarks
 * An overlay (dim {@link PAUSE_DIM}) with an opaque panel, opened from the title and from the pause
 * menu (both stay drawn under it; a game under the pause menu stays frozen). Opening it reads the
 * save's options into the sliders (levels `0…`{@link VOLUME_LEVELS}) and the profile in use into
 * CONTROLS, focuses MASTER and locks activation for 2 ticks. Every change applies **live**: a
 * slider pushes a `UserOption` event with its level (`MasterVolume` / `MusicVolume` /
 * `SfxVolume`), CONTROLS — Left / Right, or OK stepping forward, wrapping — one with the profile's
 * index (`InputProfile`), BULLETS one with the palette's index in `BULLET_PALETTES`
 * (`BulletPalette` — the host swaps the renderer's bullet sprites); all play the move sound (at the
 * new volume). BACK or the Back button stores the sliders, the bullet palette and — when it
 * changed — the profile id in the save, writes the save when
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
    const palette = BULLET_PALETTES.indexOf(flow.save.options.display.bulletPalette);
    this.bullets.index = palette >= 0 ? palette : 0;
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
      display: { bulletPalette: BULLET_PALETTES[this.bullets.index] ?? 'standard' },
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

/**
 * Stage clear: the tally, then `TO BE CONTINUED` (M1), then the title.
 *
 * @remarks
 * An overlay (dim 0.25) over the frozen game: a panel with `STAGE CLEAR`, player 1's score and
 * the hi-score for {@link STAGE_CLEAR_TALLY_TICKS}, then `TO BE CONTINUED` for
 * {@link STAGE_CLEAR_CONTINUED_TICKS}, then the title; OK skips each phase at once (Back does
 * nothing). Queues the stage-clear jingle with no fade (a boss's death already started it; the
 * music player does not restart a playing track). Entering it ends the run (M1 has one zone): the
 * score goes into the saved hi-score table and the save is written.
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

  /** See {@link SceneBase.stringSlots}. */
  get stringSlots(): number {
    return 4;
  }

  /**
   * The tally starts; the run's scores are recorded (and saved); the stage-clear jingle plays (not
   * restarted when already playing).
   */
  override enter(): void {
    super.enter();
    this.phase = ClearPhase.Tally;
    this.ticks = 0;
    this.rank = this.flow.recordRun(true);
    this.flow.music(MUSIC_CUES.StageClear, 0);
  }

  /** Tally → `TO BE CONTINUED` → title, by time or OK. */
  tick(): void {
    const flow = this.flow;
    this.ticks++;
    const ok = (flow.menuInput.pressed & Action.Confirm) !== 0;
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
      flow.toTitle();
    }
  }

  /**
   * Draws `STAGE CLEAR` with the score and hi-score, or `TO BE CONTINUED`.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const world = this.flow.game.world;
    drawPanel(list, CX - 88, 64, 176, 72);
    list.setString(base, 'STAGE CLEAR');
    list.setString(base + 1, 'SCORE');
    list.setString(base + 2, 'HI');
    list.setString(base + 3, 'TO BE CONTINUED');
    if (this.phase === ClearPhase.Tally) {
      list.text(base, CX, 74, UI_COLORS.focus, TextAlign.Center);
      list.text(base + 1, CX - 64, 96, UI_COLORS.title);
      list.number(world.scoring.board.scores[0].score, CX + 64, 96, 8, UI_COLORS.text, 2);
      list.text(base + 2, CX - 64, 110, UI_COLORS.focus);
      list.number(world.scoring.board.hiScore, CX + 64, 110, 8, UI_COLORS.text, 2);
    } else {
      list.text(base + 3, CX, 96, UI_COLORS.focus, TextAlign.Center);
    }
  }
}

/**
 * Game over: OK (after a short lock) or 10 s → title.
 *
 * @remarks
 * An overlay (dim 0.35) over the frozen game: a red-edged panel with `GAME OVER` and player 1's
 * final score, the game-over music. OK or Back are ignored for {@link GAME_OVER_LOCK_TICKS}
 * ticks (a mashed button does not skip it), then return to the title; after
 * {@link GAME_OVER_TIMEOUT_TICKS} it returns by itself. Entering it records the run: the score goes
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
    return 3;
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
      flow.toTitle();
    }
  }

  /**
   * Draws `GAME OVER`, the final score and — when it is the new best — `NEW HI-SCORE`.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    drawPanel(list, CX - 72, 80, 144, 44, UI_COLORS.panel, UI_COLORS.alert);
    list.setString(base, 'GAME OVER');
    list.setString(base + 1, 'SCORE');
    list.setString(base + 2, 'NEW HI-SCORE');
    if (this.rank === 0) list.text(base + 2, CX, 130, UI_COLORS.focus, TextAlign.Center);
    list.text(base, CX, 88, UI_COLORS.alert, TextAlign.Center);
    list.text(base + 1, CX - 56, 106, UI_COLORS.title);
    list.number(
      this.flow.game.world.scoring.board.scores[0].score,
      CX + 56,
      106,
      8,
      UI_COLORS.text,
      2,
    );
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
 * chooses the focused preset and starts the game (the stack is reset to the game scene, whose
 * World gets that preset's config); Back closes it (the title menu takes input again). Up / Down
 * move the focus (wrapping, auto-repeat) with the move sound.
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

  /** OK chooses and starts the game; Back closes the menu. Never allocates. */
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
      flow.stack.reset(flow.game);
      return;
    }
    flow.menuSound(result);
  }

  /**
   * Draws the panel, `DIFFICULTY`, the presets and the focused preset's lives, continues and
   * hi-score.
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
    list.number(this.flow.bests[index] ?? 0, p.x + 164, y + 12, 8, UI_COLORS.text, TextAlign.Right);
  }
}

/**
 * The continue countdown (shmup_feat.md §10 continues, §17 "continue countdown"; plan M2-01).
 *
 * @remarks
 * An overlay (dim 0.35) over the frozen game, pushed instead of the game-over screen when the game
 * is over and continues are left (`core/world` `canContinue`). It fades the music out and counts
 * down {@link CONTINUE_COUNTDOWN_TICKS} ticks, showing the seconds left (9 … 0, a tick sound on
 * every change) and the continues left. After {@link CONTINUE_LOCK_TICKS} ticks OK continues —
 * `continueWorld`: the stage restarts at its last checkpoint with fresh lives, the score's last
 * digit counts the continue — and closes the countdown (the game runs on); Back gives up. Giving up
 * or running out of time replaces it with the {@link GameOverScene} (which records the run).
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
    return 2;
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

  /** OK continues, Back or the timeout gives up (after the lock). Never allocates. */
  tick(): void {
    const flow = this.flow;
    const before = this.seconds;
    this.ticks++;
    if (this.seconds !== before) {
      this.uiRevision++;
      flow.sfx(SFX_CUES.MenuMove);
    }
    const pressed = this.ticks > CONTINUE_LOCK_TICKS ? flow.menuInput.pressed : 0;
    if ((pressed & Action.Confirm) !== 0 && continueWorld(flow.game.world)) {
      flow.sfx(SFX_CUES.MenuSelect);
      flow.stack.pop();
      return;
    }
    if ((pressed & Action.Back) !== 0 || this.ticks >= CONTINUE_COUNTDOWN_TICKS) {
      if ((pressed & Action.Back) !== 0) flow.sfx(SFX_CUES.MenuBack);
      flow.stack.replace(flow.gameOver);
    }
  }

  /**
   * Draws `CONTINUE?`, the seconds left and the continues left.
   *
   * @param list - The UI list.
   */
  drawUi(list: DrawList): void {
    const base = this.stringBase;
    const world = this.flow.game.world;
    drawPanel(list, CX - 72, 72, 144, 64, UI_COLORS.panel, UI_COLORS.alert);
    list.setString(base, 'CONTINUE?');
    list.setString(base + 1, 'CREDITS');
    list.text(base, CX, 80, UI_COLORS.focus, TextAlign.Center);
    list.number(this.seconds, CX, 96, 0, UI_COLORS.alert, TextAlign.Center);
    list.text(base + 1, CX - 56, 118, UI_COLORS.title);
    list.number(
      world.config.continues - world.continuesUsed,
      CX + 56,
      118,
      0,
      UI_COLORS.text,
      TextAlign.Right,
    );
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
  /** The continue countdown (M2-01). */
  readonly continueScreen: ContinueScene;
  /**
   * The save the flow plays with (the host's store, or a memory-only one): options, hi-score
   * tables, stats.
   */
  readonly save: SaveStore;
  /**
   * The hi-score table the next game goes into (`core/save` `hiScoreModeKey` of
   * {@link SceneFlow.gameConfig} — one table per power-up mode and difficulty).
   */
  readonly modeKey: string;
  /** The difficulty the next game plays (the host config's until one is chosen under START). */
  readonly difficulty: DifficultyPreset;
  /**
   * The config the next game's World gets: the host's for its own difficulty, `withDifficulty` of
   * it for another (the content's `rules` table — or the built-in one — gives the preset fields).
   */
  readonly gameConfig: GameConfig;
  /** The input profiles the Options screen offers (empty: CONTROLS disabled). */
  readonly inputProfiles: readonly InputProfileChoice[];
  /**
   * Index of the input profile in use in {@link SceneFlow.inputProfiles} (-1 = none of them —
   * the host's own default). Changed by the Options screen.
   */
  readonly activeInputProfile: number;
  /** The top scene's binding context (`'menu'` on an empty stack). */
  readonly inputContext: InputContext;
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
  /** The game's World view while the game scene is visible, else `null`. */
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
  const bests = new Float64Array(DIFFICULTY_PRESETS.length);
  for (let i = 0; i < DIFFICULTY_PRESETS.length; i++) {
    const preset = DIFFICULTY_PRESETS[i];
    const config =
      preset === host.config.difficulty ? host.config : withDifficulty(host.config, preset, table);
    configs.push(config);
    bests[i] = Math.min(MAX_SCORE, save.bestScore(hiScoreModeKey(config)));
  }
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
    difficulty: host.config.difficulty,
    configs,
    bests,
    get worldConfig(): GameConfig {
      return configs[presetIndex(control.difficulty)];
    },
    get modeKey(): string {
      return hiScoreModeKey(control.worldConfig);
    },
    get hiScore(): number {
      return bests[presetIndex(control.difficulty)];
    },
    raiseHiScore(value: number): void {
      const i = presetIndex(control.difficulty);
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
      // The World's own table: its difficulty (chosen under START) names it.
      const key = hiScoreModeKey(world.config);
      let rank = -1;
      for (let p = 0; p < scores.length && p < world.players.length; p++) {
        if (p > 0 && !world.players[p].active) continue;
        const r = save.recordScore(
          key,
          createHiScoreEntry(scores[p].score, {
            reached,
            mode: HI_SCORE_MODE_1P,
            difficulty: world.config.difficulty,
          }),
        );
        if (p === 0) rank = r;
      }
      save.count(cleared ? 'stagesCleared' : 'gameOvers');
      void save.flush();
      return rank;
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
  control.continueScreen = new ContinueScene(control);
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
    control.continueScreen,
  ];
  let base = 0;
  for (const scene of scenes) {
    scene.stringBase = base;
    base += scene.stringSlots;
  }
  if (base > UI_STRINGS) throw new RangeError(`the scenes need ${base} string slots`);

  const ui = createDrawList(256, UI_STRINGS);
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
    continueScreen: control.continueScreen,
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
    inputProfiles: profiles,
    get activeInputProfile(): number {
      return control.activeProfile;
    },
    get inputContext(): InputContext {
      const top = stack.top;
      return top === null ? 'menu' : top.inputContext;
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
      let gameVisible = false;
      for (let i = bottom; i < depth; i++) if (stack.sceneAt(i) === game) gameVisible = true;
      if (gameVisible) {
        view.tick = game.world.tick;
        view.world = game.world.view;
        game.hud.update(game.world, game.hudList);
        view.hud = game.hudList;
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
