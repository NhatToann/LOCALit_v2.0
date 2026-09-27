// Verifies that chat query now works after FK fix
import { createClient } from '@supabase/supabase-js'

const url = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const anonKey = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const supabase = createClient(url, anonKey, { auth: { persistSession: false } })

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: 'john.doe@example.com',
  password: 'password123',
})
if (authErr) {
  console.error('Auth error:', authErr.message)
  process.exit(1)
}
console.log('Logged in as:', auth.user.id)

const uid = auth.user.id
const { data: conv, error: convErr } = await supabase
  .from('conversations')
  .select(`
    id, tourist_id, buddy_id, updated_at,
    last_message_preview, last_message_at,
    last_read_at_by_tourist, last_read_at_by_buddy,
    pinned_message_id, typing_user_id,
    tourist:tourists(profile:profiles(full_name, avatar_url, is_online, id)),
    buddy:buddies(location_city, hourly_rate, rating_avg, languages,
                  profile:profiles(full_name, avatar_url, is_online, id))
  `)
  .or(`tourist_id.eq.${uid},buddy_id.eq.${uid}`)
  .order('last_message_at', { ascending: false, nullsFirst: false })

console.log('\nConversations:', conv?.length || 0, 'error:', convErr?.message || 'none')
if (conv && conv.length > 0) {
  console.log('First:', conv[0].tourist_id, conv[0].buddy_id, conv[0].last_message_preview)
}

const { data: msgs, error: msgErr } = conv && conv[0]
  ? await supabase.from('messages').select('id, sender_id, content, created_at').eq('conversation_id', conv[0].id).order('created_at', { ascending: true })
  : { data: [], error: null }
console.log('\nMessages in first conv:', msgs?.length || 0, msgErr?.message || 'ok')
for (const m of (msgs || []).slice(0, 5)) console.log(' ', m.sender_id?.slice(0,8), '|', m.content.slice(0, 60))
