-- ============================================================
-- LOCALit Seed Data — v2.0 (with explicit UUID casts)
-- ============================================================

INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'lan.pham@localit.dev', crypt('password123', gen_salt('bf')), '{"full_name": "Lan Pham", "role": "buddy"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'minh.nguyen@localit.dev', crypt('password123', gen_salt('bf')), '{"full_name": "Minh Nguyen", "role": "buddy"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'huy.nguyen@localit.dev', crypt('password123', gen_salt('bf')), '{"full_name": "Huy Nguyen", "role": "buddy"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'linh.tran@localit.dev', crypt('password123', gen_salt('bf')), '{"full_name": "Linh Tran", "role": "buddy"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'mai.le@localit.dev', crypt('password123', gen_salt('bf')), '{"full_name": "Mai Le", "role": "buddy"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'tuan.vu@localit.dev', crypt('password123', gen_salt('bf')), '{"full_name": "Tuan Vu", "role": "buddy"}'::jsonb),
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, 'john.doe@example.com', crypt('password123', gen_salt('bf')), '{"full_name": "John Doe", "role": "tourist"}'::jsonb),
  ('aaaa2222-2222-2222-2222-222222222222'::uuid, 'sarah.m@example.com', crypt('password123', gen_salt('bf')), '{"full_name": "Sarah Miller", "role": "tourist"}'::jsonb),
  ('aaaa3333-3333-3333-3333-333333333333'::uuid, 'mike.j@example.com', crypt('password123', gen_salt('bf')), '{"full_name": "Mike Johnson", "role": "tourist"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Ensure profiles exist for all users (in case trigger didn't fire)
INSERT INTO public.profiles (id, email, full_name, role, is_online)
SELECT u.id, u.email,
       u.raw_user_meta_data->>'full_name',
       (u.raw_user_meta_data->>'role')::user_role,
       true
FROM auth.users u
WHERE u.id IN (
  '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666',
  'aaaa1111-1111-1111-1111-111111111111','aaaa2222-2222-2222-2222-222222222222',
  'aaaa3333-3333-3333-3333-333333333333'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.buddies (id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, rating_avg, trips_completed, bio) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Da Nang', 16.0544, 108.2023, ARRAY['English', 'Vietnamese']::text[], ARRAY['Beach', 'Food Tours', 'Photography']::text[], 15.00, true, 4.90, 120, 'Da Nang local buddy who loves beach mornings, food stops, and simple routes.'::text),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Da Nang', 16.0678, 108.2108, ARRAY['English', 'French']::text[], ARRAY['Photography', 'Cultural', 'Coffee']::text[], 18.00, true, 4.80, 98, 'Photography-friendly city guide for riverside cafes, bridges, and local stories.'::text),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Hoi An', 15.8801, 108.3380, ARRAY['English', 'Japanese']::text[], ARRAY['History', 'Art', 'Cooking']::text[], 12.00, true, 4.70, 56, 'Cultural heritage expert. Lantern streets and ancient stories!'::text),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'Da Nang', 16.0607, 108.2239, ARRAY['English', 'Korean']::text[], ARRAY['Food Tours', 'Nightlife', 'Shopping']::text[], 14.00, true, 4.90, 42, 'Food tour specialist. Lets taste the best street food!'::text),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'Nha Trang', 16.0933, 108.2506, ARRAY['English', 'Russian']::text[], ARRAY['Beach', 'Diving', 'Party']::text[], 20.00, true, 4.60, 35, 'Beach and diving expert. The ocean is my second home!'::text),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'Da Nang', 16.2008, 108.1311, ARRAY['English', 'Mandarin']::text[], ARRAY['Trekking', 'Photography', 'Local Culture']::text[], 16.00, true, 4.80, 67, 'Mountain trekking specialist. Views worth every step!'::text)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tourists (id, nationality, date_of_birth, travel_style, interests, languages, budget_range, arrival_date, destination) VALUES
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, 'United States', '1995-06-15', 'solo', ARRAY['Beach','Photography','Food']::text[], ARRAY['English']::text[], '50-100', '2026-10-01', 'Da Nang'),
  ('aaaa2222-2222-2222-2222-222222222222'::uuid, 'Australia', '1992-03-22', 'couple', ARRAY['History','Nature','Shopping']::text[], ARRAY['English']::text[], '100-200', '2026-10-05', 'Hoi An'),
  ('aaaa3333-3333-3333-3333-333333333333'::uuid, 'United Kingdom', '1988-11-08', 'friends', ARRAY['Nightlife','Food','Beach']::text[], ARRAY['English','French']::text[], 'under-50', '2026-10-10', 'Da Nang')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.connections (tourist_id, buddy_id, status, message) VALUES
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'accepted', 'Hi Lan! I would love to explore Da Nang with you!'),
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'pending', 'Hi Minh, your photography tours look amazing!'),
  ('aaaa2222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'accepted', 'Hi Huy, I am excited about the lantern festival!')
ON CONFLICT (tourist_id, buddy_id) DO NOTHING;

INSERT INTO public.trips (tourist_id, buddy_id, title, destination, start_date, end_date, status, notes) VALUES
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'Da Nang Beach Adventure', 'Da Nang', '2026-10-01', '2026-10-03', 'confirmed', 'First-time visitor, interested in beach and photography'),
  ('aaaa2222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Hoi An Cultural Exploration', 'Hoi An', '2026-10-05', '2026-10-08', 'planning', 'Anniversary trip, love history and local food');

INSERT INTO public.trip_stops (trip_id, stop_order, name, address, latitude, longitude, notes)
SELECT (t.id)::uuid, s.stop_order, s.name, s.address, s.latitude, s.longitude, s.notes
FROM public.trips t
CROSS JOIN (VALUES
  ('aaaa1111-1111-1111-1111-111111111111'::text, 1, 'My Khe Beach', 'My Khe Beach, Da Nang'::text, 16.0544, 108.2023, 'Sunrise meetup'::text),
  ('aaaa1111-1111-1111-1111-111111111111'::text, 2, 'Marble Mountains', 'Marble Mountains, Da Nang'::text, 15.9980, 108.2669, 'Cave exploration'::text),
  ('aaaa1111-1111-1111-1111-111111111111'::text, 3, 'Dragon Bridge', 'Dragon Bridge, Da Nang'::text, 16.0597, 108.2242, 'Weekend fire show'::text),
  ('aaaa2222-2222-2222-2222-222222222222'::text, 1, 'Hoi An Ancient Town', 'Ancient Town, Hoi An'::text, 15.8801, 108.3380, 'Walking tour'::text),
  ('aaaa2222-2222-2222-2222-222222222222'::text, 2, 'An Bang Beach', 'An Bang Beach, Hoi An'::text, 15.9101, 108.3180, 'Relax afternoon'::text),
  ('aaaa2222-2222-2222-2222-222222222222'::text, 3, 'Hoi An Night Market', 'Hoi An Night Market'::text, 15.8835, 108.3350, 'Lantern shopping'::text)
) AS s(tourist_id_text, stop_order, name, address, latitude, longitude, notes)
WHERE (s.tourist_id_text)::uuid = t.tourist_id;

INSERT INTO public.conversations (tourist_id, buddy_id) VALUES
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid),
  ('aaaa2222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid)
ON CONFLICT (tourist_id, buddy_id) DO NOTHING;

INSERT INTO public.messages (conversation_id, sender_id, content, is_read, created_at) VALUES
  ((SELECT id FROM public.conversations WHERE tourist_id='aaaa1111-1111-1111-1111-111111111111'::uuid AND buddy_id='11111111-1111-1111-1111-111111111111'::uuid),
   'aaaa1111-1111-1111-1111-111111111111'::uuid, 'Hi Lan! I saw your profile and you seem like a great guide!'::text, true, now() - interval '5 hours'),
  ((SELECT id FROM public.conversations WHERE tourist_id='aaaa1111-1111-1111-1111-111111111111'::uuid AND buddy_id='11111111-1111-1111-1111-111111111111'::uuid),
   '11111111-1111-1111-1111-111111111111'::uuid, 'Hello! Thanks for reaching out. I would be happy to help you explore Da Nang!'::text, true, now() - interval '4 hours'),
  ((SELECT id FROM public.conversations WHERE tourist_id='aaaa1111-1111-1111-1111-111111111111'::uuid AND buddy_id='11111111-1111-1111-1111-111111111111'::uuid),
   'aaaa1111-1111-1111-1111-111111111111'::uuid, 'I am planning to visit tomorrow. What places would you recommend?'::text, true, now() - interval '3 hours'),
  ((SELECT id FROM public.conversations WHERE tourist_id='aaaa1111-1111-1111-1111-111111111111'::uuid AND buddy_id='11111111-1111-1111-1111-111111111111'::uuid),
   '11111111-1111-1111-1111-111111111111'::uuid, 'Start with My Khe Beach at sunrise, then Marble Mountains.'::text, true, now() - interval '2 hours'),
  ((SELECT id FROM public.conversations WHERE tourist_id='aaaa1111-1111-1111-1111-111111111111'::uuid AND buddy_id='11111111-1111-1111-1111-111111111111'::uuid),
   '11111111-1111-1111-1111-111111111111'::uuid, 'Sure! Lets meet at the beach tomorrow morning.'::text, false, now() - interval '2 minutes'),
  ((SELECT id FROM public.conversations WHERE tourist_id='aaaa2222-2222-2222-2222-222222222222'::uuid AND buddy_id='33333333-3333-3333-3333-333333333333'::uuid),
   'aaaa2222-2222-2222-2222-222222222222'::uuid, 'Hi Huy! I am so excited about the lantern festival!'::text, true, now() - interval '1 day'),
  ((SELECT id FROM public.conversations WHERE tourist_id='aaaa2222-2222-2222-2222-222222222222'::uuid AND buddy_id='33333333-3333-3333-3333-333333333333'::uuid),
   '33333333-3333-3333-3333-333333333333'::uuid, 'Welcome Sarah! The festival is magical.'::text, true, now() - interval '22 hours');

INSERT INTO public.reviews (trip_id, reviewer_id, reviewee_id, rating, comment)
SELECT t.id, t.tourist_id, t.buddy_id, 5, 'Amazing experience! The guide was professional.'::text
FROM public.trips t
WHERE t.tourist_id = 'aaaa1111-1111-1111-1111-111111111111'::uuid
  AND t.status = 'confirmed'
LIMIT 1;

INSERT INTO public.location_updates (user_id, latitude, longitude, accuracy) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 16.0544, 108.2023, 10),
  ('22222222-2222-2222-2222-222222222222'::uuid, 16.0678, 108.2108, 15),
  ('44444444-4444-4444-4444-444444444444'::uuid, 16.0607, 108.2239, 20),
  ('aaaa1111-1111-1111-1111-111111111111'::uuid, 16.0597, 108.2242, 8),
  ('aaaa2222-2222-2222-2222-222222222222'::uuid, 15.8835, 108.3350, 12);
