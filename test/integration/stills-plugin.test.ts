/**
 * The `shmupStills()` Vite plugin (plan v20x A4): the URL dir agrees with the shell manifest, a
 * build emits the kit's files into `assets/stills/` under fixed names (and only the shaped
 * ones), the dev server serves them with no caching and lets anything else through, and every
 * app uses the plugin. The kit itself is never run here (a custom `sourceDir` disables it).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { STILLS_URL_DIR as PLUGIN_STILLS_URL_DIR, shmupStills } from '../../vite.shared.js';
// A relative source import (the video-plugin precedent): the root package does not depend on
// `@shmup/shell`, and two shared constants are no reason to add it.
import {
  STILL_SURFACES,
  STILLS_URL_DIR as SHELL_STILLS_URL_DIR,
} from '../../packages/shell/src/stills/index.js';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-stills-plugin-'));
const stillsDir = join(tmp, 'stills');
mkdirSync(stillsDir, { recursive: true });

/** The fixture kit output: stills, sidecars, ledger, licences — and one temp file to refuse. */
const FIXTURES: readonly [string, string][] = [
  ['ending-citadel-falls.png', 'fake-png-1'],
  ['ending-deep-is-still.png', 'fake-png-2'],
  ['ending-citadel-falls.art.json', '{"origin":"model"}'],
  ['stills-ledger.json', '{"stills":[]}'],
  ['LICENSES-stills.md', '# licences'],
  ['ending-citadel-falls.rerun-ending-citadel-falls.png', 'temp file the pattern must refuse'],
];
for (const [name, body] of FIXTURES) {
  writeFileSync(join(stillsDir, name), body, 'utf8');
}

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** One collected emit. */
interface Emitted {
  fileName: string;
  source: string;
}

/**
 * Runs the plugin's `buildStart` with a recording `emitFile`.
 *
 * @param sourceDir - The fixture directory.
 * @param noStills - Bake `SHMUP_NO_STILLS=1` for this call (the still-less variant).
 * @returns The emitted files.
 */
function emitBuild(sourceDir: string, noStills = false): Emitted[] {
  const plugin = shmupStills({ sourceDir });
  const emitted: Emitted[] = [];
  const context = {
    emitFile(file: { fileName: string; source: string | Uint8Array }): void {
      emitted.push({
        fileName: file.fileName,
        source: typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString(),
      });
    },
  };
  // The kill switch reads the environment (v20x-CIFIX2, the video plugin's law): the helper sets
  // SHMUP_NO_STILLS exactly as the caller means and restores the ambient value afterwards.
  const saved = process.env.SHMUP_NO_STILLS;
  if (noStills) process.env.SHMUP_NO_STILLS = '1';
  else delete process.env.SHMUP_NO_STILLS;
  try {
    (plugin.buildStart as (this: unknown) => void).call(context);
  } finally {
    if (saved === undefined) delete process.env.SHMUP_NO_STILLS;
    else process.env.SHMUP_NO_STILLS = saved;
  }
  return emitted;
}

describe('shmupStills — the URL dir and the manifest', () => {
  it('the plugin and the shell stills manifest name the same directory', () => {
    expect(PLUGIN_STILLS_URL_DIR).toBe(SHELL_STILLS_URL_DIR);
    expect(SHELL_STILLS_URL_DIR).toBe('assets/stills');
  });

  it('the app configs all install the plugin', () => {
    for (const app of ['web', 'tizen', 'webos']) {
      const config = readFileSync(
        fileURLToPath(new URL(`../../apps/${app}/vite.config.ts`, import.meta.url)),
        'utf8',
      );
      expect(config).toContain('shmupStills()');
    }
  });
});

describe('shmupStills — build emit', () => {
  it('emits the shaped files under fixed names and refuses the rerun temp', () => {
    const emitted = emitBuild(stillsDir);
    const names = emitted.map((file) => file.fileName).sort();
    expect(names).toEqual([
      'assets/stills/LICENSES-stills.md',
      'assets/stills/ending-citadel-falls.art.json',
      'assets/stills/ending-citadel-falls.png',
      'assets/stills/ending-deep-is-still.png',
      'assets/stills/stills-ledger.json',
    ]);
    const still = emitted.find(
      (file) => file.fileName === 'assets/stills/ending-citadel-falls.png',
    );
    expect(still?.source).toBe('fake-png-1');
  });

  it('a directory that does not exist emits nothing (the still-less build)', () => {
    expect(emitBuild(join(tmp, 'absent'))).toEqual([]);
  });

  it('SHMUP_NO_STILLS=1 bakes the still-less build — the kit ships nothing (v20x-CIFIX2)', () => {
    expect(emitBuild(stillsDir, true)).toEqual([]);
  });

  it('names every manifest file after its id', () => {
    for (const row of STILL_SURFACES) expect(row.file).toBe(`${row.id}.png`);
  });
});

describe('shmupStills — dev server', () => {
  it('serves the stills with no-cache and lets other paths through', async () => {
    const server = await createServer({
      configFile: false,
      plugins: [shmupStills({ sourceDir: stillsDir })],
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (typeof address !== 'object' || address === null) throw new Error('no server address');
    const base = `http://localhost:${address.port}`;
    try {
      const still = await fetch(`${base}/${PLUGIN_STILLS_URL_DIR}/ending-citadel-falls.png`);
      expect(still.status).toBe(200);
      expect(still.headers.get('content-type')).toBe('image/png');
      expect(still.headers.get('cache-control')).toBe('no-cache');
      expect(await still.text()).toBe('fake-png-1');
      const missing = await fetch(`${base}/${PLUGIN_STILLS_URL_DIR}/nope.png`);
      expect(missing.status).toBe(404);
      // The encoded traversal reaches the middleware (fetch would normalise a plain one); the
      // file pattern must refuse it and Vite answers 404 for the leftover path.
      const traversal = await fetch(
        `${base}/${PLUGIN_STILLS_URL_DIR}/%2e%2e%2f%2e%2e%2fpackage.json`,
      );
      expect(traversal.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
