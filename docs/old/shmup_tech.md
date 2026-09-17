# Shmup Cup — Language, Platform & Library Research

> Research snapshot **2026-09-10**. Versions, star counts and dates were checked against npm / GitHub on that date.
> Sizes marked **(m)** = measured (esbuild minify + gzip, whole package imported); **(b)** = bundlephobia.
> **[UNVERIFIED]** = vendor claim or inference not yet confirmed on a real TV.
> Companion doc: [`shmup_feat.md`](shmup_feat.md) (feature catalog).
>
> **Implementation status (2026-09-15):** the stack chosen here is built and in use (see [`shmup_plan.md`](shmup_plan.md)
> and [`shmup_progress.md`](shmup_progress.md)). Later decisions that override this snapshot live in the plan's
> "As built" notes — for example, dev machines need **Node 24.15+**, not Node 22. The **input probe ran on both M7
> monitors on 2026-09-15**: its measurements are in §2.2, §2.3, §2.5, §2.7 and §6 (marked *measured* / *verified*;
> full write-up [`docs/dev/input-probe-results.md`](../dev/input-probe-results.md)) and are applied by plan step
> M3-02b. The remaining **[UNVERIFIED]** items wait on the on-device checks (plan §8).

---

## 1. Verdict: what language?

**TypeScript, shipped as a Tizen Web App (`.wgt`).** It is Samsung's primary, best-documented TV app path, needs only a public Samsung certificate, runs on every TV model year from one codebase, and the exact same code runs in a browser, Electron (desktop / Steam Deck), LG webOS and Android TV. A 2D shmup's CPU budget is small — V8 is plenty if we avoid garbage-collection churn.

| Option | Verdict | Why |
|---|---|---|
| **TypeScript / JS web app** | ✅ **Use this** | Primary Tizen TV path; supported on every model year; portable to web / Electron / webOS / Android TV. |
| C# / Tizen .NET | ❌ | Its UI stack (Xamarin.Forms) is end-of-life (May 2024); no game-rendering framework on TV; MAUI Tizen backend moved out of dotnet/maui and is "not yet publishable"; doesn't port to other targets. |
| Native C/C++ | ❌ | Retail Samsung TVs refuse third-party native (`capp`) apps from non-partner certificates. |
| C++/Rust → WebAssembly | ⚠️ Only if you already have such an engine | WASM needs 2020+ TVs (Tizen 5.5 / Chromium 69); Samsung's Emscripten fork is from 2021; modern Rust/Emscripten emit WASM features old TV engines reject (reference-types need M96 — even 2023 TVs are M94); still needs a JS shell for Tizen APIs, input, audio. No real gain for a 2D shmup. |
| Unity | ❌ | Dropped Tizen after Unity 2017.2; WebGL builds are heavy for TVs. |
| Godot 4 | ❌ | Web export requires WebGL2 + WASM; no reports of it working on Samsung TVs. Godot 3 (WebGL1) is plausible but untested. |
| Flutter (flutter-tizen) | ❌ | Runs on TVs from 2021 up, but it's not a game engine. |

**Tizen status:** alive and well. 2025 TVs ship Tizen 9.0 and 2026 TVs ship Tizen 10.0. Samsung promises 7 years of OS upgrades for 2024+ models, and is licensing Tizen to other TV makers (RCA, EKO, AIWA, …), which widens the audience for the same `.wgt`. **Tizen watches/phones are dead** (watch store shut down 2025-09-30) — TV only.

---

## 2. Tizen TV platform facts that shape everything

### 2.1 Web engine per TV model year (engine is frozen per model; never updated)

| TV year | Tizen | Engine | Consequences |
|---|---|---|---|
| 2026 | 10.0 | Chromium **M130** | Modern |
| 2025 | 9.0 | M120 | Modern |
| 2024 | 8.0 | M108 | Modern |
| 2023 | 7.0 | M94 | Modern-ish; no WASM reference-types |
| 2022 | 6.5 | M85 | Optional chaining OK; game-mode metadata available |
| 2021 | 6.0 | M76 | No `?.` / `??` (transpile) |
| **2020** | **5.5** | **M69** | **WASM, AudioWorklet, OffscreenCanvas available** — suggested "full feature" floor |
| 2019 | 5.0 | M63 | No `import.meta` (Vite modern build won't load) |
| 2018 | 4.0 | M56 | No native ES modules, no object spread, no `globalThis`; WebGL2 unlikely |
| 2017 | 3.0 | M47 | Needs ES5 transpile — probably not worth the QA cost |

**✅ DECIDED — target Tizen 5.5 (2020 models, Chromium M69).** Our two dev/test displays — **Samsung 43" Smart Monitor M7, model LS43AM702UNXZA (= M70A, 2021 model year, Tizen 5.5, Samsung groups it with 2020 TVs)** — have Developer Mode already enabled and accept Bluetooth/USB gamepads and keyboards. So the minimum target *is* our test hardware. Full hardware notes in §2.7. Every newer Tizen model (6.0 → 10.0) runs the same build. 2018/2019 and older sets are unsupported.

#### Tizen 5.5 / Chromium 69 feature budget

| Available natively on M69 — use freely | Missing on M69 — transpile or polyfill |
|---|---|
| ES2017 (`async/await`, classes, generators, spread in arrays/calls), object rest/spread (M60) | Optional chaining `?.` / nullish `??` (M80) → **esbuild transpiles** with `target: 'chrome69'` |
| WebGL1 (WebGL2 **[UNVERIFIED]** per GPU — detect at runtime) | Class fields / private `#fields` (M72/M74) → **transpiled** |
| **WebAssembly** (Samsung: supported from Tizen 5.5) | `globalThis` (M71) → **polyfill** (PixiJS v8 uses it) |
| **AudioWorklet** (M66) — tracker music playback now viable | `Array.prototype.flat/flatMap` (M69 ✓ borderline), `Object.fromEntries` (M73) → polyfill if used |
| OffscreenCanvas (M69), Web Workers, IndexedDB, Gamepad API, Page Visibility, Fullscreen, `performance.now()` | `String.replaceAll` (M85), `Promise.allSettled` (M76), `Array.at` (M92), `Object.hasOwn` (M93), `structuredClone` (M98) → avoid or polyfill |
| Dynamic `import()` (M63), `import.meta` (M64) | `ResizeObserver` (M64 ✓) — fine |

Build rules:
- Vite/esbuild **`build.target: 'chrome69'`**, output a **single IIFE bundle** (Samsung lists ES modules as only "partially" supported — don't rely on `<script type="module">`).
- Lint with `eslint-plugin-compat` + browserslist `chrome >= 69` so unsupported APIs fail CI.
- Tiny hand-picked polyfill file (`globalThis`, anything the linter flags) instead of a blanket core-js.
- 2020 TVs: UHD models render web apps at 1920×1080, FHD models at 1280×720 — check `window.innerWidth` on our two displays on day one.

### 2.2 Rendering
- **Web apps render at 1920×1080 on UHD TVs and 1280×720 on FHD TVs** (no 4K web rendering). ⇒ internal res **384×216** (×5 on 1080p; ×3 + small letterbox on 720p) or **320×180** (integer ×6 / ×4 on both).
- **Design for WebGL1**, detect WebGL2 at runtime (WebGL2 availability on TV GPUs is unconfirmed). Keep atlases ≤ 2048².
  *Measured on our M7s (2026-09-15):* WebGL 1 **and** WebGL 2 (OpenGL ES 3.0) on a **Mali-G51**,
  `MAX_TEXTURE_SIZE` 8192 — WebGL1 stays the baseline for older sets; the 2048² atlas cap is now a memory budget, not
  a hardware limit.
- Draw the whole game into a low-res render texture, then one nearest-neighbor upscale quad — ~29× less fill than drawing at 1080p. Fill rate and GC pauses are the real TV bottlenecks, not sprite count.

### 2.3 Input
- Remote: arrows (37–40), Enter (13), Back (**10009**) arrive by default. Everything else (Play/Pause 10252, colors 403–406, digits) needs `tizen.tvinputdevice.registerKeyBatch()`. Long-press Back = Exit — don't register it.
- The remote **cannot hold two keys at once** — **verified on the M7 (2026-09-15)**: while an arrow is held, a second arrow or OK is never delivered (no diagonal, no move + OK); the held arrow keeps going ⇒ "remote mode" with forced autofire, and any other button needs the arrow released first.
- **Held keys repeat as `keydown` with `event.repeat === false`** (verified): first repeat ≈ 355 ms after the press, then every ≈ 108 ms (± 40 ms). Filtering on `event.repeat` does not work on Tizen — ignore a keydown of a key that is already down. No fake keyup/keydown pairs.
- **Back, Play/Pause and Mute are sent only on release** (keydown + keyup together) — they can never be held.
- **`event.timeStamp` only advances in whole seconds** on Tizen 5.5 — time input with `performance.now()` in the handler.
- **The remote is our PRIMARY controller (decided)** — see `shmup_feat.md` §4 "Remote-first control design". Channel ± (427/428), the Ch rocker's press (Guide 458), the screen button (Extra 10253) and Play/Pause (10252) are registrable; **volume keys are registrable too** (not system-reserved) but registering them takes volume control away, so the game never does. Full key map and numbers: §2.7 and [`docs/dev/input-probe-results.md`](../dev/input-probe-results.md).
- **Gamepads:** all Samsung TVs since 2016 support the W3C Gamepad API (up to 4 pads, rumble via `vibrationActuator`). A pad is invisible until its first button press. Not available in the emulator.
- Metadata `http://samsung.com/tv/metadata/use.game.mode` (2022+) may switch the panel into low-latency Game Mode **[UNVERIFIED for non-streaming games — test]**.

### 2.4 Audio
- Web Audio supported on all relevant models; codecs include Ogg Vorbis, AAC, MP3, FLAC, WAV.
- `decodeAudioData` can be slow on TVs ⇒ **pre-decode all SFX during loading**, never mid-game.
- **Don't decode whole music tracks** (3 min stereo float PCM ≈ 63–69 MB RAM). Stream music via `<audio>` + `MediaElementAudioSourceNode`, or decode one stage's track at a time at 32 kHz. (Trade-off: `<audio>` streaming makes loop points less sample-accurate.)

### 2.5 Memory & lifecycle
- Dev-installed apps are capped at **120 MB**; no published store limit ⇒ budget **< 100 MB**.
- `visibilitychange` must pause the game and suspend audio (JS is frozen while hidden).
- **Home is an overlay on the M7** (verified 2026-09-15): Home and a gamepad's PS / Home button fire only window
  `blur` (then `focus` on return) — **no `visibilitychange`**, and the app keeps running under the overlay. Pause and
  suspend audio on `blur` as well.
- Back from title ⇒ your own exit-confirm popup ⇒ `tizen.application.getCurrentApplication().exit()`.

### 2.6 Tooling & store
- **VS Code Tizen extension + Tizen TV extension** is the going-forward toolchain (Tizen Studio is maintenance-only). CLI: `tizen build-web` → `tizen package -t wgt -s <profile>` → `tizen install` → `tizen run`; `sdb connect` to the TV. Scriptable in CI.
- **Samsung certificate** = author cert (back it up; needed for every update) + distributor cert listing the TV's DUID.
- Dev Mode on TV: Apps panel → `12345` → host IP. Debug with Chrome DevTools remote inspector. HMR-to-TV over WebSocket is possible (Samsung guide: ~70 s → ~25 s per iteration).
- **Store (TV Seller Office):** Public Seller = **US only**; other regions need a Partner Seller contract. Mandatory: launch ≤ 10 s, no crash/freeze, correct Back/Exit, multitasking via `visibilitychange`, resume from Smart Hub, uninstall deletes user data.

### 2.7 Our test hardware — Samsung Smart Monitor M7 43" (LS43AM702UNXZA)

| Item | Finding | Confidence |
|---|---|---|
| Model | **M70A**, 2021 model year (letter after "LS43": A=2021, B=2022 … F=2025; "M70F" is the 2025 LS43FM702) | High |
| OS / engine | **Tizen 5.5, Chromium 69** — UA `Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36`; firmware `M-KSU2SMWWC-2750.0` on both units; no native `globalThis` | **Measured** (probe, 2026-09-15) |
| Platform / SoC | Model code `20_KANTSU2_43UHD_MNT` ⇒ **Kant-SU2**; **4 cores**; GPU **ARM Mali-G51**; RAM unpublished ⇒ still **assume weak** | Measured (RAM unknown) |
| WebGL / APIs | WebGL 1 **and WebGL 2** (OpenGL ES 3.0 Chromium), `MAX_TEXTURE_SIZE` **8192**; WebAssembly, **AudioWorklet**, OffscreenCanvas, Gamepad API all present | Measured |
| Audio | `AudioContext` at **44,100 Hz**, `baseLatency` **0.05 s** | Measured |
| Panel | VA, 3840×2160, **60 Hz max, no VRR/FreeSync**, 8 ms GtG, HDR10, 300 nits | High |
| Web app resolution | **1920×1080 CSS px, DPR 1** (screen 1920×1080) ⇒ 384×216 ×5 integer fits exactly | **Measured** |
| Frame timing | rAF median 16.4–16.5 ms (60 Hz) but **strong jitter**: 27–32 % of deltas > 20 ms, p95 29–30 ms, max ~45–56 ms (182 ms under the Home overlay); ~59 fps delivered ⇒ mostly jitter, ~1.5 % real drops. A fixed-step loop must lock to vsync or it double-steps (plan M3-02b) | Measured on the probe page — confirm with the game's overlay |
| Ports / radios | 2× HDMI 2.0, USB-C 65 W, 3× USB-A 2.0, Wi-Fi 5, **Bluetooth 4.2** | High |
| Gamepads | Bluetooth + USB; manual: "XInput USB gamepads are supported"; Samsung 2020/21 list: Xbox Series/One, DualShock 4, DualSense, Luna, Shield, Logitech F310/F510/F710. Standard W3C Gamepad API, ≤ 4 pads, visible after first press. **DualShock 4 over Bluetooth verified:** `mapping="standard"`, 17 buttons / 4 axes all delivered, D-pad diagonals work; button 16 (PS) also opens the system overlay (`blur`). Two pads at once not tried yet | High (1 pad measured) |
| Keyboard | Bluetooth + USB supported | High |
| **Mouse** | **Only works in the Internet (browser) app and Remote Access — NOT in our app** ⇒ never depend on mouse | High (manual) |
| Remote | Samsung Smart Remote (rechargeable/solar, mic): D-pad, Select, Return, Home, Color/Number (on-screen pad — **no physical number keys**), Vol, Ch, Play/Pause, app shortcuts | High |
| Remote — behaviour | **One key at a time** (a second arrow or OK during a hold is never delivered); held keys repeat as `keydown` **without** the repeat flag after ≈ 355 ms, every ≈ 108 ms; **no fake key-up/key-down pairs, no bounces**; key-up arrives 0–100 ms after the last repeat; taps last 120–260 ms (median 165–195); fastest OK re-tap ≈ 276 ms. Back / Play/Pause / Mute are sent **only on release** | **Measured** (both units) |
| Remote — key codes | D-pad 37–40, Select 13, Return 10009, Play/Pause 10252, Ch ± 427/428, **Ch rocker pressed = Guide 458**, Vol ± 447/448, **Vol rocker pressed = VolumeMute 449**, **screen button (top right) = Extra 10253**; Home is never delivered. `getSupportedKeys()` = 46; `registerKey` works for all 45 non-`Exit` keys, volume keys included | **Measured** |
| Lifecycle | Home (and a pad's PS button) shows an **overlay**: `blur` / `focus` only, **no `visibilitychange`**, the app keeps running | **Measured** (one unit) |
| `event.timeStamp` | On the `performance.now()` clock but **only advances in whole seconds** (0–1.3 s behind) ⇒ useless for timing | **Measured** |
| **Game Mode** | Manual: "only available when an external input source is being used" ⇒ **our built-in app never gets Game Mode** ⇒ measure real input-to-photon latency ourselves | High |
| Input lag | Unmeasured for built-in apps (the first try was a 30 fps video — too coarse). RTINGS (2022 S43BM70 successor): 12.7 ms PC mode, 68.5 ms "BluRay" mode, Game Mode figure paywalled | Unknown — measure (240 fps phone video) |
| Gaming Hub | Unclear (probably later-added streaming apps, not full Gaming Hub) — irrelevant to us | Low |
| Dev Mode | Works: Apps → 12345 (via Color/Number on-screen pad or SmartThings virtual remote) → host IP; then normal `sdb connect` / `tizen install` TV flow | Medium-high (forum snippet + user confirmed it's enabled) |
| Store | Seller Office has **no monitor category** — distributed via TV model groups by year; M70A presumably in the 2020 group ⇒ **alpha test (≤ 50 DUIDs) works, beta test is 2021+ only** | Medium — ask Seller Office |

**Quirks to handle:**
- **Auto Source Switch+** can yank the display to HDMI/USB-C when a connected PC wakes — turn it off on the test rigs.
- **VA-panel smearing** on dark→bright transitions: avoid pure-black backgrounds behind small bright bullets; use slightly lifted dark backgrounds (e.g. deep navy) so bullets stay crisp.
- 60 Hz fixed, no VRR ⇒ the "one sim tick per rAF" loop mode is the normal path on our hardware — and because rAF
  jitters by up to ± 8 ms, the loop has to *lock* to it (one tick per callback unless a frame was really dropped),
  not just accumulate time.
- No Game Mode ⇒ latency budget is tighter than on a TV in Game Mode; keep our own pipeline at ≤ 1 frame and tune (hitbox generosity, no unnecessary input buffering).
- **Single-key remote:** every non-arrow action (OK = power-up, Ch± = Special / Speed, Back / Play/Pause = pause)
  needs the arrow released first, and Back / Play/Pause register only when released (≈ 150–250 ms after the press).
  Never ask for a held Back / Pause or a chord; the release debounce is unnecessary (`releaseDebounceTicks` 0).
- **Home = `blur`, not `visibilitychange`** — pause on both.

**First thing to run on the device:** read `navigator.userAgent`, `sdb capability` (`platform_version`), `innerWidth`/`innerHeight`/`devicePixelRatio`, WebGL1/2 + `MAX_TEXTURE_SIZE` — the input-probe app reports all of these. **Done on 2026-09-15** (both monitors): results, raw logs and the analyzer in [`docs/dev/input-probe-results.md`](../dev/input-probe-results.md) and [`tools/input-probe/results/`](../../tools/input-probe/results/README.md); the game-side changes are plan step **M3-02b**.

Sources: [Samsung CA product page](https://www.samsung.com/ca/monitors/high-resolution/smart-m7-43-inch-smart-tv-apps-ls43am702unxza/) · [Laptop Mag review (Tizen 5.5)](https://www.laptopmag.com/reviews/samsung-43am70a-smart-monitor) · [Samsung US 2020–2021 gaming models (M70A listed as 2020)](https://www.samsung.com/us/tvs/gaming-hub/2020-2021-tvs/) · [RTINGS S43BM70](https://www.rtings.com/monitor/reviews/samsung/smart-monitor-m7-s43bm70) · [Samsung Gamepad guide](https://developer.samsung.com/smarttv/develop/guides/user-interaction/gamepad.html) · [Seller Office distribution](https://developer.samsung.com/tv-seller-office/guides/applications/distributing-application.html) · M50A/M70A user manual BN81-20136D-04 (Samsung support).

---

## 3. Recommended architecture

### 3.1 Repo layout
**Recommended: one pnpm-workspaces monorepo** (+ Turborepo for cached build/test). Separate repos only if you must — then publish `@shmup/core` via GitHub Packages with Changesets. **Avoid git submodules.**

```
shmup/
  packages/
    core/            # pure TS, NO DOM/WebGL/audio imports:
                     #   fixed-step deterministic sim, entities, patterns,
                     #   collision, stage runner, rank, scoring, replay
    render-pixi/     # IRenderer impl (PixiJS v8) — or render-webgl/ custom batcher
    audio-web/       # IAudio impl (Web Audio mixer)
    input-web/       # keyboard + Gamepad API → action bitmask
  apps/
    web/             # Vite dev target, HMR, localStorage
    tizen/           # config.xml, icons, key registration, 10009 Back, lifecycle,
                     # exit(), wgt package/sign/install scripts, chrome69 IIFE build
    electron/        # main.ts (fullscreen, backgroundThrottling:false), file saves, Steam
    webos/           # (later) appinfo.json, Back = 461
  assets/            # source art (Aseprite), atlases, OGG music, SFX
```

If you prefer the "generic game lib repo + Tizen repo + Electron repo" split you described, the same packages map 1:1: `shmup-core` repo (core + render + audio + input packages), `shmup-tizen` repo, `shmup-electron` repo, each consuming `@shmup/core` as a versioned dependency. The monorepo is simply less friction while the API is still changing — you can split later.

### 3.2 The `Platform` interface the core consumes
```ts
interface Platform {
  id: 'web' | 'tizen' | 'electron' | 'webos' | 'android';
  input: { poll(): InputSnapshot };            // adapters merge keys/remote/gamepad → actions
  storage: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void> };
  audio: { unlock(): Promise<void> };          // gesture-unlock on web; no-op on TV/Electron
  lifecycle: { onSuspend(cb: () => void): void; onResume(cb: () => void): void };
  exit: (() => void) | null;                   // null ⇒ hide "Quit" (browser)
  display: { cssWidth: number; cssHeight: number };
  caps: { gamepad: boolean; remoteOnly: boolean; webgl2: boolean };
}
```
Rules for `core`: never touch `tizen.*` / `webapis.*` / `electron`; never read keycodes (only actions); pause sim on `onSuspend`.

### 3.3 Extra platforms this buys almost free
- **LG webOS** — same model (Chromium web app, `.ipk`); new adapter ≈ 1 day. Note oldest webOS engines are older (webOS 4 ≈ Chromium 53).
- **Android TV / Google TV** — Capacitor or WebView wrapper (evergreen Chromium; weak SoCs).
- **Steam Deck** — Electron Linux build or Windows build via Proton.
- **Browser / itch.io** — it's the dev target anyway.

---

## 4. Library comparisons

### 4.1 Rendering / game frameworks ⭐ the big choice

| Option | Latest (date) | ★ | Size gz | WebGL1? | Canvas fallback | TS | Kind |
|---|---|---|---|---|---|---|---|
| **PixiJS v8** | 8.20.1 (2026-08-26) | 48.1k | 252 KB full / **162 KB** minimal (m) | ✅ `preferWebGLVersion: 1`, auto-fallback; also WebGPU | Experimental (8.16+) | Native | **Renderer library** |
| **Phaser 4** | 4.2.1 (2026-07-09) | 40.3k | 361 KB (m) | ✅ default context is `webgl` (WebGL1) | Deprecated in v4 | .d.ts | **Full framework** |
| Phaser 3 | 3.90.0 (2025-05, final) | — | ~345 KB | ✅ | ✅ | .d.ts | Framework, EOL |
| Excalibur | 0.32.0 | 2.3k | 142 KB (b) | ❌ WebGL2 only | ✅ auto | TS-first | Framework |
| KAPLAY | 3001.0.19 (v4000 alpha) | 1.8k | 65 KB (b) | ✅ | ❌ | Native | Framework — slow with many objects in 3001 |
| LittleJS | 1.18.29 (2026-08) | 4.2k | 46.5 KB (b) | ❌ WebGL2 only | ✅ Canvas2D | Types | Tiny engine |
| melonJS | 20.4.0 (2026-09-09) | 6.4k | 245 KB (b) | ❌ dropped in v20 (19.9.x last with WebGL1) | ✅ | Types | Framework |
| Cocos Creator | 3.8.8 | 9.8k | multi-MB | ✅ fallback | — | TS | Editor-centric engine |
| Defold | 1.13.x | 6.3k | ~1.1 MB | ✅ fallback | — | Lua | WASM ⇒ 2020+ TVs only |
| Godot 4 / 3 | 4.7.2 / 3.6.3 | 117k | 5–10 MB+ | 4: ❌ / 3: ✅ | — | GDScript | WASM engines |
| Construct 3 | SaaS | — | — | phasing out WebGL1? | — | JS | Proprietary editor |
| twgl.js | 7.0.0 | 3.0k | 22 KB (b) | ✅ 1 & 2 | — | Types | Thin GL helper |
| regl | 2.1.1 (2024) | 5.6k | 37 KB (b) | ✅ | — | Types | Functional GL, low activity |
| PicoGL | 0.17.9 (2022) | 0.8k | 15 KB | ❌ WebGL2 | — | — | Unmaintained |
| Hexi | 2019 | 0.6k | — | — | — | — | Dead |

**Old-Chromium notes:** Phaser 4's dist is essentially ES5 (friendliest out of the box). Pixi v8 ships ES2020+ but esbuild `--target=chrome56` lowered it cleanly; it needs a `globalThis` polyfill below M71. Runtime on an M56 TV is **[UNVERIFIED]**.

**Benchmarks (desktop):** Pixi v8 bunnymark 100k sprites ≈ 15 ms CPU (vs 50 ms in v7); ParticleContainer 1M particles @ 60 fps on M3. Phaser 4 SpriteGPULayer 1M+ (restricted). 2023 benchmark (pre-v8/v4): 10k sprites → Pixi 47 fps, Phaser 43, Kaboom ~3. A shmup has ~500–2,000 sprites — any batched WebGL renderer handles that.

**Pixel-perfect support:** Pixi `scaleMode:'nearest'` + `roundPixels`; Phaser `pixelArt:true` + `roundPixels`; Excalibur `pixelArt:true`; KAPLAY `crisp` + `letterbox`.

#### Lean vs batteries-included

| | **PixiJS v8 + custom loop** (recommended) | **Phaser 4** | **Custom WebGL1 batcher (twgl)** | LittleJS |
|---|---|---|---|---|
| Runtime size | ~162 KB | ~361 KB | ~22 KB + ~500 lines | ~47 KB |
| Tizen 5.5 (M69) | ✅ with `chrome69` transpile + `globalThis` polyfill [verify on our displays] | ✅ out of the box (ES5 dist) [verify] | ✅ (you control everything) | ⚠️ Needs WebGL2 — unconfirmed on 5.5 GPUs, else slow Canvas2D |
| Engine-agnostic core | Easy (renderer behind `IRenderer`) | Hard (Scenes/GameObjects leak everywhere) | Easy | Medium (global-style API) |
| Perf headroom | Very high | High | Highest (purpose-built) | High (claimed) |
| You build yourself | Loop, input, audio, collision, scenes | Very little | Everything incl. text/sprites/atlas loading | Some |
| Risk | ES2020 quirks on old TVs | Framework lock-in; own loop fights fixed-step determinism | More code to own | WebGL2 dependency, small community |

**Recommendation:** **PixiJS v8 as a renderer only** — don't use its `Application` ticker; drive it from our own fixed-timestep loop; core sim never imports Pixi. **Fallback:** a ~500-line custom WebGL1 sprite batcher (twgl.js) if Pixi misbehaves on old TVs — a fixed-palette pixel-art game needs very little from a renderer. **Pick Phaser 4** only if you want batteries-included and accept lock-in.

### 4.2 Entity management / ECS

| Library | Latest | ★ | Size | Notes |
|---|---|---|---|---|
| bitECS | 0.4.0 (2025-12) | 1.5k | 5.6 KB | TS rewrite, SoA, relationships/prefabs; MPL-2.0 |
| Koota (pmndrs) | 0.6.x canary | 730 | 10.4 KB | Active, pre-1.0 |
| miniplex | 2.0.0 (2023) | 1.05k | 3.7 KB | Plain objects, ergonomic, quiet since 2023 |
| becsy | 0.15.5 (2025) | 298 | — | Multithreading-oriented, low activity |
| ecsy | 0.4.3 | 1.2k | — | **Archived — dead** |

**Recommendation: no ECS.** A shmup has few, fixed entity kinds. Use **struct-of-arrays `Float32Array` pools** for bullets/shots/particles (zero-GC, cache-friendly, trivially serializable for replays) + **pooled enemy class instances** with composition (behavior coroutine, hitbox, HP). A generic 30-line `Pool<T>`. Alternative: bitECS 0.4 if variety explodes.

### 4.3 Audio

| Option | Latest | Size | Notes |
|---|---|---|---|
| **Raw Web Audio** | — | 0 | Every Tizen year; full latency control |
| Howler.js | 2.2.4 (2023) | 9.9 KB | Stable but inactive; `html5:true` streams music |
| @pixi/sound | 6.0.1 (2024) | — | Tied to Pixi, low activity |
| Tone.js | 15.1.22 | 80.7 KB | Synth/sequencer — overkill |
| chiptune3 (libopenmpt MOD/XM/IT) | 0.8.9 (2026-08) | **~518 KB gz** worklet | Needs AudioWorklet ⇒ 2020+ TVs; CPU cost on weak SoCs |
| SPC players (js-snes-player, snes_spc_js) | — | — | Prototypes only, not production |
| ZzFX / ZzFXM | 1.3.2 | 1.2 KB / 442 B | Procedural SFX / tiny songs — great for prototyping |
| jsfxr | 1.4.1 | — | sfxr port — design tool, export WAV |

**Tracker modules vs OGG on TV:** trackers = tiny + authentic but WASM + AudioWorklet + ~518 KB player + CPU. OGG = universally supported, near-zero CPU, but must be streamed (not fully decoded) to save RAM.

**Recommendation:** **custom ~200-line Web Audio wrapper** — `AudioContext({latencyHint:'interactive'})`, pre-decoded SFX buffers with voice cap & priorities, streamed OGG music (fallback MP3/M4A). Compose in a tracker (Furnace/OpenMPT) and **render to OGG**. Alternative: Howler.js.

**Tizen 5.5 note:** because 5.5 has both WASM and AudioWorklet, **live tracker playback (chiptune3/libopenmpt) is technically available on every supported device**. Trade-off: ~518 KB player + CPU on the TV SoC vs. RAM for decoded/streamed OGG. Plan: ship OGG first; benchmark chiptune3 on our 5.5 displays as a possible upgrade (tiny files, sample-accurate loops, authentic sound).

### 4.4 Input
Libraries are stale or trivial: contro (2022), joypad.js (2023), gamecontroller.js (2022), gamepad.js 3.0.1 (buttons → key events only), kontra (whole micro-engine).

**Recommendation: custom `InputManager` (~300 lines)** — key events set flags + edge latches; `navigator.getGamepads()` polled once per fixed update; per-tick **action bitmask snapshot** (deterministic, replayable); 8–16-frame ring buffer for input buffering; remap table in storage; deadzones; `mapping === 'standard'`. Tizen typings: `@types/tizen-tv-webapis` 2.0.9.

### 4.5 Collision / math
**No physics engine** — Matter.js (stale), Planck (unneeded), Rapier (WASM; JS repo archived 2026-07).

| Library | Latest | Size | Use |
|---|---|---|---|
| check2d (ex-detect-collisions) | 9.36.4 | 11.3 KB | BVH + SAT polygons — only if rotated/polygon boss hitboxes |
| SAT.js | 0.9.0 | 2.8 KB | Narrow-phase only |
| rbush | 4.0.1 | 2.2 KB | R-tree for static geometry |

**Recommendation:** custom circle/AABB/capsule tests + uniform grid (~32 px cells) + tilemap masks for terrain. Pull in check2d only if needed.

### 4.6 Tweening, timelines, bullet patterns

| Library | Latest | Size | Notes |
|---|---|---|---|
| GSAP | 3.15.0 | 26.7 KB | Now free incl. plugins, but license isn't OSI & forbids Webflow-competing tools; time-based |
| tween.js | 25.0.0 | 3.7 KB | Manual `update(t)` fits fixed-step |
| anime.js | 4.5.0 | 39.3 KB | DOM/SVG oriented |
| popmotion | 11.0.5 (2022) | — | Superseded — skip |
| bulletml.js | 0.5.4 (2017) | — | Study the format; don't depend |

**Recommendation:** gameplay must be frame-deterministic, so **no time-based tween engines in the sim**. Use **TS generator coroutines** (`function* ring(){ … yield* wait(8); }` — generators work back to Chrome 39) + Penner easing table + small pattern DSL (BulletML-inspired). tween.js for UI/menus only.

### 4.7 Build, test, content tooling

| Need | Primary | Notes / alternatives |
|---|---|---|
| Bundler | **Vite 8.3** (Rolldown/Oxc) | Default target is `chrome111` — for Tizen set **`build.target: 'chrome69'`**, single IIFE, small polyfill file. (`@vitejs/plugin-legacy` not needed for a 5.5 floor) |
| Language | **TypeScript 7.0** (Go-native, ~10× faster builds) | Programmatic API lands in 7.1 — some plugins may lag; run `tsc --noEmit` separately |
| Tests | **Vitest 5.0** | Headless deterministic sim + golden replays |
| Pixel art | **Aseprite** (paid, source-available) | LibreSprite (GPL, stale), **Pixelorama** (MIT, free, active) |
| Sprite packing | Aseprite CLI `--sheet --data` | free-tex-packer(-core) for CLI; TexturePacker (commercial) |
| Level editor | **Tiled 1.12** (object layers where x = scroll position) | LDtk 1.5.3 (typed, great UX, slow release cadence); or TS/JSON timelines |
| Bitmap fonts | BMFont / Hiero / SnowB BMF → `.fnt` | Or grid font as sprites |
| Music | **Furnace** (emulates SNES/Genesis/YM2151 chips — ideal Konami/Taito sound) | OpenMPT, FamiStudio, BambooTracker |
| SFX | jsfxr / ChipTone / Bfxr | ZzFX |
| Monorepo | **pnpm 12 workspaces** + Turborepo 2.10 | Nx 23 (heavy), npm workspaces (slower) |

### 4.8 Desktop wrapper

| Option | Latest | Engine | Size | Gamepad | Steam |
|---|---|---|---|---|---|
| **Electron** | 44.3.0 (2026-09-08) | Bundled Chromium (same family as Tizen) | ~80–150 MB | Full; Deck pad = Xbox pad | **steamworks-ffi-node** 0.11.2 (active, no compile, overlay OK); steamworks.js 0.4.0 (stale since 2024) |
| Tauri 2 | 2.11.x | System webview — **WebKitGTK on Linux/Deck** | few MB | Weak on WebKitGTK; needs plugin | Rust crates, overlay harder |
| NW.js | 0.115.0 | Chromium | ~Electron | Good | greenworks / steamworks.js |
| Neutralinojs | 6.9.0 | System webview | tiny | Webview-dependent | Minimal |

**Recommendation: Electron** (`backgroundThrottling:false`, fixed 60 Hz step with accumulator for 120/144 Hz monitors). Tauri only if download size matters more than Linux/Deck fidelity.

### 4.9 Open-source projects worth studying

| Project | Why |
|---|---|
| [abagames/crisp-game-lib](https://github.com/abagames/crisp-game-lib) (TS, 646★) | By Kenta Cho (BulletML author) — tight arcade feel, pattern code |
| [deepnight/ld39-zeroVoltX](https://github.com/deepnight/ld39-zeroVoltX) | Polished 48-h shmup, game-feel techniques |
| [speedlazer/speedlazer](https://github.com/speedlazer/speedlazer) | Horizontal shmup with gamepad support |
| [christopheroussy/stg-game-engine](https://github.com/christopheroussy/stg-game-engine) | HTML5 STG engine + text level editor |
| [kako-jun/yatagarrage](https://github.com/kako-jun/yatagarrage) | Current PixiJS 8 + TS bullet-hell code |
| [daishihmr/bulletml.js](https://github.com/daishihmr/bulletml.js) | BulletML semantics |
| [taisei-project/taisei](https://github.com/taisei-project/taisei) (C) | Bullet systems at scale |
| [opentyrian/opentyrian](https://github.com/opentyrian/opentyrian) | Classic scrolling-shooter design |
| [INNBC-STARFIGHTER](https://github.com/InnovativeBioresearch/INNBC-STARFIGHTER) | JS shmup shipped on Steam via Electron |

### 4.10 UI framework (React / Vue / Svelte / Solid)? — **No, not in the game**

Note: **Vite is not a UI framework** — it's the build tool/dev server (and we *are* using it). React / Vue / Svelte / Solid are DOM UI frameworks; the question is whether the game uses one.

**Decision: the game uses no UI framework.** Everything — gameplay, HUD, menus, title, zone map, name entry — is drawn inside the single WebGL canvas with sprites + a bitmap pixel font.

Why:
| Reason | Detail |
|---|---|
| The game isn't DOM | 99% of the screen is a WebGL canvas redrawn 60×/s from sim state. A virtual DOM (React/Vue) has nothing to do there, and reconciling per frame would add allocation/GC churn — the #1 cause of TV frame hitches. |
| Retro look | SNES-style menus = pixel font + sprites at 384×216, scaled with the game. DOM text/CSS at 1080p would look out of place and not scale pixel-perfectly. |
| TV navigation | Menus are D-pad/remote/gamepad driven. The same InputManager that drives the ship drives menu focus — no separate DOM focus management (a notorious pain point on TV web apps). |
| Determinism & replays | Menus that affect the sim (weapon select, options) stay in the same state machine as the game. |
| Size / launch time | Tizen certification wants launch ≤ 10 s. React+ReactDOM ≈ 45 KB gz, Vue ≈ 35 KB gz — not huge, but pure dead weight here. |
| Old engine | Fewer moving parts to transpile/polyfill for Chromium 69. |

What we build instead (small, in `core`): a **scene stack** (Title, Options, Game, Pause…), a tiny **menu widget kit** drawn on canvas (list, slider, toggle, key-rebind prompt, 3-letter name entry) with focus driven by input actions, and a **bitmap-font text renderer**.

**Where a framework *is* fine:** separate, non-shipping **dev tools** in the monorepo — e.g. a debug inspector, stage/spawn-timeline editor, bullet-pattern previewer, or asset browser running in a desktop browser. For those, use whatever is fastest to build (Preact/Svelte/Vue/React — Svelte or Preact recommended for tiny, fast tools). Rule: **nothing in `packages/core` or `apps/tizen` imports a UI framework.**

Possible exception, later: if the Electron build wants a DOM-based launcher/settings window (resolution, Steam login), a small framework there is harmless.

---

## 5. Recommended stack (summary)

| Category | Primary | Alternative |
|---|---|---|
| Language | **TypeScript** (Tizen web app) | — |
| Target | **Tizen 5.5+ (Chromium 69)**, `chrome69` IIFE build | — |
| UI framework | **None** — canvas-drawn menus/HUD with bitmap font + scene stack | Svelte/Preact for dev tools only |
| Rendering | **PixiJS v8** as renderer only, WebGL1-capable, low-res RenderTexture → nearest upscale | Custom WebGL1 batcher (twgl.js) / Phaser 4 |
| Game loop | Custom fixed 60 Hz, deterministic, rAF-driven | — |
| Entities | SoA typed-array pools + pooled enemy classes | bitECS 0.4 |
| Collision | Custom circle/AABB/capsule + uniform grid + tile masks | check2d |
| Patterns/AI | TS generator coroutines + easing table + pattern DSL | bulletml.js (reference) |
| Audio | Custom Web Audio mixer; pre-decoded SFX; streamed OGG music | Howler.js; chiptune3 (2020+/desktop) |
| Input | Custom InputManager (keyboard + Gamepad + Tizen keys → action bitmask) | gamepad.js |
| Build/test | Vite 8 + TypeScript 7 + Vitest 5 | plugin-legacy |
| Art/levels | Aseprite (or Pixelorama) + free-tex-packer + Tiled | LDtk, TexturePacker |
| Music/SFX authoring | Furnace → OGG; jsfxr/ChipTone | OpenMPT; ZzFX |
| Repo | pnpm workspaces + Turborepo | Separate repos + Changesets |
| Desktop | Electron 44 + steamworks-ffi-node | NW.js; Tauri 2 |

---

## 6. Verify on our Tizen 5.5 displays in week one

1. WebGL2 exposure and `MAX_TEXTURE_SIZE`; Pixi v8 (`chrome69` build + `globalThis` polyfill) with `preferWebGLVersion: 1` and `2`. → **M7: WebGL2 yes, 8192, Mali-G51** (Pixi on WebGL2 not tried yet).
2. Bullet-count stress test (fill-rate & CPU headroom) — the 5.5 displays are our performance floor.
3. Viewport size (1920×1080 vs 1280×720) and rAF rate on 120 Hz / 50 Hz panels. → **M7: 1920×1080 @1, 60 Hz with heavy rAF jitter** (§2.7).
4. Input-to-photon latency with Game Mode on/off; effect of `use.game.mode` metadata.
5. Remote: key-repeat timing; can two keys be held at once? → **No; flagless repeats ≈ 355 ms / 108 ms, no fake pairs** (§2.3, §2.7).
6. Web Audio output latency, voice limits, OGG decode speed per engine version.
7. localStorage/IndexedDB persistence across app updates; store-app memory limit.
8. Whether a Tizen OS upgrade on an older set also upgrades its web engine (assume not).
9. chiptune3 (WASM + AudioWorklet) CPU cost vs streamed OGG on 5.5.
10. ~~Which input devices the displays accept~~ → **confirmed:** Bluetooth + USB gamepads and keyboards (mouse pairs but only works in the browser app, not ours). ~~Gamepad API `mapping === 'standard'` for our specific pads, button-press-to-activate behavior~~ → **DualShock 4: standard, all buttons** (2026-09-15). Still verify: simultaneous 2-pad co-op.
11. Input-to-photon latency with **no Game Mode available** for apps (240 fps phone video of the probe's flash box). → still open (only a 30 fps video so far).
12. ~~Confirm Chromium 69 via `navigator.userAgent`, and 1920×1080 via `innerWidth`~~ → **confirmed** (2026-09-15).

---

## 7. Sources

**Tizen:** [Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html) · [Tizen .NET TV](https://developer.samsung.com/smarttv/develop/tizen-net-tv.html) · [flutter-tizen limitations](https://github.com/flutter-tizen/flutter-tizen/wiki/Limitations) · [WASM on TV](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/webassembly.html) · [Remote control](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html) · [TVInputDevice API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvinputdevice-api.html) · [Gamepad](https://developer.samsung.com/smarttv/develop/guides/user-interaction/gamepad.html) · [Media specs](https://developer.samsung.com/smarttv/develop/specifications/media-specifications.html) · [Screen resolution](https://developer.samsung.com/smarttv/develop/guides/fundamentals/managing-screen-resolution.html) · [Memory FAQ (120 MB)](https://developer.samsung.com/smarttv/develop/faq/other-features.html) · [Mandatory checklist](https://developer.samsung.com/smarttv/develop/development-checklist/mandatory-features.html) · [Multitasking](https://developer.samsung.com/smarttv/develop/guides/fundamentals/multitasking.html) · [Terminating apps](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html) · [VS Code extension](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode-extension-new.html) · [CLI](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html) · [Certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html) · [Seller membership](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html) · [Tizen licensing 2025](https://news.samsung.com/global/samsung-expands-tizen-os-licensing-program-with-new-global-partners-and-enhanced-offerings) · [VS Code-focused Tizen dev](https://samsungtizenos.com/blog/tizen-development-environment-focused-on-vscode/)

**Libraries:** [PixiJS v8 launch](https://pixijs.com/blog/pixi-v8-launches) · [Pixi WebGL options](https://pixijs.download/release/docs/rendering.WebGLOptions.html) · [Phaser 4 renderer](https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games) · [Phaser SpriteGPULayer](https://phaser.io/news/2026/05/phaser4-spritegpulayer-performance) · [js-game-rendering-benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark) · [melonJS changelog](https://github.com/melonjs/melonJS/blob/master/packages/melonjs/CHANGELOG.md) · [bitECS 0.4](https://github.com/NateTheGreatt/bitECS/blob/main/docs/RELEASE_NOTES_0.4.0.md) · [chiptune3](https://github.com/DrSnuggles/chiptune) · [ZzFX](https://github.com/KilledByAPixel/ZzFX) · [check2d](https://github.com/nenjack/check2d) · [GSAP license](https://gsap.com/community/standard-license/) · [Vite build options](https://vite.dev/config/build-options) · [TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) · [Tauri webviews](https://v2.tauri.app/reference/webview-versions/) · [steamworks-ffi-node](https://github.com/ArtyProf/steamworks-ffi-node)
