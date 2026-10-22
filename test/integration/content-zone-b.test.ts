/**
 * Zone B (BRINE NEBULA) content tests — the zone's cases split verbatim out of
 * `content.test.ts`' zones B–G suite by R5-P.P2a (one file per zone, so an R5 zone lane never
 * shares a test file with another zone). The suite title and every case title are the ones the
 * single file's `it.each` tables produced; the shared fixtures ride in `zones/helpers.ts`.
 */
import {
  BossState,
  DEFAULT_BEHAVIORS,
  DEFAULT_BLOCK_SCREEN_X,
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
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { runStage } from '../playtest/harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from '../playtest/rules.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';
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
import { zoneBContract } from './zones/zone-b.contract.js';

describe('integration: zones B–G hold to the plan and the 4-way design rules (M2-11 … M2-13)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => stageOfIn(db, id);
  const zoneEnemies = (stage: StageSpec): Set<number> => zoneEnemiesOf(db, stage);
  const placedIn = (ids: readonly string[]): Set<string> => placedInOf(db, ids);
  const zoneA = new Set(
    [...stageEnemies(db, stageOf('zone-a'))].map((index) => db.enemies[index].id),
  );
  // Zone b's single row: the shared `it.each` templates re-substitute into the very case
  // titles the six-zone table produced in `content.test.ts`.
  const zones = ZONES_B_G.filter((zone) => zone.id === 'zone-b');
  // The zone content contract, live branch (R5-P.P6).
  const b = boundsOf(zoneBContract);
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
        expect(stage.length).toBeGreaterThanOrEqual(contractPx(zoneBContract, b.lengthPx[0]));
        expect(stage.length).toBeLessThanOrEqual(contractPx(zoneBContract, b.lengthPx[1]));
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

  it('gives BRINE NEBULA its bubbles, a fish inside a bubble, wavy water, a mid-boss and a hidden bonus stage', () => {
    const stage = stageOf('zone-b');
    const used = [...zoneEnemies(stage)].map((index) => db.enemies[index]);
    const bubbles = used.filter((e) => e.script === 'bubble.split');
    // Splitting bubbles (a bubble whose child is a bubble) and an enemy inside one.
    expect(
      bubbles.some((e) => e.childId >= 0 && db.enemies[e.childId].script === 'bubble.split'),
    ).toBe(true);
    expect(
      bubbles.some((e) => e.childId >= 0 && db.enemies[e.childId].script !== 'bubble.split'),
    ).toBe(true);
    // Wavy raster water on the sea band, its colours cycling.
    expect(stage.raster.some((r) => r.kind === 'wave' && r.layer === 'mid')).toBe(true);
    expect(stage.cycles).toHaveLength(1);
    // The mid-boss: a captain flying in with a `boss` event before the second half.
    const captains = stage.events.filter(
      (e) => e.type === 'boss' && db.enemies[e.enemyId].boss?.role === 'captain',
    );
    expect(captains).toHaveLength(1);
    expect(captains[0].x).toBeLessThan(stage.length / 2);
    // The boss: a mechanical fish with a mouth that opens (the core) and homing rockets.
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.parts.find((p) => p.core)?.vulnerable).toBe('whenOpen');
    expect(boss?.phases.every((p) => p.script === 'boss.maw')).toBe(true);
    expect(db.enemies[boss?.minionId ?? -1]?.script).toBe('rocket.homing');
    // One hidden bonus stage: a gap entrance marked by two blocks, into a bonus stage.
    const entrances = stage.events.filter((e) => e.type === 'bonus');
    expect(entrances).toHaveLength(1);
    const entrance = entrances[0];
    if (entrance.type !== 'bonus') return;
    expect(entrance.entrance).toBe('gap');
    expect(stageOf(entrance.stage).type).toBe('bonus');
    const region = entrance.region;
    expect(region).not.toBeNull();
    if (region === null || region === undefined) return;
    const edges = stage.events
      .filter((e) => e.type === 'block')
      .map((e) => (e.type === 'block' ? e.x + (e.screenX ?? DEFAULT_BLOCK_SCREEN_X) : 0));
    expect(edges).toContain(region.x - v1x(16));
    expect(edges).toContain(region.x + region.w);
    // The bonus stage: bonus capsules and a 1UP.
    const grotto = stageOf(entrance.stage);
    const drops = [...stageEnemies(db, grotto)].map((index) => db.enemies[index].drop);
    expect(drops).toContain('bonusCapsule');
    expect(drops).toContain('oneUp');
  });

  // R5-02.S4b — the design §8 rebuild: the taller part tree still fits the screen, and the
  // core stays reachable (S6's god-mode run, which must shoot the boss down, is the real proof).
  it('keeps the rebuilt GALVANIC MAW under 60 % of the playfield with a reachable core', () => {
    const boss = db.enemies[db.enemyIndex.get('galvanic-maw') ?? -1].boss;
    expect(boss).not.toBeNull();
    if (boss === null) return;
    expect(boss.parts.length).toBeLessThanOrEqual(MAX_BOSS_PARTS);
    // The assembled height, exactly as `scripts/doc-images.mjs` assembles a boss plate: every
    // part's sprite centred on the sum of its offsets up the parent chain, the frame sizes read
    // from `buildAtlas()`'s manifest (the interim v2 art the portraits are drawn from); the
    // untrimmed extent is the bound — trimming can only make the picture shorter.
    const { manifest } = buildAtlas();
    const anchors = new Map<string, { x: number; y: number }>();
    let top = Infinity;
    let bottom = -Infinity;
    for (const part of boss.parts) {
      const parent = part.parent === null ? null : (anchors.get(part.parent) ?? null);
      const x = (parent?.x ?? 0) + part.x;
      const y = (parent?.y ?? 0) + part.y;
      anchors.set(part.name, { x, y });
      const frame = part.sprite === undefined ? undefined : manifest.frames[part.sprite + '#0'];
      if (frame === undefined) continue;
      const row = Math.round(y) - Math.floor(frame.h / 2);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row + frame.h);
    }
    expect(bottom - top).toBeLessThanOrEqual(Math.round(0.6 * PLAYFIELD_H));
    // A reachable core: some part is the core, it is not `never` vulnerable, and every part its
    // `requires` names exists and is not `never` either (a gate of armoured plates is a wall).
    const byName = new Map(boss.parts.map((p) => [p.name, p]));
    expect(boss.parts.some((p) => p.core)).toBe(true);
    for (const part of boss.parts) {
      if (!part.core) continue;
      expect(part.vulnerable).not.toBe('never');
      for (const need of part.requires) {
        const required = byName.get(need);
        expect(required, `the core requires ${need}`).toBeDefined();
        expect(required?.vulnerable).not.toBe('never');
      }
    }
  });

  // R5-02.S5b — the design §7 refit: the five-part captain tree still fits the screen and the
  // shell stays the reachable core.
  it('keeps the refit SPUME HERALD a five-part captain under 60 % of the playfield, core open', () => {
    const boss = db.enemies[db.enemyIndex.get('spume-herald') ?? -1].boss;
    expect(boss).not.toBeNull();
    if (boss === null) return;
    expect(boss.role).toBe('captain');
    expect(boss.parts.length).toBe(5);
    expect(boss.parts.length).toBeLessThanOrEqual(MAX_BOSS_PARTS);
    // The assembled height with the same doc-images plate math as the MAW case above: the
    // untrimmed extent of the shell, the ∓27 tubes and the ∓40 crown fins on their frame rows.
    const { manifest } = buildAtlas();
    const anchors = new Map<string, { x: number; y: number }>();
    let top = Infinity;
    let bottom = -Infinity;
    for (const part of boss.parts) {
      const parent = part.parent === null ? null : (anchors.get(part.parent) ?? null);
      const x = (parent?.x ?? 0) + part.x;
      const y = (parent?.y ?? 0) + part.y;
      anchors.set(part.name, { x, y });
      const frame = part.sprite === undefined ? undefined : manifest.frames[part.sprite + '#0'];
      if (frame === undefined) continue;
      const row = Math.round(y) - Math.floor(frame.h / 2);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row + frame.h);
    }
    expect(bottom - top).toBeLessThanOrEqual(Math.round(0.6 * PLAYFIELD_H));
    // The shell is the only core and it is always vulnerable; nothing gates it.
    const cores = boss.parts.filter((p) => p.core);
    expect(cores.length).toBe(1);
    expect(cores[0].name).toBe('shell');
    expect(cores[0].vulnerable).toBe('always');
    for (const part of boss.parts) {
      expect(part.vulnerable).not.toBe('never');
      for (const need of part.requires) {
        expect(
          boss.parts.some((p) => p.name === need),
          `the core requires ${need}`,
        ).toBe(true);
      }
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
