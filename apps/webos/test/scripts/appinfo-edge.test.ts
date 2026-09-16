/**
 * `scripts/appinfo.mjs` — every error path of the validator that stands in for `ares-package`
 * (plan M3-03).
 *
 * This validator is the *only* thing between a malformed manifest and a package the LG launcher
 * would refuse, because no agent can run `ares-package` (plan §8.7). So each rule is checked on
 * its own, each required field is checked for each way it can be wrong, and the committed
 * manifest is checked against the icons that are actually in `public/`.
 *
 * @module
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APPINFO_ID_PATTERN,
  APPINFO_KEYS,
  APPINFO_VERSION_PATTERN,
  validateAppInfo,
} from '../../scripts/appinfo.mjs';

/** The committed manifest's text. */
const text = readFileSync(
  fileURLToPath(new URL('../../public/appinfo.json', import.meta.url)),
  'utf8',
);

/** The committed manifest, parsed. */
const base = JSON.parse(text) as Record<string, unknown>;

/** Fields that must be non-empty strings. */
const REQUIRED_STRINGS = ['id', 'version', 'vendor', 'type', 'main', 'title', 'icon', 'largeIcon'];

/**
 * Validates the committed manifest with one field changed.
 *
 * @param over - Fields to override (a value of `undefined` deletes the field).
 * @returns The problems reported.
 */
function withField(over: Record<string, unknown>): string[] {
  const json: Record<string, unknown> = { ...base };
  for (const key of Object.keys(over)) {
    if (over[key] === undefined) delete json[key];
    else json[key] = over[key];
  }
  return validateAppInfo(JSON.stringify(json));
}

describe('webos appinfo — the required strings (M3-03)', () => {
  it.each(REQUIRED_STRINGS)('reports "%s" missing, empty or not a string', (key) => {
    const message = `appinfo.json: "${key}" must be a non-empty string`;
    for (const value of [undefined, '', 1, null, true, [], {}]) {
      expect(
        withField({ [key]: value }),
        `${key} = ${JSON.stringify(value) ?? 'undefined'}`,
      ).toContain(message);
    }
  });

  it('reports only that one problem when the field is simply absent', () => {
    // A missing `vendor` has no shape rule of its own, so exactly one message comes back.
    expect(withField({ vendor: undefined })).toEqual([
      'appinfo.json: "vendor" must be a non-empty string',
    ]);
  });

  it('does not double-report a bad id or version — the shape rule needs a string first', () => {
    expect(withField({ id: 42 })).toEqual(['appinfo.json: "id" must be a non-empty string']);
    expect(withField({ version: 42 })).toEqual([
      'appinfo.json: "version" must be a non-empty string',
    ]);
  });
});

describe('webos appinfo — the id and the version (M3-03)', () => {
  it('accepts reverse-DNS ids and refuses everything else', () => {
    for (const id of ['dev.shmupcup.game', 'a.b', 'com.example.app1', 'x1.y2.z3']) {
      expect(APPINFO_ID_PATTERN.test(id), id).toBe(true);
      expect(withField({ id }), id).toEqual([]);
    }
    for (const id of [
      'game', // no dot
      'Dev.ShmupCup.Game', // upper case
      'dev..game', // empty label
      '.dev.game', // leading dot
      'dev.game.', // trailing dot
      '1dev.game', // starts with a digit
      'dev.game-x', // hyphen
      'dev shmup.game', // space
    ]) {
      expect(APPINFO_ID_PATTERN.test(id), id).toBe(false);
      expect(withField({ id }), id).toContain(
        `appinfo.json: "id" must be a reverse-DNS app id, got "${id}"`,
      );
    }
  });

  it('wants three numbers, never a pre-release tag', () => {
    for (const version of ['1.0.0', '0.0.1', '10.20.30', '2026.9.16']) {
      expect(APPINFO_VERSION_PATTERN.test(version), version).toBe(true);
      expect(withField({ version }), version).toEqual([]);
    }
    for (const version of ['1.0', '1.0.0.0', '1.0.0-rc.1', 'v1.0.0', '1.0.0 ', '1.0.x']) {
      expect(APPINFO_VERSION_PATTERN.test(version), version).toBe(false);
      expect(withField({ version }), version).toContain(
        `appinfo.json: "version" must be <major>.<minor>.<patch>, got "${version}"`,
      );
    }
  });
});

describe('webos appinfo — the fields the game depends on (M3-03)', () => {
  it('lets resolution be absent, but only ever 1920x1080', () => {
    expect(withField({ resolution: undefined })).toEqual([]);
    expect(withField({ resolution: '1920x1080' })).toEqual([]);
    for (const resolution of ['1280x720', '3840x2160', '1920X1080', 1920]) {
      expect(withField({ resolution }), String(resolution)).toContain(
        'appinfo.json: "resolution" must be "1920x1080" (the game renders 384x216 x5)',
      );
    }
  });

  it('insists on disableBackHistoryAPI — anything but `true` loses the app its Back key', () => {
    for (const value of [undefined, false, 'true', 1, null]) {
      expect(
        withField({ disableBackHistoryAPI: value }),
        JSON.stringify(value) ?? 'undefined',
      ).toContain('appinfo.json: "disableBackHistoryAPI" must be true (the game owns Back = 461)');
    }
    expect(withField({ disableBackHistoryAPI: true })).toEqual([]);
  });

  it('takes requiredPermissions only as an array, and only when present', () => {
    expect(withField({ requiredPermissions: undefined })).toEqual([]);
    expect(withField({ requiredPermissions: [] })).toEqual([]);
    expect(withField({ requiredPermissions: ['time.query'] })).toEqual([]);
    for (const value of ['time.query', {}, 1, true, null]) {
      expect(withField({ requiredPermissions: value }), JSON.stringify(value)).toContain(
        'appinfo.json: "requiredPermissions" must be an array',
      );
    }
  });

  it('reports every unknown field, one message each, and keeps checking the rest', () => {
    const problems = withField({ wobble: 1, wibble: 2, type: 'native' });
    expect(problems).toEqual([
      'appinfo.json: unknown field "wobble"',
      'appinfo.json: unknown field "wibble"',
      'appinfo.json: "type" must be "web"',
    ]);
  });

  it('refuses JSON that is not an object, before anything else', () => {
    for (const text of ['[]', '"x"', '1', 'true', 'null']) {
      expect(validateAppInfo(text), text).toEqual(['appinfo.json must be a JSON object']);
    }
    expect(validateAppInfo('')[0]).toMatch(/not valid JSON/);
    expect(validateAppInfo('{"id":}')[0]).toMatch(/not valid JSON/);
    // One message only: a broken file is not also "missing every field".
    expect(validateAppInfo('{')).toHaveLength(1);
  });
});

describe('webos appinfo — the committed manifest matches what is packaged (M3-03)', () => {
  it('names icons that really exist in public/', () => {
    for (const key of ['icon', 'largeIcon']) {
      const file = base[key] as string;
      const path = fileURLToPath(new URL(`../../public/${file}`, import.meta.url));
      expect(existsSync(path), `${key}: ${file}`).toBe(true);
    }
  });

  it('uses only known keys and validates as written', () => {
    expect(validateAppInfo(text)).toEqual([]);
    for (const key of Object.keys(base)) expect(APPINFO_KEYS, key).toContain(key);
    expect(Object.isFrozen(APPINFO_KEYS)).toBe(true);
  });

  it('is pretty-printed JSON that round-trips — `ares-package` reads it verbatim', () => {
    expect(`${JSON.stringify(base, null, 2)}\n`).toBe(text);
  });
});
