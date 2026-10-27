/**
 * The stills switch resolution (plan v20x A4): the precedence chain the boot consults before
 * the renderer exists — explicit host option, `SHMUP_NO_STILLS`, `?nostills=1`, the `?still=`
 * probe, the shipped default (ON) — and the probe parser. No stored choice exists for the
 * stills on purpose: a backdrop is not a player setting, and the default needs no opt-in
 * because a static decode carries none of the video's measured media risk (R7-VID).
 */
import { describe, expect, it } from 'vitest';
import {
  STILL_DEFAULT_ON,
  resolveStillsSetting,
  stillProbeFromSearch,
  stillsSettingFromWindow,
} from '../../src/stills/index.js';

/** A window fake: search and a global that can be absent or set. */
function fakeWin(fields: {
  search?: string;
  global?: unknown;
}): Parameters<typeof stillsSettingFromWindow>[0] {
  return {
    location: { search: fields.search ?? '' },
    SHMUP_NO_STILLS: fields.global,
  };
}

describe('stills — resolveStillsSetting precedence', () => {
  it('the host option wins over everything (both ways)', () => {
    expect(
      resolveStillsSetting({
        override: false,
        noStillsGlobal: 0,
        search: '?still=ending-citadel-falls',
      }),
    ).toBe(false);
    expect(
      resolveStillsSetting({
        override: true,
        noStillsGlobal: 1,
        search: '?nostills=1',
      }),
    ).toBe(true);
  });

  it('SHMUP_NO_STILLS and ?nostills=1 switch it off', () => {
    expect(resolveStillsSetting({ noStillsGlobal: 1 })).toBe(false);
    expect(resolveStillsSetting({ noStillsGlobal: '1' })).toBe(false);
    expect(resolveStillsSetting({ noStillsGlobal: true })).toBe(false);
    expect(resolveStillsSetting({ search: '?a=1&nostills=1&x' })).toBe(false);
  });

  it('the probe overrides the default — but not nostills or the global', () => {
    expect(resolveStillsSetting({ search: '?still=ending-citadel-falls' })).toBe(true);
    expect(resolveStillsSetting({ search: '?nostills=1&still=ending-citadel-falls' })).toBe(false);
    expect(resolveStillsSetting({ search: '?still=ending-citadel-falls', noStillsGlobal: 1 })).toBe(
      false,
    );
  });

  it('absent everything falls to the shipped default (which is ON)', () => {
    expect(resolveStillsSetting({})).toBe(STILL_DEFAULT_ON);
    expect(STILL_DEFAULT_ON).toBe(true);
  });

  it('the window reader maps an absent location and global to the default', () => {
    expect(stillsSettingFromWindow({})).toBe(STILL_DEFAULT_ON);
    expect(stillsSettingFromWindow(fakeWin({ search: '?nostills=1' }))).toBe(false);
    expect(stillsSettingFromWindow({}, true)).toBe(true);
    expect(stillsSettingFromWindow(fakeWin({ global: 1 }))).toBe(false);
  });
});

describe('stills — stillProbeFromSearch', () => {
  it('names a known surface from anywhere in the search', () => {
    expect(stillProbeFromSearch('?still=ending-citadel-falls')).toBe('ending-citadel-falls');
    expect(stillProbeFromSearch('?a=1&still=ending-deep-is-still&b=2')).toBe(
      'ending-deep-is-still',
    );
  });

  it('refuses unknown ids, empties and the bare substring of another key', () => {
    expect(stillProbeFromSearch('?still=nope')).toBeNull();
    expect(stillProbeFromSearch('?still=')).toBeNull();
    expect(stillProbeFromSearch('?xstill=ending-citadel-falls')).toBeNull();
  });
});
