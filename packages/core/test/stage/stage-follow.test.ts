/**
 * The runner's camera follow (plan M2-09 — a battleship raid's boss-relative camera path): while a
 * target is set the camera goes where it is (x and y, `dx` / `dy` recorded, the stage length still
 * capping x) instead of scrolling; the timeline stays where the follow began (no key, event,
 * checkpoint or trigger disarm past it — a pan must not fire the `end` event) and carries on once
 * the camera is back; `null` hands the camera back to the scroll; a restart forgets the target.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageSpec } from '../../src/data/index.js';
import { StageSlot, createStageRunner, type StageRunner } from '../../src/stage/index.js';

/** Fired event indices. */
const fired: number[] = [];

/**
 * A runner on an open stage scrolling at 1 px/tick with events at x 50 and 300.
 *
 * @param extra - More stage fields (replacing the defaults).
 * @returns The runner.
 */
function runner(extra: Record<string, unknown> = {}): StageRunner {
  const { db, issues } = loadContent([
    {
      path: 's.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 's',
        name: 'S',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 400,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [{ x: 0 }],
        parallax: [],
        tilemap: null,
        events: [
          { x: 50, type: 'music', cue: 'Boss' },
          { x: 300, type: 'music', cue: 'Stage' },
        ],
        ...extra,
      },
    },
  ]);
  expect(issues).toEqual([]);
  const stage: StageSpec = db.stages[0];
  fired.length = 0;
  return createStageRunner(stage, {
    event(_code, _event, index) {
      fired.push(index);
    },
    clear() {},
  });
}

describe('core/stage — follow (M2-09)', () => {
  it('moves the camera onto its target, recording the step, without advancing the timeline', () => {
    const r = runner();
    for (let i = 0; i < 10; i++) r.tick();
    expect(r.camera.x).toBe(10);
    const target = { x: 10, y: 0 };
    r.brake(0);
    r.follow(target);
    expect(r.following).toBe(target);
    target.x = 70;
    target.y = 25;
    r.tick();
    expect([r.camera.x, r.camera.y, r.camera.dx, r.camera.dy]).toEqual([70, 25, 60, 25]);
    // The event at 50 waits: the timeline stays where the follow began (10).
    expect(fired).toEqual([]);
    expect(r.eventCursor).toBe(0);
    // Backwards and up.
    target.x = 20;
    target.y = 5;
    r.tick();
    expect([r.camera.x, r.camera.y, r.camera.dx, r.camera.dy]).toEqual([20, 5, -50, -20]);
    // The stage length still caps it; still nothing fired.
    target.x = 900;
    r.tick();
    expect(r.camera.x).toBe(400);
    expect(fired).toEqual([]);
    // Back home and handed back: the scroll reaches 50 and fires it then, exactly once.
    target.x = 10;
    target.y = 0;
    r.tick();
    r.follow(null);
    r.unlock();
    for (let i = 0; i < 40; i++) r.tick();
    expect(r.camera.x).toBe(50);
    expect(fired).toEqual([0]);
    for (let i = 0; i < 250; i++) r.tick();
    expect(fired).toEqual([0, 1]);
  });

  it('never fires the stage’s end, spawns, keys or checkpoints the pan passes', () => {
    // A zone-A-like end right after the boss: the pan reaches it (and the length) before the
    // boss's fight is over.
    const r = runner({
      camera: [
        { x: 0, speed: 1 },
        { x: 150, speed: 3 },
      ],
      checkpoints: [{ x: 0 }, { x: 120 }],
      events: [
        { x: 100, type: 'music', cue: 'Boss' },
        { x: 200, type: 'end' },
      ],
    });
    for (let i = 0; i < 90; i++) r.tick();
    expect(r.camera.x).toBe(90);
    const target = { x: 90, y: 0 };
    r.brake(0);
    r.follow(target);
    for (const x of [150, 250, 400, 400, 300, 120]) {
      target.x = x;
      r.tick();
      expect(r.camera.x).toBe(x);
      // Only the key at 0 applied, no event fired, the stage not ended, no checkpoint passed.
      expect([r.state[StageSlot.NextKey], r.ended, r.eventCursor, r.checkpoint]).toEqual([
        1,
        false,
        0,
        0,
      ]);
      expect(fired).toEqual([]);
    }
    // Re-targeting while following keeps where it began.
    const other = { x: 95, y: 0 };
    r.follow(other);
    r.tick();
    expect([r.camera.x, r.eventCursor]).toEqual([95, 0]);
    // Home, handed back and unlocked: the timeline carries on from 90 as if nothing happened.
    other.x = 90;
    r.tick();
    r.follow(null);
    r.unlock();
    for (let i = 0; i < 10; i++) r.tick();
    expect(r.camera.x).toBe(100);
    expect(fired).toEqual([0]);
    expect(r.checkpoint).toBe(0);
    for (let i = 0; i < 30; i++) r.tick();
    expect(r.checkpoint).toBe(1);
    expect(r.ended).toBe(false);
    for (let i = 0; i < 60; i++) r.tick();
    expect(r.targetSpeed).toBe(3);
    expect(r.ended).toBe(true);
    expect(fired).toEqual([0, 1]);
  });

  it('catches up at once when the camera is handed back further on', () => {
    const r = runner();
    r.tick();
    const target = { x: 1, y: 0 };
    r.follow(target);
    target.x = 60;
    r.tick();
    expect(fired).toEqual([]);
    r.follow(null);
    r.tick();
    expect(r.camera.x).toBe(61);
    expect(fired).toEqual([0]);
  });

  it('hands the camera back to the scroll, and a restart forgets the target', () => {
    const r = runner();
    r.tick();
    const target = { x: 100, y: 12 };
    r.follow(target);
    r.tick();
    expect([r.camera.x, r.camera.y]).toEqual([100, 12]);
    r.follow(null);
    expect(r.following).toBeNull();
    r.tick();
    // Scrolling on from there at its speed (no brake here), y kept.
    expect([r.camera.x, r.camera.y]).toEqual([101, 12]);
    r.follow(target);
    r.restartAt(0);
    expect(r.following).toBeNull();
    r.tick();
    expect(r.camera.x).toBe(1);
  });
});
