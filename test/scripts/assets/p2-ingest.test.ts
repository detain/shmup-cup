/**
 * R3-03.V2b — the ingest recipe's `p2` map reaches the atlas through the sidecar: the tool
 * writes it to the frame sidecar's `meta.shmup.p2` (`art-prompts/ingest/lib/pipeline.mjs`),
 * `scripts/assets/sprite-source.mjs`'s `readPngFrames` reads it back (R3-03.V2a) and
 * `collectSprites` draws the ship's `@p2` sibling with it — real art gets a player-2 variant
 * with no code, as the `@flash` hit-flash always did.
 *
 * This packs the ingest tool's committed ship fixture into a throwaway atlas:
 * - over **`ships/kestrel`** (a player ship, so a `@p2` is wanted): the sidecar's map replaces
 *   the code pixel-map's, so `@p2` is the art with every key colour exchanged, frame for
 *   frame, and everything unlisted — all alpha included — kept;
 * - over **`enemies/spinner`** (a `hitFlash` sprite): `@flash` is the white silhouette of the
 *   new art (RGB 255 wherever alpha > 0), proving the override feeds the sibling generators.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import { DEFAULT_SOURCE_DIR, buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { decodePng } from '../../../scripts/assets/png.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE_SPRITES = join(repo, 'art-prompts', 'ingest', 'test', 'fixtures', 'sprites');

const tmp = mkdtempSync(join(tmpdir(), 'shmup-p2-ingest-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const pad2 = (n: number) => n.toString(16).padStart(2, '0');

/** An RGB triple as the map's `"#rrggbb"`. */
const hexOf = (r: number, g: number, b: number) => `#${pad2(r)}${pad2(g)}${pad2(b)}`;

/** A `"#rrggbb"` as the atlas's `[r, g, b]`. */
const rgbOf = (hex: string) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

describe('R3-03.V2b — the sidecar p2 map reaches the atlas', () => {
  it("draws a real-art ship's @p2 from the sidecar map, and the @flash of an overridden sprite", () => {
    const src = join(tmp, 'atlas');
    cpSync(DEFAULT_SOURCE_DIR, src, { recursive: true });
    for (const target of ['ships/kestrel', 'enemies/spinner']) {
      for (const suffix of ['.png', '.json']) {
        cpSync(
          join(FIXTURE_SPRITES, 'ships', `fixture-ship${suffix}`),
          join(src, 'sprites', `${target}${suffix}`),
        );
      }
    }

    // The map the test expects is the fixture sidecar's — readPngFrames must carry it, not a
    // colour-swap heuristic, to the sibling generator.
    const sidecar = JSON.parse(
      readFileSync(join(FIXTURE_SPRITES, 'ships', 'fixture-ship.json'), 'utf8'),
    ) as { meta: { shmup: { p2: Record<string, string> } } };
    const map = sidecar.meta.shmup.p2;
    expect(Object.keys(map).length).toBeGreaterThan(0);
    const strip = decodePng(readFileSync(join(FIXTURE_SPRITES, 'ships', 'fixture-ship.png')));

    const { manifest, pages } = buildAtlas({ sourceDir: src });

    // The strip is 4 frames of 16×12; the override replaced both sprites' code frames.
    expect(manifest.sprites['ships/kestrel'].frames).toEqual(
      [0, 1, 2, 3].map((i) => `ships/kestrel#${i}`),
    );

    // Player 2: the sidecar's map, exchanged per pixel — not the old red ↔ blue swap (which
    // would have turned the #ff3050 accent into #5030ff; it is unlisted and must stay).
    const p2 = manifest.sprites['ships/kestrel@p2'];
    expect(p2).toBeDefined();
    expect(p2.frames).toEqual([0, 1, 2, 3].map((i) => `ships/kestrel@p2#${i}`));
    let changed = 0;
    for (let i = 0; i < 4; i++) {
      const frame = manifest.frames[`ships/kestrel@p2#${i}`];
      expect([frame.w, frame.h, frame.ax, frame.ay]).toEqual([16, 12, 8, 6]);
      for (let y = 0; y < frame.h; y++) {
        for (let x = 0; x < frame.w; x++) {
          const [r, g, b, a] = getPixel(strip, i * 16 + x, y);
          const to = map[hexOf(r, g, b)];
          const want = to === undefined ? [r, g, b, a] : [...rgbOf(to), a];
          if (to !== undefined && to !== hexOf(r, g, b)) changed++;
          expect(getPixel(pages[frame.p].image, frame.x + x, frame.y + y)).toEqual(want);
        }
      }
    }
    expect(changed).toBeGreaterThan(0);

    // The hit flash: the white silhouette of the new art, alpha unchanged, frame for frame.
    const flash = manifest.sprites['enemies/spinner@flash'];
    expect(flash).toBeDefined();
    expect(flash.frames).toEqual([0, 1, 2, 3].map((i) => `enemies/spinner@flash#${i}`));
    for (let i = 0; i < 4; i++) {
      const frame = manifest.frames[`enemies/spinner@flash#${i}`];
      for (let y = 0; y < frame.h; y++) {
        for (let x = 0; x < frame.w; x++) {
          const [, , , a] = getPixel(strip, i * 16 + x, y);
          expect(getPixel(pages[frame.p].image, frame.x + x, frame.y + y)).toEqual(
            a > 0 ? [255, 255, 255, a] : [0, 0, 0, a],
          );
        }
      }
    }
  });
});
