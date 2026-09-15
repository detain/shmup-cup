# Installing development builds on a Samsung Smart Monitor / TV

Shmup Cup builds are not in the Samsung store. During development they are installed ("side-loaded") from the
Windows desktop that sits on the same network as the monitors. This page covers the one-time setup of a
monitor and the PC, and how to install, start and remove an app. Two apps can be installed today: the
**Input Probe** ([input-probe.md](input-probe.md)) and the **game preview**, in which you fly the KESTREL ship
around an empty starfield with the remote ([preview-build.md](preview-build.md)). Both use the same one-time
setup.

Test hardware: 2× Samsung Smart Monitor M7 43" (LS43AM702UNXZA / M70A, Tizen 5.5).

## One-time setup

### 1. On the PC

- **Git** and **Node.js 24** (24.15+). The input probe alone also runs on 22.12+ (20.19 is enough to build and
  deploy it but not to run its tests); the game itself needs Node 24.
- **Tizen Studio** with the TV extensions, **or** **VS Code** with the **Samsung Tizen extension** and its SDK. Either
  one provides the `tizen` command (`tizen.bat` on Windows) and `sdb`.
- A **Samsung certificate profile**, created in *Tools → Certificate Manager* (Tizen Studio) or
  *Tizen: Certificate Manager* (VS Code). Choose the **Samsung** certificate type for **TV**, sign in with a Samsung
  account, and make sure the **distributor certificate lists the DUID of every monitor** you want to install on
  (the wizard can read the DUID of a monitor that is currently connected with `sdb`/Device Manager). Remember the
  profile's name — the scripts need it as `TIZEN_PROFILE`.
- Note the PC's LAN IP address (`ipconfig` in a Command Prompt → *IPv4 Address*).

### 2. On each monitor

1. Open the **Apps** panel.
2. Type **1 2 3 4 5**. The Smart Remote has no number keys: open the on-screen **Color/Number** pad (or use the
   SmartThings app's virtual remote) to type them.
3. In the *Developer mode* dialog switch **Developer mode: On** and enter the PC's IP as **Host PC IP**.
4. **Restart the monitor** (switch it fully off and on).
5. Note the monitor's own IP: *Settings → General → Network → Network Status → IP Settings*.

Also recommended on the test monitors: turn **Auto Source Switch+** off, so a waking PC does not switch the
monitor to HDMI / USB-C in the middle of a test.

## Installing and starting an app

From the app's folder on the PC (for the probe: `tools\input-probe`):

```bat
npm install
set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50,192.168.1.51
npm run package
npm run deploy
```

`npm run deploy` connects to each monitor, installs the package and starts it. Full details (PowerShell, Linux,
options, the VS Code extension route): [`tools/input-probe/README.md`](../../tools/input-probe/README.md).

After installation the app stays in the monitor's **Apps** panel and can be started from there without the PC.

## Installing the game preview

The game lives in the main part of the repository, which uses **pnpm** instead of npm and needs a slightly
newer Node.js: **Node 24.15+** (Node 22 is not supported) and **pnpm 12** (`npm i -g pnpm@latest`; `pnpm -v` must print 12.x).
From the repository root, in a Command Prompt:

```bat
set ELECTRON_SKIP_BINARY_DOWNLOAD=1
pnpm install
pnpm --filter @shmup/tizen build

set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

- `ELECTRON_SKIP_BINARY_DOWNLOAD=1` skips the desktop (Electron) download, which the TV does not need.
- `build` creates `apps\tizen\dist`; `tizen:package` signs it into a `.wgt` in the same folder.
- `tizen:install` and `tizen:run` handle **one monitor per run**: for the second monitor change `TV_IP` and run
  those two commands again. (The input probe's `deploy` accepts a comma-separated list; the game scripts do not.)
- After every new `build`, run `tizen:package` again before installing.
- PowerShell: `$env:TIZEN_PROFILE = "shmupcup"; $env:TV_IP = "192.168.1.50"` instead of `set`.

The app appears in the Apps panel as **Shmup Cup** and opens on the title screen. To leave it, press **Back** on
the title and answer **YES** to **EXIT SHMUP CUP?** (in a game, Back pauses first — choose QUIT TO TITLE), or press
**Home**. What it should look like: [preview-build.md](preview-build.md).
If it opens on a navy screen with a pink error title instead, the build is broken — photograph the screen, press
**Back** to close the app, and see [preview-build.md](preview-build.md#when-the-app-shows-an-error-screen).
More options (custom `tizen`/`sdb` paths): [`apps/tizen/README.md`](../../apps/tizen/README.md).

**Saved settings and high scores.** The game keeps its Options (volumes, the control profile) and
its high scores on the monitor itself, inside the app's own storage. Installing a newer build over
the old one should keep them (the app stays the same app) — please report it if an update loses
them. **Removing the app deletes them** (the TV does that for every app), so the next install starts
with the default settings and no high scores. Each monitor keeps its own.

**The debug build (developer tools).** For the on-device checks of a milestone, build with
`build:dev` instead of `build` and package and install as above:

```bat
pnpm --filter @shmup/tizen build:dev
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

It is the same app (it replaces the normal build and keeps its saved data) and plays the same,
but Play/Pause followed by Channel up three times opens a measuring panel and the developer
tools — see [debug-tools.md](debug-tools.md). Build with plain `build` again before handing the
game to anyone else.

## Removing an app

Remove it from the monitor's Apps panel like any other app (highlight it and use its options menu), or with the
Device Manager in Tizen Studio. Installing a newer build over an existing one does not require removing it first —
unless it was signed with a *different* author certificate (see below). Removing the game preview also deletes its
saved settings and high scores.

## Troubleshooting

| Message / symptom | Cause and fix |
|---|---|
| `Tizen CLI not found` | Tizen Studio / the VS Code SDK is not installed where the scripts look. Set `TIZEN_CLI` to the full path of `tizen.bat`, e.g. `C:\tizen-studio\tools\ide\bin\tizen.bat` |
| `no certificate profile` | Set `TIZEN_PROFILE` to the profile name. List the profiles with `tizen security-profiles list` |
| `sdb connect failed` | Monitor off or on another network; Developer Mode not pointing at **this** PC's IP; monitor not restarted after enabling Developer Mode; or another PC holds the connection |
| `install failed` | The distributor certificate does not include this monitor's DUID (re-create the certificate with both DUIDs), or an older build signed with a different author certificate is installed (remove it on the monitor first) |
| App installed but not visible | Look at the end of the Apps list; start it once with `npm run deploy` (it launches the app) |
| Worked before, now `sdb connect` fails | Check that Developer Mode is still on and the Host PC IP still matches the PC (it changes if the PC gets a new DHCP address) — repeat step 2 on the monitor |
| Game preview: `ERR_PNPM_BROKEN_LOCKFILE` during `pnpm install` | An old pnpm is being used. `pnpm -v` must print 12.x — run `npm i -g pnpm@latest` and open a new Command Prompt |
| Game preview: `Missing environment variable TIZEN_PROFILE` | `set TIZEN_PROFILE=<profile name>` in the same Command Prompt before `tizen:package` |
| Game preview: `apps/tizen/dist is missing` | Run `pnpm --filter @shmup/tizen build` first |
| Game preview: `No .wgt found` | Run `tizen:package` after the build (a new build removes the old `.wgt`) |
| Game preview: Play/Pause + Ch ▲ ×3 opens nothing | The installed widget is a normal build — build with `pnpm --filter @shmup/tizen build:dev`, package and install again ([debug-tools.md](debug-tools.md)) |
| Game preview: Play/Pause + Ch ▲ ×3 opens the developer panel on what should be a normal build | `apps\tizen\dist` came from `build:dev` or from a developer's `pnpm test:e2e` (which leaves a test build there) — run `pnpm --filter @shmup/tizen build`, then package and install again |
