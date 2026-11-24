import flagsmith from '@flagsmith/flagsmith'

export const ENVIRONMENT_KEY = import.meta.env.VITE_FLAGSMITH_ENVIRONMENT_KEY as string | undefined

if (!ENVIRONMENT_KEY) {
  console.error('[flagsmith] VITE_FLAGSMITH_ENVIRONMENT_KEY is missing. Add it to web/.env')
}

const VISITOR_KEY = 'buzzitbro_visitor_id'
const INTERNAL_KEY = 'buzzitbro_internal'

/**
 * Internal-test mode: open the page once with ?internal=1 and this browser is
 * excluded from the experiment from then on (?internal=0 turns it off).
 * In this mode the Flagsmith SDK is never initialised, so no identity, flag
 * request, exposure or event is ever sent.
 */
function readInternalMode(): boolean {
  const url = new URL(window.location.href)
  const param = url.searchParams.get('internal')
  if (param === '1') localStorage.setItem(INTERNAL_KEY, '1')
  if (param === '0') localStorage.removeItem(INTERNAL_KEY)
  if (param !== null) {
    // Drop the parameter so the address bar link can't be shared with it by mistake.
    url.searchParams.delete('internal')
    window.history.replaceState(null, '', url.toString())
  }
  return localStorage.getItem(INTERNAL_KEY) === '1'
}

export const internalMode = readInternalMode()
if (internalMode) {
  console.log('[flagsmith] internal test mode: Flagsmith disabled, nothing is tracked')
}

/**
 * A stable anonymous ID per browser. It is created once and saved, so the same
 * visitor always gets the same experiment variant, and exposure and conversion
 * events carry the same identifier.
 */
export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = `visitor_${crypto.randomUUID()}`
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

export const visitorId = getVisitorId()

export { flagsmith }

export const flagsmithOptions = {
  environmentID: ENVIRONMENT_KEY,
  // Identify the visitor up front, so the first flag request is already for this identity.
  identity: visitorId,
  // Events pipeline: exposure + metric events for Experimentation.
  enableEvents: true,
  enableLogs: import.meta.env.DEV,
}

// The SDK buffers events (sent every ~10 s). Flush when the page is hidden or closed
// so buffered exposures/conversions are not lost.
const flush = () => {
  void flagsmith.flushEvents()
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush()
})
window.addEventListener('pagehide', flush)
