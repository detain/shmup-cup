/**
 * Integration edge cases (plan M2-15) of the front end on the **shipped** content, beyond
 * `attract-flow.test.ts`:
 *
 * - the bundled demos come in zone order (A … I), each opening on its own zone's card (`ZONE A` and
 *   the zone's name) — the demo World on its zone's stage, in sync with its recording as far as
 *   the card shows;
 * - the practice select offers the nine zones by label and name, each zone's checkpoints after its
 *   start (the stage's own checkpoints past x 0), and every one of them starts a practice run at
 *   that checkpoint;
 * - the shipped story's three pages each play their own sprite scene — the dawn, the invasion, the
 *   launch — and every scene draws sprites (the pieces it needs are in the shipped atlas);
 * - the hi-score screen names the shipped ships: KESTREL for the power meter, MANTA for Direct.
 */
import { describe, expect, it } from 'vitest';
import {
  Action,
  DrawOp,
  HI_SCORE_PAGE_TICKS,
  TITLE_ATTRACT_TICKS,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  createHiScoreEntry,
  createSaveStore,
  type Game,
  type HeadlessPlatform,
  type SceneFlow,
} from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';

/** A session of the shipped game's flow on the title. */
interface Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform: HeadlessPlatform;
}

/**
 * Starts the shipped game on the title.
 *
 * @param save - The save (default: a fresh one).
 * @returns The session.
 */
function session(save = createSaveStore(null)): Session {
  const platform = createHeadlessPlatform();
  const game = createGame(platform, { stage: 'zone-a' }, shippedContent(), {
    scenes: 'title',
    save,
  });
  return { game, flow: game.scenes as SceneFlow, platform };
}

/**
 * Runs ticks with a held mask, the frame composed after each.
 *
 * @param s - The session.
 * @param held - Actions held.
 * @param ticks - Ticks.
 */
function hold(s: Session, held: number, ticks = 1): void {
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(s.platform.snapshot.players[0], held);
    s.game.step();
    s.game.renderFrame();
    s.game.events.clear();
  }
}

/**
 * The texts of the frame's UI list.
 *
 * @param s - The session.
 * @returns The strings of its text commands.
 */
function uiTexts(s: Session): string[] {
  const ui = s.game.renderFrame().ui;
  const out: string[] = [];
  for (let i = 0; i < ui.count; i++) if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
  return out;
}

/**
 * Counts the sprites of the frame's UI list.
 *
 * @param s - The session.
 * @returns The count.
 */
function uiSprites(s: Session): number {
  const ui = s.game.renderFrame().ui;
  let n = 0;
  for (let i = 0; i < ui.count; i++) if (ui.op[i] === DrawOp.Sprite) n++;
  return n;
}

describe('integration: the front end on the shipped content — edge cases (M2-15)', () => {
  it('plays the demos in zone order, each opening on its zone`s card', () => {
    const db = shippedContent();
    const campaign = db.campaign!;
    const s = session();
    expect(s.flow.demos.map((demo) => demo.header.stageId)).toEqual(
      campaign.zones.map((zone) => zone.stage),
    );
    for (const zone of campaign.zones) {
      s.flow.stack.reset(s.flow.title);
      hold(s, 0, TITLE_ATTRACT_TICKS + 1);
      expect(s.flow.stack.top?.id).toBe('demo');
      const demo = s.flow.demo.demo!;
      expect(demo.world.stage?.stage.id).toBe(zone.stage);
      expect(uiTexts(s)).toEqual(expect.arrayContaining(['ZONE ' + zone.label, zone.name]));
      hold(s, 0, 120);
      expect(demo.playback.report.ok).toBe(true);
      hold(s, Action.Confirm); // any key: the title
      expect(s.flow.stack.top?.id).toBe('title');
    }
    expect(s.flow.demo.started).toBe(campaign.zones.length);
  }, 60_000);

  it('offers every zone and each of its checkpoints in the practice select, and starts there', () => {
    const db = shippedContent();
    const campaign = db.campaign!;
    const probe = session();
    const practice = probe.flow.practiceSelect;
    expect(practice.zone.labels).toEqual(campaign.zones.map((z) => z.label + ' ' + z.name));
    let most = 0;
    for (let z = 0; z < campaign.zones.length; z++) {
      const stage = db.stages[campaign.zones[z].stageId];
      const after: number[] = [];
      stage.checkpoints.forEach((point, i) => {
        if (point.x > 0) after.push(i);
      });
      expect(practice.checkpoints[z], campaign.zones[z].id).toEqual(after);
      expect(after.length, campaign.zones[z].id).toBeGreaterThan(0);
      most = Math.max(most, after.length);
    }
    expect(practice.checkpoint.labels).toHaveLength(most + 1);
    expect(practice.checkpoint.labels[0]).toBe('START');
    // Each zone's every checkpoint starts a practice run there.
    for (let z = 0; z < campaign.zones.length; z++) {
      const zone = campaign.zones[z];
      const stage = db.stages[zone.stageId];
      for (const index of practice.checkpoints[z]) {
        const s = session();
        expect(s.flow.startPractice(zone.id, index), `${zone.id} ${index}`).toBe(true);
        hold(s, 0);
        expect(s.flow.stack.top?.id).toBe('game');
        expect(s.game.world.stage?.stage.id).toBe(zone.stage);
        expect(s.game.world.camera.x, `${zone.id} ${index}`).toBeGreaterThanOrEqual(
          stage.checkpoints[index].x,
        );
        expect(s.flow.run.practice).toBe(true);
      }
    }
  }, 60_000);

  it('plays each story page`s own sprite scene, every one drawing sprites', () => {
    const db = shippedContent();
    const story = db.campaign!.story;
    expect(story.map((page) => page.scene)).toEqual(['dawn', 'invasion', 'launch']);
    const s = session();
    // Straight to the attract loop's tables (past the demos), then the story.
    s.flow.hiScores.showAttract();
    s.flow.stack.reset(s.flow.hiScores);
    hold(s, 0, HI_SCORE_PAGE_TICKS + 1);
    expect(s.flow.stack.top?.id).toBe('story');
    const crawl = s.flow.story;
    const drawn = [0, 0, 0];
    while (s.flow.stack.top?.id === 'story') {
      drawn[crawl.page] += uiSprites(s);
      hold(s, 0);
    }
    expect(drawn.every((count) => count > 0)).toBe(true);
    expect(s.flow.stack.top?.id).toBe('title');
  }, 60_000);

  it('names the shipped ships on the hi-score screen', () => {
    const save = createSaveStore(null);
    save.recordScore('direct-hard-2p', createHiScoreEntry(5_000, { reached: 'zone-c' }));
    const s = session(save);
    s.flow.hiScores.showAttract();
    s.flow.stack.reset(s.flow.hiScores);
    hold(s, 0);
    expect(s.flow.hiScores.pages).toEqual(['meter-normal', 'direct-hard-2p']);
    expect(uiTexts(s)).toContain('KESTREL  NORMAL  1 PLAYER');
    hold(s, 0, HI_SCORE_PAGE_TICKS);
    expect(uiTexts(s)).toEqual(expect.arrayContaining(['MANTA  HARD  2 PLAYERS', 'C']));
  });
});
