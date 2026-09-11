/**
 * Integration tests on real build output (`vite build` into temp dirs):
 *
 * 1. dist/ shape — classic IIFE `app.js` that parses as ES2018 with acorn, rewritten `index.html`, widget files,
 *    `check:compat` passes, no post-Chromium-69 APIs.
 * 2. The shipped bundle end-to-end in a headless fake browser / Tizen runtime (see helpers/browserHarness.ts),
 *    including a realm stripped down to Chromium 69 builtins without `globalThis`.
 * 3. A reporting build (VITE_REPORT_URL) talking to the real log server.
 */

import { readFileSync, readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { join } from 'node:path';

import { parse, type Node as AcornNode } from 'acorn';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLogServer, validatePayload } from '../server/log-server.mjs';
import { BrowserHarness, TIZEN55_UA } from './helpers/browserHarness';
import { buildProbe, type BuiltProbe } from './helpers/build';
import { FakeXhr } from './helpers/fakeXhr';
import { PROJECT_ROOT, runNode, tempDir } from './helpers/project';

const REPORT_URL = 'http://10.0.0.5:8787';

/** Minimal ESTree node shape for walking acorn output. */
type AstNode = { type: string; start: number; end: number } & Record<string, unknown>;

/** Visits every node of an acorn AST. */
function walk(node: unknown, visit: (n: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const c of node) walk(c, visit);
    return;
  }
  if (node === null || typeof node !== 'object' || typeof (node as AstNode).type !== 'string') return;
  visit(node as AstNode);
  for (const [k, v] of Object.entries(node)) if (k !== 'type' && v !== null && typeof v === 'object') walk(v, visit);
}

let plain: BuiltProbe;
let reporting: BuiltProbe;

beforeAll(async () => {
  plain = await buildProbe(join(tempDir('probe-build-'), 'dist'));
  reporting = await buildProbe(join(tempDir('probe-build-report-'), 'dist'), REPORT_URL);
});

// ================================================================================================ dist/ shape

describe('build output', () => {
  it('contains exactly the widget files', () => {
    expect(readdirSync(plain.dir).sort()).toEqual(['app.css', 'app.js', 'config.xml', 'icon.png', 'index.html']);
  });

  it('copies config.xml and icon.png unchanged from public/', () => {
    for (const f of ['config.xml', 'icon.png']) {
      expect(readFileSync(join(plain.dir, f)).equals(readFileSync(join(PROJECT_ROOT, 'public', f))), f).toBe(true);
    }
  });

  it('index.html loads app.js once as a classic deferred script, after webapis.js', () => {
    const scripts = plain.html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toEqual(['<script  src="$WEBAPIS/webapis/webapis.js">', '<script defer src="./app.js">']);
    expect(plain.html).not.toMatch(/type\s*=\s*["']module["']/);
    expect(plain.html).not.toContain('crossorigin');
    expect(plain.html).not.toContain('modulepreload');
    expect(plain.html).not.toContain('/src/main.ts');
  });

  it('uses only relative URLs (base "./")', () => {
    const urls = [...plain.html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1] as string);
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const u of urls) expect(u.startsWith('./') || u.startsWith('$WEBAPIS/'), u).toBe(true);
    expect(plain.html).toContain('<link rel="stylesheet" href="./app.css">');
  });

  it('app.js parses with acorn as an ECMAScript 2018 classic script', () => {
    expect(() => parse(plain.appJs, { ecmaVersion: 2018, sourceType: 'script' })).not.toThrow();
    expect(() => parse(reporting.appJs, { ecmaVersion: 2018, sourceType: 'script' })).not.toThrow();
  });

  it('app.js is a single IIFE that leaks no globals', () => {
    const ast = parse(plain.appJs, { ecmaVersion: 2018, sourceType: 'script' }) as AcornNode & { body: AcornNode[] };
    expect(ast.body).toHaveLength(1);
    const stmt = ast.body[0] as AcornNode & { expression?: AcornNode & { callee?: AcornNode } };
    expect(stmt.type).toBe('ExpressionStatement');
    expect(stmt.expression?.type).toBe('CallExpression');
    expect(['FunctionExpression', 'ArrowFunctionExpression']).toContain(stmt.expression?.callee?.type);
  });

  it('app.js has no module syntax, source maps or Node-isms', () => {
    expect(plain.appJs).not.toMatch(/\bimport\.meta\b/);
    expect(plain.appJs).not.toContain('sourceMappingURL');
    expect(plain.appJs).not.toMatch(/\brequire\(/);
    expect(plain.appJs).not.toMatch(/\bprocess\.env\b/);
  });

  it('app.js uses no runtime APIs newer than Chromium 69 (static scan)', () => {
    const banned = [
      /\.replaceAll\(/,
      /\.matchAll\(/,
      /\.at\(/,
      /\.findLast(Index)?\(/,
      /Object\.fromEntries/,
      /Object\.hasOwn\b/,
      /Promise\.(allSettled|any)\b/,
      /\bstructuredClone\b/,
      /\bqueueMicrotask\b/,
      /\bWeakRef\b/,
      /\bAggregateError\b/,
    ];
    for (const re of banned) expect(plain.appJs, String(re)).not.toMatch(re);
  });

  it('uses the globalThis identifier only in the polyfill, which runs first', () => {
    const ast = parse(plain.appJs, { ecmaVersion: 2018, sourceType: 'script' }) as unknown as AstNode;
    const uses: number[] = [];
    walk(ast, (n) => {
      if (n.type === 'Identifier' && n['name'] === 'globalThis') uses.push(n.start);
    });
    expect(uses.length).toBeGreaterThan(0);
    // The IIFE body's first statement is the polyfill guard (polyfills.ts is imported first by main.ts).
    const iife = ((ast['body'] as AstNode[])[0] as AstNode)['expression'] as AstNode;
    const first = (((iife['callee'] as AstNode)['body'] as AstNode)['body'] as AstNode[])[0] as AstNode;
    expect(first.type).toBe('IfStatement');
    expect(plain.appJs.slice(first.start, first.end)).toContain('typeof globalThis');
    for (const at of uses) expect(at >= first.start && at < first.end, 'globalThis at ' + at).toBe(true);
  });

  it('stays small (no accidental dependency bundling)', () => {
    expect(Buffer.byteLength(plain.appJs)).toBeLessThan(64 * 1024);
  });

  it('bakes VITE_REPORT_URL in only when set', () => {
    expect(reporting.appJs).toContain(REPORT_URL);
    expect(plain.appJs).not.toContain(REPORT_URL);
    expect(plain.appJs).not.toContain('import.meta.env');
  });

  it('passes scripts/check-compat.mjs', () => {
    const r = runNode(join(PROJECT_ROOT, 'scripts', 'check-compat.mjs'), [plain.dir]);
    expect(r.all).toContain('check:compat passed');
    expect(r.status).toBe(0);
  });
});

// ================================================================================================ bundle e2e

const { Enter, Left, Up, Right, Down, Back, R, PlayPause } = {
  Enter: 13,
  Left: 37,
  Up: 38,
  Right: 39,
  Down: 40,
  Back: 10009,
  R: 82,
  PlayPause: 10252,
};

interface FakeTizen {
  tizen: unknown;
  webapis: unknown;
  registered: string[];
  exits: () => number;
}

function fakeTizen(): FakeTizen {
  const registered: string[] = [];
  let exits = 0;
  const supported = [
    { name: 'ColorF0Red', code: 403 },
    { name: 'MediaPlayPause', code: PlayPause },
    { name: 'ChannelUp', code: 427 },
    { name: 'VolumeUp', code: 447 },
    { name: 'Exit', code: 10182 },
    { name: 'Tools', code: 10135 },
  ];
  return {
    registered,
    exits: () => exits,
    tizen: {
      tvinputdevice: {
        getSupportedKeys: () => supported,
        getKey: () => null,
        unregisterKey: () => undefined,
        registerKey: (name: string) => {
          if (name === 'VolumeUp') throw { name: 'InvalidValuesError', message: 'volume keys are reserved' };
          registered.push(name);
        },
      },
      application: {
        getCurrentApplication: () => ({
          exit: () => void exits++,
          hide: () => undefined,
          appInfo: { id: 'ShmpCpIPrb.InputProbe', version: '0.1.0', name: 'InputProbe' },
        }),
      },
      systeminfo: { getCapability: () => '5.5' },
    },
    webapis: {
      productinfo: {
        getModel: () => 'LS43AM702U',
        getModelCode: () => '21_KANTSU2E_ST',
        getFirmware: () => {
          throw { name: 'SecurityError', message: 'denied' };
        },
      },
    },
  };
}

function desktop(): BrowserHarness {
  return new BrowserHarness({
    appJs: plain.appJs,
    indexHtml: plain.html,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  }).start();
}

describe('bundle in a desktop browser (no Tizen)', () => {
  it('starts, lays out the stage and fills every panel', () => {
    const h = desktop();
    expect(h.elements.get('stage')?.style).toEqual({ transform: 'scale(1)', left: '0px', top: '0px' });
    expect(h.panel('log')).toContain('no tizen global — desktop browser mode');
    expect(h.panel('log')).toMatch(/input probe started · session ip-[a-z0-9]+-[a-z0-9]{4}/);
    expect(h.panel('report')).toBe('report: off (build with VITE_REPORT_URL)');
    expect(h.panel('keys')).toBe('(no tizen.tvinputdevice — desktop browser)');
    expect(h.panel('pads')).toContain('(none');
    expect(h.panel('seen')).toBe('(no keys yet)');
    expect(h.panel('checklist').split('\n')).toHaveLength(8);
    expect(h.panel('verdicts')).toContain('Diagonals ..... not tested');
    expect(h.panel('headline')).toBe('');
    h.frames(20); // env is probed 250 ms after start
    expect(h.panel('env')).toContain('Chrome 139');
    expect(h.panel('headline')).toMatch(/^Chrome 139 · Tizen — · 1920×1080@1 · WebGL2 no · session ip-/);
    expect(h.logs.some((l) => l.startsWith('[probe] ') && l.includes('environment collected (startup)'))).toBe(true);
  });

  it('prevents default only for arrows/Enter/Back/Space, never for shortcuts', () => {
    const h = desktop();
    expect(h.down(Right).defaultPrevented).toBe(true);
    expect(h.down(Enter).defaultPrevented).toBe(true);
    expect(h.down(32, { key: ' ' }).defaultPrevented).toBe(true);
    expect(h.down(65, { key: 'a' }).defaultPrevented).toBe(false);
    expect(h.down(R, { key: 'r', ctrl: true }).defaultPrevented).toBe(false);
    expect(h.down(116, { key: 'F5' }).defaultPrevented).toBe(false);
    expect(h.up(Right).defaultPrevented).toBe(true);
  });

  it('logs key events on screen and to the console, with DOM key names for unknown codes', () => {
    const h = desktop();
    h.frames(2);
    h.down(65, { key: 'a' });
    h.frames(1);
    h.up(65, { key: 'a' });
    h.frames(6);
    expect(h.panel('log')).toMatch(/DOWN A\(65\) +repeat=0 press/);
    expect(h.panel('log')).toMatch(/UP {3}A\(65\) +held=17ms/);
    expect(h.logs.filter((l) => l.includes('A(65)'))).toHaveLength(2);
    expect(h.panel('seen')).toBe('A(65) 1/1/0');
  });

  it('measures clean key repeat, the long hold and dispatch delay through the real event path', () => {
    const h = desktop();
    h.frames(20);
    h.hold(Right, 2000);
    h.frames(10);
    const v = h.panel('verdicts');
    expect(v).toContain('Repeat style .. clean (repeat flag)');
    expect(v).toMatch(/Repeat timing \. delay 50\d ms · every 5\d\.\d ms/);
    expect(v).toMatch(/longest 20\d\d ms \(ArrowRight\)/);
    expect(v).toContain('Dispatch ...... avg 2.00 ms · max 2.00 ms');
    expect(v).toMatch(/Frames ........ 16\.67 ms ⇒ 60\.0 Hz/);
    expect(h.panel('checklist')).toContain('[x] Held a key ≥ 1.5 s');
    expect(h.panel('log')).toContain('checklist ✓ Held a key ≥ 1.5 s');
  });

  it('keyboard R resets the hold/repeat stats (verdicts are kept)', () => {
    const h = desktop();
    h.hold(Right, 1000);
    h.down(Right);
    h.frames(2);
    h.down(Up);
    h.frames(10);
    h.up(Up);
    h.up(Right);
    h.frames(10);
    expect(h.panel('verdicts')).toContain('Repeat style .. clean');
    h.down(R, { key: 'r' });
    h.up(R, { key: 'r' });
    h.frames(10);
    expect(h.panel('log')).toContain('hold/repeat/frame stats reset');
    const v = h.panel('verdicts');
    expect(v).toContain('Repeat style .. not observed');
    expect(v).toContain('Diagonals ..... YES');
  });

  it('flashes the latency box white for exactly 4 frames per non-repeat keydown', () => {
    const h = desktop();
    h.frames(3);
    expect(h.flashFill()).toBe('#1a2754');
    h.down(Enter);
    const fills: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      h.frames(1);
      fills.push(h.flashFill());
    }
    expect(fills).toEqual(['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#1a2754', '#1a2754']);
    h.down(Enter, { repeat: true }); // auto-repeat does not flash
    h.frames(1);
    expect(h.flashFill()).toBe('#1a2754');
    const label = [...h.draw].reverse().find((c) => c.op === 'fillText' && c.args[1] === 590 && c.args[2] === 632);
    expect(label?.args[0]).toBe('Enter');
  });

  it('moves the three ships: raw and debounced lanes per frame, naive lane per keydown', () => {
    const h = desktop();
    h.frames(1);
    // Ships are the first three paths of a frame (the frame-time graph path follows them).
    const shipTips = (): number[] => {
      let start = 0;
      h.draw.forEach((c, i) => {
        if (c.op === 'fillRect' && c.args[0] === 0 && c.args[1] === 0 && c.args[3] === 726) start = i;
      });
      return h.draw.slice(start).filter((c) => c.op === 'moveTo').slice(0, 3).map((c) => c.args[0] as number);
    };
    const before = shipTips();
    h.down(Right);
    h.frames(10);
    const after = shipTips();
    expect(after[0]! - before[0]!).toBe(40); // raw: 4 px × 10 frames
    expect(after[1]! - before[1]!).toBe(40); // debounced
    expect(after[2]! - before[2]!).toBe(12); // naive: one keydown
  });

  it('blur clears held keys; hidden → visible ticks "left and returned"', () => {
    const h = desktop();
    h.down(Left);
    h.frames(2);
    h.fire('window', 'blur');
    h.frames(7); // panels refresh at ~10 Hz
    expect(h.panel('log')).toContain('blur — cleared held keys');
    h.setHidden(true);
    h.frames(1);
    h.setHidden(false);
    h.fire('window', 'focus');
    h.frames(8);
    const log = h.panel('log');
    expect(log).toContain('visibilitychange → hidden');
    expect(log).toContain('visibilitychange → visible');
    expect(log).toContain('focus');
    expect(h.panel('checklist')).toContain('[x] Left (Home) and returned');
    // a keyup arriving after blur is reported as stray
    h.up(Left);
    h.frames(6);
    expect(h.panel('log')).toMatch(/UP {3}ArrowLeft\(37\) +held=stray/);
  });

  it('Back ×3 outside Tizen logs that exit() is unavailable', () => {
    const h = desktop();
    for (let i = 0; i < 3; i++) {
      h.down(Back);
      h.frames(5);
      h.up(Back);
      h.frames(8); // > 60 ms between taps (closer re-presses are merged as bounces)
    }
    h.frames(6);
    expect(h.panel('log')).toContain('Back ×3 — exiting');
    expect(h.panel('log')).toContain('exit() unavailable (not on Tizen)');
  });

  it('polls gamepads, edge-logs buttons/axes and lists pads', () => {
    let pads: unknown[] = [null, null, null, null];
    const h = new BrowserHarness({ appJs: plain.appJs, indexHtml: plain.html, gamepads: () => pads }).start();
    h.frames(5);
    const btn = (pressed: boolean): { pressed: boolean; value: number } => ({ pressed, value: pressed ? 1 : 0 });
    pads = [
      { index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', mapping: 'standard', connected: true, buttons: [btn(true), btn(false)], axes: [0, 0.9] },
      null,
      null,
      null,
    ];
    h.fire('window', 'gamepadconnected', { gamepad: pads[0] });
    h.frames(40); // idle polling runs every 30 frames until a pad is seen
    const log = h.panel('log');
    expect(log).toContain('gamepadconnected #0 "Wireless Controller');
    expect(log).toContain('GP  GP0 connected id="Wireless Controller');
    expect(log).toContain('GP  GP0 b0 down');
    expect(log).toContain('GP  GP0 a1 +1');
    expect(h.panel('pads')).toContain('buttons[2] pressed: 0  axes: 0.00 0.90');
    expect(h.panel('checklist')).toContain('[x] Gamepad seen');
    pads = [null, null, null, null];
    h.fire('window', 'gamepaddisconnected', { gamepad: { index: 0 } });
    h.frames(8);
    expect(h.panel('log')).toContain('GP  GP0 disconnected');
    expect(h.panel('pads')).toContain('GP0 (disconnected)');
  });
});

describe('bundle on (fake) Tizen 5.5 in a Chromium-69-only realm', () => {
  function tizenRun(): { h: BrowserHarness; tz: FakeTizen } {
    const tz = fakeTizen();
    const h = new BrowserHarness({
      appJs: plain.appJs,
      indexHtml: plain.html,
      userAgent: TIZEN55_UA,
      tizen: tz.tizen,
      webapis: tz.webapis,
      chrome69: true,
      webgl: true,
    }).start();
    return { h, tz };
  }

  it('the realm really lacks globalThis and post-69 builtins; the polyfill fills in globalThis', () => {
    const { h } = tizenRun();
    expect(h.global('__globalThisPolyfilled')).toBe(true);
    expect(h.evaluate('typeof Object.fromEntries + "," + typeof "".replaceAll + "," + typeof [].at')).toBe(
      'undefined,undefined,undefined',
    );
    expect(h.evaluate('globalThis === window')).toBe(true);
  });

  it('registers every supported key except Exit and reports per-key results', () => {
    const { h, tz } = tizenRun();
    expect(tz.registered).toEqual(['ColorF0Red', 'MediaPlayPause', 'ChannelUp', 'Tools']);
    h.frames(8);
    expect(h.panel('keys').split('\n')).toEqual([
      'supported 6 · registered 4 · failed 1 (Exit skipped)',
      'ok: ColorF0Red MediaPlayPause ChannelUp Tools',
      'FAIL VolumeUp(447): InvalidValuesError: volume keys are reserved',
    ]);
    expect(h.panel('log')).toContain('supported keys: 6, registered 4/5, failed: VolumeUp');
  });

  it('shows the environment of the target device (Chromium 69 parsed from the Tizen UA)', () => {
    const { h } = tizenRun();
    h.frames(20);
    const env = h.panel('env');
    expect(env).toContain('Chrome 69 · Tizen 5.5 · tizen=yes webapis=yes');
    expect(env).toContain('Model LS43AM702U (21_KANTSU2E_ST) · FW — · app 0.1.0');
    expect(env).toContain('WebGL1: yes  MAX_TEXTURE_SIZE=8192  WebGL 1.0');
    expect(env).toContain('GPU: Mali-G52 MC1 / ARM');
    expect(env).toContain('native globalThis no');
    expect(env).toContain('Audio sampleRate 48000 · baseLatency 21.3 ms · cores 4');
    expect(env).toContain('probe errors: getFirmware: [object Object]');
    expect(h.panel('headline')).toMatch(/^Chrome 69 · Tizen 5\.5 · 1920×1080@1 · WebGL2 no · LS43AM702U · session /);
  });

  it('prevents default for every key except F-keys and modifier shortcuts', () => {
    const { h } = tizenRun();
    expect(h.down(427).defaultPrevented).toBe(true);
    expect(h.down(65).defaultPrevented).toBe(true);
    expect(h.down(123).defaultPrevented).toBe(false);
    expect(h.down(73, { ctrl: true }).defaultPrevented).toBe(false);
  });

  it('uses Tizen key names in the log and seen-keys table', () => {
    const { h } = tizenRun();
    h.down(403);
    h.frames(1);
    h.up(403);
    h.down(427);
    h.frames(1);
    h.up(427);
    h.frames(6);
    expect(h.panel('log')).toContain('DOWN ColorF0Red(403)');
    expect(h.panel('seen')).toMatch(/^ColorF0Red\(403\) 1\/1\/0 +ChannelUp\(427\) 1\/1\/0$/);
    expect(h.panel('checklist')).toContain('[x] Pressed an extra key');
  });

  it('runs the on-device protocol and reaches the expected verdicts', () => {
    const { h } = tizenRun();
    h.frames(20);
    // 1. tap every arrow, OK and Back
    for (const k of [Left, Up, Right, Down, Enter, Back]) {
      h.down(k);
      h.frames(5);
      h.up(k);
      h.frames(5);
    }
    // 2. hold → for 3 s
    h.hold(Right, 3000);
    h.frames(10);
    // 3. diagonal: hold →, then also ↑
    h.down(Right);
    h.frames(20);
    h.down(Up);
    h.frames(20);
    h.up(Up);
    h.up(Right);
    h.frames(10);
    // 4. chord: hold →, then tap OK
    h.down(Right);
    h.frames(20);
    h.down(Enter);
    h.frames(3);
    h.up(Enter);
    h.frames(20);
    h.up(Right);
    h.frames(10);
    // 5. an extra key
    h.down(PlayPause);
    h.up(PlayPause);
    h.frames(10);
    // 8. Home and back
    h.setHidden(true);
    h.setHidden(false);
    h.frames(10);

    const v = h.panel('verdicts');
    expect(v).toContain('Diagonals ..... YES  (1 together, 0 replaced)');
    expect(v).toContain('OK+arrow ...... arrow kept');
    const checklist = h.panel('checklist').split('\n');
    expect(checklist.filter((l) => l.startsWith('[x]'))).toHaveLength(7);
    expect(checklist).toContain('[ ] Gamepad seen');
    expect(h.panel('log')).toContain('hold/repeat/frame stats reset'); // Play/Pause
  });

  it('detects fake keyup/keydown pairs as the repeat style', () => {
    const { h } = tizenRun();
    h.frames(5);
    h.down(Right);
    h.frames(30);
    for (let i = 0; i < 10; i++) {
      h.up(Right);
      h.advance(10);
      h.down(Right); // re-press 10 ms after the keyup, no repeat flag
      h.frames(3);
    }
    h.up(Right);
    h.frames(10);
    const v = h.panel('verdicts');
    expect(v).toContain('Repeat style .. fake keyup/keydown pairs');
    expect(v).toContain('Bounces <60ms . 10 · min gap 10.0 ms · avg 10.0 ms');
    expect(h.panel('log')).toContain('BOUNCE');
  });

  it('Back ×3 within 1.5 s calls tizen.application.getCurrentApplication().exit()', () => {
    const { h, tz } = tizenRun();
    h.frames(2);
    for (let i = 0; i < 2; i++) {
      h.down(Back);
      h.up(Back);
      h.frames(20);
    }
    expect(tz.exits()).toBe(0);
    h.down(Back);
    expect(tz.exits()).toBe(1);
    h.frames(6);
    expect(h.panel('log')).toContain('Back ×3 — exiting');
    expect(h.panel('log')).not.toContain('exit() unavailable');
  });

  it('Back presses spread over more than 1.5 s do not exit', () => {
    const { h, tz } = tizenRun();
    for (let i = 0; i < 3; i++) {
      h.down(Back);
      h.up(Back);
      h.frames(50); // ~833 ms apart
    }
    expect(tz.exits()).toBe(0);
  });
});

// ================================================================================================ reporting

describe('reporting build (VITE_REPORT_URL) → log server', () => {
  let server: Server;
  let base: string;
  let logDir: string;

  beforeAll(async () => {
    logDir = join(tempDir('probe-e2e-logs-'), 'logs');
    server = createLogServer({ logDir, log: () => undefined });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  function reportingRun(): BrowserHarness {
    FakeXhr.reset();
    return new BrowserHarness({ appJs: reporting.appJs, indexHtml: reporting.html, XMLHttpRequest: FakeXhr }).start();
  }

  it('POSTs text/plain JSON payloads every 3 s, one request in flight', () => {
    const h = reportingRun();
    h.frames(1); // first frame sends immediately
    expect(FakeXhr.instances).toHaveLength(1);
    const x = FakeXhr.last;
    expect(x.method).toBe('POST');
    expect(x.url).toBe(REPORT_URL + '/report');
    expect(x.headers['Content-Type']).toBe('text/plain;charset=UTF-8');
    const p = x.json<{ session: string; seq: number; newEvents: Array<{ text?: string }> }>();
    expect(validatePayload(p)).toBeNull();
    expect(p.seq).toBe(1);
    expect(p.newEvents.map((e) => e.text)).toContain('no tizen global — desktop browser mode (keyboard R = reset stats)');
    h.frames(200); // 3.3 s, but the first request is still in flight
    expect(FakeXhr.instances).toHaveLength(1);
    x.respond(200);
    h.frames(200);
    expect(FakeXhr.instances).toHaveLength(2);
    expect(FakeXhr.last.json<{ seq: number }>().seq).toBe(2);
    expect(h.panel('report')).toMatch(/^report → http:\/\/10\.0\.0\.5:8787\/report · #1 ok [\d.]+ s ago · sending…$/);
  });

  it('re-sends events after a failed request and shows the error', () => {
    const h = reportingRun();
    h.frames(1);
    h.down(Right);
    h.up(Right);
    FakeXhr.last.failNetwork();
    h.frames(200);
    const p = FakeXhr.last.json<{ seq: number; newEvents: Array<{ type: string; code?: number }> }>();
    expect(p.seq).toBe(2);
    expect(p.newEvents.filter((e) => e.code === Right).map((e) => e.type)).toEqual(['down', 'up']);
    expect(h.panel('report')).toContain('error: network error (1)');
  });

  it('payloads captured from the bundle are accepted and stored by the real log server', async () => {
    const h = reportingRun();
    h.frames(20);
    FakeXhr.last.respond(200);
    h.hold(Right, 700);
    h.frames(200);
    const bodies = FakeXhr.instances.map((x) => x.body as string);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) {
      const res = await fetch(base + '/report', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body });
      expect(res.status).toBe(200);
    }
    const session = (JSON.parse(bodies[0] as string) as { session: string }).session;
    const rows = readFileSync(join(logDir, session + '.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(rows.map((r) => r['seq'])).toEqual(bodies.map((_b, i) => i + 1));
    const last = rows[rows.length - 1] as { env: { chromeVersion: number } | null; verdicts: { repeatStyle: string }; stats: { seenKeys: unknown[] } };
    expect(last.verdicts.repeatStyle).toBe('clean (repeat flag)');
    expect(last.env?.chromeVersion).toBe(69);
    expect(last.stats.seenKeys).toEqual([{ name: 'ArrowRight', code: Right, downs: 5, ups: 1, repeats: 4 }]);
  });
});
