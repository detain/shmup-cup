/**
 * `pnpm bench` — the 30-minute headless soak of plan M2-18 (shmup_feat.md §23 "responsive after
 * long sessions", §22 zero-allocation budgets): the shipped game through its real scene flow —
 * `createGame` with the scenes, a save store — for {@link SOAK_TICKS} ticks (30 minutes at 60
 * ticks a second), with the 4-way playtest bot at the controls whenever a zone is played (god
 * mode) and a tap of OK every {@link MENU_TAP_TICKS} ticks on every other screen: the campaign's
 * runs zone after zone (the title card, the zone tally, the zone map, the carried players), the
 * endings, the credits, the name entry and the hi-score table, the title and whatever the attract
 * loop shows while the menus wait — every frame drawn (`renderFrame`) and every event drained.
 *
 * After a {@link SOAK_WARMUP_MINUTES}-minute warm-up the heap is sampled once a game minute (after
 * two forced collections, {@link dataHeapBytes}: the objects, without V8's compiled code and its
 * trusted metadata — measured on the M2-18 soak, those two spaces grow by about 1 MB over the half
 * hour as V8 optimises the later zones' code, which is no leak, while the objects rise by ~300 KB,
 * slowing down as the second run meets code already warm); it must stay flat — its highest sample
 * at most {@link SOAK_HEAP_BUDGET} above the first — and the run must really have played (several
 * zones cleared, a run finished).
 *
 * @module
 */
import { getHeapSpaceStatistics } from 'node:v8';
import { describe, expect, it } from 'vitest';
import {
  Action,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  createSaveStore,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { shippedContent, type PlaytestBot } from '../playtest/harness.js';

/** Ticks of the soak: 30 minutes at 60 ticks a second. */
export const SOAK_TICKS = 30 * 60 * 60;

/** Minutes played before the heap baseline. */
export const SOAK_WARMUP_MINUTES = 5;

/** How far the heap may rise above its first sample after the warm-up, bytes. */
export const SOAK_HEAP_BUDGET = 1024 * 1024;

/**
 * The heap's objects: every V8 heap space's used bytes but the code and trusted spaces (compiled
 * code, bytecode and their metadata are V8's, not the game's).
 *
 * @returns Bytes.
 */
export function dataHeapBytes(): number {
  let bytes = 0;
  for (const space of getHeapSpaceStatistics()) {
    const name = space.space_name;
    if (name.startsWith('code_') || name.includes('trusted_')) continue;
    bytes += space.space_used_size;
  }
  return bytes;
}

/** Ticks between two taps of OK outside the game screen. */
const MENU_TAP_TICKS = 30;

/** Ticks per game minute. */
const MINUTE = 60 * 60;

describe('bench: a 30-minute soak through the scene flow', () => {
  it(`plays ${SOAK_TICKS} ticks with a flat heap`, () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (typeof gc !== 'function') throw new Error('pnpm bench needs node --expose-gc');
    const db = shippedContent();
    const platform = createHeadlessPlatform();
    const save = createSaveStore(null);
    const game = createGame(platform, { seed: 5, stage: 'zone-a' }, db, { scenes: 'game', save });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const player = platform.snapshot.players[0];
    let world: World = game.world;
    let bot: PlaytestBot = fourWayBot();
    const scenes = new Map<string, number>();
    const zones: string[] = [];
    const heap: number[] = [];
    let menuTicks = 0;
    let events = 0;
    const start = performance.now();
    for (let tick = 0; tick < SOAK_TICKS; tick++) {
      const top = flow.stack.top?.id ?? 'none';
      scenes.set(top, (scenes.get(top) ?? 0) + 1);
      let held = 0;
      if (top === 'game') {
        if (game.world !== world) {
          world = game.world;
          bot = fourWayBot();
          zones.push(world.stage?.stage.id ?? '');
        }
        held = bot.decide(game.world);
        menuTicks = 0;
      } else {
        menuTicks++;
        if (menuTicks % MENU_TAP_TICKS === 0) held = Action.Confirm;
      }
      commitPlayerInput(player, held & 0xffff);
      game.step();
      game.renderFrame();
      game.events.drain(() => {
        events++;
      });
      if ((tick + 1) % MINUTE === 0 && (tick + 1) / MINUTE >= SOAK_WARMUP_MINUTES) {
        gc();
        gc();
        heap.push(dataHeapBytes());
      }
    }
    const seconds = (performance.now() - start) / 1000;
    const rise = Math.max(...heap) - heap[0];
    const drift = heap[heap.length - 1] - heap[0];
    console.info(
      `[soak] ${String(SOAK_TICKS)} ticks in ${seconds.toFixed(1)} s; ${String(zones.length)} zones ` +
        `entered (${zones.join(' ')}); ${String(save.data.stats.stagesCleared)} cleared; ` +
        `${String(events)} events; heap ${(heap[0] / 1048576).toFixed(1)} MB after the warm-up, ` +
        `highest +${(rise / 1024).toFixed(0)} KB, last ${drift >= 0 ? '+' : ''}${(drift / 1024).toFixed(0)} KB; ` +
        `scenes ${[...scenes].map(([id, n]) => `${id} ${(n / 60).toFixed(0)} s`).join(', ')}`,
    );
    console.info(`[soak] heap KB: ${heap.map((h) => ((h - heap[0]) / 1024).toFixed(0)).join(' ')}`);
    // It really played: several zones, a whole run to an ending, the front end in between.
    expect(zones.length).toBeGreaterThanOrEqual(6);
    expect(save.data.stats.stagesCleared).toBeGreaterThanOrEqual(5);
    expect(scenes.has('map')).toBe(true);
    expect(scenes.has('title')).toBe(true);
    expect(heap).toHaveLength(30 - SOAK_WARMUP_MINUTES + 1);
    expect(rise).toBeLessThan(SOAK_HEAP_BUDGET);
  });
});
