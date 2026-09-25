// Create buddy auth users via direct DB insert (skip Supabase auth API rate limit)
import { Client } from 'pg'

const BUDDIES = [
  { email: 'lan.pham.buddy@gmail.com', name: 'Lan Pham', city: 'Da Nang', lat: 16.0544, lng: 108.2023, specialties: ['food','culture','history'], languages: ['Vietnamese','English'], rate: 25, bio: 'Sinh ra và lớn lên tại Đà Nẵng, mình sẽ chỉ bạn những quán ăn ngon nhất và các địa điểm văn hóa độc đáo.' },
  { email: 'huy.nguyen.buddy@gmail.com', name: 'Huy Nguyen', city: 'Hoi An', lat: 15.8801, lng: 108.3380, specialties: ['history','photography'], languages: ['Vietnamese','English','French'], rate: 30, bio: 'Photographer và hướng dẫn viên tại Hội An, đam mê lịch sử và kiến trúc cổ.' },
  { email: 'mai.tran.buddy@gmail.com', name: 'Mai Tran', city: 'Hanoi', lat: 21.0285, lng: 105.8542, specialties: ['food','nightlife'], languages: ['Vietnamese','English'], rate: 20, bio: 'Sống ở Hà Nội hơn 25 năm, biết hết mọi ngóc ngách ăn uống và giải trí.' },
  { email: 'tuan.le.buddy@gmail.com', name: 'Tuan Le', city: 'Ho Chi Minh City', lat: 10.8231, lng: 106.6297, specialties: ['business','nightlife'], languages: ['Vietnamese','English','Korean'], rate: 35, bio: 'Chuyên gia về Sài Gòn hiện đại, quán bar, café, và business networking.' },
  { email: 'linh.nguyen.buddy@gmail.com', name: 'Linh Nguyen', city: 'Da Nang', lat: 16.0471, lng: 108.2068, specialties: ['adventure','nature'], languages: ['Vietnamese','English'], rate: 28, bio: 'Yêu thiên nhiên và phiêu lưu, đưa bạn khám phá Bà Nà Hills và Sơn Trà.' },
  { email: 'bao.vo.buddy@gmail.com', name: 'Bao Vo', city: 'Nha Trang', lat: 12.2388, lng: 109.1967, specialties: ['beach','diving','food'], languages: ['Vietnamese','English','Russian'], rate: 25, bio: 'Thợ lặn chuyên nghiệp và foodie tại Nha Trang.' },
]

const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function ensureBuddy(b) {
  const ex = await pg.query('SELECT id FROM auth.users WHERE email = $1', [b.email])
  let userId = ex.rows[0]?.id

  if (!userId) {
    // Use the standard zero UUID instance_id
    const ins = await pg.query(
      `INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1::text,
        crypt($2::text, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', $3::text, 'role', 'buddy'),
        now(), now(),
        ''::text, ''::text, ''::text, ''::text
      ) RETURNING id`,
      [b.email, 'password123', b.name]
    )
    userId = ins.rows[0].id
    console.log(`Created ${b.email}`)
  } else {
    console.log(`Existing ${b.email}`)
  }

  // Ensure profile role = buddy
  await pg.query(
    `INSERT INTO public.profiles (id, email, full_name, role, is_online)
     VALUES ($1, $2, $3, 'buddy', true)
     ON CONFLICT (id) DO UPDATE SET full_name = $3, is_online = true, role = 'buddy'`,
    [userId, b.email, b.name]
  )

  // Upsert buddy
  await pg.query(
    `INSERT INTO public.buddies (id, location_city, latitude, longitude, specialties, languages, hourly_rate, bio, is_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     ON CONFLICT (id) DO UPDATE SET
       location_city = $2, latitude = $3, longitude = $4,
       specialties = $5, languages = $6, hourly_rate = $7, bio = $8, is_available = true`,
    [userId, b.city, b.lat, b.lng, b.specialties, b.languages, b.rate, b.bio]
  )

  // Upsert location (delete then insert since no unique constraint on user_id)
  await pg.query('DELETE FROM public.location_updates WHERE user_id = $1', [userId])
  await pg.query(
    `INSERT INTO public.location_updates (user_id, latitude, longitude, accuracy, updated_at)
     VALUES ($1, $2, $3, 50, now())`,
    [userId, b.lat, b.lng]
  )

  return userId
}

async function main() {
  await pg.connect()
  const ids = {}
  for (const b of BUDDIES) {
    ids[b.email] = await ensureBuddy(b)
  }

  // Demo connection
  const t = await pg.query("SELECT id FROM auth.users WHERE email = 'john.doe.tourist@gmail.com'")
  if (t.rows.length > 0 && ids['lan.pham.buddy@gmail.com']) {
    await pg.query(
      `INSERT INTO public.connections (tourist_id, buddy_id, status, message, created_at)
       VALUES ($1, $2, 'accepted', 'Demo connection từ Lan Pham', now())
       ON CONFLICT DO NOTHING`,
      [t.rows[0].id, ids['lan.pham.buddy@gmail.com']]
    )
    await pg.query(
      `INSERT INTO public.trips (tourist_id, buddy_id, title, destination, start_date, end_date, status, created_at)
       VALUES ($1, $2, 'Khám phá Đà Nẵng', 'Da Nang', CURRENT_DATE, CURRENT_DATE + 3, 'confirmed', now())
       ON CONFLICT DO NOTHING`,
      [t.rows[0].id, ids['lan.pham.buddy@gmail.com']]
    )
    console.log('Created demo connection + trip')
  }

  await pg.end()
  console.log('\n✓ Seed complete')
}
main().catch(err => { console.error(err); process.exit(1) })
