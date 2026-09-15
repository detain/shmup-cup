/**
 * `pnpm content:check` — every JSON file under `content/` validates against the schemas in
 * `@shmup/core`'s `data` module, and every string id it uses resolves.
 *
 * The shipped files (what `virtual:shmup-content` inlines into a build) and the
 * `example.*.json` format samples are loaded as two independent sets: the examples are
 * documentation, so they may reuse the ids of the real content without clashing with it.
 * Every sprite name the shipped content uses must exist in the atlas the asset pipeline
 * builds (M1-03) — a typo is reported as an issue here, not as a magenta box in the game.
 * Kinds the core does not own go to their owning package, like the shell does at boot
 * (plan §3.5): `input-profiles` → `@shmup/input-web` (M1-05), `fx` → `@shmup/render-pixi`
 * (M1-14 — its preset sprites must exist in the atlas too), `sfx` / `music` → `@shmup/audio-web`
 * (M1-15 — the shipped bank binds every `SFX_CUES` cue, every sound renders audible and
 * unclipped, the WARNING siren ends before its next wail, and every looping song loops
 * sample-exactly). The shipped set is loaded with the
 * engine's script registry (`KNOWN_SCRIPT_IDS`, M1-08), so an unknown behaviour id is an issue,
 * and its enemies and weapons are checked against their behaviours' tunables
 * (`checkEnemyBehaviors`, `checkWeaponBehaviors`).
 *
 * Zone A (M1-18) is held to its plan: the 4-way design rules (shmup_feat.md §4 rule 2, D17) —
 * no aimed bullet tunable over 2 px/tick and, over a whole HALCYON BULWARK fight played by the
 * 4-way bot, no enemy bullet over 2 px/tick and no two simultaneous laser lanes closer than
 * 16 px — and its structure: the five sections' camera keys and checkpoints, 6–8 enemy types,
 * ≥ 12 capsule sources before the boss and ≥ 3 within 900 px after every checkpoint (the recovery
 * rule of shmup_feat.md §10), two in the calm before the WARNING.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BULLET_PALETTES,
  BULLET_SPRITES,
  BodyAnchor,
  BonusEntrance,
  BossState,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
  DEFAULT_DIFFICULTY_TABLE,
  DEFAULT_SCORING_RULES,
  DIFFICULTY_PRESETS,
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  MAX_ENDING_TEXT_LINES,
  MUSIC_CUES,
  PLAYFIELD_H,
  RunFlag,
  SFX_CUE_NAMES,
  TerrainType,
  WARNING_PULSE_TICKS,
  checkEnemyBehaviors,
  checkWeaponBehaviors,
  createGame,
  createHeadlessPlatform,
  computeRank,
  createStageRunner,
  creditsLineCount,
  loadContent,
  powerRank,
  resolveGameConfig,
  selectCampaignEnding,
  spawnPlayer,
  terrainAt,
  type BossPartSpec,
  type BossSpec,
  type ContentDb,
  type ContentFile,
  type StageSpec,
  type ValidationIssue,
} from '@shmup/core';
import {
  STAGE_MUSIC_CUES,
  SYNTH_SAMPLE_RATE,
  loadMusicContent,
  loadSfxContent,
  parseMusicContent,
  parseSfxContent,
  renderSfx,
  renderSong,
  resolveMusicCues,
  stageMusicCues,
  type RenderedSong,
} from '@shmup/audio-web';
import { loadInputProfiles, parseInputProfiles } from '@shmup/input-web';
import {
  bulletPaletteSpriteName,
  fxSpriteNames,
  loadFxContent,
  parseFxContent,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { findMissingSprites } from '../../scripts/assets/manifest.mjs';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { runStage } from '../playtest/harness.js';
import { createRuleWatch, MAX_AIMED_BULLET_SPEED, MIN_LANE_GAP } from '../playtest/rules.js';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { PROCEDURAL_GENERATORS } from '../../scripts/assets/procedural/index.mjs';
import { readContentFiles } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentRoot = join(repo, 'content');

/**
 * Every `*.json` below `content/`, as content-root-relative POSIX paths.
 *
 * @param dir - Absolute directory to scan.
 * @param prefix - Its path relative to `content/`.
 * @returns The paths, sorted.
 */
function listJson(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const relative = prefix === '' ? entry : `${prefix}/${entry}`;
      if (statSync(join(dir, entry)).isDirectory()) return listJson(join(dir, entry), relative);
      return entry.endsWith('.json') ? [relative] : [];
    })
    .sort();
}

/** Reads the given content files (used for the `example.*.json` set). */
const read = (paths: readonly string[]): ContentFile[] =>
  paths.map((path) => ({
    path,
    data: JSON.parse(readFileSync(join(contentRoot, path), 'utf8')) as unknown,
  }));

/**
 * Removes `//` line comments from a JSONC sample, leaving `//` inside strings alone.
 *
 * @param source - The JSONC text.
 * @returns Plain JSON text.
 */
function stripLineComments(source: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += source[++i] ?? '';
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
    } else {
      out += ch;
    }
  }
  return out;
}

/** Validators of the foreign kinds, as the shell registers them (plan §3.5). */
const OWNERS: Record<string, (files: readonly ContentFile[]) => readonly ValidationIssue[]> = {
  'input-profiles': (files) => loadInputProfiles(files).issues,
  fx: (files) => loadFxContent(files).issues,
  sfx: (files) => loadSfxContent(files).issues,
  music: (files) => loadMusicContent(files).issues,
};

/**
 * Validates the foreign files of a load with their owners.
 *
 * @param foreign - `loadContent(...).foreign`.
 * @returns Every owner issue, plus one per file of a kind nobody owns.
 */
function ownerIssues(foreign: readonly ContentFile[]): ValidationIssue[] {
  const byKind = new Map<string, ContentFile[]>();
  for (const file of foreign) {
    const kind = (file.data as { kind: string }).kind;
    byKind.set(kind, [...(byKind.get(kind) ?? []), file]);
  }
  const issues: ValidationIssue[] = [];
  for (const [kind, files] of byKind) {
    const owner = OWNERS[kind];
    if (owner === undefined) {
      for (const file of files) issues.push({ path: file.path, message: `no owner for "${kind}"` });
    } else {
      issues.push(...owner(files));
    }
  }
  return issues;
}

const allPaths = listJson(contentRoot);
const examplePaths = allPaths.filter((path) => path.split('/').pop()?.startsWith('example.'));
const shippedFiles = readContentFiles(contentRoot);

describe('integration: content/ validates', () => {
  it('reads exactly the non-example files into the bundle', () => {
    expect(shippedFiles.map((file) => file.path)).toEqual(
      allPaths.filter((path) => !examplePaths.includes(path)),
    );
    expect(examplePaths.length).toBeGreaterThan(0);
  });

  it('loads the shipped content without a single issue', () => {
    const { db, issues, foreign } = loadContent(shippedFiles, { knownScripts: KNOWN_SCRIPT_IDS });
    expect(issues).toEqual([]);
    expect(checkEnemyBehaviors(db)).toEqual([]);
    expect(checkWeaponBehaviors(db)).toEqual([]);
    // Foreign kinds go to their owner; a kind nobody owns must not silently fall through.
    expect(foreign.map((file) => file.path)).toEqual([
      'audio/main.sfx.json',
      'audio/music/boss-b.music.json',
      'audio/music/boss-c.music.json',
      'audio/music/boss-d.music.json',
      'audio/music/boss-e.music.json',
      'audio/music/boss-f.music.json',
      'audio/music/boss-g.music.json',
      'audio/music/boss-h.music.json',
      'audio/music/boss-i.music.json',
      'audio/music/boss.music.json',
      'audio/music/credits.music.json',
      'audio/music/ending.music.json',
      'audio/music/game-over.music.json',
      'audio/music/stage-clear.music.json',
      'audio/music/title.music.json',
      'audio/music/zone-a.music.json',
      'audio/music/zone-b.music.json',
      'audio/music/zone-c.music.json',
      'audio/music/zone-d.music.json',
      'audio/music/zone-e.music.json',
      'audio/music/zone-f.music.json',
      'audio/music/zone-g.music.json',
      'audio/music/zone-h.music.json',
      'audio/music/zone-i.music.json',
      'fx/particles.fx.json',
      'input/remote.input-profiles.json',
    ]);
    expect(ownerIssues(foreign)).toEqual([]);
    expect(db.ships.map((ship) => ship.id)).toContain('kestrel');
    expect(db.weaponPresets.map((preset) => preset.id)).toContain('type-a');
  });

  it('reports a shipped enemy whose script the engine does not know', () => {
    const edited = shippedFiles.map((file) =>
      file.path === 'enemies/test-range.enemies.json'
        ? {
            ...file,
            data: JSON.parse(
              JSON.stringify(file.data).replace('"drifter.sine"', '"drifter.sinus"'),
            ) as unknown,
          }
        : file,
    );
    const { issues } = loadContent(edited, { knownScripts: KNOWN_SCRIPT_IDS });
    expect(issues).toEqual([
      {
        path: 'enemies/test-range.enemies.json:enemies[0].script',
        message: 'unknown script id "drifter.sinus"',
      },
    ]);
  });

  it('resolves every sprite and script name the shipped content uses', () => {
    const { db } = loadContent(shippedFiles);
    for (const ship of db.ships) expect(db.sprites.names[ship.spriteId]).toBe(ship.sprite);
    for (const weapon of db.weapons) {
      expect(db.sprites.names[weapon.spriteId]).toBe(weapon.sprite);
      expect(db.scripts.names[weapon.behaviorId]).toBe(weapon.behavior);
    }
    for (const enemy of db.enemies) {
      if (enemy.boss === null) {
        expect(db.scripts.names[enemy.scriptId]).toBe(enemy.script);
        expect(db.sprites.names[enemy.spriteId]).toBe(enemy.sprite);
        continue;
      }
      // A boss (M1-13): its phases name the scripts, its parts the sprites.
      expect([enemy.scriptId, enemy.spriteId]).toEqual([-1, -1]);
      for (const phase of enemy.boss.phases) {
        expect(db.scripts.names[phase.scriptId]).toBe(phase.script);
      }
      for (const part of enemy.boss.parts) {
        if (part.sprite !== undefined) expect(db.sprites.names[part.spriteId]).toBe(part.sprite);
      }
    }
  });

  it('loads the example format samples without a single issue', () => {
    const { db, issues, foreign } = loadContent(read(examplePaths));
    expect(issues).toEqual([]);
    expect(foreign.map((file) => file.path)).toEqual([
      'audio/example.music.json',
      'audio/example.sfx.json',
      'fx/example.fx.json',
      'input/example.input-profiles.json',
    ]);
    expect(ownerIssues(foreign)).toEqual([]);
    expect(db.stages.length).toBeGreaterThan(0);
    for (const stage of db.stages) {
      for (const event of stage.events) {
        if ('enemyId' in event) expect(event.enemyId).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('names every file after its kind (`<folder>/<name>.<kind>.json`)', () => {
    const kindsOf: Record<string, readonly string[]> = {
      player: ['player'],
      weapons: ['weapons'],
      enemies: ['enemies'],
      paths: ['paths'],
      stages: ['stage'],
      tilesets: ['tileset'],
      rules: ['rules'],
      patterns: ['patterns'],
      campaign: ['campaign'],
      // The attract loop's demos (M2-15): replay recordings.
      demos: ['replay'],
      input: ['input-profiles'],
      fx: ['fx'],
      // The SFX bank next to the music folder (audio/main.sfx.json, audio/music/*.music.json).
      audio: ['sfx', 'music'],
    };
    for (const file of [...shippedFiles, ...read(examplePaths)]) {
      const parts = file.path.split('/');
      const folder = parts[0] ?? '';
      const name = parts[parts.length - 1] ?? '';
      const kind = (file.data as { kind?: unknown }).kind;
      expect(kindsOf[folder], file.path).toBeDefined();
      expect(kindsOf[folder], file.path).toContain(kind);
      expect(name.endsWith(`.${String(kind)}.json`), file.path).toBe(true);
    }
  });

  it('builds weapon presets only from weapons of the matching slot', () => {
    for (const set of [shippedFiles, read(examplePaths)]) {
      const { db } = loadContent(set);
      expect(db.weaponPresets.length).toBeGreaterThan(0);
      for (const preset of db.weaponPresets) {
        const slots = {
          mainId: 'main',
          missileId: 'missile',
          doubleId: 'double',
          laserId: 'laser',
        };
        for (const [field, slot] of Object.entries(slots)) {
          const id = preset[field as keyof typeof slots] ?? -1;
          if (id >= 0) expect(db.weapons[id]?.slot, `${preset.id}.${slot}`).toBe(slot);
        }
      }
    }
  });

  it('gives every shipped weapon a cue and a sorted, deterministic sprite table', () => {
    const { db } = loadContent(shippedFiles);
    for (const weapon of db.weapons) {
      expect(weapon.sfxId ?? -1, weapon.id).toBeGreaterThanOrEqual(0);
    }
    expect(db.sprites.names).toEqual([...db.sprites.names].sort());
    expect(loadContent([...shippedFiles].reverse()).db.sprites.names).toEqual(db.sprites.names);
  });

  it('keeps the format samples in the content READMEs valid', () => {
    const readmes = allPaths
      .map((path) => path.split('/')[0] ?? '')
      .filter(
        (folder, i, list) =>
          folder !== '' && list.indexOf(folder) === i && !folder.endsWith('.json'),
      );
    expect(readmes.length).toBeGreaterThan(0);
    for (const folder of readmes) {
      const readme = readFileSync(join(contentRoot, folder, 'README.md'), 'utf8');
      const blocks = [...readme.matchAll(/```jsonc?\n([\s\S]*?)```/g)].map(
        (match) => match[1] ?? '',
      );
      expect(blocks.length, `${folder}/README.md format block`).toBeGreaterThan(0);
      for (const block of blocks) {
        const data = JSON.parse(stripLineComments(block)) as unknown;
        if ((data as { kind?: unknown }).kind === 'input-profiles') {
          expect(parseInputProfiles(data, `${folder}/README.md`).issues).toEqual([]);
          continue;
        }
        if ((data as { kind?: unknown }).kind === 'fx') {
          expect(parseFxContent(data, `${folder}/README.md`).issues).toEqual([]);
          continue;
        }
        if ((data as { kind?: unknown }).kind === 'sfx') {
          expect(parseSfxContent(data, `${folder}/README.md`).issues).toEqual([]);
          continue;
        }
        if ((data as { kind?: unknown }).kind === 'music') {
          expect(parseMusicContent(data, `${folder}/README.md`).issues).toEqual([]);
          continue;
        }
        const { issues } = loadContent([{ path: `${folder}/README.md`, data }]);
        // A sample may name ids that only exist in a full content set; its shape must be right.
        expect(
          issues.filter((issue) => !/^unknown \w+ id /.test(issue.message)),
          `${folder}/README.md`,
        ).toEqual([]);
      }
    }
  });

  it('ships the scoring rules (M2-02) equal to the built-in ones, and a compiled pattern library', () => {
    const { db } = loadContent(shippedFiles);
    expect(db.scoring).toEqual(DEFAULT_SCORING_RULES);
    const bank = db.patterns;
    expect(bank.actions.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < bank.actions.length; i++) {
      expect(bank.entries[i], bank.actions[i]).toBeGreaterThan(0);
    }
    const sentry = db.enemies[db.enemyIndex.get('sentry') ?? -1];
    expect(sentry?.script).toBe('pattern.loop');
    expect(bank.actions[sentry?.patternId ?? -1]).toBe('common.spiral');
  });

  it('ships the difficulty presets of plan M2-01, equal to the built-in table', () => {
    const { db } = loadContent(shippedFiles);
    expect(db.difficulty).toEqual(DEFAULT_DIFFICULTY_TABLE);
    const table = db.difficulty!;
    expect(DIFFICULTY_PRESETS.map((p) => table[p].rankBase)).toEqual([0, 2, 4, 6]);
    expect(DIFFICULTY_PRESETS.map((p) => table[p].aimDirections)).toEqual([16, 32, 32, 32]);
    for (const preset of DIFFICULTY_PRESETS) {
      expect(table[preset].extends, preset).toEqual({ first: 20000, every: 70000 });
    }
    // The Normal row is the default config: a session without overrides plays it.
    const normal = resolveGameConfig({}, table);
    expect(normal).toEqual(resolveGameConfig());
    expect(normal.deathPenalty).toBe('classic');
    // The example sample is a valid, different table.
    expect(loadContent(read(['rules/example.rules.json'])).db.difficulty?.easy.continues).toBe(9);
  });

  it('gives zone A fans revenge bullets only at a high rank', () => {
    const { db } = loadContent(shippedFiles);
    const vane = db.enemies[db.enemyIndex.get('vane') ?? -1];
    expect(vane?.revenge).toEqual({ minRank: 12, pattern: 'aimed', speed: 1.25 });
    const minRank = vane?.revenge?.minRank ?? 0;
    const rank = (base: number, power: number): number =>
      computeRank({ difficultyBase: base, growth: 1, loop: 1, stage: 1, power, special: 0 });
    // A fully powered ship on Normal (Missile, Laser, four Options, a shield) meets them…
    expect(rank(2, powerRank(1, 0, 1, 4, 1, 0))).toBeGreaterThanOrEqual(minRank);
    // …the 4-way bot's Speed / Missile / four Options do not, even on Arcade.
    expect(rank(6, powerRank(1, 0, 0, 4, 0, 0))).toBeLessThan(minRank);
  });

  it('gives the KESTREL the six speed levels of decision D3', () => {
    const { db } = loadContent(shippedFiles);
    const kestrel = db.ships[db.shipIndex.get('kestrel') ?? -1];
    expect(kestrel?.speeds).toEqual([1.5, 2, 2.5, 3, 3.5, 4]);
    expect(kestrel?.hurtRadius).toBe(1.5);
  });

  it('ships the zone map of decision D9: A → B|C → D|E → F|G → H|I, 16 routes, two finales (M2-10)', () => {
    const { db } = loadContent(shippedFiles);
    const campaign = db.campaign;
    expect(campaign).not.toBeNull();
    if (campaign === null) return;
    expect(campaign.zones.map((z) => z.label).join('')).toBe('ABCDEFGHI');
    expect(campaign.zones[campaign.startIndex].stage).toBe('zone-a');
    expect([campaign.depths, campaign.routes]).toEqual([5, 16]);
    expect(campaign.zones.filter((z) => z.final).map((z) => z.name)).toEqual([
      'IRON CITADEL',
      'ABYSSAL THRONE',
    ]);
    expect(campaign.zones.map((z) => z.stage)).toEqual(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => 'zone-' + id),
    );
    for (const zone of campaign.zones) {
      expect(zone.depth).toBe(
        'ABCDEFGHI'.indexOf(zone.label) === 0 ? 0 : Math.ceil('ABCDEFGHI'.indexOf(zone.label) / 2),
      );
      expect(zone.preview.length).toBeGreaterThan(0);
      const stage = db.stages[zone.stageId];
      expect(stage.type).toBe('normal');
      // Every zone ends with a boss fight (the WARNING) and its clear.
      expect(stage.events.some((e) => e.type === 'warning')).toBe(true);
    }
    // Each final zone has an unconditional ending and a no-miss variant.
    for (const final of ['h', 'i']) {
      const endings = campaign.endings.filter((e) => e.zone === final);
      expect(endings.some((e) => e.all.length === 0 && e.none.length === 0)).toBe(true);
      expect(endings.some((e) => e.all.includes('noDeath'))).toBe(true);
    }
    // The bonus-stage framework's dev stages: a range with the three entrances and its vault.
    const range = db.stages[db.stageIndex.get('bonus-range') ?? -1];
    const vault = db.stages[db.stageIndex.get('bonus-vault') ?? -1];
    expect(vault.type).toBe('bonus');
    const entrances = range.events.filter((e) => e.type === 'bonus');
    expect(entrances.map((e) => (e.type === 'bonus' ? e.entrance : ''))).toEqual([
      'gap',
      'ground',
      'digit',
    ]);
    expect(
      vault.events
        .filter((e) => e.type === 'spawn' || e.type === 'formation')
        .map((e) => ('enemy' in e ? e.enemy : '')),
    ).toContain('vault-carrier-1up');
  });

  // A `ground` entrance weighs the ground kills made while it is armed against the ground enemies
  // that appeared while it was armed: one of an earlier event still standing when the window arms
  // could be shot in place of one of the window's own (M2-13 review — the prism gallery opened with
  // a gallery turret left standing). Played from the stage's start, nothing shot.
  it('leaves no ground enemy of an earlier event standing when a `ground` bonus window arms', () => {
    const db = shippedDb();
    const stages = db.stages.filter((stage) =>
      stage.events.some((e) => e.type === 'bonus' && e.entrance === 'ground'),
    );
    expect(stages.map((stage) => stage.id).sort()).toEqual(['bonus-range', 'zone-g']);
    for (const stage of stages) {
      const game = createGame(
        createHeadlessPlatform(),
        { seed: 1, stage: stage.id, autofire: false, remoteMode: false },
        db,
      );
      const world = game.world;
      world.debugFlags.godMode = true;
      spawnPlayer(world.players[0], world.camera);
      const bonus = world.bonus;
      for (let e = 0; e < bonus.count; e++) {
        if (bonus.kind[e] !== BonusEntrance.Ground) continue;
        for (let t = 0; t < 60 * 60 * 10 && bonus.armed[e] === 0; t++) {
          game.step();
          game.events.clear();
        }
        expect(bonus.armed[e], `${stage.id}: entrance ${String(e)} arms`).toBe(1);
        // Every ground enemy up now appeared in the window (at its first tick, usually none).
        const inWindow = world.enemies.stats.groundSpawned - bonus.groundSpawned0[e];
        const standing = world.enemies.enemies
          .filter((en) => en.state === EnemyState.Live && en.anchor !== BodyAnchor.Air)
          .map((en) => `${db.enemies[en.specIndex].id} at ${String(Math.round(en.x))}`);
        expect(
          standing.length,
          `${stage.id}: camera ${String(Math.round(world.camera.x))}, ${standing.join(', ')}`,
        ).toBeLessThanOrEqual(inWindow);
      }
    }
  });
});

describe('integration: content/audio (M1-15)', () => {
  const audioFiles = (kind: string): ContentFile[] =>
    shippedFiles.filter((file) => (file.data as { kind?: unknown }).kind === kind);

  it('binds a sound to every SFX_CUES cue', () => {
    const { content, issues } = loadSfxContent(audioFiles('sfx'));
    expect(issues).toEqual([]);
    const missing = SFX_CUE_NAMES.filter((_name, id) => content.cues[id] === null);
    expect(missing).toEqual([]);
    // Must-hear sounds are never stolen (shmup_feat.md §19).
    for (const cue of ['WarningSiren', 'PlayerDeath', 'ExtraLife']) {
      expect(content.cues[SFX_CUE_NAMES.indexOf(cue)]?.priority, cue).toBe('critical');
    }
  });

  it('has the tracks of plan M1-15 bound to their cues, for every shipped stage', () => {
    const { content, issues } = loadMusicContent(audioFiles('music'));
    expect(issues).toEqual([]);
    expect(content.tracks.map((track) => track.id).sort()).toEqual([
      'boss',
      'boss-b',
      'boss-c',
      'boss-d',
      'boss-e',
      'boss-f',
      'boss-g',
      'boss-h',
      'boss-i',
      'credits',
      'ending',
      'game-over',
      'stage-clear',
      'title',
      'zone-a',
      'zone-b',
      'zone-c',
      'zone-d',
      'zone-e',
      'zone-f',
      'zone-g',
      'zone-h',
      'zone-i',
    ]);
    const { db } = loadContent(shippedFiles);
    for (const stage of db.stages) {
      const table = resolveMusicCues(content, stage.id);
      for (const cue of STAGE_MUSIC_CUES)
        expect(table[cue], `${stage.id} cue ${cue}`).toBeGreaterThanOrEqual(0);
      // Every cue the stage can make the sim ask for — its theme, its boss, its `music` events —
      // is in the set the shell prepares during its loading phase and has a track: a cue outside
      // the prepared set would play silence (nothing is rendered mid-stage).
      const prepared = stageMusicCues(stage);
      const referenced = [stage.music.stageId, stage.music.bossId];
      // M2-14: a final zone's ending and credits themes, played after its clear.
      if ((stage.music.endingId ?? -1) >= 0) referenced.push(stage.music.endingId ?? -1);
      if ((stage.music.creditsId ?? -1) >= 0) referenced.push(stage.music.creditsId ?? -1);
      for (const event of stage.events) if (event.type === 'music') referenced.push(event.cueId);
      for (const cue of referenced) {
        if (cue === MUSIC_CUES.Silence) continue;
        expect(prepared, `${stage.id} prepares cue ${cue}`).toContain(cue);
      }
      for (const cue of prepared)
        expect(table[cue], `${stage.id} track of cue ${cue}`).toBeGreaterThanOrEqual(0);
    }
    expect(resolveMusicCues(content, null)[MUSIC_CUES.Title]).toBe(content.trackIndex.get('title'));
    // A track limited to stages names stages that exist.
    const stageIds = db.stages.map((stage) => stage.id);
    for (const track of content.tracks) {
      for (const stage of track.stages ?? []) expect(stageIds, track.id).toContain(stage);
    }
  });

  it('renders every synthesized sound audible, unclipped and short; whole-screen sounds centred', () => {
    const { content } = loadSfxContent(audioFiles('sfx'));
    for (const def of content.cues) {
      if (def === null || def.params === null) continue;
      const pcm = renderSfx(def.params, SYNTH_SAMPLE_RATE);
      let peak = 0;
      for (const value of pcm) peak = Math.max(peak, Math.abs(value * def.volume));
      expect(peak, def.cue).toBeGreaterThan(0.1);
      expect(peak, def.cue).toBeLessThanOrEqual(1);
      // A voice is a short sound; the longest placeholder (Mega Crash) is ≈ 1.2 s.
      expect(pcm.length / SYNTH_SAMPLE_RATE, def.cue).toBeLessThanOrEqual(1.5);
    }
    // The siren (instance cap 1) ends before its next wail, so a wail is never cut short.
    const siren = content.cues[SFX_CUE_NAMES.indexOf('WarningSiren')];
    expect(siren?.maxInstances).toBe(1);
    const wail = renderSfx(siren?.params ?? {}, SYNTH_SAMPLE_RATE).length / SYNTH_SAMPLE_RATE;
    expect(wail).toBeLessThan(WARNING_PULSE_TICKS / 60);
    // Whole-screen sounds are not panned; menu sounds play on the ui bus.
    for (const cue of ['WarningSiren', 'MegaCrash', 'ExtraLife']) {
      expect(content.cues[SFX_CUE_NAMES.indexOf(cue)]?.positional, cue).toBe(false);
    }
    for (const cue of ['MenuMove', 'MenuSelect', 'MenuBack', 'PauseToggle']) {
      expect(content.cues[SFX_CUE_NAMES.indexOf(cue)]?.bus, cue).toBe('ui');
    }
  });

  it('shapes the songs as planned: zone A ≈ 45 s loop after its intro, jingles end, no clipping', () => {
    const { content } = loadMusicContent(audioFiles('music'));
    const rendered = new Map<string, RenderedSong>();
    for (const track of content.tracks) {
      if (track.song !== null) rendered.set(track.id, renderSong(track.song, SYNTH_SAMPLE_RATE));
    }
    expect(rendered.size).toBe(content.tracks.length); // every placeholder is a chip song
    const seconds = (samples: number): number => samples / SYNTH_SAMPLE_RATE;
    const zone = rendered.get('zone-a');
    if (zone === undefined) throw new Error('no zone-a');
    expect(seconds(zone.loopStart)).toBeGreaterThan(0); // an intro
    expect(seconds(zone.loopEnd - zone.loopStart)).toBeGreaterThanOrEqual(40);
    expect(seconds(zone.loopEnd - zone.loopStart)).toBeLessThanOrEqual(50);
    for (const id of ['stage-clear', 'game-over']) {
      expect(rendered.get(id)?.loopStart, id).toBe(-1);
    }
    for (const [id, song] of rendered) {
      let peak = 0;
      for (const value of song.pcm) peak = Math.max(peak, Math.abs(value));
      expect(peak, id).toBeGreaterThan(0.2);
      expect(peak, `${id} clips`).toBeLessThan(1);
    }
  });

  it('loops every looping song sample-exactly (the loop region = the unrolled steady state)', () => {
    const { content } = loadMusicContent(audioFiles('music'));
    const looping = content.tracks.filter((track) => typeof track.song?.loopFromOrder === 'number');
    expect(looping.map((track) => track.id).sort()).toEqual([
      'boss',
      'boss-b',
      'boss-c',
      'boss-d',
      'boss-e',
      'boss-f',
      'boss-g',
      'boss-h',
      'boss-i',
      'credits',
      'ending',
      'title',
      'zone-a',
      'zone-b',
      'zone-c',
      'zone-d',
      'zone-e',
      'zone-f',
      'zone-g',
      'zone-h',
      'zone-i',
    ]);
    for (const track of looping) {
      const song = track.song;
      if (song === null) continue;
      const loopFrom = song.loopFromOrder ?? 0;
      const rendered = renderSong(song, SYNTH_SAMPLE_RATE);
      const intro = song.order.slice(0, loopFrom);
      const loop = song.order.slice(loopFrom);
      const unrolled = renderSong(
        { ...song, order: [...intro, ...loop, ...loop, ...loop], loopFromOrder: null },
        SYNTH_SAMPLE_RATE,
      ).pcm;
      const length = rendered.loopEnd - rendered.loopStart;
      const third = unrolled.subarray(
        rendered.loopStart + 2 * length,
        rendered.loopStart + 3 * length,
      );
      expect(rendered.pcm.subarray(0, rendered.loopStart), track.id).toEqual(
        unrolled.subarray(0, rendered.loopStart),
      );
      // Equal float arrays (compared as bytes: fast on a minute of audio).
      expect(
        Buffer.from(rendered.pcm.buffer, rendered.loopStart * 4, length * 4).equals(
          Buffer.from(third.buffer, third.byteOffset, third.byteLength),
        ),
        track.id,
      ).toBe(true);
    }
    // Renders every looping song twice (once unrolled ×3): ~1.5 s locally, >5 s on a busy CI runner.
  }, 60_000);
});

describe('integration: content/ sprites exist in the atlas', () => {
  const { manifest } = buildAtlas();

  it('finds every sprite name of the shipped content in the atlas manifest', () => {
    const { db } = loadContent(shippedFiles);
    expect(db.sprites.names.length).toBeGreaterThan(0);
    expect(findMissingSprites(manifest, db.sprites.names, 'db.sprites.names')).toEqual([]);
  });

  it("finds the engine's own sprites (enemy bullets, laser beams — M1-09) in the atlas", () => {
    expect(ENGINE_SPRITES.length).toBeGreaterThan(0);
    expect(findMissingSprites(manifest, ENGINE_SPRITES, 'ENGINE_SPRITES')).toEqual([]);
    const { db } = loadContent(shippedFiles, { extraSprites: ENGINE_SPRITES });
    expect(findMissingSprites(manifest, db.sprites.names, 'db.sprites.names')).toEqual([]);
  });

  it('has every colour-blind palette variant of every bullet / laser sprite, frame for frame (M2-02)', () => {
    const coloured = BULLET_SPRITES.filter((name) => /^(bullets|lasers)\//.test(name));
    expect(coloured.length).toBeGreaterThanOrEqual(11); // 9 kinds, the beam, the bend
    for (const palette of BULLET_PALETTES) {
      if (palette === 'standard') continue;
      for (const name of coloured) {
        const variant = bulletPaletteSpriteName(name, palette);
        const sprite = manifest.sprites[variant];
        expect(sprite, variant).toBeDefined();
        expect(sprite?.frames.length, variant).toBe(manifest.sprites[name]?.frames.length);
        // Same frame sizes and anchors: the renderer swaps sprite bases only.
        sprite?.frames.forEach((frame, k) => {
          const a = manifest.frames[frame];
          const b = manifest.frames[manifest.sprites[name]?.frames[k] ?? ''];
          expect([a?.w, a?.h, a?.ax, a?.ay], `${variant}#${k}`).toEqual([b?.w, b?.h, b?.ax, b?.ay]);
        });
      }
    }
  });

  it('finds every sprite of the particle presets (content/fx, M1-14) in the atlas', () => {
    const fxFiles = shippedFiles.filter((file) => file.path.startsWith('fx/'));
    const { content, issues } = loadFxContent(fxFiles);
    expect(issues).toEqual([]);
    const names = fxSpriteNames(content);
    expect(names.length).toBeGreaterThan(0);
    expect(findMissingSprites(manifest, names, 'fx presets')).toEqual([]);
    const example = loadFxContent(read(examplePaths.filter((path) => path.startsWith('fx/'))));
    expect(findMissingSprites(manifest, fxSpriteNames(example.content), 'fx example')).toEqual([]);
  });

  it('reports a sprite name that is not in the atlas as an issue', () => {
    const edited = shippedFiles.map((file) =>
      file.path === 'player/kestrel.player.json'
        ? {
            ...file,
            data: JSON.parse(
              JSON.stringify(file.data).replace('ships/kestrel', 'ships/kestrell'),
            ) as unknown,
          }
        : file,
    );
    const { db, issues } = loadContent(edited);
    expect(issues).toEqual([]);
    const missing = findMissingSprites(manifest, db.sprites.names, 'db.sprites.names');
    // The ship and its player 2 palette swap (M2-06: interned for every ship).
    expect(missing).toHaveLength(2);
    expect(missing[0]?.message).toContain('"ships/kestrell"');
    expect(missing[1]?.message).toContain('"ships/kestrell@p2"');
  });
});

/**
 * The shipped content with the engine's scripts and sprites (the shell's loader).
 *
 * @returns The DB (asserted issue-free).
 */
function shippedDb(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

/**
 * The indices of every enemy a stage can bring into play: its spawn / formation / WARNING / boss
 * events' enemies and their children.
 *
 * @param db - Content.
 * @param stage - The stage.
 * @returns Enemy indices.
 */
function stageEnemies(db: ContentDb, stage: StageSpec): Set<number> {
  const used = new Set<number>();
  for (const event of stage.events) {
    if ('enemyId' in event && event.enemyId >= 0) used.add(event.enemyId);
  }
  for (const index of [...used]) {
    const child = db.enemies[index].childId;
    if (child >= 0) used.add(child);
  }
  return used;
}

describe('integration: zone A holds to the 4-way design rules (M1-18)', () => {
  const db = shippedDb();
  const stage = db.stages[db.stageIndex.get('zone-a') ?? -1];

  it('ships AZURE VERGE with HALCYON BULWARK (HB-01) and its five sections', () => {
    expect(stage.name).toBe('AZURE VERGE');
    expect(stage.length).toBeGreaterThanOrEqual(8500);
    expect(stage.length).toBeLessThanOrEqual(9500);
    expect(stage.checkpoints.map((c) => c.x)).toEqual([0, 3500, 6000]);
    // The high-speed section of 6,000–8,000 at 1.5 px/tick, then the calm before the boss.
    const key = (x: number): number => stage.camera.find((k) => k.x === x)?.speed ?? -1;
    expect(key(6000)).toBe(1.5);
    expect(key(8000)).toBeLessThan(1.5);
    const warning = stage.events.find((e) => e.type === 'warning');
    expect(warning?.x).toBeGreaterThanOrEqual(8500);
    expect(warning?.x).toBeLessThanOrEqual(8700);
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.code).toBe('HB-01');
    expect(boss?.displayName).toBe('HALCYON BULWARK');
    // Four shield plates of 12 in front of a 40-hp core that needs them all gone; armoured hull.
    const parts = boss?.parts ?? [];
    const plates = parts.filter((p) => p.name.startsWith('plate-'));
    expect(plates.map((p) => p.hp)).toEqual([12, 12, 12, 12]);
    const core = parts.find((p) => p.core);
    expect(core?.hp).toBe(40);
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
    expect(behaviours.size).toBeGreaterThanOrEqual(6);
    expect(behaviours.size).toBeLessThanOrEqual(8);
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
    /** Whether an event is a capsule source: a dropping enemy, a formation that drops. */
    const capsule = (event: StageSpec['events'][number]): boolean =>
      event.type === 'spawn'
        ? db.enemies[event.enemyId].drop === 'capsule'
        : event.type === 'formation' && event.drop !== null;
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    const sources = stage.events.filter(capsule).map((e) => e.x);
    expect(sources.filter((x) => x < warningX).length).toBeGreaterThanOrEqual(12);
    for (const checkpoint of stage.checkpoints) {
      const after = sources.filter((x) => x >= checkpoint.x && x < checkpoint.x + 900);
      expect(after.length, `checkpoint ${String(checkpoint.x)}`).toBeGreaterThanOrEqual(3);
    }
    expect(sources.filter((x) => x >= 8000 && x < warningX)).toHaveLength(2);
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

  it('lays out the five sections with the archetypes the plan names (M1-18 test round)', () => {
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    // (1) tutorial popcorn and the first carriers.
    const one = sectionScripts(0, 1500);
    expect([...one].sort()).toEqual(['carrier.straight', 'drifter.sine']);
    // (2) fan formations on paths, rammers.
    const two = sectionScripts(1500, 3500);
    expect(two).toContain('fan.loop');
    expect(two).toContain('rammer.aimed');
    const fans = stage.events.filter(
      (e) => e.type === 'formation' && e.x >= 1500 && e.x < 3500 && e.pathId >= 0,
    );
    expect(fans.length).toBeGreaterThanOrEqual(3);
    // (3) the corridor: floor and ceiling turrets, walkers, hatches.
    const three = sectionScripts(3500, 6000);
    for (const script of [
      'turret.floor:floor',
      'turret.floor:ceiling',
      'walker.floor:floor',
      'hatch.spawner:floor',
    ]) {
      expect(three, script).toContain(script);
    }
    // (4) orbiters in the high-speed section.
    expect(sectionScripts(6000, 8000)).toContain('orbiter.loop');
    // (5) the calm before the WARNING: two capsule carriers and nothing else.
    const calm = stage.events.filter(
      (e) => e.x >= 8000 && e.x < warningX && (e.type === 'spawn' || e.type === 'formation'),
    );
    expect(calm.map((e) => ('enemyId' in e ? db.enemies[e.enemyId].script : ''))).toEqual([
      'carrier.straight',
      'carrier.straight',
    ]);
    // Ground enemies only where the corridor gives them a floor or a ceiling.
    for (const event of stage.events) {
      if (event.type !== 'spawn' || db.enemies[event.enemyId].ground === null) continue;
      expect(event.x, db.enemies[event.enemyId].id).toBeGreaterThanOrEqual(3500);
      expect(event.x, db.enemies[event.enemyId].id).toBeLessThan(6000);
    }
    // The stage theme and the boss theme; the planet band drawn last on the mid layer.
    expect(stage.music).toMatchObject({ stage: 'Stage', boss: 'Boss' });
    const mid = stage.parallax.filter((p) => p.layer === 'mid');
    expect(mid[mid.length - 1]?.sprite).toBe('bg/azure-verge');
  });

  it('shapes its terrain: floors, the floor-and-ceiling corridor, an open arena for the boss', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-a' }, db);
    const map = game.world.terrain;
    expect(map).not.toBeNull();
    if (map === null) return;
    const ceiling = (x: number): boolean => terrainAt(map, x, 0) !== TerrainType.Empty;
    const floor = (x: number): boolean => terrainAt(map, x, PLAYFIELD_H - 1) !== TerrainType.Empty;
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    let ceilingColumns = 0;
    for (let x = 0; x < stage.length + 384; x += 4) {
      if (ceiling(x)) {
        ceilingColumns++;
        // A ceiling only in the corridor (section 3, a little beyond its checkpoint and end).
        expect(x, `ceiling at ${String(x)}`).toBeGreaterThanOrEqual(3400);
        expect(x, `ceiling at ${String(x)}`).toBeLessThan(6500);
      }
    }
    expect(ceilingColumns).toBeGreaterThan((6000 - 3500) / 4);
    for (const x of [600, 1000, 4000, 5500, 7000])
      expect(floor(x), `floor at ${String(x)}`).toBe(true);
    // The calm and the boss arena (the whole view at the WARNING and beyond): open space.
    for (let x = 8000; x < stage.length + 384; x += 4) {
      expect(ceiling(x) || floor(x), `rock at ${String(x)}`).toBe(false);
    }
    expect(warningX).toBeGreaterThan(8000);
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

  it('takes the scroll about three minutes to reach the WARNING (the run lasts 3–6 min)', () => {
    const runner = createStageRunner(stage, { event() {}, clear() {} });
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    let ticks = 0;
    while (runner.camera.x < warningX && ticks < 60 * 60 * 10) {
      runner.tick();
      ticks++;
    }
    expect(ticks / 60).toBeGreaterThanOrEqual(2.5 * 60);
    expect(ticks / 60).toBeLessThanOrEqual(4.5 * 60);
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

describe('integration: zones B–G hold to the plan and the 4-way design rules (M2-11 … M2-13)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => db.stages[db.stageIndex.get(id) ?? -1];
  const zoneA = new Set(
    [...stageEnemies(db, stageOf('zone-a'))].map((index) => db.enemies[index].id),
  );
  /** Everything a zone's timeline can bring in, its boss's and captains' minions included. */
  const zoneEnemies = (stage: StageSpec): Set<number> => {
    const used = stageEnemies(db, stage);
    for (const index of [...used]) {
      const minion = db.enemies[index].boss?.minionId ?? -1;
      if (minion >= 0) {
        used.add(minion);
        const child = db.enemies[minion].childId;
        if (child >= 0) used.add(child);
      }
    }
    return used;
  };
  /** The ids of the enemies the timelines of some stages place (their types). */
  const placedIn = (ids: readonly string[]): Set<string> =>
    new Set(ids.flatMap((id) => [...stageEnemies(db, stageOf(id))].map((i) => db.enemies[i].id)));
  // `earlier`: the zones a run can have flown before (a zone's "new" types are new to them);
  // `lanes`: the most separate laser lanes the boss may have up at once.
  const zones = [
    {
      id: 'zone-b',
      name: 'BRINE NEBULA',
      code: 'GM-02',
      boss: 'GALVANIC MAW',
      tileset: 'terrain-reef',
      earlier: ['zone-a'],
      lanes: 1,
    },
    {
      id: 'zone-c',
      name: 'DUNE EXPANSE',
      code: 'SW-03',
      boss: 'SANDGRAVE WIDOW',
      tileset: 'terrain-dune',
      earlier: ['zone-a'],
      lanes: 1,
    },
    {
      id: 'zone-d',
      name: 'MAGMA DEEP',
      code: 'CB-04',
      boss: 'CINDER BASTION',
      tileset: 'terrain-magma',
      earlier: ['zone-a', 'zone-b', 'zone-c'],
      lanes: 2,
    },
    {
      id: 'zone-e',
      name: 'TEMPEST RIDGE',
      code: 'SS-05',
      boss: 'SQUALL STEED',
      tileset: 'terrain-ridge',
      earlier: ['zone-a', 'zone-b', 'zone-c'],
      lanes: 0,
    },
    {
      id: 'zone-f',
      name: 'CELL VAULT',
      code: 'MR-06',
      boss: 'MANTLE REGENT',
      tileset: 'terrain-vault',
      earlier: ['zone-a', 'zone-b', 'zone-c', 'zone-d', 'zone-e'],
      lanes: 0,
    },
    {
      id: 'zone-g',
      name: 'PRISM LABYRINTH',
      code: 'FM-07',
      boss: 'FACET MONARCH',
      tileset: 'terrain-prism',
      earlier: ['zone-a', 'zone-b', 'zone-c', 'zone-d', 'zone-e'],
      lanes: 1,
    },
  ];

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
      const runner = createStageRunner(stage, { event() {}, clear() {} });
      let ticks = 0;
      while (runner.camera.x < (warning?.x ?? 0) && ticks < 60 * 60 * 10) {
        runner.tick();
        ticks++;
      }
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
      .map((e) => (e.type === 'block' ? e.x + (e.screenX ?? 400) : 0));
    expect(edges).toContain(region.x - 16);
    expect(edges).toContain(region.x + region.w);
    // The bonus stage: bonus capsules and a 1UP.
    const grotto = stageOf(entrance.stage);
    const drops = [...stageEnemies(db, grotto)].map((index) => db.enemies[index].drop);
    expect(drops).toContain('bonusCapsule');
    expect(drops).toContain('oneUp');
  });

  it('gives DUNE EXPANSE sand worms from the dunes, ceiling walkers and a spider-spawning boss', () => {
    const stage = stageOf('zone-c');
    const worms = stage.events.filter(
      (e) => e.type === 'formation' && db.enemies[e.enemyId].script === 'worm.burst',
    );
    expect(worms.length).toBeGreaterThanOrEqual(6);
    for (const worm of worms)
      expect(db.enemies[worm.type === 'formation' ? worm.enemyId : 0].ground).toBe('floor');
    const walkers = stage.events.filter(
      (e) =>
        e.type === 'spawn' &&
        db.enemies[e.enemyId].script === 'walker.floor' &&
        db.enemies[e.enemyId].ground === 'ceiling',
    );
    expect(walkers.length).toBeGreaterThanOrEqual(4);
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.phases.every((p) => p.script === 'boss.widow')).toBe(true);
    expect(db.enemies[boss?.minionId ?? -1]?.id).toBe('widow-drone');
    // The head needs its two fangs gone first.
    const head = boss?.parts.find((p) => p.core);
    expect(head?.vulnerable).toBe('afterParts');
    expect([...(head?.requires ?? [])].sort()).toEqual(['fang-bottom', 'fang-top']);
  });

  it('gives MAGMA DEEP erupting volcanoes, falling rocks, a dive into a destructible maze and a shielded core battleship', () => {
    const stage = stageOf('zone-d');
    const placed = (script: string, ground: string): number =>
      stage.events.filter(
        (e) =>
          (e.type === 'spawn' || e.type === 'formation') &&
          db.enemies[e.enemyId].script === script &&
          db.enemies[e.enemyId].ground === ground,
      ).length;
    // Erupting volcanoes on the surface floor, rocks that drop from the cave roofs.
    expect(placed('volcano.lob', 'floor')).toBeGreaterThanOrEqual(5);
    expect(placed('rock.fall', 'ceiling')).toBeGreaterThanOrEqual(6);
    // The dive: a map taller than the playfield, a scroll stop that pans the camera down into it.
    expect(stage.tilemap?.rowsTall ?? 0).toBeGreaterThanOrEqual(50);
    const dive = stage.camera.find((k) => (k.yTo ?? 0) >= 150);
    expect(dive?.hold ?? 0).toBeGreaterThan(0);
    const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
    expect(dive?.x ?? warningX).toBeLessThan(warningX / 2);
    // The destructible maze below: brick walls (breakable tiles), each with an open gap.
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-d' }, db);
    const map = game.world.terrain;
    const tileset = db.tilesets.find((t) => t.id === stage.tilemap?.tileset);
    const brick = (tileset?.tiles.findIndex((t) => t.name === 'brick') ?? -1) + 1;
    expect(tileset?.tiles[brick - 1]?.hp ?? 0).toBeGreaterThan(0);
    if (map === null) throw new Error('no terrain');
    const walls: number[][] = [];
    for (let col = 0; col < map.cols; col++) {
      const rows: number[] = [];
      for (let row = 0; row < map.rows; row++)
        if (map.tiles[row * map.cols + col] === brick) rows.push(row);
      if (rows.length > 0) walls.push(rows);
    }
    expect(walls.length).toBeGreaterThanOrEqual(10);
    for (const rows of walls) {
      expect(rows[0]).toBeGreaterThanOrEqual(PLAYFIELD_H / 8); // below the surface: in the caves
      let gap = 0;
      for (let k = 1; k < rows.length; k++) gap = Math.max(gap, rows[k] - rows[k - 1] - 1);
      expect(gap * 8).toBeGreaterThanOrEqual(24); // a gap the ship fits through
    }
    // CINDER BASTION: the core guarded by armoured arms on a pivot that turns, two lane emitters.
    const warning = stage.events.find((e) => e.type === 'warning');
    const boss = warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
    expect(boss?.phases.every((p) => p.script === 'boss.bastion')).toBe(true);
    const parts = boss?.parts ?? [];
    const core = parts.findIndex((p) => p.core);
    const hubs = parts.filter(
      (p) => p.parentIndex === core && p.hurtbox === null && p.radius === 0,
    );
    expect(hubs).toHaveLength(1);
    const hub = parts.indexOf(hubs[0]);
    const onHub = (index: number): boolean =>
      index >= 0 && (parts[index].parentIndex === hub || onHub(parts[index].parentIndex));
    const arms = parts.filter((_p, i) => onHub(i));
    expect(arms.length).toBeGreaterThanOrEqual(4);
    for (const arm of arms) {
      expect(arm.vulnerable).toBe('never');
      expect(arm.radius).toBeGreaterThan(0); // turned parts are hit as circles
    }
    expect(parts.filter((p) => p.gun)).toHaveLength(2);
    for (const phase of boss?.phases ?? []) expect(phase.params.spin ?? 4).not.toBe(0);
  });

  it('gives TEMPEST RIDGE rear attackers, heavy weather, jagged ridges and a seahorse launching homing minis', () => {
    const stage = stageOf('zone-e');
    // Rear attackers: enemies spawned behind the view that overtake the ship.
    const rear = stage.events.filter(
      (e) => (e.type === 'spawn' || e.type === 'formation') && (e.screenX ?? 400) < 0,
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

  /**
   * The **arms** of a boss (M2-13): chains of circle-hit parts, each hung from a part that is not
   * one (its root's parent), as lists of part indices from the root to the tip.
   */
  const bossArms = (parts: readonly BossPartSpec[]): number[][] => {
    const isArm = (i: number): boolean => parts[i].radius > 0 && parts[i].parentIndex >= 0;
    const arms: number[][] = [];
    parts.forEach((_part, root) => {
      if (!isArm(root) || isArm(parts[root].parentIndex)) return;
      const chain = [root];
      for (;;) {
        const last = chain[chain.length - 1];
        const next = parts.findIndex((p, i) => isArm(i) && p.parentIndex === last);
        if (next < 0) break;
        chain.push(next);
      }
      arms.push(chain);
    });
    return arms;
  };

  /**
   * The map columns of a zone that hold a tile, each as the list of map rows holding it.
   *
   * @param id - Stage id.
   * @param tile - Tile id (1-based; 0 = none).
   * @returns Rows per column that has the tile.
   */
  const tileColumns = (id: string, tile: number): number[][] => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: id }, db);
    const map = game.world.terrain;
    if (map === null) throw new Error('no terrain');
    const columns: number[][] = [];
    for (let col = 0; col < map.cols; col++) {
      const rows: number[] = [];
      for (let row = 0; row < map.rows; row++)
        if (map.tiles[row * map.cols + col] === tile) rows.push(row);
      if (rows.length > 0) columns.push(rows);
    }
    return columns;
  };

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
      expect(gap * 8).toBeGreaterThanOrEqual(48);
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

  it('gives PRISM LABYRINTH crystal walls, a seeded cube rush, a crystal core with tentacle arms and a hidden bonus stage', () => {
    const stage = stageOf('zone-g');
    // Crystal walls: rock hanging from the ceiling past the playfield's middle row, and rising
    // from the floor past it, in turn — the labyrinth (drawn with the tileset's wall edges).
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-g' }, db);
    const map = game.world.terrain;
    if (map === null) throw new Error('no terrain');
    const middle = Math.floor(PLAYFIELD_H / 16);
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
      // The DSL patterns the zone's enemies run (every `speed` literal of their fire ops).
      const patterns = JSON.stringify(
        shippedFiles.find((file) => file.path === 'patterns/zones.patterns.json')?.data,
      );
      for (const match of patterns.matchAll(/"speed":\s*([0-9.]+)/g)) {
        expect(Number(match[1])).toBeLessThanOrEqual(MAX_AIMED_BULLET_SPEED);
      }
    },
  );

  it.each(zones)(
    'places the capsules of $name for recovery: ≥ 12 before the boss, ≥ 3 after every checkpoint',
    (zone) => {
      const stage = stageOf(zone.id);
      const capsule = (event: StageSpec['events'][number]): boolean =>
        event.type === 'spawn'
          ? db.enemies[event.enemyId].drop === 'capsule'
          : event.type === 'formation' && event.drop !== null;
      const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
      const sources = stage.events.filter(capsule).map((e) => e.x);
      expect(sources.filter((x) => x < warningX).length).toBeGreaterThanOrEqual(12);
      for (const checkpoint of stage.checkpoints) {
        const after = sources.filter((x) => x >= checkpoint.x && x < checkpoint.x + 900);
        expect(after.length, `checkpoint ${String(checkpoint.x)}`).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.each(zones)('stands the ground enemies of $name on rock', (zone) => {
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
      const x = event.x + (event.screenX ?? 400);
      const top = Math.round(runner.camera.y);
      // Rock in the lower (floor) or upper (ceiling) third of the playfield below / above it.
      const rows = (enemy.ground === 'floor' ? [PLAYFIELD_H - 1, PLAYFIELD_H - 8] : [0, 7]).map(
        (y) => top + y,
      );
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

  it('draws every zone B–G sprite with its hit flash; the zone tilesets have every tile', () => {
    const { manifest } = buildAtlas();
    const sprites = new Set<string>();
    const stages = ['zone-b', 'zone-c', 'brine-grotto', 'zone-d', 'zone-e', 'zone-f', 'zone-g'];
    for (const id of [...stages, 'glimmer-cache']) {
      for (const index of zoneEnemies(stageOf(id))) {
        const enemy = db.enemies[index];
        if (enemy.boss === null) sprites.add(enemy.sprite);
        for (const part of enemy.boss?.parts ?? []) {
          // Parts that can be hit flash; decoration (no hurtbox: a tail fin, the legs) never is.
          if (part.sprite !== undefined && part.hurtbox !== null) {
            sprites.add(part.sprite);
          }
        }
      }
    }
    expect(sprites.size).toBeGreaterThanOrEqual(60);
    for (const sprite of sprites) {
      const frames = manifest.sprites[sprite]?.frames.length ?? 0;
      expect(frames, sprite).toBeGreaterThan(0);
      const flash = manifest.sprites[sprite]?.flash ?? null;
      expect(flash, sprite).not.toBeNull();
      expect(manifest.sprites[flash ?? '']?.frames.length, sprite).toBe(frames);
    }
    const a = db.tilesets.find((t) => t.id === 'terrain-a');
    const zoneSets = ['terrain-reef', 'terrain-dune', 'terrain-magma', 'terrain-ridge'];
    for (const id of [...zoneSets, 'terrain-vault', 'terrain-prism']) {
      const tileset = db.tilesets.find((t) => t.id === id);
      expect(tileset?.tiles.map((t) => t.name)).toEqual(a?.tiles.map((t) => t.name));
      expect(manifest.sprites[tileset?.sprite ?? '']?.frames.length).toBe(a?.tiles.length);
    }
  });
});

describe('integration: zones H and I, the finales, hold to the plan and the 4-way rules (M2-14)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => db.stages[db.stageIndex.get(id) ?? -1];
  const bossOf = (stage: StageSpec): BossSpec | null => {
    const warning = stage.events.find((e) => e.type === 'warning');
    return warning?.type === 'warning' ? db.enemies[warning.enemyId].boss : null;
  };
  /** Everything a zone can bring in: its timeline's enemies, the bosses inside and the minions. */
  const zoneEnemies = (stage: StageSpec): Set<number> => {
    const used = stageEnemies(db, stage);
    for (let pass = 0; pass < 3; pass++) {
      for (const index of [...used]) {
        const boss = db.enemies[index].boss;
        if (boss === null) continue;
        for (const id of [boss.minionId, boss.innerId]) {
          if (id < 0) continue;
          used.add(id);
          const child = db.enemies[id].childId;
          if (child >= 0) used.add(child);
        }
      }
    }
    return used;
  };
  const earlierZones = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((z) => 'zone-' + z);
  const zones = [
    {
      id: 'zone-h',
      name: 'IRON CITADEL',
      code: 'IS-08',
      boss: 'IRON SOVEREIGN',
      tileset: 'terrain-citadel',
    },
    {
      id: 'zone-i',
      name: 'ABYSSAL THRONE',
      code: 'AA-09',
      boss: 'ABYSS ARK',
      tileset: 'terrain-abyss',
    },
  ];
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
      const runner = createStageRunner(stage, { event() {}, clear() {} });
      let ticks = 0;
      while (runner.camera.x < (warning?.x ?? 0) && ticks < 60 * 60 * 10) {
        runner.tick();
        ticks++;
      }
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
    expect(speed).toBeLessThan(0.75); // a slow hangar
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
    for (let x = calmX; x < stage.length + 384; x += 8) {
      for (let y = 0; y < PLAYFIELD_H; y += 8) {
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
      const sources = stage.events
        .filter((e) =>
          e.type === 'spawn'
            ? db.enemies[e.enemyId].drop === 'capsule'
            : e.type === 'formation' && e.drop !== null,
        )
        .map((e) => e.x);
      const warningX = stage.events.find((e) => e.type === 'warning')?.x ?? 0;
      expect(sources.filter((x) => x < warningX).length).toBeGreaterThanOrEqual(12);
      for (const checkpoint of stage.checkpoints) {
        const after = sources.filter((x) => x >= checkpoint.x && x < checkpoint.x + 900);
        expect(after.length, `checkpoint ${String(checkpoint.x)}`).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.each(zones)('stands the ground enemies of $name on rock', (zone) => {
    const stage = stageOf(zone.id);
    const map = createGame(createHeadlessPlatform(), { seed: 1, stage: zone.id }, db).world.terrain;
    if (map === null) throw new Error('no terrain');
    let ground = 0;
    for (const event of stage.events) {
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      const enemy = db.enemies[event.enemyId];
      if (enemy.ground === null) continue;
      ground++;
      const x = event.x + (event.screenX ?? 400);
      const rows = enemy.ground === 'floor' ? [PLAYFIELD_H - 1, PLAYFIELD_H - 8] : [0, 7];
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

  it('draws every zone H and I sprite with its hit flash; the zone tilesets have every tile', () => {
    const { manifest } = buildAtlas();
    const sprites = new Set<string>();
    for (const id of ['zone-h', 'zone-i']) {
      for (const index of zoneEnemies(stageOf(id))) {
        const enemy = db.enemies[index];
        if (enemy.boss === null) sprites.add(enemy.sprite);
        for (const part of enemy.boss?.parts ?? []) {
          if (part.sprite !== undefined && part.hurtbox !== null) sprites.add(part.sprite);
        }
      }
    }
    expect(sprites.size).toBeGreaterThanOrEqual(24);
    for (const sprite of sprites) {
      const frames = manifest.sprites[sprite]?.frames.length ?? 0;
      expect(frames, sprite).toBeGreaterThan(0);
      const flash = manifest.sprites[sprite]?.flash ?? null;
      expect(flash, sprite).not.toBeNull();
      expect(manifest.sprites[flash ?? '']?.frames.length, sprite).toBe(frames);
    }
    const a = db.tilesets.find((t) => t.id === 'terrain-a');
    for (const id of ['terrain-citadel', 'terrain-abyss']) {
      const tileset = db.tilesets.find((t) => t.id === id);
      expect(tileset?.tiles.map((t) => t.name)).toEqual(a?.tiles.map((t) => t.name));
      expect(manifest.sprites[tileset?.sprite ?? '']?.frames.length).toBe(a?.tiles.length);
    }
    // The ending scenes' pieces (UI sprites).
    for (const sprite of ['ui/ending-citadel', 'ui/ending-ark', 'ui/ending-blast', 'ui/ending-sun'])
      expect(manifest.sprites[sprite]?.frames.length ?? 0, sprite).toBeGreaterThan(0);
  });

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
