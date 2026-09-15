/**
 * # ui/strings — the UI string table (plan M2-16, infrastructure for M3 localization)
 *
 * **Responsibility.** Every label the canvas UI draws — menus, screens, the HUD's words, the rebind
 * and input-test screens — by id: {@link DEFAULT_UI_TEXT} is the built-in English table,
 * `content/strings/en.strings.json` (kind `strings`, validated by `core/data`) is the shipped copy
 * a translation replaces (`pnpm content:check` keeps the two equal, and a source scan keeps every
 * label in the table). The scene flow resolves the content's table once ({@link resolveUiText} —
 * missing ids fall back to English) and every scene reads its labels from it; templates with `{0}`
 * / `{1}` ({@link formatUiText}) are filled on transitions, never per frame.
 *
 * A leaf module: `core/data` validates `strings` files against {@link UI_TEXT_IDS} without a cycle.
 *
 * **Implements.** shmup_feat.md §21 accessibility / [P2] localization "JSON string tables + bitmap
 * font atlases" (the table infrastructure — plan M2-16; the language choice is M3).
 *
 * @module
 */
import { SFX_CUE_NAMES } from '../events/index.js';

/** The built-in English labels with a fixed id (the SFX names are added from the cue list). */
const STATIC_UI_TEXT = {
  // Shared words.
  gameTitle: 'SHMUP CUP',
  loading: 'LOADING',
  pressOk: 'PRESS OK',
  pressStart: 'PRESS START',
  hi: 'HI',
  p1: '1P',
  p2: '2P',
  score: 'SCORE',
  back: 'BACK',
  start: 'START',
  done: 'DONE',
  none: 'NONE',
  defaultLabel: 'DEFAULT',
  on: 'ON',
  off: 'OFF',
  yes: 'YES',
  no: 'NO',
  end: 'END',
  gameOver: 'GAME OVER',
  stage: 'STAGE',
  zone: 'ZONE',
  zoneCard: 'ZONE {0}',
  bonusStage: 'BONUS STAGE',
  newHiScore: 'NEW HI-SCORE',
  lives: 'LIVES',
  okChoose: 'OK: CHOOSE',
  // The title's mode select.
  titleOnePlayer: '1 PLAYER',
  titleTwoPlayers: '2 PLAYERS',
  titlePractice: 'PRACTICE',
  titleOptions: 'OPTIONS',
  titleSoundTest: 'SOUND TEST',
  titleExit: 'EXIT',
  // The pause menu.
  pauseTitle: 'PAUSE',
  pauseResume: 'RESUME',
  pauseOptions: 'OPTIONS',
  pauseRetry: 'RETRY STAGE',
  pauseQuit: 'QUIT TO TITLE',
  // The confirm dialog.
  confirmExit: 'EXIT SHMUP CUP?',
  confirmQuit: 'QUIT TO TITLE?',
  // The Options screen (M2-16: sound at the top, three pages).
  optionsTitle: 'OPTIONS',
  optMaster: 'MASTER',
  optMusic: 'MUSIC',
  optSfx: 'SFX',
  optControls: 'CONTROLS',
  optDisplay: 'DISPLAY',
  optGame: 'GAME',
  // The DISPLAY page.
  displayTitle: 'DISPLAY',
  optBullets: 'BULLETS',
  optScale: 'SCALE',
  optShake: 'SHAKE',
  optFlashes: 'FLASHES',
  optHitbox: 'HITBOX',
  optBossHp: 'BOSS HP',
  paletteStandard: 'STANDARD',
  paletteDeuteranopia: 'DEUTERANOPIA',
  paletteProtanopia: 'PROTANOPIA',
  paletteTritanopia: 'TRITANOPIA',
  scaleInteger: 'INTEGER',
  scaleFit: 'FIT',
  scaleStretch: 'STRETCH',
  flashNormal: 'NORMAL',
  flashReduced: 'REDUCED',
  // The CONTROLS page.
  controlsTitle: 'CONTROLS',
  optProfile: 'PROFILE',
  optAutofire: 'AUTOFIRE',
  optRate: 'RATE',
  optSocd: 'SOCD',
  optDebounce: 'DEBOUNCE',
  optKeys: 'REBIND KEYS',
  optPad: 'REBIND PAD',
  optInputTest: 'INPUT TEST',
  autofireAlways: 'ALWAYS',
  autofireToggle: 'TOGGLE',
  autofireHold: 'HOLD',
  rateFormat: '{0}/S',
  socdProfile: 'PROFILE',
  socdNeutral: 'NEUTRAL',
  socdLastWins: 'LAST WINS',
  debounceAuto: 'AUTO',
  debounceFormat: '{0} TICKS',
  controlsHint: 'AUTOFIRE / RATE: FROM THE NEXT GAME',
  deviceKeyboard: 'KEYBOARD',
  deviceRemote: 'REMOTE',
  deviceGamepad: 'GAMEPAD',
  // The GAME page.
  gameOptionsTitle: 'GAME',
  optDifficulty: 'DIFFICULTY',
  optLives: 'LIVES',
  optPenalty: 'PENALTY',
  optAutoPowerUp: 'AUTO POWER',
  optMagnet: 'MAGNET',
  optOneButton: 'ONE BUTTON',
  livesPreset: 'PRESET',
  penaltyPreset: 'PRESET',
  penaltyArcade: 'ARCADE',
  penaltyClassic: 'CLASSIC',
  penaltyCasual: 'CASUAL',
  gameOptionsHint: 'APPLIES FROM THE NEXT GAME',
  oneButtonHint: 'ONE BUTTON: AUTOFIRE, AUTO POWER, CASUAL',
  // The rebind screen (M2-16).
  rebindTitle: '{0} CONTROLS',
  rebindMode: 'MODE',
  contextGame: 'GAME',
  contextMenu: 'MENU',
  rebindReset: 'RESET',
  rebindPromptKey: 'PRESS A KEY FOR {0}',
  rebindPromptButton: 'PRESS A BUTTON FOR {0}',
  rebindCancelHint: 'ESC / BACK OR WAIT: CANCEL',
  rebindHint: 'OK: REBIND  BACK: DONE',
  rebindBound: '{0} REBOUND',
  rebindMoved: 'KEY TAKEN FROM {0}',
  rebindSwapped: 'SWAPPED WITH {0}',
  rebindRefused: 'NOT POSSIBLE: {0} NEEDS A KEY',
  rebindRejected: 'THAT KEY CANNOT BE USED',
  rebindUnchanged: 'NO CHANGE',
  rebindCancelled: 'CANCELLED',
  rebindResetDone: 'RESET TO DEFAULTS',
  // Action names (the rebind and input-test screens).
  actionUp: 'UP',
  actionDown: 'DOWN',
  actionLeft: 'LEFT',
  actionRight: 'RIGHT',
  actionShot: 'SHOT',
  actionSub: 'SUB',
  actionPowerUp: 'POWER-UP',
  actionSpecial: 'SPECIAL',
  actionSpeed: 'SPEED',
  actionPause: 'PAUSE',
  actionConfirm: 'OK',
  actionBack: 'BACK',
  // The input test (M2-16).
  inputTestTitle: 'INPUT TEST',
  inputTestHint: 'HOLD PAUSE TO EXIT',
  inputTestDevice: 'DEVICE',
  // The stage clear and the zone tally.
  stageClear: 'STAGE CLEAR',
  toBeContinued: 'TO BE CONTINUED',
  zoneClear: 'ZONE {0} CLEAR',
  bonusStageClear: 'BONUS STAGE CLEAR',
  kills: 'KILLS',
  killBonus: 'KILL BONUS',
  timeBonus: 'TIME BONUS',
  noBossTime: 'NO BOSS TIME',
  // The difficulty menu.
  difficultyTitle: 'DIFFICULTY',
  continues: 'CONTINUES',
  difficultyEasy: 'EASY',
  difficultyNormal: 'NORMAL',
  difficultyHard: 'HARD',
  difficultyArcade: 'ARCADE',
  // The continue countdown.
  continueTitle: 'CONTINUE?',
  credits: 'CREDITS',
  giveUp: 'BACK: GIVE UP',
  // The ship select.
  shipSelectTitle: 'SHIP SELECT',
  shipModeMeter: 'POWER METER',
  shipModeDirect: 'DIRECT ITEMS',
  shipHintMeter1: 'CAPSULES MOVE THE METER',
  shipHintMeter2: 'OK EQUIPS THE LIT SLOT',
  shipHintMeter3: 'OPTIONS COPY YOUR FIRE',
  shipHintDirect1: 'COLOUR ITEMS POWER UP',
  shipHintDirect2: 'BLUE: THE ARM SHIELD',
  shipHintDirect3: 'CH-: SPEED TOGGLE',
  // The weapon select and its order editor.
  weaponSelectTitle: 'WEAPON SELECT',
  wsType: 'TYPE',
  wsMissile: 'MISSILE',
  wsDouble: 'DOUBLE',
  wsLaser: 'LASER',
  wsOption: 'OPTION',
  wsShield: '? SLOT',
  wsMega: '! SLOT',
  wsAuto: 'AUTO',
  wsOrder: 'ORDER',
  wsHintChange: 'LEFT/RIGHT: CHANGE',
  wsHintGo: 'OK ON START: GO',
  weaponEdit: 'EDIT',
  megaMegaCrash: 'MEGA CRASH',
  megaNormal: 'NORMAL',
  megaSpeedDown: 'SPEED DOWN',
  megaLifeOption: 'LIFE OPTION',
  megaFullBarrier: 'FULL BARRIER',
  shieldForceField: 'FORCE FIELD',
  shieldShield: 'SHIELD',
  shieldFreeShield: 'FREE SHIELD',
  shieldRotate: 'ROTATE',
  shieldReduce: 'REDUCE',
  optionTrail: 'TRAIL',
  optionSnake: 'SNAKE',
  optionFormation: 'FORMATION',
  optionRotate: 'ROTATE',
  autoOrderTitle: 'AUTO ORDER',
  orderSpeed: 'SPEED',
  orderMissile: 'MISSILE',
  orderDouble: 'DOUBLE',
  orderLaser: 'LASER',
  orderOption: 'OPTION',
  orderCodes: 'SMDLO?!',
  // The zone map.
  mapTitle: 'ZONE MAP',
  mapSubtitle: 'CHOOSE YOUR COURSE',
  launch: 'LAUNCH',
  mapHint: 'UP/DOWN: CHOOSE  OK: LAUNCH',
  // The ending.
  endingTitle: 'ENDING',
  theEnd: 'THE END',
  route: 'ROUTE',
  thankYou: 'THANK YOU FOR PLAYING',
  okCredits: 'OK: CREDITS',
  okTitle: 'OK: TITLE',
  endingBossEscaped: 'A BOSS ESCAPED',
  endingNoMiss: 'NO MISS',
  endingNoContinue: 'NO CONTINUE',
  endingBonus: 'BONUS STAGE CLEARED',
  // The hi-score tables and the name entry.
  hiScoresTitle: 'HI-SCORES',
  rank: 'RANK',
  name: 'NAME',
  emptyName: '---',
  modeOnePlayer: '1 PLAYER',
  modeTwoPlayers: '2 PLAYERS',
  modePractice: 'PRACTICE',
  rank1: '1ST',
  rank2: '2ND',
  rank3: '3RD',
  rank4: '4TH',
  rank5: '5TH',
  rank6: '6TH',
  rank7: '7TH',
  rank8: '8TH',
  rank9: '9TH',
  rank10: '10TH',
  newHiScoreBang: 'NEW HI-SCORE!',
  enterName: 'ENTER YOUR NAME',
  nameHint: '↑↓ LETTER  → NEXT  ← BACK',
  time: 'TIME',
  // The attract loop.
  demoPlay: 'DEMO PLAY',
  // The practice select.
  practiceTitle: 'PRACTICE',
  practiceHint: 'SCORES GO TO THE PRACTICE TABLES',
  practiceZone: 'ZONE',
  practiceCheckpoint: 'CHECKPOINT',
  practiceLoadout: 'LOADOUT',
  checkpointFormat: 'CHECKPOINT {0}',
  loadoutStandard: 'STANDARD',
  loadoutFull: 'FULL POWER',
  // The sound test.
  soundTestTitle: 'SOUND TEST',
  stMusic: 'MUSIC',
  stSfx: 'SFX',
  stStop: 'STOP',
  soundTestHint: '← → CHOOSE   OK PLAY',
  // The HUD's words.
  hudBoss: 'BOSS',
  hudShot: 'SHOT',
  hudSub: 'SUB',
  hudArm: 'ARM',
  hudSpeed: 'SPD',
  hudShortShot: 'SH',
  hudShortSub: 'SB',
  hudShortArm: 'AR',
  hudShortSpeed: 'SP',
  meterShortSpeed: 'SP',
  meterShortMissile: 'MS',
  meterShortDouble: 'DB',
  meterShortLaser: 'LS',
  meterShortOption: 'OP',
  meterShortShield: '?',
  meterShortMega: '!',
  meterShortSpread: 'SB',
  meterShortTwoWay: '2W',
  meterShortTorpedo: 'TP',
  meterShortTail: 'TL',
  meterShortVertical: 'VT',
  meterShortFreeWay: 'FW',
  meterShortRipple: 'RP',
  meterShortCyclone: 'CY',
  meterShortTwin: 'TW',
} as const;

/** Id of a UI label with a fixed id (a key of the built-in table). */
export type UiTextId = keyof typeof STATIC_UI_TEXT;

/**
 * A resolved UI string table: every {@link UiTextId} (and every `sfx.<CueName>` sound-test name)
 * to its text. Frozen; read-only.
 */
export type UiText = Readonly<Record<UiTextId, string>> & Readonly<Record<string, string>>;

/**
 * The sound test's name of an SFX cue (`PlayerShot` → `PLAYER SHOT`) — the English default of its
 * `sfx.<CueName>` entry.
 *
 * @param cue - An `SFX_CUES` name.
 * @returns The name in words, upper case.
 */
function sfxWords(cue: string): string {
  return cue.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase();
}

/**
 * The built-in English UI string table (M2-16): every label with a fixed id plus one
 * `sfx.<CueName>` entry per `SFX_CUES` cue (the sound test's names). The shipped
 * `content/strings/en.strings.json` holds the same entries (`pnpm content:check`).
 */
export const DEFAULT_UI_TEXT: UiText = (() => {
  const table: Record<string, string> = {};
  for (const id of Object.keys(STATIC_UI_TEXT)) {
    table[id] = STATIC_UI_TEXT[id as UiTextId];
  }
  for (const cue of SFX_CUE_NAMES) table['sfx.' + cue] = sfxWords(cue);
  return Object.freeze(table) as UiText;
})();

/** Every id of {@link DEFAULT_UI_TEXT} (the fixed ones, then the `sfx.` ones), in table order. */
export const UI_TEXT_IDS: readonly string[] = Object.freeze(Object.keys(DEFAULT_UI_TEXT));

/** Longest text a `strings` entry may have (the widest screen line of the bitmap font is 64). */
export const MAX_UI_TEXT_LENGTH = 48;

/** The language the shipped game shows (M3 adds the choice). */
export const DEFAULT_LANGUAGE = 'en';

/**
 * Resolves a UI string table: the given entries over {@link DEFAULT_UI_TEXT} — a missing, empty or
 * non-string entry keeps the English one, an unknown id is ignored.
 *
 * @param table - A content table (`ContentDb.strings` entry's `strings`), or `null` / `undefined`.
 * @returns A frozen table with every id ({@link DEFAULT_UI_TEXT} itself when nothing differs).
 *
 * @example
 * ```ts
 * const text = resolveUiText({ pressOk: 'APPUYEZ SUR OK' });
 * text.pressOk; // → 'APPUYEZ SUR OK'
 * text.hi;      // → 'HI' (the default)
 * ```
 */
export function resolveUiText(table: Readonly<Record<string, unknown>> | null | undefined): UiText {
  if (table === null || table === undefined) return DEFAULT_UI_TEXT;
  const out: Record<string, string> = {};
  let changed = false;
  for (const id of UI_TEXT_IDS) {
    const value = Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
    const own = DEFAULT_UI_TEXT[id];
    const text = typeof value === 'string' && value !== '' ? value : own;
    if (text !== own) changed = true;
    out[id] = text;
  }
  return changed ? (Object.freeze(out) as UiText) : DEFAULT_UI_TEXT;
}

/**
 * Fills a template's `{0}` / `{1}` with values (M2-16 — labels such as `ZONE {0} CLEAR`). Builds a
 * string: call it on transitions, never per frame.
 *
 * @param template - The template.
 * @param a - The value of `{0}`.
 * @param b - The value of `{1}` (default `''`).
 * @returns The text.
 *
 * @example
 * ```ts
 * formatUiText(text.zoneClear, 'B'); // → 'ZONE B CLEAR'
 * ```
 */
export function formatUiText(
  template: string,
  a: string | number,
  b: string | number = '',
): string {
  return template.replace(/\{0\}/g, String(a)).replace(/\{1\}/g, String(b));
}
