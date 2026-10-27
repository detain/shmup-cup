/**
 * The hitbox markers of the "show hitbox" option (plan M2-08): since the w15-HBOX re-style each
 * marker is the *outline* of the hurt core — four 1-px `HITBOX_RIM_TINT` strips tracing the old
 * filled marker's boundary, interior left open so the ship shows through; w15-HBDIM halved the
 * rim's brightness (the owner's "less noticeable" note) and w15-HBDIM2 halved it again to a
 * quarter, at the visibility floor computed below — the presence and floor pins are the checks.
 * The tests below are the draw census: they expand every visible quad into painted pixels and
 * require the set to equal the old rim's perimeter exactly — zero interior pixels, unchanged box
 * extent. Unused slots hidden; no allocation.
 */
import { PLAYFIELD_Y, createHitboxBatch } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { HITBOX_RIM_TINT, createHitboxBinding } from '../../src/layers/index.js';
import { pageImages, testManifest } from '../helpers.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * The painted pixels of the children in a slot range, as `x · 1024 + y` keys. A marker strip is
 * the atlas' 1-px white pixel stretched by its scale, so its quad is `scale.x × scale.y` pixels at
 * `(x, y)`.
 *
 * @param children - The binding container's children (four sprites per slot).
 * @param from - First child index of the range.
 * @param to - One past the last.
 * @returns The set of painted pixel keys.
 */
function paintedPixels(children: readonly unknown[], from: number, to: number): Set<number> {
  const keys = new Set<number>();
  for (let i = from; i < to; i++) {
    const sprite = children[i] as Sprite;
    if (!sprite.visible) continue;
    for (let dx = 0; dx < sprite.scale.x; dx++) {
      for (let dy = 0; dy < sprite.scale.y; dy++) {
        keys.add((sprite.x + dx) * 1024 + (sprite.y + dy));
      }
    }
  }
  return keys;
}

/**
 * The perimeter of a `span × span` square at `(x0, y0)` — the old filled marker's boundary: its
 * solid rim was that whole square, with a core painted over its centre.
 *
 * @param x0 - Left column of the square.
 * @param y0 - Top row of the square.
 * @param span - Side length in pixels.
 * @returns The set of ring pixel keys.
 */
function ringKeys(x0: number, y0: number, span: number): Set<number> {
  const keys = new Set<number>();
  for (let d = 0; d < span; d++) {
    keys.add((x0 + d) * 1024 + y0);
    keys.add((x0 + d) * 1024 + (y0 + span - 1));
    keys.add(x0 * 1024 + (y0 + d));
    keys.add((x0 + span - 1) * 1024 + (y0 + d));
  }
  return keys;
}

/**
 * The common darks of the shipped frame a rim can sit on (w15-HBDIM2): the thirteen darkest band
 * colours scraped from `content/stages/*.stage.json` (channel sum ≤ 150) plus the three darks of
 * render-pixi `PALETTE`. A rim dimmed toward any of them would vanish into that background.
 */
const COMMON_DARKS: readonly number[] = [
  0x05070f, // PALETTE.letterbox
  0x10173a, // PALETTE.space
  0x1d2a5c, // PALETTE.grid
  0x08141c, // zone-i abyss band
  0x101e18, // zone-f vault rock
  0x2e1a06, // zone-h citadel rock — the binding dark: worst distance 20
  0x10182a, // zone-e ridge sky
  0x0e1a2e, // zone-g / glimmer-cache crystal haze
  0x18261e, // zone-f vault rock, lifted
  0x4a1206, // zone-d magma ember
  0x0e2a34, // zone-i abyss current
  0x20124a, // dimension void
  0x203428, // zone-f tissue moss
  0x10323e, // zone-b / brine-grotto brine deep
  0x4a2c10, // zone-h citadel rust
  0x1d2c46, // zone-e storm cloud
];

/**
 * The Chebyshev distance of two 0xRRGGBB colours: the largest per-channel difference.
 *
 * @param a - The first colour.
 * @param b - The second colour.
 * @returns The distance, 0 … 255.
 */
function chebyshev(a: number, b: number): number {
  return Math.max(
    Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)),
    Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)),
    Math.abs((a & 0xff) - (b & 0xff)),
  );
}

describe('render-pixi/layers hitbox markers', () => {
  it('outlines the hurt core at the camera-converted centre, rim tint, interior open', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 2 });
    const view = createHitboxBatch(2);
    view.x[0] = 100.4;
    view.y[0] = 50;
    view.radius[0] = 1.5;
    view.x[1] = 200;
    view.y[1] = 60;
    view.radius[1] = 0.75;
    view.count = 2;
    binding.sync(view, { x: 10, y: 0 });
    // Four strips per slot, created in the order top, bottom, left, right.
    const [top0, bottom0, left0, right0, top1, bottom1, left1, right1] = binding.container
      .children as Sprite[];
    expect([top0.tint, bottom0.tint, left0.tint, right0.tint]).toEqual([
      HITBOX_RIM_TINT,
      HITBOX_RIM_TINT,
      HITBOX_RIM_TINT,
      HITBOX_RIM_TINT,
    ]);
    // The w15-HBDIM2 presence pin: the rim is a quarter of the half-brightness pink-red (one
    // eighth of the original 0xff3050 per channel), kept fully opaque so one known colour
    // reaches the screen (the pixel-checked marker must not blend with whatever the ring
    // happens to sit on).
    expect(HITBOX_RIM_TINT).toBe(0x20060a);
    // Radius 1.5 → a 3-px core surrounded at ±2: centre (90, 50 + PLAYFIELD_Y).
    expect([top0.x, top0.y, top0.scale.x, top0.scale.y]).toEqual([88, 48 + PLAYFIELD_Y, 5, 1]);
    expect([bottom0.x, bottom0.y, bottom0.scale.x, bottom0.scale.y]).toEqual([
      88,
      52 + PLAYFIELD_Y,
      5,
      1,
    ]);
    expect([left0.x, left0.y, left0.scale.x, left0.scale.y]).toEqual([88, 49 + PLAYFIELD_Y, 1, 3]);
    expect([right0.x, right0.y, right0.scale.x, right0.scale.y]).toEqual([
      92,
      49 + PLAYFIELD_Y,
      1,
      3,
    ]);
    // Below 1 px: half 0 → a 1-px core surrounded at ±1 (centre (190, 60 + PLAYFIELD_Y)).
    expect([top1.x, top1.y, top1.scale.x, top1.scale.y]).toEqual([189, 59 + PLAYFIELD_Y, 3, 1]);
    expect([bottom1.x, bottom1.y, bottom1.scale.x, bottom1.scale.y]).toEqual([
      189,
      61 + PLAYFIELD_Y,
      3,
      1,
    ]);
    expect([left1.x, left1.y, left1.scale.x, left1.scale.y]).toEqual([189, 60 + PLAYFIELD_Y, 1, 1]);
    expect([right1.x, right1.y, right1.scale.x, right1.scale.y]).toEqual([
      191,
      60 + PLAYFIELD_Y,
      1,
      1,
    ]);
    expect(binding.visibleCount).toBe(2);
    view.count = 1;
    binding.sync(view, { x: 10, y: 0 });
    expect([top1.visible, bottom1.visible, left1.visible, right1.visible]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect([top0.visible, bottom0.visible, left0.visible, right0.visible]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(binding.visibleCount).toBe(1);
  });

  it('paints exactly the old marker boundary — zero interior pixels (the w15-HBOX draw census)', () => {
    const binding = createHitboxBinding({ atlas: atlas(), capacity: 1 });
    const view = createHitboxBatch(1);
    view.x[0] = 100;
    view.y[0] = 50;
    view.radius[0] = 2.25; // the ported KESTREL hurt radius
    view.count = 1;
    binding.sync(view, { x: 0, y: 0 });
    const children = binding.container.children;
    // Centre (100, 50 + PLAYFIELD_Y); half 2 → the old filled marker painted the whole
    // 7 × 7 square (49 px: a 5 × 5 white core inside the solid rim). The outline paints its
    // perimeter and nothing else: 24 px at the same boundary, size unchanged.
    // The interior the old core filled — the 5 × 5 square at (98, 48 + PLAYFIELD_Y) — stays open:
    // not one of its 25 pixels is painted.
    const painted = paintedPixels(children, 0, 4);
    expect(painted).toEqual(ringKeys(97, 47 + PLAYFIELD_Y, 7));
    expect(painted.size).toBe(24);
    let interiorPainted = 0;
    for (let dx = 98; dx <= 102; dx++) {
      for (let dy = 48; dy <= 52; dy++) {
        if (painted.has(dx * 1024 + (dy + PLAYFIELD_Y))) interiorPainted++;
      }
    }
    expect(interiorPainted).toBe(0);
    // Below 1 px the old marker was a 3 × 3 solid square (9 px); now a 3 × 3 ring (8 px) with the
    // centre pixel open.
    view.radius[0] = 0.75;
    binding.sync(view, { x: 0, y: 0 });
    expect(paintedPixels(children, 0, 4)).toEqual(ringKeys(99, 49 + PLAYFIELD_Y, 3));
  });

  it('refuses a bad capacity and syncs without allocating', () => {
    const a = atlas();
    expect(() => createHitboxBinding({ atlas: a, capacity: 0 })).toThrow(RangeError);
    const binding = createHitboxBinding({ atlas: a, capacity: 2 });
    const view = createHitboxBatch(2);
    view.count = 2;
    const camera = { x: 0, y: 0 };
    const bytes = measureHeapGrowth(
      (tick) => {
        view.x[0] = 50 + (tick % 100) * 0.7;
        view.y[0] = 80;
        view.radius[0] = 1.5;
        view.x[1] = 150;
        view.y[1] = 90 + (tick % 7) * 0.3;
        view.radius[1] = 0.75;
        camera.x = tick * 0.25;
        binding.sync(view, camera);
      },
      5000,
      20_000,
    ).bytes;
    expect(bytes).toBeLessThan(64 * 1024);
  });

  it('stays past the dark-background visibility floor (the w15-HBDIM2 arithmetic)', () => {
    // A 1-px line needs more than 8 per-channel distance from a background to survive on a
    // paused frame at TV viewing distance — the floor this rim was dimmed down to. w15-HBDIM2's
    // 0x20060a clears every common dark; its worst distance is 20, to zone H's dark rock
    // (0x2e1a06), 2.5× the floor. The per-dark assertion is the standing law — any rim dimmed
    // or any band darkened past it fails here, naming nothing else; the worst-value pin moves
    // only with a re-run of the scrape over the shipped stages.
    let worst = 255;
    for (const dark of COMMON_DARKS) {
      const distance = chebyshev(HITBOX_RIM_TINT, dark);
      expect(distance).toBeGreaterThan(8);
      if (distance < worst) worst = distance;
    }
    expect(worst).toBe(20);
  });
});
