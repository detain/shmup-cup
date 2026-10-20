/**
 * Zone H (IRON CITADEL) content tests — the finale zone's cases split verbatim out of
 * `content.test.ts`' zones H / I suite by R5-P.P2b (one file per zone, so an R5 zone lane never
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
  terrainAt,
  type BossSpec,
  type StageSpec,
} from '@shmup/core';
import { loadMusicContent, resolveMusicCues, stageMusicCues } from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { runStage } from '../playtest/harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from '../playtest/rules.js';
import { RECOVERY_WINDOW } from '../playtest/recovery.js';
import { v1speed } from '../../packages/core/test/helpers/v1-port.js';
import {
  ZONES_H_I,
  bossOf as bossOfIn,
  capsuleSources,
  scrollTicksToWarning,
  shippedDb,
  shippedFiles,
  stageEnemies,
  stageOf as stageOfIn,
  zoneEnemies as zoneEnemiesOf,
} from './zones/helpers.js';

describe('integration: zones H and I, the finales, hold to the plan and the 4-way rules (M2-14)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => stageOfIn(db, id);
  const bossOf = (stage: StageSpec): BossSpec | null => bossOfIn(db, stage);
  const zoneEnemies = (stage: StageSpec): Set<number> => zoneEnemiesOf(db, stage);
  const earlierZones = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((z) => 'zone-' + z);
  // Zone h's single row: the shared `it.each` templates re-substitute into the very case
  // titles the two-zone table produced in `content.test.ts`.
  const zones = ZONES_H_I.filter((zone) => zone.id === 'zone-h');
  const { content: music } = loadMusicContent(
    shippedFiles.filter((file) => (file.data as { kind?: unknown }).kind === 'music'),
  );
  it.each(zones)(
    'ships $name with $boss ($code): 3–6 minutes, checkpoints, its own tileset, songs and ending themes',
    (zone) => {
      const stage = stageOf(zone.id);
      expect(stage.name).toBe(zone.name);
      expect(stage.type).toBe('normal');
      expect(stage.checkpoints.length).toBeGreaterThanOrEqual(4);
      expect(stage.tilemap?.tileset).toBe(zone.tileset);
      const boss = bossOf(stage);
      expect(boss?.code).toBe(zone.code);
      expect(boss?.displayName).toBe(zone.boss);
      const warning = stage.events.find((e) => e.type === 'warning');
      const ticks = scrollTicksToWarning(stage);
      expect(ticks / 60).toBeGreaterThanOrEqual(2.5 * 60);
      expect(ticks / 60).toBeLessThanOrEqual(4.5 * 60);
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
      expect(stage.directItems?.length).toBeGreaterThanOrEqual(20);
      // Its own stage theme, the final boss theme (FinalBoss) and — a final zone — the ending and
      // credits themes, all in the set the host prepares for the zone.
      const table = resolveMusicCues(music, zone.id);
      const letter = zone.id.slice(-1);
      expect(stage.music.bossId).toBe(MUSIC_CUES.FinalBoss);
      expect(music.tracks[table[MUSIC_CUES.Stage]]?.id).toBe(zone.id);
      expect(music.tracks[table[MUSIC_CUES.FinalBoss]]?.id).toBe(`boss-${letter}`);
      expect(stage.music.endingId).toBe(MUSIC_CUES.Ending);
      expect(stage.music.creditsId).toBe(MUSIC_CUES.Credits);
      expect(music.tracks[table[MUSIC_CUES.Ending]]?.id).toBe('ending');
      expect(music.tracks[table[MUSIC_CUES.Credits]]?.id).toBe('credits');
      expect(stageMusicCues(stage)).toEqual(
        expect.arrayContaining([MUSIC_CUES.Ending, MUSIC_CUES.Credits, MUSIC_CUES.FinalBoss]),
      );
    },
  );

  it.each(zones)('brings 4–6 new enemy types to $name', (zone) => {
    const stage = stageOf(zone.id);
    const earlier = new Set(
      earlierZones.flatMap((id) => [...stageEnemies(db, stageOf(id))].map((i) => db.enemies[i].id)),
    );
    const earlierSprites = new Set(
      [...earlier].map((id) => db.enemies[db.enemyIndex.get(id) ?? -1].sprite),
    );
    const placed = new Set<string>();
    for (const event of stage.events) {
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      const enemy = db.enemies[event.enemyId];
      if (!earlier.has(enemy.id) && !earlierSprites.has(enemy.sprite)) placed.add(enemy.sprite);
    }
    expect(placed.size).toBeGreaterThanOrEqual(4);
    expect(placed.size).toBeLessThanOrEqual(6);
  });

  it('gives IRON CITADEL hatches, laser emitters, moving floors and ceilings, a parade and a real finale', () => {
    const stage = stageOf('zone-h');
    const placed = (script: string): Array<{ ground: string | null; x: number }> =>
      stage.events.flatMap((e) =>
        (e.type === 'spawn' || e.type === 'formation') && db.enemies[e.enemyId].script === script
          ? [{ ground: db.enemies[e.enemyId].ground, x: e.x }]
          : [],
      );
    // Hatches releasing drones, laser emitters projecting lanes: on the floor and on the ceiling.
    const hatches = placed('hatch.spawner');
    expect(hatches.length).toBeGreaterThanOrEqual(3);
    expect(new Set(hatches.map((h) => h.ground))).toEqual(new Set(['floor', 'ceiling']));
    const emitters = placed('emitter.laser');
    expect(emitters.length).toBeGreaterThanOrEqual(4);
    expect(new Set(emitters.map((h) => h.ground))).toEqual(new Set(['floor', 'ceiling']));
    // Moving floors and ceilings: blocks swinging up and down, out of the floor and the ceiling.
    const pistons = stage.events.filter((e) => e.type === 'block' && (e.dy ?? 0) !== 0);
    expect(pistons.length).toBeGreaterThanOrEqual(8);
    const low = pistons.filter((e) => e.type === 'block' && e.y > PLAYFIELD_H / 2);
    expect(low.length).toBeGreaterThanOrEqual(3);
    expect(pistons.length - low.length).toBeGreaterThanOrEqual(3);
    // The parade: four earlier bosses in reduced form, captains one after another, each leaving
    // after its time limit — every sprite an earlier zone boss's, fewer parts than the original.
    const earlierBosses = earlierZones.map((id) => bossOf(stageOf(id)));
    const earlierSprites = new Set(
      earlierBosses.flatMap((b) => (b?.parts ?? []).map((p) => p.sprite ?? '')),
    );
    const parade = stage.events.filter(
      (e) => e.type === 'boss' && db.enemies[e.enemyId].boss?.role === 'captain',
    );
    expect(parade.length).toBeGreaterThanOrEqual(4);
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    for (const event of parade) {
      if (event.type !== 'boss') continue;
      const echo = db.enemies[event.enemyId].boss;
      expect(echo?.timeLimit ?? 0).toBeGreaterThan(0);
      expect(event.x).toBeLessThan(warningX);
      const sprites = (echo?.parts ?? []).flatMap((p) =>
        p.sprite === undefined ? [] : [p.sprite],
      );
      expect(sprites.length).toBeGreaterThan(0);
      for (const sprite of sprites) expect(earlierSprites, sprite).toContain(sprite);
      const original = earlierBosses.find((b) =>
        (b?.parts ?? []).some((p) => p.sprite === sprites[0]),
      );
      expect(echo?.parts.length ?? 0).toBeLessThan(original?.parts.length ?? 0);
    }
    // Spread out one after another: the next comes at least half its predecessor's stay (intro +
    // time limit, at the parade's scroll speed) later — never more than two up at once.
    const keys = stage.camera.filter((k) => k.x <= parade[0].x);
    const speed = keys[keys.length - 1].speed;
    expect(speed).toBeLessThan(v1speed(0.75)); // a slow hangar
    for (let i = 1; i < parade.length; i++) {
      const before = parade[i - 1];
      const limit = before.type === 'boss' ? db.enemies[before.enemyId].boss : null;
      expect(parade[i].x - before.x).toBeGreaterThanOrEqual(
        ((limit?.timeLimit ?? 0) + (limit?.introTicks ?? 0)) * speed * 0.5,
      );
    }
    // IRON SOVEREIGN: four phases of `boss.sovereign` — the core behind plates, a turning shield
    // wheel on it, lane emitters, and a spiral in the last phase.
    const boss = bossOf(stage);
    expect(boss?.phases.length).toBeGreaterThanOrEqual(4);
    expect(boss?.phases.every((p) => p.script === 'boss.sovereign')).toBe(true);
    const parts = boss?.parts ?? [];
    const core = parts.find((p) => p.core);
    expect(core?.vulnerable).toBe('afterParts');
    for (const name of core?.requires ?? []) {
      const plate = parts.find((p) => p.name === name);
      expect((plate?.x ?? 0) + (plate?.hurtbox?.hw ?? 0)).toBeLessThan(core?.x ?? 0);
    }
    const coreIndex = parts.indexOf(core ?? parts[0]);
    const hub = parts.findIndex(
      (p) => p.parentIndex === coreIndex && p.hurtbox === null && p.radius === 0,
    );
    expect(hub).toBeGreaterThanOrEqual(0);
    const pods = parts.filter((p) => p.parentIndex === hub);
    expect(pods.length).toBeGreaterThanOrEqual(4);
    for (const pod of pods) expect([pod.vulnerable, pod.radius > 0]).toEqual(['never', true]);
    expect(parts.filter((p) => p.gun).length).toBeGreaterThanOrEqual(2);
    const phases = boss?.phases ?? [];
    expect(phases[0].until?.partsDestroyed?.length ?? 0).toBeGreaterThan(0);
    expect(phases[phases.length - 1].params.spiral ?? 0).toBeGreaterThan(0);
    expect(phases.some((p) => (p.params.spin ?? 0) !== 0)).toBe(true);
    expect(phases.some((p) => (p.params.launchTicks ?? 0) > 0)).toBe(true);
  });

  it.each(zones)('keeps every aimed bullet of $name at 2 px/tick or less', (zone) => {
    const speeds: number[] = [];
    for (const index of zoneEnemies(stageOf(zone.id))) {
      const enemy = db.enemies[index];
      for (const phase of enemy.boss?.phases ?? []) {
        const params = { ...DEFAULT_BOSS_BEHAVIORS.get(phase.script)?.params, ...phase.params };
        for (const key of ['bulletSpeed', 'ringSpeed', 'spiralSpeed']) {
          if (key in params) speeds.push(params[key]);
        }
      }
      if (enemy.boss !== null) continue;
      const params = { ...DEFAULT_BEHAVIORS.get(enemy.script)?.params, ...enemy.params };
      if ('bulletSpeed' in params) speeds.push(params.bulletSpeed);
      if (['rocket.homing', 'rammer.aimed', 'cell.chase'].includes(enemy.script))
        speeds.push(params.speed);
    }
    expect(speeds.length).toBeGreaterThanOrEqual(6);
    for (const speed of speeds) expect(speed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
  });

  it.each(zones)(
    'places the capsules of $name for recovery: ≥ 12 before the boss, ≥ 3 after every checkpoint',
    (zone) => {
      const stage = stageOf(zone.id);
      const sources = capsuleSources(db, stage);
      const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
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
    const map = createGame(createHeadlessPlatform(), { seed: 1, stage: zone.id }, db).world.terrain;
    if (map === null) throw new Error('no terrain');
    let ground = 0;
    for (const event of stage.events) {
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      const enemy = db.enemies[event.enemyId];
      if (enemy.ground === null) continue;
      ground++;
      const x = event.x + (event.screenX ?? DEFAULT_SPAWN_SCREEN_X);
      const rows =
        enemy.ground === 'floor'
          ? [PLAYFIELD_H - 1, PLAYFIELD_H - map.tileSize]
          : [0, map.tileSize - 1];
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
      const fought = new Set<string>();
      // The ARK is a raid with a time limit: a bare ship cannot bring its heart down before it
      // escapes, so zone I's fight is flown fully powered (its escape is another ending).
      const run = runStage(zone.id, fourWayBot(), {
        config: zone.id === 'zone-i' ? { loadout: 'full' } : {},
        godMode: true,
        stageSkip: 'boss',
        observe(world) {
          rules.observe(world);
          for (const boss of world.bosses.slots) {
            if (boss.state === BossState.Fight && boss.role === 0) {
              fought.add(`${db.enemies[boss.specIndex].id}:${String(boss.phase)}`);
            }
          }
        },
      });
      expect(run.status).toBe('stageClear');
      expect(run.bossDefeated).toBe(true);
      const bosses = new Set([...fought].map((key) => key.split(':')[0]));
      for (const id of bosses) {
        const phases = db.enemies[db.enemyIndex.get(id) ?? -1].boss?.phases.length ?? 0;
        expect(
          [...fought].filter((key) => key.startsWith(id + ':')),
          id,
        ).toHaveLength(phases);
      }
      // Zone I's final blast reveals the king: both bosses fought through every phase.
      expect(bosses.size).toBe(zone.id === 'zone-i' ? 2 : 1);
      expect(rules.violations).toEqual([]);
      expect(rules.maxBulletSpeed).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
      expect(rules.narrowestGap).toBeGreaterThanOrEqual(MIN_LANE_GAP);
    },
  );
});
