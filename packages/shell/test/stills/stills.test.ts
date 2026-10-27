/**
 * The stills director (plan v20x A4) on a fake surface and a gated fake loader: the ending
 * watch (enter, stay, leave), the one-load-per-still rule, the swap that keeps the old picture
 * until the new one arrives, the orphan rule (a superseded decode is closed unseen), the
 * invisible failure, the probe and the band the manifest asks for. All state transitions are
 * driven through `update()` — the frame loop's only call into this module.
 */
import { describe, expect, it } from 'vitest';
import {
  STILLS_URL_DIR,
  STILL_SURFACES,
  createStillsDirector,
  moduleInfo,
  stillForEnding,
  type StillsDirector,
  type StillsImageLike,
  type StillsSurfaceLike,
} from '../../src/stills/index.js';

/** A fake decoded image: counts nothing itself (close is the injected function's job). */
function image(id: string): StillsImageLike & { id: string } {
  return { id, width: 640, height: 360 };
}

/** The surface recorder: the calls the director makes, in order. */
class FakeSurface implements StillsSurfaceLike {
  shown = false;
  readonly calls: string[] = [];
  readonly shownImages: StillsImageLike[] = [];

  show(next: StillsImageLike): void {
    this.calls.push(`show`);
    this.shownImages.push(next);
    this.shown = true;
  }

  hide(): void {
    this.calls.push('hide');
    this.shown = false;
  }

  setBand(band: 'world' | 'screen'): void {
    this.calls.push(`setBand:${band}`);
  }
}

/** A load the test releases by hand (the orphan and race probes). */
interface Gated {
  url: string;
  resolve: (next: StillsImageLike) => void;
  reject: (error: Error) => void;
}

/** Harness: director + fakes + the attribute sequence the boot would mirror. */
function makeDirector(
  options: {
    enabled?: boolean;
    probeStill?: string | null;
    endingId?: string | null;
    noSurface?: boolean;
  } = {},
) {
  const state = { topId: 'title', endingId: options.endingId ?? null };
  const flow = {
    stack: {
      get top() {
        return state.topId === null ? null : { id: state.topId };
      },
    },
    run: {
      get ending() {
        return state.endingId === null ? null : { id: state.endingId };
      },
    },
  };
  const surface = options.noSurface ? null : new FakeSurface();
  const pending: Gated[] = [];
  const closed: StillsImageLike[] = [];
  const emitted: (string | null)[] = [];
  const director: StillsDirector = createStillsDirector({
    flow,
    enabled: options.enabled ?? true,
    surface,
    loadImage: (url) =>
      new Promise<StillsImageLike>((resolve, reject) => {
        pending.push({ url, resolve, reject });
      }),
    closeImage: (next) => {
      closed.push(next);
    },
    probeStill: options.probeStill ?? null,
    onStillChange: (still) => {
      emitted.push(still);
    },
  });
  /** Drains the microtask queue so settled loads run their callbacks. */
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };
  return { director, surface, state, flow, pending, closed, emitted, flush };
}

/** Settles the last gated load with the named image. */
function settle(h: ReturnType<typeof makeDirector>, id: string): void {
  const load = h.pending[h.pending.length - 1];
  load?.resolve(image(id));
}

describe('shell/stills', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('stills');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('the manifest: five rows, world band, one per shipped ending id', () => {
    expect(STILL_SURFACES.length).toBe(5);
    for (const row of STILL_SURFACES) {
      expect(row.band).toBe('world');
      expect(row.file).toBe(`${row.id}.png`);
      expect(stillForEnding(row.ending)).toBe(row);
    }
    expect(stillForEnding('citadel')?.id).toBe('ending-citadel-falls');
    expect(stillForEnding('citadel-flawless')?.id).toBe('ending-citadel-falls-silent');
    expect(stillForEnding('throne')?.id).toBe('ending-throne-is-broken');
    expect(stillForEnding('throne-flawless')?.id).toBe('ending-deep-is-still');
    expect(stillForEnding('throne-escape')?.id).toBe('ending-flagship-slips-away');
    expect(stillForEnding('nope')).toBeNull();
    expect(stillForEnding(null)).toBeNull();
  });

  it('an ending entry loads its file once, shows on the world band, and repeats cost nothing', async () => {
    const h = makeDirector({ endingId: 'citadel' });
    h.state.topId = 'ending';
    h.director.update();
    expect(h.pending.length).toBe(1);
    expect(h.pending[0]?.url).toBe(`${STILLS_URL_DIR}/ending-citadel-falls.png`);
    expect(h.surface?.calls).toEqual(['setBand:world']); // the picture is not up yet
    settle(h, 'ending-citadel-falls');
    await h.flush();
    expect(h.surface?.calls).toEqual(['setBand:world', 'show']);
    expect(h.emitted).toEqual(['ending-citadel-falls']);
    expect(h.director.showing).toBe(true);
    h.director.update();
    h.director.update();
    expect(h.pending.length).toBe(1); // no second load, no second show
    expect(h.surface?.calls.length).toBe(2);
  });

  it('leaving the ending releases the still — closed bytes, none attribute', async () => {
    const h = makeDirector({ endingId: 'citadel' });
    h.state.topId = 'ending';
    h.director.update();
    settle(h, 'ending-citadel-falls');
    await h.flush();
    h.state.topId = 'credits';
    h.director.update();
    expect(h.surface?.calls).toEqual(['setBand:world', 'show', 'hide']);
    expect(h.emitted).toEqual(['ending-citadel-falls', null]);
    expect(h.director.showing).toBe(false);
  });

  it('a slow orphaned decode is closed unseen — never shown, never resident', async () => {
    const h = makeDirector({ endingId: 'citadel' });
    h.state.topId = 'ending';
    h.director.update();
    const first = h.pending[0];
    // The player leaves before the image decodes, then enters a different ending.
    h.state.topId = 'title';
    h.director.update();
    h.state.topId = 'ending';
    h.state.endingId = 'throne';
    h.director.update();
    const second = h.pending[1];
    // The orphan settles first — its generation is gone, so the image closes unseen.
    first.resolve(image('ending-citadel-falls'));
    await h.flush();
    expect(h.closed.length).toBe(1);
    expect((h.closed[0] as { id?: string }).id).toBe('ending-citadel-falls');
    expect(h.surface?.shownImages.length).toBe(0);
    second.resolve(image('ending-throne-is-broken'));
    await h.flush();
    expect(h.surface?.shownImages.length).toBe(1);
    expect(h.emitted).toEqual([null, 'ending-throne-is-broken']);
  });

  it('a failed load is invisible: the attribute says none and the scene keeps its art', async () => {
    const h = makeDirector({ endingId: 'throne-escape' });
    h.state.topId = 'ending';
    h.director.update();
    h.pending[0].reject(new Error('404'));
    await h.flush();
    expect(h.surface?.calls).toEqual(['setBand:world']); // no show, no hide — nothing was ever up
    expect(h.emitted).toEqual([null]);
    // Re-entering tries again (the failure is one load, not a dead feature).
    h.state.topId = 'title';
    h.director.update();
    h.state.topId = 'ending';
    h.director.update();
    settle(h, 'ending-flagship-slips-away');
    await h.flush();
    expect(h.surface?.shownImages.length).toBe(1);
  });

  it('disabled costs nothing: no loads, no surface calls, no attribute', async () => {
    const h = makeDirector({ enabled: false, endingId: 'citadel' });
    h.state.topId = 'ending';
    h.director.update();
    h.director.update();
    expect(h.pending.length).toBe(0);
    expect(h.surface?.calls.length).toBe(0);
    expect(h.emitted.length).toBe(0);
    await h.flush();
  });

  it('a renderer built without the surface leaves the director inert', () => {
    const h = makeDirector({ noSurface: true, endingId: 'citadel' });
    h.state.topId = 'ending';
    h.director.update();
    expect(h.pending.length).toBe(0); // no surface: no pointless fetch either
    expect(h.emitted.length).toBe(0);
  });

  it('the probe forces a named surface over the ending table', async () => {
    const h = makeDirector({ endingId: 'citadel', probeStill: 'ending-deep-is-still' });
    h.state.topId = 'ending';
    h.director.update();
    expect(h.pending[0]?.url).toBe(`${STILLS_URL_DIR}/ending-deep-is-still.png`);
    settle(h, 'ending-deep-is-still');
    await h.flush();
    expect(h.emitted).toEqual(['ending-deep-is-still']);
    // The probe only rides ending scenes: the title keeps the feature invisible.
    h.state.topId = 'title';
    h.director.update();
    expect(h.surface?.calls).toEqual(['setBand:world', 'show', 'hide']);
  });

  it('destroy releases the resident still and invalidates the pending load', async () => {
    const h = makeDirector({ endingId: 'citadel' });
    h.state.topId = 'ending';
    h.director.update();
    settle(h, 'ending-citadel-falls');
    await h.flush();
    // A second ending starts a load that never settles; destroy invalidates it.
    h.state.topId = 'title';
    h.director.update();
    h.state.topId = 'ending';
    h.state.endingId = 'throne-flawless';
    h.director.update();
    h.director.destroy();
    expect(h.surface?.calls).toContain('hide');
    settle(h, 'late');
    await h.flush();
    expect(h.closed.length).toBe(1); // the orphan closed unseen
    expect(h.surface?.shownImages.length).toBe(1); // only the first ever showed
  });

  it('an unknown ending id (no campaign ending) asks for nothing', () => {
    const h = makeDirector({ endingId: 'not-in-the-table' });
    h.state.topId = 'ending';
    h.director.update();
    expect(h.pending.length).toBe(0);
    expect(h.emitted.length).toBe(0);
  });
});
