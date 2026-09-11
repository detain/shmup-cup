# Installing development builds on a Samsung Smart Monitor / TV

Shmup Cup builds are not in the Samsung store. During development they are installed ("side-loaded") from the
Windows desktop that sits on the same network as the monitors. This page covers the one-time setup of a
monitor and the PC, and how to install, start and remove an app. Today the only installable app is the
**Input Probe** ([input-probe.md](input-probe.md)); the game will use the same flow.

Test hardware: 2× Samsung Smart Monitor M7 43" (LS43AM702UNXZA / M70A, Tizen 5.5).

## One-time setup

### 1. On the PC

- **Git** and **Node.js 24** (22.12+ also works; 20.19 is enough to build and deploy but not to run the tests).
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

## Removing an app

Remove it from the monitor's Apps panel like any other app (highlight it and use its options menu), or with the
Device Manager in Tizen Studio. Installing a newer build over an existing one does not require removing it first —
unless it was signed with a *different* author certificate (see below).

## Troubleshooting

| Message / symptom | Cause and fix |
|---|---|
| `Tizen CLI not found` | Tizen Studio / the VS Code SDK is not installed where the scripts look. Set `TIZEN_CLI` to the full path of `tizen.bat`, e.g. `C:\tizen-studio\tools\ide\bin\tizen.bat` |
| `no certificate profile` | Set `TIZEN_PROFILE` to the profile name. List the profiles with `tizen security-profiles list` |
| `sdb connect failed` | Monitor off or on another network; Developer Mode not pointing at **this** PC's IP; monitor not restarted after enabling Developer Mode; or another PC holds the connection |
| `install failed` | The distributor certificate does not include this monitor's DUID (re-create the certificate with both DUIDs), or an older build signed with a different author certificate is installed (remove it on the monitor first) |
| App installed but not visible | Look at the end of the Apps list; start it once with `npm run deploy` (it launches the app) |
| Worked before, now `sdb connect` fails | Check that Developer Mode is still on and the Host PC IP still matches the PC (it changes if the PC gets a new DHCP address) — repeat step 2 on the monitor |
