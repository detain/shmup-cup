/**
 * Edge cases of the `config.xml` variants (plan M2-17, `scripts/config-xml.mjs`) and the Vite
 * plugin that writes them (`configXmlVariant()` in `vite.config.ts`, driven here through its hooks
 * over a temporary `dist/` — no build): the validator's remaining checks (namespaces, version, the
 * application id, required parts, stray markup, commented-out entries), where the metadata goes,
 * the environment's spellings, and the plugin leaving the default variant and a missing file alone.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_MODE_METADATA_KEY,
  GAMEPAD_METADATA_KEY,
  KNOWN_METADATA_KEYS,
  applyConfigVariant,
  isDefaultVariant,
  validateConfigXml,
  variantFromEnv,
  variantName,
} from '../../scripts/config-xml.mjs';
import { configXmlVariant } from '../../vite.config.js';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
const XML = readFileSync(join(appDir, 'public', 'config.xml'), 'utf8');

/**
 * The validator's problems as one text.
 *
 * @param xml - The XML.
 * @returns The problems, one per line.
 */
const problems = (xml: string): string => validateConfigXml(xml).join('\n');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('tizen config.xml validator edges', () => {
  it('checks the widget namespaces and its version', () => {
    expect(problems(XML.replace(' xmlns="http://www.w3.org/ns/widgets"', ''))).toMatch(
      /xmlns="http:\/\/www\.w3\.org\/ns\/widgets"/,
    );
    expect(problems(XML.replace(' xmlns:tizen="http://tizen.org/ns/widgets"', ''))).toMatch(
      /xmlns:tizen/,
    );
    expect(problems(XML.replace('version="1.0.0"', 'version="1.0"'))).toMatch(
      /major\.minor\.patch/,
    );
  });

  it('checks the application id, its package prefix and the required version', () => {
    expect(problems(XML.replace('id="ShmpCupGam.ShmupCup"', 'id="OtherPkg00.ShmupCup"'))).toMatch(
      /<package>\.<name>/,
    );
    expect(problems(XML.replace('id="ShmpCupGam.ShmupCup"', 'id="ShmpCupGam."'))).toMatch(
      /<package>\.<name>/,
    );
    expect(problems(XML.replace(' required_version="5.5"', ''))).toMatch(/required_version/);
    const twice = XML.replace(
      '<content src="index.html"/>',
      '<tizen:application id="ShmpCupGam.Other" package="ShmpCupGam" required_version="5.5"/>\n  <content src="index.html"/>',
    );
    expect(problems(twice)).toMatch(/exactly one <tizen:application>/);
  });

  it('requires the icon, a non-empty name and exactly one TV profile', () => {
    expect(problems(XML.replace('<icon src="icon.png"/>', ''))).toMatch(/<icon src>/);
    expect(problems(XML.replace('<icon src="icon.png"/>', '<icon/>'))).toMatch(/<icon src>/);
    expect(problems(XML.replace('<name>Shmup Cup</name>', '<name></name>'))).toMatch(
      /<name> is required/,
    );
    const two = XML.replace(
      '<tizen:profile name="tv-samsung"/>',
      '<tizen:profile name="tv-samsung"/>\n  <tizen:profile name="tv-samsung"/>',
    );
    expect(problems(two)).toMatch(/exactly one <tizen:profile/);
    expect(problems(XML.replace(/ *<tizen:profile[^\n]*\n/, ''))).toMatch(/tv-samsung/);
  });

  it('reports a second widget root, stray markup and every missing privilege', () => {
    expect(problems(`${XML}<widget xmlns="x"></widget>\n`)).toMatch(/exactly one <widget> root/);
    expect(problems(XML.replace('<name>Shmup Cup</name>', '<name>Shmup < Cup</name>'))).toMatch(
      /stray < or >/,
    );
    const bare = XML.replace(/ *<tizen:privilege[^\n]*\n/g, '');
    const missing = validateConfigXml(bare).filter((problem) => problem.includes('privilege'));
    expect(missing).toHaveLength(3);
  });

  it('ignores entries inside comments, for validation and for applying a variant', () => {
    const commented = XML.replace(
      '</widget>',
      `  <!-- <tizen:metadata key="${GAME_MODE_METADATA_KEY}" value="false"/> -->\n</widget>`,
    );
    expect(validateConfigXml(commented)).toEqual([]);
    const applied = applyConfigVariant(commented, { gameMode: true });
    expect(validateConfigXml(applied)).toEqual([]);
    expect(applied).toContain(`<tizen:metadata key="${GAME_MODE_METADATA_KEY}" value="true"/>`);
  });

  it('knows exactly the two metadata keys, and an empty gamepad list is invalid', () => {
    expect(KNOWN_METADATA_KEYS).toEqual([GAME_MODE_METADATA_KEY, GAMEPAD_METADATA_KEY]);
    expect(Object.isFrozen(KNOWN_METADATA_KEYS)).toBe(true);
    const empty = XML.replace(
      '</widget>',
      `  <tizen:metadata key="${GAMEPAD_METADATA_KEY}" value=""/>\n</widget>`,
    );
    expect(problems(empty)).toMatch(/model names/);
    const noValue = XML.replace(
      '</widget>',
      `  <tizen:metadata key="${GAME_MODE_METADATA_KEY}"/>\n</widget>`,
    );
    expect(problems(noValue)).toMatch(/must be "true"/);
  });
});

describe('tizen config.xml variant application edges', () => {
  it('puts the metadata right before the last </widget>, on lines of their own', () => {
    const xml = applyConfigVariant(XML, { gameMode: true, gamepads: ['usb_pad-2'] });
    const lines = xml.trimEnd().split('\n');
    expect(lines.slice(-3)).toEqual([
      `  <tizen:metadata key="${GAME_MODE_METADATA_KEY}" value="true"/>`,
      `  <tizen:metadata key="${GAMEPAD_METADATA_KEY}" value="usb_pad-2"/>`,
      '</widget>',
    ]);
    expect(validateConfigXml(xml)).toEqual([]);
  });

  it('refuses empty or spaced gamepad model names', () => {
    expect(() => applyConfigVariant(XML, { gamepads: [''] })).toThrow(/gamepad model/);
    expect(() => applyConfigVariant(XML, { gamepads: ['dual shock'] })).toThrow(/gamepad model/);
    expect(() => applyConfigVariant(XML, { gamepads: ['ok', 'x::y'] })).toThrow(/gamepad model/);
  });

  it('reads the environment strictly: 1 / true (any case, trimmed) only, separators only = none', () => {
    for (const on of ['1', 'true', ' TRUE ', 'True']) {
      expect(variantFromEnv({ TIZEN_GAME_MODE: on }).gameMode, on).toBe(true);
    }
    for (const off of ['', '0', 'yes', 'on', 'false']) {
      expect(variantFromEnv({ TIZEN_GAME_MODE: off }).gameMode, off).toBe(false);
    }
    expect(variantFromEnv({ TIZEN_GAMEPADS: ':: , ::' }).gamepads).toEqual([]);
    expect(variantFromEnv({ TIZEN_GAMEPADS: 'a,b' }).gamepads).toEqual(['a', 'b']);
    expect(isDefaultVariant(variantFromEnv({ TIZEN_GAMEPADS: ' , ' }))).toBe(true);
    expect(variantName(variantFromEnv({ TIZEN_GAMEPADS: 'a' }, 'game-mode'))).toBe(
      'game-mode+gamepad',
    );
  });

  it('reads process.env by default', () => {
    vi.stubEnv('TIZEN_GAME_MODE', '1');
    vi.stubEnv('TIZEN_GAMEPADS', 'dualshock4');
    expect(variantFromEnv()).toEqual({ gameMode: true, gamepads: ['dualshock4'] });
  });
});

describe('tizen vite config configXmlVariant plugin', () => {
  /** The hooks the plugin uses. */
  type Hooks = Plugin & {
    configResolved: (config: { root: string; mode: string; build: { outDir: string } }) => void;
    closeBundle: () => void;
  };

  /**
   * Runs the plugin over a temporary `dist/` holding the default config.xml.
   *
   * @param mode - The Vite mode.
   * @param withFile - Whether `dist/config.xml` exists.
   * @returns The resulting config.xml (or `null` without one) and the console lines.
   */
  function run(mode: string, withFile = true): { xml: string | null; logs: string[] } {
    const root = mkdtempSync(join(tmpdir(), 'shmup-config-variant-'));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    try {
      mkdirSync(join(root, 'dist'));
      if (withFile) writeFileSync(join(root, 'dist', 'config.xml'), XML);
      const plugin = configXmlVariant() as Hooks;
      expect(plugin.name).toBe('shmup:config-xml-variant');
      expect(plugin.apply).toBe('build');
      plugin.configResolved({ root, mode, build: { outDir: 'dist' } });
      plugin.closeBundle();
      const xml = withFile ? readFileSync(join(root, 'dist', 'config.xml'), 'utf8') : null;
      return { xml, logs };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('leaves the default variant byte for byte and says nothing', () => {
    vi.stubEnv('TIZEN_GAME_MODE', undefined);
    vi.stubEnv('TIZEN_GAMEPADS', undefined);
    expect(run('production')).toEqual({ xml: XML, logs: [] });
  });

  it('writes the game-mode variant for --mode game-mode and for TIZEN_GAME_MODE=1', () => {
    vi.stubEnv('TIZEN_GAMEPADS', undefined);
    vi.stubEnv('TIZEN_GAME_MODE', undefined);
    const byMode = run('game-mode');
    expect(byMode.xml).toBe(applyConfigVariant(XML, { gameMode: true }));
    expect(byMode.logs).toEqual(['config.xml: game-mode variant']);
    vi.stubEnv('TIZEN_GAME_MODE', '1');
    expect(run('production').xml).toBe(applyConfigVariant(XML, { gameMode: true }));
  });

  it('writes the gamepad-check variant from TIZEN_GAMEPADS, and validates', () => {
    vi.stubEnv('TIZEN_GAME_MODE', undefined);
    vi.stubEnv('TIZEN_GAMEPADS', 'dualshock4::usbgamepad');
    const { xml, logs } = run('development');
    expect(xml).toContain(`value="dualshock4::usbgamepad"`);
    expect(validateConfigXml(xml ?? '')).toEqual([]);
    expect(logs).toEqual(['config.xml: gamepad variant']);
  });

  it('does nothing when the build wrote no config.xml', () => {
    vi.stubEnv('TIZEN_GAME_MODE', '1');
    expect(run('production', false)).toEqual({ xml: null, logs: [] });
  });
});
