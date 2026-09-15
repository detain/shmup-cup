/**
 * The `passArmour` tunable of `direct.bolt` (plan M2-18 — the release bot runs found the MANTA's
 * waves unable to reach a core behind armour): a piercing shot with `passArmour` 1 clinks on armour
 * (an invulnerable enemy, a boss part that cannot take damage) at most once per hit cooldown and
 * flies on to hurt what is behind it; without the tunable — and for a non-piercing shot, whatever
 * the tunable says — armour stops the shot as before.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, type Enemy } from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { ShotFlag, WEAPON_BEHAVIOR_PARAMS } from '../../src/weapons/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { MANTA, shipped } from '../helpers/direct.js';

/** A static open-space stage. */
const STILL: ContentFile = {
  path: 'stages/still.stage.json',
  data: {
    formatVersion: 1,
    kind: 'stage',
    id: 'still',
    name: 'STILL',
    music: { stage: 'Stage', boss: 'Boss' },
    length: 4000,
    camera: [{ x: 0, speed: 0 }],
    checkpoints: [{ x: 0 }],
    parallax: [],
    tilemap: null,
    events: [],
  },
};

/**
 * Content with the MANTA whose only main level fires one wave (`direct.bolt`, hh 7) and two
 * scriptless targets.
 *
 * @param pierce - Whether the wave pierces.
 * @param passArmour - Its `passArmour` tunable.
 * @returns The DB (validated without an issue).
 */
function waveDb(pierce: boolean, passArmour: number): ContentDb {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('player/manta.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'weapons/w.weapons.json',
        data: {
          formatVersion: 1,
          kind: 'weapons',
          weapons: [
            {
              id: 'w.wave',
              slot: 'main',
              behavior: 'direct.bolt',
              damage: 2,
              speed: 7,
              cap: 3,
              pierce,
              sprite: 'shots/wave',
              sfx: 'PlayerShot',
              params: { hw: 4, hh: 7, hitCooldownTicks: 6, passArmour },
            },
          ],
          families: [
            {
              id: 'wave',
              label: 'WAVE',
              slot: 'main',
              levels: [{ shots: [{ weapon: 'w.wave' }], volleys: 3 }],
            },
          ],
        },
      },
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: ['armor', 'target'].map((id) => ({
            id,
            hp: 1000,
            score: 100,
            hurtbox: { hw: 4, hh: 4 },
            script: 'test.idle',
            sprite: 'enemies/drifter',
            drop: null,
          })),
        },
      },
      STILL,
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

/** What {@link fire} measured. */
interface Outcome {
  /** Hit points the armour lost. */
  readonly armourLost: number;
  /** Hit points the target behind it lost. */
  readonly targetLost: number;
  /** Clink sounds. */
  readonly clinks: number;
  /** Every flag bit a live shot carried. */
  readonly shotFlags: number;
}

/**
 * Parks the MANTA at (40, 100), puts an armoured enemy 50 px ahead in its row and a target 100 px
 * ahead, and lets the forced autofire shoot for 90 ticks.
 *
 * @param db - The content.
 * @returns What happened.
 */
function fire(db: ContentDb): Outcome {
  const w: World = createWorld(resolveGameConfig({ seed: 3, stage: 'still', ...MANTA }), db);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  const ship = w.players[0];
  ship.x = w.camera.x + 40;
  ship.y = w.camera.y + 100;
  const spawn = (id: string, dx: number): Enemy => {
    const e = w.enemies.spawn(db.enemyIndex.get(id) ?? -1, ship.x + dx, ship.y);
    expect(e).not.toBeNull();
    return e as Enemy;
  };
  const armour = spawn('armor', 50);
  armour.flags |= EnemyFlag.Invulnerable;
  const target = spawn('target', 100);
  w.events.clear();
  let clinks = 0;
  let shotFlags = 0;
  for (let t = 0; t < 90; t++) {
    stepWorld(w, input);
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink) clinks++;
    });
    const f = w.weapons.pool.fields;
    for (let i = 0; i < w.weapons.pool.count; i++) shotFlags |= f.flags[i];
  }
  return {
    armourLost: 1000 - armour.hp,
    targetLost: 1000 - target.hp,
    clinks,
    shotFlags,
  };
}

describe('core/weapons — passArmour (M2-18)', () => {
  it('is a direct.bolt tunable, 0 by default', () => {
    expect(WEAPON_BEHAVIOR_PARAMS['direct.bolt'].passArmour).toBe(0);
  });

  it('lets a piercing wave clink on armour and hurt the target behind it', () => {
    const out = fire(waveDb(true, 1));
    expect(out.shotFlags & ShotFlag.PassArmour).toBe(ShotFlag.PassArmour);
    expect(out.armourLost).toBe(0);
    expect(out.targetLost).toBeGreaterThan(0);
    expect(out.clinks).toBeGreaterThan(0);
  });

  it('keeps armour a wall for a piercing wave without it', () => {
    const out = fire(waveDb(true, 0));
    expect(out.shotFlags & ShotFlag.PassArmour).toBe(0);
    expect(out.armourLost).toBe(0);
    expect(out.targetLost).toBe(0);
    expect(out.clinks).toBeGreaterThan(0);
  });

  it('means nothing for a shot that does not pierce', () => {
    const out = fire(waveDb(false, 1));
    expect(out.shotFlags & (ShotFlag.PassArmour | ShotFlag.Pierce)).toBe(0);
    expect(out.targetLost).toBe(0);
  });
});
