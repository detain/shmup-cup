# Winner videos committed — the D3 store-kit round

The 2026-10-23 winners commit (`R0-04.W1`, S3 gate 2) carried the **299 image winners**; the
**35 video winners** were then deferred (this folder held `VIDEO-PENDING.md`) and lived only in the
git-ignored candidate store. On 2026-10-26 the D3 store-kit lane copied them out, byte-identical
(every `winner.mp4` and `winner.json` verified with `cmp` against its candidate file), beside the
image era’s layout: `video/<name>/winner.mp4` + `winner.json` (the candidate sidecar as generated) +
`choice.json` (the ruling row). Total: 47.8 MB across 35 clips.

## The 35 clips

| Item id | Slot | Model | Bytes | SHA-256 (12) |
|---|---|---|---|---|
| `video/abyss-and-nebula-drift` | `b` | ltx25 | 288278 | `457ac427e25f` |
| `video/abyss-ark-sailing` | `b` | ltx25 | 967747 | `7c2f6185c56a` |
| `video/ark-diving-abyss` | `a` | wan22 | 832248 | `d4a9cb7d373f` |
| `video/blackhole-bomb-slowmo` | `b` | ltx25 | 1231400 | `766c3d1cc2dc` |
| `video/blackhole-bomb-slowmo/edit-1` | `b` | ltx25 | 852471 | `18495561042c` |
| `video/breaking-surface-sunrise` | `b` | ltx25 | 1254042 | `8e079891b772` |
| `video/bullet-to-gold` | `b` | ltx25 | 3885618 | `7fe41e273dcd` |
| `video/chained-hull-explosions` | `b` | ltx25 | 1966912 | `f7e2a09a6852` |
| `video/checkerboard-rush` | `b` | ltx25 | 963729 | `8b05f871baa8` |
| `video/coop-two-ship` | `b` | ltx25 | 772045 | `064679a9e980` |
| `video/dawn-flight-home` | `b` | ltx25 | 523373 | `e422720889d8` |
| `video/escape-citadel-collapse` | `b` | ltx25 | 2366270 | `9c1a0355419f` |
| `video/galvanic-maw-jaw` | `b` | ltx25 | 1899434 | `da0e636a6083` |
| `video/halcyon-bulwark-shield` | `a` | wan22 | 900965 | `b47a67670db1` |
| `video/hollow-king-lure` | `a` | wan22 | 485531 | `9202c2a51299` |
| `video/kestrel-bullet-weave` | `a` | wan22 | 2259875 | `96ba60bc557e` |
| `video/logo-sting` | `b` | ltx25 | 497798 | `527d68690d0b` |
| `video/manta-blackhole-vortex` | `b` | ltx25 | 2279289 | `b9b739a5144b` |
| `video/mega-crash-shockwave` | `a` | wan22 | 436166 | `8f0d8653e632` |
| `video/sandgrave-widow-silk` | `b` | ltx25 | 2115793 | `375a75e0aa84` |
| `video/social-vertical` | `b` | ltx25 | 1656206 | `86ec4a8a1b25` |
| `video/squall-steed-storm` | `b` | ltx25 | 2482984 | `1f924a32fc10` |
| `video/story-crawl-vista` | `b` | ltx25 | 838467 | `1519e9ff9cd4` |
| `video/title-ambient-loop` | `b` | ltx25 | 317587 | `65277c2b43a5` |
| `video/zone-abyssal-throne-glow` | `b` | ltx25 | 961753 | `6d0a2371810c` |
| `video/zone-brine-nebula-gassea` | `a` | wan22 | 1200082 | `15a69632606e` |
| `video/zone-dune-expanse-twinsuns` | `b` | ltx25 | 2403077 | `1f80142b1456` |
| `video/zone-iron-citadel-chase` | `b` | ltx25 | 1177785 | `089395b4d387` |
| `video/zone-magma-deep-cone` | `b` | ltx25 | 962001 | `157aa203fa86` |
| `video/zone-montage-a` | `b` | ltx25 | 612483 | `a596c5a375f7` |
| `video/zone-montage-b` | `a` | wan22 | 1115114 | `25234d8f8776` |
| `video/zone-neon-dimension-rush` | `b` | ltx25 | 1376687 | `34bda409ef9f` |
| `video/zone-prism-labyrinth-refraction` | `b` | ltx25 | 1061556 | `03077dbfb2ec` |
| `video/zone-tempest-ridge-timelapse` | `b` | ltx25 | 4026879 | `3bdc788a97a0` |
| `video/zone-transition-parallax` | `b` | ltx25 | 780197 | `6bf2d8c3b9c5` |

## Licence and duty

- **28 clips (`slot b`) — `ltx25`** (Lightricks LTX-2.x community weights): commercial use is
  allowed under the licence while the licensee stays under $10M/yr revenue, **with** the duty to
  show a machine-generated disclaimer wherever the clip is displayed, and to **retain the
  provenance metadata** — keep each file’s embedded metadata and its committed `winner.json`
  sidecar together on every use (store listings, social posts, the site).
- **7 clips (`slot a`) — `wan22`** (Wan-AI Wan2.2-T2V-A14B): Apache 2.0 — free commercial use,
  attribution preserved through the sidecars.

Choice rulings: `choices/choices.mystage-20261018.json` — the committed rulings file; each clip’s
extracted row is in its own `choice.json` beside it.

