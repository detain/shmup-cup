/**
 * # blackhole — the black-hole bomb, the Direct ship's signature special
 *
 * **Responsibility.** The signature mechanic of plan M3-02 (shmup_feat.md §7C "[P2] modern series
 * mechanics to consider (pick at most one signature): black-hole bomb — vortex pulls
 * bullets/enemies, then lightning"): while {@link GameConfig.blackHole} is on, the Direct-mode
 * stage's **yellow item stocks a black hole** ({@link PlayerShip.bombs}, at most
 * {@link MAX_BLACK_HOLE_STOCK}) instead of detonating a smart bomb at once, and a `Special` press
 * throws one ahead of the ship.
 *
 * A thrown vortex lives {@link BLACK_HOLE_PULL_TICKS} + {@link BLACK_HOLE_BURST_TICKS} ticks:
 *
 * 1. **Pull.** It drifts forward at {@link BLACK_HOLE_DRIFT} px/tick and draws everything inside
 *    {@link BLACK_HOLE_RADIUS} towards its centre — enemy bullets at up to {@link BLACK_HOLE_PULL}
 *    px/tick and enemies at up to {@link BLACK_HOLE_ENEMY_PULL}, both falling off linearly with
 *    the distance. A bullet that reaches the {@link BLACK_HOLE_CORE_RADIUS} core is **swallowed**:
 *    it becomes a point item for the thrower, exactly like a cancelled bullet
 *    (`core/bullets` `CancelMode.Points`).
 * 2. **Burst.** Every {@link BLACK_HOLE_BOLT_INTERVAL} ticks a lightning bolt goes off: every
 *    enemy in the radius that is not `megaCrashImmune` is destroyed (credited to the thrower) and
 *    every boss part in the radius takes {@link BLACK_HOLE_BOLT_DAMAGE}.
 *
 * **Death bomb (M3-02).** A fatal hit on a ship with a bomb left opens the death-bomb window
 * (`GameConfig.deathBomb` — {@link PlayerShip.bombTicks}) instead of killing it; the World's
 * players phase (`core/world` `bombSystem`) spends a bomb and cancels the death when the player
 * presses in time — {@link BlackHoleSystem.fire} for the Direct ship, the meter's `!` slot for the
 * other.
 *
 * **Tick order.** Phase 2 the World's `bombSystem` ({@link BlackHoleSystem.fire}),
 * phase 5 {@link BlackHoleSystem.update} (drift, pull, swallow), phase 7
 * {@link BlackHoleSystem.resolve} (the bolts), phase 9 {@link BlackHoleSystem.sync} (the sprite
 * batch). A checkpoint restart calls {@link BlackHoleSystem.clear}.
 *
 * **Zero allocation.** Every vortex slot exists from creation; a tick only writes numbers.
 *
 * **Implements.**
 * - shmup_feat.md §7C — the black-hole bomb as the one signature mechanic
 * - shmup_feat.md §10 — the death-bomb window ("only if we include bombs": these are the bombs)
 * - shmup_feat.md §22 — no per-tick allocation, pooled state
 *
 * **Public API.** {@link BlackHoleSystem}, {@link createBlackHoleSystem}, {@link BlackHole},
 * {@link BlackHoleHost}, {@link MAX_BLACK_HOLES}, {@link MAX_BLACK_HOLE_STOCK},
 * {@link BLACK_HOLE_START_STOCK}, {@link BLACK_HOLE_PULL_TICKS}, {@link BLACK_HOLE_BURST_TICKS},
 * {@link BLACK_HOLE_RADIUS}, {@link BLACK_HOLE_CORE_RADIUS}, {@link BLACK_HOLE_PULL},
 * {@link BLACK_HOLE_ENEMY_PULL}, {@link BLACK_HOLE_FALLOFF}, {@link BLACK_HOLE_DRIFT},
 * {@link BLACK_HOLE_THROW_X},
 * {@link BLACK_HOLE_BOLT_INTERVAL}, {@link BLACK_HOLE_BOLT_DAMAGE},
 * {@link BLACK_HOLE_SPRITE}, {@link BLACK_HOLE_SPRITES},
 * {@link BLACK_HOLE_FRAMES}, {@link BLACK_HOLE_FRAME_TICKS}.
 *
 * @module
 */
import type { GameConfig } from '../config/index.js';
import { VORTEX_FALLOFF, type BulletSystem } from '../bullets/index.js';
import type { BossSystem } from '../bosses/index.js';
import type { EnemySystem } from '../enemies/index.js';
import { FX_CUES, SFX_CUES, SfxPriority, SimEventKind, type EventQueue } from '../events/index.js';
import { defineModule } from '../module-info.js';
import type { PlayerShip } from '../player/index.js';
import {
  LayerId,
  createSpriteBatch,
  pushSprite,
  type CameraView,
  type SpriteBatch,
} from '../presentation/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'blackhole',
  status: 'implemented',
  specRefs: ['shmup_feat.md §7', 'shmup_feat.md §10', 'shmup_feat.md §22'],
});

/** Vortices that may be open at once (one per player, so co-op never queues). */
export const MAX_BLACK_HOLES = 2;

/** Bombs a ship may hold ({@link PlayerShip.bombs}). */
export const MAX_BLACK_HOLE_STOCK = 3;

/** Bombs a ship starts (and respawns) with while the black hole is on. */
export const BLACK_HOLE_START_STOCK = 1;

/** Ticks a vortex pulls before it discharges. */
export const BLACK_HOLE_PULL_TICKS = 96;

/** Ticks the lightning burst lasts after the pull. */
export const BLACK_HOLE_BURST_TICKS = 36;

/** Reach of the vortex in pixels. */
export const BLACK_HOLE_RADIUS = 88;

/** Bullets inside this radius of the centre are swallowed. */
export const BLACK_HOLE_CORE_RADIUS = 10;

/** Strongest pull on an enemy bullet, in pixels per tick (at the centre). */
export const BLACK_HOLE_PULL = 2;

/**
 * How much of the pull the falloff takes away at the rim (`core/bullets` `VORTEX_FALLOFF`): the
 * pull at distance `d` is `strength · (1 − BLACK_HOLE_FALLOFF · d / radius)`, so the rim still
 * draws things in (a quarter of the strength) while the centre pulls hardest.
 */
export const BLACK_HOLE_FALLOFF = VORTEX_FALLOFF;

/** Strongest pull on an enemy, in pixels per tick. */
export const BLACK_HOLE_ENEMY_PULL = 1;

/** Pixels per tick the vortex drifts to the right (it is thrown forward). */
export const BLACK_HOLE_DRIFT = 0.25;

/** Pixels ahead of the ship a vortex opens. */
export const BLACK_HOLE_THROW_X = 48;

/** Ticks between two lightning bolts of the burst. */
export const BLACK_HOLE_BOLT_INTERVAL = 6;

/** Damage one bolt does to every boss part in reach. */
export const BLACK_HOLE_BOLT_DAMAGE = 10;

/** Atlas sprite of the vortex. */
export const BLACK_HOLE_SPRITE = 'fx/black-hole';

/** Engine sprites this module needs (hosts load content with them — `core/world` `ENGINE_SPRITES`). */
export const BLACK_HOLE_SPRITES: readonly string[] = Object.freeze([BLACK_HOLE_SPRITE]);

/** Animation frames of {@link BLACK_HOLE_SPRITE} (the swirl, then the discharge). */
export const BLACK_HOLE_FRAMES = 4;

/** Ticks one animation frame is shown. */
export const BLACK_HOLE_FRAME_TICKS = 5;

/** One vortex slot (a class: monomorphic number fields, never reallocated). */
export class BlackHole {
  /** Whether the slot is in use. */
  active = false;
  /** World x of the centre. */
  x = 0;
  /** World y of the centre. */
  y = 0;
  /** Ticks since it opened. */
  age = 0;
  /** Player slot that threw it (-1 = nobody — debug tools). */
  owner = -1;
  /** Ticks until the next lightning bolt (burst phase only). */
  bolt = 0;
}

/** What a {@link BlackHoleSystem} reads (the World satisfies it). */
export interface BlackHoleHost {
  /** The session's config (`blackHole`, `deathBomb`). */
  readonly config: GameConfig;
  /** The ships. */
  readonly players: readonly PlayerShip[];
  /** The camera (the vortex rides it). */
  readonly camera: CameraView & { readonly dx: number; readonly dy: number };
  /** Presentation events. */
  readonly events: EventQueue;
  /** Enemy bullets (pulled and swallowed). */
  readonly bullets: BulletSystem;
  /** The enemies (pulled, then destroyed by the bolts). */
  readonly enemies: EnemySystem;
  /** The bosses (their parts take the bolts). */
  readonly bosses: BossSystem;
  /** Ticks simulated so far. */
  readonly tick: number;
}

/** The black holes of one World (see the module docs). */
export interface BlackHoleSystem {
  /** Every vortex slot ({@link MAX_BLACK_HOLES}). */
  readonly holes: readonly BlackHole[];
  /** The vortices' sprite batch (`LayerId.Fx`, under the enemy bullets). */
  readonly batch: SpriteBatch;
  /** Open vortices. */
  readonly count: number;
  /** Whether the feature is on at all (`GameConfig.blackHole` and a Direct-mode session). */
  readonly enabled: boolean;
  /**
   * Stocks one bomb for a player (the yellow item, a fresh ship).
   *
   * @param player - Player slot.
   * @returns `true` when the stock grew (it was below {@link MAX_BLACK_HOLE_STOCK}).
   */
  addStock(player: number): boolean;
  /**
   * Throws a vortex ahead of a player's ship, spending one bomb.
   *
   * @remarks
   * Refused (→ `false`) without a bomb, for an inactive / `dying` / `dead` ship, for a bad slot
   * and when every vortex slot is open.
   *
   * @param player - Player slot.
   * @returns Whether one opened.
   */
  fire(player: number): boolean;
  /**
   * Phase 5, after the bullets moved: every vortex rides the camera, drifts, pulls the bullets and
   * enemies in reach and swallows the bullets that reach its core. Never allocates.
   */
  update(): void;
  /**
   * Phase 7, after the shots' hits: the burst's lightning bolts (enemies destroyed, boss parts
   * damaged), then the vortices whose life is over close. Never allocates.
   */
  resolve(): void;
  /** Phase 9: refills {@link BlackHoleSystem.batch}. Never allocates. */
  sync(): void;
  /** Session clear (a checkpoint restart): every vortex closes. */
  clear(): void;
}

/**
 * The black-hole system of a World (load time).
 *
 * @param host - The World (read at every call — pass the World itself).
 * @param spriteId - Atlas index of {@link BLACK_HOLE_SPRITE} (-1 = not drawn).
 * @returns The system.
 *
 * @example
 * ```ts
 * const holes = createBlackHoleSystem(world, world.content.spriteIndex.get(BLACK_HOLE_SPRITE) ?? -1);
 * holes.addStock(0);
 * holes.fire(0); // → true: a vortex opens 48 px ahead of player 1
 * ```
 */
export function createBlackHoleSystem(host: BlackHoleHost, spriteId = -1): BlackHoleSystem {
  return new BlackHoleSystemImpl(host, spriteId);
}

/** See {@link createBlackHoleSystem}. */
class BlackHoleSystemImpl implements BlackHoleSystem {
  /** See {@link BlackHoleSystem.holes}. */
  readonly holes: readonly BlackHole[];
  /** See {@link BlackHoleSystem.batch}. */
  readonly batch: SpriteBatch;
  /** The World. */
  private readonly host: BlackHoleHost;
  /** Atlas index of the vortex sprite (-1 = not drawn). */
  private readonly spriteId: number;

  /**
   * Builds the slots.
   *
   * @param host - The World.
   * @param spriteId - Atlas index of the vortex sprite.
   */
  constructor(host: BlackHoleHost, spriteId: number) {
    this.host = host;
    this.spriteId = spriteId;
    const slots: BlackHole[] = [];
    for (let i = 0; i < MAX_BLACK_HOLES; i++) slots.push(new BlackHole());
    this.holes = slots;
    this.batch = createSpriteBatch(LayerId.Fx, MAX_BLACK_HOLES);
  }

  /** See {@link BlackHoleSystem.count}. */
  get count(): number {
    let n = 0;
    for (let i = 0; i < this.holes.length; i++) if (this.holes[i].active) n++;
    return n;
  }

  /** See {@link BlackHoleSystem.enabled}. */
  get enabled(): boolean {
    const config = this.host.config;
    return config.blackHole && config.powerUpMode === 'direct';
  }

  /** See {@link BlackHoleSystem.addStock}. */
  addStock(player: number): boolean {
    const ship = this.shipOf(player);
    if (ship === null || ship.bombs >= MAX_BLACK_HOLE_STOCK) return false;
    ship.bombs++;
    return true;
  }

  /** See {@link BlackHoleSystem.fire}. */
  fire(player: number): boolean {
    const ship = this.shipOf(player);
    if (ship === null || ship.bombs <= 0) return false;
    if (ship.state === 'dying' || ship.state === 'dead') return false;
    const hole = this.freeSlot();
    if (hole === null) return false;
    ship.bombs--;
    hole.active = true;
    hole.x = ship.x + BLACK_HOLE_THROW_X;
    hole.y = ship.y;
    hole.age = 0;
    hole.owner = player;
    hole.bolt = 0;
    const events = this.host.events;
    const x = Math.floor(hole.x) | 0;
    const y = Math.floor(hole.y) | 0;
    events.push(SimEventKind.Sfx, SFX_CUES.MegaCrash, x, y, SfxPriority.High);
    events.push(SimEventKind.Particles, FX_CUES.BlackHole, x, y, 1);
    return true;
  }

  /** See {@link BlackHoleSystem.update}. */
  update(): void {
    const host = this.host;
    const camera = host.camera;
    const dx = camera.dx;
    const dy = camera.dy;
    const holes = this.holes;
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      if (!hole.active) continue;
      hole.x += dx + BLACK_HOLE_DRIFT;
      hole.y += dy;
      hole.age++;
      // Whole pixels: a fractional argument of the (not inlined) six-argument `vortex` call would
      // be boxed — a heap number every tick a vortex is open (see the allocation guard). The
      // centre of a 48-px pull is the same place either way, and both calls see one centre.
      const cx = Math.floor(hole.x) | 0;
      const cy = Math.floor(hole.y) | 0;
      host.bullets.vortex(
        cx,
        cy,
        BLACK_HOLE_RADIUS,
        BLACK_HOLE_CORE_RADIUS,
        BLACK_HOLE_PULL,
        hole.owner,
      );
      host.enemies.pullTowards(cx, cy, BLACK_HOLE_RADIUS, BLACK_HOLE_ENEMY_PULL);
    }
  }

  /** See {@link BlackHoleSystem.resolve}. */
  resolve(): void {
    const holes = this.holes;
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      if (!hole.active) continue;
      if (hole.age <= BLACK_HOLE_PULL_TICKS) continue;
      if (hole.bolt > 0) {
        hole.bolt--;
      } else {
        hole.bolt = BLACK_HOLE_BOLT_INTERVAL - 1;
        this.strike(hole);
      }
      if (hole.age >= BLACK_HOLE_PULL_TICKS + BLACK_HOLE_BURST_TICKS) {
        hole.active = false;
        hole.owner = -1;
      }
    }
  }

  /** See {@link BlackHoleSystem.sync}. */
  sync(): void {
    const batch = this.batch;
    batch.count = 0;
    if (this.spriteId < 0) return;
    const holes = this.holes;
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      if (!hole.active) continue;
      const frame =
        hole.age > BLACK_HOLE_PULL_TICKS
          ? BLACK_HOLE_FRAMES - 1
          : ((hole.age / BLACK_HOLE_FRAME_TICKS) | 0) % (BLACK_HOLE_FRAMES - 1);
      pushSprite(batch, hole.x, hole.y, this.spriteId, frame, 0);
    }
  }

  /** See {@link BlackHoleSystem.clear}. */
  clear(): void {
    const holes = this.holes;
    for (let i = 0; i < holes.length; i++) {
      holes[i].active = false;
      holes[i].owner = -1;
      holes[i].age = 0;
      holes[i].bolt = 0;
    }
    this.batch.count = 0;
  }

  /**
   * One lightning bolt of the burst: the enemies in reach are destroyed, the boss parts in reach
   * take {@link BLACK_HOLE_BOLT_DAMAGE}.
   *
   * @param hole - The vortex (in its burst phase).
   */
  private strike(hole: BlackHole): void {
    const host = this.host;
    const x = Math.floor(hole.x) | 0;
    const y = Math.floor(hole.y) | 0;
    host.enemies.blast(x, y, BLACK_HOLE_RADIUS, hole.owner);
    const parts = host.bosses.parts;
    const r2 = BLACK_HOLE_RADIUS * BLACK_HOLE_RADIUS;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part.active || part.destroyed || !part.target) continue;
      const dx = part.x - hole.x;
      const dy = part.y - hole.y;
      if (!(dx * dx + dy * dy <= r2)) continue;
      host.bosses.damagePart(part.global, BLACK_HOLE_BOLT_DAMAGE, hole.owner);
    }
    host.events.push(SimEventKind.Particles, FX_CUES.BlackHole, x, y, 1);
  }

  /**
   * The ship of a player slot.
   *
   * @param player - Player slot.
   * @returns The ship, or `null` for a bad or inactive slot.
   */
  private shipOf(player: number): PlayerShip | null {
    const players = this.host.players;
    if (!(player >= 0 && player < players.length && player % 1 === 0)) return null;
    const ship = players[player];
    return ship.active ? ship : null;
  }

  /**
   * A free vortex slot.
   *
   * @returns The slot, or `null` when every one is open.
   */
  private freeSlot(): BlackHole | null {
    const holes = this.holes;
    for (let i = 0; i < holes.length; i++) if (!holes[i].active) return holes[i];
    return null;
  }
}
