#!/usr/bin/env node
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  geolocation: { latitude: 16.0544, longitude: 108.2023 },
  permissions: ['geolocation'],
})
const page = await ctx.newPage()
page.on('console', msg => {
  const t = msg.text()
  if (t.includes('[debug') || t.includes('SUBSCRIBE') || t.includes('SUBSCRIBED') || t.includes('CLOSED') || t.includes('ERROR') || t.includes('broadcast') || t.includes('CHANNEL')) console.log(`[${msg.type()}]`, t.slice(0, 250))
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input#email', 'lan.pham@localit.dev')
await page.fill('input#password', 'password123')
await page.click('button:has-text("Sign in")')
await page.waitForURL('**/dashboard', { timeout: 15000 })

// Subscribe to realtime via direct API and check status
await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button:has-text("Share my location")')

// Intercept supabase channel state
await page.evaluate(() => {
  const w = window;
  // Wait for next tick to find supabase
  setTimeout(() => {
    // @ts-ignore
    const supabase = w.__supabase
    if (!supabase) { console.log('[debug] no supabase on window'); return }
    console.log('[debug] realtime keys:', Object.keys(supabase.realtime || {}))
    // Try to find channels
    const channels = supabase.realtime?.getChannels?.() || supabase.realtime?.channels || []
    console.log('[debug] channels:', channels.length)
    channels.forEach((ch, i) => {
      console.log(`[${i}] topic=${ch.topic}`, `state=${ch.state}`)
    })
  }, 500)
})
await page.waitForTimeout(2000)

await page.click('button:has-text("Share my location")')
await page.waitForTimeout(15000)

const channelInfo = await page.evaluate(() => {
  // @ts-ignore
  const supabase = window.__supabase
  if (!supabase) return { error: 'no supabase' }
  const channels = supabase.realtime?.getChannels?.() || []
  return {
    count: channels.length,
    channels: channels.map((ch) => ({
      topic: ch.topic,
      state: ch.state,
      joinedOnce: ch.joinedOnce,
      params: ch.params,
    })),
  }
})
console.log('[debug] channels after wait:', JSON.stringify(channelInfo, null, 2))
await browser.close()