/**
 * gamepad: axis zones, connect/disconnect/button/axis edges, multiple pads, panel/report formatting.
 */

import { describe, expect, it } from 'vitest';

import {
  AXIS_THRESHOLD,
  GamepadMonitor,
  MAX_BUTTONS,
  axisZone,
  describePads,
  padsForReport,
  type GamepadEdge,
  type GamepadLike,
} from '../src/gamepad';

interface PadOpts {
  index?: number;
  id?: string;
  mapping?: string;
  connected?: boolean;
  pressed?: number[];
  buttons?: number;
  axes?: number[];
}

function pad(o: PadOpts = {}): GamepadLike {
  const n = o.buttons ?? 17;
  const pressed = new Set(o.pressed ?? []);
  const buttons = [];
  for (let b = 0; b < n; b++) buttons.push({ pressed: pressed.has(b), value: pressed.has(b) ? 1 : 0 });
  return {
    index: o.index ?? 0,
    id: o.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD)',
    mapping: o.mapping ?? 'standard',
    connected: o.connected ?? true,
    buttons,
    axes: o.axes ?? [0, 0, 0, 0],
  };
}

function run(m: GamepadMonitor, list: ArrayLike<GamepadLike | null | undefined>): string[] {
  const edges: GamepadEdge[] = [];
  m.update(list, (e) => edges.push(e));
  return edges.map((e) => e.text);
}

describe('axisZone', () => {
  it('uses ±0.5 by default, inclusive', () => {
    expect(AXIS_THRESHOLD).toBe(0.5);
    expect(axisZone(0.5)).toBe(1);
    expect(axisZone(0.49)).toBe(0);
    expect(axisZone(-0.5)).toBe(-1);
    expect(axisZone(-0.49)).toBe(0);
    expect(axisZone(NaN)).toBe(0);
    expect(axisZone(0.3, 0.2)).toBe(1);
  });
});

describe('GamepadMonitor', () => {
  it('starts with no pads', () => {
    const m = new GamepadMonitor();
    expect(m.anySeen).toBe(false);
    expect(m.connectedCount).toBe(0);
    expect(run(m, [])).toEqual([]);
    expect(run(m, [null, null, null, null])).toEqual([]);
    expect(m.states()).toEqual([]);
  });

  it('emits connect once, then button and axis edges only on change', () => {
    const m = new GamepadMonitor();
    expect(run(m, [pad()])).toEqual(['GP0 connected id="Xbox Wireless Controller (STANDARD GAMEPAD)" mapping="standard"']);
    expect(m.anySeen).toBe(true);
    expect(run(m, [pad()])).toEqual([]);
    expect(run(m, [pad({ pressed: [0, 3] })])).toEqual(['GP0 b0 down', 'GP0 b3 down']);
    expect(run(m, [pad({ pressed: [0, 3] })])).toEqual([]);
    expect(run(m, [pad({ pressed: [3] })])).toEqual(['GP0 b0 up']);
    expect(run(m, [pad({ pressed: [3], axes: [0.2, -0.9, 0, 0] })])).toEqual(['GP0 a1 -1']);
    expect(run(m, [pad({ pressed: [3], axes: [0.2, -0.7, 0, 0] })])).toEqual([]); // same zone
    expect(run(m, [pad({ pressed: [3], axes: [0.8, 0, 0, 0] })])).toEqual(['GP0 a0 +1', 'GP0 a1 0']);
    const st = m.states()[0];
    expect(st?.presses).toBe(2);
    expect(st?.buttonCount).toBe(17);
    expect(st?.axisCount).toBe(4);
    expect(st?.axes[0]).toBeCloseTo(0.8);
  });

  it('edge objects carry pad, kind, index and value', () => {
    const m = new GamepadMonitor();
    const edges: GamepadEdge[] = [];
    m.update([pad({ pressed: [2], axes: [-1] })], (e) => edges.push(e));
    expect(edges).toEqual([
      expect.objectContaining({ pad: 0, kind: 'connect', index: -1, value: 1 }),
      expect.objectContaining({ pad: 0, kind: 'button', index: 2, value: 1 }),
      expect.objectContaining({ pad: 0, kind: 'axis', index: 0, value: -1 }),
    ]);
  });

  it('disconnects pads that become null, not connected, or drop out of the list', () => {
    for (const next of [[null], [pad({ connected: false })], []] as Array<Array<GamepadLike | null>>) {
      const m = new GamepadMonitor();
      run(m, [pad({ pressed: [1] })]);
      expect(run(m, next)).toEqual(['GP0 disconnected']);
      expect(m.connectedCount).toBe(0);
      expect(run(m, next)).toEqual([]); // only once
      expect(m.states()[0]?.connected).toBe(false);
    }
  });

  it('a reconnect emits connect again and re-reports held buttons', () => {
    const m = new GamepadMonitor();
    run(m, [pad({ pressed: [1] })]);
    run(m, [null]);
    expect(run(m, [pad({ pressed: [1], id: 'Other pad', mapping: '' })])).toEqual([
      'GP0 connected id="Other pad" mapping=""',
      'GP0 b1 down',
    ]);
    expect(m.states()[0]).toMatchObject({ id: 'Other pad', mapping: '' });
  });

  it('tracks two pads at once (co-op)', () => {
    const m = new GamepadMonitor();
    const texts = run(m, [pad({ index: 0 }), pad({ index: 1, pressed: [9] })]);
    expect(texts).toEqual([
      expect.stringMatching(/^GP0 connected/),
      expect.stringMatching(/^GP1 connected/),
      'GP1 b9 down',
    ]);
    expect(m.connectedCount).toBe(2);
    expect(run(m, [pad({ index: 0 }), null])).toEqual(['GP1 disconnected']);
    expect(m.connectedCount).toBe(1);
  });

  it('regression: a pad whose index differs from its list position does not flap connect/disconnect', () => {
    const m = new GamepadMonitor();
    const p = pad({ index: 1 });
    expect(run(m, [p])).toEqual(['GP1 connected id="Xbox Wireless Controller (STANDARD GAMEPAD)" mapping="standard"']);
    expect(run(m, [p])).toEqual([]);
    expect(run(m, [p])).toEqual([]);
    expect(m.connectedCount).toBe(1);
    expect(run(m, [])).toEqual(['GP1 disconnected']);
  });

  it('caps buttons at MAX_BUTTONS and tolerates sparse button arrays', () => {
    const m = new GamepadMonitor();
    const many = pad({ buttons: MAX_BUTTONS + 8, pressed: [MAX_BUTTONS + 1] });
    expect(run(m, [many])).toHaveLength(1); // connect only; button 33 is beyond the cap
    expect(m.states()[0]?.buttonCount).toBe(MAX_BUTTONS);
    const sparse: GamepadLike = { ...pad(), buttons: { length: 3, 0: { pressed: true, value: 1 } } as unknown as GamepadLike['buttons'] };
    expect(run(m, [sparse])).toEqual(['GP0 b0 down']);
  });

  it('falls back to the list position when index is missing', () => {
    const m = new GamepadMonitor();
    const p = { ...pad(), index: undefined as unknown as number };
    expect(run(m, [null, p])).toEqual([expect.stringMatching(/^GP1 connected/)]);
    expect(run(m, [null, p])).toEqual([]);
  });
});

describe('describePads / padsForReport', () => {
  it('hint when no pad is known', () => {
    expect(describePads([])).toEqual(['(none — press a button on the pad to activate it)']);
  });

  it('two lines per pad with pressed buttons and axes', () => {
    const m = new GamepadMonitor();
    run(m, [pad({ pressed: [0, 5], axes: [0.25, -1] })]);
    expect(describePads(m.states())).toEqual([
      'GP0 mapping=standard Xbox Wireless Controller (STANDARD GAMEPAD)',
      '   buttons[17] pressed: 0 5  axes: 0.25 -1.00',
    ]);
    run(m, [null]);
    const lines = describePads(m.states());
    expect(lines[0]).toContain('GP0 (disconnected)');
    expect(lines[1]).toContain('pressed: -');
  });

  it('shows an empty mapping as ""', () => {
    const m = new GamepadMonitor();
    run(m, [pad({ mapping: '' })]);
    expect(describePads(m.states())[0]).toContain('mapping=""');
  });

  it('report summary is JSON-friendly', () => {
    const m = new GamepadMonitor();
    run(m, [pad({ pressed: [1] })]);
    run(m, [pad()]);
    run(m, [pad({ pressed: [1] })]);
    const r = padsForReport(m.states());
    expect(r).toEqual([
      { index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, buttons: 17, axes: 4, presses: 2 },
    ]);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
