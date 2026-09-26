import { useEffect } from 'react'

/**
 * Kanji tapped in the welcome page's demo, carried across a Google sign-in. "Continue as
 * Guest" sends them with the request that creates the notebook; Google's round trip leaves
 * the page, so they wait in sessionStorage — same tab, gone when it closes — and are added
 * once the app opens signed in.
 */
const KEY = 'naranote.demoKanji'

export function rememberDemoKanji(kanji: string[]) {
  try {
    if (kanji.length > 0) sessionStorage.setItem(KEY, JSON.stringify(kanji))
  } catch {
    // Storage blocked: the demo kanji just don't come along. Nothing else depends on it.
  }
}

function takeDemoKanji(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** Adds any remembered demo kanji to the signed-in library, once. Mounted in the app shell. */
export function useCarryDemoKanji() {
  useEffect(() => {
    const kanji = takeDemoKanji().slice(0, 20)
    if (kanji.length === 0) return
    void fetch('/api/library/batch', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ literals: kanji, source: 'DEMO' }),
    }).catch(() => undefined)
  }, [])
}
