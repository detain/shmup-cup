/**
 * `rebind` (plan M1-17): the profiles a host may offer in its Options screen — only those whose
 * menu table its keys can reach (`selectableKeyProfiles`) — and the CONTROLS entries built from
 * them (`inputProfileChoices`, the platform default marked `(DEFAULT)`).
 */
import { readFileSync } from 'node:fs';
import type { ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import {
  DEFAULT_KEYBOARD_PROFILE_ID,
  DEFAULT_PROFILE_SUFFIX,
  DEFAULT_REMOTE_PROFILE_ID,
  inputProfileChoices,
  loadInputProfiles,
  parseInputProfiles,
  selectableKeyProfiles,
} from '../../src/rebind/index.js';

const SHIPPED_PATH = 'input/remote.input-profiles.json';
const shipped: ContentFile = {
  path: SHIPPED_PATH,
  data: JSON.parse(
    readFileSync(new URL(`../../../../content/${SHIPPED_PATH}`, import.meta.url), 'utf8'),
  ) as unknown,
};
const { profiles, issues } = loadInputProfiles([shipped]);

describe('rebind selectable profiles', () => {
  it('are exported from the package entry', () => {
    expect(inputWeb.selectableKeyProfiles).toBe(selectableKeyProfiles);
    expect(inputWeb.inputProfileChoices).toBe(inputProfileChoices);
    expect(inputWeb.DEFAULT_PROFILE_SUFFIX).toBe(' (DEFAULT)');
  });

  it('offer the keyboard profiles on the web and the remote profiles on the TV', () => {
    expect(issues).toEqual([]);
    expect(selectableKeyProfiles(profiles, 'code').map((p) => p.id)).toEqual([
      'keyboard-default',
      'keyboard-remote-emulation',
      'keyboard-split', // M2-06: two players on one keyboard
    ]);
    expect(selectableKeyProfiles(profiles, 'keyCode').map((p) => p.id)).toEqual([
      'tizen-remote-safe',
      'tizen-remote-diagonal',
    ]);
  });

  it('skip a profile whose menu table misses Back in the host key space', () => {
    const { profiles: custom } = parseInputProfiles({
      formatVersion: 1,
      kind: 'input-profiles',
      profiles: [
        {
          id: 'split',
          label: 'SPLIT',
          device: 'remote',
          context: {
            game: {
              byCode: {},
              byKeyCode: {
                '37': ['Left'],
                '38': ['Up'],
                '39': ['Right'],
                '40': ['Down'],
                '10252': ['Pause'],
              },
            },
            menu: {
              // Back only reachable by key code: not selectable on a keyboard.
              byCode: {
                ArrowUp: ['Up'],
                ArrowDown: ['Down'],
                ArrowLeft: ['Left'],
                ArrowRight: ['Right'],
                Enter: ['Confirm'],
              },
              byKeyCode: { '10009': ['Back'], '10252': ['Pause'] },
            },
          },
          releaseDebounceTicks: 0,
          diagonals: 'combine',
          socd: 'neutral',
          register: [],
        },
      ],
    });
    expect(custom).toHaveLength(1);
    expect(selectableKeyProfiles(custom, 'code')).toEqual([]);
    expect(selectableKeyProfiles(custom, 'keyCode')).toEqual([]); // no directions by key code
  });

  it('build the CONTROLS entries with the default marked', () => {
    expect(inputProfileChoices(profiles, 'keyCode', DEFAULT_REMOTE_PROFILE_ID)).toEqual([
      { id: 'tizen-remote-safe', label: 'SAFE 4-WAY' + DEFAULT_PROFILE_SUFFIX },
      { id: 'tizen-remote-diagonal', label: 'FAST 8-WAY' },
    ]);
    expect(inputProfileChoices(profiles, 'code', DEFAULT_KEYBOARD_PROFILE_ID)).toEqual([
      { id: 'keyboard-default', label: 'KEYBOARD (DEFAULT)' },
      { id: 'keyboard-remote-emulation', label: 'KEYBOARD AS REMOTE' },
      { id: 'keyboard-split', label: 'SPLIT KEYBOARD' },
    ]);
  });

  it('append an extra profile in use once', () => {
    const tv = profiles.find((p) => p.id === 'tizen-remote-safe') ?? null;
    const keyboard = profiles.find((p) => p.id === 'keyboard-default') ?? null;
    expect(
      inputProfileChoices(profiles, 'code', DEFAULT_KEYBOARD_PROFILE_ID, tv).map((c) => c.id),
    ).toEqual([
      'keyboard-default',
      'keyboard-remote-emulation',
      'keyboard-split',
      'tizen-remote-safe',
    ]);
    expect(
      inputProfileChoices(profiles, 'code', DEFAULT_KEYBOARD_PROFILE_ID, keyboard).map((c) => c.id),
    ).toEqual(['keyboard-default', 'keyboard-remote-emulation', 'keyboard-split']);
  });
});
