# BuzzItBro — Landing Page Headline Experiment

Flagsmith "Toggle Wars" hackathon · Track 01: Test Something Real

A small React + Vite + TypeScript landing page for BuzzItBro, wired to Flagsmith Experimentation
(`@flagsmith/flagsmith` 12.6.0) to A/B test the hero headline.

## The experiment

**Hypothesis:** an outcome-focused headline will generate more signup CTA clicks than a
product-focused headline.

| Variation | Key | Headline |
|---|---|---|
| Control (product-focused) | `control` | Create AI-powered promotional videos for your brand. |
| Variant (outcome-focused) | `outcome_led` | Turn your products into scroll-stopping promotional reels. |

- **Flag:** `landing_page_headline` (multivariate; control is the flag's default value,
  `outcome_led` was added with `flagsmith feature variant add` and has its own key)
- **Metric:** `signup_cta_clicked` — occurrence, direction: increase
- **Allocation:** 100% rollout, 50% control / 50% outcome_led
- **Set up with:** Flagsmith CLI v2 + the Management API (not the MCP server)

### How the page measures it

1. Every visitor gets a persistent anonymous ID (`visitor_<uuid>`, stored in `localStorage`).
2. The visitor is identified **before** any flag is requested (the ID is passed to `init`).
3. The headline is rendered from the flag value. It stays blank until flags load, so no one
   sees a headline that was not recorded.
4. An exposure (`$flag_exposure`) is recorded by `useExperiment` when the assigned headline
   renders — only for visitors enrolled in the running experiment, deduplicated by the SDK.
5. Clicking **Sign Up** records `signup_cta_clicked` with the **same visitor ID**, at most
   once per page load (repeat clicks don't create duplicate conversions).
6. Events are flushed right after the click and when the page is hidden or closed.

Code: [`src/App.tsx`](src/App.tsx), [`src/flagsmith.ts`](src/flagsmith.ts),
[`src/experiment.ts`](src/experiment.ts).

## Part 1 — Simulation (proves the pipeline works)

Before relying on real traffic, a **separate** copy of the experiment was run with synthetic
visitors, so real results stay clean:

- Flag `landing_page_headline_sim` (same values and keys), metric event
  `sim_signup_cta_clicked`, experiment **413** "SIMULATION – Buzztibro Headline Test".
- The real page never uses the sim flag; only [`scripts/simulate-traffic.mjs`](scripts/simulate-traffic.mjs) does.
- 1,000 visitors, each with a unique `sim_visitor_<uuid>` ID, a `simulated=true` trait and
  `simulated: true` on every event. Each visitor is identified before the flag is requested,
  exposure and click use the same ID, and events are flushed before the script exits.

**Important:** the conversion rates were **set by the script** — 14% for outcome_led vs 10%
for control. This result shows that assignment, exposure, conversion tracking and analysis all
work end to end. It is not evidence about real users.

**Result (experiment 413, as of 2026-11-24 09:40 UTC):**

| | Visitors | Conversions | Rate |
|---|---|---|---|
| control | 491 | 44 | 9.0% |
| outcome_led | 509 | 70 | 13.8% |

- **Lift:** +53.5% (relative) for outcome_led
- **95% credible interval:** −1.2% to +108.2%
- **Win probability:** 97.2%
- No sample-ratio mismatch was flagged.

outcome_led wins with 97.2% probability, but the 95% interval (−1.2% to +108.2%) just crosses
zero, so this is strong evidence, not proof. The gap was set at 14% vs 10%; the observed
13.8% vs 9.0% (a wider gap) came out that way by chance. Flagsmith's counts matched exactly
what the script sent.

Run it yourself (from `web/`, logged in with `flagsmith login`, sim experiment running):

```bash
node --env-file=.env scripts/simulate-traffic.mjs --visitors 1000
```

## Part 2 — The real test (experiment 411)

Experiment **411** "Buzztibro Landing Page Headline Test" runs on the real page with real
visitors. Started 2026-11-24 09:30 UTC.

**Live results (as of 2026-11-24 09:58 UTC):**

| | Visitors | Conversions |
|---|---|---|
| control | 4 | 3 |
| outcome_led | 3 | 2 |
| **Total** | **7** | **5** |

**Up to all 7 of these may be ours (testing):**

- 3 are headless-browser checks we ran right after starting the experiment, to confirm each
  visitor gets one exposure and one conversion with the same ID.
- 4 came from the live URL during our own phone test. Each browser or app (for example
  WhatsApp's in-app browser and Chrome) has its own storage and so counts as a separate
  visitor. The link had not been shared yet.

**Real traffic starts counting from 2026-11-24 10:01 UTC (15:31 IST).** From then on our own
browsers use internal-test mode (below), so they are excluded. Any visitors added after that
time are real.

**Not conclusive yet.** Flagsmith shows "collecting data" until it has at least 50 visitors and
5 conversions, and these test visits say nothing about which headline is better. Experiment
411 is the real test; it will answer the hypothesis once real traffic arrives. The simulation
did not change these numbers (checked after a fresh refresh).

### Internal-test mode

Open the page once with `?internal=1`
(`https://storage.googleapis.com/buzztibro-cdn/experiment/index.html?internal=1`) and that
browser is excluded from the experiment from then on:

- The Flagsmith SDK is never started: no identity, flag request, exposure or event is sent.
- The page shows the default (control) headline and an "Internal test mode · not tracked" badge.
- The setting is saved in that browser's `localStorage`, and the parameter is removed from the
  address bar so the link can't be shared with it by mistake.
- `?internal=0` switches the browser back to normal.

Do this in every browser and app you test from (each has its own storage).

## Run locally

```bash
cp .env.example .env    # add your client-side Flagsmith environment key
npm install
npm run dev             # http://localhost:5173
```

`.env` and `flagsmith.env` are gitignored. The client-side environment key ends up in the
public JavaScript bundle by design; admin credentials (from `flagsmith login`) stay in the OS
keychain and are never used by the page.

## Deploy (Google Cloud Storage)

Live page: **https://storage.googleapis.com/buzztibro-cdn/experiment/index.html**

It is a static page in its own subfolder of the public `buzztibro-cdn` bucket, separate from the
production app (buzztibro.web.app on Cloud Run), which this experiment does not touch.
`vite.config.ts` sets `base: './'`, so the build works from that sub-path.

```bash
npm run build
gsutil -m rsync -r dist gs://buzztibro-cdn/experiment
gsutil setmeta -h "Cache-Control:no-cache, max-age=0" gs://buzztibro-cdn/experiment/index.html
```
