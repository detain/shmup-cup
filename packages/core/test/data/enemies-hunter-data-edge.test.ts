/**
 * The content side of plan M2-04: the enemy flag `optionHunter` (a boolean, default `false`, not
 * allowed on a boss entry — a completed boss has it `false`), the drop `blueCapsule` on enemies and
 * formation events, and the shipped files — the three Option Hunters (`hunter.option` variants 0 /
 * 1 / 2, armoured by their flag, no drop), the blue carrier and the `hunter-range` dev stage
 * (hunters only after carriers, a `blueCapsule` formation, two hunters at once).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';

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
 * A minimal enemy entry.
 *
 * @param id - Enemy id.
 * @param over - More fields.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 1,
    score: 10,
    hurtbox: { hw: 3, hh: 3 },
    script: 'x.y',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/**
 * An `enemies` file.
 *
 * @param enemies - Its entries.
 * @returns The file.
 */
function enemiesFile(enemies: unknown[]): ContentFile {
  return { path: 'e.json', data: { formatVersion: 1, kind: 'enemies', enemies } };
}

describe('core/data M2-04: the `optionHunter` flag and the blue capsule drop', () => {
  it('defaults `optionHunter` to false, accepts true, rejects anything but a boolean', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        enemy('plain'),
        enemy('hunter', { optionHunter: true, drop: 'blueCapsule' }),
        enemy('off', { optionHunter: false }),
      ]),
    ]);
    expect(issues).toEqual([]);
    expect(db.enemies.map((e) => [e.optionHunter, e.drop])).toEqual([
      [false, null],
      [true, 'blueCapsule'],
      [false, null],
    ]);
    for (const bad of ['yes', 1, null, {}]) {
      const { issues: found } = loadContent([enemiesFile([enemy('bad', { optionHunter: bad })])]);
      expect(
        found.map((i) => i.path),
        JSON.stringify(bad),
      ).toEqual(['e.json:enemies[0].optionHunter']);
    }
  });

  it('a boss entry may not name it; a completed boss is never an Option Hunter', () => {
    const boss = {
      id: 'warden',
      boss: {
        code: 'WD-01',
        displayName: 'WARDEN',
        parts: [{ name: 'core', hp: 20, hurtbox: { hw: 8, hh: 8 }, core: true }],
        phases: [{ script: 'boss.hover' }],
      },
    };
    const { issues } = loadContent([enemiesFile([{ ...boss, optionHunter: true }])]);
    expect(issues).toEqual([
      {
        path: 'e.json:enemies[0].optionHunter',
        message: 'must be omitted for a boss (its boss section describes it)',
      },
    ]);
    const { db, issues: none } = loadContent([enemiesFile([boss])]);
    expect(none).toEqual([]);
    expect(db.enemies[0].optionHunter).toBe(false);
  });

  it('accepts `blueCapsule` on a formation event, absent / null / capsule as before', () => {
    const { db, issues } = loadContent([
      enemiesFile([enemy('e')]),
      {
        path: 'stages/s.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 's',
          name: 'S',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 1000,
          camera: [{ x: 0, speed: 1 }],
          checkpoints: [],
          parallax: [],
          tilemap: null,
          events: [
            { x: 0, type: 'formation', enemy: 'e', count: 2, interval: 1, drop: 'blueCapsule' },
            { x: 1, type: 'formation', enemy: 'e', count: 2, interval: 1, drop: 'redCapsule' },
          ],
        },
      },
    ]);
    expect(issues).toEqual([
      {
        path: 'stages/s.stage.json:events[1].drop',
        message: 'must be one of: capsule, blueCapsule',
      },
    ]);
    expect(db.stages).toEqual([]); // a bad event fails its whole file
    const ok = loadContent([
      enemiesFile([enemy('e')]),
      {
        path: 'stages/s.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 's',
          name: 'S',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 1000,
          camera: [{ x: 0, speed: 1 }],
          checkpoints: [],
          parallax: [],
          tilemap: null,
          events: [
            { x: 0, type: 'formation', enemy: 'e', count: 2, interval: 1, drop: 'blueCapsule' },
          ],
        },
      },
    ]);
    expect(ok.issues).toEqual([]);
    expect(ok.db.stages[0].events[0]).toMatchObject({ drop: 'blueCapsule' });
  });
});

describe('core/data M2-04: the shipped hunters, blue carrier and hunter range', () => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('paths/test-range.paths.json'),
      shipped('enemies/option-hunters.enemies.json'),
      shipped('enemies/test-range.enemies.json'),
      shipped('stages/hunter-range.stage.json'),
    ],
    { extraSprites: ENGINE_SPRITES, knownScripts: KNOWN_SCRIPT_IDS },
  );

  it('loads without issues', () => {
    expect(issues).toEqual([]);
  });

  it('ships three flagged hunters: variants 0 / 1 / 2, no drop, no settle, the hunter sprite', () => {
    const hunters = db.enemies.filter((e) => e.optionHunter);
    expect(hunters.map((e) => e.id)).toEqual([
      'option-hunter-rear',
      'option-hunter-front',
      'option-hunter-dive',
    ]);
    hunters.forEach((e, variant) => {
      expect(e.script).toBe('hunter.option');
      expect(e.params.variant).toBe(variant);
      expect([e.drop, e.settleTicks, e.megaCrashImmune]).toEqual([null, 0, false]);
      expect(e.sprite).toBe('enemies/option-hunter');
    });
    // Nothing else is a hunter.
    expect(
      db.enemies.filter((e) => !e.optionHunter).every((e) => e.script !== 'hunter.option'),
    ).toBe(true);
    const blue = db.enemies[db.enemyIndex.get('carrier-blue')!];
    expect([blue.drop, blue.script, blue.sprite]).toEqual([
      'blueCapsule',
      'carrier.straight',
      'enemies/carrier-blue',
    ]);
  });

  it('the hunter range: carriers before the first hunter, a blueCapsule formation, a pair', () => {
    const stage = db.stages[db.stageIndex.get('hunter-range')!];
    const events = stage.events;
    const hunterAt = (e: (typeof events)[number]): boolean =>
      e.type === 'spawn' && db.enemies[e.enemyId].optionHunter;
    const first = events.findIndex(hunterAt);
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < first; i++) {
      expect(events[i]).toMatchObject({ type: 'spawn', enemy: 'carrier' });
    }
    expect(events.filter(hunterAt)).toHaveLength(5);
    const variants = new Set(
      events.filter(hunterAt).map((e) => (e.type === 'spawn' ? e.enemy : '')),
    );
    expect(variants.size).toBe(3);
    expect(events.some((e) => e.type === 'formation' && e.drop === 'blueCapsule')).toBe(true);
    expect(events.some((e) => e.type === 'spawn' && e.enemy === 'carrier-blue')).toBe(true);
    // The last two hunters come 60 px apart: both on screen at once.
    const last = events.filter(hunterAt).slice(-2);
    expect(last[1].x - last[0].x).toBeLessThan(384);
  });
});
