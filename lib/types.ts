// Database types for LOCALit v2
// These types mirror the schema in supabase/schema.sql

export type UserRole = 'tourist' | 'buddy' | 'admin'
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'
export type ConnectionLifecycle = 'search' | 'active' | 'ended'
export type TripStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled'

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
  // Joined
  tourist?: Tourist
  buddy?: Buddy
}

export interface Trip {
  id: string
  tourist_id: string
  buddy_id: string | null
  title: string
  destination: string
  start_date: string | null
  end_date: string | null
  status: TripStatus
  notes: string | null
  itinerary_notes: string | null
  itinerary_updated_by: string | null
  itinerary_updated_at: string | null
  currency: string
  budget_total_cents: number | null
  cover_photo_url: string | null
  share_token: string | null
  created_at: string
  updated_at: string
  // Joined
  tourist?: Tourist
  buddy?: Buddy
  trip_stops?: TripStop[]
  itinerary_editor?: Profile
  days?: TripDay[]
  bookings?: TripBooking[]
  budget?: TripBudgetItem[]
  packing?: TripPackingItem[]
}

export interface TripStop {
  id: string
  trip_id: string
  stop_order: number
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  notes: string | null
  day_id: string | null
  planned_time: string | null   // 'HH:MM:SS'
  category: 'food' | 'sight' | 'transport' | 'stay' | 'activity' | 'other' | null
  photo_url: string | null
  est_cost_cents: number | null
  transport: import('./transport').Transport | null
  transport_note: string | null
  created_at: string
}

export interface TripDay {
  id: string
  trip_id: string
  day_order: number
  date: string | null
  title: string | null
  notes: string | null
  created_at: string
  // Joined
  stops?: TripStop[]
}

export interface TripBooking {
  id: string
  trip_id: string
  type: 'flight' | 'hotel' | 'restaurant' | 'tour' | 'transport' | 'other'
  provider: string | null
  confirmation_code: string | null
  start_at: string | null
  end_at: string | null
  location_name: string | null
  address: string | null
  cost_cents: number
  currency: string
  notes: string | null
  attachment_url: string | null
  added_by: string | null
  created_at: string
}

export interface TripBudgetItem {
  id: string
  trip_id: string
  category: 'food' | 'transport' | 'tickets' | 'shopping' | 'stay' | 'other'
  description: string | null
  amount_cents: number
  currency: string
  paid_by: string | null
  split_with: string[]
  spent_at: string | null
  created_at: string
}

export interface TripPackingItem {
  id: string
  trip_id: string
  item: string
  category: 'clothes' | 'toiletries' | 'tech' | 'docs' | 'misc'
  is_packed: boolean
  packed_by: string | null
  packed_at: string | null
  created_at: string
}

export interface TripActivity {
  id: string
  trip_id: string
  actor_id: string | null
  verb: string
  payload: Record<string, unknown>
  created_at: string
  // Joined
  actor?: Profile
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
  // Joined
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
  message_type: 'text' | 'image' | 'file' | 'location' | 'system'
  reply_to_id: string | null
  edited_at: string | null
  deleted_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  // Joined
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

export interface CallLog {
  id: string
  conversation_id: string
  caller_id: string
  callee_id: string
  call_type: 'voice' | 'video'
  status: 'initiated' | 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended' | 'failed'
  started_at: string
  answered_at: string | null
  ended_at: string | null
  duration_seconds: number | null
}

export interface CallSignal {
  id: string
  call_log_id: string
  sender_id: string
  recipient_id: string
  signal_type: 'offer' | 'answer' | 'ice' | 'bye' | 'busy'
  payload: Record<string, unknown>
  created_at: string
}

export interface LocationUpdate {
  id: string
  user_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  updated_at: string
  // Joined
  profile?: Profile
}

export interface Review {
  id: string
  trip_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  created_at: string
  // Joined
  reviewer?: Profile
  reviewee?: Profile
}

// API Response types
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

// Form types
export interface RegisterFormData {
  email: string
  password: string
  confirmPassword: string
  fullName: string
  phone: string
  role: 'tourist' | 'buddy'
  // Tourist-specific
  nationality?: string
  dateOfBirth?: string
  travelStyle?: string
  interests?: string[]
  languages?: string[]
  budgetRange?: string
  arrivalDate?: string
  destination?: string
  // Buddy-specific
  locationCity?: string
  buddyLanguages?: string[]
  specialties?: string[]
  hourlyRate?: number
  bio?: string
}

export interface TripFormData {
  title: string
  destination: string
  startDate: string
  endDate: string
  notes: string
  stops: Omit<TripStop, 'id' | 'trip_id' | 'created_at'>[]
}

// Search/Filter types
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
