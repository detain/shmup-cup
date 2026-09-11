import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import {
  createWebAudio,
  moduleInfo,
  type AudioContextLike,
  type GainNodeLike,
} from '../../src/web-audio/index.js';

/** Minimal fake of the Web Audio API graph used by the module. */
class FakeGain implements GainNodeLike {
  readonly gain = { value: 1 };
  target: unknown = null;
  connect(destination: unknown): unknown {
    this.target = destination;
    return destination;
  }
  disconnect(): void {
    this.target = null;
  }
}

class FakeContext implements AudioContextLike {
  state = 'suspended';
  readonly destination = { name: 'destination' };
  readonly gains: FakeGain[] = [];
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('audio-web/web-audio createWebAudio', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('web-audio');
    expect(audioWeb.createWebAudio).toBe(createWebAudio);
  });

  it('creates the context lazily on unlock and wires buses into master', async () => {
    const ctx = new FakeContext();
    let created = 0;
    const audio = createWebAudio({
      createContext: () => {
        created++;
        return ctx;
      },
    });
    expect(audio.state).toBe('uninitialized');
    expect(audio.bus('sfx')).toBeNull();

    await audio.unlock();
    await audio.unlock();
    expect(created).toBe(1);
    expect(audio.state).toBe('running');
    const master = audio.bus('master') as FakeGain;
    expect(master.target).toBe(ctx.destination);
    for (const bus of ['music', 'sfx', 'ui'] as const) {
      expect((audio.bus(bus) as FakeGain).target).toBe(master);
    }
  });

  it('suspends and resumes (app hidden / visible)', async () => {
    const ctx = new FakeContext();
    const audio = createWebAudio({ createContext: () => ctx });
    await audio.unlock();
    await audio.suspend();
    expect(audio.state).toBe('suspended');
    await audio.resume();
    expect(audio.state).toBe('running');
  });

  it('remembers volumes set before unlock and clamps them', async () => {
    const audio = createWebAudio({ createContext: () => new FakeContext() });
    audio.setBusVolume('music', 0.25);
    audio.setBusVolume('sfx', 3);
    audio.setBusVolume('ui', Number.NaN);
    await audio.unlock();
    expect(audio.bus('music')?.gain.value).toBe(0.25);
    expect(audio.bus('sfx')?.gain.value).toBe(1);
    expect(audio.bus('ui')?.gain.value).toBe(0);
  });

  it('degrades gracefully without Web Audio and closes on destroy', async () => {
    const silent = createWebAudio({ createContext: () => null });
    await silent.unlock();
    expect(silent.state).toBe('uninitialized');

    const ctx = new FakeContext();
    const audio = createWebAudio({ createContext: () => ctx });
    await audio.unlock();
    await audio.destroy();
    expect(audio.state).toBe('closed');
    expect(ctx.state).toBe('closed');
    await audio.unlock();
    expect(audio.context).toBeNull();
  });
});
