/**
 * # options — options ("multiples")
 *
 * **Status: partial.** The standard **trail** Option of meter mode is implemented (plan M1-10);
 * the Snake, Formation and Rotate types and the Option Hunter that steals options arrive with
 * M2-04, option recovery after death with M3.
 *
 * **Responsibility.** Up to {@link MAX_OPTIONS} invulnerable drones per ship that follow the
 * ship's flown path, pass through terrain and copy every weapon (the firing itself is
 * `core/weapons`). Each ship has one {@link OptionGroup}: a ring buffer of past ship positions
 * ({@link OPTION_TRAIL_CAPACITY} entries) and the options' current world positions.
 *
 * **The trail (decision D26).** The buffer holds **screen-space** positions (`ship − camera`)
 * and advances only on ticks the ship has movement input (`PlayerShip.moving`) — and on every
 * tick of a fly-in, where the ship moves on its own. Option `k` (0-based) sits at the entry
 * `(k + 1) · OPTION_SPACING` records back, converted back to world space with the current
 * camera. So:
 *
 * - while the ship is idle the options hold their place **on screen**: during scrolling they ride
 *   along with the ship instead of being strung out behind it by the scroll ("bunched");
 * - when the ship moves they spread out along its path, 12 recorded steps apart;
 * - pushing against the edge of the view keeps recording the same position, so they converge on
 *   the ship (the Gradius feel).
 *
 * A fresh trail (stage start, respawn) is filled with the ship's position — every option starts
 * on the ship.
 *
 * **Zero allocation.** A group owns its typed arrays; {@link OptionGroup.follow} takes the ship
 * and the camera as objects and reads their fields itself, so no fractional number crosses a call
 * boundary (V8 boxes those when it does not inline the call).
 *
 * **Implements.**
 * - shmup_feat.md §8 Options / multiples — standard Option: up to 4, follows the flown path
 *   (ring buffer that advances only on movement), invulnerable, passes through walls
 *
 * **Public API.** {@link OptionGroup}, {@link createOptionGroup}, {@link OptionFormation},
 * {@link MAX_OPTIONS}, {@link OPTION_SPACING}, {@link OPTION_TRAIL_CAPACITY},
 * {@link OPTION_SPRITE}, {@link OPTION_ANIM_TICKS}.
 *
 * **Planned API.** Snake / Formation / Rotate formations and the Option Hunter's `stolen` count
 * (M2-04); option recovery after death (M3).
 *
 * @module
 */
import { defineModule } from '../module-info.js';
import type { PlayerCamera, PlayerShip } from '../player/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'options',
  status: 'partial',
  specRefs: ['shmup_feat.md §8'],
});

/** Most options one ship can have (decision D5). */
export const MAX_OPTIONS = 4;

/** Recorded steps between the ship and option 1, and between neighbouring options. */
export const OPTION_SPACING = 12;

/** Trail entries per ship: `MAX_OPTIONS × OPTION_SPACING + 1` (the newest entry is the ship). */
export const OPTION_TRAIL_CAPACITY = MAX_OPTIONS * OPTION_SPACING + 1;

/** The option's sprite (an engine sprite: content never names it — see core `world`). */
export const OPTION_SPRITE = 'options/orb';

/** Ticks per frame of the option's two-frame pulse animation. */
export const OPTION_ANIM_TICKS = 8;

/** How options are positioned (only `'trail'` exists before M2-04). */
export type OptionFormation = 'trail' | 'snake' | 'formation' | 'rotate';

/**
 * One ship's options: the trail ring buffer and the positions of the options flying this tick.
 * A class so its numeric fields stay unboxed.
 */
export class OptionGroup {
  /** Options flying this tick (0 while the ship is not in play — set by {@link follow}). */
  count = 0;
  /** Positioning mode (`'trail'` until M2-04). */
  formation: OptionFormation = 'trail';
  /** Options stolen by an Option Hunter, waiting to be re-collected (M2-04; always 0 now). */
  stolen = 0;
  /** Index of the newest trail entry (the ship's latest recorded position). */
  head = 0;
  /** Screen-space x of each trail entry (ship x − camera x). */
  readonly trailX = new Float64Array(OPTION_TRAIL_CAPACITY);
  /** Screen-space y of each trail entry. */
  readonly trailY = new Float64Array(OPTION_TRAIL_CAPACITY);
  /** World x of option `k` (`k < count`). */
  readonly x = new Float64Array(MAX_OPTIONS);
  /** World y of option `k`. */
  readonly y = new Float64Array(MAX_OPTIONS);

  /**
   * Starts a fresh trail at the ship (stage start, respawn): every entry — and so every option —
   * is the ship's screen position.
   *
   * @param ship - The ship.
   * @param camera - The camera (its `x` / `y` convert world to screen space).
   */
  reset(ship: PlayerShip, camera: PlayerCamera): void {
    const sx = ship.x - camera.x;
    const sy = ship.y - camera.y;
    this.trailX.fill(sx);
    this.trailY.fill(sy);
    this.head = 0;
    for (let k = 0; k < MAX_OPTIONS; k++) {
      this.x[k] = ship.x;
      this.y[k] = ship.y;
    }
  }

  /**
   * One tick: records the ship's screen position when asked, then places `count` options along
   * the trail in world space. Never allocates.
   *
   * @remarks
   * Option `k` is at the entry `(k + 1) · OPTION_SPACING` records before the newest one, plus the
   * camera position. `count` is clamped to `[0, MAX_OPTIONS]` (fractions dropped).
   *
   * @param ship - The ship (its world position).
   * @param camera - The camera.
   * @param count - Options owned.
   * @param record - Whether the trail advances this tick (the ship had movement input or is
   *   flying in).
   */
  follow(ship: PlayerShip, camera: PlayerCamera, count: number, record: boolean): void {
    const cap = OPTION_TRAIL_CAPACITY;
    if (record) {
      const head = this.head + 1 < cap ? this.head + 1 : 0;
      this.trailX[head] = ship.x - camera.x;
      this.trailY[head] = ship.y - camera.y;
      this.head = head;
    }
    const n = count >= MAX_OPTIONS ? MAX_OPTIONS : count >= 1 ? Math.floor(count) : 0;
    const camX = camera.x;
    const camY = camera.y;
    for (let k = 0; k < n; k++) {
      let index = this.head - (k + 1) * OPTION_SPACING;
      if (index < 0) index += cap;
      this.x[k] = camX + this.trailX[index];
      this.y[k] = camY + this.trailY[index];
    }
    this.count = n;
  }

  /** Hides every option (the ship is not in play); the trail is kept. */
  hide(): void {
    this.count = 0;
  }
}

/**
 * Creates an empty option group (load time; the World makes one per player).
 *
 * @returns A group with no options and a zeroed trail — call {@link OptionGroup.reset} when the
 *   ship spawns.
 *
 * @example
 * ```ts
 * const group = createOptionGroup();
 * group.reset(ship, camera);
 * // every tick, after the ship moved:
 * group.follow(ship, camera, 2, ship.moving);
 * group.x[0]; // → world x of the first option
 * ```
 */
export function createOptionGroup(): OptionGroup {
  return new OptionGroup();
}
