/**
 * The manifest's promise to the encode kit: the committed `STILL_SURFACES` table equals the
 * ledger's when the ledger exists. A checkout that never ran the kit has no ledger (the build's
 * `shmupStills` plugin renders it, the director degrades silently on a miss) — that absence is
 * the supported still-less build variant, so only the byte cross-check waits for it; the table's
 * own invariants always run. The total-bytes pin is the budget-disclosure figure (the ~292 KB
 * dist addition of plan v20x A4, printed in the lane report): a still changed makes it red
 * together with the ledger, pointing at the DIST_BUDGET arithmetic.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STILL_SURFACES } from '../../src/stills/index.js';

/** The kit's output directory, absolute (four folders up from this test is the repo root). */
const LEDGER_PATH = fileURLToPath(
  new URL('../../../../assets/generated/stills/stills-ledger.json', import.meta.url),
);

/** A ledger row (the encode kit's record). */
interface LedgerRow {
  file: string;
  bytes: number;
  ending: string;
}

/** The whole set's byte total (the disclosure figure — 5 stills, encode kit of 2026-10-27). */
export const STILLS_TOTAL_BYTES = 277_485;

describe('stills — the manifest against the encode kit', () => {
  it('holds the five ids and its own byte total', () => {
    let total = 0;
    for (const row of STILL_SURFACES) total += row.bytes;
    expect(STILL_SURFACES).toHaveLength(5);
    expect(total).toBe(STILLS_TOTAL_BYTES);
  });

  it('equals the ledger file for file, bytes and ending when the stills were encoded', () => {
    if (!existsSync(LEDGER_PATH)) return; // the still-less build variant (no kit run yet)
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as { stills: LedgerRow[] };
    const rows = ledger.stills.slice().sort((a, b) => (a.file < b.file ? -1 : 1));
    const mine = STILL_SURFACES.slice().sort((a, b) => (a.file < b.file ? -1 : 1));
    expect(rows.length).toBe(mine.length);
    for (let i = 0; i < rows.length; i++) {
      expect(mine[i]).toMatchObject({
        file: rows[i].file,
        bytes: rows[i].bytes,
        ending: rows[i].ending,
      });
    }
  });
});
