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
  /** Item identifier. */
  id: ChecklistId;
  /** Display label from {@link CHECKLIST_LABELS}. */
  label: string;
  /** Whether the item has been ticked. */
  done: boolean;
}

/**
 * Computes which items the given facts satisfy (not sticky; see {@link Checklist}).
 *
 * @param f - current observations.
 * @returns a done flag per item.
 *
 * @example
 * ```ts
 * evaluateChecklist({
 *   seenCodes: [37, 38, 39, 40, 13, 10009],
 *   longestHoldMs: 3000,
 *   diagonalAttempts: 0,
 *   chordAttempts: 0,
 *   gamepadSeen: false,
 *   leftAndReturned: false,
 * }); // { arrows: true, okBack: true, longHold: true, extraKey: false, ...rest false }
 * ```
 */
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

/**
 * Sticky checklist state: once an item is ticked it stays ticked for the rest of the session, even after
 * Play/Pause resets the hold statistics.
 *
 * @example
 * ```ts
 * const cl = new Checklist();
 * cl.update({ ...facts, gamepadSeen: true }); // ['gamepad'] — newly ticked
 * cl.update({ ...facts, gamepadSeen: false }); // [] — still ticked
 * cl.isDone('gamepad');                        // true
 * ```
 */
export class Checklist {
  /** Tick state per item. */
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
   * @param f - current observations.
   * @returns ids that became done during this call (for logging), in display order.
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

  /**
   * Tells whether an item is ticked.
   *
   * @param id - item identifier.
   * @returns the sticky done flag.
   */
  isDone(id: ChecklistId): boolean {
    return this.done[id];
  }

  /**
   * Lists the items for display.
   *
   * @returns fresh {@link ChecklistItem} rows in {@link CHECKLIST_ORDER}.
   */
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
