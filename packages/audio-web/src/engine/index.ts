/**
 * # engine — the game's audio: SFX bank + music set on top of the Web Audio buses
 *
 * **Responsibility.** Composes the `loader`, `sfx` and `music` modules into the one object the
 * shell's event dispatch talks to (plan §3.3 — `sfx` / `music` events → audio-web):
 *
 * 1. **Loading phases.** {@link AudioEngine.loadSfx} renders / decodes the whole SFX bank during
 *    boot; {@link AudioEngine.prepareMusic} prepares a stage's music set (its theme, the boss,
 *    the stage-clear jingle, game over — {@link STAGE_MUSIC_CUES}) during the stage-intro /
 *    loading phase and releases every track outside the set. A music cue whose track is not
 *    prepared is **ignored** (counted in {@link AudioEngine.missedMusic}) — nothing is ever
 *    rendered or decoded mid-stage.
 * 2. **Attach.** Web Audio only exists after the first user gesture on the web (autoplay
 *    policy); {@link AudioEngine.attach} is called once the context is unlocked. It copies the
 *    prepared samples into `AudioBuffer`s, creates the SFX player (on the `sfx` / `ui` buses) and
 *    the music player (on the `music` bus) and starts the music requested meanwhile. Sounds
 *    requested before that are dropped; a context without buffer playback (test fakes) leaves the
 *    engine silent instead of failing.
 * 3. **Playback.** {@link AudioEngine.playSfx} pans a positional cue from the event's screen x
 *    ({@link DEFAULT_PAN_WIDTH} at the playfield edges), {@link AudioEngine.playMusic} maps a
 *    `MUSIC_CUES` id to the stage's track (`Silence` fades out; the track already playing is not
 *    restarted), {@link AudioEngine.duckMusic} ducks to {@link DEFAULT_DUCK_LEVEL}, and
 *    {@link AudioEngine.endFrame} closes the per-tick dedupe window.
 *
 * Bus volumes stay with the web-audio back-end (`setBusVolume` — the Options screen, M1-17).
 *
 * **Implements.**
 * - shmup_feat.md §19 — music (intro + loop, ducking) and SFX voice management fed by sim events
 * - shmup_feat.md §22 Audio engine — mixer: buses, voice cap, priorities, loop points,
 *   pre-decoded buffers
 * - shmup_tech.md §2.4 — nothing decoded mid-game
 *
 * **Public API.** {@link createAudioEngine}, {@link AudioEngine}, {@link AudioEngineOptions},
 * {@link AudioGraphLike}, {@link DEFAULT_PAN_WIDTH}, {@link DEFAULT_DUCK_LEVEL}.
 *
 * @module
 */
import { MUSIC_CUES, PLAYFIELD_W, defineModule, type AudioBus } from '@shmup/core';
import {
  STAGE_MUSIC_CUES,
  createAudioLoader,
  resolveMusicCues,
  toAudioBuffer,
  type AudioLoader,
  type LoadProgress,
  type MusicContent,
  type PreparedSound,
  type PreparedTrack,
  type SfxContent,
} from '../loader/index.js';
import { createMusicPlayer, type MusicBuffer, type MusicPlayer } from '../music/index.js';
import { createSfxPlayer, type SfxPlayer, type SfxVoiceSpec } from '../sfx/index.js';
import {
  isPlaybackContext,
  type AudioContextLike,
  type AudioNodeLike,
  type PlaybackContextLike,
} from '../web-audio/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'engine',
  status: 'implemented',
  specRefs: ['shmup_feat.md §19', 'shmup_feat.md §22', 'shmup_tech.md §2.4'],
});

/** Pan of a positional sound at the playfield's left / right edge (±). */
export const DEFAULT_PAN_WIDTH = 0.6;

/** Music gain while ducked (the player's death). */
export const DEFAULT_DUCK_LEVEL = 0.35;

/** What the engine attaches to — `@shmup/audio-web`'s `WebAudio` satisfies it. */
export interface AudioGraphLike {
  /** The context, or `null` before the unlock. */
  readonly context: AudioContextLike | null;
  /**
   * A bus node.
   *
   * @param bus - Bus name.
   * @returns The node, or `null` when the context does not exist.
   */
  bus(bus: AudioBus): AudioNodeLike | null;
}

/** Options of {@link createAudioEngine}. */
export interface AudioEngineOptions {
  /** The validated SFX bank (`loadSfxContent`). */
  readonly sfx: SfxContent;
  /** The validated music library (`loadMusicContent`). */
  readonly music: MusicContent;
  /** Loader (default `createAudioLoader()` — 22,050 Hz synth, XHR + 32 kHz decode). */
  readonly loader?: AudioLoader;
  /** Global SFX voice cap (default 14). */
  readonly maxVoices?: number;
  /** Pan at the playfield edges, 0…1 (default {@link DEFAULT_PAN_WIDTH}). */
  readonly panWidth?: number;
  /** Music gain while ducked, 0…1 (default {@link DEFAULT_DUCK_LEVEL}). */
  readonly duckLevel?: number;
}

/** The game's audio. */
export interface AudioEngine {
  /**
   * Renders / decodes the SFX bank (boot). Buffers are created now when attached, else by
   * {@link AudioEngine.attach}.
   *
   * @param onProgress - Called with 0…1.
   * @returns Resolves when every sound is prepared.
   * @throws Rejects with the loader's `AudioLoadError` when a recorded sound cannot be loaded.
   */
  loadSfx(onProgress?: LoadProgress): Promise<void>;
  /**
   * Prepares the music set of a loading phase and releases every other track (one set resident).
   *
   * @param stageId - The stage about to run (`null` = menus / open space): picks per cue the
   *   track bound to that stage, else the cue's default.
   * @param cues - The cues to prepare (default {@link STAGE_MUSIC_CUES}).
   * @param onProgress - Called with 0…1.
   * @returns Resolves when the set is ready.
   * @throws Rejects with the loader's `AudioLoadError` when a recorded track cannot be loaded.
   */
  prepareMusic(
    stageId: string | null,
    cues?: readonly number[],
    onProgress?: LoadProgress,
  ): Promise<void>;
  /**
   * Connects the engine to the unlocked Web Audio graph (idempotent).
   *
   * @param graph - The web-audio back-end.
   * @returns `true` when attached (now or before); `false` while there is no playable context or
   *   bus (try again after the next unlock) — the engine then stays silent.
   */
  attach(graph: AudioGraphLike): boolean;
  /** Whether {@link AudioEngine.attach} succeeded. */
  readonly attached: boolean;
  /**
   * Plays a sound effect.
   *
   * @param cue - `SFX_CUES` id.
   * @param screenX - The event's x relative to the camera, in whole pixels (0 = left edge of the
   *   playfield); ignored for non-positional cues.
   * @param priority - The event's `SfxPriority` hint (0 = the cue's own).
   * @returns The voice slot, or −1 when nothing started (not attached, no sound, deduped, no
   *   voice free for its priority).
   */
  playSfx(cue: number, screenX: number, priority: number): number;
  /**
   * Changes the music (a sim `Music` event).
   *
   * @param cue - `MUSIC_CUES` id (`Silence` stops).
   * @param fadeTicks - `Silence`: fade-out; a track: fade-in (and the previous track stops).
   */
  playMusic(cue: number, fadeTicks: number): void;
  /**
   * Ducks the music (a sim `MusicDuck` event).
   *
   * @param ticks - Ticks until the music is back at full volume.
   */
  duckMusic(ticks: number): void;
  /** Ends the per-tick SFX dedupe window (call after each frame's events). */
  endFrame(): void;
  /** The music cue requested last (−1 = none / silence). */
  readonly musicCue: number;
  /** Ids of the prepared (resident) music tracks. */
  readonly residentTracks: readonly string[];
  /** Music requests ignored because their track was not prepared. */
  readonly missedMusic: number;
  /** The SFX player once attached. */
  readonly sfx: SfxPlayer | null;
  /** The music player once attached. */
  readonly music: MusicPlayer | null;
  /** Stops all sound and detaches; the engine is inert afterwards. */
  destroy(): void;
}

/**
 * Creates the game's audio engine (see the module docs for the life cycle).
 *
 * @param options - Content, loader, voice cap, pan width, duck level.
 * @returns The engine (not attached, nothing prepared).
 *
 * @example
 * ```ts
 * const engine = createAudioEngine({ sfx, music });
 * await engine.loadSfx();
 * await engine.prepareMusic('zone-a');
 * await webAudio.unlock();
 * engine.attach(webAudio);
 * engine.playMusic(MUSIC_CUES.Stage, 0);
 * ```
 */
export function createAudioEngine(options: AudioEngineOptions): AudioEngine {
  const { sfx: sfxContent, music: musicContent } = options;
  const loader = options.loader ?? createAudioLoader();
  const panWidth = options.panWidth ?? DEFAULT_PAN_WIDTH;
  const duckLevel = options.duckLevel ?? DEFAULT_DUCK_LEVEL;
  const specs: Array<SfxVoiceSpec | null> = sfxContent.cues.map((def) =>
    def === null
      ? null
      : { buffer: null, tier: def.tier, maxInstances: def.maxInstances, bus: def.bus },
  );
  const positional = new Uint8Array(sfxContent.cues.length);
  sfxContent.cues.forEach((def, id) => {
    if (def !== null && def.positional) positional[id] = 1;
  });
  let sounds: Array<PreparedSound | null> = [];
  const resident = new Map<number, PreparedTrack>();
  const trackBuffers = new Map<number, MusicBuffer>();
  let cueTrack = resolveMusicCues(musicContent, null);
  let context: PlaybackContextLike | null = null;
  let sfx: SfxPlayer | null = null;
  let music: MusicPlayer | null = null;
  let musicCue = -1;
  let playingTrack = -1;
  let missedMusic = 0;
  let destroyed = false;

  /** Copies prepared SFX samples into buffers (when attached). */
  const syncSfxBuffers = (): void => {
    if (context === null) return;
    for (let id = 0; id < specs.length; id++) {
      const spec = specs[id];
      const sound = sounds[id] ?? null;
      if (spec !== null && sound !== null && spec.buffer === null) {
        spec.buffer = toAudioBuffer(context, sound);
      }
    }
  };

  /**
   * The playable buffer of a resident track (created on first use once attached).
   *
   * @param index - Track index.
   * @returns The buffer, or `null` when not resident or not attached.
   */
  const trackBuffer = (index: number): MusicBuffer | null => {
    const cached = trackBuffers.get(index);
    if (cached !== undefined) return cached;
    const track = resident.get(index);
    if (track === undefined || context === null) return null;
    const buffer: MusicBuffer = {
      id: track.id,
      buffer: toAudioBuffer(context, track),
      loopStart: track.loopStart,
      loopEnd: track.loopEnd,
    };
    trackBuffers.set(index, buffer);
    return buffer;
  };

  /**
   * Starts the track of a cue if it is not already the one playing.
   *
   * @param cue - Music cue.
   * @param fadeTicks - Fade-in.
   */
  const startCue = (cue: number, fadeTicks: number): void => {
    const index = cue >= 0 && cue < cueTrack.length ? cueTrack[cue] : -1;
    if (music === null || index < 0) return;
    if (index === playingTrack && music.playing) return;
    const buffer = trackBuffer(index);
    if (buffer === null) return;
    music.play(buffer, { fadeInTicks: fadeTicks });
    playingTrack = index;
  };

  return {
    get attached() {
      return context !== null;
    },
    get musicCue() {
      return musicCue;
    },
    get residentTracks() {
      const ids: string[] = [];
      resident.forEach((track) => ids.push(track.id));
      return ids;
    },
    get missedMusic() {
      return missedMusic;
    },
    get sfx() {
      return sfx;
    },
    get music() {
      return music;
    },
    async loadSfx(onProgress) {
      sounds = await loader.loadSfx(sfxContent, onProgress);
      if (!destroyed) syncSfxBuffers();
    },
    async prepareMusic(stageId, cues = STAGE_MUSIC_CUES, onProgress) {
      const table = resolveMusicCues(musicContent, stageId);
      const wanted: number[] = [];
      for (const cue of cues) {
        const index = cue >= 0 && cue < table.length ? table[cue] : -1;
        if (index >= 0 && wanted.indexOf(index) < 0) wanted.push(index);
      }
      // One set resident: release the tracks the new phase does not use (not the one playing).
      resident.forEach((_track, index) => {
        if (wanted.indexOf(index) < 0 && index !== playingTrack) {
          resident.delete(index);
          trackBuffers.delete(index);
        }
      });
      onProgress?.(wanted.length === 0 ? 1 : 0);
      for (let i = 0; i < wanted.length; i++) {
        const index = wanted[i];
        if (!resident.has(index)) {
          resident.set(index, await loader.loadTrack(musicContent.tracks[index]));
        }
        onProgress?.((i + 1) / wanted.length);
      }
      cueTrack = table;
    },
    attach(graph) {
      if (destroyed) return false;
      if (context !== null) return true;
      const candidate = graph.context;
      if (!isPlaybackContext(candidate)) return false;
      const sfxBus = graph.bus('sfx');
      const musicBus = graph.bus('music');
      if (sfxBus === null || musicBus === null) return false;
      context = candidate;
      syncSfxBuffers();
      sfx = createSfxPlayer({
        context: candidate,
        sfxBus,
        uiBus: graph.bus('ui'),
        cues: specs,
        maxVoices: options.maxVoices,
      });
      music = createMusicPlayer({ context: candidate, destination: musicBus });
      if (musicCue >= 0) startCue(musicCue, 0);
      return true;
    },
    playSfx(cue, screenX, priority) {
      if (sfx === null) return -1;
      let pan = 0;
      if (cue >= 0 && cue < positional.length && positional[cue] === 1) {
        const x = (screenX / PLAYFIELD_W) * 2 - 1;
        pan = (x < -1 ? -1 : x > 1 ? 1 : x) * panWidth;
      }
      return sfx.play(cue, pan, priority);
    },
    playMusic(cue, fadeTicks) {
      if (destroyed) return;
      if (cue === MUSIC_CUES.Silence) {
        musicCue = -1;
        playingTrack = -1;
        music?.stop(fadeTicks);
        return;
      }
      const index = cue >= 0 && cue < cueTrack.length ? cueTrack[cue] : -1;
      if (index < 0 || !resident.has(index)) {
        missedMusic++;
        return;
      }
      musicCue = cue;
      startCue(cue, fadeTicks);
    },
    duckMusic(ticks) {
      music?.duck(duckLevel, ticks);
    },
    endFrame() {
      sfx?.endFrame();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sfx?.destroy();
      music?.destroy();
      sfx = null;
      music = null;
      context = null;
      resident.clear();
      trackBuffers.clear();
      sounds = [];
    },
  };
}
