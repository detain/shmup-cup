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
  BossState,
  DEFAULT_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIORS,
  DEFAULT_DIFFICULTY_TABLE,
  DEFAULT_SCORING_RULES,
  DIFFICULTY_PRESETS,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MUSIC_CUES,
  PLAYFIELD_H,
  SFX_CUE_NAMES,
  TerrainType,
  WARNING_PULSE_TICKS,
  checkEnemyBehaviors,
  checkWeaponBehaviors,
  createGame,
  createHeadlessPlatform,
  computeRank,
  createStageRunner,
  loadContent,
  powerRank,
  resolveGameConfig,
  terrainAt,
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
      'audio/music/boss.music.json',
      'audio/music/game-over.music.json',
      'audio/music/stage-clear.music.json',
      'audio/music/title.music.json',
      'audio/music/zone-a.music.json',
      'audio/music/zone-b.music.json',
      'audio/music/zone-c.music.json',
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
      'game-over',
      'stage-clear',
      'title',
      'zone-a',
      'zone-b',
      'zone-c',
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
      'title',
      'zone-a',
      'zone-b',
      'zone-c',
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

describe('integration: zones B and C hold to the plan and the 4-way design rules (M2-11)', () => {
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
  const zones = [
    {
      id: 'zone-b',
      name: 'BRINE NEBULA',
      code: 'GM-02',
      boss: 'GALVANIC MAW',
      tileset: 'terrain-reef',
    },
    {
      id: 'zone-c',
      name: 'DUNE EXPANSE',
      code: 'SW-03',
      boss: 'SANDGRAVE WIDOW',
      tileset: 'terrain-dune',
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
    const placed = new Set<string>();
    for (const event of stage.events) {
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      const enemy = db.enemies[event.enemyId];
      if (!zoneA.has(enemy.id)) placed.add(enemy.sprite);
    }
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
        // Bodies that chase or dash at the ship are held to the same speed.
        if (enemy.script === 'rocket.homing' || enemy.script === 'rammer.aimed')
          speeds.push(params.speed);
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
    let ground = 0;
    for (const event of stage.events) {
      if (event.type !== 'spawn' && event.type !== 'formation') continue;
      const enemy = db.enemies[event.enemyId];
      if (enemy.ground === null) continue;
      ground++;
      const x = event.x + (event.screenX ?? 400);
      // Rock in the lower (floor) or upper (ceiling) third of the playfield below / above it.
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
      // At most one silk line at a time (the widow), none from the fish.
      expect(rules.maxSeparate).toBeLessThanOrEqual(1);
    },
  );

  it('draws every zone B and C sprite with its hit flash; the zone tilesets have every tile', () => {
    const { manifest } = buildAtlas();
    const sprites = new Set<string>();
    for (const id of ['zone-b', 'zone-c', 'brine-grotto']) {
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
    expect(sprites.size).toBeGreaterThanOrEqual(20);
    for (const sprite of sprites) {
      const frames = manifest.sprites[sprite]?.frames.length ?? 0;
      expect(frames, sprite).toBeGreaterThan(0);
      const flash = manifest.sprites[sprite]?.flash ?? null;
      expect(flash, sprite).not.toBeNull();
      expect(manifest.sprites[flash ?? '']?.frames.length, sprite).toBe(frames);
    }
    const a = db.tilesets.find((t) => t.id === 'terrain-a');
    for (const id of ['terrain-reef', 'terrain-dune']) {
      const tileset = db.tilesets.find((t) => t.id === id);
      expect(tileset?.tiles.map((t) => t.name)).toEqual(a?.tiles.map((t) => t.name));
      expect(manifest.sprites[tileset?.sprite ?? '']?.frames.length).toBe(a?.tiles.length);
    }
  });
});
