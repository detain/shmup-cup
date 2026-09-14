/**
 * # bosses — multi-part bosses, weak points, phases, the WARNING, mid-bosses, raids, multi-bosses
 *
 * **Status: implemented.** The P0 mechanics of plan M1-13 — multi-part bosses with per-part hit
 * points and hurtboxes, weak points (armour, parts that need others destroyed first, parts
 * vulnerable only while open), phase state machines (HP threshold, destroyed-part mask, timer),
 * the WARNING intro and the death sequence — and the Darius-style variety of plan M2-09: turned
 * parts (binary-angle transforms, circle hurtboxes, heading frames), mid-bosses ("captains") that
 * stay until destroyed, battleship raids larger than the screen with boss-relative camera
 * segments, a boss inside a boss, double bosses (alternating, the survivor enrages), boss timers
 * (escape after the limit — an ending flag), the boss HP bar's model and boss-rush stages.
 *
 * **Responsibility.** Up to {@link MAX_BOSSES} boss **slots** per World ({@link BossSystem}, the
 * World's `bosses`; slot 0 is {@link BossSystem.boss}):
 *
 * - **Parts.** A boss (an enemy entry with a `boss` section — `core/data` `BossSpec`) has up to
 *   `MAX_BOSS_PARTS` {@link BossPart}s, each placed from its parent (or the boss's origin), parents
 *   first, every tick. Since M2-09 a part may be **turned**: its world angle is its parent's plus
 *   its own (`angle`, changed by `spin` every tick or by a behaviour), and the offsets of the parts
 *   attached to it are rotated by that angle (the committed sine table — binary angles, 1024 per
 *   turn, clockwise). Boxes never turn: a turned part is hit as a **circle** (`radius`) and may be
 *   drawn from **heading frames** (`turn`). Parts share the enemies' hit path: every slot's
 *   parts take the ids {@link BOSS_PART_ID_BASE} + slot × 16 + index (after the 64 enemy slots) in
 *   the World's grid; the player shots apply their hits through {@link BossSystem.damagePart};
 *   touching a part is contact damage. A destroyed part explodes (score to the shooter), takes
 *   its children with it and is no longer drawn, hit or touched. A behaviour may move a part
 *   (`BossScriptApi.setPartOffset`); since M2-11 every part also keeps its offsets from the boss
 *   data as `restX` / `restY` (set on activation), so a move measured from them never drifts from
 *   one phase to the next (`boss.maw`'s jaws).
 * - **Weak points** ({@link BossVulnerable}): `always`, `afterParts`, `whenOpen`, `never` — a hit
 *   on a part that cannot take damage now (or on any part during the intro) `clink`s.
 * - **Phases.** The boss runs the behaviour of its current phase ({@link BossBehavior}); when the
 *   phase's condition is met the next phase's behaviour replaces the running script.
 * - **The WARNING** (shmup_feat.md §13 / §19, decision D10). A stage `warning` event: the camera
 *   brakes to a scroll lock, status `bossWarning` for {@link WARNING_TICKS} ticks, the music stops,
 *   the playfield dims, the siren wails once a second with a flash; the {@link WarningView} text is
 *   the game's own template ({@link WARNING_TEMPLATE}). Then the boss flies in (its invulnerable
 *   intro) and the boss music starts. A stage `boss` event brings a boss in at once.
 * - **Roles (M2-09).** A **stage boss** ({@link BossRole}.Boss) is one of the World's *main
 *   encounter*: only one runs at a time (a WARNING or `boss` event meanwhile is ignored). A
 *   **captain** ({@link BossRole}.Captain, a mid-boss) takes any free slot, flies in with a `boss`
 *   event, rides the scrolling camera until destroyed — never locks the scroll or changes the
 *   music — and ends with a short death sequence ({@link CAPTAIN_CHAIN_TICKS} …
 *   {@link CAPTAIN_CLEAR_TICKS}) that does not clear the stage.
 * - **Double bosses (M2-09).** A boss with a `partner` brings it in with its intro, in another
 *   slot. With `alternate` the pair takes turns: the resting one withdraws behind the playfield's
 *   right edge ({@link BOSS_REST_X}, over {@link BOSS_TURN_TICKS}) — drawn on the ground-enemy
 *   layer, not hit or touched, its script and phase clock paused. When one of them dies the
 *   survivor **enrages**: it comes forward for good, its fire intervals × `enrage.fireRate`, its
 *   motion × `enrage.speed`, and it may jump to `enrage.phase`.
 * - **Raids (M2-09).** A boss with a `raid` is anchored in the world where it entered instead of
 *   riding the camera (a `boss` event stops the camera at once). When its fight starts the camera
 *   is locked and follows the raid's segments — offsets from the boss's origin, eased in turn
 *   (`core/stage` `StageRunner.follow`); when it dies or escapes the camera eases back to where
 *   the raid began ({@link RAID_RETURN_TICKS} / {@link BOSS_ESCAPE_TICKS}) and is handed back to
 *   the stage the tick after; the stage's timeline waits at that point meanwhile (no event past it
 *   fires during the pan). Its parts fire only while on screen.
 * - **Boss inside a boss (M2-09).** A boss with an `inner` boss reveals it at its final blast:
 *   the inner boss flies from the outer's first core to its home (its own intro) in another slot.
 * - **Timers (M2-09).** A boss with a `timeLimit` escapes when its fight has lasted that long: it
 *   stops fighting and flies off to the right over {@link BOSS_ESCAPE_TICKS} (to its entry's intro
 *   start past the right edge — an inner boss too, not back to where it was revealed; its partner
 *   with it), no tally; a stage boss's escape sets {@link EndingFlag}.BossEscaped in the host's
 *   `endingFlags` and ends the encounter like a death.
 * - **The death sequence.** When the last core is destroyed: every cancelable bullet and laser is
 *   cancelled (point items for the killer), the music fades (unless another main boss still
 *   fights or an inner boss follows), chained explosions every {@link BOSS_CHAIN_INTERVAL} ticks
 *   (cosmetic RNG), the final blast (flash, large shake, rumble, hit-stop), the **score tally**
 *   (`SimEventKind.BossDefeated`; the stage-clear jingle when it ends the encounter) and at
 *   {@link BOSS_CLEAR_TICKS} the slot is `Dead`. The **last** boss of the main encounter to finish
 *   (no other main boss in play) releases the scroll lock and sets the status `stageClear` — or,
 *   in a boss-rush stage with bosses left, schedules the next one.
 * - **Boss rush (M2-09).** A `bossRush` stage's `rush` list (`core/data` `StageRushEntry`) runs in
 *   order: each entry comes `delay` ticks after the stage start or the end of the last one (with
 *   the WARNING when it says so); the last one's end clears the stage. A checkpoint restart brings
 *   the current entry again.
 * - **HP bar (M2-09).** {@link BossSystem.hpBar} ({@link BossHpBar}) sums the hit points that stand
 *   between the players and the kill — every core and the parts a core requires — of the main
 *   bosses in play (else of the captains); during an intro it fills up. `core/ui` draws it in the
 *   top HUD bar when the display option asks for it.
 *
 * **Tick.** Phase 3 — {@link BossSystem.update} (state timers, turns, time limits, the raid camera,
 * the boss rush), then the stage hooks may start a boss; phase 4 — {@link BossSystem.runScript};
 * phase 5 — {@link BossSystem.move} (fly-in, motion, spins, part transforms, frames, hit flash);
 * phase 6 — {@link BossSystem.insertColliders}, {@link BossSystem.collidePlayers}; phase 7 — the
 * shots call {@link BossSystem.damagePart}, then {@link BossSystem.resolve} (phase changes); phase
 * 9 — {@link BossSystem.sync} (the parts' batches, the HP bar). The state timers count simulated
 * ticks: a hit-stop pauses them.
 *
 * **Zero allocation.** The slots, their parts, the script APIs, the compiled specs, the batches,
 * the raid camera target and the HP bar are built by {@link createBossSystem}; the per-tick
 * methods only write numbers (turned parts read a module-level sine table). As with the enemies
 * (decision D29), starting a phase creates its generator and every wake allocates the generator's
 * `{ value, done }` result; a captain's launch spawns an enemy (its coroutine).
 *
 * **Implements.**
 * - shmup_feat.md §13 Bosses & mid-bosses — the WARNING intro, the death sequence, multi-part
 *   bosses, weak points, the phase state machine; the boss HP bar, boss timers / escapes,
 *   battleship raids, boss inside a boss, double bosses, mid-bosses ("captains"), boss rush
 * - shmup_feat.md §19 — the WARNING siren (critical), music switch to the boss theme, the
 *   stage-clear jingle
 * - shmup_feat.md §20 — clink on invulnerable parts, big explosions, bullet cancel on boss death,
 *   rumble on boss kill, screen shake used sparingly
 *
 * **Public API.** {@link createBossSystem}, {@link BossSystem}, {@link BossHost}, {@link Boss},
 * {@link BossPart}, {@link BossState}, {@link BOSS_STATE_NAMES}, {@link BossRole},
 * {@link BossVulnerable}, {@link BossHit}, {@link BossMotion}, {@link BossScriptApi},
 * {@link BossBehavior}, {@link BossBehaviorLookup}, {@link EMPTY_BOSS_BEHAVIORS}, {@link BossCamera},
 * {@link WarningState}, {@link BossHpBar}, {@link RaidCamera}, {@link EndingFlag},
 * {@link WARNING_TEMPLATE}, {@link formatWarningText}, {@link MAX_BOSSES},
 * {@link BOSS_PART_SLOTS}, {@link BOSS_PART_ID_BASE}, {@link MAX_HIT_TARGETS},
 * {@link WARNING_TICKS}, {@link WARNING_PULSE_TICKS}, {@link WARNING_BRAKE_TICKS},
 * {@link WARNING_DIM_PERCENT}, {@link WARNING_MUSIC_FADE_TICKS}, {@link BOSS_CHAIN_TICKS},
 * {@link BOSS_CHAIN_INTERVAL}, {@link BOSS_BLAST_HIT_STOP_TICKS}, {@link BOSS_BLAST_SHAKE_TICKS},
 * {@link BOSS_TALLY_TICKS}, {@link BOSS_CLEAR_TICKS}, {@link BOSS_MUSIC_FADE_TICKS},
 * {@link BOSS_ENTRY_MARGIN}, {@link CAPTAIN_CHAIN_TICKS}, {@link CAPTAIN_TALLY_TICKS},
 * {@link CAPTAIN_CLEAR_TICKS}, {@link CAPTAIN_BLAST_SHAKE_TICKS}, {@link BOSS_ESCAPE_TICKS},
 * {@link BOSS_TURN_TICKS}, {@link BOSS_REST_X}, {@link RAID_RETURN_TICKS},
 * {@link BOSS_FIRE_MARGIN}, {@link turnedFrame}.
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
import { PLAYFIELD_H, PLAYFIELD_W } from '../config/index.js';
import {
  BOSS_ROLES,
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
import { ANGLE_MASK, ANGLE_QUARTER, ANGLE_UNITS, atan2B, sinB } from '../math/index.js';
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
import type { StageCameraTarget } from '../stage/index.js';
import type { WorldStatus } from '../world/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'bosses',
  status: 'implemented',
  specRefs: ['shmup_feat.md §13', 'shmup_feat.md §19', 'shmup_feat.md §20'],
});

/** Boss slots per World (M2-09): a double boss, a captain and an inner boss at once. */
export const MAX_BOSSES = 4;

/** Part slots of every boss slot together: slot `s`'s part `i` is part slot `s × 16 + i`. */
export const BOSS_PART_SLOTS = MAX_BOSSES * MAX_BOSS_PARTS;

/**
 * Hit / grid / laser-source id of part slot `g` (see {@link BOSS_PART_SLOTS}):
 * `BOSS_PART_ID_BASE + g`, right after the {@link MAX_ENEMIES} enemy slots, so one id space
 * covers every hit target.
 */
export const BOSS_PART_ID_BASE = MAX_ENEMIES;

/** Hit-target ids of a World: the enemy slots, then every boss slot's parts. */
export const MAX_HIT_TARGETS = MAX_ENEMIES + BOSS_PART_SLOTS;

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

/** Tick of the death sequence the boss's slot becomes `Dead` on (plan M1-13: 180). */
export const BOSS_CLEAR_TICKS = 180;

/** Fade-out of the boss music when the last core is destroyed, in ticks. */
export const BOSS_MUSIC_FADE_TICKS = 60;

/** A boss starts its intro this many pixels beyond the right edge of the view (its left edge). */
export const BOSS_ENTRY_MARGIN = 8;

/** A captain's (mid-boss's) shorter death chain, in ticks (its blast comes on its last tick). */
export const CAPTAIN_CHAIN_TICKS = 48;

/** Tick of a captain's death sequence its score tally happens on. */
export const CAPTAIN_TALLY_TICKS = CAPTAIN_CHAIN_TICKS + 1;

/** Tick of a captain's death sequence its slot becomes `Dead` on. */
export const CAPTAIN_CLEAR_TICKS = 72;

/** Length of a captain's blast shake (medium), in ticks — no flash, no hit-stop. */
export const CAPTAIN_BLAST_SHAKE_TICKS = 20;

/** Ticks an escaping boss takes to fly off (M2-09 boss timers). */
export const BOSS_ESCAPE_TICKS = 90;

/** Ticks a double boss's turn takes: the resting one withdraws, the other comes forward. */
export const BOSS_TURN_TICKS = 60;

/** Playfield x the resting boss of a double boss withdraws to (its origin; mostly off screen). */
export const BOSS_REST_X = PLAYFIELD_W + 40;

/** Ticks a raid's camera takes to ease back to where the raid began (death or escape). */
export const RAID_RETURN_TICKS = BOSS_CHAIN_TICKS;

/** A raid's part fires only when its centre is inside the view grown by this many pixels. */
export const BOSS_FIRE_MARGIN = 8;

/**
 * Bits of the World's `endingFlags` (M2-09; the ending selection of M2-10 reads them). Append,
 * never renumber.
 */
export const EndingFlag = {
  /** A stage boss escaped when its time limit ran out. */
  BossEscaped: 1,
} as const;

/** An {@link EndingFlag} bit. */
export type EndingFlag = (typeof EndingFlag)[keyof typeof EndingFlag];

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

/** Life-cycle state of a boss slot ({@link Boss.state}). Hashed: append only. */
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
  /** Defeated (or escaped); the slot is free again. */
  Dead: 5,
  /** Escaping after its time limit (M2-09): flying off, no hits, no contact. */
  Escape: 6,
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
  'escape',
]);

/** What a boss is to its stage: the codes of `core/data` `BOSS_ROLES`, in order (M2-09). */
export const BossRole = {
  /** A stage boss: the main encounter (the WARNING, the lock, the stage clear). */
  Boss: 0,
  /** A mid-boss: rides the scrolling camera until destroyed, a short death, no stage clear. */
  Captain: 1,
} as const;

/** A {@link BossRole} code. */
export type BossRole = (typeof BossRole)[keyof typeof BossRole];

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

/** How a boss moves ({@link Boss.motion}). */
export const BossMotion = {
  /** Stays where it is (relative to its anchor: it rides the camera unless it is a raid). */
  Hold: 0,
  /** Follows the nearest player's height ({@link BossScriptApi.track}). */
  Track: 1,
  /** Eases to a point ({@link BossScriptApi.moveTo}), then holds. */
  MoveTo: 2,
  /** Circles an ellipse ({@link BossScriptApi.orbit}, M2-09 — a screen-crossing circler). */
  Orbit: 3,
} as const;

/** A {@link BossMotion} code. */
export type BossMotion = (typeof BossMotion)[keyof typeof BossMotion];

/**
 * Sine of every binary angle, plus a quarter turn of overhang so `SIN[a + ANGLE_QUARTER]` is the
 * cosine — the same values as `core/math` `sinB` / `cosB`, read here without a call per part.
 */
const SIN = new Float64Array(ANGLE_UNITS + ANGLE_QUARTER);
for (let i = 0; i < SIN.length; i++) SIN[i] = sinB(i);

/**
 * The heading frame of a turned part (M2-09): the frame whose heading (`frame × 1024 / frames`)
 * is nearest the angle.
 *
 * @param angle - World angle in binary units, `[0, 1024)`.
 * @param frames - Heading frames of the sprite (≥ 1).
 * @returns The frame, `0 … frames − 1`.
 *
 * @example
 * ```ts
 * turnedFrame(256, 16); // → 4 (a quarter turn: pointing down)
 * turnedFrame(1000, 16); // → 0 (rounds up to a whole turn)
 * ```
 */
export function turnedFrame(angle: number, frames: number): number {
  if (!(frames > 1)) return 0;
  return (((angle * frames) / ANGLE_UNITS + 0.5) | 0) % frames;
}

/**
 * One part of a boss slot (a pooled class: its numeric fields stay unboxed). Satisfies
 * `core/bullets` `LaserSource`, so lasers can stay attached to it.
 */
export class BossPart {
  /** Index in its boss's {@link Boss.parts}. */
  readonly index: number;
  /** The boss slot it belongs to (M2-09). */
  readonly owner: number;
  /** Part slot across every boss slot: `owner × 16 + index` ({@link BossSystem.parts}). */
  readonly global: number;
  /** Hit / grid / laser-source id: {@link BOSS_PART_ID_BASE} + {@link BossPart.global}. */
  readonly slot: number;
  /** Whether the slot's current boss has this part (index < its part count). */
  active = false;
  /** Name from the boss data (set on activation; tools only). */
  name = '';
  /** Index of the parent part, -1 = the boss's origin. */
  parent = -1;
  /** X offset from the parent, before its turn (a behaviour may change it). */
  localX = 0;
  /** Y offset from the parent. */
  localY = 0;
  /**
   * X offset from the parent in the boss data (set on activation; M2-11) — the rest position a
   * behaviour that moves the part (`setPartOffset`) measures from, so its moves never drift.
   */
  restX = 0;
  /** Y offset from the parent in the boss data (see {@link BossPart.restX}). */
  restY = 0;
  /** World x of the part's centre (phase 5). */
  x = 0;
  /** World y of the part's centre. */
  y = 0;
  /** Whether it has a hurtbox (a box or a circle; else it is never hit or touched). */
  hurtbox = false;
  /** Hurtbox half width (the radius for a circle — the grid's box). */
  hw = 0;
  /** Hurtbox half height (the radius for a circle). */
  hh = 0;
  /** Circle hurtbox radius, 0 = a box (M2-09). */
  radius = 0;
  /** Turn relative to the parent, binary units `[0, 1024)` (M2-09). */
  angle = 0;
  /** Turn speed in binary units per tick (M2-09). */
  spin = 0;
  /** World angle: the parent's plus its own, `[0, 1024)` (phase 5; M2-09). */
  worldAngle = 0;
  /** Heading frames of its sprite, 0 = none (M2-09). */
  turnFrames = 0;
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
  /** Current frame (animation or heading). */
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
   * A raid's part: its centre is inside the view grown by {@link BOSS_FIRE_MARGIN} (refreshed in
   * phase 5; M2-09 — it may fire only then). Always `true` for a boss riding the camera.
   */
  inView = true;

  /**
   * Creates an unused part slot (the boss system builds all of them at load).
   *
   * @param index - Its index in its boss.
   * @param owner - Its boss slot (default 0).
   */
  constructor(index: number, owner = 0) {
    this.index = index;
    this.owner = owner;
    this.global = owner * MAX_BOSS_PARTS + index;
    this.slot = BOSS_PART_ID_BASE + this.global;
  }
}

/** One boss slot of the World (a class: numeric fields unboxed; see the module docs). */
export class Boss implements ScriptHolder {
  /** Its index in {@link BossSystem.slots} (M2-09). */
  readonly slot: number;
  /** {@link BossState} code. */
  state: number = BossState.None;
  /** `ContentDb.enemies` index of the boss's entry (-1 = none). */
  specIndex = -1;
  /** {@link BossRole} code (M2-09). */
  role = 0;
  /** World x of the boss's origin (phase 5: its anchor + {@link Boss.screenX}). */
  x = 0;
  /** World y of the origin. */
  y = 0;
  /** X of the origin relative to its anchor — the playfield x, unless it is a raid. */
  screenX = 0;
  /** Y of the origin relative to its anchor. */
  screenY = 0;
  /** A raid (M2-09): anchored at a world point instead of the camera. */
  anchored = false;
  /** World x of a raid's anchor (the camera where it entered). */
  anchorX = 0;
  /** World y of a raid's anchor. */
  anchorY = 0;
  /** X its intro ends at (relative to the anchor). */
  homeX = 0;
  /** Y its intro ends at. */
  homeY = 0;
  /** X its intro starts at (just past the right edge; an inner boss: where it was revealed). */
  startX = 0;
  /** Y its intro starts at (M2-09; the home row unless it is an inner boss). */
  startY = 0;
  /** Length of its intro in ticks. */
  introTicks = 0;
  /** Ticks since the current state began (simulated ticks). */
  stateTicks = 0;
  /** Current phase index. */
  phase = 0;
  /** Ticks since the current phase began (paused while resting). */
  phaseTicks = 0;
  /** Fight ticks so far — the time limit's clock (M2-09). */
  fightTicks = 0;
  /** Fight ticks before it escapes, 0 = never (M2-09). */
  timeLimit = 0;
  /** It escaped (its time ran out) rather than died (M2-09). */
  escaped = false;
  /** The current phase's coroutine, or `null`. */
  script: Script | null = null;
  /** Tick the script wakes on. */
  wakeTick = 0;
  /** {@link BossMotion} code. */
  motion = 0;
  /** Motion to take up when the running move-to ends (M2-09; `Hold` unless a turn saved one). */
  afterMove = 0;
  /** Tracking speed in px/tick. */
  trackSpeed = 0;
  /** Highest row the tracking may take the origin to (relative to the anchor). */
  trackMin = 0;
  /** Lowest row. */
  trackMax = 0;
  /** Move-to start x. */
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
  /** Orbit centre x (M2-09). */
  orbitX = 0;
  /** Orbit centre y. */
  orbitY = 0;
  /** Orbit radius along x. */
  orbitRX = 0;
  /** Orbit radius along y. */
  orbitRY = 0;
  /** Orbit angle, binary units `[0, 1024)`. */
  orbitAngle = 0;
  /** Orbit speed, binary units per tick (negative = counter-clockwise). */
  orbitSpeed = 0;
  /** Bit mask of the destroyed parts. */
  destroyedMask = 0;
  /** Bit mask of the core parts. */
  coreMask = 0;
  /** Player slot that destroyed the last core (-1 = nobody / not yet). */
  killer = -1;
  /** The final blast went off: the parts are not drawn any more. */
  blasted = false;
  /**
   * Slot of its double-boss partner, -1 = none (M2-09) — cut both ways when either of the pair's
   * slot ends (death sequence over or escaped), so a boss that takes that slot later is no mate.
   */
  partner = -1;
  /** It leads its pair (its entry names the partner; it counts the turns). */
  leader = false;
  /** Withdrawn to the back while its partner fights (M2-09): not hit, touched or scripted. */
  resting = false;
  /** A turn's move runs (to the rest point or back): the script waits. */
  turning = false;
  /** Ticks until the pair's next turn (the leader's; M2-09). */
  turnTicks = 0;
  /** Its partner died: faster (M2-09). */
  enraged = false;
  /** Fire-interval factor while enraged. */
  enrageFireRate = 1;
  /** Motion-speed factor while enraged. */
  enrageSpeed = 1;
  /** The raid's camera path runs (M2-09). */
  raiding = false;
  /** The raid's camera eases back (death / escape). */
  returning = false;
  /** Current raid segment. */
  raidSegment = 0;
  /** Ticks into the segment (or the return). */
  raidTicks = 0;
  /** Camera offset (from the origin) the segment started at — or the return's start (world). */
  raidFromX = 0;
  /** Y of {@link Boss.raidFromX}. */
  raidFromY = 0;
  /** World x of the camera where the raid began (the return's end). */
  raidHomeX = 0;
  /** World y of the camera where the raid began. */
  raidHomeY = 0;
  /** Length of the running return in ticks. */
  raidReturnTicks = 0;
  /** Index of the boss-rush entry that brought it (-1 = none; M2-09). */
  rushEntry = -1;
  /**
   * Tick it flew in (M2-09): a boss that enters during phase 3 from another slot's timer (a
   * double boss's partner, an inner boss) starts counting its intro on the next tick, like the
   * boss that brought it.
   */
  enterTick = -1;
  /** Parts of the current boss. */
  partCount = 0;
  /** Its part slots ({@link MAX_BOSS_PARTS}); `[0, partCount)` are in use. */
  readonly parts: readonly BossPart[];

  /**
   * Builds the part slots (load time).
   *
   * @param slot - The boss slot (default 0).
   * @param parts - Its part slots (default: new ones).
   */
  constructor(slot = 0, parts?: readonly BossPart[]) {
    this.slot = slot;
    if (parts !== undefined) {
      this.parts = parts;
      return;
    }
    const own: BossPart[] = [];
    for (let i = 0; i < MAX_BOSS_PARTS; i++) own.push(new BossPart(i, slot));
    this.parts = own;
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
 * The boss HP bar's model (M2-09, shmup_feat.md §13 "boss HP bar"; the World's
 * `bosses.hpBar`, refreshed in phase 9): what `core/ui` draws in the top HUD bar.
 *
 * @remarks
 * Counted: the **main** bosses (role `boss`) in their intro, fight, death sequence (until the
 * blast) or escape — or, when none is, the captains. Each contributes the hit points of its
 * cores and of the parts a core requires (what must go for the kill); a boss in its intro
 * contributes its full strength × the intro's progress (the bar fills up), a dying one 0.
 */
export class BossHpBar {
  /** Whether a boss is counted (the bar is shown). */
  visible = false;
  /** Remaining hit points counted. */
  hp = 0;
  /** Full strength counted. */
  maxHp = 0;
  /** Bosses counted. */
  bosses = 0;
}

/**
 * The camera target of a raid (M2-09): a class, so its fields stay unboxed doubles — the stage
 * runner follows it (`StageRunner.follow`).
 */
export class RaidCamera implements StageCameraTarget {
  /** See {@link StageCameraTarget.x}. */
  x = 0;
  /** See {@link StageCameraTarget.y}. */
  y = 0;
}

/**
 * What a boss behaviour can use — one reused object per boss slot (decision D29).
 *
 * @remarks
 * Part indices are positions in the boss's `parts` list (look a name up once when the script
 * starts — {@link BossScriptApi.partIndex}). The fire primitives fire from the part's centre
 * through `core/patterns` (rank-scaled speeds; `AIM_AT_TARGET` — the default of every optional
 * angle — aims at the nearest living player) and do nothing while
 * {@link BossScriptApi.canFire} is `false` for that part (-1 / 0 fired). Positions are relative
 * to the boss's anchor: playfield pixels, unless the boss is a raid (then relative to where it
 * entered).
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
  /** Whether the boss is enraged (its partner died; M2-09). */
  readonly enraged: boolean;
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
   * Moves a part relative to its parent (before the parent's turn). The offsets from the boss
   * data stay in the part's `restX` / `restY` (M2-11): measure a move from them, not from the
   * current `localX` / `localY`, and a later phase can put the part back where it belongs.
   *
   * @param index - Part index.
   * @param localX - X offset from the parent.
   * @param localY - Y offset.
   */
  setPartOffset(index: number, localX: number, localY: number): void;
  /**
   * Sets a part's turn relative to its parent (M2-09): the parts attached to it turn with it.
   *
   * @param index - Part index.
   * @param angle - Binary units (wrapped into `[0, 1024)`).
   */
  setPartAngle(index: number, angle: number): void;
  /**
   * Sets a part's turn speed (M2-09).
   *
   * @param index - Part index.
   * @param speed - Binary units per tick (0 = still).
   */
  spinPart(index: number, speed: number): void;
  /**
   * A part's world angle (M2-09).
   *
   * @param index - Part index.
   * @returns Binary units `0 … 1023` (whole), 0 for a bad index.
   */
  partAngle(index: number): number;
  /**
   * Turns a part toward the nearest living player (M2-09 — a turret): its own turn changes by at
   * most `maxStep` units so its world angle heads at the target — the heading of an aimed shot
   * from the part's centre (quantised to the config's aim directions). Its world angle and
   * heading frame follow in the next phase 5.
   *
   * @param index - Part index.
   * @param maxStep - Most units to turn (≤ 0 = at once).
   * @returns The part's new world heading (whole units), or -1 (bad index, no target).
   */
  aimPart(index: number, maxStep: number): number;
  /** Stops the boss's own motion (it still rides its anchor). */
  hold(): void;
  /**
   * Follows the nearest living player's height at up to `speed` px/tick (× the enrage factor),
   * keeping the origin between the rows `minY` and `maxY`.
   *
   * @param speed - Pixels per tick (≤ 0 = hold).
   * @param minY - Highest row.
   * @param maxY - Lowest row.
   */
  track(speed: number, minY: number, maxY: number): void;
  /**
   * Eases the origin to a point over `ticks` ticks (in-out), then holds.
   *
   * @param screenX - Target x.
   * @param screenY - Target y.
   * @param ticks - Duration (≤ 0 = at once).
   */
  moveTo(screenX: number, screenY: number, ticks: number): void;
  /**
   * Circles an ellipse (M2-09 — a screen-crossing circler): from the angle of where the boss is
   * now, `speed` units per tick (× the enrage factor), origin = centre + (cos × `rx`, sin × `ry`).
   *
   * @param cx - Centre x.
   * @param cy - Centre y.
   * @param rx - Radius along x.
   * @param ry - Radius along y.
   * @param speed - Binary units per tick (negative = counter-clockwise; 0 = hold).
   */
  orbit(cx: number, cy: number, rx: number, ry: number, speed: number): void;
  /**
   * Whether a part may fire now: the boss fights (not in its intro, death or escape, not resting),
   * the part stands and — for a raid — its centre is on screen.
   *
   * @param index - Part index.
   * @returns `true` when it may fire.
   */
  canFire(index: number): boolean;
  /**
   * A fire interval scaled by the rank's fire rate (`core/patterns` `rankedWait`) and, while
   * enraged, by the boss's `enrage.fireRate`.
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
  /**
   * Launches the boss's `minion` enemy from a part (M2-09 — a captain's splitting launcher): it
   * spawns at the part's centre as a regular enemy (its own script and mover).
   *
   * @remarks
   * Allocates the minion's coroutine (like every spawn, decision D29).
   *
   * @param index - Part index.
   * @returns `true` when one was launched (the boss may fire, has a minion, a slot was free).
   */
  launch(index: number): boolean;
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

/** The camera a boss system reads and — in free flight, for a raid — steers (M2-09). */
export interface BossCamera extends PlayerCamera {
  /** Horizontal scroll velocity (a free-flight raid writes it; the World moves the camera). */
  vx: number;
  /** Vertical scroll velocity. */
  vy: number;
}

/** What the boss system needs from its World (the World implements it). */
export interface BossHost {
  /** The tick being run. */
  readonly tick: number;
  /** The camera (bosses ride it; the view edges place the intro; a raid steers it). */
  readonly camera: BossCamera;
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
  /** The enemies (a captain launches its minions through them; M2-09). */
  readonly enemies: {
    /**
     * Spawns a regular enemy (`EnemySystem.spawn`).
     *
     * @param enemyIndex - `ContentDb.enemies` index.
     * @param x - World x.
     * @param y - World y.
     * @returns The enemy, or `null`.
     */
    spawn(enemyIndex: number, x: number, y: number): unknown;
  };
  /** Remaining hit-stop ticks (the final blast raises it). */
  hitStop: number;
  /** The session status (`bossWarning` during the WARNING, `stageClear` after the encounter). */
  status: WorldStatus;
  /** Ending flags ({@link EndingFlag}; a stage boss's escape sets `BossEscaped` — M2-09). */
  endingFlags: number;
  /** The stage runner (brake / unlock / follow, music ids), or `null` in free flight. */
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
    /**
     * Makes the camera follow a target (a raid), or stops it (`null`).
     *
     * @param target - The target, or `null`.
     */
    follow(target: StageCameraTarget | null): void;
  } | null;
  /** The scores (part and boss points). */
  readonly scoring: {
    /** The board. */
    readonly board: ScoreBoard;
  };
}

/** The boss system of one World (see the module docs for its part of each tick phase). */
export interface BossSystem {
  /** Boss slot 0 (the one a single boss takes). */
  readonly boss: Boss;
  /** Every boss slot ({@link MAX_BOSSES}; M2-09). */
  readonly slots: readonly Boss[];
  /**
   * Every slot's part slots, flat ({@link BOSS_PART_SLOTS}): index = part slot
   * ({@link BossPart.global}) — what the hit path addresses.
   */
  readonly parts: readonly BossPart[];
  /**
   * The parts' sprite batch (`LayerId.AirEnemies`, {@link BOSS_PART_SLOTS} sprites): every boss
   * not resting.
   */
  readonly batch: SpriteBatch;
  /** The resting bosses' parts (`LayerId.GroundEnemies` — behind the air; M2-09). */
  readonly backBatch: SpriteBatch;
  /** The WARNING (the World's `view.warning`). */
  readonly warning: WarningState;
  /** The HP bar's model (M2-09; refreshed in phase 9). */
  readonly hpBar: BossHpBar;
  /** The raid camera's target (M2-09; the stage runner follows it during a raid). */
  readonly raidCamera: RaidCamera;
  /** Whether any boss sequence runs (WARNING, intro, fight, death sequence or escape). */
  readonly active: boolean;
  /** Whether the main encounter runs: a stage boss (role `boss`) in any of those states. */
  readonly mainActive: boolean;
  /** Index of the boss-rush entry that comes or runs next (M2-09; the rush length when done). */
  readonly rushIndex: number;
  /** Ticks until the next rush boss comes (-1 = none waiting; M2-09). */
  readonly rushDelay: number;
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
   * The stage `warning` event: starts the WARNING of a stage boss (see the module docs), after
   * which the boss flies in.
   *
   * @remarks
   * Ignored (→ `false`) while the main encounter or another WARNING runs, when no slot is free,
   * for a captain and for an index that is not a boss. The status becomes `bossWarning` only from
   * `playing`.
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
   * The stage `boss` event: the boss flies in at once (no WARNING, no brake); a stage boss's
   * music starts (a captain keeps the stage music).
   *
   * @remarks
   * A stage boss is ignored (→ `false`) while the main encounter runs; any boss when no slot is
   * free or the index is not a boss.
   *
   * @param enemyIndex - `ContentDb.enemies` index of the boss.
   * @returns Whether it started.
   */
  startBoss(enemyIndex: number): boolean;
  /**
   * Phase 3 (before the stage runner): advances the state timers — the WARNING (siren pulses,
   * then the boss enters), the intro (then the fight), the phase and fight clocks (time limits),
   * a pair's turns, the death sequence (chain, blast, tally, end), an escape —, a raid's camera
   * target and the boss rush. Never allocates.
   */
  update(): void;
  /** Phase 4: resumes the current phase's script of every fighting boss (not resting). */
  runScript(): void;
  /**
   * Phase 5: the intro fly-in, the fight or escape motion (tracking, move-to, orbit), the anchor
   * ride, spins and part transforms (parents first), frames and hit flash. Never allocates.
   */
  move(): void;
  /**
   * Phase 6, between `grid.begin` and `grid.build`: refreshes each part's
   * {@link BossPart.target} / {@link BossPart.armoured} and inserts the targets' hurtboxes with
   * their ids ({@link BossPart.slot}). Parts are targets during the intro and the fight (not
   * resting) while they have a hurtbox and are not destroyed.
   *
   * @param grid - The World's grid.
   */
  insertColliders(grid: SpatialGrid): void;
  /**
   * Phase 6: the ships' hurt circles against the target parts' boxes (closed) or circles →
   * `playerHit(Contact)`, at most one accepted hit per ship and tick.
   */
  collidePlayers(): void;
  /**
   * Phase 7 (the player shots, `core/weapons`): a hit on part slot `index`
   * ({@link BossPart.global} — for boss slot 0 the part's own index).
   *
   * @remarks
   * {@link BossHit.None} when its boss is not in its intro or fight (or rests) or the part is not
   * in play (the shot flies on); {@link BossHit.Clink} during the intro and for a part that cannot
   * take damage now; otherwise the part loses `amount` hit points and flashes —
   * {@link BossHit.Damaged} (`SFX EnemyHit`), or at 0 {@link BossHit.Destroyed}: it explodes, its
   * `score` goes to `by`, its children are destroyed with it, lasers attached to them stop; the
   * last core starts the death sequence.
   *
   * @param index - Part slot.
   * @param amount - Damage.
   * @param by - Player slot credited (-1 = nobody).
   * @returns A {@link BossHit} code.
   */
  damagePart(index: number, amount: number, by: number): number;
  /**
   * Whether a hit on a part would clink right now (live — {@link BossPart.armoured} is the
   * phase-6 snapshot).
   *
   * @param index - Part slot.
   * @returns `true` during the intro and for a part that cannot take damage now.
   */
  isArmoured(index: number): boolean;
  /**
   * Phase 7, after the shots' hits: ends the current phase of every fighting boss while its
   * condition is met (several in one tick if the next ones are met too); the new phase's script
   * starts next tick.
   */
  resolve(): void;
  /**
   * Destroys every core of every boss in its intro or fight at once (debug tools, tests): their
   * death sequences start.
   *
   * @param by - Player slot credited (default -1 = nobody).
   * @returns `true` when at least one boss was defeated.
   */
  defeat(by?: number): boolean;
  /**
   * Session clear (a checkpoint restart): removes every boss and the WARNING, gives the status
   * `bossWarning` back as `playing`, stops a raid's camera, brings the current boss-rush entry
   * again and restores the stage theme when a boss had changed the music.
   */
  clear(): void;
  /** Phase 9: refills the parts' batches and the HP bar. Never allocates. */
  sync(): void;
}

/** A boss entry compiled at world creation (the per-tick code reads only these numbers). */
class CompiledBoss {
  /** `ContentDb.enemies` index. */
  readonly specIndex: number;
  /** The boss section. */
  readonly spec: BossSpec;
  /** {@link BossRole} code. */
  readonly role: number;
  /** Home x (relative to the anchor). */
  readonly homeX: number;
  /** Home y. */
  readonly homeY: number;
  /** Intro start x (just past the right edge). */
  readonly startX: number;
  /** Bit mask of the cores. */
  readonly coreMask: number;
  /** Bit mask of the parts the HP bar counts: the cores and the parts a core requires. */
  readonly barMask: number;
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
  /** Fight ticks before it escapes (0 = never). */
  readonly timeLimit: number;
  /** Raid segments: camera x offset from the origin (empty = no raid). */
  readonly raidX: Float64Array;
  /** Raid segments: camera y offset. */
  readonly raidY: Float64Array;
  /** Raid segments: move ticks. */
  readonly raidTicks: Float64Array;
  /** Raid segments: hold ticks. */
  readonly raidHold: Float64Array;
  /** The raid loops. */
  readonly raidLoop: boolean;
  /** Partner's enemy index (-1 = none). */
  readonly partnerId: number;
  /** Ticks per turn of the pair (0 = none). */
  readonly alternate: number;
  /** Enraged fire-interval factor. */
  readonly enrageFireRate: number;
  /** Enraged motion factor. */
  readonly enrageSpeed: number;
  /** Phase to jump to when enraged (-1 = none). */
  readonly enragePhase: number;
  /** Inner boss's enemy index (-1 = none). */
  readonly innerId: number;
  /** Minion's enemy index (-1 = none). */
  readonly minionId: number;

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
    const role = BOSS_ROLES.indexOf(spec.role ?? 'boss');
    this.role = role >= 0 ? role : BossRole.Boss;
    this.homeX = spec.x;
    this.homeY = spec.y;
    // Absolute offsets (parents first, before any turn) → the leftmost pixel, so the intro starts
    // off screen.
    const offX: number[] = [];
    let left = 0;
    let cores = 0;
    let required = 0;
    for (let i = 0; i < spec.parts.length; i++) {
      const part = spec.parts[i];
      const ox = (part.parentIndex >= 0 ? offX[part.parentIndex] : 0) + part.x;
      offX.push(ox);
      const radius = part.radius ?? 0;
      const half = part.hurtbox !== null ? part.hurtbox.hw : radius > 0 ? radius : 8;
      const edge = ox - half;
      if (edge < left) left = edge;
      if (part.core) {
        cores |= 1 << i;
        required |= part.requiresMask;
      }
    }
    // The parts a core requires, and what those require in turn.
    let bar = (cores | required) >>> 0;
    for (let round = 0; round < MAX_BOSS_PARTS; round++) {
      let grown = bar;
      for (let i = 0; i < spec.parts.length; i++) {
        if ((bar & (1 << i)) !== 0) grown = (grown | spec.parts[i].requiresMask) >>> 0;
      }
      if (grown === bar) break;
      bar = grown;
    }
    this.barMask = bar;
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
    // M2-09 (fields a hand-built spec may lack take their defaults).
    this.timeLimit = spec.timeLimit ?? 0;
    const segments = spec.raid === null || spec.raid === undefined ? [] : spec.raid.segments;
    this.raidX = new Float64Array(segments.length);
    this.raidY = new Float64Array(segments.length);
    this.raidTicks = new Float64Array(segments.length);
    this.raidHold = new Float64Array(segments.length);
    for (let s = 0; s < segments.length; s++) {
      this.raidX[s] = segments[s].x;
      this.raidY[s] = segments[s].y;
      this.raidTicks[s] = segments[s].ticks;
      this.raidHold[s] = segments[s].hold;
    }
    this.raidLoop = spec.raid === null || spec.raid === undefined ? true : spec.raid.loop;
    this.partnerId = spec.partnerId ?? -1;
    this.alternate = spec.alternate ?? 0;
    const enrage = spec.enrage;
    this.enrageFireRate = enrage === undefined ? 1 : enrage.fireRate;
    this.enrageSpeed = enrage === undefined ? 1 : enrage.speed;
    this.enragePhase = enrage === undefined ? -1 : enrage.phase;
    this.innerId = spec.innerId ?? -1;
    this.minionId = spec.minionId ?? -1;
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

/** Half a turn in binary units. */
const HALF_TURN = ANGLE_UNITS / 2;

/**
 * Wraps a binary angle (any finite double) into `[0, 1024)`, keeping its fraction.
 *
 * @param a - The angle.
 * @returns The wrapped angle.
 */
function wrapTurn(a: number): number {
  if (a >= 0 && a < ANGLE_UNITS) return a;
  const r = a - Math.floor(a / ANGLE_UNITS) * ANGLE_UNITS;
  return r >= 0 && r < ANGLE_UNITS ? r : 0;
}

/** The {@link BossScriptApi} of one boss slot (reused by every phase of every boss in it). */
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

  /** See {@link BossScriptApi.enraged}. */
  get enraged(): boolean {
    return this.self.enraged;
  }

  /** See {@link BossScriptApi.target}. */
  target(): PlayerShip | null {
    return this.system.nearestPlayer(this.self);
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

  /** See {@link BossScriptApi.setPartAngle}. */
  setPartAngle(index: number, angle: number): void {
    const part = this.part(index);
    if (part !== null && angle === angle) part.angle = wrapTurn(angle);
  }

  /** See {@link BossScriptApi.spinPart}. */
  spinPart(index: number, speed: number): void {
    const part = this.part(index);
    if (part !== null) part.spin = speed === speed ? speed : 0;
  }

  /** See {@link BossScriptApi.partAngle}. */
  partAngle(index: number): number {
    const part = this.part(index);
    return part === null ? 0 : Math.floor(part.worldAngle) & ANGLE_MASK;
  }

  /** See {@link BossScriptApi.aimPart}. */
  aimPart(index: number, maxStep: number): number {
    const part = this.part(index);
    const system = this.system;
    if (part === null || !system.hasTarget()) return -1;
    // The heading comes from the bullet system's aim (quantised like aimed shots); the arithmetic
    // stays in its hot code — this cold script path only moves whole numbers.
    const origin = system.origin;
    origin.x = part.x;
    origin.y = part.y;
    const want = system.host.bullets.aimFrom(origin);
    const current = Math.floor(part.worldAngle) & ANGLE_MASK;
    let delta = ((want - current + HALF_TURN) & ANGLE_MASK) - HALF_TURN;
    if (maxStep > 0) {
      if (delta > maxStep) delta = maxStep;
      else if (delta < -maxStep) delta = -maxStep;
    }
    // Its own turn changes; phase 5 recomputes the world angle and the heading frame.
    part.angle = (Math.floor(part.angle) + delta) & ANGLE_MASK;
    return (current + delta) & ANGLE_MASK;
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
    this.system.startMove(this.self, screenX, screenY, ticks, BossMotion.Hold);
  }

  /** See {@link BossScriptApi.orbit}. */
  orbit(cx: number, cy: number, rx: number, ry: number, speed: number): void {
    const self = this.self;
    if (!(speed !== 0 && speed === speed)) {
      self.motion = BossMotion.Hold;
      return;
    }
    self.orbitX = cx;
    self.orbitY = cy;
    self.orbitRX = rx;
    self.orbitRY = ry;
    self.orbitSpeed = speed;
    // The ellipse angle of where the boss is now (so the orbit starts without a jump when it is
    // on the ellipse).
    self.orbitAngle = atan2B((self.screenY - cy) * rx, (self.screenX - cx) * ry);
    self.motion = BossMotion.Orbit;
  }

  /** See {@link BossScriptApi.canFire}. */
  canFire(index: number): boolean {
    const part = this.part(index);
    const self = this.self;
    if (part === null || part.destroyed || self.state !== BossState.Fight || self.resting) {
      return false;
    }
    // A raid's parts fire only from the screen (phase 5's snapshot: no arithmetic in the cold
    // script path, whose lower V8 tiers would box every double).
    return part.inView;
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
    const wait = rankedWait(this.system.host.bullets, ticks);
    const self = this.self;
    if (!self.enraged) return wait;
    const faster = Math.floor(wait * self.enrageFireRate);
    return faster >= 1 ? faster : 1;
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

  /** See {@link BossScriptApi.launch}. */
  launch(index: number): boolean {
    const minion = this.system.minionOf(this.self);
    if (minion < 0 || !this.canFire(index)) return false;
    const part = this.self.parts[index];
    return this.system.host.enemies.spawn(minion, part.x, part.y) !== null;
  }
}

/** The boss system (a class: one set of monomorphic methods for every World). */
class BossSystemImpl implements BossSystem {
  /** See {@link BossSystem.boss}. */
  readonly boss: Boss;
  /** See {@link BossSystem.slots}. */
  readonly slots: readonly Boss[];
  /** See {@link BossSystem.parts}. */
  readonly parts: readonly BossPart[];
  /** See {@link BossSystem.batch}. */
  readonly batch: SpriteBatch;
  /** See {@link BossSystem.backBatch}. */
  readonly backBatch: SpriteBatch;
  /** See {@link BossSystem.warning}. */
  readonly warning: WarningState;
  /** See {@link BossSystem.hpBar}. */
  readonly hpBar: BossHpBar;
  /** See {@link BossSystem.raidCamera}. */
  readonly raidCamera: RaidCamera;
  /** The World. */
  readonly host: BossHost;
  /** The fire origin the script APIs share. */
  readonly origin = new BulletOrigin();
  /** Compiled boss entries by `ContentDb.enemies` index (`null` for regular enemies). */
  private readonly compiled: ReadonlyArray<CompiledBoss | null>;
  /** The script API of each slot. */
  private readonly apis: readonly BossScriptApiImpl[];
  /** The compiled entry of each slot's boss (`null` when none). */
  private readonly entries: Array<CompiledBoss | null>;
  /** Whether a boss sequence changed the music (a clear then restores the stage theme). */
  private musicChanged = false;
  /** A free-flight raid steers the camera's velocity (reset to 0 when it ends). */
  private steering = false;
  /** The motion each slot had when it withdrew to rest (restored when it comes back). */
  private readonly restMotion = new Uint8Array(MAX_BOSSES);
  /** `update()` is running (an entry then waits a tick — {@link Boss.enterTick}). */
  private updating = false;
  /** Boss-rush entries: enemy index. */
  private readonly rushEnemy: Int32Array;
  /** Boss-rush entries: delay ticks. */
  private readonly rushWait: Float64Array;
  /** Boss-rush entries: with the WARNING. */
  private readonly rushWarning: Uint8Array;
  /** See {@link BossSystem.rushIndex}. */
  rushIndex = 0;
  /** See {@link BossSystem.rushDelay}. */
  rushDelay = -1;

  /**
   * Builds the slots, the APIs, the batches and the compiled bosses (see
   * {@link createBossSystem}).
   *
   * @param host - The World.
   * @param behaviors - Boss behaviour lookup.
   * @param stage - The World's stage (its boss rush), or `null`.
   */
  constructor(host: BossHost, behaviors: BossBehaviorLookup, stage: StageSpec | null) {
    this.host = host;
    const slots: Boss[] = [];
    const parts: BossPart[] = [];
    const apis: BossScriptApiImpl[] = [];
    const entries: Array<CompiledBoss | null> = [];
    for (let s = 0; s < MAX_BOSSES; s++) {
      const own: BossPart[] = [];
      for (let i = 0; i < MAX_BOSS_PARTS; i++) {
        const part = new BossPart(i, s);
        own.push(part);
        parts.push(part);
      }
      const boss = new Boss(s, own);
      slots.push(boss);
      apis.push(new BossScriptApiImpl(boss, this));
      entries.push(null);
    }
    this.slots = slots;
    this.parts = parts;
    this.apis = apis;
    this.entries = entries;
    this.boss = slots[0];
    this.batch = createSpriteBatch(LayerId.AirEnemies, BOSS_PART_SLOTS);
    this.backBatch = createSpriteBatch(LayerId.GroundEnemies, BOSS_PART_SLOTS);
    this.warning = new WarningState();
    this.hpBar = new BossHpBar();
    this.raidCamera = new RaidCamera();
    const specs = host.content.enemies;
    const compiled: Array<CompiledBoss | null> = [];
    for (let i = 0; i < specs.length; i++) {
      const boss = specs[i].boss;
      compiled.push(boss === null ? null : new CompiledBoss(i, boss, behaviors));
    }
    this.compiled = compiled;
    const rush = stage === null || stage.rush === undefined ? [] : stage.rush;
    this.rushEnemy = new Int32Array(rush.length);
    this.rushWait = new Float64Array(rush.length);
    this.rushWarning = new Uint8Array(rush.length);
    for (let i = 0; i < rush.length; i++) {
      this.rushEnemy[i] = rush[i].enemyId;
      this.rushWait[i] = rush[i].delay;
      this.rushWarning[i] = rush[i].warning ? 1 : 0;
    }
    this.rushIndex = 0;
    this.rushDelay = rush.length > 0 ? this.rushWait[0] : -1;
  }

  /** See {@link BossSystem.active}. */
  get active(): boolean {
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const state = slots[s].state;
      if (state !== BossState.None && state !== BossState.Dead) return true;
    }
    return false;
  }

  /** See {@link BossSystem.mainActive}. */
  get mainActive(): boolean {
    return this.mainInPlay(null, true);
  }

  /**
   * Whether a stage boss (role `boss`) other than `except` is in a sequence.
   *
   * @param except - A slot to leave out, or `null`.
   * @param dying - Whether a death sequence counts.
   * @returns `true` when one is.
   */
  private mainInPlay(except: Boss | null, dying: boolean): boolean {
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      if (boss === except || boss.role !== BossRole.Boss) continue;
      const state = boss.state;
      if (state === BossState.None || state === BossState.Dead) continue;
      if (state === BossState.Dying && !dying) continue;
      return true;
    }
    return false;
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

  /**
   * The minion enemy of a slot's boss (the script API's `launch`).
   *
   * @param boss - The slot.
   * @returns Its `ContentDb.enemies` index, or -1.
   */
  minionOf(boss: Boss): number {
    const entry = this.entries[boss.slot];
    return entry === null ? -1 : entry.minionId;
  }

  /**
   * The lowest free slot (no boss, or a dead one).
   *
   * @returns The slot, or `null` when every slot is busy.
   */
  private freeSlot(): Boss | null {
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const state = slots[s].state;
      if (state === BossState.None || state === BossState.Dead) return slots[s];
    }
    return null;
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
   * Whether any player is alive to aim at (no arithmetic: the cold script path calls it).
   *
   * @returns `true` when one is.
   */
  hasTarget(): boolean {
    const players = this.host.players;
    for (let i = 0; i < players.length; i++) {
      if (players[i].active && players[i].state === 'alive') return true;
    }
    return false;
  }

  /**
   * The nearest living player to a boss's origin.
   *
   * @param boss - The boss.
   * @returns The ship, or `null`.
   */
  nearestPlayer(boss: Boss): PlayerShip | null {
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
    if (entry === null || entry.role !== BossRole.Boss) return false;
    if (this.mainActive || this.warning.active) return false;
    const boss = this.freeSlot();
    if (boss === null) return false;
    const host = this.host;
    this.assign(boss, entry);
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
    if (entry === null) return false;
    if (entry.role === BossRole.Boss && this.mainActive) return false;
    const boss = this.freeSlot();
    if (boss === null) return false;
    this.assign(boss, entry);
    this.enter(boss, true);
    return true;
  }

  /**
   * Gives a slot a boss entry (cold path): its entry, spec index and role, no rush entry.
   *
   * @param boss - The slot.
   * @param entry - The entry.
   */
  private assign(boss: Boss, entry: CompiledBoss): void {
    this.entries[boss.slot] = entry;
    boss.specIndex = entry.specIndex;
    boss.role = entry.role;
    boss.rushEntry = -1;
    boss.partner = -1;
    boss.leader = false;
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

  /**
   * A boss flies in (cold path): its parts from its entry, the intro state, a stage boss's music
   * — and, for the leader of a double boss, its partner in another slot.
   *
   * @param boss - The slot (its entry assigned).
   * @param withPartner - Bring the entry's partner in too.
   * @param fromX - Intro start x (NaN = just past the right edge).
   * @param fromY - Intro start y (NaN = the home row).
   */
  private enter(boss: Boss, withPartner: boolean, fromX = NaN, fromY = NaN): void {
    const entry = this.entries[boss.slot];
    if (entry === null) return;
    const host = this.host;
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
      const radius = source.radius ?? 0;
      part.active = true;
      part.name = source.name;
      part.parent = source.parentIndex;
      part.localX = source.x;
      part.localY = source.y;
      part.restX = source.x;
      part.restY = source.y;
      part.radius = radius > 0 ? radius : 0;
      part.hurtbox = source.hurtbox !== null || part.radius > 0;
      part.hw = source.hurtbox !== null ? source.hurtbox.hw : part.radius;
      part.hh = source.hurtbox !== null ? source.hurtbox.hh : part.radius;
      part.angle = wrapTurn(source.angle ?? 0);
      part.spin = source.spin ?? 0;
      part.worldAngle = 0;
      part.turnFrames = source.turn ?? 0;
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
    // Only an entry during `update()` (a WARNING's end, a partner, an inner boss) waits a tick.
    boss.enterTick = this.updating ? host.tick : -1;
    boss.phase = 0;
    boss.phaseTicks = 0;
    boss.fightTicks = 0;
    boss.timeLimit = entry.timeLimit;
    boss.escaped = false;
    boss.script = null;
    boss.wakeTick = 0;
    boss.motion = BossMotion.Hold;
    boss.afterMove = BossMotion.Hold;
    boss.trackSpeed = 0;
    boss.destroyedMask = 0;
    boss.coreMask = entry.coreMask;
    boss.killer = -1;
    boss.blasted = false;
    boss.resting = false;
    boss.turning = false;
    boss.turnTicks = 0;
    boss.enraged = false;
    boss.enrageFireRate = entry.enrageFireRate;
    boss.enrageSpeed = entry.enrageSpeed;
    boss.raiding = false;
    boss.returning = false;
    boss.raidSegment = 0;
    boss.raidTicks = 0;
    boss.anchored = entry.raidX.length > 0;
    boss.anchorX = host.camera.x;
    boss.anchorY = host.camera.y;
    boss.homeX = entry.homeX;
    boss.homeY = entry.homeY;
    boss.startX = fromX === fromX ? fromX : entry.startX;
    boss.startY = fromY === fromY ? fromY : entry.homeY;
    boss.introTicks = spec.introTicks;
    boss.screenX = spec.introTicks > 0 ? boss.startX : entry.homeX;
    boss.screenY = spec.introTicks > 0 ? boss.startY : entry.homeY;
    this.place(boss);
    // A raid is anchored where it enters: the camera stops there at once (a WARNING has already
    // braked it — then this changes nothing).
    if (boss.anchored && host.stage !== null) host.stage.brake(0);
    if (this.warning.active && boss.role === BossRole.Boss) this.warning.active = false;
    if (boss.role === BossRole.Boss) {
      if (host.status === 'bossWarning') host.status = 'playing';
      host.events.push(SimEventKind.Music, this.bossMusic(), 0, 0, 0);
      this.musicChanged = true;
    }
    if (withPartner && entry.partnerId >= 0) this.enterPartner(boss, entry);
    if (spec.introTicks <= 0) this.startFight(boss);
  }

  /**
   * The partner of a double boss flies in with its leader (cold path): another slot, linked.
   *
   * @param leader - The leader's slot.
   * @param entry - The leader's entry.
   */
  private enterPartner(leader: Boss, entry: CompiledBoss): void {
    const partnerEntry = this.entry(entry.partnerId);
    if (partnerEntry === null) return;
    const mate = this.freeSlot();
    if (mate === null) return;
    this.assign(mate, partnerEntry);
    leader.partner = mate.slot;
    leader.leader = true;
    mate.partner = leader.slot;
    mate.leader = false;
    this.enter(mate, false);
  }

  /**
   * The intro is over: the fight and its first phase start (the script runs this tick); a
   * raid's camera path begins; the follower of an alternating pair withdraws.
   *
   * @param boss - The slot.
   */
  private startFight(boss: Boss): void {
    const entry = this.entries[boss.slot];
    boss.state = BossState.Fight;
    boss.stateTicks = 0;
    boss.fightTicks = 0;
    boss.screenX = boss.homeX;
    boss.screenY = boss.homeY;
    const jump = entry === null || !boss.enraged ? -1 : entry.enragePhase;
    this.startPhase(boss, jump > 0 ? jump : 0, this.host.tick);
    if (entry === null) return;
    if (boss.anchored && entry.raidX.length > 0) this.startRaid(boss);
    const mate = this.mateOf(boss);
    if (mate === null || boss.enraged) return;
    const lead = boss.leader ? entry : this.entries[mate.slot];
    if (lead === null || lead.alternate <= 0) return;
    if (boss.leader) boss.turnTicks = lead.alternate;
    else this.setResting(boss, true);
  }

  /**
   * Starts a phase: its behaviour replaces the running script.
   *
   * @param boss - The slot.
   * @param phase - Phase index.
   * @param wakeTick - Tick its script first runs on.
   */
  private startPhase(boss: Boss, phase: number, wakeTick: number): void {
    const entry = this.entries[boss.slot];
    boss.phase = phase;
    boss.phaseTicks = 0;
    const def = entry === null ? null : entry.behaviors[phase];
    boss.script =
      def === null || entry === null || def === undefined
        ? null
        : def.create(this.apis[boss.slot], entry.params[phase]);
    boss.wakeTick = wakeTick;
  }

  /**
   * Starts an eased move of a boss's origin (the script API's `moveTo`, a pair's turns, an
   * escape).
   *
   * @param boss - The slot.
   * @param x - Target x (relative to the anchor).
   * @param y - Target y.
   * @param ticks - Duration (≤ 0 / NaN = at once).
   * @param after - {@link BossMotion} to take up when it ends.
   */
  startMove(boss: Boss, x: number, y: number, ticks: number, after: number): void {
    boss.afterMove = after;
    if (!(ticks >= 1)) {
      boss.screenX = x;
      boss.screenY = y;
      boss.motion = after;
      boss.turning = false;
      return;
    }
    boss.motion = BossMotion.MoveTo;
    boss.moveFromX = boss.screenX;
    boss.moveFromY = boss.screenY;
    boss.moveToX = x;
    boss.moveToY = y;
    boss.moveTicks = Math.floor(ticks);
    boss.moveElapsed = 0;
  }

  /**
   * A double boss's turn for one of the pair (cold path): withdraw to the rest point, or come
   * back home (its script waits until it is there, then its motion before the turn resumes).
   *
   * @param boss - The slot.
   * @param resting - Withdraw (`true`) or come forward.
   */
  private setResting(boss: Boss, resting: boolean): void {
    if (boss.resting === resting) return;
    const saved = boss.motion === BossMotion.MoveTo ? boss.afterMove : boss.motion;
    boss.resting = resting;
    boss.turning = true;
    if (resting) {
      // Its motion before the turn is kept for the way back (its speeds stay in its fields).
      this.restMotion[boss.slot] = saved;
      this.startMove(boss, BOSS_REST_X, boss.homeY, BOSS_TURN_TICKS, BossMotion.Hold);
    } else {
      this.startMove(boss, boss.homeX, boss.homeY, BOSS_TURN_TICKS, this.restMotion[boss.slot]);
    }
    const parts = boss.parts;
    for (let i = 0; i < boss.partCount; i++) this.host.bullets.detachLasers(parts[i].slot);
  }

  /** See {@link BossSystem.update}. */
  update(): void {
    this.updating = true;
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      const state = boss.state;
      if (state === BossState.Warning) {
        const ticks = boss.stateTicks + 1;
        boss.stateTicks = ticks;
        this.warning.ticks = ticks;
        if (ticks >= WARNING_TICKS) this.enter(boss, true);
        else if (ticks % WARNING_PULSE_TICKS === 0) this.pulse();
      } else if (state === BossState.Intro) {
        if (boss.enterTick === this.host.tick) continue;
        boss.stateTicks++;
        if (boss.stateTicks >= boss.introTicks) this.startFight(boss);
      } else if (state === BossState.Fight) {
        boss.stateTicks++;
        if (!boss.resting) boss.phaseTicks++;
        boss.fightTicks++;
        if (boss.timeLimit > 0 && boss.fightTicks >= boss.timeLimit) {
          this.startEscape(boss);
        } else if (boss.leader && boss.turnTicks > 0 && !boss.enraged) {
          boss.turnTicks--;
          if (boss.turnTicks === 0) this.turn(boss);
        }
      } else if (state === BossState.Dying) {
        this.dyingTick(boss);
      } else if (state === BossState.Escape) {
        boss.stateTicks++;
        if (boss.stateTicks >= BOSS_ESCAPE_TICKS) this.finishEscape(boss);
      }
      if (boss.raiding || boss.returning) this.steerRaid(boss);
    }
    this.updating = false;
    if (this.rushDelay >= 0) this.rushTick();
  }

  /**
   * An alternating pair's turn (the leader's clock ran out; cold path): the fighting one
   * withdraws, the resting one comes forward. A partner still flying in (its intro longer than
   * the turn) does not stop the turns: the leader keeps fighting and tries again a turn later.
   *
   * @param leader - The leader.
   */
  private turn(leader: Boss): void {
    const entry = this.entries[leader.slot];
    if (entry === null) return;
    const mate = this.mateOf(leader);
    if (mate === null || mate.enraged) return;
    leader.turnTicks = entry.alternate;
    if (mate.state !== BossState.Fight) return;
    const leaderRests = !leader.resting;
    this.setResting(leader, leaderRests);
    this.setResting(mate, !leaderRests);
  }

  /**
   * The boss rush's clock (M2-09): counts the wait down while no main boss runs, then brings the
   * current entry.
   */
  private rushTick(): void {
    if (this.mainInPlay(null, true)) return;
    if (this.rushDelay > 0) {
      this.rushDelay--;
      return;
    }
    const index = this.rushIndex;
    this.rushDelay = -1;
    if (index >= this.rushEnemy.length) return;
    const enemy = this.rushEnemy[index];
    const started =
      this.rushWarning[index] !== 0 ? this.startWarning(enemy) : this.startBoss(enemy);
    if (!started) {
      // A broken entry is skipped (only possible without validation).
      this.advanceRush();
      return;
    }
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      if (
        boss.specIndex === enemy &&
        boss.role === BossRole.Boss &&
        boss.state !== BossState.Dead
      ) {
        boss.rushEntry = index;
      }
    }
  }

  /**
   * The current rush entry is over: the next one waits its delay, or — after the last — the
   * stage is clear.
   *
   * @returns `true` when another entry comes (the stage is not clear yet).
   */
  private advanceRush(): boolean {
    const n = this.rushEnemy.length;
    if (this.rushIndex < n) this.rushIndex++;
    if (this.rushIndex < n) {
      this.rushDelay = this.rushWait[this.rushIndex];
      return true;
    }
    this.rushDelay = -1;
    return false;
  }

  /** One tick of a boss's death sequence (cold path: at most once per tick and slot while dying). */
  private dyingTick(boss: Boss): void {
    const ticks = boss.stateTicks + 1;
    boss.stateTicks = ticks;
    if (boss.role === BossRole.Captain) {
      if (ticks < CAPTAIN_CHAIN_TICKS) {
        if (ticks % BOSS_CHAIN_INTERVAL === 0) this.chainExplosion(boss);
      } else if (ticks === CAPTAIN_CHAIN_TICKS) {
        this.captainBlast(boss);
      }
      if (ticks === CAPTAIN_TALLY_TICKS) this.tally(boss);
      if (ticks >= CAPTAIN_CLEAR_TICKS) this.finish(boss);
      return;
    }
    if (ticks < BOSS_CHAIN_TICKS) {
      if (ticks % BOSS_CHAIN_INTERVAL === 0) this.chainExplosion(boss);
    } else if (ticks === BOSS_CHAIN_TICKS) {
      this.finalBlast(boss);
    }
    if (ticks === BOSS_TALLY_TICKS) this.tally(boss);
    if (ticks >= BOSS_CLEAR_TICKS) this.finish(boss);
  }

  /**
   * One explosion of the death chain at a random point of a random part (cosmetic RNG).
   *
   * @param boss - The dying boss.
   */
  private chainExplosion(boss: Boss): void {
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

  /**
   * The final blast: the boss vanishes in a big explosion, flash, shake, rumble, hit-stop — and
   * its inner boss, if any, is revealed (a raid's camera is home by now: its return took the
   * whole chain).
   *
   * @param boss - The dying boss.
   */
  private finalBlast(boss: Boss): void {
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
    const entry = this.entries[boss.slot];
    if (entry !== null && entry.innerId >= 0) this.revealInner(boss, entry.innerId);
  }

  /**
   * A captain's smaller blast: a large explosion and a medium shake — no flash, no hit-stop.
   *
   * @param boss - The dying captain.
   */
  private captainBlast(boss: Boss): void {
    const host = this.host;
    boss.blasted = true;
    const x = Math.floor(boss.x) | 0;
    const y = Math.floor(boss.y) | 0;
    host.events.push(SimEventKind.Particles, FX_CUES.ExplosionLarge, x, y, 1);
    host.events.push(SimEventKind.Particles, FX_CUES.BossChain, x, y, 1);
    host.events.push(SimEventKind.Sfx, SFX_CUES.BossExplode, x, y, 0);
    requestShake(host, ShakeMagnitude.Medium, CAPTAIN_BLAST_SHAKE_TICKS);
  }

  /**
   * The boss inside a boss (cold path): the inner one flies from the outer's first standing-or-
   * not core (its origin without one) to its home, in another slot.
   *
   * @param outer - The blasted boss.
   * @param innerId - The inner boss's enemy index.
   */
  private revealInner(outer: Boss, innerId: number): void {
    const entry = this.entry(innerId);
    if (entry === null) return;
    const slot = this.freeSlot();
    if (slot === null) return;
    const camera = this.host.camera;
    let fromX = outer.x - camera.x;
    let fromY = outer.y - camera.y;
    const parts = outer.parts;
    for (let i = 0; i < outer.partCount; i++) {
      if (!parts[i].core) continue;
      fromX = parts[i].x - camera.x;
      fromY = parts[i].y - camera.y;
      break;
    }
    this.assign(slot, entry);
    slot.rushEntry = outer.rushEntry;
    this.enter(slot, true, fromX, fromY);
  }

  /**
   * The score tally: the boss's points to its killer, the defeat event, the stage-clear jingle
   * when this ends the encounter.
   *
   * @param boss - The dying boss.
   */
  private tally(boss: Boss): void {
    const host = this.host;
    const entry = this.entries[boss.slot];
    const points = entry === null || boss.killer < 0 ? 0 : entry.spec.score;
    if (points > 0) addScore(host, boss.killer, points);
    host.events.push(
      SimEventKind.BossDefeated,
      boss.specIndex,
      Math.floor(boss.x) | 0,
      Math.floor(boss.y) | 0,
      points,
    );
    if (boss.role !== BossRole.Boss || this.mainInPlay(boss, false)) return;
    if (this.rushEnemy.length > 0 && this.rushIndex < this.rushEnemy.length - 1) return;
    host.events.push(SimEventKind.Music, MUSIC_CUES.StageClear, 0, 0, 0);
  }

  /**
   * The end of a death sequence: the slot is `Dead`; the last stage boss of the encounter
   * releases the scroll lock and clears the stage (or brings the next rush boss).
   *
   * @param boss - The boss.
   */
  private finish(boss: Boss): void {
    boss.state = BossState.Dead;
    // A raid's camera ends its own return (the tick after it is home).
    if (boss.raiding) this.endRaid(boss);
    this.unlink(boss);
    this.encounterEnd(boss);
  }

  /**
   * After a stage boss's death or escape: when no other stage boss is in play, the lock is
   * released and the stage is clear — unless a boss rush has more to come.
   *
   * @param boss - The boss that ended.
   */
  private encounterEnd(boss: Boss): void {
    if (boss.role !== BossRole.Boss || this.mainInPlay(boss, true)) return;
    const host = this.host;
    const stage = host.stage;
    if (stage !== null) stage.unlock();
    if (this.rushEnemy.length > 0 && this.advanceRush()) return;
    if (host.status === 'playing' || host.status === 'bossWarning') host.status = 'stageClear';
  }

  /**
   * The time limit ran out (cold path): the boss stops fighting and flies off (its partner with
   * it); a raid's camera eases back.
   *
   * @param boss - The fighting boss.
   */
  private startEscape(boss: Boss): void {
    boss.state = BossState.Escape;
    boss.stateTicks = 0;
    boss.script = null;
    boss.resting = false;
    boss.turning = false;
    const parts = boss.parts;
    for (let i = 0; i < parts.length; i++) {
      parts[i].target = false;
      this.host.bullets.detachLasers(parts[i].slot);
    }
    // Off past the right edge: the entry's intro start — not `boss.startX`, which is where an
    // inner boss was revealed (on screen).
    const entry = this.entries[boss.slot];
    const offX = entry === null ? boss.startX : entry.startX;
    this.startMove(boss, offX, boss.screenY, BOSS_ESCAPE_TICKS, BossMotion.Hold);
    if (boss.raiding) this.startReturn(boss, BOSS_ESCAPE_TICKS);
    if (boss.role === BossRole.Boss && !this.mainInPlay(boss, false)) {
      this.host.events.push(SimEventKind.Music, MUSIC_CUES.Silence, 0, 0, BOSS_MUSIC_FADE_TICKS);
    }
    const mate = this.mateOf(boss);
    if (mate !== null && (mate.state === BossState.Fight || mate.state === BossState.Intro)) {
      this.startEscape(mate);
    }
  }

  /**
   * A double boss's partner, while the pair is still linked both ways (M2-09).
   *
   * @param boss - One of the pair.
   * @returns The partner, or `null` (none, or its slot has ended and been handed to another boss).
   */
  private mateOf(boss: Boss): Boss | null {
    const partner = boss.partner;
    if (partner < 0) return null;
    const mate = this.slots[partner];
    return mate !== undefined && mate.partner === boss.slot ? mate : null;
  }

  /**
   * A boss's slot has ended (death sequence over or escaped; cold path): the pair's link is cut
   * both ways, so the survivor never touches whatever boss takes the slot next.
   *
   * @param boss - The ended boss.
   */
  private unlink(boss: Boss): void {
    const mate = this.mateOf(boss);
    if (mate !== null) mate.partner = -1;
    boss.partner = -1;
  }

  /**
   * An escape is over (cold path): the slot is `Dead` (escaped), a stage boss sets
   * {@link EndingFlag}.BossEscaped and ends the encounter like a death (no tally).
   *
   * @param boss - The escaping boss.
   */
  private finishEscape(boss: Boss): void {
    const host = this.host;
    boss.state = BossState.Dead;
    boss.escaped = true;
    if (boss.raiding) this.endRaid(boss);
    this.unlink(boss);
    host.events.push(
      SimEventKind.BossEscaped,
      boss.specIndex,
      Math.floor(boss.x) | 0,
      Math.floor(boss.y) | 0,
      0,
    );
    if (boss.role === BossRole.Boss)
      host.endingFlags = (host.endingFlags | EndingFlag.BossEscaped) >>> 0;
    this.encounterEnd(boss);
  }

  /**
   * A raid's fight starts (cold path): the camera is locked where it is and follows the raid's
   * segments from now on.
   *
   * @param boss - The raid boss.
   */
  private startRaid(boss: Boss): void {
    const host = this.host;
    const camera = host.camera;
    boss.raiding = true;
    boss.returning = false;
    boss.raidSegment = 0;
    boss.raidTicks = 0;
    boss.raidFromX = camera.x - boss.x;
    boss.raidFromY = camera.y - boss.y;
    boss.raidHomeX = camera.x;
    boss.raidHomeY = camera.y;
    const target = this.raidCamera;
    target.x = camera.x;
    target.y = camera.y;
    const stage = host.stage;
    if (stage !== null) {
      stage.brake(0);
      stage.follow(target);
    } else {
      this.steering = true;
    }
  }

  /**
   * A raid's camera starts easing back to where the raid began (death or escape).
   *
   * @param boss - The raid boss.
   * @param ticks - Length of the return.
   */
  private startReturn(boss: Boss, ticks: number): void {
    const camera = this.host.camera;
    boss.raiding = false;
    boss.returning = true;
    boss.raidTicks = 0;
    boss.raidReturnTicks = ticks;
    boss.raidFromX = camera.x;
    boss.raidFromY = camera.y;
  }

  /**
   * The raid is over: the camera stops following (it is back where the raid began).
   *
   * @param boss - The raid boss.
   */
  private endRaid(boss: Boss): void {
    boss.raiding = false;
    boss.returning = false;
    const host = this.host;
    const stage = host.stage;
    if (stage !== null) {
      stage.follow(null);
    } else if (this.steering) {
      this.steering = false;
      host.camera.vx = 0;
      host.camera.vy = 0;
    }
  }

  /**
   * Phase 3: moves a raid's camera target — along its segments (boss-relative) or back home —
   * and, in free flight, steers the camera's velocity to it. Never allocates.
   *
   * @param boss - The raid boss.
   */
  private steerRaid(boss: Boss): void {
    const target = this.raidCamera;
    const ticks = boss.raidTicks + 1;
    boss.raidTicks = ticks;
    if (boss.returning) {
      const total = boss.raidReturnTicks;
      if (ticks > total) {
        // Home since the last tick: the camera is the stage's again.
        this.endRaid(boss);
        return;
      }
      const u = total > 0 && ticks < total ? ticks / total : 1;
      // `EASINGS.inOutQuad` written out.
      const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
      // Exactly home at the end (the stage's timeline resumes from there — `follow`).
      target.x = u >= 1 ? boss.raidHomeX : boss.raidFromX + (boss.raidHomeX - boss.raidFromX) * e;
      target.y = u >= 1 ? boss.raidHomeY : boss.raidFromY + (boss.raidHomeY - boss.raidFromY) * e;
    } else {
      const entry = this.entries[boss.slot];
      if (entry === null) return;
      const n = entry.raidX.length;
      const seg = boss.raidSegment;
      const move = entry.raidTicks[seg];
      const toX = entry.raidX[seg];
      const toY = entry.raidY[seg];
      let ox = toX;
      let oy = toY;
      if (move > 0 && ticks < move) {
        const u = ticks / move;
        const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        ox = boss.raidFromX + (toX - boss.raidFromX) * e;
        oy = boss.raidFromY + (toY - boss.raidFromY) * e;
      }
      target.x = boss.x + ox;
      target.y = boss.y + oy;
      if (ticks >= move + entry.raidHold[seg]) {
        const last = seg >= n - 1;
        if (!last || entry.raidLoop) {
          boss.raidFromX = toX;
          boss.raidFromY = toY;
          boss.raidSegment = last ? 0 : seg + 1;
          boss.raidTicks = 0;
        } else {
          boss.raidTicks = move + entry.raidHold[seg];
        }
      }
    }
    if (this.steering) {
      const camera = this.host.camera;
      camera.vx = target.x - camera.x;
      camera.vy = target.y - camera.y;
    }
  }

  /** See {@link BossSystem.runScript}. */
  runScript(): void {
    const tick = this.host.tick;
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      if (boss.state !== BossState.Fight || boss.script === null) continue;
      if (boss.resting || boss.turning || boss.wakeTick > tick) continue;
      resumeScript(boss, tick);
    }
  }

  /** See {@link BossSystem.move}. */
  move(): void {
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      const state = boss.state;
      if (
        state === BossState.Intro ||
        state === BossState.Fight ||
        state === BossState.Dying ||
        state === BossState.Escape
      ) {
        this.moveBoss(boss);
      }
    }
  }

  /**
   * Phase 5 for one boss in play (see {@link BossSystem.move}).
   *
   * @param boss - The boss.
   */
  private moveBoss(boss: Boss): void {
    const state = boss.state;
    if (state === BossState.Intro) {
      const total = boss.introTicks;
      const u = total > 0 && boss.stateTicks < total ? boss.stateTicks / total : 1;
      const v = 1 - u;
      // `EASINGS.outCubic` written out (no fractional call arguments or results).
      const e = 1 - v * v * v;
      boss.screenX = boss.startX + (boss.homeX - boss.startX) * e;
      boss.screenY = boss.startY + (boss.homeY - boss.startY) * e;
    } else if (state === BossState.Fight || state === BossState.Escape) {
      const motion = boss.motion;
      if (motion === BossMotion.Track) {
        const target = this.nearestPlayer(boss);
        if (target !== null) {
          const anchorY = boss.anchored ? boss.anchorY : this.host.camera.y;
          let goal = target.y - anchorY;
          if (goal < boss.trackMin) goal = boss.trackMin;
          else if (goal > boss.trackMax) goal = boss.trackMax;
          const d = goal - boss.screenY;
          const speed = boss.trackSpeed * (boss.enraged ? boss.enrageSpeed : 1);
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
        if (u >= 1) {
          boss.motion = boss.afterMove;
          boss.afterMove = BossMotion.Hold;
          boss.turning = false;
        }
      } else if (motion === BossMotion.Orbit) {
        const a = wrapTurn(
          boss.orbitAngle + boss.orbitSpeed * (boss.enraged ? boss.enrageSpeed : 1),
        );
        boss.orbitAngle = a;
        const i = a | 0;
        boss.screenX = boss.orbitX + SIN[i + ANGLE_QUARTER] * boss.orbitRX;
        boss.screenY = boss.orbitY + SIN[i] * boss.orbitRY;
      }
    }
    const spinning = state !== BossState.Dying;
    const parts = boss.parts;
    if (spinning) {
      for (let i = 0; i < boss.partCount; i++) {
        const part = parts[i];
        if (part.spin !== 0) part.angle = wrapTurn(part.angle + part.spin);
      }
    }
    this.place(boss);
    const tick = this.host.tick;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      if (part.flashTicks > 0) part.flashTicks--;
      const turn = part.turnFrames;
      if (turn > 1) {
        // `turnedFrame` written out (a fractional argument to a call V8 does not inline is boxed).
        part.frame = (((part.worldAngle * turn) / ANGLE_UNITS + 0.5) | 0) % turn;
      } else {
        const frames = part.animFrames;
        part.frame = frames > 1 ? Math.floor(tick / part.animTicks) % frames : 0;
      }
    }
  }

  /**
   * Puts a boss's origin at its anchor (the camera, or a raid's world point) + its position and
   * every part after its parent: the parent's centre + the local offset turned by the parent's
   * world angle (a part's world angle is its parent's plus its own).
   *
   * @param boss - The boss.
   */
  private place(boss: Boss): void {
    const camera = this.host.camera;
    const anchored = boss.anchored;
    const x = (anchored ? boss.anchorX : camera.x) + boss.screenX;
    const y = (anchored ? boss.anchorY : camera.y) + boss.screenY;
    boss.x = x;
    boss.y = y;
    // A raid's parts fire only from the view (+ the margin): whole-view bounds once per boss.
    const left = camera.x - BOSS_FIRE_MARGIN;
    const top = camera.y - BOSS_FIRE_MARGIN;
    const parts = boss.parts;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      const parent = part.parent;
      if (parent >= 0) {
        const p = parts[parent];
        const turn = p.worldAngle;
        if (turn === 0) {
          part.x = p.x + part.localX;
          part.y = p.y + part.localY;
        } else {
          const k = turn | 0;
          const sin = SIN[k];
          const cos = SIN[k + ANGLE_QUARTER];
          part.x = p.x + part.localX * cos - part.localY * sin;
          part.y = p.y + part.localX * sin + part.localY * cos;
        }
        const world = turn + part.angle;
        part.worldAngle = world >= ANGLE_UNITS ? world - ANGLE_UNITS : world;
      } else {
        part.x = x + part.localX;
        part.y = y + part.localY;
        part.worldAngle = part.angle;
      }
      if (anchored) {
        const vx = part.x - left;
        const vy = part.y - top;
        part.inView =
          vx >= 0 &&
          vx <= PLAYFIELD_W + 2 * BOSS_FIRE_MARGIN &&
          vy >= 0 &&
          vy <= PLAYFIELD_H + 2 * BOSS_FIRE_MARGIN;
      } else {
        part.inView = true;
      }
    }
  }

  /**
   * Whether a part cannot take damage now (the rules of {@link BossSystem.isArmoured}).
   *
   * @param boss - Its boss.
   * @param part - The part.
   * @returns `true` when a hit clinks.
   */
  private armouredNow(boss: Boss, part: BossPart): boolean {
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
    if (!(index >= 0 && index < BOSS_PART_SLOTS && index % 1 === 0)) return false;
    const part = this.parts[index];
    return this.armouredNow(this.slots[part.owner], part);
  }

  /** See {@link BossSystem.insertColliders}. */
  insertColliders(grid: SpatialGrid): void {
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      const state = boss.state;
      const fighting = (state === BossState.Intro || state === BossState.Fight) && !boss.resting;
      const parts = boss.parts;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const target = fighting && part.active && part.hurtbox && !part.destroyed;
        part.target = target;
        part.armoured = target && this.armouredNow(boss, part);
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
  }

  /** See {@link BossSystem.collidePlayers}. */
  collidePlayers(): void {
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      if (boss.state !== BossState.Intro && boss.state !== BossState.Fight) continue;
      if (boss.resting) continue;
      this.touch(boss);
    }
  }

  /**
   * The ships against one boss's target parts (see {@link BossSystem.collidePlayers}).
   *
   * @param boss - The boss.
   */
  private touch(boss: Boss): void {
    const host = this.host;
    const players = host.players;
    const base = host.ship.hurtRadius;
    const parts = boss.parts;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (!ship.active || ship.state !== 'alive') continue;
      const sx = ship.x;
      const sy = ship.y;
      // Reduce shrinks the hurt circle (`core/shields`, M2-04).
      const r = base * ship.shield.hurtScale;
      for (let i = 0; i < boss.partCount; i++) {
        const part = parts[i];
        if (!part.target) continue;
        let hit: boolean;
        const radius = part.radius;
        if (radius > 0) {
          // Circle against circle (M2-09: turned parts are hit as circles).
          const dx = sx - part.x;
          const dy = sy - part.y;
          const reach = r + radius;
          hit = dx * dx + dy * dy <= reach * reach;
        } else {
          // `circleAabb` inlined (closed: touching counts), no fractional call arguments.
          const ox = Math.abs(sx - part.x) - part.hw;
          const oy = Math.abs(sy - part.y) - part.hh;
          const dx = ox > 0 ? ox : 0;
          const dy = oy > 0 ? oy : 0;
          hit = dx * dx + dy * dy <= r * r;
        }
        if (hit && playerHit(ship, PlayerHitCause.Contact, host.tick, host.debugFlags)) break;
      }
    }
  }

  /** See {@link BossSystem.damagePart}. */
  damagePart(index: number, amount: number, by: number): number {
    if (!(index >= 0 && index < BOSS_PART_SLOTS && index % 1 === 0)) return BossHit.None;
    const part = this.parts[index];
    const boss = this.slots[part.owner];
    const state = boss.state;
    if ((state !== BossState.Intro && state !== BossState.Fight) || !part.active || boss.resting) {
      return BossHit.None;
    }
    if (part.destroyed) return BossHit.None;
    if (this.armouredNow(boss, part)) return BossHit.Clink;
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
    this.destroyPart(boss, part.index, by);
    return BossHit.Destroyed;
  }

  /**
   * Destroys a part and every part attached below it (cold path), credits their points, then
   * starts the death sequence when no core is left.
   *
   * @param boss - Its boss.
   * @param index - The part's index in its boss.
   * @param by - Player slot credited (-1 = nobody).
   */
  private destroyPart(boss: Boss, index: number, by: number): void {
    const parts = boss.parts;
    let cascade = 0;
    for (let i = index; i < boss.partCount; i++) {
      const part = parts[i];
      if (part.destroyed) continue;
      if (i !== index && (part.parent < 0 || (cascade & (1 << part.parent)) === 0)) continue;
      cascade |= 1 << i;
      this.destroyOne(boss, part, by);
    }
    if ((boss.destroyedMask & boss.coreMask) === boss.coreMask) this.startDeath(boss, by);
  }

  /**
   * One part goes: destroyed, its explosion, its points, its lasers stop.
   *
   * @param boss - Its boss.
   * @param part - The part.
   * @param by - Player slot credited.
   */
  private destroyOne(boss: Boss, part: BossPart, by: number): void {
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
   * The last core is gone: the death sequence starts (cold path); the partner of a double boss
   * enrages; a raid's camera eases back.
   *
   * @param boss - The boss.
   * @param by - Player slot credited with the kill.
   */
  private startDeath(boss: Boss, by: number): void {
    const host = this.host;
    boss.state = BossState.Dying;
    boss.stateTicks = 0;
    boss.killer = by;
    boss.script = null;
    boss.motion = BossMotion.Hold;
    boss.resting = false;
    boss.turning = false;
    const parts = boss.parts;
    for (let i = 0; i < parts.length; i++) {
      parts[i].target = false;
      host.bullets.detachLasers(parts[i].slot);
    }
    // The bullets turn into points for the killer (M2-02); nobody's kill only sparkles.
    host.bullets.cancelAll(CancelMode.Points, by);
    const captain = boss.role === BossRole.Captain;
    const entry = this.entries[boss.slot];
    const inner = entry !== null && entry.innerId >= 0;
    if (!captain && !inner && !this.mainInPlay(boss, false)) {
      host.events.push(SimEventKind.Music, MUSIC_CUES.Silence, 0, 0, BOSS_MUSIC_FADE_TICKS);
    }
    requestShake(host, ShakeMagnitude.Small, captain ? CAPTAIN_CHAIN_TICKS : BOSS_CHAIN_TICKS);
    if (boss.raiding) this.startReturn(boss, RAID_RETURN_TICKS);
    const mate = this.mateOf(boss);
    if (mate !== null) this.enrage(mate);
  }

  /**
   * A double boss's survivor enrages (cold path): it comes forward for good, its turns stop,
   * its intervals and motion speed up (`enrage`) and it may jump to its enrage phase.
   *
   * @param boss - The surviving partner.
   */
  private enrage(boss: Boss): void {
    const state = boss.state;
    if ((state !== BossState.Intro && state !== BossState.Fight) || boss.enraged) return;
    boss.enraged = true;
    boss.turnTicks = 0;
    if (boss.resting) this.setResting(boss, false);
    const entry = this.entries[boss.slot];
    if (state !== BossState.Fight || entry === null) return;
    const jump = entry.enragePhase;
    if (jump > boss.phase && jump < entry.behaviors.length) {
      this.startPhase(boss, jump, this.host.tick + 1);
    }
  }

  /**
   * The cores' total remaining hit points.
   *
   * @param boss - The boss.
   * @returns The sum (destroyed cores count 0).
   */
  private coreHp(boss: Boss): number {
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
   * @param boss - The boss.
   * @param entry - Its entry.
   * @param phase - The phase.
   * @returns `true` when it ends.
   */
  private phaseOver(boss: Boss, entry: CompiledBoss, phase: number): boolean {
    const hp = entry.untilHp[phase];
    if (hp > 0 && this.coreHp(boss) < hp) return true;
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
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      const entry = this.entries[s];
      if (boss.state !== BossState.Fight || entry === null) continue;
      const last = entry.behaviors.length - 1;
      while (boss.phase < last && this.phaseOver(boss, entry, boss.phase)) {
        this.startPhase(boss, boss.phase + 1, this.host.tick + 1);
      }
    }
  }

  /** See {@link BossSystem.defeat}. */
  defeat(by = -1): boolean {
    let defeated = false;
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      if (boss.state !== BossState.Intro && boss.state !== BossState.Fight) continue;
      const parts = boss.parts;
      for (let i = 0; i < boss.partCount; i++) {
        if (boss.state !== BossState.Intro && boss.state !== BossState.Fight) break;
        const part = parts[i];
        if (part.core && !part.destroyed) this.destroyPart(boss, i, by);
      }
      const after: number = boss.state;
      if (after === BossState.Dying) defeated = true;
    }
    return defeated;
  }

  /** See {@link BossSystem.clear}. */
  clear(): void {
    const host = this.host;
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      if (boss.raiding || boss.returning) this.endRaid(boss);
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
      boss.resting = false;
      boss.turning = false;
      boss.enraged = false;
      boss.partner = -1;
      boss.leader = false;
      boss.anchored = false;
      boss.rushEntry = -1;
      this.entries[s] = null;
    }
    // The current rush entry comes again (it was not beaten).
    if (this.rushIndex < this.rushEnemy.length) this.rushDelay = this.rushWait[this.rushIndex];
    this.warning.active = false;
    this.batch.count = 0;
    this.backBatch.count = 0;
    const bar = this.hpBar;
    bar.visible = false;
    bar.hp = 0;
    bar.maxHp = 0;
    bar.bosses = 0;
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
    const front = this.batch;
    const back = this.backBatch;
    front.count = 0;
    back.count = 0;
    const slots = this.slots;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      const state = boss.state;
      if (
        (state !== BossState.Intro &&
          state !== BossState.Fight &&
          state !== BossState.Dying &&
          state !== BossState.Escape) ||
        boss.blasted
      ) {
        continue;
      }
      this.draw(boss, boss.resting ? back : front);
    }
    this.syncHpBar();
  }

  /**
   * Appends a boss's standing, drawn parts to a batch (see {@link BossSystem.sync}).
   *
   * @param boss - The boss.
   * @param batch - The batch.
   */
  private draw(boss: Boss, batch: SpriteBatch): void {
    const blink = boss.state === BossState.Dying && (boss.stateTicks & 4) !== 0;
    const parts = boss.parts;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      if (part.destroyed || part.spriteId < 0) continue;
      const slot = batch.count;
      if (slot >= batch.capacity) return;
      // `pushSprite` inlined (fractional x / y arguments would be boxed if not inlined).
      batch.x[slot] = part.x;
      batch.y[slot] = part.y;
      batch.spriteId[slot] = part.spriteId;
      batch.frame[slot] = part.frame;
      batch.flags[slot] = part.flashTicks > 0 || blink ? SpriteFlag.Flash : 0;
      batch.count = slot + 1;
    }
  }

  /** Refreshes {@link BossSystem.hpBar} (see {@link BossHpBar}). Never allocates. */
  private syncHpBar(): void {
    const slots = this.slots;
    let main = false;
    for (let s = 0; s < slots.length; s++) {
      if (slots[s].role === BossRole.Boss && this.barCounts(slots[s])) main = true;
    }
    const role = main ? BossRole.Boss : BossRole.Captain;
    let hp = 0;
    let max = 0;
    let count = 0;
    for (let s = 0; s < slots.length; s++) {
      const boss = slots[s];
      const entry = this.entries[s];
      if (boss.role !== role || entry === null || !this.barCounts(boss)) continue;
      count++;
      const mask = entry.barMask;
      const parts = boss.parts;
      let left = 0;
      let full = 0;
      for (let i = 0; i < boss.partCount; i++) {
        if ((mask & (1 << i)) === 0) continue;
        const part = parts[i];
        full += part.maxHp;
        if (!part.destroyed && part.hp > 0) left += part.hp;
      }
      max += full;
      if (boss.state === BossState.Intro) {
        const total = boss.introTicks;
        hp += total > 0 ? Math.floor((full * boss.stateTicks) / total) : full;
      } else if (boss.state !== BossState.Dying) {
        hp += left;
      }
    }
    const bar = this.hpBar;
    bar.visible = count > 0;
    bar.hp = hp;
    bar.maxHp = max;
    bar.bosses = count;
  }

  /**
   * Whether a boss counts for the HP bar: in its intro, fight or escape, or dying before its
   * blast.
   *
   * @param boss - The slot.
   * @returns `true` when counted.
   */
  private barCounts(boss: Boss): boolean {
    const state = boss.state;
    return (
      state === BossState.Intro ||
      state === BossState.Fight ||
      state === BossState.Escape ||
      (state === BossState.Dying && !boss.blasted)
    );
  }
}

/**
 * Creates the boss system of a World (load time): the {@link MAX_BOSSES} slots with their parts,
 * the script APIs, the parts' batches, the WARNING state, the HP bar, the raid camera target,
 * every boss entry of the content compiled (its WARNING text built from {@link WARNING_TEMPLATE})
 * and the stage's boss rush.
 *
 * @param host - The World (read at every call — pass the World itself).
 * @param behaviors - Boss behaviour lookup (`core/behaviors` `DEFAULT_BOSS_BEHAVIORS`); a phase
 *   whose script it does not know runs no script (content validation reports it).
 * @param stage - The World's stage (its `rush` list — M2-09), or `null` / omitted (no rush).
 * @returns The system (no boss yet; a boss rush waits its first delay).
 *
 * @example
 * ```ts
 * const bosses = createBossSystem(world, DEFAULT_BOSS_BEHAVIORS, stageSpec);
 * bosses.startBoss(db.enemyIndex.get('test-boss')!);
 * ```
 */
export function createBossSystem(
  host: BossHost,
  behaviors: BossBehaviorLookup,
  stage: StageSpec | null = null,
): BossSystem {
  return new BossSystemImpl(host, behaviors, stage);
}
