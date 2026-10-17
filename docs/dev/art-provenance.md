# AI art provenance and licences

Which AI models made art for the v2 remaster, what each model's licence lets the project do with
what it made, what every shipped AI-assisted image must record, and what the owner still has to
decide. Plan step **R3-05** ([`plan_resolution.md`](../../plan_resolution.md) §9; risk table §14).
Its companions: [art-bible-v2.md](art-bible-v2.md) (how the art is made),
[real-assets.md](real-assets.md) (handing art to the pipeline),
[art-generation-server.md](art-generation-server.md) (the GPU server) and, for the stores,
[`docs/client/store-submission.md`](../client/store-submission.md#ai-content-disclosure-every-store).

> **This is a summary of licence texts, not legal advice.** Every licence below was read on
> **2026-10-17** from the URL given — the FLUX, Stability and LTX-2.x texts in full, the Apache 2.0
> models through the licence text and their model cards, LTX-Video's through the clauses quoted.
> The quotes are exact; cuts are marked […]. Where this page and a licence differ, the licence wins. Licences change: re-read them before each release and before buying anything.
> The FLUX question in section 4 is the kind a lawyer or the licensor should answer.

Contents:

1. [The short answer](#1-the-short-answer)
2. [The models and their licences](#2-the-models-and-their-licences)
3. [What the licences say](#3-what-the-licences-say)
4. [Does "non-commercial" reach the outputs? What cleanup changes](#4-does-non-commercial-reach-the-outputs-what-cleanup-changes)
5. [What every shipped AI-assisted asset records](#5-what-every-shipped-ai-assisted-asset-records)
6. [What may ship](#6-what-may-ship)
7. [The name check](#7-the-name-check)
8. [Open decisions for the owner](#8-open-decisions-for-the-owner)
9. [Part 2: the origin report](#9-part-2-the-origin-report)

---

## 1. The short answer

- **Round 1's chosen look is almost all FLUX.2-dev** — 84 of the 91 winning image sets, all 7 text
  items among them ([art-bible-v2.md](art-bible-v2.md#21-who-won)) — and round 2 is planned to make
  every followup and edit with FLUX.2-dev too. **FLUX.2-dev and FLUX.1-dev are under Black Forest
  Labs' non-commercial licences.** Their outputs clause says outputs may be used commercially, but
  the same licences grant the *model* only for non-commercial purposes, forbid using "any data
  produced by" the model for commercial purposes, and Black Forest Labs' own help centre says
  running FLUX.2 [dev] yourself for commercial work needs a commercial licence. The texts pull in
  two directions. **Until Black Forest Labs answers in writing, or a commercial licence covers it,
  no FLUX-made image should ship, as pixels or as the declared basis of a redraw** — and the
  decision is most urgent *before* round 2 adds 203 more FLUX images (open decision 1).
- **SD3.5 Large** (6 terrain swatches): outputs may be used commercially by a licensee whose group
  earns **under USD 1 million a year**, after a free **registration** with Stability AI. The
  swatches are material references for hand-pixelled tiles anyway (bible §5.9).
- **Qwen-Image** and **Wan2.2-T2V-A14B**: **Apache 2.0**. The licence puts no condition on outputs;
  they may ship, after the usual review.
- **LTX-2.5** (video): free commercial use for a licensee whose group earns **under USD 10 million a
  year**, but every LTX-made clip must be **expressly disclaimed as machine generated** where it is
  shown, and any watermark or provenance data the model embeds must be kept.
- **Cleanup changes nothing about the licence.** It changes what part of the shipped sprite is
  human-authored (copyright), and it does not remove any store's AI-disclosure duty.

## 2. The models and their licences

Verdicts: **ship** — the output may be used that way, with the conditions listed; **hold** — not
until the open question is answered. The `id` after each licence is what a provenance record's
`licence` field holds (section 5); `art-prompts/ingest/models.json` keeps the same verdicts per
model, and `test/scripts/art-origins.test.ts` fails when this table and that file disagree.

| Model (repo used) | Licence | Outputs in a sold game as pixels? | As a design reference? | Conditions on outputs | Attribution / notice | Revenue limit | Our use so far |
|---|---|---|---|---|---|---|---|
| **FLUX.2-dev** (`black-forest-labs/FLUX.2-dev` + transformer `lmsys/flux2-dev-modelopt-fp8-sglang-transformer`) | [FLUX Non-Commercial License v2.1](https://huggingface.co/black-forest-labs/FLUX.2-dev/blob/main/LICENSE.md) (web copy: [v2.0, 2025-11-25](https://bfl.ai/legal/non-commercial-license-terms)); id `flux-nc-2.1` | **hold** — §2(d) allows it, §1(c) / §2(a) / §4(a) and BFL's help centre say commercial use needs a commercial licence (§3.1, §4) | **hold** — lower risk than pixels, but the strict reading covers it too | content filter **or** a review for unlawful / infringing content before distribution (§2(e)(i)); AI disclosure where law requires (§2(e)(ii)); never used to train a competing model (§2(d)) | none for outputs (the notice of §3 is for redistributing the model, which we never do) | none — a commercial licence is sold by volume ([bfl.ai/licensing](https://bfl.ai/licensing)) | 84 of 91 round-1 winners, incl. all 7 text items; all 203 round-2 followups and every comment edit planned |
| **FLUX.1-dev** (`black-forest-labs/FLUX.1-dev`) | [FLUX.1 [dev] Non-Commercial License v1.1.1](https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/LICENSE.md); id `flux1-dev-nc-1.1.1` | **hold** — same clauses as FLUX.2-dev | **hold** | as FLUX.2-dev | as FLUX.2-dev | as FLUX.2-dev | 1 winner: the ending "the deep is still" |
| **SD3.5 Large** (`stabilityai/stable-diffusion-3.5-large`) | [Stability AI Community License, 2024-07-05](https://stability.ai/community-license-agreement) ([repo copy](https://huggingface.co/stabilityai/stable-diffusion-3.5-large/blob/main/LICENSE.md)); id `stability-community-2024-07-05` | **ship**, after registering, while under the revenue limit | **ship** | the Acceptable Use Policy (IV(b)); no use to build a foundation model; you own outputs "to the extent permitted by applicable law" (IV(c)(iii)) | IV(a)'s "Powered by Stability AI" + Notice file are tied to distributing the model or a Derivative Work, which excludes outputs — ambiguous for a game that ships outputs only (§3.3) | **USD 1 M** annual revenue of the licensee and its Affiliates, from any source; above it the licence ends and an Enterprise licence is needed | 6 winners: terrain swatches (AZURE VERGE, BRINE NEBULA, DUNE EXPANSE, MAGMA DEEP, TEMPEST RIDGE, ABYSSAL THRONE) |
| **Qwen-Image** (`Qwen/Qwen-Image`; and `Qwen/Qwen-Image-Edit-2511`, the `qwenedit` group of `gen-candidate.mjs`) | [Apache 2.0](https://huggingface.co/Qwen/Qwen-Image/blob/main/LICENSE) (Edit-2511: [apache-2.0](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)); id `apache-2.0` | **ship** | **ship** | none in the licence | none for outputs (Apache's NOTICE and licence copy are for redistributing the model) | none | 0 winners (82 round-1 candidates); the Apache alternative if FLUX images must be replaced |
| **Wan2.2-T2V-A14B** (served as `Wan-AI/Wan2.2-T2V-A14B-Diffusers`) | Apache 2.0 ([model card](https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B); [licence text](https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt)); id `apache-2.0` | **ship** | **ship** | the card: usage "must not involve sharing any content that violates applicable laws, causes harm …" | none for outputs | none | video slot a: the 29 text-to-video clips of round 1 |
| **LTX-2.5** (`Lightricks/LTX-2.5-Diffusers`) | [LTX-2.x Community License Agreement, 2026-08-11](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x); id `ltx-2.x-community-2026-08-11` | **ship**, with the disclaimer, while under the revenue limit | **ship** | **disclaim each clip as machine generated where it is shown** (Attachment A (5)); keep any watermark, metadata or provenance on the output (§6, A (19)); comply with AI transparency law (§6) | no credit duty; the disclaimer is the duty | **USD 10 M** annual revenue of the licensee and everything under common control (§1.6, §2.1) | video slot b for the same 29 clips; the 5 image-to-video clips of round 2 |
| LTX-Video (`Lightricks/LTX-Video`, the fallback) | per checkpoint; 0.9.6 and later: [LTX-Video Open Weights License 0.X](https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt); id `ltxv-open-weights-0.x` | **hold** until the checkpoint, and so its licence, is known; then as LTX-2.5 | **hold**, as pixels | as LTX-2.5 (its Attachment A (e) is the same disclaimer) | as LTX-2.5 | USD 10 M (liquidated damages of double the fee if exceeded unlicensed) | not used in the v2 rounds; 18 clips of the 2026-10-09 model sweep under `art-prompts/output/ltxvideo/` |

**A model not in this table may not make shipped art** until its row is filled: licence read in
full, URL, date, verdict.

The repo also holds the **2026-10-09 model sweep** under `art-prompts/output/` — 122 FLUX.2-dev,
85 FLUX.1-dev, 187 SD3.5 Large and 18 Qwen-Image images, 29 Wan2.2 and 18 LTX-Video clips, each with
a sidecar naming its `served_model`. They compared the models before R0-04 and are not game art;
nothing ships from them. Round 1's candidates and winners are not committed (they live in the
unversioned `art-prompts/v2/candidates/` and on the picker page); round 2 commits the winners to
`art-prompts/v2/winners/`.

## 3. What the licences say

### 3.1 FLUX.2-dev (and its FP8 transformer)

The repo the server loads is gated behind [the licence](https://huggingface.co/black-forest-labs/FLUX.2-dev/blob/main/LICENSE.md),
whose file is titled **"FLUX Non-Commercial License v2.1"** (the web copy at
[bfl.ai/legal/non-commercial-license-terms](https://bfl.ai/legal/non-commercial-license-terms) is
v2.0, last revised November 25, 2025; every clause quoted here reads the same in both, with
"FLUX [dev] Model" for "FLUX Model"). The FP8 transformer, [`lmsys/flux2-dev-modelopt-fp8-sglang-transformer`](https://huggingface.co/lmsys/flux2-dev-modelopt-fp8-sglang-transformer),
is a quantised copy with no licence of its own; its card says "The original base model license and
usage terms still apply." It is a FLUX Derivative, so everything below applies to it.

What allows commercial use of outputs:

> **§2(d) Outputs.** "We claim no ownership rights in and to the Outputs. You are solely
> responsible for the Outputs you generate and their subsequent uses in accordance with this
> License. You may use Output for any purpose (including for commercial purposes), except as
> expressly prohibited herein. You may not use the Output to train, fine-tune, or distill a model
> that is competitive with a FLUX Model."

> **Model card**, Key Features 6: "Generated outputs can be used for personal, scientific, and
> commercial purposes, as described in the FLUX [dev] Non-Commercial License."

What restricts it:

> **§1(c)** "'Non-Commercial Purpose' means any of the following uses, but only so far as you do
> not receive any direct or indirect payment arising from the use of the FLUX Model, Derivatives,
> or Content Filters (as defined below): (i) personal use for research, experimentation, and
> testing for the benefit of public knowledge, personal study, private entertainment, hobby
> projects, or otherwise not directly or indirectly connected to any commercial activities,
> business operations, or employment responsibilities; (ii) use by commercial or for-profit
> entities for testing, evaluation, or non-commercial research and development in a
> non-production environment; […] For clarity, use (a) for revenue-generating activity, (b) in
> direct interactions with or that has impact on end users, or (c) to train, fine tune, or distill
> other models for commercial use, in each case, is not a Non-Commercial Purpose."

> **§2(a)** "[…] a non-exclusive, worldwide, non-transferable, non-sublicensable, revocable,
> royalty free, and limited license to access, use, create Derivatives of, and Distribute the FLUX
> Model and Derivatives solely for your Non-Commercial Purposes."

> **§4(a)** "You will not, and will not permit, assist or cause any third party to […] use,
> modify, copy, reproduce, create Derivatives of, or Distribute the FLUX Model (or any Derivative
> thereof, or any data produced by the FLUX Model), in whole or in part, (i) for any commercial or
> production purposes, […]"

> **BFL help centre**, ["How does FLUX licensing work?"](https://help.bfl.ai/articles/9272590838-self-serve-dev-license-overview-pricing),
> table "Open-weights licenses (running locally without a paid license)": "FLUX.2 [dev] | Yes |
> FLUX Non-Commercial: commercial license required" (the same for FLUX.1 [dev]; "FLUX.2 [klein]
> 4B | … | Apache 2.0: free commercial use, no license needed").

Duties on any output (both FLUX licences):

> **§2(e)** "You may access, use, Distribute, or create Output of the FLUX Model or Derivatives if
> you: (i) (A) implement and maintain content filtering measures ('Content Filters') […] or (B)
> ensure Output undergoes review for unlawful or infringing content before public or non-public
> distribution, display, transmission or dissemination; and (ii) ensure Output includes disclosure
> (or other indication) that the Output was generated or modified using artificial intelligence
> technologies to the extent required under applicable law."

The art round serves the weights through SGLang, not through BFL's reference code (whose input and
output filters the model card describes), so unless filters are confirmed on, the project relies on
(B): the owner's review. That review is recorded per image (section 5).

### 3.2 FLUX.1-dev

[FLUX.1 [dev] Non-Commercial License v1.1.1](https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/LICENSE.md):
§1(c), §2(a), §2(d), §2(e) and §4(a) are worded as in 3.1 (with "FLUX.1 [dev] Model" for "FLUX
Model"; §2(d) also names FLUX.1 Kontext [dev] among the models outputs may not train). The model
card says the same as FLUX.2's: "Generated outputs can be used for personal, scientific, and
commercial purposes as described in the FLUX.1 [dev] Non-Commercial License." Same verdict.

### 3.3 Stable Diffusion 3.5 Large

[Stability AI Community License Agreement](https://stability.ai/community-license-agreement), "Last
Updated: July 5, 2024" (identical to the repo's `LICENSE.md`):

> **III. Commercial Use License.** "'Commercial Purpose' means any purpose other than a Research
> Purpose or Non-Commercial Purpose that is primarily intended for commercial advantage or monetary
> compensation to You or others, including but not limited to, (i) creating, modifying, or
> distributing Your product or service […] If You are using or distributing the Stability AI
> Materials for a Commercial Purpose, You must register with Stability AI at
> (https://stability.ai/community-license). If at any time You or Your Affiliate(s), either
> individually or in aggregate, generate more than USD $1,000,000 in annual revenue (or the
> equivalent thereof in Your local currency), regardless of whether that revenue is generated
> directly or indirectly from the Stability AI Materials or Derivative Works, any licenses granted
> to You under this Agreement shall terminate as of such date. You must request a license from
> Stability AI at (https://stability.ai/enterprise) […]"

> **IV(c)(iii) Ownership of Outputs.** "As between You and Stability AI, You own any outputs
> generated from the Models or Derivative Works to the extent permitted by applicable law."

> **IV(b) Use Restrictions.** "Your use of the Stability AI Materials and Derivative Works,
> including any output or results of the Stability AI Materials or Derivative Works, must comply
> with applicable laws and regulations […] and adhere to the Documentation and Stability AI's AUP
> […] You will not use the Stability AI Materials or Derivative Works, or any output or results
> […] to create or improve any foundational generative AI model […]"

> **IV(a) Distribution & Attribution.** "If You distribute or make available the Stability AI
> Materials or a Derivative Work to a third party, or a product or service that uses any portion of
> them, You shall: (i) provide a copy of this Agreement to that third party, (ii) retain the
> following attribution notice within a 'Notice' text file […] and (iii) prominently display
> 'Powered by Stability AI' on a related website, user interface, blogpost, about page, or product
> documentation."

**Ambiguous:** "Derivative Work(s)" is defined to "not include the output of any Model", so a game
that ships only outputs arguably neither distributes the Materials nor "uses any portion of them",
and IV(a) would not apply. And IV(c)(i) forbids using Stability's names and marks "except as
required under Section IV(a)", so adding "Powered by Stability AI" just in case is not free of
conditions either. **Ask Stability** (at registration) whether a product that contains only
outputs owes IV(a)'s notice.

### 3.4 Qwen-Image

The repo's [`LICENSE`](https://huggingface.co/Qwen/Qwen-Image/blob/main/LICENSE) is the Apache
License 2.0; the card: "Qwen-Image is licensed under Apache 2.0." Apache 2.0 governs the model
("the Work") and its Derivative Works; it says nothing about images the model makes, and its
conditions (a copy of the licence, the NOTICE file, change notices — §4) apply when the model is
redistributed, which the project never does. No trademark rights are granted (§6), so "Qwen" is used
only to describe where an image came from. `Qwen/Qwen-Image-Edit-2511` is tagged `apache-2.0` too.

### 3.5 Wan2.2-T2V-A14B

Both repos ([`Wan-AI/Wan2.2-T2V-A14B`](https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B) and the
`-Diffusers` one the server loads) are tagged `apache-2.0`; their cards point to a `LICENSE.txt`
that neither repo contains (2026-10-17) — the text is in the
[GitHub repo](https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt). The card's "License
Agreement":

> "The models in this repository are licensed under the Apache 2.0 License. We claim no rights over
> the your generated contents, granting you the freedom to use them while ensuring that your usage
> complies with the provisions of this license. You are fully accountable for your use of the
> models, which must not involve sharing any content that violates applicable laws, causes harm to
> individuals or groups, disseminates personal information intended for harm, spreads
> misinformation, or targets vulnerable populations."

### 3.6 LTX-2.5 (and the LTX-Video fallback)

The [card](https://huggingface.co/Lightricks/LTX-2.5-Diffusers) names
`ltx-2.x-community-license-agreement` with the link
[`LICENSE-2_x`](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x) ("License date: August
11, 2026"; the card's second link, `LICENSE.md`, did not resolve on 2026-10-17). The card's summary,
under the heading "Under $10M annual revenue": "Commercial and production use at no cost under the
LTX-2.x Community License."

> **§2.1** "[…] for any purpose, subject to the restrictions set forth in Attachment A; provided
> however, that Entities with annual revenues of at least $10,000,000 (the 'Commercial Entities')
> are required to obtain a paid license for any use (excluding use solely for a Non-Commercial
> Purpose as set forth in Section 2.2) of LTX-2.x […]"

> **§1.6** "[…] When determining whether an Entity meets any threshold under this Agreement
> (including revenue thresholds in Section 2.1), all subsidiaries, affiliates, and companies under
> common Control shall be considered collectively."

> **§5 The Output You Generate.** "Except as set forth herein, Licensor claims no rights in the
> Output you generate using LTX-2.x. You are accountable for input you insert into LTX-2.x, the
> Output you generate and its subsequent uses. No use of the Output can contravene any provision
> as stated in the Agreement."

> **Attachment A**, "you agree not to use the Outputs, LTX-2.x or its Derivatives in any of the
> following ways: […] 5) To generate or disseminate information and/or content (e.g. images, code,
> posts, articles), and place the information and/or content in any context (e.g. bot generating
> tweets) without expressly and intelligibly disclaiming that the information and/or content is
> machine generated; […] 19) To circumvent, disable, or interfere with any technical limitations,
> safety features, content filters, watermarking, content provenance or latent disclosure
> functionalities, or use restrictions implemented in LTX-2.x by Licensor; […]"

> **§6** "[…] You shall maintain (including within any application or service through which
> LTX-2.x, any Derivative of LTX-2.x, or any Output is made available), and shall not remove,
> disable, alter, or circumvent, any safety or security measures, disclosures, metadata,
> watermarking, content provenance, latent disclosure, or other transparency features or
> functionalities included or embedded within LTX-2.x or any Derivative of LTX-2.x, or applied to
> any Output, in furtherance of AI Regulations […]"

**Ambiguous:** whether re-encoding a clip for a trailer (which can drop container metadata) counts
as "removing" something "applied to any Output" depends on what LTX-2.5 embeds, which its card does
not say. **Ask Lightricks** (licensing@ltx.io) what LTX-2.5 embeds and whether a re-encoded,
disclaimed clip complies.

**LTX-Video** (the fallback): one licence per checkpoint
([card](https://huggingface.co/Lightricks/LTX-Video)); 0.9.6 and later are under the
[LTX-Video Open Weights License 0.X](https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt):
the same USD 10 M threshold (§2, with liquidated damages "equal to double the amount" for
unlicensed use above it), §5 on Output worded as above, and Attachment A (e) — the same
machine-generated disclaimer. If one of its clips is ever used, record which checkpoint the server
loaded.

## 4. Does "non-commercial" reach the outputs? What cleanup changes

**FLUX (both).** Two readings of the same text:

- *Lenient:* outputs are not Derivatives (§1(a)), the outputs clause §2(d) says "any purpose
  (including for commercial purposes)", and the model card repeats it. Generating images on one's
  own server and using them in a product is using the outputs, which is allowed.
- *Strict:* the only grant to *use the model* is "solely for your Non-Commercial Purposes" (§2(a)),
  and generating art for a game that will be sold is "connected to […] commercial activities" and
  "for revenue-generating activity" (§1(c)) — so the generation itself was outside the grant. §2(d)'s
  "except as expressly prohibited herein" then meets §4(a), which forbids using the model "(or any
  Derivative thereof, or any data produced by the FLUX Model), in whole or in part, (i) for any
  commercial or production purposes". BFL's
  own help centre lists FLUX.2 [dev] and FLUX.1 [dev] as "commercial license required" for running
  them yourself.

Both readings are defensible from the text, and the licensor's own statements support each one.
That is a question for the licensor, not for this page. **Ask Black Forest Labs in writing**
(the contact on [bfl.ai/licensing](https://bfl.ai/licensing)):

1. "We generated images with FLUX.2 [dev] and FLUX.1 [dev] on our own server (weights from Hugging
   Face, the FP8 transformer `lmsys/flux2-dev-modelopt-fp8-sglang-transformer`), during the
   development of a game that will be sold on TV app stores, Steam and itch.io. We never
   distribute the model. Under §2(d), may these Outputs ship in the game, its store pages and
   trailers — as cleaned-up pixel art, or only as references for hand-drawn art?"
2. "Do §1(c) and §4(a) ('any data produced by the FLUX Model') make the generation itself a
   commercial use that needs a Self-Hosted Commercial License? If so, which tier covers one game's
   assets (a few hundred images), and does it cover Outputs generated **before** the licence was
   bought?"
3. "Does the manual review of every image before release satisfy §2(e)(i)(B)?"

**SD3.5, LTX: no.** Their limits are on *who* the licensee is (revenue), not on the outputs, and
both state that outputs belong to the user (SD3.5 IV(c)(iii); LTX §5 "claims no rights"). Apache
2.0 (Qwen-Image, Wan2.2) does not address outputs at all.

**What "cleanup into hand pixel art" changes:**

| | Changes? | Why |
|---|---|---|
| The licence | **No** | the licences attach to the use of the model and to what it produced "in whole or in part" (FLUX §4(a)); a keyed, downscaled, quantised and hand-edited sprite is still made from the output. Cleanup does not turn an unlicensed image into a licensed one. A redraw *from scratch* with the image only beside the canvas is a weaker tie, but the strict FLUX reading still reaches it |
| Copyright in the result | **Yes, for the human part** | the U.S. Copyright Office ([Part 2 report, 2025-01-29](https://www.copyright.gov/newsnet/2025/1060.html)): "the outputs of generative AI can be protected by copyright only where a human author has determined sufficient expressive elements. This can include situations where […] a human makes creative arrangements or modifications of the output, but not the mere provision of prompts." The more of a sprite is hand work, the more of it is the project's own |
| Store disclosure | **No** | Steam asks about content "created with the help of AI tools during development"; itch.io asks every project to tag "materials produced by generative AI", and for asset pages adds "Assets comprised of generative AI (even if modified afterwards)" ([store-submission.md](../client/store-submission.md#ai-content-disclosure-every-store)) |
| The trade-dress risk | **Yes, for the better** | hand cleanup is the moment a look-alike detail (a logo, a familiar ship silhouette, stray text) is caught and removed — the review FLUX §2(e)(i)(B) asks for anyway |

## 5. What every shipped AI-assisted asset records

The ingest tool (R3-02) writes `<path>.art.json` next to each real-art PNG under
`assets/source/sprites/` (staged in `art-prompts/v2/ingested/` until R2-01). The plan names its base
fields — "model, prompt file and entry, seed, source file SHA-256, recipe hash, date, hand-cleaned:
yes/no". R3-05 needs a few more, so that a record alone answers "may this ship?". R3-02 built the
record (`shmup-art-provenance@1`) on this table; the last column gives each field's name **as
built** — the names the origin report (section 9) reads. The full schema:
[real-assets.md](real-assets.md#the-provenance-record-nameartjson-shmup-art-provenance1).

| Field | What | Why | As built |
|---|---|---|---|
| `origin` | `ai-assisted` \| `hand` \| `procedural` | the origin report's three classes (hand-drawn overrides without AI carry a record too, or a `LICENSES.md` entry, as R3-02's test demands) | `origin`: `ai-assisted` \| `hand` only — `procedural` is derived (a sprite with no override PNG), never recorded. A source or an edit reference that names a model makes the sprite `ai-assisted`, so a hand redraw of an AI image is too |
| `model` | the served model id, e.g. `black-forest-labs/FLUX.2-dev` | the licence row of section 2 | **per source** (a sprite can be cut from several images): `sources[].model` (the served id, `null` for a hand-made source) and `sources[].modelKey` (the `models.json` group: `flux1`, `flux2`, `sd35`, `qwenvl`, `qwenedit`, `wan22`, `ltx25`, `ltxvideo`) |
| `weights` | repo + revision of the weights, and any override (the FP8 transformer) | licences are per repo and per checkpoint (LTX-Video) | `sources[].weights`, from `models.json` |
| `licence` | an id of section 2: `flux-nc-2.1`, `flux1-dev-nc-1.1.1`, `stability-community-2024-07-05`, `apache-2.0`, `ltx-2.x-community-2026-08-11`, `ltxv-open-weights-0.x` | the report cross-checks it against `model`; a new id needs a new row here first | `sources[].licence`, from `models.json` (`LICENCE_IDS` in `art-prompts/ingest/lib/provenance.mjs`). The ship / hold **verdicts** are not in the record: they are policy, kept in `models.json` per licence id — change one there and here together |
| `prompt` | prompt file + entry id (e.g. `images/30-bosses/07-facet-monarch.json#fm07-…`), and the positive / negative text as sent | the name check (section 7) can read it; a prompt edited after generation is still known | `sources[].prompt` `{ file, entry, text, negative }` |
| `seed`, `size`, `steps`, `guidance` | generation settings | reproducibility | per source, as named |
| `source` | path and **SHA-256** of the generated file | ties the PNG to one exact output | `sources[]` `path`, `sha256`, `format`, `width`, `height`; `generator` names the candidate sidecar it was read from |
| `reference` | for an edit or an image-to-video clip: the SHA-256 of the input image and its own record | an edit of a FLUX image inherits FLUX's question, whatever model edits it | `sources[].reference[]`, one per input image: `path` (always a **committed** file — a git-ignored candidate is mapped to its copy under `art-prompts/v2/winners/`), `from` (the `editFrom` entry it stands for, or `null`), `sha256`, `sidecar`, `sidecarSha256`, and from that sidecar the `model`, `modelKey`, `weights` and `licence` that made it, plus its own nested `reference` list (an edit of an edit) |
| `generatedAt`, `ingestedAt` | ISO dates | licences change over time; the version in force on the date matters | `sources[].generatedAt`; `ingestedAt` (`YYYY-MM-DD`, the plan's "date") at the top |
| `reviewed` | date and who reviewed the output for unlawful or infringing content (look-alikes, logos, text) | FLUX §2(e)(i)(B); the trade-dress review | `reviewed` `{ on, by }`, or `null` until reviewed |
| `use` | `pixels` \| `reference` | section 2's two columns | `use` |
| `cleanup` | `none` (ingest only: key, downscale, quantise, outline) \| `light` (hand-edit layer touches up edges and details) \| `heavy` (most of the sprite repainted) \| `redrawn` (hand-drawn; the AI image was only a reference) | what cleanup changes (section 4); R3-02's `hand-cleaned: yes/no` is `cleanup ≠ none` | `cleanup`, and `handCleaned` = `cleanup ≠ none` |
| `recipe` | the recipe's hash | R3-02's determinism | `recipe` `{ path, sha256 }`; also `edit` (the hand-edit layer's hash and painted / erased counts), `output` (the PNG's and sidecar's hashes, frames, colours, alpha), `tool`, `author`, `notes`, `sprite` |

Video clips (trailer, attract, store) get the same record next to the edited clip, plus where the
machine-generated disclaimer is shown (LTX).

## 6. What may ship

Until the owner's decisions in section 8 change them:

1. **Nothing made by FLUX.2-dev or FLUX.1-dev ships** — not as pixels, not as an edit reference
   for another model, not as the declared basis of a redraw — until Black Forest Labs confirms in
   writing or a commercial licence covers it. They stay usable for picking and evaluation.
2. **SD3.5 Large outputs** ship only after the Stability registration, and only while the
   licensee's group earns under USD 1 M a year.
3. **Qwen-Image and Wan2.2 outputs** may ship, after review, with their record.
4. **LTX-2.5 clips** may ship (trailers, attract, store pages) only with a visible "machine
   generated" note where each is shown, with any embedded provenance kept, and while the
   licensee's group earns under USD 10 M a year.
5. **Every AI-assisted asset is reviewed** before it ships: no look-alike of a known character,
   ship, logo or game; no stray text; the trade-dress review of the store pages covers the key art.
6. **Every shipped AI-assisted asset has its `.art.json`** (section 5); the origin report fails
   without it.
7. **No prompt names a game, studio, artist or character** (section 7).
8. **The store disclosures are filled in** ([store-submission.md](../client/store-submission.md#ai-content-disclosure-every-store)).
9. **A model not in section 2 makes no shipped art** until its row is filled.

## 7. The name check

[`test/integration/art-prompt-names.test.ts`](../../test/integration/art-prompt-names.test.ts)
(part of `pnpm test`; `pnpm test:integration`) reads every text file under `art-prompts/` — the
kernels, the prompt sources, the compiled libraries, the v2 picks manifest, the committed outputs'
sidecars — and the ingest tool's `*.art.json` / `*.recipe.json` under `assets/source/`, and fails
on a denylist:

- the series the game is in the spirit of, their makers and the names
  [`shmup_feat.md`](../old/shmup_feat.md) §26 bans, and the bosses and ships of its appendices A
  and B;
- other shoot-'em-up series and makers, the game and film franchises image models reproduce on
  request, artists used as style shortcuts, and console names;
- style-reference phrases: "in the style of", "in the manner of", "homage to", "fan art", the art
  sites used to steer a look ("artstation" …).

Words that are also everyday English stay off the list on purpose (cave, treasure, salamander,
halo …; the test lists them) — a check that fails on ordinary prose gets switched off. The scan is
read-only and skips `node_modules/` and the unversioned `art-prompts/v2/candidates/`, so it reads
the same files on every machine; round 2's winners (`art-prompts/v2/winners/`) and R3-02's staged
output (`art-prompts/v2/ingested/`) are scanned once they are committed.

**What it found (2026-10-17):**

| Where | Hit | Status |
|---|---|---|
| the whole committed library | no game, series, studio, artist or character name | — |
| kernel K1 (`art-prompts/images/00-style-kernel.md`), so most prompts — ~1,400 uses, 138 in the v2 manifest | **"SNES"** as an era word ("SNES-era 16-bit pixel art …") — a console trademark, not a game, studio or character | allowed in the test, pending open decision 6 |
| `art-prompts/v2/manifest.json`, item `boss/facet-monarch` | **"crystal core"** in the picker *label* ("the crystal core with an orbiting crown"), not in the prompt; also a boss name in the series (feat appendix A) | pinned in the test (`KNOWN_HITS`); `art-prompts/v2/` is the art round's, so it is reported, not edited — open decision 7 |
| `art-prompts/v2/candidates/a/video/zone-montage-a.json` (unversioned, not scanned) | "in the style of a side-scrolling arcade game" in the prompt that was sent | names no game; reword if the clip is regenerated — open decision 7 |

The game's own content also calls FACET MONARCH "the crystal core" in prose
(`content/enemies/README.md`, docs); that is outside this check and is for the trade-dress review.

**When it fails:** reword the prompt in plain words ([art-bible-v2.md](art-bible-v2.md#7-writing-prompts-for-this-bible)).
A hit in a file no agent may edit is reported and pinned in `KNOWN_HITS` with its reason; the pin
is exact, so a pinned hit that disappears fails too, and its row is removed then.

## 8. Open decisions for the owner

1. **FLUX — before round 2.** Ask Black Forest Labs the three questions of section 4, or buy a
   self-hosted commercial licence (the Platform and Professional tiers list FLUX.2 [dev]; Builder
   does not — [bfl.ai/licensing](https://bfl.ai/licensing)), or replace the 85 FLUX winners. A
   replacement made *from* a FLUX image (an edit, an image-to-video start frame) inherits the
   question; a clean replacement starts from the text prompt with an Apache 2.0 model (Qwen-Image;
   FLUX.2 [klein] 4B is Apache 2.0 too, per BFL, but is not installed) or from hand art. Round 2
   as planned makes all 203 followups and every comment edit with FLUX.2-dev, so deciding first
   avoids multiplying the question.
2. **Who is the licensee?** A person or a company, and which companies are its Affiliates (SD3.5:
   "You or Your Affiliate(s)", USD 1 M; LTX: "all subsidiaries, affiliates, and companies under
   common Control", USD 10 M). Both limits count all revenue, not only the game's.
3. **Register with Stability AI** ([stability.ai/community-license](https://stability.ai/community-license))
   before any SD3.5-derived pixel ships, and ask whether IV(a)'s notice applies to a product that
   contains outputs only.
4. **LTX clips:** the wording and place of the machine-generated note on each clip (trailer card,
   store video caption, attract screen), and the watermark question of §3.6 for Lightricks.
5. **Credits:** none of the licences requires naming a model in the game for outputs (SD3.5 is the
   open case, decision 3). Naming the AI tools in the credits or an About page is still the honest
   default and matches the store disclosures.
6. **"SNES" in the prompts.** About 1,400 uses as an era word. It names Nintendo's console, not a
   game; the art bible's own rule is to describe the look ("16-bit era"). Keep it, or change the
   kernels to "16-bit era" for round 2 (and then remove the allowance from the test).
7. **Two wordings in the art round's files:** the FACET MONARCH label "the crystal core …" in
   `art-prompts/v2/manifest.json`, and the zone-montage clip's "in the style of a side-scrolling
   arcade game" (in the candidates). Neither names a game; both are cheap to reword after round 2.
8. **The store disclosure texts** ([store-submission.md](../client/store-submission.md#ai-content-disclosure-every-store)),
   including what is not art: the Spanish and Japanese translations were written by a build agent,
   and so was much of the in-game text, the placeholder music and sound data and the code — and
   Steam's survey names "narrative, localization" and "sound". Confirm which of it ships.
9. **Copyright registration**, if ever wanted: the U.S. Copyright Office asks applicants to
   identify AI-generated material and claim only the human part
   ([registration guidance, March 2023](https://www.copyright.gov/ai/ai_policy_guidance.pdf)).

## 9. Part 2: the origin report

R3-05's second half — "a script that lists every shipped sprite by origin (procedural /
hand-drawn / AI-assisted + model)", run in CI, that "lists no sprite without provenance" — is
**built** (2026-10-17): [`scripts/art-origins.mjs`](../../scripts/art-origins.mjs), run in CI by
[`test/scripts/art-origins.test.ts`](../../test/scripts/art-origins.test.ts) (part of
`pnpm test`, so `ci.yml` is unchanged). Today it passes trivially — every sprite is procedural and
no override PNG exists — and it starts to bite when R3-02's real ingest puts art under
`assets/source/sprites/` or into the staging folder.

### 9.1 Running it

```bash
node scripts/art-origins.mjs            # counts by origin × kind and by served model
node scripts/art-origins.mjs --list     # … and one row per sprite: origin, kind, source, models, status
node scripts/art-origins.mjs --json     # the whole report as JSON
node scripts/art-origins.mjs --check    # exit 1 on any failure (warnings never fail)
```

`--source DIR`, `--staging DIR` and `--models FILE` point it at other trees (the test's temporary
copies). Exit codes: **0**; **1** when `--check` finds a failure, or when no report can be built (a
missing source folder, a broken `models.json`); **2** on bad usage. There is no `pnpm` script, on
purpose (W3-12 below). On 2026-10-17 it prints:

```text
Art origins: 438 sprites in the atlas from assets/source (models: art-prompts/ingest/models.json)
Staging folder art-prompts/v2/ingested: absent

Shipped sprites by origin and kind:
  origin      generator  pixel-map  font  flash  p2  total
  procedural  252        49         1     132    4   438
Shipped sprites by served model (as a source or an edit reference):
  none — no sprite names a model

0 failures, 0 warnings
```

### 9.2 What it reads

- **The asset pipeline's own sprite list**, `collectSprites()` of `scripts/assets/pipeline.mjs`
  (read-only), so the report covers exactly what the atlas packs and "procedural" is derived, never
  declared. Each sprite's `origin` string gives its class:

  | `origin` | Origin | Kind |
  |---|---|---|
  | `procedural:<module>` | procedural | `generator` |
  | `…/<name>.sprite.json` | procedural | `pixel-map` |
  | `…/<name>.font.json` | procedural | `font` |
  | `flash:<base>`, `p2:<base>` | the base's | `flash`, `p2` — the base's models, record and status too |
  | ends in `.png` (an override PNG, alone or `<base> + <png>`) | the record's `origin`: `ai-assisted` or `hand` | `record` — or `hand` / `licensed` for a `LICENSES.md` entry, `unknown` / `untraced` with neither |
  | anything else | `unknown` | `unclassified` (rule 6) |

- **Each override's `<name>.art.json`**, through the ingest tool's dependency-free
  `art-prompts/ingest/lib/provenance.mjs` (`checkProvenanceTree`, `validateRecord`, `loadModels`,
  `isUnversioned`), imported rather than restated. A PNG with no record and no tree issue is the
  tree check's `LICENSES.md` case.
- **`art-prompts/ingest/models.json`**: every source and every **nested** edit reference is joined
  to its row by `modelKey` (else by served id), and to the verdicts by licence id as well.
- **The staging folder** `art-prompts/v2/ingested/` while it exists (its overrides through
  `loadSpriteSources`). Never the git-ignored candidates, never the winners.

### 9.3 The rules

In the shipped tree every finding **fails**. In the staging folder rules 1, 2 and 6 fail and rules
3–5 only **warn**: art may wait there for its review or for the FLUX decision, but not with a
broken record.

1. **Traced** — every issue of `checkProvenanceTree`: an override PNG with neither a record nor a
   `LICENSES.md` entry, an invalid record, a record without its PNG, a PNG or sidecar changed since
   ingest, a recipe never ingested.
2. **In the model table** — every source and edit reference that names a model names one of
   `models.json`, with the table's served id and licence id; a `null` licence fails (re-ingest once
   the model has its row — section 6 rule 9).
3. **Nothing on hold** — no image anywhere in a record's source or reference tree, at any depth, has
   the verdict `hold` for the record's `use`, by its model's row or by any row with its recorded
   licence id. This is section 6 rule 1's FLUX gate: a Qwen edit of a FLUX image holds, and so does
   a FLUX licence on a model the table lacks.
4. **Reviewed** — an `ai-assisted` record has `reviewed` set (section 6 rule 5).
5. **A reference is a reference** — `use: "reference"` needs `cleanup` `heavy` or `redrawn`.
6. **Classified** — every sprite origin is classified and the pipeline reports no source issue; no
   recorded path (`sources[].path`, `prompt.file`, `generator.sidecar`, each reference's `path` and
   `sidecar`, `recipe.path`, `edit.path`) points into the git-ignored `art-prompts/v2/candidates/`.
   A reference's `from` — the candidate an edit was made from, mapped to its committed copy — may.

### 9.4 The defaults chosen

The owner decisions W3-10 … W3-12 (wave 3, 2026-10-17) took the recommended defaults; each is one
line of the script to relax.

- **W3-10:** `use: "reference"` with cleanup `none` or `light` **fails** (rule 5): the shipped
  pixels are still largely the model's, so the record must say `pixels` (and pass that verdict) or
  the sprite must be repainted. The ingest tool still accepts such a record; the report is the gate.
- **W3-11:** a shipped `ai-assisted` record with `reviewed: null` **fails** (rule 4); a staged one
  only warns.
- **W3-12:** pixel maps, the font, the generators and their siblings are **`procedural`** —
  repository-made placeholders (whether agent-made art needs a store disclosure is open decision
  8). No root `package.json` script: run `node scripts/art-origins.mjs`; CI runs it through Vitest.

### 9.5 What the test checks

[`test/scripts/art-origins.test.ts`](../../test/scripts/art-origins.test.ts):

- the shipped tree has no failure and no shipped finding, and every sprite the atlas packs is
  classified exactly once, consistently with the pipeline's origins. A staged warning is allowed
  there and never fails CI: an unreviewed sprite staged next to the shipped tree still gives exit 0
  with `--check`, 0 failures and 1 warning;
- the ingest tool's five fixture outputs, added as overrides to a temporary copy of
  `assets/source/`: `fixture-far` (FLUX.1-dev), `drone` and `fixture-glow` (FLUX.2-dev) hold,
  the unreviewed AI records fail rule 4, `gyre` (`reference` + `none`) fails rule 5, the hand-made
  `fringe-hull` passes;
- synthetic records for every rule: an edit of an edit of a FLUX image, a licence that is not the
  table's, an unknown model or key, a `null` licence, a FLUX licence on an unlisted model, a PNG
  with no record, a `LICENSES.md` entry, an invalid record, a candidates path, a verdict read for
  the record's own `use`;
- the staging folder warns on rules 3–5 and fails on 1, 2 and 6;
- **the licence table is filled:** section 2 names every licence id, and has a row for every
  model of `models.json` with its licence id and the same verdicts — so a verdict changed in one
  place only fails, and a model that made shipped art without a row fails rule 2;
- the command line's exit codes 0, 1 and 2.

### 9.6 Still open

- **The real run** — R3-02's manual ingest of the round-2 winners; only then does the report list
  real models.
- **The FLUX decision** (section 8, decision 1) flips `models.json` and section 2 together.
- **The licence table final** for the models whose art actually ships.
- **The prompt-library note** — a "Licences" bullet in `art-prompts/images/README.md` (shippable
  art only from a `ship` model, FLUX on hold, keep every output's sidecar for ingest). It waits for
  round 2, with R3-01's post-round-2 edits, because the art round uses the library until then.
- The owner items of section 8 (registration, LTX notices, store texts) are unchanged.

**What part 2 needed from R3-02**, and where R3-02 delivered it ([real-assets.md](real-assets.md#the-ingest-tool-art-promptsingest)):

| Need | Where |
|---|---|
| The schema and a validator to import | `art-prompts/ingest/lib/provenance.mjs`, dependency-free: `validateRecord`, `checkProvenanceTree`, `loadModels`, and the closed lists `LICENCE_IDS`, `VERDICTS`, `ORIGINS`, `USES`, `CLEANUPS` (section 5's last column names the fields) |
| The override list, and "procedural" derived | the pipeline's `collectSprites()` origins (an override's ends in its PNG's path); `loadSpriteSources(dir).overrides` for the staging folder |
| The `LICENSES.md` format | a Markdown file in the PNG's folder or any folder above it (up to `sprites/`) naming the PNG by its relative path or its sprite name in backticks, with author and licence |
| The staging folder | `art-prompts/v2/ingested/`, checked like `assets/source/sprites/` by the tool, `provenance.test.ts`, CI's `ingest` job and the report |
| Licence ids ↔ models | `art-prompts/ingest/models.json`: each model group's served id, weights, licence id and per-use verdict (`flux1`, `flux2` and `ltxvideo` are **hold** today) |

Since `4873623` the art round's `gen-candidate.mjs` records each edit input's `editFromSha256`, so
ingest can later match a winner copy byte for byte (today it matches it by its sidecar's `file`
and `generatedAt`).
