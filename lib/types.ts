// Database types for LOCALit v2
// Schema lives in supabase/migrations/

export type UserRole = 'tourist' | 'buddy' | 'admin'
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'
export type ConnectionLifecycle = 'search' | 'active' | 'ended'
export type ItineraryStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled'
export type ItineraryVisibility = 'private' | 'shared'

export type NotificationType =
  | 'message'
  | 'connection_request'
  | 'connection_accepted'
  | 'connection_declined'
  | 'trip_update'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  actor_id: string | null
  actor_name: string | null
  read_at: string | null
  created_at: string
}
export type CollaboratorRole = 'owner' | 'editor' | 'viewer'
export type CollaboratorStatus = 'invited' | 'accepted' | 'declined' | 'revoked'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string | null
  avatar_url: string | null
  bio: string | null
  role: UserRole
  is_online: boolean
  last_seen: string | null
  created_at: string
  updated_at: string
}

export interface Tourist {
  id: string
  nationality: string | null
  date_of_birth: string | null
  travel_style: string | null
  interests: string[]
  languages: string[]
  budget_range: string | null
  arrival_date: string | null
  destination: string | null
  is_visible: boolean
  created_at: string
  updated_at: string
  // Joined
  profile?: Profile
}

export interface Buddy {
  id: string
  location_city: string
  latitude: number | null
  longitude: number | null
  languages: string[]
  specialties: string[]
  hourly_rate: number
  is_available: boolean
  rating_avg: number
  trips_completed: number
  transport: import('./transport').Transport | null
  transport_note: string | null
  bio: string | null
  favorite_places: string[]
  created_at: string
  updated_at: string
  // Joined
  profile?: Profile
}

export interface Connection {
  id: string
  tourist_id: string
  buddy_id: string
  requester_id?: string | null
  recipient_id?: string | null
  requester_role?: 'tourist' | 'buddy' | null
  recipient_role?: 'tourist' | 'buddy' | null
  status: ConnectionStatus
  lifecycle: ConnectionLifecycle
  message: string | null
  accepted_at: string | null
  ended_at: string | null
  end_reason: string | null
  renewed_by_tourist_at: string | null
  renewed_by_buddy_at: string | null
  created_at: string
  updated_at: string
  tourist?: Tourist
  buddy?: Buddy
}

export interface WeatherSnapshot {
  tempC?: number
  windKph?: number
  summary?: string
  date?: string
}

export interface Itinerary {
  id: string
  owner_id: string
  title: string
  destination: string
  start_date: string | null
  end_date: string | null
  status: ItineraryStatus
  visibility: ItineraryVisibility
  notes: string | null
  budget_estimate_cents: number | null
  meetup_point: string | null
  transport: string | null
  weather_snapshot: WeatherSnapshot | null
  weather_updated_at: string | null
  last_editor_id: string | null
  created_at: string
  updated_at: string
  owner?: Profile
  last_editor?: Profile
  collaborators?: ItineraryCollaborator[]
  days?: ItineraryDay[]
  stops?: ItineraryStop[]
  share?: ItineraryShare
}

export interface ItineraryDay {
  id: string
  itinerary_id: string
  day_order: number
  date: string | null
  title: string | null
  notes: string | null
  /** Per-list custom time window. Optional. */
  start_time: string | null
  end_time: string | null
  created_at: string
  updated_at: string
  stops?: ItineraryStop[]
}

export interface ItineraryStop {
  id: string
  itinerary_id: string
  day_id: string | null
  stop_order: number
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  category: string | null
  planned_time: string | null
  duration_minutes: number | null
  transport: string | null
  transport_note: string | null
  opening_hours: string | null
  est_cost_cents: number | null
  notes: string | null
  photo_url: string | null
  added_by: string | null
  /** Per-card custom start time (HH:MM). When set, overrides planned_time for ordering. */
  start_time: string | null
  /** Per-card custom end time (HH:MM). */
  end_time: string | null
  created_at: string
  updated_at: string
  added_by_profile?: Profile
}

export interface ItineraryCollaborator {
  id: string
  itinerary_id: string
  user_id: string
  role: CollaboratorRole
  status: CollaboratorStatus
  invited_by: string | null
  invited_at: string
  responded_at: string | null
  user?: Profile
  inviter?: Profile
}

export interface ItineraryShare {
  itinerary_id: string
  token: string
  enabled: boolean
  created_at: string
}

export interface Conversation {
  id: string
  tourist_id: string
  buddy_id: string
  created_at: string
  updated_at: string
  last_read_at_by_tourist: string | null
  last_read_at_by_buddy: string | null
  last_message_preview: string | null
  last_message_at: string | null
  typing_started_at: string | null
  typing_user_id: string | null
  pinned_message_id: string | null
  tourist?: Tourist
  buddy?: Buddy
  messages?: Message[]
  last_message?: Message
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  is_read: boolean
  message_type: 'text' | 'image' | 'file' | 'location' | 'system' | 'call_event'
  reply_to_id: string | null
  edited_at: string | null
  deleted_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  reactions?: MessageReaction[]
  reply_to?: Message
}

export interface MessageReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface LocationUpdate {
  id: string
  user_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  updated_at: string
  profile?: Profile
}

export interface Review {
  id: string
  itinerary_id: string | null
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer?: Profile
  reviewee?: Profile
}

export interface BuddyWithProfile extends Buddy {
  profile: Profile
}

export interface TouristWithProfile extends Tourist {
  profile: Profile
}

export interface ConversationWithDetails extends Conversation {
  tourist: TouristWithProfile
  buddy: BuddyWithProfile
  messages: Message[]
}

export interface RegisterFormData {
  email: string
  password: string
  confirmPassword: string
  fullName: string
  phone: string
  role: 'tourist' | 'buddy'
  nationality?: string
  dateOfBirth?: string
  travelStyle?: string
  interests?: string[]
  languages?: string[]
  budgetRange?: string
  arrivalDate?: string
  destination?: string
  locationCity?: string
  buddyLanguages?: string[]
  specialties?: string[]
  hourlyRate?: number
  bio?: string
}

export interface ItineraryFormData {
  title: string
  destination: string
  startDate: string
  endDate: string
  notes: string
  stops: Array<{
    name: string
    address: string
    notes: string
  }>
  collaboratorEmails: string[]
}

export interface BuddySearchFilters {
  city?: string
  language?: string
  specialty?: string
  minRating?: number
  maxPrice?: number
  availability?: boolean
}

export interface NearbyUser {
  id: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  latitude: number
  longitude: number
  distance_km: number
  is_online: boolean
}
