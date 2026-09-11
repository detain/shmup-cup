/**
 * On-device test checklist that ticks itself when the corresponding behavior has been observed.
 *
 * Pure module: facts are passed in; ticks are sticky (never un-tick, not affected by stats resets).
 *
 * @module checklist
 */

import { ARROW_CODES, KeyCode, isExtraKey } from './keys';

/** Minimum hold for the "held a key ≥ 1.5 s" item. */
export const LONG_HOLD_MS = 1500;

/** Identifiers of the checklist items, in display order. */
export type ChecklistId =
  | 'arrows'
  | 'okBack'
  | 'longHold'
  | 'diagonal'
  | 'okWhileArrow'
  | 'extraKey'
  | 'gamepad'
  | 'homeReturn';

/** Display labels for the checklist items. */
export const CHECKLIST_LABELS: Readonly<Record<ChecklistId, string>> = {
  arrows: 'Tapped all 4 arrows',
  okBack: 'Tapped OK & Back',
  longHold: 'Held a key ≥ 1.5 s',
  diagonal: 'Tried a diagonal',
  okWhileArrow: 'Pressed OK while holding an arrow',
  extraKey: 'Pressed an extra key',
  gamepad: 'Gamepad seen',
  homeReturn: 'Left (Home) and returned',
};

/** Display order. */
export const CHECKLIST_ORDER: readonly ChecklistId[] = [
  'arrows',
  'okBack',
  'longHold',
  'diagonal',
  'okWhileArrow',
  'extraKey',
  'gamepad',
  'homeReturn',
];

/** Observations the checklist is evaluated from. */
export interface ChecklistFacts {
  /** Key codes with at least one `keydown`. */
  seenCodes: readonly number[];
  /** Longest logical hold so far (ms). */
  longestHoldMs: number;
  /** Conclusive diagonal observations (two arrows held together, or one replacing the other). */
  diagonalAttempts: number;
  /** Conclusive OK-while-arrow-held observations. */
  chordAttempts: number;
  /** Whether any gamepad has been seen. */
  gamepadSeen: boolean;
  /** Whether the app became hidden and then visible again. */
  leftAndReturned: boolean;
}

/** One checklist row. */
export interface ChecklistItem {
  id: ChecklistId;
  label: string;
  done: boolean;
}

/** Computes which items the given facts satisfy (not sticky; see {@link Checklist}). */
export function evaluateChecklist(f: ChecklistFacts): Record<ChecklistId, boolean> {
  const has = (c: number): boolean => f.seenCodes.indexOf(c) >= 0;
  let allArrows = true;
  for (const c of ARROW_CODES) if (!has(c)) allArrows = false;
  let extra = false;
  for (const c of f.seenCodes) if (isExtraKey(c)) extra = true;
  return {
    arrows: allArrows,
    okBack: has(KeyCode.Enter) && has(KeyCode.Back),
    longHold: f.longestHoldMs >= LONG_HOLD_MS,
    diagonal: f.diagonalAttempts > 0,
    okWhileArrow: f.chordAttempts > 0,
    extraKey: extra,
    gamepad: f.gamepadSeen,
    homeReturn: f.leftAndReturned,
  };
}

/** Sticky checklist state. */
export class Checklist {
  private readonly done: Record<ChecklistId, boolean> = {
    arrows: false,
    okBack: false,
    longHold: false,
    diagonal: false,
    okWhileArrow: false,
    extraKey: false,
    gamepad: false,
    homeReturn: false,
  };

  /**
   * Ticks every item the facts satisfy.
   *
   * @returns ids that became done during this call (for logging).
   */
  update(f: ChecklistFacts): ChecklistId[] {
    const now = evaluateChecklist(f);
    const newly: ChecklistId[] = [];
    for (const id of CHECKLIST_ORDER) {
      if (now[id] && !this.done[id]) {
        this.done[id] = true;
        newly.push(id);
      }
    }
    return newly;
  }

  /** Whether an item is ticked. */
  isDone(id: ChecklistId): boolean {
    return this.done[id];
  }

  /** Items in display order. */
  items(): ChecklistItem[] {
    return CHECKLIST_ORDER.map((id) => ({ id, label: CHECKLIST_LABELS[id], done: this.done[id] }));
  }

  /** Number of ticked items. */
  get doneCount(): number {
    let n = 0;
    for (const id of CHECKLIST_ORDER) if (this.done[id]) n++;
    return n;
  }
}
