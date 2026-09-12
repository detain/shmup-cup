/**
 * # particles — cosmetic particles and explosions
 *
 * **Responsibility.** The particle presets of `content/fx/` (content kind `fx`, owned by this
 * module — plan §3.5) and the pooled particle system that draws them: explosions larger than the
 * enemy sprite, debris, sparks, the "clink" on invulnerable armour, the boss chain, bullet-cancel
 * sparkles, the pickup flash and the muzzle flash (plan M1-14).
 *
 * - **Content.** {@link loadFxContent} validates every `fx` file with the core schema combinators
 *   (decision D28) and cross-checks it: preset ids unique across files, every trigger naming an
 *   existing preset and a real cue (`FX_CUE_NAMES` for `Particles` events, `SFX_CUE_NAMES` for
 *   the sounds that also imply a visual — a hit, a clink, a pickup, a shot), at most
 *   {@link MAX_TRIGGERS_PER_CUE} presets per cue, `min ≤ max` in every range. A preset is a burst
 *   of `count` particles of one atlas sprite whose `frames` play evenly over each particle's
 *   lifetime, flying out at a random speed in `speed`, inside a cone (`direction` ± `spread` / 2,
 *   degrees, 0 = right, 90 = down), pulled by `gravity`, slowed by `drag`, optionally scattered
 *   over `radius` and staggered by `delay`, drawn with additive (`add`) or normal blending.
 * - **Pool.** {@link createParticleSystem}: {@link PARTICLE_CAPACITY} (256) particles in
 *   struct-of-arrays typed arrays, packed in `[0, liveCount)`; when the pool is full a new
 *   particle recycles the **oldest** one. Randomness comes from a presentation RNG (core
 *   `createRng`, seeded per session by the host) and directions from the core's binary-angle
 *   tables, so a given seed and event sequence always draws the same particles — and the
 *   simulation's RNG streams are never touched (particles never affect determinism).
 * - **Space.** Particles live in **world pixels** like everything the sim draws (decision D26):
 *   events carry world positions and {@link ParticleSystem.sync} does the camera conversion at
 *   draw time (`round(x − camera.x)`, `round(y − camera.y) + PLAYFIELD_Y`), so a turret's
 *   explosion stays on the ground it stood on while the stage scrolls.
 * - **Drawing.** Two preallocated sprite sets of `capacity` sprites each — normal blending, then
 *   additive (`blendMode 'add'`, set once at creation: changing a sprite's blend mode makes Pixi
 *   rebuild its render group) — in one container the renderer puts on the `FX` layer, below the
 *   enemy bullets (shmup_feat.md §18 draw order: bullets stay readable over explosions).
 *
 * **Timing.** The host advances the pool by simulated ticks ({@link ParticleSystem.step}), never by
 * displayed frames, so particles freeze with a paused game. A particle emitted between two steps
 * first appears on the next step (at its spawn point, age 0), then moves once per tick.
 *
 * **Allocation.** Everything is created by {@link createParticleSystem} and
 * {@link ParticleSystem.setContent} (load time); `emit*`, `step` and `sync` only write numbers
 * and assign existing textures.
 *
 * **Implements.**
 * - shmup_feat.md §18 — explosions, particles (pooled, capped, additive, cosmetic RNG)
 * - shmup_feat.md §20 — juice: impact sparks, clinks, big explosions, bullet-cancel sparkles
 * - shmup_feat.md §22 — budgets (256 particles), presentation driven by sim events
 *
 * **Public API.** {@link FX_CONTENT_KIND}, {@link PARTICLE_CAPACITY}, {@link MAX_TRIGGERS_PER_CUE},
 * {@link MAX_PARTICLE_STEP}, {@link ParticleBlend}, {@link ParticleRange},
 * {@link ParticlePresetDef}, {@link FxTriggerEvent}, {@link FxTriggerDef}, {@link FxContent},
 * {@link EMPTY_FX_CONTENT}, {@link FxContentResult}, {@link parseFxContent},
 * {@link loadFxContent}, {@link fxSpriteNames}, {@link ParticleSystem},
 * {@link ParticleSystemOptions}, {@link createParticleSystem}.
 *
 * @module
 */
import {
  CONTENT_FORMAT_VERSION,
  FX_CUE_NAMES,
  PLAYFIELD_Y,
  SFX_CUE_NAMES,
  cosB,
  createRng,
  defineModule,
  s,
  sinB,
  type CameraView,
  type ContentFile,
  type ValidationIssue,
} from '@shmup/core';
import { Container, Sprite } from 'pixi.js';
import type { Atlas } from '../atlas/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'particles',
  status: 'implemented',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §20', 'shmup_feat.md §22'],
});

/** Content kind of particle-preset files (`content/fx/*.fx.json`). */
export const FX_CONTENT_KIND = 'fx';

/** Default particle pool size (shmup_feat.md §22 budget). */
export const PARTICLE_CAPACITY = 256;

/** Most presets one cue may fire (a cue's triggers beyond this are an issue). */
export const MAX_TRIGGERS_PER_CUE = 4;

/** Most ticks one {@link ParticleSystem.step} call advances (longer gaps are cut). */
export const MAX_PARTICLE_STEP = 60;

/** Most particles one burst may spawn (`count × intensity`). */
const MAX_BURST = 64;

/** Binary-angle units per degree (1024 units per turn). */
const UNITS_PER_DEGREE = 1024 / 360;

/** Blending of a preset's particles. */
export type ParticleBlend = 'add' | 'normal';

/** A closed range `[min, max]`. */
export interface ParticleRange {
  /** Smallest value. */
  readonly min: number;
  /** Largest value (≥ `min`). */
  readonly max: number;
}

/** One validated particle preset (defaults applied). */
export interface ParticlePresetDef {
  /** Preset id (`explosion.small`, `spark` …), unique across the `fx` files. */
  readonly id: string;
  /** Atlas sprite the particles show. */
  readonly sprite: string;
  /**
   * Frame indices played evenly over each particle's lifetime, or `null` = every frame of the
   * sprite in order.
   */
  readonly frames: readonly number[] | null;
  /** Particles per burst (multiplied by the event's intensity, at most 64 a burst). */
  readonly count: number;
  /** Launch speed in px/tick. */
  readonly speed: ParticleRange;
  /** Centre of the launch cone in degrees (0 = right, 90 = down). */
  readonly direction: number;
  /** Width of the launch cone in degrees (360 = every direction). */
  readonly spread: number;
  /** Added to the vertical speed every tick, px/tick² (positive = down). */
  readonly gravity: number;
  /** Fraction of the speed lost every tick (0 = none). */
  readonly drag: number;
  /** Lifetime in ticks (whole). */
  readonly lifetime: ParticleRange;
  /** Ticks a particle waits, invisible, before it appears (whole). */
  readonly delay: ParticleRange;
  /** Particles start at a random point within this many pixels of the burst's centre. */
  readonly radius: number;
  /** Blending. */
  readonly blend: ParticleBlend;
}

/** What kind of simulation event a trigger listens to. */
export type FxTriggerEvent = 'fx' | 'sfx';

/** One validated trigger: an event cue that spawns a preset. */
export interface FxTriggerDef {
  /** `'fx'` = a `SimEventKind.Particles` event, `'sfx'` = a `SimEventKind.Sfx` event. */
  readonly event: FxTriggerEvent;
  /** Cue name (`FX_CUE_NAMES` / `SFX_CUE_NAMES`). */
  readonly cue: string;
  /** Cue id (index into those tables). */
  readonly cueId: number;
  /** Preset id. */
  readonly preset: string;
  /** Preset index into {@link FxContent.presets}. */
  readonly presetIndex: number;
  /** Horizontal offset of the burst from the event's position, px. */
  readonly dx: number;
  /** Vertical offset, px. */
  readonly dy: number;
}

/** The validated contents of every `fx` file. */
export interface FxContent {
  /** Presets, in file (path) then document order. */
  readonly presets: readonly ParticlePresetDef[];
  /** Triggers, in file then document order. */
  readonly triggers: readonly FxTriggerDef[];
}

/** Content without presets or triggers (a renderer before `setContent`). */
export const EMPTY_FX_CONTENT: FxContent = Object.freeze({
  presets: Object.freeze([]),
  triggers: Object.freeze([]),
});

/** What {@link parseFxContent} and {@link loadFxContent} produce. */
export interface FxContentResult {
  /** The valid presets and triggers (bad entries dropped). */
  readonly content: FxContent;
  /** Every problem, as `<file>:<json path>` + message (empty = sound). */
  readonly issues: readonly ValidationIssue[];
}

/** A preset id: lower-case words joined by `.` or `-` (`explosion.small`, `bullet.cancel`). */
const PRESET_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** An atlas sprite name (`fx/explosion-small`). */
const SPRITE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/**
 * A `{ min, max }` range schema.
 *
 * @param value - Schema of both bounds.
 * @returns The schema.
 */
const range = (value: ReturnType<typeof s.num>) => s.object({ min: value, max: value });

/** One preset entry. */
const PRESET_SCHEMA = s.object(
  {
    id: s.str({ maxLength: 48, pattern: PRESET_ID }),
    sprite: s.str({ maxLength: 96, pattern: SPRITE_NAME }),
    frames: s.array(s.int({ min: 0, max: 255 }), { min: 1, max: 32 }),
    count: s.int({ min: 1, max: MAX_BURST }),
    speed: range(s.num({ min: 0, max: 16 })),
    direction: s.num({ min: -360, max: 360 }),
    spread: s.num({ min: 0, max: 360 }),
    gravity: s.num({ min: -1, max: 1 }),
    drag: s.num({ min: 0, max: 0.5 }),
    lifetime: range(s.int({ min: 1, max: 600 })),
    delay: range(s.int({ min: 0, max: 120 })),
    radius: s.num({ min: 0, max: 64 }),
    blend: s.enumOf(['add', 'normal'] as const),
  },
  { optional: ['frames', 'direction', 'spread', 'gravity', 'drag', 'delay', 'radius', 'blend'] },
);

/** One trigger entry. */
const TRIGGER_SCHEMA = s.object(
  {
    event: s.enumOf(['fx', 'sfx'] as const),
    cue: s.str({ maxLength: 40, pattern: /^[A-Za-z][A-Za-z0-9]*$/ }),
    preset: s.str({ maxLength: 48, pattern: PRESET_ID }),
    dx: s.num({ min: -64, max: 64 }),
    dy: s.num({ min: -64, max: 64 }),
  },
  { optional: ['dx', 'dy'] },
);

/** A whole `fx` file. */
const FILE_SCHEMA = s.object(
  {
    formatVersion: s.int({ min: CONTENT_FORMAT_VERSION, max: CONTENT_FORMAT_VERSION }),
    kind: s.enumOf([FX_CONTENT_KIND] as const),
    presets: s.array(PRESET_SCHEMA, { max: 64 }),
    triggers: s.array(TRIGGER_SCHEMA, { max: 128 }),
  },
  { optional: ['triggers'] },
);

/** A parsed trigger before its preset is resolved. */
interface PendingTrigger {
  /** Issue path of the trigger. */
  readonly path: string;
  /** The parsed entry. */
  readonly entry: {
    readonly event: FxTriggerEvent;
    readonly cue: string;
    readonly preset: string;
    readonly dx?: number;
    readonly dy?: number;
  };
}

/**
 * Prefixes a JSON path with its file, the way `loadContent` does.
 *
 * @param file - File path (`''` for a bare document).
 * @param path - JSON path inside the file.
 * @returns `<file>:<path>`, or whichever part is non-empty.
 */
const at = (file: string, path: string): string =>
  file === '' ? path : path === '' ? file : `${file}:${path}`;

/**
 * Validates one file into the running lists (presets first; triggers are resolved once every
 * file was read, so a trigger may name a preset of another file).
 *
 * @param data - The parsed JSON.
 * @param file - File path for issue paths.
 * @param presets - Presets so far (appended to).
 * @param ids - Preset ids so far → index.
 * @param pending - Triggers to resolve (appended to).
 * @param issues - Issues (appended to).
 */
function collectFile(
  data: unknown,
  file: string,
  presets: ParticlePresetDef[],
  ids: Map<string, number>,
  pending: PendingTrigger[],
  issues: ValidationIssue[],
): void {
  const local: ValidationIssue[] = [];
  const parsed = FILE_SCHEMA.parse(data, '', local);
  for (const issue of local) issues.push({ path: at(file, issue.path), message: issue.message });
  if (parsed === undefined) return;
  parsed.presets.forEach((preset, i) => {
    const path = at(file, `presets[${i}]`);
    let ok = true;
    for (const key of ['speed', 'lifetime', 'delay'] as const) {
      const bounds = preset[key];
      if (bounds !== undefined && bounds.min > bounds.max) {
        issues.push({ path: `${path}.${key}`, message: 'min must not be greater than max' });
        ok = false;
      }
    }
    const first = ids.get(preset.id);
    if (first !== undefined) {
      issues.push({ path: `${path}.id`, message: `duplicate preset id "${preset.id}"` });
      ok = false;
    }
    if (!ok) return;
    ids.set(preset.id, presets.length);
    presets.push(
      Object.freeze({
        id: preset.id,
        sprite: preset.sprite,
        frames: preset.frames === undefined ? null : Object.freeze(preset.frames.slice()),
        count: preset.count,
        speed: Object.freeze({ min: preset.speed.min, max: preset.speed.max }),
        direction: preset.direction ?? 0,
        spread: preset.spread ?? 360,
        gravity: preset.gravity ?? 0,
        drag: preset.drag ?? 0,
        lifetime: Object.freeze({ min: preset.lifetime.min, max: preset.lifetime.max }),
        delay: Object.freeze({ min: preset.delay?.min ?? 0, max: preset.delay?.max ?? 0 }),
        radius: preset.radius ?? 0,
        blend: preset.blend ?? 'add',
      }),
    );
  });
  (parsed.triggers ?? []).forEach((entry, i) => {
    pending.push({ path: at(file, `triggers[${i}]`), entry });
  });
}

/**
 * Resolves the pending triggers against the presets and the cue tables.
 *
 * @param pending - Parsed triggers.
 * @param ids - Preset ids → index.
 * @param issues - Issues (appended to).
 * @returns The valid triggers.
 */
function resolveTriggers(
  pending: readonly PendingTrigger[],
  ids: ReadonlyMap<string, number>,
  issues: ValidationIssue[],
): FxTriggerDef[] {
  const triggers: FxTriggerDef[] = [];
  const perCue = new Map<string, number>();
  for (const { path, entry } of pending) {
    const names = entry.event === 'fx' ? FX_CUE_NAMES : SFX_CUE_NAMES;
    const cueId = names.indexOf(entry.cue);
    const presetIndex = ids.get(entry.preset);
    let ok = true;
    if (cueId < 0) {
      issues.push({
        path: `${path}.cue`,
        message: `unknown ${entry.event === 'fx' ? 'FX' : 'SFX'} cue "${entry.cue}"`,
      });
      ok = false;
    }
    if (presetIndex === undefined) {
      issues.push({ path: `${path}.preset`, message: `unknown preset "${entry.preset}"` });
      ok = false;
    }
    if (!ok || presetIndex === undefined) continue;
    const key = `${entry.event}:${cueId}`;
    const used = perCue.get(key) ?? 0;
    if (used >= MAX_TRIGGERS_PER_CUE) {
      issues.push({
        path,
        message: `cue "${entry.cue}" already has ${MAX_TRIGGERS_PER_CUE} presets`,
      });
      continue;
    }
    perCue.set(key, used + 1);
    triggers.push(
      Object.freeze({
        event: entry.event,
        cue: entry.cue,
        cueId,
        preset: entry.preset,
        presetIndex,
        dx: entry.dx ?? 0,
        dy: entry.dy ?? 0,
      }),
    );
  }
  return triggers;
}

/**
 * Validates one `fx` document (a README sample, a single file).
 *
 * @param data - The parsed JSON (`{ formatVersion, kind: 'fx', presets, triggers? }`).
 * @param path - File path used to prefix issue paths (`''` = bare JSON paths).
 * @returns The presets, the triggers and every issue. Never throws for bad data.
 *
 * @example
 * ```ts
 * const { content, issues } = parseFxContent(json, 'fx/particles.fx.json');
 * content.presets.map((preset) => preset.id); // → ['explosion.small', …]
 * ```
 */
export function parseFxContent(data: unknown, path = ''): FxContentResult {
  return loadFxContent([{ path, data }]);
}

/**
 * Validates every `fx` content file — the owner of that kind (plan §3.5).
 *
 * @remarks
 * Files are read in ascending path order (the result does not depend on the order the host lists
 * them). A file that fails the schema contributes nothing; a preset with `min > max` in a range
 * or a duplicate id (the first definition wins) is dropped; a trigger naming an unknown cue or
 * preset, or a fifth preset for one cue, is dropped — each with an issue. Sprite names and frame
 * indices are checked against the atlas by the particle system (a missing sprite draws
 * `ui/missing`) and by `pnpm content:check` ({@link fxSpriteNames}).
 *
 * @param files - The content files of kind `fx`.
 * @returns The merged content and every issue. Never throws for bad data.
 *
 * @example
 * ```ts
 * // The shell's loader hands an owner exactly the files of its kind.
 * const { content, issues } = loadFxContent(fxFiles);
 * renderer.setFxContent(content);
 * ```
 */
export function loadFxContent(files: readonly ContentFile[]): FxContentResult {
  const presets: ParticlePresetDef[] = [];
  const ids = new Map<string, number>();
  const pending: PendingTrigger[] = [];
  const issues: ValidationIssue[] = [];
  const sorted = files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of sorted) collectFile(file.data, file.path, presets, ids, pending, issues);
  const triggers = resolveTriggers(pending, ids, issues);
  return {
    content: Object.freeze({
      presets: Object.freeze(presets),
      triggers: Object.freeze(triggers),
    }),
    issues,
  };
}

/**
 * The sprite names an `fx` content uses (for the atlas check of `pnpm content:check`).
 *
 * @param content - Validated content.
 * @returns Distinct sprite names, in preset order.
 */
export function fxSpriteNames(content: FxContent): string[] {
  const names: string[] = [];
  for (const preset of content.presets) {
    if (names.indexOf(preset.sprite) < 0) names.push(preset.sprite);
  }
  return names;
}

/** Options of {@link createParticleSystem}. */
export interface ParticleSystemOptions {
  /** The atlas the preset sprites come from. */
  readonly atlas: Atlas;
  /** Pool size (default {@link PARTICLE_CAPACITY}). */
  readonly capacity?: number;
  /** Seed of the presentation RNG (default 1; hosts pass one per session). */
  readonly seed?: number;
  /** Screen row of world row 0 at camera y 0 (default `PLAYFIELD_Y`). */
  readonly offsetY?: number;
  /** Presets and triggers to start with (default {@link EMPTY_FX_CONTENT}). */
  readonly content?: FxContent;
}

/** The pooled particle system of one renderer. */
export interface ParticleSystem {
  /** Holds the normal-blend sprites, then the additive ones (add it to the `FX` layer). */
  readonly container: Container;
  /** Pool size. */
  readonly capacity: number;
  /** The presets and triggers in use. */
  readonly content: FxContent;
  /** Particles alive (waiting ones included). */
  readonly liveCount: number;
  /** Particles drawn by the last {@link ParticleSystem.sync}. */
  readonly visibleCount: number;
  /** Particles overwritten because the pool was full, since the last {@link ParticleSystem.clear}. */
  readonly recycled: number;
  /**
   * Replaces the presets and triggers (load time: resolves the sprite frames against the atlas,
   * builds the cue tables) and clears every live particle.
   *
   * @param content - Validated content ({@link loadFxContent}).
   */
  setContent(content: FxContent): void;
  /**
   * Index of a preset.
   *
   * @param id - Preset id.
   * @returns The index into `content.presets`, or -1.
   */
  presetIndex(id: string): number;
  /**
   * Spawns one burst of a preset. Never allocates.
   *
   * @remarks
   * `count × intensity` particles (intensity clamped to 1…4 and floored, NaN = 1; at most 64 a
   * burst). Each takes a free slot, or recycles the oldest live particle when the pool is full.
   * An unknown (or fractional) preset index spawns nothing.
   *
   * @param preset - Preset index.
   * @param x - World x of the burst's centre.
   * @param y - World y of the burst's centre.
   * @param intensity - Burst multiplier (events push 1).
   * @returns Particles spawned.
   */
  emit(preset: number, x: number, y: number, intensity: number): number;
  /**
   * Spawns the presets bound to an FX cue (a `SimEventKind.Particles` event). Never allocates.
   *
   * @param cue - `FX_CUES` id.
   * @param x - World x.
   * @param y - World y.
   * @param intensity - The event's `param`.
   * @returns Particles spawned (0 for a cue without triggers).
   */
  emitFxCue(cue: number, x: number, y: number, intensity: number): number;
  /**
   * Spawns the presets bound to an SFX cue (a `SimEventKind.Sfx` event — hits, clinks, pickups,
   * shots). Never allocates.
   *
   * @param cue - `SFX_CUES` id.
   * @param x - World x.
   * @param y - World y.
   * @returns Particles spawned (0 for a cue without triggers — most of them).
   */
  emitSfxCue(cue: number, x: number, y: number): number;
  /**
   * Advances every particle by simulated ticks (waiting ones count down their delay; the others
   * age, move, feel gravity and drag, and die at the end of their lifetime). Never allocates.
   *
   * @param ticks - Ticks to advance (floored; ≤ 0 does nothing; more than
   *   {@link MAX_PARTICLE_STEP} are cut).
   */
  step(ticks: number): void;
  /**
   * Draws the live particles (camera-converted, whole pixels) and hides the unused sprites. Never
   * allocates.
   *
   * @param camera - The world camera (`{ x: 0, y: 0 }` for scenes without one).
   */
  sync(camera: CameraView): void;
  /** Removes every particle (sprites hidden at the next sync) and resets `recycled`. */
  clear(): void;
  /** Destroys the sprites and the container (textures belong to the atlas). */
  destroy(): void;
}

/**
 * Creates the particle system (load time: every sprite is created here, hidden).
 *
 * @param options - Atlas, capacity, seed, y offset and the initial content.
 * @returns The system.
 * @throws {RangeError} When `capacity` is not a positive integer.
 *
 * @example
 * ```ts
 * const particles = createParticleSystem({ atlas, seed: game.config.seed, content });
 * layers.layers[LayerId.Fx].addChild(particles.container);
 * particles.emitFxCue(FX_CUES.ExplosionSmall, 200, 90, 1); // from a drained event
 * particles.step(1); // once per simulated tick
 * particles.sync(world.camera); // every frame
 * ```
 */
export function createParticleSystem(options: ParticleSystemOptions): ParticleSystem {
  const { atlas } = options;
  const capacity = options.capacity ?? PARTICLE_CAPACITY;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('particle capacity must be a positive integer');
  }
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  // The presentation RNG: the core's sfc32 seeded with `seed`, stepped here on a typed-array
  // state — words kept in closure variables would be boxed (they leave the Smi range), and a
  // 32-bit result returned from a call is boxed too, so draws return 16 bits.
  const rngState = new Int32Array(4);
  {
    const words = new Uint32Array(4);
    createRng(options.seed ?? 1).getStateInto(words);
    for (let i = 0; i < 4; i++) rngState[i] = words[i] | 0;
  }

  /**
   * One sfc32 step of the presentation RNG.
   *
   * @returns 16 random bits, 0…65535.
   */
  const rand16 = (): number => {
    const a = rngState[0];
    const b = rngState[1];
    const c = rngState[2];
    const d = rngState[3];
    const t = (((a + b) | 0) + d) | 0;
    rngState[3] = (d + 1) | 0;
    rngState[0] = b ^ (b >>> 9);
    rngState[1] = (c + (c << 3)) | 0;
    rngState[2] = (((c << 21) | (c >>> 11)) + t) | 0;
    return t >>> 16;
  };

  const container = new Container({ label: 'particles' });
  const normalGroup = new Container({ label: 'particles-normal' });
  const addGroup = new Container({ label: 'particles-add' });
  container.addChild(normalGroup, addGroup);
  const normalSprites: Sprite[] = [];
  const addSprites: Sprite[] = [];
  for (let i = 0; i < capacity; i++) {
    const normal = new Sprite();
    normal.visible = false;
    normalSprites.push(normal);
    normalGroup.addChild(normal);
    const add = new Sprite();
    add.blendMode = 'add';
    add.visible = false;
    addSprites.push(add);
    addGroup.addChild(add);
  }

  // The pool: packed live particles in [0, live).
  const px = new Float64Array(capacity);
  const py = new Float64Array(capacity);
  const pvx = new Float64Array(capacity);
  const pvy = new Float64Array(capacity);
  const age = new Int32Array(capacity);
  const life = new Int32Array(capacity);
  const kind = new Int16Array(capacity);
  const serial = new Float64Array(capacity);
  let live = 0;
  let spawned = 0;
  let recycled = 0;
  let visible = 0;
  let usedNormal = 0;
  let usedAdd = 0;

  // Compiled presets (typed arrays, rebuilt by setContent).
  let content: FxContent = EMPTY_FX_CONTENT;
  let presetIds = new Map<string, number>();
  let frameIds = new Int32Array(0);
  let frameStart = new Int32Array(0);
  let frameCount = new Int32Array(0);
  let pCount = new Int32Array(0);
  let pSpeedMin = new Float64Array(0);
  let pSpeedSpan = new Float64Array(0);
  let pDir = new Int32Array(0);
  let pSpread = new Int32Array(0);
  let pGravity = new Float64Array(0);
  let pKeep = new Float64Array(0);
  let pLifeMin = new Int32Array(0);
  let pLifeSpan = new Int32Array(0);
  let pDelayMin = new Int32Array(0);
  let pDelaySpan = new Int32Array(0);
  let pRadius = new Float64Array(0);
  let pAdd = new Uint8Array(0);
  // Cue tables: MAX_TRIGGERS_PER_CUE preset slots per cue (-1 = none) and their offsets.
  let fxTable: Int16Array = new Int16Array(0);
  let fxDx: Float64Array = new Float64Array(0);
  let fxDy: Float64Array = new Float64Array(0);
  let sfxTable: Int16Array = new Int16Array(0);
  let sfxDx: Float64Array = new Float64Array(0);
  let sfxDy: Float64Array = new Float64Array(0);

  /**
   * Builds one cue table from the triggers of an event kind.
   *
   * @param event - `'fx'` or `'sfx'`.
   * @param cues - Number of cues of that kind.
   * @returns The preset slots and offsets.
   */
  const buildTable = (
    event: FxTriggerEvent,
    cues: number,
  ): { table: Int16Array; dx: Float64Array; dy: Float64Array } => {
    const table = new Int16Array(cues * MAX_TRIGGERS_PER_CUE).fill(-1);
    const dx = new Float64Array(cues * MAX_TRIGGERS_PER_CUE);
    const dy = new Float64Array(cues * MAX_TRIGGERS_PER_CUE);
    for (const trigger of content.triggers) {
      if (trigger.event !== event || trigger.cueId < 0 || trigger.cueId >= cues) continue;
      const base = trigger.cueId * MAX_TRIGGERS_PER_CUE;
      for (let k = 0; k < MAX_TRIGGERS_PER_CUE; k++) {
        if (table[base + k] >= 0) continue;
        table[base + k] = trigger.presetIndex;
        dx[base + k] = trigger.dx;
        dy[base + k] = trigger.dy;
        break;
      }
    }
    return { table, dx, dy };
  };

  /**
   * Compiles `content` into the typed preset and cue tables (load time).
   */
  const compile = (): void => {
    const presets = content.presets;
    const n = presets.length;
    presetIds = new Map();
    const frames: number[] = [];
    frameStart = new Int32Array(n);
    frameCount = new Int32Array(n);
    pCount = new Int32Array(n);
    pSpeedMin = new Float64Array(n);
    pSpeedSpan = new Float64Array(n);
    pDir = new Int32Array(n);
    pSpread = new Int32Array(n);
    pGravity = new Float64Array(n);
    pKeep = new Float64Array(n);
    pLifeMin = new Int32Array(n);
    pLifeSpan = new Int32Array(n);
    pDelayMin = new Int32Array(n);
    pDelaySpan = new Int32Array(n);
    pRadius = new Float64Array(n);
    pAdd = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      const preset = presets[p];
      if (!presetIds.has(preset.id)) presetIds.set(preset.id, p);
      const base = atlas.resolveSpriteTable([preset.sprite])[0];
      const available = base === atlas.missingFrame ? 1 : atlas.framesLeft[base];
      frameStart[p] = frames.length;
      if (preset.frames === null) {
        for (let k = 0; k < available; k++) frames.push(base + k);
      } else {
        for (const index of preset.frames) {
          frames.push(index >= 0 && index < available ? base + index : atlas.missingFrame);
        }
      }
      frameCount[p] = frames.length - frameStart[p];
      pCount[p] = preset.count;
      pSpeedMin[p] = preset.speed.min;
      pSpeedSpan[p] = preset.speed.max - preset.speed.min;
      pDir[p] = Math.round(preset.direction * UNITS_PER_DEGREE);
      pSpread[p] = Math.round(preset.spread * UNITS_PER_DEGREE);
      pGravity[p] = preset.gravity;
      pKeep[p] = 1 - preset.drag;
      pLifeMin[p] = preset.lifetime.min;
      pLifeSpan[p] = preset.lifetime.max - preset.lifetime.min;
      pDelayMin[p] = preset.delay.min;
      pDelaySpan[p] = preset.delay.max - preset.delay.min;
      pRadius[p] = preset.radius;
      pAdd[p] = preset.blend === 'add' ? 1 : 0;
    }
    frameIds = Int32Array.from(frames);
    const fx = buildTable('fx', FX_CUE_NAMES.length);
    fxTable = fx.table;
    fxDx = fx.dx;
    fxDy = fx.dy;
    const sfx = buildTable('sfx', SFX_CUE_NAMES.length);
    sfxTable = sfx.table;
    sfxDx = sfx.dx;
    sfxDy = sfx.dy;
  };

  /**
   * Removes particle `i` by moving the last live particle into its slot.
   *
   * @param i - Slot of a live particle.
   */
  const remove = (i: number): void => {
    const last = --live;
    if (i === last) return;
    px[i] = px[last];
    py[i] = py[last];
    pvx[i] = pvx[last];
    pvy[i] = pvy[last];
    age[i] = age[last];
    life[i] = life[last];
    kind[i] = kind[last];
    serial[i] = serial[last];
  };

  /**
   * A slot for a new particle: the next free one, or the oldest live particle's.
   *
   * @returns The slot.
   */
  const takeSlot = (): number => {
    if (live < capacity) return live++;
    let oldest = 0;
    for (let i = 1; i < live; i++) if (serial[i] < serial[oldest]) oldest = i;
    recycled++;
    return oldest;
  };

  /**
   * Spawns one particle of preset `p` around `(x, y)`.
   *
   * @param p - Preset index (valid).
   * @param x - World x of the burst's centre.
   * @param y - World y of the burst's centre.
   */
  const spawn = (p: number, x: number, y: number): void => {
    const i = takeSlot();
    // No branch on the radius: merging the caller's (possibly small-integer) x with a fractional
    // sum would make V8 box the result — an allocation per particle.
    const a = rand16() & 1023;
    const d = (pRadius[p] * rand16()) / 65536;
    const spread = pSpread[p];
    const turn = spread > 0 ? (rand16() * spread) >>> 16 : 0;
    const angle = (pDir[p] - (spread >> 1) + turn) & 1023;
    const speed = pSpeedMin[p] + (pSpeedSpan[p] * rand16()) / 65536;
    px[i] = x + cosB(a) * d;
    py[i] = y + sinB(a) * d;
    pvx[i] = cosB(angle) * speed;
    pvy[i] = sinB(angle) * speed;
    const lifeSpan = pLifeSpan[p];
    life[i] = pLifeMin[p] + (lifeSpan > 0 ? (rand16() * (lifeSpan + 1)) >>> 16 : 0);
    // Age < 0 = waiting: the first step reveals it (age 0) at its spawn point.
    const delaySpan = pDelaySpan[p];
    const delay = pDelayMin[p] + (delaySpan > 0 ? (rand16() * (delaySpan + 1)) >>> 16 : 0);
    age[i] = -1 - delay;
    kind[i] = p;
    serial[i] = spawned++;
  };

  /**
   * See {@link ParticleSystem.emit}.
   *
   * @param p - Preset index.
   * @param x - World x.
   * @param y - World y.
   * @param intensity - Multiplier.
   * @returns Particles spawned.
   */
  const emit = (p: number, x: number, y: number, intensity: number): number => {
    // A fractional index would read `pCount[0.5]` (undefined) and return NaN.
    if (!(p >= 0 && p < pCount.length) || p % 1 !== 0) return 0;
    const times = intensity >= 4 ? 4 : intensity >= 1 ? Math.floor(intensity) : 1;
    let n = pCount[p] * times;
    if (n > MAX_BURST) n = MAX_BURST;
    for (let k = 0; k < n; k++) spawn(p | 0, x, y);
    return n;
  };

  /**
   * Spawns every preset of one cue slot row.
   *
   * @param table - Preset slots.
   * @param dx - X offsets.
   * @param dy - Y offsets.
   * @param cue - Cue id.
   * @param x - World x.
   * @param y - World y.
   * @param intensity - Multiplier.
   * @returns Particles spawned.
   */
  const emitRow = (
    table: Int16Array,
    dx: Float64Array,
    dy: Float64Array,
    cue: number,
    x: number,
    y: number,
    intensity: number,
  ): number => {
    if (!(cue >= 0) || cue % 1 !== 0) return 0;
    const base = cue * MAX_TRIGGERS_PER_CUE;
    if (base >= table.length) return 0;
    let spawnedNow = 0;
    for (let k = 0; k < MAX_TRIGGERS_PER_CUE; k++) {
      const p = table[base + k];
      if (p < 0) break;
      spawnedNow += emit(p, x + dx[base + k], y + dy[base + k], intensity);
    }
    return spawnedNow;
  };

  if (options.content !== undefined) {
    content = options.content;
  }
  compile();

  return {
    container,
    capacity,
    /** See {@link ParticleSystem.content}. */
    get content(): FxContent {
      return content;
    },
    /** See {@link ParticleSystem.liveCount}. */
    get liveCount(): number {
      return live;
    },
    /** See {@link ParticleSystem.visibleCount}. */
    get visibleCount(): number {
      return visible;
    },
    /** See {@link ParticleSystem.recycled}. */
    get recycled(): number {
      return recycled;
    },
    setContent(next) {
      content = next;
      compile();
      live = 0;
      recycled = 0;
    },
    presetIndex(id) {
      return presetIds.get(id) ?? -1;
    },
    emit,
    emitFxCue(cue, x, y, intensity) {
      return emitRow(fxTable, fxDx, fxDy, cue, x, y, intensity);
    },
    emitSfxCue(cue, x, y) {
      return emitRow(sfxTable, sfxDx, sfxDy, cue, x, y, 1);
    },
    step(ticks) {
      let n = ticks >= MAX_PARTICLE_STEP ? MAX_PARTICLE_STEP : ticks > 0 ? Math.floor(ticks) : 0;
      for (; n > 0; n--) {
        let i = 0;
        while (i < live) {
          const a = age[i];
          if (a < 0) {
            age[i] = a + 1;
            i++;
            continue;
          }
          if (a + 1 >= life[i]) {
            remove(i);
            continue;
          }
          age[i] = a + 1;
          const p = kind[i];
          const keep = pKeep[p];
          px[i] += pvx[i];
          py[i] += pvy[i];
          pvx[i] *= keep;
          pvy[i] = (pvy[i] + pGravity[p]) * keep;
          i++;
        }
      }
    },
    sync(camera) {
      const camX = camera.x;
      const camY = camera.y;
      let normal = 0;
      let add = 0;
      for (let i = 0; i < live; i++) {
        const a = age[i];
        if (a < 0) continue;
        const p = kind[i];
        const count = frameCount[p];
        if (count <= 0) continue;
        const frameId = frameIds[frameStart[p] + (((a * count) / life[i]) | 0)];
        const sprite = pAdd[p] === 1 ? addSprites[add++] : normalSprites[normal++];
        sprite.texture = atlas.textures[frameId];
        // `| 0`: `Math.round` may return −0, which V8 stores as a heap number.
        sprite.x = (Math.round(px[i] - camX) - atlas.anchorX[frameId]) | 0;
        sprite.y = (Math.round(py[i] - camY) + offsetY - atlas.anchorY[frameId]) | 0;
        sprite.visible = true;
      }
      for (let i = normal; i < usedNormal; i++) normalSprites[i].visible = false;
      for (let i = add; i < usedAdd; i++) addSprites[i].visible = false;
      usedNormal = normal;
      usedAdd = add;
      visible = normal + add;
    },
    clear() {
      live = 0;
      recycled = 0;
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}
