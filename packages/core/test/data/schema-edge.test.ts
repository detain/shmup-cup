/**
 * Edge cases and error paths of the `data/schema` combinators: inclusive bounds, message
 * wording, path building through nested combinators, reference-site recording, the
 * "never throws on bad data" contract (a seeded fuzz), type inference, and regressions for
 * the bugs the M1-02 test pass fixed (`__proto__` record keys, `g`-flag patterns,
 * `s.record(s.ref())`, absent optional references).
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createRng, type Rng } from '../../src/rng/index.js';
import { s, type Infer, type RefSite, type ValidationIssue } from '../../src/data/schema.js';

/** Fresh issue collector. */
const collector = (): ValidationIssue[] => [];

describe('core/data schema — numbers', () => {
  it('treats both integer bounds as inclusive', () => {
    const issues = collector();
    const hp = s.int({ min: 1, max: 5 });
    expect(hp.parse(1, 'hp', issues)).toBe(1);
    expect(hp.parse(5, 'hp', issues)).toBe(5);
    expect(s.int({ min: 3, max: 3 }).parse(3, 'x', issues)).toBe(3);
    expect(issues).toEqual([]);
  });

  it.each([
    [Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY],
    [Number.NaN],
    [true],
    [null],
    [undefined],
    [[1]],
    [{ value: 1 }],
    ['1'],
  ])('rejects the non-integer %o', (value) => {
    const issues = collector();
    expect(s.int().parse(value, 'n', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'n', message: 'must be an integer' }]);
  });

  it('accepts negative integers, -0 and integral floats such as 2.0', () => {
    const issues = collector();
    expect(s.int().parse(-7, 'n', issues)).toBe(-7);
    expect(Object.is(s.int().parse(-0, 'n', issues), -0)).toBe(true);
    expect(s.int().parse(2.0, 'n', issues)).toBe(2);
    expect(s.int().parse(Number.MAX_SAFE_INTEGER, 'n', issues)).toBe(Number.MAX_SAFE_INTEGER);
    expect(issues).toEqual([]);
  });

  it('treats both number bounds as inclusive and words every bound form', () => {
    const issues = collector();
    expect(s.num({ min: 0, max: 1 }).parse(0, 'a', issues)).toBe(0);
    expect(s.num({ min: 0, max: 1 }).parse(1, 'a', issues)).toBe(1);
    expect(issues).toEqual([]);
    s.num({ min: 0, max: 1 }).parse(1.0001, 'b', issues);
    s.num({ max: 16 }).parse(17, 'c', issues);
    s.num().parse(Number.NaN, 'd', issues);
    s.num().parse(Number.NEGATIVE_INFINITY, 'e', issues);
    s.num().parse('2', 'f', issues);
    expect(issues).toEqual([
      { path: 'b', message: 'must be a finite number in 0..1' },
      { path: 'c', message: 'must be a finite number <= 16' },
      { path: 'd', message: 'must be a finite number' },
      { path: 'e', message: 'must be a finite number' },
      { path: 'f', message: 'must be a finite number' },
    ]);
  });

  it('accepts fractional and negative numbers when unbounded', () => {
    const issues = collector();
    expect(s.num().parse(-64.25, 'y', issues)).toBe(-64.25);
    expect(s.num().parse(Number.MIN_VALUE, 'y', issues)).toBe(Number.MIN_VALUE);
    expect(issues).toEqual([]);
  });
});

describe('core/data schema — strings, booleans and enums', () => {
  it('words the length bounds', () => {
    const issues = collector();
    s.str({ minLength: 0 }).parse(3, 'a', issues);
    s.str({ minLength: 2, maxLength: 4 }).parse('x', 'b', issues);
    s.str({ minLength: 2, maxLength: 4 }).parse('xxxxx', 'c', issues);
    s.str({ maxLength: 1 }).parse('', 'd', issues);
    expect(issues).toEqual([
      { path: 'a', message: 'must be a string of length >= 0' },
      { path: 'b', message: 'must be a string of length in 2..4' },
      { path: 'c', message: 'must be a string of length in 2..4' },
      { path: 'd', message: 'must be a string of length in 1..1' },
    ]);
  });

  it('accepts strings exactly at the length bounds', () => {
    const issues = collector();
    const code = s.str({ minLength: 2, maxLength: 4 });
    expect(code.parse('ab', 'id', issues)).toBe('ab');
    expect(code.parse('abcd', 'id', issues)).toBe('abcd');
    expect(issues).toEqual([]);
  });

  it('combines the length wording with the pattern', () => {
    const issues = collector();
    expect(s.str({ pattern: /^[a-z]+$/ }).parse('', 'id', issues)).toBeUndefined();
    expect(issues).toEqual([
      { path: 'id', message: 'must be a non-empty string matching /^[a-z]+$/' },
    ]);
  });

  it('gives the same answer on every call for a pattern with the g flag (regression)', () => {
    const issues = collector();
    const id = s.str({ pattern: /^[a-z]+$/g });
    // RegExp.test with /g is stateful (lastIndex); a validator must not depend on history.
    expect(id.parse('abc', 'a', issues)).toBe('abc');
    expect(id.parse('abc', 'b', issues)).toBe('abc');
    expect(id.parse('xyz', 'c', issues)).toBe('xyz');
    expect(issues).toEqual([]);
  });

  it('rejects non-booleans that are merely truthy or falsy', () => {
    const issues = collector();
    expect(s.bool().parse(true, 'p', issues)).toBe(true);
    for (const value of ['true', 1, null, undefined, [], {}]) s.bool().parse(value, 'p', issues);
    expect(issues).toHaveLength(6);
    expect(issues.every((issue) => issue.message === 'must be a boolean')).toBe(true);
  });

  it('matches enum values exactly (case-sensitive, strings only, no prototype names)', () => {
    const issues = collector();
    const slot = s.enumOf(['main', 'sub'] as const);
    for (const value of ['Main', 'main ', 0, null, 'toString', 'constructor']) {
      expect(slot.parse(value, 'slot', issues)).toBeUndefined();
    }
    expect(issues).toHaveLength(6);
    expect(slot.typeName).toBe('enum');
  });

  it('rejects everything when the enum is empty', () => {
    const issues = collector();
    expect(s.enumOf([]).parse('', 'x', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'x', message: 'must be one of: ' }]);
  });
});

describe('core/data schema — arrays', () => {
  it('accepts an empty array when no minimum is set and returns a new array', () => {
    const issues = collector();
    const input: number[] = [];
    const parsed = s.array(s.int()).parse(input, 'a', issues);
    expect(parsed).toEqual([]);
    expect(parsed).not.toBe(input);
    expect(issues).toEqual([]);
  });

  it('treats the length bounds as inclusive', () => {
    const issues = collector();
    const pair = s.array(s.int(), { min: 2, max: 2 });
    expect(pair.parse([1, 2], 'a', issues)).toEqual([1, 2]);
    expect(issues).toEqual([]);
  });

  it('does not validate the items when the length is already wrong', () => {
    const issues = collector();
    expect(s.array(s.int(), { min: 3 }).parse(['x', 'y'], 'a', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'a', message: 'must have at least 3 items' }]);
  });

  it('builds paths through nested arrays and objects', () => {
    const issues = collector();
    const grid = s.array(s.array(s.object({ v: s.int({ min: 0 }) })));
    expect(grid.parse([[{ v: 1 }], [{ v: 2 }, { v: -1 }]], 'rows', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'rows[1][1].v', message: 'must be an integer >= 0' }]);
  });

  it('starts paths at the index when the array is the document root', () => {
    const issues = collector();
    s.array(s.int()).parse([1, 'x'], '', issues);
    expect(issues).toEqual([{ path: '[1]', message: 'must be an integer' }]);
  });

  it.each([[{ length: 1, 0: 1 }], ['abc'], [null], [7]])('rejects the non-array %o', (value) => {
    const issues = collector();
    expect(s.array(s.int()).parse(value, 'a', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'a', message: 'must be an array' }]);
  });

  it('refuses bare nullable references too', () => {
    expect(() => s.array(s.nullable(s.ref('sprite')))).toThrow(/wrap the reference/);
  });

  it('collects reference sites of objects inside arrays with indexed paths', () => {
    const issues = collector();
    const refs: RefSite[] = [];
    const list = s.array(s.object({ sprite: s.ref('sprite') }));
    const parsed = list.parse([{ sprite: 'a' }, { sprite: 'b' }], 'ships', issues, refs);
    expect(refs.map((site) => [site.path, site.id])).toEqual([
      ['ships[0].sprite', 'a'],
      ['ships[1].sprite', 'b'],
    ]);
    expect(refs[1]?.container).toBe(parsed?.[1]);
  });
});

describe('core/data schema — objects', () => {
  const box = s.object({ hw: s.int({ min: 1 }), hh: s.int({ min: 1 }) });

  it('returns a copy and never mutates its input', () => {
    const issues = collector();
    const input = { hw: 2, hh: 3 };
    const parsed = box.parse(input, 'b', issues);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(input).toEqual({ hw: 2, hh: 3 });
  });

  it('reports every missing and bad field, then unknown fields, in shape order', () => {
    const issues = collector();
    const spec = s.object({ a: s.int(), b: s.str(), c: s.bool() });
    expect(spec.parse({ z: 1, c: 'no', y: 2 }, 'o', issues)).toBeUndefined();
    expect(issues).toEqual([
      { path: 'o.a', message: 'is required' },
      { path: 'o.b', message: 'is required' },
      { path: 'o.c', message: 'must be a boolean' },
      { path: 'o.z', message: 'unknown field' },
      { path: 'o.y', message: 'unknown field' },
    ]);
  });

  it('treats an explicit undefined like a missing field', () => {
    const issues = collector();
    const spec = s.object({ a: s.int(), b: s.int() }, { optional: ['b'] });
    expect(spec.parse({ a: 1, b: undefined }, '', issues)).toEqual({ a: 1 });
    expect(spec.parse({ a: undefined }, '', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'a', message: 'is required' }]);
  });

  it('still validates optional fields that are present', () => {
    const issues = collector();
    const spec = s.object({ a: s.int({ min: 1 }) }, { optional: ['a'] });
    expect(spec.parse({ a: 0 }, 'o', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'o.a', message: 'must be an integer >= 1' }]);
  });

  it('accepts null as a value only through s.nullable', () => {
    const issues = collector();
    const spec = s.object({ drop: s.str() });
    expect(spec.parse({ drop: null }, 'e', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'e.drop', message: 'must be a non-empty string' }]);
  });

  it('does not see inherited properties', () => {
    const issues = collector();
    const inherited = Object.create({ hw: 1, hh: 1 }) as object;
    expect(box.parse(inherited, 'b', issues)).toBeUndefined();
    expect(issues.map((issue) => issue.message)).toEqual(['is required', 'is required']);
  });

  it('reports a JSON "__proto__" key as an unknown field', () => {
    const issues = collector();
    const input = JSON.parse('{"hw":1,"hh":1,"__proto__":{"hw":9}}') as unknown;
    expect(box.parse(input, 'b', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'b.__proto__', message: 'unknown field' }]);
  });

  it('accepts only {} for an empty shape', () => {
    const issues = collector();
    expect(s.object({}).parse({}, '', issues)).toEqual({});
    expect(s.object({}).parse({ a: 1 }, '', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'a', message: 'unknown field' }]);
  });

  it('keeps nested unknown-field paths', () => {
    const issues = collector();
    const outer = s.object({ box });
    outer.parse({ box: { hw: 1, hh: 1, depth: 2 } }, 'enemies[0]', issues);
    expect(issues).toEqual([{ path: 'enemies[0].box.depth', message: 'unknown field' }]);
  });
});

describe('core/data schema — reference sites', () => {
  it('records an absent optional reference with a null id (regression)', () => {
    const issues = collector();
    const refs: RefSite[] = [];
    const spec = s.object(
      { sfx: s.nullable(s.ref('sfx')), main: s.ref('weapon') },
      { optional: ['sfx', 'main'] },
    );
    const parsed = spec.parse({}, 'weapons[2]', issues, refs);
    expect(parsed).toEqual({});
    expect(issues).toEqual([]);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ path: 'weapons[2].sfx', kind: 'sfx', id: null, field: 'sfx' });
    expect(refs[1]).toMatchObject({ path: 'weapons[2].main', kind: 'weapon', id: null });
    expect(refs[0]?.container).toBe(parsed);
  });

  it('records no site for a missing required reference or an invalid one', () => {
    const issues = collector();
    const refs: RefSite[] = [];
    const spec = s.object({ a: s.ref('enemy'), b: s.ref('enemy') });
    expect(spec.parse({ b: '' }, 'e', issues, refs)).toBeUndefined();
    expect(refs).toEqual([]);
    expect(issues).toEqual([
      { path: 'e.a', message: 'is required' },
      { path: 'e.b', message: 'must be a non-empty enemy id' },
    ]);
  });

  it('records no site for an absent optional reference when no collector is passed', () => {
    const issues = collector();
    const spec = s.object({ a: s.ref('enemy') }, { optional: ['a'] });
    expect(spec.parse({}, '', issues)).toEqual({});
    expect(issues).toEqual([]);
  });

  it('records sites in document order through objects, records and unions', () => {
    const issues = collector();
    const refs: RefSite[] = [];
    const layer = s.object({ sprite: s.ref('sprite') });
    const spec = s.object({
      head: s.ref('sprite'),
      layers: s.record(layer),
      events: s.array(
        s.oneOf('type', {
          boss: s.object({ type: s.enumOf(['boss'] as const), enemy: s.ref('enemy') }),
          music: s.object({ type: s.enumOf(['music'] as const), cue: s.ref('music') }),
        }),
      ),
    });
    spec.parse(
      {
        head: 'h',
        layers: { far: { sprite: 'f' }, near: { sprite: 'n' } },
        events: [
          { type: 'music', cue: 'Stage' },
          { type: 'boss', enemy: 'warden' },
        ],
      },
      '',
      issues,
      refs,
    );
    expect(issues).toEqual([]);
    expect(refs.map((site) => site.path + '=' + String(site.id))).toEqual([
      'head=h',
      'layers.far.sprite=f',
      'layers.near.sprite=n',
      'events[0].cue=Stage',
      'events[1].enemy=warden',
    ]);
  });

  it('describes a reference schema', () => {
    expect(s.ref('stage').typeName).toBe('stage ref');
    expect(s.nullable(s.ref('stage')).typeName).toBe('stage ref or null');
    expect(s.ref('stage').parse('', 'x', collector())).toBeUndefined();
  });
});

describe('core/data schema — records', () => {
  it('accepts an empty map and returns a copy', () => {
    const issues = collector();
    const input = { a: 1 };
    expect(s.record(s.num()).parse({}, 'p', issues)).toEqual({});
    const parsed = s.record(s.num()).parse(input, 'p', issues);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(issues).toEqual([]);
  });

  it('rejects a "__proto__" key instead of dropping it or swapping the prototype (regression)', () => {
    const issues = collector();
    const table = s.record(s.object({ x: s.num() }));
    const input = JSON.parse('{"__proto__":{"x":1},"ok":{"x":2}}') as unknown;
    expect(table.parse(input, 'params', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'params.__proto__', message: 'is not a valid key' }]);

    const numbers = collector();
    expect(s.record(s.num()).parse(JSON.parse('{"__proto__":1}'), 'p', numbers)).toBeUndefined();
    expect(numbers).toHaveLength(1);
  });

  it('words an invalid key without a pattern (regression: no "must match undefined")', () => {
    const issues = collector();
    expect(s.record(s.num()).parse({ '': 1 }, 'p', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'p.', message: 'is not a valid key' }]);
  });

  it('names the key pattern when one is given', () => {
    const issues = collector();
    s.record(s.num(), /^[a-z]+$/).parse({ Speed: 1 }, 'params', issues);
    expect(issues).toEqual([
      { path: 'params.Speed', message: 'is not a valid key (must match /^[a-z]+$/)' },
    ]);
  });

  it('gives the same answer on every call for a key pattern with the g flag (regression)', () => {
    const issues = collector();
    const params = s.record(s.num(), /^[a-z]+$/g);
    expect(params.parse({ speed: 1 }, 'p', issues)).toEqual({ speed: 1 });
    expect(params.parse({ speed: 1 }, 'p', issues)).toEqual({ speed: 1 });
    expect(issues).toEqual([]);
  });

  it('reports bad keys and bad values of the same map together', () => {
    const issues = collector();
    s.record(s.int(), /^[a-z]+$/).parse({ A: 1, b: 'x', c: 3 }, 'm', issues);
    expect(issues).toEqual([
      { path: 'm.A', message: 'is not a valid key (must match /^[a-z]+$/)' },
      { path: 'm.b', message: 'must be an integer' },
    ]);
  });

  it('refuses a map of bare references, like s.array (regression)', () => {
    expect(() => s.record(s.ref('sprite'))).toThrow(TypeError);
    expect(() => s.record(s.nullable(s.ref('sprite')))).toThrow(/wrap the reference/);
  });

  it.each([[[]], [null], ['x']])('rejects the non-object %o', (value) => {
    const issues = collector();
    expect(s.record(s.num()).parse(value, 'p', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'p', message: 'must be an object' }]);
  });
});

describe('core/data schema — nullable and unions', () => {
  it('rejects undefined through the inner schema', () => {
    const issues = collector();
    expect(s.nullable(s.int()).parse(undefined, 'x', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'x', message: 'must be an integer' }]);
  });

  it('nests without changing the result', () => {
    const issues = collector();
    const twice = s.nullable(s.nullable(s.int()));
    expect(twice.parse(null, 'x', issues)).toBeNull();
    expect(twice.parse(4, 'x', issues)).toBe(4);
    expect(twice.typeName).toBe('integer or null or null');
    expect(s.nullable(s.int()).refKind).toBeNull();
  });

  const event = s.oneOf('type', {
    spawn: s.object({ type: s.enumOf(['spawn'] as const), x: s.num({ min: 0 }) }),
    bare: s.object({ x: s.num() }),
  });

  it('reports the variant issues at the event path', () => {
    const issues = collector();
    expect(event.parse({ type: 'spawn', x: -1, extra: 1 }, 'events[4]', issues)).toBeUndefined();
    expect(issues).toEqual([
      { path: 'events[4].x', message: 'must be a finite number >= 0' },
      { path: 'events[4].extra', message: 'unknown field' },
    ]);
  });

  it('reports the tag as an unknown field when the variant does not declare it', () => {
    const issues = collector();
    expect(event.parse({ type: 'bare', x: 1 }, 'e', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'e.type', message: 'unknown field' }]);
  });

  it.each([[7], [null], ['toString'], ['__proto__'], ['constructor']])(
    'rejects the tag value %o',
    (tag) => {
      const issues = collector();
      expect(event.parse({ type: tag }, 'e', issues)).toBeUndefined();
      expect(issues).toEqual([{ path: 'e.type', message: 'type must be one of: spawn, bare' }]);
    },
  );

  it('rejects arrays before looking at the tag', () => {
    const issues = collector();
    expect(event.parse([{ type: 'spawn' }], 'e', issues)).toBeUndefined();
    expect(issues).toEqual([{ path: 'e', message: 'must be an object' }]);
    expect(event.typeName).toBe('union');
    expect(event.refKind).toBeNull();
  });
});

describe('core/data schema — contracts', () => {
  it('freezes the combinator namespace and every schema', () => {
    expect(Object.isFrozen(s)).toBe(true);
    for (const schema of [
      s.int(),
      s.num(),
      s.str(),
      s.bool(),
      s.enumOf(['a']),
      s.array(s.int()),
      s.object({}),
      s.record(s.int()),
      s.nullable(s.int()),
      s.ref('sprite'),
      s.oneOf('type', {}),
    ]) {
      expect(Object.isFrozen(schema), schema.typeName).toBe(true);
    }
  });

  it('can be reused: one schema instance keeps no state between parses', () => {
    const spec = s.object({ id: s.str(), n: s.int({ min: 0 }) });
    const first = collector();
    const second = collector();
    expect(spec.parse({ id: 'a', n: -1 }, 'x', first)).toBeUndefined();
    expect(spec.parse({ id: 'a', n: 1 }, 'x', second)).toEqual({ id: 'a', n: 1 });
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  /** A random JSON-ish value (plus `undefined`), up to `depth` levels deep. */
  const randomValue = (rng: Rng, depth: number): unknown => {
    const pick = rng.rangeInt(0, depth > 0 ? 9 : 6);
    switch (pick) {
      case 0:
        return null;
      case 1:
        return rng.rangeInt(0, 1) === 1;
      case 2:
        return rng.rangeInt(-3, 70);
      case 3:
        return rng.nextFloat() * 10 - 5;
      case 4:
        return ['', 'a', 'main', 'spawn', 'boss', '__proto__', 'type'][rng.rangeInt(0, 6)];
      case 5:
        return undefined;
      case 6:
        return [Number.NaN, Number.POSITIVE_INFINITY, -0][rng.rangeInt(0, 2)];
      case 7: {
        const out: unknown[] = [];
        for (let i = rng.rangeInt(0, 4); i > 0; i--) out.push(randomValue(rng, depth - 1));
        return out;
      }
      default: {
        const out: Record<string, unknown> = {};
        const keys = ['id', 'type', 'x', 'hp', 'sprite', 'items', 'extra', 'Bad Key'];
        for (let i = rng.rangeInt(0, 5); i > 0; i--) {
          out[keys[rng.rangeInt(0, keys.length - 1)] ?? 'id'] = randomValue(rng, depth - 1);
        }
        return out;
      }
    }
  };

  const fuzzSchema = s.object(
    {
      id: s.str(),
      hp: s.int({ min: 1, max: 64 }),
      sprite: s.nullable(s.ref('sprite')),
      items: s.array(
        s.oneOf('type', {
          spawn: s.object({ type: s.enumOf(['spawn'] as const), x: s.num() }),
          boss: s.object(
            { type: s.enumOf(['boss'] as const), id: s.ref('enemy'), x: s.num() },
            { optional: ['x'] },
          ),
        }),
        { max: 3 },
      ),
      extra: s.record(s.nullable(s.int()), /^[a-z]+$/),
    },
    { optional: ['sprite', 'items', 'extra', 'hp'] },
  );

  it('never throws on arbitrary input and fails exactly when it reports an issue (seeded fuzz)', () => {
    const rng = createRng(0x5eed);
    let accepted = 0;
    for (let round = 0; round < 3000; round++) {
      const value =
        round % 3 === 0 ? { id: 'x', ...(randomValue(rng, 3) as object) } : randomValue(rng, 4);
      const issues = collector();
      const refs: RefSite[] = [];
      const parsed = fuzzSchema.parse(value, 'doc', issues, refs);
      expect(parsed === undefined, JSON.stringify(value)).toBe(issues.length > 0);
      for (const issue of issues) expect(issue.path.startsWith('doc')).toBe(true);
      if (parsed !== undefined) {
        accepted++;
        // Accepted documents round-trip through the schema unchanged.
        const again = collector();
        expect(fuzzSchema.parse(JSON.parse(JSON.stringify(parsed)), 'doc', again)).toEqual(parsed);
        expect(again).toEqual([]);
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });
});

describe('core/data schema — Infer', () => {
  it('infers required, optional, nullable and union field types', () => {
    const spec = s.object(
      {
        id: s.str(),
        hp: s.int(),
        drop: s.nullable(s.str()),
        slot: s.enumOf(['main', 'sub'] as const),
        tags: s.array(s.bool()),
        params: s.record(s.num()),
        note: s.str(),
      },
      { optional: ['note'] },
    );
    type Spec = Infer<typeof spec>;
    expectTypeOf<Spec['id']>().toEqualTypeOf<string>();
    expectTypeOf<Spec['drop']>().toEqualTypeOf<string | null>();
    expectTypeOf<Spec['slot']>().toEqualTypeOf<'main' | 'sub'>();
    expectTypeOf<Spec['tags']>().toEqualTypeOf<boolean[]>();
    expectTypeOf<Spec['params']>().toEqualTypeOf<Record<string, number>>();
    expectTypeOf<Pick<Spec, 'note'>>().toEqualTypeOf<{ note?: string }>();
    expectTypeOf<{
      id: string;
      hp: number;
      drop: null;
      slot: 'main';
      tags: [];
      params: Record<string, never>;
    }>().toExtend<Spec>();
    expectTypeOf<ReturnType<typeof spec.parse>>().toEqualTypeOf<Spec | undefined>();
    expect(
      spec.parse(
        { id: 'a', hp: 1, drop: null, slot: 'sub', tags: [], params: {} },
        '',
        collector(),
      ),
    ).toEqual({ id: 'a', hp: 1, drop: null, slot: 'sub', tags: [], params: {} });

    const union = s.oneOf('type', {
      a: s.object({ type: s.enumOf(['a'] as const), n: s.int() }),
      b: s.object({ type: s.enumOf(['b'] as const) }),
    });
    expectTypeOf<Infer<typeof union>>().toEqualTypeOf<{ type: 'a'; n: number } | { type: 'b' }>();
    expectTypeOf<Infer<number>>().toEqualTypeOf<never>();
    expect(union.parse({ type: 'b' }, '', collector())).toEqual({ type: 'b' });
  });
});
