import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const email = formData.get('email')

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // TODO: store in DB or push to mailing list provider (Mailchimp/Resend Audiences)
    console.log(`[newsletter] new subscription: ${email}`)

    // Redirect back to home with success flag
    const referer = req.headers.get('referer') || '/'
    return NextResponse.redirect(new URL(`/?subscribed=1`, req.url), { status: 303 })
  } catch (err) {
    console.error('[newsletter] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
