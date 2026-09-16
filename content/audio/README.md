# content/audio/ — sound effects and music

What the game sounds like, as data (plan M1-15, `shmup_feat.md` §19). The simulation only says
*what happened* through its `Sfx` / `Music` / `MusicDuck` presentation events; this folder binds
each **cue** (`SFX_CUES` / `MUSIC_CUES` in `@shmup/core` `events`) to a sound. Every placeholder
is **synthesized** from parameters when the game loads — no audio binaries in the repository —
and a recorded file can replace any of them later, cue by cue. Validated by `@shmup/audio-web`
(`loader` module, kinds `sfx` and `music`); the shell's content owners report every problem on
the boot error screen, and `pnpm content:check` checks the shipped files, the examples, that
every `SFX_CUES` cue has a sound and that every looping song loops sample-exactly.

Listen to everything with `pnpm audio:preview` (WAV files in `assets/generated/audio-preview/`).

| File | Kind | Holds |
|---|---|---|
| `main.sfx.json` | `sfx` | The SFX bank: every `SFX_CUES` cue (shots, explosions, pickups, menus, the WARNING siren wail …) |
| `music/zone-a.music.json` | `music` | AZURE VERGE — the stage theme (`Stage`): a 6.4 s intro, then a 44.8 s loop |
| `music/boss.music.json` | `music` | BULWARK ASSAULT — the boss theme (`Boss`) |
| `music/title.music.json` | `music` | SHMUP CUP — the title theme (`Title`, played by the title scene since M1-16; the shell prepares it at boot) |
| `music/stage-clear.music.json` | `music` | VERGE SECURED — the stage-clear jingle (`StageClear`, no loop) |
| `music/game-over.music.json` | `music` | SILENT VERGE — game over (`GameOver`, no loop) |
| `music/zone-b.music.json`, `music/boss-b.music.json` | `music` | BRINE NEBULA and MAW OF THE NEBULA — zone B's stage and boss themes (`Stage` / `Boss`, `"stages": ["zone-b"]` — they win over the defaults there; M2-11) |
| `music/zone-c.music.json`, `music/boss-c.music.json` | `music` | DUNE EXPANSE and SANDGRAVE ASSAULT — zone C's stage and boss themes (`"stages": ["zone-c"]`, M2-11) |
| `music/zone-d.music.json`, `music/boss-d.music.json` | `music` | MAGMA DEEP and BASTION OF CINDERS — zone D's stage and boss themes (`"stages": ["zone-d"]`, M2-12) |
| `music/zone-e.music.json`, `music/boss-e.music.json` | `music` | TEMPEST RIDGE and STEED OF THE SQUALL — zone E's stage and boss themes (`"stages": ["zone-e"]`, M2-12) |
| `music/zone-f.music.json`, `music/boss-f.music.json` | `music` | CELL VAULT and REGENT OF THE VAULT — zone F's stage and boss themes (`"stages": ["zone-f"]`, M2-13) |
| `music/zone-g.music.json`, `music/boss-g.music.json` | `music` | PRISM LABYRINTH and THRONE OF FACETS — zone G's stage and boss themes (`"stages": ["zone-g"]`, M2-13; GLIMMER CACHE, its bonus stage, plays zone G's resident set) |
| `music/zone-h.music.json`, `music/boss-h.music.json` | `music` | IRON CITADEL and SOVEREIGN OF STEEL — zone H's stage theme and its final boss theme (`Stage` / `FinalBoss`, `"stages": ["zone-h"]`, M2-14) |
| `music/zone-i.music.json`, `music/boss-i.music.json` | `music` | ABYSSAL THRONE and THE HOLLOW KING — zone I's stage theme and its final boss theme (`Stage` / `FinalBoss`, `"stages": ["zone-i"]`, M2-14) |
| `music/escape.music.json` | `music` | LAST LIGHT — the escape sequence's theme (`Escape`, M3-02): `content/stages/escape.stage.json` names it as its stage theme (`"stages": ["escape"]`), so it is resident while a run flies out of the final zone |
| `music/ending.music.json` | `music` | AFTER THE LAST WAVE — the ending theme (`Ending`, M2-14): the final zones name it as their stage's `music.ending`, so it is prepared with their set |
| `music/credits.music.json` | `music` | THANK YOU, PILOT — the credits theme (`Credits`, M2-14; the final zones' `music.credits`) |

## SFX bank (kind `sfx`, formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "sfx",
  "cues": {
    "PlayerShot": {                  // an SFX_CUES name; each cue at most once across files
      "priority": "low",             // low | normal | high | critical (never stolen by another cue)
      "maxInstances": 2,             // 1–8 at once; a new one restarts the oldest
      "volume": 0.3,                 // optional: 0–1 (default 1), baked into the samples
      "bus": "sfx",                  // optional: "sfx" (default) or "ui" (menus — never panned)
      "pan": true,                   // optional: pan from the event's x (default: true on "sfx")
      "params": {                    // a synthesized sound — or "file": "audio/sfx/shot.ogg"
        "shape": "square",           // sine | triangle | saw | square | noise
        "duty": 0.25,                // square only: 0.05–0.95 (default 0.5)
        "frequency": 1320,           // Hz (default 440)
        "randomness": 0,             // ± fraction of the frequency, drawn once from the seed
        "attack": 0,                 // seconds (default 0)
        "decay": 0,                  // seconds to fall to sustainVolume (default 0)
        "sustain": 0.012,            // seconds held (default 0.1)
        "sustainVolume": 1,          // 0–1 (default 1)
        "release": 0.045,            // seconds to fade out (default 0.1)
        "slide": -14000,             // Hz per second (default 0)
        "pitchJump": 0,              // Hz added after pitchJumpTime seconds (0 = never)
        "pitchJumpTime": 0,
        "repeat": 0,                 // seconds: restart slide + pitch jump (arpeggio-like)
        "modulation": 0,             // Hz of a frequency wobble (vibrato, sirens)
        "modulationDepth": 0.5,      // its depth as a fraction of the frequency
        "bitCrush": 0,               // hold every sample this many times (grit; 0/1 = off)
        "tremolo": 0,                // 0–1 amplitude wobble at tremoloRate Hz (default 12)
        "tremoloRate": 12,
        "volume": 1,                 // the synth's own gain (the cue's "volume" applies on top)
        "seed": 1                    // RNG seed of randomness and noise
      }
    }
  }
}
```

The mixer: 14 voices in all; a cue started twice in one frame plays once; when every voice is
busy the lowest-priority, then oldest, sound is cut — `critical` sounds (the WARNING siren,
the ship's death, the 1UP) never are, and a sound never cuts a more important one.

## Music (kind `music`, formatVersion 1)

One track per file. A track answers a `MUSIC_CUES` name (`cue`), optionally only for some
stages (`stages`: a track bound to the running stage wins over the cue's default). It is either
a chip `song` (rendered to 22,050 Hz mono at load) or a recorded `file` (OGG Vorbis, decoded at
32 kHz, loop points in samples at `sampleRate`, default 32000):

```jsonc
{
  "formatVersion": 1,
  "kind": "music",
  "id": "zone-a",                  // kebab-case, unique
  "title": "AZURE VERGE",          // display name (sound test, credits)
  "cue": "Stage",                  // optional: the MUSIC_CUES name it plays for
  "stages": ["zone-a"],            // optional: only for these stage ids (default: every stage)
  // M3-03: "module": "audio/music/zone-a.xm" may sit alongside the song or file — a tracker
  // module a build with a tracker backend plays instead. It never replaces them, so a device or
  // build without the tracker path is never silent (`audio-web/tracker` `chooseMusicPath`).
  "song": {                        // or: "file": "audio/music/zone-a.ogg", "loopStart": 204800, "loopEnd": 1638400
    "speed": 6,                    // ticks (1/60 s) per row: 6 → 0.1 s, 4 rows a beat = 150 BPM
    "volume": 0.4,                 // optional: master gain (default 0.4)
    "instruments": {
      "lead": {
        "wave": "pulse25",         // pulse12 | pulse25 | pulse50 | triangle | noise | saw
        "volume": 0.85,            // optional, 0–1 (default 1)
        "attack": 0.004,           // optional seconds (default 0.002)
        "decay": 0.12,             // optional seconds (default 0)
        "sustain": 0.62,           // optional level 0–1 (default 1)
        "release": 0.07,           // optional seconds after the note is released (default 0.03)
        "vibrato": { "depth": 0.2, "rate": 5.5, "delay": 0.2 }, // optional: semitones, Hz, seconds
        "arpeggio": [0, 4, 7],     // optional: semitone steps cycled every arpeggioTicks ticks
        "arpeggioTicks": 2,
        "sweep": 0                 // optional: semitones per second (drums)
      },
      "bass": { "wave": "triangle" },
      "hat": { "wave": "noise", "attack": 0, "decay": 0.035, "sustain": 0 },
      "kick": { "wave": "noise", "attack": 0, "decay": 0.07, "sustain": 0, "sweep": -90 }
    },
    "channels": [                  // 4–6 voices, mixed in this order
      { "instrument": "lead", "volume": 0.8 },
      { "instrument": "bass" },
      { "instrument": "hat", "volume": 0.7 },
      { "instrument": "kick" }
    ],
    "patterns": {
      "intro": { "rows": 16, "tracks": ["=:8 A4:4 C5:4", "D2:16", "C8:2 C8:2 C8:2 C8:2 C8:2 C8:2 C8:2 C8:2", ""] },
      "a": { "rows": 16, "tracks": ["D5:4 F5:2 A5:6 G5:2 F5:2", "D2:2 D3:2 D2:2 D3:2 Bb1:2 Bb2:2 Bb1:2 Bb2:2", "C5:2@kick C8:2 C8:2 C8:2 C5:2@kick C8:2 C8:2 C8:2", "C2:4 C2:4 C2:4 C2:4"] }
    },
    "order": ["intro", "a", "a"],  // pattern names in play order
    "loopFromOrder": 1             // optional: the loop starts at order[1]; absent / null = a jingle
  }
}
```

**Track tokens** (one track per channel, whitespace-separated, rows must add up to the
pattern's `rows`; an empty track holds for the whole pattern):

| Token | Meaning |
|---|---|
| `C4`, `F#3`, `Bb5` | Note-on (octave 0–8, C4 = middle C). On the noise channel the note sets the noise colour (`C2` rumble, `C5` snare, `C8` hiss) |
| `.` | Hold — keep doing what the channel does |
| `-` | Release the sounding note (its release tail follows) |
| `=` | Cut to silence at once |
| `:n` | Suffix: the token lasts `n` rows (default 1) — `C4:4`, `.:16` |
| `@name` | Suffix on a note: play it with another instrument — `C5@snare`, `C2:2@kick` |

**Loops are sample-exact.** A row is a whole number of samples (`round(22050 × speed / 60)`),
so `loopStart` = the intro's rows × samples per row and `loopEnd` = the song's end. The loop
region holds the loop's steady state: a note still ringing at the loop end continues across
the seam exactly as if the loop were played twice. Give every channel a note (or a cut, `=`)
somewhere in the loop — a channel that only holds a note from the intro cannot loop exactly. A jingle ends with its notes' release tails (2 s at most).

**Memory.** Only the music of the current phase is resident: the stage's theme, its boss
theme, the cue of each of its `music` events, the stage-clear jingle and game over are prepared
while the stage loads, never mid-stage (a cue whose track was not prepared stays silent;
`pnpm content:check` checks that every cue a shipped stage names has a track). Mono 22,050 Hz float samples cost 88 KB a second (zone A ≈ 4.5 MB).
