import Link from 'next/link'

interface BuddyCardProps {
  id: string
  name: string
  location_city: string
  rating_avg: number
  hourly_rate: number
  languages: string[]
  specialties: string[]
  avatar_url?: string | null
  is_available?: boolean
  bio?: string | null
}

export default function BuddyCard(props: BuddyCardProps) {
  return (
    <Link href={`/tourist/buddy/${props.id}`} className="card" style={{ textDecoration: 'none' }}>
      <div style={{ height: 120, background: 'linear-gradient(135deg, var(--primary), var(--primary-light))', position: 'relative' }}>
        <div
          className="avatar avatar-lg"
          style={{
            position: 'absolute',
            bottom: -28,
            left: '50%',
            transform: 'translateX(-50%)',
            border: '3px solid white',
          }}
        >
          {props.avatar_url ? <img src={props.avatar_url} alt={props.name} /> : props.name.charAt(0)}
        </div>
        {props.is_available && (
          <span
            className="badge badge-success"
            style={{ position: 'absolute', top: 12, right: 12 }}
          >
            ● Online
          </span>
        )}
      </div>
      <div className="card-body" style={{ paddingTop: 36, textAlign: 'center' }}>
        <h3 className="font-semibold">{props.name}</h3>
        <p className="text-sm text-muted" style={{ marginTop: 4 }}>
          📍 {props.location_city}
        </p>

        <div className="rating flex-center mt-sm">
          {'★'.repeat(Math.round(props.rating_avg))}
          <span className="rating-text">({props.rating_avg.toFixed(1)})</span>
        </div>

        <div className="flex flex-wrap gap-xs justify-center mt-md" style={{ minHeight: 28 }}>
          {props.specialties.slice(0, 3).map(s => (
            <span key={s} className="tag">{s}</span>
          ))}
        </div>

        <div className="flex flex-wrap gap-xs justify-center mt-sm">
          {props.languages.slice(0, 2).map(l => (
            <span key={l} className="lang-chip">{l}</span>
          ))}
        </div>

        <div className="mt-md pt-md" style={{ borderTop: '1px solid var(--border-color)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
            ${props.hourly_rate}/giờ
          </p>
        </div>
      </div>
    </Link>
  )
}
