/**
 * The weapon select's OPTION and `?` rows (plan M2-04) — edge cases beyond
 * `scenes-weapon-select.test.ts`:
 *
 * - the rows open on the host config's `optionChoice` / `shieldChoice`, and START with nothing
 *   changed keeps the host config itself;
 * - OPTION cycles all four types both ways (wrapping), `?` all five shields; every change hands
 *   the type to the preview's group, which starts afresh (retracted, the toggle cleared);
 * - the preview's spread / retract presses (`PREVIEW_SPREAD_TICKS`) happen only while OPTION is
 *   focused;
 * - leaving and re-entering the select keeps the choice, and the new preview flies it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPTION_CHOICES, SHIELD_CHOICES, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import {
  OPTION_CHOICE_LABELS,
  PREVIEW_SPREAD_TICKS,
  SHIELD_CHOICE_LABELS,
  WeaponSelectItem,
  type SceneFlow,
} from '../../src/scenes/index.js';
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
  /** The platform. */
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  /** The game. */
  readonly game: Game;
  /** Its scene flow. */
  readonly flow: SceneFlow;

  /**
   * Creates the session.
   *
   * @param config - Config overrides.
   */
  constructor(config: Partial<GameConfig> = {}) {
    this.game = createGame(this.platform, { seed: 4, ...config }, DB, { scenes: 'title' });
    this.flow = this.game.scenes!;
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

  /**
   * The id of the top scene.
   *
   * @returns The id (or `null` with an empty stack).
   */
  top(): string | null {
    const depth = this.flow.stack.depth;
    return depth > 0 ? (this.flow.stack.sceneAt(depth - 1)?.id ?? null) : null;
  }

  /** PRESS OK, START, NORMAL: the weapon select opens (its lock run out). */
  openSelect(): void {
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    this.hold(0, 2);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.top()).toBe('weaponSelect');
  }

  /**
   * Moves the focus to an item (Down).
   *
   * @param item - `WeaponSelectItem`.
   */
  focus(item: number): void {
    const menu = this.flow.weaponSelect.menu;
    for (let i = 0; i < 20 && menu.focus !== item; i++) this.press(Action.Down);
    expect(menu.focus).toBe(item);
  }
}

describe('core/scenes weapon select (M2-04): OPTION and `?` rows', () => {
  it('open on the host config`s choices; START unchanged keeps the host config', () => {
    const s = new Session({ optionChoice: 'snake', shieldChoice: 'reduce' });
    s.openSelect();
    const select = s.flow.weaponSelect;
    expect([select.option.label, select.shield.label]).toEqual(['SNAKE', 'REDUCE']);
    expect(select.preview!.weapons.options[0].formation).toBe('snake');
    expect(select.arsenal()).toMatchObject({ optionChoice: 'snake', shieldChoice: 'reduce' });
    s.focus(WeaponSelectItem.Start);
    s.press(Action.Confirm);
    expect(s.game.world.config).toBe(s.game.config);
    expect(s.game.world.weapons.options.map((g) => g.formation)).toEqual(['snake', 'snake']);
  });

  it('OPTION cycles every type both ways; each change retracts the preview`s group', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    const group = select.preview!.weapons.options[0];
    s.focus(WeaponSelectItem.Option);
    const seen: string[] = [select.option.label];
    for (let i = 0; i < OPTION_CHOICES.length; i++) {
      // Let the preview spread first, so the change visibly retracts it.
      group.toggled = true;
      group.spreadTicks = 7;
      s.press(Action.Right);
      seen.push(select.option.label);
      expect(group.formation).toBe(OPTION_CHOICES[(i + 1) % OPTION_CHOICES.length]);
      expect([group.toggled, group.spreadTicks]).toEqual([false, 0]);
    }
    expect(seen).toEqual([...OPTION_CHOICE_LABELS, OPTION_CHOICE_LABELS[0]]);
    s.press(Action.Left);
    expect([select.option.label, group.formation]).toEqual(['ROTATE', 'rotate']);
    s.press(Action.Left, 3);
    expect([select.option.label, group.formation]).toEqual(['TRAIL', 'trail']);
  });

  it('`?` cycles all five shields in order and START takes the last one', () => {
    const s = new Session();
    s.openSelect();
    const select = s.flow.weaponSelect;
    s.focus(WeaponSelectItem.Shield);
    const seen: string[] = [];
    for (let i = 0; i < SHIELD_CHOICES.length; i++) {
      seen.push(select.shield.label);
      expect(select.arsenal().shieldChoice).toBe(SHIELD_CHOICES[i]);
      s.press(Action.Right);
    }
    expect(seen).toEqual([...SHIELD_CHOICE_LABELS]);
    expect(select.shield.label).toBe('FORCE FIELD'); // wrapped
    s.press(Action.Left, 2); // → ROTATE
    s.focus(WeaponSelectItem.Start);
    s.press(Action.Confirm);
    expect(s.game.world.config.shieldChoice).toBe('rotateShield');
  });

  it('the preview spreads and retracts only while OPTION is focused', () => {
    const s = new Session({ optionChoice: 'formation' });
    s.openSelect();
    const select = s.flow.weaponSelect;
    const group = select.preview!.weapons.options[0];
    // Focused on START (where it opens): no presses.
    s.hold(0, 2 * PREVIEW_SPREAD_TICKS);
    expect([group.toggled, group.spreadTicks]).toEqual([false, 0]);
    s.focus(WeaponSelectItem.Option);
    let toggles = 0;
    let last = group.toggled;
    for (let t = 0; t < 3 * PREVIEW_SPREAD_TICKS; t++) {
      s.hold(0);
      if (group.toggled !== last) toggles++;
      last = group.toggled;
    }
    expect(toggles).toBeGreaterThanOrEqual(2);
    // Focus away: the state freezes (no more presses).
    s.press(Action.Down);
    expect(select.menu.focus).toBe(WeaponSelectItem.Shield);
    const frozen = group.toggled;
    s.hold(0, 3 * PREVIEW_SPREAD_TICKS);
    expect(group.toggled).toBe(frozen);
  });

  it('leaving and re-entering keeps the Option type; the new preview flies it', () => {
    const s = new Session();
    s.openSelect();
    s.focus(WeaponSelectItem.Option);
    s.press(Action.Right, 2); // FORMATION
    s.press(Action.Back);
    s.hold(0, 2);
    expect(s.flow.weaponSelect.preview).toBeNull();
    s.press(Action.Confirm);
    s.hold(0, 2);
    const select = s.flow.weaponSelect;
    expect(select.option.label).toBe('FORMATION');
    expect(select.preview!.weapons.options[0].formation).toBe('formation');
  });
});
