/**
 * R4-01.A2 — `core/world` draws a thruster flame behind every ship (`syncWorldView`). The thruster
 * is presentation only: it is pushed before the hull (whole-pixel, so it never boxes), cycles the
 * sprite's four frames by `(tick >> 2) & 3`, blinks and disappears with its ship, and is absent
 * for a ship whose content has no `thruster` (the built-in default ship). Player 2 burns the
 * `@p2` variant when the atlas has one. None of this is hashed, so the goldens are untouched.
 *
 * The shipped KESTREL and MANTA carry thrusters (`content/player/*.player.json`); the DB is loaded
 * from those files with `extraSprites: ENGINE_SPRITES`. Test files hold literal pixel offsets by
 * convention (the frame-literal scans do not read `test/`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { killPlayer } from '../../src/player/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import {
  ENGINE_SPRITES,
  createWorld,
  stepWorld,
  syncWorldView,
  type World,
} from '../../src/world/index.js';

/** Pixels between a ship's centre and its thruster's anchor (mirrors `world` `PLAYER_THRUSTER_REAR_OFFSET`). */
const REAR = 12;

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

/** The ships, Type A and an open stage (free flight has no ship batch of its own). */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('player/manta.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 60000,
          camera: [{ x: 0, speed: 0.75 }],
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
  return content;
}

/**
 * A KESTREL world with the ship settled alive (fly-in done), player 2 optional.
 *
 * @param config - Extra game config.
 * @returns The world and its DB.
 */
function aliveWorld(config: Partial<GameConfig> = {}): { w: World; db: ContentDb } {
  const content = db();
  const w = createWorld(resolveGameConfig({ stage: 't', seed: 7, ...config }), content);
  const input = createInputSnapshot();
  if (config.coop) commitPlayerInput(input.players[1], Action.Pause);
  while (w.players[0].state !== 'alive' || (config.coop && w.players[1].state !== 'alive')) {
    stepWorld(w, input);
  }
  w.players[0].invulnTicks = 0;
  w.players[1].invulnTicks = 0;
  return { w, db: content };
}

describe('core/world thruster (R4-01.A2)', () => {
  it('resolves the shipped ships` thruster ids and the @p2 variant', () => {
    const content = db();
    const kestrel = content.ships.find((s) => s.id === 'kestrel');
    const manta = content.ships.find((s) => s.id === 'manta');
    expect(kestrel?.thruster).toBe('ships/kestrel-thruster');
    expect(kestrel?.thrusterId).toBeGreaterThanOrEqual(0);
    expect(content.sprites.names[kestrel?.thrusterId ?? -1]).toBe('ships/kestrel-thruster');
    expect(content.sprites.names[kestrel?.thrusterP2Id ?? -1]).toBe('ships/kestrel-thruster@p2');
    expect(manta?.thruster).toBe('ships/manta-thruster');
    expect(content.sprites.names[manta?.thrusterId ?? -1]).toBe('ships/manta-thruster');
    expect(content.sprites.names[manta?.thrusterP2Id ?? -1]).toBe('ships/manta-thruster@p2');
  });

  it('pushes the thruster behind the ship, whole-pixel, the ship fractional as before', () => {
    const { w, db: content } = aliveWorld();
    syncWorldView(w);
    const b = w.playerBatch;
    const p = w.players[0];
    expect(b.count).toBe(2);
    expect(b.spriteId[0]).toBe(w.ship.thrusterId);
    expect(b.spriteId[1]).toBe(w.ship.spriteId);
    expect(Number.isInteger(b.x[0]) && Number.isInteger(b.y[0])).toBe(true);
    expect(b.x[0]).toBe((Math.floor(p.x) | 0) - REAR);
    expect(b.y[0]).toBe(Math.floor(p.y) | 0);
    expect(b.x[1]).toBe(p.x);
    expect(b.y[1]).toBe(p.y);
    expect(content.sprites.names[b.spriteId[0]]).toBe('ships/kestrel-thruster');
  });

  it('cycles the thruster frame by (tick >> 2) & 3 and shows all four', () => {
    const { w } = aliveWorld();
    const input = createInputSnapshot();
    const seen = new Set<number>();
    for (let i = 0; i < 32; i++) {
      syncWorldView(w);
      const b = w.playerBatch;
      expect(b.frame[0]).toBe((w.tick >> 2) & 3);
      seen.add(b.frame[0]);
      stepWorld(w, input);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('hides the thruster with the ship while invulnerable-blinking and dying/dead', () => {
    const { w } = aliveWorld();
    const p = w.players[0];
    p.invulnTicks = 6; // bit 2 set → hidden
    syncWorldView(w);
    expect(w.playerBatch.flags[0] & SpriteFlag.Hidden).toBe(SpriteFlag.Hidden);
    expect(w.playerBatch.flags[1] & SpriteFlag.Hidden).toBe(SpriteFlag.Hidden);
    p.invulnTicks = 2; // bit 2 clear → shown
    syncWorldView(w);
    expect(w.playerBatch.flags[0] & SpriteFlag.Hidden).toBe(0);
    // A kill drops both the thruster and the hull for the whole death sequence.
    p.invulnTicks = 0;
    killPlayer(p);
    const input = createInputSnapshot();
    let guard = 0;
    while ((p.state === 'dying' || p.state === 'dead') && guard++ < 300) {
      syncWorldView(w);
      expect(w.playerBatch.count).toBe(0);
      stepWorld(w, input);
    }
  });

  it('draws no thruster for a ship without one (the built-in default ship)', () => {
    const { w, db: content } = aliveWorld();
    (w as { ship: World['ship'] }).ship = { ...content.ships[0], thrusterId: -1, thrusterP2Id: -1 };
    syncWorldView(w);
    const b = w.playerBatch;
    expect(b.count).toBe(1);
    expect(b.spriteId[0]).toBe(w.ship.spriteId);
  });

  it('burns the @p2 thruster for player 2 in co-op', () => {
    const { w } = aliveWorld({ coop: true });
    w.players[0].invulnTicks = 0;
    w.players[1].invulnTicks = 0;
    syncWorldView(w);
    const b = w.playerBatch;
    // R4-01.A2: both flames first (player 0's, then player 1's @p2), then the hulls.
    expect([b.spriteId[0], b.spriteId[1], b.spriteId[2], b.spriteId[3]]).toEqual([
      w.ship.thrusterId,
      w.ship.thrusterP2Id,
      w.ship.spriteId,
      w.ship.spriteP2Id,
    ]);
  });
});
