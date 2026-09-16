/**
 * # rebind — data-driven input profiles, binding contexts, the profile choice and rebinding
 *
 * **Responsibility.** The Samsung remote mapping and its quirks are *data* (decision D13):
 * `content/input/*.input-profiles.json` holds named profiles, each with separate **`game`**
 * and **`menu`** binding tables (decision D15 — keyboard X is Sub in the game but Back in
 * menus, remote OK is PowerUp in the game but Confirm in menus), a release debounce, a
 * diagonal and an SOCD policy, the single-key model of the Samsung remote (`remote`) and the
 * Tizen keys to register. This module
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
 * **Rebinding (M2-16 — shmup_feat.md §4 "[P1] Rebinding per device … conflict detection, reset to
 * defaults, persistence", §21 accessibility "full remapping").** The player's changes live in the
 * `core/save` document as `core/config` `BindingOverrides` (per profile and context, the whole key
 * set of each rebound action, as binding tokens `code:<code>` / `key:<keyCode>` /
 * `button:<index>`); {@link customizeInputProfile} applies them — with the player's SOCD policy and
 * release debounce — to a profile before `WebInput.setProfile`. The Options screen's rebind prompt
 * captures the next key or button (`WebInput.beginCapture`; {@link captureToken} names it the way
 * the profile binds that key, `code:` or `key:`), then {@link rebindAction} binds it with **conflict
 * detection** (a key another action has is moved, or the two actions swap keys; nothing is ever left
 * without a key it needs; a split keyboard's player-2 key is never player 1's), {@link resetBindings}
 * restores the content's bindings, {@link findBindingConflicts} lists keys that trigger several
 * actions, and {@link bindingTokenLabel} / {@link bindingKeysLabel} name keys and buttons on
 * screen. Escape and the remote's Back ({@link RESERVED_BINDING_TOKENS}) cancel a capture and never
 * move.
 *
 * **Split keyboard (M2-06).** A `keyboard` profile may carry a `split` section — player 2's half
 * of the keyboard (`game` and `menu` tables like `context`, which is then player 1's half; no key
 * in both halves). `keyboard-split` ships the preset WASD + F / G (player 1) vs arrows + K / L
 * (player 2) (shmup_feat.md §4 "split-keyboard preset"); `WebInput` drives a second keyboard
 * source with {@link InputProfile.splitTables}.
 *
 * **Implements.**
 * - shmup_feat.md §4 — remote-first rules 2–3 and 8 (tunable per device, menus fully
 *   D-pad + OK + Back navigable), [P1] rebinding per device (keyboard / each gamepad / remote)
 *   with conflict detection, reset to defaults and persistence (M2-16 — the data side was there
 *   since M1-05), [P1] SOCD resolution chosen by the player (M2-16), the [P1] split-keyboard preset
 *   for 2-player co-op (M2-06)
 * - shmup_feat.md §21 — controls options (the profile choice — M1-17; rebinding, SOCD, the
 *   remote's release debounce — M2-16) and the accessibility "full remapping"
 *
 * **Public API.** {@link InputProfile}, {@link ProfileBindings}, {@link ContextTables},
 * {@link InputProfileDevice}, {@link INPUT_PROFILE_DEVICES}, {@link KEY_PROFILE_DEVICES},
 * {@link INPUT_PROFILES_KIND}, {@link REQUIRED_CONTEXT_ACTIONS}, {@link SYSTEM_REMOTE_KEYS},
 * {@link InputProfilesResult}, {@link parseInputProfiles}, {@link loadInputProfiles},
 * {@link InputProfileRegistry}, {@link createInputProfileRegistry}, {@link chooseInputProfile},
 * {@link overrideInputTuning}, {@link selectableKeyProfiles}, {@link KeySpace},
 * {@link inputProfileChoices}, {@link DEFAULT_PROFILE_SUFFIX}, {@link DEFAULT_KEYBOARD_PROFILE_ID},
 * {@link DEFAULT_REMOTE_PROFILE_ID}, {@link DEFAULT_WEBOS_PROFILE_ID},
 * {@link DEFAULT_GAMEPAD_PROFILE_ID},
 * {@link INPUT_PROFILE_STORAGE_KEY}, {@link loadInputProfileChoice},
 * {@link saveInputProfileChoice}; M2-16: {@link InputCustomization}, {@link customizeInputProfile},
 * {@link applyBindingOverride}, {@link actionTokens}, {@link rebindAction}, {@link RebindResult},
 * {@link resetBindings}, {@link findBindingConflicts}, {@link BindingConflict},
 * {@link captureToken}, {@link CapturedInput}, {@link bindingTokenLabel},
 * {@link bindingKeysLabel}, {@link RESERVED_BINDING_TOKENS}.
 *
 * @module
 */
import {
  ACTION_NAMES,
  Action,
  BINDING_TOKEN_PATTERN,
  CONTENT_FORMAT_VERSION,
  INPUT_CONTEXTS,
  MAX_ACTION_TOKENS,
  REBINDABLE_ACTIONS,
  RebindStatus,
  defineModule,
  s,
  type ActionMask,
  type ActionName,
  type BindingOverrides,
  type ContentFile,
  type ContextBindingOverride,
  type InputContext,
  type InputProfileChoice,
  type PlatformStorage,
  type ProfileBindingOverride,
  type ValidationIssue,
} from '@shmup/core';
import type { KeyBindings } from '../keymap/index.js';
import {
  DIAGONAL_POLICIES,
  MAX_RELEASE_DEBOUNCE_TICKS,
  SOCD_POLICIES,
  type InputTuning,
  type SocdPolicy,
} from '../remote/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'rebind',
  status: 'implemented',
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

/**
 * Id of the profile the **LG webOS** app starts with (plan M3-03,
 * `content/input/webos.input-profiles.json`). A separate profile rather than a second label on the
 * Tizen one: webOS' Back is **461** where Tizen's is 10009 (shmup_tech.md §3.3), its Play/Pause is
 * 415 / 19, and it registers no keys at all (there is no `tvinputdevice` equivalent).
 */
export const DEFAULT_WEBOS_PROFILE_ID = 'webos-remote-safe';

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
  /**
   * The `Platform.id`s whose Options screen may offer this profile (M3-03) — **empty means every
   * host**, which is what the keyboard and gamepad profiles use.
   *
   * @remarks
   * The two TV hosts read the same `content/input/`, and their remotes disagree about Back (Tizen
   * 10009, webOS 461 — shmup_tech.md §3.3). Without this a Tizen player could pick the webOS
   * profile in CONTROLS and be left with no Back at all, which no rebinding guard catches because
   * the profile itself is complete. {@link selectableKeyProfiles} applies it.
   */
  readonly hosts: readonly string[];
  /** The compiled tables per context. */
  readonly tables: Readonly<Record<InputContext, ContextTables>>;
  /**
   * The **split keyboard**'s second half (M2-06 — `keyboard` profiles only, e.g.
   * `keyboard-split`): the binding tables of player 2's half of the keyboard, per context, as
   * written. {@link InputProfile.context} is then player 1's half. Absent = one keyboard for one
   * player.
   */
  readonly split?: Readonly<Record<InputContext, ProfileBindings>>;
  /**
   * The compiled tables of {@link InputProfile.split} (`WebInput` drives a second keyboard source
   * with them — player 2's seat), or `null` / absent without a split.
   */
  readonly splitTables?: Readonly<Record<InputContext, ContextTables>> | null;
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
const PROFILE_SCHEMA = s.object(
  {
    id: s.str({ maxLength: 64, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
    label: s.str({ maxLength: 40 }),
    device: s.enumOf(INPUT_PROFILE_DEVICES),
    context: s.object({ game: BINDINGS_SCHEMA, menu: BINDINGS_SCHEMA }),
    split: s.object({ game: BINDINGS_SCHEMA, menu: BINDINGS_SCHEMA }),
    releaseDebounceTicks: s.int({ min: 0, max: MAX_RELEASE_DEBOUNCE_TICKS }),
    diagonals: s.enumOf(DIAGONAL_POLICIES),
    socd: s.enumOf(SOCD_POLICIES),
    singleKey: s.bool(),
    register: s.array(s.str({ maxLength: 40, pattern: /^[A-Za-z][A-Za-z0-9]*$/ }), { max: 32 }),
    hosts: s.array(s.str({ maxLength: 16, pattern: /^[a-z]+$/ }), { max: 8 }),
  },
  { optional: ['split', 'singleKey', 'hosts'] },
);

/** A whole `input-profiles` file. */
const FILE_SCHEMA = s.object({
  formatVersion: s.int({ min: CONTENT_FORMAT_VERSION, max: CONTENT_FORMAT_VERSION }),
  kind: s.enumOf([INPUT_PROFILES_KIND] as const),
  profiles: s.array(PROFILE_SCHEMA, { min: 1 }),
});

/** A parsed (not yet compiled) profile entry. */
type ParsedProfile = Omit<InputProfile, 'tables' | 'splitTables'>;

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
  return Object.freeze({
    ...profile,
    // Optional in the file (M3-02b): absent means the device tracks every key.
    singleKey: profile.singleKey === true,
    // Optional in the file (M3-03): absent means every host may offer the profile.
    hosts: Object.freeze(profile.hosts ?? []),
    tables: compileContexts(profile.context),
    splitTables: profile.split === undefined ? null : compileContexts(profile.split),
  });
}

/**
 * Compiles both contexts of one binding set (a profile's `context`, or its `split` half).
 *
 * @param context - The bindings per context.
 * @returns The frozen tables per context.
 */
function compileContexts(
  context: Readonly<Record<InputContext, ProfileBindings>>,
): Readonly<Record<InputContext, ContextTables>> {
  const { game, menu } = context;
  return Object.freeze({
    game: Object.freeze({ keys: compileKeys(game, menu), buttons: compileButtons(game) }),
    menu: Object.freeze({ keys: compileKeys(menu, game), buttons: compileButtons(menu) }),
  });
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
  const split = profile.split;
  if (split !== undefined) {
    if (profile.device !== 'keyboard') {
      issues.push({ path: path + '.split', message: 'only keyboard profiles split the keyboard' });
    } else {
      checkSplit(profile, path, issues);
    }
  }
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
  // The single-key model (M3-02b) describes a key device; gamepads are polled, never event-driven.
  if (gamepad && profile.singleKey) {
    issues.push({
      path: path + '.singleKey',
      message: 'must be false for a gamepad profile (gamepads are polled, not event-driven)',
    });
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
 * The checks of a split keyboard's second half (M2-06): no gamepad buttons, the required actions
 * of each context (player 2 must be able to move, pause and use the menus with its half), and no
 * key bound in both halves of the same context (one key must never drive both players).
 *
 * @param profile - A schema-valid keyboard entry with a `split`.
 * @param path - JSON path of the entry.
 * @param issues - Collector (document-relative paths).
 */
function checkSplit(profile: ParsedProfile, path: string, issues: ValidationIssue[]): void {
  const split = profile.split;
  if (split === undefined) return;
  for (const context of ['game', 'menu'] as const) {
    const bindings = split[context];
    const own = profile.context[context];
    const contextPath = path + '.split.' + context;
    if (bindings.buttons !== undefined) {
      issues.push({
        path: contextPath + '.buttons',
        message: 'only gamepad profiles bind buttons',
      });
    }
    let bound = 0;
    for (const table of [bindings.byCode, bindings.byKeyCode]) {
      for (const key of Object.keys(table)) bound |= maskOf(table[key] ?? []);
    }
    const missing = REQUIRED_CONTEXT_ACTIONS[context].filter(
      (name) => (bound & Action[name]) === 0,
    );
    if (missing.length > 0) {
      issues.push({ path: contextPath, message: 'must bind ' + missing.join(', ') });
    }
    for (const code of Object.keys(bindings.byCode)) {
      if (Object.prototype.hasOwnProperty.call(own.byCode, code)) {
        issues.push({
          path: contextPath + '.byCode.' + code,
          message: 'is bound in both halves of the keyboard',
        });
      }
    }
    for (const key of Object.keys(bindings.byKeyCode)) {
      if (Object.prototype.hasOwnProperty.call(own.byKeyCode, key)) {
        issues.push({
          path: contextPath + '.byKeyCode.' + key,
          message: 'is bound in both halves of the keyboard',
        });
      }
    }
  }
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
    singleKey: (overrides.singleKey ?? profile.singleKey) && profile.device !== 'gamepad',
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
 * (`'keyCode'`) the remote profiles of that TV (M3-03 — a profile's {@link InputProfile.hosts}
 * keeps webOS' `461` Back out of the Tizen list and Tizen's `10009` out of webOS'). Gamepad
 * profiles are never offered (every pad uses `gamepad-standard`; M2-16 made the pads rebindable
 * instead). Order: as in `profiles`.
 *
 * @param profiles - Every profile (the registry's).
 * @param keySpace - How the host's keys arrive.
 * @param host - The host's `Platform.id` (`'tizen'`, `'webos'`, `'web'`, …). `null` (the default)
 *   applies no host filter — every profile that binds the menu is offered, which is what the
 *   headless tests and the dev `?profile=` override want.
 * @returns The selectable profiles (a new array; the profiles themselves are shared).
 *
 * @example
 * ```ts
 * selectableKeyProfiles(registry.profiles, 'keyCode', 'tizen').map((p) => p.id);
 * // → ['tizen-remote-safe']
 * ```
 */
export function selectableKeyProfiles(
  profiles: readonly InputProfile[],
  keySpace: KeySpace,
  host: string | null = null,
): InputProfile[] {
  const out: InputProfile[] = [];
  for (const profile of profiles) {
    if (KEY_PROFILE_DEVICES.indexOf(profile.device) < 0) continue;
    if (host !== null && profile.hosts.length > 0 && profile.hosts.indexOf(host) < 0) continue;
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
 * platform's default marked with {@link DEFAULT_PROFILE_SUFFIX} (`REMOTE (DEFAULT)`).
 *
 * @param profiles - Every profile.
 * @param keySpace - How the host's keys arrive.
 * @param defaultId - The platform's default profile id.
 * @param extra - A profile to offer even when it is not selectable (e.g. a `?profile=` dev
 *   override in use), appended when missing; `null` for none.
 * @param host - The host's `Platform.id`, passed on to {@link selectableKeyProfiles} (M3-03);
 *   `null` (the default) applies no host filter.
 * @returns The choices (a new array of new objects, in {@link selectableKeyProfiles} order, then
 *   `extra`).
 *
 * @example
 * ```ts
 * inputProfileChoices(registry.profiles, 'keyCode', DEFAULT_REMOTE_PROFILE_ID, null, 'tizen');
 * // → [{ id: 'tizen-remote-safe', label: 'REMOTE (DEFAULT)' }]   (M3-02b: the one TV profile)
 * ```
 */
export function inputProfileChoices(
  profiles: readonly InputProfile[],
  keySpace: KeySpace,
  defaultId: string,
  extra: InputProfile | null = null,
  host: string | null = null,
): InputProfileChoice[] {
  const list = selectableKeyProfiles(profiles, keySpace, host);
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

// ------------------------------------------------------------------------------ rebinding (M2-16)

/**
 * The binding tokens the rebinding capture never binds: the keyboard's `Escape` and the TV remote's
 * Back (keyCode 10009). They **cancel** a capture instead (`WebInput.beginCapture`), and a
 * rebinding never takes them from the actions they have (Pause in the game, Back in menus) — the
 * way out of any screen stays where the player expects it (shmup_feat.md §4 rule 8, §23 Tizen
 * Back).
 */
export const RESERVED_BINDING_TOKENS: readonly string[] = Object.freeze([
  'code:Escape',
  'key:10009',
]);

/** A binding context's table as ordered token → action names entries (a working copy). */
type TokenTable = Array<{ token: string; actions: ActionName[] }>;

/**
 * Legacy key codes (US layout) of the `KeyboardEvent.code`s that are not a letter, a digit, a
 * numpad digit or an F key — {@link legacyKeyCode}.
 */
const CODE_KEY_CODES: Readonly<Record<string, number>> = Object.freeze({
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  NumpadEnter: 13,
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
  AltLeft: 18,
  AltRight: 18,
  Pause: 19,
  Escape: 27,
  Space: 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
  Semicolon: 186,
  Equal: 187,
  Comma: 188,
  Minus: 189,
  Period: 190,
  Slash: 191,
  Backquote: 192,
  BracketLeft: 219,
  Backslash: 220,
  BracketRight: 221,
  Quote: 222,
});

/**
 * The legacy `KeyboardEvent.keyCode` a desktop key with this `code` sends (US layout).
 *
 * @param code - A `KeyboardEvent.code`.
 * @returns The key code, or 0 when unknown.
 */
function legacyKeyCode(code: string): number {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (/^Numpad[0-9]$/.test(code)) return 48 + code.charCodeAt(6);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return 111 + Number(code.slice(1));
  return Object.prototype.hasOwnProperty.call(CODE_KEY_CODES, code) ? CODE_KEY_CODES[code] : 0;
}

/**
 * Whether two binding tokens name the same physical key: equal tokens, or a `code:<code>` and the
 * `key:<keyCode>` that key sends (`code:ArrowUp` and `key:38`). A profile may bind a key either way;
 * `findKeyActions` lets a `byCode` entry with actions hide the `byKeyCode` one.
 *
 * @param a - A binding token.
 * @param b - Another.
 * @returns `true` when one key press reaches both.
 */
function sameKey(a: string, b: string): boolean {
  if (a === b) return true;
  const code = a.indexOf('code:') === 0 ? a : b.indexOf('code:') === 0 ? b : '';
  const key = a.indexOf('key:') === 0 ? a : b.indexOf('key:') === 0 ? b : '';
  if (code === '' || key === '') return false;
  const keyCode = legacyKeyCode(code.slice(5));
  return keyCode > 0 && keyCode === Number(key.slice(4));
}

/**
 * Whether a token is one of the {@link RESERVED_BINDING_TOKENS} (or the same key as one).
 *
 * @param token - A binding token.
 * @returns `true` for Escape and the remote's Back.
 */
function isReserved(token: string): boolean {
  return RESERVED_BINDING_TOKENS.some((reserved) => sameKey(reserved, token));
}

/**
 * Whether one binding table (as written) lists a key — by that token or the same key's other
 * kind of token ({@link sameKey}) — whatever actions it has (even none).
 *
 * @param bindings - The binding table.
 * @param token - A binding token.
 * @returns `true` when the table knows the key.
 */
function bindsKey(bindings: ProfileBindings, token: string): boolean {
  for (const kind of ['byCode', 'byKeyCode'] as const) {
    for (const key of Object.keys(bindings[kind])) {
      if (sameKey(tokenOf(kind, key), token)) return true;
    }
  }
  return false;
}

/**
 * Whether a key is player 2's on a split keyboard (M2-06): the profile's `split` half binds it in
 * that context. Player 1's half may never take it — one key must never drive both players (the
 * content check `checkSplit` holds the content to the same rule).
 *
 * @param profile - The profile.
 * @param context - The binding context.
 * @param token - A binding token.
 * @returns `true` when the split half binds the key.
 */
function splitBinds(profile: InputProfile, context: InputContext, token: string): boolean {
  return profile.split !== undefined && bindsKey(profile.split[context], token);
}

/**
 * Whether a token table entry's actions are ever triggered: a `key:<keyCode>` entry is hidden when
 * the same key's `code:` entry has actions (`findKeyActions` looks `byCode` up first).
 *
 * @param table - The token table.
 * @param entry - One of its entries.
 * @returns `true` when a press of the key reaches the entry's actions.
 */
function reaches(table: TokenTable, entry: TokenTable[number]): boolean {
  if (entry.token.indexOf('key:') !== 0) return true;
  return !table.some(
    (other) =>
      other.actions.length > 0 &&
      other.token.indexOf('code:') === 0 &&
      sameKey(other.token, entry.token),
  );
}

/**
 * The binding token of a table key: `code:<code>`, `key:<keyCode>` or `button:<index>`.
 *
 * @param kind - Which table of {@link ProfileBindings} the key comes from.
 * @param key - The table key.
 * @returns The token.
 */
function tokenOf(kind: 'byCode' | 'byKeyCode' | 'buttons', key: string): string {
  return (kind === 'byCode' ? 'code:' : kind === 'byKeyCode' ? 'key:' : 'button:') + key;
}

/**
 * One context of a profile as a token table (in file order: `byCode`, `byKeyCode`, `buttons`).
 *
 * @param bindings - The context's bindings as written.
 * @returns A fresh working copy.
 */
function tokenTable(bindings: ProfileBindings): TokenTable {
  const out: TokenTable = [];
  for (const kind of ['byCode', 'byKeyCode', 'buttons'] as const) {
    const table = bindings[kind] ?? {};
    for (const key of Object.keys(table)) {
      out.push({ token: tokenOf(kind, key), actions: (table[key] ?? []).slice() });
    }
  }
  return out;
}

/**
 * Whether a token can be bound on a device: gamepad profiles bind `button:` tokens only, key
 * profiles `code:` / `key:` tokens only.
 *
 * @param device - The profile's device.
 * @param token - A binding token.
 * @returns `true` when the profile's tables can hold it.
 */
function tokenFits(device: InputProfileDevice, token: string): boolean {
  if (!BINDING_TOKEN_PATTERN.test(token)) return false;
  const button = token.indexOf('button:') === 0;
  return device === 'gamepad' ? button : !button;
}

/**
 * Applies one context's override to a token table: every overridden action leaves every token,
 * then joins the tokens its override lists (tokens the device cannot hold and keys of a split
 * keyboard's player-2 half are skipped; a token the table lacks is appended).
 *
 * @param table - The working copy (changed in place).
 * @param override - The context's override.
 * @param profile - The profile.
 * @param context - The binding context.
 */
function applyContextOverride(
  table: TokenTable,
  override: ContextBindingOverride,
  profile: InputProfile,
  context: InputContext,
): void {
  const names = ACTION_NAMES.filter((name) => override[name] !== undefined);
  for (const entry of table) entry.actions = entry.actions.filter((a) => names.indexOf(a) < 0);
  for (const name of names) {
    for (const token of override[name] ?? []) {
      if (!tokenFits(profile.device, token) || splitBinds(profile, context, token)) continue;
      let entry = table.find((e) => e.token === token);
      if (entry === undefined) {
        entry = { token, actions: [] };
        table.push(entry);
      }
      if (entry.actions.indexOf(name) < 0) entry.actions.push(name);
    }
  }
}

/**
 * Turns a token table back into written bindings.
 *
 * @param table - The token table.
 * @param gamepad - Whether it is a gamepad profile's (only then `buttons` is written).
 * @returns Frozen bindings.
 */
function bindingsOf(table: TokenTable, gamepad: boolean): ProfileBindings {
  const byCode: Record<string, readonly ActionName[]> = {};
  const byKeyCode: Record<string, readonly ActionName[]> = {};
  const buttons: Record<string, readonly ActionName[]> = {};
  for (const entry of table) {
    const colon = entry.token.indexOf(':');
    const kind = entry.token.slice(0, colon);
    const key = entry.token.slice(colon + 1);
    const actions = Object.freeze(entry.actions.slice());
    if (kind === 'code') byCode[key] = actions;
    else if (kind === 'key') byKeyCode[key] = actions;
    else buttons[key] = actions;
  }
  const out: { byCode: typeof byCode; byKeyCode: typeof byKeyCode; buttons?: typeof buttons } = {
    byCode: Object.freeze(byCode),
    byKeyCode: Object.freeze(byKeyCode),
  };
  if (gamepad) out.buttons = Object.freeze(buttons);
  return Object.freeze(out);
}

/**
 * Whether a token table binds every action a context requires ({@link REQUIRED_CONTEXT_ACTIONS})
 * to a key that reaches it — a `key:` entry hidden by the same key's `code:` entry does not count
 * ({@link reaches}).
 *
 * @param table - The token table.
 * @param context - Its context.
 * @returns `true` when nothing required is missing.
 */
function bindsRequired(table: TokenTable, context: InputContext): boolean {
  for (const name of REQUIRED_CONTEXT_ACTIONS[context]) {
    if (!table.some((entry) => entry.actions.indexOf(name) >= 0 && reaches(table, entry))) {
      return false;
    }
  }
  return true;
}

/**
 * The player's input settings a profile is customised with (M2-16) — the `core/config`
 * `InputOptions` fields `@shmup/input-web` applies.
 */
export interface InputCustomization {
  /** SOCD policy for every profile, or `null` for each profile's own. */
  readonly socd: SocdPolicy | null;
  /** Release debounce of key profiles in ticks, or `null` for the profile's own. */
  readonly releaseDebounce: number | null;
  /** The rebinding, by profile id. */
  readonly bindings: BindingOverrides;
}

/**
 * A copy of a profile with the player's rebinding of it applied (M2-16): per context, each
 * overridden action's keys are replaced by the override's; the tables are recompiled.
 *
 * @remarks
 * Tokens the device cannot hold (a `button:` on a key profile, a key on a gamepad profile) are
 * skipped, and so are the keys a split keyboard's second half binds in the context (M2-06 — one key
 * never drives both players). A context whose override would leave an action it requires without a
 * key that reaches it ({@link REQUIRED_CONTEXT_ACTIONS}; a `key:<keyCode>` hidden by the same key's
 * `code:` entry does not count — a hand-edited or stale save) keeps the profile's own table, so the
 * player can never be locked out. A split keyboard's second half is not rebound. A cold path (a
 * rebinding, a profile switch, boot).
 *
 * @param profile - The profile (the registry's, as written in the content).
 * @param override - Its override (`undefined` = none: the profile itself is returned).
 * @returns The rebound profile (same id, label, device, tuning, split).
 *
 * @example
 * ```ts
 * const bound = applyBindingOverride(profile, { game: { Shot: ['code:KeyJ'] } });
 * bound.tables.game.keys.byCode.KeyJ; // → Action.Shot
 * ```
 */
export function applyBindingOverride(
  profile: InputProfile,
  override: ProfileBindingOverride | undefined,
): InputProfile {
  if (override === undefined || (override.game === undefined && override.menu === undefined)) {
    return profile;
  }
  const gamepad = profile.device === 'gamepad';
  const context: Record<InputContext, ProfileBindings> = {
    game: profile.context.game,
    menu: profile.context.menu,
  };
  for (const name of INPUT_CONTEXTS) {
    const own = override[name];
    if (own === undefined) continue;
    const table = tokenTable(profile.context[name]);
    applyContextOverride(table, own, profile, name);
    if (bindsRequired(table, name)) context[name] = bindingsOf(table, gamepad);
  }
  const parsed: ParsedProfile = { ...profile, context: Object.freeze(context) };
  return compileProfile(parsed);
}

/**
 * A copy of a profile with the player's input settings applied (M2-16 — the Options screen's
 * CONTROLS): the rebinding of that profile ({@link applyBindingOverride}), the SOCD policy and —
 * for a key profile — the release debounce ({@link overrideInputTuning}).
 *
 * @param profile - The profile as written in the content.
 * @param settings - The player's settings (the save's `options.input`).
 * @returns The profile to hand `WebInput.setProfile` (the same id).
 *
 * @example
 * ```ts
 * input.setProfile(customizeInputProfile(remote, save.options.input));
 * ```
 */
export function customizeInputProfile(
  profile: InputProfile,
  settings: InputCustomization,
): InputProfile {
  const bound = applyBindingOverride(profile, settings.bindings[profile.id]);
  if (settings.socd === null && settings.releaseDebounce === null) return bound;
  return overrideInputTuning(bound, {
    socd: settings.socd ?? bound.socd,
    releaseDebounceTicks:
      settings.releaseDebounce === null || profile.device === 'gamepad'
        ? bound.releaseDebounceTicks
        : settings.releaseDebounce,
  });
}

/**
 * The binding tokens an action has in a profile's context (with its override applied), in table
 * order — only keys that reach it (a `key:<keyCode>` hidden by the same key's `code:` entry is
 * left out: the rebind screen never shows a key that does nothing).
 *
 * @param profile - The profile as written.
 * @param override - Its override, if any.
 * @param context - The binding context.
 * @param action - The action.
 * @returns The tokens (a new array; empty when unbound).
 */
export function actionTokens(
  profile: InputProfile,
  override: ProfileBindingOverride | undefined,
  context: InputContext,
  action: ActionName,
): string[] {
  const bound = applyBindingOverride(profile, override);
  const table = tokenTable(bound.context[context]);
  const out: string[] = [];
  for (const entry of table) {
    if (entry.actions.indexOf(action) >= 0 && reaches(table, entry)) out.push(entry.token);
  }
  return out;
}

/** A key or button bound to more than one action of a context ({@link findBindingConflicts}). */
export interface BindingConflict {
  /** The binding token. */
  readonly token: string;
  /** The rebindable actions it triggers (two or more). */
  readonly actions: readonly ActionName[];
}

/**
 * The conflicts of a profile's context: keys or buttons that trigger two or more of the context's
 * rebindable actions (`core/ui` `REBINDABLE_ACTIONS`) — e.g. the split keyboard's `G` (Special +
 * Speed). A rebinding does not create one for the key it binds ({@link rebindAction} moves or
 * swaps keys instead); the content may have some on purpose.
 *
 * @param profile - The profile (with any override already applied).
 * @param context - The binding context.
 * @returns The conflicts, in table order (a new array).
 */
export function findBindingConflicts(
  profile: InputProfile,
  context: InputContext,
): BindingConflict[] {
  const rebindable = REBINDABLE_ACTIONS[context];
  const out: BindingConflict[] = [];
  for (const entry of tokenTable(profile.context[context])) {
    const actions = entry.actions.filter((a) => rebindable.indexOf(a) >= 0);
    if (actions.length > 1) out.push({ token: entry.token, actions: Object.freeze(actions) });
  }
  return out;
}

/** What {@link rebindAction} returns. */
export interface RebindResult {
  /** The overrides afterwards (the same object when nothing changed). */
  readonly overrides: BindingOverrides;
  /** What happened (a `core/ui` `RebindStatus` code). */
  readonly status: number;
  /**
   * The other action the key was taken from (`Moved`, `Swapped`) or that would have been left
   * without a key (`Refused`), else `null`.
   */
  readonly other: ActionName | null;
}

/**
 * Rebinds one action of a profile's context to a key or button (M2-16 — the Options screen's
 * rebind capture), with **conflict detection**.
 *
 * @remarks
 * The action's keys become the captured `token` (plus any {@link RESERVED_BINDING_TOKENS} it had —
 * those never move). When another action of the context already has that key (a conflict — by the
 * same token, or by the same key's other kind of token: `code:ArrowUp` and `key:38` are one key) it
 * loses it: if it keeps other keys the result is `Moved`; if not it takes the action's old keys —
 * `Swapped` (so no action is left unbound); if the action had no old keys to give and the other one
 * is required in the context ({@link REQUIRED_CONTEXT_ACTIONS}) nothing changes: `Refused`; a
 * reserved token ({@link RESERVED_BINDING_TOKENS}), one the device cannot hold (a key on a gamepad
 * profile) or a key of a split keyboard's player-2 half in the context (M2-06 — one key never drives
 * both players) changes nothing either: `Rejected`. Binding the token the action already has alone
 * (and no other action has) is `Unchanged`. The override of the context then lists the whole key
 * set of every action that changed, merged into the profile's other overrides. Never throws; a cold
 * path.
 *
 * @param profile - The profile as written in the content.
 * @param overrides - Every profile's overrides (the save's `options.input.bindings`).
 * @param context - The binding context.
 * @param action - The action to rebind.
 * @param token - The captured key or button ({@link captureToken}).
 * @returns The new overrides, the outcome and the other action involved.
 *
 * @example
 * ```ts
 * const result = rebindAction(keyboard, bindings, 'game', 'Shot', 'code:KeyX');
 * result.status; // → RebindStatus.Swapped (X was Sub's only key: Sub gets Z and Space)
 * ```
 */
export function rebindAction(
  profile: InputProfile,
  overrides: BindingOverrides,
  context: InputContext,
  action: ActionName,
  token: string,
): RebindResult {
  const unchanged = (status: number, other: ActionName | null = null): RebindResult => ({
    overrides,
    status,
    other,
  });
  if (
    !tokenFits(profile.device, token) ||
    isReserved(token) ||
    splitBinds(profile, context, token)
  ) {
    return unchanged(RebindStatus.Rejected);
  }
  const current = overrides[profile.id];
  const table = tokenTable(applyBindingOverride(profile, current).context[context]);
  const keysOf = (name: ActionName): string[] =>
    table.filter((e) => e.actions.indexOf(name) >= 0).map((e) => e.token);
  // The actions the key already triggers — by this token or by the same key's other kind of token
  // (`code:ArrowUp` holds `key:38` too: a code entry with actions hides the key-code entry).
  const holders: ActionName[] = [];
  for (const entry of table) {
    if (!sameKey(entry.token, token)) continue;
    for (const name of entry.actions) {
      if (name !== action && holders.indexOf(name) < 0) holders.push(name);
    }
  }
  const old = keysOf(action);
  if (holders.length === 0 && old.length === 1 && old[0] === token) {
    return unchanged(RebindStatus.Unchanged);
  }
  const reserved = old.filter(isReserved);
  const movable = old.filter((t) => !isReserved(t) && !sameKey(t, token));
  const next: Partial<Record<ActionName, string[]>> = {};
  next[action] = reserved.concat([token]);
  let status: number = RebindStatus.Bound;
  let other: ActionName | null = null;
  for (const name of holders) {
    const left = keysOf(name).filter((t) => !sameKey(t, token));
    if (other === null) other = name;
    if (left.length > 0) {
      next[name] = left;
      if (status === RebindStatus.Bound) status = RebindStatus.Moved;
    } else if (movable.length > 0) {
      next[name] = movable.slice();
      status = RebindStatus.Swapped;
    } else if (REQUIRED_CONTEXT_ACTIONS[context].indexOf(name) >= 0) {
      return unchanged(RebindStatus.Refused, name);
    } else {
      next[name] = [];
      if (status === RebindStatus.Bound) status = RebindStatus.Moved;
    }
  }
  const merged: Record<string, readonly string[]> = {};
  const existing = current === undefined ? undefined : current[context];
  if (existing !== undefined) {
    for (const name of ACTION_NAMES) {
      const list = existing[name];
      if (list !== undefined) merged[name] = list;
    }
  }
  for (const name of ACTION_NAMES) {
    const list = next[name];
    if (list !== undefined) merged[name] = Object.freeze(list.slice(0, MAX_ACTION_TOKENS));
  }
  const profileOverride: { game?: ContextBindingOverride; menu?: ContextBindingOverride } = {};
  if (current?.game !== undefined) profileOverride.game = current.game;
  if (current?.menu !== undefined) profileOverride.menu = current.menu;
  profileOverride[context] = Object.freeze(merged);
  const all: Record<string, ProfileBindingOverride> = {};
  for (const id of Object.keys(overrides)) all[id] = overrides[id];
  all[profile.id] = Object.freeze(profileOverride);
  return { overrides: Object.freeze(all), status, other };
}

/**
 * Resets a profile's rebinding to the content's bindings (M2-16 — the rebind screen's RESET).
 *
 * @param overrides - Every profile's overrides.
 * @param profileId - The profile.
 * @param context - The context to reset, or `null` for both.
 * @returns The new overrides (the same object when there was nothing to reset).
 *
 * @example
 * ```ts
 * resetBindings(bindings, 'keyboard-default', 'game');
 * ```
 */
export function resetBindings(
  overrides: BindingOverrides,
  profileId: string,
  context: InputContext | null,
): BindingOverrides {
  const current = overrides[profileId];
  if (current === undefined) return overrides;
  if (context !== null && current[context] === undefined) return overrides;
  const all: Record<string, ProfileBindingOverride> = {};
  for (const id of Object.keys(overrides)) {
    if (id !== profileId) all[id] = overrides[id];
  }
  if (context !== null) {
    const keep: { game?: ContextBindingOverride; menu?: ContextBindingOverride } = {};
    const other = context === 'game' ? 'menu' : 'game';
    if (current[other] !== undefined) keep[other] = current[other];
    if (keep[other] !== undefined) all[profileId] = Object.freeze(keep);
  }
  return Object.freeze(all);
}

/** What a rebinding capture caught (`WebInput.capture` — M2-16). */
export interface CapturedInput {
  /** `KeyboardEvent.code` of a captured key (`''` for a TV remote key or a button). */
  readonly code: string;
  /** Legacy key code of a captured key (0 for a button). */
  readonly keyCode: number;
  /** Standard-mapping index of a captured gamepad button (-1 for a key). */
  readonly button: number;
}

/**
 * Whether one of a profile's contexts binds a key of one table to at least one action.
 *
 * @param profile - The profile (with any override applied).
 * @param contexts - The contexts to look in.
 * @param kind - The table.
 * @param key - The table key (`''` = none).
 * @returns `true` when a context gives the key an action.
 */
function hasActions(
  profile: InputProfile,
  contexts: readonly InputContext[],
  kind: 'byCode' | 'byKeyCode',
  key: string,
): boolean {
  if (key === '') return false;
  for (const context of contexts) {
    const table = profile.context[context][kind];
    if (Object.prototype.hasOwnProperty.call(table, key) && (table[key] ?? []).length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a key profile binds any key by its `KeyboardEvent.code` (in either context).
 *
 * @param profile - The profile (with any override applied).
 * @returns `true` for a profile with a `byCode` entry.
 */
function bindsByCode(profile: InputProfile): boolean {
  for (const context of INPUT_CONTEXTS) {
    if (Object.keys(profile.context[context].byCode).length > 0) return true;
  }
  return false;
}

/**
 * The binding token a captured key or button makes for a profile — the one a press of that key
 * reaches in the profile's tables, so the conflict detection of {@link rebindAction} sees the
 * action that has the key and the new binding is never hidden by an old one.
 *
 * @remarks
 * A gamepad profile takes the button (`button:<index>`). A key profile (`keyboard` or `remote`)
 * takes, in order: `code:<code>` when the context binds the key's `code` to an action (`byCode` is
 * looked up first, and a code entry with actions hides the key code); `key:<keyCode>` when it binds
 * the key's key code to an action; otherwise — a key the context does not use yet — `code:<code>`
 * when the key has a code and the profile binds by code at all (every `keyboard` profile, the web's
 * `keyboard-remote-emulation`), else `key:<keyCode>` (the TV remote's keys, which arrive without a
 * code, and the `tizen-remote-*` profiles, which bind key codes only).
 *
 * @param profile - The profile being rebound (as written in the content).
 * @param captured - What the capture caught.
 * @param context - The binding context being rebound (`undefined` = look in both).
 * @param override - The profile's current override (the save's `options.input.bindings[id]`),
 *   if any.
 * @returns The token, or `null` when the capture does not fit the profile (a key for a gamepad
 *   profile, a button for a key profile, a key without a usable code).
 *
 * @example
 * ```ts
 * captureToken(keyboardAsRemote, { code: 'ArrowUp', keyCode: 38, button: -1 }, 'menu');
 * // → 'code:ArrowUp' (the profile binds the arrows by code)
 * captureToken(tizenRemote, { code: '', keyCode: 427, button: -1 }, 'game'); // → 'key:427'
 * ```
 */
export function captureToken(
  profile: InputProfile,
  captured: CapturedInput,
  context?: InputContext,
  override?: ProfileBindingOverride,
): string | null {
  let token: string | null = null;
  if (profile.device === 'gamepad') {
    token = captured.button >= 0 ? 'button:' + String(captured.button) : null;
  } else if (captured.button < 0) {
    const bound = applyBindingOverride(profile, override);
    const contexts = context === undefined ? INPUT_CONTEXTS : [context];
    const code = captured.code;
    const keyCode = captured.keyCode > 0 ? String(captured.keyCode) : '';
    if (hasActions(bound, contexts, 'byCode', code)) token = 'code:' + code;
    else if (hasActions(bound, contexts, 'byKeyCode', keyCode)) token = 'key:' + keyCode;
    else if (code !== '' && (profile.device === 'keyboard' || bindsByCode(bound))) {
      token = 'code:' + code;
    } else if (keyCode !== '') token = 'key:' + keyCode;
  }
  return token !== null && BINDING_TOKEN_PATTERN.test(token) ? token : null;
}

/** Names of the TV remote's key codes (and the digits) in the rebind screen. */
const REMOTE_KEY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '13': 'OK',
  '37': '←',
  '38': '↑',
  '39': '→',
  '40': '↓',
  '8': 'BKSP',
  '27': 'ESC',
  '32': 'SPACE',
  '33': 'PG UP',
  '34': 'PG DN',
  '19': 'PAUSE',
  '403': 'RED',
  '404': 'GREEN',
  '405': 'YELLOW',
  '406': 'BLUE',
  '412': 'REW',
  '413': 'STOP',
  '415': 'PLAY',
  '417': 'FF',
  '427': 'CH+',
  '428': 'CH-',
  '10009': 'BACK',
  '10252': 'PLAY/PAUSE',
});

/** Names of `KeyboardEvent.code`s that are not a letter, a digit or an F key. */
const CODE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'SPACE',
  Enter: 'ENTER',
  NumpadEnter: 'NUM ENTER',
  Escape: 'ESC',
  Backspace: 'BKSP',
  Tab: 'TAB',
  ShiftLeft: 'L-SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT',
  AltRight: 'R-ALT',
  PageUp: 'PG UP',
  PageDown: 'PG DN',
  Home: 'HOME',
  End: 'END',
  Insert: 'INS',
  Delete: 'DEL',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
});

/** Names of the standard-mapping gamepad buttons (index order). */
const BUTTON_NAMES: readonly string[] = Object.freeze([
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'SELECT',
  'START',
  'L3',
  'R3',
  'D↑',
  'D↓',
  'D←',
  'D→',
  'HOME',
]);

/**
 * The name a binding token shows on the rebind screen (M2-16), in the bitmap font's glyphs: a
 * letter or digit key as itself (`Z`, `7`), arrows as `↑ ↓ ← →`, other keys spelt out (`SPACE`,
 * `L-SHIFT`, `NUM 3`), TV remote keys by their name (`OK`, `BACK`, `CH+`, `PLAY/PAUSE`), gamepad
 * buttons by the standard layout (`A`, `LB`, `START`, `D↑` …).
 *
 * @param token - A binding token.
 * @returns The name (upper case; `?` for a token that is not one).
 *
 * @example
 * ```ts
 * bindingTokenLabel('code:KeyZ');    // → 'Z'
 * bindingTokenLabel('key:10009');    // → 'BACK'
 * bindingTokenLabel('button:9');     // → 'START'
 * ```
 */
export function bindingTokenLabel(token: string): string {
  const colon = token.indexOf(':');
  if (colon < 0) return '?';
  const kind = token.slice(0, colon);
  const key = token.slice(colon + 1);
  if (kind === 'button') {
    const index = Number(key);
    return BUTTON_NAMES[index] ?? 'BTN ' + key;
  }
  if (kind === 'key') {
    if (Object.prototype.hasOwnProperty.call(REMOTE_KEY_NAMES, key)) return REMOTE_KEY_NAMES[key];
    const code = Number(key);
    if (code >= 48 && code <= 57) return String(code - 48);
    if (code >= 65 && code <= 90) return String.fromCharCode(code);
    return 'KEY ' + key;
  }
  if (kind !== 'code') return '?';
  if (Object.prototype.hasOwnProperty.call(CODE_NAMES, key)) return CODE_NAMES[key];
  if (/^Key[A-Z]$/.test(key)) return key.slice(3);
  if (/^Digit[0-9]$/.test(key)) return key.slice(5);
  if (/^Numpad[0-9]$/.test(key)) return 'NUM ' + key.slice(6);
  if (/^F[0-9]{1,2}$/.test(key)) return key;
  return key.toUpperCase().slice(0, 10);
}

/**
 * The keys of an action as the rebind screen shows them: up to `max` token names separated by
 * two spaces (`Z  SPACE`), `-` when the action has none.
 *
 * @param tokens - The action's tokens ({@link actionTokens}).
 * @param max - Most names shown (default 3; more are summarised with `+`).
 * @returns The label.
 */
export function bindingKeysLabel(tokens: readonly string[], max = 3): string {
  if (tokens.length === 0) return '-';
  const names: string[] = [];
  for (let i = 0; i < tokens.length && i < max; i++) names.push(bindingTokenLabel(tokens[i]));
  return names.join('  ') + (tokens.length > max ? ' +' : '');
}
