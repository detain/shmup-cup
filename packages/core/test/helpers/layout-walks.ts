/**
 * The layout walks of `test/ui/ui-layout-frame.test.ts` (plan_resolution.md R2-01, lane U):
 * scripted sessions of the scene flow on the **shipped content** that show every scene — the front
 * end, a game with its selects, pause, continue, game over, name entry, the tables and a replay
 * played back, the attract loop, a single stage's STAGE CLEAR, a campaign run through the zone
 * tallies and the map to the ending and the credits, co-op and Direct-mode HUDs and the EXTRA
 * modes — in a given UI language, and check **every frame** core hands a renderer:
 *
 * - every text box (`length · GLYPH_W` wide, `GLYPH_H` tall; a `\n` adds a line) lies inside the
 *   frame (the credits' rows scroll through the top and bottom edges: only their x is checked);
 * - no two visible text boxes of the UI list overlap, nor two of the HUD list (a text an opaque
 *   panel drawn later covers — the scene under an overlay — is not visible);
 * - no visible text of the UI list overlaps a visible text of the HUD list, which the renderer
 *   draws under it (a HUD text under a UI panel is covered, not visible);
 * - a text whose anchor (its alignment point) lies inside a panel (`drawPanel`'s fill and its four
 *   1-px borders) drawn before it ends inside that panel.
 *
 * The walks read the frame and font constants through `core/config` like the code under test, so a
 * test file that mocks them walks that frame's layout. Their scripts follow
 * the presentation fingerprint's walks (`test/integration/presentation-fingerprint.test.ts`), with
 * god mode on so a script never meets an unplanned death.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import {
  Action,
  CaptureStatus,
  ControlsItem,
  DisplayItem,
  DrawOp,
  ENDING_LOCK_TICKS,
  ENGINE_SPRITES,
  ExtraItem,
  FRAME_H,
  FRAME_W,
  GLYPH_H,
  GLYPH_W,
  GameOptionsItem,
  GraphicsItem,
  KNOWN_SCRIPT_IDS,
  LINE_H,
  OptionsItem,
  PauseItem,
  RebindStatus,
  ReplayActionItem,
  SECRET_CODES,
  SecretCode,
  TextAlign,
  TitleItem,
  WeaponSelectItem,
  addScore,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  createMemoryStorage,
  createReplayLibrary,
  createSaveStore,
  loadContent,
  type ActionMask,
  type ActionName,
  type ContentDb,
  type ContentFile,
  type ControlsSetup,
  type DrawList,
  type Game,
  type GameConfig,
  type InputContext,
  type ListMenu,
  type RebindDevice,
  type RebindOutcome,
  type SaveStore,
  type SceneFlow,
  type SceneId,
} from '../../src/index.js';

/** The repository's `content/` folder. */
const CONTENT_DIR = fileURLToPath(new URL('../../../../content/', import.meta.url));

/**
 * Every shipped content file (the examples left out), as the hosts load them.
 *
 * @returns The files, sorted by path.
 */
function contentFiles(): ContentFile[] {
  const files: ContentFile[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else if (entry.name.endsWith('.json') && !entry.name.startsWith('example.')) {
        files.push({ path, data: JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) });
      }
    }
  };
  walk(CONTENT_DIR, '');
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

let shipped: ContentDb | null = null;

/**
 * The shipped content, loaded once per test file (its module registry: a file that mocks the frame
 * constants loads it under them).
 *
 * @returns The content DB.
 */
export function shippedDb(): ContentDb {
  if (shipped !== null) return shipped;
  const { db, issues } = loadContent(contentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  shipped = db;
  return db;
}

/** One text command's box in frame pixels. */
interface TextBox {
  /** Its words (for the failure message). */
  readonly text: string;
  /** Its alignment point. */
  readonly ax: number;
  readonly ay: number;
  /** Its box: left, right (exclusive), top, bottom (exclusive). */
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  /** Covered by a panel drawn after it. */
  hidden: boolean;
}

/** A `drawPanel` rectangle found in a draw list. */
interface PanelBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The fill's command index. */
  readonly at: number;
}

/**
 * Whether the commands from `i` are a `drawPanel`: the fill, then its top, bottom, left and right
 * 1-px borders.
 *
 * @param l - The list.
 * @param i - The fill's index.
 * @returns The panel, or `null`.
 */
function panelAt(l: DrawList, i: number): PanelBox | null {
  if (i + 4 >= l.count) return null;
  for (let k = 0; k <= 4; k++) if (l.op[i + k] !== DrawOp.Rect) return null;
  const x = l.x[i];
  const y = l.y[i];
  const w = l.w[i];
  const h = l.h[i];
  const is = (k: number, bx: number, by: number, bw: number, bh: number): boolean =>
    l.x[i + k] === bx && l.y[i + k] === by && l.w[i + k] === bw && l.h[i + k] === bh;
  if (!is(1, x, y, w, 1) || !is(2, x, y + h - 1, w, 1)) return null;
  if (!is(3, x, y + 1, 1, h - 2) || !is(4, x + w - 1, y + 1, 1, h - 2)) return null;
  return { x, y, w, h, at: i };
}

/**
 * The box a text or number command draws (the renderer's alignment: `round(x − w / 2)` centred,
 * `round(x − w)` right-aligned).
 *
 * @param l - The list.
 * @param i - The command's index.
 * @returns Its box.
 */
function textBox(l: DrawList, i: number): TextBox {
  let text: string;
  if (l.op[i] === DrawOp.Text) text = l.strings[l.ref[i]] ?? '';
  else {
    const digits = String(Math.abs(Math.trunc(l.value[i])));
    text = (l.value[i] < 0 ? '-' : '') + digits.padStart(l.frame[i], '0');
  }
  const lines = text.split('\n');
  let longest = 0;
  for (const line of lines) longest = Math.max(longest, line.length);
  const w = longest * GLYPH_W;
  const h = (lines.length - 1) * LINE_H + GLYPH_H;
  const align = l.flags[i];
  const ax = l.x[i];
  const x0 =
    align === TextAlign.Center
      ? Math.round(ax - w / 2)
      : align === TextAlign.Right
        ? Math.round(ax - w)
        : ax;
  return { text, ax, ay: l.y[i], x0, x1: x0 + w, y0: l.y[i], y1: l.y[i] + h, hidden: false };
}

/** One layout problem of a frame. */
export interface LayoutProblem {
  /** What it is: a text leaving the frame, leaving its panel, or overlapping another. */
  readonly kind: 'frame' | 'panel' | 'overlap';
  /** Where: the top scene (`<scene> HUD` for the HUD list). */
  readonly where: string;
  /** The text's words. */
  readonly text: string;
  /** The other text's words (an overlap; `''` otherwise). */
  readonly other: string;
  /** The whole story, boxes included. */
  readonly message: string;
}

/** What one draw list draws, as boxes. */
interface ListBoxes {
  /** Its text and number commands, in drawing order (`hidden` once a later panel covers one). */
  readonly texts: TextBox[];
  /** Per text: the latest panel drawn before it that holds its anchor, or `null`. */
  readonly owner: Array<PanelBox | null>;
  /** Its `drawPanel` rectangles, in drawing order. */
  readonly panels: PanelBox[];
}

/**
 * Whether two boxes share a pixel.
 *
 * @param a - A text's box.
 * @param b - Another text's box.
 * @returns `true` when they overlap.
 */
function overlaps(a: TextBox, b: TextBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Whether a panel covers part of a text.
 *
 * @param panel - The panel.
 * @param t - The text's box.
 * @returns `true` when they overlap.
 */
function covers(panel: PanelBox, t: TextBox): boolean {
  return t.x0 < panel.x + panel.w && panel.x < t.x1 && t.y0 < panel.y + panel.h && panel.y < t.y1;
}

/**
 * Whether a text is visible: not covered by a panel drawn after it, and not blank.
 *
 * @param t - The text's box.
 * @returns `true` when it shows.
 */
function visible(t: TextBox): boolean {
  return !t.hidden && t.text.trim() !== '';
}

/**
 * The boxes of one draw list's texts and panels.
 *
 * @param list - The list.
 * @returns Them.
 */
function boxesOf(list: DrawList): ListBoxes {
  const texts: TextBox[] = [];
  const owner: Array<PanelBox | null> = [];
  const panels: PanelBox[] = [];
  for (let i = 0; i < list.count; i++) {
    const op = list.op[i];
    if (op === DrawOp.Rect) {
      const panel = panelAt(list, i);
      if (panel === null) continue;
      // A panel covers what was drawn under it (the scene below an overlay).
      for (const t of texts) if (covers(panel, t)) t.hidden = true;
      panels.push(panel);
      i += 4;
    } else if (op === DrawOp.Text || op === DrawOp.Number) {
      const t = textBox(list, i);
      texts.push(t);
      // The latest panel the text's anchor lies in is the one it must fit.
      let home: PanelBox | null = null;
      for (let k = panels.length - 1; k >= 0 && home === null; k--) {
        const p = panels[k];
        if (t.ax >= p.x && t.ax < p.x + p.w && t.ay >= p.y && t.ay < p.y + p.h) home = p;
      }
      owner.push(home);
    }
  }
  return { texts, owner, panels };
}

/**
 * A text's place in a message.
 *
 * @param where - What it shows.
 * @param t - The text's box.
 * @returns `<where>: "<text>" x0..x1 × y0..y1`.
 */
function placeOf(where: string, t: TextBox): string {
  return `${where}: "${t.text}" ${t.x0}..${t.x1} × ${t.y0}..${t.y1}`;
}

/**
 * The layout problems of one draw list: a text leaving the frame or its panel, two visible texts
 * overlapping.
 *
 * @param boxes - The list's boxes.
 * @param where - What it shows (the top scene; the HUD), for the messages.
 * @param clipY - The texts may scroll through the top and bottom edges (the credits).
 * @returns One entry per problem.
 */
function boxProblems(boxes: ListBoxes, where: string, clipY: boolean): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  const { texts, owner } = boxes;
  const at = (t: TextBox): string => placeOf(where, t);
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (t.text.trim() === '') continue;
    if (t.x0 < 0 || t.x1 > FRAME_W || (!clipY && (t.y0 < 0 || t.y1 > FRAME_H))) {
      const message = `${at(t)} leaves the ${FRAME_W}×${FRAME_H} frame`;
      out.push({ kind: 'frame', where, text: t.text, other: '', message });
    }
    const p = owner[i];
    if (p !== null && !t.hidden) {
      if (t.x0 < p.x || t.x1 > p.x + p.w || t.y0 < p.y || t.y1 > p.y + p.h) {
        const message = `${at(t)} leaves its panel ${p.x}..${p.x + p.w} × ${p.y}..${p.y + p.h}`;
        out.push({ kind: 'panel', where, text: t.text, other: '', message });
      }
    }
  }
  const shown = texts.filter(visible);
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i];
      const b = shown[j];
      if (overlaps(a, b)) {
        const message = `${at(a)} overlaps "${b.text}" ${b.x0}..${b.x1} × ${b.y0}..${b.y1}`;
        out.push({ kind: 'overlap', where, text: a.text, other: b.text, message });
      }
    }
  }
  return out;
}

/**
 * The UI list's visible texts that overlap the HUD list's (the renderer draws the UI over the
 * HUD): a HUD text that a UI panel covers — the pause menu's, an overlay's — is not visible, so
 * it is skipped.
 *
 * @param ui - The UI list's boxes.
 * @param hud - The HUD list's boxes.
 * @param where - The top scene, for the messages (`<scene> UI/HUD`).
 * @returns One overlap per pair.
 */
function crossProblems(ui: ListBoxes, hud: ListBoxes, where: string): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  const hudShown = hud.texts.filter((t) => visible(t) && !ui.panels.some((p) => covers(p, t)));
  if (hudShown.length === 0) return out;
  for (const a of ui.texts) {
    if (!visible(a)) continue;
    for (const b of hudShown) {
      if (!overlaps(a, b)) continue;
      const other = `"${b.text}" ${b.x0}..${b.x1} × ${b.y0}..${b.y1}`;
      const message = `${placeOf(where, a)} overlaps the HUD's ${other}`;
      out.push({ kind: 'overlap', where, text: a.text, other: b.text, message });
    }
  }
  return out;
}

/**
 * The layout problems of one frame: its UI list (the credits' rows may scroll through the top and
 * bottom edges), its HUD list, and the UI's texts over the HUD's.
 *
 * @param ui - The frame's UI list.
 * @param hud - The frame's HUD list.
 * @param top - The top scene's id.
 * @returns One entry per problem.
 */
export function frameProblems(ui: DrawList, hud: DrawList, top: string): LayoutProblem[] {
  const uiBoxes = boxesOf(ui);
  const hudBoxes = boxesOf(hud);
  return [
    ...boxProblems(uiBoxes, top, top === 'credits'),
    ...boxProblems(hudBoxes, `${top} HUD`, false),
    ...crossProblems(uiBoxes, hudBoxes, `${top} UI/HUD`),
  ];
}

/** Two keyboard profiles for the CONTROLS page's PROFILE row. */
const PROFILES = [
  { id: 'keyboard-default', label: 'KEYBOARD (DEFAULT)' },
  { id: 'keyboard-remote-emulation', label: 'KEYBOARD AS REMOTE' },
];

/** A fixed host side of the rebind screen (a keyboard and a gamepad; every bind succeeds). */
class FixedControls implements ControlsSetup {
  /** The capture's state (the walk moves it on). */
  status: number = CaptureStatus.Idle;

  devices(): readonly RebindDevice[] {
    return [
      { id: 'keyboard-default', kind: 'keyboard' },
      { id: 'gamepad-standard', kind: 'gamepad' },
    ];
  }
  keysLabel(_device: number, _context: InputContext, action: ActionName): string {
    return action.toUpperCase();
  }
  beginCapture(_device: number): void {
    this.status = CaptureStatus.Waiting;
  }
  pollCapture(): number {
    return this.status;
  }
  endCapture(): void {
    this.status = CaptureStatus.Idle;
  }
  bindCaptured(_device: number, _context: InputContext, _action: ActionName): RebindOutcome {
    return { status: RebindStatus.Bound, other: null };
  }
  reset(_device: number, _context: InputContext): void {
    // Every bind succeeds and nothing is remembered: nothing to reset.
  }
}

/** Options of a {@link LayoutWalk}. */
interface LayoutWalkOptions {
  /** The UI language (`en`, `es`, `ja`). */
  readonly language: string;
  /** Config overrides of the host. */
  readonly config?: Partial<GameConfig>;
  /** Where the flow starts (default the boot scene). */
  readonly start?: 'boot' | 'title' | 'game';
  /** Give the platform an exit (the TV): EXIT on the title, the exit confirmation. */
  readonly canExit?: boolean;
  /** Unlock the EXTRA modes' rewards in the save first. */
  readonly unlocks?: boolean;
}

/**
 * One scripted session on the shipped content: input helpers that compose a frame after every tick
 * and check its UI and HUD lists ({@link frameProblems}).
 */
export class LayoutWalk {
  readonly platform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly save: SaveStore;
  readonly controls = new FixedControls();
  /** Every problem found, by its message (each once). */
  readonly problems = new Map<string, LayoutProblem>();
  /** Every scene id seen on top of the stack. */
  readonly seen = new Set<string>();

  /**
   * Creates the session.
   *
   * @param db - The content.
   * @param options - Language, config, start, exit, unlocks.
   */
  constructor(db: ContentDb, options: LayoutWalkOptions) {
    if (options.canExit === true) {
      (this.platform as { exit: (() => void) | null }).exit = () => undefined;
    }
    const save = createSaveStore(null);
    save.setOptions({
      ...save.options,
      display: { ...save.options.display, language: options.language },
    });
    if (options.unlocks === true) {
      save.unlock('extraEdit');
      save.unlock('loop2');
    }
    this.save = save;
    this.game = createGame(
      this.platform,
      {
        stage: 'zone-a',
        seed: 0x5eed,
        // The recordings this session makes carry the frame they were made at.
        internalWidth: FRAME_W,
        internalHeight: FRAME_H,
        ...options.config,
      },
      db,
      {
        scenes: options.start ?? 'boot',
        save,
        inputProfiles: { choices: PROFILES, active: 'keyboard-default' },
        soundTest: { music: ['TITLE', 'ZONE A', 'BOSS', 'ENDING'] },
        controls: this.controls,
        replays: createReplayLibrary(createMemoryStorage()),
        shareReplay: () => true,
      },
    );
    this.flow = this.game.scenes as SceneFlow;
    this.game.debug.godMode = true;
    expect(this.flow.language).toBe(options.language);
  }

  /** The top scene's id. */
  get top(): string {
    return this.flow.stack.top?.id ?? '';
  }

  /**
   * Runs ticks with masks held, checking the frame after each.
   *
   * @param held - Player 1's held actions.
   * @param ticks - Ticks.
   * @param held2 - Player 2's held actions.
   */
  hold(held: ActionMask, ticks = 1, held2: ActionMask = 0): void {
    const players = this.platform.snapshot.players;
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(players[0], held);
      for (let p = 1; p < players.length; p++) commitPlayerInput(players[p], p === 1 ? held2 : 0);
      this.game.step();
      this.game.events.drain(() => undefined);
      const frame = this.game.renderFrame();
      const top = this.top;
      this.seen.add(top);
      for (const problem of frameProblems(frame.ui, frame.hud, top)) {
        this.problems.set(problem.message, problem);
      }
    }
  }

  /**
   * A press: a tick down, a tick up.
   *
   * @param action - The action(s).
   * @param action2 - Player 2's action(s).
   */
  press(action: ActionMask, action2: ActionMask = 0): void {
    this.hold(action, 1, action2);
    this.hold(0);
  }

  /**
   * Presses after the 2-tick lock of a menu that just opened.
   *
   * @param actions - The presses.
   */
  presses(...actions: ActionMask[]): void {
    this.hold(0, 2);
    for (const action of actions) this.press(action);
  }

  /**
   * Moves a menu's focus with Down presses until it is on an item.
   *
   * @param menu - The menu.
   * @param item - The item.
   */
  focus(menu: ListMenu, item: number): void {
    for (let i = 0; i < 40 && menu.focus !== item; i++) this.press(Action.Down);
    expect(menu.focus).toBe(item);
  }

  /**
   * Walks a menu: Down through every item and back up to where it was.
   *
   * @param menu - The menu.
   */
  walk(menu: ListMenu): void {
    const from = menu.focus;
    for (let i = 0; i < menu.items.length; i++) this.press(Action.Down);
    for (let i = 0; i < menu.items.length && menu.focus !== from; i++) this.press(Action.Up);
  }

  /**
   * Expects the top scene.
   *
   * @param id - Its id.
   */
  at(id: string): void {
    expect(this.top).toBe(id);
  }

  /**
   * From the title's `PRESS OK`: a title item is chosen.
   *
   * @param item - A `TitleItem`.
   */
  title(item: number): void {
    this.at('title');
    this.press(Action.Confirm);
    this.hold(0, 2);
    this.focus(this.flow.title.menu, item);
    this.press(Action.Confirm);
  }

  /**
   * From the difficulty menu: NORMAL, the ship, and — for the meter ship — the weapon select's
   * START: the game starts.
   *
   * @param ship - The ship select's row (0 KESTREL, 1 MANTA).
   */
  launch(ship = 0): void {
    this.at('difficulty');
    this.presses(Action.Confirm);
    this.at('shipSelect');
    this.hold(0, 2);
    this.focus(this.flow.shipSelect.menu, ship);
    this.press(Action.Confirm);
    if (this.top === 'weaponSelect') this.presses(Action.Confirm);
    this.hold(0);
    this.at('game');
  }

  /** In a game: the pause menu, QUIT TO TITLE, YES. */
  quit(): void {
    this.at('game');
    this.press(Action.Pause);
    this.hold(0, 2);
    this.focus(this.flow.pause.menu, PauseItem.Quit);
    this.press(Action.Confirm);
    this.at('confirm');
    this.presses(Action.Left, Action.Confirm);
    this.hold(0, 2);
    this.at('title');
  }

  /**
   * Plays for a while: shooting, weaving, a power-up press now and then.
   *
   * @param ticks - About this many ticks (a multiple of 40).
   */
  play(ticks: number): void {
    const moves = [Action.Up, Action.Right, Action.Down, Action.Left];
    for (let i = 0; i < ticks / 40; i++) {
      this.hold(Action.Shot | moves[i & 3], 30);
      this.press(Action.Shot | Action.PowerUp);
      this.hold(Action.Shot, 8);
    }
  }

  /** On the name entry: a name, END, then the result table. */
  name(): void {
    this.at('nameEntry');
    this.hold(0, 2);
    const keys = [Action.Right, Action.Up, Action.Up, Action.Up, Action.Right];
    for (let i = 0; i < 5; i++) keys.push(Action.Up);
    keys.push(Action.Right);
    for (const key of keys) this.press(key);
    this.hold(0, 20);
    this.press(Action.Confirm);
    this.at('hiScore');
  }

  /**
   * In a campaign zone: clears it, then the zone result tally (OK after a while).
   */
  zoneClear(): void {
    this.at('game');
    addScore(this.game.world, 0, 2_500);
    this.game.world.status = 'stageClear';
    for (let i = 0; i < 200 && this.top !== 'stageClear'; i++) this.hold(0);
    this.at('stageClear');
    this.hold(0, 120);
    this.press(Action.Confirm);
    this.hold(0, 2);
  }

  /**
   * On the zone map: the upper (`down` false) or the lower exit, then the launch into its zone.
   *
   * @param down - The lower exit.
   */
  toZone(down: boolean): void {
    this.at('map');
    this.hold(0, 30);
    this.press(Action.Down);
    this.press(Action.Up);
    if (down) this.press(Action.Down);
    this.hold(0, 20);
    this.press(Action.Confirm);
    for (let i = 0; i < 200 && this.top === 'map'; i++) this.hold(0);
    this.at('game');
  }
}

/**
 * The front end: boot, title, the exit confirmation, Options and its pages, the rebind screen with
 * a capture, the input test, the sound test, practice, EXTRA and the empty replay browser.
 *
 * @param w - A walk started on the boot scene, with an exit.
 */
function frontEnd(w: LayoutWalk): void {
  const flow = w.flow;
  w.hold(0, 4);
  flow.setBootProgress(0.4, 'ATLAS');
  w.hold(0, 4);
  flow.finishBoot();
  w.hold(0, 80);
  w.at('title');
  w.press(Action.Back);
  w.at('confirm');
  w.presses(Action.Left, Action.Right, Action.Left);
  w.press(Action.Back);
  w.hold(0, 4);
  w.press(Action.Confirm);
  w.hold(0, 2);
  w.walk(flow.title.menu);
  w.focus(flow.title.menu, TitleItem.Options);
  w.press(Action.Confirm);
  w.at('options');
  w.hold(0, 2);
  w.walk(flow.options.menu);
  w.focus(flow.options.menu, OptionsItem.Controls);
  w.press(Action.Confirm);
  w.at('controls');
  w.hold(0, 2);
  w.walk(flow.controlsPage.menu);
  w.focus(flow.controlsPage.menu, ControlsItem.Keys);
  w.press(Action.Confirm);
  w.at('rebind');
  w.hold(0, 4);
  w.press(Action.Down);
  w.press(Action.Down);
  w.press(Action.Confirm);
  w.hold(0, 40);
  w.controls.status = CaptureStatus.Captured;
  w.hold(0, 20);
  w.press(Action.Down);
  w.press(Action.Confirm);
  w.hold(0, 30);
  w.controls.status = CaptureStatus.Cancelled;
  w.hold(0, 20);
  w.press(Action.Back);
  w.hold(0, 4);
  w.at('controls');
  w.focus(flow.controlsPage.menu, ControlsItem.InputTest);
  w.press(Action.Confirm);
  w.at('inputTest');
  w.hold(Action.Up | Action.Shot, 20);
  w.hold(Action.Left | Action.Sub, 20);
  w.press(Action.Pause);
  w.press(Action.Pause);
  w.press(Action.Pause);
  w.hold(0, 4);
  w.at('controls');
  w.focus(flow.controlsPage.menu, ControlsItem.Back);
  w.press(Action.Confirm);
  w.at('options');
  for (const [item, menu] of [
    [OptionsItem.Display, (): ListMenu => flow.displayPage.menu],
    [OptionsItem.Graphics, (): ListMenu => flow.graphicsPage.menu],
    [OptionsItem.Game, (): ListMenu => flow.gameOptionsPage.menu],
    [OptionsItem.Extras, (): ListMenu => flow.extrasPage.menu],
  ] as const) {
    w.focus(flow.options.menu, item);
    w.press(Action.Confirm);
    w.hold(0, 2);
    w.walk(menu());
    w.press(Action.Back);
    w.hold(0, 2);
    w.at('options');
  }
  // The DISPLAY page's longest choices.
  w.focus(flow.options.menu, OptionsItem.Display);
  w.press(Action.Confirm);
  w.hold(0, 2);
  for (const item of [DisplayItem.Bullets, DisplayItem.Scale]) {
    w.focus(flow.displayPage.menu, item);
    w.press(Action.Right);
  }
  w.press(Action.Back);
  w.hold(0, 2);
  // The GRAPHICS page (R6-04): all four choices stepped — the two boot knobs included.
  w.focus(flow.options.menu, OptionsItem.Graphics);
  w.press(Action.Confirm);
  w.hold(0, 2);
  for (const item of [
    GraphicsItem.Output,
    GraphicsItem.Renderer,
    GraphicsItem.Crt,
    GraphicsItem.Aspect,
  ]) {
    w.focus(flow.graphicsPage.menu, item);
    w.press(Action.Right);
  }
  w.press(Action.Back);
  w.hold(0, 2);
  w.focus(flow.options.menu, OptionsItem.Game);
  w.press(Action.Confirm);
  w.hold(0, 2);
  w.focus(flow.gameOptionsPage.menu, GameOptionsItem.Lives);
  w.press(Action.Right);
  w.press(Action.Back);
  w.hold(0, 2);
  w.press(Action.Back);
  w.hold(0, 4);
  w.at('title');
  w.focus(flow.title.menu, TitleItem.SoundTest);
  w.press(Action.Confirm);
  w.at('soundTest');
  w.presses(Action.Right, Action.Right, Action.Confirm, Action.Down, Action.Right, Action.Right);
  w.press(Action.Confirm);
  w.press(Action.Back);
  w.hold(0, 4);
  w.at('title');
  w.focus(flow.title.menu, TitleItem.Practice);
  w.press(Action.Confirm);
  w.at('practice');
  w.presses(Action.Right, Action.Right, Action.Down, Action.Right, Action.Down, Action.Right);
  w.hold(0, 4);
  w.press(Action.Back);
  w.hold(0, 4);
  w.focus(flow.title.menu, TitleItem.Extra);
  w.press(Action.Confirm);
  w.at('extra');
  w.hold(0, 2);
  w.walk(flow.extra.menu);
  w.focus(flow.extra.menu, ExtraItem.Replays);
  w.press(Action.Confirm);
  w.at('replays');
  w.hold(0, 4);
  w.press(Action.Down);
  w.press(Action.Back);
  w.hold(0, 4);
  w.press(Action.Back);
  w.hold(0, 4);
  w.at('title');
  w.focus(flow.title.menu, TitleItem.Help);
  w.press(Action.Confirm);
  w.at('about');
  w.hold(0, 2);
  w.presses(Action.Right, Action.Right, Action.Right, Action.Right, Action.Right);
  w.hold(0, 2);
  w.press(Action.Back);
  w.hold(0, 4);
  w.at('title');
}

/**
 * A game: the selects (the order editor too), the zone card and the HUD, the pause menu and its
 * Options, QUIT's confirmation, the continue countdown, game over, the name entry, the result
 * table, the replay browser with the last game and its playback.
 *
 * @param w - A walk started on the title, with an exit.
 */
function aGame(w: LayoutWalk): void {
  const flow = w.flow;
  w.hold(0, 2);
  w.title(TitleItem.Start);
  w.at('difficulty');
  w.hold(0, 2);
  w.walk(flow.difficultyMenu.menu);
  w.press(Action.Confirm);
  w.at('shipSelect');
  w.presses(Action.Down, Action.Down, Action.Up);
  w.focus(flow.shipSelect.menu, 0);
  w.press(Action.Confirm);
  w.at('weaponSelect');
  w.hold(0, 60);
  w.walk(flow.weaponSelect.menu);
  w.focus(flow.weaponSelect.menu, WeaponSelectItem.Type);
  w.press(Action.Right);
  w.focus(flow.weaponSelect.menu, WeaponSelectItem.Order);
  w.press(Action.Confirm);
  w.at('autoOrder');
  w.hold(0, 2);
  w.walk(flow.autoOrder.menu);
  w.press(Action.Back);
  w.hold(0, 4);
  w.focus(flow.weaponSelect.menu, WeaponSelectItem.Start);
  w.press(Action.Confirm);
  w.hold(Action.Shot, 160);
  w.at('game');
  w.play(200);
  w.press(Action.Pause);
  w.at('pause');
  w.hold(0, 2);
  w.walk(flow.pause.menu);
  w.focus(flow.pause.menu, PauseItem.Options);
  w.press(Action.Confirm);
  w.at('options');
  w.press(Action.Back);
  w.hold(0, 2);
  w.focus(flow.pause.menu, PauseItem.Quit);
  w.press(Action.Confirm);
  w.at('confirm');
  w.presses(Action.Right, Action.Confirm);
  w.hold(0, 2);
  w.at('pause');
  for (const direction of SECRET_CODES[SecretCode.FullPower]) w.press(direction);
  w.at('game');
  w.play(80);
  addScore(w.game.world, 0, 12_340);
  w.game.world.status = 'gameOver';
  w.hold(0, 30);
  w.at('continue');
  w.hold(0, 200);
  w.press(Action.Confirm);
  w.at('game');
  w.play(40);
  w.game.world.status = 'gameOver';
  w.hold(0, 30);
  w.at('continue');
  w.hold(0, 40);
  w.press(Action.Back);
  w.at('gameOver');
  w.hold(0, 100);
  w.press(Action.Confirm);
  w.name();
  w.hold(0, 90);
  w.press(Action.Confirm);
  w.hold(0, 2);
  w.at('title');
  w.title(TitleItem.Extra);
  w.at('extra');
  w.hold(0, 2);
  w.focus(flow.extra.menu, ExtraItem.Replays);
  w.press(Action.Confirm);
  w.at('replays');
  w.presses(Action.Confirm);
  w.hold(0, 2);
  w.walk(flow.replaysScreen.actions);
  w.focus(flow.replaysScreen.actions, ReplayActionItem.Play);
  w.press(Action.Confirm);
  w.at('replay');
  w.hold(0, 120);
  w.press(Action.Right);
  w.hold(0, 60);
  for (let i = 0; i < 4000 && w.top === 'replay'; i++) w.hold(0);
  w.at('replays');
  w.press(Action.Back);
  w.hold(0, 2);
  w.press(Action.Back);
  w.hold(0, 2);
  w.at('title');
}

/**
 * The attract loop: the demo play (when the content's demos decode at this frame), the hi-score
 * tables, the story crawl over its sprite scenes, the title again.
 *
 * @param w - A walk started on the title.
 */
function attract(w: LayoutWalk): void {
  w.hold(0, 720);
  for (let i = 0; i < 4000 && w.top === 'demo'; i++) w.hold(0);
  w.at('hiScore');
  for (let i = 0; i < 2000 && w.top === 'hiScore'; i++) w.hold(0);
  w.at('story');
  for (let i = 0; i < 9000 && w.top === 'story'; i++) w.hold(0);
  w.at('title');
}

/**
 * A single stage (no campaign): the EXTRA SHIPS code's message, STAGE CLEAR and TO BE CONTINUED,
 * the name entry.
 *
 * @param w - A walk started on the title, its stage outside the campaign.
 */
function singleStage(w: LayoutWalk): void {
  w.hold(0, 2);
  for (const direction of SECRET_CODES[SecretCode.ExtraShips]) w.press(direction);
  w.hold(0, 60);
  w.title(TitleItem.Start);
  w.launch();
  w.play(80);
  addScore(w.game.world, 0, 5_000);
  w.game.world.status = 'stageClear';
  for (let i = 0; i < 1000 && w.top !== 'nameEntry'; i++) w.hold(0);
  w.name();
  w.hold(0, 40);
  w.press(Action.Confirm);
  w.hold(0, 2);
  w.at('title');
}

/**
 * A campaign run (co-op, so the tallies show both scores): zone by zone across the map — the
 * tallies, the map's choices, the final zone's escape —, the ending's story and card, the credits.
 *
 * @param w - A walk started on the title.
 */
function campaign(w: LayoutWalk): void {
  w.hold(0, 2);
  w.title(TitleItem.TwoPlayers);
  w.launch();
  w.press(Action.Shot, Action.Pause);
  w.hold(Action.Shot, 40, Action.Shot);
  w.zoneClear();
  for (const down of [true, false, true, true]) {
    w.toZone(down);
    w.hold(Action.Shot, 40, Action.Shot);
    w.zoneClear();
  }
  if (w.top === 'game') {
    // The final zone's escape.
    w.hold(Action.Shot | Action.Down, 100, Action.Shot | Action.Up);
    w.zoneClear();
  }
  w.at('ending');
  for (let i = 0; i < 6000 && w.flow.ending.phase === 0; i++) w.hold(0);
  w.hold(0, ENDING_LOCK_TICKS + 20);
  w.press(Action.Confirm);
  w.at('credits');
  for (let i = 0; i < 12000 && w.top === 'credits'; i++) w.hold(0);
}

/**
 * The HUDs: co-op (both halves), a Direct-mode game, the caravan's clock, BOSS RUSH.
 *
 * @param w - A walk started on the title, the EXTRA rewards unlocked.
 */
function huds(w: LayoutWalk): void {
  const flow = w.flow;
  w.hold(0, 2);
  w.title(TitleItem.TwoPlayers);
  w.launch();
  w.play(80);
  w.press(Action.Shot, Action.Pause);
  w.hold(Action.Shot, 60, Action.Shot | Action.Up);
  w.quit();
  w.title(TitleItem.Start);
  w.launch(1);
  w.play(120);
  w.quit();
  w.title(TitleItem.Extra);
  w.hold(0, 2);
  w.focus(flow.extra.menu, ExtraItem.Caravan);
  w.press(Action.Right);
  w.press(Action.Confirm);
  w.launch();
  w.play(120);
  w.game.world.timeLeft = 300;
  w.hold(Action.Shot, 60);
  w.quit();
  w.title(TitleItem.Extra);
  w.presses(Action.Confirm);
  w.launch();
  w.play(120);
  w.quit();
}

/**
 * Every scene of the flow, one key per `core/scenes` `SceneId` (a `Record`, so the compiler
 * fails when a scene is added and not listed).
 */
const SCENES: Readonly<Record<SceneId, true>> = {
  boot: true,
  title: true,
  game: true,
  pause: true,
  stageClear: true,
  gameOver: true,
  confirm: true,
  difficulty: true,
  shipSelect: true,
  weaponSelect: true,
  autoOrder: true,
  continue: true,
  map: true,
  options: true,
  nameEntry: true,
  hiScore: true,
  ending: true,
  credits: true,
  demo: true,
  story: true,
  practice: true,
  soundTest: true,
  controls: true,
  display: true,
  graphics: true,
  gameOptions: true,
  extras: true,
  rebind: true,
  inputTest: true,
  extra: true,
  replays: true,
  replay: true,
  about: true,
};

/** Every scene id of the flow, sorted: what the walks must show. */
export const SCENE_IDS: readonly string[] = Object.freeze(Object.keys(SCENES).sort());

/**
 * The scene ids a report must show: every one, but the demo play when the shipped demos do not
 * decode at this frame (recorded at 384×216, they are refused at 640×360 until R2-03 re-records
 * them — the attract loop skips them).
 *
 * @param report - The walks' report.
 * @returns The ids, sorted.
 */
export function expectedScenes(report: LayoutReport): string[] {
  return SCENE_IDS.filter((id) => report.demos || id !== 'demo');
}

/** What a set of walks found. */
export interface LayoutReport {
  /** Every problem, sorted by message. */
  readonly problems: LayoutProblem[];
  /** Every scene id shown. */
  readonly seen: string[];
  /** Whether the attract loop played a demo (the shipped demos decode at this frame). */
  readonly demos: boolean;
}

/**
 * Runs every layout walk in one language.
 *
 * @param db - The shipped content.
 * @param language - The UI language.
 * @returns The problems and the scenes shown.
 */
export function walkLayouts(db: ContentDb, language: string): LayoutReport {
  const walks: LayoutWalk[] = [];
  const run = (options: Omit<LayoutWalkOptions, 'language'>, script: (w: LayoutWalk) => void) => {
    const w = new LayoutWalk(db, { language, ...options });
    walks.push(w);
    script(w);
  };
  run({ canExit: true, config: { remoteMode: false } }, frontEnd);
  run({ start: 'title', canExit: true }, aGame);
  run({ start: 'title' }, attract);
  run({ start: 'title', config: { stage: 'zone-b' } }, singleStage);
  run({ start: 'title' }, campaign);
  run({ start: 'title', unlocks: true }, huds);
  const problems = new Map<string, LayoutProblem>();
  const seen = new Set<string>();
  for (const w of walks) {
    for (const [message, problem] of w.problems) problems.set(message, problem);
    for (const scene of w.seen) seen.add(scene);
  }
  const sorted = [...problems.keys()]
    .sort()
    .map((message) => problems.get(message) as LayoutProblem);
  return { problems: sorted, seen: [...seen].sort(), demos: walks[2].flow.demos.length > 0 };
}
