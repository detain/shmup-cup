/**
 * # layers — draw-order layer stack
 *
 * **Responsibility.** The fixed draw order of the low-res scene: one Pixi container per core
 * `LayerId`, created once, bottom → top (shmup_feat.md §18, plan §3.4):
 * `BG_FAR, BG_MID, TERRAIN, GROUND_ENEMIES, AIR_ENEMIES, PLAYER_SHOTS, PLAYER, HITBOX, ITEMS,
 * FX, ENEMY_BULLETS, HUD, UI, DEBUG`. Enemy bullets are drawn above explosions and items so
 * they stay readable. The layers up to `ENEMY_BULLETS` sit in a **world** group (the renderer
 * offsets it for screen shake); `HUD`, `UI` and `DEBUG` stay fixed to the screen.
 *
 * Pixel snapping: the renderer is created with `roundPixels: true` and every binding writes
 * integer positions (`Math.round`), so nothing in the stack is drawn at sub-pixel offsets.
 *
 * **Implements.**
 * - shmup_feat.md §18 — draw order
 * - shmup_feat.md §12 — bullets drawn above explosions and items
 *
 * **Public API.** {@link createLayerStack}, {@link LayerStack}, {@link WORLD_LAYER_COUNT}.
 *
 * **Planned.** Terrain tiles and parallax backgrounds are drawn into `TERRAIN` / `BG_*` from
 * M1-07.
 *
 * @module
 */
import { LAYER_COUNT, LAYER_NAMES, LayerId, defineModule } from '@shmup/core';
import { Container } from 'pixi.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'layers',
  status: 'implemented',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §12'],
});

/** Layers `0 … WORLD_LAYER_COUNT - 1` belong to the world group (moved by screen shake). */
export const WORLD_LAYER_COUNT: number = LayerId.Hud;

/** The layer containers of one renderer. */
export interface LayerStack {
  /** Parent of everything; add it to the low-res scene. */
  readonly root: Container;
  /** The world group (`BG_FAR` … `ENEMY_BULLETS`), a child of {@link LayerStack.root}. */
  readonly world: Container;
  /** One container per core `LayerId`, indexed by the layer code. */
  readonly layers: readonly Container[];
}

/**
 * Creates the layer containers in draw order.
 *
 * @remarks
 * `root` children: `world`, `HUD`, `UI`, `DEBUG`; `world` children: the eleven world layers.
 * Each container's `label` is the layer name (`'ENEMY_BULLETS'`), which shows up in Pixi
 * devtools. Content is added by the renderer (sprite bindings, draw-list views, overlays).
 *
 * @returns The stack.
 *
 * @example
 * ```ts
 * const stack = createLayerStack();
 * scene.addChild(stack.root);
 * stack.layers[LayerId.EnemyBullets].addChild(bulletBinding.container);
 * ```
 */
export function createLayerStack(): LayerStack {
  const root = new Container({ label: 'layers' });
  const world = new Container({ label: 'world' });
  root.addChild(world);
  const layers: Container[] = [];
  for (let id = 0; id < LAYER_COUNT; id++) {
    const layer = new Container({ label: LAYER_NAMES[id] ?? `layer-${id}` });
    layers.push(layer);
    if (id < WORLD_LAYER_COUNT) world.addChild(layer);
    else root.addChild(layer);
  }
  return { root, world, layers };
}
