'use client'

import { useEffect } from 'react'
import { use as usePromise } from 'react'

/**
 * Legacy redirect shim: /chat/<conversationId> → /chat?c=<conversationId>.
 *
 * Uses a hard navigation rather than router.replace. Every client-side
 * transition in the authenticated chrome currently hangs on this
 * deployment — the router starts a transition, never issues an RSC
 * request, and never settles (see the note in
 * components/layout/Header.tsx). Because this page renders nothing but a
 * spinner, a hung redirect leaves the user staring at it forever.
 * `location.assign` always completes.
 */
export default function ConversationRedirectPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = usePromise(params)

  useEffect(() => {
    window.location.assign(conversationId ? `/chat?c=${conversationId}` : '/chat')
  }, [conversationId])

  return (
    <div className="container py-xl text-center">
      <div className="loading-spinner mx-auto" />
    </div>
  )
}