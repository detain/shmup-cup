/**
 * The layer stack's render groups (plan M3-02e, the render review's **F1**): every layer that
 * toggles sprites while the game runs is its own Pixi render group, so hiding one bullet rebuilds
 * that layer's instruction set instead of the whole scene's ~6,400 display objects. The two
 * background layers and `DEBUG` are deliberately left plain, and `renderGroups: false` restores
 * the single-group stack the bench measures against.
 */
import { LAYER_COUNT, LayerId } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { RENDER_GROUP_LAYERS, createLayerStack } from '../../src/layers/index.js';

describe('render-pixi/layers render groups (M3-02e)', () => {
  it('names every layer that toggles sprites, and only those', () => {
    expect([...RENDER_GROUP_LAYERS].sort((a, b) => a - b)).toEqual([
      LayerId.Terrain,
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
      LayerId.PlayerShots,
      LayerId.Player,
      LayerId.Hitbox,
      LayerId.Items,
      LayerId.Fx,
      LayerId.EnemyBullets,
      LayerId.Hud,
      LayerId.Ui,
    ]);
    // The parallax bands are shown once when they are bound and the Mode-7 mesh follows a camera
    // range, so those two layers would buy a batch boundary and nothing else; `DEBUG` is empty in
    // a release build.
    for (const id of [LayerId.BgFar, LayerId.BgMid, LayerId.Debug]) {
      expect(RENDER_GROUP_LAYERS).not.toContain(id);
    }
  });

  it('makes exactly those layers render groups by default', () => {
    const stack = createLayerStack();
    expect(stack.renderGroups).toBe(true);
    for (let id = 0; id < LAYER_COUNT; id++) {
      expect(stack.layers[id].isRenderGroup, `layer ${id}`).toBe(RENDER_GROUP_LAYERS.includes(id));
    }
    // The stack's own containers stay plain: the scene's root group is the one `render()` hands
    // to Pixi, and the world container is what screen shake moves.
    expect(stack.root.isRenderGroup).toBe(false);
    expect(stack.world.isRenderGroup).toBe(false);
  });

  it('builds the pre-M3-02e single-group stack with renderGroups: false', () => {
    const stack = createLayerStack({ renderGroups: false });
    expect(stack.renderGroups).toBe(false);
    for (let id = 0; id < LAYER_COUNT; id++) {
      expect(stack.layers[id].isRenderGroup, `layer ${id}`).toBe(false);
    }
  });
});
