/**
 * The cutscene director (v2 R7-VID): the trigger mapping, the windows, the skip and the silent
 * failure — with a fake surface (the `CutsceneSurface` subset) and a fake flow. The surface is
 * driven to present by hand (`autoPresent`), and the dispatcher is the shape the director's
 * `connect` registers onto.
 */
import type { SimEvent } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import type { EventDispatcher } from '../../src/dispatch/index.js';
import {
  VIDEO_CLIPS,
  VIDEO_URL_DIR,
  createCutsceneDirector,
  type CutsceneDirector,
  type CutsceneFlow,
  type CutsceneSurface,
  type VideoBand,
} from '../../src/cutscene/index.js';

/** The fake surface: records plays and stops; `present` decides what `play()` resolves to. */
class FakeSurface implements CutsceneSurface {
  urls: string[] = [];
  loops: boolean[] = [];
  bands: string[] = [];
  stops = 0;
  playing = false;
  /** Whether a started clip "presents" (false = media failure). */
  succeed = true;
  /** Whether `play` resolves at once (real media resolves after a load). */
  autoPresent = true;

  play(url: string, loop: boolean): Promise<boolean> {
    this.urls.push(url);
    this.loops.push(loop);
    if (!this.succeed) return Promise.resolve(false);
    if (this.autoPresent) this.playing = true;
    return Promise.resolve(true);
  }
  setBand(band: VideoBand): void {
    this.bands.push(band);
  }
  stop(): void {
    this.stops++;
    this.playing = false;
  }
}

/** A fake dispatcher: `connect` handlers are captured and fired by the tests. */
class FakeDispatcher {
  readonly handlers = new Map<number, (event: Readonly<SimEvent>) => void>();
  on(kind: number, handler: (event: Readonly<SimEvent>) => void): () => void {
    this.handlers.set(kind, handler);
    return () => this.handlers.delete(kind);
  }
  /** The dispatcher-shaped view (the director's parameter type). */
  asEventDispatcher(): EventDispatcher {
    return this as unknown as EventDispatcher;
  }
  fire(kind: number, event: Partial<SimEvent> = {}): void {
    this.handlers.get(kind)?.({ kind, id: 0, x: 0, y: 0, param: 0, ...event } as SimEvent);
  }
}

/** The mutable flow the director reads. */
interface FakeFlow extends CutsceneFlow {
  setScene(id: string): void;
  setStage(stage: string | null): void;
  setEscape(inEscape: boolean): void;
}

/** A flow whose scene, stage and escape flag the test drives. */
function makeFlow(scene: string | null, stage: string | null = null): FakeFlow {
  const state = { scene, stage, inEscape: false };
  return {
    stack: {
      get top(): { id: string } | null {
        return state.scene === null ? null : { id: state.scene };
      },
    },
    run: {
      get stage(): string | null {
        return state.stage;
      },
      get inEscape(): boolean {
        return state.inEscape;
      },
    },
    setScene(id: string): void {
      state.scene = id;
    },
    setStage(stageValue: string | null): void {
      state.stage = stageValue;
    },
    setEscape(value: boolean): void {
      state.inEscape = value;
    },
  };
}

/** A pressed-latch the tests set. */
interface Latch {
  pressed: boolean;
}

/**
 * A director over fresh fakes.
 *
 * @param scene - The starting scene (default the title).
 * @param stage - The run's stage id (default none).
 * @returns The parts a test needs.
 */
function makeDirector(
  scene: string | null = 'title',
  stage: string | null = null,
): {
  director: CutsceneDirector;
  surface: FakeSurface;
  flow: FakeFlow;
  latch: Latch;
  events: FakeDispatcher;
} {
  const surface = new FakeSurface();
  const flow = makeFlow(scene, stage);
  const latch: Latch = { pressed: false };
  const events = new FakeDispatcher();
  const director = createCutsceneDirector({
    flow,
    enabled: true,
    surface,
    anyPressed: () => {
      const pressed = latch.pressed;
      latch.pressed = false;
      return pressed;
    },
  });
  director.connect(events.asEventDispatcher());
  return { director, surface, flow, latch, events };
}

describe('cutscene — scene-entry stings', () => {
  it('plays the title sting when the flow reaches the title, and cuts it at its window', () => {
    const { director, surface, flow } = makeDirector(null);
    flow.setScene('title');
    director.update(10); // first sight of the title: the sting starts
    expect(director.clip).toBe('title-sting');
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/title-sting.mp4`]);
    expect(surface.loops).toEqual([false]);
    expect(surface.bands).toEqual(['screen']); // the title backdrop only yields to the screen band
    director.update(309); // window = 300 ticks from tick 10: still up
    expect(director.clip).toBe('title-sting');
    director.update(311);
    expect(director.clip).toBeNull();
    expect(surface.stops).toBe(1);
    // A second title visit stings again.
    flow.setScene('difficulty');
    director.update(400);
    flow.setScene('title');
    director.update(420);
    expect(director.clip).toBe('title-sting');
    director.destroy();
  });

  it('loops the ambient through the whole attract scene and stops at its end', () => {
    const { director, surface, flow } = makeDirector(null);
    flow.setScene('demo');
    director.update(60);
    expect(director.clip).toBe('attract-ambient');
    expect(surface.loops).toEqual([true]);
    director.update(10_000); // no window: the ambient outlives every cap
    expect(director.clip).toBe('attract-ambient');
    flow.setScene('title');
    director.update(10_010);
    expect(surface.stops).toBe(1);
    expect(director.clip).toBe('title-sting'); // the sting takes the title
  });

  it('story and ending show their clips', () => {
    const { director, surface, flow } = makeDirector(null);
    flow.setScene('story');
    director.update(5);
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/story-vista.mp4`]);
    flow.setScene('ending');
    director.update(300);
    expect(surface.urls[1]).toBe(`${VIDEO_URL_DIR}/dawn-flight.mp4`);
    director.destroy();
  });

  it('the ?video= probe replaces the title sting', () => {
    const surface = new FakeSurface();
    const flow = makeFlow(null);
    const director = createCutsceneDirector({
      flow,
      enabled: true,
      surface,
      probeClip: 'ark-sailing',
    });
    flow.setScene('title');
    director.update(0);
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/ark-sailing.mp4`]);
    expect(director.clip).toBe('ark-sailing');
    director.destroy();
  });

  it('onClipChange mirrors every clip transition (the canvas attribute for the spec)', async () => {
    const surface = new FakeSurface();
    const flow = makeFlow(null);
    const seen: (string | null)[] = [];
    const director = createCutsceneDirector({
      flow,
      enabled: true,
      surface,
      probeClip: 'attract-ambient',
      onClipChange: (clip) => seen.push(clip),
    });
    flow.setScene('title');
    director.update(0); // the probe starts: its id is announced at once
    expect(seen).toEqual(['attract-ambient']);
    await Promise.resolve(); // the start resolves: presented
    flow.setScene('difficulty'); // the ambient dies with the scene…
    director.update(5);
    flow.setScene('title'); // …and the title visit takes the probe again
    director.update(10);
    expect(seen).toEqual(['attract-ambient', null, 'attract-ambient']);
    await Promise.resolve();
    // A refused start is forgotten: the announcement is undone with the failure.
    surface.succeed = false;
    flow.setScene('game');
    director.update(20);
    flow.setScene('title');
    director.update(30);
    await Promise.resolve(); // the rejection lands: clearClip
    expect(seen.slice(-2)).toEqual(['attract-ambient', null]);
    director.destroy();
  });
});

describe('cutscene — simulation-event triggers', () => {
  it('a WARNING band shows its zone sting for the band window', () => {
    const { director, surface, events } = makeDirector('game', 'zone-c');
    director.update(100); // learn the scene
    events.fire(10 /* SimEventKind.Dim */, { id: 25, param: 120 });
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/warn-zone-c.mp4`]);
    director.update(219); // window 120 from tick 100: still up
    expect(director.clip).toBe('warn-zone-c');
    director.update(220);
    expect(director.clip).toBeNull();
  });

  it('degrades silently for zone F, for the band-clear Dim, and outside the game', () => {
    const { director, surface, flow, events } = makeDirector('game', 'zone-f');
    director.update(100);
    events.fire(10, { id: 25, param: 120 }); // no F clip
    expect(surface.urls).toEqual([]);
    events.fire(10, { id: 0, param: 120 }); // band clearing
    expect(surface.urls).toEqual([]);
    director.update(101);
    flow.setScene('title');
    director.update(102); // title sting (not a warning)
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/title-sting.mp4`]);
    surface.urls.length = 0;
    flow.setScene('game');
    flow.setStage('zone-a');
    director.update(200); // entering the game shows nothing on its own…
    expect(surface.urls).toEqual([]);
    events.fire(10, { id: 10, param: 0 }); // param 0: the cap-sized window
    director.update(201);
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/warn-zone-a.mp4`]);
    director.destroy();
  });

  it('zone I beats show their clips; other zones stay procedural', () => {
    const { director, surface, flow, events } = makeDirector('game', 'zone-b');
    director.update(10);
    events.fire(11 /* BossDefeated */);
    expect(surface.urls).toEqual([]);
    flow.setStage('zone-i');
    events.fire(11);
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/hull-explosions.mp4`]);
    surface.urls.length = 0;
    // (a clip up blocks the next trigger — stop it first)
    director.update(311);
    events.fire(14 /* BossEscaped */);
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/ark-sailing.mp4`]);
    director.destroy();
  });

  it('the escape shows its clip once, on the rising edge', () => {
    const { director, surface, flow } = makeDirector('game', 'zone-h');
    director.update(10);
    flow.setEscape(true);
    director.update(11);
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/escape-collapse.mp4`]);
    director.update(312); // window over
    surface.urls.length = 0;
    director.update(313);
    expect(surface.urls).toEqual([]); // no re-trigger while it stays in escape
    director.destroy();
  });
});

describe('cutscene — skip, failure and state', () => {
  it('any pressed action skips the clip at once', () => {
    const { director, surface, flow, latch } = makeDirector(null);
    flow.setScene('title');
    director.update(10);
    expect(director.clip).toBe('title-sting');
    latch.pressed = true;
    director.update(11);
    expect(director.clip).toBeNull();
    expect(surface.stops).toBe(1);
  });

  it('a media failure is forgotten and the next trigger runs again', async () => {
    const { director, surface, flow } = makeDirector(null);
    surface.succeed = false;
    flow.setScene('title');
    director.update(10);
    expect(surface.urls.length).toBe(1);
    await Promise.resolve(); // the failed start resolves its promise (the `.then` bookkeeping)
    expect(director.clip).toBeNull(); // failed start cleared
    surface.succeed = true;
    flow.setScene('difficulty');
    director.update(20);
    flow.setScene('title');
    director.update(30);
    expect(director.clip).toBe('title-sting');
    director.destroy();
  });

  it('a clip that ends by itself resets the director', async () => {
    const { director, surface, flow } = makeDirector(null);
    flow.setScene('title');
    director.update(10);
    await Promise.resolve(); // the start is presented
    surface.playing = false; // the element reached its end (non-loop)
    director.update(11);
    expect(director.clip).toBeNull();
  });

  it('a skip during the load cannot leave the quad up when the start lands', async () => {
    const { director, surface, flow, latch } = makeDirector(null);
    surface.autoPresent = false; // the start resolves, but the frame is still loading
    flow.setScene('title');
    director.update(10);
    latch.pressed = true;
    director.update(11); // skipped while pending
    expect(director.clip).toBeNull();
    await Promise.resolve(); // the resolved-true start lands on a clip that is gone
    expect(surface.stops).toBe(2); // the skip's stop and the late one that keeps it hidden
    expect(director.clip).toBeNull();
  });

  it('nothing shows for an inert surface or a disabled director', () => {
    const { director, surface } = makeDirector();
    director.destroy();
    surface.urls.length = 0;
    director.update(500);
    expect(surface.urls).toEqual([]);
    const disabled = createCutsceneDirector({ flow: makeFlow('title'), enabled: false });
    disabled.update(0);
    expect(disabled.clip).toBeNull();
    expect(disabled.enabled).toBe(false);
  });

  it('playClip forces a known id and refuses unknown ones', () => {
    const { director, surface } = makeDirector('game', 'zone-a');
    director.update(10);
    expect(director.playClip('nope')).toBe(false);
    expect(director.playClip('story-vista')).toBe(true);
    expect(surface.urls).toEqual([`${VIDEO_URL_DIR}/story-vista.mp4`]);
    expect(director.playClip('story-vista')).toBe(false); // one clip at a time
    director.destroy();
  });

  it('a null stack top is just no scene', () => {
    const { director, surface } = makeDirector(null);
    director.update(0);
    expect(surface.urls).toEqual([]);
    expect(director.clip).toBeNull();
    director.destroy();
  });
});

describe('cutscene — the manifest shape', () => {
  it('names every file `<id>.mp4` with unique ids and exactly one loop', () => {
    const ids = new Set<string>();
    let loops = 0;
    for (const row of VIDEO_CLIPS) {
      expect(row.file).toBe(`${row.id}.mp4`);
      expect(ids.has(row.id)).toBe(false);
      ids.add(row.id);
      expect(row.bytes).toBeGreaterThan(0);
      if (row.loop) loops++;
    }
    expect(loops).toBe(1);
    expect(ids.has('attract-ambient')).toBe(true);
  });
});
