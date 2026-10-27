#!/usr/bin/env node
/**
 * make_kestrel_thruster.mjs — the zero-GPU kestrel-thruster derivation (w15-REING123).
 *
 * GEN12's s-kestrel-thruster ask STOP@8'd: no generated sheet passed its probe, and the
 * §Wave-6 rec 1 remedy is to derive the warm flame by RECOLOURING the ingested
 * ships/manta-thruster frames (the proven gen11/gen10 sheet bytes). This script is that
 * derivation, committed and deterministic (the code-frames precedent of
 * art-prompts/v2/code-frames/make_frames.py, the halo-crystal `model: "code"` class).
 *
 * The law (fixed by the two design palettes named in the asks — no invented colours):
 *  - every shipped manta pixel keeps its alpha and its geometry (the four-frame flicker
 *    ladder, the 9×5 natives, the nozzle-right placement — byte-position identical);
 *  - each opaque pixel's colour maps to the nearest KESTREL design colour in luma
 *    (Rec.601 integer luma, ties to the darker neighbour): the manta's 24-step cool
 *    ramp collapses onto the three warm steps the kestrel ask names — the deep-orange
 *    body #e84818, the amber inner glow #f8c030, the pale white-hot heart #fff8d0;
 *  - the frame is laid on the flat ask key #51e018 upscaled ×16 (nearest, so every
 *    served pixel is one solid colour block) centred in one 384×256 cell of a 768×512
 *    2×2 sheet — the ingest's exact-box area downscale (÷16) restores the bytes 1:1.
 *
 * Usage (repo root):
 *   node art-prompts/v2/code-frames/make_kestrel_thruster.mjs [--check]
 * Writes art-prompts/v2/code-frames/kestrel-thruster/gen.png + gen.json. --check
 * regenerates into memory and fails unless every byte matches the committed files.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from '../../../scripts/assets/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', '..', 'assets', 'source', 'sprites', 'ships', 'manta-thruster.png');
/** The genealogical root sheet (the sidecar names its model — the provenance chain). */
const SRC_STORE = 'art-prompts/v2/gen11/s-manta-thruster/gen.png';
const SRC_STORE_SIDECAR = 'art-prompts/v2/gen11/s-manta-thruster/gen.json';
const OUT_DIR = join(HERE, 'kestrel-thruster');

/** One animation sheet: four cells, 768×512 total (the ask's canvas). */
const SHEET_W = 768;
const SHEET_H = 512;
const CELL_W = 384;
const CELL_H = 256;

/** The frame grid: 4 frames of 9×5, the shipped manta-thruster strip. */
const FRAME_W = 9;
const FRAME_H = 5;
const FRAMES = 4;

/** Upscale of the laid frames — every served pixel becomes a 16×16 solid block. */
const SCALE = 16;

/** The GEN12 ask key, the flat chroma green (the kestrel row's ask #51e018). */
const KEY = { r: 0x51, g: 0xe0, b: 0x18 };

/** The kestrel design palette (the GEN12 ask's named warm ramp). */
const WARM = [
  { hex: '#e84818', r: 0xe8, g: 0x48, b: 0x18, role: 'body' },
  { hex: '#f8c030', r: 0xf8, g: 0xc0, b: 0x30, role: 'inner glow' },
  { hex: '#fff8d0', r: 0xff, g: 0xf8, b: 0xd0, role: 'white-hot heart' },
];

/**
 * Rec.601 integer luma (0..255 domain, floors — the same arithmetic on every engine).
 *
 * @param {number} r - Red 0..255.
 * @param {number} g - Green 0..255.
 * @param {number} b - Blue 0..255.
 * @returns {number} The luma.
 */
function luma(r, g, b) {
  return Math.floor((299 * r) / 1000) + Math.floor((587 * g) / 1000) + Math.floor((114 * b) / 1000);
}

const WARM_LUMA = WARM.map((c) => luma(c.r, c.g, c.b));

/**
 * Map one shipped manta colour to its nearest warm design colour by luma; a tie takes
 * the darker neighbour.
 *
 * @param {number} r - Red 0..255.
 * @param {number} g - Green 0..255.
 * @param {number} b - Blue 0..255.
 * @returns {{r: number, g: number, b: number, hex: string}} The design colour.
 */
function warmOf(r, g, b) {
  const l = luma(r, g, b);
  let best = 0;
  let bestDist = Math.abs(l - WARM_LUMA[0]);
  for (let i = 1; i < WARM_LUMA.length; i++) {
    const d = Math.abs(l - WARM_LUMA[i]);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return WARM[best];
}

/**
 * Build the four recoloured frames.
 *
 * @returns {{data: Uint8Array, perFrame: number[]}[]} One RGBA image per frame.
 */
function recoloredFrames() {
  const src = decodePng(readFileSync(SRC));
  if (src.width !== FRAME_W * FRAMES || src.height !== FRAME_H) {
    throw new Error(`expected the 9x5 x4 manta strip, got ${src.width}x${src.height}`);
  }
  const out = [];
  const perFrame = [];
  for (let f = 0; f < FRAMES; f++) {
    const data = new Uint8Array(FRAME_W * FRAME_H * 4);
    let opaque = 0;
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const s = ((y * src.width) + f * FRAME_W + x) * 4;
        const d = ((y * FRAME_W) + x) * 4;
        const a = src.data[s + 3];
        if (a === 0) {
          data[d + 3] = 0;
          continue;
        }
        if (a !== 255) throw new Error(`non-binary alpha at frame ${f} ${x},${y}: ${a}`);
        const c = warmOf(src.data[s], src.data[s + 1], src.data[s + 2]);
        data[d] = c.r;
        data[d + 1] = c.g;
        data[d + 2] = c.b;
        data[d + 3] = 255;
        opaque++;
      }
    }
    perFrame.push(opaque);
    out.push({ data, perFrame });
  }
  return out;
}

/**
 * Lay the frames on the key sheet: frame i centred in cell i of the 2×2 grid
 * (reading order), nearest-upscaled ×16.
 *
 * @param {{data: Uint8Array}[]} frames - The recoloured frames.
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
    const col = f % 2;
    const row = Math.floor(f / 2);
    const ox = col * CELL_W + Math.floor((CELL_W - subW) / 2);
    const oy = row * CELL_H + Math.floor((CELL_H - subH) / 2);
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
  const col = f % 2;
  const row = Math.floor(f / 2);
  BOXES.push([
    col * CELL_W + Math.floor((CELL_W - FRAME_W * SCALE) / 2),
    row * CELL_H + Math.floor((CELL_H - FRAME_H * SCALE) / 2),
    FRAME_W * SCALE,
    FRAME_H * SCALE,
  ]);
}

/** The sheet sidecar's fixed timestamp (determinism: the script never reads a clock). */
const GENERATED_AT = '2026-10-27T12:00:00.000Z';

/**
 * The gen.json sidecar, mirroring the halo-crystal code-class fields.
 *
 * @param {string} scriptSha256 - sha256 of this committed file.
 * @param {string} sourceSha256 - sha256 of the shipped manta strip.
 * @param {number[]} perFrame - Opaque pixels per frame.
 * @param {number} coolMin - Lowest Rec.601 luma in the shipped manta palette.
 * @param {number} coolMax - Highest Rec.601 luma in the shipped manta palette.
 * @returns {object} The sidecar.
 */
function buildSidecar(scriptSha256, storeSha256, perFrame, coolMin, coolMax) {
  const prompt =
    'No model and no prompt: made in code from the ingested ships/manta-thruster frames ' +
    '(the GEN10 s-manta-thruster winner, shipped as the v2 override PNG). The GEN12 ask ' +
    's-kestrel-thruster STOP@8d (no generated sheet passed its probe; w15-GEN12-report ' +
    'section Wave-6 recommendation 1), so the KESTREL flame is the proven MANTA flame ' +
    'recoloured by the nearest-luma law onto the three warm design colours the ask names ' +
    '(body #e84818, inner glow #f8c030, white-hot heart #fff8d0) — same geometry, same ' +
    'four-frame flicker ladder, same nozzle-right placement, the interim map palette.';
  return {
    id: 'gen12/s-kestrel-thruster/frames',
    slot: 'a',
    prompt,
    negative: null,
    model: 'code',
    origin: 'derived in code from the ingested manta-thruster frames: no AI model, no GPU, no server',
    seed: null,
    width: SHEET_W,
    height: SHEET_H,
    steps: null,
    guidance: null,
    generatedAt: GENERATED_AT,
    seconds: null,
    label: 'KESTREL THRUSTER animation sheet, four frames (v2: 4 flicker frames 9x5)',
    source: 'v2-target',
    file: 'art-prompts/v2/code-frames/kestrel-thruster/gen.png',
    format: 'png',
    requestedFormat: 'png',
    servedModel: null,
    endpoint: null,
    negativeSent: null,
    mode: 'code',
    derivedFrom: SRC_STORE,
    derivedFromSha256: storeSha256,
    editFrom: [SRC_STORE],
    editFromSha256: [storeSha256],
    derivedFromSidecar: SRC_STORE_SIDECAR,
    instruction: null,
    transform: {
      frames: FRAMES,
      layout: '2 rows x 2, read left to right, row-major; one continuous key',
      cell: '384x256',
      key: 'RGB 81,224,24 (the GEN12 ask key #51e018); every non-subject pixel is exactly this',
      recolour:
        'each shipped manta pixel maps to the nearest KESTREL design colour in Rec.601 ' +
        'integer luma (floors), ties to the darker neighbour; the warm anchor lumas are ' +
        `${WARM_LUMA.join(', ')}; the cool ramp lumas span ${coolMin}..${coolMax}`,
      geometry: 'alpha and pixel positions byte-identical to the shipped manta strip ' +
        `(opaque per frame ${perFrame.join('/')})`,
      upscale: 'nearest x16 onto the key, each frame centred in its cell (the subject box is exactly 144x80)',
    },
    script: 'art-prompts/v2/code-frames/make_kestrel_thruster.mjs',
    scriptSha256,
    command: 'node art-prompts/v2/code-frames/make_kestrel_thruster.mjs',
    outputSize: `${SHEET_W}x${SHEET_H}`,
    pins: {
      model: 'code',
      seed: null,
      targetGrid: 'ships/kestrel-thruster 4f 9×5 a9,2 (the KESTREL engine flame, burn [0,1,2,3], p2 true)',
      sheetContract:
        'key RGB 81,224,24; 2×2 cells 384×256 read row-major; crop boxes ' +
        BOXES.map((b) => `[${b.join(',')}]`).join(' ') +
        ' (exact upscaled subject boxes, gutters ≥ 12 px of flat key)',
      rowCite: 'w15-GEN12-report.md §Wave-6 rec 1 (s-kestrel-thruster STOP@8 — recolor the proven manta frames)',
      sourceWinners: 'assets/source/sprites/ships/manta-thruster.png — the ingested ships/manta-thruster override (cropped from ' + SRC_STORE + ', gen11 PROBE-OK@4); the script reads the shipped strip bytes directly',
      generatedAt: GENERATED_AT,
    },
  };
}

/**
 * sha256 of bytes as hex.
 *
 * @param {Uint8Array | Buffer} bytes - The bytes.
 * @returns {string} The hex digest.
 */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const frames = recoloredFrames();
const perFrame = frames[0].perFrame;
const coolSrc = decodePng(readFileSync(SRC));
const coolLumas = new Set();
for (let i = 0; i < coolSrc.width * coolSrc.height; i++) {
  if (coolSrc.data[i * 4 + 3] === 0) continue;
  coolLumas.add(luma(coolSrc.data[i * 4], coolSrc.data[i * 4 + 1], coolSrc.data[i * 4 + 2]));
}
const coolMin = Math.min(...coolLumas);
const coolMax = Math.max(...coolLumas);
const sheet = encodePng(laySheet(frames));
const sidecarJson = JSON.stringify(
  buildSidecar(sha256(readFileSync(fileURLToPath(import.meta.url))), sha256(readFileSync(join(HERE, '..', '..', '..', SRC_STORE))), perFrame, coolMin, coolMax),
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
  console.log('make_kestrel_thruster: committed sheet and sidecar match the deterministic derivation');
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(pngPath, sheet);
  writeFileSync(jsonPath, sidecarJson);
  console.log(`wrote gen.png (${sheet.byteLength} B) + gen.json; boxes ${BOXES.map((b) => b.join(',')).join(' | ')}; opaque ${perFrame.join('/')}`);
}
