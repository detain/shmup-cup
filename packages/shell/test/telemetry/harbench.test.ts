/**
 * `shell/telemetry`'s M7 hardware-bench wire (plan v20x HARBENCH): the versioned `harbench`
 * payload a program session POSTs to the log server, its zero-trust shape validator, and the
 * sender on the shared bench transport — every record class of S1–S6 legal on the wire before
 * the widget emits it, and every malformed row refused without trusting a field of it.
 */
import { describe, expect, it } from 'vitest';
import { RAF_BUCKETS } from '@shmup/render-pixi';
import {
  HARBENCH_FORMAT_VERSION,
  HARBENCH_KIND,
  HARBENCH_RECORD_KINDS,
  MAX_HARBENCH_RECORDS,
  RENDER_REQUEST_TIMEOUT_MS,
  buildHarbenchPayload,
  buildRenderBenchPayload,
  harbenchPayloadIssues,
  isHarbenchPayload,
  makeHarbenchSessionId,
  makeRenderBenchSessionId,
  makeRenderSessionId,
  sendHarbench,
  type HarbenchBootRecord,
  type HarbenchDecodeRecord,
  type HarbenchEnv,
  type HarbenchInputRecord,
  type HarbenchMemoryRecord,
  type HarbenchPayload,
  type HarbenchProbeRecord,
  type HarbenchRecord,
  type HarbenchRenderRecord,
  type HarbenchRewindRecord,
  type HarbenchWatchdogRecord,
} from '../../src/telemetry/index.js';

/** Session facts of one S1 run (the frozen env identity, plus the two harbench fields). */
const ENV: HarbenchEnv = {
  buildId: 'abc1234',
  host: 'tizen',
  userAgent: 'Chrome/69 Tizen 5.5',
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  webGLVersion: 1,
  scenarios: 18,
  startedAt: 1_700_000_000_000,
  phase: 'S1',
  gameMode: false,
};

/** A full render row — every frozen `render-bench` stat plus the knob and the video flag. */
function renderRecord(): HarbenchRenderRecord {
  const raf = new Array<number>(RAF_BUCKETS).fill(0);
  raf[1] = 120;
  return {
    record: 'render',
    scenario: '640x360-busy',
    index: 6,
    size: '640x360',
    width: 1920,
    height: 1080,
    density: 1.5,
    variant: 'dense',
    crt: 'off',
    filter: true,
    mode7: false,
    webGLVersion: 1,
    displayWidth: 1920,
    displayHeight: 1080,
    scale: 3,
    phaseMs: [0.4, 0.7, 1.1],
    frames: 600,
    syncedFrames: 600,
    renderMs: [3.1, 4.2, 6.8, 12.5],
    syncedMs: [4.0, 5.1, 7.9, 14.2],
    frameMs: [6.2, 8.4, 12.1, 21.0],
    raf,
    tickFrames: [0, 12, 560, 28],
    twoTickShare: 0.047,
    drawCalls: 148,
    rebuilds: -1,
    renderTargetBytes: 3_686_400,
    frameTargetBytes: 8_294_400,
    textureBytes: 41_943_040,
    atlasPages: 5,
    heapMeasured: true,
    heapStartBytes: 20_971_520,
    heapEndBytes: 21_233_664,
    heapDeltaBytes: 262_144,
    load: { bullets: 312, points: 40, enemies: 46, particles: 256, tiles: 560 },
    endedAt: 1_700_000_030_000,
    knob: 'interp',
    video: false,
  };
}

/** A full decode row — the frozen record verbatim with one complete page. */
function decodeRecord(): HarbenchDecodeRecord {
  return {
    record: 'decode',
    scenario: 'decode',
    index: 18,
    webGLVersion: 1,
    repetitions: 10,
    imageDecode: true,
    imageBitmap: true,
    pages: [
      {
        id: 'common',
        what: 'atlas page',
        width: 2_048,
        height: 2_048,
        encoding: 'png8',
        bytes: 1_048_576,
        textureBytes: 16_777_216,
        repetitions: 10,
        fetchMs: [11, 14, 22, 30],
        decodeMs: [40, 52, 77, 95],
        uploadMs: [6, 9, 15, 20],
        uploadSyncedMs: [18, 24, 41, 60],
        totalMs: [70, 88, 130, 170],
        firstTotalMs: 210,
        bitmapMs: [22, 28, 44, 60],
        bitmapUploadMs: [30, 38, 55, 80],
        error: null,
      },
    ],
    error: null,
    endedAt: 1_700_000_060_000,
  };
}

/** The rewind timing row — the number behind the M7 slowdown ESTIMATE, with its flag. */
function rewindRecord(): HarbenchRewindRecord {
  return {
    record: 'rewind',
    scenario: 'rewind',
    index: 19,
    startedAt: 1_700_000_070_000,
    endedAt: 1_700_000_080_000,
    ticks: 1_800,
    stepsPerSecond: 733.4,
    worldBuildMs: 41.2,
    hashMs: 0.9,
    hashChecks: 30,
    capTicks: 2_640,
    capTicksEstimated: true,
    stage: 'zone-a',
    error: null,
  };
}

/** The boot row — manifest XHR, shipped bitmap branch flags, one page, time to a frame. */
function bootRecord(): HarbenchBootRecord {
  return {
    record: 'boot',
    scenario: 'boot',
    index: 0,
    startedAt: 1_700_000_000_100,
    endedAt: 1_700_000_004_000,
    manifestMs: [8, 12, 19, 24],
    atlasBytes: 262_144,
    imageBitmap: true,
    bitmapBranch: true,
    pages: [
      {
        id: 'zone-a',
        width: 2_048,
        height: 2_048,
        bytes: 524_288,
        fetchMs: [30, 41, 66, 80],
        bitmapMs: [44, 58, 90, 110],
        decodeMs: null,
        uploadMs: [9, 12, 18, 25],
        syncedMs: [26, 33, 51, 66],
        totalMs: [88, 110, 168, 200],
        viaBitmap: true,
        error: null,
      },
    ],
    bootMs: 3_900,
    error: null,
  };
}

/** The memory soak row — heap series, page ledger, and the optional supervisor-paired RSS. */
function memoryRecord(withRss: boolean): HarbenchMemoryRecord {
  const row: HarbenchMemoryRecord = {
    record: 'memory',
    scenario: 'soak',
    index: 1,
    startedAt: 1_700_000_100_000,
    endedAt: 1_700_001_000_000,
    seconds: 900,
    cycles: 24,
    heapMeasured: true,
    heapStartBytes: 33_554_432,
    heapPeakBytes: 41_943_040,
    heapEndBytes: 37_748_736,
    heapDeltaBytes: 4_194_304,
    heapSamples: [33_554_432, 35_651_584, 37_748_736],
    pageLedgerMin: 3,
    pageLedgerMax: 9,
    error: null,
  };
  if (withRss) row.rssBytes = 92_274_688;
  return row;
}

/** The extension probe row — both lists (GL2's null on the TVs), presence flags, ETC smoke. */
function probeRecord(): HarbenchProbeRecord {
  return {
    record: 'probe',
    scenario: 'probe',
    index: 0,
    startedAt: 1_700_000_000_200,
    endedAt: 1_700_000_000_900,
    webglExtensions: [
      'WEBGL_lose_context',
      'OES_element_index_uint',
      'WEBGL_compressed_texture_etc1',
    ],
    webgl2Extensions: null,
    deviceMemory: 1.5,
    hardwareConcurrency: 4,
    offscreenCanvas: false,
    reduceMotionResolves: false,
    smokeUploadMs: [0.4, 0.6, 1.2, 1.8],
    error: null,
  };
}

/** The input row — gamepad presence and per-key delivery / repeat / tick-lag rows. */
function inputRecord(): HarbenchInputRecord {
  return {
    record: 'input',
    scenario: 'input',
    index: 0,
    startedAt: 1_700_000_200_000,
    endedAt: 1_700_000_260_000,
    gamepadPresent: false,
    keys: [
      {
        id: 'ColorF0Red',
        keyCode: 404,
        delivered: true,
        presses: 12,
        repeatsPerSecond: 9.3,
        appliedMs: [210, 356, 640, 900],
      },
      {
        id: 'MediaPlayPause',
        keyCode: 0,
        delivered: false,
        presses: 0,
        repeatsPerSecond: null,
        appliedMs: null,
      },
    ],
    error: null,
  };
}

/** The watchdog row — the dead-frame burn, the swap latency, the restore answer. */
function watchdogRecord(): HarbenchWatchdogRecord {
  return {
    record: 'watchdog',
    scenario: 'watchdog',
    index: 0,
    startedAt: 1_700_000_300_000,
    endedAt: 1_700_000_303_000,
    framesAfterLoss: 58,
    screenSwapMs: 980,
    contextRestored: false,
    error: null,
  };
}

/** One valid row of every record class, in wire order. */
function allRecords(): HarbenchRecord[] {
  return [
    renderRecord(),
    decodeRecord(),
    rewindRecord(),
    bootRecord(),
    memoryRecord(false),
    probeRecord(),
    inputRecord(),
    watchdogRecord(),
  ];
}

/** The paths of a payload's issues (empty means exactly a version-1 payload). */
function pathsOf(value: unknown): string[] {
  return harbenchPayloadIssues(value).map((i) => i.path);
}

/** The wire form (JSON round-tripped) of the all-kinds payload, given a mutation. */
function mutated(mutate: (p: Record<string, unknown>) => void): Record<string, unknown> {
  const p = JSON.parse(
    JSON.stringify(
      buildHarbenchPayload('hb-abc123-0001', 1, 1_700_000_400_000, ENV, allRecords(), false),
    ),
  ) as Record<string, unknown>;
  mutate(p);
  return p;
}

/** A scripted XMLHttpRequest stand-in (the render-bench test's fake, kept per-file). */
class FakeXhr {
  method = '';
  url = '';
  timeout = 0;
  status = 0;
  headers: Record<string, string> = {};
  body: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  /**
   * @param fail - Which call throws, if any.
   */
  constructor(private readonly fail: 'open' | 'send' | null = null) {}
  open(method: string, url: string): void {
    if (this.fail === 'open') throw new Error('blocked');
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: string): void {
    if (this.fail === 'send') throw new Error('offline');
    this.body = body;
  }
}

/**
 * Sends one harbench payload through a fake request.
 *
 * @param xhr - The fake.
 * @param endpoint - The endpoint.
 * @param records - The rows to carry.
 * @returns The outcomes reported and whether a request went out.
 */
function send(
  xhr: FakeXhr,
  endpoint: string | null = 'http://10.0.0.2:8787/report',
  records: HarbenchRecord[] = [watchdogRecord()],
): { outcomes: [boolean, string | null][]; sent: boolean } {
  const outcomes: [boolean, string | null][] = [];
  const payload = buildHarbenchPayload('hb-abc123-0001', 2, 99, ENV, records, false);
  const sent = sendHarbench(
    endpoint,
    payload,
    () => xhr as unknown as XMLHttpRequest,
    (ok, error) => {
      outcomes.push([ok, error]);
    },
  );
  return { outcomes, sent };
}

describe('shell/telemetry harbench wire v1 (v20x HARBENCH)', () => {
  it('claims the kind, version, record union and size cap the plan names', () => {
    expect(HARBENCH_KIND).toBe('harbench');
    expect(HARBENCH_FORMAT_VERSION).toBe(1);
    expect(HARBENCH_RECORD_KINDS).toEqual([
      'render',
      'decode',
      'rewind',
      'boot',
      'memory',
      'probe',
      'input',
      'watchdog',
    ]);
    expect(MAX_HARBENCH_RECORDS).toBe(128);
  });

  it('names a program session hb-…, apart from rp-, rb- and ip-', () => {
    const id = makeHarbenchSessionId(1_700_000_000_000, 0.5);
    expect(id).toMatch(/^hb-[a-z0-9]+-[a-z0-9]{4}$/);
    expect(id.slice(3)).toBe(makeRenderSessionId(1_700_000_000_000, 0.5).slice(3));
    expect(id).not.toBe(makeRenderBenchSessionId(1_700_000_000_000, 0.5));
    expect(pathsOf(mutated((p) => (p.session = id)))).toEqual([]);
  });

  it('builds the payload with kind and version forced by the builder', () => {
    const rows = [rewindRecord()];
    const payload = buildHarbenchPayload('hb-x', 1, 5, ENV, rows, true);
    expect(payload).toEqual({
      kind: 'harbench',
      formatVersion: 1,
      session: 'hb-x',
      seq: 1,
      sentAt: 5,
      env: ENV,
      records: rows,
      done: true,
    });
  });

  it('accepts every record class of the version-1 union', () => {
    for (const row of allRecords()) {
      expect(harbenchPayloadIssues(mutated((p) => (p.records = [row])))).toEqual([]);
    }
    const withRss = memoryRecord(true);
    expect(harbenchPayloadIssues(mutated((p) => (p.records = [withRss])))).toEqual([]);
    expect(allRecords().map((r) => r.record)).toEqual([...HARBENCH_RECORD_KINDS]);
  });

  it('survives the wire: a JSON round-trip of all eight rows is issue-free', () => {
    const payload = buildHarbenchPayload(
      'hb-abc123-0001',
      7,
      1_700_000_400_000,
      ENV,
      allRecords(),
      true,
    );
    const onTheWire = JSON.parse(JSON.stringify(payload)) as unknown;
    expect(harbenchPayloadIssues(onTheWire)).toEqual([]);
    expect(isHarbenchPayload(onTheWire)).toBe(true);
  });

  it('passes fields it does not know (a newer row reader never wedges an additive send)', () => {
    const value = mutated((p) => {
      p.futureHeader = 42;
      (p.records as Record<string, unknown>[])[2].futureField = 'whatever';
    });
    expect(harbenchPayloadIssues(value)).toEqual([]);
  });
});

describe('harbenchPayloadIssues refuses malformed wire (zero server-side trust)', () => {
  it('refuses values that are not payload objects', () => {
    for (const value of [null, undefined, 42, 'hb', [], [{ record: 'watchdog' }]]) {
      expect(pathsOf(value)).toContain('');
    }
  });

  it('refuses the frozen render-bench payload verbatim (the old wire is not this wire)', () => {
    const rb = buildRenderBenchPayload('rb-x', 1, 5, ENV, [], true);
    expect(pathsOf(rb)).toContain('kind');
    expect(isHarbenchPayload(rb)).toBe(false);
  });

  it('refuses a version it does not know and a header that lost its fields', () => {
    expect(pathsOf(mutated((p) => (p.formatVersion = 2)))).toContain('formatVersion');
    expect(pathsOf(mutated((p) => delete p.formatVersion))).toContain('formatVersion');
    expect(pathsOf(mutated((p) => delete p.kind))).toContain('kind');
    expect(pathsOf(mutated((p) => delete p.env))).toContain('env');
    expect(pathsOf(mutated((p) => delete p.done))).toContain('done');
  });

  it('refuses sessions outside the hb- namespace and beyond the server file-name cap', () => {
    for (const session of [
      '',
      'rb-abc123-0001',
      'rp-abc123-0001',
      'hb-',
      'hb-' + 'x'.repeat(62),
      'hb bad',
    ]) {
      expect(pathsOf(mutated((p) => (p.session = session)))).toContain('session');
    }
    expect(pathsOf(mutated((p) => (p.session = 'hb-' + 'x'.repeat(61))))).toEqual([]);
  });

  it('refuses a sequence that is not a whole 1-or-more and non-finite wire numbers', () => {
    expect(pathsOf(mutated((p) => (p.seq = 0)))).toContain('seq');
    expect(pathsOf(mutated((p) => (p.seq = 1.5)))).toContain('seq');
    const direct = mutated((p) => {
      p.seq = Number.NaN;
    });
    expect(pathsOf(direct)).toContain('seq');
    const sentAt = mutated((p) => {
      p.sentAt = Number.POSITIVE_INFINITY;
    });
    expect(pathsOf(sentAt)).toContain('sentAt');
  });

  it('refuses env fields that drifted (the A/B flag and the phase tag included)', () => {
    expect(
      pathsOf(mutated((p) => ((p.env as Record<string, unknown>).gameMode = 'true'))),
    ).toContain('env.gameMode');
    expect(pathsOf(mutated((p) => delete (p.env as Record<string, unknown>).phase))).toContain(
      'env.phase',
    );
    expect(pathsOf(mutated((p) => ((p.env as Record<string, unknown>).buildId = '')))).toContain(
      'env.buildId',
    );
  });

  it('refuses a record array that is not one, is oversized, or lost its discriminator', () => {
    expect(pathsOf(mutated((p) => (p.records = 'nope')))).toContain('records');
    expect(pathsOf(mutated((p) => (p.records = {})))).toContain('records');
    const oversized = mutated((p) => {
      const rows: unknown[] = [];
      for (let i = 0; i < MAX_HARBENCH_RECORDS + 1; i++) rows.push(watchdogRecord());
      p.records = rows;
    });
    expect(pathsOf(oversized)).toContain('records');
    expect(pathsOf(mutated((p) => ((p.records as unknown[])[0] = { scenario: 'x' })))).toContain(
      'records[0].record',
    );
    expect(
      pathsOf(mutated((p) => ((p.records as unknown[])[1] = { record: 'mem', scenario: 'm' }))),
    ).toContain('records[1].record');
    expect(pathsOf(mutated((p) => ((p.records as unknown[])[2] = 7)))).toContain('records[2]');
  });

  it('refuses inherited-only fields (a prototype-cheated payload is not a payload)', () => {
    const good = JSON.parse(
      JSON.stringify(buildHarbenchPayload('hb-x', 1, 5, ENV, [watchdogRecord()], false)),
    ) as Record<string, unknown>;
    const cheat = Object.create(good) as Record<string, unknown>;
    cheat.records = [watchdogRecord()];
    cheat.done = false;
    expect(pathsOf(cheat).length).toBeGreaterThan(0);
    expect(pathsOf(cheat)).toContain('kind');
  });

  it('refuses a render row whose new or frozen fields drifted', () => {
    expect(
      pathsOf(
        mutated((p) => {
          delete (p.records as Record<string, unknown>[])[0].knob;
        }),
      ),
    ).toContain('records[0].knob');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[0];
          r.video = 1;
        }),
      ),
    ).toContain('records[0].video');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[0];
          r.twoTickShare = 1.5;
        }),
      ),
    ).toContain('records[0].twoTickShare');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[0];
          r.raf = [1, 2, 3];
        }),
      ),
    ).toContain('records[0].raf');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[0];
          r.rebuilds = -2;
        }),
      ),
    ).toContain('records[0].rebuilds');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[0];
          r.load = 4;
        }),
      ),
    ).toContain('records[0].load');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[0];
          r.phaseMs = [1, 2, 3, 4];
        }),
      ),
    ).toContain('records[0].phaseMs');
  });

  it('refuses a malformed row of every other record class', () => {
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[1];
          r.pages = 'nope';
        }),
      ),
    ).toContain('records[1].pages');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[1];
          (r.pages as Record<string, unknown>[])[0].bitmapMs = [1, 2, 3];
        }),
      ),
    ).toContain('records[1].pages[0].bitmapMs');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[2];
          delete r.capTicksEstimated;
        }),
      ),
    ).toContain('records[2].capTicksEstimated');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[2];
          r.stepsPerSecond = -733.4;
        }),
      ),
    ).toContain('records[2].stepsPerSecond');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[3];
          r.manifestMs = [1, 2, 3];
        }),
      ),
    ).toContain('records[3].manifestMs');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[3];
          (r.pages as Record<string, unknown>[])[0].viaBitmap = 'yes';
        }),
      ),
    ).toContain('records[3].pages[0].viaBitmap');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[4];
          r.rssBytes = -5;
        }),
      ),
    ).toContain('records[4].rssBytes');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[4];
          (r.heapSamples as unknown[]).push('a lot');
        }),
      ),
    ).toContain('records[4].heapSamples[3]');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[5];
          r.webgl2Extensions = 7;
        }),
      ),
    ).toContain('records[5].webgl2Extensions');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[6];
          (r.keys as Record<string, unknown>[])[0].keyCode = 70_000;
        }),
      ),
    ).toContain('records[6].keys[0].keyCode');
    expect(
      pathsOf(
        mutated((p) => {
          const r = (p.records as Record<string, unknown>[])[7];
          r.contextRestored = 'yes';
        }),
      ),
    ).toContain('records[7].contextRestored');
  });
});

describe('shell/telemetry harbench sender (shared bench transport)', () => {
  it('POSTs text/plain JSON with the timeout and reports a 2xx once', () => {
    const xhr = new FakeXhr();
    const { outcomes, sent } = send(xhr);
    expect(sent).toBe(true);
    expect([xhr.method, xhr.url, xhr.timeout]).toEqual([
      'POST',
      'http://10.0.0.2:8787/report',
      RENDER_REQUEST_TIMEOUT_MS,
    ]);
    expect(xhr.headers['Content-Type']).toBe('text/plain;charset=UTF-8');
    const body = JSON.parse(xhr.body as string) as HarbenchPayload;
    expect([body.kind, body.formatVersion, body.seq]).toEqual([HARBENCH_KIND, 1, 2]);
    expect(harbenchPayloadIssues(body)).toEqual([]);
    expect(outcomes).toEqual([]);
    xhr.status = 204;
    xhr.onload?.();
    xhr.onerror?.(); // a late event never reports twice
    expect(outcomes).toEqual([[true, null]]);
  });

  it('reports an HTTP error, a network error and a timeout', () => {
    const http = new FakeXhr();
    const a = send(http);
    http.status = 500;
    http.onload?.();
    expect(a.outcomes).toEqual([[false, 'HTTP 500']]);

    const network = new FakeXhr();
    const b = send(network);
    network.onerror?.();
    expect(b.outcomes).toEqual([[false, 'network error']]);

    const slow = new FakeXhr();
    const c = send(slow);
    slow.ontimeout?.();
    slow.onload?.();
    expect(c.outcomes).toEqual([[false, 'timeout']]);
  });

  it('never throws: no server, a request that cannot open or send, a payload that cannot serialize', () => {
    expect(send(new FakeXhr(), null)).toEqual({ outcomes: [[false, 'off']], sent: false });
    expect(send(new FakeXhr('open'))).toEqual({
      outcomes: [[false, 'open: Error: blocked']],
      sent: false,
    });
    expect(send(new FakeXhr('send'))).toEqual({
      outcomes: [[false, 'Error: offline']],
      sent: false,
    });
    const cyclic = watchdogRecord() as HarbenchWatchdogRecord & { self?: unknown };
    cyclic.self = cyclic;
    const outcomes: boolean[] = [];
    expect(
      sendHarbench(
        'http://h/report',
        buildHarbenchPayload('hb-x', 1, 0, ENV, [cyclic], false),
        () => new FakeXhr() as unknown as XMLHttpRequest,
        (ok) => {
          outcomes.push(ok);
        },
      ),
    ).toBe(false);
    expect(outcomes).toEqual([false]);
  });
});
