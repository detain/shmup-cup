/**
 * Gamepad snapshot tracking with edge detection (button down/up, axis zone changes).
 *
 * Pure module: it consumes objects structurally compatible with the W3C `Gamepad` interface (real
 * `navigator.getGamepads()` entries or plain test objects). {@link GamepadMonitor.update} allocates only when
 * an edge occurs or a new pad appears.
 *
 * @module gamepad
 */

/** Axis deflection beyond which an axis counts as pushed. */
export const AXIS_THRESHOLD = 0.5;
/** Buttons tracked per pad. */
export const MAX_BUTTONS = 32;
/** Axes tracked per pad. */
export const MAX_AXES = 16;

/** Structural subset of `GamepadButton`. */
export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

/** Structural subset of `Gamepad`. */
export interface GamepadLike {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly buttons: ArrayLike<GamepadButtonLike>;
  readonly axes: ArrayLike<number>;
}

/** An edge detected by {@link GamepadMonitor.update}. */
export interface GamepadEdge {
  pad: number;
  kind: 'button' | 'axis' | 'connect' | 'disconnect';
  /** Button or axis index (-1 for connect/disconnect). */
  index: number;
  /** Button: 1 = down, 0 = up. Axis: -1, 0 or +1 zone. */
  value: number;
  /** Log text, e.g. `GP0 b3 down`. */
  text: string;
}

/** Latest known state of one pad. */
export interface PadState {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  buttonCount: number;
  axisCount: number;
  /** 1 = pressed. */
  buttons: Uint8Array;
  /** Latest axis values. */
  axes: Float32Array;
  /** Axis zones (-1 / 0 / +1). */
  zones: Int8Array;
  /** Button presses seen since connect. */
  presses: number;
}

/** Converts an axis value to a zone: -1, 0 or +1. */
export function axisZone(v: number, threshold = AXIS_THRESHOLD): number {
  if (v >= threshold) return 1;
  if (v <= -threshold) return -1;
  return 0;
}

/** Whether `list` holds a connected pad whose index (or list position, when it has none) is `index`. */
function listHasConnected(list: ArrayLike<GamepadLike | null | undefined>, index: number): boolean {
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g === null || g === undefined || !g.connected) continue;
    if ((typeof g.index === 'number' ? g.index : i) === index) return true;
  }
  return false;
}

/** Tracks all pads and reports edges. */
export class GamepadMonitor {
  private readonly pads: (PadState | undefined)[] = [];
  private seen = false;

  /** Whether any pad has ever been seen. */
  get anySeen(): boolean {
    return this.seen;
  }

  /**
   * Compares the current pads with the previous snapshot.
   *
   * @param list - `navigator.getGamepads()` result (entries may be null).
   * @param onEdge - called for every edge.
   */
  update(list: ArrayLike<GamepadLike | null | undefined>, onEdge: (edge: GamepadEdge) => void): void {
    // Mark pads missing from the list as disconnected. Pads are keyed by `Gamepad.index`, which need not equal
    // the list position (e.g. a compact array), so look the pad up by index.
    for (let i = 0; i < this.pads.length; i++) {
      const st = this.pads[i];
      if (st === undefined || !st.connected) continue;
      if (!listHasConnected(list, i)) {
        st.connected = false;
        st.buttons.fill(0);
        st.zones.fill(0);
        onEdge({ pad: i, kind: 'disconnect', index: -1, value: 0, text: 'GP' + i + ' disconnected' });
      }
    }
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g === null || g === undefined || !g.connected) continue;
      const idx = typeof g.index === 'number' ? g.index : i;
      let st = this.pads[idx];
      if (st === undefined) {
        st = {
          index: idx,
          id: g.id,
          mapping: g.mapping,
          connected: false,
          buttonCount: 0,
          axisCount: 0,
          buttons: new Uint8Array(MAX_BUTTONS),
          axes: new Float32Array(MAX_AXES),
          zones: new Int8Array(MAX_AXES),
          presses: 0,
        };
        this.pads[idx] = st;
      }
      if (!st.connected) {
        st.connected = true;
        st.id = g.id;
        st.mapping = g.mapping;
        this.seen = true;
        onEdge({
          pad: idx,
          kind: 'connect',
          index: -1,
          value: 1,
          text: 'GP' + idx + ' connected id="' + g.id + '" mapping="' + g.mapping + '"',
        });
      }
      const nb = Math.min(g.buttons.length, MAX_BUTTONS);
      st.buttonCount = nb;
      for (let b = 0; b < nb; b++) {
        const btn = g.buttons[b];
        const pressed = btn !== undefined && btn.pressed ? 1 : 0;
        if (pressed !== st.buttons[b]) {
          st.buttons[b] = pressed;
          if (pressed) st.presses++;
          onEdge({
            pad: idx,
            kind: 'button',
            index: b,
            value: pressed,
            text: 'GP' + idx + ' b' + b + (pressed ? ' down' : ' up'),
          });
        }
      }
      const na = Math.min(g.axes.length, MAX_AXES);
      st.axisCount = na;
      for (let a = 0; a < na; a++) {
        const v = g.axes[a] as number;
        st.axes[a] = v;
        const z = axisZone(v);
        if (z !== st.zones[a]) {
          st.zones[a] = z;
          onEdge({
            pad: idx,
            kind: 'axis',
            index: a,
            value: z,
            text: 'GP' + idx + ' a' + a + ' ' + (z > 0 ? '+1' : z < 0 ? '-1' : '0'),
          });
        }
      }
    }
  }

  /** Known pads (connected or not), by index. */
  states(): PadState[] {
    const out: PadState[] = [];
    for (const st of this.pads) if (st !== undefined) out.push(st);
    return out;
  }

  /** Number of currently connected pads. */
  get connectedCount(): number {
    let n = 0;
    for (const st of this.pads) if (st !== undefined && st.connected) n++;
    return n;
  }
}

/** Human-readable lines describing the pads, for the stats panel. */
export function describePads(states: readonly PadState[]): string[] {
  if (states.length === 0) return ['(none — press a button on the pad to activate it)'];
  const out: string[] = [];
  for (const st of states) {
    const pressed: number[] = [];
    for (let b = 0; b < st.buttonCount; b++) if (st.buttons[b]) pressed.push(b);
    const axes: string[] = [];
    for (let a = 0; a < st.axisCount; a++) axes.push((st.axes[a] as number).toFixed(2));
    out.push(
      'GP' + st.index + (st.connected ? '' : ' (disconnected)') + ' mapping=' + (st.mapping || '""') + ' ' + st.id,
    );
    out.push(
      '   buttons[' + st.buttonCount + '] pressed: ' + (pressed.length ? pressed.join(' ') : '-') + '  axes: ' + axes.join(' '),
    );
  }
  return out;
}

/** JSON-friendly pad summary for the report. */
export function padsForReport(states: readonly PadState[]): Array<{
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  buttons: number;
  axes: number;
  presses: number;
}> {
  return states.map((st) => ({
    index: st.index,
    id: st.id,
    mapping: st.mapping,
    connected: st.connected,
    buttons: st.buttonCount,
    axes: st.axisCount,
    presses: st.presses,
  }));
}
