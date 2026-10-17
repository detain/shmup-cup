/**
 * Every sprite a campaign zone really draws is one the zone residency keeps (R1-05).
 *
 * The residency (`packages/shell/src/memory`) decides which atlas pages a zone needs from
 * `stageSpriteSets`, a **static** walk of the zone's stage: its enemies, their children and
 * bosses, its tileset and linked bonus stage, plus the global sprites no zone names. This
 * test checks the walk against what the game actually shows: it plays the god-mode golden
 * replay of every campaign zone (and of the two bonus stages a zone links, under their
 * parent zone) and collects every sprite id the World's view hands the renderer on every
 * tick — the sprite batches, the parallax bands, the terrain's tileset, the lasers, the
 * bending lasers and the Mode-7 floor. Each must be in the zone's own set or the global set.
 *
 * Today a miss costs little (every page keeps its decoded image, and Pixi uploads an
 * unloaded page on its first draw — a hitch, never a missing sprite), but a lazy residency
 * that drops other zones' images (plan R1-05 B3b, R3-04) needs this to hold: a sprite the
 * walk misses would then be missing from the screen.
 */
import type { ContentDb, WorldView } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { stageSpriteSets } from '../../packages/shell/src/memory/index.js';
import { playGolden, readGolden } from '../golden/golden.js';
import { shippedContent } from '../playtest/harness.js';

/** Golden replays of campaign play, and the zone stage whose set they must stay within. */
const RUNS: readonly { readonly golden: string; readonly zone: string }[] = Object.freeze([
  { golden: 'zone-a-god', zone: 'zone-a' },
  { golden: 'zone-b-god', zone: 'zone-b' },
  { golden: 'brine-grotto-god', zone: 'zone-b' }, // zone B's bonus stage
  { golden: 'zone-c-god', zone: 'zone-c' },
  { golden: 'zone-d-god', zone: 'zone-d' },
  { golden: 'zone-e-god', zone: 'zone-e' },
  { golden: 'zone-f-god', zone: 'zone-f' },
  { golden: 'zone-g-god', zone: 'zone-g' },
  { golden: 'glimmer-cache-god', zone: 'zone-g' }, // zone G's bonus stage
  { golden: 'zone-h-god', zone: 'zone-h' },
  { golden: 'zone-i-god', zone: 'zone-i' },
]);

/**
 * Adds every sprite id the view shows this tick.
 *
 * @param view - The World's view.
 * @param out - Collected ids.
 */
function collectViewSprites(view: WorldView, out: Set<number>): void {
  for (const batch of view.batches) {
    for (let i = 0; i < batch.count; i++) out.add(batch.spriteId[i]);
  }
  const parallax = view.parallax;
  if (parallax !== null) for (let i = 0; i < parallax.count; i++) out.add(parallax.spriteId[i]);
  if (view.terrain !== null) out.add(view.terrain.tilesetSpriteId);
  const lasers = view.lasers ?? null;
  if (lasers !== null) for (let i = 0; i < lasers.count; i++) out.add(lasers.spriteId[i]);
  const bending = view.bendingLasers ?? null;
  if (bending !== null) {
    for (let s = 0; s < bending.capacity; s++) {
      if (bending.active[s] === 1) out.add(bending.spriteId[s]);
    }
  }
  const mode7 = view.effects?.mode7 ?? null;
  if (mode7 !== null) out.add(mode7.spriteId);
}

const db: ContentDb = shippedContent();
const sets = stageSpriteSets(db);

describe('the zone residency keeps every sprite a zone draws (R1-05)', () => {
  it.each(RUNS)(
    '$golden draws only sprites of $zone or global ones',
    ({ golden, zone }) => {
      const stage = db.stageIndex.get(zone) ?? -1;
      const own = sets.byStage[stage];
      expect(own, zone).not.toBeNull();
      const { replay } = readGolden(golden);
      const shown = new Set<number>();
      const { report } = playGolden(replay, db, (world) => collectViewSprites(world.view, shown));
      expect(report.ok && report.finished, `${golden} replays in sync to its end`).toBe(true);
      shown.delete(-1); // "no sprite"
      // The run really showed the zone's own art (not only global sprites).
      expect([...shown].filter((id) => own?.has(id) ?? false).length, golden).toBeGreaterThan(3);
      const missed = [...shown]
        .filter((id) => !(own?.has(id) ?? false) && !sets.global.has(id))
        .map((id) => db.sprites.names[id] ?? `#${id}`)
        .sort();
      expect(missed, `${golden}: drawn but not in ${zone}'s set or the global set`).toEqual([]);
    },
    120_000,
  );
});
