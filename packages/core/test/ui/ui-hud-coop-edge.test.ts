/**
 * Edge cases of the co-op HUD (plan M2-06): `hudPlayerState` agrees with the World's
 * `playerCanJoin` for **both** slots over every combination of co-op, status, activity, life
 * state, lives and continues used (`core/ui` repeats the World's join rule — this keeps the two in
 * step); player 1 out while player 2 plays shows its prompt in the **left** half and keeps its
 * score; a one-player game never shows `PRESS START`; without the UI sprites the co-op halves fall
 * back to rectangles within the command budget; and a HUD list with 4 string slots still builds
 * while no prompt is due (the co-op strings are written only when drawn).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { PLAYER_DEAD_TICKS, type PlayerState } from '../../src/player/index.js';
import { DrawOp, createDrawList, type DrawList } from '../../src/presentation/index.js';
import {
  HUD_COMMAND_COUNT,
  HUD_LAYOUT,
  HUD_PROMPT_BLINK_TICKS,
  HUD_STRING_COUNT,
  HudPlayerState,
  buildHud,
  hudPlayerState,
  resolveUiSprites,
} from '../../src/ui/index.js';
import {
  ENGINE_SPRITES,
  createWorld,
  playerCanJoin,
  type World,
  type WorldStatus,
} from '../../src/world/index.js';

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

/** The KESTREL and Type A, with the engine sprites. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const SPRITES = resolveUiSprites(DB);
const L = HUD_LAYOUT;

/**
 * A world (free flight).
 *
 * @param overrides - Config overrides.
 * @returns The world.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  return createWorld(resolveGameConfig({ coop: true, ...overrides }), DB);
}

/**
 * The texts a list draws, with their position.
 *
 * @param list - The list.
 * @returns `[text, x, y]` per text command.
 */
function texts(list: DrawList): Array<[string, number, number]> {
  const out: Array<[string, number, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text)
      out.push([list.strings[list.ref[i]] ?? '', list.x[i], list.y[i]]);
  }
  return out;
}

/**
 * Builds a full-size HUD list of a world.
 *
 * @param w - The world.
 * @param sprites - UI sprites (default: the content's).
 * @returns The list.
 */
function hud(w: World, sprites = SPRITES): DrawList {
  const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
  buildHud(w, list, sprites);
  return list;
}

describe('core/ui co-op HUD edge: the join rule (M2-06)', () => {
  it('agrees with playerCanJoin for both slots in every combination', () => {
    const statuses: WorldStatus[] = ['playing', 'bossWarning', 'stageClear', 'gameOver'];
    const states: PlayerState[] = ['alive', 'respawning', 'dying', 'dead'];
    let combos = 0;
    for (const coop of [false, true]) {
      const w = world({ coop });
      for (const status of statuses) {
        for (let slot = 0; slot < 2; slot++) {
          for (const active of [false, true]) {
            for (const state of states) {
              for (const lives of [0, 1]) {
                for (const stateTicks of [0, PLAYER_DEAD_TICKS]) {
                  for (const used of [0, w.config.continues]) {
                    w.status = status;
                    const ship = w.players[slot];
                    ship.active = active;
                    ship.state = state;
                    ship.lives = lives;
                    ship.stateTicks = stateTicks;
                    w.scoring.board.scores[slot].continues = used;
                    const hs = hudPlayerState(w, slot);
                    const joinable = hs === HudPlayerState.Join || hs === HudPlayerState.Continue;
                    const label = JSON.stringify({
                      coop,
                      status,
                      slot,
                      active,
                      state,
                      lives,
                      used,
                    });
                    expect(joinable, label).toBe(playerCanJoin(w, slot));
                    if (!active) {
                      expect([HudPlayerState.Join, HudPlayerState.Absent], label).toContain(hs);
                    }
                    combos++;
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(combos).toBe(2 * 4 * 2 * 2 * 4 * 2 * 2 * 2);
  });

  it('calls a slot the World does not have Absent', () => {
    const w = world();
    for (const slot of [-1, 2, 99]) expect(hudPlayerState(w, slot)).toBe(HudPlayerState.Absent);
  });
});

describe('core/ui co-op HUD edge: drawing (M2-06)', () => {
  it('shows player 1`s prompt in the left half while player 2 plays, and keeps its score', () => {
    const w = world();
    w.players[1].active = true;
    w.players[1].state = 'alive';
    w.scoring.board.scores[0].score = 12_340;
    const p1 = w.players[0];
    p1.state = 'dead';
    p1.stateTicks = PLAYER_DEAD_TICKS;
    p1.lives = 0;
    expect(hudPlayerState(w, 0)).toBe(HudPlayerState.Continue);
    const centre = L.halfW >> 1;
    let list = hud(w);
    expect(texts(list)).toContainEqual(['PRESS START', centre, L.bottomY]);
    expect(texts(list).filter((t) => t[0] === 'PRESS START')).toHaveLength(1);
    const numbers: number[] = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Number && list.x[i] === L.p1X + 16) numbers.push(list.value[i]);
    }
    expect(numbers).toEqual([12_340]);
    // On the blink's "off" half the prompt is gone; the score stays.
    w.tick = HUD_PROMPT_BLINK_TICKS;
    list = hud(w);
    expect(texts(list).filter((t) => t[0] === 'PRESS START')).toHaveLength(0);
    w.scoring.board.scores[0].continues = w.config.continues;
    expect(texts(hud(w))).toContainEqual(['GAME OVER', centre, L.bottomY]);
  });

  it('never shows PRESS START in a one-player game', () => {
    const w = world({ coop: false });
    const p1 = w.players[0];
    p1.state = 'dead';
    p1.stateTicks = PLAYER_DEAD_TICKS;
    p1.lives = 0;
    const shown = texts(hud(w)).map((t) => t[0]);
    expect(shown).not.toContain('PRESS START');
    expect(shown).toContain('------');
    expect(hudPlayerState(w, 1)).toBe(HudPlayerState.Absent);
  });

  it('falls back to rectangles for both halves without the UI sprites', () => {
    const w = world();
    w.players[1].active = true;
    w.players[1].state = 'alive';
    w.players[0].lives = 9;
    w.players[1].lives = 9;
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    buildHud(w, list); // no UI sprites
    expect(list.dropped).toBe(0);
    expect(list.count).toBeLessThanOrEqual(HUD_COMMAND_COUNT);
    for (let i = 0; i < list.count; i++) expect(list.op[i]).not.toBe(DrawOp.Sprite);
    const right: number[] = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Rect && list.y[i] > L.bottomY && list.x[i] >= L.halfW) {
        right.push(list.x[i]);
      }
    }
    expect(right.length).toBeGreaterThan(7); // the stock icon and the seven slot boxes
  });

  it('builds into a 4-string-slot list while no prompt is due (a one-player HUD list)', () => {
    const solo = world({ coop: false });
    const cleared = world(); // a co-op game on its stage-clear screen, player 2 never joined
    cleared.status = 'stageClear';
    for (const w of [solo, cleared]) {
      const list = createDrawList(HUD_COMMAND_COUNT, 4);
      expect(() => buildHud(w, list, SPRITES)).not.toThrow();
      expect(list.dropped).toBe(0);
      expect(texts(list).map((t) => t[0])).toContain('------');
    }
  });
});
