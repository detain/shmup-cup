/**
 * The realm's {@link SvgProbeHost}: blob URLs, `Image`, a private off-DOM canvas and
 * `createImageBitmap` — the exact pipeline the TV's Chromium 69 exposes, and the one the pure
 * `svgProbe.ts` matrix drives. Created once by `main.ts`; `null` (the realm cannot run the matrix) is
 * a first-class answer, not an error.
 *
 * Chromium 69 / 68 contract: `Image`, `Blob`, `URL.createObjectURL` and `createImageBitmap` all
 * predate the floor; `img.decode()` (Chrome 65) is used when present. Nothing here touches the arena
 * canvas — the probe keeps its own.
 *
 * @module svgHost
 */

import type { SvgProbeHost, SvgWindow } from './svgProbe';

/** Real window payload behind the opaque handle. */
interface Win {
  img: HTMLImageElement;
  url: string;
  size: number;
}

/**
 * Builds the host, or `null` when the realm cannot raster SVG images through the image pipeline.
 *
 * @returns the host (allocation: one lazily-created canvas per feature size, reused across windows).
 */
export function createSvgHost(): SvgProbeHost | null {
  if (typeof Image !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function')
    return null;
  const canvases = new Map<number, HTMLCanvasElement>();
  const ctxs = new Map<number, CanvasRenderingContext2D>();
  const canvasFor = (size: number): CanvasRenderingContext2D => {
    let ctx = ctxs.get(size);
    if (ctx === undefined) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const got = canvas.getContext('2d');
      if (got === null) throw new Error('2d context unavailable');
      ctx = got;
      canvases.set(size, canvas);
      ctxs.set(size, ctx);
    }
    return ctx;
  };
  return {
    now: () => performance.now(),
    begin(source, size, done) {
      const win: Win = { img: new Image(), url: '', size };
      win.url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      win.img.onload = () => done(true, '');
      win.img.onerror = () => done(false, 'image load failed (unsupported SVG or blob error)');
      win.img.src = win.url;
      return win as unknown as SvgWindow;
    },
    decode(win, done) {
      const w = win as unknown as Win;
      if (typeof w.img.decode === 'function') w.img.decode().then(() => done(true, ''), (e: unknown) => done(false, String(e instanceof Error ? e.message : e)));
      else done(true, '');
    },
    read(win) {
      const w = win as unknown as Win;
      const ctx = canvasFor(w.size);
      ctx.clearRect(0, 0, w.size, w.size);
      ctx.drawImage(w.img, 0, 0);
      const data = ctx.getImageData(0, 0, w.size, w.size);
      return { size: w.size, data: data.data };
    },
    bitmap(win, done) {
      const w = win as unknown as Win;
      if (typeof createImageBitmap !== 'function') {
        done(false, 'no createImageBitmap in this realm');
        return;
      }
      createImageBitmap(w.img).then(
        (b) => {
          // Capture the size first: a closed ImageBitmap reports 0×0 (the control run pinned it).
          const info = 'accepted ' + b.width + '×' + b.height;
          // ImageBitmap.close() is newer than the floor; the object is garbage anyway.
          if (typeof b.close === 'function') b.close();
          done(true, info);
        },
        (e: unknown) => done(false, (e instanceof Error ? e.name + ': ' + e.message : String(e)).slice(0, 120)),
      );
    },
    release(win) {
      const w = win as unknown as Win;
      if (w.url !== '') URL.revokeObjectURL(w.url);
      w.img.onload = null;
      w.img.onerror = null;
    },
  };
}
