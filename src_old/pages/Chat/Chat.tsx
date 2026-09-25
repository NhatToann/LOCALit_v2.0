import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './Chat.css'

interface Message {
  id: string
  senderId: string
  text: string
  timestamp: Date
  isRead: boolean
}

interface Conversation {
  id: string
  buddy: {
    id: string
    name: string
    avatar: string
    isOnline: boolean
    lastSeen: string
  }
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
}

const currentUserId = 'user_1'

const initialConversations: Conversation[] = [
  {
    id: 'conv_1',
    buddy: { id: '1', name: 'Lan Pham', avatar: 'L', isOnline: true, lastSeen: 'Active now' },
    lastMessage: "Sure! Let's meet at the beach tomorrow morning.",
    lastMessageTime: '2 min ago',
    unreadCount: 2
  },
  {
    id: 'conv_2',
    buddy: { id: '2', name: 'Minh Nguyen', avatar: 'M', isOnline: true, lastSeen: 'Active now' },
    lastMessage: 'I found some great photography spots for you!',
    lastMessageTime: '15 min ago',
    unreadCount: 0
  },
  {
    id: 'conv_3',
    buddy: { id: '3', name: 'Huy Nguyen', avatar: 'H', isOnline: false, lastSeen: 'Last seen 2 hours ago' },
    lastMessage: 'The food tour was amazing. See you again!',
    lastMessageTime: '3 hours ago',
    unreadCount: 0
  },
  {
    id: 'conv_4',
    buddy: { id: '4', name: 'Linh Tran', avatar: 'T', isOnline: false, lastSeen: 'Last seen yesterday' },
    lastMessage: 'Thanks for the yoga session recommendation!',
    lastMessageTime: 'Yesterday',
    unreadCount: 0
  },
  {
    id: 'conv_5',
    buddy: { id: '5', name: 'Mai Le', avatar: 'M', isOnline: false, lastSeen: 'Last seen 2 days ago' },
    lastMessage: "I'd love to show you around Da Nang.",
    lastMessageTime: '3 days ago',
    unreadCount: 0
  }
]

const initialMessages: Record<string, Message[]> = {
  conv_1: [
    { id: '1', senderId: currentUserId, text: 'Hi Lan! I saw your profile and you seem like a great guide!', timestamp: new Date(Date.now() - 3600000 * 5), isRead: true },
    { id: '2', senderId: '1', text: "Hello! Thanks for reaching out. I'd be happy to help you explore Da Nang!", timestamp: new Date(Date.now() - 3600000 * 4), isRead: true },
    { id: '3', senderId: currentUserId, text: "I'm planning to visit tomorrow. What places would you recommend?", timestamp: new Date(Date.now() - 3600000 * 3), isRead: true },
    { id: '4', senderId: '1', text: "Start with My Khe Beach at sunrise, then Marble Mountains. It's an easy route.", timestamp: new Date(Date.now() - 3600000 * 2), isRead: true },
    { id: '5', senderId: '1', text: "Sure! Let's meet at the beach tomorrow morning.", timestamp: new Date(Date.now() - 120000), isRead: false }
  ],
  conv_2: [
    { id: '1', senderId: currentUserId, text: "Hi Minh! I heard you're great at photography tours.", timestamp: new Date(Date.now() - 86400000), isRead: true },
    { id: '2', senderId: '2', text: 'Yes! I know a few good sunrise and street-life corners.', timestamp: new Date(Date.now() - 82800000), isRead: true },
    { id: '3', senderId: '2', text: 'I found some great photography spots for you!', timestamp: new Date(Date.now() - 900000), isRead: false }
  ],
  conv_3: [
    { id: '1', senderId: currentUserId, text: 'Thanks for the amazing food tour yesterday!', timestamp: new Date(Date.now() - 86400000 * 2), isRead: true },
    { id: '2', senderId: '3', text: 'The food tour was amazing. See you again!', timestamp: new Date(Date.now() - 86400000), isRead: true }
  ]
}

const Chat = () => {
  const { conversationId } = useParams()
  const [conversations, setConversations] = useState(initialConversations)
  const [messages, setMessages] = useState(initialMessages)
  const [activeConversationId, setActiveConversationId] = useState(conversationId || 'conv_1')
  const [draft, setDraft] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0]
  const activeMessages = messages[activeConversation.id] || []
  const unreadTotal = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)

  useEffect(() => {
    if (!conversationId) return

    const nextConversation = conversations.find((conversation) => conversation.id === conversationId)
    if (nextConversation) {
      setActiveConversationId(nextConversation.id)
      setIsMinimized(false)
    }
  }, [conversationId, conversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversationId, messages, isMinimized])

  useEffect(() => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId ? { ...conversation, unreadCount: 0 } : conversation
      )
    )
  }, [activeConversationId])

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  const handleSelectConversation = (conversationIdToSelect: string) => {
    setActiveConversationId(conversationIdToSelect)
    setIsMinimized(false)
  }

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault()

    if (!draft.trim()) return

    const messageText = draft.trim()
    const newMessage: Message = {
      id: Date.now().toString(),
      senderId: currentUserId,
      text: messageText,
      timestamp: new Date(),
      isRead: true
    }

    setMessages((current) => ({
      ...current,
      [activeConversation.id]: [...(current[activeConversation.id] || []), newMessage]
    }))
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversation.id
          ? { ...conversation, lastMessage: messageText, lastMessageTime: 'Just now' }
          : conversation
      )
    )
    setDraft('')

    window.setTimeout(() => {
      const reply: Message = {
        id: `${Date.now()}_reply`,
        senderId: activeConversation.buddy.id,
        text: 'Ok, I will check my schedule and send you details soon.',
        timestamp: new Date(),
        isRead: false
      }

      setMessages((current) => ({
        ...current,
        [activeConversation.id]: [...(current[activeConversation.id] || []), reply]
      }))
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversation.id
            ? {
                ...conversation,
                lastMessage: reply.text,
                lastMessageTime: 'Just now',
                unreadCount: activeConversationId === activeConversation.id ? 0 : conversation.unreadCount + 1
              }
            : conversation
        )
      )
    }, 1000)
  }

  return (
    <section className="messenger-page" aria-label="Messenger chat">
      <div className="messenger-page-copy">
        <p>Messages now open as a small floating chat window.</p>
      </div>

      {isMinimized ? (
        <button className="messenger-launcher" type="button" onClick={() => setIsMinimized(false)} aria-label="Open chat">
          <span className="launcher-avatar">{activeConversation.buddy.avatar}</span>
          {unreadTotal > 0 && <span className="launcher-badge">{unreadTotal}</span>}
        </button>
      ) : (
        <div className="messenger-window" role="dialog" aria-label={`Chat with ${activeConversation.buddy.name}`}>
          <div className="messenger-header">
            <Link to={`/buddies/${activeConversation.buddy.id}`} className="messenger-user">
              <span className="messenger-avatar">
                {activeConversation.buddy.avatar}
                {activeConversation.buddy.isOnline && <span className="messenger-online" />}
              </span>
              <span>
                <strong>{activeConversation.buddy.name}</strong>
                <small>{activeConversation.buddy.isOnline ? 'Online' : activeConversation.buddy.lastSeen}</small>
              </span>
            </Link>
            <div className="messenger-actions">
              <button type="button" onClick={() => setIsMinimized(true)} aria-label="Minimize chat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="messenger-people" aria-label="Conversations">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={conversation.id === activeConversation.id ? 'active' : ''}
                onClick={() => handleSelectConversation(conversation.id)}
                aria-label={`Open ${conversation.buddy.name}`}
              >
                <span>{conversation.buddy.avatar}</span>
                {conversation.unreadCount > 0 && <em>{conversation.unreadCount}</em>}
              </button>
            ))}
          </div>

          <div className="messenger-messages">
            {activeMessages.map((chatMessage) => {
              const isOwn = chatMessage.senderId === currentUserId

              return (
                <div key={chatMessage.id} className={`messenger-message ${isOwn ? 'own' : 'other'}`}>
                  {!isOwn && <span className="message-mini-avatar">{activeConversation.buddy.avatar}</span>}
                  <div className="messenger-bubble">
                    <p>{chatMessage.text}</p>
                    <small>{formatTime(chatMessage.timestamp)}</small>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          <form className="messenger-input" onSubmit={handleSendMessage}>
            <button type="button" aria-label="Add attachment">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Aa" />
            <button type="submit" disabled={!draft.trim()} aria-label="Send message">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </section>
  )
}

export default Chat
