import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './MiniMessenger.css'

export interface MiniMessengerBuddy {
  id: string | number
  name: string
  avatar: string
  isOnline?: boolean
  subtitle?: string
}

interface MiniMessengerProps {
  buddy: MiniMessengerBuddy
  buttonClassName?: string
  buttonLabel?: string
}

const MiniMessenger = ({ buddy, buttonClassName = 'btn btn-primary', buttonLabel = 'Send Message' }: MiniMessengerProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    { sender: 'buddy', text: `Hi, I'm ${buddy.name}. How can I help with your Da Nang trip?` },
  ])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isOpen, messages])

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = draft.trim()

    if (!text) return

    setMessages((current) => [...current, { sender: 'user', text }])
    setDraft('')

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        { sender: 'buddy', text: 'Sounds good. Send me your time and I will suggest the best route.' },
      ])
    }, 900)
  }

  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => setIsOpen(true)}>
        {buttonLabel}
      </button>

      {isOpen && (
        <div className="localit-mini-chat" role="dialog" aria-label={`Chat with ${buddy.name}`}>
          <div className="localit-mini-chat-header">
            <div className="localit-mini-chat-user">
              <span className="localit-mini-chat-avatar">
                {buddy.avatar}
                {buddy.isOnline !== false && <span className="localit-mini-chat-status" />}
              </span>
              <span>
                <strong>{buddy.name}</strong>
                <small>{buddy.subtitle || (buddy.isOnline === false ? 'Away' : 'Active now')}</small>
              </span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="localit-mini-chat-body">
            {messages.map((message, index) => (
              <div key={`${message.sender}-${index}`} className={`localit-mini-message ${message.sender}`}>
                {message.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form className="localit-mini-chat-input" onSubmit={handleSend}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Aa" />
            <button type="submit" disabled={!draft.trim()} aria-label="Send message">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}

export default MiniMessenger
