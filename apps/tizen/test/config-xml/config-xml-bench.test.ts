/**
 * The TV render bench's `config.xml` (plan R0-02): generated from the game's, with its own
 * application id, package, widget id and name, so the bench installs next to the game and never
 * replaces it — and still a valid widget for every rule the game's must meet.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BENCH_APP_ID,
  BENCH_PACKAGE_ID,
  BENCH_WIDGET_ID,
  BENCH_WIDGET_NAME,
  benchConfigXml,
  validateConfigXml,
} from '../../scripts/config-xml.mjs';
import { applicationIdOf } from '../../scripts/check-bundle.mjs';

const GAME_XML = readFileSync(new URL('../../public/config.xml', import.meta.url), 'utf8');

describe('tizen/scripts/config-xml benchConfigXml', () => {
  const bench = benchConfigXml(GAME_XML);

  it('gives the bench its own ids and name', () => {
    expect(BENCH_PACKAGE_ID).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(BENCH_APP_ID).toBe('ShmpCupBnc.RenderBench');
    expect(applicationIdOf(bench)).toBe(BENCH_APP_ID);
    expect(applicationIdOf(GAME_XML)).toBe('ShmpCupGam.ShmupCup');
    expect(bench).toContain(`package="${BENCH_PACKAGE_ID}"`);
    expect(bench).toContain(`id="${BENCH_WIDGET_ID}"`);
    expect(bench).toContain(`<name>${BENCH_WIDGET_NAME}</name>`);
    expect(bench).not.toContain('ShmpCupGam');
    expect(bench).not.toContain('<name>Shmup Cup</name>');
  });

  it('stays a valid widget with the game’s version, privileges and profile', () => {
    expect(validateConfigXml(bench)).toEqual([]);
    const version = /<widget\b[^>]*\sversion="([^"]+)"/.exec(GAME_XML)?.[1];
    expect(version).toBeDefined();
    expect(bench).toContain(`version="${version as string}"`);
    for (const privilege of ['internet', 'tv.inputdevice']) {
      expect(bench).toContain(`http://tizen.org/privilege/${privilege}`);
    }
    expect(bench).toMatch(/^<\?xml[^>]*\?>\n<!-- The TV render bench \(plan R0-02\)/);
  });

  it('refuses an XML it cannot rewrite', () => {
    expect(() => benchConfigXml('<?xml version="1.0"?><widget></widget>')).toThrow(
      /needs <tizen:application>, <widget id> and <name>/,
    );
  });
});
