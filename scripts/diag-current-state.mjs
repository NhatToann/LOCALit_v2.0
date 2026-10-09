#!/usr/bin/env node
/**
 * Check current buddies, tourists, profiles, swipes, matches state
 */
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'

const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
if (!pw) { console.error('Set DB_PW env var'); process.exit(1) }

const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: pw, database: DB_NAME, ssl: { rejectUnauthorized: false } })
await pg.connect()

console.log('=== AUTH USERS ===')
const u = await pg.query("SELECT id, email, raw_user_meta_data->>'full_name' AS full_name, raw_user_meta_data->>'role' AS role, instance_id IS NOT NULL AS has_instance, email_confirmed_at IS NOT NULL AS confirmed FROM auth.users ORDER BY email")
console.table(u.rows)

console.log('\n=== PROFILES ===')
const p = await pg.query("SELECT id, email, full_name, role, is_online FROM public.profiles ORDER BY full_name")
console.table(p.rows)

console.log('\n=== BUDDIES ===')
const b = await pg.query("SELECT b.id, p.full_name, p.email, b.location_city, b.specialties, b.hourly_rate, b.rating_avg, b.is_available FROM public.buddies b JOIN public.profiles p ON p.id = b.id ORDER BY p.full_name")
console.table(b.rows)

console.log('\n=== TOURISTS ===')
const t = await pg.query("SELECT t.id, p.full_name, p.email, t.nationality, t.languages, t.interests FROM public.tourists t JOIN public.profiles p ON p.id = t.id ORDER BY p.full_name")
console.table(t.rows)

console.log('\n=== SWIPES (total) ===')
const sw = await pg.query("SELECT COUNT(*)::int AS total, direction, swiper_role FROM public.swipes GROUP BY direction, swiper_role")
console.table(sw.rows)

console.log('\n=== MATCHES ===')
const m = await pg.query("SELECT m.id, p1.full_name AS tourist, p2.full_name AS buddy, m.created_at FROM public.matches m JOIN public.profiles p1 ON p1.id = m.tourist_id JOIN public.profiles p2 ON p2.id = m.buddy_id ORDER BY m.created_at DESC")
console.table(m.rows)

console.log('\n=== LOCATION UPDATES (buddies) ===')
const l = await pg.query("SELECT l.user_id, p.full_name, l.latitude, l.longitude, l.updated_at FROM public.location_updates l JOIN public.profiles p ON p.id = l.user_id ORDER BY l.updated_at DESC")
console.table(l.rows)

await pg.end()
