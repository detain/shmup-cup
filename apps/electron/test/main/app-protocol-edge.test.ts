/**
 * Edge cases of the app:// → file mapping (path traversal is the security boundary of
 * the desktop build).
 */
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_HOST, APP_SCHEME, resolveAppFile } from '../../src/main/app-protocol.js';

const root = resolve('/srv/shmup/renderer');

describe('electron/main/app-protocol resolveAppFile edge cases', () => {
  it('ignores query strings and fragments', () => {
    expect(resolveAppFile(root, 'app://game/index.html?v=3#top')).toBe(join(root, 'index.html'));
  });

  it('maps a missing trailing slash on the host and nested folders to index.html', () => {
    expect(resolveAppFile(root, 'app://game')).toBe(join(root, 'index.html'));
    expect(resolveAppFile(root, 'app://game/levels/')).toBe(join(root, 'levels', 'index.html'));
  });

  it('accepts a root directory given with a trailing separator', () => {
    expect(resolveAppFile(root + sep, 'app://game/a.png')).toBe(join(root, 'a.png'));
  });

  it('allows file names that merely start with two dots', () => {
    expect(resolveAppFile(root, 'app://game/..hidden.json')).toBe(join(root, '..hidden.json'));
  });

  it('keeps doubled slashes inside the root', () => {
    expect(resolveAppFile(root, 'app://game//etc/passwd')).toBe(join(root, 'etc', 'passwd'));
  });

  it('rejects malformed percent-encoding instead of throwing', () => {
    expect(resolveAppFile(root, 'app://game/%E0%A4%A')).toBeNull();
    expect(resolveAppFile(root, 'app://game/%')).toBeNull();
  });

  it('rejects every encoded traversal variant', () => {
    for (const path of [
      '..%2f..%2fsecret',
      '..%2F..%2Fsecret',
      'assets%2f..%2f..%2fsecret',
      '%2e%2e%2fsecret',
      '..%5csecret',
      'a%5c..%5c..%5csecret',
    ]) {
      expect(resolveAppFile(root, `app://game/${path}`), path).toBeNull();
    }
  });

  it('refuses a sibling directory that shares the root prefix', () => {
    expect(resolveAppFile(root, 'app://game/..%2frenderer-evil%2fx.js')).toBeNull();
  });

  it('only answers the app scheme on the exact game host', () => {
    expect(resolveAppFile(root, `${APP_SCHEME}://${APP_HOST}/x.js`)).toBe(join(root, 'x.js'));
    expect(resolveAppFile(root, 'app://game:8080/x.js')).toBeNull();
    expect(resolveAppFile(root, 'app://game.evil/x.js')).toBeNull();
    expect(resolveAppFile(root, 'http://game/x.js')).toBeNull();
    expect(resolveAppFile(root, 'app:game/x.js')).toBeNull();
    expect(resolveAppFile(root, '')).toBeNull();
  });
});
