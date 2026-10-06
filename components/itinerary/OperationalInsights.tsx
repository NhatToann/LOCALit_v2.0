'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Clock, MapPin, TrendingUp, Wallet, Loader2 } from 'lucide-react'
import type { TripStop, TripDay } from '@/lib/types'
import { computeInsights } from '@/lib/insights'

interface Props {
  days: TripDay[]
  stops: TripStop[]
  budgetEstimate: number | null
  tripStartDate: string | null
  weatherTempC: number | null
  weatherWindKph: number | null
  weatherSummary: string | null
  weatherLoading: boolean
  weatherError: string | null
}

const countStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontVariantNumeric: 'tabular-nums' as const,
}

interface ChipProps {
  label: string
  value: string
  Icon: typeof MapPin
  warn?: boolean
  detail?: string
  onClick?: () => void
}

function Chip({ label, value, Icon, warn, detail, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border rounded-sm px-3 h-9 bg-paper text-left ${
        warn ? 'border-warning text-warning' : 'border-border text-ink hover:bg-surface'
      }`}
      aria-label={`${label}: ${value}`}
    >
      <Icon size={13} aria-hidden="true" />
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm font-semibold" style={countStyle}>
        {value}
      </span>
      {detail ? <span className="text-[10px] text-muted ml-1 hidden sm:inline">· {detail}</span> : null}
    </button>
  )
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function OperationalInsights({
  days,
  stops,
  budgetEstimate,
  weatherTempC,
  weatherWindKph,
  weatherSummary,
  weatherLoading,
  weatherError,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const insights = useMemo(() => computeInsights(days, stops), [days, stops])

  const warnings = []
  if (insights.overloadedDayCount > 0) {
    warnings.push(`${insights.overloadedDayCount} day with more than 5 stops`)
  }
  if (weatherWindKph !== null && weatherWindKph > 30) {
    warnings.push(`Strong wind (${Math.round(weatherWindKph)} km/h)`)
  }

  return (
    <section
      className="border border-border rounded-sm bg-surface p-4"
      aria-label="Operational insights"
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">Operational insights</h2>
        <span className="text-[10px] text-subtle">Computed locally · no AI</span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Chip
          label="Total"
          value={`${insights.totalKm.toFixed(1)} km`}
          Icon={MapPin}
          detail={`${insights.perDay.length} days`}
          onClick={() => setExpanded((e) => (e === 'distance' ? null : 'distance'))}
        />
        <Chip
          label="Drive"
          value={formatDuration(insights.totalDriveMinutes)}
          Icon={Clock}
          warn={insights.totalDriveMinutes > 240}
          detail={insights.totalDriveMinutes > 240 ? 'long day' : 'estimate'}
          onClick={() => setExpanded((e) => (e === 'time' ? null : 'time'))}
        />
        <Chip
          label="Stops"
          value={`${stops.length}`}
          Icon={TrendingUp}
          warn={insights.overloadedDayCount > 0}
          detail={insights.overloadedDayCount > 0 ? `${insights.overloadedDayCount} overloaded` : 'across days'}
          onClick={() => setExpanded((e) => (e === 'overload' ? null : 'overload'))}
        />
        {budgetEstimate !== null ? (
          <Chip
            label="Budget"
            value={`$${budgetEstimate}`}
            Icon={Wallet}
            detail="estimate"
            onClick={() => setExpanded((e) => (e === 'budget' ? null : 'budget'))}
          />
        ) : null}
        {weatherLoading ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <Loader2 size={11} className="animate-spin" aria-hidden="true" />
            Loading weather…
          </span>
        ) : weatherError ? (
          <Chip
            label="Weather"
            value="offline"
            Icon={AlertTriangle}
            warn
            detail="unavailable"
          />
        ) : weatherTempC !== null ? (
          <Chip
            label="Weather"
            value={`${Math.round(weatherTempC)}°C`}
            Icon={AlertTriangle}
            warn={(weatherWindKph ?? 0) > 30}
            detail={weatherSummary ?? undefined}
          />
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-center gap-1 text-[11px] text-warning">
              <AlertTriangle size={11} aria-hidden="true" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {expanded === 'distance' || expanded === 'time' || expanded === 'overload' || expanded === 'budget' ? (
        <div className="mt-3 border-t border-border pt-3">
          <table className="w-full text-[11px] text-ink">
            <thead>
              <tr className="text-muted text-left">
                <th className="font-normal">Day</th>
                <th className="font-normal">Stops</th>
                <th className="font-normal">Distance</th>
                <th className="font-normal">Drive</th>
              </tr>
            </thead>
            <tbody>
              {insights.perDay.map((d, i) => (
                <tr key={d.dayId} className={d.overloaded ? 'text-warning' : ''}>
                  <td className="py-1 pr-2" style={countStyle}>
                    {i + 1}
                  </td>
                  <td className="py-1 pr-2" style={countStyle}>
                    {d.stopCount}
                  </td>
                  <td className="py-1 pr-2" style={countStyle}>
                    {d.distanceKm.toFixed(1)} km
                  </td>
                  <td className="py-1" style={countStyle}>
                    {formatDuration(d.driveMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
