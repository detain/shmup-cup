/**
 * The shared checks of the zone-map route playtests (plan M2-10 acceptance: "all 16 routes
 * completable by the bot with god mode"): the 4-way bot flies every route through one of zone A's
 * exits with the campaign harness (`campaign.ts`) — each zone a fresh World with the players
 * carried in, as the scene flow builds it — and every zone must reach its stage clear, the rank's
 * stage term must follow the zones cleared, the score must only grow along a route, and every
 * route must end in a final zone with an ending.
 *
 * @module
 */
import { expect } from 'vitest';
import { fourWayBot } from './four-way-bot.js';
import { shippedContent } from './harness.js';
import { walkCampaignRoutes, type RouteOutcome } from './campaign.js';

/**
 * Flies every route through one exit of the start zone and checks it.
 *
 * @param exitLabel - The label of the start zone's exit (`B` or `C`).
 * @returns The routes flown.
 */
export function flyRoutesThrough(exitLabel: string): RouteOutcome[] {
  const campaign = shippedContent().campaign;
  expect(campaign).not.toBeNull();
  if (campaign === null) return [];
  const exit = campaign.zones.findIndex((zone) => zone.label === exitLabel);
  expect(campaign.zones[campaign.startIndex].exits).toContain(exit);
  const routes = walkCampaignRoutes(campaign, () => fourWayBot(), { godMode: true }, [exit]);
  for (const route of routes) {
    console.info(
      `[campaign] ${route.labels}: ${route.cleared ? 'cleared' : 'FAILED'}, ending ${String(route.ending)}, score ${String(route.score)} — ` +
        route.zones.map((z) => `${z.stageId} ${(z.ticks / 60).toFixed(0)} s`).join(', '),
    );
    expect(route.cleared, route.labels).toBe(true);
    expect(route.route).toHaveLength(campaign.depths);
    expect(route.labels[0]).toBe('A');
    expect(route.labels[1]).toBe(exitLabel);
    const last = campaign.zones[route.route[route.route.length - 1]];
    expect(last.final).toBe(true);
    expect(route.ending, route.labels).not.toBeNull();
    expect(campaign.endings.find((e) => e.id === route.ending)?.zone).toBe(last.id);
    route.zones.forEach((zone, depth) => {
      expect(zone.status).toBe('stageClear');
      expect(zone.rankStage).toBe(depth + 1);
      if (depth > 0) expect(zone.score).toBeGreaterThan(route.zones[depth - 1].score);
    });
  }
  return routes;
}
