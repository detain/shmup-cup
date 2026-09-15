/**
 * The debug tools' M2-17 additions: `window.__shmupDebug.save` (export the save the game plays
 * with, import one — parsed like a stored save and written —, the storage usage when the platform's
 * storage can report it) and the overlay's device line fed from `DebugToolsOptions.device`.
 */
import {
  DEFAULT_GAME_CONFIG,
  EMPTY_CONTENT_DB,
  createGame,
  createHeadlessPlatform,
  createHiScoreEntry,
  createMemoryStorage,
  createSaveStore,
  hiScoreModeKey,
  loadSave,
  type Platform,
  type SaveStore,
} from '@shmup/core';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { createDebugTools, type DebugToolsOptions } from '../../src/debug/index.js';
import { createWebStorage } from '../../src/storage/index.js';

const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  drawCalls: -1,
  particles: null,
} as unknown as PixiRenderer;

/**
 * Tools on a fake host.
 *
 * @param platform - The game's platform.
 * @param save - The save store (or none).
 * @param options - Tool options.
 * @returns The tools.
 */
function tools(platform: Platform, save: SaveStore | null, options: DebugToolsOptions = {}) {
  const game = createGame(platform, {}, EMPTY_CONTENT_DB);
  return createDebugTools(
    {
      game,
      renderer,
      win: new EventTarget() as unknown as Window,
      now: () => 0,
      bootMs: 0,
      save,
      sceneId: () => 'title',
      visibleWorld: () => null,
    },
    options,
  );
}

describe('shell/debug save export / import (M2-17)', () => {
  it('exports the save and imports another one into the storage', async () => {
    const storage = createMemoryStorage();
    const platform = { ...createHeadlessPlatform(), storage };
    const save = createSaveStore(storage);
    const t = tools(platform, save);
    const api = t.api.save;
    expect(api).not.toBeNull();
    const empty = api?.export() ?? '';
    expect(JSON.parse(empty)).toMatchObject({ version: 2, hiScores: {} });

    const other = createSaveStore(null);
    other.recordScore(hiScoreModeKey(DEFAULT_GAME_CONFIG), createHiScoreEntry(4200));
    const imported = await api?.import(JSON.stringify(other.data));
    expect(imported).toMatchObject({ ok: true, status: 'ok', written: true });
    expect(save.bestScore(hiScoreModeKey(DEFAULT_GAME_CONFIG))).toBe(4200);
    expect((await loadSave(storage)).data.hiScores).toEqual(other.data.hiScores);
    expect(api?.export()).toContain('4200');

    const refused = await api?.import('{broken');
    expect(refused).toMatchObject({ ok: false, status: 'corrupt' });
    expect(save.bestScore(hiScoreModeKey(DEFAULT_GAME_CONFIG))).toBe(4200);
    t.destroy();
  });

  it('reports the storage usage when the platform storage can tell, else null', async () => {
    const entries = new Map<string, string>();
    const web = createWebStorage({
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value);
      },
    });
    const withUsage = tools({ ...createHeadlessPlatform(), storage: web }, createSaveStore(web));
    await withUsage.api.save?.import('{"version":2}');
    expect(withUsage.api.save?.usage()).toMatchObject({ keys: 1, persistent: true });
    const plain = tools(createHeadlessPlatform(), createSaveStore(null));
    expect(plain.api.save?.usage()).toBeNull();
  });

  it('has no save API without a save store', () => {
    expect(tools(createHeadlessPlatform(), null).api.save).toBeNull();
  });

  it('feeds the overlay its device line every frame, only rewriting it when it changed', () => {
    const device = { line: '' };
    const t = tools(createHeadlessPlatform(), null, { device: () => device.line });
    const values = t.overlay.panel.values;
    const revision = (): number => (values as unknown as { revision: number }).revision;
    t.beforeRender();
    expect(values.strings).not.toContain('QN43 FW T-1 1920x1080@1 C69 GL1/4096');
    device.line = 'QN43 FW T-1 1920x1080@1 C69 GL1/4096';
    t.beforeRender();
    expect(values.strings).toContain('QN43 FW T-1 1920x1080@1 C69 GL1/4096');
    const before = revision();
    t.beforeRender();
    expect(revision()).toBe(before);
    t.destroy();
  });
});
