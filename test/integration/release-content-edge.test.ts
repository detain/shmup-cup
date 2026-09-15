/**
 * Content rules behind the M2-18 release-bot fixes, stated as relations of the shipped JSON so a
 * later content change cannot quietly bring the bugs back (the whole-route bot runs catch them too,
 * but only after minutes of flying):
 *
 * - **No blind spot straight ahead** — every level of every Direct-mode main family fires at least
 *   one shot straight ahead (angle 0). The MANTA's fifth disc level used to be a ±16-unit V with
 *   nothing in the middle, and CINDER BASTION's core, straight ahead, survived it.
 * - **GALVANIC MAW's open jaws fit the HUGE DISC** — in every phase the gap between the open jaws'
 *   hurtboxes is taller than the MANTA's biggest disc, so the disc reaches the maw instead of dying
 *   on a jaw (the jaws opened 4 px: an 18-px gap for an 18-px disc).
 * - **The waves reach a core behind armour** — every wave weapon of the `LASER → WAVE` family
 *   pierces with `passArmour` (the `ShotFlag.PassArmour` fix for MANTLE REGENT, IRON SOVEREIGN and
 *   THE HOLLOW KING).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Reads a content file.
 *
 * @param path - Path below `content/`.
 * @returns The parsed JSON.
 */
function content<T>(path: string): T {
  return JSON.parse(readFileSync(join(repo, 'content', path), 'utf8')) as T;
}

/** A weapon of a weapons file. */
interface WeaponJson {
  readonly id: string;
  readonly behavior: string;
  readonly pierce?: boolean;
  readonly params?: Readonly<Record<string, number>>;
}

/** A shot of a family level. */
interface ShotJson {
  readonly weapon: string;
  readonly angle?: number;
  readonly oy?: number;
}

/** A Direct-mode family. */
interface FamilyJson {
  readonly id: string;
  readonly slot: string;
  readonly levels: readonly { readonly shots: readonly ShotJson[] }[];
}

/** A boss part. */
interface PartJson {
  readonly name: string;
  readonly parent?: string;
  readonly y?: number;
  readonly hurtbox?: { readonly hw: number; readonly hh: number };
}

/** An enemy (maybe a boss). */
interface EnemyJson {
  readonly id: string;
  readonly boss?: {
    readonly parts: readonly PartJson[];
    readonly phases: readonly {
      readonly script: string;
      readonly params?: Readonly<Record<string, number>>;
    }[];
  };
}

const DIRECT = content<{ weapons: WeaponJson[]; families: FamilyJson[] }>(
  'weapons/direct.weapons.json',
);
const WEAPONS = new Map(DIRECT.weapons.map((w) => [w.id, w]));

describe('release content: the Direct-mode main shots (M2-18 fixes)', () => {
  it('fires straight ahead on every level of every main family', () => {
    const main = DIRECT.families.filter((f) => f.slot === 'main');
    expect(main.map((f) => f.id).sort()).toEqual(['beam-disc', 'laser-wave']);
    for (const family of main) {
      family.levels.forEach((level, index) => {
        const where = `${family.id} level ${String(index + 1)}`;
        expect(level.shots.length, where).toBeGreaterThan(0);
        expect(
          level.shots.some((shot) => (shot.angle ?? 0) === 0),
          where,
        ).toBe(true);
      });
    }
  });

  it('gives the fifth disc level two parallel discs, one above and one below the line of fire', () => {
    const disc = DIRECT.families.find((f) => f.id === 'beam-disc');
    const fifth = disc?.levels[4].shots ?? [];
    expect(fifth.map((s) => [s.weapon, s.angle ?? 0, s.oy ?? 0])).toEqual([
      ['direct.disc.small', 0, -4],
      ['direct.disc.small', 0, 4],
    ]);
  });

  it('makes every wave pierce with passArmour', () => {
    const family = DIRECT.families.find((f) => f.id === 'laser-wave');
    expect(family).toBeDefined();
    const ids = new Set(
      (family?.levels ?? []).flatMap((level) => level.shots.map((shot) => shot.weapon)),
    );
    const waves = [...ids].filter((id) => id.startsWith('direct.wave')).sort();
    expect(waves).toEqual([
      'direct.wave',
      'direct.wave.big',
      'direct.wave.huge',
      'direct.wave.wide',
    ]);
    for (const id of waves) {
      const weapon = WEAPONS.get(id);
      expect(weapon?.behavior, id).toBe('direct.bolt');
      expect(weapon?.pierce, id).toBe(true);
      expect(weapon?.params?.passArmour, id).toBe(1);
    }
  });
});

describe('release content: GALVANIC MAW fits the HUGE DISC (M2-18 fix)', () => {
  const zoneB = content<{ enemies: EnemyJson[] }>('enemies/zone-b.enemies.json');
  const maw = zoneB.enemies.find((e) => e.id === 'galvanic-maw')?.boss;

  it('opens its jaws wider than the biggest disc in every phase', () => {
    expect(maw).toBeDefined();
    if (maw === undefined) return;
    const top = maw.parts.find((p) => p.name === 'jaw-top');
    const bottom = maw.parts.find((p) => p.name === 'jaw-bottom');
    expect(top?.hurtbox).toBeDefined();
    expect(bottom?.hurtbox).toBeDefined();
    if (top?.hurtbox === undefined || bottom?.hurtbox === undefined) return;
    // The biggest disc any Direct-mode shot is.
    const discs = DIRECT.weapons.filter((w) => w.id.startsWith('direct.disc'));
    const tallest = Math.max(...discs.map((w) => 2 * (w.params?.hh ?? 0)));
    expect(tallest).toBe(18);
    const phases = maw.phases.filter((phase) => phase.script === 'boss.maw');
    expect(phases).toHaveLength(3);
    for (const [index, phase] of phases.entries()) {
      // Each jaw moves `gape` px away from the mouth while it is open.
      const gape = Math.floor(phase.params?.gape ?? 0);
      const upper = (top.y ?? 0) - gape + top.hurtbox.hh;
      const lower = (bottom.y ?? 0) + gape - bottom.hurtbox.hh;
      expect(lower - upper, `phase ${String(index)}`).toBeGreaterThan(tallest);
    }
  });
});
