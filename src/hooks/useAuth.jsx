import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { initPurchases, identifyUser } from '../lib/purchases.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    let initializing = true

    const init = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!isMounted) return
      if (error) console.error('Error getting session', error)
      initializing = false
      const s = data?.session ?? null
      setSession(s)
      setLoading(false)
      // Init RevenueCat for iOS IAP (no-op on web)
      if (s?.user?.id) {
        initPurchases(s.user.id)
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (initializing) return
      setSession(newSession)
      setLoading(false)
      if (newSession?.user?.id) identifyUser(newSession.user.id)
    })

    init()

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  const { user, session, loading, signOut } = ctx
  return { user, session, loading, signOut }
}
