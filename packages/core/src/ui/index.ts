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
 * - **HUD** (decision D20: two HUD bars outside the playfield — 12 px since R2-01, 8 px in v1).
 *   {@link buildHud} draws the top bar `1P 00012300  HI 00050000  2P ------` and the bottom bar —
 *   `lives − 1` stock icons, the 7-slot
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
 * - shmup_feat.md §17 — the 3-letter name entry of the hi-score table (M2-15)
 * - shmup_feat.md §4 — [P1] rebinding per device with conflict detection and reset; §21 — full
 *   remapping, the string table for localization (M2-16)
 * - shmup_feat.md §16 — the caravan's clock in the HUD (M3-01)
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
 * {@link BossHpBarView}, {@link bossHpBarFill}. M2-15: {@link NameEntry}, {@link createNameEntry},
 * {@link nameEntryTick}, {@link drawNameEntry}, {@link NAME_ENTRY_GLYPHS},
 * {@link NAME_ENTRY_LENGTH}, {@link NAME_ENTRY_STRING_SLOTS}. M2-16: {@link RebindPanel},
 * {@link RebindPanelLabels}, {@link createRebindPanel}, {@link rebindTick},
 * {@link rebindStringSlots}, {@link drawRebindPanel}, {@link RebindEvent}, {@link RebindStatus},
 * {@link CaptureStatus}, {@link REBINDABLE_ACTIONS}, {@link REBIND_CAPTURE_TICKS},
 * {@link METER_SHORT_IDS} and the string table ({@link UiText}, {@link UiTextId},
 * {@link DEFAULT_UI_TEXT}, {@link UI_TEXT_IDS}, {@link resolveUiText}, {@link formatUiText},
 * {@link MAX_UI_TEXT_LENGTH}, {@link DEFAULT_LANGUAGE}). M3-01: {@link hudClockSeconds} (the
 * caravan's clock, drawn as `TIME` and its seconds in player 2's place — slot `time` of
 * {@link HUD_STRING_SLOTS}, red for the last ten) and the Extra Edit weapons' meter labels at the
 * end of {@link METER_LABEL_FRAMES} / {@link METER_SHORT_IDS}. R2-01: {@link uiPx} (a UI length
 * at the art's scale — the kit, the HUD and the scenes lay their art- and padding-sized lengths out
 * with it).
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
 * **Name entry (M2-15).** {@link NameEntry} / {@link nameEntryTick} / {@link drawNameEntry}: the
 * 3-letter hi-score name picked with the four directions and OK only — Up / Down change the letter,
 * Right / OK move on, Left goes back, OK on `END` finishes ({@link NAME_ENTRY_GLYPHS},
 * {@link NAME_ENTRY_LENGTH}, {@link NAME_ENTRY_STRING_SLOTS}, {@link createNameEntry}).
 *
 * **Rebind widget (M2-16).** {@link RebindPanel} / {@link rebindTick} / {@link drawRebindPanel}:
 * the Options screen's rebinding — per binding context ({@link REBINDABLE_ACTIONS}) a row per
 * action with its keys, MODE (game / menu), RESET and DONE, the capture prompt with its time bar
 * ({@link REBIND_CAPTURE_TICKS}) and a message line for the outcome ({@link RebindStatus}; the
 * capture's states are {@link CaptureStatus}). The scene flow drives the host's key capture and the
 * bindings (`@shmup/input-web` `rebindAction`).
 *
 * **String table (M2-16).** Every word the kit and the HUD draw comes from a {@link UiText} table
 * (`./strings.ts` — {@link DEFAULT_UI_TEXT}, {@link resolveUiText}, {@link formatUiText}): the
 * builders and {@link createHud} take one (English by default), the scene flow passes the content's
 * (`content/strings/`).
 *
 * @module
 */
import {
  ART_SCALE,
  FRAME_CX,
  FRAME_CY,
  FRAME_W,
  GLYPH_H,
  GLYPH_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  LINE_H,
} from '../config/index.js';
import type { ContentDb } from '../data/index.js';
import { SFX_CUES } from '../events/index.js';
import {
  Action,
  INPUT_CONTEXTS,
  type ActionName,
  type InputContext,
  type PlayerInput,
} from '../input/index.js';
import { defineModule } from '../module-info.js';
import { playerOut } from '../player/index.js';
import { METER_SLOT_COUNT, MeterSlot, directMaxLevel } from '../powerups/index.js';
import { TextAlign, type DrawList } from '../presentation/index.js';
import { ShieldKind, shieldActive } from '../shields/index.js';
import { WEAPON_BEHAVIOR_LABELS, WeaponRole } from '../weapons/index.js';
import type { World } from '../world/index.js';
import { DEFAULT_UI_TEXT, type UiText, type UiTextId } from './strings.js';

export {
  DEFAULT_LANGUAGE,
  DEFAULT_UI_TEXT,
  FIXED_UI_TEXT_IDS,
  MAX_UI_TEXT_LENGTH,
  UI_GLYPHS,
  UI_LANGUAGES,
  UI_TEXT_IDS,
  formatUiText,
  isFixedUiTextId,
  isUiTextDrawable,
  pickUiStrings,
  resolveUiText,
  uiLanguageIds,
  uiLanguageLabel,
  type UiLanguage,
  type UiStringTableLike,
  type UiText,
  type UiTextId,
} from './strings.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'ui',
  status: 'partial',
  specRefs: [
    'shmup_feat.md §17',
    'shmup_feat.md §4',
    'shmup_tech.md §4.10',
    'shmup_feat.md §6',
    'shmup_feat.md §21',
  ],
});

// Bitmap-font metrics for layout live in `presentation` (the renderer implements them).
export type { TextMetrics } from '../presentation/index.js';

// ------------------------------------------------------------------------------ layout scale

/**
 * A UI length at the art's scale (plan_resolution.md R2-01, owner decision W4-3): `v` pixels of the
 * v1 (384×216) UI times `core/config` `ART_SCALE`, rounded up — `⌈v · ART_SCALE⌉`.
 *
 * @remarks
 * The UI kit and the scenes lay their screens out in three kinds of numbers: **positions** anchored
 * to the frame (its centre, an edge — `FRAME_CX`, `FRAME_W`), **text-sized** lengths (glyph cells
 * and lines — `GLYPH_W`, `GLYPH_H`, `LINE_H`) and the **art- and padding-sized** lengths — a
 * sprite's size, a gap, a margin, an inset, a bar's thickness — which this scales. At `ART_SCALE` 1
 * (until the flip) it returns `v`, so nothing moves; from R2-01's flip (`ART_SCALE` 3/2, the ×1.5
 * interim art and the 9×12 font) the whole UI is a ×1.5 copy of v1's, re-anchored to the 640×360
 * frame — which fits, since 1.5 < 5/3. World values never use it (plan §2.6).
 *
 * **Module initialisation only:** every caller builds frozen layout constants with it. It is never
 * called per frame or per tick (the layouts stay constants; zero allocation —
 * docs/dev/conventions.md).
 *
 * @param v - A length of the v1 UI in pixels: a whole number ≥ 0.
 * @returns `⌈v · ART_SCALE⌉` (`v` at `ART_SCALE` 1; 2 → 3, 4 → 6, 5 → 8 at 3/2).
 * @throws RangeError when `v` is not a whole number ≥ 0 (a layout typo, caught at module load).
 *
 * @example
 * ```ts
 * const PANEL = Object.freeze({ x: FRAME_CX - uiPx(76), y: FRAME_CY - uiPx(48), w: uiPx(152) });
 * ```
 */
export function uiPx(v: number): number {
  if (!(v >= 0 && Math.floor(v) === v)) throw new RangeError(`uiPx: ${v} is not a whole px ≥ 0`);
  return Math.ceil(v * ART_SCALE);
}

// ------------------------------------------------------------------------------ sprites

/**
 * The campaign's nine zone planets the zone map draws behind its letters (w15): one per campaign
 * letter `a`–`i`, at the list's index for that letter. The art is v2-only (the `planets` generator
 * answers nothing at scale 1, decision RR-1a), so at the interim scale the map still draws plain
 * panels — the ids resolve to -1 and each node guards it.
 */
export const MAP_PLANET_SPRITES: readonly string[] = Object.freeze([
  'map/planet-a',
  'map/planet-b',
  'map/planet-c',
  'map/planet-d',
  'map/planet-e',
  'map/planet-f',
  'map/planet-g',
  'map/planet-h',
  'map/planet-i',
]);

/**
 * Atlas sprites the UI kit draws: the HUD's stock icon (and player 2's palette swap of it —
 * M2-06), meter slot box (frames normal / highlighted / disabled) and slot labels (one frame per
 * slot), the title logo, its v2 backdrop (R4-05.E2) and — M2-14 — the ending scenes' pieces (the
 * citadel's and the ARK's silhouettes, a blast, a bubble, the dawn sun, the sea's surface), the
 * zone map's nine planets (w15, {@link MAP_PLANET_SPRITES}). Part of the core's `ENGINE_SPRITES`,
 * so every host interns them.
 */
export const UI_SPRITES: readonly string[] = Object.freeze([
  'hud/life',
  'hud/life@p2',
  'hud/meter-slot',
  'hud/meter-labels',
  'ui/logo',
  'ui/ending-citadel',
  'ui/ending-ark',
  'ui/ending-blast',
  'ui/ending-bubble',
  'ui/ending-sun',
  'ui/ending-surface',
  'ui/title-backdrop',
  ...MAP_PLANET_SPRITES,
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
  /** `ui/ending-citadel` — the citadel's silhouette of the ending scene (M2-14; its centre). */
  readonly endingCitadel: number;
  /** `ui/ending-ark` — the ABYSS ARK's silhouette of the ending scene (M2-14). */
  readonly endingArk: number;
  /** `ui/ending-blast` — a blast of the ending scene, frames 0–3 (M2-14). */
  readonly endingBlast: number;
  /** `ui/ending-bubble` — a rising bubble of the deep's ending scene (M2-14). */
  readonly endingBubble: number;
  /** `ui/ending-sun` — the dawn of a flawless run's ending (M2-14). */
  readonly endingSun: number;
  /** `ui/ending-surface` — the sea's surface seen from below, 64 px wide, tiling (M2-14). */
  readonly endingSurface: number;
  /** `ui/title-backdrop` — the title's full-frame backdrop (R4-05.E2; anchor: its top-left corner). */
  readonly titleBackdrop: number;
  /**
   * The nine zone planets by campaign letter — index 0 is `map/planet-a`, index 8 `map/planet-i`
   * (w15; each anchored at its centre, drawn behind the map's zone letter). Frozen; -1 entries
   * where the atlas has none (the interim scale-1 build).
   */
  readonly planets: readonly number[];
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
    endingCitadel: id('ui/ending-citadel'),
    endingArk: id('ui/ending-ark'),
    endingBlast: id('ui/ending-blast'),
    endingBubble: id('ui/ending-bubble'),
    endingSun: id('ui/ending-sun'),
    endingSurface: id('ui/ending-surface'),
    titleBackdrop: id('ui/title-backdrop'),
    planets: Object.freeze(MAP_PLANET_SPRITES.map((name) => id(name))),
  });
}

/** The {@link UiSprites.planets} row with no planet interned (w15). */
const NO_PLANETS: readonly number[] = Object.freeze(MAP_PLANET_SPRITES.map(() => -1));

/** Sprite ids that draw nothing (every UI sprite missing). */
const NO_SPRITES: UiSprites = Object.freeze({
  life: -1,
  lifeP2: -1,
  meterSlot: -1,
  meterLabels: -1,
  logo: -1,
  endingCitadel: -1,
  endingArk: -1,
  endingBlast: -1,
  endingBubble: -1,
  endingSun: -1,
  endingSurface: -1,
  titleBackdrop: -1,
  planets: NO_PLANETS,
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
 * const profile = createChoice(['KEYBOARD (DEFAULT)', 'KEYBOARD AS REMOTE'], 0);
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

// ------------------------------------------------------------------------------ name entry

/**
 * The glyphs of the hi-score name entry (M2-15), in Up order — Up after the last one comes back to
 * the first: `A`–`Z`, `0`–`9`, `.`, `-`, `!` and a space. All of them are in the pixel font.
 */
export const NAME_ENTRY_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-! ';

/** Letters of a hi-score name (shmup_feat.md §17 "name entry (3 letters)"). */
export const NAME_ENTRY_LENGTH = 3;

/** String slots {@link drawNameEntry} uses: one per letter, `END`, the arrows and `_`. */
export const NAME_ENTRY_STRING_SLOTS = NAME_ENTRY_LENGTH + 4;

/** A letter with no glyph chosen yet (drawn as `_`, left out of the name). */
const NO_GLYPH = -1;

/** The glyphs as one-character strings, built once (drawing never builds a string). */
const GLYPH_STRINGS: readonly string[] = Object.freeze(NAME_ENTRY_GLYPHS.split(''));

/**
 * The 3-letter name entry of the hi-score table (shmup_feat.md §17 "canvas-drawn UI kit: 3-letter
 * name entry", plan M2-15) — a D-pad letter picker that needs **only the four directions and OK**
 * (the Samsung remote): Up / Down change the letter under the cursor (auto-repeat), Right or OK
 * move on to the next letter, Left (or Back) goes back one, and OK on `END` — the field after the
 * last letter — finishes. A class: its counters stay unboxed.
 *
 * @remarks
 * The first letter starts on `A`, the others empty (`_`): a letter left empty is not part of the
 * name, so `A`, OK, OK, OK, OK enters `A`. Confirm presses are buffered and held back by
 * {@link NameEntry.lockTicks} like the menus' ({@link menuTick}).
 */
export class NameEntry {
  /** Letters of the name. */
  readonly length: number;
  /** Per letter: its index in {@link NAME_ENTRY_GLYPHS}, or -1 while empty. */
  readonly glyphs: Int8Array;
  /** The letter under the cursor, or {@link NameEntry.length} for `END`. */
  cursor = 0;
  /** Whether OK was pressed on `END` (the entry is finished; further input is ignored). */
  done = false;
  /** Ticks activation still waits (the entry just opened): a Confirm meanwhile is buffered. */
  lockTicks = 0;
  /** Ticks a buffered Confirm press stays pending. */
  confirmBuffer = 0;
  /** Held-duration auto-repeat of the directions. */
  readonly repeat = new DirectionRepeat();
  /** Increases whenever the entry's look changes (a letter, the cursor, done). */
  revision = 0;

  /**
   * Creates the entry (use {@link createNameEntry}).
   *
   * @param length - Letters of the name.
   */
  constructor(length: number) {
    this.length = length;
    this.glyphs = new Int8Array(length).fill(NO_GLYPH);
    this.glyphs[0] = 0;
  }

  /**
   * Starts a new name: `A` and empty letters, the cursor on the first, input state cleared.
   *
   * @param lockTicks - Ticks activation waits for (default 0).
   */
  open(lockTicks = 0): void {
    this.glyphs.fill(NO_GLYPH);
    this.glyphs[0] = 0;
    this.cursor = 0;
    this.done = false;
    this.repeat.reset();
    this.confirmBuffer = 0;
    this.lockTicks = lockTicks;
    this.revision++;
  }

  /**
   * The glyph a letter shows.
   *
   * @param index - Letter index.
   * @returns Its one-character string, or `''` while the letter is empty (never builds a string).
   */
  letter(index: number): string {
    const glyph = index >= 0 && index < this.length ? this.glyphs[index] : NO_GLYPH;
    return glyph >= 0 ? GLYPH_STRINGS[glyph] : '';
  }

  /**
   * The name entered so far: the chosen letters (an empty one counts as a space), trailing spaces
   * removed. Builds a string — call it once the entry is done, not per frame.
   *
   * @returns The name (`''` when nothing but spaces was entered).
   */
  get name(): string {
    let text = '';
    for (let i = 0; i < this.length; i++) {
      const glyph = this.glyphs[i];
      text += glyph >= 0 ? GLYPH_STRINGS[glyph] : ' ';
    }
    return text.replace(/ +$/, '');
  }
}

/**
 * Creates a name entry.
 *
 * @param length - Letters of the name (default {@link NAME_ENTRY_LENGTH}; 1–8).
 * @returns The entry, `A` on the first letter.
 * @throws {RangeError} For a length outside 1–8.
 *
 * @example
 * ```ts
 * const entry = createNameEntry();
 * const result = nameEntryTick(entry, input); // MenuResult.Confirmed once OK is pressed on END
 * if (entry.done) store.renameScore(key, row, entry.name);
 * ```
 */
export function createNameEntry(length = NAME_ENTRY_LENGTH): NameEntry {
  if (!Number.isInteger(length) || length < 1 || length > 8) {
    throw new RangeError(`a name entry has 1–8 letters, got ${length}`);
  }
  return new NameEntry(length);
}

/**
 * Advances a name entry by one tick of input (see {@link NameEntry}).
 *
 * @remarks
 * Order: a Confirm press (re)fills the confirm buffer; Back acts like Left; while
 * {@link NameEntry.lockTicks} > 0 the buffered press waits (dropped after
 * {@link MENU_CONFIRM_BUFFER_TICKS} ticks), otherwise it moves on to the next letter (`Moved`) or,
 * on `END`, finishes the entry (`Confirmed`, {@link NameEntry.done}). Then the auto-repeated
 * direction: Up / Down step the letter under the cursor through {@link NAME_ENTRY_GLYPHS}
 * (wrapping; an empty letter starts at `A` going up, at the space going down — `Changed`), Right /
 * Left move the cursor (`Moved`; not past the first letter or `END`). A finished entry ignores
 * input (`None`). Never allocates.
 *
 * @param entry - The entry (updated; `revision` increases on visible changes).
 * @param input - This tick's menu input.
 * @returns What happened ({@link MenuResult}): `Changed`, `Moved`, `Confirmed` or `None`.
 *
 * @example
 * ```ts
 * // The first letter shows A: Up → B, then OK, OK, OK (past the empty letters) and OK on END.
 * if (nameEntryTick(entry, input) === MenuResult.Confirmed) save(entry.name); // → 'B'
 * ```
 */
export function nameEntryTick(entry: NameEntry, input: Readonly<PlayerInput>): MenuResult {
  if (entry.done) return MenuResult.None;
  if ((input.pressed & Action.Confirm) !== 0) entry.confirmBuffer = MENU_CONFIRM_BUFFER_TICKS;
  if ((input.pressed & Action.Back) !== 0) {
    entry.confirmBuffer = 0;
    return moveNameCursor(entry, -1);
  }
  if (entry.lockTicks > 0) {
    entry.lockTicks--;
    if (entry.confirmBuffer > 0) entry.confirmBuffer--;
  } else if (entry.confirmBuffer > 0) {
    entry.confirmBuffer = 0;
    if (entry.cursor >= entry.length) {
      entry.done = true;
      entry.revision++;
      return MenuResult.Confirmed;
    }
    return moveNameCursor(entry, 1);
  }
  const dir = repeatDirections(entry.repeat, input);
  if (dir === Action.Left || dir === Action.Right) {
    return moveNameCursor(entry, dir === Action.Left ? -1 : 1);
  }
  if ((dir === Action.Up || dir === Action.Down) && entry.cursor < entry.length) {
    const n = GLYPH_STRINGS.length;
    const glyph = entry.glyphs[entry.cursor];
    const next = dir === Action.Up ? glyph + 1 : glyph < 0 ? n - 1 : glyph - 1;
    entry.glyphs[entry.cursor] = next >= n ? 0 : next < 0 ? n - 1 : next;
    entry.revision++;
    return MenuResult.Changed;
  }
  return MenuResult.None;
}

/**
 * Moves the name entry's cursor one letter left or right (`END` is the last position).
 *
 * @param entry - The entry.
 * @param delta - -1 or +1.
 * @returns `Moved` when the cursor moved, else `None`.
 */
function moveNameCursor(entry: NameEntry, delta: number): MenuResult {
  const next = entry.cursor + delta;
  if (next < 0 || next > entry.length) return MenuResult.None;
  entry.cursor = next;
  entry.revision++;
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
  /** Panel border — the v2 rim's outer magenta line (art bible §2; R4-03.C6, was the v1 slate). */
  border: 0xb838a8,
  /** Panel border — the v2 rim's inner cyan line, one pixel inside {@link UI_COLORS}.border. */
  rimInner: 0x38c8e8,
  /** Titles on panels and screens. */
  title: 0x38c8e8,
  /** Warnings and "game over". */
  alert: 0xf85858,
  /** Slider bar background. */
  track: 0x2a3050,
});

/** The cursor glyph drawn left of the focused item (`→` is in the pixel font). */
const CURSOR = '→';

// The UI kit's text-relative sizes (plan_resolution.md R1-01) derive from the bitmap font's metrics
// (`core/config` GLYPH_W / GLYPH_H / LINE_H), so they grow with the font; since R2-01 its gaps,
// paddings and bar thicknesses are {@link uiPx} lengths, so they grow with the art (W4-3). The
// numbers in parentheses are their values at the 6×8 font and `ART_SCALE` 1. One-pixel lines
// (panel borders, underlines) stay one pixel.

/**
 * Width in pixels of a slider's bar: eight glyph cells and 2 px (50), so it grows with the text of
 * the value column it sits in.
 */
const SLIDER_BAR_W = 8 * GLYPH_W + uiPx(2);

/** Height of a slider's bar (5). */
const SLIDER_BAR_H = uiPx(5);

/** Top of a slider's bar below its row's top: the bar centred on the glyph row (1). */
const SLIDER_BAR_DY = (GLYPH_H - SLIDER_BAR_H) >> 1;

/** From a slider bar's right end to its value (6). */
const SLIDER_VALUE_GAP = uiPx(6);

/** Default row pitch of {@link drawMenu} (and the rebind panel): a line of text and 2 px (12). */
const MENU_LINE_H = LINE_H + uiPx(2);

/** Default distance from a menu label's x back to the cursor glyph: the glyph and 4 px (10). */
const MENU_CURSOR_DX = GLYPH_W + uiPx(4);

/**
 * Default distance from a menu label's x to its value column (a slider, `ON` / `OFF`, a choice's
 * label): room for a 13-glyph label and 2 px (80).
 */
const MENU_VALUE_DX = 13 * GLYPH_W + uiPx(2);

/**
 * Draws a framed box: a translucent fill and a neon rim (R4-03.C6, art bible §2 "Interface").
 * With the default colours the rim's top and bottom lines are magenta
 * ({@link UI_COLORS}.border) and its side rails cyan ({@link UI_COLORS}.rimInner) — the v2
 * double-neon look kept at one rect per edge so the scene UI list's command budget (R4-05's
 * raise lifts this to a full outer-plus-inner rim). Callers that pass an explicit border colour
 * (the focused zone card, the tints) get the v1 single-colour ring. One-pixel lines stay one.
 *
 * @param list - Target draw list.
 * @param x - Left edge.
 * @param y - Top edge.
 * @param w - Width.
 * @param h - Height.
 * @param fill - Fill colour (default {@link UI_COLORS}.panel).
 * @param border - Outer rim colour (default {@link UI_COLORS}.border; the default also turns the
 *   side rails {@link UI_COLORS}.rimInner, an explicit colour rings all four edges itself).
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
  const side = border === UI_COLORS.border ? UI_COLORS.rimInner : border;
  list.rect(x, y + 1, 1, h - 2, side);
  list.rect(x + w - 1, y + 1, 1, h - 2, side);
}

/** Where and how {@link drawMenu} lays a menu out. */
export interface MenuLayout {
  /** Alignment point of the labels (left edge, or the centre with `align` Center). */
  readonly x: number;
  /** Top of the first item. */
  readonly y: number;
  /** Row pitch (default a font line and 2 px: `LINE_H + 2`, 12). */
  readonly lineHeight?: number;
  /** {@link TextAlign} of the labels (default Left). */
  readonly align?: number;
  /** X of the cursor glyph (default a glyph cell and 4 px left of the label: `x − GLYPH_W − 4`). */
  readonly cursorX?: number;
  /**
   * X of a slider's bar / a toggle's `ON` / `OFF` / a choice's label (default 13 glyph cells and
   * 2 px right of `x`: `x + 80` at the 6-px cell).
   */
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
 * @param text - The UI string table (the toggles' `ON` / `OFF`; default {@link DEFAULT_UI_TEXT} —
 *   M2-16).
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
  text: UiText = DEFAULT_UI_TEXT,
): number {
  const items = menu.items;
  const n = items.length;
  const lineHeight = layout.lineHeight ?? MENU_LINE_H;
  const align = layout.align ?? TextAlign.Left;
  const cursorX = layout.cursorX ?? layout.x - MENU_CURSOR_DX;
  const valueX = layout.valueX ?? layout.x + MENU_VALUE_DX;
  const onSlot = stringBase + n;
  const offSlot = onSlot + 1;
  const cursorSlot = onSlot + 2;
  list.setString(onSlot, text.on);
  list.setString(offSlot, text.off);
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
      list.rect(valueX, y + SLIDER_BAR_DY, SLIDER_BAR_W, SLIDER_BAR_H, UI_COLORS.track);
      if (filled > 0) list.rect(valueX, y + SLIDER_BAR_DY, filled, SLIDER_BAR_H, color);
      list.number(slider.value, valueX + SLIDER_BAR_W + SLIDER_VALUE_GAP, y, 0, color);
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
 * Distance from a YES / NO choice's centre back to {@link drawConfirm}'s cursor glyph: three glyph
 * cells (18) — half a three-letter word, a gap and the cursor.
 */
const CONFIRM_CURSOR_DX = 3 * GLYPH_W;

/** Width of {@link drawConfirm}'s panel: a 28-glyph question and 4 px a side (176). */
const CONFIRM_W = 28 * GLYPH_W + uiPx(8);

/**
 * Height of {@link drawConfirm}'s panel: the question's two lines over the YES / NO row's glyphs,
 * and 24 px — 7 above, 9 between, 8 below (52).
 */
const CONFIRM_H = 2 * LINE_H + GLYPH_H + uiPx(24);

/** From the confirm panel's top to the question's first line (7). */
const CONFIRM_QUESTION_DY = uiPx(7);

/** From the confirm panel's bottom up to the YES / NO row (16). */
const CONFIRM_ROW_DY = uiPx(16);

/** From the confirm panel's centre to the YES and NO choices' centres (32). */
const CONFIRM_CHOICE_DX = uiPx(32);

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
 * @param text - The UI string table (`YES` / `NO`; default {@link DEFAULT_UI_TEXT} — M2-16).
 */
export function drawConfirm(
  list: DrawList,
  confirm: Confirm,
  stringBase: number,
  cx: number,
  cy: number,
  text: UiText = DEFAULT_UI_TEXT,
): void {
  const w = CONFIRM_W;
  const h = CONFIRM_H;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  drawPanel(list, x, y, w, h, UI_COLORS.panel, UI_COLORS.focus, 255);
  list.setString(stringBase, confirm.question);
  list.setString(stringBase + 1, text.yes);
  list.setString(stringBase + 2, text.no);
  list.setString(stringBase + 3, CURSOR);
  list.text(stringBase, cx, y + CONFIRM_QUESTION_DY, UI_COLORS.text, TextAlign.Center);
  const yesX = Math.round(cx - CONFIRM_CHOICE_DX);
  const noX = Math.round(cx + CONFIRM_CHOICE_DX);
  const row = y + h - CONFIRM_ROW_DY;
  const yes = confirm.focus === ConfirmChoice.Yes;
  list.text(stringBase + 3, (yes ? yesX : noX) - CONFIRM_CURSOR_DX, row, UI_COLORS.focus);
  list.text(stringBase + 1, yesX, row, yes ? UI_COLORS.focus : UI_COLORS.text, TextAlign.Center);
  list.text(stringBase + 2, noX, row, yes ? UI_COLORS.text : UI_COLORS.focus, TextAlign.Center);
}

/** Pitch in pixels between two letters of {@link drawNameEntry}: a glyph cell and 10 px (16). */
const NAME_CELL_PITCH = GLYPH_W + uiPx(10);

/** Width of a letter's underline in {@link drawNameEntry}: a glyph cell and 2 px a side (10). */
const NAME_LINE_W = GLYPH_W + uiPx(4);

/** Width of `END`'s underline in {@link drawNameEntry}: three glyph cells and 2 px (20). */
const NAME_END_LINE_W = 3 * GLYPH_W + uiPx(2);

/** Rows from the letters' top to their underline: a glyph and 2 px (10). */
const NAME_LINE_DY = GLYPH_H + uiPx(2);

/** Rows from the letters' top up to the `↑` above the cursor: a glyph and 3 px (11). */
const NAME_UP_DY = GLYPH_H + uiPx(3);

/** Rows from the letters' top down to the `↓` below the cursor: a glyph and 5 px (13). */
const NAME_DOWN_DY = GLYPH_H + uiPx(5);

/**
 * Draws a name entry centred at a point: one cell per letter (the letter, or `_` while empty,
 * over an underline), then `END`; the cursor's cell in {@link UI_COLORS}.focus with `↑` / `↓` above
 * and below it (hidden while `blinkOff`), `END` highlighted when the cursor is on it.
 *
 * @remarks
 * Uses the string slots `stringBase … stringBase + NAME_ENTRY_STRING_SLOTS − 1` (the letters,
 * `END`, `↑`, `↓`, `_`) and writes them only when changed (the letters are the glyph table's own
 * strings). Never allocates.
 *
 * @param list - Target draw list.
 * @param entry - The entry.
 * @param stringBase - First string slot it may use.
 * @param cx - Centre x of the row.
 * @param y - Top of the letters.
 * @param blinkOff - Hide the cursor's arrows and the letter's highlight this frame (a blink).
 * @param text - The UI string table (`END`; default {@link DEFAULT_UI_TEXT} — M2-16).
 */
export function drawNameEntry(
  list: DrawList,
  entry: NameEntry,
  stringBase: number,
  cx: number,
  y: number,
  blinkOff = false,
  text: UiText = DEFAULT_UI_TEXT,
): void {
  const n = entry.length;
  const endSlot = stringBase + n;
  const upSlot = endSlot + 1;
  const downSlot = endSlot + 2;
  const blankSlot = endSlot + 3;
  list.setString(endSlot, text.end);
  list.setString(upSlot, '↑');
  list.setString(downSlot, '↓');
  list.setString(blankSlot, '_');
  const left = Math.round(cx - ((n + 2) * NAME_CELL_PITCH) / 2);
  for (let i = 0; i < n; i++) {
    const x = left + i * NAME_CELL_PITCH + (NAME_CELL_PITCH >> 1);
    const focused = entry.cursor === i && !entry.done;
    const color = focused && !blinkOff ? UI_COLORS.focus : UI_COLORS.text;
    const letter = entry.letter(i);
    if (letter !== '') {
      list.setString(stringBase + i, letter);
      list.text(stringBase + i, x, y, color, TextAlign.Center);
    } else {
      list.text(blankSlot, x, y, UI_COLORS.disabled, TextAlign.Center);
    }
    list.rect(
      x - (NAME_LINE_W >> 1),
      y + NAME_LINE_DY,
      NAME_LINE_W,
      1,
      focused ? UI_COLORS.focus : UI_COLORS.border,
    );
    if (focused && !blinkOff) {
      list.text(upSlot, x, y - NAME_UP_DY, UI_COLORS.focus, TextAlign.Center);
      list.text(downSlot, x, y + NAME_DOWN_DY, UI_COLORS.focus, TextAlign.Center);
    }
  }
  const endX = left + n * NAME_CELL_PITCH + NAME_CELL_PITCH;
  const onEnd = entry.cursor >= n && !entry.done;
  list.text(
    endSlot,
    endX,
    y,
    onEnd && !blinkOff ? UI_COLORS.focus : onEnd ? UI_COLORS.text : UI_COLORS.disabled,
    TextAlign.Center,
  );
  if (onEnd) {
    list.rect(endX - (NAME_END_LINE_W >> 1), y + NAME_LINE_DY, NAME_END_LINE_W, 1, UI_COLORS.focus);
  }
}

// ------------------------------------------------------------------------------ rebind (M2-16)

/**
 * The actions each binding context lets the player rebind (M2-16 — shmup_feat.md §4 "[P1]
 * Rebinding"), in the rebind screen's order: the game's directions, weapons, power-up, special,
 * speed and pause; the menus' directions, OK, Back and pause.
 */
export const REBINDABLE_ACTIONS: Readonly<Record<InputContext, readonly ActionName[]>> =
  Object.freeze({
    game: Object.freeze([
      'Up',
      'Down',
      'Left',
      'Right',
      'Shot',
      'Sub',
      'PowerUp',
      'Special',
      'Speed',
      'Pause',
    ] as ActionName[]),
    menu: Object.freeze([
      'Up',
      'Down',
      'Left',
      'Right',
      'Confirm',
      'Back',
      'Pause',
    ] as ActionName[]),
  });

/**
 * Outcomes of a rebinding (M2-16 — `@shmup/input-web` `rebindAction` returns them, the rebind
 * screen shows them).
 */
export const RebindStatus = {
  /** The action now has the key; nothing else had it. */
  Bound: 0,
  /** The key was taken from another action, which kept other keys (a conflict resolved). */
  Moved: 1,
  /** The other action had only that key: the two actions swapped keys (a conflict resolved). */
  Swapped: 2,
  /** Nothing changed: the other action needs a key and none was left to give it. */
  Refused: 3,
  /** Nothing changed: the action already had exactly that key. */
  Unchanged: 4,
  /** Nothing changed: the key cannot be bound (reserved, or not the device's kind). */
  Rejected: 5,
} as const;

/** A {@link RebindStatus} code. */
export type RebindStatus = (typeof RebindStatus)[keyof typeof RebindStatus];

/**
 * States of a rebinding capture (M2-16 — `@shmup/input-web` `WebInput.capture`, the scene flow's
 * `ControlsSetup.pollCapture`).
 */
export const CaptureStatus = {
  /** No capture running. */
  Idle: 0,
  /** Waiting for the next key or button. */
  Waiting: 1,
  /** A key or button was caught. */
  Captured: 2,
  /** Escape / the remote's Back cancelled it. */
  Cancelled: 3,
} as const;

/** A {@link CaptureStatus} code. */
export type CaptureStatus = (typeof CaptureStatus)[keyof typeof CaptureStatus];

/** Ticks a rebind prompt waits for a key before it gives up (5 s). */
export const REBIND_CAPTURE_TICKS = 300;

/** What {@link rebindTick} reports. */
export const RebindEvent = {
  /** Nothing to act on (the panel may have moved — see {@link RebindPanel.result}). */
  None: 0,
  /** MODE changed: the other context's rows show. */
  Context: 1,
  /** OK on an action row: capture a key for {@link RebindPanel.focusedAction}. */
  Capture: 2,
  /** OK on RESET: reset the shown context's bindings. */
  Reset: 3,
  /** OK on DONE, or Back: close the screen. */
  Done: 4,
} as const;

/** A {@link RebindEvent} code. */
export type RebindEvent = (typeof RebindEvent)[keyof typeof RebindEvent];

/** The labels a {@link RebindPanel} is built with (the UI string table's). */
export interface RebindPanelLabels {
  /** The MODE row. */
  readonly mode: string;
  /** The context names, in `INPUT_CONTEXTS` order (`GAME`, `MENU`). */
  readonly contexts: readonly string[];
  /** Each action's row label. */
  readonly actions: Readonly<Record<ActionName, string>>;
  /** The RESET row. */
  readonly reset: string;
  /** The DONE row. */
  readonly done: string;
}

/**
 * The rebind widget (M2-16 — plan "core `ui` + rebind widget"): per binding context a list of MODE
 * (the context shown — a {@link Choice} both lists share), one row per {@link REBINDABLE_ACTIONS}
 * action with its keys on the right ({@link RebindPanel.keys}, set by the scene from the host),
 * RESET and DONE; plus the capture prompt's state and a message line. The scene drives the capture
 * (the host's key source) and the bindings; the widget is the UI state machine ({@link rebindTick})
 * and its look ({@link drawRebindPanel}). A class: nothing allocates after creation.
 */
export class RebindPanel {
  /** MODE: the context shown (`INPUT_CONTEXTS` order). */
  readonly contextChoice: Choice;
  /** The rows of each context (`INPUT_CONTEXTS` order). */
  readonly menus: readonly ListMenu[];
  /** Per context, per action row: the keys shown (`Z  SPACE`; `-` unbound). */
  readonly keys: readonly string[][];
  /** Whether a capture prompt is up. */
  capturing = false;
  /** Ticks the prompt has been up. */
  captureTicks = 0;
  /** The prompt's question (`PRESS A KEY FOR SHOT`; set with {@link RebindPanel.startCapture}). */
  prompt = '';
  /** The message line under the rows (the last outcome; `''` = none). */
  message = '';
  /** The {@link MenuResult} of the last {@link rebindTick} (the scene plays its sound). */
  result: MenuResult = MenuResult.None;
  /** Increases whenever the panel's look changes. */
  revision = 0;
  /** String slots of the larger context's menu ({@link drawRebindPanel}'s first range). */
  readonly menuSlots: number;
  /** Action rows of the larger context (the keys' string slots). */
  readonly maxRows: number;

  /**
   * Creates the panel (use {@link createRebindPanel}).
   *
   * @param labels - The labels.
   */
  constructor(labels: RebindPanelLabels) {
    this.contextChoice = createChoice(labels.contexts.slice(0, INPUT_CONTEXTS.length), 0);
    const menus: ListMenu[] = [];
    const keys: string[][] = [];
    for (const context of INPUT_CONTEXTS) {
      const items: MenuItemSpec[] = [{ label: labels.mode, choice: this.contextChoice }];
      const rows: string[] = [];
      for (const action of REBINDABLE_ACTIONS[context]) {
        items.push(labels.actions[action]);
        rows.push('-');
      }
      items.push(labels.reset, labels.done);
      menus.push(createListMenu(items));
      keys.push(rows);
    }
    this.menus = menus;
    this.keys = keys;
    let menuSlots = 0;
    let maxRows = 0;
    for (let c = 0; c < menus.length; c++) {
      menuSlots = Math.max(menuSlots, menuStringSlots(menus[c]));
      maxRows = Math.max(maxRows, keys[c].length);
    }
    this.menuSlots = menuSlots;
    this.maxRows = maxRows;
  }

  /** The context shown. */
  get context(): InputContext {
    return INPUT_CONTEXTS[this.contextChoice.index] ?? 'game';
  }

  /** The rows of the context shown. */
  get menu(): ListMenu {
    return this.menus[this.contextChoice.index] ?? this.menus[0];
  }

  /** The action of the focused row, or `null` on MODE, RESET and DONE. */
  get focusedAction(): ActionName | null {
    const actions = REBINDABLE_ACTIONS[this.context];
    const row = this.menu.focus - 1;
    return row >= 0 && row < actions.length ? actions[row] : null;
  }

  /** Index of the RESET row in the context shown (DONE is the next). */
  get resetRow(): number {
    return REBINDABLE_ACTIONS[this.context].length + 1;
  }

  /**
   * Sets the keys shown for one action (a cold path — after a rebinding or when the screen opens).
   *
   * @param context - Its context.
   * @param action - The action (one of the context's {@link REBINDABLE_ACTIONS}; others are
   *   ignored).
   * @param label - The keys' label.
   */
  setKeys(context: InputContext, action: ActionName, label: string): void {
    const c = INPUT_CONTEXTS.indexOf(context);
    const row = c < 0 ? -1 : REBINDABLE_ACTIONS[context].indexOf(action);
    if (row < 0 || this.keys[c][row] === label) return;
    this.keys[c][row] = label;
    this.revision++;
  }

  /**
   * Shows a message on the line under the rows (`''` clears it).
   *
   * @param message - The text (built by the scene on a rebinding — a cold path).
   */
  say(message: string): void {
    if (message === this.message) return;
    this.message = message;
    this.revision++;
  }

  /**
   * Puts the capture prompt up (the scene has asked its host for the next key).
   *
   * @param prompt - The question.
   */
  startCapture(prompt: string): void {
    this.capturing = true;
    this.captureTicks = 0;
    this.prompt = prompt;
    this.revision++;
  }

  /** Takes the capture prompt down; the rows take input again after a short lock. */
  stopCapture(): void {
    if (!this.capturing) return;
    this.capturing = false;
    this.menu.open(2);
    this.revision++;
  }

  /**
   * Opens the panel on a context: its MODE row focused, the message cleared, locked for a few
   * ticks.
   *
   * @param context - The context to show first.
   * @param lockTicks - Ticks activation waits for.
   */
  open(context: InputContext, lockTicks: number): void {
    const c = INPUT_CONTEXTS.indexOf(context);
    this.contextChoice.index = c < 0 ? 0 : c;
    this.capturing = false;
    this.message = '';
    const menu = this.menu;
    menu.focus = 0;
    menu.open(lockTicks);
    this.revision++;
  }
}

/**
 * Creates a rebind widget.
 *
 * @param labels - Its labels (the UI string table's).
 * @returns The panel, showing the game context.
 */
export function createRebindPanel(labels: RebindPanelLabels): RebindPanel {
  return new RebindPanel(labels);
}

/**
 * Advances a rebind widget by one tick of menu input.
 *
 * @remarks
 * While the capture prompt is up only its clock runs (the scene reads the host's capture and calls
 * {@link RebindPanel.stopCapture}); otherwise the rows of the context shown take the input
 * ({@link menuTick}; {@link RebindPanel.result} keeps its result for the sound): Back or OK on DONE
 * → `Done`; a MODE change → `Context` (the other context's rows show, on MODE); OK on an action row
 * → `Capture`; OK on RESET → `Reset`. Never allocates.
 *
 * @param panel - The panel.
 * @param input - This tick's menu input.
 * @returns What happened ({@link RebindEvent}).
 */
export function rebindTick(panel: RebindPanel, input: Readonly<PlayerInput>): RebindEvent {
  panel.result = MenuResult.None;
  if (panel.capturing) {
    panel.captureTicks++;
    if (panel.captureTicks % 30 === 0) panel.revision++; // the prompt's time bar
    return RebindEvent.None;
  }
  const menu = panel.menu;
  const before = menu.revision;
  const result = menuTick(menu, input);
  panel.result = result;
  if (menu.revision !== before) panel.revision++;
  if (result === MenuResult.Back) return RebindEvent.Done;
  if (result === MenuResult.Changed && menu.focus === 0) {
    // The other context's rows, focused on MODE.
    const next = panel.menu;
    next.focus = 0;
    next.open(0);
    panel.revision++;
    return RebindEvent.Context;
  }
  if (result !== MenuResult.Confirmed) return RebindEvent.None;
  const reset = panel.resetRow;
  if (menu.focus === reset) return RebindEvent.Reset;
  if (menu.focus === reset + 1) return RebindEvent.Done;
  return panel.focusedAction !== null ? RebindEvent.Capture : RebindEvent.None;
}

/**
 * String slots {@link drawRebindPanel} uses: the larger context's menu, one per action row's keys,
 * the message, the prompt and its hint.
 *
 * @param panel - The panel.
 * @returns The slot count.
 */
export function rebindStringSlots(panel: RebindPanel): number {
  return panel.menuSlots + panel.maxRows + 3;
}

/** Width of the rebind prompt's capture box: a 40-glyph prompt (240). */
const CAPTURE_W = 40 * GLYPH_W;

/**
 * Height of the rebind prompt's capture box: the prompt's and the hint's glyph rows, and 32 px
 * of gaps and the countdown bar (48).
 */
const CAPTURE_H = 2 * GLYPH_H + uiPx(32);

/**
 * The rebind prompt's capture box (the prompt, the hint and the countdown bar), centred on the
 * frame (R1-01: at 72, 84 in the 384×216 frame).
 */
const CAPTURE_PANEL = Object.freeze({
  x: FRAME_CX - (CAPTURE_W >> 1),
  y: FRAME_CY - (CAPTURE_H >> 1),
  w: CAPTURE_W,
  h: CAPTURE_H,
});

/** From the capture box's top to its prompt line (8). */
const CAPTURE_PROMPT_DY = uiPx(8);

/** From the capture box's top to its hint line: the prompt's glyph and 6 px under it (22). */
const CAPTURE_HINT_DY = CAPTURE_PROMPT_DY + GLYPH_H + uiPx(6);

/** Inset of the capture box's countdown bar from each side of the box (20). */
const CAPTURE_BAR_INSET = uiPx(20);

/** From the capture box's bottom up to its countdown bar (10). */
const CAPTURE_BAR_DY = uiPx(10);

/** Height of the capture box's countdown bar (3). */
const CAPTURE_BAR_H = uiPx(3);

/** From the rebind rows' bottom to the message line (4). */
const REBIND_MESSAGE_DY = uiPx(4);

/**
 * Draws a rebind widget: the context's rows ({@link drawMenu}) with each action's keys at the
 * layout's value column, the message line below them and — while capturing — the prompt in a box
 * over the rows with its hint and a bar draining over {@link REBIND_CAPTURE_TICKS}.
 *
 * @remarks
 * Uses the string slots `stringBase … stringBase + rebindStringSlots(panel) − 1` and writes a slot
 * only when its text changed. Never allocates.
 *
 * @param list - Target draw list.
 * @param panel - The panel.
 * @param stringBase - First string slot it may use.
 * @param layout - Where the rows go (a frozen constant).
 * @param hint - The prompt's hint line (`ESC / BACK OR WAIT: CANCEL`).
 * @param text - The UI string table (the toggles' words; default {@link DEFAULT_UI_TEXT}).
 */
export function drawRebindPanel(
  list: DrawList,
  panel: RebindPanel,
  stringBase: number,
  layout: MenuLayout,
  hint: string,
  text: UiText = DEFAULT_UI_TEXT,
): void {
  const menu = panel.menu;
  const bottom = drawMenu(list, menu, stringBase, layout, text);
  const lineHeight = layout.lineHeight ?? MENU_LINE_H;
  const valueX = layout.valueX ?? layout.x + MENU_VALUE_DX;
  const keys = panel.keys[panel.contextChoice.index] ?? panel.keys[0];
  const keyBase = stringBase + panel.menuSlots;
  for (let i = 0; i < keys.length; i++) {
    const row = i + 1;
    const focused = menu.focus === row && !panel.capturing;
    list.setString(keyBase + i, keys[i]);
    list.text(
      keyBase + i,
      valueX,
      layout.y + row * lineHeight,
      focused ? UI_COLORS.focus : UI_COLORS.title,
    );
  }
  const messageSlot = keyBase + panel.maxRows;
  if (panel.message !== '') {
    list.setString(messageSlot, panel.message);
    list.text(messageSlot, FRAME_CX, bottom + REBIND_MESSAGE_DY, UI_COLORS.focus, TextAlign.Center);
  }
  if (!panel.capturing) return;
  const p = CAPTURE_PANEL;
  const x = p.x;
  const y = p.y;
  const w = p.w;
  const h = p.h;
  drawPanel(list, x, y, w, h, UI_COLORS.panel, UI_COLORS.focus, 255);
  list.setString(messageSlot + 1, panel.prompt);
  list.setString(messageSlot + 2, hint);
  list.text(messageSlot + 1, FRAME_CX, y + CAPTURE_PROMPT_DY, UI_COLORS.focus, TextAlign.Center);
  list.text(messageSlot + 2, FRAME_CX, y + CAPTURE_HINT_DY, UI_COLORS.disabled, TextAlign.Center);
  const left = REBIND_CAPTURE_TICKS - panel.captureTicks;
  const barW = w - 2 * CAPTURE_BAR_INSET;
  const bar = left > 0 ? Math.floor((barW * left) / REBIND_CAPTURE_TICKS) : 0;
  const barX = x + CAPTURE_BAR_INSET;
  const barY = y + h - CAPTURE_BAR_DY;
  list.rect(barX, barY, barW, CAPTURE_BAR_H, UI_COLORS.track);
  if (bar > 0) list.rect(barX, barY, bar, CAPTURE_BAR_H, UI_COLORS.title);
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

// The HUD's geometry (plan_resolution.md R1-01, redrawn for the v2 bars by R4-03.C5): the bars'
// rows and every edge- or centre-anchored x derive from the frame (`core/config` FRAME_W, FRAME_CX,
// HUD_BOTTOM_Y, HUD_BAR_HEIGHT), the text extents from the font's cell (GLYPH_W), and each run of
// labels and pips starts after the one before it — so the HUD stays laid out when the frame or the
// font changes. The numbers in parentheses are the values at 384×216 with the 6×8 font and
// `ART_SCALE` 1. The HUD art's own sizes (the `hud/meter-slot` box, the life icons and their pitch,
// the pips' sizes and steps, the rows inside a bar) are uiPx lengths since R2-01: they follow the
// art's scale (×1.5, R4-03's native redraw at these same sizes), not the frame's. One-pixel borders
// stay one pixel. Two runs are laid out for the wide frame instead of packed: the boss HP bar spans
// a quarter of the frame, and the Direct mode's four groups march over the bottom bar in an even
// pitch that ends the family label at the right margin (R1-01's experiment found the packed v1 run
// leaving the bar's right side empty).

/** Gap in pixels between a HUD label and the number or bar after it (4). */
const HUD_LABEL_GAP = uiPx(4);

/** A row of art inside a HUD bar (the pips, the boss bar's frame): its top (2). */
const HUD_ROW_DY = uiPx(2);

/** Height of a HUD pip, a stock icon's stand-in and the boss bar's frame (4). */
const HUD_PIP_H = uiPx(4);

/** Width of a HUD pip: the Direct-mode tier pips and the co-op shield pips (4). */
const HUD_PIP_W = uiPx(4);

/** Width of a co-op Direct-mode compact pip (3). */
const HUD_COOP_PIP_W = uiPx(3);

/** Width of a Force Field pip on the one-player bottom bar (5). */
const HUD_SHIELD_PIP_W = uiPx(5);

/** Pitch of the one-player Force Field pips (7). */
const HUD_SHIELD_PIP_STEP = uiPx(7);

/** Pitch of the co-op Force Field pips (5). */
const HUD_COOP_SHIELD_PIP_STEP = uiPx(5);

/** Direct mode: pitch of the `SHOT` / `SUB` level pips (5). */
const HUD_LEVEL_PIP_STEP = uiPx(5);

/** Direct mode: pitch of the `ARM` / `SPD` pips (6). */
const HUD_TIER_PIP_STEP = uiPx(6);

/** Co-op Direct mode: pitch of the compact pips (4). */
const HUD_COOP_PIP_STEP = uiPx(4);

/** Width of a stock icon (`hud/life`) — its stand-in rectangle's (8). */
const HUD_STOCK_W = uiPx(8);

/** Height of a stock icon (`hud/life` — 5; the v2 art's own 8). */
const HUD_STOCK_H = uiPx(5);

/**
 * Row of the stock icons inside the bottom bar: the icons are centred vertically,
 * `(HUD_BAR_HEIGHT − HUD_STOCK_H) >> 1` below the bar's top (1) — the same row the flight scene's
 * `LIVES_Y` shows (the v1 art sat one pixel into the bar; at 12-px bars centring is what R2-01's
 * note asked for, and it keeps the browser spec's icon band).
 */
const HUD_STOCK_DY = (HUD_BAR_HEIGHT - HUD_STOCK_H) >> 1;

/** Pitch of the stock icons (10); the co-op count follows its icon by the same. */
const HUD_STOCK_STEP = uiPx(10);

/** From the one stock icon to the count drawn after it when there are more than five (12). */
const HUD_STOCK_COUNT_DX = uiPx(12);

/** Height of a meter slot's stand-in box (one-player and co-op) without the UI sprites (6). */
const HUD_SLOT_BOX_H = uiPx(6);

/** From a meter slot's left edge to its `hud/meter-labels` frame, and down from the bar (2). */
const HUD_SLOT_LABEL_D = uiPx(2);

/** Digits of a top-bar score. */
const HUD_DIGITS = 8;

/** From a two-glyph top-bar label (`1P`, `HI`, `2P`) to its number: the label and the gap (16). */
const HUD_SCORE_DX = 2 * GLYPH_W + HUD_LABEL_GAP;

/** Width of the hi-score display: `HI`, the gap and the {@link HUD_DIGITS} digits (64). */
const HUD_HI_W = HUD_SCORE_DX + HUD_DIGITS * GLYPH_W;

/**
 * Width of the boss HP bar's frame in the top HUD bar (M2-09, re-anchored to the frame by
 * R4-03.C5): a quarter of the frame — the bar replaces the centred hi-score while a boss is up,
 * and the wide frame earns a wide bar (96). The fill is 2 px narrower.
 */
export const BOSS_HP_BAR_WIDTH = FRAME_W >> 2;

/** From the boss HP bar's `BOSS` label to its frame: four glyph cells and the gap (28 — M2-09). */
const HUD_BOSS_BAR_DX = 4 * GLYPH_W + HUD_LABEL_GAP;

/**
 * The boss HP bar's `BOSS` label x: the label, the gap and the bar centred 2 px right of the
 * frame's centre (132).
 */
const HUD_BOSS_X = FRAME_CX - ((HUD_BOSS_BAR_DX + BOSS_HP_BAR_WIDTH) >> 1) + uiPx(2);

/**
 * Direct mode (M2-05, R4-03.C5): from a group's label to its first pip — four glyph cells and
 * 2 px (26). This reservation fits every shipped label: the widest the run shows in any
 * language is 4 glyphs (the Japanese `ショット`), and `ui-hud-layout.test.ts` keeps
 * that bound for en, es and ja — so the pips never sit under a label.
 */
const HUD_DIRECT_PIPS_DX = 4 * GLYPH_W + uiPx(2);

/**
 * Direct mode: the `SPD` group's run — the label's reservation and 5 pips on the tier pitch (56).
 * The widest group run is `SHOT` / `SUB`'s 8 pips on the level pitch; the pitch below fits it.
 */
const HUD_DIRECT_SPD_RUN = HUD_DIRECT_PIPS_DX + 5 * HUD_TIER_PIP_STEP;

/**
 * Direct mode: the main-shot family label's reservation — four glyph cells, the longest shipped
 * family name (`DISC`, `WAVE` — a test keeps every content family inside it) (24).
 */
const HUD_DIRECT_FAMILY_W = 4 * GLYPH_W;

/** Co-op Direct mode (M2-06): from a two-glyph label (`SH`, `SB`, `AR`, `SP`) to its pips (13). */
const HUD_COOP_PIPS_DX = 2 * GLYPH_W + uiPx(1);

/** Most stock icons drawn; more show one icon and the count. */
const HUD_STOCK_ICONS = 5;

/** The first stock icon's x (4). */
const HUD_STOCK_X = uiPx(4);

/**
 * The first meter slot x — after the five stock icons and 4 px (58). Direct mode's `SHOT` label
 * starts there too.
 */
const HUD_METER_X = HUD_STOCK_X + HUD_STOCK_ICONS * HUD_STOCK_STEP + uiPx(4);

/**
 * Direct mode (R4-03.C5): the main-shot family's label x — the four-glyph reservation ending at
 * the bar's right margin, like the `2P` run (350).
 */
const HUD_FAMILY_X = FRAME_W - uiPx(10) - HUD_DIRECT_FAMILY_W;

/**
 * Direct mode: the pitch of the four pip groups' label x — `SHOT`, `SUB`, `ARM`, `SPD` evenly
 * spread so the `SPD` run's widest case (its five tier pips) ends a 6 px gap before the family
 * label (76). A group's own run is at most the `SHOT`/`SUB` 8 level pips; a test keeps it inside
 * the pitch in every shipped language.
 */
const HUD_DIRECT_PITCH = Math.floor(
  (HUD_FAMILY_X - uiPx(6) - HUD_DIRECT_SPD_RUN - HUD_METER_X) / 3,
);

/** Direct mode: the `SUB` label x — one pitch after `SHOT` (134). */
const HUD_SUB_X = HUD_METER_X + HUD_DIRECT_PITCH;

/** Direct mode: the `ARM` label x — two pitches after `SHOT` (210). */
const HUD_ARM_X = HUD_METER_X + 2 * HUD_DIRECT_PITCH;

/** Direct mode: the `SPD` label x — three pitches after `SHOT` (286). */
const HUD_SPEED_X = HUD_METER_X + 3 * HUD_DIRECT_PITCH;

/** Co-op: the stock icon x in a half (2). */
const HUD_COOP_STOCK_X = uiPx(2);

/**
 * Co-op: the first compact meter slot x in a half — after the stock icon, its count's digit (10 px
 * after the icon) and the gap (22). Co-op Direct mode's `SH` starts there too.
 */
const HUD_COOP_METER_X = HUD_COOP_STOCK_X + HUD_STOCK_STEP + GLYPH_W + HUD_LABEL_GAP;

/** Co-op: compact meter slot width — a two-glyph label and 4 px a side (20). */
const HUD_COOP_SLOT_W = 2 * GLYPH_W + uiPx(8);

/** Co-op Direct mode: the `SB` label x — after `SH`'s 8 pips 4 px apart and 1 px (68). */
const HUD_COOP_SUB_X = HUD_COOP_METER_X + HUD_COOP_PIPS_DX + 8 * HUD_COOP_PIP_STEP + uiPx(1);

/** Co-op Direct mode: the `AR` label x — after `SB`'s 8 pips 4 px apart and 1 px (114). */
const HUD_COOP_ARM_X = HUD_COOP_SUB_X + HUD_COOP_PIPS_DX + 8 * HUD_COOP_PIP_STEP + uiPx(1);

/** Co-op Direct mode: the `SP` label x — after `AR`'s 5 pips 4 px apart and 1 px (148). */
const HUD_COOP_SPEED_X = HUD_COOP_ARM_X + HUD_COOP_PIPS_DX + 5 * HUD_COOP_PIP_STEP + uiPx(1);

/**
 * Pixel positions of the HUD in frame coordinates — derived from the frame and the font's metrics
 * (R1-01); the numbers in parentheses are the values at 384×216 with the 6×8 font.
 */
export const HUD_LAYOUT = Object.freeze({
  /** Top bar row. */
  topY: 0,
  /** Bottom bar row: the row under the playfield (`HUD_BOTTOM_Y`, 208). */
  bottomY: HUD_BOTTOM_Y,
  /** `1P` label x (8); its score follows a two-glyph label and 4 px later (`+16`). */
  p1X: uiPx(8),
  /** `HI` label x: the hi-score display centred 4 px left of the frame's centre (156). */
  hiX: FRAME_CX - (HUD_HI_W >> 1) - uiPx(4),
  /**
   * `2P` label x: room for the label, the gap and an 11-glyph `PRESS START` (the widest thing its
   * slot shows) 10 px from the right edge (292); its score (or dashes) follows at `+16`.
   */
  p2X: FRAME_W - uiPx(10) - HUD_SCORE_DX - 11 * GLYPH_W,
  /** Score digits. */
  digits: HUD_DIGITS,
  /** First stock icon x (4; icons are 10 px apart). */
  stockX: HUD_STOCK_X,
  /** Most stock icons drawn; more show one icon and the count. */
  stockIcons: HUD_STOCK_ICONS,
  /** First meter slot x (58; slots are 40 px wide). */
  meterX: HUD_METER_X,
  /** Meter slot width (the `hud/meter-slot` art's — 40). */
  slotW: uiPx(40),
  /** First Force Field pip x: 5 pips 7 px apart ending 7 px from the right edge (344). */
  shieldX: FRAME_W - (5 * HUD_SHIELD_PIP_STEP + HUD_SHIELD_PIP_W),
  /** Direct mode (M2-05): `SHOT` label x; its pips start after the four-glyph label (R4-03.C5). */
  shotX: HUD_METER_X,
  /** Direct mode: `SUB` label x — one pitch after `SHOT`. */
  subX: HUD_SUB_X,
  /** Direct mode: `ARM` label x — two pitches after `SHOT`. */
  armX: HUD_ARM_X,
  /** Direct mode: `SPD` label x — three pitches after `SHOT`. */
  speedX: HUD_SPEED_X,
  /** Direct mode: the main-shot family's label x — four glyph cells end at the right margin. */
  familyX: HUD_FAMILY_X,
  /** The boss HP bar's `BOSS` label x (M2-09; the bar replaces the hi-score while shown — 132). */
  bossX: HUD_BOSS_X,
  /** The boss HP bar's frame x (160); the frame is {@link BOSS_HP_BAR_WIDTH} wide, 4 px tall. */
  bossBarX: HUD_BOSS_X + HUD_BOSS_BAR_DX,
  /**
   * Co-op (M2-06): width of each player's half of the bottom bar while both play — half the frame
   * (player 1 from x 0, player 2 from x 192); the offsets below are relative to the half's left
   * edge.
   */
  halfW: FRAME_W / 2,
  /** Co-op: the stock icon x; the count follows 10 px later. */
  coopStockX: HUD_COOP_STOCK_X,
  /** Co-op: the first compact meter slot x (slots are {@link HUD_LAYOUT}.coopSlotW wide). */
  coopMeterX: HUD_COOP_METER_X,
  /** Co-op: compact meter slot width (a box with the slot's two-letter label). */
  coopSlotW: HUD_COOP_SLOT_W,
  /** Co-op: the first shield pip x, after the seven slots and 2 px (164; pips are 5 px apart). */
  coopShieldX: HUD_COOP_METER_X + METER_SLOT_COUNT * HUD_COOP_SLOT_W + uiPx(2),
  /** Co-op Direct mode: `SH` (shot) label x; its pips (4 px apart) start 13 px later. */
  coopShotX: HUD_COOP_METER_X,
  /** Co-op Direct mode: `SB` (sub-weapon) label x. */
  coopSubX: HUD_COOP_SUB_X,
  /** Co-op Direct mode: `AR` (Arm) label x. */
  coopArmX: HUD_COOP_ARM_X,
  /** Co-op Direct mode: `SP` (speed) label x. */
  coopSpeedX: HUD_COOP_SPEED_X,
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
 * `WEAPON_BEHAVIOR_LABELS`), then the Extra Edit weapons' (M3-01).
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
  'CONTROL',
  'UPPER',
  'SMALL SP',
  'HAWK',
  '2-WAY BK',
  'BACK DBL',
  'SPR GUN',
  'FLAK',
  'RAIL',
  'SEEKER',
  'CHAIN',
  'BEACON',
]);

/**
 * The UI string ids of the co-op HUD's compact meter labels, in {@link METER_LABEL_FRAMES} order
 * (M2-16: the labels are drawn from the string table; {@link METER_SHORT_LABELS} are the English
 * ones).
 */
export const METER_SHORT_IDS: readonly UiTextId[] = Object.freeze([
  'meterShortSpeed',
  'meterShortMissile',
  'meterShortDouble',
  'meterShortLaser',
  'meterShortOption',
  'meterShortShield',
  'meterShortMega',
  'meterShortSpread',
  'meterShortTwoWay',
  'meterShortTorpedo',
  'meterShortTail',
  'meterShortVertical',
  'meterShortFreeWay',
  'meterShortRipple',
  'meterShortCyclone',
  'meterShortTwin',
  'meterShortControl',
  'meterShortUpper',
  'meterShortSmallSpread',
  'meterShortHawk',
  'meterShortTwoWayBack',
  'meterShortBackDouble',
  'meterShortSpreadGun',
  'meterShortFlak',
  'meterShortRail',
  'meterShortSeeker',
  'meterShortChain',
  'meterShortBeacon',
] as UiTextId[]);

/**
 * The co-op HUD's compact meter labels (M2-06): two letters per {@link METER_LABEL_FRAMES} entry, in
 * the same order, drawn with the bitmap font in the 20-px slots of each player's half — the English
 * ones of {@link METER_SHORT_IDS} (M2-16: the HUD draws its string table's).
 */
export const METER_SHORT_LABELS: readonly string[] = Object.freeze(
  METER_SHORT_IDS.map((id) => DEFAULT_UI_TEXT[id]),
);

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
  /** `TIME` (M3-01 — the caravan's clock, in player 2's place). */
  time: 23,
});

/**
 * The whole seconds the HUD shows of a World's caravan clock (M3-01): `ceil(timeLeft / 60)`, 0 at
 * the end. Never allocates.
 *
 * @param world - The World (its `timeLeft` ≥ 0).
 * @returns Seconds.
 */
export function hudClockSeconds(world: Readonly<Pick<World, 'timeLeft'>>): number {
  const left = world.timeLeft;
  return left > 0 ? ((left + 59) / 60) | 0 : 0;
}

/**
 * String slots a HUD list needs ({@link HUD_STRING_SLOTS}: the seven compact meter labels from 15,
 * then `BOSS` — M2-09 —, then `TIME` — M3-01).
 */
export const HUD_STRING_COUNT = 24;

/**
 * Commands a HUD list needs in the worst case (the co-op Direct-mode HUD: both halves with every
 * tier pip — and, since M2-09, the boss HP bar).
 */
export const HUD_COMMAND_COUNT = 100;

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
 * drawn them). Layout ({@link HUD_LAYOUT}, derived from the frame and the font — the numbers here
 * are the values at 384×216 with the 6×8 font): top bar `1P` at x 8, `HI` at 156, `2P` at 292, each
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
 * the lit ones in the family's {@link HUD_FAMILY_COLORS} colour; `SUB` at 134 (green pips); `ARM`
 * at 210 with one pip per hit the Arm can take (its tier's {@link HUD_ARM_COLORS} colour for the
 * hits left, dark for the spent ones; nothing without an Arm); `SPD` at 286 with one pip per
 * speed (the current level and those below lit); and the family's `label` at 350.
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
 *   while the World's `bosses.hpBar` is visible, `BOSS` (red) at x 132 and a 4-px frame
 *   {@link BOSS_HP_BAR_WIDTH} wide at x 160 with a 2-px red fill of {@link bossHpBarFill} over
 *   the frame's inner width replace the hi-score (the values at 384×216, as in the remarks).
 * @param text - The UI string table the HUD's words come from (default {@link DEFAULT_UI_TEXT} —
 *   M2-16).
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
  text: UiText = DEFAULT_UI_TEXT,
): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  list.clear();
  list.setString(S.p1, text.p1);
  list.setString(S.hi, text.hi);
  list.setString(S.p2, text.p2);
  list.setString(S.dashes, '------');
  list.rect(0, L.topY, FRAME_W, HUD_BAR_HEIGHT, HUD_COLORS.bar);
  list.rect(0, L.bottomY, FRAME_W, HUD_BAR_HEIGHT, HUD_COLORS.bar);
  const board = world.scoring.board;
  const players = world.players;
  const blinkOn = ((world.tick / HUD_PROMPT_BLINK_TICKS) & 1) === 0;
  const state1 = hudPlayerState(world, 0);
  const state2 = hudPlayerState(world, 1);
  topScore(list, board.scores[0].score, state1, S.p1, L.p1X, HUD_COLORS.p1, blinkOn, text);
  const bar = world.bosses.hpBar;
  if (bossHp && bar.visible) {
    // The boss HP bar (M2-09) replaces the hi-score during a boss fight.
    list.setString(S.boss, text.hudBoss);
    list.text(S.boss, L.bossX, L.topY, HUD_COLORS.bossLabel);
    list.rect(L.bossBarX, L.topY + HUD_ROW_DY, BOSS_HP_BAR_WIDTH, HUD_PIP_H, HUD_COLORS.bossFrame);
    const fill = bossHpBarFill(bar, BOSS_HP_BAR_WIDTH - 2);
    if (fill > 0) {
      list.rect(L.bossBarX + 1, L.topY + HUD_ROW_DY + 1, fill, HUD_PIP_H - 2, HUD_COLORS.bossFill);
    }
  } else {
    list.text(S.hi, L.hiX, L.topY, HUD_COLORS.hi);
    list.number(board.hiScore, L.hiX + HUD_SCORE_DX, L.topY, L.digits, HUD_COLORS.number);
  }
  if (world.timeLeft >= 0) {
    // The caravan's clock (M3-01) in player 2's place: whole seconds left, red for the last ten.
    const seconds = hudClockSeconds(world);
    list.setString(S.time, text.time);
    list.text(S.time, L.p2X, L.topY, HUD_COLORS.p2);
    // The seconds follow the label and the gap, like the scores (R2-01: v1 drew English's right
    // after `TIME`, with no gap).
    list.number(
      seconds,
      L.p2X + text.time.length * GLYPH_W + HUD_LABEL_GAP,
      L.topY,
      0,
      seconds <= 10 ? HUD_COLORS.bossLabel : HUD_COLORS.number,
    );
  } else {
    const score2 = board.scores.length > 1 ? board.scores[1].score : 0;
    topScore(list, score2, state2, S.p2, L.p2X, HUD_COLORS.p2, blinkOn, text);
  }

  if (players.length > 1 && players[0].active && players[1].active) {
    // Co-op (M2-06): each player's compact half.
    coopHalf(world, list, sprites, 0, state1, blinkOn, text);
    coopHalf(world, list, sprites, 1, state2, blinkOn, text);
    clearDirty(world);
    return;
  }

  const ship = players[0];
  const stock = ship.lives - 1;
  const iconY = L.bottomY + HUD_STOCK_DY;
  if (stock > L.stockIcons) {
    if (sprites.life >= 0) list.sprite(sprites.life, 0, L.stockX, iconY);
    else list.rect(L.stockX, iconY, HUD_STOCK_W, HUD_STOCK_H, HUD_COLORS.p1);
    list.number(stock, L.stockX + HUD_STOCK_COUNT_DX, L.bottomY, 0, HUD_COLORS.number);
  } else {
    for (let i = 0; i < stock; i++) {
      const x = L.stockX + i * HUD_STOCK_STEP;
      if (sprites.life >= 0) list.sprite(sprites.life, 0, x, iconY);
      else list.rect(x, iconY, HUD_STOCK_W, HUD_STOCK_H, HUD_COLORS.p1);
    }
  }

  if (world.powerups.direct) {
    buildDirectPips(world, list, text);
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
        HUD_SLOT_BOX_H,
        lit ? HUD_COLORS.slotLit : can ? HUD_COLORS.slotOn : HUD_COLORS.slotOff,
      );
    }
    if (sprites.meterLabels >= 0) {
      list.sprite(
        sprites.meterLabels,
        meterLabelFrame(world, slot),
        x + HUD_SLOT_LABEL_D,
        L.bottomY + HUD_SLOT_LABEL_D,
        0,
        can || lit ? HUD_COLORS.label : HUD_COLORS.labelDisabled,
      );
    }
  }

  const shield = ship.shield;
  if (shieldActive(shield)) {
    for (let i = 0; i < shield.maxHits && i < 5; i++) {
      list.rect(
        L.shieldX + i * HUD_SHIELD_PIP_STEP,
        L.bottomY + HUD_ROW_DY,
        HUD_SHIELD_PIP_W,
        HUD_PIP_H,
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
 * @param text - The UI string table.
 */
function topScore(
  list: DrawList,
  score: number,
  state: HudPlayerState,
  slot: number,
  x: number,
  color: number,
  blinkOn: boolean,
  text: UiText,
): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const absent = state === HudPlayerState.Absent || state === HudPlayerState.Join;
  list.text(slot, x, L.topY, absent ? HUD_COLORS.inactive : color);
  if (state === HudPlayerState.Join) {
    // Written only when a co-op HUD needs it (a one-player HUD list may have 4 string slots).
    list.setString(S.pressStart, text.pressStart);
    if (blinkOn) list.text(S.pressStart, x + HUD_SCORE_DX, L.topY, HUD_COLORS.prompt);
  } else if (state === HudPlayerState.Absent) {
    list.text(S.dashes, x + HUD_SCORE_DX, L.topY, HUD_COLORS.inactive);
  } else {
    list.number(score, x + HUD_SCORE_DX, L.topY, L.digits, HUD_COLORS.number);
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
 * @param text - The UI string table.
 */
function coopHalf(
  world: World,
  list: DrawList,
  sprites: UiSprites,
  slot: number,
  state: HudPlayerState,
  blinkOn: boolean,
  text: UiText,
): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const ox = slot * L.halfW;
  const y = L.bottomY;
  const centre = ox + (L.halfW >> 1);
  if (state === HudPlayerState.Continue) {
    list.setString(S.pressStart, text.pressStart);
    if (blinkOn) list.text(S.pressStart, centre, y, HUD_COLORS.prompt, TextAlign.Center);
    return;
  }
  if (state !== HudPlayerState.Playing) {
    list.setString(S.gameOver, text.gameOver);
    list.text(S.gameOver, centre, y, HUD_COLORS.over, TextAlign.Center);
    return;
  }
  const ship = world.players[slot];
  const life = slot === 1 && sprites.lifeP2 >= 0 ? sprites.lifeP2 : sprites.life;
  const stock = ship.lives > 0 ? ship.lives - 1 : 0;
  const iconX = ox + L.coopStockX;
  if (life >= 0) list.sprite(life, 0, iconX, y + HUD_STOCK_DY);
  else {
    const color = slot === 1 ? HUD_COLORS.p2 : HUD_COLORS.p1;
    list.rect(iconX, y + HUD_STOCK_DY, HUD_STOCK_W, HUD_STOCK_H, color);
  }
  list.number(stock, iconX + HUD_STOCK_STEP, y, 0, HUD_COLORS.number);
  if (world.powerups.direct) {
    coopDirectPips(world, list, slot, ox, text);
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
      HUD_SLOT_BOX_H,
      lit ? HUD_COLORS.slotLit : can ? HUD_COLORS.slotOn : HUD_COLORS.slotOff,
    );
    const label = S.meterShort + m;
    const id = METER_SHORT_IDS[meterLabelFrame(world, m)];
    list.setString(label, id === undefined ? '' : text[id]);
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
        ox + L.coopShieldX + i * HUD_COOP_SHIELD_PIP_STEP,
        y + HUD_ROW_DY,
        HUD_PIP_W,
        HUD_PIP_H,
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
 * @param width - Pip width (default `HUD_PIP_W`, 4; the co-op HUD's compact pips are
 *   `HUD_COOP_PIP_W`, 3).
 */
function drawPips(
  list: DrawList,
  x: number,
  step: number,
  count: number,
  lit: number,
  on: number,
  off: number,
  width = HUD_PIP_W,
): void {
  const y = HUD_LAYOUT.bottomY + HUD_ROW_DY;
  for (let i = 0; i < count; i++) list.rect(x + i * step, y, width, HUD_PIP_H, i < lit ? on : off);
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
 * @param text - The UI string table.
 */
function buildDirectPips(world: World, list: DrawList, text: UiText): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const y = L.bottomY;
  const loadout = world.weapons.loadouts[0];
  const ship = world.players[0];
  const families = world.weapons.mainFamilies;
  const index = familyIndex(world, 0);
  const family = families.length > 0 ? (families[index] ?? null) : null;
  list.setString(S.shot, text.hudShot);
  list.setString(S.sub, text.hudSub);
  list.setString(S.arm, text.hudArm);
  list.setString(S.speed, text.hudSpeed);
  list.text(S.shot, L.shotX, y, HUD_COLORS.pipLabel);
  const shotTop = directMaxLevel(family);
  const color = HUD_FAMILY_COLORS[index % HUD_FAMILY_COLORS.length] ?? HUD_COLORS.label;
  const step = HUD_LEVEL_PIP_STEP;
  drawPips(
    list,
    L.shotX + HUD_DIRECT_PIPS_DX,
    step,
    shotTop,
    loadout.shot,
    color,
    HUD_COLORS.pipOff,
  );
  list.text(S.sub, L.subX, y, HUD_COLORS.pipLabel);
  const subTop = directMaxLevel(world.weapons.subFamily);
  const subPipsX = L.subX + HUD_DIRECT_PIPS_DX;
  drawPips(list, subPipsX, step, subTop, loadout.sub, HUD_COLORS.subPip, HUD_COLORS.pipOff);
  list.text(S.arm, L.armX, y, HUD_COLORS.pipLabel);
  const shield = ship.shield;
  if (shieldActive(shield) && shield.kind === ShieldKind.Arm && shield.tier >= 1) {
    const tier = shield.tier > HUD_ARM_COLORS.length ? HUD_ARM_COLORS.length : shield.tier;
    const max = shield.maxHits > 5 ? 5 : shield.maxHits;
    const on = HUD_ARM_COLORS[tier - 1];
    const armPipsX = L.armX + HUD_DIRECT_PIPS_DX;
    drawPips(list, armPipsX, HUD_TIER_PIP_STEP, max, shield.hits, on, HUD_COLORS.pipOff);
  }
  list.text(S.speed, L.speedX, y, HUD_COLORS.pipLabel);
  const speeds = world.ship.speeds.length > 5 ? 5 : world.ship.speeds.length;
  drawPips(
    list,
    L.speedX + HUD_DIRECT_PIPS_DX,
    HUD_TIER_PIP_STEP,
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
 * @param text - The UI string table.
 */
function coopDirectPips(
  world: World,
  list: DrawList,
  slot: number,
  ox: number,
  text: UiText,
): void {
  const L = HUD_LAYOUT;
  const S = HUD_STRING_SLOTS;
  const y = L.bottomY;
  const loadout = world.weapons.loadouts[slot];
  const ship = world.players[slot];
  const families = world.weapons.mainFamilies;
  const index = familyIndex(world, slot);
  const family = families.length > 0 ? (families[index] ?? null) : null;
  list.setString(S.shortShot, text.hudShortShot);
  list.setString(S.shortSub, text.hudShortSub);
  list.setString(S.shortArm, text.hudShortArm);
  list.setString(S.shortSpeed, text.hudShortSpeed);
  const color = HUD_FAMILY_COLORS[index % HUD_FAMILY_COLORS.length] ?? HUD_COLORS.label;
  list.text(S.shortShot, ox + L.coopShotX, y, HUD_COLORS.pipLabel);
  const shotTop = directMaxLevel(family);
  drawPips(
    list,
    ox + L.coopShotX + HUD_COOP_PIPS_DX,
    HUD_COOP_PIP_STEP,
    shotTop,
    loadout.shot,
    color,
    HUD_COLORS.pipOff,
    HUD_COOP_PIP_W,
  );
  list.text(S.shortSub, ox + L.coopSubX, y, HUD_COLORS.pipLabel);
  const subTop = directMaxLevel(world.weapons.subFamily);
  drawPips(
    list,
    ox + L.coopSubX + HUD_COOP_PIPS_DX,
    HUD_COOP_PIP_STEP,
    subTop,
    loadout.sub,
    HUD_COLORS.subPip,
    HUD_COLORS.pipOff,
    HUD_COOP_PIP_W,
  );
  list.text(S.shortArm, ox + L.coopArmX, y, HUD_COLORS.pipLabel);
  const shield = ship.shield;
  if (shieldActive(shield) && shield.kind === ShieldKind.Arm && shield.tier >= 1) {
    const tier = shield.tier > HUD_ARM_COLORS.length ? HUD_ARM_COLORS.length : shield.tier;
    const max = shield.maxHits > 5 ? 5 : shield.maxHits;
    const on = HUD_ARM_COLORS[tier - 1];
    drawPips(
      list,
      ox + L.coopArmX + HUD_COOP_PIPS_DX,
      HUD_COOP_PIP_STEP,
      max,
      shield.hits,
      on,
      HUD_COLORS.pipOff,
      HUD_COOP_PIP_W,
    );
  }
  list.text(S.shortSpeed, ox + L.coopSpeedX, y, HUD_COLORS.pipLabel);
  const speeds = world.ship.speeds.length > 5 ? 5 : world.ship.speeds.length;
  const lit = ship.speedLevel + 1;
  drawPips(
    list,
    ox + L.coopSpeedX + HUD_COOP_PIPS_DX,
    HUD_COOP_PIP_STEP,
    speeds,
    lit,
    HUD_COLORS.speedPip,
    HUD_COLORS.pipOff,
    HUD_COOP_PIP_W,
  );
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
  /** The UI string table the HUD's words come from (M2-16). */
  readonly text: UiText;
  /** How many times the list was rebuilt (tests, debug overlays). */
  builds = 0;
  /**
   * Draw the boss HP bar (M2-09 — the `bossHpBar` display option; the scene flow sets it from the
   * save before every update). Default `false`.
   */
  showBossHp = false;
  /** The World of the last build (a different one rebuilds). */
  private world: World | null = null;
  /** The draw list of the last build (a different one rebuilds). */
  private list: DrawList | null = null;
  /** The last build's highlight flash phase (-1 = none yet). */
  private flash = -1;
  /** The last build's `PRESS START` blink phase (-1 = none yet). */
  private blink = -1;
  /**
   * The last build's boss HP bar fill in pixels (-1 = not drawn — the option is off or no boss is
   * counted), so a hit that takes a pixel off the bar rebuilds the HUD and one that does not
   * leaves it alone.
   */
  private barFill = -1;
  /** The last build's caravan clock in whole seconds (-1 = no clock — M3-01). */
  private clock = -1;
  /** The last build's per-player values ({@link HUD_PLAYER_FIELDS} per player). */
  private readonly shown = new Int32Array(2 * HUD_PLAYER_FIELDS);
  /** This update's per-player values (compared with {@link Hud.shown}). */
  private readonly next = new Int32Array(2 * HUD_PLAYER_FIELDS);

  /**
   * Creates the HUD (use {@link createHud}).
   *
   * @param sprites - UI sprite ids.
   * @param text - The UI string table.
   */
  constructor(sprites: UiSprites, text: UiText) {
    this.sprites = sprites;
    this.text = text;
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
    const clock = world.timeLeft >= 0 ? hudClockSeconds(world) : -1;
    let dirty =
      world !== this.world ||
      list !== this.list ||
      board.scores[0].displayDirty ||
      (board.scores.length > 1 && board.scores[1].displayDirty) ||
      board.hiScoreDirty ||
      flash !== this.flash ||
      blink !== this.blink ||
      barFill !== this.barFill ||
      clock !== this.clock;
    const shown = this.shown;
    for (let i = 0; !dirty && i < next.length; i++) if (next[i] !== shown[i]) dirty = true;
    if (!dirty) return false;
    shown.set(next);
    this.world = world;
    this.list = list;
    this.flash = flash;
    this.blink = blink;
    this.barFill = barFill;
    this.clock = clock;
    this.builds++;
    buildHud(world, list, this.sprites, this.showBossHp, this.text);
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
 * @param text - The UI string table (default {@link DEFAULT_UI_TEXT}; M2-16).
 * @returns The HUD.
 *
 * @example
 * ```ts
 * const hud = createHud(resolveUiSprites(game.content));
 * // every displayed frame:
 * hud.update(game.world, hudList); // rebuilds only on a change
 * ```
 */
export function createHud(sprites: UiSprites = NO_SPRITES, text: UiText = DEFAULT_UI_TEXT): Hud {
  return new Hud(sprites, text);
}
