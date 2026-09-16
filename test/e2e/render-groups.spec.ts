/**
 * The layer render groups of plan **M3-02e** in a real browser (headless Chromium, SwiftShader
 * WebGL), on the test build `pnpm test:e2e` makes.
 *
 * A render group is a **batch and instruction-set boundary**. Every other check in the repo is a
 * counted quantity — rebuilds, draw calls, which container carries which flag — and not one of
 * them could see a layer that ended up drawn in the wrong place. M3-02d's review learnt that the
 * hard way (structural assertions passed while the shader itself was wrong, until mutation testing
 * was applied), so this spec compares **pixels**:
 *
 * 1. a frozen frame is screenshotted, `disableRenderGroup()` is then called on all eleven grouped
 *    layer containers at runtime, and the frame is screenshotted again — the two PNGs must be
 *    byte-identical, on seven scenes covering a filtered layer, the Mode-7 mesh, a boss, the
 *    calibration pattern, the title screen's HUD and UI menus and the hitbox markers;
 * 2. and the comparison is proved **sensitive** twice over: moving a layer container to another
 *    draw position — exactly the regression a group boundary could cause — must make the same
 *    comparison fail, and so must hiding any one grouped layer. Without those controls, a spec
 *    that screenshots a black canvas twice would pass for ever.
 *
 * The last test pins the figure the owner actually reads on the TV. While the game plays with the
 * overlay off, `REB` must sit at 0 or very near it — the whole of F1. With the overlay **on**, the
 * condition every on-device measurement is taken under
 * (`docs/dev/rendering-and-shell.md`, "Measuring on the TV"), it rises: `DEBUG` is deliberately
 * not a render group, so the panel's own quads dirty the scene's root group. How far it rises
 * depends on the machine rather than on the renderer, so that figure is recorded, and what is
 * checked instead is the mechanism: grouping `DEBUG` at runtime takes it straight back to 0, which
 * says the rise is the overlay's own churn and that every layer the step grouped is still
 * confining its own.
 */
import { expect, test, type Page } from '@playwright/test';
import { freezeSim, stepTo } from './frame-advance.js';

/** Layers M3-02e makes render groups (`render-pixi`'s `RENDER_GROUP_LAYERS`). */
const RENDER_GROUP_COUNT = 11;

/** What this spec reads and pokes on `window.__shmupDebug`. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly flags: { overlay: boolean };
    readonly renderer: {
      readonly structureRebuilds: number;
      readonly groupRebuilds: number;
      readonly layers: {
        readonly root: PixiContainerLike;
        readonly world: PixiContainerLike;
        readonly layers: readonly PixiContainerLike[];
      };
      setShowHitbox(on: boolean): void;
    };
  };
}

/** The part of a Pixi `Container` this spec touches from the page. */
interface PixiContainerLike {
  readonly isRenderGroup: boolean;
  visible: boolean;
  readonly children: readonly unknown[];
  readonly parent: { setChildIndex(child: unknown, index: number): void; children: unknown[] };
  disableRenderGroup(): void;
  enableRenderGroup(): void;
}

/** One scene the equivalence is checked on. */
interface Scene {
  /** Name in the test title. */
  readonly id: string;
  /** Page URL. */
  readonly url: string;
  /** World tick to step to, or 0 for a scene with no world of its own. */
  readonly tick: number;
  /** Turn the hitbox markers on before capturing. */
  readonly hitbox?: boolean;
}

/**
 * The seven scenes: between them they cover every layer that is a render group and both layers
 * that deliberately are not.
 */
const SCENES: readonly Scene[] = [
  { id: 'flight (the default stage)', url: './?scene=flight', tick: 240 },
  { id: 'raster-range (a filtered layer)', url: './?scene=flight&stage=raster-range', tick: 200 },
  { id: 'dimension (the Mode-7 mesh)', url: './?scene=flight&stage=dimension', tick: 200 },
  { id: 'test-boss', url: './?scene=flight&stage=test-boss', tick: 300 },
  { id: 'calibration (the test pattern)', url: './?scene=calibration', tick: 0 },
  { id: 'the title screen (HUD and UI menus)', url: './', tick: 0 },
  {
    id: 'zone-a with hitbox markers',
    url: './?scene=flight&stage=zone-a',
    tick: 240,
    hitbox: true,
  },
];

/**
 * Waits two animation frames, so the canvas shows what the last change did.
 *
 * @param page - The page.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/**
 * Screenshots the canvas.
 *
 * @param page - The page.
 * @returns The PNG bytes.
 */
function capture(page: Page): Promise<Buffer> {
  return page.locator('#game').screenshot();
}

/**
 * Opens a scene, freezes the sim and brings it to the scene's tick.
 *
 * @param page - The page.
 * @param scene - The scene.
 */
async function open(page: Page, scene: Scene): Promise<void> {
  await page.goto(scene.url);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  await freezeSim(page);
  if (scene.tick > 0) await stepTo(page, scene.tick);
  if (scene.hitbox === true) {
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.renderer.setShowHitbox(true);
    });
  }
  await settle(page);
}

/**
 * Collects console and page errors.
 *
 * @param page - The page.
 * @returns The messages (filled while the test runs).
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('render groups draw the same picture (M3-02e, review F1)', () => {
  for (const scene of SCENES) {
    test(`${scene.id} is pixel-identical with the layer groups turned off`, async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, scene);

      // The control that makes the comparison mean something: a frozen scene must screenshot the
      // same twice. If it did not, the test below would be comparing two different frames.
      const grouped = await capture(page);
      await settle(page);
      expect(
        (await capture(page)).equals(grouped),
        'the frozen scene must render the same frame twice',
      ).toBe(true);

      // Now take the groups away at runtime: the scene becomes the single-group one of before
      // M3-02e, with every container in exactly the same place.
      const disabled = await page.evaluate(() => {
        const { layers } = (window as unknown as DebugWindow).__shmupDebug.renderer;
        let count = 0;
        for (const layer of layers.layers) {
          if (layer.isRenderGroup) {
            layer.disableRenderGroup();
            count++;
          }
        }
        return {
          count,
          root: layers.root.isRenderGroup,
          world: layers.world.isRenderGroup,
          left: layers.layers.filter((layer) => layer.isRenderGroup).length,
        };
      });
      // Every grouped layer was found and turned off, and the stack's own two containers were
      // never groups in the first place.
      expect(disabled).toEqual({ count: RENDER_GROUP_COUNT, root: false, world: false, left: 0 });

      await settle(page);
      const single = await capture(page);
      expect(
        single.equals(grouped),
        'the grouped scene must draw exactly the picture the single-group scene draws',
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }

  test('the comparison would catch a layer drawn in the wrong place', async ({ page }) => {
    const errors = collectErrors(page);
    // A stage with terrain, a ship and a HUD, so there is something on every kind of layer.
    await open(page, { id: 'zone-a', url: './?scene=flight&stage=zone-a', tick: 240 });
    const before = await capture(page);

    // The mutation a pixel comparison exists to catch, injected deliberately: a layer container
    // moved to another draw position. A render group is an instruction-set boundary, and a layer
    // that ended up drawn in the wrong order is the one way it could go wrong that no counted
    // quantity in this repo would notice. Three of them, so the control covers a world layer that
    // draws the stage, one that draws the ship, and a screen-fixed one:
    //
    // - `TERRAIN` under the parallax bands,
    // - `PLAYER` under them as well (the ship behind the background),
    // - `HUD` under the whole world container (the bars behind the stage).
    for (const layer of [2, 6, 11]) {
      const restore = await page.evaluate((id) => {
        const { layers } = (window as unknown as DebugWindow).__shmupDebug.renderer;
        const target = layers.layers[id];
        const index = target.parent.children.indexOf(target);
        target.parent.setChildIndex(target, 0);
        return index;
      }, layer);
      expect(restore, `layer ${layer} must start somewhere above the bottom`).toBeGreaterThan(0);
      await settle(page);
      expect(
        (await capture(page)).equals(before),
        `moving layer ${layer} must change the picture — otherwise the checks above prove nothing`,
      ).toBe(false);
      // Put it back, and the original frame must come back with it.
      await page.evaluate(
        ([id, index]) => {
          const { layers } = (window as unknown as DebugWindow).__shmupDebug.renderer;
          const target = layers.layers[id];
          target.parent.setChildIndex(target, index);
        },
        [layer, restore] as [number, number],
      );
      await settle(page);
      expect((await capture(page)).equals(before), `layer ${layer} restored`).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('every busy layer group really contributes pixels of its own', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, { id: 'zone-a', url: './?scene=flight&stage=zone-a', tick: 240 });
    const full = await capture(page);

    // The other half of the sensitivity argument: the seven equivalence checks above would also
    // pass if the grouped layers drew nothing at all. Hiding one at a time must change the
    // picture, which says the screenshot really does carry each group's own output.
    const contributing: number[] = [];
    for (const layer of [2, 3, 4, 5, 6, 8, 9, 10, 11]) {
      await page.evaluate((id) => {
        const { layers } = (window as unknown as DebugWindow).__shmupDebug.renderer;
        layers.layers[id].visible = false;
      }, layer);
      await settle(page);
      const hidden = await capture(page);
      if (!hidden.equals(full)) contributing.push(layer);
      await page.evaluate((id) => {
        const { layers } = (window as unknown as DebugWindow).__shmupDebug.renderer;
        layers.layers[id].visible = true;
      }, layer);
      await settle(page);
    }
    // TERRAIN, the enemy layers, the player's shots, the player, the items, the FX, the enemy
    // bullets and the HUD: a busy zone-a frame does not carry every one of them at once, but it
    // must carry most, and certainly the terrain, the player and the HUD.
    expect(contributing).toEqual(expect.arrayContaining([2, 6, 11]));
    expect(contributing.length).toBeGreaterThanOrEqual(5);
    // Putting them all back gives the original frame again.
    expect((await capture(page)).equals(full)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('the REB figure the owner reads on the TV (M3-02e)', () => {
  /** Frames each half of the measurement runs for. */
  const FRAMES = 180;

  /**
   * Runs `FRAMES` animation frames and reports what the two counters did over them.
   *
   * @param page - The page.
   * @returns The rise in `structureRebuilds` and in `groupRebuilds`.
   */
  async function measure(page: Page): Promise<{ scene: number; groups: number }> {
    return page.evaluate(
      (frames) =>
        new Promise<{ scene: number; groups: number }>((resolve) => {
          const { renderer } = (window as unknown as DebugWindow).__shmupDebug;
          const scene = renderer.structureRebuilds;
          const groups = renderer.groupRebuilds;
          let left = frames;
          const step = (): void => {
            if (--left <= 0) {
              resolve({
                scene: renderer.structureRebuilds - scene,
                groups: renderer.groupRebuilds - groups,
              });
            } else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
      FRAMES,
    );
  }

  test('is 0 or very near it while the game plays, and the overlay is the only thing that moves it', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    // Played, not frozen: this is the figure read while the game runs, on the busiest shipped
    // zone, with every binding toggling `visible` on every frame.
    await page.goto('./?scene=flight&stage=zone-a');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await settle(page);

    // `DEBUG` is deliberately not a render group (it is empty in a release build), which is what
    // makes the overlay-on figure the interesting one: the panel's churn has nowhere to go but the
    // scene's own group.
    const debugLayer = await page.evaluate(
      () =>
        (window as unknown as DebugWindow).__shmupDebug.renderer.layers.layers[13].isRenderGroup,
    );
    expect(debugLayer).toBe(false);

    // Overlay off. Before M3-02e this rose on 655–659 of every 660 frames the bench measured; the
    // whole of F1 is that it now does not, whatever the machine is doing.
    const off = await measure(page);
    expect(off.groups, 'the counters must be alive: layer groups do rebuild').toBeGreaterThan(0);
    expect(off.scene).toBeLessThanOrEqual(FRAMES / 20);

    // Overlay on — the condition every on-device measurement is taken under. The panel really has
    // to be drawing for the rest of this to mean anything, so the picture must change.
    const quiet = await capture(page);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.overlay = true;
    });
    await settle(page);
    expect((await capture(page)).equals(quiet), 'the overlay panel must really be drawn').toBe(
      false,
    );
    const on = await measure(page);
    expect(on.groups).toBeGreaterThan(0);
    // How far this rises is a property of the *machine*, not of the renderer: the panel's own text
    // churns whenever a printed number changes width, so an idle box measures a few per cent
    // (round 1 of this step read 18 of 300 by hand) and a loaded one much more (88 of 180 in a
    // full `pnpm test:e2e` run). So the figure is recorded rather than gated — what is gated is
    // that it never passes one rebuild per frame, which is what a counting bug would look like.
    expect(on.scene).toBeLessThanOrEqual(FRAMES);
    testInfo.annotations.push({
      type: 'REB',
      description:
        `${off.scene}/${FRAMES} frames rebuilt the scene with the overlay off, ` +
        `${on.scene}/${FRAMES} with it on (${off.groups} and ${on.groups} render-group rebuilds)`,
    });

    // And the mechanism, which *is* machine-independent: give `DEBUG` a render group of its own at
    // runtime and the same overlay, on the same busy frame, stops touching the scene's group at
    // all. That says the rise above is the overlay's own quads and nothing else — every layer the
    // step grouped is still confining its churn, however loaded the box is.
    await page.evaluate(() => {
      (
        window as unknown as DebugWindow
      ).__shmupDebug.renderer.layers.layers[13].enableRenderGroup();
    });
    await settle(page);
    const confined = await measure(page);
    expect(confined.scene).toBeLessThanOrEqual(FRAMES / 20);
    expect(confined.groups).toBeGreaterThan(0);

    // …and turning the overlay off again gives the quiet figure back either way.
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.overlay = false;
    });
    await settle(page);
    const again = await measure(page);
    expect(again.scene).toBeLessThanOrEqual(FRAMES / 20);
    expect(errors).toEqual([]);
  });
});
