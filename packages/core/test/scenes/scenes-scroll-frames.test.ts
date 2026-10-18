/**
 * The credits scroll and the story crawl take as long at R2-01's post-flip metrics as at the v1
 * frame (plan_resolution.md R2-01, lane U): `core/scenes` is loaded twice, under `core/config`
 * mocked to each frame (`../helpers/frame-metrics.ts` — 384×216 with the 6×8 font and `ART_SCALE`
 * 1, 640×360 with the 9×12 font and 3/2), and the `CreditsScene` and `StoryScene` of each, built
 * on the shipped campaign's credits and story, are compared tick by tick:
 *
 * - at 384×216 they move one pixel a step; at 640×360, `ART_SCALE` px a step in whole pixels —
 *   `(steps · 3) >> 1`, the rule of the sprite scenes (`core/scenes` `SCROLL_HALVES`);
 * - so they take as long in ticks at both frames — the whole credits, the whole story and the
 *   tick each story page's scene takes over — but for the rounding of the layout they scroll: a
 *   row's 1-px gap is 2 px at `ART_SCALE` 3/2 (a third of a v1 pixel more a row) and the credits
 *   run from under the frame to its centre, which grow with the frame (×5/3), not the art (×1.5).
 *   On the shipped campaign that is +28 ticks of the story's 1,046 and +70 of the credits' 1,990
 *   (at one pixel a step they took +508 and +980).
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '../../src/config/index.js';
import type * as ScenesModule from '../../src/scenes/index.js';
import {
  POST_FLIP_METRICS,
  V1_METRICS,
  mockedConfig,
  type FrameMetrics,
} from '../helpers/frame-metrics.js';

/** A campaign as the two scenes read it (`core/data` `Campaign`'s `credits` and `story`). */
interface ScrollCampaign {
  readonly credits: ReadonlyArray<{ readonly title: string; readonly lines: readonly string[] }>;
  readonly story: ReadonlyArray<{ readonly scene: string; readonly lines: readonly string[] }>;
}

/** The shipped campaign's credits and story (the file, not a loaded DB: no frame checks). */
const CAMPAIGN: ScrollCampaign = (() => {
  const url = new URL('../../../../content/campaign/main.campaign.json', import.meta.url);
  const data = JSON.parse(readFileSync(url, 'utf8')) as {
    credits: Array<{ title: string; lines?: string[] }>;
    story: Array<{ scene: string; lines: string[] }>;
  };
  return {
    credits: data.credits.map((s) => ({ title: s.title, lines: s.lines ?? [] })),
    story: data.story.map((p) => ({ scene: p.scene, lines: p.lines })),
  };
})();

/** The most two durations of one frame pair may differ, as a share of the v1 one. */
const ROUNDING_SHARE = 0.05;

/**
 * `core/scenes` loaded afresh under `core/config` mocked to a frame's metrics.
 *
 * @param m - The metrics.
 * @returns The module.
 */
async function scenesAt(m: FrameMetrics): Promise<typeof ScenesModule> {
  vi.resetModules();
  vi.doMock('../../src/config/index.js', async (importOriginal: () => Promise<unknown>) =>
    mockedConfig((await importOriginal()) as typeof ConfigModule, m),
  );
  try {
    return await import('../../src/scenes/index.js');
  } finally {
    vi.doUnmock('../../src/config/index.js');
  }
}

/** What one frame's credits and story do, tick by tick. */
interface ScrollRun {
  /** The module's tick rates and holds. */
  readonly scenes: typeof ScenesModule;
  /** Ticks the whole credits take. */
  readonly creditsTicks: number;
  /** The credits' scroll per tick until it stops (`stopped` after the last). */
  readonly creditsScroll: number[];
  /** Ticks the whole story takes. */
  readonly storyTicks: number;
  /** The story's scroll per tick until its last row has left (the hold after it left out). */
  readonly storyScroll: number[];
  /** Per story page: the tick its scene takes over. */
  readonly pageTicks: number[];
}

/**
 * Builds a frame's credits and story on the shipped campaign and reads them tick by tick.
 *
 * @param scenes - `core/scenes` at that frame.
 * @returns What they do.
 */
function run(scenes: typeof ScenesModule): ScrollRun {
  // The scenes read only the campaign from their flow until they are entered.
  const flow = { host: { content: { campaign: CAMPAIGN } } } as unknown as ConstructorParameters<
    typeof scenes.CreditsScene
  >[0];
  const credits = new scenes.CreditsScene(flow);
  const story = new scenes.StoryScene(flow);
  const creditsScroll: number[] = [];
  for (let t = 0; ; t++) {
    credits.ticks = t;
    if (credits.stopped) break;
    creditsScroll.push(credits.scroll);
  }
  const storyScroll: number[] = [];
  const pageTicks: number[] = [0];
  for (let t = 0; t < story.duration - scenes.STORY_HOLD_TICKS; t++) {
    story.ticks = t;
    storyScroll.push(story.scroll);
    if (story.page === pageTicks.length) pageTicks.push(t);
  }
  return {
    scenes,
    creditsTicks: credits.duration,
    creditsScroll,
    storyTicks: story.duration,
    storyScroll,
    pageTicks,
  };
}

describe('core/scenes credits and story crawl at both frames (R2-01)', () => {
  let v1: ScrollRun;
  let flipped: ScrollRun;

  beforeAll(async () => {
    v1 = run(await scenesAt(V1_METRICS));
    flipped = run(await scenesAt(POST_FLIP_METRICS));
  });

  it('loads the scenes at each frame (the rows laid out at 11 and 17 px)', () => {
    expect([v1.scenes.CREDITS_ROW_HEIGHT, v1.scenes.STORY_ROW_HEIGHT]).toEqual([11, 11]);
    expect([flipped.scenes.CREDITS_ROW_HEIGHT, flipped.scenes.STORY_ROW_HEIGHT]).toEqual([17, 17]);
    expect(CAMPAIGN.credits.length).toBeGreaterThan(0);
    expect(CAMPAIGN.story.length).toBeGreaterThan(1);
  });

  it('scrolls one pixel a step at 384×216 and ART_SCALE px a step at 640×360', () => {
    const halves = 2 * POST_FLIP_METRICS.artScale;
    for (const [which, perStep, a, b] of [
      ['credits', v1.scenes.CREDITS_SCROLL_TICKS, v1.creditsScroll, flipped.creditsScroll],
      ['story', v1.scenes.STORY_SCROLL_TICKS, v1.storyScroll, flipped.storyScroll],
    ] as const) {
      let bad = 0;
      const n = Math.min(a.length, b.length);
      for (let t = 0; t < n; t++) {
        const steps = Math.floor(t / perStep);
        if (a[t] !== steps || b[t] !== (steps * halves) >> 1) bad++;
      }
      expect({ which, bad }).toEqual({ which, bad: 0 });
      // Compared over the whole v1 run (the shorter), hundreds of ticks.
      expect({ which, n }).toEqual({ which, n: a.length });
      expect(n).toBeGreaterThan(500);
    }
  });

  it('takes as long in ticks at both frames, but for the rounding of the scaled layout', () => {
    const pairs: Array<[string, number, number]> = [
      ['credits', v1.creditsTicks, flipped.creditsTicks],
      ['story', v1.storyTicks, flipped.storyTicks],
    ];
    expect(flipped.pageTicks).toHaveLength(v1.pageTicks.length);
    for (let p = 1; p < v1.pageTicks.length; p++) {
      pairs.push([`story page ${p}`, v1.pageTicks[p], flipped.pageTicks[p]]);
    }
    for (const [which, before, after] of pairs) {
      // The scaled layout only ever rounds up: never shorter, a few per cent longer at most.
      expect({ which, longer: after >= before }).toEqual({ which, longer: true });
      const share = (after - before) / before;
      expect({ which, close: share <= ROUNDING_SHARE }).toEqual({ which, close: true });
    }
  });
});
