/**
 * Estimates, per zone, how many enemy and boss-part **hurtboxes outgrow their art** once R2-02
 * ports them ×1.5 (odd half-extents rounded up, w5-precheck's O4 rounding): one line per zone
 * with the boxes measured, how many exceed the **v1** frame (the raw generator output, art scale
 * 1) and how many exceed the **interim ×1.5** frame of today's `buildAtlas()` (and how many of
 * those by at most 1 px).
 *
 * **Run** (from the repository root, after `pnpm install`; read-only, ≈ 2 s):
 *
 * ```bash
 * node docs/v2-run/helpers/w5pre/hurtbox.mjs           # this checkout
 * node docs/v2-run/helpers/w5pre/hurtbox.mjs <root>    # another checkout (with node_modules)
 * ```
 *
 * It reads `content/enemies/zone-*.enemies.json` and builds the atlas twice in memory through
 * `<root>/scripts/assets/pipeline.mjs` (nothing is written). On v1 content (until R2-02's port) it
 * gave: over the ×1.5 frame F 6, G 7, H 6, I 1 (all by ≤ 1 px) and zone A 5.
 *
 * **Used by** R2-02 prep subtask **T4c** (the B/C, D/E and F/G hurtbox-inside-art helpers measure
 * the `buildAtlas()` frames, and W5-3's 1-px allowance covers the rounded boxes this lists).
 *
 * **Delete** when T4c is on master (at the latest with R2-02's port commit S: on ported content
 * the estimate is moot). Was scratchpad `w5pre/hurtbox.mjs`.
 *
 * @module
 */
/* global process, console, URL */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../../../../', import.meta.url)));
const { buildAtlas } = await import(pathToFileURL(join(root, 'scripts/assets/pipeline.mjs')).href);
const v1 = buildAtlas({ artScale: 1 }).manifest;
const v2 = buildAtlas().manifest;

/**
 * The size of a sprite's first frame in an atlas manifest.
 *
 * @param {any} m - The manifest.
 * @param {string} s - The sprite name.
 * @returns {[number, number] | null} `[w, h]`, or `null` when the atlas has no such sprite.
 */
const size = (m, s) => {
  const f = m.frames[m.sprites[s]?.frames[0] ?? ''];
  return f ? [f.w, f.h] : null;
};

/**
 * A half-extent after the port: ×1.5, rounded up when not whole.
 *
 * @param {number} v - The v1 half-extent.
 * @returns {number} The ported one.
 */
const port = (v) => {
  const x = v * 1.5;
  return Number.isInteger(x) ? x : Math.ceil(x);
};

for (const z of [
  'zone-a',
  'zone-b',
  'zone-c',
  'zone-d',
  'zone-e',
  'zone-f',
  'zone-g',
  'zone-h',
  'zone-i',
]) {
  const { enemies } = JSON.parse(
    readFileSync(join(root, `content/enemies/${z}.enemies.json`), 'utf8'),
  );
  let n = 0;
  let overV1 = 0;
  let overV2 = 0;
  let overV2by1 = 0;
  for (const e of enemies) {
    const all = [];
    if (e.hurtbox && e.sprite) all.push([e.sprite, e.hurtbox.hw, e.hurtbox.hh]);
    for (const p of e.boss?.parts ?? []) {
      if (p.hurtbox && p.sprite) all.push([p.sprite, p.hurtbox.hw, p.hurtbox.hh]);
      if (p.radius !== undefined && p.sprite) all.push([p.sprite, p.radius, p.radius]);
    }
    for (const [s, hw, hh] of all) {
      const a = size(v1, s);
      const b = size(v2, s);
      if (!a || !b) continue;
      n++;
      const W = 2 * port(hw);
      const H = 2 * port(hh);
      if (W > a[0] || H > a[1]) overV1++;
      if (W > b[0] || H > b[1]) {
        overV2++;
        if (W - b[0] <= 1 && H - b[1] <= 1) overV2by1++;
      }
    }
  }
  console.log(
    z,
    'boxes',
    n,
    'over v1 frame',
    overV1,
    'over x1.5 frame',
    overV2,
    `(by <=1px: ${overV2by1})`,
  );
}
