/**
 * Recording Canvas2D context and a fake WebGL context, for headless tests of the DOM glue.
 */

/** One recorded canvas call, with the fill style active at the time. */
export interface DrawCall {
  op: string;
  args: unknown[];
  fillStyle: unknown;
}

/**
 * Creates a Canvas2D stand-in: every method call is recorded, property writes are kept.
 *
 * @returns the context (typed loosely) and its call log.
 */
export function createRecordingContext2D(): { ctx: CanvasRenderingContext2D; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const state: Record<string | symbol, unknown> = { fillStyle: '#000000', globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ op: String(prop), args, fillStyle: target['fillStyle'] });
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Parameters returned by {@link createFakeWebGL}. */
export interface FakeWebGLInfo {
  maxTextureSize: number;
  renderer: string;
  vendor: string;
  version: string;
  debugInfo: boolean;
}

/** A WebGL context stand-in answering the few queries `env.ts` makes. */
export function createFakeWebGL(info: FakeWebGLInfo): { gl: unknown; lost: () => boolean } {
  let lost = false;
  const P = { MAX_TEXTURE_SIZE: 0x0d33, RENDERER: 0x1f01, VENDOR: 0x1f00, VERSION: 0x1f02, UR: 0x9246, UV: 0x9245 };
  const gl = {
    MAX_TEXTURE_SIZE: P.MAX_TEXTURE_SIZE,
    RENDERER: P.RENDERER,
    VENDOR: P.VENDOR,
    VERSION: P.VERSION,
    getExtension(name: string): unknown {
      if (name === 'WEBGL_debug_renderer_info') return info.debugInfo ? { UNMASKED_RENDERER_WEBGL: P.UR, UNMASKED_VENDOR_WEBGL: P.UV } : null;
      if (name === 'WEBGL_lose_context') return { loseContext: () => void (lost = true) };
      return null;
    },
    getParameter(p: number): unknown {
      switch (p) {
        case P.MAX_TEXTURE_SIZE:
          return info.maxTextureSize;
        case P.UR:
          return info.renderer;
        case P.UV:
          return info.vendor;
        case P.RENDERER:
          return 'WebKit WebGL';
        case P.VENDOR:
          return 'WebKit';
        case P.VERSION:
          return info.version;
        default:
          return null;
      }
    },
  };
  return { gl, lost: () => lost };
}
