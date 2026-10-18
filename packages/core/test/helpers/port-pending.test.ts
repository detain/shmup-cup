/**
 * The content-port gate's self-expiry (`port-pending.ts`, v2's R2-01, owner decision W4-1): once
 * the build is no longer at v1's frame and no shipped tileset is pending, the gate throws so it
 * cannot outlive R2-02's port — the twin of the stale-golden gate's check in
 * `test/golden/golden-edge.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { checkPortPendingExpiry } from './port-pending.js';

describe('the content-port gate expires by itself (v2 R2-01)', () => {
  /** The v1 frame's width and v2's: the gate counts only once the build is not at v1's. */
  const [V1_W, V2_W] = [384, 640];
  /** The message the gate's self-expiry throws. */
  const EXPIRED = 'R2-02 ported the content: delete port-pending.ts and its uses';

  it('throws once nothing is pending at v2`s frame (the gate was forgotten)', () => {
    expect(() => checkPortPendingExpiry(V2_W, false)).toThrow(EXPIRED);
  });

  it('stays quiet while the port is pending at v2`s frame', () => {
    expect(() => checkPortPendingExpiry(V2_W, true)).not.toThrow();
  });

  it('stays quiet at v1`s frame, pending or not', () => {
    expect(() => checkPortPendingExpiry(V1_W, false)).not.toThrow();
    expect(() => checkPortPendingExpiry(V1_W, true)).not.toThrow();
  });
});
