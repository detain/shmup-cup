/**
 * R2-02.T0: the v1 → v2 mapping helper is the identity while the world is ×1 and the port's ×3/2
 * (+36 pad) under the kit — and its row mappers follow `test/fixtures/v1-baseline/README.md`
 * § "Comparing a v2 run" at both scales, tested with `k` and `pad` passed in so either tree runs
 * every rule.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/index.js';
import {
  K,
  PAD,
  V1_FRAME,
  mapBossRow,
  mapEnemyRow,
  v1rel,
  v1screenX,
  v1screenY,
  v1speed,
  v1x,
  v1y,
  type BossRow,
  type EnemyRow,
} from './v1-port.js';

/** The port's scale and pad — the values R2-02.S flips the live constants to (the kit proves them). */
const PORT_K = 1.5;
const PORT_PAD = 36;

/**
 * An enemy row with the given entry code and position columns (every other column holds its own
 * index, the fate `k`) — the fixture rows of the mapping rules.
 */
function enemyRow(entry: string, p: Partial<Record<4 | 5 | 8 | 9 | 11 | 12, number>>): EnemyRow {
  const out: (number | string)[] = [0, 1, 2, 3, 4, 5, entry, 7, 8, 9, 10, 11, 12, 13, 'k'];
  for (const column of [4, 5, 8, 9, 11, 12] as const) {
    if (p[column] !== undefined) out[column] = p[column];
  }
  return out as unknown as EnemyRow;
}

describe('the v1 → v2 mapping helper (R2-02.T0)', () => {
  it('holds the live scale, pad and v1 playfield', () => {
    expect(V1_FRAME).toEqual({ w: 384, h: 200 });
    // The live constants are what the maps use (identity while the world is ×1):
    expect(v1x(1)).toBe(K);
    expect(v1y(1)).toBe(K + PAD);
  });

  it('maps by the rules of plan §2.6 at the live scale', () => {
    expect(v1x(100)).toBe(100 * K);
    expect(v1x(0)).toBe(0);
    expect(v1y(100)).toBe(100 * K + PAD);
    expect(v1y(0)).toBe(PAD); // a lone value at the top edge moves with the pad
    expect(v1y(-24)).toBe(-24 * K); // above the top edge: ×K only
    expect(v1rel(16)).toBe(16 * K);
    expect(v1speed(2.5)).toBe(2.5 * K);
  });

  it('is the identity at K = 1', () => {
    if (K === 1) {
      expect(v1x(100)).toBe(100);
      expect(v1y(100)).toBe(100);
      expect(v1y(-24)).toBe(-24);
      expect(v1rel(16)).toBe(16);
      expect(v1speed(2.5)).toBe(2.5);
      expect(v1screenX(256)).toBe(256);
      expect(v1screenX(400)).toBe(400);
      expect(v1screenY(100)).toBe(100);
      expect(v1screenY(40)).toBe(40);
    }
  });

  it('is the port scale under the kit', () => {
    if (K !== 1) {
      expect(K).toBe(PORT_K);
      expect(PAD).toBe(PORT_PAD);
      expect(v1x(100)).toBe(150);
      expect(v1y(100)).toBe(186);
      expect(v1y(-24)).toBe(-36);
    }
  });

  it('maps screen anchors through rescaleNumber only once the world scales', () => {
    if (K === 1) {
      expect(v1screenX(256)).toBe(256);
      expect(v1screenY(40)).toBe(40);
    } else {
      // The kit's own flips (test/port-v2/two-scale.sh): anchors keep their distance to the
      // nearest start / centre / end ×1.5 — of the NEW playfield.
      expect(v1screenX(256)).toBe(416); // orbiter.loop.x — centre anchor
      expect(v1screenX(400)).toBe(664); // a spawn W + 16 → W′ + 24
      expect(v1screenX(40)).toBe(60); // captain.ram.ramX — start anchor
      expect(v1screenY(100)).toBe(168); // the v1 centre row → the live centre
      expect(v1screenY(160)).toBe(276); // captain.crab.maxY — end anchor
      expect(v1screenY(56)).toBe(102); // boss.widow.minY — centre anchor
    }
  });
});

describe('the enemy-row mapper (README § Comparing a v2 run)', () => {
  it('is the identity at k = 1, pad = 0', () => {
    const r = enemyRow('I', { 4: 120, 5: 64 });
    const m = mapEnemyRow(r, 1, 0);
    for (let column = 0; column < 15; column++) expect(m[column]).toBe(r[column]);
  });

  it('scales a plain row ×1.5 + the pad at the port scale', () => {
    const r = enemyRow('I', { 4: 100, 5: 100, 8: 300, 9: 40, 11: 12, 12: 80 });
    const m = mapEnemyRow(r, PORT_K, PORT_PAD);
    expect(m[4]).toBe(150); // x0: ×k
    expect(m[5]).toBe(186); // y0: ×k + P
    expect(m[8]).toBe(450); // visibleX
    expect(m[9]).toBe(96); // visibleY
    expect(m[11]).toBe(18); // turnX
    expect(m[12]).toBe(156); // turnY
  });

  it('keeps right-edge anchors on the right edge and a T entry above the top edge', () => {
    const r = enemyRow('TR', { 4: 400, 5: -24, 8: 402, 9: -10, 11: 380, 12: 60 });
    const m = mapEnemyRow(r, PORT_K, PORT_PAD);
    expect(m[4]).toBe(PLAYFIELD_W + 1.5 * 16); // x0: W′ + k·(x − W)
    expect(m[8]).toBe(PLAYFIELD_W + 1.5 * 18); // the spawn keeps its edge offset all its life
    expect(m[11]).toBe(PLAYFIELD_W - 1.5 * 4);
    expect(m[5]).toBe(-36); // y0: k·y — above the top edge stays above it
    expect(m[9]).toBe(-15); // visibleY of a T entry: k·y (the README's row)
    expect(m[12]).toBe(1.5 * 60 + PORT_PAD); // the landing: k·y + P (within 2 px)
  });

  it('passes ticks, indices, the fate and −1 columns through unmapped', () => {
    const never: EnemyRow = [3, -1, 2, 401, 100, -1, 'I', -1, -1, -1, -1, -1, -1, 900, 'e'];
    const m = mapEnemyRow(never, PORT_K, PORT_PAD);
    expect(m[0]).toBe(3); // the event index is not a position
    expect(m[1]).toBe(-1); // the member index stays
    expect(m[3]).toBe(401); // the spawn tick: equal
    expect(m[4]).toBe(150); // the position column maps
    expect(m[5]).toBe(-1); // a NEVER position stays NEVER
    expect(m[7]).toBe(-1); // a NEVER tick stays NEVER
    expect(m[9]).toBe(-1);
    expect(m[12]).toBe(-1);
    expect(m[13]).toBe(900);
    expect(m[14]).toBe('e');
  });

  it('keeps a T entry above the top edge for y0 and visibleY even inside the playfield', () => {
    // A T row whose y0 already crossed the edge (the hurtbox overlapped at spawn): k·y only.
    const r: EnemyRow = [0, -1, 2, 10, 100, 8, 'T', 20, 150, 3, 30, 150, 64, -1, 'a'];
    const m = mapEnemyRow(r, PORT_K, PORT_PAD);
    expect(m[5]).toBe(12); // y0: k·y (no pad: the T rule)
    expect(m[9]).toBe(4.5); // visibleY: k·y
    expect(m[12]).toBe(1.5 * 64 + PORT_PAD); // turnY: the landing gets the pad
  });
});

describe('the boss-row mapper (README § Comparing a v2 run)', () => {
  it('anchors intro and fight homes and keeps every tick at the port scale', () => {
    const b: BossRow = ['HALCYON BULWARK', 0, 100, 140, 400, 100, 200, 296, 100, 9000, -1, 9120];
    const m = mapBossRow(b, PORT_K);
    expect(m[0]).toBe('HALCYON BULWARK');
    expect(m[1]).toBe(0); // the role is an index
    expect(m[2]).toBe(100); // every tick is equal
    expect(m[3]).toBe(140);
    expect(m[4]).toBe(PLAYFIELD_W + 1.5 * 16); // introX: just past the right edge
    expect(m[5]).toBe(PLAYFIELD_H / 2); // introY: the v1 centre → the live centre
    expect(m[6]).toBe(200);
    expect(m[7]).toBe(PLAYFIELD_W - 1.5 * (V1_FRAME.w - 296)); // fightX: right − k·margin
    expect(m[8]).toBe(PLAYFIELD_H / 2); // fightY: centre + k·offset (offset 0 here)
    expect(m[9]).toBe(9000);
    expect(m[10]).toBe(-1); // a NEVER tick stays NEVER
    expect(m[11]).toBe(9120);
  });

  it('maps an off-centre y home and passes −1 positions through', () => {
    const b: BossRow = ['IRON LEVIATHAN', 1, 50, 90, -1, 60, 150, 250, 140, -1, 700, 800];
    const m = mapBossRow(b, PORT_K);
    expect(m[4]).toBe(-1);
    expect(m[5]).toBe(PLAYFIELD_H / 2 + 1.5 * (60 - V1_FRAME.h / 2));
    expect(m[7]).toBe(PLAYFIELD_W - 1.5 * (V1_FRAME.w - 250));
    expect(m[8]).toBe(PLAYFIELD_H / 2 + 1.5 * (140 - V1_FRAME.h / 2));
  });

  it('follows only the frame at k = 1 (the live frame is already v2)', () => {
    const m = mapBossRow(['X', 0, 1, 2, 3, 100, 5, 296, 100, 7, 8, 9], 1);
    expect(m[4]).toBe(PLAYFIELD_W + (3 - V1_FRAME.w));
    expect(m[7]).toBe(PLAYFIELD_W - (V1_FRAME.w - 296));
    expect(m[8]).toBe(PLAYFIELD_H / 2);
  });
});
