# Tizen 5.5 / PixiJS optimization audit — graphics.md examined against shmup-cup (2026-10-27)

## 1. Scope and method

**Input.** `/home/sites/shmup-cup/graphics.md` — 219 lines of LLM-written "Tizen OS 5.5 graphics
performance" notes, with 19 cited URLs. Fifteen independent audit lanes each took one topic
(plus, for the big chapters, the exact lines) of the document and produced a section report:
repo grounding (every relevant file:line of the shipped stack, the committed M7 measurements,
the built bundle) and primary-source verification (every cited URL opened live, plus the
installed `pixi.js@8.22.0` source as the API truth). This report merges their substance; the
lane files under `/tmp/opencode/tizen-opt/` are ephemeral, so everything material is inlined
here. Nothing was changed in the game code by this audit — it is the examination plus a
prioritized action plan.

**The subject of the examination.** shmup-cup ships to Samsung Tizen 5.5 TVs (Chromium 69 —
the owner's M7 `LS43AM702UNXZA` monitors), LG webOS 5 (Chromium 68), browser and Electron.
PixiJS v8 (catalog `^8.20.1`, installed **8.22.0**) WebGL1-first, drawing the game into a
640×360 internal render texture, presented through an integer-scaled (or CRT-shader) blit onto
a backbuffer capped at 1280×720 on a TV. The simulation is a fixed 60 Hz deterministic tick
with golden replays; every per-tick/per-frame path is zero-allocation by law. So the document's
claims were graded against a stack that already made most of its "recommendations" years ago —
usually at a level of care the document does not reach.

**Method per lane.** (1) quote the claim; (2) open every citation and grade the attribution;
(3) verify against installed Pixi 8.22 source (the library, not blog folklore); (4) inventory
what the repo already does, file:line; (5) decide — ADOPT / ALREADY-DONE / TRIAL-AND-MEASURE /
SKIP-NOT-APPLICABLE / REJECT-CLAIM-WRONG / N-A-BY-ARCHITECTURE — with cost and measured impact.
Where the doc is wrong, the failure mode is recorded, because the wrongness is itself a finding
about the source.

---

## 2. Executive summary

**(a) The one big win: `createImageBitmap` in the atlas page loader — the only unnamed
half of graphics.md line 15, and the only recommendation in the whole document that we do
not already exceed.** The named API (`ImageBitmapRenderingContext`) is the wrong tool for a
WebGL-direct renderer — but the implied one (`createImageBitmap` → `texImage2D`) was measured
on the owner's M7, in the committed render-bench decode scenario built precisely to settle it
(`tools/input-probe/results/2026-10-19-m7-bench/`, 8 reps, 3 sessions, Chromium 69.0.3497.128):
file→GPU per page falls **−47% … −56%** (the small page −90%), because
`texImage2D(HTMLImageElement)` **re-decodes on upload** (~389 ms) where an `ImageBitmap` upload
costs ~50 ms. Cold zone load **1493 → ≈ 790 ms**; R6-02.P3's final-art transitions
**1.48–1.59 s of the 2 s cap → ≈ 0.8–0.9 s**; headroom **~25% → ~60%**. Adoption is one loader
function plus a pixel-identity gate and `close()` on residency unload — the atlas type already
accepts `ImageBitmap` (`packages/render-pixi/src/atlas/index.ts:147-148`).

**(b) Tiny adopts, real value:** the four web color-key names `ColorF0Red`/`ColorF1Green`/
`ColorF2Yellow`/`ColorF3Blue` added to the `tizen-remote-safe` register list (one content
line — today the live boot path registers Guide/Extra but *not* the colors, which the fallback
list carries, so the doc's mislabeled color-button tip has a genuine kernel); an
`isContextLost()` watchdog (~15–25 lines + 1 e2e spec) for the one TV failure class we cannot
recover today — a context loss that never fires `webglcontextrestored` currently means an
infinite black screen with a live sim and audio behind it; a 2-line `displayWidth/Height ≥ 1`
floor at renderer init; and `eventFeatures` all-off to silence Pixi's EventSystem (idle
listeners on TV, a per-`pointermove` `getBoundingClientRect` on desktop hosts).

**(c) The sobering majority: nearly everything in the document is already done, better.**
Every init flag it asks for is set (or is a v8 default we override explicitly anyway); the
text pipeline is a strict superset of "use BitmapText" (the shipped bundle contains **zero**
Pixi text modules); the batching discipline is implemented at v8's *real* break rules, not the
doc's v4 folklore; the input model already decouples event from loop with a bitmask superset of
the doc's boolean map; remote-key registration is more careful than the doc's one-liner; VRAM
residency, layout-query hygiene, and DOM rules are satisfied by architecture (one canvas, zero
framework, zero per-frame DOM); and Pixi's culling is correctly **off** — for our CPU-bound,
sim-culls-at-source regime, Pixi's own docs say enabling it would *degrade* us.

**(d) The document is unreliable at the level of its sources.** All three named native engines
(Dali, the Lottie viewer, EFL/Evas) are unreachable from a Tizen **web** app — the TV's
third-party surface is Web (.wgt) and .NET, and all three live on the native side (EFL itself
deprecated since Tizen 10.0). And the audit caught outright fabrications: the TO THE NEW article
it cites for most of the Pixi/WebGL flags contains **zero** Pixi/WebGL/Tizen-5.5 content (its
DOM advice, by contrast, is faithfully condensed); `stackoverflow.com/questions/71515879` —
cited for "Tizen WebGL drops draw buffers / black screens" — is a **Tizen Emulator driver bug**
whose own asker reports `gl.viewport()` "didn't work"; `pixijs/pixi.js` issue 5143 is a stale
v4 / Tizen-4.0 (2018) canvas-corruption report; the `XF86*` key names are .NET/Ecore names that
`tvinputdevice.registerKey` would reject with `InvalidValuesError`; the "15–30 events/s" remote
burst is measured **≈ 9.3 Hz** on the actual M7; "single-core CPU" is wrong (Kant-SU2, 4 cores,
measured); "4K/8K viewports" and "runtime texture thrashing" are display-server / DOM-compositor
talk that a one-canvas WebGL app cannot experience; and WebGL2 on this hardware is measured and
**rejected** (P4d NOT NEEDED, decision W5-20) — its only win lives in the 1080p-fill mode the
shipped `Auto` output cap keeps TVs out of.

---

## 3. Verdict matrix

One row per graphics.md topic. Lanes: the `/tmp/opencode/tizen-opt/NN-*.md` file that graded it.

| Topic | Doc line(s) | Verdict | Why (one line) | Cost | Expected impact | Lane |
|---|---|---|---|---|---|---|
| Dali 3D Engine (native C++) | 4–6 | REJECT-CLAIM-WRONG | Not on the TV's developer surface; unreachable from .wgt by any route; own cited blog never mentions it | — | — | 01 |
| "WebGL API (Canvas 3D)" bullet | 7 | split | "Tizen 5.5 = Chromium M69" confirmed; "M69 unlocks advanced WebGL" + "hardware-accelerated 2D canvas" wrong | 0 | 0 | 04 |
| Lottie Animation Viewer | 8 | REJECT-CLAIM-WRONG | Native EFL/.NET viewer; no web API; the web substitute *is* the JS loop it promises to bypass | — | — | 02 |
| Evas & Elementary (EFL) | 9 | N-A-BY-ARCHITECTURE | No JS binding on TV; EFL deprecated since Tizen 10.0; praised mechanics are Chromium's job anyway | — | — | 03 |
| 4K/8K viewports | 13 | REJECT-CLAIM-WRONG | Native display-server fact; web apps render at 1920×1080 max — measured 1080p@1 on our 4K M7 | — | — | 07 |
| "Prioritize vector animations" | 14 | REJECT-CLAIM-WRONG (inverted) | Trades our slack VRAM (~9–10 MiB resident atlas) for our scarce TV CPU; Samsung itself reversed (Watch Face Studio → WebP) | — | — | 02 |
| Leverage ImageBitmap | 15 | **ADOPT** (createImageBitmap half) | Measured on the M7: −47…−56% file→GPU per atlas page; named API (bitmaprenderer) itself N/A | 1 loader fn + gates | zone load 1493→≈790 ms | 06 |
| Hardware landscape (single-core, VRAM thrash, 15–30/s) | 18–25 | REJECT-CLAIM-WRONG ×2 / N/A ×1 | 4 cores measured; ~9.3 Hz measured; texture thrash is DOM-layer talk | 0 | 0 | 04,07,08 |
| antialias: false | 30, 60 | ALREADY-DONE | `renderer/index.ts:781`; v8 default falsy anyway (`GlContextSystem.mjs:66`) | 0 | 0 | 05 |
| backgroundAlpha: 1 / opaque | 31, 61 | ALREADY-DONE | Opaque `background: 0x05070f` (:785) ⇒ context `alpha:false` (`GlContextSystem.mjs:65`); "immense overhead" magnitude is folklore | 0 | 0 | 05 |
| Pre-size gl.viewport | 32 | REJECT-CLAIM-WRONG | Cited thread = emulator driver bug; Pixi re-derives viewport per render-target bind; real residual is a 2-line ≥1 size floor (ADOPT) | 2 lines | removes a theoretical black-canvas | 04,05 |
| Bypass framework state (React/Vue) | 37 | N-A-BY-ARCHITECTURE | Zero framework deps (full manifest scan: only runtime third-party dep shipped is pixi.js); revision counters instead | — | — | 14 |
| CSS containment / will-change | 38 | N-A-BY-ARCHITECTURE | One static canvas, zero composite layers; doc says *avoid* blanket will-change (brief misquoted it); applying either to us = added VRAM | — | — | 14 |
| Unified selection box (translate3d) | 39 | ALREADY-DONE | One focus-cursor string command (`core/ui`), one static canvas transform; "single box moved" is literally the design | — | — | 14 |
| Avoid dynamic layout inquiries | 43 | ALREADY-DONE | 0 first-party `getBoundingClientRect/offset*/client*/scroll*/getComputedStyle`; boot-cache + resize-recache is the doc's own prescription; Pixi EventSystem residual closed by eventFeatures (ADOPT, 1 line) | 1 line | hygiene (desktop hosts) | 15,14 |
| Batch by material type | 44 | REJECT-CLAIM-WRONG (v8) | Node type is not a batch-break axis in 8.22; the real axes are blend/topology/source-cap/pipe breaks | 0 | 0 | 12 |
| "WebGL2 effectively" + single-core | 46 | REJECT-CLAIM-WRONG | Cited source has zero WebGL content; WebGL2 measured no-upside at shipped output; 4 cores | 0 | — | 04 |
| Init boilerplate (flags) | 49–67 | ALREADY-DONE (better) | Every flag set or defaulted right, plus `resolution:1/autoDensity:false/roundPixels:true` the doc omits; 1920×1080 + Application+ticker idiom REJECTED by design | 0 | 0 | 05,04 |
| Pixi v8 core culling | 69–73 | ALREADY-DONE (correctly OFF) + optional spike | Not "automated" — triple opt-in; plugin unregistered; full 6,400-node walk (1–4 ms priced) to save ≤0.1 ms of batch pushes; Pixi's docs: CPU-bound ⇒ degrades | spike 0.5d (optional) | expected ≤ 0, likely negative | 10 |
| Avoid raw Text | 77 | ALREADY-DONE (superset) | Zero Pixi Text/BitmapText in shipped bundle (grep-proved); DrawList slots + `number` command allocate nothing | 0 | 0 | 11 |
| GraphicsGeometry reuse | 78 | REJECT-CLAIM-WRONG (v7 names) | `GraphicsGeometry` deleted in v8 (0 hits in 8.22 lib); we have exactly 2 long-lived Graphics, both built-once calibration art | 0 | 0 | 13 |
| cacheAsBitmap static caching | 79 | REJECT-CLAIM-WRONG (names/semantics) | Deprecated alias whose setter warns; v8 `cacheAsTexture` is manual-snapshot; revision-skipped quad pool already strictly better; adoption proven net-negative | 0 | 0 | 13 |
| Draw-call batch splitting (84 arithmetic) | 81–85 | L84 REJECT / L85 ALREADY-DONE | Sprite↔Graphic = 1 call, not 4, in 8.22; blend IS a real break and we fix blends at creation with additive runs at layer tails | 0 | 0 | 12 |
| BitmapText walkthrough | 87–138 | ALREADY-DONE as intent / REJECT as written | Per-tick `scoreLabel.text = \`…\`` allocates string + graphemes + layout + geometry rebuild — a regression against our zero-alloc law | 0 | — | 11 |
| Input-buffer walkthrough | 140–183 | ALREADY-DONE (superset) / deltaTime REJECT | Bitmask + latched edges + fixed-step accumulator; `speed = 5 * ticker.deltaTime` would break every golden replay; blanket preventDefault is worse than ours | 0 | 0 | 08 |
| Core nav keys + Back | 189–199 | ALREADY-DONE + name fix | Auto set also includes Back (name `Back`, not "Return", 10009); our Back/Exit lifecycle is the maximal handling — long-press `Exit` is uncapturable in a web app | 0 | 0 | 09,08 |
| Extended keys, XF86 colors | 202–215 | names REJECT-CLAIM-WRONG / delta ADOPT | `registerKey('XF86Red')` throws (Ecore/.NET names); web = `ColorF0Red`…403–406; add the four to the live register list (1 content line) | 1 line | colors deliverable → rebindable, webOS parity | 09 |
| Media/color code list | 217–219 | REJECT-CLAIM-WRONG (half wrong) | 10252 = `MediaPlayPause` (the single real button, already Pause); `MediaPause`=19 not 10251 (nonexistent); `MediaPlay`=415; Rewind 412 / FF 417 correct | 0 | — | 09 |

---

## 4. Bullet trace — every line of graphics.md mapped

No orphan bullets. "Walkthrough" = a code block with surrounding prose.

| Doc lines | Content | Covering lane(s) | Disposition in this report |
|---|---|---|---|
| 1–2 | Preamble: "leverage native multi-threading frameworks"; Tizen 5.5 = 2020 TVs **and Galaxy Watch 3** | 01, 03 | Two-OS conflation (TV 5.5 vs wearable 5.5) called out; native frameworks unreachable (§6.1, §6.3) |
| 4–6 | Header + Dali bullet (uncited) | 01 | §6.1 — REJECT-CLAIM-WRONG |
| 7 | WebGL bullet | 04 | §6.4 — M69 confirmed, "advanced capabilities" fabricated |
| 8 | Lottie viewer bullet | 02 | §6.2 — native-side, unreachable |
| 9 | EFL bullet (uncited) | 03 | §6.3 — N/A, deprecated |
| 11 | Header (best practices) | 02,06,07 | — |
| 13 | 4K/8K resolution | 07 | §6.4/§7 — web apps capped at 1080p, measured |
| 14 | Vector > sprite sheets | 02 | §6.2 — inverted for web apps |
| 15 | ImageBitmap | 06 | §7.6 — THE adopt; named API wrong half, implied API measured win |
| 17–18 | Blueprint intro (tothenew cited) | 04 | attribution graded in §10 |
| 20–25 | Hardware landscape: single-core (23), VRAM thrashing (24), 15–30/s bursts (25) | 04, 07, 08 | each measured-and-corrected: 4 cores; DOM-layer talk; ≈9.3 Hz |
| 27–32 | Canvas/engine tweaks: antialias (30), opaque bg (31), gl.viewport (32) | 05, 04 | §7.1 flag table — MATCH ×2, REJECT ×1 (+O2 clamp ADOPT) |
| 34–39 | DOM architecture rules: framework state (37), containment (38), selection box (39) | 14 | §8.5 — N/A-by-architecture ×2, ALREADY-DONE ×1; brief's (b) inversion corrected |
| 41–44 | Asset/cache tactics: layout inquiries (43), batch by material (44) | 15, 14, 12 | §8.4 ALREADY-DONE; §7.4 REJECT (v8 rules) |
| 45–48 | Pixi v8 intro: WebGL2 "effectively", single-core, GC (46) | 04 | §6.4 — fabricated attribution; GC half confirmed |
| 49–67 | Init boilerplate + code block | 05, 04 | §7.1 — flags all MATCH/BETTER; 1920×1080/Application/appendChild idiom rejected by design |
| 69–73 | Native v8 culling: cullable (72), cullableChildren (73) | 10 | §7.3 — mechanism half-true, automation false, correctly OFF |
| 75–79 | Text (77), GraphicsGeometry (78), cacheAsBitmap (79) | 11, 13 | §7.5 superset proof; §7.7 both v7 names — REJECT |
| 81–85 | Batch splitting: type arithmetic (84), blend modes (85) | 12 | §7.4 — 84 WRONG-vs-source, 85 direction-correct and already enforced |
| 87–138 | BitmapText walkthrough (import hook, Assets .fnt, per-tick score) | 11 | §7.5 — per-tick idiom allocates; ours doesn't |
| 140–183 | Input buffer walkthrough (boolean map, preventDefault, deltaTime motion, Enter-clear) | 08 | §8.1 — every element already shipped in stronger form; deltaTime REJECT for sim |
| 185–219 | Remote keys walkthrough (auto-nav table, privilege XML, registerKeyBatch XF86 list, SO 68087616, code list) | 09 | §8.2 — mechanism right, nearly every key fact wrong or mislabeled; corrected table |

---

## 5. What the platform actually is (the ground the lanes stood on)

| Fact | Value | Evidence |
|---|---|---|
| 2020 Samsung TV engine | Tizen 5.5 = Chromium **M69** | Samsung web-engine-specifications Table 1; measured UA `69.0.3497.106/5.5` (`docs/dev/input-probe-results.md` §9) |
| webOS 5 engine | Chromium **68** — the real shipped floor | `docs/dev/conventions.md` §Two TVs; `test/integration/tv-engine-floor.test.ts` |
| M7 SoC | Kant-SU2, **4 cores**, Mali-G51, WebGL 1 **and** 2, `MAX_TEXTURE_SIZE` 8192 | `docs/old/shmup_tech.md:114-115`; probe §9 |
| M7 app viewport | **1920×1080 @ dpr 1** even on the physically-4K panel | `tools/input-probe/results/2026-09-15-m7/analysis-10.0.0.224.txt` |
| App memory ceiling | < 100 MB budget in code; 120 MB dev-install cap (Tizen) | `packages/shell/src/memory/index.ts:144`; `shmup_tech.md` §2.5 |
| Delivered frame rate (shipped game, v1-era probe) | **59.05 fps over 388 s**; 27–32% of frame deltas > 20 ms (rAF/vsync jitter, not GPU) | `docs/dev/input-probe-results.md:126`, §8 |
| Busy render p95 at 640×360 | 13.6–14.3 ms of the 16.7 ms budget; heaviest rows 42–65% two-tick | `tools/input-probe/results/2026-10-19-m7-bench/README.md` |
| TV cost model | "a desktop core makes the tree walk cheap and charges for the extra draw calls; the Cortex-A55/Mali-G51 pays the opposite way round" | `docs/dev/input-probe-results.md:250` |

---

## 6. Library / engine deep-dives

### 6.1 Dali (graphics.md lines 4–6) — what was claimed, what is true, why it cannot reach us

**Claimed:** "highest-performing framework … built directly into the Tizen native subsystem …
smooth 60fps UI animations even on wearable constraints" — for the developer of *Tizen 5.5*, whom
the document is addressing as a web-app/pixi reader.

**True:** DALi ("Dynamic Animation and Rendering Library") is a real C++ scene-graph engine
(`dalihub`, 46 repos, Samsung-Gerrit-driven; `dali-toolkit` v2.5.45, last push 2026-10-23, 0–21
stars — no community). It renders through OpenGL ES 2.0/3.0 against EGL with no DOM and no JS
engine in its loop. It genuinely was part of *open-source* Tizen's native UI stack (mobile/
wearable profiles).

**False as advice:** (1) The TV's entire third-party developer surface is **Web (.wgt) + .NET
(Xamarin.Forms/TizenFX — which itself renders into web views) + Web App Extensions
(WASM/NaCl/TOAST/CAPH)**; there is no native C++ track on the Samsung TV portal. (2) Dali has no
JavaScript/Web API wrapper; WASM in a TV web app can reach the GPU *only through WebGL* — no EGL,
no native surface embedding, no plugin path. (3) The one technical exception, `dalihub/dali-web`
(created 2026-10-22, days before this audit), builds with **mock graphics only** — no Canvas/GLES
implementation — and even completed it would be WASM-over-WebGL inside the same Chromium 69 WRT:
"PixiJS, minus five years of WebGL batching maturity," on an MVP-only Chrome-69 WASM. (4) The
profiles that have Dali retired it: Tizen Studio 2.0 dropped the Dali template at 4.0; the Galaxy
Watch 3 (the doc's own device example, a *different* "Tizen 5.5" — the wearable line) ran .NET
CircularUI, not Dali. (5) The blog line 1 cites beside it — the real 5.5 Public M1 release notes —
**never mentions Dali**. (6) No Dali-vs-WebGL benchmark exists; the "highest-performing" phrasing
mirrors Dali's own marketing. And line 6 is the document's only uncited performance bullet.

**The web-side equivalent we already run:** every Dali trait maps — native GLES scene graph →
Pixi v8 batched WebGL1 over a 640×360 RT; actor culling/dirty regions → render groups + sim-side
cull; shader effects → GLSL ES 1.0 filters (`mode7.ts`, `crt.ts`, `shaders.ts`); 60fps animation
core → fixed-step loop at measured 59.05 fps on this hardware; native actors → pooled quads. The
one non-match is multithreaded rendering (§7.6 rejects worker decode; OffscreenCanvas at Chrome 69
is the honest but unquantified experiment, documented and unscheduled). "Switching to Dali" would
be a full C++ rewrite of 102,776 source lines, strand four shipping apps, break the determinism/
replay/save kit, and produce an app that could not be deployed or store-listed on a 2020 Samsung
TV at all. Category error; verdict REJECT-CLAIM-WRONG.

### 6.2 Lottie (graphics.md lines 8, 14) — the viewer is real; it lives behind a wall we cannot cross

**Claimed:** viewer "introduced natively in Tizen 5.5", "incredibly high performance … bypassing
heavy JavaScript translation loops"; and "favor Lottie over heavy raw sprite sheets to preserve
system memory".

**True:** the Tizen 5.5 Public M1 blog really says "Lottie animation viewer has been added" — and
that is a *platform* item, with no app-type qualifier. Where it lives: EFL/Elementary
`elm_animation_view` (Samsung's own TizenSchool tutorial: "You can play Lottie animation using
**Native APIs**"), `lottie-player-0.0.1.aarch64.rpm` in the Tizen 5.5 repos, `ElottieSharp` for
Tizen .NET — all C/C++/.NET, rasterizing through Samsung's **rlottie** (now deprecated and
archived). Samsung's own SDC-era blog states flatly: "Samsung Smart TV, are not yet compatible."
The TV web-engine spec table — the canonical feature list for a .wgt — has **no Lottie row** in
any table, and the web-app extension list does not contain it. There is nothing to call from JS.

**False as applied to us:** the web substitute is **lottie-web (bodymovin)** — which *is* the
heavy JavaScript translation loop the bullet promises to bypass: per-frame property interpolation
+ per-frame SVG/canvas vector rasterization, on the main thread, on its **own second rAF ticker**
(next to `shell/frame-loop`, the single rAF driver by design), inside a DOM container beside the
canvas. Measured direction, independent of vendor claims: Callstack's Jan-2023 comparison on a
2014-class Xperia Z3: **Lottie ≈ 17 FPS** (the alternative ≈ 60); lottie-web issues file Pi-class
freeze (#1641) and a `destroy()` memory-leak cluster (#1159/#1933/#2070/#2863) — the failure mode
a 100 MB TV budget cannot tolerate over a long session. The "preserve memory" advice is **inverted
for us**: what Lottie would free is at most ~9–10 MiB of per-zone atlas pages against a 100 MiB
budget (we are not texture-constrained — the scarce resource is the one the document itself names
at its line 23, the CPU), and what it would cost is per-frame main-thread rasterization on a busy
scene already at 13.6–14.3 ms of 16.7 ms, plus player bytes: measured from unpkg 2026-10-27,
`lottie_svg.min.js` 242,630 B raw / **62,683 B gzip** (`canvas` 68,070 gz, `light` 46,673 gz,
full 76,582 gz) against a shipped release bundle of 1,566,776 B raw / **414,459 B gzip** under
`APP_JS_GZIP_BUDGET` = 512 KiB — i.e. **~65% of the entire remaining launch-size headroom** for
zero shipped pixels. (Bootability was checked, for completeness: lottie-web's dists are ES5-era
UMD, no `matchAll`/`flat`/`.at`, its lone `globalThis` inside a typeof guard — yes, it would run;
the yes is pyrrhic.) Art direction independently forecloses it: the v2 art bible mandates hard
silhouettes and binary alpha (`docs/dev/art-bible-v2.md:104,303`) — anti-aliased vector per-frame
rendering is off-model by construction. And Samsung itself reversed the advice in its own TV-class
productization: Watch Face Studio dropped Lottie for baked **WebP** frames.

Verdict: REJECT-CLAIM-WRONG / SKIP — no adoption, no trial spend. If the owner ever insisted, the
protocol is one `lottie-*` row in the 18-scenario `bench:tv` matrix, killed on any ≥ +5-pt
two-tick delta (≈ 1 engineer-day, not recommended).

### 6.3 EFL / Evas / Elementary (graphics.md line 9)

**Claimed:** "the foundational rendering canvas for standard Tizen native application visuals …
scene-graph trees optimized for CPU/GPU hybrid rendering to limit redraw regions" — placed among
"Top-Performing Graphics Engines in Tizen 5.5" as if it were an engine a developer here could
pick. (The bullet carries no citation; the blog it neighbors has zero EFL text.)

**True:** the description of Evas is accurate (Samsung's own Tizen Studio training: "EVAS is
Canvas and Rendering Engine … Rendering based on Scene Graphic … Partial rendering: only updated
part be rendered"), and EFL *is* the Tizen native UI on mobile/wearable/iot-headed profiles.

**False as placement:** EFL was never a Samsung TV *third-party* surface (the TV docs taxonomy is
Web + .NET — no "Native Applications" section exists). WebAssembly, the sanctioned native-code
extension "from Tizen 5.5 onwards", still renders into the web engine's canvas — WASM-in-Emscripten
replacing Pixi would be strictly worse for a TypeScript codebase. The deep irony, recorded for
honesty's sake: the Tizen web engine is *historically* EFL-flavored (WebKit/EFL → Chromium-efl
since Tizen 3.0; TizenFX's WebView wraps EWebKit) — but that EFL layer is the **host shell**
compositing Chromium's surface, not a per-frame lever an app can address; Blink's own compositor
does the damage-limited work at the page level, and inside a full-refresh WebGL canvas "partial
rendering" does not apply — our render-group/revision discipline is the real analogue, and it
exists and is instrumented (`countGroupRebuilds`, `structureRebuilds`). Platform-wide, the model
is being deleted: "ALL EFL APIs have been deprecated since Tizen 10.0 and will be removed after
two releases without any alternatives" (live official guide, retrieved 2026-10-27). Verdict:
SKIP-NOT-APPLICABLE.

### 6.4 "WebGL itself" — the M69 claims, the emulator bug, and WebGL2 measured

**L7** ("upgraded Web Engine running on Chromium M69, which unlocks advanced WebGL capabilities
and hardware-accelerated 2D canvas"): the M69 row is real; the unlocks are not. Samsung's Graphics
table carries exactly one un-versioned "WebGL API (Canvas 3D) — Yes"; WebGL2 shipped with Chrome
56 — already Samsung's *2018/Tizen-4.0* row — so M69 "unlocked" nothing WebGL-shaped. GPU-backed
2D canvas is a 2012-era feature that Chromium disabled by default and re-tuned heuristically for
years ("maybe GPU; read-back paths force CPU") — not an M69 capability, and irrelevant here
because the game has no canvas-2D in its render path at all. The usable replacement fact is our
own probe's: WebGL 1 **and 2** (OpenGL ES 3.0), Mali-G51, 4 cores.

**L32** (`gl.viewport` on load or black screens, cited to SO 71515879): read in full, the thread
is an **emulator driver bug** — the reporter's canvas had explicit width/height and a correctly
set viewport, he states "`gl.viewport(0,0,1900,900)` … didn't work", and the sole answer (Samsung's
Tizen Emulator team) closes it: "caused by driver issue in Tizen Emulator … fixed … public image
in Tizen 7.0 Emulator release." Generalized into "Tizen WebGL targets occasionally drop draw
buffers", the claim is a fabrication; under Pixi it is also a no-op — `GlRenderTargetAdaptor`
issues a cached `gl.viewport` on **every render-target bind** and forgets the cache on context
restore; hand-set boot state would be overwritten and would mask a real sizing bug. The genuine
sizing risk is the 300×150 default drawing buffer — handled here before the first draw by Pixi's
`CanvasSource.resize()` from our capped boot size (`renderer/index.ts:776-778` → `ViewSystem` →
`CanvasSource.mjs:8-38`), with the honest residual being the 0×0-at-boot window (2-line floor,
P0-4).

**L46** ("this engine handles modern WebGL2 effectively"): the cited TO THE NEW post contains
zero WebGL content (see §10), and our own paired A/B on the real panel says: obtainable, **not
adopted** — the 172-scenario sweep measures no verdict at the shipped 1280×720 `Auto` output
(6 better / 0 worse / 144 within; the two metrics disagree beyond noise), within-noise at 960×540,
and a 1080p-fill-only win (21/0/151 — almost entirely native-art rows) at the mode R6-04's `Auto`
cap keeps TVs out of; the corpus noise floor is 3.9 pts median run-to-run, and the first "GL2
clearly better" reading was **retracted** as a pessimistic-run artifact (`docs/dev/input-probe-
results.md` §12.2–12.3). Disposition P4d NOT NEEDED (owner decision W5-20, `plan_resolution.md:156`).
The shipped policy is a `WEBGL2_MIN_CHROMIUM = 71` auto-floor (above both TVs), a live probe, and
a player-facing `GRAPHICS → RENDERER` escape row. Meanwhile the WebGL-shaped hazard that actually
bit the product was never in the document: Pixi 8.22's shader-sampler parse calls `String.prototype.
matchAll` (Chrome 73 — on neither TV) twice in renderer init; the 2026-10-20 dependency bump
silently broke the TV boot, now backed by `apps/tizen/polyfills/string-match-all.js` prepended in
both TV builds (`docs/dev/conventions.md` §Two TVs — with the standing rule to re-grep the built
bundle after any dependency bump).

---

## 7. Pixi renderer chapter

### 7.1 Init flags — every doc recommendation vs our value

Single init in shipped code: `createPixiRenderer` builds a bare `new WebGLRenderer()` — **no
Application, no ticker** (the host's fixed-step loop drives `render()`; `renderer/index.ts:1-12`
— adopting the doc's Application idiom would be a regression against the determinism contract).
All hosts and the TV bench go through this one block (`renderer/index.ts:768-787`).

| Option | doc (L30-63) | ours | verdict |
|---|---|---|---|
| `antialias` | `false` | `false` — `renderer/index.ts:781` (and false-filtered out of the context attributes, `GlContextSystem.mjs:66`; `useBackBuffer` false at `:135-138` is "a reason *not* to enable antialias", review F11) | **MATCH** (also v8 default) |
| `backgroundAlpha` | `1` | not set → v8 default IS 1 (`BackgroundSystem.mjs:66-76`); the opaque *context* comes from `background` below (`GlContextSystem.mjs:65`: `alpha = background.alpha < 1` → false) | **MATCH-BY-DEFAULT, stronger** |
| `background` | — | `PALETTE.letterbox` `0x05070f` — `:785`, `palette/index.ts:47`; page backdrop same solid (`apps/tizen/index.html:14`) | **BETTER-THAN-DOC** (drives the alpha derivation + clear color) |
| `powerPreference` | `'high-performance'` | same — `:784` (no-op on a single-GPU TV SoC, useful on desktop) | **MATCH** |
| `hello` | `false` | `false` — `:786` (already 8.22 default, `HelloSystem.mjs:35-38`; the doc's "speeds up initial parsing" is nonsense — it is one console.log) | **MATCH** (reason wrong) |
| `width/height` | 1920×1080 | display size capped — on a TV, `auto` resolves to **1280×720** backbuffer (`bootDisplayFromSaveText` `shell/src/boot/index.ts:659-664`, `capDisplaySize` `:576-584`) | **BETTER-THAN-DOC** (§7.2 economics) |
| `resolution` / `autoDensity` / `roundPixels` | — | `1` / `false` / `true` — `:779-782`; TV DPR measured 1; CSS owned by `index.html` | **BETTER-THAN-DOC** (the three the doc omits) |
| `preferWebGLVersion` | (implied WebGL2) | `options.preferWebGLVersion ?? 1` — `:783`, boot-resolved with the ≥71 floor | **BETTER-THAN-DOC** (measured, §6.4) |
| `canvas` | `appendChild(app.canvas)` | pre-declared `<canvas id="game">` (`apps/tizen/index.html:25`) passed in (`:776`) | equivalent, simpler |
| `preference` (engine) | implied auto-detect | N/A — construct `WebGLRenderer` directly (`:773`): no WebGPU/canvas probe cost, engine pinned by construction | **KEEP (good news)** |
| `useBackBuffer` / `preserveDrawingBuffer` / `clearBeforeRender` / `premultipliedAlpha` | — | defaults: false / false / true / true (`GlBackBufferSystem.mjs:135-138`, `GlContextSystem.mjs:66-77`) | **KEEP** |
| `stencil` / `depth` | — | not settable off in v8 (`stencil: true` hard-coded, `GlContextSystem.mjs:72`); cost already inside the memory estimator | **SKIP (impossible)** |
| `eventFeatures` | — | unset → EventSystem attaches passive pointer listeners at init (`EventSystem.mjs:86-93`) | **ADOPT: all-off** (P0-5; §8.4) |
| `accessibilityOptions` / `gcActive` / texture-GC | — | accessibility dormant by default (`AccessibilitySystem.mjs:552-557`); GC runner stays on and complements our own page residency (plain Sprites are not GC-managed; atlas pages are explicitly retired by the residency, `renderer/index.ts:471-477`) | **KEEP defaults** |
| Application/ticker/`deltaTime` idiom | L57-64, L170 | rejected by design — the shell's `frame-loop` owns pacing | **KEEP** (see §8.1) |

### 7.2 The alpha/compositor story and the fill-rate economics

The doc's "Forcing the TV engine to calculate alpha transparency blending over the underlying
Tizen system layer creates immense rendering overhead": the mechanism is real (an alpha canvas
composites against the page) but the magnitude is folklore and the "Tizen system layer" framing is
wrong — the blend is canvas-vs-page, and we eliminate it with the derived `alpha: false` surface;
the page behind our single canvas is a solid `#05070f`. One opaque composited layer per frame;
no scrolling DOM to blend over. There is **no** renderer-level `alpha` init option in v8 — the
derivation *is* the design; do not add one (also: Pixi's live tips page still names the dead v7
option `useContextAlpha:false` — graphics.md laundering stale docs by proxy).

Fill-rate, the number the doc's 1920×1080 init would pay: our two-pass design shades the whole
scene (every sprite, parallax, Mode-7, raster effects, flash overlays) at **230,400 px** into the
640×360 RT (`renderer/index.ts:800-806`, nearest, AA-off), then presents it through the **CRT blit
mesh** — one quad over 921,600 px at the capped 720 backbuffer, and since M3-02d the CRT shader
*is* the pass-2 program, so the CRT costs no extra pass. The doc's direct-1080p approach shades
the scene at 2,073,600 px: **9× cost per unit of overdraw** on every overlay/filter pass; at
overdraw ≈ 2 ours is ~3× cheaper in total fragments. This is not theory — it is the sweep:
640×360 `worst` two-tick misses read **59.5% at 1080p output → 11.3% at 720p → 1.8% at 540p**
(`docs/dev/input-probe-results.md` §12.4; owner directive W5-20). Native-art rows drawn ≥ 1280×720
are "38–100% two-tick share" dead; `1920x1080n-busy` measured 99.6%. The doc's boilerplate,
adopted literally, lands the product exactly on the sweep's worst row. Letterbox is the canvas
clear; `image-rendering: pixelated` covers the compositor's final scale; the user's `OUTPUT` row
(1080/720/540) can trade it back per the integer-×3 path.

### 7.3 Culling: correctly OFF, with the numbers

graphics.md: "automated rendering culling directly into its core … set `container.cullable =
true`". In 8.22: `cullingMixin.js` defaults `cullable:false`; **`CullerPlugin` is never
auto-registered** (zero registrations in `lib/`; Pixi's own docs say add it yourself or call
`Culler.shared.cull` manually); and the walk descends the **entire tree from stage every frame**
regardless. `culled` is bit 4 of `localDisplayStatus` whose setter is a line-for-line copy of the
`visible` setter — so a culled leaf saves exactly what `visible=false` already saves, and pays
exactly what a `visible` toggle pays (a render-group instruction rebuild). There is no third path.

Our regime makes it worse-in-total: ~**6,400** display objects at depth 4–5 (terrain ring 1,274 +
512 bullets + 512 points + 256 particles + 512 bending segments + 2×1,024 glyph pools + rest),
review-priced tree-walk at **1–4 ms on this class of CPU** — to skip a bounded off-frame band the
sim already caps (cull margins: bullets/shots 24 px, items 48, seen-enemies 48 / never-seen 192;
decor ±512 px — the one wide band, ≤176 items at zone-h). Best-case saving ≈ 100–250 quad pushes
(~0.05–0.1 ms) against a 0.3–1 ms walk: net loss **before** flags. The doc's own second citation
(richardfu.net) ends, verbatim: "sticking with manual masking combined with setting `.visible =
false` … remains the most straightforward and performant approach" — and its `cullArea` is-local-
space correction (the article's global-coordinates claim is wrong in 8.22; the source applies
`worldTransform`) matters only if anyone ever wires it. Pixi's official tips page states the split
verdict graphics.md omits: culling is disabled by default; "If you are GPU-bound it will improve
performance; if you are **CPU-bound it will degrade performance**." We are CPU-bound (the whole
F1/M3-02e effort is a tree-walk story; the GPU cost is CRT fill) and we already do the culling at
source (sim kill/escape rules) and at the render-group layer (13 churny layers each their own
group so a `visible` flip rebuilds one instruction set, not the scene — `layers/index.ts:116-135`,
measured scene rebuilds 0/660). `cullableChildren=false` is load-bearing only as a mitigation if
the optional spike is ever run. Verdict: ALREADY-DONE (inverted); falsifiable spike — mark the
~1,500 churned binding sprites cullable + `cullableChildren=false` on static subtrees, run
`pnpm bench`'s zone sweep + the TV kit; predicted headless-unchanged, two-tick-worse. Optional,
not scheduled.

### 7.4 Batch splitting: the v8 rules vs the doc's folklore

The real break axes in `Batcher.mjs`: (1) **blend mode** change (`:159`), (2) topology change
(`:159` — and `BatchableSprite`/`BatchableGraphics` are both `'triangle-list'`, so sprite↔graphic
never differs), (3) distinct texture **sources** exceeding the cap (`:196`; cap ≤16 desktop,
~8 on our Mali floor — we run **2–3** per batch: common p0 + the zone page), (4) batcher-name
change (all ours `'default'`), (5) explicit pipe breaks: nested render groups, custom-shader
meshes (Mode-7 = 1 deliberate call), filters, ParticleContainer, advanced blends — an empty
`break()` is free (`:126-127`). So L84's "Sprite→Graphic→Sprite→Graphic = 4 draw calls" is **false
in 8.22** (= 1) even though it still prints on Pixi's own current tips pages (stale doc-lore,
faithfully laundered; v4 batched by node kind). L85's blend advice is direction-right — with
corrections: `BLEND_MODES.ADD` is v5–v7 syntax (8.22 exports the type union only; write
`blendMode:'add'`), and sub-containers themselves do nothing — the batcher never consults
structure, only depth-first collection order (which nesting *does* change, correctly).

Ours is that discipline enforced statically: `LayerId` order *is* draw order (`presentation/index.ts:78-117`); batch blends are spelled at **creation** "so a blend never switches mid-frame"
(R3-06.L4; the only blend writes in the repo are creation-time — `sprites/index.ts:298-299`,
`particles/index.ts:638`, `renderer/index.ts:842`); the one additive overlay (`flashAdd`) sits at
the **tail** of the world run; particles run normal-group-then-add; the two designed `add→normal`
sandwiches (AIR_ENEMIES boss-over-glow, FX popups tail) are intentional z-order, each worth ≤1
call, both declined. All HUD/UI text is normal-blend glyph quads on page 0 — zero extra binds.
No `sortableChildren`/`zIndex`/mask exists in shipped render code, so nothing sorts per frame.
Measured: 10–15 draw calls headless / **11–16 on TV** vs budgets 20 (bench) / 16 (e2e) — fail-loud
gates watch exactly this metric; "we are not draw-call bound; re-grouping cannot measurably help"
(one break costs single-digit µs on this hardware). Verdict: nothing to fix; record the correct
v8 rules where the next reader will look.

### 7.5 Text: the pipeline the doc's advice grew into

graphics.md: never use `Text` (per-string canvas → VRAM fragmentation, cited to 2018 issue 5143);
use BitmapText; per-tick string updates are "extremely lightweight". All three graded:

- **Mechanism outdated:** v8 `Text` rasterizes from the shared **CanvasPool** into a refcounted
  po2 **TexturePool** texture ("uploaded from pooled canvases that are cleared and reused straight
  after upload", `CanvasTextPipe.mjs:26-29`) — not "an individual HTML5 canvas per string" (that
  is v4/v5, matching the v4-labeled 2018 issue 5143, closed stale). The *direction* survives
  (v8's own Text guide: "Avoid when: you're changing text every frame" — the DOM `measureText`
  walk + re-rasterize + re-upload per changed key is a real TV main-thread hog).
- **BitmapText per-change cost** (8.22 `AbstractBitmapTextPipe._updateContext`): grapheme
  segmentation (Intl.Segmenter on Chrome 87+, regex fallback on ours) producing a new array, a
  fully allocating layout, `context.clear()` + per-glyph rebuild and buffer re-upload. Cheaper
  than `Text`; **not** zero-alloc — and the doc's literal sample line allocates a template string
  every tick before Pixi ever sees it, a direct violation of our hot-path law. "Lightweight" here
  means "lighter than Text", not "free".
- **Ours is the superset:** zero `new Text(`/`BitmapText` in `packages/*/src` + `apps/*/src`; the
  release bundle greps 0 hits for `BitmapText`, `CanvasTextMetrics`, `TextStyle`, `.fnt`,
  `graphemeSegmenter` … (with a live-grep control). Strings reach the screen via `DrawList.setString`
  (compare-first, `presentation/index.ts:1107-1113`); scores are not strings at all — the
  `number` command carries the raw integer (`:1097-1106`), digits split into a shared `Uint8Array`
  (`render-pixi/src/text/index.ts:316-319`), zero-padded from the value (`HUD_DIGITS = 8` — our
  exact "SCORE: 000000"); a `revision`-equal list is skipped wholesale (`render-pixi/src/ui/index.ts:102-105`);
  glyphs are atlas quads on the resident page, integer positions, nearest — pixel-crisp at ×2/×3
  (MSDF would blur it, deliberately unused). Guarded: `ui-edge.test.ts:173-192` measures the doc's
  own scenario (scores ticking, full-frame redraws × 10k) at < 1.5 MB — the naive Pixi-`Color`
  re-tint path cost **~9 MB** there. Adopting BitmapText would *add* a .fnt page beside the zone
  atlases and move nothing: the presentation fingerprint hashes the string slots, so today the
  whole Pixi text subsystem is not merely unused, it is not shipped.
  Also true-but-conditional: `import 'pixi.js/text-bitmap'` is a custom-build caveat (root import
  self-registers the .fnt parser and the pipes); harmless to us, which uses neither.

### 7.6 The ImageBitmap adoption blueprint (the P0)

**What was measured.** The bench's decode scenario stage-3/4 is "the image … exactly as the game's
atlas wraps a page" vs "`createImageBitmap(blob)` + the same upload" — built so "R3-04 can tell
whether an image upload re-decodes and whether a bitmap loader would be faster"
(`apps/tizen/src/bench/decode.ts:19-24`). On the M7 (`[min, p50, p95]` tuples, 8 reps, all three
sessions reproduced `imageBitmap: true`; runs 2/3 agree within a few ms):

| Page | fetch p50 | Image path (decode + upload) | Bitmap path (bitmap + upload) | Δ file→GPU |
|---|---|---|---|---|
| 2048² RGBA (2.50 MB) | 32.9 | 366.7 + 389.0 = **755.7 ms** | 353.1 + 50.4 = **403.5 ms** | **−352 ms (−47%)** |
| 2048² PNG-8 (0.54 MB) | 16.7 | 159.5 + 175.0 = **334.5 ms** | 111.2 + 49.5 = **160.7 ms** | **−174 ms (−52%)** |
| 1024² common (88 KB) | 14.0 | 102.9 + 83.8 = **186.7 ms** | 68.9 + 12.5 = **81.4 ms** | **−105 ms (−56%)** |
| 256² zone-a interim | 5.6 | 52.8 + 3.2 = **56.0 ms** | 4.5 + 1.0 = **5.5 ms** | **−51 ms (−90%)** |

Mechanism, proven on TV hardware: the bench already awaits `img.decode()` *before* timing the
upload, yet upload ≈ decode on the Image path — `texImage2D(HTMLImageElement)` **re-converts on
the main thread**; a decoded-once ImageBitmap upload costs 8–15× less. The decode itself is NOT
meaningfully cheaper or asynchronous (353 vs 367 ms): the win is killing the *second* conversion,
not parallelizing the first — which is also why the doc's "render pre-decoded images
*asynchronously*" and any worker story is beside the point.

**Zone-load translation.** Committed synthetic-shape estimate (`analyze-bench.mjs decodeZoneEstimate`,
common×1 + zone×2): **1493 / 1492 / 1495 ms cold**, 739 / 745 / 735 eager — the session README's
"What *is* solid". Re-derived on the bitmap columns: cold ≈ **790 ms**; eager re-upload ≈ 150 ms.
Headroom vs the 2 s cap: **~25% → ~60%**. On the shipped final art (R6-02.P3, owner's committed
logs, `plan_resolution.md:4163`): zone load **1.48–1.59 s → ≈ 0.8–0.9 s**, i.e. ~0.6–0.7 s off
every zone transition. Per 2 Mpx final-density PNG-8 page: ≈ 170 ms → ≈ 81 ms.

**The change (exact shape).** In `packages/shell/src/loader/index.ts`, a bitmap branch beside the
current `LoadableImage` (`:74-90`, `HTMLImageElement`-shaped contract) / `loadImagesTimed`
(`:179-225`): XHR the bytes through the same `file://` status-0 path the manifest and bench use →
`new Blob([bytes], { type: 'image/png' })` → `createImageBitmap(blob)` **with no options** →
return it as the page image; feature-detect (`typeof createImageBitmap === 'function'` — Chrome
50+; the options dictionary we avoid entirely) with the current Image path as fallback. Wire-ins
are already typed for it: `ShellOptions.createImage` (`boot/index.ts:1350`) widens to a page-image
factory; `AtlasPageImage` already includes `ImageBitmap` (`atlas/index.ts:147-148`);
`imageSize`/`loadPage` read `.width/.height` unchanged; upload rides the same `ImageSource` →
`initSource` → `texImage2D` path the bench measured (`ImageSource.test()` accepts ImageBitmap).
The bench's stage 4 is a working reference implementation; the R1-05 `data-shmup-atlas-*-ms`
timing attributes and `__shmupDebug.atlas.timing` will show the win on-device.

**Gates (non-negotiable):**
1. **Pixel identity.** v8's default source `alphaMode` is `premultiply-alpha-on-upload`
   (`GlTextureSystem.mjs:240-243`); Pixi's own bitmap loader pairs `premultiplied-alpha` sources
   with `{ premultiplyAlpha:'none' }`. The bench verified *size*, not *pixels*. A trial must
   byte-compare a rendered frame (bitmap page vs image page) through the e2e `texImage2D` hook +
   the `?scene=` showcase pixels; PNG-8 + `@flash`/`@p2`/palette variants are the risk surface.
   Chrome's ImageBitmap premultiply history says verify, don't assume.
2. **`close()` lifetime.** An ImageBitmap is GPU/SharedImage memory; the lazy residency's
   `unloadPage` → `applyPage(page, null)` (`atlas/index.ts:500-507`) drops the JS reference but
   the bitmap must be explicitly closed or it lingers as VRAM pressure until GC — on a Mali inside
   a 100 MiB total / 23 MiB atlas-share budget, the one leak class to not have. The page-release
   hook carries it. (The shipped lazy default — images dropped on unload, R3-04.M3e — bounds this.)
3. **Estimator semantics.** `pageBytes = w·h·4` charged as `images` (`memory/index.ts:313-315`)
   stays shape-correct but becomes GPU-side bytes; the `:321-324` docblock ("Pixi keeps the
   HTMLImageElement to re-upload after a context loss") and platform-polish's budget narrative
   need a rewrite row. Context-loss recovery (`recoverAtlasPages`, `boot/index.ts:1786-1834`)
   re-fetches from URLs anyway, so bitmap-vs-image source-of-truth is unaffected.
4. **Keep the Image path** as the fallback branch (`decode()` guard, `decodeUrl` case) — parallel,
   not replaced.

**Rejected within the same claim:** `ImageBitmapRenderingContext` (the API the doc *names*)
presents bitmaps onto a 2-D canvas — we never draw through canvas-2d (its only DOM uses are the
boot overlay/error screen); its OffscreenCanvas half is Chrome 69 and thus **incomplete on the
webOS 68 floor**. And worker/`OffscreenCanvas` decode (Pixi's `preferWorkers` path): `fetch()`
from `file://` is the thing the repo deliberately avoids; blob-URL workers under the WRT are
unverified ("Service Worker API: No" on 5.5); and the decode is only ~half of what the main-thread
O-1 already removes — the other half (the upload) is dead at zero architectural cost. Skip.
Companion free item: record `gl.getSupportedExtensions()` in the probe env report so the KTX2/ETC
question can one day be answered from data instead of plausibility.

---

## 8. TV platform chapter

### 8.1 Input model: everything in the walkthrough, already shipped in stronger form

graphics.md prescribes (L140–183): a boolean `inputBuffer` flipped by keydown/keyup, blanket
`preventDefault`, ticker-side reads, `speed = 5 * ticker.deltaTime`, and clearing Enter after
consume — motivated by "the physical remote bursts input events at a speed of 15 to 30 triggers
per second" (L142, echoing L25), and "unthrottled UI frameworks will freeze trying to catch up".

Measured on this hardware (`docs/dev/input-probe-results.md` findings 1–4, raw
`tools/input-probe/results/2026-09-15-m7/`): repeats arrive at **≈ 9.3 Hz** (interval median
108–110 ms, p10 83 / p90 130) after a **≈ 356 ms** first-repeat — the doc's 15–30/s is 2–3× too
high; every repeat is delivered **without the `repeat` flag** (so filtering `event.repeat`, the
naive held-semantics defense, sees a stream of fresh presses); **one key at a time ever** (max
simultaneous down = 1 — the multi-key-hold scenario does not exist on this remote); taps median
165–195 ms, 14 rapid OK taps ≈ 3.6/s; and `KeyboardEvent.timeStamp` advances only in whole
seconds on Tizen 5.5, so all timing must ride the host clock.

Our stack is the decoupling, three layers deep and strictly stronger: capture-phase listeners
that flip typed-array slots and nothing else (`input-web/keyboard/index.ts:271-316`, zero alloc,
`MAX_TRACKED_KEYS = 32`); held/pressed/released **bitmasks** per player with a latched union so a
down+up between two polls is still seen (`core/input/index.ts:138-158, 221-230` — the doc's plain
boolean map loses that tap); `consumeLatched()` implements "clear Enter after consume" correctly
across menu-confirm buffers and scene changes; one `poll()` per **sim tick** into a reused snapshot
(`web-input/index.ts:392-498`). The loop is tick-driven, not event- or frame-driven: fixed 60 Hz
accumulator, delta snapping (`DEFAULT_SNAP_TOLERANCE_MS = 1`), a max-ticks-per-frame cap that
**drops time rather than catching up** — the built-in answer to "freeze trying to catch up",
because input here is state, not a queue. The doc's `deltaTime` motion is the anti-pattern to
reject: variable-dt integration desyncs recordings from replays and changes gameplay; the correct
dual already exists — `alpha` leftover feeds *render interpolation only* (`renderer/index.ts:48,
498, 1342`, auto-toggled by the refresh probe), menus auto-repeat in ticks (`MENU_REPEAT_DELAY
= 18`, `MENU_REPEAT_INTERVAL = 6` — ≈ 300/100 ms, within noise of the measured TV 356/108, so
menu feel matches the hardware without consuming its repeat stream). Blanket `preventDefault` is
worse than ours: mapped-keys-only + ctrl/meta-exempt (`keyboard/index.ts:290-292`), with the
always-preventDefault exception reserved for the one key whose default is app-closure (Back).
The `tizen-remote-safe` profile encodes the measurements (`releaseDebounceTicks` 2→0 — no keyup
bounce was ever measured); stuck-key handling is triple-covered (adapter blur clear, shell
suspend/blur `input.clear()`, `createTvLifecycle` edge-detecting visibilitychange *and*
blur/focus — Tizen's Home fires only the latter, and Home is never delivered as a key event);
and the shipped playtest bot flies the measured worst case (`test/playtest/remote-strict.ts`).
Every direct key listener in the repo audited burst-safe (the full table is in
`/tmp/opencode/tizen-opt/08-input-model.md` §Our-implementation; none touches engine state).
Verdict: ALREADY-DONE; the two falsifiable claims corrected by our own numbers; graphics.md's
15–30/s deserves a correction note only if that doc is ever edited (P2).

### 8.2 Remote keys: the corrected table, what we register, the one delta

The doc's mechanism (privilege + `registerKeyBatch`) is right; nearly every key fact is wrong or
mislabeled (all verified against the official web table, `tvinputdevice`, fetched 2026-10-27):

| Physical | doc said | actual web name / code | we do |
|---|---|---|---|
| D-pad 4-way, OK | ArrowUp…38/40/37/39, Enter 13 | **correct** — auto-delivered, no registration | game+menu dirs/Confirm (`content/input/remote.input-profiles.json:12-34`) |
| Back button | "Return", 10009, "must handle manually to prevent sudden app closure" | name is **`Back`**, 10009, auto-delivered ("ArrowLeft/Up/Right/Down, Enter, **and Back** … detected automatically"); "Return" is the .NET/Ecore name for the OK-adjacent Enter | armed pre-game watcher → `platform.exit()`; in-game Pause (game) / Back (menu) through the polled `Action.Back`; exit-confirm on the title |
| Long-press Back | (unaddressed) | arrives as **`Exit`** (10182) — and `Exit` is the *only one* of 46 supported keys whose `registerKey` **fails** on the device (probe: 45 succeed) | **uncapturable**: a web app can neither intercept nor prevent it; the "sudden closure" is not preventable, contrary to the doc |
| Volume | "physical volume keys require privilege" (implying: register them) | VolumeUp/Down/Mute 447/448/449 registrable | deliberately **never** registered (`SYSTEM_REMOTE_KEYS` filter) — registering steals the user's volume control |
| Play / Pause | "MediaPlay (10252) and MediaPause (10251)" | **10252 is `MediaPlayPause`** — the single Smart-Remote button; `MediaPlay` = 415, `MediaPause` = **19**; **10251 does not exist** | profile registers `MediaPlayPause`; 10252 → Pause in both game and menu maps — the doc's "natural pause hotkey" already exists |
| Rewind / FF | "MediaRewind (412) and MediaFastForward (417)" | **codes correct**; basic-remote-only buttons (long-press re-times to 10232/10233); absent on the M7's smart remote | not registered (no buttons to press) |
| Colors | "XF86Red, XF86Green, XF86Yellow, XF86Blue" | **`XF86*` are ElmSharp/.NET Ecore KeyNames** — `registerKey('XF86Red')` throws `InvalidValuesError`; web names are **`ColorF0Red` 403 / `ColorF1Green` 404 / `ColorF2Yellow` 405 / `ColorF3Blue` 406** (the SO answer's own example is `registerKey("ColorF0Red")`); the homebridge page the doc also cites is a third universe (`KEY_RED` IR command strings, "not an official list from Samsung") | fallback list carries the colors; **live profile does not** — see the delta below |
| Digits | (unmentioned "numeric selectors") | `0`–`9` = 48–57 registrable | dev builds only, post-unlock '1'–'8' → F1–F8-equivalents (Pause + Ch+×3); release TV: none, by design |
| Guide / Extra | (absent) | Guide 458, Extra 10253 | registered by the live profile, unbound by default — REBIND-bindable by design (probe finding 5) |

**The delta (P0-2):** the shipped boot registers the *profile's* list
(`remote.input-profiles.json:41`: `MediaPlayPause, ChannelUp, ChannelDown, Guide, Extra`) while
the code fallback (`apps/tizen/src/platform/index.ts:60-68`) carries the four `ColorF*` names
without Guide/Extra — so today color events never reach the app, REBIND cannot offer them, and
the webOS-side parity (its magic-remote colors already bind 403→Special / 404→Speed) is impossible
on Samsung. One content line — add the four names to the profile's `register` list — makes colors
deliverable and rebindable (on a Smart Remote they arrive via the "123"/"…" virtual keys or a
basic remote); the validator only rejects `SYSTEM_REMOTE_KEYS`, so no schema change; input content
is outside the sim hash — no golden or fingerprint impact. Default actions are owner UX taste
(candidates from the lane: red→Special, green→Speed mirroring webOS; yellow→bullet-palette cycle;
blue→CRT toggle — or ship registered-unmapped, rebind-only). Align the fallback with the profile.
The doc's own advice, corrected to web names, converges on exactly this line.

### 8.3 Context loss: what ships today, and the watchdog

Shipped (and e2e-proven on a real GL context, `test/e2e/atlas-context-loss.spec.ts`): Pixi's own
`webglcontextlost` → `preventDefault` + `contextChange` fan-out across every GL subsystem
(`GlContextSystem.mjs:96-104, 176-192`), *plus* our atlas recovery that Pixi cannot do — on
restore, re-fetch / `unload()` / `uploadTextureSource()` each resident page one at a time
(`boot/index.ts:1786-1834`), listeners ordered after Pixi's, removed in `stop()`. Documented law
in rendering-and-shell/platform-polish/asset-pipeline.

The gap the lanes found: **no watchdog for a loss that never restores**. `grep isContextLost`
over `packages/`, `apps/src`, `test/` returns **zero** (re-verified in this weld — its only
appearance in the shipped tree is inside Pixi's minified internals). If the driver never fires
`webglcontextrestored` (GPU-process/driver resets do this; Samsung's own memory guide §1 documents
the TV *killing* apps under pressure — a live failure class on a 100–120 MB ceiling), the loop
keeps ticking and drawing into a dead surface: an infinite black screen with audio and a running
sim behind it. **P0-3 fix (15–25 lines + 1 spec):** keep a `contextLost` flag (set in the existing
`onContextLost`, cleared in `onContextRestored`); in the frame loop count rendered frames while
set; after ~60 (~1 s) call `gl.isContextLost()` once; if still lost, swap the canvas for the
shell's existing boot **error screen** with Back-to-exit via `platform.exit()`. Verification: a
spec fires `WEBGL_lose_context.loseContext()` **without** `restoreContext()` and asserts the error
screen, not the black canvas. Zero per-frame cost when healthy (the check lives behind the flag).
Not adopted, and rejected: proactive `forceContextLoss()` when backgrounded — the Home overlay is
a `blur`, the game pauses but must keep drawing the pause menu, so a forced loss is undone by the
next frame; steady-state GPU is already bounded by residency (~21 MiB counted on-device).

### 8.4 The two measurements the owner still owes

Unchanged from R6-02, and both are the honest blanks behind several doc claims: (1) **process-wide
Chromium memory vs the 120 MB Tizen dev-install cap** — every *counted* component is 3.4×+ inside
(estimator 75.1–84.2 MiB/stage vs the 100 MiB app budget; on-device ≤ ~21 MiB GPU + ≤ 30.8 MiB
heap), but the process total (Chromium's own surfaces, the compositor planes outside our canvas)
has never been read; (2) the guided `rp-` render-profile captures — §11.1/§11.2 tables, boot-ms,
and the M5 WebGL1-vs-2 60-s capture are **still empty** (the kit builds green; it has never been
run on-device). Plus one free addition: record `gl.getSupportedExtensions()` in the probe env
report (today it captures only `MAX_TEXTURE_SIZE`/renderer/version), so the ETC/ASTC question is
answerable from data. Expected verdicts, per the already-run 150+172-scenario sweeps: within
noise. This is the only place "measure" is the right response to graphics.md at all.

### 8.5 DOM rules and layout: N/A by architecture, and doing them would hurt

The section-34 trio (bypass framework state / CSS containment / unified selection box) is a
faithful condensation of the TO THE NEW post — which is an **OTT-catalogue DOM app** write-up
(React shelves, `<img>` rails, a video player); line 36's own preamble scopes it ("for hybrid
structures or media applications"), the canvas game is not its audience, and the premises cannot
bite: the complete third-party runtime set of every shipped bundle is `pixi.js` 8.22.0 alone
(all ten manifests scanned — no React/Vue/Angular/Svelte/Lit/jQuery/Redux/howler), the shipped
HTML is one `<canvas>` + four CSS rules + one script (and `check-bundle.mjs` rule asserts
exactly-one-script so a DOM addition fails the bundle gate), and the "selection box" is one
cursor **string slot** command while the "seek bar" is a `list.rect` pair into the quad pool
(the boss HP bar's fill is remembered in pixels so a hit that changes none rebuilds nothing).
Containment/will-change: zero occurrences in shipped HTML or injected style — and *available*
(`contain` = Chrome 52), so the SKIP is a choice: adding either to our single canvas is a no-op
at best and a new composited layer at worst, i.e. the doc's own VRAM warning applied to us reads
**do not**. One clarification: the audit brief's paraphrase of the containment bullet *inverted*
it (it says *avoid* blanket `will-change` — it is the lane file, not the doc, that is right;
graphics.md:38 as written is the sane version). Layout inquiries: **0 first-party occurrences of
the entire family** (`getBoundingClientRect/offset*/client*/scroll*/getComputedStyle`, repo-wide
grep incl. tests and tools); viewport reads are boot + the single `resize` listener — literally
"cache all dimensions once upon startup", re-cached on resize, which never fires during TV play;
the per-frame body (`boot/index.ts:1998-2075`) reaches DOM only through a change-gated
`data-shmup-scene` attribute (inert instrumentation — no CSS selector or query reads it), and the
debug device line is a cached string field (the M2-17 lesson). The one live layout read in a
shipped artifact is Pixi's EventSystem `getBoundingClientRect` per **pointermove** (`EventSystem.mjs:436`;
2 textual hits in `dist/app.js`) — dormant on TVs, real on web/Electron → closed by P0-5's
`eventFeatures` off, with lane disagreement recorded honestly: the canvas-tweaks lane prices its
TV impact at ~0 (correct — the TVs have no pointer); the layout lane's O-1 additionally removes
the desktop rect-on-move path, the `touch-action` style write and the EventsTicker; adopt as
hygiene with `pnpm bench` + full e2e as the gate (safe: no container is `interactive`; the
audio-unlock `pointerdown` is the shell's own window listener, not Pixi's). Two regression
gates worth their cost (P1, cheap insurance, test-only): a frame-path DOM-free scan (same shape
as the frame-literal scans, allow-list = boot overlay / telemetry panel / page notice / the four
`data-shmup-*` writes) to freeze "zero DOM per frame" as law instead of prose; and a
layout-inquiry scan extending the tv-engine-floor family — plus a docblock line on
`PlatformDisplay` ("viewport metrics on demand — never in a per-frame path"; its live
allocating getters are a latent trap no code currently hits). `matchMedia`/`prefers-reduced-motion`:
zero uses, correctly — the TVs expose no motion preference (a match would be dead code); our
answer is the explicit platform-independent `ReduceFlashing` option; OS-seeding on desktop hosts
was considered and declined for now (P3).

---

## 9. Prioritized action plan

### P0 — adopt now (each: change / site / cost / impact / risk + gate)

1. **`createImageBitmap` atlas page decode** — new bitmap branch in
   `packages/shell/src/loader/index.ts` (fetch→Blob→`createImageBitmap(blob)`, no options,
   feature-detected, Image path kept as fallback); wire `ShellOptions.createImage`
   (`shell/src/boot/index.ts:1350`); `close()` the bitmap in the residency's page-release hook
   (`render-pixi/src/atlas/index.ts:500-507`). **Cost:** one loader function + factory widening
   + release hook + gate (the bench's stage-4 is the reference implementation). **Impact (M7-
   measured):** zone load 1493 → ≈ 790 ms; final-art transitions 1.48–1.59 s → ≈ 0.8–0.9 s;
   eager/context-loss re-upload 739 → ≈ 150 ms; headroom 25% → 60%. **Risk:** alpha semantics —
   gate: byte-compare one rendered frame bitmap-vs-image (e2e `texImage2D` hook + showcase
   pixels; `@flash`/palette variants), plus a residency long-session heap check. No sim/determinism
   surface touched (upload bytes identical by the gate).
2. **Color keys into the live register list** — `content/input/remote.input-profiles.json:41` +=
   `"ColorF0Red","ColorF1Green","ColorF2Yellow","ColorF3Blue"` (align the `platform/index.ts:60-68`
   fallback with the profile). **Cost:** 1 content line. **Impact:** colors become deliverable →
   REBIND-bindable → webOS parity + accessibility surface. **Risk:** none measured (validator
   passes; outside sim hash; Guide/Extra precedent — registered-unmapped is already shipped
   behavior). Default actions = owner UX call; ship rebind-only if undecided.
3. **Context-loss watchdog** — flag + ~60-frame count + one `gl.isContextLost()` → shell error
   screen + `platform.exit()` (`packages/shell/src/boot/index.ts`, the `:1821-1833` region).
   **Cost:** 15–25 lines + 1 e2e spec (`WEBGL_lose_context.loseContext()` without restore).
   **Impact:** converts the only unrecovered TV graphics failure class — permanent black screen
   with live audio — into a stated, exit-able error. **Risk:** zero when healthy (check behind
   the flag); gate: the new spec + existing `atlas-context-loss.spec.ts` unchanged.
4. **Init display-size floor** — `packages/render-pixi/src/renderer/index.ts:777-778`:
   `Math.max(1, Math.floor(options.displayWidth ?? 0))` — the guard `resize()` already applies at
   `:1305-1307`. **Cost:** 2 lines + 1 unit case. **Impact:** closes the only real instance of the
   sizing-failure shape graphics.md groped at (0×0 boot read → 0×0 drawing buffer → silent black
   canvas); exposure is low (boot reads 1920×1080 on-device, loads land long after layout).
   **Risk:** none — behavior identical for every nonzero input.
5. **`eventFeatures` all-off** — `renderer/index.ts:775-787`: `eventFeatures: { globalMove: false,
   move: false, click: false, wheel: false }`. **Cost:** 1 line. **Impact:** removes Pixi's
   document-level pointer listeners, its `touch-action` style write, its EventsTicker rAF work and
   (the part with a measured cost class) the per-pointermove `getBoundingClientRect` on web/
   Electron; ~0 on TVs (no pointer hardware — the canvas-tweaks lane priced the TV delta at zero
   and called it hygiene; the layout lane prices it safe and worth it; both are right, on different
   hosts). **Risk:** gate: full e2e suite (audio-unlock is the shell's own listener — unaffected;
   nothing is `interactive`) + one `pnpm bench` run.

### P1 — measure before deciding (scheduled only as capacity allows)

6. **Cullable spike (optional, falsifiable, predicted-negative)** — `cullable = true` on the
   ~1,500 churned binding sprites + `cullableChildren = false` on terrain/parallax/static pools;
   run `pnpm bench` zone sweep + the TV kit. Prediction: headless p95 unchanged within ±0.1–0.3 ms;
   two-tick share worse on device (the 6,400-node walk is priced at 1–4 ms on this CPU class;
   Pixi's own docs say CPU-bound ⇒ degrades). Kill on first adverse reading. The zero-hits
   `cullable` grep stays either way.
7. **Regression gates as law** — the frame-path DOM-free scan and the layout-inquiry scan (§8.5),
   modeled on `frame-literals-repo.test.ts` / `tv-engine-floor.test.ts`; ~1 test file each.
8. **Owner captures (instrumented, never run)** — M5 + `rp-` boot/process-memory
   (incl. the 120 MB dev-cap process read) + `getSupportedExtensions()` in the probe env report
   (2 lines, `tools/input-probe/src/env.ts:54` region); re-grep the built bundle for post-68 APIs
   after every dependency bump (standing rule; the Pixi 8.22 `matchAll` break is the precedent).

### P2 — doc-fix one-liners (accuracy only, no behavior)

9. `packages/render-pixi/src/index.ts:4` — stale "384×216 render texture" docblock → 640×360
   (dead since R2-01's flip; found by the Dali lane). *(Verified still stale at this write.)*
10. `packages/render-pixi/src/viewport/index.ts:4-23` — docblock still quotes v1's 384×216/×5
    examples; code is FRAME_W/H-derived.
11. `docs/dev/rendering-and-shell.md:1184` — "…the M7 run settles it": the run happened; record
    the settled conclusion (image upload re-decodes confirmed; bitmap path ≈ ½ file→GPU, 8–15×
    upload) so no future lane rebuilds the bench to re-ask it. Zero code risk.
12. `docs/dev/render-performance-review.md` F11 (:309-315) — its line refs predate the current
    init block (:775-787); refresh on the next touch.
13. If graphics.md is ever kept as repo lore (elsewhere it should be archived-as-wrong): the
    burst-rate line (15–30/s → measured ≈ 9.3 Hz on the M7), the color-key names (→ web
    `ColorF0Red`…403-406), `MediaPause` 19 / 10252=MediaPlayPause, and an "N/A for web
    applications" annotation on the Dali/EFL/Lottie/4K bullets.

### P3 — explicit won't-do (with the one-line reason)

| Won't do | Reason |
|---|---|
| Raw hand-written WebGL1 batcher replacing Pixi | ROI negative: headless worst p95 1.60 ms of a 16 ms gate; the TV's 11–18 ms is the **panel's** floor (v1 at 384×216 shares it); the tree-walk cost a batcher would remove is already driven to ~0 rebuilds/frame; ~2–4 k LoC to re-own RT pooling, texture GC, filters, VAOs, the 2-pass CRT/Mode-7 machinery; the 500-line twgl contingency in `shmup_tech.md:240` stays contingent — Pixi has not misbehaved, and the one real break (8.22 `matchAll`) was fixed with a polyfill |
| WebGL 2 on the TVs | Measured, adjudicated: no verdict at shipped output; P4d NOT NEEDED (W5-20); the ≥71 auto-floor + probe + player escape row already ship |
| KTX2/ETC/ASTC compressed textures | Resident art ≤ ~10 MiB of a 100 MiB budget; PNG-8 upload already 2.2× cheaper than RGBA; ETC exposure on M69 unproven (gap closed by the free probe add-on first); lossy block compression is incompatible with the byte-exact palette/digest/RR-1 provenance gates; a transcoder inside the one-file ES2018 IIFE for a non-problem |
| Mipmaps | Already optimal by construction: `autoGenerateMipmaps:false` pinned, nothing minifies (the blit magnifies), NPOT + NEAREST is legal on WebGL1; mips = +33 % texture memory + blur — "Wrong for us" (review row 12) |
| Low-bit render targets (RGB565) | ~2.5 MiB saved inside 16–25 MiB of slack, paid in 6-bit R/B truncation of byte-exact palettes; the canvas buffers are Chromium's allocation, not ours to choose |
| Lottie (native viewer, or lottie-web as the web stand-in) | Viewer unreachable from .wgt; web path is the per-frame JS loop, 17-FPS-class on 2014 silicon, ~63–68 KB of a 97 KB headroom, second rAF clock, off-model anti-aliased vectors |
| `cacheAsTexture` anywhere | v8 snapshot API with manual invalidation; every candidate is either revision-skipped quads (caching adds VRAM + a stale-snapshot hazard for nothing) or per-frame-changing (worse than not caching) — proven net-negative at all 11 vector sites |
| Pixi `BitmapText` with per-tick `.text =` | Allocates string + graphemes + layout + geometry rebuild per change; our `number`/`setString` path allocates zero and is guarded; adopting the idiom is a regression against the hot-path law |
| Worker / OffscreenCanvas bitmap decode | `fetch()`/blob-URL workers vs `file://` + WRT service-worker "No" + webOS-68 completeness; P0-1 kills the upload half of the cost without any of it; OffscreenCanvas-render is a documented non-scheduled experiment, not a plan item |
| Blanket `preventDefault` | Our mapped-keys/ctrl-meta-exempt policy keeps browser/TV shortcuts; the always-prevent exception is Back only (its every default is navigation) |
| `matchMedia` / OS reduce-motion | Never resolves on the two TVs; explicit `ReduceFlashing` user option is the platform-independent answer |
| Pixi Application + ticker (`deltaTime`) | Fixed-step accumulator is the determinism contract; `alpha` already carries frame-independent smoothing where it belongs (presentation); the doc idiom would desync every golden replay |
| Direct-1920×1080 renderer init | The measured 59.5%→11.3% two-tick fill sweep (1080p→720p output) is why the 640×360 RT + capped backbuffer exists; W5-20 ships `Auto` = 720 on TVs |
| `will-change`/`contain`/DOM focus overlays on our page | One canvas, zero composite layers — adding any is exactly the layer-explosion cost the doc's own source warns about |
| `gcActive:false`, explicit alpha option, dropping `hello`/`powerPreference` | GC protects zone-swap cleanup (pages never idle — residency owns them); v8 has no alpha init option (derivation is the design); the no-op flags stay as self-documenting intent |

---

## 10. Source trust appendix — all 19 distinct URLs graphics.md cites

graphics.md contains exactly 19 distinct URLs. Notably, its two native-engine bullets that make
the strongest claims — **line 6 (Dali) and line 9 (EFL) — carry no citation at all**, as do lines
37, 38, 43. "Opened" means fetched and read by a lane on 2026-10-27.

| # | URL (as cited at) | Opened by | What it ACTUALLY says | graphics.md's attribution |
|---|---|---|---|---|
| 1 | developer.samsung.com/…/web-engine-specifications.html (L1, L2, L7, L15) | 01,02,03,04,06,07 | Table 1: 2020 = Tizen 5.5 = **Chromium M69**; Graphics table: one un-versioned "WebGL — Yes", `ImageBitmap` "Yes", `ImageBitmapRenderingContext` "Yes (basic support)", Canvas, Web Animations; extension list WASM/NaCl/SmartView/TOAST/CAPH; no Lottie row | For "M69" — **accurate**. For "unlocks advanced WebGL capabilities + hardware-accelerated 2D canvas" — **invented** (no such statements; WebGL2 predates M69 by 13 versions). For "native multi-threading frameworks" (L1) — **not in the page at all** (it is a web-feature table). ImageBitmap availability — accurate; the *mechanism claim* attached to it is the doc's own conflation |
| 2 | engadget.com/…samsung-galaxy-watch-3-review… (L1) | none | (product review; the device is a Wearable-Tizen-5.5 Galaxy Watch 3) | **Invented role**: used to fuse the wearable "Tizen 5.5" with the TV "Tizen 5.5" into one "OS" the whole document then optimizes for — the conflation lane 01 documents. Not opened; nothing in the audit hinges on its contents |
| 3 | tizen.org/blogs/tsg/2019/tizen-5-5-public-m1-release/ (L2, L8, L13, L14) | 01,02,03,07 (live URL 500s; read via Wayback/stg mirror) | Platform release notes over "Native/Web/TizenFX APIs": STT, multi-assistant, **CircularUI 1.2.0**, "**Lottie animation viewer has been added**", "Support for the High resolution (4K/8K) has been added. **Display server** can display the multi-resolution windows", NN runtime | For Lottie — **the sentence exists but is native-side** (no web API; lane 02's four-surface proof). For 4K/8K — **real at the display-server level, false for a .wgt** (Samsung's own resolution guide: apps get 1920×1080/1280×720; our 4K M7 measured 1080p@1). **Never mentions Dali or EFL** — contradicting the section it is cited beside |
| 4 | tothenew.com/blog/optimizing-performance-in-smarttv-html-tv-apps/ (L18, L22-25, L39, L44, L46, L49, L77, L83 — eight citation sites) | 04,07,12,14 (read in full) | OTT/DOM catalogue app write-up: splash-in-index.html, early fetches, React out of the scroll-rail hot path (vanilla pool of DOM elements), single translate3d focus overlay, `will-change` restraint + `contain: layout style paint`, cached `getBoundingClientRect`, `decoding="async"`, Paint Flashing, seek-bar updates; engine row says "Chromium 53" | **Mixed**: the DOM trio (L37-39), the layout-inquiry bullet (L43) and the VRAM-layers warning (L24, as DOM-composite talk) are **faithful condensations** (lane 14's fidelity table). **Everything WebGL/Pixi-shaped is invented**: the post mentions Pixi 0×, WebGL 0×, WebGL2 0×, Tizen 5.5 0× — so L29-32, L46's WebGL2/single-core framing, L49-67's "[2] tothenew", and L84's batching arithmetic have **no basis in their own primary citation**. Its "weak single-core" is about mid-tier generic sets, not our measured 4-core Kant-SU2 |
| 5 | pixijs.download/dev/docs/core-concepts-7.html (L30, L31, L44) | 05,12 | Today serves Pixi's *current* dev-docs Performance Tips ("the M7 run"… same content as the 8.x tips page): "backgroundAlpha: 1 and antialias: false", the (stale) "each type change breaks the batch" bullet, useContextAlpha (dead v7 name) | Flags — **present but v7-era lore arriving late** (both already v8 defaults, ours set explicitly). Batching cite — **present and wrong-in-v8** (the doc laundered a stale official bullet; §7.4). Note the URL's "7" is a doc-build number, not the engine version |
| 6 | stackoverflow.com/questions/71515879 (L32) | 04 (question + sole answer, in full) | "Tizen Web Application: WebGL canvas not properly rendered": canvas explicitly sized, viewport explicitly correct, asker tried `gl.viewport(0,0,1900,900)` — "didn't work"; accepted-by-nobody answer from **Samsung's Tizen Emulator team**: "driver issue in **Tizen Emulator** … fixed … Tizen 7.0 Emulator release" | **Invented generalization**: emulator-driver symptom → "Tizen WebGL targets occasionally drop draw buffers if dimensions fluctuate" + a remedy the *asker disproved*. §6.4 |
| 7 | stackoverflow.com/questions/68087616 (L216) | 09 (via API; direct 403) | Two answers, **none accepted**; top (+2): remote keys need `registerKey` before JS sees them, example `registerKey("ColorF0Red")` → keyCode 403 | Substantive direction — **accurate**; the doc's "users note… standard practice for … numeric selectors" overstates (it says nothing about digits, never mentions `registerKeyBatch`) and the doc ignores the answer's own spelling: web names are `ColorF0Red`-style, **not** the `XF86*` it then registers. §8.2 |
| 8 | pixijs.com/8.x/guides/concepts/performance-tips (L51, L71, L73, L77, L78, L83, L84, L85) | 05,10,12,13 | Official v8 tips: multi-texture batching (switches ≠ flushes), what breaks batches (filters, masks, >100-pt Graphics, custom-shader meshes), blend-mode breaks ("the one true 2-vs-4 case"), the stale type bullet, culling "disabled by default… **CPU-bound it will degrade**", Graphics-mutation cost, `useContextAlpha` (dead name) | Mechanics cited — **mostly present**; the load-bearing omissions are decisive: the CPU-bound warning (L69-73's section quotes the page and drops its warning) and the page's correct break axes (L84's arithmetic is quoted *from* it but is stale). The doc's citations here are real sources misread, not invented sources |
| 9 | richardfu.net/…pixijs-v8…culling-api/ (L71, L73) | 10 | Accurate opt-in mechanics + manual `Culler.shared.cull`; **wrong** that `cullArea` is global-space (8.22 applies `worldTransform` — local); conclusion verbatim: manual `.visible = false` "remains the most straightforward and performant approach" | **Cherry-picked against its own author**: the article says hand-culling beats Pixi culling; graphics.md derives "use cullable" from it. §7.3 |
| 10 | github.com/pixijs/pixi.js/issues/5143 (L77) | 11 (read in full) | "Canvas Texture for Tizen 4.0 (latest version) broken on Smart TVs" — opened Oct 2018, **labeled Version v4.x**, closed **Stale** Feb 2019: corrupted canvas-texture pixels on 2018 Samsungs | **Wrong authority**: a 2018 v4 GPU-corruption bug report cited for a v8 "canvas per string" mechanism claim it never made. The advice direction survives on v8's own guides; the citation is lore-deposit. §7.5 |
| 11 | medium.com/@turkmergin/maximising-performance… (L78, L79) | 13 (Wayback 2025-09-09; direct 403) | Entirely **v7 API**: `beginFill/drawRect/drawCircle`, `graphic.geometry`, passing geometry between Graphics, `cacheAsBitmap`; transferable principles incl. "1×1 white texture + tint for every rectangle" | **Outdated names, correct destination**: the article's own winning trick *is* our quad pool; `GraphicsGeometry` does not exist in v8 (zero hits in 8.22 lib). §7.7 |
| 12 | cprimozic.net/notes/posts/pixi-js-optimizations/ (L79) | 13 (fetched OK; the assignment's alternate gist URL is 404) | v7.3 MIDI-editor case study: Graphics masks slow → fake with z-order; explicit `RenderTexture` once → shared Sprites (the winning fix); cache whole parents not children (per-child bitmap exploded textures) | **Outdated names, sound principles already implemented** in our stronger form; the doc adopted the vocabulary, not the lessons. §7.7 |
| 13 | pixijs.com/8.x/guides/components/assets (L92, L116) | 11 | The Assets API, `Assets.add({alias,src})`, `.fnt/.xml/.txt` bitmap-font support; (lane 6 separately read the shipped loader internals: `preferCreateImageBitmap: true, preferWorkers: true`) | Present and accurate as an idiom guide; irrelevant to us (§7.5/§7.6 — we deliberately bypass Assets for the atlas; note the irony that Pixi's own parser *does* default to ImageBitmap decode) |
| 14 | pixijs.com/8.x/guides/components/scene-objects/text (L92) | 11 | Text: "Avoid when: changing text every frame"; BitmapText: "ideal for frequently updating text" | Direction cited honestly; the doc's "per-tick lightweight" gloss outruns even this (§7.5). |
| 15 | pixijs.com/8.x/guides/migrations/v8 (L96) | 11 | Custom Builds / load-a-.fnt-before-init → import the extension caveat | Real caveat presented as a universal requirement ("you must guarantee…") — TRUE-but-conditional; redundant under a root import, moot for us. §7.5 |
| 16 | pixijs.download/dev/docs/scene-11.html (L116) | 11 | BitmapText docs incl. "Cheap updates: changing the string just rearranges pre-rendered glyphs" | The claim graded §7.5: the 8.22 source re-layouts and re-buffers per change — "rearranges" is marketing; our digit path is the honest implementation of the idea |
| 17 | developer.samsung.com/…/user-interaction/remote-control.html (L142, L187, L191, L204, L209) | 09 (fetched in full) | The web TVInputDevice table: auto set **includes Back**; MediaPlayPause **10252**, MediaPlay 415, MediaPause **19**, Rewind 412, FF 417 (long-press → 10232/10233), ColorF0-3 403-406, digits 48-57, Exit 10182, Volume 447-449; Back/Exit table (click Back / long-press Exit); `registerKeyBatch` since-2016; the privilege URL string | Privilege+batch mechanics — **accurate** (our config.xml:22 ships it). The doc's *rendering* of the table: half the codes wrong, the color names swapped to the .NET universe, Back's name wrong, 10251 invented, and the 15-30/s burst rate **not on this page at all** (the page documents key names, not event rates). §8.2 |
| 18 | developer.samsung.com/…/tizen-net-tv/guides/user-interaction.html (L219) | 09 | ElmSharp/.NET `EcoreKeyEventArgs` KeyNames — the `XF86Red`/`XF86AudioPlay`-style names (incl. a typo `XF86AudioPlayv`) | Source of the doc's **fatal name error**: .NET strings pasted into `tvinputdevice.registerKey` would throw `InvalidValuesError`. A web app reading a .NET page's table — the category error the lane calls it. §8.2 |
| 19 | tavicu.github.io/homebridge-samsung-tizen/extra/commands.html (L219) | 09 | IR/network-API command strings (`KEY_POWER`, `KEY_RED`, …), self-labeled "not an official list from Samsung", `KEY_CYAN` standing in for yellow | **Third naming universe**, corroborates nothing about the web API; cited as if it validated the XF86 claim. §8.2 |

Trust verdict: of the 19 sources, **2 were cited for content they do not contain in whole or
part** (tothenew for all Pixi/WebGL claims; SO 71515879 for the "Tizen black-screen" law),
**1 is stale-by-eight-years-and-version** (issue 5143), **2 are the wrong platform's docs
entirely** (.NET user-interaction for web key names; homebridge IR strings), **4 are accurate
sources whose load-bearing warnings or conclusions were omitted** (Pixi tips ×2, richardfu, the
tizen.org blog via its 4K/Lottie half-truths), and the remainder are either genuinely supportive
at the level they claim (M69, the privilege XML, the nav-key auto-set, the .fnt idiom) or
decorative (engadget). The document's citation *density* is high; its citation *fidelity* is
low — precisely the failure mode of LLM-written technical prose, and worth saying plainly
because the owner will hear "the doc says" again from some other agent.

---

## 11. Lane index

All under `/tmp/opencode/tizen-opt/` (ephemeral; this report carries their substance).

| File | Lane | One-line result |
|---|---|---|
| 01-dali.md | Dali (L4-6) | REJECT-CLAIM-WRONG — real engine, unreachable from .wgt by any route; own cited blog omits it; found the stale `render-pixi/src/index.ts:4` docblock; maps every Dali trait to our stack; 59.05 fps measured on the M7 |
| 02-lottie.md | Lottie (L8, L14) | REJECT/SKIP — native viewer walled off from WRT ("not yet compatible"); lottie-web = 17-FPS-class + 63–68 KB of a 97 KB headroom + second rAF clock; "preserve memory" inverted for us; Samsung itself walked to baked frames |
| 03-efl.md | EFL/Evas (L9) | SKIP-N-A — never a TV third-party surface; deprecated platform-wide since Tizen 10.0; the praised mechanics live in Chromium + our render-group discipline; deep-irony note (the engine *hosts* in EFL, invisibly) |
| 04-webgl.md | WebGL claims (L7, L32, L46, L49-67) | Fabricated where cited (tothenew has zero WebGL; SO 71515879 = emulator bug); WebGL2 measured-and-declined (P4d); init flags ALREADY-DONE; O1 watchdog + O2 size-floor + O3 owner capture are the residue; grades the whole tothenew post claim-by-claim |
| 05-canvas-tweaks.md | Canvas flags + boilerplate (L27-33, L49-67) | Complete Pixi-8.22 init-flag table (every option ours vs default); v8 defaults backgroundAlpha/hello — the doc's flags are folklore arriving late; alpha chain end-to-end; fill math 9×/3× vs the doc's 1080p init; eventFeatures "~0 on TVs" dissent recorded |
| 06-imagebitmap.md | ImageBitmap (L15) | **THE adopt**: M7-measured −47…−56% file→GPU per page, zone 1493→~790 ms, final art 1.48-1.59 s→~0.8-0.9 s; mechanism = upload re-decode; exact loader shape + pixel-identity + close() gates; bitmaprenderer named-API rejected; worker/OffscreenCanvas rejected |
| 07-resolution-vram.md | 4K/8K + VRAM (L13, L24) | Web apps never see 4K (measured 1080p@1 on our 4K panel); thrash class structurally excluded; full atlas/RT inventory vs budgets (worst campaign moment 22 ≤ 23 MiB share); KTX2 reject, mipmaps optimal, RGB565 reject, residency scan clean; two owner measurements named |
| 08-input-model.md | Input walkthrough (L25, L140-183) | ALREADY-DONE superset: 9.3 Hz measured vs 15-30/s claimed; flagless/one-key findings encoded in `tizen-remote-safe`; bitmask+latch > boolean map; deltaTime motion rejected for sim (alpha smoothing is the correct dual); every listener audited |
| 09-remote-keys.md | Key walkthrough (L185-219) | Mechanism right, facts wrong: corrected full official table; XF86 = .NET names that throw; 10252 = MediaPlayPause, 10251 nonexistent, Pause=19; Exit uncapturable; **the ColorF* register delta is the one real gap** (1 content line) |
| 10-culling.md | Culling (L69-73) | ALREADY-DONE (correctly OFF): triple-opt-in not "automated"; culled ≡ visible mechanics; 6,400-node walk (1-4 ms) to save ≤0.1 ms; Pixi's CPU-bound warning + the cited author's contrary conclusion both omitted; falsifiable spike specified, predicted-negative |
| 11-text-bitmaptext.md | Text (L77, L87-138) | ALREADY-DONE superset: zero Pixi text modules in the bundle (grep-proved); number-command allocation-free (<1.5 MB/10k vs ~9 MB naive); #5143 = stale v4 cite; per-tick BitmapText .text graded allocating-not-free; digit formatting from raw integer |
| 12-batch-splitting.md | Batching (L44, L81-85) | v8 break rules walked from `Batcher.mjs` (type is not an axis — 1 call not 4; Pixi's own page carries the stale bullet); blend IS real and our blends are creation-frozen with additive tails; 2-3 sources/batch vs cap ~8; 10-15/11-16 calls vs 20/16 gates; two ≤1-call z-trades declined |
| 13-graphics-caching.md | GraphicsGeometry + cacheAsBitmap (L78-79) | Both v7 names (GraphicsGeometry deleted; cacheAsBitmap = warning alias; cacheAsTexture = manual-snapshot); 11/11 vector sites audit ALREADY-DONE (two built-once test-pattern Graphics); adoption proven net-negative incl. the frame-graph worst case; v8-correct rewrite text supplied |
| 14-dom-rules.md | DOM trio (L34-39) | N/A-by-architecture ×3: zero framework deps (manifest scan), one canvas + four CSS rules, cursor = one string command; **corrects the audit brief's inversion of the will-change bullet**; per-frame DOM hits = zero (audited frame body line-by-line); proposes the DOM-free regression scan |
| 15-layout-queries.md | Layout reads (L43) | ALREADY-DONE with margin: 0 first-party layout-family reads; boot+resize caching = the doc's own prescription; sole residual = Pixi EventSystem rect-on-pointermove (web/Electron only) → eventFeatures-off; latent `platform.display` getter trap; matchMedia/prefers-reduced-motion analyzed-and-declined |

**Conflicts adjudicated during this weld** (the record the owner should know): (1) the spawn
brief's paraphrase of graphics.md L38 inverts the document — lane 14 is right, the doc says
*avoid* blanket will-change; (2) the brief's "tothenew has ZERO of the attributed content" is
true only of the Pixi/WebGL claims — the DOM trio is genuinely from the post (lanes 4 vs 14,
both accurate on their halves; §10 row 4 splits them); (3) eventFeatures: "worthless on TVs"
(lane 5) vs "small and safe" (lane 15) — adopted as hygiene with the TV impact honestly recorded
as ~0 and the desktop path as the reason; (4) lane 2's "892 KB" vs lane 7's "0.59 MiB" for
atlas PNGs on disk (different trees/commands measured) — lane 7's per-page table is authoritative
and used; (5) the brief's source list counts a "dali" URL — graphics.md cites none for Dali; the
19th distinct URL is the engadget review (opened by nobody; its role is the OS conflation).

**Deliberately left out:** the per-lane node_modules source walks beyond what §6–§7 cite (kept
to the load-bearing line refs), the Lottie-SPN/`js-spatial-navigation` answer content in SO
68087616 (irrelevant), Electron `screen.*` main-process reads (not DOM, not the doc's claim),
and the `prepare(-1)` dev-scene 48 MiB detail beyond a row (§6 gap-3) — all recoverable from the
lane files if ever needed, which the report's completeness already assumes they are not.
