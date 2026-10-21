/**
 * The bullet readability sheets (`scripts/bullet-readability.mjs`, plan R4-02.B1): the script
 * renders every stand-in zone's far layer and first band under 512 v2 bullets of each of the
 * four palettes. The sheets are generated art — they ride in a git-ignored folder, and this
 * test renders through the script's `--out` flag into a `mkdtemp` folder and **never** into
 * `assets/generated/` (the wave's rule).
 *
 * Checked: the run exits clean and writes the 9 × 4 sheets with their names; two runs are
 * byte-identical (the plan's acceptance: the sheets are deterministic); every sheet is a
 * FRAME_W × FRAME_H PNG through the repo's own decoder and carries every family's body colour
 * on top of the backdrop; and an unknown argument fails loudly.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FRAME_H, FRAME_W } from '../../scripts/frame.mjs';
import { decodePng } from '../../scripts/assets/png.mjs';
import { BULLET_COLORS } from '../../scripts/assets/procedural/bullets.mjs';
import { BULLET_PALETTES } from '../../scripts/assets/procedural/palettes.mjs';
import { color } from '../../scripts/assets/procedural/common.mjs';
import { ZONE_IDS } from '../../scripts/assets/standin.mjs';
import { sheetPath } from '../../scripts/bullet-readability.mjs';

/** The script under test (absolute: the run must not depend on the test's cwd). */
const SCRIPT = fileURLToPath(new URL('../../scripts/bullet-readability.mjs', import.meta.url));

/** The palette ids the sheets come in (standard first, then the colour-blind sets). */
const PALETTE_IDS = ['standard', ...Object.keys(BULLET_PALETTES)];

/**
 * Runs the script into its own temp folder.
 *
 * @returns `{ status, outDir, stderr }` of the spawn.
 */
function runSheets(): { status: number | null; outDir: string; stderr: string } {
  const outDir = mkdtempSync(join(tmpdir(), 'bullet-readability-'));
  const run = spawnSync(process.execPath, [SCRIPT, '--out', outDir], {
    encoding: 'utf8',
    timeout: 300_000,
  });
  return { status: run.status, outDir, stderr: run.stderr };
}

/**
 * The sha256 of every file of a folder, keyed by name.
 *
 * @param dir - The folder.
 * @returns `name → digest`.
 */
function digests(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort())
    out[name] = createHash('sha256')
      .update(readFileSync(join(dir, name)))
      .digest('hex');
  return out;
}

/**
 * The `r,g,b` key of a colour family's body band (the body of a bullet palette is its family
 * colour — `bullets.mjs` `bulletSprites`; read off the table, never pasted).
 *
 * @param hex - The family body colour (`#rrggbb`).
 * @returns The `r,g,b` key.
 */
function bodyKey(hex: string): string {
  const rgba = color(hex);
  return `${rgba[0]},${rgba[1]},${rgba[2]}`;
}

describe('scripts/bullet-readability.mjs (R4-02.B1)', () => {
  it('renders one sheet per zone and palette', { timeout: 300_000 }, () => {
    const { status, outDir, stderr } = runSheets();
    expect(stderr, 'script stderr').toBe('');
    expect(status).toBe(0);
    const expected = ZONE_IDS.flatMap((zoneId) =>
      PALETTE_IDS.map((paletteId) => sheetPath(zoneId, paletteId)),
    ).sort();
    expect(readdirSync(outDir).sort()).toEqual(expected);
  });

  it('is deterministic: two runs are byte-identical', { timeout: 300_000 }, () => {
    const first = runSheets();
    const second = runSheets();
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(digests(second.outDir)).toEqual(digests(first.outDir));
  });

  it('draws a full-frame PNG carrying every family over the backdrop', { timeout: 300_000 }, () => {
    const { status, outDir } = runSheets();
    expect(status).toBe(0);
    const image = decodePng(readFileSync(join(outDir, sheetPath('a', 'standard'))));
    expect([image.width, image.height]).toEqual([FRAME_W, FRAME_H]);
    // Every family's body colour sits on the sheet (the 512-bullet load really composited),
    // and the sheet is opaque everywhere (the stand-in far layer fills the frame).
    const bodies = new Set(Object.values(BULLET_COLORS).map((hex) => bodyKey(hex)));
    const seen = new Set<string>();
    let opaque = 0;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const at = (y * image.width + x) * 4;
        if (image.data[at + 3] === 255) opaque++;
        const key = `${image.data[at]},${image.data[at + 1]},${image.data[at + 2]}`;
        if (bodies.has(key)) seen.add(key);
      }
    }
    expect(seen.size, 'every bullet family visible').toBe(bodies.size);
    expect(opaque).toBe(image.width * image.height);
  });

  it('fails loudly on an unknown argument', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'bullet-readability-args-'));
    const run = spawnSync(process.execPath, [SCRIPT, '--nope', outDir], { encoding: 'utf8' });
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}${run.stdout}`).toMatch(/unknown argument/);
  });
});
