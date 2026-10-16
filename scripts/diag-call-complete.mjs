// Call /api/auth/signup/complete with an expired-but-verified signup row
// to confirm what error the user sees.
const BASE = 'https://localit-nhattoann.vercel.app';
const signupId = 'f2b1254d-8ef2-4227-92bf-98b5f13fae9a'; // from diag above

const res = await fetch(`${BASE}/api/auth/signup/complete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    signupId,
    password: 'TestPass#Reg2026',
    role: 'tourist',
    profilePayload: {
      nationality: 'Vietnam',
      travel_style: 'solo',
      interests: ['food'],
      languages: ['Vietnamese'],
      budget_range: '50-100',
      destination: 'Da Nang',
    },
  }),
});
const body = await res.json().catch(() => ({}));
console.log('status:', res.status);
console.log('body:', JSON.stringify(body, null, 2));