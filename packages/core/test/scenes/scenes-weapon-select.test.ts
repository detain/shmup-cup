/**
 * The weapon select of plan M2-03, headless through `createGame(…, { scenes })` (acceptance:
 * "select scene flow"): the difficulty menu's OK opens it focused on START; TYPE A–D or EDIT
 * (Weapon Edit: every slot's weapon), the `?` and `!` choices, AUTO and its ORDER editor, START
 * (the game's World gets the loadout — `withArsenal`) and Back (the difficulty menu); the choice is
 * kept for RETRY and the next game; the live preview (a mini World on the weapon range that swaps
 * its weapons with the choice and never makes a sound in the game's queue).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import {
  AUTO_ORDER_LABELS,
  AUTO_ORDER_ROWS,
  MEGA_CHOICE_LABELS,
  PREVIEW_OPTIONS,
  PREVIEW_SHIP_X,
  PauseItem,
  SHIELD_CHOICE_LABELS,
  WEAPON_EDIT_LABEL,
  WEAPON_RANGE_STAGE,
  WeaponSelectItem,
  type SceneFlow,
  OPTION_CHOICE_LABELS,
  PREVIEW_SPREAD_TICKS,
} from '../../src/scenes/index.js';
import { OPTION_SPREAD_TICKS } from '../../src/options/index.js';
import { ShotFlag, ShotKind } from '../../src/weapons/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import type { GameConfig } from '../../src/config/index.js';

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

/** The KESTREL, every shipped weapon and the weapon range (its tileset, stage and targets). */
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

/** A headless session with the scene flow. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Drained events `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  /**
   * Creates the session on the title.
   *
   * @param config - Config overrides (free flight by default).
   * @param content - The content (default {@link DB}).
   */
  constructor(config: Partial<GameConfig> = {}, content: ContentDb = DB) {
    this.game = createGame(this.platform, { seed: 4, ...config }, content, { scenes: 'title' });
    this.flow = this.game.scenes!;
  }

  /** Scene ids, bottom to top. */
  get ids(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.flow.stack.depth; i++) out.push(this.flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Runs ticks with a held mask, rendering and draining the events.
   *
   * @param held - Held actions.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.renderFrame();
      this.game.events.drain((e) => {
        this.events.push([e.kind, e.id, e.param]);
      });
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

  /** OK on START. */
  launch(): void {
    expect(this.flow.weaponSelect.menu.focus).toBe(WeaponSelectItem.Start);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['game']);
  }

  /**
   * Moves the weapon select's focus to an item (Up / Down).
   *
   * @param item - `WeaponSelectItem`.
   */
  focus(item: number): void {
    const menu = this.flow.weaponSelect.menu;
    for (let i = 0; i < 20 && menu.focus !== item; i++) this.press(Action.Down);
    expect(menu.focus).toBe(item);
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns Its text commands' strings.
   */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++)
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    return out;
  }

  /**
   * The SFX cues since an index.
   *
   * @param from - First event index.
   * @returns Cue ids.
   */
  sounds(from = 0): number[] {
    return this.events
      .slice(from)
      .filter((e) => e[0] === SimEventKind.Sfx)
      .map((e) => e[1]);
  }
}

describe('core/scenes the weapon select (M2-03)', () => {
  it('opens after the difficulty menu, focused on START, with the host config`s loadout', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    expect(select.menu.focus).toBe(WeaponSelectItem.Start);
    expect(select.type.labels).toEqual(['TYPE A', 'TYPE B', 'TYPE C', 'TYPE D', WEAPON_EDIT_LABEL]);
    expect(select.shield.labels).toEqual(SHIELD_CHOICE_LABELS);
    expect(select.mega.labels).toEqual(MEGA_CHOICE_LABELS);
    // MISSILE / DOUBLE / LASER are the type's (disabled until EDIT).
    for (const item of [
      WeaponSelectItem.Missile,
      WeaponSelectItem.Double,
      WeaponSelectItem.Laser,
    ]) {
      expect(select.menu.enabled(item)).toBe(false);
    }
    const texts = s.uiTexts();
    expect(texts).toContain('WEAPON SELECT');
    const menu = texts.slice(texts.indexOf('WEAPON SELECT') + 1);
    expect(menu).toEqual(
      expect.arrayContaining([
        'TYPE',
        'TYPE A',
        'MISSILE',
        'DOUBLE',
        'LASER',
        '? SLOT',
        'FORCE FIELD',
        '! SLOT',
        'MEGA CRASH',
        'AUTO',
        'OFF',
        'ORDER',
        'S M L O O O O ?',
        'START',
      ]),
    );
    expect(s.game.inputContext).toBe('menu');
    // OK: the game, on the host config itself (nothing changed).
    s.launch();
    expect(s.game.world.config).toBe(s.game.config);
    expect(s.flow.weaponSelect.preview).toBeNull();
  });

  it('TYPE B–D: the slot rows show the type`s weapons and START plays them', () => {
    const s = new Session();
    s.openSelect();
    s.press(Action.Down); // START → TYPE (wraps)
    expect(s.flow.weaponSelect.menu.focus).toBe(WeaponSelectItem.Type);
    const from = s.events.length;
    s.press(Action.Right);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuMove]);
    const select = s.flow.weaponSelect;
    expect([
      select.type.label,
      select.missile.label,
      select.double.label,
      select.laser.label,
    ]).toEqual(['TYPE B', 'SPREAD BOMB', 'TAIL GUN', 'RIPPLE LASER']);
    s.press(Action.Right);
    expect([select.missile.label, select.double.label, select.laser.label]).toEqual([
      '2-WAY MISSILE',
      'VERTICAL',
      'CYCLONE LASER',
    ]);
    s.press(Action.Confirm); // OK on TYPE steps it too
    expect([
      select.type.label,
      select.missile.label,
      select.double.label,
      select.laser.label,
    ]).toEqual(['TYPE D', 'PHOTON TORPEDO', 'FREE WAY', 'TWIN LASER']);
    s.press(Action.Up); // TYPE → START (wraps)
    s.launch();
    const world = s.game.world;
    expect(world.config).toMatchObject({ weaponPreset: 'type-d', weaponEdit: null });
    expect(world.weapons.roleWeapons.map((w) => w?.id)).toEqual([
      'shot.basic',
      'shot.free',
      'laser.twin',
      'missile.torpedo',
    ]);
    expect(s.flow.gameConfig).toBe(world.config);
    expect(s.flow.arsenal).toMatchObject({ weaponPreset: 'type-d' });
  });

  it('EDIT: every slot`s weapon can be chosen (Weapon Edit), the main shot is the last type`s', () => {
    const s = new Session();
    s.openSelect();
    s.press(Action.Down); // TYPE
    s.press(Action.Right); // TYPE B
    s.press(Action.Right, 3); // C, D, EDIT
    const select = s.flow.weaponSelect;
    expect(select.editing).toBe(true);
    expect(select.menu.enabled(WeaponSelectItem.Missile)).toBe(true);
    // The rows start from TYPE D's weapons.
    expect([select.missile.label, select.double.label, select.laser.label]).toEqual([
      'PHOTON TORPEDO',
      'FREE WAY',
      'TWIN LASER',
    ]);
    s.press(Action.Down); // MISSILE
    s.press(Action.Right); // PHOTON TORPEDO → MISSILE (wraps)
    s.press(Action.Right); // → SPREAD BOMB
    s.press(Action.Down); // DOUBLE
    s.press(Action.Left); // FREE WAY → VERTICAL
    s.press(Action.Down); // LASER
    s.press(Action.Left); // TWIN LASER → CYCLONE LASER
    expect([select.missile.label, select.double.label, select.laser.label]).toEqual([
      'SPREAD BOMB',
      'VERTICAL',
      'CYCLONE LASER',
    ]);
    // The preview flies them.
    expect(select.preview?.weapons.roleWeapons.map((w) => w?.id)).toEqual([
      'shot.basic',
      'shot.vertical',
      'laser.cyclone',
      'missile.spread',
    ]);
    s.focus(WeaponSelectItem.Start);
    s.launch();
    expect(s.game.world.config).toMatchObject({
      weaponPreset: 'type-d',
      weaponEdit: { missile: 'missile.spread', double: 'shot.vertical', laser: 'laser.cyclone' },
    });
  });

  it('`?`, `!`, AUTO and the ORDER editor go into the game`s config', () => {
    const s = new Session();
    s.openSelect();
    s.focus(WeaponSelectItem.Mega);
    s.press(Action.Right); // MEGA CRASH → NORMAL
    s.press(Action.Right); // → SPEED DOWN
    s.press(Action.Down); // AUTO
    s.press(Action.Right); // ON
    s.press(Action.Down); // ORDER
    const from = s.events.length;
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect', 'autoOrder']);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuSelect]);
    s.hold(0, 2);
    const editor = s.flow.autoOrder;
    // The rows show the order (then `-`).
    expect(editor.entries.map((e) => e.label)).toEqual([
      'SPEED',
      'MISSILE',
      'LASER',
      'OPTION',
      'OPTION',
      'OPTION',
      'OPTION',
      '?',
      '-',
      '-',
      '-',
      '-',
    ]);
    expect(editor.entries).toHaveLength(AUTO_ORDER_ROWS);
    expect(AUTO_ORDER_LABELS[AUTO_ORDER_LABELS.length - 1]).toBe('-');
    s.press(Action.Right); // row 1: SPEED → MISSILE
    s.press(Action.Down);
    s.press(Action.Left); // row 2: MISSILE → SPEED
    s.press(Action.Down);
    s.press(Action.Left, 3); // row 3: LASER → DOUBLE → MISSILE → SPEED
    s.press(Action.Down, 5); // row 8 (`?`)
    s.press(Action.Right); // → !
    s.press(Action.Down);
    s.press(Action.Confirm); // row 9: `-` → SPEED (OK steps it)
    s.press(Action.Up); // row 8
    s.press(Action.Down, 5); // DONE
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    const select = s.flow.weaponSelect;
    expect(select.orderLabel).toBe('M S S O O O O ! +');
    s.hold(0, 2);
    s.focus(WeaponSelectItem.Start);
    s.launch();
    expect(s.game.world.config).toMatchObject({
      megaChoice: 'speedDown',
      shieldChoice: 'forceField',
      autoPowerUp: true,
      autoPowerUpOrder: [
        'missile',
        'speed',
        'speed',
        'option',
        'option',
        'option',
        'option',
        'mega',
        'speed',
      ],
    });
  });

  it('OPTION and `?` (M2-04): the Option type flies in the preview and both go into the game', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    const group = select.preview!.weapons.options[0];
    expect([select.option.label, group.formation]).toEqual(['TRAIL', 'trail']);
    expect(OPTION_CHOICE_LABELS).toEqual(['TRAIL', 'SNAKE', 'FORMATION', 'ROTATE']);
    expect(SHIELD_CHOICE_LABELS).toEqual([
      'FORCE FIELD',
      'SHIELD',
      'FREE SHIELD',
      'ROTATE',
      'REDUCE',
    ]);
    s.focus(WeaponSelectItem.Option);
    s.press(Action.Left); // TRAIL → ROTATE (wraps)
    expect(select.option.label).toBe('ROTATE');
    expect(group.formation).toBe('rotate');
    // While OPTION is focused the preview's Options spread and retract now and then.
    s.hold(0, PREVIEW_SPREAD_TICKS + OPTION_SPREAD_TICKS + 2);
    expect(group.toggled || group.spreadTicks > 0).toBe(true);
    s.press(Action.Down); // `?`
    s.press(Action.Left); // FORCE FIELD → REDUCE (wraps)
    expect(select.shield.label).toBe('REDUCE');
    expect(select.arsenal()).toMatchObject({ optionChoice: 'rotate', shieldChoice: 'reduce' });
    s.focus(WeaponSelectItem.Start);
    s.launch();
    expect(s.game.world.config).toMatchObject({ optionChoice: 'rotate', shieldChoice: 'reduce' });
    expect(s.game.world.weapons.options[0].formation).toBe('rotate');
  });

  it('Back returns to the difficulty menu and drops the preview; RETRY and the next game keep the loadout', () => {
    const s = new Session();
    s.openSelect();
    expect(s.flow.weaponSelect.preview).not.toBeNull();
    let from = s.events.length;
    s.press(Action.Back);
    expect(s.ids).toEqual(['title', 'difficulty']);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
    expect(s.flow.weaponSelect.preview).toBeNull();
    s.hold(0, 2);
    s.press(Action.Down); // HARD
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    s.hold(0, 2);
    s.press(Action.Down); // TYPE
    s.press(Action.Right, 2); // TYPE C
    s.press(Action.Up); // START
    s.launch();
    const world = s.game.world;
    expect(world.config).toMatchObject({ difficulty: 'hard', weaponPreset: 'type-c' });
    // RETRY STAGE: the same loadout.
    s.press(Action.Pause);
    s.press(Action.Down, 2);
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Retry);
    s.press(Action.Confirm);
    expect(s.game.world).not.toBe(world);
    expect(s.game.world.config.weaponPreset).toBe('type-c');
    // Quit, then START again: the weapon select shows TYPE C.
    s.press(Action.Pause);
    s.press(Action.Up);
    s.press(Action.Confirm);
    s.press(Action.Left);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    s.press(Action.Confirm); // PRESS OK
    s.press(Action.Confirm); // START
    s.hold(0, 2);
    from = s.events.length;
    s.press(Action.Confirm); // HARD (remembered)
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    expect(s.flow.weaponSelect.type.label).toBe('TYPE C');
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuSelect]);
  });

  it('flies a live preview on the weapon range: the chosen weapons, held ship, no sound', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    const preview = select.preview!;
    expect(preview).not.toBeNull();
    expect(preview.stage?.stage.id).toBe(WEAPON_RANGE_STAGE);
    expect(preview).not.toBe(s.game.world);
    expect(preview.debugFlags.godMode).toBe(true);
    expect(s.game.debug.godMode).toBe(false);
    let frame = s.game.renderFrame();
    expect(frame.world).toBe(preview.view);
    expect(frame.hud.count).toBe(0);
    const tick = preview.tick;
    s.hold(0, 10);
    expect(preview.tick).toBe(tick + 10);
    expect(s.game.renderFrame().tick).toBe(preview.tick);
    const ship = preview.players[0];
    expect(ship.state).toBe('alive');
    expect(ship.x - preview.camera.x).toBe(PREVIEW_SHIP_X);
    // Its Missile, Options and autofire; the preview's sounds never reach the game's queue.
    s.hold(0, 120);
    expect(preview.weapons.loadouts[0]).toMatchObject({ missile: true, options: PREVIEW_OPTIONS });
    expect(preview.weapons.count).toBeGreaterThan(0);
    expect(s.sounds()).not.toContain(SFX_CUES.PlayerShot);
    // It weaves up and down (the Free Way and the Options show).
    const ys = new Set<number>();
    for (let t = 0; t < 160; t++) {
      s.hold(0);
      ys.add(Math.round(ship.y - preview.camera.y));
    }
    expect(ys.size).toBeGreaterThan(20);
    // On TYPE the Laser and the Double take turns; TYPE B swaps the weapons in place.
    s.press(Action.Down);
    s.press(Action.Right);
    expect(select.preview).toBe(preview);
    const seen = new Set<number>();
    for (let t = 0; t < 600; t++) {
      s.hold(0);
      const f = preview.weapons.pool.fields;
      for (let i = 0; i < preview.weapons.pool.count; i++) {
        if ((f.flags[i] & ShotFlag.Dead) === 0) seen.add(f.kind[i]);
      }
    }
    expect(seen.has(ShotKind.Ripple)).toBe(true);
    expect(seen.has(ShotKind.SpreadBomb)).toBe(true);
    expect(seen.has(ShotKind.Double)).toBe(true); // the Tail Gun
    // The range restarts at its end: the preview keeps playing.
    preview.stage!.jumpTo(preview.stage!.stage.length - 1);
    s.hold(0, 5);
    expect(preview.status).toBe('playing');
    expect(preview.camera.x).toBeLessThan(100);
    frame = s.game.renderFrame();
    expect(frame.world).toBe(preview.view);
  });

  it('works without weapons or a weapon range: free flight, TYPE DEFAULT, no EDIT', () => {
    const s = new Session({}, loadContent([]).db);
    s.openSelect();
    const select = s.flow.weaponSelect;
    expect(select.type.labels).toEqual(['DEFAULT']);
    expect(select.editIndex).toBe(-1);
    expect(select.missile.labels).toEqual(['NONE']);
    expect(select.preview?.stage).toBeNull();
    s.hold(0, 30);
    s.launch();
    expect(s.game.world.config).toBe(s.game.config);
  });
});
