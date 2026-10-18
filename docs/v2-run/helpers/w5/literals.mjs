/**
 * Lists every **numeric literal** of core's simulation modules with its line, as
 * `<module>:<line> <literal> | <the line's text>` under one `== <module>: <count>` header per
 * module — the raw material of R2-02's audit of world values written inline (which must become
 * `v1 * WORLD_SCALE`). It parses with the TypeScript compiler, so comments are never read.
 * Skipped: `0` and `1`, `yield` arguments (sleep ticks), enum members and index accesses.
 *
 * **Run** (from the repository root):
 *
 * ```bash
 * node docs/v2-run/helpers/w5/literals.mjs                       # the default module list
 * node docs/v2-run/helpers/w5/literals.mjs bosses/index.ts       # some modules only
 * node docs/v2-run/helpers/w5/literals.mjs --root "$V1"          # another tree (a git archive)
 * ```
 *
 * Module paths are relative to `packages/core/src/`. TypeScript comes from this checkout; the
 * sources from `--root` (default: this checkout). `literals.txt` next to this file is the output
 * of the default list at **`bc8e05d`**. (The wave-5 scout's copy, made at `8d89dd2`, holds the
 * same literals in every module; only `data/index.ts`' line numbers moved, by 0–2.)
 *
 * **Used by** R2-02 prep subtasks **W1–W7** (the inline world literals of the sim modules: e.g.
 * `HUNTER_EDGE`, the ram row clamp, `-self.hh - 4`, the chain spread, `CRAWL_STEP`) and their
 * reviewers; A1's audit may cite it.
 *
 * **Delete** when W1–W7 are on master (at the latest with R2-02's port commit S). Was scratchpad
 * `w5/literals.mjs` (it hard-coded the root).
 *
 * @module
 */
/* global process, console, URL */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The checkout that holds this helper: its `node_modules` give TypeScript. */
const CHECKOUT = fileURLToPath(new URL('../../../../', import.meta.url));

/** The modules `literals.txt` lists, in its order. */
const DEFAULT_MODULES = [
  'behaviors/index.ts',
  'bosses/index.ts',
  'enemies/index.ts',
  'bullets/index.ts',
  'weapons/index.ts',
  'powerups/index.ts',
  'options/index.ts',
  'shields/index.ts',
  'player/index.ts',
  'stage/index.ts',
  'stage/systems.ts',
  'stage/bonus.ts',
  'blackhole/index.ts',
  'world/index.ts',
  'collision/index.ts',
  'patterns/index.ts',
  'patterns/dsl.ts',
  'data/index.ts',
];

const args = process.argv.slice(2);
let root = CHECKOUT;
const at = args.indexOf('--root');
if (at >= 0) {
  root = resolve(args[at + 1] ?? '.');
  args.splice(at, 2);
}
const mods = args.length > 0 ? args : DEFAULT_MODULES;
const ts = createRequire(join(CHECKOUT, 'package.json'))('typescript');

for (const f of mods) {
  const path = join(root, 'packages/core/src', f);
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.ES2018, true);
  const out = [];
  /**
   * Collects the numeric literals below `node`.
   *
   * @param {import('typescript').Node} node - The node to walk.
   */
  const visit = (node) => {
    if (ts.isNumericLiteral(node)) {
      const v = Number(node.text);
      const p = node.parent;
      let skip = v === 0 || v === 1;
      if (ts.isYieldExpression(p)) skip = true;
      if (ts.isPrefixUnaryExpression(p) && ts.isYieldExpression(p.parent)) skip = true;
      if (ts.isEnumMember(p)) skip = true;
      if (ts.isElementAccessExpression(p)) skip = true;
      if (!skip) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        out.push(`${f}:${line + 1} ${node.text} | ${lines[line].trim().slice(0, 110)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  console.log(`== ${f}: ${out.length}`);
  console.log(out.join('\n'));
}
