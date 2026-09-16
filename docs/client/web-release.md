# Publishing the browser build (itch.io)

> ## Nothing here has been uploaded
>
> No agent has run the packaging script against a real build and nothing has been uploaded
> anywhere. itch.io needs an account, which the project does not have. This is the recipe.

The browser build has been relocatable since M1-04 — `base: './'`, every asset URL relative, the
atlas pages loaded with `new Image()` and no `fetch()` — because Electron serves the same `dist/`
from `app://` and the Tizen widget from `file://`. That is exactly what itch.io's HTML5 hosting
wants, so there is no separate "web release" build: it is `pnpm --filter @shmup/web build`.

## Make the upload

```sh
pnpm install
pnpm --filter @shmup/web build
pnpm itch:package        # → assets/generated/itch/shmup-cup-web.zip
```

`scripts/itch-package.mjs` archives `apps/web/dist` with `index.html` at the root and leaves the
source maps out (they are the largest files in `dist/` and would publish the TypeScript sources).
The archive is byte-identical for the same build on every machine. `--dist` and `--out` move the
input and the output.

## Upload it

1. itch.io → **Upload new project**.
2. **Kind of project: HTML** — upload the zip and tick *This file will be played in the browser*.
3. Viewport: **1920 × 1080**, "Click to launch" on, fullscreen button on, mobile friendly off.
4. The store page: the placeholder screenshots and listing text are in
   `assets/generated/store/` (`pnpm store:assets`). Replace them with real captures before the page
   goes public — they say `PLACEHOLDER` across the middle.

## What to check in a browser first

- [ ] Keyboard play: arrows / WASD, Z fire, X sub, C or Enter power-up, Escape pauses.
- [ ] A gamepad works after one button press.
- [ ] Audio starts after the first key press (browsers need a gesture; the TV and Electron do not).
- [ ] Options and hi-scores survive a reload — they live in `localStorage` under `shmup-cup:`.
- [ ] The game fills the itch iframe at 1920 × 1080 and scales to integer multiples inside it.
- [ ] Nothing in the console. A failed atlas load shows the boot error screen, not a blank page.

## What it costs

The web build is the whole game: the atlas page, the inlined content and the bundle. There is no
size budget on it the way there is on the Tizen widget (`APP_JS_GZIP_BUDGET`), but itch serves it
over the open internet — so keep an eye on the zip's size, and prefer the same lean-code rules the
TV build follows.
