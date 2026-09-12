# @shmup/audio-web

`IAudio` implementation over the raw **Web Audio API** (no Howler/Tone —
`shmup_tech.md` §4.3), plus the game's audio: procedural placeholder SFX and chip music,
the SFX voice manager and the looping music player (plan M1-15).

- One `AudioContext` created lazily by `unlock()` with **`latencyHint: 'interactive'`**
  (browser autoplay policy: call `unlock()` from the first user gesture; on TV/Electron
  call it at boot).
- Mixer graph: `music`, `sfx`, `ui` gain buses → `master` → destination. Volumes set before
  the context exists are remembered; values are clamped to 0…1.
- `suspend()` / `resume()` for app lifecycle (JS is frozen on Tizen while hidden).
- `createContext` is injectable, so everything is unit-tested in Node with a fake context.

```ts
import { createWebAudio } from '@shmup/audio-web';

const audio = createWebAudio();
window.addEventListener('keydown', () => void audio.unlock(), { once: true });
audio.setBusVolume('music', 0.6);
```

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `web-audio` | partial | Context, buses, unlock/suspend/resume, volumes; the structural Web Audio types (`PlaybackContextLike` …) the other modules are tested against |
| `synth` | implemented | Deterministic pure-TS PCM: ZzFX-style SFX parameter sets (`renderSfx`) and 4–6-channel chip songs with sample-exact loops (`renderSong`), mono 22,050 Hz |
| `sfx` | implemented | Pre-rendered SFX buffers, per-tick dedupe, per-cue instance caps, 14-voice global cap with priority stealing (`critical` never stolen), stereo pan (`shmup_feat.md` §19) |
| `music` | implemented | One resident track, intro + sample-accurate loop (`loopStart` / `loopEnd` from samples), fade in / out, ducking |
| `loader` | implemented | The `sfx` / `music` content kinds, rendering at load, OGG path (XHR `arraybuffer` → `OfflineAudioContext(2, 1, 32000)` decode) |
| `engine` | implemented | `createAudioEngine`: SFX bank + the stage's music set, attached to the buses after the unlock; what the shell's dispatch feeds with sim events |

Listen to the placeholder sounds with `pnpm audio:preview` (WAV files in
`assets/generated/audio-preview/`).
