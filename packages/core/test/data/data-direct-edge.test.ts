/**
 * Edge cases of the Direct-mode content formats (plan M2-05) beyond `data-direct`: the limits of a
 * ship's `startSpeedLevel`, of a family (levels, shots, `volleys`, `refireTicks`, the emitter's
 * `angle` / offsets, `label` / `name` patterns, the slot), of a stage's `directItems` plan (256 at
 * most), a duplicate family id (left out — and the slot check of a later family still names the
 * right path), families spread over several files, and the `powerup` drop on enemies and
 * formations.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_DIRECT_ITEM_PLAN,
  MAX_FAMILY_LEVELS,
  MAX_LEVEL_SHOTS,
  loadContent,
  type ContentFile,
} from '../../src/data/index.js';

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

/**
 * The issue paths of a weapons file with one family.
 *
 * @param family - The family's fields over a valid one-level main family.
 * @returns The paths.
 */
function familyIssues(family: Record<string, unknown>): string[] {
  const { issues } = loadContent([
    file('weapons/w.weapons.json', 'weapons', {
      weapons: [weapon('m', 'main')],
      families: [
        { id: 'f', label: 'F', slot: 'main', levels: [{ shots: [{ weapon: 'm' }] }], ...family },
      ],
    }),
  ]);
  return issues.map((i) => i.path);
}

describe('core/data Direct mode — ship limits', () => {
  it('accepts a start speed within the speeds, rejects negative, fractional or too big ones', () => {
    const ok = loadContent([
      file('player/a.player.json', 'player', { ships: [{ ...SHIP, startSpeedLevel: 2 }] }),
    ]);
    expect(ok.issues).toEqual([]);
    for (const bad of [-1, 1.5, 16, '1']) {
      const { db, issues } = loadContent([
        file('player/a.player.json', 'player', { ships: [{ ...SHIP, startSpeedLevel: bad }] }),
      ]);
      expect(
        issues.map((i) => i.path),
        String(bad),
      ).toEqual(['player/a.player.json:ships[0].startSpeedLevel']);
      expect(db.ships).toEqual([]);
    }
  });
});

describe('core/data Direct mode — family limits', () => {
  it('takes 1 … 9 levels of 1 … 8 shots', () => {
    const shots = (n: number): Record<string, unknown>[] =>
      Array.from({ length: n }, () => ({ weapon: 'm' }));
    const levels = (n: number): Record<string, unknown>[] =>
      Array.from({ length: n }, () => ({ shots: shots(1) }));
    expect(familyIssues({ levels: levels(MAX_FAMILY_LEVELS) })).toEqual([]);
    expect(familyIssues({ levels: [{ shots: shots(MAX_LEVEL_SHOTS) }] })).toEqual([]);
    expect(familyIssues({ levels: [] })).toEqual(['weapons/w.weapons.json:families[0].levels']);
    expect(familyIssues({ levels: [{ shots: [] }] })).toEqual([
      'weapons/w.weapons.json:families[0].levels[0].shots',
    ]);
  });

  it('bounds volleys (1–16), refireTicks (1–600), the angle (±1024) and the offsets (±64)', () => {
    const at = (fields: Record<string, unknown>, shot: Record<string, unknown> = {}): string[] =>
      familyIssues({ levels: [{ shots: [{ weapon: 'm', ...shot }], ...fields }] });
    expect(at({ volleys: 16, refireTicks: 600 }, { angle: -1024, ox: 64, oy: -64 })).toEqual([]);
    const level = 'weapons/w.weapons.json:families[0].levels[0]';
    // A schema issue rejects the file (its weapons with it): the first issue is the one that counts.
    const first = (fields: Record<string, unknown>, shot: Record<string, unknown> = {}): string =>
      at(fields, shot)[0];
    expect(first({ volleys: 0 })).toBe(level + '.volleys');
    expect(first({ volleys: 17 })).toBe(level + '.volleys');
    expect(first({ volleys: 1.5 })).toBe(level + '.volleys');
    expect(first({ refireTicks: 0 })).toBe(level + '.refireTicks');
    expect(first({ refireTicks: 601 })).toBe(level + '.refireTicks');
    expect(first({}, { angle: 1025 })).toBe(level + '.shots[0].angle');
    expect(first({}, { angle: 12.5 })).toBe(level + '.shots[0].angle');
    expect(first({}, { ox: 65 })).toBe(level + '.shots[0].ox');
    expect(first({}, { oy: -64.5 })).toBe(level + '.shots[0].oy');
  });

  it('checks the label, the name and the slot', () => {
    const f = 'weapons/w.weapons.json:families[0]';
    const first = (family: Record<string, unknown>): string | undefined => familyIssues(family)[0];
    expect(first({ label: 'disc' })).toBe(f + '.label');
    expect(first({ label: '' })).toBe(f + '.label');
    expect(familyIssues({ name: 'BEAM > DISC' })).toEqual([]);
    expect(first({ name: 'beam' })).toBe(f + '.name');
    expect(first({ name: 'A NAME FAR TOO LONG' })).toBe(f + '.name');
    expect(first({ slot: 'double' })).toBe(f + '.slot');
  });

  it('leaves a duplicate family out; the slot check of a later family names its own path', () => {
    const { db, issues } = loadContent([
      file('weapons/a.weapons.json', 'weapons', {
        weapons: [weapon('m', 'main'), weapon('u', 'sub')],
        families: [{ id: 'f', label: 'F', slot: 'main', levels: [{ shots: [{ weapon: 'm' }] }] }],
      }),
      file('weapons/b.weapons.json', 'weapons', {
        weapons: [weapon('n', 'main')],
        families: [
          { id: 'f', label: 'F2', slot: 'main', levels: [{ shots: [{ weapon: 'n' }] }] },
          { id: 'g', label: 'G', slot: 'sub', levels: [{ shots: [{ weapon: 'n' }] }] },
        ],
      }),
    ]);
    expect(db.weaponFamilies.map((f) => [f.id, f.label])).toEqual([
      ['f', 'F'],
      ['g', 'G'],
    ]);
    expect(db.weaponFamilyIndex.get('g')).toBe(1);
    expect(issues.map((i) => i.path)).toEqual([
      'weapons/b.weapons.json:families[0].id',
      'weapons/b.weapons.json:families[1].levels[0].shots[0].weapon',
    ]);
  });

  it('resolves a family`s weapons from another weapons file', () => {
    const { db, issues } = loadContent([
      file('weapons/a.weapons.json', 'weapons', { weapons: [weapon('m', 'main')] }),
      file('weapons/b.weapons.json', 'weapons', {
        weapons: [weapon('n', 'main')],
        families: [
          {
            id: 'f',
            label: 'F',
            slot: 'main',
            levels: [{ shots: [{ weapon: 'm' }, { weapon: 'n' }] }],
          },
        ],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.weaponFamilies[0].levels[0].shots.map((s) => s.weaponId)).toEqual([0, 1]);
  });
});

describe('core/data Direct mode — the plan and the drop', () => {
  it('takes a plan of up to 256 colours', () => {
    const colours = (n: number): string[] => Array.from({ length: n }, () => 'blue');
    const ok = loadContent([
      file('stages/a.stage.json', 'stage', {
        ...STAGE,
        directItems: colours(MAX_DIRECT_ITEM_PLAN),
      }),
    ]);
    expect(ok.issues).toEqual([]);
    expect(ok.db.stages[0].directItems).toHaveLength(MAX_DIRECT_ITEM_PLAN);
    const over = loadContent([
      file('stages/a.stage.json', 'stage', {
        ...STAGE,
        directItems: colours(MAX_DIRECT_ITEM_PLAN + 1),
      }),
    ]);
    expect(over.issues.map((i) => i.path)).toEqual(['stages/a.stage.json:directItems']);
    const wrong = loadContent([
      file('stages/a.stage.json', 'stage', { ...STAGE, directItems: 'red' }),
    ]);
    expect(wrong.issues.map((i) => i.path)).toEqual(['stages/a.stage.json:directItems']);
  });

  it('accepts `powerup` as an enemy`s and a formation`s drop', () => {
    const { db, issues } = loadContent([
      file('enemies/e.enemies.json', 'enemies', {
        enemies: [
          {
            id: 'e',
            hp: 1,
            score: 10,
            hurtbox: { hw: 4, hh: 4 },
            script: 'carrier.straight',
            sprite: 'enemies/e',
            drop: 'powerup',
          },
        ],
      }),
      file('stages/a.stage.json', 'stage', {
        ...STAGE,
        events: [
          { x: 10, type: 'formation', enemy: 'e', count: 3, interval: 10, y: 50, drop: 'powerup' },
        ],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.enemies[0].drop).toBe('powerup');
    expect(db.stages[0].events[0]).toMatchObject({ type: 'formation', drop: 'powerup' });
  });
});
