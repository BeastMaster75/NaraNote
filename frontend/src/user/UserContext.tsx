import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'system' | 'light' | 'dark'

export type Me = {
  displayName: string
  theme: Theme
  furigana: boolean
  sessionSize: number
}

/**
 * What the app renders with before /api/me answers, and what it falls back to if
 * the server is unreachable. These match the column defaults in V12, so a
 * failed fetch behaves like a fresh account rather than like nothing at all.
 */
const DEFAULTS: Me = {
  displayName: 'local',
  theme: 'system',
  furigana: true,
  sessionSize: 20,
}

type UserContextValue = {
  me: Me
  /** False until /api/me has answered — pages that read sessionSize must wait. */
  loaded: boolean
  save: (patch: Partial<Me>) => Promise<void>
}

const UserContext = createContext<UserContextValue>({
  me: DEFAULTS,
  loaded: false,
  save: async () => undefined,
})

export function useUser() {
  return useContext(UserContext)
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then((response) => (response.ok ? (response.json() as Promise<Me>) : DEFAULTS))
      .catch(() => DEFAULTS)
      .then((value) => {
        if (cancelled) return
        setMe(value)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * The provider owns the theme attribute. main.tsx sets it once before React
   * mounts so the first paint isn't the wrong colour, but it deliberately keeps
   * no listener of its own — two owners would fight over the same attribute.
   */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = me.theme === 'system' ? media.matches : me.theme === 'dark'
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [me.theme])

  const save = useCallback(async (patch: Partial<Me>) => {
    // Optimistic: a theme switch that waited for a round trip would feel broken.
    setMe((current) => ({ ...current, ...patch }))
    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!response.ok) throw new Error(String(response.status))
      setMe((await response.json()) as Me)
    } catch {
      // Put back whatever the server actually holds, so a rejected value doesn't
      // linger on screen looking saved.
      fetch('/api/me')
        .then((response) => (response.ok ? (response.json() as Promise<Me>) : null))
        .then((value) => value && setMe(value))
        .catch(() => undefined)
    }
  }, [])

  const value = useMemo(() => ({ me, loaded, save }), [me, loaded, save])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
