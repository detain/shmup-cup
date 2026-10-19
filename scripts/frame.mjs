/**
 * The game's frame constants for the repository's Node scripts, the browser tests and the
 * Playwright config (plan_resolution.md R1-02): a plain-JS mirror of the frame constants of
 * `@shmup/core` (`packages/core/src/config/index.ts`, R1-01) plus the world's scale
 * {@link WORLD_SCALE} and the two values the tools derive from the frame, {@link SPAWN_LEAD}
 * and {@link CAPTURE_SCALE}.
 *
 * **Why a mirror.** The scripts run as plain Node ES modules, without the workspace's TypeScript
 * build, so they cannot import `@shmup/core` (its source is TypeScript and its `dist/` exists only
 * after a build). The few base values are repeated here and every value is derived exactly the way
 * core derives it, so R2-01's switch to 640×360 changed the same handful of numbers in both files.
 * `test/scripts/frame.test.ts` pins every export to core, so the two can never drift apart.
 *
 * **Frame ≠ world** (plan §2.6): only values anchored to the frame or a screen edge live here.
 * World values (radii, margins, speeds) stay where they are used, and R2-02 scales them ×1.5.
 *
 * Every value but {@link WORLD_SCALE} is a whole number, at 640×360 (since R2-01's switch) as it
 * was at v1's 384×216.
 *
 * **Public API.** {@link FRAME_W}, {@link FRAME_H}, {@link FRAME_CX}, {@link FRAME_CY},
 * {@link HUD_BAR_HEIGHT}, {@link PLAYFIELD_Y}, {@link PLAYFIELD_W}, {@link PLAYFIELD_H},
 * {@link PLAYFIELD_CY}, {@link HUD_BOTTOM_Y}, {@link TILE_SIZE}, {@link GLYPH_W}, {@link GLYPH_H},
 * {@link LINE_H}, {@link WORLD_SCALE}, {@link SPAWN_LEAD}, {@link CAPTURE_SCALE}.
 *
 * @example
 * ```js
 * import { CAPTURE_SCALE, FRAME_H, FRAME_W } from './frame.mjs';
 * const viewport = { width: FRAME_W * CAPTURE_SCALE, height: FRAME_H * CAPTURE_SCALE };
 * ```
 *
 * @module
 */

/** Width of the internal frame in pixels (`@shmup/core` `FRAME_W`; D19: 384; R2-01: 640). */
export const FRAME_W = 640;

/** Height of the internal frame in pixels (`@shmup/core` `FRAME_H`; D19: 216; R2-01: 360). */
export const FRAME_H = 360;

/** The frame's centre column, `FRAME_W / 2` (`@shmup/core` `FRAME_CX`). */
export const FRAME_CX = FRAME_W / 2;

/** The frame's centre row, `FRAME_H / 2` (`@shmup/core` `FRAME_CY`). */
export const FRAME_CY = FRAME_H / 2;

/** Height in pixels of each HUD bar (`@shmup/core` `HUD_BAR_HEIGHT`; D20: 8; R2-01: 12). */
export const HUD_BAR_HEIGHT = 12;

/** Screen row where the playfield starts, under the top HUD bar (`@shmup/core` `PLAYFIELD_Y`). */
export const PLAYFIELD_Y = HUD_BAR_HEIGHT;

/** Playfield width in pixels — the full frame width (`@shmup/core` `PLAYFIELD_W`). */
export const PLAYFIELD_W = FRAME_W;

/**
 * Playfield height in pixels, the frame less the two HUD bars: `FRAME_H − 2 · HUD_BAR_HEIGHT`
 * (`@shmup/core` `PLAYFIELD_H`).
 */
export const PLAYFIELD_H = FRAME_H - 2 * HUD_BAR_HEIGHT;

/** The playfield's centre row in playfield coordinates (`@shmup/core` `PLAYFIELD_CY`). */
export const PLAYFIELD_CY = PLAYFIELD_H / 2;

/**
 * Screen row of the bottom HUD bar's top edge, the row just below the playfield:
 * `FRAME_H − HUD_BAR_HEIGHT` (`@shmup/core` `HUD_BOTTOM_Y`).
 */
export const HUD_BOTTOM_Y = FRAME_H - HUD_BAR_HEIGHT;

/** Tile edge in pixels of every tileset and tilemap (`@shmup/core` `TILE_SIZE`; R2-01: 12). */
export const TILE_SIZE = 12;

/** Cell width (and advance) of the bitmap font in pixels (`@shmup/core` `GLYPH_W`). */
export const GLYPH_W = 9;

/** Cell height of the bitmap font in pixels (`@shmup/core` `GLYPH_H`). */
export const GLYPH_H = 12;

/** Line advance of the bitmap font in pixels (`@shmup/core` `LINE_H`). */
export const LINE_H = 15;

/**
 * The world's scale relative to v1 (plan §2.6, decision R-D2; `@shmup/core` `WORLD_SCALE`):
 * 1 until R2-02's port, then 3/2 — the one mirror export that need not be a whole number.
 * World lengths in the scripts are written `v1 × WORLD_SCALE`.
 */
export const WORLD_SCALE = 1;

/**
 * How far ahead of the camera an enemy appears by default: 16 px past the right edge of the
 * view, `PLAYFIELD_W + 16 · WORLD_SCALE` (`@shmup/core` `DEFAULT_SPAWN_SCREEN_X`). The 16 is a
 * world margin (R2-02 makes it 24); the playfield width is the frame part.
 */
export const SPAWN_LEAD = PLAYFIELD_W + 16 * WORLD_SCALE;

/**
 * Whole-number scale of a browser capture (the e2e viewport and `pnpm docs:screens`):
 * `floor(1280 / FRAME_W)` — the largest scale whose picture still fits a 1280-pixel-wide window
 * (decision O9). ×2 (1280×720) at 640×360 since R2-01 (plan §2.7); it was ×3 (1152×648) at v1's
 * 384×216.
 */
export const CAPTURE_SCALE = Math.floor(1280 / FRAME_W);
