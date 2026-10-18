/**
 * The web app's replay sharing (plan M3-01 — the replay browser's SHARE and its other half):
 * {@link copyReplayText} copies a replay's text with the async clipboard when the page has one
 * (a refusal ignored), and {@link listenForPastedReplays} imports text pasted on the page that looks
 * like a run replay — other pastes are left alone — until its stop function runs, handing each
 * import's result on. Since v2's R2-01 (plan_resolution.md §3.4, owner decision W4-7) a pasted
 * replay v1 recorded is answered with `RECORDED BY V1: CANNOT PLAY` ({@link pastedReplayNotice}) in
 * a page notice ({@link createPageNotice}): one status element, created on the first notice,
 * reused, hidden by its timer and removed by `dispose`.
 */
import { DEFAULT_UI_TEXT, ReplayStoreResult } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  PAGE_NOTICE_MS,
  copyReplayText,
  createPageNotice,
  listenForPastedReplays,
  pastedReplayNotice,
} from '../../src/boot/index.js';

/**
 * A window with a clipboard (or none).
 *
 * @param writeText - The clipboard's `writeText` (`undefined`: no clipboard).
 * @returns The window.
 */
function windowWithClipboard(writeText?: (text: string) => Promise<void>): Window {
  const navigator = writeText === undefined ? {} : { clipboard: { writeText } };
  return { navigator } as unknown as Window;
}

/** A window that records its listeners and dispatches paste events. */
class PasteWindow {
  /** The listeners by type. */
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  /**
   * Adds a listener.
   *
   * @param type - Event type.
   * @param listener - Listener.
   */
  addEventListener(type: string, listener: (event: Event) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  /**
   * Removes a listener.
   *
   * @param type - Event type.
   * @param listener - Listener.
   */
  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * Pastes text.
   *
   * @param text - The clipboard's text (`null`: no clipboard data).
   * @returns Whether the paste's default was prevented.
   */
  paste(text: string | null): boolean {
    let prevented = false;
    const event = {
      clipboardData:
        text === null ? null : { getData: (kind: string) => (kind === 'text' ? text : '') },
      preventDefault() {
        prevented = true;
      },
    } as unknown as Event;
    for (const listener of this.listeners.get('paste') ?? []) listener(event);
    return prevented;
  }
}

/** A fake DOM element: what the page notice sets on it. */
interface FakeElement {
  /** The tag name. */
  readonly tag: string;
  /** Attributes set. */
  readonly attributes: Map<string, string>;
  /** The inline style. */
  readonly style: { cssText: string; display: string };
  /** The text. */
  textContent: string;
  /** The parent, once appended. */
  parentNode: FakeBody | null;
  /**
   * Sets an attribute.
   *
   * @param name - Its name.
   * @param value - Its value.
   */
  setAttribute(name: string, value: string): void;
}

/** A fake `document.body`. */
class FakeBody {
  /** The children, in order. */
  readonly children: FakeElement[] = [];

  /**
   * Appends a child.
   *
   * @param child - The element.
   */
  appendChild(child: FakeElement): void {
    child.parentNode = this;
    this.children.push(child);
  }

  /**
   * Removes a child.
   *
   * @param child - The element.
   */
  removeChild(child: FakeElement): void {
    this.children.splice(this.children.indexOf(child), 1);
    child.parentNode = null;
  }
}

/** A window with a document body and hand-run timers (what {@link createPageNotice} uses). */
class NoticeWindow {
  /** The body. */
  readonly body = new FakeBody();
  /** Elements created. */
  created = 0;
  /** The document. */
  readonly document = {
    body: this.body,
    createElement: (tag: string): FakeElement => {
      this.created++;
      const attributes = new Map<string, string>();
      return {
        tag,
        attributes,
        style: { cssText: '', display: '' },
        textContent: '',
        parentNode: null,
        setAttribute: (name: string, value: string) => {
          attributes.set(name, value);
        },
      };
    },
  };
  /** Pending timers by id: callback and delay. */
  readonly timers = new Map<number, { run: () => void; ms: number }>();
  /** The next timer id. */
  private next = 1;

  /**
   * Starts a timer.
   *
   * @param run - The callback.
   * @param ms - Its delay.
   * @returns Its id.
   */
  setTimeout(run: () => void, ms: number): number {
    const id = this.next++;
    this.timers.set(id, { run, ms });
    return id;
  }

  /**
   * Cancels a timer.
   *
   * @param id - Its id.
   */
  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  /** Runs every pending timer. */
  elapse(): void {
    const due = [...this.timers.values()];
    this.timers.clear();
    for (const timer of due) timer.run();
  }
}

describe('apps/web replay sharing (M3-01)', () => {
  it('copies a replay`s text to the clipboard when the page has one', async () => {
    const copied: string[] = [];
    const win = windowWithClipboard((text) => {
      copied.push(text);
      return Promise.resolve();
    });
    expect(copyReplayText(win, '{"kind":"run-replay"}')).toBe(true);
    expect(copied).toEqual(['{"kind":"run-replay"}']);
    // A refused copy is ignored (no unhandled rejection).
    const refused = windowWithClipboard(() => Promise.reject(new Error('denied')));
    expect(copyReplayText(refused, 'x')).toBe(true);
    await Promise.resolve();
    // No clipboard (an insecure context, an old browser): nothing to share with.
    expect(copyReplayText(windowWithClipboard(), 'x')).toBe(false);
  });

  it('imports pasted run replays until stopped, leaving other pastes alone', () => {
    const win = new PasteWindow();
    const imported: string[] = [];
    const stop = listenForPastedReplays(win as unknown as Window, (text) => {
      imported.push(text);
      return 1;
    });
    const replay = '{"formatVersion":1,"kind":"run-replay"}';
    expect(win.paste(replay)).toBe(true);
    expect(win.paste('hello')).toBe(false);
    expect(win.paste(null)).toBe(false);
    expect(imported).toEqual([replay]);
    stop();
    expect(win.listeners.get('paste')?.size).toBe(0);
    expect(win.paste(replay)).toBe(false);
    expect(imported).toHaveLength(1);
  });

  it('hands every import`s result on (R2-01), only for pasted run replays', () => {
    const win = new PasteWindow();
    const results: number[] = [];
    let next: number = ReplayStoreResult.Ok;
    const stop = listenForPastedReplays(
      win as unknown as Window,
      () => next,
      (result) => results.push(result),
    );
    const replay = '{"formatVersion":1,"kind":"run-replay"}';
    expect(win.paste(replay)).toBe(true);
    next = ReplayStoreResult.Legacy;
    expect(win.paste(replay)).toBe(true);
    win.paste('hello');
    expect(results).toEqual([ReplayStoreResult.Ok, ReplayStoreResult.Legacy]);
    stop();
  });
});

describe('apps/web a pasted v1 replay is refused with a message (R2-01, W4-7)', () => {
  it('answers Legacy with RECORDED BY V1 in the player`s language, other results silently', () => {
    expect(DEFAULT_UI_TEXT.replayFromV1).toBe('RECORDED BY V1: CANNOT PLAY');
    expect(pastedReplayNotice(ReplayStoreResult.Legacy, DEFAULT_UI_TEXT)).toBe(
      'RECORDED BY V1: CANNOT PLAY',
    );
    const es = { replayFromV1: 'GRABADA CON V1: NO SE PUEDE VER' };
    expect(pastedReplayNotice(ReplayStoreResult.Legacy, es)).toBe(es.replayFromV1);
    for (const result of [
      ReplayStoreResult.Ok,
      ReplayStoreResult.TooLong,
      ReplayStoreResult.Invalid,
      ReplayStoreResult.Full,
    ]) {
      expect(pastedReplayNotice(result, DEFAULT_UI_TEXT), String(result)).toBeNull();
    }
  });

  it('shows the notice in one status element over the page until its time is up', () => {
    const win = new NoticeWindow();
    const notice = createPageNotice(win as unknown as Window);
    // Nothing is added to the page before a notice.
    expect(win.created).toBe(0);
    notice.show('RECORDED BY V1: CANNOT PLAY');
    expect(win.body.children).toHaveLength(1);
    const element = win.body.children[0];
    expect(element.tag).toBe('div');
    expect(element.attributes.get('role')).toBe('status');
    expect(element.attributes.get('aria-live')).toBe('polite');
    expect(element.style.cssText).toContain('position:fixed');
    expect(element.style.cssText).toContain('pointer-events:none');
    expect([element.textContent, element.style.display]).toEqual([
      'RECORDED BY V1: CANNOT PLAY',
      'block',
    ]);
    expect([...win.timers.values()].map((timer) => timer.ms)).toEqual([PAGE_NOTICE_MS]);
    // A second notice reuses the element and starts its time again.
    notice.show('AGAIN');
    expect([win.created, win.body.children.length, element.textContent]).toEqual([1, 1, 'AGAIN']);
    expect(win.timers.size).toBe(1);
    win.elapse();
    expect(element.style.display).toBe('none');
    // Shown again after it hid.
    notice.show('ONCE MORE');
    expect([win.created, element.style.display]).toEqual([1, 'block']);
  });

  it('dispose removes the element and its timer, and can run twice', () => {
    const win = new NoticeWindow();
    const notice = createPageNotice(win as unknown as Window, 50);
    notice.dispose();
    notice.show('RECORDED BY V1: CANNOT PLAY');
    expect([...win.timers.values()].map((timer) => timer.ms)).toEqual([50]);
    notice.dispose();
    expect(win.body.children).toEqual([]);
    expect(win.timers.size).toBe(0);
    notice.dispose();
    // A later notice builds a new element.
    notice.show('NEW');
    expect([win.created, win.body.children.length]).toEqual([2, 1]);
  });
});
