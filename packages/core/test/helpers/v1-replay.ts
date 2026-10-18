/**
 * Test helper for v2's R2-01 replay refusal (owner decision W4-7): turns a replay recorded at the
 * current frame into one that **another frame** recorded, the way a replay of v1 (384×216) looks
 * to a 640×360 build — its header config's `internalWidth` × `internalHeight` changed, nothing
 * else. {@link OTHER_FRAME} is v2's frame while the code runs at v1's, and v1's after the flip, so
 * the tests that use it hold at both frames.
 */
import { FRAME_H, FRAME_W } from '../../src/config/index.js';

/** The v1 frame (the replays v1 recorded hold it in their header config). */
const V1_FRAME: readonly [number, number] = Object.freeze([384, 216]);

/** The v2 frame. */
const V2_FRAME: readonly [number, number] = Object.freeze([640, 360]);

/** A frame that is not the current one: v2's at 384×216, v1's at 640×360. */
export const OTHER_FRAME: readonly [number, number] =
  FRAME_W === V1_FRAME[0] && FRAME_H === V1_FRAME[1] ? V2_FRAME : V1_FRAME;

/**
 * Sets a replay document's recorded frame (a `ReplayJson`-shaped object — `header.config`).
 *
 * @param doc - The parsed replay document (changed in place).
 * @param frame - The frame (default {@link OTHER_FRAME}).
 * @returns The same document.
 */
export function withFrame<T>(doc: T, frame: readonly [number, number] = OTHER_FRAME): T {
  const header = (doc as { header: { config: Record<string, unknown> } }).header;
  header.config.internalWidth = frame[0];
  header.config.internalHeight = frame[1];
  return doc;
}

/**
 * A run replay's text as another frame recorded it: every segment's replay gets
 * {@link OTHER_FRAME} (see {@link withFrame}).
 *
 * @param text - A run replay's text (`runReplayText`).
 * @returns The changed text.
 */
export function runTextAtOtherFrame(text: string): string {
  const doc = JSON.parse(text) as { segments: Array<{ replay: unknown }> };
  for (const segment of doc.segments) withFrame(segment.replay);
  return JSON.stringify(doc);
}
