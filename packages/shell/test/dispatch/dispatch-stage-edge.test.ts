/**
 * Edge cases of `dispatch`'s M2-10 `connectStagePreparation` beyond `dispatch-stage.test.ts`:
 * negative and out-of-range indices are ignored, several preparations in one drain each reach the
 * engine in order, the cue picker's list is never modified (a memoised picker kept growing a
 * `Title` entry per event — fixed) and the title theme is listed once even when the stage names
 * it, and only `PrepareStage` events are answered.
 */
import { MUSIC_CUES, SimEventKind, createEventQueue, type StageSpec } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { connectStagePreparation, createEventDispatcher } from '../../src/dispatch/index.js';

/** Three stand-in stages (only the id is read here). */
const STAGES = [{ id: 'zone-a' }, { id: 'zone-b' }, { id: 'zone-c' }] as unknown as StageSpec[];

/**
 * A recording audio target.
 *
 * @returns The target and its calls.
 */
function recorder(): {
  calls: Array<[string | null, number[]]>;
  target: { prepareMusic(stageId: string | null, cues?: readonly number[]): Promise<void> };
} {
  const calls: Array<[string | null, number[]]> = [];
  return {
    calls,
    target: {
      prepareMusic(stageId, cues) {
        calls.push([stageId, cues === undefined ? [] : cues.slice()]);
        return Promise.resolve();
      },
    },
  };
}

describe('shell/dispatch stage preparation edges (M2-10)', () => {
  it('ignores negative and out-of-range indices and other event kinds', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    connectStagePreparation(dispatcher, target, STAGES, () => [MUSIC_CUES.Stage]);
    const queue = createEventQueue(8);
    queue.push(SimEventKind.PrepareStage, -1, 0, 0, 0);
    queue.push(SimEventKind.PrepareStage, STAGES.length, 0, 0, 0);
    queue.push(SimEventKind.Music, 1, 0, 0, 0);
    queue.push(SimEventKind.Sfx, 0, 0, 0, 0);
    dispatcher.drain(queue);
    expect(calls).toEqual([]);
  });

  it('answers several preparations of one drain in order', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    connectStagePreparation(dispatcher, target, STAGES, () => [MUSIC_CUES.Stage]);
    const queue = createEventQueue(8);
    queue.push(SimEventKind.PrepareStage, 2, 0, 0, 0);
    queue.push(SimEventKind.PrepareStage, 0, 0, 0, 0);
    dispatcher.drain(queue);
    expect(calls.map((c) => c[0])).toEqual(['zone-c', 'zone-a']);
  });

  it('never modifies the picker`s list and lists the title theme once (fix)', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    // A memoised picker: the same array every time (one already naming the title theme).
    const shared = [MUSIC_CUES.Stage, MUSIC_CUES.Title, MUSIC_CUES.Boss];
    connectStagePreparation(dispatcher, target, STAGES, () => shared);
    const queue = createEventQueue(8);
    for (let i = 0; i < 3; i++) {
      queue.push(SimEventKind.PrepareStage, i, 0, 0, 0);
      dispatcher.drain(queue);
    }
    expect(shared).toEqual([MUSIC_CUES.Stage, MUSIC_CUES.Title, MUSIC_CUES.Boss]);
    for (const [, cues] of calls) {
      expect(cues).toEqual([MUSIC_CUES.Title, MUSIC_CUES.Stage, MUSIC_CUES.Boss]);
    }
    expect(calls).toHaveLength(3);
  });

  it('prepares the title theme alone for a stage without cues', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    connectStagePreparation(dispatcher, target, STAGES, () => []);
    const queue = createEventQueue(4);
    queue.push(SimEventKind.PrepareStage, 0, 0, 0, 0);
    dispatcher.drain(queue);
    expect(calls).toEqual([['zone-a', [MUSIC_CUES.Title]]]);
  });
});
