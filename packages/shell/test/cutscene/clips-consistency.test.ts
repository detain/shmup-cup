/**
 * The manifest's promise to the encode kit: the committed `VIDEO_CLIPS` table equals the
 * ledger's when the ledger exists. A checkout or CI job that never ran ffmpeg has no ledger
 * (the kit loud-skips, ships no clips and the director degrades silently) — that absence is the
 * supported video-less build variant, so only the byte cross-check waits for it; the table's
 * own invariants always run. The total-bytes pin is the budget-disclosure figure: a clip
 * changed makes it red together with the ledger, pointing at the DIST_BUDGET arithmetic.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VIDEO_CLIPS } from '../../src/cutscene/index.js';

/** The kit's output directory, absolute (four folders up from this test is the repo root). */
const LEDGER_PATH = fileURLToPath(
  new URL('../../../../assets/generated/video/video-ledger.json', import.meta.url),
);

/** A ledger row (the encode kit's record). */
interface LedgerRow {
  id: string;
  file: string;
  bytes: number;
  loop: boolean;
}

/** The whole set's byte total (the disclosure figure — 15 clips, encode kit of 2026-10-27). */
export const VIDEO_TOTAL_BYTES = 6_803_092;

describe('cutscene — the manifest against the encode kit', () => {
  it('holds the fifteen ids and its own byte total', () => {
    let total = 0;
    for (const row of VIDEO_CLIPS) total += row.bytes;
    expect(VIDEO_CLIPS).toHaveLength(15);
    expect(total).toBe(VIDEO_TOTAL_BYTES);
  });

  it('equals the ledger file for file, bytes and loop when the clips were encoded', () => {
    if (!existsSync(LEDGER_PATH)) return; // the video-less build variant (no ffmpeg)
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as { clips: LedgerRow[] };
    const rows = ledger.clips.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const mine = VIDEO_CLIPS.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(rows.length).toBe(mine.length);
    for (let i = 0; i < rows.length; i++) {
      expect(mine[i]).toMatchObject({
        file: rows[i].file,
        bytes: rows[i].bytes,
        loop: rows[i].loop,
      });
    }
  });
});
