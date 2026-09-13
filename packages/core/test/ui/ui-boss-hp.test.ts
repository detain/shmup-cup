/**
 * The boss HP bar of the HUD (plan M2-09, shmup_feat.md §13): the model's pixel fill
 * (`bossHpBarFill` — ⌈hp × width / maxHp⌉, at least 1 px while anything is left, full only at full
 * strength), the top bar with the option (`BOSS` and the bar in place of the hi-score while a boss
 * is counted) and without it, and the change detection of `Hud.update` (a rebuild when the fill's
 * pixel count or the option changes, none otherwise).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { DrawOp, createDrawList, type DrawList } from '../../src/presentation/index.js';
import {
  BOSS_HP_BAR_WIDTH,
  HUD_COLORS,
  HUD_COMMAND_COUNT,
  HUD_LAYOUT,
  HUD_STRING_COUNT,
  bossHpBarFill,
  buildHud,
  createHud,
} from '../../src/ui/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

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

/** The KESTREL, Type A and the test boss (its bar counts the core and both plates). */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/test-boss.enemies.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A world with the test boss flying in (its intro running).
 *
 * @returns The world.
 */
function withBoss(): World {
  // The ship holds its fire (no autofire, no remote's always-on autofire).
  const w = createWorld(resolveGameConfig({ seed: 1, autofire: false, remoteMode: false }), DB);
  w.debugFlags.godMode = true;
  expect(w.bosses.startBoss(DB.enemyIndex.get('test-boss') ?? -1)).toBe(true);
  return w;
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * The texts of a list.
 *
 * @param list - The list.
 * @returns Its strings, in command order.
 */
function texts(list: DrawList): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text) out.push(list.strings[list.ref[i]] ?? '');
  }
  return out;
}

/**
 * The rectangles of a list in a colour.
 *
 * @param list - The list.
 * @param color - The colour.
 * @returns `[x, y, w, h]` per rectangle.
 */
function rects(list: DrawList, color: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Rect && list.color[i] === color) {
      out.push([list.x[i], list.y[i], list.w[i], list.h[i]]);
    }
  }
  return out;
}

describe('core/ui — the boss HP bar (M2-09)', () => {
  it('turns the model into whole pixels: at least 1 while anything is left, full only at full', () => {
    const bar = { visible: true, hp: 30, maxHp: 120 };
    expect(bossHpBarFill(bar, 62)).toBe(16);
    expect(bossHpBarFill({ ...bar, hp: 120 }, 62)).toBe(62);
    expect(bossHpBarFill({ ...bar, hp: 119 }, 62)).toBe(62);
    expect(bossHpBarFill({ ...bar, hp: 1 }, 62)).toBe(1);
    expect(bossHpBarFill({ ...bar, hp: 0 }, 62)).toBe(0);
    expect(bossHpBarFill({ ...bar, hp: 500 }, 62)).toBe(62);
    expect(bossHpBarFill({ ...bar, visible: false }, 62)).toBe(0);
    expect(bossHpBarFill({ ...bar, maxHp: 0 }, 62)).toBe(0);
    expect(bossHpBarFill(bar, 0)).toBe(0);
  });

  it('draws BOSS and the bar in place of the hi-score with the option, only while a boss counts', () => {
    const w = withBoss();
    run(w, 200);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    buildHud(w, list);
    expect(texts(list)).toContain('HI');
    expect(texts(list)).not.toContain('BOSS');
    buildHud(w, list, undefined, true);
    expect(texts(list)).toContain('BOSS');
    expect(texts(list)).not.toContain('HI');
    const L = HUD_LAYOUT;
    expect(rects(list, HUD_COLORS.bossFrame)).toEqual([[L.bossBarX, 2, BOSS_HP_BAR_WIDTH, 4]]);
    // Full strength: the whole inner width (the test boss's core 24 + plates 10 + 10).
    expect(w.bosses.hpBar.maxHp).toBe(44);
    expect(rects(list, HUD_COLORS.bossFill)).toEqual([[L.bossBarX + 1, 3, 62, 2]]);
    // A plate down: ⌈34 × 62 / 44⌉ = 48 px.
    w.bosses.damagePart(5, 10, 0);
    run(w, 1);
    buildHud(w, list, undefined, true);
    expect(rects(list, HUD_COLORS.bossFill)).toEqual([[L.bossBarX + 1, 3, 48, 2]]);
    // No boss: the hi-score is back.
    w.bosses.clear();
    run(w, 1);
    buildHud(w, list, undefined, true);
    expect(texts(list)).toContain('HI');
    expect(rects(list, HUD_COLORS.bossFrame)).toEqual([]);
  });

  it('rebuilds when the fill’s pixels or the option change, and not otherwise', () => {
    const w = withBoss();
    const hud = createHud();
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    run(w, 1);
    hud.update(w, list);
    // Without the option the intro's filling bar changes nothing shown.
    const builds = hud.builds;
    run(w, 10);
    expect(hud.update(w, list)).toBe(false);
    expect(hud.builds).toBe(builds);
    // With it, every change of the fill in pixels rebuilds.
    hud.showBossHp = true;
    expect(hud.update(w, list)).toBe(true);
    expect(texts(list)).toContain('BOSS');
    expect(hud.update(w, list)).toBe(false);
    run(w, 200);
    expect(hud.update(w, list)).toBe(true);
    expect(hud.update(w, list)).toBe(false);
    // 1 hp off the core (24 of 44): ⌈43 × 62 / 44⌉ = 61 px — a rebuild.
    w.bosses.damagePart(4, 1, 0);
    run(w, 1);
    expect(hud.update(w, list)).toBe(false);
    w.bosses.damagePart(5, 1, 0);
    run(w, 1);
    expect(hud.update(w, list)).toBe(true);
    expect(rects(list, HUD_COLORS.bossFill)[0]?.[2]).toBe(61);
  });
});
