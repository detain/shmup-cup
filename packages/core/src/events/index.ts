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
 * {@link SFX_CUES}, {@link SFX_CUE_NAMES}, {@link SfxCue}, {@link SfxPriority}, {@link MUSIC_CUES},
 * {@link MUSIC_CUE_NAMES}, {@link MusicCue}, {@link FX_CUES}, {@link FX_CUE_NAMES}, {@link FxCue},
 * {@link UserOptionKind}, {@link SimEvent}, {@link EventQueue},
 * {@link DEFAULT_EVENT_QUEUE_CAPACITY}, {@link createEventQueue}.
 *
 * **Planned API (later steps).** More cue names as weapons, bosses and menus land. (Attract mode
 * — M2-15 — plays its demo World into a private queue and forwards the non-audio events to the
 * session's; no replay-side event log is needed.)
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
  /**
   * Shake the screen: `param` is the magnitude in pixels, `id` the duration in ticks over which it
   * decays (`core/fx` `requestShake`, M1-12).
   */
  Shake: 3,
  /**
   * Flash the screen: `id` is the `core/fx` `FlashKind`, `param` the duration in ticks (Mega Crash
   * pushes kind 0 for 12 ticks — `core/fx` `requestFlash`).
   */
  Flash: 4,
  /**
   * The simulation freezes for `param` ticks (big hits, boss kills — `core/fx` `requestHitStop`,
   * M1-12). Informational: the World already froze itself.
   */
  HitStop: 5,
  /** Rumble a gamepad: `id` is the player index, `param` the magnitude. */
  Rumble: 6,
  /**
   * A formation was destroyed completely (M1-08): `x`/`y` = the last kill (where its capsule
   * drops), `id` = the formation slot, `param` = the bonus points from the stage event.
   */
  FormationBonus: 7,
  /**
   * A power-meter slot was equipped (M1-11; callouts, HUD flash): `id` = the `core/powerups`
   * `MeterSlot` code, `x`/`y` = the ship (whole pixels), `param` = the player slot.
   */
  PowerUp: 8,
  /**
   * Duck the music (shmup_feat.md §19 ducking — the player's death, M1-12): `param` = ticks until
   * it is back at full volume, `id` = the player slot.
   */
  MusicDuck: 9,
  /**
   * Darken the playfield (the boss WARNING, M1-13): `id` = the level in percent (0 = clear, 100 =
   * black), `param` = how long in ticks (the presentation fades back afterwards).
   */
  Dim: 10,
  /**
   * A boss was defeated — the score tally of its death sequence (M1-13): `id` = the boss's
   * `ContentDb.enemies` index, `x`/`y` = where it exploded (whole pixels), `param` = the points
   * awarded.
   */
  BossDefeated: 11,
  /**
   * Points were scored at a place (the score popups of plan M1-14): `id` = the player slot
   * credited, `x`/`y` = where (whole world pixels — the kill, the boss part), `param` = the
   * points (whole). Pushed by `core/scoring` for enemy kills and by `core/bosses` for boss parts;
   * formation bonuses and the boss tally keep their own events
   * ({@link SimEventKind.FormationBonus}, {@link SimEventKind.BossDefeated}); capsule pickups
   * (on the ship) push none.
   */
  Score: 12,
  /**
   * The player changed a user option in the Options screen (M1-17, shmup_feat.md §21): `id` = a
   * {@link UserOptionKind} code, `param` = the new value — a volume level `0…10` (the host sets the
   * bus gain, `core/config` `volumeGain`), for `InputProfile`, the index of the chosen profile in
   * the scene flow's profile choices (the host applies that profile to its input adapter), or, for
   * `BulletPalette` (M2-02), the index of the bullet palette in `BULLET_PALETTES`; for `ScaleMode`
   * (M2-08) the index in `SCALE_MODES`; for `ScreenShake` / `ReduceFlashing` / `ShowHitbox` (M2-08)
   * and `BossHpBar` (M2-09) 1 = on, 0 = off. Pushed
   * live, on every change; the save is written when the screen closes.
   */
  UserOption: 13,
  /**
   * A boss escaped when its time limit ran out (M2-09, shmup_feat.md §13 "boss timer / escape"):
   * `id` = the boss's `ContentDb.enemies` index, `x`/`y` = its origin as it left (whole world
   * pixels), `param` 0. No tally; a stage boss's escape sets the World's `BossEscaped` ending flag.
   */
  BossEscaped: 14,
  /**
   * Prepare the presentation of a stage that is about to be played (M2-10 — the zone map, while
   * the player's choice launches; the title, for the next run's start stage; a run or practice
   * start, for its own stage — each only when the stage differs from the one last prepared):
   * `id` = the stage's `ContentDb.stages` index. The host loads
   * what the stage needs before its World starts — its music set (`@shmup/shell` asks the audio
   * engine to prepare it, keeping the title theme); the tileset art is resident in the one atlas.
   */
  PrepareStage: 15,
  /**
   * Play a music track of the host's library from the sound test (M2-15, shmup_feat.md §21 "sound
   * test"): `id` = the track's index in the list the scene flow was given
   * (`core/scenes` `SoundTestSetup.music` — `@shmup/shell` passes the music library's titles in
   * library order). The host loads the track when it is not resident and plays it; `Music`
   * `Silence` stops it like any track.
   */
  SoundTest: 16,
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
  'powerUp',
  'musicDuck',
  'dim',
  'bossDefeated',
  'score',
  'userOption',
  'bossEscaped',
  'prepareStage',
  'soundTest',
]);

/**
 * What a {@link SimEventKind.UserOption} event changed (its `id`). Codes are stable: append, never
 * renumber.
 */
export const UserOptionKind = {
  /** MASTER volume: `param` = level 0–10 (the `master` bus). */
  MasterVolume: 0,
  /** MUSIC volume: `param` = level 0–10 (the `music` bus). */
  MusicVolume: 1,
  /** SFX volume: `param` = level 0–10 (the `sfx` and `ui` buses). */
  SfxVolume: 2,
  /** CONTROLS: `param` = index of the chosen input profile in the flow's profile choices. */
  InputProfile: 3,
  /**
   * BULLETS (M2-02): `param` = index of the chosen enemy bullet palette in `core/config`
   * `BULLET_PALETTES` (the host re-resolves the renderer's bullet sprites).
   */
  BulletPalette: 4,
  /**
   * SCALE (M2-08): `param` = index of the chosen scale mode in `core/config` `SCALE_MODES` (the
   * host re-places the frame on the display).
   */
  ScaleMode: 5,
  /** SHAKE (M2-08): `param` = 1 (screen shake on) or 0 (off). */
  ScreenShake: 6,
  /** FLASHES (M2-08): `param` = 1 (reduced flashing) or 0 (normal). */
  ReduceFlashing: 7,
  /** HITBOX (M2-08): `param` = 1 (draw the ships' hitbox markers) or 0 (hide them). */
  ShowHitbox: 8,
  /** BOSS HP (M2-09): `param` = 1 (draw the boss HP bar in the top HUD bar) or 0 (hide it). */
  BossHpBar: 9,
  /**
   * The input side of the controls changed (M2-16: SOCD, the release debounce, a rebinding or a
   * reset): the host re-applies the save's `options.input` (already stored — `core/save`
   * `SaveStore.options`) to its input adapter; `param` is unused (0).
   */
  InputSettings: 10,
} as const;

/** A {@link UserOptionKind} code. */
export type UserOptionKind = (typeof UserOptionKind)[keyof typeof UserOptionKind];

/**
 * Priority hints carried by `SimEventKind.Sfx` events in `param` (the mixer of M1-15 maps them to
 * its tiers; `Default` = the cue's own priority from `content/audio/`). Only rare, must-hear cues
 * pass one — the boss WARNING siren is `Critical` (never stolen, shmup_feat.md §19).
 */
export const SfxPriority = {
  /** Use the cue's own priority. */
  Default: 0,
  /** Background detail. */
  Low: 1,
  /** Ordinary effects. */
  Normal: 2,
  /** Important feedback (deaths, 1UPs). */
  High: 3,
  /** Never stolen by another voice (the WARNING siren). */
  Critical: 4,
} as const;

/** A {@link SfxPriority} value. */
export type SfxPriority = (typeof SfxPriority)[keyof typeof SfxPriority];

/**
 * Canonical sound-effect cues (shmup_feat.md §19 "Core SFX").
 *
 * @remarks
 * The simulation emits these ids; `content/audio/main.sfx.json` binds each name to a
 * synthesised or recorded sample (`@shmup/audio-web` `loader`, M1-15). Ids are stable: append,
 * never renumber.
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
  /**
   * Power capsule collected (a Direct-mode item pickup, M2-05; meter-mode capsules push
   * {@link SFX_CUES.MeterAdvance} instead — M1-11).
   */
  CapsulePickup: 9,
  /**
   * Power meter cursor advances one slot — the meter "ding" of every capsule pickup
   * (`core/powerups`, M1-11; `x`/`y` = the ship).
   */
  MeterAdvance: 10,
  /**
   * A meter slot is equipped (`core/powerups`, M1-11; pushed with a `SimEventKind.PowerUp`
   * event).
   */
  PowerUpEquip: 11,
  /** Shield absorbs a hit that costs it one point (`core/shields` Force Field, M1-11). */
  ShieldHit: 12,
  /** Shield is depleted — its last hit (M1-11; pushed with `FX_CUES.ShieldBreak`). */
  ShieldBreak: 13,
  /** Extra life awarded. */
  ExtraLife: 14,
  /**
   * Mega Crash / smart bomb detonation (the meter's `!` slot, M1-11 — pushed with a
   * `SimEventKind.Flash`).
   */
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
  /** The power-up button was pressed on an empty or un-equippable meter slot (M1-11). */
  PowerUpDenied: 22,
  /**
   * The Option Hunter's alarm: one appeared (`core/enemies`, M2-04 — shmup_feat.md §11 "audible
   * cue"; `x`/`y` = where it spawned).
   */
  OptionHunter: 23,
  /** An Option Hunter grabbed Options (M2-04; `x`/`y` = the first Option taken). */
  OptionStolen: 24,
  /**
   * A player joined a co-op game or came back with a continue while the other played on
   * (`core/world` `joinPlayer`, M2-06; `x`/`y` = where the ship flies in).
   */
  PlayerJoin: 25,
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
  /** A shield broke (its last hit — `core/shields`, M1-11): `x`/`y` = the ship. */
  ShieldBreak: 4,
  /** Wreckage of the player's ship flying apart (the death sequence, M1-12): `x`/`y` = the ship. */
  Debris: 5,
  /**
   * One explosion of a boss's death chain (`core/bosses`, M1-13): `x`/`y` = a random point of the
   * boss (cosmetic RNG).
   */
  BossChain: 6,
  /** The final blast of a boss's death sequence (M1-13): `x`/`y` = the boss's origin. */
  BossBlast: 7,
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
