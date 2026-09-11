/**
 * Edge cases of the boot screens: the minimum font and bar sizes on tiny canvases, the exact
 * line budget of the error screen (all lines fit / one too many / a one-line room), clipping
 * at exactly the character budget (title included), empty inputs, and the overlay when the
 * document has no window or the canvas was already detached.
 */
import { describe, expect, it } from 'vitest';
import {
  BOOT_SCREEN_COLORS,
  createBootOverlay,
  drawErrorScreen,
  drawProgress,
  formatIssues,
  type Canvas2DLike,
} from '../../src/error-screen/index.js';

/** A 2D context that records text and rectangles. */
function recordingContext() {
  const texts: Array<{ text: string; x: number; y: number; style: unknown }> = [];
  const rects: Array<{ args: number[]; style: unknown }> = [];
  const ctx: Canvas2DLike = {
    fillStyle: '',
    font: '',
    textBaseline: 'alphabetic',
    fillRect(...args: number[]) {
      rects.push({ args, style: ctx.fillStyle });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, style: ctx.fillStyle });
    },
  };
  return { ctx, texts, rects };
}

/**
 * `n` short problem lines.
 *
 * @param n - Count.
 */
const lines = (n: number): string[] => Array.from({ length: n }, (_, i) => `file${i}.json: bad`);

describe('shell/error-screen drawProgress (edge)', () => {
  it('never goes below a 12 px font and a 4 px bar, and sets a top baseline', () => {
    const { ctx, rects } = recordingContext();
    drawProgress(ctx, 40, 30, 0.5, 'LOADING');
    expect(ctx.font).toBe('12px monospace');
    expect(ctx.textBaseline).toBe('top');
    const [, track, fill] = rects;
    expect(track.args).toEqual([10, 15, 20, 6]);
    expect(fill.args).toEqual([10, 15, 10, 6]);
    expect(track.style).toBe(BOOT_SCREEN_COLORS.track);
    expect(fill.style).toBe(BOOT_SCREEN_COLORS.text);
  });

  it('draws an empty bar at 0 and negative progress, a full one at exactly 1', () => {
    for (const [fraction, width] of [
      [0, 0],
      [-1, 0],
      [1, 50],
      [0.999, 50],
    ] as const) {
      const { ctx, rects } = recordingContext();
      drawProgress(ctx, 100, 100, fraction, '');
      expect(rects[rects.length - 1].args[2]).toBe(width);
    }
  });
});

describe('shell/error-screen drawErrorScreen (edge)', () => {
  // 1920×1080: font 30 px, line 42 px, margin 60, first line at 144 → room for 20 lines,
  // about 96 characters per line.
  it('shows every line when they fit exactly, and no "more" line', () => {
    const { ctx, texts } = recordingContext();
    expect(drawErrorScreen(ctx, 1920, 1080, 'T', lines(20))).toBe(20);
    expect(texts).toHaveLength(21);
    expect(texts.some((entry) => entry.text.startsWith('… and'))).toBe(false);
    expect(texts[20].y).toBe(144 + 19 * 42);
  });

  it('with one line too many, gives up the last row to "… and N more"', () => {
    const { ctx, texts } = recordingContext();
    expect(drawErrorScreen(ctx, 1920, 1080, 'T', lines(21))).toBe(19);
    expect(texts[texts.length - 1]).toMatchObject({ text: '… and 2 more', y: 144 + 19 * 42 });
  });

  it('on a canvas with room for a single row: one line fits, several collapse to the summary', () => {
    const one = recordingContext();
    expect(drawErrorScreen(one.ctx, 320, 60, 'T', ['only'])).toBe(1);
    expect(one.texts.map((entry) => entry.text)).toEqual(['T', 'only']);
    const many = recordingContext();
    expect(drawErrorScreen(many.ctx, 320, 60, 'T', lines(3))).toBe(0);
    expect(many.texts.map((entry) => entry.text)).toEqual(['T', '… and 3 more']);
  });

  it('clips at exactly the character budget, the title included; shorter text stays whole', () => {
    const { ctx, texts } = recordingContext();
    const fits = 'x'.repeat(96);
    const over = 'y'.repeat(97);
    drawErrorScreen(ctx, 1920, 1080, over, [fits, over]);
    expect(texts[0].text).toBe(`${'y'.repeat(95)}…`);
    expect(texts[1].text).toBe(fits);
    expect(texts[2].text).toBe(`${'y'.repeat(95)}…`);
  });

  it('keeps at least 8 characters per line on a very narrow canvas', () => {
    const { ctx, texts } = recordingContext();
    drawErrorScreen(ctx, 10, 400, 'ABCDEFGHIJ', ['12345678', '123456789']);
    expect(texts.map((entry) => entry.text)).toEqual(['ABCDEFG…', '12345678', '1234567…']);
  });

  it('draws only the title for no problems, and blank rows for holes in the list', () => {
    const empty = recordingContext();
    expect(drawErrorScreen(empty.ctx, 800, 600, 'WEBGL IS NOT AVAILABLE', [])).toBe(0);
    expect(empty.texts).toHaveLength(1);
    expect(empty.texts[0].style).toBe(BOOT_SCREEN_COLORS.title);
    const sparse = recordingContext();
    const holes: string[] = ['a'];
    holes[2] = 'c';
    drawErrorScreen(sparse.ctx, 800, 600, 'T', holes);
    expect(sparse.texts.map((entry) => entry.text)).toEqual(['T', 'a', '', 'c']);
  });

  it('formats no issues as no lines', () => {
    expect(formatIssues([])).toEqual([]);
  });
});

describe('shell/error-screen createBootOverlay (edge)', () => {
  /**
   * A DOM whose document has no window and a parent that records removals.
   *
   * @param defaultView - The document's window.
   */
  function dom(defaultView: { innerWidth: number; innerHeight: number } | null) {
    const removed: unknown[] = [];
    let widthWrites = 0;
    const overlay = {
      _width: 300,
      height: 150,
      get width() {
        return this._width;
      },
      set width(value: number) {
        widthWrites++;
        this._width = value;
      },
      style: {} as Record<string, string>,
      parentNode: null as unknown,
      getContext: () => recordingContext().ctx,
      setAttribute: () => {},
    };
    const parent = {
      insertBefore(node: typeof overlay) {
        node.parentNode = parent;
      },
      removeChild(node: typeof overlay) {
        removed.push(node);
        node.parentNode = null;
      },
    };
    const doc = { defaultView, createElement: () => overlay };
    const gameCanvas = { ownerDocument: doc, parentNode: parent, nextSibling: null };
    return {
      gameCanvas: gameCanvas as unknown as HTMLCanvasElement,
      overlay,
      removed,
      widthWrites: () => widthWrites,
    };
  }

  it('sizes to 640×360 without a window and only writes the size when it changes', () => {
    const fake = dom(null);
    const overlay = createBootOverlay(fake.gameCanvas);
    overlay?.showProgress(0, 'LOADING');
    overlay?.showProgress(0.5, 'LOADING');
    overlay?.showError('T', []);
    expect([fake.overlay.width, fake.overlay.height]).toEqual([640, 360]);
    expect(fake.widthWrites()).toBe(1);
  });

  it('floors fractional window sizes and never sizes below 1×1', () => {
    const fake = dom({ innerWidth: 0.5, innerHeight: 719.9 });
    createBootOverlay(fake.gameCanvas)?.showProgress(0, 'LOADING');
    expect([fake.overlay.width, fake.overlay.height]).toEqual([1, 719]);
  });

  it('remove() is safe when the overlay was already detached by someone else', () => {
    const fake = dom(null);
    const overlay = createBootOverlay(fake.gameCanvas);
    fake.overlay.parentNode = null;
    overlay?.remove();
    expect(fake.removed).toEqual([]);
  });
});
