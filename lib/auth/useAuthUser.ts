'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'

export interface AuthUser {
  userId: string
  role: 'tourist' | 'buddy'
  fullName: string | undefined
}

/**
 * Hook returning the currently authenticated user's id/role/name.
 * Shared by AuthAwareHeader and IncomingCallWatcher so both see the same
 * source of truth without duplicating the onAuthStateChange wiring.
 */
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (cancelled || !authUser) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', authUser.id)
          .single()
        if (cancelled || !profile) return
        if (profile.role !== 'tourist' && profile.role !== 'buddy') return
        setUser({
          userId: authUser.id,
          role: profile.role,
          fullName: profile.full_name ?? undefined,
        })
      } catch {
        /* ignore */
      }
    }
    void load()
    const { data: sub } = createClient().auth.onAuthStateChange(() => {
      void load()
    })
    const onLocalChange = () => void load()
    window.addEventListener('localit-auth-changed', onLocalChange)
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      window.removeEventListener('localit-auth-changed', onLocalChange)
    }
  }, [])

  return user
}
