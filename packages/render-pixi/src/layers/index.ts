/**
 * # layers — draw-order layer stack
 *
 * **Status: placeholder.** Declares the intended public API only; no logic yet.
 *
 * **Responsibility.** The fixed draw order of the low-res scene, bottom → top: far BG → mid BG →
 * terrain → ground enemies → air enemies → player shots → player → hitbox marker →
 * items → explosions/particles → **enemy bullets** → HUD. One Pixi container per layer,
 * created once; bullets are always drawn above explosions and items so they stay
 * readable.
 *
 * **Implements.**
 * - shmup_feat.md §18 — draw order
 * - shmup_feat.md §12 — bullets drawn above explosions and items
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'layers',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §12'],
});

/** Layers in draw order (index 0 is drawn first). */
export type LayerName =
  | 'farBackground'
  | 'midBackground'
  | 'terrain'
  | 'groundEnemies'
  | 'airEnemies'
  | 'playerShots'
  | 'player'
  | 'hitboxMarker'
  | 'items'
  | 'effects'
  | 'enemyBullets'
  | 'hud';

// Planned: createLayerStack(scene: Container): Readonly<Record<LayerName, Container>>.
