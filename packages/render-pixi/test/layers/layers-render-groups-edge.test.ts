/**
 * Edge cases of the layer stack's render groups (plan M3-02e, the render review's **F1**;
 * `layers-render-groups.test.ts` has the membership list and the default):
 *
 * - the option is a *boolean* switch, not a truthiness one: only an explicit `false` builds the
 *   pre-M3-02e stack, and `undefined` / an empty options object / a fresh call all group;
 * - the membership list is well formed — every entry a real `LayerId`, no duplicates, in draw
 *   order — so a hand edit cannot quietly name a layer twice or one that does not exist;
 * - **grouping changes nothing about the tree.** A render group is a batch and instruction-set
 *   boundary, and the one thing that would not show up in any counted quantity is a layer drawn
 *   in the wrong place. So the whole stack is compared against the ungrouped one, container by
 *   container: same parents, same order, same labels, same transforms. The browser test
 *   (`test/e2e/render-groups.spec.ts`) then compares the *pixels* of the two;
 * - the stacks are independent, and a group boundary can sit on either side of the world /
 *   screen-fixed split (`WORLD_LAYER_COUNT`) — Pixi nests a group inside a plain container.
 */
import { LAYER_COUNT, LAYER_NAMES, LayerId } from '@shmup/core';
import type { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  RENDER_GROUP_LAYERS,
  WORLD_LAYER_COUNT,
  createLayerStack,
  type LayerStack,
} from '../../src/layers/index.js';

/**
 * A container's place in its stack: where it hangs, what it is called and how it is drawn —
 * everything a render group must leave alone.
 *
 * @param stack - The stack the container belongs to.
 * @param container - The container.
 * @returns A comparable description, with the parent named rather than referenced.
 */
function place(stack: LayerStack, container: Container): unknown {
  const parent = container.parent;
  const parentName =
    parent === null || parent === undefined
      ? null
      : parent === stack.root
        ? 'root'
        : parent === stack.world
          ? 'world'
          : `layer ${stack.layers.indexOf(parent)}`;
  return {
    label: container.label,
    parent: parentName,
    index: parent === null || parent === undefined ? -1 : parent.getChildIndex(container),
    children: container.children.length,
    visible: container.visible,
    alpha: container.alpha,
    x: container.x,
    y: container.y,
    zIndex: container.zIndex,
    sortableChildren: container.sortableChildren,
    blendMode: container.blendMode,
    filters: container.filters,
  };
}

/**
 * The whole stack as a comparable shape: the root, the world container and every layer.
 *
 * @param stack - The stack.
 * @returns One {@link place} per container, in `LayerId` order.
 */
function shape(stack: LayerStack): unknown[] {
  return [stack.root, stack.world, ...stack.layers].map((container) => place(stack, container));
}

describe('render-pixi/layers render groups, edge cases (M3-02e)', () => {
  it('only an explicit false turns the groups off', () => {
    const grouped = [
      createLayerStack(),
      createLayerStack({}),
      createLayerStack({ renderGroups: true }),
      createLayerStack({ renderGroups: undefined }),
    ];
    for (const stack of grouped) {
      expect(stack.renderGroups).toBe(true);
      expect(stack.layers[LayerId.EnemyBullets].isRenderGroup).toBe(true);
    }
    const plain = createLayerStack({ renderGroups: false });
    expect(plain.renderGroups).toBe(false);
    expect(plain.layers[LayerId.EnemyBullets].isRenderGroup).toBe(false);
  });

  it('names each layer once, in draw order, and every one of them exists', () => {
    const ids = [...RENDER_GROUP_LAYERS];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThan(LAYER_COUNT);
      expect(LAYER_NAMES[id]).toBeTypeOf('string');
    }
    // The three deliberate omissions, named rather than counted, so removing a layer from the
    // list on purpose has to be written down here too.
    const left = [];
    for (let id = 0; id < LAYER_COUNT; id++) if (ids.indexOf(id) < 0) left.push(LAYER_NAMES[id]);
    expect(left).toEqual(['BG_FAR', 'BG_MID', 'DEBUG']);
  });

  it('draws the same tree grouped and ungrouped: same parents, order, labels and transforms', () => {
    const grouped = createLayerStack();
    const plain = createLayerStack({ renderGroups: false });
    // The one difference there may be is the flag itself.
    expect(shape(grouped)).toEqual(shape(plain));
    for (let id = 0; id < LAYER_COUNT; id++) {
      expect(grouped.layers[id].label, `layer ${id}`).toBe(plain.layers[id].label);
      expect(
        grouped.layers[id].isRenderGroup !== plain.layers[id].isRenderGroup,
        `layer ${id}`,
      ).toBe(RENDER_GROUP_LAYERS.indexOf(id) >= 0);
    }
    // And the draw order itself, spelt out: the world layers bottom-up under `world`, then the
    // three screen-fixed layers above it on the root.
    for (const stack of [grouped, plain]) {
      expect(stack.world.children).toEqual(stack.layers.slice(0, WORLD_LAYER_COUNT));
      expect(stack.root.children).toEqual([
        stack.world,
        stack.layers[LayerId.Hud],
        stack.layers[LayerId.Ui],
        stack.layers[LayerId.Debug],
      ]);
    }
  });

  it('groups layers on both sides of the world / screen-fixed split', () => {
    const stack = createLayerStack();
    const world = RENDER_GROUP_LAYERS.filter((id) => id < WORLD_LAYER_COUNT);
    const fixed = RENDER_GROUP_LAYERS.filter((id) => id >= WORLD_LAYER_COUNT);
    expect(world.length).toBeGreaterThan(0);
    expect(fixed).toEqual([LayerId.Hud, LayerId.Ui]);
    // A group nested in a plain container (`world`) is exactly the arrangement M3-02e relies on:
    // the shake moves `world`, and the layer groups below it keep their own instruction sets.
    for (const id of world) expect(stack.layers[id].parent).toBe(stack.world);
    for (const id of fixed) expect(stack.layers[id].parent).toBe(stack.root);
  });

  it('gives every stack its own containers', () => {
    const a = createLayerStack();
    const b = createLayerStack();
    expect(a.root).not.toBe(b.root);
    for (let id = 0; id < LAYER_COUNT; id++) expect(a.layers[id]).not.toBe(b.layers[id]);
    // Turning the groups off in one stack does not reach the other.
    const plain = createLayerStack({ renderGroups: false });
    expect(a.layers[LayerId.Hud].isRenderGroup).toBe(true);
    expect(plain.layers[LayerId.Hud].isRenderGroup).toBe(false);
  });
});
