import { describe, expect, it } from 'vitest';
import { s, type RefSite, type ValidationIssue } from '../../src/data/schema.js';

/** Fresh issue collector. */
const collector = (): ValidationIssue[] => [];

describe('core/data schema combinators', () => {
  describe('s.int', () => {
    it('accepts integers inside the bounds', () => {
      const issues = collector();
      expect(s.int({ min: 1, max: 5 }).parse(3, 'hp', issues)).toBe(3);
      expect(issues).toEqual([]);
    });

    it.each([
      [1.5, 'hp', 'must be an integer in 1..5'],
      [0, 'hp', 'must be an integer in 1..5'],
      [6, 'hp', 'must be an integer in 1..5'],
      ['3', 'hp', 'must be an integer in 1..5'],
    ])('rejects %o', (value, path, message) => {
      const issues = collector();
      expect(s.int({ min: 1, max: 5 }).parse(value, path, issues)).toBeUndefined();
      expect(issues).toEqual([{ path, message }]);
    });

    it('describes one-sided bounds', () => {
      const issues = collector();
      s.int({ min: 1 }).parse(0, 'enemies[3].hurtbox.hw', issues);
      s.int({ max: 4 }).parse(9, 'cap', issues);
      s.int().parse(Number.NaN, 'n', issues);
      expect(issues).toEqual([
        { path: 'enemies[3].hurtbox.hw', message: 'must be an integer >= 1' },
        { path: 'cap', message: 'must be an integer <= 4' },
        { path: 'n', message: 'must be an integer' },
      ]);
    });
  });

  describe('s.num', () => {
    it('accepts finite numbers and rejects everything else', () => {
      const issues = collector();
      expect(s.num().parse(1.5, 'x', issues)).toBe(1.5);
      expect(s.num({ min: 0 }).parse(-0.5, 'x', issues)).toBeUndefined();
      expect(s.num().parse(Number.POSITIVE_INFINITY, 'y', issues)).toBeUndefined();
      expect(s.num().parse(null, 'z', issues)).toBeUndefined();
      expect(issues.map((issue) => issue.path)).toEqual(['x', 'y', 'z']);
      expect(issues[0]?.message).toBe('must be a finite number >= 0');
    });
  });

  describe('s.str', () => {
    it('rejects empty strings by default', () => {
      const issues = collector();
      expect(s.str().parse('ok', 'id', issues)).toBe('ok');
      expect(s.str().parse('', 'id', issues)).toBeUndefined();
      expect(s.str({ minLength: 0 }).parse('', 'id', issues)).toBe('');
      expect(issues).toEqual([{ path: 'id', message: 'must be a non-empty string' }]);
    });

    it('enforces a maximum length and a pattern', () => {
      const issues = collector();
      expect(s.str({ maxLength: 2 }).parse('abc', 'id', issues)).toBeUndefined();
      expect(s.str({ pattern: /^[a-z]+$/ }).parse('A1', 'id', issues)).toBeUndefined();
      expect(issues).toHaveLength(2);
      expect(issues[1]?.message).toContain('matching /^[a-z]+$/');
    });
  });

  describe('s.bool and s.enumOf', () => {
    it('accept exact values only', () => {
      const issues = collector();
      expect(s.bool().parse(false, 'pierce', issues)).toBe(false);
      expect(s.bool().parse(0, 'pierce', issues)).toBeUndefined();
      expect(s.enumOf(['main', 'sub'] as const).parse('sub', 'slot', issues)).toBe('sub');
      expect(s.enumOf(['main', 'sub'] as const).parse('laser', 'slot', issues)).toBeUndefined();
      expect(issues).toEqual([
        { path: 'pierce', message: 'must be a boolean' },
        { path: 'slot', message: 'must be one of: main, sub' },
      ]);
    });
  });

  describe('s.array', () => {
    it('reports every bad item with an indexed path', () => {
      const issues = collector();
      expect(s.array(s.int()).parse([1, 'x', 3.5], 'speeds', issues)).toBeUndefined();
      expect(issues.map((issue) => issue.path)).toEqual(['speeds[1]', 'speeds[2]']);
    });

    it('enforces the type and the length bounds', () => {
      const issues = collector();
      expect(s.array(s.int()).parse({}, 'a', issues)).toBeUndefined();
      expect(s.array(s.int(), { min: 2 }).parse([1], 'b', issues)).toBeUndefined();
      expect(s.array(s.int(), { max: 1 }).parse([1, 2], 'c', issues)).toBeUndefined();
      expect(issues).toEqual([
        { path: 'a', message: 'must be an array' },
        { path: 'b', message: 'must have at least 2 items' },
        { path: 'c', message: 'must have at most 1 items' },
      ]);
    });

    it('refuses to hold bare references (a programming error)', () => {
      expect(() => s.array(s.ref('enemy'))).toThrow(TypeError);
    });
  });

  describe('s.object', () => {
    const box = s.object({ hw: s.int({ min: 1 }), hh: s.int({ min: 1 }) });
    const enemy = s.object({ id: s.str(), hurtbox: box, drop: s.str() }, { optional: ['drop'] });

    it('parses nested objects and keeps optional fields absent', () => {
      const issues = collector();
      const parsed = enemy.parse({ id: 'a', hurtbox: { hw: 6, hh: 5 } }, '', issues);
      expect(parsed).toEqual({ id: 'a', hurtbox: { hw: 6, hh: 5 } });
      expect(issues).toEqual([]);
    });

    it('builds nested JSON paths', () => {
      const issues = collector();
      const list = s.array(enemy);
      expect(
        list.parse([{ id: 'a', hurtbox: { hw: 0, hh: 5 } }], 'enemies', issues),
      ).toBeUndefined();
      expect(issues).toEqual([
        { path: 'enemies[0].hurtbox.hw', message: 'must be an integer >= 1' },
      ]);
    });

    it('reports missing required fields and unknown fields', () => {
      const issues = collector();
      expect(enemy.parse({ hurtbox: { hw: 1, hh: 1 }, hp: 3 }, 'e', issues)).toBeUndefined();
      expect(issues).toEqual([
        { path: 'e.id', message: 'is required' },
        { path: 'e.hp', message: 'unknown field' },
      ]);
    });

    it.each([[null], [[]], ['x']])('rejects the non-object %o', (value) => {
      const issues = collector();
      expect(enemy.parse(value, 'e', issues)).toBeUndefined();
      expect(issues).toEqual([{ path: 'e', message: 'must be an object' }]);
    });
  });

  describe('s.record', () => {
    it('parses string-keyed maps and checks the keys', () => {
      const issues = collector();
      const params = s.record(s.num(), /^[a-z]+$/);
      expect(params.parse({ speed: 2 }, 'params', issues)).toEqual({ speed: 2 });
      expect(params.parse({ 'bad key': 1 }, 'params', issues)).toBeUndefined();
      expect(params.parse({ speed: 'x' }, 'params', issues)).toBeUndefined();
      expect(params.parse(7, 'params', issues)).toBeUndefined();
      expect(issues.map((issue) => issue.path)).toEqual([
        'params.bad key',
        'params.speed',
        'params',
      ]);
    });
  });

  describe('s.nullable', () => {
    it('accepts null and delegates otherwise', () => {
      const issues = collector();
      expect(s.nullable(s.str()).parse(null, 'drop', issues)).toBeNull();
      expect(s.nullable(s.str()).parse('capsule', 'drop', issues)).toBe('capsule');
      expect(s.nullable(s.str()).parse(3, 'drop', issues)).toBeUndefined();
      expect(issues).toEqual([{ path: 'drop', message: 'must be a non-empty string' }]);
    });
  });

  describe('s.ref', () => {
    it('records a reference site pointing at the containing object', () => {
      const issues = collector();
      const refs: RefSite[] = [];
      const spec = s.object({ sprite: s.ref('sprite'), drop: s.nullable(s.ref('enemy')) });
      const parsed = spec.parse({ sprite: 'ships/kestrel', drop: null }, 'ships[0]', issues, refs);
      expect(issues).toEqual([]);
      expect(refs).toHaveLength(2);
      expect(refs[0]).toMatchObject({
        path: 'ships[0].sprite',
        kind: 'sprite',
        id: 'ships/kestrel',
        field: 'sprite',
      });
      expect(refs[0]?.container).toBe(parsed);
      expect(refs[1]).toMatchObject({ kind: 'enemy', id: null, field: 'drop' });
    });

    it('rejects non-string ids and records nothing', () => {
      const issues = collector();
      const refs: RefSite[] = [];
      expect(s.ref('enemy').parse(7, 'e.enemy', issues, refs)).toBeUndefined();
      expect(refs).toEqual([]);
      expect(issues).toEqual([{ path: 'e.enemy', message: 'must be a non-empty enemy id' }]);
    });

    it('records nothing when no collector is passed', () => {
      const issues = collector();
      const spec = s.object({ sprite: s.ref('sprite') });
      expect(spec.parse({ sprite: 'a' }, '', issues)).toEqual({ sprite: 'a' });
      expect(issues).toEqual([]);
    });
  });

  describe('s.oneOf', () => {
    const event = s.oneOf('type', {
      spawn: s.object({ type: s.enumOf(['spawn'] as const), enemy: s.ref('enemy') }),
      scroll: s.object({ type: s.enumOf(['scroll'] as const), speed: s.num() }),
    });

    it('dispatches on the tag field', () => {
      const issues = collector();
      expect(event.parse({ type: 'scroll', speed: 2 }, 'events[0]', issues)).toEqual({
        type: 'scroll',
        speed: 2,
      });
      expect(issues).toEqual([]);
    });

    it('reports an unknown or missing tag', () => {
      const issues = collector();
      expect(event.parse({ type: 'boss' }, 'events[1]', issues)).toBeUndefined();
      expect(event.parse({}, 'events[2]', issues)).toBeUndefined();
      expect(event.parse(3, 'events[3]', issues)).toBeUndefined();
      expect(issues).toEqual([
        { path: 'events[1].type', message: 'type must be one of: spawn, scroll' },
        { path: 'events[2].type', message: 'type must be one of: spawn, scroll' },
        { path: 'events[3]', message: 'must be an object' },
      ]);
    });
  });

  it('exposes the accepted type name and reference kind of every schema', () => {
    expect(s.int().typeName).toBe('integer');
    expect(s.ref('sprite').refKind).toBe('sprite');
    expect(s.nullable(s.ref('weapon')).refKind).toBe('weapon');
    expect(s.nullable(s.str()).typeName).toBe('string or null');
    expect(s.object({}).refKind).toBeNull();
  });
});
