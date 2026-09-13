/**
 * The co-op HUD (plan M2-06, shmup_feat.md §17 "co-op P2 HUD, PRESS START join prompt"): a
 * one-player game keeps `2P ------`; a co-op game shows player 2's blinking `PRESS START` until it
 * joins; with both ships in play the bottom bar splits into two compact halves (stock icon and
 * count — player 2's in its palette swap —, the seven meter slots as boxes with two-letter labels,
 * the shield pips; the compact tier pips in Direct mode); a player out of lives shows `PRESS START`
 * (it may continue) or `GAME OVER` in its half; `hudPlayerState` agrees with the World's
 * `playerCanJoin`; `Hud.update` follows the blink only while a prompt shows.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { PLAYER_DEAD_TICKS } from '../../src/player/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import { DrawOp, TextAlign, createDrawList, type DrawList } from '../../src/presentation/index.js';
import { grantShield } from '../../src/shields/index.js';
import {
  HUD_COLORS,
  HUD_COMMAND_COUNT,
  HUD_LAYOUT,
  HUD_PROMPT_BLINK_TICKS,
  HUD_STRING_COUNT,
  HUD_STRING_SLOTS,
  HudPlayerState,
  METER_LABEL_FRAMES,
  METER_SHORT_LABELS,
  buildHud,
  createHud,
  hudPlayerState,
  resolveUiSprites,
} from '../../src/ui/index.js';
import { ENGINE_SPRITES, createWorld, playerCanJoin, type World } from '../../src/world/index.js';

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

const SPRITES = resolveUiSprites(DB);
const L = HUD_LAYOUT;
const S = HUD_STRING_SLOTS;

/**
 * A co-op world (free flight).
 *
 * @param overrides - Config overrides.
 * @returns The world.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  return createWorld(resolveGameConfig({ coop: true, ...overrides }), DB);
}

/**
 * A co-op world with both ships in play.
 *
 * @param overrides - Config overrides.
 * @returns The world.
 */
function both(overrides: Partial<GameConfig> = {}): World {
  const w = world(overrides);
  w.players[1].active = true;
  w.players[1].state = 'alive';
  return w;
}

/**
 * Makes a ship out of the game.
 *
 * @param w - The world.
 * @param slot - The player slot.
 */
function knockOut(w: World, slot: number): void {
  const ship = w.players[slot];
  ship.state = 'dead';
  ship.stateTicks = PLAYER_DEAD_TICKS;
  ship.lives = 0;
}

/**
 * Builds a full-size HUD list of a world.
 *
 * @param w - The world.
 * @returns The list.
 */
function hud(w: World): DrawList {
  const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
  buildHud(w, list, SPRITES);
  return list;
}

/** One draw command: op, ref (sprite id / string slot), frame, x, y, colour, flags. */
type Command = readonly [number, number, number, number, number, number, number];

/**
 * The commands of a list.
 *
 * @param list - The list.
 * @returns Its commands.
 */
function commands(list: DrawList): Command[] {
  const out: Command[] = [];
  for (let i = 0; i < list.count; i++) {
    out.push([
      list.op[i],
      list.ref[i],
      list.frame[i],
      list.x[i],
      list.y[i],
      list.color[i],
      list.flags[i],
    ]);
  }
  return out;
}

/**
 * The text commands of a list, as the strings they draw with their x.
 *
 * @param list - The list.
 * @returns `[text, x, y]` per text command.
 */
function texts(list: DrawList): Array<[string, number, number]> {
  return commands(list)
    .filter((c) => c[0] === DrawOp.Text)
    .map((c) => [list.strings[c[1]] ?? '', c[3], c[4]]);
}

describe('core/ui co-op HUD: the top bar (M2-06)', () => {
  it('keeps 2P ------ in a one-player game', () => {
    const w = world({ coop: false });
    expect(hudPlayerState(w, 1)).toBe(HudPlayerState.Absent);
    const list = hud(w);
    expect(texts(list)).toContainEqual(['------', L.p2X + 16, L.topY]);
    expect(texts(list).map((t) => t[0])).not.toContain('PRESS START');
  });

  it('blinks PRESS START where player 2`s score goes until it joins', () => {
    const w = world();
    expect(hudPlayerState(w, 1)).toBe(HudPlayerState.Join);
    const on = hud(w);
    expect(texts(on)).toContainEqual(['PRESS START', L.p2X + 16, L.topY]);
    expect(texts(on)).toContainEqual(['2P', L.p2X, L.topY]);
    w.tick = HUD_PROMPT_BLINK_TICKS; // the "off" half
    expect(texts(hud(w)).map((t) => t[0])).not.toContain('PRESS START');
    // Player 1 alone: the one-player bottom bar (the seven 40-px slots).
    const slots = commands(on).filter((c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.meterSlot);
    expect(slots).toHaveLength(7);
  });

  it('shows both scores once both play', () => {
    const w = both();
    w.scoring.board.scores[0].score = 1_230;
    w.scoring.board.scores[1].score = 4_560;
    const list = hud(w);
    const cmds = commands(list);
    const numbers = cmds.filter((c) => c[0] === DrawOp.Number && c[4] === L.topY);
    expect(numbers.map((c) => c[3])).toEqual([L.p1X + 16, L.hiX + 16, L.p2X + 16]);
    expect(list.value[cmds.indexOf(numbers[2])]).toBe(4_560);
    expect(texts(list)).toContainEqual(['2P', L.p2X, L.topY]);
  });
});

describe('core/ui co-op HUD: each player`s half (M2-06)', () => {
  it('splits the bottom bar: stock, compact meter, shield pips per player', () => {
    const w = both();
    w.players[0].lives = 3;
    w.players[1].lives = 5;
    w.powerups.meters[1].cursor = MeterSlot.Option;
    grantShield(w.players[1].shield);
    const list = hud(w);
    const cmds = commands(list);
    // Stock icons: player 1's at x 2, player 2's palette swap at 194; each with its count.
    expect(SPRITES.lifeP2).toBeGreaterThanOrEqual(0);
    expect(cmds.filter((c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.life)).toEqual([
      [DrawOp.Sprite, SPRITES.life, 0, L.coopStockX, L.bottomY + 2, 0xffffff, 0],
    ]);
    expect(cmds.filter((c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.lifeP2)).toEqual([
      [DrawOp.Sprite, SPRITES.lifeP2, 0, L.halfW + L.coopStockX, L.bottomY + 2, 0xffffff, 0],
    ]);
    const counts = cmds.filter((c) => c[0] === DrawOp.Number && c[4] === L.bottomY);
    expect(counts.map((c) => c[3])).toEqual([L.coopStockX + 10, L.halfW + L.coopStockX + 10]);
    expect(counts.map((c) => list.value[cmds.indexOf(c)])).toEqual([2, 4]);
    // Seven compact slots per half, labelled with two letters.
    const boxes = cmds.filter((c) => c[0] === DrawOp.Rect && c[4] === L.bottomY + 1);
    expect(boxes).toHaveLength(14);
    expect(boxes[0]?.[3]).toBe(L.coopMeterX + 1);
    expect(boxes[7]?.[3]).toBe(L.halfW + L.coopMeterX + 1);
    // Player 2's highlighted OPTION slot (the flash's "on" half at tick 0).
    expect(boxes[7 + MeterSlot.Option]?.[5]).toBe(HUD_COLORS.slotLit);
    const labels = texts(list).filter((t) => t[2] === L.bottomY);
    expect(labels.map((t) => t[0])).toEqual([
      ...METER_SHORT_LABELS.slice(0, 7),
      ...METER_SHORT_LABELS.slice(0, 7),
    ]);
    // Player 2's Force Field pips from x 192 + 164, none for player 1.
    const pips = cmds.filter(
      (c) => c[0] === DrawOp.Rect && c[4] === L.bottomY + 2 && c[3] >= L.coopShieldX,
    );
    expect(pips.length).toBeGreaterThan(0);
    for (const pip of pips) expect(pip[3]).toBeGreaterThanOrEqual(L.halfW + L.coopShieldX);
    expect(list.dropped).toBe(0);
  });

  it('shows PRESS START in the half of a player who may continue, GAME OVER without continues', () => {
    const w = both();
    knockOut(w, 1);
    expect(hudPlayerState(w, 1)).toBe(HudPlayerState.Continue);
    const centre = L.halfW + (L.halfW >> 1);
    expect(texts(hud(w))).toContainEqual(['PRESS START', centre, L.bottomY]);
    w.scoring.board.scores[1].continues = w.config.continues;
    expect(hudPlayerState(w, 1)).toBe(HudPlayerState.Out);
    const list = hud(w);
    expect(texts(list)).toContainEqual(['GAME OVER', centre, L.bottomY]);
    const over = commands(list).find((c) => c[0] === DrawOp.Text && c[1] === S.gameOver);
    expect(over?.[6]).toBe(TextAlign.Center);
    // Its score stays on the top bar.
    expect(
      commands(list).filter((c) => c[0] === DrawOp.Number && c[3] === L.p2X + 16),
    ).toHaveLength(1);
  });

  it('draws the compact tier pips in Direct mode, within the command budget', () => {
    const w = both({ shipId: 'manta', powerUpMode: 'direct', loadout: 'full' });
    w.players[0].lives = 6;
    w.players[1].lives = 6;
    const list = hud(w);
    expect(list.dropped).toBe(0);
    expect(list.count).toBeLessThanOrEqual(HUD_COMMAND_COUNT);
    const labels = texts(list).filter((t) => t[2] === L.bottomY);
    expect(labels.map((t) => [t[0], t[1]])).toEqual([
      ['SH', L.coopShotX],
      ['SB', L.coopSubX],
      ['AR', L.coopArmX],
      ['SP', L.coopSpeedX],
      ['SH', L.halfW + L.coopShotX],
      ['SB', L.halfW + L.coopSubX],
      ['AR', L.halfW + L.coopArmX],
      ['SP', L.halfW + L.coopSpeedX],
    ]);
    // 3-px pips 4 px apart: 8 SHOT, 8 SUB, 5 ARM (the full Hyper Arm), 3 SPD per player.
    const cmds = commands(list);
    const pips = cmds.filter((c) => c[0] === DrawOp.Rect && c[4] === L.bottomY + 2);
    expect(pips).toHaveLength(2 * (8 + 8 + 5 + 3));
    expect(list.w[cmds.indexOf(pips[0])]).toBe(3);
  });

  it('names the MISSILE / DOUBLE / LASER slots after the arsenal', () => {
    const w = both({ weaponPreset: 'type-b' });
    const labels = texts(hud(w)).filter((t) => t[2] === L.bottomY);
    expect(labels).toHaveLength(14);
    expect(METER_SHORT_LABELS).toHaveLength(METER_LABEL_FRAMES.length);
  });
});

describe('core/ui co-op HUD: state and change detection (M2-06)', () => {
  it('agrees with the World on who may join', () => {
    const w = both();
    const cases: Array<() => void> = [
      () => undefined,
      () => knockOut(w, 1),
      () => (w.scoring.board.scores[1].continues = 9),
      () => (w.status = 'gameOver'),
      () => ((w.players[1].active = false), (w.status = 'playing')),
      () => (w.status = 'bossWarning'),
    ];
    for (const change of cases) {
      change();
      const state = hudPlayerState(w, 1);
      const joinable = state === HudPlayerState.Join || state === HudPlayerState.Continue;
      expect(joinable).toBe(playerCanJoin(w, 1));
    }
    expect(hudPlayerState(w, 5)).toBe(HudPlayerState.Absent);
  });

  it('rebuilds for the blink only while a prompt shows, and when player 2 joins', () => {
    const w = world();
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    const h = createHud(SPRITES);
    expect(h.update(w, list)).toBe(true);
    expect(h.update(w, list)).toBe(false);
    w.tick = HUD_PROMPT_BLINK_TICKS;
    expect(h.update(w, list)).toBe(true); // the prompt blinks off
    w.tick = HUD_PROMPT_BLINK_TICKS + 1;
    expect(h.update(w, list)).toBe(false);
    w.players[1].active = true;
    w.players[1].state = 'alive';
    expect(h.update(w, list)).toBe(true); // joined: no prompt, the halves
    w.tick = 2 * HUD_PROMPT_BLINK_TICKS + 1;
    expect(h.update(w, list)).toBe(false); // no prompt: the blink does not matter
    w.players[1].lives = 4;
    expect(h.update(w, list)).toBe(true); // player 2's stock
    w.powerups.meters[1].cursor = MeterSlot.Speed;
    expect(h.update(w, list)).toBe(true);
    const shield = w.players[1].shield;
    grantShield(shield);
    expect(h.update(w, list)).toBe(true);
  });
});
