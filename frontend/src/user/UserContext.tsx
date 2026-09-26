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
  /** Null for a guest — they have no account yet, only this browser's session. */
  email: string | null
  /** Gates RequireVerified on the frontend; SessionInterceptor enforces the same thing server-side. */
  emailVerified: boolean
  /** A notebook with no account: only this browser's session reaches it. */
  guest: boolean
  /** Where a guest is saving their collection, until they click the link mailed there. */
  pendingEmail: string | null
  /** False for guests and Google-only accounts: nothing to ask for before deleting. */
  hasPassword: boolean
  /** Whether Google can sign in to this account. */
  googleLinked: boolean
  theme: Theme
  furigana: boolean
  sessionSize: number
  /** 0 means no target set — Reading-deck generation stays unrestricted. */
  targetJlptLevel: number
  /** Presence only — the key itself is never sent back once saved. */
  hasGeminiKey: boolean
}

/**
 * What the app renders with before the first auth check answers, and what a
 * logged-out session falls back to. These match the column defaults in V12,
 * so an anonymous state looks like a fresh account rather than like nothing.
 * emailVerified defaults true so this pre-auth shape never itself looks like
 * something that needs verifying.
 */
const DEFAULTS: Me = {
  displayName: 'local',
  email: null,
  emailVerified: true,
  guest: false,
  pendingEmail: null,
  hasPassword: false,
  googleLinked: false,
  theme: 'system',
  furigana: true,
  sessionSize: 20,
  targetJlptLevel: 0,
  hasGeminiKey: false,
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type UserContextValue = {
  me: Me
  /** Derived from status: true once the initial check has answered, either way. */
  loaded: boolean
  status: AuthStatus
  /** geminiApiKey is write-only — a real value sets it, '' clears it, never read back. */
  save: (patch: Partial<Me> & { geminiApiKey?: string }) => Promise<void>
  /** Resolves to an error message on failure, null on success. */
  login: (email: string, password: string) => Promise<string | null>
  register: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  /**
   * "Continue as Guest": a notebook with just a name, opening with whatever kanji were
   * collected in the welcome page's demo.
   */
  startGuest: (displayName: string, kanji: string[]) => Promise<string | null>
  /** A guest saving their collection to an email; nothing changes until the mailed link is clicked. */
  saveGuest: (email: string, password: string) => Promise<string | null>
  /** Stops Google signing in to this account; refused while it has no password. */
  disconnectGoogle: () => Promise<string | null>
  /** Ends every other session of this account. Resolves to how many ended, or null on failure. */
  signOutOtherDevices: () => Promise<number | null>
  /** Consumes a link's token; refreshes `me` so emailVerified flips on success. */
  verifyEmail: (token: string) => Promise<string | null>
  /** Re-sends the verification email to the signed-in account. */
  resendVerification: () => Promise<string | null>
  /** Always resolves null on a successful request, whether or not the email has an account. */
  forgotPassword: (email: string) => Promise<string | null>
  resetPassword: (token: string, newPassword: string) => Promise<string | null>
  /**
   * Deletes the account and everything in it, confirmed with the password when the account
   * has one (guests and Google-only accounts don't). On success the server has already cleared
   * the session cookie, and status flips to anonymous.
   */
  deleteAccount: (password?: string) => Promise<string | null>
}

const UserContext = createContext<UserContextValue>({
  me: DEFAULTS,
  loaded: false,
  status: 'loading',
  save: async () => undefined,
  login: async () => 'Not ready yet.',
  register: async () => 'Not ready yet.',
  logout: async () => undefined,
  startGuest: async () => 'Not ready yet.',
  saveGuest: async () => 'Not ready yet.',
  disconnectGoogle: async () => 'Not ready yet.',
  signOutOtherDevices: async () => null,
  verifyEmail: async () => 'Not ready yet.',
  resendVerification: async () => 'Not ready yet.',
  forgotPassword: async () => 'Not ready yet.',
  resetPassword: async () => 'Not ready yet.',
  deleteAccount: async () => 'Not ready yet.',
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

  const save = useCallback(async (patch: Partial<Me> & { geminiApiKey?: string }) => {
    // Optimistic: a theme switch that waited for a round trip would feel broken.
    // geminiApiKey is excluded from that merge on purpose — it's write-only and never
    // belongs in local state, even transiently while the real request is in flight.
    const { geminiApiKey: _geminiApiKey, ...optimistic } = patch
    setMe((current) => ({ ...current, ...optimistic }))
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

  const startGuest = useCallback(
    async (displayName: string, kanji: string[]) => {
      const response = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, kanji }),
      })
      if (!response.ok) {
        if (response.status === 429) return 'Too many attempts. Try again in a few minutes.'
        if (response.status === 400) return 'Enter a name up to 80 characters.'
        // 409: this browser already has a session — go and use it.
        if (response.status !== 409) return 'Something went wrong.'
      }
      await checkSession()
      return null
    },
    [checkSession],
  )

  const saveGuest = useCallback(
    async (email: string, password: string) => {
      const response = await fetch('/api/auth/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        if (response.status === 409) return 'That email already has an account.'
        if (response.status === 429) return 'Too many attempts. Try again in a few minutes.'
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

  const disconnectGoogle = useCallback(async () => {
    const response = await fetch('/api/auth/google', { method: 'DELETE' })
    if (!response.ok) {
      return response.status === 409
        ? 'Set a password first, or you’d have no way to sign in.'
        : 'Something went wrong.'
    }
    await checkSession()
    return null
  }, [checkSession])

  const signOutOtherDevices = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/sessions/revoke-others', { method: 'POST' })
      if (!response.ok) return null
      const body = (await response.json()) as { ended: number }
      return body.ended
    } catch {
      return null
    }
  }, [])

  const verifyEmail = useCallback(
    async (token: string) => {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!response.ok) {
        if (response.status === 400) return 'That verification link is invalid or has expired.'
        // A guest's address was registered by someone else before they clicked — see
        // EmailVerificationService. Their notebook is untouched.
        if (response.status === 409) {
          return 'That email got an account in the meantime. Your collection is safe — save it to another address.'
        }
        return 'Something went wrong.'
      }
      await checkSession()
      return null
    },
    [checkSession],
  )

  const resendVerification = useCallback(async () => {
    const response = await fetch('/api/auth/resend-verification', { method: 'POST' })
    if (!response.ok) {
      return response.status === 429
        ? 'Too many attempts. Try again in a few minutes.'
        : 'Something went wrong.'
    }
    return null
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    // The endpoint always answers 200 whether or not the email has an account — see
    // AuthController.forgotPassword. A non-2xx here means the request itself failed
    // (bad email format, rate limited), not that the account lookup came back empty.
    if (!response.ok) {
      return response.status === 429
        ? 'Too many attempts. Try again in a few minutes.'
        : 'Enter a valid email address.'
    }
    return null
  }, [])

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    })
    if (!response.ok) {
      return response.status === 400
        ? 'That reset link is invalid or has expired.'
        : 'Check your new password is at least 8 characters.'
    }
    return null
  }, [])

  const deleteAccount = useCallback(async (password?: string) => {
    const response = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password || null }),
    })
    if (!response.ok) {
      // 403 is a wrong password on a session that's still fine — see AuthController.
      if (response.status === 403) return 'That password isn’t right.'
      if (response.status === 429) return 'Too many attempts. Try again in a few minutes.'
      return 'Something went wrong. Nothing was deleted.'
    }
    setMe(DEFAULTS)
    setStatus('anonymous')
    return null
  }, [])

  const value = useMemo(
    () => ({
      me,
      loaded: status !== 'loading',
      status,
      save,
      login,
      register,
      logout,
      startGuest,
      saveGuest,
      disconnectGoogle,
      signOutOtherDevices,
      verifyEmail,
      resendVerification,
      forgotPassword,
      resetPassword,
      deleteAccount,
    }),
    [
      me,
      status,
      save,
      login,
      register,
      logout,
      startGuest,
      saveGuest,
      disconnectGoogle,
      signOutOtherDevices,
      verifyEmail,
      resendVerification,
      forgotPassword,
      resetPassword,
      deleteAccount,
    ],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
