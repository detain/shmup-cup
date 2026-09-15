# content/demos/ — the attract loop's demo play

Recordings the attract loop plays between the title and the hi-score tables (`shmup_feat.md` §16
"attract / demo mode: plays bundled replays", §17 attract loop; plan M2-15): one per zone, the
4-way playtest bot flying the zone with god mode for 40 s from its start (three zones in the
Direct-mode MANTA, the others in the KESTREL). Loaded by the core's `data` module (kind `replay`,
`ContentDb.demos` — the structure and the stage are checked there), decoded and played by the scene
flow's `DemoScene` through `core/replay` `createDemoPlayback` — the replay playback path, so a demo
is checked for desyncs like a golden replay. The demo is silent; any input returns to the title.

**Never edit these files by hand.** They are recorded by `test/golden/demos.ts` and locked by their
state hashes: `test/golden/demos.test.ts` (part of `pnpm test`) plays every file back and fails on
the first hash that differs. A change that alters the simulation re-blesses them with the golden
replays — `pnpm golden:update` — and says why in its commit message. Prettier skips them.

## Format (formatVersion 1)

A `core/replay` document (`encodeReplay`) with the content header, an `id` and a `description`:

```jsonc
{
  "formatVersion": 1,
  "kind": "replay",
  "id": "zone-a",                        // unique; the file name
  "description": "AZURE VERGE: …",       // optional (≤ 200 characters)
  "header": {
    "formatVersion": 1,                  // the replay format (core/replay REPLAY_FORMAT_VERSION)
    "buildId": "demo",                   // DEMO_BUILD_ID: hashes, not a build, lock a demo
    "seed": 101,
    "stageId": "zone-a",                 // a stage of the content (null = free flight)
    "checkpoint": -1,                    // -1 = the stage start, else a checkpoint index
    "loadout": "default",
    "assisted": true,                    // god mode for the whole recording
    "config": { "…": "every GameConfig field, as recorded" }
  },
  "ticks": 2400,                         // 1 … 18,000 (MAX_DEMO_TICKS)
  "hashInterval": 600,
  "inputs": ["<player 1: RLE varints, base64>", "<player 2>"],
  "hashes": [123, 456, 789, 1011],       // hashWorld every hashInterval ticks
  "finalHash": 1213
}
```

[`example.replay.json`](example.replay.json) is a two-second free-flight recording in this
format. The attract loop plays the demos in file (path) order, one per visit; a demo that does
not decode, names a stage the content lacks or desyncs is skipped or ends early.
