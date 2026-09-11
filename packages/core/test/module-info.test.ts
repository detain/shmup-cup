/**
 * defineModule() and the module descriptors every placeholder exports.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defineModule, type ModuleInfo } from '../src/module-info.js';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const moduleDirs = readdirSync(srcDir).filter((entry) =>
  statSync(join(srcDir, entry)).isDirectory(),
);

describe('core/module-info defineModule', () => {
  it('returns an equal, frozen copy', () => {
    const input = { name: 'demo', status: 'placeholder' as const, specRefs: ['shmup_feat.md §3'] };
    const info = defineModule(input);
    expect(info).toEqual(input);
    expect(info).not.toBe(input);
    expect(Object.isFrozen(info)).toBe(true);
    expect(Object.isFrozen(info.specRefs)).toBe(true);
  });

  it('copies specRefs so later changes to the caller array do not leak in', () => {
    const refs = ['shmup_feat.md §3'];
    const info = defineModule({ name: 'demo', status: 'partial', specRefs: refs });
    refs.push('shmup_feat.md §4');
    expect(info.specRefs).toEqual(['shmup_feat.md §3']);
    expect(Object.isFrozen(refs)).toBe(false);
  });
});

describe('core module descriptors', () => {
  it.each(moduleDirs)('src/%s/index.ts has a valid descriptor and module docblock', async (dir) => {
    const mod = (await import(`../src/${dir}/index.ts`)) as { moduleInfo: ModuleInfo };
    const info = mod.moduleInfo;
    expect(info.name).toBe(dir);
    expect(['placeholder', 'partial', 'implemented']).toContain(info.status);
    expect(info.specRefs.length).toBeGreaterThan(0);
    expect(Object.isFrozen(info)).toBe(true);

    const source = readFileSync(join(srcDir, dir, 'index.ts'), 'utf8');
    expect(source.trimStart().startsWith('/**')).toBe(true);
    expect(source).toContain('**Responsibility.**');
    expect(source).toContain('**Implements.**');
    expect(source).toMatch(/Public API/i);
    if (info.status === 'placeholder') expect(source).toContain('**Status: placeholder.**');
  });

  it('placeholder modules contain declarations only (no runtime exports besides moduleInfo)', async () => {
    for (const dir of moduleDirs) {
      const mod = (await import(`../src/${dir}/index.ts`)) as Record<string, unknown> & {
        moduleInfo: ModuleInfo;
      };
      if (mod.moduleInfo.status !== 'placeholder') continue;
      expect(Object.keys(mod), dir).toEqual(['moduleInfo']);
    }
  });
});
