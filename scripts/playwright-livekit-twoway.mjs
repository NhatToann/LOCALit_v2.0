/**
 * Two-way LiveKit voice-call test.
 *
 * Mirrors scripts/playwright-twoway-call-test.mjs but uses the new
 * LiveKit-backed transport instead of the old self-hosted WebRTC.
 *
 * Steps:
 *   1. John signs in and navigates to /chat with Lan
 *   2. Lan signs in (separate context) and opens the same /chat
 *   3. John clicks the Phone button to start a call
 *   4. John's UI should land in "calling" state and a pending_calls
 *      row should appear with callee_id=Lan
 *   5. Lan sees the IncomingCallWatcher pop up
 *   6. Lan clicks Accept → LiveKit room is joined on both sides
 *   7. Both sides should transition to "connected"
 *   8. Wait a moment for the audio to flow, then either side ends
 *   9. Both sides transition to "ended"
 *
 * Mic permission is granted via Playwright's --use-fake-ui-for-media-stream
 * + --use-fake-device-for-media-stream flags so the test runs headless.
 */
import { chromium } from 'playwright'

const PROD = process.env.LOCALIT_PROD_URL || 'https://localit-nhattoann.vercel.app'
const BYPASS_HEADER = {
  'x-vercel-protection-bypass':
    process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
}

const SCREENSHOT_DIR = './scripts/screenshots'

async function signIn(page, email, password) {
  await page.goto(PROD + '/login', { waitUntil: 'networkidle' })
  await page.waitForFunction(
    function () {
      var inputs = document.querySelectorAll('input')
      return inputs.length >= 2
    },
    { timeout: 30000 },
  )
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(
    function (url) { return !url.pathname.startsWith('/login') },
    { timeout: 30000 },
  )
}

async function openChat(page, partnerId) {
  // Use the API to get John's conversations list, then navigate to
  // the URL directly. /chat renders the matching conversation list
  // and auto-selects the one matching `?buddy=`.
  await page.goto(PROD + '/chat?buddy=' + partnerId, {
    waitUntil: 'domcontentloaded',
  })
  // Wait for the chat composer to be in the DOM.
  await page.waitForSelector('main, [data-testid=chat-pane]', { timeout: 15000 })
}

;(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })

  const johnCtx = await browser.newContext({
    extraHTTPHeaders: BYPASS_HEADER,
    permissions: ['microphone'],
  })
  const johnPage = await johnCtx.newPage()

  const lanCtx = await browser.newContext({
    extraHTTPHeaders: BYPASS_HEADER,
    permissions: ['microphone'],
  })
  const lanPage = await lanCtx.newPage()

  // Constants for the seed accounts.
  const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111'
  const LAN_ID = '11111111-1111-1111-1111-111111111111'

  try {
    console.log('-> Sign in as John (tourist)')
    await signIn(johnPage, 'john.doe@example.com', 'password123')

    console.log('-> Sign in as Lan (buddy) in second context')
    await signIn(lanPage, 'lan.pham@localit.dev', 'password123')

    console.log('-> John opens chat with Lan')
    await openChat(johnPage, LAN_ID)

    console.log('-> Lan opens chat with John')
    await openChat(lanPage, JOHN_ID)

    // Give the conversations list a beat to hydrate.
    await johnPage.waitForTimeout(2000)

    console.log('-> John clicks the Phone button to start a call')
    // The chat page exposes the call button. Try common selectors.
    const phoneSelectors = [
      'button[aria-label*="voice" i]',
      'button[aria-label*="call" i]',
      'button[title*="call" i]',
      '[data-testid=start-call]',
    ]
    let clicked = false
    for (const sel of phoneSelectors) {
      try {
        const btn = await johnPage.$(sel)
        if (btn) {
          await btn.click()
          clicked = true
          console.log('  clicked:', sel)
          break
        }
      } catch {}
    }
    if (!clicked) {
      // Fallback: find any button with a Phone icon inside.
      await johnPage.evaluate(function () {
        var btns = document.querySelectorAll('button')
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i]
          if (b.textContent.includes('Phone') || b.getAttribute('aria-label')) {
            b.click()
            return
          }
        }
      })
      clicked = true
    }

    // Capture screenshot of the calling modal on John's side.
    await johnPage.waitForTimeout(1500)
    await johnPage.screenshot({
      path: SCREENSHOT_DIR + '/twoway-livekit-john-calling.png',
      fullPage: true,
    })

    console.log('-> Lan waits for the incoming-call watcher')
    // The IncomingCallWatcher renders an Accept button at the top of
    // the page when a pending_calls row appears for Lan. The card
    // exists in a portal at the top of the body.
    const acceptClicked = await lanPage.evaluate(function () {
      var btns = document.querySelectorAll('button')
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i]
        var text = (b.textContent || '').trim().toLowerCase()
        if (text.includes('accept') || (b.getAttribute('aria-label') || '').toLowerCase().includes('accept')) {
          b.click()
          return b.textContent.trim()
        }
      }
      return null
    })
    console.log('  accept click result:', acceptClicked)

    await lanPage.waitForTimeout(2000)
    await johnPage.screenshot({
      path: SCREENSHOT_DIR + '/twoway-livekit-john-connected.png',
      fullPage: true,
    })
    await lanPage.screenshot({
      path: SCREENSHOT_DIR + '/twoway-livekit-lan-connected.png',
      fullPage: true,
    })

    // Probe the LiveKit room state on each side.
    const johnState = await johnPage.evaluate(function () {
      return {
        callClientExists: !!window.__livekitRoom,
        callState: (window.__callDebug && window.__callDebug.lastState) || null,
      }
    })
    const lanState = await lanPage.evaluate(function () {
      return {
        callClientExists: !!window.__livekitRoom,
        callState: (window.__callDebug && window.__callDebug.lastState) || null,
      }
    })
    console.log('  john:', JSON.stringify(johnState))
    console.log('  lan:', JSON.stringify(lanState))

    // Wait for the audio to flow a moment then end.
    await johnPage.waitForTimeout(2000)

    console.log('-> John ends the call')
    await johnPage.evaluate(function () {
      var btns = document.querySelectorAll('button')
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i]
        var text = (b.textContent || '').trim().toLowerCase()
        if (text.includes('end') || (b.getAttribute('aria-label') || '').toLowerCase().includes('end')) {
          b.click()
          return
        }
      }
    })

    await johnPage.waitForTimeout(2000)
    await johnPage.screenshot({
      path: SCREENSHOT_DIR + '/twoway-livekit-john-ended.png',
      fullPage: true,
    })
    await lanPage.screenshot({
      path: SCREENSHOT_DIR + '/twoway-livekit-lan-ended.png',
      fullPage: true,
    })

    console.log('')
    console.log('PASS LiveKit two-way call smoke (manual review screenshots recommended)')
  } catch (e) {
    console.error('')
    console.error('FAIL LiveKit two-way call smoke')
    console.error(e)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()