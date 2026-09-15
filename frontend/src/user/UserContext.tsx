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
 * What the app renders with before the first auth check answers, and what a
 * logged-out session falls back to. These match the column defaults in V12,
 * so an anonymous state looks like a fresh account rather than like nothing.
 */
const DEFAULTS: Me = {
  displayName: 'local',
  theme: 'system',
  furigana: true,
  sessionSize: 20,
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type UserContextValue = {
  me: Me
  /** Derived from status: true once the initial check has answered, either way. */
  loaded: boolean
  status: AuthStatus
  save: (patch: Partial<Me>) => Promise<void>
  /** Resolves to an error message on failure, null on success. */
  login: (email: string, password: string) => Promise<string | null>
  register: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextValue>({
  me: DEFAULTS,
  loaded: false,
  status: 'loading',
  save: async () => undefined,
  login: async () => 'Not ready yet.',
  register: async () => 'Not ready yet.',
  logout: async () => undefined,
})

export function useUser() {
  return useContext(UserContext)
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(DEFAULTS)
  const [status, setStatus] = useState<AuthStatus>('loading')

  /**
   * The single source of truth for "am I logged in": GET /api/me now 401s
   * when there's no valid session, rather than silently falling back to a
   * seeded local user. Awaited by login/register too, so their callers can
   * navigate immediately after a successful call trusting that status has
   * already flipped, not racing a fetch that's still in flight.
   */
  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/me')
      if (!response.ok) throw new Error(String(response.status))
      setMe((await response.json()) as Me)
      setStatus('authenticated')
    } catch {
      setMe(DEFAULTS)
      setStatus('anonymous')
    }
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

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

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        return response.status === 401 ? 'Wrong email or password.' : 'Something went wrong.'
      }
      await checkSession()
      return null
    },
    [checkSession],
  )

  const register = useCallback(
    async (email: string, password: string) => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        if (response.status === 409) return 'That email is already registered.'
        if (response.status === 400) {
          return 'Check your email and use a password of at least 8 characters.'
        }
        return 'Something went wrong.'
      }
      await checkSession()
      return null
    },
    [checkSession],
  )

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setMe(DEFAULTS)
    setStatus('anonymous')
  }, [])

  const value = useMemo(
    () => ({ me, loaded: status !== 'loading', status, save, login, register, logout }),
    [me, status, save, login, register, logout],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
