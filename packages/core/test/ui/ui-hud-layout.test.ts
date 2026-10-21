/**
 * The HUD's layout rules (plan_resolution.md R1-01, R2-01, R4-03.C5's redraw): `HUD_LAYOUT` and
 * `BOSS_HP_BAR_WIDTH` derive from the frame (`core/config` FRAME_W, FRAME_CX, HUD_BOTTOM_Y,
 * HUD_BAR_HEIGHT), the font's cell (GLYPH_W) and, for the art- and padding-sized lengths, the art's
 * scale (`core/ui` uiPx). The relations below are written in those, so they pin every field to its
 * pixel (a field moved by 1 px breaks one) at 384×216 and, since R2-01, at 640×360; they also cover
 * the co-op halves and the co-op Direct pips, which the presentation fingerprint's walks do not
 * draw. A second test builds every HUD mode — one player and co-op, the meter and Direct mode, the
 * join prompt, a half that may continue or is out, the boss HP bar and the caravan clock, with and
 * without the UI sprites — in all three shipped languages (en, es, ja, from `content/strings/` —
 * R4-03.C5's acceptance), and checks that each command stays inside the frame and its bar, no
 * bottom-bar command crosses the line between the co-op halves, and no two texts of a row overlap.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FRAME_CX,
  FRAME_H,
  FRAME_W,
  GLYPH_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  resolveGameConfig,
  type GameConfig,
} from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { PLAYER_DEAD_TICKS } from '../../src/player/index.js';
import { METER_SLOT_COUNT } from '../../src/powerups/index.js';
import { DrawOp, TextAlign, createDrawList, type DrawList } from '../../src/presentation/index.js';
import { FORCE_FIELD, collectArm, grantShield } from '../../src/shields/index.js';
import {
  BOSS_HP_BAR_WIDTH,
  HUD_COMMAND_COUNT,
  HUD_LAYOUT,
  HUD_STRING_COUNT,
  buildHud,
  resolveUiSprites,
  resolveUiText,
  uiPx,
  type UiSprites,
  type UiText,
} from '../../src/ui/index.js';
import { ENGINE_SPRITES, createWorld, type World } from '../../src/world/index.js';
import { HUD } from '../helpers/hud.js';

const L = HUD_LAYOUT;

/** The gap between a HUD label and what follows it (4 px at the v1 art's scale). */
const GAP = uiPx(4);

/** From a two-glyph top-bar label to its number: the label and the gap. */
const SCORE_DX = 2 * GLYPH_W + GAP;

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** The KESTREL, the MANTA, Type A and the Direct-mode families, with the engine sprites. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('player/manta.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('weapons/direct.weapons.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A shipped language's UI string table (the same files the loader feeds the game).
 *
 * @param language - The language id (`en`, `es`, `ja`).
 * @returns The resolved table.
 */
function uiTable(language: string): UiText {
  const file = JSON.parse(
    readFileSync(
      new URL(`../../../../content/strings/${language}.strings.json`, import.meta.url),
      'utf8',
    ),
  ) as { strings: Record<string, string> };
  return resolveUiText(file.strings);
}

/**
 * Every shipped language (R4-03.C5's acceptance: nothing overlaps in any of them). `en` resolves
 * the built-in table's own entries, so the walk really compares the three tables.
 */
const TEXTS: ReadonlyArray<readonly [string, UiText]> = [
  ['en', uiTable('en')],
  ['es', uiTable('es')],
  ['ja', uiTable('ja')],
];

describe('HUD_LAYOUT', () => {
  it('derives the bars and the frame-anchored x from the frame', () => {
    expect(L.topY).toBe(0);
    expect(L.bottomY).toBe(HUD_BOTTOM_Y);
    expect(L.halfW * 2).toBe(FRAME_W);
    // The HI display (label, gap, digits) centred 4 px left of the frame's centre.
    expect(L.hiX + ((SCORE_DX + L.digits * GLYPH_W) >> 1)).toBe(FRAME_CX - uiPx(4));
    // 2P and an 11-glyph PRESS START ending 10 px from the right edge.
    expect(L.p2X + SCORE_DX + 11 * GLYPH_W).toBe(FRAME_W - uiPx(10));
    // Five Force Field pips 7 px apart, the last (5 px wide) ending 7 px from the right edge.
    expect(L.shieldX + 4 * uiPx(7) + uiPx(5)).toBe(FRAME_W - uiPx(7));
    // The boss HP bar (R4-03.C5): a quarter of the frame, BOSS + gap + bar centred 2 px right of
    // centre.
    expect(BOSS_HP_BAR_WIDTH).toBe(FRAME_W >> 2);
    expect(L.bossBarX).toBe(L.bossX + 4 * GLYPH_W + GAP);
    const bossW = L.bossBarX - L.bossX + BOSS_HP_BAR_WIDTH;
    expect(L.bossX + (bossW >> 1)).toBe(FRAME_CX + uiPx(2));
    // The group clears the `1P` score run and the `2P` column: it is centred, its label starts
    // after the score digits end and its bar ends before the right-hand run.
    expect(L.bossX).toBeGreaterThanOrEqual(L.p1X + SCORE_DX + L.digits * GLYPH_W + GAP);
    expect(L.bossBarX + BOSS_HP_BAR_WIDTH).toBeLessThanOrEqual(L.p2X - GAP);
  });

  it('lays the left-anchored runs out one after the other from the font', () => {
    expect([L.p1X, L.digits, L.stockX, L.stockIcons]).toEqual([uiPx(8), 8, uiPx(4), 5]);
    // The meter (the art's 40-px slots) after the five stock icons 10 px apart.
    expect(L.meterX).toBe(L.stockX + L.stockIcons * uiPx(10) + uiPx(4));
    expect(L.slotW).toBe(uiPx(40));
    // Direct mode (R4-03.C5): four groups on one even pitch, the family label's four-glyph
    // reservation ending at the bar's right margin, the SPD run a 6 px gap before it.
    expect(L.shotX).toBe(L.meterX);
    expect(L.familyX + 4 * GLYPH_W).toBe(FRAME_W - uiPx(10));
    const pitch = Math.floor(
      (L.familyX - uiPx(6) - (4 * GLYPH_W + uiPx(2) + 5 * uiPx(6)) - L.meterX) / 3,
    );
    expect(L.subX - L.shotX).toBe(pitch);
    expect(L.armX - L.subX).toBe(pitch);
    expect(L.speedX - L.armX).toBe(pitch);
    // Each group's run — the label reservation and its pips — stays inside the pitch.
    expect(HUD.directPipsDx + 7 * HUD.levelStep + HUD.pipW).toBeLessThanOrEqual(pitch);
    expect(HUD.directPipsDx + 4 * HUD.tierStep + HUD.pipW).toBeLessThanOrEqual(pitch);
    // The stock icons are centred in the bar (R4-03.C5): equal air above and below at 1 px each.
    expect(HUD.stockRowY - L.bottomY).toBe(L.bottomY + HUD_BAR_HEIGHT - HUD.stockRowY - HUD.stockH);
  });

  it('lays the co-op halves out from the font', () => {
    expect(L.coopStockX).toBe(uiPx(2));
    // The stock icon, its count 10 px later (one digit), a 4-px gap, then the meter.
    expect(L.coopMeterX).toBe(L.coopStockX + uiPx(10) + GLYPH_W + GAP);
    expect(L.coopSlotW).toBe(2 * GLYPH_W + uiPx(8));
    expect(L.coopShieldX).toBe(L.coopMeterX + METER_SLOT_COUNT * L.coopSlotW + uiPx(2));
    // Co-op Direct mode: SH, SB (2 glyphs + 1 px, 8 pips 4 px apart, 1 px), AR (5 pips), SP.
    const pips = 2 * GLYPH_W + uiPx(1);
    expect(L.coopShotX).toBe(L.coopMeterX);
    expect(L.coopSubX).toBe(L.coopShotX + pips + 8 * uiPx(4) + uiPx(1));
    expect(L.coopArmX).toBe(L.coopSubX + pips + 8 * uiPx(4) + uiPx(1));
    expect(L.coopSpeedX).toBe(L.coopArmX + pips + 5 * uiPx(4) + uiPx(1));
  });
});

/** A drawn command's box in frame pixels (texts and numbers measured in glyph cells). */
interface Box {
  /** What it is (for the failure message). */
  readonly what: string;
  /** Left edge. */
  readonly x0: number;
  /** Right edge (exclusive). */
  readonly x1: number;
  /** Top row. */
  readonly y0: number;
  /** Bottom row (exclusive). */
  readonly y1: number;
  /** A text or a number. */
  readonly text: boolean;
}

/**
 * The boxes of a list's commands (a sprite counts as its anchor pixel).
 *
 * @param list - The list.
 * @returns One box per command.
 */
function boxes(list: DrawList): Box[] {
  const out: Box[] = [];
  for (let i = 0; i < list.count; i++) {
    const op = list.op[i];
    const x = list.x[i];
    const y = list.y[i];
    if (op === DrawOp.Rect) {
      out.push({ what: 'rect', x0: x, x1: x + list.w[i], y0: y, y1: y + list.h[i], text: false });
    } else if (op === DrawOp.Text || op === DrawOp.Number) {
      const s =
        op === DrawOp.Text
          ? list.strings[list.ref[i]]
          : String(list.value[i]).padStart(list.frame[i], '0');
      const w = s.length * GLYPH_W;
      const align = list.flags[i];
      const x0 = align === TextAlign.Center ? x - (w >> 1) : align === TextAlign.Right ? x - w : x;
      out.push({ what: `"${s}"`, x0, x1: x0 + w, y0: y, y1: y + 1, text: true });
    } else {
      out.push({ what: `sprite ${list.ref[i]}`, x0: x, x1: x + 1, y0: y, y1: y + 1, text: false });
    }
  }
  return out;
}

/**
 * The layout problems of a HUD list: a command outside the frame or its bar, a bottom-bar command
 * across the co-op halves' line (co-op only), two overlapping texts of one row.
 *
 * @param list - The HUD list.
 * @param coop - Whether the bottom bar is split into halves.
 * @returns One line per problem.
 */
function problems(list: DrawList, coop: boolean): string[] {
  const out: string[] = [];
  const all = boxes(list);
  for (const b of all) {
    const at = `${b.what} ${b.x0}..${b.x1} × ${b.y0}..${b.y1}`;
    if (b.x0 < 0 || b.x1 > FRAME_W) out.push(`${at}: outside the frame`);
    const top = b.y0 >= L.topY && b.y1 <= L.topY + HUD_BAR_HEIGHT;
    const bottom = b.y0 >= L.bottomY && b.y1 <= L.bottomY + HUD_BAR_HEIGHT;
    if (!top && !bottom) out.push(`${at}: outside the bars`);
    if (coop && bottom && b.x0 < L.halfW && b.x1 > L.halfW && b.x1 - b.x0 < FRAME_W) {
      out.push(`${at}: across the co-op halves`);
    }
  }
  const texts = all.filter((b) => b.text);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (a.y0 === b.y0 && a.x0 < b.x1 && b.x0 < a.x1) {
        out.push(`${a.what} ${a.x0}..${a.x1} overlaps ${b.what} ${b.x0}..${b.x1}`);
      }
    }
  }
  return out;
}

/**
 * Takes a ship out of the game (out of lives), with or without a continue left.
 *
 * @param w - The world.
 * @param slot - The player slot.
 * @param canContinue - Leave its continues (else spend them all).
 */
function knockOut(w: World, slot: number, canContinue: boolean): void {
  const ship = w.players[slot];
  ship.state = 'dead';
  ship.stateTicks = PLAYER_DEAD_TICKS;
  ship.lives = 0;
  if (!canContinue) w.scoring.board.scores[slot].continues = w.config.continues;
}

/** One HUD to check: a name, its config, whether player 2 plays, and what else to set up. */
type HudCase = readonly [string, Partial<GameConfig>, boolean, (w: World) => void];

const DIRECT: Partial<GameConfig> = { shipId: 'manta', powerUpMode: 'direct' };

/** Every HUD mode, each with its widest content: full scores, shields, every pip lit. */
const CASES: HudCase[] = [];
for (const [mode, config] of [
  ['meter', {}],
  ['direct', DIRECT],
] as const) {
  const powered = (w: World): void => {
    for (const ship of w.players) {
      if (mode === 'direct') for (let k = 0; k < 6; k++) collectArm(ship.shield);
      else grantShield(ship.shield, FORCE_FIELD);
      ship.lives = 9;
      ship.speedLevel = 4;
    }
    for (const loadout of w.weapons.loadouts) {
      loadout.shot = 8;
      loadout.sub = 8;
    }
    for (const score of w.scoring.board.scores) score.score = 99_999_990;
    w.scoring.board.hiScore = 99_999_990;
  };
  const boss = (w: World): void => {
    powered(w);
    const bar = w.bosses.hpBar as { visible: boolean; hp: number; maxHp: number };
    bar.visible = true;
    bar.hp = 37;
    bar.maxHp = 100;
    w.timeLeft = 5999;
  };
  CASES.push([`${mode}, one player`, config, false, powered]);
  CASES.push([`${mode}, one player, the boss bar and the clock`, config, false, boss]);
  const coop: Partial<GameConfig> = { ...config, coop: true };
  CASES.push([`${mode}, co-op, player 2 may join`, coop, false, powered]);
  CASES.push([`${mode}, co-op, both playing`, coop, true, powered]);
  CASES.push([`${mode}, co-op, both, the boss bar and the clock`, coop, true, boss]);
  CASES.push([
    `${mode}, co-op, player 1 may continue, player 2 is out`,
    coop,
    true,
    (w) => {
      powered(w);
      knockOut(w, 0, true);
      knockOut(w, 1, false);
    },
  ]);
}

describe('buildHud layout', () => {
  it.each(CASES)('keeps %s inside its bars, the frame and its half', (_name, config, both, set) => {
    const w = createWorld(resolveGameConfig(config), DB);
    if (both) {
      w.players[1].active = true;
      w.players[1].state = 'alive';
    }
    set(w);
    const sprites: (UiSprites | undefined)[] = [resolveUiSprites(DB), undefined];
    for (const ui of sprites) {
      for (const [, text] of TEXTS) {
        for (const tick of [0, HUD_BAR_HEIGHT * 4]) {
          (w as { tick: number }).tick = tick;
          const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
          buildHud(w, list, ui, true, text);
          expect(list.dropped).toBe(0);
          expect(problems(list, both)).toEqual([]);
        }
      }
    }
    expect(FRAME_H - L.bottomY).toBe(HUD_BAR_HEIGHT);
  });

  it("reserves what every shipped language's top-bar runs show (R4-03.C5)", () => {
    // `PRESS START` in player 2's place: the reservation's 11 glyphs are the longest shipped.
    let longest = 0;
    for (const [, text] of TEXTS) longest = Math.max(longest, text.pressStart.length);
    expect(longest).toBe(11);
    // `TIME` followed by its seconds stays left of the frame's right margin in every language.
    let timeRun = 0;
    for (const [, text] of TEXTS) {
      timeRun = Math.max(timeRun, text.time.length * GLYPH_W + GAP + 3 * GLYPH_W);
    }
    expect(L.p2X + timeRun).toBeLessThanOrEqual(FRAME_W - uiPx(6));
  });

  it('fits every shipped Direct-mode label and family inside its reservation', () => {
    // Group labels: the four-glyph pip offset (`SHOT`, `SUB`, `ARM`, `SPD`, longest per language).
    const groups = ['hudShot', 'hudSub', 'hudArm', 'hudSpeed'] as const;
    for (const [, text] of TEXTS) {
      for (const id of groups) expect(text[id].length).toBeLessThanOrEqual(4);
    }
    // The main-shot family labels: the four-glyph right reservation.
    const w = createWorld(resolveGameConfig(DIRECT), DB);
    for (const family of w.weapons.mainFamilies) {
      expect(family === null ? 0 : family.label.length).toBeLessThanOrEqual(4);
    }
    // And each group's pips clear the next group's label at the pitch.
    expect(L.shotX + HUD.directPipsDx + 7 * HUD.levelStep + HUD.pipW).toBeLessThanOrEqual(L.subX);
    expect(L.speedX + HUD.directPipsDx + 4 * HUD.tierStep + HUD.pipW).toBeLessThan(L.familyX);
  });

  it("draws the caravan clock's seconds the label gap after TIME, like a score (R2-01)", () => {
    const w = createWorld(resolveGameConfig({}), DB);
    w.timeLeft = 5999;
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    buildHud(w, list, resolveUiSprites(DB), true);
    let label = -1;
    let seconds = -1;
    for (let i = 0; i < list.count; i++) {
      if (list.y[i] !== L.topY || list.x[i] < L.p2X) continue;
      if (list.op[i] === DrawOp.Text && list.strings[list.ref[i]] === 'TIME') label = i;
      if (list.op[i] === DrawOp.Number && list.value[i] === 100) seconds = i;
    }
    expect(label).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(list.x[label]).toBe(L.p2X);
    expect(list.x[seconds]).toBe(L.p2X + HUD.clockDx);
  });
});
