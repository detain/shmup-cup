/**
 * Edge cases of the Web Audio back-end: the default context factory (latencyHint
 * 'interactive', webkit fallback), state mapping, idempotent suspend/resume, volume
 * clamping on live buses and teardown.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWebAudio,
  type AudioContextLike,
  type GainNodeLike,
} from '../../src/web-audio/index.js';

/** Recording fake of the Web Audio graph. */
class FakeGain implements GainNodeLike {
  readonly gain = { value: 1 };
  connections: unknown[] = [];
  disconnected = 0;
  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }
  disconnect(): void {
    this.disconnected++;
  }
}

class FakeContext implements AudioContextLike {
  state = 'suspended';
  readonly destination = {};
  readonly gains: FakeGain[] = [];
  calls: string[] = [];
  constructor(readonly options?: unknown) {}
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  resume(): Promise<void> {
    this.calls.push('resume');
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.calls.push('suspend');
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.calls.push('close');
    this.state = 'closed';
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('audio-web/web-audio default context factory', () => {
  it('returns no context outside a browser (Node / workers without window)', async () => {
    const audio = createWebAudio();
    await audio.unlock();
    expect(audio.context).toBeNull();
    expect(audio.state).toBe('uninitialized');
  });

  it("creates new AudioContext({ latencyHint: 'interactive' })", async () => {
    const created: FakeContext[] = [];
    vi.stubGlobal('window', {});
    vi.stubGlobal(
      'AudioContext',
      class extends FakeContext {
        constructor(options?: unknown) {
          super(options);
          created.push(this);
        }
      },
    );
    const audio = createWebAudio();
    await audio.unlock();
    expect(created).toHaveLength(1);
    expect(created[0]?.options).toEqual({ latencyHint: 'interactive' });
    expect(audio.state).toBe('running');
  });

  it('falls back to webkitAudioContext on old WebKit', async () => {
    const created: FakeContext[] = [];
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('window', {
      webkitAudioContext: class extends FakeContext {
        constructor(options?: unknown) {
          super(options);
          created.push(this);
        }
      },
    });
    const audio = createWebAudio();
    await audio.unlock();
    expect(created[0]?.options).toEqual({ latencyHint: 'interactive' });
  });

  it('stays silent when the browser has no Web Audio at all', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('window', {});
    const audio = createWebAudio();
    await audio.unlock();
    expect(audio.state).toBe('uninitialized');
  });
});

describe('audio-web/web-audio state and lifecycle', () => {
  it('maps Safari "interrupted" to suspended and an externally closed context to closed', async () => {
    const ctx = new FakeContext();
    const audio = createWebAudio({ createContext: () => ctx });
    await audio.unlock();
    ctx.state = 'interrupted';
    expect(audio.state).toBe('suspended');
    ctx.state = 'closed';
    expect(audio.state).toBe('closed');
  });

  it('does not call resume() on unlock when the context already runs', async () => {
    const ctx = new FakeContext();
    ctx.state = 'running';
    const audio = createWebAudio({ createContext: () => ctx });
    await audio.unlock();
    expect(ctx.calls).toEqual([]);
  });

  it('suspend/resume are no-ops before unlock and idempotent afterwards', async () => {
    const ctx = new FakeContext();
    const audio = createWebAudio({ createContext: () => ctx });
    await audio.suspend();
    await audio.resume();
    expect(audio.context).toBeNull();

    await audio.unlock();
    await audio.suspend();
    await audio.suspend();
    await audio.resume();
    await audio.resume();
    expect(ctx.calls).toEqual(['resume', 'suspend', 'resume']);
  });

  it('retries context creation on the next unlock when it was unavailable', async () => {
    let attempt = 0;
    const ctx = new FakeContext();
    const audio = createWebAudio({ createContext: () => (++attempt === 1 ? null : ctx) });
    await audio.unlock();
    expect(audio.context).toBeNull();
    await audio.unlock();
    expect(audio.context).toBe(ctx);
    expect(attempt).toBe(2);
  });

  it('propagates a rejected resume() (autoplay policy) to the caller of unlock()', async () => {
    const ctx = new FakeContext();
    ctx.resume = () => Promise.reject(new Error('NotAllowedError'));
    const audio = createWebAudio({ createContext: () => ctx });
    await expect(audio.unlock()).rejects.toThrow('NotAllowedError');
    expect(audio.state).toBe('suspended');
  });

  it('builds exactly four gain nodes: master → destination, music/sfx/ui → master', async () => {
    const ctx = new FakeContext();
    const audio = createWebAudio({ createContext: () => ctx });
    await audio.unlock();
    expect(ctx.gains).toHaveLength(4);
    const master = audio.bus('master') as FakeGain;
    expect(master.connections).toEqual([ctx.destination]);
    for (const bus of ['music', 'sfx', 'ui'] as const) {
      expect((audio.bus(bus) as FakeGain).connections).toEqual([master]);
    }
  });

  it('applies volume changes to live buses, clamped to 0…1', async () => {
    const audio = createWebAudio({ createContext: () => new FakeContext() });
    await audio.unlock();
    audio.setBusVolume('master', 0.5);
    audio.setBusVolume('sfx', -2);
    audio.setBusVolume('music', Number.POSITIVE_INFINITY);
    audio.setBusVolume('ui', 1);
    expect(audio.bus('master')?.gain.value).toBe(0.5);
    expect(audio.bus('sfx')?.gain.value).toBe(0);
    expect(audio.bus('music')?.gain.value).toBe(1);
    expect(audio.bus('ui')?.gain.value).toBe(1);
  });

  it('destroy() disconnects every bus, forgets the nodes and never recreates the context', async () => {
    let created = 0;
    const ctx = new FakeContext();
    const audio = createWebAudio({
      createContext: () => {
        created++;
        return ctx;
      },
    });
    await audio.unlock();
    const nodes = ctx.gains.slice();
    await audio.destroy();
    for (const node of nodes) expect(node.disconnected).toBe(1);
    expect(audio.bus('master')).toBeNull();
    await audio.unlock();
    await audio.resume();
    expect(created).toBe(1);
    expect(audio.state).toBe('closed');
    audio.setBusVolume('music', 0.3); // no live node — must not throw
  });

  it('destroy() before unlock closes nothing and blocks later unlocks', async () => {
    let created = 0;
    const audio = createWebAudio({
      createContext: () => {
        created++;
        return new FakeContext();
      },
    });
    await audio.destroy();
    await audio.unlock();
    expect(created).toBe(0);
    expect(audio.state).toBe('closed');
  });

  it('destroy() does not close an already closed context', async () => {
    const ctx = new FakeContext();
    const audio = createWebAudio({ createContext: () => ctx });
    await audio.unlock();
    ctx.state = 'closed';
    await audio.destroy();
    expect(ctx.calls).not.toContain('close');
  });
});
