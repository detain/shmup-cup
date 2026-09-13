import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import type { ModuleInfo } from '../src/module-info.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');

/** Every `src/<module>/` directory of the package. */
const moduleDirs = readdirSync(srcDir).filter((entry) =>
  statSync(join(srcDir, entry)).isDirectory(),
);

describe('@shmup/core public API', () => {
  it('exports the Platform-facing API', () => {
    expect(typeof core.createGame).toBe('function');
    expect(typeof core.createFixedStepLoop).toBe('function');
    expect(typeof core.createInputSnapshot).toBe('function');
    expect(typeof core.createHeadlessPlatform).toBe('function');
    expect(core.DEFAULT_GAME_CONFIG.internalWidth).toBe(384);
  });

  it('has the planned module tree (every system from shmup_feat.md §5–§22)', () => {
    const required = [
      'loop',
      'rng',
      'math',
      'events',
      'pools',
      'input',
      'player',
      'weapons',
      'options',
      'shields',
      'powerups',
      'enemies',
      'bullets',
      'patterns',
      'bosses',
      'collision',
      'stage',
      'scoring',
      'rank',
      'scenes',
      'ui',
      'replay',
      'save',
      'config',
      'data',
    ];
    for (const name of required) expect(moduleDirs).toContain(name);
  });

  it('every module directory has an index.ts exporting a matching moduleInfo and a test folder', async () => {
    const testDirs = readdirSync(here);
    for (const dir of moduleDirs) {
      const mod = (await import(`../src/${dir}/index.ts`)) as { moduleInfo: ModuleInfo };
      expect(mod.moduleInfo.name).toBe(dir);
      expect(testDirs).toContain(dir);
    }
  });

  it('re-exports every runtime export of every module from the package entry (§1.3 item 4)', async () => {
    const entry = core as Record<string, unknown>;
    const missing: string[] = [];
    for (const dir of moduleDirs) {
      const mod = (await import(`../src/${dir}/index.ts`)) as Record<string, unknown>;
      for (const name of Object.keys(mod)) {
        if (name === 'moduleInfo') continue; // per-module metadata, deliberately not re-exported
        // Object.is: some constants are NaN sentinels (bullets' UNCHANGED).
        if (!(name in entry) || !Object.is(entry[name], mod[name])) missing.push(`${dir}.${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('re-exports the Ripple ring width', () => {
    expect(core.RIPPLE_RING_WIDTH).toBe(4);
  });
});
