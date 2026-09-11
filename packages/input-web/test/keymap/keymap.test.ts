import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_BINDINGS,
  TIZEN_KEY_CODES,
  moduleInfo,
  resolveKeyActions,
} from '../../src/keymap/index.js';

describe('input-web/keymap', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('keymap');
  });

  it('resolves keyboard keys by code', () => {
    expect(resolveKeyActions('ArrowLeft', 37, DEFAULT_KEY_BINDINGS)).toBe(Action.Left);
    expect(resolveKeyActions('KeyW', 87, DEFAULT_KEY_BINDINGS)).toBe(Action.Up);
    expect(resolveKeyActions('KeyQ', 81, DEFAULT_KEY_BINDINGS)).toBe(0);
  });

  it('falls back to keyCode for Samsung remote keys with no code', () => {
    expect(resolveKeyActions('', TIZEN_KEY_CODES.Back, DEFAULT_KEY_BINDINGS)).toBe(Action.Back);
    expect(resolveKeyActions('', TIZEN_KEY_CODES.MediaPlayPause, DEFAULT_KEY_BINDINGS)).toBe(
      Action.Pause,
    );
    expect(resolveKeyActions('', TIZEN_KEY_CODES.Enter, DEFAULT_KEY_BINDINGS)).toBe(
      Action.Confirm | Action.PowerUp,
    );
    expect(resolveKeyActions('', TIZEN_KEY_CODES.ArrowUp, DEFAULT_KEY_BINDINGS)).toBe(Action.Up);
  });

  it('prefers code over keyCode so one key never counts twice', () => {
    expect(resolveKeyActions('KeyW', TIZEN_KEY_CODES.Back, DEFAULT_KEY_BINDINGS)).toBe(Action.Up);
  });
});
