/**
 * The meter arsenal of plan M2-03 end to end on the shipped content (the real `content/` files with
 * the engine's script registry and sprites, the way the shell loads them).
 *
 * - The shipped weapons: presets `type-a` … `type-d` in content order, every weapon named for the
 *   weapon select, drawn with a `shots/*` sprite and labelled on the HUD's meter.
 * - Every Weapon Edit (4 missiles × 4 doubles × 4 lasers = 64 arsenals) flies the shipped
 *   `test-range` stage with the full loadout (Laser, then the Double, Missile, four Options) and a
 *   weaving pilot: after every tick at most 96 shots, the per-shooter caps of each role's weapon,
 *   no shot outside the view ± 16 px (a blast by its world anchor, a beam by its head and tail),
 *   beams no longer than their weapon's `maxLength`, rings no larger than 20, no non-finite
 *   position, sliding missiles resting on the floor, straight flyers never inside rock, the shot
 *   batch within its capacity and drawn with `shots/*` sprites; every role's kind shows up.
 * - Two sessions of every Types B–D preset on zone A fed the same weaving input stay in lockstep
 *   (the Types C and D weapons have no golden replay of their own).
 * - The weapon range the select's preview flies is harmless (no enemy bullet over a whole loop)
 *   and its preview keeps flying across the range's restart.
 */
import {
  Action,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MAX_PLAYER_SHOTS,
  METER_LABEL_FRAMES,
  MainWeapon,
  PLAYFIELD_H,
  PLAYFIELD_W,
  SHOOTERS_PER_PLAYER,
  SHOT_BATCH_CAPACITY,
  SHOT_CULL_MARGIN,
  ShotFlag,
  ShotKind,
  WEAPON_BEHAVIOR_KINDS,
  WEAPON_BEHAVIOR_LABELS,
  WEAPON_BEHAVIOR_PARAMS,
  WEAPON_ROLE_COUNT,
  WeaponRole,
  WeaponSelectItem,
  checkWeaponBehaviors,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  terrainSolidAt,
  weaponsOfSlot,
  type ContentDb,
  type Game,
  type GameConfig,
  type HeadlessPlatform,
  type WeaponSpec,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content with the engine sprites, validated like the shell does.
 *
 * @returns The DB (asserted issue-free, weapons included).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  expect(checkWeaponBehaviors(db)).toEqual([]);
  return db;
}

const DB = shipped();

/** A headless session and the platform feeding it. */
interface Session {
  /** The game (bare gameplay, no scene flow). */
  readonly g: Game;
  /** Its platform (the input snapshot). */
  readonly platform: HeadlessPlatform;
}

/**
 * A headless game (bare gameplay, no scene flow).
 *
 * @param config - Config overrides.
 * @returns The session.
 */
function game(config: Partial<GameConfig>): Session {
  const platform = createHeadlessPlatform();
  return { g: createGame(platform, { seed: 23, ...config }, DB), platform };
}

/**
 * A weaving pilot's held buttons: up for 30 ticks, down for 30, drifting right then left.
 *
 * @param tick - The tick.
 * @returns The action mask.
 */
function weave(tick: number): number {
  const vertical = (tick / 30) % 2 < 1 ? Action.Up : Action.Down;
  const horizontal = (tick / 90) % 2 < 1 ? Action.Right : Action.Left;
  return vertical | (tick % 3 === 0 ? horizontal : 0);
}

/** Collects the first invariant violations (asserted empty once at the end). */
class Violations {
  /** The first violations found (at most 10). */
  readonly list: string[] = [];

  /**
   * Records a violation unless `ok`.
   *
   * @param ok - Whether the invariant holds.
   * @param what - Describes the violation (called only when it does not hold).
   */
  check(ok: boolean, what: () => string): void {
    if (!ok && this.list.length < 10) this.list.push(what());
  }
}

/**
 * A weapon's tunable (its `params`, else the behaviour's default).
 *
 * @param spec - The weapon.
 * @param name - Tunable name.
 * @returns The value (0 when neither has it).
 */
function tunable(spec: WeaponSpec, name: string): number {
  return spec.params?.[name] ?? WEAPON_BEHAVIOR_PARAMS[spec.behavior][name] ?? 0;
}

/**
 * Checks the per-tick invariants of the arsenal's shots.
 *
 * @param w - The world.
 * @param label - The arsenal, for the messages.
 * @param v - Where violations go.
 * @param seen - Collects the shot kinds seen.
 */
function checkArsenal(w: World, label: string, v: Violations, seen: Set<number>): void {
  const map = w.terrain;
  if (map === null) throw new Error('no terrain');
  const pool = w.weapons.pool;
  const f = pool.fields;
  const roles = w.weapons.roleWeapons;
  const tick = w.tick - 1;
  v.check(pool.count <= MAX_PLAYER_SHOTS, () => `${label} tick ${tick}: ${pool.count} shots`);
  const counts = new Array<number>(SHOOTERS_PER_PLAYER * WEAPON_ROLE_COUNT).fill(0);
  const left = w.camera.x - SHOT_CULL_MARGIN;
  const right = w.camera.x + PLAYFIELD_W + SHOT_CULL_MARGIN;
  const top = w.camera.y - SHOT_CULL_MARGIN;
  const bottom = w.camera.y + PLAYFIELD_H + SHOT_CULL_MARGIN;
  for (let i = 0; i < pool.count; i++) {
    const flags = f.flags[i];
    if ((flags & ShotFlag.Dead) !== 0) continue;
    const x = f.x[i];
    const y = f.y[i];
    const kind = f.kind[i];
    const role = f.role[i];
    const spec = roles[role]!;
    seen.add(kind);
    counts[f.shooter[i] * WEAPON_ROLE_COUNT + role]++;
    const at = (): string => `${label} tick ${tick}: kind ${kind} at ${x}, ${y}`;
    v.check(Number.isFinite(x) && Number.isFinite(y), () => at() + ' is not finite');
    const roleKind = WEAPON_BEHAVIOR_KINDS[spec.behavior];
    // Hawk Wind's shots (M3-01) are Missiles below the playfield's middle, Upper Missiles above.
    const hawk = roleKind === ShotKind.HawkWind;
    v.check(
      hawk ? kind === ShotKind.Missile || kind === ShotKind.Upper : roleKind === kind,
      () => at() + ` in role ${role}`,
    );
    if ((flags & ShotFlag.Blast) !== 0) {
      // World-anchored for its 12 ticks: at most 12 camera steps behind the view.
      v.check(x >= left - 12 && y >= top && y <= bottom, () => at() + ' blast outside');
      continue;
    }
    v.check(y >= top && y <= bottom, () => at() + ' outside the view vertically');
    if (kind === ShotKind.Laser || kind === ShotKind.Twin) {
      const length = f.length[i];
      v.check(x >= left && x - length <= right, () => at() + ` (length ${length}) outside`);
      v.check(
        length >= 0 && length <= tunable(spec, 'maxLength'),
        () => at() + ` has length ${length}`,
      );
      continue;
    }
    v.check(x >= left && x <= right, () => at() + ' outside the view horizontally');
    if (kind === ShotKind.Ripple) v.check(f.hh[i] <= 20, () => at() + ` ring ${f.hh[i]}`);
    if ((flags & ShotFlag.Sliding) !== 0 && kind === ShotKind.Upper) {
      // The Upper Missile (M3-01) slides under the ceiling.
      const surface = y - f.hh[i] - 0.5;
      const px = Math.floor(x);
      v.check(
        Number.isInteger(surface) &&
          terrainSolidAt(map, px, surface - 1) &&
          !terrainSolidAt(map, px, surface),
        () => at() + ' is not sliding under the ceiling',
      );
    } else if ((flags & ShotFlag.Sliding) !== 0) {
      const surface = y + f.hh[i] + 0.5;
      const px = Math.floor(x);
      v.check(
        Number.isInteger(surface) &&
          terrainSolidAt(map, px, surface) &&
          !terrainSolidAt(map, px, surface - 1),
        () => at() + ' is not resting on the floor',
      );
    } else if (kind !== ShotKind.Missile && kind !== ShotKind.Torpedo && kind !== ShotKind.Upper) {
      v.check(!terrainSolidAt(map, Math.floor(x), Math.floor(y)), () => at() + ' inside rock');
    }
  }
  for (let s = 0; s < SHOOTERS_PER_PLAYER; s++) {
    for (let r = 0; r < WEAPON_ROLE_COUNT; r++) {
      const cap = roles[r]?.cap ?? 0;
      const n = counts[s * WEAPON_ROLE_COUNT + r];
      v.check(n <= cap, () => `${label} tick ${tick}: shooter ${s} role ${r}: ${n} > ${cap}`);
    }
  }
  const batch = w.weapons.batch;
  v.check(batch.count <= SHOT_BATCH_CAPACITY, () => `${label} tick ${tick}: batch ${batch.count}`);
  for (let k = 0; k < batch.count; k++) {
    const name = DB.sprites.names[batch.spriteId[k]];
    v.check(name.startsWith('shots/'), () => `${label} tick ${tick}: draws ${name}`);
  }
}

describe('integration: the meter arsenal on the shipped content (M2-03)', () => {
  it('ships four presets over named, drawn and labelled weapons', () => {
    expect(DB.weaponPresets.map((p) => p.id)).toEqual(['type-a', 'type-b', 'type-c', 'type-d']);
    for (const slot of ['missile', 'double', 'laser'] as const) {
      // The Weapon Edit weapons (M3-01: the Extra Edit ones are marked `extra`).
      const list = weaponsOfSlot(DB, slot).filter((weapon) => weapon.extra !== true);
      expect(list, slot).toHaveLength(4);
      for (const weapon of list) {
        expect(weapon.name, weapon.id).toMatch(/^[A-Z0-9 .-]{1,16}$/);
        expect(weapon.sprite, weapon.id).toMatch(/^shots\//);
        expect(DB.sprites.index.has(weapon.sprite), weapon.id).toBe(true);
        expect(weapon.sfx, weapon.id).not.toBeNull();
        expect(METER_LABEL_FRAMES, weapon.id).toContain(WEAPON_BEHAVIOR_LABELS[weapon.behavior]);
      }
    }
  });

  it('every Weapon Edit flies the test range within its caps and bounds', () => {
    const v = new Violations();
    // EDIT's weapons (the Extra Edit ones fly in the M3-01 test below).
    const ids = (slot: 'missile' | 'double' | 'laser'): string[] =>
      weaponsOfSlot(DB, slot)
        .filter((w) => w.extra !== true)
        .map((w) => w.id);
    let arsenals = 0;
    for (const missile of ids('missile')) {
      for (const double of ids('double')) {
        for (const laser of ids('laser')) {
          const label = `${missile}/${double}/${laser}`;
          const { g, platform } = game({
            stage: 'test-range',
            loadout: 'full',
            weaponEdit: { missile, double, laser },
          });
          const w = g.world;
          const seen = new Set<number>();
          for (let t = 0; t < 240; t++) {
            if (t === 120) w.weapons.loadouts[0].main = MainWeapon.Double;
            commitPlayerInput(platform.snapshot.players[0], weave(t));
            g.step();
            w.events.clear();
            checkArsenal(w, label, v, seen);
          }
          const roles = w.weapons.roleWeapons;
          for (const role of [WeaponRole.Missile, WeaponRole.Double, WeaponRole.Laser]) {
            const kind = WEAPON_BEHAVIOR_KINDS[roles[role]!.behavior];
            v.check(seen.has(kind), () => `${label}: role ${role} (kind ${kind}) never fired`);
          }
          arsenals++;
        }
      }
    }
    expect(arsenals).toBe(64);
    expect(v.list).toEqual([]);
  });

  it('every Extra Edit weapon (M3-01) flies the test range within its caps and bounds', () => {
    const v = new Violations();
    const extras = DB.weapons.filter((w) => w.extra === true);
    expect(extras.map((w) => w.id).sort()).toEqual([
      'missile.control',
      'missile.hawkWind',
      'missile.smallSpread',
      'missile.twoWayBack',
      'missile.upper',
      'shot.backDouble',
      'shot.spreadGun',
    ]);
    for (const weapon of extras) {
      const edit = { missile: 'missile.ground', double: 'shot.double', laser: 'laser.pierce' };
      if (weapon.slot === 'missile') edit.missile = weapon.id;
      else edit.double = weapon.id;
      const label = weapon.id;
      const { g, platform } = game({ stage: 'test-range', loadout: 'full', weaponEdit: edit });
      const w = g.world;
      const seen = new Set<number>();
      for (let t = 0; t < 240; t++) {
        if (t === 120) w.weapons.loadouts[0].main = MainWeapon.Double;
        commitPlayerInput(platform.snapshot.players[0], weave(t));
        g.step();
        w.events.clear();
        checkArsenal(w, label, v, seen);
      }
      const role = weapon.slot === 'missile' ? WeaponRole.Missile : WeaponRole.Double;
      const kind = WEAPON_BEHAVIOR_KINDS[w.weapons.roleWeapons[role]!.behavior];
      // Hawk Wind's shots fly as Missiles or Upper Missiles, never as its role's own kind.
      const fired =
        kind === ShotKind.HawkWind
          ? seen.has(ShotKind.Missile) || seen.has(ShotKind.Upper)
          : seen.has(kind);
      v.check(fired, () => `${label}: never fired`);
      expect(METER_LABEL_FRAMES, weapon.id).toContain(WEAPON_BEHAVIOR_LABELS[weapon.behavior]);
    }
    expect(v.list).toEqual([]);
  });

  it('two zone A sessions of every Types B–D preset stay in lockstep', () => {
    for (const preset of ['type-b', 'type-c', 'type-d']) {
      const hashes: number[][] = [];
      for (let k = 0; k < 2; k++) {
        const { g, platform } = game({ stage: 'zone-a', loadout: 'full', weaponPreset: preset });
        const out: number[] = [];
        for (let t = 0; t < 900; t++) {
          if (t === 450) g.world.weapons.loadouts[0].main = MainWeapon.Double;
          commitPlayerInput(platform.snapshot.players[0], weave(t));
          g.step();
          g.world.events.clear();
          if (t % 150 === 149) out.push(hashWorld(g.world));
        }
        hashes.push(out);
      }
      expect(hashes[0], preset).toEqual(hashes[1]);
      expect(new Set(hashes[0]).size, preset).toBe(hashes[0].length);
    }
  });
});

describe('integration: the weapon range of the select`s preview (M2-03)', () => {
  it('is harmless: no enemy bullet over a whole loop', () => {
    const { g } = game({ stage: 'weapon-range', loadout: 'full' });
    const w = g.world;
    let bullets = 0;
    let enemies = 0;
    for (let t = 0; t < 3300 && w.status === 'playing'; t++) {
      g.step();
      w.events.clear();
      bullets += w.bullets.count;
      if (w.enemies.count > enemies) enemies = w.enemies.count;
    }
    expect(w.status).toBe('stageClear');
    expect(enemies).toBeGreaterThan(0);
    expect(bullets).toBe(0);
  });

  it('the preview keeps flying across the range`s restart in a session on the shipped content', () => {
    const platform = createHeadlessPlatform();
    const g = createGame(platform, { seed: 5 }, DB, { scenes: 'title' });
    const flow = g.scenes!;
    /**
     * Presses and releases an action.
     *
     * @param action - The action.
     */
    const press = (action: number): void => {
      for (const held of [action, 0]) {
        commitPlayerInput(platform.snapshot.players[0], held);
        g.step();
        g.events.clear();
      }
    };
    press(Action.Confirm); // PRESS OK
    press(Action.Confirm); // START
    press(0);
    press(Action.Confirm); // NORMAL
    expect(flow.stack.top?.id).toBe('shipSelect');
    press(0);
    press(Action.Confirm); // KESTREL (M2-05)
    expect(flow.stack.top?.id).toBe('weaponSelect');
    const preview = flow.weaponSelect.preview!;
    expect(preview.stage?.stage.id).toBe('weapon-range');
    let restarts = 0;
    let camera = preview.camera.x;
    for (let t = 0; t < 3400; t++) {
      press(0);
      if (preview.camera.x < camera) restarts++;
      camera = preview.camera.x;
    }
    expect(restarts).toBeGreaterThanOrEqual(1);
    expect(preview.status).toBe('playing');
    expect(preview.players[0].state).toBe('alive');
    expect(flow.weaponSelect.menu.focus).toBe(WeaponSelectItem.Start);
  });
});
