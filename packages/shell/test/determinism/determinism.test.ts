/**
 * The cross-engine determinism check (plan M2-18, `determinism` module) in Node: a golden replay
 * played through it reproduces every recorded hash — the same list the browsers must produce —,
 * a tampered hash is reported at its tick, content with issues refuses to play, and the install
 * publishes the check on the window and marks the document.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  DETERMINISM_GLOBAL,
  DETERMINISM_READY_ATTRIBUTE,
  createDeterminismCheck,
  installDeterminismCheck,
  moduleInfo,
} from '../../src/determinism/index.js';

/** A golden replay document of `test/golden/` (M1-19). */
interface GoldenDocument {
  /** Recorded ticks. */
  readonly ticks: number;
  /** Hash interval. */
  readonly hashInterval: number;
  /** Hashes every interval. */
  readonly hashes: readonly number[];
  /** Hash after the last tick. */
  readonly finalHash: number;
  /** Anything else of the file. */
  readonly [key: string]: unknown;
}

/**
 * Reads a golden replay.
 *
 * @param name - File name without `.replay.json`.
 * @returns The parsed document.
 */
function golden(name: string): GoldenDocument {
  return JSON.parse(
    readFileSync(new URL(`../../../../test/golden/${name}.replay.json`, import.meta.url), 'utf8'),
  ) as GoldenDocument;
}

const FILES = readContentFiles();

describe('shell/determinism', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('determinism');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('reproduces every hash of a golden replay, the same list the file holds', () => {
    let clock = 0;
    const check = createDeterminismCheck(FILES, () => (clock += 5));
    expect(check.issues).toEqual([]);
    for (const name of ['zone-a-manta-boss', 'zone-a-type-d']) {
      const doc = golden(name);
      const run = check.play(doc);
      expect(run.ok, name).toBe(true);
      expect(run.desyncTick).toBe(-1);
      expect(run.ticks).toBe(doc.ticks);
      expect(run.hashes).toEqual(doc.hashes);
      expect(run.finalHash).toBe(doc.finalHash);
      expect(run.checked).toBe(doc.hashes.length + 1);
      expect(run.ms).toBeGreaterThan(0);
    }
  });

  it('reports the first recorded hash this engine does not reproduce', () => {
    const doc = golden('zone-a-manta-boss');
    const tampered = { ...doc, hashes: doc.hashes.map((h, i) => (i === 0 ? (h ^ 1) >>> 0 : h)) };
    const run = createDeterminismCheck(FILES).play(tampered);
    expect(run.ok).toBe(false);
    expect(run.desyncTick).toBe(doc.hashInterval);
    // The engine's own hashes are still the true ones.
    expect(run.hashes).toEqual(doc.hashes);
    expect(run.ms).toBe(0);
  });

  it('throws for a document that is not a replay', () => {
    expect(() => createDeterminismCheck(FILES).play({ kind: 'replay' })).toThrow(RangeError);
  });

  it('refuses to play on content with issues, and the install marks the page as failed', () => {
    const broken = [...FILES, { path: 'stages/broken.stage.json', data: { kind: 'stage' } }];
    const attributes: Record<string, string> = {};
    const win = {
      document: {
        documentElement: {
          setAttribute(name: string, value: string): void {
            attributes[name] = value;
          },
        },
      },
    };
    const check = installDeterminismCheck(win, broken);
    expect(check.issues.length).toBeGreaterThan(0);
    expect(attributes[DETERMINISM_READY_ATTRIBUTE]).toBe('error');
    expect((win as unknown as Record<string, unknown>)[DETERMINISM_GLOBAL]).toBe(check);
    expect(() => check.play(golden('zone-a-manta-boss'))).toThrow(/issue/);
  });

  it('publishes a working check and marks the page ready', () => {
    const attributes: Record<string, string> = {};
    const win = {
      document: {
        documentElement: { setAttribute: (n: string, v: string) => (attributes[n] = v) },
      },
    };
    const check = installDeterminismCheck(win, FILES);
    expect(attributes).toEqual({ [DETERMINISM_READY_ATTRIBUTE]: 'ready' });
    expect((win as unknown as Record<string, unknown>)[DETERMINISM_GLOBAL]).toBe(check);
  });
});
