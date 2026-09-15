/**
 * Tests of the scene stack (plan M1-16): push / pop / replace / reset with their lifecycle hooks
 * in order, transitions requested during a tick deferred to its end (and applied at once outside
 * a tick), the depth limit of 8, misuse errors, and the menu input merge.
 */
import { describe, expect, it } from 'vitest';
import { Action, createInputSnapshot, type InputSnapshot } from '../../src/input/index.js';
import type { DrawList } from '../../src/presentation/index.js';
import {
  SCENE_STACK_DEPTH,
  createSceneStack,
  mergeMenuInput,
  moduleInfo,
  type Scene,
  type SceneId,
  type SceneStack,
} from '../../src/scenes/index.js';

/** A scene that logs its hooks and runs a callback when it ticks. */
class LogScene implements Scene {
  readonly inputContext = 'menu' as const;
  readonly dim = 0;
  uiRevision = 0;
  /** Ticks run. */
  ticks = 0;
  /** Runs in `tick()` (requests transitions). */
  onTick: ((stack: SceneStack) => void) | null = null;
  /** Runs in `enter()`. */
  onEnter: ((stack: SceneStack) => void) | null = null;

  constructor(
    readonly name: string,
    private readonly log: string[],
    private readonly stack: () => SceneStack,
    readonly overlay = false,
    readonly id: SceneId = 'title',
  ) {}

  enter(): void {
    this.log.push(`${this.name}.enter`);
    this.onEnter?.(this.stack());
  }

  exit(): void {
    this.log.push(`${this.name}.exit`);
  }

  cover(): void {
    this.log.push(`${this.name}.cover`);
  }

  uncover(): void {
    this.log.push(`${this.name}.uncover`);
  }

  tick(_input: InputSnapshot): void {
    this.ticks++;
    this.log.push(`${this.name}.tick`);
    this.onTick?.(this.stack());
  }

  drawUi(_list: DrawList): void {}
}

/**
 * A stack with named logging scenes.
 *
 * @param names - Scene names.
 * @returns The stack, the scenes by name and the log.
 */
function setup(...names: string[]) {
  const log: string[] = [];
  const stack = createSceneStack();
  const scenes: Record<string, LogScene> = {};
  for (const name of names) scenes[name] = new LogScene(name, log, () => stack);
  return { stack, scenes, log };
}

const INPUT = createInputSnapshot();

describe('core/scenes stack', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('scenes');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §23');
  });

  it('pushes, pops, replaces and resets with the hooks in order', () => {
    const { stack, scenes, log } = setup('a', 'b', 'c', 'd');
    expect([stack.top, stack.depth, stack.capacity]).toEqual([null, 0, SCENE_STACK_DEPTH]);
    stack.push(scenes.a);
    stack.push(scenes.b);
    expect(log).toEqual(['a.enter', 'a.cover', 'b.enter']);
    expect([stack.top, stack.depth, stack.sceneAt(0), stack.sceneAt(1), stack.sceneAt(2)]).toEqual([
      scenes.b,
      2,
      scenes.a,
      scenes.b,
      null,
    ]);
    log.length = 0;
    stack.replace(scenes.c);
    expect(log).toEqual(['b.exit', 'c.enter']);
    log.length = 0;
    stack.pop();
    expect(log).toEqual(['c.exit', 'a.uncover']);
    expect(stack.top).toBe(scenes.a);
    log.length = 0;
    stack.push(scenes.b);
    stack.push(scenes.c);
    log.length = 0;
    stack.reset(scenes.d);
    expect(log).toEqual(['c.exit', 'b.exit', 'a.exit', 'd.enter']);
    expect([stack.depth, stack.top]).toEqual([1, scenes.d]);
    expect(stack.contains(scenes.a)).toBe(false);
    expect(stack.contains(scenes.d)).toBe(true);
  });

  it('pops an empty stack quietly and replaces into an empty one like a push', () => {
    const { stack, scenes, log } = setup('a');
    stack.pop();
    expect(stack.depth).toBe(0);
    stack.replace(scenes.a);
    expect([stack.depth, log]).toEqual([1, ['a.enter']]);
    stack.replace(scenes.a); // already the top: nothing
    expect(log).toEqual(['a.enter']);
  });

  it('bumps its revision on every applied transition', () => {
    const { stack, scenes } = setup('a', 'b');
    const r = stack.revision;
    stack.push(scenes.a);
    stack.push(scenes.b);
    stack.pop();
    expect(stack.revision).toBe(r + 3);
  });

  it('defers transitions requested during a tick to the end of that tick, in order', () => {
    const { stack, scenes, log } = setup('title', 'game', 'pause');
    stack.push(scenes.title);
    log.length = 0;
    scenes.title.onTick = (s) => {
      s.replace(scenes.game);
      // Still the title while its tick runs.
      log.push(`top=${(s.top as LogScene).name} pending=${s.pending}`);
      s.push(scenes.pause);
      log.push(`pending=${s.pending}`);
    };
    stack.tick(INPUT);
    expect(log).toEqual([
      'title.tick',
      'top=title pending=1',
      'pending=2',
      'title.exit',
      'game.enter',
      'game.cover',
      'pause.enter',
    ]);
    expect(stack.pending).toBe(0);
    expect([stack.depth, stack.top]).toEqual([2, scenes.pause]);
    // Only the top ticks.
    stack.tick(INPUT);
    expect([scenes.pause.ticks, scenes.game.ticks]).toEqual([1, 0]);
  });

  it('applies transitions requested by enter hooks in the same flush', () => {
    const { stack, scenes, log } = setup('boot', 'title');
    scenes.boot.onEnter = (s) => s.replace(scenes.title);
    stack.push(scenes.boot);
    expect(log).toEqual(['boot.enter', 'boot.exit', 'title.enter']);
    expect(stack.top).toBe(scenes.title);
  });

  it('ticks nothing on an empty stack', () => {
    const { stack } = setup();
    expect(() => stack.tick(INPUT)).not.toThrow();
  });

  it('holds 8 scenes and rejects a 9th, a scene already on it and a runaway chain', () => {
    const log: string[] = [];
    const stack = createSceneStack();
    const many: LogScene[] = [];
    for (let i = 0; i < 9; i++) many.push(new LogScene(`s${i}`, log, () => stack, true));
    for (let i = 0; i < 8; i++) stack.push(many[i]);
    expect(stack.depth).toBe(8);
    expect(() => stack.push(many[8])).toThrow(RangeError);
    stack.pop();
    expect(() => stack.push(many[0])).toThrow(/already on the stack/);
    expect(() => stack.replace(many[0])).toThrow(/already on the stack/);
    // A tick that queues more than 8 transitions.
    const other = createSceneStack();
    const a = new LogScene('a', log, () => other);
    const b = new LogScene('b', log, () => other);
    a.onTick = (s) => {
      for (let i = 0; i < 9; i++) s.replace(b);
    };
    other.push(a);
    expect(() => other.tick(INPUT)).toThrow(/more than 8/);
    // Scenes that replace each other forever.
    const loop = createSceneStack();
    const x = new LogScene('x', log, () => loop);
    const y = new LogScene('y', log, () => loop);
    x.onEnter = (s) => s.replace(y);
    y.onEnter = (s) => s.replace(x);
    expect(() => loop.push(x)).toThrow(/keep requesting/);
  });
});

describe('core/scenes mergeMenuInput', () => {
  it("ORs every player's masks and keeps player 1's device", () => {
    const snapshot = createInputSnapshot();
    snapshot.players[0].held = Action.Up;
    snapshot.players[0].pressed = Action.Up;
    snapshot.players[0].device = 'remote';
    snapshot.players[1].held = Action.Confirm;
    snapshot.players[1].pressed = Action.Confirm;
    snapshot.players[1].released = Action.Back;
    const out = { held: 0, pressed: 0, released: 0, device: 'none' as const } as {
      held: number;
      pressed: number;
      released: number;
      device: 'none' | 'remote' | 'keyboard' | 'gamepad';
    };
    expect(mergeMenuInput(snapshot, out)).toBe(out);
    expect(out).toEqual({
      held: Action.Up | Action.Confirm,
      pressed: Action.Up | Action.Confirm,
      released: Action.Back,
      device: 'remote',
    });
  });
});
