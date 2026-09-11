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
  /** Whether the button is pressed. */
  readonly pressed: boolean;
  /** Analog value in [0, 1] (triggers); not used for edge detection. */
  readonly value: number;
}

/** Structural subset of `Gamepad`. */
export interface GamepadLike {
  /** Pad slot index assigned by the browser (need not equal the position in the list). */
  readonly index: number;
  /** Device id string (vendor / product), e.g. `"Xbox Wireless Controller (STANDARD GAMEPAD …)"`. */
  readonly id: string;
  /** `"standard"` when the browser maps the pad to the W3C standard layout, `""` otherwise. */
  readonly mapping: string;
  /** Whether the pad is still connected. */
  readonly connected: boolean;
  /** Buttons in browser order (standard mapping: 0 = A/bottom, 12–15 = D-pad). */
  readonly buttons: ArrayLike<GamepadButtonLike>;
  /** Axis values in [-1, 1] (standard mapping: 0/1 = left stick x/y, 2/3 = right stick x/y). */
  readonly axes: ArrayLike<number>;
}

/** An edge detected by {@link GamepadMonitor.update}. */
export interface GamepadEdge {
  /** Pad index (`Gamepad.index`). */
  pad: number;
  /** What changed. */
  kind: 'button' | 'axis' | 'connect' | 'disconnect';
  /** Button or axis index (-1 for connect/disconnect). */
  index: number;
  /** Button: 1 = down, 0 = up. Axis: -1, 0 or +1 zone. */
  value: number;
  /** Log text, e.g. `GP0 b3 down`. */
  text: string;
}

/** Latest known state of one pad (kept after disconnect so the panel can still show it). */
export interface PadState {
  /** Pad index (`Gamepad.index`). */
  index: number;
  /** Device id at the last connect. */
  id: string;
  /** Mapping at the last connect (`"standard"` or `""`). */
  mapping: string;
  /** Whether the pad was in the latest snapshot. */
  connected: boolean;
  /** Buttons reported (capped at {@link MAX_BUTTONS}). */
  buttonCount: number;
  /** Axes reported (capped at {@link MAX_AXES}). */
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

/**
 * Converts an axis value to a zone.
 *
 * @param v - axis value in [-1, 1].
 * @param threshold - deflection needed to leave the dead zone (default {@link AXIS_THRESHOLD}).
 * @returns -1, 0 or +1.
 *
 * @example
 * ```ts
 * axisZone(0.7);  // 1
 * axisZone(-0.2); // 0
 * ```
 */
export function axisZone(v: number, threshold = AXIS_THRESHOLD): number {
  if (v >= threshold) return 1;
  if (v <= -threshold) return -1;
  return 0;
}

/**
 * Looks for a connected pad in a `getGamepads()` snapshot.
 *
 * @param list - the snapshot (entries may be null).
 * @param index - pad index to look for.
 * @returns whether `list` holds a connected pad whose index (or list position, when it has none) is `index`.
 */
function listHasConnected(list: ArrayLike<GamepadLike | null | undefined>, index: number): boolean {
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g === null || g === undefined || !g.connected) continue;
    if ((typeof g.index === 'number' ? g.index : i) === index) return true;
  }
  return false;
}

/**
 * Tracks all pads and reports edges.
 *
 * @remarks
 * Browsers only expose a pad after its first button press ("activation"), so a pad appears here — and
 * `connect` is reported — on that first press, not when it is paired.
 *
 * @example
 * ```ts
 * const mon = new GamepadMonitor();
 * mon.update(navigator.getGamepads(), (edge) => console.log(edge.text)); // "GP0 connected id=… mapping=…", "GP0 b0 down"
 * ```
 */
export class GamepadMonitor {
  /** Pad states by `Gamepad.index` (sparse). */
  private readonly pads: (PadState | undefined)[] = [];
  /** Whether any pad has ever connected. */
  private seen = false;

  /** Whether any pad has ever been seen. */
  get anySeen(): boolean {
    return this.seen;
  }

  /**
   * Compares the current pads with the previous snapshot.
   *
   * @param list - `navigator.getGamepads()` result (entries may be null).
   * @param onEdge - called synchronously for every edge, in this order: disconnects, then per pad its
   *   connect, button and axis edges.
   *
   * @remarks
   * Chromium returns *snapshots* from `getGamepads()`, so this must be called every frame (or at a lower idle
   * rate while no pad has been seen, as `main.ts` does) to catch short presses.
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

  /**
   * Lists every pad seen so far.
   *
   * @returns the live {@link PadState} objects (connected or not), ordered by index. Do not mutate them.
   */
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

/**
 * Human-readable lines describing the pads, for the Gamepads panel.
 *
 * @param states - pads from {@link GamepadMonitor.states}.
 * @returns two lines per pad (header with index / mapping / id, then pressed buttons and axis values), or a
 *   single hint line when no pad has been seen.
 *
 * @example
 * ```text
 * GP0 mapping=standard Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)
 *    buttons[17] pressed: 0 12  axes: 0.00 -0.02 0.00 0.00
 * ```
 */
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

/**
 * JSON-friendly pad summary for the report payload (`stats.gamepads`).
 *
 * @param states - pads from {@link GamepadMonitor.states}.
 * @returns one plain object per pad: index, id, mapping, connected, button / axis counts and total presses.
 */
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
