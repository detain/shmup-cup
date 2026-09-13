/**
 * # ui — canvas UI kit, HUD model and bitmap text layout
 *
 * **Responsibility.** Everything on screen that is not gameplay — without DOM or a UI framework
 * (shmup_tech.md §4.10). The core owns the widgets' state, their focus and their layout as
 * renderer-agnostic draw commands (`DrawList`, plan §3.4); `@shmup/render-pixi` draws the lists
 * with atlas sprites and the bitmap font.
 *
 * - **Widgets.** {@link ListMenu} (`items`, `focus`, `disabledMask`, optional wrap) whose items are
 *   plain actions, {@link Slider}s, {@link Toggle}s or {@link Choice}s (one of several labels — the
 *   Options screen's input-profile selector, M1-17), and the YES / NO {@link Confirm} prompt
 *   (default NO). {@link menuTick} / {@link confirmTick} advance one widget by one tick of input:
 *   Up / Down move the focus (disabled items are skipped, the list wraps when asked), Left / Right
 *   change the focused slider, toggle or choice (or the prompt's answer), Confirm activates (and
 *   flips a toggle / steps a choice), Back backs out.
 *   Directions auto-repeat by **held duration** — once on the press, again after
 *   {@link MENU_REPEAT_DELAY} ticks, then every {@link MENU_REPEAT_INTERVAL} ticks — independent of
 *   any device key repeat (the input adapters drop those). A Confirm press is **buffered** for
 *   {@link MENU_CONFIRM_BUFFER_TICKS} ticks, so a press made while a widget still holds activation
 *   back (it just opened — {@link ListMenu.lockTicks}) is not lost (shmup_feat.md §4 "input
 *   buffering for menus").
 *   Both return a {@link MenuResult} code the scene acts on (no callbacks, no allocation);
 *   {@link menuResultSfx} maps it to the menu sound.
 * - **Builders.** {@link drawPanel} (a framed translucent box), {@link drawMenu} (the items with
 *   the focus cursor, disabled items dimmed, a slider's bar and value, a toggle's `ON` / `OFF`, a
 *   choice's label) and
 *   {@link drawConfirm} (question + YES / NO). Text goes through the list's string slots: a builder
 *   writes a slot only when its text changed, so redrawing a menu never builds strings.
 * - **HUD** (decision D20: two 8-px bars outside the playfield). {@link buildHud} draws the top bar
 *   `1P 00012300  HI 00050000  2P ------` and the bottom bar — `lives − 1` stock icons, the 7-slot
 *   power meter (`SPEED MISSILE DOUBLE LASER OPTION ? !` — the MISSILE / DOUBLE / LASER slots
 *   named after the session's weapons since M2-03 —, the highlighted slot flashing every
 *   {@link HUD_METER_FLASH_TICKS} ticks, slots that cannot be equipped dimmed) and the Force
 *   Field's pips; numbers use the `number` op. In **Direct mode** (M2-05 — shmup_feat.md §6B
 *   "visible tier pips in the HUD") the meter makes way for the **tier pips**: `SHOT` (one pip per
 *   level above 0, in the family's colour), `SUB`, `ARM` (one pip per hit it can take, in its
 *   tier's colour — green, silver, gold), `SPD` (the Speed toggle's level) and the main-shot
 *   family's label. {@link Hud.update} rebuilds the list **only when something it shows changed**
 *   (the scores' dirty flags, lives, the meter cursor and equippable mask, the flash phase, the
 *   shield, the Direct-mode levels, family and speed) and never allocates.
 *
 * The widgets are plain state objects the scenes own (`core/scenes` builds its title and pause
 * menus and the YES / NO dialog from them); nothing here knows about scenes, sounds or the stack.
 * Because the widgets answer with numbers and draw through string slots, a menu can be ticked and
 * redrawn every frame without allocating — but a {@link MenuLayout} passed to {@link drawMenu}
 * must be a constant (a frozen object built once): an object literal written at the call site
 * allocates on every redraw.
 *
 * Sprites are referenced by id: {@link UI_SPRITES} names the atlas sprites the kit draws (the HUD
 * pieces, the title logo); hosts intern them with the engine's sprites (`core/world`
 * `ENGINE_SPRITES` includes them) and {@link resolveUiSprites} looks their ids up. A sprite the
 * content table does not have (id -1) is replaced by rectangles or text.
 *
 * **Implements.**
 * - shmup_feat.md §17 — HUD (score 1P / HI / 2P, lives, power meter with the flashing highlight
 *   and greyed slots) and the canvas-drawn UI kit (list menu, slider, toggle, confirm dialog)
 * - shmup_feat.md §4 — remote-first menus: D-pad + OK + Back only (rule 8), buffered presses
 * - shmup_tech.md §4.10 — no UI framework; canvas menus + bitmap font
 * - shmup_feat.md §6B — the Direct-mode HUD's visible tier pips (M2-05)
 * - shmup_feat.md §17 — the co-op P2 HUD and the `PRESS START` join prompt (M2-06)
 *
 * **Public API.** Widgets: {@link ListMenu}, {@link MenuItem}, {@link MenuItemKind},
 * {@link Slider}, {@link Toggle}, {@link Choice}, {@link Confirm}, {@link ConfirmChoice},
 * {@link DirectionRepeat}, {@link createListMenu}, {@link createSlider}, {@link createToggle},
 * {@link createChoice}, {@link createConfirm},
 * {@link menuTick}, {@link confirmTick}, {@link repeatDirections}, {@link MenuResult},
 * {@link menuResultSfx}, {@link MENU_REPEAT_DELAY}, {@link MENU_REPEAT_INTERVAL},
 * {@link MENU_CONFIRM_BUFFER_TICKS}. Builders: {@link drawPanel}, {@link drawMenu},
 * {@link drawConfirm}, {@link menuStringSlots}, {@link CONFIRM_STRING_SLOTS}, {@link MenuLayout},
 * {@link UI_COLORS}. HUD: {@link Hud}, {@link createHud}, {@link buildHud}, {@link HUD_COLORS},
 * {@link HUD_LAYOUT}, {@link HUD_STRING_SLOTS}, {@link HUD_METER_FLASH_TICKS},
 * {@link METER_LABEL_FRAMES}, {@link meterLabelFrame} (M2-03). Sprites:
 * {@link UI_SPRITES}, {@link UiSprites}, {@link resolveUiSprites}. `TextMetrics` (the bitmap-font
 * measuring contract, `presentation`) is re-exported.
 *
 * M2-05: {@link HUD_FAMILY_COLORS}, {@link HUD_ARM_COLORS}, {@link HUD_STRING_COUNT},
 * {@link HUD_COMMAND_COUNT}. M2-06: {@link HudPlayerState}, {@link hudPlayerState},
 * {@link METER_SHORT_LABELS}, {@link HUD_PROMPT_BLINK_TICKS}. M2-09: {@link BOSS_HP_BAR_WIDTH},
 * {@link BossHpBarView}, {@link bossHpBarFill}.
 *
 * **Boss HP bar (M2-09).** With the `bossHpBar` display option ({@link Hud.showBossHp}, the
 * `buildHud` argument) the top bar shows `BOSS` and a bar filled by {@link bossHpBarFill} of the
 * World's `bosses.hpBar` in place of the hi-score while a boss is fought; the HUD rebuilds when the
 * fill's pixel count changes.
 *
 * **Co-op HUD (M2-06).** In a co-op game a player who may drop in shows a blinking `PRESS START`
 * where its score goes; while both ships play, the bottom bar splits into two compact halves
 * (player 2's stock icon in its palette swap), and a player out of lives shows `PRESS START` (it
 * may continue) or `GAME OVER` in its half — see {@link buildHud}.
 *
 * **Planned.** The key-rebind prompt and the 3-letter name entry (M2-15 / M2-16).
 *
 * @module
 */
import type { ContentDb } from '../data/index.js';
import { SFX_CUES } from '../events/index.js';
import { Action, type PlayerInput } from '../input/index.js';
import { defineModule } from '../module-info.js';
import { playerOut } from '../player/index.js';
import { METER_SLOT_COUNT, MeterSlot, directMaxLevel } from '../powerups/index.js';
import { TextAlign, type DrawList } from '../presentation/index.js';
import { ShieldKind, shieldActive } from '../shields/index.js';
import { WEAPON_BEHAVIOR_LABELS, WeaponRole } from '../weapons/index.js';
import type { World } from '../world/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'ui',
  status: 'partial',
  specRefs: ['shmup_feat.md §17', 'shmup_feat.md §4', 'shmup_tech.md §4.10', 'shmup_feat.md §6'],
});

// Bitmap-font metrics for layout live in `presentation` (the renderer implements them).
export type { TextMetrics } from '../presentation/index.js';

// ------------------------------------------------------------------------------ sprites

/**
 * Atlas sprites the UI kit draws: the HUD's stock icon (and player 2's palette swap of it —
 * M2-06), meter slot box (frames normal / highlighted / disabled) and slot labels (one frame per
 * slot), and the title logo. Part of the
 * core's `ENGINE_SPRITES`, so every host interns them.
 */
export const UI_SPRITES: readonly string[] = Object.freeze([
  'hud/life',
  'hud/life@p2',
  'hud/meter-slot',
  'hud/meter-labels',
  'ui/logo',
]);

/** Sprite ids of {@link UI_SPRITES} in a content table (-1 = not interned: drawn without it). */
export interface UiSprites {
  /** `hud/life` — a stock ship. */
  readonly life: number;
  /** `hud/life@p2` — player 2's stock ship, the palette swap (M2-06; the co-op HUD). */
  readonly lifeP2: number;
  /** `hud/meter-slot` — frame 0 normal, 1 highlighted, 2 disabled. */
  readonly meterSlot: number;
  /** `hud/meter-labels` — frame = the slot's `MeterSlot` code. */
  readonly meterLabels: number;
  /** `ui/logo` — the title logo (anchor: its centre). */
  readonly logo: number;
}

/**
 * Looks up the ids of {@link UI_SPRITES} in a content database's sprite table.
 *
 * @param content - Validated content (loaded with `extraSprites` including `UI_SPRITES`).
 * @returns The ids; -1 for a sprite the table does not have (e.g. `EMPTY_CONTENT_DB`).
 *
 * @example
 * ```ts
 * const sprites = resolveUiSprites(game.content);
 * const hud = createHud(sprites);
 * ```
 */
export function resolveUiSprites(content: ContentDb): UiSprites {
  const index = content.sprites.index;
  const id = (name: string): number => {
    const value = index.get(name);
    return value === undefined ? -1 : value;
  };
  return Object.freeze({
    life: id('hud/life'),
    lifeP2: id('hud/life@p2'),
    meterSlot: id('hud/meter-slot'),
    meterLabels: id('hud/meter-labels'),
    logo: id('ui/logo'),
  });
}

/** Sprite ids that draw nothing (every UI sprite missing). */
const NO_SPRITES: UiSprites = Object.freeze({
  life: -1,
  lifeP2: -1,
  meterSlot: -1,
  meterLabels: -1,
  logo: -1,
});

// ------------------------------------------------------------------------------ input

/** Ticks a direction must be held before it repeats. */
export const MENU_REPEAT_DELAY = 18;

/** Ticks between two repeats of a held direction after the delay. */
export const MENU_REPEAT_INTERVAL = 6;

/** Ticks a Confirm press stays buffered for a widget that is not taking input yet. */
export const MENU_CONFIRM_BUFFER_TICKS = 4;

/** The four direction bits. */
const DIRECTIONS = Action.Up | Action.Down | Action.Left | Action.Right;

/**
 * Held-duration auto-repeat of one direction (a class: its counters stay small integers).
 *
 * @remarks
 * Only the direction pressed last repeats; releasing it stops the repeat until a direction is
 * pressed again.
 */
export class DirectionRepeat {
  /** The repeating {@link Action} direction bit (0 = none). */
  dir = 0;
  /** Ticks it has been held since its press (0 on the press tick). */
  held = 0;

  /** Forgets the held direction (a widget opened or took focus). */
  reset(): void {
    this.dir = 0;
    this.held = 0;
  }
}

/**
 * The directions a widget acts on this tick: a newly pressed direction at once, the held one
 * again after {@link MENU_REPEAT_DELAY} ticks and then every {@link MENU_REPEAT_INTERVAL} ticks.
 *
 * @remarks
 * When several directions are pressed on one tick the lowest bit wins (Up, Down, Left, Right). A
 * tap latched between two polls (pressed but no longer held) acts once and does not repeat.
 * Never allocates.
 *
 * @param state - The widget's repeat state (updated).
 * @param input - This tick's (menu) input.
 * @returns One {@link Action} direction bit, or 0.
 *
 * @example
 * ```ts
 * // Up pressed on tick 0 and held: acts on ticks 0, 18, 24, 30, …
 * const dir = repeatDirections(menu.repeat, input);
 * ```
 */
export function repeatDirections(state: DirectionRepeat, input: Readonly<PlayerInput>): number {
  const pressed = input.pressed & DIRECTIONS;
  if (pressed !== 0) {
    const dir = pressed & -pressed;
    state.dir = dir;
    state.held = 0;
    return dir;
  }
  const dir = state.dir;
  if (dir === 0) return 0;
  if ((input.held & dir) === 0) {
    state.dir = 0;
    state.held = 0;
    return 0;
  }
  const held = ++state.held;
  if (held >= MENU_REPEAT_DELAY && (held - MENU_REPEAT_DELAY) % MENU_REPEAT_INTERVAL === 0) {
    return dir;
  }
  return 0;
}

/** What one widget tick did. */
export const MenuResult = {
  /** Nothing happened. */
  None: 0,
  /** The focus moved (menu move sound). */
  Moved: 1,
  /** A slider, toggle or the prompt's choice changed value. */
  Changed: 2,
  /** The focused item / choice was activated (Confirm). */
  Confirmed: 3,
  /** Back was pressed. */
  Back: 4,
  /** Confirm on a disabled item (denied sound). */
  Denied: 5,
} as const;

/** A {@link MenuResult} code. */
export type MenuResult = (typeof MenuResult)[keyof typeof MenuResult];

/**
 * The menu sound of a widget result.
 *
 * @param result - A {@link MenuResult}.
 * @returns An `SFX_CUES` id, or -1 for `None`.
 */
export function menuResultSfx(result: number): number {
  switch (result) {
    case MenuResult.Moved:
    case MenuResult.Changed:
      return SFX_CUES.MenuMove;
    case MenuResult.Confirmed:
      return SFX_CUES.MenuSelect;
    case MenuResult.Back:
    case MenuResult.Denied:
      // A refusal sounds like backing out: menu cues play on the unpanned UI bus.
      return SFX_CUES.MenuBack;
    default:
      return -1;
  }
}

// ------------------------------------------------------------------------------ widgets

/** Kinds of {@link MenuItem}. */
export const MenuItemKind = {
  /** A plain entry: Confirm activates it. */
  Action: 0,
  /** A value slider: Left / Right change it. */
  Slider: 1,
  /** An on / off switch: Left / Right / Confirm flip it. */
  Toggle: 2,
  /** One of several labels: Left / Right step through them (wrapping), Confirm steps forward. */
  Choice: 3,
} as const;

/** A {@link MenuItemKind} code. */
export type MenuItemKind = (typeof MenuItemKind)[keyof typeof MenuItemKind];

/** A value between `min` and `max` in `step`s (audio volumes 0–10 in M1-17). */
export class Slider {
  /** Current value. */
  value: number;

  /**
   * Creates the slider.
   *
   * @param min - Smallest value.
   * @param max - Largest value.
   * @param step - Change per Left / Right.
   * @param value - Starting value (clamped).
   */
  constructor(
    readonly min: number,
    readonly max: number,
    readonly step: number,
    value: number,
  ) {
    this.value = value < min ? min : value > max ? max : value;
  }
}

/** An on / off switch. */
export class Toggle {
  /**
   * Creates the toggle.
   *
   * @param value - Starting state.
   */
  constructor(public value: boolean) {}
}

/**
 * One of several labelled values (the Options screen's CONTROLS: the input profiles). A class so
 * its index stays an unboxed small integer.
 */
export class Choice {
  /** The labels (upper case), at least one. */
  readonly labels: readonly string[];
  /** Index of the chosen label. */
  index: number;

  /**
   * Creates the choice (use {@link createChoice}).
   *
   * @param labels - The labels.
   * @param index - Starting index (clamped into range).
   */
  constructor(labels: readonly string[], index: number) {
    this.labels = labels;
    const last = labels.length - 1;
    this.index = !(index > 0) ? 0 : index > last ? last : Math.floor(index);
  }

  /** The chosen label. */
  get label(): string {
    return this.labels[this.index];
  }
}

/** One entry of a {@link ListMenu}. */
export interface MenuItem {
  /** Text drawn with the bitmap font (upper case). */
  readonly label: string;
  /** What the item is. */
  readonly kind: MenuItemKind;
  /** The slider of a `Slider` item, else `null`. */
  readonly slider: Slider | null;
  /** The toggle of a `Toggle` item, else `null`. */
  readonly toggle: Toggle | null;
  /** The choice of a `Choice` item, else `null`. */
  readonly choice: Choice | null;
}

/**
 * A vertical list of items with one focused (shmup_feat.md §17 "list menu"). A class so its
 * counters stay unboxed.
 */
export class ListMenu {
  /** The items, top to bottom. */
  readonly items: readonly MenuItem[];
  /** Index of the focused item. */
  focus: number;
  /** Bit `i` set = item `i` is disabled (skipped by the focus, Confirm denied). */
  disabledMask: number;
  /** Whether moving past either end wraps to the other. */
  wrap: boolean;
  /**
   * Ticks activation still waits (the menu just opened): a Confirm pressed meanwhile is buffered;
   * Back and the directions act as usual.
   */
  lockTicks = 0;
  /** Ticks a buffered Confirm press stays pending (0 = none). */
  confirmBuffer = 0;
  /** Held-duration auto-repeat of the directions. */
  readonly repeat = new DirectionRepeat();
  /** Increases whenever the menu's look changes (focus, a value, the disabled mask via setters). */
  revision = 0;

  /**
   * Creates the menu (use {@link createListMenu}).
   *
   * @param items - The items.
   * @param focus - Initially focused item.
   * @param disabledMask - Disabled items.
   * @param wrap - Wrap-around.
   */
  constructor(items: readonly MenuItem[], focus: number, disabledMask: number, wrap: boolean) {
    this.items = items;
    this.focus = focus;
    this.disabledMask = disabledMask;
    this.wrap = wrap;
  }

  /**
   * Whether an item can be focused and activated.
   *
   * @param index - Item index.
   * @returns `true` for an existing, enabled item.
   */
  enabled(index: number): boolean {
    return index >= 0 && index < this.items.length && (this.disabledMask & (1 << index)) === 0;
  }

  /**
   * Enables or disables an item; a disabled focused item passes the focus on.
   *
   * @param index - Item index.
   * @param disabled - The new state.
   */
  setDisabled(index: number, disabled: boolean): void {
    const bit = 1 << index;
    const mask = disabled ? this.disabledMask | bit : this.disabledMask & ~bit;
    if (mask === this.disabledMask) return;
    this.disabledMask = mask;
    this.revision++;
    if (!this.enabled(this.focus)) this.focusFirstEnabled(this.focus);
  }

  /**
   * Focuses the first enabled item at or after `from` (wrapping), or keeps the focus when none is
   * enabled.
   *
   * @param from - Where to start looking.
   */
  focusFirstEnabled(from: number): void {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (this.enabled(i)) {
        if (i !== this.focus) {
          this.focus = i;
          this.revision++;
        }
        return;
      }
    }
  }

  /**
   * Resets the transient input state and optionally locks the menu (it just opened).
   *
   * @param lockTicks - Ticks activation waits for (default 0).
   */
  open(lockTicks = 0): void {
    this.repeat.reset();
    this.confirmBuffer = 0;
    this.lockTicks = lockTicks;
  }
}

/** Options of {@link createListMenu}. */
export interface ListMenuOptions {
  /** Initially focused item (default the first enabled one). */
  readonly focus?: number;
  /** Disabled items as a bit mask (default none). */
  readonly disabledMask?: number;
  /** Wrap from the last item to the first and back (default `true`). */
  readonly wrap?: boolean;
}

/**
 * An item description for {@link createListMenu}: a label (an action), or a label with a slider,
 * toggle or choice (the first one given wins).
 */
export type MenuItemSpec =
  | string
  | {
      /** Label. */
      readonly label: string;
      /** A slider for this item. */
      readonly slider?: Slider;
      /** A toggle for this item. */
      readonly toggle?: Toggle;
      /** A choice for this item. */
      readonly choice?: Choice;
    };

/**
 * Creates a list menu (load time — scenes build their menus once).
 *
 * @param items - Up to 31 items: labels (actions) or `{ label, slider | toggle | choice }`.
 * @param options - Focus, disabled mask, wrap.
 * @returns The menu, focused on the first enabled item at or after `options.focus`.
 * @throws {RangeError} For no items or more than 31.
 *
 * @example
 * ```ts
 * const menu = createListMenu(['RESUME', 'OPTIONS', 'QUIT TO TITLE'], { disabledMask: 0b010 });
 * const result = menuTick(menu, input); // MenuResult.Confirmed → act on menu.focus
 * ```
 */
export function createListMenu(
  items: readonly MenuItemSpec[],
  options: ListMenuOptions = {},
): ListMenu {
  if (items.length === 0 || items.length > 31) {
    throw new RangeError(`a list menu has 1–31 items, got ${items.length}`);
  }
  const built: MenuItem[] = items.map((spec): MenuItem => {
    if (typeof spec === 'string') {
      return Object.freeze({
        label: spec,
        kind: MenuItemKind.Action,
        slider: null,
        toggle: null,
        choice: null,
      });
    }
    const slider = spec.slider ?? null;
    const toggle = slider === null ? (spec.toggle ?? null) : null;
    const choice = slider === null && toggle === null ? (spec.choice ?? null) : null;
    const kind: MenuItemKind =
      slider !== null
        ? MenuItemKind.Slider
        : toggle !== null
          ? MenuItemKind.Toggle
          : choice !== null
            ? MenuItemKind.Choice
            : MenuItemKind.Action;
    return Object.freeze({ label: spec.label, kind, slider, toggle, choice });
  });
  const menu = new ListMenu(
    Object.freeze(built),
    options.focus ?? 0,
    options.disabledMask ?? 0,
    options.wrap ?? true,
  );
  menu.focusFirstEnabled(menu.focus);
  return menu;
}

/**
 * Creates a slider.
 *
 * @param min - Smallest value.
 * @param max - Largest value (≥ `min`).
 * @param step - Change per Left / Right (> 0).
 * @param value - Starting value (clamped).
 * @returns The slider.
 * @throws {RangeError} When `max < min` or `step` is not positive.
 */
export function createSlider(min: number, max: number, step: number, value: number): Slider {
  if (!(max >= min) || !(step > 0)) {
    throw new RangeError(`bad slider range ${min}…${max} step ${step}`);
  }
  return new Slider(min, max, step, value);
}

/**
 * Creates a toggle.
 *
 * @param value - Starting state.
 * @returns The toggle.
 */
export function createToggle(value: boolean): Toggle {
  return new Toggle(value);
}

/**
 * Creates a choice between labels.
 *
 * @param labels - The labels (upper case), 1–255 of them (copied and frozen).
 * @param index - Starting index (clamped into range; default 0).
 * @returns The choice.
 * @throws {RangeError} For no labels or more than 255.
 *
 * @example
 * ```ts
 * const profile = createChoice(['SAFE 4-WAY (DEFAULT)', 'FAST 8-WAY'], 0);
 * createListMenu([{ label: 'CONTROLS', choice: profile }]);
 * ```
 */
export function createChoice(labels: readonly string[], index = 0): Choice {
  if (labels.length === 0 || labels.length > 255) {
    throw new RangeError(`a choice has 1–255 labels, got ${labels.length}`);
  }
  return new Choice(Object.freeze(labels.slice()), index);
}

/**
 * Moves the focus one enabled item up (-1) or down (+1).
 *
 * @param menu - The menu.
 * @param delta - -1 or +1.
 * @returns Whether the focus moved.
 */
function moveFocus(menu: ListMenu, delta: number): boolean {
  const n = menu.items.length;
  let i = menu.focus;
  for (let k = 1; k < n; k++) {
    i += delta;
    if (i < 0 || i >= n) {
      if (!menu.wrap) return false;
      i = i < 0 ? n - 1 : 0;
    }
    if (menu.enabled(i)) {
      menu.focus = i;
      menu.revision++;
      return true;
    }
  }
  return false;
}

/**
 * Changes the focused item's slider or toggle for a Left (-1) / Right (+1) press.
 *
 * @param item - The focused item.
 * @param delta - -1 or +1.
 * @returns Whether a value changed.
 */
function adjustItem(item: MenuItem, delta: number): boolean {
  const slider = item.slider;
  if (slider !== null) {
    let value = slider.value + delta * slider.step;
    if (value < slider.min) value = slider.min;
    if (value > slider.max) value = slider.max;
    if (value === slider.value) return false;
    slider.value = value;
    return true;
  }
  const toggle = item.toggle;
  if (toggle !== null) {
    const value = delta > 0;
    if (toggle.value === value) return false;
    toggle.value = value;
    return true;
  }
  const choice = item.choice;
  if (choice !== null) return stepChoice(choice, delta);
  return false;
}

/**
 * Steps a choice by one label, wrapping at both ends.
 *
 * @param choice - The choice.
 * @param delta - -1 or +1.
 * @returns Whether the index changed (never for a single label).
 */
function stepChoice(choice: Choice, delta: number): boolean {
  const n = choice.labels.length;
  if (n < 2) return false;
  const next = choice.index + delta;
  choice.index = next < 0 ? n - 1 : next >= n ? 0 : next;
  return true;
}

/**
 * Advances a list menu by one tick of input.
 *
 * @remarks
 * Order: a Confirm press (re)fills the confirm buffer; Back wins (`Back`); while
 * {@link ListMenu.lockTicks} > 0 activation waits — the lock and the buffer count down, a press
 * older than {@link MENU_CONFIRM_BUFFER_TICKS} ticks is dropped — otherwise a buffered Confirm
 * activates (a disabled item → `Denied`; a toggle flips / a choice with two or more labels steps
 * forward → `Changed`; anything else → `Confirmed` with `menu.focus` the item). Then the
 * auto-repeated direction (also while locked): Up / Down move the focus over enabled items
 * (wrapping when `wrap`), Left / Right change the focused slider (clamped), set the toggle (Left
 * off, Right on) or step the choice (wrapping). Never allocates.
 *
 * @param menu - The menu (updated; `revision` increases on visible changes).
 * @param input - This tick's menu input (one player's, or both merged).
 * @returns What happened ({@link MenuResult}).
 *
 * @example
 * ```ts
 * const result = menuTick(menu, input);
 * if (result === MenuResult.Confirmed && menu.focus === START) startGame();
 * ```
 */
export function menuTick(menu: ListMenu, input: Readonly<PlayerInput>): MenuResult {
  if ((input.pressed & Action.Confirm) !== 0) menu.confirmBuffer = MENU_CONFIRM_BUFFER_TICKS;
  if ((input.pressed & Action.Back) !== 0) {
    menu.confirmBuffer = 0;
    return MenuResult.Back;
  }
  if (menu.lockTicks > 0) {
    // Locked: activation waits (the press stays buffered), the focus still moves.
    menu.lockTicks--;
    if (menu.confirmBuffer > 0) menu.confirmBuffer--;
  } else if (menu.confirmBuffer > 0) {
    menu.confirmBuffer = 0;
    const index = menu.focus;
    if (!menu.enabled(index)) return MenuResult.Denied;
    const item = menu.items[index];
    const toggle = item.toggle;
    if (toggle !== null) {
      toggle.value = !toggle.value;
      menu.revision++;
      return MenuResult.Changed;
    }
    const choice = item.choice;
    if (choice !== null && stepChoice(choice, 1)) {
      menu.revision++;
      return MenuResult.Changed;
    }
    return MenuResult.Confirmed;
  }
  const dir = repeatDirections(menu.repeat, input);
  if (dir === Action.Up || dir === Action.Down) {
    return moveFocus(menu, dir === Action.Up ? -1 : 1) ? MenuResult.Moved : MenuResult.None;
  }
  if (dir === Action.Left || dir === Action.Right) {
    if (!menu.enabled(menu.focus)) return MenuResult.None;
    if (adjustItem(menu.items[menu.focus], dir === Action.Left ? -1 : 1)) {
      menu.revision++;
      return MenuResult.Changed;
    }
  }
  return MenuResult.None;
}

/** Choices of a {@link Confirm} prompt. */
export const ConfirmChoice = {
  /** YES (left). */
  Yes: 0,
  /** NO (right) — the default. */
  No: 1,
} as const;

/** A {@link ConfirmChoice} code. */
export type ConfirmChoice = (typeof ConfirmChoice)[keyof typeof ConfirmChoice];

/**
 * A YES / NO prompt (the Tizen exit confirmation, "quit to title?"). The focus starts on **NO** so
 * a stray OK never confirms something destructive.
 */
export class Confirm {
  /** The question (upper case; `\n` for a second line). */
  question: string;
  /** Focused {@link ConfirmChoice}. */
  focus: ConfirmChoice = ConfirmChoice.No;
  /** Ticks activation still waits (a Confirm pressed meanwhile is buffered). */
  lockTicks = 0;
  /** Ticks a buffered Confirm press stays pending. */
  confirmBuffer = 0;
  /** Held-duration auto-repeat of Left / Right. */
  readonly repeat = new DirectionRepeat();
  /** Increases whenever the prompt's look changes. */
  revision = 0;

  /**
   * Creates the prompt (use {@link createConfirm}).
   *
   * @param question - The question.
   */
  constructor(question: string) {
    this.question = question;
  }

  /**
   * Opens the prompt: focus back on NO, input state cleared.
   *
   * @param question - The question to ask (kept when omitted).
   * @param lockTicks - Ticks activation waits for (default 0).
   */
  open(question: string = this.question, lockTicks = 0): void {
    if (question !== this.question || this.focus !== ConfirmChoice.No) this.revision++;
    this.question = question;
    this.focus = ConfirmChoice.No;
    this.repeat.reset();
    this.confirmBuffer = 0;
    this.lockTicks = lockTicks;
  }
}

/**
 * Creates a YES / NO prompt, focused on NO.
 *
 * @param question - The question.
 * @returns The prompt.
 */
export function createConfirm(question: string): Confirm {
  return new Confirm(question);
}

/**
 * Advances a YES / NO prompt by one tick of input: Left / Right (and Up / Down) move between YES
 * and NO (no wrap), Confirm answers the focused choice (`Confirmed`, read `confirm.focus`), Back
 * answers NO (`Back`). Confirm presses are buffered and held back by `lockTicks` like
 * {@link menuTick}'s. Never allocates.
 *
 * @param confirm - The prompt.
 * @param input - This tick's menu input.
 * @returns What happened ({@link MenuResult}): `Moved`, `Confirmed`, `Back` or `None`.
 *
 * @example
 * ```ts
 * const result = confirmTick(prompt, input);
 * if (result === MenuResult.Confirmed && prompt.focus === ConfirmChoice.Yes) platform.exit?.();
 * ```
 */
export function confirmTick(confirm: Confirm, input: Readonly<PlayerInput>): MenuResult {
  if ((input.pressed & Action.Confirm) !== 0) confirm.confirmBuffer = MENU_CONFIRM_BUFFER_TICKS;
  if ((input.pressed & Action.Back) !== 0) {
    confirm.confirmBuffer = 0;
    return MenuResult.Back;
  }
  if (confirm.lockTicks > 0) {
    confirm.lockTicks--;
    if (confirm.confirmBuffer > 0) confirm.confirmBuffer--;
  } else if (confirm.confirmBuffer > 0) {
    confirm.confirmBuffer = 0;
    return MenuResult.Confirmed;
  }
  const dir = repeatDirections(confirm.repeat, input);
  if (dir === 0) return MenuResult.None;
  const next = dir === Action.Left || dir === Action.Up ? ConfirmChoice.Yes : ConfirmChoice.No;
  if (next === confirm.focus) return MenuResult.None;
  confirm.focus = next;
  confirm.revision++;
  return MenuResult.Moved;
}

// ------------------------------------------------------------------------------ builders

/** Colours of the UI kit (VA-friendly, shmup_feat.md §18). */
export const UI_COLORS = Object.freeze({
  /** Normal item text. */
  text: 0xe8e8f0,
  /** Focused item text and cursor. */
  focus: 0xf8d030,
  /** Disabled item text. */
  disabled: 0x5a6078,
  /** Panel fill. */
  panel: 0x10173a,
  /** Panel border. */
  border: 0x5a6a98,
  /** Titles on panels and screens. */
  title: 0x38c8e8,
  /** Warnings and "game over". */
  alert: 0xf85858,
  /** Slider bar background. */
  track: 0x2a3050,
});

/** The cursor glyph drawn left of the focused item (`→` is in the pixel font). */
const CURSOR = '→';

/** Width in pixels of a slider's bar. */
const SLIDER_BAR_W = 50;

/**
 * Draws a framed box: a translucent fill and a 1-px border.
 *
 * @param list - Target draw list.
 * @param x - Left edge.
 * @param y - Top edge.
 * @param w - Width.
 * @param h - Height.
 * @param fill - Fill colour (default {@link UI_COLORS}.panel).
 * @param border - Border colour (default {@link UI_COLORS}.border).
 * @param alpha - Fill opacity 0…255 (default 232).
 */
export function drawPanel(
  list: DrawList,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number = UI_COLORS.panel,
  border: number = UI_COLORS.border,
  alpha = 232,
): void {
  list.rect(x, y, w, h, fill, alpha);
  list.rect(x, y, w, 1, border);
  list.rect(x, y + h - 1, w, 1, border);
  list.rect(x, y + 1, 1, h - 2, border);
  list.rect(x + w - 1, y + 1, 1, h - 2, border);
}

/** Where and how {@link drawMenu} lays a menu out. */
export interface MenuLayout {
  /** Alignment point of the labels (left edge, or the centre with `align` Center). */
  readonly x: number;
  /** Top of the first item. */
  readonly y: number;
  /** Row pitch (default 12). */
  readonly lineHeight?: number;
  /** {@link TextAlign} of the labels (default Left). */
  readonly align?: number;
  /** X of the cursor glyph (default `x - 10`). */
  readonly cursorX?: number;
  /** X of a slider's bar / a toggle's `ON` / `OFF` / a choice's label (default `x + 80`). */
  readonly valueX?: number;
}

/**
 * String slots {@link drawMenu} uses for a menu: one per item, then `ON`, `OFF` and the cursor,
 * then one per choice item (its current label).
 *
 * @param menu - The menu.
 * @returns The slot count.
 */
export function menuStringSlots(menu: ListMenu): number {
  let choices = 0;
  for (const item of menu.items) if (item.choice !== null) choices++;
  return menu.items.length + 3 + choices;
}

/**
 * Draws a menu's items: labels (focused in {@link UI_COLORS}.focus with the `→` cursor, disabled
 * ones dimmed), a slider's bar and value, a toggle's `ON` / `OFF`, a choice's label.
 *
 * @remarks
 * Uses the string slots `stringBase … stringBase + menuStringSlots(menu) − 1` of `list` and writes
 * a slot only when its text changed. Never allocates.
 *
 * @param list - Target draw list.
 * @param menu - The menu.
 * @param stringBase - First string slot the menu may use.
 * @param layout - Position, row pitch, alignment, cursor and value columns.
 * @returns The y below the last row.
 *
 * @example
 * ```ts
 * drawPanel(ui, 132, 80, 120, 60);
 * drawMenu(ui, pauseMenu, 0, { x: 192, y: 90, align: TextAlign.Center, cursorX: 146 });
 * ```
 */
export function drawMenu(
  list: DrawList,
  menu: ListMenu,
  stringBase: number,
  layout: MenuLayout,
): number {
  const items = menu.items;
  const n = items.length;
  const lineHeight = layout.lineHeight ?? 12;
  const align = layout.align ?? TextAlign.Left;
  const cursorX = layout.cursorX ?? layout.x - 10;
  const valueX = layout.valueX ?? layout.x + 80;
  const onSlot = stringBase + n;
  const offSlot = onSlot + 1;
  const cursorSlot = onSlot + 2;
  list.setString(onSlot, 'ON');
  list.setString(offSlot, 'OFF');
  list.setString(cursorSlot, CURSOR);
  let choiceSlot = cursorSlot + 1;
  let y = layout.y;
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const enabled = menu.enabled(i);
    const focused = i === menu.focus && enabled;
    const color = focused ? UI_COLORS.focus : enabled ? UI_COLORS.text : UI_COLORS.disabled;
    list.setString(stringBase + i, item.label);
    if (focused) list.text(cursorSlot, cursorX, y, UI_COLORS.focus);
    list.text(stringBase + i, layout.x, y, color, align);
    const slider = item.slider;
    if (slider !== null) {
      const span = slider.max - slider.min;
      const filled = span > 0 ? Math.round((SLIDER_BAR_W * (slider.value - slider.min)) / span) : 0;
      list.rect(valueX, y + 2, SLIDER_BAR_W, 4, UI_COLORS.track);
      if (filled > 0) list.rect(valueX, y + 2, filled, 4, color);
      list.number(slider.value, valueX + SLIDER_BAR_W + 6, y, 0, color);
    }
    const toggle = item.toggle;
    if (toggle !== null) list.text(toggle.value ? onSlot : offSlot, valueX, y, color);
    const choice = item.choice;
    if (choice !== null) {
      list.setString(choiceSlot, choice.label);
      list.text(choiceSlot, valueX, y, color);
      choiceSlot++;
    }
    y += lineHeight;
  }
  return y;
}

/** String slots {@link drawConfirm} uses: question, YES, NO, cursor. */
export const CONFIRM_STRING_SLOTS = 4;

/**
 * Draws a YES / NO prompt centred at a point: a panel, the question (up to two lines) and the two
 * choices, the focused one highlighted with the cursor.
 *
 * @remarks
 * Uses the string slots `stringBase … stringBase + 3` and writes them only when changed. Never
 * allocates.
 *
 * @param list - Target draw list.
 * @param confirm - The prompt.
 * @param stringBase - First string slot the prompt may use.
 * @param cx - Centre x of the panel.
 * @param cy - Centre y of the panel.
 */
export function drawConfirm(
  list: DrawList,
  confirm: Confirm,
  stringBase: number,
  cx: number,
  cy: number,
): void {
  const w = 176;
  const h = 52;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  drawPanel(list, x, y, w, h, UI_COLORS.panel, UI_COLORS.focus, 255);
  list.setString(stringBase, confirm.question);
  list.setString(stringBase + 1, 'YES');
  list.setString(stringBase + 2, 'NO');
  list.setString(stringBase + 3, CURSOR);
  list.text(stringBase, cx, y + 7, UI_COLORS.text, TextAlign.Center);
  const yesX = Math.round(cx - 32);
  const noX = Math.round(cx + 32);
  const row = y + h - 16;
  const yes = confirm.focus === ConfirmChoice.Yes;
  list.text(stringBase + 3, (yes ? yesX : noX) - 18, row, UI_COLORS.focus);
  list.text(stringBase + 1, yesX, row, yes ? UI_COLORS.focus : UI_COLORS.text, TextAlign.Center);
  list.text(stringBase + 2, noX, row, yes ? UI_COLORS.text : UI_COLORS.focus, TextAlign.Center);
}

// ------------------------------------------------------------------------------ HUD

/** Colours of the HUD bars. */
export const HUD_COLORS = Object.freeze({
  /** Direct mode (M2-05): an unlit tier pip. */
  pipOff: 0x2a3050,
  /** Direct mode: a lit `SUB` pip. */
  subPip: 0x58d858,
  /** Direct mode: a lit `SPD` pip. */
  speedPip: 0xe8e8f0,
  /** Direct mode: the tier pips' labels. */
  pipLabel: 0x9aa0c0,
  /** Bar fill (lifted navy, readable on VA panels). */
  bar: 0x1d2a5c,
  /** `1P` label. */
  p1: 0x38c8e8,
  /** `2P` label. */
  p2: 0xf88858,
  /** `HI` label. */
  hi: 0xf8d030,
  /** Numbers. */
  number: 0xe8e8f0,
  /** An inactive player's dashes. */
  inactive: 0x5a6078,
  /** Meter label on an equippable slot. */
  label: 0xe8e8f0,
  /** Meter label on a slot that cannot be equipped. */
  labelDisabled: 0x5a6078,
  /** A Force Field pip with a hit left. */
  shield: 0x38c8e8,
  /** A spent Force Field pip. */
  shieldSpent: 0x2a3050,
  /** Co-op (M2-06): the `PRESS START` prompt of a player who may join or continue. */
  prompt: 0xf8d030,
  /** Co-op: `GAME OVER` in the half of a player who is out for good. */
  over: 0xf84848,
  /** Co-op compact meter: a slot box that can be equipped. */
  slotOn: 0x18204a,
  /** Co-op compact meter: the highlighted slot's box. */
  slotLit: 0x5a3c10,
  /** Co-op compact meter: a slot box that cannot be equipped. */
  slotOff: 0x1c2030,
  /** The boss HP bar's `BOSS` label (M2-09). */
  bossLabel: 0xf85858,
  /** The boss HP bar's frame (and its empty part). */
  bossFrame: 0x0a1020,
  /** The boss HP bar's fill. */
  bossFill: 0xf85858,
});

/** Pixel positions of the HUD (frame coordinates, 384×216). */
export const HUD_LAYOUT = Object.freeze({
  /** Top bar row. */
  topY: 0,
  /** Bottom bar row (the playfield ends at 208). */
  bottomY: 208,
  /** `1P` label x; its score follows at `+16`. */
  p1X: 8,
  /** `HI` label x; the hi-score follows at `+16`. */
  hiX: 156,
  /** `2P` label x; its score (or dashes) follows at `+16`. */
  p2X: 292,
  /** Score digits. */
  digits: 8,
  /** First stock icon x (icons are 10 px apart). */
  stockX: 4,
  /** Most stock icons drawn; more show one icon and the count. */
  stockIcons: 5,
  /** First meter slot x (slots are 40 px wide). */
  meterX: 58,
  /** Meter slot width. */
  slotW: 40,
  /** First Force Field pip x (pips are 7 px apart). */
  shieldX: 344,
  /** Direct mode (M2-05): `SHOT` label x; its pips (5 px apart) start 26 px later. */
  shotX: 58,
  /** Direct mode: `SUB` label x; its pips start 20 px later. */
  subX: 130,
  /** Direct mode: `ARM` label x; its pips (6 px apart) start 20 px later. */
  armX: 196,
  /** Direct mode: `SPD` label x; its pips (6 px apart) start 20 px later. */
  speedX: 252,
  /** Direct mode: the main-shot family's label x. */
  familyX: 306,
  /** The boss HP bar's `BOSS` label x (M2-09; the bar replaces the hi-score while shown). */
  bossX: 148,
  /** The boss HP bar's frame x; the frame is {@link BOSS_HP_BAR_WIDTH} wide, 4 px tall. */
  bossBarX: 176,
  /**
   * Co-op (M2-06): width of each player's half of the bottom bar while both play (player 1 from
   * x 0, player 2 from x 192); the offsets below are relative to the half's left edge.
   */
  halfW: 192,
  /** Co-op: the stock icon x; the count follows 10 px later. */
  coopStockX: 2,
  /** Co-op: the first compact meter slot x (slots are {@link HUD_LAYOUT}.coopSlotW wide). */
  coopMeterX: 22,
  /** Co-op: compact meter slot width (a box with the slot's two-letter label). */
  coopSlotW: 20,
  /** Co-op: the first shield pip x (pips are 5 px apart). */
  coopShieldX: 164,
  /** Co-op Direct mode: `SH` (shot) label x; its pips (4 px apart) start 13 px later. */
  coopShotX: 22,
  /** Co-op Direct mode: `SB` (sub-weapon) label x. */
  coopSubX: 68,
  /** Co-op Direct mode: `AR` (Arm) label x. */
  coopArmX: 114,
  /** Co-op Direct mode: `SP` (speed) label x. */
  coopSpeedX: 148,
});

/**
 * The lit `SHOT` pips' colour of each Direct-mode main family (index = `Loadout.family`, wrapping):
 * Beam → Disc orange, Laser → Wave blue (M2-05).
 */
export const HUD_FAMILY_COLORS: readonly number[] = Object.freeze([0xf87838, 0x58b8f8]);

/** The `ARM` pips' colour per Arm tier (index = tier − 1): green, silver, gold (M2-05). */
export const HUD_ARM_COLORS: readonly number[] = Object.freeze([0x48d860, 0xc8d0e8, 0xf8d030]);

/**
 * The frames of the `hud/meter-labels` sprite, by label (shmup_feat.md §6A; the asset pipeline's
 * `procedural/hud.mjs` draws them in this order): the seven slot labels of Type A, then the names
 * of the Types B–D weapons the MISSILE / DOUBLE / LASER slots may hold (M2-03 — `core/weapons`
 * `WEAPON_BEHAVIOR_LABELS`).
 */
export const METER_LABEL_FRAMES: readonly string[] = Object.freeze([
  'SPEED',
  'MISSILE',
  'DOUBLE',
  'LASER',
  'OPTION',
  '?',
  '!',
  'SPREAD',
  '2-WAY',
  'TORPEDO',
  'TAIL',
  'VERTICAL',
  'FREE WAY',
  'RIPPLE',
  'CYCLONE',
  'TWIN',
]);

/**
 * The co-op HUD's compact meter labels (M2-06): two letters per {@link METER_LABEL_FRAMES} entry, in
 * the same order, drawn with the bitmap font in the 20-px slots of each player's half.
 */
export const METER_SHORT_LABELS: readonly string[] = Object.freeze([
  'SP',
  'MS',
  'DB',
  'LS',
  'OP',
  '?',
  '!',
  'SB',
  '2W',
  'TP',
  'TL',
  'VT',
  'FW',
  'RP',
  'CY',
  'TW',
]);

/**
 * The `hud/meter-labels` frame a meter slot shows in a World: the MISSILE / DOUBLE / LASER slots
 * show the name of the weapon the session's arsenal puts there (the loadout → meter mapping of
 * M2-03 — `SPREAD`, `TAIL`, `RIPPLE` … for Types B–D), every other slot its own label. Never
 * allocates.
 *
 * @param world - The World shown.
 * @param slot - `core/powerups` `MeterSlot` code.
 * @returns A frame index into {@link METER_LABEL_FRAMES} (the slot's own for an empty role or a
 *   weapon without a label frame).
 */
export function meterLabelFrame(world: World, slot: number): number {
  const role =
    slot === MeterSlot.Missile
      ? WeaponRole.Missile
      : slot === MeterSlot.Double
        ? WeaponRole.Double
        : slot === MeterSlot.Laser
          ? WeaponRole.Laser
          : -1;
  if (role < 0) return slot;
  const weapon = world.weapons.roleWeapons[role];
  if (weapon === null) return slot;
  const behavior = weapon.behavior;
  if (!Object.prototype.hasOwnProperty.call(WEAPON_BEHAVIOR_LABELS, behavior)) return slot;
  const frame = METER_LABEL_FRAMES.indexOf(WEAPON_BEHAVIOR_LABELS[behavior]);
  return frame >= 0 ? frame : slot;
}

/**
 * HUD string slots: `1P`, `HI`, `2P`, the inactive player's dashes; Direct mode (M2-05) adds the
 * tier pips' labels `SHOT`, `SUB`, `ARM`, `SPD` and the main-shot family's label; co-op (M2-06)
 * adds `PRESS START`, `GAME OVER`, the compact Direct labels `SH`, `SB`, `AR`, `SP` and the seven
 * compact meter labels (`meterShort` … `meterShort + 6`, {@link METER_SHORT_LABELS}).
 */
export const HUD_STRING_SLOTS = Object.freeze({
  p1: 0,
  hi: 1,
  p2: 2,
  dashes: 3,
  shot: 4,
  sub: 5,
  arm: 6,
  speed: 7,
  family: 8,
  pressStart: 9,
  gameOver: 10,
  shortShot: 11,
  shortSub: 12,
  shortArm: 13,
  shortSpeed: 14,
  meterShort: 15,
  /** `BOSS` (M2-09) — after the seven compact meter labels. */
  boss: 22,
});

/**
 * String slots a HUD list needs ({@link HUD_STRING_SLOTS}: the seven compact meter labels from 15,
 * then `BOSS` — M2-09).
 */
export const HUD_STRING_COUNT = 23;

/**
 * Commands a HUD list needs in the worst case (the co-op Direct-mode HUD: both halves with every
 * tier pip — and, since M2-09, the boss HP bar).
 */
export const HUD_COMMAND_COUNT = 100;

/** Width of the boss HP bar's frame in the top HUD bar (M2-09); the fill is 2 px narrower. */
export const BOSS_HP_BAR_WIDTH = 64;

/**
 * The boss HP bar as the HUD reads it (M2-09 — `core/bosses` `BossHpBar`, the World's
 * `bosses.hpBar`).
 */
export interface BossHpBarView {
  /** Whether a boss is counted (the bar is shown). */
  readonly visible: boolean;
  /** Remaining hit points counted. */
  readonly hp: number;
  /** Full strength counted. */
  readonly maxHp: number;
}

/**
 * The boss HP bar's fill in whole pixels (M2-09, the HP bar model): `⌈hp × width / maxHp⌉`, at
 * most `width`; 0 when the bar is not shown or nothing is left — so any hit point left shows at
 * least 1 px, and the bar is full only at full strength (an intro fills it up).
 *
 * @param bar - The bar (`world.bosses.hpBar`).
 * @param width - Width of the fill at full strength, in pixels.
 * @returns Pixels to fill, `0 … width`.
 *
 * @example
 * ```ts
 * bossHpBarFill({ visible: true, hp: 30, maxHp: 120 }, 62); // → 16 (⌈15.5⌉)
 * bossHpBarFill({ visible: false, hp: 30, maxHp: 120 }, 62); // → 0
 * ```
 */
export function bossHpBarFill(bar: BossHpBarView, width: number): number {
  const hp = bar.hp;
  const max = bar.maxHp;
  if (!bar.visible || !(hp > 0) || !(max > 0) || !(width > 0)) return 0;
  const fill = Math.ceil((hp * width) / max);
  return fill >= width ? Math.floor(width) : fill;
}

/** The highlighted meter slot alternates between highlighted and plain every this many ticks. */
export const HUD_METER_FLASH_TICKS = 8;

/** Co-op (M2-06): `PRESS START` blinks with this half-period, in ticks. */
export const HUD_PROMPT_BLINK_TICKS = 32;

/**
 * What the HUD shows for one player (M2-06; {@link hudPlayerState}): `Playing` — a ship in the
 * game (its score, stock and power); `Join` — a co-op slot that may drop in (`PRESS START` where
 * its score goes); `Continue` — a co-op player out of lives with continues left (score kept,
 * `PRESS START` in its half); `Out` — out for good (`GAME OVER` in its half); `Absent` — no ship
 * and no way in (a one-player game's `2P ------`).
 */
export const HudPlayerState = {
  /** In the game. */
  Playing: 0,
  /** May join the co-op game. */
  Join: 1,
  /** Out of lives, may continue (co-op). */
  Continue: 2,
  /** Out for good. */
  Out: 3,
  /** Not in the game and cannot join. */
  Absent: 4,
} as const;

/** A {@link HudPlayerState} code. */
export type HudPlayerState = (typeof HudPlayerState)[keyof typeof HudPlayerState];

/**
 * Whether a player may drop into a World now — `core/world` `playerCanJoin`'s rule, repeated here
 * because `core/world` imports this module (the HUD test keeps the two in step).
 *
 * @param world - The World.
 * @param slot - The player slot (valid).
 * @returns `true` when a join press would bring the player in.
 */
function canJoin(world: World, slot: number): boolean {
  if (!world.config.coop) return false;
  const status = world.status;
  if (status !== 'playing' && status !== 'bossWarning') return false;
  const ship = world.players[slot];
  if (!ship.active) return true;
  if (!playerOut(ship)) return false;
  const scores = world.scoring.board.scores;
  return slot < scores.length && world.config.continues - scores[slot].continues > 0;
}

/**
 * The HUD state of one player (M2-06, see {@link HudPlayerState}). Never allocates.
 *
 * @param world - The World shown.
 * @param slot - The player slot.
 * @returns The state code (`Absent` for a slot the World does not have).
 *
 * @example
 * ```ts
 * hudPlayerState(coopWorld, 1); // → HudPlayerState.Join until player 2 presses START
 * ```
 */
export function hudPlayerState(world: World, slot: number): HudPlayerState {
  const players = world.players;
  if (!(slot >= 0 && slot < players.length)) return HudPlayerState.Absent;
  const ship = players[slot];
  if (!ship.active) return canJoin(world, slot) ? HudPlayerState.Join : HudPlayerState.Absent;
  if (!playerOut(ship)) return HudPlayerState.Playing;
  return canJoin(world, slot) ? HudPlayerState.Continue : HudPlayerState.Out;
}

/**
 * Draws the whole HUD for a World into a draw list (cleared first): both bars, player 1's score,
 * the session hi-score, player 2's score or `------`, player 1's stock, power meter and Force
 * Field — or, in Direct mode (M2-05), its tier pips; in a co-op game (M2-06) each player's half of
 * the bottom bar. Never allocates (the labels are written into their string slots only when
 * changed).
 *
 * @remarks
 * Side effect: clears the scores' `displayDirty` and the board's `hiScoreDirty` flags (it has
 * drawn them). Layout ({@link HUD_LAYOUT}): top bar `1P` at x 8, `HI` at 156, `2P` at 292, each
 * followed 16 px later by an 8-digit number (`------` while player 2 is out of a one-player game);
 * bottom bar: up to 5 stock icons 10 px apart from x 4 (more: one icon and the count), the seven
 * 40-px meter slots from x 58 — `hud/meter-slot` frame 1 on the "on" half of the
 * {@link HUD_METER_FLASH_TICKS} flash for the highlighted slot, frame 2 for a slot that cannot be
 * equipped, frame 0 otherwise, with the slot's `hud/meter-labels` frame ({@link meterLabelFrame}:
 * the arsenal's weapon names on MISSILE / DOUBLE / LASER — M2-03) tinted {@link HUD_COLORS}.label
 * or `labelDisabled` — and, while the Force Field is up, one pip per hit it can take (at most 5, 7
 * px apart from x 344), cyan for the hits left and dark for the spent ones.
 * Without the UI sprites the icons and slots become rectangles and the labels are left out.
 *
 * **Direct mode** (`config.powerUpMode === 'direct'`, M2-05) — instead of the meter and the Force
 * Field: `SHOT` at x 58 with one 4×4 pip per level above 0 of the main family (8 for its 9 levels),
 * the lit ones in the family's {@link HUD_FAMILY_COLORS} colour; `SUB` at 130 (green pips); `ARM`
 * at 196 with one pip per hit the Arm can take (its tier's {@link HUD_ARM_COLORS} colour for the
 * hits left, dark for the spent ones; nothing without an Arm); `SPD` at 252 with one pip per
 * speed (the current level and those below lit); and the family's `label` at 306.
 *
 * **Co-op** (M2-06, `config.coop`) — the top bar shows a slot that may join
 * ({@link HudPlayerState}.Join) as `PRESS START` (blinking every {@link HUD_PROMPT_BLINK_TICKS}
 * ticks) instead of `------`. While **both** ships are in the game the bottom bar splits into two
 * 192-px halves (player 1 left, player 2 right — its stock icon `hud/life@p2`), each compact: the
 * stock icon and count, then the seven meter slots as 20-px boxes with two-letter labels
 * ({@link METER_SHORT_LABELS}) and the shield pips from x 164 — or, in Direct mode, `SH` / `SB` /
 * `AR` / `SP` with 3×4 pips 4 px apart; a player out of lives shows `PRESS START` (blinking, when it
 * may continue) or `GAME OVER` in its half. The worst case stays under {@link HUD_COMMAND_COUNT}
 * commands (the game scene's HUD list has that many).
 *
 * @param world - The World shown.
 * @param list - Target draw list (≥ {@link HUD_COMMAND_COUNT} commands, ≥
 *   {@link HUD_STRING_COUNT} string slots — {@link HUD_STRING_SLOTS} are the HUD's).
 * @param sprites - UI sprite ids ({@link resolveUiSprites}); missing ones fall back to rectangles.
 * @param bossHp - Draw the boss HP bar (M2-09 — the `bossHpBar` display option; default `false`):
 *   while the World's `bosses.hpBar` is visible, `BOSS` (red) at x 148 and a 4-px frame
 *   {@link BOSS_HP_BAR_WIDTH} wide at x 176 with a 2-px red fill of {@link bossHpBarFill} over
 *   the frame's inner width replace the hi-score.
 *
 * @example
 * ```ts
 * buildHud(game.world, hudList, resolveUiSprites(game.content));
 * ```
 */
export function buildHud(
  world: World,
  list: DrawList,
  sprites: UiSprites = NO_SPRITES,
  bossHp = false,
): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  list.clear();
  list.setString(S.p1, '1P');
  list.setString(S.hi, 'HI');
  list.setString(S.p2, '2P');
  list.setString(S.dashes, '------');
  list.rect(0, L.topY, 384, 8, HUD_COLORS.bar);
  list.rect(0, L.bottomY, 384, 8, HUD_COLORS.bar);
  const board = world.scoring.board;
  const players = world.players;
  const blinkOn = ((world.tick / HUD_PROMPT_BLINK_TICKS) & 1) === 0;
  const state1 = hudPlayerState(world, 0);
  const state2 = hudPlayerState(world, 1);
  topScore(list, board.scores[0].score, state1, S.p1, L.p1X, HUD_COLORS.p1, blinkOn);
  const bar = world.bosses.hpBar;
  if (bossHp && bar.visible) {
    // The boss HP bar (M2-09) replaces the hi-score during a boss fight.
    list.setString(S.boss, 'BOSS');
    list.text(S.boss, L.bossX, L.topY, HUD_COLORS.bossLabel);
    list.rect(L.bossBarX, L.topY + 2, BOSS_HP_BAR_WIDTH, 4, HUD_COLORS.bossFrame);
    const fill = bossHpBarFill(bar, BOSS_HP_BAR_WIDTH - 2);
    if (fill > 0) list.rect(L.bossBarX + 1, L.topY + 3, fill, 2, HUD_COLORS.bossFill);
  } else {
    list.text(S.hi, L.hiX, L.topY, HUD_COLORS.hi);
    list.number(board.hiScore, L.hiX + 16, L.topY, L.digits, HUD_COLORS.number);
  }
  const score2 = board.scores.length > 1 ? board.scores[1].score : 0;
  topScore(list, score2, state2, S.p2, L.p2X, HUD_COLORS.p2, blinkOn);

  if (players.length > 1 && players[0].active && players[1].active) {
    // Co-op (M2-06): each player's compact half.
    coopHalf(world, list, sprites, 0, state1, blinkOn);
    coopHalf(world, list, sprites, 1, state2, blinkOn);
    clearDirty(world);
    return;
  }

  const ship = players[0];
  const stock = ship.lives - 1;
  const iconY = L.bottomY + 2;
  if (stock > L.stockIcons) {
    if (sprites.life >= 0) list.sprite(sprites.life, 0, L.stockX, iconY);
    else list.rect(L.stockX, iconY, 8, 4, HUD_COLORS.p1);
    list.number(stock, L.stockX + 12, L.bottomY, 0, HUD_COLORS.number);
  } else {
    for (let i = 0; i < stock; i++) {
      if (sprites.life >= 0) list.sprite(sprites.life, 0, L.stockX + i * 10, iconY);
      else list.rect(L.stockX + i * 10, iconY, 8, 4, HUD_COLORS.p1);
    }
  }

  if (world.powerups.direct) {
    buildDirectPips(world, list);
    clearDirty(world);
    return;
  }
  const cursor = world.powerups.meters[0].cursor;
  const equippable = world.powerups.equippable(0);
  const flashOn = ((world.tick / HUD_METER_FLASH_TICKS) & 1) === 0;
  for (let slot = 0; slot < METER_SLOT_COUNT; slot++) {
    const x = L.meterX + slot * L.slotW;
    const can = (equippable & (1 << slot)) !== 0;
    const lit = slot === cursor && flashOn;
    const frame = lit ? 1 : can ? 0 : 2;
    if (sprites.meterSlot >= 0) {
      list.sprite(sprites.meterSlot, frame, x, L.bottomY);
    } else {
      list.rect(
        x + 1,
        L.bottomY + 1,
        L.slotW - 2,
        6,
        lit ? HUD_COLORS.slotLit : can ? HUD_COLORS.slotOn : HUD_COLORS.slotOff,
      );
    }
    if (sprites.meterLabels >= 0) {
      list.sprite(
        sprites.meterLabels,
        meterLabelFrame(world, slot),
        x + 2,
        L.bottomY + 2,
        0,
        can || lit ? HUD_COLORS.label : HUD_COLORS.labelDisabled,
      );
    }
  }

  const shield = ship.shield;
  if (shieldActive(shield)) {
    for (let i = 0; i < shield.maxHits && i < 5; i++) {
      list.rect(
        L.shieldX + i * 7,
        L.bottomY + 2,
        5,
        4,
        i < shield.hits ? HUD_COLORS.shield : HUD_COLORS.shieldSpent,
      );
    }
  }
  clearDirty(world);
}

/**
 * One player's label and score on the top bar: the score for a player in the game (or out of
 * it), `PRESS START` (on the blink's "on" half) for a slot that may join, `------` for an absent
 * one (M2-06).
 *
 * @param list - The HUD list.
 * @param score - The player's score.
 * @param state - Its {@link HudPlayerState}.
 * @param slot - The label's string slot (`1P` / `2P`).
 * @param x - The label's x.
 * @param color - The label's colour.
 * @param blinkOn - The prompt's blink phase.
 */
function topScore(
  list: DrawList,
  score: number,
  state: HudPlayerState,
  slot: number,
  x: number,
  color: number,
  blinkOn: boolean,
): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const absent = state === HudPlayerState.Absent || state === HudPlayerState.Join;
  list.text(slot, x, L.topY, absent ? HUD_COLORS.inactive : color);
  if (state === HudPlayerState.Join) {
    // Written only when a co-op HUD needs it (a one-player HUD list may have 4 string slots).
    list.setString(S.pressStart, 'PRESS START');
    if (blinkOn) list.text(S.pressStart, x + 16, L.topY, HUD_COLORS.prompt);
  } else if (state === HudPlayerState.Absent) {
    list.text(S.dashes, x + 16, L.topY, HUD_COLORS.inactive);
  } else {
    list.number(score, x + 16, L.topY, L.digits, HUD_COLORS.number);
  }
}

/**
 * One player's compact half of the bottom bar in a co-op game (M2-06; see {@link buildHud}). Never
 * allocates.
 *
 * @param world - The World shown.
 * @param list - The HUD list.
 * @param sprites - UI sprite ids.
 * @param slot - The player slot (0 = left half, 1 = right half).
 * @param state - Its {@link HudPlayerState}.
 * @param blinkOn - The prompt's blink phase.
 */
function coopHalf(
  world: World,
  list: DrawList,
  sprites: UiSprites,
  slot: number,
  state: HudPlayerState,
  blinkOn: boolean,
): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const ox = slot * L.halfW;
  const y = L.bottomY;
  const centre = ox + (L.halfW >> 1);
  if (state === HudPlayerState.Continue) {
    list.setString(S.pressStart, 'PRESS START');
    if (blinkOn) list.text(S.pressStart, centre, y, HUD_COLORS.prompt, TextAlign.Center);
    return;
  }
  if (state !== HudPlayerState.Playing) {
    list.setString(S.gameOver, 'GAME OVER');
    list.text(S.gameOver, centre, y, HUD_COLORS.over, TextAlign.Center);
    return;
  }
  const ship = world.players[slot];
  const life = slot === 1 && sprites.lifeP2 >= 0 ? sprites.lifeP2 : sprites.life;
  const stock = ship.lives > 0 ? ship.lives - 1 : 0;
  if (life >= 0) list.sprite(life, 0, ox + L.coopStockX, y + 2);
  else list.rect(ox + L.coopStockX, y + 2, 8, 4, slot === 1 ? HUD_COLORS.p2 : HUD_COLORS.p1);
  list.number(stock, ox + L.coopStockX + 10, y, 0, HUD_COLORS.number);
  if (world.powerups.direct) {
    coopDirectPips(world, list, slot, ox);
    return;
  }
  const cursor = world.powerups.meters[slot].cursor;
  const equippable = world.powerups.equippable(slot);
  const flashOn = ((world.tick / HUD_METER_FLASH_TICKS) & 1) === 0;
  for (let m = 0; m < METER_SLOT_COUNT; m++) {
    const x = ox + L.coopMeterX + m * L.coopSlotW;
    const can = (equippable & (1 << m)) !== 0;
    const lit = m === cursor && flashOn;
    list.rect(
      x + 1,
      y + 1,
      L.coopSlotW - 2,
      6,
      lit ? HUD_COLORS.slotLit : can ? HUD_COLORS.slotOn : HUD_COLORS.slotOff,
    );
    const label = S.meterShort + m;
    list.setString(label, METER_SHORT_LABELS[meterLabelFrame(world, m)] ?? '');
    list.text(
      label,
      x + (L.coopSlotW >> 1),
      y,
      lit ? HUD_COLORS.hi : can ? HUD_COLORS.label : HUD_COLORS.labelDisabled,
      TextAlign.Center,
    );
  }
  const shield = ship.shield;
  if (shieldActive(shield)) {
    for (let i = 0; i < shield.maxHits && i < 5; i++) {
      list.rect(
        ox + L.coopShieldX + i * 5,
        y + 2,
        4,
        4,
        i < shield.hits ? HUD_COLORS.shield : HUD_COLORS.shieldSpent,
      );
    }
  }
}

/**
 * Clears the flags a HUD build has drawn: the scores' `displayDirty`, the board's `hiScoreDirty`.
 *
 * @param world - The World shown.
 */
function clearDirty(world: World): void {
  const board = world.scoring.board;
  board.scores[0].displayDirty = false;
  if (board.scores.length > 1) board.scores[1].displayDirty = false;
  board.hiScoreDirty = false;
}

/**
 * A row of pips on the bottom bar: `lit` of `count` in `on`, the rest in `off`.
 *
 * @param list - The HUD list.
 * @param x - First pip x.
 * @param step - Pixels between pips.
 * @param count - Pips.
 * @param lit - Lit pips (the first ones).
 * @param on - Lit colour.
 * @param off - Unlit colour.
 * @param width - Pip width (default 4; the co-op HUD's compact pips are 3).
 */
function drawPips(
  list: DrawList,
  x: number,
  step: number,
  count: number,
  lit: number,
  on: number,
  off: number,
  width = 4,
): void {
  const y = HUD_LAYOUT.bottomY + 2;
  for (let i = 0; i < count; i++) list.rect(x + i * step, y, width, 4, i < lit ? on : off);
}

/**
 * The main family a player's Direct-mode loadout fires, and its index (M2-05).
 *
 * @param world - The World (Direct mode).
 * @param slot - The player slot.
 * @returns The family's index in `mainFamilies` (0 without families).
 */
function familyIndex(world: World, slot: number): number {
  const loadout = world.weapons.loadouts[slot];
  const families = world.weapons.mainFamilies;
  // `core/weapons` reads a negative index as the first family.
  return loadout.family >= 0 && families.length > 0 ? loadout.family % families.length : 0;
}

/**
 * The Direct-mode tier pips of player 1 (M2-05; see {@link buildHud}). Never allocates.
 *
 * @param world - The World shown (Direct mode).
 * @param list - The HUD list.
 */
function buildDirectPips(world: World, list: DrawList): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const y = L.bottomY;
  const loadout = world.weapons.loadouts[0];
  const ship = world.players[0];
  const families = world.weapons.mainFamilies;
  const index = familyIndex(world, 0);
  const family = families.length > 0 ? (families[index] ?? null) : null;
  list.setString(S.shot, 'SHOT');
  list.setString(S.sub, 'SUB');
  list.setString(S.arm, 'ARM');
  list.setString(S.speed, 'SPD');
  list.text(S.shot, L.shotX, y, HUD_COLORS.pipLabel);
  const shotTop = directMaxLevel(family);
  const color = HUD_FAMILY_COLORS[index % HUD_FAMILY_COLORS.length] ?? HUD_COLORS.label;
  drawPips(list, L.shotX + 26, 5, shotTop, loadout.shot, color, HUD_COLORS.pipOff);
  list.text(S.sub, L.subX, y, HUD_COLORS.pipLabel);
  const subTop = directMaxLevel(world.weapons.subFamily);
  drawPips(list, L.subX + 20, 5, subTop, loadout.sub, HUD_COLORS.subPip, HUD_COLORS.pipOff);
  list.text(S.arm, L.armX, y, HUD_COLORS.pipLabel);
  const shield = ship.shield;
  if (shieldActive(shield) && shield.kind === ShieldKind.Arm && shield.tier >= 1) {
    const tier = shield.tier > HUD_ARM_COLORS.length ? HUD_ARM_COLORS.length : shield.tier;
    const max = shield.maxHits > 5 ? 5 : shield.maxHits;
    drawPips(list, L.armX + 20, 6, max, shield.hits, HUD_ARM_COLORS[tier - 1], HUD_COLORS.pipOff);
  }
  list.text(S.speed, L.speedX, y, HUD_COLORS.pipLabel);
  const speeds = world.ship.speeds.length > 5 ? 5 : world.ship.speeds.length;
  drawPips(
    list,
    L.speedX + 20,
    6,
    speeds,
    ship.speedLevel + 1,
    HUD_COLORS.speedPip,
    HUD_COLORS.pipOff,
  );
  if (family !== null) {
    list.setString(S.family, family.label);
    list.text(S.family, L.familyX, y, color);
  }
}

/**
 * The compact Direct-mode tier pips of one player's co-op half (M2-06; see {@link buildHud}):
 * `SH`, `SB`, `AR`, `SP`, each followed by 3×4 pips 4 px apart. Never allocates.
 *
 * @param world - The World shown (Direct mode).
 * @param list - The HUD list.
 * @param slot - The player slot.
 * @param ox - The half's left edge.
 */
function coopDirectPips(world: World, list: DrawList, slot: number, ox: number): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const y = L.bottomY;
  const loadout = world.weapons.loadouts[slot];
  const ship = world.players[slot];
  const families = world.weapons.mainFamilies;
  const index = familyIndex(world, slot);
  const family = families.length > 0 ? (families[index] ?? null) : null;
  list.setString(S.shortShot, 'SH');
  list.setString(S.shortSub, 'SB');
  list.setString(S.shortArm, 'AR');
  list.setString(S.shortSpeed, 'SP');
  const color = HUD_FAMILY_COLORS[index % HUD_FAMILY_COLORS.length] ?? HUD_COLORS.label;
  list.text(S.shortShot, ox + L.coopShotX, y, HUD_COLORS.pipLabel);
  const shotTop = directMaxLevel(family);
  drawPips(list, ox + L.coopShotX + 13, 4, shotTop, loadout.shot, color, HUD_COLORS.pipOff, 3);
  list.text(S.shortSub, ox + L.coopSubX, y, HUD_COLORS.pipLabel);
  const subTop = directMaxLevel(world.weapons.subFamily);
  drawPips(
    list,
    ox + L.coopSubX + 13,
    4,
    subTop,
    loadout.sub,
    HUD_COLORS.subPip,
    HUD_COLORS.pipOff,
    3,
  );
  list.text(S.shortArm, ox + L.coopArmX, y, HUD_COLORS.pipLabel);
  const shield = ship.shield;
  if (shieldActive(shield) && shield.kind === ShieldKind.Arm && shield.tier >= 1) {
    const tier = shield.tier > HUD_ARM_COLORS.length ? HUD_ARM_COLORS.length : shield.tier;
    const max = shield.maxHits > 5 ? 5 : shield.maxHits;
    const on = HUD_ARM_COLORS[tier - 1];
    drawPips(list, ox + L.coopArmX + 13, 4, max, shield.hits, on, HUD_COLORS.pipOff, 3);
  }
  list.text(S.shortSpeed, ox + L.coopSpeedX, y, HUD_COLORS.pipLabel);
  const speeds = world.ship.speeds.length > 5 ? 5 : world.ship.speeds.length;
  const lit = ship.speedLevel + 1;
  drawPips(list, ox + L.coopSpeedX + 13, 4, speeds, lit, HUD_COLORS.speedPip, HUD_COLORS.pipOff, 3);
}

/** Values the HUD compares per player (M2-06: both players' power and state). */
const HUD_PLAYER_FIELDS = 12;

/**
 * The HUD with change detection: {@link Hud.update} rebuilds the list only when something it shows
 * changed. A class, so the remembered values stay unboxed small integers (a typed array holds the
 * per-player values).
 */
export class Hud {
  /** The sprite ids the HUD draws with. */
  readonly sprites: UiSprites;
  /** How many times the list was rebuilt (tests, debug overlays). */
  builds = 0;
  /**
   * Draw the boss HP bar (M2-09 — the `bossHpBar` display option; the scene flow sets it from the
   * save before every update). Default `false`.
   */
  showBossHp = false;
  private world: World | null = null;
  private list: DrawList | null = null;
  private flash = -1;
  private blink = -1;
  /** The last build's boss HP bar fill (-1 = not drawn). */
  private barFill = -1;
  /** The last build's per-player values ({@link HUD_PLAYER_FIELDS} per player). */
  private readonly shown = new Int32Array(2 * HUD_PLAYER_FIELDS);
  /** This update's per-player values (compared with {@link Hud.shown}). */
  private readonly next = new Int32Array(2 * HUD_PLAYER_FIELDS);

  /**
   * Creates the HUD (use {@link createHud}).
   *
   * @param sprites - UI sprite ids.
   */
  constructor(sprites: UiSprites) {
    this.sprites = sprites;
  }

  /**
   * Writes the values the HUD shows of one player into {@link Hud.next}.
   *
   * @param world - The World shown.
   * @param slot - The player slot.
   * @returns Whether its meter cursor highlights a slot (the flash matters).
   */
  private sample(world: World, slot: number): boolean {
    const out = this.next;
    const base = slot * HUD_PLAYER_FIELDS;
    if (slot >= world.players.length) {
      out.fill(-1, base, base + HUD_PLAYER_FIELDS);
      return false;
    }
    const ship = world.players[slot];
    const loadout = world.weapons.loadouts[slot];
    const active = shieldActive(ship.shield);
    const cursor = world.powerups.meters[slot].cursor;
    out[base] = hudPlayerState(world, slot);
    out[base + 1] = ship.active ? 1 : 0;
    out[base + 2] = ship.lives;
    out[base + 3] = cursor;
    out[base + 4] = world.powerups.equippable(slot);
    out[base + 5] = active ? ship.shield.hits : 0;
    out[base + 6] = active ? ship.shield.maxHits : 0;
    out[base + 7] = active ? ship.shield.tier : 0;
    out[base + 8] = loadout.shot;
    out[base + 9] = loadout.sub;
    out[base + 10] = loadout.family;
    out[base + 11] = ship.speedLevel;
    return cursor >= 0 && ship.active;
  }

  /**
   * Rebuilds `list` from `world` when the shown state changed since the last build (or the World or
   * list is a different object). Never allocates.
   *
   * @remarks
   * Compared: player 1's and 2's score (their `displayDirty` flags), the hi-score
   * (`hiScoreDirty`) and, for each player, its {@link HudPlayerState} (M2-06), whether it plays,
   * its lives, meter cursor and equippable mask, the shield's hits, maximum and tier, and (Direct
   * mode, M2-05) the shot / sub levels, the family and the speed level; the highlight's flash
   * phase (only while a meter slot is highlighted), the `PRESS START` blink (only while a
   * player may join or continue) and — with {@link Hud.showBossHp} — the boss HP bar's fill in
   * pixels (M2-09). A rebuild clears the dirty flags ({@link buildHud}), so only one
   * HUD should read a given World's flags. The game scene calls this once per displayed frame, not
   * per tick.
   *
   * @param world - The World shown.
   * @param list - The HUD draw list.
   * @returns `true` when the list was rebuilt.
   */
  update(world: World, list: DrawList): boolean {
    const board = world.scoring.board;
    const lit1 = this.sample(world, 0);
    const lit2 = this.sample(world, 1);
    const next = this.next;
    const flash = lit1 || lit2 ? (world.tick / HUD_METER_FLASH_TICKS) & 1 : 0;
    const prompt =
      next[0] === HudPlayerState.Join ||
      next[0] === HudPlayerState.Continue ||
      next[HUD_PLAYER_FIELDS] === HudPlayerState.Join ||
      next[HUD_PLAYER_FIELDS] === HudPlayerState.Continue;
    const blink = prompt ? (world.tick / HUD_PROMPT_BLINK_TICKS) & 1 : 0;
    const hpBar = world.bosses.hpBar;
    const barFill =
      this.showBossHp && hpBar.visible ? bossHpBarFill(hpBar, BOSS_HP_BAR_WIDTH - 2) : -1;
    let dirty =
      world !== this.world ||
      list !== this.list ||
      board.scores[0].displayDirty ||
      (board.scores.length > 1 && board.scores[1].displayDirty) ||
      board.hiScoreDirty ||
      flash !== this.flash ||
      blink !== this.blink ||
      barFill !== this.barFill;
    const shown = this.shown;
    for (let i = 0; !dirty && i < next.length; i++) if (next[i] !== shown[i]) dirty = true;
    if (!dirty) return false;
    shown.set(next);
    this.world = world;
    this.list = list;
    this.flash = flash;
    this.blink = blink;
    this.barFill = barFill;
    this.builds++;
    buildHud(world, list, this.sprites, this.showBossHp);
    return true;
  }

  /** Forgets the last build, so the next {@link Hud.update} rebuilds. */
  invalidate(): void {
    this.world = null;
    this.list = null;
  }
}

/**
 * Creates a HUD with change detection.
 *
 * @param sprites - UI sprite ids ({@link resolveUiSprites}; default: none — rectangles only).
 * @returns The HUD.
 *
 * @example
 * ```ts
 * const hud = createHud(resolveUiSprites(game.content));
 * // every displayed frame:
 * hud.update(game.world, hudList); // rebuilds only on a change
 * ```
 */
export function createHud(sprites: UiSprites = NO_SPRITES): Hud {
  return new Hud(sprites);
}
