/**
 * The LG webOS app manifest (`public/appinfo.json`) and its validator (plan M3-03,
 * shmup_tech.md §3.3).
 *
 * `appinfo.json` is to a webOS `.ipk` what `config.xml` is to a Tizen `.wgt`: the launcher reads
 * the id, the title, the icons and the entry point from it, and `ares-package` refuses a build
 * whose manifest is malformed. No agent can run `ares-package`, so this validator is what stands
 * in for it — the same trade the Tizen build makes with `validateConfigXml`.
 *
 * **Public API.** {@link validateAppInfo}, {@link APPINFO_KEYS}, {@link APPINFO_ID_PATTERN},
 * {@link APPINFO_VERSION_PATTERN}; the TV render bench's stub (plan R0-02): {@link benchAppInfo},
 * {@link BENCH_APPINFO_ID}, {@link BENCH_APPINFO_TITLE}.
 *
 * @module
 */

/** Keys `appinfo.json` may carry (LG's web-app manifest; anything else is rejected as a typo). */
export const APPINFO_KEYS = Object.freeze([
  'id',
  'version',
  'vendor',
  'type',
  'main',
  'title',
  'appDescription',
  'icon',
  'largeIcon',
  'iconColor',
  'bgColor',
  'resolution',
  'disableBackHistoryAPI',
  'supportTouchMode',
  'requiredPermissions',
]);

/** App ids are reverse-DNS, lower case (`dev.shmupcup.game`). */
export const APPINFO_ID_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;

/** webOS versions are three numbers, like Tizen's widget version — never a pre-release tag. */
export const APPINFO_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * App id of the TV render bench's webOS stub (plan R0-02): its own id, so it installs next to the
 * game and never replaces it.
 */
export const BENCH_APPINFO_ID = 'dev.shmupcup.renderbench';

/** The bench's title in the launcher. */
export const BENCH_APPINFO_TITLE = 'Shmup Cup Bench';

/**
 * Turns the game's `appinfo.json` into the TV render bench's (plan R0-02 — `vite.bench.config.ts`
 * writes it to `dist-bench/appinfo.json`): the bench's id, title and description; version, icons
 * and the Back handling stay the game's.
 *
 * @param {string} text - The game's `appinfo.json`.
 * @returns {string} The bench's `appinfo.json` (2-space JSON, trailing newline).
 * @throws {SyntaxError} When the text is not JSON.
 *
 * @example
 * const bench = JSON.parse(benchAppInfo(readFileSync('public/appinfo.json', 'utf8')));
 * bench.id; // → 'dev.shmupcup.renderbench'
 */
export function benchAppInfo(text) {
  const json = JSON.parse(text);
  json.id = BENCH_APPINFO_ID;
  json.title = BENCH_APPINFO_TITLE;
  json.appDescription = 'The TV render benchmark (plan R0-02), not the game.';
  return JSON.stringify(json, null, 2) + '\n';
}

/**
 * Whether a value is a plain JSON object.
 *
 * @param {unknown} value - Any value.
 * @returns {value is Record<string, unknown>} `true` for non-null, non-array objects.
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates an `appinfo.json` document.
 *
 * @param {string} text - The file's contents.
 * @returns {string[]} Problems found, empty when the manifest is valid.
 *
 * @example
 * ```js
 * const problems = validateAppInfo(readFileSync('apps/webos/public/appinfo.json', 'utf8'));
 * if (problems.length > 0) throw new Error(problems.join('\n'));
 * ```
 */
export function validateAppInfo(text) {
  /** @type {string[]} */
  const problems = [];
  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return [`appinfo.json is not valid JSON: ${/** @type {Error} */ (error).message}`];
  }
  if (!isObject(json)) return ['appinfo.json must be a JSON object'];
  for (const key of Object.keys(json)) {
    if (APPINFO_KEYS.indexOf(key) < 0) problems.push(`appinfo.json: unknown field "${key}"`);
  }
  for (const key of ['id', 'version', 'vendor', 'type', 'main', 'title', 'icon', 'largeIcon']) {
    if (typeof json[key] !== 'string' || json[key] === '') {
      problems.push(`appinfo.json: "${key}" must be a non-empty string`);
    }
  }
  if (typeof json.id === 'string' && !APPINFO_ID_PATTERN.test(json.id)) {
    problems.push(`appinfo.json: "id" must be a reverse-DNS app id, got "${json.id}"`);
  }
  if (typeof json.version === 'string' && !APPINFO_VERSION_PATTERN.test(json.version)) {
    problems.push(
      `appinfo.json: "version" must be <major>.<minor>.<patch>, got "${String(json.version)}"`,
    );
  }
  if (json.type !== 'web') problems.push('appinfo.json: "type" must be "web"');
  if (json.main !== 'index.html') problems.push('appinfo.json: "main" must be "index.html"');
  if (json.resolution !== undefined && json.resolution !== '1920x1080') {
    problems.push('appinfo.json: "resolution" must be "1920x1080" (the game renders 384x216 x5)');
  }
  // The scene flow owns Back (title -> exit confirmation): webOS must not pop history behind us.
  if (json.disableBackHistoryAPI !== true) {
    problems.push('appinfo.json: "disableBackHistoryAPI" must be true (the game owns Back = 461)');
  }
  if (json.requiredPermissions !== undefined && !Array.isArray(json.requiredPermissions)) {
    problems.push('appinfo.json: "requiredPermissions" must be an array');
  }
  return problems;
}
