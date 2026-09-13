/**
 * The weapon select of plan M2-03 — edge cases (the main suite is `scenes-weapon-select.test.ts`):
 * a host config's loadout (type, Weapon Edit, `!`, AUTO, an empty or long order) shown on the first
 * visit; navigation skipping the locked slot rows; TYPE wrapping into and out of EDIT (the rows
 * back on the preset's weapons); the preview's main weapon following the focused row; the ORDER
 * editor's Back, an all-`-` order and an order longer than its rows (kept — the regression of the
 * M2-03 test pass); `setOrder`'s filtering; the choice kept over a Back but reaching the game only
 * on START; a START back on the defaults reusing the host config; a fresh preview per visit.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_POWER_UP_ORDER,
  MAX_AUTO_POWER_UP_ORDER,
  type GameConfig,
  type MeterSlotName,
} from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import {
  AUTO_ORDER_LABELS,
  AUTO_ORDER_ROWS,
  WEAPON_EDIT_LABEL,
  WeaponSelectItem,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';

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

/** The KESTREL, every shipped weapon and the weapon range. */
const DB: ContentDb = ((): ContentDb => {
  const { db, issues } = loadContent(
    [
      'player/kestrel.player.json',
      'tilesets/terrain-a.tileset.json',
      'weapons/type-a.weapons.json',
      'weapons/types-b-d.weapons.json',
      'enemies/weapon-range.enemies.json',
      'stages/weapon-range.stage.json',
    ].map(shipped),
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** A headless session with the scene flow, on the title. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;

  /**
   * Creates the session.
   *
   * @param config - Config overrides (free flight by default).
   */
  constructor(config: Partial<GameConfig> = {}) {
    this.game = createGame(this.platform, { seed: 4, ...config }, DB, { scenes: 'title' });
    this.flow = this.game.scenes!;
  }

  /** Scene ids, bottom to top. */
  get ids(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.flow.stack.depth; i++) out.push(this.flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Runs ticks with a held mask.
   *
   * @param held - Held actions.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.events.clear();
    }
  }

  /**
   * Presses and releases an action.
   *
   * @param action - The action.
   * @param times - How often.
   */
  press(action: ActionMask, times = 1): void {
    for (let i = 0; i < times; i++) {
      this.hold(action);
      this.hold(0);
    }
  }

  /** PRESS OK, START, NORMAL: the weapon select opens (and its 2-tick lock runs out). */
  openSelect(): void {
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.ids).toEqual(['title', 'difficulty']);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    this.hold(0, 2);
  }

  /** Back to the difficulty menu, then in again (NORMAL remembered). */
  reopen(): void {
    this.press(Action.Back);
    expect(this.ids).toEqual(['title', 'difficulty']);
    this.hold(0, 2);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    this.hold(0, 2);
  }

  /** Focus on START, then OK: the game. */
  launch(): void {
    this.focus(WeaponSelectItem.Start);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['game']);
  }

  /**
   * Moves the weapon select's focus to an item (Down).
   *
   * @param item - `WeaponSelectItem`.
   */
  focus(item: number): void {
    const menu = this.flow.weaponSelect.menu;
    for (let i = 0; i < 20 && menu.focus !== item; i++) this.press(Action.Down);
    expect(menu.focus).toBe(item);
  }

  /** Opens the ORDER editor (its lock run out). */
  openOrder(): void {
    this.focus(WeaponSelectItem.Order);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['title', 'difficulty', 'weaponSelect', 'autoOrder']);
    this.hold(0, 2);
  }

  /**
   * The weapon select's slot rows.
   *
   * @returns TYPE, MISSILE, DOUBLE, LASER labels.
   */
  rows(): string[] {
    const s = this.flow.weaponSelect;
    return [s.type.label, s.missile.label, s.double.label, s.laser.label];
  }
}

describe('core/scenes weapon select edges (M2-03): the host config`s loadout', () => {
  it('opens on the host config`s type, `!`, AUTO and an empty order; START keeps the config', () => {
    const s = new Session({
      weaponPreset: 'type-c',
      megaChoice: 'lifeOption',
      autoPowerUp: true,
      autoPowerUpOrder: [],
    });
    s.openSelect();
    const select = s.flow.weaponSelect;
    expect(s.rows()).toEqual(['TYPE C', '2-WAY MISSILE', 'VERTICAL', 'CYCLONE LASER']);
    expect([select.mega.label, select.auto.value, select.orderLength, select.orderLabel]).toEqual([
      'LIFE OPTION',
      true,
      0,
      'NONE',
    ]);
    expect(select.editing).toBe(false);
    s.launch();
    expect(s.game.world.config).toBe(s.game.config);
    expect(s.game.world.config.autoPowerUpOrder).toEqual([]);
  });

  it('opens on EDIT with the host config`s Weapon Edit (the rows unlocked, the preview flying it)', () => {
    const edit = { missile: 'missile.ground', double: 'shot.free', laser: 'laser.cyclone' };
    const s = new Session({ weaponPreset: 'type-b', weaponEdit: edit });
    s.openSelect();
    const select = s.flow.weaponSelect;
    expect(s.rows()).toEqual([WEAPON_EDIT_LABEL, 'MISSILE', 'FREE WAY', 'CYCLONE LASER']);
    expect(select.editing).toBe(true);
    expect(select.menu.enabled(WeaponSelectItem.Missile)).toBe(true);
    expect(select.preview?.weapons.roleWeapons.map((w) => w?.id)).toEqual([
      'shot.basic',
      'shot.free',
      'laser.cyclone',
      'missile.ground',
    ]);
    s.launch();
    expect(s.game.world.config).toBe(s.game.config);
    expect(s.game.world.config).toMatchObject({ weaponPreset: 'type-b', weaponEdit: edit });
  });

  it('keeps an order longer than the editor`s rows when the editor closes', () => {
    const order: MeterSlotName[] = [
      ...DEFAULT_AUTO_POWER_UP_ORDER,
      'speed',
      'speed',
      'double',
      'mega',
      'missile',
      'laser',
    ];
    expect(order.length).toBe(AUTO_ORDER_ROWS + 2);
    const s = new Session({ autoPowerUp: true, autoPowerUpOrder: order });
    s.openSelect();
    const select = s.flow.weaponSelect;
    expect(select.orderLength).toBe(order.length);
    expect(select.orderLabel).toBe('S M L O O O O ? +');
    // Opening the editor and backing out changes nothing…
    s.openOrder();
    expect(s.flow.autoOrder.entries.map((e) => e.label)).toEqual([
      'SPEED',
      'MISSILE',
      'LASER',
      'OPTION',
      'OPTION',
      'OPTION',
      'OPTION',
      '?',
      'SPEED',
      'SPEED',
      'DOUBLE',
      '!',
    ]);
    s.press(Action.Back);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    expect(select.orderLength).toBe(order.length);
    // …and editing a row keeps the entries past the rows after the edited ones.
    s.hold(0, 2);
    s.openOrder();
    s.press(Action.Left); // row 1: SPEED → `-` (wraps)
    expect(s.flow.autoOrder.entries[0].label).toBe('-');
    for (let i = 0; i < 20 && s.flow.autoOrder.menu.focus !== AUTO_ORDER_ROWS; i++) {
      s.press(Action.Down);
    }
    s.press(Action.Confirm); // DONE
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    s.hold(0, 2);
    s.launch();
    expect(s.game.world.config.autoPowerUpOrder).toEqual(order.slice(1));
  });
});

describe('core/scenes weapon select edges (M2-03): TYPE, EDIT and the locked rows', () => {
  it('Down skips the locked slot rows; under EDIT it stops on them', () => {
    const s = new Session();
    s.openSelect();
    const menu = s.flow.weaponSelect.menu;
    s.press(Action.Down); // START → TYPE
    expect(menu.focus).toBe(WeaponSelectItem.Type);
    s.press(Action.Down);
    // The locked slot rows are skipped: OPTION (M2-04) is next.
    expect(menu.focus).toBe(WeaponSelectItem.Option);
    s.press(Action.Up);
    expect(menu.focus).toBe(WeaponSelectItem.Type);
    s.press(Action.Left); // TYPE A → EDIT (wraps)
    expect(s.flow.weaponSelect.editing).toBe(true);
    s.press(Action.Down);
    expect(menu.focus).toBe(WeaponSelectItem.Missile);
    // Leaving EDIT locks the rows again.
    s.press(Action.Up);
    s.press(Action.Right); // EDIT → TYPE A (wraps)
    expect(s.flow.weaponSelect.editing).toBe(false);
    expect(menu.enabled(WeaponSelectItem.Missile)).toBe(false);
  });

  it('EDIT starts from the last type`s weapons; leaving it resets the rows; START on a type drops the edit', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    s.press(Action.Down); // TYPE
    s.press(Action.Left); // EDIT: TYPE A's weapons
    expect(s.rows()).toEqual([WEAPON_EDIT_LABEL, 'MISSILE', 'DOUBLE', 'LASER']);
    s.press(Action.Down); // MISSILE
    s.press(Action.Right, 2); // → 2-WAY MISSILE
    expect(select.missile.label).toBe('2-WAY MISSILE');
    expect(select.preview?.weapons.roleWeapons[3]?.id).toBe('missile.twoWay');
    s.press(Action.Up); // TYPE
    s.press(Action.Right); // EDIT → TYPE A: the rows are TYPE A's again, and so is the preview
    expect(s.rows()).toEqual(['TYPE A', 'MISSILE', 'DOUBLE', 'LASER']);
    expect(select.preview?.weapons.roleWeapons[3]?.id).toBe('missile.ground');
    s.press(Action.Left); // back to EDIT: nothing of the earlier edit is left
    expect(s.rows()).toEqual([WEAPON_EDIT_LABEL, 'MISSILE', 'DOUBLE', 'LASER']);
    s.press(Action.Right); // TYPE A
    expect(select.arsenal()).toMatchObject({ weaponPreset: 'type-a', weaponEdit: null });
    s.launch();
    expect(s.game.world.config).toBe(s.game.config);
  });

  it('`?` and `!` leave the preview`s weapons alone', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    const preview = select.preview!;
    const before = preview.weapons.roleWeapons.slice();
    s.focus(WeaponSelectItem.Mega);
    s.press(Action.Right, 3);
    expect(select.mega.label).toBe('LIFE OPTION');
    s.press(Action.Up); // `?`: FORCE FIELD → SHIELD (M2-04)
    s.press(Action.Right);
    expect(select.shield.label).toBe('SHIELD');
    expect(preview.weapons.roleWeapons).toEqual(before);
    expect(select.arsenal()).toMatchObject({
      megaChoice: 'lifeOption',
      shieldChoice: 'shield',
    });
  });
});

describe('core/scenes weapon select edges (M2-03): the preview', () => {
  it('its main weapon follows the focused row: MISSILE the shot, DOUBLE / LASER their slot', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    s.press(Action.Down);
    s.press(Action.Left); // EDIT
    const loadout = select.preview!.weapons.loadouts[0];
    for (const [item, main] of [
      [WeaponSelectItem.Missile, MainWeapon.Basic],
      [WeaponSelectItem.Double, MainWeapon.Double],
      [WeaponSelectItem.Laser, MainWeapon.Laser],
    ] as const) {
      s.focus(item);
      s.hold(0, 3);
      expect(loadout.main, String(item)).toBe(main);
      expect(loadout.missile).toBe(true);
    }
  });

  it('elsewhere the Laser and the Double take turns every 240 ticks', () => {
    const s = new Session();
    s.openSelect();
    const loadout = s.flow.weaponSelect.preview!.weapons.loadouts[0];
    const switches: number[] = [];
    let last = loadout.main;
    for (let t = 0; t < 800; t++) {
      s.hold(0);
      if (loadout.main !== last) switches.push(t);
      last = loadout.main;
      expect([MainWeapon.Laser, MainWeapon.Double]).toContain(loadout.main);
    }
    expect(switches.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < switches.length; k++) expect(switches[k] - switches[k - 1]).toBe(240);
  });

  it('is a fresh World on every visit, dropped by Back and START, never the game`s', () => {
    const s = new Session();
    expect(s.flow.weaponSelect.preview).toBeNull();
    s.openSelect();
    const first = s.flow.weaponSelect.preview!;
    const game = s.game.world;
    const gameTick = game.tick;
    s.hold(0, 30);
    expect(game.tick).toBe(gameTick);
    expect(first.tick).toBeGreaterThan(30);
    s.reopen();
    const second = s.flow.weaponSelect.preview!;
    expect(second).not.toBe(first);
    expect(second.players[0].state).toBe('alive');
    // The god-mode preview survives anything the range does.
    s.hold(0, 600);
    expect(second.players[0].state).toBe('alive');
    expect(second.status).toBe('playing');
    s.launch();
    expect(s.flow.weaponSelect.preview).toBeNull();
    expect(s.game.renderFrame().world).toBe(s.game.world.view);
  });
});

describe('core/scenes weapon select edges (M2-03): the order', () => {
  it('Back stores the editor`s rows like DONE; an all-`-` order is NONE and reaches the game empty', () => {
    const s = new Session({ autoPowerUpOrder: ['speed', 'laser'] });
    s.openSelect();
    const select = s.flow.weaponSelect;
    s.openOrder();
    const editor = s.flow.autoOrder;
    const none = AUTO_ORDER_LABELS.length - 1;
    expect(editor.entries.slice(2).every((e) => e.index === none)).toBe(true);
    s.press(Action.Right); // row 1: SPEED → MISSILE
    s.press(Action.Back);
    expect(select.orderLabel).toBe('M L');
    s.hold(0, 2);
    s.openOrder();
    s.press(Action.Left, 2); // row 1: MISSILE → SPEED → `-`
    s.press(Action.Down);
    s.press(Action.Right, 4); // row 2: LASER → OPTION, `?`, `!`, `-`
    expect(editor.entries.every((e) => e.index === none)).toBe(true);
    s.press(Action.Back);
    expect([select.orderLength, select.orderLabel]).toEqual([0, 'NONE']);
    s.hold(0, 2);
    s.launch();
    expect(s.game.world.config.autoPowerUpOrder).toEqual([]);
  });

  it('setOrder keeps meter slot codes only, at most 32, and asks for a redraw', () => {
    const s = new Session();
    const select = s.flow.weaponSelect;
    const revision = select.uiRevision;
    select.setOrder([MeterSlot.Mega, -1, 7, 99, MeterSlot.Speed]);
    expect(Array.from(select.orderSlots.subarray(0, select.orderLength))).toEqual([
      MeterSlot.Mega,
      MeterSlot.Speed,
    ]);
    expect(select.orderLabel).toBe('! S');
    expect(select.uiRevision).toBeGreaterThan(revision);
    select.setOrder(new Array<number>(40).fill(MeterSlot.Option));
    expect(select.orderLength).toBe(MAX_AUTO_POWER_UP_ORDER);
    expect(select.arsenal().autoPowerUpOrder).toHaveLength(MAX_AUTO_POWER_UP_ORDER);
    select.setOrder([]);
    expect(select.orderLabel).toBe('NONE');
  });
});

describe('core/scenes weapon select edges (M2-03): START and the flow', () => {
  it('a choice is kept over a Back, but only START hands it to the game', () => {
    const s = new Session();
    s.openSelect();
    s.press(Action.Down);
    s.press(Action.Right); // TYPE B
    s.reopen();
    expect(s.flow.weaponSelect.type.label).toBe('TYPE B');
    expect(s.flow.weaponSelect.menu.focus).toBe(WeaponSelectItem.Start);
    expect(s.flow.gameConfig).toBe(s.game.config);
    expect(s.flow.arsenal).toEqual({});
    s.launch();
    expect(s.game.world.config.weaponPreset).toBe('type-b');
    expect(s.flow.arsenal).toMatchObject({ weaponPreset: 'type-b' });
  });

  it('a later START back on the defaults plays the host config object again', () => {
    const s = new Session();
    s.openSelect();
    s.press(Action.Down);
    s.press(Action.Right); // TYPE B
    s.launch();
    const armed = s.game.world.config;
    expect(armed).not.toBe(s.game.config);
    // Quit to the title and START again with TYPE A.
    s.press(Action.Pause);
    s.press(Action.Up);
    s.press(Action.Confirm);
    s.press(Action.Left);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    s.openSelect();
    expect(s.flow.weaponSelect.type.label).toBe('TYPE B');
    s.press(Action.Down);
    s.press(Action.Left); // TYPE A
    s.launch();
    expect(s.game.world.config).toBe(s.game.config);
  });

  it('another difficulty gets the loadout on top of its own preset', () => {
    const s = new Session();
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.press(Action.Down, 2); // HARD → ARCADE
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    s.hold(0, 2);
    s.focus(WeaponSelectItem.Mega);
    s.press(Action.Right); // NORMAL
    s.launch();
    expect(s.game.world.config).toMatchObject({
      difficulty: 'arcade',
      startingLives: 2,
      continues: 0,
      megaChoice: 'normal',
      weaponPreset: 'type-a',
    });
  });
});
