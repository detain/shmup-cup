/**
 * The TV render bench's **host**: which TV (or browser) it runs on, its remote keys and how it
 * exits (plan R0-02 — part of the `bench` module, see `./index.ts`).
 *
 * One bench bundle serves both TVs (the webOS stub builds the same entry) and a desktop browser,
 * so the keys of all three are accepted everywhere: **Enter** (13) starts, **Back** (Tizen 10009,
 * webOS 461, Escape, Backspace) exits, **Red** (403 on both TVs, or `R`) re-runs a scenario,
 * **Left / Right** (and Up / Down — 37–40, no registration needed) page the results. On
 * Tizen the Red key must be registered (`tv.inputdevice`); the bench registers only that one.
 *
 * @module
 */
import { getTizenApi, registerRemoteKeys } from '../platform/index.js';

/** A bench remote action. */
export type BenchKey = 'enter' | 'back' | 'red' | 'prev' | 'next';

/** Key codes per action (every host's, accepted on every host). */
export const BENCH_KEY_CODES: Readonly<Record<BenchKey, readonly number[]>> = Object.freeze({
  /** OK / Enter. */
  enter: Object.freeze([13]),
  /** Tizen Back, webOS Back, Escape, Backspace. */
  back: Object.freeze([10009, 461, 27, 8]),
  /** The red colour key (Tizen `ColorF0Red`, webOS), or `R` on a keyboard. */
  red: Object.freeze([403, 82]),
  /** Left or Up: the previous results page. */
  prev: Object.freeze([37, 38]),
  /** Right or Down: the next results page. */
  next: Object.freeze([39, 40]),
});

/**
 * The action a key code stands for.
 *
 * @param keyCode - `KeyboardEvent.keyCode`.
 * @returns The action, or `null` for any other key.
 *
 * @example
 * ```ts
 * benchKeyOf(10009); // → 'back'
 * ```
 */
export function benchKeyOf(keyCode: number): BenchKey | null {
  if (BENCH_KEY_CODES.enter.indexOf(keyCode) >= 0) return 'enter';
  if (BENCH_KEY_CODES.back.indexOf(keyCode) >= 0) return 'back';
  if (BENCH_KEY_CODES.red.indexOf(keyCode) >= 0) return 'red';
  if (BENCH_KEY_CODES.prev.indexOf(keyCode) >= 0) return 'prev';
  if (BENCH_KEY_CODES.next.indexOf(keyCode) >= 0) return 'next';
  return null;
}

/** Where the bench runs. */
export interface BenchHost {
  /** `'tizen'`, `'webos'` or `'browser'`. */
  readonly name: string;
  /** Leaves the app (on a browser: closes the window if it may, else nothing). */
  exit(): void;
}

/** The webOS library's part the bench uses (`window.webOS`). */
interface WebosLike {
  /** Hands Back to the platform — the closest thing to an exit (see `apps/webos` platform). */
  readonly platformBack?: () => void;
}

/**
 * Detects the host, registers the Red key on Tizen and returns how to exit.
 *
 * @param win - The window.
 * @returns The host.
 */
export function detectBenchHost(win: Window): BenchHost {
  const tizen = getTizenApi(win);
  if (tizen !== null) {
    registerRemoteKeys(tizen, ['ColorF0Red']);
    return {
      name: 'tizen',
      exit(): void {
        tizen.application?.getCurrentApplication().exit();
      },
    };
  }
  const webos = (win as Window & { webOS?: WebosLike }).webOS;
  const userAgent = (win as Partial<Window>).navigator?.userAgent ?? '';
  if (webos !== undefined || /Web0S|webOS/.test(userAgent)) {
    return {
      name: 'webos',
      exit(): void {
        if (webos?.platformBack !== undefined) webos.platformBack();
        else win.close();
      },
    };
  }
  return {
    name: 'browser',
    exit(): void {
      win.close();
    },
  };
}
