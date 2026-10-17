/**
 * No literal frame numbers in `@shmup/core` (plan_resolution.md R1-01).
 *
 * R1-01 derives every frame-dependent number in core from a few constants (`FRAME_W`, `FRAME_H`,
 * `HUD_BAR_HEIGHT`, `TILE_SIZE`, the font metrics) so that R2-01's flip to 640×360 is a change
 * of those constants alone. This file keeps it that way: it parses every `packages/core/src/**`
 * `.ts` file with the TypeScript compiler, so comments (docblocks included) are never read, and
 * fails on any numeric literal — or whole number inside a string or template literal — that is
 * a frame number, unless an entry of {@link ALLOWED} names it, with the reason it is not the
 * frame.
 *
 * The frame numbers are the v1 frame's `384`, `216`, `200`, `208` and its centre `192` / `108`,
 * plus whatever `FRAME_W`, `FRAME_H`, `PLAYFIELD_H` and `HUD_BOTTOM_Y` are *now* (`640`, `360`,
 * `336`, `348` once R2-01 flips them); the helper's docblock says why `100` and the new centre
 * `320` / `180` are not among them.
 *
 * The scanner itself — and the list of frame numbers it bans, the symbol paths, the stale-entry
 * check — lives in `helpers/frame-literal-scan.ts`, shared with the repo-wide scan
 * `test/integration/frame-literals-repo.test.ts` (R1-02). An entry is matched by file, **symbol
 * path** (the names of the declarations around the literal, outermost first: `OPTIONS_PANEL.h`,
 * `bossSuction.pullRadius`) and value, never by line number, so edits elsewhere in a file do not
 * break it. Each entry states how many literals it covers; the test fails when a symbol holds
 * more (a new frame number crept in beside an allowed one) or fewer — down to none — so the list
 * cannot rot.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FRAME_H, FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_H } from '../src/index.js';
import {
  type AllowedFrameLiteral,
  FRAME_NUMBERS,
  V1_FRAME_NUMBERS,
  frameLiteralKey as keyOf,
  frameLiteralProblems,
  listSourceFiles,
  scanFrameLiterals as scan,
} from './helpers/frame-literal-scan.js';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Every frame-number literal core may keep. Add an entry only for a literal that does not mean
 * the frame (a count, an angle, a character cap, a world distance, a content-sized panel …);
 * a literal that does mean it derives from the `config` constants instead.
 */
const ALLOWED: readonly AllowedFrameLiteral[] = [
  // The frame itself: the only place its size is written down.
  {
    file: 'config/index.ts',
    symbol: 'FRAME_W',
    value: FRAME_W,
    reason: 'the definition of the frame width every other frame number derives from',
  },
  {
    file: 'config/index.ts',
    symbol: 'FRAME_H',
    value: FRAME_H,
    reason: 'the definition of the frame height every other frame number derives from',
  },
  // Counts.
  {
    file: 'scenes/index.ts',
    symbol: 'UI_COMMANDS',
    value: 384,
    reason: 'a count: the UI draw list holds 384 commands (M2-10, the zone map graph)',
  },
  {
    file: 'weapons/index.ts',
    symbol: 'SHOT_BATCH_CAPACITY',
    value: 192,
    reason: "a count: the PlayerShots sprite batch's capacity (shots + extra laser segments)",
  },
  {
    file: 'data/index.ts',
    symbol: 'DEMO_FILE_SCHEMA.description.maxLength',
    value: 200,
    reason: "a character cap: an attract demo's description is at most 200 characters",
  },
  // Angles (binary units: 1024 = one turn, so 384 = 135°).
  {
    file: 'weapons/index.ts',
    symbol: 'WEAPON_BEHAVIOR_PARAMS.missile.twoWayBack.angle',
    value: 384,
    reason: "an angle: the back missile's heading, 135° in binary angle units",
  },
  {
    file: 'weapons/index.ts',
    symbol: 'WEAPON_BEHAVIOR_PARAMS.shot.backDouble.angle',
    value: 384,
    reason: "an angle: the back double shot's heading, 135° in binary angle units",
  },
  {
    file: 'weapons/index.ts',
    symbol: 'DIRECTION_HEADINGS',
    value: 384,
    reason: "an angle: the Free Way's down-left heading, 135° in binary angle units",
  },
  {
    file: 'math/trig-table.ts',
    symbol: 'ATAN_TABLE',
    value: 108,
    count: 3,
    reason: 'angles: the generated arctangent table (gen-trig-tables.mjs; its test diffs it)',
  },
  // World values (R2-02 scales them ×1.5 with the content; plan §2.6).
  {
    file: 'behaviors/index.ts',
    symbol: 'bossSuction.pullRadius',
    value: 200,
    reason: "a world radius: boss.suction's pull field (plan §2.6 — not PLAYFIELD_H)",
  },
  // Panels and columns sized by their 6×8 text, not by the frame: they stay centred on
  // FRAME_CX / FRAME_CY (or anchored to an edge) at any frame size; R4-03 resizes them for the
  // new font (≈ 9×12), and R2-01 checks them at 640×360.
  {
    file: 'scenes/index.ts',
    symbol: 'OPTIONS_PANEL.h',
    value: 192,
    reason: 'a content-sized panel: a 26-px title band + eleven 14-px menu rows (M2-09)',
  },
  {
    file: 'scenes/index.ts',
    symbol: 'ZONE_TALLY_PANEL.w',
    value: 200,
    reason: "a content-sized panel: sized by the zone tally's rows of 6×8 text",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'SHIP_PANEL.w',
    value: 208,
    reason: "a content-sized panel: sized by the ship select's names and hint lines of 6×8 text",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'WEAPON_PANEL.h',
    value: 192,
    reason: "a content-sized panel: the weapon select's menu rows (R2-01 decides if it grows)",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'ORDER_PANEL.h',
    value: 192,
    reason: "a content-sized panel: the order editor's rows, as tall as the weapon panel",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'HI_SCORE_PANEL.h',
    value: 200,
    reason: 'a content-sized panel: a 54-px header + HI_SCORE_TABLE_SIZE (10) rows of 14 px',
  },
  {
    file: 'scenes/index.ts',
    symbol: 'HiScoreScene.drawUi.rankX',
    value: 108,
    reason: "a text column: the rank column's offset left of FRAME_CX (18 glyphs), not the centre",
  },
  {
    file: 'scenes/index.ts',
    symbol: 'INVASION_BLASTS',
    value: 108,
    reason: "scene art: one blast's x in the story's invasion vignette (R4-05 redraws it)",
  },
];

/**
 * Every `.ts` file under core's `src/`.
 *
 * @returns Paths relative to `src/`, sorted.
 */
function coreSources(): string[] {
  return listSourceFiles(srcDir, (name) => name.endsWith('.ts'));
}

describe('core: no literal frame numbers (plan R1-01)', () => {
  const files = coreSources();
  const hits = files.flatMap((file) => scan(file, readFileSync(join(srcDir, file), 'utf8')));

  it('scans every core source file (and finds some)', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain('scenes/index.ts');
    expect(files).toContain('config/index.ts');
  });

  it('scans for the v1 frame numbers and the current ones', () => {
    expect([...FRAME_NUMBERS].slice(0, V1_FRAME_NUMBERS.length)).toEqual([
      384, 216, 200, 208, 192, 108,
    ]);
    for (const value of [FRAME_W, FRAME_H, PLAYFIELD_H, HUD_BOTTOM_Y]) {
      expect(FRAME_NUMBERS.has(value)).toBe(true);
    }
  });

  it('has no frame number outside the allow-list, and every entry still matches', () => {
    const problems = frameLiteralProblems(hits, ALLOWED, 'derive it from config');
    expect(problems).toEqual([]);
  });

  it('keeps the allow-list well formed', () => {
    const keys = ALLOWED.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of ALLOWED) {
      expect(files, entry.file).toContain(entry.file);
      expect(FRAME_NUMBERS.has(entry.value), keyOf(entry)).toBe(true);
      expect(entry.reason.trim().length, keyOf(entry)).toBeGreaterThan(10);
    }
  });

  it('would catch one if it appeared — the scan is not vacuous', () => {
    const sample = [
      '// 384 in a line comment, 216 too',
      '/** 208 in a docblock. */',
      'export const PANEL = Object.freeze({ x: 4, w: 384 });',
      'export class Scene {',
      '  draw(list: { rect(...n: number[]): void }): void {',
      '    list.rect(0, 208, 384, 8, -200);',
      '  }',
      '}',
      "const label = 'row 216 of 2160';",
      'const hex = 0xc0;',
      'const fine = 3840 + 21.6 + 38.4;',
    ].join('\n');
    expect(scan('sample.ts', sample).map((h) => `${h.symbol}=${h.value}@${h.line}`)).toEqual([
      'PANEL.w=384@3',
      'Scene.draw=208@6',
      'Scene.draw=384@6',
      'Scene.draw=200@6',
      'label=216@9',
      'hex=192@10',
    ]);
  });
});
