/**
 * The **shell's frame fingerprint** (plan_resolution.md R1-02): a hash of everything the shell's
 * own scenes hand a renderer — the free-flight scene (`?scene=flight`), the sprite showcase (the
 * default dev scene before M1-16) and the fx gallery (`?scene=fx-gallery`) — frame by frame along
 * fixed walks: their HUD and UI draw lists, their world views' sprite batches, and the fx calls the
 * gallery makes.
 *
 * **Why.** Core's presentation fingerprint (`test/integration/presentation-fingerprint.test.ts`)
 * covers only `@shmup/core`'s output. R1-02 re-derives the shell scenes' HUD rows, bar heights and
 * text positions from core's frame constants and must keep them *pixel-identical* at 384×216;
 * this test is that check. It was pinned on master `5ec7ac5`, before any shell change of R1-02,
 * and re-pinned at R2-01's flip to 640×360.
 *
 * **How it hashes.** Per walk, three FNV-1a hashes: `hud` and `ui` (every drawn command with every
 * field the renderer reads; a text command contributes its string, never its slot), and `world`
 * (the camera and every live sprite of every batch; for the gallery, also every particle burst
 * and popup it asks for). A failing entry names the walk and the kind of output that moved.
 *
 * **Keeping it green.** Through R1 it must stay green without an edit. It is re-pinned on purpose
 * only — R2-01 (the 640×360 flip) or a deliberate drawing change — by running it with
 * `SHMUP_FINGERPRINT_UPDATE=1`, which rewrites this file's own entries (R5-P.P10), or with
 * `SHMUP_FINGERPRINT_PRINT=1` to only print the table, the reason in the commit message.
 */
import { fileURLToPath } from 'node:url';
import {
  Action,
  addScore,
  commitPlayerInput,
  createDrawList,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type DrawList,
  type Game,
  type HeadlessPlatform,
  type RenderFrame,
  type ScreenView,
  type WorldView,
} from '@shmup/core';
import {
  createScreenEffects,
  type FxContent,
  type ParticleSystem,
  type ScorePopups,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../vite.shared.js';
import { rewritePinned } from '../../../packages/core/test/helpers/pin-writer.js';
import { createFlightScene } from '../src/flight/index.js';
import { FX_GALLERY_STATION_TICKS, createFxGallery } from '../src/fx-gallery/index.js';
import { createShowcase } from '../src/showcase/index.js';

// ------------------------------------------------------------------------------ hashing

/** FNV-1a offset basis. */
const FNV_OFFSET = 0x811c9dc5;

/** Scratch for the bits of a double. */
const F64 = new Float64Array(1);
/** The double's two 32-bit words. */
const U32 = new Uint32Array(F64.buffer);

/** A running FNV-1a hash over 32-bit words. */
class Hash {
  /** The state. */
  h = FNV_OFFSET;

  /**
   * Folds in a 32-bit integer, byte by byte.
   *
   * @param v - The value (taken as a 32-bit integer).
   */
  int(v: number): void {
    let h = this.h;
    h = Math.imul(h ^ (v & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
    this.h = h >>> 0;
  }

  /**
   * Folds in a number exactly (its IEEE 754 bits; -0 as 0, every NaN alike).
   *
   * @param v - The value.
   */
  num(v: number): void {
    F64[0] = v === 0 ? 0 : v;
    if (v !== v) F64[0] = NaN;
    this.int(U32[0]);
    this.int(U32[1]);
  }

  /**
   * Folds in a string (its length, then its UTF-16 code units).
   *
   * @param s - The string.
   */
  str(s: string): void {
    this.int(s.length);
    for (let i = 0; i < s.length; i++) this.int(s.charCodeAt(i));
  }

  /**
   * The hash as 8 hex digits.
   *
   * @returns The hex string.
   */
  hex(): string {
    return this.h.toString(16).padStart(8, '0');
  }
}

/** `DrawOp.Text` (a literal so the hashing does not depend on the enum's object). */
const OP_TEXT = 3;
/** `DrawOp.Number`. */
const OP_NUMBER = 4;

/**
 * Folds a draw list's drawn commands into a hash, in draw order.
 *
 * @param h - The hash.
 * @param list - The list.
 */
function hashDrawList(h: Hash, list: DrawList): void {
  h.int(list.count);
  for (let i = 0; i < list.count; i++) {
    const op = list.op[i];
    h.int(op);
    h.int(list.x[i]);
    h.int(list.y[i]);
    h.int(list.w[i]);
    h.int(list.h[i]);
    h.int(list.color[i]);
    h.int(list.alpha[i]);
    h.int(list.frame[i]);
    h.int(list.flags[i]);
    if (op === OP_TEXT) h.str(list.strings[list.ref[i]] ?? '');
    else h.int(list.ref[i]);
    if (op === OP_NUMBER) h.num(list.value[i]);
  }
}

/**
 * Folds a world view's camera and live sprites into a hash.
 *
 * @param h - The hash.
 * @param view - The view.
 */
function hashWorld(h: Hash, view: WorldView): void {
  h.num(view.camera.x);
  h.num(view.camera.y);
  h.int(view.batches.length);
  for (const b of view.batches) {
    h.int(b.layer);
    h.int(b.count);
    for (let i = 0; i < b.count; i++) {
      h.num(b.x[i]);
      h.num(b.y[i]);
      h.int(b.spriteId[i]);
      h.int(b.frame[i]);
      h.int(b.flags[i]);
    }
  }
}

/** The three hashes of one walk. */
class Fingerprint {
  /** The HUD list. */
  readonly hud = new Hash();
  /** The UI list. */
  readonly ui = new Hash();
  /** The world view (and, for the gallery, its fx calls). */
  readonly world = new Hash();

  /**
   * Folds in one displayed frame.
   *
   * @param frame - The scene's frame.
   */
  frame(frame: RenderFrame): void {
    hashDrawList(this.hud, frame.hud);
    hashDrawList(this.ui, frame.ui);
    if (frame.world !== null) hashWorld(this.world, frame.world);
  }

  /**
   * The pinned form.
   *
   * @returns `'<hud> <ui> <world>'`.
   */
  text(): string {
    return `${this.hud.hex()} ${this.ui.hex()} ${this.world.hex()}`;
  }
}

// ------------------------------------------------------------------------------ the walks

/**
 * A game on the shipped content (core kinds only).
 *
 * @param stage - A stage id, or `null` for open space.
 * @returns The game and its headless platform.
 */
function realGame(stage: string | null): { game: Game; platform: HeadlessPlatform } {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  const platform = createHeadlessPlatform();
  const config = stage === null ? { seed: 1 } : { seed: 1, stage };
  return { game: createGame(platform, config, db), platform };
}

/**
 * The scripted input of a flight walk: a slow square around the playfield, firing.
 *
 * @param tick - The tick.
 * @returns The action bits.
 */
function input(tick: number): number {
  const leg = (tick >> 6) & 3;
  const move =
    leg === 0 ? Action.Right : leg === 1 ? Action.Down : leg === 2 ? Action.Left : Action.Up;
  return move | Action.Shot;
}

/**
 * Walks the free-flight scene: `ticks` scripted ticks with a score bump every 50, then the game
 * forced over (the HUD's `GAME OVER` title).
 *
 * @param stage - A stage id, or `null` for open space.
 * @param ticks - Ticks to play.
 * @returns The walk's fingerprint.
 */
function flightWalk(stage: string | null, ticks: number): string {
  const { game, platform } = realGame(stage);
  game.world.debugFlags.godMode = true;
  const flight = createFlightScene(game);
  const print = new Fingerprint();
  print.frame(flight.update(game.renderFrame()));
  for (let tick = 0; tick < ticks; tick++) {
    commitPlayerInput(platform.snapshot.players[0], input(tick));
    game.step();
    if (tick % 50 === 49) addScore(game.world, 0, 1230);
    print.frame(flight.update(game.renderFrame()));
  }
  game.world.players[0].lives = 2;
  print.frame(flight.update(game.renderFrame()));
  game.world.status = 'gameOver';
  print.frame(flight.update(game.renderFrame()));
  return print.text();
}

/**
 * Walks the boss WARNING of the `test-boss` stage in free flight: every frame from the start to
 * the boss's arrival (the band, both colour phases, gone again).
 *
 * @returns The walk's fingerprint.
 */
function flightWarningWalk(): string {
  const { game } = realGame('test-boss');
  game.world.debugFlags.godMode = true;
  const flight = createFlightScene(game);
  const warning = game.world.bosses.warning;
  const print = new Fingerprint();
  let seen = false;
  for (let tick = 0; tick < 20_000 && !(seen && !warning.active); tick++) {
    game.step();
    if (warning.active) seen = true;
    print.frame(flight.update(game.renderFrame()));
  }
  expect(seen).toBe(true);
  return print.text();
}

/**
 * A game-like frame at a tick (the showcase and the gallery read only its tick, alpha and screen).
 *
 * @param tick - The tick.
 * @returns The frame.
 */
function sourceFrame(tick: number): RenderFrame {
  const screen: ScreenView = { shakeX: 0, shakeY: 0, flash: 0, dim: 0 };
  return { tick, alpha: 0, world: null, hud: createDrawList(1), ui: createDrawList(1), screen };
}

/**
 * Walks the sprite showcase over 600 ticks.
 *
 * @returns The walk's fingerprint.
 */
function showcaseWalk(): string {
  const showcase = createShowcase();
  const print = new Fingerprint();
  for (let tick = 0; tick < 600; tick++) print.frame(showcase.update(sourceFrame(tick)));
  return print.text();
}

/**
 * Walks the fx gallery through every station, with fake particles and popups whose calls (the
 * burst and popup positions) are folded into the `world` hash.
 *
 * @returns The walk's fingerprint.
 */
function galleryWalk(): string {
  const print = new Fingerprint();
  const calls = print.world;
  const content = {
    presets: [{ id: 'explosion.small' }, { id: 'spark' }, { id: 'debris' }],
    triggers: [],
  } as unknown as FxContent;
  const particles = {
    content,
    emit: (preset: number, x: number, y: number, scale: number) => {
      calls.int(1);
      calls.int(preset);
      calls.num(x);
      calls.num(y);
      calls.num(scale);
      return 1;
    },
  } as unknown as ParticleSystem;
  const popups = {
    show: (value: number, x: number, y: number, color: number) => {
      calls.int(2);
      calls.num(value);
      calls.num(x);
      calls.num(y);
      calls.int(color);
      return true;
    },
  } as unknown as ScorePopups;
  const gallery = createFxGallery({ particles, popups, effects: createScreenEffects() });
  const end = (gallery.stations.length + 1) * FX_GALLERY_STATION_TICKS;
  for (let tick = 0; tick < end; tick++) print.frame(gallery.update(sourceFrame(tick)));
  return print.text();
}

/**
 * The pinned fingerprints (`'<hud> <ui> <world>'`), by walk. Re-pinned at R2-01's flip to the
 * 640×360 frame (12-px HUD bars, the 9×12 font, the ×3/2 interim art), then for free flight's HUD
 * and WARNING band laid out from the font's cell and the art's scale like the scene flow's (C5),
 * then at R4-01.A1b: the v2 ships' five bank frames deepen the bank the flight and showcase
 * walks draw (the third hash of three walks moved), then at R4-01.A2: every core player batch
 * now leads with the thruster sprite (the interned `ships/*-thruster[@p2]` names renumber the
 * flight walk's sprite ids — open-space, test-range and the WARNING band moved; the showcase
 * pushes its own thruster through its own sprite list, unchanged here, and the fx-gallery draws
 * no ship — both stay), then at R4-05.MIRRORFIX: free flight's WARNING band mirrors the scene
 * flow's R4-05.E3 layout (the centred text row, the hazard fields at both ends, the alert edges
 * drawn over them — the warning walk's `ui` hash moved; every other walk and hash stays).
 */
const PINNED: Readonly<Record<string, string>> = {
  'flight.open-space': '6a35490d ff7f3235 0c3a5665',
  'flight.test-range': 'a95bbc65 ff7f3235 010cf020',
  'flight.warning': '9bf45858 bb66561d aaef81e1',
  showcase: 'b9c2aea8 57ecce45 58a99e5f',
  'fx-gallery': '6eca8905 dc268025 2ff8baab',
};

/** The file whose `PINNED` the update mode rewrites (R5-P.P10). */
const PIN_FILE = fileURLToPath(import.meta.url);

/** Whether this run rewrites its own pins (`SHMUP_FINGERPRINT_UPDATE=1`). */
const updating = process.env.SHMUP_FINGERPRINT_UPDATE === '1';

/** The walks, by name. */
const WALKS: Readonly<Record<string, () => string>> = {
  'flight.open-space': () => flightWalk(null, 600),
  'flight.test-range': () => flightWalk('test-range', 600),
  'flight.warning': flightWarningWalk,
  showcase: showcaseWalk,
  'fx-gallery': galleryWalk,
};

describe('shell frame fingerprint (R1-02: the shell scenes stay pixel-identical)', () => {
  for (const name of Object.keys(WALKS)) {
    it(
      name,
      () => {
        const got = WALKS[name]();
        if (updating) {
          rewritePinned(PIN_FILE, name, got);
          return;
        }
        if (process.env.SHMUP_FINGERPRINT_PRINT === '1') {
          process.stdout.write(`  '${name}': '${got}',\n`);
          return;
        }
        expect(got).toBe(PINNED[name]);
      },
      60_000,
    );
  }
});
