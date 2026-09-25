'use client'

import { useEffect } from 'react'
import { use as usePromise } from 'react'
import { useRouter } from 'next/navigation'

export default function ConversationRedirectPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = usePromise(params)
  const router = useRouter()

  useEffect(() => {
    if (conversationId) {
      router.replace(`/chat?c=${conversationId}`)
    } else {
      router.replace('/chat')
    }
  }, [conversationId, router])

  return (
    <div className="container py-xl text-center">
      <div className="loading-spinner mx-auto" />
    </div>
  )
}
