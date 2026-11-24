import { useEffect, useRef } from 'react'
import {
  useExperiment,
  useFlags,
  useFlagsmith,
  useFlagsmithLoading,
} from '@flagsmith/flagsmith/react'
import { internalMode, visitorId } from './flagsmith'
import { CONTROL_HEADLINE, HEADLINE_FLAG, SIGNUP_EVENT } from './experiment'

export default function App() {
  const flagsmith = useFlagsmith()
  const loading = useFlagsmithLoading()
  const flags = useFlags(['show_demo_button'])
  const showDemo = flags.show_demo_button?.enabled ?? false

  // Records one $flag_exposure when this visitor is enrolled in the running
  // experiment and the flag is rendered (deduped by the SDK).
  const headlineFlag = useExperiment(HEADLINE_FLAG)
  // Internal-test mode never loads flags: show the default (control) headline right away.
  const ready = internalMode || !loading?.isLoading || !!loading?.error
  const headline = internalMode
    ? CONTROL_HEADLINE
    : (typeof headlineFlag?.value === 'string' && headlineFlag.value) || CONTROL_HEADLINE

  useEffect(() => {
    if (!ready || internalMode) return
    console.log(
      `[flagsmith] visitor=${visitorId} show_demo_button=${showDemo} ` +
        `${HEADLINE_FLAG} variant=${headlineFlag?.variant ?? 'control'} ` +
        `inExperiment=${headlineFlag?.experiment?.inExperiment ?? false} ` +
        `value="${headline}" (source: ${loading?.source ?? 'unknown'})`,
    )
  }, [ready, showDemo, headline, headlineFlag, loading?.source])

  // One conversion per page load: repeat clicks do not send duplicate events.
  const converted = useRef(false)
  const onSignUp = () => {
    if (internalMode) {
      console.log(`[flagsmith] internal test mode: ${SIGNUP_EVENT} NOT tracked`)
      return
    }
    if (converted.current) return
    converted.current = true
    flagsmith.trackEvent(SIGNUP_EVENT, { identifier: visitorId })
    console.log(`[flagsmith] tracked ${SIGNUP_EVENT} for visitor=${visitorId}`)
    void flagsmith.flushEvents()
  }

  return (
    <main className="page">
      <nav className="nav">
        <span className="logo">BuzzItBro</span>
        {internalMode && <span className="internal-badge">Internal test mode · not tracked</span>}
      </nav>

      <section className="hero">
        {/* Blank until flags load, so no one sees a headline that was not recorded. */}
        <h1 aria-busy={!ready} className={ready ? '' : 'pending'}>
          {ready ? headline : ' '}
        </h1>
        <p className="lede">
          BuzzItBro researches your niche, writes three hooks and a script, makes a realistic UGC
          video ad, and posts it to Instagram once you approve it.
        </p>

        <div className="actions">
          <button className="btn primary" type="button" onClick={onSignUp}>
            Sign Up
          </button>
          {showDemo && (
            <button className="btn secondary" type="button">
              Try the Demo
            </button>
          )}
        </div>
      </section>
    </main>
  )
}
