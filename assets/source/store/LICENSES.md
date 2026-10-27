# Store key art — provenance and licence notes (v20x-A2)

The images in this folder's products are AI-assisted marketing stills, not in-game art. They exist
under the owner's dated §1.5 waiver of **2026-10-27** (ruling "a2"):

> "the owner's a2 pick = dated §1.5 waiver for STORE/ICON surfaces ONLY (in-game atlas laws
> untouched)"

Every product derives from one git-tracked winner of the v2 art round
(`art-prompts/v2/winners/…/winner.png`) by the numeric pipeline of `scripts/assets/resample.mjs`
(exact fractional-box area downscale, contain fit on the playfield navy, median-cut to ≤ 256
colours, indexed PNG-8) — `pnpm store:assets` re-renders all of it, `--check` keeps it current, and
each `<slug>.art.json` record beside this file pins its source's SHA-256, prompt, model and seed.

## Model classes

| Class | Model | Licence id | Here | Duty |
|---|---|---|---|---|
| Image stills (this folder) | `black-forest-labs/FLUX.2-dev` (model key `flux2`) | `flux-nc-2.1` | the icon, capsule, no-text capsule, website hero, wide banner and eleven zone posters (`node scripts/art-origins.mjs` counts only the atlas; these sixteen records are the store set) | disclosure "to the extent required under applicable law"; a review for infringing content before distribution; free open-source (MPL-2.0) distribution only — any paid distribution needs a BFL commercial licence first (owner ruling 2026-10-23, `docs/dev/art-provenance.md` §8 decision 1) |
| Video clips (NOT this folder) | LTX-2.5 (`model` key `ltx25`, served `Ltx2/LTX-2.5-Diffusers`) | `ltx-2.x-community-2026-08-11` | the v20x video round's winner clips under `art-prompts/v2/video/` (`art-prompts/v2/winners/video/<id>/winner.mp4` + sidecar) — trailer and store clips | every clip "expressly and intelligibly" disclaimed as machine generated where shown; keep embedded provenance |
| Video clips (NOT this folder) | Wan2.2 (`model` key `wan22`, served `Wan-AI/Wan2.2-T2V-A14B`) | `apache-2.0` | the same video set, the Wan2.2 shots (sidecars name the model) | none for outputs |

The mapping is deliberately discoverable from here: the About-page lane links its disclaimers to
these rows, and the video brief is `docs/client/store-submission.md` § "AI-content disclosure"
(Video bullet). Nothing from the video classes ships inside the widget or this pipeline's PNGs.

## In-game law (unchanged)

The waiver covers store and icon surfaces only. The shipped atlas stays the repository's own
placeholder generators and pixel maps (§1.5), its real art arrives through the ingest tool with
`.art.json` records of schema `shmup-art-provenance@1`, and the four placeholder screenshots
`pnpm store:assets` still draws from the atlas are captioned `PLACEHOLDER` until monitor captures
replace them.
