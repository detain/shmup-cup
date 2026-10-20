/**
 * R2-02.T3 — the port's acceptance comparison: a v2 run of the `v1-baseline` harness against the
 * committed v1 baseline, field by field through the mapping of
 * `test/fixtures/v1-baseline/README.md` § "Comparing a v2 run".
 *
 * {@link compareScenario} is a pure function of the two `StageBaseline`s (plus the live scale `K`
 * and pad `PAD` of `packages/core/test/helpers/v1-port.ts`, which every expectation passes
 * through); it returns the list of mismatches, never throws on data. Each case of
 * `v2-port-suite.ts` reads the v1 fixture, records the v2 run in memory (never writes a fixture)
 * and asserts the list is empty.
 *
 * Strict (the port's promise — content numbers scale, ticks stay ticks):
 *
 * - camera key x (`K·x ±MAP_PX`), key/checkpoint ticks (`±TICK_PCT` plus slack), stage length;
 * - event pairing ({@link deriveEventMap}): the loader orders the timeline by `x` and the port
 *   re-sorts it, so the pairs are derived from the two baselines' own `(type, x, tick)` rows —
 *   each side's event index → spawned spec id (from its enemy rows) constrains the pairing, and
 *   the cursor prefers order-preserving candidates — which also carries the loop-2 remixes,
 *   whose merged order a static table could not. A plain
 *   event x is `K·x ±MAP_PX`; a world-sum pair (a block, or a terrain-anchored enemy's spawn —
 *   any non-null `ground`, floor and ceiling alike; core `data/units` `rescaleWorldSum`)
 *   deliberately fires `lead` px earlier while keeping its column
 *   at the same screen margin: its x lies in `[K·x − LEAD_PX − MAP_PX, K·x + MAP_PX]` (lead is
 *   `PLAYFIELD_W − K·384` = 64 for an end-anchored column) and its tick pays `PAIR_TICK_SLACK` on
 *   top of the band (the lead at the stage's scroll speed);
 * - spawn columns accept every anchor the tool may have used, the choice made per row by which
 *   candidate falls in band: `x0` either `K·x`/right-edge (the table) or the re-anchored screen
 *   column (`rescaleNumber`: a centre 200 → 332, an end 400 → 664); `y0` either `K·y + PAD`, the
 *   playfield centre (`y` the event does not name: 100 → 168) or, for a ceiling-mounted spec,
 *   the pad-free `K·y` (the ceiling surface is the playfield top at both scales). The chosen
 *   base's difference rides along (shift) into the row's later x/y samples;
 * - a row's spawnTick is `±tickBand` of its event's fire tick moving with it; first-visible and
 *   turn ticks are their v1 difference **relative to the spawn drift** (`±FIRST_VISIBLE_TICKS`,
 *   `±tickBand`), so a paired event's lead cannot drag the pattern checks with it;
 * - first visible `±FIRST_VISIBLE_TICKS` for air spawns — ground spawns are exempt (O11: the
 *   wider v2 view changes when they first show, their world positions are what compare), and a
 *   row v1 never saw but v2 does is the wider view itself, never a failure;
 * - **every `T`-entry landing: `turnY = K·y + PAD ±LANDING_PX`** — the §2.6 top-band proof, the
 *   diving Option Hunter of `hunter-range-dive` its shipped case (its line-up row is the
 *   `hunter.option` default `24·WORLD_SCALE + WORLD_TOP_PAD`, exactly the mapped v1 row 24 → 72;
 *   W6 made the default scale with the world, this check is the acceptance);
 * - spawn points (a `y` the content event does not name is the playfield centre — v1's 100 maps
 *   to v2's 168, not to `K·y + PAD`, so the spawn y accepts whichever anchored rule the content
 *   used), entry flags, spec hurtboxes (`K·hw ±SPEC_PX`), anchor kinds, warning ticks, boss
 *   intro/fight homes through `mapBossRow` (an inner or raid boss centres its approach instead
 *   of right-anchoring, so the centre `W/2 + K·(x − 192)` is the fallback candidate); the
 *   first-visible y band carries one extra `PAD`, its tick being measured where the hurtbox
 *   crosses the wider v2 top rather than a content row,
 *
 * Loose, saying so in the issue text:
 *
 * - rows of player-following scripts ({@link PLAYER_DEPENDENT}): their turn and visible numbers
 *   belong to the ship, only the content-driven spawn and (for the dive) the landing depth stay
 *   strict;
 * - children (runtime spawns, `event` −1): paired per spec by occurrence order, spawn tick only;
 * - position columns of a row whose spawn drifted: each keeps the README band **plus** the drift
 *   at the fastest traversal (`DRIFT_PX_PER_TICK`), since a late/early spawn moves every later
 *   sample of that row along with it;
 * - everything the bot decides — run length and status, camera travel totals and endTick, enemy
 *   endTick/fate, boss dying/escape/end, skipped branch events — with the `RUN_PCT`/`RUN_SLACK`
 *   band. The four-way bot's distances are still v1 pixels until R2-02.T2b scales them, so these
 *   carry the expected red rows of a T2b-less kit run; the report lists them, never exempted.
 *
 * @module
 */
import { PLAYFIELD_H, PLAYFIELD_W, TILE_SIZE } from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';
import { ENEMY_COLUMNS, BOSS_COLUMNS, type StageBaseline } from './v1-baseline.js';
import {
  K,
  PAD,
  V1_FRAME,
  mapEnemyRow,
  mapBossRow,
  v1screenX,
  type EnemyRow,
  type BossRow,
} from '../../packages/core/test/helpers/v1-port.js';

/** The live world scale (re-exported so the suites skip on one imported module). */
export { K };

/** The `ENEMY_COLUMNS` index of a column by name, or a loud error if the layout moved. */
function enemyCol(name: (typeof ENEMY_COLUMNS)[number]): number {
  const i = ENEMY_COLUMNS.indexOf(name);
  if (i < 0) throw new Error(`v2-port: enemy column ${name} is gone`);
  return i;
}

/** The `BOSS_COLUMNS` index of a column by name, or a loud error if the layout moved. */
function bossCol(name: (typeof BOSS_COLUMNS)[number]): number {
  const i = BOSS_COLUMNS.indexOf(name);
  if (i < 0) throw new Error(`v2-port: boss column ${name} is gone`);
  return i;
}

const E = {
  event: enemyCol('event'),
  member: enemyCol('member'),
  spec: enemyCol('spec'),
  spawnTick: enemyCol('spawnTick'),
  x0: enemyCol('x0'),
  y0: enemyCol('y0'),
  entry: enemyCol('entry'),
  visibleTick: enemyCol('visibleTick'),
  visibleX: enemyCol('visibleX'),
  visibleY: enemyCol('visibleY'),
  turnTick: enemyCol('turnTick'),
  turnX: enemyCol('turnX'),
  turnY: enemyCol('turnY'),
  endTick: enemyCol('endTick'),
} as const;

const B = {
  id: bossCol('id'),
  role: bossCol('role'),
  warningTick: bossCol('warningTick'),
  introTick: bossCol('introTick'),
  introX: bossCol('introX'),
  introY: bossCol('introY'),
  fightTick: bossCol('fightTick'),
  fightX: bossCol('fightX'),
  fightY: bossCol('fightY'),
} as const;

/** The "never" sentinel of the baseline files. */
const NEVER = -1;

/** The camera-travel tick band of the acceptance (ticks themselves never scale). */
const TICK_PCT = 0.02;
/** Whole-tick rounding on top of a tick band. */
const TICK_SLACK = 3;
/** Position slack for a number mapped through the README table. */
export const MAP_PX = 2;
/** Slack for a hurtbox half-size (`×K`, 1/100-rounded by the meter). */
const SPEC_PX = 0.5;
/** Slack of the T-entry landing (`turnY = K·y + PAD`) — the §2.6 acceptance row. */
const LANDING_PX = 2;
/** First-visible acceptance: one tick. */
const FIRST_VISIBLE_TICKS = 1;
/** Slack for a column the port may snap to a tile (world-sum pairs, ground spawns). */
export const SNAP_PX = TILE_SIZE;
/** The world-sum lead an end-anchored pair fires with (`PLAYFIELD_W − K·384`). */
export const LEAD_PX = PLAYFIELD_W - K * V1_FRAME.w;
/** Extra tick slack a paired (led) event pays for firing `lead` px of camera earlier. */
const PAIR_TICK_SLACK = 96;
/** Slack for a first-visible position (a tick of the fastest entry, ×K). */
const VISIBLE_PX = 8;
/** Traversal px per drifted tick a position column may move with its spawn. */
const DRIFT_PX_PER_TICK = 4;
/** Cap of the drift allowance (a row whose spawn drifted beyond this is broken anyway). */
const DRIFT_CAP_PX = 240;
/** Band for the fastest bullet of the run (`×K`; the bot may sample another volley). */
const BULLET_SPEED_PCT = 0.05;
/** Band for a bot-decided duration (run, camera travel, boss kills). */
const RUN_PCT = 0.1;
/** Extra slack a bot-decided duration pays. */
const RUN_SLACK = 120;
/** Max issue lines one comparison reports. */
export const MAX_ISSUES = 80;

/**
 * Enemy rows whose motion the ship steers (README caveat: compare those loosely). The dive of
 * `hunter.option` is the deliberate exception inside: its line-up **depth** is a content number
 * and keeps the strict landing check.
 */
const PLAYER_DEPENDENT = new Set([
  'walker.floor',
  'hunter.option',
  'tentacle.grab',
  'cube.stack',
  'cube.pincer',
  'captain.ram',
  'rocket.homing',
  'cell.chase',
  'rammer.aimed',
  'worm.burst', // a dune segment bursts when a player passes over it (core docblock line 76)
]);

/** The behaviour script name of an enemy spec id, from the shipped content (lazy, once). */
let specScripts: Map<string, string> | undefined;

/** @param specId - The enemy spec id. @returns Its behaviour script (`''` if unknown). */
function scriptOf(specId: string): string {
  if (specScripts === undefined) {
    specScripts = new Map();
    for (const enemy of shippedContent().enemies) specScripts.set(enemy.id, enemy.script);
  }
  return specScripts.get(specId) ?? '';
}

/** Formats a number for an issue line. @param v - The value. @returns Short text. */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** The acceptance tick band for a tick at `t`. @param t - The v1 tick. @returns The slack. */
function tickBand(t: number): number {
  return Math.ceil(Math.abs(t) * TICK_PCT) + TICK_SLACK;
}

/** A baseline row seen as the mapping helper's enemy tuple. */
function asEnemyRow(row: readonly (string | number)[]): EnemyRow {
  return row as unknown as EnemyRow;
}

/** A baseline row seen as the mapping helper's boss tuple. */
function asBossRow(row: readonly (string | number)[]): BossRow {
  return row as unknown as BossRow;
}

/** `row[col]` as a number. */
function num(row: readonly (string | number)[], col: number): number {
  return row[col] as number;
}

/** Was `v1 === NEVER` or `v2 === NEVER` but not both? */
function sentinelDiffers(a: number, b: number): boolean {
  return (a === NEVER) !== (b === NEVER);
}

/** An event row `[type, x, tick]` as a tuple (the shape `StageBaseline.events` holds). */
export type EventRow = readonly [type: string, x: number, tick: number];

/**
 * Pairs the two timelines: the v1 index `i` maps to the v2 index {@link EventMap.get}. The port
 * re-sorts the shipped files (world-sum leads cross what they followed) and the loop-2 remixes
 * change the merged order further, so the map is derived from the recordings themselves — each v1
 * event gets the nearest unused v2 event of the same type whose x is a plausible port (a plain
 * `K·x ±MAP_PX`, a pair within the lead band). Adjacent transpositions resolve greedily; a row
 * that finds no twin stays unmapped and the comparison reports it.
 *
 * @param v1 - The committed baseline's event rows.
 * @param v2 - The recorded port run's event rows.
 * @param s1 - v1 event index → spawned spec id (undefined entries pair on x alone).
 * @param s2 - The same for v2.
 * @returns v1 index → v2 index.
 */
export function deriveEventMap(
  e1: readonly EventRow[],
  e2: readonly EventRow[],
  s1?: ReadonlyMap<number, string>,
  s2?: ReadonlyMap<number, string>,
): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  const used = new Set<number>();
  let lastJ = -1;
  for (let i = 0; i < e1.length; i++) {
    const [type, x] = e1[i];
    const plain = K * x;
    const spec1 = s1?.get(i);
    // candidates: same type, x within [plain − lead − snap − map, plain + map]; nearest wins,
    // with an order-preserving preference: the timeline is monotone except where a world-sum
    // lead moved a pair a slot or two ahead, so a candidate more than two slots back only wins
    // when nothing ahead of the cursor fits (it keeps dense alternating spawns honest):
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < e2.length; j++) {
      if (used.has(j) || e2[j][0] !== type) continue;
      if (spec1 !== undefined && s2 !== undefined) {
        const spec2 = s2.get(j);
        if (spec2 !== undefined && spec1 !== spec2) continue;
      }
      const x2 = e2[j][1];
      if (x2 > plain + MAP_PX || x2 < plain - LEAD_PX - SNAP_PX - MAP_PX) continue;
      const d = Math.abs(x2 - plain) + (lastJ - j > 2 ? 4 * (LEAD_PX + SNAP_PX + MAP_PX) : 0);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0) {
      map.set(i, best);
      used.add(best);
      if (best > lastJ) lastJ = best;
    }
  }
  return map;
}

/** Per-baseline lookups prepared once for a comparison. */
interface Ctx {
  /** The stage id (for issue text). */
  readonly stage: string;
  /** spec index → the spec id. */
  readonly specIds: readonly string[];
  /** spec index → true for a terrain-anchored spec (anchor 1 floor, 2 ceiling — the tool's groundEnemies set holds both; 0 = flying). */
  readonly groundSpecs: ReadonlyArray<boolean>;
  /** v1 event indices of paired (world-sum) events — blocks or ground-enemy spawns. */
  readonly pairEvents: ReadonlySet<number>;
}

/** @param b - The baseline. @returns Its id/anchor lookups. */
function contextOf(b: StageBaseline): Ctx {
  const specIds = b.specs.map((s) => String(s[0]));
  const groundSpecs = b.specs.map((s) => s[3] !== 0);
  return { stage: b.stage, specIds, groundSpecs, pairEvents: new Set() };
}

/** The spec id of the first enemy row spawned by each event index (rows keep file order). */
function eventSpecOf(b: StageBaseline, ctx: Ctx): Map<number, string> {
  const m = new Map<number, string>();
  for (const row of b.enemies) {
    const i = num(row, E.event);
    if (i >= 0 && !m.has(i)) m.set(i, ctx.specIds[num(row, E.spec)]);
  }
  return m;
}

/** The v1 event indices the world-sum pair rule moved. */
function pairEventSet(
  v1: StageBaseline,
  c1: Ctx,
  eventMap: ReadonlyMap<number, number>,
): Set<number> {
  const set = new Set<number>();
  v1.events.forEach((ev, i) => {
    const j = eventMap.get(i);
    if (String(ev[0]) === 'block') {
      set.add(i);
      return;
    }
    if (j === undefined) return;
    for (const row of v1.enemies) {
      if (num(row, E.event) === i && c1.groundSpecs[num(row, E.spec)]) {
        set.add(i);
        return;
      }
    }
  });
  return set;
}

/** The pairing key of an enemy row: mapped event and member, or spec id and child order. */
function rowKey(
  eventMap: ReadonlyMap<number, number> | undefined,
  row: readonly (string | number)[],
  childSeq: Map<string, number>,
  specIds: readonly string[],
): string {
  const ev = num(row, E.event);
  if (ev >= 0) {
    const j = eventMap === undefined ? ev : (eventMap.get(ev) ?? ev);
    return `t${j}:${num(row, E.member)}`;
  }
  const id = specIds[num(row, E.spec)];
  const n = childSeq.get(id) ?? 0;
  childSeq.set(id, n + 1);
  return `c${id}:${n}`;
}

/** One matched enemy-row pair (`b` undefined = v2 lost the row). */
type EnemyPair = readonly [
  a: readonly (string | number)[],
  b: readonly (string | number)[] | undefined,
];

/**
 * Pairs the two enemy row lists by {@link rowKey} (v1 through the event map, children by per-spec
 * occurrence order — README).
 *
 * @param v1 - The committed baseline.
 * @param v2 - The recorded port run.
 * @param eventMap - v1 event index → v2 event index.
 * @returns The v1 rows with their twins (possibly `undefined`) and the unmatched v2 rows.
 */
function pairEnemies(
  v1: StageBaseline,
  v2: StageBaseline,
  eventMap: ReadonlyMap<number, number>,
): {
  readonly pairs: readonly EnemyPair[];
  readonly extras: readonly (readonly (string | number)[])[];
} {
  const seq1 = new Map<string, number>();
  const c1 = contextOf(v1);
  const c2 = contextOf(v2);
  const byKey = new Map<string, readonly (string | number)[]>();
  const keys2: string[] = [];
  const seq2 = new Map<string, number>();
  for (const row of v2.enemies) {
    const key = rowKey(undefined, row, seq2, c2.specIds);
    keys2.push(key);
    byKey.set(key, row);
  }
  const pairs: EnemyPair[] = [];
  const used = new Set<string>();
  for (const row of v1.enemies) {
    const key = rowKey(eventMap, row, seq1, c1.specIds);
    const other = byKey.get(key);
    if (other !== undefined) used.add(key);
    pairs.push([row, other]);
  }
  const extras = v2.enemies.filter((_, idx) => !used.has(keys2[idx]));
  return { pairs, extras };
}

/**
 * Compares one paired enemy row: `a` (v1) mapped through the README table against `b` (v2).
 *
 * @param add - The issue sink.
 * @param a - The v1 row.
 * @param b - Its v2 twin.
 * @param c1 - v1 lookups.
 * @param c2 - v2 lookups.
 * @param eventMap - The derived event pairing (for the label and the event's own drift).
 * @param v1events - v1 event rows (the fire tick of the row's event).
 * @param v2events - v2 event rows.
 */
function compareEnemyRow(
  add: (line: string) => void,
  a: readonly (string | number)[],
  b: readonly (string | number)[],
  c1: Ctx,
  c2: Ctx,
  eventMap: ReadonlyMap<number, number>,
  v1events: readonly EventRow[],
  v2events: readonly EventRow[],
): void {
  const evA = num(a, E.event);
  const isChild = evA < 0;
  const specId = c1.specIds[num(a, E.spec)];
  const j = isChild ? -1 : (eventMap.get(evA) ?? evA);
  const label = isChild ? `child ${specId}` : `event ${j}/${num(a, E.member)} ${specId}`;
  if (specId !== c2.specIds[num(b, E.spec)]) {
    add(`enemies ${label}: paired with ${c2.specIds[num(b, E.spec)]} — pairing broke`);
    return;
  }
  const playerDriven = PLAYER_DEPENDENT.has(scriptOf(specId));
  const ground = c1.groundSpecs[num(a, E.spec)];
  const entry = String(a[E.entry]);
  const top = entry.includes('T');
  const m = mapEnemyRow(asEnemyRow(a));
  // how far the event itself moved (a world-sum pair fires `lead` early):
  let drift = 0;
  if (!isChild) {
    const ta = num(v1events[evA] ?? [], 2);
    const tb = num(v2events[j] ?? [], 2);
    if (ta > 0 && tb > 0) drift = tb - ta;
  }
  const driftPx = Math.min(Math.abs(drift) * DRIFT_PX_PER_TICK, DRIFT_CAP_PX);

  const spawnBand = tickBand(num(a, E.spawnTick)) + (isChild ? PAIR_TICK_SLACK + RUN_SLACK / 2 : 0);
  const dSpawn = num(b, E.spawnTick) - num(a, E.spawnTick);
  if (Math.abs(dSpawn - (isChild ? 0 : drift)) > spawnBand) {
    add(
      `${isChild ? 'child bot-dependent' : 'enemies'} ${label}: spawnTick ${num(a, E.spawnTick)} → ${num(b, E.spawnTick)} (Δ${dSpawn} > ±${spawnBand})`,
    );
  }
  if (isChild) return; // children compare by parent and order; their places are the parent's (README)

  const posBand = ground ? SNAP_PX : MAP_PX;
  // the x0 column is either a world-scaled x (the table) or a SCREEN-anchored column the port
  // re-anchors with rescaleNumber (centre keeps its distance from the centre: 200 → 332; an
  // end-anchored spawn keeps its edge offset: 400 → 664) — accept whichever anchor the content
  // used and carry the constant base difference into the later x columns (offsets scale by K):
  const screenX0 = v1screenX(num(a, E.x0));
  const dPlainX = Math.abs(num(b, E.x0) - num(m, E.x0));
  const dScreenX = Math.abs(num(b, E.x0) - screenX0);
  const xShift = dPlainX > posBand && dScreenX <= posBand ? screenX0 - num(m, E.x0) : 0;
  const dx = Math.min(dPlainX, dScreenX);
  if (dx > posBand) {
    add(
      `enemies ${label}: x0 ${fmt(num(b, E.x0))} vs mapped ${fmt(num(m, E.x0))} (Δ${fmt(dx)} > ±${posBand})`,
    );
  }
  // a y the content event does not name is the playfield centre (frame-anchored: 100 → 168),
  // not `K·y + PAD` — accept whichever anchor the content used, and carry the choice (a constant
  // shift) into the scripted y columns: every offset from the spawn scales by K, so a centre-born
  // row's visible/turn y are the mapped ones shifted by the same base difference:
  const centerY = PLAYFIELD_H / 2 + K * (num(a, E.y0) - V1_FRAME.h / 2);
  const ceilY = K * num(a, E.y0);
  const dPlainY = Math.abs(num(b, E.y0) - num(m, E.y0));
  const dCenterY = Math.abs(num(b, E.y0) - centerY);
  const dCeilY = ground ? Math.abs(num(b, E.y0) - ceilY) : Infinity;
  const yShift =
    dPlainY > posBand && !top
      ? dCenterY <= posBand
        ? centerY - num(m, E.y0)
        : dCeilY <= posBand
          ? ceilY - num(m, E.y0)
          : 0
      : 0;
  const dy = Math.min(dPlainY, dCenterY, dCeilY);
  if (dy > posBand) {
    add(
      `enemies ${label}: y0 ${fmt(num(b, E.y0))} vs mapped ${fmt(num(m, E.y0))} (Δ${fmt(dy)} > ±${posBand})`,
    );
  }
  if (entry !== String(b[E.entry])) add(`enemies ${label}: entry ${entry} → ${b[E.entry]}`);

  // first visible — relative to the event's own drift; O11 exempts ground spawns entirely and a
  // row v1 never saw but v2 does is the wider view (the reverse is a real loss):
  const visA = num(a, E.visibleTick);
  const visB = num(b, E.visibleTick);
  if (!ground && !playerDriven) {
    const band = FIRST_VISIBLE_TICKS;
    if (visA === NEVER && visB !== NEVER) {
      /* the wider view sees what v1 never did — not a departure */
    } else if (visA !== NEVER && visB === NEVER) {
      // v1 saw it and v2 never did — a bot kill before the moment explains it (endTick < visible),
      // anything else is a real loss:
      if (!(num(b, E.endTick) !== NEVER && num(b, E.endTick) < visA)) {
        add(`enemies ${label}: visible in v1 (${visA}), never in v2`);
      }
    } else if (visA !== NEVER) {
      // first-visible relative to the row's own spawn (the event's fire may have drifted):
      const rel = visB - num(b, E.spawnTick) - (visA - num(a, E.spawnTick));
      if (Math.abs(rel) > band) {
        add(
          `enemies ${label}: visibleTick ${visA} → ${visB} (spawn ${num(a, E.spawnTick)} → ${num(b, E.spawnTick)}, band ±${band})`,
        );
      }
    }
    if (visA !== NEVER && visB !== NEVER) {
      // the y band carries PAD: the port anchors a scripted row to its content screen-y (k·y+P)
      // or centres it, and first-visible is measured the tick the hurtbox crosses the wider v2
      // top — up to a pad of distance apart; the x band only the base difference and the drift:
      for (const col of [E.visibleX, E.visibleY] as const) {
        if (num(a, col) === NEVER) continue;
        const vBand = VISIBLE_PX + driftPx + (col === E.visibleY ? PAD : 0);
        const diff = Math.abs(num(b, col) - num(m, col) - (col === E.visibleY ? yShift : xShift));
        if (diff > vBand) {
          add(
            `enemies ${label}: ${ENEMY_COLUMNS[col]} ${fmt(num(b, col))} vs mapped ${fmt(num(m, col))} (Δ${fmt(diff)} > ±${fmt(vBand)})`,
          );
        }
      }
    }
  }

  // the turn: a content-anchored turn compares through the table (T-entries against the strict
  // landing depth); a pair-spawned or player-driven turn belongs to its event/ship:
  const turnA = num(a, E.turnTick);
  const turnB = num(b, E.turnTick);
  if (turnA === NEVER && turnB !== NEVER) {
    /* v2 got a turn v1 never reached (wider view, later escape) — not a departure */
  } else if (turnA !== NEVER && turnB === NEVER) {
    // a ship-relative script (cube.stack, cell.chase) never turns the same way twice, and a bot
    // kill before the turn tick explains the rest:
    if (!playerDriven && !(num(b, E.endTick) !== NEVER && num(b, E.endTick) < turnA)) {
      add(`enemies ${label}: turn in v1 (${turnA}), absent in v2 — bot or a lost turn`);
    }
  } else if (turnA !== NEVER) {
    if (!ground && !playerDriven && Math.abs(turnB - turnA - dSpawn) > tickBand(turnA)) {
      add(
        `enemies ${label}: turnTick ${turnA} → ${turnB} (spawn drift ${dSpawn}, band ±${tickBand(turnA)})`,
      );
    }
    if (top) {
      const expectedY = num(m, E.turnY);
      const diffY = Math.abs(num(b, E.turnY) - expectedY);
      if (diffY > LANDING_PX + (ground ? SNAP_PX : 0)) {
        add(
          `LANDING ${label}: turnY ${fmt(num(b, E.turnY))} vs K·y+PAD ${fmt(expectedY)} (Δ${fmt(diffY)} > ±${LANDING_PX + (ground ? SNAP_PX : 0)})`,
        );
      }
      if (!playerDriven) {
        const diffX = Math.abs(num(b, E.turnX) - num(m, E.turnX) - xShift);
        if (diffX > MAP_PX + driftPx) {
          add(
            `LANDING ${label}: turnX ${fmt(num(b, E.turnX))} vs mapped ${fmt(num(m, E.turnX))} (Δ${fmt(diffX)})`,
          );
        }
      }
    } else if (!ground && !playerDriven) {
      for (const col of [E.turnX, E.turnY] as const) {
        if (num(a, col) === NEVER || num(b, col) === NEVER) continue;
        // the scripted turn row is anchored either absolutely (k·y+P — the content value, the
        // gulper's lunge line) or relative to the spawn (base-shifted with it) — accept either:
        const dAbs = Math.abs(num(b, col) - num(m, col));
        const dRel = Math.abs(num(b, col) - num(m, col) - (col === E.turnY ? yShift : xShift));
        const diff = Math.min(dAbs, dRel);
        if (diff > MAP_PX + driftPx) {
          add(
            `enemies ${label}: ${ENEMY_COLUMNS[col]} ${fmt(num(b, col))} vs mapped ${fmt(num(m, col))} (Δ${fmt(diff)} > ±${fmt(MAP_PX + driftPx)})`,
          );
        }
      }
    } else if (ground && !playerDriven) {
      for (const col of [E.turnX, E.turnY] as const) {
        if (num(a, col) === NEVER || num(b, col) === NEVER) continue;
        const band = col === E.turnY ? SNAP_PX : SNAP_PX + driftPx;
        const diff = Math.abs(num(b, col) - num(m, col) - (col === E.turnY ? yShift : xShift));
        if (diff > band) {
          add(
            `enemies ${label}: ground ${ENEMY_COLUMNS[col]} ${fmt(num(b, col))} vs mapped ${fmt(num(m, col))} (Δ${fmt(diff)} > ±${fmt(band)})`,
          );
        }
      }
    }
  }
}

/**
 * Compares a recorded v2 baseline against its committed v1 baseline through the README mapping.
 *
 * @param v1 - The committed v1 baseline (fixture of the same scenario id).
 * @param v2 - The baseline recorded live on the ported world. At `K` = 1 on the recorded frame
 *   this is the identity check; `v2-port-suite.ts` records and compares only the port, and
 *   `v2-port.test.ts` runs the self-check where the mappers are the identity.
 * @returns The mismatches, empty when the run accepts; capped at {@link MAX_ISSUES} lines.
 * @throws {Error} When the two baselines are not the same scenario.
 */
export function compareScenario(v1: StageBaseline, v2: StageBaseline): string[] {
  if (v2.id !== v1.id) throw new Error(`v2-port: ${v2.id} is not the port of ${v1.id}`);
  const issues: string[] = [];
  let capped = false;
  const add = (line: string): void => {
    if (issues.length < MAX_ISSUES) issues.push(line);
    else if (!capped) {
      capped = true;
      issues.push(`… (capped at ${MAX_ISSUES} issues)`);
    }
  };
  const near = (line: string, expected: number, actual: number, band: number): void => {
    const diff = Math.abs(actual - expected);
    if (diff > band)
      add(`${line}: ${fmt(actual)} vs expected ${fmt(expected)} (Δ${fmt(diff)} > ±${fmt(band)})`);
  };
  const parity = (line: string, a: number, b: number): void => {
    if (sentinelDiffers(a, b))
      add(`${line}: ${a === NEVER ? 'never in v1' : 'never in v2'} (a ${a}, b ${b})`);
  };
  const c1 = contextOf(v1);
  const c2 = contextOf(v2);
  const e1 = v1.events as unknown as readonly EventRow[];
  const e2 = v2.events as unknown as readonly EventRow[];
  const eventMap = deriveEventMap(e1, e2, eventSpecOf(v1, c1), eventSpecOf(v2, c2));

  // --- run (bot-decided, loose) ---
  if (v1.run.status !== v2.run.status)
    add(`bot-dependent: run status ${v1.run.status} → ${v2.run.status}`);
  parity('bot-dependent: run clearTicks', v1.run.clearTicks, v2.run.clearTicks);
  near('bot-dependent: run ticks', v1.run.ticks, v2.run.ticks, v1.run.ticks * RUN_PCT + RUN_SLACK);

  // --- camera ---
  near('camera length', K * v1.camera.length, v2.camera.length, MAP_PX);
  parity('camera endTick', v1.camera.endTick, v2.camera.endTick);
  if (v1.camera.endTick !== NEVER && v2.camera.endTick !== NEVER) {
    near(
      'bot-dependent: camera endTick',
      v1.camera.endTick,
      v2.camera.endTick,
      v1.camera.endTick * RUN_PCT + RUN_SLACK,
    );
  }
  for (const name of ['movingTicks', 'lockedTicks', 'holdTicks'] as const) {
    near(
      `bot-dependent: camera ${name}`,
      v1.camera[name],
      v2.camera[name],
      v1.camera[name] * RUN_PCT + RUN_SLACK,
    );
  }
  if (v1.camera.keys.length !== v2.camera.keys.length) {
    add(`camera keys: ${v1.camera.keys.length} → ${v2.camera.keys.length}`);
  }
  for (let i = 0; i < Math.min(v1.camera.keys.length, v2.camera.keys.length); i++) {
    const ka = v1.camera.keys[i];
    const kb = v2.camera.keys[i];
    near(`camera key ${i} x`, K * num(ka, 0), num(kb, 0), MAP_PX);
    parity(`camera key ${i} tick`, num(ka, 1), num(kb, 1));
    if (num(ka, 1) !== NEVER && num(kb, 1) !== NEVER) {
      near(`camera key ${i} tick`, num(ka, 1), num(kb, 1), tickBand(num(ka, 1)));
    }
    near(`camera key ${i} camY`, K * num(ka, 2), num(kb, 2), MAP_PX);
  }
  if (v1.camera.checkpoints.length !== v2.camera.checkpoints.length) {
    add(`checkpoints: ${v1.camera.checkpoints.length} → ${v2.camera.checkpoints.length}`);
  }
  for (let i = 0; i < Math.min(v1.camera.checkpoints.length, v2.camera.checkpoints.length); i++) {
    const ca = v1.camera.checkpoints[i];
    const cb = v2.camera.checkpoints[i];
    near(`checkpoint ${i} x`, K * num(ca, 0), num(cb, 0), MAP_PX);
    parity(`checkpoint ${i} tick`, num(ca, 1), num(cb, 1));
    if (num(ca, 1) !== NEVER && num(cb, 1) !== NEVER) {
      near(`checkpoint ${i} tick`, num(ca, 1), num(cb, 1), tickBand(num(ca, 1)));
    }
  }

  // --- warnings ---
  if (v1.warnings.length !== v2.warnings.length) {
    add(`bot-dependent: warnings ${v1.warnings.length} → ${v2.warnings.length}`);
  }
  for (let i = 0; i < Math.min(v1.warnings.length, v2.warnings.length); i++) {
    near(
      `warning ${i} tick`,
      v1.warnings[i],
      v2.warnings[i],
      tickBand(v1.warnings[i]) + PAIR_TICK_SLACK,
    );
  }

  // --- events (paired by deriveEventMap) ---
  const pairEvents = pairEventSet(v1, c1, eventMap);
  if (v1.events.length !== v2.events.length) {
    add(`events: ${v1.events.length} → ${v2.events.length}`);
  }
  for (let i = 0; i < v1.events.length; i++) {
    const ea = v1.events[i];
    const type = String(ea[0]);
    const j = eventMap.get(i);
    if (j === undefined) {
      add(`event ${i} (${type}): no v2 twin within the port bands`);
      continue;
    }
    const eb = v2.events[j];
    const x1 = num(ea, 1);
    const x2 = num(eb, 1);
    const paired = pairEvents.has(i);
    if (paired || type === 'block') {
      // world-sum pair: fires lead px early, keeps the column — x may only go below K·x1:
      const below = K * x1 - x2;
      if (below < -MAP_PX || below > LEAD_PX + SNAP_PX + MAP_PX) {
        add(
          `event ${j} (${type}) x: ${fmt(x2)} vs ported ${fmt(K * x1)} − lead (Δ${fmt(below)} ∉ [${fmt(-MAP_PX)}, ${fmt(LEAD_PX + SNAP_PX + MAP_PX)}])`,
        );
      }
    } else if (type === 'trigger') {
      // a trigger's x is a world value (its arming), the region pairs with it — same lead rule:
      near(`event ${j} (trigger) x`, K * x1, x2, MAP_PX + SNAP_PX);
    } else {
      near(`event ${j} (${type}) x`, K * x1, x2, MAP_PX);
    }
    const ta = num(ea, 2);
    const tb = num(eb, 2);
    parity(`event ${j} (${type}) tick`, ta, tb);
    if (ta !== NEVER && tb !== NEVER) {
      const band = paired || type === 'block' ? tickBand(ta) + PAIR_TICK_SLACK : tickBand(ta);
      near(`event ${j} (${type}) tick`, ta, tb, band);
    }
  }
  const skipped2 = new Set(v2.skippedEvents);
  for (const i of v1.skippedEvents) {
    const j = eventMap.get(i) ?? i;
    if (!skipped2.has(j)) add(`bot-dependent: v2 took the branch of event ${j} that v1 skipped`);
  }
  const skipped1 = new Set(v1.skippedEvents.map((i) => eventMap.get(i) ?? i));
  for (const j of v2.skippedEvents) {
    if (!skipped1.has(j)) add(`bot-dependent: v2 skipped event ${j} that v1 took`);
  }

  // --- bullet speed ---
  near(
    'max bullet speed',
    K * v1.maxBulletSpeed,
    v2.maxBulletSpeed,
    Math.max(0.05, K * v1.maxBulletSpeed * BULLET_SPEED_PCT),
  );

  // --- specs ---
  const specs2 = new Map<string, readonly (string | number)[]>();
  for (const s of v2.specs) specs2.set(String(s[0]), s);
  for (const s of v1.specs) {
    const id = String(s[0]);
    const o = specs2.get(id);
    if (o === undefined) {
      add(`spec ${id}: missing in v2`);
      continue;
    }
    near(`spec ${id} hw`, K * num(s, 1), num(o, 1), SPEC_PX);
    near(`spec ${id} hh`, K * num(s, 2), num(o, 2), SPEC_PX);
    if (num(s, 3) !== num(o, 3)) add(`spec ${id}: anchor ${s[3]} → ${o[3]}`);
    specs2.delete(id);
  }
  for (const id of specs2.keys()) add(`spec ${id}: unknown in v1`);

  // --- enemies ---
  const c1p: Ctx = { ...c1, pairEvents };
  const { pairs, extras } = pairEnemies(v1, v2, eventMap);
  for (const [a, b] of pairs) {
    if (b === undefined) {
      const ev = num(a, E.event);
      add(
        `enemies: v2 row missing for ${ev < 0 ? `child ${c1.specIds[num(a, E.spec)]}` : `event ${eventMap.get(ev) ?? ev}/${num(a, E.member)} ${c1.specIds[num(a, E.spec)]}`}`,
      );
    } else compareEnemyRow(add, a, b, c1p, c2, eventMap, e1, e2);
  }
  for (const row of extras) {
    add(
      `enemies: v2 row with no v1 twin: ${c2.specIds[num(row, E.spec)]} at ${num(row, E.spawnTick)}`,
    );
  }

  // --- bosses ---
  if (v1.bosses.length !== v2.bosses.length) {
    add(`bot-dependent: boss encounters ${v1.bosses.length} → ${v2.bosses.length}`);
  }
  for (let i = 0; i < Math.min(v1.bosses.length, v2.bosses.length); i++) {
    const a = v1.bosses[i];
    const b = v2.bosses[i];
    if (a[B.id] !== b[B.id] || num(a, B.role) !== num(b, B.role)) {
      add(`boss ${i}: ${a[B.id]}/${a[B.role]} → ${b[B.id]}/${b[B.role]}`);
      continue;
    }
    const name = `boss ${a[B.id]}`;
    for (const col of [B.warningTick, B.introTick, B.fightTick] as const) {
      const ta = num(a, col);
      const tb = num(b, col);
      parity(`${name} ${BOSS_COLUMNS[col]}`, ta, tb);
      if (ta !== NEVER && tb !== NEVER) near(`${name} ${BOSS_COLUMNS[col]}`, ta, tb, tickBand(ta));
    }
    const m = mapBossRow(asBossRow(a));
    for (const col of [B.introX, B.introY, B.fightX, B.fightY] as const) {
      if (num(a, col) !== NEVER && num(b, col) !== NEVER) {
        // the table right-anchors an intro/fight home at the edge; an inner boss (the heart in
        // the leviathan, the king in the ark) centres its approach instead — accept either:
        const raw = num(a, col);
        const cx = PLAYFIELD_W / 2 + K * (raw - V1_FRAME.w / 2);
        const expected =
          (col === B.introX || col === B.fightX) && Math.abs(num(b, col) - num(m, col)) > MAP_PX
            ? cx
            : num(m, col);
        near(`${name} ${BOSS_COLUMNS[col]}`, expected, num(b, col), MAP_PX);
      }
    }
    for (const col of [9, 10, 11] as const) {
      parity(`bot-dependent: ${name} ${BOSS_COLUMNS[col]}`, num(a, col), num(b, col));
    }
  }
  return issues;
}
