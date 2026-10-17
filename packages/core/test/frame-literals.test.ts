/**
 * No literal frame numbers in `@shmup/core` (plan_resolution.md R1-01).
 *
 * R1-01 derives every frame-dependent number in core from a few constants (`FRAME_W`, `FRAME_H`,
 * `HUD_BAR_HEIGHT`, `TILE_SIZE`, the font metrics) so that R2-01's flip to 640×360 is a change
 * of those constants alone. This file keeps it that way: it parses every `packages/core/src/**`
 * `.ts` file with the TypeScript compiler, so comments (docblocks included) are never read, and
 * fails on any numeric literal — or whole number inside a string or template literal — that is
 * a frame number, unless an entry of {@link ALLOWED} names it, with the reason it is not the
 * frame.
 *
 * The frame numbers are the v1 frame's `384` (`FRAME_W`), `216` (`FRAME_H`), `200`
 * (`PLAYFIELD_H`), `208` (`HUD_BOTTOM_Y`) — the four the plan names — and its centre, `192`
 * (`FRAME_CX`, the scenes' old `CX`) and `108` (`FRAME_CY`), plus whatever those six constants
 * are *now*: once R2-01 sets 640×360, a new literal `640` or `360` is caught too, and the v1
 * numbers stay banned. `100` (`PLAYFIELD_CY`) is left out on purpose — percentages, tick counts
 * and scores use it everywhere, and its two frame uses (`DEFAULT_BOSS_Y`, `CREDITS_STOP_Y`)
 * already derive from the constants.
 *
 * An entry is matched by file, **symbol path** (the names of the declarations around the
 * literal, outermost first: `OPTIONS_PANEL.h`, `bossSuction.pullRadius`) and value, never by line
 * number, so edits elsewhere in a file do not break it. Each entry states how many literals it
 * covers; the test fails when a symbol holds more (a new frame number crept in beside an allowed
 * one) or fewer — down to none — so the list cannot rot.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { FRAME_CX, FRAME_CY, FRAME_H, FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_H } from '../src/index.js';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** The v1 (384×216) frame numbers: width, height, playfield height, bottom HUD bar, centre. */
const V1_FRAME_NUMBERS: readonly number[] = [384, 216, 200, 208, 192, 108];

/** Every number the scan rejects: the v1 frame's and the current frame's. */
const FRAME_NUMBERS: ReadonlySet<number> = new Set([
  ...V1_FRAME_NUMBERS,
  FRAME_W,
  FRAME_H,
  PLAYFIELD_H,
  HUD_BOTTOM_Y,
  FRAME_CX,
  FRAME_CY,
]);

/** One literal of a frame number in core's source. */
interface FrameLiteral {
  /** File, relative to `packages/core/src/`. */
  readonly file: string;
  /** The names of the declarations around it, outermost first, `.`-joined. */
  readonly symbol: string;
  /** Its value. */
  readonly value: number;
  /** 1-based line (for the failure message only — entries never match on it). */
  readonly line: number;
}

/** A frame-number literal that is allowed, and why. */
interface Allowed {
  /** File, relative to `packages/core/src/`. */
  readonly file: string;
  /** Symbol path of the literal (see {@link FrameLiteral.symbol}). */
  readonly symbol: string;
  /** Its value. */
  readonly value: number;
  /** How many literals of `value` the symbol holds (default 1). */
  readonly count?: number;
  /** Why it is not the frame. */
  readonly reason: string;
}

/**
 * Every frame-number literal core may keep. Add an entry only for a literal that does not mean
 * the frame (a count, an angle, a character cap, a world distance, a content-sized panel …);
 * a literal that does mean it derives from the `config` constants instead.
 */
const ALLOWED: readonly Allowed[] = [
  // The frame itself: the only place its size is written down.
  {
    file: 'config/index.ts',
    symbol: 'FRAME_W',
    value: FRAME_W,
    reason: 'the definition of the frame width every other frame number derives from',
  },
  {
    file: 'config/index.ts',
    symbol: 'FRAME_H',
    value: FRAME_H,
    reason: 'the definition of the frame height every other frame number derives from',
  },
  // Counts.
  {
    file: 'scenes/index.ts',
    symbol: 'UI_COMMANDS',
    value: 384,
    reason: 'a count: the UI draw list holds 384 commands (M2-10, the zone map graph)',
  },
  {
    file: 'weapons/index.ts',
    symbol: 'SHOT_BATCH_CAPACITY',
    value: 192,
    reason: "a count: the PlayerShots sprite batch's capacity (shots + extra laser segments)",
  },
  {
    file: 'data/index.ts',
    symbol: 'DEMO_FILE_SCHEMA.description.maxLength',
    value: 200,
    reason: "a character cap: an attract demo's description is at most 200 characters",
  },
  // Angles (binary units: 1024 = one turn, so 384 = 135°).
  {
    file: 'weapons/index.ts',
    symbol: 'WEAPON_BEHAVIOR_PARAMS.missile.twoWayBack.angle',
    value: 384,
    reason: "an angle: the back missile's heading, 135° in binary angle units",
  },
  {
    file: 'weapons/index.ts',
    symbol: 'WEAPON_BEHAVIOR_PARAMS.shot.backDouble.angle',
    value: 384,
    reason: "an angle: the back double shot's heading, 135° in binary angle units",
  },
  {
    file: 'weapons/index.ts',
    symbol: 'DIRECTION_HEADINGS',
    value: 384,
    reason: "an angle: the Free Way's down-left heading, 135° in binary angle units",
  },
  {
    file: 'math/trig-table.ts',
    symbol: 'ATAN_TABLE',
    value: 108,
    count: 3,
    reason: 'angles: the generated arctangent table (gen-trig-tables.mjs; its test diffs it)',
  },
  // World values (R2-02 scales them ×1.5 with the content; plan §2.6).
  {
    file: 'behaviors/index.ts',
    symbol: 'bossSuction.pullRadius',
    value: 200,
    reason: "a world radius: boss.suction's pull field (plan §2.6 — not PLAYFIELD_H)",
  },
  // Panels and columns sized by their 6×8 text, not by the frame: they stay centred on
  // FRAME_CX / FRAME_CY (or anchored to an edge) at any frame size; R4-03 resizes them for the
  // new font (≈ 9×12), and R2-01 checks them at 640×360.
  {
    file: 'scenes/index.ts',
    symbol: 'OPTIONS_PANEL.h',
    value: 192,
    reason: 'a content-sized panel: a 26-px title band + eleven 14-px menu rows (M2-09)',
  },
  {
    file: 'scenes/index.ts',
    symbol: 'ZONE_TALLY_PANEL.w',
    value: 200,
    reason: "a content-sized panel: sized by the zone tally's rows of 6×8 text",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'SHIP_PANEL.w',
    value: 208,
    reason: "a content-sized panel: sized by the ship select's names and hint lines of 6×8 text",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'WEAPON_PANEL.h',
    value: 192,
    reason: "a content-sized panel: the weapon select's menu rows (R2-01 decides if it grows)",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'ORDER_PANEL.h',
    value: 192,
    reason: "a content-sized panel: the order editor's rows, as tall as the weapon panel",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'HI_SCORE_PANEL.h',
    value: 200,
    reason: 'a content-sized panel: a 54-px header + HI_SCORE_TABLE_SIZE (10) rows of 14 px',
  },
  {
    file: 'scenes/index.ts',
    symbol: 'HiScoreScene.drawUi.rankX',
    value: 108,
    reason: "a text column: the rank column's offset left of FRAME_CX (18 glyphs), not the centre",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'INVASION_BLASTS',
    value: 108,
    reason: "scene art: one blast's x in the story's invasion vignette (R4-05 redraws it)",
  },
];

/**
 * The name a declaration adds to a literal's symbol path.
 *
 * @param node - An ancestor of the literal.
 * @returns Its name, or `null` when it is not a named declaration.
 */
function nameOf(node: ts.Node): string | null {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (
    ts.isVariableDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isEnumMember(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isParameter(node)
  ) {
    const name = node.name;
    if (name === undefined) return null;
    if (
      ts.isIdentifier(name) ||
      ts.isStringLiteral(name) ||
      ts.isNumericLiteral(name) ||
      ts.isPrivateIdentifier(name)
    ) {
      return name.text;
    }
  }
  return null;
}

/**
 * The symbol path of a node: the names of the declarations around it, outermost first.
 *
 * @param node - A literal.
 * @returns The `.`-joined path, or `(top level)`.
 */
function symbolOf(node: ts.Node): string {
  const names: string[] = [];
  for (let n = node.parent; n !== undefined; n = n.parent) {
    const name = nameOf(n);
    if (name !== null) names.push(name);
  }
  return names.length === 0 ? '(top level)' : names.reverse().join('.');
}

/** Literal kinds whose text is read for whole numbers. */
const TEXT_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

/**
 * Every frame-number literal of a source text. Comments are never part of the syntax tree, so
 * a docblock that names a frame number is not a hit.
 *
 * @param file - The name reported for the hits.
 * @param text - TypeScript source.
 * @returns Its hits, in source order.
 */
function scan(file: string, text: string): FrameLiteral[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const hits: FrameLiteral[] = [];
  const add = (node: ts.Node, value: number): void => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    hits.push({ file, symbol: symbolOf(node), value, line });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (FRAME_NUMBERS.has(value)) add(node, value);
    } else if (TEXT_KINDS.has(node.kind)) {
      for (const digits of (node as ts.LiteralLikeNode).text.match(/(?<![\d.])\d+(?![\d.])/g) ??
        []) {
        const value = Number(digits);
        if (FRAME_NUMBERS.has(value)) add(node, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/**
 * Every `.ts` file under core's `src/`.
 *
 * @returns Paths relative to `src/`, sorted.
 */
function coreSources(): string[] {
  const out: string[] = [];
  const stack = [srcDir];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name.endsWith('.ts')) out.push(path.slice(srcDir.length + 1));
    }
  }
  return out.sort();
}

/**
 * The key an entry and a hit share.
 *
 * @param x - A hit or an entry.
 * @returns `file › symbol = value`.
 */
function keyOf(x: { file: string; symbol: string; value: number }): string {
  return `${x.file} › ${x.symbol} = ${x.value}`;
}

describe('core: no literal frame numbers (plan R1-01)', () => {
  const files = coreSources();
  const hits = files.flatMap((file) => scan(file, readFileSync(join(srcDir, file), 'utf8')));

  it('scans every core source file (and finds some)', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain('scenes/index.ts');
    expect(files).toContain('config/index.ts');
  });

  it('scans for the v1 frame numbers and the current ones', () => {
    expect([...FRAME_NUMBERS].slice(0, V1_FRAME_NUMBERS.length)).toEqual([
      384, 216, 200, 208, 192, 108,
    ]);
    for (const value of [FRAME_W, FRAME_H, PLAYFIELD_H, HUD_BOTTOM_Y, FRAME_CX, FRAME_CY]) {
      expect(FRAME_NUMBERS.has(value)).toBe(true);
    }
  });

  it('has no frame number outside the allow-list, and every entry still matches', () => {
    const found = new Map<string, FrameLiteral[]>();
    for (const hit of hits) {
      const key = keyOf(hit);
      const list = found.get(key);
      if (list === undefined) found.set(key, [hit]);
      else list.push(hit);
    }
    const problems: string[] = [];
    const allowed = new Set<string>();
    for (const entry of ALLOWED) {
      const key = keyOf(entry);
      allowed.add(key);
      const count = entry.count ?? 1;
      const got = found.get(key)?.length ?? 0;
      if (got !== count) {
        problems.push(`${key}: the allow-list expects ${count} literal(s), the source has ${got}`);
      }
    }
    for (const [key, list] of found) {
      if (allowed.has(key)) continue;
      for (const hit of list) {
        problems.push(`${key} (line ${hit.line}): a frame number — derive it from config`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps the allow-list well formed', () => {
    const keys = ALLOWED.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of ALLOWED) {
      expect(files, entry.file).toContain(entry.file);
      expect(FRAME_NUMBERS.has(entry.value), keyOf(entry)).toBe(true);
      expect(entry.reason.trim().length, keyOf(entry)).toBeGreaterThan(10);
    }
  });

  it('would catch one if it appeared — the scan is not vacuous', () => {
    const sample = [
      '// 384 in a line comment, 216 too',
      '/** 208 in a docblock. */',
      'export const PANEL = Object.freeze({ x: 4, w: 384 });',
      'export class Scene {',
      '  draw(list: { rect(...n: number[]): void }): void {',
      '    list.rect(0, 208, 384, 8, -200);',
      '  }',
      '}',
      "const label = 'row 216 of 2160';",
      'const hex = 0xc0;',
      'const fine = 3840 + 21.6 + 38.4;',
    ].join('\n');
    expect(scan('sample.ts', sample).map((h) => `${h.symbol}=${h.value}@${h.line}`)).toEqual([
      'PANEL.w=384@3',
      'Scene.draw=208@6',
      'Scene.draw=384@6',
      'Scene.draw=200@6',
      'label=216@9',
      'hex=192@10',
    ]);
  });
});
