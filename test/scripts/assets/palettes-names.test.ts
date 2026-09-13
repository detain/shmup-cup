/**
 * The colour-blind palette generator of plan M2-02 (`scripts/assets/procedural/palettes.mjs`)
 * against the names the engine uses: its palettes are exactly `@shmup/core` `BULLET_PALETTES`
 * minus `standard` (the plain sprites), in the same order; every variant is named
 * `<sprite>@<palette>` (render-pixi's `bulletPaletteSpriteName`) after a standard bullet, beam or
 * bending-laser sprite; every colour family gets a body colour and a core mark; and generating
 * twice gives the same pixels (seeded, exactly rounded maths).
 */
import { BULLET_COLORS, BULLET_PALETTES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as bullets from '../../../scripts/assets/procedural/bullets.mjs';
import * as lasers from '../../../scripts/assets/procedural/lasers.mjs';
import * as palettes from '../../../scripts/assets/procedural/palettes.mjs';

describe('scripts/assets/procedural/palettes — names shared with the engine (M2-02)', () => {
  it('draws exactly the core palettes other than standard, in core order', () => {
    expect(Object.keys(palettes.BULLET_PALETTES)).toEqual(
      BULLET_PALETTES.filter((p) => p !== 'standard'),
    );
  });

  it('gives every colour family a body colour and a core mark in every palette', () => {
    for (const colours of Object.values(palettes.BULLET_PALETTES)) {
      expect(Object.keys(colours).sort()).toEqual([...BULLET_COLORS].sort());
      for (const hex of Object.values(colours)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(palettes.CORE_MARKS).sort()).toEqual([...BULLET_COLORS].sort());
    expect(new Set(Object.values(palettes.CORE_MARKS)).size).toBe(BULLET_COLORS.length);
  });

  it('names each variant `<standard sprite>@<palette>`, one per standard sprite and palette', () => {
    const plain = new Set([...bullets.generate(), ...lasers.generate()].map((s) => s.name));
    const names = palettes.generate().map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      const at = name.lastIndexOf('@');
      expect(at, name).toBeGreaterThan(0);
      expect(plain.has(name.slice(0, at)), name).toBe(true);
      expect(Object.keys(palettes.BULLET_PALETTES)).toContain(name.slice(at + 1));
    }
    expect(names).toHaveLength(plain.size * Object.keys(palettes.BULLET_PALETTES).length);
  });

  it('is deterministic: two runs draw the same pixels', () => {
    const a = palettes.generate();
    const b = palettes.generate();
    expect(b.map((s) => s.name)).toEqual(a.map((s) => s.name));
    a.forEach((sprite, k) => {
      sprite.frames.forEach((frame, f) => {
        expect(Buffer.from(b[k].frames[f].data).equals(Buffer.from(frame.data)), sprite.name).toBe(
          true,
        );
      });
    });
  });
});
