/**
 * "Original names, art and music only" for the AI art prompt library (plan R3-05,
 * `shmup_feat.md` §26, `docs/dev/art-bible-v2.md` §7, `docs/dev/art-provenance.md` §7).
 *
 * A prompt that names a real game, studio, artist or character asks the model for a look-alike,
 * and a look-alike is exactly what §26 forbids. So this file reads every text file of the prompt
 * library — `art-prompts/**` (the kernels and prompt sources, the compiled `.json` libraries, the
 * v2 picks manifest, the committed outputs' sidecars that record what was sent) and the
 * provenance and recipe files the R3-02 ingest tool writes under `assets/source/` — and fails on
 * any name of the denylist below.
 *
 * **Read-only.** Nothing here writes a file. `art-prompts/v2/` belongs to the art round, so a hit
 * there is *reported* (pinned in {@link KNOWN_HITS} with the reason) and fixed by the owner, never
 * by an agent. The pin is exact: a new hit fails, and so does a pinned hit that is gone — remove
 * its row then.
 *
 * **What is skipped:** `node_modules/` and `art-prompts/v2/candidates/` — both git-ignored, so
 * the scan reads the same files on every machine. Candidates become committed files (and so are
 * scanned) when round 2 copies the winners to `art-prompts/v2/winners/`.
 *
 * **The denylist** comes from the project's own lists — the series the game is "in the spirit
 * of", their makers and the names §26 bans, the bosses of shmup_feat.md's appendices A and B —
 * plus the obvious neighbours: other shoot-'em-up series and their makers, the big game and film
 * franchises image models reproduce on request, artists whose names are used as style
 * shortcuts, and the phrases that make a style reference ("in the style of …"). Words that are
 * also everyday English are left out on purpose ({@link GENERIC_WORDS}): a scan that fails on
 * "cave" or "treasure" would be switched off, not obeyed. Console names are a separate list:
 * "SNES" is allowed while the owner decides (`art-provenance.md`, open decision 6), every other
 * platform name fails.
 *
 * It is a string search, not understanding: a misspelt name passes, and a name split across a
 * line of Markdown passes. It catches the common case — a name typed into a prompt — which is
 * the one that matters.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** One denied name and why it is denied. */
interface NameRule {
  /** The name as written; matching ignores case and spaces, `-` or `_` between the words. */
  readonly term: string;
  /** Where the rule comes from. */
  readonly why: string;
}

const FEAT_26 = 'shmup_feat.md §26 (named in the legal notes)';
const FEAT_SERIES = 'shmup_feat.md: a series the game is inspired by, or its maker';
const FEAT_APPENDIX = 'shmup_feat.md appendix A/B: a boss or ship name of those series';
const GENRE = 'another shoot-em-up series or its maker (trade dress)';
const STUDIO = 'a game or film studio / publisher';
const FRANCHISE = 'a game, film or anime franchise or character image models reproduce';
const ARTIST = 'an artist name used as a style shortcut (art bible §7)';
const STYLE = 'a style-reference phrase (art bible §7: describe the look in plain words)';
const PLATFORM = 'a console or computer platform name (trademark)';

/** Names no prompt may contain. */
const DENIED: readonly NameRule[] = [
  // The series the game is in the spirit of, their makers, and what §26 names.
  ...['Gradius', 'Darius', 'Konami', 'Taito'].map((term) => ({ term, why: FEAT_SERIES })),
  ...['Vic Viper', 'Silver Hawk', 'Big Core', 'Moai', 'huge battleship'].map((term) => ({
    term,
    why: FEAT_26,
  })),
  ...[
    'Parodius',
    'Twinbee',
    'Lord British',
    'Bacterion',
    'Tetran',
    'Covered Core',
    'Crystal Core',
    'Dellinger Core',
    'Lizard Core',
    'Death Mk',
    'Vulture Dragon',
    'Choking Weed',
    'Shadow Gear',
    'Gregol',
    'Dogas',
    'Vaif',
    'Killer Higia',
    'King Fossil',
    'Queen Fossil',
    'Dark Coronatus',
    'Hyper Great Thing',
    'Super Alloy Lantern',
    'Pente Shark',
  ].map((term) => ({ term, why: FEAT_APPENDIX })),
  // Other shoot-'em-ups and their makers.
  ...[
    'R-Type',
    'Bydo',
    'Irem',
    'Thunder Force',
    'Technosoft',
    'Toaplan',
    'Truxton',
    'Tatsujin',
    'Raiden',
    'Seibu',
    'Ikaruga',
    'Radiant Silvergun',
    'Einhander',
    'Einhänder',
    'Axelay',
    'Psikyo',
    'Raizing',
    'DoDonPachi',
    'DonPachi',
    'Mushihimesama',
    'Espgaluda',
    'Batsugun',
    'Touhou',
    'Xevious',
    'Galaga',
    'Galaxian',
    'Zaxxon',
    'Space Invaders',
    'Silpheed',
    'Aleste',
    'Pulstar',
    'Blazing Star',
    'Blazing Lazers',
    'Gley Lancer',
    'Gynoug',
    'Area 88',
    'Metal Slug',
    'Star Fox',
  ].map((term) => ({ term, why: GENRE })),
  // Studios and publishers.
  ...[
    'Capcom',
    'SNK',
    'Sega',
    'Nintendo',
    'Namco',
    'Bandai',
    'Hudson Soft',
    'Square Enix',
    'Atlus',
    'Falcom',
    'Data East',
    'Jaleco',
    'Kaneko',
    'Activision',
    'Ubisoft',
    'Bungie',
    'Electronic Arts',
    'Disney',
    'Pixar',
    'Marvel Comics',
    'DC Comics',
    'Lucasfilm',
    'Ghibli',
    'Toho',
    'Gainax',
    'Studio Trigger',
    'Kyoto Animation',
  ].map((term) => ({ term, why: STUDIO })),
  // Franchises and characters.
  ...[
    'Mario',
    'Luigi',
    'Zelda',
    'Pokemon',
    'Pokémon',
    'Pikachu',
    'Sonic the Hedgehog',
    'Mega Man',
    'Rockman',
    'Metroid',
    'Samus',
    'Kirby',
    'Donkey Kong',
    'Pac-Man',
    'Gundam',
    'Macross',
    'Evangelion',
    'Godzilla',
    'Ultraman',
    'Star Wars',
    'Star Trek',
    'X-Wing',
    'TIE Fighter',
    'Millennium Falcon',
    'Death Star',
    'Darth',
    'Xenomorph',
    'Master Chief',
    'Warhammer',
    'Metal Gear',
    'Final Fantasy',
    'Dragon Ball',
    'Akira',
    'Space Battleship Yamato',
    'Voltron',
    'Tron',
    'Blade Runner',
    'Cyberpunk 2077',
    'Ghost in the Shell',
    'Hello Kitty',
  ].map((term) => ({ term, why: FRANCHISE })),
  // Artists.
  ...[
    'Miyazaki',
    'Toriyama',
    'Jean Giraud',
    'Giger',
    'Syd Mead',
    'Yoshitaka Amano',
    'Otomo',
    'Shirow',
    'Shinkawa',
    'Tetsuya Nomura',
    'Rutkowski',
    'Alphonse Mucha',
    'Mark Ferrari',
    'Paul Robertson',
    'eBoy',
    'Slynyrd',
    'Pedro Medeiros',
    'Waneella',
    'Kirokaze',
    'Octavi Navarro',
    'Miyamoto',
    'Kojima',
    'Yuzo Koshiro',
    'Beeple',
    'Stalenhag',
    'Stålenhag',
    'McQuarrie',
    'Chris Foss',
    'John Berkey',
    'Craig Mullins',
    'Feng Zhu',
    'Ian McQue',
    'Hokusai',
    'Van Gogh',
  ].map((term) => ({ term, why: ARTIST })),
  // Style-reference phrasing.
  ...[
    'in the style of',
    'in the manner of',
    'homage to',
    'fan art',
    'fanart',
    'artstation',
    'deviantart',
    'pixiv',
    'behance',
    'by the artist',
    'sprite rip',
    'ripped sprite',
    'from the movie',
    'from the anime',
    'official art',
  ].map((term) => ({ term, why: STYLE })),
  // Platforms (SNES is allowed for now — ALLOWED_PLATFORM_TERMS).
  ...[
    'Super Famicom',
    'Famicom',
    'NES',
    'Mega Drive',
    'PC Engine',
    'TurboGrafx',
    'Neo Geo',
    'Game Boy',
    'PlayStation',
    'Dreamcast',
    'Amiga',
    'Atari',
    'MSX',
    'X68000',
  ].map((term) => ({ term, why: PLATFORM })),
];

/**
 * Platform names the library may use for now, with the reason. Each must still occur — a row
 * whose name is gone fails, so the list never outlives its reason.
 */
const ALLOWED_PLATFORM_TERMS: readonly { term: string; why: string }[] = [
  {
    term: 'SNES',
    why:
      'about 1,400 uses as an era descriptor ("SNES-era 16-bit pixel art"), from kernel K1 ' +
      'and so in most prompts; it names a console (Nintendo trademark), not a game, ' +
      'studio or character; the owner decides whether round 2 moves to "16-bit era" ' +
      '(art-provenance.md, open decision 6)',
  },
];

/**
 * Names of the series' bosses and ships that are also everyday words, so not on the denylist:
 * a rule that fires on ordinary prose gets switched off. Listed so nobody "fixes" the omission.
 */
const GENERIC_WORDS: readonly string[] = [
  'Salamander', // an animal; also a series title
  'Life Force', // a phrase; also a series title
  'Nemesis', // a word; also a series title
  'Goliath', // Gradius III boss
  'Wyvern', // Gradius III boss
  'Bubble Eye', // a goldfish breed; Gradius III boss
  'Disrupt',
  'Beacon',
  'Demon Sword', // Darius Twin bosses and captains:
  'Dual Shears',
  'Red Mist',
  'Full Metal Shell',
  'Great Tusk',
  'Dark Angel',
  'Blowhard',
  'Radiator',
  'Cave', // a studio, and the MAGMA DEEP caves
  'Treasure', // a studio, and treasure chests
  'Compile', // a studio
  'Contra', // a series, and "contra-rotating"
  'Halo', // a series, and every glow halo
  'Transformers', // a franchise, and the ML library
  'Saturn', // a console, and the planet
  'Genesis', // a console, and an everyday word (Sega is denied)
  'Commodore', // a computer maker, and a naval rank
  'Moebius', // an artist, and the Moebius strip (Jean Giraud is denied)
  'inspired by', // a style phrase, but also "inspired by coral reefs"
  'from the game', // a style phrase, but also "from the game's palette"
  'arcade', // the genre
];

/** A pinned hit: reported to the owner, not fixed here. */
interface KnownHit {
  /** Repo-relative path, `/`-separated. */
  readonly file: string;
  /** The {@link NameRule.term} that matched. */
  readonly term: string;
  /** How many times it matches in that file. */
  readonly count: number;
  /** Why it stays for now. */
  readonly why: string;
}

/** Hits in files no agent may edit, reported in `art-provenance.md` §7. */
const KNOWN_HITS: readonly KnownHit[] = [
  {
    file: 'art-prompts/v2/manifest.json',
    term: 'Crystal Core',
    count: 1,
    why:
      'the FACET MONARCH item label "the crystal core with an orbiting crown" (a picker label, ' +
      'not a prompt) — descriptive, but also a boss name of the series; art-prompts/v2/ is the ' +
      "art round's, so the owner rewords it after round 2",
  },
];

/** Extensions read as text; images, clips and other binaries are never opened. */
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.json',
  '.jsonl',
  '.txt',
  '.csv',
  '.yaml',
  '.yml',
  '.mjs',
  '.cjs',
  '.js',
  '.ts',
  '.sh',
]);

/** Directories never entered: git-ignored, so not the same on every machine. */
const SKIPPED_DIRS = new Set(['node_modules', 'candidates']);

/**
 * Builds the matcher of one term: case-insensitive, any run of spaces, `-` or `_` between its
 * words (so "Vic Viper", "vic-viper" and "VicViper" all match), and no letter or digit on either
 * side (so "Irem" spares "firem…" and "Tron" spares "electron").
 *
 * @param term - The term as written.
 * @returns A global, case-insensitive, Unicode-aware expression.
 */
function termPattern(term: string): RegExp {
  const words = term
    .split(/[\s_-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join('[\\s_-]*')}(?![\\p{L}\\p{N}])`, 'giu');
}

/** A term with its compiled matcher. */
interface CompiledRule {
  readonly term: string;
  readonly pattern: RegExp;
}

/**
 * Counts the matches of every rule in a text.
 *
 * @param text - The file's contents.
 * @param rules - The compiled rules.
 * @returns Each matching term with its count, in rule order.
 */
function countTerms(
  text: string,
  rules: readonly CompiledRule[],
): { term: string; count: number }[] {
  const found: { term: string; count: number }[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    const matches = text.match(rule.pattern);
    if (matches !== null) found.push({ term: rule.term, count: matches.length });
  }
  return found;
}

/**
 * Lists the text files below a directory, depth first, sorted, skipping {@link SKIPPED_DIRS}.
 *
 * @param dir - Absolute directory; a missing one yields nothing.
 * @param accept - Picks the files to keep by name.
 * @returns Absolute paths.
 */
function listFiles(dir: string, accept: (name: string) => boolean): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch (_error) {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) out.push(...listFiles(path, accept));
    } else if (accept(name)) {
      out.push(path);
    }
  }
  return out;
}

/** Repo-relative, `/`-separated. */
function repoPath(path: string): string {
  return relative(repo, path).split(sep).join('/');
}

/** Every file the scan reads: the prompt library, and the ingest tool's records. */
const SCANNED: readonly string[] = [
  ...listFiles(join(repo, 'art-prompts'), (name) => TEXT_EXTENSIONS.has(extname(name))),
  ...listFiles(
    join(repo, 'assets', 'source'),
    (name) => name.endsWith('.art.json') || name.endsWith('.recipe.json'),
  ),
];

const DENIED_RULES: readonly CompiledRule[] = DENIED.map(({ term }) => ({
  term,
  pattern: termPattern(term),
}));

const ALLOWED_RULES: readonly CompiledRule[] = ALLOWED_PLATFORM_TERMS.map(({ term }) => ({
  term,
  pattern: termPattern(term),
}));

/** The denied hits of the whole scan, in scan order: by file, then in {@link DENIED} order. */
function scanDenied(): { file: string; term: string; count: number }[] {
  const hits: { file: string; term: string; count: number }[] = [];
  for (const path of SCANNED) {
    const text = readFileSync(path, 'utf8');
    for (const { term, count } of countTerms(text, DENIED_RULES)) {
      hits.push({ file: repoPath(path), term, count });
    }
  }
  return hits;
}

describe('art prompt library: original names only (R3-05)', () => {
  it('reads the library: the kernels, the prompt sources, the compiled libraries, the manifest', () => {
    const files = SCANNED.map(repoPath);
    expect(files).toContain('art-prompts/images/00-style-kernel.md');
    expect(files).toContain('art-prompts/v2/manifest.json');
    expect(files.filter((f) => f.startsWith('art-prompts/images/')).length).toBeGreaterThan(50);
    expect(files.filter((f) => f.startsWith('art-prompts/video/')).length).toBeGreaterThan(10);
    expect(files.some((f) => f.includes('/candidates/') || f.includes('/node_modules/'))).toBe(
      false,
    );
  });

  it('the matcher catches the usual spellings and spares ordinary words', () => {
    const hit = (text: string): string[] => countTerms(text, DENIED_RULES).map((h) => h.term);
    expect(hit('a sleek Vic-Viper fighter')).toEqual(['Vic Viper']);
    expect(hit('VICVIPER and vic_viper')).toEqual(['Vic Viper']);
    expect(hit('a GRADIUS-style moai head')).toEqual(['Gradius', 'Moai']);
    expect(hit('painted in the style of an old master')).toEqual(['in the style of']);
    expect(hit('Einhänder, Pokémon, Stålenhag')).toEqual(['Einhänder', 'Pokémon', 'Stålenhag']);
    expect(hit('trending on ArtStation')).toEqual(['artstation']);
    // Ordinary words that contain a name, or that are on the generic list.
    expect(
      hit(
        'supersonic electron firemen cave treasure arcade halo saturn contra-rotating ' +
          'crystalline core, the genesis of the cell, a commodore flagship, a moebius ring, ' +
          'pixel art inspired concept rendering, a great thing',
      ),
    ).toEqual([]);
    // A pinned or allowed term still matches — the pins, not the matcher, let them through.
    expect(hit('the crystal core')).toEqual(['Crystal Core']);
    expect(countTerms('SNES-era 16-bit', ALLOWED_RULES).map((h) => h.term)).toEqual(['SNES']);
  });

  it('no prompt names a real game, studio, artist, character or platform', () => {
    const hits = scanDenied();
    const pinned = KNOWN_HITS.map(({ file, term, count }) => ({ file, term, count }));
    const why = new Map(DENIED.map((rule) => [rule.term, rule.why]));
    const report = hits
      .filter((h) => !pinned.some((p) => p.file === h.file && p.term === h.term))
      .map((h) => `  ${h.file}: "${h.term}" ×${h.count} — ${why.get(h.term) ?? ''}`)
      .join('\n');
    // Exactly the pinned hits: a new one fails, and so does a pinned one that is gone.
    expect(
      hits,
      `Reword the prompt in plain words (docs/dev/art-bible-v2.md §7); in a file no agent may ` +
        `edit, report it and pin it in KNOWN_HITS. New hits:\n${report || '  (none)'}`,
    ).toEqual(pinned);
  });

  it('every allowed platform term is still in use (else remove its row)', () => {
    const text = SCANNED.map((path) => readFileSync(path, 'utf8')).join('\n');
    for (const rule of ALLOWED_RULES) {
      rule.pattern.lastIndex = 0;
      expect(rule.pattern.test(text), `${rule.term} no longer occurs`).toBe(true);
    }
  });

  it('the lists do not overlap', () => {
    const lower = (s: string): string => s.toLowerCase();
    const denied = new Set(DENIED.map((r) => lower(r.term)));
    expect(denied.size).toBe(DENIED.length);
    for (const word of GENERIC_WORDS) expect(denied.has(lower(word)), word).toBe(false);
    for (const { term } of ALLOWED_PLATFORM_TERMS) {
      expect(denied.has(lower(term)), term).toBe(false);
    }
    for (const { term } of KNOWN_HITS) expect(denied.has(lower(term)), term).toBe(true);
  });
});
