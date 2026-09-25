import { createClient } from '@supabase/supabase-js'

// SERVER ONLY. Never import this from a 'use client' file.
// Uses the service-role key to bypass RLS for trusted operations
// (currently: upserting tourists/buddies rows during sign-up, and
//  auto-confirming email when the project has "Confirm email" enabled).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured on the server.')
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is not configured on the server.',
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
