import { NextResponse } from 'next/server'

/**
 * Server proxy for OpenWeatherMap. Keeps the API key off the client.
 *
 * GET /api/weather?lat=16.0544&lng=108.2023&date=2026-10-07
 *
 * - `date` is optional. If provided and within 16 days from today,
 *   uses forecast endpoint. Otherwise uses current.
 * - Returns a small normalized shape: { tempC, windKph, summary, source }.
 *   Never the full OWM payload (smaller, more stable contract).
 */
export async function GET(req: Request) {
  const key = process.env.OWM_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'Weather key not configured.' },
      { status: 503 },
    )
  }

  const url = new URL(req.url)
  const lat = parseFloat(url.searchParams.get('lat') ?? '16.0544')
  const lng = parseFloat(url.searchParams.get('lng') ?? '108.2023')
  const dateStr = url.searchParams.get('date')

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Invalid lat/lng' }, { status: 400 })
  }

  const targetDate = dateStr ? new Date(dateStr) : null
  const isFuture =
    targetDate !== null &&
    !Number.isNaN(targetDate.getTime()) &&
    targetDate.getTime() > Date.now() &&
    targetDate.getTime() - Date.now() < 16 * 24 * 60 * 60 * 1000

  try {
    if (isFuture && targetDate) {
      const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${key}`
      const res = await fetch(apiUrl, { next: { revalidate: 60 * 60 } })
      if (!res.ok) {
        return NextResponse.json(
          { error: `OpenWeatherMap returned ${res.status}` },
          { status: 502 },
        )
      }
      const data: any = await res.json()
      const target = targetDate.toISOString().slice(0, 10)
      const slot = (data.list as any[]).find((s) => s.dt_txt?.startsWith(target) && s.dt_txt?.includes('12:00:00'))
      const pick = slot ?? data.list?.[0]
      if (!pick) {
        return NextResponse.json({ error: 'No forecast slot' }, { status: 502 })
      }
      return NextResponse.json({
        tempC: pick.main?.temp,
        windKph: (pick.wind?.speed ?? 0) * 3.6,
        summary: pick.weather?.[0]?.description ?? 'Unknown',
        source: 'openweathermap-forecast',
        date: target,
      })
    }

    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${key}`
    const res = await fetch(apiUrl, { next: { revalidate: 60 * 15 } })
    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenWeatherMap returned ${res.status}` },
        { status: 502 },
      )
    }
    const data: any = await res.json()
    return NextResponse.json({
      tempC: data.main?.temp,
      windKph: (data.wind?.speed ?? 0) * 3.6,
      summary: data.weather?.[0]?.description ?? 'Unknown',
      source: 'openweathermap-current',
      date: new Date().toISOString().slice(0, 10),
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Weather fetch failed' },
      { status: 500 },
    )
  }
}
