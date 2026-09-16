/**
 * `scripts/appinfo.mjs` (plan M3-03): the committed `public/appinfo.json` is the manifest
 * `ares-package` would read, and the validator that stands in for the CLI no agent can run.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APPINFO_KEYS, validateAppInfo } from '../../scripts/appinfo.mjs';
import pkg from '../../package.json' with { type: 'json' };

/** The committed manifest's text. */
const text = readFileSync(
  fileURLToPath(new URL('../../public/appinfo.json', import.meta.url)),
  'utf8',
);

describe('webos appinfo.json (M3-03)', () => {
  it('validates the committed manifest', () => {
    expect(validateAppInfo(text)).toEqual([]);
  });

  it('names the app id, the entry point, the icons and 1920x1080', () => {
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(json).toMatchObject({
      id: 'dev.shmupcup.game',
      type: 'web',
      main: 'index.html',
      title: 'Shmup Cup',
      icon: 'icon.png',
      largeIcon: 'largeIcon.png',
      resolution: '1920x1080',
      disableBackHistoryAPI: true,
    });
    for (const key of Object.keys(json)) expect(APPINFO_KEYS).toContain(key);
  });

  it('carries the numeric core of the package version (webOS takes major.minor.patch only)', () => {
    const json = JSON.parse(text) as { version: string };
    expect(json.version).toBe(pkg.version.replace(/-.*$/, ''));
  });

  it('reports bad JSON, unknown fields, a bad id, a bad version and the wrong type', () => {
    expect(validateAppInfo('{')[0]).toMatch(/not valid JSON/);
    expect(validateAppInfo('[]')).toEqual(['appinfo.json must be a JSON object']);
    const base = JSON.parse(text) as Record<string, unknown>;
    const withField = validateAppInfo(JSON.stringify({ ...base, wobble: 1 }));
    expect(withField).toContain('appinfo.json: unknown field "wobble"');
    expect(validateAppInfo(JSON.stringify({ ...base, id: 'Shmup Cup' }))).toContain(
      'appinfo.json: "id" must be a reverse-DNS app id, got "Shmup Cup"',
    );
    expect(validateAppInfo(JSON.stringify({ ...base, version: '1.0.0-rc.1' }))).toContain(
      'appinfo.json: "version" must be <major>.<minor>.<patch>, got "1.0.0-rc.1"',
    );
    expect(validateAppInfo(JSON.stringify({ ...base, type: 'native' }))).toContain(
      'appinfo.json: "type" must be "web"',
    );
    expect(validateAppInfo(JSON.stringify({ ...base, main: 'game.html' }))).toContain(
      'appinfo.json: "main" must be "index.html"',
    );
  });

  it('insists the app owns Back: disableBackHistoryAPI must be true', () => {
    const base = JSON.parse(text) as Record<string, unknown>;
    expect(validateAppInfo(JSON.stringify({ ...base, disableBackHistoryAPI: false }))).toContain(
      'appinfo.json: "disableBackHistoryAPI" must be true (the game owns Back = 461)',
    );
  });

  it('reports a missing required string', () => {
    const base = JSON.parse(text) as Record<string, unknown>;
    delete base.vendor;
    expect(validateAppInfo(JSON.stringify(base))).toContain(
      'appinfo.json: "vendor" must be a non-empty string',
    );
  });
});
