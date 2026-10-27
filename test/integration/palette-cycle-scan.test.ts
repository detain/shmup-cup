/**
 * The palette-cycle scan of the art bible v2 §4.4 on the shipped atlas (R3-03.V3, decision
 * W5-12: fail, not warn). Palette cycling recolours every pixel matching a ramp colour (the
 * shader matches with every channel within 1.5/255), so:
 *
 * 1. per stage with `cycles`: every pixel of the art on a cycled layer is an exact ramp colour
 *    of that layer's cycle, or at Chebyshev distance ≥ 3 (twice the tolerance, max over
 *    channels) from every ramp colour of that layer;
 * 2. project-wide: every sprite of the atlas keeps the same margin from **all nine reserved
 *    ramps** — the distinct `cycles` colour lists of the shipped stages, read from the stages
 *    and named by the stage that cycles them exactly as the bible's ramp table does — except a
 *    ramp's own cycle art against its own ramp (rule 1 checks that pair) and the bible's
 *    exemption list, pinned below. An exemption that no longer trips fails: the list cannot rot.
 *    The binding check requires each ramp's cycle art to sit on a cycled layer of one of its
 *    stages, exactly as the `CYCLE_ART` mapping pins it below.
 * 3. a synthetic fixture backdrop passes the cycled-layer scan, and the same with one pixel
 *    2/255 off fails it — the scan really measures the margin.
 *
 * Reads `content/stages/*.stage.json` (skipping `example.*`, a format sample whose terrain
 * cycle is no reserved ramp) and `buildAtlas()` in memory; writes nothing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createImage, setPixel, type Image } from '../../scripts/assets/image.mjs';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';

/** A built atlas (the shipped scale). */
type Atlas = ReturnType<typeof buildAtlas>;

/** One stage's palette-cycle entry. */
interface CycleEntry {
  layer: string;
  colors: string[];
}

/** The parsed slice of a shipped stage file. */
interface StageFile {
  cycles?: CycleEntry[];
  parallax?: { layer: string; sprite: string }[];
}

/** The bible §4.4 ramp table: every reserved ramp, named, by the stages that cycle it. */
const RAMPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  SEA: ['raster-range'],
  BRINE: ['zone-b', 'brine-grotto'],
  DUNE: ['zone-c'],
  MAGMA: ['zone-d'],
  STORM: ['zone-e'],
  VAULT: ['zone-f'],
  PRISM: ['zone-g', 'glimmer-cache'],
  CITADEL: ['zone-h'],
  ABYSS: ['zone-i'],
});

/** The bible ramp table's "Cycle art" column: the sprites each ramp was painted for — rule 2
 * excepts them against their own ramp, because rule 1 checks that pair (exact is allowed
 * there). R5-04.S5a: MAGMA gained `bg/magma-chimney` — the stage now cycles it on its mid layer,
 * so the S2-era exemption retired to the mapping (the all-four-colours scan keeps its teeth). */
const CYCLE_ART: Readonly<Record<string, readonly string[]>> = Object.freeze({
  SEA: ['bg/sea-swell'],
  BRINE: ['bg/brine-sea'],
  DUNE: ['bg/dune-blaze'],
  MAGMA: ['bg/magma-lava', 'bg/magma-chimney'],
  STORM: ['bg/storm-clouds'],
  VAULT: ['bg/vault-membrane'],
  PRISM: ['bg/prism-facets'],
  CITADEL: ['bg/citadel-wall'],
  ABYSS: ['bg/abyss-murk'],
});

/** The bible §4.4 exemption list (v1 and interim art that breaks the project-wide margin on a
 * ramp it sits on no layer cycling): one line per sprite; later subtasks delete the line when
 * they replace the sprite, and an entry that no longer trips fails the scan. */
const EXEMPT: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // w15-REING123: the shield-plate's STORM line went — the gen12 ingested plate is native art
  // that keeps the STORM margin on its own (its lavender interim inks are gone), and the list
  // cannot rot (same class as the REING89 hopper line above).
  STORM: ['enemies/facet-turret', 'enemies/prism-cube', 'enemies/prism-lens', 'bg/storm-flash'],
  DUNE: ['bosses/widow-head'],
  VAULT: ['bosses/regent-eye'],
  // w15-REING89: the hopper's PRISM line went — its native gen8 palette keeps the margin
  // on its own, and the list cannot rot (the clearReserved pass moves near-ramp colours
  // ≥ 3/255 Chebyshev from every reserved step by construction).
  // w15-C: the gold `capsule-power` flavor pill speaks capsule-bonus's colour language on
  // purpose (the shared gold band #f8d878) — the same no-cycling-layer exemption as its sibling.
  // w15-REING7: the gen7 pill landed as native art that keeps the CITADEL margin, so only the
  // bonus jewel still speaks the shared gold band (the list cannot rot).
  CITADEL: ['items/capsule-bonus'],
  ABYSS: [
    'bg/brine-sea',
    'bosses/king-lure',
    'bosses/ark-turret',
    'enemies/lumen-mote',
    'enemies/abyss-turret',
  ],
  BRINE: ['bg/brine-nebula', 'bg/abyss-murk'],
});

/** The margin the bible asks for: twice the shader's 1.5/255 tolerance, Chebyshev (max over
 * channels). A pixel trips when its distance to a ramp colour is below it. */
const MARGIN = 3;

/** The stages directory. */
const STAGE_DIR = fileURLToPath(new URL('../../content/stages', import.meta.url));

/** The shipped stage files that carry `cycles`, by base name (the example is a format sample). */
function readCycledStages(): Map<string, StageFile> {
  const stages = new Map<string, StageFile>();
  for (const file of readdirSync(STAGE_DIR).filter(
    (f) => f.endsWith('.stage.json') && !f.startsWith('example.'),
  )) {
    const stage = JSON.parse(readFileSync(join(STAGE_DIR, file), 'utf8')) as StageFile;
    if (stage.cycles !== undefined && stage.cycles.length > 0) {
      stages.set(file.replace('.stage.json', ''), stage);
    }
  }
  return stages;
}

const cycledStages = readCycledStages();

/** A ramp as parsed channels. */
type Rgb = readonly [number, number, number];

/**
 * Parses a `#rrggbb` colour.
 *
 * @param hex - The colour.
 * @returns The channels.
 */
function rgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Chebyshev distance of two colours (max over channels — what the cycle shader compares).
 *
 * @param a - One colour.
 * @param b - The other.
 * @returns The distance.
 */
function chebyshev(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** The reserved ramps: name → the colour list the stages cycle, read from the stage files. */
function readRamps(): Map<string, Rgb[]> {
  const byStages = new Map<string, string[]>(); // colour-list key → stage names
  for (const [stage, file] of cycledStages) {
    const lists = new Set((file.cycles ?? []).map((c) => [...c.colors].sort().join(',')));
    for (const key of lists) {
      const seen = byStages.get(key) ?? [];
      seen.push(stage);
      byStages.set(key, seen.sort());
    }
  }
  const ramps = new Map<string, Rgb[]>();
  for (const ramp of Object.keys(RAMPS)) {
    const expected = [...RAMPS[ramp]].sort().join(',');
    const entry = [...byStages].find(([, stages]) => [...stages].sort().join(',') === expected);
    expect(
      entry,
      `no colour list cycled exactly by the ${ramp} stages (${expected})`,
    ).toBeDefined();
    byStages.delete(entry![0]);
    ramps.set(
      ramp,
      entry![0].split(',').map((hex) => rgb(hex)),
    );
  }
  expect([...byStages.keys()], 'a shipped stage cycles colours no reserved ramp names').toEqual([]);
  return ramps;
}

const rampColors = readRamps();

/**
 * The pixels of one atlas frame, cut out of its page.
 *
 * @param atlas - The atlas.
 * @param name - Frame name (`<sprite>#<i>`).
 * @returns The frame's pixels.
 */
function framePixels(atlas: Atlas, name: string): Image {
  const f = atlas.manifest.frames[name];
  const page = atlas.pages[f.p].image;
  const out = createImage(f.w, f.h);
  for (let y = 0; y < f.h; y++) {
    const from = ((f.y + y) * page.width + f.x) * 4;
    out.data.set(page.data.subarray(from, from + f.w * 4), y * f.w * 4);
  }
  return out;
}

/**
 * Rule 1's predicate on raw frames: every opaque pixel is an exact ramp colour, or at Chebyshev
 * distance ≥ {@link MARGIN} from every one of them.
 *
 * @param frames - The frames to scan.
 * @param ramp - The layer's ramp.
 * @param where - Label for the violations.
 * @param at - Frame-name source (index k → the name to report).
 * @returns One string per violating pixel.
 */
function cycledLayerViolations(
  frames: Image[],
  ramp: Rgb[],
  where: string,
  at: (k: number) => string,
): string[] {
  const issues: string[] = [];
  frames.forEach((frame, k) => {
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const p: Rgb = [d[i], d[i + 1], d[i + 2]];
      let nearest = Infinity;
      for (const colour of ramp) {
        const e = chebyshev(p, colour);
        if (e === 0) {
          nearest = 0;
          break;
        }
        if (e < nearest) nearest = e;
      }
      if (nearest !== 0 && nearest < MARGIN) {
        const x = (i / 4) % frame.width;
        const y = Math.floor(i / 4 / frame.width);
        issues.push(
          `${at(k)} (${x},${y}) #${p.map((c) => c.toString(16).padStart(2, '0')).join('')} is ${nearest}/255 from the ${where} ramp (exact or ≥ ${MARGIN} only)`,
        );
      }
    }
  });
  return issues;
}

/**
 * Rule 2's predicate: the sprite trips the ramp when any opaque pixel is nearer than
 * {@link MARGIN} to a ramp colour — the exact colour included (only a ramp's own cycle art may
 * carry it, and rule 1 checks that).
 *
 * @param atlas - The shipped atlas.
 * @param name - The sprite to scan.
 * @param rampName - The ramp to scan against.
 * @returns A report of the first trip, or `null` when the sprite keeps the margin.
 */
function spriteTrip(atlas: Atlas, name: string, rampName: string): string | null {
  const ramp = rampColors.get(rampName)!;
  for (const frameName of atlas.manifest.sprites[name].frames) {
    const frame = framePixels(atlas, frameName);
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const p: Rgb = [d[i], d[i + 1], d[i + 2]];
      for (const colour of ramp) {
        const e = chebyshev(p, colour);
        if (e < MARGIN) {
          const x = (i / 4) % frame.width;
          const y = Math.floor(i / 4 / frame.width);
          return `${frameName} (${x},${y}) #${p.map((c) => c.toString(16).padStart(2, '0')).join('')} vs ${rampName} #${[...colour].map((c) => c.toString(16).padStart(2, '0')).join('')} at distance ${e}`;
        }
      }
    }
  }
  return null;
}

const atlas = buildAtlas();

describe('test/integration/palette-cycle-scan — the art bible §4.4 on the shipped atlas (R3-03.V3)', () => {
  it('names exactly the nine reserved ramps by the stages that cycle them', () => {
    expect(rampColors.size).toBe(9);
    for (const [ramp, colours] of rampColors) {
      expect(colours.length, ramp).toBeLessThanOrEqual(8); // a layer cycles at most 8 colours
      for (let a = 0; a < colours.length; a++) {
        for (let b = a + 1; b < colours.length; b++) {
          expect(chebyshev(colours[a], colours[b]) >= 2, `${ramp} ${a}/${b}`).toBe(true);
        }
      }
    }
    const expected = Object.values(RAMPS).flat();
    expect([...cycledStages.keys()].sort()).toEqual([...expected].sort());
    for (const [ramp, sprites] of Object.entries(CYCLE_ART)) {
      for (const sprite of sprites) {
        expect(atlas.manifest.sprites[sprite], `cycle art of ${ramp}`).toBeDefined();
        // Bind the rule-2 own-ramp skip (SRV2-N1): the pin is only justified while the sprite sits on
        // a cycled layer of one of the ramp's stages — else rule 2 silently skips it against its ramp
        // while rule 1 no longer sees it. The stage data is already loaded above.
        const bound = RAMPS[ramp].some((stage) => {
          const file = cycledStages.get(stage);
          if (file === undefined) return false;
          const layers = new Set((file.cycles ?? []).map((c) => c.layer));
          return (file.parallax ?? []).some((p) => layers.has(p.layer) && p.sprite === sprite);
        });
        expect(bound, `cycle art ${sprite} bound to a cycled layer of ${ramp}`).toBe(true);
      }
    }
  });

  it('rule 1: every pixel on a cycled layer is exact ramp or ≥ 3/255 from it', () => {
    const issues: string[] = [];
    for (const [stage, file] of cycledStages) {
      for (const cycle of file.cycles ?? []) {
        const colours = cycle.colors.map(rgb);
        const sprites = new Set(
          (file.parallax ?? []).filter((p) => p.layer === cycle.layer).map((p) => p.sprite),
        );
        expect(sprites.size, `${stage} cycles layer ${cycle.layer}`).toBeGreaterThan(0);
        for (const sprite of sprites) {
          const entry = atlas.manifest.sprites[sprite];
          expect(entry, `${stage} parallax sprite ${sprite}`).toBeDefined();
          if (entry === undefined) continue;
          issues.push(
            ...cycledLayerViolations(
              entry.frames.map((f) => framePixels(atlas, f)),
              colours,
              `${stage}/${cycle.layer}`,
              (k) => `${sprite}#${k}`,
            ),
          );
        }
      }
    }
    expect(issues).toEqual([]);
  });

  it('rule 2: every sprite keeps the margin from all nine ramps, bible exemptions tripping', () => {
    const failures: string[] = [];
    const tripped = new Set<string>(); // `${ramp}\u0000${sprite}` of exemptions that tripped
    for (const name of Object.keys(atlas.manifest.sprites)) {
      for (const ramp of rampColors.keys()) {
        if ((CYCLE_ART[ramp] ?? []).includes(name)) continue; // its own ramp: rule 1 checks it
        const trip = spriteTrip(atlas, name, ramp);
        if (trip === null) continue;
        if ((EXEMPT[ramp] ?? []).includes(name)) {
          tripped.add(`${ramp}\u0000${name}`);
          continue;
        }
        failures.push(trip);
      }
    }
    expect(failures).toEqual([]);
    for (const [ramp, sprites] of Object.entries(EXEMPT)) {
      for (const sprite of sprites) {
        expect(
          tripped.has(`${ramp}\u0000${sprite}`),
          `exemption ${ramp} / ${sprite} no longer trips — delete its line (the list cannot rot)`,
        ).toBe(true);
      }
    }
  });

  it('rule 3: a synthetic fixture backdrop passes, one pixel 2/255 off fails', () => {
    const ramp = rampColors.get('SEA')!;
    const build = (): Image[] => {
      const frames: Image[] = [];
      for (let f = 0; f < 2; f++) {
        const image = createImage(12, 12);
        for (let y = 0; y < 12; y++) {
          for (let x = 0; x < 12; x++) {
            const base: Rgb = (x + y) % 2 === 0 ? ramp[0] : [0, 0, 0];
            setPixel(image, x, y, [base[0], base[1], base[2], 255]);
          }
        }
        frames.push(image);
      }
      return frames;
    };
    expect(cycledLayerViolations(build(), ramp, 'fixture', (k) => `fixture#${k}`)).toEqual([]);
    const off = build();
    // SRV2-N2: keep the ±2 off-channel clear of `image.mjs`'s Uint8 store — a red channel ≥ 254
    // would wrap `+2` to a far value and turn the single near miss into a confusing false red.
    const nearRed = ramp[0][0] >= 2 ? ramp[0][0] - 2 : ramp[0][0] + 2;
    setPixel(off[1], 5, 5, [nearRed, ramp[0][1], ramp[0][2], 255]); // 2/255 off: near
    const issues = cycledLayerViolations(off, ramp, 'fixture', (k) => `fixture#${k}`);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('fixture#1');
    expect(issues[0]).toContain('is 2/255 from');
  });
});
