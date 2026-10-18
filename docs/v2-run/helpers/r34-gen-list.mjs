/**
 * Lists the sprites of **every procedural generator** and of the **pixel maps**, as
 * `## <generator> [<count>]: name(<frames>f <w>x<h>[ N][ F]), …` — `N` = drawn native (not
 * upscaled by the art scale), `F` = gets a hit-flash variant. Generators run with
 * `{ tileSize: 12, artScale: 1.5 }` (the options the pipeline passes at v2), and the sizes are
 * their own output — before the pipeline's ×artScale upscale of the non-native sprites; the pixel
 * maps are listed at their source size. Read-only.
 *
 * **Run** (from the repository root, after `pnpm install`; the root argument is optional and
 * defaults to this checkout):
 *
 * ```bash
 * node docs/v2-run/helpers/r34-gen-list.mjs [<root>]
 * ```
 *
 * **Used by** the R3-03 / R3-04 / R4 art and asset lanes (and their reviewers) to check a
 * generator's sprite list, frame counts, sizes and native / flash marks before and after a change;
 * the R3/R4 re-plan scout built its generator tables with it.
 *
 * **Delete** when R4 is on master (after R4-05). Was scratchpad `r34-gen-list.mjs` (it hard-coded
 * the scout's worktree).
 *
 * @module
 */
/* global process, console, URL */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../../../', import.meta.url)));
/**
 * Imports a module of the checkout's `scripts/assets/`.
 *
 * @param {string} rel - The path below `scripts/assets/`.
 * @returns {Promise<any>} The module.
 */
const load = (rel) => import(pathToFileURL(join(root, 'scripts/assets', rel)).href);
const { PROCEDURAL_GENERATORS } = await load('procedural/index.mjs');
const { loadSpriteSources } = await load('sprite-source.mjs');

for (const g of PROCEDURAL_GENERATORS) {
  const s = g.generate({ tileSize: 12, artScale: 1.5 });
  const names = s.map(
    (/** @type {any} */ x) =>
      `${x.name}(${x.frames.length}f ${x.frames[0].width}x${x.frames[0].height}${x.native ? ' N' : ''}${x.hitFlash ? ' F' : ''})`,
  );
  console.log(`## ${g.id} [${s.length}]: ${names.join(', ')}`);
}
const maps = loadSpriteSources(join(root, 'assets/source/sprites'), 'sprites');
console.log(
  `## pixel-maps [${maps.sprites.length}]: ` +
    maps.sprites
      .map(
        (/** @type {any} */ x) =>
          `${x.name}(${x.frames.length}f ${x.frames[0].width}x${x.frames[0].height}${x.hitFlash ? ' F' : ''})`,
      )
      .join(', '),
);
