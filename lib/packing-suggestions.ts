// Suggest packing items based on the stops already in the trip.
// Pure function so it's testable; consumes only TripStop[] and returns
// a deduped list of {item, category, reason} that the Packing tab can
// offer as chips.

import type { TripStop, TripPackingItem } from '@/lib/types'

export type PackingCategory = TripPackingItem['category']

export interface PackingSuggestion {
  item: string
  category: PackingCategory
  reason: string
}

interface Rule {
  match: (s: TripStop) => boolean
  items: Array<{ item: string; category: PackingCategory }>
  reason: string
}

const RULES: Rule[] = [
  {
    match: (s) =>
      /beach|My Khe|Non Nuoc|Lang Co/i.test(`${s.name} ${s.address ?? ''}`),
    items: [
      { item: 'Sunscreen SPF 50', category: 'toiletries' },
      { item: 'Swimwear', category: 'clothes' },
      { item: 'Beach towel', category: 'misc' },
      { item: 'Flip-flops', category: 'clothes' },
    ],
    reason: 'Beach stops',
  },
  {
    match: (s) =>
      /mountain|Marble|Ba Na|Hai Van|Son Tra|hiking|trek/i.test(
        `${s.name} ${s.address ?? ''}`,
      ),
    items: [
      { item: 'Hiking shoes', category: 'clothes' },
      { item: 'Insect repellent', category: 'toiletries' },
      { item: 'Reusable water bottle', category: 'misc' },
    ],
    reason: 'Mountain / hiking stops',
  },
  {
    match: (s) => s.category === 'food',
    items: [
      { item: 'Stomach medicine', category: 'toiletries' },
      { item: 'Hand sanitizer', category: 'toiletries' },
    ],
    reason: 'Food stops',
  },
  {
    match: (s) =>
      /market|Con|Han|Chợ|Cho /i.test(`${s.name} ${s.address ?? ''}`),
    items: [
      { item: 'Crossbody bag', category: 'misc' },
      { item: 'Cash in small VND notes', category: 'docs' },
    ],
    reason: 'Market stops',
  },
  {
    match: (s) => /spa|massage|temple|cave|pagoda/i.test(`${s.name} ${s.address ?? ''}`),
    items: [
      { item: 'Modest clothing (covered shoulders/knees)', category: 'clothes' },
    ],
    reason: 'Temple / spa stops',
  },
  {
    match: (s) => /motorbike|scooter/i.test(`${s.name} ${s.address ?? ''}`),
    items: [
      { item: 'Driver license', category: 'docs' },
      { item: 'Helmet (often provided)', category: 'clothes' },
    ],
    reason: 'Motorbike activity',
  },
]

export function suggestItems(
  stops: TripStop[],
  existingItems: TripPackingItem[] = [],
): PackingSuggestion[] {
  const out: PackingSuggestion[] = []
  const seen = new Set<string>()
  const hasItem = (s: string) =>
    existingItems.some((i) => i.item.toLowerCase() === s.toLowerCase())

  for (const stop of stops) {
    for (const rule of RULES) {
      if (!rule.match(stop)) continue
      for (const item of rule.items) {
        const key = item.item.toLowerCase()
        if (seen.has(key) || hasItem(item.item)) continue
        seen.add(key)
        out.push({ item: item.item, category: item.category, reason: rule.reason })
      }
    }
  }
  return out
}
