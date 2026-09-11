# @shmup/audio-web

`IAudio` implementation over the raw **Web Audio API** (no Howler/Tone —
`shmup_tech.md` §4.3).

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
| `web-audio` | partial | Context, buses, unlock/suspend/resume, volumes |
| `sfx` | placeholder | Pre-decoded SFX, voice caps, priorities, per-tick dedupe (`shmup_feat.md` §19) |
| `music` | placeholder | Intro + seamless loop, streaming for long tracks, ducking |
| `loader` | placeholder | Fetch + decode during loading screens only, codec fallback |
