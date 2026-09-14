/**
 * Zone-map routes through zone C (plan M2-10): the 4-way bot in god mode flies the eight routes
 * A → C → D|E → F|G → H|I to their endings (`campaign-routes.ts`); with
 * `campaign-routes-b.test.ts` that is all 16 routes of the shipped diamond.
 */
import { describe, expect, it } from 'vitest';
import { flyRoutesThrough } from './campaign-routes.js';

describe('playtest: the zone map, routes through C (M2-10)', () => {
  it('clears all eight routes A-C-… with god mode, each ending in H or I', () => {
    const routes = flyRoutesThrough('C');
    expect(routes.map((r) => r.labels)).toEqual([
      'ACDFH',
      'ACDFI',
      'ACDGH',
      'ACDGI',
      'ACEFH',
      'ACEFI',
      'ACEGH',
      'ACEGI',
    ]);
  }, 120_000);
});
