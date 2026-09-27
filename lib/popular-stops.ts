import { Utensils, Mountain, Waves, Sparkles, Building2, Coffee, Camera, ShoppingBag, Train, type LucideIcon } from 'lucide-react'

export type StopCategory = 'food' | 'sight' | 'transport' | 'stay' | 'activity' | 'other'

export interface PopularStop {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  category: StopCategory
}

export const CATEGORY_ICONS: Record<StopCategory, LucideIcon> = {
  food: Utensils,
  sight: Mountain,
  transport: Train,
  stay: Building2,
  activity: Sparkles,
  other: Coffee,
}

const HAN_RIVER = { lat: 16.0611, lng: 108.2272 }

export const POPULAR_DA_NANG_STOPS: PopularStop[] = [
  // Sights
  { id: 'marble-mountains', name: 'Marble Mountains', address: '81 Huyền Trân Công Chúa, Ngũ Hành Sơn', lat: 16.0028, lng: 108.2625, category: 'sight' },
  { id: 'ba-na-hills', name: 'Ba Na Hills (Golden Bridge)', address: 'Thôn An Sơn, Hòa Vang', lat: 15.9908, lng: 107.9889, category: 'sight' },
  { id: 'son-tra', name: 'Son Tra Peninsula (Linh Ung Pagoda)', address: 'Bãi Bụt, Sơn Trà', lat: 16.1147, lng: 108.2778, category: 'sight' },
  { id: 'dragon-bridge', name: 'Dragon Bridge', address: 'Cầu Rồng, Sơn Trà', lat: 16.0611, lng: 108.2272, category: 'sight' },
  { id: 'han-river-bridge', name: 'Han River Bridge', address: 'Bắc Sơn Trà / Hải Châu', lat: 16.0635, lng: 108.2244, category: 'sight' },
  { id: 'lady-buddha', name: 'Lady Buddha statue', address: 'Sơn Trà', lat: 16.1147, lng: 108.2778, category: 'sight' },
  { id: 'museum-cham', name: 'Da Nang Museum of Cham Sculpture', address: '2 Trần Phú, Hải Châu', lat: 16.0608, lng: 108.2208, category: 'sight' },
  { id: 'my-khe-beach', name: 'My Khe Beach', address: 'Bãi biển Mỹ Khê, Sơn Trà', lat: 16.0544, lng: 108.2489, category: 'sight' },
  { id: 'non-nuoc', name: 'Non Nuoc Beach', address: 'Hoà Hải, Ngũ Hành Sơn', lat: 15.9783, lng: 108.2767, category: 'sight' },
  { id: 'helio-night', name: 'Helio Night Market', address: 'Bạch Đằng Đông', lat: 16.0687, lng: 108.2267, category: 'sight' },

  // Markets / food
  { id: 'han-market', name: 'Han Market', address: '119 Trần Phú, Hải Châu', lat: 16.0706, lng: 108.2247, category: 'food' },
  { id: 'con-market', name: 'Con Market', address: '290 Hùng Vương, Hải Châu', lat: 16.0638, lng: 108.2158, category: 'food' },
  { id: 'cho-dem', name: 'Cho Dem Son Tra (night market)', address: 'Mai Hac De, Sơn Trà', lat: 16.0644, lng: 108.2375, category: 'food' },
  { id: 'banh-mi-ba-lan', name: 'Bánh mì Bà Lan', address: '62 Trần Phú', lat: 16.0701, lng: 108.2244, category: 'food' },
  { id: 'my-quang-1', name: 'Mỳ Quảng Bà Mua', address: '19 Đống Đa, Hải Châu', lat: 16.0701, lng: 108.2158, category: 'food' },
  { id: 'bun-cha-ca', name: 'Bún chả cá 89', address: '89 Nguyễn Du, Hải Châu', lat: 16.0712, lng: 108.2151, category: 'food' },
  { id: 'cao-lau', name: 'Cao Lầu Liên', address: 'Thanh Hà, Hội An (day trip)', lat: 15.8771, lng: 108.3354, category: 'food' },
  { id: 'white-lotus', name: 'White Lotus Restaurant', address: '11 Lê Hồng Phong, Hải Châu', lat: 16.0714, lng: 108.2189, category: 'food' },
  { id: 'cong-caphe', name: 'Cộng Cà Phê (Han Riverside)', address: '98 Bạch Đằng', lat: 16.0736, lng: 108.2235, category: 'food' },
  { id: 'highlands-my-khe', name: 'Highlands Coffee (My Khe)', address: 'Võ Nguyên Giáp', lat: 16.0544, lng: 108.2479, category: 'food' },

  // Activities
  { id: 'hai-van-pass', name: 'Hai Van Pass (motorbike tour)', address: 'Đèo Hải Vân', lat: 16.1873, lng: 108.1311, category: 'activity' },
  { id: 'hoi-an-day-trip', name: 'Hoi An Ancient Town (day trip)', address: 'Hội An, Quảng Nam', lat: 15.8771, lng: 108.3354, category: 'activity' },
  { id: 'cua-lau-hoi-an', name: 'Hoi An cooking class', address: 'Hội An market', lat: 15.8771, lng: 108.3354, category: 'activity' },
  { id: 'snorkel-cham', name: 'Cham Islands snorkel', address: 'Cù Lao Chàm', lat: 15.9528, lng: 108.5072, category: 'activity' },
  { id: 'basket-boat', name: 'Basket boat ride (Cam Kim)', address: 'Cẩm Kim, Hội An', lat: 15.8633, lng: 108.3439, category: 'activity' },
  { id: 'lantern-making', name: 'Hoi An lantern-making workshop', address: 'Hội An', lat: 15.8771, lng: 108.3354, category: 'activity' },
  { id: 'fire-dragon', name: 'Dragon Bridge fire show (Sat/Sun)', address: 'Cầu Rồng', lat: 16.0611, lng: 108.2272, category: 'activity' },
  { id: 'mu-cang-chai-fitness', name: 'Yoga on the beach (My Khe)', address: 'My Khe Beach', lat: 16.0544, lng: 108.2489, category: 'activity' },

  // Stay / Transport
  { id: 'da-nang-airport', name: 'Da Nang International Airport', address: 'Hòa Thuận Tây, Hải Châu', lat: 16.0439, lng: 108.1994, category: 'transport' },
  { id: 'da-nang-train', name: 'Da Nang Railway Station', address: '202 Hải Phòng, Thanh Khê', lat: 16.0719, lng: 108.2081, category: 'transport' },
  { id: 'novotel', name: 'Novotel Danang', address: '36 Bạch Đằng', lat: 16.0714, lng: 108.2256, category: 'stay' },
  { id: 'intercon', name: 'InterContinental Danang Sun Peninsula', address: 'Bãi Bụt, Sơn Trà', lat: 16.1247, lng: 108.3061, category: 'stay' },
  { id: 'hyatt-regency', name: 'Hyatt Regency Danang', address: '5 Trường Sa, Ngũ Hành Sơn', lat: 15.9783, lng: 108.2767, category: 'stay' },
  { id: 'fusion-suites', name: 'Fusion Suites Da Nang', address: 'An Cu 5, Sơn Trà', lat: 16.0564, lng: 108.2403, category: 'stay' },

  // Shopping
  { id: 'vincom', name: 'Vincom Plaza', address: '910A Ngô Quyền, Sơn Trà', lat: 16.0611, lng: 108.2328, category: 'other' },
  { id: 'lotte', name: 'Lotte Mart Da Nang', address: '6 Nại Nam, Hải Châu', lat: 16.0625, lng: 108.2111, category: 'other' },
  { id: 'indochina-riverside', name: 'Indochina Riverside Mall', address: '74 Bạch Đằng', lat: 16.0689, lng: 108.2242, category: 'other' },

  // Cafes
  { id: 'the-espresso', name: 'The Espresso Station', address: '8 Hải Phòng, Thanh Khê', lat: 16.0717, lng: 108.2097, category: 'other' },
  { id: 'kaffe-no1', name: 'Kafferia No.1', address: '12 Trần Phú', lat: 16.0711, lng: 108.2233, category: 'other' },
]
