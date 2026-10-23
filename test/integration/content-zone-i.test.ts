/**
 * Zone I (ABYSSAL THRONE) content tests — the finale zone's cases split verbatim out of
 * `content.test.ts`' zones H / I suite by R5-P.P2b (one file per zone, so an R5 zone lane never
 * shares a test file with another zone). The suite title and every case title are the ones the
 * single file's `it.each` tables produced; the shared fixtures ride in `zones/helpers.ts`.
 */
import {
  BossState,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
  DEFAULT_SPAWN_SCREEN_X,
  MAX_ENDING_TEXT_LINES,
  MUSIC_CUES,
  PLAYFIELD_H,
  PLAYFIELD_W,
  RunFlag,
  TerrainType,
  createGame,
  createHeadlessPlatform,
  creditsLineCount,
  selectCampaignEnding,
  terrainAt,
  type BossSpec,
  type StageSpec,
} from '@shmup/core';
import { loadMusicContent, resolveMusicCues, stageMusicCues } from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { runStage } from '../playtest/harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from '../playtest/rules.js';
import { PROCEDURAL_GENERATORS } from '../../scripts/assets/procedural/index.mjs';
import { collectSprites } from '../../scripts/assets/pipeline.mjs';
import {
  ZONES_H_I,
  bossOf as bossOfIn,
  boundsOf,
  capsuleSources,
  contractPx,
  scrollTicksToWarning,
  shippedDb,
  shippedFiles,
  stageEnemies,
  stageOf as stageOfIn,
  zoneEnemies as zoneEnemiesOf,
} from './zones/helpers.js';
import { zoneIContract } from './zones/zone-i.contract.js';

describe('integration: zones H and I, the finales, hold to the plan and the 4-way rules (M2-14)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => stageOfIn(db, id);
  const bossOf = (stage: StageSpec): BossSpec | null => bossOfIn(db, stage);
  const zoneEnemies = (stage: StageSpec): Set<number> => zoneEnemiesOf(db, stage);
  const earlierZones = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((z) => 'zone-' + z);
  // Zone i's single row: the shared `it.each` templates re-substitute into the very case
  // titles the two-zone table produced in `content.test.ts`.
  const zones = ZONES_H_I.filter((zone) => zone.id === 'zone-i');
  // The zone content contract, live branch (R5-P.P6).
  const b = boundsOf(zoneIContract);
  const { content: music } = loadMusicContent(
    shippedFiles.filter((file) => (file.data as { kind?: unknown }).kind === 'music'),
  );
  it.each(zones)(
    'ships $name with $boss ($code): 3–6 minutes, checkpoints, its own tileset, songs and ending themes',
    (zone) => {
      const stage = stageOf(zone.id);
      expect(stage.name).toBe(zone.name);
      expect(stage.type).toBe('normal');
      if (b.checkpointsMin !== null)
        expect(stage.checkpoints.length).toBeGreaterThanOrEqual(b.checkpointsMin);
      expect(stage.tilemap?.tileset).toBe(zone.tileset);
      const boss = bossOf(stage);
      expect(boss?.code).toBe(zone.code);
      expect(boss?.displayName).toBe(zone.boss);
      const warning = stage.events.find((e) => e.type === 'warning');
      const ticks = scrollTicksToWarning(stage);
      expect(ticks / 60).toBeGreaterThanOrEqual(b.scrollSec[0]);
      expect(ticks / 60).toBeLessThanOrEqual(b.scrollSec[1]);
      if (b.lengthPx !== null) {
        expect(stage.length).toBeGreaterThanOrEqual(contractPx(zoneIContract, b.lengthPx[0]));
        expect(stage.length).toBeLessThanOrEqual(contractPx(zoneIContract, b.lengthPx[1]));
      }
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
      expect(stage.directItems?.length).toBeGreaterThanOrEqual(b.directItems[0]);
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
    if (b.newTypesBySprite !== null) {
      expect(placed.size).toBeGreaterThanOrEqual(b.newTypesBySprite[0]);
      expect(placed.size).toBeLessThanOrEqual(b.newTypesBySprite[1]);
    }
  });

  it('gives ABYSSAL THRONE mines, trench eels, a whale-class raid and a boss inside it', () => {
    const stage = stageOf('zone-i');
    const count = (script: string): number =>
      stage.events.filter(
        (e) =>
          (e.type === 'spawn' || e.type === 'formation') && db.enemies[e.enemyId].script === script,
      ).length;
    expect(count('mine.burst')).toBeGreaterThanOrEqual(10);
    expect(count('worm.burst')).toBeGreaterThanOrEqual(4);
    expect(count('pattern.loop')).toBeGreaterThanOrEqual(3);
    // The ABYSS ARK: a raid (the camera flies round it), turret rows above and below its keel,
    // hooks (a homing minion), a time limit (its escape is the `bossEscaped` ending) and a boss
    // inside it.
    const ark = bossOf(stage);
    expect(ark?.raid?.segments.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(ark?.timeLimit ?? 0).toBeGreaterThan(0);
    expect(ark?.phases.every((p) => p.script === 'boss.ark')).toBe(true);
    expect(db.enemies[ark?.minionId ?? -1]?.script).toBe('rocket.homing');
    const guns = (ark?.parts ?? []).filter((p) => p.gun);
    expect(guns.length).toBeGreaterThanOrEqual(6);
    expect(guns.filter((p) => p.y < 0).length).toBeGreaterThanOrEqual(3);
    expect(guns.filter((p) => p.y > 0).length).toBeGreaterThanOrEqual(3);
    for (const gun of guns) expect(gun.turn).toBeGreaterThan(1); // heading frames
    // Open water round the raid: no terrain from the calm on (the camera pans up and down).
    const map = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-i' }, db).world
      .terrain;
    if (map === null) throw new Error('no terrain');
    const calmX = stage.camera[stage.camera.length - 1].x;
    for (let x = calmX; x < stage.length + PLAYFIELD_W; x += 8) {
      for (let y = 0; y < PLAYFIELD_H; y += map.tileSize) {
        expect(terrainAt(map, x, y), `rock at ${String(x)}, ${String(y)}`).toBe(TerrainType.Empty);
      }
    }
    // THE HOLLOW KING inside it: an anglerfish — a mouth that opens (the core) with jaws on it and a
    // lure (a chain of circle-hit parts hung from its body, a gun at its end), three phases.
    const king = db.enemies[ark?.innerId ?? -1]?.boss ?? null;
    expect(king?.code).toBe('HK-10');
    expect(king?.phases).toHaveLength(3);
    expect(king?.phases.every((p) => p.script === 'boss.angler')).toBe(true);
    const parts = king?.parts ?? [];
    const core = parts.findIndex((p) => p.core);
    expect(parts[core]?.vulnerable).toBe('whenOpen');
    expect(parts.filter((p) => p.parentIndex === core && p.hurtbox !== null)).toHaveLength(2);
    const lure = parts.filter((p) => p.radius > 0 && p.parentIndex >= 0);
    expect(lure.length).toBeGreaterThanOrEqual(3);
    const root = lure.find((p) => !(parts[p.parentIndex].radius > 0));
    expect(root).toBeDefined();
    expect(parts[root?.parentIndex ?? core].core).toBe(false);
    expect(lure.some((p) => p.gun)).toBe(true);
  });

  it('dives two playfields deep — three pans inside holds, the calm ride at the top (R5-09.S5a)', () => {
    const stage = stageOf('zone-i');
    // A map of 56 rows (672 px, the playfield 336, so the deepest camera y 672 − 336 = 336);
    // the design's dive (R5-09.S5a §2) is 168 into the trench, 312 onto the abyssal plain,
    // and back to 0 for the ascent — each pan lives inside a hold, the calm ride through
    // the ark fight runs at the top of the water.
    expect(stage.tilemap?.rowsTall ?? 0).toBe(56);
    expect(stage.length).toBe(20400);
    const pans = stage.camera.filter((k) => k.yTo !== undefined);
    expect(pans.map((k) => k.yTo ?? -1)).toEqual([168, 312, 0]);
    for (const pan of pans) {
      expect(pan.hold ?? 0).toBeGreaterThan(0);
      expect(pan.yTicks ?? 0).toBe(pan.hold ?? 0); // the whole hold is the pan (design §2)
    }
    // The rise-to-0 key is the last pan and sits before the calm key and the ark's band.
    expect(pans[pans.length - 1]?.x).toBe(12300);
    expect(stage.camera[stage.camera.length - 1].x).toBe(18000);
    expect(stage.camera.filter((k) => k.x > 12300 && k.yTo !== undefined && k.yTo !== 0)).toEqual(
      [],
    );
  });

  it('stands the coral columns and the buttresses on the plain, the gullies free of destructibles (R5-09.S5a)', () => {
    const stage = stageOf('zone-i');
    const tileset = db.tilesets.find((t) => t.id === stage.tilemap?.tileset);
    expect(tileset?.tiles).toHaveLength(22); // 20 frozen + the design's two appends (§10)
    const tokenOf = (name: string): number =>
      (tileset?.tiles.findIndex((t) => t.name === name) ?? -2) + 1;
    const coral = tokenOf('coral');
    const glow = tokenOf('abyss-glow');
    expect(coral).toBe(21);
    expect(glow).toBe(22);
    expect(tileset?.tiles[coral - 1]?.hp ?? 0).toBe(6); // punch: six player hits (§10)
    expect(tileset?.tiles[coral - 1]?.score ?? 0).toBe(12);
    expect(tileset?.tiles[glow - 1]?.hp ?? 0).toBe(0); // the gas glimmer never collides
    /** The cells of one authored RLE row (`<id>` / `<count>*<id>`, 0 empty). */
    const cells = (row: number): number[] => {
      const out: number[] = [];
      for (const token of (stage.tilemap?.rle?.[row] ?? '').split(',')) {
        const star = token.indexOf('*');
        const n = Number(star < 0 ? 1 : token.slice(0, star));
        const id = Number(star < 0 ? token : token.slice(star + 1));
        for (let i = 0; i < n; i++) out.push(id);
      }
      return out;
    };
    // The shelf lip: a solid (token 1) run at map rows 26–27 from column 13 to 1,024 —
    // x 156 to 12,300, under every banded segment (design §10).
    for (const row of [26, 27]) {
      const line = cells(row);
      expect(line).toHaveLength(1025);
      expect(line.slice(0, 13).every((c) => c === 0)).toBe(true);
      for (let col = 13; col < 1025; col++) expect(line[col]).toBe(1);
    }
    // The four coral columns (design §3): 12 px thick at x 7,080 / 7,560 / 8,040 / 8,520,
    // map rows 44–49, each with open water (≥ 24 px = two columns) on both sides.
    for (const col of [590, 630, 670, 710]) {
      for (let row = 44; row < 50; row++) expect(cells(row)[col]).toBe(coral);
      for (const open of [col - 2, col - 1, col + 1, col + 2]) {
        for (let row = 44; row < 50; row++) expect(cells(row)[open] ?? 0).toBe(0);
      }
    }
    // The buttresses framing the hermit's antechamber (§3): solid pairs at columns
    // 700–701 / 737–738 (x 8,400 / 8,844…8,868 around the design's 8,850) rows 44–53,
    // their heads crowned by the empty-type glow at row 43.
    for (let row = 44; row < 54; row++) {
      for (const col of [700, 701, 737, 738]) expect(cells(row)[col]).toBe(1);
    }
    for (const col of [700, 701, 737, 738]) expect(cells(43)[col]).toBe(glow);
    // The undertow's carved gullies carry NO destructibles (§3): the whole band x 9,300 →
    // 12,300 (columns 775 → 1,024) has no brick (18), cube (19) or tissue (20) cell authored.
    for (let row = 0; row < 56; row++) {
      for (const cell of cells(row).slice(775, 1025)) {
        expect(cell === 18 || cell === 19 || cell === 20).toBe(false);
      }
    }
    // And past the ascent (column of x 12,300 → the map end) nothing is authored at all:
    // the void segment (base 0) holds the open-water case's promise literally.
    for (let row = 0; row < 56; row++)
      expect(
        cells(row)
          .slice(1025)
          .every((c) => c === 0),
      ).toBe(true);
  });

  it('keeps the two rebuilt finale bosses within 60 % of the playfield and their cores reachable', () => {
    const stage = stageOf('zone-i');
    const ark = bossOf(stage);
    if (ark === null) throw new Error('no ABYSS ARK boss event');
    const king = db.enemies[ark.innerId ?? -1]?.boss ?? null;
    if (king === null) throw new Error('no boss inside the ABYSS ARK');
    // R5-09.S4b (design §8) — the plates' own assembly (scripts/doc-images.mjs): a part sits
    // at the sum of its parent chain's offsets and its first frame spans ±floor(h / 2) there.
    const frames = new Map<string, { height: number }>();
    for (const sprite of collectSprites().sprites) frames.set(sprite.name, sprite.frames[0]);
    /**
     * The tallest vertical extent of a boss, assembled from its parts' first frames.
     *
     * @param boss - The compiled boss spec.
     * @returns Pixels.
     */
    const assembledHeight = (boss: BossSpec): number => {
      const anchor = new Map<string, number>();
      let top = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (const p of boss.parts) {
        const y = (p.parent === null ? 0 : (anchor.get(p.parent) ?? 0)) + p.y;
        anchor.set(p.name, y);
        const frame = p.sprite === undefined ? undefined : frames.get(p.sprite);
        if (frame === undefined) continue;
        const half = Math.floor(frame.height / 2);
        top = Math.min(top, y - half);
        bottom = Math.max(bottom, y + frame.height - half);
      }
      return bottom - top;
    };
    // 60 % of the playfield — 202 px at 640×336; the pods' ±67.5 and the fins' ±76.5 lie in it.
    expect(assembledHeight(ark)).toBeLessThanOrEqual(Math.round(0.6 * PLAYFIELD_H));
    expect(assembledHeight(king)).toBeLessThanOrEqual(Math.round(0.6 * PLAYFIELD_H));
    // Reachable cores: the heart and the maw are hittable, and nothing they `require` is a
    // `never` part (a required armour that can never break would wall the core off for good).
    for (const boss of [ark, king]) {
      const core = boss.parts.find((p) => p.core);
      if (core === undefined) throw new Error(boss.code + ' has no core');
      expect(core.vulnerable).not.toBe('never');
      for (const name of core.requires) {
        const required = boss.parts.find((p) => p.name === name);
        if (required === undefined) throw new Error(boss.code + ' requires ' + name + ': no part');
        expect(required.vulnerable).not.toBe('never');
      }
    }
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

  it('gives each final zone its scene and epilogue per ending, the no-death variant first (ending selection)', () => {
    const campaign = db.campaign;
    if (campaign === null) throw new Error('no campaign');
    const scenes = { h: 'citadel', i: 'abyss' } as const;
    for (const zone of ['h', 'i'] as const) {
      const endings = campaign.endings.filter((e) => e.zone === zone);
      expect(endings[0].all).toEqual(['noDeath']);
      expect(endings[endings.length - 1].all).toEqual([]);
      for (const ending of endings) {
        expect(ending.scene, ending.id).toBe(scenes[zone]);
        expect(ending.text.length, ending.id).toBeGreaterThanOrEqual(3);
        expect(ending.text.length, ending.id).toBeLessThanOrEqual(MAX_ENDING_TEXT_LINES);
      }
    }
    // Zone I's flawless epilogue has the Hollow King sink with its ARK: an escape (the King never
    // shows) must not reach it, however flawless the run.
    expect(campaign.endings.find((e) => e.id === 'throne-flawless')?.none).toEqual(['bossEscaped']);
    // Selection under all 16 flag masks: an escape (zone I) gets the flagship's ending whatever
    // else, a flawless run the flawless ending, everything else the plain one.
    const h = campaign.zones.findIndex((z) => z.id === 'h');
    const i = campaign.zones.findIndex((z) => z.id === 'i');
    for (let flags = 0; flags < 16; flags++) {
      const noDeath = (flags & RunFlag.NoDeath) !== 0;
      const escaped = (flags & RunFlag.BossEscaped) !== 0;
      expect(selectCampaignEnding(campaign, h, flags)?.id).toBe(
        noDeath ? 'citadel-flawless' : 'citadel',
      );
      expect(selectCampaignEnding(campaign, i, flags)?.id).toBe(
        escaped ? 'throne-escape' : noDeath ? 'throne-flawless' : 'throne',
      );
    }
  });

  it('rolls credits that list every placeholder-asset generator, the zones and the bosses', () => {
    const campaign = db.campaign;
    if (campaign === null) throw new Error('no campaign');
    expect(campaign.credits.length).toBeGreaterThanOrEqual(6);
    const text = campaign.credits.flatMap((s) => [s.title, ...s.lines]).join('\n');
    for (const generator of PROCEDURAL_GENERATORS) expect(text).toContain(generator.id + '.mjs');
    for (const zone of campaign.zones) expect(text).toContain(zone.name);
    for (const id of ['zone-a', ...earlierZones.slice(1), 'zone-h']) {
      expect(text).toContain(bossOf(stageOf(id))?.displayName ?? '?');
    }
    expect(text).toContain('THE HOLLOW KING');
    expect(creditsLineCount(campaign.credits)).toBeGreaterThanOrEqual(40);
  });
});
