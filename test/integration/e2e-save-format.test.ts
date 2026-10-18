/**
 * `test/e2e/save-format.ts` (plan_resolution.md R2-01): the browser tests' mirror of the save
 * format equals `@shmup/core`'s `SAVE_VERSION`, so a save bump in core cannot leave the specs that
 * read a stored or exported save behind (they cannot import core). Without this pin such a bump
 * passed `pnpm test` and failed only in an e2e shard.
 */
import { SAVE_VERSION } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT } from '../e2e/save-format.js';

describe('the e2e save-format mirror', () => {
  it('equals core/save SAVE_VERSION', () => {
    expect(SAVE_FORMAT).toBe(SAVE_VERSION);
  });
});
