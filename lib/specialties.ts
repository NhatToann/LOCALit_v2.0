/**
 * Shared library for the buddy + tourist specialty / interest catalog.
 *
 * Per product spec (2026-09-27) we expanded specialties from 6 to 12+ items
 * and added a separate `favoritePlaces` list (restaurants, beaches, cafes,
 * viewpoints) that buddies can pin to their profile.
 */

export const SPECIALTIES = [
  'street-food',
  'history',
  'nightlife',
  'photography',
  'shopping',
  'nature',
  'wellness',
  'language-exchange',
  'motorbike-tours',
  'fishing',
  'cooking-class',
  'artisan-craft',
] as const

export type Specialty = (typeof SPECIALTIES)[number]

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  'street-food': 'Street food',
  'history': 'History & heritage',
  'nightlife': 'Nightlife',
  'photography': 'Photography spots',
  'shopping': 'Markets & shopping',
  'nature': 'Nature & hikes',
  'wellness': 'Wellness & spa',
  'language-exchange': 'Language exchange',
  'motorbike-tours': 'Motorbike tours',
  'fishing': 'Fishing villages',
  'cooking-class': 'Cooking class',
  'artisan-craft': 'Artisan craft',
}

export const FAVORITE_PLACES = [
  'con-market',
  'han-river-front',
  'my-khe-beach',
  'ban-nhoc-beach',
  'marble-mountains',
  'son-tra-peninsula',
  'ba-na-hills',
  'hoi-an-old-town',
  'lady-buddha',
  'linh-ung-pagoda',
  'dragon-bridge',
  'han-market',
  'cao-temple',
  'my-son-sanctuary',
  'non-nuoc-stone-carving',
] as const

export type FavoritePlace = (typeof FAVORITE_PLACES)[number]

export const PLACE_LABELS: Record<FavoritePlace, string> = {
  'con-market': 'Cồn Market',
  'han-river-front': 'Han River front',
  'my-khe-beach': 'My Khe Beach',
  'ban-nhoc-beach': 'Bãi Bắc Beach',
  'marble-mountains': 'Marble Mountains',
  'son-tra-peninsula': 'Son Tra Peninsula',
  'ba-na-hills': 'Ba Na Hills',
  'hoi-an-old-town': 'Hoi An Old Town',
  'lady-buddha': 'Lady Buddha statue',
  'linh-ung-pagoda': 'Linh Ứng Pagoda',
  'dragon-bridge': 'Dragon Bridge',
  'han-market': 'Han Market',
  'cao-temple': 'Cao Temple',
  'my-son-sanctuary': 'My Son Sanctuary',
  'non-nuoc-stone-carving': 'Non Nước stone carving village',
}

export const PLACE_ICON_HINT: Record<FavoritePlace, string> = {
  'con-market': 'market',
  'han-river-front': 'river',
  'my-khe-beach': 'beach',
  'ban-nhoc-beach': 'beach',
  'marble-mountains': 'mountain',
  'son-tra-peninsula': 'mountain',
  'ba-na-hills': 'mountain',
  'hoi-an-old-town': 'city',
  'lady-buddha': 'temple',
  'linh-ung-pagoda': 'temple',
  'dragon-bridge': 'bridge',
  'han-market': 'market',
  'cao-temple': 'temple',
  'my-son-sanctuary': 'temple',
  'non-nuoc-stone-carving': 'artisan',
}

/**
 * Render a specialty or place slug as a human-readable label.
 * Falls back to the raw slug title-cased if unknown.
 */
export function labelFor(slug: string): string {
  if (slug in SPECIALTY_LABELS) return SPECIALTY_LABELS[slug as Specialty]
  if (slug in PLACE_LABELS) return PLACE_LABELS[slug as FavoritePlace]
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
