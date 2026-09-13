/**
 * Edge cases of the pattern DSL compiler of plan M2-02 (`core/patterns` `dsl.ts`): the expression
 * parser (whitespace, number forms, unary chains, every syntax error with its position), the
 * constant folder (IEEE results the interpreter would compute), the `patterns` file schema limits,
 * and the pattern compiler's corners — global ids across files, `repeat` depth after inlining,
 * expression depth, the bank size limit, params as values (constants folded, locals passed through,
 * slots reused, the {@link MAX_PATTERN_LOCALS} boundary), bullet specs reading params, shared bullet
 * programs from bullet programs in either compile order (review round 1), strict vs loose inline
 * bullets, and {@link compilePatternBank} called directly (paths the schema never lets through).
 */
import { describe, expect, it } from 'vitest';
import { BULLET_KIND_NAMES } from '../../src/bullets/kinds.js';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import type { ValidationIssue } from '../../src/data/schema.js';
import {
  DirType,
  EMPTY_PATTERN_BANK,
  ExprOp,
  MAX_EXPR_STACK,
  MAX_PATTERN_CODE,
  MAX_PATTERN_LOCALS,
  MAX_PATTERN_PARAMS,
  MAX_REPEAT_DEPTH,
  PatternOp,
  SpeedType,
  applyExprOp,
  compileExpression,
  compilePatternBank,
  type PatternBank,
  type PatternsFile,
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
 * An action entry.
 *
 * @param id - Id.
 * @param body - Nodes.
 * @returns The entry.
 */
function action(id: string, body: unknown[]): { id: string; body: unknown[] } {
  return { id, body };
}

/**
 * Loads pattern files and returns the bank and the issues as `path — message` lines.
 *
 * @param files - The files.
 * @returns The bank and the issues.
 */
function compile(...files: ContentFile[]): { bank: PatternBank; issues: string[] } {
  const { db, issues } = loadContent(files);
  return { bank: db.patterns, issues: issues.map((i) => i.path + ' — ' + i.message) };
}

/**
 * The entry of an action.
 *
 * @param bank - The bank.
 * @param id - Action id.
 * @returns Its code offset (0 = did not compile).
 */
function entryOf(bank: PatternBank, id: string): number {
  const index = bank.actionIndex.get(id);
  expect(index, id).toBeDefined();
  return bank.entries[index ?? 0];
}

/**
 * The code offsets of every op of one kind in `[from, to)` (a linear scan: only valid where
 * operands cannot equal the op code — the tests keep their operands distinct).
 *
 * @param code - The bank's code.
 * @param op - The op code.
 * @param from - First offset.
 * @param to - End offset.
 * @returns The offsets.
 */
function countOp(code: Float64Array, op: number, from = 0, to = code.length): number {
  let n = 0;
  for (let i = from; i < to; i++) if (code[i] === op) n++;
  return n;
}

describe('core/patterns DSL — expression parser edges', () => {
  it('skips any whitespace, reads every number form, chains unary signs', () => {
    expect(ops(' \t2\n+  3 ')).toEqual([ExprOp.Const, 5]);
    expect(ops('1.')).toEqual([ExprOp.Const, 1]);
    expect(ops('1e2 + 2E-1 + .5 + 0.25e+1')).toEqual([ExprOp.Const, 100 + 0.2 + 0.5 + 2.5]);
    expect(ops('- - 3')).toEqual([ExprOp.Const, 3]);
    expect(ops('-+-3')).toEqual([ExprOp.Const, 3]);
    expect(ops('+$i')).toEqual([ExprOp.Index]);
    // No algebra: only constant subtrees fold.
    expect(ops('-(-$i)')).toEqual([ExprOp.Index, ExprOp.Neg, ExprOp.Neg]);
    expect(ops('$i * 1')).toEqual([ExprOp.Index, ExprOp.Const, 1, ExprOp.Mul]);
    expect(ops('floor (1.5)')).toEqual([ExprOp.Const, 1]);
    expect(ops('min(max($i, 1), 2)')).toEqual([
      ExprOp.Index,
      ExprOp.Const,
      1,
      ExprOp.Max,
      ExprOp.Const,
      2,
      ExprOp.Min,
    ]);
    // A call with one constant argument folds only when all of them are constant.
    expect(ops('max($rank, 2 * 3)')).toEqual([ExprOp.Rank, ExprOp.Const, 6, ExprOp.Max]);
  });

  it('binds unary minus tighter than * / % and keeps JS arithmetic (what the VM computes)', () => {
    expect(ops('-7 % 3')).toEqual([ExprOp.Const, -1]);
    expect(ops('7 % -3')).toEqual([ExprOp.Const, 1]);
    expect(ops('-2 * 3 + 1')).toEqual([ExprOp.Const, -5]);
    expect(ops('8 / 2 / 2')).toEqual([ExprOp.Const, 2]); // left-associative
    expect(ops('1 / 0')).toEqual([ExprOp.Const, Infinity]);
    const nan = ops('0 / 0');
    expect(nan[0]).toBe(ExprOp.Const);
    expect(Number.isNaN(nan[1])).toBe(true);
    expect(ops('round(-2.5) + round(2.5)')).toEqual([ExprOp.Const, -2 + 3]);
    expect(ops('floor(-0.5)')).toEqual([ExprOp.Const, -1]);
  });

  it.each([
    ['$Rank', 'unexpected "$" at 0'],
    ['$10', 'unexpected "0" at 2'],
    ['floor', '"(" expected after floor'],
    ['()', 'unexpected ")" at 1'],
    ['1 +* 2', 'unexpected "*" at 3'],
    ['min(1,)', 'unexpected ")" at 6'],
    ['abs(1', '")" expected at 5'],
    ['max(1, 2, 3)', 'max takes 2 arguments'],
    ['1e', 'unexpected "e" at 1'],
    ['PI', 'unexpected "P" at 0'],
    ['rank', 'unknown function "rank"'],
    ['$', 'unexpected "$" at 0'],
    ['1 2', 'unexpected "2" at 2'],
    ['(', 'unexpected end at 1'],
  ])('rejects %j with %j', (expr, message) => {
    expect(() => compileExpression(expr)).toThrow(SyntaxError);
    expect(() => compileExpression(expr)).toThrow(message);
  });

  it('applies every operator exactly like the interpreter; an unknown op is NaN', () => {
    expect(applyExprOp(ExprOp.Add, 0.1, 0.2)).toBe(0.1 + 0.2);
    expect(applyExprOp(ExprOp.Sub, 1, 3)).toBe(-2);
    expect(applyExprOp(ExprOp.Mul, 1.5, 4)).toBe(6);
    expect(applyExprOp(ExprOp.Div, 1, 4)).toBe(0.25);
    expect(applyExprOp(ExprOp.Mod, 5.5, 2)).toBe(1.5);
    expect(applyExprOp(ExprOp.Neg, 3, 99)).toBe(-3);
    expect(applyExprOp(ExprOp.Floor, -1.5, 0)).toBe(-2);
    expect(applyExprOp(ExprOp.Round, 1.5, 0)).toBe(2);
    expect(applyExprOp(ExprOp.Abs, -4, 0)).toBe(4);
    expect(applyExprOp(ExprOp.Min, 2, 2)).toBe(2);
    expect(applyExprOp(ExprOp.Max, -1, -2)).toBe(-1);
    // Table trig in binary units: a quarter turn is 1, a full turn wraps.
    expect(applyExprOp(ExprOp.Sin, 256, 0)).toBe(1);
    expect(applyExprOp(ExprOp.Sin, 1024 + 256, 0)).toBe(1);
    expect(applyExprOp(ExprOp.Cos, 0, 0)).toBe(1);
    expect(applyExprOp(ExprOp.Cos, 512, 0)).toBe(-1);
    for (const op of [ExprOp.Const, ExprOp.Rank, ExprOp.Rand, ExprOp.Local, ExprOp.Arg, 99]) {
      expect(Number.isNaN(applyExprOp(op, 1, 2)), String(op)).toBe(true);
    }
  });

  it('closes compileExpression params without params of their own ($n inside a param is 0)', () => {
    expect(ops('$1', ['$1 + 1'])).toEqual([ExprOp.Const, 1]);
    expect(ops('$2', ['$rank', '$i * 2'])).toEqual([ExprOp.Index, ExprOp.Const, 2, ExprOp.Mul]);
    expect(ops('$9', [1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([ExprOp.Const, 9]);
    // A fresh array every call.
    const a = compileExpression('$i');
    const b = compileExpression('$i');
    expect(a).not.toBe(b);
    expect([...a]).toEqual([...b]);
  });

  it(`accepts an expression exactly ${MAX_EXPR_STACK} deep, rejects one deeper`, () => {
    const nest = (levels: number): string => {
      let deep = '$i';
      for (let k = 0; k < levels; k++) deep = '$i+(' + deep + ')';
      return deep;
    };
    expect(() => compileExpression(nest(MAX_EXPR_STACK - 1))).not.toThrow();
    expect(() => compileExpression(nest(MAX_EXPR_STACK))).toThrow('expression too deep');
    // Function arguments count too: min($i, min($i, …)).
    let calls = '$i';
    for (let k = 0; k < MAX_EXPR_STACK; k++) calls = 'min($i,' + calls + ')';
    expect(() => compileExpression(calls)).toThrow('expression too deep');
  });
});

describe('core/patterns DSL — file schema limits', () => {
  it('takes expression strings of 1 … 256 characters and finite numbers only', () => {
    const long = '1' + ' '.repeat(255);
    expect(long).toHaveLength(256);
    const { issues } = compile(
      file([
        action('ok', [{ op: 'wait', ticks: long }]),
        action('too-long', [{ op: 'wait', ticks: long + ' ' }]),
        action('empty', [{ op: 'wait', ticks: '' }]),
        action('inf', [{ op: 'wait', ticks: Infinity }]),
        action('nan', [{ op: 'wait', ticks: NaN }]),
        action('obj', [{ op: 'wait', ticks: { value: 1 } }]),
      ]),
    );
    const at = 'patterns/t.patterns.json:actions';
    expect(issues).toEqual(
      [1, 2, 3, 4, 5].map(
        (i) => `${at}[${i}].body[0].ticks — must be a finite number or an expression string`,
      ),
    );
  });

  it(`caps params at ${MAX_PATTERN_PARAMS}, node lists at 256, and checks ids and fields`, () => {
    const ten = Array.from({ length: MAX_PATTERN_PARAMS + 1 }, (_v, k) => k);
    const waits = Array.from({ length: 257 }, () => ({ op: 'wait', ticks: 1 }));
    const { bank, issues } = compile(
      file(
        [
          action('params', [{ op: 'actionRef', action: 'leaf', params: ten }]),
          action('leaf', [{ op: 'wait', ticks: '$9' }]),
          action('long', waits),
          action('Upper', []),
          action('-lead', []),
          action('flag', [{ op: 'wait', ticks: 1, ranked: 1 }]),
          action('no-accel', [{ op: 'accel', max: 2 }]),
          action('extra', [{ op: 'vanish', ticks: 1 }]),
        ],
        [{ id: 'b', speed: { type: 'sideways', value: 1 } }],
      ),
    );
    const at = 'patterns/t.patterns.json:';
    expect(issues.map((i) => i.slice(0, i.indexOf(' — ')))).toEqual([
      `${at}actions[0].body[0].params`,
      `${at}actions[2].body`,
      `${at}actions[3].id`,
      `${at}actions[4].id`,
      `${at}actions[5].body[0].ranked`,
      `${at}actions[6].body[0].accel`,
      `${at}actions[7].body[0].ticks`,
      `${at}bullets[0].speed.type`,
    ]);
    // A file failing its schema contributes nothing.
    expect(bank.actions).toEqual([]);
  });

  it('accepts a file with neither actions nor bullets, and rejects a wrong format version', () => {
    const empty = loadContent([
      { path: 'patterns/e.patterns.json', data: { formatVersion: 1, kind: 'patterns' } },
    ]);
    expect(empty.issues).toEqual([]);
    expect(empty.db.patterns.actions).toEqual([]);
    expect(empty.db.patterns.code[0]).toBe(PatternOp.End);
    const v2 = loadContent([
      {
        path: 'patterns/v.patterns.json',
        data: { formatVersion: 2, kind: 'patterns', actions: [action('a', [])] },
      },
    ]);
    expect(v2.issues.map((i) => i.path)).toContain('patterns/v.patterns.json:formatVersion');
  });

  it('EMPTY_PATTERN_BANK is one End and nothing else', () => {
    expect([...EMPTY_PATTERN_BANK.code]).toEqual([PatternOp.End]);
    expect(EMPTY_PATTERN_BANK.actions).toEqual([]);
    expect(EMPTY_PATTERN_BANK.entries).toHaveLength(0);
    expect(EMPTY_PATTERN_BANK.actionIndex.size).toBe(0);
    expect(EMPTY_PATTERN_BANK.bullets).toEqual([]);
    expect(Object.isFrozen(EMPTY_PATTERN_BANK)).toBe(true);
    // Content without patterns compiles to the same shape.
    expect([...loadContent([]).db.patterns.code]).toEqual([PatternOp.End]);
  });
});

describe('core/patterns DSL — pattern compiler edges', () => {
  it('resolves ids across files (global, like every content id) and lists bullets in path order', () => {
    const { bank, issues } = compile(
      file(
        [action('a.main', [{ op: 'actionRef', action: 'b.leaf' }])],
        [{ id: 'a.shot' }],
        'patterns/a.patterns.json',
      ),
      file(
        [action('b.leaf', [{ op: 'fire', bulletRef: 'a.shot' }])],
        [{ id: 'b.shot' }],
        'patterns/b.patterns.json',
      ),
    );
    expect(issues).toEqual([]);
    expect(bank.actions).toEqual(['a.main', 'b.leaf']);
    expect(bank.bullets).toEqual(['a.shot', 'b.shot']);
    expect(entryOf(bank, 'a.main')).toBeGreaterThan(0);
    expect(bank.code[entryOf(bank, 'a.main')]).toBe(PatternOp.Fire);
    expect(Object.isFrozen(bank)).toBe(true);
    expect(bank.entries).toBeInstanceOf(Int32Array);
  });

  it('counts repeat depth after inlining; a bullet’s own program starts at depth 0', () => {
    const nest = (depth: number, inner: unknown[]): unknown[] =>
      depth === 0 ? inner : [{ op: 'repeat', times: 2, body: nest(depth - 1, inner) }];
    const { bank, issues } = compile(
      file(
        [
          action('outer', nest(3, [{ op: 'actionRef', action: 'inner' }])),
          action('inner', nest(2, [{ op: 'wait', ticks: 1 }])),
          action('exact', nest(MAX_REPEAT_DEPTH, [{ op: 'fire', bulletRef: 'deep' }])),
        ],
        [{ id: 'deep', actions: nest(MAX_REPEAT_DEPTH, [{ op: 'vanish' }]) }],
      ),
    );
    expect(issues).toEqual([
      `patterns/t.patterns.json:actions[1].body[0].body[0] — repeat nests deeper than ${MAX_REPEAT_DEPTH}`,
    ]);
    expect(entryOf(bank, 'outer')).toBe(0);
    expect(entryOf(bank, 'inner')).toBeGreaterThan(0); // alone it nests 2 deep
    expect(entryOf(bank, 'exact')).toBeGreaterThan(0);
  });

  it(`reports an expression deeper than ${MAX_EXPR_STACK} (the schema only parses it)`, () => {
    let deep = '$i';
    for (let k = 0; k < MAX_EXPR_STACK; k++) deep = '$i+(' + deep + ')';
    expect(deep.length).toBeLessThanOrEqual(256);
    const { bank, issues } = compile(
      file([action('deep', [{ op: 'wait', ticks: deep }]), action('fine', [])]),
    );
    expect(issues).toEqual([
      'patterns/t.patterns.json:actions[0].body[0].ticks — expression too deep',
    ]);
    expect(entryOf(bank, 'deep')).toBe(0);
    expect(entryOf(bank, 'fine')).toBeGreaterThan(0);
  });

  it(`gives up past ${MAX_PATTERN_CODE} numbers: every entry 0, an empty bank`, () => {
    const waits = Array.from({ length: 256 }, () => ({ op: 'wait', ticks: 1 }));
    const refs = Array.from({ length: 256 }, () => ({ op: 'actionRef', action: 'block' }));
    const { bank, issues } = compile(
      file([
        action('small', [{ op: 'wait', ticks: 2 }]),
        action('block', waits),
        action('huge', refs),
      ]),
    );
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue).toContain(`the compiled patterns exceed ${MAX_PATTERN_CODE} numbers`);
    }
    expect([...bank.entries]).toEqual([0, 0, 0]);
    expect([...bank.code]).toEqual([PatternOp.End]);
    expect(bank.actions).toEqual(['small', 'block', 'huge']);
  });

  it('launches no program for a bullet without actions (or with an empty list)', () => {
    const { bank, issues } = compile(
      file(
        [
          action('plain', [{ op: 'fire', bulletRef: 'plain' }]),
          action('empty', [{ op: 'fire', bulletRef: 'empty' }]),
          action('inline', [{ op: 'fire', bullet: { kind: 'needle-red', actions: [] } }]),
        ],
        [
          { id: 'plain', kind: 'oval-purple' },
          { id: 'empty', actions: [] },
        ],
      ),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    for (const id of ['plain', 'empty', 'inline']) {
      const e = entryOf(bank, id);
      expect(code[e], id).toBe(PatternOp.Fire);
      expect(code[e + 4], id).toBe(0);
    }
    expect(code[entryOf(bank, 'plain') + 3]).toBe(BULLET_KIND_NAMES.indexOf('oval-purple'));
    expect(code[entryOf(bank, 'inline') + 3]).toBe(BULLET_KIND_NAMES.indexOf('needle-red'));
    // Nothing but the three actions (and their Ends) in the bank.
    expect(countOp(code, PatternOp.Fire)).toBe(3);
  });

  it('defaults a direction’s type to aim and its value to 0, a speed object’s type to absolute', () => {
    const { bank, issues } = compile(
      file([
        action('a', [{ op: 'fire', direction: { value: 10 }, speed: { value: 2 } }]),
        action('b', [{ op: 'fire', direction: { type: 'absolute' } }]),
      ]),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    const a = entryOf(bank, 'a');
    expect([...code.slice(a, a + 12)]).toEqual([
      PatternOp.Fire,
      DirType.Aim,
      SpeedType.Absolute,
      0,
      0,
      0,
      2,
      ExprOp.Const,
      10,
      2,
      ExprOp.Const,
      2,
    ]);
    const b = entryOf(bank, 'b');
    expect([code[b + 1], code[b + 7], code[b + 8]]).toEqual([DirType.Absolute, ExprOp.Const, 0]);
  });

  it('evaluates a named bullet’s direction / speed with its params: constants folded, others as args', () => {
    const { bank, issues } = compile(
      file(
        [
          action('const', [{ op: 'fire', bulletRef: 'b', params: [3, 0.5] }]),
          action('value', [{ op: 'fire', bulletRef: 'b', params: ['$rand', 0.5] }]),
          // The fire's own direction reads the caller's params (none: 0), not the bullet's.
          action('own', [
            { op: 'fire', direction: { value: '$1' }, bulletRef: 'b', params: [7, 1] },
          ]),
        ],
        [{ id: 'b', direction: { type: 'absolute', value: '$1 * 2' }, speed: '$2' }],
      ),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    const c = entryOf(bank, 'const');
    expect([...code.slice(c, c + 12)]).toEqual([
      PatternOp.Fire,
      DirType.Absolute,
      SpeedType.Absolute,
      0,
      0,
      0,
      2,
      ExprOp.Const,
      6,
      2,
      ExprOp.Const,
      0.5,
    ]);
    const v = entryOf(bank, 'value');
    expect([...code.slice(v, v + 17)]).toEqual([
      PatternOp.Fire,
      DirType.Absolute,
      SpeedType.Absolute,
      0,
      0,
      1, // one arg: the $rand
      1,
      ExprOp.Rand,
      5,
      ExprOp.Arg,
      0,
      ExprOp.Const,
      2,
      ExprOp.Mul,
      2,
      ExprOp.Const,
      0.5,
    ]);
    const o = entryOf(bank, 'own');
    expect([code[o + 1], code[o + 6], code[o + 7], code[o + 8]]).toEqual([
      DirType.Aim,
      2,
      ExprOp.Const,
      0,
    ]);
    expect(code[o + 11]).toBe(1);
  });

  it('reports a shared bullet whose spec reads a param nobody passes; every firing action fails', () => {
    const { bank, issues } = compile(
      file(
        [
          action('one', [{ op: 'fire', bulletRef: 'needy' }]),
          action('two', [{ op: 'fire', bulletRef: 'needy' }]),
          action('passes', [{ op: 'fire', bulletRef: 'needy', params: [4] }]),
        ],
        [{ id: 'needy', speed: '$1' }],
      ),
    );
    expect(issues).toEqual([
      'patterns/t.patterns.json:bullets[0] — uses $1 but the reference passes fewer params',
    ]);
    expect(entryOf(bank, 'one')).toBe(0);
    expect(entryOf(bank, 'two')).toBe(0);
    expect(entryOf(bank, 'passes')).toBeGreaterThan(0);
  });

  it('hands mixed params to a bullet: constants stay folded, each value becomes the next local', () => {
    const { bank, issues } = compile(
      file(
        [
          action('mixed', [
            {
              op: 'repeat',
              times: 2,
              body: [{ op: 'fire', bulletRef: 'm', params: [3, '$i', 7, '$rand'] }],
            },
          ]),
        ],
        [{ id: 'm', actions: [{ op: 'wait', ticks: '$1 + $2 + $3 + $4' }] }],
      ),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    const fire = entryOf(bank, 'mixed') + 5;
    expect(code[fire]).toBe(PatternOp.Fire);
    expect([...code.slice(fire + 5, fire + 10)]).toEqual([2, 1, ExprOp.Index, 1, ExprOp.Rand]);
    const program = code[fire + 4];
    expect([...code.slice(program, program + 3)]).toEqual([PatternOp.Wait, 0, 11]);
    expect([...code.slice(program + 3, program + 15)]).toEqual([
      ExprOp.Const,
      3,
      ExprOp.Local,
      0,
      ExprOp.Add,
      ExprOp.Const,
      7,
      ExprOp.Add,
      ExprOp.Local,
      1,
      ExprOp.Add,
      PatternOp.End,
    ]);
  });

  it('passes a local straight through a nested actionRef; a new value takes the next slot', () => {
    const { bank, issues } = compile(
      file([
        action('outer', [{ op: 'actionRef', action: 'middle', params: ['$rand'] }]),
        action('middle', [
          { op: 'actionRef', action: 'leaf', params: ['$1'] },
          { op: 'actionRef', action: 'leaf', params: ['$1 + 1'] },
        ]),
        action('leaf', [{ op: 'wait', ticks: '$1' }]),
      ]),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    const e = entryOf(bank, 'outer');
    expect([...code.slice(e, e + 20)]).toEqual([
      PatternOp.SetLocal,
      0,
      1,
      ExprOp.Rand,
      // leaf($1): no SetLocal, it reads local 0.
      PatternOp.Wait,
      0,
      2,
      ExprOp.Local,
      0,
      // leaf($1 + 1): stored in local 1 first.
      PatternOp.SetLocal,
      1,
      5,
      ExprOp.Local,
      0,
      ExprOp.Const,
      1,
      ExprOp.Add,
      PatternOp.Wait,
      0,
      2,
    ]);
    expect([code[e + 20], code[e + 21], code[e + 22]]).toEqual([ExprOp.Local, 1, PatternOp.End]);
  });

  it('reuses a local slot for sibling references (their bodies never overlap)', () => {
    const { bank, issues } = compile(
      file([
        action('twice', [
          { op: 'actionRef', action: 'leaf', params: ['$rand'] },
          { op: 'actionRef', action: 'leaf', params: ['$rand * 2'] },
        ]),
        action('leaf', [{ op: 'wait', ticks: '$1' }]),
      ]),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    const e = entryOf(bank, 'twice');
    expect([code[e], code[e + 1]]).toEqual([PatternOp.SetLocal, 0]);
    const second = e + 4 + 5; // SetLocal [9, 0, 1, Rand] + Wait [1, 0, 2, Local, 0]
    expect([code[second], code[second + 1]]).toEqual([PatternOp.SetLocal, 0]);
  });

  it(`allows exactly ${MAX_PATTERN_LOCALS} param values at once; passed-through locals are free`, () => {
    const rands = (n: number): string[] => Array.from({ length: n }, () => '$rand');
    const chain = Array.from({ length: 20 }, (_v, k) =>
      action('c' + String(k), [{ op: 'actionRef', action: 'c' + String(k + 1), params: ['$1'] }]),
    );
    const { bank, issues } = compile(
      file([
        action('outer', [{ op: 'actionRef', action: 'middle', params: rands(9) }]),
        action('middle', [{ op: 'actionRef', action: 'leaf', params: rands(7) }]),
        action('leaf', [{ op: 'wait', ticks: '$7' }]),
        action('start', [{ op: 'actionRef', action: 'c0', params: ['$rand'] }]),
        ...chain,
        action('c20', [{ op: 'wait', ticks: '$1' }]),
      ]),
    );
    expect(issues).toEqual([]);
    const outer = entryOf(bank, 'outer');
    expect(outer).toBeGreaterThan(0);
    // 9 + 7 SetLocals, slots 0 … 15.
    const slots: number[] = [];
    let pc = outer;
    while (bank.code[pc] === PatternOp.SetLocal) {
      slots.push(bank.code[pc + 1]);
      pc += 4; // [9, slot, 1, Rand]
    }
    expect(slots).toEqual(Array.from({ length: MAX_PATTERN_LOCALS }, (_v, k) => k));
    // A 21-deep chain of `$1` hand-offs holds one local.
    const start = entryOf(bank, 'start');
    expect([...bank.code.slice(start, start + 9)]).toEqual([
      PatternOp.SetLocal,
      0,
      1,
      ExprOp.Rand,
      PatternOp.Wait,
      0,
      2,
      ExprOp.Local,
      0,
    ]);
  });

  it('keys a shared inline bullet by context: strict (inlined without params) vs loose (alone)', () => {
    const { bank, issues } = compile(
      file([
        action('shooter', [
          { op: 'fire', bullet: { actions: [{ op: 'changeSpeed', speed: 2 }] } },
          { op: 'fire', bullet: { actions: [{ op: 'changeSpeed', speed: '$1' }] } },
        ]),
        action('a', [{ op: 'actionRef', action: 'shooter' }]),
      ]),
    );
    // Inlined without params, the second bullet's `$1` is missing; alone it is 0.
    expect(issues).toEqual([
      'patterns/t.patterns.json:actions[0].body[1].bullet.actions[0].speed — uses $1 but the reference passes fewer params',
    ]);
    expect(entryOf(bank, 'shooter')).toBeGreaterThan(0);
    expect(entryOf(bank, 'a')).toBe(0);
    const { code } = bank;
    const s = entryOf(bank, 'shooter');
    const loose = code[s + 4];
    expect(code[loose]).toBe(PatternOp.ChangeSpeed);
    expect([code[loose + 2], code[loose + 3], code[loose + 4]]).toEqual([2, ExprOp.Const, 2]);
  });

  it('binds args for an inline bullet only when it has a program', () => {
    const { bank, issues } = compile(
      file([
        action('outer', [{ op: 'actionRef', action: 'shot', params: ['$rand'] }]),
        action('shot', [
          { op: 'fire', speed: '$1', bullet: {} },
          { op: 'fire', bullet: { actions: [{ op: 'changeSpeed', speed: '$1' }] } },
        ]),
      ]),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    const e = entryOf(bank, 'outer');
    // [SetLocal 0, $rand]
    const plain = e + 4;
    expect(code[plain]).toBe(PatternOp.Fire);
    expect(code[plain + 5]).toBe(0); // no args: the fire reads local 0 itself
    expect([...code.slice(plain + 9, plain + 12)]).toEqual([2, ExprOp.Local, 0]);
    const withProgram = plain + 12;
    expect(code[withProgram]).toBe(PatternOp.Fire);
    expect([...code.slice(withProgram + 5, withProgram + 9)]).toEqual([1, 2, ExprOp.Local, 0]);
    const program = code[withProgram + 4];
    expect([...code.slice(program, program + 5)]).toEqual([
      PatternOp.ChangeSpeed,
      SpeedType.Absolute,
      2,
      ExprOp.Local,
      0,
    ]);
  });

  it('links a shared bullet fired from another bullet’s program, in either compile order', () => {
    const leafFirst = compile(
      file(
        [
          action('direct', [{ op: 'fire', bulletRef: 'leaf' }]),
          action('carried', [{ op: 'fire', bulletRef: 'carrier' }]),
        ],
        [
          { id: 'leaf', actions: [{ op: 'changeSpeed', speed: 3 }] },
          {
            id: 'carrier',
            actions: [
              { op: 'wait', ticks: 6 },
              { op: 'fire', bulletRef: 'leaf' },
            ],
          },
        ],
      ),
    );
    const carrierFirst = compile(
      file(
        [
          action('carried', [{ op: 'fire', bulletRef: 'carrier' }]),
          action('direct', [{ op: 'fire', bulletRef: 'leaf' }]),
        ],
        [
          { id: 'leaf', actions: [{ op: 'changeSpeed', speed: 3 }] },
          {
            id: 'carrier',
            actions: [
              { op: 'wait', ticks: 6 },
              { op: 'fire', bulletRef: 'leaf' },
            ],
          },
        ],
      ),
    );
    for (const { bank, issues } of [leafFirst, carrierFirst]) {
      expect(issues).toEqual([]);
      const { code } = bank;
      const leaf = code[entryOf(bank, 'direct') + 4];
      expect(code[leaf]).toBe(PatternOp.ChangeSpeed);
      const carrier = code[entryOf(bank, 'carried') + 4];
      expect(code[carrier]).toBe(PatternOp.Wait);
      const inner = carrier + 5;
      expect(code[inner]).toBe(PatternOp.Fire);
      expect(code[inner + 4]).toBe(leaf);
      expect(countOp(code, PatternOp.ChangeSpeed)).toBe(1); // one copy
    }
  });

  it('shares mutually firing bullets without params (the pool bounds them)', () => {
    const { bank, issues } = compile(
      file(
        [action('seed', [{ op: 'fire', bulletRef: 'ping' }])],
        [
          {
            id: 'ping',
            actions: [
              { op: 'wait', ticks: 10 },
              { op: 'fire', bulletRef: 'pong' },
            ],
          },
          {
            id: 'pong',
            actions: [
              { op: 'wait', ticks: 11 },
              { op: 'fire', bulletRef: 'ping' },
            ],
          },
        ],
      ),
    );
    expect(issues).toEqual([]);
    const { code } = bank;
    const ping = code[entryOf(bank, 'seed') + 4];
    const pong = code[ping + 5 + 4];
    expect(code[pong + 2]).toBe(2);
    expect(code[pong + 4]).toBe(11);
    expect(code[pong + 5 + 4]).toBe(ping);
  });

  it('reports params next to an inline bullet (they go with a bulletRef only)', () => {
    const { bank, issues } = compile(
      file([
        action('inline', [{ op: 'fire', bullet: { kind: 'oval-red' }, params: [1, 2] }]),
        action('fine', [{ op: 'fire', bullet: { kind: 'oval-red' } }]),
      ]),
    );
    expect(issues).toEqual([
      'patterns/t.patterns.json:actions[0].body[0].params — params need a bulletRef',
    ]);
    expect(entryOf(bank, 'inline')).toBe(0);
    expect(entryOf(bank, 'fine')).toBeGreaterThan(0);
  });

  it('reports an issue found twice in one action once, and still fails the action', () => {
    const { bank, issues } = compile(
      file([
        action('twice', [
          { op: 'actionRef', action: 'broken' },
          { op: 'actionRef', action: 'broken' },
        ]),
        action('broken', [{ op: 'actionRef', action: 'gone' }]),
      ]),
    );
    expect(issues).toEqual([
      'patterns/t.patterns.json:actions[1].body[0].action — unknown pattern action id "gone"',
    ]);
    expect([...bank.entries]).toEqual([0, 0]);
  });

  it('detects bulletRef-with-params recursion through an action inlined in the bullet’s program', () => {
    const { bank, issues } = compile(
      file(
        [
          action('start', [{ op: 'fire', bulletRef: 'echo', params: ['$rand'] }]),
          action('again', [{ op: 'fire', bulletRef: 'echo', params: [2] }]),
        ],
        [{ id: 'echo', actions: [{ op: 'actionRef', action: 'again' }] }],
      ),
    );
    expect(issues).toEqual([
      'patterns/t.patterns.json:actions[1].body[0].bulletRef — recursive bulletRef "echo" with params',
      // `again` alone: its bullet's program inlines `again` again.
      'patterns/t.patterns.json:bullets[0].actions[0].action — recursive actionRef "again"',
    ]);
    expect([...bank.entries]).toEqual([0, 0]);
  });
});

describe('core/patterns DSL — compilePatternBank called directly', () => {
  /**
   * Compiles one unvalidated file.
   *
   * @param patterns - The file.
   * @returns The bank and the issues.
   */
  function direct(patterns: PatternsFile): { bank: PatternBank; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    const bank = compilePatternBank([{ path: 'x.patterns.json', file: patterns }], issues);
    return { bank, issues };
  }

  it('reports bad expressions the schema would have caught (as 0), in nodes and params', () => {
    const { bank, issues } = direct({
      actions: [
        { id: 'expr', body: [{ op: 'wait', ticks: '(' }] },
        { id: 'param', body: [{ op: 'actionRef', action: 'leaf', params: ['2 *'] }] },
        { id: 'leaf', body: [{ op: 'wait', ticks: '$1' }] },
      ],
    });
    expect(issues).toEqual([
      {
        path: 'x.patterns.json:actions[0].body[0].ticks',
        message: 'bad expression: unexpected end at 1',
      },
      {
        path: 'x.patterns.json:actions[1].body[0].params[0]',
        message: 'bad expression: unexpected end at 3',
      },
    ]);
    expect(bank.entries[0]).toBe(0);
    expect(bank.entries[1]).toBe(0);
    expect(bank.entries[2]).toBeGreaterThan(0);
    // The bad expression compiled to a 0 constant.
    expect([...bank.code.slice(bank.entries[2], bank.entries[2] + 3)]).toEqual([
      PatternOp.Wait,
      0,
      2,
    ]);
  });

  it('compiles an unknown kind name as round-pink, and keeps registration order', () => {
    const { bank, issues } = direct({
      actions: [
        { id: 'z', body: [{ op: 'fire', bullet: { kind: 'laser-green' } }] },
        { id: 'a', body: [] },
      ],
    });
    expect(issues).toEqual([]);
    expect(bank.actions).toEqual(['z', 'a']);
    expect(bank.code[bank.entries[0] + 3]).toBe(0);
    expect(bank.code[bank.entries[1]]).toBe(PatternOp.End);
  });

  it('flags a strict `$n` inside a nested reference’s params', () => {
    const { bank, issues } = direct({
      actions: [
        { id: 'outer', body: [{ op: 'actionRef', action: 'middle', params: [1] }] },
        { id: 'middle', body: [{ op: 'actionRef', action: 'leaf', params: ['$2'] }] },
        { id: 'leaf', body: [{ op: 'wait', ticks: '$1' }] },
      ],
    });
    expect(issues).toEqual([
      {
        path: 'x.patterns.json:actions[1].body[0].params[0]',
        message: 'uses $2 but the reference passes fewer params',
      },
    ]);
    expect([...bank.entries].map((e) => e > 0)).toEqual([false, true, true]);
  });
});
