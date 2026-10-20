/**
 * Zone F (CELL VAULT) content tests — the zone's cases split verbatim out of
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
import { K } from '../../packages/core/test/helpers/v1-port.js';
import {
  ZONES_B_G,
  bossArms,
  tileColumns as tileColumnsOf,
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
  const tileColumns = (id: string, tile: number): number[][] => tileColumnsOf(db, id, tile);
  const zoneA = new Set(
    [...stageEnemies(db, stageOf('zone-a'))].map((index) => db.enemies[index].id),
  );
  // Zone f's single row: the shared `it.each` templates re-substitute into the very case
  // titles the six-zone table produced in `content.test.ts`.
  const zones = ZONES_B_G.filter((zone) => zone.id === 'zone-f');
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

  it('gives CELL VAULT chasing cells, regenerating tissue walls, grabbing tentacles and a squid guarding its eye', () => {
    const stage = stageOf('zone-f');
    const events = stage.events.filter((e) => e.type === 'spawn' || e.type === 'formation');
    const script = (e: (typeof events)[number]): string =>
      'enemyId' in e ? db.enemies[e.enemyId].script : '';
    // Chasing cells: placed alone and in formations, and the halves of the dividing cells.
    expect(events.filter((e) => script(e) === 'cell.chase').length).toBeGreaterThanOrEqual(6);
    const dividers = events.filter((e) => script(e) === 'bubble.split');
    expect(dividers.length).toBeGreaterThanOrEqual(3);
    for (const e of dividers) {
      const child = 'enemyId' in e ? db.enemies[e.enemyId].childId : -1;
      expect(db.enemies[child]?.script).toBe('cell.chase');
    }
    // Regenerating tissue walls: the tileset's tissue (breakable, grows back), each column with a
    // gap the ship fits through.
    const tileset = db.tilesets.find((t) => t.id === stage.tilemap?.tileset);
    const tissue = (tileset?.tiles.findIndex((t) => t.name === 'tissue') ?? -1) + 1;
    expect(tileset?.tiles[tissue - 1]?.hp ?? 0).toBeGreaterThan(0);
    expect(tileset?.tiles[tissue - 1]?.regen ?? 0).toBeGreaterThan(0);
    const walls = tileColumns('zone-f', tissue);
    expect(walls.length).toBeGreaterThanOrEqual(10);
    for (const rows of walls) {
      let gap = 0;
      for (let k = 1; k < rows.length; k++) gap = Math.max(gap, rows[k] - rows[k - 1] - 1);
      expect(gap * (tileset?.tileSize ?? 0)).toBeGreaterThanOrEqual(48 * K);
    }
    // Grabbing tentacles on the floor and on the ceiling.
    const claws = events.filter((e) => script(e) === 'tentacle.grab');
    expect(claws.length).toBeGreaterThanOrEqual(4);
    const anchors = new Set(
      claws.map((e) => ('enemyId' in e ? db.enemies[e.enemyId].ground : null)),
    );
    expect([...anchors].sort()).toEqual(['ceiling', 'floor']);
    // MANTLE REGENT: an eye (the core) and two tentacles — a breakable root, armoured segments, a
    // gun at the tip; breaking one ends the first phase.
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.phases.every((p) => p.script === 'boss.squid')).toBe(true);
    const parts = boss?.parts ?? [];
    const cores = parts.filter((p) => p.core);
    expect(cores).toHaveLength(1);
    expect(cores[0].vulnerable).toBe('always');
    const arms = bossArms(parts);
    expect(arms).toHaveLength(2);
    for (const arm of arms) {
      expect(arm.length).toBeGreaterThanOrEqual(4);
      const root = parts[arm[0]];
      expect(root.vulnerable).toBe('always');
      expect(root.hp).toBeGreaterThan(0);
      for (const i of arm.slice(1)) expect(parts[i].vulnerable).toBe('never');
      expect(parts[arm[arm.length - 1]].gun).toBe(true);
    }
    const first = boss?.phases[0].until;
    expect([...(first?.partsDestroyed ?? [])].sort()).toEqual(
      arms.map((arm) => parts[arm[0]].name).sort(),
    );
    expect(first?.count).toBe(1);
    expect(db.enemies[boss?.minionId ?? -1]?.script).toBe('cell.chase');
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
