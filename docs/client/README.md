# Player & tester documentation

| Page | Contents |
|---|---|
| [`preview-build.md`](preview-build.md) | The current game build: the loading bar and **free flight** (flying the KESTREL around an empty starfield with the remote, keyboard or gamepad), plus the scrolling **Test Range** stage, the sprite showcase and the calibration screen in a browser — how to open it on the TV, in a browser and on the desktop, how the ship should respond, what a correct picture looks like, the start-up error screen, what to report, troubleshooting |
| [`controls.md`](controls.md) | Default controls for the Samsung Smart Remote (primary), gamepads and keyboard, in the game and in menus; the control profiles, feeling the remote's limits on a desktop keyboard, controls troubleshooting |
| [`install-on-tv.md`](install-on-tv.md) | One-time Developer Mode + certificate setup, installing / starting / removing development builds (input probe and game preview) on the Samsung Smart Monitor M7 (Windows desktop), install troubleshooting |
| [`input-probe.md`](input-probe.md) | Tester guide for the **Input Probe** diagnostic app: screen tour, remote controls, the 9-step on-device test protocol, how to read the verdicts, measuring latency with a 240 fps camera, recording results, troubleshooting |

Planned pages, as the game takes shape:

- **Options** — audio, display (scale modes, screen shake, flashing), controls, difficulty.
- **Troubleshooting** — black screen, input lag (the M7 has no Game Mode for apps),
  audio issues.

The game is not playable yet, but the ship flies: every build starts into **free flight**,
where the KESTREL glides in from the left and then follows the TV remote's directional pad,
the arrow keys or a gamepad around an empty starfield, between the two HUD bars
([preview-build.md](preview-build.md)). In a browser the first **scrolling stage** can be
flown too (`?stage=test-range`): the view scrolls on its own over rocky ground and through
caves, speeding up and slowing down, with star layers moving behind. There are no enemies,
weapons or sound yet, and touching the rock does nothing yet. If a build is broken it shows a
readable error screen instead of a black one. The button layouts for the TV remote, keyboard
and gamepad are in [controls.md](controls.md). Next come enemies, then weapons.
