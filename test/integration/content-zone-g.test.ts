/**
 * Zone G (PRISM LABYRINTH) content tests — the zone's cases split verbatim out of
 * `content.test.ts`' zones B–G suite by R5-P.P2b (one file per zone, so an R5 zone lane never
 * shares a test file with another zone). The suite title and every case title are the ones the
 * single file's `it.each` tables produced; the shared fixtures ride in `zones/helpers.ts`.
 */
import {
  BossState,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
  DEFAULT_SPAWN_SCREEN_X,
  MUSIC_CUES,
  PLAYFIELD_H,
  TerrainType,
  createGame,
  createHeadlessPlatform,
  createStageRunner,
  terrainAt,
  type StageSpec,
} from '@shmup/core';
import { loadMusicContent, resolveMusicCues } from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { runStage } from '../playtest/harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from '../playtest/rules.js';
import { RECOVERY_WINDOW } from '../playtest/recovery.js';
import {
  ZONES_B_G,
  bossArms,
  capsuleSources,
  placedIn as placedInOf,
  scrollTicksToWarning,
  shippedDb,
  shippedFiles,
  stageEnemies,
  stageOf as stageOfIn,
  zoneEnemies as zoneEnemiesOf,
} from './zones/helpers.js';

describe('integration: zones B–G hold to the plan and the 4-way design rules (M2-11 … M2-13)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => stageOfIn(db, id);
  const zoneEnemies = (stage: StageSpec): Set<number> => zoneEnemiesOf(db, stage);
  const placedIn = (ids: readonly string[]): Set<string> => placedInOf(db, ids);
  const zoneA = new Set(
    [...stageEnemies(db, stageOf('zone-a'))].map((index) => db.enemies[index].id),
  );
  // Zone g's single row: the shared `it.each` templates re-substitute into the very case
  // titles the six-zone table produced in `content.test.ts`.
  const zones = ZONES_B_G.filter((zone) => zone.id === 'zone-g');
  it.each(zones)(
    'ships $name with $boss ($code): 3–6 minutes, checkpoints, its own tileset and songs',
    (zone) => {
      const stage = stageOf(zone.id);
      expect(stage.name).toBe(zone.name);
      expect(stage.type).toBe('normal');
      expect(stage.checkpoints.length).toBeGreaterThanOrEqual(4);
      expect(stage.tilemap?.tileset).toBe(zone.tileset);
      const warning = stage.events.find((e) => e.type === 'warning');
      const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
      expect(boss?.code).toBe(zone.code);
      expect(boss?.displayName).toBe(zone.boss);
      expect(boss?.phases).toHaveLength(3);
      // The scroll takes 2.5–4.5 minutes to the WARNING; the fight brings the run to 3–6 minutes.
      const ticks = scrollTicksToWarning(stage);
      expect(ticks / 60).toBeGreaterThanOrEqual(2.5 * 60);
      expect(ticks / 60).toBeLessThanOrEqual(4.5 * 60);
      // A high-speed section, then a calm before the WARNING with exactly two carriers.
      expect(Math.max(...stage.camera.map((k) => k.speed))).toBeGreaterThanOrEqual(1.25);
      const calmX = stage.camera[stage.camera.length - 1].x;
      const calm = stage.events.filter(
        (e) =>
          e.x >= calmX && e.x < (warning?.x ?? 0) && (e.type === 'spawn' || e.type === 'formation'),
      );
      expect(calm.map((e) => ('enemyId' in e ? db.enemies[e.enemyId].script : ''))).toEqual([
        'carrier.straight',
        'carrier.straight',
      ]);
      // Its own Direct-mode item plan, stage theme and boss theme (stage-scoped tracks).
      expect(stage.directItems?.length).toBeGreaterThanOrEqual(20);
      const { content } = loadMusicContent(
        shippedFiles.filter((file) => (file.data as { kind?: unknown }).kind === 'music'),
      );
      const table = resolveMusicCues(content, zone.id);
      const letter = zone.id.slice(-1);
      expect(content.tracks[table[MUSIC_CUES.Stage]]?.id).toBe(zone.id);
      expect(content.tracks[table[MUSIC_CUES.Boss]]?.id).toBe(`boss-${letter}`);
      // Zone A keeps its own.
      const a = resolveMusicCues(content, 'zone-a');
      expect(content.tracks[a[MUSIC_CUES.Stage]]?.id).toBe('zone-a');
      expect(content.tracks[a[MUSIC_CUES.Boss]]?.id).toBe('boss');
    },
  );

  it.each(zones)('brings 4–6 new enemy types to $name', (zone) => {
    const stage = stageOf(zone.id);
    const earlier = placedIn(zone.earlier);
    const earlierSprites = new Set(
      [...earlier].map((id) => db.enemies[db.enemyIndex.get(id) ?? -1].sprite),
    );
    const placed = new Set<string>();
    for (const event of stage.events) {
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      const enemy = db.enemies[event.enemyId];
      if (!earlier.has(enemy.id) && !earlierSprites.has(enemy.sprite)) placed.add(enemy.sprite);
    }
    expect(zoneA.size).toBeGreaterThan(0);
    expect(placed.size).toBeGreaterThanOrEqual(4);
    expect(placed.size).toBeLessThanOrEqual(6);
  });

  it('gives PRISM LABYRINTH crystal walls, a seeded cube rush, a crystal core with tentacle arms and a hidden bonus stage', () => {
    const stage = stageOf('zone-g');
    // Crystal walls: rock hanging from the ceiling past the playfield's middle row, and rising
    // from the floor past it, in turn — the labyrinth (drawn with the tileset's wall edges).
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-g' }, db);
    const map = game.world.terrain;
    if (map === null) throw new Error('no terrain');
    const middle = Math.floor(PLAYFIELD_H / 2 / map.tileSize);
    const rock = (col: number, from: number, to: number): boolean => {
      for (let row = from; row <= to; row++)
        if (map.tiles[row * map.cols + col] === 0) return false;
      return true;
    };
    let hanging = 0;
    let rising = 0;
    for (let col = 0; col < map.cols; col++) {
      if (rock(col, 0, middle)) hanging++;
      if (rock(col, middle, map.rows - 1)) rising++;
    }
    expect(hanging).toBeGreaterThanOrEqual(6);
    expect(rising).toBeGreaterThanOrEqual(6);
    // A seeded cube rush: formations of cubes that stack into the tileset's breakable cube tiles.
    const rushes = stage.events.filter(
      (e) => e.type === 'formation' && db.enemies[e.enemyId].script === 'cube.stack',
    );
    expect(rushes.length).toBeGreaterThanOrEqual(3);
    for (const rush of rushes) {
      if (rush.type !== 'formation') continue;
      expect(rush.count).toBeGreaterThanOrEqual(6);
      expect(rush.drop).toBeNull();
    }
    const tileset = db.tilesets.find((t) => t.id === stage.tilemap?.tileset);
    expect(tileset?.tiles.find((t) => t.name === 'cube')?.hp ?? 0).toBeGreaterThan(0);
    // FACET MONARCH: the core behind crystals, two tentacle arms with guns at their tips.
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.phases.every((p) => p.script === 'boss.facet')).toBe(true);
    const parts = boss?.parts ?? [];
    const core = parts.find((p) => p.core);
    expect(core?.vulnerable).toBe('afterParts');
    expect(core?.requires.length).toBeGreaterThanOrEqual(2);
    for (const name of core?.requires ?? []) {
      const crystal = parts.find((p) => p.name === name);
      expect(crystal?.sprite).toBe('bosses/facet-crystal');
      expect((crystal?.x ?? 0) + (crystal?.hurtbox?.hw ?? 0)).toBeLessThan(core?.x ?? 0); // in front
    }
    const arms = bossArms(parts);
    expect(arms).toHaveLength(2);
    for (const arm of arms) {
      expect(arm.length).toBeGreaterThanOrEqual(4);
      for (const i of arm) expect(parts[i].vulnerable).toBe('never');
      expect(parts[arm[arm.length - 1]].gun).toBe(true);
    }
    // The second hidden bonus stage: a `ground` entrance — shoot down every turret of the prism
    // gallery (floor and ceiling, no other ground enemy in the window) — into a bonus stage with
    // bonus capsules and a 1UP.
    const entrances = stage.events.filter((e) => e.type === 'bonus');
    expect(entrances).toHaveLength(1);
    const entrance = entrances[0];
    if (entrance.type !== 'bonus') return;
    expect(entrance.entrance).toBe('ground');
    const window = stage.events.filter(
      (e) =>
        (e.type === 'spawn' || e.type === 'formation') &&
        e.x >= entrance.x &&
        e.x <= entrance.until &&
        db.enemies[e.enemyId].ground !== null,
    );
    expect(window.length).toBeGreaterThanOrEqual(4);
    expect(
      new Set(window.map((e) => ('enemyId' in e ? db.enemies[e.enemyId].sprite : ''))),
    ).toEqual(new Set(['enemies/facet-turret']));
    const grounds = new Set(
      window.map((e) => ('enemyId' in e ? db.enemies[e.enemyId].ground : '')),
    );
    expect([...grounds].sort()).toEqual(['ceiling', 'floor']);
    const cache = stageOf(entrance.stage);
    expect(cache.type).toBe('bonus');
    expect(cache.id).not.toBe('brine-grotto'); // its own, not zone B's
    const drops = [...stageEnemies(db, cache)].map((index) => db.enemies[index].drop);
    expect(drops).toContain('bonusCapsule');
    expect(drops).toContain('oneUp');
  });

  it.each(zones)(
    'keeps every aimed bullet of $name at 2 px/tick or less (tunables and patterns)',
    (zone) => {
      const speeds: number[] = [];
      for (const index of zoneEnemies(stageOf(zone.id))) {
        const enemy = db.enemies[index];
        const phases = enemy.boss?.phases ?? [];
        for (const phase of phases) {
          const params = { ...DEFAULT_BOSS_BEHAVIORS.get(phase.script)?.params, ...phase.params };
          for (const key of ['bulletSpeed', 'ringSpeed', 'speed']) {
            if (key in params) speeds.push(params[key]);
          }
        }
        if (enemy.boss !== null) continue;
        const params = { ...DEFAULT_BEHAVIORS.get(enemy.script)?.params, ...enemy.params };
        if ('bulletSpeed' in params) speeds.push(params.bulletSpeed);
        // Bodies that chase, dash at or fly back through the ship are held to the same speed.
        if (enemy.script === 'rocket.homing' || enemy.script === 'rammer.aimed')
          speeds.push(params.speed);
        if (enemy.script === 'rear.swoop') speeds.push(params.speed, params.leaveSpeed);
        // M2-13: chasing cells and the lunging claws of the grabbing tentacles.
        if (enemy.script === 'cell.chase') speeds.push(params.speed);
        if (enemy.script === 'tentacle.grab') speeds.push(params.speed, params.retractSpeed);
      }
      expect(speeds.length).toBeGreaterThanOrEqual(4);
      for (const speed of speeds) expect(speed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
      // The DSL patterns the zone's enemies run (every `speed` literal of their fire ops),
      // read from **every** shipped patterns file — R5-P.P4 may split them further.
      const patterns = shippedFiles
        .filter((file) => file.path.startsWith('patterns/') && file.path.endsWith('.patterns.json'))
        .map((file) => JSON.stringify(file.data))
        .join('\n');
      for (const match of patterns.matchAll(/"speed":\s*([0-9.]+)/g)) {
        expect(Number(match[1])).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
      }
    },
  );

  it.each(zones)(
    'places the capsules of $name for recovery: ≥ 12 before the boss, ≥ 3 after every checkpoint',
    (zone) => {
      const stage = stageOf(zone.id);
      const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
      const sources = capsuleSources(db, stage);
      expect(sources.filter((x) => x < warningX).length).toBeGreaterThanOrEqual(12);
      for (const checkpoint of stage.checkpoints) {
        const after = sources.filter(
          (x) => x >= checkpoint.x && x < checkpoint.x + RECOVERY_WINDOW,
        );
        expect(after.length, `checkpoint ${String(checkpoint.x)}`).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.each(zones)(`stands the ground enemies of $name on rock`, (zone) => {
    const stage = stageOf(zone.id);
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: zone.id }, db);
    const map = game.world.terrain;
    expect(map).not.toBeNull();
    if (map === null) return;
    // The camera y each event fires at (zone D dives 200 px into its caves).
    const runner = createStageRunner(stage, { event() {}, clear() {} });
    let ground = 0;
    for (const event of stage.events) {
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      for (let t = 0; t < 60 * 60 * 10 && runner.camera.x < event.x; t++) runner.tick();
      const enemy = db.enemies[event.enemyId];
      if (enemy.ground === null) continue;
      ground++;
      const x = event.x + (event.screenX ?? DEFAULT_SPAWN_SCREEN_X);
      const top = Math.round(runner.camera.y);
      // Rock in the lower (floor) or upper (ceiling) third of the playfield below / above it.
      const rows = (
        enemy.ground === 'floor'
          ? [PLAYFIELD_H - 1, PLAYFIELD_H - map.tileSize]
          : [0, map.tileSize - 1]
      ).map((y) => top + y);
      expect(
        rows.some((y) => terrainAt(map, x, y) !== TerrainType.Empty),
        `${enemy.id} at ${String(event.x)}`,
      ).toBe(true);
    }
    expect(ground).toBeGreaterThanOrEqual(8);
  });

  it.each(zones)(
    "holds $boss's fight to the 4-way rules (the bot, god mode, stage skip)",
    (zone) => {
      const rules = createRuleWatch();
      const phases = new Set<number>();
      const run = runStage(zone.id, fourWayBot(), {
        godMode: true,
        stageSkip: 'boss',
        observe(world) {
          rules.observe(world);
          for (const boss of world.bosses.slots) {
            if (boss.state === BossState.Fight && boss.role === 0) phases.add(boss.phase);
          }
        },
      });
      expect(run.bossDefeated).toBe(true);
      expect([...phases].sort()).toEqual([0, 1, 2]);
      expect(rules.violations).toEqual([]);
      expect(rules.maxBulletSpeed).toBeGreaterThan(0);
      expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
      // At most one silk line at a time (the widow), none from the fish or the seahorse; the
      // bastion's two lanes may overlap for a moment, never under the 16-px gap.
      expect(rules.maxSeparate).toBeLessThanOrEqual(zone.lanes);
      if (zone.lanes > 1) expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    },
  );
});
