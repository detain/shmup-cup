/**
 * The M2-01 menus with the Samsung remote (plan M2-01, shmup_feat.md §4 rule 8 — menus fully
 * D-pad + OK + Back navigable), core + input-web on the shipped content: key codes only (the
 * remote sends no `code`), through a real `WebInput`, one tick per frame.
 *
 * - OK on the title, START, the difficulty menu: Down / Up move, Back returns to the title menu,
 *   OK starts zone A on the chosen preset (its config from the shipped `rules` table: rank base,
 *   lives, aim directions);
 * - a game over with continues left opens the countdown; OK (after its lock) continues zone A at
 *   its last checkpoint — fresh lives, the continue digit, the stage theme queued again — and the
 *   game runs on; with none left the game-over screen opens instead;
 * - the weapon select (M2-03) after the difficulty menu: OK on START starts at once; Down / Up,
 *   Left / Right and Back choose TYPE C, an edited Missile and SPEED DOWN, and the game plays them.
 */
import {
  CONTINUE_LOCK_TICKS,
  ENGINE_SPRITES,
  GAME_OVER_DELAY_TICKS,
  KNOWN_SCRIPT_IDS,
  SimEventKind,
  addScore,
  createGame,
  loadContent,
  type ContentDb,
  type Game,
  type GameConfig,
  type Platform,
} from '@shmup/core';
import { TIZEN_KEY_CODES, createWebInput } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

const STEP = 1000 / 60;

/**
 * The shipped content, validated like the shell does.
 *
 * @returns The DB.
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

const DB = shipped();

/** A game with the scene flow on the title, driven by remote key codes. */
class RemoteSession {
  readonly game: Game;
  /** Frames run so far. */
  private frames = 0;
  /** The key target the web input listens to. */
  private readonly keys = new EventTarget();
  /** Music cues queued so far. */
  readonly music: number[] = [];

  /**
   * Creates the session.
   *
   * @param config - Config overrides.
   */
  constructor(config: Partial<GameConfig> = {}) {
    const input = createWebInput({ keyTarget: this.keys, keyDevice: 'remote' });
    const platform: Platform = {
      id: 'headless',
      input,
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
      audio: { unlock: () => Promise.resolve() },
      lifecycle: { onSuspend: () => {}, onResume: () => {} },
      exit: null,
      display: { cssWidth: 1920, cssHeight: 1080 },
      caps: { gamepad: false, remoteOnly: true, webgl2: false },
    };
    this.game = createGame(platform, { seed: 6, stage: 'zone-a', ...config }, DB, {
      scenes: 'title',
    });
    this.game.frame(0);
  }

  /** Scene ids, bottom to top. */
  get ids(): string[] {
    const flow = this.game.scenes!;
    const out: string[] = [];
    for (let i = 0; i < flow.stack.depth; i++) out.push(flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Runs frames (one tick each), collecting the music cues.
   *
   * @param count - Frames.
   */
  run(count = 1): void {
    for (let i = 0; i < count; i++) {
      this.frames++;
      this.game.frame(this.frames * STEP);
      this.game.events.drain((e) => {
        if (e.kind === SimEventKind.Music) this.music.push(e.id);
      });
    }
  }

  /**
   * Presses and releases a remote key (key code only), a frame each.
   *
   * @param keyCode - The key code.
   */
  press(keyCode: number): void {
    this.key('keydown', keyCode);
    this.run();
    this.key('keyup', keyCode);
    this.run();
  }

  /**
   * Dispatches a key event with an empty `code` (what the TV sends).
   *
   * @param type - `keydown` / `keyup`.
   * @param keyCode - The key code.
   */
  private key(type: 'keydown' | 'keyup', keyCode: number): void {
    this.keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat: false }));
  }

  /** OK, OK: the difficulty menu (past its lock). */
  openDifficulty(): void {
    this.press(TIZEN_KEY_CODES.Enter);
    this.press(TIZEN_KEY_CODES.Enter);
    this.run(2);
    expect(this.ids).toEqual(['title', 'difficulty']);
  }

  /** OK on START in the weapon select (M2-03) that the difficulty menu's OK opened. */
  launch(): void {
    expect(this.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    this.press(TIZEN_KEY_CODES.Enter);
    this.run(1);
    expect(this.ids).toEqual(['game']);
  }

  /** Every life gone: waits for the end screen. */
  gameOver(): void {
    const world = this.game.world;
    world.status = 'gameOver';
    for (const ship of world.players) ship.lives = 0;
    this.run(GAME_OVER_DELAY_TICKS);
  }
}

describe('integration: difficulty menu and continues with the remote (M2-01)', () => {
  it('moves through the presets, backs out and starts zone A on HARD', () => {
    const s = new RemoteSession();
    s.openDifficulty();
    const menu = s.game.scenes!.difficultyMenu;
    expect(menu.focused).toBe('normal');
    s.press(TIZEN_KEY_CODES.ArrowUp);
    expect(menu.focused).toBe('easy');
    s.press(TIZEN_KEY_CODES.Back);
    expect(s.ids).toEqual(['title']);
    s.press(TIZEN_KEY_CODES.Enter); // START again (the title menu kept its focus)
    s.run(2);
    expect(s.ids).toEqual(['title', 'difficulty']);
    expect(menu.focused).toBe('normal'); // Back chose nothing
    s.press(TIZEN_KEY_CODES.ArrowDown);
    expect(menu.focused).toBe('hard');
    s.press(TIZEN_KEY_CODES.Enter);
    s.launch();
    const world = s.game.world;
    expect(world.stage?.stage.id).toBe('zone-a');
    expect(world.config).toMatchObject({
      difficulty: 'hard',
      rankBase: DB.difficulty!.hard.rankBase,
      startingLives: DB.difficulty!.hard.lives,
      aimDirections: DB.difficulty!.hard.aimDirections,
    });
    expect(world.rank).toBe(4);
  });

  it('continues zone A at its checkpoint on OK after a game over', () => {
    const s = new RemoteSession();
    s.openDifficulty();
    s.press(TIZEN_KEY_CODES.Enter); // NORMAL
    s.launch();
    const world = s.game.world;
    s.run(60);
    const stage = world.stage!;
    const checkpoint = stage.stage.checkpoints[1];
    expect(checkpoint).toBeDefined();
    stage.jumpTo(checkpoint.x + 40);
    addScore(world, 0, 4_320);
    s.gameOver();
    expect(s.ids).toEqual(['game', 'continue']);
    s.run(CONTINUE_LOCK_TICKS);
    const theme = stage.stage.music.stageId;
    s.music.length = 0;
    s.press(TIZEN_KEY_CODES.Enter);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world).toBe(world);
    expect([world.status, world.players[0].lives, world.continuesUsed]).toEqual(['playing', 3, 1]);
    expect(world.scoring.board.scores[0].score).toBe(4_321);
    expect(stage.checkpoint).toBe(1);
    expect(s.music).toContain(theme);
    const tick = world.tick;
    s.run(120);
    expect(world.tick).toBe(tick + 120);
    expect(world.players[0].state).toBe('alive');
  });

  it('opens the game-over screen straight away on ARCADE (no continues)', () => {
    const s = new RemoteSession();
    s.openDifficulty();
    s.press(TIZEN_KEY_CODES.ArrowUp);
    s.press(TIZEN_KEY_CODES.ArrowUp); // wraps from EASY
    s.press(TIZEN_KEY_CODES.Enter);
    s.launch();
    expect(s.game.world.config).toMatchObject({ difficulty: 'arcade', continues: 0 });
    s.gameOver();
    expect(s.ids).toEqual(['game', 'gameOver']);
  });

  it('chooses a loadout in the weapon select with the remote only (M2-03, M2-04)', () => {
    const s = new RemoteSession({ stage: null });
    s.openDifficulty();
    s.press(TIZEN_KEY_CODES.Enter); // NORMAL
    s.run(2);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    const select = s.game.scenes!.weaponSelect;
    // Back to the difficulty menu and in again: nothing chosen.
    s.press(TIZEN_KEY_CODES.Back);
    expect(s.ids).toEqual(['title', 'difficulty']);
    s.run(2);
    s.press(TIZEN_KEY_CODES.Enter);
    s.run(2);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    s.press(TIZEN_KEY_CODES.ArrowDown); // START → TYPE
    s.press(TIZEN_KEY_CODES.ArrowRight); // TYPE B
    s.press(TIZEN_KEY_CODES.ArrowRight); // TYPE C
    expect(select.type.label).toBe('TYPE C');
    s.press(TIZEN_KEY_CODES.ArrowRight); // TYPE D
    s.press(TIZEN_KEY_CODES.ArrowRight); // EDIT: the rows keep TYPE D's weapons
    s.press(TIZEN_KEY_CODES.ArrowDown); // MISSILE
    s.press(TIZEN_KEY_CODES.ArrowLeft); // PHOTON TORPEDO → 2-WAY MISSILE
    expect(select.missile.label).toBe('2-WAY MISSILE');
    s.press(TIZEN_KEY_CODES.ArrowDown); // DOUBLE
    s.press(TIZEN_KEY_CODES.ArrowDown); // LASER
    s.press(TIZEN_KEY_CODES.ArrowDown); // OPTION (M2-04)
    s.press(TIZEN_KEY_CODES.ArrowRight); // TRAIL → SNAKE
    s.press(TIZEN_KEY_CODES.ArrowRight); // FORMATION
    expect(select.option.label).toBe('FORMATION');
    s.press(TIZEN_KEY_CODES.ArrowDown); // ?
    s.press(TIZEN_KEY_CODES.ArrowRight); // FORCE FIELD → SHIELD
    s.press(TIZEN_KEY_CODES.ArrowDown); // !
    s.press(TIZEN_KEY_CODES.ArrowRight); // NORMAL
    s.press(TIZEN_KEY_CODES.ArrowRight); // SPEED DOWN
    expect(select.mega.label).toBe('SPEED DOWN');
    for (let i = 0; i < 3; i++) s.press(TIZEN_KEY_CODES.ArrowDown); // AUTO, ORDER, START
    s.launch();
    expect(s.game.world.config).toMatchObject({
      weaponPreset: 'type-d',
      weaponEdit: { missile: 'missile.twoWay', double: 'shot.free', laser: 'laser.twin' },
      megaChoice: 'speedDown',
      optionChoice: 'formation',
      shieldChoice: 'shield',
    });
    expect(s.game.world.weapons.roleWeapons[3]?.id).toBe('missile.twoWay');
    expect(s.game.world.weapons.options[0].formation).toBe('formation');
  });
});
