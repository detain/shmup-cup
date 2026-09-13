/**
 * # shields — shields
 *
 * **Status: implemented** for meter mode: the **Force Field** (plan M1-11) and, since M2-04, the
 * other `?` shields — the front **Shield** pods, the **Free Shield**, the **Rotate Shield** and
 * **Reduce**. The Direct-mode Arm tiers arrive with M2-05.
 *
 * **Responsibility.** Shields for both models. Meter mode (`?` slot): Force Field, front Shield
 * pods, Free Shield, Rotate Shield, Reduce (shrinks the hurtbox, not the terrain box). Direct mode
 * (blue items): Arm → Super Arm → Hyper Arm tiers (3/4/5 hits) that also absorb enemy contact and
 * terrain. Hit counters, visible wear, short shield-hit i-frames and break events.
 *
 * **Two families** (shmup_feat.md §9):
 *
 * - **Fields** cover the whole ship — the one entry point of every hit, `core/player` `playerHit`,
 *   asks {@link absorbShieldHit} first. The **Force Field** ({@link FORCE_FIELD}):
 *   {@link FORCE_FIELD_HITS} (5) hits. **Reduce** ({@link REDUCE}): {@link REDUCE_HITS} (2) hits,
 *   and while it stands the ship's hurt radius shrinks — {@link ShieldState.hurtScale} is
 *   `(hurtSteps + 1 − hits) / (hurtSteps + 1)`: ⅓ at 2 hits, ⅔ at 1 hit, the full radius once it
 *   broke (two hurtbox steps, the ship growing back one per hit); the terrain box never changes. Both absorb
 *   enemy bullets, lasers and enemy contact but **not terrain** (`absorbsTerrain: false`, decision
 *   D8). Every absorbed hit costs one hit and starts {@link SHIELD_HIT_IFRAMES} (8) ticks of
 *   shield-hit i-frames (decision D33), during which further absorbable hits are swallowed for
 *   free; the hit that takes the last point breaks the field, and its i-frames still cover the
 *   bare ship (not against terrain), so the break is survivable.
 * - **Pods** ({@link ShieldState.podCount} of at most {@link MAX_SHIELD_PODS}) are small blockers
 *   attached to the ship; a pod stops what touches **it** — enemy bullets (the bullet is used up)
 *   and enemy bodies (the enemy flies on) — never what reaches the ship past it, never lasers or
 *   terrain. Every pod has its own {@link SHIELD_POD_HITS} (14) hits and its own i-frames, so the
 *   pods **wear independently**; `hits` / `maxHits` of the state are the pods' sums, and the
 *   shield is gone once every pod broke. The layouts ({@link placeShieldPods}, world positions in
 *   {@link ShieldState.podX} / `podY`, refreshed in tick phase 2 after the ship moved):
 *   - the front **Shield** ({@link FRONT_SHIELD}): two pods at the nose, {@link FRONT_POD_ANGLE}
 *     binary units above and below the ship's heading, {@link POD_ORBIT} px out;
 *   - the **Free Shield** ({@link FREE_SHIELD}): a pair attached where the ship last flew towards
 *     (the Free Way's 8-way heading, `core/weapons`), {@link FREE_POD_SPREAD} units apart — and
 *     `?` stays equippable while a pair can still be added (up to {@link MAX_SHIELD_PODS}) or,
 *     with every slot taken, while a pair is worn: the next `?` replaces the most worn pair
 *     ({@link canGrantShield});
 *   - the **Rotate Shield** ({@link ROTATE_SHIELD}): two opposite pods orbiting the ship at
 *     {@link ROTATE_POD_ORBIT} px, {@link ROTATE_SHIELD_SPIN} units per tick.
 *
 * **Where it acts.** Every ship carries one {@link ShieldState} (`PlayerShip.shield`, created with
 * the ship). `core/powerups` grants the shield (the `?` slot — and the `!` slot's FULL BARRIER,
 * M2-03, {@link refillShield} — with the spec of the session's `?` choice, {@link shieldSpecOf}
 * `(config.shieldChoice)`), places the pods (tick phase 2), counts the i-frames down and spins the
 * Rotate Shield ({@link tickShield}, tick phase 7), turns the tick's hit / break records into
 * presentation events (tick phase 7) and draws it ({@link shieldWearFrame} / {@link podWearFrame}).
 * `core/bullets` and `core/enemies` test their bullets and bodies against the pods
 * ({@link absorbPodHit}) and read {@link ShieldState.hurtScale} for the ship's hurt circle.
 *
 * **Zero allocation.** A state is a class instance with number fields and typed arrays; the
 * functions only write them.
 *
 * **Implements.**
 * - shmup_feat.md §9 Shields — meter mode: Force Field, Shield (front pods, ~14 hits, each pod
 *   wearing independently), Free Shield (pods attached anywhere, equip several times), Rotate
 *   Shield (two orbiting pods), Reduce (two hurtbox steps, absorbs 2 hits, the terrain box
 *   unchanged); hit counter per shield, visible wear state, break SFX/effect, shield-hit
 *   i-frames; the meter shields do not absorb terrain (decision D8)
 *
 * **Public API.** {@link ShieldKind}, {@link SHIELD_KIND_NAMES}, {@link ShieldState},
 * {@link createShieldState}, {@link ShieldSpec}, {@link FORCE_FIELD}, {@link FRONT_SHIELD},
 * {@link FREE_SHIELD}, {@link ROTATE_SHIELD}, {@link REDUCE}, {@link SHIELD_SPECS},
 * {@link shieldSpecOf}, {@link SHIELD_CHOICE_SPECS}, {@link grantShield}, {@link refillShield},
 * {@link canGrantShield}, {@link shieldFull}, {@link clearShield}, {@link absorbShieldHit},
 * {@link absorbPodHit}, {@link ShieldHit}, {@link tickShield}, {@link placeShieldPods},
 * {@link shieldActive}, {@link podActive}, {@link shieldWearFrame}, {@link podWearFrame},
 * {@link reduceHurtScale}, {@link FORCE_FIELD_HITS}, {@link SHIELD_POD_HITS}, {@link REDUCE_HITS},
 * {@link REDUCE_HURT_STEPS}, {@link SHIELD_HIT_IFRAMES}, {@link MAX_SHIELD_PODS},
 * {@link POD_RADIUS}, {@link POD_ORBIT}, {@link ROTATE_POD_ORBIT}, {@link FRONT_POD_ANGLE},
 * {@link FREE_POD_SPREAD}, {@link ROTATE_SHIELD_SPIN}, {@link FORCE_FIELD_SPRITE},
 * {@link FORCE_FIELD_WEAR_FRAMES}, {@link SHIELD_POD_SPRITE}, {@link SHIELD_POD_WEAR_FRAMES},
 * {@link REDUCE_SPRITE}, {@link REDUCE_FRAMES}, {@link SHIELD_SPRITES}.
 *
 * **Planned API.** The Arm tiers with repair (M2-05).
 *
 * @module
 */
import type { ShieldChoice } from '../config/index.js';
import { ANGLE_MASK, ANGLE_QUARTER } from '../math/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../math/trig-table.js';
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'shields',
  status: 'implemented',
  specRefs: ['shmup_feat.md §9'],
});

/** Shield variants (numeric codes, hashed: append, never renumber). */
export const ShieldKind = {
  /** No shield. */
  None: 0,
  /** The meter-mode Force Field (`?` slot, Type A). */
  ForceField: 1,
  /** The front Shield: two pods at the nose (M2-04). */
  Shield: 2,
  /** The Free Shield: pod pairs attached where the ship last flew towards (M2-04). */
  FreeShield: 3,
  /** The Rotate Shield: two pods orbiting the ship (M2-04). */
  RotateShield: 4,
  /** Reduce: a smaller hurtbox that grows back one step per hit (M2-04). */
  Reduce: 5,
} as const;

/** A {@link ShieldKind} code. */
export type ShieldKind = (typeof ShieldKind)[keyof typeof ShieldKind];

/** Names of the {@link ShieldKind} codes, by code (debug overlays, logs). */
export const SHIELD_KIND_NAMES: readonly string[] = Object.freeze([
  'none',
  'forceField',
  'shield',
  'freeShield',
  'rotateShield',
  'reduce',
]);

/** Hits a fresh Force Field absorbs (plan M1-11; the arcade's ~6, the SNES's 3). */
export const FORCE_FIELD_HITS = 5;

/** Hits each pod of the Shield / Free Shield / Rotate Shield absorbs (shmup_feat.md §9: ~14). */
export const SHIELD_POD_HITS = 14;

/** Hits Reduce absorbs (the SNES version's 2 — plan M2-04). */
export const REDUCE_HITS = 2;

/** Hurtbox steps of Reduce (one per hit it can take). */
export const REDUCE_HURT_STEPS = 2;

/** Shield-hit i-frames: ticks after an absorbed hit during which further hits are free (D33). */
export const SHIELD_HIT_IFRAMES = 8;

/** Most pods one ship can carry (two Free Shield pairs). */
export const MAX_SHIELD_PODS = 4;

/** Radius of a pod's hit circle, in pixels. */
export const POD_RADIUS = 4;

/** Distance of the front and Free Shield pods from the ship's centre, in pixels. */
export const POD_ORBIT = 13;

/** Radius of the Rotate Shield's orbit, in pixels. */
export const ROTATE_POD_ORBIT = 16;

/** Binary units the front Shield's pods sit above / below the ship's heading (≈ 22°). */
export const FRONT_POD_ANGLE = 64;

/** Binary units between the two pods of a Free Shield pair (each half of it off the heading). */
export const FREE_POD_SPREAD = 96;

/** Binary units the Rotate Shield turns per tick (one turn in ≈ 85 ticks). */
export const ROTATE_SHIELD_SPIN = 12;

/** The Force Field's sprite (an engine sprite — see core `world` `ENGINE_SPRITES`). */
export const FORCE_FIELD_SPRITE = 'shields/force-field';

/** Wear frames of {@link FORCE_FIELD_SPRITE}: fresh, worn, damaged, critical. */
export const FORCE_FIELD_WEAR_FRAMES = 4;

/** A shield pod's sprite (the front, Free and Rotate Shield — an engine sprite). */
export const SHIELD_POD_SPRITE = 'shields/pod';

/** Wear frames of {@link SHIELD_POD_SPRITE}: fresh, worn, damaged, critical. */
export const SHIELD_POD_WEAR_FRAMES = 4;

/** Reduce's shimmer round the shrunken ship (an engine sprite). */
export const REDUCE_SPRITE = 'shields/reduce';

/** Frames of {@link REDUCE_SPRITE}: frame 0 at full strength (smallest), frame 1 one hit down. */
export const REDUCE_FRAMES = 2;

/** Every shield sprite (part of the World's `ENGINE_SPRITES`). */
export const SHIELD_SPRITES: readonly string[] = Object.freeze([
  FORCE_FIELD_SPRITE,
  SHIELD_POD_SPRITE,
  REDUCE_SPRITE,
]);

/** Tunables of one shield kind (built in — the meter shields are fixed designs). */
export interface ShieldSpec {
  /** The kind. */
  readonly kind: ShieldKind;
  /** Hits a fresh shield absorbs (for pod shields: every pod's together). */
  readonly maxHits: number;
  /** Shield-hit i-frames after each absorbed hit (per pod for pod shields). */
  readonly iFrames: number;
  /** Whether terrain contact is absorbed too (Direct-mode Arm: yes; the meter shields: no — D8). */
  readonly absorbsTerrain: boolean;
  /** Sprite name (the field's, or each pod's). */
  readonly sprite: string;
  /** Wear frames of the sprite (frame 0 = fresh). */
  readonly wearFrames: number;
  /** Pods a fresh shield brings (0 = a field round the ship). */
  readonly pods: number;
  /** Hits of each pod (0 for fields). */
  readonly podHits: number;
  /** Distance of the pods from the ship's centre (0 for fields). */
  readonly podOrbit: number;
  /** Hurtbox steps (Reduce: {@link REDUCE_HURT_STEPS}; 0 = the hurtbox never changes). */
  readonly hurtSteps: number;
}

/** The Force Field (plan M1-11). */
export const FORCE_FIELD: ShieldSpec = Object.freeze({
  kind: ShieldKind.ForceField,
  maxHits: FORCE_FIELD_HITS,
  iFrames: SHIELD_HIT_IFRAMES,
  absorbsTerrain: false,
  sprite: FORCE_FIELD_SPRITE,
  wearFrames: FORCE_FIELD_WEAR_FRAMES,
  pods: 0,
  podHits: 0,
  podOrbit: 0,
  hurtSteps: 0,
});

/** The front Shield: two pods at the nose, 14 hits each (plan M2-04). */
export const FRONT_SHIELD: ShieldSpec = Object.freeze({
  kind: ShieldKind.Shield,
  maxHits: 2 * SHIELD_POD_HITS,
  iFrames: SHIELD_HIT_IFRAMES,
  absorbsTerrain: false,
  sprite: SHIELD_POD_SPRITE,
  wearFrames: SHIELD_POD_WEAR_FRAMES,
  pods: 2,
  podHits: SHIELD_POD_HITS,
  podOrbit: POD_ORBIT,
  hurtSteps: 0,
});

/** The Free Shield: a pod pair per `?`, up to two pairs, 14 hits per pod (plan M2-04). */
export const FREE_SHIELD: ShieldSpec = Object.freeze({
  kind: ShieldKind.FreeShield,
  maxHits: 2 * SHIELD_POD_HITS,
  iFrames: SHIELD_HIT_IFRAMES,
  absorbsTerrain: false,
  sprite: SHIELD_POD_SPRITE,
  wearFrames: SHIELD_POD_WEAR_FRAMES,
  pods: 2,
  podHits: SHIELD_POD_HITS,
  podOrbit: POD_ORBIT,
  hurtSteps: 0,
});

/** The Rotate Shield: two orbiting pods, 14 hits each (plan M2-04). */
export const ROTATE_SHIELD: ShieldSpec = Object.freeze({
  kind: ShieldKind.RotateShield,
  maxHits: 2 * SHIELD_POD_HITS,
  iFrames: SHIELD_HIT_IFRAMES,
  absorbsTerrain: false,
  sprite: SHIELD_POD_SPRITE,
  wearFrames: SHIELD_POD_WEAR_FRAMES,
  pods: 2,
  podHits: SHIELD_POD_HITS,
  podOrbit: ROTATE_POD_ORBIT,
  hurtSteps: 0,
});

/** Reduce: two hurtbox steps, absorbs 2 hits (plan M2-04). */
export const REDUCE: ShieldSpec = Object.freeze({
  kind: ShieldKind.Reduce,
  maxHits: REDUCE_HITS,
  iFrames: SHIELD_HIT_IFRAMES,
  absorbsTerrain: false,
  sprite: REDUCE_SPRITE,
  wearFrames: REDUCE_FRAMES,
  pods: 0,
  podHits: 0,
  podOrbit: 0,
  hurtSteps: REDUCE_HURT_STEPS,
});

/** Shield specs by {@link ShieldKind} code (`null` for `None`). */
export const SHIELD_SPECS: readonly (ShieldSpec | null)[] = Object.freeze([
  null,
  FORCE_FIELD,
  FRONT_SHIELD,
  FREE_SHIELD,
  ROTATE_SHIELD,
  REDUCE,
]);

/** The spec of every `config` `ShieldChoice` (see {@link shieldSpecOf}). */
export const SHIELD_CHOICE_SPECS: Readonly<Record<ShieldChoice, ShieldSpec>> = Object.freeze({
  forceField: FORCE_FIELD,
  shield: FRONT_SHIELD,
  freeShield: FREE_SHIELD,
  rotateShield: ROTATE_SHIELD,
  reduce: REDUCE,
});

/**
 * The shield a `?`-slot choice grants (`GameConfig.shieldChoice`, plan M2-03 / M2-04 — the weapon
 * select's `?` list).
 *
 * @param choice - A `config` `ShieldChoice`.
 * @returns Its spec ({@link FORCE_FIELD} for an unknown name).
 *
 * @example
 * ```ts
 * grantShield(ship.shield, shieldSpecOf(config.shieldChoice));
 * ```
 */
export function shieldSpecOf(choice: ShieldChoice): ShieldSpec {
  return Object.prototype.hasOwnProperty.call(SHIELD_CHOICE_SPECS, choice)
    ? SHIELD_CHOICE_SPECS[choice]
    : FORCE_FIELD;
}

/**
 * The shield of one ship (a class, so its numeric fields stay unboxed). `kind` `None` = no shield;
 * the i-frames of a field may outlive it by a few ticks after it broke.
 */
export class ShieldState {
  /** {@link ShieldKind} code. */
  kind: ShieldKind = ShieldKind.None;
  /** Hits left (0 = none; pod shields: every pod's together). */
  hits = 0;
  /** Hits of the fresh shield (wear is `hits / maxHits`; pod shields: the pods' sum). */
  maxHits = 0;
  /** Remaining shield-hit i-frames of a field (pods have their own: {@link ShieldState.podIFrames}). */
  iFrames = 0;
  /** Whether terrain contact is absorbed (copied from the spec). */
  absorbsTerrain = false;
  /** Tick of the last hit that cost a point (-1 = never): presentation events are pushed for it. */
  hitTick = -1;
  /** Tick the shield (or one of its pods) broke (-1 = never). */
  brokeTick = -1;
  /** Hits absorbed so far, free i-frame hits included (statistics, tests). */
  absorbed = 0;
  /**
   * The ship's hurt radius factor (1 = its spec's `hurtRadius`; Reduce shrinks it — see
   * {@link reduceHurtScale}). Read by every hurt-circle test.
   */
  hurtScale = 1;
  /** Pod slots in use (0 for fields; a broken pod keeps its slot with 0 hits until the shield goes). */
  podCount = 0;
  /** Hits each pod takes when fresh. */
  podMaxHits = 0;
  /** Distance of the pods from the ship's centre. */
  podOrbit = 0;
  /** The Rotate Shield's turn so far (binary units, added to every pod's angle). */
  spin = 0;
  /** Hits left per pod (0 = broken). */
  readonly podHits = new Int32Array(MAX_SHIELD_PODS);
  /** Angle of each pod round the ship (binary units, 0 = ahead, 256 = below). */
  readonly podAngle = new Int32Array(MAX_SHIELD_PODS);
  /** Shield-hit i-frames per pod. */
  readonly podIFrames = new Int32Array(MAX_SHIELD_PODS);
  /** Tick of each pod's last point-costing hit (-1 = never). */
  readonly podHitTick = new Float64Array(MAX_SHIELD_PODS).fill(-1);
  /** World x of each pod (placed in tick phase 2 — {@link placeShieldPods}). */
  readonly podX = new Float64Array(MAX_SHIELD_PODS);
  /** World y of each pod. */
  readonly podY = new Float64Array(MAX_SHIELD_PODS);
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
 * Whether a pod of the shield still stands.
 *
 * @param state - The shield.
 * @param pod - Pod slot.
 * @returns `true` for a slot in use with hits left.
 */
export function podActive(state: Readonly<ShieldState>, pod: number): boolean {
  return pod >= 0 && pod < state.podCount && state.podHits[pod] > 0;
}

/**
 * Whether a shield is up at full strength (the `!` slot's FULL BARRIER would change nothing).
 *
 * @param state - The shield.
 * @returns `true` when it stands with every hit left.
 */
export function shieldFull(state: Readonly<ShieldState>): boolean {
  return shieldActive(state) && state.hits >= state.maxHits;
}

/**
 * The hurt radius factor of Reduce with `hits` left: `(steps + 1 − hits) / (steps + 1)` — ⅓ at 2
 * hits, ⅔ at 1 hit, 1 without (two hurtbox steps, the ship growing back one step per hit).
 *
 * @param hits - Hits left (clamped to `[0, steps]`).
 * @param steps - Hurtbox steps (default {@link REDUCE_HURT_STEPS}; 0 = no shrinking).
 * @returns The factor, in `(0, 1]`.
 *
 * @example
 * ```ts
 * world.ship.hurtRadius * reduceHurtScale(2); // → 0.5 for the KESTREL's 1.5
 * ```
 */
export function reduceHurtScale(hits: number, steps: number = REDUCE_HURT_STEPS): number {
  if (!(steps > 0) || !(hits > 0)) return 1;
  const h = hits > steps ? steps : hits;
  return (steps + 1 - h) / (steps + 1);
}

/**
 * Sets up fresh pods from a spec (every pod full, no i-frames) at the spec's layout.
 *
 * @param state - The shield (kind already set).
 * @param spec - A pod spec.
 * @param heading - The Free Shield's direction (binary units).
 */
function freshPods(state: ShieldState, spec: ShieldSpec, heading: number): void {
  const n = spec.pods > MAX_SHIELD_PODS ? MAX_SHIELD_PODS : spec.pods;
  state.podCount = n;
  state.podMaxHits = spec.podHits;
  state.podOrbit = spec.podOrbit;
  state.spin = 0;
  const h = Math.round(heading) & ANGLE_MASK;
  for (let k = 0; k < MAX_SHIELD_PODS; k++) {
    state.podHits[k] = k < n ? spec.podHits : 0;
    state.podIFrames[k] = 0;
    state.podHitTick[k] = -1;
    const angle =
      spec.kind === ShieldKind.Shield
        ? (k & 1) === 0
          ? ANGLE_MASK + 1 - FRONT_POD_ANGLE
          : FRONT_POD_ANGLE
        : spec.kind === ShieldKind.FreeShield
          ? h + ((k & 1) === 0 ? -(FREE_POD_SPREAD >> 1) : FREE_POD_SPREAD >> 1)
          : (k * (ANGLE_MASK + 1)) / (n > 0 ? n : 1);
    state.podAngle[k] = Math.round(angle) & ANGLE_MASK;
  }
  state.hits = n * spec.podHits;
  state.maxHits = n * spec.podHits;
}

/**
 * Recomputes `hits` / `maxHits` of a pod shield from its pods.
 *
 * @param state - The shield.
 */
function sumPods(state: ShieldState): void {
  let hits = 0;
  for (let k = 0; k < state.podCount; k++) hits += state.podHits[k];
  state.hits = hits;
  state.maxHits = state.podCount * state.podMaxHits;
}

/**
 * Attaches a Free Shield pair at a heading: into the next free pair of slots, or — every slot
 * taken — over the pair with the fewest hits left (the first on a tie).
 *
 * @param state - A standing Free Shield.
 * @param spec - Its spec.
 * @param heading - Where the pair goes (binary units).
 */
function attachPodPair(state: ShieldState, spec: ShieldSpec, heading: number): void {
  let at = state.podCount;
  if (at + 2 > MAX_SHIELD_PODS) {
    at = 0;
    let fewest = Infinity;
    for (let k = 0; k + 1 < MAX_SHIELD_PODS; k += 2) {
      const left = state.podHits[k] + state.podHits[k + 1];
      if (left < fewest) {
        fewest = left;
        at = k;
      }
    }
  } else {
    state.podCount = at + 2;
  }
  const h = Math.round(heading) & ANGLE_MASK;
  for (let k = at; k < at + 2; k++) {
    state.podHits[k] = spec.podHits;
    state.podIFrames[k] = 0;
    state.podHitTick[k] = -1;
    state.podAngle[k] =
      (h + ((k & 1) === 0 ? -(FREE_POD_SPREAD >> 1) : FREE_POD_SPREAD >> 1)) & ANGLE_MASK;
  }
  sumPods(state);
}

/**
 * Puts up a shield (the `?` slot): a fresh one of the spec — full hits, no i-frames — replacing
 * whatever was there; except a Free Shield on a standing Free Shield, which **adds** a pod pair at
 * `heading` (or, with {@link MAX_SHIELD_PODS} pods, replaces the most worn pair).
 *
 * @param state - The ship's shield.
 * @param spec - What to grant (default {@link FORCE_FIELD}).
 * @param heading - Where a Free Shield pair attaches, in binary units (default 0 = ahead; the
 *   power-up system passes the ship's last 8-way direction).
 *
 * @example
 * ```ts
 * grantShield(ship.shield); // a fresh Force Field: 5 hits
 * grantShield(ship.shield, FREE_SHIELD, 256); // a Free Shield pair below the ship
 * ```
 */
export function grantShield(state: ShieldState, spec: ShieldSpec = FORCE_FIELD, heading = 0): void {
  if (spec.pods > 0) {
    if (
      spec.kind === ShieldKind.FreeShield &&
      state.kind === ShieldKind.FreeShield &&
      shieldActive(state)
    ) {
      attachPodPair(state, spec, heading);
      return;
    }
    state.kind = spec.kind;
    freshPods(state, spec, heading);
    state.iFrames = 0;
    state.absorbsTerrain = spec.absorbsTerrain;
    state.hurtScale = 1;
    return;
  }
  state.kind = spec.kind;
  state.hits = spec.maxHits;
  state.maxHits = spec.maxHits;
  state.iFrames = 0;
  state.absorbsTerrain = spec.absorbsTerrain;
  state.hurtScale = reduceHurtScale(spec.maxHits, spec.hurtSteps);
  clearPods(state);
}

/**
 * Brings a shield back to full strength (the `!` slot's FULL BARRIER): a standing shield of the
 * spec's kind gets every hit back — every pod slot in use, broken pods included, at their
 * places —, anything else a fresh one ({@link grantShield}).
 *
 * @param state - The ship's shield.
 * @param spec - The session's `?` shield.
 * @param heading - Where a fresh Free Shield pair attaches (binary units).
 */
export function refillShield(state: ShieldState, spec: ShieldSpec, heading = 0): void {
  if (state.kind !== spec.kind || !shieldActive(state)) {
    if (spec.kind === ShieldKind.FreeShield) clearShield(state);
    grantShield(state, spec, heading);
    return;
  }
  if (state.podCount > 0) {
    for (let k = 0; k < state.podCount; k++) state.podHits[k] = state.podMaxHits;
    sumPods(state);
    return;
  }
  state.hits = state.maxHits;
  state.hurtScale = reduceHurtScale(state.hits, spec.hurtSteps);
}

/**
 * Whether the `?` slot would change something now (it is greyed otherwise): no shield is up; or a
 * Free Shield stands and either a pair still fits ({@link MAX_SHIELD_PODS}) or a pair is worn (the
 * next one replaces it).
 *
 * @param state - The ship's shield.
 * @param spec - The session's `?` shield.
 * @returns `true` when `?` can be equipped.
 */
export function canGrantShield(state: Readonly<ShieldState>, spec: ShieldSpec): boolean {
  if (!shieldActive(state)) return true;
  if (spec.kind !== ShieldKind.FreeShield || state.kind !== ShieldKind.FreeShield) return false;
  return state.podCount + 2 <= MAX_SHIELD_PODS || state.hits < state.maxHits;
}

/**
 * Empties the pod slots.
 *
 * @param state - The shield.
 */
function clearPods(state: ShieldState): void {
  state.podCount = 0;
  state.podMaxHits = 0;
  state.podOrbit = 0;
  state.spin = 0;
  state.podHits.fill(0);
  state.podAngle.fill(0);
  state.podIFrames.fill(0);
  state.podHitTick.fill(-1);
}

/**
 * Removes the shield without a break (death, loadout reset): no hits, no i-frames, no pods, the
 * full hurt radius.
 *
 * @param state - The ship's shield.
 */
export function clearShield(state: ShieldState): void {
  state.kind = ShieldKind.None;
  state.hits = 0;
  state.maxHits = 0;
  state.iFrames = 0;
  state.absorbsTerrain = false;
  state.hurtScale = 1;
  clearPods(state);
}

/** What {@link absorbShieldHit} / {@link absorbPodHit} did. */
export const ShieldHit = {
  /** Not absorbed: the hit reaches the ship. */
  None: 0,
  /** Swallowed during shield-hit i-frames (no wear). */
  Blocked: 1,
  /** Absorbed at the cost of one hit. */
  Absorbed: 2,
  /** Absorbed with the last hit: the shield (or the pod) broke. */
  Broke: 3,
} as const;

/** A {@link ShieldHit} code. */
export type ShieldHit = (typeof ShieldHit)[keyof typeof ShieldHit];

/**
 * Lets a **field** take a hit on the ship (called by `playerHit` before the hit reaches the
 * ship). Never allocates.
 *
 * @remarks
 * Pods never cover the ship (they stop only what touches them — {@link absorbPodHit}): with a pod
 * shield up this is {@link ShieldHit.None}. Terrain is only absorbed by shields with
 * `absorbsTerrain` (no meter shield) — i-frames do not help against it either. Otherwise: during
 * shield-hit i-frames the hit is swallowed for free ({@link ShieldHit.Blocked}); with a field up
 * it costs one hit, starts the i-frames and records `hitTick` ({@link ShieldHit.Absorbed}); the
 * last hit also records `brokeTick` and removes the field ({@link ShieldHit.Broke}) — its i-frames
 * keep running. Reduce's `hurtScale` grows back one step with every point it loses. Without a
 * field and i-frames: {@link ShieldHit.None}.
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
  if (state.podCount > 0) return ShieldHit.None;
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
  state.hurtScale = reduceHurtScale(state.hits, spec === null ? 0 : spec.hurtSteps);
  if (state.hits > 0) return ShieldHit.Absorbed;
  state.brokeTick = tick;
  state.kind = ShieldKind.None;
  state.maxHits = 0;
  state.absorbsTerrain = false;
  state.hurtScale = 1;
  return ShieldHit.Broke;
}

/**
 * Lets one pod take a hit (an enemy bullet or body touched it — `core/bullets`, `core/enemies`).
 * Never allocates.
 *
 * @remarks
 * A slot that is not in use or already broke: {@link ShieldHit.None}. During the pod's own
 * i-frames the hit is free ({@link ShieldHit.Blocked}); otherwise it costs the pod one hit, starts
 * its i-frames and records `hitTick` (the pod's and the state's — {@link ShieldHit.Absorbed}); its
 * last hit records `brokeTick` ({@link ShieldHit.Broke}) and — when it was the last standing pod —
 * removes the shield. The other pods are not touched (independent wear).
 *
 * @param state - The ship's shield.
 * @param pod - Pod slot.
 * @param tick - The current tick.
 * @returns What happened.
 *
 * @example
 * ```ts
 * if (absorbPodHit(ship.shield, k, world.tick) !== ShieldHit.None) killBullet(i);
 * ```
 */
export function absorbPodHit(state: ShieldState, pod: number, tick: number): ShieldHit {
  if (!(pod >= 0 && pod < state.podCount) || state.podHits[pod] <= 0) return ShieldHit.None;
  if (state.podIFrames[pod] > 0) {
    state.absorbed++;
    return ShieldHit.Blocked;
  }
  const spec = SHIELD_SPECS[state.kind];
  state.podHits[pod]--;
  state.hits--;
  state.podIFrames[pod] = spec === null ? SHIELD_HIT_IFRAMES : spec.iFrames;
  state.podHitTick[pod] = tick;
  state.hitTick = tick;
  state.absorbed++;
  if (state.podHits[pod] > 0) return ShieldHit.Absorbed;
  state.brokeTick = tick;
  if (state.hits <= 0) {
    state.kind = ShieldKind.None;
    state.hits = 0;
    state.maxHits = 0;
    state.absorbsTerrain = false;
    clearPods(state);
  }
  return ShieldHit.Broke;
}

/**
 * Counts the shield-hit i-frames down by one — once per tick, after the collisions (tick phase
 * 7), but not on the tick of the hit that started them: a hit on tick `t` blocks the hits of ticks
 * `t + 1 … t + iFrames` — for the field and for every pod on its own; the Rotate Shield turns by
 * {@link ROTATE_SHIELD_SPIN}. Never allocates.
 *
 * @param state - The ship's shield.
 * @param tick - The current tick.
 */
export function tickShield(state: ShieldState, tick: number): void {
  if (state.iFrames > 0 && state.hitTick !== tick) state.iFrames--;
  const n = state.podCount;
  if (n === 0) return;
  const frames = state.podIFrames;
  for (let k = 0; k < n; k++) {
    if (frames[k] > 0 && state.podHitTick[k] !== tick) frames[k]--;
  }
  if (state.kind === ShieldKind.RotateShield) {
    state.spin = (state.spin + ROTATE_SHIELD_SPIN) & ANGLE_MASK;
  }
}

/**
 * Places the pods round a ship ({@link ShieldState.podX} / `podY`): each at its angle (plus the
 * Rotate Shield's spin), `podOrbit` px from the ship's centre (table trigonometry). Tick phase 2,
 * after the ship moved. Never allocates.
 *
 * @param state - The ship's shield.
 * @param ship - The ship (its world position — read here, so no fraction crosses a call).
 */
export function placeShieldPods(
  state: ShieldState,
  ship: { readonly x: number; readonly y: number },
): void {
  const n = state.podCount;
  if (n === 0) return;
  const x = ship.x;
  const y = ship.y;
  const r = state.podOrbit / TRIG_SCALE;
  const spin = state.spin;
  for (let k = 0; k < n; k++) {
    const a = (state.podAngle[k] + spin) & ANGLE_MASK;
    state.podX[k] = x + SIN_TABLE_Q16[(a + ANGLE_QUARTER) & ANGLE_MASK] * r;
    state.podY[k] = y + SIN_TABLE_Q16[a] * r;
  }
}

/**
 * The wear frame of a field to draw: frame 0 fresh … `frames − 1` about to fail, from the hits
 * left.
 *
 * @remarks
 * `frames − ceil(hits · frames / maxHits)`, clamped to `[0, frames − 1]`: a 5-hit Force Field with
 * 4 frames shows fresh at 5 and 4 hits, then worn (3), damaged (2) and critical (1); Reduce (2
 * hits, 2 frames) frame 0 at 2 hits, 1 at 1 hit.
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

/**
 * The wear frame of one pod (as {@link shieldWearFrame}, from the pod's own hits).
 *
 * @param state - The shield.
 * @param pod - Pod slot.
 * @param frames - Wear frames of the pod sprite.
 * @returns The frame (0 for a slot not in use).
 */
export function podWearFrame(state: Readonly<ShieldState>, pod: number, frames: number): number {
  const max = state.podMaxHits;
  if (!(pod >= 0 && pod < state.podCount) || max <= 0 || frames <= 1) return 0;
  const frame = frames - Math.ceil((state.podHits[pod] * frames) / max);
  return frame < 0 ? 0 : frame > frames - 1 ? frames - 1 : frame;
}
