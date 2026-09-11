/**
 * Environment facts (spec question 7): shape and text formatting.
 *
 * Pure module — collection from the browser/Tizen globals lives in `env.ts`.
 *
 * @module envInfo
 */

/** WebGL context facts. */
export interface WebGLInfo {
  supported: boolean;
  maxTextureSize: number | null;
  renderer: string | null;
  vendor: string | null;
  version: string | null;
}

/** Everything the probe learns about its runtime environment. */
export interface EnvInfo {
  userAgent: string;
  /** Chromium major version parsed from the UA, or null. */
  chromeVersion: number | null;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  webgl1: WebGLInfo;
  webgl2: WebGLInfo;
  webAssembly: boolean;
  audioWorklet: boolean;
  offscreenCanvas: boolean;
  gamepadApi: boolean;
  nativeGlobalThis: boolean;
  audioSampleRate: number | null;
  audioBaseLatency: number | null;
  hardwareConcurrency: number | null;
  /** `tizen` object present. */
  tizen: boolean;
  tizenPlatformVersion: string | null;
  /** `webapis` object present (loaded from `$WEBAPIS/webapis/webapis.js`). */
  webapis: boolean;
  model: string | null;
  modelCode: string | null;
  firmware: string | null;
  appVersion: string | null;
  /** Errors encountered while probing (never fatal). */
  errors: string[];
}

/**
 * Extracts the Chromium major version from a user-agent string.
 *
 * Handles desktop `Chrome/NN…` / `Chromium/NN…` tokens and the Samsung TV form without a `Chrome/` prefix,
 * e.g. Tizen 5.5: `… (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36` (Tizen 6.0: `76.0.3809.146/6.0 TV`).
 */
export function parseChromeVersion(ua: string): number | null {
  const m = /Chrom(?:e|ium)\/(\d+)/.exec(ua) ?? /\s(\d+)\.\d+\.\d+\.\d+(?:\.\d+)*\/[\d.]+\s+TV\b/.exec(ua);
  return m ? Number(m[1]) : null;
}

/** Extracts the Tizen version (e.g. "5.5") from a user-agent string. */
export function parseTizenVersion(ua: string): string | null {
  const m = /Tizen\s*([\d.]+)/i.exec(ua);
  return m ? (m[1] as string) : null;
}

function yn(b: boolean): string {
  return b ? 'yes' : 'no';
}

function orDash(v: string | number | null): string {
  return v === null || v === '' ? '—' : String(v);
}

function glLine(label: string, g: WebGLInfo): string {
  if (!g.supported) return label + ': no';
  return label + ': yes  MAX_TEXTURE_SIZE=' + orDash(g.maxTextureSize) + '  ' + orDash(g.version);
}

/** Multi-line description for the Environment panel. */
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

/** One-line summary for the header. */
export function envHeadline(e: EnvInfo): string {
  return (
    'Chrome ' + orDash(e.chromeVersion) +
    ' · Tizen ' + orDash(e.tizenPlatformVersion) +
    ' · ' + e.innerWidth + '×' + e.innerHeight + '@' + e.devicePixelRatio +
    ' · WebGL2 ' + yn(e.webgl2.supported) +
    (e.model ? ' · ' + e.model : '')
  );
}
