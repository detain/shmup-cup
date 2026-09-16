/**
 * The **graze value** of the scoring rules (plan M3-02 — `ScoringRules.graze`,
 * `ScoringSystem.rules`): the built-in default, the rules file's bounds, the fallback for a World
 * whose content has no rules file, and the value the World's graze pass actually pays.
 */
import { describe, expect, it } from 'vitest';
import { BulletKind, GRAZE_MARGIN } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import {
  DEFAULT_GRAZE_POINTS,
  DEFAULT_SCORING_RULES,
  MAX_GRAZE_POINTS,
} from '../../src/scoring/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb, shipped } from '../helpers/direct.js';

const db = directDb();

/**
 * A rules file with a graze value.
 *
 * @param graze - The value (omitted when `undefined`).
 * @returns The file.
 */
function rules(graze?: number): ContentFile {
  return {
    path: 'rules/t.rules.json',
    data: {
      formatVersion: 1,
      kind: 'rules',
      scoring: { bulletCancel: 10, ...(graze === undefined ? {} : { graze }) },
    },
  };
}

/**
 * A Direct-mode world on the still stage with a rules file of its own.
 *
 * @param graze - The rules file's graze value.
 * @returns The world, with player 1 alive and invulnerable.
 */
function grazeWorld(graze?: number): World {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      rules(graze),
      {
        path: 'stages/g.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'g',
          name: 'G',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 3000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: null,
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  const w = createWorld(resolveGameConfig({ seed: 4, stage: 'g', graze: true }), content);
  const input = createInputSnapshot();
  for (let i = 0; i < 200 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
  w.players[0].invulnTicks = 600;
  return w;
}

describe('core/scoring — the graze value (M3-02)', () => {
  it('ships a default and a cap', () => {
    expect(DEFAULT_GRAZE_POINTS).toBe(10);
    expect(DEFAULT_SCORING_RULES.graze).toBe(DEFAULT_GRAZE_POINTS);
    expect(MAX_GRAZE_POINTS).toBe(1000);
  });

  it('falls back to the built-in rules when the content ships none', () => {
    const w = aliveWorld(db, { graze: true });
    expect(w.content.scoring).toBeNull();
    expect(w.scoring.rules).toBe(DEFAULT_SCORING_RULES);
    expect(w.scoring.rules.graze).toBe(DEFAULT_GRAZE_POINTS);
  });

  it('pays what the content`s rules file says, once per bullet', () => {
    const w = grazeWorld(250);
    expect(w.scoring.rules.graze).toBe(250);
    const ship = w.players[0];
    const score = w.scoring.board.scores[0];
    const before = score.score;
    w.bullets.spawn(
      ship.x + w.ship.hurtRadius + GRAZE_MARGIN - 1,
      ship.y,
      0,
      0,
      BulletKind.RoundRed,
    );
    const input = createInputSnapshot();
    stepWorld(w, input);
    expect(w.grazes).toBe(1);
    expect(score.score).toBe(before + 250);
    stepWorld(w, input);
    expect(score.score).toBe(before + 250);
  });

  it('a rules file with graze 0 still marks the bullets but pays nothing', () => {
    const w = grazeWorld(0);
    expect(w.scoring.rules.graze).toBe(0);
    const ship = w.players[0];
    const before = w.scoring.board.scores[0].score;
    w.bullets.spawn(ship.x + w.ship.hurtRadius + 1, ship.y, 0, 0, BulletKind.RoundRed);
    stepWorld(w, createInputSnapshot());
    expect(w.grazes).toBe(1);
    expect(w.scoring.board.scores[0].score).toBe(before);
  });

  it('a rules file without a graze value falls back to the default', () => {
    const w = grazeWorld();
    expect(w.scoring.rules.graze ?? DEFAULT_GRAZE_POINTS).toBe(DEFAULT_GRAZE_POINTS);
    const ship = w.players[0];
    const before = w.scoring.board.scores[0].score;
    w.bullets.spawn(ship.x + w.ship.hurtRadius + 1, ship.y, 0, 0, BulletKind.RoundRed);
    stepWorld(w, createInputSnapshot());
    expect(w.scoring.board.scores[0].score).toBe(before + DEFAULT_GRAZE_POINTS);
  });

  it('rejects a graze value outside the file`s bounds', () => {
    for (const bad of [-1, MAX_GRAZE_POINTS + 1, 1.5]) {
      const { issues } = loadContent([rules(bad)], { extraSprites: ENGINE_SPRITES });
      expect(issues.length, String(bad)).toBeGreaterThan(0);
    }
    expect(loadContent([rules(MAX_GRAZE_POINTS)], { extraSprites: ENGINE_SPRITES }).issues).toEqual(
      [],
    );
  });

  it('the shipped rules file gives grazes a value', () => {
    const { db: content, issues } = loadContent([shipped('rules/scoring.rules.json')], {
      extraSprites: ENGINE_SPRITES,
    });
    expect(issues).toEqual([]);
    expect(content.scoring?.graze).toBeGreaterThan(0);
  });
});
