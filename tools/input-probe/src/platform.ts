/**
 * Tizen platform glue: supported keys, key registration, exit. All calls tolerate a desktop browser.
 *
 * @module platform
 */

import { selectKeysToRegister, type RegisterResult, type SupportedKey } from './keys';

/** Whether the `tizen` global exists. */
export function hasTizen(): boolean {
  return typeof window.tizen === 'object' && window.tizen !== null;
}

/** `tizen.tvinputdevice.getSupportedKeys()`, or `[]` when unavailable. */
export function getSupportedKeys(onError: (msg: string) => void): SupportedKey[] {
  const dev = window.tizen?.tvinputdevice;
  if (!dev) return [];
  try {
    return dev.getSupportedKeys().map((k) => ({ name: k.name, code: k.code }));
  } catch (e) {
    onError('getSupportedKeys failed: ' + describeError(e));
    return [];
  }
}

/**
 * Registers every supported key except `Exit`, one `registerKey` call per key, recording each result.
 * Note: registering VolumeUp/Down/Mute takes volume control away from the TV while the probe runs.
 */
export function registerAllKeys(supported: readonly SupportedKey[]): RegisterResult[] {
  const dev = window.tizen?.tvinputdevice;
  if (!dev) return [];
  const results: RegisterResult[] = [];
  for (const name of selectKeysToRegister(supported)) {
    const found = supported.find((k) => k.name === name);
    const code = found ? found.code : null;
    try {
      dev.registerKey(name);
      results.push({ name, code, ok: true, error: null });
    } catch (e) {
      results.push({ name, code, ok: false, error: describeError(e) });
    }
  }
  return results;
}

/**
 * Exits the app via `tizen.application.getCurrentApplication().exit()`.
 *
 * @returns false when not running on Tizen (or the call failed).
 */
export function exitApp(): boolean {
  const app = window.tizen?.application;
  if (!app) return false;
  try {
    app.getCurrentApplication().exit();
    return true;
  } catch (_e) {
    return false;
  }
}

/** Formats an unknown thrown value (Tizen WebAPIException has `name` and `message`). */
export function describeError(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { name?: unknown; message?: unknown };
    const name = typeof o.name === 'string' ? o.name : '';
    const msg = typeof o.message === 'string' ? o.message : '';
    if (name || msg) return name && msg ? name + ': ' + msg : name || msg;
  }
  return String(e);
}
