/**
 * The web app's replay sharing (plan M3-01 — the replay browser's SHARE and its other half):
 * {@link copyReplayText} copies a replay's text with the async clipboard when the page has one
 * (a refusal ignored), and {@link listenForPastedReplays} imports text pasted on the page that looks
 * like a run replay — other pastes are left alone — until its stop function runs.
 */
import { describe, expect, it } from 'vitest';
import { copyReplayText, listenForPastedReplays } from '../../src/boot/index.js';

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
});
