/**
 * # shields — shields
 *
 * **Status: partial.** Meter mode's **Force Field** (the `?` slot of Type A) is implemented (plan
 * M1-11): a hit counter, visible wear, short shield-hit i-frames and hit / break records. The
 * other meter shields (front pods, Free Shield, Rotate Shield, Reduce) arrive with M2-04, the
 * Direct-mode Arm tiers with M2-05.
 *
 * **Responsibility.** Shields for both models. Meter mode (`?` slot): Force Field, front Shield
 * pods, Free Shield, Rotate Shield, Reduce (shrinks the hurtbox, not the terrain box). Direct mode
 * (blue items): Arm → Super Arm → Hyper Arm tiers (3/4/5 hits) that also absorb enemy contact and
 * terrain. Hit counters, visible wear, short shield-hit i-frames and break events.
 *
 * **The Force Field** ({@link FORCE_FIELD}): {@link FORCE_FIELD_HITS} (5) hits; it absorbs enemy
 * bullets, lasers and enemy contact but **not terrain** (`absorbsTerrain: false`, decision D8).
 * Every absorbed hit costs one hit and starts {@link SHIELD_HIT_IFRAMES} (8) ticks of shield-hit
 * i-frames (decision D33), during which further absorbable hits are swallowed for free — one
 * bullet cluster cannot drain it at once. The hit that takes the last point breaks it; its
 * i-frames still cover the bare ship (not against terrain), so the break is survivable.
 *
 * **Where it acts.** Every ship carries one {@link ShieldState} (`PlayerShip.shield`, created with
 * the ship). `core/player` `playerHit` — the one entry point of every hit — asks
 * {@link absorbShieldHit} first; an absorbed hit is "accepted" (the bullet is used up) but never
 * reaches the ship. `core/powerups` grants the shield (the `?` slot), counts the i-frames down
 * ({@link tickShield}, tick phase 7), turns the tick's hit / break records into presentation
 * events (tick phase 7) and draws it ({@link shieldWearFrame}).
 *
 * **Zero allocation.** A state is a class instance with number fields; the functions only write
 * them.
 *
 * **Implements.**
 * - shmup_feat.md §9 Shields — Force Field (`?` slot), hit counter per shield, visible wear state,
 *   break SFX/effect, shield-hit i-frames; the Force Field does not absorb terrain (decision D8)
 *
 * **Public API.** {@link ShieldKind}, {@link SHIELD_KIND_NAMES}, {@link ShieldState},
 * {@link createShieldState}, {@link ShieldSpec}, {@link FORCE_FIELD}, {@link SHIELD_SPECS},
 * {@link grantShield}, {@link clearShield}, {@link absorbShieldHit}, {@link ShieldHit},
 * {@link tickShield}, {@link shieldActive}, {@link shieldWearFrame}, {@link FORCE_FIELD_HITS},
 * {@link SHIELD_HIT_IFRAMES}, {@link FORCE_FIELD_SPRITE}, {@link FORCE_FIELD_WEAR_FRAMES}.
 *
 * **Planned API.** Front pods, Free / Rotate Shield and Reduce (M2-04); the Arm tiers with
 * repair (M2-05).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'shields',
  status: 'partial',
  specRefs: ['shmup_feat.md §9'],
});

/** Shield variants (numeric codes, hashed: append, never renumber). */
export const ShieldKind = {
  /** No shield. */
  None: 0,
  /** The meter-mode Force Field (`?` slot, Type A). */
  ForceField: 1,
} as const;

/** A {@link ShieldKind} code. */
export type ShieldKind = (typeof ShieldKind)[keyof typeof ShieldKind];

/** Names of the {@link ShieldKind} codes, by code (debug overlays, logs). */
export const SHIELD_KIND_NAMES: readonly string[] = Object.freeze(['none', 'forceField']);

/** Hits a fresh Force Field absorbs (plan M1-11; the arcade's ~6, the SNES's 3). */
export const FORCE_FIELD_HITS = 5;

/** Shield-hit i-frames: ticks after an absorbed hit during which further hits are free (D33). */
export const SHIELD_HIT_IFRAMES = 8;

/** The Force Field's sprite (an engine sprite — see core `world` `ENGINE_SPRITES`). */
export const FORCE_FIELD_SPRITE = 'shields/force-field';

/** Wear frames of {@link FORCE_FIELD_SPRITE}: fresh, worn, damaged, critical. */
export const FORCE_FIELD_WEAR_FRAMES = 4;

/** Tunables of one shield kind (built in until the shield variants of M2-04 bring data). */
export interface ShieldSpec {
  /** The kind. */
  readonly kind: ShieldKind;
  /** Hits a fresh shield absorbs. */
  readonly maxHits: number;
  /** Shield-hit i-frames after each absorbed hit. */
  readonly iFrames: number;
  /** Whether terrain contact is absorbed too (Direct-mode Arm: yes; Force Field: no — D8). */
  readonly absorbsTerrain: boolean;
  /** Sprite name. */
  readonly sprite: string;
  /** Wear frames of the sprite (frame 0 = fresh). */
  readonly wearFrames: number;
}

/** The Force Field (plan M1-11). */
export const FORCE_FIELD: ShieldSpec = Object.freeze({
  kind: ShieldKind.ForceField,
  maxHits: FORCE_FIELD_HITS,
  iFrames: SHIELD_HIT_IFRAMES,
  absorbsTerrain: false,
  sprite: FORCE_FIELD_SPRITE,
  wearFrames: FORCE_FIELD_WEAR_FRAMES,
});

/** Shield specs by {@link ShieldKind} code (`null` for `None`). */
export const SHIELD_SPECS: readonly (ShieldSpec | null)[] = Object.freeze([null, FORCE_FIELD]);

/**
 * The shield of one ship (a class, so its numeric fields stay unboxed). `kind` `None` = no shield;
 * the i-frames may outlive the shield by a few ticks after it broke.
 */
export class ShieldState {
  /** {@link ShieldKind} code. */
  kind: ShieldKind = ShieldKind.None;
  /** Hits left (0 = none). */
  hits = 0;
  /** Hits of the fresh shield (wear is `hits / maxHits`). */
  maxHits = 0;
  /** Remaining shield-hit i-frames. */
  iFrames = 0;
  /** Whether terrain contact is absorbed (copied from the spec). */
  absorbsTerrain = false;
  /** Tick of the last hit that cost a point (-1 = never): presentation events are pushed for it. */
  hitTick = -1;
  /** Tick the shield broke (-1 = never). */
  brokeTick = -1;
  /** Hits absorbed so far, free i-frame hits included (statistics, tests). */
  absorbed = 0;
}

/**
 * Creates an empty shield (every ship gets one at creation).
 *
 * @returns A state with no shield.
 */
export function createShieldState(): ShieldState {
  return new ShieldState();
}

/**
 * Whether a shield is up.
 *
 * @param state - The shield.
 * @returns `true` while it has hits left.
 */
export function shieldActive(state: Readonly<ShieldState>): boolean {
  return state.kind !== ShieldKind.None && state.hits > 0;
}

/**
 * Puts up a fresh shield (the `?` slot): full hits, no i-frames. Replaces whatever was there.
 *
 * @param state - The ship's shield.
 * @param spec - What to grant (default {@link FORCE_FIELD}).
 *
 * @example
 * ```ts
 * grantShield(ship.shield); // a fresh Force Field: 5 hits
 * ```
 */
export function grantShield(state: ShieldState, spec: ShieldSpec = FORCE_FIELD): void {
  state.kind = spec.kind;
  state.hits = spec.maxHits;
  state.maxHits = spec.maxHits;
  state.iFrames = 0;
  state.absorbsTerrain = spec.absorbsTerrain;
}

/**
 * Removes the shield without a break (death, loadout reset): no hits, no i-frames.
 *
 * @param state - The ship's shield.
 */
export function clearShield(state: ShieldState): void {
  state.kind = ShieldKind.None;
  state.hits = 0;
  state.maxHits = 0;
  state.iFrames = 0;
  state.absorbsTerrain = false;
}

/** What {@link absorbShieldHit} did. */
export const ShieldHit = {
  /** Not absorbed: the hit reaches the ship. */
  None: 0,
  /** Swallowed during shield-hit i-frames (no wear). */
  Blocked: 1,
  /** Absorbed at the cost of one hit. */
  Absorbed: 2,
  /** Absorbed with the last hit: the shield broke. */
  Broke: 3,
} as const;

/** A {@link ShieldHit} code. */
export type ShieldHit = (typeof ShieldHit)[keyof typeof ShieldHit];

/**
 * Lets a shield take a hit (called by `playerHit` before the hit reaches the ship). Never
 * allocates.
 *
 * @remarks
 * Terrain is only absorbed by shields with `absorbsTerrain` (not the Force Field) — i-frames do
 * not help against it either. Otherwise: during shield-hit i-frames the hit is swallowed for free
 * ({@link ShieldHit.Blocked}); with a shield up it costs one hit, starts the i-frames and records
 * `hitTick` ({@link ShieldHit.Absorbed}); the last hit also records `brokeTick` and removes the
 * shield ({@link ShieldHit.Broke}) — its i-frames keep running. Without a shield and i-frames:
 * {@link ShieldHit.None}.
 *
 * @param state - The ship's shield.
 * @param terrain - Whether the hit is terrain contact.
 * @param tick - The current tick.
 * @returns What happened.
 *
 * @example
 * ```ts
 * if (absorbShieldHit(ship.shield, cause === PlayerHitCause.Terrain, tick) !== ShieldHit.None) {
 *   return true; // the shield took it
 * }
 * ```
 */
export function absorbShieldHit(state: ShieldState, terrain: boolean, tick: number): ShieldHit {
  if (terrain && !state.absorbsTerrain) return ShieldHit.None;
  if (state.iFrames > 0) {
    state.absorbed++;
    return ShieldHit.Blocked;
  }
  if (state.kind === ShieldKind.None || state.hits <= 0) return ShieldHit.None;
  const spec = SHIELD_SPECS[state.kind];
  state.hits--;
  state.iFrames = spec === null ? SHIELD_HIT_IFRAMES : spec.iFrames;
  state.hitTick = tick;
  state.absorbed++;
  if (state.hits > 0) return ShieldHit.Absorbed;
  state.brokeTick = tick;
  state.kind = ShieldKind.None;
  state.maxHits = 0;
  state.absorbsTerrain = false;
  return ShieldHit.Broke;
}

/**
 * Counts the shield-hit i-frames down by one — once per tick, after the collisions (tick phase
 * 7), but not on the tick of the hit that started them: a hit on tick `t` blocks the hits of ticks
 * `t + 1 … t + iFrames`. Never allocates.
 *
 * @param state - The ship's shield.
 * @param tick - The current tick.
 */
export function tickShield(state: ShieldState, tick: number): void {
  if (state.iFrames > 0 && state.hitTick !== tick) state.iFrames--;
}

/**
 * The wear frame to draw: frame 0 fresh … `frames − 1` about to fail, from the hits left.
 *
 * @remarks
 * `frames − ceil(hits · frames / maxHits)`, clamped to `[0, frames − 1]`: a 5-hit Force Field with
 * 4 frames shows fresh at 5 and 4 hits, then worn (3), damaged (2) and critical (1).
 *
 * @param state - The shield.
 * @param frames - Wear frames of its sprite.
 * @returns The frame (0 without a shield).
 */
export function shieldWearFrame(state: Readonly<ShieldState>, frames: number): number {
  if (state.maxHits <= 0 || frames <= 1) return 0;
  const frame = frames - Math.ceil((state.hits * frames) / state.maxHits);
  return frame < 0 ? 0 : frame > frames - 1 ? frames - 1 : frame;
}
