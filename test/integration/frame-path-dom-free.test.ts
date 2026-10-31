/**
 * The frame-path DOM-free law (tizen_optimize.md §8.5 — plan v20x P1-7).
 *
 * The measured law (the 2026-10-27 DOM-rules and layout-queries lane reports, §8.5): the shipped
 * presentation code reaches the page only at a fixed set of **cold** sites — the boot overlay,
 * the telemetry panel, the web page notice, the instrument surfaces of the audit's own list, the
 * boot-time element lookups and image/video creations — and the per-frame body of the shell's
 * `bootShell.onFrame` touches no DOM at all except through the change-gated, inert
 * `data-shmup-*` attribute mirror that `markCanvas` writes. This file freezes that conclusion as
 * a machine check instead of prose, in the shape of the frame-literal scans
 * (`test/integration/frame-literals-repo.test.ts` and its `ALLOWED` list) and the engine floor
 * (`test/integration/tv-engine-floor.test.ts`).
 *
 * The scan parses every package's `src/` but core's, and every app's `src/` — the trees read from
 * disk, so a package or app added later is covered without editing this file (a new *package*
 * that does not belong under the law goes to {@link NOT_SCANNED} with a reason, and its absence
 * from that list fails the completeness pass). The page-touch family is
 * {@link METHOD_NAMES} — creation and query (`createElement`, `querySelector`, `getElementById`,
 * …), the attribute surface, and node-graph mutation (`appendChild`, `removeChild`, …) — counted
 * where they are **called** (a plain read of a property named `createElement`, like the
 * page-image factory's own option, is not a touch), and {@link FIELD_NAMES} — style / class /
 * text writes, node-graph companions (`parentNode`, `nextSibling`, …) and the document surface
 * (`document`, `navigator`, `documentElement`) however reached, bare or through the injected
 * `win` — counted on **any** access; plus the media element constructors `new Image()` /
 * `new Audio()` as
 * {@link MEDIA_CONSTRUCTORS}. Each hit is attributed to the **symbol path** around it (the
 * names of the declarations containing it, outermost first) — never a line number — and
 * {@link ALLOWED} pins it by file, symbol and API with a count, so an entry that grows (a new
 * touch beside an allowed one), shrinks or dies (a stale entry) fails just as an unlisted one
 * does. Comments are never part of the syntax tree, so a docblock that *names* `getComputedStyle`
 * or quotes an attribute cannot offend — the same immunity the literal scans have.
 *
 * Deliberately **outside** the family, each for a stated reason:
 *
 * - event binding (`addEventListener` / `removeEventListener` / `dispatchEvent`) — the apps'
 *   platform adapters *are* the DOM-side adapters; binding at setup is their design, and §8.5's
 *   law is about page mutation on the frame path, not about wiring (the §2 frame-body walk
 *   classes the three `input-web` setup listeners as "none" for exactly this reason);
 * - the plain names `remove`, `body`, `head`, `children`, `parent` — the domain code has ring
 *   buffer `head`s, option-chain `body`s and pool `.remove(slot)`s (core, `render-pixi`,
 *   `patterns`), so a name rule there would fence game code, not DOM code; the DOM siblings
 *   (`removeChild`, `parentNode`, `appendChild`, …) stay in the family;
 * - `getContext` — the canvas's own drawing surface is what the game exists to use;
 * - viewport metrics (`innerWidth`, `devicePixelRatio`, …) — cheap window reads, allowed cold by
 *   §8.5; the forced-layout half of that surface is law 2's subject
 *   (`test/integration/layout-inquiry.test.ts`) and the allocating `PlatformDisplay` getters are
 *   pinned by their own docblock remark (`packages/core/src/platform/index.ts`);
 * - an indirect reach for any of it (`el['attr' + 'Name']`, aliasing `document` through a second
 *   const) — like the engine-floor scan this is a fence of names, not a semantic analysis. A
 *   string-keyed element access *does* count (`el['setAttribute']`); a computed one does not.
 *
 * Sibling gates, no overlap: `data-shmup-writes.test.ts` pins the *attribute tokens* (a sixth
 * `data-shmup-*` name fails there even though `markCanvas` itself is allowed here);
 * `dep-grep-floor.test.ts` and `tv-engine-floor.test.ts` own the dependency and engine floors.
 *
 * @see tizen_optimize.md §8.5, §9 item 7
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Packages under their own, stronger law — each names what covers it here instead. Core is
 * forbidden DOM *identifiers* outright by the purity lint (`no-restricted-globals`,
 * `test/integration/eslint-rules.test.ts`), and its domain `document` fields (the replay and
 * save documents) and pool `.remove()`s would make a name scan meaningless there.
 */
const NOT_SCANNED: readonly { dir: string; reason: string }[] = [
  {
    dir: 'packages/core',
    reason:
      'platform-agnostic by the purity lint (no DOM globals may even be named) — see the module docblock',
  },
];

/**
 * The DOM methods of the family — counted where they are called (see the module docblock).
 */
const METHOD_NAMES: ReadonlySet<string> = new Set([
  // Creation and query.
  'createElement',
  'createElementNS',
  'createTextNode',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  // The attribute surface (writes, and the reads that belong to the same touch).
  'setAttribute',
  'removeAttribute',
  'toggleAttribute',
  'hasAttribute',
  'getAttribute',
  // Node-graph mutation.
  'appendChild',
  'removeChild',
  'insertBefore',
  'replaceChild',
]);

/**
 * The DOM fields of the family — counted on any access (read or write). Style, class and text;
 * the node-graph companions of the mutation surface; and the document surface, however reached
 * (through an injected `win` or bare). The names absent from both lists are reasoned in the
 * module docblock.
 */
const FIELD_NAMES: ReadonlySet<string> = new Set([
  // Style, class and text.
  'style',
  'classList',
  'className',
  'textContent',
  'innerText',
  'innerHTML',
  'outerHTML',
  // Node-graph companions.
  'parentNode',
  'parentElement',
  'nextSibling',
  'previousSibling',
  'firstChild',
  'lastChild',
  'childNodes',
  // The document surface.
  'documentElement',
  'document',
  'navigator',
]);

/** Every name the scan reads, method or field — for the self-check and the allow-list audit. */
const DOM_NAMES: ReadonlySet<string> = new Set([...METHOD_NAMES, ...FIELD_NAMES]);

/** Media element constructors — `new Image()` / `new Audio()` create HTML elements. */
const MEDIA_CONSTRUCTORS: ReadonlySet<string> = new Set(['Image', 'Audio']);

/** One DOM touch found in a scanned source file. */
interface DomTouch {
  /** File, repo-relative. */
  readonly file: string;
  /** The names of the declarations around it, outermost first, `.`-joined. */
  readonly symbol: string;
  /** The DOM surface reached (`setAttribute`, `style`, `document`, `new Image`, …). */
  readonly api: string;
  /** 1-based line (for the failure message only — entries never match on it). */
  readonly line: number;
}

/** A DOM touch that is allowed at a cold site, and why. */
interface AllowedDomTouch {
  /** File, named as the scan names its hits. */
  readonly file: string;
  /** Symbol path of the touch (see {@link DomTouch.symbol}). */
  readonly symbol: string;
  /** The API the touch reaches. */
  readonly api: string;
  /** How many touches of `api` the symbol holds (default 1). */
  readonly count?: number;
  /** Which cold site it is and why the touch is off every frame path. */
  readonly reason: string;
}

/**
 * The name a declaration adds to a touch's symbol path (the frame-literal scanner's rule, kept
 * as its own copy like every other guard of this family keeps its own helpers).
 *
 * @param node - An ancestor of the touch.
 * @returns Its name, or `null` when it is not a named declaration.
 */
function nameOf(node: ts.Node): string | null {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (
    ts.isVariableDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    const name = node.name;
    if (name === undefined) return null;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  }
  return null;
}

/**
 * The symbol path of a node: the names of the declarations around it, outermost first.
 *
 * @param node - A touch site.
 * @returns The `.`-joined path, or `(top level)`.
 */
function symbolOf(node: ts.Node): string {
  const names: string[] = [];
  for (let n = node.parent; n !== undefined; n = n.parent) {
    const name = nameOf(n);
    if (name !== null) names.push(name);
  }
  return names.length === 0 ? '(top level)' : names.reverse().join('.');
}

/**
 * Whether a scanned file name belongs to this scan (TypeScript sources, declarations excluded —
 * a `.d.ts` cannot hold an access).
 *
 * @param name - A file name.
 * @returns Whether to read it.
 */
function accepted(name: string): boolean {
  return !name.endsWith('.d.ts') && /\.(ts|mts|cts)$/.test(name);
}

/**
 * The trees the scan reads: every package's `src/` but {@link NOT_SCANNED}'s, and every app's
 * `src/`, read from disk so later members join the scan without an edit here.
 *
 * @returns Repo-relative folders, sorted.
 */
function scannedTrees(): string[] {
  const trees: string[] = [];
  for (const parent of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repo, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = `${parent}/${entry.name}`;
      if (NOT_SCANNED.some((x) => x.dir === dir)) continue;
      if (existsSync(join(repo, dir, 'src'))) trees.push(`${dir}/src`);
    }
  }
  return trees.sort();
}

/**
 * Every source file under a folder, recursively.
 *
 * @param root - The folder to walk.
 * @returns Paths relative to `root`, `/`-separated, sorted.
 */
function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (accepted(entry.name))
        out.push(
          path
            .slice(root.length + 1)
            .split(/[\\/]/)
            .join('/'),
        );
    }
  }
  return out.sort();
}

/**
 * Every DOM touch of a source text. Comments are never part of the syntax tree, so a docblock
 * that names an API is not a touch; a string-keyed member access (`el['setAttribute']`) is.
 *
 * @param file - The name reported for the hits.
 * @param text - The TypeScript source.
 * @returns Its touches, in source order.
 */
function scanDomTouches(file: string, text: string): DomTouch[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits: DomTouch[] = [];
  const add = (node: ts.Node, api: string): void => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    hits.push({ file, symbol: symbolOf(node), api, line });
  };
  /** Whether a member access is the callee of a call — the shape a DOM method touch takes. */
  const isCall = (node: ts.AccessExpression): boolean => {
    const parent = node.parent;
    return ts.isCallExpression(parent) && parent.expression === node;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (FIELD_NAMES.has(name)) add(node, name);
      else if (METHOD_NAMES.has(name) && isCall(node)) add(node, name);
    } else if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression;
      if (ts.isStringLiteralLike(key)) {
        if (FIELD_NAMES.has(key.text)) add(node, key.text);
        else if (METHOD_NAMES.has(key.text) && isCall(node)) add(node, key.text);
      }
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      if (MEDIA_CONSTRUCTORS.has(node.expression.text)) add(node, `new ${node.expression.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/**
 * The key an entry and a touch share.
 *
 * @param x - A touch or an entry.
 * @returns `file › symbol = api`.
 */
function domTouchKey(x: {
  readonly file: string;
  readonly symbol: string;
  readonly api: string;
}): string {
  return `${x.file} › ${x.symbol} = ${x.api}`;
}

/**
 * Compares a scan's touches with its allow-list — the frame-literal scanner's rule: an entry
 * whose symbol holds more or fewer touches than its `count` (none included: a stale entry) is a
 * problem, and so is every touch no entry names.
 *
 * @param touches - Every touch of the scan.
 * @param allowed - The allow-list.
 * @param fix - What the message for an unlisted touch tells the reader to do.
 * @returns One line per problem, or an empty array.
 */
function domTouchProblems(
  touches: readonly DomTouch[],
  allowed: readonly AllowedDomTouch[],
  fix: string,
): string[] {
  const found = new Map<string, DomTouch[]>();
  for (const touch of touches) {
    const key = domTouchKey(touch);
    const list = found.get(key);
    if (list === undefined) found.set(key, [touch]);
    else list.push(touch);
  }
  const problems: string[] = [];
  const listed = new Set<string>();
  for (const entry of allowed) {
    const key = domTouchKey(entry);
    listed.add(key);
    const count = entry.count ?? 1;
    const got = found.get(key)?.length ?? 0;
    if (got !== count) {
      problems.push(`${key}: the allow-list expects ${count} touch(es), the source has ${got}`);
    }
  }
  for (const [key, list] of found) {
    if (listed.has(key)) continue;
    for (const touch of list) {
      problems.push(`${key} (line ${touch.line}): a DOM touch — ${fix}`);
    }
  }
  return problems;
}

/**
 * The whole shipped DOM surface at the writing of plan v20x P1-7, one entry per cold site. The
 * reasons name the §8.5 categories: the boot overlay, the telemetry panel, the web page notice,
 * the instrument attributes that `data-shmup-writes.test.ts` pins by token, and the boot-time
 * element lookups and media creations that build those surfaces — every one reached before the
 * frame loop starts (or on a transition the frame body itself only flags).
 */
const ALLOWED: readonly AllowedDomTouch[] = [
  // apps/tizen/src/bench/decode.ts
  {
    file: 'apps/tizen/src/bench/decode.ts',
    symbol: 'createDecodeHost.hasVideoSurface',
    api: 'document',
    reason:
      "TV render bench (the decode scenario's host): video-support probe and element factory, once per scenario — the bench is its own dist-bench/ page (bundle check rule 9), never the game.",
  },
  {
    file: 'apps/tizen/src/bench/decode.ts',
    symbol: 'createDecodeHost.newVideoElement',
    api: 'createElement',
    reason:
      'bench decode scenario: creates its probe <video> element — once per scenario, own page.',
  },
  {
    file: 'apps/tizen/src/bench/decode.ts',
    symbol: 'createDecodeHost.newVideoElement',
    api: 'document',
    count: 2,
    reason:
      "TV render bench (the decode scenario's host): video-support probe and element factory, once per scenario — the bench is its own dist-bench/ page (bundle check rule 9), never the game.",
  },
  {
    file: 'apps/tizen/src/bench/decode.ts',
    symbol: 'createDecodeHost.openVideo.release',
    api: 'removeAttribute',
    reason: "bench decode scenario: drops the probe's src on release — once per decoded video.",
  },
  // apps/tizen/src/bench/host.ts
  {
    file: 'apps/tizen/src/bench/host.ts',
    symbol: 'detectBenchHost.userAgent',
    api: 'navigator',
    reason: 'bench host detection: the UA once when the widget page boots.',
  },
  // apps/tizen/src/bench/main.ts
  {
    file: 'apps/tizen/src/bench/main.ts',
    symbol: 'canvas',
    api: 'getElementById',
    reason: 'bench page boot: its own canvas lookup (dist-bench/, rule 9).',
  },
  // apps/tizen/src/bench/run.ts
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'mark',
    api: 'document',
    reason:
      'bench phase marker: the body handle for the data-shmup-tv-bench state (the token is pinned by data-shmup-writes.test.ts).',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'mark',
    api: 'setAttribute',
    reason:
      'bench phase marker: fires at phase changes only (~7 for a full run), in the bench widget — never in the game.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runHarbPage.envBase.userAgent',
    api: 'navigator',
    reason:
      "bench env snapshot: a navigator read when a scenario's environment row is built (once per scenario, own page).",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runInputPage.doc',
    api: 'document',
    reason: 'bench results machinery: the document handle of its own page (dist-bench/, rule 9).',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runInputPage.host.gamepadPresent.nav',
    api: 'navigator',
    reason:
      "bench env snapshot: a navigator read when a scenario's environment row is built (once per scenario, own page).",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runOnTv.envOf.userAgent',
    api: 'navigator',
    reason:
      "bench env snapshot: a navigator read when a scenario's environment row is built (once per scenario, own page).",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runProbePage.host.createContext.probe',
    api: 'createElement',
    reason:
      "bench results machinery: its own page's <pre>/<canvas> elements, once per scenario or run.",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runProbePage.host.createContext.probe',
    api: 'document',
    reason: 'bench results machinery: the document handle of its own page (dist-bench/, rule 9).',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runProbePage.host.deviceMemoryGiB.nav',
    api: 'navigator',
    reason:
      "bench env snapshot: a navigator read when a scenario's environment row is built (once per scenario, own page).",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'runProbePage.host.hardwareConcurrency.nav',
    api: 'navigator',
    reason:
      "bench env snapshot: a navigator read when a scenario's environment row is built (once per scenario, own page).",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showPageText',
    api: 'appendChild',
    reason:
      'bench results machinery: hangs its <pre> result blocks on its own page, once per scenario/run.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showPageText',
    api: 'createElement',
    reason:
      "bench results machinery: its own page's <pre>/<canvas> elements, once per scenario or run.",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showPageText',
    api: 'setAttribute',
    reason:
      'bench results machinery: marks its own page (tokens pinned by data-shmup-writes.test.ts).',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showPageText',
    api: 'textContent',
    reason:
      'bench results machinery: redraws the whole results text once per run (or on its fallback), never per frame.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showPageText.block',
    api: 'getElementById',
    reason: 'bench results machinery: the lookup of its own pre-made block.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showPageText.doc',
    api: 'document',
    reason: 'bench results machinery: the document handle of its own page (dist-bench/, rule 9).',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showResults',
    api: 'appendChild',
    reason:
      'bench results machinery: hangs its <pre> result blocks on its own page, once per scenario/run.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showResults',
    api: 'document',
    reason: 'bench results machinery: the document handle of its own page (dist-bench/, rule 9).',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showResults',
    api: 'style',
    reason: 'bench results page: the one style write when its results <pre> is created.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showResults.drawFallback',
    api: 'textContent',
    reason:
      'bench results machinery: redraws the whole results text once per run (or on its fallback), never per frame.',
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showResults.pre',
    api: 'createElement',
    reason:
      "bench results machinery: its own page's <pre>/<canvas> elements, once per scenario or run.",
  },
  {
    file: 'apps/tizen/src/bench/run.ts',
    symbol: 'showResults.pre',
    api: 'document',
    reason: 'bench results machinery: the document handle of its own page (dist-bench/, rule 9).',
  },
  // apps/tizen/src/boot/index.ts
  {
    file: 'apps/tizen/src/boot/index.ts',
    symbol: 'bootTizenApp.nav',
    api: 'navigator',
    reason:
      'boot: the gamepad feature probe on navigator, once when the platform adapter is built.',
  },
  {
    file: 'apps/tizen/src/boot/index.ts',
    symbol: 'bootTizenApp.shell.platform.visibility',
    api: 'document',
    reason:
      'boot: the visibility source handed to the platform adapter once (the lifecycle listeners bind at boot).',
  },
  {
    file: 'apps/tizen/src/boot/index.ts',
    symbol: 'describeDevice.collect.userAgent',
    api: 'navigator',
    reason:
      'the debug device line: collected at boot and on debug unlock, then served as the cached string field (the M2-17 lesson) — never a per-frame read.',
  },
  // apps/tizen/src/device-info/index.ts
  {
    file: 'apps/tizen/src/device-info/index.ts',
    symbol: 'loadWebapis.load',
    api: 'appendChild',
    reason:
      'Tizen device-info (dev): injects the webapis.js script tag once, on debug unlock — in the §8.5 boot/dev element inventory.',
  },
  {
    file: 'apps/tizen/src/device-info/index.ts',
    symbol: 'loadWebapis.load.doc',
    api: 'document',
    reason:
      'Tizen device-info (dev): injects the webapis.js script tag once, on debug unlock — in the §8.5 boot/dev element inventory.',
  },
  {
    file: 'apps/tizen/src/device-info/index.ts',
    symbol: 'loadWebapis.load.script',
    api: 'createElement',
    reason:
      'Tizen device-info (dev): injects the webapis.js script tag once, on debug unlock — in the §8.5 boot/dev element inventory.',
  },
  // apps/tizen/src/main.ts
  {
    file: 'apps/tizen/src/main.ts',
    symbol: 'canvas',
    api: 'getElementById',
    reason:
      "boot: the host page's one canvas lookup before Shell boot (the §8.5 inventory's boot surface).",
  },
  // apps/web/src/boot/index.ts
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'bootWebApp.nav',
    api: 'navigator',
    reason:
      'boot: the gamepad feature probe on navigator, once when the platform adapter is built.',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'bootWebApp.shell.platform.visibility',
    api: 'document',
    reason:
      'boot: the visibility source handed to the platform adapter once (the lifecycle listeners bind at boot).',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'copyReplayText.clipboard',
    api: 'navigator',
    reason:
      'the replay SHARE (M3-01): the clipboard handle on a user press — event-driven, off every hot path.',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.dispose',
    api: 'removeChild',
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.dispose.parent',
    api: 'parentNode',
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.hide',
    api: 'style',
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.show',
    api: 'appendChild',
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.show',
    api: 'createElement',
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.show',
    api: 'setAttribute',
    count: 2,
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.show',
    api: 'style',
    count: 2,
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.show',
    api: 'textContent',
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  {
    file: 'apps/web/src/boot/index.ts',
    symbol: 'createPageNotice.show.doc',
    api: 'document',
    reason:
      'the §8.5 allow-listed page notice: built, styled, shown and removed on a paste/copy and its timer — event-driven (its docblock\'s own law: "off every hot path — it runs on a paste").',
  },
  // apps/web/src/main.ts
  {
    file: 'apps/web/src/main.ts',
    symbol: 'canvas',
    api: 'getElementById',
    reason:
      "boot: the host page's one canvas lookup before Shell boot (the §8.5 inventory's boot surface).",
  },
  // apps/webos/src/boot/index.ts
  {
    file: 'apps/webos/src/boot/index.ts',
    symbol: 'bootWebosApp.nav',
    api: 'navigator',
    reason:
      'boot: the gamepad feature probe on navigator, once when the platform adapter is built.',
  },
  {
    file: 'apps/webos/src/boot/index.ts',
    symbol: 'bootWebosApp.shell.platform.visibility',
    api: 'document',
    reason:
      'boot: the visibility source handed to the platform adapter once (the lifecycle listeners bind at boot).',
  },
  // apps/webos/src/main.ts
  {
    file: 'apps/webos/src/main.ts',
    symbol: 'canvas',
    api: 'getElementById',
    reason:
      "boot: the host page's one canvas lookup before Shell boot (the §8.5 inventory's boot surface).",
  },
  // packages/render-pixi/src/video/index.ts
  {
    file: 'packages/render-pixi/src/video/index.ts',
    symbol: 'createVideoSurface.createElement',
    api: 'createElement',
    reason:
      "cutscene media (v2 R7-VID): the default <video> element factory, called when a clip is attached — a presentation transition; the director's per-frame update never reaches it.",
  },
  // packages/shell/src/boot/index.ts
  {
    file: 'packages/shell/src/boot/index.ts',
    symbol: 'bootShell.bootGLVersion.chromiumMajor',
    api: 'navigator',
    reason: 'boot: the UA read that decides the GL version, once.',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    symbol: 'bootShell.createImage.createElement',
    api: 'new Image',
    reason:
      'the atlas page-image fallback factory: one Image per page load (boot, and the cold residency prepares — the frame loop holds while pages load).',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    symbol: 'markCanvas',
    api: 'setAttribute',
    reason:
      "the change-gated data-shmup-* mirror — the frame body's ONLY page contact: every call site is boot, a one-time stamp, or a compare-then-write (SCENE_ATTRIBUTE through markScene on a scene change); the tokens are pinned by data-shmup-writes.test.ts and no selector or query reads them.",
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    symbol: 'probeWebGL2',
    api: 'createElement',
    reason:
      'boot: the offscreen WebGL2 probe canvas, created once to answer hasWebGL2 (never attached to the page).',
  },
  {
    file: 'packages/shell/src/boot/index.ts',
    symbol: 'probeWebGL2',
    api: 'document',
    reason:
      'boot: the offscreen WebGL2 probe canvas, created once to answer hasWebGL2 (never attached to the page).',
  },
  // packages/shell/src/debug/index.ts
  {
    file: 'packages/shell/src/debug/index.ts',
    symbol: 'createDebugTools.telemetryEnv.userAgent',
    api: 'navigator',
    reason: 'dev/test: the telemetry env snapshot, built once when the debug tools are created.',
  },
  // packages/shell/src/determinism/index.ts
  {
    file: 'packages/shell/src/determinism/index.ts',
    symbol: 'installDeterminismCheck',
    api: 'document',
    reason:
      "the ?determinism cross-engine harness (M2-18): stamps the document root once per recorded run — a dev/test surface outside the game's frame path.",
  },
  {
    file: 'packages/shell/src/determinism/index.ts',
    symbol: 'installDeterminismCheck',
    api: 'documentElement',
    reason:
      "the ?determinism cross-engine harness (M2-18): stamps the document root once per recorded run — a dev/test surface outside the game's frame path.",
  },
  {
    file: 'packages/shell/src/determinism/index.ts',
    symbol: 'installDeterminismCheck',
    api: 'setAttribute',
    reason:
      "the ?determinism cross-engine harness (M2-18): stamps the document root once per recorded run — a dev/test surface outside the game's frame path.",
  },
  // packages/shell/src/error-screen/index.ts
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay',
    api: 'insertBefore',
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay',
    api: 'nextSibling',
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay',
    api: 'setAttribute',
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay',
    api: 'style',
    count: 6,
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay.canvas',
    api: 'createElement',
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay.parent',
    api: 'parentNode',
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay.remove',
    api: 'parentNode',
    count: 2,
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  {
    file: 'packages/shell/src/error-screen/index.ts',
    symbol: 'createBootOverlay.remove',
    api: 'removeChild',
    reason:
      'the §8.5 allow-listed boot overlay: createBootOverlay builds its fallback canvas, stamps, styles and hangs it beside the game canvas, and its remove() takes it out — boot and the fatal context-loss exit, i.e. only while the game is NOT running.',
  },
  // packages/shell/src/loader/index.ts
  {
    file: 'packages/shell/src/loader/index.ts',
    symbol: 'createPageImageFactory.createElement',
    api: 'new Image',
    reason:
      "the page-image factory's pure-Image branch (R1-05): one Image per atlas page load, cold.",
  },
  // packages/shell/src/telemetry/index.ts
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'createRenderTelemetry.doc',
    api: 'document',
    reason:
      'the §8.5 allow-listed telemetry panel: built once per capture and redrawn per closed window (its law: "so it never costs a frame"); with no report URL it is never created at all (dev/test builds).',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'createRenderTelemetry.drawPanel',
    api: 'textContent',
    reason:
      'the §8.5 allow-listed telemetry panel: built once per capture and redrawn per closed window (its law: "so it never costs a frame"); with no report URL it is never created at all (dev/test builds).',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'createRenderTelemetry.makePanel',
    api: 'appendChild',
    reason:
      'the §8.5 allow-listed telemetry panel: built once per capture and redrawn per closed window (its law: "so it never costs a frame"); with no report URL it is never created at all (dev/test builds).',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'createRenderTelemetry.makePanel',
    api: 'setAttribute',
    reason:
      'the §8.5 allow-listed telemetry panel: built once per capture and redrawn per closed window (its law: "so it never costs a frame"); with no report URL it is never created at all (dev/test builds).',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'createRenderTelemetry.makePanel',
    api: 'style',
    reason:
      'the §8.5 allow-listed telemetry panel: built once per capture and redrawn per closed window (its law: "so it never costs a frame"); with no report URL it is never created at all (dev/test builds).',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'createRenderTelemetry.makePanel.element',
    api: 'createElement',
    reason:
      'the §8.5 allow-listed telemetry panel: built once per capture and redrawn per closed window (its law: "so it never costs a frame"); with no report URL it is never created at all (dev/test builds).',
  },
];

/** What an unlisted touch is told to do. */
const FIX =
  'reach the page only at a pinned cold site — move it off the frame path, or add it to ALLOWED ' +
  'with the reason it is cold (the per-frame body itself stays clean: see the onFrame check)';

describe('integration: the shipped code touches the DOM only at the pinned cold sites (v20x P1-7)', () => {
  const trees = scannedTrees();
  const files: string[] = [];
  for (const tree of trees) {
    for (const file of listSourceFiles(join(repo, tree))) files.push(`${tree}/${file}`);
  }
  const touches = files.flatMap((file) =>
    scanDomTouches(file, readFileSync(join(repo, file), 'utf8')),
  );

  if (process.env.SHMUP_DOM_FREE_PRINT === '1') {
    const counts = new Map<string, number>();
    for (const touch of touches) {
      const key = domTouchKey(touch);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of [...counts.entries()].sort()) {
      const [file, rest] = key.split(' › ');
      const [symbol, api] = rest.split(' = ');
      console.log(
        JSON.stringify({ file, symbol, api, count: count > 1 ? count : undefined, reason: '' }),
      );
    }
  }

  it('scans every package but core, every app, and reads the trees from disk', () => {
    expect(trees).toEqual(
      expect.arrayContaining([
        'packages/render-pixi/src',
        'packages/shell/src',
        'packages/audio-web/src',
        'packages/input-web/src',
        'apps/web/src',
        'apps/tizen/src',
        'apps/webos/src',
        'apps/electron/src',
      ]),
    );
    expect(trees).not.toContain('packages/core/src');
    // The classification list cannot rot either: every package directory is scanned or named.
    for (const parent of ['packages', 'apps']) {
      for (const entry of readdirSync(join(repo, parent), { withFileTypes: true })) {
        if (!entry.isDirectory() || !existsSync(join(repo, parent, entry.name, 'src'))) continue;
        const dir = `${parent}/${entry.name}`;
        expect(trees.includes(`${dir}/src`) || NOT_SCANNED.some((x) => x.dir === dir), dir).toBe(
          true,
        );
      }
    }
    // (frame-literals-repo counts the scripts too and passes 100; this scan reads src trees
    // only, and it has no files under packages/core — 96 today.)
    expect(files.length).toBeGreaterThan(80);
    for (const file of [
      'packages/shell/src/boot/index.ts',
      'packages/shell/src/error-screen/index.ts',
      'packages/render-pixi/src/video/index.ts',
      'apps/web/src/boot/index.ts',
      'apps/tizen/src/bench/run.ts',
    ]) {
      expect(files).toContain(file);
    }
  });

  it('has no DOM touch outside the allow-list, and every entry still matches', () => {
    expect(domTouchProblems(touches, ALLOWED, FIX)).toEqual([]);
  });

  it('keeps the frame body itself DOM-free — the law §8.5 measured', () => {
    // onFrame is the whole rAF body (packages/shell/src/boot/index.ts). It reaches the page
    // only through markScene → markCanvas, a separately named symbol; a touch standing inside
    // the frame body is the exact regression this gate was built for, and it stays unpinable:
    // no allow-list entry may name it.
    for (const touch of touches) expect(touch.symbol.split('.')).not.toContain('onFrame');
    for (const entry of ALLOWED) expect(entry.symbol.split('.')).not.toContain('onFrame');
  });

  it('keeps the allow-list well formed', () => {
    const keys = ALLOWED.map(domTouchKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of ALLOWED) {
      expect(files, entry.file).toContain(entry.file);
      const known = entry.api.startsWith('new ')
        ? MEDIA_CONSTRUCTORS.has(entry.api.slice(4))
        : DOM_NAMES.has(entry.api);
      expect(known, domTouchKey(entry)).toBe(true);
      expect(entry.reason.trim().length, domTouchKey(entry)).toBeGreaterThan(10);
    }
  });

  it('would catch a planted touch, and reads no prose — the scan is not vacuous', () => {
    const sample = [
      'export function onFrame(now: number): void {',
      "  canvas.style.width = '100%';",
      "  const el = doc['createElement']('div');",
      '  el.textContent = String(now);',
      '  const img = new Image();',
      '  const factory = options.createElement; // an option read, not a page touch',
      '  new ImageSource(); // not a media element constructor',
      '  const pool = { remove(i: number) {} }; // domain remove, not the DOM one',
      '}',
      '/** getComputedStyle and setAttribute named in prose only */',
    ].join('\n');
    expect(
      scanDomTouches('sample.ts', sample).map((t) => `${t.symbol}=${t.api}@${t.line}`),
    ).toEqual([
      'onFrame=style@2',
      'onFrame.el=createElement@3',
      'onFrame=textContent@4',
      'onFrame.img=new Image@5',
    ]);
    // …and the problems report names an unlisted touch, a drifted count and a stale entry.
    expect(
      domTouchProblems(
        scanDomTouches('sample.ts', sample),
        [
          {
            file: 'sample.ts',
            symbol: 'onFrame',
            api: 'style',
            count: 2,
            reason: 'a planted entry expecting one more style write than the source holds',
          },
          {
            file: 'sample.ts',
            symbol: 'gone',
            api: 'style',
            reason: 'a planted stale entry',
          },
        ],
        'fix it',
      ),
    ).toEqual([
      'sample.ts › onFrame = style: the allow-list expects 2 touch(es), the source has 1',
      'sample.ts › gone = style: the allow-list expects 1 touch(es), the source has 0',
      'sample.ts › onFrame.el = createElement (line 3): a DOM touch — fix it',
      'sample.ts › onFrame = textContent (line 4): a DOM touch — fix it',
      'sample.ts › onFrame.img = new Image (line 5): a DOM touch — fix it',
    ]);
  });
});
