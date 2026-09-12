/**
 * Tests for bootShell() with a fake window, fake images and a fake renderer (no WebGL in
 * Node; the atlas is built for real over fake page images): the boot order, the free-flight,
 * showcase and calibration scenes, the frame loop (ticks → event dispatch → render), audio unlock policies,
 * lifecycle and resize wiring, stop(), and every failure path of the boot error screen; the save
 * read before the title, the Options screen applied live, blur and the boot timing (M1-17).
 */
import {
  Action,
  MUSIC_CUES,
  SAVE_CORRUPT_KEY,
  SAVE_STORAGE_KEY,
  SFX_CUES,
  SimEventKind,
  UserOptionKind,
  addScore,
  commitPlayerInput,
  createHeadlessPlatform,
  volumeGain,
  type IAudio,
  type InputContext,
  type Platform,
  type RenderFrame,
} from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  BOOT_MS_ATTRIBUTE,
  BOOT_STATE_ATTRIBUTE,
  SCENE_ATTRIBUTE,
  DEFAULT_STAGE_ID,
  SHELL_SCENES,
  ShellBootError,
  bootShell,
  moduleInfo,
  defaultStageId,
  sceneFromSearch,
  type ShellInput,
  type ShellInputProfiles,
  type ShellOptions,
} from '../../src/boot/index.js';
import type { DebugToolsFactory, DebugToolsHost } from '../../src/debug/index.js';
import type { BootOverlay } from '../../src/error-screen/index.js';
import type { LoadableImage } from '../../src/loader/index.js';
import { FLIGHT_SPRITES } from '../../src/flight/index.js';
import { SCENE_VIEW_SPRITES } from '../../src/scene-view/index.js';
import { SHOWCASE_SPRITES } from '../../src/showcase/index.js';
import { FakeContext } from '../../../audio-web/test/helpers/fake-context.js';

const fakes = vi.hoisted(() => ({
  rendererOptions: null as Record<string, unknown> | null,
  rendererFails: false,
  spriteNames: [] as Array<readonly string[]>,
  bound: [] as unknown[],
  frames: [] as Array<{ tick: number; world: unknown; hudCount: number; uiCount: number }>,
  sizes: [] as Array<[number, number]>,
  destroyed: 0,
  /** The fx content handed to the renderer. */
  fxContent: null as RenderPixi.FxContent | null,
  /** Calls into the fake renderer's particles and popups: `[method, ...args]`. */
  fxCalls: [] as unknown[][],
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    createPixiRenderer: (options: Record<string, unknown>) => {
      fakes.rendererOptions = options;
      if (fakes.rendererFails) return Promise.reject(new Error('WebGL unavailable'));
      return Promise.resolve({
        width: 384,
        height: 216,
        webGLVersion: 1,
        effects: real.createScreenEffects(),
        particles: {
          get content() {
            return fakes.fxContent ?? real.EMPTY_FX_CONTENT;
          },
          emit: (...args: unknown[]) => fakes.fxCalls.push(['emit', ...args]),
          emitFxCue: (...args: unknown[]) => fakes.fxCalls.push(['emitFxCue', ...args]),
          emitSfxCue: (...args: unknown[]) => fakes.fxCalls.push(['emitSfxCue', ...args]),
          clear: () => fakes.fxCalls.push(['clearParticles']),
        },
        popups: {
          show: (...args: unknown[]) => fakes.fxCalls.push(['show', ...args]),
          clear: () => fakes.fxCalls.push(['clearPopups']),
        },
        setFxContent: (content: RenderPixi.FxContent) => {
          fakes.fxContent = content;
        },
        setSpriteNames: (names: readonly string[]) => fakes.spriteNames.push(names),
        bindWorld: (world: unknown) => fakes.bound.push(world),
        render: (frame: RenderFrame) =>
          fakes.frames.push({
            tick: frame.tick,
            world: frame.world,
            hudCount: frame.hud.count,
            uiCount: frame.ui.count,
          }),
        resize: (w: number, h: number) => fakes.sizes.push([w, h]),
        destroy: () => {
          fakes.destroyed++;
        },
      });
    },
  };
});

const STEP = 1000 / 60;
const { manifest } = buildAtlas();
const pageUrls = manifest.pages.map((page) => `assets/atlas/${page.file}`);
const contentFiles = readContentFiles();

/** An image that loads asynchronously with the manifest page size (URLs with `bad` fail). */
class FakeImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  private url = '';

  constructor(private readonly size: [number, number] | null = null) {}

  get src(): string {
    return this.url;
  }

  set src(value: string) {
    this.url = value;
    setTimeout(() => {
      if (value.includes('bad')) {
        this.onerror?.call(null as never, 'error');
        return;
      }
      const page = manifest.pages.find((p) => value.endsWith(p.file));
      [this.width, this.height] = this.size ?? [page?.w ?? 1, page?.h ?? 1];
      [this.naturalWidth, this.naturalHeight] = [this.width, this.height];
      this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

/** A window with rAF, listeners and a size. */
class FakeWindow extends EventTarget {
  innerWidth = 1920;
  innerHeight = 1080;
  private pending: ((now: number) => void) | null = null;
  cancelled = 0;

  requestAnimationFrame(callback: (now: number) => void): number {
    this.pending = callback;
    return 1;
  }

  cancelAnimationFrame(): void {
    this.cancelled++;
    this.pending = null;
  }

  /**
   * Runs the pending animation frame.
   *
   * @param now - rAF timestamp.
   */
  frame(now: number): void {
    const callback = this.pending;
    this.pending = null;
    callback?.(now);
  }
}

/** Records what the boot overlay was asked to show. */
function recordingOverlay() {
  const shown: string[] = [];
  const overlay: BootOverlay = {
    canvas: {} as HTMLCanvasElement,
    showProgress: (fraction) => shown.push(`progress:${fraction}`),
    showError: (title, lines) => shown.push(`error:${title}|${lines.join('|')}`),
    remove: () => shown.push('removed'),
  };
  return { overlay, shown };
}

/** A canvas fake that records attributes. */
function fakeCanvas() {
  const attributes = new Map<string, string>();
  const canvas = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLCanvasElement;
  return { canvas, attributes };
}

let win: FakeWindow;
let input: ShellInput & { cleared: number; destroyed: number; contexts: InputContext[] };
let audio: IAudio & { calls: string[] };
let platform: ReturnType<typeof createHeadlessPlatform>;
let unlocks = 0;

beforeEach(() => {
  win = new FakeWindow();
  fakes.rendererOptions = null;
  fakes.rendererFails = false;
  fakes.spriteNames.length = 0;
  fakes.bound.length = 0;
  fakes.frames.length = 0;
  fakes.sizes.length = 0;
  fakes.destroyed = 0;
  fakes.fxContent = null;
  fakes.fxCalls.length = 0;
  unlocks = 0;
  platform = createHeadlessPlatform();
  input = {
    cleared: 0,
    destroyed: 0,
    contexts: [],
    poll: () => platform.snapshot,
    clear() {
      input.cleared++;
    },
    setContext(context) {
      input.contexts.push(context);
    },
    destroy() {
      input.destroyed++;
    },
  };
  const calls: string[] = [];
  audio = {
    calls,
    state: 'uninitialized',
    unlock: () => Promise.resolve(),
    suspend: () => {
      calls.push('suspend');
      return Promise.resolve();
    },
    resume: () => {
      calls.push('resume');
      return Promise.resolve();
    },
    setBusVolume: () => {},
    destroy: () => {
      calls.push('destroy');
      return Promise.resolve();
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Boots with test defaults (free flight — the dev scene most of these tests exercise; the scene
 * flow has its own tests below).
 *
 * @param overrides - Option overrides.
 */
function boot(overrides: Partial<ShellOptions> = {}) {
  const { canvas, attributes } = fakeCanvas();
  const { overlay, shown } = recordingOverlay();
  const promise = bootShell({
    canvas,
    win: win as unknown as Window,
    contentFiles,
    assets: { manifest, pageUrls },
    input,
    audio,
    platform: (): Platform => ({
      ...platform,
      audio: {
        unlock: () => {
          unlocks++;
          return Promise.resolve();
        },
      },
    }),
    createImage: () => new FakeImage() as unknown as LoadableImage & HTMLImageElement,
    overlay,
    scene: 'flight',
    ...overrides,
  });
  return { promise, attributes, shown };
}

describe('shell/boot sceneFromSearch', () => {
  it('describes itself and knows its scenes', () => {
    expect(moduleInfo.name).toBe('boot');
    expect(SHELL_SCENES).toEqual(['game', 'flight', 'showcase', 'calibration', 'fx-gallery']);
  });

  it('reads ?scene= and defaults to the scene flow', () => {
    expect(sceneFromSearch('?scene=calibration')).toBe('calibration');
    expect(sceneFromSearch('debug=1&scene=calibration')).toBe('calibration');
    expect(sceneFromSearch('?scene=showcase')).toBe('showcase');
    expect(sceneFromSearch('?scene=fx-gallery')).toBe('fx-gallery');
    expect(sceneFromSearch('?scene=flight')).toBe('flight');
    expect(sceneFromSearch('?scene=game')).toBe('game');
    expect(sceneFromSearch('?scene=nope')).toBe('game');
    expect(sceneFromSearch('?scene')).toBe('game');
    expect(sceneFromSearch('')).toBe('game');
  });
});

describe('shell/boot defaultStageId (M1-18)', () => {
  it('names zone A when the content has it, else open space', () => {
    expect(DEFAULT_STAGE_ID).toBe('zone-a');
    expect(defaultStageId(readContentFiles())).toBe('zone-a');
    expect(
      defaultStageId([
        { path: 'stages/a.stage.json', data: { kind: 'stage', id: 'test-range' } },
        { path: 'enemies/zone-a.enemies.json', data: { kind: 'enemies', id: 'zone-a' } },
        { path: 'x.json', data: null },
      ]),
    ).toBeNull();
    expect(defaultStageId([])).toBeNull();
  });

  it('skips files whose data is not an object and finds zone A anywhere in the list', () => {
    expect(
      defaultStageId([
        { path: 'a.json', data: 'zone-a' },
        { path: 'b.json', data: 42 },
        { path: 'c.json', data: ['stage', 'zone-a'] },
        { path: 'd.json', data: { kind: 'stage' } },
        { path: 'e.json', data: { id: 'zone-a' } },
        { path: 'f.json', data: { kind: 'Stage', id: 'zone-a' } },
        { path: 'g.json', data: { kind: 'stage', id: 'ZONE-A' } },
      ]),
    ).toBeNull();
    // The data decides, not the file name.
    expect(
      defaultStageId([
        { path: 'x.json', data: undefined },
        { path: 'stages/elsewhere.json', data: { kind: 'stage', id: DEFAULT_STAGE_ID } },
      ]),
    ).toBe('zone-a');
  });
});

describe('shell/boot bootShell', () => {
  it('loads, creates a WebGL1-first renderer with the atlas, and marks the canvas running', async () => {
    const { promise, attributes, shown } = boot();
    const shell = await promise;
    expect(fakes.rendererOptions).toMatchObject({
      displayWidth: 1920,
      displayHeight: 1080,
      preferWebGLVersion: 1,
      testPattern: false,
      atlas: shell.atlas,
    });
    expect(shell.atlas.manifest).toBe(manifest);
    expect(shell.content.issues).toEqual([]);
    expect(shell.game.content).toBe(shell.content.db);
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('running');
    expect(shown[0]).toBe('progress:0');
    expect(shown).toContain('progress:1');
    expect(shown[shown.length - 1]).toBe('removed');
  });

  it('?scene=flight: the content names plus its own, its world bound', async () => {
    const shell = await boot().promise;
    expect(shell.scene).toBe('flight');
    expect(shell.showcase).toBeNull();
    expect(fakes.spriteNames).toEqual([[...shell.game.content.sprites.names, ...FLIGHT_SPRITES]]);
    expect(fakes.bound).toEqual([shell.flight?.world]);
    expect(shell.flight?.world.batches.slice(2)).toEqual(shell.game.world.view.batches);
  });

  it('?scene=showcase: its sprite names and world are handed to the renderer', async () => {
    const shell = await boot({ scene: 'showcase' }).promise;
    expect(shell.flight).toBeNull();
    expect(fakes.spriteNames).toEqual([SHOWCASE_SPRITES]);
    expect(fakes.bound).toEqual([shell.showcase?.world]);
    win.frame(0);
    expect(fakes.frames[0]).toMatchObject({ tick: 0, world: shell.showcase?.world });
  });

  it('calibration scene: the test pattern, the content sprite table and the game frame', async () => {
    const shell = await boot({ scene: 'calibration' }).promise;
    expect([shell.showcase, shell.flight]).toEqual([null, null]);
    expect(fakes.rendererOptions?.testPattern).toBe(true);
    expect(fakes.spriteNames).toEqual([shell.game.content.sprites.names]);
    win.frame(0);
    expect(fakes.frames[0]).toMatchObject({ tick: 0, world: null });
  });

  it('runs the frame loop: fixed ticks, event dispatch, then render', async () => {
    const shell = await boot({ gameConfig: { seed: 7 } }).promise;
    expect(shell.game.config.seed).toBe(7);
    const shakes: number[] = [];
    shell.events.on(SimEventKind.Shake, (event) => shakes.push(event.param));
    shell.game.events.push(SimEventKind.Shake, 0, 0, 0, 3);
    win.frame(1000);
    win.frame(1000 + STEP);
    win.frame(1000 + 2 * STEP);
    expect(shell.game.state.tick).toBe(2);
    expect(shakes).toEqual([3]);
    expect(fakes.frames.map((frame) => frame.tick)).toEqual([0, 1, 2]);
    expect(fakes.frames.every((frame) => frame.world === shell.flight?.world)).toBe(true);
    expect(fakes.frames[0].hudCount).toBeGreaterThan(0);
  });

  it('hands game.inputContext to the input adapter at boot and before the ticks of a frame that changed it', async () => {
    const shell = await boot().promise;
    expect(input.contexts).toEqual(['game']);
    let context: InputContext = 'game';
    Object.defineProperty(shell.game, 'inputContext', { get: () => context });
    win.frame(0);
    expect(input.contexts).toEqual(['game']);
    context = 'menu';
    win.frame(STEP);
    win.frame(2 * STEP);
    expect(input.contexts).toEqual(['game', 'menu']);
    context = 'game';
    win.frame(3 * STEP);
    expect(input.contexts).toEqual(['game', 'menu', 'game']);
  });

  it('unlocks audio on the first key or pointer gesture only (web default)', async () => {
    await boot().promise;
    expect(unlocks).toBe(0);
    win.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    expect(unlocks).toBe(1);
  });

  it('unlocks audio immediately when asked (TV)', async () => {
    await boot({ audioUnlock: 'immediate' }).promise;
    expect(unlocks).toBe(1);
    win.dispatchEvent(new Event('keydown'));
    expect(unlocks).toBe(1);
  });

  it('suspend clears held input and suspends audio; resume resumes audio', async () => {
    const shell = await boot().promise;
    platform.suspend();
    expect(input.cleared).toBe(1);
    expect(shell.game.state.suspended).toBe(true);
    platform.resume();
    expect(audio.calls).toEqual(['suspend', 'resume']);
  });

  it('forwards window resizes to the renderer', async () => {
    await boot().promise;
    win.innerWidth = 1280;
    win.innerHeight = 720;
    win.dispatchEvent(new Event('resize'));
    expect(fakes.sizes).toEqual([[1280, 720]]);
  });

  it('stop() ends the loop and releases listeners, input, renderer, atlas and audio (once)', async () => {
    const shell = await boot().promise;
    const firstTexture = shell.atlas.textures[0];
    shell.stop();
    shell.stop();
    expect(win.cancelled).toBe(1);
    expect(input.destroyed).toBe(1);
    expect(fakes.destroyed).toBe(1);
    expect(firstTexture.destroyed).toBe(true);
    expect(audio.calls).toEqual(['destroy']);
    win.dispatchEvent(new Event('resize'));
    win.dispatchEvent(new Event('keydown'));
    expect(fakes.sizes).toEqual([]);
    expect(unlocks).toBe(0);
  });
});

describe('shell/boot debug tools (M1-19)', () => {
  /**
   * A factory whose tools record the frame hooks (with how many frames were rendered by then).
   *
   * @returns The factory, the hosts it saw and the log.
   */
  const recordingTools = () => {
    const hosts: DebugToolsHost[] = [];
    const log: string[] = [];
    let destroyed = 0;
    const factory: DebugToolsFactory = (host) => {
      hosts.push(host);
      return {
        controls: null as never,
        overlay: null as never,
        counters: null as never,
        api: null as never,
        unlocked: true,
        handleKey: () => false,
        beginFrame: (now) => log.push(`begin:${now}:${host.game.state.tick}`),
        endTicks: () => log.push(`ticks:${host.game.state.tick}`),
        beforeRender: () =>
          log.push(
            `before:${fakes.frames.length}:${host.visibleWorld() === null ? 'none' : 'world'}`,
          ),
        afterRender: () => log.push(`after:${fakes.frames.length}`),
        destroy: () => {
          destroyed++;
        },
      };
    };
    return { factory, hosts, log, destroyed: () => destroyed };
  };

  it('counts draw calls and creates the tools only when the app passes a factory', async () => {
    const plain = await boot().promise;
    expect(fakes.rendererOptions?.countDrawCalls).toBe(false);
    expect(plain.debug).toBeNull();
    plain.stop();
    const tools = recordingTools();
    const shell = await boot({ debugTools: tools.factory }).promise;
    expect(fakes.rendererOptions?.countDrawCalls).toBe(true);
    expect(tools.hosts).toHaveLength(1);
    const host = tools.hosts[0];
    expect(shell.debug).not.toBeNull();
    expect(host.game).toBe(shell.game);
    expect(host.win).toBe(win);
    expect(host.bootMs).toBe(shell.bootTiming.readyMs);
    expect(host.sceneId()).toBe('flight');
    shell.stop();
    shell.stop();
    expect(tools.destroyed()).toBe(1);
  });

  it('hooks into every frame: begin → ticks → overlay → render → after', async () => {
    const tools = recordingTools();
    await boot({ debugTools: tools.factory }).promise;
    win.frame(1000);
    win.frame(1000 + STEP);
    expect(tools.log).toEqual([
      'begin:1000:0',
      'ticks:0',
      'before:0:world',
      'after:1',
      `begin:${1000 + STEP}:0`,
      'ticks:1',
      'before:1:world',
      'after:2',
    ]);
  });

  it('in the scene flow: the top scene id, and no World on screen at the title', async () => {
    const tools = recordingTools();
    const shell = await boot({ debugTools: tools.factory, scene: 'game' }).promise;
    win.frame(1000);
    win.frame(1000 + STEP);
    expect(tools.hosts[0].sceneId()).toBe(shell.game.scenes?.stack.top?.id);
    expect(tools.hosts[0].sceneId()).toBe('title');
    expect(tools.log.filter((line) => line.startsWith('before'))).toEqual([
      'before:0:none',
      'before:1:none',
    ]);
  });

  it('shows no World for the dev scenes that do not draw it', async () => {
    const tools = recordingTools();
    await boot({ debugTools: tools.factory, scene: 'showcase' }).promise;
    win.frame(1000);
    expect(tools.log).toContain('before:0:none');
    expect(tools.hosts[0].sceneId()).toBe('showcase');
  });
});

describe('shell/boot failures (boot error screen)', () => {
  it('lists every content issue and rejects with a ShellBootError carrying them', async () => {
    const broken = [
      ...contentFiles,
      { path: 'player/zz.player.json', data: { formatVersion: 1, kind: 'player' } },
    ];
    const { promise, attributes, shown } = boot({ contentFiles: broken });
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShellBootError);
    const bootError = error as ShellBootError;
    expect(bootError.issues.length).toBeGreaterThan(0);
    expect(bootError.lines[0]).toMatch(/^player\/zz\.player\.json:/);
    expect(shown[shown.length - 1]).toMatch(/^error:CONTENT ERRORS: \d+ PROBLEMS?\|player\/zz/);
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
    expect(fakes.rendererOptions).toBeNull();
    expect(input.destroyed).toBe(1);
    expect(audio.calls).toEqual(['destroy']);
  });

  it('reports content from a foreign kind nobody owns, unless an owner accepts it', async () => {
    const foreign = [
      ...contentFiles,
      { path: 'campaign/main.campaign.json', data: { formatVersion: 1, kind: 'campaign' } },
    ];
    await expect(boot({ contentFiles: foreign }).promise).rejects.toThrow(
      /no loader for content kind "campaign"/,
    );
    const owned = await boot({ contentFiles: foreign, contentOwners: { campaign: () => [] } })
      .promise;
    // The input profiles, fx presets and audio are validated by the shell; `campaign` by the one
    // passed.
    expect(owned.content.foreign.map((file) => file.path)).toEqual([
      'audio/main.sfx.json',
      'audio/music/boss.music.json',
      'audio/music/game-over.music.json',
      'audio/music/stage-clear.music.json',
      'audio/music/title.music.json',
      'audio/music/zone-a.music.json',
      'campaign/main.campaign.json',
      'fx/particles.fx.json',
      'input/remote.input-profiles.json',
    ]);
  });

  it('keeps the content/fx presets, hands them to the renderer and seeds its particles (M1-14)', async () => {
    const shell = await boot({ gameConfig: { seed: 1234 } }).promise;
    expect(shell.fx.presets.map((preset) => preset.id)).toContain('explosion.small');
    expect(fakes.fxContent).toBe(shell.fx);
    expect(fakes.rendererOptions?.fxSeed).toBe((1234 ^ 0x2545f491) >>> 0);
    const other = await boot().promise;
    expect(fakes.rendererOptions?.fxSeed).not.toBe((1234 ^ 0x2545f491) >>> 0);
    expect(other.fxGallery).toBeNull();
  });

  it('reports bad fx content on the boot error screen', async () => {
    const files = [
      ...contentFiles.filter((file) => !file.path.startsWith('fx/')),
      {
        path: 'fx/bad.fx.json',
        data: { formatVersion: 1, kind: 'fx', presets: [], triggers: [{ event: 'x' }] },
      },
    ];
    await expect(boot({ contentFiles: files }).promise).rejects.toThrow(
      /fx\/bad\.fx\.json:triggers\[0\]\.event/,
    );
  });

  it("connects the World's events to the particles, effects and popups in free flight", async () => {
    const shell = await boot().promise;
    shell.game.events.push(SimEventKind.Particles, 0, 100.7, 50, 1);
    shell.game.events.push(SimEventKind.Sfx, 3, 20, 30, 0);
    shell.game.events.push(SimEventKind.Score, 0, 40, 60, 300);
    shell.game.events.push(SimEventKind.Shake, 20, 0, 0, 2);
    win.frame(0);
    expect(fakes.fxCalls).toEqual([
      ['emitFxCue', 0, 100, 50, 1],
      ['emitSfxCue', 3, 20, 30],
      ['show', 300, 40, 60, 0xf8f8f8],
    ]);
    expect(shell.renderer.effects.shakeAmount).toBe(2);
  });

  it('?scene=fx-gallery: binds the gallery and drives the particles directly, not by events', async () => {
    const shell = await boot({ scene: 'fx-gallery' }).promise;
    const gallery = shell.fxGallery;
    if (gallery === null) throw new Error('no gallery');
    expect(fakes.spriteNames).toEqual([gallery.spriteNames]);
    expect(fakes.bound).toEqual([gallery.world]);
    expect(gallery.stations[0]).toBe(shell.fx.presets[0].id);
    shell.game.events.push(SimEventKind.Particles, 0, 1, 2, 1);
    win.frame(0);
    expect(fakes.frames[fakes.frames.length - 1]?.world).toBe(gallery.world);
    // The first station's burst, not the World's event.
    expect(fakes.fxCalls).toEqual([['emit', 0, 192, 100, 1]]);
  });

  it('reports an atlas page that fails to load', async () => {
    const { promise, shown } = boot({ assets: { manifest, pageUrls: ['assets/atlas/bad.png'] } });
    await expect(promise).rejects.toBeInstanceOf(ShellBootError);
    expect(shown[shown.length - 1]).toMatch(
      /^error:ATLAS PAGE FAILED TO LOAD\|assets\/atlas\/bad\.png/,
    );
  });

  it('reports a stale atlas page (size differs from the manifest)', async () => {
    const { promise, shown } = boot({
      createImage: () => new FakeImage([8, 8]) as unknown as LoadableImage & HTMLImageElement,
    });
    await expect(promise).rejects.toThrow(/ATLAS DOES NOT MATCH ITS MANIFEST/);
    expect(shown[shown.length - 1]).toMatch(/stale atlas/);
  });

  it('reports a missing WebGL context and releases the atlas', async () => {
    fakes.rendererFails = true;
    const { promise, shown, attributes } = boot();
    const error = (await promise.catch((caught: unknown) => caught)) as ShellBootError;
    expect(error.message).toMatch(/^WEBGL IS NOT AVAILABLE/);
    expect(error.reason).toBeInstanceOf(Error);
    expect(shown[shown.length - 1]).toContain('WebGL unavailable');
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
  });

  it('reports a platform or game that cannot be created, and destroys the renderer', async () => {
    const { promise } = boot({ gameConfig: { startingLives: 99 } });
    await expect(promise).rejects.toThrow(/SHMUP CUP FAILED TO START/);
    expect(fakes.destroyed).toBe(1);
  });

  it('boots without an overlay when none can be created (fake canvas)', async () => {
    const shell = await boot({ overlay: undefined }).promise;
    expect(shell.scene).toBe('flight');
  });
});

describe('shell/boot input profiles and binding contexts (M1-05)', () => {
  it('switches the context before the ticks of the frame poll input', async () => {
    const log: string[] = [];
    input.setContext = (context) => {
      log.push(`context:${context}`);
    };
    const shell = await boot({
      platform: (): Platform => ({
        ...platform,
        input: {
          poll: () => {
            log.push('poll');
            return platform.snapshot;
          },
        },
      }),
    }).promise;
    expect(log).toEqual(['context:game']);
    let context: InputContext = 'game';
    Object.defineProperty(shell.game, 'inputContext', { get: () => context });
    win.frame(0);
    win.frame(STEP);
    context = 'menu';
    win.frame(3 * STEP); // two ticks in this frame, both after the switch
    expect(log).toEqual(['context:game', 'poll', 'context:menu', 'poll', 'poll']);
  });

  it('forwards a context change even while the game is paused (no ticks run)', async () => {
    const shell = await boot().promise;
    let context: InputContext = 'game';
    Object.defineProperty(shell.game, 'inputContext', { get: () => context });
    shell.game.pause();
    context = 'menu';
    win.frame(0);
    // Paused: no ticks, but the shell still reads the context once per displayed frame, so a
    // pause menu gets its menu table before the first key press.
    expect(input.contexts).toEqual(['game', 'menu']);
    win.frame(STEP);
    expect(input.contexts).toEqual(['game', 'menu']);
  });

  it('a broken input-profiles file stops the boot on the error screen (default owner)', async () => {
    const broken = [
      ...contentFiles,
      {
        path: 'input/zz.input-profiles.json',
        data: {
          formatVersion: 1,
          kind: 'input-profiles',
          profiles: [
            {
              id: 'tizen-remote-safe', // already defined by remote.input-profiles.json
              label: 'DUP',
              device: 'remote',
              context: {
                game: {
                  byCode: {},
                  byKeyCode: {
                    '37': ['Left'],
                    '38': ['Up'],
                    '39': ['Right'],
                    '40': ['Down'],
                    '10009': ['Pause'],
                  },
                },
                menu: {
                  byCode: {},
                  byKeyCode: {
                    '13': ['Confirm'],
                    '37': ['Left'],
                    '38': ['Up'],
                    '39': ['Right'],
                    '40': ['Down'],
                    '10009': ['Back'],
                  },
                },
              },
              releaseDebounceTicks: 2,
              diagonals: 'combine',
              socd: 'neutral',
              register: ['Exit'],
            },
          ],
        },
      },
    ];
    const { promise, attributes, shown } = boot({ contentFiles: broken });
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShellBootError);
    expect((error as ShellBootError).issues).toEqual([
      {
        path: 'input/zz.input-profiles.json:profiles[0].register[0]',
        message: '"Exit" is a system key and must never be registered',
      },
    ]);
    expect(shown[shown.length - 1]).toMatch(/^error:CONTENT ERRORS: 1 PROBLEM\|input\/zz/);
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
    expect(input.contexts).toEqual([]); // never reached the frame loop
  });

  it('an app-supplied input-profiles owner replaces the default one', async () => {
    const seen: string[] = [];
    const shell = await boot({
      contentOwners: {
        'input-profiles': (files) => {
          for (const file of files) seen.push(file.path);
          return [];
        },
      },
      contentFiles: [
        ...contentFiles,
        {
          path: 'input/zz.input-profiles.json',
          data: { formatVersion: 1, kind: 'input-profiles' },
        },
      ],
    }).promise;
    // The default owner would have reported the missing `profiles`; the app's owner accepted it.
    expect(seen).toEqual(['input/remote.input-profiles.json', 'input/zz.input-profiles.json']);
    expect(shell.content.issues).toEqual([]);
  });
});

describe('shell/boot audio (M1-15)', () => {
  /**
   * An audio back-end that exposes a Web Audio graph on a fake context once unlocked.
   *
   * @returns The back-end and its context.
   */
  function graphAudio() {
    const context = new FakeContext();
    let unlocked = false;
    const buses = {
      master: context.createGain(),
      music: context.createGain(),
      sfx: context.createGain(),
      ui: context.createGain(),
    };
    const destroyed: number[] = [];
    const backend: ShellOptions['audio'] = {
      state: 'uninitialized',
      get context() {
        return unlocked ? context : null;
      },
      bus: (name) => (unlocked ? buses[name] : null),
      unlock: () => {
        unlocked = true;
        return Promise.resolve();
      },
      suspend: () => Promise.resolve(),
      resume: () => Promise.resolve(),
      setBusVolume: () => {},
      destroy: () => {
        destroyed.push(1);
        return Promise.resolve();
      },
    };
    return { backend, context, destroyed };
  }

  it('renders the SFX bank at boot and prepares the music set of the running stage only', async () => {
    const open = await boot().promise;
    expect(open.audioEngine.residentTracks).toEqual([]);
    expect(open.audioEngine.attached).toBe(false); // a plain IAudio: silent
    const staged = await boot({ gameConfig: { stage: 'test-range' } }).promise;
    expect([...staged.audioEngine.residentTracks].sort()).toEqual([
      'boss',
      'game-over',
      'stage-clear',
      'zone-a',
    ]);
  });

  it('prepares every cue the stage itself names: its boss theme and its music events', async () => {
    const jingle = contentFiles.find((file) => file.path === 'audio/music/stage-clear.music.json');
    const range = contentFiles.find((file) => file.path === 'stages/test-range.stage.json');
    if (jingle === undefined || range === undefined) throw new Error('content moved');
    const track = (id: string, cue: string) => ({
      path: `audio/music/${id}.music.json`,
      data: { ...(jingle.data as object), id, cue, stages: ['test-range'] },
    });
    const stage = range.data as { music: object; events: object[] };
    const files = [
      ...contentFiles.filter((file) => file !== range),
      {
        path: range.path,
        data: {
          ...stage,
          music: { stage: 'Stage', boss: 'FinalBoss' },
          events: [{ x: 0, type: 'music', cue: 'ZoneMap' }, ...stage.events],
        },
      },
      track('final-boss', 'FinalBoss'),
      track('zone-map', 'ZoneMap'),
    ];
    const shell = await boot({ contentFiles: files, gameConfig: { stage: 'test-range' } }).promise;
    expect(shell.content.issues).toEqual([]);
    expect([...shell.audioEngine.residentTracks].sort()).toEqual([
      'final-boss',
      'game-over',
      'stage-clear',
      'zone-a',
      'zone-map',
    ]);
  });

  it("attaches after the unlock and plays the World's music and sounds (panned, deduped)", async () => {
    const { backend, context } = graphAudio();
    const shell = await boot({
      audio: backend,
      platform: (): Platform => ({ ...platform, audio: backend }),
      audioUnlock: 'immediate',
      gameConfig: { stage: 'test-range' },
    }).promise;
    const engine = shell.audioEngine;
    expect(engine.attached).toBe(true);
    win.frame(1000);
    win.frame(1000 + STEP);
    // The stage start pushed MUSIC Stage: the zone theme loops on the music bus.
    expect(engine.music?.current?.id).toBe('zone-a');
    const theme = context.sources.find((source) => source.loop);
    expect(theme).toBeDefined();
    const started = engine.sfx?.started ?? 0;
    const camera = shell.game.world.view.camera;
    shell.game.events.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeLarge, camera.x + 384, 90, 0);
    shell.game.events.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeLarge, camera.x + 384, 90, 0);
    win.frame(1000 + 2 * STEP);
    expect((engine.sfx?.started ?? 0) - started).toBe(1);
    expect(engine.sfx?.deduped).toBeGreaterThanOrEqual(1);
    expect(context.panners.some((panner) => panner.pan.value > 0.5)).toBe(true);
    shell.game.events.push(SimEventKind.Music, MUSIC_CUES.Silence, 0, 0, 30);
    win.frame(1000 + 3 * STEP);
    expect(engine.musicCue).toBe(-1);
    shell.stop();
    expect(engine.attached).toBe(false);
  });

  it('attaches on the first gesture on the web', async () => {
    const { backend } = graphAudio();
    const shell = await boot({
      audio: backend,
      platform: (): Platform => ({ ...platform, audio: backend }),
    }).promise;
    expect(shell.audioEngine.attached).toBe(false);
    win.dispatchEvent(new Event('keydown'));
    expect(shell.audioEngine.attached).toBe(true);
  });

  it('shows the boot error screen when the audio cannot be loaded', async () => {
    const { promise, shown } = boot({
      audioLoader: {
        sampleRate: 22050,
        loadSfx: () => Promise.reject(new Error('could not load audio/sfx/boom.ogg: status 404')),
        loadTrack: () => Promise.reject(new Error('unused')),
      },
    });
    await expect(promise).rejects.toThrow(/AUDIO FAILED TO LOAD/);
    expect(shown[shown.length - 1]).toBe(
      'error:AUDIO FAILED TO LOAD|Error: could not load audio/sfx/boom.ogg: status 404',
    );
    expect(audio.calls).toEqual(['destroy']);
  });
});

describe('shell/boot the scene flow (M1-16, the default scene)', () => {
  /**
   * Presses and releases an action over two displayed frames of one tick each.
   *
   * @param action - The action.
   * @param at - The first frame's timestamp.
   * @returns The next free timestamp.
   */
  function press(action: number, at: number): number {
    commitPlayerInput(platform.snapshot.players[0], action);
    win.frame(at);
    commitPlayerInput(platform.snapshot.players[0], 0);
    win.frame(at + STEP);
    return at + 2 * STEP;
  }

  it('boots the flow: its sprite names, the backdrop bound, the boot scene finished', async () => {
    const { promise, attributes } = boot({ scene: 'game' });
    const shell = await promise;
    expect(shell.scene).toBe('game');
    expect([shell.flight, shell.showcase, shell.fxGallery]).toEqual([null, null, null]);
    expect(shell.sceneView).not.toBeNull();
    expect(fakes.spriteNames).toEqual([
      [...shell.game.content.sprites.names, ...SCENE_VIEW_SPRITES],
    ]);
    expect(fakes.bound).toEqual([shell.sceneView?.backdrop]);
    expect(shell.game.scenes?.boot.done).toBe(true);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('boot');
    expect(input.contexts).toEqual(['menu']);
    win.frame(1000);
    win.frame(1000 + STEP);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('title');
    expect(fakes.frames[1]).toMatchObject({ world: shell.sceneView?.backdrop, hudCount: 0 });
    expect(fakes.frames[1].uiCount).toBeGreaterThan(0);
    expect(shell.sceneView?.backdrop.batches[0].count).toBeGreaterThan(0); // the starfield
  });

  it('OK on the title and on START runs a game: its World under the starfield, the game context', async () => {
    const { promise, attributes } = boot({ scene: 'game' });
    const shell = await promise;
    let at = press(0, 1000);
    at = press(Action.Confirm, at);
    at = press(Action.Confirm, at); // START → the difficulty menu
    at = press(Action.Confirm, at); // NORMAL (buffered by the menu's open lock)
    at = press(0, at);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('game');
    win.frame(at);
    expect(input.contexts).toEqual(['menu', 'game']);
    const frame = fakes.frames[fakes.frames.length - 1];
    const world = frame.world as { batches: readonly unknown[] };
    expect(world).not.toBe(shell.sceneView?.backdrop);
    expect(world.batches.slice(2)).toEqual(shell.game.world.view.batches);
    expect(frame.hudCount).toBeGreaterThan(20);
    // The previous (title) picture's particles and popups were dropped for the new World.
    expect(fakes.fxCalls).toContainEqual(['clearParticles']);
    expect(fakes.fxCalls).toContainEqual(['clearPopups']);
    // Pause: the game context goes, the World stays on screen.
    at = press(Action.Pause, at + STEP);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('pause');
    win.frame(at);
    expect(input.contexts).toEqual(['menu', 'game', 'menu']);
    expect(fakes.frames[fakes.frames.length - 1].world).toBe(world);
  });

  it('prepares the title theme with the music set and plays it', async () => {
    const graph = (() => {
      const context = new FakeContext();
      let unlocked = false;
      const buses = {
        master: context.createGain(),
        music: context.createGain(),
        sfx: context.createGain(),
        ui: context.createGain(),
      };
      const backend: ShellOptions['audio'] = {
        state: 'uninitialized',
        get context() {
          return unlocked ? context : null;
        },
        bus: (name) => (unlocked ? buses[name] : null),
        unlock: () => {
          unlocked = true;
          return Promise.resolve();
        },
        suspend: () => Promise.resolve(),
        resume: () => Promise.resolve(),
        setBusVolume: () => {},
        destroy: () => Promise.resolve(),
      };
      return backend;
    })();
    const open = await boot({
      scene: 'game',
      audio: graph,
      platform: (): Platform => ({ ...platform, audio: graph }),
      audioUnlock: 'immediate',
    }).promise;
    expect([...open.audioEngine.residentTracks].sort()).toEqual([
      'game-over',
      'stage-clear',
      'title',
    ]);
    win.frame(1000);
    win.frame(1000 + STEP);
    expect(open.audioEngine.music?.current?.id).toBe('title');
    open.stop();
    const staged = await boot({ scene: 'game', gameConfig: { stage: 'test-range' } }).promise;
    expect([...staged.audioEngine.residentTracks].sort()).toEqual([
      'boss',
      'game-over',
      'stage-clear',
      'title',
      'zone-a',
    ]);
  });
});

describe('shell/boot saves and options (M1-17)', () => {
  /** A save document's text. */
  const saveText = (doc: Record<string, unknown>): string => JSON.stringify({ version: 1, ...doc });

  /**
   * The audio fake with its bus volumes recorded.
   *
   * @returns The back-end and its `[bus, gain]` log.
   */
  function recordingAudio() {
    const volumes: Array<[string, number]> = [];
    const backend: IAudio = {
      ...audio,
      setBusVolume: (bus, gain) => {
        volumes.push([bus, gain]);
      },
    };
    return { backend, volumes };
  }

  /**
   * An app's input profiles, with the calls recorded.
   *
   * @param active - The id in use at boot.
   * @returns The profiles and the apply log.
   */
  function fakeProfiles(active: string | null = 'safe') {
    const applied: Array<[string, string]> = [];
    let current = active;
    const profiles: ShellInputProfiles = {
      choices: () => [
        { id: 'safe', label: 'SAFE 4-WAY (DEFAULT)' },
        { id: 'fast', label: 'FAST 8-WAY' },
      ],
      active: () => current,
      apply: (id, source) => {
        applied.push([id, source]);
        if (id === 'safe' || id === 'fast') current = id;
      },
    };
    return { profiles, applied };
  }

  it('reads the save before the title: volumes, hi-score and the saved profile', async () => {
    await platform.storage.set(
      SAVE_STORAGE_KEY,
      saveText({
        options: { audio: { master: 5, music: 0, sfx: 8 }, input: { profileId: 'fast' } },
        hiScores: { 'meter-normal': [{ name: '---', score: 64000 }] },
      }),
    );
    const { backend, volumes } = recordingAudio();
    const { profiles, applied } = fakeProfiles();
    const shell = await boot({ scene: 'game', audio: backend, inputProfiles: profiles }).promise;
    expect(shell.loadedSave.status).toBe('ok');
    expect(volumes).toEqual([
      ['master', 0.25],
      ['music', 0],
      ['sfx', volumeGain(8)],
      ['ui', volumeGain(8)],
    ]);
    expect(applied).toEqual([['fast', 'save']]);
    const flow = shell.game.scenes!;
    expect(flow.save).toBe(shell.save);
    expect(flow.hiScore).toBe(64000);
    expect(flow.inputProfiles.map((p) => p.id)).toEqual(['safe', 'fast']);
    expect(flow.activeInputProfile).toBe(1);
  });

  it('boots with defaults on a corrupt save and keeps a copy of it', async () => {
    await platform.storage.set(SAVE_STORAGE_KEY, '{not json');
    const { backend, volumes } = recordingAudio();
    const { promise, attributes } = boot({ scene: 'game', audio: backend });
    const shell = await promise;
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('running');
    expect(shell.loadedSave.status).toBe('corrupt');
    expect(await platform.storage.get(SAVE_CORRUPT_KEY)).toBe('{not json');
    expect(volumes.map(([, gain]) => gain)).toEqual([1, 1, 1, 1]);
    expect(shell.game.scenes!.inputProfiles).toEqual([]); // no app profiles: CONTROLS disabled
  });

  it('applies the Options screen changes live: bus volumes and the input profile', async () => {
    const { backend, volumes } = recordingAudio();
    const { profiles, applied } = fakeProfiles();
    const shell = await boot({ scene: 'game', audio: backend, inputProfiles: profiles }).promise;
    volumes.length = 0;
    const events = shell.game.events;
    events.push(SimEventKind.UserOption, UserOptionKind.MasterVolume, 0, 0, 5);
    events.push(SimEventKind.UserOption, UserOptionKind.MusicVolume, 0, 0, 10);
    events.push(SimEventKind.UserOption, UserOptionKind.SfxVolume, 0, 0, 0);
    events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 1);
    events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 7); // no such choice
    win.frame(1000);
    expect(volumes).toEqual([
      ['master', 0.25],
      ['music', 1],
      ['sfx', 0],
      ['ui', 0],
    ]);
    expect(applied).toEqual([['fast', 'options']]);
  });

  it('drives the Options screen end to end and writes the save on BACK', async () => {
    const { backend, volumes } = recordingAudio();
    const shell = await boot({ scene: 'game', audio: backend }).promise;
    volumes.length = 0;
    let at = 1000;
    /**
     * Presses and releases an action over two frames.
     *
     * @param action - The action.
     */
    const press = (action: number): void => {
      commitPlayerInput(platform.snapshot.players[0], action);
      win.frame(at);
      commitPlayerInput(platform.snapshot.players[0], 0);
      win.frame(at + STEP);
      at += 2 * STEP;
    };
    press(0);
    press(Action.Confirm); // PRESS OK
    press(Action.Down); // OPTIONS
    press(Action.Confirm);
    press(0);
    expect(shell.game.scenes!.stack.top?.id).toBe('options');
    press(Action.Down); // MUSIC
    press(Action.Left); // 9
    expect(volumes).toEqual([['music', volumeGain(9)]]);
    press(Action.Back);
    expect(shell.game.scenes!.stack.top?.id).toBe('title');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = JSON.parse((await platform.storage.get(SAVE_STORAGE_KEY)) ?? '{}') as {
      options: { audio: { music: number } };
    };
    expect(stored.options.audio.music).toBe(9);
  });

  it('dev scenes read the save too (volumes, profile) but run without the flow', async () => {
    await platform.storage.set(
      SAVE_STORAGE_KEY,
      saveText({ options: { audio: { master: 0 }, input: { profileId: 'fast' } } }),
    );
    const { backend, volumes } = recordingAudio();
    const { profiles, applied } = fakeProfiles();
    const shell = await boot({ audio: backend, inputProfiles: profiles }).promise;
    expect(shell.game.scenes).toBeNull();
    expect(volumes[0]).toEqual(['master', 0]);
    expect(applied).toEqual([['fast', 'save']]);
  });

  it('clears held input when the window loses focus, until stop()', async () => {
    const shell = await boot().promise;
    const before = input.cleared;
    win.dispatchEvent(new Event('blur'));
    expect(input.cleared).toBe(before + 1);
    shell.stop();
    win.dispatchEvent(new Event('blur'));
    expect(input.cleared).toBe(before + 1);
  });

  it('times the boot with the given clock and marks the canvas', async () => {
    let clock = 1200;
    const { promise, attributes } = boot({ now: () => (clock += 50) });
    const shell = await promise;
    expect(shell.bootTiming.startMs).toBe(1250);
    expect(shell.bootTiming.readyMs).toBe(1300);
    expect(shell.bootTiming.bootMs).toBe(50);
    expect(attributes.get(BOOT_MS_ATTRIBUTE)).toBe('1300');
    expect(Object.isFrozen(shell.bootTiming)).toBe(true);
  });

  it('falls back to the window clock (or Date.now) by default', async () => {
    const shell = await boot().promise;
    expect(shell.bootTiming.readyMs).toBeGreaterThanOrEqual(shell.bootTiming.startMs);
    shell.stop();
    (win as unknown as { performance: { now(): number } }).performance = { now: () => 42 };
    const timed = await boot().promise;
    expect(timed.bootTiming).toEqual({ startMs: 42, readyMs: 42, bootMs: 0 });
  });
});

describe('shell/boot saves and options (M1-17 edge)', () => {
  /**
   * The audio fake with its bus volumes recorded.
   *
   * @returns The back-end and its `[bus, gain]` log.
   */
  function recordingAudio() {
    const volumes: Array<[string, number]> = [];
    const backend: IAudio = {
      ...audio,
      setBusVolume: (bus, gain) => {
        volumes.push([bus, gain]);
      },
    };
    return { backend, volumes };
  }

  /**
   * App profiles recording every call.
   *
   * @param active - Id in use at boot.
   * @returns The profiles and the call log.
   */
  function countingProfiles(active: string | null = 'safe') {
    const log: string[] = [];
    const profiles: ShellInputProfiles = {
      choices: () => {
        log.push('choices');
        return [
          { id: 'safe', label: 'SAFE 4-WAY (DEFAULT)' },
          { id: 'fast', label: 'FAST 8-WAY' },
        ];
      },
      active: () => {
        log.push('active');
        return active;
      },
      apply: (id, source) => {
        log.push(`apply:${id}:${source}`);
      },
    };
    return { profiles, log };
  }

  it('an unreadable (newer) save boots with defaults and is kept aside', async () => {
    const newer = JSON.stringify({ version: 42, options: { audio: { master: 0 } } });
    await platform.storage.set(SAVE_STORAGE_KEY, newer);
    const { backend, volumes } = recordingAudio();
    const shell = await boot({ scene: 'game', audio: backend }).promise;
    expect(shell.loadedSave.status).toBe('unreadable');
    expect(await platform.storage.get(SAVE_CORRUPT_KEY)).toBe(newer);
    expect(volumes.map(([, gain]) => gain)).toEqual([1, 1, 1, 1]);
    expect(shell.save.dirty).toBe(true); // replaced at the next write
  });

  it('a version-0 save is migrated at boot and its volumes applied', async () => {
    await platform.storage.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({
        options: { masterVolume: 0.5, musicVolume: 0, sfxVolume: 1 },
        hiScores: [{ name: 'OLD', score: 777 }],
      }),
    );
    const { backend, volumes } = recordingAudio();
    const shell = await boot({ scene: 'game', audio: backend }).promise;
    expect([shell.loadedSave.status, shell.loadedSave.fromVersion]).toEqual(['migrated', 0]);
    expect(volumes).toEqual([
      ['master', 0.25],
      ['music', 0],
      ['sfx', 1],
      ['ui', 1],
    ]);
    expect(shell.game.scenes!.hiScore).toBe(777);
  });

  it('a storage that fails to read boots like a first launch', async () => {
    const shell = await boot({
      scene: 'game',
      platform: (): Platform => ({
        ...platform,
        storage: {
          get: () => Promise.reject(new Error('denied')),
          set: () => Promise.reject(new Error('denied')),
        },
      }),
    }).promise;
    expect(shell.loadedSave).toMatchObject({ status: 'empty', text: null });
    expect(shell.game.scenes!.hiScore).toBe(0);
    // Writes fail quietly: the store stays dirty, nothing throws.
    expect(await shell.save.flush()).toBe(false);
  });

  it('asks the app for its choices once and applies no saved profile when none is saved', async () => {
    const { profiles, log } = countingProfiles('fast');
    const shell = await boot({ scene: 'game', inputProfiles: profiles }).promise;
    expect(log).toEqual(['choices', 'active']);
    expect(shell.game.scenes!.activeInputProfile).toBe(1);
  });

  it('dev scenes never hand the profiles to a flow (there is none)', async () => {
    const { profiles, log } = countingProfiles();
    const shell = await boot({ scene: 'calibration', inputProfiles: profiles }).promise;
    expect(shell.game.scenes).toBeNull();
    expect(log).toEqual(['choices', 'active']);
  });

  it('without app profiles a saved profile and profile events are ignored', async () => {
    await platform.storage.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({ version: 1, options: { input: { profileId: 'fast' } } }),
    );
    const shell = await boot({ scene: 'game' }).promise;
    expect(shell.game.scenes!.inputProfiles).toEqual([]);
    shell.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 0);
    expect(() => win.frame(1000)).not.toThrow();
    expect(shell.save.options.input.profileId).toBe('fast'); // kept for a host that has it
  });

  it('ignores a profile event with a negative index', async () => {
    const { profiles, log } = countingProfiles();
    const shell = await boot({ scene: 'game', inputProfiles: profiles }).promise;
    log.length = 0;
    shell.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, -1);
    shell.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 0);
    win.frame(1000);
    expect(log).toEqual(['apply:safe:options']);
  });

  it('an app whose apply throws at boot fails with the start error and frees the renderer', async () => {
    await platform.storage.set(
      SAVE_STORAGE_KEY,
      JSON.stringify({ version: 1, options: { input: { profileId: 'fast' } } }),
    );
    const { profiles } = countingProfiles();
    const { promise, attributes } = boot({
      scene: 'game',
      inputProfiles: {
        ...profiles,
        apply: () => {
          throw new Error('bad profile table');
        },
      },
    });
    await expect(promise).rejects.toThrow(/SHMUP CUP FAILED TO START/);
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
    expect(fakes.destroyed).toBe(1);
  });

  it('marks the canvas with the ready time rounded to whole ms', async () => {
    const readings = [1000.2, 1234.6];
    const { promise, attributes } = boot({ now: () => readings.shift() ?? 0 });
    const shell = await promise;
    expect(shell.bootTiming.bootMs).toBeCloseTo(234.4, 9);
    expect(attributes.get(BOOT_MS_ATTRIBUTE)).toBe('1235');
  });

  it('a game over in the shell writes the hi-score to the platform storage', async () => {
    const shell = await boot({ scene: 'game' }).promise;
    const flow = shell.game.scenes!;
    let at = 1000;
    /**
     * Presses and releases an action over two frames.
     *
     * @param action - The action.
     */
    const press = (action: number): void => {
      commitPlayerInput(platform.snapshot.players[0], action);
      win.frame(at);
      commitPlayerInput(platform.snapshot.players[0], 0);
      win.frame(at + STEP);
      at += 2 * STEP;
    };
    press(0);
    press(Action.Confirm); // PRESS OK
    press(Action.Confirm); // START
    press(Action.Confirm); // NORMAL
    press(0);
    expect(flow.stack.top?.id).toBe('game');
    addScore(shell.game.world, 0, 4321);
    shell.game.world.status = 'gameOver';
    for (let i = 0; i < 120; i++) press(0);
    // Normal has continues: the countdown first; Back gives up.
    expect(flow.stack.top?.id).toBe('continue');
    press(Action.Back);
    expect(flow.stack.top?.id).toBe('gameOver');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = JSON.parse((await platform.storage.get(SAVE_STORAGE_KEY)) ?? '{}') as {
      hiScores: Record<string, Array<{ score: number }>>;
      stats: { gameOvers: number };
    };
    expect(stored.hiScores['meter-normal'][0].score).toBe(4321);
    expect(stored.stats.gameOvers).toBe(1);
  });
});
