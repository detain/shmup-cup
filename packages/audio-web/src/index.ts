/**
 * `@shmup/audio-web` — Web Audio implementation of the core's `IAudio`.
 *
 * One `AudioContext` (`latencyHint: 'interactive'`) with `music / sfx / ui → master`
 * buses, gesture unlock, suspend/resume. SFX voice management, music (intro + loop,
 * streaming) and decoding live in the `sfx`, `music` and `loader` modules (placeholders).
 *
 * @packageDocumentation
 */
export {
  createWebAudio,
  type AudioContextLike,
  type GainNodeLike,
  type WebAudio,
  type WebAudioOptions,
} from './web-audio/index.js';
