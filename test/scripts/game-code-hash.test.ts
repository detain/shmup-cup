/**
 * `scripts/game-code-hash.mjs` (plan v20x BENCSKIP): the game-code identity the TV render bench's
 * skip ledger and the analyzer's pooling key on. Its rules are the amendment's, so they are laws
 * here: every path that can move a drawn pixel on a bench frame is hashed (the shipped game's
 * `src/**`, the content, the scale-1 art sources and the atlas pipeline), everything that cannot
 * is not (the bench itself, apps' boot, tests, docs, tools, store art, the v2 pixel maps that
 * no scale-1 build reads, and Markdown inside a hashed tree), the digest is deterministic per
 * tree, and a git tree straight from
 * `git archive` (no `assets/generated/`, no installs) hashes fine — that is what makes the
 * historical proof in the run report computable at all.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gameCodeHash, isGameCodePath, listGameCodeFiles } from '../../scripts/game-code-hash.mjs';

/** The repository root (this file lives in `test/scripts/`). */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Writes a file under a temp tree, making parents.
 *
 * @param root - The temp root.
 * @param rel - `/`-separated relative path.
 * @param text - The bytes.
 */
function put(root: string, rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
  writeFileSync(abs, text);
}

describe('game-code hash', () => {
  it('accepts every draw input and refuses everything else', () => {
    expect(isGameCodePath('packages/core/src/world/index.ts')).toBe(true);
    expect(isGameCodePath('packages/render-pixi/src/effects/mode7.ts')).toBe(true);
    expect(isGameCodePath('packages/audio-web/src/synth/index.ts')).toBe(true);
    expect(isGameCodePath('packages/input-web/src/rebind/index.ts')).toBe(true);
    expect(isGameCodePath('packages/shell/src/loader/index.ts')).toBe(true);
    expect(isGameCodePath('content/stages/zone-a.stage.json')).toBe(true);
    expect(isGameCodePath('content/fx/presets.fx.json')).toBe(true);
    expect(isGameCodePath('assets/source/sprites/ships/kestrel.sprite.json')).toBe(true);
    expect(isGameCodePath('assets/source/sprites/ui/logo.png')).toBe(true);
    expect(isGameCodePath('scripts/assets/pipeline.mjs')).toBe(true);
    // The v2 pixel maps are inert in every scale-1 build (decision RR-1) — not hashed.
    expect(isGameCodePath('assets/source/sprites/ships/kestrel.v2.sprite.json')).toBe(false);
    // Markdown inside a hashed tree (a content README sample, a source note) is prose the
    // bundle never reads — not hashed either.
    expect(isGameCodePath('content/stages/README.md')).toBe(false);
    expect(isGameCodePath('assets/source/NOTES.md')).toBe(false);
    expect(isGameCodePath('scripts/assets/README.md')).toBe(false);
    // The bench, the apps, tests, docs, tools and derived bytes are all outside it.
    expect(isGameCodePath('apps/tizen/src/bench/run.ts')).toBe(false);
    expect(isGameCodePath('apps/webos/src/main.ts')).toBe(false);
    expect(isGameCodePath('test/integration/tv-render-bench.test.ts')).toBe(false);
    expect(isGameCodePath('docs/dev/build-test-deploy.md')).toBe(false);
    expect(isGameCodePath('tools/input-probe/results/analyze-bench.mjs')).toBe(false);
    expect(isGameCodePath('assets/generated/atlas/main.json')).toBe(false);
    expect(isGameCodePath('package.json')).toBe(false);
  });

  it('is a 10-hex digest of a stable, sorted walk of the real tree', () => {
    const once = gameCodeHash(repoRoot);
    expect(once).toMatch(/^[0-9a-f]{10}$/);
    expect(gameCodeHash(repoRoot)).toBe(once);
    const files = listGameCodeFiles(repoRoot);
    expect(files.length).toBeGreaterThan(500);
    expect([...files].sort()).toEqual(files);
  });

  it('moves when any hashed path moves, and not when an outside path moves', () => {
    const root = mkdtempSync(join(tmpdir(), 'game-code-hash-'));
    try {
      put(root, 'packages/core/src/config/index.ts', 'export const FRAME_W = 640;\n');
      put(root, 'content/stages/zone-a.stage.json', '{"kind":"stage"}\n');
      put(root, 'assets/source/sprites/a.sprite.json', '{"name":"a"}\n');
      put(root, 'assets/source/sprites/a.v2.sprite.json', '{"name":"a/v2"}\n');
      put(root, 'scripts/assets/pipeline.mjs', 'export function buildAtlas() {}\n');
      put(root, 'apps/tizen/src/bench/matrix.ts', 'export const BENCH_SCENARIOS = [];\n');
      put(root, 'docs/dev/conventions.md', '# hello\n');
      const base = gameCodeHash(root);

      // A v2 pixel map is inert at scale 1: adding, changing or removing one moves nothing.
      put(root, 'assets/source/sprites/b.v2.sprite.json', '{"name":"b"}\n');
      expect(gameCodeHash(root)).toBe(base);

      // A bench-code change rebuilds the widget without touching what it draws: same hash.
      put(root, 'apps/tizen/src/bench/matrix.ts', 'export const BENCH_SCENARIOS = [1];\n');
      expect(gameCodeHash(root)).toBe(base);
      put(root, 'docs/dev/conventions.md', '# changed\n');
      expect(gameCodeHash(root)).toBe(base);
      // A README inside a hashed tree is still Markdown — the loaders glob JSON only.
      put(root, 'content/stages/README.md', '# format sample\n');
      expect(gameCodeHash(root)).toBe(base);

      // Every hashed input is live.
      put(root, 'content/stages/zone-a.stage.json', '{"kind":"stage","remix":1}\n');
      const afterContent = gameCodeHash(root);
      expect(afterContent).not.toBe(base);
      put(root, 'packages/core/src/config/index.ts', 'export const FRAME_W = 641;\n');
      expect(gameCodeHash(root)).not.toBe(afterContent);
      rmSync(join(root, 'assets/source/sprites/a.sprite.json'));
      expect(gameCodeHash(root)).not.toBe(base);
      put(root, 'scripts/assets/pipeline.mjs', 'export function buildAtlas() { return 1; }\n');
      expect(gameCodeHash(root)).not.toBe(afterContent);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an empty tree hashes too (a git archive with no sources is a defined identity)', () => {
    const root = mkdtempSync(join(tmpdir(), 'game-code-hash-'));
    try {
      expect(gameCodeHash(root)).toMatch(/^[0-9a-f]{10}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
