/**
 * # bosses — multi-part bosses, weak points, phases, the WARNING and the death sequence
 *
 * **Status: partial.** The P0 mechanics of plan M1-13 are implemented: multi-part bosses with
 * translation-only part transforms, per-part hit points and hurtboxes, weak points (armour,
 * parts that need others destroyed first, parts vulnerable only while open), phase state machines
 * (HP threshold, destroyed-part mask, timer), the WARNING intro and the death sequence. Boss
 * timers / escapes, the HP bar, mid-bosses, raids and multi-bosses arrive with M2-09.
 *
 * **Responsibility.** One boss at a time per World ({@link BossSystem}, the World's `bosses`):
 *
 * - **Parts.** A boss (an enemy entry with a `boss` section — `core/data` `BossSpec`) has up to
 *   {@link MAX_BOSS_PARTS} {@link BossPart}s, each a translation from its parent (or the boss's
 *   origin), recomputed every tick parents first. Parts share the enemies' hit path: their
 *   hurtboxes go into the World's grid with ids {@link BOSS_PART_ID_BASE} + index (after the 64
 *   enemy slots), the player shots find them there and apply their hits through
 *   {@link BossSystem.damagePart}; touching a part is contact damage for the ships. A destroyed
 *   part explodes (score to the shooter), takes its children with it and is no longer drawn,
 *   hit or touched.
 * - **Weak points** ({@link BossVulnerable}): `always`, `afterParts` (every part of its `requires`
 *   list destroyed first — a core behind shield plates), `whenOpen` (only while the behaviour
 *   holds it open — a mouth) and `never` (armour). A hit on a part that cannot take damage right
 *   now — or on any part during the intro — `clink`s: the shot dies without damage.
 * - **Phases.** The boss runs the behaviour of its current phase (a boss behaviour of
 *   `core/behaviors`, {@link BossBehavior}); when the phase's condition is met (the cores' total
 *   hit points fall below `hpBelow`, `count` of its `partsDestroyed` are destroyed, or it has run
 *   `ticks` ticks) the next phase starts and its behaviour replaces the running script.
 * - **The WARNING** (shmup_feat.md §13 / §19, decision D10). A stage `warning` event starts it:
 *   the camera brakes to a scroll lock (`StageRunner.brake`, {@link WARNING_BRAKE_TICKS}), the
 *   World's status is `bossWarning` for {@link WARNING_TICKS} ticks, the music stops, the
 *   playfield dims (`SimEventKind.Dim`), and once a second the siren wails (`SFX WarningSiren`,
 *   priority `Critical`) with a flash (`FlashKind.Warning`); the {@link WarningView} carries the
 *   text — built once per boss at world creation from the game's own template
 *   ({@link WARNING_TEMPLATE}, never the arcade original's words). Then the boss flies in from the
 *   right edge (its **intro**: `introTicks`, invulnerable, eased) and the boss music starts. A
 *   stage `boss` event brings a boss in at once (no WARNING, no brake).
 * - **The death sequence.** When the last core is destroyed: every cancelable bullet and laser is
 *   cancelled (sparkles), the music fades out, then chained explosions (`FX BossChain` + `SFX
 *   BossExplode` every {@link BOSS_CHAIN_INTERVAL} ticks at random points of the boss — cosmetic
 *   RNG) until {@link BOSS_CHAIN_TICKS}, the final blast (`FX BossBlast`, a large shake, a flash,
 *   rumble, a {@link BOSS_BLAST_HIT_STOP_TICKS}-tick hit-stop), the **score tally** after the
 *   hit-stop (the boss's `score` to the player who destroyed the last core,
 *   `SimEventKind.BossDefeated`, the stage-clear jingle `MUSIC StageClear`) and at
 *   {@link BOSS_CLEAR_TICKS} the status `stageClear`; the camera lock is released.
 *
 * **Tick.** Phase 3 — {@link BossSystem.update} (state timers: the WARNING, the intro, the phase
 * clock, the death sequence), then the stage hooks may start a boss; phase 4 —
 * {@link BossSystem.runScript}; phase 5 — {@link BossSystem.move} (intro fly-in, tracking /
 * move-to motion, riding the camera, part transforms, hit flash); phase 6 —
 * {@link BossSystem.insertColliders}, {@link BossSystem.collidePlayers}; phase 7 — the player
 * shots call {@link BossSystem.damagePart}, then {@link BossSystem.resolve} (phase changes);
 * phase 9 — {@link BossSystem.sync} (the parts' sprite batch on `LayerId.AirEnemies`). The state
 * timers count simulated ticks: a hit-stop (the final blast's, a player's death) pauses them.
 *
 * **Zero allocation.** The boss, its parts, the script API, the compiled specs and the batch are
 * built by {@link createBossSystem}; the per-tick methods only write numbers. As with the
 * enemies (decision D29), starting a phase creates its generator and every wake allocates the
 * generator's `{ value, done }` result.
 *
 * **Implements.**
 * - shmup_feat.md §13 Bosses & mid-bosses — the WARNING intro, the death sequence, multi-part
 *   bosses, weak points, the phase state machine
 * - shmup_feat.md §19 — the WARNING siren (critical), music switch to the boss theme, the
 *   stage-clear jingle
 * - shmup_feat.md §20 — clink on invulnerable parts, big explosions, bullet cancel on boss death,
 *   rumble on boss kill, screen shake used sparingly
 *
 * **Public API.** {@link createBossSystem}, {@link BossSystem}, {@link BossHost}, {@link Boss},
 * {@link BossPart}, {@link BossState}, {@link BOSS_STATE_NAMES}, {@link BossVulnerable},
 * {@link BossHit}, {@link BossMotion}, {@link BossScriptApi}, {@link BossBehavior},
 * {@link BossBehaviorLookup}, {@link EMPTY_BOSS_BEHAVIORS}, {@link WarningState},
 * {@link WARNING_TEMPLATE}, {@link formatWarningText}, {@link BOSS_PART_ID_BASE},
 * {@link MAX_HIT_TARGETS}, {@link WARNING_TICKS}, {@link WARNING_PULSE_TICKS},
 * {@link WARNING_BRAKE_TICKS}, {@link WARNING_DIM_PERCENT}, {@link WARNING_MUSIC_FADE_TICKS},
 * {@link BOSS_CHAIN_TICKS}, {@link BOSS_CHAIN_INTERVAL}, {@link BOSS_BLAST_HIT_STOP_TICKS},
 * {@link BOSS_BLAST_SHAKE_TICKS}, {@link BOSS_TALLY_TICKS}, {@link BOSS_CLEAR_TICKS},
 * {@link BOSS_MUSIC_FADE_TICKS}, {@link BOSS_ENTRY_MARGIN}.
 *
 * **Planned API.** Boss timers and escapes, the optional HP bar, mid-bosses ("captains"),
 * battleship raids, boss-inside-boss, double bosses, boss rush (M2-09); rotating part transforms.
 *
 * @module
 */
import {
  AIM_AT_TARGET,
  BulletOrigin,
  CancelMode,
  LASER_ACTIVE_TICKS,
  LASER_FADE_TICKS,
  LASER_GROW_TICKS,
  LASER_TELEGRAPH_TICKS,
  LASER_WIDTH,
  type BulletSystem,
} from '../bullets/index.js';
import type { SpatialGrid } from '../collision/index.js';
import { PLAYFIELD_W } from '../config/index.js';
import {
  BOSS_VULNERABILITIES,
  ENEMY_EXPLOSIONS,
  MAX_BOSS_PARTS,
  type BossPhaseSpec,
  type BossSpec,
  type ContentDb,
  type PlayerShipSpec,
  type StageSpec,
} from '../data/index.js';
import type { DebugFlags } from '../debug/index.js';
import { HIT_FLASH_TICKS, MAX_ENEMIES } from '../enemies/index.js';
import {
  FX_CUES,
  MUSIC_CUES,
  SFX_CUES,
  SfxPriority,
  SimEventKind,
  type EventQueue,
} from '../events/index.js';
import {
  FlashKind,
  ShakeMagnitude,
  requestFlash,
  requestHitStop,
  requestShake,
  type FxState,
} from '../fx/index.js';
import { defineModule } from '../module-info.js';
import {
  fireAimed,
  fireNWay,
  fireRing,
  fireSpray,
  rankedWait,
  resumeScript,
  type Script,
  type ScriptHolder,
} from '../patterns/index.js';
import { PlayerHitCause, playerHit, type PlayerCamera, type PlayerShip } from '../player/index.js';
import {
  LayerId,
  SpriteFlag,
  createSpriteBatch,
  type SpriteBatch,
  type WarningView,
} from '../presentation/index.js';
import type { Rng, RngStreams } from '../rng/index.js';
import { addScore, type ScoreBoard } from '../scoring/index.js';
import type { WorldStatus } from '../world/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'bosses',
  status: 'partial',
  specRefs: ['shmup_feat.md §13', 'shmup_feat.md §19', 'shmup_feat.md §20'],
});

/**
 * Hit / grid / laser-source id of boss part `i`: `BOSS_PART_ID_BASE + i`, right after the
 * {@link MAX_ENEMIES} enemy slots, so one id space covers every hit target.
 */
export const BOSS_PART_ID_BASE = MAX_ENEMIES;

/** Hit-target ids of a World: the enemy slots, then the boss parts. */
export const MAX_HIT_TARGETS = MAX_ENEMIES + MAX_BOSS_PARTS;

/** Length of the WARNING in ticks (plan M1-13: three seconds). */
export const WARNING_TICKS = 180;

/** The siren wails (with a flash) every this many ticks of the WARNING, from its first tick. */
export const WARNING_PULSE_TICKS = 60;

/** Ticks the camera takes to brake to its lock when the WARNING starts. */
export const WARNING_BRAKE_TICKS = 60;

/** How dark the playfield gets during the WARNING (`SimEventKind.Dim` level, percent). */
export const WARNING_DIM_PERCENT = 50;

/** Fade-out of the stage music when the WARNING starts, in ticks. */
export const WARNING_MUSIC_FADE_TICKS = 30;

/** Length of the death chain of explosions, in ticks (the final blast comes on its last tick). */
export const BOSS_CHAIN_TICKS = 120;

/** Ticks between two explosions of the death chain. */
export const BOSS_CHAIN_INTERVAL = 8;

/** Hit-stop of the final blast, in ticks (plan M1-13). */
export const BOSS_BLAST_HIT_STOP_TICKS = 5;

/** Length of the final blast's large screen shake, in ticks. */
export const BOSS_BLAST_SHAKE_TICKS = 40;

/** Tick of the death sequence the score tally happens on: the first one after the hit-stop. */
export const BOSS_TALLY_TICKS = BOSS_CHAIN_TICKS + 1;

/** Tick of the death sequence the World's status becomes `stageClear` on (plan M1-13: 180). */
export const BOSS_CLEAR_TICKS = 180;

/** Fade-out of the boss music when the last core is destroyed, in ticks. */
export const BOSS_MUSIC_FADE_TICKS = 60;

/** A boss starts its intro this many pixels beyond the right edge of the view (its left edge). */
export const BOSS_ENTRY_MARGIN = 8;

/**
 * The WARNING text (decision D10): the game's own paraphrase, never the arcade original's words.
 * `{name}` and `{code}` are the boss's `displayName` and `code`; lines split at `\n` (each fits
 * the 384-px playfield in the 6-px font).
 */
export const WARNING_TEMPLATE = 'WARNING!!\nGIANT HOSTILE "{name}"\nCLOSING IN - CODE {code}';

/**
 * Builds a boss's WARNING text from {@link WARNING_TEMPLATE} (load time: allocates).
 *
 * @param displayName - The boss's name (upper case, e.g. `HALCYON BULWARK`).
 * @param code - Its code (e.g. `HB-01`).
 * @returns The text, e.g. `WARNING!!\nGIANT HOSTILE "HALCYON BULWARK"\nCLOSING IN - CODE HB-01`.
 *
 * @example
 * ```ts
 * formatWarningText('TRIAL WARDEN', 'TW-00').split('\n')[1]; // → 'GIANT HOSTILE "TRIAL WARDEN"'
 * ```
 */
export function formatWarningText(displayName: string, code: string): string {
  return WARNING_TEMPLATE.split('{name}').join(displayName).split('{code}').join(code);
}

/** Life-cycle state of the World's boss slot ({@link Boss.state}). Hashed: append only. */
export const BossState = {
  /** No boss. */
  None: 0,
  /** The WARNING is playing; the boss is not in play yet. */
  Warning: 1,
  /** Flying in, invulnerable (every hit clinks). */
  Intro: 2,
  /** Fighting: phases, scripts, damage. */
  Fight: 3,
  /** The death sequence (chain of explosions, blast, tally). */
  Dying: 4,
  /** Defeated; the stage is clear. */
  Dead: 5,
} as const;

/** A {@link BossState} code. */
export type BossState = (typeof BossState)[keyof typeof BossState];

/** {@link BossState} names by code (debug overlays, test output). */
export const BOSS_STATE_NAMES: readonly string[] = Object.freeze([
  'none',
  'warning',
  'intro',
  'fight',
  'dying',
  'dead',
]);

/** When a part takes damage: the codes of `core/data` `BOSS_VULNERABILITIES`, in order. */
export const BossVulnerable = {
  /** Always. */
  Always: 0,
  /** Once every part of its `requires` mask is destroyed. */
  AfterParts: 1,
  /** While open ({@link BossScriptApi.setOpen}). */
  WhenOpen: 2,
  /** Never (armour). */
  Never: 3,
} as const;

/** A {@link BossVulnerable} code. */
export type BossVulnerable = (typeof BossVulnerable)[keyof typeof BossVulnerable];

/** Result of {@link BossSystem.damagePart}. */
export const BossHit = {
  /** Nothing to hit (no boss in play, the part is gone): the shot flies on. */
  None: 0,
  /** The part cannot take damage right now: the shot dies with a clink. */
  Clink: 1,
  /** Damaged and still standing. */
  Damaged: 2,
  /** Destroyed by this hit. */
  Destroyed: 3,
} as const;

/** A {@link BossHit} code. */
export type BossHit = (typeof BossHit)[keyof typeof BossHit];

/** How the boss moves during the fight ({@link Boss.motion}). */
export const BossMotion = {
  /** Stays where it is (on screen: it rides the camera). */
  Hold: 0,
  /** Follows the nearest player's height ({@link BossScriptApi.track}). */
  Track: 1,
  /** Eases to a view point ({@link BossScriptApi.moveTo}), then holds. */
  MoveTo: 2,
} as const;

/** A {@link BossMotion} code. */
export type BossMotion = (typeof BossMotion)[keyof typeof BossMotion];

/**
 * One part of the World's boss (a pooled class: its numeric fields stay unboxed). Satisfies
 * `core/bullets` `LaserSource`, so lasers can stay attached to it.
 */
export class BossPart {
  /** Index in {@link Boss.parts}. */
  readonly index: number;
  /** Hit / grid / laser-source id: {@link BOSS_PART_ID_BASE} + index. */
  readonly slot: number;
  /** Whether the current boss has this part (index < its part count). */
  active = false;
  /** Name from the boss data (set on activation; tools only). */
  name = '';
  /** Index of the parent part, -1 = the boss's origin. */
  parent = -1;
  /** X offset from the parent (a behaviour may change it — {@link BossScriptApi.setPartOffset}). */
  localX = 0;
  /** Y offset from the parent. */
  localY = 0;
  /** World x of the part's centre (phase 5). */
  x = 0;
  /** World y of the part's centre. */
  y = 0;
  /** Whether it has a hurtbox (else it is never hit or touched). */
  hurtbox = false;
  /** Hurtbox half width. */
  hw = 0;
  /** Hurtbox half height. */
  hh = 0;
  /** Remaining hit points. */
  hp = 0;
  /** Hit points at full strength. */
  maxHp = 0;
  /** {@link BossVulnerable} code. */
  vulnerable = 0;
  /** Bit mask of the parts that must be destroyed first (`AfterParts`). */
  requires = 0;
  /** A core: the boss dies when every core is destroyed. */
  core = false;
  /** A gun (the generic boss behaviours fire from it). */
  gun = false;
  /** Destroyed. */
  destroyed = false;
  /** Open (`WhenOpen` parts take damage only then). */
  open = false;
  /** Sprite id (-1 = not drawn). */
  spriteId = -1;
  /** Animation frames. */
  animFrames = 1;
  /** Ticks per animation frame. */
  animTicks = 1;
  /** Current animation frame. */
  frame = 0;
  /** Remaining hit-flash ticks. */
  flashTicks = 0;
  /** Points for destroying it. */
  score = 0;
  /** Explosion size (index into `ENEMY_EXPLOSIONS`). */
  explosion = 0;
  /** In the grid this tick: may be hit and touched (refreshed in phase 6). */
  target = false;
  /** A hit would clink this tick (refreshed in phase 6 with {@link BossPart.target}). */
  armoured = false;

  /**
   * Creates an unused part slot (the boss system builds all {@link MAX_BOSS_PARTS} at load).
   *
   * @param index - Its index.
   */
  constructor(index: number) {
    this.index = index;
    this.slot = BOSS_PART_ID_BASE + index;
  }
}

/** The World's boss slot (a class: numeric fields unboxed; see the module docs). */
export class Boss implements ScriptHolder {
  /** {@link BossState} code. */
  state: number = BossState.None;
  /** `ContentDb.enemies` index of the boss's entry (-1 = none). */
  specIndex = -1;
  /** World x of the boss's origin (phase 5: camera + {@link Boss.screenX}). */
  x = 0;
  /** World y of the origin. */
  y = 0;
  /** Playfield x of the origin (the boss rides the camera: this is what moves it). */
  screenX = 0;
  /** Playfield y of the origin. */
  screenY = 0;
  /** Playfield x its intro ends at. */
  homeX = 0;
  /** Playfield y its intro ends at. */
  homeY = 0;
  /** Playfield x its intro starts at (just past the right edge). */
  startX = 0;
  /** Length of its intro in ticks. */
  introTicks = 0;
  /** Ticks since the current state began (simulated ticks). */
  stateTicks = 0;
  /** Current phase index. */
  phase = 0;
  /** Ticks since the current phase began. */
  phaseTicks = 0;
  /** The current phase's coroutine, or `null`. */
  script: Script | null = null;
  /** Tick the script wakes on. */
  wakeTick = 0;
  /** {@link BossMotion} code. */
  motion = 0;
  /** Tracking speed in px/tick. */
  trackSpeed = 0;
  /** Highest playfield row the tracking may take the origin to. */
  trackMin = 0;
  /** Lowest playfield row. */
  trackMax = 0;
  /** Move-to start x (playfield). */
  moveFromX = 0;
  /** Move-to start y. */
  moveFromY = 0;
  /** Move-to target x. */
  moveToX = 0;
  /** Move-to target y. */
  moveToY = 0;
  /** Move-to length in ticks. */
  moveTicks = 0;
  /** Move-to ticks done. */
  moveElapsed = 0;
  /** Bit mask of the destroyed parts. */
  destroyedMask = 0;
  /** Bit mask of the core parts. */
  coreMask = 0;
  /** Player slot that destroyed the last core (-1 = nobody / not yet). */
  killer = -1;
  /** The final blast went off: the parts are not drawn any more. */
  blasted = false;
  /** Parts of the current boss. */
  partCount = 0;
  /** Every part slot ({@link MAX_BOSS_PARTS}); `[0, partCount)` are in use. */
  readonly parts: readonly BossPart[];

  /** Builds the part slots (load time). */
  constructor() {
    const parts: BossPart[] = [];
    for (let i = 0; i < MAX_BOSS_PARTS; i++) parts.push(new BossPart(i));
    this.parts = parts;
  }
}

/** The WARNING's live state (the World's `view.warning`). */
export class WarningState implements WarningView {
  /** See {@link WarningView.active}. */
  active = false;
  /** See {@link WarningView.ticks}. */
  ticks = 0;
  /** See {@link WarningView.duration}. */
  readonly duration = WARNING_TICKS;
  /** See {@link WarningView.text}. */
  text = '';
}

/**
 * What a boss behaviour can use — one reused object (decision D29).
 *
 * @remarks
 * Part indices are positions in the boss's `parts` list (look a name up once when the script
 * starts — {@link BossScriptApi.partIndex}). The fire primitives fire from the part's centre
 * through `core/patterns` (rank-scaled speeds; `AIM_AT_TARGET` — the default of every optional
 * angle — aims at the nearest living player) and do nothing while
 * {@link BossScriptApi.canFire} is `false` for that part (-1 / 0 fired). Positions are playfield
 * pixels (the boss rides the camera).
 */
export interface BossScriptApi {
  /** The boss. */
  readonly self: Boss;
  /** The current tick. */
  readonly tick: number;
  /** The gameplay RNG stream. */
  readonly rng: Rng;
  /** The current phase index. */
  readonly phase: number;
  /** Parts of the boss. */
  readonly partCount: number;
  /** The World's bullet system (raw access). */
  readonly bullets: BulletSystem;
  /**
   * The nearest living player ship.
   *
   * @returns The ship, or `null`.
   */
  target(): PlayerShip | null;
  /**
   * The index of a part by name (script start only — it compares strings).
   *
   * @param name - Part name.
   * @returns The index, or -1.
   */
  partIndex(name: string): number;
  /**
   * Whether a part is destroyed (a bad index counts as destroyed).
   *
   * @param index - Part index.
   * @returns `true` when destroyed.
   */
  isDestroyed(index: number): boolean;
  /**
   * Opens or closes a part (`whenOpen` parts take damage only while open).
   *
   * @param index - Part index.
   * @param open - Open?
   */
  setOpen(index: number, open: boolean): void;
  /**
   * Opens or closes every `whenOpen` part of the boss.
   *
   * @param open - Open?
   */
  setOpenAll(open: boolean): void;
  /**
   * Moves a part relative to its parent (translation only).
   *
   * @param index - Part index.
   * @param localX - X offset from the parent.
   * @param localY - Y offset.
   */
  setPartOffset(index: number, localX: number, localY: number): void;
  /** Stops the boss's own motion (it still rides the camera). */
  hold(): void;
  /**
   * Follows the nearest living player's height at up to `speed` px/tick, keeping the origin
   * between the playfield rows `minY` and `maxY`.
   *
   * @param speed - Pixels per tick (≤ 0 = hold).
   * @param minY - Highest row.
   * @param maxY - Lowest row.
   */
  track(speed: number, minY: number, maxY: number): void;
  /**
   * Eases the origin to a playfield point over `ticks` ticks (in-out), then holds.
   *
   * @param screenX - Target x.
   * @param screenY - Target y.
   * @param ticks - Duration (≤ 0 = at once).
   */
  moveTo(screenX: number, screenY: number, ticks: number): void;
  /**
   * Whether a part may fire now: the boss fights (not in its intro or death) and the part is in
   * play (not destroyed).
   *
   * @param index - Part index.
   * @returns `true` when it may fire.
   */
  canFire(index: number): boolean;
  /**
   * A fire interval scaled by the rank's fire rate (`core/patterns` `rankedWait`).
   *
   * @param ticks - The interval on Normal.
   * @returns Ticks (≥ 1).
   */
  fireWait(ticks: number): number;
  /**
   * One bullet from a part at the nearest player (`fireAimed`).
   *
   * @param index - Part index.
   * @param speed - Speed on Normal.
   * @param kind - `BulletKind`.
   * @returns The bullet slot, or -1.
   */
  aimed(index: number, speed: number, kind: number): number;
  /**
   * An N-way spread from a part (`fireNWay`).
   *
   * @param index - Part index.
   * @param count - Bullets.
   * @param step - Units between neighbours.
   * @param speed - Speed on Normal.
   * @param kind - `BulletKind`.
   * @param angle - Centre (default `AIM_AT_TARGET`).
   * @returns Bullets fired.
   */
  nWay(
    index: number,
    count: number,
    step: number,
    speed: number,
    kind: number,
    angle?: number,
  ): number;
  /**
   * A ring from a part (`fireRing`).
   *
   * @param index - Part index.
   * @param count - Bullets.
   * @param speed - Speed on Normal.
   * @param kind - `BulletKind`.
   * @param offset - First heading (default 0).
   * @returns Bullets fired.
   */
  ring(index: number, count: number, speed: number, kind: number, offset?: number): number;
  /**
   * A random spray from a part (`fireSpray`, gameplay RNG).
   *
   * @param index - Part index.
   * @param count - Bullets.
   * @param spread - Cone width in binary units.
   * @param minSpeed - Slowest speed on Normal.
   * @param maxSpeed - Fastest speed on Normal.
   * @param kind - `BulletKind`.
   * @param angle - Cone centre (default `AIM_AT_TARGET`).
   * @returns Bullets fired.
   */
  spray(
    index: number,
    count: number,
    spread: number,
    minSpeed: number,
    maxSpeed: number,
    kind: number,
    angle?: number,
  ): number;
  /**
   * A straight, telegraphed laser from a part (`core/bullets`): warning line, grow, full-width
   * beam (the only phase with a hitbox), fade. Attached, it follows the part and is cancelled
   * (or fades) when the part is destroyed; detached, it stays where it was fired (its lane).
   *
   * @param index - Part index.
   * @param angle - Direction (default `AIM_AT_TARGET`).
   * @param length - Length in pixels (default 384).
   * @param width - Width (default `LASER_WIDTH`).
   * @param telegraph - Warning ticks (default `LASER_TELEGRAPH_TICKS`).
   * @param grow - Grow ticks (default `LASER_GROW_TICKS`).
   * @param active - Hitbox ticks (default `LASER_ACTIVE_TICKS`).
   * @param fade - Fade ticks (default `LASER_FADE_TICKS`).
   * @param attach - Follow the part (default `true`).
   * @returns The laser slot, or -1.
   */
  laser(
    index: number,
    angle?: number,
    length?: number,
    width?: number,
    telegraph?: number,
    grow?: number,
    active?: number,
    fade?: number,
    attach?: boolean,
  ): number;
}

/** A boss behaviour as the boss system uses it (`core/behaviors` provides the roster). */
export interface BossBehavior {
  /** Script id (a boss phase's `script`). */
  readonly id: string;
  /** Tunables with their defaults; a phase's `params` override them by name. */
  readonly params: Readonly<Record<string, number>>;
  /**
   * Creates the coroutine of one phase (called when the phase starts; the body runs from its
   * first wake).
   *
   * @param api - The boss's script API.
   * @param params - The defaults merged with the phase's `params`.
   * @returns The coroutine.
   */
  create(api: BossScriptApi, params: Readonly<Record<string, number>>): Script;
}

/** Looks boss behaviours up by script id (load time only). */
export interface BossBehaviorLookup {
  /**
   * Finds a behaviour.
   *
   * @param id - Script id.
   * @returns The behaviour, or `undefined`.
   */
  get(id: string): BossBehavior | undefined;
}

/** A lookup that knows no behaviour (bosses then run no script — tests, tools). */
export const EMPTY_BOSS_BEHAVIORS: BossBehaviorLookup = Object.freeze({
  /**
   * Finds nothing.
   *
   * @returns `undefined`.
   */
  get(): BossBehavior | undefined {
    return undefined;
  },
});

/** What the boss system needs from its World (the World implements it). */
export interface BossHost {
  /** The tick being run. */
  readonly tick: number;
  /** The camera (the boss rides it; the view edges place the intro). */
  readonly camera: PlayerCamera;
  /** The player ships (targets, contact). */
  readonly players: readonly PlayerShip[];
  /** The ship spec (hurt radius for contact). */
  readonly ship: PlayerShipSpec;
  /** The content (the bosses' entries). */
  readonly content: ContentDb;
  /** The RNG streams (scripts: gameplay; the death chain: cosmetic). */
  readonly rng: RngStreams;
  /** Presentation events. */
  readonly events: EventQueue;
  /** Debug switches (god mode for contact). */
  readonly debugFlags: DebugFlags;
  /** The enemy bullets and lasers (fire primitives, cancel on death). */
  readonly bullets: BulletSystem;
  /** Effect timers (flash, shake). */
  readonly fx: FxState;
  /** Remaining hit-stop ticks (the final blast raises it). */
  hitStop: number;
  /** The session status (`bossWarning` during the WARNING, `stageClear` after the death). */
  status: WorldStatus;
  /** The stage runner (brake / unlock, music ids), or `null` in free flight. */
  readonly stage: {
    /** The stage (its boss and stage music). */
    readonly stage: StageSpec;
    /**
     * Brakes to a scroll lock.
     *
     * @param ticks - Deceleration ticks.
     */
    brake(ticks: number): void;
    /** Releases the lock. */
    unlock(): void;
  } | null;
  /** The scores (part and boss points). */
  readonly scoring: {
    /** The board. */
    readonly board: ScoreBoard;
  };
}

/** The boss system of one World (see the module docs for its part of each tick phase). */
export interface BossSystem {
  /** The World's boss slot. */
  readonly boss: Boss;
  /** The parts' sprite batch (`LayerId.AirEnemies`, {@link MAX_BOSS_PARTS} sprites). */
  readonly batch: SpriteBatch;
  /** The WARNING (the World's `view.warning`). */
  readonly warning: WarningState;
  /** Whether a boss sequence runs (WARNING, intro, fight or death sequence). */
  readonly active: boolean;
  /**
   * Whether an enemy entry is a boss.
   *
   * @param enemyIndex - `ContentDb.enemies` index.
   * @returns `true` for an entry with a `boss` section.
   */
  isBoss(enemyIndex: number): boolean;
  /**
   * A boss's WARNING text (built at creation).
   *
   * @param enemyIndex - `ContentDb.enemies` index.
   * @returns The text, `''` for a regular enemy or a bad index.
   */
  warningText(enemyIndex: number): string;
  /**
   * The stage `warning` event: starts the WARNING of a boss (see the module docs), after which
   * the boss flies in.
   *
   * @remarks
   * Ignored (→ `false`) while another boss sequence runs, and for an index that is not a boss.
   * The status becomes `bossWarning` only from `playing`.
   *
   * @param enemyIndex - `ContentDb.enemies` index of the boss.
   * @returns Whether it started.
   *
   * @example
   * ```ts
   * world.bosses.startWarning(db.enemyIndex.get('test-boss')!); // 180 ticks, then the boss
   * ```
   */
  startWarning(enemyIndex: number): boolean;
  /**
   * The stage `boss` event: the boss flies in at once (no WARNING, no brake), boss music.
   *
   * @param enemyIndex - `ContentDb.enemies` index of the boss.
   * @returns Whether it started (see {@link BossSystem.startWarning}).
   */
  startBoss(enemyIndex: number): boolean;
  /**
   * Phase 3 (before the stage runner): advances the state timers — the WARNING (siren pulses,
   * then the boss enters), the intro (then the fight), the phase clock, the death sequence
   * (chain, blast, tally, stage clear). Never allocates.
   */
  update(): void;
  /** Phase 4: resumes the current phase's script when it wakes (fight only). */
  runScript(): void;
  /**
   * Phase 5: the intro fly-in or the fight motion (tracking, move-to), the camera ride, the part
   * transforms (parents first), animation frames and hit flash. Never allocates.
   */
  move(): void;
  /**
   * Phase 6, between `grid.begin` and `grid.build`: refreshes each part's
   * {@link BossPart.target} / {@link BossPart.armoured} and inserts the targets' hurtboxes with
   * their ids ({@link BOSS_PART_ID_BASE} + index). Parts are targets during the intro and the
   * fight while they have a hurtbox and are not destroyed.
   *
   * @param grid - The World's grid.
   */
  insertColliders(grid: SpatialGrid): void;
  /**
   * Phase 6: the ships' hurt circles against the target parts' hurtboxes (closed) →
   * `playerHit(Contact)`, at most one accepted hit per ship and tick.
   */
  collidePlayers(): void;
  /**
   * Phase 7 (the player shots, `core/weapons`): a hit on part `index`.
   *
   * @remarks
   * {@link BossHit.None} when no boss is in its intro or fight or the part is not in play (the
   * shot flies on); {@link BossHit.Clink} during the intro and for a part that cannot take damage
   * now (armour, `afterParts` with parts of its `requires` left, `whenOpen` while closed — the
   * caller answers with the clink); otherwise the part loses `amount` hit points and flashes —
   * {@link BossHit.Damaged} (`SFX EnemyHit`), or at 0 {@link BossHit.Destroyed}: it explodes, its
   * `score` goes to `by`, its children are destroyed with it, lasers attached to them stop; the
   * last core starts the death sequence.
   *
   * @param index - Part index.
   * @param amount - Damage.
   * @param by - Player slot credited (-1 = nobody).
   * @returns A {@link BossHit} code.
   */
  damagePart(index: number, amount: number, by: number): number;
  /**
   * Whether a hit on a part would clink right now (live — {@link BossPart.armoured} is the
   * phase-6 snapshot).
   *
   * @param index - Part index.
   * @returns `true` during the intro and for a part that cannot take damage now.
   */
  isArmoured(index: number): boolean;
  /**
   * Phase 7, after the shots' hits: ends the current phase while its condition is met (several
   * in one tick if the next ones are met too); the new phase's script starts next tick.
   */
  resolve(): void;
  /**
   * Destroys every core at once (debug tools, tests): the death sequence starts.
   *
   * @param by - Player slot credited (default -1 = nobody).
   * @returns `true` when a boss in its intro or fight was defeated.
   */
  defeat(by?: number): boolean;
  /**
   * Session clear (a checkpoint restart): removes the boss and the WARNING, gives the status
   * `bossWarning` back as `playing` and restores the stage theme when the boss had changed the
   * music.
   */
  clear(): void;
  /** Phase 9: refills the parts' sprite batch. Never allocates. */
  sync(): void;
}

/** A boss entry compiled at world creation (the per-tick code reads only these numbers). */
class CompiledBoss {
  /** `ContentDb.enemies` index. */
  readonly specIndex: number;
  /** The boss section. */
  readonly spec: BossSpec;
  /** Home x (playfield). */
  readonly homeX: number;
  /** Home y. */
  readonly homeY: number;
  /** Intro start x (playfield). */
  readonly startX: number;
  /** Bit mask of the cores. */
  readonly coreMask: number;
  /** The WARNING text. */
  readonly warningText: string;
  /** Phase behaviours (`null` = unknown: no script). */
  readonly behaviors: ReadonlyArray<BossBehavior | null>;
  /** Resolved phase tunables. */
  readonly params: ReadonlyArray<Readonly<Record<string, number>>>;
  /** Phase ends when the cores' total hp falls below this (0 = no such condition). */
  readonly untilHp: Float64Array;
  /** Phase ends when `untilCount` of these parts are destroyed (mask 0 = no such condition). */
  readonly untilMask: Uint32Array;
  /** How many of `untilMask`. */
  readonly untilCount: Int32Array;
  /** Phase ends after this many ticks (0 = no such condition). */
  readonly untilTicks: Float64Array;

  /**
   * Compiles one boss entry (load time).
   *
   * @param specIndex - `ContentDb.enemies` index.
   * @param spec - Its boss section.
   * @param behaviors - Boss behaviour lookup.
   */
  constructor(specIndex: number, spec: BossSpec, behaviors: BossBehaviorLookup) {
    this.specIndex = specIndex;
    this.spec = spec;
    this.homeX = spec.x;
    this.homeY = spec.y;
    // Absolute offsets (parents first) → the leftmost pixel, so the intro starts off screen.
    const offX: number[] = [];
    let left = 0;
    let cores = 0;
    for (let i = 0; i < spec.parts.length; i++) {
      const part = spec.parts[i];
      const ox = (part.parentIndex >= 0 ? offX[part.parentIndex] : 0) + part.x;
      offX.push(ox);
      const edge = ox - (part.hurtbox === null ? 8 : part.hurtbox.hw);
      if (edge < left) left = edge;
      if (part.core) cores |= 1 << i;
    }
    this.startX = PLAYFIELD_W + BOSS_ENTRY_MARGIN - left;
    this.coreMask = cores >>> 0;
    this.warningText = formatWarningText(spec.displayName, spec.code);
    const phases: readonly BossPhaseSpec[] = spec.phases;
    const n = phases.length;
    const defs: Array<BossBehavior | null> = [];
    const params: Array<Readonly<Record<string, number>>> = [];
    this.untilHp = new Float64Array(n);
    this.untilMask = new Uint32Array(n);
    this.untilCount = new Int32Array(n);
    this.untilTicks = new Float64Array(n);
    for (let p = 0; p < n; p++) {
      const phase = phases[p];
      const def = behaviors.get(phase.script) ?? null;
      defs.push(def);
      params.push(def === null ? Object.freeze({}) : resolveParams(def.params, phase.params));
      const until = phase.until;
      if (until === null) continue;
      this.untilHp[p] = until.hpBelow ?? 0;
      this.untilMask[p] = until.partsMask;
      const listed = until.partsDestroyed === undefined ? 0 : until.partsDestroyed.length;
      this.untilCount[p] = until.count ?? listed;
      this.untilTicks[p] = until.ticks ?? 0;
    }
    this.behaviors = defs;
    this.params = params;
  }
}

/**
 * Merges a phase's `params` over a behaviour's defaults (keys and order from the defaults).
 *
 * @param defaults - The behaviour's defaults.
 * @param given - The phase's `params`.
 * @returns A frozen object.
 */
function resolveParams(
  defaults: Readonly<Record<string, number>>,
  given: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(defaults)) {
    out[key] = Object.prototype.hasOwnProperty.call(given, key) ? given[key] : defaults[key];
  }
  return Object.freeze(out);
}

/** Sound of each explosion size (index = `ENEMY_EXPLOSIONS` position). */
const EXPLOSION_SFX = [
  SFX_CUES.EnemyExplodeSmall,
  SFX_CUES.EnemyExplodeMedium,
  SFX_CUES.EnemyExplodeLarge,
];

/** Particle cue of each explosion size. */
const EXPLOSION_FX = [FX_CUES.ExplosionSmall, FX_CUES.ExplosionMedium, FX_CUES.ExplosionLarge];

/** Ends of the chain explosions around a part without a hurtbox, in pixels. */
const CHAIN_SPREAD = 8;

/** The {@link BossScriptApi} (one per system, reused by every phase of every boss). */
class BossScriptApiImpl implements BossScriptApi {
  /** See {@link BossScriptApi.self}. */
  readonly self: Boss;
  /** The system. */
  private readonly system: BossSystemImpl;

  /**
   * Creates the API (load time).
   *
   * @param self - The boss slot.
   * @param system - The system.
   */
  constructor(self: Boss, system: BossSystemImpl) {
    this.self = self;
    this.system = system;
  }

  /** See {@link BossScriptApi.tick}. */
  get tick(): number {
    return this.system.host.tick;
  }

  /** See {@link BossScriptApi.rng}. */
  get rng(): Rng {
    return this.system.host.rng.gameplay;
  }

  /** See {@link BossScriptApi.phase}. */
  get phase(): number {
    return this.self.phase;
  }

  /** See {@link BossScriptApi.partCount}. */
  get partCount(): number {
    return this.self.partCount;
  }

  /** See {@link BossScriptApi.bullets}. */
  get bullets(): BulletSystem {
    return this.system.host.bullets;
  }

  /** See {@link BossScriptApi.target}. */
  target(): PlayerShip | null {
    return this.system.nearestPlayer();
  }

  /** See {@link BossScriptApi.partIndex}. */
  partIndex(name: string): number {
    const self = this.self;
    for (let i = 0; i < self.partCount; i++) if (self.parts[i].name === name) return i;
    return -1;
  }

  /**
   * The part at an index when it belongs to the current boss.
   *
   * @param index - Part index.
   * @returns The part, or `null`.
   */
  private part(index: number): BossPart | null {
    const self = this.self;
    return index >= 0 && index < self.partCount && index % 1 === 0 ? self.parts[index] : null;
  }

  /** See {@link BossScriptApi.isDestroyed}. */
  isDestroyed(index: number): boolean {
    const part = this.part(index);
    return part === null || part.destroyed;
  }

  /** See {@link BossScriptApi.setOpen}. */
  setOpen(index: number, open: boolean): void {
    const part = this.part(index);
    if (part !== null) part.open = open;
  }

  /** See {@link BossScriptApi.setOpenAll}. */
  setOpenAll(open: boolean): void {
    const self = this.self;
    for (let i = 0; i < self.partCount; i++) {
      const part = self.parts[i];
      if (part.vulnerable === BossVulnerable.WhenOpen) part.open = open;
    }
  }

  /** See {@link BossScriptApi.setPartOffset}. */
  setPartOffset(index: number, localX: number, localY: number): void {
    const part = this.part(index);
    if (part === null) return;
    part.localX = localX;
    part.localY = localY;
  }

  /** See {@link BossScriptApi.hold}. */
  hold(): void {
    this.self.motion = BossMotion.Hold;
  }

  /** See {@link BossScriptApi.track}. */
  track(speed: number, minY: number, maxY: number): void {
    const self = this.self;
    if (!(speed > 0)) {
      self.motion = BossMotion.Hold;
      return;
    }
    self.motion = BossMotion.Track;
    self.trackSpeed = speed;
    self.trackMin = minY < maxY ? minY : maxY;
    self.trackMax = minY < maxY ? maxY : minY;
  }

  /** See {@link BossScriptApi.moveTo}. */
  moveTo(screenX: number, screenY: number, ticks: number): void {
    const self = this.self;
    if (!(ticks >= 1)) {
      self.screenX = screenX;
      self.screenY = screenY;
      self.motion = BossMotion.Hold;
      return;
    }
    self.motion = BossMotion.MoveTo;
    self.moveFromX = self.screenX;
    self.moveFromY = self.screenY;
    self.moveToX = screenX;
    self.moveToY = screenY;
    self.moveTicks = Math.floor(ticks);
    self.moveElapsed = 0;
  }

  /** See {@link BossScriptApi.canFire}. */
  canFire(index: number): boolean {
    const part = this.part(index);
    return part !== null && !part.destroyed && this.self.state === BossState.Fight;
  }

  /**
   * The shared fire origin set to a part's centre (or `null` when it may not fire).
   *
   * @param index - Part index.
   * @returns The origin, or `null`.
   */
  private gun(index: number): BulletOrigin | null {
    if (!this.canFire(index)) return null;
    const part = this.self.parts[index];
    const origin = this.system.origin;
    origin.x = part.x;
    origin.y = part.y;
    return origin;
  }

  /** See {@link BossScriptApi.fireWait}. */
  fireWait(ticks: number): number {
    return rankedWait(this.system.host.bullets, ticks);
  }

  /** See {@link BossScriptApi.aimed}. */
  aimed(index: number, speed: number, kind: number): number {
    const gun = this.gun(index);
    return gun === null ? -1 : fireAimed(this.system.host.bullets, gun, speed, kind);
  }

  /** See {@link BossScriptApi.nWay}. */
  nWay(
    index: number,
    count: number,
    step: number,
    speed: number,
    kind: number,
    angle = AIM_AT_TARGET,
  ): number {
    const gun = this.gun(index);
    return gun === null
      ? 0
      : fireNWay(this.system.host.bullets, gun, count, step, speed, kind, angle);
  }

  /** See {@link BossScriptApi.ring}. */
  ring(index: number, count: number, speed: number, kind: number, offset = 0): number {
    const gun = this.gun(index);
    return gun === null ? 0 : fireRing(this.system.host.bullets, gun, count, speed, kind, offset);
  }

  /** See {@link BossScriptApi.spray}. */
  spray(
    index: number,
    count: number,
    spread: number,
    minSpeed: number,
    maxSpeed: number,
    kind: number,
    angle = AIM_AT_TARGET,
  ): number {
    const gun = this.gun(index);
    const host = this.system.host;
    return gun === null
      ? 0
      : fireSpray(
          host.bullets,
          gun,
          host.rng.gameplay,
          count,
          spread,
          minSpeed,
          maxSpeed,
          kind,
          angle,
        );
  }

  /** See {@link BossScriptApi.laser}. */
  laser(
    index: number,
    angle = AIM_AT_TARGET,
    length = PLAYFIELD_W,
    width = LASER_WIDTH,
    telegraph = LASER_TELEGRAPH_TICKS,
    grow = LASER_GROW_TICKS,
    active = LASER_ACTIVE_TICKS,
    fade = LASER_FADE_TICKS,
    attach = true,
  ): number {
    const gun = this.gun(index);
    return gun === null
      ? -1
      : this.system.host.bullets.fireLaser(
          gun,
          angle,
          length,
          width,
          telegraph,
          grow,
          active,
          fade,
          attach ? this.self.parts[index].slot : -1,
        );
  }
}

/** The boss system (a class: one set of monomorphic methods for every World). */
class BossSystemImpl implements BossSystem {
  /** See {@link BossSystem.boss}. */
  readonly boss: Boss;
  /** See {@link BossSystem.batch}. */
  readonly batch: SpriteBatch;
  /** See {@link BossSystem.warning}. */
  readonly warning: WarningState;
  /** The World. */
  readonly host: BossHost;
  /** The fire origin the script API shares. */
  readonly origin = new BulletOrigin();
  /** Compiled boss entries by `ContentDb.enemies` index (`null` for regular enemies). */
  private readonly compiled: ReadonlyArray<CompiledBoss | null>;
  /** The script API. */
  private readonly api: BossScriptApiImpl;
  /** The compiled entry of the running boss (`null` when none). */
  private current: CompiledBoss | null = null;
  /** Whether the running sequence changed the music (a clear then restores the stage theme). */
  private musicChanged = false;

  /**
   * Builds the boss slot, the API, the batch and the compiled bosses (see
   * {@link createBossSystem}).
   *
   * @param host - The World.
   * @param behaviors - Boss behaviour lookup.
   */
  constructor(host: BossHost, behaviors: BossBehaviorLookup) {
    this.host = host;
    this.boss = new Boss();
    this.batch = createSpriteBatch(LayerId.AirEnemies, MAX_BOSS_PARTS);
    this.warning = new WarningState();
    this.api = new BossScriptApiImpl(this.boss, this);
    const specs = host.content.enemies;
    const compiled: Array<CompiledBoss | null> = [];
    for (let i = 0; i < specs.length; i++) {
      const boss = specs[i].boss;
      compiled.push(boss === null ? null : new CompiledBoss(i, boss, behaviors));
    }
    this.compiled = compiled;
  }

  /** See {@link BossSystem.active}. */
  get active(): boolean {
    const state = this.boss.state;
    return state !== BossState.None && state !== BossState.Dead;
  }

  /**
   * The compiled entry of an enemy index.
   *
   * @param enemyIndex - `ContentDb.enemies` index.
   * @returns The compiled boss, or `null`.
   */
  private entry(enemyIndex: number): CompiledBoss | null {
    const compiled = this.compiled;
    return enemyIndex >= 0 && enemyIndex < compiled.length && enemyIndex % 1 === 0
      ? compiled[enemyIndex]
      : null;
  }

  /** See {@link BossSystem.isBoss}. */
  isBoss(enemyIndex: number): boolean {
    return this.entry(enemyIndex) !== null;
  }

  /** See {@link BossSystem.warningText}. */
  warningText(enemyIndex: number): string {
    const entry = this.entry(enemyIndex);
    return entry === null ? '' : entry.warningText;
  }

  /**
   * The nearest living player to the boss's origin.
   *
   * @returns The ship, or `null`.
   */
  nearestPlayer(): PlayerShip | null {
    const boss = this.boss;
    const x = boss.x;
    const y = boss.y;
    const players = this.host.players;
    let best: PlayerShip | null = null;
    let bestDistance = 0;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.active || p.state !== 'alive') continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (best === null || d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    return best;
  }

  /**
   * The boss music of the running stage (`MUSIC Boss` in free flight).
   *
   * @returns A music cue id.
   */
  private bossMusic(): number {
    const stage = this.host.stage;
    const id = stage === null ? -1 : stage.stage.music.bossId;
    return id >= 0 ? id : MUSIC_CUES.Boss;
  }

  /** See {@link BossSystem.startWarning}. */
  startWarning(enemyIndex: number): boolean {
    const entry = this.entry(enemyIndex);
    if (entry === null || this.active) return false;
    const host = this.host;
    const boss = this.boss;
    this.current = entry;
    boss.specIndex = enemyIndex;
    boss.state = BossState.Warning;
    boss.stateTicks = 0;
    const warning = this.warning;
    warning.active = true;
    warning.ticks = 0;
    warning.text = entry.warningText;
    if (host.status === 'playing') host.status = 'bossWarning';
    const stage = host.stage;
    if (stage !== null) stage.brake(WARNING_BRAKE_TICKS);
    const events = host.events;
    events.push(SimEventKind.Music, MUSIC_CUES.Silence, 0, 0, WARNING_MUSIC_FADE_TICKS);
    events.push(SimEventKind.Dim, WARNING_DIM_PERCENT, 0, 0, WARNING_TICKS);
    this.musicChanged = true;
    this.pulse();
    return true;
  }

  /** See {@link BossSystem.startBoss}. */
  startBoss(enemyIndex: number): boolean {
    const entry = this.entry(enemyIndex);
    if (entry === null || this.active) return false;
    this.current = entry;
    this.boss.specIndex = enemyIndex;
    this.enter();
    return true;
  }

  /** One wail of the WARNING: the siren (critical) and a flash. */
  private pulse(): void {
    const host = this.host;
    const camera = host.camera;
    host.events.push(
      SimEventKind.Sfx,
      SFX_CUES.WarningSiren,
      Math.floor(camera.x + PLAYFIELD_W / 2) | 0,
      Math.floor(camera.y) | 0,
      SfxPriority.Critical,
    );
    requestFlash(host, FlashKind.Warning);
  }

  /** The boss flies in: parts from its entry, intro state, boss music (cold path). */
  private enter(): void {
    const entry = this.current;
    if (entry === null) return;
    const host = this.host;
    const boss = this.boss;
    const spec = entry.spec;
    const specs = spec.parts;
    const parts = boss.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const source = i < specs.length ? specs[i] : null;
      part.target = false;
      part.armoured = false;
      part.flashTicks = 0;
      part.frame = 0;
      if (source === null) {
        part.active = false;
        part.destroyed = true;
        part.spriteId = -1;
        continue;
      }
      part.active = true;
      part.name = source.name;
      part.parent = source.parentIndex;
      part.localX = source.x;
      part.localY = source.y;
      part.hurtbox = source.hurtbox !== null;
      part.hw = source.hurtbox === null ? 0 : source.hurtbox.hw;
      part.hh = source.hurtbox === null ? 0 : source.hurtbox.hh;
      part.hp = source.hp;
      part.maxHp = source.hp;
      part.vulnerable = BOSS_VULNERABILITIES.indexOf(source.vulnerable);
      part.requires = source.requiresMask;
      part.core = source.core;
      part.gun = source.gun;
      part.destroyed = false;
      part.open = source.open;
      part.spriteId = source.spriteId;
      part.animFrames = source.anim.frames;
      part.animTicks = source.anim.ticks;
      part.score = source.score;
      part.explosion = ENEMY_EXPLOSIONS.indexOf(source.explosion);
    }
    boss.partCount = specs.length;
    boss.state = BossState.Intro;
    boss.stateTicks = 0;
    boss.phase = 0;
    boss.phaseTicks = 0;
    boss.script = null;
    boss.wakeTick = 0;
    boss.motion = BossMotion.Hold;
    boss.trackSpeed = 0;
    boss.destroyedMask = 0;
    boss.coreMask = entry.coreMask;
    boss.killer = -1;
    boss.blasted = false;
    boss.homeX = entry.homeX;
    boss.homeY = entry.homeY;
    boss.startX = entry.startX;
    boss.introTicks = spec.introTicks;
    boss.screenX = spec.introTicks > 0 ? entry.startX : entry.homeX;
    boss.screenY = entry.homeY;
    this.place();
    this.warning.active = false;
    if (host.status === 'bossWarning') host.status = 'playing';
    host.events.push(SimEventKind.Music, this.bossMusic(), 0, 0, 0);
    this.musicChanged = true;
    if (spec.introTicks <= 0) this.startFight();
  }

  /** The intro is over: the fight and its first phase start (the script runs this tick). */
  private startFight(): void {
    const boss = this.boss;
    boss.state = BossState.Fight;
    boss.stateTicks = 0;
    boss.screenX = boss.homeX;
    boss.screenY = boss.homeY;
    this.startPhase(0, this.host.tick);
  }

  /**
   * Starts a phase: its behaviour replaces the running script.
   *
   * @param phase - Phase index.
   * @param wakeTick - Tick its script first runs on.
   */
  private startPhase(phase: number, wakeTick: number): void {
    const boss = this.boss;
    const entry = this.current;
    boss.phase = phase;
    boss.phaseTicks = 0;
    const def = entry === null ? null : entry.behaviors[phase];
    boss.script = def === null || entry === null ? null : def.create(this.api, entry.params[phase]);
    boss.wakeTick = wakeTick;
  }

  /** See {@link BossSystem.update}. */
  update(): void {
    const boss = this.boss;
    const state = boss.state;
    if (state === BossState.Warning) {
      const ticks = boss.stateTicks + 1;
      boss.stateTicks = ticks;
      this.warning.ticks = ticks;
      if (ticks >= WARNING_TICKS) this.enter();
      else if (ticks % WARNING_PULSE_TICKS === 0) this.pulse();
    } else if (state === BossState.Intro) {
      boss.stateTicks++;
      if (boss.stateTicks >= boss.introTicks) this.startFight();
    } else if (state === BossState.Fight) {
      boss.stateTicks++;
      boss.phaseTicks++;
    } else if (state === BossState.Dying) {
      this.dyingTick();
    }
  }

  /** One tick of the death sequence (cold path: at most once per tick while dying). */
  private dyingTick(): void {
    const boss = this.boss;
    const ticks = boss.stateTicks + 1;
    boss.stateTicks = ticks;
    if (ticks < BOSS_CHAIN_TICKS) {
      if (ticks % BOSS_CHAIN_INTERVAL === 0) this.chainExplosion();
    } else if (ticks === BOSS_CHAIN_TICKS) {
      this.finalBlast();
    }
    if (ticks === BOSS_TALLY_TICKS) this.tally();
    if (ticks >= BOSS_CLEAR_TICKS) this.finish();
  }

  /** One explosion of the death chain at a random point of a random part (cosmetic RNG). */
  private chainExplosion(): void {
    const boss = this.boss;
    const host = this.host;
    const rng = host.rng.cosmetic;
    const part = boss.parts[rng.rangeInt(0, boss.partCount > 0 ? boss.partCount - 1 : 0)];
    const hw = part.hurtbox ? Math.floor(part.hw) : CHAIN_SPREAD;
    const hh = part.hurtbox ? Math.floor(part.hh) : CHAIN_SPREAD;
    const x = (Math.floor(part.x) | 0) + rng.rangeInt(-hw, hw);
    const y = (Math.floor(part.y) | 0) + rng.rangeInt(-hh, hh);
    host.events.push(SimEventKind.Particles, FX_CUES.BossChain, x, y, 1);
    host.events.push(SimEventKind.Sfx, SFX_CUES.BossExplode, x, y, 0);
  }

  /** The final blast: the boss vanishes in a big explosion, flash, shake, rumble, hit-stop. */
  private finalBlast(): void {
    const boss = this.boss;
    const host = this.host;
    boss.blasted = true;
    const x = Math.floor(boss.x) | 0;
    const y = Math.floor(boss.y) | 0;
    const events = host.events;
    events.push(SimEventKind.Particles, FX_CUES.BossBlast, x, y, 1);
    events.push(SimEventKind.Sfx, SFX_CUES.BossExplode, x, y, SfxPriority.High);
    const players = host.players;
    for (let i = 0; i < players.length; i++) {
      if (players[i].active) events.push(SimEventKind.Rumble, i, x, y, 2);
    }
    requestFlash(host, FlashKind.BossBlast);
    requestShake(host, ShakeMagnitude.Large, BOSS_BLAST_SHAKE_TICKS);
    requestHitStop(host, BOSS_BLAST_HIT_STOP_TICKS);
  }

  /** The score tally: the boss's points to its killer, the defeat event, the stage-clear jingle. */
  private tally(): void {
    const boss = this.boss;
    const host = this.host;
    const entry = this.current;
    const points = entry === null || boss.killer < 0 ? 0 : entry.spec.score;
    if (points > 0) addScore(host, boss.killer, points);
    host.events.push(
      SimEventKind.BossDefeated,
      boss.specIndex,
      Math.floor(boss.x) | 0,
      Math.floor(boss.y) | 0,
      points,
    );
    host.events.push(SimEventKind.Music, MUSIC_CUES.StageClear, 0, 0, 0);
  }

  /** The end of the death sequence: the stage is clear, the camera free again. */
  private finish(): void {
    const host = this.host;
    this.boss.state = BossState.Dead;
    if (host.status === 'playing' || host.status === 'bossWarning') host.status = 'stageClear';
    const stage = host.stage;
    if (stage !== null) stage.unlock();
  }

  /** See {@link BossSystem.runScript}. */
  runScript(): void {
    const boss = this.boss;
    if (boss.state !== BossState.Fight || boss.script === null) return;
    const tick = this.host.tick;
    if (boss.wakeTick > tick) return;
    resumeScript(boss, tick);
  }

  /** See {@link BossSystem.move}. */
  move(): void {
    const boss = this.boss;
    const state = boss.state;
    if (state !== BossState.Intro && state !== BossState.Fight && state !== BossState.Dying) {
      return;
    }
    if (state === BossState.Intro) {
      const total = boss.introTicks;
      const u = total > 0 && boss.stateTicks < total ? boss.stateTicks / total : 1;
      const v = 1 - u;
      // `EASINGS.outCubic` written out (no fractional call arguments or results).
      boss.screenX = boss.startX + (boss.homeX - boss.startX) * (1 - v * v * v);
      boss.screenY = boss.homeY;
    } else if (state === BossState.Fight) {
      const motion = boss.motion;
      if (motion === BossMotion.Track) {
        const target = this.nearestPlayer();
        if (target !== null) {
          let goal = target.y - this.host.camera.y;
          if (goal < boss.trackMin) goal = boss.trackMin;
          else if (goal > boss.trackMax) goal = boss.trackMax;
          const d = goal - boss.screenY;
          const speed = boss.trackSpeed;
          boss.screenY += d > speed ? speed : d < -speed ? -speed : d;
        }
      } else if (motion === BossMotion.MoveTo) {
        const elapsed = boss.moveElapsed + 1;
        boss.moveElapsed = elapsed;
        const u = elapsed >= boss.moveTicks ? 1 : elapsed / boss.moveTicks;
        // `EASINGS.inOutQuad` written out.
        const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        boss.screenX = boss.moveFromX + (boss.moveToX - boss.moveFromX) * e;
        boss.screenY = boss.moveFromY + (boss.moveToY - boss.moveFromY) * e;
        if (u >= 1) boss.motion = BossMotion.Hold;
      }
    }
    this.place();
    const parts = boss.parts;
    const tick = this.host.tick;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      if (part.flashTicks > 0) part.flashTicks--;
      const frames = part.animFrames;
      part.frame = frames > 1 ? Math.floor(tick / part.animTicks) % frames : 0;
    }
  }

  /** Puts the origin at the camera + its playfield position and every part after its parent. */
  private place(): void {
    const boss = this.boss;
    const camera = this.host.camera;
    const x = camera.x + boss.screenX;
    const y = camera.y + boss.screenY;
    boss.x = x;
    boss.y = y;
    const parts = boss.parts;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      const parent = part.parent;
      if (parent >= 0) {
        const p = parts[parent];
        part.x = p.x + part.localX;
        part.y = p.y + part.localY;
      } else {
        part.x = x + part.localX;
        part.y = y + part.localY;
      }
    }
  }

  /**
   * Whether a part cannot take damage now (the rules of {@link BossSystem.isArmoured}).
   *
   * @param part - The part.
   * @returns `true` when a hit clinks.
   */
  private armouredNow(part: BossPart): boolean {
    const boss = this.boss;
    if (boss.state === BossState.Intro) return true;
    const vulnerable = part.vulnerable;
    if (vulnerable === BossVulnerable.Always) return false;
    if (vulnerable === BossVulnerable.Never) return true;
    if (vulnerable === BossVulnerable.AfterParts) {
      return (boss.destroyedMask & part.requires) !== part.requires;
    }
    return !part.open;
  }

  /** See {@link BossSystem.isArmoured}. */
  isArmoured(index: number): boolean {
    if (!(index >= 0 && index < MAX_BOSS_PARTS && index % 1 === 0)) return false;
    return this.armouredNow(this.boss.parts[index]);
  }

  /** See {@link BossSystem.insertColliders}. */
  insertColliders(grid: SpatialGrid): void {
    const boss = this.boss;
    const state = boss.state;
    const fighting = state === BossState.Intro || state === BossState.Fight;
    const parts = boss.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const target = fighting && part.active && part.hurtbox && !part.destroyed;
      part.target = target;
      part.armoured = target && this.armouredNow(part);
      if (!target) continue;
      // Whole-pixel bounds (the grid is the broad phase; see `EnemySystem.insertColliders`).
      grid.insert(
        part.slot,
        Math.floor(part.x - part.hw) | 0,
        Math.floor(part.y - part.hh) | 0,
        Math.ceil(part.x + part.hw) | 0,
        Math.ceil(part.y + part.hh) | 0,
      );
    }
  }

  /** See {@link BossSystem.collidePlayers}. */
  collidePlayers(): void {
    const boss = this.boss;
    if (boss.state !== BossState.Intro && boss.state !== BossState.Fight) return;
    const host = this.host;
    const players = host.players;
    const r = host.ship.hurtRadius;
    const parts = boss.parts;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (!ship.active || ship.state !== 'alive') continue;
      const sx = ship.x;
      const sy = ship.y;
      for (let i = 0; i < boss.partCount; i++) {
        const part = parts[i];
        if (!part.target) continue;
        // `circleAabb` inlined (closed: touching counts), no fractional call arguments.
        const ox = Math.abs(sx - part.x) - part.hw;
        const oy = Math.abs(sy - part.y) - part.hh;
        const dx = ox > 0 ? ox : 0;
        const dy = oy > 0 ? oy : 0;
        if (dx * dx + dy * dy <= r * r) {
          if (playerHit(ship, PlayerHitCause.Contact, host.tick, host.debugFlags)) break;
        }
      }
    }
  }

  /** See {@link BossSystem.damagePart}. */
  damagePart(index: number, amount: number, by: number): number {
    if (!(index >= 0 && index < MAX_BOSS_PARTS && index % 1 === 0)) return BossHit.None;
    const boss = this.boss;
    const state = boss.state;
    const part = boss.parts[index];
    if ((state !== BossState.Intro && state !== BossState.Fight) || !part.active) {
      return BossHit.None;
    }
    if (part.destroyed) return BossHit.None;
    if (this.armouredNow(part)) return BossHit.Clink;
    part.hp -= amount;
    part.flashTicks = HIT_FLASH_TICKS;
    if (part.hp > 0) {
      this.host.events.push(
        SimEventKind.Sfx,
        SFX_CUES.EnemyHit,
        Math.floor(part.x) | 0,
        Math.floor(part.y) | 0,
        0,
      );
      return BossHit.Damaged;
    }
    this.destroyPart(index, by);
    return BossHit.Destroyed;
  }

  /**
   * Destroys a part and every part attached below it (cold path), credits their points, then
   * starts the death sequence when no core is left.
   *
   * @param index - The part.
   * @param by - Player slot credited (-1 = nobody).
   */
  private destroyPart(index: number, by: number): void {
    const boss = this.boss;
    const parts = boss.parts;
    let cascade = 0;
    for (let i = index; i < boss.partCount; i++) {
      const part = parts[i];
      if (part.destroyed) continue;
      if (i !== index && (part.parent < 0 || (cascade & (1 << part.parent)) === 0)) continue;
      cascade |= 1 << i;
      this.destroyOne(part, by);
    }
    if ((boss.destroyedMask & boss.coreMask) === boss.coreMask) this.startDeath(by);
  }

  /**
   * One part goes: destroyed, its explosion, its points, its lasers stop.
   *
   * @param part - The part.
   * @param by - Player slot credited.
   */
  private destroyOne(part: BossPart, by: number): void {
    const boss = this.boss;
    const host = this.host;
    part.destroyed = true;
    if (part.hp > 0) part.hp = 0;
    part.target = false;
    part.armoured = false;
    boss.destroyedMask = (boss.destroyedMask | (1 << part.index)) >>> 0;
    const x = Math.floor(part.x) | 0;
    const y = Math.floor(part.y) | 0;
    const size = part.explosion >= 0 && part.explosion < EXPLOSION_SFX.length ? part.explosion : 1;
    host.events.push(SimEventKind.Sfx, EXPLOSION_SFX[size], x, y, 0);
    host.events.push(SimEventKind.Particles, EXPLOSION_FX[size], x, y, 1);
    if (by >= 0 && part.score > 0) {
      addScore(host, by, part.score);
      // The score popup of the part (plan M1-14); whole numbers, like every event push.
      if (part.score >= 1) host.events.push(SimEventKind.Score, by, x, y, part.score | 0);
    }
    host.bullets.detachLasers(part.slot);
  }

  /**
   * The last core is gone: the death sequence starts (cold path).
   *
   * @param by - Player slot credited with the kill.
   */
  private startDeath(by: number): void {
    const boss = this.boss;
    const host = this.host;
    boss.state = BossState.Dying;
    boss.stateTicks = 0;
    boss.killer = by;
    boss.script = null;
    boss.motion = BossMotion.Hold;
    const parts = boss.parts;
    for (let i = 0; i < parts.length; i++) {
      parts[i].target = false;
      host.bullets.detachLasers(parts[i].slot);
    }
    host.bullets.cancelAll(CancelMode.Sparkle);
    host.events.push(SimEventKind.Music, MUSIC_CUES.Silence, 0, 0, BOSS_MUSIC_FADE_TICKS);
    requestShake(host, ShakeMagnitude.Small, BOSS_CHAIN_TICKS);
  }

  /**
   * The cores' total remaining hit points.
   *
   * @returns The sum (destroyed cores count 0).
   */
  private coreHp(): number {
    const boss = this.boss;
    const parts = boss.parts;
    let hp = 0;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      if (part.core && !part.destroyed && part.hp > 0) hp += part.hp;
    }
    return hp;
  }

  /**
   * Whether the current phase's condition is met.
   *
   * @param entry - The running boss's entry.
   * @param phase - The phase.
   * @returns `true` when it ends.
   */
  private phaseOver(entry: CompiledBoss, phase: number): boolean {
    const boss = this.boss;
    const hp = entry.untilHp[phase];
    if (hp > 0 && this.coreHp() < hp) return true;
    const mask = entry.untilMask[phase];
    if (mask !== 0) {
      let hits = (boss.destroyedMask & mask) >>> 0;
      let count = 0;
      while (hits !== 0) {
        hits &= hits - 1;
        count++;
      }
      if (count >= entry.untilCount[phase]) return true;
    }
    const ticks = entry.untilTicks[phase];
    return ticks > 0 && boss.phaseTicks >= ticks;
  }

  /** See {@link BossSystem.resolve}. */
  resolve(): void {
    const boss = this.boss;
    const entry = this.current;
    if (boss.state !== BossState.Fight || entry === null) return;
    const last = entry.behaviors.length - 1;
    while (boss.phase < last && this.phaseOver(entry, boss.phase)) {
      this.startPhase(boss.phase + 1, this.host.tick + 1);
    }
  }

  /** See {@link BossSystem.defeat}. */
  defeat(by = -1): boolean {
    const boss = this.boss;
    if (boss.state !== BossState.Intro && boss.state !== BossState.Fight) return false;
    const parts = boss.parts;
    for (let i = 0; i < boss.partCount; i++) {
      if (boss.state !== BossState.Intro && boss.state !== BossState.Fight) break;
      const part = parts[i];
      if (part.core && !part.destroyed) this.destroyPart(i, by);
    }
    const after: number = boss.state;
    return after === BossState.Dying;
  }

  /** See {@link BossSystem.clear}. */
  clear(): void {
    const boss = this.boss;
    const host = this.host;
    const parts = boss.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.active) host.bullets.detachLasers(part.slot);
      part.active = false;
      part.target = false;
      part.armoured = false;
    }
    boss.state = BossState.None;
    boss.specIndex = -1;
    boss.partCount = 0;
    boss.script = null;
    boss.destroyedMask = 0;
    boss.killer = -1;
    boss.blasted = false;
    this.current = null;
    this.warning.active = false;
    this.batch.count = 0;
    if (host.status === 'bossWarning') host.status = 'playing';
    if (this.musicChanged) {
      this.musicChanged = false;
      const stage = host.stage;
      const theme = stage === null ? -1 : stage.stage.music.stageId;
      if (theme >= 0) host.events.push(SimEventKind.Music, theme, 0, 0, 0);
    }
  }

  /** See {@link BossSystem.sync}. */
  sync(): void {
    const batch = this.batch;
    batch.count = 0;
    const boss = this.boss;
    const state = boss.state;
    if (
      (state !== BossState.Intro && state !== BossState.Fight && state !== BossState.Dying) ||
      boss.blasted
    ) {
      return;
    }
    const blink = state === BossState.Dying && (boss.stateTicks & 4) !== 0;
    const parts = boss.parts;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      if (part.destroyed || part.spriteId < 0) continue;
      const slot = batch.count;
      // `pushSprite` inlined (fractional x / y arguments would be boxed if not inlined).
      batch.x[slot] = part.x;
      batch.y[slot] = part.y;
      batch.spriteId[slot] = part.spriteId;
      batch.frame[slot] = part.frame;
      batch.flags[slot] = part.flashTicks > 0 || blink ? SpriteFlag.Flash : 0;
      batch.count = slot + 1;
    }
  }
}

/**
 * Creates the boss system of a World (load time): the boss slot with its
 * {@link MAX_BOSS_PARTS} parts, the script API, the parts' batch, the WARNING state and every boss
 * entry of the content compiled (its WARNING text built from {@link WARNING_TEMPLATE}).
 *
 * @param host - The World (read at every call — pass the World itself).
 * @param behaviors - Boss behaviour lookup (`core/behaviors` `DEFAULT_BOSS_BEHAVIORS`); a phase
 *   whose script it does not know runs no script (content validation reports it).
 * @returns The system (no boss yet).
 *
 * @example
 * ```ts
 * const bosses = createBossSystem(world, DEFAULT_BOSS_BEHAVIORS);
 * bosses.startBoss(db.enemyIndex.get('test-boss')!);
 * ```
 */
export function createBossSystem(host: BossHost, behaviors: BossBehaviorLookup): BossSystem {
  return new BossSystemImpl(host, behaviors);
}
