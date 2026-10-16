# Signup OTP — Defer Password Until Step 3 (2026-10-16)

## Problem

User reports: "không bấm create account được. nhưng từ khi nhập otp thì đã tạo tài khoản vào data rồi. khiến cho chưa hoàn tất mà đã thêm vào data."

Investigated via `scripts/diag-pending-leak.mjs`. Current state in production:

| email | created | verified | consumed | status |
|---|---|---|---|---|
| `darklunatv@gmail.com` | 06:46:39 | 06:47:01 | **null** | User abandoned after verifying OTP — row lives 15 min |
| `smtp-prod-test@example.com` | 06:35:41 | null | null | Test row, expired |
| `darklunatv+smtptest9999@gmail.com` | 06:14:37 | null | null | Test row, expired |

### What the user is actually seeing

1. User types password + email + name + role on **Step 0** → clicks "Send verification code".
2. `POST /api/auth/signup/start` runs `bcrypt.hash(password)` and writes
   `{ email, password_plain, password_hash, full_name, phone }` into
   `public.email_verifications.pending_payload` (jsonb column).
3. User enters 6-digit code on Step 1 → `consumeOtp` sets
   `verified_at = now()`. **Now the row is "live" but no `auth.users`
   exists yet.**
4. User fills profile on Step 2 → clicks "Create account" on Step 3.
5. If anything blocks Step 3 (network, browser close, navigation away,
   F5 + back, ad-blocker, dev-tools throttle), the verified row persists
   for 15 minutes holding a bcrypt password hash. After 15 min it
   auto-expires (DB sees `expires_at < now()`) but `consumed_at` stays
   `null`, so `findProfileIdByEmail` won't even know to re-route the
   user to a fresh start.

### Risks

| # | Risk | Severity |
|---|---|---|
| 1 | `pending_payload.password_hash` lives in the DB up to 15 min for every drop-off. A backup or DB leak now contains hashed credentials for half-finished signups. | Medium (bcrypt is slow, but the email is attached) |
| 2 | User re-starts signup within 15 min for the same email → `consumeUnverifiedCodesForEmail` only wipes `consumed_at IS NULL` (and `verified_at` is not null), so the prior verified row stays. New `POST /start` returns 400 "email already registered" because the duplicate check in `/start` queries `public.profiles`, not `email_verifications` — but on a retry inside 15 min, the user can't even start because `findProfileIdByEmail` already returned from their first attempt... wait, no, profile only exists after `/complete`. So actually re-start works. The leftover row is just garbage. | Low |
| 3 | UX: user sees "Verification code sent!" and "Code verified ✓" and assumes the account is created. When they navigate away, the row in `email_verifications` *looks* like an account in the Supabase dashboard. | High (perception) |

The user explicitly chose option **"Defer password"** — keep the existing 3-step
flow but stop storing the password in the pending row.

## Goal

- After the user enters their password at Step 0, the password is
  **only** in the browser's React state and the eventual
  `auth.users.encrypted_password` column. It never lives in
  `public.email_verifications` even for a second.
- The `pending_payload` shrinks to `{ email, full_name, phone }` — same
  fields a low-trust "we'll email you later" waitlist would store.
- A user who abandons after Step 1 (OTP verified) leaves a row in
  `email_verifications` that contains **zero credentials**. The row is
  only an "intent to register this email" — safe to keep for the TTL,
  safe to surface in the Supabase dashboard.
- `auth.users` is still only created by `/complete`, behind the OTP gate.
  This part is unchanged.

## What stays the same

- 3-step UX (account → verify-otp → profile). We are NOT collapsing steps.
- `/api/auth/signup/verify-otp` and `/api/auth/signup/resend-otp` are untouched.
- `/api/auth/signup/complete`'s flow (OTP check → create auth.users → upsert profile → insert tourist/buddy → mark consumed) is untouched except it now receives `password` from the body instead of reading it from `pending_payload`.
- `consumeOtp` still uses `pending_payload` to look up the user's name/email
  for the response — those fields are still in the payload, just not the password.
- 15-min OTP TTL. 5-attempt cap. 60s resend cooldown.

## What changes

### Server side

| File | Change |
|---|---|
| `app/api/auth/signup/start/route.ts` | Stop accepting `password` in the body. Drop the `bcrypt.hash(password, 10)` call. `pending_payload` becomes `{ email, full_name, phone }` only. |
| `utils/otp.ts` (`PendingSignupPayload` type) | Remove `password_plain` and `password_hash` fields. Update JSDoc. |
| `app/api/auth/signup/complete/route.ts` | Accept `password` in `CompleteBody` (validated with `validatePassword` server-side — never trust client validation alone). Use it in `createAuthUser({ email, password, full_name, role })` instead of reading from `pending_payload`. |
| `app/api/auth/signup/resend-otp/route.ts` | No change — it never reads the password. |

### Client side

| File | Change |
|---|---|
| `app/register/page.tsx` `startSignup()` | Don't include `password` in the POST body to `/start`. Password stays in `form.password` React state. |
| `app/register/page.tsx` `finalizeSignup()` | Include `password: form.password` in the POST body to `/complete`. |
| `app/register/page.tsx` `FormState` | No change — `password` is already in state from Step 0. |

### Database

| File | Change |
|---|---|
| (no schema change) | We don't migrate `email_verifications` — the jsonb column already supports arbitrary payload shapes. The new keys are a strict subset. |
| `supabase/migrations/2026-10-16-...sql` (new) | Add a partial index `email_verifications(expires_at) WHERE consumed_at IS NULL` so the future cleanup cron is O(1) instead of seq scan. |

## Edge cases

1. **User re-clicks "Send code" on Step 0** while a row already exists for the
   same email. `/start` already calls `consumeUnverifiedCodesForEmail(email)`
   which sets `consumed_at = NOW()` on any prior rows where
   `consumed_at IS NULL`. So the prior row is wiped before a new one is
   inserted. **No change needed.** Verified by reading
   `utils/otp.ts:consumeUnverifiedCodesForEmail`.

2. **User F5's on Step 1 (verify-otp) after entering the code.** The
   `signupId` is held in `useState` and is wiped on reload. They have to
   re-enter email + click "Send code" again. This was the existing
   behaviour — pre-fix, the re-start would skip the password field
   because `/start` accepted `password` (the user would re-type it).
   **No change** — UX is identical.

3. **User F5's on Step 2 (profile) after OTP verified but before
   creating account.** The signupId is lost. They have to start over.
   The verified-but-not-consumed row will sit there for 15 min. **No
   change** — but with the password fix, that row no longer contains a
   password hash. Less of a concern.

4. **User has two browser tabs open on Step 1.** Both get the same
   `signupId` from a shared `/start` call. They both enter the code.
   The first to submit wins; the second sees
   `wrong_code` (because the verified_at has moved past the OTP's
   `attempts` field). No change — same as today.

5. **OTP `__devCode` preview mode (dev only).** No change — the dev code
   is returned in the response, the payload doesn't change.

6. **`supabase/migration` clean-up cron.** Not in scope for this fix.
   The 15-min TTL already auto-expires rows. A future session can add
   a pg_cron job that runs
   `DELETE FROM email_verifications WHERE expires_at < NOW() - INTERVAL '1 day'`
   on a daily schedule. Tracked as a follow-up.

## Server-side validation: why we still need `validatePassword` on /complete

The client already runs `validatePassword` at Step 0 and disables the
submit button if the password is weak. But the password is held in
React state and travels in the JSON body to `/complete`. A malicious
caller could POST any string to `/complete` and bypass the client check.

`/complete` must:
1. Re-validate password length (≥ 10) + complexity (letter + non-letter).
2. Re-cap password length at 128.
3. Re-sanitize email + full_name (already done today via `sanitizePayload`).

This was already implicit in the old code via the `pending_payload`
sanitisation, but it becomes explicit now that `password` is in the
request body. Add it.

## Test plan

1. **Unit / diag:**
   ```bash
   node scripts/diag-pending-leak.mjs
   ```
   Expect: any new pending row created via `/start` has
   `pending_payload` containing only `email`, `full_name`, `phone`. No
   `password_*` keys.

2. **Manual smoke (against canonical production):**
   - Open `/register`.
   - Step 0: enter email `smoke-{timestamp}@test.com`, name, role, password
     `Pa55word!!`. Click "Send verification code".
   - Run the diag script. Find the row.
   - `SELECT pending_payload FROM email_verifications WHERE email LIKE 'smoke-%'`
     → expect `{"email":..., "full_name":..., "phone":...}` and nothing else.
   - Enter the OTP from the email (or `__devCode` if `OTP_PREVIEW=true`).
   - Step 2: pick interests → click "Create account".
   - Should land on `/dashboard`. `auth.users` row exists with the password.

3. **Regression:**
   - Existing seed accounts (`lan.pham@localit.dev`, `john.doe@example.com`)
     still sign in. No change to `/login`.
   - Resend OTP path still works. No password data ever round-trips.
   - Wrong OTP path still returns `wrong_code` 5 times then `too_many_attempts`.

4. **Cleanup the test rows from the production DB** (manual one-off SQL
   after smoke):
   ```sql
   DELETE FROM public.email_verifications
   WHERE email LIKE 'smoke-%'
      OR email LIKE 'darklunatv+%'
      OR email = 'smtp-prod-test@example.com';
   ```

## Implementation order

1. Update `utils/otp.ts` — drop `password_*` from `PendingSignupPayload`.
2. Update `app/api/auth/signup/start/route.ts` — stop reading/writing password.
3. Update `app/api/auth/signup/complete/route.ts` — accept + validate password
   in body, pass to `createAuthUser`.
4. Update `app/register/page.tsx` — stop sending password to `/start`,
   send it to `/complete`.
5. Build + verify.
6. Deploy to production.
7. Run smoke test.
8. Clean up test rows.
9. Update `AGENTS.md` (this file) with a one-liner.

## What is explicitly out of scope

- Schema migration to rename `pending_payload` → `pending_intent`. The
  column name is still accurate; only its contents changed.
- Cleanup cron for expired `email_verifications` rows. Tracked separately.
- A "Resume signup" flow that lets a returning user re-use a verified
  row after F5. Tracked separately.
- Persisting password in the OTP email so the user can re-start. No —
  the whole point of this fix is the opposite.
