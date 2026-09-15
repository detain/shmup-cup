/**
 * The `config.xml` variants (plan M2-17, `scripts/config-xml.mjs`): the shipped default carries no
 * Samsung metadata and validates; the opt-in game-mode variant (the on-device A/B latency test)
 * and the gamepad-check variant add exactly their metadata and validate; the validator catches
 * broken or incomplete XML; the Vite build writes the variant asked for into `dist/config.xml`
 * and the bundle check validates it.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import {
  GAME_MODE_BUILD_MODE,
  GAME_MODE_METADATA_KEY,
  GAMEPAD_METADATA_KEY,
  REQUIRED_PRIVILEGES,
  applyConfigVariant,
  isDefaultVariant,
  validateConfigXml,
  variantFromEnv,
  variantName,
} from '../../scripts/config-xml.mjs';
import { checkTizenBundle } from '../../scripts/check-bundle.mjs';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
const XML = readFileSync(join(appDir, 'public', 'config.xml'), 'utf8');

/**
 * The `<tizen:metadata>` entries of an XML text.
 *
 * @param xml - The XML.
 * @returns `key=value` strings.
 */
function metadata(xml: string): string[] {
  return [...xml.matchAll(/<tizen:metadata key="([^"]*)" value="([^"]*)"\/>/g)].map(
    ([, key, value]) => `${key}=${value}`,
  );
}

describe('tizen config.xml variants', () => {
  it('ships the default variant: valid, every required privilege, no metadata', () => {
    expect(validateConfigXml(XML)).toEqual([]);
    expect(metadata(XML)).toEqual([]);
    for (const privilege of REQUIRED_PRIVILEGES) expect(XML).toContain(`name="${privilege}"`);
    expect(XML).toContain('http://developer.samsung.com/privilege/productinfo');
  });

  it('adds only the game-mode metadata for the A/B variant, and it validates', () => {
    const xml = applyConfigVariant(XML, { gameMode: true });
    expect(metadata(xml)).toEqual([`${GAME_MODE_METADATA_KEY}=true`]);
    expect(validateConfigXml(xml)).toEqual([]);
    // Everything else stays byte for byte.
    expect(xml.replace(/ {2}<tizen:metadata[^\n]*\n/, '')).toBe(XML);
  });

  it('adds the gamepad check for the listed models, alone or with game mode', () => {
    const pads = applyConfigVariant(XML, { gamepads: ['dualshock4', 'usbgamepad'] });
    expect(metadata(pads)).toEqual([`${GAMEPAD_METADATA_KEY}=dualshock4::usbgamepad`]);
    expect(validateConfigXml(pads)).toEqual([]);
    const both = applyConfigVariant(XML, { gameMode: true, gamepads: ['dualshock4'] });
    expect(metadata(both)).toEqual([
      `${GAME_MODE_METADATA_KEY}=true`,
      `${GAMEPAD_METADATA_KEY}=dualshock4`,
    ]);
    expect(validateConfigXml(both)).toEqual([]);
  });

  it('leaves the default variant untouched and refuses to stack or inject', () => {
    expect(applyConfigVariant(XML, {})).toBe(XML);
    expect(applyConfigVariant(XML, { gameMode: false, gamepads: [] })).toBe(XML);
    const once = applyConfigVariant(XML, { gameMode: true });
    expect(() => applyConfigVariant(once, { gameMode: true })).toThrow(/already/);
    expect(() => applyConfigVariant(XML, { gamepads: ['a"/><evil x="'] })).toThrow(/gamepad model/);
    expect(() => applyConfigVariant('<widget/>', { gameMode: true })).toThrow(/<\/widget>/);
  });

  it('reads the variant from the environment and the Vite mode', () => {
    expect(variantFromEnv({})).toEqual({ gameMode: false, gamepads: [] });
    expect(variantFromEnv({ TIZEN_GAME_MODE: '1' }).gameMode).toBe(true);
    expect(variantFromEnv({ TIZEN_GAME_MODE: 'TRUE' }).gameMode).toBe(true);
    expect(variantFromEnv({ TIZEN_GAME_MODE: '0' }).gameMode).toBe(false);
    expect(variantFromEnv({}, GAME_MODE_BUILD_MODE).gameMode).toBe(true);
    expect(variantFromEnv({}, 'production').gameMode).toBe(false);
    expect(variantFromEnv({ TIZEN_GAMEPADS: ' dualshock4 :: usbgamepad ,x' }).gamepads).toEqual([
      'dualshock4',
      'usbgamepad',
      'x',
    ]);
    expect(variantName({})).toBe('default');
    expect(variantName({ gameMode: true })).toBe('game-mode');
    expect(variantName({ gamepads: ['x'] })).toBe('gamepad');
    expect(variantName({ gameMode: true, gamepads: ['x'] })).toBe('game-mode+gamepad');
    expect(isDefaultVariant({ gamepads: [] })).toBe(true);
  });

  it('catches broken and incomplete config.xml files', () => {
    const problems = (xml: string): string => validateConfigXml(xml).join('\n');
    expect(problems(XML.replace('</widget>', ''))).toMatch(/unclosed <widget>/);
    expect(problems(XML.replace('<name>Shmup Cup</name>', '<name>Shmup Cup</nam>'))).toMatch(
      /closes/,
    );
    expect(problems(XML.replace('<?xml version="1.0" encoding="UTF-8"?>', ''))).toMatch(
      /declaration/,
    );
    expect(
      problems(XML.replace('<tizen:profile name="tv-samsung"/>', '<tizen:profile name="mobile"/>')),
    ).toMatch(/tv-samsung/);
    expect(
      problems(XML.replace(/ *<tizen:privilege name="http:\/\/developer\.samsung[^\n]*\n/, '')),
    ).toMatch(/productinfo privilege/);
    expect(problems(XML.replace('package="ShmpCupGam"', 'package="Short"'))).toMatch(
      /10 alphanumerics/,
    );
    const unknown = XML.replace(
      '</widget>',
      '  <tizen:metadata key="http://samsung.com/tv/metadata/prelaunch.support" value="true"/>\n</widget>',
    );
    expect(problems(unknown)).toMatch(/unknown metadata key/);
    const twice = applyConfigVariant(XML, { gameMode: true }).replace(
      '</widget>',
      `  <tizen:metadata key="${GAME_MODE_METADATA_KEY}" value="true"/>\n</widget>`,
    );
    expect(problems(twice)).toMatch(/appears twice/);
    const off = applyConfigVariant(XML, { gameMode: true }).replace(
      'value="true"',
      'value="false"',
    );
    expect(problems(off)).toMatch(/must be "true"/);
    const badPads = applyConfigVariant(XML, { gamepads: ['a'] }).replace(
      'value="a"',
      'value="a::"',
    );
    expect(problems(badPads)).toMatch(/model names/);
    expect(problems(XML.replace('<content src="index.html"/>', ''))).toMatch(/<content src>/);
  });
});

describe('tizen build writes the config.xml variant', () => {
  it('builds the game-mode variant with --mode game-mode, and the bundle check accepts it', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'shmup-tizen-gamemode-'));
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TIZEN_GAME_MODE', undefined);
    vi.stubEnv('TIZEN_GAMEPADS', undefined);
    try {
      await build({
        root: appDir,
        configFile: join(appDir, 'vite.config.ts'),
        mode: GAME_MODE_BUILD_MODE,
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true },
      });
      const xml = readFileSync(join(outDir, 'config.xml'), 'utf8');
      expect(metadata(xml)).toEqual([`${GAME_MODE_METADATA_KEY}=true`]);
      expect(checkTizenBundle(outDir).problems).toEqual([]);
      // A release build (no debug tools, no live reload) like `pnpm build`.
      const code = readFileSync(join(outDir, 'app.js'), 'utf8');
      expect(code).not.toContain('__shmupDebug');
      expect(code).not.toContain('WebSocket');
    } finally {
      vi.unstubAllEnvs();
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
