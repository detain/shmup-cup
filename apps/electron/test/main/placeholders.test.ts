import { describe, expect, it } from 'vitest';

// steam.ts is a type-only placeholder (saves.ts is implemented since M2-17 — saves.test.ts);
// importing them must not fail.
describe('electron/main placeholders', () => {
  it('saves and steam modules import cleanly', async () => {
    await expect(import('../../src/main/saves.js')).resolves.toHaveProperty('createFileStore');
    await expect(import('../../src/main/steam.js')).resolves.toBeTypeOf('object');
  });
});
