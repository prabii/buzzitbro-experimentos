#!/usr/bin/env node
/**
 * SIMULATED TRAFFIC for the Buzztibro headline test.
 *
 * Uses ONLY the simulation flag/metric/experiment, never the real experiment:
 *   flag   landing_page_headline_sim   (control | outcome_led)
 *   event  sim_signup_cta_clicked      (metric "SIM signup CTA clicked")
 *
 * Conversion rates are SET BY THIS SCRIPT (outcome_led 14%, control 10%),
 * so the result proves the pipeline works; it is not a real-world finding.
 *
 * Every visitor:
 *   1. gets a unique ID  sim_visitor_<uuid>  (+ trait simulated=true)
 *   2. is identified BEFORE the flag is requested (identity passed to init)
 *   3. records one $flag_exposure for the variant it was served (simulated: true)
 *   4. converts with the variant's probability: one sim_signup_cta_clicked, same ID
 *   5. flushes its events (close) before it is discarded
 *
 * Run (from web/):
 *   node --env-file=.env scripts/simulate-traffic.mjs [--visitors 1000] [--concurrency 10]
 *        [--experiment 413] [--no-results]
 *
 * Reading results calls `flagsmith api` (Flagsmith CLI v2, logged in via `flagsmith login`);
 * no admin credentials are read or printed by this script.
 */
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createFlagsmithInstance } from '@flagsmith/flagsmith/isomorphic'

const FLAG = 'landing_page_headline_sim'
const EVENT = 'sim_signup_cta_clicked'
const RATES = { control: 0.1, outcome_led: 0.14 }

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const VISITORS = Number(arg('visitors', 1000))
const CONCURRENCY = Number(arg('concurrency', 10))
const EXPERIMENT_ID = Number(arg('experiment', 413))
const READ_RESULTS = !process.argv.includes('--no-results')

const ENV_KEY = process.env.VITE_FLAGSMITH_ENVIRONMENT_KEY
if (!ENV_KEY) {
  console.error('Missing VITE_FLAGSMITH_ENVIRONMENT_KEY. Run with: node --env-file=.env scripts/simulate-traffic.mjs')
  process.exit(1)
}

const api = (path, method = 'GET') => {
  const out = execFileSync('flagsmith', ['api', '-X', method, `api/v1/environments/${ENV_KEY}/${path}`], {
    encoding: 'utf8',
    shell: process.platform === 'win32', // npm installs flagsmith.cmd on Windows
  })
  return out.trim() ? JSON.parse(out) : null // e.g. results/refresh/ returns an empty body
}

// Safety: only send traffic into the running SIMULATION experiment on the sim flag.
const exp = api(`experiments/${EXPERIMENT_ID}/`)
const expFlag = exp.feature?.name ?? exp.feature
if (exp.status !== 'running' || (typeof expFlag === 'string' && expFlag !== FLAG)) {
  console.error(`Experiment ${EXPERIMENT_ID} is "${exp.status}" on flag "${expFlag}". Expected running on ${FLAG}. Aborting.`)
  process.exit(1)
}
console.log(`SIMULATION -> experiment ${EXPERIMENT_ID} "${exp.name}" (${exp.status})`)
console.log(`${VISITORS} visitors, concurrency ${CONCURRENCY}, rates ${JSON.stringify(RATES)}\n`)

const stats = {
  control: { exposed: 0, converted: 0 },
  outcome_led: { exposed: 0, converted: 0 },
  notEnrolled: 0,
  errors: 0,
}

async function simulateVisitor() {
  const identifier = `sim_visitor_${randomUUID()}`
  const fs = createFlagsmithInstance()
  try {
    // Identified before the first flag request: identity is part of init.
    await fs.init({
      environmentID: ENV_KEY,
      identity: identifier,
      traits: { simulated: true },
      enableEvents: true,
      cacheFlags: false,
      enableAnalytics: false,
    })
    const flag = fs.getAllFlags()[FLAG]
    if (!flag?.experiment?.inExperiment) {
      stats.notEnrolled++
      return
    }
    const variant = flag.variant ?? 'control'
    fs.trackExposureEvent(FLAG, { identifier, value: variant, metadata: { simulated: true } })
    stats[variant].exposed++

    if (Math.random() < RATES[variant]) {
      fs.trackEvent(EVENT, { identifier, metadata: { simulated: true, variant } })
      stats[variant].converted++
    }
  } catch (err) {
    stats.errors++
    if (stats.errors <= 3) console.error(`visitor ${identifier} failed:`, err?.message ?? err)
  } finally {
    // Flush this visitor's buffered events before dropping the instance.
    await fs.close(10_000)
  }
}

let next = 0
let done = 0
async function worker() {
  while (next < VISITORS) {
    next++
    await simulateVisitor()
    if (++done % 100 === 0) console.log(`  ${done}/${VISITORS} visitors`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const pct = (v) => (v.exposed ? ((100 * v.converted) / v.exposed).toFixed(1) : '0.0')
console.log('\nSent (all events flushed):')
for (const k of ['control', 'outcome_led']) {
  console.log(`  ${k.padEnd(12)} exposed ${stats[k].exposed}  converted ${stats[k].converted}  (${pct(stats[k])}%)`)
}
console.log(`  not enrolled ${stats.notEnrolled}  errors ${stats.errors}`)

if (!READ_RESULTS) process.exit(0)

console.log('\nWaiting 60 s for events to land in the warehouse...')
await new Promise((r) => setTimeout(r, 60_000))

// Refresh at most once every 5 minutes.
const current = api(`experiments/${EXPERIMENT_ID}/results/`).results
const last = current?.refresh_requested_at ? Date.parse(current.refresh_requested_at) : 0
if (Date.now() - last >= 5 * 60_000) {
  api(`experiments/${EXPERIMENT_ID}/results/refresh/`, 'POST')
  console.log('Requested results refresh; waiting 20 s...')
  await new Promise((r) => setTimeout(r, 20_000))
} else {
  console.log(`Last refresh was < 5 min ago (${current.refresh_requested_at}); reading without refreshing.`)
}

const results = api(`experiments/${EXPERIMENT_ID}/results/`).results
console.log(`\nResults as of ${results?.as_of}:`)
console.log(JSON.stringify(results?.payload, null, 2))
