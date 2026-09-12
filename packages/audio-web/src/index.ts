/**
 * `@shmup/audio-web` — Web Audio implementation of the core's `IAudio`, and the game's audio.
 *
 * One `AudioContext` (`latencyHint: 'interactive'`) with `music / sfx / ui → master` buses,
 * gesture unlock, suspend/resume (`web-audio`); deterministic PCM synthesis of the placeholder
 * SFX and chip songs (`synth`); the `sfx` / `music` content kinds, rendering and OGG decoding
 * during loading phases (`loader`); the SFX voice manager (`sfx`) and the looping music player
 * with fades and ducking (`music`); and the engine that ties them to the sim's events
 * (`engine`, used by `@shmup/shell`).
 *
 * @packageDocumentation
 */
export {
  createWebAudio,
  isPlaybackContext,
  type AudioBufferLike,
  type AudioBufferSourceNodeLike,
  type AudioContextLike,
  type AudioGainNodeLike,
  type AudioNodeLike,
  type AudioParamLike,
  type GainNodeLike,
  type PlaybackContextLike,
  type StereoPannerNodeLike,
  type WebAudio,
  type WebAudioOptions,
} from './web-audio/index.js';
export {
  CHIP_WAVES,
  DEFAULT_SFX_PARAMS,
  DEFAULT_SONG_VOLUME,
  MAX_SONG_TAIL_SECONDS,
  SFX_SHAPES,
  SYNTH_SAMPLE_RATE,
  TrackStepKind,
  noteFrequency,
  parseTrack,
  pcmHash,
  renderSfx,
  renderSong,
  semitoneRatio,
  sfxLength,
  sineOfCycle,
  songRowSamples,
  type ChipWave,
  type ParsedTrack,
  type RenderedSong,
  type SfxParams,
  type SfxShape,
  type Song,
  type SongChannel,
  type SongInstrument,
  type SongPattern,
  type SongVibrato,
  type TrackStep,
} from './synth/index.js';
export {
  DEFAULT_MAX_VOICES,
  SFX_PRIORITY_NAMES,
  SFX_PRIORITY_TIERS,
  createSfxPlayer,
  type SfxBus,
  type SfxPlayer,
  type SfxPlayerOptions,
  type SfxPriorityName,
  type SfxVoiceSpec,
} from './sfx/index.js';
export {
  DUCK_ATTACK_TICKS,
  TICK_SECONDS,
  createMusicPlayer,
  type MusicBuffer,
  type MusicPlayOptions,
  type MusicPlayer,
  type MusicPlayerOptions,
} from './music/index.js';
export {
  AudioLoadError,
  DECODE_SAMPLE_RATE,
  EMPTY_MUSIC_CONTENT,
  EMPTY_SFX_CONTENT,
  MUSIC_CONTENT_KIND,
  SFX_CONTENT_KIND,
  STAGE_MUSIC_CUES,
  createAudioLoader,
  decodeAudioFile,
  loadArrayBuffer,
  loadMusicContent,
  loadSfxContent,
  parseMusicContent,
  parseSfxContent,
  resolveMusicCues,
  toAudioBuffer,
  type AudioLoader,
  type AudioLoaderOptions,
  type DecodeContextLike,
  type LoadProgress,
  type MusicContent,
  type MusicContentResult,
  type MusicFileDef,
  type MusicTrackDef,
  type PreparedSound,
  type PreparedTrack,
  type SfxContent,
  type SfxContentResult,
  type SfxCueDef,
  type XhrLike,
} from './loader/index.js';
export {
  DEFAULT_DUCK_LEVEL,
  DEFAULT_PAN_WIDTH,
  createAudioEngine,
  type AudioEngine,
  type AudioEngineOptions,
  type AudioGraphLike,
} from './engine/index.js';
