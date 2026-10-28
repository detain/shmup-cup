/**
 * The hardware-bench wire plumbing shared by every `hb-` sender of the bench widget (plan v20x
 * HARBENCH): the game-mode A/B flag read off the query, the session env of one program phase, and
 * the best-effort single-record send.
 *
 * The frozen `rb-` render-bench wire is untouched — this module only ADDS `hb-` sends beside it, so
 * a payload never mixes the two kinds (the contamination law: an old-build `rb-` session and a
 * new-build `hb-` one are separate rows on the server, keyed by their own session prefixes).
 *
 * Every sender here is a **cold path**: one page load, one session, one record, then done. The
 * frame loop never reaches this file.
 *
 * @module
 */
import {
  buildHarbenchPayload,
  makeHarbenchSessionId,
  sendHarbench,
  type HarbenchEnv,
  type HarbenchRecord,
  type RenderBenchEnv,
} from '@shmup/shell';
import { searchParam } from './matrix.js';

/**
 * The `use.game.mode` A/B flag (tizen_optimize §8.5): `?gm=0` marks an install whose `config.xml`
 * did NOT carry the game-mode property, anything else (default) marks one that did. It is a fact
 * of the INSTALL, so it rides the env of every `hb-` payload, not only the input rows.
 *
 * @param search - `location.search`.
 * @returns Whether the install runs in game mode.
 */
export function gameModeFromSearch(search: string): boolean {
  return searchParam(search, 'gm') !== '0';
}

/** The pieces one `hb-` send needs, all injected so the pages and the tests share this file. */
export interface HarbSendContext {
  /** The window (for `XMLHttpRequest` and clocks). */
  win: Window;
  /** The POST endpoint (`renderReportEndpoint`), or `null` when no log server is configured. */
  endpoint: string | null;
  /** The session-level facts the render bench already knows how to build. */
  envBase: RenderBenchEnv;
  /** The program phase of this send — `'S1'` … `'S6'`. */
  phase: string;
  /** The install's game-mode flag ({@link gameModeFromSearch}). */
  gameMode: boolean;
}

/**
 * Sends one hardware-bench record as its own `hb-` session and calls `onDone` exactly once,
 * whether the server answered, refused or timed out. Never throws; without an endpoint it settles
 * immediately (the row still lands in localStorage / the results page, as before).
 *
 * @param ctx - The send context.
 * @param record - The row to carry.
 * @param onDone - Runs after the attempt (success or not) — the caller's next page step.
 */
export function sendHarbRecord(
  ctx: HarbSendContext,
  record: HarbenchRecord,
  onDone: () => void,
): void {
  if (ctx.endpoint === null) {
    onDone();
    return;
  }
  const env: HarbenchEnv = { ...ctx.envBase, phase: ctx.phase, gameMode: ctx.gameMode };
  const session = makeHarbenchSessionId(Date.now(), Math.random());
  const payload = buildHarbenchPayload(session, 1, Date.now(), env, [record], true);
  sendHarbench(
    ctx.endpoint,
    payload,
    () => new (ctx.win as unknown as { XMLHttpRequest: new () => XMLHttpRequest }).XMLHttpRequest(),
    () => {
      onDone();
    },
  );
}
