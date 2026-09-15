import { describe, expect, it } from 'vitest';
import {
  CONTENT_FORMAT_VERSION,
  CONTENT_KINDS,
  CONTENT_MIGRATIONS,
  EMPTY_CONTENT_DB,
  isContentKind,
  loadContent,
  moduleInfo,
  type ContentFile,
} from '../../src/data/index.js';

/** A minimal valid `player` file. */
const playerFile = (id = 'kestrel', sprite = 'ships/kestrel'): ContentFile => ({
  path: 'player/' + id + '.player.json',
  data: {
    formatVersion: 1,
    kind: 'player',
    ships: [
      {
        id,
        name: id.toUpperCase(),
        sprite,
        speeds: [1.5, 2],
        hurtRadius: 1.5,
        terrainBox: { hw: 5, hh: 3 },
        pickupBox: { hw: 8, hh: 6 },
        margins: { left: 8, right: 8, top: 6, bottom: 6 },
        enterTicks: 40,
        respawnInvulnTicks: 120,
        bankFrames: 1,
      },
    ],
  },
});

/** A minimal valid `weapons` file. */
const weaponsFile = (id = 'shot.basic', sprite = 'shots/basic'): ContentFile => ({
  path: 'weapons/' + id + '.weapons.json',
  data: {
    formatVersion: 1,
    kind: 'weapons',
    weapons: [
      {
        id,
        slot: 'main',
        behavior: 'shot.straight',
        damage: 1,
        speed: 7,
        cap: 2,
        pierce: false,
        sprite,
        sfx: 'PlayerShot',
      },
    ],
    presets: [{ id: 'type-a', missile: null, double: null, laser: id }],
  },
});

/** A minimal valid `enemies` file. */
const enemiesFile = (id = 'drifter'): ContentFile => ({
  path: 'enemies/' + id + '.enemies.json',
  data: {
    formatVersion: 1,
    kind: 'enemies',
    enemies: [
      {
        id,
        hp: 1,
        score: 100,
        hurtbox: { hw: 6, hh: 5 },
        script: 'drifter.sine',
        sprite: 'enemies/' + id,
        drop: null,
      },
    ],
  },
});

/** A minimal valid `paths` file with the path the stage fixture uses. */
const pathsFile = (): ContentFile => ({
  path: 'paths/zone-a.paths.json',
  data: {
    formatVersion: 1,
    kind: 'paths',
    paths: [
      {
        id: 'sine-low',
        points: [
          { x: 0, y: 0 },
          { x: -100, y: 20 },
          { x: -200, y: 0 },
        ],
      },
    ],
  },
});

/** A minimal valid `stage` file referring to `enemy` (and the `sine-low` path). */
const stageFile = (id = 'zone-a', enemy = 'drifter'): ContentFile => ({
  path: 'stages/' + id + '.stage.json',
  data: {
    formatVersion: 1,
    kind: 'stage',
    id,
    name: 'Zone A',
    music: { stage: 'Stage', boss: 'Boss' },
    length: 4096,
    camera: [{ x: 0, speed: 1 }],
    checkpoints: [{ x: 0 }],
    parallax: [{ layer: 'far', sprite: 'bg/stars-far', factor: 0.25, y: 0, spacing: 128 }],
    tilemap: null,
    events: [
      { x: 384, type: 'spawn', enemy, path: 'sine-low' },
      { x: 512, type: 'music', cue: 'Stage' },
      // (A `boss` event would need a boss entry — M1-13; a second spawn keeps the reference.)
      { x: 3840, type: 'spawn', enemy },
    ],
  },
});

describe('core/data module', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('data');
    expect(moduleInfo.status).toBe('partial');
    expect(moduleInfo.specRefs.length).toBeGreaterThan(0);
  });

  it('knows its own kinds', () => {
    expect([...CONTENT_KINDS]).toEqual([
      'player',
      'weapons',
      'enemies',
      'paths',
      'stage',
      'tileset',
      'rules',
      'patterns',
      'campaign',
      'replay',
    ]);
    expect(isContentKind('weapons')).toBe(true);
    expect(isContentKind('replay')).toBe(true);
    expect(isContentKind('campaign')).toBe(true);
    expect(isContentKind('rules')).toBe(true);
    expect(isContentKind('input-profiles')).toBe(false);
  });

  it('ships an empty database for content-less sessions', () => {
    expect(EMPTY_CONTENT_DB.ships).toHaveLength(0);
    expect(EMPTY_CONTENT_DB.sprites.names).toHaveLength(0);
    expect(EMPTY_CONTENT_DB.enemyIndex.size).toBe(0);
    expect(Object.isFrozen(EMPTY_CONTENT_DB)).toBe(true);
  });
});

describe('core/data loadContent', () => {
  it('loads every kind and indexes the entries by id', () => {
    const { db, issues, foreign } = loadContent([
      stageFile(),
      playerFile(),
      weaponsFile(),
      enemiesFile(),
      pathsFile(),
    ]);
    expect(issues).toEqual([]);
    expect(foreign).toEqual([]);
    expect(db.paths[db.pathIndex.get('sine-low') ?? -1]?.table.count).toBeGreaterThan(200);
    expect(db.ships[db.shipIndex.get('kestrel') ?? -1]?.name).toBe('KESTREL');
    expect(db.weapons[0]?.slot).toBe('main');
    expect(db.weaponPresets[0]?.id).toBe('type-a');
    expect(db.enemies[0]?.hp).toBe(1);
    expect(db.stages[0]?.length).toBe(4096);
    expect(db.stageIndex.get('zone-a')).toBe(0);
  });

  it('resolves sprite and script names to deterministic sorted indices', () => {
    const files = [playerFile(), weaponsFile(), enemiesFile()];
    const forward = loadContent(files).db;
    const reversed = loadContent(files.slice().reverse()).db;
    // `ships/kestrel@p2`: player 2's palette swap, interned for every ship (M2-06).
    expect(forward.sprites.names).toEqual([
      'enemies/drifter',
      'ships/kestrel',
      'ships/kestrel@p2',
      'shots/basic',
    ]);
    const withStage = loadContent([...files, stageFile()]).db;
    expect(withStage.sprites.names).toContain('bg/stars-far');
    expect(reversed.sprites.names).toEqual(forward.sprites.names);
    expect(forward.scripts.names).toEqual(['drifter.sine', 'shot.straight']);
    expect(forward.ships[0]?.spriteId).toBe(forward.sprites.index.get('ships/kestrel'));
    expect(forward.ships[0]?.spriteP2Id).toBe(forward.sprites.index.get('ships/kestrel@p2'));
    expect(forward.enemies[0]?.scriptId).toBe(forward.scripts.index.get('drifter.sine'));
    expect(forward.weapons[0]?.behaviorId).toBe(forward.scripts.index.get('shot.straight'));
  });

  it("interns the engine's extra sprites (M1-09) with the content's, sorted and deduplicated", () => {
    const files = [playerFile(), weaponsFile(), enemiesFile()];
    const { db, issues } = loadContent(files, {
      extraSprites: ['bullets/round-pink', 'ships/kestrel', 'aaa/first'],
    });
    expect(issues).toEqual([]);
    expect(db.sprites.names).toEqual([
      'aaa/first',
      'bullets/round-pink',
      'enemies/drifter',
      'ships/kestrel',
      'ships/kestrel@p2',
      'shots/basic',
    ]);
    expect(db.ships[0]?.spriteId).toBe(3);
    expect(loadContent([], { extraSprites: ['x/y'] }).db.sprites.names).toEqual(['x/y']);
  });

  it('resolves cross-kind references, audio cues and null references', () => {
    const { db, issues } = loadContent([stageFile(), enemiesFile(), weaponsFile(), pathsFile()]);
    expect(issues).toEqual([]);
    const stage = db.stages[0];
    expect(stage?.events[0]).toMatchObject({
      type: 'spawn',
      enemy: 'drifter',
      enemyId: 0,
      path: 'sine-low',
      pathId: 0,
    });
    expect(stage?.events[1]).toMatchObject({ type: 'music', cue: 'Stage', cueId: 4 });
    expect(db.weapons[0]?.sfxId).toBe(0);
    expect(db.weaponPresets[0]).toMatchObject({ missileId: -1, doubleId: -1, laserId: 0 });
  });

  it('reports unresolved references with the file and JSON path', () => {
    const { db, issues } = loadContent([stageFile('zone-a', 'ghost'), enemiesFile(), pathsFile()]);
    expect(issues).toEqual([
      {
        path: 'stages/zone-a.stage.json:events[0].enemy',
        message: 'unknown enemy id "ghost"',
      },
      {
        path: 'stages/zone-a.stage.json:events[2].enemy',
        message: 'unknown enemy id "ghost"',
      },
    ]);
    expect(db.stages[0]?.events[0]).toMatchObject({ enemyId: -1 });
  });

  it('reports unknown audio cues', () => {
    const file = stageFile();
    (file.data as { events: { cue: string }[] }).events[1].cue = 'NoSuchTrack';
    const { issues } = loadContent([file, enemiesFile(), pathsFile()]);
    expect(issues).toEqual([
      {
        path: 'stages/zone-a.stage.json:events[1].cue',
        message: 'unknown music id "NoSuchTrack"',
      },
    ]);
  });

  it('checks script ids against the engine registry when one is given', () => {
    const strict = loadContent([enemiesFile()], { knownScripts: ['other.script'] });
    expect(strict.issues).toEqual([
      {
        path: 'enemies/drifter.enemies.json:enemies[0].script',
        message: 'unknown script id "drifter.sine"',
      },
    ]);
    expect(
      loadContent([enemiesFile()], { knownScripts: new Set(['drifter.sine']) }).issues,
    ).toEqual([]);
    expect(loadContent([enemiesFile()]).issues).toEqual([]);
  });

  it('reports duplicate ids across files', () => {
    // Files are loaded in ascending path order, so `copy` wins and `drifter` is the duplicate.
    const { db, issues } = loadContent([
      enemiesFile(),
      { ...enemiesFile(), path: 'enemies/copy.enemies.json' },
    ]);
    expect(db.enemies).toHaveLength(1);
    expect(issues).toEqual([
      {
        path: 'enemies/drifter.enemies.json:enemies[0].id',
        message: 'duplicate enemy id "drifter"',
      },
    ]);
  });

  it('reports a duplicate stage id at the file:id path', () => {
    const { db, issues } = loadContent([
      { ...stageFile('dup'), path: 'stages/b.stage.json' },
      { ...stageFile('dup'), path: 'stages/a.stage.json' },
      enemiesFile(),
      pathsFile(),
    ]);
    expect(db.stages).toHaveLength(1);
    expect(issues).toEqual([
      { path: 'stages/b.stage.json:id', message: 'duplicate stage id "dup"' },
    ]);
  });

  it('reports duplicate ids inside a secondary list at the entry id path', () => {
    const { db, issues } = loadContent([
      weaponsFile(),
      { ...weaponsFile(), path: 'weapons/z.weapons.json' },
    ]);
    expect(db.weaponPresets).toHaveLength(1);
    expect(issues).toEqual([
      {
        path: 'weapons/z.weapons.json:weapons[0].id',
        message: 'duplicate weapon id "shot.basic"',
      },
      {
        path: 'weapons/z.weapons.json:presets[0].id',
        message: 'duplicate weapon preset id "type-a"',
      },
    ]);
  });

  it('prefixes schema issues with the file path and keeps loading the other files', () => {
    const broken = playerFile();
    (broken.data as { ships: { speeds: unknown }[] }).ships[0].speeds = [];
    const { db, issues } = loadContent([broken, enemiesFile()]);
    expect(issues).toEqual([
      {
        path: 'player/kestrel.player.json:ships[0].speeds',
        message: 'must have at least 1 items',
      },
    ]);
    expect(db.ships).toHaveLength(0);
    expect(db.enemies).toHaveLength(1);
  });

  it('returns files of other kinds untouched', () => {
    const profiles: ContentFile = {
      path: 'input/remote-profiles.json',
      data: { formatVersion: 1, kind: 'input-profiles', profiles: [] },
    };
    const { db, foreign, issues } = loadContent([profiles, enemiesFile()]);
    expect(issues).toEqual([]);
    expect(foreign).toEqual([profiles]);
    expect(db.enemies).toHaveLength(1);
  });

  it('rejects unreadable headers', () => {
    const { issues } = loadContent([
      { path: 'a.json', data: [] },
      { path: 'b.json', data: { kind: 'enemies' } },
      { path: 'c.json', data: { formatVersion: 1 } },
    ]);
    expect(issues).toEqual([
      { path: 'a.json', message: 'must be a JSON object' },
      { path: 'b.json:formatVersion', message: 'must be an integer >= 0' },
      { path: 'c.json:kind', message: 'must be a non-empty string' },
    ]);
  });

  it('migrates older format versions and rejects newer ones', () => {
    const old = enemiesFile();
    (old.data as { formatVersion: number }).formatVersion = 0;
    expect(loadContent([old]).issues).toEqual([]);
    expect(loadContent([old]).db.enemies).toHaveLength(1);

    const future = enemiesFile();
    (future.data as { formatVersion: number }).formatVersion = CONTENT_FORMAT_VERSION + 1;
    expect(loadContent([future]).issues).toEqual([
      {
        path: 'enemies/drifter.enemies.json:formatVersion',
        message: 'formatVersion 2 is newer than this build reads (1)',
      },
    ]);
  });

  it('reports kinds that have no migration path', () => {
    const old = playerFile();
    (old.data as { formatVersion: number }).formatVersion = 0;
    expect(loadContent([old]).issues).toEqual([
      {
        path: 'player/kestrel.player.json:formatVersion',
        message: 'no migration for player from formatVersion 0',
      },
    ]);
    expect(CONTENT_MIGRATIONS.player).toBeUndefined();
  });

  it('runs an injected migration table', () => {
    const old = playerFile();
    (old.data as { formatVersion: number; legacySpeed?: number }).formatVersion = 0;
    (old.data as { legacySpeed?: number }).legacySpeed = 3;
    const { db, issues } = loadContent([old], {
      migrations: {
        player: {
          0: (data) => {
            const next = { ...data };
            delete next['legacySpeed'];
            return next;
          },
        },
      },
    });
    expect(issues).toEqual([]);
    expect(db.ships).toHaveLength(1);
  });

  it('is independent of the order the host listed the files in', () => {
    const files = [stageFile(), playerFile(), weaponsFile(), enemiesFile(), pathsFile()];
    const forward = JSON.stringify(loadContent(files).db.stages);
    const reversed = JSON.stringify(loadContent(files.slice().reverse()).db.stages);
    expect(reversed).toBe(forward);
  });

  it('throws only for a programming error', () => {
    expect(() => loadContent(undefined as unknown as ContentFile[])).toThrow(TypeError);
  });
});
