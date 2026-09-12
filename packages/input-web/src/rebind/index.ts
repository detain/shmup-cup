/**
 * # rebind — data-driven input profiles, binding contexts and the profile choice
 *
 * **Status: partial.** Profiles, context tables and the persistence hook are implemented; the
 * rebinding UI helpers (capture the next key, conflict detection, reset to defaults) arrive
 * with the Options screen (M2-16).
 *
 * **Responsibility.** The Samsung remote mapping and its quirks are *data* (decision D13):
 * `content/input/*.input-profiles.json` holds named profiles, each with separate **`game`**
 * and **`menu`** binding tables (decision D15 — keyboard X is Sub in the game but Back in
 * menus, remote OK is PowerUp in the game but Confirm in menus), a release debounce, a
 * diagonal and an SOCD policy (`remote`) and the Tizen keys to register. This module
 *
 * - validates profile files with the core schema combinators ({@link parseInputProfiles},
 *   {@link loadInputProfiles}; plan §3.5 — `input-profiles` content is owned here) and
 *   compiles every context into the numeric tables the sources read ({@link ContextTables});
 * - collects them for a host ({@link createInputProfileRegistry}, whose `load` is the content
 *   owner the shell calls) and picks the active one ({@link chooseInputProfile},
 *   {@link overrideInputTuning} for dev overrides);
 * - lists the profiles a host can safely offer in the Options screen ({@link selectableKeyProfiles},
 *   {@link inputProfileChoices} — M1-17: only profiles whose menu table the host's keys can reach,
 *   so the player can always navigate back out);
 * - persists a choice through `Platform.storage` under its own key
 *   ({@link loadInputProfileChoice}, {@link saveInputProfileChoice}) — the apps keep the choice in
 *   the `core/save` document instead since M1-17 (`options.input.profileId`).
 *
 * `WebInput.setProfile()` / `WebInput.setContext()` (`web-input`) apply a profile and switch
 * its tables; nothing here runs per tick.
 *
 * **Implements.**
 * - shmup_feat.md §4 — remote-first rules 2–3 and 8 (tunable per device, menus fully
 *   D-pad + OK + Back navigable), [P1] rebinding per device + persistence (data side)
 * - shmup_feat.md §21 — controls options (profile choice)
 *
 * **Public API.** {@link InputProfile}, {@link ProfileBindings}, {@link ContextTables},
 * {@link InputProfileDevice}, {@link INPUT_PROFILE_DEVICES}, {@link KEY_PROFILE_DEVICES},
 * {@link INPUT_PROFILES_KIND}, {@link REQUIRED_CONTEXT_ACTIONS}, {@link SYSTEM_REMOTE_KEYS},
 * {@link InputProfilesResult}, {@link parseInputProfiles}, {@link loadInputProfiles},
 * {@link InputProfileRegistry}, {@link createInputProfileRegistry}, {@link chooseInputProfile},
 * {@link overrideInputTuning}, {@link selectableKeyProfiles}, {@link KeySpace},
 * {@link inputProfileChoices}, {@link DEFAULT_PROFILE_SUFFIX}, {@link DEFAULT_KEYBOARD_PROFILE_ID},
 * {@link DEFAULT_REMOTE_PROFILE_ID}, {@link DEFAULT_GAMEPAD_PROFILE_ID},
 * {@link INPUT_PROFILE_STORAGE_KEY}, {@link loadInputProfileChoice},
 * {@link saveInputProfileChoice}.
 *
 * @module
 */
import {
  ACTION_NAMES,
  Action,
  CONTENT_FORMAT_VERSION,
  defineModule,
  s,
  type ActionMask,
  type ActionName,
  type ContentFile,
  type InputContext,
  type InputProfileChoice,
  type PlatformStorage,
  type ValidationIssue,
} from '@shmup/core';
import type { KeyBindings } from '../keymap/index.js';
import {
  DIAGONAL_POLICIES,
  MAX_RELEASE_DEBOUNCE_TICKS,
  SOCD_POLICIES,
  type InputTuning,
} from '../remote/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'rebind',
  status: 'partial',
  specRefs: ['shmup_feat.md §4', 'shmup_feat.md §21'],
});

/** The `kind` of input profile content files (plan §3.5). */
export const INPUT_PROFILES_KIND = 'input-profiles';

/** Which device a profile drives: key events (`keyboard`, `remote`) or a polled `gamepad`. */
export type InputProfileDevice = 'keyboard' | 'remote' | 'gamepad';

/** Every {@link InputProfileDevice}. */
export const INPUT_PROFILE_DEVICES: readonly InputProfileDevice[] = Object.freeze([
  'keyboard',
  'remote',
  'gamepad',
] as InputProfileDevice[]);

/** Devices whose profiles bind keys (the keyboard source) rather than gamepad buttons. */
export const KEY_PROFILE_DEVICES: readonly InputProfileDevice[] = Object.freeze([
  'keyboard',
  'remote',
] as InputProfileDevice[]);

/** Profile id used on the web when nothing else is chosen (decision D13). */
export const DEFAULT_KEYBOARD_PROFILE_ID = 'keyboard-default';

/** Profile id used on the TV when nothing else is chosen (decision D14). */
export const DEFAULT_REMOTE_PROFILE_ID = 'tizen-remote-safe';

/** Profile id used for gamepads (standard mapping). */
export const DEFAULT_GAMEPAD_PROFILE_ID = 'gamepad-standard';

/**
 * Actions every profile must bind in each context: the game needs the four directions and
 * Pause; menus must be fully D-pad + OK + Back navigable (shmup_feat.md §4 rule 8).
 */
export const REQUIRED_CONTEXT_ACTIONS: Readonly<Record<InputContext, readonly ActionName[]>> =
  Object.freeze({
    game: Object.freeze(['Up', 'Down', 'Left', 'Right', 'Pause'] as ActionName[]),
    menu: Object.freeze(['Up', 'Down', 'Left', 'Right', 'Confirm', 'Back'] as ActionName[]),
  });

/**
 * Tizen key names a profile may never register: `Exit` (long-press Back) and the volume keys
 * belong to the system (shmup_tech.md §2.3).
 */
export const SYSTEM_REMOTE_KEYS: readonly string[] = Object.freeze([
  'Exit',
  'VolumeUp',
  'VolumeDown',
  'VolumeMute',
]);

/** One binding table as written in a profile file: key / button → action names. */
export interface ProfileBindings {
  /** `KeyboardEvent.code` (e.g. `ArrowUp`, `KeyX`) → actions. Checked first. */
  readonly byCode: Readonly<Record<string, readonly ActionName[]>>;
  /**
   * Legacy `KeyboardEvent.keyCode` (JSON object keys, e.g. `"10009"` remote Back) → actions.
   * Used when `code` is empty or not listed — TV remote keys arrive that way.
   */
  readonly byKeyCode: Readonly<Record<string, readonly ActionName[]>>;
  /** Standard-mapping gamepad button index (`"0"` … `"31"`) → actions. Gamepad profiles only. */
  readonly buttons?: Readonly<Record<string, readonly ActionName[]>>;
}

/** One context of a profile compiled to the numeric tables the input sources read. */
export interface ContextTables {
  /**
   * Key tables for the keyboard source. Keys bound only in the *other* context are present
   * with mask `0`, so they are tracked and `preventDefault()`-ed in every context.
   */
  readonly keys: KeyBindings;
  /** Button index → actions for gamepads (empty for key profiles). */
  readonly buttons: readonly ActionMask[];
}

/** A validated, compiled input profile (one entry of an `input-profiles` file). */
export interface InputProfile extends InputTuning {
  /** Unique id, lower-case kebab (`tizen-remote-safe`). Selected by `?profile=` and saves. */
  readonly id: string;
  /** Name shown in the Options screen. */
  readonly label: string;
  /** The device the profile drives (also the device kind reported to the core). */
  readonly device: InputProfileDevice;
  /** The binding tables as written, per context (decision D15). */
  readonly context: Readonly<Record<InputContext, ProfileBindings>>;
  /** Polls a released key keeps counting as held (0 for gamepads — they are polled). */
  readonly releaseDebounceTicks: number;
  /**
   * Tizen key names to register with `tizen.tvinputdevice` (remote profiles only; never
   * {@link SYSTEM_REMOTE_KEYS}).
   */
  readonly register: readonly string[];
  /** The compiled tables per context. */
  readonly tables: Readonly<Record<InputContext, ContextTables>>;
}

/** What {@link parseInputProfiles} and {@link loadInputProfiles} produce. */
export interface InputProfilesResult {
  /** The valid profiles, in file (path) then document order; duplicates dropped. */
  readonly profiles: readonly InputProfile[];
  /** Every problem, as `<file>:<json path>` + message (empty = sound). */
  readonly issues: readonly ValidationIssue[];
}

/** A list of action names (at least one). */
const ACTION_LIST = s.array(s.enumOf(ACTION_NAMES), { min: 1 });

/** One binding table. */
const BINDINGS_SCHEMA = s.object(
  {
    byCode: s.record(ACTION_LIST, /^[A-Za-z][A-Za-z0-9]*$/),
    byKeyCode: s.record(ACTION_LIST, /^[1-9][0-9]{0,5}$/),
    buttons: s.record(ACTION_LIST, /^(?:[0-9]|[12][0-9]|3[01])$/),
  },
  { optional: ['buttons'] },
);

/** One profile entry. */
const PROFILE_SCHEMA = s.object({
  id: s.str({ maxLength: 64, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
  label: s.str({ maxLength: 40 }),
  device: s.enumOf(INPUT_PROFILE_DEVICES),
  context: s.object({ game: BINDINGS_SCHEMA, menu: BINDINGS_SCHEMA }),
  releaseDebounceTicks: s.int({ min: 0, max: MAX_RELEASE_DEBOUNCE_TICKS }),
  diagonals: s.enumOf(DIAGONAL_POLICIES),
  socd: s.enumOf(SOCD_POLICIES),
  register: s.array(s.str({ maxLength: 40, pattern: /^[A-Za-z][A-Za-z0-9]*$/ }), { max: 32 }),
});

/** A whole `input-profiles` file. */
const FILE_SCHEMA = s.object({
  formatVersion: s.int({ min: CONTENT_FORMAT_VERSION, max: CONTENT_FORMAT_VERSION }),
  kind: s.enumOf([INPUT_PROFILES_KIND] as const),
  profiles: s.array(PROFILE_SCHEMA, { min: 1 }),
});

/** A parsed (not yet compiled) profile entry. */
type ParsedProfile = Omit<InputProfile, 'tables'>;

/**
 * Prefixes a JSON path with its file, the way `loadContent` does.
 *
 * @param file - File path (`''` when parsing a bare document).
 * @param path - JSON path inside the file.
 * @returns `<file>:<path>`, or whichever part is non-empty.
 */
const at = (file: string, path: string): string => {
  if (file === '') return path;
  return path === '' ? file : file + ':' + path;
};

/**
 * ORs action names into a mask.
 *
 * @param names - Action names (validated).
 * @returns The mask.
 */
function maskOf(names: readonly ActionName[]): ActionMask {
  let mask = 0;
  for (const name of names) mask |= Action[name];
  return mask;
}

/**
 * Compiles one context's key tables.
 *
 * @param own - The context's bindings.
 * @param other - The other context's bindings (its keys become `0` entries).
 * @returns Frozen, prototype-free key tables.
 */
function compileKeys(own: ProfileBindings, other: ProfileBindings): KeyBindings {
  const byCode = Object.create(null) as Record<string, ActionMask>;
  const byKeyCode = Object.create(null) as Record<number, ActionMask>;
  for (const code of Object.keys(other.byCode)) byCode[code] = 0;
  for (const code of Object.keys(own.byCode)) byCode[code] = maskOf(own.byCode[code] ?? []);
  for (const key of Object.keys(other.byKeyCode)) byKeyCode[Number(key)] = 0;
  for (const key of Object.keys(own.byKeyCode)) {
    byKeyCode[Number(key)] = maskOf(own.byKeyCode[key] ?? []);
  }
  return Object.freeze({ byCode: Object.freeze(byCode), byKeyCode: Object.freeze(byKeyCode) });
}

/**
 * Compiles one context's gamepad button table.
 *
 * @param own - The context's bindings.
 * @returns Button index → actions, as long as the highest bound index + 1.
 */
function compileButtons(own: ProfileBindings): readonly ActionMask[] {
  const buttons = own.buttons ?? {};
  const table: ActionMask[] = [];
  for (const key of Object.keys(buttons)) {
    const index = Number(key);
    while (table.length <= index) table.push(0);
    table[index] = maskOf(buttons[key] ?? []);
  }
  return Object.freeze(table);
}

/**
 * Compiles a parsed profile.
 *
 * @param profile - The parsed entry.
 * @returns The frozen {@link InputProfile}.
 */
function compileProfile(profile: ParsedProfile): InputProfile {
  const { game, menu } = profile.context;
  const tables = Object.freeze({
    game: Object.freeze({ keys: compileKeys(game, menu), buttons: compileButtons(game) }),
    menu: Object.freeze({ keys: compileKeys(menu, game), buttons: compileButtons(menu) }),
  });
  return Object.freeze({ ...profile, tables });
}

/**
 * The checks the schema cannot express: device-specific fields, required actions per context
 * and forbidden registrations.
 *
 * @param profile - A schema-valid entry.
 * @param path - JSON path of the entry (`profiles[3]`).
 * @param issues - Collector (document-relative paths).
 * @returns `true` when the entry is usable.
 */
function checkProfile(profile: ParsedProfile, path: string, issues: ValidationIssue[]): boolean {
  const start = issues.length;
  const gamepad = profile.device === 'gamepad';
  for (const context of ['game', 'menu'] as const) {
    const bindings = profile.context[context];
    const contextPath = path + '.context.' + context;
    if (gamepad) {
      if (bindings.buttons === undefined) {
        issues.push({
          path: contextPath + '.buttons',
          message: 'is required for a gamepad profile',
        });
      }
      if (Object.keys(bindings.byCode).length > 0 || Object.keys(bindings.byKeyCode).length > 0) {
        issues.push({
          path: contextPath,
          message: 'a gamepad profile binds buttons only (byCode and byKeyCode must be empty)',
        });
      }
    } else if (bindings.buttons !== undefined) {
      issues.push({
        path: contextPath + '.buttons',
        message: 'only gamepad profiles bind buttons',
      });
    }
    let bound = 0;
    for (const table of [bindings.byCode, bindings.byKeyCode, bindings.buttons ?? {}]) {
      for (const key of Object.keys(table)) bound |= maskOf(table[key] ?? []);
    }
    const missing = REQUIRED_CONTEXT_ACTIONS[context].filter(
      (name) => (bound & Action[name]) === 0,
    );
    if (missing.length > 0) {
      issues.push({ path: contextPath, message: 'must bind ' + missing.join(', ') });
    }
  }
  if (gamepad && profile.releaseDebounceTicks !== 0) {
    issues.push({
      path: path + '.releaseDebounceTicks',
      message: 'must be 0 for a gamepad profile (gamepads are polled, not event-driven)',
    });
  }
  if (profile.device !== 'remote' && profile.register.length > 0) {
    issues.push({ path: path + '.register', message: 'only remote profiles register keys' });
  }
  for (let i = 0; i < profile.register.length; i++) {
    const name = profile.register[i] ?? '';
    if (SYSTEM_REMOTE_KEYS.indexOf(name) >= 0) {
      issues.push({
        path: path + '.register[' + String(i) + ']',
        message: '"' + name + '" is a system key and must never be registered',
      });
    }
  }
  return issues.length === start;
}

/**
 * Validates one file body and appends its profiles, reporting duplicate ids.
 *
 * @param data - The parsed JSON body.
 * @param file - File path for issue messages (`''` for a bare document).
 * @param profiles - Collector of valid profiles.
 * @param seen - Id → file path of the first definition (duplicate detection).
 * @param issues - Collector of problems (file-prefixed paths).
 */
function collectFile(
  data: unknown,
  file: string,
  profiles: InputProfile[],
  seen: Map<string, string>,
  issues: ValidationIssue[],
): void {
  const local: ValidationIssue[] = [];
  const parsed = FILE_SCHEMA.parse(data, '', local);
  if (parsed !== undefined) {
    for (let i = 0; i < parsed.profiles.length; i++) {
      const entry = parsed.profiles[i] as ParsedProfile;
      const path = 'profiles[' + String(i) + ']';
      if (!checkProfile(entry, path, local)) continue;
      const first = seen.get(entry.id);
      if (first !== undefined) {
        local.push({
          path: path + '.id',
          message:
            'duplicate input profile id "' +
            entry.id +
            '"' +
            (first === '' ? '' : ' (first defined in ' + first + ')'),
        });
        continue;
      }
      seen.set(entry.id, file);
      profiles.push(compileProfile(entry));
    }
  }
  for (const issue of local) issues.push({ path: at(file, issue.path), message: issue.message });
}

/**
 * Validates one `input-profiles` file body and compiles its profiles.
 *
 * @remarks
 * Uses the core schema combinators (decision D28), so messages read like every other content
 * error (`profiles[1].diagonals: must be one of: combine, lastWins, firstWins`). A body that
 * fails the schema contributes no profile; a profile that fails a semantic check (required
 * actions, device-specific fields, a system key in `register`, a duplicate id) is dropped
 * while the others are kept. Never throws for bad data.
 *
 * @param data - The parsed JSON (`{ formatVersion, kind: 'input-profiles', profiles }`).
 * @param path - File path used to prefix issue paths (`''` = bare JSON paths).
 * @returns The profiles and every issue.
 *
 * @example
 * ```ts
 * const { profiles, issues } = parseInputProfiles(json, 'input/remote.input-profiles.json');
 * if (issues.length === 0) input.setProfile(profiles[0]);
 * ```
 */
export function parseInputProfiles(data: unknown, path = ''): InputProfilesResult {
  const profiles: InputProfile[] = [];
  const issues: ValidationIssue[] = [];
  collectFile(data, path, profiles, new Map(), issues);
  return { profiles, issues };
}

/**
 * Validates every `input-profiles` content file (the owner of that kind, plan §3.5).
 *
 * @remarks
 * Files are processed in ascending path order (the result does not depend on the order the
 * host lists them); profile ids must be unique across all files (the first definition wins).
 * Files of another `kind` are reported, not skipped silently.
 *
 * @param files - The content files of kind `input-profiles`.
 * @returns The profiles of all files and every issue.
 *
 * @example
 * ```ts
 * // The shell's loader hands an owner exactly the files of its kind (result.foreign by kind).
 * const { profiles, issues } = loadInputProfiles(inputProfileFiles);
 * for (const issue of issues) console.warn(issue.path + ': ' + issue.message);
 * ```
 */
export function loadInputProfiles(files: readonly ContentFile[]): InputProfilesResult {
  const profiles: InputProfile[] = [];
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();
  const sorted = files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of sorted) collectFile(file.data, file.path, profiles, seen, issues);
  return { profiles, issues };
}

/** The input profiles of a host, filled by the content owner during boot. */
export interface InputProfileRegistry {
  /** Profiles of the last {@link InputProfileRegistry.load} (empty before). */
  readonly profiles: readonly InputProfile[];
  /** Issues of the last load. */
  readonly issues: readonly ValidationIssue[];
  /**
   * Validates and keeps the profile files — pass it as the content owner of
   * {@link INPUT_PROFILES_KIND} (`bootShell({ contentOwners: { 'input-profiles': r.load } })`).
   * Safe to pass unbound.
   *
   * @param files - Every `input-profiles` file.
   * @returns The issues found (empty when every file is valid).
   */
  readonly load: (files: readonly ContentFile[]) => readonly ValidationIssue[];
  /**
   * Looks a profile up by id.
   *
   * @param id - Profile id.
   * @returns The profile, or `null`.
   */
  get(id: string): InputProfile | null;
}

/**
 * Creates an empty {@link InputProfileRegistry}.
 *
 * @remarks
 * Every `load` call replaces the previous result (profiles *and* issues) — it does not merge.
 * `get` is a linear scan (a handful of profiles, called at boot and on an Options change,
 * never per tick).
 *
 * @returns The registry.
 *
 * @example
 * ```ts
 * const profiles = createInputProfileRegistry();
 * await bootShell({ ...options, contentOwners: { [INPUT_PROFILES_KIND]: profiles.load } });
 * const active = chooseInputProfile(profiles.profiles, [DEFAULT_REMOTE_PROFILE_ID], KEY_PROFILE_DEVICES);
 * ```
 */
export function createInputProfileRegistry(): InputProfileRegistry {
  let result: InputProfilesResult = { profiles: [], issues: [] };
  return {
    get profiles() {
      return result.profiles;
    },
    get issues() {
      return result.issues;
    },
    load: (files) => {
      result = loadInputProfiles(files);
      return result.issues;
    },
    get: (id) => {
      for (const profile of result.profiles) if (profile.id === id) return profile;
      return null;
    },
  };
}

/**
 * Picks the first candidate id that names a profile for one of `devices`.
 *
 * @param profiles - Available profiles.
 * @param candidates - Ids in priority order (e.g. `?profile=`, the saved choice, the platform
 *   default); `null` / `undefined` / unknown ids are skipped.
 * @param devices - Acceptable devices ({@link KEY_PROFILE_DEVICES} for the keyboard source).
 * @returns The profile, or `null` when no candidate matches.
 *
 * @example
 * ```ts
 * chooseInputProfile(profiles, [query.profile, saved, DEFAULT_KEYBOARD_PROFILE_ID], KEY_PROFILE_DEVICES);
 * ```
 */
export function chooseInputProfile(
  profiles: readonly InputProfile[],
  candidates: ReadonlyArray<string | null | undefined>,
  devices: readonly InputProfileDevice[],
): InputProfile | null {
  for (const id of candidates) {
    if (id === null || id === undefined) continue;
    for (const profile of profiles) {
      if (profile.id === id && devices.indexOf(profile.device) >= 0) return profile;
    }
  }
  return null;
}

/**
 * A copy of a profile with some tuning replaced (dev overrides such as `?debounce=2`).
 *
 * @param profile - The profile.
 * @remarks
 * A non-finite or negative `releaseDebounceTicks` becomes 0; a fractional one is floored. The
 * original profile is untouched, so the registry keeps the values from the content file.
 *
 * @param profile - The profile.
 * @param overrides - Tuning fields to replace; `releaseDebounceTicks` is clamped to
 *   `0 … MAX_RELEASE_DEBOUNCE_TICKS` (and forced to 0 for gamepads).
 * @returns A new frozen profile (the tables are shared).
 *
 * @example
 * ```ts
 * // apps/web: ?debounce=2
 * input.setProfile(overrideInputTuning(profile, { releaseDebounceTicks: 2 }));
 * ```
 */
export function overrideInputTuning(
  profile: InputProfile,
  overrides: Partial<InputTuning>,
): InputProfile {
  const requested = overrides.releaseDebounceTicks ?? profile.releaseDebounceTicks;
  const ticks =
    profile.device === 'gamepad' || !Number.isFinite(requested) || requested < 0
      ? 0
      : Math.min(MAX_RELEASE_DEBOUNCE_TICKS, Math.floor(requested));
  return Object.freeze({
    ...profile,
    releaseDebounceTicks: ticks,
    diagonals: overrides.diagonals ?? profile.diagonals,
    socd: overrides.socd ?? profile.socd,
  });
}

/**
 * How a host's keys reach the binding tables: `'code'` — a desktop keyboard (every key has a
 * `KeyboardEvent.code`, looked up in `byCode` first); `'keyCode'` — the TV remote (its keys
 * arrive as legacy key codes, looked up in `byKeyCode`).
 */
export type KeySpace = 'code' | 'keyCode';

/**
 * The keyboard / remote profiles a host can offer in its Options screen: those whose **menu**
 * table binds Up, Down, Left, Right, Confirm and Back through the host's key space — so whichever
 * the player picks, the menus stay navigable and the Options screen can be left again (shmup_feat.md
 * §4 rule 8).
 *
 * @remarks
 * On the web (`'code'`) that is `keyboard-default` and `keyboard-remote-emulation`; on the TV
 * (`'keyCode'`) the `tizen-remote-*` profiles. Gamepad profiles are never offered (the per-device
 * choice arrives with M2-16). Order: as in `profiles`.
 *
 * @param profiles - Every profile (the registry's).
 * @param keySpace - How the host's keys arrive.
 * @returns The selectable profiles (a new array; the profiles themselves are shared).
 *
 * @example
 * ```ts
 * selectableKeyProfiles(registry.profiles, 'keyCode').map((p) => p.id);
 * // → ['tizen-remote-safe', 'tizen-remote-diagonal']
 * ```
 */
export function selectableKeyProfiles(
  profiles: readonly InputProfile[],
  keySpace: KeySpace,
): InputProfile[] {
  const out: InputProfile[] = [];
  for (const profile of profiles) {
    if (KEY_PROFILE_DEVICES.indexOf(profile.device) < 0) continue;
    const menu = profile.context.menu;
    const table = keySpace === 'code' ? menu.byCode : menu.byKeyCode;
    let bound = 0;
    for (const key of Object.keys(table)) bound |= maskOf(table[key] ?? []);
    let complete = true;
    for (const name of REQUIRED_CONTEXT_ACTIONS.menu) {
      if ((bound & Action[name]) === 0) complete = false;
    }
    if (complete) out.push(profile);
  }
  return out;
}

/** Appended to the label of the platform's default profile in the Options screen. */
export const DEFAULT_PROFILE_SUFFIX = ' (DEFAULT)';

/**
 * The Options screen's CONTROLS entries: the {@link selectableKeyProfiles} as `{ id, label }`, the
 * platform's default marked with {@link DEFAULT_PROFILE_SUFFIX} (`SAFE 4-WAY (DEFAULT)`).
 *
 * @param profiles - Every profile.
 * @param keySpace - How the host's keys arrive.
 * @param defaultId - The platform's default profile id.
 * @param extra - A profile to offer even when it is not selectable (e.g. a `?profile=` dev
 *   override in use), appended when missing; `null` for none.
 * @returns The choices (a new array of new objects, in {@link selectableKeyProfiles} order, then
 *   `extra`).
 *
 * @example
 * ```ts
 * inputProfileChoices(registry.profiles, 'keyCode', DEFAULT_REMOTE_PROFILE_ID);
 * // → [{ id: 'tizen-remote-safe', label: 'SAFE 4-WAY (DEFAULT)' }, { id: …, label: 'FAST 8-WAY' }]
 * ```
 */
export function inputProfileChoices(
  profiles: readonly InputProfile[],
  keySpace: KeySpace,
  defaultId: string,
  extra: InputProfile | null = null,
): InputProfileChoice[] {
  const list = selectableKeyProfiles(profiles, keySpace);
  if (extra !== null && list.indexOf(extra) < 0) list.push(extra);
  return list.map((profile) => ({
    id: profile.id,
    label: profile.id === defaultId ? profile.label + DEFAULT_PROFILE_SUFFIX : profile.label,
  }));
}

/** `Platform.storage` key of the chosen keyboard / remote profile id. */
export const INPUT_PROFILE_STORAGE_KEY = 'input.profile';

/**
 * Reads the saved keyboard / remote profile choice.
 *
 * @remarks
 * Never rejects: a storage error resolves with `null` (the platform default is used). The id
 * is returned as saved, even if no profile has it any more.
 *
 * @param storage - `Platform.storage`.
 * @returns Resolves with the saved id, or `null` when none is saved or storage fails.
 *
 * @example
 * ```ts
 * const saved = await loadInputProfileChoice(platform.storage);
 * ```
 */
export function loadInputProfileChoice(storage: PlatformStorage): Promise<string | null> {
  return storage.get(INPUT_PROFILE_STORAGE_KEY).then(
    (value) => (typeof value === 'string' && value !== '' ? value : null),
    () => null,
  );
}

/**
 * Saves the keyboard / remote profile choice (the Options screen calls this).
 *
 * @remarks
 * The id is not checked here — {@link loadInputProfileChoice} callers pass it through
 * {@link chooseInputProfile}, which skips an id that no longer names a profile.
 *
 * @param storage - `Platform.storage`.
 * @param id - Profile id.
 * @returns Resolves once stored (best effort — storage adapters swallow quota errors).
 * @throws Rejects only when the storage adapter itself rejects.
 *
 * @example
 * ```ts
 * await saveInputProfileChoice(platform.storage, 'tizen-remote-diagonal');
 * ```
 */
export function saveInputProfileChoice(storage: PlatformStorage, id: string): Promise<void> {
  return storage.set(INPUT_PROFILE_STORAGE_KEY, id);
}

// Planned (M2-16): captureNextInput(target): Promise<string>, findConflicts(profile), reset to
// defaults, a per-device (gamepad) choice.
