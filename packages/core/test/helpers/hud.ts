/**
 * The HUD's rows, steps and offsets in frame pixels for the `core/ui` HUD suites, derived the way
 * `core/ui` derives them (plan_resolution.md R1-01, R2-01): from `HUD_LAYOUT`, the font's metrics
 * (`GLYPH_W`) and, for the art- and padding-sized lengths, `uiPx` — so the suites' expectations
 * hold at 384×216 with the 6×8 font and `ART_SCALE` 1 and at 640×360 with the 9×12 font and
 * `ART_SCALE` 3/2. The numbers in parentheses are today's values.
 */
import { GLYPH_W } from '../../src/config/index.js';
import { HUD_LAYOUT, uiPx } from '../../src/ui/index.js';

/** The derived HUD geometry the suites read. */
export const HUD = Object.freeze({
  /** From a two-glyph top-bar label (`1P`, `HI`, `2P`) to its number (16). */
  scoreDx: 2 * GLYPH_W + uiPx(4),
  /** The row of the bottom bar's art: stock icons, pips, slot labels (210). */
  rowY: HUD_LAYOUT.bottomY + uiPx(2),
  /** The row of the meter slots' stand-in boxes, 1 px inside the bar (209). */
  boxY: HUD_LAYOUT.bottomY + 1,
  /** The top bar's art row: the boss bar's frame (2). */
  topRowY: HUD_LAYOUT.topY + uiPx(2),
  /** A pip's, an icon stand-in's and the boss bar frame's height (4). */
  pipH: uiPx(4),
  /** A Direct-mode tier pip's width (4) and a co-op compact pip's (3). */
  pipW: uiPx(4),
  coopPipW: uiPx(3),
  /** A stock icon stand-in's width (8). */
  stockW: uiPx(8),
  /** Pitch of the stock icons (10); the co-op count follows its icon by the same. */
  stockStep: uiPx(10),
  /** From the single stock icon to its count (12). */
  stockCountDx: uiPx(12),
  /** A meter slot stand-in box's height (6). */
  slotBoxH: uiPx(6),
  /** From a meter slot to its label frame (2). */
  slotLabelDx: uiPx(2),
  /** Force Field pips: width (5) and pitch (7); the co-op ones' pitch (5). */
  shieldPipW: uiPx(5),
  shieldStep: uiPx(7),
  coopShieldStep: uiPx(5),
  /** Direct mode: the SHOT / SUB pitch (5), the ARM / SPD pitch (6), co-op's compact pitch (4). */
  levelStep: uiPx(5),
  tierStep: uiPx(6),
  coopStep: uiPx(4),
  /** Direct mode: from `SHOT` to its pips (26), from a three-glyph label to its pips (20). */
  shotPipsDx: 4 * GLYPH_W + uiPx(2),
  tierPipsDx: 3 * GLYPH_W + uiPx(2),
  /** Co-op Direct mode: from a two-glyph label to its pips (13). */
  coopPipsDx: 2 * GLYPH_W + uiPx(1),
  /** From the caravan clock's `TIME` to its seconds: the label and the gap (28). */
  clockDx: 4 * GLYPH_W + uiPx(4),
});
