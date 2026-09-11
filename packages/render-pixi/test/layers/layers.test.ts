/**
 * Tests for the layer stack: one container per core LayerId in the §18 draw order, the
 * world layers grouped (for screen shake) below HUD / UI / DEBUG.
 */
import { LAYER_COUNT, LAYER_NAMES, LayerId } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { WORLD_LAYER_COUNT, createLayerStack, moduleInfo } from '../../src/layers/index.js';

describe('render-pixi/layers', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('layers');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('creates one labelled container per layer, indexed by LayerId', () => {
    const stack = createLayerStack();
    expect(stack.layers).toHaveLength(LAYER_COUNT);
    stack.layers.forEach((layer, id) => expect(layer.label).toBe(LAYER_NAMES[id]));
  });

  it('groups BG_FAR … ENEMY_BULLETS under the world container, in draw order', () => {
    const stack = createLayerStack();
    expect(WORLD_LAYER_COUNT).toBe(LayerId.Hud);
    expect(stack.world.children).toEqual(stack.layers.slice(0, WORLD_LAYER_COUNT));
    expect(stack.world.getChildIndex(stack.layers[LayerId.EnemyBullets])).toBeGreaterThan(
      stack.world.getChildIndex(stack.layers[LayerId.Fx]),
    );
    expect(stack.world.getChildIndex(stack.layers[LayerId.Fx])).toBeGreaterThan(
      stack.world.getChildIndex(stack.layers[LayerId.Items]),
    );
  });

  it('puts the world group first and HUD, UI, DEBUG above it on the root', () => {
    const stack = createLayerStack();
    expect(stack.root.children).toEqual([
      stack.world,
      stack.layers[LayerId.Hud],
      stack.layers[LayerId.Ui],
      stack.layers[LayerId.Debug],
    ]);
  });
});
