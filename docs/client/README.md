# Player & tester documentation

| Page | Contents |
|---|---|
| [`preview-build.md`](preview-build.md) | The current game build: the loading bar, the animated **sprite showcase** (and the calibration screen in a browser) — how to open it on the TV, in a browser and on the desktop, what a correct picture looks like, the start-up error screen, what to report, troubleshooting |
| [`controls.md`](controls.md) | Default controls for the Samsung Smart Remote (primary), gamepads and keyboard, in the game and in menus; the control profiles, feeling the remote's limits on a desktop keyboard, controls troubleshooting |
| [`install-on-tv.md`](install-on-tv.md) | One-time Developer Mode + certificate setup, installing / starting / removing development builds (input probe and game preview) on the Samsung Smart Monitor M7 (Windows desktop), install troubleshooting |
| [`input-probe.md`](input-probe.md) | Tester guide for the **Input Probe** diagnostic app: screen tour, remote controls, the 9-step on-device test protocol, how to read the verdicts, measuring latency with a 240 fps camera, recording results, troubleshooting |

Planned pages, as the game takes shape:

- **Options** — audio, display (scale modes, screen shake, flashing), controls, difficulty.
- **Troubleshooting** — black screen, input lag (the M7 has no Game Mode for apps),
  audio issues.

The game is not playable yet: it starts into an animated **sprite showcase** that draws the
placeholder graphics — the KESTREL ship, its Options, enemies, bullets, the HUD bars and the
pixel font — the way the game will ([preview-build.md](preview-build.md)). If a build is
broken it shows a readable error screen instead of a black one. Behind the scenes the engine
foundations and the first game data (the KESTREL ship and its weapons) are in place, and so
are the controls — the TV remote, keyboard and gamepad layouts ([controls.md](controls.md));
the ship becomes controllable in the next step.
