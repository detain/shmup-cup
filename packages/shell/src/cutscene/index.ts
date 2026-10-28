/**
 * # cutscene — the host-side video director (v2 R7-VID)
 *
 * **Responsibility.** Map the simulation's presentation moments onto the shipped clip set
 * (`scripts/v20x/video-encode.mjs`, the manifest {@link VIDEO_CLIPS} below): a boss WARNING
 * window shows its zone's sting, the final zone's defeat / escape / ending show theirs, and the
 * title, attract loop and story scenes show theirs. The director is a pure PRESENTER — it reads
 * the flow's state and the drained events, and the simulation never waits on media: every clip
 * runs inside a fixed window of presentation ticks, the window only ever cuts a clip short
 * (never the other way), any pressed action skips it at once (the TV law: a viewer never has to
 * reach for a mouse), and a missing file, a refused `play()` or a media error leaves the
 * procedural scene running untouched — the surface reports the failure and this module forgets
 * the clip. The kill switch is resolved here ({@link resolveVideoSetting}): the `SHMUP_NO_VIDEO`
 * page global, the `?novid=1` search parameter, a stored `'off'` choice and the host's explicit
 * option all switch the whole feature off before the renderer is even built (no surface, no
 * poll wrapper, zero cost); `?video=<id>` forces one clip for the browser spec.
 *
 * Steady frames cost a handful of field compares (the scene id, the escape flag, a window
 * counter); string work (the zone letter, the clip url) happens only on a trigger. One clip
 * shows at a time; a trigger while one is up does not interrupt it.
 *
 * **Implements.**
 * - shmup_feat.md §17 — the scene flow (the scenes this director watches)
 *
 * **Public API.** {@link VIDEO_CLIPS}, {@link VIDEO_URL_DIR}, {@link VideoClip},
 * {@link CutsceneDirector}, {@link createCutsceneDirector},
 * {@link resolveVideoSetting}, {@link videoProbeFromSearch}, {@link VIDEO_DEFAULT_ON},
 * {@link moduleInfo}.
 *
 * @module
 */
import { SimEventKind, defineModule, type SimEvent } from '@shmup/core';
import type { EventDispatcher } from '../dispatch/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'cutscene',
  status: 'implemented',
  specRefs: ['shmup_feat.md §17'],
});

/**
 * What the director calls on the renderer's video surface (the structural subset of
 * `@shmup/render-pixi`'s `VideoSurface` — so the director is tested without Pixi).
 */
export interface CutsceneSurface {
  /** Whether a clip is drawn right now. */
  readonly playing: boolean;
  /**
   * Switch to a clip and start it (`false` = the media refused or failed; never throws).
   *
   * @param url - The clip's url.
   * @param loop - Whether the element loops natively.
   * @returns Whether the clip started.
   */
  play(url: string, loop: boolean): Promise<boolean>;
  /**
   * Moves the quad to the clip's draw band before the start (optional: a host whose surface has
   * no bands just draws in the band it was built with).
   *
   * @param band - The clip's band from the manifest row.
   */
  setBand?(band: VideoBand): void;
  /** Hide the surface (the pause keeps the last frame readable). */
  stop(): void;
}

/** The draw band a clip wants (the renderer surface's `setBand`; R7-VID e2e law). */
export type VideoBand = 'world' | 'screen';

/** The scenes and triggers a clip can ride (the manifest's `trigger` column). */
export interface VideoClip {
  /** The clip's id (also its file name without the extension). */
  readonly id: string;
  /** The file inside {@link VIDEO_URL_DIR}. */
  readonly file: string;
  /** Encoded size in bytes (the ledger's, mirrored for the budget disclosure). */
  readonly bytes: number;
  /** Whether the element loops (only the attract ambient). */
  readonly loop: boolean;
  /**
   * Which draw band the clip needs: `world` draws over the playfield under the HUD/UI (every
   * gameplay window), `screen` over the UI — the title alone, whose scene paints a full-frame
   * backdrop into the UI that the world band could never show through.
   */
  readonly band: VideoBand;
}

/** Where the built app serves the clips (the `shmupVideos()` Vite plugin's directory). */
export const VIDEO_URL_DIR = 'assets/video';

/**
 * The shipped set — the 15 re-encoded art-prompts winners (the encode kit's ledger is the
 * byte-for-byte record; `test/cutscene/clips-consistency.test.ts` keeps this table honest).
 * No clip exists for zone F's WARNING or the captains: those triggers degrade silently.
 */
export const VIDEO_CLIPS: readonly VideoClip[] = Object.freeze([
  clip('title-sting', 234971, false, 'screen'),
  clip('attract-ambient', 198061, true, 'world'),
  clip('story-vista', 400147, false, 'world'),
  clip('warn-zone-a', 354205, false, 'world'),
  clip('warn-zone-b', 632385, false, 'world'),
  clip('warn-zone-c', 589917, false, 'world'),
  clip('warn-zone-d', 424864, false, 'world'),
  clip('warn-zone-e', 658303, false, 'world'),
  clip('warn-zone-g', 576411, false, 'world'),
  clip('warn-zone-h', 565180, false, 'world'),
  clip('warn-zone-i', 209186, false, 'world'),
  clip('ark-sailing', 452078, false, 'world'),
  clip('escape-collapse', 656624, false, 'world'),
  clip('hull-explosions', 652652, false, 'world'),
  clip('dawn-flight', 198108, false, 'world'),
]);

/**
 * Builds one manifest row (file name is always `<id>.mp4`).
 *
 * @param id - The clip id.
 * @param bytes - The ledger's encoded size.
 * @param loop - Whether the clip loops.
 * @param band - The draw band the clip needs.
 * @returns The frozen row.
 */
function clip(id: string, bytes: number, loop: boolean, band: VideoBand): VideoClip {
  return Object.freeze({ id, file: `${id}.mp4`, bytes, loop, band });
}

/** The manifest keyed by id (built once, cold). */
const CLIP_BY_ID: Readonly<Record<string, VideoClip>> = (() => {
  const map: Record<string, VideoClip> = {};
  for (let i = 0; i < VIDEO_CLIPS.length; i++) {
    const row = VIDEO_CLIPS[i];
    map[row.id] = row;
  }
  return map;
})();

/** The zone letter (from `zone-a` … `zone-i`) whose WARNING shows which clip; zone F has none. */
const WARNING_BY_LETTER: Readonly<Record<string, string>> = Object.freeze({
  a: 'warn-zone-a',
  b: 'warn-zone-b',
  c: 'warn-zone-c',
  d: 'warn-zone-d',
  e: 'warn-zone-e',
  g: 'warn-zone-g',
  h: 'warn-zone-h',
  i: 'warn-zone-i',
});

/**
 * The cap of every clip window in presentation ticks (5 s at 60): a window only ever cuts a
 * clip short, never extends it; the ambient loop ignores it.
 */
const CLIP_WINDOW_TICKS = 300;

/** The storage key of the player's own choice ('on' / 'off'); absent means the default. */
export const VIDEO_SETTING_KEY = 'shmup.video';

/**
 * The shipped default. It rode **off** while the TV render bench's video-decode rows were
 * pending: measured headless (SwiftShader, 2026-10-27, owner ruling 'Vs', lane v20x-VID,
 * `v20x-VID-report.md`) the `640x360-busy-video` row took **42.8 ms** render p95 and gave two
 * ticks to **100 %** of its frames against the plain row's 1.8 ms / 7 % — the YUV→RGB readback
 * of the per-frame `texImage2D` dominates a software pipeline, and the standing law was that an
 * unmeasured pacing metric ships the feature disabled. The owner's M7 run settled it: a 190-row
 * session on the hardware (analysis committed) shows the video path wins p95 at every size, and
 * on **2026-10-28** the owner ruled all three enablements — default ON. The DISPLAY page's
 * VIDEO row is the player's switch ({@link storeVideoSetting}); a stored 'off', the host
 * option, `SHMUP_NO_VIDEO=1`, the page global and `?novid=1` still switch it off over the
 * default, and `?video=<id>` forces one clip on for a run.
 */
export const VIDEO_DEFAULT_ON = true;

/** What {@link resolveVideoSetting} may consult (all optional so a bare fake window passes). */
export interface VideoSettingHost {
  /** The host's explicit decision (the `ShellOptions.video` field); it wins over everything. */
  readonly override?: boolean;
  /** The page global (`SHMUP_NO_VIDEO`) — set by the app or the harness, not by the game. */
  readonly noVideoGlobal?: unknown;
  /** `location.search` (with or without the `?`). */
  readonly search?: string;
  /** Reads the stored choice (`localStorage.getItem` — null when absent or denied). */
  readonly storedSetting?: string | null;
}

/**
 * Resolves whether the whole feature is on, before the renderer exists.
 *
 * @param host - What the boot can read right now (see {@link VideoSettingHost}).
 * @returns Whether to build the video surface and run the director.
 */
export function resolveVideoSetting(host: VideoSettingHost): boolean {
  if (host.override !== undefined) return host.override;
  const flag = host.noVideoGlobal;
  if (flag === 1 || flag === true || flag === '1') return false;
  const search = host.search ?? '';
  if (/[?&]novid=1/.test(search)) return false;
  // The browser spec's forced play overrides the default (and a stored 'off'): the probe is a
  // tool, not a choice the player made.
  if (videoProbeFromSearch(search) !== null) return true;
  const stored = host.storedSetting ?? null;
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return VIDEO_DEFAULT_ON;
}

/**
 * The `?video=<id>` probe clip (the e2e spec's hook), or `null`.
 *
 * @param search - `location.search`.
 * @returns The clip id to force-play at boot, when named and known.
 */
export function videoProbeFromSearch(search: string): string | null {
  const match = /[?&]video=([^&]*)/.exec(search);
  if (match === null) return null;
  const id = match[1] ?? '';
  return CLIP_BY_ID[id] === undefined ? null : id;
}

/** The window fields the setting reads (all optional so a bare fake window passes). */
export interface VideoWindowLike {
  /** The page location (`search` only). */
  readonly location?: { readonly search?: string } | undefined;
  /** The choice store (a denied access throws — caught; reads null, and writes do nothing). */
  readonly localStorage?:
    | {
        getItem(key: string): string | null;
        setItem?(key: string, value: string): void;
      }
    | undefined;
  /** The page global `SHMUP_NO_VIDEO` (the harness / app kill switch). */
  readonly SHMUP_NO_VIDEO?: unknown;
}

/**
 * {@link resolveVideoSetting} reading search, global and stored choice off a window.
 *
 * @param win - The page window (or a fake shaped like {@link VideoWindowLike}).
 * @param override - The host's explicit decision (`ShellOptions.video`).
 * @returns Whether the feature is on.
 */
export function videoSettingFromWindow(win: VideoWindowLike, override?: boolean): boolean {
  const search = win.location?.search ?? '';
  let stored: string | null;
  try {
    stored = win.localStorage?.getItem(VIDEO_SETTING_KEY) ?? null;
  } catch (_error) {
    stored = null;
  }
  return resolveVideoSetting({
    override,
    noVideoGlobal: win.SHMUP_NO_VIDEO,
    search,
    storedSetting: stored,
  });
}

/**
 * Writes the player's DISPLAY-page VIDEO choice into the store {@link videoSettingFromWindow}
 * reads — the row's event handler (a cold path) calls this, and the next boot resolves it.
 * A missing or denied store (private mode, a bare fake window) is tolerated exactly like the
 * read's denial: the choice simply does not persist.
 *
 * @param win - The page window (or a fake shaped like {@link VideoWindowLike}).
 * @param on - The choice: on (stored `'on'`) or off (stored `'off'`).
 */
export function storeVideoSetting(win: VideoWindowLike, on: boolean): void {
  try {
    win.localStorage?.setItem?.(VIDEO_SETTING_KEY, on ? 'on' : 'off');
  } catch (_error) {
    // A denied write is no write — the read already treats a denied store as no choice.
  }
}

/** The flow state the director reads (the structural subset of core's `SceneFlow`). */
export interface CutsceneFlow {
  /** The scene stack (top = the drawn scene). */
  readonly stack: { readonly top?: { readonly id: string } | null };
  /** The campaign run (the stage letter and the escape flag). */
  readonly run: { readonly stage: string | null; readonly inEscape: boolean };
}

/** Options for {@link createCutsceneDirector}. */
export interface CutsceneDirectorOptions {
  /** The scene flow to watch (the game's). */
  readonly flow: CutsceneFlow;
  /** Whether the feature is on (the boot's {@link resolveVideoSetting}). */
  readonly enabled: boolean;
  /** The renderer's surface, or null (no option, or an inert media pipeline). */
  readonly surface?: CutsceneSurface | null;
  /** Where the clips are served (default {@link VIDEO_URL_DIR}). */
  readonly base?: string;
  /**
   * Whether an action has been pressed since the last call (consumes the boot's poll latch —
   * called every frame so a stale press can never skip the next clip).
   *
   * @returns Whether any player pressed anything this frame.
   */
  readonly anyPressed?: () => boolean;
  /**
   * A clip forced from the search (`?video=` probe): it shows in place of the title's own sting
   * and loops-until-window, so a browser spec can capture a known clip on a known scene.
   */
  readonly probeClip?: string | null;
  /**
   * Called when the showing clip changes (a cold path: the boot mirrors it into the canvas's
   * `data-shmup-video` attribute so a browser spec can read the state without pixels).
   *
   * @param clip - The clip id now showing, or null (nothing shows).
   */
  readonly onClipChange?: ((clip: string | null) => void) | undefined;
}

/** The director's public surface. */
export interface CutsceneDirector {
  /** Whether the feature runs (the boot's decision). */
  readonly enabled: boolean;
  /** The clip on screen now, or null. */
  readonly clip: string | null;
  /** Registers the event watchers (Dim, BossDefeated, BossEscaped) on the dispatcher. */
  connect(events: EventDispatcher): void;
  /**
   * Advances the presentation state once per drawn frame (after the events were drained).
   *
   * @param tick - The drawn frame's tick.
   */
  update(tick: number): void;
  /**
   * Forces a clip by id (the `?video=` probe; skips the trigger mapping).
   *
   * @param id - A {@link VIDEO_CLIPS} id.
   * @returns Whether the clip is known and the surface took it.
   */
  playClip(id: string): boolean;
  /** Stops any clip and unloads the director. */
  destroy(): void;
}

/**
 * Creates the director (see the module docblock). `enabled` false (or no surface) makes every
 * entry a no-op on a field read.
 *
 * @param options - The flow, the switch, the surface and the input latch.
 * @returns The director.
 */
export function createCutsceneDirector(options: CutsceneDirectorOptions): CutsceneDirector {
  const surface = options.surface ?? null;
  const base = options.base ?? VIDEO_URL_DIR;
  const anyPressed = options.anyPressed;
  let enabled = options.enabled && surface !== null;
  /** The clip showing (its id), or `''`. */
  let clipId = '';
  /** Whether the showing clip ever presented (before that, a stop is the play's own failure). */
  let presented = false;
  /** Tick the current window ends on, or -1 (the ambient loop). */
  let windowEnd = -1;
  /** The drawn scene of the last update ('' before the first). */
  let lastSceneId = '';
  /** The run's escape flag at the last update. */
  let lastInEscape = false;
  /** The last update's tick (the async `play` result lands on a later frame). */
  let lastTick = 0;
  /** The forced probe clip (shown in place of the title's own sting). */
  const probeClip = options.probeClip ?? '';
  /** The clip-change notifier (the boot's `data-shmup-video` mirror; cold path only). */
  const onClipChange = options.onClipChange;

  /** Forgets the clip after a stop (the element itself is the surface's business). */
  const clearClip = (): void => {
    clipId = '';
    presented = false;
    windowEnd = -1;
    if (onClipChange !== undefined) onClipChange(null);
  };

  /** Stops the clip and hides the quad. */
  const stopClip = (): void => {
    if (clipId === '') return;
    surface?.stop();
    clearClip();
  };

  /**
   * Starts a clip by id inside a window; a failed start forgets it (silence, the scene goes on).
   *
   * @param id - A {@link VIDEO_CLIPS} id.
   * @param windowTicks - The presentation window (the clip may end earlier; -1 = none).
   */
  const startClip = (id: string, windowTicks: number): void => {
    if (!enabled || surface === null || clipId !== '') return;
    const row = CLIP_BY_ID[id];
    if (row === undefined) return;
    clipId = id;
    presented = false;
    windowEnd = windowTicks > 0 ? lastTick + windowTicks : -1;
    if (onClipChange !== undefined) onClipChange(id);
    // The clip's draw band first (cold, per start): the title backdrop is only ever beaten from
    // the screen band; world-band clips sit under the HUD and keep the gameplay readable.
    if (surface.setBand !== undefined) surface.setBand(row.band);
    void surface.play(`${base}/${row.file}`, row.loop).then((ok) => {
      if (!ok) {
        if (clipId === id) clearClip();
        return;
      }
      presented = true;
      // A stop() while the load ran (skip / window): the surface paused it; keep it hidden.
      if (clipId !== id) surface.stop();
    });
  };

  /** The zone letter of the stage the run is on (cold path only — one substring on a trigger). */
  const stageLetter = (): string => {
    const stage = options.flow.run.stage;
    return stage === null || stage.length < 6 ? '' : stage.slice(5, 6);
  };

  /** The scene-entry mapping (cold: only on a transition). */
  const onSceneEnter = (id: string): void => {
    if (id === 'title') {
      // The `?video=` probe replaces the title's own sting (and loops, so a spec can capture it).
      if (probeClip !== '') {
        startClip(probeClip, -1);
      } else {
        startClip('title-sting', CLIP_WINDOW_TICKS);
      }
    } else if (id === 'demo') startClip('attract-ambient', -1);
    else if (id === 'story') startClip('story-vista', CLIP_WINDOW_TICKS);
    else if (id === 'ending') startClip('dawn-flight', CLIP_WINDOW_TICKS);
  };

  return {
    get enabled(): boolean {
      return enabled;
    },
    get clip(): string | null {
      return clipId === '' ? null : clipId;
    },
    connect(events: EventDispatcher): void {
      if (!enabled) return;
      // A WARNING band (Dim with a level): the zone's sting, capped at the band's own window.
      events.on(SimEventKind.Dim, (event: SimEvent): void => {
        if (event.id <= 0 || lastSceneId !== 'game') return;
        const clipFor = WARNING_BY_LETTER[stageLetter()];
        if (clipFor === undefined) return;
        const window =
          event.param > 0 ? Math.min(event.param, CLIP_WINDOW_TICKS) : CLIP_WINDOW_TICKS;
        startClip(clipFor, window);
      });
      // The final boss's death and the ark's departure over their clips (zone I only — the
      // other zones' defeats stay procedural).
      events.on(SimEventKind.BossDefeated, (): void => {
        if (lastSceneId === 'game' && stageLetter() === 'i') {
          startClip('hull-explosions', CLIP_WINDOW_TICKS);
        }
      });
      events.on(SimEventKind.BossEscaped, (): void => {
        if (lastSceneId === 'game' && stageLetter() === 'i') {
          startClip('ark-sailing', CLIP_WINDOW_TICKS);
        }
      });
    },
    update(tick: number): void {
      if (!enabled) return;
      lastTick = tick;
      const pressed = anyPressed !== undefined ? anyPressed() : false;
      if (clipId !== '') {
        if (pressed) stopClip();
        else {
          if (presented && surface !== null && !surface.playing)
            stopClip(); // ended by itself
          else if (windowEnd >= 0 && tick >= windowEnd) stopClip();
        }
      }
      const top = options.flow.stack.top;
      const sceneId = top === undefined || top === null ? '' : top.id;
      if (sceneId !== lastSceneId) {
        stopClip(); // a clip never crosses a scene, and the ambient dies with the demo
        lastSceneId = sceneId;
        onSceneEnter(sceneId);
      }
      if (clipId === '') {
        const inEscape = options.flow.run.inEscape;
        if (inEscape && !lastInEscape) startClip('escape-collapse', CLIP_WINDOW_TICKS);
        lastInEscape = inEscape;
      } else {
        lastInEscape = options.flow.run.inEscape;
      }
    },
    playClip(id: string): boolean {
      if (!enabled || clipId !== '') return false;
      const row = CLIP_BY_ID[id];
      if (row === undefined) return false;
      startClip(id, -1);
      return true;
    },
    destroy(): void {
      stopClip();
      enabled = false;
    },
  };
}
