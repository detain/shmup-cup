/**
 * The runner's camera follow (plan M2-09 — a battleship raid's boss-relative camera path): while a
 * target is set the camera goes where it is (x and y, `dx` / `dy` recorded, the stage length still
 * capping x) instead of scrolling; the events it passes still fire; `null` hands the camera back to
 * the scroll; a restart forgets the target.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageSpec } from '../../src/data/index.js';
import { createStageRunner, type StageRunner } from '../../src/stage/index.js';

/** Fired event indices. */
const fired: number[] = [];

/**
 * A runner on an open stage scrolling at 1 px/tick with events at x 50 and 300.
 *
 * @returns The runner.
 */
function runner(): StageRunner {
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
  it('moves the camera onto its target, recording the step, and fires the events it passes', () => {
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
    expect(fired).toEqual([0]);
    // Backwards and up.
    target.x = 20;
    target.y = 5;
    r.tick();
    expect([r.camera.x, r.camera.y, r.camera.dx, r.camera.dy]).toEqual([20, 5, -50, -20]);
    // The stage length still caps it.
    target.x = 900;
    r.tick();
    expect(r.camera.x).toBe(400);
    expect(fired).toEqual([0, 1]);
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
