/**
 * The BulletML-inspired pattern DSL of plan M2-02 (shmup_feat.md §12): the `content/patterns/`
 * file format, the expression compiler and the pattern compiler that turns every action into a
 * stack-machine program in one `Float64Array` (the {@link PatternBank}). The interpreter that runs
 * the programs is `core/patterns` `createPatternVm`; the content loader of `core/data` validates
 * `patterns` files with {@link PATTERNS_FILE_SCHEMA} and compiles them with
 * {@link compilePatternBank} once every file is collected.
 *
 * **Files.** A `patterns` file holds named **actions** (`actions: [{ id, body }]`) — a pattern an
 * enemy runs is an action, and actions call each other with `actionRef` — and named **bullets**
 * (`bullets: [{ id, kind?, direction?, speed?, actions? }]`) that `fire` nodes use by name
 * (`bulletRef`) or inline (`bullet`). Ids are global across files, like every content id.
 *
 * **Nodes** (`op`): `fire` (one bullet: `direction`, `speed`, `bullet` / `bulletRef` + `params`),
 * `wait` (`ticks`, optionally `ranked` — divided by the rank's fire rate), `repeat` (`times`,
 * `body`), `changeSpeed` (`speed`, `term`), `changeDirection` (`direction`, `term`), `accel`
 * (`accel`, `min`, `max`, `term`), `vanish`, `actionRef` (`action`, `params`). The bullet nodes
 * (`changeSpeed`, `changeDirection`, `accel`) act on the bullet running the action and do
 * nothing in an enemy's pattern; `vanish` removes the bullet — or ends an enemy's pattern.
 *
 * **Directions** `{ type, value }` in binary-angle units (1024 per turn, 0 = +x, clockwise on
 * screen): `aim` (at the nearest living player, quantised to `config.aimDirections`, + value —
 * the default type), `absolute`, `relative` (to the runner's own heading: a bullet's, or the
 * heading an enemy started its pattern with), `sequence` (to the previous fire of the same
 * runner; the first one is aimed). **Speeds** are an expression (absolute) or `{ type, value }`
 * with `absolute`, `relative` (to the runner's own speed; 0 for an enemy) or `sequence` (to the
 * previous fire's speed, {@link DEFAULT_PATTERN_SPEED} before the first) — pixels per tick on
 * Normal, multiplied by the rank's bullet speed scale like the fire primitives. In
 * `changeDirection` / `changeSpeed` a `sequence` value is a per-tick change for `term` ticks
 * (BulletML's meaning); the other types reach their target evenly over `term` ticks (0 = at once).
 *
 * **Expressions** are a JSON number or a string over `+ - * / %`, unary `-`, parentheses, the
 * functions `floor`, `round`, `abs`, `min`, `max`, `sin`, `cos` (binary-angle units, the
 * committed tables) and the variables `$rank` (the session's rank, 0–31), `$rand` (a gameplay-RNG
 * draw in `[0, 1)`, one per occurrence and evaluation), `$loop` (the loop, 1 until M2-10's
 * campaign), `$i` (the innermost `repeat`'s index, from 0) and `$1` … `$9` (the `params` of the
 * `actionRef` / `bulletRef` that inlined it — missing ones are 0 in a pattern run on its own). A
 * param is a **value**, evaluated once when its reference runs (BulletML's meaning): `$i` in a
 * param is the caller's loop index, `$rand` one draw shared by every use of the `$n`. They
 * are parsed once at load by a small recursive-descent parser (no `eval` / `new Function`),
 * constant-folded and emitted as postfix code.
 *
 * **Compilation.** `actionRef` and `bulletRef` are **inlined**, so the interpreter needs no call
 * stack; recursion is an issue. A constant param is substituted into the referenced expressions
 * and folded; any other param is evaluated when the reference runs and kept in a **local** of the
 * runner: an `actionRef` stores it (`SetLocal`) before the inlined body, a `fire` evaluates its
 * bulletRef's params (and the enclosing params an inline bullet's program reads) and hands the
 * values to the new bullet's runner; `$n` then reads the local (`ExprOp.Local`). At most
 * {@link MAX_PATTERN_LOCALS} locals are live in a program at once. `repeat` nests at most
 * {@link MAX_REPEAT_DEPTH} deep (after inlining). A bullet with `actions` gets its own program
 * (shared by every `fire` naming the same bullet without params). The whole bank is at most
 * {@link MAX_PATTERN_CODE} numbers.
 *
 * **Program layout** (`PatternOp` codes; every expression is `[length, …postfix]`):
 *
 * | Op | Layout |
 * |---|---|
 * | `End` | `[0]` — offset 0 of every bank is an `End` (entry 0 = no program) |
 * | `Wait` | `[1, ranked, expr]` |
 * | `Repeat` | `[2, exitPc, expr]` — the count; below 1 jumps to `exitPc` |
 * | `Loop` | `[3, bodyPc]` — the end of a `repeat` body |
 * | `Fire` | `[4, dirType, speedType, kind, bulletEntry, argCount, …argExprs, dirExpr, speedExpr]` |
 * | `ChangeSpeed` | `[5, speedType, speedExpr, termExpr]` |
 * | `ChangeDirection` | `[6, dirType, dirExpr, termExpr]` |
 * | `Accel` | `[7, flags (1 min, 2 max), accelExpr, minExpr, maxExpr, termExpr]` |
 * | `Vanish` | `[8]` |
 * | `SetLocal` | `[9, slot, expr]` — the runner's local `slot` = the value |
 *
 * A `Fire` evaluates its `argCount` args first (`ExprOp.Arg k` in its direction and speed reads
 * arg `k`); the launched bullet's runner starts with local `k` = arg `k`.
 *
 * @module
 */
import { BULLET_KIND_NAMES } from '../bullets/kinds.js';
import { s, type Schema, type ValidationIssue } from '../data/schema.js';
import { ANGLE_MASK, ANGLE_QUARTER } from '../math/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../math/trig-table.js';

/** Instruction codes of a compiled pattern program (see the module docs for the layouts). */
export const PatternOp = {
  /** End of the program. */
  End: 0,
  /** Sleep: `[1, ranked, expr]`. */
  Wait: 1,
  /** Start of a `repeat`: `[2, exitPc, expr]`. */
  Repeat: 2,
  /** End of a `repeat` body: `[3, bodyPc]`. */
  Loop: 3,
  /**
   * Fire one bullet: `[4, dirType, speedType, kind, bulletEntry, argCount, …argExprs, dirExpr,
   * speedExpr]`.
   */
  Fire: 4,
  /** The bullet's speed: `[5, speedType, speedExpr, termExpr]`. */
  ChangeSpeed: 5,
  /** The bullet's heading: `[6, dirType, dirExpr, termExpr]`. */
  ChangeDirection: 6,
  /** The bullet's acceleration: `[7, flags, accelExpr, minExpr, maxExpr, termExpr]`. */
  Accel: 7,
  /** Remove the bullet / end the pattern: `[8]`. */
  Vanish: 8,
  /** Store a value in a runner local (a reference's param): `[9, slot, expr]`. */
  SetLocal: 9,
} as const;

/** Expression op codes (postfix, evaluated on a small stack). */
export const ExprOp = {
  /** Push the next number. */
  Const: 0,
  /** Push `$rank`. */
  Rank: 1,
  /** Push `$rand` (one gameplay-RNG draw). */
  Rand: 2,
  /** Push `$loop`. */
  Loop: 3,
  /** Push `$i`. */
  Index: 4,
  /** `a + b`. */
  Add: 5,
  /** `a - b`. */
  Sub: 6,
  /** `a * b`. */
  Mul: 7,
  /** `a / b`. */
  Div: 8,
  /** `a % b`. */
  Mod: 9,
  /** `-a`. */
  Neg: 10,
  /** `floor(a)`. */
  Floor: 11,
  /** `round(a)`. */
  Round: 12,
  /** `abs(a)`. */
  Abs: 13,
  /** `min(a, b)`. */
  Min: 14,
  /** `max(a, b)`. */
  Max: 15,
  /** `sin(a)` — a in binary-angle units, table sine. */
  Sin: 16,
  /** `cos(a)`. */
  Cos: 17,
  /** Push the runner's local of the next number (a param's value). */
  Local: 18,
  /** Push the running `Fire`'s arg of the next number (its bullet's param values). */
  Arg: 19,
} as const;

/** Direction type codes of compiled programs (index into {@link DIRECTION_TYPES}). */
export const DirType = { Aim: 0, Absolute: 1, Relative: 2, Sequence: 3 } as const;

/** Speed type codes of compiled programs (index into {@link SPEED_TYPES}). */
export const SpeedType = { Absolute: 0, Relative: 1, Sequence: 2 } as const;

/** Direction type names (content), in {@link DirType} order. */
export const DIRECTION_TYPES = Object.freeze(['aim', 'absolute', 'relative', 'sequence'] as const);

/** Speed type names (content), in {@link SpeedType} order. */
export const SPEED_TYPES = Object.freeze(['absolute', 'relative', 'sequence'] as const);

/** Deepest `repeat` nesting of a compiled program (after `actionRef` inlining). */
export const MAX_REPEAT_DEPTH = 4;

/** Most `params` of one reference (`$1` … `$9`). */
export const MAX_PATTERN_PARAMS = 9;

/**
 * Locals of a runner: the param values live in one program at once (a bullet's own params, then
 * those of the `actionRef`s nested around a node; a deeper nesting is an issue).
 */
export const MAX_PATTERN_LOCALS = 16;

/** Largest compiled bank, in numbers (2 MB of `Float64Array`). */
export const MAX_PATTERN_CODE = 262144;

/** Speed of a `fire` without a speed (and the start of a `sequence` speed), px/tick on Normal. */
export const DEFAULT_PATTERN_SPEED = 1;

/** Kind of a bullet without a `kind`: `round-pink`. */
export const DEFAULT_PATTERN_KIND = 'round-pink';

/** The `Accel` flag bit: `min` was given. */
export const ACCEL_HAS_MIN = 1;

/** The `Accel` flag bit: `max` was given. */
export const ACCEL_HAS_MAX = 2;

/** A numeric DSL parameter: a JSON number or an expression string. */
export type PatternExpr = string | number;

/** A direction of a `fire` / `changeDirection` / bullet. */
export interface PatternDirection {
  /** How `value` is measured (default `aim`). */
  readonly type?: (typeof DIRECTION_TYPES)[number];
  /** Binary-angle units (default 0). */
  readonly value?: PatternExpr;
}

/** A speed with its type. */
export interface PatternSpeedSpec {
  /** How `value` is measured (default `absolute`). */
  readonly type?: (typeof SPEED_TYPES)[number];
  /** Pixels per tick on Normal. */
  readonly value: PatternExpr;
}

/** A speed: an expression (absolute) or a typed speed. */
export type PatternSpeed = PatternExpr | PatternSpeedSpec;

/** A bullet definition (inline in a `fire`, or named in a file's `bullets`). */
export interface PatternBulletSpec {
  /** Bullet kind name, `<shape>-<colour>` (`core/bullets` `BULLET_KIND_NAMES`; default round-pink). */
  readonly kind?: string;
  /** Direction used when the `fire` gives none. */
  readonly direction?: PatternDirection;
  /** Speed used when the `fire` gives none. */
  readonly speed?: PatternSpeed;
  /** What the bullet does once fired (its own program; default none). */
  readonly actions?: readonly PatternNode[];
}

/** A named bullet of a `patterns` file. */
export interface PatternBulletEntry extends PatternBulletSpec {
  /** Unique id (`bulletRef`). */
  readonly id: string;
}

/** A named action (a pattern) of a `patterns` file. */
export interface PatternActionEntry {
  /** Unique id (`actionRef`, enemy `pattern`). */
  readonly id: string;
  /** The nodes, in order. */
  readonly body: readonly PatternNode[];
}

/** One node of the DSL (see the module docs). */
export type PatternNode =
  | {
      /** Fire one bullet. */
      readonly op: 'fire';
      /** Direction (default: the bullet's, else aimed). */
      readonly direction?: PatternDirection;
      /** Speed (default: the bullet's, else {@link DEFAULT_PATTERN_SPEED}). */
      readonly speed?: PatternSpeed;
      /** An inline bullet. */
      readonly bullet?: PatternBulletSpec;
      /** A named bullet (instead of `bullet`). */
      readonly bulletRef?: string;
      /** `$1` … of the named bullet. */
      readonly params?: readonly PatternExpr[];
    }
  | {
      /** Sleep. */
      readonly op: 'wait';
      /** Ticks (fractions floored; below 1 = no wait). */
      readonly ticks: PatternExpr;
      /** Divide by the rank's fire rate (`rankedWait`). */
      readonly ranked?: boolean;
    }
  | {
      /** Run `body` `times` times. */
      readonly op: 'repeat';
      /** Count (floored; below 1 skips the body). */
      readonly times: PatternExpr;
      /** The nodes. */
      readonly body: readonly PatternNode[];
    }
  | {
      /** The bullet's speed. */
      readonly op: 'changeSpeed';
      /** Target speed (a `sequence` value = change per tick). */
      readonly speed: PatternSpeed;
      /** Ticks to get there (default 0 = at once). */
      readonly term?: PatternExpr;
    }
  | {
      /** The bullet's heading. */
      readonly op: 'changeDirection';
      /** Target heading (a `sequence` value = turn per tick). */
      readonly direction: PatternDirection;
      /** Ticks to get there (default 0 = at once). */
      readonly term?: PatternExpr;
    }
  | {
      /** The bullet's acceleration (speed change per tick). */
      readonly op: 'accel';
      /** Speed change per tick (Normal px/tick²). */
      readonly accel: PatternExpr;
      /** Lower speed clamp (default 0). */
      readonly min?: PatternExpr;
      /** Upper speed clamp (default `MAX_BULLET_SPEED`). */
      readonly max?: PatternExpr;
      /** Ticks it lasts (default 0 = until changed). */
      readonly term?: PatternExpr;
    }
  | {
      /** Remove the bullet (end an enemy's pattern). */
      readonly op: 'vanish';
    }
  | {
      /** Inline another action. */
      readonly op: 'actionRef';
      /** The action's id. */
      readonly action: string;
      /** `$1` … of the action. */
      readonly params?: readonly PatternExpr[];
    };

/** A validated `patterns` file. */
export interface PatternsFile {
  /** Named actions. */
  readonly actions?: readonly PatternActionEntry[];
  /** Named bullets. */
  readonly bullets?: readonly PatternBulletEntry[];
}

/**
 * The compiled patterns of the content (`ContentDb.patterns`): one program bank and the entry of
 * every action.
 */
export interface PatternBank {
  /** Every program (see the module docs); `code[0]` is `End`. */
  readonly code: Float64Array;
  /** Action ids by pattern index (the resolved `patternId` of enemies). */
  readonly actions: readonly string[];
  /** Action id → pattern index. */
  readonly actionIndex: ReadonlyMap<string, number>;
  /** Code offset of each action's program (0 = it did not compile). */
  readonly entries: Int32Array;
  /** Named bullet ids, in file order. */
  readonly bullets: readonly string[];
}

/** A bank without patterns (`EMPTY_CONTENT_DB`). */
export const EMPTY_PATTERN_BANK: PatternBank = Object.freeze({
  code: new Float64Array(1),
  actions: Object.freeze([]),
  actionIndex: new Map<string, number>(),
  entries: new Int32Array(0),
  bullets: Object.freeze([]),
});

// ------------------------------------------------------------------------------ schema

/** An expression: a finite number, or a string of at most 256 characters. */
const EXPR: Schema<PatternExpr> = Object.freeze({
  typeName: 'expression',
  refKind: null,
  parse(value: unknown, path: string, issues: ValidationIssue[]): PatternExpr | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length > 0 && value.length <= 256) {
      const error = syntaxError(value);
      if (error === null) return value;
      issues.push({ path, message: 'bad expression "' + value + '": ' + error });
      return undefined;
    }
    issues.push({ path, message: 'must be a finite number or an expression string' });
    return undefined;
  },
});

/** A direction object. */
const DIRECTION = s.object(
  { type: s.enumOf(DIRECTION_TYPES), value: EXPR },
  { optional: ['type', 'value'] },
);

/** A typed speed object. */
const SPEED_OBJECT = s.object({ type: s.enumOf(SPEED_TYPES), value: EXPR }, { optional: ['type'] });

/** A speed: an expression or a typed speed object. */
const SPEED: Schema<PatternSpeed> = Object.freeze({
  typeName: 'speed',
  refKind: null,
  parse(value: unknown, path: string, issues: ValidationIssue[]): PatternSpeed | undefined {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return SPEED_OBJECT.parse(value, path, issues);
    }
    return EXPR.parse(value, path, issues);
  },
});

/** `params` of a reference (at most 9: `$1` … `$9`). */
const PARAMS = s.array(EXPR, { max: MAX_PATTERN_PARAMS });

/** The node list, lazily (nodes nest). */
const NODE_LIST: Schema<PatternNode[]> = Object.freeze({
  typeName: 'array',
  refKind: null,
  parse(value: unknown, path: string, issues: ValidationIssue[]): PatternNode[] | undefined {
    return NODES.parse(value, path, issues);
  },
});

/** An id (lower-case, dots and dashes). */
const PATTERN_ID = s.str({ maxLength: 64, pattern: /^[a-z0-9][a-z0-9.-]*$/ });

/** A bullet definition. */
const BULLET = s.object(
  { kind: s.enumOf(BULLET_KIND_NAMES), direction: DIRECTION, speed: SPEED, actions: NODE_LIST },
  { optional: ['kind', 'direction', 'speed', 'actions'] },
);

/** One node. */
const NODE = s.oneOf('op', {
  fire: s.object(
    {
      op: s.enumOf(['fire'] as const),
      direction: DIRECTION,
      speed: SPEED,
      bullet: BULLET,
      bulletRef: PATTERN_ID,
      params: PARAMS,
    },
    { optional: ['direction', 'speed', 'bullet', 'bulletRef', 'params'] },
  ),
  wait: s.object(
    { op: s.enumOf(['wait'] as const), ticks: EXPR, ranked: s.bool() },
    { optional: ['ranked'] },
  ),
  repeat: s.object({ op: s.enumOf(['repeat'] as const), times: EXPR, body: NODE_LIST }),
  changeSpeed: s.object(
    { op: s.enumOf(['changeSpeed'] as const), speed: SPEED, term: EXPR },
    { optional: ['term'] },
  ),
  changeDirection: s.object(
    { op: s.enumOf(['changeDirection'] as const), direction: DIRECTION, term: EXPR },
    { optional: ['term'] },
  ),
  accel: s.object(
    { op: s.enumOf(['accel'] as const), accel: EXPR, min: EXPR, max: EXPR, term: EXPR },
    { optional: ['min', 'max', 'term'] },
  ),
  vanish: s.object({ op: s.enumOf(['vanish'] as const) }),
  actionRef: s.object(
    { op: s.enumOf(['actionRef'] as const), action: PATTERN_ID, params: PARAMS },
    { optional: ['params'] },
  ),
}) as Schema<PatternNode>;

/** The node array. */
const NODES = s.array(NODE, { max: 256 });

/**
 * A `content/patterns/*.patterns.json` file (plan M2-02, header included): `actions` and / or
 * `bullets` — see the module docs for the format.
 */
export const PATTERNS_FILE_SCHEMA = s.object(
  {
    formatVersion: s.int({ min: 1, max: 1 }),
    kind: s.enumOf(['patterns'] as const),
    actions: s.array(s.object({ id: PATTERN_ID, body: NODE_LIST }), { max: 1024 }),
    bullets: s.array(
      s.object(
        {
          id: PATTERN_ID,
          kind: s.enumOf(BULLET_KIND_NAMES),
          direction: DIRECTION,
          speed: SPEED,
          actions: NODE_LIST,
        },
        { optional: ['kind', 'direction', 'speed', 'actions'] },
      ),
      { max: 1024 },
    ),
  },
  { optional: ['actions', 'bullets'] },
);

// ------------------------------------------------------------------------------ expressions

/** An expression syntax tree. */
type Ast =
  | { readonly t: 'num'; readonly v: number }
  | { readonly t: 'var'; readonly op: number }
  | { readonly t: 'param'; readonly n: number }
  | { readonly t: 'local'; readonly slot: number }
  | { readonly t: 'arg'; readonly k: number }
  | { readonly t: 'neg'; readonly a: Ast }
  | { readonly t: 'bin'; readonly op: number; readonly a: Ast; readonly b: Ast }
  | { readonly t: 'call'; readonly op: number; readonly args: readonly Ast[] };

/** Variables by name. */
const VARIABLES: Readonly<Record<string, number>> = Object.freeze({
  rank: ExprOp.Rank,
  rand: ExprOp.Rand,
  loop: ExprOp.Loop,
  i: ExprOp.Index,
});

/** Functions by name → `[op, arity]`. */
const FUNCTIONS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  floor: [ExprOp.Floor, 1],
  round: [ExprOp.Round, 1],
  abs: [ExprOp.Abs, 1],
  min: [ExprOp.Min, 2],
  max: [ExprOp.Max, 2],
  sin: [ExprOp.Sin, 1],
  cos: [ExprOp.Cos, 1],
});

/**
 * A syntax error of an expression (the pattern compiler reports it as an issue;
 * {@link compileExpression} lets it through — it is a `SyntaxError`).
 */
class ExprSyntaxError extends SyntaxError {}

/** `Object.prototype.hasOwnProperty` (Chromium 69 has no `Object.hasOwn`). */
const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/** Recursive-descent parser of one expression string. */
class ExprParser {
  /** Position in the source. */
  private pos = 0;

  /**
   * Creates the parser.
   *
   * @param src - The expression.
   */
  constructor(private readonly src: string) {}

  /**
   * Parses the whole string.
   *
   * @returns The tree.
   * @throws {ExprSyntaxError} On any syntax error.
   */
  parse(): Ast {
    const ast = this.sum();
    this.skip();
    if (this.pos < this.src.length) this.fail('unexpected "' + this.src[this.pos] + '"');
    return ast;
  }

  /**
   * Throws a syntax error at the current position.
   *
   * @param message - What went wrong.
   * @throws {ExprSyntaxError} Always.
   */
  private fail(message: string): never {
    throw new ExprSyntaxError(message + ' at ' + String(this.pos));
  }

  /** Skips whitespace. */
  private skip(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  /**
   * Consumes a character when it is next.
   *
   * @param ch - The character.
   * @returns Whether it was consumed.
   */
  private eat(ch: string): boolean {
    this.skip();
    if (this.src[this.pos] === ch) {
      this.pos++;
      return true;
    }
    return false;
  }

  /**
   * `sum := product (('+' | '-') product)*`.
   *
   * @returns The tree.
   */
  private sum(): Ast {
    let a = this.product();
    for (;;) {
      if (this.eat('+')) a = { t: 'bin', op: ExprOp.Add, a, b: this.product() };
      else if (this.eat('-')) a = { t: 'bin', op: ExprOp.Sub, a, b: this.product() };
      else return a;
    }
  }

  /**
   * `product := unary (('*' | '/' | '%') unary)*`.
   *
   * @returns The tree.
   */
  private product(): Ast {
    let a = this.unary();
    for (;;) {
      if (this.eat('*')) a = { t: 'bin', op: ExprOp.Mul, a, b: this.unary() };
      else if (this.eat('/')) a = { t: 'bin', op: ExprOp.Div, a, b: this.unary() };
      else if (this.eat('%')) a = { t: 'bin', op: ExprOp.Mod, a, b: this.unary() };
      else return a;
    }
  }

  /**
   * `unary := ('-' | '+') unary | primary`.
   *
   * @returns The tree.
   */
  private unary(): Ast {
    if (this.eat('-')) return { t: 'neg', a: this.unary() };
    if (this.eat('+')) return this.unary();
    return this.primary();
  }

  /**
   * `primary := number | '$' name | name '(' args ')' | '(' sum ')'`.
   *
   * @returns The tree.
   */
  private primary(): Ast {
    this.skip();
    const src = this.src;
    const rest = src.slice(this.pos);
    const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
    if (num !== null) {
      this.pos += num[0].length;
      return { t: 'num', v: Number(num[0]) };
    }
    if (this.eat('(')) {
      const inner = this.sum();
      if (!this.eat(')')) this.fail('")" expected');
      return inner;
    }
    const variable = /^\$([a-z]+|[1-9])/.exec(rest);
    if (variable !== null) {
      this.pos += variable[0].length;
      const name = variable[1];
      if (name >= '1' && name <= '9') return { t: 'param', n: Number(name) };
      if (!hasOwn(VARIABLES, name)) this.fail('unknown variable "$' + name + '"');
      return { t: 'var', op: VARIABLES[name] };
    }
    const ident = /^[a-z]+/.exec(rest);
    if (ident !== null) {
      this.pos += ident[0].length;
      const name = ident[0];
      if (!hasOwn(FUNCTIONS, name)) this.fail('unknown function "' + name + '"');
      const [op, arity] = FUNCTIONS[name];
      if (!this.eat('(')) this.fail('"(" expected after ' + name);
      const args: Ast[] = [this.sum()];
      while (this.eat(',')) args.push(this.sum());
      if (!this.eat(')')) this.fail('")" expected');
      if (args.length !== arity) {
        this.fail(name + ' takes ' + String(arity) + ' argument' + (arity === 1 ? '' : 's'));
      }
      return { t: 'call', op, args };
    }
    this.fail(this.pos >= src.length ? 'unexpected end' : 'unexpected "' + src[this.pos] + '"');
  }
}

/**
 * Parses an expression (a JSON number is a constant).
 *
 * @param expr - The expression.
 * @returns The tree.
 * @throws {ExprSyntaxError} On a syntax error.
 */
function parseExpr(expr: PatternExpr): Ast {
  if (typeof expr === 'number') return { t: 'num', v: expr };
  return new ExprParser(expr).parse();
}

/**
 * The syntax error of an expression string, if any.
 *
 * @param expr - The string.
 * @returns The message, or `null` when it parses.
 */
function syntaxError(expr: string): string | null {
  try {
    parseExpr(expr);
    return null;
  } catch (error) {
    if (error instanceof ExprSyntaxError) return error.message;
    throw error;
  }
}

/**
 * The table sine of a binary angle (rounded to a whole unit), as the interpreter computes it.
 *
 * @param a - Binary-angle units.
 * @returns `sin`, from `SIN_TABLE_Q16`.
 */
function tableSin(a: number): number {
  return SIN_TABLE_Q16[Math.round(a) & ANGLE_MASK] / TRIG_SCALE;
}

/**
 * Applies one operator to constants — exactly what the interpreter does with the same op.
 *
 * @param op - An {@link ExprOp} operator or function.
 * @param a - First operand.
 * @param b - Second operand (binary ops, `min`, `max`).
 * @returns The value.
 */
export function applyExprOp(op: number, a: number, b: number): number {
  switch (op) {
    case ExprOp.Add:
      return a + b;
    case ExprOp.Sub:
      return a - b;
    case ExprOp.Mul:
      return a * b;
    case ExprOp.Div:
      return a / b;
    case ExprOp.Mod:
      return a % b;
    case ExprOp.Neg:
      return -a;
    case ExprOp.Floor:
      return Math.floor(a);
    case ExprOp.Round:
      return Math.round(a);
    case ExprOp.Abs:
      return Math.abs(a);
    case ExprOp.Min:
      return a < b ? a : b;
    case ExprOp.Max:
      return a > b ? a : b;
    case ExprOp.Sin:
      return tableSin(a);
    case ExprOp.Cos:
      return SIN_TABLE_Q16[(Math.round(a) + ANGLE_QUARTER) & ANGLE_MASK] / TRIG_SCALE;
    default:
      return NaN;
  }
}

/**
 * Replaces `$n` nodes by the caller's closed params and folds constant subtrees.
 *
 * @param ast - The tree.
 * @param params - Closed param trees of the enclosing reference (in the pattern compiler a
 *   constant, a runner local or a `Fire` arg — values, never a tree that reads `$i` / `$rand`
 *   again), or `null` (a pattern run on its own: missing params are 0).
 * @param missing - Receives the highest `$n` a reference did not pass (0 = none).
 * @returns The closed, folded tree.
 */
function close(ast: Ast, params: readonly Ast[] | null, missing: { n: number }): Ast {
  switch (ast.t) {
    case 'num':
    case 'var':
    case 'local':
    case 'arg':
      return ast;
    case 'param':
      if (params !== null && ast.n <= params.length) return params[ast.n - 1];
      if (params !== null && ast.n > missing.n) missing.n = ast.n;
      return { t: 'num', v: 0 };
    case 'neg': {
      const a = close(ast.a, params, missing);
      return a.t === 'num' ? { t: 'num', v: -a.v } : { t: 'neg', a };
    }
    case 'bin': {
      const a = close(ast.a, params, missing);
      const b = close(ast.b, params, missing);
      if (a.t === 'num' && b.t === 'num') return { t: 'num', v: applyExprOp(ast.op, a.v, b.v) };
      return { t: 'bin', op: ast.op, a, b };
    }
    case 'call': {
      const args = ast.args.map((arg) => close(arg, params, missing));
      if (args.every((arg) => arg.t === 'num')) {
        const a = (args[0] as { v: number }).v;
        const b = args.length > 1 ? (args[1] as { v: number }).v : 0;
        return { t: 'num', v: applyExprOp(ast.op, a, b) };
      }
      return { t: 'call', op: ast.op, args };
    }
  }
}

/**
 * Emits a closed tree as postfix code.
 *
 * @param ast - The tree (no `param` nodes).
 * @param out - Code buffer.
 */
function emitPostfix(ast: Ast, out: number[]): void {
  switch (ast.t) {
    case 'num':
      out.push(ExprOp.Const, ast.v);
      return;
    case 'var':
      out.push(ast.op);
      return;
    case 'local':
      out.push(ExprOp.Local, ast.slot);
      return;
    case 'arg':
      out.push(ExprOp.Arg, ast.k);
      return;
    case 'param':
      out.push(ExprOp.Const, 0);
      return;
    case 'neg':
      emitPostfix(ast.a, out);
      out.push(ExprOp.Neg);
      return;
    case 'bin':
      emitPostfix(ast.a, out);
      emitPostfix(ast.b, out);
      out.push(ast.op);
      return;
    case 'call':
      for (const arg of ast.args) emitPostfix(arg, out);
      out.push(ast.op);
      return;
  }
}

/**
 * Stack depth a closed tree needs.
 *
 * @param ast - The tree.
 * @returns The deepest stack while it is evaluated.
 */
function stackDepth(ast: Ast): number {
  switch (ast.t) {
    case 'neg':
      return stackDepth(ast.a);
    case 'bin':
      return Math.max(stackDepth(ast.a), 1 + stackDepth(ast.b));
    case 'call': {
      let depth = 0;
      for (let i = 0; i < ast.args.length; i++)
        depth = Math.max(depth, i + stackDepth(ast.args[i]));
      return depth;
    }
    default:
      return 1;
  }
}

/** Deepest evaluation stack an expression may need (deeper ones are an issue). */
export const MAX_EXPR_STACK = 32;

/**
 * Compiles one expression to `[length, …postfix]` — the unit test entry of the expression
 * compiler; the pattern compiler uses the same parser, folding and emitter.
 *
 * @param expr - A number or an expression string.
 * @param params - Param expressions (`$1` …), substituted as trees and folded, or omitted (they
 *   are then 0). (The pattern compiler substitutes only constant params; others are evaluated
 *   once when the reference runs and read from a runner local — see the module docs.)
 * @returns The code (a fresh array).
 * @throws {SyntaxError} On a syntax error, an unknown variable / function or a too deep expression.
 *
 * @example
 * ```ts
 * compileExpression('2 + 3 * 4');     // → [2, ExprOp.Const, 14] (folded)
 * compileExpression('$rank / 8 + 1'); // → [6, Rank, Const, 8, Div, Const, 1, Add]
 * ```
 */
export function compileExpression(
  expr: PatternExpr,
  params?: readonly PatternExpr[],
): Float64Array {
  const missing = { n: 0 };
  const closedParams =
    params === undefined ? null : params.map((p) => close(parseExpr(p), null, missing));
  const ast = close(parseExpr(expr), closedParams, missing);
  if (stackDepth(ast) > MAX_EXPR_STACK) throw new ExprSyntaxError('expression too deep');
  const out: number[] = [];
  emitPostfix(ast, out);
  const code = new Float64Array(out.length + 1);
  code[0] = out.length;
  code.set(out, 1);
  return code;
}

// ------------------------------------------------------------------------------ compiler

/** One `patterns` file as the loader collected it. */
export interface CollectedPatterns {
  /** Repo-relative file path (issue paths). */
  readonly path: string;
  /** The validated file. */
  readonly file: PatternsFile;
}

/** Compile context of one node list. */
interface Ctx {
  /**
   * Closed params of the enclosing reference (each a constant, a runner local or — only for the
   * direction / speed a `fire` takes from its bullet — a `Fire` arg), or `null`.
   */
  readonly params: readonly Ast[] | null;
  /** `repeat` depth so far. */
  readonly depth: number;
  /** Action / bullet ids being inlined (recursion check). */
  readonly stack: readonly string[];
  /** Whether a reference passed the params (missing `$n` are then an issue). */
  readonly strict: boolean;
  /** Runner locals in use (the next `SetLocal` takes this slot). */
  readonly locals: number;
}

/**
 * A bullet program: waiting to be compiled (then the `Fire` operands to patch with its entry are
 * collected), or compiled (a later `fire` of a shared program writes {@link entry} at once).
 */
interface BulletJob {
  /** The bullet's actions. */
  readonly actions: readonly PatternNode[];
  /** Its context. */
  readonly ctx: Ctx;
  /** Issue path of the actions. */
  readonly path: string;
  /** Code offsets of `bulletEntry` operands to patch once it is compiled. */
  readonly patches: number[];
  /** Its code offset (0 until it is being compiled). */
  entry: number;
  /** Whether compiling its own program reported an issue. */
  failed: boolean;
  /** The bullet programs its `fire`s launch (failure spreads to whatever fires it). */
  readonly links: BulletJob[];
}

/** The pattern compiler (one per {@link compilePatternBank} call). */
class PatternCompiler {
  /** The code (grows; offset 0 is `End`). */
  readonly out: number[] = [PatternOp.End];
  /** Action id → [entry, path]. */
  private readonly actions = new Map<string, { body: readonly PatternNode[]; path: string }>();
  /** Bullet id → [spec, path]. */
  private readonly bullets = new Map<string, { spec: PatternBulletSpec; path: string }>();
  /** Bullet programs still to compile. */
  private readonly jobs: BulletJob[] = [];
  /** Shared programs of bullets fired without params, compiled with a strict context. */
  private readonly sharedStrict = new Map<PatternBulletSpec, BulletJob>();
  /** Shared programs of inline bullets of a pattern compiled on its own (missing `$n` = 0). */
  private readonly sharedLoose = new Map<PatternBulletSpec, BulletJob>();
  /** The bullet programs the program being compiled launches. */
  private links: BulletJob[] = [];
  /** Issues already reported (`path|message`). */
  private readonly reported = new Set<string>();
  /**
   * Issues found, repeats included (an inlined action reports its problems once, but every
   * action inlining it fails).
   */
  private issueCount = 0;

  /**
   * Creates the compiler.
   *
   * @param issues - Collector.
   */
  constructor(private readonly issues: ValidationIssue[]) {}

  /**
   * Reports an issue once per path and message.
   *
   * @param path - Issue path.
   * @param message - What is wrong.
   */
  issue(path: string, message: string): void {
    this.issueCount++;
    const key = path + '|' + message;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.issues.push({ path, message });
  }

  /**
   * Registers the files' actions and bullets (duplicates are an issue).
   *
   * @param files - The collected files.
   */
  register(files: readonly CollectedPatterns[]): void {
    for (const { path, file } of files) {
      const actions = file.actions ?? [];
      for (let i = 0; i < actions.length; i++) {
        const entry = actions[i];
        const at = path + ':actions[' + String(i) + ']';
        if (this.actions.has(entry.id)) {
          this.issue(at + '.id', 'duplicate pattern action id "' + entry.id + '"');
        } else {
          this.actions.set(entry.id, { body: entry.body, path: at + '.body' });
        }
      }
      const bullets = file.bullets ?? [];
      for (let i = 0; i < bullets.length; i++) {
        const entry = bullets[i];
        const at = path + ':bullets[' + String(i) + ']';
        if (this.bullets.has(entry.id)) {
          this.issue(at + '.id', 'duplicate pattern bullet id "' + entry.id + '"');
        } else {
          this.bullets.set(entry.id, { spec: entry, path: at });
        }
      }
    }
  }

  /**
   * The registered action ids, in registration order.
   *
   * @returns The ids.
   */
  actionIds(): string[] {
    const ids: string[] = [];
    this.actions.forEach((_value, id) => ids.push(id));
    return ids;
  }

  /**
   * The registered bullet ids.
   *
   * @returns The ids.
   */
  bulletIds(): string[] {
    const ids: string[] = [];
    this.bullets.forEach((_value, id) => ids.push(id));
    return ids;
  }

  /**
   * Compiles one action as a program of its own.
   *
   * @param id - The action id.
   * @returns Its entry offset, or 0 when it — or a bullet program it launches, directly or
   *   through other bullets — produced issues.
   */
  compileAction(id: string): number {
    const action = this.actions.get(id);
    if (action === undefined) return 0;
    const before = this.issueCount;
    const entry = this.out.length;
    const links: BulletJob[] = [];
    this.links = links;
    this.block(
      action.body,
      { params: null, depth: 0, stack: [id], strict: false, locals: 0 },
      action.path,
    );
    this.out.push(PatternOp.End);
    const ok = this.issueCount === before;
    this.drainJobs();
    return ok && !PatternCompiler.reachesFailure(links) ? entry : 0;
  }

  /**
   * Whether any of the bullet programs, or one they launch in turn, failed to compile.
   *
   * @param links - The programs.
   * @returns `true` on a failure.
   */
  private static reachesFailure(links: readonly BulletJob[]): boolean {
    const seen = new Set<BulletJob>();
    const todo = links.slice();
    while (todo.length > 0) {
      const job = todo.pop() as BulletJob;
      if (seen.has(job)) continue;
      seen.add(job);
      if (job.failed) return true;
      for (const next of job.links) todo.push(next);
    }
    return false;
  }

  /**
   * Compiles every queued bullet program: its entry is known before its code (a bullet firing
   * itself links to it at once), the `Fire`s queued before are patched after.
   */
  private drainJobs(): void {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift() as BulletJob;
      job.entry = this.out.length;
      const before = this.issueCount;
      this.links = job.links;
      this.block(job.actions, job.ctx, job.path);
      this.out.push(PatternOp.End);
      job.failed = this.issueCount !== before;
      for (const at of job.patches) this.out[at] = job.entry;
    }
  }

  /**
   * Compiles an expression into the code (`[length, …postfix]`).
   *
   * @param expr - The expression.
   * @param ctx - The context (params).
   * @param path - Issue path.
   */
  private expr(expr: PatternExpr, ctx: Ctx, path: string): void {
    let ast: Ast;
    try {
      ast = parseExpr(expr);
    } catch (error) {
      if (!(error instanceof ExprSyntaxError)) throw error;
      this.issue(path, 'bad expression: ' + error.message);
      this.out.push(2, ExprOp.Const, 0);
      return;
    }
    const missing = { n: 0 };
    const closed = close(ast, ctx.params, missing);
    if (ctx.strict && missing.n > 0) {
      this.issue(path, 'uses $' + String(missing.n) + ' but the reference passes fewer params');
    }
    this.emit(closed, path);
  }

  /**
   * Emits a closed tree into the code (`[length, …postfix]`).
   *
   * @param ast - The tree.
   * @param path - Issue path.
   */
  private emit(ast: Ast, path: string): void {
    if (stackDepth(ast) > MAX_EXPR_STACK) this.issue(path, 'expression too deep');
    const code: number[] = [];
    emitPostfix(ast, code);
    this.out.push(code.length);
    for (let i = 0; i < code.length; i++) this.out.push(code[i]);
  }

  /**
   * Splits closed params into the values a `fire` hands to its bullet's runner: constants stay
   * substituted, every other param becomes arg `k` (read by the fire's own expressions) and local
   * `k` of the bullet's program.
   *
   * @param params - Closed params (in the firing runner's context).
   * @returns `args` (the trees the `Fire` evaluates), `atFire` (the params as the fire's
   *   expressions see them) and `inProgram` (as the bullet's program sees them).
   */
  private static bind(params: readonly Ast[]): {
    args: Ast[];
    atFire: Ast[];
    inProgram: Ast[];
  } {
    const args: Ast[] = [];
    const atFire: Ast[] = [];
    const inProgram: Ast[] = [];
    for (const p of params) {
      if (p.t === 'num') {
        atFire.push(p);
        inProgram.push(p);
        continue;
      }
      const k = args.length;
      args.push(p);
      atFire.push({ t: 'arg', k });
      inProgram.push({ t: 'local', slot: k });
    }
    return { args, atFire, inProgram };
  }

  /**
   * Closes a reference's param expressions in the caller's context.
   *
   * @param params - The param expressions.
   * @param ctx - The caller's context.
   * @param path - Issue path of the `params`.
   * @returns The closed trees.
   */
  private closeParams(params: readonly PatternExpr[], ctx: Ctx, path: string): Ast[] {
    const closed: Ast[] = [];
    for (let i = 0; i < params.length; i++) {
      const at = path + '[' + String(i) + ']';
      try {
        const missing = { n: 0 };
        closed.push(close(parseExpr(params[i]), ctx.params, missing));
        if (ctx.strict && missing.n > 0) {
          this.issue(at, 'uses $' + String(missing.n) + ' but the reference passes fewer params');
        }
      } catch (error) {
        if (!(error instanceof ExprSyntaxError)) throw error;
        this.issue(at, 'bad expression: ' + error.message);
        closed.push({ t: 'num', v: 0 });
      }
    }
    return closed;
  }

  /**
   * Compiles a node list.
   *
   * @param nodes - The nodes.
   * @param ctx - Their context.
   * @param path - Issue path of the list.
   */
  private block(nodes: readonly PatternNode[], ctx: Ctx, path: string): void {
    for (let i = 0; i < nodes.length; i++) {
      this.node(nodes[i], ctx, path + '[' + String(i) + ']');
      if (this.out.length > MAX_PATTERN_CODE) {
        this.issue(path, 'the compiled patterns exceed ' + String(MAX_PATTERN_CODE) + ' numbers');
        return;
      }
    }
  }

  /**
   * Compiles a direction (`[dirType]` + later its expression).
   *
   * @param dir - The direction, or `undefined` (aimed, 0).
   * @returns Its type code and value expression.
   */
  private static direction(dir: PatternDirection | undefined): [number, PatternExpr] {
    const type = dir?.type ?? 'aim';
    return [(DIRECTION_TYPES as readonly string[]).indexOf(type), dir?.value ?? 0];
  }

  /**
   * A speed's type code and value expression.
   *
   * @param speed - The speed.
   * @returns `[type, value]`.
   */
  private static speed(speed: PatternSpeed): [number, PatternExpr] {
    if (typeof speed === 'object') {
      return [(SPEED_TYPES as readonly string[]).indexOf(speed.type ?? 'absolute'), speed.value];
    }
    return [SpeedType.Absolute, speed];
  }

  /**
   * Compiles one node.
   *
   * @param node - The node.
   * @param ctx - Its context.
   * @param path - Its issue path.
   */
  private node(node: PatternNode, ctx: Ctx, path: string): void {
    const out = this.out;
    switch (node.op) {
      case 'fire':
        this.fire(node, ctx, path);
        return;
      case 'wait':
        out.push(PatternOp.Wait, node.ranked === true ? 1 : 0);
        this.expr(node.ticks, ctx, path + '.ticks');
        return;
      case 'repeat': {
        if (ctx.depth >= MAX_REPEAT_DEPTH) {
          this.issue(path, 'repeat nests deeper than ' + String(MAX_REPEAT_DEPTH));
          return;
        }
        out.push(PatternOp.Repeat, 0);
        const exitAt = out.length - 1;
        this.expr(node.times, ctx, path + '.times');
        const body = out.length;
        this.block(node.body, { ...ctx, depth: ctx.depth + 1 }, path + '.body');
        out.push(PatternOp.Loop, body);
        out[exitAt] = out.length;
        return;
      }
      case 'changeSpeed': {
        const [type, value] = PatternCompiler.speed(node.speed);
        out.push(PatternOp.ChangeSpeed, type);
        this.expr(value, ctx, path + '.speed');
        this.expr(node.term ?? 0, ctx, path + '.term');
        return;
      }
      case 'changeDirection': {
        const [type, value] = PatternCompiler.direction(node.direction);
        out.push(PatternOp.ChangeDirection, type);
        this.expr(value, ctx, path + '.direction.value');
        this.expr(node.term ?? 0, ctx, path + '.term');
        return;
      }
      case 'accel': {
        const flags =
          (node.min === undefined ? 0 : ACCEL_HAS_MIN) |
          (node.max === undefined ? 0 : ACCEL_HAS_MAX);
        out.push(PatternOp.Accel, flags);
        this.expr(node.accel, ctx, path + '.accel');
        this.expr(node.min ?? 0, ctx, path + '.min');
        this.expr(node.max ?? 0, ctx, path + '.max');
        this.expr(node.term ?? 0, ctx, path + '.term');
        return;
      }
      case 'vanish':
        out.push(PatternOp.Vanish);
        return;
      case 'actionRef': {
        const action = this.actions.get(node.action);
        if (action === undefined) {
          this.issue(path + '.action', 'unknown pattern action id "' + node.action + '"');
          return;
        }
        if (ctx.stack.indexOf(node.action) >= 0) {
          this.issue(path + '.action', 'recursive actionRef "' + node.action + '"');
          return;
        }
        // Params are values: a constant is substituted, anything else is evaluated here, once per
        // run of the reference, into a local the inlined body reads (a local of an enclosing
        // reference already is one).
        const closed = this.closeParams(node.params ?? [], ctx, path + '.params');
        const params: Ast[] = [];
        let locals = ctx.locals;
        for (let i = 0; i < closed.length; i++) {
          const p = closed[i];
          if (p.t === 'num' || p.t === 'local') {
            params.push(p);
          } else if (locals >= MAX_PATTERN_LOCALS) {
            this.issue(
              path + '.params',
              'more than ' + String(MAX_PATTERN_LOCALS) + ' param values held at once',
            );
            params.push({ t: 'num', v: 0 });
          } else {
            out.push(PatternOp.SetLocal, locals);
            this.emit(p, path + '.params[' + String(i) + ']');
            params.push({ t: 'local', slot: locals });
            locals++;
          }
        }
        this.block(
          action.body,
          { params, depth: ctx.depth, stack: [...ctx.stack, node.action], strict: true, locals },
          action.path,
        );
        return;
      }
    }
  }

  /**
   * Compiles a `fire` node: resolves the bullet (inline or named), the direction and speed
   * (the fire's, else the bullet's, else the defaults) and queues the bullet's program.
   *
   * @param node - The node.
   * @param ctx - Its context.
   * @param path - Its issue path.
   */
  private fire(node: Extract<PatternNode, { op: 'fire' }>, ctx: Ctx, path: string): void {
    const out = this.out;
    let spec: PatternBulletSpec = {};
    // The bullet's direction / speed are evaluated by this fire (`specCtx`), its program by the
    // bullet's own runner (`programCtx`); `args` carries the param values from one to the other.
    let specCtx = ctx;
    let programCtx = ctx;
    let args: Ast[] = [];
    let specPath = path + '.bullet';
    let shareable = true;
    if (node.bullet !== undefined && node.bulletRef !== undefined) {
      this.issue(path, 'give either bullet or bulletRef, not both');
    }
    if (node.bulletRef !== undefined) {
      const named = this.bullets.get(node.bulletRef);
      const key = 'bullet:' + node.bulletRef;
      const params =
        named === undefined ? [] : this.closeParams(node.params ?? [], ctx, path + '.params');
      if (named === undefined) {
        this.issue(path + '.bulletRef', 'unknown pattern bullet id "' + node.bulletRef + '"');
      } else if (params.length > 0 && ctx.stack.indexOf(key) >= 0) {
        // Without params a bullet's program is shared, so a bullet may fire itself (the pool
        // bounds it); with params every reference compiles a copy, which must not recurse.
        this.issue(path + '.bulletRef', 'recursive bulletRef "' + node.bulletRef + '" with params');
      } else {
        spec = named.spec;
        specPath = named.path;
        shareable = params.length === 0;
        const stack = shareable ? [key] : [...ctx.stack, key];
        const bound = PatternCompiler.bind(params);
        args = bound.args;
        specCtx = { params: bound.atFire, depth: 0, stack, strict: true, locals: ctx.locals };
        programCtx = {
          params: bound.inProgram,
          depth: 0,
          stack,
          strict: true,
          locals: args.length,
        };
      }
    } else if (node.bullet !== undefined) {
      spec = node.bullet;
      // An inline bullet sees the enclosing params: its program is compiled per fire site and
      // gets their values from this fire (constants stay substituted).
      shareable = ctx.params === null || ctx.params.length === 0;
      let inProgram = ctx.params;
      if (ctx.params !== null && spec.actions !== undefined && spec.actions.length > 0) {
        const bound = PatternCompiler.bind(ctx.params);
        args = bound.args;
        inProgram = bound.inProgram;
      }
      programCtx = {
        params: inProgram,
        depth: 0,
        stack: ctx.stack,
        strict: ctx.strict,
        locals: args.length,
      };
    }
    // `params` go with a `bulletRef` only (an inline bullet would silently drop them).
    if (node.params !== undefined && node.bulletRef === undefined) {
      this.issue(path + '.params', 'params need a bulletRef');
    }
    const kind = BULLET_KIND_NAMES.indexOf(spec.kind ?? DEFAULT_PATTERN_KIND);
    const fireDir = node.direction !== undefined;
    const [dirType, dirValue] = PatternCompiler.direction(
      fireDir ? node.direction : spec.direction,
    );
    const fireSpeed = node.speed !== undefined;
    const speed = fireSpeed ? node.speed : spec.speed;
    const [speedType, speedValue] =
      speed === undefined
        ? [SpeedType.Absolute, DEFAULT_PATTERN_SPEED]
        : PatternCompiler.speed(speed);
    out.push(PatternOp.Fire, dirType, speedType, kind < 0 ? 0 : kind, 0, args.length);
    const entryAt = out.length - 2;
    for (let k = 0; k < args.length; k++) this.emit(args[k], path + '.params');
    this.expr(dirValue, fireDir ? ctx : specCtx, fireDir ? path + '.direction' : specPath);
    this.expr(speedValue, fireSpeed ? ctx : specCtx, fireSpeed ? path + '.speed' : specPath);
    const actions = spec.actions;
    if (actions === undefined || actions.length === 0) return;
    const shared = !shareable ? null : programCtx.strict ? this.sharedStrict : this.sharedLoose;
    const job = shared === null ? undefined : shared.get(spec);
    if (job !== undefined) {
      this.links.push(job);
      // Compiled (or being compiled) already: link at once; else when its turn comes.
      if (job.entry > 0) out[entryAt] = job.entry;
      else job.patches.push(entryAt);
      return;
    }
    const fresh: BulletJob = {
      actions,
      ctx: programCtx,
      path: specPath + '.actions',
      patches: [entryAt],
      entry: 0,
      failed: false,
      links: [],
    };
    this.jobs.push(fresh);
    this.links.push(fresh);
    if (shared !== null) shared.set(spec, fresh);
  }
}

/**
 * Compiles the collected `patterns` files into one {@link PatternBank} (load time; allocates
 * freely).
 *
 * @remarks
 * Every action is compiled as a program of its own (entry in {@link PatternBank.entries}, in
 * registration order — files by path, then document order); `actionRef` / `bulletRef` are inlined
 * with their params as values (constants folded in, others held in runner locals), each bullet
 * with `actions` gets a program. Reported: duplicate ids, unknown or recursive references, both
 * `bullet` and `bulletRef` in one fire, `params` without a `bulletRef`, `$n` beyond a reference's
 * params, more than {@link MAX_PATTERN_LOCALS} param values live at once, bad expressions,
 * `repeat` deeper than {@link MAX_REPEAT_DEPTH}, expressions deeper than {@link MAX_EXPR_STACK}, a
 * bank larger than {@link MAX_PATTERN_CODE}. An action with issues — its own, those of an action
 * it inlines, or those of a bullet program it launches — gets entry 0 (it runs nothing).
 *
 * @param files - The files, in path order.
 * @param issues - Collector (paths `<file>:actions[i].body[j]…`).
 * @returns The bank.
 *
 * @example
 * ```ts
 * const bank = compilePatternBank([{ path: 'patterns/a.patterns.json', file }], issues);
 * bank.entries[bank.actionIndex.get('fan-3') ?? -1]; // → the program's code offset
 * ```
 */
export function compilePatternBank(
  files: readonly CollectedPatterns[],
  issues: ValidationIssue[],
): PatternBank {
  const compiler = new PatternCompiler(issues);
  compiler.register(files);
  const ids = compiler.actionIds();
  const entries = new Int32Array(ids.length);
  const actionIndex = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    actionIndex.set(ids[i], i);
    entries[i] = compiler.compileAction(ids[i]);
  }
  const tooLarge = compiler.out.length > MAX_PATTERN_CODE;
  if (tooLarge) entries.fill(0);
  return Object.freeze({
    code: tooLarge ? new Float64Array(1) : Float64Array.from(compiler.out),
    actions: Object.freeze(ids),
    actionIndex,
    entries,
    bullets: Object.freeze(compiler.bulletIds()),
  });
}
