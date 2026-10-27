/**
 * Allocation guards of the M2-10 zone map (definition of done: zero allocations per tick and per
 * frame), in their own file: once a campaign run reaches the map, the choice is moved up and down,
 * the "quit to title?" dialog is opened and answered NO over and over, and the focused node blinks
 * — every UI list rebuild — with the render frame composed every tick. Nothing is launched. The
 * second guard drives the SHIPPED nine-letter campaign so the w15 planet branch (one `list.sprite`
 * per lettered zone behind its label) runs in every rebuild.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import type { SceneFlow } from '../../src/scenes/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { campaignContent, shipped, stage } from '../helpers/campaign.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';

describe('core/scenes zone map allocation (M2-10)', () => {
  it('drives the zone map and its dialog without allocating', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 1, stage: 't-s' }, campaignContent(), {
      scenes: 'game',
    });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const player = platform.snapshot.players[0];
    for (let i = 0; i < 3000 && flow.stack.top?.id !== 'map'; i++) {
      commitPlayerInput(player, 0);
      game.step();
      game.events.clear();
    }
    expect(flow.stack.top?.id).toBe('map');
    let t = 0;
    let dialogs = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 80;
        let held = 0;
        if (phase === 5) held = Action.Down;
        else if (phase === 25) held = Action.Up;
        else if (phase === 40)
          held = Action.Back; // "quit to title?"
        else if (phase === 60) held = Action.Back; // NO
        commitPlayerInput(player, held);
        game.step();
        if (flow.stack.depth > 1) dialogs++;
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(dialogs).toBeGreaterThan(1000);
    expect(flow.stack.sceneAt(0)?.id).toBe('map'); // never launched
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });

  it('rebuilds the shipped nine-planet map and its dialog without allocating (w15)', () => {
    const data = JSON.parse(
      readFileSync(
        new URL('../../../../content/campaign/main.campaign.json', import.meta.url),
        'utf8',
      ),
    ) as { zones: Array<{ stage: string }> };
    const files: ContentFile[] = [
      { path: 'campaign/main.campaign.json', data },
      ...data.zones.map((z) => stage(z.stage)),
    ];
    const { db } = loadContent(
      [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json'), ...files],
      { extraSprites: ENGINE_SPRITES },
    );
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 1, stage: 'zone-a' }, db, { scenes: 'game' });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    flow.run.route.push(0);
    flow.run.zone = 0;
    flow.stack.reset(flow.map);
    const player = platform.snapshot.players[0];
    for (let i = 0; i < 4; i++) {
      commitPlayerInput(player, 0);
      game.step();
      game.events.clear();
    }
    expect(flow.stack.top?.id).toBe('map');
    // The branch is live: nine planet commands in the shipped UI list.
    let planetOps = 0;
    const seeded = game.renderFrame();
    for (let k = 0; k < seeded.ui.count; k++) if (seeded.ui.op[k] === DrawOp.Sprite) planetOps++;
    expect(planetOps).toBe(9);
    let t = 0;
    let dialogs = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 80;
        let held = 0;
        if (phase === 5) held = Action.Down;
        else if (phase === 25) held = Action.Up;
        else if (phase === 40)
          held = Action.Back; // "quit to title?"
        else if (phase === 60) held = Action.Back; // NO
        commitPlayerInput(player, held);
        game.step();
        if (flow.stack.depth > 1) dialogs++;
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(dialogs).toBeGreaterThan(1000);
    expect(flow.stack.sceneAt(0)?.id).toBe('map'); // never launched
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
