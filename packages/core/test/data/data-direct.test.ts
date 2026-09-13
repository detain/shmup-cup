/**
 * The Direct-mode content formats (plan M2-05): a ship's `mode` and `startSpeedLevel` (defaults,
 * range), the `weapons` files' `families` (levels, emitters, the slot rule, references), a stage's
 * `directItems` plan and the `powerup` drop — and the shipped files that use them.
 */
import { describe, expect, it } from 'vitest';
import {
  DIRECT_ITEMS,
  ENEMY_DROPS,
  MAX_FAMILY_LEVELS,
  MAX_LEVEL_SHOTS,
  loadContent,
  type ContentFile,
} from '../../src/data/index.js';
import { directDb, shipped } from '../helpers/direct.js';

/**
 * A content file.
 *
 * @param path - Path.
 * @param kind - Kind.
 * @param body - Fields besides the header.
 * @returns The file.
 */
function file(path: string, kind: string, body: Record<string, unknown>): ContentFile {
  return { path, data: { formatVersion: 1, kind, ...body } };
}

/** A minimal ship. */
const SHIP = Object.freeze({
  id: 's',
  name: 'S',
  sprite: 'ships/s',
  speeds: [1, 2, 3],
  hurtRadius: 1.5,
  terrainBox: { hw: 4, hh: 3 },
  pickupBox: { hw: 8, hh: 6 },
  margins: { left: 8, right: 8, top: 6, bottom: 6 },
  enterTicks: 40,
  respawnInvulnTicks: 150,
  bankFrames: 1,
});

/**
 * A weapon of a slot.
 *
 * @param id - Id.
 * @param slot - Slot.
 * @returns The entry.
 */
function weapon(id: string, slot: string): Record<string, unknown> {
  return {
    id,
    slot,
    behavior: 'direct.bolt',
    damage: 1,
    speed: 6,
    cap: 2,
    pierce: false,
    sprite: 'shots/basic',
  };
}

/** A minimal stage. */
const STAGE = Object.freeze({
  id: 'st',
  name: 'ST',
  music: { stage: 'Stage', boss: 'Boss' },
  length: 1000,
  camera: [{ x: 0, speed: 1 }],
  checkpoints: [],
  parallax: [],
  tilemap: null,
  events: [],
});

describe('core/data Direct mode — ships', () => {
  it('defaults a ship to the meter at its first speed, and reads a direct ship`s fields', () => {
    const { db, issues } = loadContent([
      file('player/a.player.json', 'player', {
        ships: [SHIP, { ...SHIP, id: 'd', mode: 'direct', startSpeedLevel: 2 }],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.ships.map((s) => [s.id, s.mode, s.startSpeedLevel])).toEqual([
      ['s', 'meter', 0],
      ['d', 'direct', 2],
    ]);
  });

  it('rejects an unknown mode and a starting speed beyond the speeds (that ship is left out)', () => {
    const { db, issues } = loadContent([
      file('player/a.player.json', 'player', {
        ships: [{ ...SHIP, id: 'x', startSpeedLevel: 3 }, SHIP],
      }),
      file('player/b.player.json', 'player', { ships: [{ ...SHIP, id: 'y', mode: 'items' }] }),
    ]);
    // In file order (the collection pass reports the speed as the file is collected).
    expect(issues).toEqual([
      {
        path: 'player/a.player.json:ships[0].startSpeedLevel',
        message: 'must be < the number of speeds (3)',
      },
      {
        path: 'player/b.player.json:ships[0].mode',
        message: 'must be one of: meter, direct',
      },
    ]);
    expect(db.ships.map((s) => s.id)).toEqual(['s']);
  });
});

describe('core/data Direct mode — weapon families', () => {
  it('collects families with resolved weapon ids, optional fields left out', () => {
    const { db, issues } = loadContent([
      file('weapons/w.weapons.json', 'weapons', {
        weapons: [weapon('m', 'main'), weapon('u', 'sub')],
        families: [
          {
            id: 'f',
            label: 'F',
            slot: 'main',
            levels: [
              { shots: [{ weapon: 'm' }] },
              { shots: [{ weapon: 'm', angle: -16, oy: -3 }], refireTicks: 6, volleys: 2 },
            ],
          },
          {
            id: 'g',
            name: 'SUB > G',
            label: 'SUB',
            slot: 'sub',
            levels: [{ shots: [{ weapon: 'u' }] }],
          },
        ],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.weaponFamilies.map((f) => f.id)).toEqual(['f', 'g']);
    expect(db.weaponFamilyIndex.get('g')).toBe(1);
    const level = db.weaponFamilies[0].levels[1];
    expect(level).toMatchObject({ refireTicks: 6, volleys: 2 });
    expect(level.shots[0]).toMatchObject({ weapon: 'm', weaponId: 0, angle: -16, oy: -3 });
    expect(db.weaponFamilies[1].levels[0].shots[0].weaponId).toBe(1);
  });

  it('reports a weapon of another slot, an unknown weapon, too many levels or shots, a long label', () => {
    const shots = Array.from({ length: MAX_LEVEL_SHOTS + 1 }, () => ({ weapon: 'm' }));
    const levels = Array.from({ length: MAX_FAMILY_LEVELS + 1 }, () => ({
      shots: [{ weapon: 'm' }],
    }));
    const { issues } = loadContent([
      file('weapons/w.weapons.json', 'weapons', {
        weapons: [weapon('m', 'main'), weapon('u', 'sub')],
        families: [
          { id: 'a', label: 'A', slot: 'sub', levels: [{ shots: [{ weapon: 'm' }] }] },
          { id: 'b', label: 'B', slot: 'main', levels: [{ shots: [{ weapon: 'nope' }] }] },
        ],
      }),
      file('weapons/x.weapons.json', 'weapons', {
        weapons: [weapon('n', 'main')],
        families: [{ id: 'c', label: 'TOOLONG', slot: 'main', levels }],
      }),
      file('weapons/y.weapons.json', 'weapons', {
        weapons: [weapon('o', 'main')],
        families: [{ id: 'd', label: 'D', slot: 'main', levels: [{ shots }] }],
      }),
    ]);
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('weapons/x.weapons.json:families[0].label');
    expect(paths).toContain('weapons/x.weapons.json:families[0].levels');
    expect(paths).toContain('weapons/y.weapons.json:families[0].levels[0].shots');
    expect(paths).toContain('weapons/w.weapons.json:families[1].levels[0].shots[0].weapon');
    expect(issues).toContainEqual({
      path: 'weapons/w.weapons.json:families[0].levels[0].shots[0].weapon',
      message: 'weapon "m" belongs in slot main, not in a "sub" family',
    });
  });
});

describe('core/data Direct mode — the item plan and the powerup drop', () => {
  it('reads a stage`s plan, defaults it to empty, and rejects unknown colours', () => {
    const { db, issues } = loadContent([
      file('stages/a.stage.json', 'stage', { ...STAGE, directItems: ['red', 'octagon'] }),
      file('stages/b.stage.json', 'stage', { ...STAGE, id: 'b' }),
      file('stages/c.stage.json', 'stage', { ...STAGE, id: 'c', directItems: ['purple'] }),
      file('stages/d.stage.json', 'stage', { ...STAGE, id: 'd', directItems: [] }),
    ]);
    expect(db.stages.map((s) => [s.id, s.directItems])).toEqual([
      ['st', ['red', 'octagon']],
      ['b', []],
    ]);
    expect(issues.map((i) => i.path)).toEqual([
      'stages/c.stage.json:directItems[0]',
      'stages/d.stage.json:directItems',
    ]);
    expect(DIRECT_ITEMS).toEqual(['red', 'green', 'blue', 'orange', 'yellow', 'octagon']);
    expect(ENEMY_DROPS).toContain('powerup');
  });

  it('ships the MANTA, its three families and zone A`s plan without an issue', () => {
    const db = directDb();
    const manta = db.ships[db.shipIndex.get('manta') ?? -1];
    expect(manta).toMatchObject({ name: 'MANTA', mode: 'direct', startSpeedLevel: 1 });
    expect(manta.speeds).toEqual([1.75, 2.25, 2.75]);
    expect(db.ships[db.shipIndex.get('kestrel') ?? -1].mode).toBe('meter');
    expect(db.weaponFamilies.map((f) => [f.id, f.slot, f.label, f.levels.length])).toEqual([
      ['beam-disc', 'main', 'DISC', 9],
      ['laser-wave', 'main', 'WAVE', 9],
      ['sub-weapon', 'sub', 'SUB', 9],
    ]);
    const zone = loadContent([shipped('stages/zone-a.stage.json')]).db.stages[0];
    expect(zone.directItems.length).toBeGreaterThan(20);
    for (const colour of DIRECT_ITEMS) expect(zone.directItems, colour).toContain(colour);
  });
});
