/**
 * The save **format 4** of plan R6-04 (owner decision W5-20): the version-3 → 4 migration adds the
 * GRAPHICS page's two boot knobs `output` and `renderer` to the display group at their `auto`
 * defaults, every old field carries over, the serialiser writes them in the group's fixed order
 * (after `aspect`), and hostile documents still cannot throw.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_OPTIONS, OUTPUT_CAPS, RENDERER_CHOICES } from '../../src/config/index.js';
import {
  SAVE_MIGRATIONS,
  SAVE_VERSION,
  migrateSave,
  parseSave,
  serializeSave,
} from '../../src/save/index.js';

describe('core/save — format 4 (R6-04)', () => {
  it('the format is 4 and the migration chain is complete', () => {
    expect(SAVE_VERSION).toBe(4);
    expect(SAVE_MIGRATIONS.length).toBe(4);
    for (let i = 0; i < SAVE_MIGRATIONS.length; i++) {
      expect(SAVE_MIGRATIONS[i].from).toBe(i);
      expect(SAVE_MIGRATIONS[i].to).toBe(i + 1);
    }
  });

  it('a version-3 document keeps every field and gets auto / auto', () => {
    const parsed = parseSave(
      JSON.stringify({
        version: 3,
        options: {
          audio: { master: 7, music: 5, sfx: 9 },
          display: {
            bulletPalette: 'deuteranopia',
            scaleMode: 'fit',
            screenShake: false,
            reduceFlashing: true,
            showHitbox: true,
            bossHpBar: true,
            crtFilter: 'light',
            aspect: 'classic',
            language: 'en',
          },
        },
        hiScores: {},
        stats: { gamesStarted: 2, gameOvers: 1, stagesCleared: 3 },
      }),
    );
    expect(parsed.status).toBe('migrated');
    const display = parsed.data.options.display;
    expect(display.output).toBe('auto');
    expect(display.renderer).toBe('auto');
    expect(display).toMatchObject({
      bulletPalette: 'deuteranopia',
      scaleMode: 'fit',
      screenShake: false,
      reduceFlashing: true,
      showHitbox: true,
      bossHpBar: true,
      crtFilter: 'light',
      aspect: 'classic',
      language: 'en',
    });
    expect(parsed.data.options.audio.master).toBe(7);
    expect(parsed.data.stats).toEqual({ gamesStarted: 2, gameOvers: 1, stagesCleared: 3 });
  });

  it('the migration copies a field a hostile version-3 document already carries', () => {
    // The migration must not overwrite what is there; the sanitiser alone decides validity.
    const migrated = migrateSave({
      version: 3,
      options: { display: { output: '720', renderer: 'nonsense' } },
    }).data;
    expect(migrated.version).toBe(4);
    const display = (migrated.options as Record<string, unknown>)['display'] as Record<
      string,
      unknown
    >;
    expect(display['output']).toBe('720');
    expect(display['renderer']).toBe('nonsense');
    // …and after sanitising, the valid value stands and the invalid one falls back.
    const parsed = parseSave(
      JSON.stringify({
        version: 3,
        options: { display: { output: '540', renderer: 'webgl3' } },
        hiScores: {},
        stats: {},
      }),
    );
    expect(parsed.data.options.display.output).toBe('540');
    expect(parsed.data.options.display.renderer).toBe('auto');
  });

  it('a version-3 document without an options object migrates without throwing', () => {
    const parsed = parseSave('{"version":3,"hiScores":{},"stats":{}}');
    expect(parsed.status).toBe('migrated');
    expect(parsed.data.options.display).toEqual(DEFAULT_USER_OPTIONS.display);
    expect(parsed.data.options.display.output).toBe('auto');
  });

  it('the serialiser writes the two fields after `aspect`, before `language`', () => {
    const text = serializeSave({
      version: SAVE_VERSION,
      options: DEFAULT_USER_OPTIONS,
      hiScores: {},
      stats: { gamesStarted: 0, gameOvers: 0, stagesCleared: 0 },
    });
    expect(text).toContain('"crtFilter":"off","aspect":"normal","output":"auto","renderer":"auto"');
    // L-VIDIO1: the video boot knob rides between `renderer` and `language` (default ON).
    expect(text).toContain('"renderer":"auto","video":true,"language":"en"');
  });

  it('the new fields round-trip through storage', () => {
    // (a full store round-trip lives in save.test.ts; this pins the value tables)
    expect(OUTPUT_CAPS).toEqual(['auto', '1080', '720', '540']);
    expect(RENDERER_CHOICES).toEqual(['auto', 'webgl2', 'webgl1']);
  });
});
