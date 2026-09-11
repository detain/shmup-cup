import { describe, expect, it } from 'vitest';
import { PALETTE, moduleInfo } from '../../src/palette/index.js';

describe('render-pixi/palette', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('palette');
  });

  it('never uses pure black for the playfield (VA-panel smearing, shmup_tech.md §2.7)', () => {
    expect(PALETTE.space).not.toBe(0x000000);
    expect(PALETTE.letterbox).not.toBe(0x000000);
  });
});
