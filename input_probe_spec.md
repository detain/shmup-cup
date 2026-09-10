# Input Probe — spec (first spike)

> A throwaway diagnostic Tizen web app (`.wgt`) to learn exactly how our **Samsung Smart Monitor M7 (M70A, Tizen 5.5)**
> and its **Smart Remote** behave, before we design the game's controls. The remote is our **primary controller**
> (see `shmup_feat.md` §4 "Remote-first control design"). Build & deploy from the **Windows desktop** (same LAN as the
> monitors, holds the Samsung certificate profile).

## Questions it must answer

| # | Question | Why it matters |
|---|---|---|
| 1 | Can two arrows be held at once (diagonals)? | 8-way vs 4-way movement design |
| 2 | Can OK be pressed while an arrow is held — does the arrow stay held, or get released? | Whether OK can be used mid-movement |
| 3 | Holding a key: clean `keydown(repeat)…keyup`, repeated `keydown` without the `repeat` flag, or **fake `keyup`/`keydown` pairs**? Repeat delay & interval? | Key-state tracking / release debounce |
| 4 | Which extra keys can be registered & actually arrive (Ch±, Play/Pause, Vol±, color keys via on-screen pad…)? | Button mapping |
| 5 | Event dispatch delay and input-to-photon latency (no Game Mode for apps on the M7) | Latency budget |
| 6 | Gamepad API: ids, `mapping`, button indices, activation-on-first-press, 2 pads at once | Gamepad support / co-op |
| 7 | Environment: `userAgent` (Chromium 69?), `innerWidth/innerHeight/devicePixelRatio` (1920×1080?), WebGL1/WebGL2 + `MAX_TEXTURE_SIZE` + renderer string, WebAssembly, AudioWorklet, OffscreenCanvas, AudioContext `sampleRate`/`baseLatency`, Tizen platform version, `webapis.productinfo` model/firmware | Confirms target assumptions |
| 8 | rAF rate & frame-time stability (hitches > 20 ms) | Loop design, perf floor |
| 9 | Lifecycle: `visibilitychange` / `blur` when pressing Home and returning | Pause/resume handling |

## Screen (single 1920×1080 stage, scaled to window; no navigation needed — all panels visible at once)

- **Header:** title, key env facts, "Back ×3 quickly = exit", report status.
- **Left — Event log:** last ~28 events: `t(ms) DOWN/UP name(code) repeat=… Δ since last`, plus info lines (visibility, blur, gamepad connect, register results). Also `console.log` every event (for Chrome DevTools remote inspector).
- **Center — Arena canvas (Canvas2D):**
  - **Three ships in three lanes**, all driven by the same input, to *see* the difference between handling strategies:
    - **A — raw state:** held = between `keydown` and `keyup` (ignore repeats).
    - **B — debounced:** held, or released < 3 frames (~50 ms) ago (hides fake keyup/keydown pairs).
    - **C — naive:** moves a fixed step on every `keydown` event incl. repeats (what "menu-style" handling feels like).
    - Ships move 4 px/frame, wrap around, leave a short trail; two arrows held ⇒ diagonal movement (instantly shows if diagonals work).
  - **Timeline strips** (last 240 frames) per ship: moving vs not moving — stutter shows up as gaps.
  - **Frame-time graph** (last 240 rAF deltas, 16.7 ms and 33 ms guide lines).
  - **Flash box:** turns white for 4 frames on every non-repeat keydown (shows key name) — film with a 240 fps phone camera to measure thumb-press → light latency.
- **Right — Verdicts & stats:**
  - Diagonals: YES / NO ("second arrow replaces the first" = arrow A keyup + arrow B keydown within 60 ms) / not tested.
  - OK while arrow held: arrow kept / arrow dropped (arrow keyup within 60 ms of OK keydown) / not tested.
  - Key repeat style: clean (repeat flag) / keydown-without-flag / fake keyup-keydown pairs (gap < 60 ms) / not observed; repeat delay (avg ms), interval (avg ms ⇒ Hz); bounce count & min/avg gap.
  - Max keys held simultaneously; longest hold.
  - Event dispatch delay (`performance.now() - event.timeStamp`, avg/max).
  - Frame rate (median ⇒ Hz, p95, max, hitch count).
  - Seen-keys table (name, code, downs, ups).
  - `getSupportedKeys()` list + per-key `registerKey` result (register everything supported **except `Exit`**; note: registering Vol± takes volume control away while the probe runs).
  - Gamepads: index, id, mapping, pressed buttons, axes (edge-logged to the event log as `GP0 b3 down`).
  - Environment block (question 7).
- **Test checklist** (auto-ticks when detected): tapped all 4 arrows · tapped OK & Back · held a key ≥ 1.5 s · tried a diagonal · pressed OK while holding an arrow · pressed an extra key · gamepad seen · left (Home) and returned.
- **Play/Pause** = reset hold/repeat stats (still logged). Keyboard `R` does the same in a browser.

## Behavior details

- `keydown`/`keyup` listeners on `window` (capture). `preventDefault()` for arrows/Enter/Back/space (and all keys when `window.tizen` exists) — but not browser dev shortcuts.
- Key names: static map (13 OK, 37–40 arrows, 10009 Back, 10182 Exit, 10252 PlayPause, 427/428 Ch±, 447–449 Vol/Mute, 403–406 colors, 412/413/415/417/19 media, 457 Info, 48–57 digits) merged with `tizen.tvinputdevice.getSupportedKeys()` names at runtime; fallback `event.key`.
- `blur` ⇒ clear held keys (log it). `visibilitychange` ⇒ log hidden/visible.
- **Exit:** Back pressed 3× within 1.5 s ⇒ `tizen.application.getCurrentApplication().exit()` (long-press Back / Home also leave via the system).
- Load `$WEBAPIS/webapis/webapis.js` (Samsung product-info APIs); tolerate its absence in a desktop browser.
- DOM panels update at ~10 Hz; canvas at every rAF. Keep per-frame allocations low (it's also a perf probe).
- **Optional remote logging:** if built with `VITE_REPORT_URL=http://<desktop-ip>:8787`, POST `{session, seq, env, verdicts, stats, newEvents}` every 3 s (Content-Type `text/plain` to avoid CORS preflight) to a tiny dependency-free Node `log-server.mjs` that appends JSONL per session and prints summaries. Lets us read results on the PC instead of squinting at the TV.

## Project shape

```
tools/input-probe/
  package.json          # scripts: dev, build, typecheck, package, deploy, log-server
  tsconfig.json         # strict, target ES2018, moduleResolution bundler
  vite.config.ts        # base './', build.target 'chrome69', single IIFE app.js, strip type="module"
  index.html
  public/config.xml     # Tizen widget config (below), public/icon.png
  src/                  # main.ts, keys.ts, keyTracker.ts, arena.ts, gamepad.ts, env.ts, tizen.d.ts, report.ts, ui.ts, style.css
  scripts/package.mjs   # cross-platform (Windows!) wrapper: build → `tizen package -t wgt -s $TIZEN_PROFILE -- dist`
  scripts/deploy.mjs    # `sdb connect $TV_IP` → `tizen install -n InputProbe.wgt -s <serial> -- dist` → `tizen run -p ShmpCpIPrb.InputProbe -s <serial>`
  server/log-server.mjs # optional JSONL log receiver (no deps)
  README.md             # build/deploy steps (Windows + Linux) and the on-device test protocol
```

`config.xml` essentials:
```xml
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://shmupcup.dev/InputProbe" version="0.1.0" viewmodes="maximized">
  <tizen:application id="ShmpCpIPrb.InputProbe" package="ShmpCpIPrb" required_version="2.3"/>
  <content src="index.html"/>
  <icon src="icon.png"/>
  <name>InputProbe</name>
  <access origin="*" subdomains="true"/>
  <tizen:privilege name="http://tizen.org/privilege/internet"/>
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
  <tizen:privilege name="http://developer.samsung.com/privilege/productinfo"/>
  <tizen:profile name="tv-samsung"/>
  <tizen:setting screen-orientation="landscape" context-menu="enable" background-support="disable"
                 encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
```

## On-device test protocol (also shown in the app)

1. Tap each arrow, OK and Back once.
2. Hold → for 3 s; release. Repeat with ↑.
3. Hold →, then also press ↑ (diagonal attempt).
4. Hold →, then tap OK (chord attempt).
5. Press every other remote button: Play/Pause, Ch±, Vol±, Color/Number pad keys.
6. Film the flash box with a 240 fps phone camera while tapping OK ~10 times (count frames from press to flash).
7. Pair a gamepad (and a second one) and press buttons / move sticks.
8. Press Home, then return to the app.
9. Record the Verdicts panel (photo) or collect the JSONL log from the log server.

Results go into `shmup_tech.md` §2.7 and drive the final remote control scheme in `shmup_feat.md` §4.
