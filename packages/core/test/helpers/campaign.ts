/**
 * Test content of the M2-10 campaign suites: the KESTREL, Type A, a small campaign — start `S` →
 * upper `U` | lower `L`, both final, four endings — on tiny open stages (2 px/tick, an `end` at
 * x 200) and the bonus stage `t-v`.
 */
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
export function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * A tiny open stage: scrolls 2 px/tick and ends at x 200.
 *
 * @param id - Stage id.
 * @param extra - More fields (a type, events).
 * @returns The file.
 */
export function stage(id: string, extra: Record<string, unknown> = {}): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
      length: 600,
      camera: [{ x: 0, speed: 2 }],
      checkpoints: [{ x: 0 }, { x: 100 }],
      parallax: [],
      tilemap: null,
      events: [{ x: 200, type: 'end' }],
      ...extra,
    },
  };
}

/** The campaign: S → U | L. */
export const CAMPAIGN: ContentFile = {
  path: 'campaign/test.campaign.json',
  data: {
    formatVersion: 1,
    kind: 'campaign',
    id: 'test',
    name: 'TEST MAP',
    start: 's',
    zones: [
      { id: 's', label: 'S', name: 'START ZONE', stage: 't-s', preview: ['FIRST.'] },
      { id: 'u', label: 'U', name: 'UPPER ZONE', stage: 't-u', preview: ['HIGH.', 'ROAD.'] },
      { id: 'l', label: 'L', name: 'LOWER ZONE', stage: 't-l' },
    ],
    edges: [
      { from: 's', to: 'u' },
      { from: 's', to: 'l' },
    ],
    endings: [
      { id: 'u-bonus', name: 'UPPER WITH BONUS', zone: 'u', all: ['bonus'] },
      { id: 'u', name: 'UPPER END', zone: 'u' },
      { id: 'l-clean', name: 'LOWER CLEAN', zone: 'l', all: ['noDeath'] },
      { id: 'l', name: 'LOWER END', zone: 'l' },
    ],
  },
};

/**
 * The test content: the KESTREL, Type A, the campaign and its stages (the start zone with a
 * `digit` bonus entrance when asked, and the bonus stage `t-v`).
 *
 * @param bonus - Give the start zone a bonus entrance (the score's tens digit 0 at x 40).
 * @returns The DB.
 */
export function campaignContent(bonus = false): ContentDb {
  const start = bonus
    ? stage('t-s', {
        events: [
          { x: 40, type: 'bonus', stage: 't-v', entrance: 'digit', digit: 0, place: 10 },
          { x: 200, type: 'end' },
        ],
      })
    : stage('t-s');
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      CAMPAIGN,
      start,
      stage('t-u'),
      stage('t-l'),
      stage('t-v', { type: 'bonus', events: [{ x: 300, type: 'end' }] }),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}
