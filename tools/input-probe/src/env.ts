/**
 * Collects environment facts from browser / Tizen / Samsung globals (DOM glue).
 * Every probe is wrapped so a missing API never breaks the app.
 *
 * @module env
 */

import { parseChromeVersion, parseTizenVersion, type EnvInfo, type WebGLInfo } from './envInfo';

function safe<T>(errors: string[], label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    errors.push(label + ': ' + (e instanceof Error ? e.message : String(e)));
    return fallback;
  }
}

function probeWebGL(kind: 'webgl' | 'webgl2', errors: string[]): WebGLInfo {
  const none: WebGLInfo = { supported: false, maxTextureSize: null, renderer: null, vendor: null, version: null };
  return safe(
    errors,
    kind,
    () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const gl = canvas.getContext(kind) as WebGLRenderingContext | null;
      if (!gl) return none;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const info: WebGLInfo = {
        supported: true,
        maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
        renderer: String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
        vendor: String(gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
        version: String(gl.getParameter(gl.VERSION)),
      };
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return info;
    },
    none,
  );
}

type AudioContextCtor = new () => AudioContext;

interface AudioFacts {
  sampleRate: number | null;
  baseLatency: number | null;
  worklet: boolean;
}

function probeAudio(errors: string[]): AudioFacts {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  const worklet = typeof (window as unknown as { AudioWorkletNode?: unknown }).AudioWorkletNode === 'function';
  if (!Ctor) return { sampleRate: null, baseLatency: null, worklet };
  return safe<AudioFacts>(
    errors,
    'AudioContext',
    () => {
      const ctx = new Ctor();
      const res: AudioFacts = {
        sampleRate: ctx.sampleRate,
        baseLatency: typeof ctx.baseLatency === 'number' ? ctx.baseLatency : null,
        worklet: worklet || 'audioWorklet' in ctx,
      };
      void ctx.close().catch(() => undefined);
      return res;
    },
    { sampleRate: null, baseLatency: null, worklet },
  );
}

function str(v: unknown): string | null {
  return v === undefined || v === null || v === '' ? null : String(v);
}

/** Probes the runtime. Safe to call repeatedly (e.g. again after `webapis.js` finished loading). */
export function collectEnv(): EnvInfo {
  const errors: string[] = [];
  const ua = navigator.userAgent;
  const tz = window.tizen;
  const wa = window.webapis;
  const audio = probeAudio(errors);
  const platform = tz?.systeminfo
    ? safe(errors, 'systeminfo', () => str(tz.systeminfo?.getCapability('http://tizen.org/feature/platform.version')), null)
    : null;
  const pi = wa?.productinfo;
  return {
    userAgent: ua,
    chromeVersion: parseChromeVersion(ua),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    webgl1: probeWebGL('webgl', errors),
    webgl2: probeWebGL('webgl2', errors),
    webAssembly: typeof (window as unknown as { WebAssembly?: unknown }).WebAssembly === 'object',
    audioWorklet: audio.worklet,
    offscreenCanvas: typeof (window as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'function',
    gamepadApi: typeof navigator.getGamepads === 'function',
    nativeGlobalThis: !(window as unknown as { __globalThisPolyfilled?: boolean }).__globalThisPolyfilled,
    audioSampleRate: audio.sampleRate,
    audioBaseLatency: audio.baseLatency,
    hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    tizen: tz !== undefined,
    tizenPlatformVersion: platform ?? parseTizenVersion(ua),
    webapis: wa !== undefined,
    model: pi?.getModel ? safe(errors, 'getModel', () => str(pi.getModel?.()), null) : null,
    modelCode: pi?.getModelCode ? safe(errors, 'getModelCode', () => str(pi.getModelCode?.()), null) : null,
    firmware: pi?.getFirmware ? safe(errors, 'getFirmware', () => str(pi.getFirmware?.()), null) : null,
    appVersion: tz?.application
      ? safe(errors, 'appInfo', () => str(tz.application?.getCurrentApplication().appInfo.version), null)
      : null,
    errors,
  };
}
