#!/usr/bin/env node
/**
 * Re-analyses input-probe JSONL logs (from `npm run log-server`) on the handler clock.
 *
 * Why this exists: on Tizen 5.5 (Chromium 69) `KeyboardEvent.timeStamp` is on the `performance.now()` clock but only
 * advances in whole-second steps, so the probe's own `chooseEventTime()` accepted it and every timing verdict it
 * computed (hold lengths, repeat delay / interval, bounce, diagonal and chord windows, dispatch delay) is wrong.
 * Each logged key event also carries `delay = performance.now() − timeStamp` measured in the handler, so
 * `t + delay` is the exact handler time. Everything below uses that clock.
 *
 * Usage (from tools/input-probe/):
 *   node results/analyze.mjs results/2026-09-15-m7/ip-mu37lye3-yj1x.jsonl [--timeline]
 *
 * Zero dependencies; prints a plain-text report.
 */

import { readFileSync } from 'node:fs';

const file = process.argv[2];
const withTimeline = process.argv.includes('--timeline');
if (!file) {
  console.error('usage: node results/analyze.mjs <session.jsonl> [--timeline]');
  process.exit(2);
}

const payloads = readFileSync(file, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));
const seen = new Set();
const events = [];
for (const p of payloads) {
  if (seen.has(p.seq)) continue;
  seen.add(p.seq);
  for (const e of p.newEvents ?? []) events.push(e);
}
const last = payloads[payloads.length - 1];

/** Handler time of an event (ms, performance.now clock). */
const at = (e) => (typeof e.delay === 'number' ? e.t + e.delay : e.t);
const r1 = (v) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(1));
const ARROWS = new Set([37, 38, 39, 40]);
const PAD_EDGE = /^GP(\d+) (b|a)(\d+) (.+)$/;

/** min / p10 / median / mean / p90 / max of a list. */
function dist(values) {
  if (values.length === 0) return 'n=0';
  const s = [...values].sort((a, b) => a - b);
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 0.5))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return `n=${s.length} min ${r1(s[0])} · p10 ${r1(q(0.1))} · median ${r1(q(0.5))} · mean ${r1(mean)} · p90 ${r1(q(0.9))} · max ${r1(s[s.length - 1])}`;
}

// ------------------------------------------------------------------ environment
const env = last.env ?? {};
const out = [];
out.push(`# ${last.session}  (from ${last.from}, ${payloads.length} reports, ${events.length} events, dropped ${last.droppedEvents})`);
out.push('');
out.push('## Environment');
out.push(`UA: ${env.userAgent}`);
out.push(
  `Chrome ${env.chromeVersion} · Tizen ${env.tizenPlatformVersion} · model ${env.model} (${env.modelCode}) · firmware ${env.firmware}`,
);
out.push(
  `viewport ${env.innerWidth}×${env.innerHeight} @${env.devicePixelRatio} · screen ${env.screenWidth}×${env.screenHeight} · cores ${env.hardwareConcurrency}`,
);
const gl = (g) => (g?.supported ? `${g.version} · ${g.renderer} (${g.vendor}) · MAX_TEXTURE_SIZE ${g.maxTextureSize}` : 'no');
out.push(`WebGL1: ${gl(env.webgl1)}`);
out.push(`WebGL2: ${gl(env.webgl2)}`);
out.push(
  `WASM ${env.webAssembly} · AudioWorklet ${env.audioWorklet} · OffscreenCanvas ${env.offscreenCanvas} · Gamepad API ${env.gamepadApi} · native globalThis ${env.nativeGlobalThis}`,
);
out.push(`audio: ${env.audioSampleRate} Hz, baseLatency ${env.audioBaseLatency} s`);
const reg = last.stats.registered ?? [];
out.push(
  `keys: getSupportedKeys() = ${last.stats.supportedKeys}; registerKey ok ${reg.filter((k) => k.ok).length}/${reg.length}` +
    (reg.some((k) => !k.ok) ? ` — FAILED: ${reg.filter((k) => !k.ok).map((k) => k.name).join(', ')}` : ''),
);
out.push('');

// ------------------------------------------------------------------ event.timeStamp
const keyEvents = events.filter((e) => e.type === 'down' || e.type === 'up');
const delays = keyEvents.filter((e) => typeof e.delay === 'number').map((e) => e.delay);
const tsSteps = new Set();
for (let i = 1; i < keyEvents.length; i++) {
  const d = keyEvents[i].t - keyEvents[i - 1].t;
  if (d !== 0) tsSteps.add(Math.round(d));
}
out.push('## event.timeStamp (probe clock problem)');
out.push(`handler − timeStamp: ${dist(delays)}`);
out.push(
  `distinct non-zero timeStamp steps between key events (ms): ${[...tsSteps].sort((a, b) => a - b).slice(0, 12).join(', ')}${tsSteps.size > 12 ? ' …' : ''}`,
);
out.push('⇒ timeStamp advances in whole seconds; never use it for timing on Tizen 5.5.');
out.push('');

// ------------------------------------------------------------------ holds, repeats, taps
const down = new Map(); // code → { start, repeats: [], name }
const holds = [];
const bounces = [];
const lastUpAt = new Map();
let maxHeld = 0;
const otherKeyDuringArrowHold = [];
for (const e of keyEvents) {
  const t = at(e);
  if (e.type === 'down') {
    const h = down.get(e.code);
    if (h) {
      h.repeats.push({ t, flag: e.repeat });
      continue;
    }
    const lu = lastUpAt.get(e.code);
    if (lu !== undefined && t - lu < 60) bounces.push({ name: e.name, gap: t - lu });
    for (const [code, other] of down) {
      if (ARROWS.has(code)) otherKeyDuringArrowHold.push(`${e.name} while ${other.name} held`);
    }
    down.set(e.code, { start: t, repeats: [], name: e.name, code: e.code });
    maxHeld = Math.max(maxHeld, down.size);
  } else {
    const h = down.get(e.code);
    if (!h) continue;
    down.delete(e.code);
    lastUpAt.set(e.code, t);
    holds.push({ ...h, end: t });
  }
}

out.push('## Keys seen');
for (const k of last.stats.seenKeys) out.push(`  ${k.name}(${k.code}) downs ${k.downs} ups ${k.ups} non-press downs ${k.repeats}`);
out.push('');

const releaseOnly = holds.filter((h) => h.end - h.start < 15 && h.repeats.length === 0);
const releaseOnlyNames = new Map();
for (const h of releaseOnly) releaseOnlyNames.set(h.name, (releaseOnlyNames.get(h.name) ?? 0) + 1);
const normalTaps = holds.filter((h) => h.repeats.length === 0 && h.end - h.start >= 15);
out.push('## Press / release');
out.push(
  `release-only keys (keydown+keyup < 15 ms apart, i.e. sent on release): ${[...releaseOnlyNames].map(([n, c]) => `${n} ×${c}`).join(', ') || 'none'}`,
);
const tapKeys = new Set(normalTaps.map((h) => h.name));
out.push(`taps (no repeat) on keys with a real down/up: ${[...tapKeys].join(', ')}`);
out.push(`  tap duration (down → up, ms): ${dist(normalTaps.map((h) => h.end - h.start))}`);
const okTaps = normalTaps.filter((h) => h.code === 13).sort((a, b) => a.start - b.start);
const okCycle = [];
for (let i = 1; i < okTaps.length; i++) {
  const gap = okTaps[i].start - okTaps[i - 1].start;
  if (gap < 600) okCycle.push(gap);
}
if (okCycle.length) out.push(`  OK re-tap (press → next press within 600 ms): ${dist(okCycle)}`);
out.push('');

const repeatHolds = holds.filter((h) => h.repeats.length > 0);
const firstDelay = repeatHolds.map((h) => h.repeats[0].t - h.start);
const intervals = [];
const releaseLag = [];
let flagged = 0;
let flagless = 0;
for (const h of repeatHolds) {
  for (let i = 0; i < h.repeats.length; i++) {
    if (h.repeats[i].flag) flagged++;
    else flagless++;
    if (i > 0) intervals.push(h.repeats[i].t - h.repeats[i - 1].t);
  }
  releaseLag.push(h.end - h.repeats[h.repeats.length - 1].t);
}
out.push('## Held keys (auto-repeat)');
out.push(`holds with repeats: ${repeatHolds.length} (${repeatHolds.map((h) => `${h.name} ${(h.end - h.start).toFixed(0)} ms`).join(', ')})`);
out.push(`repeat events: ${flagged} with repeat=true, ${flagless} with repeat=false (keydown without the flag)`);
out.push(`first repeat after press (ms): ${dist(firstDelay)}`);
out.push(`repeat interval (ms): ${dist(intervals)}`);
out.push(`keyup after the last repeat (ms): ${dist(releaseLag)}`);
out.push(
  `bounces (keyup → keydown of the same key < 60 ms): ${bounces.length}${bounces.length ? ' — ' + bounces.map((b) => `${b.name} ${r1(b.gap)}`).join(', ') : ''}`,
);
out.push(`max keys down at once: ${maxHeld}`);
out.push(
  `new keydowns while an arrow was held: ${otherKeyDuringArrowHold.length}${otherKeyDuringArrowHold.length ? ' — ' + otherKeyDuringArrowHold.join('; ') : ' (a second arrow / OK pressed during a hold never arrived)'}`,
);
const gaps = [];
for (const h of repeatHolds) {
  for (let i = 1; i < h.repeats.length; i++) {
    const g = h.repeats[i].t - h.repeats[i - 1].t;
    if (g > 200) gaps.push(`${h.name} ${r1(g)} ms`);
  }
}
out.push(`gaps > 200 ms inside a hold's repeat stream: ${gaps.length ? gaps.join(', ') : 'none'}`);
out.push('');

// ------------------------------------------------------------------ gamepads & lifecycle
const padEvents = events.filter((e) => e.type === 'gamepad');
if (padEvents.length) {
  out.push('## Gamepads');
  const buttons = new Set();
  const axes = new Set();
  const held = new Set();
  let dpadDiagonals = 0;
  for (const e of padEvents) {
    const m = e.text.match(PAD_EDGE);
    if (!m) {
      out.push(`  ${e.text}`);
      continue;
    }
    const n = Number(m[3]);
    if (m[2] === 'b') {
      buttons.add(n);
      if (m[4] === 'down') {
        if (n >= 12 && n <= 15 && [...held].some((x) => x >= 12 && x <= 15)) dpadDiagonals++;
        held.add(n);
      } else held.delete(n);
    } else axes.add(`a${n} ${m[4]}`);
  }
  out.push(`  buttons seen: ${[...buttons].sort((a, b) => a - b).join(', ')}`);
  out.push(`  axis zones seen: ${[...axes].sort().join(', ')}`);
  out.push(`  D-pad presses while another D-pad direction was held (diagonals): ${dpadDiagonals}`);
  for (const g of last.stats.gamepads ?? []) {
    out.push(`  final: #${g.index} ${g.id} mapping=${g.mapping} buttons ${g.buttons} axes ${g.axes} presses ${g.presses}`);
  }
  out.push('');
}

const lifecycle = events.filter((e) => e.type === 'info' && /blur|focus|visibility|gamepad(dis)?connected|reset/.test(e.text));
out.push('## Lifecycle & info');
for (const e of lifecycle) out.push(`  ${r1(at(e)).padStart(9)} ${e.text}`);
out.push(`  visibilitychange seen: ${lifecycle.some((e) => /visibilitychange/.test(e.text)) ? 'yes' : 'no'}`);
out.push('');

// ------------------------------------------------------------------ frames
out.push('## Frames (requestAnimationFrame)');
const f = last.stats.frames;
out.push(
  `last 600 deltas: median ${r1(f.medianMs)} ms (${r1(f.medianHz)} Hz) · p95 ${r1(f.p95Ms)} · max ${r1(f.maxMs)} · worst since reset ${r1(f.worstMs)}`,
);
out.push(
  `since the last reset: ${f.frames} frames, ${f.hitches} deltas > 20 ms (${((f.hitches / Math.max(1, f.frames)) * 100).toFixed(1)} %), pauses ${f.pauses}`,
);
// Average rate from the report timestamps, over the stretch after the last stats reset.
let resetIdx = 0;
for (let i = 1; i < payloads.length; i++) {
  if (payloads[i].stats.frames.frames < payloads[i - 1].stats.frames.frames) resetIdx = i;
}
const w0 = payloads[resetIdx];
const seconds = (last.sentAt - w0.sentAt) / 1000;
if (seconds > 10) {
  out.push(
    `average delivered frame rate over ${seconds.toFixed(0)} s: ${((last.stats.frames.frames - w0.stats.frames.frames) / seconds).toFixed(2)} fps (from report timestamps)`,
  );
}
out.push('');

// ------------------------------------------------------------------ timeline
if (withTimeline) {
  out.push('## Timeline (handler clock; repeats folded)');
  let prev = null;
  let folded = 0;
  for (const e of events) {
    const t = at(e);
    if (e.type === 'down' && e.kind !== 'press') {
      folded++;
      continue;
    }
    if (folded) {
      out.push(`${''.padStart(9)} … ${folded} repeat keydowns`);
      folded = 0;
    }
    const d = prev == null ? '' : '+' + r1(t - prev);
    if (e.type === 'down' || e.type === 'up') {
      out.push(`${r1(t).padStart(9)} ${d.padStart(9)} ${e.type.toUpperCase().padEnd(4)} ${e.name}(${e.code})`);
      prev = t;
    } else out.push(`${r1(t).padStart(9)} ${''.padStart(9)} ${e.type} ${e.text}`);
  }
}

console.log(out.join('\n'));
