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
 * font atlases" (the table infrastructure — plan M2-16; the language choice and the CJK glyphs —
 * plan M3-03).
 *
 * **M3-03 — the language choice.** {@link UI_LANGUAGES} names the languages the game ships
 * (`en`, `es`, `ja`); {@link uiLanguageIds} lists what the loaded content actually offers and
 * {@link pickUiStrings} picks one table for {@link resolveUiText}. {@link UI_GLYPHS} is the
 * font's whole charset — printable ASCII, the UI symbols, the Latin-1 letters Spanish needs and
 * the katakana subset Japanese is written in — and {@link isUiTextDrawable} is the check
 * `core/data` runs over every `strings` file. {@link FIXED_UI_TEXT_IDS} are the ids no
 * translation may change (the fixed-width HUD codes, the game's name, the pure symbols).
 *
 * **Public API.** Re-exported by `core/ui`: {@link UiText}, {@link UiTextId},
 * {@link DEFAULT_UI_TEXT}, {@link UI_TEXT_IDS}, {@link MAX_UI_TEXT_LENGTH},
 * {@link DEFAULT_LANGUAGE}, {@link resolveUiText}, {@link formatUiText}, {@link UI_GLYPHS},
 * {@link isUiTextDrawable}, {@link UI_LANGUAGES}, {@link UiLanguage}, {@link uiLanguageLabel},
 * {@link uiLanguageIds}, {@link pickUiStrings}, {@link UiStringTableLike},
 * {@link FIXED_UI_TEXT_IDS}, {@link isFixedUiTextId}.
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
  inputTestHint: 'PAUSE X3 OR HOLD TO EXIT',
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
  // M3-01: the Extra Edit weapons' compact meter labels.
  meterShortControl: 'CM',
  meterShortUpper: 'UM',
  meterShortSmallSpread: 'SS',
  meterShortHawk: 'HW',
  meterShortTwoWayBack: '2B',
  meterShortBackDouble: 'BD',
  meterShortSpreadGun: 'SG',
  // M3-01: the EXTRA menu and its modes.
  titleExtra: 'EXTRA',
  extraTitle: 'EXTRA',
  extraBossRush: 'BOSS RUSH',
  extraCaravan: 'CARAVAN',
  extraArcade: 'ARCADE',
  extraReplays: 'REPLAYS',
  extraBossRushHint: 'EVERY ZONE BOSS IN A ROW',
  extraCaravanHint: 'SCORE ATTACK: THREE MINUTES',
  extraArcadeHint: 'THE CAMPAIGN LOOPS, EACH LOOP HARDER',
  extraReplaysHint: 'WATCH, KEEP AND SHARE YOUR RUNS',
  loopFormat: 'LOOP {0}',
  loopZoneCard: 'LOOP {0}  ZONE {1}',
  okNextLoop: 'OK: LOOP {0}',
  modeBossRush: 'BOSS RUSH',
  modeCaravan: 'CARAVAN',
  modeArcade: 'ARCADE',
  timeUp: 'TIME UP',
  weaponExtra: 'EXTRA',
  // M3-01: unlocks and secret codes.
  unlockEnding: 'EXTRA EDIT AND LOOP 2 UNLOCKED',
  unlockExtraEdit: 'EXTRA EDIT UNLOCKED',
  secretShips: '{0} SHIPS!',
  // M3-01: the assists (GAME page) and rumble (CONTROLS page).
  optOptionRecovery: 'OPT RECOVERY',
  optSpeed: 'SPEED',
  optInvincible: 'INVINCIBLE',
  optRumble: 'RUMBLE',
  speedFormat: '{0}%',
  assistHint: 'ASSISTS MARK SCORES AND REPLAYS',
  assistedMark: '*',
  // M3-01: the replay browser and playback.
  replaysTitle: 'REPLAYS',
  replayLast: 'LAST GAME',
  replayKept: 'SAVED {0}',
  replayEmpty: 'NO REPLAY',
  replayPlay: 'PLAY',
  replayKeep: 'KEEP',
  replayShare: 'SHARE',
  replayDelete: 'DELETE',
  replaysHint: 'OK: PLAY, KEEP, SHARE OR DELETE',
  replayKeptIn: 'KEPT IN SAVED {0}',
  replayFull: 'NO FREE SLOT: DELETE ONE FIRST',
  replayShared: 'REPLAY COPIED',
  replayShareFailed: 'COULD NOT SHARE',
  replayDeleted: 'REPLAY DELETED',
  replayUnreadable: 'REPLAY CANNOT BE READ',
  replaySpeed: 'REPLAY  X{0}',
  replayPaused: 'REPLAY  PAUSED',
  replayAssisted: 'ASSISTED',
  replayEnd: 'REPLAY END',
  replayDesync: 'REPLAY OUT OF SYNC',
  // M3-02: the DISPLAY page's CRT / ASPECT rows and the EXTRAS page.
  optCrt: 'CRT',
  optAspect: 'ASPECT',
  crtOff: 'OFF',
  crtLight: 'LIGHT',
  crtFull: 'FULL',
  aspectNormal: 'NORMAL',
  aspectWide: 'ULTRA-WIDE',
  aspectClassic: 'CLASSIC 4:3',
  optExtras: 'EXTRAS',
  extrasTitle: 'EXTRAS',
  optSlowdown: 'SLOWDOWN',
  optGraze: 'GRAZE',
  optDeathBomb: 'DEATH BOMB',
  optBlackHole: 'BLACK HOLE',
  extrasHint: 'APPLIES FROM THE NEXT GAME',
  blackHoleHint: 'BLACK HOLE: THE DIRECT SHIP ONLY',
  hudBombs: 'BOMB',
  escapeClear: 'ESCAPE COMPLETE',
  // M3-03: the DISPLAY page's LANGUAGE row.
  optLanguage: 'LANGUAGE',
  languageHint: 'LANGUAGE: FROM THE NEXT LAUNCH',
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

/** The language the game falls back to: the built-in {@link DEFAULT_UI_TEXT} (M2-16). */
export const DEFAULT_LANGUAGE = 'en';

/**
 * Printable ASCII (space … `~`) — the glyphs every language uses.
 *
 * @remarks
 * Written out rather than generated so {@link UI_GLYPHS} is one literal a reader (and the font
 * test) can compare with `assets/source/fonts/pixel6x8.font.json`.
 */
const ASCII_GLYPHS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~';

/** The symbols the UI draws: the four arrows, the meter dot, the star and the cross (M2-16). */
const SYMBOL_GLYPHS = '←↑→↓●★✕';

/**
 * The Latin-1 letters and punctuation the Spanish table needs (M3-03). Upper case only — every
 * label the UI draws is upper case.
 */
const LATIN_1_GLYPHS = '¡¿ÁÉÍÓÚÑÜ';

/**
 * The CJK subset the Japanese table is written in (M3-03): **katakana only**, the way 1980s
 * arcade hardware wrote Japanese. 84 glyphs — the 46 base kana, the 20 voiced and 5 semi-voiced
 * ones, the 9 small ones, the long-vowel bar, the middle dot and the two ideographic punctuation
 * marks. No kanji and no hiragana ship: a JIS level-1 kanji set would be about 6,900 glyphs, two
 * orders of magnitude more atlas pixels than the whole placeholder sprite set
 * (`docs/dev/asset-pipeline.md`, "Katakana and the CJK budget").
 */
const KATAKANA_GLYPHS =
  '、。' +
  'ァアィイゥウェエォオ' +
  'カガキギクグケゲコゴ' +
  'サザシジスズセゼソゾ' +
  'タダチヂッツヅテデトド' +
  'ナニヌネノ' +
  'ハバパヒビピフブプヘベペホボポ' +
  'マミムメモ' +
  'ャヤュユョヨ' +
  'ラリルレロ' +
  'ワヲン' +
  '・ー';

/**
 * Every character the bitmap font draws, in code-point order within each block (M3-03): printable
 * ASCII, the UI symbols, the Latin-1 letters Spanish needs and the katakana subset Japanese is
 * written in.
 *
 * @remarks
 * This is the single source of truth for the font's charset: `core/data` refuses a `strings` entry
 * with any other character, and `test/scripts/assets/font.test.ts` asserts the font source holds
 * exactly these code points. Adding a language means adding its glyphs here **and** to
 * `assets/source/fonts/pixel6x8.font.json` in the same commit.
 */
export const UI_GLYPHS: string = ASCII_GLYPHS + SYMBOL_GLYPHS + LATIN_1_GLYPHS + KATAKANA_GLYPHS;

/** {@link UI_GLYPHS} as a lookup (built once — {@link isUiTextDrawable} is a load-time check). */
const GLYPH_SET: ReadonlySet<string> = new Set(UI_GLYPHS.split(''));

/**
 * Whether the bitmap font can draw every character of a text (M3-03).
 *
 * @param text - Any string.
 * @returns `true` when every character is one of {@link UI_GLYPHS} (an empty string is drawable).
 *
 * @remarks
 * A load-time check (`core/data` runs it over every `strings` file); it walks the string, so never
 * call it per frame.
 *
 * @example
 * ```ts
 * isUiTextDrawable('ステージ'); // → true
 * isUiTextDrawable('ステージ１'); // → false (full-width digits are not in the font)
 * ```
 */
export function isUiTextDrawable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (!GLYPH_SET.has(text.charAt(i))) return false;
  }
  return true;
}

/** A language the game can show its UI in (M3-03). */
export interface UiLanguage {
  /** Lower-case ISO 639-1 id, optionally with a region (`en`, `es`, `ja`, `pt-br`). */
  readonly id: string;
  /**
   * The language's own name, in its own script and drawable with {@link UI_GLYPHS} — so the
   * LANGUAGE row reads the same whichever language is currently shown.
   */
  readonly label: string;
}

/**
 * The languages the shipped game names (M3-03). A `content/strings/<id>.strings.json` file for
 * another id still loads and is still offered; it is simply labelled by its upper-cased id.
 */
export const UI_LANGUAGES: readonly UiLanguage[] = Object.freeze([
  Object.freeze({ id: 'en', label: 'ENGLISH' }),
  Object.freeze({ id: 'es', label: 'ESPAÑOL' }),
  Object.freeze({ id: 'ja', label: 'ニホンゴ' }),
]);

/**
 * The name to draw for a language id (M3-03).
 *
 * @param id - A language id (a `ContentDb.uiStrings` entry's `language`).
 * @returns The {@link UI_LANGUAGES} label, or the id upper-cased when the game does not name it.
 *
 * @example
 * ```ts
 * uiLanguageLabel('ja'); // → 'ニホンゴ'
 * uiLanguageLabel('fr'); // → 'FR'
 * ```
 */
export function uiLanguageLabel(id: string): string {
  for (let i = 0; i < UI_LANGUAGES.length; i++) {
    if (UI_LANGUAGES[i].id === id) return UI_LANGUAGES[i].label;
  }
  return id.toUpperCase();
}

/**
 * Ids whose text is the same in every language (M3-03): the game's own name, the fixed-width HUD
 * and power-meter codes, and the pure symbols. A translation that gives one of them a different
 * text is a `core/data` issue — the HUD draws them in a few pixels of a bar it cannot grow, and
 * `orderCodes` is indexed character by character by the auto-order screen.
 */
export const FIXED_UI_TEXT_IDS: readonly string[] = Object.freeze([
  'gameTitle',
  'hi',
  'p1',
  'p2',
  'emptyName',
  'assistedMark',
  'orderCodes',
  'hudShortShot',
  'hudShortSub',
  'hudShortArm',
  'hudShortSpeed',
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
]);

/** {@link FIXED_UI_TEXT_IDS} as a lookup. */
const FIXED_IDS: ReadonlySet<string> = new Set(FIXED_UI_TEXT_IDS);

/**
 * Whether an id's text is the same in every language ({@link FIXED_UI_TEXT_IDS}) — M3-03.
 *
 * @param id - A UI string id.
 * @returns `true` when a translation may not change it.
 */
export function isFixedUiTextId(id: string): boolean {
  return FIXED_IDS.has(id);
}

/**
 * Resolves a UI string table: the given entries over {@link DEFAULT_UI_TEXT} — a missing, empty or
 * non-string entry keeps the English one, an unknown id is ignored.
 *
 * @param table - A content table (a `ContentDb.uiStrings` entry's `strings`), or `null` /
 *   `undefined`.
 * @returns A frozen table with every id ({@link DEFAULT_UI_TEXT} itself when nothing differs).
 *
 * A {@link FIXED_UI_TEXT_IDS} id keeps its English text whatever the table says (M3-03).
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
    const text = typeof value === 'string' && value !== '' && !FIXED_IDS.has(id) ? value : own;
    if (text !== own) changed = true;
    out[id] = text;
  }
  return changed ? (Object.freeze(out) as UiText) : DEFAULT_UI_TEXT;
}

/** One language's table, as `ContentDb.uiStrings` carries it (structural — no `core/data` import). */
export interface UiStringTableLike {
  /** The table's language id. */
  readonly language: string;
  /** Id → text. */
  readonly strings: Readonly<Record<string, string>>;
}

/**
 * The languages the game can offer (M3-03): {@link DEFAULT_LANGUAGE} first — it is built in and
 * always available — then every other language the content carries a table for, in
 * {@link UI_LANGUAGES} order and then alphabetically.
 *
 * @param tables - The content's tables (`ContentDb.uiStrings`).
 * @returns A new array of language ids, never empty. A cold path (the Options screen builds its
 *   LANGUAGE row from it once).
 *
 * @example
 * ```ts
 * uiLanguageIds(db.uiStrings); // → ['en', 'es', 'ja']
 * ```
 */
export function uiLanguageIds(tables: readonly UiStringTableLike[]): string[] {
  const rest: string[] = [];
  for (let i = 0; i < tables.length; i++) {
    const id = tables[i].language;
    if (id !== DEFAULT_LANGUAGE && rest.indexOf(id) < 0) rest.push(id);
  }
  /**
   * Sort key of a language: its {@link UI_LANGUAGES} position, or the list's length for one the
   * game does not name (those follow, alphabetically).
   *
   * @param id - A language id.
   * @returns The key.
   */
  const rank = (id: string): number => {
    for (let i = 0; i < UI_LANGUAGES.length; i++) if (UI_LANGUAGES[i].id === id) return i;
    return UI_LANGUAGES.length;
  };
  rest.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return [DEFAULT_LANGUAGE, ...rest];
}

/**
 * The table of a language, for {@link resolveUiText} (M3-03).
 *
 * @param tables - The content's tables (`ContentDb.uiStrings`).
 * @param language - The language id the player chose.
 * @returns That language's entries, the {@link DEFAULT_LANGUAGE} table's when it has none, or
 *   `null` when the content carries neither (the built-in English table is then used as it is).
 *
 * @example
 * ```ts
 * const text = resolveUiText(pickUiStrings(db.uiStrings, save.options.display.language));
 * ```
 */
export function pickUiStrings(
  tables: readonly UiStringTableLike[],
  language: string,
): Readonly<Record<string, string>> | null {
  let fallback: Readonly<Record<string, string>> | null = null;
  for (let i = 0; i < tables.length; i++) {
    if (tables[i].language === language) return tables[i].strings;
    if (tables[i].language === DEFAULT_LANGUAGE) fallback = tables[i].strings;
  }
  return fallback;
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
