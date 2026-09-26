# QA Status

## Live production URL
https://localit-30ous7fxa-nhattoann.vercel.app/

## Red-team security audit — 2026-09-26 ✅

The red-team attack suite (`scripts/redteam-attack.mjs`) ran 16 attacks against production. **All criticals closed**:

| Attack | Before | After |
|---|---|---|
| Anon reads PII from tourists/buddies/reviews | 🚨 Leaked DOB, bio, email | ✅ Returns 401 |
| Auto-confirm IDOR | ✅ already 401 | ✅ still 401 |
| Verify-OTP user enumeration (404 vs 410) | ⚠️ leaks user existence | ✅ Both 400 |
| Signup oversized payload | ⚠️ silently truncated | ✅ 400 |
| Map/browse profiles join | ⚠️ would break | ✅ Uses safe_profiles |
| OTP resend amplification | 🚨 15/15 sent | ✅ 3/min |
| OTP brute force | ✅ 5 attempts | ✅ + rate limit |
| Signup burst | ⚠️ 30 succeeded | ⚠️ 28 succeeded (per-instance limit only — Vercel multi-instance caveat) |
| CSRF newsletter | ✅ | ✅ |
| Admin role signup | ✅ rejected | ✅ |
| XSS in names/bio | ✅ React escapes | ✅ |
| SQL/NoSQL injection | ✅ rejected | ✅ |

### Defenses shipped
1. **RLS row-level** (migration `2026-09-26_tighten_rls.sql`): tourists/buddies only visible when `is_visible=true`/`is_available=true` OR owner.
2. **Column-level grants** (migration `2026-09-26_revoke_pii_columns.sql`): anon loses `date_of_birth`, `email`, `phone`, `bio`, lat/long. Reads only id/nationality/travel_style/interests/languages/budget_range/destination/is_visible for tourists; id/location_city/languages/specialties/hourly_rate/is_available/rating_avg for buddies; id/trip_id/rating/comment/created_at for reviews; nothing for profiles.
3. **Public-safe views**: `safe_profiles`, `safe_reviews` route anonymous joins.
4. **`/api/auth/verify-otp`** now collapses 404/410 to generic 400 + adds IP rate limit.
5. **`/api/auth/signup`** rejects (not truncates) oversized free-text fields.
6. **`/map` and `/tourist/browse`** use `safe_profiles` instead of `profiles` for anonymous viewers.

## Non-tech QA walker — running in background

The QA Walker sub-agent is currently clicking every flow on the live site as a non-tech user. When it finishes, this file will be updated with its findings.

## Reproducing the redteam suite
```bash
node scripts/redteam-attack.mjs   # writes scripts/redteam-results.json
node scripts/probe-anon-reads.mjs # direct anon reads (no login required)
node scripts/diag-redteam-privs.mjs # Postgres column-privilege matrix
```

## Future hardening (deferred)
- Move in-memory rate limit to Upstash Redis / Vercel KV so it survives lambda cold starts across instances.
- Add a per-user (not per-IP) budget for OTP requests to block credential-stuffing attacks.
- Replace the `#` placeholder links for Terms / Privacy / Contact / Status / Sitemap with real pages before launch.
