/**
 * # dispatch — simulation events → presentation handlers
 *
 * **Responsibility.** Routes the records drained from the core's event queue
 * (`game.events`) to the handlers the host registered per `SimEventKind` (SFX, music and ducking
 * → `audio-web`, {@link connectAudioEvents}, M1-15; particles / shake / flash / dim / score popups
 * → `render-pixi`, {@link connectFxEvents}, M1-14). Handlers are
 * registered at load time; dispatching is a table lookup and a loop over a preallocated array,
 * so draining the queue once per frame allocates nothing. Events nobody handles are counted
 * and dropped (a headless-safe default: the sim never depends on presentation).
 *
 * **Game feel (M1-14).** {@link connectFxEvents} registers the renderer's effect handlers:
 *
 * | Event | Handler |
 * |---|---|
 * | `Particles` (`id` = `FX_CUES`, `param` = intensity) | `particles.emitFxCue` — the presets `content/fx/` binds to the cue |
 * | `Sfx` (`id` = `SFX_CUES`) | `particles.emitSfxCue` — the sounds that imply a visual (hit sparks, clinks, pickup rings, muzzle flashes) |
 * | `Shake` (`param` = magnitude, `id` = ticks) | `effects.shake` |
 * | `Flash` (`id` = `FlashKind`, `param` = ticks) | `effects.flash` (behind the ≤ 3-a-second limiter) |
 * | `Dim` (`id` = percent, `param` = ticks) | `effects.dim` |
 * | `Score` / `FormationBonus` / `BossDefeated` (`param` = points) | `popups.show` (white; the bonuses gold) |
 *
 * Positions stay world pixels — the renderer applies the camera when it draws.
 *
 * **Audio (M1-15).** {@link connectAudioEvents} registers the audio engine's handlers
 * (`@shmup/audio-web` `AudioEngine`):
 *
 * | Event | Handler |
 * |---|---|
 * | `Sfx` (`id` = `SFX_CUES`, `x` = world x, `param` = `SfxPriority` hint) | `playSfx(cue, screenX, priority)` — `screenX` = the x relative to the camera, in whole pixels (it pans the sound) |
 * | `Music` (`id` = `MUSIC_CUES`, `param` = fade ticks) | `playMusic(cue, fadeTicks)` |
 * | `MusicDuck` (`param` = ticks) | `duckMusic(ticks)` |
 *
 * **Implements.**
 * - shmup_feat.md §22 Architecture — presentation fed by read-only views + the event queue
 * - shmup_feat.md §19 / §20 — audio cues and "juice" triggered by sim events (handlers M1-14/15)
 *
 * **Public API.** {@link createEventDispatcher}, {@link EventDispatcher},
 * {@link SimEventHandler}, {@link connectFxEvents}, {@link FxTargets},
 * {@link connectAudioEvents}, {@link AudioEventTarget}, {@link CameraPosition}.
 *
 * @module
 */
import {
  SIM_EVENT_KIND_NAMES,
  SimEventKind,
  defineModule,
  type EventQueue,
  type SimEvent,
} from '@shmup/core';
import {
  BONUS_POPUP_COLOR,
  SCORE_POPUP_COLOR,
  type ParticleSystem,
  type ScorePopups,
  type ScreenEffects,
} from '@shmup/render-pixi';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'dispatch',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §19', 'shmup_feat.md §20'],
});

/**
 * Receives one drained event. The record is reused by the queue — copy the fields out,
 * never keep the reference.
 *
 * @param event - The event record.
 */
export type SimEventHandler = (event: Readonly<SimEvent>) => void;

/** Routes sim events to registered handlers. */
export interface EventDispatcher {
  /**
   * Registers a handler for one event kind (load time — registering allocates).
   *
   * @param kind - Event kind to receive.
   * @param handler - Called for every event of that kind, in registration order.
   * @returns A function that unregisters the handler (idempotent).
   * @throws {RangeError} When `kind` is not a known `SimEventKind`.
   */
  on(kind: SimEventKind, handler: SimEventHandler): () => void;
  /**
   * The bound visitor: pass it to `EventQueue.drain` directly
   * (`game.events.drain(dispatcher.visit)`).
   */
  readonly visit: SimEventHandler;
  /**
   * Drains a queue through {@link EventDispatcher.visit}.
   *
   * @param queue - The queue to drain.
   */
  drain(queue: EventQueue): void;
  /**
   * Number of handlers of a kind.
   *
   * @param kind - Event kind.
   * @returns Registered handlers (0 for an unknown kind — never throws).
   */
  handlerCount(kind: SimEventKind): number;
  /** Events dispatched since creation (diagnostics). */
  readonly dispatched: number;
  /** Events that had no handler, since creation (diagnostics). */
  readonly unhandled: number;
}

/**
 * Creates an event dispatcher.
 *
 * @returns A dispatcher with no handlers.
 *
 * @example
 * ```ts
 * const events = createEventDispatcher();
 * events.on(SimEventKind.Shake, (event) => shake.add(event.param));
 * // every frame:
 * game.events.drain(events.visit);
 * ```
 */
export function createEventDispatcher(): EventDispatcher {
  const kinds = SIM_EVENT_KIND_NAMES.length;
  const handlers: SimEventHandler[][] = [];
  for (let i = 0; i < kinds; i++) handlers.push([]);
  let dispatched = 0;
  let unhandled = 0;

  /**
   * Calls the handlers of `event.kind`.
   *
   * @param event - The drained record.
   */
  const visit: SimEventHandler = (event) => {
    dispatched++;
    const list = event.kind < kinds ? handlers[event.kind] : undefined;
    if (list === undefined || list.length === 0) {
      unhandled++;
      return;
    }
    for (let i = 0; i < list.length; i++) list[i](event);
  };

  return {
    visit,
    get dispatched(): number {
      return dispatched;
    },
    get unhandled(): number {
      return unhandled;
    },
    on(kind, handler) {
      const list = Number.isInteger(kind) && kind >= 0 ? handlers[kind] : undefined;
      if (list === undefined) throw new RangeError(`unknown SimEventKind ${kind}`);
      // Copy-on-write, so a handler that unsubscribes during dispatch cannot skip a sibling.
      handlers[kind] = list.concat(handler);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = handlers[kind];
        const index = current.indexOf(handler);
        if (index >= 0) handlers[kind] = current.slice(0, index).concat(current.slice(index + 1));
      };
    },
    drain(queue) {
      queue.drain(visit);
    },
    handlerCount(kind) {
      return handlers[kind]?.length ?? 0;
    },
  };
}

/** The renderer's game-feel parts {@link connectFxEvents} feeds (a `PixiRenderer` has them). */
export interface FxTargets {
  /** The particle pool (`null` = particle events are ignored). */
  readonly particles: ParticleSystem | null;
  /** Shake, flash and playfield dim. */
  readonly effects: ScreenEffects;
  /** Score popups (`null` = score events are ignored). */
  readonly popups: ScorePopups | null;
}

/**
 * Registers the game-feel handlers of plan M1-14 (see the module docs for the table): particle
 * bursts from `Particles` and `Sfx` events, shake, flash, dim and score popups. Load time —
 * registering allocates the handlers; handling an event allocates nothing.
 *
 * @remarks
 * Event positions are passed on as whole world pixels (`Math.floor(x) | 0` — some sounds carry an
 * enemy's fractional position, and a fractional argument to a non-inlined call is boxed). A
 * `Dim` level is `id / 100`. Popups show `param` points (nothing for less than 1).
 *
 * @param dispatcher - The shell's event dispatcher.
 * @param fx - The renderer (or anything with its `particles`, `effects` and `popups`).
 * @returns A function that unregisters every handler (idempotent).
 *
 * @example
 * ```ts
 * const disconnect = connectFxEvents(shell.events, shell.renderer);
 * // every frame: game.events.drain(shell.events.visit) → renderer.render(frame)
 * ```
 */
export function connectFxEvents(dispatcher: EventDispatcher, fx: FxTargets): () => void {
  const { particles, effects, popups } = fx;
  const off: Array<() => void> = [];
  if (particles !== null) {
    off.push(
      dispatcher.on(SimEventKind.Particles, (event) => {
        particles.emitFxCue(
          event.id,
          Math.floor(event.x) | 0,
          Math.floor(event.y) | 0,
          event.param,
        );
      }),
      dispatcher.on(SimEventKind.Sfx, (event) => {
        particles.emitSfxCue(event.id, Math.floor(event.x) | 0, Math.floor(event.y) | 0);
      }),
    );
  }
  off.push(
    dispatcher.on(SimEventKind.Shake, (event) => {
      effects.shake(event.param, event.id);
    }),
    dispatcher.on(SimEventKind.Flash, (event) => {
      effects.flash(event.id, event.param);
    }),
    dispatcher.on(SimEventKind.Dim, (event) => {
      effects.dim(event.id / 100, event.param);
    }),
  );
  if (popups !== null) {
    /**
     * Shows a popup for an event's points.
     *
     * @param event - The drained record.
     * @param color - Tint.
     */
    const popup = (event: Readonly<SimEvent>, color: number): void => {
      popups.show(event.param, Math.floor(event.x) | 0, Math.floor(event.y) | 0, color);
    };
    off.push(
      dispatcher.on(SimEventKind.Score, (event) => popup(event, SCORE_POPUP_COLOR)),
      dispatcher.on(SimEventKind.FormationBonus, (event) => popup(event, BONUS_POPUP_COLOR)),
      dispatcher.on(SimEventKind.BossDefeated, (event) => popup(event, BONUS_POPUP_COLOR)),
    );
  }
  let connected = true;
  return () => {
    if (!connected) return;
    connected = false;
    for (const unregister of off) unregister();
  };
}

/** What {@link connectAudioEvents} feeds — `@shmup/audio-web`'s `AudioEngine` has it. */
export interface AudioEventTarget {
  /**
   * Plays a sound effect.
   *
   * @param cue - `SFX_CUES` id.
   * @param screenX - The event's x relative to the camera, whole pixels.
   * @param priority - The event's `SfxPriority` hint (0 = the cue's own).
   * @returns Anything (ignored).
   */
  playSfx(cue: number, screenX: number, priority: number): unknown;
  /**
   * Changes the music.
   *
   * @param cue - `MUSIC_CUES` id.
   * @param fadeTicks - Fade length in ticks.
   */
  playMusic(cue: number, fadeTicks: number): void;
  /**
   * Ducks the music.
   *
   * @param ticks - Ticks until it is back at full volume.
   */
  duckMusic(ticks: number): void;
}

/** A camera position read when a sound plays (the World's `CameraView`). */
export interface CameraPosition {
  /** World x of the playfield's left edge. */
  readonly x: number;
}

/**
 * Registers the audio handlers of plan M1-15 (see the module docs for the table): `Sfx` →
 * `playSfx`, `Music` → `playMusic`, `MusicDuck` → `duckMusic`. Load time — registering
 * allocates the handlers; handling an event allocates nothing here (the audio engine creates the
 * Web Audio source node of a sound it starts).
 *
 * @remarks
 * A sound's position is passed as whole pixels relative to the camera
 * (`Math.floor(event.x - camera.x) | 0` — 0 at the playfield's left edge), read from the live
 * camera when the event is handled; a fractional argument to a non-inlined call would be boxed.
 *
 * @param dispatcher - The shell's event dispatcher.
 * @param audio - The audio engine (or anything with its three methods).
 * @param camera - The World's camera (`game.world.view.camera`).
 * @returns A function that unregisters every handler (idempotent).
 *
 * @example
 * ```ts
 * const disconnect = connectAudioEvents(shell.events, shell.audioEngine, game.world.view.camera);
 * ```
 */
export function connectAudioEvents(
  dispatcher: EventDispatcher,
  audio: AudioEventTarget,
  camera: CameraPosition,
): () => void {
  const off = [
    dispatcher.on(SimEventKind.Sfx, (event) => {
      audio.playSfx(event.id, Math.floor(event.x - camera.x) | 0, event.param);
    }),
    dispatcher.on(SimEventKind.Music, (event) => {
      audio.playMusic(event.id, event.param);
    }),
    dispatcher.on(SimEventKind.MusicDuck, (event) => {
      audio.duckMusic(event.param);
    }),
  ];
  let connected = true;
  return () => {
    if (!connected) return;
    connected = false;
    for (const unregister of off) unregister();
  };
}
