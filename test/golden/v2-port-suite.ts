/**
 * The comparison half of the v2-port acceptance check (plan_resolution.md R2-02.T3), shared by the
 * three `v2-port*.test.ts` files so the scenarios run in parallel workers: each committed
 * `test/fixtures/v1-baseline/*.baseline.json` is read, its scenario is played again on the live
 * (ported) world through `v1-baseline.ts` `recordBaseline` — with the scenario's `startX` mapped
 * by `v1x`, the one input the port scales — and {@link compareScenario} matches the two runs
 * field by field through the mapping of `test/fixtures/v1-baseline/README.md` § "Comparing a v2
 * run". Nothing here writes a fixture: the v1 files are the frozen record.
 *
 * While the world is still ×1 (`WORLD_SCALE` = 1, before R2-02's port commit) the whole block is
 * skipped — the comparison's meaning is the ported world's. The `K` = 1 sanity lives in
 * `v2-port.test.ts` (self-comparison of a committed file: the identity).
 *
 * A zone whose contract says `remastered: true` was rebuilt after the port (R5): its own
 * baselines no longer describe its content, and neither do the baselines of the stages a
 * rebuilt zone **feeds** — a stage whose timeline names an enemy or boss of that zone's roster.
 * {@link v2PortDropReason} is the one drop condition for every rebuilt zone and rush boss (law
 * R5-01.S6): waves 11 and 12 flip their contracts and never edit this file. An entry that other
 * zones place as well (the carrier's finding, `tender`) is frozen by every zone's `S4a`, so it
 * changes with no remaster and keeps the scenarios that name only such entries comparing.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import type { ContentDb, StageSpec } from '@shmup/core';
import { readBaseline, recordBaseline, type BaselineScenario } from './v1-baseline.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';
import { compareScenario, K } from './v2-port.js';
import { RERUN_TIMEOUT_MS } from './v1-baseline-suite.js';
import {
  ZONE_CONTRACTS,
  shippedDb,
  stageOf,
  type ZoneLetter,
} from '../integration/zones/helpers.js';

/** The content, loaded once per worker (the comparison loads it again inside `recordBaseline`). */
let cachedDb: ContentDb | null = null;
function db(): ContentDb {
  if (cachedDb === null) cachedDb = shippedDb();
  return cachedDb;
}

/**
 * The enemy ids a stage's content brings in: every event, remix row and rush entry's enemy,
 * its spawner children and the minions and inner bosses inside a boss.
 *
 * @param stage - The stage spec.
 * @returns Enemy ids (strings).
 */
function namedByStage(stage: StageSpec): Set<string> {
  const content = db();
  const indices = new Set<number>();
  const add = (index: number): void => {
    if (index >= 0 && !indices.has(index)) indices.add(index);
  };
  for (const event of [...stage.events, ...stage.remix]) {
    if ('enemyId' in event) add(event.enemyId);
  }
  for (const rush of stage.rush ?? []) add(rush.enemyId);
  let front = [...indices];
  while (front.length > 0) {
    const next: number[] = [];
    for (const index of front) {
      const enemy = content.enemies[index];
      for (const child of [enemy.childId, enemy.boss?.minionId ?? -1, enemy.boss?.innerId ?? -1]) {
        if (child >= 0 && !indices.has(child)) {
          indices.add(child);
          next.push(child);
        }
      }
    }
    front = next;
  }
  return new Set([...indices].map((index) => content.enemies[index].id));
}

/** Memoised `namedByStage` per stage id. */
const namesByStage = new Map<string, Set<string>>();
function namesOf(stageId: string): Set<string> {
  let names = namesByStage.get(stageId);
  if (names === undefined) {
    names = namedByStage(stageOf(db(), stageId));
    namesByStage.set(stageId, names);
  }
  return names;
}

/** The letters whose contracts say `remastered: true`. */
function remasteredLetters(): ZoneLetter[] {
  return (Object.keys(ZONE_CONTRACTS) as ZoneLetter[]).filter((l) => ZONE_CONTRACTS[l].remastered);
}

/**
 * Why a scenario's v1 baseline can no longer be compared on this tree, or `null` when the
 * comparison runs. A zone's own baselines drop with its contract; a non-zone baseline drops
 * when its content names an entry of a remastered zone's roster that another zone does not
 * also place (an entry every zone places — `tender` — is frozen by design and stays).
 *
 * @param scenario - The baseline scenario.
 * @returns The drop reason, or `null`.
 */
export function v2PortDropReason(scenario: BaselineScenario): string | null {
  const letters = remasteredLetters();
  if (letters.length === 0) return null;
  const own = /^zone-([a-i])$/.exec(scenario.stageId)?.[1] as ZoneLetter | undefined;
  if (own !== undefined && letters.includes(own)) {
    return `zone ${String(own).toUpperCase()} is remastered (R5)`;
  }
  const named = namesOf(scenario.stageId);
  for (const letter of letters) {
    const roster = namesOf(`zone-${letter}`);
    for (const id of named) {
      if (!roster.has(id)) continue;
      const shared = (Object.keys(ZONE_CONTRACTS) as ZoneLetter[]).some(
        (other) => other !== letter && namesOf(`zone-${other}`).has(id),
      );
      if (!shared) {
        return `${scenario.stageId} feeds the remastered zone ${String(letter).toUpperCase()} (${id})`;
      }
    }
  }
  return null;
}

/**
 * Declares the acceptance comparisons of some scenarios (one `it` each), skipped while the world
 * is ×1; scenarios a remastered zone invalidated (see {@link v2PortDropReason}) are declared
 * skipped with the reason in their title.
 *
 * @param title - The describe block's title.
 * @param scenarios - The scenarios to compare against their committed v1 baselines.
 */
export function describeV2PortComparisons(
  title: string,
  scenarios: readonly BaselineScenario[],
): void {
  describe.skipIf(K === 1)(title, () => {
    for (const scenario of scenarios) {
      const reason = v2PortDropReason(scenario);
      if (reason !== null) {
        it.skip(`${scenario.id}: dropped — ${reason}`, () => {});
        continue;
      }
      it(
        `${scenario.id}: the v2 run matches the v1 baseline through the port mapping`,
        () => {
          const v1 = readBaseline(scenario.id);
          const v2 = recordBaseline({ ...scenario, startX: v1x(scenario.startX) });
          const problems = compareScenario(v1, v2);
          expect(
            problems.join('\n'),
            `the port run of ${scenario.id} departs from the README mapping (${String(problems.length)} ` +
              'issues; bot-dependent rows are R2-02.T2b until the bot scales):\n' +
              problems.join('\n'),
          ).toBe('');
        },
        RERUN_TIMEOUT_MS,
      );
    }
  });
}
