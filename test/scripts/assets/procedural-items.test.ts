/**
 * The item capsules (`scripts/assets/procedural/items.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2. R4-02.B2 adds the native v2 path of the four pills
 * (the art bible §5's 18×12, four glint frames); R4-02.B3 the point item's (7×7, four twinkle
 * frames — the `(age >> 3) & 3` cycle `core/bullets` indexes).
 * @module
 */
import { describe, expect, it } from 'vitest';
import { CAPSULE_FLAVOR_SPRITES, CAPSULE_SCORE, ITEM_KINDS, ItemKind } from '@shmup/core';
import { getPixel, imagesEqual } from '../../../scripts/assets/image.mjs';
import * as items from '../../../scripts/assets/procedural/items.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { opaque, eachOpaque, onEdge, hue, key } from './procedural-helpers.js';

describe('scripts/assets/procedural/items', () => {
  const [capsule, point, blue, bonus, oneUp] = items.generate();

  it('draws the bonus stages` gold bonus capsule and green 1UP in the capsule`s shape (M2-10)', () => {
    expect([bonus.name, oneUp.name]).toEqual(['items/capsule-bonus', 'items/1up']);
    for (const sprite of [bonus, oneUp]) {
      expect(sprite.animations).toEqual({ blink: [0, 1] });
      expect(sprite.frames).toHaveLength(2);
      for (let f = 0; f < 2; f++) {
        const a = sprite.frames[f];
        const b = capsule.frames[f];
        expect([a.width, a.height]).toEqual([b.width, b.height]);
        for (let y = 0; y < a.height; y++) {
          for (let x = 0; x < a.width; x++) expect(opaque(a, x, y)).toBe(opaque(b, x, y));
        }
      }
    }
    const gold = hue(getPixel(bonus.frames[0], 3, 5));
    expect(gold > 30 && gold < 60, `hue ${gold}`).toBe(true);
    const green = hue(getPixel(oneUp.frames[0], 2, 5));
    expect(green > 90 && green < 150, `hue ${green}`).toBe(true);
    // The 1UP's white plus in the middle.
    expect(getPixel(oneUp.frames[0], 6, 4)).toEqual([255, 255, 255, 255]);
    expect(getPixel(oneUp.frames[0], 4, 4)).toEqual([255, 255, 255, 255]);
  });

  it('draws the blue capsule as the capsule`s shape in blue (M2-04)', () => {
    expect(blue.name).toBe('items/capsule-blue');
    expect(blue.animations).toEqual({ blink: [0, 1] });
    expect(blue.frames).toHaveLength(2);
    for (let f = 0; f < 2; f++) {
      const a = blue.frames[f];
      const b = capsule.frames[f];
      expect([a.width, a.height]).toEqual([b.width, b.height]);
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) expect(opaque(a, x, y)).toBe(opaque(b, x, y));
      }
    }
    const h = hue(getPixel(blue.frames[0], 6, 5));
    expect(h > 190 && h < 250, `hue ${h}`).toBe(true);
  });

  describe('the w15-C variety art (flavored capsules and drop crates)', () => {
    const [weapon, option, power, speed] = items.generate().slice(5, 9);
    const [crateW, crateM, crateS] = items.generate().slice(9, 12);
    const WHITE = color('#ffffff');

    /** The crate tones: `items.mjs` `CRATE_COLORS` — rim and body, and the body hue window. */
    const CRATES: ReadonlyArray<{
      sprite: typeof crateW;
      name: string;
      rim: string;
      dim: string;
      lit: string;
      hueMin: number;
      hueMax: number;
      glyph: [number, number];
    }> = [
      {
        sprite: crateW,
        name: 'items/crate-weapon',
        rim: '#40100a',
        dim: '#8a2414',
        lit: '#b03820',
        hueMin: 0,
        hueMax: 30,
        glyph: [3, 5],
      },
      {
        sprite: crateM,
        name: 'items/crate-mega',
        rim: '#4a3408',
        dim: '#b07818',
        lit: '#d8a030',
        hueMin: 30,
        hueMax: 60,
        glyph: [5, 5],
      },
      {
        sprite: crateS,
        name: 'items/crate-speed',
        rim: '#0a3a10',
        dim: '#20842c',
        lit: '#38ac44',
        hueMin: 90,
        hueMax: 150,
        glyph: [4, 5],
      },
    ];

    it('names the seven new sprites in the order the atlas registers them', () => {
      expect(items.generate().map((s) => s.name)).toEqual([
        'items/capsule',
        'items/point',
        'items/capsule-blue',
        'items/capsule-bonus',
        'items/1up',
        'items/capsule-weapon',
        'items/capsule-option',
        'items/capsule-power',
        'items/capsule-speed',
        'items/crate-weapon',
        'items/crate-mega',
        'items/crate-speed',
      ]);
    });

    it('draws the four flavored pills as the capsule with a white mark in its tint (V1)', () => {
      const flavors = [
        { sprite: weapon, name: 'items/capsule-weapon', mark: [4, 1], hMin: 0, hMax: 30 },
        { sprite: option, name: 'items/capsule-option', mark: [5, 1], hMin: 190, hMax: 250 },
        { sprite: power, name: 'items/capsule-power', mark: [6, 1], hMin: 30, hMax: 60 },
        { sprite: speed, name: 'items/capsule-speed', mark: [4, 1], hMin: 90, hMax: 150 },
      ];
      for (const f of flavors) {
        expect(f.sprite.name, f.name).toBe(f.name);
        expect(f.sprite.animations, f.name).toEqual({ blink: [0, 1] });
        expect(f.sprite.frames, f.name).toHaveLength(2);
        for (let k = 0; k < 2; k++) {
          const a = f.sprite.frames[k];
          const b = capsule.frames[k];
          expect([a.width, a.height], f.name).toEqual([12, 8]);
          for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 12; x++)
              expect(opaque(a, x, y), `${f.name} ${x},${y}`).toBe(opaque(b, x, y));
          }
          // The mark paints white inside the silhouette.
          expect(getPixel(a, f.mark[0], f.mark[1]), f.name).toEqual(WHITE);
          // A body pixel away from mark and spark keeps the tint.
          const h = hue(getPixel(a, 1, 4));
          expect(h > f.hMin && h < f.hMax, `${f.name} hue ${h}`).toBe(true);
        }
      }
      // The four flavors sit at CAPSULE_FLAVOR_SPRITES' names (the table repeats weapon and power
      // across the stops — `world` spreads it through a Set into ENGINE_SPRITES).
      expect([...new Set(CAPSULE_FLAVOR_SPRITES)]).toEqual([
        'items/capsule-speed',
        'items/capsule-weapon',
        'items/capsule-option',
        'items/capsule-power',
      ]);
    });

    it('pins the three crate kinds to ITEM_KINDS (spec, four blink frames, capsule score)', () => {
      expect(ITEM_KINDS.length).toBe(ItemKind.SpeedOnly + 1);
      expect(ITEM_KINDS[ItemKind.Mega]).toEqual({
        sprite: 'items/crate-mega',
        frames: 4,
        score: CAPSULE_SCORE,
      });
      expect(ITEM_KINDS[ItemKind.WeaponPick]).toEqual({
        sprite: 'items/crate-weapon',
        frames: 4,
        score: CAPSULE_SCORE,
      });
      expect(ITEM_KINDS[ItemKind.SpeedOnly]).toEqual({
        sprite: 'items/crate-speed',
        frames: 4,
        score: CAPSULE_SCORE,
      });
    });

    it('gives the shipped scale-1 atlas every new sprite with its blink frames', () => {
      const built = buildAtlas();
      for (const name of [
        'items/capsule-weapon',
        'items/capsule-option',
        'items/capsule-power',
        'items/capsule-speed',
        'items/crate-weapon',
        'items/crate-mega',
        'items/crate-speed',
      ]) {
        expect(built.manifest.sprites[name], name).toBeDefined();
        expect(built.manifest.sprites[name].frames.length, name).toBeGreaterThanOrEqual(2);
      }
    });

    it('draws the same art native on the v2 path (pills 18×12, crates 18×18, four frames)', () => {
      const v2 = items.generate({ artScale: 1.5 });
      const marks: Record<string, [number, number]> = {
        // The v1 mark coordinates shifted by (3, 2) — `items.mjs` `paintMark`.
        'items/capsule-weapon': [7, 3],
        'items/capsule-option': [8, 3],
        'items/capsule-power': [9, 3],
        'items/capsule-speed': [7, 3],
        // The crate glyphs shifted by (3, 4) — `items.mjs` `CRATE_GLYPHS`.
        'items/crate-weapon': [6, 9],
        'items/crate-mega': [8, 9],
        'items/crate-speed': [7, 9],
      };
      for (const sprite of v2.slice(5, 12)) {
        const [w, h] = sprite.name.startsWith('items/capsule-') ? [18, 12] : [18, 18];
        expect([sprite.frames.length, sprite.native, sprite.animations], sprite.name).toEqual([
          4,
          true,
          { blink: [0, 1, 2, 3] },
        ]);
        const [mx, my] = marks[sprite.name];
        for (const frame of sprite.frames) {
          expect([frame.width, frame.height], sprite.name).toEqual([w, h]);
          expect(getPixel(frame, mx, my), sprite.name).toEqual(WHITE);
        }
      }
    });

    it('draws the three drop crates as fully-opaque square boxes with rim, lid and glyph (V2)', () => {
      for (const c of CRATES) {
        expect(c.sprite.name, c.name).toBe(c.name);
        expect(c.sprite.animations, c.name).toEqual({ blink: [0, 1] });
        expect(c.sprite.frames, c.name).toHaveLength(2);
        for (let f = 0; f < 2; f++) {
          const frame = c.sprite.frames[f];
          expect([frame.width, frame.height], c.name).toEqual([12, 12]);
          for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 12; x++)
              expect(opaque(frame, x, y), `${c.name} ${x},${y}`).toBe(true);
          }
          // The box's outline and its lid seam are the rim; the lit blink frame lights the body.
          for (let x = 0; x < 12; x++) {
            expect(getPixel(frame, x, 0), c.name).toEqual(color(c.rim));
            expect(getPixel(frame, x, 11), c.name).toEqual(color(c.rim));
            expect(getPixel(frame, x, 3), c.name).toEqual(color(c.rim));
          }
          for (let y = 1; y < 11; y++) {
            expect(getPixel(frame, 0, y), c.name).toEqual(color(c.rim));
            expect(getPixel(frame, 11, y), c.name).toEqual(color(c.rim));
          }
          // The white glyph survives both blink frames; the body beside it dims and lights.
          expect(getPixel(frame, c.glyph[0], c.glyph[1]), c.name).toEqual(WHITE);
          expect(getPixel(frame, 2, 7), `${c.name} f${f} body`).toEqual(
            color(f === 0 ? c.dim : c.lit),
          );
        }
        // The two blink frames differ (the body brightness), the glyph and rim do not.
        expect(Buffer.from(c.sprite.frames[0].data)).not.toEqual(
          Buffer.from(c.sprite.frames[1].data),
        );
      }
    });
  });

  it('draws the 5×5 two-frame gold point item diamond of cancelled bullets (M2-02)', () => {
    expect(point.name).toBe('items/point');
    expect(point.animations).toEqual({ twinkle: [0, 1] });
    expect(point.frames).toHaveLength(2);
    for (const frame of point.frames) {
      expect([frame.width, frame.height]).toEqual([5, 5]);
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(opaque(frame, x, y), `${x},${y}`).toBe(Math.abs(x - 2) + Math.abs(y - 2) <= 2);
        }
      }
      expect(getPixel(frame, 2, 2)).toEqual(color('#ffffff'));
    }
    // Gold, like the other items (never a bullet colour).
    const h = hue(getPixel(point.frames[0], 2, 1));
    expect(h > 30 && h < 60, `hue ${h}`).toBe(true);
    expect(getPixel(point.frames[1], 2, 0)).toEqual(color('#ffffff')); // the twinkle's tips
    expect(getPixel(point.frames[0], 2, 0)).not.toEqual(color('#ffffff'));
  });

  it('draws a 12×8 two-frame blinking capsule with a mirror-symmetric outline', () => {
    expect(capsule.name).toBe('items/capsule');
    expect(capsule.animations).toEqual({ blink: [0, 1] });
    expect(capsule.frames).toHaveLength(2);
    expect(Buffer.from(capsule.frames[0].data)).not.toEqual(Buffer.from(capsule.frames[1].data));
    for (const frame of capsule.frames) {
      expect([frame.width, frame.height]).toEqual([12, 8]);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 12; x++) {
          expect(opaque(frame, x, y)).toBe(opaque(frame, 11 - x, y));
          expect(opaque(frame, x, y)).toBe(opaque(frame, x, 7 - y));
        }
      }
    }
  });

  it('outlines both frames with the dark rim and keeps the silhouette identical', () => {
    const rim = color('#5a1408');
    for (const frame of capsule.frames) {
      eachOpaque(frame, (x, y, rgba) => {
        if (onEdge(frame, x, y)) expect(rgba).toEqual(rim);
      });
    }
    const [a, b] = capsule.frames;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 12; x++) expect(opaque(a, x, y)).toBe(opaque(b, x, y));
    }
  });

  describe('the native v2 path (R4-02.B2)', () => {
    const v2 = items.generate({ artScale: 1.5 });
    const [capsule2, point2, blue2, bonus2, oneUp2] = v2;
    const WHITE = color('#ffffff');

    /** v1's capsule tints (`items.mjs` `CAPSULE_COLORS`) — the v2 path may use nothing else. */
    const TINTS = {
      red: { rim: '#5a1408', body: ['#e04a18', '#ff7a30'], band: ['#f89850', '#ffd080'] },
      blue: { rim: '#08164a', body: ['#2458d8', '#4c8cff'], band: ['#78b0ff', '#e0f0ff'] },
      gold: { rim: '#5a3a04', body: ['#d8a018', '#ffd040'], band: ['#f8d878', '#fff4c0'] },
      green: { rim: '#0a3a10', body: ['#28a838', '#50e060'], band: ['#90f098', '#e0ffe0'] },
    } as const;

    /**
     * The v2 glint cycle of one pill: frames are dim, dim + spark, lit + spark, lit plain
     * (`items.mjs` `V2_STAGES`); the spark is the 3×2 white block at columns 5–7, rows 3–4.
     *
     * @param sprite - The generated sprite.
     * @param tint - Its colour set.
     */
    const expectCycle = (sprite: (typeof v2)[number], tint: keyof typeof TINTS): void => {
      const colors = TINTS[tint];
      expect(sprite.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([18, 12]));
      expect(sprite.animations).toEqual({ blink: [0, 1, 2, 3] });
      expect(sprite.native).toBe(true);
      expect(sprite.anchor).toBeNull();
      const lit = (stage: number): number => (stage >= 2 ? 1 : 0);
      const sparked = (stage: number): boolean => stage === 1 || stage === 2;
      // The spark block and its neighbours, the body, the band away from the spark, the rim.
      for (let stage = 0; stage < 4; stage++) {
        const frame = sprite.frames[stage];
        for (const x of [5, 6, 7]) {
          for (const y of [3, 4]) {
            expect(getPixel(frame, x, y), `f${stage} spark ${x},${y}`).toEqual(
              sparked(stage) ? WHITE : color(colors.band[lit(stage)]),
            );
          }
        }
        expect(getPixel(frame, 3, 6), `f${stage} body`).toEqual(color(colors.body[lit(stage)]));
        expect(getPixel(frame, 13, 3), `f${stage} band`).toEqual(color(colors.band[lit(stage)]));
        eachOpaque(frame, (x, y, rgba) => {
          if (onEdge(frame, x, y)) expect(rgba, `f${stage} rim`).toEqual(color(colors.rim));
        });
        // v1's colours only (the cycle-ramp scan stays honest).
        const allowed = new Set<string>(
          [colors.rim, colors.body[0], colors.body[1], colors.band[0], colors.band[1]].map((hex) =>
            key(color(hex)),
          ),
        );
        allowed.add(key(WHITE));
        eachOpaque(frame, (_x, _y, rgba) => expect(allowed, key(rgba)).toContain(key(rgba)));
        for (let y = 0; y < 12; y++) {
          for (let x = 0; x < 18; x++)
            expect(opaque(frame, x, y), `f${stage} silhouette`).toBe(
              opaque(sprite.frames[0], x, y),
            );
        }
      }
    };

    it('draws the four pills native at 18×12 over the glint cycle (bible §5)', () => {
      expect([capsule2.name, blue2.name, bonus2.name, oneUp2.name]).toEqual([
        'items/capsule',
        'items/capsule-blue',
        'items/capsule-bonus',
        'items/1up',
      ]);
      expectCycle(capsule2, 'red');
      expectCycle(blue2, 'blue');
      expectCycle(bonus2, 'gold');
      expectCycle(oneUp2, 'green');
    });

    it('pins every drawn pill kind to its ITEM_KINDS frame count (four)', () => {
      for (const [kind, sprite] of [
        [ItemKind.Capsule, capsule2],
        [ItemKind.BlueCapsule, blue2],
        [ItemKind.BonusCapsule, bonus2],
        [ItemKind.OneUp, oneUp2],
      ] as const) {
        const spec = ITEM_KINDS[kind];
        expect(spec.sprite, sprite.name).toBe(sprite.name);
        expect(spec.frames, sprite.name).toBe(4);
        expect(sprite.frames).toHaveLength(spec.frames);
      }
      // The stolen Option item kind shares the count — R4-01.A3 ships its four-frame art.
      expect(ITEM_KINDS[ItemKind.FreeOption]).toMatchObject({
        sprite: 'options/stolen',
        frames: 4,
      });
    });

    it('draws the 1UP plus as the v1 bar ×1.5 in white on every frame', () => {
      for (const [stage, frame] of oneUp2.frames.entries()) {
        for (let x = 6; x <= 12; x++) {
          expect(getPixel(frame, x, 6)).toEqual(WHITE);
          expect(getPixel(frame, x, 7)).toEqual(WHITE);
        }
        for (let y = 3; y <= 8; y++) {
          expect(getPixel(frame, 9, y)).toEqual(WHITE);
          expect(getPixel(frame, 10, y)).toEqual(WHITE);
        }
        // The plus is the v1 one ×1.5: the body beside it dims on frames 0–1, lights on 2–3.
        expect(getPixel(frame, 3, 8)).toEqual(color(stage >= 2 ? '#50e060' : '#28a838'));
      }
    });

    it('draws the point item native at 7×7 over the four-frame twinkle (bible §5, R4-02.B3)', () => {
      expect(point2.name).toBe('items/point');
      expect(point2.native).toBe(true);
      expect(point2.frames.map((f) => [f.width, f.height])).toEqual(Array(4).fill([7, 7]));
      expect(point2.animations).toEqual({ twinkle: [0, 1, 2, 3] });
      const RIM = color('#6a4808');
      const GOLD = color('#ffc830');
      for (let stage = 0; stage < 4; stage++) {
        const frame = point2.frames[stage];
        for (let y = 0; y < 7; y++) {
          for (let x = 0; x < 7; x++) {
            const d = Math.abs(x - 3) + Math.abs(y - 3);
            // v1's diamond ×1.5: |dx| + |dy| ≤ 3 is exactly the opaque set.
            expect(opaque(frame, x, y), `f${stage} ${x},${y}`).toBe(d <= 3);
            if (d === 3) {
              // the spark travels the rim: tips (stage 1, v1's twinkle), the whole rim
              // (stage 2), the rim without the tips (stage 3); stage 0 is the plain body.
              const card = x === 3 || y === 3;
              const lit = stage === 2 || (stage === 1 && card) || (stage === 3 && !card);
              expect(getPixel(frame, x, y), `f${stage} rim ${x},${y}`).toEqual(lit ? WHITE : RIM);
            } else if (d !== 0 && d < 3)
              // the body
              expect(getPixel(frame, x, y), `f${stage} body`).toEqual(GOLD);
            else if (d === 0)
              // the white centre, on every frame like v1's
              expect(getPixel(frame, x, y), `f${stage} centre`).toEqual(WHITE);
          }
        }
        // v1's three colours only, binary alpha (the scan stays honest).
        const allowed = new Set([key(RIM), key(GOLD), key(WHITE)]);
        eachOpaque(frame, (_x, _y, rgba) => expect(allowed, key(rgba)).toContain(key(rgba)));
      }
    });

    it('gives the shipped atlas the frames core indexes for the point item (wave rule 3)', () => {
      // core/bullets picks `(age >> 3) & 3` — the atlas at the default art scale must hold all
      // four frames the pool can name.
      const built = buildAtlas();
      expect(built.manifest.sprites['items/point'].frames.length).toBeGreaterThanOrEqual(4);
    });

    it('leaves art scale 1 byte-identical to the unmarked call, native unmarked', () => {
      const one = items.generate({ artScale: 1 });
      const v1 = items.generate();
      expect(one.map((s) => s.name)).toEqual(v1.map((s) => s.name));
      one.forEach((sprite, k) => {
        expect(sprite.native, sprite.name).toBeUndefined();
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v1[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });

    it('is deterministic: two v2 runs draw the same pixels', () => {
      const again = items.generate({ artScale: 1.5 });
      again.forEach((sprite, k) => {
        sprite.frames.forEach((frame, f) => {
          expect(imagesEqual(frame, v2[k].frames[f]), sprite.name).toBe(true);
        });
      });
    });
  });
});
