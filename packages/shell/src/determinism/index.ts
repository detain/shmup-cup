/**
 * # determinism — the cross-engine determinism check (golden replays in a browser)
 *
 * **Responsibility.** Runs a `core/replay` recording in whatever JavaScript engine loaded the page
 * and reports the state hashes it computed, so a browser test can compare them with the hashes the
 * recording holds — recorded in Node's V8 — and with another browser's (shmup_feat.md §22 P1: "the
 * same replay in Chrome, Firefox, Electron, real Tizen → compare state hashes"). The simulation
 * uses only IEEE `+ − × ÷`, `Math.sqrt` and committed trig tables (decision D27), so every engine
 * must produce the same hashes tick for tick; a mismatch names the first diverging hash.
 *
 * {@link createDeterminismCheck} validates the content exactly as the shell's boot does
 * (`loadGameContent`: the engine's scripts and sprites, the behaviour checks, the foreign kinds'
 * owners) and {@link DeterminismCheck.play} plays one replay headless — a fresh session from its
 * header (`core/replay` `createReplayGame`: god mode from `assisted`, the checkpoint), every
 * recorded tick, the tick's events dropped — recording `hashWorld` every `hashInterval` ticks and
 * after the last one while the playback compares them with the recording's. No renderer, audio or
 * input is involved, so it runs in a browser without WebGL (headless Firefox on a machine without a
 * GPU cannot create a WebGL context, which the game's own boot needs).
 *
 * The web app installs it in dev / test builds only, instead of booting the game, when the page is
 * opened with `?determinism` (`apps/web` `main.ts` — {@link installDeterminismCheck} publishes it as
 * `window.__shmupDeterminism` and marks the page ready); `test/e2e/determinism.spec.ts` plays the
 * golden replays through it in Chromium and Firefox. A release build folds the branch away.
 *
 * **Implements.**
 * - shmup_feat.md §22 — cross-engine determinism test (P1)
 * - shmup_feat.md §24 — automated tests: golden replays asserting state hashes
 *
 * **Public API.** {@link createDeterminismCheck}, {@link installDeterminismCheck},
 * {@link DeterminismCheck}, {@link DeterminismRun}, {@link DeterminismWindowLike},
 * {@link DETERMINISM_GLOBAL}, {@link DETERMINISM_READY_ATTRIBUTE}.
 *
 * @module
 */
import {
  createHeadlessPlatform,
  createPlayback,
  createReplayGame,
  decodeReplay,
  defineModule,
  hashWorld,
  type ContentFile,
  type ValidationIssue,
  type WorldStatus,
} from '@shmup/core';
import { loadGameContent } from '../loader/index.js';

/** Module descriptor (see `defineModule` in `@shmup/core`). */
export const moduleInfo = defineModule({
  name: 'determinism',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §24'],
});

/** The window property {@link installDeterminismCheck} publishes the check as. */
export const DETERMINISM_GLOBAL = '__shmupDeterminism';

/**
 * The attribute {@link installDeterminismCheck} sets on the document's root element: `ready` once
 * the check exists, `error` when the content had issues.
 */
export const DETERMINISM_READY_ATTRIBUTE = 'data-shmup-determinism';

/** What one replay did in this engine ({@link DeterminismCheck.play}). */
export interface DeterminismRun {
  /** Whether every hash matched the recording's (the playback's desync report). */
  readonly ok: boolean;
  /** Hashes compared with the recording's. */
  readonly checked: number;
  /** Tick count of the first hash that differed (-1 = none). */
  readonly desyncTick: number;
  /** Ticks played. */
  readonly ticks: number;
  /**
   * `hashWorld` after every `hashInterval`-th tick, computed in this engine — the same ticks as the
   * recording's `hashes` (the last one too when the length is a multiple of the interval).
   */
  readonly hashes: readonly number[];
  /** `hashWorld` after the last tick, computed in this engine. */
  readonly finalHash: number;
  /** The World's status after the last tick. */
  readonly status: WorldStatus;
  /** Wall-clock milliseconds the playback took (from the injected clock; 0 without one). */
  readonly ms: number;
}

/** The check ({@link createDeterminismCheck}). */
export interface DeterminismCheck {
  /** The content's validation issues (empty when the content is fine — `play` needs that). */
  readonly issues: readonly ValidationIssue[];
  /**
   * Plays one replay (see the module docs).
   *
   * @param replay - A replay document (`core/replay` `encodeReplay` JSON — a golden file's text
   *   parsed, extra fields ignored).
   * @returns What happened.
   * @throws {RangeError} When the document is not a valid replay or names a stage or checkpoint
   *   the content does not have (`decodeReplay` / `createReplayGame`).
   * @throws {Error} When the content had issues.
   */
  play(replay: unknown): DeterminismRun;
}

/**
 * Creates the check on the given content (validated like the shell's boot).
 *
 * @param contentFiles - The content files (`virtual:shmup-content`).
 * @param now - A millisecond clock for {@link DeterminismRun.ms} (`performance.now`; omitted →
 *   0 ms).
 * @returns The check.
 *
 * @example
 * ```ts
 * const check = createDeterminismCheck(contentFiles, () => performance.now());
 * const run = check.play(JSON.parse(goldenText));
 * run.ok; // → true when this engine reproduced every recorded hash
 * ```
 */
export function createDeterminismCheck(
  contentFiles: readonly ContentFile[],
  now?: () => number,
): DeterminismCheck {
  const { db, issues } = loadGameContent(contentFiles);
  return {
    issues,
    play(document) {
      if (issues.length > 0) {
        throw new Error(`content has ${String(issues.length)} issue(s): ${issues[0].message}`);
      }
      const replay = decodeReplay(document);
      const playback = createPlayback(replay, { buildId: replay.header.buildId });
      const game = createReplayGame(
        { ...createHeadlessPlatform(), input: playback },
        replay.header,
        db,
      );
      const start = now === undefined ? 0 : now();
      const hashes: number[] = [];
      const interval = replay.hashInterval;
      // The starting state (a zero-tick replay's final hash).
      playback.check(game.world);
      let ticks = 0;
      while (!playback.done) {
        game.step();
        game.events.clear();
        playback.check(game.world);
        ticks++;
        if (ticks % interval === 0) hashes.push(hashWorld(game.world));
      }
      const finalHash = hashWorld(game.world);
      const report = playback.report;
      return {
        ok: report.ok,
        checked: report.checked,
        desyncTick: report.desyncTick,
        ticks,
        hashes,
        finalHash,
        status: game.world.status,
        ms: now === undefined ? 0 : now() - start,
      };
    },
  };
}

/** The bits of a window {@link installDeterminismCheck} uses. */
export interface DeterminismWindowLike {
  /** The document (its root element gets {@link DETERMINISM_READY_ATTRIBUTE}). */
  readonly document: {
    readonly documentElement: { setAttribute(name: string, value: string): void };
  };
}

/**
 * Creates the check and publishes it as `window.__shmupDeterminism` ({@link DETERMINISM_GLOBAL}),
 * then marks the document ({@link DETERMINISM_READY_ATTRIBUTE}: `ready`, or `error` when the
 * content has issues — the check still exists and reports them).
 *
 * @param win - The window.
 * @param contentFiles - The content files (`virtual:shmup-content`).
 * @param now - A millisecond clock (`performance.now`).
 * @returns The check.
 */
export function installDeterminismCheck(
  win: DeterminismWindowLike,
  contentFiles: readonly ContentFile[],
  now?: () => number,
): DeterminismCheck {
  const check = createDeterminismCheck(contentFiles, now);
  (win as unknown as Record<string, unknown>)[DETERMINISM_GLOBAL] = check;
  win.document.documentElement.setAttribute(
    DETERMINISM_READY_ATTRIBUTE,
    check.issues.length === 0 ? 'ready' : 'error',
  );
  return check;
}
