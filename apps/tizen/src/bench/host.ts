/**
 * The TV render bench's **host**: which TV (or browser) it runs on, its remote keys and how it
 * exits (plan R0-02 — part of the `bench` module, see `./index.ts`).
 *
 * One bench bundle serves both TVs (the webOS stub builds the same entry) and a desktop browser,
 * so the keys of all three are accepted everywhere: **Enter** (13) starts, **Back** (Tizen 10009,
 * webOS 461, Escape, Backspace) exits, **Red** (403 on both TVs, `R`, the number key `1`, or
 * **ChannelDown** 428) re-runs a scenario, and the full suite over a same-game-code skip offer
 * (plan v20x BENCSKIP) runs on **Green** (404), `F`, `2`, **Play/Pause** (MediaPlayPause 10252)
 * or **Guide** (458); **Left / Right** (and Up / Down — 37–40, no registration needed) page the
 * results. The channel, play/pause and guide bindings answer the owner's remote (v20x-KEYS):
 * numbers and colours need a select-a-digit dance there, the rocker and play/pause do not. Every
 * one of those codes is measured on the owner's M7 set — the input probe session
 * `ip-mvsr61cj-cjko` records them in `seenKeys` as real keydowns reaching the web app once
 * registered. On Tizen a registered key is the condition for arriving at all (only arrows, OK
 * and Back come unregistered, input-probe §5), so the bench registers what it binds: the colours,
 * Play/Pause, Guide, ChannelDown and the digits `1` / `2` (named as the game's
 * `REMOTE_KEYS_TO_REGISTER` names them). The **volume keys stay deliberately unbound and
 * unregistered** even though the same probe shows 447–449 arriving: pressing volume must only
 * change the volume, and `registerRemoteKeys` never registers `SYSTEM_REMOTE_KEYS` anyway.
 *
 * @module
 */
import { getTizenApi, registerRemoteKeys } from '../platform/index.js';

/** A bench remote action. */
export type BenchKey = 'enter' | 'back' | 'red' | 'full' | 'prev' | 'next';

/** Key codes per action (every host's, accepted on every host). */
export const BENCH_KEY_CODES: Readonly<Record<BenchKey, readonly number[]>> = Object.freeze({
  /** OK / Enter. */
  enter: Object.freeze([13]),
  /** Tizen Back, webOS Back, Escape, Backspace. */
  back: Object.freeze([10009, 461, 27, 8]),
  /**
   * The red colour key (Tizen `ColorF0Red`, webOS), `R` on a keyboard, the number key `1`, or
   * ChannelDown (428) — the rocker a real remote reaches without a dance (v20x-KEYS; the code is
   * the owner's M7's measured `ChannelDown`, `ip-mvsr61cj-cjko`).
   */
  red: Object.freeze([403, 82, 49, 428]),
  /**
   * The green colour key (Tizen `ColorF1Green` — registered, it arrives), `F` on a keyboard, the
   * number key `2`, Play/Pause (`MediaPlayPause` 10252) or Guide (458): the full suite where the
   * ledger would otherwise offer the new rows only (plan v20x BENCSKIP; the amendment's "Start"
   * has no code on either TV's registered set — on the owner's remote Play/Pause is the easy
   * landing and Green/`2` the historic one, honoured only on the results page, exactly as Green
   * was; every code here is measured in `ip-mvsr61cj-cjko`'s `seenKeys`).
   */
  full: Object.freeze([404, 70, 50, 10252, 458]),
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
  if (BENCH_KEY_CODES.full.indexOf(keyCode) >= 0) return 'full';
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
 * The remote keys every bench page registers: the Red re-run key and ChannelDown, the other three
 * colour keys, MediaPlayPause and Guide — registration is what makes them arrive at the app at
 * all (input-probe §5: only arrows, OK and Back come unregistered; each name here is proven to
 * register and arrive on the owner's M7 by the probe session `ip-mvsr61cj-cjko`) — plus the
 * number keys `1` and `2`, the aliases of Red and Green for a remote without colour buttons
 * (named as the game's own `REMOTE_KEYS_TO_REGISTER` names them; `registerRemoteKeys` skips a
 * name the device does not carry). Yellow and Blue stay registered as they were since the P0-2
 * colour-key delivery question — they carry no bench action. Red and ChannelDown re-run, Green,
 * `2`, Play/Pause and Guide take the full-suite offer; ChannelUp and the volume trio are bound
 * to nothing, so the bench does not register them.
 */
export const BENCH_REGISTERED_KEYS: readonly string[] = Object.freeze([
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'MediaPlayPause',
  'Guide',
  'ChannelDown',
  '1',
  '2',
]);

/**
 * Detects the host, registers the bench's remote keys on Tizen and returns how to exit.
 *
 * @param win - The window.
 * @returns The host.
 */
export function detectBenchHost(win: Window): BenchHost {
  const tizen = getTizenApi(win);
  if (tizen !== null) {
    registerRemoteKeys(tizen, BENCH_REGISTERED_KEYS);
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
