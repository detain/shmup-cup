/**
 * The video kill switch resolution (v2 R7-VID): the precedence chain the boot consults before
 * the renderer exists — explicit host option, `SHMUP_NO_VIDEO`, `?novid=1`, the `?video=` probe,
 * the stored choice, the shipped default — and the probe parser.
 */
import { describe, expect, it } from 'vitest';
import {
  VIDEO_DEFAULT_ON,
  VIDEO_SETTING_KEY,
  resolveVideoSetting,
  videoProbeFromSearch,
  videoSettingFromWindow,
} from '../../src/cutscene/index.js';

/** A window fake: search, global and a storage that can be absent or throwing. */
function fakeWin(fields: {
  search?: string;
  global?: unknown;
  stored?: string | null;
  denied?: boolean;
}): Parameters<typeof videoSettingFromWindow>[0] {
  return {
    location: { search: fields.search ?? '' },
    localStorage: fields.denied
      ? {
          getItem(): string | null {
            throw new Error('denied');
          },
        }
      : {
          getItem(key: string): string | null {
            return key === VIDEO_SETTING_KEY ? (fields.stored ?? null) : null;
          },
        },
    SHMUP_NO_VIDEO: fields.global,
  };
}

describe('cutscene — resolveVideoSetting precedence', () => {
  it('the host option wins over everything (both ways)', () => {
    expect(
      resolveVideoSetting({
        override: false,
        noVideoGlobal: 0,
        search: '?video=title-sting',
        storedSetting: 'on',
      }),
    ).toBe(false);
    expect(
      resolveVideoSetting({
        override: true,
        noVideoGlobal: 1,
        search: '?novid=1',
        storedSetting: 'off',
      }),
    ).toBe(true);
  });

  it('SHMUP_NO_VIDEO, ?novid=1 and a stored off switch it off; a stored on switches it on', () => {
    expect(resolveVideoSetting({ noVideoGlobal: 1 })).toBe(false);
    expect(resolveVideoSetting({ noVideoGlobal: '1' })).toBe(false);
    expect(resolveVideoSetting({ noVideoGlobal: true })).toBe(false);
    expect(resolveVideoSetting({ search: '?a=1&novid=1&x' })).toBe(false);
    expect(resolveVideoSetting({ storedSetting: 'off' })).toBe(false);
    expect(resolveVideoSetting({ storedSetting: 'on' })).toBe(true);
  });

  it('the probe overrides a stored off (a tool, not a choice), but not novid or the global', () => {
    expect(resolveVideoSetting({ search: '?video=title-sting', storedSetting: 'off' })).toBe(true);
    expect(resolveVideoSetting({ search: '?novid=1&video=title-sting' })).toBe(false);
    expect(resolveVideoSetting({ search: '?video=title-sting', noVideoGlobal: 1 })).toBe(false);
  });

  it('absent everything falls to the shipped default', () => {
    expect(resolveVideoSetting({})).toBe(VIDEO_DEFAULT_ON);
  });

  it('the window reader maps storage denials to no stored choice and reads the fields', () => {
    expect(videoSettingFromWindow(fakeWin({ denied: true }))).toBe(VIDEO_DEFAULT_ON);
    expect(videoSettingFromWindow(fakeWin({ stored: 'off' }))).toBe(false);
    expect(videoSettingFromWindow({}, true)).toBe(true);
    expect(videoSettingFromWindow(fakeWin({ global: 1 }))).toBe(false);
  });
});

describe('cutscene — videoProbeFromSearch', () => {
  it('names a known clip from anywhere in the search', () => {
    expect(videoProbeFromSearch('?video=attract-ambient')).toBe('attract-ambient');
    expect(videoProbeFromSearch('?a=1&video=warn-zone-b&b=2')).toBe('warn-zone-b');
    expect(videoProbeFromSearch('?video=story-vista')).toBe('story-vista');
  });

  it('refuses unknown ids, empties and the bare substring of another key', () => {
    expect(videoProbeFromSearch('?video=nope')).toBeNull();
    expect(videoProbeFromSearch('?video=')).toBeNull();
    expect(videoProbeFromSearch('?xvideo=title-sting')).toBeNull();
  });
});
