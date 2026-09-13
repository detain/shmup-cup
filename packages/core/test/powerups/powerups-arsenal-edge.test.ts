/**
 * `core/powerups` — edge cases of the meter arsenal of plan M2-03 (the main suite is
 * `powerups-arsenal.test.ts`): `lifeOptionCount` bounds, greyed `!` choices that leave everything
 * untouched, FULL BARRIER over a broken shield, unknown slots, the choices' objects; in a World:
 * SPEED DOWN / LIFE OPTION / FULL BARRIER presses and their denials, Auto Power-Up parking on a
 * greyed `!`; and the HUD's meter labels (`meterLabelFrame`, `buildHud`) for every type, a weapon
 * without a label frame and an arsenal swapped in place.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MAX_OPTIONS } from '../../src/options/index.js';
import { createPlayer } from '../../src/player/index.js';
import {
  DEFAULT_METER_CHOICES,
  METER_SLOT_COUNT,
  MegaEffect,
  MeterChoices,
  MeterSlot,
  canEquipSlot,
  equipSlot,
  equippableSlots,
  lifeOptionCount,
  megaEffectOf,
  meterChoicesOf,
} from '../../src/powerups/index.js';
import { DrawOp, createDrawList } from '../../src/presentation/index.js';
import {
  FORCE_FIELD,
  FORCE_FIELD_HITS,
  ShieldKind,
  absorbShieldHit,
  grantShield,
} from '../../src/shields/index.js';
import {
  METER_LABEL_FRAMES,
  buildHud,
  meterLabelFrame,
  resolveUiSprites,
} from '../../src/ui/index.js';
import { Loadout, MainWeapon, resolveArsenal } from '../../src/weapons/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** The KESTREL and the shipped Type A and Types B–D weapons. */
const DB: ContentDb = ((): ContentDb => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('weapons/types-b-d.weapons.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A free-flight world whose player 1 is alive (autofire on).
 *
 * @param config - Config overrides.
 * @param content - The content (default {@link DB}).
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, content: ContentDb = DB): World {
  const w = createWorld(resolveGameConfig({ seed: 3, ...config }), content);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Highlights a slot and presses PowerUp (one tick pressed, one released).
 *
 * @param w - The world.
 * @param slot - `MeterSlot`.
 * @returns The events of the two ticks.
 */
function press(w: World, slot: number): SimEvent[] {
  w.powerups.meters[0].cursor = slot;
  const input = createInputSnapshot();
  const out: SimEvent[] = [];
  commitPlayerInput(input.players[0], Action.PowerUp);
  stepWorld(w, input);
  w.events.drain((e) => out.push({ ...e }));
  commitPlayerInput(input.players[0], 0);
  stepWorld(w, input);
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Whether the events hold an SFX cue.
 *
 * @param events - Events.
 * @param cue - `SFX_CUES` id.
 * @returns Whether it was pushed.
 */
function sounded(events: readonly SimEvent[], cue: number): boolean {
  return events.some((e) => e.kind === SimEventKind.Sfx && e.id === cue);
}

/**
 * Meter choices for a `!` effect (Force Field on `?`).
 *
 * @param mega - `MegaEffect`.
 * @returns The choices.
 */
function choices(mega: MegaEffect): MeterChoices {
  const c = new MeterChoices();
  c.mega = mega;
  return c;
}

describe('core/powerups arsenal edges (M2-03): the pure rules', () => {
  it('lifeOptionCount: spare ships capped by the room for Options, never negative', () => {
    const count = (lives: number | undefined, options: number): number => {
      const loadout = new Loadout();
      loadout.options = options;
      const ship = createPlayer(0, 3);
      return lifeOptionCount({ speedLevel: 0, shield: ship.shield, lives }, loadout);
    };
    expect(count(9, 0)).toBe(MAX_OPTIONS);
    expect(count(9, 3)).toBe(1);
    expect(count(3, 0)).toBe(2);
    expect(count(1, 0)).toBe(0);
    expect(count(0, 0)).toBe(0);
    expect(count(-2, 0)).toBe(0);
    expect(count(undefined, 0)).toBe(0);
    expect(count(5, MAX_OPTIONS)).toBe(0);
    expect(count(5, MAX_OPTIONS + 2)).toBe(0);
  });

  it('a greyed `!` choice is refused and changes nothing', () => {
    const ship = createPlayer(0, 1);
    const loadout = new Loadout();
    loadout.options = 1;
    grantShield(ship.shield);
    const snapshot = (): string => JSON.stringify([ship, loadout]);
    const before = snapshot();
    for (const mega of [
      MegaEffect.Normal,
      MegaEffect.SpeedDown,
      MegaEffect.LifeOption,
      MegaEffect.FullBarrier,
    ]) {
      expect(canEquipSlot(MeterSlot.Mega, ship, loadout, 3, choices(mega)), String(mega)).toBe(
        false,
      );
      expect(equipSlot(MeterSlot.Mega, ship, loadout, 3, choices(mega)), String(mega)).toBe(false);
      expect(snapshot(), String(mega)).toBe(before);
    }
    // Mega Crash is always there, with no lasting effect.
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 3, choices(MegaEffect.MegaCrash))).toBe(true);
    expect(snapshot()).toBe(before);
  });

  it('SPEED DOWN from level 1 reaches 0 and is then greyed; NORMAL leaves the Missile and Options', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    ship.speedLevel = 1;
    const down = choices(MegaEffect.SpeedDown);
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 3, down)).toBe(true);
    expect(ship.speedLevel).toBe(0);
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 3, down)).toBe(false);
    // SPEED UP is free again after a SPEED DOWN at the top.
    ship.speedLevel = 3;
    expect(canEquipSlot(MeterSlot.Speed, ship, loadout, 3, down)).toBe(false);
    equipSlot(MeterSlot.Mega, ship, loadout, 3, down);
    expect(canEquipSlot(MeterSlot.Speed, ship, loadout, 3, down)).toBe(true);
    // NORMAL only touches the main weapon.
    loadout.main = MainWeapon.Double;
    loadout.missile = true;
    loadout.options = 3;
    equipSlot(MeterSlot.Mega, ship, loadout, 3, choices(MegaEffect.Normal));
    expect([loadout.main, loadout.missile, loadout.options]).toEqual([MainWeapon.Basic, true, 3]);
    // …which makes DOUBLE and LASER equippable again.
    expect(canEquipSlot(MeterSlot.Double, ship, loadout, 3)).toBe(true);
    expect(canEquipSlot(MeterSlot.Laser, ship, loadout, 3)).toBe(true);
  });

  it('FULL BARRIER restores a broken shield (its i-frames cleared); `?` is equippable then too', () => {
    const ship = createPlayer(0, 3);
    const loadout = new Loadout();
    const barrier = choices(MegaEffect.FullBarrier);
    grantShield(ship.shield);
    for (let t = 0; t < FORCE_FIELD_HITS; t++) {
      ship.shield.iFrames = 0;
      absorbShieldHit(ship.shield, false, t);
    }
    expect(ship.shield.kind).toBe(ShieldKind.None);
    expect(ship.shield.iFrames).toBeGreaterThan(0);
    expect(canEquipSlot(MeterSlot.Shield, ship, loadout, 3, barrier)).toBe(true);
    expect(equipSlot(MeterSlot.Mega, ship, loadout, 3, barrier)).toBe(true);
    expect([ship.shield.kind, ship.shield.hits, ship.shield.maxHits, ship.shield.iFrames]).toEqual([
      ShieldKind.ForceField,
      FORCE_FIELD_HITS,
      FORCE_FIELD_HITS,
      0,
    ]);
    // One hit down: FULL BARRIER is available, `?` is not.
    absorbShieldHit(ship.shield, false, 100);
    expect(equippableSlots(ship, loadout, 3, barrier) & (1 << MeterSlot.Mega)).not.toBe(0);
    expect(equippableSlots(ship, loadout, 3, barrier) & (1 << MeterSlot.Shield)).toBe(0);
  });

  it('refuses unknown slots whatever the choices; the choice objects are independent', () => {
    const ship = createPlayer(0, 5);
    const loadout = new Loadout();
    for (const mega of [0, 1, 2, 3, 4] as MegaEffect[]) {
      for (const slot of [-1, METER_SLOT_COUNT, 99, 1.5, NaN]) {
        expect(canEquipSlot(slot, ship, loadout, 3, choices(mega))).toBe(false);
        expect(equipSlot(slot, ship, loadout, 3, choices(mega))).toBe(false);
      }
      // The mask only ever holds bits 0–6.
      expect(equippableSlots(ship, loadout, 3, choices(mega)) >> METER_SLOT_COUNT).toBe(0);
    }
    const a = meterChoicesOf(resolveGameConfig({ megaChoice: 'normal' }));
    const b = meterChoicesOf(resolveGameConfig({ megaChoice: 'normal' }));
    expect(a).not.toBe(b);
    a.mega = MegaEffect.SpeedDown;
    expect(b.mega).toBe(MegaEffect.Normal);
    expect(b.shield).toBe(FORCE_FIELD);
    expect(() => {
      (DEFAULT_METER_CHOICES as MeterChoices).mega = MegaEffect.Normal;
    }).toThrow(TypeError);
    expect(megaEffectOf('toString' as never)).toBe(MegaEffect.MegaCrash);
  });
});

describe('core/powerups arsenal edges (M2-03): `!` in a World', () => {
  it('SPEED DOWN slows the ship a level; at level 0 the press is denied and the cursor stays', () => {
    const w = world({ megaChoice: 'speedDown' });
    expect(w.powerups.equippable(0) & (1 << MeterSlot.Mega)).toBe(0);
    const denied = press(w, MeterSlot.Mega);
    expect(sounded(denied, SFX_CUES.PowerUpDenied)).toBe(true);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Mega);
    w.players[0].speedLevel = 2;
    const events = press(w, MeterSlot.Mega);
    expect(sounded(events, SFX_CUES.PowerUpEquip)).toBe(true);
    expect(w.players[0].speedLevel).toBe(1);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    expect(w.powerups.megaPending[0]).toBe(0);
  });

  it('LIFE OPTION fills the Options up to four and keeps the rest of the stock', () => {
    const w = world({ megaChoice: 'lifeOption', startingLives: 5 });
    w.weapons.loadouts[0].options = 3;
    press(w, MeterSlot.Mega);
    expect([w.weapons.loadouts[0].options, w.players[0].lives]).toEqual([4, 4]);
    // Four Options: greyed now, even with ships in stock.
    expect(w.powerups.equippable(0) & (1 << MeterSlot.Mega)).toBe(0);
    for (let t = 0; t < 30; t++) stepWorld(w, createInputSnapshot());
    expect(w.weapons.options[0].count).toBe(4);
    // A one-ship game never offers it.
    const last = world({ megaChoice: 'lifeOption', startingLives: 1 });
    expect(last.powerups.equippable(0) & (1 << MeterSlot.Mega)).toBe(0);
    expect(sounded(press(last, MeterSlot.Mega), SFX_CUES.PowerUpDenied)).toBe(true);
    expect(last.players[0].lives).toBe(1);
  });

  it('FULL BARRIER raises the `?` shield (drawn, no Mega Crash); at full strength it is denied', () => {
    const w = world({ megaChoice: 'fullBarrier' });
    const events = press(w, MeterSlot.Mega);
    expect(events.some((e) => e.kind === SimEventKind.Flash)).toBe(false);
    expect(w.powerups.megaPending[0]).toBe(0);
    expect([w.players[0].shield.kind, w.players[0].shield.hits]).toEqual([
      ShieldKind.ForceField,
      FORCE_FIELD_HITS,
    ]);
    stepWorld(w, createInputSnapshot());
    expect(w.powerups.shieldBatch.count).toBe(1);
    expect(sounded(press(w, MeterSlot.Mega), SFX_CUES.PowerUpDenied)).toBe(true);
  });

  it('Auto Power-Up parks on a greyed `!` (the cursor stays until it can be equipped)', () => {
    const w = world({ megaChoice: 'speedDown', autoPowerUp: true, autoPowerUpOrder: ['mega'] });
    for (let k = 0; k < METER_SLOT_COUNT; k++) w.powerups.collect(0);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Mega);
    expect(w.players[0].speedLevel).toBe(0);
    // Once the choice can act, the next time the cursor lands there it does.
    w.players[0].speedLevel = 1;
    for (let k = 0; k < METER_SLOT_COUNT; k++) w.powerups.collect(0);
    expect(w.players[0].speedLevel).toBe(0);
    expect(w.powerups.meters[0].cursor).toBe(-1);
  });
});

describe('core/powerups arsenal edges (M2-03): the HUD`s meter labels', () => {
  it('names only MISSILE / DOUBLE / LASER after the arsenal; other slots keep theirs', () => {
    const w = world({ weaponPreset: 'type-c' });
    for (const slot of [MeterSlot.Speed, MeterSlot.Option, MeterSlot.Shield, MeterSlot.Mega]) {
      expect(meterLabelFrame(w, slot)).toBe(slot);
    }
    expect(meterLabelFrame(w, -1)).toBe(-1);
    expect(meterLabelFrame(w, METER_SLOT_COUNT)).toBe(METER_SLOT_COUNT);
    // The names follow an arsenal swapped in place (the preview's setArsenal).
    w.weapons.setArsenal(resolveArsenal(DB, { weaponPreset: 'type-b', weaponEdit: null }));
    expect(
      [MeterSlot.Missile, MeterSlot.Double, MeterSlot.Laser].map(
        (slot) => METER_LABEL_FRAMES[meterLabelFrame(w, slot)],
      ),
    ).toEqual(['SPREAD', 'TAIL', 'RIPPLE']);
    w.weapons.setArsenal([]);
    expect(meterLabelFrame(w, MeterSlot.Laser)).toBe(MeterSlot.Laser);
  });

  it('a weapon whose behaviour has no label frame shows the slot`s own label', () => {
    const { db } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        {
          path: 'weapons/odd.weapons.json',
          data: {
            formatVersion: 1,
            kind: 'weapons',
            weapons: [
              {
                id: 'odd.main',
                slot: 'main',
                behavior: 'shot.straight',
                damage: 1,
                speed: 6,
                cap: 2,
                pierce: false,
                sprite: 'shots/basic',
              },
              {
                id: 'odd.missile',
                slot: 'missile',
                behavior: 'shot.straight',
                damage: 1,
                speed: 6,
                cap: 1,
                pierce: false,
                sprite: 'shots/basic',
              },
            ],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    const w = createWorld(resolveGameConfig({ seed: 1 }), db);
    expect(w.weapons.roleWeapons[3]?.id).toBe('odd.missile');
    expect(meterLabelFrame(w, MeterSlot.Missile)).toBe(MeterSlot.Missile);
    expect(meterLabelFrame(w, MeterSlot.Double)).toBe(MeterSlot.Double);
  });

  it('buildHud draws each type`s label frames, dimming a greyed `!` choice', () => {
    for (const [preset, labels] of [
      ['type-a', ['MISSILE', 'DOUBLE', 'LASER']],
      ['type-b', ['SPREAD', 'TAIL', 'RIPPLE']],
      ['type-c', ['2-WAY', 'VERTICAL', 'CYCLONE']],
      ['type-d', ['TORPEDO', 'FREE WAY', 'TWIN']],
    ] as const) {
      const w = world({ weaponPreset: preset, megaChoice: 'normal' });
      const sprites = resolveUiSprites(w.content);
      expect(sprites.meterLabels).toBeGreaterThanOrEqual(0);
      const list = createDrawList();
      buildHud(w, list, sprites);
      const drawn: { frame: number; color: number }[] = [];
      for (let i = 0; i < list.count; i++) {
        if (list.op[i] === DrawOp.Sprite && list.ref[i] === sprites.meterLabels) {
          drawn.push({ frame: list.frame[i], color: list.color[i] });
        }
      }
      expect(
        drawn.map((d) => METER_LABEL_FRAMES[d.frame]),
        preset,
      ).toEqual(['SPEED', ...labels, 'OPTION', '?', '!']);
      // NORMAL on the basic shot is greyed: its label is tinted like no other enabled one.
      const enabled = drawn[MeterSlot.Speed].color;
      expect(drawn[MeterSlot.Mega].color, preset).not.toBe(enabled);
      expect(drawn[MeterSlot.Missile].color, preset).toBe(enabled);
    }
  });
});
