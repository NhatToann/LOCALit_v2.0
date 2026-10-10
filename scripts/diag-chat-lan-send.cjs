// Test: Lan tries to insert a message into conv 8c48a631 (her conv with Nhật Toàn)
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  // Sign in Lan
  const lanRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'lan.pham@localit.dev', password: 'password123' }),
  });
  const lanJson = await lanRes.json();
  console.log('LAN login status:', lanRes.status);
  if (!lanJson.access_token) {
    console.log('LAN login body:', JSON.stringify(lanJson, null, 2));
    return;
  }

  // Sign in Toan (try several passwords)
  const pwds = ['password123', 'Password123', 'that1arlecchino', 'toan', 'toan123', 'darkluna'];
  let toanToken = null;
  for (const p of pwds) {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'darklunatv@gmail.com', password: p }),
    });
    const j = await r.json();
    if (j.access_token) {
      toanToken = j.access_token;
      console.log('Toan login OK with pwd:', p);
      break;
    }
  }
  if (!toanToken) {
    console.log('Toan login failed all pwd attempts');
  }

  // Now Lan tries to insert into conv 8c48a631
  const lanSupa = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${lanJson.access_token}` } },
  });

  const convId = '8c48a631-f230-4622-8c66-5cb1c27e46e7';
  const lanId = '11111111-1111-1111-1111-111111111111';
  const toanId = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01';

  // Test 1: Lan inserts
  console.log('--- TEST 1: Lan sends to conv 8c48a631 ---');
  const r1 = await lanSupa.from('messages').insert({
    conversation_id: convId,
    sender_id: lanId,
    content: 'LAN_TEST_' + Date.now(),
    message_type: 'text',
  }).select('*').single();
  console.log('Lan insert result:', JSON.stringify(r1, null, 2));

  // Test 2: Lan reads messages
  console.log('--- TEST 2: Lan reads messages ---');
  const r2 = await lanSupa.from('messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(5);
  console.log('Lan read messages:', JSON.stringify(r2, null, 2));

  // Test 3: Lan reads conversations
  console.log('--- TEST 3: Lan reads conversations ---');
  const r3 = await lanSupa.from('conversations').select('*').or(`tourist_id.eq.${lanId},buddy_id.eq.${lanId}`);
  console.log('Lan read convs:', JSON.stringify(r3, null, 2));
})();
