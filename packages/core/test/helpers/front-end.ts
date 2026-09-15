/**
 * Test content of the M2-15 front-end suites: the campaign content of `./campaign.ts` (the KESTREL,
 * Type A, the S → U | L map on tiny open stages) plus a story in the campaign, a long open stage
 * `t-d` and a demo recorded on it — a weaving KESTREL with god mode, {@link DEMO_TEST_TICKS} ticks
 * — so the attract loop has a demo, a hi-score screen and a story to show.
 */
import { expect } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import {
  DEMO_BUILD_ID,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  encodeReplay,
  type Replay,
} from '../../src/replay/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { CAMPAIGN, shipped, stage } from './campaign.js';

/** Ticks of the test demo. */
export const DEMO_TEST_TICKS = 300;

/** The test story: two pages, three lines (five rows with the blank ones). */
export const TEST_STORY = Object.freeze([
  Object.freeze({ scene: 'dawn', lines: Object.freeze(['FIRST LINE', 'SECOND LINE']) }),
  Object.freeze({ scene: 'launch', lines: Object.freeze(['THIRD LINE']) }),
]);

/**
 * The content files without demos.
 *
 * @param story - Give the campaign the test story (default `true`).
 * @returns The files.
 */
function baseFiles(story = true): ContentFile[] {
  const campaign = CAMPAIGN.data as Record<string, unknown>;
  return [
    shipped('player/kestrel.player.json'),
    shipped('weapons/type-a.weapons.json'),
    { path: CAMPAIGN.path, data: story ? { ...campaign, story: TEST_STORY } : campaign },
    stage('t-s'),
    stage('t-u'),
    stage('t-l'),
    // The demo's stage: long and slow (no end within the demo).
    stage('t-d', {
      length: 6000,
      camera: [{ x: 0, speed: 1 }],
      events: [{ x: 5000, type: 'end' }],
    }),
  ];
}

/**
 * Records a demo on a content: the KESTREL weaving (and autofiring) with god mode.
 *
 * @param db - The content.
 * @param stageId - The stage (`null` = free flight).
 * @param ticks - Ticks to record.
 * @param seed - Gameplay seed.
 * @returns The replay.
 */
export function recordTestDemo(
  db: ContentDb,
  stageId: string | null,
  ticks: number,
  seed = 21,
): Replay {
  const header = createReplayHeader(resolveGameConfig({ seed, stage: stageId }), {
    buildId: DEMO_BUILD_ID,
    assisted: true,
  });
  const platform = createHeadlessPlatform();
  const recorder = createReplayRecorder(platform.input, header, { capacity: ticks + 1 });
  const game = createReplayGame({ ...platform, input: recorder }, header, db);
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(platform.snapshot.players[0], (t / 37) % 2 < 1 ? Action.Up : Action.Down);
    game.step();
    game.events.clear();
    recorder.check(game.world);
  }
  return recorder.finish(game.world);
}

/**
 * A demo content file of a replay.
 *
 * @param id - The demo's id.
 * @param replay - The recording.
 * @returns The file.
 */
export function demoFile(id: string, replay: Replay): ContentFile {
  return {
    path: `demos/${id}.replay.json`,
    data: { formatVersion: 1, ...encodeReplay(replay), id, description: 'a test demo' },
  };
}

/**
 * The front-end test content: the campaign with its story, and one demo on `t-d`.
 *
 * @param options - What to leave out.
 * @param options.demos - Record the demo (default `true`).
 * @param options.story - Give the campaign its story (default `true`).
 * @returns The DB and the demo's replay (`null` without demos).
 */
export function frontEndContent(options: { demos?: boolean; story?: boolean } = {}): {
  db: ContentDb;
  demo: Replay | null;
} {
  const files = baseFiles(options.story ?? true);
  const load = (list: readonly ContentFile[]): ContentDb => {
    const { db, issues } = loadContent(list, { extraSprites: ENGINE_SPRITES });
    expect(issues).toEqual([]);
    return db;
  };
  if (options.demos === false) return { db: load(files), demo: null };
  const demo = recordTestDemo(load(files), 't-d', DEMO_TEST_TICKS);
  return { db: load([...files, demoFile('t-d', demo)]), demo };
}
