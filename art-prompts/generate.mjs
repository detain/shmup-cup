#!/usr/bin/env node
/*
 * generate.mjs — batch image/video generation driver for the shmup-cup
 * art-prompts library, targeting an SGLang Diffusion server via the
 * OpenAI-compatible API. Zero npm dependencies, Node >= 20 (global fetch,
 * ESM). Ported 2026-10-07 from hosting-hero media/prompts/generate.mjs v3;
 * the TRANSPORT + HTTP + pooling layers ride unchanged, the PARSER and
 * PLANNING layers speak the shmup library format natively.
 *
 * ---------------------------------------------------------------------------
 * PROMPT LIBRARY FORMAT (shmup-cup/art-prompts — verified on disk 2026-10-07)
 * ---------------------------------------------------------------------------
 * Layout (RECURSIVE two roots, skip README.md + 00-*.md anywhere):
 *   images/<NN-dir>/*.md   48 files, 206 entries  (10-logo-title, 20-player-crafts,
 *                            30-bosses, 40-enemies, 50-stages, 60-items-fx,
 *                            70-key-moments, 80-promo — counts move with the
 *                            live library; --list prints the current census.)
 *   video/<NN-dir>/*.md    26 files,  68 entries  (10-title-attract …
 *                            70-ambient-loops)
 * Entry = `## <slug> — <title>` heading, then bold-field lines, ONE ```text
 * fence (the positive prompt paragraph), and a `**Settings:**` pipe table.
 *
 * IMAGE entry schema (uniform across image entries):
 *   **Models:** flux.1-dev, flux.2-dev, sd3.5-large, qwen-image (10 combos)
 *   **Variation:** N/M of K            (id = <slug>-v<N>; "2/3 of 2"
 *                                       mismatches tolerated, warn on N>K)
 *   ```text  positive paragraph ```
 *   **Settings:** | param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
 *                 rows: resolution | guidance | steps | seed  (PER-MODEL cols;
 *                 header read dynamically, never hardcoded)
 *   **Negative:** (sd3.5/qwen only) `comma list`   → FLUX never receives it
 *   **Notes:** free text (sidecar only)
 * A model missing from the Settings header row → README defaults
 * (sd3.5 g5.0/s32, flux.1 g3.5/s40, flux.2 g3.5/s40, qwen g4.0/s30) + warn.
 *
 * VIDEO entry schema (uniform 68/68):
 *   **Model:** ltx-video | wan2.2-t2v | wan2.2-i2v (exactly one)
 *   **Mode:** t2v | i2v
 *   **Variation:** N/M                             (TWO-part, unlike images)
 *   ```text fence ``` ; **Settings:** SINGLE column | param | value | with
 *   resolution / num_frames / fps / duration(text, informational) /
 *   guidance / steps / seed — shipped VERBATIM (no bucketing; dims are
 *   validated against the model-family grid — Wan ÷16, LTX ÷32 — off-grid
 *   warns + snaps. The owner brief said flat ÷32; corrected because the
 *   library ships 39 legal 1280x720 Wan entries where 720 % 32 = 16).
 *   **Negative:** `list`  (NO qualifier — both video models honor it, always
 *   sent in field mode per the shmup library law; differs from hosting-hero's
 *   LTX note deliberately, per owner directive)
 *   **Source image:** `art-prompts/images/<cat>/<slug>-v1-<model>.png`
 *                     (glob `<cat>/<slug>*`)   — present on every Mode:i2v.
 *
 * SCHEMA VARIANT FOUND: 8 entries are `**Mode:** i2v` with `**Model:**
 * ltx-video` (story-crawl-planet-rim, coop-victory-sweep, ark-wake-drift,
 * warning-halcyon-shieldup, king-jaws-over-screen, widow-legs-spread,
 * death-gold-rain-closeup, ark-dive-tail-only). LTX i2v DOES exist in this
 * library — those 8 route to the ltxvideo group and get the same source-still
 * flow as the 17 wan2.2-i2v entries.
 *
 * ---------------------------------------------------------------------------
 * LIBRARY FORMAT v4 (owner conversion pass, 2026-10-07) — THREE PER-FILE SOURCES
 * ---------------------------------------------------------------------------
 * Reality on disk: the conversion landed as JSON SIDECARS, one per category
 * .md: images/<dir>/<stem>.json and video/<dir>/<stem>.json with
 *   {schema:"shmup-art-prompt-library@1", kind:"image"|"video", category,
 *    file, source:"<stem>.md", entries:[…]}
 * Image entry: {id, slug, title, variation:{n,of,total}, models:[names],
 *   positive, negative, settings:{<model-name>:{resolution,guidance,steps,
 *   seed}}, notes}. Video entry: {…, model, modelGroup, mode, settings:
 *   {resolution,num_frames,fps,duration,guidance,steps,seed}, sourceImage:
 *   {declared,glob}|null}. The .md stays the human-authored source (legacy or
 *   labeled-fence shape — both parse).
 *
 * LOAD PRECEDENCE (per file):
 *   1) <stem>.json sidecar — parsed, schema-checked, becomes the block set.
 *      Unparseable JSON (caught mid-write) → LOUD warn naming the file, fall
 *      back to the .md. .md newer than .json → warn (stale sidecar) but JSON
 *      still wins; delete the .json to force .md parsing.
 *   2) .md with a LABELED fence — if the first non-blank fence line matches
 *      /^POSITIVE\s*:/i, the fence is parsed as fields (hosting-hero style):
 *      known KEY: lines start a field (case-insensitive), every other line
 *      (incl. prose like "Mood: …") folds into the current field. FIELD_KEYS
 *      below is the single data-driven list; unknown ALL-CAPS keys ride
 *      block.meta (sidecar) with one warning; mixed-case unknown tokens are
 *      prose, not keys. labeled NEGATIVE supersedes a **Negative:** bold line
 *      (differ → prefer labeled + warn once).
 *      Field precedence INSIDE an entry: fence field > **Settings:** table
 *      column > README default — each time a lower tier feeds the final value
 *      while a higher tier exists-but-differs… precisely: a fence override
 *      that replaces a present table value warns once per entry+param.
 *   3) legacy .md parsing (fence = whole positive, **Negative:** = negative).
 * Decided PER ENTRY in the .md paths, PER FILE between json and md. Downstream
 * (routing, sizes, i2v, payloads) is identical for all three provenances.
 *
 * ---------------------------------------------------------------------------
 * MODEL ROUTING (owner law)
 * ---------------------------------------------------------------------------
 * `--model <group>` generates ONLY entries whose Models/Model line names that
 * group: flux.1-dev→flux1, flux.2-dev→flux2, sd3.5-large→sd35,
 * qwen-image→qwenvl, ltx-video→ltxvideo, wan2.2-t2v|wan2.2-i2v→wan22.
 * `--all` forces every entry of the group's KIND (never crosses kinds).
 *
 * ---------------------------------------------------------------------------
 * IMAGE-TO-VIDEO (i2v) SOURCE-STILL RESOLUTION
 * ---------------------------------------------------------------------------
 * Field (verified against sglang main, video_api.py:707-721): POST /v1/videos
 * accepts `reference_url`; when it is NOT a video source, the server runs
 * _save_first_input_image(reference_url) and feeds pipeline field
 * input_reference. Accepted shapes (utils.py:376-390): http(s) URL,
 * `data:image/…;base64,` URI, or plain path.
 * We send a self-contained DATA URI (no server-FS assumptions). Search law
 * (Source-line dirs in the library do NOT match the real image categories,
 * and the still's slug differs from the video entry's slug):
 *   1) exact candidate: <out>/<image-group>/<declared path minus
 *      "art-prompts/" prefix> (fast path)
 *   2) recursive walk of <out>/<image-group>/images/** for
 *      <prefix>*.{png,jpg,webp} where <prefix> comes from the Source-line
 *      glob basename (or declared basename minus -v…-<model>) — any category,
 *      any variation, any model suffix; NEWEST mtime wins.
 * Found   → reference_url materialized at send time.
 * Missing → task skipped with `[i2v-skipped: no source still]` + manifest
 *   row status:"skipped-i2v", unless --i2v-strict, which errors BEFORE
 *   sending anything.
 * SWEEP ORDER LAW: run ALL image groups BEFORE video groups so the stills
 * exist — sweep-models.sh ALL_GROUPS is ordered exactly that way.
 *
 * ---------------------------------------------------------------------------
 * TRANSPORT LAW (identical to hosting-hero v3 — owner directive 2026-10-07)
 * ---------------------------------------------------------------------------
 * Default origin: http://skynet2.interserver.net:30001 — plain HTTP,
 * SINGLE-MODEL proxy entry point fronting whichever one model is loaded.
 * Precedence: --base-url > --port (http://HOST:<port>) > the default above.
 * Payload model id precedence: --served-model > single-model auto-adopt (one
 * /v1/models entry ⇒ adopt) > group default id. Remote launchers bind their
 * own ports 30000-30006 (REFERENCE ONLY): flux1dev :30000, flux2dev :30001,
 * sd35 :30002, qwenimage :30003, ltx25 :30004 (no group here), wan22 :30005,
 * ltxvideo :30006. Shared https:443 origins stay informational-only; direct
 * origins auto-adopt only a lone DIFFUSION-marked entry.
 * LIVE PROBE (2026-10-07, from the build machine): :30001 /v1/models refused
 * (nothing bound yet); https origin serves only "Qwen/Qwen3.8-Flash-Next-FP8"
 * (plain LLM — never auto-adopted on direct origins). The user's box is the
 * source of truth.
 *
 * ---------------------------------------------------------------------------
 * OUTPUT LAYOUT (images/README.md §output + video/00-workflow.md §4)
 * ---------------------------------------------------------------------------
 *   <out>/<group>/images/<NN-dir>/<slug>-v<N>-<model-short>.png
 *       model-short ∈ sd3.5-large | flux.1-dev | flux.2-dev | qwen-image
 *   <out>/<group>/video/<NN-dir>/<slug>-v<N>-<model>.mp4
 *       model ∈ ltx-video | wan2.2-t2v | wan2.2-i2v
 *       — the workflow's "-s<seed>" suffix is DELIBERATELY OMITTED: it would
 *       break skip-existing/rerun determinism when --seed changes; the seed
 *       ships in the sidecar .json + manifest.jsonl rows instead.
 *   + sidecar <file>.json per media file, + <out>/<group>/manifest.jsonl.
 *   Default --out = <this dir>/output  (art-prompts/output).
 * n>1 → images get -i<idx> suffixes in one request; videos submit n separate
 * single-output jobs (seed+i).
 *
 * ---------------------------------------------------------------------------
 * USAGE EXAMPLES
 * ---------------------------------------------------------------------------
 *   node generate.mjs --list
 *   node generate.mjs --model sd35 --dry-run --filter dir=30-bosses
 *   node generate.mjs --model flux1 --filter id=skeet-vane-swarm-v3   # smoke one image
 *   node generate.mjs --model wan22 --filter id=kestrel-weave-azurerverge-v1  # smoke one t2v
 *   node generate.mjs --model ltxvideo --filter model=ltxvideo     # every ltx entry incl. i2v
 *   node generate.mjs --model wan22 --all --i2v-strict             # force every video entry, fail on missing stills
 *   node generate.mjs --model sd35 --port 30002 --served-model stabilityai/sd-3.5-large
 *   SKYNET_API_KEY=*** node generate.mjs --model qwenvl --seed 1234
 */

import { promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Transport constants
// ---------------------------------------------------------------------------

const HOST = "skynet2.interserver.net";
const DEFAULT_PORT = 30001;
const DEFAULT_BASE_URL = `http://${HOST}:${DEFAULT_PORT}`;

// ---------------------------------------------------------------------------
// Model groups (the six this library names; ltx25 exists on the fleet but no
// shmup prompt targets it — kept out of GROUPS per owner group list)
// ---------------------------------------------------------------------------

/**
 * supportsNegative: image groups — FLUX guidance-distilled pipelines do NOT
 * honor negative_prompt (library "(sd3.5/qwen only)" qualifier); sd35/qwen do.
 * Video groups — per the shmup library law BOTH honor it and negatives are
 * always sent in field mode.
 * maxPixels: safety ceiling only — shmup table values are model-legal
 * verbatim; an explicit --max-pixels trims.
 * port: REFERENCE ONLY (launcher bind port); the default transport ignores it.
 */
const GROUPS = {
  flux1: {
    kind: "image", port: 30000,
    model: "black-forest-labs/FLUX.1-dev",
    supportsNegative: false, maxPixels: 2_097_152,
  },
  flux2: {
    kind: "image", port: 30001,
    model: "black-forest-labs/FLUX.2-dev",
    supportsNegative: false, maxPixels: 2_097_152,
  },
  sd35: {
    kind: "image", port: 30002,
    model: "stabilityai/stable-diffusion-3.5-large",
    supportsNegative: true, maxPixels: 2_097_152,
  },
  qwenvl: {
    kind: "image", port: 30003,
    model: "Qwen/Qwen-Image",
    supportsNegative: true, maxPixels: 2_097_152,
  },
  wan22: {
    kind: "video", port: 30005,
    model: "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
    supportsNegative: true, maxPixels: 1_280 * 720, frameStep: 4, divisor: 16,
  },
  ltxvideo: {
    kind: "video", port: 30006,
    model: "Lightricks/LTX-Video",
    supportsNegative: true, maxPixels: 1_280 * 720, frameStep: 8, divisor: 32,
  },
};
const GROUP_ALIASES = { qwen: "qwenvl" };

/** Library model-name spellings → group keys (routing law). */
const MODEL_NAME_TO_GROUP = {
  "flux.1-dev": "flux1",
  "flux.2-dev": "flux2",
  "sd3.5-large": "sd35",
  "qwen-image": "qwenvl",
  "ltx-video": "ltxvideo",
  "wan2.2-t2v": "wan22",
  "wan2.2-i2v": "wan22",
};

/** Filename token per image group (images/README output naming). */
const IMAGE_MODEL_SHORT = {
  flux1: "flux.1-dev",
  flux2: "flux.2-dev",
  sd35: "sd3.5-large",
  qwenvl: "qwen-image",
};

const IMAGE_GROUPS = ["flux1", "flux2", "sd35", "qwenvl"];

/** README §defaults when a Settings column is missing for a model. */
const README_DEFAULTS = {
  sd35: { guidance: 5.0, steps: 32 },
  flux1: { guidance: 3.5, steps: 40 },
  flux2: { guidance: 3.5, steps: 40 },
  qwenvl: { guidance: 4.0, steps: 30 },
};

// ---------------------------------------------------------------------------
// Library parser
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// README.md + 00-style-kernel.md / 00-workflow.md carry prose headings in the
// same "## " shape; they are skipped by NAME, and entry headings additionally
// must match the slug-form regex, so a stray "## 1. Prime Directive" can never
// masquerade as an entry.
const SKIP_FILE_RE = /^(README\.md|00-.*\.md)$/;

const ENTRY_HEADING_RE = /^##\s+([a-z0-9][a-z0-9._-]*)\s+[—-]\s+(.+)$/;
const NEAR_MISS_RE = /^##(?!#)\s/;
const SIZE_RE = /^(\d+)\s*[xX]\s*(\d+)$/;
const DASH_VALUE_RE = /^(—|-|auto|none|tbd)\.?$/i;

// Single data-driven grammar for LABELED fences (owner conversion format).
// Add a future label = add it here (upper-case canonical spelling).
const FIELD_KEYS = [
  "POSITIVE", "NEGATIVE", "MODELS", "MODEL", "MODE", "VARIATION",
  "SIZE", "RESOLUTION", "ASPECT", "STYLE", "BACKGROUND",
  "GUIDANCE", "STEPS", "SEED", "NUM_FRAMES", "FPS", "DURATION",
  "SOURCE_IMAGE", "NOTES",
];
const FIELD_KEYS_RE = new RegExp(`^(${FIELD_KEYS.join("|")})\\s*:\\s*(.*)$`, "i");
const FIELD_SET = new Set(FIELD_KEYS);
// Unknown keys inside a fence count as fields ONLY when the token is pure
// upper-case snake — so prose continuations like "Mood: serene" never split.
const ANY_KEY_RE = /^([A-Z][A-Z0-9_]*)\s*:\s*(.*)$/;
const LIBRARY_JSON_SCHEMA = "shmup-art-prompt-library@1";

/** Collapse soft-wrapped lines into one whitespace-normalized string. */
function collapse(lines) {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/** Split one library file into entry sections at `## slug — title` headings. */
function splitSections(text, fileLabel, warnings) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = ENTRY_HEADING_RE.exec(line);
    if (m) {
      current = { slug: m[1], title: m[2].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (NEAR_MISS_RE.test(line) && current === null) {
      warnings.push(`${fileLabel}: "##" heading outside entry form skipped: "${line.trim()}"`);
      continue;
    }
    if (line.startsWith("### ")) { // ### must NOT split sections — just body text
      if (current) current.body.push(line);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections;
}

/** First fenced code block in the section body → {text, rest?} or null. */
function extractFence(bodyLines) {
  const start = bodyLines.findIndex((l) => /^\s*```/.test(l));
  if (start === -1) return null;
  const end = bodyLines.findIndex((l, i) => i > start && /^\s*```\s*$/.test(l));
  if (end === -1) return null;
  return {
    text: collapse(bodyLines.slice(start + 1, end)),
    lines: bodyLines.slice(start + 1, end),
    consumed: new Set(range(start, end)),
  };
}

function* range(a, b) {
  for (let i = a; i <= b; i++) yield i;
}

/** True when the fence opens with a POSITIVE: label (conversion format). */
function isLabeledFence(fenceLines) {
  const first = fenceLines.find((l) => l.trim() !== "");
  return first !== undefined && /^POSITIVE\s*:/i.test(first.trim());
}

/**
 * Parse a labeled fence into {fields:Map canonical-key→value, extras:Map}.
 * Known FIELD_KEYS match case-insensitively; unknown pure-upper-case snake
 * tokens become extras (sidecar metadata, warned once); anything else is a
 * continuation line folded into the current field (soft-wrap tolerant).
 */
function parseLabeledFence(fenceLines, label, warnings) {
  const fields = new Map();
  const extras = new Map();
  let cur = null; // {name, known}
  const push = (target, name, chunk) => {
    const prev = target.get(name);
    target.set(name, prev ? `${prev} ${chunk}`.replace(/\s+/g, " ") : chunk.replace(/\s+/g, " ").trim());
  };
  for (const line of fenceLines) {
    const known = FIELD_KEYS_RE.exec(line);
    if (known) {
      const name = known[1].toUpperCase();
      cur = { name, known: true };
      push(fields, name, known[2]);
      continue;
    }
    const anyKey = ANY_KEY_RE.exec(line.trim());
    if (anyKey) {
      warnings.push(`${label}: unknown fence key "${anyKey[1]}:" — recorded in block.meta (sidecar only)`);
      cur = { name: anyKey[1], known: false };
      push(extras, anyKey[1], anyKey[2]);
      continue;
    }
    if (cur === null) {
      if (line.trim()) push(extras, "_preamble", line);
      continue;
    }
    if (/^\s*\*\*/.test(line)) { // a bold field line ends the current field —
      cur = null;                 // it is structure, never a fold continuation
      continue;
    }
    push(cur.known ? fields : extras, cur.name, line);
  }
  for (const [k, v] of fields) fields.set(k, v.trim());
  for (const [k, v] of extras) extras.set(k, v.trim());
  return { fields, extras };
}

/** Numeric/size fence overrides: parsed values or null, warned on garbage. */
function fenceOverrides(fields, label, warnings) {
  const num = (key) => {
    if (!fields.has(key)) return null;
    const n = numCell(fields.get(key));
    if (n === undefined) {
      warnings.push(`${label}: fence ${key} "${fields.get(key)}" unparseable — ignored, table/defaults apply`);
      return null;
    }
    return n;
  };
  let size = null;
  const sizeRaw = fields.get("SIZE") ?? fields.get("RESOLUTION");
  if (sizeRaw !== undefined) {
    size = parseWH(sizeRaw, `${label} fence ${fields.get("SIZE") !== undefined ? "SIZE" : "RESOLUTION"}`, warnings);
    if (!size) warnings.push(`${label}: fence size unusable — table/defaults apply`);
  }
  return { size, guidance: num("GUIDANCE"), steps: num("STEPS"), seed: num("SEED") };
}

/** SOURCE_IMAGE fence value: backticks give [declared, glob], else plain path. */
function parseSourceImageValue(value) {
  const spans = [...String(value).matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  if (spans.length) return { declared: spans[0], glob: spans[1] ?? null };
  const plain = String(value).trim();
  return plain ? { declared: plain, glob: null } : null;
}

function splitModelNames(value) {
  return String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Value after `**Label:**` on its line (continuation lines until next **). */
function boldField(bodyLines, label, skip = new Set()) {
  const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`);
  const out = [];
  for (let i = 0; i < bodyLines.length; i++) {
    if (skip.has(i)) continue;
    const m = re.exec(bodyLines[i]);
    if (!m) continue;
    out.push(m[1]);
    for (let j = i + 1; j < bodyLines.length; j++) {
      const l = bodyLines[j];
      if (/^\s*\*\*/.test(l) || /^\s*```/.test(l) || l.trim() === "") break;
      out.push(l);
    }
    break;
  }
  return out.length ? collapse(out) : null;
}

/** Parse the `**Settings:**` pipe table. Returns {columns, rows} or null. */
function parseSettingsTable(bodyLines) {
  const start = bodyLines.findIndex((l) => /^\s*\*\*Settings:\*\*/.test(l));
  if (start === -1) return null;
  const rows = [];
  let header = null;
  for (let i = start; i < bodyLines.length; i++) {
    const l = bodyLines[i].trim();
    if (l === "") { if (header) break; else continue; }
    if (!l.startsWith("|")) { if (header) break; else continue; }
    const cells = l.split("|").slice(1, -1).map((c) => c.trim());
    if (header === null) { header = cells; continue; }
    if (/^[-:\s|]+$/.test(l)) continue; // separator row
    rows.push(cells);
  }
  if (!header) return null;
  return { header, rows };
}

function parseWH(value, label, warnings) {
  const m = SIZE_RE.exec(String(value ?? "").trim());
  if (!m) {
    warnings.push(`${label}: resolution "${value}" is not WxH — value dropped`);
    return null;
  }
  return { w: Number(m[1]), h: Number(m[2]) };
}

function numCell(raw) {
  const t = String(raw ?? "").trim();
  if (DASH_VALUE_RE.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined; // undefined = unparseable
}

/** Last backtick span on a line, else the whole remainder. */
function backtickOrText(s) {
  if (!s) return null;
  const spans = [...s.matchAll(/`([^`]+)`/g)];
  if (spans.length) return spans[spans.length - 1][1].trim();
  return s.replace(/\*\*$/, "").trim() || null;
}

/** Variation field: `N/M of K` (images) or `N/M` (video). Returns {n, total} */
function parseVariation(value, label, warnings) {
  const m = /^\s*(\d+)\s*\/\s*(\d+)(?:\s+of\s+(\d+))?\s*$/.exec(value ?? "");
  if (!m) {
    warnings.push(`${label}: unparseable **Variation:** "${value}" — assuming v1`);
    return { n: 1, of: null, total: null };
  }
  const n = Number(m[1]);
  const of = Number(m[2]);
  const total = m[3] ? Number(m[3]) : of;
  if (n > total) warnings.push(`${label}: variation ${n} exceeds declared total ${total} — kept`);
  return { n, of, total };
}

// --- image entries ----------------------------------------------------------

function parseImageFile(text, category, fileStem, warnings) {
  const fileLabel = `${category}/${fileStem}.md`;
  const out = [];
  for (const sec of splitSections(text, fileLabel, warnings)) {
    const label = `${fileLabel} «${sec.slug}»`;
    const fence = extractFence(sec.body);
    if (!fence || !fence.text) {
      warnings.push(`${label}: no fenced text block (positive prompt) — entry skipped`);
      continue;
    }
    const skip = fence.consumed;

    // --- format decision PER ENTRY: labeled fence vs legacy fence ---------
    const labeled = isLabeledFence(fence.lines);
    const L = labeled ? parseLabeledFence(fence.lines, label, warnings) : null;
    const F = L ? L.fields : null;
    const overridden = new Set(); // entry+param pairs that replaced a table value
    const noteOverride = (param, tableVal, fenceVal) => {
      if (fenceVal === null || fenceVal === undefined) return;
      if (tableVal === null || tableVal === undefined) return;
      const differ = typeof tableVal === "object"
        ? `${tableVal.w}x${tableVal.h}` !== `${fenceVal.w}x${fenceVal.h}`
        : tableVal !== fenceVal;
      if (differ && !overridden.has(param)) {
        overridden.add(param);
        warnings.push(`${label}: fence ${param} overrides Settings column (${JSON.stringify(tableVal)} → ${JSON.stringify(fenceVal)})`);
      }
    };

    const modelsRaw = F?.get("MODELS") ?? F?.get("MODEL") ?? boldField(sec.body, "Models", skip);
    const names = splitModelNames(modelsRaw);
    const models = [];
    for (const nm of names) {
      const g = MODEL_NAME_TO_GROUP[nm.toLowerCase()];
      if (!g) warnings.push(`${label}: unknown model name "${nm}" — ignored for routing`);
      else if (!models.includes(g)) models.push(g);
    }
    if (!models.length) {
      warnings.push(`${label}: no routable **Models:**/MODELS line — entry skipped`);
      continue;
    }

    const variation = parseVariation(F?.get("VARIATION") ?? boldField(sec.body, "Variation", skip), label, warnings);

    const table = parseSettingsTable(sec.body);
    if (!table && !F) {
      warnings.push(`${label}: no **Settings:** table — entry skipped`);
      continue;
    }
    const columns = table ? table.header.slice(1) : []; // drop "param"
    const byParam = {};
    for (const cells of (table?.rows ?? [])) {
      const param = (cells[0] ?? "").trim();
      if (!param) continue;
      byParam[param] = cells.slice(1);
    }

    let negLine = boldField(sec.body, "Negative", skip);
    let negative = backtickOrText(negLine) ?? "";
    if (F?.has("NEGATIVE")) {
      const labeledNeg = F.get("NEGATIVE").replace(/^`|`$/g, "");
      if (negative && negative !== labeledNeg) {
        warnings.push(`${label}: labeled NEGATIVE supersedes **Negative:** bold line (differ) — bold line ignored`);
      }
      negative = labeledNeg;
      negLine = null; // qualifier moot: labeled value is authoritative
    }
    const notes = F?.get("NOTES") ?? boldField(sec.body, "Notes", skip) ?? null;
    const positive = F ? (F.get("POSITIVE") ?? "") : fence.text;
    if (!positive) {
      warnings.push(`${label}: labeled fence has no POSITIVE value — entry skipped`);
      continue;
    }

    const ov = F ? fenceOverrides(F, label, warnings) : { size: null, guidance: null, steps: null, seed: null };

    const fallbackSize = (table ? parseWH((byParam.resolution ?? [])[0], `${fileLabel} ${sec.slug} (fallback resolution)`, warnings) : null)
      ?? ov.size;

    const perModel = {};
    for (const g of models) {
      const spelling = Object.keys(MODEL_NAME_TO_GROUP).find((k) => MODEL_NAME_TO_GROUP[k] === g);
      const col = columns.findIndex((c) => c.toLowerCase() === String(spelling).toLowerCase());
      const defaults = README_DEFAULTS[g] ?? null;
      const cell = (p) => {
        const row = byParam[p];
        return col === -1 || !row ? undefined : row[col];
      };
      // Tier 2 (Settings-table column) — parsed first, bad cells warned.
      let size = null;
      let guidance = null;
      let steps = null;
      let seed = null;
      if (col !== -1) {
        if (cell("resolution") !== undefined) size = parseWH(cell("resolution"), `${label} resolution[${spelling}]`, warnings);
        const gRaw = numCell(cell("guidance"));
        const sRaw = numCell(cell("steps"));
        const seedRaw = numCell(cell("seed"));
        const bad = (name, v) => v === undefined && warnings.push(`${label}: settings ${name} for ${spelling} unparseable ("${cell(name)}") — ${defaults?.[name] ?? "README default"} applied`);
        bad("guidance", gRaw); bad("steps", sRaw); bad("seed", seedRaw);
        guidance = gRaw ?? null; steps = sRaw ?? null; seed = seedRaw ?? null;
      }
      size ??= fallbackSize;
      // Tier 1 (fence) — wins over the table; warn once per param when it
      // replaces a present value.
      if (ov.size) { noteOverride("SIZE", size, ov.size); size = ov.size; }
      if (ov.guidance !== null) { noteOverride("GUIDANCE", guidance, ov.guidance); guidance = ov.guidance; }
      if (ov.steps !== null) { noteOverride("STEPS", steps, ov.steps); steps = ov.steps; }
      if (ov.seed !== null) { noteOverride("SEED", seed, ov.seed); seed = ov.seed; }
      if (col === -1) {
        const hasFence = ov.size || ov.guidance !== null || ov.steps !== null || ov.seed !== null;
        if (!defaults && !hasFence) {
          warnings.push(`${label}: no Settings column for "${spelling}", no fence values and no README default — model params unavailable`);
          continue;
        }
        warnings.push(`${label}: Settings column for "${spelling}" missing — ${hasFence ? "fence + README defaults" : "README defaults"} guidance=${guidance ?? defaults?.guidance} steps=${steps ?? defaults?.steps} (resolution fallback ${size ? `${size.w}x${size.h}` : "none"})`);
      }
      // Tier 3 (README defaults) fills anything still missing.
      guidance = guidance ?? defaults?.guidance ?? null;
      steps = steps ?? defaults?.steps ?? null;
      perModel[g] = { size, guidance, steps, seed, defaulted: col === -1 };
    }
    if (!Object.keys(perModel).some((g) => models.includes(g))) {
      warnings.push(`${label}: no per-model settings survived — entry skipped`);
      continue;
    }

    out.push({
      kind: "image",
      category,
      fileStem,
      slug: sec.slug,
      variantNum: variation.n,
      id: `${sec.slug}-v${variation.n}`,
      title: sec.title,
      positive,
      negative,
      negativeScoped: labeled ? Boolean(negative) : /\(sd3\.5\/qwen only\)/i.test(negLine ?? ""),
      notes,
      models,
      modelsRaw: names,
      perModel,
      meta: L && L.extras.size ? Object.fromEntries(L.extras) : null,
      format: labeled ? "md-labeled" : "md-legacy",
      suggestedN: null, // shmup library carries no "generate N" hints
      aspect: null,
      style: null,
      background: null,
      source: "shmup-images",
    });
  }
  return out;
}

// --- video entries ----------------------------------------------------------

function parseVideoFile(text, category, fileStem, warnings) {
  const fileLabel = `${category}/${fileStem}.md`;
  const out = [];
  for (const sec of splitSections(text, fileLabel, warnings)) {
    const label = `${fileLabel} «${sec.slug}»`;
    const fence = extractFence(sec.body);
    if (!fence || !fence.text) {
      warnings.push(`${label}: no fenced text block — entry skipped`);
      continue;
    }
    const skip = fence.consumed;

    // --- format decision PER ENTRY: labeled fence vs legacy fence ---------
    const labeled = isLabeledFence(fence.lines);
    const L = labeled ? parseLabeledFence(fence.lines, label, warnings) : null;
    const F = L ? L.fields : null;

    const modelRaw = (F?.get("MODEL") ?? F?.get("MODELS") ?? boldField(sec.body, "Model", skip) ?? "").trim();
    const modelGroup = MODEL_NAME_TO_GROUP[modelRaw.toLowerCase()] ?? null;
    if (!modelGroup) {
      warnings.push(`${label}: **Model:**/"${modelRaw}" unknown — entry skipped`);
      continue;
    }
    let mode = (F?.get("MODE") ?? boldField(sec.body, "Mode", skip) ?? "t2v").trim().toLowerCase();
    if (F?.has("SOURCE_IMAGE") && mode === "t2v") {
      warnings.push(`${label}: fence SOURCE_IMAGE present with MODE t2v — mode promoted to i2v`);
      mode = "i2v";
    }
    if (mode !== "t2v" && mode !== "i2v") {
      warnings.push(`${label}: **Mode:** "${mode}" unexpected — assuming t2v`);
    }

    const variation = parseVariation(F?.get("VARIATION") ?? boldField(sec.body, "Variation", skip), label, warnings);

    const table = parseSettingsTable(sec.body);
    if (!table && !F) {
      warnings.push(`${label}: no **Settings:** table — entry skipped`);
      continue;
    }
    const byParam = {};
    for (const cells of (table?.rows ?? [])) {
      const param = (cells[0] ?? "").trim();
      if (param) byParam[param] = (cells[1] ?? "").trim();
    }
    const fired = new Set();
    const override = (paramName, tableVal, fenceVal) => {
      if (fenceVal === null || fenceVal === undefined) return fenceVal ?? tableVal;
      const differ = typeof tableVal === "object" && tableVal !== null
        ? `${tableVal.w}x${tableVal.h}` !== `${fenceVal.w}x${fenceVal.h}`
        : tableVal !== null && tableVal !== undefined && tableVal !== fenceVal;
      if (differ && !fired.has(paramName)) {
        fired.add(paramName);
        const show = (v) => v && typeof v === "object" ? `${v.w}x${v.h}` : JSON.stringify(v);
        warnings.push(`${label}: fence ${paramName} overrides Settings table (${show(tableVal)} → ${show(fenceVal)})`);
      }
      return fenceVal ?? tableVal;
    };

    const ov = F ? fenceOverrides(F, label, warnings) : { size: null, guidance: null, steps: null, seed: null };

    let size = parseWH(byParam.resolution, `${label} resolution`, table ? warnings : []);
    size = override("SIZE", size, ov.size);
    if (!size) {
      warnings.push(`${label}: unusable resolution — entry skipped`);
      continue;
    }
    const numFramesRaw = numCell(F?.get("NUM_FRAMES") ?? byParam.num_frames);
    const fpsRaw = numCell(F?.get("FPS") ?? byParam.fps);
    if (F?.has("NUM_FRAMES") && numFramesRaw === undefined) {
      warnings.push(`${label}: fence NUM_FRAMES "${F.get("NUM_FRAMES")}" unparseable — table value applies`);
    }
    if (F?.has("FPS") && fpsRaw === undefined) {
      warnings.push(`${label}: fence FPS "${F.get("FPS")}" unparseable — table value applies`);
    }
    const tableNumFrames = Number.isInteger(numCell(byParam.num_frames)) ? numCell(byParam.num_frames) : null;
    const tableFps = Number.isFinite(numCell(byParam.fps)) ? numCell(byParam.fps) : null;
    if (F?.has("NUM_FRAMES")) override("NUM_FRAMES", tableNumFrames, Number.isInteger(numFramesRaw) ? numFramesRaw : null);
    if (F?.has("FPS")) override("FPS", tableFps, Number.isFinite(fpsRaw) ? fpsRaw : null);
    const numFrames = F?.has("NUM_FRAMES") && Number.isInteger(numFramesRaw) ? numFramesRaw : tableNumFrames;
    const fps = F?.has("FPS") && Number.isFinite(fpsRaw) ? fpsRaw : tableFps;
    if (numFrames === null) warnings.push(`${label}: num_frames unusable — --video-seconds override required`);
    const step = GROUPS[modelGroup].frameStep;
    if (numFrames !== null && (numFrames - 1) % step !== 0) {
      warnings.push(`${label}: num_frames ${numFrames} violates ${step}n+1 law for ${modelRaw} — kept verbatim, server may resample`);
    }
    let guidance = numCell(byParam.guidance) ?? null;
    let steps = numCell(byParam.steps) ?? null;
    let seed = numCell(byParam.seed) ?? null;
    guidance = override("GUIDANCE", guidance, ov.guidance);
    steps = override("STEPS", steps, ov.steps);
    seed = override("SEED", seed, ov.seed);
    const durationNote = F?.get("DURATION") ?? byParam.duration ?? null;

    let negLine = boldField(sec.body, "Negative", skip);
    let negative = backtickOrText(negLine) ?? "";
    if (F?.has("NEGATIVE")) {
      const labeledNeg = F.get("NEGATIVE").replace(/^`|`$/g, "");
      if (negative && negative !== labeledNeg) {
        warnings.push(`${label}: labeled NEGATIVE supersedes **Negative:** bold line (differ) — bold line ignored`);
      }
      negative = labeledNeg;
      negLine = null;
    }
    const notes = F?.get("NOTES") ?? boldField(sec.body, "Notes", skip) ?? null;
    const positive = F ? (F.get("POSITIVE") ?? "") : fence.text;
    if (!positive) {
      warnings.push(`${label}: labeled fence has no POSITIVE value — entry skipped`);
      continue;
    }

    // **Source image:** `…png` (glob `…`)  — bold line OR fence SOURCE_IMAGE
    let sourceImage = null;
    if (mode === "i2v") {
      if (F?.has("SOURCE_IMAGE")) {
        sourceImage = parseSourceImageValue(F.get("SOURCE_IMAGE"));
      } else {
        const srcLine = boldField(sec.body, "Source image", skip);
        if (!srcLine) {
          warnings.push(`${label}: Mode i2v without source image (bold line or SOURCE_IMAGE) — will never resolve a still`);
        } else {
          const spans = [...srcLine.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
          sourceImage = { declared: spans[0] ?? null, glob: spans[1] ?? null };
        }
      }
    }

    out.push({
      kind: "video",
      category,
      fileStem,
      slug: sec.slug,
      variantNum: variation.n,
      id: `${sec.slug}-v${variation.n}`,
      title: sec.title,
      positive,
      negative,
      notes,
      modelGroup,
      modelRaw,
      videoMode: mode,
      size,
      numFrames,
      fps,
      durationNote,
      guidance,
      steps,
      seed,
      sourceImage,
      meta: L && L.extras.size ? Object.fromEntries(L.extras) : null,
      format: labeled ? "md-labeled" : "md-legacy",
      suggestedN: null,
      aspect: null,
      style: null,
      background: null,
      source: "shmup-video",
    });
  }
  return out;
}

// --- JSON sidecars (owner conversion format v4) ------------------------------

const JSON_ENTRY_KEYS_IMAGE = new Set(["id", "slug", "title", "variation", "models", "positive", "negative", "settings", "notes"]);
const JSON_ENTRY_KEYS_VIDEO = new Set(["id", "slug", "title", "variation", "model", "modelGroup", "mode", "positive", "negative", "settings", "sourceImage", "notes"]);

function jsonMetaExtras(entry, known) {
  const extras = Object.fromEntries(Object.entries(entry).filter(([k]) => !known.has(k)));
  return Object.keys(extras).length ? extras : null;
}

function numOr(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = numCell(value);
    if (n !== undefined && n !== null) return n;
  }
  return null;
}

function variationFromJson(e, label, warnings) {
  const n = Number.isInteger(e.variation?.n) && e.variation.n > 0 ? e.variation.n : 1;
  if (!Number.isInteger(e.variation?.n)) warnings.push(`${label}: variation.n missing/not integer — assuming v${n}`);
  return n;
}

/** Image entries from a shmup-art-prompt-library@1 sidecar. */
function blocksFromImageJson(doc, category, fileStem, warnings) {
  const out = [];
  for (const e of doc.entries ?? []) {
    const label = `${category}/${fileStem}.json «${e.slug ?? "?"}»`;
    const positive = typeof e.positive === "string" ? e.positive.replace(/\s+/g, " ").trim() : "";
    if (!positive) {
      warnings.push(`${label}: entry without positive prompt — skipped`);
      continue;
    }
    const names = (Array.isArray(e.models) ? e.models : typeof e.model === "string" ? [e.model] : []).map(String);
    const models = [];
    for (const nm of names) {
      const g = MODEL_NAME_TO_GROUP[nm.trim().toLowerCase()];
      if (!g) warnings.push(`${label}: unknown model name "${nm}" — ignored for routing`);
      else if (!models.includes(g)) models.push(g);
    }
    if (!models.length) {
      warnings.push(`${label}: no routable models — entry skipped`);
      continue;
    }
    const settings = e.settings && typeof e.settings === "object" ? e.settings : {};
    const firstSize = Object.values(settings)
      .map((s) => (s && typeof s === "object" ? parseWH(s.resolution, `${label} settings resolution`, []) : null))
      .find((s) => s) ?? null;
    const perModel = {};
    for (const g of models) {
      const spelling = Object.keys(MODEL_NAME_TO_GROUP).find((k) => MODEL_NAME_TO_GROUP[k] === g);
      const s = settings[spelling] ?? null;
      const defaults = README_DEFAULTS[g] ?? null;
      if (!s) {
        warnings.push(`${label}: JSON settings missing for "${spelling}" — README defaults guidance=${defaults?.guidance ?? "none"} steps=${defaults?.steps ?? "none"}`);
        if (!defaults && !firstSize) continue;
        perModel[g] = { size: firstSize, guidance: defaults?.guidance ?? null, steps: defaults?.steps ?? null, seed: null, defaulted: true };
        continue;
      }
      const size = parseWH(s.resolution, `${label} resolution[${spelling}]`, warnings) ?? firstSize;
      perModel[g] = {
        size,
        guidance: numOr(s.guidance) ?? defaults?.guidance ?? null,
        steps: numOr(s.steps) ?? defaults?.steps ?? null,
        seed: numOr(s.seed),
        defaulted: false,
      };
    }
    if (!Object.keys(perModel).length) {
      warnings.push(`${label}: no per-model settings survived — entry skipped`);
      continue;
    }
    const n = variationFromJson(e, label, warnings);
    const negative = typeof e.negative === "string" ? e.negative.replace(/\s+/g, " ").trim() : "";
    out.push({
      kind: "image",
      category,
      fileStem,
      slug: String(e.slug ?? path.basename(String(e.id ?? "entry"), ".json")),
      variantNum: n,
      id: e.id ?? `${e.slug}-v${n}`,
      title: e.title ?? "",
      positive,
      negative,
      negativeScoped: Boolean(negative), // sidecar negatives follow the sd3.5/qwen-only law
      notes: e.notes ?? null,
      models,
      modelsRaw: names,
      perModel,
      meta: jsonMetaExtras(e, JSON_ENTRY_KEYS_IMAGE),
      format: "json",
      suggestedN: null,
      aspect: null,
      style: null,
      background: null,
      source: "shmup-images-json",
    });
  }
  return out;
}

/** Video entries from a shmup-art-prompt-library@1 sidecar. */
function blocksFromVideoJson(doc, category, fileStem, warnings) {
  const out = [];
  for (const e of doc.entries ?? []) {
    const label = `${category}/${fileStem}.json «${e.slug ?? "?"}»`;
    const positive = typeof e.positive === "string" ? e.positive.replace(/\s+/g, " ").trim() : "";
    if (!positive) {
      warnings.push(`${label}: entry without positive prompt — skipped`);
      continue;
    }
    const modelRaw = String(e.model ?? "").trim();
    const mapped = MODEL_NAME_TO_GROUP[modelRaw.toLowerCase()] ?? null;
    if (!mapped) {
      warnings.push(`${label}: model "${modelRaw}" unknown — entry skipped`);
      continue;
    }
    if (e.modelGroup && e.modelGroup !== mapped) {
      warnings.push(`${label}: JSON modelGroup "${e.modelGroup}" disagrees with model mapping "${mapped}" — mapping wins`);
    }
    const modelGroup = mapped;
    let mode = String(e.mode ?? "t2v").trim().toLowerCase();
    if (e.sourceImage && mode === "t2v") {
      warnings.push(`${label}: sourceImage present with mode t2v — mode promoted to i2v`);
      mode = "i2v";
    }
    if (mode !== "t2v" && mode !== "i2v") {
      warnings.push(`${label}: mode "${mode}" unexpected — assuming t2v`);
    }
    const s = e.settings && typeof e.settings === "object" ? e.settings : {};
    const size = parseWH(s.resolution, `${label} resolution`, warnings);
    if (!size) {
      warnings.push(`${label}: unusable resolution — entry skipped`);
      continue;
    }
    const numFrames = Number.isInteger(numOr(s.num_frames)) ? numOr(s.num_frames) : null;
    const fps = Number.isFinite(numOr(s.fps)) ? numOr(s.fps) : null;
    if (numFrames === null) warnings.push(`${label}: num_frames unusable — --video-seconds override required`);
    const step = GROUPS[modelGroup].frameStep;
    if (numFrames !== null && (numFrames - 1) % step !== 0) {
      warnings.push(`${label}: num_frames ${numFrames} violates ${step}n+1 law for ${modelRaw} — kept verbatim, server may resample`);
    }
    let sourceImage = null;
    if (mode === "i2v") {
      if (e.sourceImage && typeof e.sourceImage === "object") {
        sourceImage = { declared: e.sourceImage.declared ?? null, glob: e.sourceImage.glob ?? null };
      } else if (typeof e.sourceImage === "string") {
        sourceImage = parseSourceImageValue(e.sourceImage);
      }
      if (!sourceImage) warnings.push(`${label}: mode i2v without sourceImage — will never resolve a still`);
    }
    const n = variationFromJson(e, label, warnings);
    out.push({
      kind: "video",
      category,
      fileStem,
      slug: String(e.slug ?? String(e.id ?? "entry").replace(/-v\d+$/, "")),
      variantNum: n,
      id: e.id ?? `${e.slug}-v${n}`,
      title: e.title ?? "",
      positive,
      negative: typeof e.negative === "string" ? e.negative.replace(/\s+/g, " ").trim() : "",
      notes: e.notes ?? null,
      modelGroup,
      modelRaw,
      videoMode: mode,
      size,
      numFrames,
      fps,
      durationNote: typeof s.duration === "string" ? s.duration : null,
      guidance: numOr(s.guidance),
      steps: numOr(s.steps),
      seed: numOr(s.seed),
      sourceImage,
      meta: jsonMetaExtras(e, JSON_ENTRY_KEYS_VIDEO),
      format: "json",
      suggestedN: null,
      aspect: null,
      style: null,
      background: null,
      source: "shmup-video-json",
    });
  }
  return out;
}

/** Load the whole shmup library: images/<dir>/*.md + video/<dir>/*.md. */
async function loadShmupLibrary(rootDir) {
  const warnings = [];
  const blocks = [];
  let filesParsed = 0;
  const sources = { json: 0, mdLabeled: 0, mdLegacy: 0 };

  for (const root of ["images", "video"]) {
    const rootDirAbs = path.join(rootDir, root);
    let subDirs = [];
    try {
      subDirs = (await fs.readdir(rootDirAbs, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name)
        .sort();
    } catch {
      warnings.push(`${root}/ directory missing under ${rootDir} — skipped`);
      continue;
    }
    for (const sub of subDirs) {
      const dirAbs = path.join(rootDirAbs, sub);
      const entries = (await fs.readdir(dirAbs, { withFileTypes: true }))
        .filter((f) => f.isFile() && f.name.endsWith(".md") && !SKIP_FILE_RE.test(f.name))
        .map((f) => f.name)
        .sort();
      for (const name of entries) {
        const fileStem = name.replace(/\.md$/, "");
        const category = `${root}/${sub}`;
        const mdPath = path.join(dirAbs, name);
        let text;
        try {
          text = await fs.readFile(mdPath, "utf8");
        } catch (err) {
          warnings.push(`${category}/${name}: unreadable (${err.message}) — skipped`);
          continue;
        }
        filesParsed++;

        // 1) JSON sidecar wins when present + schema-valid + parseable.
        let fromJson = null;
        try {
          const rawJson = await fs.readFile(path.join(dirAbs, `${fileStem}.json`), "utf8");
          const doc = JSON.parse(rawJson);
          if (doc?.schema !== LIBRARY_JSON_SCHEMA) {
            warnings.push(`${category}/${fileStem}.json: schema "${doc?.schema ?? "?"}" ≠ ${LIBRARY_JSON_SCHEMA} — sidecar ignored, .md parsed`);
          } else if (doc?.kind !== (root === "images" ? "image" : "video")) {
            warnings.push(`${category}/${fileStem}.json: kind "${doc?.kind}" ≠ ${root} — sidecar ignored, .md parsed`);
          } else {
            fromJson = (root === "images" ? blocksFromImageJson : blocksFromVideoJson)(doc, category, fileStem, warnings);
            const [stMd, stJson] = await Promise.all([fs.stat(mdPath), fs.stat(path.join(dirAbs, `${fileStem}.json`))]);
            if (stMd.mtimeMs > stJson.mtimeMs + 2000) {
              warnings.push(`${category}/${name}: .md is newer than its .json sidecar (converter not re-run?) — sidecar wins; delete it to parse the .md`);
            }
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            warnings.push(`${category}/${fileStem}.json: unparseable JSON (${err.message}) — possibly mid-write, falling back to .md`);
          }
        }

        // 2) .md fallback (labeled-fence-aware per entry).
        let parsed;
        if (fromJson) {
          parsed = fromJson;
          sources.json += parsed.length;
        } else {
          parsed = root === "images"
            ? parseImageFile(text, category, fileStem, warnings)
            : parseVideoFile(text, category, fileStem, warnings);
          for (const b of parsed) sources[b.format === "md-labeled" ? "mdLabeled" : "mdLegacy"]++;
        }
        if (!parsed.length) warnings.push(`${category}/${name}: no entries parsed`);
        blocks.push(...parsed);
      }
    }
  }

  // duplicate ids across files are legal but worth a census note per file;
  // ids repeat WITHIN a file only across different variations — verify.
  const seen = new Map();
  for (const b of blocks) {
    const key = `${b.category}/${b.id}`;
    if (seen.has(key)) warnings.push(`duplicate id ${key} (files ${seen.get(key)} + ${b.fileStem})`);
    else seen.set(key, b.fileStem);
  }
  return { blocks, warnings, filesParsed, sources };
}

// ---------------------------------------------------------------------------
// Size + frame math
// ---------------------------------------------------------------------------

/** Floor to multiple of 16, minimum 256. */
function snap16(n) {
  return Math.max(256, Math.floor(n / 16) * 16);
}

function snapDiv(n, d, min = 256) {
  return Math.max(min, Math.floor(n / d) * d);
}

/** Images: 16-snap + optional pixel ceiling (values are usually already legal). */
function resolveImageSize(block, group, opts) {
  const original = { ...block.size };
  const maxPixels = opts.maxPixels ?? group.maxPixels;
  let w = Math.floor(original.w / 16) * 16;
  let h = Math.floor(original.h / 16) * 16;
  let method = "snap16";
  if (w * h > maxPixels) {
    const scale = Math.sqrt(maxPixels / (w * h));
    w = Math.floor((w * scale) / 16) * 16;
    h = Math.floor((h * scale) / 16) * 16;
    method = "max-pixels-scale";
  }
  return { sent: { w: Math.max(256, w), h: Math.max(256, h) }, original, method };
}

// ---------------------------------------------------------------------------
// Wan2.2 trained-size buckets (feature 2026-10-08)
//
// Wan2.2 is trained on exactly four resolutions — the server logs
// "Unsupported resolution: 1216x704 ... Supported: 1280x720, 720x1280,
// 832x480, 480x832" for anything else. We snap the (already ÷16-validated)
// wan22 size to the nearest trained bucket so every payload is
// bucket-native. LTX paths are NOT touched — that server honors its ÷32
// sizes fine.
//
// Deterministic nearest-neighbor rule:
//   1. Orientation first: W/H >= 1.0 → landscape pair {1280x720, 832x480};
//      < 1.0 → portrait {720x1280, 480x832}. Square (ratio exactly 1.0)
//      takes the landscape side.
//   2. Within the pair, pick by log-aspect distance |ln(req) − ln(bucket)|.
//   3. If the two distances are within WAN_SNAP_TIE_EPS of each other,
//      pixel AREA decides (smaller |ln(area_req/area_bucket)| wins). The
//      epsilon is deliberate: it pulls near-16:9 off-bucket sizes (e.g.
//      1216x704 in the sibling hosting library — 99 of its 120 wan
//      entries; aspect 1.727, only 0.025 log-aspect from BOTH landscape
//      buckets) to HD 1280x720 instead of the aspect-marginally-closer
//      832x480, and lands square 1024x1024 on 1280x720 (area 0.129 vs
//      0.964) while 512x512 falls to 832x480 (0.420 vs 1.253) — the same
//      determinism both repos pin in tests. Exact ties resolve to the HD
//      bucket (pair order).
// Opt out entirely with --no-wan-snap (verbatim pass-through restored).
// ---------------------------------------------------------------------------
const WAN_BUCKETS = Object.freeze([
  { label: "1280x720", w: 1280, h: 720 },
  { label: "720x1280", w: 720, h: 1280 },
  { label: "832x480", w: 832, h: 480 },
  { label: "480x832", w: 480, h: 832 },
]);
const WAN_SNAP_TIE_EPS = 0.05;

/** Nearest trained wan bucket for a size. Pure; returns a WAN_BUCKETS entry. */
function snapToWanBucket(w, h) {
  const landscape = w / h >= 1;
  const pair = landscape ? [WAN_BUCKETS[0], WAN_BUCKETS[2]] : [WAN_BUCKETS[1], WAN_BUCKETS[3]];
  const lnReq = Math.log(w / h);
  const dAspect = pair.map((b) => Math.abs(lnReq - Math.log(b.w / b.h)));
  if (Math.abs(dAspect[0] - dAspect[1]) >= WAN_SNAP_TIE_EPS) {
    return dAspect[0] <= dAspect[1] ? pair[0] : pair[1];
  }
  const lnArea = Math.log(w * h);
  const dArea = pair.map((b) => Math.abs(lnArea - Math.log(b.w * b.h)));
  return dArea[0] <= dArea[1] ? pair[0] : pair[1];
}

/**
 * Videos: table resolution verbatim; validated against the MODEL FAMILY grid
 * (Wan ÷16, LTX ÷32) — warn + snap once on violation. (Owner brief said ÷32
 * flat; corrected 2026-10-07: the library ships 39 legal Wan entries at
 * 1280x720 where 720 % 32 = 16 — blind ÷32 would degrade them all to 704.)
 * wan22 tasks then snap to the four TRAINED buckets (see WAN_BUCKETS above)
 * unless --no-wan-snap. Returns {sent, original, method, size_snapped?}.
 */
function resolveVideoSize(block, group, opts, warnings) {
  const original = { ...block.size };
  let w = original.w;
  let h = original.h;
  let method = "table-verbatim";
  const d = group.divisor ?? 16;
  if (w % d !== 0 || h % d !== 0) {
    w = snapDiv(w, d);
    h = snapDiv(h, d);
    method = `snap${d}`;
    warnings.push(`${block.category}/${block.id}: resolution ${original.w}x${original.h} not ÷${d} for ${block.modelRaw} — snapped to ${w}x${h}`);
  }
  const maxPixels = opts.maxPixels; // only an EXPLICIT flag trims video tables
  if (maxPixels && w * h > maxPixels) {
    const scale = Math.sqrt(maxPixels / (w * h));
    w = snapDiv(w * scale, d);
    h = snapDiv(h * scale, d);
    method = "max-pixels-scale";
  }
  // Wan2.2 bucket snap — applied AFTER the ÷16 validation of the REQUESTED
  // size; on the rare --max-pixels + wan22 combo the bucket wins and the
  // scale method is superseded (never co-occurs in the real library).
  if (group.key === "wan22" && !opts.noWanSnap) {
    const b = snapToWanBucket(w, h);
    if (b.w !== w || b.h !== h) {
      return { sent: { w: b.w, h: b.h }, original, method: `wan-bucket-snap(${b.label})`, size_snapped: true };
    }
  }
  return { sent: { w, h }, original, method };
}

/** Snap a target frame count to the family law (8n+1 ltx / 4n+1 wan). */
function snapFrames(target, step) {
  const k = Math.max(1, Math.round((target - 1) / step));
  return k * step + 1;
}

// ---------------------------------------------------------------------------
// i2v source-still resolution
// ---------------------------------------------------------------------------

/**
 * Search prefix for the still: the Source-line glob's basename minus "*",
 * else the declared basename minus extension and trailing "-v…-<model>",
 * else the video slug itself. (The still's slug is NOT the video entry's
 * slug — e.g. video «logo-sting-ignite-v1» draws from still «logo-sting-v1».
 * Also, Source-line directories ("10-title/", "70-ambient/") do NOT match the
 * real image categories ("10-logo-title/", …), so we search the WHOLE images
 * tree by prefix rather than trusting the stated dir.)
 */
function stillPrefix(block) {
  const globBase = (block.sourceImage?.glob ?? "").split("/").pop() ?? "";
  const fromGlob = globBase.replace(/\*+$/, "").replace(/-$/, "");
  if (fromGlob) return fromGlob;
  const declaredBase = path.basename(block.sourceImage?.declared ?? "");
  const fromDeclared = declaredBase.replace(/\.(png|jpe?g|webp)$/i, "").replace(/-v\d+.*$/, "");
  if (fromDeclared) return fromDeclared;
  return block.slug;
}

/**
 * Find the newest generated still for an i2v entry.
 * Order: exact declared path under each image-group dir (fast path), then a
 * recursive <prefix>*.png walk of <out>/<image-group>/images — any category,
 * any variation, any model suffix; NEWEST mtime wins.
 */
async function resolveSourceStill(block, outRoot) {
  if (block.videoMode !== "i2v") return null;
  const candidates = [];
  const rel = (block.sourceImage?.declared ?? "").replace(/^art-prompts\//, "").replace(/^\.\//, "");
  const prefix = stillPrefix(block);

  for (const g of IMAGE_GROUPS) {
    if (rel) candidates.push(path.join(outRoot, g, rel));
    candidates.push(...(await walkMatching(path.join(outRoot, g, "images"), prefix, 3)));
  }

  let best = null;
  for (const f of dedupe(candidates)) {
    try {
      const st = await fs.stat(f);
      if (!st.isFile()) continue;
      if (!best || st.mtimeMs > best.mtimeMs) best = { file: f, mtimeMs: st.mtimeMs };
    } catch { /* miss is expected until images run */ }
  }
  return best?.file ?? null;
}

async function walkMatching(dir, prefix, depth) {
  let names;
  try {
    names = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const hits = [];
  for (const ent of names) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (depth > 1) hits.push(...(await walkMatching(full, prefix, depth - 1)));
    } else if (ent.isFile() && ent.name.startsWith(prefix) && /\.(png|jpe?g|webp)$/i.test(ent.name)) {
      hits.push(full);
    }
  }
  return hits;
}

function dedupe(list) {
  return [...new Set(list)];
}

/** Payload placeholder token: replaced with a real data URI only at send. */
const I2V_TOKEN = "@@I2V_DATA_URI@@";

function referencePreview(file) {
  return `${I2V_TOKEN}${path.relative(process.cwd(), file)}`;
}

async function materializeReference(payload) {
  const ref = payload.reference_url;
  if (typeof ref !== "string" || !ref.startsWith(I2V_TOKEN)) return payload;
  const file = ref.slice(I2V_TOKEN.length);
  const bytes = await fs.readFile(file);
  return { ...payload, reference_url: `data:image/png;base64,${bytes.toString("base64")}` };
}

function payloadForDisplay(payload) {
  const ref = payload.reference_url;
  if (typeof ref !== "string" || !ref.startsWith(I2V_TOKEN)) return payload;
  return { ...payload, reference_url: `${ref.slice(0, 0)}data:image/png;base64,<${path.relative(process.cwd(), ref.slice(I2V_TOKEN.length))} — encoded at send time>` };
}

// ---------------------------------------------------------------------------
// Payload construction
// ---------------------------------------------------------------------------

/** Fold the negative list into the prompt for models with no negative field. */
function appendNegative(prompt, negative) {
  const bans = negative.replace(/\s*,\s*/g, ", ").trim().replace(/[,.\s]+$/, "");
  if (!bans) return prompt;
  return `${prompt}\n\navoid: ${bans}`;
}

function resolveNegative(block, group, opts) {
  if (!block.negative) return { prompt: block.positive, negative: null };
  if (opts.negativeMode === "append") {
    return { prompt: appendNegative(block.positive, block.negative), negative: null };
  }
  // shmup law: image negatives are sd3.5/qwen-only qualified; video
  // negatives are ALWAYS sent (both models honor them).
  const honored = group.kind === "video" ? true : group.supportsNegative;
  if (opts.negativeMode === "field" && honored) {
    return { prompt: block.positive, negative: block.negative };
  }
  return { prompt: block.positive, negative: null };
}

/**
 * LTX-Video text-encoder budget (feature 2026-10-08). The LTX-Video server
 * caps prompt tokens at 128 ("max seq length 128" errors on long prompts);
 * the diffusers pipeline honors `max_sequence_length` via diffusers_kwargs.
 * SCOPE GATE: ONLY the ltxvideo group (exact model Lightricks/LTX-Video) —
 * NEVER wan22. --ltx-max-seq 0 omits diffusers_kwargs entirely (pre-change
 * wire shape). Merge-not-clobber is defensive: as of 2026-10-08 NO code
 * path sets diffusers_kwargs anywhere (grep-verified zero), so the spread
 * only future-proofs the shape.
 */
function attachLtxKwargs(payload, group, opts) {
  if (group.kind === "video" && group.key === "ltxvideo" && opts.ltxMaxSeq > 0) {
    payload.diffusers_kwargs = { ...(payload.diffusers_kwargs ?? {}), max_sequence_length: opts.ltxMaxSeq };
  }
  return payload;
}

/**
 * Build the wire payload for one task. Pure: block + params + group + opts.
 * `params` = per-model/override-resolved {size, guidance, steps, seedBase}.
 */
function buildPayload(block, group, params, opts) {
  const { prompt, negative } = resolveNegative(block, group, opts);
  const sizeStr = `${params.size.w}x${params.size.h}`;
  const perSeed = [];
  for (let i = 0; i < params.n; i++) perSeed.push(params.seedBase === null ? null : params.seedBase + i);

  if (group.kind === "image") {
    const payload = {
      model: group.model,
      prompt,
      size: sizeStr,
      n: params.n,
      response_format: "b64_json",
    };
    if (negative !== null) payload.negative_prompt = negative;
    if (perSeed.every((s) => s !== null)) payload.seed = params.n === 1 ? perSeed[0] : perSeed;
    const guidance = opts.guidance ?? params.guidance;
    const steps = opts.steps ?? params.steps;
    if (guidance !== null && guidance !== undefined) payload.guidance_scale = guidance;
    if (steps !== null && steps !== undefined) payload.num_inference_steps = steps;
    return { path: "/v1/images/generations", payload, perSeed };
  }

  // video: one job shape (caller splits n); no response_format — bytes come
  // from GET /v1/videos/{id}/content. num_frames + fps ship from the table.
  const payload = {
    model: group.model,
    prompt,
    size: sizeStr,
    num_frames: params.numFrames,
    fps: params.fps,
  };
  if (perSeed[0] !== null) payload.seed = perSeed[0]; // jobs 1..n use seed+i
  if (negative !== null) payload.negative_prompt = negative;
  const guidance = opts.guidance ?? params.guidance;
  const steps = opts.steps ?? params.steps;
  if (guidance !== null && guidance !== undefined) payload.guidance_scale = guidance;
  if (steps !== null && steps !== undefined) payload.num_inference_steps = steps;
  if (params.referenceFile) payload.reference_url = referencePreview(params.referenceFile); // i2v (video_api.py:707-721)
  return { path: "/v1/videos", payload: attachLtxKwargs(payload, group, opts), perSeed };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: node generate.mjs [options]

  --model <group>       ${Object.keys(GROUPS).join("|")} (alias qwen=qwenvl). default flux1
                         only entries whose Models/Model line names the group
                         are queued (routing law) — use --all to force every
                         entry of the group's kind
  --all                 ignore the Models/Model routing line (same kind only)
  --i2v-strict          error BEFORE sending anything if an i2v entry cannot
                         resolve its source still (default: skip per-task)
  --list                parse images/ + video/, print counts incl. i2v
                         resolvable tally, exit
  --dry-run             print payload + equivalent curl per task, write nothing
  --filter k=v          repeatable; k in {category,dir,file,id,model};
                         v comma-list (dir= matches the NN-dir segment, e.g.
                         30-bosses; category= matches images/30-bosses;
                         model= matches a group key like flux1 or wan22)
  --out <dir>           output dir (default ./output next to this script)
  --parallel <n>        concurrent requests (default 2)
  --n <n>               outputs per entry (default 1)
  --auto-n              accepted for parity; shmup tables carry no "generate
                         N" hints, so this is a documented no-op
  --seed <n>            base seed (overrides the table seed column)
  --steps <n>           num_inference_steps (overrides the table)
  --guidance <f>        guidance_scale (overrides the table)
  --negative-mode <m>   field (default) | append | drop
                         field: images sd35/qwenvl only (library law);
                         videos ALWAYS (both models honor negatives)
  --no-wan-snap         wan22: send the table resolution VERBATIM (default:
                         snap to the nearest of the four trained Wan2.2
                         buckets 1280x720/720x1280/832x480/480x832)
  --ltx-max-seq <N>     ltxvideo group only: diffusers_kwargs
                         max_sequence_length sent to the text encoder
                         (default 256; 0 = omit diffusers_kwargs entirely —
                         pre-fix wire shape). Never applied to wan22.
  --base-url <url>      full endpoint override; wins over --port and the
                         default http://${HOST}:${DEFAULT_PORT}
  --port <n>            use http://${HOST}:<n> on the default host
                         (reference launcher ports: 30000-30006)
  --served-model <id>   payload model id, independent of --model group;
                         always beats single-model auto-adopt
                         (alias --model-id; skips the /v1/models probe)
  --api-key <k>         Bearer token (or env SKYNET_API_KEY)
  --timeout <ms>        per-task wall clock incl. retries/polling (default 600000)
   --retries <n>         retries on 5xx/429/network (default 4, exp backoff)
  --max-pixels <n>      explicit ceiling; image groups also carry a 2MP
                         default safety ceiling (table sizes pass untouched)
  --video-seconds <s>   override duration; re-derives + re-snaps num_frames
                         to the family law (wan 4n+1 / ltx 8n+1)
  --video-fps <n>       override the table fps (re-snaps frames likewise)
  --force               regenerate even if output files exist
  --prompts-dir <dir>   prompt library root (default: this script's directory)
  --repair              maintenance pass over --out tree (no network): relabel
                        files whose extension contradicts magic bytes, pair
                        sidecars, plan manifest updates. DRY BY DEFAULT.
  --apply               with --repair: perform renames/deletes/rewrites
  --help                show this help`;

function fail(message) {
  console.error(`error: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    model: "flux1", list: false, dryRun: false, filters: [], out: null,
    parallel: 2, n: 1, autoN: false, seed: null, steps: null, guidance: null,
    negativeMode: "field", baseUrl: null, port: null, modelId: null,
    all: false, i2vStrict: false,
    apiKey: process.env.SKYNET_API_KEY ?? null, timeout: 2400_000, retries: 4,
    maxPixels: null, videoSeconds: null, videoFps: null, force: false,
    noWanSnap: false, ltxMaxSeq: 256,
    repair: false, apply: false,
    promptsDir: SCRIPT_DIR, help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) fail(`unexpected positional argument "${arg}"`);
    const name = arg.slice(2);
    const takesValue = !["list", "dry-run", "auto-n", "force", "help", "all", "i2v-strict", "no-wan-snap", "repair", "apply"].includes(name);

    let value = null;
    if (takesValue) {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith("--") && !/^-?\d/.test(next))) {
        fail(`--${name} requires a value`);
      }
      value = next;
      i++;
    }

    switch (name) {
      case "list": opts.list = true; break;
      case "dry-run": opts.dryRun = true; break;
      case "auto-n": opts.autoN = true; break;
      case "force": opts.force = true; break;
      case "no-wan-snap": opts.noWanSnap = true; break;
      case "ltx-max-seq": {
        const v = Number(value);
        if (!Number.isInteger(v) || v < 0) fail(`--ltx-max-seq needs an integer >= 0 (got "${value}")`);
        opts.ltxMaxSeq = v;
        break;
      }
      case "repair": opts.repair = true; break;
      case "apply": opts.apply = true; break;
      case "help": opts.help = true; break;
      case "all": opts.all = true; break;
      case "i2v-strict": opts.i2vStrict = true; break;
      case "filter": {
        const m = /^(category|dir|file|id|model)=(.*)$/.exec(value);
        if (!m) fail(`--filter expects category=…, dir=…, file=…, id=… or model=… (got "${value}")`);
        opts.filters.push({ key: m[1], values: m[2].split(",").map((s) => s.trim()).filter(Boolean) });
        break;
      }
      case "negative-mode":
        if (!["field", "append", "drop"].includes(value)) fail(`--negative-mode must be field|append|drop (got "${value}")`);
        opts.negativeMode = value;
        break;
      case "model": {
        const g = GROUP_ALIASES[value] ?? value;
        if (!GROUPS[g]) fail(`unknown --model "${value}" (known: ${Object.keys(GROUPS).join(", ")}, qwen)`);
        opts.model = g;
        break;
      }
      default: {
        switch (name) {
          case "parallel": opts.parallel = assertInt(name, value); break;
          case "n": opts.n = assertInt(name, value); break;
          case "seed": opts.seed = assertInt(name, value); break;
          case "steps": opts.steps = assertInt(name, value); break;
          case "guidance": opts.guidance = assertNumeric(name, value); break;
          case "port": opts.port = assertInt(name, value); break;
          case "timeout": opts.timeout = assertInt(name, value); break;
          case "retries": opts.retries = assertInt(name, value); break;
          case "max-pixels": opts.maxPixels = assertInt(name, value); break;
          case "video-seconds": opts.videoSeconds = assertNumeric(name, value); break;
          case "video-fps": opts.videoFps = assertNumeric(name, value); break;
          case "out": opts.out = value; break;
          case "base-url": {
            try { new URL(value); } catch { fail(`--base-url is not a valid URL: "${value}"`); }
            opts.baseUrl = value.replace(/\/+$/, "");
            break;
          }
          case "model-id":
          case "served-model": opts.modelId = value; break;
          case "api-key": opts.apiKey = value; break;
          case "prompts-dir": opts.promptsDir = path.resolve(value); break;
          default: fail(`unknown flag --${name}`);
        }
      }
    }
  }

  if (opts.parallel < 1) fail("--parallel must be >= 1");
  if (opts.n < 1) fail("--n must be >= 1");
  if (opts.retries < 0) fail("--retries must be >= 0");
  return opts;
}

function assertNumeric(name, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`--${name} expects a number, got "${value}"`);
  return n;
}

function assertInt(name, value) {
  const n = Number(value);
  if (!Number.isInteger(n)) fail(`--${name} expects an integer, got "${value}"`);
  return n;
}

function applyFilters(blocks, filters) {
  if (!filters.length) return blocks;
  return blocks.filter((b) =>
    filters.every(({ key, values }) => {
      const subject =
        key === "category" ? b.category :
        key === "dir" ? b.category.split("/")[1] ?? b.category :
        key === "file" ? b.fileStem :
        key === "model" ? null : b.id;
      if (key === "model") {
        const set = b.kind === "image" ? b.models : [b.modelGroup];
        return values.some((v) => set.includes(v));
      }
      // category= accepts the bare dir too (dir= sugar for full paths)
      if (key === "category") {
        return values.includes(subject) || values.includes(b.category.split("/")[1] ?? b.category);
      }
      return values.includes(subject);
    }),
  );
}

// ---------------------------------------------------------------------------
// Task planning
// ---------------------------------------------------------------------------

/** Does this block belong to the selected group under the routing law? */
function routedTo(block, group, opts) {
  if (block.kind !== group.kind) return false;
  if (opts.all) return true;
  return block.kind === "image" ? block.models.includes(opts.model) : block.modelGroup === opts.model;
}

async function planTasks(blocks, group, opts) {
  const warnings = [];
  const tasks = [];
  const missingI2v = [];
  let index = 0;

  for (const block of blocks) {
    if (!routedTo(block, group, opts)) continue;

    let params;
    let files;
    let skippedI2v = null;

    if (block.kind === "image") {
      const pm = block.perModel[opts.model] ?? Object.values(block.perModel)[0];
      if (!pm || !pm.size) {
        warnings.push(`${block.category}/${block.id}: no usable settings for ${opts.model} — skipped`);
        continue;
      }
      const size = resolveImageSize({ ...block, size: pm.size }, group, opts);
      const n = opts.n; // --auto-n is a documented no-op (suggestedN always null)
      const seedBase = opts.seed ?? pm.seed ?? null;
      params = { size: size.sent, n, seedBase, guidance: pm.guidance, steps: pm.steps };
      files = imageFiles(block, group, opts, n);
      tasks.push(mkTask(index++, block, size, params, files, null, group, opts, null, null));
      continue;
    }

    // video
    if (block.numFrames === null && opts.videoSeconds === null) {
      warnings.push(`${block.category}/${block.id}: no table num_frames and no --video-seconds — skipped`);
      continue;
    }
    const size = resolveVideoSize(block, group, opts, warnings);
    if (size.size_snapped === true) {
      console.error(`  [size-snap] ${size.original.w}x${size.original.h} -> ${size.sent.w}x${size.sent.h} (wan22 bucket)`);
    }
    const tableSeconds = block.numFrames && block.fps ? block.numFrames / block.fps : null;
    const effFps = opts.videoFps ?? block.fps ?? 25;
    const effSeconds = opts.videoSeconds ?? tableSeconds ?? 5;
    const numFrames = opts.videoSeconds !== null || opts.videoFps !== null
      ? snapFrames(Math.round(effSeconds * effFps), group.frameStep)
      : block.numFrames;
    const n = opts.n;
    const seedBase = opts.seed ?? block.seed ?? null;

    let referenceFile = null;
    if (block.videoMode === "i2v") {
      referenceFile = await resolveSourceStill(block, opts.out);
      if (!referenceFile) {
        if (opts.i2vStrict) missingI2v.push(`${block.category}/${block.id}`);
        skippedI2v = `no source still under ${path.relative(process.cwd(), opts.out)}/${IMAGE_GROUPS.join("|")}/ (run image groups first, or --i2v-strict to fail fast)`;
      }
    }

    params = { size: size.sent, n, seedBase, guidance: block.guidance, steps: block.steps, numFrames, fps: effFps, referenceFile };
    files = videoFiles(block, group, opts, n);
    tasks.push(mkTask(index++, block, size, params, files, referenceFile, group, opts, numFrames, effFps));
  }

  if (missingI2v.length) {
    fail(`--i2v-strict: ${missingI2v.length} i2v entr(ies) have no resolvable source still yet:\n  ${missingI2v.join("\n  ")}\nRun the IMAGE groups first (sweep order law), then retry.`);
  }
  return { tasks, warnings };
}

function mkTask(index, block, size, params, files, referenceFile, group, opts, numFrames, effFps) {
  const { path: apiPath, payload, perSeed } = buildPayload(block, group, params, opts);
  return {
    index, block, size, n: params.n, payload, perSeed, apiPath, files,
    seed: perSeed[0] ?? null,
    referenceFile,
    numFrames: numFrames ?? null,
    effFps: effFps ?? null,
  };
}

function imageFiles(block, group, opts, n) {
  const stem = `${block.slug}-v${block.variantNum}-${IMAGE_MODEL_SHORT[group.key] ?? block.modelsRaw.join("+")}`;
  return fileList(opts.out, group.key, block.category, stem, n, "png");
}

function videoFiles(block, group, opts, n) {
  const stem = `${block.slug}-v${block.variantNum}-${block.modelRaw}`;
  return fileList(opts.out, group.key, block.category, stem, n, "mp4");
}

function fileList(out, groupKey, category, stem, n, ext) {
  const dir = path.join(out, groupKey, category);
  const files = [];
  for (let i = 0; i < n; i++) {
    const suffix = n > 1 ? `-i${i + 1}` : "";
    files.push(path.join(dir, `${stem}${suffix}.${ext}`));
  }
  return files;
}

function tasksToCurl(task, baseUrl, opts) {
  const headers = ["-H 'Content-Type: application/json'"];
  if (opts.apiKey) headers.push(`-H 'Authorization: Bearer $SKYNET_API_KEY'`);
  return `curl -sS -X POST '${baseUrl}${task.apiPath}' ${headers.join(" ")} -d '${JSON.stringify(payloadForDisplay(task.payload))}'`;
}

// ---------------------------------------------------------------------------
// HTTP plumbing (verbatim from hosting-hero v3)
// ---------------------------------------------------------------------------

function httpHeaders(opts) {
  const h = { "Content-Type": "application/json" };
  if (opts.apiKey) h.Authorization = `Bearer ${opts.apiKey}`;
  return h;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class HttpError extends Error {
  constructor(status, bodyText, url) {
    super(`HTTP ${status} from ${url}: ${bodyText.slice(0, 400)}`);
    this.status = status;
    this.retryable = status >= 500 || status === 429;
  }
}

/**
 * POST safety law: generation requests cost GPU time. A POST may only be
 * re-sent when it provably never reached the server (connection-phase
 * failures). Timeouts, aborts, and mid-flight resets leave the server-side
 * state UNKNOWN — re-sending risks duplicate paid work, so we fail loud
 * and let the human verify before retrying.
 */
const PRE_CONNECT_CODES = new Set(["ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "ENETUNREACH", "EHOSTUNREACH"]);

function isProvablyNotDelivered(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return false;
  return PRE_CONNECT_CODES.has(err?.cause?.code ?? err?.code ?? "");
}

/**
 * Wall-clock transport replacing global fetch (bug fix 2026-10-07).
 *
 * Why: undici-backed `fetch()` enforces a hardcoded ~300s headersTimeout
 * while waiting for response headers. SGLang's synchronous
 * /v1/images/generations holds the response open for the whole generation
 * (flux2 images routinely exceed 5 minutes under --parallel), so fetch()
 * killed healthy connections at ~5 min; the caller saw
 * "TypeError: fetch failed" — delivery state unknown under the M2 law —
 * and marked the task FAILED even though the server finished the image.
 *
 * Contract with the M2 law (a POST may only be re-sent when provably
 * not delivered):
 *  - The ONLY timer is the caller's wall deadline. When it fires the
 *    request bytes were already written, so we reject with
 *    name "TimeoutError" → isProvablyNotDelivered() stays false →
 *    no POST retry. Exactly the classification AbortSignal.timeout gave,
 *    just at the right duration.
 *  - Connection-phase socket errors (ECONNREFUSED, ENOTFOUND, EAI_AGAIN,
 *    ENETUNREACH, EHOSTUNREACH) propagate with `.code` intact — all of
 *    them can only occur before the request is flushed, so POSTs still
 *    retry on them and GETs still retry on them.
 *  - Mid-flight breaks after flush (ECONNRESET, EPIPE, aborted response)
 *    carry no PRE_CONNECT code → POST = unknown → no retry; GET retries.
 *    Same semantics as the old fetch path.
 *
 * Redirect policy: GET follows up to 3 Location hops (fetch did this;
 * keeps /v1/models behavior); POST never auto-follows — re-issuing a
 * generation POST at a redirect target would double-spend GPU.
 *
 * The body is fully buffered (what res.arrayBuffer() did anyway; video
 * downloads of tens of MB are fine). No size cap is imposed. Resolved
 * object exposes exactly the accessors callers use: ok, status,
 * headers.get("location"), text(), json(), arrayBuffer().
 */
const MAX_GET_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function wallDeadlineError(url) {
  const err = new Error(`wall-clock deadline reached during request to ${url}`);
  err.name = "TimeoutError"; // M2: POST delivery state unknown → never retried
  return err;
}

function requestOnce(url, init, deadlineMs) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch { reject(new TypeError(`invalid URL: ${url}`)); return; }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      reject(new TypeError(`unsupported protocol ${target.protocol} in ${url}`));
      return;
    }
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) { reject(wallDeadlineError(url)); return; }
    const transport = target.protocol === "https:" ? https : http;
    let deadlineTimer = null; // armed right after req exists; handlers guard for null
    const clearDeadline = () => { if (deadlineTimer) clearTimeout(deadlineTimer); };
    const req = transport.request(
      target,
      { method: init.method ?? "GET", headers: { ...(init.headers ?? {}) } },
      (incoming) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("aborted", () => {
          clearDeadline();
          reject(new Error(`connection aborted mid-response from ${url}`));
        });
        incoming.on("error", (err) => {
          clearDeadline();
          reject(err);
        });
        incoming.on("end", () => {
          clearDeadline();
          const body = Buffer.concat(chunks);
          const status = incoming.statusCode ?? 0;
          const location = typeof incoming.headers.location === "string" ? incoming.headers.location : null;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (name) => (name.toLowerCase() === "location" ? location : null) },
            text: async () => body.toString("utf8"),
            json: async () => JSON.parse(body.toString("utf8")),
            arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          });
        });
      }
    );
    // Single absolute wall timer — no per-header-read timeout exists here.
    deadlineTimer = setTimeout(() => req.destroy(wallDeadlineError(url)), remainingMs);
    req.on("error", (err) => {
      clearDeadline();
      reject(err);
    });
    req.end(init.body ?? undefined);
  });
}

async function rawRequest(url, init, deadlineMs, redirectsLeft = MAX_GET_REDIRECTS) {
  const res = await requestOnce(url, init, deadlineMs);
  const isGet = (init.method ?? "GET").toUpperCase() === "GET";
  if (!isGet || !REDIRECT_STATUSES.has(res.status) || redirectsLeft <= 0) return res;
  const location = res.headers.get("location");
  if (!location) return res;
  return rawRequest(new URL(location, url).href, init, deadlineMs, redirectsLeft - 1);
}

async function fetchWithRetry(url, init, opts, deadline) {
  const isPost = (init.method ?? "GET").toUpperCase() === "POST";
  let attempt = 0;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`timeout after ${opts.timeout}ms: ${url}`);
    try {
      const res = await rawRequest(url, init, deadline);
      if (res.ok || res.status === 404 || (!res.ok && res.status < 500 && res.status !== 429)) return res;
      if (attempt >= opts.retries) {
        throw new HttpError(res.status, await safeText(res), url);
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (isPost && !isProvablyNotDelivered(err)) {
        throw new Error(`POST ${url} failed with delivery state unknown (${err.name}: ${err.message}) — NOT retrying to avoid duplicate GPU work; check the server/manifest before re-running this task`);
      }
      if (attempt >= opts.retries) throw err; // network error, retries exhausted
    }
    const backoff = 2000 * 2 ** attempt;
    attempt++;
    console.error(`  retry ${attempt}/${opts.retries} for ${url} in ${backoff}ms`);
    await sleep(Math.min(backoff, Math.max(0, deadline - Date.now())));
  }
}

async function safeText(res) {
  try { return await res.text(); } catch { return "<unreadable body>"; }
}

async function postJson(baseUrl, apiPath, payload, opts, deadline) {
  const res = await fetchWithRetry(`${baseUrl}${apiPath}`, {
    method: "POST",
    headers: httpHeaders(opts),
    body: JSON.stringify(payload),
  }, opts, deadline);
  const text = await safeText(res);
  if (!res.ok) throw new HttpError(res.status, text, `${baseUrl}${apiPath}`);
  try { return JSON.parse(text); } catch { throw new Error(`server returned non-JSON on ${apiPath}: ${text.slice(0, 200)}`); }
}

async function getBinary(url, opts, deadline) {
  const res = await fetchWithRetry(url, { method: "GET", headers: httpHeaders(opts) }, opts, deadline);
  if (!res.ok) throw new HttpError(res.status, await safeText(res), url);
  return Buffer.from(await res.arrayBuffer());
}

async function getJson(url, opts, deadline) {
  const res = await fetchWithRetry(url, { method: "GET", headers: httpHeaders(opts) }, opts, deadline);
  const text = await safeText(res);
  if (!res.ok) throw new HttpError(res.status, text, url);
  try { return JSON.parse(text); } catch { throw new Error(`non-JSON from ${url}: ${text.slice(0, 200)}`); }
}

// ---------------------------------------------------------------------------
// Transport resolution + model auto-detection (verbatim from hosting-hero v3)
// ---------------------------------------------------------------------------

/**
 * Endpoint precedence: --base-url > --port (http on the default host) >
 * http://skynet2.interserver.net:30001 (single-model proxy default).
 */
function resolveBaseUrl(opts) {
  if (opts.baseUrl) return opts.baseUrl;
  if (opts.port !== null) return `http://${HOST}:${opts.port}`;
  return DEFAULT_BASE_URL;
}

/**
 * True for the owner's chosen SINGLE-MODEL proxy default — exactly the
 * DEFAULT_BASE_URL (http on :30001 at the skynet2 host). That endpoint
 * fronts one model at a time, so when /v1/models reports exactly one entry,
 * that served id IS the payload target: auto-adopt it while the request
 * SHAPE keeps following the selected --model group. `--port 30001` resolves
 * to the same URL string and gets the same treatment by design.
 */
function isSingleModelProxyOrigin(baseUrl) {
  return baseUrl === DEFAULT_BASE_URL;
}

/**
 * True when the endpoint is a SHARED multi-model reverse proxy: https on the
 * default port (443) at a non-local host. Listing every routable model, an id
 * mismatch is a warning there — never an auto-adopt, never a fail-fast.
 */
function isSharedProxyOrigin(baseUrl) {
  let u;
  try { u = new URL(baseUrl); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (u.port !== "" && u.port !== "443") return false;
  return u.hostname !== "localhost" && u.hostname !== "127.0.0.1";
}

function isDiffusionEntry(entry) {
  return Boolean(entry && (entry.task_type || entry.pipeline_name || entry.pipeline_class));
}

async function probeModels(baseUrl, opts) {
  const res = await fetchWithRetry(`${baseUrl}/v1/models`, { method: "GET", headers: httpHeaders(opts) }, { ...opts, retries: 0 }, Date.now() + 15_000);
  if (!res.ok) throw new HttpError(res.status, await safeText(res), `${baseUrl}/v1/models`);
  return res.json();
}

/**
 * Decide the payload model id before a real run.
 * Precedence: --served-model > single-model auto-adopt > group default id.
 * (Caller gate: with --served-model this function is never reached.)
 */
async function detectModelId(baseUrl, group, opts) {
  const singleProxy = isSingleModelProxyOrigin(baseUrl);
  const sharedProxy = !singleProxy && isSharedProxyOrigin(baseUrl);
  let data;
  try {
    data = await probeModels(baseUrl, opts);
  } catch (err) {
    console.error(`note: /v1/models probe failed (${err.message}) — keeping configured model "${group.model}"`);
    return group.model;
  }
  const entries = Array.isArray(data?.data) ? data.data : [];
  const ids = entries.map((e) => e?.id).filter(Boolean);

  if (singleProxy && ids.length === 1) {
    const served = ids[0];
    if (served !== group.model) {
      console.error(`note: single-model proxy at ${baseUrl} serves "${served}" — adopting it as the payload id (${group.kind} request shape for group kept)`);
    }
    return served;
  }
  // A single-model origin listing 0 or >1 entries is ambiguous — fall through.

  if (sharedProxy) {
    if (ids.includes(group.model)) return group.model; // proxy confirms it
    if (ids.length === 0) return group.model;
    console.error(`warning: shared proxy at ${baseUrl} currently lists [${ids.join(", ").slice(0, 160)}] — NOT "${group.model}". Trusting the configured id (pass --served-model to target a listed one). Requests will error until "${group.model}" is fronted.`);
    return group.model;
  }

  const diffusion = entries.filter(isDiffusionEntry);
  if (diffusion.length === 1) {
    const served = diffusion[0].id;
    if (served !== group.model) {
      console.error(`note: adopting served model id "${served}" (configured default was "${group.model}"; task_type=${diffusion[0].task_type ?? "?"})`);
    }
    return served;
  }
  if (diffusion.length === 0 && entries.length > 0) {
    console.error(`warning: ${baseUrl}/v1/models lists ${entries.length} entr(ies) with NO diffusion markers (ids: ${ids.join(", ").slice(0, 160)}) — this endpoint may be a plain-LLM server, not SGLang Diffusion. Keeping "${group.model}".`);
    return group.model;
  }
  if (diffusion.length > 1) {
    console.error(`note: ${diffusion.length} diffusion-marked entries on ${baseUrl}; keeping configured "${group.model}" — pass --served-model to pick another.`);
  }
  return group.model;
}

// ---------------------------------------------------------------------------
// Media format sniffing (bug fix 2026-10-07, PART A)
//
// Why: the planner names image outputs ".png" before the response exists,
// but SGLang pipelines return whichever container the scheduler encodes —
// FLUX/SD3.5 commonly emit JPEG bytes under a .png name. File extensions
// lie; magic bytes don't. At save time we sniff the buffer and write under
// the detected extension, recording the truth in sidecar + manifest.
// ---------------------------------------------------------------------------

const DETECTABLE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "mp4"]);

/** JPEG FFD8FF, PNG 89504E47, GIF 474946, WEBP RIFF....WEBP, MP4 ftyp@4. */
function detectImageFormat(buffer) {
  const b = buffer;
  if (!Buffer.isBuffer(b)) throw new TypeError("detectImageFormat expects a Buffer");
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (b.length >= 12 && b.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
  return "bin";
}

/** Replace a media file's extension with the detected one (".png" → ".jpg"). */
function withExtension(file, ext) {
  const cur = path.extname(file).replace(/^\./, "").toLowerCase();
  if (cur === ext) return file;
  const jpegAlias = ext === "jpg" && cur === "jpeg" ? "jpeg" : ext;
  if (jpegAlias === cur) return file;
  return `${file.slice(0, file.length - path.extname(file).length)}.${ext}`;
}

// ---------------------------------------------------------------------------
// Execution: images (sync) and videos (async job + poll)
// ---------------------------------------------------------------------------

async function runImageTask(baseUrl, task, opts, deadline) {
  const resp = await postJson(baseUrl, "/v1/images/generations", task.payload, opts, deadline);
  const meta = { request_n: task.n, response: summarizeImageResponse(resp) };
  const items = Array.isArray(resp?.data) ? resp.data : [];
  if (!items.length) throw new Error(`image response had no data[]: ${JSON.stringify(resp).slice(0, 200)}`);
  if (items.length < task.n) meta.short_count = items.length;

  const written = [];
  for (let i = 0; i < Math.min(items.length, task.n); i++) {
    const item = items[i];
    let bytes;
    if (item.b64_json) bytes = Buffer.from(item.b64_json, "base64");
    else if (item.url) {
      const abs = item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`;
      bytes = await getBinary(abs, opts, deadline);
    } else throw new Error(`image data[${i}] had neither b64_json nor url`);
    const detected = detectImageFormat(bytes);
    let file = task.files[i];
    if (detected === "bin") {
      console.error(`    warn: ${path.basename(file)}: unrecognized magic bytes — keeping planned name`);
    } else {
      file = withExtension(file, detected); // derive name from CONTENT, not plan
    }
    meta.format = detected;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, bytes);
    written.push({ file, format: detected });
  }
  return { meta, written };
}

function summarizeImageResponse(resp) {
  return {
    id: resp?.id ?? null,
    created: resp?.created ?? null,
    count: resp?.data?.length ?? 0,
    revised_prompt: resp?.data?.[0]?.revised_prompt ?? null,
    inference_time_s: resp?.inference_time_s ?? null,
    peak_memory_mb: resp?.peak_memory_mb ?? null,
  };
}

async function runVideoJob(baseUrl, task, variantIndex, opts, deadline) {
  const payload = await materializeReference({ ...task.payload }); // i2v data URI at send time
  const seed = task.perSeed[variantIndex];
  if (seed !== null && seed !== undefined) payload.seed = seed;

  const job = await postJson(baseUrl, "/v1/videos", payload, opts, deadline);
  const jobId = job?.id;
  if (!jobId) throw new Error(`video submit returned no job id: ${JSON.stringify(job).slice(0, 200)}`);

  let status = job.status ?? "queued";
  let last = job;
  const pollUrl = `${baseUrl}/v1/videos/${encodeURIComponent(jobId)}`;
  while (status !== "completed" && status !== "failed") {
    if (Date.now() > deadline) throw new Error(`video job ${jobId} did not finish before timeout (last status: ${status})`);
    await sleep(5000);
    last = await getJson(pollUrl, opts, deadline);
    status = last?.status ?? status;
  }
  if (status === "failed") {
    const msg = typeof last.error === "string" ? last.error : JSON.stringify(last.error ?? last).slice(0, 300);
    throw new Error(`video job ${jobId} failed server-side: ${msg}`);
  }

  let bytes;
  if (last.url) bytes = await getBinary(last.url, opts, deadline);
  else {
    const variant = task.n > 1 || last.num_outputs > 1 ? `?variant=${variantIndex}` : "";
    bytes = await getBinary(`${baseUrl}/v1/videos/${encodeURIComponent(jobId)}/content${variant}`, opts, deadline);
  }

  const meta = {
    job_id: jobId,
    payload: redactReference(payload), // sidecars must not embed megabytes of b64
    final_status: { status: last.status, progress: last.progress ?? null, inference_time_s: last.inference_time_s ?? null },
  };
  return { meta, bytes };
}

function redactReference(payload) {
  if (typeof payload.reference_url === "string" && payload.reference_url.startsWith("data:")) {
    return { ...payload, reference_url: `data:image/png;base64,<${payload.reference_url.length} chars elided>` };
  }
  return payload;
}

async function runVideoTask(baseUrl, task, opts, deadline) {
  const meta = { jobs: [] };
  const written = [];
  for (let i = 0; i < task.n; i++) {
    const { meta: jobMeta, bytes } = await runVideoJob(baseUrl, task, i, opts, deadline);
    meta.jobs.push(jobMeta);
    const detected = detectImageFormat(bytes);
    let file = task.files[i];
    if (detected !== "mp4") {
      // Video keeps its .mp4 name (players/pollers assume it); the mismatch
      // is surfaced, not silently relabelled — PART A law.
      console.error(`    warn: ${path.basename(file)}: expected mp4 magic, detected "${detected}" — keeping .mp4`);
    }
    meta.format = detected;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, bytes);
    written.push({ file, format: detected });
  }
  return { meta, written };
}

// ---------------------------------------------------------------------------
// Manifest + sidecars + pool (verbatim from hosting-hero v3)
// ---------------------------------------------------------------------------

async function appendManifest(manifestPath, row) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.appendFile(manifestPath, `${JSON.stringify(row)}\n`, "utf8");
}

async function writeSidecar(mediaFile, task, group, opts, meta, ok, errorText, format = null) {
  const sidecar = {
    generated_at: new Date().toISOString(),
    model_group: opts.model,
    served_model: group.model,
    endpoint: `${group.baseUrl}${task.apiPath}`,
    negative_mode: opts.negativeMode,
    // Negative evidence trail (PART B, 2026-10-07): what the library defined
    // vs what the wire payload actually carried. `negative_defined` set +
    // `negative_sent` null + group supportsNegative=false is the BY-DESIGN
    // FLUX case (guidance-distilled pipeline ignores negative_prompt).
    negative_defined: task.block.negative || null,
    negative_sent: task.payload?.negative_prompt ?? null,
    negative_scoped: task.block.negativeScoped ?? null, // metadata only (m15: never gates sending)
    // LTX-Video encoder budget actually sent (feature 2026-10-08); null for
    // every other group / --ltx-max-seq 0.
    diffusers_kwargs: task.payload?.diffusers_kwargs ?? null,
    block: task.block,
    size_original: task.size.original,
    size_sent: task.size.sent,
    size_method: task.size.method,
    // Wan2.2 bucket-snap evidence (feature 2026-10-08): the library asked
    // for requested_size; size_snapped true means the wire size is a
    // trained bucket the library did NOT state (see size_method).
    requested_size: `${task.size.original.w}x${task.size.original.h}`,
    size_snapped: task.size.size_snapped === true,
    requested_n: task.n,
    media_file: path.basename(mediaFile),
    media_format: format ?? meta?.format ?? null,
    status: ok ? "ok" : "failed",
    error: errorText ?? null,
    response_meta: meta ?? null,
  };
  await writeFileAtomic(`${mediaFile}.json`, JSON.stringify(sidecar, null, 2), "utf8");
}

async function existsOne(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * Skip-existing check aware of content-derived names (PART A): a task
 * planned as ".png" also counts as done when a repaired/regenerated
 * sibling with the same stem but true image extension exists — so relabel
 * passes never cause paid re-generation.
 */
async function resolveExistingVariants(files) {
  const resolved = [];
  for (const f of files) {
    if (await existsOne(f)) { resolved.push(f); continue; }
    const stem = f.slice(0, f.length - path.extname(f).length);
    let hit = null;
    for (const e of ["png", "jpg", "jpeg", "webp", "gif"]) {
      const cand = `${stem}.${e}`;
      if (cand !== f && (await existsOne(cand))) { hit = cand; break; }
    }
    if (!hit) return null;
    resolved.push(hit);
  }
  return resolved.length ? resolved : null;
}

/** Atomic media write: a killed process must never leave a truncated file
 *  that skip-existing would later accept as complete. */
async function writeFileAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

async function runPool(tasks, worker, parallel) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function lane(laneId) {
    for (;;) {
      const i = cursor++;
      if (i >= tasks.length) return;
      results[i] = await worker(tasks[i], i, laneId);
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, tasks.length) }, (_, l) => lane(l)));
  return results;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdList(opts) {
  const { blocks, warnings, filesParsed, sources } = await loadShmupLibrary(opts.promptsDir);
  const images = blocks.filter((b) => b.kind === "image");
  const videos = blocks.filter((b) => b.kind === "video");
  const outRoot = opts.out ? path.resolve(opts.out) : path.resolve(SCRIPT_DIR, "output");

  console.log(`prompt library: ${opts.promptsDir}`);
  const perDir = {};
  for (const b of blocks) (perDir[b.category] ??= []).push(b);
  for (const cat of Object.keys(perDir).sort()) {
    const list = perDir[cat];
    const files = new Set(list.map((b) => b.fileStem));
    if (list[0].kind === "image") {
      console.log(`  ${cat.padEnd(22)} ${String(files.size).padStart(3)} files  ${String(list.length).padStart(4)} image entries`);
    } else {
      const t2v = list.filter((b) => b.videoMode === "t2v").length;
      const i2v = list.filter((b) => b.videoMode === "i2v").length;
      console.log(`  ${cat.padEnd(22)} ${String(files.size).padStart(3)} files  ${String(list.length).padStart(4)} video entries  (t2v ${t2v} / i2v ${i2v})`);
    }
  }

  let resolvable = 0;
  const i2vEntries = videos.filter((b) => b.videoMode === "i2v");
  for (const b of i2vEntries) {
    if (await resolveSourceStill(b, outRoot)) resolvable++;
  }
  console.log(`totals: ${filesParsed} files parsed · ${images.length} image entries · ${videos.length} video entries (t2v ${videos.length - i2vEntries.length} / i2v ${i2vEntries.length}; ${resolvable} i2v source stills RESOLVABLE under ${path.relative(process.cwd(), outRoot) || "."}) · ${warnings.length} warnings`);
  console.log(`sources: json sidecars ${sources.json} · labeled-md ${sources.mdLabeled} · legacy-md ${sources.mdLegacy}`);

  const modelCensus = {};
  for (const b of images) for (const g of b.models) modelCensus[g] = (modelCensus[g] ?? 0) + 1;
  const videoCensus = {};
  for (const b of videos) videoCensus[b.modelGroup] = (videoCensus[b.modelGroup] ?? 0) + 1;
  console.log(`image routing: ${Object.keys(modelCensus).sort().map((g) => `${g} ${modelCensus[g]}`).join(", ")}`);
  console.log(`video routing: ${Object.keys(videoCensus).sort().map((g) => `${g} ${videoCensus[g]}`).join(", ")}`);

  const sizes = {};
  for (const b of images) {
    for (const pm of Object.values(b.perModel)) if (pm.size) sizes[`${pm.size.w}x${pm.size.h}`] = (sizes[`${pm.size.w}x${pm.size.h}`] ?? 0) + 1;
  }
  console.log(`image sizes (per-model cells): ${Object.keys(sizes).length} distinct`);
  const off16 = Object.keys(sizes).filter((s) => { const m = SIZE_RE.exec(s); return m && (Number(m[1]) % 16 || Number(m[2]) % 16); });
  if (off16.length) console.log(`  note: ${off16.length} size(s) off the 16 grid — snap16 applies at send`);
  const offGrid = videos.filter((b) => {
    const d = GROUPS[b.modelGroup]?.divisor ?? 16;
    return b.size.w % d || b.size.h % d;
  });
  if (offGrid.length) console.log(`  note: ${offGrid.length} video entries off their family grid (wan ÷16 / ltx ÷32) — snap warns at plan`);
  for (const w of warnings) console.error(`  warn: ${w}`);
}

async function cmdDryRun(tasks, group, opts) {
  const baseUrl = group.baseUrl;
  for (const task of tasks) {
    const labelExtra = task.block.kind === "video" ? `  [${task.block.videoMode}${task.block.modelRaw ? ` ${task.block.modelRaw}` : ""}]` : "";
    console.log(`\n=== [${task.index + 1}/${tasks.length}] ${task.block.category}/${task.block.id}  (${task.n} output${task.n > 1 ? "s" : ""})${labelExtra}`);
    console.log(`    size ${task.size.original.w}x${task.size.original.h} -> ${task.size.sent.w}x${task.size.sent.h} via ${task.size.method}`);
    if (task.block.kind === "video") {
      console.log(`    frames ${task.payload.num_frames} @ ${task.payload.fps}fps${task.block.durationNote ? ` (table duration: ${task.block.durationNote})` : ""}${task.block.seed !== null ? ` · table seed ${task.block.seed}` : ""}`);
      if (task.referenceFile) console.log(`    i2v source still: ${path.relative(process.cwd(), task.referenceFile)}`);
      if (!task.referenceFile && task.block.videoMode === "i2v") console.log(`    [i2v-skipped: no source still] would skip at send — ${task.payload.reference_url ?? "no ref"}`);
    }
    console.log(`    files: ${task.files.map((f) => path.relative(process.cwd(), f)).join(", ")}`);
    if (group.kind === "video" && task.n > 1) console.log(`    note: ${task.n} separate single-output video jobs (seed+i)`);
    console.log(JSON.stringify(payloadForDisplay(task.payload), null, 2));
    console.log(`curl: ${tasksToCurl(task, baseUrl, opts)}`);
  }
  const skipped = tasks.filter((t) => t.block.videoMode === "i2v" && !t.referenceFile).length;
  console.log(`\ndry-run: ${tasks.length} task(s), ${tasks.reduce((a, t) => a + t.n, 0)} output(s), ${skipped} i2v task(s) would skip for a missing source still — nothing sent, nothing written.`);
}

async function cmdRun(tasks, group, opts) {
  const baseUrl = group.baseUrl;
  const manifestPath = path.join(opts.out, opts.model, "manifest.jsonl");

  if (!opts.modelId) {
    group.model = await detectModelId(baseUrl, group, opts);
    // Adoption must reach the wire: payloads were built during planning with
    // the configured id — re-stamp them with the resolved/served id.
    for (const t of tasks) t.payload.model = group.model;
  }

  let sent = 0, saved = 0, failed = 0, skipped = 0, skippedI2v = 0;
  const failures = [];

  const started = Date.now();
  await runPool(tasks, async (task, i) => {
    const label = `${task.block.category}/${task.block.id}`;
    const row = {
      ts: new Date().toISOString(), index: task.index, id: task.block.id,
      category: task.block.category, file: task.block.fileStem,
      variant: task.block.variantNum, model: group.model, kind: group.kind,
      n: task.n, size_original: task.size.original, size_sent: task.size.sent,
      requested_size: `${task.size.original.w}x${task.size.original.h}`,
      size_snapped: task.size.size_snapped === true,
      diffusers_kwargs: task.payload?.diffusers_kwargs ?? null,
      files: task.files.map((f) => path.relative(opts.out, f)),
    };
    if (task.block.kind === "video") {
      row.video_mode = task.block.videoMode;
      row.model_line = task.block.modelRaw;
      row.num_frames = task.payload.num_frames;
      row.fps = task.payload.fps;
      if (task.block.seed !== null) row.table_seed = task.block.seed;
      if (task.referenceFile) row.source_still = path.relative(opts.out, task.referenceFile);
    } else {
      row.model_line = task.block.modelsRaw.join(",");
      if (task.block.perModel?.[opts.model]?.defaulted) row.settings_defaulted = true;
    }

    if (task.block.videoMode === "i2v" && !task.referenceFile) {
      skippedI2v++;
      row.status = "skipped-i2v";
      row.error = "[i2v-skipped: no source still]";
      await appendManifest(manifestPath, row);
      console.error(`[${i + 1}/${tasks.length}] ${label} SKIPPED i2v — no source still (run image groups first)`);
      return;
    }

    const existing = opts.force ? null : await resolveExistingVariants(task.files);
    if (existing) {
      skipped++;
      row.status = "skipped-existing";
      row.files = existing.map((f) => path.relative(opts.out, f)); // actual on-disk names
      await appendManifest(manifestPath, row);
      return;
    }

    sent++;
    const taskStart = Date.now();
    const deadline = taskStart + opts.timeout;
    const durNote = group.kind === "video" ? ` ${task.payload.num_frames}f@${task.payload.fps}fps` : "";
    const refNote = task.referenceFile ? " [i2v]" : "";
    console.error(`[${i + 1}/${tasks.length}] ${label}${refNote} → ${task.size.sent.w}x${task.size.sent.h} n=${task.n}${durNote}`);
    try {
      const { meta, written } = group.kind === "image"
        ? await runImageTask(baseUrl, task, opts, deadline)
        : await runVideoTask(baseUrl, task, opts, deadline);
      for (const w of written) await writeSidecar(w.file, task, group, opts, meta, true, null, w.format);
      saved++;
      row.status = "ok";
      row.files = written.map((w) => path.relative(opts.out, w.file)); // truth: actual names written
      row.format = written[0]?.format ?? null;
      row.negative_sent = task.payload?.negative_prompt ?? null;
      row.wall_ms = Date.now() - taskStart;
      row.response_meta = meta;
      await appendManifest(manifestPath, row);
    } catch (err) {
      failed++;
      row.status = "failed";
      row.error = err.message;
      row.wall_ms = Date.now() - taskStart;
      await appendManifest(manifestPath, row);
      const sidecarTarget = task.files[0];
      try {
        await fs.mkdir(path.dirname(sidecarTarget), { recursive: true });
        await writeSidecar(sidecarTarget, task, group, opts, null, false, err.message);
      } catch { /* sidecar write is best-effort */ }
      failures.push({ label, error: err.message });
      console.error(`    FAILED ${label}: ${err.message}`);
    }
  }, opts.parallel);

  const totalOutputs = tasks.reduce((a, t) => a + t.n, 0);
  console.log(`\nsummary (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  console.log(`  queued    ${tasks.length} task(s) / ${totalOutputs} output(s)`);
  console.log(`  sent      ${sent}`);
  console.log(`  saved     ${saved} task(s) ok`);
  console.log(`  skipped   ${skipped} (outputs already exist; --force to redo)`);
  console.log(`  i2v-skip  ${skippedI2v} (no source still yet — images before videos!)`);
  console.log(`  failed    ${failed}`);
  if (failures.length) {
    console.log(`\nfailures:`);
    for (const f of failures) console.log(`  ${f.label}: ${f.error}`);
  }
  console.log(`\nmanifest: ${manifestPath}`);
  process.exitCode = failed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Repair mode (PART C) — offline maintenance of the --out tree. NO network.
//
// Conventions it repairs to:
//   - media file extension == magic-byte truth (detectImageFormat)
//   - sidecar at `<media>.json` naming the SAME basename as the media file
//   - manifest.jsonl `files` entries pointing at names that exist
// Victim deletion (C2) requires POSITIVE evidence that a supported negative
// was NOT sent: a new-format sidecar with negative_sent:null while the block
// defines one, or a legacy video sidecar whose job payloads lack
// negative_prompt. Legacy IMAGE sidecars without payload evidence are NEVER
// deleted (conservative law — "unknown" is not "guilty").
// ---------------------------------------------------------------------------

const LIVE_WINDOW_MS = 5 * 60 * 1000; // fresher writes belong to the LIVE sweep — hands off

function isLiveFresh(statMs) {
  return Date.now() - statMs < LIVE_WINDOW_MS;
}

function groupSupportsNegative(groupName) {
  const g = GROUPS[groupName];
  if (!g) return null; // unknown group dir — classify, never act
  if (g.kind === "video") return true; // manifest law: both tracks honor negative_prompt
  return Boolean(g.supportsNegative);
}

/** Recursively collect media files (extension in DETECTABLE_EXTS) under dir. */
async function collectMediaFiles(dir, acc) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { await collectMediaFiles(full, acc); continue; }
    const ext = path.extname(e.name).replace(/^\./, "").toLowerCase();
    if (!DETECTABLE_EXTS.has(ext)) continue;
    if (/\.tmp-/.test(e.name)) continue; // mid-write atomics are not outputs
    acc.push(full);
  }
  return acc;
}

async function readMagicHead(file, bytes = 16) {
  let fh;
  try {
    fh = await fs.open(file, "r");
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    await fh?.close();
  }
}

function sameImageExt(a, b) {
  const n = (x) => (x === "jpeg" ? "jpg" : x);
  return n(a) === n(b);
}

/** Was this output's negative governed? Returns {verdict, reason}. */
function classifyNegativeEvidence(sidecar, groupName) {
  const supports = groupSupportsNegative(groupName);
  if (supports === null) return { verdict: "unknown-group", reason: `group "${groupName}" not in GROUPS` };
  const defined = sidecar?.block?.negative || null;
  if (!defined) return { verdict: "no-negative-in-library", reason: "entry defines no negative" };
  if (!supports) return { verdict: "kept-by-design", reason: `${groupName}: pipeline ignores negative_prompt (FLUX law)` };
  if (sidecar?.status !== "ok") return { verdict: "not-ok-status", reason: `status=${sidecar?.status}` };
  if (sidecar.negative_mode === "append") return { verdict: "kept-by-design", reason: "negative folded into positive (append mode)" };
  if (sidecar.negative_mode === "drop") return { verdict: "kept-by-design", reason: "user --negative-mode drop" };
  if ("negative_sent" in sidecar) {
    return sidecar.negative_sent
      ? { verdict: "sent", reason: "negative_sent recorded" }
      : { verdict: "victim", reason: "field mode + group supports but negative_sent null (explicit record)" };
  }
  // Legacy video sidecars embed each job payload — positive evidence possible.
  const jobs = sidecar?.response_meta?.jobs;
  if (Array.isArray(jobs) && jobs.length) {
    const anySent = jobs.some((j) => j?.payload && "negative_prompt" in j.payload);
    return anySent
      ? { verdict: "sent", reason: "job payloads carry negative_prompt" }
      : { verdict: "victim", reason: "legacy video sidecar: no job payload carries negative_prompt" };
  }
  // Legacy image sidecar: no payload evidence exists → conservative keep.
  return { verdict: "unknown-record-kept", reason: "legacy sidecar without negative evidence" };
}

async function readSidecar(mediaFile) {
  try {
    return JSON.parse(await fs.readFile(`${mediaFile}.json`, "utf8"));
  } catch {
    return null;
  }
}

async function cmdRepair(opts) {
  const out = opts.out;
  let dirents;
  try {
    dirents = await fs.readdir(out, { withFileTypes: true });
  } catch (err) {
    fail(`--repair: output tree "${out}" unreadable: ${err.message}`);
  }
  const groupDirs = dirents.filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name);
  if (!groupDirs.length) {
    console.log(`repair: no group dirs under ${out} — nothing to do.`);
    return;
  }
  console.log(`repair ${opts.apply ? "--apply (MUTATING)" : "(dry-run, no changes)"} — root ${out}`);

  const manifestRewrites = []; // {path, lines} — collected during planning

  const totals = { media: 0, relabels: 0, victims: 0, keptByDesign: 0, mtimeSkipped: 0, unknownKept: 0, noSidecar: 0, sentOk: 0, manifestRewrites: 0, manifestSkipped: 0, videoWarnings: 0 };
  const relabelPlan = []; // {group, from, to}
  const victimPlan = []; // {group, file, reason}

  for (const g of groupDirs) {
    const media = [];
    await collectMediaFiles(path.join(out, g), media);
    const actions = []; // relabels in THIS group (for manifest patching)
    for (const file of media) {
      totals.media++;
      const st = await fs.stat(file);
      if (isLiveFresh(st.mtimeMs)) { totals.mtimeSkipped++; continue; }
      const ext = path.extname(file).replace(/^\./, "").toLowerCase();
      const detected = detectImageFormat(await readMagicHead(file));
      const sidecar = await readSidecar(file);
      if (!sidecar) totals.noSidecar++;

      // C1 — extension vs magic truth
      if (ext === "mp4" || detected === "mp4") {
        if (detected !== "mp4" && ext === "mp4") {
          totals.videoWarnings++;
          console.error(`  warn[${g}]: ${path.relative(out, file)} — mp4 name holds "${detected}" bytes (kept, video names stay .mp4)`);
        }
      } else if (detected === "bin") {
        totals.unknownKept++;
        console.error(`  warn[${g}]: ${path.relative(out, file)} — unrecognized magic (kept unchanged)`);
      } else if (!sameImageExt(ext, detected)) {
        const to = withExtension(file, detected);
        let clash = false;
        try { await fs.access(to); clash = true; } catch { /* free */ }
        if (clash) {
          totals.unknownKept++;
          console.error(`  warn[${g}]: ${path.relative(out, file)} — relabel target ${path.basename(to)} already exists, skipped`);
          continue;
        }
        totals.relabels++;
        actions.push({ from: file, to });
        relabelPlan.push({ group: g, from: file, to });
      }

      // C2 — missing-negative victims (delete so the next run regenerates)
      if (sidecar) {
        const { verdict, reason } = classifyNegativeEvidence(sidecar, g);
        if (verdict === "victim") { totals.victims++; victimPlan.push({ group: g, file, reason }); }
        else if (verdict === "kept-by-design") totals.keptByDesign++;
        else if (verdict === "unknown-record-kept") totals.unknownKept++;
        else if (verdict === "sent") totals.sentOk++;
      }
    }

    // Manifest patch plan for this group (file relabels only; rows are history)
    const manifestPath = path.join(out, g, "manifest.jsonl");
    if (actions.length) {
      let mstat = null;
      try { mstat = await fs.stat(manifestPath); } catch { /* no manifest */ }
      if (mstat && isLiveFresh(mstat.mtimeMs)) {
        totals.manifestSkipped++;
        console.error(`  warn[${g}]: manifest.jsonl written <5min ago (LIVE sweep?) — rewrite SKIPPED; relabels apply, rows will be stale`);
      } else if (mstat) {
        const raw = await fs.readFile(manifestPath, "utf8");
        const lines = raw.split("\n");
        const byOld = new Map(actions.map((a) => [path.relative(out, a.from).split(path.sep).join("/"), path.relative(out, a.to).split(path.sep).join("/")]));
        let touched = false;
        const patched = lines.map((line) => {
          if (!line.trim()) return line;
          let row;
          try { row = JSON.parse(line); } catch { return line; }
          if (!Array.isArray(row.files)) return line;
          const nextFiles = row.files.map((f) => byOld.get(f) ?? f);
          if (nextFiles.some((f, i) => f !== row.files[i])) {
            touched = true;
            return JSON.stringify({ ...row, files: nextFiles });
          }
          return line;
        });
        if (touched) {
          totals.manifestRewrites++;
          manifestRewrites.push({ path: manifestPath, lines: patched });
        }
      }
    }
    // per-group report
    const gRel = actions.length;
    const gVict = victimPlan.filter((v) => v.group === g).length;
    console.log(`  ${g.padEnd(8)} media=${media.length} relabel=${gRel} victims=${gVict}`);
  }

  console.log(`\nrelabels (${relabelPlan.length}):`);
  for (const r of relabelPlan.slice(0, 400)) console.log(`  ${path.relative(out, r.from)} -> ${path.basename(r.to)}`);
  if (relabelPlan.length > 400) console.log(`  … +${relabelPlan.length - 400} more`);
  console.log(`\nvictims (${victimPlan.length}):`);
  for (const v of victimPlan.slice(0, 200)) console.log(`  ${v.group}/${path.basename(v.file)}  [${v.reason}]`);
  console.log(`\ntotals: ${JSON.stringify(totals, null, 0)}`);

  if (!opts.apply) {
    console.log(`\ndry-run complete — nothing mutated. Re-run with --apply to execute.`);
    return;
  }

  // Apply: sidecars first (derive .json rename), then media rename, then victims, then manifests.
  for (const r of relabelPlan) {
    const scOld = `${r.from}.json`;
    const scNew = `${r.to}.json`;
    try {
      const sc = JSON.parse(await fs.readFile(scOld, "utf8"));
      sc.media_file = path.basename(r.to);
      sc.media_format = detectImageFormat(await readMagicHead(r.from));
      await writeFileAtomic(scNew, JSON.stringify(sc, null, 2), "utf8");
      await fs.unlink(scOld);
    } catch { /* sidecar absent/unparseable — media rename still proceeds */ }
    await fs.rename(r.from, r.to);
  }
  for (const v of victimPlan) {
    await fs.unlink(v.file);
    try { await fs.unlink(`${v.file}.json`); } catch { /* sidecar may be absent */ }
  }
  for (const m of manifestRewrites) {
    await writeFileAtomic(m.path, `${m.lines.join("\n")}`, "utf8");
  }
  console.log(`\napplied: ${relabelPlan.length} relabels, ${victimPlan.length} victim deletions, ${manifestRewrites.length} manifest rewrites.`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); return; }
  if (opts.apply && !opts.repair) fail("--apply only operates together with --repair");
  if (opts.repair) {
    // Repair is strictly offline: no endpoint resolution, no probes, no POSTs.
    opts.out = opts.out === null ? path.resolve(SCRIPT_DIR, "output") : path.resolve(opts.out);
    return cmdRepair(opts);
  }

  const group = { ...GROUPS[opts.model], key: opts.model };
  group.baseUrl = resolveBaseUrl(opts);
  if (opts.modelId) group.model = opts.modelId; // --served-model: honored by dry-run and real runs alike

  if (opts.out === null) opts.out = path.resolve(SCRIPT_DIR, "output");
  opts.out = path.resolve(opts.out);

  if (opts.list) return cmdList(opts);

  const { blocks, warnings, filesParsed } = await loadShmupLibrary(opts.promptsDir);
  for (const w of warnings) console.error(`warn: ${w}`);
  if (!blocks.length) {
    fail(`no entries parsed from ${opts.promptsDir}/{images,video}/*/ *.md — check --prompts-dir`);
  }

  const filtered = applyFilters(blocks, opts.filters);
  const selected = filtered.filter((b) => routedTo(b, group, opts));
  if (!selected.length) {
    const kindCount = filtered.filter((b) => b.kind === group.kind).length;
    console.error(`no entries routed to "${opts.model}" (${filesParsed} files, ${blocks.length} entries, ${filtered.length} after filters, ${kindCount} of kind ${group.kind}). Routing law: the Models/Model line must name this group — use --all to force every ${group.kind} entry. Use --list to inspect.`);
    process.exitCode = 1;
    return;
  }

  const { tasks, warnings: planWarnings } = await planTasks(selected, group, opts);
  for (const w of planWarnings) console.error(`warn: ${w}`);
  if (!tasks.length) {
    fail(`every routed entry was dropped in planning (see warnings above)`);
  }

  if (opts.dryRun) return cmdDryRun(tasks, group, opts);
  return cmdRun(tasks, group, opts);
}

// CLI guard: importing this module (tests/tooling) must NOT execute main —
// an accidental default-args run spends real GPU money against the live server.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`fatal: ${err.stack ?? err.message}`);
    process.exit(1);
  });
}
