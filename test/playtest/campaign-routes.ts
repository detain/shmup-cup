/**
 * The shared checks of the zone-map route playtests (plan M2-10 acceptance: "all 16 routes
 * completable by the bot with god mode"; plan M2-18: "bot runs over all 16 routes × both ships"):
 * the 4-way bot flies every route through one of zone A's exits with the campaign harness
 * (`campaign.ts`) — each zone a fresh World with the players carried in, as the scene flow builds
 * it — flying the KESTREL (meter mode) or the MANTA (Direct mode), and
 *
 * - every zone must reach its stage clear in {@link ZONE_MIN_SECONDS}–{@link ZONE_MAX_SECONDS}
 *   (shmup_feat.md §14: a zone lasts 3–6 minutes),
 * - the rank's stage term must follow the zones cleared and the score must only grow along a route,
 * - every route must end in a final zone with an ending — since M2-14 one with its sprite scene and
 *   epilogue,
 * - the 4-way design rules of `rules.ts` must hold on every tick of every zone (M2-18: the bullet
 *   speed limit, the laser lane gaps and the ship's open column — with the rank the run really
 *   reaches).
 *
 * @module
 */
import { expect } from 'vitest';
import { fourWayBot } from './four-way-bot.js';
import { shippedContent } from './harness.js';
import { walkCampaignRoutes, type CampaignFlags, type RouteOutcome } from './campaign.js';
import { createRuleWatch, MIN_LANE_GAP } from './rules.js';

/** Shortest zone the plan allows, in seconds (shmup_feat.md §14). */
export const ZONE_MIN_SECONDS = 3 * 60;

/** Longest zone the plan allows, in seconds (shmup_feat.md §14). */
export const ZONE_MAX_SECONDS = 6 * 60;

/** The two ships of v1.0 and the session options that choose them (M2-05). */
export const ROUTE_SHIPS = Object.freeze({
  /** The meter ship (the default). */
  kestrel: Object.freeze({}),
  /** The Direct-mode ship. */
  manta: Object.freeze({ shipId: 'manta', powerUpMode: 'direct' }),
} as const satisfies Record<string, NonNullable<CampaignFlags['config']>>);

/** A ship of {@link ROUTE_SHIPS}. */
export type RouteShip = keyof typeof ROUTE_SHIPS;

/**
 * Flies every route through one exit of the start zone with one ship and checks it.
 *
 * @param exitLabel - The label of the start zone's exit (`B` or `C`).
 * @param ship - The ship (default the KESTREL).
 * @returns The routes flown.
 */
export function flyRoutesThrough(exitLabel: string, ship: RouteShip = 'kestrel'): RouteOutcome[] {
  const campaign = shippedContent().campaign;
  expect(campaign).not.toBeNull();
  if (campaign === null) return [];
  const exit = campaign.zones.findIndex((zone) => zone.label === exitLabel);
  expect(campaign.zones[campaign.startIndex].exits).toContain(exit);
  const rules = createRuleWatch();
  const routes = walkCampaignRoutes(
    campaign,
    () => fourWayBot(),
    { godMode: true, config: ROUTE_SHIPS[ship], observe: rules.observe },
    [exit],
  );
  for (const route of routes) {
    console.info(
      `[campaign] ${ship} ${route.labels}: ${route.cleared ? 'cleared' : 'FAILED'}, ending ${String(route.ending)}, score ${String(route.score)} — ` +
        route.zones.map((z) => `${z.stageId} ${(z.ticks / 60).toFixed(0)} s`).join(', '),
    );
    expect(route.cleared, route.labels).toBe(true);
    expect(route.route).toHaveLength(campaign.depths);
    expect(route.labels[0]).toBe('A');
    expect(route.labels[1]).toBe(exitLabel);
    const last = campaign.zones[route.route[route.route.length - 1]];
    expect(last.final).toBe(true);
    expect(route.ending, route.labels).not.toBeNull();
    const ending = campaign.endings.find((e) => e.id === route.ending);
    expect(ending?.zone).toBe(last.id);
    // M2-14: every ending a route reaches has its scene and epilogue.
    expect(ending?.scene, route.labels).not.toBe('none');
    expect(ending?.text.length ?? 0, route.labels).toBeGreaterThan(0);
    route.zones.forEach((zone, depth) => {
      const where = `${ship} ${route.labels} ${zone.stageId}`;
      expect(zone.status, where).toBe('stageClear');
      expect(zone.rankStage).toBe(depth + 1);
      if (depth > 0) expect(zone.score).toBeGreaterThan(route.zones[depth - 1].score);
      // M2-18: every zone lasts 3–6 minutes, with either ship.
      expect(zone.ticks / 60, where).toBeGreaterThanOrEqual(ZONE_MIN_SECONDS);
      expect(zone.ticks / 60, where).toBeLessThanOrEqual(ZONE_MAX_SECONDS);
    });
  }
  // M2-18: the 4-way rules on every tick of every zone of every route.
  expect(rules.violations, ship).toEqual([]);
  expect(rules.maxBulletSpeed).toBeGreaterThan(0);
  expect(rules.narrowestColumn).toBeGreaterThanOrEqual(MIN_LANE_GAP);
  return routes;
}
