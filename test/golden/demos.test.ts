/**
 * The attract loop's demos (plan M2-15, part of `pnpm test`): every committed
 * `content/demos/<id>.replay.json` plays back through `core/replay` `createDemoPlayback` — the
 * attract loop's own playback path — on the shipped content with **every state hash** reproduced
 * ("demo replays play without desync"), the content lists exactly the scenarios of `demos.ts`, and
 * the format sample is a valid demo too. A failure means the simulation (or the content a demo
 * plays) changed: fix it, or — when it is intended — re-bless with `pnpm golden:update` (which
 * re-records the demos with the golden replays) and say why in the commit message.
 *
 * With `SHMUP_GOLDEN_UPDATE=1` the test first re-records every demo from the bot and rewrites its
 * file, then checks the new files the same way.
 */
import { describe, expect, it } from 'vitest';
import {
  DEMO_BUILD_ID,
  MAX_DEMO_TICKS,
  REPLAY_HASH_INTERVAL,
  createDemoPlayback,
  createEventQueue,
  loadContent,
  playReplay,
} from '@shmup/core';
import { readContentFiles } from '../../vite.shared.js';
import { shippedContent } from '../playtest/harness.js';
import {
  DEMO_SCENARIOS,
  DEMO_TICKS,
  EXAMPLE_DEMO,
  EXAMPLE_DEMO_TICKS,
  readDemo,
  recordDemo,
  writeDemo,
} from './demos.js';
import { GOLDEN_UPDATE_ENV } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe('attract demos (content/demos, 4-way bot)', () => {
  it.each(DEMO_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    '%s plays back through the attract playback with every state hash',
    (_id, scenario) => {
      if (updating) {
        writeDemo(scenario, recordDemo(scenario));
        console.info(`[demos] re-blessed ${scenario.id}`);
      }
      const { file, replay } = readDemo(scenario.id);
      expect(file.id).toBe(scenario.id);
      expect(file.description).toBe(scenario.description);
      expect(replay.header.buildId).toBe(DEMO_BUILD_ID);
      expect(replay.header.stageId).toBe(scenario.stageId);
      expect(replay.header.assisted).toBe(true);
      expect(replay.header.checkpoint).toBe(-1);
      for (const [key, value] of Object.entries(scenario.config)) {
        expect(replay.header.config[key as keyof typeof replay.header.config], key).toEqual(value);
      }
      expect(replay.ticks).toBe(DEMO_TICKS);
      expect(replay.hashInterval).toBe(REPLAY_HASH_INTERVAL);

      const events = createEventQueue();
      const demo = createDemoPlayback(replay, shippedContent(), { events });
      let ticks = 0;
      while (demo.step()) {
        ticks++;
        events.clear();
      }
      expect(
        demo.playback.report,
        `desync at tick ${demo.playback.report.desyncTick}: the simulation changed — fix it, or ` +
          're-bless with `pnpm golden:update` and say why in the commit message',
      ).toMatchObject({ ok: true, finished: true });
      expect(ticks + 1).toBe(DEMO_TICKS);
      expect(demo.playback.report.checked).toBe(replay.hashes.length + 1);
      // The bot flies in god mode: the demo shows play, never a game over.
      expect(demo.world.status === 'playing' || demo.world.status === 'bossWarning').toBe(true);
      // The same recording through the golden path (a bare-gameplay session) agrees.
      expect(playReplay(replay, shippedContent()).report.ok).toBe(true);
    },
  );

  it('the shipped content lists exactly these demos, in their order, one per zone', () => {
    // Loaded afresh: a re-blessing run has just written the files.
    const { db, issues } = loadContent(readContentFiles());
    expect(issues.filter((issue) => issue.path.startsWith('demos/'))).toEqual([]);
    expect(db.demos.map((demo) => demo.id)).toEqual(DEMO_SCENARIOS.map((s) => s.id));
    for (const demo of db.demos) {
      expect(demo.ticks).toBe(DEMO_TICKS);
      expect(demo.stageIndex).toBe(db.stageIndex.get(demo.stage ?? ''));
    }
    const zones = db.campaign?.zones.map((zone) => zone.stage) ?? [];
    expect(db.demos.map((demo) => demo.stage)).toEqual(zones);
    expect(DEMO_TICKS).toBeLessThanOrEqual(MAX_DEMO_TICKS);
  });

  it('the format sample is a demo of free flight that plays in sync', () => {
    if (updating) writeDemo(EXAMPLE_DEMO, recordDemo(EXAMPLE_DEMO));
    const { file, replay } = readDemo(EXAMPLE_DEMO.id);
    expect(file.formatVersion).toBe(1);
    expect(replay.header.stageId).toBeNull();
    expect(replay.ticks).toBe(EXAMPLE_DEMO_TICKS);
    // It validates as content (example files are not bundled; `content:check` loads them too).
    const { db, issues } = loadContent([{ path: 'demos/example.replay.json', data: file }]);
    expect(issues).toEqual([]);
    expect(db.demos[0].stage).toBeNull();
    const demo = createDemoPlayback(replay, shippedContent());
    while (demo.step());
    expect(demo.playback.report).toMatchObject({ ok: true, finished: true });
  });

  it('keeps the demos small: the bundled files are a few KB in all', () => {
    let bytes = 0;
    for (const file of readContentFiles()) {
      if (file.path.startsWith('demos/')) bytes += JSON.stringify(file.data).length;
    }
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(24 * 1024);
  });
});
