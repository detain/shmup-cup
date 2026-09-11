import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ENTRY_URL, resolveAppFile } from '../../src/main/app-protocol.js';

const root = resolve('/srv/shmup/renderer');

describe('electron/main/app-protocol resolveAppFile', () => {
  it('maps app://game/ URLs into the renderer directory', () => {
    expect(APP_ENTRY_URL).toBe('app://game/index.html');
    expect(resolveAppFile(root, APP_ENTRY_URL)).toBe(join(root, 'index.html'));
    expect(resolveAppFile(root, 'app://game/assets/index-abc.js')).toBe(
      join(root, 'assets', 'index-abc.js'),
    );
    expect(resolveAppFile(root, 'app://game/')).toBe(join(root, 'index.html'));
    expect(resolveAppFile(root, 'app://game/assets/my%20file.png')).toBe(
      join(root, 'assets', 'my file.png'),
    );
  });

  it('rejects other schemes/hosts and path traversal', () => {
    expect(resolveAppFile(root, 'file:///etc/passwd')).toBeNull();
    expect(resolveAppFile(root, 'app://evil/index.html')).toBeNull();
    // Dot segments are resolved (and clamped at "/") by the URL parser itself …
    expect(resolveAppFile(root, 'app://game/%2e%2e/%2e%2e/secret.txt')).toBe(
      join(root, 'secret.txt'),
    );
    // … but an encoded slash only becomes a separator after decoding: must be refused.
    expect(resolveAppFile(root, 'app://game/..%2fsecret.txt')).toBeNull();
    expect(resolveAppFile(root, 'app://game/..%5c..%5csecret.txt')).toBeNull();
    expect(resolveAppFile(root, 'app://game/a%00b')).toBeNull();
    expect(resolveAppFile(root, 'not a url')).toBeNull();
  });
});
