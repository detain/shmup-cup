/**
 * The **presentation fingerprint** (plan_resolution.md R1-01·T0): a hash of everything
 * `@shmup/core` hands a renderer — the HUD and UI draw lists, the screen effects and the World view
 * (camera, sprite batches, parallax, terrain, lasers, the WARNING, the stage effects, the hitbox
 * markers) — frame by frame along fixed, scripted walks through every scene the scene flow can
 * show, on the shipped content.
 *
 * **Why.** The golden replays hash only the simulation (`hashWorld`), so a change that moves the
 * HUD, a menu, the zone card or the WARNING band passes them. R1 re-derives every frame-dependent
 * number of core from a few constants and must keep the game *pixel-identical* at 384×216; this
 * test is that check for core's presentation output. It was pinned on master `333721b` (the v1.0.0
 * code, before any R1-01 change) and stayed green when R1-01·T0 added the frame constants; R2-01
 * re-pinned it at the flip to 640×360. R3-06·L2 moved the 82 world hashes alone: the two decor
 * layers joined `LayerId`, so every batch's layer number shifted — no drawn value changed.
 *
 * **The walks** (one `it` each, independent of the others): the front end (boot, title, the exit
 * confirmation, the Options screen and its CONTROLS / DISPLAY / GAME / EXTRAS pages, the rebind
 * screen with a capture, the input test, the sound test, the practice select, the EXTRA menu, the
 * empty replay browser); a one-player game (difficulty, ship and weapon select with the live
 * preview, the Auto order editor, the zone card and the HUD, the pause menu and its Options, QUIT's
 * confirmation, the FULL POWER code, RETRY, the continue countdown, the game-over screen, the name
 * entry, the result table, the replay browser and a replay played back); co-op (the join, both HUD
 * halves, the co-op countdown) and a Direct-mode game; the attract loop (a whole demo, the tables,
 * the story crawl); a single stage outside the campaign (the title's EXTRA SHIPS code, STAGE
 * CLEAR / TO BE CONTINUED); two campaign runs to their endings (the bosses' WARNING band and HP bar
 * with the hitbox markers, both bonus stages, the zone tallies, the map, both escapes, the
 * citadel's and the abyss's ending stories and cards, the credits); the EXTRA modes (the Extra Edit
 * types, BOSS RUSH, CARAVAN's clock and TIME UP, ARCADE's LOOP 2 card); the es and ja string
 * tables; bare gameplay; co-op beyond the HUD halves (added in R1-01·T0's review round 1 and
 * pinned on `4dfca16`, whose core output is still v1.0.0's): on a single stage the co-op Force
 * Field pips, player 2 out (`PRESS START`, then `GAME OVER` in its half), the co-op STAGE CLEAR,
 * its name entry and the co-op GAME OVER, then a Direct-mode co-op game with FULL POWER's gold Arm;
 * a co-op campaign run through the zone tallies (player 2's row), the escape and the abyss ending
 * a boss escaped (the flagship sailing off, the result card's 2P row, both ships).
 * The last test checks that the walks showed every `SceneId`. Stage clears and game overs are
 * forced (`World.status`, `World.timeLeft`, `World.bonus.entered`) to keep the walks short, and so
 * are player 2's last life (`lives`, then `selfDestruct` for that ship alone), its used continues
 * (`PlayerScore.continues`) and the escaped boss (`World.endingFlags`).
 *
 * **Content-independent since R2-01.** The flip to 640×360 left the shipped content at v1's scale
 * until R2-02 ports it and the attract demos refused until R2-03 re-records them, so two walks no
 * longer lean on either: the one-player game runs in god mode (the FULL POWER code needs a live
 * ship, and on unported terrain the ship had crashed by then), and the attract loop plays two demos
 * recorded in the test at the current frame from a fixed input script ({@link recordWalkDemo})
 * instead of `content/demos`.
 *
 * **How it hashes.** Every displayed frame (one `Game.renderFrame()` per tick) is folded into four
 * FNV-1a hashes per segment: `ui`, `hud`, `world` and `screen`. A draw list contributes its drawn
 * commands in order with every field the renderer reads; a text command contributes its *string*
 * (never its slot number), so moving text to other slots changes nothing, while any change of a
 * position, size, colour, alpha, frame, alignment or word does. A segment's static World data (the
 * terrain grid, the raster effects, palette cycles and the Mode-7 floor) is folded in once at its
 * end. Each pinned entry is `'<ui> <hud> <world> <screen>'`, so a failure names the segment and the
 * kind of output that moved.
 *
 * **Keeping it green.** Through R1 it must stay green without any edit: a red run is a moved pixel
 * (or a moved sim value — then the goldens fail too). It is re-pinned on purpose only — R2-01 (the
 * 640×360 flip) and any later step that changes what is drawn — by running it with
 * `SHMUP_FINGERPRINT_UPDATE=1` (which rewrites this file's `PINNED` entries itself, R5-P.P10 — or
 * `SHMUP_FINGERPRINT_PRINT=1` to only print the table), with the reason in the commit message.
 * A change of the shipped content (strings, stages, the campaign) changes it too.
 *
 * Run it: `VITEST_MAX_WORKERS=8 pnpm exec vitest run --project integration
 * test/integration/presentation-fingerprint.test.ts`.
 */
import { fileURLToPath } from 'node:url';
import {
  Action,
  CaptureStatus,
  ControlsItem,
  DEMO_BUILD_ID,
  DisplayItem,
  ENDING_LOCK_TICKS,
  EndingFlag,
  ExtraItem,
  GameOptionsItem,
  GraphicsItem,
  HudPlayerState,
  OptionsItem,
  PLAYER_DEAD_TICKS,
  PauseItem,
  RebindStatus,
  ReplayActionItem,
  SECRET_CODES,
  SecretCode,
  TitleItem,
  WeaponSelectItem,
  addScore,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  createMemoryStorage,
  createReplayGame,
  createReplayHeader,
  createReplayLibrary,
  createReplayRecorder,
  createSaveStore,
  encodeReplay,
  hudPlayerState,
  resolveGameConfig,
  selfDestruct,
  type ActionMask,
  type ActionName,
  type ContentDb,
  type ControlsSetup,
  type DemoSpec,
  type DrawList,
  type Game,
  type GameConfig,
  type InputContext,
  type ListMenu,
  type RebindDevice,
  type RebindOutcome,
  type RenderFrame,
  type SaveStore,
  type SceneFlow,
  type WorldView,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { rewritePinned } from '../../packages/core/test/helpers/pin-writer.js';
import { shippedContent } from '../playtest/harness.js';

// ------------------------------------------------------------------------------ hashing

/** FNV-1a offset basis. */
const FNV_OFFSET = 0x811c9dc5;

/** Scratch for the bits of a double. */
const F64 = new Float64Array(1);
/** The double's two 32-bit words. */
const U32 = new Uint32Array(F64.buffer);

/** A running FNV-1a hash over 32-bit words. */
class Hash {
  /** The state. */
  h = FNV_OFFSET;

  /**
   * Folds in a 32-bit integer, byte by byte.
   *
   * @param v - The value (taken as a 32-bit integer).
   */
  int(v: number): void {
    let h = this.h;
    h = Math.imul(h ^ (v & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
    this.h = h >>> 0;
  }

  /**
   * Folds in a number exactly (its IEEE 754 bits; -0 as 0, every NaN alike).
   *
   * @param v - The value.
   */
  num(v: number): void {
    F64[0] = v === 0 ? 0 : v;
    if (v !== v) F64[0] = NaN;
    this.int(U32[0]);
    this.int(U32[1]);
  }

  /**
   * Folds in a string (its length, then its UTF-16 code units).
   *
   * @param s - The string.
   */
  str(s: string): void {
    this.int(s.length);
    for (let i = 0; i < s.length; i++) this.int(s.charCodeAt(i));
  }

  /**
   * The hash as 8 hex digits.
   *
   * @returns The hex string.
   */
  hex(): string {
    return this.h.toString(16).padStart(8, '0');
  }
}

/** `DrawOp.Text` (a literal so the hashing does not depend on the enum's object). */
const OP_TEXT = 3;
/** `DrawOp.Number`. */
const OP_NUMBER = 4;

/**
 * Folds a draw list's drawn commands into a hash, in draw order.
 *
 * @param h - The hash.
 * @param list - The list.
 */
function hashDrawList(h: Hash, list: DrawList): void {
  h.int(list.count);
  for (let i = 0; i < list.count; i++) {
    const op = list.op[i];
    h.int(op);
    h.int(list.x[i]);
    h.int(list.y[i]);
    h.int(list.w[i]);
    h.int(list.h[i]);
    h.int(list.color[i]);
    h.int(list.alpha[i]);
    h.int(list.frame[i]);
    h.int(list.flags[i]);
    if (op === OP_TEXT) h.str(list.strings[list.ref[i]] ?? '');
    else h.int(list.ref[i]);
    if (op === OP_NUMBER) h.num(list.value[i]);
  }
}

/**
 * Folds the per-frame parts of a World view into a hash: the camera, every batch's live sprites,
 * the parallax bands, the terrain's size and change counters, the lasers, the bending lasers, the
 * WARNING and the hitbox markers.
 *
 * @param h - The hash.
 * @param view - The view (`null` outside gameplay).
 */
function hashWorldFrame(h: Hash, view: WorldView | null): void {
  if (view === null) {
    h.int(-1);
    return;
  }
  h.num(view.camera.x);
  h.num(view.camera.y);
  h.int(view.batches.length);
  for (const b of view.batches) {
    h.int(b.layer);
    h.int(b.count);
    for (let i = 0; i < b.count; i++) {
      h.num(b.x[i]);
      h.num(b.y[i]);
      h.int(b.spriteId[i]);
      h.int(b.frame[i]);
      h.int(b.flags[i]);
    }
  }
  const p = view.parallax;
  h.int(p === null ? -1 : p.count);
  if (p !== null) {
    for (let i = 0; i < p.count; i++) {
      h.int(p.layer[i]);
      h.int(p.spriteId[i]);
      h.num(p.offsetX[i]);
      h.num(p.y[i]);
      h.num(p.spacing[i]);
    }
  }
  const t = view.terrain;
  if (t === null) h.int(-1);
  else {
    h.int(t.tileSize);
    h.int(t.cols);
    h.int(t.rows);
    h.int(t.tilesetSpriteId);
    h.int(t.changes?.count ?? -1);
    h.int(t.changes?.resets ?? -1);
  }
  const l = view.lasers ?? null;
  h.int(l === null ? -1 : l.count);
  if (l !== null) {
    for (let i = 0; i < l.count; i++) {
      h.num(l.x[i]);
      h.num(l.y[i]);
      h.num(l.angle[i]);
      h.num(l.length[i]);
      h.num(l.width[i]);
      h.int(l.spriteId[i]);
      h.int(l.flags[i]);
    }
  }
  const bl = view.bendingLasers ?? null;
  h.int(bl === null ? -1 : bl.capacity);
  if (bl !== null) {
    for (let s = 0; s < bl.capacity; s++) {
      if (bl.active[s] !== 1) continue;
      h.int(s);
      h.int(bl.filled[s]);
      h.int(bl.head[s]);
      h.num(bl.width[s]);
      h.int(bl.spriteId[s]);
      h.int(bl.flags[s]);
      for (let k = 0; k < bl.filled[s]; k++) {
        const node = s * bl.nodes + ((bl.head[s] - k) & (bl.nodes - 1));
        h.num(bl.x[node]);
        h.num(bl.y[node]);
      }
    }
  }
  const w = view.warning ?? null;
  if (w === null) h.int(-1);
  else {
    h.int(w.active ? 1 : 0);
    h.int(w.ticks);
    h.int(w.duration);
    h.str(w.text);
  }
  const hb = view.hitboxes ?? null;
  h.int(hb === null ? -1 : hb.count);
  if (hb !== null) {
    for (let i = 0; i < hb.count; i++) {
      h.num(hb.x[i]);
      h.num(hb.y[i]);
      h.num(hb.radius[i]);
    }
  }
}

/**
 * Folds the static parts of a World view (read once when a renderer binds it) into a hash: the
 * terrain grid and its tile frames, the raster effects, the palette cycles and the Mode-7 floor.
 *
 * @param h - The hash.
 * @param view - The view (`null` outside gameplay).
 */
function hashWorldStatic(h: Hash, view: WorldView | null): void {
  if (view === null) return;
  const t = view.terrain;
  if (t !== null) {
    for (let i = 0; i < t.tiles.length; i++) h.int(t.tiles[i]);
    for (let i = 0; i < t.tileFrame.length; i++) h.int(t.tileFrame[i]);
  }
  const e = view.effects ?? null;
  if (e === null) {
    h.int(-1);
    return;
  }
  h.int(e.raster.length);
  for (const r of e.raster) {
    h.int(r.layer);
    h.int(r.kind);
    h.num(r.top);
    h.num(r.bottom);
    h.num(r.amplitude);
    h.num(r.wavelength);
    h.num(r.period);
    h.num(r.factorTop);
    h.num(r.factorBottom);
    h.int(r.bands.length);
    for (const band of r.bands) h.num(band);
    h.num(r.wrap);
    h.num(r.from);
    h.num(r.to);
  }
  h.int(e.cycles.length);
  for (const c of e.cycles) {
    h.int(c.layer);
    h.int(c.colors.length);
    for (const color of c.colors) h.int(color);
    h.num(c.ticks);
    h.num(c.from);
    h.num(c.to);
  }
  const m = e.mode7 ?? null;
  if (m === null) h.int(-1);
  else {
    h.int(m.spriteId);
    h.num(m.horizon);
    h.num(m.bottom);
    h.num(m.height);
    h.num(m.scroll);
    h.num(m.sway);
    h.num(m.turn);
    h.int(m.fog);
    h.num(m.fogDepth);
    h.num(m.alpha);
    h.num(m.from);
    h.num(m.to);
  }
}

/** The four hashes of a segment. */
class SegmentHash {
  readonly ui = new Hash();
  readonly hud = new Hash();
  readonly world = new Hash();
  readonly screen = new Hash();

  /**
   * Folds one displayed frame in.
   *
   * @param frame - The frame.
   */
  frame(frame: RenderFrame): void {
    this.ui.int(0x7e57);
    hashDrawList(this.ui, frame.ui);
    this.hud.int(0x7e57);
    hashDrawList(this.hud, frame.hud);
    this.world.int(frame.tick);
    hashWorldFrame(this.world, frame.world);
    const s = frame.screen;
    this.screen.num(frame.alpha);
    this.screen.num(s.shakeX);
    this.screen.num(s.shakeY);
    this.screen.num(s.flash);
    this.screen.num(s.dim);
  }

  /**
   * The pinned form.
   *
   * @returns `'<ui> <hud> <world> <screen>'`.
   */
  text(): string {
    return `${this.ui.hex()} ${this.hud.hex()} ${this.world.hex()} ${this.screen.hex()}`;
  }
}

// ------------------------------------------------------------------------------ the walks

/** Every scene id of the flow (`core/scenes` `SceneId`) — the walks must show each one. */
const SCENE_IDS = [
  'boot',
  'title',
  'game',
  'pause',
  'stageClear',
  'gameOver',
  'confirm',
  'difficulty',
  'shipSelect',
  'weaponSelect',
  'autoOrder',
  'continue',
  'map',
  'options',
  'nameEntry',
  'hiScore',
  'ending',
  'credits',
  'demo',
  'story',
  'practice',
  'soundTest',
  'controls',
  'display',
  'graphics',
  'gameOptions',
  'extras',
  'rebind',
  'inputTest',
  'extra',
  'replays',
  'replay',
] as const;

/** Two keyboard profiles for the CONTROLS page's PROFILE row. */
const PROFILES = [
  { id: 'keyboard-default', label: 'KEYBOARD (DEFAULT)' },
  { id: 'keyboard-remote-emulation', label: 'KEYBOARD AS REMOTE' },
];

/** A fixed host side of the rebind screen (a keyboard and a gamepad; every bind succeeds). */
class FixedControls implements ControlsSetup {
  /** The capture's state (the walk moves it on). */
  status: number = CaptureStatus.Idle;
  /** Actions bound so far, by `device/context/action`. */
  private readonly bound = new Set<string>();

  devices(): readonly RebindDevice[] {
    return [
      { id: 'keyboard-default', kind: 'keyboard' },
      { id: 'gamepad-standard', kind: 'gamepad' },
    ];
  }
  keysLabel(device: number, context: InputContext, action: ActionName): string {
    return this.bound.has(`${device}/${context}/${action}`) ? 'J' : action.toUpperCase();
  }
  beginCapture(_device: number): void {
    this.status = CaptureStatus.Waiting;
  }
  pollCapture(): number {
    return this.status;
  }
  endCapture(): void {
    this.status = CaptureStatus.Idle;
  }
  bindCaptured(device: number, context: InputContext, action: ActionName): RebindOutcome {
    this.bound.add(`${device}/${context}/${action}`);
    return { status: RebindStatus.Bound, other: null };
  }
  reset(_device: number, _context: InputContext): void {
    this.bound.clear();
  }
}

/** Options of a {@link Walk}. */
interface WalkOptions {
  /** Config overrides of the host. */
  readonly config?: Partial<GameConfig>;
  /** Where the flow starts (default the boot scene). */
  readonly start?: 'boot' | 'title' | 'game';
  /** The save (default a memory-only one). */
  readonly save?: SaveStore;
  /** Give the platform an exit (the TV): EXIT on the title, the exit confirmation. */
  readonly canExit?: boolean;
  /** Bare gameplay (no scene flow). */
  readonly bare?: boolean;
}

/**
 * One scripted session on the shipped content: input helpers that compose a frame after every
 * tick and fold it into the current segment's hashes, and the table of finished segments.
 */
class Walk {
  readonly platform = createHeadlessPlatform();
  readonly game: Game;
  /** The scene flow (the bare walk has none and never reads it). */
  readonly flow: SceneFlow;
  /** Bare gameplay: no scene flow. */
  private readonly bare: boolean;
  readonly save: SaveStore;
  readonly controls = new FixedControls();
  /** Finished segments: label → `'<ui> <hud> <world> <screen>'`. */
  readonly table: Record<string, string> = {};
  /** Every scene id seen on top of the stack. */
  readonly seen = new Set<string>();
  private label = '';
  private hash = new SegmentHash();
  private frame: RenderFrame | null = null;

  /**
   * Creates the session; nothing is hashed before the first {@link Walk.begin}.
   *
   * @param db - The content.
   * @param options - Config, start, save, exit, bare gameplay.
   */
  constructor(db: ContentDb, options: WalkOptions = {}) {
    if (options.canExit === true) {
      (this.platform as { exit: (() => void) | null }).exit = () => undefined;
    }
    this.save = options.save ?? createSaveStore(null);
    this.game = createGame(
      this.platform,
      { stage: 'zone-a', seed: 0x5eed, ...options.config },
      db,
      options.bare === true
        ? {}
        : {
            scenes: options.start ?? 'boot',
            save: this.save,
            inputProfiles: { choices: PROFILES, active: 'keyboard-default' },
            soundTest: { music: ['TITLE', 'ZONE A', 'BOSS', 'ENDING'] },
            controls: this.controls,
            replays: createReplayLibrary(createMemoryStorage()),
            shareReplay: () => true,
          },
    );
    this.bare = options.bare === true;
    this.flow = this.game.scenes as SceneFlow;
  }

  /** The top scene's id (`''` in bare gameplay). */
  get top(): string {
    return this.bare ? '' : (this.flow.stack.top?.id ?? '');
  }

  /**
   * Starts a new segment (finishing the current one).
   *
   * @param label - Its unique label.
   */
  begin(label: string): void {
    this.end();
    expect(this.table[label], `duplicate segment ${label}`).toBeUndefined();
    this.label = label;
    this.hash = new SegmentHash();
  }

  /** Finishes the current segment: its static World data, then its entry in the table. */
  end(): void {
    if (this.label === '') return;
    hashWorldStatic(this.hash.world, this.frame === null ? null : this.frame.world);
    this.table[this.label] = this.hash.text();
    this.label = '';
  }

  /**
   * Runs ticks with masks held, composing and hashing a frame after each.
   *
   * @param held - Player 1's held actions.
   * @param ticks - Ticks.
   * @param held2 - Player 2's held actions.
   */
  hold(held: ActionMask, ticks = 1, held2: ActionMask = 0): void {
    const players = this.platform.snapshot.players;
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(players[0], held);
      for (let p = 1; p < players.length; p++) commitPlayerInput(players[p], p === 1 ? held2 : 0);
      this.game.step();
      this.game.events.drain(() => undefined);
      const frame = this.game.renderFrame();
      this.frame = frame;
      if (!this.bare) this.seen.add(this.top);
      if (this.label !== '') this.hash.frame(frame);
    }
  }

  /**
   * A press: a tick down, a tick up.
   *
   * @param action - The action(s).
   * @param action2 - Player 2's action(s).
   */
  press(action: ActionMask, action2: ActionMask = 0): void {
    this.hold(action, 1, action2);
    this.hold(0);
  }

  /**
   * Presses after the 2-tick lock of a menu that just opened.
   *
   * @param actions - The presses.
   */
  presses(...actions: ActionMask[]): void {
    this.hold(0, 2);
    for (const action of actions) this.press(action);
  }

  /**
   * Moves a menu's focus with Down presses until it is on an item.
   *
   * @param menu - The menu.
   * @param item - The item.
   */
  focus(menu: ListMenu, item: number): void {
    for (let i = 0; i < 40 && menu.focus !== item; i++) this.press(Action.Down);
    expect(menu.focus).toBe(item);
  }

  /**
   * Walks a menu: Down through every item and back up to where it was.
   *
   * @param menu - The menu.
   */
  walk(menu: ListMenu): void {
    const from = menu.focus;
    for (let i = 0; i < menu.items.length; i++) this.press(Action.Down);
    for (let i = 0; i < menu.items.length && menu.focus !== from; i++) this.press(Action.Up);
  }

  /**
   * Expects the top scene.
   *
   * @param id - Its id.
   */
  at(id: string): void {
    expect(this.top, `segment ${this.label}`).toBe(id);
  }

  /**
   * From the title's `PRESS OK`: a title item (1 PLAYER, 2 PLAYERS, EXTRA …) is chosen.
   *
   * @param item - A {@link TitleItem}.
   */
  title(item: number): void {
    this.at('title');
    this.press(Action.Confirm);
    this.hold(0, 2);
    this.focus(this.flow.title.menu, item);
    this.press(Action.Confirm);
  }

  /**
   * From the difficulty menu: NORMAL, the ship (the ship select's row), and — for the meter ship —
   * the weapon select's START: the game starts.
   *
   * @param ship - The ship select's row (0 KESTREL, 1 MANTA).
   */
  launch(ship = 0): void {
    this.at('difficulty');
    this.presses(Action.Confirm);
    this.at('shipSelect');
    this.hold(0, 2);
    this.focus(this.flow.shipSelect.menu, ship);
    this.press(Action.Confirm);
    if (this.top === 'weaponSelect') this.presses(Action.Confirm);
    this.hold(0);
    this.at('game');
  }

  /** In a game: the pause menu, QUIT TO TITLE, YES. */
  quit(): void {
    this.at('game');
    this.press(Action.Pause);
    this.hold(0, 2);
    this.focus(this.flow.pause.menu, PauseItem.Quit);
    this.press(Action.Confirm);
    this.at('confirm');
    this.presses(Action.Left, Action.Confirm);
    this.hold(0, 2);
    this.at('title');
  }

  /**
   * Plays for a while: shooting, weaving, a power-up press now and then.
   *
   * @param ticks - About this many ticks (a multiple of 40).
   */
  play(ticks: number): void {
    const moves = [Action.Up, Action.Right, Action.Down, Action.Left];
    for (let i = 0; i < ticks / 40; i++) {
      this.hold(Action.Shot | moves[i & 3], 30);
      this.press(Action.Shot | Action.PowerUp);
      this.hold(Action.Shot, 8);
    }
  }

  /**
   * Enters a name on the name entry (A, then C, then E — the campaign test's remote presses).
   */
  name(): void {
    this.at('nameEntry');
    this.hold(0, 2);
    const keys = [Action.Right, Action.Up, Action.Up, Action.Up, Action.Right];
    for (let i = 0; i < 5; i++) keys.push(Action.Up);
    keys.push(Action.Right);
    for (const key of keys) this.press(key);
    this.hold(0, 20);
    this.press(Action.Confirm);
    this.at('hiScore');
  }

  /**
   * In a game: clears the stage (as the World does when the last event passed) after a score.
   *
   * @param score - Points for player 1 first.
   */
  clear(score: number): void {
    addScore(this.game.world, 0, score);
    this.game.world.status = 'stageClear';
  }

  /**
   * In a game: plays on until the boss's WARNING (at most `ticks`).
   *
   * @param ticks - The limit.
   */
  toWarning(ticks = 1200): void {
    for (let i = 0; i < ticks && this.game.world.status !== 'bossWarning'; i++) {
      this.hold(Action.Shot);
    }
    expect(this.game.world.status, `segment ${this.label}`).toBe('bossWarning');
  }
}

/** The file whose `PINNED` the update mode rewrites (R5-P.P10). */
const PIN_FILE = fileURLToPath(import.meta.url);

/** Whether this run rewrites its own pins (`SHMUP_FINGERPRINT_UPDATE=1`). */
const updating = process.env.SHMUP_FINGERPRINT_UPDATE === '1';

/**
 * Prints a walk's table (with `SHMUP_FINGERPRINT_PRINT=1`) for re-pinning, or — with
 * `SHMUP_FINGERPRINT_UPDATE=1` — rewrites its `PINNED` entry in this file (R5-P.P10: the update
 * run stays green exactly when only the pin moved; every other check of the walk still runs).
 *
 * @param name - The walk's name.
 * @param table - Its table.
 */
function print(name: string, table: Record<string, string>): void {
  if (updating) {
    rewritePinned(PIN_FILE, name, table);
    return;
  }
  if (process.env.SHMUP_FINGERPRINT_PRINT !== '1') return;
  const lines = Object.keys(table).map((k) => `    '${k}': '${table[k]}',`);
  process.stdout.write(`  ${name}: {\n${lines.join('\n')}\n  },\n`);
}

/**
 * Compares a walk's table with its pinned entry — skipped in update mode, where {@link print}
 * just rewrote that entry and the `PINNED` in memory is still the old table.
 *
 * @param name - The walk's name.
 * @param table - Its table.
 */
function expectPinned(name: string, table: Record<string, string>): void {
  if (updating) return;
  expect(table).toEqual(PINNED[name]);
}

/** Scene ids every walk saw (checked against {@link SCENE_IDS} by the last test). */
const SEEN = new Set<string>();

/** Ticks of the attract walk's first demo: 40 s, as long as a shipped one (`golden/demos.ts`). */
const WALK_DEMO_TICKS = 2400;

/** Ticks of its second demo: the walk leaves it with a press 200 ticks in. */
const WALK_DEMO2_TICKS = 600;

/** The MANTA (Direct mode). */
const MANTA: Partial<GameConfig> = { shipId: 'manta', powerUpMode: 'direct' };

/**
 * Records one of the attract walk's demos (R2-01) on the given content at the current frame: a
 * fixed input script — shooting while weaving Up, Right, Down, Left for 30 ticks each, with a
 * power-up press in every 40 — in god mode (`assisted`, like the shipped demos), through a replay
 * recorder, so its hashes match when the attract loop plays it back.
 *
 * @param db - The content (the walk plays the demo on the same).
 * @param id - The demo's id.
 * @param stage - The stage it flies.
 * @param config - Session options over the defaults (seed, ship).
 * @param ticks - Recorded ticks.
 * @returns The demo, as `ContentDb.demos` holds one.
 */
function recordWalkDemo(
  db: ContentDb,
  id: string,
  stage: string,
  config: Partial<GameConfig>,
  ticks: number,
): DemoSpec {
  const header = createReplayHeader(resolveGameConfig({ ...config, stage }), {
    buildId: DEMO_BUILD_ID,
    assisted: true,
  });
  const platform = createHeadlessPlatform();
  const recorder = createReplayRecorder(platform.input, header);
  const game = createReplayGame({ ...platform, input: recorder }, header, db);
  const input = platform.snapshot.players[0];
  const moves = [Action.Up, Action.Right, Action.Down, Action.Left];
  for (let i = 0; i < ticks; i++) {
    const phase = i % 40;
    const extra = phase < 30 ? moves[Math.floor(i / 40) & 3] : phase === 30 ? Action.PowerUp : 0;
    commitPlayerInput(input, Action.Shot | extra);
    game.step();
    game.events.clear();
    recorder.check(game.world);
  }
  const replay = recorder.finish(game.world);
  return Object.freeze({
    id,
    description: `the presentation fingerprint's attract walk: ${stage}`,
    stage,
    stageIndex: db.stageIndex.get(stage) ?? -1,
    ticks: replay.ticks,
    document: { ...encodeReplay(replay) },
  });
}

describe('integration: the presentation fingerprint (R1-01)', () => {
  const db = shippedContent();

  it('the front end: boot, title, options, rebind, input test, sound test, practice, extra', () => {
    const w = new Walk(db, { canExit: true, config: { remoteMode: false } });
    const flow = w.flow;
    w.begin('boot');
    w.hold(0, 4);
    flow.setBootProgress(0.4, 'ATLAS');
    w.hold(0, 4);
    flow.setBootProgress(1);
    w.hold(0, 2);
    w.at('boot');
    flow.finishBoot();
    w.begin('title.prompt');
    w.hold(0, 80);
    w.at('title');
    w.begin('title.exit');
    w.press(Action.Back);
    w.at('confirm');
    w.presses(Action.Left, Action.Right, Action.Left);
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('title');
    w.begin('title.menu');
    w.press(Action.Confirm);
    w.hold(0, 2);
    w.walk(flow.title.menu);
    w.hold(0, 4);
    // The Options screen and its pages.
    w.begin('options');
    w.focus(flow.title.menu, TitleItem.Options);
    w.press(Action.Confirm);
    w.at('options');
    w.presses(Action.Right, Action.Right);
    w.walk(flow.options.menu);
    w.press(Action.Left);
    w.press(Action.Left);
    w.begin('options.controls');
    w.focus(flow.options.menu, OptionsItem.Controls);
    w.press(Action.Confirm);
    w.at('controls');
    w.hold(0, 2);
    w.walk(flow.controlsPage.menu);
    w.focus(flow.controlsPage.menu, ControlsItem.Autofire);
    w.press(Action.Right);
    w.press(Action.Left);
    w.begin('rebind');
    w.focus(flow.controlsPage.menu, ControlsItem.Keys);
    w.press(Action.Confirm);
    w.at('rebind');
    w.hold(0, 4);
    w.press(Action.Down);
    w.press(Action.Down);
    w.press(Action.Confirm);
    w.hold(0, 40);
    w.controls.status = CaptureStatus.Captured;
    w.hold(0, 20);
    w.press(Action.Down);
    w.press(Action.Confirm);
    w.hold(0, 30);
    w.controls.status = CaptureStatus.Cancelled;
    w.hold(0, 20);
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('controls');
    w.begin('inputTest');
    w.focus(flow.controlsPage.menu, ControlsItem.InputTest);
    w.press(Action.Confirm);
    w.at('inputTest');
    w.hold(Action.Up | Action.Shot, 20);
    w.hold(Action.Left | Action.Sub, 20);
    w.hold(0, 10);
    w.press(Action.Pause);
    w.press(Action.Pause);
    w.press(Action.Pause);
    w.hold(0, 4);
    w.at('controls');
    w.focus(flow.controlsPage.menu, ControlsItem.Back);
    w.press(Action.Confirm);
    w.at('options');
    w.begin('options.display');
    w.focus(flow.options.menu, OptionsItem.Display);
    w.press(Action.Confirm);
    w.at('display');
    w.hold(0, 2);
    w.walk(flow.displayPage.menu);
    for (const item of [DisplayItem.Bullets, DisplayItem.Scale]) {
      w.focus(flow.displayPage.menu, item);
      w.press(Action.Right);
      w.press(Action.Left);
    }
    w.focus(flow.displayPage.menu, DisplayItem.Back);
    w.press(Action.Confirm);
    w.at('options');
    // R6-04: the GRAPHICS page — OUTPUT, RENDERER, CRT and ASPECT (the last two moved here).
    w.begin('options.graphics');
    w.focus(flow.options.menu, OptionsItem.Graphics);
    w.press(Action.Confirm);
    w.at('graphics');
    w.hold(0, 2);
    w.walk(flow.graphicsPage.menu);
    for (const item of [
      GraphicsItem.Output,
      GraphicsItem.Renderer,
      GraphicsItem.Crt,
      GraphicsItem.Aspect,
    ]) {
      w.focus(flow.graphicsPage.menu, item);
      w.press(Action.Right);
      w.press(Action.Left);
    }
    w.focus(flow.graphicsPage.menu, GraphicsItem.Back);
    w.press(Action.Confirm);
    w.at('options');
    w.begin('options.game');
    w.focus(flow.options.menu, OptionsItem.Game);
    w.press(Action.Confirm);
    w.at('gameOptions');
    w.hold(0, 2);
    w.walk(flow.gameOptionsPage.menu);
    w.focus(flow.gameOptionsPage.menu, GameOptionsItem.Lives);
    w.press(Action.Right);
    w.press(Action.Left);
    w.focus(flow.gameOptionsPage.menu, GameOptionsItem.Back);
    w.press(Action.Confirm);
    w.at('options');
    w.begin('options.extras');
    w.focus(flow.options.menu, OptionsItem.Extras);
    w.press(Action.Confirm);
    w.at('extras');
    w.hold(0, 2);
    w.walk(flow.extrasPage.menu);
    w.press(Action.Right);
    w.press(Action.Left);
    w.press(Action.Back);
    w.at('options');
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('title');
    // The sound test, the practice select and the EXTRA menu.
    w.begin('soundTest');
    w.focus(flow.title.menu, TitleItem.SoundTest);
    w.press(Action.Confirm);
    w.at('soundTest');
    w.presses(Action.Right, Action.Right, Action.Confirm, Action.Down, Action.Right, Action.Right);
    w.press(Action.Confirm);
    w.press(Action.Down);
    w.press(Action.Confirm);
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('title');
    w.begin('practice');
    w.focus(flow.title.menu, TitleItem.Practice);
    w.press(Action.Confirm);
    w.at('practice');
    w.presses(Action.Right, Action.Right, Action.Down, Action.Right, Action.Down, Action.Right);
    w.hold(0, 4);
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('title');
    w.begin('extra');
    w.focus(flow.title.menu, TitleItem.Extra);
    w.press(Action.Confirm);
    w.at('extra');
    w.hold(0, 2);
    w.walk(flow.extra.menu);
    w.focus(flow.extra.menu, ExtraItem.Caravan);
    w.press(Action.Right);
    w.begin('replays.empty');
    w.focus(flow.extra.menu, ExtraItem.Replays);
    w.press(Action.Confirm);
    w.at('replays');
    w.hold(0, 4);
    w.press(Action.Down);
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('extra');
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('title');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('front', w.table);
    expectPinned('front', w.table);
  });

  it('a game: the selects, HUD and zone card, pause, continue, game over, replays', () => {
    const w = new Walk(db, { start: 'title', canExit: true });
    // God mode (R2-01): FULL POWER needs a live ship, whatever the content's terrain does to it.
    // The run is assisted either way (the code marks it), and the replay plays back the same way.
    w.game.debug.godMode = true;
    const flow = w.flow;
    w.hold(0, 2);
    w.begin('difficulty');
    w.title(TitleItem.Start);
    w.at('difficulty');
    w.hold(0, 2);
    w.walk(flow.difficultyMenu.menu);
    w.begin('shipSelect');
    w.press(Action.Confirm);
    w.at('shipSelect');
    w.presses(Action.Down, Action.Down, Action.Up);
    w.hold(0, 10);
    w.begin('weaponSelect');
    w.focus(flow.shipSelect.menu, 0);
    w.press(Action.Confirm);
    w.at('weaponSelect');
    w.hold(0, 170);
    w.walk(flow.weaponSelect.menu);
    w.focus(flow.weaponSelect.menu, WeaponSelectItem.Type);
    w.press(Action.Right);
    w.hold(0, 30);
    w.focus(flow.weaponSelect.menu, WeaponSelectItem.Option);
    w.press(Action.Right);
    w.hold(0, 100);
    w.press(Action.Left);
    w.begin('autoOrder');
    w.focus(flow.weaponSelect.menu, WeaponSelectItem.Order);
    w.press(Action.Confirm);
    w.at('autoOrder');
    w.hold(0, 2);
    w.walk(flow.autoOrder.menu);
    w.press(Action.Right);
    w.press(Action.Back);
    w.hold(0, 4);
    w.at('weaponSelect');
    w.begin('game.card');
    w.focus(flow.weaponSelect.menu, WeaponSelectItem.Start);
    w.press(Action.Confirm);
    w.hold(Action.Shot, 160);
    w.at('game');
    w.begin('game.play');
    w.play(480);
    w.begin('pause');
    w.press(Action.Pause);
    w.at('pause');
    w.hold(0, 2);
    w.walk(flow.pause.menu);
    w.begin('pause.options');
    w.focus(flow.pause.menu, PauseItem.Options);
    w.press(Action.Confirm);
    w.at('options');
    w.hold(0, 2);
    w.focus(flow.options.menu, OptionsItem.Game);
    w.press(Action.Confirm);
    w.at('gameOptions');
    w.hold(0, 2);
    w.walk(flow.gameOptionsPage.menu);
    w.press(Action.Back);
    w.press(Action.Back);
    w.hold(0, 2);
    w.at('pause');
    w.begin('pause.quit');
    w.focus(flow.pause.menu, PauseItem.Quit);
    w.press(Action.Confirm);
    w.at('confirm');
    w.presses(Action.Left, Action.Right, Action.Confirm);
    w.hold(0, 2);
    w.at('pause');
    w.begin('pause.fullPower');
    for (const direction of SECRET_CODES[SecretCode.FullPower]) w.press(direction);
    w.at('game');
    w.play(120);
    w.begin('pause.retry');
    w.press(Action.Pause);
    w.hold(0, 2);
    w.focus(flow.pause.menu, PauseItem.Retry);
    w.press(Action.Confirm);
    w.at('game');
    w.play(120);
    w.begin('continue');
    addScore(w.game.world, 0, 12_340);
    w.game.world.status = 'gameOver';
    w.hold(0, 30);
    w.at('continue');
    w.hold(0, 200);
    w.press(Action.Confirm);
    w.at('game');
    w.play(40);
    w.begin('gameOver');
    w.game.world.status = 'gameOver';
    w.hold(0, 30);
    w.at('continue');
    w.hold(0, 40);
    w.press(Action.Back);
    w.at('gameOver');
    w.hold(0, 100);
    w.press(Action.Confirm);
    w.begin('nameEntry');
    w.name();
    w.begin('hiScore.result');
    w.hold(0, 90);
    w.press(Action.Confirm);
    w.hold(0, 2);
    w.at('title');
    w.begin('replays.lastGame');
    w.title(TitleItem.Extra);
    w.at('extra');
    w.hold(0, 2);
    w.focus(flow.extra.menu, ExtraItem.Replays);
    w.press(Action.Confirm);
    w.at('replays');
    w.presses(Action.Confirm);
    w.hold(0, 2);
    w.focus(flow.replaysScreen.actions, ReplayActionItem.Play);
    w.press(Action.Confirm);
    w.at('replay');
    w.begin('replay');
    w.hold(0, 120);
    w.press(Action.Right);
    w.press(Action.Right);
    w.hold(0, 100);
    w.press(Action.Confirm);
    w.hold(0, 20);
    w.press(Action.Confirm);
    for (let i = 0; i < 3000 && w.top === 'replay'; i++) w.hold(0);
    w.at('replays');
    w.press(Action.Back);
    w.hold(0, 2);
    w.press(Action.Back);
    w.hold(0, 2);
    w.at('title');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('game', w.table);
    expectPinned('game', w.table);
  });

  it('co-op (the join, both HUD halves, the co-op continue) and a Direct-mode game', () => {
    const w = new Walk(db, { start: 'title' });
    w.hold(0, 2);
    w.title(TitleItem.TwoPlayers);
    w.launch();
    w.begin('coop.waiting');
    w.play(120);
    w.begin('coop.join');
    w.press(Action.Shot, Action.Pause);
    w.hold(Action.Shot, 40, Action.Shot | Action.Up);
    w.hold(Action.Shot | Action.Down, 80, Action.Shot | Action.Right);
    w.press(Action.Shot | Action.PowerUp, Action.Shot | Action.PowerUp);
    w.hold(Action.Shot, 40, Action.Shot);
    w.begin('coop.continue');
    addScore(w.game.world, 0, 4_000);
    addScore(w.game.world, 1, 3_000);
    w.game.world.status = 'gameOver';
    w.hold(0, 30);
    w.at('continue');
    w.hold(0, 60);
    w.press(Action.Confirm);
    w.at('game');
    w.hold(Action.Shot, 40);
    w.quit();
    w.title(TitleItem.Start);
    w.launch(1);
    w.begin('direct');
    w.play(240);
    w.hold(Action.Shot | Action.Speed, 2);
    w.hold(Action.Shot | Action.Special, 2);
    w.hold(Action.Shot, 40);
    w.quit();
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('coopDirect', w.table);
    expectPinned('coopDirect', w.table);
  });

  it('the attract loop: demo play, the hi-score tables, the story crawl', () => {
    // The loop plays in-test demos (R2-01): content/demos stays v1's — refused at the current
    // frame and skipped by the flow — until R2-03 re-records it. Like the shipped first two, a
    // KESTREL demo of zone A, then a Direct-mode MANTA one of zone B (cut short by a press).
    const demos: readonly DemoSpec[] = Object.freeze([
      recordWalkDemo(db, 'walk-a', 'zone-a', { seed: 101 }, WALK_DEMO_TICKS),
      recordWalkDemo(db, 'walk-b', 'zone-b', { seed: 102, ...MANTA }, WALK_DEMO2_TICKS),
    ]);
    const demoIndex = new Map<string, number>();
    for (let i = 0; i < demos.length; i++) demoIndex.set(demos[i].id, i);
    const w = new Walk({ ...db, demos, demoIndex }, { start: 'title' });
    w.begin('attract.idle');
    w.hold(0, 720);
    w.at('demo');
    w.begin('attract.demo');
    const played = w.flow.demo.demo;
    for (let i = 0; i < 4000 && w.top === 'demo'; i++) w.hold(0);
    w.at('hiScore');
    // The whole demo played, every hash matching (it ended by running out, not by a desync).
    expect(played?.playback.done, 'attract.demo played to its end').toBe(true);
    expect(played?.playback.report.ok, 'attract.demo stayed in sync').toBe(true);
    w.begin('attract.hiScores');
    for (let i = 0; i < 2000 && w.top === 'hiScore'; i++) w.hold(0);
    w.at('story');
    w.begin('attract.story');
    for (let i = 0; i < 6000 && w.top === 'story'; i++) w.hold(0);
    w.at('title');
    w.begin('attract.demo2');
    w.hold(0, 720);
    w.at('demo');
    w.hold(0, 200);
    w.press(Action.Confirm);
    w.at('title');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('attract', w.table);
    expectPinned('attract', w.table);
  });

  it('a single stage (no campaign): the title code, STAGE CLEAR and TO BE CONTINUED', () => {
    const w = new Walk(db, { start: 'title', config: { stage: 'zone-b' } });
    w.begin('single.title');
    w.hold(0, 2);
    for (const direction of SECRET_CODES[SecretCode.ExtraShips]) w.press(direction);
    w.hold(0, 160);
    w.title(TitleItem.Start);
    w.launch();
    w.begin('single.game');
    w.play(200);
    w.begin('single.stageClear');
    w.clear(5_000);
    for (let i = 0; i < 1000 && w.top !== 'nameEntry'; i++) w.hold(0);
    w.begin('single.nameEntry');
    w.name();
    w.hold(0, 40);
    w.press(Action.Confirm);
    w.hold(0, 2);
    w.at('title');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('single', w.table);
    expectPinned('single', w.table);
  });

  it('a campaign run at the bosses: WARNING, HP bar, zone B bonus, H, escape, ending', () => {
    const save = displaySave({ bossHpBar: true, showHitbox: true });
    const w = new Walk(db, { start: 'game', save, config: { stageSkip: 'boss' } });
    w.game.debug.godMode = true;
    w.begin('runA.boss');
    w.toWarning();
    w.hold(Action.Shot, 300);
    zoneClear(w, 'runA.zoneA');
    toZone(w, 'runA.mapA', 'zone-b');
    w.begin('runA.bonus');
    w.hold(Action.Shot, 20);
    w.game.world.bonus.entered = 0;
    w.hold(Action.Shot, 200);
    expect(w.flow.run.inBonus).toBe(true);
    zoneClear(w, 'runA.bonusClear');
    toZone(w, 'runA.mapB', 'zone-d');
    for (const [zone, next] of [
      ['D', 'zone-f'],
      ['F', 'zone-h'],
    ]) {
      w.begin(`runA.boss${zone}`);
      w.toWarning();
      w.hold(Action.Shot, 240);
      zoneClear(w, `runA.zone${zone}`);
      toZone(w, `runA.map${zone}`, next);
    }
    // Zone H's boss skip lands at IRON SOVEREIGN's WARNING (R5-P.P14): the stage's own boss,
    // entered past the parade — so it takes the same walk to the WARNING as every other zone.
    w.begin('runA.bossH');
    w.toWarning();
    w.hold(Action.Shot, 400);
    expect(w.game.world.bosses.hpBar.visible).toBe(true);
    zoneClear(w, 'runA.zoneH');
    w.at('game');
    w.begin('runA.escape');
    w.hold(Action.Shot | Action.Up, 200);
    zoneClear(w, 'runA.escapeClear');
    ending(w, 'runA');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('runA', w.table);
    expectPinned('runA', w.table);
  });

  it('a campaign run from each zone start: A, C, E, zone G bonus, I, escape, ending', () => {
    const w = new Walk(db, { start: 'game' });
    w.game.debug.godMode = true;
    w.begin('runB.zoneA');
    w.play(200);
    zoneClear(w, 'runB.clearA');
    for (const zone of ['C', 'E']) {
      toZone(w, `runB.map.${zone}`, `zone-${zone.toLowerCase()}`);
      w.begin(`runB.zone${zone}`);
      w.play(200);
      zoneClear(w, `runB.clear${zone}`);
    }
    toZone(w, 'runB.map.G', 'zone-g');
    w.begin('runB.zoneG');
    w.play(120);
    w.game.world.bonus.entered = 0;
    w.hold(Action.Shot, 200);
    expect(w.flow.run.inBonus).toBe(true);
    zoneClear(w, 'runB.bonusClear');
    toZone(w, 'runB.map.I', 'zone-i');
    w.begin('runB.zoneI');
    w.play(200);
    zoneClear(w, 'runB.clearI');
    w.at('game');
    w.begin('runB.escape');
    w.hold(Action.Shot | Action.Down, 200);
    zoneClear(w, 'runB.escapeClear');
    ending(w, 'runB');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('runB', w.table);
    expectPinned('runB', w.table);
  });

  it('the EXTRA modes: Extra Edit types, BOSS RUSH, CARAVAN and its TIME UP, ARCADE LOOP 2', () => {
    const save = createSaveStore(null);
    save.unlock('extraEdit');
    save.unlock('loop2');
    const w = new Walk(db, { start: 'title', save });
    const flow = w.flow;
    w.hold(0, 2);
    w.begin('extra.weaponTypes');
    w.title(TitleItem.Start);
    w.presses(Action.Confirm);
    w.hold(0, 2);
    w.press(Action.Confirm);
    w.at('weaponSelect');
    w.hold(0, 2);
    w.focus(flow.weaponSelect.menu, WeaponSelectItem.Type);
    for (let i = 0; i < 6; i++) {
      w.press(Action.Right);
      w.hold(0, 20);
    }
    w.press(Action.Back);
    w.press(Action.Back);
    w.press(Action.Back);
    w.hold(0, 2);
    w.at('title');
    w.press(Action.Back);
    w.hold(0, 2);
    w.begin('extra.bossRush');
    w.title(TitleItem.Extra);
    w.at('extra');
    w.presses(Action.Confirm);
    w.launch();
    w.play(400);
    w.quit();
    w.begin('extra.caravan');
    w.title(TitleItem.Extra);
    w.hold(0, 2);
    w.focus(flow.extra.menu, ExtraItem.Caravan);
    w.press(Action.Right);
    w.press(Action.Confirm);
    w.launch();
    w.play(200);
    addScore(w.game.world, 0, 7_000);
    w.game.world.timeLeft = 100;
    w.hold(Action.Shot, 200);
    w.at('stageClear');
    for (let i = 0; i < 400 && w.top === 'stageClear'; i++) w.hold(0);
    w.name();
    w.hold(0, 40);
    w.press(Action.Confirm);
    w.hold(0, 2);
    w.at('title');
    w.begin('extra.arcade');
    w.title(TitleItem.Extra);
    w.hold(0, 2);
    w.focus(flow.extra.menu, ExtraItem.Arcade);
    w.press(Action.Right);
    w.press(Action.Confirm);
    w.launch();
    w.play(200);
    w.quit();
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('extraModes', w.table);
    expectPinned('extraModes', w.table);
  });

  it('the shipped translations: title, options, a game and the pause menu in es and ja', () => {
    const table: Record<string, string> = {};
    for (const language of ['es', 'ja']) {
      const w = new Walk(db, { start: 'title', save: displaySave({ language }) });
      const flow = w.flow;
      expect(flow.language).toBe(language);
      w.hold(0, 2);
      w.begin(`${language}.title`);
      w.hold(0, 40);
      w.press(Action.Confirm);
      w.hold(0, 2);
      w.walk(flow.title.menu);
      w.begin(`${language}.options`);
      w.focus(flow.title.menu, TitleItem.Options);
      w.press(Action.Confirm);
      w.hold(0, 2);
      w.walk(flow.options.menu);
      for (const item of [OptionsItem.Controls, OptionsItem.Display, OptionsItem.Game]) {
        w.focus(flow.options.menu, item);
        w.press(Action.Confirm);
        w.hold(0, 2);
        w.walk((flow.stack.top as unknown as { menu: ListMenu }).menu);
        w.press(Action.Back);
        w.hold(0, 2);
      }
      w.press(Action.Back);
      w.hold(0, 2);
      w.at('title');
      w.begin(`${language}.game`);
      w.focus(flow.title.menu, TitleItem.Start);
      w.press(Action.Confirm);
      w.launch();
      w.play(160);
      w.press(Action.Pause);
      w.hold(0, 2);
      w.walk(flow.pause.menu);
      w.press(Action.Pause);
      w.quit();
      w.end();
      for (const id of w.seen) SEEN.add(id);
      Object.assign(table, w.table);
    }
    print('languages', table);
    expectPinned('languages', table);
  });

  it('bare gameplay (no scene flow): the World view alone', () => {
    const w = new Walk(db, { bare: true });
    w.begin('bare');
    w.play(240);
    w.end();
    print('bare', w.table);
    expectPinned('bare', w.table);
  });

  it('co-op on a single stage: shield pips, a player out, STAGE CLEAR, GAME OVER, Direct', () => {
    const table: Record<string, string> = {};
    // A meter game: the co-op Force Field pips, player 2 out (PRESS START, then GAME OVER in its
    // half), the co-op STAGE CLEAR and its name entries, then the co-op game over.
    const w = new Walk(db, { start: 'title', config: { stage: 'zone-b' } });
    w.hold(0, 2);
    w.title(TitleItem.TwoPlayers);
    w.launch();
    w.begin('coopSingle.join');
    w.press(Action.Shot, Action.Pause);
    w.hold(Action.Shot, 40, Action.Shot | Action.Up);
    expect(hudPlayerState(w.game.world, 1)).toBe(HudPlayerState.Playing);
    w.begin('coopSingle.shield');
    w.press(Action.Pause);
    w.at('pause');
    w.hold(0, 2);
    for (const direction of SECRET_CODES[SecretCode.FullPower]) w.press(direction);
    w.at('game');
    w.hold(Action.Shot, 80, Action.Shot | Action.Down);
    expect(w.game.world.players[1].shield.hits).toBeGreaterThan(0);
    // Player 2 on its last life is destroyed (the pause menu's self-destruct, for one ship).
    w.begin('coopSingle.p2Continue');
    w.game.world.players[1].lives = 1;
    let hit = false;
    for (let i = 0; i < 300 && !hit; i++) {
      hit = selfDestruct(w.game.world, 1);
      if (!hit) w.hold(Action.Shot);
    }
    expect(hit).toBe(true);
    w.hold(Action.Shot, PLAYER_DEAD_TICKS + 60);
    expect(hudPlayerState(w.game.world, 1)).toBe(HudPlayerState.Continue);
    // Its continues used up: GAME OVER in its half while player 1 plays on.
    w.begin('coopSingle.p2Out');
    const scores = w.game.world.scoring.board.scores;
    scores[1].continues = w.game.world.config.continues;
    w.hold(Action.Shot, 40);
    expect(hudPlayerState(w.game.world, 1)).toBe(HudPlayerState.Out);
    w.begin('coopSingle.stageClear');
    w.clear(5_000);
    for (let i = 0; i < 1000 && w.top !== 'nameEntry'; i++) w.hold(0);
    w.begin('coopSingle.nameEntry');
    w.name();
    w.hold(0, 40);
    w.press(Action.Confirm);
    w.hold(0, 2);
    w.at('title');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    Object.assign(table, w.table);
    // The co-op game over (a new best: NEW HI-SCORE).
    const g = new Walk(db, { start: 'title', config: { stage: 'zone-b' } });
    g.hold(0, 2);
    g.title(TitleItem.TwoPlayers);
    g.launch();
    g.press(Action.Shot, Action.Pause);
    g.hold(Action.Shot, 40, Action.Shot);
    g.begin('coopSingle.gameOver');
    addScore(g.game.world, 0, 90_000);
    addScore(g.game.world, 1, 30_000);
    g.game.world.status = 'gameOver';
    g.hold(0, 30);
    g.at('continue');
    g.hold(0, 40);
    g.press(Action.Back);
    g.at('gameOver');
    g.hold(0, 100);
    g.end();
    for (const id of g.seen) SEEN.add(id);
    Object.assign(table, g.table);
    // A Direct-mode co-op game: the compact tier pips, with FULL POWER's gold Arm.
    const d = new Walk(db, { start: 'title' });
    d.hold(0, 2);
    d.title(TitleItem.TwoPlayers);
    d.launch(1);
    d.begin('coopSingle.direct');
    d.press(Action.Shot, Action.Pause);
    d.hold(Action.Shot, 60, Action.Shot | Action.Up);
    d.hold(Action.Shot | Action.Speed, 2, Action.Shot | Action.Speed);
    d.hold(Action.Shot, 40, Action.Shot);
    d.begin('coopSingle.directFull');
    d.press(Action.Pause);
    d.at('pause');
    d.hold(0, 2);
    for (const direction of SECRET_CODES[SecretCode.FullPower]) d.press(direction);
    d.at('game');
    d.hold(Action.Shot, 60, Action.Shot | Action.Down);
    expect(d.game.world.players[1].shield.tier).toBeGreaterThan(0);
    d.end();
    for (const id of d.seen) SEEN.add(id);
    Object.assign(table, d.table);
    print('coopSingle', table);
    expectPinned('coopSingle', table);
  });

  it('a co-op campaign run: the zone tallies, the escape and the abyss ending a boss escaped', () => {
    const w = new Walk(db, { start: 'title' });
    w.game.debug.godMode = true;
    w.hold(0, 2);
    w.title(TitleItem.TwoPlayers);
    w.launch();
    w.begin('coopRun.zoneA');
    w.press(Action.Shot, Action.Pause);
    w.hold(Action.Shot, 40, Action.Shot);
    zoneClear(w, 'coopRun.clearA');
    for (const zone of ['C', 'E', 'G', 'I']) {
      toZone(w, `coopRun.map.${zone}`, `zone-${zone.toLowerCase()}`);
      w.hold(Action.Shot, 40, Action.Shot);
      expect(hudPlayerState(w.game.world, 1)).toBe(HudPlayerState.Playing);
      // Zone I's boss got away (as its time limit running out records it).
      if (zone === 'I') w.game.world.endingFlags |= EndingFlag.BossEscaped;
      zoneClear(w, `coopRun.clear${zone}`);
    }
    w.at('game');
    w.begin('coopRun.escape');
    w.hold(Action.Shot | Action.Down, 100, Action.Shot | Action.Up);
    zoneClear(w, 'coopRun.escapeClear');
    w.at('ending');
    expect(w.flow.run.ending?.id).toBe('throne-escape');
    w.begin('coopRun.ending.story');
    for (let i = 0; i < 6000 && w.flow.ending.phase === 0; i++) w.hold(0);
    expect(w.flow.ending.phase).toBe(1); // the result card
    w.begin('coopRun.ending.card');
    w.hold(0, ENDING_LOCK_TICKS + 20);
    w.at('ending');
    w.end();
    for (const id of w.seen) SEEN.add(id);
    print('coopRun', w.table);
    expectPinned('coopRun', w.table);
  });

  it('the walks show every scene of the flow', (ctx) => {
    // Only meaningful after every walk above ran (not under a `-t` filter).
    if (SEEN.size === 0) ctx.skip();
    expect([...SEEN].sort()).toEqual([...SCENE_IDS].sort());
  });
});

/**
 * A memory-only save with display options set (before the flow reads them).
 *
 * @param display - The display options to set.
 * @returns The save.
 */
function displaySave(display: Record<string, unknown>): SaveStore {
  const save = createSaveStore(null);
  save.setOptions({ ...save.options, display: { ...save.options.display, ...display } });
  return save;
}

/**
 * In a campaign zone: clears it, then the zone result tally (OK after a while).
 *
 * @param w - The walk.
 * @param label - The tally's segment label.
 */
function zoneClear(w: Walk, label: string): void {
  w.at('game');
  w.begin(label);
  w.clear(2_500);
  for (let i = 0; i < 200 && w.top !== 'stageClear'; i++) w.hold(0);
  w.at('stageClear');
  w.hold(0, 120);
  w.press(Action.Confirm);
  w.hold(0, 2);
}

/**
 * On the zone map: the upper or the lower exit (two exits wrap: Down then Up is back on the upper
 * one), then the launch into its zone.
 *
 * @param w - The walk.
 * @param label - The map's segment label.
 * @param stage - The stage the chosen zone plays (`zone-<x>`); its letter's place in the alphabet
 *   tells the exit: B, D, F, H are the upper ones, C, E, G, I the lower ones.
 */
function toZone(w: Walk, label: string, stage: string): void {
  w.at('map');
  w.begin(label);
  w.hold(0, 30);
  w.press(Action.Down);
  w.press(Action.Up);
  if ('cegi'.includes(stage.charAt(stage.length - 1))) w.press(Action.Down);
  w.hold(0, 20);
  w.press(Action.Confirm);
  for (let i = 0; i < 200 && w.top === 'map'; i++) w.hold(0);
  w.at('game');
  expect(w.game.world.stage?.stage.id).toBe(stage);
}

/**
 * After the final clear: the ending's story and card, the credits, the name entry, the table.
 *
 * @param w - The walk.
 * @param run - The run's label prefix.
 */
function ending(w: Walk, run: string): void {
  w.at('ending');
  w.begin(`${run}.ending.story`);
  for (let i = 0; i < 6000 && w.flow.ending.phase === 0; i++) w.hold(0);
  expect(w.flow.ending.phase).toBe(1); // the result card
  w.begin(`${run}.ending.card`);
  w.hold(0, ENDING_LOCK_TICKS + 20);
  w.press(Action.Confirm);
  w.at('credits');
  w.begin(`${run}.credits`);
  for (let i = 0; i < 9000 && w.top === 'credits'; i++) w.hold(0);
  w.begin(`${run}.nameEntry`);
  w.name();
  w.hold(0, 60);
  w.press(Action.Confirm);
  w.hold(0, 2);
  w.at('title');
}

/**
 * The pinned fingerprints, per walk (re-pin with `SHMUP_FINGERPRINT_PRINT=1`). Re-pinned at R2-01's
 * flip to the 640×360 frame (12-px HUD bars and tiles, the 9×12 font, the ×3/2 interim art): every
 * segment moved. Re-pinned again at R4-01.A1b: the v2 ships draw five bank frames, so every world
 * hash whose walk banks the ship moved (`p.bank` indexes frames 1 … 4 now); the HUD rows carry the
 * C5 re-pin. R4-01.A3 moved the ten segments whose walk draws Options: the pulse frame is
 * `floor(tick / OPTION_ANIM_TICKS) & (OPTION_FRAMES - 1)` now — four frames instead of two, no
 * drawn position changed. R4-02.B2 moved the four world hashes whose walk shows an item: every
 * `ITEM_KINDS` entry carries four frames now, the glint's frames 1 and 3 drawn where the old
 * blink held one of its two — no item position changed. Re-pinned again at R4-01.A2: every game
 * segment's world hash gained the ship's thruster sprite in the player layer (the flame behind
 * the hull, whole-pixel, frame `(tick >> 2) & 3`), and the interned sprite ids shifted with the
 * new names. R4-01.A4 moved two more world hashes — the game's and the co-op stage's segments
 * that draw the Force Field: its drawn frame is the wear frame × 2 + a shimmer pair member that
 * twinkles every four ticks (the art pairs each of its four wear states) — no shield position
 * changed.
 */
const PINNED: Record<string, Record<string, string>> = {
  front: {
    boot: '9c8573d9 b004d6e1 05544aa6 ec3e6705',
    'title.prompt': '6d9d1305 9c557965 80a26cf5 2873a7c5',
    'title.exit': '46be5271 c94e24e5 2eab2015 87baae65',
    'title.menu': '0dbe686d a5b509f9 82b34cc6 24482885',
    options: 'ebd2d36d 843dc42d 059d18d9 cb1bc225',
    'options.controls': '7ef0939d 843dc42d d5e32d81 99f2b285',
    rebind: 'a68b21e5 23be0ddd f7ced5e2 43fd3c05',
    inputTest: '0204b3f1 fc5910b5 88228dd5 414cb545',
    'options.display': '0b38486d b1382dc9 423730ea eb493265',
    'options.graphics': '732def45 7431bd9d 216feead a4aa6605',
    'options.game': 'ad29c97d aa52f245 c3740400 952881c5',
    'options.extras': '6a25f625 ddb53aa9 c005afe6 8a90b305',
    soundTest: 'add34afd ddb53aa9 608569b2 b02f3ee5',
    practice: '7dc6536d 843dc42d 9ebd5109 88a2cb85',
    extra: '865199d1 0e2b37d5 84194cf5 2d0859e5',
    'replays.empty': '97185f15 0e2b37d5 e873ed45 a31a93e5',
  },
  game: {
    difficulty: '9799c4d5 c94e24e5 c8498595 6d5b6685',
    shipSelect: 'fa79a561 7fa3520d b768f6f1 82623985',
    weaponSelect: '5372cbc1 78c5388d 80cb1b4e 0f7c1465',
    autoOrder: 'a5ee0285 b1382dc9 746c0a4e 3a21ce85',
    'game.card': '3d5f1aad 11d9cba1 80c04580 6cdc9245',
    'game.play': '0cfccb05 1ed352c0 5c0b0832 b952d9c5',
    pause: '968d3f25 84948925 b6d70cd6 94897405',
    'pause.options': 'abb5d4b5 78f65845 cecc4ed6 83b688c5',
    'pause.quit': '1fae8ed5 45361d45 9034bed6 fdb096c5',
    'pause.fullPower': 'fa0559d1 c6c8574d 204b5734 1b857fa5',
    'pause.retry': '59eaadb5 225d4405 434cc59d 7c490885',
    continue: '3426e97d 849a3685 b194b999 007aec6a',
    gameOver: '1a078253 90ab57a1 678dce8f 71c564ba',
    nameEntry: 'f5f13525 b1382dc9 56caab8a 70a36b85',
    'hiScore.result': 'c937966d 3bd76f29 ac4eb872 4cf8f185',
    'replays.lastGame': '2b94aa61 9a5e9019 27d877dd 3f198b25',
    replay: '6b35e1a1 d6f2e833 e76d8946 4e80eaa8',
  },
  coopDirect: {
    'coop.waiting': '063595c5 71908532 3eb68cd1 2786acc5',
    'coop.join': 'd17ecad0 5fe5b450 946c11fc 6cdc9245',
    'coop.continue': '3918ce28 778b624e a022051c 8a5296aa',
    direct: 'd1710dac 0698b8cd 76e8f494 15723ac5',
  },
  attract: {
    'attract.idle': 'e9718e93 3408a8b5 5d9e7b34 b9fbf7c5',
    'attract.demo': 'd787eedf e93b6eac 50bd0859 7e4bc9c5',
    'attract.hiScores': '57341649 e5de0f9d 21e55742 4a222345',
    'attract.story': 'b141bcbd 0f56de91 543ba9fe f7412c05',
    'attract.demo2': 'e53b9244 fe3d4f40 05ce29af a3a65905',
  },
  single: {
    'single.title': '3136c0a2 752eb13a d24a64a8 aca532e5',
    'single.game': 'a1e2b9b5 eeced6a5 e89b3185 157bb6c5',
    'single.stageClear': 'a3f1b0d8 7903743f eff1eb4f 3d4db705',
    'single.nameEntry': '580fc260 25d9e681 5e0d08f4 4207f105',
  },
  runA: {
    'runA.boss': '2bedd268 c6b1efee 3ed21583 89fd5c85',
    'runA.zoneA': '1bb6ccc6 7cec6476 14254d99 11568378',
    'runA.mapA': 'add23818 8db90570 94fc4b0b 7e24c625',
    'runA.bonus': 'b71ae69d 84fa5935 67c31c92 7c941945',
    'runA.bonusClear': 'f3ec2d12 1496b68d 736e0267 11568378',
    'runA.mapB': '4c2156e4 62db0670 ac5c70a0 7e24c625',
    'runA.bossD': '303a82b5 dad2b6c0 ebee1b04 85831505',
    'runA.zoneD': '7e154d46 e0c3913f abd2a5ff 11568378',
    'runA.mapD': '58270091 da8e783e 1df82610 7e24c625',
    'runA.bossF': 'e46526d8 683dd3f1 3be32389 3ca1cac5',
    'runA.zoneF': '6c1ead67 d3688ab1 10455572 11568378',
    'runA.mapF': 'bc1c626d 22e97a22 80168a6d 7e24c625',
    'runA.bossH': 'c480f230 620dbbe4 9039109b bfe22905',
    'runA.zoneH': 'ed992be7 2edb836e 5d9b7f73 11568378',
    'runA.escape': '351fd1c9 3ef84ce5 bdd95c59 157bb6c5',
    'runA.escapeClear': 'e5f87ec0 049baae9 0a2ea4b4 11568378',
    'runA.ending.story': 'b67bd6f0 4c23c6e8 9002c4cf 304d08e5',
    'runA.ending.card': '93dae969 a1a5e151 1cbaeed0 c57fb005',
    'runA.credits': '9f75ddba cb29e5ec 7872c10a 54c731a5',
    'runA.nameEntry': 'd24a5450 16eb6249 e847248d 9f7d7385',
  },
  runB: {
    'runB.zoneA': '0f80bfec 2b9761c5 6eb2eaca 157bb6c5',
    'runB.clearA': '53d30a57 faf1198d 3fa248ae 11568378',
    'runB.map.C': 'ee9501b8 4ab9a4c4 154878ad e5128665',
    'runB.zoneC': '44639ea5 25c3f165 5138f558 157bb6c5',
    'runB.clearC': '09acc4da d9132b2d 7916ed91 11568378',
    'runB.map.E': '091ad5c6 42b1dc94 ed98c0a3 e5128665',
    'runB.zoneE': 'c7e0d333 073962c5 708884e2 157bb6c5',
    'runB.clearE': '82147a89 38c35f15 e345f8bb 11568378',
    'runB.map.G': '6ae60d93 f14f6d5c abde73d2 e5128665',
    'runB.zoneG': 'e61dfa66 07dc76c5 8b44eb7b 9cf0c5c5',
    'runB.bonusClear': '3f64bbfa 7d8f0595 8c4f132b 11568378',
    'runB.map.I': '227f9c27 de2ea1e4 87b5925a e5128665',
    'runB.zoneI': '68ab91b6 3edd0d65 23558d2b 157bb6c5',
    'runB.clearI': 'aee07a8c 9ede4dcf 82d14b0d 11568378',
    'runB.escape': '2580d511 d10853c5 afa2999d 157bb6c5',
    'runB.escapeClear': '25ed5dca 780dad95 3b5a5f11 11568378',
    'runB.ending.story': 'e1349813 76a7d22c 6e4899dd 5b18fda5',
    'runB.ending.card': '27190b8f a1a5e151 6aeb0964 c57fb005',
    'runB.credits': '08cdcc13 cb29e5ec 5b15faa5 54c731a5',
    'runB.nameEntry': '8961696c 16eb6249 9d58c8aa 9f7d7385',
  },
  extraModes: {
    'extra.weaponTypes': '06082105 02773c71 3cfa240e bf9340c5',
    'extra.bossRush': 'a90a9780 9a133fd2 87492cd8 e9642425',
    'extra.caravan': '528ecbb7 f6be0744 5f6e3b98 68aa3e85',
    'extra.arcade': 'e2b0568c 0edf3aee 9d421535 cfa20445',
  },
  languages: {
    'es.title': '7f60c2d9 b4f60d95 fdb07ead 9e6aa4c5',
    'es.options': '41505b3d c0e67b3d 62df1c99 1c1e6065',
    'es.game': '7a2c5f68 83bf4270 47673907 445802e5',
    'ja.title': '5e745238 b4f60d95 fdb07ead 9e6aa4c5',
    'ja.options': 'aa558125 c0e67b3d 62df1c99 1c1e6065',
    'ja.game': '15515918 83bf4270 47673907 445802e5',
  },
  bare: {
    bare: '4d3bfc25 4d3bfc25 b2061eae 0e5dbbc5',
  },
  coopSingle: {
    'coopSingle.join': 'cb6f9fa1 30763d79 518d7a76 0d596b05',
    'coopSingle.shield': 'e6223dd1 78b6ffb1 3cbb068a 44e06d65',
    'coopSingle.p2Continue': '1f320f34 2871a456 2962ad89 4c5faf25',
    'coopSingle.p2Out': '68e4b4f5 2d2c2d15 5038b996 72a5a2c5',
    'coopSingle.stageClear': 'fa434b1c 8765765b 5052f8ea 3d4db705',
    'coopSingle.nameEntry': '1f559ab8 25d9e681 f9f4e9bf 4207f105',
    'coopSingle.gameOver': 'ca39edad 86e1b0fd 65ed3c0b ed25983a',
    'coopSingle.direct': 'a28285c5 e2772635 8f231136 7af1aac5',
    'coopSingle.directFull': 'd9196f41 091c0b49 88e5df66 3185fae5',
  },
  coopRun: {
    'coopRun.zoneA': '8535c7c5 30763d79 e1f452bf 0d596b05',
    'coopRun.clearA': 'b4ccb9de 4cdd9826 4acba078 11568378',
    'coopRun.map.C': '74d59be8 88ec600c e63b39e1 55ec2b65',
    'coopRun.clearC': '07780673 093b3a1d 37587628 11568378',
    'coopRun.map.E': '02f8fa96 a4f9439c 41c96011 55ec2b65',
    'coopRun.clearE': '1c4c987a a78b4fe3 8a23378e 11568378',
    'coopRun.map.G': 'decea2b3 ceabe666 6225c186 55ec2b65',
    'coopRun.clearG': '1cbf90f8 9b6a4f87 fc3fdc02 11568378',
    'coopRun.map.I': 'ae108707 60cf66ac 6e2debd3 55ec2b65',
    'coopRun.clearI': '0c335575 ee4c2cf4 ca9a9ca7 11568378',
    'coopRun.escape': '7b61d3b5 5e39c1c5 da1d034c 94848a45',
    'coopRun.escapeClear': 'ce512bce e57f495e 5faeff98 11568378',
    'coopRun.ending.story': '7f7debae 76a7d22c 9a7cfa7a 5b18fda5',
    'coopRun.ending.card': 'c3600a0c 9c557965 30678e9e 2873a7c5',
  },
};
