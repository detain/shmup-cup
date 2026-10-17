#!/usr/bin/env node
/*
 * gen-candidate.mjs — generate ONE candidate image or video for the v2 art picks
 * (art-prompts/v2/manifest.json, schema shmup-art-picks@1) on the SGLang diffusion
 * server, reusing generate.mjs's transport (imported, not copied). Zero npm
 * dependencies, Node >= 20.
 *
 * STATUS (2026-10-16): the image path runs against the server in R0-04's round 1. The
 * VIDEO path is NOT YET RUN against the server — built and checked offline with
 * --dry-run and a local mock server only; the first live video run should be one
 * --dry-run, then one real clip.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------
 *   node art-prompts/v2/gen-candidate.mjs --id boss/halcyon-bulwark --slot a
 *     → art-prompts/v2/candidates/a/boss/halcyon-bulwark.png
 *       + art-prompts/v2/candidates/a/boss/halcyon-bulwark.json (sidecar)
 * Every value missing from the command line defaults from the manifest item:
 * prompt, negative, size, steps, guidance; the model is the item's `model` for slot
 * a, its `modelB` for slot b and its `modelC` for slot c (only some items have a slot
 * c — FLUX.1-dev for the stage scenes, the swatches and the non-text key moments and
 * promo). --id may also name a followup ("<item id>/<suffix>"): its prompt is used,
 * its size and settings come from its library entry when it has one, else from the
 * parent item. Seeds default to the library entry's seed for that model (else a stable
 * hash of the id), so a rerun reproduces an image; pass --seed to re-roll.
 *
 * EDIT MODE (later jobs: "remaining poses following the winner", "update the chosen
 * image per the owner's comment"): --edit-from <png> (repeatable for several
 * references) --instruction <text> posts multipart to /v1/images/edits. SGLang serves
 * that route (image_api.py) for pipelines built with image inputs — FLUX.2-dev
 * (multi-reference) and the Qwen-Image-Edit family (group qwenedit below, served id
 * Qwen/Qwen-Image-Edit-2511 by default; --served-model picks 2509 or the original).
 * The output size defaults to the first reference's PNG size. Edits never overwrite:
 * they land at candidates/<slot>/<id>/edit-<k>.png (next free k — a dot-free path, so
 * the picker's img.php can serve it as id "<id>/edit-<k>") unless --out says otherwise.
 * --instruction-file reads the instruction from a file (long texts with quotes).
 *
 * ROUND 2 BOOKKEEPING: --meta key=value (repeatable) is stored in the sidecar's "meta"
 * object (job id, kind, parent id, the choice's updatedAt …). --archive replaces an
 * existing output: after a successful generation the old file and its sidecar are moved
 * to candidates/history/<YYYY-MM-DD>/<path below candidates>/ (never deleted), then the
 * new one is written. Image sidecars also record the PNG's real size as outputSize.
 *
 * VIDEO MODE (manifest items with "kind":"video", ids video/<subject>):
 *   node art-prompts/v2/gen-candidate.mjs --id video/logo-sting --slot a
 *     → art-prompts/v2/candidates/a/video/logo-sting.mp4 + .json sidecar
 * Slot a is the item's `model` (wan22 = Wan2.2-T2V-A14B for the t2v clips), slot b its
 * `modelB` (ltx25 = LTX-2.5). Its fallback, when LTX-2.5 is not a video model or does
 * not load, is `--model ltxvideo` (LTX-Video) — same slot, its own manifest settings.
 * Size, frames, fps, steps, guidance and seed come from the item's settings.<model>;
 * overrides are snapped to the model family's grid like generate.mjs does (Wan ÷16 and
 * then the nearest trained bucket 1280x720 / 832x480 / 720x1280 / 480x832; LTX ÷32;
 * frames 4n+1 for Wan, 8n+1 for LTX). Items with "mode":"i2v" (and "waitsFor": the
 * image id of the still they start from) run in round 2 with --source <png> — the
 * owner's winning still — sent as a data URI in reference_url (generate.mjs's i2v
 * shape); when the still's aspect differs from the manifest size by more than 3 % the
 * size is refitted to the still's aspect at the same pixel count (note printed;
 * --width/--height win). Wan2.2-T2V never takes --source.
 * The flow is the job API: POST /v1/videos → {id}, poll GET /v1/videos/{id} (every
 * --poll s) until "completed" or "failed", then GET /v1/videos/{id}/content. If the
 * client stops or times out, the job keeps running on the server: resume it with
 * --job <id> (polls and downloads, never re-submits). A timeout never re-submits.
 * Video sidecars carry the image fields plus kind, num_frames, fps and `seconds` =
 * the clip's length (num_frames / fps); the generation wall time is
 * `generationSeconds` (for images, `seconds` stays the generation time).
 *
 * ---------------------------------------------------------------------------
 * WHAT IT EXPECTS FROM THE SERVER
 * ---------------------------------------------------------------------------
 *  - OpenAI-shaped image API at the base URL (default generate.mjs's single-model
 *    proxy http://skynet2.interserver.net:30001; --base-url / --port override):
 *      GET  /v1/models                 → which model is loaded (checked first; for
 *                                        videos also its task_type / supported_task_types)
 *      POST /v1/images/generations     JSON: model, prompt, size "WxH", n 1,
 *                                      response_format b64_json, output_format png,
 *                                      seed, guidance_scale, num_inference_steps,
 *                                      negative_prompt (sd35 / qwen only)
 *      POST /v1/images/edits           multipart: image (repeated), prompt, model, …
 *      POST /v1/videos                 JSON: model, prompt, size, num_frames, fps, seed,
 *                                      guidance_scale, num_inference_steps,
 *                                      negative_prompt, reference_url (i2v data URI)
 *      GET  /v1/videos/{id}, GET /v1/videos/{id}/content
 *  - ONE model per origin: the slots need a model switch between batches or two
 *    origins (pass --base-url per slot). The helper refuses to run when /v1/models
 *    lists a different model than the slot wants (exit 3), so a wrong model never
 *    fills a slot silently; --any-model overrides. A video item also refuses (exit 3)
 *    a server whose task_type is not a video one (T2V / I2V / TI2V; FLUX.2 reports TI2I)
 *    or lacks the clip's mode.
 *
 * RETRIES: generate.mjs's transport retries 5xx/429 and connection-phase errors; on
 * top of that this helper retries the whole request (--retries, default 2) after
 * timeouts or mid-flight resets — a single duplicate image is cheap, unlike a sweep.
 * HTTP 4xx (except 429) fails at once. Videos: --retries (default 1) re-submits only a
 * job the server reports as "failed"; timeouts and lost polls never re-submit.
 *
 * EXIT CODES: 0 ok (or dry run) · 1 generation failed · 2 usage error ·
 *             3 server serves another model · 4 output exists (use --force)
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GROUPS, GROUP_ALIASES, README_DEFAULTS, MODEL_NAME_TO_GROUP, IMAGE_FORMATS, HttpError,
  resolveBaseUrl, probeModels, httpHeaders, fetchWithRetry, postJson, getBinary, safeText,
  detectImageFormat, formatExt, writeFileAtomic, appendNegative,
} from '../generate.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ART_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_DIR = path.resolve(ART_DIR, '..');

/** Image groups this helper can target: generate.mjs's four plus the edit model. */
const IMAGE_MODEL_GROUPS = {
  ...Object.fromEntries(Object.entries(GROUPS).filter(([, g]) => g.kind === 'image')),
  qwenedit: { kind: 'image', model: 'Qwen/Qwen-Image-Edit-2511', supportsNegative: true },
};
/**
 * Video groups: generate.mjs's wan22 / ltxvideo plus LTX-2.5 (no generate.mjs group).
 * `defaults` derive settings for an item without settings.<group>; `i2v` = takes a
 * start image. LTX-2.5's SGLang defaults (configs/sample/ltx_2_5.py): the distilled
 * DiT runs unguided (guidance 1.0) off a pinned 8-step schedule, 960x544, 121 @ 24 fps.
 */
const VIDEO_MODEL_GROUPS = {
  wan22: { ...GROUPS.wan22, i2v: false, defaults: { fps: 16, frames: 81, steps: 35, guidance: 4.0 } },
  ltxvideo: { ...GROUPS.ltxvideo, i2v: true, defaults: { fps: 24, frames: 121, steps: 35, guidance: 3.2 } },
  ltx25: {
    kind: 'video', model: 'Lightricks/LTX-2.5-Diffusers', supportsNegative: true,
    frameStep: 8, divisor: 32, i2v: true, defaults: { fps: 24, frames: 121, steps: 8, guidance: 1.0 },
  },
};
const VIDEO_TIMEOUT_MS = 3 * 3600 * 1000;
const IMAGE_TIMEOUT_MS = 900_000;
const SLOTS = ['a', 'b', 'c'];
const SLOT_FIELD = { a: 'model', b: 'modelB', c: 'modelC' };
const DEFAULTS = { ...README_DEFAULTS, qwenedit: { guidance: 4.0, steps: 40 } };
const GROUP_TO_MODEL_NAME = Object.fromEntries(Object.entries(MODEL_NAME_TO_GROUP).map(([n, g]) => [g, n]));
const ID_RE = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/;
const FOLLOWUP_NEGATIVE = 'photorealistic, 3d render, text, labels, numbers, cell borders, watermark, blurry, green tint on the subject, green spill';

const USAGE = `usage: node art-prompts/v2/gen-candidate.mjs --id <item or followup id> --slot a|b|c [options]

  --prompt <text> | --prompt-file <path>   positive prompt (default: the manifest's)
  --negative <text>       negative prompt (default: the manifest's; images: sent only to
                          sd35/qwen*; videos: always sent)
  --model <group>         images: ${Object.keys(IMAGE_MODEL_GROUPS).join('|')}
                          videos: ${Object.keys(VIDEO_MODEL_GROUPS).join('|')} (ltxvideo = the LTX-2.5 fallback)
                          (default: item.model for slot a, item.modelB for slot b,
                          item.modelC for slot c)
  --seed <n> --width <n> --height <n> --steps <n> --guidance <f>
  --format png|jpeg|webp  container to request (images; default png)
  --negative-mode <m>     field (default) | append | drop
  --out <path>            output file (default art-prompts/v2/candidates/<slot>/<id>.png,
                          .mp4 for videos); the sidecar is written next to it as <name>.json
  --force                 overwrite an existing output
  --archive               replace an existing output, moving the old file + sidecar to
                          candidates/history/<date>/… first (after a successful generation)
  --meta <key=value>      extra sidecar field under "meta" (repeatable; round-2 bookkeeping)
  --edit-from <png>       image edit mode: reference image (repeatable) → /v1/images/edits
  --instruction <text>    image edit mode: what to change (required with --edit-from)
  --instruction-file <p>  the same, read from a file
  --base-url <url> | --port <n>   server origin (default generate.mjs's :30001 proxy)
  --served-model <id>     payload model id (skips nothing: the /v1/models check still runs)
  --any-model             accept whatever model the server lists (recorded in the sidecar)
  --api-key <k>           Bearer token (or env SKYNET_API_KEY)
  --timeout <ms>          per attempt (default 900000; videos 10800000 = 3 h per job)
  --retries <n>           images: whole-request retries (default 2); videos: re-submits of a
                          job the server reports failed (default 1; a timeout never re-submits)
  --manifest <path>       default art-prompts/v2/manifest.json
  --dry-run               print the request and paths; no network, no writes
  --list                  print every item and followup id with its label, then exit
  --help

 video items (kind "video", ids video/<subject>; slots a and b):
  --frames <n>            num_frames (snapped to 4n+1 Wan / 8n+1 LTX)
  --fps <n>               frames per second (re-derives num_frames from the clip's length)
  --seconds <s>           clip length (re-derives num_frames at the fps)
  --source <png>          image-to-video: the start still (required for "mode":"i2v" items;
                          ltx25 / ltxvideo only), sent as a data URI in reference_url
  --job <id>              resume an existing /v1/videos job: poll and download, no submit
  --poll <s>              seconds between job polls (default 10)
  --no-wan-snap           wan22: keep a ÷16 size instead of the nearest trained bucket`;

function fail(message, code = 2) {
  console.error(`error: ${message}`);
  if (code === 2) console.error(`\n${USAGE}`);
  process.exit(code);
}

function parseArgs(argv) {
  const o = {
    id: null, slot: null, prompt: null, promptFile: null, negative: null, model: null,
    seed: null, width: null, height: null, steps: null, guidance: null, format: 'png',
    formatGiven: false, negativeMode: 'field', out: null, force: false, editFrom: [], instruction: null,
    instructionFile: null, archive: false, meta: {},
    baseUrl: null, port: null, modelId: null, anyModel: false,
    apiKey: process.env.SKYNET_API_KEY ?? null, timeout: null, retries: null,
    manifest: path.join(SCRIPT_DIR, 'manifest.json'), dryRun: false, list: false, help: false,
    frames: null, fps: null, seconds: null, source: null, job: null, poll: 10, noWanSnap: false,
  };
  const flags = new Set(['force', 'archive', 'any-model', 'dry-run', 'list', 'help', 'no-wan-snap']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`unexpected argument "${arg}"`);
    const name = arg.slice(2);
    let v = null;
    if (!flags.has(name)) {
      v = argv[++i];
      if (v === undefined) fail(`--${name} requires a value`);
    }
    const int = () => {
      const n = Number(v);
      if (!Number.isInteger(n)) fail(`--${name} expects an integer, got "${v}"`);
      return n;
    };
    const num = () => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) fail(`--${name} expects a positive number, got "${v}"`);
      return n;
    };
    switch (name) {
      case 'id': o.id = v; break;
      case 'slot': o.slot = v; break;
      case 'prompt': o.prompt = v; break;
      case 'prompt-file': o.promptFile = v; break;
      case 'negative': o.negative = v; break;
      case 'model': o.model = GROUP_ALIASES[v] ?? v; break;
      case 'seed': o.seed = int(); break;
      case 'width': o.width = int(); break;
      case 'height': o.height = int(); break;
      case 'steps': o.steps = int(); break;
      case 'guidance': {
        o.guidance = Number(v);
        if (!Number.isFinite(o.guidance)) fail(`--guidance expects a number, got "${v}"`);
        break;
      }
      case 'format': o.format = v.toLowerCase() === 'jpg' ? 'jpeg' : v.toLowerCase(); o.formatGiven = true; break;
      case 'negative-mode': o.negativeMode = v; break;
      case 'out': o.out = path.resolve(v); break;
      case 'force': o.force = true; break;
      case 'edit-from': o.editFrom.push(path.resolve(v)); break;
      case 'instruction': o.instruction = v; break;
      case 'instruction-file': o.instructionFile = v; break;
      case 'archive': o.archive = true; break;
      case 'meta': {
        const eq = v.indexOf('=');
        if (eq < 1 || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(v.slice(0, eq))) fail(`--meta expects key=value, got "${v}"`);
        o.meta[v.slice(0, eq)] = v.slice(eq + 1);
        break;
      }
      case 'base-url': o.baseUrl = v.replace(/\/+$/, ''); break;
      case 'port': o.port = int(); break;
      case 'served-model': o.modelId = v; break;
      case 'any-model': o.anyModel = true; break;
      case 'api-key': o.apiKey = v; break;
      case 'timeout': o.timeout = int(); break;
      case 'retries': o.retries = int(); break;
      case 'manifest': o.manifest = path.resolve(v); break;
      case 'dry-run': o.dryRun = true; break;
      case 'list': o.list = true; break;
      case 'help': o.help = true; break;
      case 'frames': o.frames = int(); break;
      case 'fps': o.fps = int(); if (o.fps <= 0) fail('--fps expects a positive integer'); break;
      case 'seconds': o.seconds = num(); break;
      case 'source': o.source = path.resolve(v); break;
      case 'job': o.job = v; break;
      case 'poll': o.poll = num(); break;
      case 'no-wan-snap': o.noWanSnap = true; break;
      default: fail(`unknown flag --${name}`);
    }
  }
  return o;
}

/** FNV-1a 32-bit hash → a stable 5-digit seed for subjects without a library seed. */
function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) % 100_000;
}

/** Library entry for a manifest source "images/<dir>/<file>.json#<id>", or null. */
async function libraryEntry(source) {
  const m = /^(images\/[^#]+\.json)#(.+)$/.exec(source ?? '');
  if (!m) return null;
  try {
    const doc = JSON.parse(await fs.readFile(path.join(ART_DIR, m[1]), 'utf8'));
    return doc.entries.find((e) => e.id === m[2]) ?? null;
  } catch {
    return null;
  }
}

/** Resolve --id to {item, followup|null}. */
function findTarget(manifest, id) {
  for (const item of manifest.items) {
    if (item.id === id) return { item, followup: null };
    const f = (item.followups ?? []).find((x) => x.id === id);
    if (f) return { item, followup: f };
  }
  return null;
}

/** Width/height from a PNG's IHDR, or null for other containers. */
function pngSize(bytes) {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

function snap16(n, what) {
  const s = Math.max(256, Math.round(n / 16) * 16);
  if (s !== n) console.error(`note: ${what} ${n} snapped to ${s} (multiple of 16)`);
  return s;
}

function multipart(fields, files) {
  const boundary = `----shmupcup${Date.now().toString(16)}${process.pid.toString(16)}`;
  const chunks = [];
  for (const [k, v] of fields) {
    if (v === null || v === undefined) continue;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`), f.bytes, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/** Where --archive moves an existing output: candidates/history/<date>/<path below candidates>. */
function historyPath(file) {
  const cand = path.join(SCRIPT_DIR, 'candidates');
  const rel = path.relative(cand, file);
  const below = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.basename(file);
  return path.join(cand, 'history', new Date().toISOString().slice(0, 10), below);
}

/** --archive: moves `file` and its .json sidecar into history (next free -<n> suffix); returns the new path or null. */
async function archiveExisting(file) {
  if (!(await exists(file))) return null;
  const ext = path.extname(file);
  let dest = historyPath(file);
  for (let n = 2; (await exists(dest)) || (await exists(`${dest.slice(0, -ext.length)}.json`)); n++) {
    dest = `${historyPath(file).slice(0, -ext.length)}-${n}${ext}`;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(file, dest);
  const side = `${file.slice(0, -ext.length)}.json`;
  if (await exists(side)) await fs.rename(side, `${dest.slice(0, -ext.length)}.json`);
  console.error(`archived ${path.relative(REPO_DIR, file)} → ${path.relative(REPO_DIR, dest)}`);
  return dest;
}

/** The --meta fields for a sidecar (omitted when none were given). */
const metaField = (o) => (Object.keys(o.meta).length ? { meta: o.meta } : {});

/** Which model id to put in the payload, after checking what the server has loaded. */
async function checkServedModel(baseUrl, group, groupKey, o) {
  const wanted = o.modelId ?? group.model;
  let ids;
  try {
    const data = await probeModels(baseUrl, o);
    ids = (Array.isArray(data?.data) ? data.data : []).map((e) => e?.id).filter(Boolean);
  } catch (err) {
    console.error(`note: ${baseUrl}/v1/models probe failed (${err.message}) — sending "${wanted}" unchecked`);
    return wanted;
  }
  if (ids.includes(wanted) || ids.length === 0) return wanted;
  if (o.anyModel) {
    console.error(`note: server lists [${ids.join(', ')}]; --any-model adopts "${ids[0]}" for slot ${o.slot}`);
    return ids[0];
  }
  fail(`${baseUrl} serves [${ids.join(', ')}], but slot ${o.slot} wants ${groupKey} ("${wanted}"). Load that model, point --base-url at an origin that serves it, or pass --any-model.`, 3);
  return wanted;
}

/** The model group key a slot uses for an item (or --model), or a usage error. */
function slotGroupKey(item, o) {
  if (o.model) return o.model;
  const key = item[SLOT_FIELD[o.slot]];
  if (!key) {
    const has = SLOTS.filter((s) => item[SLOT_FIELD[s]]).join(', ');
    fail(`${item.id} has no slot ${o.slot} (no "${SLOT_FIELD[o.slot]}" in the manifest; its slots: ${has || 'none'}). Pass --model to force one.`);
  }
  return key;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(USAGE); return; }
  const manifest = JSON.parse(await fs.readFile(o.manifest, 'utf8'));
  if (manifest.schema !== 'shmup-art-picks@1') fail(`${o.manifest}: schema "${manifest.schema}" is not shmup-art-picks@1`);
  if (o.list) {
    for (const it of manifest.items) {
      const slots = [it.model, it.modelB ?? '-', ...(it.modelC ? [it.modelC] : [])].join('/');
      const video = it.kind === 'video' ? `  (video ${it.mode}${it.waitsFor ? `, waits for ${it.waitsFor}` : ''})` : '';
      console.log(`${it.id}  [${slots}]  ${it.label}${video}`);
      for (const f of it.followups ?? []) console.log(`  ${f.id}  ${f.label}`);
    }
    return;
  }
  if (!o.id || !ID_RE.test(o.id)) fail('--id must be a manifest id like boss/halcyon-bulwark (lower-case, "/"-separated)');
  if (!SLOTS.includes(o.slot)) fail('--slot must be a, b or c');
  if (!['field', 'append', 'drop'].includes(o.negativeMode)) fail('--negative-mode must be field|append|drop');
  if (o.prompt !== null && o.promptFile !== null) fail('pass --prompt or --prompt-file, not both');

  const target = findTarget(manifest, o.id);
  if (!target) fail(`no manifest item or followup with id "${o.id}" (try --list)`);
  const { item, followup } = target;
  if (item.kind === 'video') return runVideo(o, item);
  for (const flag of ['frames', 'fps', 'seconds', 'source', 'job']) {
    if (o[flag] !== null) fail(`--${flag} is for video items; ${o.id} is an image`);
  }
  if (o.timeout === null) o.timeout = IMAGE_TIMEOUT_MS;
  if (o.retries === null) o.retries = 2;

  if (!IMAGE_FORMATS.includes(o.format)) fail(`--format must be ${IMAGE_FORMATS.join('|')}`);
  if (o.instructionFile !== null) {
    if (o.instruction !== null) fail('pass --instruction or --instruction-file, not both');
    o.instruction = (await fs.readFile(o.instructionFile, 'utf8').catch(() => fail(`--instruction-file ${o.instructionFile}: unreadable`))).trim();
    if (!o.instruction) fail(`--instruction-file ${o.instructionFile} is empty`);
  }
  if (o.archive && o.force) fail('pass --archive or --force, not both (--archive keeps the old file in history)');
  const editing = o.editFrom.length > 0;
  if (editing && !o.instruction) fail('--edit-from needs --instruction');
  if (!editing && o.instruction) fail('--instruction needs --edit-from');

  const groupKey = slotGroupKey(item, o);
  const groupDef = IMAGE_MODEL_GROUPS[groupKey];
  if (!groupDef) fail(`unknown --model "${groupKey}" (known: ${Object.keys(IMAGE_MODEL_GROUPS).join(', ')})`);

  // --- defaults: followup library entry > item > model defaults ---------------
  const source = followup ? followup.source : item.source;
  const entry = await libraryEntry(source);
  const entrySettings = entry?.settings?.[GROUP_TO_MODEL_NAME[groupKey]] ?? null;
  const parentEntry = followup ? await libraryEntry(item.source) : entry;
  const parentSettings = parentEntry?.settings?.[GROUP_TO_MODEL_NAME[groupKey]] ?? null;

  let prompt = o.prompt ?? (o.promptFile ? (await fs.readFile(o.promptFile, 'utf8')).trim() : null) ?? (followup ? followup.prompt : item.prompt);
  if (editing) prompt = o.instruction;
  const negative = o.negative ?? (followup ? (entry?.negative ?? FOLLOWUP_NEGATIVE) : item.negative) ?? '';

  const [ew, eh] = (entrySettings?.resolution ?? '').split('x').map(Number);
  let width = o.width ?? (followup && ew ? ew : item.width);
  let height = o.height ?? (followup && eh ? eh : item.height);
  const sameModel = groupKey === item.model && !followup;
  const steps = o.steps ?? (sameModel ? item.steps : (entrySettings ?? parentSettings)?.steps ?? DEFAULTS[groupKey].steps);
  const guidance = o.guidance ?? (sameModel ? item.guidance : (entrySettings ?? parentSettings)?.guidance ?? DEFAULTS[groupKey].guidance);
  const seed = o.seed ?? entrySettings?.seed ?? (followup ? null : parentSettings?.seed) ?? hashSeed(o.id);

  let refs = [];
  if (editing) {
    refs = await Promise.all(o.editFrom.map(async (file) => {
      const bytes = await fs.readFile(file).catch(() => fail(`--edit-from ${file}: unreadable`));
      const fmt = detectImageFormat(bytes);
      return { file, bytes, name: path.basename(file), type: fmt === 'jpg' ? 'image/jpeg' : `image/${fmt === 'bin' ? 'png' : fmt}` };
    }));
    const first = pngSize(refs[0].bytes);
    if (o.width === null && first) width = first.w;
    if (o.height === null && first) height = first.h;
  }
  width = snap16(width, 'width');
  height = snap16(height, 'height');

  // --- negative routing (generate.mjs law: FLUX ignores negative_prompt) ------
  let sentPrompt = prompt;
  let negativeSent = null;
  if (negative) {
    if (o.negativeMode === 'append') sentPrompt = appendNegative(prompt, negative);
    else if (o.negativeMode === 'field' && groupDef.supportsNegative) negativeSent = negative;
  }

  // --- output paths ------------------------------------------------------------
  const ext = formatExt(o.format);
  let out = o.out;
  if (!out) {
    const base = path.join(SCRIPT_DIR, 'candidates', o.slot, ...o.id.split('/'));
    if (editing) {
      let k = 1;
      while (await exists(path.join(base, `edit-${k}.${ext}`)) || await exists(path.join(base, `edit-${k}.json`))) k++;
      out = path.join(base, `edit-${k}.${ext}`);
    } else out = `${base}.${ext}`;
  }
  if (!o.force && !o.archive && !o.dryRun && (await exists(out))) fail(`${path.relative(REPO_DIR, out)} exists — pass --archive (keeps it in history) or --force to replace it`, 4);

  const baseUrl = resolveBaseUrl(o);
  const endpoint = editing ? '/v1/images/edits' : '/v1/images/generations';
  const payload = {
    model: o.modelId ?? groupDef.model, prompt: sentPrompt, size: `${width}x${height}`, n: 1,
    response_format: 'b64_json', output_format: o.format, seed, guidance_scale: guidance,
    num_inference_steps: steps,
  };
  if (negativeSent !== null) payload.negative_prompt = negativeSent;

  if (o.dryRun) {
    console.log(`dry-run ${o.slot} ${o.id} ${groupKey} ${width}x${height} seed ${seed} steps ${steps} guidance ${guidance} → ${path.relative(REPO_DIR, out)}`);
    console.log(`POST ${baseUrl}${endpoint}${editing ? ` (multipart, ${refs.length} reference image(s): ${refs.map((r) => path.relative(REPO_DIR, r.file)).join(', ')})` : ''}`);
    if (o.archive && (await exists(out))) console.log(`archive: ${path.relative(REPO_DIR, out)} (+ sidecar) → ${path.relative(REPO_DIR, historyPath(out))} after a successful generation`);
    if (Object.keys(o.meta).length) console.log(`meta: ${JSON.stringify(o.meta)}`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  payload.model = await checkServedModel(baseUrl, groupDef, groupKey, o);
  const started = Date.now();
  let resp = null;
  let lastErr = null;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    const deadline = Date.now() + o.timeout;
    const t = { ...o, retries: 2 };
    try {
      if (editing) {
        const fields = Object.entries(payload).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]);
        const { body, contentType } = multipart(fields, refs);
        const headers = { ...httpHeaders(o), 'Content-Type': contentType, 'Content-Length': String(body.length) };
        const res = await fetchWithRetry(`${baseUrl}${endpoint}`, { method: 'POST', headers, body }, t, deadline);
        const text = await safeText(res);
        if (!res.ok) throw new HttpError(res.status, text, `${baseUrl}${endpoint}`);
        resp = JSON.parse(text);
      } else {
        resp = await postJson(baseUrl, endpoint, payload, t, deadline);
      }
      const item0 = Array.isArray(resp?.data) ? resp.data[0] : null;
      if (!item0) throw new Error(`response had no data[]: ${JSON.stringify(resp).slice(0, 200)}`);
      resp.bytes = item0.b64_json ? Buffer.from(item0.b64_json, 'base64')
        : item0.url ? await getBinary(item0.url.startsWith('http') ? item0.url : `${baseUrl}${item0.url}`, t, deadline)
          : null;
      if (!resp.bytes) throw new Error('data[0] had neither b64_json nor url');
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const permanent = err instanceof HttpError && err.status < 500 && err.status !== 429;
      if (permanent || attempt === o.retries) break;
      const wait = 5000 * 2 ** attempt;
      console.error(`retry ${attempt + 1}/${o.retries} in ${wait / 1000}s: ${err.message.slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  if (lastErr) {
    console.log(`FAILED ${o.slot} ${o.id} ${groupKey}: ${lastErr.message.slice(0, 300)}`);
    process.exit(1);
  }

  const format = detectImageFormat(resp.bytes);
  let file = out;
  if (format !== 'bin' && formatExt(format === 'jpg' ? 'jpeg' : format) !== path.extname(out).slice(1)) {
    file = `${out.slice(0, out.length - path.extname(out).length)}.${format}`;
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const archived = o.archive ? await archiveExisting(file) : null;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFileAtomic(file, resp.bytes);
  const real = pngSize(resp.bytes);
  if (real && (real.w !== width || real.h !== height)) {
    console.error(`warning: ${o.id}: asked ${width}x${height}, the server returned ${real.w}x${real.h}`);
  }
  const sidecar = {
    id: o.id, slot: o.slot, prompt, negative, model: groupKey, seed, width, height, steps, guidance,
    generatedAt: new Date().toISOString(), seconds,
    label: followup ? followup.label : item.label, source,
    file: path.relative(REPO_DIR, file), format, requestedFormat: o.format,
    servedModel: payload.model, endpoint: `${baseUrl}${endpoint}`, negativeSent,
    mode: editing ? 'edit' : 'generate',
    ...(editing ? {
      editFrom: refs.map((r) => path.relative(REPO_DIR, r.file)),
      // SHA-256 of each reference as sent, so the ingest tool can match a committed winner copy byte for byte.
      editFromSha256: refs.map((r) => createHash('sha256').update(r.bytes).digest('hex')),
      instruction: o.instruction,
    } : {}),
    ...(real ? { outputSize: `${real.w}x${real.h}` } : {}),
    ...(archived ? { replaced: path.relative(REPO_DIR, archived) } : {}),
    ...metaField(o),
  };
  const sidecarPath = `${file.slice(0, file.length - path.extname(file).length)}.json`;
  await writeFileAtomic(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  const warn = format !== (o.format === 'jpeg' ? 'jpg' : o.format) ? `  (warning: server returned ${format}, asked ${o.format})` : '';
  console.log(`ok ${o.slot} ${o.id} ${groupKey} ${width}x${height} seed ${seed} ${seconds}s → ${path.relative(REPO_DIR, file)}${warn}`);
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

/** generate.mjs's Wan2.2 trained buckets and its nearest-bucket rule (snapToWanBucket). */
const WAN_BUCKETS = [{ w: 1280, h: 720 }, { w: 720, h: 1280 }, { w: 832, h: 480 }, { w: 480, h: 832 }];
function wanBucket(w, h) {
  const pair = w / h >= 1 ? [WAN_BUCKETS[0], WAN_BUCKETS[2]] : [WAN_BUCKETS[1], WAN_BUCKETS[3]];
  const lnReq = Math.log(w / h);
  const d = pair.map((b) => Math.abs(lnReq - Math.log(b.w / b.h)));
  if (Math.abs(d[0] - d[1]) >= 0.05) return d[0] <= d[1] ? pair[0] : pair[1];
  const lnArea = Math.log(w * h);
  const da = pair.map((b) => Math.abs(lnArea - Math.log(b.w * b.h)));
  return da[0] <= da[1] ? pair[0] : pair[1];
}

/** generate.mjs's snapDiv: floor to a multiple of d, at least 256. */
function snapDiv(n, d) {
  return Math.max(256, Math.floor(n / d) * d);
}

/** Size on the family grid (Wan ÷16 + bucket unless --no-wan-snap, LTX ÷32), with notes. */
function snapVideoSize(w, h, groupKey, group, o) {
  const d = group.divisor;
  let sw = w % d === 0 && w >= 256 ? w : snapDiv(w, d);
  let sh = h % d === 0 && h >= 256 ? h : snapDiv(h, d);
  if (sw !== w || sh !== h) console.error(`note: ${w}x${h} is not ÷${d} for ${groupKey} — snapped to ${sw}x${sh}`);
  if (groupKey === 'wan22' && !o.noWanSnap) {
    const b = wanBucket(sw, sh);
    if (b.w !== sw || b.h !== sh) console.error(`note: ${sw}x${sh} snapped to the trained Wan2.2 bucket ${b.w}x${b.h} (--no-wan-snap keeps it)`);
    sw = b.w;
    sh = b.h;
  }
  return { w: sw, h: sh };
}

/** generate.mjs's snapFrames: the nearest step·n+1 (8n+1 LTX, 4n+1 Wan). */
function snapFrames(target, step) {
  const k = Math.max(1, Math.round((target - 1) / step));
  return k * step + 1;
}

/** A ÷div size of about `area` pixels with the aspect closest to `aspect`. */
function fitAspect(aspect, area, div) {
  let best = null;
  for (let h = div * 8; h <= 2048; h += div) {
    const w = Math.round((h * aspect) / div) * div;
    if (w < div * 8 || w > 2048) continue;
    const errA = Math.abs(Math.log(w / h) - Math.log(aspect));
    const score = (errA < 0.02 ? 0 : 10 + errA) + Math.abs(Math.log((w * h) / area));
    if (!best || score < best.score) best = { w, h, score };
  }
  return best;
}

/** The library's own LTX size for a Wan size (video/00-workflow.md §2). */
const WAN_TO_LTX = { '1280x720': '960x544', '832x480': '768x512', '720x1280': '576x1024', '480x832': '512x768' };

/** Settings for a group the item has no settings.<group> for, derived from slot a's. */
function deriveVideoSettings(item, group) {
  const a = item.settings?.[item.model] ?? item;
  let w = a.width;
  let h = a.height;
  // LTX gets the library's LTX size for a Wan size; Wan's bucket snap happens in snapVideoSize
  if (group.divisor === 32 && WAN_TO_LTX[`${w}x${h}`]) [w, h] = WAN_TO_LTX[`${w}x${h}`].split('x').map(Number);
  const seconds = a.seconds ?? (a.num_frames && a.fps ? a.num_frames / a.fps : 5);
  const fps = group.defaults.fps;
  return {
    width: w, height: h, fps, num_frames: snapFrames(Math.round(seconds * fps), group.frameStep),
    steps: group.defaults.steps, guidance: group.defaults.guidance, seed: a.seed ?? null, derived: true,
  };
}

/** Checks /v1/models: the served id (exit 3 like images) and a video task_type for the mode. */
async function checkVideoModel(baseUrl, group, groupKey, o, mode) {
  const wanted = o.modelId ?? group.model;
  let entries;
  try {
    const data = await probeModels(baseUrl, o);
    entries = (Array.isArray(data?.data) ? data.data : []).filter((e) => e?.id);
  } catch (err) {
    console.error(`note: ${baseUrl}/v1/models probe failed (${err.message}) — sending "${wanted}" unchecked`);
    return { model: wanted, taskType: null };
  }
  let entry = entries.find((e) => e.id === wanted);
  if (!entry && entries.length) {
    if (!o.anyModel) {
      fail(`${baseUrl} serves [${entries.map((e) => e.id).join(', ')}], but slot ${o.slot} wants ${groupKey} ("${wanted}"). Load that model, point --base-url at an origin that serves it, or pass --any-model.`, 3);
    }
    entry = entries[0];
    console.error(`note: server lists [${entries.map((e) => e.id).join(', ')}]; --any-model adopts "${entry.id}" for slot ${o.slot}`);
  }
  const types = new Set([entry?.task_type, ...(Array.isArray(entry?.supported_task_types) ? entry.supported_task_types : [])]
    .filter((t) => typeof t === 'string').map((t) => t.toUpperCase()));
  if (types.size) {
    const need = mode === 'i2v' ? ['I2V', 'TI2V'] : ['T2V', 'TI2V'];
    if (!need.some((t) => types.has(t))) {
      const isVideo = [...types].some((t) => /2V$/.test(t));
      fail(`${baseUrl} serves "${entry.id}" with task_type ${[...types].join('/')} — ${isVideo ? `not a ${mode.toUpperCase()} model` : 'not a video model at all'} (a ${mode} clip needs ${need.join(' or ')}). For slot b, the fallback is --model ltxvideo on the ltxvideo server.`, 3);
    }
  } else {
    console.error(`note: /v1/models gives no task_type for "${entry?.id ?? wanted}" — the video check is the id only`);
  }
  return { model: entry?.id ?? wanted, taskType: entry?.task_type ?? null };
}

async function runVideo(o, item) {
  if (o.editFrom.length || o.instruction || o.instructionFile) fail(`${item.id} is a video: --edit-from / --instruction are for images (image-to-video takes --source <png>)`);
  if (o.archive && o.force) fail('pass --archive or --force, not both (--archive keeps the old file in history)');
  if (o.formatGiven && o.format !== 'mp4') fail(`${item.id} is a video: --format does not apply (the server returns mp4)`);
  if (o.slot === 'c') fail(`${item.id} is a video: videos have slots a and b only`);
  if (o.timeout === null) o.timeout = VIDEO_TIMEOUT_MS;
  if (o.retries === null) o.retries = 1;
  if (o.job) o.retries = 0; // a resumed job is never re-submitted

  const groupKey = slotGroupKey(item, o);
  const group = VIDEO_MODEL_GROUPS[groupKey];
  if (!group) fail(`${item.id} is a video: --model must be ${Object.keys(VIDEO_MODEL_GROUPS).join('|')} (got "${groupKey}")`);
  // --- mode and the start still ------------------------------------------------
  const mode = item.mode === 'i2v' || o.source ? 'i2v' : 't2v';
  if (mode === 'i2v' && !group.i2v) {
    fail(`${groupKey} (${group.model}) is text-to-video only on skynet2 — ${o.source ? '--source needs' : `${item.id} is image-to-video and needs`} ltx25 or ltxvideo`);
  }
  const base = item.settings?.[groupKey] ?? deriveVideoSettings(item, group);
  if (base.derived) console.error(`note: ${item.id} has no settings.${groupKey} — derived from slot a's (${base.width}x${base.height}, ${base.num_frames} f @ ${base.fps} fps)`);
  let ref = null;
  if (o.source) {
    const bytes = await fs.readFile(o.source).catch(() => fail(`--source ${o.source}: unreadable`));
    const fmt = detectImageFormat(bytes);
    if (!['png', 'jpg', 'webp'].includes(fmt)) fail(`--source ${o.source}: not a PNG/JPEG/WebP image (detected ${fmt})`);
    ref = { file: o.source, bytes, type: fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`, size: pngSize(bytes) };
  } else if (mode === 'i2v' && !o.dryRun && !o.job) {
    fail(`${item.id} is image-to-video: pass --source <png> — the owner's winning still of ${item.waitsFor ?? '(its still)'}, i.e. art-prompts/v2/candidates/<winner slot>/${item.waitsFor ?? '<still id>'}.png`);
  }

  // --- settings: CLI > settings.<group> > derived, then the family grid --------
  let width = o.width ?? base.width;
  let height = o.height ?? base.height;
  if (ref?.size && o.width === null && o.height === null) {
    const aspect = ref.size.w / ref.size.h;
    if (Math.abs(Math.log((width / height) / aspect)) > Math.log(1.03)) {
      const fit = fitAspect(aspect, width * height, group.divisor);
      console.error(`note: the still is ${ref.size.w}x${ref.size.h}; ${width}x${height} refitted to its aspect: ${fit.w}x${fit.h}`);
      width = fit.w;
      height = fit.h;
    }
  }
  ({ w: width, h: height } = snapVideoSize(width, height, groupKey, group, o));
  const fps = o.fps ?? base.fps;
  const clipSeconds = base.seconds ?? base.num_frames / base.fps;
  let frames = o.frames ?? (o.seconds !== null ? Math.round(o.seconds * fps)
    : o.fps !== null ? Math.round(clipSeconds * fps) : base.num_frames);
  const snapped = snapFrames(frames, group.frameStep);
  if (snapped !== frames) console.error(`note: num_frames ${frames} snapped to ${snapped} (${group.frameStep}n+1 for ${groupKey})`);
  frames = snapped;
  const steps = o.steps ?? base.steps;
  const guidance = o.guidance ?? base.guidance;
  const seed = o.seed ?? base.seed ?? hashSeed(item.id);
  const seconds = Math.round((frames / fps) * 100) / 100;

  const prompt = o.prompt ?? (o.promptFile ? (await fs.readFile(o.promptFile, 'utf8')).trim() : null) ?? item.prompt;
  const negative = o.negative ?? item.negative ?? '';
  let sentPrompt = prompt;
  let negativeSent = null;
  if (negative) {
    if (o.negativeMode === 'append') sentPrompt = appendNegative(prompt, negative);
    else if (o.negativeMode === 'field') negativeSent = negative; // both video families honour it
  }

  const out = o.out ?? `${path.join(SCRIPT_DIR, 'candidates', o.slot, ...item.id.split('/'))}.mp4`;
  if (!o.force && !o.archive && !o.dryRun && (await exists(out))) fail(`${path.relative(REPO_DIR, out)} exists — pass --archive (keeps it in history) or --force to replace it`, 4);

  const baseUrl = resolveBaseUrl(o);
  const payload = {
    model: o.modelId ?? group.model, prompt: sentPrompt, size: `${width}x${height}`,
    num_frames: frames, fps, seed, guidance_scale: guidance, num_inference_steps: steps,
  };
  if (negativeSent !== null) payload.negative_prompt = negativeSent;
  // generate.mjs's LTX-Video text-encoder budget (its 128-token default truncates prompts)
  if (groupKey === 'ltxvideo') payload.diffusers_kwargs = { max_sequence_length: 256 };

  if (o.dryRun) {
    const still = ref ? path.relative(REPO_DIR, ref.file) : `needs --source: the winning still of ${item.waitsFor ?? 'its still'}`;
    console.log(`dry-run ${o.slot} ${item.id} ${groupKey} ${mode} ${width}x${height} ${frames}f @ ${fps}fps (${seconds}s) seed ${seed} steps ${steps} guidance ${guidance} → ${path.relative(REPO_DIR, out)}`);
    console.log(o.job ? `resume job ${o.job}: GET ${baseUrl}/v1/videos/${o.job} every ${o.poll}s, then …/content`
      : `POST ${baseUrl}/v1/videos, then GET /v1/videos/{id} every ${o.poll}s, then GET /v1/videos/{id}/content (timeout ${Math.round(o.timeout / 60000)} min)`);
    console.log(JSON.stringify(mode === 'i2v' ? { ...payload, reference_url: `data:image/png;base64,<${still} — encoded at send time>` } : payload, null, 2));
    return;
  }

  const check = await checkVideoModel(baseUrl, group, groupKey, o, mode);
  payload.model = check.model;
  if (ref) payload.reference_url = `data:${ref.type};base64,${ref.bytes.toString('base64')}`;

  const started = Date.now();
  let job = null;
  let lastErr = null;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    const deadline = Date.now() + o.timeout;
    try {
      let id = o.job;
      if (!id || attempt > 0) {
        const created = await postJson(baseUrl, '/v1/videos', payload, { ...o, retries: 2 }, Math.min(deadline, Date.now() + 300_000));
        id = created?.id;
        if (!id) throw new Error(`video submit returned no job id: ${JSON.stringify(created).slice(0, 200)}`);
        console.error(`job ${id} submitted (${item.id}, slot ${o.slot}, ${groupKey}) — if this client stops, resume with --job ${id}`);
      }
      job = await pollVideoJob(baseUrl, id, o, deadline);
      if (job.status === 'failed') {
        const msg = typeof job.error === 'string' ? job.error : JSON.stringify(job.error ?? job).slice(0, 300);
        const err = new Error(`video job ${id} failed server-side: ${msg}`);
        err.resubmit = true;
        throw err;
      }
      job.bytes = job.url && /^https?:/.test(job.url)
        ? await getBinary(job.url, { ...o, retries: 3 }, Date.now() + 900_000)
        : await getBinary(`${baseUrl}/v1/videos/${encodeURIComponent(id)}/content`, { ...o, retries: 3 }, Date.now() + 900_000);
      job.id = id;
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (!err.resubmit || attempt === o.retries) break;
      console.error(`re-submitting (${attempt + 1}/${o.retries}) in 10s: ${err.message.slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  if (lastErr) {
    console.log(`FAILED ${o.slot} ${item.id} ${groupKey}: ${lastErr.message.slice(0, 400)}`);
    process.exit(1);
  }

  const format = detectImageFormat(job.bytes);
  if (format !== 'mp4') console.error(`warning: ${item.id}: expected mp4 bytes, detected "${format}" — kept as .mp4`);
  const generationSeconds = Math.round((Date.now() - started) / 100) / 10;
  const archived = o.archive ? await archiveExisting(out) : null;
  await fs.mkdir(path.dirname(out), { recursive: true });
  await writeFileAtomic(out, job.bytes);
  const sidecar = {
    id: item.id, slot: o.slot, prompt, negative, model: groupKey, seed, width, height, steps, guidance,
    generatedAt: new Date().toISOString(), seconds,
    label: item.label, source: item.source,
    file: path.relative(REPO_DIR, out), format, requestedFormat: 'mp4',
    servedModel: payload.model, endpoint: `${baseUrl}/v1/videos`, negativeSent,
    mode, kind: 'video', num_frames: frames, fps, generationSeconds, jobId: job.id,
    taskType: check.taskType, bytes: job.bytes.length,
    ...(ref ? { sourceImage: path.relative(REPO_DIR, ref.file), sourceSize: ref.size ? `${ref.size.w}x${ref.size.h}` : null } : {}),
    ...(item.waitsFor ? { waitsFor: item.waitsFor } : {}),
    ...(groupKey !== item[SLOT_FIELD[o.slot]] ? { slotModel: item[SLOT_FIELD[o.slot]] ?? null } : {}),
    ...(archived ? { replaced: path.relative(REPO_DIR, archived) } : {}),
    ...metaField(o),
  };
  await writeFileAtomic(`${out.slice(0, out.length - path.extname(out).length)}.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(`ok ${o.slot} ${item.id} ${groupKey} ${mode} ${width}x${height} ${frames}f@${fps} (${seconds}s clip) seed ${seed} ${generationSeconds}s → ${path.relative(REPO_DIR, out)}`);
}

/** Polls a video job until completed/failed; throws on timeout or a lost job (never re-submits). */
async function pollVideoJob(baseUrl, id, o, deadline) {
  const url = `${baseUrl}/v1/videos/${encodeURIComponent(id)}`;
  let misses = 0;
  let lastNote = 0;
  for (;;) {
    let job = null;
    try {
      const res = await fetchWithRetry(url, { method: 'GET', headers: httpHeaders(o) }, { ...o, retries: 3 }, Math.min(deadline, Date.now() + 120_000));
      const text = await safeText(res);
      if (res.status === 404) throw Object.assign(new Error(`job ${id} is unknown to the server (404 — restarted?): ${text.slice(0, 200)}`), { lost: true });
      if (!res.ok) throw new HttpError(res.status, text, url);
      job = JSON.parse(text);
      misses = 0;
    } catch (err) {
      if (err.lost) throw err;
      if (++misses >= 6) throw new Error(`lost contact while polling job ${id} (${err.message.slice(0, 200)}) — the job may still run: resume with --job ${id}`);
      console.error(`poll ${id}: ${err.message.slice(0, 160)} (miss ${misses}/6)`);
    }
    const status = job?.status;
    if (status === 'completed' || status === 'failed') return job;
    if (Date.now() - lastNote >= 60_000) {
      lastNote = Date.now();
      const pct = Number.isFinite(job?.progress) ? ` ${job.progress}%` : '';
      console.error(`job ${id}: ${status ?? 'unknown'}${pct} after ${Math.round((Date.now() - (deadline - o.timeout)) / 1000)}s`);
    }
    if (Date.now() + o.poll * 1000 > deadline) {
      throw new Error(`job ${id} not finished after ${Math.round(o.timeout / 60000)} min (last status ${status ?? 'unknown'}) — it may still run: resume with --job ${id}`);
    }
    await new Promise((r) => setTimeout(r, o.poll * 1000));
  }
}

main().catch((err) => {
  console.log(`FAILED ${err.message}`);
  process.exit(1);
});
