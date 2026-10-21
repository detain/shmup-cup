/**
 * The pin writer of the fingerprint tests (plan_resolution.md R5-P.P10).
 *
 * The three fingerprint tests — `test/integration/presentation-fingerprint.test.ts`,
 * `test/integration/content-db-fingerprint.test.ts` and `packages/shell/test/frame-fingerprint.test.ts` —
 * compare what the engine draws against a `PINNED` table and re-pin today by printing that table
 * (`SHMUP_FINGERPRINT_PRINT=1`) and pasting it by hand. P10 gives them a write mode: with
 * `SHMUP_FINGERPRINT_UPDATE=1` the test rewrites its own pin in place, the way
 * `SHMUP_ATLAS_GROUPS_UPDATE=1` rewrites `assets/source/atlas-groups.json` — two agents then never
 * merge fingerprint hashes by hand.
 *
 * **How it rewrites.** {@link rewritePinned} parses the test file with the TypeScript compiler (as
 * {@link frame-literal-scan} parses sources), finds the `const PINNED` object literal and the
 * entry named in the call, and replaces that entry's value — or the whole `PINNED` literal when
 * the name is `PINNED` — with the formatted table. The formatting is the one `print()` prints,
 * with the quoting Prettier's default `quoteProps: 'as-needed'` leaves on the committed tables
 * (identifier keys bare, everything else single-quoted), so a rewritten file is Prettier-clean and
 * an update run over unchanged pins writes nothing at all.
 *
 * **CI guard.** A CI run never rewrites pins: {@link rewritePinned} throws while `process.env.CI`
 * is set, whatever else its environment says.
 *
 * Shared like `alloc.ts` and `frame-literal-scan.ts`: the integration and shell tests import this
 * file by relative path.
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

/** The value of one `PINNED` entry: a table of digests, or one digest line (the shell's form). */
export type PinnedValue = Record<string, string> | string;

/**
 * Replaces a `PINNED` entry in a test file's source text.
 *
 * @param file - The test file to rewrite (pass `fileURLToPath(import.meta.url)`).
 * @param name - The entry to replace, or `'PINNED'` for the whole constant.
 * @param table - The new value: a `Record<string, string>` for a walk's table, a plain string for
 *   one pinned line (the shell's entries).
 * @returns Whether the file was written — `false` when the text already matched, byte for byte
 *   (the common case in an update run over a sim that did not move).
 * @throws When `process.env.CI` is set (a CI run never rewrites pins), when the file holds no
 *   `const PINNED` object literal, or when the named entry is not in it.
 */
export function rewritePinned(file: string, name: string, table: PinnedValue): boolean {
  if (process.env.CI) {
    throw new Error(`rewritePinned: CI is set — a CI run never rewrites pins (${file})`);
  }
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const pinned = findPinnedLiteral(source);
  if (name === 'PINNED') {
    if (typeof table === 'string') {
      throw new Error("rewritePinned: the whole 'PINNED' constant needs a table, not a string");
    }
    return replace(text, file, pinned.getStart(source), pinned.getEnd(), formatConstant(table));
  }
  for (const prop of pinned.properties) {
    if (entryKey(prop) !== name) continue;
    if (!ts.isPropertyAssignment(prop)) {
      throw new Error(`rewritePinned: entry '${name}' in ${file} is not a key: value property`);
    }
    const value = prop.initializer;
    return replace(text, file, value.getStart(source), value.getEnd(), formatValue(table));
  }
  throw new Error(`rewritePinned: no entry '${name}' in ${file}`);
}

/**
 * Finds the `const PINNED` object literal of a parsed test file.
 *
 * @param source - The parsed file.
 * @returns The initializer node.
 * @throws When there is no such declaration (or it is not an object literal).
 */
function findPinnedLiteral(source: ts.SourceFile): ts.ObjectLiteralExpression {
  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === 'PINNED' &&
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          found = decl.initializer;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) {
    throw new Error(`rewritePinned: no 'const PINNED' object literal in ${source.fileName}`);
  }
  return found;
}

/**
 * The key of one entry of an object literal, quotes stripped.
 *
 * @param prop - The entry node.
 * @returns Its key text, or `undefined` for a spread or method.
 */
function entryKey(prop: ts.ObjectLiteralElementLike): string | undefined {
  if (!('name' in prop) || !prop.name) return undefined;
  const raw = prop.name.getText();
  if (raw.length >= 2 && (raw[0] === "'" || raw[0] === '"')) return raw.slice(1, -1);
  return raw;
}

/**
 * Writes the replaced text unless nothing moved.
 *
 * @param text - The file's current text.
 * @param file - The file (for the error text).
 * @param start - The first replaced offset.
 * @param end - The offset just past the last replaced one.
 * @param replacement - The formatted value.
 * @returns Whether the file was written.
 */
function replace(
  text: string,
  file: string,
  start: number,
  end: number,
  replacement: string,
): boolean {
  const next = text.slice(0, start) + replacement + text.slice(end);
  if (next === text) return false;
  try {
    writeFileSync(file, next);
  } catch (err) {
    throw new Error(`rewritePinned: cannot write ${file}`, { cause: err });
  }
  return true;
}

/**
 * Formats one entry's value the way the committed tables are formatted.
 *
 * @param table - The digests.
 * @returns The value text (without the trailing comma the entry keeps).
 */
function formatValue(table: PinnedValue): string {
  if (typeof table === 'string') return `'${table}'`;
  const rows = Object.keys(table);
  if (rows.length === 0) return '{}';
  const lines = rows.map((key) => `    ${formatKey(key)}: '${table[key]}',`);
  return `{\n${lines.join('\n')}\n  }`;
}

/**
 * Formats the whole `PINNED` constant (tables of entries over one-line entries alike).
 *
 * @param table - A map from entry name to its value.
 * @returns The object-literal text, braces included.
 */
function formatConstant(table: Record<string, PinnedValue>): string {
  const rows = Object.keys(table);
  if (rows.length === 0) return '{}';
  const lines = rows.map((key) => `  ${formatKey(key)}: ${formatValue(table[key])}`);
  return `{\n${lines.join(',\n')},\n}`;
}

/**
 * One key, quoted only where Prettier's `quoteProps: 'as-needed'` keeps the quotes.
 *
 * @param key - The entry key.
 * @returns The key text.
 */
function formatKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`;
}
