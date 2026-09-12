/**
 * Edge cases of the scene stack (plan M1-16): a scene popping or replacing itself mid-tick, reset
 * semantics (empty stack, a scene already on it, no cover / uncover), no-op and refused replaces
 * leaving the stack untouched, exactly eight queued transitions, transitions requested by every
 * hook, a full stack reached from a tick, a throwing tick or hook not wedging the stack, and the
 * menu input merge over an empty or stale snapshot.
 */
import { describe, expect, it } from 'vitest';
import {
  Action,
  createInputSnapshot,
  type InputSnapshot,
  type PlayerInput,
} from '../../src/input/index.js';
import type { DrawList } from '../../src/presentation/index.js';
import {
  SCENE_STACK_DEPTH,
  createSceneStack,
  mergeMenuInput,
  type Scene,
  type SceneStack,
} from '../../src/scenes/index.js';

/** A scene that logs its hooks and can run callbacks in them. */
class LogScene implements Scene {
  readonly id = 'title' as const;
  readonly overlay = false;
  readonly inputContext = 'menu' as const;
  readonly dim = 0;
  uiRevision = 0;
  /** Ticks run. */
  ticks = 0;
  /** Runs in `tick()` after logging. */
  onTick: ((stack: SceneStack) => void) | null = null;
  /** Runs in `enter()`. */
  onEnter: ((stack: SceneStack) => void) | null = null;
  /** Runs in `exit()`. */
  onExit: ((stack: SceneStack) => void) | null = null;
  /** Runs in `cover()`. */
  onCover: ((stack: SceneStack) => void) | null = null;
  /** Runs in `uncover()`. */
  onUncover: ((stack: SceneStack) => void) | null = null;

  constructor(
    readonly name: string,
    private readonly log: string[],
    private readonly stack: SceneStack,
  ) {}

  enter(): void {
    this.log.push(`${this.name}.enter`);
    this.onEnter?.(this.stack);
  }

  exit(): void {
    this.log.push(`${this.name}.exit`);
    this.onExit?.(this.stack);
  }

  cover(): void {
    this.log.push(`${this.name}.cover`);
    this.onCover?.(this.stack);
  }

  uncover(): void {
    this.log.push(`${this.name}.uncover`);
    this.onUncover?.(this.stack);
  }

  tick(_input: InputSnapshot): void {
    this.ticks++;
    this.log.push(`${this.name}.tick`);
    this.onTick?.(this.stack);
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
  for (const name of names) scenes[name] = new LogScene(name, log, stack);
  return { stack, scenes, log };
}

/**
 * The scene names bottom to top.
 *
 * @param stack - The stack.
 * @returns The names.
 */
function names(stack: SceneStack): string[] {
  const out: string[] = [];
  for (let i = 0; i < stack.depth; i++) out.push((stack.sceneAt(i) as LogScene).name);
  return out;
}

const INPUT = createInputSnapshot();

describe('core/scenes stack edge: mid-tick transitions', () => {
  it('a scene popping itself finishes its tick first, then exits and uncovers the one below', () => {
    const { stack, scenes, log } = setup('game', 'pause');
    stack.push(scenes.game);
    stack.push(scenes.pause);
    log.length = 0;
    scenes.pause.onTick = (s) => {
      s.pop();
      log.push(`still top: ${(s.top as LogScene).name}`);
    };
    stack.tick(INPUT);
    expect(log).toEqual(['pause.tick', 'still top: pause', 'pause.exit', 'game.uncover']);
    expect(names(stack)).toEqual(['game']);
    expect(stack.contains(scenes.pause)).toBe(false);
  });

  it('pop then push in one tick: uncover, then cover again for the new top', () => {
    const { stack, scenes, log } = setup('game', 'pause', 'confirm');
    stack.push(scenes.game);
    stack.push(scenes.pause);
    log.length = 0;
    scenes.pause.onTick = (s) => {
      s.pop();
      s.push(scenes.confirm);
    };
    stack.tick(INPUT);
    expect(log).toEqual([
      'pause.tick',
      'pause.exit',
      'game.uncover',
      'game.cover',
      'confirm.enter',
    ]);
    expect(names(stack)).toEqual(['game', 'confirm']);
  });

  it('accepts exactly eight transitions in one tick', () => {
    const { stack, scenes } = setup('a', 'b');
    stack.push(scenes.a);
    scenes.a.onTick = (s) => {
      for (let i = 0; i < 4; i++) {
        s.push(scenes.b);
        s.pop();
      }
      expect(s.pending).toBe(8);
    };
    stack.tick(INPUT);
    expect([stack.pending, names(stack)]).toEqual([0, ['a']]);
  });

  it('a reset requested mid-tick exits every scene top first after the tick, no cover / uncover', () => {
    const { stack, scenes, log } = setup('title', 'game', 'pause', 'confirm');
    stack.push(scenes.game);
    stack.push(scenes.pause);
    stack.push(scenes.confirm);
    log.length = 0;
    scenes.confirm.onTick = (s) => {
      s.reset(scenes.title);
      log.push(`depth ${s.depth}`);
    };
    const revision = stack.revision;
    stack.tick(INPUT);
    expect(log).toEqual([
      'confirm.tick',
      'depth 3',
      'confirm.exit',
      'pause.exit',
      'game.exit',
      'title.enter',
    ]);
    expect(stack.revision).toBe(revision + 1);
    expect(names(stack)).toEqual(['title']);
  });
});

describe('core/scenes stack edge: reset and replace', () => {
  it('reset on an empty stack pushes; reset to a scene already on it re-enters it', () => {
    const { stack, scenes, log } = setup('title', 'game');
    stack.reset(scenes.title);
    expect([names(stack), log]).toEqual([['title'], ['title.enter']]);
    stack.push(scenes.game);
    log.length = 0;
    stack.reset(scenes.title);
    expect(log).toEqual(['game.exit', 'title.exit', 'title.enter']);
    expect(names(stack)).toEqual(['title']);
  });

  it('replacing the top with itself does nothing (no hooks, same revision)', () => {
    const { stack, scenes, log } = setup('a', 'b');
    stack.push(scenes.a);
    stack.push(scenes.b);
    log.length = 0;
    const revision = stack.revision;
    stack.replace(scenes.b);
    expect([log, stack.revision, names(stack)]).toEqual([[], revision, ['a', 'b']]);
  });

  it('a refused replace leaves the stack and its revision untouched', () => {
    const { stack, scenes, log } = setup('a', 'b');
    stack.push(scenes.a);
    stack.push(scenes.b);
    log.length = 0;
    const revision = stack.revision;
    expect(() => stack.replace(scenes.a)).toThrow(/'title' is already on the stack/);
    expect([log, stack.revision, names(stack), stack.pending]).toEqual([
      [],
      revision,
      ['a', 'b'],
      0,
    ]);
  });

  it('replace at full depth is allowed (the depth does not change)', () => {
    const log: string[] = [];
    const stack = createSceneStack();
    for (let i = 0; i < SCENE_STACK_DEPTH; i++) stack.push(new LogScene(`s${i}`, log, stack));
    const extra = new LogScene('extra', log, stack);
    stack.replace(extra);
    expect([stack.depth, stack.top]).toEqual([SCENE_STACK_DEPTH, extra]);
  });

  it('popping the last scene leaves an empty stack with nobody to uncover', () => {
    const { stack, scenes, log } = setup('a');
    stack.push(scenes.a);
    log.length = 0;
    const revision = stack.revision;
    stack.pop();
    expect([log, stack.top, stack.depth, stack.revision]).toEqual([
      ['a.exit'],
      null,
      0,
      revision + 1,
    ]);
    stack.pop();
    expect(stack.revision).toBe(revision + 1); // an empty pop changes nothing
    expect([stack.sceneAt(-1), stack.sceneAt(0)]).toEqual([null, null]);
  });
});

describe('core/scenes stack edge: hooks requesting transitions', () => {
  it('applies requests made by exit, cover and uncover hooks in the same flush, in order', () => {
    const { stack, scenes, log } = setup('base', 'top', 'x', 'y');
    stack.push(scenes.base);
    // Covering the base pushes x on top of the newcomer; uncovering it later pushes y.
    scenes.base.onCover = (s) => {
      scenes.base.onCover = null;
      s.push(scenes.x);
    };
    stack.push(scenes.top);
    expect(names(stack)).toEqual(['base', 'top', 'x']);
    expect(log).toEqual(['base.enter', 'base.cover', 'top.enter', 'top.cover', 'x.enter']);
    log.length = 0;
    scenes.x.onExit = (s) => s.pop(); // x leaving takes top with it
    scenes.base.onUncover = (s) => {
      scenes.base.onUncover = null;
      s.push(scenes.y);
    };
    stack.pop();
    expect(log).toEqual([
      'x.exit',
      'top.uncover',
      'top.exit',
      'base.uncover',
      'base.cover',
      'y.enter',
    ]);
    expect(names(stack)).toEqual(['base', 'y']);
    expect(stack.pending).toBe(0);
  });

  it('reports a push onto a full stack from a tick when the tick ends', () => {
    const log: string[] = [];
    const stack = createSceneStack();
    const scenes: LogScene[] = [];
    for (let i = 0; i < SCENE_STACK_DEPTH + 1; i++) scenes.push(new LogScene(`s${i}`, log, stack));
    for (let i = 0; i < SCENE_STACK_DEPTH; i++) stack.push(scenes[i]);
    scenes[SCENE_STACK_DEPTH - 1].onTick = (s) => s.push(scenes[SCENE_STACK_DEPTH]);
    expect(() => stack.tick(INPUT)).toThrow(/stack is full/);
    expect([stack.depth, stack.pending]).toEqual([SCENE_STACK_DEPTH, 0]);
    // The stack still works: the next tick runs, and a pop outside a tick applies at once.
    scenes[SCENE_STACK_DEPTH - 1].onTick = null;
    stack.tick(INPUT);
    stack.pop();
    expect(stack.depth).toBe(SCENE_STACK_DEPTH - 1);
  });

  it('a throwing tick leaves the stack out of tick mode (later requests apply at once)', () => {
    const { stack, scenes } = setup('a', 'b', 'c');
    stack.push(scenes.a);
    scenes.a.onTick = (s) => {
      s.push(scenes.b);
      throw new Error('boom');
    };
    expect(() => stack.tick(INPUT)).toThrow('boom');
    expect(stack.pending).toBe(1); // queued, not applied: the tick did not finish
    scenes.a.onTick = null;
    stack.push(scenes.c); // outside a tick: both apply now, in request order
    expect([names(stack), stack.pending]).toEqual([['a', 'b', 'c'], 0]);
  });

  it('a throwing hook does not leave the stack stuck mid-flush', () => {
    const { stack, scenes } = setup('a', 'b');
    scenes.a.onEnter = () => {
      throw new Error('enter failed');
    };
    expect(() => stack.push(scenes.a)).toThrow('enter failed');
    expect(stack.top).toBe(scenes.a); // it was placed before its hook ran
    stack.push(scenes.b);
    expect(names(stack)).toEqual(['a', 'b']);
  });

  it('only the top ticks, however long the others wait', () => {
    const { stack, scenes } = setup('a', 'b', 'c');
    stack.push(scenes.a);
    stack.push(scenes.b);
    stack.push(scenes.c);
    for (let t = 0; t < 50; t++) stack.tick(INPUT);
    expect([scenes.a.ticks, scenes.b.ticks, scenes.c.ticks]).toEqual([0, 0, 50]);
    stack.pop();
    stack.tick(INPUT);
    expect([scenes.a.ticks, scenes.b.ticks]).toEqual([0, 1]);
  });
});

describe('core/scenes mergeMenuInput edge', () => {
  it('overwrites stale values, and reads an empty snapshot as nothing from no device', () => {
    const out: PlayerInput = {
      held: Action.Back,
      pressed: Action.Back,
      released: Action.Up,
      device: 'gamepad',
    };
    mergeMenuInput({ players: [] }, out);
    expect(out).toEqual({ held: 0, pressed: 0, released: 0, device: 'none' });
    const snapshot = createInputSnapshot();
    snapshot.players[1].pressed = Action.Confirm;
    snapshot.players[1].device = 'gamepad';
    mergeMenuInput(snapshot, out);
    // Player 2 drives the menu; the device stays player 1's.
    expect(out).toEqual({ held: 0, pressed: Action.Confirm, released: 0, device: 'none' });
  });
});
