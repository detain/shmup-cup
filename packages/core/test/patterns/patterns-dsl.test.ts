/**
 * The pattern DSL compiler of plan M2-02 (`core/patterns` `dsl.ts`): the expression compiler
 * (parsing, precedence, constant folding, variables, functions, params, syntax errors) and the
 * pattern compiler run by `loadContent` (the `patterns` kind: program layout, inlining,
 * shared bullet programs, every reported issue), plus the enemy `pattern` reference.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../../src/math/trig-table.js';
import {
  DirType,
  ExprOp,
  MAX_EXPR_STACK,
  MAX_REPEAT_DEPTH,
  PatternOp,
  SpeedType,
  applyExprOp,
  compileExpression,
  type PatternNode,
} from '../../src/patterns/index.js';

/**
 * The postfix ops of a compiled expression, without its length prefix.
 *
 * @param expr - Expression.
 * @param params - Params.
 * @returns The ops.
 */
function ops(expr: string | number, params?: (string | number)[]): number[] {
  const code = compileExpression(expr, params);
  expect(code[0]).toBe(code.length - 1);
  return [...code.slice(1)];
}

/**
 * A `patterns` content file.
 *
 * @param actions - The actions.
 * @param bullets - The bullets.
 * @param path - File path.
 * @returns The file.
 */
function file(
  actions: unknown[],
  bullets: unknown[] = [],
  path = 'patterns/t.patterns.json',
): ContentFile {
  return { path, data: { formatVersion: 1, kind: 'patterns', actions, bullets } };
}

/**
 * Loads pattern files.
 *
 * @param files - The files.
 * @returns The load result.
 */
function load(...files: ContentFile[]): ReturnType<typeof loadContent> {
  return loadContent(files);
}

/**
 * An action entry.
 *
 * @param id - Id.
 * @param body - Nodes.
 * @returns The entry.
 */
function action(id: string, body: unknown[]): { id: string; body: unknown[] } {
  return { id, body };
}

describe('core/patterns DSL — expression compiler', () => {
  it('folds constant expressions with the usual precedence', () => {
    expect(ops('2 + 3 * 4')).toEqual([ExprOp.Const, 14]);
    expect(ops('(2 + 3) * 4')).toEqual([ExprOp.Const, 20]);
    expect(ops('10 - 4 - 3')).toEqual([ExprOp.Const, 3]); // left-associative
    expect(ops('2 * 3 % 4')).toEqual([ExprOp.Const, 2]);
    expect(ops('-2 * -3')).toEqual([ExprOp.Const, 6]);
    expect(ops('+.5 + 1e1')).toEqual([ExprOp.Const, 10.5]);
    expect(ops(7.25)).toEqual([ExprOp.Const, 7.25]);
    expect(ops('floor(7.9) + round(2.5) + abs(-1) + min(3, 4) + max(3, 4)')).toEqual([
      ExprOp.Const,
      7 + 3 + 1 + 3 + 4,
    ]);
  });

  it('folds sin / cos from the committed table (binary units, rounded)', () => {
    expect(ops('sin(256)')).toEqual([ExprOp.Const, SIN_TABLE_Q16[256] / TRIG_SCALE]);
    expect(ops('cos(0.4)')).toEqual([ExprOp.Const, SIN_TABLE_Q16[256] / TRIG_SCALE]);
    expect(ops('sin(-256)')).toEqual([ExprOp.Const, SIN_TABLE_Q16[768] / TRIG_SCALE]);
    expect(applyExprOp(ExprOp.Cos, 512, 0)).toBe(SIN_TABLE_Q16[768] / TRIG_SCALE);
  });

  it('emits postfix code for the variables', () => {
    expect(ops('$rank / 8 + 1')).toEqual([
      ExprOp.Rank,
      ExprOp.Const,
      8,
      ExprOp.Div,
      ExprOp.Const,
      1,
      ExprOp.Add,
    ]);
    expect(ops('$i * 40 - $rand')).toEqual([
      ExprOp.Index,
      ExprOp.Const,
      40,
      ExprOp.Mul,
      ExprOp.Rand,
      ExprOp.Sub,
    ]);
    expect(ops('-$loop')).toEqual([ExprOp.Loop, ExprOp.Neg]);
    expect(ops('max($rank, 3)')).toEqual([ExprOp.Rank, ExprOp.Const, 3, ExprOp.Max]);
    expect(ops('sin($i)')).toEqual([ExprOp.Index, ExprOp.Sin]);
  });

  it('substitutes $1 … $9 by the params (missing ones are 0) and folds them', () => {
    expect(ops('$1 * $2', [4, '0.5 + 0.25'])).toEqual([ExprOp.Const, 3]);
    expect(ops('$1 + $i', ['$rank'])).toEqual([ExprOp.Rank, ExprOp.Index, ExprOp.Add]);
    expect(ops('$3 + 1', [1])).toEqual([ExprOp.Const, 1]);
    expect(ops('$1 + 1')).toEqual([ExprOp.Const, 1]);
  });

  it.each([
    ['', 'unexpected end'],
    ['1 +', 'unexpected end'],
    ['(1 + 2', '")" expected'],
    ['1 2', 'unexpected "2"'],
    ['$speed', 'unknown variable'],
    ['$0', 'unexpected "$"'],
    ['tan(1)', 'unknown function'],
    ['min(1)', 'min takes 2 arguments'],
    ['floor(1, 2)', 'floor takes 1 argument'],
    ['sin 1', '"(" expected'],
    ['1 # 2', 'unexpected "#"'],
  ])('rejects %j (%s)', (expr, message) => {
    expect(() => compileExpression(expr)).toThrow(SyntaxError);
    expect(() => compileExpression(expr)).toThrow(message);
  });

  it(`limits the evaluation stack to ${MAX_EXPR_STACK}`, () => {
    // `$i + ($i + ($i + …))` needs one stack slot per level.
    let deep = '$i';
    for (let k = 0; k < MAX_EXPR_STACK; k++) deep = '$i + (' + deep + ')';
    expect(() => compileExpression(deep)).toThrow('too deep');
    let flat = '$i';
    for (let k = 0; k < 100; k++) flat += ' + $i';
    expect(() => compileExpression(flat)).not.toThrow();
  });
});

describe('core/patterns DSL — pattern compiler (loadContent, kind patterns)', () => {
  it('compiles actions into one bank, entry per action, offset 0 an End', () => {
    const { db, issues } = load(
      file([
        action('a', [{ op: 'wait', ticks: 5 }, { op: 'vanish' }]),
        action('b', [{ op: 'wait', ticks: '60', ranked: true }]),
      ]),
    );
    expect(issues).toEqual([]);
    const bank = db.patterns;
    expect(bank.code[0]).toBe(PatternOp.End);
    expect(bank.actions).toEqual(['a', 'b']);
    expect(bank.actionIndex.get('b')).toBe(1);
    const a = bank.entries[0];
    expect([...bank.code.slice(a, a + 7)]).toEqual([
      PatternOp.Wait,
      0,
      2,
      ExprOp.Const,
      5,
      PatternOp.Vanish,
      PatternOp.End,
    ]);
    const b = bank.entries[1];
    expect([...bank.code.slice(b, b + 6)]).toEqual([
      PatternOp.Wait,
      1,
      2,
      ExprOp.Const,
      60,
      PatternOp.End,
    ]);
  });

  it('lays out repeat / loop jumps and fires with their direction, speed and kind', () => {
    const { db, issues } = load(
      file([
        action('r', [
          {
            op: 'repeat',
            times: 3,
            body: [
              {
                op: 'fire',
                direction: { type: 'sequence', value: 48 },
                speed: { type: 'relative', value: '0.5' },
                bullet: { kind: 'needle-purple' },
              },
            ],
          },
        ]),
      ]),
    );
    expect(issues).toEqual([]);
    const code = db.patterns.code;
    const e = db.patterns.entries[0];
    // [Repeat, exit, [2, Const, 3]] [Fire, dir, speed, kind, entry, [2, Const, 48], [2, Const, .5]]
    // [Loop, body] [End]
    const body = e + 5;
    expect([...code.slice(e, e + 5)]).toEqual([PatternOp.Repeat, body + 13, 2, ExprOp.Const, 3]);
    expect([...code.slice(body, body + 13)]).toEqual(
      [
        PatternOp.Fire,
        DirType.Sequence,
        SpeedType.Relative,
        8,
        0,
        2,
        ExprOp.Const,
        48,
        2,
        ExprOp.Const,
        0.5,
      ].concat([PatternOp.Loop, body]),
    );
    expect(code[body + 13]).toBe(PatternOp.End);
  });

  it('defaults a fire to aimed, 1 px/tick, round pink — or to its bullet’s direction and speed', () => {
    const { db, issues } = load(
      file(
        [
          action('plain', [{ op: 'fire' }]),
          action('named', [{ op: 'fire', bulletRef: 'slow' }]),
          action('override', [{ op: 'fire', speed: 3, bulletRef: 'slow' }]),
        ],
        [{ id: 'slow', kind: 'oval-red', speed: 0.5, direction: { type: 'absolute', value: 256 } }],
      ),
    );
    expect(issues).toEqual([]);
    const { code, entries } = db.patterns;
    const fire = (e: number): number[] => [...code.slice(e, e + 11)];
    expect(fire(entries[0])).toEqual([4, DirType.Aim, SpeedType.Absolute, 0, 0, 2, 0, 0, 2, 0, 1]);
    expect(fire(entries[1])).toEqual([4, DirType.Absolute, 0, 4, 0, 2, 0, 256, 2, 0, 0.5]);
    expect(fire(entries[2])).toEqual([4, DirType.Absolute, 0, 4, 0, 2, 0, 256, 2, 0, 3]);
  });

  it('inlines actionRef with its params and shares the program of a bullet fired without params', () => {
    const { db, issues } = load(
      file(
        [
          action('outer', [
            { op: 'actionRef', action: 'inner', params: [2, '$rank'] },
            { op: 'fire', bulletRef: 'curver' },
          ]),
          action('inner', [
            {
              op: 'repeat',
              times: '$1',
              body: [{ op: 'fire', speed: '$2 + 1', bulletRef: 'curver' }],
            },
          ]),
        ],
        [{ id: 'curver', actions: [{ op: 'changeSpeed', speed: 2, term: 10 }] }],
      ),
    );
    expect(issues).toEqual([]);
    const { code, entries } = db.patterns;
    const e = entries[0];
    // The inlined repeat counts 2; its fire's speed is `$rank + 1`.
    expect([...code.slice(e, e + 5)]).toEqual([PatternOp.Repeat, code[e + 1], 2, ExprOp.Const, 2]);
    const fireA = e + 5;
    expect([...code.slice(fireA + 8, fireA + 14)]).toEqual([
      4,
      ExprOp.Rank,
      ExprOp.Const,
      1,
      ExprOp.Add,
      PatternOp.Loop,
    ]);
    const fireB = code[e + 1];
    expect(code[fireB]).toBe(PatternOp.Fire);
    // Both fires name the same bullet program: a ChangeSpeed, then End.
    const program = code[fireA + 4];
    expect(program).toBeGreaterThan(0);
    expect(code[fireB + 4]).toBe(program);
    expect(code[program]).toBe(PatternOp.ChangeSpeed);
    expect(code[program + 8]).toBe(PatternOp.End);
    // `inner` alone runs with $1 = 0: its repeat never runs.
    const inner = entries[1];
    expect([...code.slice(inner + 2, inner + 5)]).toEqual([2, ExprOp.Const, 0]);
  });

  it('lets a bullet fire itself without params (one shared program)', () => {
    const { db, issues } = load(
      file(
        [action('seed', [{ op: 'fire', bulletRef: 'fractal' }])],
        [
          {
            id: 'fractal',
            actions: [
              { op: 'wait', ticks: 30 },
              { op: 'fire', direction: { type: 'relative', value: 256 }, bulletRef: 'fractal' },
            ],
          },
        ],
      ),
    );
    expect(issues).toEqual([]);
    const { code, entries } = db.patterns;
    const program = code[entries[0] + 4];
    const inner = program + 5; // after the wait
    expect(code[inner]).toBe(PatternOp.Fire);
    expect(code[inner + 4]).toBe(program);
  });

  it('compiles changeSpeed / changeDirection / accel with every operand', () => {
    const { db, issues } = load(
      file([
        action('b', [
          { op: 'changeSpeed', speed: { type: 'sequence', value: 0.1 }, term: 20 },
          { op: 'changeDirection', direction: { type: 'aim', value: 4 } },
          { op: 'accel', accel: 0.05, max: 3 },
        ]),
      ]),
    );
    expect(issues).toEqual([]);
    const { code, entries } = db.patterns;
    expect([...code.slice(entries[0], entries[0] + 31)]).toEqual([
      PatternOp.ChangeSpeed,
      SpeedType.Sequence,
      2,
      ExprOp.Const,
      0.1,
      2,
      ExprOp.Const,
      20,
      PatternOp.ChangeDirection,
      DirType.Aim,
      2,
      ExprOp.Const,
      4,
      2,
      ExprOp.Const,
      0,
      PatternOp.Accel,
      2, // ACCEL_HAS_MAX only
      2,
      ExprOp.Const,
      0.05,
      2,
      ExprOp.Const,
      0,
      2,
      ExprOp.Const,
      3,
      2,
      ExprOp.Const,
      0,
      PatternOp.End,
    ]);
  });

  it('reports every problem with its path; an action with issues gets entry 0', () => {
    const nest = (depth: number): PatternNode[] =>
      depth === 0 ? [{ op: 'vanish' }] : [{ op: 'repeat', times: 2, body: nest(depth - 1) }];
    const { db, issues } = load(
      file(
        [
          action('unknown', [
            { op: 'actionRef', action: 'nowhere' },
            { op: 'fire', bulletRef: 'x' },
          ]),
          action('loop-a', [{ op: 'actionRef', action: 'loop-b' }]),
          action('loop-b', [{ op: 'actionRef', action: 'loop-a' }]),
          action('deep', nest(MAX_REPEAT_DEPTH + 1)),
          action('both', [{ op: 'fire', bullet: {}, bulletRef: 'ok' }]),
          action('stray', [{ op: 'fire', params: [1] }]),
          action('missing', [{ op: 'actionRef', action: 'needs2', params: [1] }]),
          action('needs2', [{ op: 'wait', ticks: '$2' }]),
          action('self', [{ op: 'fire', bulletRef: 'loop', params: [1] }]),
          action('fine', [{ op: 'wait', ticks: 1 }]),
        ],
        [
          { id: 'ok' },
          { id: 'loop', actions: [{ op: 'fire', bulletRef: 'loop', params: ['$1'] }] },
        ],
      ),
      file([action('fine', [])], [], 'patterns/u.patterns.json'),
      // A bad expression fails its file's schema: the file contributes nothing.
      file([action('bad-expr', [{ op: 'wait', ticks: '1 +' }])], [], 'patterns/v.patterns.json'),
    );
    const p = 'patterns/t.patterns.json:actions';
    expect(issues.map((i) => i.path + ' — ' + i.message)).toEqual([
      'patterns/v.patterns.json:actions[0].body[0].ticks — bad expression "1 +": unexpected end at 3',
      'patterns/u.patterns.json:actions[0].id — duplicate pattern action id "fine"',
      `${p}[0].body[0].action — unknown pattern action id "nowhere"`,
      `${p}[0].body[1].bulletRef — unknown pattern bullet id "x"`,
      `${p}[2].body[0].action — recursive actionRef "loop-a"`,
      `${p}[1].body[0].action — recursive actionRef "loop-b"`,
      `${p}[3].body[0].body[0].body[0].body[0].body[0] — repeat nests deeper than ${MAX_REPEAT_DEPTH}`,
      `${p}[4].body[0] — give either bullet or bulletRef, not both`,
      `${p}[5].body[0].params — params need a bulletRef`,
      `${p}[7].body[0].ticks — uses $2 but the reference passes fewer params`,
      'patterns/t.patterns.json:bullets[1].actions[0].bulletRef — recursive bulletRef "loop" with params',
    ]);
    const entry = (id: string): number =>
      db.patterns.entries[db.patterns.actionIndex.get(id) ?? -1];
    for (const id of ['unknown', 'loop-a', 'deep', 'both', 'stray', 'missing', 'self']) {
      expect(entry(id), id).toBe(0);
    }
    expect(entry('needs2')).toBeGreaterThan(0); // alone, $2 is 0
    expect(entry('fine')).toBeGreaterThan(0);
    expect(db.patterns.actionIndex.has('bad-expr')).toBe(false);
  });

  it('validates the node shapes (unknown ops and fields, bad kinds, types)', () => {
    const { issues } = load(
      file([
        action('shapes', [
          { op: 'jump' },
          { op: 'wait' },
          { op: 'fire', bullet: { kind: 'laser-green' } },
          { op: 'fire', direction: { type: 'down' } },
          { op: 'fire', speed: { value: 1, extra: 2 } },
          { op: 'wait', ticks: true },
          { op: 'repeat', times: 2, body: 'x' },
        ]),
      ]),
    );
    const at = 'patterns/t.patterns.json:actions[0].body';
    expect(issues.map((i) => i.path)).toEqual([
      `${at}[0].op`,
      `${at}[1].ticks`,
      `${at}[2].bullet.kind`,
      `${at}[3].direction.type`,
      `${at}[4].speed.extra`,
      `${at}[5].ticks`,
      `${at}[6].body`,
    ]);
  });

  it('resolves an enemy’s pattern to its action index, -1 without one; an unknown one is an issue', () => {
    const enemy = (id: string, pattern?: string): Record<string, unknown> => ({
      id,
      hp: 1,
      score: 10,
      hurtbox: { hw: 4, hh: 4 },
      script: 'pattern.loop',
      sprite: 'enemies/drifter',
      drop: null,
      ...(pattern === undefined ? {} : { pattern }),
    });
    const { db, issues } = load(file([action('p0', []), action('p1', [])]), {
      path: 'enemies/e.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [enemy('a', 'p1'), enemy('b'), enemy('c', 'nope')],
      },
    });
    expect(issues).toEqual([
      { path: 'enemies/e.enemies.json:enemies[2].pattern', message: 'unknown pattern id "nope"' },
    ]);
    expect(db.enemies.map((e) => [e.pattern, e.patternId])).toEqual([
      ['p1', 1],
      [null, -1],
      ['nope', -1],
    ]);
  });

  it('reads the scoring rules section (one file only)', () => {
    const rules = (path: string, bulletCancel: number): ContentFile => ({
      path,
      data: { formatVersion: 1, kind: 'rules', scoring: { bulletCancel } },
    });
    expect(load().db.scoring).toBeNull();
    const { db, issues } = load(rules('rules/a.rules.json', 25), rules('rules/b.rules.json', 5));
    expect(db.scoring).toEqual({ bulletCancel: 25 });
    expect(Object.isFrozen(db.scoring)).toBe(true);
    expect(issues).toEqual([
      {
        path: 'rules/b.rules.json:scoring',
        message: 'scoring rules are already defined by another file',
      },
    ]);
    expect(load(rules('rules/c.rules.json', -1)).issues[0]?.path).toBe(
      'rules/c.rules.json:scoring.bulletCancel',
    );
  });
});
