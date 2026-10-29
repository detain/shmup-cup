# M7 input probe — 2026-10-31 `2026-10-31-m7-bench-svg-features` session (probe `.wgt`, M70AET) — the **SVG capability matrix** on hardware

Two names, both kept honestly. The folder is the owner's — plan v20x R-SVG calls it the **Oct-31**
feature session and `2026-10-31-m7-bench-svg-features` is his label; it sits beside the bench folder
of the same evening (`../2026-10-31-m7-bench-pngfloor/`, which carries the naming law for `-bench`
runs). This session is an **`ip-` input-probe run**, so the September precedent (`2026-09-15-m7/`)
is its family, not the bench one; the owner's name stands as dropped. What the wire actually carries
is stated here, not papered over: the 83 payloads' server receipt stamps run
**2026-10-28T23:35:48.0Z → 23:39:54.1Z** (a focused ~4.1-minute sit, 3 min after the bench run's
closure record), the machine's own dates, left exactly as received.

The probe `.wgt` (`tools/input-probe/`, `src/svgProbe.ts` — the catalog `81ba8cbd` built from plan
v20x WO-1) ran its **SVG feature matrix**: every shipped feature through 3 warm and 12 measured
windows of *fetch → decode → draw → read-back* on the TV's own image stack, with the dynamic features
re-read after 500 ms to tell an animating SVG from a frozen one and the E3 chunk compared
byte-for-byte against its committed reference pixels. This is the **capability** answer the SVG
program owed: the Oct-30 bench A/B priced the *migration*; this session asks what the box can
actually draw.

## Session identity

| | |
|---|---|
| Session | `ip-mvsr61cj-cjko` — 83 payloads, `seq` 1..83 contiguous; 82 carry one distinct `env`, `seq 1` predates the env capture (the probe's first 3 s POST) |
| Hardware | Samsung M70AET (`model: M70AET`), firmware `M-KSU2SMWWC-2750.0`, Tizen 5.5, Chromium **69.0.3497.106**, viewport 1920×1080 @1, 4 cores |
| GL | WebGL 1 *and* 2 both live (Mali-G51, `MAX_TEXTURE_SIZE` 8192, ASTC/ETC/ETC1 compressed-texture extensions) |
| Realm | WASM ✓ · AudioWorklet ✓ · OffscreenCanvas ✓ · Gamepad API ✓ · native `globalThis` ✗ (the polyfill's reason) — audio 44,100 Hz, baseLatency 0.05 s |
| Keys | `getSupportedKeys()` 46, `registerKey` ok **45/45** — the probe registered the digit keys to test them (the games' bench registers its own seven since `b2e70185`) |
| Matrix | `svg matrix done` · **19 features (16 expected, 3 surprise)** · 247.0 s · warm 3 · measure 12 |
| Reports | 168 events, dropped 0 |

## The files

| File | What it holds |
|---|---|
| `ip-mvsr61cj-cjko.jsonl` | The probe session — 83 lines, one report every ~3 s (`{session, seq, sentAt, env, verdicts, stats, newEvents, droppedEvents}`), the SVG matrix outcomes inside the reports, the owner's key walk (arrows, OK, Back, digits, function keys) and a connected DualShock 4 in the event stream. |
| `analysis-features.txt` | The analyzer's summary report (no `--timeline`): environment, the `event.timeStamp` law, the key tables, gamepad, lifecycle (with the `svg … → PASS` finalize lines), frames, and the **`## SVG capability`** matrix table. 119 lines. |

### Regeneration

From `tools/input-probe/results/` at this repo state (`analyze.mjs` last changed at the matrix's own
commit `81ba8cbd`; `node scripts/game-code-hash.mjs` still computes `356cdf76a8` at the write-up's
tree):

| Command | Produces |
|---|---|
| `node analyze.mjs 2026-10-31-m7-bench-svg-features/ip-mvsr61cj-cjko.jsonl > 2026-10-31-m7-bench-svg-features/analysis-features.txt` | `analysis-features.txt` |

The committed file was regenerated fresh for this write-up and is **byte-identical on two consecutive
runs** (the idempotency gate). The bench capture of the same drop (`/tmp/opencode/bench-floor.txt`)
covers the sibling folder's artifact and matched byte-for-byte; there is **no delta to disclose** for
either. The prior folders' committed tables were not re-run or touched.

## Verdict — the SVG feature capability: the box is surprisingly capable

Every one of the **16 static features renders, and renders correctly**, on Chromium 69 — including
the filter stack the desktop research wrote off for old engines. Totals (median of 12 measured
windows, decode + draw):

| Feature | Total | Note (probe's own expectation, now measured against) |
|---|---|---|
| paths-static / grad-linear / text-glyph | 83.9 / 82.8 / 97.5 ms | the plain cases |
| grad-radial / mask-lum / clip-circle | 140.8 / 119.9 / 96.2 ms | the radial gradient and the luminance mask cost real *draw* time (31.1 / 22.5 ms of it) |
| use-symbol / text-path | 138.8 / 87.4 ms | `use` + `textPath` both real |
| blur σ2 / σ4 / **σ8** | 95.6 / 98.5 / **103.5 ms** | `feGaussianBlur` — bigger σ costs ~+8 ms total |
| drop-shadow / chain-tcc | 101.9 / 136.2 ms | filter chains land |
| turbulence oct1 / **oct4** | 149.7 / **214.4 ms** | `feTurbulence` fractalNoise — the most expensive static, and still ~0.2 s one-off |
| **e3-atlas** | **96.4 ms** | the **50,430 B** compound-path chunk (128², all 16,384 px inked) rastered **byte-exact** to its committed reference |

And the **three surprises** — the statuses the analyzer counts outside the expected set — all point
the same way, *toward more capability than the desktop claims for Cr69*:

- **`smil-animate` → ANIMATES** — the SMIL `<animate>` kept moving: the redraw 500 ms after first
  read differs (raster differs from first read at byte 98376). The probe's note expected
  `static mode = FROZEN`.
- **`css-keyframes` → ANIMATES** — a CSS keyframe animation inside an SVG image likewise moved
  (byte 240). Same frozen expectation, same contradiction.
- **`bitmap-svg` → ACCEPT** — `createImageBitmap` **accepted** the 256² SVG (probe note:
  "desktop rejects (whatwg #923)"); on this set it decoded to 256×256.

The matrix itself cost 247.0 s of TV time — one sit, the whole catalog; every per-window figure is in
the committed report.

## The cbmp correction — what Oct-30's bitmap rejection was, and was not

Oct-30's SVG-arm bench found `createImageBitmap` **rejected** its SVG source — *"The source image
could not be decoded"*, 0 of 8 reps — on the **1024×1024, 777-path** E3 page, and the write-up cited
it as the plumbing cost of the arm. The desktop claim behind that framing (WHATWG #923: Chromium 69
never accepts an SVG source for cbmp) turns out to be **over-quoted on this device in both
directions**: tonight the same engine accepts a simple SVG through cbmp outright (`bitmap-svg →
ACCEPT`). The rejection is **content-dependent** — a real behavior of the big multi-path pages, not
a universal SVG ban — which sharpens Oct-30's finding rather than softening it: the atlas-scale pages
are the ones the device's cbmp path chokes on, and small vector art travels fine.

## Keep the two SVG verdicts apart

This is the **capability** verdict, and it is good news. The **texture-migration** verdict — Oct-30's
**NOT-WORTH-it** ruling on moving the game's atlas to SVG — is a *different question* and it stands
untouched: the A/B there showed no per-frame effect either way and a **load-time bust** exactly where
zones pay (the noisy stand-in page: 7.7 MB of path text, 2,658 ms file→GPU — over R3-04's whole 2 s
budget alone). Nothing in tonight's matrix changes that accounting: fast, correct feature rendering on
a tiny canvas is not a cheaper atlas. Together the two sessions say the complete sentence: the TV's
SVG stack is **usable for future DOM-side vector UI experiments; it is not an atlas replacement**.
The atlas stays PNG-8.

## The digit keys — arrival proven through the registered path

The owner's key walk this session logged **every digit** (Keys seen: `1(49)` … `0(48)`, 9 down to 1
plus 0), and the bench-relevant two are clean human taps — `1` and `2` each show down 1 / up 1 /
non-press downs 0 and sit in the "real down/up" tap class (median tap 326 ms) — so keyCodes 49/50
arrive through `registerKey` on this set, exactly as `b2e70185`'s commit body predicted. The four
color keys (`ColorF0Red(403)` … `ColorF3Blue(406)`) each logged exactly one **release-only** event
(keydown+keyup <15 ms apart — the send-on-release class the M7 produces for keys the remote does not
really press), consistent with the no-color-keys remote the aliases exist for. The alias's **action**
is proved in the sibling folder: the full-suite bench run that this session followed was started by
pressing `2`. The queued follow-up (not this lane): the skip-ledger offer text still says
`GREEN full suite:` — `apps/tizen/src/bench/results.ts:574` — and should name the `2` alias.

## Re-confirmed housekeeping

The standing laws held again, for the record: `event.timeStamp` still advances in whole seconds
(handler − timeStamp: median 620.7 ms — never use it for timing); arrow auto-repeat median **204.4 ms**
with the first repeat ≈ 0.7 s after press and 0 flagged `repeat=true` events; release-only function
keys as ever; rAF median **17.0 ms** (58.7 Hz), p95 34.6, worst-since-reset 120.8; the DualShock 4
connected as `standard` (17 buttons, 4 axes, no reads needed for this session's goal).

## Not done here

- **A probe is not the game.** The matrix runs through the TV's SVG *image* stack in the probe's own
  `.wgt` realm — the same engine, different plumbing. The game ships Pixi textures from PNG-8 atlas
  pages; nothing changes in `packages/` on tonight's evidence (see the migration paragraph).
- **One matrix run, no repeats.** The **statuses are window-voted** (3 warm + 12 measured windows
  per feature) and categorical; the **millisecond figures are single-sample** — read them as
  directions under the floor the sibling folder just opened, not as floors of their own.
- **The catalog is 19 features**, the WO-1 set — deliberately not every SVG corner; `foreignObject`,
  nested SVG-in-SVG and mask-on-filter combinations are simply unmeasured.
- Owner's packaging and install of the probe `.wgt` are, as ever, outside this lane.
