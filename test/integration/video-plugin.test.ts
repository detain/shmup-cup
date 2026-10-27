/**
 * The `shmupVideos()` Vite plugin (v2 R7-VID): the URL dir agrees with the shell manifest, a
 * build emits the kit's files into `assets/video/` under fixed names (and only the shaped
 * ones), the dev server serves them with no caching and lets anything else through, and every
 * app uses the plugin. The kit itself is never run here (a custom `sourceDir` disables it).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { VIDEO_URL_DIR as PLUGIN_VIDEO_URL_DIR, shmupVideos } from '../../vite.shared.js';
// A relative source import (the assets-plugin test's precedent): the root package does not
// depend on `@shmup/shell`, and two shared constants are no reason to add it.
import {
  VIDEO_CLIPS,
  VIDEO_URL_DIR as SHELL_VIDEO_URL_DIR,
} from '../../packages/shell/src/cutscene/index.js';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-video-plugin-'));
const clipsDir = join(tmp, 'video');
mkdirSync(clipsDir, { recursive: true });

/** The fixture kit output: clips, sidecars, ledger, licences — and one temp file to refuse. */
const FIXTURES: readonly [string, string][] = [
  ['title-sting.mp4', 'fake-clip-bytes'],
  ['attract-ambient.mp4', 'fake-clip-bytes-2'],
  ['title-sting.art.json', '{"origin":"model"}'],
  ['video-ledger.json', '{"formatVersion":1,"clips":[]}'],
  ['LICENSES-videos.md', '# licences'],
  ['title-sting.rerun-title-sting.mp4', 'temp file the pattern must refuse'],
];
for (const [name, body] of FIXTURES) {
  writeFileSync(join(clipsDir, name), body, 'utf8');
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
 * @returns The emitted files.
 */
function emitBuild(sourceDir: string): Emitted[] {
  const plugin = shmupVideos({ sourceDir });
  const emitted: Emitted[] = [];
  const context = {
    emitFile(file: { fileName: string; source: string | Uint8Array }): void {
      emitted.push({
        fileName: file.fileName,
        source: typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString(),
      });
    },
  };
  (plugin.buildStart as (this: unknown) => void).call(context);
  return emitted;
}

describe('shmupVideos — the URL dir and the manifest', () => {
  it('the plugin and the shell cutscene manifest name the same directory', () => {
    expect(PLUGIN_VIDEO_URL_DIR).toBe(SHELL_VIDEO_URL_DIR);
    expect(SHELL_VIDEO_URL_DIR).toBe('assets/video');
  });

  it('the app configs all install the plugin', () => {
    for (const app of ['web', 'tizen', 'webos']) {
      const config = readFileSync(
        fileURLToPath(new URL(`../../apps/${app}/vite.config.ts`, import.meta.url)),
        'utf8',
      );
      expect(config).toContain('shmupVideos()');
    }
  });
});

describe('shmupVideos — build emit', () => {
  it('emits the shaped files under fixed names and refuses the rerun temp', () => {
    const emitted = emitBuild(clipsDir);
    const names = emitted.map((file) => file.fileName).sort();
    expect(names).toEqual([
      'assets/video/LICENSES-videos.md',
      'assets/video/attract-ambient.mp4',
      'assets/video/title-sting.art.json',
      'assets/video/title-sting.mp4',
      'assets/video/video-ledger.json',
    ]);
    const clip = emitted.find((file) => file.fileName === 'assets/video/title-sting.mp4');
    expect(clip?.source).toBe('fake-clip-bytes');
  });

  it('a directory that does not exist emits nothing (the video-less build)', () => {
    expect(emitBuild(join(tmp, 'absent'))).toEqual([]);
  });

  it('names every manifest file after its id', () => {
    for (const row of VIDEO_CLIPS) expect(row.file).toBe(`${row.id}.mp4`);
  });
});

describe('shmupVideos — dev server', () => {
  it('serves the clips with no-cache and lets other paths through', async () => {
    const server = await createServer({
      configFile: false,
      plugins: [shmupVideos({ sourceDir: clipsDir })],
      logLevel: 'silent',
      server: { port: 0, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (typeof address !== 'object' || address === null) throw new Error('no server address');
    const base = `http://localhost:${address.port}`;
    try {
      const clip = await fetch(`${base}/${PLUGIN_VIDEO_URL_DIR}/title-sting.mp4`);
      expect(clip.status).toBe(200);
      expect(clip.headers.get('content-type')).toBe('video/mp4');
      expect(clip.headers.get('cache-control')).toBe('no-cache');
      expect(await clip.text()).toBe('fake-clip-bytes');
      const missing = await fetch(`${base}/${PLUGIN_VIDEO_URL_DIR}/nope.mp4`);
      expect(missing.status).toBe(404);
      // The encoded traversal reaches the middleware (fetch would normalise a plain one); the
      // file pattern must refuse it and Vite answers 404 for the leftover path.
      const traversal = await fetch(
        `${base}/${PLUGIN_VIDEO_URL_DIR}/%2e%2e%2f%2e%2e%2fpackage.json`,
      );
      expect(traversal.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
