/**
 * Environment facts (spec question 7): shape and text formatting.
 *
 * Pure module — collection from the browser/Tizen globals lives in `env.ts`.
 *
 * @module envInfo
 */

/** WebGL context facts. */
export interface WebGLInfo {
  /** Whether `getContext()` returned a context. */
  supported: boolean;
  /** `MAX_TEXTURE_SIZE` (px), or null when unsupported. */
  maxTextureSize: number | null;
  /** GPU renderer string (unmasked via `WEBGL_debug_renderer_info` when available). */
  renderer: string | null;
  /** GPU vendor string (unmasked when available). */
  vendor: string | null;
  /** `VERSION` string, e.g. `"WebGL 1.0 (OpenGL ES 2.0 Chromium)"`. */
  version: string | null;
}

/** Everything the probe learns about its runtime environment (spec question 7). */
export interface EnvInfo {
  /** `navigator.userAgent`. */
  userAgent: string;
  /** Chromium major version parsed from the UA, or null. */
  chromeVersion: number | null;
  /** `window.innerWidth` (CSS px) — expected 1920 on the M7. */
  innerWidth: number;
  /** `window.innerHeight` (CSS px) — expected 1080 on the M7. */
  innerHeight: number;
  /** `window.devicePixelRatio`. */
  devicePixelRatio: number;
  /** `screen.width`. */
  screenWidth: number;
  /** `screen.height`. */
  screenHeight: number;
  /** WebGL 1 facts. */
  webgl1: WebGLInfo;
  /** WebGL 2 facts. */
  webgl2: WebGLInfo;
  /** `WebAssembly` global present. */
  webAssembly: boolean;
  /** `AudioWorkletNode` / `AudioContext.audioWorklet` present. */
  audioWorklet: boolean;
  /** `OffscreenCanvas` constructor present. */
  offscreenCanvas: boolean;
  /** `navigator.getGamepads` present. */
  gamepadApi: boolean;
  /** Whether the engine had `globalThis` before `polyfills.ts` ran (Chrome 71+ has it natively). */
  nativeGlobalThis: boolean;
  /** `AudioContext.sampleRate` (Hz). */
  audioSampleRate: number | null;
  /** `AudioContext.baseLatency` (seconds), when the engine reports it. */
  audioBaseLatency: number | null;
  /** `navigator.hardwareConcurrency` (CPU cores). */
  hardwareConcurrency: number | null;
  /** `tizen` object present. */
  tizen: boolean;
  /** Tizen platform version from `systeminfo`, falling back to the UA. */
  tizenPlatformVersion: string | null;
  /** `webapis` object present (loaded from `$WEBAPIS/webapis/webapis.js`). */
  webapis: boolean;
  /** `webapis.productinfo.getModel()`. */
  model: string | null;
  /** `webapis.productinfo.getModelCode()`. */
  modelCode: string | null;
  /** `webapis.productinfo.getFirmware()`. */
  firmware: string | null;
  /** Installed app version from `tizen.application` (config.xml `version`). */
  appVersion: string | null;
  /** Errors encountered while probing (never fatal). */
  errors: string[];
}

/**
 * Extracts the Chromium major version from a user-agent string.
 *
 * Handles desktop `Chrome/NN…` / `Chromium/NN…` tokens and the Samsung TV form without a `Chrome/` prefix,
 * e.g. Tizen 5.5: `… (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36` (Tizen 6.0: `76.0.3809.146/6.0 TV`).
 *
 * @param ua - a user-agent string.
 * @returns the major version, or null when no known pattern matches.
 *
 * @example
 * ```ts
 * parseChromeVersion('Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36'); // 69
 * ```
 */
export function parseChromeVersion(ua: string): number | null {
  const m = /Chrom(?:e|ium)\/(\d+)/.exec(ua) ?? /\s(\d+)\.\d+\.\d+\.\d+(?:\.\d+)*\/[\d.]+\s+TV\b/.exec(ua);
  return m ? Number(m[1]) : null;
}

/**
 * Extracts the Tizen version (e.g. "5.5") from a user-agent string.
 *
 * @param ua - a user-agent string.
 * @returns the version string after `Tizen`, or null.
 *
 * @example
 * ```ts
 * parseTizenVersion('Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) …'); // "5.5"
 * ```
 */
export function parseTizenVersion(ua: string): string | null {
  const m = /Tizen\s*([\d.]+)/i.exec(ua);
  return m ? (m[1] as string) : null;
}

/**
 * Formats a flag.
 *
 * @param b - the flag.
 * @returns `"yes"` or `"no"`.
 */
function yn(b: boolean): string {
  return b ? 'yes' : 'no';
}

/**
 * Formats an optional value.
 *
 * @param v - the value.
 * @returns `"—"` for null / empty string, otherwise `String(v)`.
 */
function orDash(v: string | number | null): string {
  return v === null || v === '' ? '—' : String(v);
}

/**
 * Formats one WebGL line of the Environment panel.
 *
 * @param label - `"WebGL1"` or `"WebGL2"`.
 * @param g - the context facts.
 * @returns e.g. `WebGL1: yes  MAX_TEXTURE_SIZE=8192  WebGL 1.0 (…)` or `WebGL2: no`.
 */
function glLine(label: string, g: WebGLInfo): string {
  if (!g.supported) return label + ': no';
  return label + ': yes  MAX_TEXTURE_SIZE=' + orDash(g.maxTextureSize) + '  ' + orDash(g.version);
}

/**
 * Multi-line description for the Environment panel.
 *
 * @param e - collected environment facts.
 * @returns 9 lines (UA, versions, model, window, WebGL1, WebGL2, GPU, feature flags, audio), plus a
 *   `probe errors:` line when any probe failed.
 */
export function envLines(e: EnvInfo): string[] {
  const lines = [
    'UA: ' + e.userAgent,
    'Chrome ' + orDash(e.chromeVersion) + ' · Tizen ' + orDash(e.tizenPlatformVersion) + ' · tizen=' + yn(e.tizen) + ' webapis=' + yn(e.webapis),
    'Model ' + orDash(e.model) + ' (' + orDash(e.modelCode) + ') · FW ' + orDash(e.firmware) + ' · app ' + orDash(e.appVersion),
    'Window ' + e.innerWidth + '×' + e.innerHeight + ' @' + e.devicePixelRatio + ' · screen ' + e.screenWidth + '×' + e.screenHeight,
    glLine('WebGL1', e.webgl1),
    glLine('WebGL2', e.webgl2),
    'GPU: ' + orDash(e.webgl1.renderer ?? e.webgl2.renderer) + ' / ' + orDash(e.webgl1.vendor ?? e.webgl2.vendor),
    'WASM ' + yn(e.webAssembly) + ' · AudioWorklet ' + yn(e.audioWorklet) + ' · OffscreenCanvas ' + yn(e.offscreenCanvas) +
      ' · Gamepad API ' + yn(e.gamepadApi) + ' · native globalThis ' + yn(e.nativeGlobalThis),
    'Audio sampleRate ' + orDash(e.audioSampleRate) + ' · baseLatency ' +
      (e.audioBaseLatency === null ? '—' : (e.audioBaseLatency * 1000).toFixed(1) + ' ms') +
      ' · cores ' + orDash(e.hardwareConcurrency),
  ];
  if (e.errors.length > 0) lines.push('probe errors: ' + e.errors.join('; '));
  return lines;
}

/**
 * One-line summary for the header.
 *
 * @param e - collected environment facts.
 * @returns `Chrome <n> · Tizen <v> · <w>×<h>@<dpr> · WebGL2 yes|no · <model>` (model omitted when unknown).
 */
export function envHeadline(e: EnvInfo): string {
  return (
    'Chrome ' + orDash(e.chromeVersion) +
    ' · Tizen ' + orDash(e.tizenPlatformVersion) +
    ' · ' + e.innerWidth + '×' + e.innerHeight + '@' + e.devicePixelRatio +
    ' · WebGL2 ' + yn(e.webgl2.supported) +
    (e.model ? ' · ' + e.model : '')
  );
}
