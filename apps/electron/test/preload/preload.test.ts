import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/ipc.js';

const preloadSource = readFileSync(
  new URL('../../src/preload/preload.cts', import.meta.url),
  'utf8',
);

// The sandboxed preload cannot import shared/ipc.ts, so it repeats the channel names.
describe('electron/preload', () => {
  it('uses the same quit channel as the main process', () => {
    expect(preloadSource).toContain(`const QUIT_CHANNEL = '${IPC_CHANNELS.quit}';`);
  });

  it('uses the same storage channels as the main process (M2-17)', () => {
    expect(preloadSource).toContain(`const STORAGE_GET_CHANNEL = '${IPC_CHANNELS.storageGet}';`);
    expect(preloadSource).toContain(`const STORAGE_SET_CHANNEL = '${IPC_CHANNELS.storageSet}';`);
  });

  it('exposes only the narrow shmupElectron API via contextBridge', () => {
    expect(preloadSource).toContain("exposeInMainWorld('shmupElectron'");
    expect(preloadSource).not.toMatch(/nodeIntegration|require\(['"](fs|child_process)/);
  });
});
