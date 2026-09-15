/**
 * Edge cases of the controls and game options in `core/config` (plan M2-16 — "every option reaches
 * its consumer"): `resolveUserOptions` reading every new field at its limits (autofire rate 1–60,
 * debounce 0–10 with `-0`, lives 1–5, the enums, the booleans, the one-button flag only for
 * `true`), `resolveBindingOverrides` (unknown and duplicate tokens, empty lists kept as unbound,
 * id limits, the profile cap applied after sorting, prototype keys, frozen results, idempotence),
 * `userGameOverrides` (only what is set; the one-button preset over the rest) and
 * `withUserGameOptions` (the same object when nothing changes, every other field kept, the result
 * validated) and `resolveGameConfig` refusing an unknown autofire mode.
 */
import { describe, expect, it } from 'vitest';
import {
  AUTOFIRE_INTERVALS,
  AUTOFIRE_MODES,
  DEATH_PENALTY_PRESETS,
  DEFAULT_USER_GAME_OPTIONS,
  DEFAULT_USER_OPTIONS,
  DIFFICULTY_PRESETS,
  MAX_ACTION_TOKENS,
  MAX_BINDING_PROFILES,
  MAX_DEBOUNCE_OPTION,
  SOCD_CHOICES,
  resolveBindingOverrides,
  resolveGameConfig,
  resolveUserOptions,
  userGameOverrides,
  withUserGameOptions,
} from '../../src/config/index.js';

describe('core/config controls and game options (edge): constants', () => {
  it('lists the choices the pages offer, frozen', () => {
    expect(SOCD_CHOICES).toEqual(['neutral', 'lastWins']);
    expect(MAX_DEBOUNCE_OPTION).toBe(10);
    expect(MAX_ACTION_TOKENS).toBe(4);
    expect(MAX_BINDING_PROFILES).toBe(16);
    for (const list of [AUTOFIRE_MODES, AUTOFIRE_INTERVALS, SOCD_CHOICES]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
    // The rates run slowest first, every one a valid config interval.
    for (let i = 1; i < AUTOFIRE_INTERVALS.length; i++) {
      expect(AUTOFIRE_INTERVALS[i]).toBeLessThan(AUTOFIRE_INTERVALS[i - 1]);
    }
    for (const interval of AUTOFIRE_INTERVALS) {
      expect(resolveGameConfig({ autofireInterval: interval }).autofireInterval).toBe(interval);
    }
  });

  it('defaults to options that change nothing', () => {
    expect(DEFAULT_USER_GAME_OPTIONS).toEqual({
      difficulty: null,
      lives: null,
      deathPenalty: null,
      autoPowerUp: null,
      pickupMagnet: null,
      oneButton: false,
    });
    expect(DEFAULT_USER_OPTIONS.game).toBe(DEFAULT_USER_GAME_OPTIONS);
    expect(DEFAULT_USER_OPTIONS.input).toEqual({
      profileId: null,
      autofire: null,
      autofireInterval: null,
      socd: null,
      releaseDebounce: null,
      bindings: {},
    });
    expect(Object.isFrozen(DEFAULT_USER_OPTIONS.input.bindings)).toBe(true);
    expect(resolveGameConfig().autofireMode).toBe('always');
  });
});

describe('core/config resolveUserOptions (edge): controls and game fields', () => {
  it('reads the autofire rate as a whole number of ticks 1–60', () => {
    const rate = (value: unknown): number | null =>
      resolveUserOptions({ input: { autofireInterval: value } }).input.autofireInterval;
    expect([rate(1), rate(60), rate(4)]).toEqual([1, 60, 4]);
    for (const bad of [0, 61, 2.5, -3, '4', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rate(bad), String(bad)).toBeNull();
    }
  });

  it('reads the release debounce 0–10, turning -0 into 0', () => {
    const debounce = (value: unknown): number | null =>
      resolveUserOptions({ input: { releaseDebounce: value } }).input.releaseDebounce;
    expect([debounce(0), debounce(10), debounce(3)]).toEqual([0, 10, 3]);
    expect(Object.is(debounce(-0), 0)).toBe(true);
    for (const bad of [11, -1, 0.5, '2', true]) expect(debounce(bad), String(bad)).toBeNull();
  });

  it('reads the lives 1–5', () => {
    const lives = (value: unknown): number | null =>
      resolveUserOptions({ game: { lives: value } }).game.lives;
    expect([1, 2, 3, 4, 5].map(lives)).toEqual([1, 2, 3, 4, 5]);
    for (const bad of [0, 6, 2.5, '3', -1]) expect(lives(bad), String(bad)).toBeNull();
  });

  it('reads every enum only from its own list', () => {
    for (const mode of AUTOFIRE_MODES) {
      expect(resolveUserOptions({ input: { autofire: mode } }).input.autofire).toBe(mode);
    }
    for (const socd of SOCD_CHOICES) {
      expect(resolveUserOptions({ input: { socd } }).input.socd).toBe(socd);
    }
    for (const difficulty of DIFFICULTY_PRESETS) {
      expect(resolveUserOptions({ game: { difficulty } }).game.difficulty).toBe(difficulty);
    }
    for (const deathPenalty of DEATH_PENALTY_PRESETS) {
      expect(resolveUserOptions({ game: { deathPenalty } }).game.deathPenalty).toBe(deathPenalty);
    }
    const bad = resolveUserOptions({
      input: { autofire: 'ALWAYS', socd: 'combine' },
      game: { difficulty: 'Normal', deathPenalty: 1 },
    });
    expect([
      bad.input.autofire,
      bad.input.socd,
      bad.game.difficulty,
      bad.game.deathPenalty,
    ]).toEqual([null, null, null, null]);
    // `firstWins` is an input-web policy, not a choice the Options screen offers.
    expect(resolveUserOptions({ input: { socd: 'firstWins' } }).input.socd).toBeNull();
  });

  it('reads the toggles as booleans (else unset) and the one-button preset only as true', () => {
    const on = resolveUserOptions({
      game: { autoPowerUp: false, pickupMagnet: true, oneButton: true },
    });
    expect([on.game.autoPowerUp, on.game.pickupMagnet, on.game.oneButton]).toEqual([
      false,
      true,
      true,
    ]);
    for (const value of [1, 'true', null, {}]) {
      const read = resolveUserOptions({
        game: { autoPowerUp: value, pickupMagnet: value, oneButton: value },
      });
      expect([read.game.autoPowerUp, read.game.pickupMagnet, read.game.oneButton]).toEqual([
        null,
        null,
        false,
      ]);
    }
  });

  it('reads a game group that is not a plain object as unset, and freezes the groups', () => {
    for (const game of [null, [], 'x', 5]) {
      expect(resolveUserOptions({ game }).game).toEqual(DEFAULT_USER_GAME_OPTIONS);
    }
    const read = resolveUserOptions({ game: { lives: 2 }, input: { socd: 'neutral' } });
    expect(Object.isFrozen(read.game)).toBe(true);
    expect(Object.isFrozen(read.input)).toBe(true);
    expect(Object.isFrozen(read.input.bindings)).toBe(true);
    // Idempotent over its own output.
    expect(resolveUserOptions(read)).toEqual(read);
  });
});

describe('core/config resolveBindingOverrides (edge)', () => {
  it('drops unknown and duplicate tokens but keeps an emptied action as unbound', () => {
    const read = resolveBindingOverrides({
      'keyboard-default': {
        game: {
          Shot: ['code:KeyJ', 7, 'code:KeyJ', 'code:Key J', 'button:2', null],
          Sub: ['nonsense'],
          Pause: [],
          Speed: 'code:KeyK',
        },
      },
    });
    expect(read['keyboard-default']?.game).toEqual({
      Shot: ['code:KeyJ', 'button:2'],
      Sub: [],
      Pause: [],
    });
    // The key order follows the action names, whatever the save's order.
    const ordered = resolveBindingOverrides({
      p: { menu: { Back: ['key:8'], Up: ['key:38'], Confirm: ['key:13'] } },
    });
    expect(Object.keys(ordered.p?.menu ?? {})).toEqual(['Up', 'Confirm', 'Back']);
  });

  it('counts the cap after dropping duplicates (a fifth distinct token is dropped)', () => {
    const read = resolveBindingOverrides({
      p: {
        game: {
          Shot: ['code:KeyA', 'code:KeyA', 'code:KeyB', 'code:KeyC', 'code:KeyD', 'code:KeyE'],
        },
      },
    });
    expect(read.p?.game?.Shot).toEqual(['code:KeyA', 'code:KeyB', 'code:KeyC', 'code:KeyD']);
  });

  it('keeps ids of up to 64 lower-case kebab characters', () => {
    const long = 'a'.repeat(64);
    const read = resolveBindingOverrides({
      [long]: { game: { Shot: ['code:KeyJ'] } },
      ['b'.repeat(65)]: { game: { Shot: ['code:KeyJ'] } },
      'Upper-Case': { game: { Shot: ['code:KeyJ'] } },
      '-lead': { game: { Shot: ['code:KeyJ'] } },
      'trail-': { game: { Shot: ['code:KeyJ'] } },
      'dou--ble': { game: { Shot: ['code:KeyJ'] } },
    });
    expect(Object.keys(read)).toEqual([long]);
  });

  it('caps the profiles after sorting their ids, skipping unusable ones without counting them', () => {
    const many: Record<string, unknown> = {};
    for (let i = MAX_BINDING_PROFILES + 3; i >= 0; i--) {
      many[`p${String(i).padStart(2, '0')}`] = { game: { Shot: ['code:KeyJ'] } };
    }
    // Unusable entries sort first but take no place.
    many.a0 = 'nope';
    many.a1 = { game: {} };
    many.a2 = { game: 'x', menu: [] };
    const read = resolveBindingOverrides(many);
    const ids = Object.keys(read);
    expect(ids).toHaveLength(MAX_BINDING_PROFILES);
    expect(ids[0]).toBe('p00');
    expect(ids[ids.length - 1]).toBe(`p${String(MAX_BINDING_PROFILES - 1).padStart(2, '0')}`);
  });

  it('keeps a profile with one usable context and drops the other', () => {
    const read = resolveBindingOverrides({
      p: { game: { Bogus: ['code:KeyJ'] }, menu: { Confirm: ['code:KeyJ'] }, extra: {} },
    });
    expect(read).toEqual({ p: { menu: { Confirm: ['code:KeyJ'] } } });
    expect(Object.keys(read.p ?? {})).toEqual(['menu']);
  });

  it('never reads inherited or prototype keys', () => {
    const parsed = JSON.parse(
      '{"__proto__":{"game":{"Shot":["code:KeyJ"]}},"p":{"game":{"__proto__":["code:KeyJ"],"Shot":["code:KeyK"]}}}',
    ) as unknown;
    const read = resolveBindingOverrides(parsed);
    expect(Object.keys(read)).toEqual(['p']);
    expect(read.p?.game).toEqual({ Shot: ['code:KeyK'] });
    const inherited = Object.create({ p: { game: { Shot: ['code:KeyJ'] } } }) as unknown;
    expect(resolveBindingOverrides(inherited)).toEqual({});
  });

  it('returns frozen, idempotent results, and an empty object for anything unusable', () => {
    const read = resolveBindingOverrides({ p: { game: { Shot: ['code:KeyJ'] } } });
    expect(Object.isFrozen(read)).toBe(true);
    expect(Object.isFrozen(read.p)).toBe(true);
    expect(Object.isFrozen(read.p?.game)).toBe(true);
    expect(Object.isFrozen(read.p?.game?.Shot)).toBe(true);
    expect(resolveBindingOverrides(read)).toEqual(read);
    for (const bad of [null, undefined, 3, 'x', [], [{ game: {} }]]) {
      const empty = resolveBindingOverrides(bad);
      expect(empty).toEqual({});
      expect(Object.isFrozen(empty)).toBe(true);
    }
  });
});

describe('core/config userGameOverrides / withUserGameOptions (edge)', () => {
  it('sets one field per option set, nothing for the difficulty', () => {
    const one = (game: Record<string, unknown>, input: Record<string, unknown> = {}) =>
      userGameOverrides(resolveUserOptions({ game, input }));
    expect(one({ lives: 2 })).toEqual({ startingLives: 2 });
    expect(one({ deathPenalty: 'arcade' })).toEqual({ deathPenalty: 'arcade' });
    expect(one({ autoPowerUp: false })).toEqual({ autoPowerUp: false });
    expect(one({ pickupMagnet: false })).toEqual({ pickupMagnet: false });
    expect(one({}, { autofire: 'toggle' })).toEqual({ autofireMode: 'toggle' });
    expect(one({}, { autofireInterval: 2 })).toEqual({ autofireInterval: 2 });
    // The difficulty is the difficulty menu's (the flow chooses it), never a config override.
    expect(one({ difficulty: 'hard' })).toEqual({});
    // Presentation-side input options set nothing either.
    expect(one({}, { socd: 'lastWins', releaseDebounce: 3, profileId: 'x' })).toEqual({});
  });

  it('the one-button preset keeps the lives, the magnet and the rate', () => {
    const overrides = userGameOverrides(
      resolveUserOptions({
        input: { autofireInterval: 8, autofire: 'hold' },
        game: { oneButton: true, lives: 5, pickupMagnet: false },
      }),
    );
    expect(overrides).toEqual({
      startingLives: 5,
      pickupMagnet: false,
      autofireMode: 'always',
      autofireInterval: 8,
      autofire: true,
      autoPowerUp: true,
      deathPenalty: 'casual',
    });
  });

  it('returns a fresh object every call', () => {
    const options = resolveUserOptions({ game: { lives: 2 } });
    const a = userGameOverrides(options);
    const b = userGameOverrides(options);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('changes only the set fields of a resolved config, keeping the loadout, ship and co-op', () => {
    const config = resolveGameConfig({
      difficulty: 'hard',
      loadout: 'full',
      coop: true,
      seed: 77,
      remoteMode: false,
    });
    const out = withUserGameOptions(
      config,
      resolveUserOptions({ game: { lives: 1 }, input: { autofire: 'hold' } }),
    );
    expect(out).not.toBe(config);
    for (const key of Object.keys(config) as Array<keyof typeof config>) {
      if (key === 'startingLives' || key === 'autofireMode') continue;
      expect(out[key], key).toEqual(config[key]);
    }
    expect([out.startingLives, out.autofireMode]).toEqual([1, 'hold']);
    // Applying the same options again changes nothing: the same object.
    expect(
      withUserGameOptions(
        out,
        resolveUserOptions({ game: { lives: 1 }, input: { autofire: 'hold' } }),
      ),
    ).toBe(out);
  });

  it('a one-button preset over a config already matching it is the same object', () => {
    const config = resolveGameConfig({ autoPowerUp: true, deathPenalty: 'casual' });
    const options = resolveUserOptions({ game: { oneButton: true } });
    expect(withUserGameOptions(config, options)).toBe(config);
    // Over a hold-to-fire config it turns autofire back on.
    const hold = resolveGameConfig({ autofire: false, autoPowerUp: true, deathPenalty: 'casual' });
    expect(withUserGameOptions(hold, options).autofire).toBe(true);
  });

  it('validates the result: an out-of-range option that slipped past the reader throws', () => {
    const bad = {
      ...DEFAULT_USER_OPTIONS,
      input: { ...DEFAULT_USER_OPTIONS.input, autofireInterval: 0 },
    };
    expect(() => withUserGameOptions(resolveGameConfig(), bad)).toThrow(RangeError);
    const mode = {
      ...DEFAULT_USER_OPTIONS,
      input: { ...DEFAULT_USER_OPTIONS.input, autofire: 'sometimes' as never },
    };
    expect(() => withUserGameOptions(resolveGameConfig(), mode)).toThrow(/autofireMode/);
  });

  it('resolveGameConfig refuses an unknown autofire mode and keeps a known one', () => {
    for (const mode of AUTOFIRE_MODES) {
      expect(resolveGameConfig({ autofireMode: mode }).autofireMode).toBe(mode);
    }
    for (const bad of ['', 'ALWAYS', null, 1]) {
      expect(() => resolveGameConfig({ autofireMode: bad as never }), String(bad)).toThrow(
        RangeError,
      );
    }
  });
});
