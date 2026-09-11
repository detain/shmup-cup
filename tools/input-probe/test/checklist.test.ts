/**
 * checklist: detection rules for every item, stickiness and display helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  CHECKLIST_LABELS,
  CHECKLIST_ORDER,
  Checklist,
  LONG_HOLD_MS,
  evaluateChecklist,
  type ChecklistFacts,
} from '../src/checklist';

const NONE: ChecklistFacts = {
  seenCodes: [],
  longestHoldMs: 0,
  diagonalAttempts: 0,
  chordAttempts: 0,
  gamepadSeen: false,
  leftAndReturned: false,
};

function facts(over: Partial<ChecklistFacts>): ChecklistFacts {
  return { ...NONE, ...over };
}

describe('evaluateChecklist', () => {
  it('nothing observed → nothing ticked', () => {
    expect(Object.values(evaluateChecklist(NONE)).every((v) => !v)).toBe(true);
  });

  it('arrows needs all four arrows', () => {
    expect(evaluateChecklist(facts({ seenCodes: [37, 38, 39] })).arrows).toBe(false);
    expect(evaluateChecklist(facts({ seenCodes: [40, 39, 38, 37] })).arrows).toBe(true);
  });

  it('okBack needs both OK and Back', () => {
    expect(evaluateChecklist(facts({ seenCodes: [13] })).okBack).toBe(false);
    expect(evaluateChecklist(facts({ seenCodes: [10009] })).okBack).toBe(false);
    expect(evaluateChecklist(facts({ seenCodes: [13, 10009] })).okBack).toBe(true);
  });

  it('longHold at ≥ 1.5 s', () => {
    expect(LONG_HOLD_MS).toBe(1500);
    expect(evaluateChecklist(facts({ longestHoldMs: 1499.9 })).longHold).toBe(false);
    expect(evaluateChecklist(facts({ longestHoldMs: 1500 })).longHold).toBe(true);
  });

  it('diagonal / okWhileArrow need a conclusive attempt', () => {
    expect(evaluateChecklist(facts({ diagonalAttempts: 1 })).diagonal).toBe(true);
    expect(evaluateChecklist(facts({ chordAttempts: 1 })).okWhileArrow).toBe(true);
  });

  it('extraKey: any key beyond arrows/OK/Back', () => {
    expect(evaluateChecklist(facts({ seenCodes: [37, 38, 39, 40, 13, 10009] })).extraKey).toBe(false);
    expect(evaluateChecklist(facts({ seenCodes: [37, 10252] })).extraKey).toBe(true);
    expect(evaluateChecklist(facts({ seenCodes: [449] })).extraKey).toBe(true);
  });

  it('gamepad and home/return pass through', () => {
    const r = evaluateChecklist(facts({ gamepadSeen: true, leftAndReturned: true }));
    expect(r.gamepad).toBe(true);
    expect(r.homeReturn).toBe(true);
  });
});

describe('Checklist (sticky)', () => {
  it('reports newly ticked items once, in display order, and never un-ticks', () => {
    const c = new Checklist();
    expect(c.doneCount).toBe(0);
    expect(c.update(facts({ gamepadSeen: true, seenCodes: [13, 10009] }))).toEqual(['okBack', 'gamepad']);
    expect(c.update(facts({ gamepadSeen: true, seenCodes: [13, 10009] }))).toEqual([]);
    expect(c.update(NONE)).toEqual([]);
    expect(c.isDone('okBack')).toBe(true);
    expect(c.isDone('gamepad')).toBe(true);
    expect(c.doneCount).toBe(2);
  });

  it('all items can be ticked', () => {
    const c = new Checklist();
    const newly = c.update({
      seenCodes: [37, 38, 39, 40, 13, 10009, 427],
      longestHoldMs: 3000,
      diagonalAttempts: 2,
      chordAttempts: 1,
      gamepadSeen: true,
      leftAndReturned: true,
    });
    expect(newly).toEqual([...CHECKLIST_ORDER]);
    expect(c.doneCount).toBe(CHECKLIST_ORDER.length);
  });

  it('items() lists every item with its label in display order', () => {
    const c = new Checklist();
    c.update(facts({ leftAndReturned: true }));
    const items = c.items();
    expect(items.map((i) => i.id)).toEqual([...CHECKLIST_ORDER]);
    expect(items.map((i) => i.label)).toEqual(CHECKLIST_ORDER.map((id) => CHECKLIST_LABELS[id]));
    expect(items.filter((i) => i.done).map((i) => i.id)).toEqual(['homeReturn']);
  });

  it('covers the spec checklist (8 items, all labelled)', () => {
    expect(CHECKLIST_ORDER).toHaveLength(8);
    expect(new Set(CHECKLIST_ORDER).size).toBe(8);
    for (const id of CHECKLIST_ORDER) expect(CHECKLIST_LABELS[id].length).toBeGreaterThan(5);
  });
});
