/**
 * config.xml must agree with the rest of the app: the CLI scripts launch the id it
 * declares, the files it names exist, and the settings Tizen 5.5 certification needs are
 * present.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_ID } from '../../scripts/tizen-env.mjs';
import { REMOTE_KEYS_TO_REGISTER } from '../../src/platform/index.js';

const publicDir = new URL('../../public/', import.meta.url);
const xml = readFileSync(new URL('config.xml', publicDir), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

/**
 * Reads one attribute of the first element with the given tag.
 *
 * @param tag - Element name (with prefix).
 * @param attribute - Attribute name.
 * @returns The attribute value, or `undefined`.
 */
function attr(tag: string, attribute: string): string | undefined {
  const element = new RegExp(`<${tag}\\b([^>]*)>`).exec(xml)?.[1] ?? '';
  return new RegExp(`\\b${attribute}="([^"]*)"`).exec(element)?.[1];
}

describe('tizen/public/config.xml consistency', () => {
  it('declares the application id the tizen:run script launches', () => {
    expect(attr('tizen:application', 'id')).toBe(APP_ID);
    expect(APP_ID.startsWith(`${attr('tizen:application', 'package') ?? '?'}.`)).toBe(true);
  });

  it('carries the release version of the package manifests (0.1.0 = M1, plan M1-19)', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const root = JSON.parse(
      readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(attr('widget', 'version')).toBe(pkg.version);
    expect(pkg.version).toBe(root.version);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('targets Tizen 5.5 or newer', () => {
    expect(attr('tizen:application', 'required_version')).toBe('5.5');
  });

  it('points at files that exist (index.html is emitted by Vite, icon.png is in public/)', () => {
    expect(attr('content', 'src')).toBe('index.html');
    expect(existsSync(new URL('../../index.html', import.meta.url))).toBe(true);
    const icon = attr('icon', 'src') ?? '';
    expect(icon).toBe('icon.png');
    const png = readFileSync(new URL(icon, publicDir));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('enables hardware keys (Back 10009 reaches the app) and disables the context menu', () => {
    expect(attr('tizen:setting', 'hwkey-event')).toBe('enable');
    expect(attr('tizen:setting', 'context-menu')).toBe('disable');
    expect(attr('tizen:setting', 'screen-orientation')).toBe('landscape');
  });

  it('holds the tv.inputdevice privilege because the platform registers extra remote keys', () => {
    expect(REMOTE_KEYS_TO_REGISTER.length).toBeGreaterThan(0);
    expect(xml).toMatch(
      /<tizen:privilege name="http:\/\/tizen\.org\/privilege\/tv\.inputdevice"\/>/,
    );
  });

  it('declares exactly one profile, tv-samsung', () => {
    expect(xml.match(/<tizen:profile\b/g)).toHaveLength(1);
    expect(attr('tizen:profile', 'name')).toBe('tv-samsung');
  });

  it('uses the original game name only', () => {
    expect(/<name>([^<]*)<\/name>/.exec(xml)?.[1]).toBe('Shmup Cup');
    expect(xml).not.toMatch(/gradius|darius|konami|taito/i);
  });
});
