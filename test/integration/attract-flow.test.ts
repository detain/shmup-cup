/**
 * Integration (plan M2-15): the attract loop of the shipped game. Every bundled demo
 * (`content/demos/`, one per zone) plays through the scene flow's own demo screen — the title's
 * idle time, the demo World built from the recording's header, every recorded tick with its hashes
 * checked, silent — to its end without a desync, then the hi-score tables, the campaign's story
 * crawl and the title again.
 */
import { describe, expect, it } from 'vitest';
import {
  HI_SCORE_PAGE_TICKS,
  SimEventKind,
  TITLE_ATTRACT_TICKS,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  type SceneFlow,
} from '@shmup/core';
import { DEMO_TICKS } from '../golden/demos.js';
import { shippedContent } from '../playtest/harness.js';

describe('integration: the attract loop on the shipped content (M2-15)', () => {
  it('plays every bundled demo through the flow in sync, then the tables and the story', () => {
    const db = shippedContent();
    expect(db.demos).toHaveLength(9);
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { stage: 'zone-a' }, db, { scenes: 'title' });
    const flow = game.scenes as SceneFlow;
    expect(flow.demos).toHaveLength(9);
    const player = platform.snapshot.players[0];
    let sounds = 0;
    const step = (): void => {
      commitPlayerInput(player, 0);
      game.step();
      game.renderFrame();
      game.events.drain((e) => {
        if (e.kind === SimEventKind.Sfx && flow.stack.top?.id === 'demo') sounds++;
      });
    };
    for (let k = 0; k < db.demos.length; k++) {
      flow.stack.reset(flow.title);
      for (let t = 0; t < TITLE_ATTRACT_TICKS; t++) step();
      expect(flow.stack.top?.id).toBe('demo');
      expect(flow.demo.started).toBe(k + 1);
      const demo = flow.demo.demo!;
      expect(demo.replay.header.stageId).toBe(db.demos[k].stage);
      for (let t = 0; t < DEMO_TICKS; t++) step();
      expect(demo.playback.report, db.demos[k].id).toMatchObject({ ok: true, finished: true });
      expect(flow.stack.top?.id).toBe('hiScore');
    }
    expect(sounds).toBe(0); // the demos are silent
    // The tables, then the story's three pages crawl, then the title.
    for (let t = 0; t < HI_SCORE_PAGE_TICKS; t++) step();
    expect(flow.stack.top?.id).toBe('story');
    expect(flow.story.rows.filter((row) => row !== '')).toHaveLength(12);
    const pages = new Set<number>();
    for (let t = 0; t < flow.story.duration; t++) {
      pages.add(flow.story.page);
      step();
    }
    expect([...pages]).toEqual([0, 1, 2]);
    expect(flow.stack.top?.id).toBe('title');
  }, 120_000);
});
