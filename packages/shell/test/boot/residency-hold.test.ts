/**
 * The residency hold (plan R3-04.M3c, decision W5-16): while the lazy atlas pages the shown World
 * needs are in flight, the frame loop redraws the last displayed frame — no tick runs and no input
 * is consumed — so a replay across a zone change hashes the same with and without the hold, and a
 * debug frame advance (`Game.requestStep`, what the e2e `stepTo` helper of
 * `test/e2e/frame-advance.ts` drives) asked for while pages load waits in the game's queue and
 * runs exactly one tick once they are in.
 *
 * The harness is the residency harness of `boot-residency.test.ts` with one change: every page
 * image finishes loading only when the test releases it, so the lazy run's hold windows are
 * placed by hand (the eager run releases its boot pages the same way and never loads again).
 */
import {
  Action,
  commitPlayerInput,
  createHeadlessPlatform,
  hashWorld,
  type IAudio,
  type Platform,
  type RenderFrame,
} from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  ATLAS_PAGES_ATTRIBUTE,
  SCENE_ATTRIBUTE,
  bootShell,
  type Shell,
  type ShellInput,
  type ShellOptions,
} from '../../src/boot/index.js';
import type { BootOverlay } from '../../src/error-screen/index.js';
import type { LoadableImage } from '../../src/loader/index.js';

const fakes = vi.hoisted(() => ({
  /** What the renderer was asked, in order: `upload` (with the source), `warmUp`, `render`. */
  calls: [] as Array<{ kind: 'upload' | 'warmUp' | 'render'; source?: unknown }>,
  /** The atlas pages on the fake GPU (see the residency harness). */
  gpu: new Set<unknown>(),
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    createPixiRenderer: (options: { atlas: RenderPixi.Atlas }) => {
      const { atlas } = options;
      for (const page of atlas.pages) page.on('unload', () => fakes.gpu.delete(page));
      let names: readonly string[] = [];
      /**
       * Pixi's upload on first draw, for the terrain (as in the residency harness).
       *
       * @param frame - The frame drawn.
       */
      const drawTerrain = (frame: RenderFrame): void => {
        const terrain = frame.world?.terrain ?? null;
        if (terrain === null) return;
        const sprite = atlas.manifest.sprites[names[terrain.tilesetSpriteId] ?? ''];
        const info = sprite === undefined ? undefined : atlas.manifest.frames[sprite.frames[0]];
        if (info !== undefined) fakes.gpu.add(atlas.pages[info.p]);
      };
      return Promise.resolve({
        webGLVersion: 1,
        effects: real.createScreenEffects(),
        particles: null,
        popups: null,
        setFxContent: () => {},
        setBulletPalette: () => {},
        setScaleMode: () => {},
        setShowHitbox: () => {},
        interpolation: false,
        setInterpolation(this: { interpolation: boolean }, on: boolean) {
          this.interpolation = on;
        },
        setSpriteNames: (spriteNames: readonly string[]) => {
          names = spriteNames;
        },
        bindWorld: () => {},
        warmUp: () => fakes.calls.push({ kind: 'warmUp' }),
        uploadTextureSource: (source: unknown) => {
          fakes.gpu.add(source);
          fakes.calls.push({ kind: 'upload', source });
        },
        render: (frame: RenderFrame) => {
          fakes.calls.push({ kind: 'render' });
          drawTerrain(frame);
        },
        resize: () => {},
        destroy: () => {},
      });
    },
  };
});

/** Gated page images: each one finishes loading only when the test releases it. */
const pending: GatedImage[] = [];

const STEP = 1000 / 60;
const { manifest } = buildAtlas();
const pageUrls = manifest.pages.map((page) => `assets/atlas/${page.file}`);
const contentFiles = readContentFiles();

/**
 * The pages of the `common` group and of one zone, from the manifest.
 *
 * @param zone - The zone's group, or `null` for every page.
 * @returns Ascending page indices.
 */
const groupPages = (zone: string | null): number[] =>
  manifest.pages.flatMap((page, p) =>
    zone === null || page.group === 'common' || page.group === zone ? [p] : [],
  );

/** An image whose load the test releases by hand. */
class GatedImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  private url = '';

  constructor() {
    pending.push(this);
  }

  get src(): string {
    return this.url;
  }

  set src(value: string) {
    this.url = value;
  }

  /** Finishes this image's load at its manifest page's size. */
  release(): void {
    const page = manifest.pages.find((p) => this.url.endsWith(`/${p.file}`));
    this.width = this.naturalWidth = page?.w ?? 1;
    this.height = this.naturalHeight = page?.h ?? 1;
    this.onload?.call(null as never, {} as Event);
  }
}

/** Releases every parked image and lets the residency's prepare continuation run. */
async function releasePending(): Promise<void> {
  while (pending.length > 0) pending.shift()?.release();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A window with rAF and listeners. */
class FakeWindow extends EventTarget {
  innerWidth = 1920;
  innerHeight = 1080;
  private pendingFrame: ((now: number) => void) | null = null;

  requestAnimationFrame(callback: (now: number) => void): number {
    this.pendingFrame = callback;
    return 1;
  }

  cancelAnimationFrame(): void {
    this.pendingFrame = null;
  }

  /**
   * Runs the pending animation frame.
   *
   * @param now - rAF timestamp.
   */
  frame(now: number): void {
    const callback = this.pendingFrame;
    this.pendingFrame = null;
    callback?.(now);
  }
}

let win: FakeWindow;
let platform: ReturnType<typeof createHeadlessPlatform>;
let input: ShellInput;
let audio: IAudio;
/**
 * `platform.input.poll` calls so far — the only consumption site is `step()` (core/game), so
 * held frames must not raise it (the snapshot object itself is aliased into game state and
 * proves nothing about consumption).
 */
let polls = 0;

beforeEach(() => {
  win = new FakeWindow();
  fakes.calls.length = 0;
  fakes.gpu.clear();
  pending.length = 0;
  polls = 0;
  platform = createHeadlessPlatform();
  input = {
    poll: () => platform.snapshot,
    clear() {},
    setContext() {},
    destroy() {},
  };
  audio = {
    state: 'uninitialized',
    unlock: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    resume: () => Promise.resolve(),
    setBusVolume: () => {},
    destroy: () => Promise.resolve(),
  };
});

/** A booted shell plus the canvas attributes it wrote. */
interface Held {
  readonly shell: Shell;
  readonly attributes: Map<string, string>;
}

/**
 * Boots the scene flow on zone B, releasing gated images until boot settles (the lazy boot waits
 * for the boot stage's pages themselves — decision W5-16; the eager boot loads every page here).
 *
 * @param overrides - Option overrides.
 * @returns The shell and its canvas attributes.
 */
async function bootOnce(overrides: Partial<ShellOptions> = {}): Promise<Held> {
  const attributes = new Map<string, string>();
  const canvas = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLCanvasElement;
  const overlay: BootOverlay = {
    canvas: {} as HTMLCanvasElement,
    showProgress: () => {},
    showError: () => {},
    remove: () => {},
  };
  const promise = bootShell({
    canvas,
    win: win as unknown as Window,
    contentFiles,
    assets: { manifest, pageUrls },
    input,
    audio,
    platform: (): Platform => ({
      ...platform,
      input: {
        ...platform.input,
        poll: () => {
          polls++;
          return platform.input.poll();
        },
      },
    }),
    createImage: () => new GatedImage() as unknown as LoadableImage & HTMLImageElement,
    overlay,
    scene: 'game',
    gameConfig: { stage: 'zone-b' },
    ...overrides,
  });
  let booted = false;
  promise.then(
    () => {
      booted = true;
    },
    () => {
      booted = true;
    },
  );
  while (!booted) await releasePending();
  return { shell: await promise, attributes };
}

/**
 * Presses and releases an action over two displayed frames.
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

/**
 * From the title to the weapon select (PRESS OK, START, NORMAL, the ship).
 *
 * @param start - The first frame's timestamp.
 * @returns The next free timestamp.
 */
function toWeaponSelect(start: number): number {
  let at = press(0, start);
  at = press(Action.Confirm, at); // PRESS OK
  at = press(Action.Confirm, at); // START → the difficulty menu
  at = press(Action.Confirm, at); // NORMAL
  at = press(0, at);
  at = press(Action.Confirm, at); // the ship select
  return press(0, at);
}

/**
 * The page indices of the uploaded sources, in upload order.
 *
 * @param pages - The atlas's pages.
 * @returns Indices.
 */
const uploadedPages = (pages: readonly unknown[]): number[] =>
  fakes.calls.filter((call) => call.kind === 'upload').map((call) => pages.indexOf(call.source));

/** Counts the `render` calls so far (the hold must redraw every held frame). */
const renders = (): number =>
  fakes.calls.reduce((n, call) => n + (call.kind === 'render' ? 1 : 0), 0);

const stageOf = (shell: Shell, id: string): number => shell.content.db.stageIndex.get(id) ?? -1;

/**
 * Waits for the canvas to show exactly these pages as resident, releasing gated images meanwhile.
 *
 * @param held - The booted shell.
 * @param expected - Ascending page indices.
 */
async function waitForPages(held: Held, expected: readonly number[]): Promise<void> {
  const want = expected.join(',');
  for (let guard = 0; guard < 50; guard++) {
    if (held.attributes.get(ATLAS_PAGES_ATTRIBUTE) === want) return;
    await releasePending();
  }
  throw new Error(`pages ${want} never became resident`);
}

/**
 * From boot to the game scene on zone B, through the zone C detour (which makes the game's zone B
 * pages a real lazy load). The lazy run gates the zone B refetch across `holdFrames` displayed
 * frames first — the hold — asserting it ticks nothing, consumes no input and redraws every
 * frame, exactly as decision W5-16 promises.
 *
 * @param lazy - Whether the boot uses lazy pages.
 * @param holdFrames - Displayed frames to run while the refetch is gated.
 * @returns The held shell and the next free frame timestamp.
 */
async function toGameScene(lazy: boolean, holdFrames: number): Promise<{ held: Held; at: number }> {
  const held = await bootOnce({ atlasPages: lazy ? 'lazy' : 'eager' });
  // The zone C detour: lazy fetches C's pages now; eager already holds every image.
  held.shell.atlasResidency.prepare(stageOf(held.shell, 'zone-c'));
  await waitForPages(held, groupPages('zone-c'));
  expect(uploadedPages(held.shell.atlas.pages).length).toBeGreaterThan(0);
  let at = toWeaponSelect(1000);
  // The preview World of the weapon select (R3-04.M3e): its page streams in lazily, and the
  // held frames would swallow the START press. Let the preview settle first (nothing is pending
  // in the eager run, so the drain is a no-op there).
  await releasePending();
  at = press(Action.Confirm, at); // the weapon select's START
  at = press(0, at);
  if (lazy) {
    // The game's zone B refetch is in flight: held frames redraw, never tick, never poll input.
    const tickBefore = held.shell.game.state.tick;
    const rendersBefore = renders();
    const pollsBefore = polls;
    commitPlayerInput(platform.snapshot.players[0], Action.Shot); // must NOT be consumed
    for (let f = 0; f < holdFrames; f++) {
      win.frame(at);
      at += STEP;
    }
    expect(held.shell.game.state.tick, 'the hold ran no tick').toBe(tickBefore);
    expect(renders(), 'the hold redrew every frame').toBe(rendersBefore + holdFrames);
    expect(polls, 'the hold consumed no input').toBe(pollsBefore);
    await releasePending();
    commitPlayerInput(platform.snapshot.players[0], 0);
  }
  // Until the game scene: one tick per displayed frame in both runs (the vsync lock's one per rAF).
  let guard = 0;
  while (held.attributes.get(SCENE_ATTRIBUTE) !== 'game' && guard++ < 600) {
    win.frame(at);
    at += STEP;
  }
  expect(held.attributes.get(SCENE_ATTRIBUTE)).toBe('game');
  // Align the two runs to one absolute tick: the World is created on the START tick and the
  // frames right after it are held by the lazy run (that is the hold) — the held ticks simply
  // arrive after the pages. Frame advance drives the catch-up one exact tick per frame: the free
  // accumulator would replay the held wall time as a burst (the same per-tick stream at shifted
  // tick indices — which is why the e2e `stepTo` helper steps under frame advance too).
  held.shell.game.debug.frameAdvance = true;
  guard = 0;
  while (held.shell.game.state.tick < 17 && guard++ < 600) {
    held.shell.game.requestStep(1);
    win.frame(at);
    at += STEP;
  }
  expect(held.shell.game.state.tick).toBe(17);
  return { held, at };
}

/**
 * Frame advance on, then thirty exact ticks with a per-tick input pattern fixed to the tick alone
 * — never to the frame or the clock — hashing the World every fifth tick.
 *
 * @param held - The booted shell showing the game.
 * @param at - The first frame's timestamp.
 * @returns The six hashes.
 */
function stepThirtyTicks(held: Held, at: number): number[] {
  const game = held.shell.game;
  game.debug.frameAdvance = true;
  const start = game.state.tick;
  const hashes: number[] = [];
  for (let k = 1; k <= 30; k++) {
    commitPlayerInput(platform.snapshot.players[0], Action.Up | (k % 2 === 0 ? Action.Shot : 0));
    game.requestStep(1);
    win.frame(at);
    at += STEP;
    expect(game.state.tick, `tick after step ${k}`).toBe(start + k);
    if (k % 5 === 0) hashes.push(hashWorld(game.world));
  }
  commitPlayerInput(platform.snapshot.players[0], 0);
  return hashes;
}

describe('shell/boot residency hold (R3-04.M3c)', () => {
  it('a replay across a zone change hashes the same with and without the hold', async () => {
    const eager = await toGameScene(false, 0);
    const eagerHashes = stepThirtyTicks(eager.held, 10_000);
    eager.held.shell.stop();

    const held = await toGameScene(true, 3);
    const heldHashes = stepThirtyTicks(held.held, 10_000);
    held.held.shell.stop();

    expect(heldHashes.length).toBe(6);
    expect(heldHashes).toEqual(eagerHashes);
  });

  it('a frame advance asked for while pages load runs exactly one tick once they are in', async () => {
    const held = await toGameScene(true, 0);
    const game = held.held.shell.game;
    game.debug.frameAdvance = true;
    // A lazy stage change mid-run: the detach is synchronous, the pages are gated → hold.
    held.held.shell.atlasResidency.prepare(stageOf(held.held.shell, 'zone-c'));
    game.requestStep(1);
    const before = game.state.tick;
    win.frame(20_000);
    win.frame(20_000 + STEP);
    expect(game.state.tick, 'the hold ran no tick').toBe(before);
    await releasePending();
    win.frame(20_000 + 2 * STEP);
    expect(game.state.tick, 'the first released frame ran exactly the queued tick').toBe(
      before + 1,
    );
    win.frame(20_000 + 3 * STEP);
    expect(game.state.tick, 'the queue is empty: no tick on its own').toBe(before + 1);
    held.held.shell.stop();
  });
});
