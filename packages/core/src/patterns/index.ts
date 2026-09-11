/**
 * # patterns — attack patterns, bullet-pattern DSL and generator coroutines
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Scripting for enemy/boss behaviour and bullet patterns. Behaviours are TypeScript
 * generator coroutines (`function* ring() { … yield* wait(8); }` — generators work back
 * to Chrome 39) advanced once per tick, so they are deterministic. Pattern primitives:
 * aimed (quantised), N-way spread, ring, spiral, stack, seeded random spray, homing,
 * delayed/changing bullets. A BulletML-inspired JSON/TS DSL (`fire`, `wait`, `repeat`,
 * `changeSpeed`, `changeDirection`, `$rank`) compiles to the same coroutines.
 *
 * **Implements.**
 * - shmup_feat.md §12 — pattern primitives and the BulletML-inspired DSL
 * - shmup_feat.md §11 — coroutine AI scripts
 * - shmup_tech.md §4.6 — TS generator coroutines
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'patterns',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §12', 'shmup_feat.md §11', 'shmup_tech.md §4.6'],
});

/** A behaviour coroutine: each `yield` returns the number of ticks to wait (0 = next tick). */
export type Script = Generator<number, void, void>;

/** What a script can read while running. */
export interface ScriptContext {
  /** Current simulation tick. */
  readonly tick: number;
  /** Current rank (0–31), for `$rank`-scaled patterns. */
  readonly rank: number;
}

/** A node of the planned pattern DSL (JSON-serialisable). */
export type PatternNode =
  | { readonly op: 'fire'; readonly direction?: string; readonly speed?: string }
  | { readonly op: 'wait'; readonly ticks: string }
  | { readonly op: 'repeat'; readonly times: string; readonly body: readonly PatternNode[] };

// Planned: wait(ticks), createScriptRunner(), aimed/nWay/ring/spiral/stack/spray primitives,
//          compilePattern(nodes: readonly PatternNode[]): (ctx: ScriptContext) => Script.
