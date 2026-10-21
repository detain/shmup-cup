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
 * Since R5-P.P2a the zones' own tests are split into one `content-zone-<letter>.test.ts` per
 * zone — the 4-way design rules (shmup_feat.md §4 rule 2, D17: no aimed bullet over 2 px/tick,
 * no two simultaneous laser lanes closer than 16 px, the recovery rule of §10) and each zone's
 * plan structure, over the shared fixtures of `zones/helpers.ts`. This file keeps the generic
 * validation above and the checks that span zones: the sprite-draw tests of the B–G and H / I
 * groups (the zones' own cases live in the split files since R5-P.P2b).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BULLET_PALETTES,
  BULLET_SPRITES,
  BodyAnchor,
  BonusEntrance,
  DEFAULT_DIFFICULTY_TABLE,
  DEFAULT_SCORING_RULES,
  DEFAULT_UI_TEXT,
  DIFFICULTY_PRESETS,
  FIXED_UI_TEXT_IDS,
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  MAX_UI_TEXT_LENGTH,
  MUSIC_CUES,
  SFX_CUE_NAMES,
  UI_LANGUAGES,
  UI_TEXT_IDS,
  WARNING_PULSE_TICKS,
  checkEnemyBehaviors,
  checkWeaponBehaviors,
  createGame,
  createHeadlessPlatform,
  createSaveStore,
  computeRank,
  isUiTextDrawable,
  loadContent,
  powerRank,
  resolveGameConfig,
  resolveUiText,
  spawnPlayer,
  uiLanguageIds,
  uiLanguageLabel,
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
import { v1x, v1speed } from '../../packages/core/test/helpers/v1-port.js';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../vite.shared.js';
import { shippedDb, zoneEnemies as zoneEnemiesOf } from './zones/helpers.js';

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
      'audio/music/escape.music.json',
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
      'input/webos.input-profiles.json',
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
      // The UI string tables (M2-16).
      strings: ['strings'],
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

  it('ships the English UI string table (M2-16), equal to the built-in one, every id present', () => {
    const { db } = loadContent(shippedFiles);
    const en = db.uiStrings.find((table) => table.language === 'en');
    expect(en).toBeDefined();
    expect(Object.keys(en?.strings ?? {})).toEqual(UI_TEXT_IDS);
    expect(en?.strings).toEqual(DEFAULT_UI_TEXT);
    // The example is a partial translation: its ids are known, the rest falls back to English.
    const example = loadContent(read(['strings/example.strings.json']));
    expect(example.issues).toEqual([]);
    expect(example.db.uiStrings[0]?.language).toBe('fr');
  });

  // Plan M3-03's acceptance: "string coverage per language". Every shipped table must answer
  // every id — a gap would silently fall back to English mid-screen, which reads as a bug.
  it('ships a complete table for every language the game offers (M3-03)', () => {
    const { db, issues } = loadContent(shippedFiles);
    expect(issues).toEqual([]);
    const languages = uiLanguageIds(db.uiStrings);
    expect(languages).toEqual(['en', 'es', 'ja']);
    expect(UI_LANGUAGES.map((language) => language.id)).toEqual(languages);
    for (const language of languages) {
      const table = db.uiStrings.find((entry) => entry.language === language);
      expect(table, language).toBeDefined();
      expect(Object.keys(table?.strings ?? {}), language).toEqual(UI_TEXT_IDS);
      const text = resolveUiText(table?.strings);
      for (const id of UI_TEXT_IDS) {
        expect(text[id].length, `${language}.${id}`).toBeGreaterThan(0);
        expect(text[id].length, `${language}.${id}`).toBeLessThanOrEqual(MAX_UI_TEXT_LENGTH);
        // Every character must be one the bitmap font really carries (M3-03: the font source and
        // `UI_GLYPHS` are kept equal by test/scripts/assets/font.test.ts).
        expect(isUiTextDrawable(text[id]), `${language}.${id}: ${text[id]}`).toBe(true);
        // `{0}` / `{1}` are filled by the scenes: a translation may not lose or invent one.
        const slots = (template: string): string[] => template.match(/\{[01]\}/g)?.sort() ?? [];
        expect(slots(text[id]), `${language}.${id}`).toEqual(slots(DEFAULT_UI_TEXT[id]));
      }
      // The fixed ids (the HUD's few-pixel codes, the game's name, the symbols) never change.
      for (const id of FIXED_UI_TEXT_IDS) {
        expect(text[id], `${language}.${id}`).toBe(DEFAULT_UI_TEXT[id]);
      }
    }
  });

  it('names every language in its own script, drawable by the font (M3-03)', () => {
    for (const language of UI_LANGUAGES) {
      expect(isUiTextDrawable(language.label), language.id).toBe(true);
      expect(uiLanguageLabel(language.id)).toBe(language.label);
    }
    expect(uiLanguageLabel('fr')).toBe('FR'); // a table the game does not name is still offered
  });

  // The whole localization path in one test: the save's choice → the flow's table → the screen.
  it('shows the language the save chose, and falls back when the content lost it (M3-03)', () => {
    const { db } = loadContent(shippedFiles);
    const platform = createHeadlessPlatform();
    /**
     * A game whose save asks for a language.
     *
     * @param language - The saved `options.display.language`.
     * @returns Its scene flow.
     */
    const flowFor = (language: string) => {
      const save = createSaveStore(null);
      save.setOptions({ ...save.options, display: { ...save.options.display, language } });
      return createGame(platform, {}, db, { scenes: 'title', save }).scenes!;
    };
    const en = flowFor('en');
    expect([en.language, en.text.titleOptions]).toEqual(['en', 'OPTIONS']);
    const es = flowFor('es');
    expect(es.language).toBe('es');
    expect(es.text.titleOptions).toBe(
      db.uiStrings.find((table) => table.language === 'es')?.strings.titleOptions,
    );
    expect(es.text.titleOptions).not.toBe('OPTIONS');
    const ja = flowFor('ja');
    expect(ja.language).toBe('ja');
    expect(isUiTextDrawable(ja.text.titleOptions)).toBe(true);
    // A fixed id stays English whatever the table says (the HUD cannot grow).
    for (const flow of [es, ja]) {
      for (const id of FIXED_UI_TEXT_IDS) expect(flow.text[id], id).toBe(DEFAULT_UI_TEXT[id]);
      expect(flow.languages).toEqual(['en', 'es', 'ja']);
    }
    // A save naming a language the content no longer carries falls back to English, never blank.
    const gone = flowFor('fr');
    expect([gone.language, gone.text.titleOptions]).toEqual(['en', 'OPTIONS']);
  });

  it('refuses a translation that redraws a fixed id or uses a glyph the font lacks (M3-03)', () => {
    const bad = {
      path: 'strings/zz.strings.json',
      data: {
        formatVersion: 1,
        kind: 'strings',
        language: 'zz',
        strings: { gameTitle: 'ANOTHER GAME', pressOk: 'ДАВАЙ' },
      },
    };
    const { issues } = loadContent([...shippedFiles, bad]);
    expect(issues.map((issue) => issue.message)).toEqual([
      '"gameTitle" is the same in every language: it must stay "SHMUP CUP"',
      'uses a character the bitmap font does not have',
    ]);
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
    expect(vane?.revenge).toEqual({ minRank: 12, pattern: 'aimed', speed: v1speed(1.25) });
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
    expect(kestrel?.speeds).toEqual([1.5, 2, 2.5, 3, 3.5, 4].map(v1speed));
    expect(kestrel?.hurtRadius).toBe(v1x(1.5));
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
      'escape',
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
      'escape',
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

describe('integration: zones B–G hold to the plan and the 4-way design rules (M2-11 … M2-13)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => db.stages[db.stageIndex.get(id) ?? -1];
  const zoneEnemies = (stage: StageSpec): Set<number> => zoneEnemiesOf(db, stage);

  // R5-P.P2b moved the zones' own cases out; the group-wide check remains.
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
      expect(tileset?.tiles.slice(0, a?.tiles.length).map((t) => t.name)).toEqual(
        a?.tiles.map((t) => t.name),
      );
      expect(manifest.sprites[tileset?.sprite ?? '']?.frames.length).toBeGreaterThanOrEqual(
        tileset?.tiles.length ?? 0,
      );
    }
  });
});

describe('integration: zones H and I, the finales, hold to the plan and the 4-way rules (M2-14)', () => {
  const db = shippedDb();
  const stageOf = (id: string): StageSpec => db.stages[db.stageIndex.get(id) ?? -1];
  const zoneEnemies = (stage: StageSpec): Set<number> => zoneEnemiesOf(db, stage);

  // R5-P.P2b moved the finales' cases to content-zone-h/-i.test.ts; the group-wide check
  // stays beside its B–G twin.

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
      expect(tileset?.tiles.slice(0, a?.tiles.length).map((t) => t.name)).toEqual(
        a?.tiles.map((t) => t.name),
      );
      expect(manifest.sprites[tileset?.sprite ?? '']?.frames.length).toBeGreaterThanOrEqual(
        tileset?.tiles.length ?? 0,
      );
    }
    // The ending scenes' pieces (UI sprites).
    for (const sprite of ['ui/ending-citadel', 'ui/ending-ark', 'ui/ending-blast', 'ui/ending-sun'])
      expect(manifest.sprites[sprite]?.frames.length ?? 0, sprite).toBeGreaterThan(0);
  });
});
