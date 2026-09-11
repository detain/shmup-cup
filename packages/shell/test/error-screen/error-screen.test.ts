/**
 * Tests for the boot screens: progress bar geometry and clamping, the error screen's clipping
 * and "… and N more" line, issue formatting, and the overlay canvas lifecycle (inserted after
 * the game canvas, sized to the window, removed once) with a fake DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  BOOT_SCREEN_COLORS,
  createBootOverlay,
  drawErrorScreen,
  drawProgress,
  formatIssues,
  moduleInfo,
  type Canvas2DLike,
} from '../../src/error-screen/index.js';

/** A 2D context that records its calls. */
function recordingContext() {
  const calls: Array<{ op: string; args: unknown[]; style: unknown }> = [];
  const ctx: Canvas2DLike = {
    fillStyle: '',
    font: '',
    textBaseline: 'alphabetic',
    fillRect(...args: number[]) {
      calls.push({ op: 'rect', args, style: ctx.fillStyle });
    },
    fillText(...args: [string, number, number]) {
      calls.push({ op: 'text', args, style: ctx.fillStyle });
    },
  };
  return { ctx, calls };
}

describe('shell/error-screen drawProgress', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('error-screen');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('clears to the lifted navy background and fills the bar by the clamped fraction', () => {
    const { ctx, calls } = recordingContext();
    drawProgress(ctx, 1920, 1080, 0.25, 'LOADING');
    expect(calls[0]).toEqual({
      op: 'rect',
      args: [0, 0, 1920, 1080],
      style: BOOT_SCREEN_COLORS.background,
    });
    const texts = calls.filter((call) => call.op === 'text').map((call) => call.args[0]);
    expect(texts).toEqual(['SHMUP CUP', 'LOADING']);
    const [track, fill] = calls.filter((call) => call.op === 'rect').slice(1);
    expect(track?.args[2]).toBe(960);
    expect(fill?.args[2]).toBe(240);
    expect(ctx.font).toBe('30px monospace');

    const over = recordingContext();
    drawProgress(over.ctx, 100, 100, 3, 'X');
    expect(over.calls[over.calls.length - 1]?.args[2]).toBe(50);
    const under = recordingContext();
    drawProgress(under.ctx, 100, 100, Number.NaN, 'X');
    expect(under.calls[under.calls.length - 1]?.args[2]).toBe(0);
  });
});

describe('shell/error-screen drawErrorScreen', () => {
  it('draws the title in the title colour and one line per problem', () => {
    const { ctx, calls } = recordingContext();
    expect(drawErrorScreen(ctx, 1920, 1080, 'CONTENT ERRORS: 2 PROBLEMS', ['a: x', 'b: y'])).toBe(
      2,
    );
    const texts = calls.filter((call) => call.op === 'text');
    expect(texts.map((call) => call.args[0])).toEqual([
      'CONTENT ERRORS: 2 PROBLEMS',
      'a: x',
      'b: y',
    ]);
    expect(texts[0]?.style).toBe(BOOT_SCREEN_COLORS.title);
    expect(texts[1]?.style).toBe(BOOT_SCREEN_COLORS.text);
  });

  it('clips long lines with … and summarises the lines that do not fit', () => {
    const { ctx, calls } = recordingContext();
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ${'x'.repeat(400)}`);
    const shown = drawErrorScreen(ctx, 640, 360, 'T', lines);
    const texts = calls.filter((call) => call.op === 'text').map((call) => String(call.args[0]));
    expect(shown).toBeLessThan(200);
    expect(texts).toHaveLength(shown + 2);
    expect(texts[1]?.endsWith('…')).toBe(true);
    expect(texts[1].length).toBeLessThan(100);
    expect(texts[texts.length - 1]).toBe(`… and ${200 - shown} more`);
  });

  it('formats validation issues as "path: message"', () => {
    expect(formatIssues([{ path: 'enemies/a.json:hp', message: 'must be ≥ 1' }])).toEqual([
      'enemies/a.json:hp: must be ≥ 1',
    ]);
  });
});

/** A minimal DOM: a document that creates canvases and a parent node. */
function fakeDom(context: Canvas2DLike | null) {
  const inserted: unknown[] = [];
  const removed: unknown[] = [];
  const doc = {
    defaultView: { innerWidth: 1280, innerHeight: 720 },
    createElement: () => {
      const attributes = new Map<string, string>();
      const overlay = {
        width: 300,
        height: 150,
        style: {} as Record<string, string>,
        parentNode: null as unknown,
        getContext: () => context,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        attributes,
      };
      return overlay;
    },
  };
  const parent = {
    insertBefore(node: { parentNode: unknown }, before: unknown) {
      node.parentNode = parent;
      inserted.push([node, before]);
    },
    removeChild(node: { parentNode: unknown }) {
      node.parentNode = null;
      removed.push(node);
    },
  };
  const sibling = {};
  const gameCanvas = { ownerDocument: doc, parentNode: parent, nextSibling: sibling };
  return { gameCanvas: gameCanvas as unknown as HTMLCanvasElement, inserted, removed, sibling };
}

describe('shell/error-screen createBootOverlay', () => {
  it('inserts a fixed full-window canvas after the game canvas and draws on it', () => {
    const { ctx, calls } = recordingContext();
    const dom = fakeDom(ctx);
    const overlay = createBootOverlay(dom.gameCanvas);
    expect(overlay).not.toBeNull();
    const canvas = overlay!.canvas as unknown as {
      width: number;
      height: number;
      style: Record<string, string>;
      attributes: Map<string, string>;
    };
    expect(dom.inserted).toEqual([[canvas, dom.sibling]]);
    expect(canvas.style).toMatchObject({ position: 'fixed', width: '100%', height: '100%' });
    expect(canvas.attributes.get('data-shmup-overlay')).toBe('boot');
    overlay!.showProgress(0.5, 'LOADING');
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
    overlay!.showError('BOOM', ['x']);
    expect(calls.some((call) => call.args[0] === 'BOOM')).toBe(true);
    overlay!.remove();
    overlay!.remove();
    expect(dom.removed).toEqual([canvas]);
  });

  it('returns null without a document, a parent or a 2D context', () => {
    expect(createBootOverlay({} as HTMLCanvasElement)).toBeNull();
    expect(createBootOverlay(fakeDom(null).gameCanvas)).toBeNull();
  });
});
