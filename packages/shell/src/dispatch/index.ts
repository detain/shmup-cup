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
 * **Options (M1-17).** {@link connectOptionEvents} applies what the Options screen changes, live:
 *
 * | Event | Handler |
 * |---|---|
 * | `UserOption` `MasterVolume` / `MusicVolume` (`param` = level 0–10) | `audio.setBusVolume('master' / 'music', volumeGain(level))` |
 * | `UserOption` `SfxVolume` | the same for the `sfx` **and** `ui` buses (menu sounds follow SFX) |
 * | `UserOption` `InputProfile` (`param` = choice index) | the host's profile callback |
 * | `UserOption` `BulletPalette` (`param` = `BULLET_PALETTES` index, M2-02) | the palette callback (the renderer's `setBulletPalette`) |
 * | `UserOption` `ScaleMode` (`param` = `SCALE_MODES` index, M2-08) | `display.setScaleMode` |
 * | `UserOption` `ScreenShake` / `ReduceFlashing` (`param` 1 = on, M2-08) | `display.effects.settings.screenShake` / `.reduceFlashing` |
 * | `UserOption` `ShowHitbox` (`param` 1 = on, M2-08) | `display.setShowHitbox` |
 * | `UserOption` `InputSettings` (M2-16: SOCD, debounce or a rebinding stored in the save) | the host's settings callback (re-applies the save's `options.input`) |
 *
 * **Stages (M2-10).** {@link connectStagePreparation} answers `PrepareStage` (the zone map pushes
 * it while its choice launches, the title for the next run's start stage, a run or practice start
 * for its own stage — each only when the set changes; `id` = the stage's `ContentDb.stages`
 * index): the audio engine
 * prepares that stage's music set together with the title theme (the one-set-resident rule would
 * otherwise drop it); a failure is reported to the host's callback and never breaks the game (the
 * stage then plays silent cues).
 *
 * **Sound test (M2-15).** {@link connectSoundTest} answers `SoundTest` (`id` = the music library
 * index of the track the sound test's MUSIC row chose): the audio engine loads it when it is not
 * resident and plays it.
 *
 * {@link applyAudioOptions} sets all three volumes from saved options at boot;
 * {@link applyDisplayOptions} (M2-08) hands the saved display options to the renderer (the bullet
 * palette, the scale mode, shake, flash reduction and the hitbox markers).
 *
 * **Implements.**
 * - shmup_feat.md §22 Architecture — presentation fed by read-only views + the event queue
 * - shmup_feat.md §19 / §20 — audio cues and "juice" triggered by sim events (handlers M1-14/15)
 *
 * **Public API.** {@link createEventDispatcher}, {@link EventDispatcher},
 * {@link SimEventHandler}, {@link connectFxEvents}, {@link FxTargets},
 * {@link connectAudioEvents}, {@link AudioEventTarget}, {@link CameraPosition},
 * {@link connectOptionEvents}, {@link applyAudioOptions}, {@link VolumeTarget},
 * {@link applyDisplayOptions}, {@link DisplayTarget} (M2-08), {@link connectStagePreparation},
 * {@link StagePreparationTarget} (M2-10), {@link connectSoundTest}, {@link SoundTestTarget}
 * (M2-15), {@link connectRumbleEvents} (M3-01 — gamepad rumble).
 *
 * @module
 */
import {
  ASPECT_MODES,
  BULLET_PALETTES,
  CRT_FILTERS,
  MUSIC_CUES,
  SCALE_MODES,
  SIM_EVENT_KIND_NAMES,
  SimEventKind,
  UserOptionKind,
  defineModule,
  volumeGain,
  type AspectMode,
  type AudioBus,
  type AudioOptions,
  type BulletPalette,
  type CrtFilter,
  type DisplayOptions,
  type EventQueue,
  type ScaleMode,
  type SimEvent,
  type StageSpec,
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
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §19', 'shmup_feat.md §20', 'shmup_feat.md §21'],
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

/** What prepares a stage's music (`@shmup/audio-web` `AudioEngine` has it). */
export interface StagePreparationTarget {
  /**
   * Prepares a loading phase's music set (releases the rest).
   *
   * @param stageId - The stage about to run.
   * @param cues - The cues to prepare.
   * @returns Resolves when the set is ready.
   */
  prepareMusic(stageId: string | null, cues?: readonly number[]): Promise<void>;
}

/**
 * Registers the `PrepareStage` handler (M2-10 — the zone map's launch, the title's return to the
 * start stage, a run or practice start): the stage's music set
 * (`cuesOf(stage)` — the shell passes `@shmup/audio-web` `stageMusicCues`) plus the title theme
 * is prepared in the background. An index outside `stages` is ignored.
 *
 * @remarks
 * The engine gets a new list — the title theme first, then the picker's cues without it — so a
 * picker may return a shared (memoised) array: it is never modified.
 *
 * @param dispatcher - The dispatcher.
 * @param audio - The audio engine.
 * @param stages - The content's stages (`ContentDb.stages`).
 * @param cuesOf - The music cues a stage can ask for.
 * @param onError - Called when the preparation fails (default: ignored — the cues stay silent).
 * @returns A function that unregisters the handler.
 *
 * @example
 * ```ts
 * connectStagePreparation(events, engine, game.content.stages, stageMusicCues);
 * ```
 */
export function connectStagePreparation(
  dispatcher: EventDispatcher,
  audio: StagePreparationTarget,
  stages: readonly StageSpec[],
  cuesOf: (stage: StageSpec) => number[],
  onError: (error: unknown) => void = () => {},
): () => void {
  return dispatcher.on(SimEventKind.PrepareStage, (event) => {
    const stage = stages[event.id];
    if (stage === undefined) return;
    // The title theme stays resident: the run returns to the title afterwards. A new list (the
    // picker's own may be shared), the title first and once.
    const cues: number[] = [MUSIC_CUES.Title];
    for (const cue of cuesOf(stage)) if (cue !== MUSIC_CUES.Title) cues.push(cue);
    audio.prepareMusic(stage.id, cues).catch(onError);
  });
}

/** What plays the sound test's tracks (`@shmup/audio-web` `AudioEngine` has it — M2-15). */
export interface SoundTestTarget {
  /**
   * Plays a music library track by index (loading it first when it is not resident).
   *
   * @param index - Index into the library.
   * @param fadeTicks - Fade-in.
   * @returns Resolves with whether it started.
   */
  playTrack(index: number, fadeTicks?: number): Promise<boolean>;
}

/**
 * Registers the `SoundTest` handler (M2-15 — the sound test's MUSIC row): `id` = the track's
 * index in the music library (the titles the host handed the scene flow, in library order); the
 * audio engine loads it when needed and plays it. A failure goes to the host's callback and never
 * breaks the menu (the track stays silent).
 *
 * @param dispatcher - The dispatcher.
 * @param audio - The audio engine.
 * @param onError - Called when the track fails to load (default: ignored).
 * @returns A function that unregisters the handler.
 *
 * @example
 * ```ts
 * connectSoundTest(events, engine);
 * ```
 */
export function connectSoundTest(
  dispatcher: EventDispatcher,
  audio: SoundTestTarget,
  onError: (error: unknown) => void = () => {},
): () => void {
  return dispatcher.on(SimEventKind.SoundTest, (event) => {
    audio.playTrack(event.id, 0).catch(onError);
  });
}

/**
 * Connects the core's rumble events to a player's gamepads (M3-01 — shmup_feat.md §4 "[P2] Rumble
 * via `vibrationActuator.playEffect()`"): each `SimEventKind.Rumble` (`id` = the player slot,
 * `param` = the strength — 1 a death, 2 a boss blast) rumbles that player's pads while `enabled()`
 * says so (the save's RUMBLE option).
 *
 * @param dispatcher - The shell's event dispatcher.
 * @param rumble - Rumbles a player's pads (the input adapter's `rumble`).
 * @param enabled - Whether rumble is on now (read at every event).
 * @returns A function that unregisters the handler (idempotent).
 *
 * @example
 * ```ts
 * connectRumbleEvents(shell.events, (p, s) => input.rumble(p, s), () => save.options.play.rumble);
 * ```
 */
export function connectRumbleEvents(
  dispatcher: EventDispatcher,
  rumble: (player: number, strength: number) => void,
  enabled: () => boolean,
): () => void {
  return dispatcher.on(SimEventKind.Rumble, (event) => {
    if (enabled()) rumble(event.id, event.param);
  });
}

/** Where volumes go — the audio back-end (`IAudio` has it). */
export interface VolumeTarget {
  /**
   * Sets a bus volume.
   *
   * @param bus - Bus name.
   * @param volume - Linear gain 0…1.
   */
  setBusVolume(bus: AudioBus, volume: number): void;
}

/**
 * Sets the bus volumes from the player's audio options (boot, after the save is read): `master`,
 * `music`, and `sfx` + `ui` from the SFX level, each through `volumeGain` (the perceptual curve —
 * level 10 → 1, 5 → 0.25, 0 → silent).
 *
 * @param audio - The audio back-end.
 * @param options - Levels 0–10.
 *
 * @example
 * ```ts
 * applyAudioOptions(audio, save.options.audio);
 * ```
 */
export function applyAudioOptions(audio: VolumeTarget, options: AudioOptions): void {
  audio.setBusVolume('master', volumeGain(options.master));
  audio.setBusVolume('music', volumeGain(options.music));
  audio.setBusVolume('sfx', volumeGain(options.sfx));
  audio.setBusVolume('ui', volumeGain(options.sfx));
}

/**
 * What the display options change (plan M2-08) — `@shmup/render-pixi`'s `PixiRenderer` satisfies
 * it.
 */
export interface DisplayTarget {
  /**
   * Switches the enemy bullet palette.
   *
   * @param palette - The palette.
   */
  setBulletPalette(palette: BulletPalette): void;
  /**
   * Switches the scale mode.
   *
   * @param mode - The mode.
   */
  setScaleMode(mode: ScaleMode): void;
  /**
   * Shows or hides the ships' hitbox markers.
   *
   * @param on - `true` to show them.
   */
  setShowHitbox(on: boolean): void;
  /**
   * Switches the CRT / scanline filter (M3-02). Absent: CRT events are ignored.
   *
   * @param setting - One of `core/config` `CRT_FILTERS`.
   */
  setCrtFilter?(setting: CrtFilter): void;
  /**
   * Switches how the picture is shaped on the display (M3-02). Absent: aspect events are ignored.
   *
   * @param mode - One of `core/config` `ASPECT_MODES`.
   */
  setAspect?(mode: AspectMode): void;
  /** The screen effects, whose settings hold the shake switch and reduced flashing. */
  readonly effects: {
    /** Mutable effect settings. */
    readonly settings: {
      /** Screen shake on. */
      screenShake: boolean;
      /** Reduced flashing on. */
      reduceFlashing: boolean;
    };
  };
}

/**
 * Hands saved display options to the renderer (boot, after the save is read — plan M2-08): the
 * bullet palette, the scale mode, the shake switch, reduced flashing and the hitbox markers.
 *
 * @param target - The renderer.
 * @param display - The options.
 *
 * @example
 * ```ts
 * applyDisplayOptions(renderer, save.options.display);
 * ```
 */
export function applyDisplayOptions(target: DisplayTarget, display: DisplayOptions): void {
  target.setBulletPalette(display.bulletPalette);
  target.setScaleMode(display.scaleMode);
  target.effects.settings.screenShake = display.screenShake;
  target.effects.settings.reduceFlashing = display.reduceFlashing;
  target.setShowHitbox(display.showHitbox);
  // M3-02: the CRT filter and the picture's shape (a target without them keeps its own).
  target.setCrtFilter?.(display.crtFilter);
  target.setAspect?.(display.aspect);
}

/**
 * Registers the Options screen's handler (plan M1-17, see the module docs): a `UserOption` event
 * sets a bus volume, calls `onInputProfile` with the chosen profile's index or (M2-02)
 * `onBulletPalette` with the chosen bullet palette's name, (M2-08) changes a display option of
 * `display`, or (M2-16) calls `onInputSettings` to re-apply the saved input settings. Load time —
 * registering allocates the handler; the events allocate nothing here.
 *
 * @remarks
 * `UserOptionKind.BossHpBar` (M2-09) — and any kind it does not know — is ignored: the boss HP
 * bar is drawn by the core's HUD, which the scene flow points at the **saved** option every
 * displayed frame (`Hud.showBossHp`), so nothing in the presentation needs the live event.
 *
 * @param dispatcher - The shell's event dispatcher.
 * @param audio - The audio back-end.
 * @param onInputProfile - Applies the profile at an index of the flow's profile choices, or `null`
 *   (profile events are ignored).
 * @param onBulletPalette - Applies a bullet palette (M2-02 — normally `renderer.setBulletPalette`);
 *   it receives the name the event's `BULLET_PALETTES` index stands for. `null` / omitted: palette
 *   events are ignored (so is an index outside `BULLET_PALETTES`).
 * @param display - The renderer's display options (M2-08: scale mode, shake, flash reduction,
 *   hitbox markers), or `null` / omitted (those events are ignored — so is a scale-mode index outside
 *   `SCALE_MODES`).
 * @param onInputSettings - Re-applies the save's input settings (M2-16 — `UserOptionKind`
 *   `InputSettings`: SOCD, the release debounce, the rebinding — already stored in the save), or
 *   `null` / omitted (those events are ignored).
 * @returns A function that unregisters the handler (idempotent).
 *
 * @example
 * ```ts
 * connectOptionEvents(
 *   shell.events,
 *   audio,
 *   (index) => profiles.apply(choices[index].id, 'options'),
 *   (palette) => renderer.setBulletPalette(palette),
 *   renderer, // M2-08: scale mode, shake, flashing, hitbox markers
 * );
 * ```
 */
export function connectOptionEvents(
  dispatcher: EventDispatcher,
  audio: VolumeTarget,
  onInputProfile: ((index: number) => void) | null,
  onBulletPalette: ((palette: BulletPalette) => void) | null = null,
  display: DisplayTarget | null = null,
  onInputSettings: (() => void) | null = null,
): () => void {
  return dispatcher.on(SimEventKind.UserOption, (event) => {
    const value = event.param;
    switch (event.id) {
      case UserOptionKind.MasterVolume:
        audio.setBusVolume('master', volumeGain(value));
        break;
      case UserOptionKind.MusicVolume:
        audio.setBusVolume('music', volumeGain(value));
        break;
      case UserOptionKind.SfxVolume:
        audio.setBusVolume('sfx', volumeGain(value));
        audio.setBusVolume('ui', volumeGain(value));
        break;
      case UserOptionKind.InputProfile:
        if (onInputProfile !== null) onInputProfile(value);
        break;
      case UserOptionKind.BulletPalette: {
        const palette = BULLET_PALETTES[value];
        if (onBulletPalette !== null && palette !== undefined) onBulletPalette(palette);
        break;
      }
      case UserOptionKind.ScaleMode: {
        const mode = SCALE_MODES[value];
        if (display !== null && mode !== undefined) display.setScaleMode(mode);
        break;
      }
      case UserOptionKind.ScreenShake:
        if (display !== null) display.effects.settings.screenShake = value !== 0;
        break;
      case UserOptionKind.ReduceFlashing:
        if (display !== null) display.effects.settings.reduceFlashing = value !== 0;
        break;
      case UserOptionKind.ShowHitbox:
        if (display !== null) display.setShowHitbox(value !== 0);
        break;
      case UserOptionKind.CrtFilter: {
        const setting = CRT_FILTERS[value];
        if (display !== null && setting !== undefined) display.setCrtFilter?.(setting);
        break;
      }
      case UserOptionKind.Aspect: {
        const mode = ASPECT_MODES[value];
        if (display !== null && mode !== undefined) display.setAspect?.(mode);
        break;
      }
      case UserOptionKind.InputSettings:
        if (onInputSettings !== null) onInputSettings();
        break;
      default:
        break;
    }
  });
}
