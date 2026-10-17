/**
 * The frame-literal scanner of the literal scans (plan_resolution.md R1-01, R1-02).
 *
 * R1-01 derives every frame-dependent number from a few constants (`FRAME_W`, `FRAME_H`,
 * `HUD_BAR_HEIGHT`, `TILE_SIZE`, the font metrics) so that R2-01's flip to 640×360 is a change
 * of those constants alone. Two tests keep it that way with this scanner: core's own
 * `packages/core/test/frame-literals.test.ts` over `packages/core/src`, and the repo-wide
 * `test/integration/frame-literals-repo.test.ts` over the other packages, the apps and the root
 * scripts (R1-02). Other packages import this file by relative path, as they do the allocation
 * guard (`alloc.ts`).
 *
 * The scanner parses a source with the TypeScript compiler, so comments (docblocks included)
 * are never read, and reports every numeric literal — or whole number inside a string or
 * template literal — that is a frame number ({@link FRAME_NUMBERS}). Each hit carries its
 * **symbol path** (the names of the declarations around the literal, outermost first:
 * `OPTIONS_PANEL.h`, `bossSuction.pullRadius`); an allow-list entry is matched by file, symbol
 * path and value, never by line number, so edits elsewhere in a file do not break it. Each entry
 * states how many literals it covers; {@link frameLiteralProblems} reports a symbol that holds
 * more (a new frame number crept in beside an allowed one) or fewer — down to none — so a list
 * cannot rot.
 *
 * The frame numbers are the v1 frame's `384` (`FRAME_W`), `216` (`FRAME_H`), `200`
 * (`PLAYFIELD_H`), `208` (`HUD_BOTTOM_Y`) — the four the plan names — and its centre, `192`
 * (`FRAME_CX`, the scenes' old `CX`) and `108` (`FRAME_CY`), plus whatever `FRAME_W`, `FRAME_H`,
 * `PLAYFIELD_H` and `HUD_BOTTOM_Y` are *now*: once R2-01 sets 640×360, a new literal `640`,
 * `360`, `336` or `348` is caught too, and the v1 numbers stay banned. The new centre (`320`,
 * `180`) is not added: `180` is three seconds of ticks and half a turn (six timers today would
 * trip it), and `320` only one v1 boss-box edge. `100` (`PLAYFIELD_CY`) is left out for the same
 * reason — percentages, tick counts and scores use it everywhere, and its two frame uses
 * (`DEFAULT_BOSS_Y`, `CREDITS_STOP_Y`) already derive from the constants.
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';
import { FRAME_H, FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_H } from '../../src/config/index.js';

/** The v1 (384×216) frame numbers: width, height, playfield height, bottom HUD bar, centre. */
export const V1_FRAME_NUMBERS: readonly number[] = [384, 216, 200, 208, 192, 108];

/** The current frame's numbers (the same as v1's until R2-01). */
export const CURRENT_FRAME_NUMBERS: readonly number[] = [
  FRAME_W,
  FRAME_H,
  PLAYFIELD_H,
  HUD_BOTTOM_Y,
];

/** Every number the scan rejects: the v1 frame's and the current frame's, v1's first. */
export const FRAME_NUMBERS: ReadonlySet<number> = new Set([
  ...V1_FRAME_NUMBERS,
  ...CURRENT_FRAME_NUMBERS,
]);

/** One literal of a frame number in a source file. */
export interface FrameLiteral {
  /** File, relative to the scanned tree (as the caller names it). */
  readonly file: string;
  /** The names of the declarations around it, outermost first, `.`-joined. */
  readonly symbol: string;
  /** Its value. */
  readonly value: number;
  /** 1-based line (for the failure message only — entries never match on it). */
  readonly line: number;
}

/** A frame-number literal that is allowed, and why. */
export interface AllowedFrameLiteral {
  /** File, named as the scan names its hits. */
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
 * @param text - TypeScript or JavaScript source.
 * @param kind - How to parse it: `ts.ScriptKind.TS` (the default) or `ts.ScriptKind.JS` for the
 *   root scripts' `.mjs`.
 * @returns Its hits, in source order.
 */
export function scanFrameLiterals(
  file: string,
  text: string,
  kind: ts.ScriptKind = ts.ScriptKind.TS,
): FrameLiteral[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
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
 * Every file under a folder whose name passes a test, recursively.
 *
 * @param root - The folder to walk.
 * @param accept - Whether to keep a file, by its base name.
 * @returns Paths relative to `root`, `/`-separated, sorted.
 */
export function listSourceFiles(root: string, accept: (name: string) => boolean): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (accept(entry.name))
        out.push(
          path
            .slice(root.length + 1)
            .split(sep)
            .join('/'),
        );
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
export function frameLiteralKey(x: {
  readonly file: string;
  readonly symbol: string;
  readonly value: number;
}): string {
  return `${x.file} › ${x.symbol} = ${x.value}`;
}

/**
 * Compares a scan's hits with its allow-list.
 *
 * @param hits - Every hit of the scan.
 * @param allowed - The allow-list.
 * @param fix - What the message for an unlisted literal tells the reader to do.
 * @returns One line per problem — an entry whose symbol holds more or fewer literals than its
 *   `count` (none included: a stale entry), and every literal no entry names — or an empty
 *   array.
 */
export function frameLiteralProblems(
  hits: readonly FrameLiteral[],
  allowed: readonly AllowedFrameLiteral[],
  fix: string,
): string[] {
  const found = new Map<string, FrameLiteral[]>();
  for (const hit of hits) {
    const key = frameLiteralKey(hit);
    const list = found.get(key);
    if (list === undefined) found.set(key, [hit]);
    else list.push(hit);
  }
  const problems: string[] = [];
  const listed = new Set<string>();
  for (const entry of allowed) {
    const key = frameLiteralKey(entry);
    listed.add(key);
    const count = entry.count ?? 1;
    const got = found.get(key)?.length ?? 0;
    if (got !== count) {
      problems.push(`${key}: the allow-list expects ${count} literal(s), the source has ${got}`);
    }
  }
  for (const [key, list] of found) {
    if (listed.has(key)) continue;
    for (const hit of list) {
      problems.push(`${key} (line ${hit.line}): a frame number — ${fix}`);
    }
  }
  return problems;
}
