/**
 * The TV render bench's **synthetic scene** — a load model of a busy v2 frame, no game simulation
 * (plan R0-02 — part of the `bench` module, see `./index.ts`).
 *
 * At density `s` the scene is: five parallax layers (two full-frame backdrops on `BG_FAR`, three
 * partial bands with alpha on `BG_MID`), top and bottom tile terrain covering ~35 % of the frame at
 * `8·s`-px tiles, a decor layer of ground turrets, 64 enemies, the player's ship, four Options and
 * 32 shots, 512 point items, 512 enemy bullets, the renderer's 512-particle pool kept full, and the
 * two HUD bars (`8·s` px tall) with a label, a score and lives. Everything is drawn from the
 * density's own atlas (the real atlas ×s, `scripts/bench-atlas.mjs`), so sprite sizes follow `s`;
 * positions and speeds are ×s too, so every frame size shows the same field of view.
 *
 * It hands the renderer a real `WorldView` (the batches go through the renderer's own bindings —
 * the CPU path the game takes) and, for the backdrops and the terrain, its own `ParallaxView` and
 * `TerrainView`: the renderer's built-in bindings still cover only the v1 frame's width, so the
 * bench binds those two itself at the scenario's width (`run.ts`).
 *
 * **Allocation.** Everything is created by the constructor; {@link BenchScene.tick} only writes
 * numbers into typed arrays and class fields, so the heap the bench measures is the renderer's.
 *
 * @module
 */
import {
  LayerId,
  PLAYFIELD_Y,
  RasterKind,
  createDrawList,
  createSpriteBatch,
  type CameraView,
  type DrawList,
  type Mode7View,
  type ParallaxView,
  type RasterEffectView,
  type SpriteBatch,
  type StageEffectsView,
  type TerrainView,
  type WorldView,
} from '@shmup/core';

/** The load the scene carries at every size (counts — sizes and speeds scale with `s`). */
export const BENCH_LOAD = Object.freeze({
  /** Full-frame backdrop layers (`BG_FAR`). */
  fullBackdrops: 2,
  /** Partial backdrop bands with alpha (`BG_MID`). */
  partialBackdrops: 3,
  /** Share of the frame's rows the top and bottom terrain cover together. */
  terrainShare: 0.35,
  /** Enemies on screen. */
  enemies: 64,
  /** Enemy bullets on screen (the full pool). */
  bullets: 512,
  /** Point items on screen (the full pool). */
  points: 512,
  /** Particles the renderer's pool is kept at. */
  particles: 512,
  /** Ground turrets of the decor layer. */
  decor: 48,
  /** The player's shots. */
  shots: 32,
  /** The player's Options. */
  options: 4,
});

/** v1's HUD bar height and tile edge in pixels — the `s = 1` sizes the density scales. */
export const BENCH_BASE_UNIT = 8;

/** The atlas facts the scene lays itself out from (a structural slice of the atlas manifest). */
export interface BenchSceneManifest {
  /** Frames by name (`<sprite>#<index>`): their size. */
  readonly frames: { readonly [frame: string]: { readonly w: number; readonly h: number } };
  /** Sprites by name: their frame names. */
  readonly sprites: { readonly [sprite: string]: { readonly frames: readonly string[] } };
}

/** The sprites the scene draws, resolved to ids of its own name table. */
export interface BenchSprites {
  /** The sprite name table (`renderer.setSpriteNames`); an id is an index into it. */
  readonly names: readonly string[];
  /** Enemy bullet kinds. */
  readonly bullets: readonly number[];
  /** The point item. */
  readonly point: number;
  /** Enemy kinds. */
  readonly enemies: readonly number[];
  /** Ground turret kinds (the decor layer). */
  readonly decor: readonly number[];
  /** The player's ship. */
  readonly ship: number;
  /** The Option. */
  readonly option: number;
  /** The shot. */
  readonly shot: number;
  /** Full-frame backdrops. */
  readonly fullBackdrops: readonly number[];
  /** Partial backdrop bands. */
  readonly partialBackdrops: readonly number[];
  /** The terrain tileset. */
  readonly tileset: number;
  /** The Mode-7 floor tile. */
  readonly floor: number;
  /** The HUD's life icon. */
  readonly life: number;
}

/** Enemy kinds the scene cycles through. */
const ENEMY_KINDS = 16;

/**
 * The base sprites of a category (no `@flash` / palette / `@p2` variants), sorted.
 *
 * @param all - Every sprite name of the atlas.
 * @param prefix - Category prefix, e.g. `'bullets/'`.
 * @returns The names.
 */
function baseSprites(all: readonly string[], prefix: string): string[] {
  return all.filter((name) => name.indexOf(prefix) === 0 && name.indexOf('@') < 0).sort();
}

/**
 * Picks the scene's sprites from the atlas's sprite names (load time).
 *
 * @param all - Every sprite name of the atlas (`Object.keys(manifest.sprites)`).
 * @returns The picks and their name table.
 * @throws {Error} When a category the scene needs has no sprite at all.
 *
 * @example
 * ```ts
 * const sprites = pickBenchSprites(Object.keys(manifest.sprites));
 * renderer.setSpriteNames(sprites.names);
 * ```
 */
export function pickBenchSprites(all: readonly string[]): BenchSprites {
  const names: string[] = [];
  /**
   * Adds a sprite to the name table.
   *
   * @param name - Sprite name.
   * @returns Its id.
   */
  const id = (name: string): number => {
    const at = names.indexOf(name);
    if (at >= 0) return at;
    names.push(name);
    return names.length - 1;
  };
  /**
   * The preferred sprites that exist, else the first ones of the category.
   *
   * @param prefix - Category prefix.
   * @param preferred - Names to use when the atlas has them.
   * @param count - How many to return.
   * @returns Their ids.
   */
  const choose = (prefix: string, preferred: readonly string[], count: number): number[] => {
    const pool = baseSprites(all, prefix);
    if (pool.length === 0) throw new Error(`render bench: the atlas has no "${prefix}" sprite`);
    const picked = preferred.filter((name) => pool.indexOf(name) >= 0);
    for (let i = 0; picked.length < count && i < pool.length; i++) {
      if (picked.indexOf(pool[i]) < 0) picked.push(pool[i]);
    }
    while (picked.length < count) picked.push(picked[picked.length % pool.length]);
    return picked.slice(0, count).map(id);
  };
  const turrets = baseSprites(all, 'enemies/').filter((name) => name.indexOf('turret') >= 0);
  const flyers = baseSprites(all, 'enemies/').filter((name) => name.indexOf('turret') < 0);
  const step = Math.max(1, Math.floor(flyers.length / ENEMY_KINDS));
  const enemyNames: string[] = [];
  for (let i = 0; i < flyers.length && enemyNames.length < ENEMY_KINDS; i += step) {
    enemyNames.push(flyers[i]);
  }
  const bullets = choose('bullets/', [], baseSprites(all, 'bullets/').length);
  const point = choose('items/', ['items/point'], 1)[0];
  const enemies = choose('enemies/', enemyNames, Math.max(1, enemyNames.length));
  const decor = choose('enemies/', turrets, Math.max(1, turrets.length));
  const ship = choose('ships/', ['ships/kestrel'], 1)[0];
  const option = choose('options/', ['options/orb'], 1)[0];
  const shot = choose('shots/', ['shots/basic'], 1)[0];
  const fullBackdrops = choose('bg/', ['bg/stars-far', 'bg/stars-mid'], 2);
  const partialBackdrops = choose('bg/', ['bg/azure-verge', 'bg/dune-ridge', 'bg/sea-swell'], 3);
  const tileset = choose('tiles/', ['tiles/terrain-a'], 1)[0];
  const floor = choose('bg/', ['bg/dimension-floor'], 1)[0];
  const life = choose('hud/', ['hud/life'], 1)[0];
  return {
    names,
    bullets,
    point,
    enemies,
    decor,
    ship,
    option,
    shot,
    fullBackdrops,
    partialBackdrops,
    tileset,
    floor,
    life,
  };
}

/** A small deterministic generator — the scene is the same on every run. */
export class BenchRandom {
  /** The state. */
  private readonly state = new Uint32Array(1);

  /**
   * A generator.
   *
   * @param seed - Starting state.
   */
  constructor(seed = 0x2545f491) {
    this.state[0] = seed >>> 0;
  }

  /**
   * The next number in [0, 1).
   *
   * @returns The number.
   */
  next(): number {
    this.state[0] = (Math.imul(this.state[0], 1664525) + 1013904223) >>> 0;
    return this.state[0] / 4294967296;
  }
}

/** The scene's camera (a class: its fractional fields stay unboxed doubles). */
export class BenchCamera implements CameraView {
  /** World x of the playfield's left edge. */
  x = 0;
  /** World y of the playfield's top edge. */
  y = 0;
}

/** What the scene needs to lay itself out. */
export interface BenchSceneOptions {
  /** Internal frame width. */
  readonly width: number;
  /** Internal frame height. */
  readonly height: number;
  /** Density factor `s`. */
  readonly density: number;
  /** The sprites ({@link pickBenchSprites}). */
  readonly sprites: BenchSprites;
  /** The density's atlas manifest (frame sizes). */
  readonly manifest: BenchSceneManifest;
  /** Draw a filtered layer (a raster wave on the far backdrop). */
  readonly filter: boolean;
  /** Draw the Mode-7 floor. */
  readonly mode7: boolean;
  /** Generator seed (default the bench's own). */
  readonly seed?: number;
}

/** Terrain map width in tiles (the camera wraps long after a scenario ends). */
export const BENCH_TERRAIN_COLUMNS = 1024;

/** Camera speed in pixels per tick at `s = 1`. */
const CAMERA_SPEED = 0.75;

/** HUD label slot. */
const SLOT_LABEL = 0;

/** HUD `1P` slot. */
const SLOT_PLAYER = 1;

/** Score points added per tick (the HUD redraws every {@link SCORE_TICKS}). */
const SCORE_TICKS = 8;

/**
 * A frame's size from the manifest.
 *
 * @param manifest - The manifest.
 * @param names - The scene's sprite name table.
 * @param sprite - Sprite id.
 * @returns `[width, height]` of the sprite's frame 0 (`[1, 1]` when missing).
 */
function frameSize(
  manifest: BenchSceneManifest,
  names: readonly string[],
  sprite: number,
): [number, number] {
  const frames = manifest.sprites[names[sprite]]?.frames;
  const frame = frames === undefined ? undefined : manifest.frames[frames[0]];
  return frame === undefined ? [1, 1] : [Math.max(1, frame.w), Math.max(1, frame.h)];
}

/**
 * Frames of a sprite.
 *
 * @param manifest - The manifest.
 * @param name - Sprite name.
 * @returns At least 1.
 */
function frameCount(manifest: BenchSceneManifest, name: string): number {
  return Math.max(1, manifest.sprites[name]?.frames.length ?? 1);
}

/**
 * A triangle wave in `[-1, 1]` over whole periods (integer maths only — the terrain's profile).
 *
 * @param x - Position.
 * @param period - Period (≥ 2).
 * @returns The value.
 */
function triangle(x: number, period: number): number {
  const phase = ((x % period) + period) % period;
  const half = period / 2;
  return (phase < half ? phase / half : (period - phase) / half) * 2 - 1;
}

/**
 * The bench's synthetic scene (see the module docs).
 *
 * @example
 * ```ts
 * const scene = new BenchScene({ width: 640, height: 360, density: 1.5, sprites, manifest,
 *   filter: false, mode7: false });
 * renderer.bindWorld(scene.world);
 * scene.tick(); // once per fixed tick
 * ```
 */
export class BenchScene {
  /** The world the renderer binds (batches, effects; no parallax or terrain — see the module). */
  readonly world: WorldView;
  /** The camera. */
  readonly camera = new BenchCamera();
  /** The backdrops, bound by the bench itself at the scenario's width. */
  readonly parallax: ParallaxView;
  /** Bands of {@link BenchScene.parallax} that are full-frame (the rest are the partial ones). */
  readonly fullBands: number;
  /** The terrain, bound by the bench itself at the scenario's width. */
  readonly terrain: TerrainView;
  /** The HUD bars. */
  readonly hud: DrawList;
  /** The UI layer's list (empty — the bench draws no menu). */
  readonly ui: DrawList;
  /** HUD bar height in pixels (`8·s`). */
  readonly hudBar: number;
  /** Playfield height in pixels (the frame minus both bars). */
  readonly playHeight: number;
  /** Internal frame width in pixels. */
  readonly frameWidth: number;
  /** Ticks run. */
  ticks = 0;

  /** Playfield row where the open band between the terrains starts (enemies stay inside it). */
  private readonly openTop: number;
  /** Playfield row where it ends. */
  private readonly openBottom: number;
  /** Density. */
  private readonly density: number;
  /** The sprites. */
  private readonly sprites: BenchSprites;
  /** Score shown on the HUD. */
  private score = 0;
  /** Whether the HUD needs a rebuild. */
  private hudDirty = true;
  /** Batches: enemy bullets, point items, enemies, decor, player, shots. */
  private readonly bullets: SpriteBatch;
  /** Point items. */
  private readonly points: SpriteBatch;
  /** Enemies. */
  private readonly enemies: SpriteBatch;
  /** Ground turrets. */
  private readonly decor: SpriteBatch;
  /** The ship and its Options. */
  private readonly player: SpriteBatch;
  /** The player's shots. */
  private readonly shots: SpriteBatch;
  /** Screen-space position and velocity per bullet: x, y, vx, vy (stride 4). */
  private readonly bulletMotion: Float64Array;
  /** The same for point items. */
  private readonly pointMotion: Float64Array;
  /** The same for enemies. */
  private readonly enemyMotion: Float64Array;
  /** World x of each turret. */
  private readonly decorX: Float64Array;
  /** Screen-space x of each shot. */
  private readonly shotX: Float64Array;
  /** Animation frames per enemy slot and bullet slot. */
  private readonly enemyFrames: Uint8Array;
  /** Animation frames per bullet slot. */
  private readonly bulletFrames: Uint8Array;
  /** Scroll factor per parallax band. */
  private readonly bandFactor: Float64Array;
  /** Writable views of the parallax arrays. */
  private readonly bandOffset: Float64Array;
  /** Repeat distance per band. */
  private readonly bandSpacing: Float64Array;
  /** Heights of the ceiling / floor per terrain column, in tiles: `[ceil, floor]` pairs. */
  private readonly heights: Uint8Array;
  /** Where the camera wraps back to 0 (world pixels). */
  private readonly wrapX: number;
  /** Playfield-to-batch y offset (the bindings add `PLAYFIELD_Y`; the bench's bar is `8·s`). */
  private readonly batchY: number;

  /**
   * Builds the scene (load time — everything is allocated here).
   *
   * @param options - Size, density, sprites, manifest and variant.
   */
  constructor(options: BenchSceneOptions) {
    const { width, height, density, sprites, manifest } = options;
    const s = density;
    this.frameWidth = width;
    this.density = s;
    this.sprites = sprites;
    const names = sprites.names;
    const random = new BenchRandom(options.seed);
    this.hudBar = Math.max(1, Math.round(BENCH_BASE_UNIT * s));
    this.playHeight = height - 2 * this.hudBar;
    this.batchY = this.hudBar - PLAYFIELD_Y;
    const playH = this.playHeight;

    // --- terrain: a heightfield, ~35 % of the frame's rows, 40 / 60 between ceiling and floor.
    const tile = this.hudBar;
    const rows = Math.max(1, Math.ceil(playH / tile));
    const cols = BENCH_TERRAIN_COLUMNS;
    const terrainRows = (BENCH_LOAD.terrainShare * height) / tile;
    const ceilingBase = terrainRows * 0.4;
    const floorBase = terrainRows * 0.6;
    const tilesetFrames = frameCount(manifest, names[sprites.tileset]);
    const tileKinds = Math.min(tilesetFrames, 8);
    const tiles = new Uint8Array(rows * cols);
    const heights = new Uint8Array(cols * 2);
    for (let col = 0; col < cols; col++) {
      const wave = triangle(col, 24) * 2 + triangle(col, 7);
      const ceiling = Math.max(1, Math.round(ceilingBase + wave * 0.5));
      const floor = Math.max(1, Math.round(floorBase - wave * 0.5));
      heights[col * 2] = ceiling;
      heights[col * 2 + 1] = floor;
      for (let row = 0; row < rows; row++) {
        const solid = row < ceiling || row >= rows - floor;
        if (!solid) continue;
        const surface = row === ceiling - 1 || row === rows - floor;
        tiles[row * cols + col] = surface ? 1 : 2 + ((col + row) % Math.max(1, tileKinds - 1));
      }
    }
    const tileFrame = new Int16Array(tileKinds + 2);
    tileFrame[0] = -1;
    for (let i = 1; i < tileFrame.length; i++) tileFrame[i] = (i - 1) % tilesetFrames;
    this.heights = heights;
    this.terrain = {
      tileSize: tile,
      cols,
      rows,
      tiles,
      tilesetSpriteId: sprites.tileset,
      tileFrame,
    };
    this.wrapX = (cols - Math.ceil(width / tile) - 2) * tile;

    // --- parallax: two full-frame backdrops (rows of repeated sprites) and three partial bands.
    const bands: { layer: number; sprite: number; y: number; spacing: number; factor: number }[] =
      [];
    for (let f = 0; f < BENCH_LOAD.fullBackdrops; f++) {
      const sprite = sprites.fullBackdrops[f % sprites.fullBackdrops.length];
      const [w, h] = frameSize(manifest, names, sprite);
      const bandRows = Math.ceil(playH / h);
      for (let r = 0; r < bandRows; r++) {
        bands.push({ layer: LayerId.BgFar, sprite, y: r * h, spacing: w, factor: 0.1 + 0.15 * f });
      }
    }
    this.fullBands = bands.length;
    const partialRows = [0.2, 0.42, 0.62];
    for (let p = 0; p < BENCH_LOAD.partialBackdrops; p++) {
      const sprite = sprites.partialBackdrops[p % sprites.partialBackdrops.length];
      const [w] = frameSize(manifest, names, sprite);
      bands.push({
        layer: LayerId.BgMid,
        sprite,
        y: Math.round(playH * partialRows[p % partialRows.length]),
        spacing: w,
        factor: 0.35 + 0.15 * p,
      });
    }
    const count = bands.length;
    const layer = new Int32Array(count);
    const spriteId = new Int32Array(count);
    const y = new Float64Array(count);
    this.bandOffset = new Float64Array(count);
    this.bandSpacing = new Float64Array(count);
    this.bandFactor = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      layer[i] = bands[i].layer;
      spriteId[i] = bands[i].sprite;
      y[i] = bands[i].y;
      this.bandSpacing[i] = bands[i].spacing;
      this.bandFactor[i] = bands[i].factor;
    }
    this.parallax = {
      count,
      layer,
      spriteId,
      offsetX: this.bandOffset,
      y,
      spacing: this.bandSpacing,
    };

    // --- the batches.
    this.decor = createSpriteBatch(LayerId.GroundEnemies, BENCH_LOAD.decor);
    this.enemies = createSpriteBatch(LayerId.AirEnemies, BENCH_LOAD.enemies);
    this.shots = createSpriteBatch(LayerId.PlayerShots, BENCH_LOAD.shots);
    this.player = createSpriteBatch(LayerId.Player, 1 + BENCH_LOAD.options);
    this.points = createSpriteBatch(LayerId.Items, BENCH_LOAD.points);
    this.bullets = createSpriteBatch(LayerId.EnemyBullets, BENCH_LOAD.bullets);

    const top = Math.ceil(ceilingBase + 1.5) * tile;
    const bottom = playH - Math.ceil(floorBase + 1.5) * tile;
    const open = Math.max(1, bottom - top);
    this.openTop = top;
    this.openBottom = top + open;
    this.bulletMotion = new Float64Array(BENCH_LOAD.bullets * 4);
    this.bulletFrames = new Uint8Array(BENCH_LOAD.bullets);
    for (let i = 0; i < BENCH_LOAD.bullets; i++) {
      const m = i * 4;
      this.bulletMotion[m] = random.next() * width;
      this.bulletMotion[m + 1] = top + random.next() * open;
      const angle = random.next() * 6.283185307179586;
      const speed = (0.6 + random.next() * 1.4) * s;
      this.bulletMotion[m + 2] = Math.cos(angle) * speed;
      this.bulletMotion[m + 3] = Math.sin(angle) * speed;
      const kind = sprites.bullets[i % sprites.bullets.length];
      this.bullets.spriteId[i] = kind;
      this.bulletFrames[i] = frameCount(manifest, names[kind]);
    }
    this.bullets.count = BENCH_LOAD.bullets;
    this.pointMotion = new Float64Array(BENCH_LOAD.points * 4);
    for (let i = 0; i < BENCH_LOAD.points; i++) {
      const m = i * 4;
      this.pointMotion[m] = random.next() * width;
      this.pointMotion[m + 1] = top + random.next() * open;
      this.pointMotion[m + 2] = -(0.3 + random.next() * 0.6) * s;
      this.pointMotion[m + 3] = (random.next() - 0.5) * 0.4 * s;
      this.points.spriteId[i] = sprites.point;
    }
    this.points.count = BENCH_LOAD.points;
    this.enemyMotion = new Float64Array(BENCH_LOAD.enemies * 4);
    this.enemyFrames = new Uint8Array(BENCH_LOAD.enemies);
    for (let i = 0; i < BENCH_LOAD.enemies; i++) {
      const m = i * 4;
      this.enemyMotion[m] = random.next() * (width + 64 * s);
      this.enemyMotion[m + 1] = top + random.next() * open;
      this.enemyMotion[m + 2] = -(0.4 + random.next() * 0.8) * s;
      this.enemyMotion[m + 3] = (random.next() - 0.5) * 1.2 * s;
      const kind = sprites.enemies[i % sprites.enemies.length];
      this.enemies.spriteId[i] = kind;
      this.enemyFrames[i] = frameCount(manifest, names[kind]);
    }
    this.enemies.count = BENCH_LOAD.enemies;
    this.decorX = new Float64Array(BENCH_LOAD.decor);
    const decorSpan = width + 96 * s;
    for (let i = 0; i < BENCH_LOAD.decor; i++) {
      this.decorX[i] = (i * decorSpan) / BENCH_LOAD.decor;
      this.decor.spriteId[i] = sprites.decor[i % sprites.decor.length];
    }
    this.decor.count = BENCH_LOAD.decor;
    this.player.spriteId[0] = sprites.ship;
    for (let i = 1; i <= BENCH_LOAD.options; i++) this.player.spriteId[i] = sprites.option;
    this.player.count = 1 + BENCH_LOAD.options;
    this.shotX = new Float64Array(BENCH_LOAD.shots);
    for (let i = 0; i < BENCH_LOAD.shots; i++) {
      this.shotX[i] = (i * width) / BENCH_LOAD.shots;
      this.shots.spriteId[i] = sprites.shot;
    }
    this.shots.count = BENCH_LOAD.shots;

    // --- effects: the filtered layer and the Mode-7 floor.
    const raster: RasterEffectView[] = [];
    if (options.filter) {
      raster.push({
        layer: LayerId.BgFar,
        kind: RasterKind.Wave,
        top: 0,
        bottom: playH,
        amplitude: Math.round(3 * s),
        wavelength: Math.round(40 * s),
        period: 120,
        factorTop: 0,
        factorBottom: 0,
        bands: [],
        wrap: 0,
        from: 0,
        to: Infinity,
      });
    }
    const mode7: Mode7View | null = options.mode7
      ? {
          spriteId: sprites.floor,
          horizon: Math.round(playH * 0.45),
          bottom: playH,
          height: 24 * s,
          scroll: 1,
          sway: 0,
          turn: 0,
          fog: 0x1a2440,
          fogDepth: 96 * s,
          alpha: 1,
          from: 0,
          to: Infinity,
        }
      : null;
    const effects: StageEffectsView | null =
      raster.length > 0 || mode7 !== null ? { raster, cycles: [], mode7 } : null;

    this.world = {
      camera: this.camera,
      parallax: null,
      terrain: null,
      batches: [this.decor, this.enemies, this.shots, this.player, this.points, this.bullets],
      lasers: null,
      bendingLasers: null,
      warning: null,
      effects,
      hitboxes: null,
    };
    this.hud = createDrawList(32, 4);
    this.hud.setString(SLOT_PLAYER, '1P');
    this.ui = createDrawList(1, 1);
    this.place();
    this.drawHud();
  }

  /** Live counts of the batches (they never change — the load is constant). */
  get liveBullets(): number {
    return this.bullets.count;
  }

  /** Live point items. */
  get livePoints(): number {
    return this.points.count;
  }

  /** Live enemies. */
  get liveEnemies(): number {
    return this.enemies.count;
  }

  /**
   * Sets the HUD's label (the run's progress). Call it when it changes, not per frame.
   *
   * @param text - The label.
   */
  setLabel(text: string): void {
    if (this.hud.setString(SLOT_LABEL, text)) this.hudDirty = true;
  }

  /**
   * Terrain tile sprites the current camera shows (the load's `tiles` figure).
   *
   * @returns Solid cells in the visible columns.
   */
  visibleTiles(): number {
    const tile = this.terrain.tileSize;
    const first = Math.floor(this.camera.x / tile);
    const columns = Math.ceil(this.frameWidth / tile) + 1;
    let total = 0;
    for (let c = 0; c < columns; c++) {
      const col = (first + c) % this.terrain.cols;
      total += this.heights[col * 2] + this.heights[col * 2 + 1];
    }
    return total;
  }

  /** Advances the scene one fixed tick. Never allocates. */
  tick(): void {
    this.ticks++;
    const s = this.density;
    const camera = this.camera;
    camera.x += CAMERA_SPEED * s;
    if (camera.x >= this.wrapX) camera.x = 0;
    for (let i = 0; i < this.bandOffset.length; i++) {
      const spacing = this.bandSpacing[i];
      const offset = (camera.x * this.bandFactor[i]) % spacing;
      this.bandOffset[i] = offset < 0 ? offset + spacing : offset;
    }
    if (this.ticks % SCORE_TICKS === 0) {
      this.score += 130;
      this.hudDirty = true;
    }
    this.place();
    if (this.hudDirty) this.drawHud();
  }

  /** Writes every batch's world positions from the screen-space motion state. */
  private place(): void {
    const width = this.frameWidth;
    const camX = this.camera.x;
    const camY = this.camera.y;
    const s = this.density;
    const playH = this.playHeight;
    const batchY = camY - this.batchY;
    const anim = (this.ticks >> 3) | 0;
    const margin = 16 * s;
    moveWrapped(this.bulletMotion, this.bullets, width, playH, margin, camX, batchY);
    for (let i = 0; i < this.bullets.count; i++)
      this.bullets.frame[i] = anim % this.bulletFrames[i];
    moveWrapped(this.pointMotion, this.points, width, playH, margin, camX, batchY);
    // Enemies: drift left, bounce between the terrain bands, re-enter on the right.
    const enemies = this.enemies;
    const motion = this.enemyMotion;
    const top = this.openTop;
    const bottom = this.openBottom;
    for (let i = 0; i < enemies.count; i++) {
      const m = i * 4;
      let x = motion[m] + motion[m + 2];
      let y = motion[m + 1] + motion[m + 3];
      if (x < -4 * margin) x += width + 8 * margin;
      if (y < top || y > bottom) {
        motion[m + 3] = -motion[m + 3];
        y = y < top ? top : bottom;
      }
      motion[m] = x;
      motion[m + 1] = y;
      enemies.x[i] = camX + x;
      enemies.y[i] = batchY + y;
      enemies.frame[i] = anim % this.enemyFrames[i];
    }
    // Ground turrets: fixed in the world on the floor, recycled ahead once off the left edge.
    const decor = this.decor;
    const span = width + 96 * s;
    const floorY = this.openBottom;
    for (let i = 0; i < decor.count; i++) {
      if (this.decorX[i] < camX - 48 * s) this.decorX[i] += span;
      decor.x[i] = this.decorX[i];
      decor.y[i] = batchY + floorY;
    }
    // The ship and its Options, bobbing gently; the shots stream right from the ship.
    const player = this.player;
    const shipX = width * 0.2;
    const shipY = playH * 0.5 + ((this.ticks % 120) - 60) * 0.1 * s;
    player.x[0] = camX + shipX;
    player.y[0] = batchY + shipY;
    for (let i = 1; i < player.count; i++) {
      player.x[i] = camX + shipX - i * 18 * s;
      player.y[i] = batchY + shipY + (i % 2 === 0 ? 10 : -10) * s;
    }
    const shots = this.shots;
    for (let i = 0; i < shots.count; i++) {
      let x = this.shotX[i] + 6 * s;
      if (x > width + margin) x -= width - shipX + margin;
      this.shotX[i] = x;
      shots.x[i] = camX + x;
      shots.y[i] = batchY + shipY + ((i % 3) - 1) * 6 * s;
    }
  }

  /** Rebuilds the HUD bars (only when the score or the label changed). */
  private drawHud(): void {
    const hud = this.hud;
    const width = this.frameWidth;
    const bar = this.hudBar;
    const bottomBar = this.playHeight + bar;
    hud.clear();
    hud.rect(0, 0, width, bar, 0x10173a);
    hud.rect(0, bottomBar, width, bar, 0x10173a);
    hud.text(SLOT_PLAYER, 2 * this.density, 0, 0xffd34d);
    hud.number(this.score, width - 2 * this.density, 0, 8, 0xffffff, 2);
    hud.text(SLOT_LABEL, width >> 1, bottomBar, 0x9fd8ff, 1);
    for (let i = 0; i < 3; i++) {
      hud.sprite(this.sprites.life, 0, Math.round((4 + 12 * i) * this.density), bottomBar);
    }
    this.hudDirty = false;
  }
}

/**
 * Moves a pool of screen-space sprites one tick and wraps them inside the playfield.
 *
 * @param motion - `x, y, vx, vy` per slot (stride 4).
 * @param batch - The batch to write world positions into.
 * @param width - Frame width.
 * @param height - Playfield height.
 * @param margin - How far past an edge a sprite goes before it wraps.
 * @param camX - Camera x (world = camera + screen).
 * @param batchY - World y of playfield row 0 as the batch binding reads it.
 */
function moveWrapped(
  motion: Float64Array,
  batch: SpriteBatch,
  width: number,
  height: number,
  margin: number,
  camX: number,
  batchY: number,
): void {
  const spanX = width + 2 * margin;
  const spanY = height + 2 * margin;
  for (let i = 0; i < batch.count; i++) {
    const m = i * 4;
    let x = motion[m] + motion[m + 2];
    let y = motion[m + 1] + motion[m + 3];
    if (x < -margin) x += spanX;
    else if (x > width + margin) x -= spanX;
    if (y < -margin) y += spanY;
    else if (y > height + margin) y -= spanY;
    motion[m] = x;
    motion[m + 1] = y;
    batch.x[i] = camX + x;
    batch.y[i] = batchY + y;
  }
}

/**
 * The part of `@shmup/render-pixi`'s `ParticleSystem` the scene keeps full (structural, so the
 * load is testable without a WebGL context).
 */
export interface BenchParticles {
  /** Particles the pool can hold. */
  readonly capacity: number;
  /** Particles alive now. */
  readonly liveCount: number;
  /** The presets the pool can emit. */
  readonly content: { readonly presets: readonly unknown[] };
  /**
   * Emits one preset's burst.
   *
   * @param preset - Preset index.
   * @param x - World x.
   * @param y - World y.
   * @param intensity - Burst intensity.
   * @returns Particles spawned.
   */
  emit(preset: number, x: number, y: number, intensity: number): number;
}

/**
 * Keeps the particle pool full: bursts of every preset across the playfield until no free slot is
 * left (a full pool recycles its oldest particle, so this settles). Never allocates.
 *
 * @param particles - The renderer's pool, or `null`.
 * @param scene - The scene (its camera and size).
 * @param random - The generator.
 */
export function fillBenchParticles(
  particles: BenchParticles | null,
  scene: BenchScene,
  random: BenchRandom,
): void {
  if (particles === null) return;
  const presets = particles.content.presets.length;
  if (presets === 0) return;
  const camera = scene.camera;
  const width = scene.frameWidth;
  const height = scene.playHeight;
  for (let i = 0; i < presets * 4 && particles.liveCount < particles.capacity; i++) {
    particles.emit(
      i % presets,
      camera.x + width * random.next(),
      camera.y + height * random.next(),
      4,
    );
  }
}
