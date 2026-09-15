/**
 * The Tizen widget's `config.xml` variants and their validation (plan M2-17).
 *
 * `public/config.xml` is the **default** variant — what `pnpm build` ships: no Samsung metadata at
 * all. Two opt-in metadata entries make the other variants (the Vite config applies them to
 * `dist/config.xml` after the build; `scripts/check-bundle.mjs` validates whatever was built):
 *
 * - **Game mode** — `<tizen:metadata key="http://samsung.com/tv/metadata/use.game.mode"
 *   value="true"/>` (2022+ TVs; may switch the panel to its low-latency Game Mode — unverified for
 *   non-streaming apps, shmup_tech.md §2.3). For the on-device A/B latency test (plan §8.5): build
 *   with `pnpm --filter @shmup/tizen build:game-mode` (or `TIZEN_GAME_MODE=1`), package, install,
 *   measure; then the default build, and compare.
 * - **Gamepad check** — `<tizen:metadata key="http://samsung.com/tv/metadata/gamepad"
 *   value="dualshock4::usbgamepad"/>` (Samsung's gamepad guide: the TV checks at launch that one of
 *   the named pads is connected and **shows a popup when none is**). The game is remote-first, so
 *   no shipped variant names a pad; `TIZEN_GAMEPADS=<model>[::<model>…]` builds one for testing.
 *
 * Environment (read by {@link variantFromEnv}): `TIZEN_GAME_MODE=1` (or `true`),
 * `TIZEN_GAMEPADS=dualshock4::usbgamepad` (models separated by `::` or `,`).
 *
 * **Public API.** {@link applyConfigVariant}, {@link validateConfigXml}, {@link variantFromEnv},
 * {@link variantName}, {@link isDefaultVariant}, {@link GAME_MODE_METADATA_KEY},
 * {@link GAMEPAD_METADATA_KEY}, {@link KNOWN_METADATA_KEYS}, {@link REQUIRED_PRIVILEGES},
 * {@link GAME_MODE_BUILD_MODE}.
 *
 * @module
 */

/** Samsung metadata key of the panel's Game Mode (the opt-in A/B variant). */
export const GAME_MODE_METADATA_KEY = 'http://samsung.com/tv/metadata/use.game.mode';

/** Samsung metadata key of the launch-time gamepad check (value: models joined by `::`). */
export const GAMEPAD_METADATA_KEY = 'http://samsung.com/tv/metadata/gamepad';

/** Every metadata key a variant may carry. */
export const KNOWN_METADATA_KEYS = Object.freeze([GAME_MODE_METADATA_KEY, GAMEPAD_METADATA_KEY]);

/**
 * Privileges every variant must request: the extra remote keys (`tv.inputdevice`), remote logging
 * and live reload (`internet`) and Samsung's product info — the debug overlay's model and firmware
 * (`productinfo`, M2-17).
 */
export const REQUIRED_PRIVILEGES = Object.freeze([
  'http://tizen.org/privilege/internet',
  'http://tizen.org/privilege/tv.inputdevice',
  'http://developer.samsung.com/privilege/productinfo',
]);

/** The Vite mode that builds the game-mode variant (`vite build --mode game-mode`). */
export const GAME_MODE_BUILD_MODE = 'game-mode';

/** A gamepad model name as the metadata value lists it. */
const GAMEPAD_MODEL = /^[A-Za-z0-9_-]+$/;

/**
 * @typedef {object} ConfigVariant
 * @property {boolean} [gameMode] - Add the Game Mode metadata.
 * @property {string[]} [gamepads] - Gamepad models for the launch-time check (empty = none).
 */

/**
 * Reads the variant from the environment (and the Vite mode).
 *
 * @param {Record<string, string | undefined>} [env] - Environment (default `process.env`).
 * @param {string} [mode] - The Vite mode; {@link GAME_MODE_BUILD_MODE} turns game mode on.
 * @returns {Required<ConfigVariant>} The variant.
 *
 * @example
 * variantFromEnv({ TIZEN_GAME_MODE: '1' }); // → { gameMode: true, gamepads: [] }
 */
export function variantFromEnv(env = process.env, mode = '') {
  const flag = (env.TIZEN_GAME_MODE ?? '').trim().toLowerCase();
  const gamepads = (env.TIZEN_GAMEPADS ?? '')
    .split(/::|,/)
    .map((model) => model.trim())
    .filter((model) => model !== '');
  return {
    gameMode: flag === '1' || flag === 'true' || mode === GAME_MODE_BUILD_MODE,
    gamepads,
  };
}

/**
 * Whether a variant is the default (no metadata — `public/config.xml` as it is).
 *
 * @param {ConfigVariant} variant - The variant.
 * @returns {boolean} `true` for the default.
 */
export function isDefaultVariant(variant) {
  return variant.gameMode !== true && (variant.gamepads ?? []).length === 0;
}

/**
 * A variant's name for logs: `default`, `game-mode`, `gamepad` or `game-mode+gamepad`.
 *
 * @param {ConfigVariant} variant - The variant.
 * @returns {string} The name.
 *
 * @example
 * variantName(variantFromEnv({ TIZEN_GAMEPADS: 'usbgamepad' }, 'game-mode'));
 * // → 'game-mode+gamepad'
 */
export function variantName(variant) {
  const parts = [];
  if (variant.gameMode === true) parts.push('game-mode');
  if ((variant.gamepads ?? []).length > 0) parts.push('gamepad');
  return parts.length === 0 ? 'default' : parts.join('+');
}

/**
 * Applies a variant to `config.xml`: inserts its `<tizen:metadata/>` entries before `</widget>`.
 *
 * @param {string} xml - The default `config.xml` (without metadata).
 * @param {ConfigVariant} variant - The variant.
 * @returns {string} The variant's XML (the input unchanged for the default variant).
 * @throws {Error} When the XML has no `</widget>`, already carries metadata, or a gamepad model is
 *   not a plain name.
 *
 * @example
 * applyConfigVariant(xml, { gameMode: true }).includes('use.game.mode'); // → true
 */
export function applyConfigVariant(xml, variant) {
  if (isDefaultVariant(variant)) return xml;
  if (/<tizen:metadata\b/.test(stripComments(xml))) {
    throw new Error(
      'config.xml already has <tizen:metadata> entries; apply variants to the default',
    );
  }
  const end = xml.lastIndexOf('</widget>');
  if (end < 0) throw new Error('config.xml has no </widget>');
  const lines = [];
  if (variant.gameMode === true) {
    lines.push(`  <tizen:metadata key="${GAME_MODE_METADATA_KEY}" value="true"/>`);
  }
  const gamepads = variant.gamepads ?? [];
  if (gamepads.length > 0) {
    for (const model of gamepads) {
      if (!GAMEPAD_MODEL.test(model)) throw new Error(`bad gamepad model "${model}"`);
    }
    lines.push(`  <tizen:metadata key="${GAMEPAD_METADATA_KEY}" value="${gamepads.join('::')}"/>`);
  }
  return `${xml.slice(0, end)}${lines.join('\n')}\n${xml.slice(end)}`;
}

/**
 * Removes XML comments.
 *
 * @param {string} xml - The XML.
 * @returns {string} The XML without `<!-- … -->`.
 */
function stripComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Reads an attribute from an element's attribute text.
 *
 * @param {string} attributes - The text between the tag name and `>`.
 * @param {string} name - Attribute name.
 * @returns {string | undefined} The value.
 */
function attribute(attributes, name) {
  const match = new RegExp(`(?:^|\\s)${name.replace(/[:.]/g, '\\$&')}="([^"]*)"`).exec(attributes);
  return match === null ? undefined : match[1];
}

/**
 * Validates a `config.xml` (any variant): well-formed elements, the widget's required parts and
 * privileges, and the metadata entries.
 *
 * @remarks
 * A small structural check, not a full XML parser: it balances the element tags (comments, the XML
 * declaration and self-closing tags handled) and then checks the widget's contents with patterns:
 * a `<widget>` root in the W3C widgets namespace with the `tizen` namespace, one
 * `<tizen:application>` (a 10-character alphanumeric package that prefixes the id,
 * `required_version`), `<content src>`, `<icon src>`, `<name>`, exactly one `tv-samsung` profile,
 * {@link REQUIRED_PRIVILEGES}, and metadata only with {@link KNOWN_METADATA_KEYS}, each at most
 * once, game mode `"true"`, the gamepad list plain model names joined by `::`.
 *
 * @param {string} xml - The XML text.
 * @returns {string[]} Problems (empty when valid).
 *
 * @example
 * validateConfigXml(readFileSync('dist/config.xml', 'utf8')); // → []
 */
export function validateConfigXml(xml) {
  const problems = [];
  const body = stripComments(xml);
  if (!/^\s*<\?xml\b[^>]*\?>/.test(body)) problems.push('missing the <?xml … ?> declaration');
  const stack = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
  const text = body.replace(/^\s*<\?xml\b[^>]*\?>/, '');
  let rest = text;
  let match;
  while ((match = tag.exec(text)) !== null) {
    rest = rest.replace(match[0], '');
    const [, closing, name, , selfClosing] = match;
    if (closing === '/') {
      const open = stack.pop();
      if (open !== name) problems.push(`</${name}> closes <${open ?? 'nothing'}>`);
    } else if (selfClosing !== '/') {
      stack.push(name);
    }
  }
  if (stack.length > 0) problems.push(`unclosed <${stack.join('>, <')}>`);
  if (/[<>]/.test(rest)) problems.push('stray < or > outside a well-formed tag');

  /**
   * The attribute texts of every element with a name.
   *
   * @param {string} name - Element name.
   * @returns {string[]} Attribute texts.
   */
  const elements = (name) => {
    const found = [];
    const pattern = new RegExp(`<${name.replace(/[:.]/g, '\\$&')}\\b([^>]*?)\\/?>`, 'g');
    let element;
    while ((element = pattern.exec(body)) !== null) found.push(element[1]);
    return found;
  };

  const widget = elements('widget');
  if (widget.length !== 1) problems.push('exactly one <widget> root is required');
  else {
    if (attribute(widget[0], 'xmlns') !== 'http://www.w3.org/ns/widgets') {
      problems.push('<widget> must use xmlns="http://www.w3.org/ns/widgets"');
    }
    if (attribute(widget[0], 'xmlns:tizen') !== 'http://tizen.org/ns/widgets') {
      problems.push('<widget> must declare xmlns:tizen="http://tizen.org/ns/widgets"');
    }
    if (!/^\d+\.\d+\.\d+$/.test(attribute(widget[0], 'version') ?? '')) {
      problems.push('<widget version> must be major.minor.patch');
    }
  }
  const application = elements('tizen:application');
  if (application.length !== 1) problems.push('exactly one <tizen:application> is required');
  else {
    const id = attribute(application[0], 'id') ?? '';
    const pkg = attribute(application[0], 'package') ?? '';
    if (!/^[A-Za-z0-9]{10}$/.test(pkg)) problems.push('the package id must be 10 alphanumerics');
    if (!id.startsWith(`${pkg}.`) || id.length <= pkg.length + 1) {
      problems.push('the application id must be <package>.<name>');
    }
    if (attribute(application[0], 'required_version') === undefined) {
      problems.push('<tizen:application> needs required_version');
    }
  }
  if (attribute(elements('content')[0] ?? '', 'src') === undefined) {
    problems.push('<content src> is required');
  }
  if (attribute(elements('icon')[0] ?? '', 'src') === undefined)
    problems.push('<icon src> is required');
  if (!/<name>[^<]+<\/name>/.test(body)) problems.push('<name> is required');
  const profiles = elements('tizen:profile');
  if (profiles.length !== 1 || attribute(profiles[0], 'name') !== 'tv-samsung') {
    problems.push('exactly one <tizen:profile name="tv-samsung"/> is required');
  }
  const privileges = elements('tizen:privilege').map((attrs) => attribute(attrs, 'name'));
  for (const privilege of REQUIRED_PRIVILEGES) {
    if (privileges.indexOf(privilege) < 0) problems.push(`missing the ${privilege} privilege`);
  }

  const seen = new Set();
  for (const attrs of elements('tizen:metadata')) {
    const key = attribute(attrs, 'key') ?? '';
    const value = attribute(attrs, 'value');
    if (KNOWN_METADATA_KEYS.indexOf(key) < 0) {
      problems.push(`unknown metadata key "${key}"`);
      continue;
    }
    if (seen.has(key)) problems.push(`metadata "${key}" appears twice`);
    seen.add(key);
    if (key === GAME_MODE_METADATA_KEY && value !== 'true') {
      problems.push('the game-mode metadata value must be "true"');
    }
    if (key === GAMEPAD_METADATA_KEY) {
      const models = (value ?? '').split('::');
      if (models.some((model) => !GAMEPAD_MODEL.test(model))) {
        problems.push('the gamepad metadata value must be model names joined by "::"');
      }
    }
  }
  return problems;
}
