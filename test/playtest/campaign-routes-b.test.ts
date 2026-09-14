/**
 * Zone-map routes through zone B (plan M2-10): the 4-way bot in god mode flies the eight routes
 * A → B → D|E → F|G → H|I to their endings (`campaign-routes.ts`). The routes through C are in
 * `campaign-routes-c.test.ts`, so the two halves run in parallel.
 */
import { describe, expect, it } from 'vitest';
import { flyRoutesThrough } from './campaign-routes.js';

describe('playtest: the zone map, routes through B (M2-10)', () => {
  it('clears all eight routes A-B-… with god mode, each ending in H or I', () => {
    const routes = flyRoutesThrough('B');
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
  }, 120_000);
});
