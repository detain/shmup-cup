/**
 * Shared set-up of the Direct-mode tests (plan M2-05): the shipped ships (KESTREL, MANTA), both
 * weapons files (Type A and the Direct-mode families), the carriers (the test range's capsule
 * carrier, the direct carriers' cube and lead carrier), the tileset, the direct range and a static
 * open-space stage without an item plan — and worlds on them.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import {
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

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

/** A static open-space stage without a `directItems` plan (the default plan applies). */
const STILL_STAGE: ContentFile = {
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
 * The Direct-mode test content (see the module docs), validated without a single issue.
 *
 * @returns The DB.
 */
export function directDb(): ContentDb {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('player/manta.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('weapons/direct.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      shipped('paths/test-range.paths.json'),
      shipped('enemies/test-range.enemies.json'),
      shipped('enemies/direct-carriers.enemies.json'),
      shipped('stages/direct-range.stage.json'),
      STILL_STAGE,
    ],
    { extraSprites: ENGINE_SPRITES, knownScripts: KNOWN_SCRIPT_IDS },
  );
  expect(issues).toEqual([]);
  return db;
}

/** The MANTA's config fields. */
export const MANTA: Partial<GameConfig> = Object.freeze({
  shipId: 'manta',
  powerUpMode: 'direct',
});

/**
 * A world whose player 1 is alive (its fly-in stepped through with no input).
 *
 * @param db - The content.
 * @param config - Config overrides (default: the MANTA on the still stage, seed 21).
 * @returns The world.
 */
export function aliveWorld(db: ContentDb, config: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 21, stage: 'still', ...MANTA, ...config }), db);
  const input = createInputSnapshot();
  for (let i = 0; i < 200 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Steps a world with one held mask for some ticks.
 *
 * @param w - The world.
 * @param input - The snapshot to reuse.
 * @param held - Player 1's held actions (`commitPlayerInput` derives the edges).
 * @param ticks - Ticks.
 */
export function run(w: World, input: InputSnapshot, held: number, ticks = 1): void {
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], held);
    stepWorld(w, input);
  }
}
