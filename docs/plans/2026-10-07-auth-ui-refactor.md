# Auth UI/UX Refactor — 2026-10-07

## Bug investigation summary

### What works (verified E2E 2026-10-07)
1. ✅ `POST /api/auth/signup/start` creates pending row, sends email (if Resend domain verified)
2. ✅ `POST /api/auth/signup/verify-otp` correctly validates the 6-digit code
3. ✅ `POST /api/auth/signup/complete` creates `auth.users` + `profiles` + `tourists` row
4. ✅ `signInWithPassword` works with the new account, returns valid session
5. ✅ Profile row is queryable from the new session

### Real bugs found

#### B1. Resend test mode can only email the Resend account owner
- `EMAIL_FROM=onboarding@resend.dev` is the default. To send OTP to arbitrary
  recipients, you must verify a domain at https://resend.com/domains and set
  `EMAIL_FROM=noreply@yourdomain.com`.
- **Result**: a real user signing up with their own email **never receives the OTP**
  in production. The API returns 200 but Resend silently fails or rejects.
- **User-visible impact**: stuck on Step 2 forever, "I never got the code"
- **Severity**: CRITICAL — flow is non-functional for anyone except the Resend owner

#### B2. Form state doesn't update on paste / autofill / programmatic value set
- All form inputs use only `onChange` (React synthetic event). When a browser
  autofill, password manager (1Password, Bitwarden), or paste-without-keystrokes
  sets the value, React state stays `''`.
- **Reproduction**: in the testing session, calling `browser_fill` (which sets
  `.value` directly and dispatches `input` event) left React state empty even
  though the DOM showed the value.
- **User-visible impact**: form looks filled, but "Send verification code"
  button stays disabled. User confused.
- **Fix**: add `onInput` alongside `onChange` (React's `onChange` is supposed
  to fire on paste too, but doesn't on all browsers — `onInput` is the
  native fallback).

#### B3. Reset password page has inconsistent password policy
- `app/reset-password/page.tsx` line 32-33: client-side validation requires
  8 chars + letters + digits.
- `utils/password-validator.ts` (used by signup/login): 10 chars + lowercase
  + (letter AND non-letter).
- **User-visible impact**: user can reset to `Test1234` (8 chars) on
  reset-password page, but the same password would have been rejected at
  signup. Then later if the server-side check ever tightens, login breaks.

#### B4. Reset password page doesn't gate on session
- `app/reset-password/page.tsx` line 20-25: `getCurrentUser()` returns null
  for unauthenticated visits (e.g. direct URL, expired link). The code sets
  `error` state but **never disables the form** — user can still type a
  password, click "Reset password", and `updatePassword` will fail with a
  cryptic Supabase error.
- **User-visible impact**: "Save…" spinner appears, then generic error.

#### B5. Flow has 4 steps when 2 would do
- Current: Personal info (1) → Verify email (2) → Choose role (3) → Tags & bio (4)
- Each step is a full page transition with a stepper
- Drop-off rate at each step is real (Hick's law, mobile friction)
- **Fix**: combine "personal + role" into one form, "verify + tags" into one
  flow with a sidebar that shows progress

#### B6. Forgot password gives no recovery path
- If `resetPasswordForEmail` succeeds but the email never arrives (B1 again),
  user is stuck. No "try a different email" or "didn't get it? check spam"
  affordance beyond a single success message.

#### B7. Login page accepts 6-char passwords but signup requires 10
- `app/login/page.tsx` line 23: `canSignIn = emailLooksValid && password.length >= 6`
- A user who registered with the old 6-char policy can still sign in, but
  anyone who registered with the new 10-char policy and tries to log in
  with a 6-char password gets a generic error from Supabase.

### What we are NOT changing (per user: "UI only, keep API + DB")
- Backend `/api/auth/signup/{start,verify-otp,resend-otp,complete}` stays
- `email_verifications` table stays
- `profiles`/`tourists`/`buddies` schema stays
- Only the **client** form components are refactored

## Implementation plan (UI-only)

### Phase 1: Paste/autofill fix (B2)
- Add `onInput` handler alongside `onChange` for all form inputs
- Test with 1Password paste simulation

### Phase 2: Reset password fix (B3, B4)
- Use `validatePassword` from `utils/password-validator.ts` (10 chars + letter + non-letter)
- Disable the form when `getCurrentUser()` returns null
- Show clearer error: "Open this page from the link in your email"

### Phase 3: Login form (B7)
- Update `canSignIn` to use `validatePassword` (or at least raise to 10 chars)
- Better error messages that distinguish "wrong password" from "user not found"
  while not leaking which one (use generic "Sign in failed" + maybe a separate
  "Forgot password?" link)

### Phase 4: Forgot password improvement (B6)
- Add "Resend link" button if user comes back
- Show clearer copy: "If you don't see the email in 1 minute, check spam
  or try a different address"

### Phase 5: Register flow simplification (B5)
- Combine personal info + role into one step with a role radio
- Verify email + Tags becomes 2nd step (with tags as accordion below OTP)
- Stepper becomes 2 items instead of 4

### Phase 6: Resend config note (B1)
- Add a banner at the top of `/register` (and `/forgot-password`):
  "Localhost/staging: check your Resend dashboard for the code.
   Production: requires a verified Resend domain — see docs."
- Document the B1 fix in AGENTS.md for the next session

## Files to touch
- `app/login/page.tsx` — Phase 3
- `app/register/page.tsx` — Phase 1, 5
- `app/forgot-password/page.tsx` — Phase 4
- `app/reset-password/page.tsx` — Phase 2
- `app/globals.css` — maybe a `input` autofill style if Phase 1 needs visual cue
- `AGENTS.md` — Phase 6 documentation

## Out of scope (deferred to next session)
- B1 root fix (Resend domain verification) — needs user to verify domain
- Switching to magic-link auth (no passwords) — design decision
- Mobile passkey / WebAuthn — out of scope
