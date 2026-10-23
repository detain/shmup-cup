/**
 * `pnpm bench` — the R6-01.B1 balance harness: it plays every campaign route of the shipped
 * diamond with the 4-way playtest bot **without** god mode, for both ships (the KESTREL and the
 * MANTA) and all four difficulty presets (Easy / Normal / Hard / Arcade), and records per zone the
 * score curve, the deaths, the extends earned, the rank and the boss fight time. The simulation is
 * deterministic, so two runs give byte-identical tables — that is the acceptance proof of this
 * file.
 *
 * It is gated behind `SHMUP_BALANCE=1`: `test/bench/vitest.config.ts` includes every `*.perf.ts`
 * and CI's Benchmark job runs the whole `pnpm bench`, so without the variable the suite must skip
 * in seconds. With it, the tables (JSON and Markdown) are written to the directory named by
 * `SHMUP_BALANCE_OUT` (default `os.tmpdir()`) — never to a fixed repository path.
 *
 * The route walk mirrors `test/playtest/campaign.ts` `walkCampaignRoutes` exactly (the same fork
 * rule: a route stops at the first zone that does not reach its stage clear, so no fork follows a
 * game over). It drives the exported `playRunZone` / `cloneRun` primitives directly rather than
 * calling `walkCampaignRoutes` itself, because a balance row needs the per-tick statistics that
 * `ZoneOutcome` does not carry — the deaths, the extends earned within the zone, and the boss fight
 * time — and those are sampled here through `playRunZone`'s per-zone `observe` hook. The BOT-owned
 * files (`campaign.ts`, `campaign-routes.ts`, `harness.ts`, `four-way-bot.ts`) are only read and
 * imported, never edited.
 *
 * A zone that no route of a ship × preset reaches has no row — it is reported as a gap (the
 * `gaps` list), never as an invented number.
 *
 * @module
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, it } from 'vitest';
import {
  BossRole,
  BossState,
  RunState,
  type CampaignSpec,
  type DifficultyPreset,
  type GameConfig,
  type World,
} from '@shmup/core';
import { cloneRun, playRunZone } from '../playtest/campaign.js';
import { ROUTE_SHIPS, type RouteShip } from '../playtest/campaign-routes.js';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { shippedContent } from '../playtest/harness.js';

/** The difficulty presets, in report order (shmup_feat.md §15). */
const PRESETS: readonly DifficultyPreset[] = Object.freeze(['easy', 'normal', 'hard', 'arcade']);

/** The ships of the campaign, in report order (`ROUTE_SHIPS` keys — M2-05). */
const SHIPS: readonly RouteShip[] = Object.freeze(['kestrel', 'manta']);

/** The seed every case plays (fixed: the balance table must not move between runs). */
const SEED = 1;

/** Sim ticks per second (`harness.ts` `TICKS_PER_SECOND`). */
const TICKS_PER_SECOND = 60;

/**
 * Per-case timeout, well above the bench config's 300 s default: one case flies up to 31 zone runs
 * (the 16 routes of the diamond, zone A once) so the whole walk is long even though a non-god
 * route stops at its first loss.
 */
const CASE_TIMEOUT_MS = 3_600_000;

/** One row: one zone of one route of one ship × preset. */
interface BalanceRow {
  /** The ship that played (`kestrel` / `manta`). */
  readonly ship: string;
  /** The difficulty preset (`easy` / `normal` / `hard` / `arcade`). */
  readonly preset: string;
  /** The route's zone labels joined (`ABDFH`). */
  readonly route: string;
  /** The zone's place on the route (0 = zone A). */
  readonly depth: number;
  /** The zone's map label (`A` … `I`). */
  readonly zone: string;
  /** The stage played. */
  readonly stageId: string;
  /** The World's status when the zone stopped. */
  readonly status: string;
  /** Whether the zone reached its stage clear. */
  readonly cleared: boolean;
  /** Sim ticks played in the zone. */
  readonly ticks: number;
  /** Player 1's deaths within the zone. */
  readonly deaths: number;
  /** Extra lives the score earned within the zone. */
  readonly extendsEarned: number;
  /** Player 1's run score at the zone's end (the curve). */
  readonly score: number;
  /** Score gained within the zone. */
  readonly scoreGain: number;
  /** The World's rank at the zone's end. */
  readonly rank: number;
  /** The tally's kill rate. */
  readonly killPercent: number;
  /** The tally's time bonus. */
  readonly timeBonus: number;
  /** Whether the zone's boss was destroyed. */
  readonly bossDefeated: boolean;
  /** Ticks from the boss's first fight tick to its death (-1 = not killed). */
  readonly bossFightTicks: number;
}

/** A gap: a zone no route of one ship × preset ever played. */
interface BalanceGap {
  /** The ship. */
  readonly ship: string;
  /** The preset. */
  readonly preset: string;
  /** The zone label never reached. */
  readonly zone: string;
}

/**
 * The per-zone live statistics, sampled through `playRunZone`'s `observe` hook (a fresh instance
 * per zone: each zone is a fresh World). It mirrors `harness.ts` `runStage`'s death and boss
 * tracking — a death is a tick on which player 1 went `alive` → `dying`; the boss fight runs from
 * the first `Fight` tick to the first following `Dying` tick of the stage's main encounter.
 */
class ZoneSample {
  /** Whether the first tick has been seen (the baselines). */
  private seen = false;
  /** Player 1's state on the previous observed tick. */
  private prevState = '';
  /** Deaths so far in the zone. */
  deaths = 0;
  /** The score's extends count at the zone's start (the carried-in value). */
  private startExtends = 0;
  /** The score at the zone's start. */
  private startScore = 0;
  /** The run's extends earned within the zone. */
  extendsEarned = 0;
  /** The score gained within the zone. */
  scoreGain = 0;
  /** The rank at the last observed tick. */
  rank = 0;
  /** Tick the stage boss first entered `Fight` (-1 = never). */
  private fightStart = -1;
  /** Tick the stage boss entered `Dying` after the fight (-1 = never). */
  private killTick = -1;
  /** Whether the boss was destroyed. */
  bossDefeated = false;
  /** Ticks of the boss fight (-1 = not killed). */
  bossFightTicks = -1;

  /**
   * Records one observed tick of the zone's World.
   *
   * @param world - The World after the tick (read-only).
   */
  observe(world: World): void {
    const ship = world.players[0];
    const score = world.scoring.board.scores[0];
    if (!this.seen) {
      this.seen = true;
      this.startExtends = score.extendsEarned;
      this.startScore = score.score;
    } else if (this.prevState === 'alive' && ship.state === 'dying') {
      this.deaths++;
    }
    this.prevState = ship.state;
    const phase = stageBossPhase(world);
    if (this.fightStart < 0 && phase === BossState.Fight) this.fightStart = world.tick;
    if (this.killTick < 0 && this.fightStart >= 0 && phase === BossState.Dying)
      this.killTick = world.tick;
    this.rank = world.rank;
    this.extendsEarned = score.extendsEarned - this.startExtends;
    this.scoreGain = score.score - this.startScore;
    this.bossDefeated = this.killTick >= 0;
    this.bossFightTicks = this.killTick >= 0 ? this.killTick - this.fightStart : -1;
  }
}

/**
 * The stage's main encounter phase (mirrors `harness.ts` `stageBoss`): the first boss of role
 * {@link BossRole.Boss} in `Fight` or `Dying`, {@link BossState.None} when there is none. Never a
 * captain or a raid turret.
 *
 * @param world - The World (read-only).
 * @returns The {@link BossState} code, or `BossState.None`.
 */
function stageBossPhase(world: World): BossState {
  const slots = world.bosses.slots;
  for (let i = 0; i < slots.length; i++) {
    const boss = slots[i];
    if (boss.role !== BossRole.Boss) continue;
    if (boss.state === BossState.Fight) return BossState.Fight;
    if (boss.state === BossState.Dying) return BossState.Dying;
  }
  return BossState.None;
}

/**
 * Flies every route of the campaign with one ship × preset, without god mode, appending one
 * {@link BalanceRow} per zone played. The fork rule is `walkCampaignRoutes`'s: a cleared non-final
 * zone fans out over its exits; anything else ends a route.
 *
 * @param campaign - The shipped campaign spec.
 * @param ship - Which ship plays.
 * @param preset - Which difficulty preset.
 * @param rows - Where the zone rows accumulate (in execution order).
 */
function walkOneCase(
  campaign: CampaignSpec,
  ship: RouteShip,
  preset: DifficultyPreset,
  rows: BalanceRow[],
): void {
  const config: Partial<GameConfig> = { ...ROUTE_SHIPS[ship], difficulty: preset };
  const labels = (run: RunState): string => run.route.map((z) => campaign.zones[z].label).join('');
  const walk = (run: RunState): void => {
    const sample = new ZoneSample();
    const { outcome } = playRunZone(run, fourWayBot(), {
      godMode: false,
      seed: SEED,
      config,
      observe: (world) => sample.observe(world),
    });
    const cleared = outcome.status === 'stageClear';
    rows.push({
      ship,
      preset,
      route: labels(run),
      depth: run.depth,
      zone: campaign.zones[run.zone].label,
      stageId: outcome.stageId,
      status: outcome.status,
      cleared,
      ticks: outcome.ticks,
      deaths: sample.deaths,
      extendsEarned: sample.extendsEarned,
      score: outcome.score,
      scoreGain: sample.scoreGain,
      rank: sample.rank,
      killPercent: outcome.killPercent,
      timeBonus: outcome.timeBonus,
      bossDefeated: sample.bossDefeated,
      bossFightTicks: sample.bossFightTicks,
    });
    if (!cleared) return;
    const exits = campaign.zones[run.zone].exits;
    if (exits.length === 0) return;
    for (const exit of exits) {
      const next = cloneRun(run);
      next.advance(exit);
      walk(next);
    }
  };
  const start = new RunState();
  start.begin(campaign, null);
  walk(start);
}

/**
 * Formats a number of sim ticks as seconds to one decimal for the Markdown table.
 *
 * @param ticks - Sim ticks.
 * @returns The seconds string.
 */
function seconds(ticks: number): string {
  return (ticks / TICKS_PER_SECOND).toFixed(1);
}

/**
 * Renders the accumulated rows and gaps as a Markdown report. The output depends only on the data,
 * never on the run, so two runs produce identical text.
 *
 * @param rows - The zone rows, in order.
 * @param gaps - The gaps, in order.
 * @returns The Markdown document.
 */
function renderMarkdown(rows: readonly BalanceRow[], gaps: readonly BalanceGap[]): string {
  const head =
    '# R6-01.B1 balance report (headless 4-way bot, no god mode)\n\n' +
    `Cases: ${SHIPS.join(' × ')} ships over ${PRESETS.join(' / ')} presets. ` +
    'Rows: every zone a route reached. A gap is a zone no route of that ship × preset ever played.\n\n';
  const gapSection =
    '## Gaps (zones never reached)\n\n' +
    '| ship | preset | zone |\n| --- | --- | --- |\n' +
    (gaps.length === 0
      ? '| — | — | — |\n'
      : gaps.map((g) => `| ${g.ship} | ${g.preset} | ${g.zone} |\n`).join(''));
  const rowSection =
    '\n## Zone rows\n\n' +
    '| ship | preset | route | zone | status | clear | ticks | deaths | extends | score | gain | rank | kill% | boss fight | \n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    rows
      .map(
        (r) =>
          `| ${r.ship} | ${r.preset} | ${r.route} | ${r.zone} | ${r.status} | ` +
          `${r.cleared ? 'yes' : 'no'} | ${seconds(r.ticks)} | ${r.deaths} | ${r.extendsEarned} | ` +
          `${r.score} | ${r.scoreGain} | ${r.rank} | ${r.killPercent.toFixed(1)} | ` +
          `${r.bossFightTicks >= 0 ? `${seconds(r.bossFightTicks)}s` : '—'} |`,
      )
      .join('\n') +
    '\n';
  return head + gapSection + rowSection;
}

/** The directory the tables go to (`SHMUP_BALANCE_OUT`, default `os.tmpdir()`). */
function outputDir(): string {
  return process.env.SHMUP_BALANCE_OUT ?? tmpdir();
}

const rows: BalanceRow[] = [];
const campaign: CampaignSpec | null = shippedContent().campaign;

describe.runIf(process.env.SHMUP_BALANCE === '1')('bench: campaign balance (no god mode)', () => {
  if (campaign === null) {
    throw new Error(
      'balance harness needs a shipped campaign (content/campaign/main.campaign.json)',
    );
  }
  for (const preset of PRESETS) {
    for (const ship of SHIPS) {
      it(
        `${ship} × ${preset}`,
        () => {
          walkOneCase(campaign, ship, preset, rows);
        },
        CASE_TIMEOUT_MS,
      );
    }
  }

  afterAll(() => {
    if (campaign === null) return;
    const reached = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = `${row.ship}\u0000${row.preset}`;
      let zones = reached.get(key);
      if (zones === undefined) {
        zones = new Set<string>();
        reached.set(key, zones);
      }
      zones.add(row.zone);
    }
    const allLabels = campaign.zones.map((z) => z.label);
    const gaps: BalanceGap[] = [];
    for (const preset of PRESETS) {
      for (const ship of SHIPS) {
        const zones = reached.get(`${ship}\u0000${preset}`) ?? new Set<string>();
        for (const label of allLabels) {
          if (!zones.has(label)) gaps.push({ ship, preset, zone: label });
        }
      }
    }
    const out = outputDir();
    mkdirSync(out, { recursive: true });
    writeFileSync(
      join(out, 'balance.json'),
      JSON.stringify({ presets: PRESETS, ships: SHIPS, rows, gaps }, null, 2) + '\n',
    );
    writeFileSync(join(out, 'balance.md'), renderMarkdown(rows, gaps));
    console.info(`[balance] ${rows.length} rows, ${gaps.length} gaps → ${out}`);
  });
});
