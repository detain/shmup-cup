/**
 * Procedural chip songs: a small tracker format (instruments, channels, patterns of text tracks,
 * an order list with a loop point) rendered to mono PCM with sample-exact loop points (decision
 * D22 placeholders). Deterministic — table sines, literal semitone ratios, an LFSR for the noise.
 *
 * @module
 */
import { noteFrequency, sineOfCycle } from './tables.js';

/**
 * Chip oscillators: pulse waves of 12.5 / 25 / 50 % duty, a 4-bit stepped triangle, LFSR noise
 * (the note sets the clock) and a sawtooth.
 */
export type ChipWave = 'pulse12' | 'pulse25' | 'pulse50' | 'triangle' | 'noise' | 'saw';

/** Every {@link ChipWave}. */
export const CHIP_WAVES: readonly ChipWave[] = Object.freeze([
  'pulse12',
  'pulse25',
  'pulse50',
  'triangle',
  'noise',
  'saw',
]);

/** Vibrato of an instrument. */
export interface SongVibrato {
  /** Depth in semitones (peak). */
  readonly depth: number;
  /** Rate in Hz. */
  readonly rate: number;
  /** Seconds after the note starts before the vibrato begins (default 0). */
  readonly delay?: number;
}

/**
 * An instrument: oscillator, ADSR envelope (seconds; `sustain` is a level) and per-tick
 * (1/60 s) pitch effects — vibrato, arpeggio, sweep.
 */
export interface SongInstrument {
  /** Oscillator. */
  readonly wave: ChipWave;
  /** Gain, 0…1 (default 1). */
  readonly volume?: number;
  /** Rise time (default 0.002 — a de-click). */
  readonly attack?: number;
  /** Fall time to the sustain level (default 0). */
  readonly decay?: number;
  /** Sustain level, 0…1 (default 1). */
  readonly sustain?: number;
  /** Fade after the note is released (default 0.03). */
  readonly release?: number;
  /** Pitch vibrato. */
  readonly vibrato?: SongVibrato;
  /** Semitone offsets cycled every {@link SongInstrument.arpeggioTicks} (chords on one channel). */
  readonly arpeggio?: readonly number[];
  /** Ticks per arpeggio step (default 1). */
  readonly arpeggioTicks?: number;
  /** Pitch sweep in semitones per second from the note start (drums; default 0). */
  readonly sweep?: number;
}

/** One channel (voice) of a song. */
export interface SongChannel {
  /** Instrument of notes that do not name one. */
  readonly instrument: string;
  /** Channel gain, 0…1 (default 1). */
  readonly volume?: number;
}

/**
 * A pattern: `rows` rows, one text track per channel. A track is whitespace-separated tokens,
 * each `BODY[:rows][@instrument]`: `C4`, `F#3`, `Bb5` (note-on — octave 0…8, C4 = MIDI 60), `.`
 * (hold — the channel keeps doing what it does), `-` (release the note) or `=` (cut to silence);
 * `:n` makes the token last `n` rows (default 1), `@name` plays a note with another instrument
 * (`C2:2@kick` and `C2@kick:2` are the same token).
 * The rows of a track must add up to `rows`; an empty track holds for the whole pattern.
 */
export interface SongPattern {
  /** Rows in the pattern. */
  readonly rows: number;
  /** One track per channel, in channel order. */
  readonly tracks: readonly string[];
}

/** A chip song. */
export interface Song {
  /** Ticks (1/60 s) per row — 6 ≈ 150 BPM at 4 rows a beat. */
  readonly speed: number;
  /** Master gain, 0…1 (default {@link DEFAULT_SONG_VOLUME}). */
  readonly volume?: number;
  /** Instruments by name. */
  readonly instruments: Readonly<Record<string, SongInstrument>>;
  /** The channels, mixed in this order. */
  readonly channels: readonly SongChannel[];
  /** Patterns by name. */
  readonly patterns: Readonly<Record<string, SongPattern>>;
  /** Pattern names in play order. */
  readonly order: readonly string[];
  /**
   * Index into {@link Song.order} where the loop starts (everything before it is the intro);
   * absent or `null` = a one-shot song (a jingle) that ends with its notes' release tails.
   */
  readonly loopFromOrder?: number | null;
}

/** The result of {@link renderSong}. */
export interface RenderedSong {
  /** Mono samples within −1…1. */
  readonly pcm: Float32Array;
  /** Sample rate of {@link RenderedSong.pcm}. */
  readonly sampleRate: number;
  /** First sample of the loop, or −1 for a one-shot song. */
  readonly loopStart: number;
  /** Sample where playback jumps back to `loopStart` (= `pcm.length`), or −1 for a one-shot song. */
  readonly loopEnd: number;
}

/** Master gain of a song that does not set {@link Song.volume}. */
export const DEFAULT_SONG_VOLUME = 0.4;

/** Longest release tail appended to a one-shot song, in seconds. */
export const MAX_SONG_TAIL_SECONDS = 2;

/** The noise channel's LFSR is clocked at the note frequency × this. */
const NOISE_CLOCK = 8;

/** Kinds of {@link TrackStep}. */
export const TrackStepKind = {
  /** Keep doing what the channel does. */
  Hold: 0,
  /** Start a note. */
  Note: 1,
  /** Release the sounding note. */
  Off: 2,
  /** Silence the channel at once. */
  Cut: 3,
} as const;

/** A {@link TrackStepKind} value. */
export type TrackStepKind = (typeof TrackStepKind)[keyof typeof TrackStepKind];

/** One parsed token of a track. */
export interface TrackStep {
  /** What happens on the step's first row. */
  readonly kind: TrackStepKind;
  /** MIDI note of a `Note` step (0 otherwise). */
  readonly note: number;
  /** Rows the step lasts (≥ 1). */
  readonly rows: number;
  /** Instrument named with `@`, or `null` for the channel's own. */
  readonly instrument: string | null;
}

/** A parsed track, or why it could not be parsed. */
export interface ParsedTrack {
  /** The steps (empty on error). */
  readonly steps: readonly TrackStep[];
  /** Rows covered by the steps. */
  readonly rows: number;
  /** `null`, or a message naming the bad token. */
  readonly error: string | null;
}

/** One track token: body, then optional `:rows` and `@instrument` (either order). */
const TOKEN =
  /^(?:([A-G])([#b]?)([0-8])|(\.)|(-)|(=))(?::([1-9][0-9]{0,2})(?:@([a-z0-9]+(?:-[a-z0-9]+)*))?|@([a-z0-9]+(?:-[a-z0-9]+)*)(?::([1-9][0-9]{0,2}))?)?$/;

/** Semitones of the note letters above C. */
const LETTER_SEMITONES: Readonly<Record<string, number>> = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

/**
 * Parses one track of a pattern (see {@link SongPattern} for the token syntax).
 *
 * @param text - The track text.
 * @returns The steps and their row total, or an error message (never throws).
 *
 * @example
 * ```ts
 * parseTrack('C4:2 . E4@pluck -'); // → 4 steps covering 5 rows
 * ```
 */
export function parseTrack(text: string): ParsedTrack {
  const steps: TrackStep[] = [];
  let rows = 0;
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    if (token === '') continue;
    const match = TOKEN.exec(token);
    if (match === null) return { steps: [], rows: 0, error: `bad token "${token}"` };
    const count = match[7] ?? match[10];
    const length = count === undefined ? 1 : Number(count);
    const instrument = match[8] ?? match[9] ?? null;
    let kind: TrackStepKind;
    let note = 0;
    if (match[1] !== undefined) {
      kind = TrackStepKind.Note;
      const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
      note = (Number(match[3]) + 1) * 12 + LETTER_SEMITONES[match[1]] + accidental;
    } else {
      kind =
        match[4] !== undefined
          ? TrackStepKind.Hold
          : match[5] !== undefined
            ? TrackStepKind.Off
            : TrackStepKind.Cut;
      if (instrument !== null) {
        return { steps: [], rows: 0, error: `"${token}": only a note can name an instrument` };
      }
    }
    steps.push({ kind, note, rows: length, instrument });
    rows += length;
  }
  return { steps, rows, error: null };
}

/**
 * Samples per row of a song at a rate: `round(sampleRate × speed / 60)` — a whole number, so
 * every row, pattern and loop point starts on an exact sample.
 *
 * @param song - The song (its `speed`).
 * @param sampleRate - Output rate in Hz.
 * @returns Samples per row.
 */
export function songRowSamples(song: Pick<Song, 'speed'>, sampleRate: number): number {
  return Math.round((sampleRate * song.speed) / 60);
}

/** Wave codes of the render loop. */
const WAVE_CODE: Readonly<Record<ChipWave, number>> = Object.freeze({
  pulse12: 0,
  pulse25: 1,
  pulse50: 2,
  triangle: 3,
  noise: 4,
  saw: 5,
});

/** Duty cycle per pulse wave code. */
const DUTY = [0.125, 0.25, 0.5];

/** An instrument with its times in samples and its tick effects resolved. */
interface CompiledInstrument {
  /** Wave code. */
  readonly wave: number;
  /** Pulse high level (zero-mean pulse). */
  readonly high: number;
  /** Pulse low level. */
  readonly low: number;
  /** Pulse duty. */
  readonly duty: number;
  /** Gain. */
  readonly volume: number;
  /** Attack in samples. */
  readonly attack: number;
  /** Decay in samples. */
  readonly decay: number;
  /** Sustain level. */
  readonly sustain: number;
  /** Release in samples. */
  readonly release: number;
  /** Vibrato depth in semitones (0 = off). */
  readonly vibDepth: number;
  /** Vibrato cycles per tick. */
  readonly vibPerTick: number;
  /** Ticks before the vibrato starts. */
  readonly vibDelay: number;
  /** Arpeggio offsets (empty = off). */
  readonly arp: readonly number[];
  /** Ticks per arpeggio step. */
  readonly arpTicks: number;
  /** Sweep in semitones per tick. */
  readonly sweepPerTick: number;
}

/**
 * Compiles an instrument for a sample rate.
 *
 * @param spec - The instrument.
 * @param rate - Sample rate.
 * @returns The compiled instrument.
 */
function compileInstrument(spec: SongInstrument, rate: number): CompiledInstrument {
  const wave = WAVE_CODE[spec.wave];
  const duty = wave < 3 ? DUTY[wave] : 0.5;
  const scale = 1 / (duty > 0.5 ? duty : 1 - duty);
  return {
    wave,
    high: (1 - duty) * scale,
    low: -duty * scale,
    duty,
    volume: spec.volume ?? 1,
    attack: Math.round((spec.attack ?? 0.002) * rate),
    decay: Math.round((spec.decay ?? 0) * rate),
    sustain: spec.sustain ?? 1,
    release: Math.round((spec.release ?? 0.03) * rate),
    vibDepth: spec.vibrato?.depth ?? 0,
    vibPerTick: (spec.vibrato?.rate ?? 0) / 60,
    vibDelay: Math.round((spec.vibrato?.delay ?? 0) * 60),
    arp: spec.arpeggio === undefined ? [] : spec.arpeggio.slice(),
    arpTicks: spec.arpeggioTicks ?? 1,
    sweepPerTick: (spec.sweep ?? 0) / 60,
  };
}

/** Envelope stages of a {@link ChannelVoice}. */
const Stage = { Attack: 0, Decay: 1, Sustain: 2, Release: 3, Off: 4 } as const;

/**
 * One monophonic channel's oscillator and envelope. Every note-on resets all of its state
 * (phase, envelope, LFSR, tick clock), which is what makes the loop render exact.
 */
class ChannelVoice {
  /** Current instrument (`null` before the first note). */
  inst: CompiledInstrument | null = null;
  /** Current MIDI note. */
  note = 0;
  /** Envelope stage. */
  stage: number = Stage.Off;
  /** Samples spent in the current stage. */
  envPos = 0;
  /** Envelope level when the release began. */
  relFrom = 0;
  /** Current envelope level. */
  level = 0;
  /** Samples since the note-on. */
  pos = 0;
  /** Tick index since the note-on. */
  tick = 0;
  /** `pos` at which the next tick starts. */
  nextTick = 0;
  /** Oscillator phase in cycles. */
  phase = 0;
  /** Phase increment per sample. */
  inc = 0;
  /** Noise shift register. */
  lfsr = 1;
  /** Noise output level. */
  noise = 1;
  /** Instrument × channel gain. */
  gain = 0;

  /**
   * @param rate - Sample rate.
   * @param channelVolume - Channel gain.
   */
  constructor(
    readonly rate: number,
    readonly channelVolume: number,
  ) {}

  /**
   * Starts a note.
   *
   * @param note - MIDI note.
   * @param inst - Instrument.
   */
  noteOn(note: number, inst: CompiledInstrument): void {
    this.inst = inst;
    this.note = note;
    this.gain = inst.volume * this.channelVolume;
    this.pos = 0;
    this.tick = 0;
    this.nextTick = Math.floor(this.rate / 60);
    this.phase = 0;
    this.lfsr = 1;
    this.noise = 1;
    this.envPos = 0;
    if (inst.attack > 0) {
      this.stage = Stage.Attack;
      this.level = 0;
    } else {
      this.stage = inst.decay > 0 ? Stage.Decay : Stage.Sustain;
      this.level = inst.decay > 0 ? 1 : inst.sustain;
    }
    this.updatePitch();
  }

  /** Releases the sounding note (its release tail follows). */
  noteOff(): void {
    if (this.stage >= Stage.Release || this.inst === null) return;
    this.relFrom = this.level;
    this.envPos = 0;
    this.stage = this.inst.release > 0 ? Stage.Release : Stage.Off;
  }

  /** Silences the channel at once. */
  cut(): void {
    this.stage = Stage.Off;
    this.level = 0;
  }

  /** Recomputes the phase increment for the current tick (arpeggio, sweep, vibrato). */
  updatePitch(): void {
    const inst = this.inst;
    if (inst === null) return;
    let semis = this.note;
    if (inst.arp.length > 0) {
      semis += inst.arp[Math.floor(this.tick / inst.arpTicks) % inst.arp.length];
    }
    semis += inst.sweepPerTick * this.tick;
    if (inst.vibDepth > 0 && this.tick >= inst.vibDelay) {
      const cycles = (this.tick - inst.vibDelay) * inst.vibPerTick;
      semis += inst.vibDepth * sineOfCycle(cycles - Math.floor(cycles));
    }
    const frequency = noteFrequency(semis);
    let inc = (frequency * (inst.wave === 4 ? NOISE_CLOCK : 1)) / this.rate;
    const max = inst.wave === 4 ? 1 : 0.5;
    if (inc > max) inc = max;
    this.inc = inc;
  }

  /**
   * Advances the voice by `count` samples, adding its output to `out` from `offset` on.
   *
   * @param count - Samples to render.
   * @param out - Mix buffer, or `null` to advance the state only.
   * @param offset - Index in `out` of the first sample.
   */
  render(count: number, out: Float32Array | null, offset: number): void {
    const inst = this.inst;
    if (inst === null) return;
    let at = offset;
    while (count > 0) {
      if (this.stage === Stage.Off) return;
      const n = Math.min(count, this.nextTick - this.pos);
      if (n <= 0) {
        this.tick++;
        this.nextTick = Math.floor(((this.tick + 1) * this.rate) / 60);
        this.updatePitch();
        continue;
      }
      this.renderSpan(inst, n, out, at);
      this.pos += n;
      at += n;
      count -= n;
    }
  }

  /**
   * Renders `n` samples at the current pitch.
   *
   * @param inst - The instrument.
   * @param n - Samples.
   * @param out - Mix buffer or `null`.
   * @param at - First index in `out`.
   */
  private renderSpan(
    inst: CompiledInstrument,
    n: number,
    out: Float32Array | null,
    at: number,
  ): void {
    const wave = inst.wave;
    const inc = this.inc;
    let phase = this.phase;
    let stage = this.stage;
    let envPos = this.envPos;
    let level = this.level;
    let lfsr = this.lfsr;
    let noise = this.noise;
    const gain = this.gain;
    for (let k = 0; k < n; k++) {
      switch (stage) {
        case Stage.Attack:
          level = envPos / inst.attack;
          if (++envPos >= inst.attack) {
            envPos = 0;
            stage = inst.decay > 0 ? Stage.Decay : Stage.Sustain;
          }
          break;
        case Stage.Decay:
          level = 1 - ((1 - inst.sustain) * envPos) / inst.decay;
          if (++envPos >= inst.decay) {
            envPos = 0;
            stage = Stage.Sustain;
          }
          break;
        case Stage.Sustain:
          level = inst.sustain;
          break;
        case Stage.Release:
          level = this.relFrom * (1 - envPos / inst.release);
          if (++envPos >= inst.release) {
            envPos = 0;
            stage = Stage.Off;
          }
          break;
        default:
          level = 0;
      }
      phase += inc;
      if (phase >= 1) {
        phase -= 1;
        if (wave === 4) {
          const bit = (lfsr ^ (lfsr >> 1)) & 1;
          lfsr = (lfsr >> 1) | (bit << 14);
          noise = (lfsr & 1) === 1 ? 1 : -1;
        }
      }
      let value: number;
      if (wave < 3) {
        value = phase < inst.duty ? inst.high : inst.low;
      } else if (wave === 3) {
        const step = Math.floor(phase * 32);
        value = (step < 16 ? step : 31 - step) / 7.5 - 1;
      } else if (wave === 4) {
        value = noise;
      } else {
        value = 2 * phase - 1;
      }
      if (out !== null) out[at + k] += value * level * gain;
    }
    this.phase = phase;
    this.stage = stage;
    this.envPos = envPos;
    this.level = level;
    this.lfsr = lfsr;
    this.noise = noise;
  }
}

/** A channel event on an absolute row. */
interface ChannelEvent {
  /** Absolute row in the order list. */
  readonly row: number;
  /** Note, Off or Cut. */
  readonly kind: TrackStepKind;
  /** MIDI note. */
  readonly note: number;
  /** Instrument (for notes). */
  readonly inst: CompiledInstrument | null;
}

/**
 * Plays a run of channel events through a voice.
 *
 * @param voice - The channel's voice.
 * @param events - The channel's events.
 * @param from - First event index.
 * @param to - Event index after the last.
 * @param fromSample - Timeline sample where the run starts.
 * @param toSample - Timeline sample where the run ends.
 * @param spr - Samples per row.
 * @param out - Mix buffer (`null` = advance the state only).
 * @param outAt - Index in `out` that `fromSample` maps to.
 */
function playEvents(
  voice: ChannelVoice,
  events: readonly ChannelEvent[],
  from: number,
  to: number,
  fromSample: number,
  toSample: number,
  spr: number,
  out: Float32Array | null,
  outAt: number,
): void {
  let cursor = fromSample;
  for (let i = from; i < to; i++) {
    const event = events[i];
    const at = event.row * spr;
    if (at > cursor) {
      voice.render(at - cursor, out, outAt + cursor - fromSample);
      cursor = at;
    }
    if (event.kind === TrackStepKind.Note && event.inst !== null)
      voice.noteOn(event.note, event.inst);
    else if (event.kind === TrackStepKind.Off) voice.noteOff();
    else voice.cut();
  }
  if (toSample > cursor) voice.render(toSample - cursor, out, outAt + cursor - fromSample);
}

/**
 * Renders a chip song to mono PCM.
 *
 * @remarks
 * Rows are `songRowSamples(song, sampleRate)` samples long, so `loopStart` (the rows of the intro
 * × samples per row) and `loopEnd` (= `pcm.length`) are exact sample indices. The loop region
 * holds the loop's **steady state**: each channel is first advanced through one loop pass without
 * output (from its last note-on in the loop — every note-on resets the channel), then rendered
 * again, so a note still ringing at the loop end continues across the seam exactly as it would if
 * the loop were unrolled; wrapping from `loopEnd − 1` to `loopStart` is sample-exact. (A channel
 * that strikes no note in the loop keeps the intro's oscillator phase — its seam is only
 * approximate; the first pass after the intro hears the loop's own ring-over.) A one-shot song
 * releases every note after its last row and ends when the longest release has faded
 * ({@link MAX_SONG_TAIL_SECONDS} at most). Channels are summed in order, scaled by the song volume
 * and hard-clipped to −1…1. Deterministic across engines. Load-time code — it allocates.
 *
 * @param song - The song (validated by the audio loader; see {@link parseTrack}).
 * @param sampleRate - Output rate in Hz (placeholders use 22,050 mono).
 * @returns The samples and the loop points.
 * @throws {RangeError} When the song is malformed: an unknown instrument or pattern, a bad
 *   token, a track whose rows do not add up to its pattern, or a bad sample rate.
 *
 * @example
 * ```ts
 * const { pcm, loopStart, loopEnd } = renderSong(song, 22050);
 * source.loopStart = loopStart / 22050; // seconds
 * ```
 */
export function renderSong(song: Song, sampleRate: number): RenderedSong {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`sampleRate must be a positive integer, got ${sampleRate}`);
  }
  const spr = songRowSamples(song, sampleRate);
  const instruments = new Map<string, CompiledInstrument>();
  let maxRelease = 0;
  /**
   * Looks up (and compiles once) an instrument.
   *
   * @param name - Instrument name.
   * @returns The compiled instrument.
   */
  const instrument = (name: string): CompiledInstrument => {
    let compiled = instruments.get(name);
    if (compiled === undefined) {
      const spec = Object.prototype.hasOwnProperty.call(song.instruments, name)
        ? song.instruments[name]
        : undefined;
      if (spec === undefined) throw new RangeError(`unknown instrument "${name}"`);
      compiled = compileInstrument(spec, sampleRate);
      instruments.set(name, compiled);
      if (compiled.release > maxRelease) maxRelease = compiled.release;
    }
    return compiled;
  };

  const channels = song.channels.length;
  const events: ChannelEvent[][] = [];
  for (let c = 0; c < channels; c++) events.push([]);
  const defaults = song.channels.map((channel) => instrument(channel.instrument));
  let totalRows = 0;
  const orderRows: number[] = [];
  for (const name of song.order) {
    const pattern = Object.prototype.hasOwnProperty.call(song.patterns, name)
      ? song.patterns[name]
      : undefined;
    if (pattern === undefined) throw new RangeError(`unknown pattern "${name}"`);
    for (let c = 0; c < channels; c++) {
      const parsed = parseTrack(pattern.tracks[c] ?? '');
      if (parsed.error !== null) throw new RangeError(`pattern "${name}": ${parsed.error}`);
      if (parsed.steps.length > 0 && parsed.rows !== pattern.rows) {
        throw new RangeError(
          `pattern "${name}" track ${c}: ${parsed.rows} rows, the pattern has ${pattern.rows}`,
        );
      }
      let row = totalRows;
      for (const step of parsed.steps) {
        if (step.kind !== TrackStepKind.Hold) {
          const inst =
            step.kind === TrackStepKind.Note
              ? step.instrument === null
                ? defaults[c]
                : instrument(step.instrument)
              : null;
          events[c].push({ row, kind: step.kind, note: step.note, inst });
        }
        row += step.rows;
      }
    }
    orderRows.push(pattern.rows);
    totalRows += pattern.rows;
  }

  const loopFrom = song.loopFromOrder;
  const looping =
    typeof loopFrom === 'number' &&
    Number.isInteger(loopFrom) &&
    loopFrom >= 0 &&
    loopFrom < song.order.length;
  let introRows = totalRows;
  if (looping) {
    introRows = 0;
    for (let i = 0; i < loopFrom; i++) introRows += orderRows[i];
  }
  const loopStart = introRows * spr;
  const songEnd = totalRows * spr;
  const tail = looping ? 0 : Math.min(maxRelease, Math.round(MAX_SONG_TAIL_SECONDS * sampleRate));
  const pcm = new Float32Array(songEnd + tail);

  for (let c = 0; c < channels; c++) {
    const list = events[c];
    const voice = new ChannelVoice(sampleRate, song.channels[c].volume ?? 1);
    if (!looping) {
      playEvents(voice, list, 0, list.length, 0, songEnd, spr, pcm, 0);
      voice.noteOff();
      voice.render(tail, pcm, songEnd);
      continue;
    }
    let introEnd = 0;
    while (introEnd < list.length && list[introEnd].row < introRows) introEnd++;
    playEvents(voice, list, 0, introEnd, 0, loopStart, spr, pcm, 0);
    // Pass 1 (no output): bring the voice to its state at the loop end.
    let lastOn = -1;
    for (let i = list.length - 1; i >= introEnd && lastOn < 0; i--) {
      if (list[i].kind === TrackStepKind.Note) lastOn = i;
    }
    if (lastOn >= 0) {
      playEvents(voice, list, lastOn, list.length, list[lastOn].row * spr, songEnd, spr, null, 0);
    } else {
      playEvents(voice, list, introEnd, list.length, loopStart, songEnd, spr, null, 0);
    }
    // Pass 2: the steady-state loop, written into [loopStart, loopEnd).
    playEvents(voice, list, introEnd, list.length, loopStart, songEnd, spr, pcm, loopStart);
  }

  const volume = song.volume ?? DEFAULT_SONG_VOLUME;
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i] * volume;
    pcm[i] = value > 1 ? 1 : value < -1 ? -1 : value;
  }
  return {
    pcm,
    sampleRate,
    loopStart: looping ? loopStart : -1,
    loopEnd: looping ? songEnd : -1,
  };
}
