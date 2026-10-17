// Snapshot the Step 3 view with bio=2 chars to show the new hint UI
import { chromium } from 'playwright';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const BASE = 'https://localit-nhattoann.vercel.app';
const BYPASS = process.env.VERCEL_BYPASS ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  viewport: { width: 1024, height: 900 },
});
const page = await ctx.newPage();
const email = `hint.shot.${Date.now()}@gmail.com`;

await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#fullName', { timeout: 30000 });
await page.fill('#fullName', 'Buddy Hint Demo');
await page.fill('#phone', '+84 901 234 567');
await page.fill('#email', email);
await page.fill('#password', 'TestPass#Reg2026');
await page.fill('#confirmPassword', 'TestPass#Reg2026');
await page.getByRole('button', { name: /^Local buddy/i }).click();
await page.check('input[type="checkbox"]');

const startPromise = page.waitForResponse((r) => r.url().includes('/api/auth/signup/start'));
await page.getByRole('button', { name: /Send verification code/i }).click();
const startBody = await (await startPromise).json();

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const codeHash = await bcrypt.hash('111111', 10);
await c.query(`UPDATE public.email_verifications SET code_hash = $2 WHERE id = $1`, [startBody.signupId, codeHash]);

await page.waitForSelector('text=Check your email');
const inputs = await page.locator('input[aria-label^="Digit"]').all();
for (let i = 0; i < 6; i++) await inputs[i].fill('1');
const verifyPromise = page.waitForResponse((r) => r.url().includes('/api/auth/signup/verify-otp'));
await page.getByRole('button', { name: /Verify and continue/i }).click();
await verifyPromise;

await page.waitForSelector('text=Set up your buddy profile');
await page.fill('#locationCity', 'Da Nang');
await page.getByRole('button', { name: /^English$/ }).click();
await page.getByRole('button', { name: /^Food$/ }).click();
// Reproduce the user's screenshot: bio = "ty"
await page.fill('#bio', 'ty');
await page.screenshot({ path: 'scripts/screenshots/step3-hint-with-2chars.png', fullPage: true });
console.log('captured step3-hint-with-2chars.png');

await browser.close();
await c.end();