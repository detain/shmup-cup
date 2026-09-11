/**
 * # dispatch — simulation events → presentation handlers
 *
 * **Responsibility.** Routes the records drained from the core's event queue
 * (`game.events`) to the handlers the host registered per `SimEventKind` (SFX and music →
 * `audio-web`, particles / shake / flash → `render-pixi` — wired by later steps). Handlers are
 * registered at load time; dispatching is a table lookup and a loop over a preallocated array,
 * so draining the queue once per frame allocates nothing. Events nobody handles are counted
 * and dropped (a headless-safe default: the sim never depends on presentation).
 *
 * **Implements.**
 * - shmup_feat.md §22 Architecture — presentation fed by read-only views + the event queue
 * - shmup_feat.md §19 / §20 — audio cues and "juice" triggered by sim events (handlers M1-14/15)
 *
 * **Public API.** {@link createEventDispatcher}, {@link EventDispatcher},
 * {@link SimEventHandler}.
 *
 * @module
 */
import {
  SIM_EVENT_KIND_NAMES,
  defineModule,
  type EventQueue,
  type SimEvent,
  type SimEventKind,
} from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'dispatch',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §19', 'shmup_feat.md §20'],
});

/**
 * Receives one drained event. The record is reused by the queue — copy the fields out,
 * never keep the reference.
 *
 * @param event - The event record.
 */
export type SimEventHandler = (event: Readonly<SimEvent>) => void;

/** Routes sim events to registered handlers. */
export interface EventDispatcher {
  /**
   * Registers a handler for one event kind (load time — registering allocates).
   *
   * @param kind - Event kind to receive.
   * @param handler - Called for every event of that kind, in registration order.
   * @returns A function that unregisters the handler (idempotent).
   * @throws {RangeError} When `kind` is not a known `SimEventKind`.
   */
  on(kind: SimEventKind, handler: SimEventHandler): () => void;
  /**
   * The bound visitor: pass it to `EventQueue.drain` directly
   * (`game.events.drain(dispatcher.visit)`).
   */
  readonly visit: SimEventHandler;
  /**
   * Drains a queue through {@link EventDispatcher.visit}.
   *
   * @param queue - The queue to drain.
   */
  drain(queue: EventQueue): void;
  /**
   * Number of handlers of a kind.
   *
   * @param kind - Event kind.
   * @returns Registered handlers (0 for an unknown kind — never throws).
   */
  handlerCount(kind: SimEventKind): number;
  /** Events dispatched since creation (diagnostics). */
  readonly dispatched: number;
  /** Events that had no handler, since creation (diagnostics). */
  readonly unhandled: number;
}

/**
 * Creates an event dispatcher.
 *
 * @returns A dispatcher with no handlers.
 *
 * @example
 * ```ts
 * const events = createEventDispatcher();
 * events.on(SimEventKind.Shake, (event) => shake.add(event.param));
 * // every frame:
 * game.events.drain(events.visit);
 * ```
 */
export function createEventDispatcher(): EventDispatcher {
  const kinds = SIM_EVENT_KIND_NAMES.length;
  const handlers: SimEventHandler[][] = [];
  for (let i = 0; i < kinds; i++) handlers.push([]);
  let dispatched = 0;
  let unhandled = 0;

  /**
   * Calls the handlers of `event.kind`.
   *
   * @param event - The drained record.
   */
  const visit: SimEventHandler = (event) => {
    dispatched++;
    const list = event.kind < kinds ? handlers[event.kind] : undefined;
    if (list === undefined || list.length === 0) {
      unhandled++;
      return;
    }
    for (let i = 0; i < list.length; i++) list[i](event);
  };

  return {
    visit,
    get dispatched(): number {
      return dispatched;
    },
    get unhandled(): number {
      return unhandled;
    },
    on(kind, handler) {
      const list = Number.isInteger(kind) && kind >= 0 ? handlers[kind] : undefined;
      if (list === undefined) throw new RangeError(`unknown SimEventKind ${kind}`);
      // Copy-on-write, so a handler that unsubscribes during dispatch cannot skip a sibling.
      handlers[kind] = list.concat(handler);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = handlers[kind];
        const index = current.indexOf(handler);
        if (index >= 0) handlers[kind] = current.slice(0, index).concat(current.slice(index + 1));
      };
    },
    drain(queue) {
      queue.drain(visit);
    },
    handlerCount(kind) {
      return handlers[kind]?.length ?? 0;
    },
  };
}
