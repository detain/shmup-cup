# Shmup Cup on an LG webOS TV

> ## Nothing here has ever been run
>
> The project has **no LG TV, no LG developer account and no webOS SDK**. `apps/webos` was written
> from LG's published web-app contract and is covered only by unit tests with fakes: no build of it
> has been packaged, installed or launched, and `ares-package` / `ares-install` / `ares-launch`
> have never been executed. Everything below is the recipe, not a report. Expect to find things
> that need fixing on the first run, and treat them as new work, not as regressions.

The webOS app is the same game as the Samsung one, with a different manifest and a different Back
key. See [`apps/webos/README.md`](../../apps/webos/README.md) for what differs internally.

## What you need

- A webOS **5.0 or newer** TV (webOS 4 is Chromium 53 and is *not* a target).
- The **webOS TV SDK** (or just its CLI), which gives you `ares-setup-device`, `ares-package`,
  `ares-install`, `ares-launch` and `ares-inspect`.
- An LG developer account, and **Developer Mode** installed on the TV from the Content Store.
- The TV and the desktop on the same network.

## One-time setup

1. On the TV: Content Store → search **Developer Mode** → install → sign in with the LG developer
   account → **Dev Mode Status ON** → note the TV's IP address and the passphrase it shows.
2. On the desktop:
   ```sh
   ares-setup-device --add tv1 --info '{"host":"<tv-ip>","port":"9922","username":"prisoner"}'
   ares-novacom --device tv1 --getkey     # asks for the passphrase from the TV
   ares-setup-device --list               # tv1 should be listed
   ```
   Developer Mode stops after 50 hours unless you extend it in the app on the TV.

## Build, package, install, run

```sh
pnpm install
pnpm --filter @shmup/webos build            # dist/ + the bundle check
pnpm --filter @shmup/webos webos:package    # ares-package dist -o release   → release/<id>_<version>_all.ipk
WEBOS_DEVICE=tv1 pnpm --filter @shmup/webos webos:install
WEBOS_DEVICE=tv1 pnpm --filter @shmup/webos webos:run
```

`ARES_BIN=<path>` points the scripts at an SDK that is not on `PATH`. Inspect the running app with
`ares-inspect --device tv1 --app dev.shmupcup.game`, which opens a Chrome DevTools window against
the TV — the same debugging you get on Tizen through `sdb`.

## What to check on the device (plan §8.7)

These are the checks no agent can do. Work through them once the app launches at all:

- [ ] It launches to the title in **≤ 10 s**, the picture is 1920 × 1080 and crisp at ×5.
- [ ] **Back (461)** in a game opens the pause menu; Back on the pause menu resumes; Back in a menu
      goes back; Back on the title opens the exit confirmation and **YES really closes the app**
      (`webOS.platformBack()`). Nothing must pop the browser history behind the game —
      `appinfo.json` sets `disableBackHistoryAPI`.
- [ ] Every arrow moves the ship while held, OK equips, and **zone A is clearable with four
      directions only** (the Magic Remote's pointer is not used at all).
- [ ] Play/Pause (415 or 19) pauses.
- [ ] The Home bar over a running game: the game pauses, the music goes silent, and coming back
      does **not** fast-forward. Report which event the TV fires — `visibilitychange`, `blur`, or
      both — so `apps/webos/src/platform/index.ts` can say so instead of guessing.
- [ ] Options and hi-scores survive a relaunch and a reinstall of the same version.
- [ ] OPTIONS → CONTROLS offers **exactly one** remote profile, `REMOTE (DEFAULT)` — if the Tizen
      one appears too, the `hosts` filter is not reaching this build and Back can be lost.
- [ ] A USB or Bluetooth gamepad works after one button press.
- [ ] 15 minutes of play: no visible hitches, memory under 100 MB in the inspector.
- [ ] Uninstalling the app removes its `localStorage` (the save).

Write what you find into [`docs/dev/input-probe-results.md`](../dev/input-probe-results.md) the way
the Samsung run is written up, and open a follow-up step for anything the adapter got wrong.

## Publishing

Not attempted, not scripted. The LG Content Store has its own seller account, its own review and
its own asset sizes; nothing in this repo talks to it. Start from LG's developer site once the app
runs correctly on a real set.
