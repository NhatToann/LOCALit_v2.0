/**
 * Itinerary templates — pre-built starter plans for Da Nang.
 *
 * Why templates, not blank form
 * ──────────────────────────────
 * New users freeze on a blank form ("what do I name it? what dates
 * do I pick?"). Templates give them a concrete starting point they
 * can edit, delete, or expand. The Trello board model is most
 * inviting when the first list is already populated.
 *
 * Each template is concrete, not generic:
 *   • Real Da Nang place names (Marble Mountains, Hoi An, Bún chả Cá)
 *   • Realistic times (Marble Mountains at 06:30 to beat the heat)
 *   • Realistic durations and cost estimates
 *   • Realistic local transport choices
 *
 * Templates are static data — no DB read on render. The route handler
 * at /api/itinerary/from-template copies them into the user's schema.
 */

export type TemplateCategory = 'sight' | 'food' | 'activity' | 'transport' | 'stay' | 'other'

export type CardTemplate = {
  name: string
  category: TemplateCategory
  /** HH:MM 24h, relative to the day's start_time. */
  start_time: string
  duration_minutes: number
  address?: string
  transport?: 'walk' | 'scooter' | 'taxi' | 'bike' | 'car' | ''
  est_cost_vnd?: number
  notes?: string
}

export type DayTemplate = {
  title: string
  /** Days from trip start. 0 = first day. */
  day_offset: number
  start_time: string
  end_time: string
  cards: CardTemplate[]
}

export type ItineraryTemplate = {
  id: string
  name: string
  name_vi: string
  /** One-sentence promise of what this trip gives the user. */
  summary: string
  duration_label: string
  best_for: string
  /** Per-person estimate in VND. */
  estimated_cost_vnd: number
  /** Used to render an icon in the template picker. */
  icon: 'mountain' | 'beach' | 'food' | 'temple' | 'night' | 'blank'
  days: DayTemplate[]
}

// ---------- Cards ----------

const t = (hh: number, mm = 0) =>
  `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`

// ---------- Templates ----------

export const TEMPLATES: ItineraryTemplate[] = [
  {
    id: 'marble-hoian',
    name: 'Marble Mountains + Hoi An',
    name_vi: 'Ngũ Hành Sơn + Hội An',
    summary: 'Climb the Marble Mountains at sunrise, cross to Hoi An for a lantern-lit afternoon and dinner.',
    duration_label: '1 day',
    best_for: 'First-time visitors',
    estimated_cost_vnd: 850000,
    icon: 'mountain',
    days: [
      {
        title: 'Morning — Marble Mountains',
        day_offset: 0,
        start_time: t(6, 30),
        end_time: t(11, 0),
        cards: [
          {
            name: 'Marble Mountains — Thuy Son peak',
            category: 'sight',
            start_time: t(6, 30),
            duration_minutes: 180,
            address: '81 Huyen Tran Cong Chua, Ngu Hanh Son',
            transport: 'scooter',
            est_cost_vnd: 40000,
            notes: 'Skip the elevator — the stairs and caves are the whole point. Bring water.',
          },
          {
            name: 'Non Nuoc Beach',
            category: 'sight',
            start_time: t(9, 30),
            duration_minutes: 60,
            address: 'Non Nuoc, Ngu Hanh Son',
            transport: 'scooter',
            est_cost_vnd: 0,
          },
        ],
      },
      {
        title: 'Afternoon — Hoi An Ancient Town',
        day_offset: 0,
        start_time: t(13, 30),
        end_time: t(21, 0),
        cards: [
          {
            name: 'Drive to Hoi An',
            category: 'transport',
            start_time: t(13, 30),
            duration_minutes: 45,
            transport: 'car',
            est_cost_vnd: 350000,
            notes: 'Grab or pre-book a car. The motorbike route via the coast is scenic.',
          },
          {
            name: 'Hoi An Ancient Town walk',
            category: 'sight',
            start_time: t(14, 30),
            duration_minutes: 180,
            address: 'Hoi An Old Town, Quang Nam',
            transport: 'walk',
            est_cost_vnd: 120000,
            notes: 'Old House entry ticket covers most sights. Lanterns start lighting at sunset.',
          },
          {
            name: 'Cao lầu at the market',
            category: 'food',
            start_time: t(17, 30),
            duration_minutes: 60,
            address: 'Hoi An Central Market',
            transport: 'walk',
            est_cost_vnd: 50000,
            notes: 'Cao lầu only exists in Hoi An — try the noodle stall behind the market.',
          },
          {
            name: 'Lantern-lit river walk',
            category: 'activity',
            start_time: t(19, 0),
            duration_minutes: 90,
            address: 'An Hoi Bridge area',
            transport: 'walk',
            est_cost_vnd: 50000,
            notes: 'Release a floating lantern on the river if you want the cliché shot.',
          },
        ],
      },
    ],
  },

  {
    id: 'beach-sontra',
    name: 'My Khe Beach + Son Tra',
    name_vi: 'Biển Mỹ Khê + Sơn Trà',
    summary: 'Swim My Khe in the morning, climb Son Tra in the afternoon, catch sunset at the top.',
    duration_label: '1 day',
    best_for: 'Beach + nature',
    estimated_cost_vnd: 450000,
    icon: 'beach',
    days: [
      {
        title: 'Morning — My Khe Beach',
        day_offset: 0,
        start_time: t(7, 0),
        end_time: t(11, 30),
        cards: [
          {
            name: 'My Khe Beach swim',
            category: 'activity',
            start_time: t(7, 0),
            duration_minutes: 150,
            address: 'Vo Nguyen Giap, Son Tra',
            transport: 'scooter',
            est_cost_vnd: 0,
            notes: 'Forbes called it one of the most attractive beaches on the planet. Saltwater is mild.',
          },
          {
            name: 'Beachfront breakfast',
            category: 'food',
            start_time: t(9, 30),
            duration_minutes: 60,
            address: 'Bai Bac, My Khe',
            transport: 'walk',
            est_cost_vnd: 80000,
            notes: 'Bún bò or Mì Quảng at any of the beachfront quán.',
          },
        ],
      },
      {
        title: 'Afternoon — Son Tra Peninsula',
        day_offset: 0,
        start_time: t(13, 30),
        end_time: t(18, 30),
        cards: [
          {
            name: 'Linh Ung Bai But Pagoda',
            category: 'sight',
            start_time: t(13, 30),
            duration_minutes: 90,
            address: 'Son Tra, Da Nang',
            transport: 'scooter',
            est_cost_vnd: 0,
            notes: 'Lady Buddha statue is 67m tall. Modest dress — cover shoulders and knees.',
          },
          {
            name: 'Son Tra viewpoint',
            category: 'sight',
            start_time: t(15, 30),
            duration_minutes: 60,
            transport: 'scooter',
            est_cost_vnd: 0,
            notes: 'Truck-stop café at the bend. Coconut coffee.',
          },
          {
            name: 'Ban Co Peak sunset',
            category: 'sight',
            start_time: t(17, 0),
            duration_minutes: 90,
            transport: 'scooter',
            est_cost_vnd: 0,
            notes: 'Last 3 km is rough dirt road. Park and walk the last stretch for the view.',
          },
        ],
      },
    ],
  },

  {
    id: 'food-crawl',
    name: 'Da Nang Street Food Crawl',
    name_vi: 'Ăn vặt Đà Nẵng',
    summary: 'Seven dishes, three meals, one city — the canonical Da Nang food tour in a day.',
    duration_label: '1 day',
    best_for: 'Foodies',
    estimated_cost_vnd: 380000,
    icon: 'food',
    days: [
      {
        title: 'Breakfast — market stalls',
        day_offset: 0,
        start_time: t(6, 30),
        end_time: t(10, 0),
        cards: [
          {
            name: 'Bún chả Cá at Han Market',
            category: 'food',
            start_time: t(6, 30),
            duration_minutes: 60,
            address: 'Han Market, Hai Chau',
            transport: 'walk',
            est_cost_vnd: 35000,
            notes: 'The stall on the left side of the wet market, ground floor.',
          },
          {
            name: 'Cà phê sữa đá + bánh mì',
            category: 'food',
            start_time: t(8, 0),
            duration_minutes: 45,
            address: 'Co.opmart Han Market area',
            transport: 'walk',
            est_cost_vnd: 25000,
            notes: 'Order a Vietnamese coffee and a bánh mì thịt — standard 5-minute breakfast.',
          },
        ],
      },
      {
        title: 'Lunch — local classics',
        day_offset: 0,
        start_time: t(11, 0),
        end_time: t(15, 0),
        cards: [
          {
            name: 'Mì Quảng at Bà Mua',
            category: 'food',
            start_time: t(11, 30),
            duration_minutes: 60,
            address: '19 Tran Binh Trong',
            transport: 'scooter',
            est_cost_vnd: 40000,
            notes: 'Turmeric noodles with pork and shrimp. The broth is small by design.',
          },
          {
            name: 'Bánh tráng nướng snack',
            category: 'food',
            start_time: t(13, 30),
            duration_minutes: 30,
            address: 'Bach Dang street food stalls',
            transport: 'walk',
            est_cost_vnd: 15000,
            notes: 'Vietnamese pizza — grilled rice paper with egg, scallion, and chili.',
          },
        ],
      },
      {
        title: 'Dinner + dessert',
        day_offset: 0,
        start_time: t(17, 30),
        end_time: t(22, 0),
        cards: [
          {
            name: 'Bún bò Huế at Madam Khanh',
            category: 'food',
            start_time: t(18, 0),
            duration_minutes: 60,
            address: '115 Tran Cao Van, Hai Chau',
            transport: 'scooter',
            est_cost_vnd: 45000,
            notes: 'Spicy beef noodle soup from the next province over — but Da Nang does it well.',
          },
          {
            name: 'Chè sweet soup',
            category: 'food',
            start_time: t(19, 30),
            duration_minutes: 30,
            address: 'Various stalls along Hoang Dieu',
            transport: 'walk',
            est_cost_vnd: 20000,
            notes: 'Coconut cream, mung bean, jelly — pick the one with the longest queue.',
          },
          {
            name: 'Bia hơi at a craft beer bar',
            category: 'food',
            start_time: t(20, 30),
            duration_minutes: 90,
            address: 'Bach Dang riverside bars',
            transport: 'walk',
            est_cost_vnd: 120000,
            notes: 'Maneki Brew, 3 Brewers, or Heart of Darkness for local craft.',
          },
        ],
      },
    ],
  },

  {
    id: 'bana-hills',
    name: 'Ba Na Hills + Golden Bridge',
    name_vi: 'Bà Nà Hills + Cầu Vàng',
    summary: 'Cable car up, Golden Bridge, French village, fantasy park, cable car down.',
    duration_label: '1 day',
    best_for: 'Iconic photo stops',
    estimated_cost_vnd: 1450000,
    icon: 'temple',
    days: [
      {
        title: 'Morning ascent',
        day_offset: 0,
        start_time: t(7, 0),
        end_time: t(13, 0),
        cards: [
          {
            name: 'Drive to Ba Na Hills base',
            category: 'transport',
            start_time: t(7, 0),
            duration_minutes: 60,
            transport: 'car',
            est_cost_vnd: 350000,
            notes: 'Pre-book a car — no Grab reliably available at 7am.',
          },
          {
            name: 'Cable car up',
            category: 'transport',
            start_time: t(8, 0),
            duration_minutes: 30,
            address: 'Ba Na Hills, Hoa Vang',
            est_cost_vnd: 0,
            notes: 'World-record cable car. Lines are shortest in the morning.',
          },
          {
            name: 'Golden Bridge + Le Jardin',
            category: 'sight',
            start_time: t(8, 30),
            duration_minutes: 90,
            transport: 'walk',
            est_cost_vnd: 0,
            notes: 'Get the bridge shot before the tour buses arrive at 10am.',
          },
          {
            name: 'French Village walk',
            category: 'sight',
            start_time: t(10, 0),
            duration_minutes: 120,
            transport: 'walk',
            est_cost_vnd: 0,
            notes: 'Streets of an imaginary French town. Wine cellar at the end.',
          },
        ],
      },
      {
        title: 'Afternoon — Fantasy Park',
        day_offset: 0,
        start_time: t(13, 0),
        end_time: t(17, 0),
        cards: [
          {
            name: 'Lunch at Ba Na buffet',
            category: 'food',
            start_time: t(13, 0),
            duration_minutes: 60,
            transport: 'walk',
            est_cost_vnd: 250000,
            notes: 'Buffet is included with most tickets. Crowded at 1pm — go at 12 or after 2.',
          },
          {
            name: 'Fantasy Park arcade + rides',
            category: 'activity',
            start_time: t(14, 0),
            duration_minutes: 180,
            transport: 'walk',
            est_cost_vnd: 0,
            notes: 'Most rides included in the ticket. Alpine coaster is the highlight.',
          },
        ],
      },
    ],
  },

  {
    id: 'han-river-night',
    name: 'Han River by Night',
    name_vi: 'Sông Hàn về đêm',
    summary: 'Sunset at the river, dinner, night market, and the fire-breathing Dragon Bridge show.',
    duration_label: 'Half day (evening)',
    best_for: 'Short on time',
    estimated_cost_vnd: 320000,
    icon: 'night',
    days: [
      {
        title: 'Evening — river + dinner',
        day_offset: 0,
        start_time: t(17, 0),
        end_time: t(22, 0),
        cards: [
          {
            name: 'Han River waterfront walk',
            category: 'activity',
            start_time: t(17, 0),
            duration_minutes: 60,
            address: 'Bach Dang walking street',
            transport: 'walk',
            est_cost_vnd: 0,
            notes: 'Sunset is around 17:30 year-round. Cross the Han Bridge on foot if you have time.',
          },
          {
            name: 'Dinner at Memory Restaurant',
            category: 'food',
            start_time: t(18, 30),
            duration_minutes: 90,
            address: '7 Bach Dang',
            transport: 'walk',
            est_cost_vnd: 180000,
            notes: 'Vietnamese tasting menu. Reserve ahead — busy on weekends.',
          },
          {
            name: 'Helio Night Market',
            category: 'activity',
            start_time: t(20, 0),
            duration_minutes: 90,
            address: 'Tran Phu, opposite Helio Center',
            transport: 'walk',
            est_cost_vnd: 60000,
            notes: 'Snacks, souvenirs, live music. Open 17:00–23:00.',
          },
          {
            name: 'Dragon Bridge fire show',
            category: 'sight',
            start_time: t(21, 0),
            duration_minutes: 15,
            address: 'Dragon Bridge',
            transport: 'walk',
            est_cost_vnd: 0,
            notes: 'Fire + water show at 21:00 Saturday and Sunday only. Crowd gathers by 20:45.',
          },
        ],
      },
    ],
  },

  {
    id: 'blank',
    name: 'Blank trip',
    name_vi: 'Chuyến trống',
    summary: 'Start from scratch — pick a name, set dates, and add your own lists.',
    duration_label: 'Flexible',
    best_for: 'Custom plans',
    estimated_cost_vnd: 0,
    icon: 'blank',
    days: [],
  },
]

export function getTemplateById(id: string): ItineraryTemplate | undefined {
  return TEMPLATES.find((tpl) => tpl.id === id)
}
