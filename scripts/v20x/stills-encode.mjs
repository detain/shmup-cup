#!/usr/bin/env node
/**
 * The stills encode kit (plan v20x A4): the shipped large-format image surfaces — the five
 * approved ending illustrations of `art-prompts/v2/winners/moment/` (the ARTLEDGER's design
 * sources, §3.5) — derived from their committed winners by the numeric, deterministic
 * resampling of `scripts/assets/resample.mjs`: contain-fit on the internal frame
 * (`scripts/frame.mjs`, the pinned mirror — never a literal frame number), padded on the
 * renderer's letterbox navy, median-cut quantised to the PNG-8 cap and written as indexed PNGs
 * next to a provenance sidecar each (`<id>.art.json`, the winner record as committed) and a
 * machine ledger (`stills-ledger.json`: bytes and SHA-256 per file — the tripwire
 * `--check` and the build re-verify against).
 *
 * The output directory (`assets/generated/stills/`) is git-ignored like the atlas and the
 * video clips: the repo commits the sources and this script, `vite.shared.ts` `shmupStills`
 * runs the kit on every build (and its `--check` first, so a drifted file is re-encoded, never
 * silently shipped), and the game serves the files from `assets/stills/` — where the shell's
 * `stills` manifest reads them (its `STILLS_URL_DIR` is the same string, pinned by
 * `test/integration/stills-plugin.test.ts`).
 *
 * Every resample is IEEE-754 reproducible (the kit shares `resample.mjs` with the store assets
 * of v20x-A2: fixed accumulation order, `Math.round` half up), so the ledger holds byte-for-byte
 * on every machine and CI can `--check` without a GPU touch — the frozen-skynet2 law of the run
 * (all inputs are committed files).
 *
 * Usage:
 *   node scripts/v20x/stills-encode.mjs            # render every still
 *   node scripts/v20x/stills-encode.mjs --check    # verify the rendered files against the ledger
 *   node scripts/v20x/stills-encode.mjs --only a,b # limit to the listed ids (either command)
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng, encodePng } from '../assets/png.mjs';
import { fitContain, medianCutPalette, quantize } from '../assets/resample.mjs';
import { FRAME_H, FRAME_W } from '../frame.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The committed AI winners the stills are cut from (read-only inputs, never written). */
const WINNER_DIR = join(repoRoot, 'art-prompts', 'v2', 'winners', 'moment');

/** Where the kit writes (git-ignored; the build's `shmupStills` plugin ships it). */
const OUT_DIR = join(repoRoot, 'assets', 'generated', 'stills');

/** The ledger's file name inside {@link OUT_DIR}. */
const LEDGER_FILE = 'stills-ledger.json';

/** The licence notice written next to the stills (shipped in `dist/assets/stills/`). */
const LICENSES_FILE = 'LICENSES-stills.md';

/** The pad colour: render-pixi `PALETTE.letterbox` (the frame's own background). */
const LETTERBOX = /** @type {const} */ ([0x05, 0x07, 0x0f, 0xff]);

/**
 * The shipped stills: the surface id (the shell's `STILL_SURFACES` key), the `moment/` winner
 * directory it comes from, and the campaign ending id that selects it. Each painting is the
 * design source of its epilogue (ARTLEDGER §3.5) — the pairing is a name match, not a crop.
 */
const STILLS = Object.freeze(
  /** @type {const} */ ([
    { id: 'ending-citadel-falls', winner: 'ending-citadel-falls', ending: 'citadel' },
    {
      id: 'ending-citadel-falls-silent',
      winner: 'ending-citadel-falls-silent',
      ending: 'citadel-flawless',
    },
    { id: 'ending-throne-is-broken', winner: 'ending-throne-is-broken', ending: 'throne' },
    { id: 'ending-deep-is-still', winner: 'ending-deep-is-still', ending: 'throne-flawless' },
    {
      id: 'ending-flagship-slips-away',
      winner: 'ending-flagship-slips-away',
      ending: 'throne-escape',
    },
  ]),
);

/**
 * The frame-sized pixels of one winner: contain-fit with the area filter onto the internal
 * frame, letterbox navy under the pad, median-cut quantised (the flat pad stays exact, the
 * detailed painting lands inside the PNG-8 cap — the store-assets rule of v20x-A2).
 *
 * @param {string} winner - The `moment/` directory name.
 * @returns {{ width: number, height: number, data: Uint8Array }} The image for `encodePng`.
 * @throws {Error} When the winner PNG is missing.
 */
function renderStill(winner) {
  const file = join(WINNER_DIR, winner, 'winner.png');
  if (!existsSync(file)) throw new Error(`the winner ${winner} has no committed winner.png`);
  const image = decodePng(new Uint8Array(readFileSync(file)));
  const padded = fitContain(image, FRAME_W, FRAME_H, LETTERBOX);
  return quantize(padded, medianCutPalette(padded));
}

/**
 * The SHA-256 (lower-case hex) of a file's bytes.
 *
 * @param {string} file - The path.
 * @returns {string} The digest.
 */
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * The licence notice: the machine-generated disclaimer next to every shipped still (the same
 * terms class as the video clips — these sources are LTX image winners; `docs/dev/
 * art-provenance.md` holds the full analysis, the sidecars hold each record).
 *
 * @param {typeof STILLS} entries - The rendered stills.
 * @param {Record<string, unknown>[]} winners - Their winner.json, entry order.
 * @returns {string} The file text.
 */
function licensesText(entries, winners) {
  return [
    '# Image-surface stills licences',
    '',
    'The PNG files in this folder are large-format stills of Shmup Cup, derived deterministically',
    'by `scripts/v20x/stills-encode.mjs` from the committed AI winners under',
    '`art-prompts/v2/winners/moment/`. Each still ships with its generation record',
    '(`<id>.art.json`) next to it. The game draws them behind its ending scenes; the full licence',
    'analysis is `docs/dev/art-provenance.md`.',
    '',
    '## The stills',
    '',
    ...entries.map(
      (entry, i) =>
        `- \`${entry.id}.png\` — from \`${entry.winner}\` (model ${String(
          (winners[i] ?? {}).servedModel ?? entry.winner,
        )}, seed ${String((winners[i] ?? {}).seed)}; prompt in \`${entry.id}.art.json\`)`,
    ),
    '',
  ].join('\n');
}

/**
 * Parses `--only a,b` out of the arguments, skipping a leading `--` (the pnpm 12 shape).
 *
 * @param {string[]} argv - The process arguments after the script name.
 * @returns {Set<string> | null} The still ids, or `null` for all of them.
 */
function parseOnly(argv) {
  const i = argv.indexOf('--only');
  if (i < 0) return null;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw new Error('--only needs a list');
  return new Set(value.split(',').filter((name) => name !== ''));
}

/**
 * The entries to process (the `--only` filter, entry order).
 *
 * @param {Set<string> | null} only - The filter.
 * @returns {typeof STILLS[number][]} The entries.
 */
function selected(only) {
  return only === null ? [...STILLS] : STILLS.filter((entry) => only.has(entry.id));
}

/**
 * Renders every selected still, writes the files, sidecars, ledger and notice.
 *
 * @param {Set<string> | null} only - The `--only` filter.
 */
function encode(only) {
  const entries = selected(only);
  if (only === null) mkdirSync(OUT_DIR, { recursive: true });
  const winners = entries.map((entry) =>
    JSON.parse(readFileSync(join(WINNER_DIR, entry.winner, 'winner.json'), 'utf8')),
  );
  /** @type {{ file: string, bytes: number, sha256: string, source: string, ending: string }[]} */
  const ledger = [];
  for (const [i, entry] of entries.entries()) {
    const png = encodePng(renderStill(entry.winner), { indexed: 'auto' });
    const file = join(OUT_DIR, `${entry.id}.png`);
    writeFileSync(file, png);
    writeFileSync(
      join(OUT_DIR, `${entry.id}.art.json`),
      `${JSON.stringify(winners[i], null, 2)}\n`,
    );
    ledger.push({
      file: `${entry.id}.png`,
      bytes: statSync(file).size,
      sha256: sha256(file),
      source: `art-prompts/v2/winners/moment/${entry.winner}/winner.png`,
      ending: entry.ending,
    });
    console.log(
      `${entry.id}.png: ${ledger[ledger.length - 1].bytes} B from ${entry.winner} (${FRAME_W}×${FRAME_H} indexed)`,
    );
  }
  writeFileSync(
    join(OUT_DIR, LEDGER_FILE),
    `${JSON.stringify({ generatedBy: 'scripts/v20x/stills-encode.mjs', stills: ledger }, null, 2)}\n`,
  );
  writeFileSync(join(OUT_DIR, LICENSES_FILE), licensesText(entries, winners));
}

/**
 * Verifies every selected still: the ledger's own rows and the file bytes must match what a
 * fresh render produces (drift fails loud — the build re-encodes, it never ships a drifted
 * file silently; the video kit's rule).
 *
 * @param {Set<string> | null} only - The `--only` filter.
 * @throws {Error} Naming every drifted or missing file.
 */
function check(only) {
  const ledgerFile = join(OUT_DIR, LEDGER_FILE);
  if (!existsSync(ledgerFile)) throw new Error(`${LEDGER_FILE} is missing — run the kit`);
  const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
  const problems = [];
  for (const entry of selected(only)) {
    const file = join(OUT_DIR, `${entry.id}.png`);
    const row = ledger.stills.find((r) => r.file === `${entry.id}.png`);
    if (row === undefined) {
      problems.push(`${entry.id}: no ledger row`);
      continue;
    }
    if (!existsSync(file)) {
      problems.push(`${entry.id}.png: missing`);
      continue;
    }
    const want = encodePng(renderStill(entry.winner), { indexed: 'auto' });
    const have = readFileSync(file);
    if (Buffer.compare(Buffer.from(want), Buffer.from(have)) !== 0) {
      problems.push(`${entry.id}.png: bytes drift from this kit (re-encode)`);
    } else if (have.length !== row.bytes || sha256(file) !== row.sha256) {
      problems.push(`${entry.id}.png: does not match its ledger row`);
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
  console.log(`stills ledger verified: ${selected(only).length} files`);
}

/** Entry point. */
function main() {
  const argv = process.argv.slice(2).filter((arg) => arg !== '--');
  const only = parseOnly(argv);
  if (argv.includes('--check')) check(only);
  else encode(only);
}

main();
