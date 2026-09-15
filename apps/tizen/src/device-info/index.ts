/**
 * # device-info — TV environment facts for diagnostics
 *
 * **Responsibility.** Collects the facts the week-one hardware checks need, for the debug overlay
 * and bug reports: `navigator.userAgent` (expect Chrome/69 on Tizen 5.5), `innerWidth` /
 * `innerHeight` / `devicePixelRatio` (expect 1920×1080 at 1), the WebGL version the renderer got
 * and its `MAX_TEXTURE_SIZE`, and Samsung's `webapis.productinfo` model / model code / firmware —
 * tolerated when absent (a desktop browser, a missing privilege). Mirrors what tools/input-probe
 * reports.
 *
 * - {@link collectDeviceInfo} is pure: it reads the sources it is handed (tests pass fakes).
 * - {@link loadWebapis} loads Samsung's `$WEBAPIS/webapis/webapis.js` (the Tizen runtime resolves
 *   the `$WEBAPIS` path; `webapis.productinfo` needs the
 *   `http://developer.samsung.com/privilege/productinfo` privilege in `config.xml`) by adding a
 *   script tag — only when `window.tizen` exists, so a desktop browser never requests the file (a
 *   404 would be a console error), and never twice.
 * - {@link formatDeviceLine} makes the one-line summary the debug overlay draws under its panel
 *   (M2-17: `tizenDebugTools` collects the facts when the remote's unlock sequence opens the tools,
 *   so release builds and locked dev builds never load `webapis.js`).
 *
 * **Implements.**
 * - shmup_tech.md §2.7 "First thing to run on the device", §6 week-one checks 1, 3, 12
 * - input_probe_spec.md question 7 (environment)
 * - shmup_feat.md §24 — debug overlay
 *
 * **Public API.** {@link collectDeviceInfo}, {@link DeviceInfo}, {@link DeviceInfoSources},
 * {@link parseChromeMajor}, {@link readProductInfo}, {@link ProductInfo}, {@link ProductInfoLike},
 * {@link WebapisLike}, {@link GlParameterSource}, {@link readMaxTextureSize}, {@link loadWebapis},
 * {@link formatDeviceLine}, {@link WEBAPIS_SCRIPT_URL}, {@link WEBAPIS_TIMEOUT_MS}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'device-info',
  status: 'implemented',
  specRefs: ['shmup_tech.md §2.7', 'shmup_tech.md §6', 'input_probe_spec.md', 'shmup_feat.md §24'],
});

/** Samsung's product API script; the Tizen web runtime resolves `$WEBAPIS`. */
export const WEBAPIS_SCRIPT_URL = '$WEBAPIS/webapis/webapis.js';

/** How long {@link loadWebapis} waits for the script before giving up, in ms. */
export const WEBAPIS_TIMEOUT_MS = 3000;

/** Environment snapshot. */
export interface DeviceInfo {
  /** `navigator.userAgent` verbatim. */
  readonly userAgent: string;
  /** Chrome major version parsed from the user agent (69 on Tizen 5.5), `null` if absent. */
  readonly chromeMajor: number | null;
  /** `innerWidth` in CSS pixels (expect 1920). */
  readonly cssWidth: number;
  /** `innerHeight` in CSS pixels (expect 1080). */
  readonly cssHeight: number;
  /** `window.devicePixelRatio` (expect 1). */
  readonly devicePixelRatio: number;
  /** WebGL version the renderer obtained, `null` without WebGL. */
  readonly webglVersion: 1 | 2 | null;
  /** `MAX_TEXTURE_SIZE` of the WebGL context, `null` without WebGL. */
  readonly maxTextureSize: number | null;
  /** Samsung `webapis.productinfo` model name (`getRealModel`, else `getModel`), or `null`. */
  readonly model: string | null;
  /** Samsung `webapis.productinfo` model code (`getModelCode`, e.g. `20_KANTSU2`), or `null`. */
  readonly modelCode: string | null;
  /** Samsung `webapis.productinfo` firmware version, `null` when unavailable. */
  readonly firmware: string | null;
}

/** The parts of `webapis.productinfo` read here (each may throw `SecurityError`). */
export interface ProductInfoLike {
  /**
   * Full model name, e.g. `UN65JS9500`.
   *
   * @returns The name.
   */
  getRealModel?(): string;
  /**
   * Model name, e.g. `UJS9500`.
   *
   * @returns The name.
   */
  getModel?(): string;
  /**
   * Model code, e.g. `15_HAWKP`.
   *
   * @returns The code.
   */
  getModelCode?(): string;
  /**
   * Firmware version.
   *
   * @returns The version.
   */
  getFirmware?(): string;
}

/** Samsung's `window.webapis` (only `productinfo` is read). */
export interface WebapisLike {
  /** The product-info API. */
  readonly productinfo?: ProductInfoLike;
}

/** Product facts read from `webapis.productinfo`. */
export interface ProductInfo {
  /** Model name, or `null`. */
  readonly model: string | null;
  /** Model code, or `null`. */
  readonly modelCode: string | null;
  /** Firmware, or `null`. */
  readonly firmware: string | null;
}

/** A WebGL context's parameter query (a `WebGLRenderingContext` satisfies it). */
export interface GlParameterSource {
  /** The `MAX_TEXTURE_SIZE` enum. */
  readonly MAX_TEXTURE_SIZE: number;
  /**
   * Reads a parameter.
   *
   * @param name - The enum.
   * @returns Its value.
   */
  getParameter(name: number): unknown;
}

/** What {@link collectDeviceInfo} reads. */
export interface DeviceInfoSources {
  /** `navigator.userAgent`. */
  readonly userAgent: string;
  /** `innerWidth`. */
  readonly innerWidth: number;
  /** `innerHeight`. */
  readonly innerHeight: number;
  /** `devicePixelRatio`. */
  readonly devicePixelRatio: number;
  /** The renderer's WebGL version (1 or 2), or `null` / 0 without WebGL. */
  readonly webglVersion: number | null;
  /** The renderer's context, or `null`. */
  readonly gl: GlParameterSource | null;
  /** `window.webapis` once loaded, or `null`. */
  readonly webapis: WebapisLike | null;
}

/**
 * Parses the Chrome major version from a user agent.
 *
 * @param userAgent - `navigator.userAgent`.
 * @returns The major version (`69` for `… Chrome/69.0.3497.106 TV Safari/537.36`), or `null`.
 *
 * @example
 * ```ts
 * parseChromeMajor('Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) … Chrome/69.0.3497.106 TV'); // → 69
 * ```
 */
export function parseChromeMajor(userAgent: string): number | null {
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  return match === null ? null : Number(match[1]);
}

/**
 * Calls one product-info getter, tolerating a missing method, an exception (`SecurityError`
 * without the privilege, `NotSupportedError`) and an empty or non-string answer.
 *
 * @param info - The API.
 * @param name - The getter.
 * @returns The value, or `null`.
 */
function productValue(info: ProductInfoLike, name: keyof ProductInfoLike): string | null {
  if (typeof info[name] !== 'function') return null;
  try {
    // Called as a method: Samsung's getters may need their object as `this`.
    const value: unknown = (info[name] as () => unknown)();
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Reads the model, model code and firmware from `webapis.productinfo`.
 *
 * @param webapis - `window.webapis`, or `null`.
 * @returns The facts (`null` fields when unavailable).
 */
export function readProductInfo(webapis: WebapisLike | null): ProductInfo {
  const info = webapis?.productinfo;
  if (info === undefined || info === null) return { model: null, modelCode: null, firmware: null };
  return {
    model: productValue(info, 'getRealModel') ?? productValue(info, 'getModel'),
    modelCode: productValue(info, 'getModelCode'),
    firmware: productValue(info, 'getFirmware'),
  };
}

/**
 * Reads `MAX_TEXTURE_SIZE` from a WebGL context.
 *
 * @param gl - The context, or `null`.
 * @returns A positive whole number, or `null` (no context, a lost one, an odd answer).
 */
export function readMaxTextureSize(gl: GlParameterSource | null): number | null {
  if (gl === null) return null;
  try {
    const value = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return typeof value === 'number' && value > 0 ? Math.floor(value) : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Collects the environment snapshot from its sources.
 *
 * @param sources - User agent, window size, the renderer's WebGL version and context, `webapis`.
 * @returns The snapshot (frozen).
 *
 * @example
 * ```ts
 * const info = collectDeviceInfo({
 *   userAgent: navigator.userAgent, innerWidth, innerHeight, devicePixelRatio,
 *   webglVersion: renderer.webGLVersion, gl: canvas.getContext('webgl'), webapis: null,
 * });
 * ```
 */
export function collectDeviceInfo(sources: DeviceInfoSources): DeviceInfo {
  const version = sources.webglVersion;
  const product = readProductInfo(sources.webapis);
  return Object.freeze({
    userAgent: sources.userAgent,
    chromeMajor: parseChromeMajor(sources.userAgent),
    cssWidth: sources.innerWidth,
    cssHeight: sources.innerHeight,
    devicePixelRatio: sources.devicePixelRatio,
    webglVersion: version === 1 || version === 2 ? version : null,
    maxTextureSize: readMaxTextureSize(sources.gl),
    model: product.model,
    modelCode: product.modelCode,
    firmware: product.firmware,
  });
}

/**
 * The one-line summary the debug overlay draws: model (and code), firmware, CSS size and pixel
 * ratio, Chrome version, WebGL version and its largest texture — `?` for what is unknown.
 *
 * @param info - The snapshot.
 * @returns The line, e.g. `LS43AM702U 20_KANTSU2 FW T-KSU2EUC-1234.5 1920x1080@1 C69 GL1/4096`.
 */
export function formatDeviceLine(info: DeviceInfo): string {
  const model = info.model ?? '?';
  const code = info.modelCode === null ? '' : ` ${info.modelCode}`;
  const chrome = info.chromeMajor === null ? '?' : String(info.chromeMajor);
  const gl = info.webglVersion === null ? '-' : String(info.webglVersion);
  const max = info.maxTextureSize === null ? '' : `/${info.maxTextureSize}`;
  return (
    `${model}${code} FW ${info.firmware ?? '?'} ${info.cssWidth}x${info.cssHeight}` +
    `@${info.devicePixelRatio} C${chrome} GL${gl}${max}`
  );
}

/** The script loads started, by window (so a second call waits for the first). */
const pending = new WeakMap<object, Promise<WebapisLike | null>>();

/**
 * Loads Samsung's `webapis.js` (see the module docs) and resolves with `window.webapis`.
 *
 * @remarks
 * Resolves at once with `window.webapis` when it already exists, and with `null` outside a Tizen
 * web app (no `window.tizen` — nothing is requested). Otherwise adds one
 * `<script src="$WEBAPIS/webapis/webapis.js">` and resolves when it loads (`window.webapis` or
 * `null`), fails (`null`) or after {@link WEBAPIS_TIMEOUT_MS} (`null`). Never rejects; calls for
 * the same window share one load.
 *
 * @param win - The window.
 * @param timeoutMs - Give-up time (default {@link WEBAPIS_TIMEOUT_MS}).
 * @returns Resolves with the API or `null`.
 */
export function loadWebapis(
  win: Window,
  timeoutMs: number = WEBAPIS_TIMEOUT_MS,
): Promise<WebapisLike | null> {
  const globals = win as Window & { webapis?: WebapisLike; tizen?: unknown };
  if (globals.webapis !== undefined && globals.webapis !== null) {
    return Promise.resolve(globals.webapis);
  }
  if (globals.tizen === undefined || globals.tizen === null) return Promise.resolve(null);
  const started = pending.get(win);
  if (started !== undefined) return started;
  const load = new Promise<WebapisLike | null>((resolve) => {
    try {
      const doc = win.document;
      const script = doc.createElement('script');
      let timer = 0;
      /** Settles the load once. */
      const done = (): void => {
        win.clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        resolve(globals.webapis ?? null);
      };
      script.onload = done;
      script.onerror = done;
      timer = win.setTimeout(done, timeoutMs);
      script.src = WEBAPIS_SCRIPT_URL;
      (doc.head ?? doc.body).appendChild(script);
    } catch (_error) {
      // No document to add a script to (a test fake, a detached window): nothing to load.
      resolve(null);
    }
  });
  pending.set(win, load);
  return load;
}
