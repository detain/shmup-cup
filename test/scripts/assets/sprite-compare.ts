/**
 * Helpers for comparing whole generated sprite sets in the asset-pipeline tests.
 *
 * Vitest's `toEqual` walks a `Uint8Array` element by element through its generic
 * equality testers; over the full procedural sprite set (~350 KB of RGBA) that takes
 * seconds on a GitHub Actions runner and hit the 5 s test timeout in CI. Turning each
 * frame's pixels into a hex string keeps the comparison exact (same bytes ⇔ same string)
 * while `toEqual` compares the strings natively.
 *
 * @module
 */
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

/** A frame whose pixel bytes are a lower-case hex string. */
export interface ComparableFrame {
  readonly width: number;
  readonly height: number;
  readonly data: string;
}

/** A {@link SpriteDef} whose frames are {@link ComparableFrame}s. */
export type ComparableSprite = Omit<SpriteDef, 'frames'> & {
  readonly frames: readonly ComparableFrame[];
};

/**
 * Converts a sprite into a form `toEqual` compares quickly and exactly.
 *
 * @param sprite - A generated sprite.
 * @returns The same sprite with every frame's pixels as a hex string.
 */
export function comparableSprite(sprite: SpriteDef): ComparableSprite {
  return {
    ...sprite,
    frames: sprite.frames.map((frame) => ({
      ...frame,
      data: Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength).toString(
        'hex',
      ),
    })),
  };
}

/**
 * Converts a list of sprites with {@link comparableSprite}.
 *
 * @param sprites - Generated sprites.
 * @returns The comparable sprites, in the same order.
 */
export function comparableSprites(sprites: readonly SpriteDef[]): ComparableSprite[] {
  return sprites.map(comparableSprite);
}
