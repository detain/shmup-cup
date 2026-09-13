/**
 * The ship choice of M2-05 in `core/config`: `shipId` (default the KESTREL) and Direct mode
 * accepted by `resolveGameConfig`, `withShip` / `shipMatches` (the ship select's choice), and the
 * replay-header round trip of both fields.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  DEFAULT_SHIP_ID,
  POWER_UP_MODES,
  resolveGameConfig,
  shipMatches,
  withArsenal,
  withDifficulty,
  withShip,
} from '../../src/config/index.js';
import { createReplayHeader, decodeReplay, encodeReplay } from '../../src/replay/index.js';

describe('core/config the ship choice (M2-05)', () => {
  it('defaults to the KESTREL and the meter; both power-up models are valid', () => {
    expect(DEFAULT_SHIP_ID).toBe('kestrel');
    expect(DEFAULT_GAME_CONFIG).toMatchObject({ shipId: 'kestrel', powerUpMode: 'meter' });
    expect(POWER_UP_MODES).toEqual(['meter', 'direct']);
    expect(Object.isFrozen(POWER_UP_MODES)).toBe(true);
    expect(resolveGameConfig({ powerUpMode: 'direct', shipId: 'manta' })).toMatchObject({
      powerUpMode: 'direct',
      shipId: 'manta',
    });
    for (const bad of ['', 3, null]) {
      expect(() => resolveGameConfig({ shipId: bad as unknown as string })).toThrow(
        /GameConfig\.shipId must be a non-empty ship id/,
      );
    }
  });

  it('applies the ship select`s choice and keeps the object when nothing changes', () => {
    const base = resolveGameConfig({ seed: 3, weaponPreset: 'type-c' });
    const manta = { shipId: 'manta', powerUpMode: 'direct' as const };
    expect(shipMatches(base, manta)).toBe(false);
    const chosen = withShip(base, manta);
    expect(chosen).toMatchObject({ seed: 3, weaponPreset: 'type-c', ...manta });
    expect(Object.isFrozen(chosen)).toBe(true);
    expect(shipMatches(chosen, manta)).toBe(true);
    expect(withShip(chosen, manta)).toBe(chosen);
    // The other choices compose with it.
    expect(withArsenal(chosen, { megaChoice: 'normal' })).toMatchObject(manta);
    expect(withDifficulty(chosen, 'hard')).toMatchObject({ difficulty: 'hard', ...manta });
    expect(() => withShip(base, { shipId: '', powerUpMode: 'direct' })).toThrow(RangeError);
  });

  it('records the ship and its mode in a replay header', () => {
    const config = resolveGameConfig({ seed: 9, shipId: 'manta', powerUpMode: 'direct' });
    const header = createReplayHeader(config, { buildId: 't', assisted: false });
    const replay = decodeReplay(
      encodeReplay({
        header,
        ticks: 0,
        inputs: [new Uint32Array(0), new Uint32Array(0)],
        hashInterval: 600,
        hashes: new Uint32Array(0),
        finalHash: 0,
      }),
    );
    expect(replay.header.config).toMatchObject({ shipId: 'manta', powerUpMode: 'direct' });
  });
});
