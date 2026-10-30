/**
 * The `hb-` wire test helper (plan v20x PAGES): the session env {@link buildHarbenchPayload}
 * needs, minimized like the widget's own, and the KILLER GATE every page body is measured with —
 * wrap the record in a real payload and demand zero issues from the real validator
 * (`harbenchPayloadIssues`), exactly what the frozen wire will say on the TV.
 */
import {
  buildHarbenchPayload,
  harbenchPayloadIssues,
  makeHarbenchSessionId,
  type HarbenchEnv,
  type HarbenchRecord,
} from '@shmup/shell';

/** A build env the `hb-` pages' fake send would carry. */
export const HARB_TEST_ENV: HarbenchEnv = {
  buildId: 'test@v2',
  gameCodeHash: '0123456789ab',
  host: 'browser',
  userAgent: 'node-test',
  innerWidth: 640,
  innerHeight: 360,
  devicePixelRatio: 1,
  webGLVersion: 1,
  scenarios: 194,
  startedAt: 1_760_000_000_000,
  phase: 'S2',
  gameMode: true,
};

/**
 * The wire's verdict on one record as the page would send it.
 *
 * @param record - The body's row.
 * @returns The validator's issues (empty means the shipped send is accepted).
 */
export function harbWireIssues(record: HarbenchRecord): ReturnType<typeof harbenchPayloadIssues> {
  const session = makeHarbenchSessionId(1_760_000_000_000, 0.5);
  const payload = buildHarbenchPayload(
    session,
    1,
    1_760_000_000_001,
    HARB_TEST_ENV,
    [record],
    true,
  );
  return harbenchPayloadIssues(payload);
}
