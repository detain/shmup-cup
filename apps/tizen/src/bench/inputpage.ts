/**
 * The **input watch page** body (plan v20x HARBENCH, program session S3, `?page=input`): the
 * registered-key delivery question P0-2 left unverified on a real remote — do the ColorF0–F3
 * colours, Play/Pause, Guide, Extra, the Channel rockers, Exit and the arrows arrive at all — plus
 * the press-to-tick lag and the auto-repeat Hz on the CURRENT firmware (the §findings figures,
 * 9.3 Hz / 356 ms, are the 2026-09-15 v1-era probe).
 *
 * The page is a **watch**: it waits for the owner to press, showing a per-key checklist in the
 * DOM, and sends one {@link HarbenchInputRecord} when every watched key delivered or the watch ran
 * out (`?secs=`, default {@link INPUT_WATCH_S}). The game-mode A/B leg is NOT in the row: the flag
 * rides every payload's env ({@link ./harb.ts} `gameModeFromSearch`), so the two legs of one
 * install compare apart without a second wire field.
 *
 * What "applied" means: each delivery is latched on the next scheduled frame — the same poll edge
 * the game's `PlatformInput.poll()` takes it through — so the lag series measures key-down to the
 * first frame the game loop could have acted on, which is the figure the remote-latency budget
 * reads. A key that never arrives is `delivered: false` with a null series, never a zero (the S8
 * lesson).
 *
 * @module
 */
import type { HarbenchInputKeyRow, HarbenchInputRecord } from '@shmup/shell';
import { summarizeRuns } from './decode.js';
import { searchParam } from './matrix.js';

/** The page's id in `?page=` and its record's `scenario`. */
export const INPUT_PAGE_ID = 'input';

/** Default watch length on the TV, seconds (the owner presses thirteen keys at leisure). */
export const INPUT_WATCH_S = 300;

/** Shortest watch the query may ask for, seconds. */
export const INPUT_MIN_WATCH_S = 10;

/** Longest watch the query may ask for, seconds. */
export const INPUT_MAX_WATCH_S = 1200;

/** A gap longer than this ends an auto-repeat episode without an explicit key-up, ms. */
export const INPUT_EPISODE_GAP_MS = 700;

/** An episode must span at least this long before its repeat rate counts, ms. */
export const INPUT_EPISODE_MIN_SPAN_MS = 250;

/** Most deliveries remembered per key (the lag series bounds itself the same way). */
export const MAX_INPUT_DELIVERIES = 256;

/** Every watched key delivered and quiet this long ends the watch early, ms. */
export const INPUT_SETTLE_MS = 1_500;

/** Longest an `error` string may be (the wire caps it at 512). */
const ERROR_MAX = 512;

/**
 * One watched key: a stable id and the measured `keyCode` (the owner's M7 remote codes from
 * `docs/dev/input-probe-results.md` §5, the channel rocker from the ip-mvsr61cj-cjko session).
 */
export interface InputWatchKey {
  /** The registered name the row labels the key by. */
  readonly id: string;
  /** The `keyCode` the firmware delivers for it. */
  readonly code: number;
}

/** The watched set — the five keys the registration law carries plus the remote and arrow keys. */
export const BENCH_INPUT_KEYS: readonly InputWatchKey[] = [
  { id: 'ColorF0Red', code: 403 },
  { id: 'ColorF1Green', code: 404 },
  { id: 'ColorF2Yellow', code: 405 },
  { id: 'ColorF3Blue', code: 406 },
  { id: 'MediaPlayPause', code: 10252 },
  { id: 'Guide', code: 458 },
  { id: 'Extra', code: 10253 },
  { id: 'ChannelUp', code: 429 },
  { id: 'ChannelDown', code: 428 },
  { id: 'Exit', code: 10009 },
  { id: 'ArrowUp', code: 38 },
  { id: 'ArrowDown', code: 40 },
  { id: 'ArrowLeft', code: 37 },
  { id: 'ArrowRight', code: 39 },
];

/**
 * The watch length the query asks for: `?secs=<n>` clamped to {@link INPUT_MIN_WATCH_S} …
 * {@link INPUT_MAX_WATCH_S}.
 *
 * @param search - `location.search`.
 * @returns Seconds.
 */
export function inputWatchSecondsFromSearch(search: string): number {
  const raw = searchParam(search, 'secs');
  const parsed = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return INPUT_WATCH_S;
  return Math.min(INPUT_MAX_WATCH_S, Math.max(INPUT_MIN_WATCH_S, Math.floor(parsed)));
}

/** Drives the watch (the rig wires it to `document` listeners and `requestAnimationFrame`). */
export interface InputHost {
  /**
   * The monotonic clock (the event-clock law: Tizen `timeStamp` is whole seconds, so the watch
   * uses the page clock like the input module does).
   *
   * @returns Milliseconds.
   */
  time(): number;
  /**
   * Subscribes to key-down.
   *
   * @param onKey - Gets the delivered `keyCode`.
   * @returns The unsubscribe.
   */
  onKeydown(onKey: (keyCode: number) => void): () => void;
  /**
   * Subscribes to key-up.
   *
   * @param onKey - Gets the released `keyCode`.
   * @returns The unsubscribe.
   */
  onKeyup(onKey: (keyCode: number) => void): () => void;
  /**
   * Whether any gamepad is connected right now.
   *
   * @returns The presence.
   */
  gamepadPresent(): boolean;
  /**
   * Schedules the next watch frame (the poll edge the applied-lag measures to).
   *
   * @param onFrame - Runs on the next frame.
   */
  schedule(onFrame: () => void): void;
  /**
   * Shows the checklist (cold path — once per frame while keys are live is fine here).
   *
   * @param lines - The lines to draw.
   */
  show(lines: readonly string[]): void;
}

/** The watch's per-key state. */
interface WatchKey {
  /** The watched spec. */
  spec: InputWatchKey;
  /** Whether a key-down arrived at all. */
  delivered: boolean;
  /** The first delivered keyCode (0 when none). */
  keyCode: number;
  /** Closed repeat episodes (delivery times per episode). */
  episodes: number[][];
  /** The open episode, or `null`. */
  open: number[] | null;
  /** A key-up seen since the last delivery. */
  sawUp: boolean;
  /** The last delivery's clock. */
  last: number;
  /** Lags (key-down to next frame), ms. */
  lags: number[];
}

/**
 * Watches the keys. Resolves once the watch ran out, or every watched key delivered and the
 * deliveries went quiet for {@link INPUT_SETTLE_MS} — the settle keeps auto-repeat episodes
 * counting after the first press of every key. Unsubscribes before it resolves. Never rejects.
 *
 * @param host - The rig (real or fake).
 * @param options - Watch length, the key list and the record's wall clock.
 * @returns The input row.
 */
export function measureInputWatch(
  host: InputHost,
  options: {
    /** Seconds the watch may run. */
    readonly watchSeconds: number;
    /** The watched keys (default {@link BENCH_INPUT_KEYS}). */
    readonly keys?: readonly InputWatchKey[];
    /** Wall clock for `startedAt` / `endedAt`. */
    readonly wallClock: () => number;
  },
): Promise<HarbenchInputRecord> {
  const keysSpec = options.keys ?? BENCH_INPUT_KEYS;
  const startedAt = options.wallClock();
  const gamepadPresent = host.gamepadPresent();
  const t0 = host.time();
  const limit = options.watchSeconds * 1000;
  const state: WatchKey[] = [];
  for (let i = 0; i < keysSpec.length; i++) {
    state.push({
      spec: keysSpec[i],
      delivered: false,
      keyCode: 0,
      episodes: [],
      open: null,
      sawUp: false,
      last: -1,
      lags: [],
    });
  }
  /** Deliveries waiting for their next-frame latch: [state index, key-down clock]. */
  const pending: number[][] = [];

  const offDown = host.onKeydown((keyCode: number) => {
    const now = host.time();
    for (let i = 0; i < state.length; i++) {
      const key = state[i];
      if (key.spec.code !== keyCode) continue;
      if (!key.delivered) {
        key.delivered = true;
        key.keyCode = keyCode;
      }
      const startsEpisode = key.open === null || key.sawUp || now - key.last > INPUT_EPISODE_GAP_MS;
      let episode = key.open;
      if (startsEpisode) {
        if (episode !== null) key.episodes.push(episode);
        episode = [];
        key.open = episode;
      }
      if (episode !== null && episode.length < MAX_INPUT_DELIVERIES) episode.push(now);
      key.sawUp = false;
      key.last = now;
      pending.push([i, now]);
      return;
    }
  });
  const offUp = host.onKeyup((keyCode: number) => {
    for (let i = 0; i < state.length; i++) {
      if (state[i].spec.code === keyCode) state[i].sawUp = true;
    }
  });

  return new Promise<HarbenchInputRecord>((resolve) => {
    /**
     * One watch frame: latch the pending deliveries, redraw, decide whether to stop.
     */
    const frame = (): void => {
      const now = host.time();
      for (let p = 0; p < pending.length; p++) {
        const key = state[pending[p][0]];
        if (key.lags.length < MAX_INPUT_DELIVERIES) key.lags.push(Math.max(0, now - pending[p][1]));
      }
      pending.length = 0;
      const elapsed = now - t0;
      host.show(buildLines(state, limit - elapsed));
      if (elapsed >= limit || (allDelivered(state) && deliveriesSettled(state, now))) {
        offDown();
        offUp();
        resolve(finish(state, gamepadPresent, startedAt));
      } else host.schedule(frame);
    };
    host.schedule(frame);
  });
}

/**
 * Whether every watched key delivered.
 *
 * @param state - The watch state.
 * @returns Done early?
 */
function allDelivered(state: readonly WatchKey[]): boolean {
  for (let i = 0; i < state.length; i++) if (!state[i].delivered) return false;
  return true;
}

/**
 * Whether every key's last delivery is at least {@link INPUT_SETTLE_MS} old — the auto-repeat
 * episodes have gone quiet, so the watch may end before its seconds run out.
 *
 * @param state - The watch state.
 * @param now - The watch clock.
 * @returns Settled?
 */
function deliveriesSettled(state: readonly WatchKey[], now: number): boolean {
  for (let i = 0; i < state.length; i++) {
    if (now - state[i].last < INPUT_SETTLE_MS) return false;
  }
  return true;
}

/**
 * The checklist lines (the TV photograph is the record's twin).
 *
 * @param state - The watch state.
 * @param msLeft - Watch seconds left, ms.
 * @returns The lines.
 */
function buildLines(state: readonly WatchKey[], msLeft: number): string[] {
  const lines: string[] = [
    `HARB S3 INPUT WATCH  left ${Math.max(0, Math.ceil(msLeft / 1000))}s`,
    'press every key once; ends when all arrive',
    '',
  ];
  for (let i = 0; i < state.length; i++) {
    const key = state[i];
    lines.push(
      `${key.delivered ? '+' : '-'} ${key.spec.id} (${key.spec.code})` +
        (key.delivered ? ` x${countDeliveries(key)}` : ''),
    );
  }
  return lines;
}

/**
 * Total deliveries counted for one key.
 *
 * @param key - The watch state.
 * @returns The count.
 */
function countDeliveries(key: WatchKey): number {
  let n = 0;
  for (let e = 0; e < key.episodes.length; e++) n += key.episodes[e].length;
  if (key.open !== null) n += key.open.length;
  return n;
}

/**
 * Closes the episodes, folds the rows and ends the watch.
 *
 * @param state - The watch state.
 * @param gamepadPresent - The gamepad presence read at the watch's start.
 * @param startedAt - The wall start.
 * @returns The record.
 */
function finish(
  state: WatchKey[],
  gamepadPresent: boolean,
  startedAt: number,
): HarbenchInputRecord {
  const keys: HarbenchInputKeyRow[] = [];
  let anyDelivered = false;
  for (let i = 0; i < state.length; i++) {
    const key = state[i];
    if (key.open !== null) {
      key.episodes.push(key.open);
      key.open = null;
    }
    let best: number[] = [];
    for (let e = 0; e < key.episodes.length; e++) {
      if (key.episodes[e].length > best.length) best = key.episodes[e];
    }
    const span = best.length > 1 ? best[best.length - 1] - best[0] : 0;
    const repeatsPerSecond =
      best.length > 1 && span >= INPUT_EPISODE_MIN_SPAN_MS
        ? Math.round(((best.length - 1) * 100_000) / span) / 100
        : null;
    anyDelivered = anyDelivered || key.delivered;
    keys.push({
      id: key.spec.id,
      keyCode: key.keyCode,
      delivered: key.delivered,
      presses: key.episodes.length,
      repeatsPerSecond,
      appliedMs: summarizeRuns(key.lags),
    });
  }
  return {
    record: 'input',
    scenario: INPUT_PAGE_ID,
    index: 0,
    startedAt,
    endedAt: Date.now(),
    gamepadPresent,
    keys,
    error: anyDelivered ? null : 'no key was delivered during the watch'.slice(0, ERROR_MAX),
  };
}
