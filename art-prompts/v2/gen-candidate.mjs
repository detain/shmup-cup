#!/usr/bin/env node
/*
 * gen-candidate.mjs — generate ONE candidate image for the v2 art picks
 * (art-prompts/v2/manifest.json, schema shmup-art-picks@1) on the SGLang diffusion
 * server, reusing generate.mjs's transport (imported, not copied). Zero npm
 * dependencies, Node >= 20.
 *
 * STATUS: NOT YET RUN AGAINST THE SERVER (2026-10-16). Built and checked offline with
 * --dry-run only; the first live run should be one --dry-run, then one real image.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------
 *   node art-prompts/v2/gen-candidate.mjs --id boss/halcyon-bulwark --slot a
 *     → art-prompts/v2/candidates/a/boss/halcyon-bulwark.png
 *       + art-prompts/v2/candidates/a/boss/halcyon-bulwark.json (sidecar)
 * Every value missing from the command line defaults from the manifest item:
 * prompt, negative, size, steps, guidance; the model is the item's `model` for slot
 * a and its `modelB` for slot b. --id may also name a followup ("<item id>/<suffix>"):
 * its prompt is used, its size and settings come from its library entry when it has
 * one, else from the parent item. Seeds default to the library entry's seed for that
 * model (else a stable hash of the id), so a rerun reproduces an image; pass --seed
 * to re-roll.
 *
 * EDIT MODE (later jobs: "remaining poses following the winner", "update the chosen
 * image per the owner's comment"): --edit-from <png> (repeatable for several
 * references) --instruction <text> posts multipart to /v1/images/edits. SGLang serves
 * that route (image_api.py) for pipelines built with image inputs — FLUX.2-dev
 * (multi-reference) and the Qwen-Image-Edit family (group qwenedit below, served id
 * Qwen/Qwen-Image-Edit-2511 by default; --served-model picks 2509 or the original).
 * The output size defaults to the first reference's PNG size. Edits never overwrite:
 * they land at <id>.edit-<k>.png (next free k) unless --out says otherwise.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT EXPECTS FROM THE SERVER
 * ---------------------------------------------------------------------------
 *  - OpenAI-shaped image API at the base URL (default generate.mjs's single-model
 *    proxy http://skynet2.interserver.net:30001; --base-url / --port override):
 *      GET  /v1/models                 → which model is loaded (checked first)
 *      POST /v1/images/generations     JSON: model, prompt, size "WxH", n 1,
 *                                      response_format b64_json, output_format png,
 *                                      seed, guidance_scale, num_inference_steps,
 *                                      negative_prompt (sd35 / qwen only)
 *      POST /v1/images/edits           multipart: image (repeated), prompt, model, …
 *  - ONE model per origin: slot a (flux2) and slot b (qwenvl) need either a model
 *    switch between batches or two origins (pass --base-url per slot). The helper
 *    refuses to run when /v1/models lists a different model than the slot wants
 *    (exit 3), so a wrong model never fills a slot silently; --any-model overrides.
 *
 * RETRIES: generate.mjs's transport retries 5xx/429 and connection-phase errors; on
 * top of that this helper retries the whole request (--retries, default 2) after
 * timeouts or mid-flight resets — a single duplicate image is cheap, unlike a sweep.
 * HTTP 4xx (except 429) fails at once.
 *
 * EXIT CODES: 0 ok (or dry run) · 1 generation failed · 2 usage error ·
 *             3 server serves another model · 4 output exists (use --force)
 */

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
const DEFAULTS = { ...README_DEFAULTS, qwenedit: { guidance: 4.0, steps: 40 } };
const GROUP_TO_MODEL_NAME = Object.fromEntries(Object.entries(MODEL_NAME_TO_GROUP).map(([n, g]) => [g, n]));
const ID_RE = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/;
const FOLLOWUP_NEGATIVE = 'photorealistic, 3d render, text, labels, numbers, cell borders, watermark, blurry, green tint on the subject, green spill';

const USAGE = `usage: node art-prompts/v2/gen-candidate.mjs --id <item or followup id> --slot a|b [options]

  --prompt <text> | --prompt-file <path>   positive prompt (default: the manifest's)
  --negative <text>       negative prompt (default: the manifest's; sent only to sd35/qwen*)
  --model <group>         ${Object.keys(IMAGE_MODEL_GROUPS).join('|')} (default: item.model for slot a,
                          item.modelB for slot b)
  --seed <n> --width <n> --height <n> --steps <n> --guidance <f>
  --format png|jpeg|webp  container to request (default png)
  --negative-mode <m>     field (default) | append | drop
  --out <path>            output file (default art-prompts/v2/candidates/<slot>/<id>.png);
                          the sidecar is written next to it as <name>.json
  --force                 overwrite an existing output
  --edit-from <png>       edit mode: reference image (repeatable) → /v1/images/edits
  --instruction <text>    edit mode: what to change (required with --edit-from)
  --base-url <url> | --port <n>   server origin (default generate.mjs's :30001 proxy)
  --served-model <id>     payload model id (skips nothing: the /v1/models check still runs)
  --any-model             accept whatever model the server lists (recorded in the sidecar)
  --api-key <k>           Bearer token (or env SKYNET_API_KEY)
  --timeout <ms>          per attempt (default 900000) · --retries <n> (default 2)
  --manifest <path>       default art-prompts/v2/manifest.json
  --dry-run               print the request and paths; no network, no writes
  --list                  print every item and followup id with its label, then exit
  --help`;

function fail(message, code = 2) {
  console.error(`error: ${message}`);
  if (code === 2) console.error(`\n${USAGE}`);
  process.exit(code);
}

function parseArgs(argv) {
  const o = {
    id: null, slot: null, prompt: null, promptFile: null, negative: null, model: null,
    seed: null, width: null, height: null, steps: null, guidance: null, format: 'png',
    negativeMode: 'field', out: null, force: false, editFrom: [], instruction: null,
    baseUrl: null, port: null, modelId: null, anyModel: false,
    apiKey: process.env.SKYNET_API_KEY ?? null, timeout: 900_000, retries: 2,
    manifest: path.join(SCRIPT_DIR, 'manifest.json'), dryRun: false, list: false, help: false,
  };
  const flags = new Set(['force', 'any-model', 'dry-run', 'list', 'help']);
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
      case 'format': o.format = v.toLowerCase() === 'jpg' ? 'jpeg' : v.toLowerCase(); break;
      case 'negative-mode': o.negativeMode = v; break;
      case 'out': o.out = path.resolve(v); break;
      case 'force': o.force = true; break;
      case 'edit-from': o.editFrom.push(path.resolve(v)); break;
      case 'instruction': o.instruction = v; break;
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
    const f = item.followups.find((x) => x.id === id);
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

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(USAGE); return; }
  const manifest = JSON.parse(await fs.readFile(o.manifest, 'utf8'));
  if (manifest.schema !== 'shmup-art-picks@1') fail(`${o.manifest}: schema "${manifest.schema}" is not shmup-art-picks@1`);
  if (o.list) {
    for (const it of manifest.items) {
      console.log(`${it.id}  [${it.model}/${it.modelB}]  ${it.label}`);
      for (const f of it.followups) console.log(`  ${f.id}  ${f.label}`);
    }
    return;
  }
  if (!o.id || !ID_RE.test(o.id)) fail('--id must be a manifest id like boss/halcyon-bulwark (lower-case, "/"-separated)');
  if (o.slot !== 'a' && o.slot !== 'b') fail('--slot must be a or b');
  if (!IMAGE_FORMATS.includes(o.format)) fail(`--format must be ${IMAGE_FORMATS.join('|')}`);
  if (!['field', 'append', 'drop'].includes(o.negativeMode)) fail('--negative-mode must be field|append|drop');
  if (o.prompt !== null && o.promptFile !== null) fail('pass --prompt or --prompt-file, not both');
  const editing = o.editFrom.length > 0;
  if (editing && !o.instruction) fail('--edit-from needs --instruction');
  if (!editing && o.instruction) fail('--instruction needs --edit-from');

  const target = findTarget(manifest, o.id);
  if (!target) fail(`no manifest item or followup with id "${o.id}" (try --list)`);
  const { item, followup } = target;

  const groupKey = o.model ?? (o.slot === 'a' ? item.model : item.modelB);
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
      while (await exists(`${base}.edit-${k}.${ext}`) || await exists(`${base}.edit-${k}.json`)) k++;
      out = `${base}.edit-${k}.${ext}`;
    } else out = `${base}.${ext}`;
  }
  if (!o.force && !o.dryRun && (await exists(out))) fail(`${path.relative(REPO_DIR, out)} exists — pass --force to replace it`, 4);

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
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFileAtomic(file, resp.bytes);
  const sidecar = {
    id: o.id, slot: o.slot, prompt, negative, model: groupKey, seed, width, height, steps, guidance,
    generatedAt: new Date().toISOString(), seconds,
    label: followup ? followup.label : item.label, source,
    file: path.relative(REPO_DIR, file), format, requestedFormat: o.format,
    servedModel: payload.model, endpoint: `${baseUrl}${endpoint}`, negativeSent,
    mode: editing ? 'edit' : 'generate',
    ...(editing ? { editFrom: refs.map((r) => path.relative(REPO_DIR, r.file)), instruction: o.instruction } : {}),
  };
  const sidecarPath = `${file.slice(0, file.length - path.extname(file).length)}.json`;
  await writeFileAtomic(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  const warn = format !== (o.format === 'jpeg' ? 'jpg' : o.format) ? `  (warning: server returned ${format}, asked ${o.format})` : '';
  console.log(`ok ${o.slot} ${o.id} ${groupKey} ${width}x${height} seed ${seed} ${seconds}s → ${path.relative(REPO_DIR, file)}${warn}`);
}

main().catch((err) => {
  console.log(`FAILED ${err.message}`);
  process.exit(1);
});
