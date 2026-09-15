/**
 * The desktop packaging config (plan M2-17: `electron-builder.json`, used by
 * `pnpm --filter @shmup/electron package` — never run in CI): it packages only the compiled app and
 * the copied web build, names the original game, pins the Electron version the workspace installs
 * and writes its output where git and the linters ignore it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const config = JSON.parse(read('../../electron-builder.json')) as {
  appId: string;
  productName: string;
  electronVersion: string;
  directories: { output: string };
  files: string[];
  asar: boolean;
  win: { target: string[] };
  linux: { target: string[]; category: string };
  mac: { target: string[] };
};
const pkg = JSON.parse(read('../../package.json')) as {
  main: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
};

describe('electron packaging config (electron-builder.json)', () => {
  it('names the original game only', () => {
    expect(config.productName).toBe('Shmup Cup');
    expect(config.appId).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);
    expect(JSON.stringify(config)).not.toMatch(/gradius|darius|konami|taito/i);
  });

  it('packages the compiled main process, the preload and the copied web build — no sources or tests', () => {
    expect(config.files).toContain('dist/**/*');
    expect(config.files).toContain('package.json');
    expect(config.files.some((glob) => /^(src|test)\b/.test(glob))).toBe(false);
    expect(pkg.main).toBe('dist/main/main.js');
    expect(config.asar).toBe(true);
    // Nothing to bundle from node_modules: the main process needs only Electron and Node.
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('pins the Electron version the workspace installs (the catalog major)', () => {
    const catalog = read('../../../../pnpm-workspace.yaml');
    const range = /^\s*electron:\s*\^?(\d+)\.(\d+)\.(\d+)/m.exec(catalog);
    expect(range).not.toBeNull();
    const [major] = config.electronVersion.split('.');
    expect(major).toBe(range?.[1]);
    expect(config.electronVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('builds Windows, Linux (Steam Deck: AppImage) and macOS targets into an ignored folder', () => {
    expect(config.win.target).toContain('nsis');
    expect(config.linux.target).toContain('AppImage');
    expect(config.linux.category).toBe('Game');
    expect(config.mac.target).toContain('dmg');
    expect(config.directories.output).toBe('release');
    expect(read('../../../../.gitignore')).toContain('apps/electron/release/');
    expect(read('../../../../.prettierignore')).toContain('apps/electron/release/');
  });

  it('offers a package script that pins electron-builder and never publishes', () => {
    expect(pkg.scripts.package).toMatch(/electron-builder@\d+\.\d+\.\d+ /);
    expect(pkg.scripts.package).toContain('--config electron-builder.json');
    expect(pkg.scripts.package).toContain('--publish never');
    // `pnpm build` (CI) never packages.
    expect(pkg.scripts.build).not.toContain('electron-builder');
  });
});
