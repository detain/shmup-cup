/**
 * `core/weapons` autofire modes (plan M2-16 — shmup_feat.md §4 "[P0] Autofire: hold-to-fire,
 * toggle mode, configurable rate"; the Options screen's AUTOFIRE / RATE): `'always'` fires with no
 * button, `'hold'` only while Shot / Sub are held, `'toggle'` flips each player's firing on a Shot
 * press (on at the start; Sub held still fires the missiles), remote mode forces always; the rate
 * is `autofireInterval`; the toggle switch is hashed only in the toggle mode (the other modes'
 * hashes — the golden replays' — are unchanged); two toggle worlds stay in lockstep.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
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

const { db: DB } = loadContent(
  [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
  { extraSprites: ENGINE_SPRITES },
);

/**
 * A free-flight world whose player 1 is alive, missiles equipped.
 *
 * @param config - Config overrides.
 * @returns The world.
 */
function world(config: Partial<GameConfig>): World {
  const w = createWorld(resolveGameConfig({ seed: 11, remoteMode: false, ...config }), DB);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.weapons.loadouts[0].missile = true;
  w.events.clear();
  return w;
}

/**
 * Runs ticks with player 1 holding a mask (pressed on the first tick) and counts the shots fired.
 *
 * @param w - The world.
 * @param held - Held actions.
 * @param ticks - Ticks.
 * @returns Shots in the pool afterwards that were fired during the run (the pool's count grows).
 */
function fire(w: World, held: number, ticks: number): number {
  const input = createInputSnapshot();
  let fired = 0;
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], held);
    const before = w.weapons.count;
    stepWorld(w, input);
    if (w.weapons.count > before) fired += w.weapons.count - before;
  }
  return fired;
}

/**
 * Presses and releases Shot once (two ticks).
 *
 * @param w - The world.
 */
function tapShot(w: World): void {
  fire(w, Action.Shot, 1);
  fire(w, 0, 1);
}

describe('core/weapons autofire modes (M2-16)', () => {
  it('always (the default) fires with no button', () => {
    expect(resolveGameConfig().autofireMode).toBe('always');
    expect(fire(world({}), 0, 30)).toBeGreaterThan(0);
  });

  it('hold fires only while Shot is held; autofire off is the same', () => {
    for (const config of [{ autofireMode: 'hold' as const }, { autofire: false }]) {
      const w = world(config);
      expect(fire(w, 0, 30)).toBe(0);
      expect(fire(w, Action.Shot, 30)).toBeGreaterThan(0);
    }
  });

  it('toggle starts firing, a Shot press stops it, the next starts it again', () => {
    const w = world({ autofireMode: 'toggle' });
    expect(w.weapons.firing[0]).toBe(1);
    expect(fire(w, 0, 20)).toBeGreaterThan(0);
    tapShot(w);
    expect(w.weapons.firing[0]).toBe(0);
    fire(w, 0, 60); // the shots in flight leave
    expect(fire(w, 0, 30)).toBe(0);
    // Holding Shot is one press: firing is back on for as long as it stays so.
    fire(w, Action.Shot, 1);
    expect(w.weapons.firing[0]).toBe(1);
    expect(fire(w, 0, 30)).toBeGreaterThan(0);
  });

  it('toggle off still fires missiles while Sub is held', () => {
    const w = world({ autofireMode: 'toggle' });
    tapShot(w);
    fire(w, 0, 60);
    expect(fire(w, 0, 30)).toBe(0);
    expect(fire(w, Action.Sub, 30)).toBeGreaterThan(0);
  });

  it('remote mode forces always, whatever the mode', () => {
    for (const autofireMode of ['toggle', 'hold'] as const) {
      const w = world({ autofireMode, remoteMode: true });
      expect(fire(w, 0, 30), autofireMode).toBeGreaterThan(0);
      tapShot(w);
      expect(w.weapons.firing[0]).toBe(1); // no toggling in remote mode
    }
  });

  it('the rate is autofireInterval: the main shot’s refire timer restarts at it', () => {
    const timerAfterShot = (interval: number): number => {
      const w = world({ autofireInterval: interval });
      // The first tick fires (the timer was 0) and restarts the main timer of shooter 0.
      fire(w, 0, 1);
      return w.weapons.timers[0];
    };
    const fast = timerAfterShot(2);
    const slow = timerAfterShot(8);
    expect(slow - fast).toBe(6);
  });

  it('hashes the toggle switch only in the toggle mode', () => {
    const always = world({});
    const h = hashWorld(always);
    always.weapons.firing[0] = 0;
    expect(hashWorld(always)).toBe(h);
    const toggle = world({ autofireMode: 'toggle' });
    const t = hashWorld(toggle);
    toggle.weapons.firing[0] = 0;
    expect(hashWorld(toggle)).not.toBe(t);
  });

  it('keeps two toggle worlds fed the same input in lockstep', () => {
    const a = world({ autofireMode: 'toggle' });
    const b = world({ autofireMode: 'toggle' });
    const input = createInputSnapshot();
    for (let t = 0; t < 400; t++) {
      commitPlayerInput(input.players[0], t % 50 < 2 ? Action.Shot : t % 90 < 30 ? Action.Up : 0);
      stepWorld(a, input);
      stepWorld(b, input);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('rejects an unknown mode', () => {
    expect(() => resolveGameConfig({ autofireMode: 'burst' as never })).toThrow(RangeError);
  });
});
