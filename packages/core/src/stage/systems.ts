/**
 * # stage/systems — the World's stage gimmicks: destructible terrain, moving blocks, pull fields,
 * chains (plan M2-07)
 *
 * **Responsibility.** The stage mechanics of shmup_feat.md §14 that live between the stage runner
 * and the other systems, owned by one {@link StageGimmicks} per World:
 *
 * - **Destructible terrain** — the World's `core/collision` {@link DestructibleTerrain}: player
 *   shots that meet a destructible tile damage its cell ({@link StageGimmicks.hitTerrain}, called
 *   by `core/weapons`): `SFX EnemyHit` while it stands, `SFX EnemyExplodeSmall` + `FX
 *   ExplosionSmall` and the tile's `score` for the shooter when it breaks. Regenerating tiles heal
 *   and grow back (never onto a ship's terrain box); a checkpoint restart restores the stage's
 *   own tiles ({@link StageGimmicks.clear}).
 * - **Moving blocks** ({@link MovingBlockSystem}) — the stage's `block` events (moving floors /
 *   ceilings): each block is a box of one tileset tile that drifts and swings, written every tick
 *   into the map's `TerrainBlocks` so every terrain query treats it as rock; drawn tile by tile on
 *   `LayerId.Terrain`; gone once {@link BLOCK_DESPAWN_MARGIN} px behind the view. After a restart
 *   the blocks whose events lie before the camera come back.
 * - **Pull fields** — `ScriptApi.pull` (the suction field, the grabbing tentacle): up to
 *   {@link MAX_PULL_FIELDS} fields, each owned by a live enemy, draw the living ships within their
 *   radius towards the owner in tick phase 2, after the ships moved (then the ships are clamped to
 *   the view again).
 * - **Chains** — `ScriptApi.chain` (the tentacle's arm): up to {@link MAX_CHAINS} rows of
 *   {@link CHAIN_SPRITE} links from a fixed world point to their owner, drawn on
 *   `LayerId.GroundEnemies` (under the enemies).
 * - **Region triggers** — the stage runner's `trigger` events: every tick the living ships are
 *   tested against the armed regions (`StageRunner.probe`).
 *
 * **Tick order** (the World calls): phase 2 {@link StageGimmicks.applyFields}; phase 3, after the
 * stage runner, {@link StageGimmicks.updateStage} (triggers, blocks, regrowth); phase 5 hits through
 * {@link StageGimmicks.hitTerrain}; phase 9 {@link StageGimmicks.sync}.
 *
 * **Zero allocation.** Fixed tables of typed arrays, whole-pixel event positions, points passed as
 * objects (the ships) rather than fractional arguments.
 *
 * **Public API.** Re-exported by `core/stage`: {@link StageGimmicks}, {@link StageGimmicksHost},
 * {@link createStageGimmicks}, {@link MovingBlockSystem}, {@link MAX_PULL_FIELDS},
 * {@link MAX_CHAINS}, {@link MAX_CHAIN_LINKS}, {@link CHAIN_SPRITE}, {@link GIMMICK_SPRITES},
 * {@link BLOCK_DESPAWN_MARGIN}, {@link BLOCK_BATCH_CAPACITY}.
 *
 * @module
 */
import {
  DestructibleTerrain,
  TerrainHit,
  type TerrainBlocks,
  type TerrainMap,
} from '../collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../config/index.js';
import {
  DEFAULT_BLOCK_PERIOD,
  DEFAULT_BLOCK_SCREEN_X,
  type ContentDb,
  type PlayerShipSpec,
  type StageSpec,
  type TilesetTables,
} from '../data/index.js';
import { EnemyState, type Enemy, type EnemyGimmicks } from '../enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type EventQueue } from '../events/index.js';
import { ANGLE_MASK, SIN_TABLE_Q16, TRIG_SCALE } from '../math/trig-table.js';
import type { PlayerCamera, PlayerShip } from '../player/index.js';
import { LayerId, createSpriteBatch, pushSprite, type SpriteBatch } from '../presentation/index.js';
import { addScore, type ScoreBoard } from '../scoring/index.js';

/** Most pull fields at once (plan M2-07). */
export const MAX_PULL_FIELDS = 8;

/** Most chains at once (plan M2-07). */
export const MAX_CHAINS = 8;

/** Most links one chain draws. */
export const MAX_CHAIN_LINKS = 16;

/** The chain link sprite (an engine sprite: the World lists it in `ENGINE_SPRITES`). */
export const CHAIN_SPRITE = 'gimmicks/chain-link';

/** Every sprite the stage gimmicks draw on their own. */
export const GIMMICK_SPRITES: readonly string[] = Object.freeze([CHAIN_SPRITE]);

/** A moving block this far (px) behind the view's left edge is gone. */
export const BLOCK_DESPAWN_MARGIN = 128;

/** Tiles the moving blocks' sprite batch draws at most (all blocks together). */
export const BLOCK_BATCH_CAPACITY = 256;

/** What the gimmicks read from their World (the World implements it). */
export interface StageGimmicksHost {
  /** The tick being run. */
  readonly tick: number;
  /** The camera. */
  readonly camera: PlayerCamera;
  /** The player ships. */
  readonly players: readonly PlayerShip[];
  /** The ship spec (margins for the clamp after a pull, terrain box for the keep-out). */
  readonly ship: PlayerShipSpec;
  /** Presentation events. */
  readonly events: EventQueue;
  /** The scores (tile points). */
  readonly scoring: {
    /** The board. */
    readonly board: ScoreBoard;
  };
}

/**
 * The moving blocks of one stage (see the module docs): its `block` events compiled at creation,
 * {@link MAX_TERRAIN_BLOCKS | the map's block slots} filled as they fire.
 */
export class MovingBlockSystem {
  /** The map's block geometry (what the terrain queries read). */
  readonly blocks: TerrainBlocks;
  /** The tiles of every live block (`LayerId.Terrain`). */
  readonly batch: SpriteBatch;
  /** Per event: 1 for a `block` event. */
  private readonly isBlock: Uint8Array;
  /** Per event: world x of the block's left edge when it appears. */
  private readonly baseX: Float64Array;
  /** Per event: world y of its top edge. */
  private readonly baseY: Float64Array;
  /** Per event: width in px. */
  private readonly width: Float64Array;
  /** Per event: height in px. */
  private readonly height: Float64Array;
  /** Per event: drift x. */
  private readonly vx: Float64Array;
  /** Per event: drift y. */
  private readonly vy: Float64Array;
  /** Per event: swing amplitude x. */
  private readonly dx: Float64Array;
  /** Per event: swing amplitude y. */
  private readonly dy: Float64Array;
  /** Per event: swing period in ticks. */
  private readonly period: Float64Array;
  /** Per event: swing phase (binary units). */
  private readonly phase: Float64Array;
  /** Per event: `TerrainType` of its tile. */
  private readonly type: Uint8Array;
  /** Per event: tileset frame of its tile (-1 = not drawn). */
  private readonly frame: Int16Array;
  /** Per event: its x (for the restart rescan). */
  private readonly eventX: Float64Array;
  /** Per slot: the event it came from (-1 = free). */
  readonly slotEvent: Int32Array;
  /** Per slot: ticks since it appeared. */
  readonly slotAge: Float64Array;
  /** Tileset sprite id (-1 = not drawn). */
  private readonly spriteId: number;
  /** Tile edge in pixels. */
  private readonly tileSize: number;

  /**
   * Compiles the stage's `block` events (load time).
   *
   * @param stage - The stage.
   * @param blocks - The map's block geometry.
   * @param tables - The stage tileset's tables.
   * @param spriteId - The tileset sprite.
   * @param tileSize - Tile edge.
   */
  constructor(
    stage: StageSpec,
    blocks: TerrainBlocks,
    tables: TilesetTables,
    spriteId: number,
    tileSize: number,
  ) {
    const events = stage.events;
    const n = events.length;
    this.blocks = blocks;
    this.spriteId = spriteId;
    this.tileSize = tileSize;
    this.batch = createSpriteBatch(LayerId.Terrain, BLOCK_BATCH_CAPACITY);
    this.isBlock = new Uint8Array(n);
    this.baseX = new Float64Array(n);
    this.baseY = new Float64Array(n);
    this.width = new Float64Array(n);
    this.height = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.dx = new Float64Array(n);
    this.dy = new Float64Array(n);
    this.period = new Float64Array(n);
    this.phase = new Float64Array(n);
    this.type = new Uint8Array(n);
    this.frame = new Int16Array(n);
    this.eventX = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const event = events[i];
      this.eventX[i] = event.x;
      if (event.type !== 'block' || !(event.tileId >= 1 && event.tileId < tables.count)) continue;
      this.isBlock[i] = 1;
      this.baseX[i] = event.x + (event.screenX ?? DEFAULT_BLOCK_SCREEN_X);
      this.baseY[i] = event.y;
      this.width[i] = event.w;
      this.height[i] = event.h;
      this.vx[i] = event.vx ?? 0;
      this.vy[i] = event.vy ?? 0;
      this.dx[i] = event.dx ?? 0;
      this.dy[i] = event.dy ?? 0;
      this.period[i] = event.period ?? DEFAULT_BLOCK_PERIOD;
      this.phase[i] = event.phase ?? 0;
      this.type[i] = tables.type[event.tileId];
      this.frame[i] = tables.frame[event.tileId];
    }
    this.slotEvent = new Int32Array(blocks.capacity).fill(-1);
    this.slotAge = new Float64Array(blocks.capacity);
  }

  /**
   * A `block` event fired: the block appears (in the lowest free slot; none free = dropped).
   *
   * @param eventIndex - The event's index in `stage.events`.
   * @returns The slot, or -1.
   */
  spawn(eventIndex: number): number {
    if (!(eventIndex >= 0 && eventIndex < this.isBlock.length) || this.isBlock[eventIndex] === 0) {
      return -1;
    }
    const slots = this.slotEvent;
    for (let slot = 0; slot < slots.length; slot++) {
      if (slots[slot] >= 0) continue;
      slots[slot] = eventIndex;
      this.slotAge[slot] = 0;
      this.place(slot);
      return slot;
    }
    return -1;
  }

  /**
   * Moves every block one tick (phase 3) and drops those left behind the view. Never allocates.
   *
   * @param camera - The camera.
   */
  update(camera: PlayerCamera): void {
    const slots = this.slotEvent;
    const left = Math.floor(camera.x) - BLOCK_DESPAWN_MARGIN;
    for (let slot = 0; slot < slots.length; slot++) {
      if (slots[slot] < 0) continue;
      this.slotAge[slot]++;
      this.place(slot);
      if (this.blocks.x1[slot] < left) this.remove(slot);
    }
  }

  /**
   * After a restart: the blocks of the events before the camera x that are still in reach come
   * back at their start (age 0). Cold path.
   *
   * @param cameraX - The restarted camera x.
   * @param active - Whether an event would fire now (its branch taken — the runner's
   *   `eventActive`).
   */
  respawnBefore(cameraX: number, active: (index: number) => boolean): void {
    const left = cameraX - BLOCK_DESPAWN_MARGIN;
    for (let i = 0; i < this.isBlock.length; i++) {
      if (this.isBlock[i] === 0 || !(this.eventX[i] < cameraX) || !active(i)) continue;
      if (this.baseX[i] + this.width[i] - 1 < left) continue;
      this.spawn(i);
    }
  }

  /** Removes every block. */
  clear(): void {
    this.slotEvent.fill(-1);
    this.blocks.clear();
    this.batch.count = 0;
  }

  /** Refills the sprite batch (phase 9): every tile of every live block. Never allocates. */
  sync(): void {
    const batch = this.batch;
    batch.count = 0;
    if (this.spriteId < 0) return;
    const blocks = this.blocks;
    const size = this.tileSize;
    const slots = this.slotEvent;
    for (let slot = 0; slot < slots.length; slot++) {
      const event = slots[slot];
      if (event < 0) continue;
      const frame = this.frame[event];
      if (frame < 0) continue;
      const x0 = blocks.x0[slot];
      const y0 = blocks.y0[slot];
      const cols = (this.width[event] / size) | 0;
      const rows = (this.height[event] / size) | 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (batch.count >= batch.capacity) return;
          pushSprite(batch, x0 + c * size, y0 + r * size, this.spriteId, frame, 0);
        }
      }
    }
  }

  /**
   * Writes a slot's block at its age into the map's block geometry.
   *
   * @param slot - The slot.
   */
  private place(slot: number): void {
    const event = this.slotEvent[slot];
    const age = this.slotAge[slot];
    const angle = Math.floor(this.phase[event] + (age * 1024) / this.period[event]) & ANGLE_MASK;
    const sine = SIN_TABLE_Q16[angle] / TRIG_SCALE;
    const x = this.baseX[event] + this.vx[event] * age + this.dx[event] * sine;
    const y = this.baseY[event] + this.vy[event] * age + this.dy[event] * sine;
    const x0 = Math.floor(x) | 0;
    const y0 = Math.floor(y) | 0;
    this.blocks.set(
      slot,
      x0,
      y0,
      x0 + (this.width[event] | 0) - 1,
      y0 + (this.height[event] | 0) - 1,
      this.type[event],
    );
  }

  /**
   * Frees a slot.
   *
   * @param slot - The slot.
   */
  private remove(slot: number): void {
    this.slotEvent[slot] = -1;
    this.blocks.remove(slot);
  }
}

/**
 * The stage gimmicks of one World (see the module docs). Implements the `core/enemies`
 * {@link EnemyGimmicks} host of the script API and the terrain hits of `core/weapons`.
 */
export class StageGimmicks implements EnemyGimmicks {
  /** The World's destructible terrain, or `null` in open space. */
  readonly destructible: DestructibleTerrain | null;
  /** The moving blocks, or `null` for a stage without `block` events. */
  readonly blocks: MovingBlockSystem | null;
  /** The chains' links (`LayerId.GroundEnemies`). */
  readonly chainBatch: SpriteBatch;
  /** Per field: owner enemy slot (-1 = free). */
  readonly fieldOwner: Int32Array;
  /** Per field: owner's spawn tick (a reused slot is another enemy). */
  readonly fieldOwnerTick: Float64Array;
  /** Per field: radius. */
  readonly fieldRadius: Float64Array;
  /** Per field: pull per tick. */
  readonly fieldStrength: Float64Array;
  /** Per field: ticks left (-1 = while the owner lives). */
  readonly fieldTicks: Float64Array;
  /** Per chain: owner enemy slot (-1 = free). */
  readonly chainOwner: Int32Array;
  /** Per chain: owner's spawn tick. */
  readonly chainOwnerTick: Float64Array;
  /** Per chain: fixed end x. */
  readonly chainX: Float64Array;
  /** Per chain: fixed end y. */
  readonly chainY: Float64Array;
  /** Per chain: links. */
  readonly chainLinks: Int32Array;
  /** The World. */
  private readonly host: StageGimmicksHost;
  /** The enemy slots (owners). */
  private readonly enemies: readonly Enemy[];
  /** Tile points per tile id (empty without terrain). */
  private readonly tileScore: Uint16Array;
  /** Tile name → id (empty without terrain). */
  private readonly tileNames: ReadonlyMap<string, number>;
  /** Chain link sprite id (-1 = not drawn). */
  private readonly chainSprite: number;

  /**
   * Builds the gimmicks of a World (load time — see {@link createStageGimmicks}).
   *
   * @param host - The World.
   * @param enemies - The enemy slots.
   * @param destructible - The destructible terrain, or `null`.
   * @param blocks - The moving blocks, or `null`.
   * @param tables - The stage tileset's tables, or `null`.
   * @param chainSprite - Chain link sprite id (-1 = not drawn).
   */
  constructor(
    host: StageGimmicksHost,
    enemies: readonly Enemy[],
    destructible: DestructibleTerrain | null,
    blocks: MovingBlockSystem | null,
    tables: TilesetTables | null,
    chainSprite: number,
  ) {
    this.host = host;
    this.enemies = enemies;
    this.destructible = destructible;
    this.blocks = blocks;
    this.tileScore = tables === null ? new Uint16Array(1) : tables.score;
    this.tileNames = tables === null ? new Map<string, number>() : tables.byName;
    this.chainSprite = chainSprite;
    this.chainBatch = createSpriteBatch(LayerId.GroundEnemies, MAX_CHAINS * MAX_CHAIN_LINKS);
    this.fieldOwner = new Int32Array(MAX_PULL_FIELDS).fill(-1);
    this.fieldOwnerTick = new Float64Array(MAX_PULL_FIELDS);
    this.fieldRadius = new Float64Array(MAX_PULL_FIELDS);
    this.fieldStrength = new Float64Array(MAX_PULL_FIELDS);
    this.fieldTicks = new Float64Array(MAX_PULL_FIELDS);
    this.chainOwner = new Int32Array(MAX_CHAINS).fill(-1);
    this.chainOwnerTick = new Float64Array(MAX_CHAINS);
    this.chainX = new Float64Array(MAX_CHAINS);
    this.chainY = new Float64Array(MAX_CHAINS);
    this.chainLinks = new Int32Array(MAX_CHAINS);
  }

  /** See {@link EnemyGimmicks.pull}. */
  pull(owner: Enemy, radius: number, strength: number, ticks: number): boolean {
    let slot = this.findField(owner);
    if (slot < 0) slot = this.findField(null);
    if (slot < 0) return false;
    this.fieldOwner[slot] = owner.slot;
    this.fieldOwnerTick[slot] = owner.spawnTick;
    this.fieldRadius[slot] = radius > 0 ? radius : 0;
    this.fieldStrength[slot] = strength > 0 ? strength : 0;
    this.fieldTicks[slot] = ticks > 0 ? Math.floor(ticks) : -1;
    return true;
  }

  /** See {@link EnemyGimmicks.release}. */
  release(owner: Enemy): void {
    const slot = this.findField(owner);
    if (slot >= 0) this.fieldOwner[slot] = -1;
  }

  /** See {@link EnemyGimmicks.chain}. */
  chain(owner: Enemy, anchorX: number, anchorY: number, links: number): boolean {
    let slot = this.findChain(owner);
    if (slot < 0) slot = this.findChain(null);
    if (slot < 0) return false;
    const n = Math.floor(links);
    this.chainOwner[slot] = owner.slot;
    this.chainOwnerTick[slot] = owner.spawnTick;
    this.chainX[slot] = anchorX;
    this.chainY[slot] = anchorY;
    this.chainLinks[slot] = n < 1 ? 1 : n > MAX_CHAIN_LINKS ? MAX_CHAIN_LINKS : n;
    return true;
  }

  /** See {@link EnemyGimmicks.placeTile}. */
  placeTile(x: number, y: number, tile: number): boolean {
    const d = this.destructible;
    if (d === null || !(x >= 0 && y >= 0)) return false;
    const size = d.map.tileSize;
    return d.place(Math.floor(x / size), Math.floor(y / size), tile);
  }

  /** See {@link EnemyGimmicks.tileId}. */
  tileId(name: string): number {
    return this.tileNames.get(name) ?? -1;
  }

  /**
   * A player shot met the terrain at a pixel (`core/weapons`, phase 5): damages the destructible
   * tile there (see the module docs). Never allocates.
   *
   * @param px - Pixel column (whole number).
   * @param py - Pixel row (whole number).
   * @param amount - The shot's damage.
   * @param by - The shooter's player slot (-1 = nobody).
   * @returns The `TerrainHit` code.
   */
  hitTerrain(px: number, py: number, amount: number, by: number): number {
    const d = this.destructible;
    if (d === null) return TerrainHit.None;
    const hit = d.hit(px, py, amount);
    if (hit === TerrainHit.None) return hit;
    const map = d.map;
    const size = map.tileSize;
    const cell = d.lastCell;
    const col = cell % map.cols;
    const x = col * size + (size >> 1);
    const y = ((cell - col) / map.cols) * size + (size >> 1);
    const events = this.host.events;
    if (hit === TerrainHit.Destroyed) {
      events.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeSmall, x, y, 0);
      events.push(SimEventKind.Particles, FX_CUES.ExplosionSmall, x, y, 1);
      const points = this.tileScore[d.lastTile];
      if (by >= 0 && points > 0) addScore(this.host, by, points);
    } else {
      events.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, x, y, 0);
    }
    return hit;
  }

  /**
   * Phase 2, after the ships moved: every field pulls the living ships in its radius towards its
   * owner, then the ships are clamped to the view again; a field whose owner is gone (or whose
   * ticks ran out) ends. Never allocates.
   */
  applyFields(): void {
    const owners = this.fieldOwner;
    for (let f = 0; f < owners.length; f++) {
      const slot = owners[f];
      if (slot < 0) continue;
      const owner = this.enemies[slot];
      if (owner.state !== EnemyState.Live || owner.spawnTick !== this.fieldOwnerTick[f]) {
        owners[f] = -1;
        continue;
      }
      this.pullShips(owner, f);
      const ticks = this.fieldTicks[f];
      if (ticks > 0) {
        if (ticks <= 1) owners[f] = -1;
        else this.fieldTicks[f] = ticks - 1;
      }
    }
  }

  /**
   * Phase 3, after the stage runner ticked: the living ships probe the armed triggers, the blocks
   * move, the keep-out rectangles (the ships' terrain boxes) are set and the destructible terrain
   * heals / regrows. Never allocates.
   *
   * @param runner - The stage runner (`probe`, `triggersArmed`), or `null` in free flight.
   */
  updateStage(
    runner: {
      readonly triggersArmed: number;
      probe(point: { readonly x: number; readonly y: number }): number;
    } | null,
  ): void {
    const host = this.host;
    const players = host.players;
    if (runner !== null && runner.triggersArmed !== 0) {
      for (let i = 0; i < players.length; i++) {
        const ship = players[i];
        if (ship.active && ship.state === 'alive') runner.probe(ship);
      }
    }
    const blocks = this.blocks;
    if (blocks !== null) blocks.update(host.camera);
    const d = this.destructible;
    if (d === null) return;
    // The keep-out rectangles are set whether or not a tile is destructible: `place` (the cube
    // rush) reads them too, and its tile need not have `hp`.
    d.clearKeepOut();
    const box = host.ship.terrainBox;
    for (let i = 0; i < players.length; i++) {
      const ship = players[i];
      if (!ship.active || ship.state === 'dying' || ship.state === 'dead') continue;
      d.addKeepOut(
        Math.floor(ship.x - box.hw) | 0,
        Math.floor(ship.y - box.hh) | 0,
        (Math.ceil(ship.x + box.hw) | 0) - 1,
        (Math.ceil(ship.y + box.hh) | 0) - 1,
      );
    }
    if (d.any) d.update();
  }

  /**
   * A checkpoint restart (the stage hooks' `clear`): fields and chains end, the stage's own tiles
   * come back, the blocks are removed — and, with a runner, those whose events lie before the
   * camera come back. Cold path.
   *
   * @param runner - The stage runner, or `null` (free flight: nothing to respawn).
   * @param cameraX - The camera x after the restart.
   */
  clear(runner: { eventActive(index: number): boolean } | null, cameraX: number): void {
    this.fieldOwner.fill(-1);
    this.chainOwner.fill(-1);
    this.chainBatch.count = 0;
    if (this.destructible !== null) this.destructible.restore();
    const blocks = this.blocks;
    if (blocks === null) return;
    blocks.clear();
    if (runner !== null) blocks.respawnBefore(cameraX, (index) => runner.eventActive(index));
  }

  /** Phase 9: refills the block and chain sprite batches. Never allocates. */
  sync(): void {
    if (this.blocks !== null) this.blocks.sync();
    const batch = this.chainBatch;
    batch.count = 0;
    const sprite = this.chainSprite;
    const owners = this.chainOwner;
    for (let c = 0; c < owners.length; c++) {
      const slot = owners[c];
      if (slot < 0) continue;
      const owner = this.enemies[slot];
      if (owner.state !== EnemyState.Live || owner.spawnTick !== this.chainOwnerTick[c]) {
        owners[c] = -1;
        continue;
      }
      if (sprite < 0) continue;
      this.drawChain(owner, c);
    }
  }

  /**
   * Draws the links of one chain, evenly spaced from its fixed end towards its owner (the owner's
   * own sprite is the last piece).
   *
   * @param owner - The owner.
   * @param c - The chain.
   */
  private drawChain(owner: Enemy, c: number): void {
    const batch = this.chainBatch;
    const links = this.chainLinks[c];
    const ax = this.chainX[c];
    const ay = this.chainY[c];
    const dx = owner.x - ax;
    const dy = owner.y - ay;
    for (let k = 0; k < links; k++) {
      if (batch.count >= batch.capacity) return;
      const t = k / links;
      pushSprite(
        batch,
        Math.round(ax + dx * t) | 0,
        Math.round(ay + dy * t) | 0,
        this.chainSprite,
        0,
        0,
      );
    }
  }

  /**
   * One field's pull on every living ship in its radius.
   *
   * @param owner - The field's owner.
   * @param f - The field.
   */
  private pullShips(owner: Enemy, f: number): void {
    const host = this.host;
    const players = host.players;
    const radius = this.fieldRadius[f];
    const strength = this.fieldStrength[f];
    const r2 = radius * radius;
    for (let i = 0; i < players.length; i++) {
      const ship = players[i];
      if (!ship.active || ship.state !== 'alive') continue;
      const dx = owner.x - ship.x;
      const dy = owner.y - ship.y;
      const d2 = dx * dx + dy * dy;
      if (!(d2 <= r2) || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const step = strength < d ? strength : d;
      ship.x += (dx / d) * step;
      ship.y += (dy / d) * step;
      this.clampShip(ship);
    }
  }

  /**
   * Keeps a ship inside the view minus the ship's margins (as `core/player` `updatePlayer` does).
   *
   * @param ship - The ship.
   */
  private clampShip(ship: PlayerShip): void {
    const camera = this.host.camera;
    const margins = this.host.ship.margins;
    const minX = camera.x + margins.left;
    const maxX = camera.x + PLAYFIELD_W - margins.right;
    const minY = camera.y + margins.top;
    const maxY = camera.y + PLAYFIELD_H - margins.bottom;
    if (ship.x < minX) ship.x = minX;
    else if (ship.x > maxX) ship.x = maxX;
    if (ship.y < minY) ship.y = minY;
    else if (ship.y > maxY) ship.y = maxY;
  }

  /**
   * The field slot of an owner (or the first free one for `null`).
   *
   * @param owner - The owner, or `null` for a free slot.
   * @returns The slot, or -1.
   */
  private findField(owner: Enemy | null): number {
    const owners = this.fieldOwner;
    for (let f = 0; f < owners.length; f++) {
      if (owner === null) {
        if (owners[f] < 0) return f;
      } else if (owners[f] === owner.slot && this.fieldOwnerTick[f] === owner.spawnTick) {
        return f;
      }
    }
    return -1;
  }

  /**
   * The chain slot of an owner (or the first free one for `null`).
   *
   * @param owner - The owner, or `null` for a free slot.
   * @returns The slot, or -1.
   */
  private findChain(owner: Enemy | null): number {
    const owners = this.chainOwner;
    for (let c = 0; c < owners.length; c++) {
      if (owner === null) {
        if (owners[c] < 0) return c;
      } else if (owners[c] === owner.slot && this.chainOwnerTick[c] === owner.spawnTick) {
        return c;
      }
    }
    return -1;
  }
}

/**
 * Builds the stage gimmicks of a World (load time): the destructible terrain of its map (with the
 * stage's own tiles as the rollback copy), the moving blocks of its `block` events and the empty
 * field / chain tables.
 *
 * @param host - The World.
 * @param enemies - The World's enemy slots (owners of fields and chains).
 * @param stage - The stage, or `null` in free flight.
 * @param map - The World's collision map (`createStageTerrain`), or `null` in open space.
 * @param content - The content (tileset tables, the chain sprite).
 * @returns The gimmicks.
 *
 * @example
 * ```ts
 * world.gimmicks = createStageGimmicks(world, world.enemies.enemies, stage, world.terrain, db);
 * ```
 */
export function createStageGimmicks(
  host: StageGimmicksHost,
  enemies: readonly Enemy[],
  stage: StageSpec | null,
  map: TerrainMap | null,
  content: ContentDb,
): StageGimmicks {
  const chainSprite = content.sprites.index.get(CHAIN_SPRITE) ?? -1;
  const terrain = stage === null ? null : stage.terrain;
  const tileset = terrain === null ? undefined : content.tilesets[terrain.tilesetId];
  if (stage === null || map === null || terrain === null || tileset === undefined) {
    return new StageGimmicks(host, enemies, null, null, null, chainSprite);
  }
  const tables = tileset.tables;
  const destructible = new DestructibleTerrain(map, terrain.tiles, tables.hp, tables.regen);
  const blocks =
    map.blocks === undefined || map.blocks === null
      ? null
      : new MovingBlockSystem(stage, map.blocks, tables, tileset.spriteId, map.tileSize);
  return new StageGimmicks(host, enemies, destructible, blocks, tables, chainSprite);
}
