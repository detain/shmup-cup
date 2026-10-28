/**
 * The TV render bench's **cull walk** (plan R-SVG WO-2 — part of the `bench` module, see
 * `./index.ts`): the bench-side installation of the mechanism `v20x-SPIKE-report.md` arm B measured,
 * so the two `cull` knob rows (`./matrix.ts` `BENCH_KNOBS`) price it against the plain row of the
 * same size and variant on the owner's own hardware.
 *
 * **What the spike's arm B was.** Every textured leaf sprite under the renderer's scene container
 * tagged `cullable = true` with a tight local `boundsArea` (7,386 of them at 640×360 busy), then one
 * cull pass per frame over that subtree with the transforms left as the render put them. It measured
 * **+1.200 ms of p95** — the walk and the render-group rebuilds its flips cause cost more than the
 * drawn sprites it saves, and only 8 of 1,727 visible sprites ever sat off-frame — so its verdict was
 * *do not ask for a TV run*. The owner folded the rows into the matrix anyway (2026-10-28): the M7
 * carries far more sprites per frame than the desktop rig did, and the record of what culling costs
 * on the shipped renderer belongs in the bench, not in a throwaway.
 *
 * **Why the walk is here and not in `@shmup/render-pixi`.** Pixi's `CullerPlugin` only ever runs the
 * cull from an `Application`'s render hook, and the bench (like the game) drives a raw
 * `WebGLRenderer` — the plugin never fires (spike §1.2). The alternative was to call `Culler.shared`
 * from the bench, which would need `apps/tizen` to import `pixi.js` directly: the app resolves only
 * `@shmup/render-pixi` today, and a second Pixi entry in the TV bundle is exactly the dependency scar
 * `b42d34f2` taught this project about. And a helper inside `packages/render-pixi/src` is out of the
 * question for a bench-only measurement: that tree is what `scripts/game-code-hash.mjs` digests, so
 * moving it would re-key every pooled sample for a row nobody ships. So this file mirrors Pixi 8.22's
 * `Culler._cullRecursive` over the same scene, reading and writing the same fields.
 *
 * **What is therefore *not* being measured.** Pixi's own recursion, its `cullArea` fast path, and the
 * `getGlobalBounds` cache it consults for a tagged node without a `boundsArea` — this walk always
 * finds a `boundsArea` (this file wrote it), so it prices the *cheapest* shape of the idea: a flat
 * rect test per sprite, the subtree pruned by nothing but the flags. The spike's `what` and this
 * module doc are the disclosure; the rows' `rebuilds` column shows what the flips did to the
 * render-group structure.
 *
 * **The culled bit, not `visible`.** `culled` is the field Pixi's Culler writes (a bit in the
 * container's display status, which folds into `globalDisplayStatus` and takes the renderable out of
 * the batch), and it is *not* owned by the renderer's per-frame sprite sync — `visible` is. Writing
 * `visible` here would fight the sync every frame and measure a fight instead of a cull.
 *
 * **Zero allocation.** One pass walks the tree with plain numbers read into fields; `tag()` runs once
 * per scenario before the loop starts and allocates the rectangles it writes.
 *
 * **Public API.** {@link CullNode}, {@link BenchCullFacts}, {@link BenchCull},
 * {@link createBenchCull}.
 *
 * @module
 */

/** A rectangle read structurally (Pixi's `Rectangle` or `Bounds`; only these four numbers are used). */
export interface CullRect {
  /** Left edge in the node's own space. */
  readonly x: number;
  /** Top edge in the node's own space. */
  readonly y: number;
  /** Width in the node's own space. */
  readonly width: number;
  /** Height in the node's own space. */
  readonly height: number;
}

/** The affine of a node in the root's space (Pixi's `Matrix`, read structurally). */
export interface CullMatrix {
  /** Scale/skew term. */
  readonly a: number;
  /** Scale/skew term. */
  readonly b: number;
  /** Scale/skew term. */
  readonly c: number;
  /** Scale/skew term. */
  readonly d: number;
  /** Translation x. */
  readonly tx: number;
  /** Translation y. */
  readonly ty: number;
}

/**
 * One node of the subtree this walker walks — the slice of Pixi's `Container` it reads or writes,
 * declared here because `apps/tizen` does not resolve `pixi.js` (see the module docs). Every member
 * is a real Pixi 8.22 field with the same name and meaning; {@link createBenchCull}'s caller casts the
 * renderer's scene container to it once.
 */
export interface CullNode {
  /** The node's children (Pixi keeps them in an array on every `Container`). */
  readonly children: readonly CullNode[];
  /** Its affine in the scene's space, as the last render left it. */
  readonly worldTransform: CullMatrix;
  /** Its own scale (Pixi's `ObservablePoint`, read structurally — 1 when a node has none). */
  readonly scale?: { readonly x: number; readonly y: number } | null;
  /** Whether a cull pass may hide it (the tag {@link BenchCull.tag} sets). */
  cullable: boolean;
  /** Whether the pass walks its children (Pixi's default is `true`). */
  cullableChildren: boolean;
  /** Whether the last pass found it outside the view — the field the pass writes. */
  culled: boolean;
  /** Whether it draws at all (`false` prunes the subtree, as in Pixi). */
  renderable: boolean;
  /** Whether it takes part in bounds (`false` prunes the subtree, as in Pixi). */
  measurable: boolean;
  /** Whether it is in the batch build (`false` prunes the subtree, as in Pixi). */
  includeInBuild: boolean;
  /** The tight local bounds {@link BenchCull.tag} writes — a real Pixi `Rectangle`. */
  boundsArea: CullRect | null;
  /** A sprite's texture (a leaf without one is a container: never tagged). */
  readonly texture?: { readonly frame: CullRect } | null;
  /** A sprite's anchor, in frame fractions. */
  readonly anchor?: { readonly x: number; readonly y: number } | null;
}

/** The writable view of {@link CullRect}, for the tag pass that fills a cloned rectangle in. */
interface MutableRect {
  /** Left edge in the node's own space. */
  x: number;
  /** Top edge in the node's own space. */
  y: number;
  /** Width in the node's own space. */
  width: number;
  /** Height in the node's own space. */
  height: number;
}

/** What a `cull` row's walk measured, as it rides the record (see {@link BenchCull.facts}). */
export interface BenchCullFacts {
  /** Textured leaves the tag walk tagged before the loop started. */
  readonly tagged: number;
  /** Cull passes since the pass counter was reset (the measured window). */
  readonly passes: number;
  /** Nodes visited per pass, rounded down (the walk's own size). */
  readonly visits: number;
  /** Tagged nodes found outside the view per pass, rounded down. */
  readonly culled: number;
  /** Writes that moved the `culled` bit per pass, rounded down (the structure churn). */
  readonly flips: number;
}

/** The cull walk of one scenario (see {@link createBenchCull}). */
export interface BenchCull {
  /**
   * Tags the subtree: every textured leaf below the root becomes `cullable` with a tight
   * `boundsArea`, once, before the frame loop starts.
   *
   * @returns The number of tagged sprites (also left in {@link BenchCull.tagged}).
   */
  tag(): number;
  /**
   * One cull pass over the tagged subtree, the transforms as the render that just finished left them
   * (Pixi's `skipUpdateTransform: true` posture).
   *
   * @returns The number of nodes found outside the view (also in {@link BenchCull.culled}).
   */
  cull(): number;
  /**
   * Starts the counters from zero, so {@link facts} describes one phase and not the whole scenario:
   * the bench calls it as the free-running measurement begins.
   */
  reset(): void;
  /**
   * The walk's figures for the measured window, as a record's `cull` field. Allocates — call it once,
   * when the scenario resolves.
   *
   * @returns The facts, with the per-pass figures rounded down to whole numbers.
   */
  facts(): BenchCullFacts;
  /** Textured leaves {@link tag} tagged. */
  readonly tagged: number;
  /** Nodes the last {@link cull} pass found outside the view. */
  readonly culled: number;
  /** Passes run so far. */
  readonly passes: number;
  /** Writes to {@link CullNode.culled} that actually changed the bit (the structure churn). */
  readonly flips: number;
  /** Nodes visited by all passes so far (the walk's per-frame cost is this over `passes`). */
  readonly visits: number;
}

/**
 * The bench's cull walk over a renderer's scene subtree (see the module docs).
 *
 * @param root - The scene container (`PixiRenderer['scene']`, cast to {@link CullNode}).
 * @param width - The view's width in scene units — the internal frame, not the display's.
 * @param height - The view's height in scene units.
 * @returns The walk. Its pass reads the flags and the tagged `boundsArea` of `root`'s subtree and
 *   writes `culled`; nothing is allocated after {@link BenchCull.tag} has run.
 * @throws {RangeError} When the view has no area.
 *
 * @example
 * ```ts
 * // In a `cull` knob row's frame loop, after `renderer.render(frame)`:
 * const cull = createBenchCull(renderer.scene as unknown as CullNode, size.width, size.height);
 * cull.tag(); // once, after the scene is built
 * // …every measured frame:
 * cull.cull(); // the sprites off the 640×360 view leave the next frame's batch
 * ```
 */
export function createBenchCull(root: CullNode, width: number, height: number): BenchCull {
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError(`bench cull: the view needs an area, got ${width}x${height}`);
  }
  return new BenchCullWalk(root, width, height);
}

/** The walk of {@link createBenchCull}: the counters as fields, the pass as a method. */
class BenchCullWalk implements BenchCull {
  private readonly _root: CullNode;
  private readonly _right: number;
  private readonly _bottom: number;
  private _tagged = 0;
  private _culled = 0;
  private _culledTotal = 0;
  private _passes = 0;
  private _flips = 0;
  private _visits = 0;

  /**
   * @param root - The scene container.
   * @param width - View width in scene units.
   * @param height - View height in scene units.
   */
  constructor(root: CullNode, width: number, height: number) {
    this._root = root;
    this._right = width;
    this._bottom = height;
  }

  /** Textured leaves tagged by {@link tag}. */
  get tagged(): number {
    return this._tagged;
  }

  /** Nodes the last pass found outside the view. */
  get culled(): number {
    return this._culled;
  }

  /** Passes run so far. */
  get passes(): number {
    return this._passes;
  }

  /** `culled` writes that changed the bit. */
  get flips(): number {
    return this._flips;
  }

  /** Nodes visited by all passes. */
  get visits(): number {
    return this._visits;
  }

  /**
   * Tags the subtree (see {@link BenchCull.tag}).
   *
   * @returns The tagged count.
   */
  tag(): number {
    this._tagged = 0;
    this._tagNode(this._root);
    return this._tagged;
  }

  /**
   * One pass over the subtree (see {@link BenchCull.cull}).
   *
   * @returns How many tagged nodes fell outside the view.
   */
  cull(): number {
    this._passes++;
    this._culled = 0;
    this._cullNode(this._root);
    this._culledTotal += this._culled;
    return this._culled;
  }

  /**
   * Zeroes the pass counters (see {@link BenchCull.reset}), leaving {@link BenchCull.tagged} — the
   * tag is a fact about the scene, not about a phase.
   */
  reset(): void {
    this._passes = 0;
    this._culled = 0;
    this._culledTotal = 0;
    this._flips = 0;
    this._visits = 0;
  }

  /**
   * The measured window's figures (see {@link BenchCull.facts}).
   *
   * @returns The facts, per-pass figures rounded down; `passes` is the window's frame count.
   */
  facts(): BenchCullFacts {
    const passes = this._passes;
    const per = passes > 0 ? passes : 1;
    return {
      tagged: this._tagged,
      passes,
      visits: Math.floor(this._visits / per),
      culled: Math.floor(this._culledTotal / per),
      flips: Math.floor(this._flips / per),
    };
  }

  /**
   * The tag walk: a textured leaf becomes cullable with the tight rect of its own frame, anchor and
   * scale folded in; anything with children is descended into and never tagged itself (the spike's
   * arm B tagged sprites, and a container's bounds are the union of what is already tagged).
   *
   * @param node - The node.
   */
  private _tagNode(node: CullNode): void {
    const children = node.children;
    if (children.length > 0) {
      for (let i = 0; i < children.length; i++) this._tagNode(children[i]);
      return;
    }
    const texture = node.texture;
    if (texture === undefined || texture === null) return;
    const frame = texture.frame;
    const anchor = node.anchor;
    const scale = node.scale;
    const ax = anchor === undefined || anchor === null ? 0 : anchor.x;
    const ay = anchor === undefined || anchor === null ? 0 : anchor.y;
    const sx = scale === undefined || scale === null ? 1 : scale.x;
    const sy = scale === undefined || scale === null ? 1 : scale.y;
    // The rectangle is the frame's own class cloned, never a look-alike literal: a later bounds query
    // inside Pixi would call methods on it.
    const bounds = (frame as unknown as { clone(): unknown }).clone() as MutableRect;
    bounds.width = frame.width * sx;
    bounds.height = frame.height * sy;
    // A zero anchor offsets nothing — and `-0 * w` is `-0`, which V8 boxes like any other fraction
    // (conventions' M1-17 rule), so the un-offset corner is written as the whole number it means.
    bounds.x = ax === 0 ? 0 : -ax * bounds.width;
    bounds.y = ay === 0 ? 0 : -ay * bounds.height;
    node.boundsArea = bounds;
    node.cullable = true;
    this._tagged++;
  }

  /**
   * One pass's step, Pixi 8.22's `Culler._cullRecursive` mirrored: the node's own test, then its
   * children unless the subtree is pruned.
   *
   * @param node - The node.
   */
  private _cullNode(node: CullNode): void {
    this._visits++;
    // Pixi writes `culled` from inside the same guard it tests under: what the walk does not measure
    // is left exactly as it stands, so a bit an earlier pass set on a branch it now prunes survives.
    if (node.cullable && node.measurable && node.includeInBuild) {
      const culled = this._outside(node);
      if (culled) this._culled++;
      this._writeCulled(node, culled);
    }
    if (
      !node.cullableChildren ||
      node.culled ||
      !node.renderable ||
      !node.measurable ||
      !node.includeInBuild
    ) {
      return;
    }
    const children = node.children;
    for (let i = 0; i < children.length; i++) this._cullNode(children[i]);
  }

  /**
   * Writes {@link CullNode.culled}, counting the write that moved the bit (the structure churn the
   * row is partly about).
   *
   * @param node - The node.
   * @param culled - Whether it is outside the view.
   */
  private _writeCulled(node: CullNode, culled: boolean): void {
    if (node.culled === culled) return;
    node.culled = culled;
    this._flips++;
  }

  /**
   * Whether a tagged node's transformed `boundsArea` misses the view — the four corners of the local
   * rect through the affine, as Pixi's `Rectangle.intersects(rect, transform)` reads them (the scene's
   * nodes are never rotated or skewed today, but a two-corner test would be wrong the day one is).
   *
   * @param node - The tagged node.
   * @returns `true` when nothing of it can land on the frame.
   */
  private _outside(node: CullNode): boolean {
    const area = node.boundsArea;
    if (area === null || area === undefined) return false;
    const m = node.worldTransform;
    const x0 = area.x;
    const y0 = area.y;
    const x1 = x0 + area.width;
    const y1 = y0 + area.height;
    const p0x = m.a * x0 + m.c * y0 + m.tx;
    const p1x = m.a * x1 + m.c * y0 + m.tx;
    const p2x = m.a * x0 + m.c * y1 + m.tx;
    const p3x = m.a * x1 + m.c * y1 + m.tx;
    const p0y = m.b * x0 + m.d * y0 + m.ty;
    const p1y = m.b * x1 + m.d * y0 + m.ty;
    const p2y = m.b * x0 + m.d * y1 + m.ty;
    const p3y = m.b * x1 + m.d * y1 + m.ty;
    const minX = Math.min(Math.min(p0x, p1x), Math.min(p2x, p3x));
    const maxX = Math.max(Math.max(p0x, p1x), Math.max(p2x, p3x));
    const minY = Math.min(Math.min(p0y, p1y), Math.min(p2y, p3y));
    const maxY = Math.max(Math.max(p0y, p1y), Math.max(p2y, p3y));
    return maxX <= 0 || maxY <= 0 || minX >= this._right || minY >= this._bottom;
  }
}
