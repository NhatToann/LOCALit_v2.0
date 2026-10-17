// Quick UI test: navigate to /register, switch to buddy, fill all required
// fields EXCEPT bio (so the new hint should appear), then verify the
// hint is visible.
import { chromium } from 'playwright';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const BASE = 'https://localit-nhattoann.vercel.app';
const BYPASS = process.env.VERCEL_BYPASS ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
});
const page = await ctx.newPage();

const email = `hint.${Date.now()}@gmail.com`;

await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#fullName', { timeout: 30000 });
console.log('Step 1 form loaded');

// Fill account form
await page.fill('#fullName', 'Hint Probe');
await page.fill('#phone', '+84 901 234 567');
await page.fill('#email', email);
await page.fill('#password', 'TestPass#Reg2026');
await page.fill('#confirmPassword', 'TestPass#Reg2026');
await page.getByRole('button', { name: /^Local buddy/i }).click();
await page.check('input[type="checkbox"]');

const startPromise = page.waitForResponse((r) => r.url().includes('/api/auth/signup/start'));
await page.getByRole('button', { name: /Send verification code/i }).click();
const startResp = await startPromise;
const startBody = await startResp.json();
console.log('start:', startResp.status(), 'signupId:', startBody.signupId);

// Force-verify the row in the DB
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const codeHash = await bcrypt.hash('111111', 10);
await c.query(`UPDATE public.email_verifications SET code_hash = $2 WHERE id = $1`, [startBody.signupId, codeHash]);

// Drive Step 2 OTP entry
await page.waitForSelector('text=Check your email', { timeout: 15000 });
const inputs = await page.locator('input[aria-label^="Digit"]').all();
for (let i = 0; i < 6; i++) {
  await inputs[i].fill('1');
}
const verifyPromise = page.waitForResponse((r) => r.url().includes('/api/auth/signup/verify-otp'));
await page.getByRole('button', { name: /Verify and continue/i }).click();
const verifyResp = await verifyPromise;
console.log('verify:', verifyResp.status());

// Step 3
await page.waitForSelector('text=Set up your buddy profile', { timeout: 15000 });
console.log('Step 3 reached (buddy)');

// Fill only what's required to isolate the bio check:
await page.fill('#locationCity', 'Da Nang');
// pick one language and one specialty
await page.getByRole('button', { name: /^English$/ }).click();
await page.getByRole('button', { name: /^Food$/ }).click();

// Now with bio empty, the hint should appear
const hintEmpty = await page.locator('#step3-missing-hint').textContent();
console.log('hint with empty bio:', JSON.stringify(hintEmpty));

// Type a 2-char bio like the user's screenshot showed "ty"
await page.fill('#bio', 'ty');
const hint2 = await page.locator('#step3-missing-hint').textContent();
console.log('hint with 2-char bio:', JSON.stringify(hint2));

// Add more to get to 10
await page.fill('#bio', 'I love Da Nang and showing it to visitors.');
const hint10 = await page.locator('#step3-missing-hint').count();
console.log('hint element count with valid bio:', hint10);
const createBtn = page.getByRole('button', { name: /^Create account$/i });
const disabled = await createBtn.isDisabled();
console.log('Create account button disabled with valid bio:', disabled);

await page.screenshot({ path: 'scripts/screenshots/register-step3-hint.png', fullPage: true });
await browser.close();
await c.end();