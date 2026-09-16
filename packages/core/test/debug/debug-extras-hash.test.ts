/**
 * `hashWorld` and the M3-02 extras (`mixExtras`): every new term is mixed **only** in a World
 * whose config asks for it, which is what lets every golden replay recorded before M3-02 keep its
 * hashes. Checked here term by term — the slowdown's clock, the graze count, the ships' bomb stock
 * and death-bomb window, the open vortices and a boss's pull field.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

const db = directDb();

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

/**
 * The boss range's content.
 *
 * @returns The DB.
 */
function bossDb(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('enemies/test-range.enemies.json'),
      shipped('enemies/test-boss.enemies.json'),
      shipped('stages/test-boss.stage.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/debug — hashWorld and the M3-02 extras', () => {
  it('ignores the black holes and the bombs in a World that has neither option', () => {
    const w = aliveWorld(db);
    const before = hashWorld(w);
    // The system exists in every World; with the option off nothing about it is hashed.
    w.players[0].bombs = 3;
    w.players[0].bombTicks = 5;
    w.blackholes.fire(0);
    expect(w.blackholes.count).toBe(1);
    expect(hashWorld(w)).toBe(before);
  });

  it('hashes the stock and the window as soon as either option is on', () => {
    for (const config of [{ blackHole: true }, { deathBomb: 8 }]) {
      const w = aliveWorld(db, config);
      const before = hashWorld(w);
      w.players[0].bombs++;
      expect(hashWorld(w)).not.toBe(before);
      const mid = hashWorld(w);
      w.players[0].bombTicks = 4;
      expect(hashWorld(w)).not.toBe(mid);
    }
  });

  it('hashes an open vortex, and closing it brings the hash back', () => {
    const w = aliveWorld(db, { blackHole: true });
    const quiet = hashWorld(w);
    expect(w.blackholes.fire(0)).toBe(true);
    const open = hashWorld(w);
    expect(open).not.toBe(quiet);
    // Its position matters (it drifts with the camera).
    w.blackholes.holes[0].x += 4;
    expect(hashWorld(w)).not.toBe(open);
    w.blackholes.clear();
    w.players[0].bombs++; // the throw spent one
    expect(hashWorld(w)).toBe(quiet);
  });

  it('hashes the slowdown clock and the graze count only with their options', () => {
    const off = aliveWorld(db);
    const base = hashWorld(off);
    off.slowLoad = 200;
    off.slowRun = 1;
    off.slowSkip = true;
    off.grazes = 7;
    expect(hashWorld(off)).toBe(base);

    const slow = aliveWorld(db, { slowdown: true });
    const slowBase = hashWorld(slow);
    slow.slowLoad += 1;
    expect(hashWorld(slow)).not.toBe(slowBase);

    const graze = aliveWorld(db, { graze: true });
    const grazeBase = hashWorld(graze);
    graze.grazes += 1;
    expect(hashWorld(graze)).not.toBe(grazeBase);
  });

  it('hashes a boss pull field only while one is open', () => {
    const w = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 5 }), bossDb());
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    for (let i = 0; i < 3000 && w.bosses.boss.state !== BossState.Fight; i++) stepWorld(w, input);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    const boss = w.bosses.boss;
    const closed = hashWorld(w);
    // A closed field's strength and ticks are not mixed at all.
    boss.pullStrength = 9;
    boss.pullTicks = 42;
    expect(hashWorld(w)).toBe(closed);
    boss.pullRadius = 200;
    const open = hashWorld(w);
    expect(open).not.toBe(closed);
    boss.pullStrength = 1;
    expect(hashWorld(w)).not.toBe(open);
  });

  it('is deterministic: two identical extras Worlds hash the same after a run', () => {
    /**
     * A world with every extra on, run for a while.
     *
     * @returns Its hash.
     */
    const play = (): number => {
      const w: World = aliveWorld(db, {
        blackHole: true,
        deathBomb: 8,
        graze: true,
        slowdown: true,
      });
      const input = createInputSnapshot();
      w.blackholes.fire(0);
      for (let i = 0; i < 200; i++) stepWorld(w, input);
      return hashWorld(w);
    };
    expect(play()).toBe(play());
  });
});
