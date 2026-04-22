const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || ''
const STORAGE_KEY = 'chatvas.analytics.distinct_id'

const isEnabled = Boolean(POSTHOG_KEY)

function getDistinctId() {
  if (typeof window === 'undefined') return null

  let existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing

  if (window.crypto?.randomUUID) {
    existing = window.crypto.randomUUID()
  } else {
    existing = `chatvas-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  localStorage.setItem(STORAGE_KEY, existing)
  return existing
}

function buildPayload(event, properties = {}) {
  return {
    api_key: POSTHOG_KEY,
    event,
    distinct_id: getDistinctId(),
    properties: {
      ...properties,
      $current_url: typeof window !== 'undefined' ? window.location.href : undefined,
      app_name: 'chatvas',
      app_version: import.meta.env.VITE_APP_VERSION || 'dev'
    },
    timestamp: new Date().toISOString()
  }
}

export async function trackEvent(event, properties = {}) {
  if (!isEnabled) return

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildPayload(event, properties)),
      keepalive: true
    })
  } catch {
    // Intentionally swallow analytics failures to avoid impacting UX.
  }
}

export function analyticsStatus() {
  return { enabled: isEnabled, host: POSTHOG_HOST }
}
