#!/usr/bin/env node
/**
 * Asset pipeline entry point (`pnpm assets`).
 *
 * PLACEHOLDER: prepares assets/generated/ and reports which source files each planned
 * pipeline stage will process. The real stages come with the first art/audio:
 *   1. sprites/   → packed atlases ≤ 2048² (Aseprite CLI `--sheet --data` or free-tex-packer)
 *   2. tilesets/  → tilemap JSON for content/stages (Tiled / LDtk export)
 *   3. fonts/     → bitmap fonts (.fnt + PNG)
 *   4. audio/     → OGG Vorbis (music with loop points, SFX)
 * See assets/README.md and shmup_tech.md §4.7. Cross-platform (plain Node, no shell).
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(repo, 'assets', 'source');
const outputDir = join(repo, 'assets', 'generated');

/**
 * Lists source files (ignoring .gitkeep / README) below a directory.
 *
 * @param {string} dir - Directory to scan.
 * @returns {string[]} Paths relative to assets/source.
 */
function listSources(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listSources(full);
    if (entry === '.gitkeep' || entry === 'README.md') return [];
    return [relative(sourceDir, full)];
  });
}

mkdirSync(outputDir, { recursive: true });

const stages = [
  ['sprites', 'sprite atlases'],
  ['tilesets', 'tilemaps'],
  ['fonts', 'bitmap fonts'],
  ['audio', 'OGG music / SFX'],
];

console.log('Asset pipeline (placeholder) — nothing is converted yet.');
for (const [folder, label] of stages) {
  const files = listSources(join(sourceDir, folder));
  console.log(`  ${folder.padEnd(9)} → ${label}: ${files.length} source file(s)`);
}
console.log(`Output folder ready: ${relative(repo, outputDir)}/`);
