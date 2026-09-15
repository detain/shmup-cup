/**
 * The M2-18 additions to the campaign harness (`campaign.ts`, `campaign-routes.ts`), cheaply — a
 * few ticks of zone A instead of whole routes:
 *
 * - `CampaignFlags.observe` is called once after every tick of every zone, with the zone's World
 *   (its tick advancing by one, the tick's events already cleared), and stops with the zone;
 * - `ROUTE_SHIPS` picks the KESTREL (the default, meter mode) or the MANTA (Direct mode) — the
 *   Worlds the routes are flown in really carry that ship;
 * - the zone length bounds are shmup_feat.md §14's 3–6 minutes.
 */
import type { World } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { walkCampaignRoutes } from './campaign.js';
import { ROUTE_SHIPS, ZONE_MAX_SECONDS, ZONE_MIN_SECONDS } from './campaign-routes.js';
import { fourWayBot } from './four-way-bot.js';
import { shippedContent } from './harness.js';

const CAMPAIGN = shippedContent().campaign;

describe('playtest campaign: observe and the route ships (M2-18 tests)', () => {
  it('has the shipped campaign', () => {
    expect(CAMPAIGN).not.toBeNull();
  });

  it('calls observe once after every tick of the zone, with its World', () => {
    if (CAMPAIGN === null) return;
    const seen: { tick: number; events: number; world: World }[] = [];
    const routes = walkCampaignRoutes(CAMPAIGN, () => fourWayBot(), {
      maxTicks: 40,
      observe: (world) => {
        seen.push({ tick: world.tick, events: world.events.length, world });
      },
    });
    // Nothing clears in 40 ticks: one route, stopped in the start zone.
    expect(routes).toHaveLength(1);
    expect(routes[0].cleared).toBe(false);
    const zone = routes[0].zones[0];
    expect(zone.ticks).toBe(40);
    expect(seen).toHaveLength(zone.ticks);
    for (let k = 1; k < seen.length; k++) {
      expect(seen[k].tick).toBe(seen[k - 1].tick + 1);
      expect(seen[k].world).toBe(seen[0].world);
    }
    expect(seen.every((s) => s.events === 0)).toBe(true);
    expect(seen[0].world.config.stage).toBe(zone.stageId);
  });

  it('flies the KESTREL by default and the MANTA in Direct mode with its ROUTE_SHIPS config', () => {
    if (CAMPAIGN === null) return;
    const shipOf = (config: (typeof ROUTE_SHIPS)[keyof typeof ROUTE_SHIPS]): string[] => {
      let seen: string[] = [];
      walkCampaignRoutes(CAMPAIGN, () => fourWayBot(), {
        maxTicks: 2,
        config,
        observe: (world) => {
          seen = [world.config.shipId, world.config.powerUpMode];
        },
      });
      return seen;
    };
    expect(shipOf(ROUTE_SHIPS.kestrel)).toEqual(['kestrel', 'meter']);
    expect(shipOf(ROUTE_SHIPS.manta)).toEqual(['manta', 'direct']);
    expect(Object.keys(ROUTE_SHIPS)).toEqual(['kestrel', 'manta']);
    expect(Object.isFrozen(ROUTE_SHIPS)).toBe(true);
    expect(Object.isFrozen(ROUTE_SHIPS.manta)).toBe(true);
  });

  it('bounds a zone to 3–6 minutes (shmup_feat.md §14)', () => {
    expect(ZONE_MIN_SECONDS).toBe(180);
    expect(ZONE_MAX_SECONDS).toBe(360);
  });
});
