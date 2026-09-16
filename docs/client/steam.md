# Shmup Cup on Steam (and the Steam Deck)

> ## Nothing here has touched Steam
>
> The project has **no Steam partner account and no app id**, and `steamworks-ffi-node` is
> deliberately **not a dependency** of this repo. `apps/electron/src/main/steam.ts` is written and
> tested against fakes; it has never initialised a real Steam client, unlocked a real achievement
> or written a real cloud file. No build has been uploaded, and no Steam Deck has run the game.
> Everything below is the recipe and the list of what only you can do.

## What ships today

The desktop build (`@shmup/electron`) runs the browser build in a fullscreen `BrowserWindow` with
file-based saves. `main/steam.ts` adds an **optional** layer on top:

- **Achievements** are derived from the save document after every write
  (`STEAM_ACHIEVEMENTS`, `achievementsFor`), so no game code knows about Steam. An assisted run
  (god mode, the speed or invincibility assist, a secret code) never earns one — the same rule the
  hi-score tables use for their asterisk.
- **Steam Cloud** wraps the file store (`createCloudStore`): a write goes to disk first and is then
  mirrored to the cloud; a read that finds nothing locally restores the cloud copy and writes it
  back. Local disk stays the source of truth, so a Steam outage cannot lose a save.

Without a binding, `initSteam()` reports `available: false` and both wrappers are the identity —
which is what every build this repo produces does.

## The achievements

| API name | Earned by |
|---|---|
| `FIRST_LAUNCH` | Starting a game |
| `FIRST_ZONE` | Clearing a zone |
| `FIVE_ZONES` | Clearing five zones — a whole route |
| `EXTRA_EDIT` | Unlocking EXTRA EDIT |
| `SECOND_LOOP` | Unlocking the second loop |
| `MANTA_PILOT` | Posting a score with the MANTA |
| `BOSS_RUSH` | Posting a score in BOSS RUSH |
| `CARAVAN` | Posting a score in CARAVAN |
| `ARCADE` | Posting a score in ARCADE mode |
| `MILLION` | 1,000,000 points without an assist |
| `ARCADE_DIFFICULTY` | A score on the ARCADE difficulty without an assist |

The names are the **API names** the Steamworks partner site asks for. They must exist there,
spelled exactly like this, before a build is uploaded; renaming one later orphans everybody's
unlock. `apps/electron/test/main/steam.test.ts` pins the list and every rule.

## What only you can do

1. **A Steam partner account** and an **app id**. Until then the code falls back to Valve's public
   *Spacewar* test id (480) — a placeholder, not an allocation. Shipping with it would publish the
   game under Valve's test app.
2. **Create the achievements** in the partner site with the API names above, their display names
   and icons, and publish them to the live branch.
3. **Add the binding.** This repo may not add a dependency the plan does not name, so the Steam
   build supplies its own loader:
   ```ts
   // in a Steam build's main process
   const steam = initSteam({
     appId: <your app id>,
     load: (appId) => require('steamworks-ffi-node').init(appId) as SteamworksApi,
   });
   ```
   `SHMUP_STEAM_APP_ID` overrides the id from the environment; a process Steam itself launched
   already carries `SteamAppId`.
4. **Turn Steam Cloud on** in the partner site with a quota large enough for the save (a few tens
   of kilobytes) and map `save.v1.json` and `window.json`.
5. **Build and upload** with electron-builder (`pnpm --filter @shmup/electron package`, which uses
   `pnpm dlx electron-builder` — it is not a dependency either) and Valve's `steamcmd` / SteamPipe.
   Neither has been run from here.

## Steam Deck verification (plan §8.8)

The Deck reports its controls to the Gamepad API as a standard Xbox pad, so no Steam Input code is
needed to *play*. What still has to be checked on a Deck:

- [ ] The Linux build (`AppImage` and `tar.gz` are configured in `electron-builder.json`) launches
      in Game Mode and in Desktop Mode.
- [ ] The pad drives every menu and the game; the analogue stick's deadzone feels right at the
      game's fixed speeds; the Deck's back buttons do nothing unexpected.
- [ ] 1280 × 800 is not 16:9 — check the integer-scale, fit and stretch modes and the ULTRA-WIDE /
      CLASSIC 4:3 aspect options, and pick a sensible default for the Deck.
- [ ] 60 Hz and the Deck's 40 Hz mode both look right (the loop is fixed-step with interpolation
      since M2-08).
- [ ] Suspend / resume: the game pauses, audio suspends, nothing fast-forwards on return.
- [ ] Battery and heat over 30 minutes; frame timing in the Deck's own overlay.
- [ ] Steam Cloud syncs a save between the Deck and a desktop.
- [ ] The text is readable at 7 inches — the HUD is 6-px glyphs at ×5 on a 1080p panel, less here.
- [ ] Then submit for **Deck Verified** review.
