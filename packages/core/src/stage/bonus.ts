/**
 * # stage/bonus — hidden bonus-stage entrances (plan M2-10)
 *
 * **Responsibility.** The World's side of shmup_feat.md §14 "hidden bonus stages": a stage's
 * `bonus` events ({@link StageBonusEvent}) are secret entrances. The stage runner arms one when the
 * camera reaches its `x` (the World's stage hook calls {@link BonusEntrances.arm}); from then until
 * the camera passes its `until` it waits for its condition:
 *
 * - **`gap`** — a living player ship's centre enters the marked region (a gap in the terrain, a
 *   hole in a wall) → it opens at once;
 * - **`ground`** — every ground enemy (a `ground` anchor) that appeared while it was armed was
 *   destroyed by the players (at least one) → it opens when the window closes;
 * - **`digit`** — when the window closes, a playing ship's score shows the digit `digit` at the
 *   place `place` (`floor(score / place) mod 10`; the last digit is the continue count, never
 *   read) → it opens.
 *
 * An entrance that opens records itself in {@link BonusEntrances.entered} (the first one wins; every
 * other entrance is disarmed) and pushes `SFX PowerUpEquip`; the World itself plays on — the scene
 * flow (`core/scenes`) sees the entry and flies the players into the bonus stage
 * ({@link BonusEntrances.enteredStage}). Clearing the bonus stage skips the zone's boss; a death in
 * it sends the players back to the entrance with it **locked** ({@link BonusEntrances.lock}: no
 * entrance of the stage opens any more — "dying locks you out").
 *
 * A checkpoint restart ({@link BonusEntrances.clear}) disarms every entrance, then re-arms those
 * whose `x` lies behind the new camera x and whose window is still open (with fresh ground
 * counters); the ones ahead arm again when the camera reaches them.
 *
 * **Tick order** (the World calls): the stage hook's `arm` while the runner ticks (phase 3), then
 * {@link BonusEntrances.update} after the runner and the other stage systems (phase 3).
 *
 * **Zero allocation.** Every table is a typed array filled at creation; `update` only reads the
 * ships, the camera, the scores and the enemy totals.
 *
 * **Implements.** shmup_feat.md §14 — hidden bonus stages: secret entrances with conditions (fly
 * into a marked gap, destroy all ground targets, a score digit); dying locks you out.
 *
 * **Public API.** Re-exported by `core/stage`: {@link BonusEntrances}, {@link BonusEntrancesHost},
 * {@link createBonusEntrances}, {@link BonusEntrance}.
 *
 * @module
 */
import { BONUS_ENTRANCES, type StageBonusEvent, type StageSpec } from '../data/index.js';
import type { EnemyStats } from '../enemies/index.js';
import { SFX_CUES, SimEventKind, type EventQueue } from '../events/index.js';
import type { PlayerCamera, PlayerShip } from '../player/index.js';
import type { ScoreBoard } from '../scoring/index.js';

/** Entrance codes: the index of the event's `entrance` in `core/data` `BONUS_ENTRANCES`. */
export const BonusEntrance = {
  /** A living ship flies into the region. */
  Gap: 0,
  /** Every ground enemy of the window destroyed. */
  Ground: 1,
  /** A score digit when the window closes. */
  Digit: 2,
} as const;

/** A {@link BonusEntrance} code. */
export type BonusEntrance = (typeof BonusEntrance)[keyof typeof BonusEntrance];

/** What the entrances read from their World (the World implements it). */
export interface BonusEntrancesHost {
  /** The tick being run. */
  readonly tick: number;
  /** The camera (its `x` closes the windows). */
  readonly camera: PlayerCamera;
  /** The player ships. */
  readonly players: readonly PlayerShip[];
  /** Presentation events. */
  readonly events: EventQueue;
  /** The scores (`digit` entrances). */
  readonly scoring: {
    /** The board. */
    readonly board: ScoreBoard;
  };
}

/**
 * The bonus entrances of one World (see the module docs): the stage's `bonus` events compiled at
 * creation, their armed state and the entry. A class: its fields stay monomorphic.
 */
export class BonusEntrances {
  /** Entrances of the stage (its `bonus` events, in timeline order). */
  readonly count: number;
  /** Per entrance: its index in `stage.events`. */
  readonly eventIndex: Int32Array;
  /** Per entrance: its {@link BonusEntrance} code. */
  readonly kind: Uint8Array;
  /** Per entrance: the bonus stage (`ContentDb.stages` index). */
  readonly stageId: Int32Array;
  /** Per entrance: the event's `x` (where it arms). */
  readonly armX: Float64Array;
  /** Per entrance: the camera x that closes its window. */
  readonly until: Float64Array;
  /** Per entrance: the region's left edge (`gap`). */
  readonly x0: Float64Array;
  /** Per entrance: the region's top edge. */
  readonly y0: Float64Array;
  /** Per entrance: the region's right edge. */
  readonly x1: Float64Array;
  /** Per entrance: the region's bottom edge. */
  readonly y1: Float64Array;
  /** Per entrance: the digit (`digit`). */
  readonly digit: Int8Array;
  /** Per entrance: the digit's place (`digit`). */
  readonly place: Int32Array;
  /** Per entrance: 1 while armed. */
  readonly armed: Uint8Array;
  /** Per entrance: the enemy totals' `groundSpawned` when it armed. */
  readonly groundSpawned0: Int32Array;
  /** Per entrance: the enemy totals' `groundKilled` when it armed. */
  readonly groundKilled0: Int32Array;
  /** The entrance that opened (-1 = none yet). */
  entered = -1;
  /** Tick it opened on (-1 = never). */
  enteredTick = -1;
  /** Whether the entrances are locked (a death in the bonus stage — {@link BonusEntrances.lock}). */
  locked = false;
  /** The World. */
  private readonly host: BonusEntrancesHost;
  /** The World's enemy totals (`ground` entrances). */
  private readonly stats: EnemyStats;
  /** Per stage event: its entrance, or -1. */
  private readonly byEvent: Int32Array;

  /**
   * Compiles the stage's `bonus` events (load time — see {@link createBonusEntrances}).
   *
   * @param host - The World.
   * @param stats - The World's enemy totals.
   * @param stage - The stage, or `null` (no entrances).
   */
  constructor(host: BonusEntrancesHost, stats: EnemyStats, stage: StageSpec | null) {
    this.host = host;
    this.stats = stats;
    const events = stage === null ? [] : stage.events;
    const list: StageBonusEvent[] = [];
    const indices: number[] = [];
    this.byEvent = new Int32Array(events.length).fill(-1);
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type !== 'bonus') continue;
      this.byEvent[i] = list.length;
      list.push(event);
      indices.push(i);
    }
    const n = list.length;
    this.count = n;
    this.eventIndex = new Int32Array(indices);
    this.kind = new Uint8Array(n);
    this.stageId = new Int32Array(n);
    this.armX = new Float64Array(n);
    this.until = new Float64Array(n);
    this.x0 = new Float64Array(n);
    this.y0 = new Float64Array(n);
    this.x1 = new Float64Array(n);
    this.y1 = new Float64Array(n);
    this.digit = new Int8Array(n);
    this.place = new Int32Array(n);
    this.armed = new Uint8Array(n);
    this.groundSpawned0 = new Int32Array(n);
    this.groundKilled0 = new Int32Array(n);
    for (let e = 0; e < n; e++) {
      const event = list[e];
      const code = BONUS_ENTRANCES.indexOf(event.entrance);
      this.kind[e] = code >= 0 ? code : BonusEntrance.Gap;
      this.stageId[e] = event.stageId;
      this.armX[e] = event.x;
      this.until[e] = event.until;
      const region = event.region;
      if (region !== undefined) {
        this.x0[e] = region.x;
        this.y0[e] = region.y;
        this.x1[e] = region.x + region.w;
        this.y1[e] = region.y + region.h;
      }
      this.digit[e] = event.digit ?? 0;
      this.place[e] = event.place > 0 ? event.place : 100;
    }
  }

  /**
   * The bonus stage of the entrance that opened.
   *
   * @returns Its `ContentDb.stages` index, or -1 when none opened.
   */
  enteredStage(): number {
    return this.entered >= 0 ? this.stageId[this.entered] : -1;
  }

  /**
   * The stage `x` of the entrance that opened (where a failed bonus stage sends the players back).
   *
   * @returns The event's `x`, or -1 when none opened.
   */
  enteredX(): number {
    return this.entered >= 0 ? this.armX[this.entered] : -1;
  }

  /**
   * The stage runner reached a `bonus` event (the World's stage hook): its entrance arms, with the
   * current enemy totals as its window's start. Ignored after an entry, when locked, and for an
   * index that is not a `bonus` event.
   *
   * @param eventIndex - Index in `stage.events`.
   */
  arm(eventIndex: number): void {
    if (!(eventIndex >= 0 && eventIndex < this.byEvent.length)) return;
    const e = this.byEvent[eventIndex];
    if (e < 0 || this.locked || this.entered >= 0) return;
    this.armed[e] = 1;
    this.groundSpawned0[e] = this.stats.groundSpawned;
    this.groundKilled0[e] = this.stats.groundKilled;
  }

  /**
   * Phase 3, after the stage runner: tests every armed entrance (see the module docs) and closes
   * the windows the camera passed. Never allocates.
   */
  update(): void {
    const n = this.count;
    if (n === 0 || this.entered >= 0 || this.locked) return;
    const cameraX = this.host.camera.x;
    for (let e = 0; e < n; e++) {
      if (this.armed[e] === 0) continue;
      const kind = this.kind[e];
      const closing = cameraX >= this.until[e];
      if (kind === BonusEntrance.Gap) {
        if (this.shipInRegion(e)) {
          this.open(e);
          return;
        }
      } else if (closing) {
        const open = kind === BonusEntrance.Ground ? this.groundCleared(e) : this.digitShown(e);
        if (open) {
          this.open(e);
          return;
        }
      }
      if (closing) this.armed[e] = 0;
    }
  }

  /**
   * Locks every entrance of the stage (a death in the bonus stage — the scene flow's return): no
   * entrance arms or opens any more. Cold path.
   */
  lock(): void {
    this.locked = true;
    this.armed.fill(0);
  }

  /**
   * A checkpoint restart (the World's stage `clear` hook): every entrance disarms, then those behind
   * the camera whose window is still open re-arm with fresh ground counters (branches permitting).
   * Cold path.
   *
   * @param runner - Whether an event's branch is taken (`StageRunner.eventActive`), or `null`.
   * @param cameraX - The camera x after the restart.
   */
  clear(
    runner: {
      /**
       * Whether an event's branch is taken.
       *
       * @param index - Index in `stage.events`.
       * @returns `true` when it would fire.
       */
      eventActive(index: number): boolean;
    } | null,
    cameraX: number,
  ): void {
    this.armed.fill(0);
    if (this.locked || this.entered >= 0) return;
    for (let e = 0; e < this.count; e++) {
      if (this.armX[e] >= cameraX || cameraX >= this.until[e]) continue;
      if (runner !== null && !runner.eventActive(this.eventIndex[e])) continue;
      this.arm(this.eventIndex[e]);
    }
  }

  /**
   * Whether a living player ship's centre is inside an entrance's region.
   *
   * @param e - Entrance.
   * @returns `true` when one is.
   */
  private shipInRegion(e: number): boolean {
    const players = this.host.players;
    for (let i = 0; i < players.length; i++) {
      const ship = players[i];
      if (!ship.active || ship.state !== 'alive') continue;
      if (
        ship.x >= this.x0[e] &&
        ship.x < this.x1[e] &&
        ship.y >= this.y0[e] &&
        ship.y < this.y1[e]
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether every ground enemy of an entrance's window was destroyed by the players (at least
   * one appeared).
   *
   * @param e - Entrance.
   * @returns `true` when the condition holds.
   */
  private groundCleared(e: number): boolean {
    const spawned = this.stats.groundSpawned - this.groundSpawned0[e];
    const killed = this.stats.groundKilled - this.groundKilled0[e];
    return spawned > 0 && killed >= spawned;
  }

  /**
   * Whether a playing ship's score shows an entrance's digit at its place.
   *
   * @param e - Entrance.
   * @returns `true` when one does.
   */
  private digitShown(e: number): boolean {
    const players = this.host.players;
    const scores = this.host.scoring.board.scores;
    const place = this.place[e];
    const digit = this.digit[e];
    for (let i = 0; i < players.length && i < scores.length; i++) {
      const ship = players[i];
      if (!ship.active || ship.state === 'dying' || ship.state === 'dead') continue;
      if (Math.floor(scores[i].score / place) % 10 === digit) return true;
    }
    return false;
  }

  /**
   * An entrance opens: it is the entry, every entrance disarms, the entry sound plays.
   *
   * @param e - Entrance.
   */
  private open(e: number): void {
    const host = this.host;
    this.entered = e;
    this.enteredTick = host.tick;
    this.armed.fill(0);
    const x = Math.floor(host.camera.x) | 0;
    host.events.push(SimEventKind.Sfx, SFX_CUES.PowerUpEquip, x, 0, 0);
  }
}

/**
 * Creates the bonus entrances of a World (load time).
 *
 * @param host - The World.
 * @param stats - The World's enemy totals (`EnemySystem.stats`).
 * @param stage - The stage, or `null` (free flight: no entrances).
 * @returns The entrances (none armed, no entry, unlocked).
 *
 * @example
 * ```ts
 * const bonus = createBonusEntrances(world, world.enemies.stats, stage);
 * bonus.arm(eventIndex); // the stage hook
 * bonus.update(); // phase 3
 * if (bonus.entered >= 0) flow.enterBonus(bonus.enteredStage());
 * ```
 */
export function createBonusEntrances(
  host: BonusEntrancesHost,
  stats: EnemyStats,
  stage: StageSpec | null,
): BonusEntrances {
  return new BonusEntrances(host, stats, stage);
}
