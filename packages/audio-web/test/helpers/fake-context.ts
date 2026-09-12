/**
 * A recording fake of the Web Audio API for the audio-web tests: a context whose clock the test
 * sets (`currentTime`), buffers backed by real `Float32Array`s, and nodes that log connections,
 * starts, stops and every scheduled parameter change.
 */
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioGainNodeLike,
  AudioParamLike,
  PlaybackContextLike,
  StereoPannerNodeLike,
} from '../../src/web-audio/index.js';

/** One scheduled parameter change. */
export type ParamCall =
  | { readonly op: 'set'; readonly value: number; readonly time: number }
  | { readonly op: 'ramp'; readonly value: number; readonly time: number }
  | { readonly op: 'cancel'; readonly time: number };

/** A recording `AudioParam`. */
export class FakeParam implements AudioParamLike {
  value: number;
  readonly calls: ParamCall[] = [];

  /** @param value - Initial value. */
  constructor(value: number) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number): this {
    this.calls.push({ op: 'set', value, time });
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.calls.push({ op: 'ramp', value, time });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.calls.push({ op: 'cancel', time });
    return this;
  }
}

/** Shared node behaviour: records connections. */
class FakeNode {
  readonly connections: unknown[] = [];
  disconnected = 0;

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected++;
    this.connections.length = 0;
  }
}

/** A recording gain node. */
export class FakeGain extends FakeNode implements AudioGainNodeLike {
  readonly gain = new FakeParam(1);
}

/** A recording stereo panner. */
export class FakePanner extends FakeNode implements StereoPannerNodeLike {
  readonly pan = new FakeParam(0);
}

/** A buffer backed by `Float32Array`s. */
export class FakeBuffer implements AudioBufferLike {
  readonly channels: Float32Array[] = [];

  /**
   * @param numberOfChannels - Channels.
   * @param length - Frames.
   * @param sampleRate - Rate.
   */
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    for (let c = 0; c < numberOfChannels; c++) this.channels.push(new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

/** A recording buffer source. */
export class FakeSource extends FakeNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started: number | null = null;
  stopped: number | null = null;
  stops = 0;

  start(when = 0): void {
    this.started = when;
  }

  stop(when = 0): void {
    this.stops++;
    this.stopped = when;
  }
}

/** A playback context with a hand-driven clock. */
export class FakeContext implements PlaybackContextLike {
  state = 'running';
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination = { name: 'destination' };
  readonly gains: FakeGain[] = [];
  readonly panners: FakePanner[] = [];
  readonly sources: FakeSource[] = [];
  readonly buffers: FakeBuffer[] = [];
  /** Set to `false` to simulate an engine without `createStereoPanner`. */
  hasPanner = true;

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    const buffer = new FakeBuffer(channels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  get createStereoPanner(): (() => FakePanner) | undefined {
    if (!this.hasPanner) return undefined;
    return () => {
      const panner = new FakePanner();
      this.panners.push(panner);
      return panner;
    };
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

/**
 * A buffer of a given duration at 1 kHz (so `duration` is exact).
 *
 * @param seconds - Duration.
 * @returns The buffer.
 */
export function bufferOf(seconds: number): FakeBuffer {
  return new FakeBuffer(1, Math.round(seconds * 1000), 1000);
}
