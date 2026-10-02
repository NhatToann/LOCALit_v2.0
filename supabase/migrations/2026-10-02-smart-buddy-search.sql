-- 2026-10-02-smart-buddy-search.sql
-- Adds a full-text search index on buddies, a popular_stops table for
-- named anchors, and two RPCs (search_buddies, search_buddies_facets)
-- that the /search page calls. All idempotent.

-- A. Extensions (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- B. Generated tsvector column on buddies + GIN indexes
ALTER TABLE public.buddies
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(location_city, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(bio, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS buddies_search_tsv_idx
  ON public.buddies USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS buddies_specialties_idx
  ON public.buddies USING GIN (specialties);

CREATE INDEX IF NOT EXISTS buddies_languages_idx
  ON public.buddies USING GIN (languages);

-- search_tsv is a generated column derived from non-PII fields
-- (location_city + bio) plus the publicly-readable specialties +
-- languages arrays. The search_buddies RPC needs it to rank
-- results; we expose it through safe_buddies (the public view) so
-- anon can rank without a column-level grant that would also widen
-- access to other columns.
DROP VIEW IF EXISTS public.safe_buddies;
CREATE VIEW public.safe_buddies AS
SELECT
  id,
  location_city,
  languages,
  specialties,
  hourly_rate,
  is_available,
  rating_avg,
  bio,
  search_tsv,
  ROUND(latitude::numeric, 3)::double precision AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude
FROM public.buddies
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

GRANT SELECT ON public.safe_buddies TO anon, authenticated;

-- Recreate safe_reviews (was dropped 2026-09-27 as orphaned) so the
-- search_buddies RPC can compute rating_avg / rating_count for anon
-- callers without needing table-level access to public.reviews.
CREATE OR REPLACE VIEW public.safe_reviews AS
SELECT id, trip_id, reviewer_id, reviewee_id, rating, comment, created_at
FROM public.reviews;

GRANT SELECT ON public.safe_reviews TO anon, authenticated;

-- C. popular_stops table — seeded by scripts/seed-popular-stops.mjs
CREATE TABLE IF NOT EXISTS public.popular_stops (
  slug text PRIMARY KEY,
  name text NOT NULL,
  address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  category text NOT NULL
);

ALTER TABLE public.popular_stops ENABLE ROW LEVEL SECURITY;

-- Public read access (anon + authenticated). Page is a discovery surface.
GRANT SELECT ON public.popular_stops TO anon, authenticated;

DROP POLICY IF EXISTS popular_stops_public_read ON public.popular_stops;
CREATE POLICY popular_stops_public_read ON public.popular_stops
  FOR SELECT TO anon, authenticated
  USING (true);

-- D. search_buddies RPC
-- Inputs:  q text, anchor_lat double precision, anchor_lng double precision,
--          radius_km integer, lang text, tag text, place text,
--          sort text ('match'|'distance'|'rating'), limit_n int, offset_n int
-- Outputs: id, full_name, location_city, lat, lng, distance_km,
--          match_score, text_score, geo_score, tag_score, avail_score,
--          languages[], specialties[], hourly_rate, rating_avg, rating_count,
--          is_online, is_available, avatar_url
CREATE OR REPLACE FUNCTION public.search_buddies(
  q text DEFAULT '',
  anchor_lat double precision DEFAULT NULL,
  anchor_lng double precision DEFAULT NULL,
  radius_km integer DEFAULT 50,
  lang text DEFAULT NULL,
  tag text DEFAULT NULL,
  place text DEFAULT NULL,
  sort text DEFAULT 'match',
  limit_n int DEFAULT 20,
  offset_n int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  full_name text,
  location_city text,
  lat double precision,
  lng double precision,
  distance_km double precision,
  match_score numeric,
  text_score numeric,
  geo_score numeric,
  tag_score numeric,
  avail_score numeric,
  languages text[],
  specialties text[],
  hourly_rate numeric,
  rating_avg numeric,
  rating_count bigint,
  is_online boolean,
  is_available boolean,
  avatar_url text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  tsq tsquery;
  v_place_lat double precision;
  v_place_lng double precision;
  v_anchor_lat double precision := anchor_lat;
  v_anchor_lng double precision := anchor_lng;
  v_q text := trim(q);
BEGIN
  -- Resolve a named place (popular_stops slug) to lat/lng if provided
  -- and no manual anchor was passed.
  IF place IS NOT NULL THEN
    SELECT ps.lat, ps.lng INTO v_place_lat, v_place_lng
    FROM public.popular_stops ps WHERE ps.slug = place LIMIT 1;
  END IF;
  IF v_anchor_lat IS NULL AND v_place_lat IS NOT NULL THEN
    v_anchor_lat := v_place_lat;
  END IF;
  IF v_anchor_lng IS NULL AND v_place_lng IS NOT NULL THEN
    v_anchor_lng := v_place_lng;
  END IF;

  tsq := CASE WHEN length(v_q) >= 2
              THEN websearch_to_tsquery('simple', v_q) END;

  RETURN QUERY
  WITH base AS (
    SELECT
      b.id, b.location_city, b.latitude, b.longitude,
      b.specialties AS buddy_specialties,
      b.languages AS buddy_languages,
      b.hourly_rate,
      b.is_available, b.search_tsv,
      -- Compute a wider tsvector on the fly for FTS ranking (includes
      -- specialties + languages which the generated column does not).
      (
        b.search_tsv ||
        setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(b.specialties, ' '), '')), 'B') ||
        setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(b.languages, ' '), '')), 'B') ||
        setweight(to_tsvector('simple'::regconfig, coalesce(p.full_name, '')), 'A')
      ) AS full_tsv,
      p.full_name, p.avatar_url, p.is_online,
      COALESCE((
        SELECT AVG(r.rating)::numeric FROM public.safe_reviews r
        WHERE r.reviewee_id = b.id
      ), 0) AS rating_avg,
      COALESCE((
        SELECT COUNT(*) FROM public.safe_reviews r WHERE r.reviewee_id = b.id
      ), 0) AS rating_count
    FROM public.safe_buddies b
    JOIN public.safe_profiles p ON p.id = b.id
    WHERE b.location_city = 'Da Nang'
      AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
      AND (lang IS NULL OR b.languages @> ARRAY[lang]::text[])
      AND (tag  IS NULL OR b.specialties @> ARRAY[tag]::text[])
  ),
  ranked AS (
    SELECT
      base.*,
      -- 1. text score (0..100, capped trigram bonus)
      LEAST(100,
        (CASE WHEN tsq IS NOT NULL AND base.full_tsv @@ tsq
              THEN ts_rank_cd(base.full_tsv, tsq) * 100 ELSE 0 END)
        + CASE WHEN length(v_q) >= 4
               THEN LEAST(20, similarity(base.full_name, v_q) * 40) ELSE 0 END
      )::numeric AS text_score,
      -- 2. geo score (0..100, exp-decay 7 km half-life)
      CASE WHEN v_anchor_lat IS NULL THEN 50.0
           ELSE LEAST(100.0,
             100.0 * exp(-(
               6371 * acos(
                 LEAST(1.0, GREATEST(-1.0,
                   cos(radians(v_anchor_lat)) * cos(radians(base.latitude)) *
                   cos(radians(base.longitude) - radians(v_anchor_lng)) +
                   sin(radians(v_anchor_lat)) * sin(radians(base.latitude))
                 ))
               )
             ) / 7.0))
      END::numeric AS geo_score,
      -- 3. tag score (jaccard against the canonical specialties list, 0..100)
      CASE WHEN cardinality(base.buddy_specialties) = 0 THEN 0
           ELSE (cardinality(ARRAY(
             SELECT unnest(base.buddy_specialties)
             INTERSECT SELECT unnest(ARRAY['street-food','history','nightlife','photography','shopping','nature','wellness','language-exchange','motorbike-tours','fishing','cooking-class','artisan-craft'])
           ))::numeric / cardinality(base.buddy_specialties)) * 100
      END::numeric AS tag_score,
      -- 4. availability score
      (CASE WHEN base.is_available AND base.is_online THEN 100
            WHEN base.is_available THEN 60
            ELSE 30 END)::numeric AS avail_score,
      -- distance_km
      CASE WHEN v_anchor_lat IS NULL THEN NULL::double precision
           ELSE (6371 * acos(
             LEAST(1.0, GREATEST(-1.0,
               cos(radians(v_anchor_lat)) * cos(radians(base.latitude)) *
               cos(radians(base.longitude) - radians(v_anchor_lng)) +
               sin(radians(v_anchor_lat)) * sin(radians(base.latitude))
             ))
           ))::double precision
      END AS distance_km
    FROM base
  ),
  scored AS (
    SELECT
      r.*,
      (r.text_score * 0.40
       + r.geo_score * 0.30
       + r.tag_score * 0.20
       + r.avail_score * 0.10)::numeric(5,2) AS match_score
    FROM ranked r
    WHERE (v_anchor_lat IS NULL OR r.distance_km <= radius_km)
      AND (length(v_q) < 2
           OR r.text_score > 0
           OR similarity(r.full_name, v_q) > 0.25)
  )
  SELECT
    s.id, s.full_name, s.location_city, s.latitude, s.longitude,
    s.distance_km::double precision AS distance_km, s.match_score, s.text_score, s.geo_score, s.tag_score, s.avail_score,
    s.buddy_languages AS languages, s.buddy_specialties AS specialties, s.hourly_rate, s.rating_avg, s.rating_count,
    s.is_online, s.is_available, s.avatar_url
  FROM scored s
  ORDER BY
    CASE WHEN sort = 'distance' THEN s.distance_km END ASC NULLS LAST,
    CASE WHEN sort = 'rating'   THEN s.rating_avg END DESC NULLS LAST,
    CASE WHEN sort = 'match'    THEN s.match_score END DESC,
    s.match_score DESC
  LIMIT limit_n OFFSET offset_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_buddies(
  text, double precision, double precision, integer, text, text, text, text, int, int
) TO anon, authenticated;

-- E. search_buddies_facets RPC — returns the dynamic facet counts that
-- the sidebar renders. The same filter logic as search_buddies, but
-- without ordering and without pagination.
CREATE OR REPLACE FUNCTION public.search_buddies_facets(
  q text DEFAULT '',
  lang text DEFAULT NULL,
  tag text DEFAULT NULL,
  place text DEFAULT NULL,
  anchor_lat double precision DEFAULT NULL,
  anchor_lng double precision DEFAULT NULL,
  radius_km integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  v_place_lat double precision;
  v_place_lng double precision;
  v_anchor_lat double precision := anchor_lat;
  v_anchor_lng double precision := anchor_lng;
  v_q text := trim(q);
  v_tsq tsquery;
  v_result jsonb;
BEGIN
  IF place IS NOT NULL THEN
    SELECT ps.lat, ps.lng INTO v_place_lat, v_place_lng
    FROM public.popular_stops ps WHERE ps.slug = place LIMIT 1;
  END IF;
  IF v_anchor_lat IS NULL AND v_place_lat IS NOT NULL THEN
    v_anchor_lat := v_place_lat;
  END IF;
  IF v_anchor_lng IS NULL AND v_place_lng IS NOT NULL THEN
    v_anchor_lng := v_place_lng;
  END IF;

  v_tsq := CASE WHEN length(v_q) >= 2
                THEN websearch_to_tsquery('simple', v_q) END;

  WITH base AS (
    SELECT
      b.id, b.location_city, b.latitude, b.longitude,
      b.specialties, b.languages, b.is_available, b.search_tsv,
      p.is_online,
      CASE WHEN v_anchor_lat IS NULL THEN NULL
           ELSE 6371 * acos(
             LEAST(1.0, GREATEST(-1.0,
               cos(radians(v_anchor_lat)) * cos(radians(b.latitude)) *
               cos(radians(b.longitude) - radians(v_anchor_lng)) +
               sin(radians(v_anchor_lat)) * sin(radians(b.latitude))
             ))
           )
      END AS distance_km
    FROM public.safe_buddies b
    JOIN public.safe_profiles p ON p.id = b.id
    WHERE b.location_city = 'Da Nang'
      AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
      AND (lang IS NULL OR b.languages @> ARRAY[lang]::text[])
      AND (tag  IS NULL OR b.specialties @> ARRAY[tag]::text[])
      AND (v_anchor_lat IS NULL OR
           6371 * acos(
             LEAST(1.0, GREATEST(-1.0,
               cos(radians(v_anchor_lat)) * cos(radians(b.latitude)) *
               cos(radians(b.longitude) - radians(v_anchor_lng)) +
               sin(radians(v_anchor_lat)) * sin(radians(b.latitude))
             ))
           ) <= radius_km)
      AND (length(v_q) < 2
           OR b.search_tsv @@ v_tsq
           OR similarity(COALESCE(p.full_name, ''), v_q) > 0.25)
  )
  SELECT jsonb_build_object(
    'specialties', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('value', s.tag, 'count', s.c) ORDER BY s.c DESC), '[]'::jsonb)
      FROM (
        SELECT unnest(specialties) AS tag, COUNT(*)::int AS c
        FROM base
        GROUP BY 1
      ) s
    ),
    'languages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('value', l.lang, 'count', l.c) ORDER BY l.c DESC), '[]'::jsonb)
      FROM (
        SELECT unnest(languages) AS lang, COUNT(*)::int AS c
        FROM base
        GROUP BY 1
      ) l
    ),
    'cities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('value', c.city, 'count', c.c) ORDER BY c.c DESC), '[]'::jsonb)
      FROM (
        SELECT location_city AS city, COUNT(*)::int AS c
        FROM base
        GROUP BY 1
      ) c
    ),
    'available', (
      SELECT COUNT(*)::int FROM base WHERE is_available
    ),
    'online', (
      SELECT COUNT(*)::int FROM base WHERE is_online
    ),
    'total', (
      SELECT COUNT(*)::int FROM base
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_buddies_facets(
  text, text, text, text, double precision, double precision, integer
) TO anon, authenticated;
