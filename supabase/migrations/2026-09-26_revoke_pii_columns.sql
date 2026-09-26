-- ============================================================
-- SECURITY HARDENING — drop anon access to PII columns
-- ============================================================
-- Date: 2026-09-26
-- Issue: even with RLS row-level filters, opted-in (is_visible=true) tourist
-- rows still leak PII like date_of_birth to anonymous users. RLS policies
-- can't restrict columns, only rows.
--
-- Fix: REVOKE table-level SELECT on tourists/buddies from anon, then GRANT
-- SELECT on the safe columns only. Authenticated and service_role keep full
-- access (the row-level RLS policies still apply for them).
--
-- Why two steps? In Postgres, REVOKE on a column only works if the role has
-- the column-level grant but NOT the table-level grant for that column.
-- Since anon has SELECT on the whole table, we must first drop the table-
-- level grant and then grant per-column.
-- ============================================================

REVOKE SELECT ON public.tourists FROM anon;
GRANT SELECT (id, nationality, travel_style, interests, languages, budget_range, arrival_date, destination, is_visible, created_at, updated_at) ON public.tourists TO anon;

-- Buddies: anon discovery needs location_city + specialties + hourly_rate +
-- rating_avg + is_available + languages, but exact lat/long + bio +
-- trips_completed aren't necessary for public discovery.
REVOKE SELECT ON public.buddies FROM anon;
GRANT SELECT (id, location_city, languages, specialties, hourly_rate, is_available, rating_avg) ON public.buddies TO anon;

-- Reviews: keep public read (marketplace needs reviews to be visible) but
-- drop reviewer_id/reviewee_id from anon projection so they can't enumerate
-- user UUIDs by scraping reviews. The safe_reviews view already exposes only
-- safe fields.
REVOKE SELECT ON public.reviews FROM anon;
GRANT SELECT (id, trip_id, rating, comment, created_at) ON public.reviews TO anon;

-- profiles: anon should never read profiles (PII: email, phone, bio).
REVOKE SELECT ON public.profiles FROM anon;
-- No re-grant: profiles is fully owned by authenticated.
