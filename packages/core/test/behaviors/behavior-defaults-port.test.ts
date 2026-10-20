/**
 * R2-02.A1 (2/2): the behaviour and weapon defaults against the frozen v1 fixture
 * (`fixtures/v1-behavior-defaults.json`, made by `docs/v2-run/helpers/w5/defaults.mjs` at
 * `d4de048`). Every world-unit default must equal its v1 value by its unit's rule at the current
 * scale — the identity while `WORLD_SCALE` is 1, the ported value under the kit (green there only
 * once `R2-02.W2`/`W6`/`W7` hold the values as `v1 * WORLD_SCALE` expressions; the screen-anchored
 * ones the kit itself flips, so those are checked only when the world scales). A new world-unit
 * tunable without a fixture row fails the completeness check: the audit cannot be missed by a new
 * value creeping in.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PLAYFIELD_H,
  PLAYFIELD_W,
  TILE_SIZE,
  WORLD_SCALE,
  WORLD_TOP_PAD,
  BEHAVIOR_PARAM_UNITS,
  DEFAULT_BEHAVIOR_DEFS,
  DEFAULT_BOSS_BEHAVIOR_DEFS,
  WEAPON_BEHAVIOR_PARAMS,
  rescaleNumber,
  type NumberUnit,
  type RescaleOptions,
} from '../../src/index.js';

/**
 * The fixture's shape: every row is `"<behaviour|weapon id>.<param>" = [v1 value, unit]`.
 * `behaviorRows` lists only the tunables a port scales (the generator omits the never-scaling
 * units); `weaponRows` lists every weapon tunable with its unit.
 */
interface DefaultsFixture {
  readonly behaviourCount: number;
  readonly counts: Record<string, number>;
  readonly behaviorRows: Record<string, readonly [number, NumberUnit]>;
  readonly weaponRows: Record<string, readonly [number, NumberUnit]>;
}

const FIXTURE: DefaultsFixture = JSON.parse(
  readFileSync(new URL('./fixtures/v1-behavior-defaults.json', import.meta.url), 'utf8'),
) as DefaultsFixture;

/** The live world scale and the geometry its port uses (the kit's: 1.5 / 36, v1 384 × 200). */
const K = WORLD_SCALE;
const PORT_GEOMETRY: RescaleOptions = Object.freeze({
  factor: K,
  topPad: WORLD_TOP_PAD,
  fromWidth: 384,
  fromHeight: 200,
  toWidth: PLAYFIELD_W,
  toHeight: PLAYFIELD_H,
  tileSize: 8,
});
/** The no-port geometry (K = 1): every unit's rule is the identity under it. */
const IDENTITY_GEOMETRY: RescaleOptions = Object.freeze({
  factor: 1,
  topPad: 0,
  fromWidth: PLAYFIELD_W,
  fromHeight: PLAYFIELD_H,
  toWidth: PLAYFIELD_W,
  toHeight: PLAYFIELD_H,
  tileSize: TILE_SIZE,
});

/** The units a port never scales (`docs/v2-run/helpers/w5/defaults.mjs` `UNSCALED`). */
const NEVER_SCALED: readonly string[] = [
  'ticks',
  'angle',
  'count',
  'ratio',
  'score',
  'index',
  'seed',
  'switch',
];

/** The edge-anchored units: plain literals until the port commit flips them (README § kit). */
function isScreenUnit(unit: NumberUnit): boolean {
  return unit === 'screen-x' || unit === 'screen-y';
}

/** The live default of a fixture row: the behaviour/weapon tunable it names. */
function liveValue(key: string, weapon: boolean): number | undefined {
  const dot = key.lastIndexOf('.');
  const id = key.slice(0, dot);
  const param = key.slice(dot + 1);
  if (weapon)
    return (WEAPON_BEHAVIOR_PARAMS as Record<string, Record<string, number>>)[id]?.[param];
  for (const def of [...DEFAULT_BEHAVIOR_DEFS, ...DEFAULT_BOSS_BEHAVIOR_DEFS]) {
    if (def.id === id && param in def.params) return def.params[param];
  }
  return undefined;
}

/** The unit of a live tunable per `BEHAVIOR_PARAM_UNITS` (`??` when the map holds no row). */
function liveUnit(id: string, param: string): string {
  return (BEHAVIOR_PARAM_UNITS as Record<string, Record<string, NumberUnit>>)[id]?.[param] ?? '??';
}

/**
 * The mapping a row must satisfy at the live scale: the identity at K = 1; the unit rule under the
 * kit — except the screen anchors, which are v1 pixels until the kit itself flips them, so they
 * are checked against the port geometry only once the world scales.
 */
function expectedOf(v1: number, unit: NumberUnit): number | undefined {
  if (isScreenUnit(unit)) return K === 1 ? undefined : rescaleNumber(unit, v1, PORT_GEOMETRY);
  if (NEVER_SCALED.includes(unit)) return v1;
  return rescaleNumber(unit, v1, K === 1 ? IDENTITY_GEOMETRY : PORT_GEOMETRY);
}

/** Checks every row of one fixture block. */
function checkRows(rows: Record<string, readonly [number, NumberUnit]>, weapon: boolean): void {
  for (const [key, [v1, unit]] of Object.entries(rows)) {
    it(`${key} = ${v1} [${unit}] maps to the live scale`, () => {
      expect(unit).not.toBe('??');
      const expected = expectedOf(v1, unit);
      if (expected === undefined) return; // a screen anchor at K = 1: still the v1 literal
      expect(liveValue(key, weapon)).toBe(expected);
    });
  }
}

describe('the behaviour defaults against their v1 fixture (R2-02.A1)', () => {
  checkRows(FIXTURE.behaviorRows, false);
});

describe('the weapon defaults against their v1 fixture (R2-02.A1)', () => {
  checkRows(FIXTURE.weaponRows, true);
});

describe('every tunable of BEHAVIOR_PARAM_UNITS has a fixture row (R2-02.A1)', () => {
  const weaponIds = new Set(Object.keys(WEAPON_BEHAVIOR_PARAMS));
  const behaviorIds = new Map<string, Record<string, unknown>>();
  for (const def of [...DEFAULT_BEHAVIOR_DEFS, ...DEFAULT_BOSS_BEHAVIOR_DEFS]) {
    behaviorIds.set(def.id, def.params);
  }
  for (const [id, params] of Object.entries(BEHAVIOR_PARAM_UNITS)) {
    for (const param of Object.keys(params)) {
      const key = `${id}.${param}`;
      if (weaponIds.has(id)) {
        it(`weapon tunable ${key} has a row`, () => {
          expect(FIXTURE.weaponRows[key]).toBeDefined();
        });
        continue;
      }
      if (!behaviorIds.has(id)) continue; // a units-map row with no default to compare
      const unit = liveUnit(id, param);
      if (NEVER_SCALED.includes(unit)) continue; // the generator omits these by design
      it(`behaviour tunable ${key} [${unit}] has a row`, () => {
        expect(FIXTURE.behaviorRows[key]).toBeDefined();
      });
    }
  }

  it('holds no stale rows: every fixture key names a live tunable', () => {
    for (const key of Object.keys(FIXTURE.behaviorRows)) {
      expect(liveValue(key, false), key).toBeDefined();
    }
    for (const key of Object.keys(FIXTURE.weaponRows)) {
      expect(liveValue(key, true), key).toBeDefined();
    }
  });

  it('carries the v1 behaviour count of the generating run', () => {
    expect([...DEFAULT_BEHAVIOR_DEFS, ...DEFAULT_BOSS_BEHAVIOR_DEFS].length).toBe(
      FIXTURE.behaviourCount,
    );
  });
});
