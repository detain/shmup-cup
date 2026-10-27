/**
 * The W15-A weapon sprites (`scripts/assets/procedural/shots.mjs`): the five new main weapon
 * types' shots and the Sky Marker's beam column. Checks the kit's standing invariants — names,
 * frame counts, unified frame sizes, opaque content, byte determinism, and the beam's native v2
 * path whose height must equal `PLAYFIELD_H / 4` exactly (core `weapons` `STRIKE_BEAM_SEGMENTS`
 * stacks four of them over the playfield).
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual } from '../../../scripts/assets/image.mjs';
import * as shots from '../../../scripts/assets/procedural/shots.mjs';
import { opaqueCount } from './procedural-helpers.js';

describe('scripts/assets/procedural/shots', () => {
  const [flak, rail, drone, chain, beacon, beam] = shots.generate();

  it('names the six sprites in the documented order', () => {
    expect([flak, rail, drone, chain, beacon, beam].map((s) => s.name)).toEqual([
      'shots/flak',
      'shots/rail',
      'shots/drone',
      'shots/chain',
      'shots/beacon',
      'shots/beacon-beam',
    ]);
    for (const s of [flak, rail, drone, chain, beacon, beam]) {
      expect(s.origin).toBe('procedural:shots');
    }
  });

  it('draws one 5×5 flak pellet, two 16×11 rail frames, eight 7×7 drone octants', () => {
    expect(flak.frames).toHaveLength(1);
    expect(flak.frames.map((f) => [f.width, f.height])).toEqual([[5, 5]]);
    expect(opaqueCount(flak.frames[0])).toBeGreaterThan(4);
    expect(rail.frames).toHaveLength(2);
    expect(rail.frames.map((f) => [f.width, f.height])).toEqual([
      [16, 11],
      [16, 11],
    ]);
    expect(drone.frames).toHaveLength(8);
    expect(drone.frames.map((f) => [f.width, f.height])).toEqual(Array(8).fill([7, 7]));
  });

  it('faces the drone darts right, down, left, up (frame k = k · 45° clockwise)', () => {
    // F1 pin: each cardinal frame is a dart — its swept fins stand at the tail corners and the
    // nose-side corners stay empty. DIRECTIONS_8's 22.5° order drew frame 2 toward down-right,
    // frame 4 downward, frame 6 up-left-ish and frame 7 down-left, failing this on every one.
    const a = (f: (typeof drone.frames)[number], x: number, y: number) => getPixel(f, x, y)[3];
    const spec = [
      { k: 0, nose: [6, 3], finA: [1, 1], finB: [1, 5], emptyA: [5, 1], emptyB: [5, 5] },
      { k: 2, nose: [3, 6], finA: [1, 1], finB: [5, 1], emptyA: [1, 5], emptyB: [5, 5] },
      { k: 4, nose: [0, 3], finA: [5, 1], finB: [5, 5], emptyA: [1, 1], emptyB: [1, 5] },
      { k: 6, nose: [3, 0], finA: [1, 5], finB: [5, 5], emptyA: [1, 1], emptyB: [5, 1] },
    ] as const;
    for (const { k, nose, finA, finB, emptyA, emptyB } of spec) {
      const f = drone.frames[k];
      expect(a(f, nose[0], nose[1])).toBe(255);
      expect(a(f, finA[0], finA[1])).toBe(255);
      expect(a(f, finB[0], finB[1])).toBe(255);
      expect(a(f, emptyA[0], emptyA[1])).toBe(0);
      expect(a(f, emptyB[0], emptyB[1])).toBe(0);
    }
  });

  it('draws the chain bolt and hook at 9×5 and the beacon stakes at 6×10', () => {
    expect(chain.frames).toHaveLength(2);
    expect(chain.frames.map((f) => [f.width, f.height])).toEqual([
      [9, 5],
      [9, 5],
    ]);
    expect(beacon.frames).toHaveLength(2);
    expect(beacon.frames.map((f) => [f.width, f.height])).toEqual([
      [6, 10],
      [6, 10],
    ]);
    for (const s of [chain, beacon]) {
      for (const f of s.frames) expect(opaqueCount(f)).toBeGreaterThan(0);
    }
  });

  it('draws the beam column at 8×56 with a lit core frame and a translucent fade frame', () => {
    expect(beam.frames).toHaveLength(2);
    expect(beam.frames.map((f) => [f.width, f.height])).toEqual([
      [8, 56],
      [8, 56],
    ]);
    expect(beam.native).toBeUndefined(); // scale-1 build: the v1 interim art, byte-pinned as ever
    expect(opaqueCount(beam.frames[0])).toBe(8 * 56); // the core frame fills its column
    let translucent = 0;
    for (let i = 3; i < beam.frames[1].data.length; i += 4) {
      if (beam.frames[1].data[i] > 0 && beam.frames[1].data[i] < 255) translucent++;
    }
    expect(translucent).toBeGreaterThan(0);
  });

  it('draws the beam native at a non-unit art scale, its height exactly a quarter playfield', () => {
    const v2 = shots.generate({ artScale: 1.5 });
    const beamV2 = v2.find((s) => s.name === 'shots/beacon-beam');
    expect(beamV2!.native).toBe(true);
    expect(beamV2!.frames.map((f) => [f.width, f.height])).toEqual([
      [12, 84],
      [12, 84],
    ]);
    // 84 px is 336 / 4 (v2's playfield height quartered) — the column must meet end to end.
    // Other sprites are ordinary interim art and stay unflagged.
    for (const s of v2) {
      if (s.name !== 'shots/beacon-beam') expect(s.native).toBeUndefined();
    }
    const same = v2.find((s) => s.name === 'shots/flak');
    expect(imagesEqual(same!.frames[0], flak.frames[0])).toBe(true);
  });

  it('is deterministic: two runs draw byte-identical frames', () => {
    const again = shots.generate();
    const v2again = shots.generate({ artScale: 1.5 });
    const v2first = shots.generate({ artScale: 1.5 });
    for (let k = 0; k < again.length; k++) {
      expect(again[k].frames).toHaveLength(shots.generate()[k].frames.length);
      for (let j = 0; j < again[k].frames.length; j++) {
        expect(imagesEqual(again[k].frames[j], shots.generate()[k].frames[j])).toBe(true);
        expect(imagesEqual(v2first[k].frames[j], v2again[k].frames[j])).toBe(true);
      }
    }
  });
});
