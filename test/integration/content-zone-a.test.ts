/**
 * Zone A (AZURE VERGE) content tests — split verbatim out of `content.test.ts` by R5-P.P2a
 * so an R5 zone lane never shares a test file with another zone; shared fixtures live in
 * `zones/helpers.ts`, the suite title and every test name are the ones the single file
 * produced. The 4-way design rules (shmup_feat.md §4 rule 2, D17) — no aimed bullet tunable
 * over 2 px/tick and, over a whole HALCYON BULWARK fight played by the 4-way bot, no enemy
 * bullet over 2 px/tick and no two simultaneous laser lanes closer than 16 px — and the
 * zone's structure: the five sections' camera keys and checkpoints, 6–8 enemy types,
 * ≥ 12 capsule sources before the boss and ≥ 3 within a recovery window after every
 * checkpoint (the recovery rule of shmup_feat.md §10), two in the calm before the WARNING.
 */
import {
  BossState,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
  MAX_BOSS_PARTS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  TerrainType,
  createGame,
  createHeadlessPlatform,
  terrainAt,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { runStage } from '../playtest/harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from '../playtest/rules.js';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import {
  boundsOf,
  capsuleSources,
  contractPx,
  scrollTicksToWarning,
  shippedDb,
  stageEnemies,
} from './zones/helpers.js';
import { zoneAContract } from './zones/zone-a.contract.js';

describe('integration: zone A holds to the 4-way design rules (M1-18)', () => {
  const db = shippedDb();
  const stage = db.stages[db.stageIndex.get('zone-a') ?? -1];
  // The zone content contract, live branch (R5-P.P6).
  const b = boundsOf(zoneAContract);

  it('ships AZURE VERGE with HALCYON BULWARK (HB-01) and its eight sections', () => {
    expect(stage.name).toBe('AZURE VERGE');
    if (b.lengthPx !== null) {
      expect(stage.length).toBeGreaterThanOrEqual(contractPx(zoneAContract, b.lengthPx[0]));
      expect(stage.length).toBeLessThanOrEqual(contractPx(zoneAContract, b.lengthPx[1]));
    }
    expect(stage.checkpoints.map((c) => c.x)).toEqual([0, 2700, 6300, 9600, 12000, 15600, 18300]);
    // The high-speed key at 12,000 (2.25 px/tick, design §2), then the calm key at 18,300.
    const key = (x: number): number => stage.camera.find((k) => k.x === x)?.speed ?? -1;
    expect(key(12000)).toBe(2.25);
    expect(key(18300)).toBeLessThan(2.25);
    const warning = stage.events.find((e) => e.type === 'warning');
    // The WARNING sits at 19,950 — design §2b's row (the 3,750-5,25 min scroll case measures to it).
    expect(warning?.x).toBe(19950);
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.code).toBe('HB-01');
    expect(boss?.displayName).toBe('HALCYON BULWARK');
    // Six shield plates of 10 in front of a 60-hp core that needs them all gone; armoured hull.
    const parts = boss?.parts ?? [];
    const plates = parts.filter((p) => p.name.startsWith('plate-'));
    expect(plates.map((p) => p.hp)).toEqual([10, 10, 10, 10, 10, 10]);
    const core = parts.find((p) => p.core);
    expect(core?.hp).toBe(60);
    expect(core?.vulnerable).toBe('afterParts');
    expect([...(core?.requires ?? [])].sort()).toEqual(plates.map((p) => p.name).sort());
    expect(parts.find((p) => p.name === 'hull')?.vulnerable).toBe('never');
    expect(parts.filter((p) => p.gun).map((p) => p.name)).toEqual([
      'emitter-top',
      'emitter-bottom',
    ]);
    // 6–8 enemy types (behaviours) besides the boss.
    const types = new Set(
      [...stageEnemies(db, stage)].map((i) => db.enemies[i]).filter((e) => e.boss === null),
    );
    const behaviours = new Set([...types].map((e) => e.script));
    if (b.behaviours !== null) {
      expect(behaviours.size).toBeGreaterThanOrEqual(b.behaviours[0]);
      expect(behaviours.size).toBeLessThanOrEqual(b.behaviours[1]);
    }
  });

  it('keeps every aimed bullet tunable at 2 px/tick or less (Normal)', () => {
    const speeds: string[] = [];
    for (const index of stageEnemies(db, stage)) {
      const enemy = db.enemies[index];
      if (enemy.boss !== null) {
        enemy.boss.phases.forEach((phase, p) => {
          const def = DEFAULT_BOSS_BEHAVIORS.get(phase.script);
          const params = { ...def?.params, ...phase.params };
          if ('bulletSpeed' in params)
            speeds.push(`${enemy.id}[${String(p)}] ${params.bulletSpeed}`);
          expect(params.bulletSpeed ?? 0, `${enemy.id} phase ${String(p)}`).toBeLessThanOrEqual(
            MAX_AIMED_BULLET_SPEED,
          );
        });
        continue;
      }
      const def = DEFAULT_BEHAVIORS.get(enemy.script);
      const params = { ...def?.params, ...enemy.params };
      if ('bulletSpeed' in params) speeds.push(`${enemy.id} ${params.bulletSpeed}`);
      expect(params.bulletSpeed ?? 0, enemy.id).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
    }
    expect(speeds.length).toBeGreaterThanOrEqual(4); // turrets, walkers, orbiters, the boss
  });

  it('never fires a bullet over 2 px/tick nor squeezes two laser lanes under 16 px (HB-01 fight)', () => {
    const rules = createRuleWatch();
    const phases = new Set<number>();
    const run = runStage('zone-a', fourWayBot(), {
      godMode: true,
      stageSkip: 'boss',
      observe(world) {
        rules.observe(world);
        if (world.bosses.boss.state === BossState.Fight) phases.add(world.bosses.boss.phase);
      },
    });
    expect(run.bossDefeated).toBe(true);
    expect([...phases]).toEqual([0, 1, 2]);
    expect(rules.violations).toEqual([]);
    expect(rules.maxBulletSpeed).toBeGreaterThan(0);
    expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
    // Its last phase really overlaps two lanes — with room between them.
    expect(rules.maxSeparate).toBe(2);
    expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    expect(rules.narrowestOpen).toBeGreaterThanOrEqual(MIN_LANE_GAP);
  });

  it('places the capsules for recovery: ≥ 12 before the boss, ≥ 3 after every checkpoint', () => {
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    const sources = capsuleSources(db, stage);
    const beforeWarning = sources.filter((x) => x < warningX).length;
    expect(beforeWarning).toBeGreaterThanOrEqual(b.capsulesBeforeWarning[0]);
    expect(beforeWarning).toBeLessThanOrEqual(b.capsulesBeforeWarning[1]);
    for (const checkpoint of stage.checkpoints) {
      const after = sources.filter(
        (x) => x >= checkpoint.x && x < checkpoint.x + b.capsuleWindow.px,
      );
      expect(after.length, `checkpoint ${String(checkpoint.x)}`).toBeGreaterThanOrEqual(
        b.capsuleWindow.min,
      );
    }
    // The calm band (design §5): after the last checkpoint's 18,900 the two tenders are all.
    expect(sources.filter((x) => x >= 18900 && x < warningX)).toHaveLength(2);
  });
  /**
   * The behaviours of every enemy a stage's spawn / formation events in `[from, to)` bring in
   * (children included), with the ground anchors of the ground enemies.
   *
   * @param from - First x.
   * @param to - End x (exclusive).
   * @returns Script ids, and `script:ground` for anchored enemies.
   */
  const sectionScripts = (from: number, to: number): Set<string> => {
    const out = new Set<string>();
    for (const event of stage.events) {
      if (event.x < from || event.x >= to) continue;
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      for (const enemy of [
        db.enemies[event.enemyId],
        db.enemies[db.enemies[event.enemyId].childId],
      ]) {
        if (enemy === undefined) continue;
        out.add(enemy.script);
        if (enemy.ground !== null) out.add(`${enemy.script}:${enemy.ground}`);
      }
    }
    return out;
  };

  it('lays out the eight sections with the archetypes the design names (R5-01.S5b)', () => {
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    // (1) 0–2,700 shallows: tutorial popcorn and the first carriers.
    const one = sectionScripts(0, 2700);
    expect(one).toContain('carrier.straight');
    expect(one).toContain('drifter.sine');
    // (2) 2,700–6,300 vane gallery: fan formations on paths, rammers.
    const two = sectionScripts(2700, 6300);
    expect(two).toContain('fan.loop');
    expect(two).toContain('rammer.aimed');
    const fans = stage.events.filter(
      (e) => e.type === 'formation' && e.x >= 2700 && e.x < 6300 && e.pathId >= 0,
    );
    expect(fans.length).toBeGreaterThanOrEqual(3);
    // (3) 6,300–9,600 corridor: floor and ceiling turrets, walkers, hatches.
    const three = sectionScripts(6300, 9600);
    for (const script of [
      'turret.floor:floor',
      'turret.floor:ceiling',
      'walker.floor:floor',
      'hatch.spawner:floor',
    ]) {
      expect(three, script).toContain(script);
    }
    // (4) 9,600–12,000 marshal: orbiters, and the captain's boss event before half the stage.
    expect(sectionScripts(9600, 12000)).toContain('orbiter.loop');
    const mid = stage.events.find((e) => e.type === 'boss');
    expect(mid?.type, 'the marshal event').toBe('boss');
    if (mid?.type === 'boss') {
      expect(mid.x).toBe(10350);
      expect(mid.x).toBeLessThan(stage.length / 2);
      expect(db.enemies[mid.enemyId].id).toBe('azure-marshal');
    }
    // (5) 12,000–15,600 blue lick: the orbit dive and the swooping vanes.
    const five = sectionScripts(12000, 15600);
    expect(five).toContain('orbiter.loop');
    expect(five).toContain('fan.loop');
    expect(five).toContain('rammer.aimed');
    // (6) 15,600–18,300 spires: matrons and wardens on the pedestals, a strider patrol.
    const six = sectionScripts(15600, 18300);
    expect(six).toContain('hatch.spawner:floor');
    expect(six).toContain('turret.floor:floor');
    expect(six).toContain('walker.floor:floor');
    // (7) 18,300–19,950 calm: after 18,900, two capsule carriers and nothing else (§5).
    const calm = stage.events.filter(
      (e) => e.x >= 18900 && e.x < warningX && (e.type === 'spawn' || e.type === 'formation'),
    );
    expect(calm.map((e) => ('enemyId' in e ? db.enemies[e.enemyId].script : ''))).toEqual([
      'carrier.straight',
      'carrier.straight',
    ]);
    // Ground enemies stand on rock: a floor under every floor unit, a ceiling over every one.
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-a' }, db);
    const map = game.world.terrain;
    expect(map).not.toBeNull();
    if (map !== null) {
      for (const event of stage.events) {
        if (event.type !== 'spawn') continue;
        const enemy = db.enemies[event.enemyId];
        if (enemy.ground === 'floor')
          expect(terrainAt(map, event.x, PLAYFIELD_H - 1) !== TerrainType.Empty, enemy.id).toBe(
            true,
          );
        if (enemy.ground === 'ceiling')
          expect(terrainAt(map, event.x, 0) !== TerrainType.Empty, enemy.id).toBe(true);
      }
    }
    // The stage theme and the boss theme; the planet band drawn last on the mid layer.
    expect(stage.music).toMatchObject({ stage: 'Stage', boss: 'Boss' });
    const midBands = stage.parallax.filter((p) => p.layer === 'mid');
    expect(midBands[midBands.length - 1]?.sprite).toBe('bg/azure-verge');
  });

  it('shapes its terrain: floors, the floor-and-ceiling corridor, an open arena for the boss', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-a' }, db);
    const map = game.world.terrain;
    expect(map).not.toBeNull();
    if (map === null) return;
    const ceiling = (x: number): boolean => terrainAt(map, x, 0) !== TerrainType.Empty;
    const floor = (x: number): boolean => terrainAt(map, x, PLAYFIELD_H - 1) !== TerrainType.Empty;
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    // Design §17: ceiling columns live only in the corridor window [5,100, 9,800) and
    // the spire window [16,128, 17,604), and nothing stands from 18,600 to the map's end.
    const inCeilingWindow = (x: number): boolean =>
      (x >= 5100 && x < 9800) || (x >= 16128 && x < 17604);
    let ceilingColumns = 0;
    for (let x = 0; x < stage.length + PLAYFIELD_W; x += 4) {
      if (ceiling(x)) {
        ceilingColumns++;
        expect(inCeilingWindow(x), `ceiling at ${String(x)}`).toBe(true);
      }
    }
    // The corridor's ceiling fills its whole 5,160–9,600 field bar the ramp edges.
    expect(ceilingColumns).toBeGreaterThan((9600 - 5160) / 4 - 48);
    for (const x of [900, 1500, 7500, 8400, 13200])
      expect(floor(x), `floor at ${String(x)}`).toBe(true);
    // The calm and the boss arena (the whole view from 18,600 on): open space.
    for (let x = 18600; x < stage.length + PLAYFIELD_W; x += 4) {
      expect(ceiling(x) || floor(x), `rock at ${String(x)}`).toBe(false);
    }
    expect(warningX).toBeGreaterThan(18600);
  });

  it("keeps HB-01's two lanes 16 px apart with the core's lane between them", () => {
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss).not.toBeNull();
    if (boss === null) return;
    /** A part's y relative to the boss origin (its parents' offsets added up). */
    const offsetY = (index: number): number => {
      let y = 0;
      for (let i = index; i >= 0; i = boss.parts[i].parentIndex) y += boss.parts[i].y;
      return y;
    };
    const guns = boss.parts.map((p, i) => (p.gun ? offsetY(i) : null)).filter((y) => y !== null);
    expect(guns).toHaveLength(2);
    const [top, bottom] = [Math.min(...guns), Math.max(...guns)];
    const coreY = offsetY(boss.parts.findIndex((p) => p.core));
    expect(top).toBeLessThan(coreY);
    expect(bottom).toBeGreaterThan(coreY);
    const hurt = createGame(createHeadlessPlatform(), { seed: 1 }, db).world.ship.hurtRadius;
    const bulwark = DEFAULT_BOSS_BEHAVIORS.get('boss.bulwark');
    for (const [p, phase] of boss.phases.entries()) {
      expect(phase.script, `phase ${String(p)}`).toBe('boss.bulwark');
      const params = { ...bulwark?.params, ...phase.params };
      const half = params.laserWidth / 2 + hurt;
      // Two simultaneous lanes (phase 2 overlaps them) leave a gap a 4-way ship fits in…
      expect(bottom - top - 2 * half, `phase ${String(p)}`).toBeGreaterThanOrEqual(MIN_LANE_GAP);
      // … the core's lane is inside it …
      expect(coreY - top - half).toBeGreaterThan(0);
      expect(bottom - coreY - half).toBeGreaterThan(0);
      // … and the tracking keeps both lanes on the playfield.
      expect(params.margin + top).toBeGreaterThanOrEqual(0);
      expect(PLAYFIELD_H - params.margin + bottom).toBeLessThanOrEqual(PLAYFIELD_H);
      expect(params.trackSpeed).toBeLessThan(1); // slow vertical tracking
    }
  });

  it('keeps the rebuilt HB-01 inside the bible height with a reachable core (R5-01.S4b)', () => {
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss).not.toBeNull();
    if (boss === null) return;
    expect(boss.parts.length).toBeLessThanOrEqual(MAX_BOSS_PARTS);
    const { manifest } = buildAtlas();
    /** A part's y relative to the boss origin (its parents' offsets added up). */
    const anchorY = (index: number): number => {
      let y = 0;
      for (let i = index; i >= 0; i = boss.parts[i].parentIndex) y += boss.parts[i].y;
      return y;
    };
    // Assembled like `scripts/doc-images.mjs`: each sprite centred on its anchor, parents first.
    let minY = 0;
    let maxY = 0;
    for (const [i, part] of boss.parts.entries()) {
      if (part.sprite === undefined) continue;
      const ref = manifest.sprites[part.sprite]?.frames[0];
      if (ref === undefined) continue;
      const h = manifest.frames[ref].h;
      const centre = Math.round(anchorY(i));
      minY = Math.min(minY, centre - Math.floor(h / 2));
      maxY = Math.max(maxY, centre + h - Math.floor(h / 2));
    }
    expect(maxY - minY).toBeLessThanOrEqual(Math.round(0.6 * PLAYFIELD_H));
    const core = boss.parts.find((p) => p.core);
    expect(core).not.toBeUndefined();
    expect(core?.vulnerable).not.toBe('never');
    const byName = new Map(boss.parts.map((p) => [p.name, p]));
    for (const name of core?.requires ?? []) {
      expect(byName.get(name)?.vulnerable, name).not.toBe('never');
    }
    expect(core?.requires?.length ?? 0).toBeGreaterThan(0);
  });

  it('takes the scroll about three minutes to reach the WARNING (the run lasts 3–6 min)', () => {
    const ticks = scrollTicksToWarning(stage);
    expect(ticks / 60).toBeGreaterThanOrEqual(b.scrollSec[0]);
    expect(ticks / 60).toBeLessThanOrEqual(b.scrollSec[1]);
  });
  it('animates every shipped enemy and boss part with frames the atlas has; zone A flashes on hits', () => {
    const { manifest } = buildAtlas();
    const frames = (sprite: string): number => manifest.sprites[sprite]?.frames.length ?? 0;
    for (const enemy of db.enemies) {
      // A boss is drawn by its parts (its own sprite is unused).
      if (enemy.boss === null) {
        expect(frames(enemy.sprite), enemy.id).toBeGreaterThanOrEqual(enemy.anim.frames);
      }
      for (const part of enemy.boss?.parts ?? []) {
        if (part.sprite === undefined) continue;
        expect(frames(part.sprite), `${enemy.id}.${part.name}`).toBeGreaterThanOrEqual(
          part.anim.frames,
        );
      }
    }
    // Zone A's roster and HB-01's parts have their white hit-flash frames.
    const zone = [...stageEnemies(db, stage)].map((i) => db.enemies[i]);
    const sprites = new Set<string>();
    for (const enemy of zone) {
      if (enemy.boss === null) sprites.add(enemy.sprite);
      for (const part of enemy.boss?.parts ?? [])
        if (part.sprite !== undefined) sprites.add(part.sprite);
    }
    expect(sprites.size).toBeGreaterThanOrEqual(10);
    for (const sprite of sprites) {
      const flash = manifest.sprites[sprite]?.flash ?? null;
      expect(flash, sprite).not.toBeNull();
      expect(manifest.sprites[flash ?? '']?.frames.length, sprite).toBe(frames(sprite));
    }
  });
});
