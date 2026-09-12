/**
 * # fx — deterministic game-feel state (hit-stop, shake, flash)
 *
 * **Status: partial.** Hit-stop, screen-shake and screen-flash *requests* are implemented (plan
 * M1-12): each sets a simulation timer and pushes the matching presentation event. Particles, the
 * hit flash of sprites and the shake / flash rendering live in the presentation layer (M1-14);
 * the optional "authentic slowdown" is M3.
 *
 * **Responsibility.** Game-feel state that must live in the simulation because it affects timing or is
 * replayed: hit-stop counters (4–5 ticks on big events), screen-shake requests (integer
 * pixels, decaying, 3 magnitudes, global off switch), hit-flash timers, and the optional
 * deterministic "authentic slowdown". Particles themselves are cosmetic and live in the
 * presentation layer (driven by events and the cosmetic RNG).
 *
 * **Hit-stop.** {@link requestHitStop} freezes the simulation: the World's `hitStop` counter is
 * raised to the request (never lowered — the longer of two requests wins) and a
 * `SimEventKind.HitStop` event (`param` = ticks) is pushed. `stepWorld` skips phases 2–8 on every
 * tick that *starts* with `hitStop > 0`, and {@link tickFx} (phase 9) counts it down only on such
 * frozen ticks — so a request made during tick `t` freezes exactly ticks `t + 1 … t + n`.
 *
 * **Shake.** {@link requestShake} starts a decaying integer shake of one of the
 * {@link ShakeMagnitude}s; a request weaker than the shake still running is ignored (no event). The
 * current amplitude is {@link shakeAmount}: `ceil(magnitude · ticksLeft / duration)` — it decays to
 * 0 over the duration. The presentation (M1-14) shakes the world layers from the
 * `SimEventKind.Shake` events (`param` = magnitude, `id` = duration in ticks) and owns the global
 * off switch; the sim state only makes the request replayable and inspectable.
 *
 * **Flash.** {@link requestFlash} starts a full-screen flash of a {@link FlashKind}
 * ({@link FLASH_KIND_TICKS} gives its length) and pushes `SimEventKind.Flash` (`id` = the kind,
 * `param` = the duration in ticks). The photosensitivity limiter (≤ 3 flashes a second) is the
 * presentation's (M1-14).
 *
 * **Timers.** Shake and flash count down in phase 9 on every tick, frozen ones included (plan §3.2:
 * "ticks and fx timers still advance"), but not on the tick of their request — a request during
 * tick `t` with duration `n` runs out at the end of tick `t + n`.
 *
 * **Zero allocation.** {@link FxState} is a class with number fields; the functions only write them
 * and push numbers into the event queue (whole numbers — nothing is boxed).
 *
 * **Implements.**
 * - shmup_feat.md §18 — hit flash, screen shake, hit-stop, particles
 * - shmup_feat.md §20 Game feel / "juice"
 * - shmup_feat.md §3 — optional authentic slowdown
 *
 * **Public API.** {@link FxState}, {@link createFxState}, {@link FxHost}, {@link HitStopHost},
 * {@link requestHitStop},
 * {@link requestShake}, {@link requestFlash}, {@link tickFx}, {@link shakeAmount},
 * {@link ShakeMagnitude}, {@link FlashKind}, {@link FLASH_KIND_TICKS}, {@link MAX_HIT_STOP_TICKS},
 * {@link MAX_FX_TICKS}.
 *
 * **Planned API.** Authentic slowdown (M3-02).
 *
 * @module
 */
import { SimEventKind, type EventQueue } from '../events/index.js';
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'fx',
  status: 'partial',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §20', 'shmup_feat.md §3'],
});

/** Longest hit-stop a single request may ask for, in ticks (longer requests are capped). */
export const MAX_HIT_STOP_TICKS = 60;

/** Longest shake or flash a single request may ask for, in ticks (longer ones are capped). */
export const MAX_FX_TICKS = 600;

/**
 * The three shake magnitudes of shmup_feat.md §18 ("integer-pixel, decaying, 3 magnitudes,
 * subtle"), in pixels.
 */
export const ShakeMagnitude = {
  /** A nudge (big enemy explosions). */
  Small: 1,
  /** The player's death. */
  Medium: 2,
  /** Boss kills and other rare, huge events. */
  Large: 4,
} as const;

/** A {@link ShakeMagnitude} value. */
export type ShakeMagnitude = (typeof ShakeMagnitude)[keyof typeof ShakeMagnitude];

/** Kinds of full-screen flash (the `id` of `SimEventKind.Flash`). Append, never renumber. */
export const FlashKind = {
  /** Mega Crash, the meter's `!` slot (`core/powerups`). */
  MegaCrash: 0,
  /** A pulse of the boss WARNING (`core/bosses`, M1-13: one per siren wail, 1 a second). */
  Warning: 1,
  /** The final blast of a boss's death sequence (`core/bosses`, M1-13). */
  BossBlast: 2,
} as const;

/** A {@link FlashKind} code. */
export type FlashKind = (typeof FlashKind)[keyof typeof FlashKind];

/**
 * Duration in ticks of each {@link FlashKind}, by code (Mega Crash: 12 — M1-11's value; a
 * WARNING pulse 8; a boss's final blast 24).
 */
export const FLASH_KIND_TICKS: readonly number[] = Object.freeze([12, 8, 24]);

/**
 * Sim-side effect state of one World (a class, so its fields stay unboxed numbers). Hit-stop
 * itself is the World's `hitStop` counter; this holds the shake and flash timers.
 */
export class FxState {
  /** Magnitude of the running shake in pixels (0 = none). */
  shakeMagnitude = 0;
  /** Ticks of shake remaining; the amplitude decays to 0 over them. */
  shakeTicks = 0;
  /** Length of the running shake in ticks (the decay's denominator). */
  shakeDuration = 0;
  /** Tick of the last accepted shake request (-1 = never): not counted down on that tick. */
  shakeTick = -1;
  /** Full-screen flash ticks remaining. */
  flashTicks = 0;
  /** {@link FlashKind} of the running (or last) flash. */
  flashKind = 0;
  /** Tick of the last flash request (-1 = never): not counted down on that tick. */
  flashTick = -1;
  /**
   * Whether the current tick started frozen by hit-stop (`stepWorld` sets it before the phases
   * run; {@link tickFx} counts the hit-stop down only then).
   */
  frozen = false;
}

/**
 * Creates an idle effect state (no shake, no flash).
 *
 * @returns The state.
 */
export function createFxState(): FxState {
  return new FxState();
}

/** What the shake and flash requests need from their World (the World implements it). */
export interface FxHost {
  /** The tick being run (during a tick) or the next one (between ticks). */
  readonly tick: number;
  /** The World's effect timers. */
  readonly fx: FxState;
  /** Presentation events. */
  readonly events: EventQueue;
}

/** What hit-stop needs from its World: an {@link FxHost} with the World's hit-stop counter. */
export interface HitStopHost extends FxHost {
  /** Remaining hit-stop ticks (`World.hitStop`; phases 2–8 are skipped while > 0). */
  hitStop: number;
}

/**
 * Whole number of ticks in `[0, max]` from a request (NaN and negatives → 0, fractions floored).
 *
 * @param ticks - Requested ticks.
 * @param max - Cap.
 * @returns The clamped count.
 */
function clampTicks(ticks: number, max: number): number {
  if (!(ticks > 0)) return 0;
  return ticks > max ? max : Math.floor(ticks);
}

/**
 * Freezes the simulation for `ticks` ticks (the player's death, boss kills — shmup_feat.md §18).
 * Never allocates.
 *
 * @remarks
 * The World's `hitStop` becomes the larger of its current value and the request (capped at
 * {@link MAX_HIT_STOP_TICKS}; ≤ 0 or NaN does nothing) and a `SimEventKind.HitStop` event with
 * `param` = the request is pushed (also when a longer hit-stop was already running). Requested
 * during tick `t`, it freezes ticks `t + 1 … t + ticks`; requested between ticks, the next `ticks`
 * ticks.
 *
 * @param host - The World.
 * @param ticks - Frozen ticks.
 * @returns The World's hit-stop counter afterwards.
 *
 * @example
 * ```ts
 * requestHitStop(world, 8); // the death sequence
 * ```
 */
export function requestHitStop(host: HitStopHost, ticks: number): number {
  const n = clampTicks(ticks, MAX_HIT_STOP_TICKS);
  if (n === 0) return host.hitStop;
  if (n > host.hitStop) host.hitStop = n;
  host.events.push(SimEventKind.HitStop, 0, 0, 0, n);
  return host.hitStop;
}

/**
 * Starts a decaying screen shake. Never allocates.
 *
 * @remarks
 * Ignored (no event, `false`) when `magnitude` is not positive, `ticks` rounds to 0, or the shake
 * still running is at least as strong right now ({@link shakeAmount}). Otherwise the shake is
 * replaced and `SimEventKind.Shake` (`id` = duration, `param` = magnitude) is pushed. Magnitudes
 * are whole pixels (fractions are floored); use the {@link ShakeMagnitude}s.
 *
 * @param host - The World.
 * @param magnitude - Amplitude in pixels at the start.
 * @param ticks - Duration (capped at {@link MAX_FX_TICKS}).
 * @returns Whether the shake started.
 *
 * @example
 * ```ts
 * requestShake(world, ShakeMagnitude.Medium, 20);
 * ```
 */
export function requestShake(host: FxHost, magnitude: number, ticks: number): boolean {
  const m = clampTicks(magnitude, 64);
  const n = clampTicks(ticks, MAX_FX_TICKS);
  const fx = host.fx;
  if (m === 0 || n === 0 || m <= shakeAmount(fx)) return false;
  fx.shakeMagnitude = m;
  fx.shakeTicks = n;
  fx.shakeDuration = n;
  fx.shakeTick = host.tick;
  host.events.push(SimEventKind.Shake, n, 0, 0, m);
  return true;
}

/**
 * Starts a full-screen flash of a kind. Never allocates.
 *
 * @remarks
 * The flash lasts {@link FLASH_KIND_TICKS}`[kind]` ticks (it replaces a running one) and pushes
 * `SimEventKind.Flash` with `id` = the kind and `param` = the duration. An unknown kind does
 * nothing (`false`).
 *
 * @param host - The World.
 * @param kind - {@link FlashKind}.
 * @returns Whether a flash started.
 *
 * @example
 * ```ts
 * requestFlash(world, FlashKind.MegaCrash); // 12 ticks
 * ```
 */
export function requestFlash(host: FxHost, kind: number): boolean {
  if (!(kind >= 0 && kind < FLASH_KIND_TICKS.length && kind % 1 === 0)) return false;
  const n = FLASH_KIND_TICKS[kind];
  const fx = host.fx;
  fx.flashTicks = n;
  fx.flashKind = kind;
  fx.flashTick = host.tick;
  host.events.push(SimEventKind.Flash, kind, 0, 0, n);
  return true;
}

/**
 * Current shake amplitude in whole pixels: `ceil(magnitude · ticksLeft / duration)`, 0 when no
 * shake runs.
 *
 * @param fx - The effect state.
 * @returns The amplitude.
 *
 * @example
 * ```ts
 * requestShake(world, ShakeMagnitude.Medium, 20);
 * shakeAmount(world.fx); // → 2, falling to 1 after 10 ticks and 0 after 20
 * ```
 */
export function shakeAmount(fx: Readonly<FxState>): number {
  if (fx.shakeTicks <= 0 || fx.shakeDuration <= 0) return 0;
  return Math.ceil((fx.shakeMagnitude * fx.shakeTicks) / fx.shakeDuration) | 0;
}

/**
 * Tick phase 9 (every tick, frozen ones included): counts the hit-stop down when this tick was
 * frozen, and the shake and flash timers unless they were requested on this tick. Never
 * allocates.
 *
 * @remarks
 * `fx.frozen` is written by `stepWorld` before phase 1; code that drives the timers by hand (a
 * tool, a test) sets it the same way. A longer request while frozen (between ticks) simply
 * raises the counter, which then runs down over that many more frozen ticks.
 *
 * @param host - The World.
 */
export function tickFx(host: HitStopHost): void {
  const fx = host.fx;
  if (fx.frozen && host.hitStop > 0) host.hitStop--;
  const tick = host.tick;
  if (fx.shakeTicks > 0 && fx.shakeTick !== tick) {
    fx.shakeTicks--;
    if (fx.shakeTicks === 0) fx.shakeMagnitude = 0;
  }
  if (fx.flashTicks > 0 && fx.flashTick !== tick) fx.flashTicks--;
}
