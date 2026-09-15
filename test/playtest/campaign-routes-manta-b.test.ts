/**
 * Zone-map routes through zone B with the MANTA (plan M2-10, M2-18): the 4-way bot in god
 * mode flies the eight routes A → B → D|E → F|G → H|I to their endings (`campaign-routes.ts`) —
 * every zone cleared in 3–6 minutes, the 4-way rules holding on every tick. The routes through
 * C and the other ship are in the other `campaign-routes-*.test.ts` files, so the four
 * quarters (16 routes × both ships) run in parallel.
 */
import { describe, expect, it } from 'vitest';
import { flyRoutesThrough } from './campaign-routes.js';

describe('playtest: the zone map, routes through B with the MANTA (M2-18)', () => {
  it('clears all eight routes A-B-… with god mode, each ending in H or I', () => {
    const routes = flyRoutesThrough('B', 'manta');
    expect(routes.map((r) => r.labels)).toEqual([
      'ABDFH',
      'ABDFI',
      'ABDGH',
      'ABDGI',
      'ABEFH',
      'ABEFI',
      'ABEGH',
      'ABEGI',
    ]);
  }, 180_000);
});
