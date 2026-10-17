# The art generation server (skynet2) — runbook

The AI images for v2 (plan step **R0-04**, then R3 … R5) are made by SGLang diffusion servers on the owner's GPU
box **skynet2**. That box also runs the **main LLM**, which other work depends on. This page explains how to use
the image servers **without ever touching the LLM**, and how the art round uses them.

The one rule: **agents touch skynet2 only through [`art-prompts/v2/server.sh`](../../art-prompts/v2/server.sh).**
Generation goes through `art-prompts/v2/gen-candidate.mjs` (one image per call) or `art-prompts/generate.mjs` (library
batches) against `http://skynet2.interserver.net:30001`.

Facts below were checked read-only on 2026-10-16. Process ids change with every restart: re-detect them with
`server.sh status`, never copy them from here.

## 1. Layout

| GPUs | Port | What | Started by |
|---|---|---|---|
| **0, 1** | **30000** | the main LLM, `Qwen/Qwen3.8-Flash-Next-FP8` (tp 2, ep 2) | the owner, `/root/run_sglang_qwenflashnext9b.sh` — **never** started, stopped or signalled by agents |
| **2, 3** | **30001** | **one** image or video model at a time | `server.sh start <name>` (or the owner by hand) |

- nginx on skynet2 (`:80`, `:443`) proxies to `127.0.0.1:30000` — the LLM. It is not an image origin either.
- The clients (`generate.mjs`, `gen-candidate.mjs`, `sweep-models.sh`) default to `http://skynet2.interserver.net:30001`
  and **refuse** any origin on port 30000 and skynet2 on `:80` / `:443`, with a clear error, before sending anything.
- The header of `/etc/nginx/conf.d/vhost.conf` describes the opposite pairing (30000 on GPUs 2,3, 30001 on 0,1). That
  comment is stale; `server.sh status` shows the truth.
- The older `/root/run_sglang_qwenflashnext9.sh` runs the LLM on **all four** GPUs (tp 4). If the LLM was started
  with it, cards 2,3 are busy and `server.sh start` refuses.
- **State on 2026-10-16, 20:20 EDT:** the owner had switched the LLM to GPUs 0,1 (`run_sglang_qwenflashnext9b.sh`) and
  started `run_sglang_images_flux2dev-1.sh` by hand in a terminal. FLUX.2-dev was healthy on :30001, with ~40 GB in use
  on each of cards 2,3.

## 2. The scripts

Every image/video launcher is `/root/run_sglang_images_<name>-1.sh`. It activates `~/sglang/.venv`, sets an inline
`HF_TOKEN` and `CUDA_VISIBLE_DEVICES=2,3`, and runs `sglang serve … --host 0.0.0.0 --port 30001` in the foreground. None
of them has nohup, a log file, a pid file or a stop script, and bash stays the parent (no `exec`). Older copies live in
`/root/backup*/`. SGLang is 0.5.22.dev1308, from `/root/sglang/sglang`.

| `<name>` | `--model-path` (= served id) | Layout on cards 2,3 | Weights on disk (2026-10-16) | Reference / edit support |
|---|---|---|---|---|
| `flux1dev` | `black-forest-labs/FLUX.1-dev` | dp 2 (one copy per card), batching max 4 | **not yet** (cache stub) | text-to-image only |
| `flux2dev` | `black-forest-labs/FLUX.2-dev` + `--transformer-weights-path lmsys/flux2-dev-modelopt-fp8-sglang-transformer` | dp 2, batching max 2, warm-up 1024² and 2048×1024 | **yes** — 165 GB + 30 GB, downloaded by its first start that day | text + **one or more reference images** (`/v1/images/edits`; requests with images are not batched) |
| `qwenimage` | `Qwen/Qwen-Image` | dp 2, fp8, batching 4 | not yet | text-to-image only |
| `stablediffusion35large` | `stabilityai/stable-diffusion-3.5-large` | dp 2, batching 4 | not yet | text-to-image only |
| `ltxvideo` | `Lightricks/LTX-Video` | dp 2 | not yet | text-to-video, or text + a start image (i2v) |
| `ltx25` | `Lightricks/LTX-2.5-Diffusers` (LTX2Pipeline, fp8) | dp 2 | not yet | text-to-video, or text + a start image (i2v); no `generate.mjs` group |
| `wan22` | `Wan-AI/Wan2.2-T2V-A14B-Diffusers` | one copy across both cards (cfg-parallel), fp8 | not yet | **text-to-video only** |

- Aliases accepted by `server.sh` are the `generate.mjs` group keys: `flux1`, `flux2`, `qwen` / `qwenvl`, `sd35`.
- **Qwen-Image-Edit** (`-2509`, `-2511`, `-Layered`) is supported by SGLang, but skynet2 has only cache stubs and no
  launcher for it. Until both exist, every edit is a FLUX.2-dev edit. Verify at run time (`server.sh status` lists the
  caches; a launcher would be a new `run_sglang_images_*-1.sh`).
- **Wan2.2 image-to-video** needs `Wan2.2-I2V-A14B` or `TI2V-5B`. Both are cache stubs only. `generate.mjs`'s
  `wan2.2-i2v` entries go to the T2V model, which will likely ignore or reject the reference image.
- `run_sglang_images_qwenimage-1.sh` passes `--text-encoder-cpu-offload` **twice**, first false and then true. That is
  for the owner to fix; until then, check which one won in its log at the first start.

## 3. `server.sh`: status, start, wait, stop, verify

```text
bash art-prompts/v2/server.sh status                 # read-only
bash art-prompts/v2/server.sh start <name> [--dry-run]
bash art-prompts/v2/server.sh wait <name> [timeout-s] [--pgid N]
bash art-prompts/v2/server.sh stop <name> [--pgid N] [--dry-run]
bash art-prompts/v2/server.sh verify [--deep]        # read-only
bash art-prompts/v2/server.sh names                  # the table above, offline
```

Exit codes: **0** ok · **1** failed (launcher died, survivors, verify failed, ssh error) · **2** usage · **3** refused
by a safety check · **124** `wait` timed out. Each command runs as **one bash script on the box over
`ssh root@skynet2`**, so its checks and its signals see the same process table.

| Command | What it does |
|---|---|
| `status` | The LLM: its :30000 listener's pid, process group, uptime, model, GPUs and health. Each GPU's memory and who holds it. What listens on :30001. Running launcher groups, with their members. Free disk on `/root`. Each model's weight cache (`du -L`: plain `du` follows no symlinks and shows only the stubs' few KB). A verdict: may `start` run? |
| `start <name>` | **Preflight**, refusing on any failure: the script exists and its `grep -o`'d flags are `--model-path <expected>`, `--port 30001` only and `CUDA_VISIBLE_DEVICES=2,3`; nothing listens on :30001; no launcher group runs; cards 2,3 have no compute process and less than 1024 MiB in use (`--free-gpu-mib`); at least 150 GB free (`--min-free-gb`). Then `cd /root && nohup setsid bash /root/run_sglang_images_<name>-1.sh >/root/sglang_<name>_<YYYYMMDDTHHMMSS>.log 2>&1 </dev/null &`, and it prints `PGID=<n>` (setsid makes the launcher lead its own process group) and the log path. `--dry-run` runs the whole preflight and prints the command instead. |
| `wait <name> [timeout]` | Polls `127.0.0.1:30001/health` on the box every 15 s until it answers 200, while the launcher's process group lives. The default timeout is **10800 s (3 h)**, because a first start downloads the weights. Every minute it prints the health code (000 = not bound yet, 503 = warming up), the disk used since the first probe (download progress) and the log's last line. It then checks that `/v1/models` lists the expected model (exit 3 if not), and that `http://skynet2.interserver.net:30001` answers from this machine (a warning if not). If the launcher dies, it prints the redacted log tail and exits 1. |
| `stop <name>` | The safe stop (§4). It records the LLM's pid and start time first, signals only the image server's process group, reports survivors, waits up to 30 s for the cards to be released, then runs `verify`. `--dry-run` runs every check and prints the plan (`kill -INT <launcher> → kill -TERM -- -<pgid> → kill -KILL -- -<pgid>`) without signalling anything. |
| `verify` | Passes only if: the LLM's `/health` is 200; its launcher has the same pid and start time as the baseline that the last `start` / `stop` recorded (without a baseline it prints the uptime to check by eye); nothing listens on :30001; no launcher group runs; cards 2,3 have no compute process and less than 1024 MiB in use. `--deep` also calls the LLM's `/health_generate`. |

- **Local state:** `${XDG_STATE_HOME:-~/.local/state}/shmup-art-server/` (`SERVER_SH_STATE_DIR`) holds `llm.baseline`
  and `<name>.launch` (pgid and log of the last start, which `wait` uses). Dry runs write nothing.
- **A model started by hand** (the owner's terminal) is stopped the same way: `stop` finds it by port.
- **A launcher that has not bound :30001 yet** (still downloading or loading) is stopped only on purpose. `stop <name>`
  refuses and names the group; then `stop <name> --pgid <pgid>`, after a `--dry-run`. The group must be led by
  `run_sglang_images_<name>-1.sh` (or run `--model-path <expected>`), and must not be the LLM's.
- **Tests:** `bash art-prompts/v2/server.test.sh` — offline, no ssh. It feeds server.sh's remote scripts fake `ss`,
  `ps`, `nvidia-smi`, `curl`, `df`, `du`, `nohup` and `sleep`, plus a fake `kill` that logs signals instead of sending
  them. It covers the argument errors, every preflight and stop refusal, the INT → TERM → KILL order, survivors, a
  group that turns protected mid-stop, `verify` and `wait`.
- `art-prompts/sweep-models.sh` (the library sweep) starts and stops through `server.sh` too (`start`, then
  `stop --pgid`), and its `START_WAIT` default is 3 h.

### A model session

```bash
S=art-prompts/v2/server.sh
bash $S status                      # the LLM on 0,1 only; cards 2,3 free; :30001 empty
bash $S start flux2dev --dry-run    # preflight only
bash $S start flux2dev              # prints PGID=… and the log path
bash $S wait flux2dev               # up to 3 h on a first start; READY when /v1/models lists the model
#   … the generation agents run here …
bash $S stop flux2dev --dry-run     # check the plan names the image server's group, not the LLM's
bash $S stop flux2dev               # INT → TERM group → KILL group, then verify
bash $S verify                      # must print VERIFY OK before the next model starts
```

## 4. Hazards

- **Never stop by name or GPU.** `pkill -f sglang`, `sglang killall`, `scripts/killall_sglang.sh` and
  `kill $(ps | grep sglang)` all hit the LLM too. SGLang renames its children (`sglang::scheduler_TP0_EP0`,
  `sgl_diffusion::scheduler`), and their `/proc/<pid>/environ` is blank, so neither the name nor the GPU tells the two
  servers apart. Use **`server.sh stop`** only. Its recipe:
  1. Find the launcher by port: the :30001 listener (`ss -ltnpH`), or its nearest ancestor in the same process group,
     whose cmdline contains `--model-path <expected model>`. **Refuse** otherwise.
  2. Take its process group. **Refuse** if that is ≤ 1, the LLM's (the group of whatever owns :30000, and of any
     process started with `--port 30000`, so a restarting LLM stays protected), or the script's own; or if the group is
     led by anything but the expected run script or model process.
  3. `kill -INT <launcher>` and wait ≤ 45 s; then `kill -TERM -- -<pgid>` and wait ≤ 10 s; then `kill -KILL -- -<pgid>`.
     The protection check repeats before every signal. The workers die with the launcher (PDEATHSIG).
  4. Report survivors, then `verify`.
- **Port 30000 is the LLM.** Image requests sent there would go to the LLM. The clients refuse it (§1), and every
  launcher binds 30001.
- **The first start of each model downloads its weights.** FLUX.2-dev's first start on 2026-10-16 took about 195 GB
  (543 → 348 GB free). The other six models are still uncached. Before a session, check `status` (free disk, caches);
  `start` refuses below 150 GB; `wait` allows 3 h. Never start two models to "save time": cards 2,3 hold one.
- **The HF token stays on skynet2.** It is inline in the root-only run scripts and in the servers' environment. Never
  `cat`, copy or print a run script or a `/proc/*/environ`. `server.sh` only `grep -o`s three flags, and every log or
  cmdline line it prints goes through a redaction filter (`hf_…`, `--api-key …`).
- **qwenimage's duplicated `--text-encoder-cpu-offload`** is for the owner to fix (§2).
- **One image/video server at a time,** and only while the LLM is on 0,1. `start`'s preflight enforces both.

## 5. Endpoints

Every one of the seven servers is OpenAI-shaped and needs no API key. Base: `http://skynet2.interserver.net:30001`
(from the box: `http://127.0.0.1:30001`).

| Route | Use |
|---|---|
| `GET /health` | 000 = not bound yet, **503 = warming up**, **200 = ready** (the log says "The server is fired up and ready to roll!") |
| `GET /liveness`, `GET /health_generate`, `GET /server_info` | liveness; a real generation check; server arguments |
| `GET /v1/models`, `GET /v1/model_info`, `GET /v1/list_loras`, `POST /v1/set_lora` | the served id (= `--model-path`); LoRAs |
| `POST /v1/images/generations` | JSON: `model`, `prompt`, `size "WxH"`, `n`, `response_format b64_json`, `output_format png`, `seed`, `guidance_scale`, `num_inference_steps`, `negative_prompt` (SD3.5 / Qwen only — FLUX ignores negatives) |
| `POST /v1/images/edits` | multipart: `image` (repeatable — FLUX.2-dev takes several references), `prompt`, `model`, the same settings |
| `GET /v1/images/{id}/content` | an image by id (when `url` is returned instead of base64) |
| `POST /v1/videos`, `GET /v1/videos/{id}`, `GET /v1/videos/{id}/content`, `DELETE /v1/videos/{id}` | video jobs; `reference_url` (a data URI) is the start image for i2v |

## 6. How the art round uses it (R0-04)

The manifest is `art-prompts/v2/manifest.json` (`shmup-art-picks@1`). It lists 91 basic subjects, each with
`model` (slot a), `modelB` (slot b) and its `followups` (203 in all). Candidates go to
`art-prompts/v2/candidates/<slot>/<id>.png`, each with a `.json` sidecar, and stay git-ignored. The owner picks on
`http://mystage.interserver.net/shmup-cup/` (choices: `/home/sites/mystage/public_html/shmup-cup/data/choices.json`).
The driver is `prompt_resolution.md`, run with `ART_ROUND: round 1` or `round 2`.

### Round 1 — two candidates per subject

One model session at a time, in this order:

| Session | Slot a (agents) | Slot b (separate agents) |
|---|---|---|
| 1. `flux2dev` | 84 FLUX items, in about 4 agents: bosses + crafts + logos (22) · enemies (26) · stages (20) · items/FX + key moments + promo (16) | the 7 text items (wordmark, title screen, WARNING, game over, hi-score entry, victory card, store capsule) |
| 2. `qwenimage` | the 7 text items | 75 Qwen items, in about 4 agents: bosses + crafts + logos (22) · enemies (26) · stages + items/FX (18) · key moments + promo (9) |
| 3. `stablediffusion35large` | — | the 9 terrain swatches |

Each session follows the "A model session" sequence above (§3).
An agent writes its own prompt for each item and runs one image at a time:

```bash
node art-prompts/v2/gen-candidate.mjs --id <item id> --slot <a|b> --prompt-file <its prompt file>
```

The model, size, steps and seed come from the manifest. The agent then **Reads the PNG**, and retries at most twice
(`--seed <new> --force`) if it shows the wrong subject, no flat green key where the item needs one, stray text, or a
broken composition. A slot-a agent never looks at slot b's files, and the reverse.

### Round 2 — from `choices.json`

The driver reads `choices.json` (it never writes it — the page owns it). It acts only on items whose choice changed
since the ledger `art-prompts/v2/candidates/ledger.json` last recorded them. The ledger keeps, per item, the choice's
`updatedAt`, the files made for it and the session.

- **Followups of every winner** (FLUX.2-dev session; the winner is the reference even when Qwen-Image made it):

  ```bash
  node art-prompts/v2/gen-candidate.mjs --id <followup id> --slot <winner> --model flux2 \
    --edit-from art-prompts/v2/candidates/<winner>/<item id>.png \
    --instruction "<the followup's prompt, restated to keep the reference's design>" \
    --width <w> --height <h> --out art-prompts/v2/candidates/<winner>/<followup id>.png
  ```

  An edit's size defaults to the reference's, so pass the followup's own size. A dry run without `--edit-from` prints
  it. If the item also has a comment, the edit is made first, and the followups use it as a second reference.
- **Comments** (FLUX.2-dev; Qwen-Image-Edit only once its weights and a launcher exist): an edit of the winner, written
  as a new file — never over the winner:

  ```bash
  node art-prompts/v2/gen-candidate.mjs --id <item id> --slot <winner> --model flux2 \
    --edit-from art-prompts/v2/candidates/<winner>/<item id>.png \
    --instruction "<the owner's comment as an edit instruction>" \
    --out art-prompts/v2/candidates/<winner>/<item id>/edit-<k>.png      # k = next free; exit 4 if taken
  ```

- **Regenerate** (the round-1 slot models — FLUX.2-dev first, then Qwen-Image, then SD3.5 — and a new idea; a comment
  on a regenerate item is the owner's guidance for that idea). Each slot's agent first moves its old pair to
  `art-prompts/v2/candidates/history/<date>/<slot>/<id>.{png,json}` (never deleted), then generates the slot again.
  The page shows the new pair at the next poll (every 60 s).
- **Where the owner sees round 2:** the page shows only the pair per item. Followups and edits are dot-free ids under
  the same tree, so the page's own image route serves them, e.g.
  `http://mystage.interserver.net/shmup-cup/img.php?slot=a&id=boss/halcyon-bulwark/reveal` or
  `…&id=boss/halcyon-bulwark/edit-1`. The driver's report lists these links.
- **The loop:** the owner picks again (a new winner, a changed comment, or regenerate), and round 2 runs again until
  every item is decided.
- **Winners** are copied to the tracked `art-prompts/v2/winners/<item id>/`, then committed:
  - `winner.png` + `winner.json` — the chosen candidate and its sidecar;
  - `edit-<k>.png` + `.json` — the comment edits;
  - `<followup suffix>.png` + `.json` — the followups;
  - `choice.json` — the item's `choices.json` entry at copy time.

  The R3-02 ingest reads them later, staged until R2-01. Candidates are never committed.

**Video is not part of this round.** Later, the winning stills feed LTX-Video / LTX-2.5 image-to-video. Wan2.2 on
skynet2 is text-to-video only (§2).
