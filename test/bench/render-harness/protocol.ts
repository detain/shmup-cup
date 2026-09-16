/**
 * # render-harness/protocol — what the render bench asks for and what it measured
 *
 * The wire types the two halves of the render benchmark (plan M3-02c) agree on: the Node driver
 * (`test/bench/render.perf.ts`) posts a {@link RenderBenchOptions} into the page through
 * {@link RenderBenchApi} and gets a {@link RenderBenchResult} back.
 *
 * They live in their own module (no DOM, no virtual modules, no Pixi) so that the driver, the
 * page and the headless tests of both (`test/integration/render-bench.test.ts`) can import them
 * without pulling the browser bundle in.
 *
 * @module
 */
import type { CrtFilter } from '@shmup/core';

/** What one bench scenario asks for. */
export interface RenderBenchOptions {
  /** Stage id to play (`zone-a`, `raster-range` for layer effects, `dimension` for Mode-7). */
  readonly stage: string;
  /** Internal frame width (the review's §7.5 knob; 384 is the shipped resolution). */
  readonly width: number;
  /** Internal frame height (216 is the shipped resolution). */
  readonly height: number;
  /** Canvas width in CSS pixels. */
  readonly displayWidth: number;
  /** Canvas height in CSS pixels. */
  readonly displayHeight: number;
  /** CRT setting (`off` / `light` / `full`). */
  readonly crt: CrtFilter;
  /** Ticks played before the measurement (the camera has to reach the effect ranges). */
  readonly warmupTicks: number;
  /** Frames rendered without measuring (shader links, batch growth — the review's F4 / F5). */
  readonly warmupFrames: number;
  /** Frames measured. */
  readonly frames: number;
  /** Objects leaked per frame — 0 normally; the heap gate's own fixture uses a positive number. */
  readonly leakPerFrame: number;
}

/** What one bench scenario measured. */
export interface RenderBenchResult {
  /** Frames measured. */
  readonly frames: number;
  /** Median `renderer.render()` time, ms. */
  readonly renderMedianMs: number;
  /** 95th-percentile `renderer.render()` time, ms. */
  readonly renderP95Ms: number;
  /** Longest `renderer.render()`, ms. */
  readonly renderMaxMs: number;
  /** WebGL draw calls of the last frame (both passes). */
  readonly drawCalls: number;
  /** Frames on which Pixi rebuilt the scene's instruction set (the review's F1). */
  readonly structureRebuilds: number;
  /** Bytes of pooled render targets Pixi created (the review's F2 / F3). */
  readonly renderTargetBytes: number;
  /** JS heap growth over the measured frames, bytes (the gate the review's F5 needs). */
  readonly heapDeltaBytes: number;
  /** Whether the browser reported a usable heap figure at all. */
  readonly heapMeasured: boolean;
  /** WebGL version the context really is. */
  readonly webGLVersion: number;
  /** Fewest live enemy bullets any measured frame carried. */
  readonly bullets: number;
  /** Fewest live point items any measured frame carried. */
  readonly points: number;
  /** Fewest live particles any measured frame carried. */
  readonly particles: number;
  /** Whether the Mode-7 floor was drawn. */
  readonly mode7: boolean;
  /** `LayerId` bits whose layer had an effect filter attached. */
  readonly layerEffectMask: number;
  /** Camera x at the end of the run (which stage section the load was measured over). */
  readonly cameraX: number;
  /** `World.status` at the end of the run (`playing` unless the stage ran out). */
  readonly worldStatus: string;
}

/** The API the bench drives from Node. */
export interface RenderBenchApi {
  /**
   * Runs one scenario: a fresh renderer and game, the scripted worst-case load, then the measured
   * frames.
   *
   * @param options - The scenario.
   * @returns What it measured.
   */
  run(options: RenderBenchOptions): Promise<RenderBenchResult>;
}
