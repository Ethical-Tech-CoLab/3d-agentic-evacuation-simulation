# Running the decision model locally, or on our own GPU

This follows on from [AGENT_DECISIONS.md §10](AGENT_DECISIONS.md#10-could-a-jev-like-decision-model-replace-some-of-this-logic).
That section concluded that a typed decision model could reasonably replace the
hand-set behavioural rules: believing the warning, leaving or staying, going
back, and what to do at a closed road. It should do so **offline, by
archetype, distilled to a probability table**. This note asks two practical
questions:

1. **Could the model run locally, in the viewer's browser?** That depends on
   code size, model size and the device.
2. **Could we run an open-source model on the bare-metal GPU we already
   have access to?**

The short answers are **yes, and yes, but neither should be called live per
agent.** The rest of this note gives the numbers behind that.

Figures marked *measured* were measured for this note or come from the
CoLab's own published evaluation. Figures marked *estimate* are order-of-magnitude
estimates from public model cards and common experience, and they should be
checked on the target hardware before anyone relies on them.

---

## 0. How many decisions does a run need? (measured)

Instrumented runs used default sliders, seed 20220316, 30 s ticks, until no
household was still moving. A "reconsider slot" is one 300-second
re-evaluation by a household that is evacuating and still in its own district.

| City | Households | Simulated hours with anyone moving | Reconsider slots | …of which eligible (`info ≥ 0.35`) | Leave/stay decisions |
|---|---|---|---|---|---|
| Mariupol | 6,000 | 21.7 | 50,763 | 46,684 | 6,000 |
| Mariupol | 20,000 | 21.7 | 168,880 | 154,088 | 20,000 |
| Lower Manhattan | 6,000 | 6.1 | 57,386 | 52,673 | 6,000 |
| Lower Manhattan | 20,000 | 5.7 | 193,280 | 177,126 | 20,000 |

Add one route choice per departing household, plus the much rarer turn-back
and transfer events.

**The total is roughly 10 decisions per household per run.** At the default
playback speed of 120×, a 5.7-hour Lower Manhattan run plays in about 170
real seconds. With 20,000 households that averages about **1,400 decisions
per real second**, and the peaks are higher, because departures cluster.
Mariupol's long tail spreads its decisions more thinly (about 320 a second on
average). The burst while the districts empty is similar.

These numbers replace the cruder upper bound (2.4 million / 8,000 per second)
first given in AGENT_DECISIONS.md. The conclusion does not change: **any model
in the per-agent loop has to answer in well under a millisecond.**

---

## 1. A local model, in the viewer's browser

### 1.1 What we are adding it to

| Asset | Size today |
|---|---|
| Application code (`src/`, `index.html`) | ~150 KB |
| Largest city pack (Mariupol) | 2.1 MB |
| Smallest city pack (Las Vegas) | 0.6 MB |
| Runtime dependencies | MapLibre GL and deck.gl from CDNs, version-pinned with SRI |

The site is static. It has no build step, no keys and no backend
(METHOD.md §6).

### 1.2 Options, by size

| Tier | What it is | Download | Runtime added | Speed per decision | Devices | Fit |
|---|---|---|---|---|---|---|
| **A. Probability table** | Distilled answers per archetype, as JSON next to the city pack | ~100–300 KB for ~7,500 cells × 4 questions (*estimate*) | None | Microseconds (a lookup plus a seeded draw) | All | **Recommended.** It is smaller than one city pack, deterministic, and runs live for every agent |
| **B. Tiny learned model** | Logistic regression, small gradient-boosted trees or a small MLP, trained on the table or on survey data, exported as plain JS weights | < 50 KB (*estimate*) | None | Microseconds | All | Good. It generalises between table cells and is still deterministic |
| **C. Small classifier via ONNX Runtime Web** | The same model as B, or a small transformer classifier, run by a WASM/WebGPU runtime | A runtime of several MB plus a model of 1–100 MB (*estimate*) | One more pinned CDN asset | Sub-millisecond to milliseconds when batched | Most desktops; mid-range phones | Possible. Only worth the weight if B is not expressive enough |
| **D. Small open LLM in the browser** (transformers.js, WebLLM) | 0.1–4 B parameters, 4-bit | ~0.1 GB (135–360 M) · ~0.3–0.4 GB (0.5 B) · ~0.7–0.9 GB (1 B) · ~2 GB (3–4 B) (*estimate*) | A WebGPU runtime of several MB | ~0.1–1 s per decision on a laptop GPU. Several seconds or worse on WASM/CPU (*estimate*) | Needs WebGPU for usable speed. That means current Chromium-based browsers and recent Safari and Firefox, not every device. Phones and low-memory machines struggle above ~1 GB | **Not for the sim loop.** At best it can explain one selected household on demand |

### 1.3 Why tier D cannot drive the agents

- **Throughput.** Even an optimistic 10 decisions per second is more than
  100× short of the ~1,400 per second in §0. Pausing until every decision
  returns would turn a 3-minute run into hours.
- **Code size.** A 0.3–0.9 GB first download is 150–450× the largest city
  pack. On a phone this is a refusal, not a delay.
- **Reproducibility.** A run is defined by its URL and seed, and `npm test`
  checks that results do not depend on resolution. GPU floating-point results
  differ between vendors and drivers, so the same URL could produce different
  decisions on different machines. A table computed once does not have this
  problem.
- **Precomputing in the browser is no better.** Building the ~7,500-cell table
  at page load, at 0.1–1 s per cell, takes 12 minutes to 2 hours. It belongs
  in a build step.

### 1.4 Where a local LLM *does* fit

A **per-household inspector** (AGENT_DECISIONS.md §9.2 item 12) is the right
place. A viewer clicks one dot, and a small local model turns that household's
traits, state and route costs into a sentence. That is one call per click,
it is optional, and it never touches the simulation state. If the model
cannot load, the page shows the structured numbers instead. Even here, the
rules engine stays the source of truth, and the sentence must be labelled as
generated.

---

## 2. An open-source model on our own bare-metal GPU

### 2.1 What we have (from the CoLab's own repositories)

- **The B3IQ GPU node:** owned, US-based hardware running **Ollama**.
  It already serves `gemma3:12b`, `qwen3:14b`, `deepseek-r1:8b` and a
  27-B Qwen GGUF.
- **`pages-ai-proxy`** runs on that node behind a Cloudflare tunnel. It lets
  GitHub Pages demos reach those models (and GitHub Models) without exposing a
  token. **`ethical-ai-proxy`** is an equivalent Express proxy with an origin
  allowlist and a **default rate limit of 30 requests per minute per origin**.
- **A measured evaluation** (War-Games `CASE-STUDY.md` §5). The task was a
  JSON-in/JSON-out persona with about 1,100 input and 70 output tokens per
  turn:

| Model | Valid JSON | Latency per game (~6 turns) | Implied per request |
|---|---|---|---|
| **gemma3:12b** | **100%** | **5.8 s** | **~1 s** |
| qwen3:14b | 61.5% | 16.9 s | ~3 s |
| deepseek-r1:8b | 6.7% | 33.3 s | — (chain-of-thought leaks into the reply) |
| Qwen3-27B GGUF | 0% | 92.1 s | — |

The lesson carries straight over to decision use: **plain instruct models
keep a typed contract, and "thinking" models break it.**

**Not documented anywhere we could find:** the GPU model, the VRAM, and
whether the 27-B model is fully on the GPU. A 4-bit 27-B model needs roughly
16–17 GB for its weights alone, so the node probably has at least about 24 GB
of VRAM, or it offloads part of the model to the CPU. The 92 s per game hints
at offloading, but that is inference, not fact. **Confirm the hardware before
planning batch sizes.**

### 2.2 Could it drive agents live?

**No.**

- **Throughput.** Ollama serving one request at a time at about 1 s each is
  over 1,000× short of §0. A batching server (vLLM, or llama.cpp with parallel
  slots) on one 24–48 GB GPU, with a 7–12 B model and short prompts, might
  reach tens to low hundreds of decisions per second (*estimate*). That is
  still short of the ~1,400 per second average, before counting network round
  trips.
- **The proxy.** At 30 requests per minute per origin, the proxy allows
  **0.5 calls a second**. Raising that limit for one demo weakens a control
  that protects every CoLab page that shares the node.
- **Availability.** A public page that stops working when one machine or one
  quick tunnel is down is a regression from a static site that always works.
- **Reproducibility and posture.** This has the same problem as §1.3. In
  addition, METHOD.md §6 ("no backend, no secrets") would become
  "depends on a CoLab server". That would have to be decided deliberately,
  and stated in the README.

### 2.3 Could it build the table offline?

**Yes. This is the recommended use, and the node is a good fit for it.**

- **Workload (*estimate*).** About **7,500 archetypes**:
  - behaviour 5 × feasible cohort–unit pairs 14 (children are never solo or
    in an ad-hoc group);
  - × information band 3 × hazard band 4 × time of day 3 × "district
    already moving" band 3;
  - × 4 typed questions: believe the warning, leave now, go back, and what to
    do at a closed road;
  - ≈ **30,000 requests**.
- **Time.** At the measured ~1 s per request on Ollama, that is about
  **8 hours serially**, an overnight job. The decision prompts are shorter
  than the War-Games turns (a few hundred tokens in, a few out), so a run is
  likely to be faster. With a batching server it is minutes to an hour. Cut
  the bands and it is less again.
- **Probabilities, not single answers.** Prefer a server that returns token
  **log-probabilities** for the answer options (vLLM, llama.cpp server). One
  forward pass per cell then gives a distribution. With a server that only
  returns text, sample each cell k times at a fixed temperature and count the
  answers. That costs k times as much.
- **Typed output.** Use constrained or structured output: Ollama's `format`
  JSON schema, or vLLM's guided decoding. Use a non-thinking instruct model.
  The War-Games result says to start with `gemma3:12b`, or an equivalent
  Apache-2.0 model (§2.4).
- **Access path.** Run the batch **on the node, or over a private channel to
  it**, not through the public pages proxy. That keeps the 30/min limit
  intact for everyone else.
- **Output.** Write a versioned JSON file, for example
  `data/decisions/<model>-<digest>-<date>.json`. Each file records the model
  name, its exact **digest**, the server and version, the prompt template,
  the temperature, the sampling count and the generation date. The browser
  loads it like any other pack file. The site stays static and keyless, and
  every run stays reproducible from its URL.
- **Governance.** A table is reviewable: anyone can open a cell and see the
  probability and the prompt that produced it. A new model version is a new
  file, and switching to it is a visible change that can be compared on the
  same seeds.

### 2.4 Choosing the model

| Consideration | Guidance |
|---|---|
| Contract reliability | Non-thinking instruct models. The CoLab's own measurement favours `gemma3:12b` |
| Licence of the output | This repo is Apache-2.0 and publishes its data. **Qwen2.5 (most sizes), Mistral 7B, OLMo 2 and SmolLM2 are Apache-2.0, and Phi models are MIT.** Gemma and Llama have their own use terms. Check the terms of the exact version before publishing a table derived from it |
| Openness | OLMo 2 publishes its training data. That matters if the claim is "an open model's prior about evacuation behaviour" |
| Size | 7–14 B is the sweet spot for a single GPU. 27 B+ gave no gain on the CoLab's typed task and cost 15× the latency |
| Reproducibility | Pin the exact model digest, run deterministically or with fixed sampling, and record everything in the output file |

### 2.5 Live uses that *are* reasonable on the node

These are low-volume, user-initiated calls that never set simulation state:

- **Inspector narration.** This is the same as §1.4, served from the node
  instead of the browser, so there is no large download. That is one call
  per click and fits the existing proxy limits.
- **Scenario narration.** Summarise a finished run's statistics in plain
  language, once per run.
- **"What-if" prompts.** Generate a *candidate* table variant for a scenario
  the bands do not cover, which is then reviewed and committed like any other
  table.

---

## 3. Recommendation

| Use | Where it runs | Verdict |
|---|---|---|
| Per-agent decisions in the sim loop | Browser, from a precomputed table (tier A), optionally smoothed by a tiny model (tier B) | **Do this** |
| Building that table | Open-source instruct model on the B3IQ node, batch, offline, with logprobs or sampling, pinned digest | **Do this** |
| Explaining one household on click | Node via proxy, or a small in-browser model if it loads | Optional; label as generated |
| Live LLM per agent, browser or node | — | **Do not.** 100–1,000× too slow, breaks reproducibility, and makes a static site depend on a server |

The model's answers are a **prior**, not evidence. Before adopting the
model-derived table over the current hand-set constants, compare both on the
same seeds, report the difference in p50 and p90 clearance and in the shares
that stayed and turned back, and look for calibration against observed
evacuation behaviour (BACKLOG P2-10, P2-12).

---

## 4. Open questions

1. What GPU and how much VRAM does the B3IQ node have? Is the 27-B model fully
   on the GPU?
2. Can the node run vLLM or the llama.cpp server alongside Ollama, to get
   logprobs and batching?
3. Is there a private path to the node for batch jobs, so they do not go
   through the public pages proxy?
4. Which licence do we want the published decision tables to carry? That
   decides which model families we can use.
5. How many bands per axis are needed before the emergent results stop
   changing? Fewer cells means faster builds and a table that is easier to
   review.
6. Do different open models agree on the table? Disagreement between models
   is itself a measure of how uncertain the prior is.
