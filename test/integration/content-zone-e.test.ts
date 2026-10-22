/**
 * Zone E (TEMPEST RIDGE) content tests — the zone's cases split verbatim out of
 * `content.test.ts`' zones B–G suite by R5-P.P2b (one file per zone, so an R5 zone lane never
 * shares a test file with another zone). The suite title and every case title are the ones the
 * single file's `it.each` tables produced; the shared fixtures ride in `zones/helpers.ts`.
 */
import {
  BossState,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
  DEFAULT_SPAWN_SCREEN_X,
  MAX_BOSS_PARTS,
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
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import {
  ZONES_B_G,
  boundsOf,
  capsuleSources,
  contractPx,
  placedIn as placedInOf,
  scrollTicksToWarning,
  shippedDb,
  shippedFiles,
  stageEnemies,
  stageOf as stageOfIn,
  zoneEnemies as zoneEnemiesOf,
} from './zones/helpers.js';
import { zoneEContract } from './zones/zone-e.contract.js';

describe('integration: zones B–G hold to the plan and the 4-way design rules (M2-11 … M2-13)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => stageOfIn(db, id);
  const zoneEnemies = (stage: StageSpec): Set<number> => zoneEnemiesOf(db, stage);
  const placedIn = (ids: readonly string[]): Set<string> => placedInOf(db, ids);
  const zoneA = new Set(
    [...stageEnemies(db, stageOf('zone-a'))].map((index) => db.enemies[index].id),
  );
  // Zone e's single row: the shared `it.each` templates re-substitute into the very case
  // titles the six-zone table produced in `content.test.ts`.
  const zones = ZONES_B_G.filter((zone) => zone.id === 'zone-e');
  // The zone content contract, live branch (R5-P.P6).
  const b = boundsOf(zoneEContract);
  it.each(zones)(
    'ships $name with $boss ($code): 3–6 minutes, checkpoints, its own tileset and songs',
    (zone) => {
      const stage = stageOf(zone.id);
      expect(stage.name).toBe(zone.name);
      expect(stage.type).toBe('normal');
      if (b.checkpointsMin !== null)
        expect(stage.checkpoints.length).toBeGreaterThanOrEqual(b.checkpointsMin);
      expect(stage.tilemap?.tileset).toBe(zone.tileset);
      const warning = stage.events.find((e) => e.type === 'warning');
      const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
      expect(boss?.code).toBe(zone.code);
      expect(boss?.displayName).toBe(zone.boss);
      expect(boss?.phases).toHaveLength(3);
      // The scroll takes 2.5–4.5 minutes to the WARNING; the fight brings the run to 3–6 minutes.
      const ticks = scrollTicksToWarning(stage);
      expect(ticks / 60).toBeGreaterThanOrEqual(b.scrollSec[0]);
      expect(ticks / 60).toBeLessThanOrEqual(b.scrollSec[1]);
      if (b.lengthPx !== null) {
        expect(stage.length).toBeGreaterThanOrEqual(contractPx(zoneEContract, b.lengthPx[0]));
        expect(stage.length).toBeLessThanOrEqual(contractPx(zoneEContract, b.lengthPx[1]));
      }
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
      expect(stage.directItems?.length).toBeGreaterThanOrEqual(b.directItems[0]);
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
    if (b.newTypesBySprite !== null) {
      expect(placed.size).toBeGreaterThanOrEqual(b.newTypesBySprite[0]);
      expect(placed.size).toBeLessThanOrEqual(b.newTypesBySprite[1]);
    }
  });

  it('gives TEMPEST RIDGE rear attackers, heavy weather, jagged ridges and a seahorse launching homing minis', () => {
    const stage = stageOf('zone-e');
    // Rear attackers: enemies spawned behind the view that overtake the ship.
    const rear = stage.events.filter(
      (e) =>
        (e.type === 'spawn' || e.type === 'formation') && (e.screenX ?? DEFAULT_SPAWN_SCREEN_X) < 0,
    );
    expect(rear.length).toBeGreaterThanOrEqual(12);
    expect(rear.some((e) => 'enemyId' in e && db.enemies[e.enemyId].script === 'rear.swoop')).toBe(
      true,
    );
    expect(rear.some((e) => 'enemyId' in e && db.enemies[e.enemyId].script === 'fan.loop')).toBe(
      true,
    );
    // Heavy weather: several cloud and rain bands, the clouds roiling (a palette cycle, a wave).
    expect(stage.parallax.length).toBeGreaterThanOrEqual(5);
    expect(stage.cycles.some((c) => c.layer === 'far')).toBe(true);
    expect(stage.raster.some((r) => r.kind === 'wave')).toBe(true);
    // Jagged mountains: floors whose waves are steep (amplitude ≥ a tenth of the wavelength).
    const floors = stage.tilemap?.generator?.segments.map((seg) => seg.floor) ?? [];
    expect(
      floors.filter((f) => f !== undefined && f.amp / f.period >= 0.1).length,
    ).toBeGreaterThanOrEqual(3);
    // SQUALL STEED: a chest (the core) that opens, homing minis launched from it.
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.phases.every((p) => p.script === 'boss.steed')).toBe(true);
    expect(boss?.parts.find((p) => p.core)?.vulnerable).toBe('whenOpen');
    expect(db.enemies[boss?.minionId ?? -1]?.script).toBe('rocket.homing');
    for (const phase of boss?.phases ?? []) expect(phase.params.minis ?? 2).toBeGreaterThan(0);
  });

  it('keeps the rebuilt SQUALL STEED inside the bible height with a reachable core (R5-05.S4b)', () => {
    const stage = stageOf('zone-e');
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss).not.toBeNull();
    if (boss === null) return;
    // Design §8: the eight v1 parts plus mane, crest and the two flanks — twelve, inside the cap.
    expect(boss.parts.length).toBe(12);
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
    // Design §8's own arithmetic: the whole tree rides the P3 bob, so the static extent plus
    // twice the largest ry (27 — 147 + 54 = 201 at the 202-px line) must still fit.
    const maxRy = Math.max(...boss.phases.map((p) => p.params.ry ?? 0));
    expect(maxY - minY + 2 * maxRy).toBeLessThanOrEqual(Math.round(0.6 * PLAYFIELD_H));
    // The core stays reachable: not armour itself, and no part it requires is armour.
    const core = boss.parts.find((p) => p.core);
    expect(core).not.toBeUndefined();
    expect(core?.vulnerable).not.toBe('never');
    const byName = new Map(boss.parts.map((p) => [p.name, p]));
    for (const name of core?.requires ?? []) {
      expect(byName.get(name)?.vulnerable, name).not.toBe('never');
    }
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
      expect(sources.filter((x) => x < warningX).length).toBeGreaterThanOrEqual(
        b.capsulesBeforeWarning[0],
      );
      for (const checkpoint of stage.checkpoints) {
        const after = sources.filter(
          (x) => x >= checkpoint.x && x < checkpoint.x + b.capsuleWindow.px,
        );
        expect(after.length, `checkpoint ${String(checkpoint.x)}`).toBeGreaterThanOrEqual(
          b.capsuleWindow.min,
        );
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
