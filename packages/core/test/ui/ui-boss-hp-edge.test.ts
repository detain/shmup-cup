/**
 * Edge cases of the boss HP bar's pixel fill (plan M2-09, `core/ui` `bossHpBarFill`), beyond
 * `ui-boss-hp.test.ts`: values that are not usable (NaN, negative, zero) fill nothing; an infinite
 * remainder fills the bar; a fractional width fills whole pixels and never more than the bar; the
 * fill grows with the hit points (never shrinks as they rise), stays within `0 … width` and shows
 * at least 1 px for every hp left, and is full at full strength (the HUD's bar: `BOSS_HP_BAR_WIDTH`
 * less its 1-px frame).
 */
import { describe, expect, it } from 'vitest';
import { BOSS_HP_BAR_WIDTH, bossHpBarFill } from '../../src/ui/index.js';

describe('core/ui — the boss HP bar fill (M2-09 edges)', () => {
  it('fills nothing for values it cannot use', () => {
    for (const [hp, maxHp, width] of [
      [NaN, 100, 62],
      [50, NaN, 62],
      [50, 100, NaN],
      [-5, 100, 62],
      [50, -100, 62],
      [50, 100, -62],
      [0, 0, 62],
    ]) {
      expect(bossHpBarFill({ visible: true, hp, maxHp }, width)).toBe(0);
    }
  });

  it('fills the bar for an infinite remainder, and whole pixels of a fractional width', () => {
    expect(bossHpBarFill({ visible: true, hp: Infinity, maxHp: 100 }, 62)).toBe(62);
    expect(bossHpBarFill({ visible: true, hp: 100, maxHp: 100 }, 62.5)).toBe(62);
    expect(bossHpBarFill({ visible: true, hp: 99, maxHp: 100 }, 62.5)).toBe(62);
    expect(bossHpBarFill({ visible: true, hp: 1, maxHp: 100 }, 62.5)).toBe(1);
  });

  it('grows with the hit points, within the bar, at least 1 px while any are left', () => {
    const width = BOSS_HP_BAR_WIDTH - 2;
    for (const maxHp of [1, 7, 62, 63, 250, 1234]) {
      let last = 0;
      for (let hp = 0; hp <= maxHp; hp++) {
        const fill = bossHpBarFill({ visible: true, hp, maxHp }, width);
        expect(Number.isInteger(fill)).toBe(true);
        expect(fill).toBeGreaterThanOrEqual(last);
        expect(fill).toBeLessThanOrEqual(width);
        if (hp > 0) expect(fill).toBeGreaterThanOrEqual(1);
        last = fill;
      }
      expect(last).toBe(width);
    }
  });
});
