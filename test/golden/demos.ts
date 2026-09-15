/**
 * The attract loop's demos (plan M2-15, shmup_feat.md §16 "attract / demo mode plays bundled
 * replays"): one `core/replay` recording per zone of the 4-way playtest bot
 * (`test/playtest/four-way-bot.ts`) with god mode, {@link DEMO_TICKS} ticks from the zone's start,
 * committed as content — `content/demos/<id>.replay.json` (kind `replay`, `core/data`
 * `ContentDb.demos`) — so the apps bundle them and the scene flow's `DemoScene` plays them through
 * `core/replay` `createDemoPlayback`. Like golden replays they are locked by their state hashes:
 * `demos.test.ts` (part of `pnpm test`) plays every file back and requires every hash to match, and
 * `pnpm golden:update` (a simulation change — say why in the commit) re-records them with the
 * golden replays. Three zones fly the Direct-mode MANTA, the others the KESTREL.
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  DEMO_BUILD_ID,
  commitPlayerInput,
  createHeadlessPlatform,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  decodeReplay,
  encodeReplay,
  resolveGameConfig,
  type GameConfig,
  type Replay,
  type ReplayJson,
} from '@shmup/core';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { shippedContent } from '../playtest/harness.js';

/** Ticks every demo records: 40 s of the zone from its start (the fly-in, the zone card, play). */
export const DEMO_TICKS = 2400;

/** Ticks of the `content/demos/example.replay.json` format sample (free flight). */
export const EXAMPLE_DEMO_TICKS = 120;

/** One demo: how it is recorded. */
export interface DemoScenario {
  /** The demo's id and file name (`zone-a` → `content/demos/zone-a.replay.json`). */
  readonly id: string;
  /** What it shows. */
  readonly description: string;
  /** The stage played (`null` = free flight — the format sample only). */
  readonly stageId: string | null;
  /** Session options over the defaults (seed, ship). */
  readonly config: Partial<GameConfig>;
  /** Recorded ticks (default {@link DEMO_TICKS}). */
  readonly ticks?: number;
}

/** The MANTA (Direct mode). */
const MANTA: Partial<GameConfig> = { shipId: 'manta', powerUpMode: 'direct' };

/** The shipped demos, in content (path) order — the order the attract loop plays them. */
export const DEMO_SCENARIOS: readonly DemoScenario[] = Object.freeze([
  {
    id: 'zone-a',
    description: 'AZURE VERGE: the KESTREL through the popcorn and the first carriers',
    stageId: 'zone-a',
    config: { seed: 101 },
  },
  {
    id: 'zone-b',
    description: 'BRINE NEBULA: the MANTA among the splitting bubbles',
    stageId: 'zone-b',
    config: { seed: 102, ...MANTA },
  },
  {
    id: 'zone-c',
    description: 'DUNE EXPANSE: the KESTREL over the dunes',
    stageId: 'zone-c',
    config: { seed: 103 },
  },
  {
    id: 'zone-d',
    description: 'MAGMA DEEP: the KESTREL diving into the caves',
    stageId: 'zone-d',
    config: { seed: 104 },
  },
  {
    id: 'zone-e',
    description: 'TEMPEST RIDGE: the MANTA in the heavy weather',
    stageId: 'zone-e',
    config: { seed: 105, ...MANTA },
  },
  {
    id: 'zone-f',
    description: 'CELL VAULT: the KESTREL among the chasing cells',
    stageId: 'zone-f',
    config: { seed: 106 },
  },
  {
    id: 'zone-g',
    description: 'PRISM LABYRINTH: the KESTREL in the crystal walls',
    stageId: 'zone-g',
    config: { seed: 107 },
  },
  {
    id: 'zone-h',
    description: 'IRON CITADEL: the MANTA along the outer walls',
    stageId: 'zone-h',
    config: { seed: 108, ...MANTA },
  },
  {
    id: 'zone-i',
    description: 'ABYSSAL THRONE: the KESTREL in the descent',
    stageId: 'zone-i',
    config: { seed: 109 },
  },
]);

/** The format sample `content/demos/example.replay.json` (free flight, a few seconds). */
export const EXAMPLE_DEMO: DemoScenario = Object.freeze({
  id: 'example',
  description: 'the format sample: two seconds of free flight',
  stageId: null,
  config: { seed: 1 },
  ticks: EXAMPLE_DEMO_TICKS,
});

/** A demo file: the encoded replay with the content header, its id and description. */
export interface DemoFile extends ReplayJson {
  /** The content format version. */
  readonly formatVersion: number;
  /** The demo's id. */
  readonly id: string;
  /** What it shows. */
  readonly description: string;
}

/**
 * Path of a demo's file.
 *
 * @param id - The demo's id (`example` for the format sample).
 * @returns The file URL.
 */
export function demoPath(id: string): URL {
  return new URL(`../../content/demos/${id}.replay.json`, import.meta.url);
}

/**
 * Records a demo: the 4-way bot flies the stage with god mode for the demo's ticks (or until the
 * stage ends) through a replay recorder, on the shipped content.
 *
 * @param scenario - The demo.
 * @returns The replay.
 * @throws {Error} When the shipped content has issues.
 */
export function recordDemo(scenario: DemoScenario): Replay {
  const config = resolveGameConfig({ ...scenario.config, stage: scenario.stageId });
  const header = createReplayHeader(config, { buildId: DEMO_BUILD_ID, assisted: true });
  const platform = createHeadlessPlatform();
  const recorder = createReplayRecorder(platform.input, header);
  const game = createReplayGame({ ...platform, input: recorder }, header, shippedContent());
  const bot = fourWayBot();
  const input = platform.snapshot.players[0];
  const ticks = scenario.ticks ?? DEMO_TICKS;
  for (let i = 0; i < ticks; i++) {
    const world = game.world;
    commitPlayerInput(input, bot.decide(world) & 0xffff);
    game.step();
    game.events.clear();
    recorder.check(world);
    if (world.status === 'stageClear' || world.status === 'gameOver') break;
  }
  return recorder.finish(game.world);
}

/**
 * The text of a demo's file: the content header, the id and description, then the encoded replay,
 * as `JSON.stringify` lays it out (two-space indent, final newline).
 *
 * @param scenario - The demo.
 * @param replay - Its recording.
 * @returns The file's text.
 */
export function formatDemo(scenario: DemoScenario, replay: Replay): string {
  const file: DemoFile = {
    formatVersion: 1,
    ...encodeReplay(replay),
    id: scenario.id,
    description: scenario.description,
  };
  // The content header first (readable), then the recording.
  const ordered = {
    formatVersion: file.formatVersion,
    kind: file.kind,
    id: file.id,
    description: file.description,
    header: file.header,
    ticks: file.ticks,
    hashInterval: file.hashInterval,
    inputs: file.inputs,
    hashes: file.hashes,
    finalHash: file.finalHash,
  };
  return JSON.stringify(ordered, null, 2) + '\n';
}

/**
 * Writes a demo's file (re-bless).
 *
 * @param scenario - The demo.
 * @param replay - Its fresh recording.
 */
export function writeDemo(scenario: DemoScenario, replay: Replay): void {
  writeFileSync(demoPath(scenario.id), formatDemo(scenario, replay));
}

/**
 * Reads a committed demo file.
 *
 * @param id - The demo's id.
 * @returns The file's document and its decoded replay.
 * @throws {Error} When the file is missing or not a valid replay.
 */
export function readDemo(id: string): { file: DemoFile; replay: Replay } {
  const file = JSON.parse(readFileSync(demoPath(id), 'utf8')) as DemoFile;
  return { file, replay: decodeReplay(file) };
}
