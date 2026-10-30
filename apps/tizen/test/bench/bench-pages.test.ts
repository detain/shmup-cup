/**
 * The `hb-` page dispatch plumbing (plan v20x PAGES): the `?page=` reader, the phase map, the
 * game-mode A/B flag and the wire helper's own shape — the rules `startRenderBench` keys on
 * before any body runs.
 */
import { describe, expect, it } from 'vitest';
import {
  BOOT_PAGE_ID,
  HARB_PAGE_IDS,
  HARB_PAGE_PHASES,
  INPUT_PAGE_ID,
  PROBE_PAGE_ID,
  SOAK_PAGE_ID,
  gameModeFromSearch,
  harbPageFromSearch,
} from '../../src/bench/index.js';
import { HARB_TEST_ENV } from './fake-harb-env.js';

describe('hb- page dispatch (plan v20x PAGES)', () => {
  it('lists the four measurement pages', () => {
    expect(HARB_PAGE_IDS).toEqual([BOOT_PAGE_ID, SOAK_PAGE_ID, PROBE_PAGE_ID, INPUT_PAGE_ID]);
  });

  it('maps each page to its program phase (the scout S-letters)', () => {
    expect(HARB_PAGE_PHASES[BOOT_PAGE_ID]).toBe('S2');
    expect(HARB_PAGE_PHASES[SOAK_PAGE_ID]).toBe('S2');
    expect(HARB_PAGE_PHASES[INPUT_PAGE_ID]).toBe('S3');
    expect(HARB_PAGE_PHASES[PROBE_PAGE_ID]).toBe('S4');
  });

  it('reads ?page= verbatim — an unknown id survives for the loud failure', () => {
    expect(harbPageFromSearch('?page=soak')).toBe('soak');
    expect(harbPageFromSearch('page=boot&reps=3')).toBe('boot');
    expect(harbPageFromSearch('?scenario=decode')).toBeNull();
    expect(harbPageFromSearch('')).toBeNull();
    expect(harbPageFromSearch('?page=poetry')).toBe('poetry');
  });

  it('carries the game-mode A/B flag on the env like every other hb- send', () => {
    expect(gameModeFromSearch('')).toBe(true);
    expect(gameModeFromSearch('?page=input&gm=0')).toBe(false);
    expect(gameModeFromSearch('?gm=1')).toBe(true);
    expect(HARB_TEST_ENV.phase).toBe('S2');
    expect(HARB_TEST_ENV.gameMode).toBe(true);
  });
});
