/**
 * The v1.0 release audit (plan M2-18, shmup_feat.md §10, §12, §22): static and headless checks of
 * the shipped content as one release gate, over every zone of the campaign's map — whatever a later
 * content change touches, the budgets below must still hold.
 *
 * - **Capsule budget**: every campaign zone has {@link CAPSULE_BUDGET} capsule sources before its
 *   WARNING (enough to power up from nothing, never a meter maxed out for free).
 * - **Recovery rule** (§10): every checkpoint of every campaign zone is followed by at least
 *   `MIN_RECOVERY_CAPSULES` capsule sources within `RECOVERY_WINDOW` px — a ship restarted there
 *   with no power can rebuild (the perfect-player runtime check is in the `zone-*-recovery` tests).
 * - **Item budget**: a zone's Direct-mode item plan ({@link DIRECT_ITEM_BUDGET}) — enough red,
 *   green and blue items for the MANTA, exactly one octagon, at most one orange 1UP and one yellow
 *   smart bomb; meter-mode 1UPs and 1,000-point bonus capsules only in bonus stages, at most one
 *   1UP each; at most {@link MAX_BLUE_CAPSULES} blue capsules a zone.
 * - **The 4-way gap rule for every pattern** (§12, decision D17): every shipped `content/patterns/`
 *   action runs on a probe enemy at Normal's rank and at loop 1's cap — no bullet over
 *   `MAX_AIMED_BULLET_SPEED` at Normal, the rank never scaling a pattern beyond the bullet-speed
 *   curve, and the ship's column always keeping a `MIN_LANE_GAP`-px open band (`columnGap`).
 * - **Every laser lane**: every zone's boss fight (the debug skip, the full loadout, god mode) with
 *   each ship holds to the 4-way rules on every tick — the lane gaps, the open band, the ship's
 *   column — and ends in the stage clear. (The 16 routes × both ships check the same on every
 *   tick of every zone: `test/playtest/campaign-routes*.test.ts`.)
 */
import {
  BULLET_SPEED_RANK_CURVE,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  RANK_LOOP1_CAP,
  RANK_NORMAL,
  createInputSnapshot,
  createWorld,
  loadContent,
  rankScale,
  resolveGameConfig,
  stepWorld,
  type ContentDb,
  type EnemyDrop,
  type StageSpec,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { runStage, shippedContent } from '../playtest/harness.js';
import { MIN_RECOVERY_CAPSULES, RECOVERY_WINDOW, capsuleSources } from '../playtest/recovery.js';
import { ROUTE_SHIPS } from '../playtest/campaign-routes.js';
import {
  MAX_AIMED_BULLET_SPEED,
  MIN_LANE_GAP,
  columnGap,
  createRuleWatch,
  maxBulletSpeed,
} from '../playtest/rules.js';

/** Capsule sources a campaign zone places before its WARNING. */
export const CAPSULE_BUDGET = Object.freeze({ min: 12, max: 32 });

/** A campaign zone's Direct-mode item plan. */
export const DIRECT_ITEM_BUDGET = Object.freeze({
  /** Entries of the plan. */
  min: 20,
  max: 30,
  /** Fewest red (main shot), green (sub-weapon) and blue (Arm) items each. */
  minEach: 6,
  /** Octagons (the main-shot family switch). */
  octagons: 1,
  /** Most orange items (1UP) and yellow items (smart bomb). */
  maxRare: 1,
});

/** Most blue capsules (the Option Hunter's counter) a campaign zone places. */
export const MAX_BLUE_CAPSULES = 2;

/** Ticks each pattern probe runs (several loops of every shipped pattern). */
const PROBE_TICKS = 1500;

const DB = shippedContent();

/** The campaign's zones with their stages, in map order. */
const ZONES = ((): { label: string; stage: StageSpec }[] => {
  const campaign = DB.campaign;
  if (campaign === null) throw new Error('the shipped content has no campaign');
  return campaign.zones.map((zone) => ({ label: zone.label, stage: DB.stages[zone.stageId] }));
})();

/** The bonus stages the campaign's zones lead into (their `bonus` events). */
const BONUS_STAGES: readonly StageSpec[] = ((): StageSpec[] => {
  const out = new Set<number>();
  for (const { stage } of ZONES) {
    for (const event of stage.events) if (event.type === 'bonus') out.add(event.stageId);
  }
  return [...out].map((index) => DB.stages[index]);
})();

/**
 * Counts the items a stage's timeline can drop, by drop kind: one per spawned enemy that drops,
 * one per formation member that drops, plus the completed formation's own drop.
 *
 * @param db - Content.
 * @param stage - The stage.
 * @returns Drop counts by kind (kinds that never drop are absent).
 */
function dropCounts(db: ContentDb, stage: StageSpec): Partial<Record<EnemyDrop, number>> {
  const counts: Partial<Record<EnemyDrop, number>> = {};
  const add = (drop: EnemyDrop | null | undefined, n: number): void => {
    if (drop === null || drop === undefined) return;
    counts[drop] = (counts[drop] ?? 0) + n;
  };
  for (const event of stage.events) {
    if (event.type === 'spawn') add(db.enemies[event.enemyId].drop, 1);
    else if (event.type === 'formation') {
      add(db.enemies[event.enemyId].drop, event.count);
      add(event.drop, 1);
    }
  }
  return counts;
}

describe('release audit: capsule and item budgets, the recovery rule (M2-18)', () => {
  it('audits all nine zones of the map', () => {
    expect(ZONES.map((z) => z.label).join('')).toBe('ABCDEFGHI');
    expect(BONUS_STAGES.map((s) => s.id).sort()).toEqual(['brine-grotto', 'glimmer-cache']);
  });

  it.each(ZONES)('zone $label: 12–32 capsule sources before the WARNING', ({ stage }) => {
    const warning = stage.events.find((e) => e.type === 'warning')?.x ?? stage.length;
    const before = capsuleSources(stage).filter((x) => x < warning).length;
    expect(before, stage.id).toBeGreaterThanOrEqual(CAPSULE_BUDGET.min);
    expect(before, stage.id).toBeLessThanOrEqual(CAPSULE_BUDGET.max);
  });

  it.each(ZONES)(
    'zone $label: ≥ 3 capsule sources within 900 px after every checkpoint (§10)',
    ({ stage }) => {
      const sources = capsuleSources(stage);
      expect(stage.checkpoints.length).toBeGreaterThanOrEqual(3);
      for (const checkpoint of stage.checkpoints) {
        const near = sources.filter((x) => x >= checkpoint.x && x < checkpoint.x + RECOVERY_WINDOW);
        expect(
          near.length,
          `${stage.id} checkpoint ${String(checkpoint.x)}`,
        ).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
      }
    },
  );

  it.each(ZONES)("zone $label: the MANTA's item plan within its budget", ({ stage }) => {
    const plan = stage.directItems ?? [];
    expect(plan.length, stage.id).toBeGreaterThanOrEqual(DIRECT_ITEM_BUDGET.min);
    expect(plan.length, stage.id).toBeLessThanOrEqual(DIRECT_ITEM_BUDGET.max);
    const count = (item: string): number => plan.filter((i) => i === item).length;
    for (const item of ['red', 'green', 'blue']) {
      expect(count(item), `${stage.id} ${item}`).toBeGreaterThanOrEqual(DIRECT_ITEM_BUDGET.minEach);
    }
    expect(count('octagon'), stage.id).toBe(DIRECT_ITEM_BUDGET.octagons);
    expect(count('orange'), stage.id).toBeLessThanOrEqual(DIRECT_ITEM_BUDGET.maxRare);
    expect(count('yellow'), stage.id).toBeLessThanOrEqual(DIRECT_ITEM_BUDGET.maxRare);
  });

  it.each(ZONES)(
    'zone $label: no meter 1UP or bonus capsule, at most two blue capsules',
    ({ stage }) => {
      const drops = dropCounts(DB, stage);
      expect(drops.oneUp ?? 0, stage.id).toBe(0);
      expect(drops.bonusCapsule ?? 0, stage.id).toBe(0);
      expect(drops.blueCapsule ?? 0, stage.id).toBeLessThanOrEqual(MAX_BLUE_CAPSULES);
    },
  );

  it('gives each bonus stage of the map bonus capsules and at most one 1UP', () => {
    for (const stage of BONUS_STAGES) {
      expect(stage.type).toBe('bonus');
      const drops = dropCounts(DB, stage);
      expect(drops.bonusCapsule ?? 0, stage.id).toBeGreaterThan(0);
      expect(drops.oneUp ?? 0, stage.id).toBeLessThanOrEqual(1);
    }
  });
});

/** Shipped pattern action ids (read from the files, so a new pattern is covered at once). */
const PATTERNS: readonly string[] = (() => {
  const ids: string[] = [];
  for (const file of readContentFiles()) {
    if (!file.path.startsWith('patterns/')) continue;
    const data = file.data as { actions?: { id: string }[] };
    for (const action of data.actions ?? []) ids.push(action.id);
  }
  return ids;
})();

/** The shipped content plus one `pattern.loop` probe per shipped pattern (`audit-<k>`). */
const PROBE_DB = ((): ContentDb => {
  const probes = PATTERNS.map((pattern, k) => ({
    id: 'audit-' + String(k),
    hp: 100_000,
    score: 0,
    hurtbox: { hw: 5, hh: 5 },
    script: 'pattern.loop',
    sprite: 'enemies/spinner',
    pattern,
    params: { restTicks: 30 },
    mover: { type: 'waypoint', x: 300, y: 100, speed: 3, hold: 36_000, leaveVx: 0, leaveVy: 0 },
    drop: null,
  }));
  const { db, issues } = loadContent(
    [
      ...readContentFiles(),
      {
        path: 'enemies/zz-audit.enemies.json',
        data: { formatVersion: 1, kind: 'enemies', enemies: probes },
      },
    ],
    { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES },
  );
  if (issues.length > 0) throw new Error('probe content: ' + JSON.stringify(issues));
  return db;
})();

/** What one pattern probe measured. */
interface Probe {
  /** Fastest live bullet (px/tick). */
  readonly maxSpeed: number;
  /** Narrowest open band in the ship's column. */
  readonly narrowestColumn: number;
  /** Most bullets live at once. */
  readonly peak: number;
}

/**
 * Runs one pattern on a probe enemy in free flight at a forced rank: the ship parked at x 60 (the
 * bot's column), unhittable and not firing, the probe held at x 300; the rank forced through the
 * rank's `special` term.
 *
 * @param k - The pattern's index in {@link PATTERNS}.
 * @param rank - The rank to fire at.
 * @returns The measurements.
 */
function probe(k: number, rank: number): Probe {
  const w: World = createWorld(
    resolveGameConfig({ seed: 3, autofire: false, remoteMode: false }),
    PROBE_DB,
  );
  const input = createInputSnapshot();
  for (let t = 0; t < 50; t++) stepWorld(w, input);
  const ship = w.players[0];
  ship.invulnTicks = 1e9;
  w.rankInputs.special = rank - w.rankInputs.difficultyBase;
  const spawned = w.enemies.spawn(
    PROBE_DB.enemyIndex.get('audit-' + String(k)) ?? -1,
    w.camera.x + 330,
    w.camera.y + 100,
  );
  expect(spawned).not.toBeNull();
  let maxSpeed = 0;
  let narrowest: number = PLAYFIELD_H;
  let peak = 0;
  for (let t = 0; t < PROBE_TICKS; t++) {
    ship.x = w.camera.x + 60;
    ship.y = w.camera.y + 100;
    stepWorld(w, input);
    w.events.clear();
    maxSpeed = Math.max(maxSpeed, maxBulletSpeed(w));
    narrowest = Math.min(narrowest, columnGap(w));
    peak = Math.max(peak, w.bullets.pool.count);
  }
  expect(w.rank).toBe(rank);
  return { maxSpeed, narrowestColumn: narrowest, peak };
}

describe('release audit: the 4-way gap rule for every pattern (M2-18)', () => {
  it('finds the shipped pattern library', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(PATTERNS.map((id, k) => ({ id, k })))(
    '$id: ≤ 2 px/tick at Normal, rank-scaled only by the curve, the ship’s column open',
    ({ id, k }) => {
      const normal = probe(k, RANK_NORMAL);
      const capped = probe(k, RANK_LOOP1_CAP);
      expect(normal.peak, id).toBeGreaterThan(0);
      expect(normal.maxSpeed, id).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
      // A pattern's `$rank` never makes it faster than the bullet-speed curve does.
      expect(capped.maxSpeed, id).toBeLessThanOrEqual(
        normal.maxSpeed * rankScale(RANK_LOOP1_CAP, BULLET_SPEED_RANK_CURVE) + 1e-9,
      );
      expect(normal.narrowestColumn, id).toBeGreaterThanOrEqual(MIN_LANE_GAP);
      expect(capped.narrowestColumn, id).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    },
    60_000,
  );
});

describe('release audit: every boss fight’s laser lanes, with both ships (M2-18)', () => {
  const fights = ZONES.flatMap(({ label, stage }) =>
    (['kestrel', 'manta'] as const).map((ship) => ({ label, stageId: stage.id, ship })),
  );

  it.each(fights)(
    'zone $label boss, $ship fully powered: the 4-way rules hold, the stage clears',
    ({ stageId, ship }) => {
      const rules = createRuleWatch();
      const run = runStage(stageId, fourWayBot(), {
        godMode: true,
        stageSkip: 'boss',
        config: { ...ROUTE_SHIPS[ship], loadout: 'full', seed: 11 },
        observe: rules.observe,
      });
      expect(run.status, `${stageId} ${ship}`).toBe('stageClear');
      expect(rules.violations, `${stageId} ${ship}`).toEqual([]);
      expect(rules.narrowestColumn).toBeGreaterThanOrEqual(MIN_LANE_GAP);
      if (rules.maxSeparate > 1) expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    },
    60_000,
  );
});
