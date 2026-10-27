#!/usr/bin/env node
/**
 * make_missile.mjs — the zero-GPU shots/missile v2 derivation (w15-PIXMAP1).
 *
 * The interim map was the last name in the v2 interim pool: a stretched v1 box
 * (a full 12 × 5 outline rectangle with a three-row body), not a redraw. This
 * script lays the hand-drawn v2 map — tail fins, a two-pixel nozzle, a
 * three-step tapered exhaust flame, a white nose shoulder under an outline
 * cap — onto the key-sheet contract of the code-frames precedent (the
 * halo-crystal `model: "code"` class, carried through by
 * make_kestrel_thruster.mjs), so the sprite ships as an ingested PNG override
 * with a full provenance record and no GPU was ever touched.
 *
 * The law:
 *  - the committed pixel map assets/source/sprites/shots/missile.v2.sprite.json
 *    is the design source of truth — the script READS its rows and palette
 *    from disk, so the map and the sheet can never drift apart silently
 *    (a changed map without a re-run fails --check);
 *  - every design pixel is placed as authored, one colour per 16 × 16 block
 *    (nearest upscale — no blending, no invented colours), and every design
 *    transparent pixel stays the flat ask key, which ingest erases to alpha;
 *  - each frame is centred in one 384 × 256 cell of a 768 × 256 one-row sheet
 *    — the recipe's exact-box crop (subject 192 × 80) ÷ 16 restores the map
 *    bytes 1:1.
 *
 * Usage (repo root):
 *   node art-prompts/v2/code-frames/make_missile.mjs [--check]
 * Writes art-prompts/v2/code-frames/missile/gen.png + gen.json. --check
 * regenerates into memory and fails unless every byte matches the committed files.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../../../scripts/assets/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
/** The committed v2 pixel map — the design source of truth. */
const MAP = 'assets/source/sprites/shots/missile.v2.sprite.json';
const SRC = join(ROOT, MAP);
const OUT_DIR = join(HERE, 'missile');

/** One animation sheet: two cells, 768×256 total. */
const SHEET_W = 768;
const SHEET_H = 256;
const CELL_W = 384;
const CELL_H = 256;

/** The frame grid the map must carry: 2 frames of 12×5. */
const FRAME_W = 12;
const FRAME_H = 5;
const FRAMES = 2;

/** Upscale of the laid frames — every served pixel becomes a 16×16 solid block. */
const SCALE = 16;

/** The ask key, the flat chroma green (the code-frames sheet contract). */
const KEY = { r: 0x51, g: 0xe0, b: 0x18 };

/** The five design colours the v1 map declares and the v2 map must reuse. */
const DESIGN = {
  o: '#2a3a4a',
  g: '#a0a8b8',
  w: '#ffffff',
  r: '#e84818',
  y: '#f8c030',
};

/**
 * sha256 of bytes as hex.
 *
 * @param {Uint8Array | Buffer} bytes - The bytes.
 * @returns {string} The hex digest.
 */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Parse one '#rrggbb' hex to its RGB parts.
 *
 * @param {string} hex - The colour.
 * @returns {{r: number, g: number, b: number}} The parts.
 */
function rgbOf(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * Read and validate the committed map, returning its frames as RGBA grids.
 *
 * @returns {{data: Uint8Array, opaque: number}[]} One RGBA image per frame.
 */
function mapFrames() {
  const map = JSON.parse(readFileSync(SRC, 'utf8'));
  if (map.name !== 'shots/missile') throw new Error(`map name: ${map.name}`);
  if (map.native !== true) throw new Error('the v2 map must stay native');
  const pal = map.palette;
  if (pal['.'] !== null || Object.keys(pal).length !== 6) {
    throw new Error('the map palette must be the five design colours plus the transparent dot');
  }
  for (const [key, hex] of Object.entries(DESIGN)) {
    if (pal[key] !== hex) throw new Error(`map colour ${key} is ${pal[key]}, expected ${hex}`);
  }
  if (!Array.isArray(map.frames) || map.frames.length !== FRAMES) {
    throw new Error(`map frames: ${map.frames && map.frames.length}`);
  }
  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const rows = map.frames[f].rows;
    if (!Array.isArray(rows) || rows.length !== FRAME_H) {
      throw new Error(`frame ${f} rows: ${rows && rows.length}`);
    }
    const data = new Uint8Array(FRAME_W * FRAME_H * 4);
    let opaque = 0;
    for (let y = 0; y < FRAME_H; y++) {
      if (rows[y].length !== FRAME_W) throw new Error(`frame ${f} row ${y} length ${rows[y].length}`);
      for (let x = 0; x < FRAME_W; x++) {
        const ch = rows[y][x];
        const d = ((y * FRAME_W) + x) * 4;
        if (ch === '.') continue; // stays transparent (laid as key)
        const hex = DESIGN[ch];
        if (hex === undefined) throw new Error(`frame ${f} row ${y}: unknown colour char "${ch}"`);
        const c = rgbOf(hex);
        data[d] = c.r;
        data[d + 1] = c.g;
        data[d + 2] = c.b;
        data[d + 3] = 255;
        opaque++;
      }
    }
    out.push({ data, opaque });
  }
  return out;
}

/**
 * Lay the frames on the key sheet: frame f centred in cell f of the one-row
 * 2-cell grid (reading order), nearest-upscaled ×16.
 *
 * @param {{data: Uint8Array}[]} frames - The design frames.
 * @returns {{width: number, height: number, data: Uint8Array}} The sheet image.
 */
function laySheet(frames) {
  const data = new Uint8Array(SHEET_W * SHEET_H * 4);
  for (let i = 0; i < SHEET_W * SHEET_H; i++) {
    data[i * 4] = KEY.r;
    data[i * 4 + 1] = KEY.g;
    data[i * 4 + 2] = KEY.b;
    data[i * 4 + 3] = 255;
  }
  const subW = FRAME_W * SCALE;
  const subH = FRAME_H * SCALE;
  for (let f = 0; f < FRAMES; f++) {
    const ox = f * CELL_W + Math.floor((CELL_W - subW) / 2);
    const oy = Math.floor((CELL_H - subH) / 2);
    for (let y = 0; y < subH; y++) {
      for (let x = 0; x < subW; x++) {
        const s = ((Math.floor(y / SCALE) * FRAME_W) + Math.floor(x / SCALE)) * 4;
        const d = ((oy + y) * SHEET_W + ox + x) * 4;
        if (frames[f].data[s + 3] === 0) continue; // stays key
        data[d] = frames[f].data[s];
        data[d + 1] = frames[f].data[s + 1];
        data[d + 2] = frames[f].data[s + 2];
      }
    }
  }
  return { width: SHEET_W, height: SHEET_H, data };
}

/** Subject box of every cell in the sheet (the recipe crop boxes). */
const BOXES = [];
for (let f = 0; f < FRAMES; f++) {
  BOXES.push([
    f * CELL_W + Math.floor((CELL_W - FRAME_W * SCALE) / 2),
    Math.floor((CELL_H - FRAME_H * SCALE) / 2),
    FRAME_W * SCALE,
    FRAME_H * SCALE,
  ]);
}

/** The sheet sidecar's fixed timestamp (determinism: the script never reads a clock). */
const GENERATED_AT = '2026-10-27T13:00:00.000Z';

/**
 * The gen.json sidecar, mirroring the kestrel-thruster code-class fields.
 *
 * @param {string} scriptSha256 - sha256 of this committed file.
 * @param {string} mapSha256 - sha256 of the committed v2 map.
 * @param {number[]} perFrame - Opaque pixels per frame.
 * @returns {object} The sidecar.
 */
function buildSidecar(scriptSha256, mapSha256, perFrame) {
  const prompt =
    'No model and no prompt: made in code from the committed hand-drawn v2 pixel map ' +
    '(assets/source/sprites/shots/missile.v2.sprite.json, w15-PIXMAP1). The interim map ' +
    'was a stretched v1 box, not a redraw, and FLUX never drew this lance-subject cleanly ' +
    '(the s-shots-missile asks); the map is the last name in the v2 interim pool. The ' +
    'redraw is hand-pixelled per art bible v2 § 5.3 — the missile at 12 × 5 with tail ' +
    'fins on the outline rows, a two-pixel nozzle, a three-step tapered exhaust flame ' +
    'and a white nose shoulder capped in outline dark — on v1\'s exact five colours; ' +
    'this script lays those map rows ×16 nearest on the flat ask key, one solid block ' +
    'per pixel, centred in each cell of the sheet.';
  return {
    id: 'w15-PIXMAP1/s-missile/frames',
    slot: 'a',
    prompt,
    negative: null,
    model: 'code',
    origin: 'derived in code from the committed v2 pixel map: no AI model, no GPU, no server',
    seed: null,
    width: SHEET_W,
    height: SHEET_H,
    steps: null,
    guidance: null,
    generatedAt: GENERATED_AT,
    seconds: null,
    label: 'MISSILE v2 animation sheet, two frames (v2: 2 flicker frames 12x5)',
    source: 'v2-target',
    file: 'art-prompts/v2/code-frames/missile/gen.png',
    format: 'png',
    requestedFormat: 'png',
    servedModel: null,
    endpoint: null,
    negativeSent: null,
    mode: 'code',
    derivedFrom: MAP,
    derivedFromSha256: mapSha256,
    instruction: null,
    transform: {
      frames: FRAMES,
      layout: 'one row of two cells, read left to right; one continuous key',
      cell: '384x256',
      key: 'RGB 81,224,24 (the ask key #51e018); every non-subject pixel is exactly this',
      design:
        'the rows and the five colours are READ from the committed map at run time — the ' +
        'map is the design source of truth (palette #2a3a4a outline, #a0a8b8 body, ' +
        '#ffffff nose shoulder, #e84818 ember, #f8c030 flame core)',
      geometry: `alpha and pixel positions byte-identical to the map rows (opaque per frame ${perFrame.join('/')})`,
      upscale: 'nearest x16 onto the key, each frame centred in its cell (the subject box is exactly 192x80)',
    },
    script: 'art-prompts/v2/code-frames/make_missile.mjs',
    scriptSha256,
    command: 'node art-prompts/v2/code-frames/make_missile.mjs',
    outputSize: `${SHEET_W}x${SHEET_H}`,
    pins: {
      model: 'code',
      seed: null,
      targetGrid:
        'shots/missile 2f 12×5 a6,2 (the ground missile, fly [0,1], hitFlash false, ' +
        'no @flash or @palette sibling — the palette law covers bullets/ and lasers/ only)',
      sheetContract:
        'key RGB 81,224,24; 1×2 cells 384×256 read row-major; crop boxes ' +
        BOXES.map((b) => `[${b.join(',')}]`).join(' ') +
        ' (exact upscaled subject boxes, gutters ≥ 96 px of flat key)',
      rowCite: 'mission brief w15-PIXMAP1 (era-final interim census: shots/missile 118→…→1→0)',
      sourceWinners: `${MAP} — the committed hand-drawn v2 map (R4-01.A6 grid, w15-PIXMAP1 redraw); the script reads its rows directly`,
      generatedAt: GENERATED_AT,
    },
  };
}

const frames = mapFrames();
const perFrame = frames.map((f) => f.opaque);
const mapSha = sha256(readFileSync(SRC));
const sheet = encodePng(laySheet(frames));
const sidecarJson =
  JSON.stringify(
    buildSidecar(sha256(readFileSync(fileURLToPath(import.meta.url))), mapSha, perFrame),
    null,
    2,
  ) + '\n';

const pngPath = join(OUT_DIR, 'gen.png');
const jsonPath = join(OUT_DIR, 'gen.json');

if (process.argv.includes('--check')) {
  const samePng = existsSync(pngPath) && Buffer.compare(Buffer.from(sheet), readFileSync(pngPath)) === 0;
  const sameJson = existsSync(jsonPath) && readFileSync(jsonPath, 'utf8') === sidecarJson;
  if (!samePng || !sameJson) {
    console.error(`MISMATCH png:${samePng ? 'ok' : 'DIFFERS'} json:${sameJson ? 'ok' : 'DIFFERS'}`);
    process.exit(1);
  }
  console.log('make_missile: committed sheet and sidecar match the deterministic derivation');
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(pngPath, sheet);
  writeFileSync(jsonPath, sidecarJson);
  console.log(`wrote gen.png (${sheet.byteLength} B) + gen.json; boxes ${BOXES.map((b) => b.join(',')).join(' | ')}; opaque ${perFrame.join('/')}`);
}
