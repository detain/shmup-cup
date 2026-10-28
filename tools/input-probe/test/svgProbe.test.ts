/**
 * The SVG capability matrix (R-SVG-WO3A) runs headlessly against a scripted fake host: every status
 * in the vocabulary (PASS / FAIL / ERROR / TIMEOUT / FROZEN / ANIMATES / REJECT / ACCEPT /
 * UNAVAILABLE), the warm-vs-measured window split, the timing medians, the E3 byte-exact compare and
 * the panel / report shapes. The pixel thresholds themselves are proven by the modern-Chromium
 * control run (see the lane report), not here.
 */

import { describe, expect, it } from 'vitest';

import {
  E3_SIZE,
  SVG_FEATURE_SIZE,
  SVG_FEATURES,
  SVG_MEASURE_WINDOWS,
  SVG_PHASE_TIMEOUT_MS,
  SVG_WARM_WINDOWS,
  SvgMatrix,
  e3Atlas,
  type SvgFeatureDef,
  type SvgProbeHost,
  type SvgWindow,
} from '../src/svgProbe';

/** Fake window payload (the matrix only ever passes handles around). */
class FakeWin {
  readNo = 0;
  released = false;
  constructor(readonly size: number, readonly source: string) {}
}

/** Host behaviors a test asks for. */
interface FakeOpts {
  /** false: `begin` never calls `done` (the window hangs → TIMEOUT). */
  load?: boolean;
  /** Error text handed to `done(false, …)`. */
  loadErr?: string;
  /** false: `decode` never calls `done`. */
  decode?: boolean;
  /** Begin returns null (a realm without the image pipeline). */
  beginNull?: boolean;
  pixels?: (w: FakeWin) => Uint8Array | Uint8ClampedArray;
  bitmapOk?: boolean;
  bitmapInfo?: string;
}

/** A {@link SvgProbeHost} with a controllable clock and scripted callbacks. */
class FakeHost implements SvgProbeHost {
  clock = 0;
  readonly wins: FakeWin[] = [];
  releases = 0;

  constructor(private readonly o: FakeOpts = {}) {}

  now(): number {
    return this.clock;
  }

  begin(source: string, size: number, done: (ok: boolean, err: string) => void): SvgWindow | null {
    const w = new FakeWin(size, source);
    this.wins.push(w);
    if (this.o.beginNull) return null;
    if (this.o.load === false) {
      if (this.o.loadErr !== undefined) done(false, this.o.loadErr); // load:false + loadErr → onerror
    } else {
      done(true, ''); // default and load:true → onload
    }
    return { handle: w };
  }

  decode(_win: SvgWindow, done: (ok: boolean, err: string) => void): void {
    if (this.o.decode === false) return;
    done(true, '');
  }

  read(win: SvgWindow) {
    const w = win.handle as FakeWin;
    w.readNo++;
    const data = this.o.pixels ? this.o.pixels(w) : new Uint8Array(w.size * w.size * 4);
    return { size: w.size, data };
  }

  bitmap(_win: SvgWindow, done: (ok: boolean, info: string) => void): void {
    done(!!this.o.bitmapOk, this.o.bitmapInfo ?? 'NotSupportedError: SVG images are not currently supported by createImageBitmap');
  }

  release(win: SvgWindow): void {
    (win.handle as FakeWin).released = true;
    this.releases++;
  }
}

/** Advance the clock 10 ms per tick and spin the matrix to completion (or a generous cap). */
function drive(m: SvgMatrix, host: FakeHost, maxTicks = 4000): void {
  for (let i = 0; i < maxTicks; i++) {
    host.clock += 10;
    m.tick(host.clock);
    if (m.summary().status === 'done' || m.summary().status === 'unavailable') return;
  }
}

/** An all-opaque pixel field of `size`. */
function opaque(size: number, r = 0, g = 255, b = 0): Uint8Array {
  const d = new Uint8Array(size * size * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
  return d;
}

/** A small well-formed raster feature whose signature is "every pixel opaque, (1,1) green". */
const okDef: SvgFeatureDef = {
  id: 'ok',
  kind: 'raster',
  size: 8,
  build: () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
  samples: [{ x: 1, y: 1, check: (r, g, _b, a) => a === 255 && g === 255 && r === 0 }],
  ink: { min: 64, max: 64 },
};

describe('SvgMatrix raster path', () => {
  it('PASSes a feature whose windows all meet the signature, after warm + measured windows', () => {
    const host = new FakeHost({ pixels: (w) => opaque(w.size) });
    const m = new SvgMatrix(host, [okDef]);
    drive(m, host);
    const s = m.summary();
    expect(s).toEqual({ status: 'done', done: 1, total: 1, pass: 1, fail: 0, error: 0 });
    const r = m.reportState().features[0];
    expect(r.status).toBe('PASS');
    expect(r.bytes).toBe(okDef.build().length);
    // one window = begin tick + load tick + decode tick: load 10 + decode 10, read timed inside one tick
    expect(r.decodeMs).toBe(20);
    expect(r.drawMs).toBe(0);
    expect(r.totalMs).toBe(20);
    expect(r.windows).toBe(SVG_MEASURE_WINDOWS);
    expect(r.inkedPx).toBe(64);
    expect(r.detail).toBeNull();
    // 3 throwaway + 12 measured windows, every one released
    expect(host.wins.length).toBe(SVG_WARM_WINDOWS + SVG_MEASURE_WINDOWS);
    expect(host.releases).toBe(host.wins.length);
    for (const w of host.wins) expect(w.released).toBe(true);
  });

  it('FAILs when the signature misses, naming the failing pixel and the pass ratio', () => {
    const host = new FakeHost({ pixels: () => new Uint8Array(8 * 8 * 4) }); // all transparent
    const m = new SvgMatrix(host, [okDef]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('pixel (1,1) = 0,0,0,0');
    expect(r.detail).toContain(`0/${SVG_MEASURE_WINDOWS} windows passed`);
    expect(m.summary().fail).toBe(1);
  });

  it('keeps PASS when only a warm window misses (warm windows are thrown away)', () => {
    let n = 0;
    const host = new FakeHost({
      pixels: (w) => (++n <= SVG_WARM_WINDOWS ? new Uint8Array(w.size * w.size * 4) : opaque(w.size)),
    });
    const m = new SvgMatrix(host, [okDef]);
    drive(m, host);
    expect(m.reportState().features[0].status).toBe('PASS');
  });

  it('reports the median, not the mean — a slow outlier window does not move the datapoint', () => {
    const host = new FakeHost({ pixels: (w) => opaque(w.size) });
    const slow = SVG_WARM_WINDOWS + 7; // the 7th measured window stalls for a whole second
    let n = 0;
    const m = new SvgMatrix(host, [okDef]);
    for (let i = 0; i < 4000; i++) {
      n = host.wins.length;
      host.clock += n === slow ? 1000 : 10;
      m.tick(host.clock);
      if (m.summary().status === 'done') break;
    }
    const r = m.reportState().features[0];
    expect(r.status).toBe('PASS');
    expect(r.totalMs).toBe(20);
  });

  it('ERRORs when the image fails to load', () => {
    const host = new FakeHost({ load: false, loadErr: 'image load failed (unsupported SVG or blob error)' });
    const m = new SvgMatrix(host, [okDef]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('ERROR');
    expect(r.detail).toContain('image load failed');
    expect(m.summary().error).toBe(1);
    expect(m.summary().fail).toBe(0);
  });

  it('TIMEOUTs a window that never loads, and moves on', () => {
    const host = new FakeHost({ load: false });
    host.begin = (_s, _z, _d) => {
      const w = new FakeWin(8, '');
      host.wins.push(w);
      return { handle: w };
    };
    const m = new SvgMatrix(host, [okDef]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('TIMEOUT');
    expect(r.detail).toContain('timed out');
    expect(r.detail).toContain(String(SVG_PHASE_TIMEOUT_MS));
    expect(m.summary().status).toBe('done');
    expect(m.summary().fail).toBe(1); // a timeout is "needs a look"
  });

  it('starts after the boot delay and logs its progress through onEvent', () => {
    const lines: string[] = [];
    const host = new FakeHost({ pixels: (w) => opaque(w.size) });
    const m = new SvgMatrix(host, [okDef], (l) => lines.push(l));
    m.tick(100);
    m.tick(200);
    expect(lines.length).toBe(0); // still inside the start delay
    drive(m, host);
    expect(lines[0]).toContain('matrix started');
    expect(lines.some((l) => l.includes('svg ok → PASS'))).toBe(true);
    expect(lines[lines.length - 1]).toContain('svg matrix done');
  });
});

const dynDef: SvgFeatureDef = { id: 'dyn', kind: 'dynamic', size: 4, build: () => '<svg/>' };
const bmpDef: SvgFeatureDef = { id: 'bmp', kind: 'bitmap', size: 4, build: () => '<svg/>' };

describe('SvgMatrix dynamic + bitmap paths', () => {
  it('FROZEN when the second read after the animation wait is byte-identical', () => {
    const host = new FakeHost({ pixels: (w) => opaque(w.size) });
    const m = new SvgMatrix(host, [dynDef]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('FROZEN');
    expect(r.detail).toContain('static image mode');
    expect(m.summary().done).toBe(1);
    expect(m.summary().fail).toBe(0); // FROZEN is the documented desktop answer — not a failure
  });

  it('ANIMATES when the redraw differs, naming the first differing byte', () => {
    const host = new FakeHost({
      pixels: (w) => {
        const d = new Uint8Array(w.size * w.size * 4);
        if (w.readNo > 1) d[0] = 9; // the second read sees a moved pixel
        return d;
      },
    });
    const m = new SvgMatrix(host, [dynDef]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('ANIMATES');
    expect(r.detail).toContain('byte');
    expect(m.summary().fail).toBe(0);
    expect(m.summary().pass).toBe(0);
  });

  it('REJECTs createImageBitmap (the desktop-pinned answer) with the error text as detail', () => {
    const host = new FakeHost();
    const m = new SvgMatrix(host, [bmpDef]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('REJECT');
    expect(r.detail).toContain('NotSupportedError');
    expect(m.summary().fail).toBe(0); // a pinned fact, not a failure
  });

  it('ACCEPTs when the realm takes it (Chromium-69 answer rides the same row)', () => {
    const host = new FakeHost({ bitmapOk: true, bitmapInfo: 'accepted 4×4' });
    const m = new SvgMatrix(host, [bmpDef]);
    drive(m, host);
    expect(m.reportState().features[0].status).toBe('ACCEPT');
    expect(m.summary().fail).toBe(0);
  });
});

describe('SvgMatrix unavailable realm', () => {
  it('a null host ends the matrix immediately, still pending (nothing to run)', () => {
    const m = new SvgMatrix(null);
    m.tick(5000);
    expect(m.summary().status).toBe('unavailable');
    expect(m.summary().done).toBe(0);
    expect(m.panelLines().join('\n')).toContain('unavailable');
  });

  it('begin()→null marks every feature UNAVAILABLE and stops (the fake Tizen realm)', () => {
    const host = new FakeHost({ beginNull: true });
    const m = new SvgMatrix(host, [okDef, dynDef, bmpDef]);
    drive(m, host);
    expect(m.summary().status).toBe('unavailable');
    const rows = m.reportState().features;
    expect(rows.map((r) => r.status)).toEqual(['UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE']);
    expect(host.wins.length).toBe(1);
  });
});

describe('SvgMatrix E3 chunk (the strict byte compare)', () => {
  const e3 = SVG_FEATURES.filter((d) => d.id === 'e3-atlas')[0];

  it('PASSes against its own generated reference, ink exact and byte-identical', () => {
    const host = new FakeHost({ pixels: () => e3Atlas().pixels });
    const m = new SvgMatrix(host, [e3]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('PASS');
    expect(r.bytes).toBe(e3Atlas().svg.length);
    expect(r.inkedPx).toBe(E3_SIZE * E3_SIZE);
  });

  it('FAILs naming the mismatch count when one pixel differs', () => {
    const host = new FakeHost({
      pixels: () => {
        const p = e3Atlas().pixels.slice();
        p[0] ^= 0xff;
        return p;
      },
    });
    const m = new SvgMatrix(host, [e3]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('1 of 16384 px differ from the reference');
  });

  it('FAILs on ink before strict (an all-transparent raster never reaches the compare)', () => {
    const host = new FakeHost({ pixels: (w) => new Uint8Array(w.size * w.size * 4) });
    const m = new SvgMatrix(host, [e3]);
    drive(m, host);
    const r = m.reportState().features[0];
    expect(r.status).toBe('FAIL');
    expect(r.detail).toContain('ink 0 outside');
  });
});

describe('SvgMatrix catalog run', () => {
  it('drives all 19 features to a done matrix on a realm that renders everything right', () => {
    // the fake renders each feature exactly as the modern-Chromium control run measured it:
    // opaque canvas (satisfies every ink max only where ink is 65536) would not be honest for all
    // rows, so this run only proves the machine walks the whole catalog and finalizes every row.
    const host = new FakeHost({
      pixels: (w) => opaque(w.size),
      bitmapOk: false,
      load: true,
    });
    const m = new SvgMatrix(host);
    drive(m, host, 100_000);
    const s = m.summary();
    expect(s.status).toBe('done');
    expect(s.total).toBe(19);
    expect(s.done).toBe(19);
    const rows = m.reportState().features;
    expect(rows.length).toBe(19);
    for (const r of rows) expect(['pending', 'running']).not.toContain(r.status);
    // the e3 row still byte-compares against its true generator with an opaque stand-in → ink exact,
    // strict differs → FAIL. A wrong-render realm must be reported as FAIL, which this is.
    expect(rows[18].status).toBe('FAIL');
    const panel = m.panelLines();
    expect(panel[0]).toContain('matrix done');
    expect(panel.length).toBe(2 + 19 + rows.filter((r) => ['FAIL', 'ERROR', 'TIMEOUT', 'ANIMATES', 'ACCEPT'].includes(r.status)).length);
  });

  it('every catalog feature sizes at the frame or the E3 chunk', () => {
    for (const d of SVG_FEATURES) expect([SVG_FEATURE_SIZE, E3_SIZE]).toContain(d.size);
  });
});
