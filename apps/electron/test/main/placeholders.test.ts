import { describe, expect, it } from 'vitest';

// saves.ts / steam.ts are type-only placeholders; importing them must not fail.
describe('electron/main placeholders', () => {
  it('saves and steam modules import cleanly', async () => {
    await expect(import('../../src/main/saves.js')).resolves.toBeTypeOf('object');
    await expect(import('../../src/main/steam.js')).resolves.toBeTypeOf('object');
  });
});
