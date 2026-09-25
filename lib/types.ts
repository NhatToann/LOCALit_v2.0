// Database types for LOCALit v2
// These types mirror the schema in supabase/schema.sql

export type UserRole = 'tourist' | 'buddy' | 'admin'
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'
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
  bio: string | null
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
  message: string | null
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
  created_at: string
  updated_at: string
  // Joined
  tourist?: Tourist
  buddy?: Buddy
  trip_stops?: TripStop[]
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
  created_at: string
}

export interface Conversation {
  id: string
  tourist_id: string
  buddy_id: string
  created_at: string
  updated_at: string
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
