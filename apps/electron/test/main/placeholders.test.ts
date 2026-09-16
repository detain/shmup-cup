import { describe, expect, it } from 'vitest';

// Both modules are implemented now — saves.ts since M2-17 (saves.test.ts), steam.ts since M3-03
// (steam.test.ts). This file only keeps the cheap guard that the main process's modules import.
describe('electron/main modules', () => {
  it('saves and steam modules import cleanly', async () => {
    await expect(import('../../src/main/saves.js')).resolves.toHaveProperty('createFileStore');
    await expect(import('../../src/main/steam.js')).resolves.toHaveProperty('initSteam');
  });
});
