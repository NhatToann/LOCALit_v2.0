import { chromium } from 'playwright';
const BYPASS = process.env.VERCEL_BYPASS ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
});
const page = await ctx.newPage();
const nav = await page.goto('https://localit-nhattoann.vercel.app/register', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('status:', nav?.status());
console.log('url:', page.url());
await page.waitForSelector('#fullName', { timeout: 30000 });
console.log('fullName visible');
const bodyText = await page.locator('body').innerText();
console.log('h1:', await page.locator('h1').textContent());
await browser.close();