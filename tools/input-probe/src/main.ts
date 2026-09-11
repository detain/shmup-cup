/**
 * Input probe entry point — thin DOM/Tizen glue that wires browser events into the pure modules.
 *
 * - key events → {@link KeyTracker} (verdicts), event log, console, report queue, flash box;
 * - rAF loop → frame stats, tracker tick, gamepad polling, ship lanes, arena canvas;
 * - ~10 Hz → text panels and checklist; every 3 s → optional report POST.
 *
 * All decisions (classification, verdicts, statistics, formatting) live in the pure modules; this file only
 * reads browser / Tizen state, forwards plain values and writes results back to the DOM. It is exercised
 * end-to-end by `test/build.test.ts`, which runs the built `app.js` in a fake Tizen 5.5 realm.
 *
 * @remarks
 * Import order matters: `polyfills.ts` must run before anything else in the bundle.
 *
 * @module main
 */

import './polyfills';
import './style.css';

import { Arena, ARENA_WIDTH, LANE_HEIGHT } from './arena';
import { Checklist, CHECKLIST_LABELS } from './checklist';
import { collectEnv } from './env';
import { envHeadline, envLines, type EnvInfo } from './envInfo';
import { formatEvent, LineLog, type ProbeEvent } from './eventLog';
import { MultiPressDetector } from './exitGesture';
import { round1 } from './format';
import { chooseEventTime, FrameStats, RunningStats } from './frameStats';
import { describePads, GamepadMonitor, padsForReport, type GamepadEdge, type GamepadLike } from './gamepad';
import { KeyTracker, type KeyDownKind } from './keyTracker';
import { KeyCode, KeyNames, shouldPreventDefault, type RegisterResult } from './keys';
import { describeError, exitApp, getSupportedKeys, hasTizen, registerAllKeys } from './platform';
import { makeSessionId, REPORT_INTERVAL_MS, reportEndpoint, ReportQueue } from './report';
import { Reporter } from './reporter';
import { createLanes, stepLanes } from './ships';
import {
  buildReportParts,
  buildVerdicts,
  checklistLines,
  registerLines,
  seenKeyLines,
  verdictLines,
  type ProbeSnapshot,
} from './summary';
import { ProbeUI } from './ui';

/** Flash duration in frames (spec: 4). */
const FLASH_FRAMES = 4;
/** UI refresh period (ms) — ~10 Hz. */
const UI_PERIOD_MS = 100;
/** Gamepad polling period while no pad has been seen (frames). */
const GAMEPAD_IDLE_POLL_FRAMES = 30;

/**
 * Boots the probe: creates the pure-logic objects, registers the Tizen keys, installs every event listener
 * and starts the rAF loop. Runs once, after `DOMContentLoaded`.
 *
 * @throws Error when required markup (`#arena`, `#stage` or a panel element) is missing, or when Canvas2D is
 *   unavailable — the page is then unusable anyway.
 */
function start(): void {
  const ui = new ProbeUI(document);
  const canvas = document.getElementById('arena') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#arena missing');
  const arena = new Arena(canvas);

  const tizen = hasTizen();
  const names = new KeyNames();
  const tracker = new KeyTracker();
  const frames = new FrameStats();
  const dispatch = new RunningStats();
  const checklist = new Checklist();
  const pads = new GamepadMonitor();
  const backExit = new MultiPressDetector(3, 1500);
  const log = new LineLog(28);
  const lanes = createLanes(ARENA_WIDTH, LANE_HEIGHT);
  const session = makeSessionId(Date.now(), Math.random());
  const queue = new ReportQueue(session);
  const reporter = new Reporter(reportEndpoint(import.meta.env.VITE_REPORT_URL), queue);

  let env: EnvInfo | null = null;
  let supportedCount = 0;
  let registered: RegisterResult[] = [];
  let lastKeyEventAt = NaN;
  let flashFrames = 0;
  let flashLabel = '—';
  let sawHidden = false;
  let leftAndReturned = false;

  /** Records an event everywhere: on-screen log, console (for the remote inspector), report queue. */
  function emit(e: ProbeEvent): void {
    const line = formatEvent(e);
    log.push(line);
    console.log('[probe] ' + line);
    queue.push(e);
  }

  /**
   * Emits an `info` line (lifecycle, registration results, checklist ticks, errors).
   *
   * @param text - the message.
   */
  function info(text: string): void {
    emit({ t: round1(performance.now()) as number, type: 'info', text });
  }

  // ---------------------------------------------------------------- Tizen setup
  if (tizen) {
    const supported = getSupportedKeys(info);
    supportedCount = supported.length;
    names.merge(supported);
    registered = registerAllKeys(supported);
    const failed = registered.filter((r) => !r.ok);
    info(
      'supported keys: ' + supported.length + ', registered ' + (registered.length - failed.length) + '/' +
        registered.length + (failed.length ? ', failed: ' + failed.map((r) => r.name).join(' ') : ''),
    );
  } else {
    info('no tizen global — desktop browser mode (keyboard R = reset stats)');
  }

  /**
   * (Re-)collects the environment facts and logs the headline; failures are logged, never thrown.
   *
   * @param reason - shown in the log line (`startup`, `webapis loaded`).
   */
  function refreshEnv(reason: string): void {
    try {
      env = collectEnv();
      info('environment collected (' + reason + '): ' + envHeadline(env));
    } catch (e) {
      info('environment probe failed: ' + describeError(e));
    }
  }
  // Probing (WebGL contexts, AudioContext) can take a moment: do it after the first frames are up.
  window.setTimeout(() => {
    refreshEnv('startup');
    // webapis.js may finish loading later than this script.
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        if (env && !env.webapis && window.webapis) refreshEnv('webapis loaded');
      });
    }
  }, 250);

  // ---------------------------------------------------------------- keyboard / remote
  /**
   * Handles one `keydown` / `keyup` (capture-phase listener on `window`): measures dispatch delay, applies the
   * `preventDefault()` policy, feeds the tracker with the exact event time, logs the event and triggers the
   * flash box on every keydown without the `repeat` flag.
   *
   * @param ev - the DOM event.
   * @param down - true for `keydown`.
   */
  function onKey(ev: KeyboardEvent, down: boolean): void {
    const now = performance.now();
    const time = chooseEventTime(ev.timeStamp, now);
    if (Number.isFinite(time.delay)) dispatch.add(time.delay);
    const code = ev.keyCode || ev.which || 0;
    if (shouldPreventDefault(code, { ctrl: ev.ctrlKey, meta: ev.metaKey, alt: ev.altKey }, tizen)) ev.preventDefault();
    const name = names.name(code, ev.key);
    // Rounded copies for the log/report (the tracker gets the exact times).
    const t = round1(time.t) as number;
    const dt = round1(time.t - lastKeyEventAt) ?? undefined;
    const delay = round1(time.delay) ?? undefined;
    lastKeyEventAt = time.t;
    if (down) {
      const kind: KeyDownKind = tracker.keyDown(code, ev.repeat, time.t);
      emit({ t, type: 'down', code, name, repeat: ev.repeat, kind, dt, delay });
      if (!ev.repeat) {
        flashFrames = FLASH_FRAMES;
        flashLabel = name;
      }
      if (kind === 'press') onPress(code, time.t);
    } else {
      const heldMs = round1(tracker.keyUp(code, time.t)) as number;
      emit({ t, type: 'up', code, name, heldMs, dt, delay });
    }
  }

  /**
   * Reacts to a new logical press (repeats and bounces never get here): Back feeds the triple-Back exit
   * gesture; Play/Pause or keyboard `R` resets the hold/repeat/frame statistics.
   *
   * @param code - DOM `keyCode`.
   * @param t - press time in ms.
   */
  function onPress(code: number, t: number): void {
    if (code === KeyCode.Back) {
      if (backExit.press(t)) {
        info('Back ×3 — exiting');
        if (!exitApp()) info('exit() unavailable (not on Tizen)');
      }
    } else if (code === KeyCode.MediaPlayPause || code === KeyCode.R) {
      tracker.resetStats();
      frames.resetCounters();
      dispatch.reset();
      info('hold/repeat/frame stats reset');
    }
  }

  window.addEventListener('keydown', (ev) => onKey(ev, true), true);
  window.addEventListener('keyup', (ev) => onKey(ev, false), true);

  // ---------------------------------------------------------------- lifecycle
  window.addEventListener('blur', () => {
    tracker.releaseAll(performance.now());
    info('blur — cleared held keys');
  });
  window.addEventListener('focus', () => info('focus'));
  document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    if (hidden) sawHidden = true;
    else if (sawHidden) leftAndReturned = true;
    info('visibilitychange → ' + (hidden ? 'hidden' : 'visible'));
  });
  window.addEventListener('gamepadconnected', (ev) => {
    const g = (ev as GamepadEvent).gamepad;
    info('gamepadconnected #' + g.index + ' "' + g.id + '" mapping="' + g.mapping + '"');
  });
  window.addEventListener('gamepaddisconnected', (ev) => {
    const g = (ev as GamepadEvent).gamepad;
    info('gamepaddisconnected #' + g.index);
  });
  window.addEventListener('resize', () => ui.fit(window.innerWidth, window.innerHeight));
  ui.fit(window.innerWidth, window.innerHeight);

  // ---------------------------------------------------------------- gamepads
  /**
   * Logs a gamepad edge (`GP0 b3 down`, connect / disconnect, axis zone change).
   *
   * @param edge - the edge reported by the monitor.
   */
  const onPadEdge = (edge: GamepadEdge): void => {
    emit({ t: round1(performance.now()) as number, type: 'gamepad', text: edge.text });
  };
  /** Shared empty list used when the Gamepad API is missing (avoids a per-poll allocation). */
  const noPads: GamepadLike[] = [];
  /** Polls `navigator.getGamepads()` and feeds the snapshot to the monitor. */
  function pollPads(): void {
    const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null;
    pads.update((list as ArrayLike<GamepadLike | null> | null) ?? noPads, onPadEdge);
  }

  // ---------------------------------------------------------------- snapshots / UI
  /**
   * Captures all statistics at one point in time.
   *
   * @param now - current time in ms (for holds still in progress).
   * @returns a fresh snapshot (allocates; UI / report rate only).
   */
  function snapshot(now: number): ProbeSnapshot {
    return { keys: tracker.getStats(now), frames: frames.summary(), dispatch: dispatch.summary() };
  }
  /**
   * Name lookup without learning (the DOM `event.key` is only available in the key handler).
   *
   * @param code - DOM `keyCode`.
   * @returns the display name.
   */
  const keyName = (code: number): string => names.name(code);

  /**
   * Updates the sticky checklist from a snapshot and logs newly ticked items.
   *
   * @param snap - current statistics.
   */
  function updateChecklist(snap: ProbeSnapshot): void {
    const newly = checklist.update({
      seenCodes: tracker.seenKeys().filter((s) => s.downs > 0).map((s) => s.code),
      longestHoldMs: snap.keys.longestHoldMs,
      diagonalAttempts: snap.keys.diagonal.attempts,
      chordAttempts: snap.keys.chord.attempts,
      gamepadSeen: pads.anySeen,
      leftAndReturned,
    });
    for (const id of newly) info('checklist ✓ ' + CHECKLIST_LABELS[id]);
  }

  /**
   * Refreshes every text panel (~10 Hz). {@link ProbeUI.set} skips panels whose text did not change.
   *
   * @param now - current time in ms.
   */
  function updateUI(now: number): void {
    const snap = snapshot(now);
    updateChecklist(snap);
    const verdicts = buildVerdicts(snap, keyName);
    ui.set('log', log.text());
    ui.set('verdicts', verdictLines(verdicts, snap).join('\n'));
    ui.set('checklist', checklistLines(checklist.items()).join('\n'));
    ui.set('seen', seenKeyLines(tracker.seenKeys(), keyName).join('\n'));
    ui.set('keys', registerLines(supportedCount, registered, tizen).join('\n'));
    ui.set('pads', describePads(pads.states()).join('\n'));
    if (env) {
      ui.set('env', envLines(env).join('\n'));
      ui.set('headline', envHeadline(env) + ' · session ' + session);
    }
    ui.set('report', reportStatusText(now));
  }

  /**
   * Builds the header's report status line.
   *
   * @param now - current time in ms (for "ok N s ago").
   * @returns `report: off (…)`, or the endpoint with last success, last error and in-flight state.
   */
  function reportStatusText(now: number): string {
    const st = reporter.status;
    if (st.endpoint === null) return 'report: off (build with VITE_REPORT_URL)';
    let s = 'report → ' + st.endpoint;
    if (st.lastOkSeq > 0) s += ' · #' + st.lastOkSeq + ' ok ' + ((now - st.lastOkAt) / 1000).toFixed(1) + ' s ago';
    if (st.lastError) s += ' · error: ' + st.lastError + ' (' + st.failures + ')';
    if (st.inFlight) s += ' · sending…';
    return s;
  }

  /**
   * Sends one report payload (no-op while a request is in flight); the payload parts are only built when a
   * request will actually go out.
   *
   * @param now - current time in ms.
   */
  function sendReport(now: number): void {
    reporter.send(
      () =>
        buildReportParts({
          env,
          snapshot: snapshot(now),
          keyName,
          seen: tracker.seenKeys(),
          registered,
          supportedKeys: supportedCount,
          checklist: checklist.items(),
          gamepads: padsForReport(pads.states()),
        }),
      now,
    );
  }

  // ---------------------------------------------------------------- frame loop
  let lastFrame = NaN;
  let lastUi = -Infinity;
  let lastReport = -Infinity;
  let frameNo = 0;
  /** Reused per-frame input for {@link Arena.draw} (mutated in place: no per-frame allocation). */
  const frameState = { lanes, frames, flashFrames: 0, flashLabel: '—' };

  /**
   * rAF callback: records the frame delta, ticks the tracker, polls gamepads (every frame once a pad was
   * seen, otherwise every {@link GAMEPAD_IDLE_POLL_FRAMES} frames), steps the lanes, draws the arena, and
   * refreshes the panels / sends reports at their own rates.
   *
   * @param now - rAF timestamp (ms, `performance.now()` clock).
   */
  function frame(now: number): void {
    requestAnimationFrame(frame);
    if (!Number.isNaN(lastFrame)) frames.push(now - lastFrame);
    lastFrame = now;
    frameNo++;
    tracker.tick(now);
    if (pads.anySeen || frameNo % GAMEPAD_IDLE_POLL_FRAMES === 0) pollPads();
    stepLanes(lanes, tracker, now);
    frameState.flashFrames = flashFrames;
    frameState.flashLabel = flashLabel;
    arena.draw(frameState);
    if (flashFrames > 0) flashFrames--;
    if (now - lastUi >= UI_PERIOD_MS) {
      lastUi = now;
      updateUI(now);
    }
    if (reporter.enabled && now - lastReport >= REPORT_INTERVAL_MS) {
      lastReport = now;
      sendReport(now);
    }
  }

  info('input probe started · session ' + session + (reporter.enabled ? ' · reporting to ' + reporter.status.endpoint : ''));
  updateUI(performance.now());
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
