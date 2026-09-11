/**
 * Runs the built `dist/app.js` in a `node:vm` realm that imitates the Tizen 5.5 web runtime closely enough to
 * drive the whole app headlessly:
 *
 * - DOM: elements for every `id` found in the built `index.html` (so missing markup breaks the run), a recording
 *   Canvas2D context for `#arena`, `document.hidden` / `visibilitychange`, window listeners, timers and rAF driven
 *   by a manual clock;
 * - optional fake `tizen` / `webapis` globals and gamepads;
 * - `chrome69: true` removes `globalThis` and builtins newer than Chromium 69 from the realm before the bundle
 *   runs, so any use of them (or a missing polyfill) fails the test.
 */

import vm from 'node:vm';

import { createFakeWebGL, createRecordingContext2D, type DrawCall } from './fakeCanvas';

/** A keyboard event as seen by the app's listeners. */
export interface FakeKeyEvent {
  type: 'keydown' | 'keyup';
  keyCode: number;
  which: number;
  key: string;
  repeat: boolean;
  timeStamp: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}

/** Options for a key event. */
export interface KeyOptions {
  repeat?: boolean;
  key?: string;
  /** Dispatch delay: `timeStamp = now - delay` (default 2 ms). */
  delay?: number;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}

/** Harness options. */
export interface HarnessOptions {
  appJs: string;
  indexHtml: string;
  userAgent?: string;
  tizen?: unknown;
  webapis?: unknown;
  gamepads?: () => ArrayLike<unknown>;
  XMLHttpRequest?: unknown;
  /** Strip post-Chromium-69 builtins and `globalThis` from the realm. */
  chrome69?: boolean;
  /** Provide a WebGL1 context from `document.createElement('canvas')`. */
  webgl?: boolean;
}

/** A DOM element stand-in. */
export interface FakeElement {
  id: string;
  tagName: string;
  textContent: string;
  style: Record<string, string>;
  getContext?: (kind: string, opts?: unknown) => unknown;
}

type Listener = (ev: unknown) => void;

/** Everything newer than Chromium 69 that a bundle might accidentally rely on. */
const CHROME69_PRELUDE = `
(function (g) {
  var del = function (obj, names) { for (var i = 0; i < names.length; i++) { try { delete obj[names[i]]; } catch (e) {} } };
  del(Object, ['fromEntries', 'hasOwn', 'groupBy']);
  del(String.prototype, ['matchAll', 'replaceAll', 'at', 'isWellFormed', 'toWellFormed']);
  del(Array.prototype, ['at', 'findLast', 'findLastIndex', 'toSorted', 'toReversed', 'toSpliced', 'with']);
  var TA = Object.getPrototypeOf(Int8Array.prototype);
  del(TA, ['at', 'findLast', 'findLastIndex', 'toSorted', 'toReversed', 'with']);
  del(Promise, ['allSettled', 'any', 'withResolvers']);
  del(Array, ['fromAsync']);
  del(g, ['AggregateError', 'WeakRef', 'FinalizationRegistry', 'queueMicrotask', 'structuredClone', 'Iterator']);
  if (typeof Map !== 'undefined') del(Map, ['groupBy']);
  del(g, ['globalThis']);
})(this);
`;

/** Samsung's published Tizen 5.5 user agent. */
export const TIZEN55_UA =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36';

/** Drives one run of the app. */
export class BrowserHarness {
  /** Current `performance.now()` value. */
  now = 1000;
  /** `console.*` output, one string per call. */
  readonly logs: string[] = [];
  /** Elements by id. */
  readonly elements = new Map<string, FakeElement>();
  /** Calls made on the `#arena` canvas. */
  readonly draw: DrawCall[];

  private readonly rafs: Array<(t: number) => void> = [];
  private timers: Array<{ at: number; fn: () => void }> = [];
  private readonly listeners = { window: new Map<string, Listener[]>(), document: new Map<string, Listener[]>() };
  private readonly doc: { hidden: boolean; readyState: string } & Record<string, unknown>;
  private readonly sandbox: Record<string, unknown>;
  private readonly opts: HarnessOptions;
  private context: vm.Context | null = null;

  constructor(opts: HarnessOptions) {
    this.opts = opts;
    const { ctx, calls } = createRecordingContext2D();
    this.draw = calls;
    for (const m of opts.indexHtml.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"/g)) {
      const tag = (m[1] as string).toUpperCase();
      const el: FakeElement = { id: m[2] as string, tagName: tag, textContent: '', style: {} };
      if (tag === 'CANVAS') el.getContext = (kind) => (kind === '2d' ? ctx : null);
      this.elements.set(el.id, el);
    }
    const add = (target: 'window' | 'document') => (type: string, fn: Listener) => {
      const list = this.listeners[target].get(type) ?? [];
      list.push(fn);
      this.listeners[target].set(type, list);
    };
    const { gl } = createFakeWebGL({ maxTextureSize: 8192, renderer: 'Mali-G52 MC1', vendor: 'ARM', version: 'WebGL 1.0', debugInfo: true });
    this.doc = {
      hidden: false,
      readyState: 'complete',
      addEventListener: add('document'),
      removeEventListener: () => undefined,
      getElementById: (id: string) => this.elements.get(id) ?? null,
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        width: 0,
        height: 0,
        style: {},
        getContext: (kind: string) => (kind === 'webgl' && opts.webgl ? gl : null),
      }),
    };
    class FakeAudioContext {
      sampleRate = 48000;
      baseLatency = 0.0213;
      close(): Promise<void> {
        return Promise.resolve();
      }
    }
    const sandbox: Record<string, unknown> = {
      console: {
        log: (...a: unknown[]) => void this.logs.push(a.map(String).join(' ')),
        info: (...a: unknown[]) => void this.logs.push(a.map(String).join(' ')),
        warn: (...a: unknown[]) => void this.logs.push('WARN ' + a.map(String).join(' ')),
        error: (...a: unknown[]) => void this.logs.push('ERROR ' + a.map(String).join(' ')),
      },
      performance: { now: () => this.now },
      requestAnimationFrame: (cb: (t: number) => void) => {
        this.rafs.push(cb);
        return this.rafs.length;
      },
      setTimeout: (fn: () => void, ms?: number) => {
        this.timers.push({ at: this.now + (ms ?? 0), fn });
        return this.timers.length;
      },
      clearTimeout: () => undefined,
      addEventListener: add('window'),
      removeEventListener: () => undefined,
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      screen: { width: 1920, height: 1080 },
      navigator: {
        userAgent: opts.userAgent ?? TIZEN55_UA,
        hardwareConcurrency: 4,
        getGamepads: opts.gamepads ?? (() => [null, null, null, null]),
      },
      document: this.doc,
      AudioContext: FakeAudioContext,
    };
    if (opts.tizen !== undefined) sandbox['tizen'] = opts.tizen;
    if (opts.webapis !== undefined) sandbox['webapis'] = opts.webapis;
    if (opts.XMLHttpRequest !== undefined) sandbox['XMLHttpRequest'] = opts.XMLHttpRequest;
    sandbox['window'] = sandbox;
    sandbox['self'] = sandbox;
    this.sandbox = sandbox;
  }

  /** Loads the bundle (throws if its top level throws). */
  start(): this {
    const context = vm.createContext(this.sandbox);
    this.context = context;
    if (this.opts.chrome69) vm.runInContext(CHROME69_PRELUDE, context, { filename: 'chrome69-prelude.js' });
    vm.runInContext(this.opts.appJs, context, { filename: 'app.js' });
    return this;
  }

  /** Evaluates an expression inside the app realm (for assertions about the realm itself). */
  evaluate(code: string): unknown {
    if (this.context === null) throw new Error('start() first');
    return vm.runInContext(code, this.context);
  }

  /** Global value from the sandbox (e.g. flags set by the polyfill). */
  global(name: string): unknown {
    return this.sandbox[name];
  }

  /** Text of a panel element. */
  panel(id: string): string {
    const el = this.elements.get(id);
    if (!el) throw new Error('#' + id + ' not in index.html');
    return el.textContent;
  }

  /** Dispatches a DOM event to window (or document) listeners. */
  fire(target: 'window' | 'document', type: string, ev: Record<string, unknown> = {}): void {
    for (const fn of this.listeners[target].get(type) ?? []) fn({ type, ...ev });
  }

  /** Dispatches a key event and returns it (check `defaultPrevented`). */
  key(type: 'keydown' | 'keyup', code: number, o: KeyOptions = {}): FakeKeyEvent {
    const ev: FakeKeyEvent = {
      type,
      keyCode: code,
      which: code,
      key: o.key ?? '',
      repeat: o.repeat ?? false,
      timeStamp: this.now - (o.delay ?? 2),
      ctrlKey: o.ctrl ?? false,
      metaKey: o.meta ?? false,
      altKey: o.alt ?? false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    for (const fn of this.listeners.window.get(type) ?? []) fn(ev);
    return ev;
  }

  /** keydown shorthand. */
  down(code: number, o: KeyOptions = {}): FakeKeyEvent {
    return this.key('keydown', code, o);
  }

  /** keyup shorthand. */
  up(code: number, o: KeyOptions = {}): FakeKeyEvent {
    return this.key('keyup', code, o);
  }

  /** Advances the clock without rendering frames, running due timers. */
  advance(ms: number): void {
    this.now += ms;
    this.runTimers();
  }

  /** Renders `n` frames of `dt` ms each (timers first, then rAF callbacks, like a browser). */
  frames(n: number, dt = 1000 / 60): void {
    for (let i = 0; i < n; i++) {
      this.now += dt;
      this.runTimers();
      const cbs = this.rafs.splice(0, this.rafs.length);
      for (const cb of cbs) cb(this.now);
    }
  }

  /** Holds a key for `ms` with clean auto-repeat (500 ms delay, 50 ms interval), rendering frames meanwhile. */
  hold(code: number, ms: number, o: { repeatDelay?: number; repeatInterval?: number } = {}): void {
    const delay = o.repeatDelay ?? 500;
    const interval = o.repeatInterval ?? 50;
    const t0 = this.now;
    this.down(code);
    let nextRepeat = t0 + delay;
    while (this.now - t0 < ms) {
      this.frames(1);
      while (this.now >= nextRepeat && nextRepeat - t0 < ms) {
        this.down(code, { repeat: true });
        nextRepeat += interval;
      }
    }
    this.up(code);
  }

  /** Sets `document.hidden` and fires `visibilitychange`. */
  setHidden(hidden: boolean): void {
    this.doc.hidden = hidden;
    this.fire('document', 'visibilitychange');
  }

  /** Fill style of the most recent draw of the latency flash box. */
  flashFill(): unknown {
    for (let i = this.draw.length - 1; i >= 0; i--) {
      const c = this.draw[i] as DrawCall;
      if (c.op === 'fillRect' && c.args[0] === 580 && c.args[1] === 572 && c.args[2] === 230) return c.fillStyle;
    }
    return undefined;
  }

  private runTimers(): void {
    for (;;) {
      const due = this.timers.filter((t) => t.at <= this.now);
      if (due.length === 0) return;
      this.timers = this.timers.filter((t) => t.at > this.now);
      for (const t of due) t.fn();
    }
  }
}
