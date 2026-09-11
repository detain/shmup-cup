#!/usr/bin/env node
/**
 * Cross-platform `rm -rf` for build output (works in cmd.exe / PowerShell too).
 *
 * Usage (from a package directory): `node ../../scripts/clean.mjs dist coverage .turbo`
 * Paths are resolved against the current working directory. Refuses to delete
 * anything outside it, and never touches `node_modules` (use `pnpm clean` for that).
 */
import { rmSync } from 'node:fs';
import { relative, resolve } from 'node:path';

/** Directory every target is resolved against (and must stay inside). */
const cwd = process.cwd();
/** Paths to delete, from the command line. */
const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('usage: node scripts/clean.mjs <path> [...paths]');
  process.exit(1);
}

for (const target of targets) {
  const absolute = resolve(cwd, target);
  const rel = relative(cwd, absolute);
  if (rel === '' || rel.startsWith('..') || resolve(cwd, rel) !== absolute) {
    console.error(`clean: refusing to delete "${target}" (outside ${cwd})`);
    process.exit(1);
  }
  if (rel.split(/[\\/]/).includes('node_modules')) {
    console.error(`clean: refusing to delete "${target}" (node_modules)`);
    process.exit(1);
  }
  rmSync(absolute, { recursive: true, force: true });
}
