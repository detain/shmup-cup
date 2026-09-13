/**
 * Edge cases of the ship choice of M2-05 in `core/config` beyond `config-ship`: odd `powerUpMode`
 * and `shipId` values, an omitted field falling back to the default, `shipMatches`
 * on half-matching choices, `withShip` back from the MANTA to the KESTREL (and a ship / mode pair
 * the ship select never makes), and a replay header written before M2-05 (no ship fields) still
 * decoding to the KESTREL in meter mode — while a malformed ship field is refused.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_CONFIG,
  resolveGameConfig,
  shipMatches,
  withShip,
  type GameConfig,
} from '../../src/config/index.js';
import {
  createReplayHeader,
  decodeReplay,
  encodeReplay,
  type ReplayJson,
} from '../../src/replay/index.js';

/**
 * An encoded empty replay of a config.
 *
 * @param config - The config.
 * @returns The JSON document (a deep copy one may edit).
 */
function encoded(config: GameConfig): ReplayJson {
  const header = createReplayHeader(config, { buildId: 't', assisted: false });
  const json = encodeReplay({
    header,
    ticks: 0,
    inputs: [new Uint32Array(0), new Uint32Array(0)],
    hashInterval: 600,
    hashes: new Uint32Array(0),
    finalHash: 0,
  });
  return JSON.parse(JSON.stringify(json)) as ReplayJson;
}

describe('core/config the ship choice — edges', () => {
  it('rejects every power-up mode but the two, whatever its type', () => {
    for (const bad of ['Direct', 'METER', 'items', '', 0, 1, null, true, {}]) {
      expect(
        () => resolveGameConfig({ powerUpMode: bad as unknown as 'meter' }),
        JSON.stringify(bad),
      ).toThrow(/GameConfig\.powerUpMode must be 'meter' or 'direct'/);
    }
  });

  it('rejects a ship id that is not a non-empty string', () => {
    for (const bad of [0, false, {}, [], Number.NaN]) {
      expect(() => resolveGameConfig({ shipId: bad as unknown as string })).toThrow(RangeError);
    }
    // Any other string is accepted here: `createWorld` falls back to the content's first ship.
    expect(resolveGameConfig({ shipId: 'no-such-ship' }).shipId).toBe('no-such-ship');
    expect(resolveGameConfig({ shipId: ' ' }).shipId).toBe(' ');
  });

  it('an omitted field takes the default', () => {
    const config = resolveGameConfig({ seed: 2 });
    expect([config.shipId, config.powerUpMode]).toEqual([
      DEFAULT_GAME_CONFIG.shipId,
      DEFAULT_GAME_CONFIG.powerUpMode,
    ]);
    expect(resolveGameConfig({ powerUpMode: 'direct' }).shipId).toBe('kestrel');
    expect(resolveGameConfig({ shipId: 'manta' }).powerUpMode).toBe('meter');
  });

  it('shipMatches needs both the id and the mode', () => {
    const manta = resolveGameConfig({ shipId: 'manta', powerUpMode: 'direct' });
    expect(shipMatches(manta, { shipId: 'manta', powerUpMode: 'direct' })).toBe(true);
    expect(shipMatches(manta, { shipId: 'manta', powerUpMode: 'meter' })).toBe(false);
    expect(shipMatches(manta, { shipId: 'kestrel', powerUpMode: 'direct' })).toBe(false);
  });

  it('withShip switches back and forth, and does not judge a pair the ship select never makes', () => {
    const base = resolveGameConfig({ seed: 5, difficulty: 'hard' });
    const manta = withShip(base, { shipId: 'manta', powerUpMode: 'direct' });
    const back = withShip(manta, { shipId: 'kestrel', powerUpMode: 'meter' });
    expect(back).not.toBe(base);
    expect(back).toEqual(base);
    expect(shipMatches(back, { shipId: 'kestrel', powerUpMode: 'meter' })).toBe(true);
    // A meter model on the MANTA's id is the content's business, not the config's.
    const odd = withShip(base, { shipId: 'manta', powerUpMode: 'meter' });
    expect([odd.shipId, odd.powerUpMode, odd.difficulty]).toEqual(['manta', 'meter', 'hard']);
    expect(() => withShip(base, { shipId: 'manta', powerUpMode: 'items' as 'direct' })).toThrow(
      RangeError,
    );
  });
});

describe('core/config the ship choice in replay headers', () => {
  it('decodes a header without the ship fields (written before M2-05) as the KESTREL in meter mode', () => {
    const json = encoded(resolveGameConfig({ seed: 12 }));
    const config = json.header.config as unknown as Record<string, unknown>;
    delete config['shipId'];
    delete config['powerUpMode'];
    const replay = decodeReplay(json);
    expect(replay.header.config).toMatchObject({
      seed: 12,
      shipId: 'kestrel',
      powerUpMode: 'meter',
    });
  });

  it('refuses a header with a malformed ship field', () => {
    const empty = encoded(resolveGameConfig({ shipId: 'manta', powerUpMode: 'direct' }));
    (empty.header.config as unknown as Record<string, unknown>)['shipId'] = '';
    expect(() => decodeReplay(empty)).toThrow(RangeError);
    const mode = encoded(resolveGameConfig({ shipId: 'manta', powerUpMode: 'direct' }));
    (mode.header.config as unknown as Record<string, unknown>)['powerUpMode'] = 'items';
    expect(() => decodeReplay(mode)).toThrow(RangeError);
  });
});
