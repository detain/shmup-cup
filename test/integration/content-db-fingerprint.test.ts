/**
 * The **content-DB fingerprint** (plan_resolution.md R1-03): a hash of everything the content
 * loaders make of the shipped content — core's `loadContent` (every `ContentDb` field: ships,
 * weapons, enemies, paths, stages with their expanded terrain, tilesets, rules, patterns, the
 * campaign, demos, string tables) and the foreign owners the shell registers (`sfx` / `music` →
 * `@shmup/audio-web`, `input-profiles` → `@shmup/input-web`, `fx` → `@shmup/render-pixi`) — and of
 * the `example.*.json` format samples, loaded as their own set as `pnpm content:check` does.
 *
 * **Why.** R1-03 gives every numeric schema field a unit (`s.num({ unit })`) and turns the
 * hand-made schemas into `s.custom`. Those edits must not change a single parsed value: a typo in a
 * bound, a schema swapped for a look-alike or a default lost on the way would load different data
 * without failing a validation. This test was pinned on master `1cc83bf`, before any R1-03 change,
 * and must stay green through R1-03 *without an edit*.
 *
 * **How it hashes.** Each loader's result is written out canonically — numbers exactly (`-0` kept
 * apart from `0`), strings quoted, own object keys in insertion order, arrays and typed arrays item
 * by item with their type, `Map` / `Set` entries in insertion order, a reference cycle as a marker —
 * and hashed with SHA-256 (the first 16 hex digits are pinned). There is one entry per `ContentDb`
 * field and per foreign loader, so a failure names what moved. Every load must also be free of
 * issues.
 *
 * **Re-pinning.** Only on purpose — a change of the shipped content (R2-02's ×1.5 port, a zone
 * remaster) or of what a loader produces. Run it with `SHMUP_FINGERPRINT_PRINT=1`, paste the
 * printed tables and say why in the commit message.
 *
 * Run it: `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
 * test/integration/content-db-fingerprint.test.ts`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '@shmup/core';
import { loadMusicContent, loadSfxContent } from '@shmup/audio-web';
import { loadInputProfiles } from '@shmup/input-web';
import { loadFxContent } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentRoot = join(repo, 'content');

/**
 * Every `example.*.json` below `content/`, as content-root-relative POSIX paths.
 *
 * @param dir - Absolute directory to scan.
 * @param prefix - Its path relative to `content/`.
 * @returns The paths, sorted.
 */
function listExamples(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(join(dir, entry)).isDirectory())
      out.push(...listExamples(join(dir, entry), relative));
    else if (entry.startsWith('example.') && entry.endsWith('.json')) out.push(relative);
  }
  return out.sort();
}

/**
 * Writes a value out canonically (see the module docs).
 *
 * @param value - Any loader output.
 * @param stack - The objects being written (cycle detection).
 * @returns The canonical text.
 */
function canonical(value: unknown, stack: Set<object> = new Set()): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'string':
      return JSON.stringify(value);
    case 'bigint':
      return `${String(value)}n`;
    case 'function':
      return `fn:${value.name}`;
    case 'symbol':
      return `symbol:${String(value.description)}`;
    default:
      break;
  }
  const object = value;
  if (stack.has(object)) return '<cycle>';
  stack.add(object);
  let text: string;
  if (ArrayBuffer.isView(object)) {
    const view = object as unknown as ArrayLike<number>;
    const items: string[] = [];
    for (let i = 0; i < view.length; i++) items.push(canonical(view[i], stack));
    text = `${object.constructor.name}[${items.join(',')}]`;
  } else if (Array.isArray(object)) {
    text = `[${object.map((item: unknown) => canonical(item, stack)).join(',')}]`;
  } else if (object instanceof Map) {
    const entries: string[] = [];
    for (const [key, entry] of object) {
      entries.push(`${canonical(key, stack)}=>${canonical(entry, stack)}`);
    }
    text = `Map{${entries.join(',')}}`;
  } else if (object instanceof Set) {
    const entries: string[] = [];
    for (const entry of object) entries.push(canonical(entry, stack));
    text = `Set{${entries.join(',')}}`;
  } else {
    const proto = Object.getPrototypeOf(object) as { constructor?: { name?: string } } | null;
    const name = proto === null ? 'null' : (proto.constructor?.name ?? '?');
    const record = object as Record<string, unknown>;
    const fields = Object.keys(record).map(
      (key) => `${JSON.stringify(key)}:${canonical(record[key], stack)}`,
    );
    text = `${name === 'Object' ? '' : name}{${fields.join(',')}}`;
  }
  stack.delete(object);
  return text;
}

/**
 * The pinned digest of a value.
 *
 * @param value - Any loader output.
 * @returns The first 16 hex digits of the SHA-256 of {@link canonical}'s text.
 */
const digest = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex').slice(0, 16);

/**
 * Loads a set of content files with every loader, as the shell does at boot.
 *
 * @param files - The files.
 * @returns Every loader's issues, and the digest of each `ContentDb` field and foreign result.
 */
function fingerprint(files: readonly ContentFile[]): {
  issues: readonly ValidationIssue[];
  table: Record<string, string>;
} {
  const core = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES });
  const ofKind = (kind: string): ContentFile[] =>
    core.foreign.filter((file) => (file.data as { kind?: unknown }).kind === kind);
  const sfx = loadSfxContent(ofKind('sfx'));
  const music = loadMusicContent(ofKind('music'));
  const input = loadInputProfiles(ofKind('input-profiles'));
  const fx = loadFxContent(ofKind('fx'));
  const table: Record<string, string> = {};
  const db = core.db as unknown as Record<string, unknown>;
  for (const key of Object.keys(db)) table[`core.${key}`] = digest(db[key]);
  table['core.foreign'] = digest(core.foreign.map((file) => file.path));
  table.sfx = digest(sfx.content);
  table.music = digest(music.content);
  table['input-profiles'] = digest(input.profiles);
  table.fx = digest(fx.content);
  return {
    issues: [...core.issues, ...sfx.issues, ...music.issues, ...input.issues, ...fx.issues],
    table,
  };
}

/**
 * Prints a table (with `SHMUP_FINGERPRINT_PRINT=1`) for re-pinning.
 *
 * @param name - Which set.
 * @param table - Its digests.
 */
function print(name: string, table: Record<string, string>): void {
  if (process.env.SHMUP_FINGERPRINT_PRINT !== '1') return;
  const rows = Object.keys(table).map((key) => `    '${key}': '${table[key]}',`);
  process.stdout.write(`  ${name}: {\n${rows.join('\n')}\n  },\n`);
}

describe('integration: the content-DB fingerprint (R1-03)', () => {
  it('loads the shipped content into exactly the pinned data', () => {
    const { issues, table } = fingerprint(readContentFiles(contentRoot));
    print('shipped', table);
    expect(issues).toEqual([]);
    expect(table).toEqual(PINNED.shipped);
  });

  it('loads the example format samples into exactly the pinned data', () => {
    const files = listExamples(contentRoot).map((path) => ({
      path,
      data: JSON.parse(readFileSync(join(contentRoot, path), 'utf8')) as unknown,
    }));
    const { issues, table } = fingerprint(files);
    print('examples', table);
    expect(issues).toEqual([]);
    expect(table).toEqual(PINNED.examples);
  });

  it('writes out what a hash must tell apart', () => {
    expect(canonical(-0)).not.toBe(canonical(0));
    expect(canonical([1, 2])).not.toBe(canonical(new Float64Array([1, 2])));
    expect(canonical(new Map([['a', 1]]))).not.toBe(canonical({ a: 1 }));
    expect(canonical({ a: 1, b: 2 })).not.toBe(canonical({ b: 2, a: 1 }));
    expect(canonical({ a: undefined })).not.toBe(canonical({}));
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(canonical(loop)).toBe('{"self":<cycle>}');
  });
});

/** The pinned digests (re-pin with `SHMUP_FINGERPRINT_PRINT=1`). */
const PINNED: Record<string, Record<string, string>> = {
  shipped: {
    'core.sprites': '2454673df4824fd1',
    'core.scripts': 'bd6454be7a35f079',
    'core.ships': 'b98362160f0d37cc',
    'core.shipIndex': 'f64a98b92e84e3a6',
    'core.weapons': 'be185895bbaef39f',
    'core.weaponIndex': '9801dfd70acb6066',
    'core.weaponPresets': '7319e77e71352828',
    'core.weaponPresetIndex': '3118718d4dc3ae19',
    'core.weaponFamilies': '40b9c266a68381fb',
    'core.weaponFamilyIndex': 'c285d6feaa68e677',
    'core.enemies': '1300551e03b507b9',
    'core.enemyIndex': '0c9e15a8383dc331',
    'core.paths': 'dbe5b03aac7b742e',
    'core.pathIndex': '7f7714633ec51cc2',
    'core.stages': '5f76754c0df5737d',
    'core.stageIndex': 'd5d81c783b7af011',
    'core.tilesets': '6223afba7835e3e4',
    'core.tilesetIndex': 'efd99091fe1dce30',
    'core.difficulty': '1f340af9648e812c',
    'core.scoring': 'b2430506b3320967',
    'core.patterns': '1c871854112380c2',
    'core.campaign': '1f54738410020884',
    'core.demos': 'eae5d0a35108f129',
    'core.demoIndex': 'b37bbd0e0ad0fca7',
    'core.uiStrings': 'a6b7a37bb5260ca5',
    'core.foreign': '9cfb0258b044a523',
    sfx: '1e5b84de8ac2d037',
    music: '35f49c705273d5ef',
    'input-profiles': '3349be80a0dd2b8f',
    fx: '529cc6d6dc216563',
  },
  examples: {
    'core.sprites': 'fd4dc4411777e001',
    'core.scripts': '6d67dc1c2e597b85',
    'core.ships': 'cedc0ac6e739b17a',
    'core.shipIndex': '577ab8323709a683',
    'core.weapons': '497c30a7d4016b9b',
    'core.weaponIndex': '9ab51a61d042ac2c',
    'core.weaponPresets': 'e4755fda79fe5fff',
    'core.weaponPresetIndex': 'a327dbd448a9db22',
    'core.weaponFamilies': '27e06fc6df1bfc02',
    'core.weaponFamilyIndex': 'fff7c87a0c220a8f',
    'core.enemies': '154707600ccf9ba2',
    'core.enemyIndex': '7a74fd53a7352864',
    'core.paths': '980ad13f6a477408',
    'core.pathIndex': '1a4e800e937e9c65',
    'core.stages': '3266d92a348ffb74',
    'core.stageIndex': '2bd1d4c7fc744d4f',
    'core.tilesets': '5eb80d326813d6aa',
    'core.tilesetIndex': '2bd1d4c7fc744d4f',
    'core.difficulty': '863868aa2944ce81',
    'core.scoring': '066431982ca208da',
    'core.patterns': 'f88a2aac035ae513',
    'core.campaign': '53fe81e43af1d3dd',
    'core.demos': '8e5509cdc18bb199',
    'core.demoIndex': '2bd1d4c7fc744d4f',
    'core.uiStrings': '17f4f9e9a78dae4a',
    'core.foreign': '6646cb3b9dec7a71',
    sfx: 'bf3cd97e6c2ca06a',
    music: '164fb0e21368a408',
    'input-profiles': '065b15e7f88415ae',
    fx: 'cdbaae908ab8cd71',
  },
};
