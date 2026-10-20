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
 * Loose, carrying the block's three looseness classes (wave-03 §R2-02.T3: "player-dependent specs
 * loose; children by their parent's mapping; bot-dependent fields loose"), each with its bound
 * documented here and its `bot-dependent:` label in the issue text:
 *
 * - **player-dependent** rows of ship-following scripts ({@link PLAYER_DEPENDENT}): their turn and
 *   visible numbers belong to the ship, only the content-driven spawn and (for the dive) the
 *   landing depth stay strict; an event-spawned row of such a script may also be missing or extra
 *   whole (the spawn is gated on ship state — e.g. `hunter.option` spawns only against Options);
 * - **children** (runtime spawns, `event` −1): compared through their parent's mapping — the
 *   parent's own row (strict, with its spec hurtbox) is what proves the content's child machinery
 *   ported; a child's position columns belong to wherever its parent was when the bot killed it,
 *   so per child SPEC only the spawn COUNT compares, within the birth rate and volley size the
 *   parent's own v1
 *   spawns show over the drift of the run's bot-decided windows (`childCountBound`);
 * - **bot-dependent** durations — run status/clear/ticks, camera travel totals and endTick,
 *   warning ticks, boss encounter counts and warning/intro/fight ticks, dying/escape/end flips,
 *   skipped branch events and the rows behind them, first-visible/turns the v2 run never reached,
 *   and the fastest bullet (rank grows with kills-per-tick) — compare within the
 *   `RUN_PCT`/`RUN_SLACK` band **plus** the drift of the other bot-decided windows of the same
 *   run (windows cross-explain: a boss that died later moved the lock, the run end, the following
 *   warnings and every boss behind it along; {@link BotWindows}); a status flip only between
 *   `playing` and `stageClear`, a branch flip and a battle-end flip are the class itself and
 *   exempt with their reason. The four-way bot IS scaled (R2-02.T2b, 881a17) but a scaled bot is a
 *   different agent, so these fields observe it and stay loose; every row this machinery still
 *   emits carries its strict delta.
 *
 * Position samples taken at a state (`introX`/`introY`/`fightX`/`fightY`) additionally carry the
 * sample's tick drift plus the state flip's own lag (up to two measurement ticks — README: a
 * position is its tick's) at the row's per-tick traversal; a scripted turn's x additionally
 * accepts the screen-anchored column the tool re-anchors with `rescaleNumber` (`v1screenX`), the
 * x0 rule's twin for behaviour tunables. A first-visible or turn the v2 run never records is
 * exempt when its row's (drift-corrected) end TIES the sample — a bot kill on the tick the
 * sample would have landed measures the sim's order, not the port ({@link SAMPLE_TIE_TICKS}).
 *
 * - position columns of a row whose spawn drifted: each keeps the README band **plus** the drift
 *   at the fastest traversal (`DRIFT_PX_PER_TICK`), since a late/early spawn moves every later
 *   sample of that row along with it.
 *
 * @module
 */
import {
  BULLET_SPEED_RANK_CURVE,
  PLAYFIELD_H,
  PLAYFIELD_W,
  RANK_MAX,
  TILE_SIZE,
  rankScale,
} from '@shmup/core';
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
/**
 * Band for the fastest bullet of the run (`×K`): the widest ratio the rank can put on a bullet
 * speed between two runs (`rankScale` on the committed {@link BULLET_SPEED_RANK_CURVE}, rank 31
 * over rank 0) — the bot's kills set the rank, so the measure compares within that span (the
 * block's bot-dependent class; a missed ×1.5 is a 45 % error, far outside it).
 */
const RANK_SPEED_SPAN =
  rankScale(RANK_MAX, BULLET_SPEED_RANK_CURVE) / rankScale(0, BULLET_SPEED_RANK_CURVE);
/** Band for a bot-decided duration (run, camera travel, boss kills). */
const RUN_PCT = 0.1;
/** Extra slack a bot-decided duration pays. */
const RUN_SLACK = 120;
/**
 * Volley period assumed for a child spec with fewer than two v1 spawns (one per second — no rate
 * is derivable from a single occurrence; {@link childCountBound} documents the bound).
 */
const CHILD_FALLBACK_GAP = 60;
/**
 * A kill that lands within this many ticks (drift-corrected) of the tick a v1 sample took
 * TIES the sample and the sim's order on that tick — first-visible and turn are measured after
 * the tick ran, so a bot kill at the sample's own tick or a tick later erases it. That order is
 * the bot's (T2b class): such visible-never / turn-absent rows are exempt, anything later is a
 * real loss of the moment.
 */
const SAMPLE_TIE_TICKS = 2;
/**
 * A boss state's captured place lags its recorded state tick by up to this many measurement
 * ticks (the flip is read after the tick ran, and the boss moves within the tick): the place of
 * `introX`/`fightX` is the state tick's + at most this times its traversal ({@link
 * compareScenario}'s capture-tick basis, the README's sample-belongs-to-its-tick rule).
 */
const BOSS_CAPTURE_LAG = 2;
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

/** The pairing key of an event row: mapped event and member (children count per spec instead). */
function rowKey(
  eventMap: ReadonlyMap<number, number> | undefined,
  row: readonly (string | number)[],
): string {
  const ev = num(row, E.event);
  const j = eventMap === undefined ? ev : (eventMap.get(ev) ?? ev);
  return `t${j}:${num(row, E.member)}`;
}

/**
 * The spawn ticks of one child spec, in spawn order (children of {@link pairEnemies}).
 */
type ChildTicks = Map<string, number[]>;

/** One matched enemy-row pair (`b` undefined = v2 lost the row). */
type EnemyPair = readonly [
  a: readonly (string | number)[],
  b: readonly (string | number)[] | undefined,
];

/**
 * Pairs the two enemy row lists' EVENT rows by {@link rowKey} (v1 through the event map), and
 * gathers the children (runtime spawns, `event` −1) per spec by their spawn ticks. The block's
 * child rule compares each child through its parent's mapping: the parents compare row by row
 * (strict), the children's numbers are wherever the bot killed their parents, so they enter the
 * comparison as one count per spec ({@link compareChildren}).
 *
 * @param v1 - The committed baseline.
 * @param v2 - The recorded port run.
 * @param eventMap - v1 event index → v2 event index.
 * @returns The v1 event rows with their twins (possibly `undefined`), the unmatched v2 event rows,
 *   and the children's spawn ticks per spec on both sides.
 */
function pairEnemies(
  v1: StageBaseline,
  v2: StageBaseline,
  eventMap: ReadonlyMap<number, number>,
): {
  readonly pairs: readonly EnemyPair[];
  readonly extras: readonly (readonly (string | number)[])[];
  readonly children1: ChildTicks;
  readonly children2: ChildTicks;
} {
  const c1 = contextOf(v1);
  const c2 = contextOf(v2);
  const children1: ChildTicks = new Map();
  const children2: ChildTicks = new Map();
  const byKey = new Map<string, readonly (string | number)[]>();
  const keys2: string[] = [];
  for (const row of v2.enemies) {
    if (num(row, E.event) < 0) {
      const id = c2.specIds[num(row, E.spec)];
      const list = children2.get(id);
      if (list === undefined) children2.set(id, [num(row, E.spawnTick)]);
      else list.push(num(row, E.spawnTick));
      continue;
    }
    const key = rowKey(undefined, row);
    keys2.push(key);
    byKey.set(key, row);
  }
  const pairs: EnemyPair[] = [];
  const used = new Set<string>();
  for (const row of v1.enemies) {
    if (num(row, E.event) < 0) {
      const id = c1.specIds[num(row, E.spec)];
      const list = children1.get(id);
      if (list === undefined) children1.set(id, [num(row, E.spawnTick)]);
      else list.push(num(row, E.spawnTick));
      continue;
    }
    const key = rowKey(eventMap, row);
    const other = byKey.get(key);
    if (other !== undefined) used.add(key);
    pairs.push([row, other]);
  }
  const eventRows2 = v2.enemies.filter((row) => num(row, E.event) >= 0);
  const extras = eventRows2.filter((_, i) => !used.has(keys2[i]));
  return { pairs, extras, children1, children2 };
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
  const specId = c1.specIds[num(a, E.spec)];
  const j = eventMap.get(evA) ?? evA;
  const label = `event ${j}/${num(a, E.member)} ${specId}`;
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
  const ta = num(v1events[evA] ?? [], 2);
  const tb = num(v2events[j] ?? [], 2);
  const drift = ta > 0 && tb > 0 ? tb - ta : 0;
  const driftPx = Math.min(Math.abs(drift) * DRIFT_PX_PER_TICK, DRIFT_CAP_PX);

  const spawnBand = tickBand(num(a, E.spawnTick));
  const dSpawn = num(b, E.spawnTick) - num(a, E.spawnTick);
  if (Math.abs(dSpawn - drift) > spawnBand) {
    add(
      `enemies ${label}: spawnTick ${num(a, E.spawnTick)} → ${num(b, E.spawnTick)} (Δ${dSpawn} > ±${spawnBand})`,
    );
  }

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
      // v1 saw it and v2 never did: the v2 bot killed it at (or drift-ticks before) the very tick
      // v1's sample landed — the tie's sim order is the bot's (T2b class) — or the row stayed
      // open to the run's end; a row alive well past the moment is a real loss:
      const endB = num(b, E.endTick);
      const tieOrCut = endB === NEVER || endB - dSpawn <= visA + SAMPLE_TIE_TICKS;
      if (!tieOrCut) {
        add(
          `enemies ${label}: visible in v1 (${visA}), never in v2 (end ${endB}, spawn Δ${dSpawn}) — bot-dependent: run pace`,
        );
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
    // a ship-relative script (cube.stack, cell.chase) never turns the same way twice; a bot kill
    // tied with (or drift-ticks before) the turn tick — sample and kill land on one measurement,
    // whose order is the bot's (T2b class) — or a row open to the run's end explain the rest:
    const endB = num(b, E.endTick);
    if (!playerDriven && !(endB === NEVER || endB - dSpawn <= turnA + SAMPLE_TIE_TICKS)) {
      add(
        `enemies ${label}: turn in v1 (${turnA}), absent in v2 (end ${endB}, spawn Δ${dSpawn}) — lost turn`,
      );
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
        // gulper's lunge line), relative to the spawn (base-shifted with it), or — for the x of a
        // turn that lands on a behaviour tunable — on the screen column the tool re-anchors with
        // rescaleNumber (the x0 rule's twin: orbiter.loop's `x 256` → 416, two-scale.sh's flip) —
        // accept whichever anchor the script used:
        const dAbs = Math.abs(num(b, col) - num(m, col));
        const dRel = Math.abs(num(b, col) - num(m, col) - (col === E.turnY ? yShift : xShift));
        const dScr =
          col === E.turnX
            ? Math.abs(num(b, col) - v1screenX(num(a, col)))
            : Number.POSITIVE_INFINITY;
        const diff = Math.min(dAbs, dRel, dScr);
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

/** A battle end that never happened caps at that run's last tick (the run cut the fight). */
function capTick(x: number, runTicks: number): number {
  return x === NEVER ? runTicks : x;
}

/**
 * How far each duration the BOT decides moved between the two runs (the block's bot-dependent
 * class): the run end, the camera totals, the warnings, and the bosses' states — a battle end
 * that never happened caps at its run's ticks, a state one run did not reach contributes nothing
 * (its flip is exempt where it is judged). Each window cross-explains the others: a boss killed
 * later moves the lock, the run end, every warning and encounter behind it, so a duration
 * compares within its own strict band plus the sum of ALL the other windows
 * ({@link compareScenario}'s `botBand`) — one window drifting alone, uncorroborated, fails.
 */
interface BotWindows {
  readonly run: number;
  readonly cameraEnd: number;
  readonly movingTicks: number;
  readonly lockedTicks: number;
  readonly holdTicks: number;
  readonly warnings: number;
  readonly encounters: number;
  readonly total: number;
}

/** Measures the run's bot-decided windows for one scenario pair. */
function botWindows(v1: StageBaseline, v2: StageBaseline): BotWindows {
  const run = Math.abs(v2.run.ticks - v1.run.ticks);
  const cameraEnd = Math.abs(
    capTick(v2.camera.endTick, v2.run.ticks) - capTick(v1.camera.endTick, v1.run.ticks),
  );
  const movingTicks = Math.abs(v2.camera.movingTicks - v1.camera.movingTicks);
  const lockedTicks = Math.abs(v2.camera.lockedTicks - v1.camera.lockedTicks);
  const holdTicks = Math.abs(v2.camera.holdTicks - v1.camera.holdTicks);
  let warnings = 0;
  for (let i = 0; i < Math.min(v1.warnings.length, v2.warnings.length); i++) {
    warnings += Math.abs(v2.warnings[i] - v1.warnings[i]);
  }
  let encounters = 0;
  for (let i = 0; i < Math.min(v1.bosses.length, v2.bosses.length); i++) {
    const a = v1.bosses[i];
    const b = v2.bosses[i];
    for (const col of [B.warningTick, B.introTick, B.fightTick] as const) {
      if (num(a, col) !== NEVER && num(b, col) !== NEVER) {
        encounters += Math.abs(num(b, col) - num(a, col));
      }
    }
    for (const col of [9, 10, 11] as const) {
      encounters += Math.abs(
        capTick(num(b, col), v2.run.ticks) - capTick(num(a, col), v1.run.ticks),
      );
    }
  }
  const total = run + cameraEnd + movingTicks + lockedTicks + holdTicks + warnings + encounters;
  return { run, cameraEnd, movingTicks, lockedTicks, holdTicks, warnings, encounters, total };
}

/**
 * The child spec's rate: how many ticks one spawn costs its parent on average — the span of the
 * spec's v1 child ticks over its v1 births (whole span when there is one birth, no observable
 * rate when none). A MINIMUM gap would be the wrong measure: children arrive in volleys of
 * same-tick births, whose gap of 0 or 1 would make any count bound vacuous.
 */
function ticksPerSpawn(t: readonly number[], lastTick: number): number {
  if (t.length === 0) return CHILD_FALLBACK_GAP;
  if (t.length === 1) return Math.max(1, lastTick);
  return Math.max(1, (t[t.length - 1] - t[0]) / (t.length - 1));
}

/**
 * The bound on a child spec's spawn COUNT (the block's child rule — children through the
 * parent's mapping): the parents themselves compared row by row above, spec, spawn tick and
 * hurtbox strict — that is the content machinery that emits the children porting. A child's own
 * tick and place are wherever its parent stood when the bot killed it, so the children enter the
 * comparison as one count per spec, allowed to move with the sum of the run's bot-decided
 * windows at the parent spec's own v1 birth rate ({@link ticksPerSpawn}): ±2 plus one spawn per
 * window tick at the spec's average rate — one per run when v1 shows a single birth (no rate is
 * observable from one occurrence) — AND, because the count is proportional to the AGGREGATE
 * uptime of all parents, with the same relative term the run lengths pay ({@link RUN_PCT}): ten
 * percent of the larger side's births — plus one whole v1 volley ({@link volleySize}), whose
 * opening boundary the bot's damage pace moves. The line reports the strict Δ, the window sum
 * and the rate.
 */
function childCountBound(
  t1: readonly number[],
  windows: number,
  lastTick: number,
  n2: number,
): number {
  const rate = windows / ticksPerSpawn(t1, lastTick);
  const share = RUN_PCT * Math.max(t1.length, n2);
  return 2 + Math.ceil(rate + share) + volleySize(t1);
}

/**
 * The biggest same-or-adjacent-tick cluster in the spec's v1 birth ticks: children arrive in
 * volleys, and the phase or timer boundary that opens the next one rides the bot's damage pace,
 * so exactly one whole v1 volley may appear or vanish as a unit (the class, same law as the
 * battle-driven warning ticks).
 */
function volleySize(t: readonly number[]): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < t.length; i++) {
    run = t[i] - t[i - 1] <= 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
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
  const invEventMap = new Map<number, number>();
  for (const [i, j] of eventMap) invEventMap.set(j, i);
  const skipped1 = new Set(v1.skippedEvents);
  const skipped2 = new Set(v2.skippedEvents);
  // the run's bot-decided windows (see BotWindows): every duration below compares within its own
  // strict band plus the drift of ALL THE OTHERS — windows cross-explain one another:
  const W = botWindows(v1, v2);
  const botBand = (strict: number, own: number): number => strict + (W.total - own);

  // --- run (bot-decided) ---
  const clearish = (s: string): boolean => s === 'playing' || s === 'stageClear';
  if (v1.run.status !== v2.run.status && !(clearish(v1.run.status) && clearish(v2.run.status))) {
    add(`bot-dependent: run status ${v1.run.status} → ${v2.run.status}`);
  } // a clear↔cut flip is the class itself (the gauntlet's tick cap ends v2's run mid-stage)
  if (v1.run.status === v2.run.status) {
    parity('bot-dependent: run clearTicks', v1.run.clearTicks, v2.run.clearTicks);
  }
  near(
    'bot-dependent: run ticks',
    v1.run.ticks,
    v2.run.ticks,
    botBand(v1.run.ticks * RUN_PCT + RUN_SLACK, W.run),
  );

  // --- camera (travel totals bot-decided; length, keys and checkpoints structural) ---
  near('camera length', K * v1.camera.length, v2.camera.length, MAP_PX);
  const camEnd1 = capTick(v1.camera.endTick, v1.run.ticks);
  near(
    'bot-dependent: camera endTick',
    camEnd1,
    capTick(v2.camera.endTick, v2.run.ticks),
    botBand(camEnd1 * RUN_PCT + RUN_SLACK, W.cameraEnd),
  );
  for (const name of ['movingTicks', 'lockedTicks', 'holdTicks'] as const) {
    near(
      `bot-dependent: camera ${name}`,
      v1.camera[name],
      v2.camera[name],
      botBand(v1.camera[name] * RUN_PCT + RUN_SLACK, W[name]),
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

  // --- warnings (ticks bot-decided; the COUNT may only move with the encounters the bot reached) ---
  if (
    Math.abs(v1.warnings.length - v2.warnings.length) >
    Math.abs(v1.bosses.length - v2.bosses.length)
  ) {
    add(
      `bot-dependent: warnings ${v1.warnings.length} → ${v2.warnings.length} (encounters ${v1.bosses.length} → ${v2.bosses.length})`,
    );
  }
  for (let i = 0; i < Math.min(v1.warnings.length, v2.warnings.length); i++) {
    const d = Math.abs(v2.warnings[i] - v1.warnings[i]);
    near(
      `warning ${i} tick (bot-dependent: the warning rides the bot's pace)`,
      v1.warnings[i],
      v2.warnings[i],
      botBand(tickBand(v1.warnings[i]) + PAIR_TICK_SLACK, d),
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
    if (skipped1.has(i) !== skipped2.has(j)) {
      /* the bot steered a different branch (T2b class): WHICH events fire is its choice — the
         pairing above and the x below (the branch's content) stay strict, the fire tick's flip
         is exempt with that reason */
    } else {
      parity(`event ${j} (${type}) tick`, ta, tb);
      if (ta !== NEVER && tb !== NEVER) {
        const band = paired || type === 'block' ? tickBand(ta) + PAIR_TICK_SLACK : tickBand(ta);
        near(`event ${j} (${type}) tick`, ta, tb, band);
      }
    }
  }
  // the skipped-branch SETS need no line: a flip is the bot's branch choice (the class named
  // above), and every consequence of it — the row behind the event, the tick of the twin — is
  // judged with that exemption where it pairs. The events LENGTH and the twin pairing stay
  // strict, so a branch the other run steered into cannot hide a content difference.

  // --- bullet speed (rank grows with the bot's kills — the T2b class, span-bounded above) ---
  near(
    'max bullet speed (bot-dependent: rank grows with kills)',
    K * v1.maxBulletSpeed,
    v2.maxBulletSpeed,
    Math.max(0.05, K * v1.maxBulletSpeed * (RANK_SPEED_SPAN - 1)),
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

  // --- enemies: event rows pair and compare (player-gated and branch-hidden rows are the
  // class); children (event −1) are the parent mapping's, so they count per spec (see above) ---
  const c1p: Ctx = { ...c1, pairEvents };
  const { pairs, extras, children1, children2 } = pairEnemies(v1, v2, eventMap);
  const playerGated = (specId: string): boolean => PLAYER_DEPENDENT.has(scriptOf(specId));
  for (const [a, b] of pairs) {
    if (b === undefined) {
      const ev = num(a, E.event);
      const j = eventMap.get(ev) ?? ev;
      const specId = c1.specIds[num(a, E.spec)];
      if (playerGated(specId)) {
        /* an option-gated / ship-relative spawn rides the ship's state (bot class) */
      } else if (skipped1.has(ev) !== skipped2.has(j)) {
        /* the row sits behind a branch the v2 bot did not steer into (bot class) */
      } else {
        add(`enemies: v2 row missing for event ${j}/${num(a, E.member)} ${specId}`);
      }
    } else compareEnemyRow(add, a, b, c1p, c2, eventMap, e1, e2);
  }
  for (const row of extras) {
    const j = num(row, E.event);
    const i = invEventMap.get(j) ?? j;
    const specId = c2.specIds[num(row, E.spec)];
    if (playerGated(specId)) {
      /* the v1 ship's state kept this option-gated spawn off screen (bot class) */
    } else if (skipped1.has(i) !== skipped2.has(j)) {
      /* the row sits behind a branch the v1 bot did not steer into (bot class) */
    } else {
      add(`enemies: v2 row with no v1 twin: ${specId} at ${num(row, E.spawnTick)}`);
    }
  }
  for (const specId of new Set([...children1.keys(), ...children2.keys()])) {
    const t1 = children1.get(specId) ?? [];
    const t2 = children2.get(specId) ?? [];
    if (t1.length === t2.length) continue;
    const g = ticksPerSpawn(t1, v1.run.ticks);
    const bound = childCountBound(t1, W.total, v1.run.ticks, t2.length);
    const d = Math.abs(t2.length - t1.length);
    if (d > bound) {
      add(
        `child bot-dependent: ${specId}: count v1 ${t1.length} → v2 ${t2.length} (Δ${d} > ±${bound}; parent windows ${Math.round(W.total)} ticks, rate ${Math.round(g)} ticks/spawn)`,
      );
    }
  }

  // --- bosses: ids, roles and the fight's screen PLACES are structural (within the capture-
  // tick basis); the ticks that state was reached on, and the battle's end, are the bot's kill
  // times — compared with the windows, or exempt where the flip IS the class ---
  if (v1.bosses.length > 0 && v2.bosses.length === 0) {
    add(`bot-dependent: v2 reached no boss encounter (v1 had ${v1.bosses.length})`);
  } // reaching a boss AT ALL is the bot's timing; a count that differs while both reached at
  // least one is its pace (the windows and the per-encounter checks below still pin the fight)
  for (let i = 0; i < Math.min(v1.bosses.length, v2.bosses.length); i++) {
    const a = v1.bosses[i];
    const b = v2.bosses[i];
    if (a[B.id] !== b[B.id] || num(a, B.role) !== num(b, B.role)) {
      add(`boss ${i}: ${a[B.id]}/${a[B.role]} → ${b[B.id]}/${b[B.role]}`);
      continue;
    }
    const name = `boss ${a[B.id]}`;
    const tIntro1 = num(a, B.introTick);
    const tIntro2 = num(b, B.introTick);
    const tFight1 = num(a, B.fightTick);
    const tFight2 = num(b, B.fightTick);
    const dtIF =
      tIntro1 !== NEVER && tFight1 !== NEVER && tFight1 > tIntro1 ? tFight1 - tIntro1 : 0;
    const vX = dtIF > 0 ? Math.abs(num(a, B.fightX) - num(a, B.introX)) / dtIF : 0;
    const vY = dtIF > 0 ? Math.abs(num(a, B.fightY) - num(a, B.introY)) / dtIF : 0;
    for (const col of [B.warningTick, B.introTick, B.fightTick] as const) {
      const ta = num(a, col);
      const tb = num(b, col);
      if ((ta === NEVER) !== (tb === NEVER)) {
        /* one run reached this fight state and the other did not — the bot's timing (class);
           the PLACES of the states both runs captured are compared below, strictly */
      } else if (ta !== NEVER) {
        const d = Math.abs(tb - ta);
        near(
          `${name} ${BOSS_COLUMNS[col]} (bot-dependent: the fight rides the bot's pace)`,
          ta,
          tb,
          botBand(tickBand(ta) + PAIR_TICK_SLACK, d),
        );
      }
    }
    const m = mapBossRow(asBossRow(a));
    const dIntro = Math.abs(capTick(tIntro2, v2.run.ticks) - capTick(tIntro1, v1.run.ticks));
    const dFight = Math.abs(capTick(tFight2, v2.run.ticks) - capTick(tFight1, v1.run.ticks));
    for (const col of [B.introX, B.introY, B.fightX, B.fightY] as const) {
      if (num(a, col) === NEVER || num(b, col) === NEVER) continue;
      // the place belongs to the tick it was captured on (README's capture basis): the state's
      // sample lags its recorded tick by up to BOSS_CAPTURE_LAG measurement ticks and may ride a
      // drift of dTick more, so the place travels (dTick + lag + 1) samples at the row's own
      // traversal speed; and a boss that homes to the CENTRE (the heart in the leviathan, the
      // king in the ark) instead of the table's edge anchor is accepted on its own candidate —
      // the closer of the two anchors is the expected value:
      const isX = col === B.introX || col === B.fightX;
      const isIntro = col === B.introX || col === B.introY;
      const band =
        MAP_PX +
        ((isIntro ? dIntro : dFight) + 1 + (dtIF > 0 ? BOSS_CAPTURE_LAG : 0)) * K * (isX ? vX : vY);
      const cx = isX ? PLAYFIELD_W / 2 + K * (num(a, col) - V1_FRAME.w / 2) : Number.NaN;
      const dTable = Math.abs(num(b, col) - num(m, col));
      const dCentre = isX ? Math.abs(num(b, col) - cx) : Number.POSITIVE_INFINITY;
      const expected = dCentre < dTable ? cx : num(m, col);
      const diff = Math.min(dTable, dCentre);
      if (diff > band) {
        add(
          `${name} ${BOSS_COLUMNS[col]}: ${fmt(num(b, col))} vs expected ${fmt(expected)} (Δ${fmt(diff)} > ±${fmt(band)})`,
        );
      }
    }
    // dying/escape/end ticks are WHEN the bot killed (or its run cut) the boss: the never-flip
    // and any finite difference are the class — their capped drift is inside W.encounters, the
    // window that bounds the positions, the locks and the child counts above.
  }
  return issues;
}
