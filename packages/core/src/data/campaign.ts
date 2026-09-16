/**
 * # data/campaign — the zone map: zones, edges, endings (plan M2-10)
 *
 * **Responsibility.** The `campaign` content kind of `core/data` (`content/campaign/*.campaign.json`,
 * shmup_feat.md §14 "branching zone map"): the zones of a run — each a stage with its map label,
 * display name and preview text —, the **edges** between them (after each zone's boss the player
 * chooses one of the zone's exits on the map screen) and the **endings** a final zone leads to,
 * picked by the run's flags. Decision D9: a 9-zone diamond `A → B|C → D|E → F|G → H|I`, five zones
 * per run, 16 routes, two final zones with different endings — but any **layered** graph validates:
 *
 * - zone ids unique, the `start` zone exists;
 * - every edge joins two zones of the file, no self-loops, no duplicates, at most
 *   {@link MAX_ZONE_EXITS} exits per zone;
 * - every zone is reachable from the start, and every edge goes from one **depth** (distance
 *   from the start) to the next — so the graph has no cycle, every route from the start ends in a
 *   **final** zone (a zone without exits), and the map screen can draw the zones as columns;
 * - every ending names a final zone, every final zone has at least one ending without conditions
 *   (the selection always finds one), ending ids are unique.
 *
 * {@link completeCampaign} checks all of that on the parsed file and derives the zones' `depth`,
 * `row` (their place among the zones of their depth, in file order), `exits` (zone indices, in
 * edge order — the map's up / down order) and `final`, the ending masks and the route count
 * ({@link CampaignSpec.routes}). That a zone's `stage` names a playable stage (not a bonus stage)
 * is checked once the references are resolved (`core/data` `loadContent`).
 *
 * **Run flags** ({@link RUN_FLAG_NAMES}) are the conditions an ending may require (`all`) or
 * exclude (`none`); bit `i` of a run's flag mask is `RUN_FLAG_NAMES[i]` (bit 0 `bossEscaped` is
 * `core/bosses` `EndingFlag.BossEscaped`). The scene flow (`core/scenes`) accumulates them over a
 * run and picks the ending with {@link selectCampaignEnding}.
 *
 * **Endings and credits (M2-14).** An ending also names the sprite **scene** the ending screen
 * plays ({@link ENDING_SCENES}: `none` — the plain card —, `citadel`, `abyss`) and its epilogue
 * **text** (0–{@link MAX_ENDING_TEXT_LINES} lines of ≤ {@link MAX_ENDING_LINE_LENGTH}
 * characters); the campaign's **credits** ({@link CampaignCreditsSection}: up to
 * {@link MAX_CREDITS_SECTIONS} sections of a title and ≤ {@link MAX_CREDITS_LINES} lines of ≤
 * {@link MAX_CREDITS_LINE_LENGTH} characters) scroll after the ending (`core/scenes`
 * `CreditsScene`). Both are optional: an ending without them shows the card, a campaign without
 * credits skips the scroll.
 *
 * **The attract story (M2-15).** The campaign also holds the attract loop's **story** crawl
 * ({@link CampaignStoryPage}: up to {@link MAX_STORY_PAGES} pages, each a sprite scene of
 * {@link STORY_SCENES} and ≤ {@link MAX_STORY_LINES} lines of ≤ {@link MAX_STORY_LINE_LENGTH}
 * characters) — original text that crawls up over the scenes between the title and the demo play.
 * Optional: a campaign without one leaves the story out of the attract loop.
 *
 * **The escape sequence (M3-02).** A **final** zone may name an `escape` stage
 * ({@link CampaignZoneSpec.escape} / {@link CampaignZoneSpec.escapeId}, shmup_feat.md §14
 * "[P2] escape sequence"): the stage the run flies out through once that zone's boss is down,
 * before the ending. {@link completeCampaign} rejects one on a zone that still has exits, and
 * the id is resolved against `ContentDb.stages` by the loader's reference pass. It is not a zone
 * of its own — the depths, the routes, the route count and the zone tally are unchanged.
 *
 * **Implements.** shmup_feat.md §14 — the branching zone map with multiple final zones; §15 —
 * multiple endings chosen by route and flags (the selection hook); §17 — the ending(s) and the
 * credits (M2-14); §17 — the attract loop's story crawl (M2-15); §14 — the final zone's escape
 * sequence (M3-02).
 *
 * **Public API.** Re-exported by `core/data`: {@link CampaignSpec}, {@link CampaignZoneSpec},
 * {@link CampaignEdgeSpec}, {@link CampaignEndingSpec}, {@link RUN_FLAG_NAMES},
 * {@link RunFlagName}, {@link runFlagMask}, {@link MAX_CAMPAIGN_ZONES}, {@link MAX_ZONE_EXITS},
 * {@link MAX_ZONE_PREVIEW_LINES}, {@link MAX_CAMPAIGN_ENDINGS}, {@link completeCampaign},
 * {@link campaignRoutes}, {@link countCampaignRoutes}, {@link campaignZoneIndex},
 * {@link selectCampaignEnding}; M2-14: {@link ENDING_SCENES}, {@link EndingSceneName},
 * {@link CampaignCreditsSection}, {@link MAX_ENDING_TEXT_LINES}, {@link MAX_ENDING_LINE_LENGTH},
 * {@link MAX_CREDITS_SECTIONS}, {@link MAX_CREDITS_LINES}, {@link MAX_CREDITS_LINE_LENGTH},
 * {@link creditsLineCount}; M2-15: {@link STORY_SCENES}, {@link StorySceneName},
 * {@link CampaignStoryPage}, {@link MAX_STORY_PAGES}, {@link MAX_STORY_LINES},
 * {@link MAX_STORY_LINE_LENGTH}; M3-02: {@link CampaignZoneSpec.escape} /
 * {@link CampaignZoneSpec.escapeId}.
 *
 * @remarks
 * Load time only: nothing here runs per tick, so it allocates freely.
 *
 * @module
 */
import type { ValidationIssue } from './schema.js';

/**
 * The run flags an ending can test, in bit order (bit `i` = `1 << i`):
 * - `bossEscaped` — a stage boss escaped when its time ran out (`core/bosses` `EndingFlag`);
 * - `noDeath` — no ship was lost in the whole run;
 * - `noContinue` — no continue was used;
 * - `bonus` — a hidden bonus stage was cleared.
 */
export const RUN_FLAG_NAMES = Object.freeze([
  'bossEscaped',
  'noDeath',
  'noContinue',
  'bonus',
] as const);

/** A {@link RUN_FLAG_NAMES} entry. */
export type RunFlagName = (typeof RUN_FLAG_NAMES)[number];

/** Most zones one campaign may have. */
export const MAX_CAMPAIGN_ZONES = 32;

/** Most exits one zone may have (the map's up / down choice). */
export const MAX_ZONE_EXITS = 4;

/** Most lines of a zone's preview text on the map screen. */
export const MAX_ZONE_PREVIEW_LINES = 3;

/** Most endings one campaign may list. */
export const MAX_CAMPAIGN_ENDINGS = 32;

/**
 * The sprite scenes an ending screen can play (M2-14, `core/scenes` `EndingScene`), by name:
 * - `none` — no scene: the ending card alone;
 * - `citadel` — the fortress breaking apart behind the ship as it flies away (zone H);
 * - `abyss` — the ship rising out of the deep towards the light, the flagship's wreck sinking
 *   (zone I).
 *
 * The scene draws variants from the run's flags: a flawless run (`noDeath`) ends at dawn, and in
 * `abyss` an escaped flagship (`bossEscaped`) sails off instead of sinking.
 */
export const ENDING_SCENES = Object.freeze(['none', 'citadel', 'abyss'] as const);

/** An {@link ENDING_SCENES} entry. */
export type EndingSceneName = (typeof ENDING_SCENES)[number];

/** Most epilogue lines one ending may have (M2-14). */
export const MAX_ENDING_TEXT_LINES = 8;

/** Most characters of one epilogue line (40 × 6-px glyphs fit the ending panel). */
export const MAX_ENDING_LINE_LENGTH = 40;

/** Most sections of the credits (M2-14). */
export const MAX_CREDITS_SECTIONS = 24;

/** Most lines of one credits section. */
export const MAX_CREDITS_LINES = 16;

/** Most characters of a credits line or title (60 × 6-px glyphs fit the 384-px frame). */
export const MAX_CREDITS_LINE_LENGTH = 60;

/**
 * The sprite scenes a page of the attract loop's story crawl can play over (M2-15, `core/scenes`
 * `StoryScene`), by name — drawn from sprites the game already has (the ships, the ending pieces):
 * - `none` — no scene: the crawl over the starfield alone;
 * - `dawn` — a star rising over a quiet sea (the home world before the war);
 * - `invasion` — the enemy's fortress and flagship closing in through chained blasts;
 * - `launch` — the player's ships launching one after the other and racing off.
 */
export const STORY_SCENES = Object.freeze(['none', 'dawn', 'invasion', 'launch'] as const);

/** A {@link STORY_SCENES} entry. */
export type StorySceneName = (typeof STORY_SCENES)[number];

/** Most pages of the attract story (M2-15). */
export const MAX_STORY_PAGES = 8;

/** Most lines of one story page. */
export const MAX_STORY_LINES = 6;

/** Most characters of a story line (40 × 6-px glyphs fit the story panel). */
export const MAX_STORY_LINE_LENGTH = 40;

/** One page of the attract loop's story crawl (M2-15): a sprite scene and the lines over it. */
export interface CampaignStoryPage {
  /** The sprite scene shown while the page's lines crawl ({@link STORY_SCENES}; default `none`). */
  readonly scene: StorySceneName;
  /** The page's lines (0–{@link MAX_STORY_LINES}). */
  readonly lines: readonly string[];
}

/** One section of the credits scroll (M2-14): a title and its lines. */
export interface CampaignCreditsSection {
  /** The heading (drawn in the title colour). */
  readonly title: string;
  /** The lines under it (0–{@link MAX_CREDITS_LINES}). */
  readonly lines: readonly string[];
}

/** One zone of the map. */
export interface CampaignZoneSpec {
  /** Unique id inside the campaign (lower-case kebab, e.g. `a`). */
  readonly id: string;
  /** What its map node shows: one or two upper-case letters / digits (`A`). */
  readonly label: string;
  /** Display name (`AZURE VERGE`). */
  readonly name: string;
  /** The stage the zone plays (a `normal` or `bossRush` stage). */
  readonly stage: string;
  /** Resolved `ContentDb.stages` index of {@link CampaignZoneSpec.stage}. */
  readonly stageId: number;
  /** Preview text shown on the map screen (0–{@link MAX_ZONE_PREVIEW_LINES} lines). */
  readonly preview: readonly string[];
  /**
   * The **escape sequence** a final zone plays after its boss (M3-02, shmup_feat.md §14 "[P2]
   * escape sequence (collapsing, fast-scrolling maze after the final boss)"): the id of the stage
   * the run flies before its ending, or `''` for none. Only a final zone may name one.
   */
  readonly escape: string;
  /** Resolved `ContentDb.stages` index of {@link CampaignZoneSpec.escape} (-1 = none). */
  readonly escapeId: number;
  /** Distance from the start zone in edges (0 = the start). */
  readonly depth: number;
  /** Place among the zones of its depth, in file order (0 = the top one on the map). */
  readonly row: number;
  /** The zones it leads to (indices into {@link CampaignSpec.zones}), in edge order. */
  readonly exits: readonly number[];
  /** Whether it is a final zone (no exits): clearing it ends the run with an ending. */
  readonly final: boolean;
}

/** One edge of the map: clearing `from` may lead to `to`. */
export interface CampaignEdgeSpec {
  /** Zone id it leaves. */
  readonly from: string;
  /** Zone id it enters. */
  readonly to: string;
  /** Index of {@link CampaignEdgeSpec.from} in {@link CampaignSpec.zones}. */
  readonly fromIndex: number;
  /** Index of {@link CampaignEdgeSpec.to}. */
  readonly toIndex: number;
}

/** One ending: shown when a run clears its final zone and its conditions hold. */
export interface CampaignEndingSpec {
  /** Unique id. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** The final zone it belongs to. */
  readonly zone: string;
  /** Index of {@link CampaignEndingSpec.zone} in {@link CampaignSpec.zones}. */
  readonly zoneIndex: number;
  /** Run flags that must all be set (empty = none required). */
  readonly all: readonly RunFlagName[];
  /** Run flags that must all be clear (empty = none excluded). */
  readonly none: readonly RunFlagName[];
  /** {@link CampaignEndingSpec.all} as a bit mask ({@link runFlagMask}). */
  readonly allMask: number;
  /** {@link CampaignEndingSpec.none} as a bit mask. */
  readonly noneMask: number;
  /** The sprite scene of the ending screen (M2-14; default `none`). */
  readonly scene: EndingSceneName;
  /** The epilogue, line by line (M2-14; 0–{@link MAX_ENDING_TEXT_LINES} lines, default none). */
  readonly text: readonly string[];
}

/** The campaign (`content/campaign/*.campaign.json` — one file only). */
export interface CampaignSpec {
  /** Id of the campaign. */
  readonly id: string;
  /** Title the map screen shows (default `ZONE MAP`). */
  readonly name: string;
  /** Id of the first zone of every run. */
  readonly start: string;
  /** Index of {@link CampaignSpec.start} in {@link CampaignSpec.zones}. */
  readonly startIndex: number;
  /** The zones, in file order. */
  readonly zones: readonly CampaignZoneSpec[];
  /** The edges, in file order. */
  readonly edges: readonly CampaignEdgeSpec[];
  /** The endings, in file order (the selection takes the first that matches). */
  readonly endings: readonly CampaignEndingSpec[];
  /** The credits scroll after an ending (M2-14; empty = no scroll). */
  readonly credits: readonly CampaignCreditsSection[];
  /**
   * The attract loop's story crawl (M2-15, `core/scenes` `StoryScene`; empty = the attract loop
   * has no story).
   */
  readonly story: readonly CampaignStoryPage[];
  /** Number of depth levels (the zones of a run: the longest route has this many). */
  readonly depths: number;
  /** Number of distinct routes from the start to a final zone. */
  readonly routes: number;
}

/**
 * The bit mask of run flag names.
 *
 * @param names - Flag names (unknown names are ignored).
 * @returns Bit `i` set for every `RUN_FLAG_NAMES[i]` listed.
 *
 * @example
 * ```ts
 * runFlagMask(['noDeath', 'bonus']); // → 0b1010
 * ```
 */
export function runFlagMask(names: readonly string[]): number {
  let mask = 0;
  for (const name of names) {
    const bit = (RUN_FLAG_NAMES as readonly string[]).indexOf(name);
    if (bit >= 0) mask |= 1 << bit;
  }
  return mask;
}

/**
 * A parsed campaign file before {@link completeCampaign}: the fields of {@link CampaignSpec} and
 * its parts, with the derived ones (`stageId`, `depth`, `row`, `exits`, `final`, the indices,
 * masks and counts) optional and mutable until the completion writes them.
 */
interface RawCampaign {
  id: string;
  name?: string;
  start: string;
  zones: Array<{
    id: string;
    label: string;
    name: string;
    stage: string;
    stageId?: number;
    preview?: string[];
    escape?: string;
    escapeId?: number;
    depth?: number;
    row?: number;
    exits?: number[];
    final?: boolean;
  }>;
  edges: Array<{ from: string; to: string; fromIndex?: number; toIndex?: number }>;
  endings: Array<{
    id: string;
    name: string;
    zone: string;
    all?: RunFlagName[];
    none?: RunFlagName[];
    zoneIndex?: number;
    allMask?: number;
    noneMask?: number;
    scene?: EndingSceneName;
    text?: string[];
  }>;
  credits?: Array<{ title: string; lines?: string[] }>;
  story?: Array<{ scene?: StorySceneName; lines?: string[] }>;
  startIndex?: number;
  depths?: number;
  routes?: number;
}

/**
 * Checks a parsed campaign file's graph and completes it in place (see the module docs): zone
 * indices of the edges, each zone's `depth`, `row`, `exits` and `final`, the endings' zone index
 * and masks, `startIndex`, `depths` and `routes`.
 *
 * @remarks
 * The zone objects stay mutable (their `stageId` is written by the reference pass afterwards).
 * Every problem is reported; the campaign is usable only when none was found.
 *
 * @param parsed - The schema-validated document (`kind: 'campaign'`).
 * @param at - Builds an issue path inside the file (`at('zones[2].id')`).
 * @param issues - Collector.
 * @returns The completed campaign, or `null` when it has problems.
 */
export function completeCampaign(
  parsed: Record<string, unknown>,
  at: (path: string) => string,
  issues: ValidationIssue[],
): CampaignSpec | null {
  const raw = parsed as unknown as RawCampaign;
  let ok = true;
  const fail = (path: string, message: string): void => {
    issues.push({ path: at(path), message });
    ok = false;
  };
  const zones = raw.zones;
  const index = new Map<string, number>();
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (index.has(zone.id)) fail('zones[' + String(i) + '].id', 'duplicate zone "' + zone.id + '"');
    else index.set(zone.id, i);
    if (zone.preview === undefined) zone.preview = [];
    // The escape sequence (M3-02): `escapeId` is filled by the loader's reference pass.
    if (zone.escape === undefined) {
      zone.escape = '';
      zone.escapeId = -1;
    }
    zone.exits = [];
  }
  const start = index.get(raw.start);
  if (start === undefined) fail('start', 'no zone "' + raw.start + '" in zones');
  const edges = raw.edges;
  const seen = new Set<string>();
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e];
    const path = 'edges[' + String(e) + ']';
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    if (from === undefined) fail(path + '.from', 'no zone "' + edge.from + '" in zones');
    if (to === undefined) fail(path + '.to', 'no zone "' + edge.to + '" in zones');
    edge.fromIndex = from ?? -1;
    edge.toIndex = to ?? -1;
    if (from === undefined || to === undefined) continue;
    if (from === to) {
      fail(path, 'a zone cannot lead to itself');
      continue;
    }
    const key = edge.from + '>' + edge.to;
    if (seen.has(key)) {
      fail(path, 'duplicate edge ' + edge.from + ' → ' + edge.to);
      continue;
    }
    seen.add(key);
    const exits = zones[from].exits as number[];
    if (exits.length >= MAX_ZONE_EXITS) {
      fail(path, 'zone "' + edge.from + '" has more than ' + String(MAX_ZONE_EXITS) + ' exits');
      continue;
    }
    exits.push(to);
  }
  // Depths: breadth-first from the start (shortest distance).
  const depth = new Int32Array(zones.length).fill(-1);
  if (start !== undefined) {
    depth[start] = 0;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const z = queue[q];
      for (const next of zones[z].exits as number[]) {
        if (depth[next] < 0) {
          depth[next] = depth[z] + 1;
          queue.push(next);
        }
      }
    }
    for (let i = 0; i < zones.length; i++) {
      if (depth[i] < 0) fail('zones[' + String(i) + '].id', 'cannot be reached from the start');
    }
    // Layered: every edge goes exactly one depth deeper (no cycles, no skipped or backward edges).
    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const from = edge.fromIndex ?? -1;
      const to = edge.toIndex ?? -1;
      // A self-loop is already reported (and was never made an exit).
      if (from < 0 || to < 0 || from === to || depth[from] < 0 || depth[to] < 0) continue;
      if (depth[to] !== depth[from] + 1) {
        fail(
          'edges[' + String(e) + ']',
          'must lead one level deeper (' +
            edge.from +
            ' is at depth ' +
            String(depth[from]) +
            ', ' +
            edge.to +
            ' at ' +
            String(depth[to]) +
            ')',
        );
      }
    }
  }
  let depths = 0;
  const rows = new Map<number, number>();
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const d = depth[i];
    zone.depth = d;
    const row = rows.get(d) ?? 0;
    zone.row = row;
    rows.set(d, row + 1);
    zone.final = (zone.exits as number[]).length === 0;
    // Only a final zone plays an escape sequence (M3-02): it runs between the boss and the ending.
    if (zone.final !== true && zone.escape !== '') {
      fail('zones[' + String(i) + '].escape', 'only a final zone may name an escape stage');
    }
    if (d + 1 > depths) depths = d + 1;
  }
  const finals = new Set<number>();
  for (let i = 0; i < zones.length; i++) if (zones[i].final === true) finals.add(i);
  if (finals.size === 0) fail('edges', 'no final zone (a zone without exits)');
  // Endings: a final zone each, unique ids, one unconditional ending per final zone.
  const endings = raw.endings;
  const endingIds = new Set<string>();
  const covered = new Set<number>();
  for (let e = 0; e < endings.length; e++) {
    const ending = endings[e];
    const path = 'endings[' + String(e) + ']';
    if (endingIds.has(ending.id)) fail(path + '.id', 'duplicate ending "' + ending.id + '"');
    endingIds.add(ending.id);
    const zone = index.get(ending.zone);
    ending.zoneIndex = zone ?? -1;
    ending.all = ending.all ?? [];
    ending.none = ending.none ?? [];
    ending.allMask = runFlagMask(ending.all);
    ending.noneMask = runFlagMask(ending.none);
    ending.scene = ending.scene ?? 'none';
    ending.text = ending.text ?? [];
    if (zone === undefined) {
      fail(path + '.zone', 'no zone "' + ending.zone + '" in zones');
      continue;
    }
    if (!finals.has(zone)) fail(path + '.zone', 'zone "' + ending.zone + '" is not a final zone');
    if ((ending.allMask & ending.noneMask) !== 0) {
      fail(path, 'a flag cannot be both required (all) and excluded (none)');
    }
    if (ending.allMask === 0 && ending.noneMask === 0) covered.add(zone);
  }
  finals.forEach((zone) => {
    if (!covered.has(zone)) {
      fail(
        'endings',
        'final zone "' + zones[zone].id + '" needs an ending without conditions (all / none)',
      );
    }
  });
  if (!ok || start === undefined) return null;
  raw.startIndex = start;
  raw.depths = depths;
  raw.name = raw.name ?? 'ZONE MAP';
  const credits = raw.credits ?? [];
  for (const section of credits) section.lines = section.lines ?? [];
  raw.credits = credits;
  const story = raw.story ?? [];
  for (const page of story) {
    page.scene = page.scene ?? 'none';
    page.lines = page.lines ?? [];
  }
  raw.story = story;
  const spec = raw as unknown as CampaignSpec;
  raw.routes = countCampaignRoutes(spec);
  return spec;
}

/**
 * Every route of a campaign: the zone indices from the start to a final zone, depth-first in
 * exit order (the map's top route first).
 *
 * @param campaign - A completed campaign.
 * @returns The routes (allocates).
 *
 * @example
 * ```ts
 * campaignRoutes(db.campaign!).length; // → 16 for the shipped diamond
 * ```
 */
export function campaignRoutes(campaign: CampaignSpec): number[][] {
  const out: number[][] = [];
  const walk = (zone: number, route: number[]): void => {
    route.push(zone);
    const exits = campaign.zones[zone].exits;
    if (exits.length === 0) out.push(route.slice());
    for (const next of exits) walk(next, route);
    route.pop();
  };
  walk(campaign.startIndex, []);
  return out;
}

/**
 * Counts the routes of a campaign without listing them (paths from the start to a final zone).
 *
 * @param campaign - A campaign whose zones have their `exits` and `startIndex` (a layered graph).
 * @returns The number of routes.
 */
export function countCampaignRoutes(campaign: CampaignSpec): number {
  const memo = new Map<number, number>();
  const count = (zone: number): number => {
    const known = memo.get(zone);
    if (known !== undefined) return known;
    const exits = campaign.zones[zone].exits;
    let n = exits.length === 0 ? 1 : 0;
    for (const next of exits) n += count(next);
    memo.set(zone, n);
    return n;
  };
  return count(campaign.startIndex);
}

/**
 * The index of a zone by id.
 *
 * @param campaign - The campaign.
 * @param id - Zone id.
 * @returns Its index in {@link CampaignSpec.zones}, or -1.
 */
export function campaignZoneIndex(campaign: CampaignSpec, id: string): number {
  const zones = campaign.zones;
  for (let i = 0; i < zones.length; i++) if (zones[i].id === id) return i;
  return -1;
}

/**
 * The number of rows the credits scroll (M2-14): per section its title, its lines and one blank
 * row after it.
 *
 * @param credits - The campaign's credits.
 * @returns Rows (0 for no credits).
 *
 * @example
 * ```ts
 * creditsLineCount([{ title: 'MUSIC', lines: ['CHIP SONGS'] }]); // → 3
 * ```
 */
export function creditsLineCount(credits: readonly CampaignCreditsSection[]): number {
  let rows = 0;
  for (const section of credits) rows += 2 + section.lines.length;
  return rows;
}

/**
 * The ending hook (plan M2-10, shmup_feat.md §15 "multiple endings"): the first ending of the
 * final zone whose conditions the run's flags meet.
 *
 * @param campaign - The campaign.
 * @param zone - Index of the final zone the run cleared.
 * @param flags - The run's flag mask (bit `i` = `RUN_FLAG_NAMES[i]`).
 * @returns The ending, or `null` when the zone has none (not a final zone of a valid campaign).
 *
 * @example
 * ```ts
 * selectCampaignEnding(campaign, h, runFlagMask(['noDeath']))?.id; // → e.g. 'citadel-flawless'
 * ```
 */
export function selectCampaignEnding(
  campaign: CampaignSpec,
  zone: number,
  flags: number,
): CampaignEndingSpec | null {
  for (const ending of campaign.endings) {
    if (ending.zoneIndex !== zone) continue;
    if ((flags & ending.allMask) !== ending.allMask) continue;
    if ((flags & ending.noneMask) !== 0) continue;
    return ending;
  }
  return null;
}
