/**
 * # options — options ("multiples")
 *
 * **Status: implemented** for meter mode: the standard **trail** Option (plan M1-10) and, since
 * M2-04, the **Snake**, **Formation** and **Rotate** types (`GameConfig.optionChoice`). The Option
 * Hunter that steals options is an enemy (`core/enemies`, `core/behaviors`); option recovery after
 * death arrives with M3.
 *
 * **Responsibility.** Up to {@link MAX_OPTIONS} invulnerable drones per ship that pass through
 * terrain and copy every weapon (the firing itself is `core/weapons`). Each ship has one
 * {@link OptionGroup}: its type ({@link OptionGroup.formation}), a ring buffer of past ship
 * positions ({@link OPTION_TRAIL_CAPACITY} entries), the per-type state and the options' current
 * world positions.
 *
 * **The types** (shmup_feat.md §8):
 *
 * - **`trail`** (decision D26). The buffer holds **screen-space** positions (`ship − camera`) and
 *   advances only on ticks the ship has movement input (`PlayerShip.moving`) — and on every tick
 *   of a fly-in, where the ship moves on its own. Option `k` (0-based) sits at the entry
 *   `(k + 1) · OPTION_SPACING` records back, converted back to world space with the current
 *   camera. So while the ship is idle the options hold their place **on screen** (they ride along
 *   with the scroll — "bunched"); when the ship moves they spread out along its path; pushing
 *   against the edge of the view keeps recording the same position, so they converge on the ship.
 * - **`snake`** — a chain in screen space: option `k` hangs {@link SNAKE_LINK} px behind its
 *   leader (the ship, then option `k − 1`) and is only **pulled** when the leader moves away from
 *   it, so the chain swings out opposite to where the ship moves and **keeps its shape** when the
 *   ship stops (or pushes against the edge) — formations can be held.
 * - **`formation`** — fixed offsets from the ship: a tight `>` behind it
 *   ({@link FORMATION_RETRACTED}) that **spreads** into a wide `V` ({@link FORMATION_SPREAD}).
 * - **`rotate`** — the options orbit the ship, evenly spaced, {@link ROTATE_SPEED} binary units
 *   per tick, at {@link ROTATE_RADIUS} px — {@link ROTATE_RADIUS_EXTENDED} px when **extended**.
 *
 * **Spread / extend** ({@link OptionGroup.steer}, formation and rotate; plan M2-04, shmup_feat.md
 * §4 "hold Power-Up on the Option slot"): the options are extended while the player holds
 * `PowerUp` for at least {@link OPTION_HOLD_TICKS} ticks (gamepad / keyboard — a quick equip tap
 * never moves them), or after `Special` (remote Ch+, keyboard V, gamepad Y — a press, never a
 * hold) toggled them out; another `Special` press toggles them back in. The change takes
 * {@link OPTION_SPREAD_TICKS} ticks ({@link OptionGroup.spreadTicks}, a whole number of steps).
 *
 * A fresh group (stage start, respawn — {@link OptionGroup.reset}) has every option on the ship
 * (trail and snake), retracted, the orbit at angle 0.
 *
 * **Zero allocation.** A group owns its typed arrays; {@link OptionGroup.follow} takes the ship
 * and the camera as objects and reads their fields itself, so no fractional number crosses a call
 * boundary (V8 boxes those when it does not inline the call).
 *
 * **Implements.**
 * - shmup_feat.md §8 Options / multiples — standard Option: up to 4, follows the flown path (ring
 *   buffer that advances only on movement), invulnerable, passes through walls; the Snake,
 *   Formation (hold Power-Up / Ch+ to spread and retract) and Rotate (orbit, hold to extend)
 *   Options
 *
 * **Public API.** {@link OptionGroup}, {@link createOptionGroup}, {@link OptionFormation},
 * {@link OptionMode}, {@link OPTION_MODE_NAMES}, {@link MAX_OPTIONS}, {@link OPTION_SPACING},
 * {@link OPTION_TRAIL_CAPACITY}, {@link OPTION_SPRITE}, {@link OPTION_ANIM_TICKS},
 * {@link OPTION_RADIUS}, {@link SNAKE_LINK}, {@link FORMATION_RETRACTED}, {@link FORMATION_SPREAD},
 * {@link ROTATE_RADIUS}, {@link ROTATE_RADIUS_EXTENDED}, {@link ROTATE_SPEED},
 * {@link OPTION_HOLD_TICKS}, {@link OPTION_SPREAD_TICKS}, {@link STOLEN_OPTION_SPRITE}.
 *
 * **Planned API.** Option recovery after death (M3).
 *
 * @module
 */
import type { OptionChoice } from '../config/index.js';
import { Action } from '../input/index.js';
import { ANGLE_MASK, ANGLE_QUARTER, ANGLE_UNITS } from '../math/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../math/trig-table.js';
import { defineModule } from '../module-info.js';
import type { PlayerCamera, PlayerIntent, PlayerShip } from '../player/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'options',
  status: 'implemented',
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

/**
 * The grey sprite of a stolen option (carried by an Option Hunter, or drifting free after its
 * death — an engine sprite, M2-04).
 */
export const STOLEN_OPTION_SPRITE = 'options/stolen';

/** Ticks per frame of the option's two-frame pulse animation. */
export const OPTION_ANIM_TICKS = 8;

/** Radius of an option's body (the Option Hunter grabs an option it touches), in pixels. */
export const OPTION_RADIUS = 4;

/** Length of each link of the Snake chain, in pixels. */
export const SNAKE_LINK = 16;

/**
 * Offsets of the Formation's options from the ship when retracted — a tight `>` behind it — as
 * `[x0, y0, x1, y1, …]` for options 1–4.
 */
export const FORMATION_RETRACTED: readonly number[] = Object.freeze([
  -14, -8, -14, 8, -26, -14, -26, 14,
]);

/** Offsets of the Formation's options when spread — a wide `V` — as `[x0, y0, x1, y1, …]`. */
export const FORMATION_SPREAD: readonly number[] = Object.freeze([
  -6, -24, -6, 24, -16, -44, -16, 44,
]);

/** Radius of the Rotate Options' orbit, in pixels. */
export const ROTATE_RADIUS = 20;

/** Radius of the Rotate Options' orbit when extended, in pixels. */
export const ROTATE_RADIUS_EXTENDED = 40;

/** Binary units the Rotate Options turn per tick (one turn in ≈ 1.4 s). */
export const ROTATE_SPEED = 12;

/** Ticks `PowerUp` must be held before the options extend (a quick equip tap never moves them). */
export const OPTION_HOLD_TICKS = 15;

/** Ticks the options take to spread out or pull back in. */
export const OPTION_SPREAD_TICKS = 12;

/** How options are positioned (`config` `OptionChoice`). */
export type OptionFormation = OptionChoice;

/** The option types as codes (`config` `OPTION_CHOICES` order; hashed — append, never renumber). */
export const OptionMode = {
  /** Follow the flown path. */
  Trail: 0,
  /** A chain pulled along behind the ship. */
  Snake: 1,
  /** Fixed `>` / `V` offsets. */
  Formation: 2,
  /** Orbiting the ship. */
  Rotate: 3,
} as const;

/** An {@link OptionMode} code. */
export type OptionMode = (typeof OptionMode)[keyof typeof OptionMode];

/** Names of the {@link OptionMode} codes, by code (the `config` `OptionChoice` names). */
export const OPTION_MODE_NAMES: readonly OptionFormation[] = Object.freeze([
  'trail',
  'snake',
  'formation',
  'rotate',
] as OptionFormation[]);

/**
 * One ship's options: the type, the trail ring buffer, the per-type state and the positions of
 * the options flying this tick. A class so its numeric fields stay unboxed.
 */
export class OptionGroup {
  /** Options flying this tick (0 while the ship is not in play — set by {@link follow}). */
  count = 0;
  /** Positioning type (`GameConfig.optionChoice`; set with {@link OptionGroup.setFormation}). */
  formation: OptionFormation = 'trail';
  /** {@link OptionMode} code of {@link OptionGroup.formation}. */
  mode: OptionMode = OptionMode.Trail;
  /** Options Option Hunters have stolen from this ship so far (M2-04; statistics, tests). */
  stolen = 0;
  /** Index of the newest trail entry (the ship's latest recorded position). */
  head = 0;
  /** Spread / extend progress: 0 retracted … {@link OPTION_SPREAD_TICKS} spread. */
  spreadTicks = 0;
  /** Whether a `Special` press toggled the options out (formation / rotate). */
  toggled = false;
  /** Ticks `PowerUp` has been held without a break (0 when released). */
  holdTicks = 0;
  /** The Rotate Options' orbit angle (binary units). */
  angle = 0;
  /** Screen-space x of each trail entry (ship x − camera x). */
  readonly trailX = new Float64Array(OPTION_TRAIL_CAPACITY);
  /** Screen-space y of each trail entry. */
  readonly trailY = new Float64Array(OPTION_TRAIL_CAPACITY);
  /** Screen-space x of each Snake link. */
  readonly snakeX = new Float64Array(MAX_OPTIONS);
  /** Screen-space y of each Snake link. */
  readonly snakeY = new Float64Array(MAX_OPTIONS);
  /** World x of option `k` (`k < count`). */
  readonly x = new Float64Array(MAX_OPTIONS);
  /** World y of option `k`. */
  readonly y = new Float64Array(MAX_OPTIONS);

  /**
   * Sets the positioning type (world creation from `GameConfig.optionChoice`; the weapon select's
   * preview). A cold path: the per-type state is kept (the next {@link OptionGroup.reset} starts it
   * afresh).
   *
   * @param formation - The type (an unknown name counts as `'trail'`).
   */
  setFormation(formation: OptionFormation): void {
    const mode = OPTION_MODE_NAMES.indexOf(formation);
    this.mode = (mode >= 0 ? mode : OptionMode.Trail) as OptionMode;
    this.formation = OPTION_MODE_NAMES[this.mode];
  }

  /**
   * Starts a fresh group at the ship (stage start, respawn): every trail entry and Snake link — and
   * so every option — is the ship's screen position; retracted, the toggle and hold cleared, the
   * orbit at angle 0.
   *
   * @remarks
   * `head` goes back to 0 and all {@link MAX_OPTIONS} positions become the ship's; `count` is left
   * alone (the next {@link OptionGroup.follow} sets it). Never allocates.
   *
   * @param ship - The ship.
   * @param camera - The camera (its `x` / `y` convert world to screen space).
   */
  reset(ship: PlayerShip, camera: PlayerCamera): void {
    const sx = ship.x - camera.x;
    const sy = ship.y - camera.y;
    this.trailX.fill(sx);
    this.trailY.fill(sy);
    this.snakeX.fill(sx);
    this.snakeY.fill(sy);
    this.head = 0;
    this.spreadTicks = 0;
    this.toggled = false;
    this.holdTicks = 0;
    this.angle = 0;
    for (let k = 0; k < MAX_OPTIONS; k++) {
      this.x[k] = ship.x;
      this.y[k] = ship.y;
    }
  }

  /**
   * The spread / extend control of one tick (see the module docs): `Special` pressed toggles,
   * `PowerUp` held {@link OPTION_HOLD_TICKS} ticks extends, and the progress moves one step towards
   * the wanted state. Tick phase 2, for a ship in play, before {@link OptionGroup.follow}. Never
   * allocates.
   *
   * @remarks
   * Every type keeps the state (it is hashed); only `formation` and `rotate` place their options
   * by it.
   *
   * @param intent - The player's intents this tick (`held`, `pressed`).
   */
  steer(intent: Readonly<PlayerIntent>): void {
    if ((intent.pressed & Action.Special) !== 0) this.toggled = !this.toggled;
    if ((intent.held & Action.PowerUp) !== 0) {
      if (this.holdTicks < OPTION_HOLD_TICKS) this.holdTicks++;
    } else {
      this.holdTicks = 0;
    }
    const out = this.toggled || this.holdTicks >= OPTION_HOLD_TICKS;
    if (out) {
      if (this.spreadTicks < OPTION_SPREAD_TICKS) this.spreadTicks++;
    } else if (this.spreadTicks > 0) {
      this.spreadTicks--;
    }
  }

  /**
   * One tick: records the ship's screen position when asked, then places `count` options in world
   * space by the group's type (see the module docs). Never allocates.
   *
   * @remarks
   * `count` is clamped to `[0, MAX_OPTIONS]` (fractions dropped). The trail records whatever the
   * type (so a type change never finds a stale trail); the Rotate orbit turns
   * {@link ROTATE_SPEED} units per call.
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
    if (this.mode === OptionMode.Trail) {
      const camX = camera.x;
      const camY = camera.y;
      for (let k = 0; k < n; k++) {
        let index = this.head - (k + 1) * OPTION_SPACING;
        if (index < 0) index += cap;
        this.x[k] = camX + this.trailX[index];
        this.y[k] = camY + this.trailY[index];
      }
    } else {
      this.place(ship, camera, n);
    }
    this.count = n;
  }

  /**
   * Places `n` options of the Snake, Formation or Rotate type (see the module docs) — kept out of
   * {@link OptionGroup.follow} so that one stays small enough for V8 to inline (a call it does not
   * inline boxes fractional arguments).
   *
   * @param ship - The ship.
   * @param camera - The camera.
   * @param n - Options flying (whole, 0–{@link MAX_OPTIONS}).
   */
  private place(ship: PlayerShip, camera: PlayerCamera, n: number): void {
    const mode = this.mode;
    if (mode === OptionMode.Snake) {
      this.pullSnake(ship, camera);
      const camX = camera.x;
      const camY = camera.y;
      for (let k = 0; k < n; k++) {
        this.x[k] = camX + this.snakeX[k];
        this.y[k] = camY + this.snakeY[k];
      }
      return;
    }
    const t = this.spreadTicks / OPTION_SPREAD_TICKS;
    const sx = ship.x;
    const sy = ship.y;
    if (mode === OptionMode.Formation) {
      for (let k = 0; k < n; k++) {
        const i = k * 2;
        const r0 = FORMATION_RETRACTED[i];
        const r1 = FORMATION_RETRACTED[i + 1];
        this.x[k] = sx + r0 + (FORMATION_SPREAD[i] - r0) * t;
        this.y[k] = sy + r1 + (FORMATION_SPREAD[i + 1] - r1) * t;
      }
      return;
    }
    this.angle = (this.angle + ROTATE_SPEED) & ANGLE_MASK;
    const r = (ROTATE_RADIUS + (ROTATE_RADIUS_EXTENDED - ROTATE_RADIUS) * t) / TRIG_SCALE;
    const step = n > 0 ? ANGLE_UNITS / n : 0;
    for (let k = 0; k < n; k++) {
      const a = (this.angle + k * step) & ANGLE_MASK;
      this.x[k] = sx + SIN_TABLE_Q16[(a + ANGLE_QUARTER) & ANGLE_MASK] * r;
      this.y[k] = sy + SIN_TABLE_Q16[a] * r;
    }
  }

  /**
   * Pulls the Snake chain after the ship: each link that is more than {@link SNAKE_LINK} px from
   * its leader moves straight towards it until it is exactly that far (screen space). All
   * {@link MAX_OPTIONS} links move, owned or not, so a new option joins at the chain's end.
   *
   * @param ship - The ship.
   * @param camera - The camera.
   */
  private pullSnake(ship: PlayerShip, camera: PlayerCamera): void {
    let lx = ship.x - camera.x;
    let ly = ship.y - camera.y;
    const xs = this.snakeX;
    const ys = this.snakeY;
    for (let k = 0; k < MAX_OPTIONS; k++) {
      const dx = xs[k] - lx;
      const dy = ys[k] - ly;
      const d2 = dx * dx + dy * dy;
      // "Not within the link", so a NaN link snaps back onto its leader.
      if (!(d2 <= SNAKE_LINK * SNAKE_LINK)) {
        const d = Math.sqrt(d2);
        if (d > 0 && d === d) {
          xs[k] = lx + (dx / d) * SNAKE_LINK;
          ys[k] = ly + (dy / d) * SNAKE_LINK;
        } else {
          xs[k] = lx;
          ys[k] = ly;
        }
      }
      lx = xs[k];
      ly = ys[k];
    }
  }

  /** Hides every option (the ship is not in play): `count` 0; the trail and positions are kept. */
  hide(): void {
    this.count = 0;
  }
}

/**
 * Creates an empty option group (load time; the World makes one per player).
 *
 * @param formation - The positioning type (default `'trail'`; the World passes
 *   `GameConfig.optionChoice`).
 * @returns A group with no options and a zeroed trail — call {@link OptionGroup.reset} when the
 *   ship spawns.
 *
 * @example
 * ```ts
 * const group = createOptionGroup('rotate');
 * group.reset(ship, camera);
 * // every tick, after the ship moved:
 * group.steer(intent);
 * group.follow(ship, camera, 2, ship.moving);
 * group.x[0]; // → world x of the first option
 * ```
 */
export function createOptionGroup(formation: OptionFormation = 'trail'): OptionGroup {
  const group = new OptionGroup();
  group.setFormation(formation);
  return group;
}
