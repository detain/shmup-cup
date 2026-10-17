/**
 * The atlas's zone split (R1-05): `assets/source/atlas-groups.json` is **derived from the
 * content**, and with it each campaign zone needs exactly the `common` pages plus its own.
 *
 * **The derivation** (one rule, here and nowhere else): for each campaign zone, the sprites
 * its stage names — the shell's `stageSpriteSets`, which follows the stage's enemies, their
 * children and bosses, its tileset and its linked bonus stage. A content sprite exactly one
 * zone names goes to that zone's group `zone-<id>`; everything else stays `common`: sprites
 * of two or more zones, sprites no zone names (ships, shots, items, dev ranges), and the
 * sprites the engine draws in every zone whatever the stage says — the World's
 * `ENGINE_SPRITES` (bullets, lasers, items, the UI kit's `UI_SPRITES`) and the scene view's
 * starfield (`SCENE_VIEW_SPRITES`). The font is always `common` (the pipeline's rule), and
 * so is any atlas sprite the content does not name (fx particles, `ui/pixel`). Siblings
 * (`@flash`, `@p2`, the colour-blind palettes) follow their sprite in the pipeline.
 *
 * **Keeping it current.** The committed file must equal the derivation. After a content
 * change that moves a sprite between zones (a new enemy, a sprite reused by a second zone),
 * re-derive it: `SHMUP_ATLAS_GROUPS_UPDATE=1 pnpm exec vitest run --project integration
 * test/integration/atlas-groups.test.ts`, then `pnpm assets`. Sprite names, their order and
 * frame names never depend on the file, so the goldens and fingerprints are unaffected.
 *
 * **The acceptance** (plan R1-05): on the atlas the pipeline builds (`buildAtlas()`, in
 * memory — CI's test job never runs `pnpm assets`), `stagePages(atlasPageNeeds(…), zone)` is
 * the `common` pages plus that zone's pages for every campaign zone: no other zone's page is
 * needed, no zone page is global, every common page is, and every page fits the 2048² limit.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ENGINE_SPRITES, UI_SPRITES, type ContentDb } from '@shmup/core';
import type { AtlasManifest } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import {
  atlasPageNeeds,
  stagePages,
  stageSpriteSets,
} from '../../packages/shell/src/memory/index.js';
import { SCENE_VIEW_SPRITES } from '../../packages/shell/src/scene-view/index.js';
import { MAX_PAGE_SIZE } from '../../scripts/assets/packer.mjs';
import {
  ATLAS_GROUPS_FILE,
  ATLAS_GROUPS_FORMAT,
  COMMON_GROUP,
  DEFAULT_SOURCE_DIR,
  buildAtlas,
  collectSprites,
} from '../../scripts/assets/pipeline.mjs';
import { shippedContent } from '../playtest/harness.js';

/** Set to `1` to rewrite the committed groups file from the derivation. */
const UPDATE_ENV = 'SHMUP_ATLAS_GROUPS_UPDATE';

/** The committed file. */
const GROUPS_PATH = `${DEFAULT_SOURCE_DIR}/${ATLAS_GROUPS_FILE}`;

/** The file's `comment`: where it comes from and how to re-derive it. */
const COMMENT =
  'Generated from the content by test/integration/atlas-groups.test.ts (plan R1-05): a sprite ' +
  'exactly one campaign zone names packs onto that zone’s own atlas pages, everything else ' +
  'onto common. Do not edit by hand — re-derive with SHMUP_ATLAS_GROUPS_UPDATE=1 pnpm exec ' +
  'vitest run --project integration test/integration/atlas-groups.test.ts, then pnpm assets.';

/** A campaign zone: its group name and its stage. */
interface Zone {
  /** `zone-<campaign id>`. */
  readonly group: string;
  /** `content.stages` index. */
  readonly stageIndex: number;
}

/**
 * The campaign's zones, in campaign order.
 *
 * @param db - The content.
 * @returns One entry per zone.
 */
function campaignZones(db: ContentDb): Zone[] {
  return (db.campaign?.zones ?? []).map((zone) => ({
    group: `zone-${zone.id}`,
    stageIndex: zone.stageId,
  }));
}

/**
 * The groups file's `groups` object, derived from the content (see the module docs).
 *
 * @param db - The shipped content.
 * @param atlasNames - Every sprite name of the atlas.
 * @returns Group → sorted base names, groups sorted by name, empty groups left out.
 */
function deriveGroups(db: ContentDb, atlasNames: ReadonlySet<string>): Record<string, string[]> {
  const sets = stageSpriteSets(db);
  const everyZone = new Set<string>([...ENGINE_SPRITES, ...UI_SPRITES, ...SCENE_VIEW_SPRITES]);
  const owners = new Map<number, string[]>();
  for (const zone of campaignZones(db)) {
    for (const id of sets.byStage[zone.stageIndex] ?? []) {
      const list = owners.get(id);
      if (list === undefined) owners.set(id, [zone.group]);
      else if (list.indexOf(zone.group) < 0) list.push(zone.group);
    }
  }
  const groups = new Map<string, string[]>();
  for (const [id, zones] of owners) {
    if (zones.length !== 1) continue;
    const name = db.sprites.names[id];
    if (everyZone.has(name) || !atlasNames.has(name) || name.includes('@')) continue;
    const list = groups.get(zones[0]);
    if (list === undefined) groups.set(zones[0], [name]);
    else list.push(name);
  }
  const out: Record<string, string[]> = {};
  for (const group of [...groups.keys()].sort()) {
    out[group] = (groups.get(group) ?? []).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return out;
}

/**
 * The text of the groups file for a derivation (two-space JSON, final newline).
 *
 * @param groups - The derived groups.
 * @returns The file text.
 */
const formatGroups = (groups: Record<string, string[]>): string =>
  JSON.stringify({ format: ATLAS_GROUPS_FORMAT, comment: COMMENT, groups }, null, 2) + '\n';

const db = shippedContent();
const atlasNames = new Set(collectSprites().sprites.map((sprite) => sprite.name));
const derived = deriveGroups(db, atlasNames);
const expectedText = formatGroups(derived);

if (process.env[UPDATE_ENV] === '1') writeFileSync(GROUPS_PATH, expectedText);

describe('assets/source/atlas-groups.json — derived from the content', () => {
  it('equals the derivation (re-derive with SHMUP_ATLAS_GROUPS_UPDATE=1 after a content change)', () => {
    expect(existsSync(GROUPS_PATH), GROUPS_PATH).toBe(true);
    expect(readFileSync(GROUPS_PATH, 'utf8')).toBe(expectedText);
  });

  it('gives every campaign zone a group of its own, and never an engine or UI sprite', () => {
    const zones = campaignZones(db);
    expect(zones).toHaveLength(9);
    expect(Object.keys(derived)).toEqual(zones.map((zone) => zone.group).sort());
    const everyZone = new Set([...ENGINE_SPRITES, ...UI_SPRITES, ...SCENE_VIEW_SPRITES]);
    for (const [group, names] of Object.entries(derived)) {
      expect(names.length, group).toBeGreaterThan(0);
      for (const name of names) {
        expect(everyZone.has(name), `${group}: ${name}`).toBe(false);
        expect(atlasNames.has(name), `${group}: ${name}`).toBe(true);
      }
    }
    // The ships and the font are drawn in every zone.
    const listed = new Set(Object.values(derived).flat());
    for (const ship of db.ships) expect(listed.has(ship.sprite), ship.sprite).toBe(false);
    expect(listed.has('font/pixel')).toBe(false);
  });
});

describe('the zone-split atlas (R1-05 acceptance)', () => {
  const { manifest, pages } = buildAtlas();
  const atlas = manifest as unknown as AtlasManifest;
  const sets = stageSpriteSets(db);
  const needs = atlasPageNeeds(atlas, db.sprites.names, sets);
  const groupOf = (p: number): string => manifest.pages[p].group;

  it('starts with main.png = common and gives every zone at least one page', () => {
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.pages[0]).toMatchObject({ file: 'main.png', group: COMMON_GROUP });
    const groups = new Set(manifest.pages.map((page) => page.group));
    for (const zone of campaignZones(db)) expect(groups.has(zone.group), zone.group).toBe(true);
    expect(pages).toHaveLength(manifest.pages.length);
  });

  it('keeps every page within the TV GPU limit (2048²)', () => {
    for (const page of manifest.pages) {
      expect(page.w, page.file).toBeLessThanOrEqual(MAX_PAGE_SIZE);
      expect(page.h, page.file).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    }
  });

  it('needs exactly the common pages and its own for every campaign zone', () => {
    const common = manifest.pages.flatMap((page, p) => (page.group === COMMON_GROUP ? [p] : []));
    for (const zone of campaignZones(db)) {
      const own = manifest.pages.flatMap((page, p) => (page.group === zone.group ? [p] : []));
      expect(stagePages(needs, zone.stageIndex), zone.group).toEqual(
        [...common, ...own].sort((a, b) => a - b),
      );
    }
  });

  it('makes every common page global and no zone page global', () => {
    manifest.pages.forEach((page, p) => {
      expect(needs.global[p], `${page.file} (${page.group})`).toBe(groupOf(p) === COMMON_GROUP);
    });
  });

  it('still needs every page outside the campaign (dev ranges, boss rush) and in menus', () => {
    const all = manifest.pages.map((_, p) => p);
    for (const id of ['test-range', 'boss-rush', 'bonus-vault']) {
      const stage = db.stageIndex.get(id) ?? -1;
      expect(stage, id).toBeGreaterThanOrEqual(0);
      expect(stagePages(needs, stage), id).toEqual(all);
    }
    expect(stagePages(needs, -1)).toEqual(all);
  });
});
