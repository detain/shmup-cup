/**
 * Allocation guard of the w15-C drop variety paths (plan-of-wave W15), in its own file so the
 * worker's V8 type feedback comes only from these worlds: the weighted `dropWeights` roll on every
 * power-up drop (the gameplay stream draw and the cum walk), the explicit drops of the new kinds
 * (mega / weapon / speed crates, the freed Option's drift pair), their pickups through `resolve`
 * (the cursor parks, the weapon walk, the auto-equip check, the crate sounds), the co-op extras
 * riding the same roll, and the flavored capsule icon `sync` picks from the cursor every tick.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { spawnPlayer } from '../../src/player/index.js';
import { ItemKind, MeterSlot } from '../../src/powerups/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * A scriptless flying target that drops `drop` when killed.
 *
 * @param id - Enemy id.
 * @param drop - The content drop name.
 * @returns The entry.
 */
function enemy(id: string, drop: string): Record<string, unknown> {
  return {
    id,
    hp: 1,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop,
  };
}

/** The weighted table: capsule mass plus every droppable kind (the roll and the cum walk). */
const TABLE = [
  { drop: 'capsule', weight: 40 },
  { drop: 'powerup', weight: 10 },
  { drop: 'weaponPick', weight: 15 },
  { drop: 'speedOnly', weight: 10 },
  { drop: 'mega', weight: 10 },
  { drop: 'freeOption', weight: 8 },
  { drop: 'blueCapsule', weight: 4 },
  { drop: 'oneUp', weight: 2 },
  { drop: 'bonusCapsule', weight: 1 },
];

/**
 * The KESTREL, Type A, a `dropWeights` stage, a co-op extra credit, and one carrier per new
 * explicit drop kind.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('caps', 'capsule'),
            enemy('mega', 'mega'),
            enemy('weapon', 'weaponPick'),
            enemy('speed', 'speedOnly'),
            enemy('option', 'freeOption'),
          ],
        },
      },
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 3000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: null,
          events: [],
          dropWeights: TABLE,
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * A world on the weighted stage, both players alive (the co-op extras roll too), Auto Power-Up on.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(
    resolveGameConfig({
      stage: 't',
      loadout: 'full',
      autoPowerUp: true,
      coopExtra: 0.5,
      seed: 13,
    }),
    db(),
  );
  const input = createInputSnapshot();
  const p2 = w.players[1];
  p2.active = true;
  spawnPlayer(p2, w.camera);
  while (w.players[0].state !== 'alive' || p2.state !== 'alive') stepWorld(w, input);
  p2.x = w.players[0].x;
  p2.y = w.camera.y + 200;
  return w;
}

describe('core/powerups drop-variety allocation', () => {
  it('allocates nothing over the weighted rolls, the new kinds and the flavor sync', () => {
    const w = world();
    const ship = w.players[0];
    const meter = w.powerups.meters[0];
    const dropIdx = {
      caps: w.content.enemyIndex.get('caps')!,
      mega: w.content.enemyIndex.get('mega')!,
      weapon: w.content.enemyIndex.get('weapon')!,
      speed: w.content.enemyIndex.get('speed')!,
      option: w.content.enemyIndex.get('option')!,
    };
    const fields = w.powerups.pool.fields;
    const input = createInputSnapshot();
    let t = 0;
    let pickups = 0;
    let kindSeen = 0;
    const growth = measureHeapGrowth(
      () => {
        // Weave up and down (the magnet and pickups follow the ship), press on the crate stops.
        let held = (t / 30) % 2 < 1 ? Action.Up : Action.Down;
        if (t % 40 === 0) held |= Action.PowerUp;
        if (t % 90 === 45) meter.cursor = MeterSlot.Mega;
        commitPlayerInput(input.players[0], held);
        const sx = Math.floor(ship.x) | 0;
        const sy = Math.floor(ship.y) | 0;
        // A power-up drop every 7 ticks: the weighted roll (and the co-op extras) on each.
        if (t % 7 === 0) w.enemies.kill(w.enemies.spawn(dropIdx.caps, sx + 28, sy)!, 0);
        // Each new explicit kind in turn: mega, weapon, speed, freed Option.
        if (t % 16 === 1) w.enemies.kill(w.enemies.spawn(dropIdx.mega, sx + 28, sy)!, 0);
        else if (t % 16 === 5) w.enemies.kill(w.enemies.spawn(dropIdx.speed, sx + 28, sy)!, 0);
        else if (t % 16 === 9) w.enemies.kill(w.enemies.spawn(dropIdx.option, sx + 28, sy)!, 0);
        else if (t % 16 === 13) w.enemies.kill(w.enemies.spawn(dropIdx.weapon, sx + 28, sy)!, 0);
        // Plain capsules beside the ship too: the flavor icon and the magnet on every one.
        if (t % 12 === 0) w.powerups.spawnItem(ItemKind.Capsule, sx + 20, sy + 3);
        if (ship.lives < 3) ship.lives = 3;
        for (let i = 0; i < w.powerups.count; i++) kindSeen |= 1 << fields.kind[i];
        t++;
        stepWorld(w, input);
        pickups += w.powerups.outcomes.pickupCount;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    // The loop really visited the kinds: capsule, the three crates and a freed Option.
    expect(pickups).toBeGreaterThan(100);
    const seen = [
      ItemKind.Capsule,
      ItemKind.Mega,
      ItemKind.WeaponPick,
      ItemKind.SpeedOnly,
      ItemKind.FreeOption,
    ];
    for (const kind of seen) expect(kindSeen & (1 << kind), `kind ${kind}`).not.toBe(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
