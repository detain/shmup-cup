/**
 * `core/config` — edge cases of the meter arsenal fields of plan M2-03 (the main suite is
 * `config-arsenal.test.ts`): Weapon Edit validation order and shapes, what `withArsenal` does with
 * `null` / `undefined` / frozen and invalid choices, how it composes with `withDifficulty` (and a
 * content difficulty table), `arsenalMatches` on every field, and replay headers without the new
 * keys (format version unchanged: a missing key resolves to the default) or with malformed ones.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_POWER_UP_ORDER,
  DEFAULT_DIFFICULTY_TABLE,
  DEFAULT_GAME_CONFIG,
  MAX_AUTO_POWER_UP_ORDER,
  MEGA_CHOICES,
  arsenalMatches,
  resolveGameConfig,
  withArsenal,
  withDifficulty,
  type DifficultyTable,
  type GameConfig,
  type MeterSlotName,
} from '../../src/config/index.js';
import { MegaEffect } from '../../src/powerups/index.js';
import {
  REPLAY_FORMAT_VERSION,
  createReplayHeader,
  decodeReplay,
  encodeReplay,
  type ReplayJson,
} from '../../src/replay/index.js';

/**
 * An encoded replay of 0 ticks for a config, as plain JSON data.
 *
 * @param config - The config.
 * @returns The document (a fresh object — edit it freely).
 */
function replayJson(config: GameConfig): ReplayJson {
  const json = encodeReplay({
    header: createReplayHeader(config, { buildId: 'test' }),
    ticks: 0,
    hashInterval: 600,
    inputs: [new Uint32Array(0), new Uint32Array(0)],
    hashes: new Uint32Array(0),
    finalHash: 0,
  });
  return JSON.parse(JSON.stringify(json)) as ReplayJson;
}

describe('core/config arsenal edges (M2-03): validation', () => {
  it('checks the Weapon Edit`s slots in meter order and rejects non-objects', () => {
    for (const bad of [[], ['a', 'b', 'c'], 'x', 3, true]) {
      expect(() => resolveGameConfig({ weaponEdit: bad as never }), JSON.stringify(bad)).toThrow(
        'GameConfig.weaponEdit must be null or { missile, double, laser }',
      );
    }
    expect(() =>
      resolveGameConfig({ weaponEdit: { missile: 1, double: 2, laser: 3 } as never }),
    ).toThrow('GameConfig.weaponEdit.missile must be a non-empty weapon id');
    expect(() =>
      resolveGameConfig({ weaponEdit: { missile: 'm', double: 'd', laser: '' } }),
    ).toThrow('GameConfig.weaponEdit.laser must be a non-empty weapon id');
    expect(() => resolveGameConfig({ weaponEdit: {} as never })).toThrow(/weaponEdit\.missile/);
    // Every error is a RangeError.
    expect(() => resolveGameConfig({ weaponEdit: [] as never })).toThrow(RangeError);
  });

  it('accepts any non-empty preset id (the content decides) and names bad choices', () => {
    expect(resolveGameConfig({ weaponPreset: 'no-such-type' }).weaponPreset).toBe('no-such-type');
    expect(resolveGameConfig({ weaponPreset: ' ' }).weaponPreset).toBe(' ');
    expect(() => resolveGameConfig({ weaponPreset: null as never })).toThrow(
      'GameConfig.weaponPreset must be a non-empty weapon preset id, got object',
    );
    expect(() => resolveGameConfig({ weaponPreset: '' })).toThrow(/got ""/);
    expect(() => resolveGameConfig({ megaChoice: 'MEGA CRASH' as never })).toThrow(
      'GameConfig.megaChoice must be one of megaCrash, normal, speedDown, lifeOption, fullBarrier, got MEGA CRASH',
    );
    expect(() => resolveGameConfig({ shieldChoice: null as never })).toThrow(
      'GameConfig.shieldChoice must be one of forceField, shield, freeShield, rotateShield, reduce, got null',
    );
    // Every `!` choice resolves, in the order of core/powerups' MegaEffect codes.
    for (const choice of MEGA_CHOICES) {
      expect(resolveGameConfig({ megaChoice: choice }).megaChoice).toBe(choice);
    }
    expect(MEGA_CHOICES.indexOf('fullBarrier')).toBe(MegaEffect.FullBarrier);
    expect(MEGA_CHOICES.indexOf('lifeOption')).toBe(MegaEffect.LifeOption);
  });
});

describe('core/config arsenal edges (M2-03): withArsenal', () => {
  const edit = { missile: 'missile.spread', double: 'shot.tail', laser: 'laser.ripple' };

  it('an empty choice changes nothing (a new frozen config equal to the old)', () => {
    const base = resolveGameConfig({ seed: 11, weaponEdit: edit, megaChoice: 'normal' });
    const same = withArsenal(base, {});
    expect(same).toEqual(base);
    expect(Object.isFrozen(same)).toBe(true);
    expect(arsenalMatches(base, {})).toBe(true);
  });

  it('`null` clears a Weapon Edit, `undefined` keeps it; the input objects are not kept', () => {
    const base = resolveGameConfig({ weaponEdit: edit });
    expect(withArsenal(base, { weaponEdit: undefined }).weaponEdit).toEqual(edit);
    expect(withArsenal(base, { weaponEdit: null }).weaponEdit).toBeNull();
    const choice = { missile: 'a', double: 'b', laser: 'c' };
    const order: MeterSlotName[] = ['option', 'speed'];
    const armed = withArsenal(base, { weaponEdit: choice, autoPowerUpOrder: order });
    expect(armed.weaponEdit).toEqual(choice);
    expect(armed.weaponEdit).not.toBe(choice);
    expect(Object.isFrozen(armed.weaponEdit)).toBe(true);
    expect(armed.autoPowerUpOrder).not.toBe(order);
    expect(Object.isFrozen(armed.autoPowerUpOrder)).toBe(true);
    order.push('mega');
    expect(armed.autoPowerUpOrder).toEqual(['option', 'speed']);
    // An empty order is allowed (Auto Power-Up then wants nothing).
    expect(withArsenal(base, { autoPowerUpOrder: [] }).autoPowerUpOrder).toEqual([]);
  });

  it('throws for an invalid choice and leaves the config alone', () => {
    const base = resolveGameConfig({ seed: 2 });
    const tooLong = new Array<MeterSlotName>(MAX_AUTO_POWER_UP_ORDER + 1).fill('speed');
    expect(() => withArsenal(base, { autoPowerUpOrder: tooLong })).toThrow(/at most 32/);
    expect(() => withArsenal(base, { autoPowerUpOrder: ['speed', 'turbo' as never] })).toThrow(
      /autoPowerUpOrder\[1\]/,
    );
    expect(() => withArsenal(base, { weaponPreset: '' })).toThrow(/weaponPreset/);
    expect(() => withArsenal(base, { weaponEdit: { missile: 'a' } as never })).toThrow(
      /weaponEdit\.double/,
    );
    expect(base.autoPowerUpOrder).toBe(DEFAULT_AUTO_POWER_UP_ORDER);
    expect(base.weaponPreset).toBe('type-a');
    // An order of exactly the limit is fine.
    const full = new Array<MeterSlotName>(MAX_AUTO_POWER_UP_ORDER).fill('option');
    expect(withArsenal(base, { autoPowerUpOrder: full }).autoPowerUpOrder).toHaveLength(32);
  });

  it('composes with withDifficulty both ways, a content table`s preset fields included', () => {
    const table: DifficultyTable = {
      ...DEFAULT_DIFFICULTY_TABLE,
      hard: { ...DEFAULT_DIFFICULTY_TABLE.hard, rankBase: 9, continues: 7 },
    };
    const hard = withDifficulty(resolveGameConfig({ seed: 5 }), 'hard', table);
    expect([hard.rankBase, hard.continues]).toEqual([9, 7]);
    // The loadout on top keeps the content table's values (every field is explicit)…
    const armed = withArsenal(hard, { weaponPreset: 'type-d', megaChoice: 'fullBarrier' });
    expect(armed).toMatchObject({
      difficulty: 'hard',
      rankBase: 9,
      continues: 7,
      weaponPreset: 'type-d',
      megaChoice: 'fullBarrier',
    });
    // …and a difficulty change keeps the loadout.
    const easy = withDifficulty(armed, 'easy', table);
    expect(easy).toMatchObject({
      difficulty: 'easy',
      rankBase: DEFAULT_DIFFICULTY_TABLE.easy.rankBase,
      weaponPreset: 'type-d',
      megaChoice: 'fullBarrier',
      weaponEdit: null,
    });
  });
});

describe('core/config arsenal edges (M2-03): arsenalMatches', () => {
  const base = resolveGameConfig({
    weaponPreset: 'type-b',
    weaponEdit: { missile: 'm', double: 'd', laser: 'l' },
    megaChoice: 'speedDown',
    autoPowerUp: true,
    autoPowerUpOrder: ['laser', 'option'],
  });

  it('compares every field the choice sets, the edit and order by value', () => {
    expect(
      arsenalMatches(base, {
        weaponPreset: 'type-b',
        weaponEdit: { missile: 'm', double: 'd', laser: 'l' },
        megaChoice: 'speedDown',
        shieldChoice: 'forceField',
        autoPowerUp: true,
        autoPowerUpOrder: ['laser', 'option'],
      }),
    ).toBe(true);
    expect(arsenalMatches(base, { shieldChoice: 'other' as never })).toBe(false);
    expect(arsenalMatches(base, { autoPowerUp: false })).toBe(false);
    expect(arsenalMatches(base, { weaponEdit: { missile: 'x', double: 'd', laser: 'l' } })).toBe(
      false,
    );
    expect(arsenalMatches(base, { weaponEdit: { missile: 'm', double: 'x', laser: 'l' } })).toBe(
      false,
    );
    expect(arsenalMatches(base, { autoPowerUpOrder: ['option', 'laser'] })).toBe(false);
    expect(arsenalMatches(base, { autoPowerUpOrder: ['laser'] })).toBe(false);
    expect(arsenalMatches(base, { autoPowerUpOrder: [] })).toBe(false);
    // `undefined` fields are not compared.
    expect(
      arsenalMatches(base, {
        weaponPreset: undefined,
        weaponEdit: undefined,
        megaChoice: undefined,
        autoPowerUpOrder: undefined,
      }),
    ).toBe(true);
  });

  it('agrees with withArsenal: a match changes no field, a mismatch does', () => {
    const choices = [
      { weaponPreset: 'type-b' },
      { weaponPreset: 'type-c' },
      { weaponEdit: null },
      { megaChoice: 'speedDown' as const },
      { megaChoice: 'lifeOption' as const },
      { autoPowerUpOrder: ['laser', 'option'] as MeterSlotName[] },
      { autoPowerUpOrder: DEFAULT_GAME_CONFIG.autoPowerUpOrder },
    ];
    for (const choice of choices) {
      const armed = withArsenal(base, choice);
      const same = JSON.stringify(armed) === JSON.stringify(base);
      expect(arsenalMatches(base, choice), JSON.stringify(choice)).toBe(same);
    }
  });
});

describe('core/config arsenal edges (M2-03): replay headers', () => {
  it('a header without the M2-03 keys (an M2-02 replay) decodes to the defaults', () => {
    const json = replayJson(resolveGameConfig({ seed: 8 })) as unknown as {
      header: { formatVersion: number; config: Record<string, unknown> };
    };
    for (const key of ['weaponPreset', 'weaponEdit', 'megaChoice', 'shieldChoice']) {
      expect(key in json.header.config, key).toBe(true);
      delete json.header.config[key];
    }
    expect(json.header.formatVersion).toBe(REPLAY_FORMAT_VERSION);
    const decoded = decodeReplay(json);
    expect(decoded.header.config).toMatchObject({
      seed: 8,
      weaponPreset: 'type-a',
      weaponEdit: null,
      megaChoice: 'megaCrash',
      shieldChoice: 'forceField',
    });
  });

  it('records a `null` Weapon Edit as null and rejects a malformed one', () => {
    const json = replayJson(resolveGameConfig({ weaponPreset: 'type-c' })) as unknown as {
      header: { config: Record<string, unknown> };
    };
    expect(json.header.config.weaponEdit).toBeNull();
    expect(json.header.config.weaponPreset).toBe('type-c');
    json.header.config.weaponEdit = { missile: 'a', double: 'b' };
    expect(() => decodeReplay(json)).toThrow(/weaponEdit\.laser/);
    json.header.config.weaponEdit = null;
    json.header.config.megaChoice = 'bomb';
    expect(() => decodeReplay(json)).toThrow(/megaChoice/);
  });

  it('keeps an encoded Weapon Edit a plain copy (the config`s own object is not shared)', () => {
    const config = resolveGameConfig({ weaponEdit: { missile: 'a', double: 'b', laser: 'c' } });
    const json = encodeReplay({
      header: createReplayHeader(config, { buildId: 'test' }),
      ticks: 0,
      hashInterval: 600,
      inputs: [new Uint32Array(0), new Uint32Array(0)],
      hashes: new Uint32Array(0),
      finalHash: 0,
    });
    expect(json.header.config.weaponEdit).toEqual({ missile: 'a', double: 'b', laser: 'c' });
    const decoded = decodeReplay(JSON.parse(JSON.stringify(json)) as unknown);
    expect(decoded.header.config.weaponEdit).toEqual(config.weaponEdit);
    expect(Object.isFrozen(decoded.header.config.weaponEdit)).toBe(true);
  });
});
