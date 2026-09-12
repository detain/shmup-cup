# @shmup/audio-web

`IAudio` implementation over the raw **Web Audio API** (no Howler/Tone —
`shmup_tech.md` §4.3), plus the game's audio (plan M1-15): a deterministic synth for the
procedural placeholder SFX and chip music, the `sfx` / `music` content kinds, the SFX voice
manager, the looping music player and the engine the shell feeds with the sim's events.

- One `AudioContext` created lazily — and synchronously — by the first `unlock()` with
  **`latencyHint: 'interactive'`** (browser autoplay policy: call `unlock()` from the first
  user gesture; on the TV call it at boot).
- Mixer graph: `music`, `sfx`, `ui` gain buses → `master` → destination. Volumes set before
  the context exists are remembered; values are clamped to 0…1.
- `suspend()` / `resume()` for app lifecycle (JS is frozen on Tizen while hidden).
- Everything that needs a context is written against structural types (`PlaybackContextLike`
  …), so it is unit-tested in Node with a recording fake context
  (`test/helpers/fake-context.ts`).

```ts
import { createAudioEngine, createWebAudio, loadMusicContent, loadSfxContent, stageMusicCues } from '@shmup/audio-web';

const audio = createWebAudio();
const engine = createAudioEngine({
  sfx: loadSfxContent(sfxFiles).content,
  music: loadMusicContent(musicFiles).content,
});
await engine.loadSfx(); // loading phase: renders the SFX bank (22,050 Hz mono)
await engine.prepareMusic(stage.id, stageMusicCues(stage)); // the stage's music set
window.addEventListener(
  'keydown',
  () => {
    void audio.unlock(); // creates the context synchronously…
    engine.attach(audio); // …so the engine can attach inside the gesture
  },
  { once: true },
);
engine.playSfx(SFX_CUES.PlayerShot, 64, 0); // x relative to the playfield → pan
engine.playMusic(MUSIC_CUES.Stage, 0);
engine.endFrame(); // after each frame's events
audio.setBusVolume('music', 0.6);
```

`@shmup/shell` does all of this for the apps (`bootShell` → `Shell.audioEngine`,
`connectAudioEvents`).

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `web-audio` | partial | Context, buses, unlock/suspend/resume, volumes (driven by the Options screen from M1-17); the structural Web Audio types (`PlaybackContextLike` …) and `isPlaybackContext` the other modules are tested against |
| `synth` | implemented | Deterministic pure-TS PCM (table sines, seeded noise — bit-identical on every engine): ZzFX-style SFX parameter sets (`renderSfx`) and 4–6-channel chip songs from text tracks with sample-exact loops holding the loop's steady state (`renderSong`), mono 22,050 Hz; `pcmHash` |
| `sfx` | implemented | Pre-rendered SFX buffers, per-frame dedupe, per-cue instance caps (oldest restarted), 14-voice global cap stealing the lowest tier then the oldest (`critical` never stolen, a higher tier never stolen), stereo pan from a whole-pixel x (`shmup_feat.md` §19) |
| `music` | implemented | One resident track, intro + sample-accurate loop (`loopStart` / `loopEnd` from samples), fade in / out and ducking as `AudioParam` ramps |
| `loader` | implemented | The `sfx` / `music` content kinds (validation with issue paths, tracks bound to cues per stage — `resolveMusicCues`, `stageMusicCues`), rendering during loading phases, the OGG path (XHR `arraybuffer` → `OfflineAudioContext(2, 1, 32000)` decode, loop points scaled) |
| `engine` | implemented | `createAudioEngine`: the SFX bank + one stage's music set, attached to the buses after the unlock; `playSfx` / `playMusic` / `duckMusic` / `endFrame` — what the shell's dispatch feeds with sim events, allocation-free unless a sound starts |

Listen to the placeholder sounds with `pnpm audio:preview` (WAV files in
`assets/generated/audio-preview/`). The content format is in
[`content/audio/README.md`](../../content/audio/README.md); the guide is
[`docs/dev/audio.md`](../../docs/dev/audio.md); exports:
[`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmupaudio-web).
