import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/ipc.js';

describe('electron/shared/ipc', () => {
  it('namespaces every channel under shmup:', () => {
    for (const channel of Object.values(IPC_CHANNELS)) expect(channel).toMatch(/^shmup:/);
    expect(Object.isFrozen(IPC_CHANNELS)).toBe(true);
  });
});
