# Audio: the synth, the SFX voice manager, looping music and the audio engine

How a sim event becomes a sound — the shots, explosions, pickups, the WARNING siren, the
stage theme with its seamless loop, the boss theme and the stage-clear jingle. Filled in by
plan step **M1-15** on top of the event dispatch of M1-14
([fx-and-game-feel.md](fx-and-game-feel.md)) and the cues every system already pushed.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#shmupaudio-web); the TSDoc in the sources
(`packages/audio-web/src/synth`, `sfx`, `music`, `loader`, `engine`, `web-audio`;
`packages/shell/src/dispatch`, `boot`) is the authoritative reference. The content *format*
for authors — every SFX parameter, the song format and its track tokens — is
[`content/audio/README.md`](../../content/audio/README.md).

Background: `shmup_feat.md` §19 (music with intro + seamless loop, ducking, the SFX list,
voice management, buses, the uninterruptible WARNING siren), §22 (audio engine: buses, voice
cap, priorities, loop points, pre-decoded buffers; presentation fed by events); `shmup_tech.md`
§2.4 (decode during loading, never mid-game; decode at 32 kHz), §2.5 (memory), §4.3 (raw Web
Audio instead of Howler / Tone, ZzFX-style procedural sounds); plan §3.3 (frame), §3.5 (content
owners) and decisions **D22** (OGG decoded through `OfflineAudioContext(2, 1, 32000)`), **D23**
(own ZzFX-style synth), **D25** (XHR, never `fetch`, on `file://`).

## The picture at a glance

```text
 content/audio/main.sfx.json ─┐                         @shmup/audio-web
 content/audio/music/*.music ─┴─► loader: loadSfxContent / loadMusicContent  (the shell's `sfx` /
                                  `music` content owners — issues on the boot error screen)
                                         │
 boot (loading phase, behind the bar)    ▼
   engine.loadSfx()        ── synth.renderSfx  (23 cues, 22,050 Hz mono Float32Array)
   engine.prepareMusic(    ── synth.renderSong (the stage's music set; a `file` → XHR +
     stage.id,                 OfflineAudioContext(2, 1, 32000) decode)
     stageMusicCues(stage))
                                         │  samples kept until a context exists
 first key / click (web) or boot (TV)    ▼
   audio.unlock() → engine.attach(webAudio)   AudioBuffers; SfxPlayer on the sfx / ui buses,
                                              MusicPlayer on the music bus
 every frame                                             │
   game.frame(now)                                       ▼
   game.events.drain(dispatch) ── connectAudioEvents:  Sfx       → engine.playSfx(cue, screenX, prio)
                                                       Music     → engine.playMusic(cue, fadeTicks)
                                                       MusicDuck → engine.duckMusic(ticks)
   engine.endFrame()          ── closes the SFX dedupe window

 web-audio graph:  SfxPlayer voices → StereoPanner (per voice slot) ─┐
                   ui cues ──────────────────────────────── ui bus ──┤
                   MusicPlayer: source → fade gain → duck gain → music bus ─┼─► master ─► speakers
                                                               sfx bus ─────┘
```

The simulation never calls audio code: it pushes `Sfx`, `Music` and `MusicDuck` records into
the World's event queue (`core/events`), the shell drains them once per frame and the engine
decides what is heard. Nothing flows back — a headless run, a replay and a muted TV simulate
exactly the same game.

## Which event plays what

| Sim event (pushed by) | Engine call | What is heard |
|---|---|---|
| `Sfx PlayerShot` / `PlayerMissile` (`core/weapons`, the weapon's `sfx`; at most one push per cue per 4 ticks) | `playSfx` — panned from the shot's x | A short blip; the missile a lower saw drop. The Type A laser uses `PlayerShot` too |
| `Sfx EnemyHit` / `Clink` (`core/enemies`, `core/weapons`, `core/bosses`) | panned | A tick on a hit that does not kill; a metallic clink on armour |
| `Sfx EnemyExplodeSmall / Medium / Large` (`core/enemies`, boss parts) | panned | Noise bursts of three sizes |
| `Sfx BossExplode` (`core/bosses`, the chain and the final blast — the blast with `SfxPriority.High`) | panned | The boss's chained explosions |
| `Sfx PlayerDeath` (`core/world`, phase 7) | panned, `critical` | The ship's explosion — never cut by another cue |
| `Sfx MeterAdvance`, `PowerUpEquip`, `PowerUpDenied`, `ShieldHit`, `ShieldBreak` (`core/powerups`) | panned | Pickup ding, equip jingle, the denied buzz, the Force Field's hit and break |
| `Sfx MegaCrash` (`core/powerups`) | centred (`pan: false`) | The screen-clearing boom |
| `Sfx WarningSiren` + `SfxPriority.Critical` (`core/bosses`, ticks 0 / 60 / 120 of the WARNING) | centred, critical | One 0.92-s wail per pulse (a square wave swept by a 1.1 Hz modulation), ending before the next |
| `Music <cue>` at world creation (`core/world`, the stage's `music.stage` theme) | `playMusic(cue, 0)` | The stage theme — on the web from the first key press (below) |
| `Music <cue>` from a stage `music` event (`core/stage`) | `playMusic(cue, param)` | Switches track (the running one is not restarted) |
| `Music Silence` + 30 ticks (the WARNING starts) | `playMusic(Silence, 30)` | The theme fades out over half a second |
| `Music <boss cue>` (the boss's intro starts) | `playMusic(bossCue, 0)` | The boss theme (`music.boss`, else the generic `Boss`) |
| `Music Silence` + 60 ticks (the last core destroyed) | fade-out | The boss theme fades over a second |
| `Music StageClear` (the boss's score tally) | one-shot | The stage-clear jingle |
| `Music <stage theme>` (a checkpoint restart that removed a boss after it had changed the music) | `playMusic(theme, 0)` | The stage theme again |
| `MusicDuck` + 120 ticks (the player's death) | `duckMusic(120)` | The music dips to 0.35 in 4 ticks, holds for 1 s, is back at full volume at 2 s |

Bound but not pushed by the sim yet: `LaserHum`, `CapsulePickup` (Direct mode, M2-05),
`ExtraLife` (extends, M2-01), `MenuMove` / `MenuSelect` / `MenuBack` / `PauseToggle` (the
scene flow, M1-16). No `Music GameOver` is pushed yet either (the game-over scene, M1-16) —
at `GAME OVER` the stage theme keeps playing. `HitStop`, `Rumble` and `PowerUp` events still
have no audio meaning.

## The content (`content/audio/`, kinds `sfx` and `music`)

Validated by `@shmup/audio-web` `loader` — the owners of the two kinds (plan §3.5): the shell's
`DEFAULT_CONTENT_OWNERS` report issues for every host, and `bootShell` registers its own owners
that also keep the parsed content for the engine. The file naming rule gives
`content/audio/main.sfx.json` and `content/audio/music/<id>.music.json` (the plan's
`sfx.json` / `*.song.json` did not fit `<folder>/<name>.<kind>.json`).

### The SFX bank (`loadSfxContent`)

Files are merged in path order into one entry per `SFX_CUES` id (`SfxContent.cues`, `null` =
no sound). Each `SfxCueDef` has `priority` (`low` / `normal` / `high` / `critical` → `tier`
1–4, the core's `SfxPriority` values), `maxInstances` (1–8), `volume` (baked into the samples
at load), `bus` (`sfx`, or `ui` for menus — never panned), `positional` (the file's `pan`,
default `true` on the `sfx` bus) and exactly one of `params` (a synth parameter set) or `file`
(a relative URL of a recorded sound). Issues: schema errors with paths, an unknown cue name,
both or neither of `params` / `file`, a cue defined twice (the first wins). A cue no file binds
is silent — `pnpm content:check` requires the shipped bank to bind all 23.

The shipped bank:

| Tier | Cues (instances) |
|---|---|
| `critical` | `PlayerDeath` (1), `ExtraLife` (1, centred), `WarningSiren` (1, centred) |
| `high` | `EnemyExplodeLarge` (2), `BossExplode` (4), `MeterAdvance` (2), `PowerUpEquip` (1), `ShieldBreak` (1), `MegaCrash` (1, centred) |
| `normal` | `EnemyExplodeSmall` (3), `EnemyExplodeMedium` (3), `CapsulePickup` (2), `ShieldHit` (2), `PowerUpDenied` (1); `MenuMove`, `MenuSelect`, `MenuBack`, `PauseToggle` (1 each, `ui` bus) |
| `low` | `PlayerShot` (2), `PlayerMissile` (2), `LaserHum` (1), `EnemyHit` (3), `Clink` (2) |

### Music (`loadMusicContent`, `resolveMusicCues`, `stageMusicCues`)

One track per file (`MusicTrackDef`): `id`, `title`, the `MUSIC_CUES` name it answers (`cue`,
optional), the stage ids the binding is limited to (`stages`, optional) and exactly one of a
chip `song` or a recorded `file` (with `loopStart` / `loopEnd` in samples at `sampleRate`,
default 32000). Issues: duplicate ids, unknown cues, `stages` without a `cue`, loop points on a
song (a song loops through `loopFromOrder`), only one of `loopStart` / `loopEnd`, `loopEnd ≤
loopStart`, song references and tracks that do not add up, and two tracks bound to the same cue
for the same stage (or both as its default). A track with an issue is left out.

- `resolveMusicCues(content, stageId)` → an `Int16Array` of track indices per cue: a track bound
  to the running stage wins over the cue's default (`Silence` is always −1).
- `stageMusicCues(stage)` → every cue a stage can make the sim ask for, in first-use order: its
  `music.stage` theme, its `music.boss` theme (the generic `Boss` when it names none — what the
  sim plays), the cue of each of its `music` events, then `StageClear` and `GameOver`;
  `Silence` and duplicates left out. This is the set the shell prepares — review round 1 of
  M1-15 replaced a fixed `STAGE_MUSIC_CUES` list, which left a stage's `FinalBoss` theme or a
  mid-stage `music` event silent. `STAGE_MUSIC_CUES` (`Stage`, `Boss`, `StageClear`,
  `GameOver`) is now only `prepareMusic`'s default.

The shipped songs are original: `zone-a` (AZURE VERGE, cue `Stage` — 6.4 s intro + 44.8 s
loop), `boss` (BULWARK ASSAULT, `Boss` — 2.7 s + 21.3 s), `title` (SHMUP CUP, `Title` — 3.7 s +
14.9 s; nothing plays it before M1-16), `stage-clear` (VERGE SECURED, jingle) and `game-over`
(SILENT VERGE, jingle). None is limited to a stage yet, so every stage uses them.

## The synth (`synth`)

Pure TypeScript, no Web Audio: data in, `Float32Array` out, mono at `SYNTH_SAMPLE_RATE`
(22,050 Hz) for the placeholders.

**Sound effects** — `renderSfx(params, sampleRate)`: a ZzFX-style parameter set
(`SfxParams`, defaults `DEFAULT_SFX_PARAMS`): shape `sine` / `triangle` / `saw` / `square`
(zero-mean at any `duty`) / `noise` (a new random level every cycle, so the pitch sets its
colour), a linear ADSR envelope (`attack`, `decay` to `sustainVolume`, `sustain`, `release`, in
seconds), `slide` (Hz per second), `pitchJump` after `pitchJumpTime`, `repeat` (restarts slide
and jump), a sine frequency `modulation` of `modulationDepth`, `tremolo` at `tremoloRate`,
`bitCrush` (sample-and-hold length) and `randomness` (± a fraction of the frequency, drawn once).
The plan's list plus `decay`, `sustainVolume`, `pitchJumpTime`, `modulationDepth`,
`tremoloRate`, `duty` and `seed`. `sfxLength` gives the length in samples (the four envelope
stages, each rounded).

**Songs** — `renderSong(song, sampleRate)` → `{ pcm, sampleRate, loopStart, loopEnd }`: a small
tracker. Instruments (`SongInstrument`: a `ChipWave` — `pulse12` / `pulse25` / `pulse50`, a
4-bit stepped `triangle`, LFSR `noise` clocked by the note, `saw` — ADSR, `vibrato` with a delay,
`arpeggio` every `arpeggioTicks`, `sweep` in semitones per second; the pitch effects step on
1/60-s ticks from the note-on), 4–6 channels (a content rule — the renderer takes any count),
patterns of whitespace-separated **text tracks** (`C4:2`, `.` hold, `-` release, `=` cut,
`@instrument`; `parseTrack`) and an `order` list with an optional `loopFromOrder`. Channels are
summed, scaled by the song volume (`DEFAULT_SONG_VOLUME` 0.4) and hard-clipped.

**Sample-exact loops.** A row lasts `songRowSamples(song, rate)` = `round(rate × speed / 60)`
samples, so `loopStart` (the intro's rows × samples per row) and `loopEnd` (= `pcm.length`) are
whole sample indices, handed to `AudioBufferSourceNode.loopStart` / `loopEnd` as
`samples / rate` seconds. The loop region holds the loop's **steady state**: each channel is
first advanced through one silent pass from its last note-on in the loop (a note-on resets
everything the channel holds — phase, envelope, LFSR, tick clock), then rendered into
`[loopStart, loopEnd)`, so a note still ringing at the loop end continues across the seam
exactly as in an unrolled render. A channel that strikes nothing in the loop keeps the intro's
phase and its seam is only approximate — give every channel a note or a cut in the loop. A
one-shot song (`loopFromOrder` absent / `null`) returns loop points −1 and ends with its release
tails (`MAX_SONG_TAIL_SECONDS` = 2 at most).

**Determinism.** The same parameters give the same bits on every engine: sines come from the
core's committed `SIN_TABLE_Q16` (`sineOfCycle`, linearly interpolated), pitch ratios from 13
literal constants (`semitoneRatio`, `noteFrequency`), randomness and noise from the core's seeded
sfc32 (`createRng`) — no `Math.random`, `Math.sin`, `Math.pow`. `pcmHash(pcm)` (FNV-1a over the
float bits) pins a sound in the tests and is printed by `pnpm audio:preview`. Audio itself is
presentation: nothing here is part of `hashWorld`, and a different mixer decision never changes
the game.

## Loading (`loader`, `createAudioLoader`)

Nothing is rendered or decoded mid-stage (`shmup_tech.md` §2.4 — `decodeAudioData` is slow on
TVs). `AudioLoader.loadSfx(content, onProgress)` renders every `params` cue synchronously (the
volume multiplied in) and fetches + decodes every `file` cue in parallel;
`AudioLoader.loadTrack(track)` renders a song or decodes a file. The result is a
`PreparedSound` / `PreparedTrack`: synthesized samples stay a `Float32Array` until a context
exists — boot renders **before** the web's first gesture creates the `AudioContext` — and
`toAudioBuffer(context, sound)` copies them into a mono `AudioBuffer` of their own rate once,
then drops the array (one copy in memory; the context resamples on playback).

**The OGG path (D22).** A `file` is fetched with `loadArrayBuffer` (XHR, `responseType
'arraybuffer'`, status 0 accepted for `file://` — D25) and decoded by `decodeAudioFile` through
`new OfflineAudioContext(2, 1, 32000)` (callback form, the only one every engine has): the buffer
comes out resampled to 32 kHz, which Chromium 69 cannot ask of an `AudioContext`. A file
track's loop points, counted at its `sampleRate`, are scaled to the decoded rate and rounded
(`loopEnd` clamped to the buffer). Failures reject with `AudioLoadError { url }`. No audio file
ships yet; the path is tested with fake XHRs and decoders.

**Memory.** Mono 22,050 Hz float samples cost 88 KB a second: zone A ≈ 4.5 MB, the boss theme
≈ 2.1 MB, the two jingles ≈ 1.1 MB, the whole SFX bank (8 s of sound) ≈ 0.7 MB. Only the current stage's music
set is resident (`shmup_tech.md` §2.5).

## The engine (`engine`, `createAudioEngine`)

The object the shell talks to; it composes the loader and the two players:

| Call | When | What it does |
|---|---|---|
| `loadSfx(onProgress?)` | Boot | Renders / decodes the bank; creates buffers now if already attached |
| `prepareMusic(stageId, cues = STAGE_MUSIC_CUES, onProgress?)` | A loading phase | Resolves the cues for the stage, releases every resident track outside the new set (except the one playing), prepares the missing ones. One set resident |
| `attach(graph)` | After `audio.unlock()` | Needs a `PlaybackContextLike` (`isPlaybackContext`) and the `sfx` / `music` buses; creates the buffers, the SFX player (`sfx` bus, `ui` bus) and the music player (`music` bus), then starts the music requested meanwhile. Returns `false` and stays silent otherwise (a plain `IAudio`, the minimal fakes of the boot tests); idempotent |
| `playSfx(cue, screenX, priority)` | Per `Sfx` event | A positional cue → `SfxPlayer.playAt(cue, screenX, priority)` (pan ±`DEFAULT_PAN_WIDTH` = 0.6 at the playfield edges), a whole-screen or `ui` cue → `play(cue, 0, priority)`; −1 when not attached |
| `playMusic(cue, fadeTicks)` | Per `Music` event | `Silence` → fade out over `fadeTicks`; a cue outside the prepared set → ignored, `missedMusic++`; the track already playing → nothing; else the new track starts (fade in over `fadeTicks`) and the previous one stops at once. Before `attach` the cue is remembered |
| `duckMusic(ticks)` | Per `MusicDuck` event | `MusicPlayer.duck(DEFAULT_DUCK_LEVEL = 0.35, ticks)` |
| `endFrame()` | After each drain | Closes the SFX dedupe window |
| `destroy()` | `shell.stop()` | Stops everything; inert afterwards |

Counters and state for tests: `attached`, `musicCue`, `residentTracks` (a new array per read),
`missedMusic`, `sfx`, `music`. Bus volumes stay with the web-audio back-end
(`setBusVolume`, clamped 0…1, remembered before the context exists) — the Options screen of
M1-17 will drive them.

## The SFX voice manager (`sfx`, `createSfxPlayer`)

SNES-driver-style management of `maxVoices` (`DEFAULT_MAX_VOICES` = 14) voices kept in
preallocated typed arrays (cue, tier, start order, end time, panned flag) plus one
`StereoPannerNode` per voice slot, created once and connected to the `sfx` bus. For each
request, in order:

1. An unknown or fractional cue id, a hole in the bank or a cue without a buffer → dropped.
2. The cue was already started since the last `endFrame()` → deduped. **Per drained frame,**
   not per tick as the plan said: events carry no tick number, and the ticks of one frame start
   their sounds at the same instant anyway, so stacking copies would only be louder.
3. Voices whose buffer has played out (`context.currentTime` past their end) are freed — no
   `onended` closures.
4. The cue is at its `maxInstances` → its **oldest** instance restarts, even a `critical` one
   (the siren's next wail replaces the last).
5. A free voice → taken.
6. Else the non-critical voice of the **lowest tier, then the oldest** is stolen — only if its
   tier is not above the new sound's; otherwise the new sound is **dropped** (a shot never cuts
   the death explosion). `critical` voices are never stolen by another cue.

The event's `SfxPriority` hint (1–4) replaces the cue's tier for that sound (the siren's
`Critical`, the boss blast's `High`); 0 keeps the cue's own. A `ui`-bus cue plays unpanned into
the `ui` bus; engines without `createStereoPanner` play everything centred. `play(cue, pan,
priority)` takes a pan; `playAt(cue, x, priority)` takes a whole-pixel x and computes
`((x / panField) · 2 − 1) · panWidth` only once a voice starts. Counters: `started`, `stolen`,
`dropped`, `deduped`, `activeVoices()`, `voiceCue(slot)`.

## The music player (`music`, `createMusicPlayer`)

`source → fade gain → duck gain → music bus`, one track resident: `play(track, { fadeInTicks })`
hard-stops the previous source (a fading one included), sets `loop` / `loopStart` / `loopEnd`
from the track's sample indices (a track loops only when `loopStart ≥ 0` and `loopEnd >
loopStart`) and ramps the fade gain 0 → 1 (or starts at 1). `stop(fadeOutTicks)` ramps it to 0
and schedules `source.stop()` at the ramp's end (a second stop that throws on older engines is
caught). `duck(level, ticks)` ramps the duck gain to `level` in `min(DUCK_ATTACK_TICKS = 4,
ticks / 4)` ticks, holds it until half of `ticks` and ramps back to 1 at `ticks`; a new duck
replaces a running one. Everything is scheduled on the context clock in ticks of
`TICK_SECONDS` (1/60 s) — sample-accurate, no per-frame update. `current` is the track started
last (cleared by `stop()` at once), `playing` whether it is audible now.

## The shell's wiring

`bootShell` ([rendering-and-shell.md](rendering-and-shell.md#the-boot-sequence)):

1. **Content** — its own `sfx` / `music` owners keep the parsed bank and library (an app owner
   of the same kind in `contentOwners` would replace one and leave the engine without it).
2. **Loading** — after the game exists: `createAudioEngine({ sfx, music, loader:
   options.audioLoader })`, `loadSfx` behind `LOADING SOUND`, then
   `prepareMusic(stage.id, stageMusicCues(stage))` behind `LOADING MUSIC` — nothing in open space
   (free flight has no music). A rejection ends on the boot error screen **`AUDIO FAILED TO
   LOAD`** with the `AudioLoadError` line.
3. **Events** — in free flight only (the other scenes do not show the World):
   `connectAudioEvents(events, engine, game.world.view.camera)`. The `Sfx` handler passes
   `Math.floor(event.x - camera.x) | 0`, read from the live camera when the event is handled.
4. **Unlock** — `ShellOptions.audio` is `IAudio & Partial<AudioGraphLike>`: a `WebAudio` exposes
   `context` and `bus()`. The gesture handler (web: first `keydown` / `pointerdown`; TV: at
   boot) calls `platform.audio.unlock()` — which creates the context synchronously — then
   `engine.attach(audio)` at once (still inside the gesture) and again when the promise settles.
5. **Frame** — `game.frame(now)` → `game.events.drain(visit)` → `engine.endFrame()` → render.
6. **Lifecycle** — suspend / resume suspend and resume the context (the music's clock stops
   with it); `stop()` destroys the engine, then the audio back-end. `Shell.audioEngine`
   exposes the engine.

What that means per build: in a browser nothing is audible until the first key press or click
(gamepad buttons are not a user activation); sounds requested before are dropped, but the stage
theme queued at world creation starts at that moment. On the TV audio is unlocked at boot, so
shots play from the first frame — but the TV app has no `?stage=`, and free flight prepares no
music, so it plays **no music** until the scene flow (M1-16) and zone A (M1-18).

## Zero allocation and the hot-path rules

Handling an event allocates nothing unless a sound actually starts — one
`AudioBufferSourceNode` per sound (Web Audio sources are one-shot) and, the first time a
resident track plays, its `AudioBuffer`. Guarded by the shell's `dispatch-audio-alloc`
(`connectAudioEvents`, 64 KiB budget) and `dispatch-audio-engine-alloc` (a real engine on a
fake context: dropped, deduped and soundless SFX, the playing track requested again, a missed
cue, `endFrame` — 64 KiB and 32 KiB budgets) tests. What the guard found (the test agent's
fix): the engine computed a fractional pan and passed it into `sfx.play()` — V8 boxed the double
on the call, so **every** positional request allocated about 16 bytes, dropped and deduped ones
included (324 KB per 10,000 frames). The fix is the M1-10 rule again: pass whole pixels across a
call (`playAt(cue, x, priority)` with `panField` / `panWidth` options) and compute the fraction
where it is used, only when a voice starts
([conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).

The synth, the loader and `prepareMusic` are load-time code and allocate freely.

## `pnpm audio:preview`

`scripts/audio-preview.mjs` loads `@shmup/audio-web`'s TypeScript through Vite's
`ssrLoadModule`, validates `content/audio/` with the same owners and writes 16-bit mono WAV
files to `assets/generated/audio-preview/` (git-ignored): `sfx/<Cue>.wav` per synthesized cue
and `music/<id>.wav` per song — a looping song as intro + loop + loop, so the seam can be heard
at the loop end (51.2 s into `zone-a.wav`). Each line prints the length, the `pcmHash` and a
song's loop points and render time. Options: `--out DIR`, `--only NAME` (one cue or track id),
`--quiet`; an unknown option or invalid content exits with code 1.

## Extending it

| To add… | Do this |
|---|---|
| A new or better placeholder sound | Edit its cue in `content/audio/main.sfx.json` (parameters in [`content/audio/README.md`](../../content/audio/README.md)), listen with `pnpm audio:preview --only <Cue>`, run `pnpm content:check` (audible, unclipped, ≤ 1.5 s). No test pins a shipped cue's hash |
| A recorded sound | Replace `params` with `"file": "audio/sfx/<name>.ogg"` (relative URL; ship the file with the app build) — decoded at boot at 32 kHz, volume applied to the decoded samples |
| A new SFX cue | Append a name to `SFX_CUES` in `core/events` (never renumber — ids are recorded in replays), push it from the system, bind it in the bank (`content:check` fails otherwise) and, if it implies a visual, add an `sfx` trigger in `content/fx/` |
| A song | A `*.music.json` in `content/audio/music/` with a `cue` (and `stages` to limit it to some stages); give every channel a note or a cut in the loop; check the seam with `pnpm audio:preview` |
| A stage-specific theme | The same `cue` with `"stages": ["<stage-id>"]` — it wins over the default for that stage (`resolveMusicCues`) |
| A mid-stage music change | A stage `music` event with the cue — `stageMusicCues` prepares it with the stage, nothing else to do |
| A recorded track | `"file"`, `"loopStart"`, `"loopEnd"` (samples at `"sampleRate"`, default 32000) instead of `"song"` |
| A new music cue | Append to `MUSIC_CUES`; bind a track; if a stage can reach it only through code (not its data), pass it to `prepareMusic` too |
| A loading phase with music (the title, a zone) | `engine.prepareMusic(stageId, cues)` behind the loading screen, then `playMusic` — the scene flow of M1-16 does this for the title |
| A new audio event kind | Append to `SimEventKind`, register a handler in `connectAudioEvents` (whole-pixel arguments) and extend `AudioEventTarget` / `AudioEngine` |

## Tests

| Where | Covers |
|---|---|
| `packages/audio-web/test/synth/synth.test.ts`, `synth-edge.test.ts` | Pinned PCM hashes of test sounds and songs (one per shape and per chip wave), identical renders, the SFX envelope sample by sample and every parameter in isolation (Nyquist / 0 Hz clamps, zero-mean square at any duty, seed only for randomness / noise), 60 seeded random parameter sets finite and within −1…1; song cut / release / holds / `@instrument`, volumes, clipping, arpeggio / sweep / delayed vibrato on tick boundaries, the tail cap, `loopFromOrder` variants, **the seam** (the loop region equals an unrolled render), prototype names refused, the track grammar |
| `packages/audio-web/test/sfx/sfx.test.ts`, `sfx-edge.test.ts` | The voice policy against a fake context: dedupe per frame, instance caps before the global cap, steal lowest tier then oldest, critical never stolen, a higher tier never stolen, hints overriding or lowering a tier, played-out voices neither counted nor stolen, pan clamping and `playAt`, the `ui` bus, fractional ids and holes dropped (regression), counters, destroy |
| `packages/audio-web/test/music/music.test.ts`, `music-edge.test.ts` | The graph, loop points from sample indices, one-shots ending, one track resident, fade-in / fade-out ramps, a fade-out over a fade-out (the second `stop()` guarded — regression), a new track over a fading one, ducks (over a duck, level clamping, attack length), bad fade lengths, nothing scheduled after `destroy()` |
| `packages/audio-web/test/loader/loader.test.ts`, `loader-edge.test.ts` | Both schemas with issue paths, the relative-URL rule, cue bindings and `resolveMusicCues` (independent of file order), `stageMusicCues` corners, rendering with baked volume, every XHR outcome, callback-only decoders, the default OGG path through the global `XMLHttpRequest` and `OfflineAudioContext(2, 1, 32000)` with loop points scaled / clamped, progress |
| `packages/audio-web/test/engine/engine.test.ts`, `engine-edge.test.ts` | One music set resident, missed cues, music requested before `attach`, SFX only once attached, positional vs centred cues, no restart of the playing track, `Silence`, ducking, silent on a context without buffer playback, the review round 1 regression at engine level (a `FinalBoss` theme and a mid-stage `ZoneMap` cue) |
| `packages/audio-web/test/web-audio/web-audio-playback.test.ts` | `isPlaybackContext` |
| `packages/audio-web/test/helpers/fake-context.ts` | The recording Web Audio fake every suite uses: a settable clock, real `Float32Array` buffers, nodes logging connections, starts, stops and every scheduled parameter change |
| `packages/shell/test/dispatch/dispatch-audio*.test.ts` | The event → engine mapping and unregistering; two allocation guards; `dispatch-audio-runtime`: the shipped boss range end to end (`createGame` → drained events → `connectAudioEvents` → a real engine): zone theme, WARNING silence, every siren pulse heard, boss theme, silence, stage-clear jingle, no music missed; the round 1 regression through the real sim |
| `packages/shell/test/boot/boot.test.ts` | The bank rendered and the running stage's set prepared at boot (only that set; the stage's own boss theme and `music` events), attach after the unlock with panned and deduped sounds, `AUDIO FAILED TO LOAD` |
| `test/integration/content.test.ts` (`pnpm content:check`) | Every `SFX_CUES` cue bound; the plan's tracks bound to their cues for every shipped stage; every cue a shipped stage references is in its prepared set and has a track; every synthesized sound audible, unclipped, ≤ 1.5 s; the siren ends before its next wail; whole-screen sounds centred, menu sounds on the `ui` bus; zone A's loop ≈ 45 s after an intro, jingles one-shot, no song clipping; every looping song loops sample-exactly |
| `test/scripts/audio-preview*.test.ts` | WAV encoding (header, clipping, rounding), a full run matching the loader's samples (hashes, lengths, intro + loop + loop), the CLI options and exit codes |
| `test/e2e/audio.spec.ts` | Real Chromium (`createBufferSource` wrapped to log started sounds): in the web build on `?stage=test-range` the first key press unlocks audio and the zone theme loops at the song's exact sample indices (64 rows × 2,205 samples of intro); in the Tizen build (unlocked at boot, forced autofire) shots play as short one-shot buffers; no console errors |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| No sound at all in a browser | Autoplay policy: nothing plays before the first key press or click (gamepad buttons do not count). Sounds requested before are dropped; the stage theme starts with the gesture |
| No music on the TV | Expected: the TV app runs free flight, which prepares no music (no `?stage=` on TV). Music on the TV arrives with the scene flow / zone A |
| A stage's music event (or boss theme) plays silence | The cue has no track (`content:check` says so for shipped stages) or it was not prepared: a host preparing a stage must pass `stageMusicCues(stage)`, not the default `STAGE_MUSIC_CUES`. `engine.missedMusic` counts ignored requests |
| A new cue plays nothing | Not bound in `main.sfx.json`, or bound on a context that has no buffer yet — check `engine.attached` |
| The boot tests' app is silent | Expected: their fake context has no `createBuffer` / `createBufferSource`, so `isPlaybackContext` fails and the engine stays silent instead of throwing |
| The same sound twice in one frame plays once | The per-frame dedupe (by design); a cue that must stack needs separate cues |
| A sound is cut off | Its cue's `maxInstances` was reached (the oldest restarts) or the 14 voices were full and a lower-or-equal tier was stolen. Raise the tier or the instance cap in the bank |
| A shot never cuts the death explosion but the siren restarts itself | By design: a higher tier is never stolen; a cue at its instance cap restarts its own oldest copy even when critical |
| Loop seam audible in a new song | A channel has no note-on (or cut) inside the loop, so its phase comes from the intro — add one (the content README's rule) |
| `renderSong` throws `RangeError` | The song skipped validation (`loadMusicContent` reports the same problems as issues) |
| An allocation guard fails in audio code | A fractional value passed across a call (a pan, a gain); pass whole pixels / ticks and compute inside — see the M1-15 finding above |
| `AUDIO FAILED TO LOAD` | A `file` sound or track could not be fetched (a wrong relative URL, a file missing from the build) or decoded (`OfflineAudioContext` missing, a corrupt OGG). The line names the URL |
| The music keeps playing at `GAME OVER` or while paused | Nothing pushes `Music GameOver` yet and there is no pause scene; both come with M1-16 |

## Next steps that build on this page

- **M1-16** — the scene flow: the title theme (`Title`) prepared in the title's loading phase,
  `MenuMove` / `MenuSelect` / `MenuBack` / `PauseToggle` on the `ui` bus, pause handling of the
  music, the game-over and stage-clear scenes.
- **M1-17** — the Options screen's MASTER / MUSIC / SFX sliders → `audio.setBusVolume`, saved.
- **M1-18** — zone A: the `zone-a` stage plays AZURE VERGE and BULWARK ASSAULT through the same
  set (a track can be limited to it with `stages`).
- **M1-19** — perf budgets (the TV's render time of the music set during loading).
- **M2-01** — extends (`ExtraLife`); **M2-05** — Direct mode (`CapsulePickup`); **M3-03** —
  tracker music.
