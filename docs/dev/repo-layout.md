# Repository layout

Shmup Cup is a **pnpm workspace monorepo** orchestrated by **Turborepo**
(`shmup_tech.md` §3.1). Workspace members are `packages/*` and `apps/*` only — `tools/*`
holds standalone npm projects (own lockfile) and is deliberately outside the workspace.

Every workspace project has the same shape: `package.json`, `tsconfig.json` (runtime
sources), `README.md`, `src/` and a **separate `test/`** folder (tests never sit next to
sources). Each planned system is a directory `src/<module>/index.ts` whose docblock states
its responsibility, the spec sections it implements and its intended public API, and which
exports a `moduleInfo` descriptor (`status: 'placeholder' | 'partial' | 'implemented'`).
`test/<module>/` mirrors it with at least a smoke test.

## Annotated tree

```text
shmup-cup/
├── package.json            root scripts (dev/build/typecheck/lint/test/format/clean), packageManager pnpm@12, engines/devEngines (Node floor)
├── pnpm-workspace.yaml     members packages/* + apps/* (NOT tools/*), version catalog, allowed build scripts
├── pnpm-lock.yaml          committed; CI installs with --frozen-lockfile
├── turbo.json              task graph: build, build:test, build:dev (^build + //#assets → dist/**), typecheck/lint/test (via "transit"), dev, clean, root tasks; globalDependencies incl. content/** types/** assets/source/**
├── tsconfig.base.json      strict compiler options shared by everything (ES2018 target/lib, NodeNext, @shmup/source)
├── tsconfig.tooling.json   Node-side base (tests, Vite/Vitest configs): ES2023 + DOM + node types, noEmit, allowJs (JSDoc-typed scripts/*.mjs)
├── tsconfig.json           type-checks repo-root tooling files
├── eslint.config.js        flat config: typescript-eslint (type-aware), compat (chrome >= 69), jsdoc, core purity rules
├── vite.shared.ts          @shmup/source resolve conditions shared by Vite + Vitest; shmupContent() → virtual:shmup-content; shmupAssets() → virtual:shmup-assets + dist/assets/atlas/; shmupBuildInfo() → __SHMUP_DEV__ / __SHMUP_BUILD__ (M1-19)
├── vitest.shared.ts        defineShmupProject(): per-project Vitest defaults (tests in test/, Node env, optional worker execArgv such as ALLOCATION_GUARD_EXEC_ARGV)
├── vitest.config.ts        Vitest *projects*: packages/*, apps/*, test — one process, one worker pool, longest file first (→ `pnpm test` / `pnpm test:all`)
├── .browserslistrc         chrome >= 69 (Tizen 5.5) for eslint-plugin-compat
├── .editorconfig  .prettierrc.json  .prettierignore  .nvmrc (Node 24)  .gitignore
├── .github/workflows/ci.yml   parallel jobs, each installing (frozen): format + lint, typecheck, test ×3 shards (golden replays), build (Tizen budgets) + bench, e2e ×5 shards (Playwright Chromium → pnpm test:e2e --project=chromium on the test builds), e2e-firefox (the cross-engine determinism spec — M2-18), input probe; ELECTRON_SKIP_BINARY_DOWNLOAD=1
│
├── packages/               reusable libraries (the "engine + game")
│   ├── core/               @shmup/core — PURE TS: no DOM/WebGL/audio/Node/platform APIs, no clocks, no Math.random
│   │   ├── src/
│   │   │   ├── index.ts        public API (implemented parts only)
│   │   │   ├── module-info.ts  ModuleInfo / defineModule
│   │   │   ├── platform/       ✔ Platform interface (tech §3.2), headless platform, memory storage
│   │   │   ├── input/          ✔ Action bits, InputSnapshot, edge latching (feat §4)
│   │   │   ├── config/         ✔ GameConfig + defaults + validation; difficulty presets (DEFAULT_DIFFICULTY_TABLE, withDifficulty — M2-01); the ship choice (shipId, powerUpMode 'direct', withShip — M2-05); UserOptions (volumes, input profile — M1-17; display: bullet palette — M2-02, scale mode / shake / flashing / hitbox — M2-08; controls — autofire mode & rate, SOCD, debounce, the rebinding BindingOverrides — and the game options UserGameOptions, folded into the next games' configs by withUserGameOptions; the autofire modes — M2-16)
│   │   │   ├── loop/           ✔ fixed-step accumulator (snap, cap, reset)
│   │   │   ├── game/           ✔ createGame(): composition root, suspend/resume; bare gameplay (one World) or the scene flow (options.scenes, M1-16)
│   │   │   ├── world/          ✔ createWorld / stepWorld: session state + the fixed 9-phase tick pipeline (plan §3.2), pool registry, view
│   │   │   ├── presentation/   ✔ IRenderer / IAudio contracts + the render contract (RenderFrame, WorldView, SpriteBatchView, DrawList, LayerId; StageEffectsView / RasterKind / ColorCycleView and HitboxView — M2-08)
│   │   │   ├── rng/ math/ events/ pools/                 ✔ engine foundations (sfc32, trig tables, event ring, SoA pools)
│   │   │   ├── data/           ✔ (partial) content loader: schema.ts combinators, loadContent(), ContentDb, migrations, tilemap.ts (tileset tables, heightfield / RLE expansion), paths.ts (spline → arc-length tables); kinds incl. rules (difficulty, scoring) and patterns (M2-02); Direct-mode families, ship mode, stage directItems (M2-05); destructible tiles, holds / diagonal pans, branches, trigger / block events, the ballistic mover (M2-07); stage raster effects and palette cycles (M2-08); the replay kind (the attract demos) and the campaign's story (M2-15); the strings kind (the UI string tables — M2-16); stage remixes and minLoop / maxLoop, stageForLoop, the weapons' extra flag, the milking cap's rules (M3-01)
│   │   │   ├── player/         ✔ ship movement (KESTREL, MANTA — the config's shipId since M2-05), speed levels, clamp, banking, fly-in, life cycle (killPlayer / respawnPlayer / playerOut)
│   │   │   ├── weapons/        ✔ player shots (96-slot SoA pool), the meter arsenal Types A–D + Weapon Edit from the config (resolveArsenal, setArsenal — M2-03), loadouts, autofire (always / toggle / hold — M2-16) + caps per shooter, grid hits; the Direct-mode shot families (direct roles, level volleys, applyDirectLoadout — M2-05); the Extra Edit behaviours (Control / Upper missiles, Hawk Wind, the Spread Gun and its second equip, flip-mirrored art — M3-01)
│   │   │   ├── options/        ✔ Options: the screen-space trail ring buffer and, since M2-04, the Snake (pulled chain), Formation (> / V) and Rotate (orbit) types with spread / extend (steer)
│   │   │   ├── powerups/       ✔ 7-slot power meter, equip on the PowerUp edge, Auto Power-Up, capsule pool + magnet, Mega Crash, the blue capsule and freed Options (M2-04); Direct mode: the stage's item plan, six drifting colour items, the Speed toggle, the Direct death penalty (M2-05)
│   │   │   ├── shields/        ✔ the meter shields on every ship: Force Field, Reduce (hurtbox steps), front / Free / Rotate Shield pods (M2-04) — hits, shield-hit i-frames, wear, never terrain; the Direct-mode Arm (green / silver / gold tiers, absorbs terrain — M2-05)
│   │   │   ├── enemies/        ✔ (partial) 64 enemy slots: spawns, formations, off-screen rules, contact (shield pods too), damage, sprite mirror; the Option Hunter's rules and the blue capsule's on-screen clear (M2-04); Ballistic landings, destroy, death behaviours, the stage-gimmick script calls (M2-07); the proximity wake sleepUntilNear (M2-14)
│   │   │   ├── patterns/       ✔ sleeping behaviour coroutines (runner) + per-tick movers (Ballistic — M2-07) + fire primitives + the BulletML-inspired pattern DSL (dsl.ts: expression + pattern compiler → one Float64Array bank; PatternVm interpreter: enemy emitters, bullets' own programs — M2-02)
│   │   │   ├── behaviors/      ✔ behaviour registry referenced by content script ids; the M1 roster, pattern.loop (M2-02), hunter.option (M2-04), cube.pincer (M2-05), the stage gimmicks rock.fall / bubble.split / volcano.lob / field.suction / tentacle.grab / cube.stack (M2-07), the captains captain.ram / launcher / circler / crab and the raid turrets' boss.raid (M2-09); zones B and C's rocket.homing / worm.burst and bosses boss.maw / boss.widow (M2-11); zone E's rear.swoop and the zone D / E bosses boss.bastion / boss.steed (M2-12); zone F's cell.chase and the zone F / G bosses boss.squid / boss.facet (M2-13); zone H's emitter.laser, zone I's mine.burst and the final bosses boss.sovereign / boss.ark / boss.angler (M2-14)
│   │   │   ├── bullets/        ✔ enemy bullets (512-slot SoA pool = the ENEMY_BULLETS batch) + telegraphed lasers, bending lasers (8 × 64-node rings, circle-chain hitbox — M2-02), player collision, cancel (sparkles, or point items that fly to the score — M2-02); kinds.ts = the kind names (leaf)
│   │   │   ├── bosses/         ✔ multi-part bosses: weak points, phases, the WARNING, the death sequence; four boss slots, turned parts, captains, raids (StageRunner.follow), double / inner bosses, timers and escapes, the HP bar's model, boss rush (M2-09); the spiral stream BossScriptApi.spiral (M2-14)
│   │   │   ├── collision/      ✔ scalar shape tests, layer masks, counting-sort uniform grid, pixel-exact terrain queries; moving blocks (TerrainBlocks) and destructible tiles (DestructibleTerrain: damage, regrowth, rollback, change log) — M2-07
│   │   │   ├── stage/          ✔ stage runtime (bonus.ts: the hidden bonus-stage entrances — M2-10): camera keys / ramps / pans / locks / holds / diagonal pans, event cursor, branches + region triggers, following a camera target (a raid — M2-09), checkpoints, terrain map + parallax / terrain views; systems.ts = the World's stage gimmicks (StageGimmicks: destructible terrain, MovingBlockSystem, pull fields, chains — M2-07)
│   │   │   ├── rank/           ✔ rank 0–31 (difficulty base + growth × stage / loop / power terms, 16 on loop 1), rankScale curves, per-enemy sensitivity (M2-01), the Direct-mode power term (M2-05)
│   │   │   ├── scoring/        ✔ (partial) per-player scores (clamp 99,999,990), session hi-score, crediting kills / bonuses / capsules, extends (cap 9) and the continue digit (M2-01)
│   │   │   ├── fx/             ✔ (partial) hit-stop / shake / flash requests + timers (FxState), exact hit-stop (slowdown: M3-02)
│   │   │   ├── scenes/         ✔ scene stack (depth 8, deferred transitions) + campaign runs (run.ts: RunState, the carried players, the zone tally — M2-10; the zone map and the ending hook; the ending screens' sprite scenes and epilogues and the credits scroll — M2-14) + the front end of M2-15 (the mode select, the attract loop — demo play, hi-score tables, story crawl —, the name entry, the practice select, the sound test) + the Options pages of M2-16 (CONTROLS / DISPLAY / GAME, the rebind screen, the input test; the save's game options in the next games' configs, a run's own runConfig) + the M1 flow: boot → title → difficulty menu (M2-01) → ship select (M2-05) → weapon select with live preview + Auto order editor (M2-03) → game ⇄ pause → stage clear / continue countdown (M2-01) / game over, YES / NO dialog (Tizen exit confirm), Options overlay (M1-17; SCALE / SHAKE / FLASHES / HITBOX — M2-08) + M3-01: the EXTRA menu (boss rush, caravan, arcade loops), the secret codes, the assists; replays.ts = the run recorder, run-replay playback and start-state JSON; the replay browser and playback screens
│   │   │   ├── ui/             ✔ (partial) canvas UI kit (list menu, slider, toggle, choice, confirm; 18/6-tick auto-repeat, 4-tick Confirm buffer; draw builders) + the HUD (buildHud, rebuilt only on change; meter labels named after the arsenal — M2-03; Direct-mode tier pips — M2-05; the co-op halves — M2-06; the boss HP bar — M2-09; the 3-letter name entry NameEntry — M2-15; the rebind widget RebindPanel and strings.ts — the UI string table DEFAULT_UI_TEXT / resolveUiText — M2-16)
│   │   │   ├── debug/          ✔ hashWorld state hash, debug switches + controls (god mode, outlines, frame advance, slow-mo, checkpoint jump, stage skip), overlay counters (M1-19)
│   │   │   ├── save/           ✔ versioned save (key save.v1, format 2 since M2-16): options, hi-score tables, stats; migrations, defensive parsing, SaveStore (writes only on change) — M1-17; a table per difficulty × ship × mode (1p / 2p / practice), renameScore for the name entry (M2-15); the controls and game options, the v1 → v2 migration that also moves old co-op / practice rows (M2-16)
│   │   │   └── replay/         ✔ replays: format.ts = header, per-tick input recorder, playback + desync report, RLE/varint/base64 JSON format (M1-19; split out in M2-15 — no core/game import); demo.ts = the attract playback DemoPlayback / createDemoPlayback (M2-15); run.ts = whole-run replays (segments, the SegmentRecorder, the assist flags) and the replay library over Platform.storage (M3-01); index.ts = createReplayGame / playReplay + re-exports
│   │   ├── test/<module>/  one folder per module + index.test.ts (module tree invariants); test/helpers/alloc.ts = the allocation guard of every package (measureHeapGrowth; shell, render-pixi and input-web import it by relative path)
│   │   ├── tsconfig.json   src only, lib ES2018, no types (purity)
│   │   ├── tsconfig.build.json  emits dist/ (customConditions off)
│   │   └── test/tsconfig.json   Node-side program for tests
│   ├── render-pixi/        @shmup/render-pixi — PixiJS v8 IRenderer: WebGL1-first, 384×216 RT, integer upscale
│   │   └── src/ renderer ✔ (+ scale modes, hitbox layer, render interpolation — M2-08) viewport ✔ (integer / fit / stretch — M2-08) test-pattern ✔ palette ✔ (+ colour-blind bullet palette tables — M2-02; palette cycling — M2-08) atlas ✔ layers ✔ (+ terrain grid with the M2-07 change log, parallax bands, laser sprites, bending laser segments — M2-02, hitbox markers — M2-08) sprites ✔ (+ interpolating syncs — M2-08) text ✔ ui ✔ particles ✔ (fx content owner, 256-particle pool) effects ✔ (shake, flash + limiter, dim, score popups; M2-08: raster.ts offset tables, shaders.ts GLSL ES 1.0 sources, layer-effects.ts — one filter per layer, the additive Mega Crash flash) debug ✔ (overlay: panel, frame graph, hitbox / grid outlines — M1-19)
│   ├── audio-web/          @shmup/audio-web — Web Audio IAudio (interactive latency, buses, suspend/resume) + the game's audio
│   │   └── src/ web-audio ✔ synth ✔ (deterministic PCM: ZzFX-style SFX, chip songs with sample-exact loops) sfx ✔ (voice manager) music ✔ (loop, fades, ducking) loader ✔ (sfx / music kinds, OGG path) engine ✔
│   ├── input-web/          @shmup/input-web — keyboard/remote + Gamepad API → InputSnapshot
│   │   └── src/ keymap ✔ keyboard ✔ (+ KeyCapture — M2-16) gamepad ✔ web-input ✔ (player seats — M2-06; the rebinding capture beginCapture — M2-16) remote ✔ (debounce, diagonal/SOCD policies) rebind ✔ (input profiles, game/menu tables, the split keyboard, profile choice; M2-16: rebinding — customizeInputProfile, rebindAction with conflict detection, resetBindings, captureToken, key labels); M3-01: gamepad rumble — rumblePad, WebInput.rumble
│   └── shell/              @shmup/shell — shared browser host of apps/web + apps/tizen (decision D34)
│       └── src/ boot ✔ loader ✔ dispatch ✔ (+ connectFxEvents, connectAudioEvents, connectOptionEvents / applyAudioOptions — M1-17, applyDisplayOptions — M2-08) error-screen ✔ frame-loop ✔ (+ the refresh probe that switches render interpolation — M2-08) scene-view ✔ (default scene: the scene flow, M1-16) flight ✔ (?scene=flight: free flight) showcase ✔ fx-gallery ✔ (?scene=fx-gallery) debug ✔ (dev / test builds: F1–F8, the TV's Pause + Ch+ ×3 unlock, per-frame timing, window.__shmupDebug — M1-19) controls ✔ (the rebind screen's host side createShellControls — M2-16) storage ✔ (the hosts' localStorage adapter with quota checks, the debug save export / import — M2-17) memory ✔ (the TV memory estimator, atlas-page residency between zones — M2-17) determinism ✔ (the cross-engine determinism check: golden replays in the page's engine, the web app's `?determinism` — M2-18); M3-01: the replay library loaded before the title (Shell.replays), SHARE / buildId passed to the flow, connectRumbleEvents
│
├── apps/                   deployable hosts (thin adapters around the packages)
│   ├── web/                @shmup/web — Vite dev app (HMR), browser Platform; also Electron's renderer
│   │   └── src/ main.ts · boot ✔ platform ✔ (M3-01: SHARE via the clipboard, pasted replays imported)
│   ├── tizen/              @shmup/tizen — Samsung TV .wgt (Tizen 5.5+, Chromium 69)
│   │   ├── public/         config.xml (tv-samsung, tv.inputdevice + internet), icon.png (512 × 423, drawn by `pnpm store:assets` since M2-18) → copied to dist/
│   │   ├── polyfills/      global-this.js (ES5, prepended to app.js)
│   │   ├── scripts/        check-bundle.mjs (one classic ES2018 script + size budgets + a valid config.xml) · tizen-package/install/run.mjs (env-driven, Windows-friendly) · config-xml.mjs (the config.xml variants: game mode, gamepad check — M2-17) · tizen-watch.mjs (the live-reload dev server — M2-17)
│   │   ├── vite.config.ts  target chrome69+es2018, IIFE, no code splitting, classic <script defer>
│   │   └── src/ main.ts · boot ✔ (Back exits only before the game runs — then the scene flow's exit confirmation; tizenDebugTools in dev / test builds) platform ✔ (keys, Back 10009, visibility, exit) · device-info ✔ (model / firmware via webapis.productinfo → the debug overlay — M2-17) · live-reload ✔ (dev-only WebSocket reload, `tizen:watch` — M2-17)
│   └── electron/           @shmup/electron — desktop shell; compiles in CI, binary never downloaded there
│       ├── scripts/        copy-renderer.mjs (apps/web/dist → dist/renderer)
│       ├── electron-builder.json  packaging config (`pnpm --filter @shmup/electron package` — never in CI; output release/, ignored) — M2-17; build/icon.png (512 × 512, drawn by `pnpm store:assets` — M2-18)
│       └── src/ main/ (main.ts, app-protocol.ts, window-options.ts ✔ · saves.ts ✔ file saves, atomic + backup + quota · ipc-handlers.ts ✔ · window-state.ts ✔ fullscreen / scale / position — M2-17 · steam.ts placeholder) · preload/preload.cts (+ storage) · shared/ipc.ts
│
├── content/                game DATA (JSON, formatVersion 1, validated at load by core/data ✔)
│   ├── player/             ✔ one file per ship: speed levels, hitboxes, margins, timers, power-up model; kestrel (meter), manta (Direct mode, M2-05) (+ README, example)
│   ├── stages/             ✔ one file per stage: music, camera path, checkpoints, parallax, tilemap (heightfield / RLE), event timeline; zone-a (AZURE VERGE, the game's stage — M1-18), test-range, test-boss, weapon-range (the weapon select's live preview — M2-03), hunter-range (the Option Hunters — M2-04), direct-range (the Direct-mode carriers — M2-05), gimmick-range (the advanced stage systems — M2-07), raster-range (raster effects and palette cycles — M2-08), captain-range / raid-range / twin-range / gauntlet-range (the advanced bosses; gauntlet-range the first bossRush stage — M2-09); zone-b (BRINE NEBULA) and zone-c (DUNE EXPANSE) — the real zones B and C with brine-grotto, zone B's hidden bonus stage (M2-11) —, zone-d (MAGMA DEEP: the dive into the caves, the brick maze) and zone-e (TEMPEST RIDGE: rear attackers, heavy weather) — the real zones D and E (M2-12) —, zone-f (CELL VAULT: chasing cells, regenerating tissue walls, grabbing tentacles) and zone-g (PRISM LABYRINTH: crystal walls, the cube rush) — the real zones F and G with glimmer-cache, zone G's hidden bonus stage (M2-13) —, zone-h (IRON CITADEL: the piston hall, the parade, IRON SOVEREIGN) and zone-i (ABYSSAL THRONE: depth mines, the ABYSS ARK raid with THE HOLLOW KING inside) — the final zones (M2-14; their music names the ending and credits themes) —, bonus-range (the three bonus-stage entrances) and bonus-vault (a bonus stage — type bonus: 1UPs, bonus capsules, brick barriers — M2-10); zone A's Direct-mode item plan (directItems); optional raster / cycles lists (M2-08); optional type / rush (M2-09); boss-rush (the EXTRA menu's BOSS RUSH) and every zone's loop remix (M3-01) (+ README, example)
│   ├── tilesets/           ✔ terrain tilesets: per tile collision type, column-height mask, atlas frame, destructible hp / regen / score (M2-07: terrain-a's brick, cube, tissue); terrain-reef / terrain-dune, zones B and C's recoloured sets (M2-11); terrain-magma / terrain-ridge, zones D and E's (M2-12); terrain-vault / terrain-prism, zones F and G's (M2-13); terrain-citadel / terrain-abyss, zones H and I's (M2-14) (+ README, example)
│   ├── enemies/            ✔ enemy definitions: hp, score, hurtbox, behaviour script + tunables, mover, ground anchor, drop, child; boss sections (parts, weak points, phases); zone A roster + HALCYON BULWARK (M1-18), test-range roster, test boss, the three Option Hunters (option-hunters, M2-04), the Direct-mode carriers cube / lead-carrier (direct-carriers, M2-05), the stage gimmicks — rock, volcano, bubbles, suction pod, tentacle, rush cube (gimmick-range, M2-07), the advanced bosses — four captains, IRON LEVIATHAN with LEVIATHAN HEART inside, the EMBER / FROST twins (advanced-bosses, M2-09); the zone B and C rosters with SPUME HERALD, GALVANIC MAW and SANDGRAVE WIDOW (zone-b, zone-c, M2-11); the zone D and E rosters with CINDER BASTION and SQUALL STEED (zone-d, zone-e, M2-12); the zone F and G rosters with MANTLE REGENT and FACET MONARCH (zone-f, zone-g, M2-13); the zone H and I rosters with the parade's four echoes, IRON SOVEREIGN, the ABYSS ARK and THE HOLLOW KING (zone-h, zone-i, M2-14) (+ README, example)
│   ├── paths/              ✔ movement paths: spline control points, baked to arc-length tables at load; zone A's fan / orbit curves, test-range's; zone C's skimmer swoops (M2-11), zone D's bat swoops and zone E's rear-entry kite loops (M2-12) (+ README, example)
│   ├── weapons/            ✔ weapon tunables + preset loadouts: Type A (type-a) and Types B–D (types-b-d, M2-03) with their menu names; the MANTA's weapons and shot families (direct, M2-05); the Extra Edit weapons (types-extra, M3-01) (+ README, example)
│   ├── input/              ✔ input profiles (kind input-profiles, validated by input-web rebind): per-context key/button tables, remote debounce/diagonal/SOCD, Tizen keys to register; the split keyboard's `split` half for two players (M2-06)
│   ├── audio/              ✔ SFX bank (kind sfx: synth parameters or a file per SFX_CUES cue) + music/ (kind music: original chip songs or OGG, bound to MUSIC_CUES), validated by audio-web loader (+ README, examples)
│   ├── campaign/           ✔ the zone map (kind campaign, validated by core/data): zones (stage, map label, name, preview), edges, endings by final zone and run flags; main.campaign.json = the 9-zone diamond A → B|C → D|E → F|G → H|I, 16 routes (M2-10); the endings' sprite scenes and epilogues, the credits (M2-14) (+ README, example)
│   ├── demos/              ✔ the attract loop's demo play (kind replay, validated by core/data): zone-a … zone-i.replay.json — core/replay recordings of the 4-way bot with god mode, 40 s of each zone, recorded by test/golden/demos.ts and re-recorded by pnpm golden:update; never edited by hand, skipped by Prettier (M2-15) (+ README, example)
│   ├── strings/            ✔ the UI string tables (kind strings, validated by core/data): en.strings.json — every label of the canvas UI by id, equal to core/ui DEFAULT_UI_TEXT (pnpm content:check); a translation is <language>.strings.json (M2-16; the language choice is M3) (+ README, example)
│   ├── rules/              ✔ game-wide rule tables (kind rules, validated by core/data): the difficulty presets Easy / Normal / Hard / Arcade — rank base / growth, lives, extends, continues, death penalty, aim directions, bullet speed (M2-01); the scoring values — points per cancelled bullet (M2-02), the score-milking cap (M3-01; + README, example)
│   ├── patterns/           ✔ bullet patterns as data (kind patterns, compiled by core/data + core/patterns): BulletML-inspired actions and bullets, expressions over $rank / $rand / $loop / $i; the common library (M2-02) and the zone enemies' zones.patterns.json (M2-11 … M2-14) (+ README, example)
│   └── fx/                 ✔ particle presets + the event cues that spawn them (kind fx, validated by render-pixi particles): explosions, debris, sparks, clinks, cancel sparkles, pickup ring, muzzle flash (+ README, example)
├── assets/
│   ├── source/             editable sources — in git: sprites/**/*.sprite.json pixel maps (+ real-art PNG overrides), fonts/*.font.json, tilesets, audio
│   └── generated/          pipeline output (atlas/main.png + main.json, cache; store/ = the store-listing placeholders of `pnpm store:assets` — M2-18) — ignored
├── scripts/                repo-level Node scripts: clean.mjs, generate-assets.mjs (pnpm assets) + assets/ (PNG encoder, sprite sources, procedural generators, packer, font, the `@flash` and — M2-06, coop.mjs — player 2's `@p2` palette-swap siblings; the raster-bands generator — M2-08; the bosses generator — turret heading frames, orb, raid hull, captain shell — M2-09; the zone generators brine.mjs / dune.mjs and the zone tilesets of terrain.mjs — M2-11; magma.mjs / tempest.mjs — M2-12; vault.mjs / prism.mjs — M2-13; citadel.mjs / abyss.mjs and the ending scenes' ending.mjs — M2-14), gen-trig-tables.mjs, audio-preview.mjs (pnpm audio:preview → WAV files), golden-update.mjs (pnpm golden:update), store-assets.mjs (pnpm store:assets: the TV / desktop icons and the store-listing placeholders — M2-18), content/tiled-import.mjs (pnpm content:tiled: a Tiled map → stage JSON — M2-07)
├── types/                  ambient declarations for the Vite virtual modules (virtual:shmup-content, virtual:shmup-assets) and the build-info defines (build-info.d.ts: __SHMUP_DEV__, __SHMUP_BUILD__, __SHMUP_LIVE_RELOAD__ — M2-17)
├── test/                   cross-package integration tests (Vitest project "integration", part of `pnpm test`); playtest/ = headless playtest harness + 4-way bot + design rules (M1-18, same project); golden/ = golden replays + their test (M1-19, same project; two co-op runs since M2-06, three gimmick-range runs since M2-07, one raster-range run since M2-08, four advanced-boss runs since M2-09, three bonus-stage runs since M2-10, zones B and C and zone B's bonus stage since M2-11, zones D and E since M2-12, zones F and G and zone G's bonus stage since M2-13, the final zones since M2-14, the toggle / hold autofire modes since M2-16 — golden-autofire.test.ts; demos.ts / demos.test.ts = the attract demos of content/demos/, recorded and locked like the goldens — M2-15); playtest/campaign.ts = the zone-map route harness (M2-10); playtest/zone-b … zone-g tests and recovery.ts (the recovery rule of every zone — M2-11 … M2-13); scripts/content/ = the Tiled importer's tests + its fixture map and expected JSON (M2-07); bench/ = `pnpm bench` benchmarks — the stress run, every zone under stress and the 30-minute soak since M2-18 (own Vitest config, not in `pnpm test`); e2e/ = Playwright browser smoke tests (`pnpm test:e2e`; since M2-18 the cross-engine determinism spec also in Firefox and the release checks); integration/release-audit.test.ts = the v1.0 release audit and playtest/campaign-routes*.test.ts the 16 routes × both ships (M2-18); the extra modes' goldens (loop 2, caravan, Extra Edit, option recovery, invincibility), playtest/boss-rush.test.ts, integration/extra-edit-runtime / loops-runtime and e2e/extra-replays.spec.ts (M3-01)
├── docs/
│   ├── client/             player/tester docs (preview-build, controls, install-on-tv, debug-tools, desktop-app — M2-17, release-candidate — M2-18, extra-modes-and-replays — M3-01, input-probe)
│   └── dev/                contributor docs (this file, architecture, engine-foundations, content-data, asset-pipeline, rendering-and-shell, sim-world, stage-runtime, enemies-and-behaviors, fx-and-game-feel, scenes-and-ui, saves-and-options, zone-a-and-playtest, debug-and-replays, difficulty-and-rank, pattern-dsl, meter-arsenal, options-shields-hunter, direct-mode, coop, advanced-stages, presentation-polish, advanced-bosses, campaign-and-bonus-stages, zones-b-and-c, zones-d-and-e, zones-f-and-g, zones-h-and-i, front-end-and-attract, options-rebinding-and-accessibility, platform-polish, release-hardening — M2-18, extra-modes-and-replays — M3-01, api-reference, …)
├── tools/                  standalone tools, NOT workspace members (own package.json/lockfile, npm not pnpm)
│   └── input-probe/        Tizen diagnostic .wgt: remote/gamepad/display measurements (see input-probe.md)
└── shmup_feat.md  shmup_tech.md  input_probe_spec.md  shmup_plan.md  shmup_progress.md  CHANGELOG.md  README.md  LICENSE (MPL-2.0)
```

✔ = implemented or partially implemented today; everything else is a placeholder with its
API declared.

## Dependency direction

```text
apps/web ──┐
apps/tizen ├─► shell ──► render-pixi ─┐
           │    └──────────────────────┤
           ├─► audio-web ──────────────┼─► core
           └─► input-web ──────────────┘
apps/electron ─► (loads apps/web build; no package imports)
```

`@shmup/shell` (M1-04) is the shared boot path of the two browser hosts; the apps still create
their own input / audio adapters and platform and hand them to it (plan §3.1). The plan
allows the shell to import render-pixi, audio-web and input-web; today it imports all three —
render-pixi (the renderer, the `fx` owner), audio-web (the `sfx` / `music` owners and the audio
engine, M1-15 — [audio.md](audio.md)), input-web (only to validate the `input-profiles` content
by default, M1-05) — and core; the input and audio adapters themselves arrive as interfaces.
Guide: [rendering-and-shell.md](rendering-and-shell.md).

`@shmup/core` imports nothing from the workspace (lint-enforced). Presentation packages
depend only on core. Apps compose everything.

## How packages resolve each other

Each package's `exports` has a custom **`@shmup/source`** condition pointing at
`src/index.ts`, plus `types`/`default` pointing at `dist/`:

- **Dev server, app builds, tests, type-checking** use the source condition (set in
  `tsconfig.base.json` `customConditions`, and in Vite/Vitest via `vite.shared.ts`) —
  no package build needed, HMR reaches into packages.
- **`tsc` library builds** (`tsconfig.build.json`) switch the condition off and use the
  dependencies' `dist/` typings; Turborepo builds dependencies first (`^build`).

## Tooling decisions

| Area | Choice | Notes |
|---|---|---|
| Package manager | pnpm 12 (`packageManager` field), catalog for shared versions | `allowBuilds` limits install scripts to electron + esbuild |
| Node.js | `^24.15.0 \|\| >=26.0.0` (`engines.node` + `devEngines.runtime`, keep them identical); `.nvmrc` = 24 | Not the spec's `>=20`. The pinned toolchain's own requirements — Vitest 5 `^22.12 \|\| ^24 \|\| >=26`, Electron 44 `>=22.12`, eslint-plugin-jsdoc 64 `^22.22.2 \|\| >=24.15`, ESLint 10 `^22.13 \|\| >=24` — would also allow `^22.22.2`, but the allocation guards are calibrated on Node 24's V8 and 17 of them fail on Node 22 (V8 12.4), so Node 22 is excluded. The range must stay a subset of every toolchain package's range. `devEngines.runtime.onFail: "error"` makes pnpm reject other Node versions up front instead of failing later inside a tool. Re-derive it whenever those tools are bumped |
| Orchestration | Turborepo 2 | `transit` task makes typecheck/lint/test caches depend on upstream sources without forcing builds |
| TypeScript | **6.0.x** (pinned via catalog) | TypeScript 7.0 (native) is current, but it has no JS API until 7.1 and typescript-eslint 8.x supports `typescript < 6.1`; revisit when typescript-eslint supports 7.x |
| Lint | ESLint 10 flat config + typescript-eslint (type-aware) + eslint-plugin-compat + eslint-plugin-jsdoc | compat target `chrome >= 69`; extra rules ban `.at()`, `replaceAll`, `structuredClone`, `Object.hasOwn`, `import.meta` (Tizen) |
| Tests | Vitest 5, Node environment, tests in `test/` | Vitest projects config at the root |
| Bundler | Vite 8 (Rolldown/Oxc) | Tizen: `target ['chrome69','es2018']`, IIFE, `codeSplitting: false` |
| Format | Prettier 3 (`pnpm format`, `pnpm format:check`) | research docs at the root are excluded |

## Common commands

```sh
pnpm install            # also links workspace packages
pnpm dev                # browser dev app on http://localhost:5173
pnpm lint | typecheck | test | build
pnpm test:all           # same as pnpm test: every Vitest project in one process
pnpm test:e2e           # build web + tizen test builds, then browser smoke tests (Playwright: headless Chromium, the determinism spec also in Firefox)
pnpm --filter @shmup/tizen build    # TV bundle (release) + bundle check with size budgets
pnpm --filter @shmup/tizen build:dev  # TV debug build (debug tools behind Pause, Ch+ ×3) for on-device checks
pnpm --filter @shmup/tizen build:game-mode  # TV release build with the use.game.mode metadata (the §8.5 latency A/B test) — M2-17
pnpm --filter @shmup/tizen tizen:watch      # live reload to the TV (never in CI) — M2-17
pnpm --filter @shmup/electron package       # desktop installers into apps/electron/release/ (after build; never in CI) — M2-17
pnpm golden:update      # re-bless the golden replays and the attract demos (intended sim changes only — say why in the commit)
pnpm bench              # benchmarks: the stress run, every zone under stress, the 30-minute soak (M2-18) — ms/tick and heap
pnpm store:assets       # redraw the TV / desktop icons and the store-listing placeholders (M2-18; --check verifies the icons)
pnpm content:check      # validate content/ against the core schemas (+ sprite names exist in the atlas, zone A's 4-way rules, en.strings.json = the built-in UI table)
pnpm exec vitest run --project integration test/playtest --reporter=verbose   # the headless playtest, runs printed
pnpm assets             # regenerate the placeholder atlas (skipped when nothing changed)
pnpm clean              # remove dist/ coverage/ .turbo/ everywhere
```

More: [build-test-deploy.md](build-test-deploy.md) (every script, TV deployment, CI,
troubleshooting), [architecture.md](architecture.md) (how the pieces work together at
runtime), [content-data.md](content-data.md) (game data and its loader),
[asset-pipeline.md](asset-pipeline.md) (placeholder art → atlas),
[rendering-and-shell.md](rendering-and-shell.md) (render contract, renderer, shared boot,
`pnpm test:e2e`), [sim-world.md](sim-world.md) (the World and its tick),
[scenes-and-ui.md](scenes-and-ui.md) (scenes, menus, HUD),
[saves-and-options.md](saves-and-options.md) (saves, user options, the Options screen),
[stage-runtime.md](stage-runtime.md) (scrolling stages, terrain, parallax),
[zone-a-and-playtest.md](zone-a-and-playtest.md) (zone A, its boss, the 4-way rules, the
playtest bot), [debug-and-replays.md](debug-and-replays.md) (debug tools, replays, golden
replays, the benchmark and budgets), [difficulty-and-rank.md](difficulty-and-rank.md) (difficulty
presets, rank growth, extends, continues), [pattern-dsl.md](pattern-dsl.md) (the bullet pattern
DSL, bending lasers, cancel points, colour-blind palettes), [meter-arsenal.md](meter-arsenal.md)
(weapon types, Weapon Edit, the weapon select), [options-shields-hunter.md](options-shields-hunter.md)
(Option types, meter shields, the Option Hunter, the blue capsule), [direct-mode.md](direct-mode.md)
(Direct mode, the MANTA, the ship select), [coop.md](coop.md) (two-player co-op, player seats, the
split keyboard), [advanced-stages.md](advanced-stages.md) (destructible terrain, moving blocks,
branches, stage gimmicks, the Tiled importer), [advanced-bosses.md](advanced-bosses.md) (captains,
raids, double / inner bosses, timers, the HP bar, boss rushes),
[campaign-and-bonus-stages.md](campaign-and-bonus-stages.md) (the zone map, campaign runs, the zone
tally, bonus stages, the ending hook), [front-end-and-attract.md](front-end-and-attract.md) (the
attract loop, the mode select, the name entry, the hi-score tables, practice, the sound test),
[options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md) (the Options pages,
the autofire modes, the game options, rebinding, the input test, save v2, the UI string table),
[platform-polish.md](platform-polish.md) (Electron file saves, window and packaging; the Tizen
`config.xml` variants, device info and live reload; storage quota checks; the memory budget),
[api-reference.md](api-reference.md) and
[conventions.md](conventions.md).
