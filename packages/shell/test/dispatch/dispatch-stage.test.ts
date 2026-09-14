/**
 * `dispatch` (plan M2-10): `connectStagePreparation` answers the zone map's `PrepareStage` event —
 * the audio engine prepares the next stage's music set plus the title theme; a bad index is
 * ignored, a failed preparation goes to the error callback and never throws.
 */
import { MUSIC_CUES, SimEventKind, createEventQueue, type StageSpec } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { connectStagePreparation, createEventDispatcher } from '../../src/dispatch/index.js';

/** Two stand-in stages (only the id is read here; the cue picker is the test's). */
const STAGES = [{ id: 'zone-a' }, { id: 'zone-b' }] as unknown as StageSpec[];

describe('shell/dispatch stage preparation (M2-10)', () => {
  it('prepares the stage`s music set with the title theme, ignoring bad indices', async () => {
    const dispatcher = createEventDispatcher();
    const calls: Array<[string | null, readonly number[] | undefined]> = [];
    const off = connectStagePreparation(
      dispatcher,
      {
        prepareMusic: (stageId, cues) => {
          calls.push([stageId, cues]);
          return Promise.resolve();
        },
      },
      STAGES,
      () => [MUSIC_CUES.Stage, MUSIC_CUES.Boss],
    );
    const queue = createEventQueue(8);
    queue.push(SimEventKind.PrepareStage, 1, 0, 0, 0);
    queue.push(SimEventKind.PrepareStage, 9, 0, 0, 0);
    dispatcher.drain(queue);
    await Promise.resolve();
    expect(calls).toEqual([['zone-b', [MUSIC_CUES.Title, MUSIC_CUES.Stage, MUSIC_CUES.Boss]]]);
    off();
    queue.push(SimEventKind.PrepareStage, 0, 0, 0, 0);
    dispatcher.drain(queue);
    expect(calls).toHaveLength(1);
  });

  it('reports a failed preparation to the callback without throwing', async () => {
    const dispatcher = createEventDispatcher();
    const errors: unknown[] = [];
    connectStagePreparation(
      dispatcher,
      { prepareMusic: () => Promise.reject(new Error('decode failed')) },
      STAGES,
      () => [],
      (error) => errors.push(error),
    );
    const queue = createEventQueue(8);
    queue.push(SimEventKind.PrepareStage, 0, 0, 0, 0);
    expect(() => dispatcher.drain(queue)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toHaveLength(1);
    // The default callback swallows it.
    connectStagePreparation(
      createEventDispatcher(),
      { prepareMusic: () => Promise.reject(new Error('x')) },
      STAGES,
      () => [],
    );
  });
});
