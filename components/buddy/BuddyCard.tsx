import Link from 'next/link'
import { MapPin, Star } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

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
    <Link
      href={`/tourist/buddy/${props.id}`}
      className="block bg-surface border border-border rounded-sm hover:border-border-strong transition-colors duration-150"
    >
      <div className="p-6 text-center">
        <div className="relative inline-block mb-3">
          <Avatar
            name={props.name}
            src={props.avatar_url ?? null}
            size="xl"
            online={props.is_available}
          />
        </div>
        <h3 className="text-lg font-semibold">{props.name}</h3>
        <p className="text-sm text-muted mt-1">
          <MapPin size={12} className="inline mr-1" aria-hidden="true" />
          {props.location_city}
        </p>

        <p className="text-sm mt-2">
          <Star size={12} className="inline text-warning mr-1" aria-hidden="true" />
          <strong>{props.rating_avg.toFixed(1)}</strong>
        </p>

        <div className="flex flex-wrap gap-1 justify-center mt-3 min-h-[28px]">
          {props.specialties.slice(0, 3).map((s) => (
            <span key={s} className="badge badge-neutral text-xs">
              {s}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 justify-center mt-2">
          {props.languages.slice(0, 2).map((l) => (
            <span key={l} className="lang-chip">{l}</span>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-sm font-semibold text-ink">
            ${props.hourly_rate}/hour
          </p>
        </div>
      </div>
    </Link>
  )
}
