/**
 * The **content-port gate** of v2's R2-01 (owner decision W4-1): between R2-01's flip of the frame
 * (12-px tiles, `TILE_SIZE` 12) and R2-02's ×1.5 port of `content/`, the shipped content is still
 * v1-scale (8-px tiles, v1 positions and speeds), so the tests that read it and fail **only because
 * of that** skip loudly, the reason in their name, instead of turning master CI red. A failure that
 * comes from a test's own fixture is fixed, never gated.
 *
 * - {@link CONTENT_PORT_PENDING} — whether a shipped tileset (`content/tilesets/*.tileset.json`)
 *   is not at `TILE_SIZE`: `false` while the code runs at 384×216 (8 = 8: every gate is off),
 *   `true` from the flip until R2-02 ports the content.
 * - **It expires by itself** ({@link checkPortPendingExpiry}): once the frame is no longer v1's and
 *   no tileset is pending, importing this module throws `R2-02 ported the content: delete
 *   port-pending.ts and its uses` — R2-02 deletes this file and every gate, and each gated test
 *   must then pass.
 * - {@link describePortPending} / {@link itPortPending} — `describe.skipIf` / `it.skipIf` on
 *   {@link CONTENT_PORT_PENDING}, with {@link PORT_PENDING_REASON} appended to the name.
 *
 * Imported by relative path from the other projects' tests, like `alloc.ts`
 * (`../../packages/core/test/helpers/port-pending.js`). The golden-replay twin of this gate is
 * `test/golden/stale.ts` (`GOLDENS_STALE`, until R2-03).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { FRAME_W, TILE_SIZE } from '../../src/config/index.js';

/**
 * The v1 frame's width (the code ran at it until R2-01's flip). Typed `number`, not `384`: after
 * the flip `FRAME_W` is the literal type `640`, and comparing two literal types that never overlap
 * fails the typecheck (TS2367).
 */
const V1_FRAME_W: number = 384;

/** The repository's `content/tilesets/` folder. */
const TILESETS = fileURLToPath(new URL('../../../../content/tilesets/', import.meta.url));

/**
 * Every shipped tileset's `tileSize`, by file name (the format example included).
 *
 * @returns `[file, tileSize]` pairs, sorted by file.
 */
export function shippedTileSizes(): Array<readonly [string, unknown]> {
  return readdirSync(TILESETS)
    .filter((name) => name.endsWith('.tileset.json'))
    .sort()
    .map((name) => {
      const data = JSON.parse(readFileSync(join(TILESETS, name), 'utf8')) as { tileSize?: unknown };
      return [name, data.tileSize] as const;
    });
}

/**
 * Whether R2-02's content port is still pending: a shipped tileset is not at `TILE_SIZE` (R2-01
 * flipped the tiles to 12 px; the content's are v1's 8 until R2-02 ports them).
 */
export const CONTENT_PORT_PENDING: boolean = shippedTileSizes().some(
  ([, size]) => size !== TILE_SIZE,
);

/**
 * The gate's self-expiry, run when this module is imported: throws once the frame is no longer
 * v1's and no shipped tileset is pending — R2-02 ported the content, so the gate must go.
 *
 * @param frameW - The build's frame width (`FRAME_W`).
 * @param pending - Whether the content port is pending ({@link CONTENT_PORT_PENDING}).
 * @throws {Error} `R2-02 ported the content: delete port-pending.ts and its uses` when the gate has
 *   expired.
 */
export function checkPortPendingExpiry(frameW: number, pending: boolean): void {
  if (frameW !== V1_FRAME_W && !pending) {
    throw new Error('R2-02 ported the content: delete port-pending.ts and its uses');
  }
}

checkPortPendingExpiry(FRAME_W, CONTENT_PORT_PENDING);

/** What a gated test's name says (`… [R2-01 gate: skipped while …]`). */
export const PORT_PENDING_REASON = "R2-01 gate: skipped while R2-02's content port is pending";

/**
 * A `describe` skipped while the content port is pending ({@link CONTENT_PORT_PENDING}).
 *
 * @param name - The suite's name (the reason is appended).
 * @param fn - The suite.
 */
export function describePortPending(name: string, fn: () => void): void {
  describe.skipIf(CONTENT_PORT_PENDING)(`${name} [${PORT_PENDING_REASON}]`, fn);
}

/**
 * An `it` skipped while the content port is pending ({@link CONTENT_PORT_PENDING}).
 *
 * @param name - The test's name (the reason is appended).
 * @param fn - The test.
 * @param timeout - Its timeout in milliseconds (default the project's).
 */
export function itPortPending(
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  it.skipIf(CONTENT_PORT_PENDING)(`${name} [${PORT_PENDING_REASON}]`, fn, timeout);
}
