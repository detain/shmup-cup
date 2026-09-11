/**
 * # events — simulation → presentation event queue
 *
 * **Responsibility.** The only channel from the simulation to the presentation layer.
 * Game systems push fixed-size event records (SFX cue, music change, particle burst,
 * screen shake, flash, hit-stop, rumble) into a preallocated ring; once per displayed
 * frame the host drains the queue and routes each record to the renderer or the mixer.
 * Records are plain numbers held in typed arrays, so pushing never allocates and a
 * headless run can simply ignore them.
 *
 * The module also owns the canonical **cue registries** {@link SFX_CUES} and
 * {@link MUSIC_CUES}: the numeric ids the simulation emits. Audio content maps its
 * sounds onto these names (`content/audio/`, M1-15), so the sim never handles strings.
 *
 * **Implements.**
 * - shmup_feat.md §22 Architecture — read-only state + event queue (SFX, particles, shake, flash)
 * - shmup_feat.md §18 / §19 / §20 — effects, audio cues and "juice" triggered by sim events
 *
 * **Public API (implemented now).** {@link SimEventKind}, {@link SIM_EVENT_KIND_NAMES},
 * {@link SFX_CUES}, {@link SFX_CUE_NAMES}, {@link SfxCue}, {@link MUSIC_CUES},
 * {@link MUSIC_CUE_NAMES}, {@link MusicCue}, {@link FX_CUES}, {@link FX_CUE_NAMES}, {@link FxCue},
 * {@link SimEvent}, {@link EventQueue},
 * {@link DEFAULT_EVENT_QUEUE_CAPACITY}, {@link createEventQueue}.
 *
 * **Planned API (later steps).** More cue names as weapons, bosses and menus land; a
 * replay-side event log for attract mode (M2-15).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'events',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §18', 'shmup_feat.md §19', 'shmup_feat.md §20'],
});

/**
 * Categories of presentation events, as numeric codes.
 *
 * @remarks
 * Codes are part of the replay/debug format: append new kinds at the end, never
 * renumber. The dispatcher in `@shmup/shell` switches on these values.
 */
export const SimEventKind = {
  /** Play a sound effect: `id` is an {@link SFX_CUES} value, `param` a priority hint. */
  Sfx: 0,
  /** Change music: `id` is a {@link MUSIC_CUES} value, `param` a fade length in ticks. */
  Music: 1,
  /**
   * Spawn a particle burst at `x`/`y`: `id` is an {@link FX_CUES} value, `param` an intensity
   * (enemy explosions push 1).
   */
  Particles: 2,
  /** Shake the screen: `param` is the magnitude in pixels. */
  Shake: 3,
  /** Flash the screen: `param` is the duration in ticks. */
  Flash: 4,
  /** Freeze the simulation for `param` ticks (big hits, boss kills). */
  HitStop: 5,
  /** Rumble a gamepad: `id` is the player index, `param` the magnitude. */
  Rumble: 6,
  /**
   * A formation was destroyed completely (M1-08): `x`/`y` = the last kill (where its capsule
   * drops), `id` = the formation slot, `param` = the bonus points from the stage event.
   */
  FormationBonus: 7,
} as const;

/** One of the {@link SimEventKind} codes. */
export type SimEventKind = (typeof SimEventKind)[keyof typeof SimEventKind];

/** Kind names indexed by {@link SimEventKind} code — for debug overlays and test output. */
export const SIM_EVENT_KIND_NAMES: readonly string[] = Object.freeze([
  'sfx',
  'music',
  'particles',
  'shake',
  'flash',
  'hitstop',
  'rumble',
  'formationBonus',
]);

/**
 * Canonical sound-effect cues (shmup_feat.md §19 "Core SFX").
 *
 * @remarks
 * The simulation emits these ids; `content/audio/sfx.json` binds each name to a
 * synthesised or recorded sample (M1-15). Ids are stable: append, never renumber.
 */
export const SFX_CUES = {
  /** Player main shot. */
  PlayerShot: 0,
  /** Player missile / sub-weapon launch. */
  PlayerMissile: 1,
  /** Looping laser hum while the laser is held. */
  LaserHum: 2,
  /** Small tick when a shot damages an enemy that survives. */
  EnemyHit: 3,
  /** Small enemy destroyed. */
  EnemyExplodeSmall: 4,
  /** Medium enemy destroyed. */
  EnemyExplodeMedium: 5,
  /** Large enemy destroyed. */
  EnemyExplodeLarge: 6,
  /** One explosion of a boss death chain. */
  BossExplode: 7,
  /** The player ship is destroyed. */
  PlayerDeath: 8,
  /** Power capsule collected. */
  CapsulePickup: 9,
  /** Power meter cursor advances one slot. */
  MeterAdvance: 10,
  /** A meter slot is equipped. */
  PowerUpEquip: 11,
  /** Shield absorbs a hit. */
  ShieldHit: 12,
  /** Shield is depleted. */
  ShieldBreak: 13,
  /** Extra life awarded. */
  ExtraLife: 14,
  /** Mega Crash / smart bomb detonation. */
  MegaCrash: 15,
  /** Menu cursor moved. */
  MenuMove: 16,
  /** Menu entry confirmed. */
  MenuSelect: 17,
  /** Menu cancelled / backed out. */
  MenuBack: 18,
  /** Pause toggled. */
  PauseToggle: 19,
  /** The boss WARNING siren (shmup_feat.md §19). */
  WarningSiren: 20,
  /** A player shot bounces off an armoured (invulnerable) enemy part (M1-10). */
  Clink: 21,
} as const;

/** One of the {@link SFX_CUES} ids. */
export type SfxCue = (typeof SFX_CUES)[keyof typeof SFX_CUES];

/** SFX cue names indexed by id — the order audio content is validated against. */
export const SFX_CUE_NAMES: readonly string[] = Object.freeze(Object.keys(SFX_CUES));

/**
 * Canonical music cues (shmup_feat.md §19 "Tracks needed").
 *
 * @remarks
 * `Silence` stops playback. Ids are stable: append, never renumber.
 */
export const MUSIC_CUES = {
  /** Stop the music. */
  Silence: 0,
  /** Title and attract screens. */
  Title: 1,
  /** Weapon-select screen. */
  WeaponSelect: 2,
  /** Zone map between stages. */
  ZoneMap: 3,
  /** The current zone's stage theme. */
  Stage: 4,
  /** Boss theme. */
  Boss: 5,
  /** Final boss theme. */
  FinalBoss: 6,
  /** Stage clear jingle. */
  StageClear: 7,
  /** Game over. */
  GameOver: 8,
  /** High-score name entry. */
  NameEntry: 9,
  /** Ending. */
  Ending: 10,
  /** Credits. */
  Credits: 11,
  /** Bonus stage. */
  BonusStage: 12,
  /** Boss rush. */
  BossRush: 13,
  /** Escape sequence after a boss. */
  Escape: 14,
} as const;

/** One of the {@link MUSIC_CUES} ids. */
export type MusicCue = (typeof MUSIC_CUES)[keyof typeof MUSIC_CUES];

/** Music cue names indexed by id — the order audio content is validated against. */
export const MUSIC_CUE_NAMES: readonly string[] = Object.freeze(Object.keys(MUSIC_CUES));

/**
 * Canonical particle-effect cues: the `id` of {@link SimEventKind.Particles} events.
 *
 * @remarks
 * The simulation emits these ids; `content/fx/` binds each to a particle preset (M1-14, e.g.
 * `explosion.small`). Ids are stable: append, never renumber.
 */
export const FX_CUES = {
  /** A small enemy explodes (popcorn, fliers). */
  ExplosionSmall: 0,
  /** A medium enemy explodes (carriers, turrets, hatches). */
  ExplosionMedium: 1,
  /** A large enemy explodes. */
  ExplosionLarge: 2,
  /** An enemy bullet is cancelled (sparkle — `core/bullets` `cancelAllBullets`, M1-09). */
  BulletCancel: 3,
} as const;

/** One of the {@link FX_CUES} ids. */
export type FxCue = (typeof FX_CUES)[keyof typeof FX_CUES];

/** FX cue names indexed by id. */
export const FX_CUE_NAMES: readonly string[] = Object.freeze(Object.keys(FX_CUES));

/** One event record (fields are reused — never keep a reference after `drain`). */
export interface SimEvent {
  /** Which subsystem handles the event. */
  kind: SimEventKind;
  /** Content id (SFX cue, particle preset, music cue …). */
  id: number;
  /** X position in world pixels, when meaningful. */
  x: number;
  /** Y position in world pixels, when meaningful. */
  y: number;
  /** Kind-specific parameter (priority, magnitude, duration in ticks …). */
  param: number;
}

/** Default ring capacity — comfortably above the busiest tick measured so far. */
export const DEFAULT_EVENT_QUEUE_CAPACITY = 256;

/** Fixed-capacity event ring backed by typed arrays; drops the oldest event when full. */
export interface EventQueue {
  /** Maximum pending events. */
  readonly capacity: number;
  /** Number of pending events. */
  readonly length: number;
  /** How many events were dropped because the ring was full, since the last `clear()`. */
  readonly dropped: number;
  /**
   * Appends an event. Never allocates. When the ring is full the **oldest** pending
   * event is overwritten and {@link EventQueue.dropped} increases (presentation events
   * are best-effort).
   *
   * @param kind - Event category.
   * @param id - Content id (SFX cue, particle preset, music cue …).
   * @param x - X position in world pixels (0 when not meaningful).
   * @param y - Y position in world pixels (0 when not meaningful).
   * @param param - Kind-specific parameter.
   */
  push(kind: SimEventKind, id: number, x: number, y: number, param: number): void;
  /**
   * Visits and removes all events pending when the call starts, in push order.
   *
   * @param visit - Called once per event with a reused record — copy the fields out,
   *   never keep the reference.
   *
   * @remarks
   * Events pushed by `visit` itself stay queued for the next drain, so a visitor that
   * emits events cannot loop forever. If such a visitor pushes more than the ring can
   * hold, the overflow drops the oldest events — the ones this drain has not reached —
   * and the drain stops there (they are counted in {@link EventQueue.dropped}). A
   * visitor that calls {@link EventQueue.clear} also ends the drain.
   */
  drain(visit: (event: Readonly<SimEvent>) => void): void;
  /** Drops all pending events and resets {@link EventQueue.dropped}. */
  clear(): void;
}

/**
 * Creates an event queue.
 *
 * @param capacity - Maximum pending events (default {@link DEFAULT_EVENT_QUEUE_CAPACITY}).
 * @returns An empty queue with all its storage preallocated.
 * @throws {RangeError} If `capacity` is not a positive integer.
 *
 * @example
 * ```ts
 * const events = createEventQueue();
 * events.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeSmall, x, y, 0);
 * events.drain((event) => audio.play(event.id, event.param));
 * ```
 */
export function createEventQueue(capacity: number = DEFAULT_EVENT_QUEUE_CAPACITY): EventQueue {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('event queue capacity must be a positive integer');
  }
  const kinds = new Uint8Array(capacity);
  const ids = new Uint16Array(capacity);
  const xs = new Float64Array(capacity);
  const ys = new Float64Array(capacity);
  const params = new Float64Array(capacity);
  /** The single record handed to `visit` — reused on every event. */
  const record: SimEvent = { kind: SimEventKind.Sfx, id: 0, x: 0, y: 0, param: 0 };
  let head = 0;
  let length = 0;
  let dropped = 0;

  return {
    capacity,
    get length(): number {
      return length;
    },
    get dropped(): number {
      return dropped;
    },
    push(kind: SimEventKind, id: number, x: number, y: number, param: number): void {
      let slot: number;
      if (length === capacity) {
        slot = head;
        head = head + 1 === capacity ? 0 : head + 1;
        dropped += 1;
      } else {
        slot = head + length;
        if (slot >= capacity) slot -= capacity;
        length += 1;
      }
      kinds[slot] = kind;
      ids[slot] = id;
      xs[slot] = x;
      ys[slot] = y;
      params[slot] = param;
    },
    drain(visit: (event: Readonly<SimEvent>) => void): void {
      // Each slot is released just before its visit, so anything the visitor pushes
      // lands behind the events this drain has not reached yet.
      let remaining = length;
      while (remaining > 0 && length > 0) {
        const slot = head;
        record.kind = kinds[slot] as SimEventKind;
        record.id = ids[slot];
        record.x = xs[slot];
        record.y = ys[slot];
        record.param = params[slot];
        head = head + 1 === capacity ? 0 : head + 1;
        length -= 1;
        remaining -= 1;
        const droppedBefore = dropped;
        visit(record);
        // A visitor that pushes more than the ring can hold overwrites the oldest
        // pending events — which are exactly the ones this drain still owed a visit.
        const lost = dropped - droppedBefore;
        if (lost > 0) remaining = lost >= remaining ? 0 : remaining - lost;
      }
    },
    clear(): void {
      head = 0;
      length = 0;
      dropped = 0;
    },
  };
}
