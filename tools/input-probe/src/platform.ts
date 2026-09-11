/**
 * Tizen platform glue: supported keys, key registration, exit. All calls tolerate a desktop browser.
 *
 * @module platform
 */

import { selectKeysToRegister, type RegisterResult, type SupportedKey } from './keys';

/**
 * Detects the Tizen web runtime.
 *
 * @returns whether the `tizen` global exists (false in a desktop browser).
 */
export function hasTizen(): boolean {
  return typeof window.tizen === 'object' && window.tizen !== null;
}

/**
 * Reads `tizen.tvinputdevice.getSupportedKeys()`.
 *
 * @param onError - receives a message when the call throws (e.g. missing `tv.inputdevice` privilege).
 * @returns the keys as plain `{name, code}` objects, or `[]` when unavailable or on error.
 */
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
 *
 * @param supported - the `getSupportedKeys()` list (see {@link selectKeysToRegister} for the filtering).
 * @returns one result per key, in registration order; `[]` without `tizen.tvinputdevice`.
 *
 * @remarks
 * One `registerKey()` call per key (rather than `registerKeyBatch`) so that a single rejected key does not
 * hide which others succeeded — the per-key outcome is itself a probe result (spec question 4).
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

/**
 * Formats an unknown thrown value (Tizen WebAPIException has `name` and `message`).
 *
 * @param e - anything that was thrown.
 * @returns `name: message`, whichever of the two exists, or `String(e)`.
 *
 * @example
 * ```ts
 * describeError({ name: 'InvalidValuesError', message: 'bad key' }); // "InvalidValuesError: bad key"
 * describeError('boom');                                             // "boom"
 * ```
 */
export function describeError(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { name?: unknown; message?: unknown };
    const name = typeof o.name === 'string' ? o.name : '';
    const msg = typeof o.message === 'string' ? o.message : '';
    if (name || msg) return name && msg ? name + ': ' + msg : name || msg;
  }
  return String(e);
}
