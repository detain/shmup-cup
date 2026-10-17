/**
 * The WARNING text fits the playfield (plan_resolution.md R1-01; `WARNING_TEMPLATE`'s note): with
 * the content schema's caps (`displayName` 24 characters, `code` 8) every line is at most
 * `PLAYFIELD_W / GLYPH_W` characters, and so is every shipped boss's.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WARNING_TEMPLATE, formatWarningText } from '../../src/bosses/index.js';
import { GLYPH_W, PLAYFIELD_W } from '../../src/config/index.js';

/** Characters of the bitmap font that fit across the playfield. */
const MAX_CHARS = Math.floor(PLAYFIELD_W / GLYPH_W);

/**
 * The longest line of a WARNING text.
 *
 * @param text - The text (`\n`-separated lines).
 * @returns Its longest line's length in characters.
 */
function longestLine(text: string): number {
  let longest = 0;
  for (const line of text.split('\n')) if (line.length > longest) longest = line.length;
  return longest;
}

describe('core/bosses — the WARNING text fits the playfield', () => {
  it('fits with the longest name and code the content schema allows', () => {
    const text = formatWarningText('N'.repeat(24), 'C'.repeat(8));
    expect(text.split('\n')).toHaveLength(WARNING_TEMPLATE.split('\n').length);
    expect(longestLine(text)).toBe(40);
    expect(longestLine(text)).toBeLessThanOrEqual(MAX_CHARS);
  });

  it('fits for every shipped boss', () => {
    const dir = new URL('../../../../content/enemies/', import.meta.url);
    let bosses = 0;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.enemies.json')) continue;
      const file = JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as {
        enemies: { boss?: { displayName: string; code: string } }[];
      };
      for (const enemy of file.enemies) {
        if (enemy.boss === undefined) continue;
        bosses++;
        const text = formatWarningText(enemy.boss.displayName, enemy.boss.code);
        expect(longestLine(text), enemy.boss.displayName).toBeLessThanOrEqual(MAX_CHARS);
      }
    }
    expect(bosses).toBeGreaterThan(0);
  });
});
