/**
 * The behaviours of plan M2-13 on the shipped zone G roster (`content/enemies/zone-g.enemies.json`),
 * in free flight (a static camera) with the ship holding its fire: `boss.facet` (FACET MONARCH: the
 * core behind its crystals, the arms waving like claws, needles from the tips, rings and one lane
 * at a time from the core in the last phase).
 */
import { describe, expect, it } from 'vitest';
import { BossHit } from '../../src/bosses/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, shippedPatterns } from '../helpers/shipped.js';
import { part, run, zoneKit } from '../helpers/zone-behaviors.js';
import { v1rel } from '../helpers/v1-port.js';

/** The KESTREL, Type A, the zone G roster and the patterns it runs. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-g.enemies.json'),
      ...shippedPatterns(),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const { fighting } = zoneKit(DB);

describe('core/behaviors — zone G (M2-13)', () => {
  it('boss.facet: the core clinks behind its crystals; the arms wave like claws; needles from the tips', () => {
    const w = fighting('facet-monarch');
    const boss = w.bosses.boss;
    const parts = boss.parts;
    const core = part(w, 'core');
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Clink);
    const tip = parts[part(w, 'arm-top-tip')];
    const body = parts[part(w, 'body')];
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      low = Math.min(low, tip.y - body.y);
      high = Math.max(high, tip.y - body.y);
    }
    // The top arm hangs 28 px above the body’s centre and sweeps ±56 units of curl per segment:
    // its tip swings from well above the arm's root row to near the core's row.
    expect(high).toBeGreaterThan(-v1rel(12));
    expect(low).toBeLessThan(-v1rel(44));
    expect(w.bullets.count).toBeGreaterThan(0);
    // Both crystals broken: the core takes damage and the second phase starts.
    w.bosses.damagePart(part(w, 'crystal-top'), 999, 0);
    w.bosses.damagePart(part(w, 'crystal-bottom'), 999, 0);
    run(w, 2);
    expect(boss.phase).toBe(1);
    expect(w.bosses.damagePart(core, 1, 0)).toBe(BossHit.Damaged);
  });

  it('boss.facet: its last phase fires one lane at a time from the core, and rings', () => {
    const w = fighting('facet-monarch');
    const boss = w.bosses.boss;
    w.bosses.damagePart(part(w, 'crystal-top'), 999, 0);
    w.bosses.damagePart(part(w, 'crystal-bottom'), 999, 0);
    run(w, 2);
    w.bosses.damagePart(part(w, 'core'), 40, 0);
    run(w, 2);
    expect(boss.phase).toBe(2);
    let most = 0;
    let lanes = 0;
    let rings = false;
    for (let t = 0; t < 700; t++) {
      const bullets = w.bullets.count;
      const before = w.bullets.lasers.count;
      run(w, 1);
      most = Math.max(most, w.bullets.lasers.count);
      if (w.bullets.lasers.count > before) lanes++;
      if (w.bullets.count >= bullets + 10) rings = true;
    }
    expect(lanes).toBeGreaterThanOrEqual(2);
    expect(most).toBe(1);
    expect(rings).toBe(true);
  });
});
