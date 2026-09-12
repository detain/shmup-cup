# Player & tester documentation

| Page | Contents |
|---|---|
| [`preview-build.md`](preview-build.md) | The current game build: the loading bar and **free flight** (flying the KESTREL around an empty starfield with the remote, keyboard or gamepad, its gun firing on its own), plus the scrolling **Test Range** stage with its enemies and their bullets, the **power-ups** (capsules, taking them with OK, the Force Field and Mega Crash), the **fully powered** ship (laser, missiles, four Options, Force Field), the sprite showcase and the calibration screen in a browser — how to open it on the TV, in a browser and on the desktop, how the ship and its weapons should behave, what a correct picture looks like, which enemies shoot what and how many hits they take, the start-up error screen, what to report, troubleshooting |
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
caves, speeding up and slowing down, with star layers moving behind — and **enemies** come
at you: weaving pods, looping spinners, saucers, ground turrets, walkers, hatches releasing
small fighters. The turrets, walkers and lone spinners **shoot back** with aimed bullets,
three-way fans and rings, all dodgeable with the four arrow directions. **Your ship shoots
back**: its gun fires on its own on every device (no button needed — that is what makes the
TV remote enough), and the shots destroy the enemies, which flash white when hit and vanish
when destroyed. And the ship **powers up**: red saucers and
whole formations you wipe out leave blinking **power capsules**; each one you collect moves the
(not yet drawn) power meter one step, and **OK** on the remote (Enter or C on a keyboard) takes
the highlighted power-up — Speed Up, Missile, Double, Laser, Option, a Force Field that takes
five hits, or the screen-clearing Mega Crash ([preview-build.md](preview-build.md#power-ups)).
In a browser, `?loadout=full` starts fully powered — a piercing laser, missiles that slide along
the ground, four Options that follow the ship and copy its fire, and a Force Field
([preview-build.md](preview-build.md#your-weapons)). There are no explosions, sound or score
yet, and touching the rock, an enemy or a bullet does nothing yet (a bullet that touches the
ship just disappears — or wears the Force Field down). If a build is broken it shows a readable
error screen instead of a black one. The button layouts for the TV remote, keyboard and gamepad
are in [controls.md](controls.md). Next come lives, losing the ship, checkpoints and the score.
