// Probe whether /api/auth/signup/start returns __devCode (i.e. OTP_PREVIEW=true)
const BASE = 'https://localit-nhattoann.vercel.app';
const email = `darkluna.otpcheck.${Date.now()}@gmail.com`;
const res = await fetch(`${BASE}/api/auth/signup/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    fullName: 'OTP Probe',
    phone: '+84 901 234 567',
  }),
});
const body = await res.json().catch(() => ({}));
console.log('status:', res.status);
console.log('body:', JSON.stringify(body, null, 2));