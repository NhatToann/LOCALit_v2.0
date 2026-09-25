import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './Booking.css'

type Listing = {
  id: string
  city: string
  title: string
  buddy: string
  category: string
  area: string
  image: string
  rating: number
  reviews: number
  price: number
  capacity: number
  booked: Record<string, number>
  perks: string[]
  languages: string[]
  cancellation: 'free' | 'partial'
  startTimes: string[]
}

type Guest = {
  fullName: string
  email: string
  phone: string
  note: string
}

const BOOKING_STORAGE_KEY = 'localit.booking.confirmations'

const listings: Listing[] = [
  {
    id: 'danang-beach-resort',
    city: 'Da Nang',
    title: 'My Khe beachfront resort stay',
    buddy: 'LOCALit Hotel Desk',
    category: 'Beach hotel',
    area: 'My Khe Beach',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    rating: 4.9,
    reviews: 248,
    price: 86,
    capacity: 10,
    booked: { '2026-07-22': 4, '2026-07-26': 7 },
    perks: ['Ocean view', 'Free cancellation', 'Breakfast included'],
    languages: ['English', 'Vietnamese'],
    cancellation: 'free',
    startTimes: ['14:00', '15:00', '16:00'],
  },
  {
    id: 'danang-riverside-dinner',
    city: 'Da Nang',
    title: 'Han River seafood dinner table',
    buddy: 'Madame Lan Riverside',
    category: 'Restaurant',
    area: 'Han River, Hai Chau',
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80',
    rating: 4.8,
    reviews: 184,
    price: 28,
    capacity: 12,
    booked: { '2026-07-23': 8, '2026-07-24': 3 },
    perks: ['River view table', 'Local seafood set', 'Instant confirmation'],
    languages: ['English', 'Korean'],
    cancellation: 'partial',
    startTimes: ['18:00', '19:00', '20:00'],
  },
  {
    id: 'danang-boutique-hotel',
    city: 'Da Nang',
    title: 'Boutique hotel near Dragon Bridge',
    buddy: 'LOCALit Stay Partner',
    category: 'City hotel',
    area: 'Hai Chau District',
    image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80',
    rating: 4.7,
    reviews: 312,
    price: 52,
    capacity: 9,
    booked: { '2026-07-21': 5, '2026-07-25': 4 },
    perks: ['Walk to cafes', 'Late checkout', 'Airport transfer'],
    languages: ['English', 'French'],
    cancellation: 'free',
    startTimes: ['13:00', '14:00', '15:00'],
  },
  {
    id: 'danang-son-tra-lunch',
    city: 'Da Nang',
    title: 'Son Tra seafood lunch reservation',
    buddy: 'Be Man Seafood',
    category: 'Restaurant',
    area: 'Son Tra Peninsula',
    image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
    rating: 4.9,
    reviews: 201,
    price: 24,
    capacity: 14,
    booked: { '2026-07-20': 6, '2026-07-27': 2 },
    perks: ['Seafood set menu', 'Family table', 'Free cancellation'],
    languages: ['English', 'Vietnamese'],
    cancellation: 'free',
    startTimes: ['11:30', '12:30', '13:30'],
  },
]

const today = new Date().toISOString().slice(0, 10)
const tomorrowDate = new Date()
tomorrowDate.setDate(tomorrowDate.getDate() + 1)
const tomorrow = tomorrowDate.toISOString().slice(0, 10)

const nightsBetween = (start: string, end: string) => {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000)
  return Math.max(days, 1)
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

const Booking = () => {
  const [searchParams] = useSearchParams()
  const availableCities = Array.from(new Set(listings.map((listing) => listing.city)))
  const cityParam = searchParams.get('city') || ''
  const initialCity = availableCities.includes(cityParam) ? cityParam : 'Da Nang'
  const initialDate = searchParams.get('date') || today
  const initialCheckoutDate = new Date(`${initialDate}T00:00:00`)
  initialCheckoutDate.setDate(initialCheckoutDate.getDate() + 1)
  const initialCheckout = initialCheckoutDate.toISOString().slice(0, 10)
  const initialGuests = Number(searchParams.get('guests') || 2)
  const [city, setCity] = useState(initialCity)
  const [checkIn, setCheckIn] = useState(initialDate)
  const [checkOut, setCheckOut] = useState(initialCheckout || tomorrow)
  const [guests, setGuests] = useState(initialGuests)
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('recommended')
  const [freeCancellation, setFreeCancellation] = useState(false)
  const [selectedId, setSelectedId] = useState(listings[0].id)
  const [startTime, setStartTime] = useState(listings[0].startTimes[0])
  const [coupon, setCoupon] = useState('')
  const [payLater, setPayLater] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [cardNumber, setCardNumber] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [airportPickup, setAirportPickup] = useState(false)
  const [travelInsurance, setTravelInsurance] = useState(false)
  const [guest, setGuest] = useState<Guest>({
    fullName: '',
    email: '',
    phone: '',
    note: '',
  })
  const [confirmation, setConfirmation] = useState('')
  const [bookingHistory, setBookingHistory] = useState<Array<{
    code: string
    title: string
    city: string
    checkIn: string
    checkOut: string
    guests: number
    total: number
    payment: string
  }>>(() => JSON.parse(localStorage.getItem(BOOKING_STORAGE_KEY) || '[]'))

  const categories = ['All', ...Array.from(new Set(listings.map((listing) => listing.category)))]

  const filteredListings = useMemo(() => {
    const result = listings.filter((listing) => {
      const availableSlots = listing.capacity - (listing.booked[checkIn] || 0)
      return (
        listing.city === city &&
        (category === 'All' || listing.category === category) &&
        (!freeCancellation || listing.cancellation === 'free') &&
        availableSlots >= guests
      )
    })

    return [...result].sort((a, b) => {
      if (sort === 'price') return a.price - b.price
      if (sort === 'rating') return b.rating - a.rating
      if (sort === 'capacity') return (b.capacity - (b.booked[checkIn] || 0)) - (a.capacity - (a.booked[checkIn] || 0))
      return b.rating * 100 + b.reviews - (a.rating * 100 + a.reviews)
    })
  }, [category, checkIn, city, freeCancellation, guests, sort])

  useEffect(() => {
    if (filteredListings.length === 0) return

    const activeListing = filteredListings.find((listing) => listing.id === selectedId)
    if (!activeListing) {
      setSelectedId(filteredListings[0].id)
      setStartTime(filteredListings[0].startTimes[0])
      return
    }

    if (!activeListing.startTimes.includes(startTime)) {
      setStartTime(activeListing.startTimes[0])
    }
  }, [filteredListings, selectedId, startTime])

  const selectedListing = filteredListings.find((listing) => listing.id === selectedId) || null
  const tripDays = nightsBetween(checkIn, checkOut)
  const remainingSlots = selectedListing ? selectedListing.capacity - (selectedListing.booked[checkIn] || 0) : 0
  const baseTotal = selectedListing ? selectedListing.price * guests * tripDays : 0
  const addons = (airportPickup ? 18 : 0) + (travelInsurance ? guests * 6 : 0)
  const normalizedCoupon = coupon.trim().toUpperCase()
  const hasCoupon = normalizedCoupon.length > 0
  const couponValid = normalizedCoupon === 'LOCALIT10'
  const discount = couponValid ? Math.round(baseTotal * 0.1) : 0
  const serviceFee = Math.round((baseTotal + addons - discount) * 0.05)
  const tax = Math.round((baseTotal + addons - discount) * 0.08)
  const grandTotal = baseTotal + addons + serviceFee + tax - discount
  const dateInvalid = new Date(checkOut) <= new Date(checkIn)
  const paymentReady = payLater || (paymentMethod.length > 0 && cardNumber.replace(/\s/g, '').length >= 12)
  const paymentPlaceholder =
    paymentMethod === 'momo' ? 'MoMo wallet phone number' : paymentMethod === 'paypal' ? 'PayPal account reference' : 'Card number'
  const canBook = Boolean(
    selectedListing &&
    !dateInvalid &&
    guests > 0 &&
    guests <= remainingSlots &&
    guest.fullName &&
    guest.email.includes('@') &&
    guest.phone.length >= 8 &&
    paymentReady &&
    !isProcessing &&
    !confirmation,
  )

  const updateGuest = (field: keyof Guest, value: string) => {
    setGuest((current) => ({ ...current, [field]: value }))
  }

  const selectListing = (listing: Listing) => {
    setSelectedId(listing.id)
    setStartTime(listing.startTimes[0])
    setConfirmation('')
  }

  const confirmBooking = () => {
    if (!canBook || !selectedListing) return

    const bookingCode = `LOC-${Date.now().toString().slice(-6)}`
    const payload = {
      code: bookingCode,
      listingId: selectedListing.id,
      title: selectedListing.title,
      city,
      checkIn,
      checkOut,
      guests,
      startTime,
      total: grandTotal,
      payment: payLater ? 'Pay later' : `Pay now - ${paymentMethod}`,
      guest,
    }
    setIsProcessing(true)
    window.setTimeout(() => {
      const saved = JSON.parse(localStorage.getItem(BOOKING_STORAGE_KEY) || '[]')
      const nextHistory = [payload, ...saved]
      localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(nextHistory))
      setBookingHistory(nextHistory)
      setConfirmation(bookingCode)
      setIsProcessing(false)
    }, payLater ? 300 : 900)
  }

  return (
    <div className="booking-page">
      <section className="booking-hero">
        <div>
          <span className="booking-kicker">Da Nang Booking</span>
          <h1>Book Da Nang hotels and restaurant tables</h1>
          <p>Compare beach stays, city hotels, riverside dinners, and seafood tables with quick confirmation in one flow.</p>
        </div>
      </section>

      <section className="booking-search" aria-label="Booking search">
        <label>
          Destination
          <select value={city} onChange={(event) => setCity(event.target.value)}>
            {availableCities.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Check-in / Visit date
          <input type="date" min={today} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
        </label>
        <label>
          Check-out
          <input type="date" min={checkIn} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
        </label>
        <label>
          Guests
          <input type="number" min="1" max="12" value={guests} onChange={(event) => setGuests(Number(event.target.value))} />
        </label>
      </section>

      <main className="booking-layout">
        <aside className="booking-filters">
          <h2>Filter results</h2>
          <label>
            Place type
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recommended">Recommended</option>
              <option value="price">Lowest price</option>
              <option value="rating">Top rated</option>
              <option value="capacity">Most availability</option>
            </select>
          </label>
          <label className="booking-checkbox">
            <input type="checkbox" checked={freeCancellation} onChange={(event) => setFreeCancellation(event.target.checked)} />
            Free cancellation only
          </label>
          <div className="booking-filter-note">
            {filteredListings.length} Da Nang option{filteredListings.length === 1 ? '' : 's'} for {guests} guest{guests === 1 ? '' : 's'}.
          </div>
        </aside>

        <section className="booking-results">
          {filteredListings.length === 0 ? (
            <div className="booking-empty">
              <h2>No available rooms or tables</h2>
              <p>Try another date, place type, or lower the guest count.</p>
            </div>
          ) : (
            filteredListings.map((listing) => {
              const available = listing.capacity - (listing.booked[checkIn] || 0)
              return (
                <article key={listing.id} className={`booking-card ${selectedListing?.id === listing.id ? 'selected' : ''}`}>
                  <img src={listing.image} alt={listing.title} />
                  <div className="booking-card-body">
                    <div className="booking-card-top">
                      <div>
                        <h2>{listing.title}</h2>
                        <p>{listing.area} · {listing.buddy}</p>
                      </div>
                      <span className="booking-rating">{listing.rating} / 5</span>
                    </div>
                    <div className="booking-perks">
                      {listing.perks.map((perk) => (
                        <span key={perk}>{perk}</span>
                      ))}
                    </div>
                    <div className="booking-card-bottom">
                      <div>
                        <strong>{formatMoney(listing.price)}</strong>
                        <span>per guest / night or set menu</span>
                      </div>
                      <div className="booking-card-actions">
                        <span>{available} spots left</span>
                        <button type="button" onClick={() => selectListing(listing)}>Select</button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </section>

        <aside className={`booking-checkout ${!selectedListing ? 'disabled' : ''}`}>
          <h2>Your booking</h2>
          {selectedListing ? (
            <div className="checkout-summary">
              <strong>{selectedListing.title}</strong>
              <span>{selectedListing.city} - {tripDays} night/day{tripDays === 1 ? '' : 's'} - {guests} guest{guests === 1 ? '' : 's'}</span>
            </div>
          ) : (
            <div className="checkout-summary">
              <strong>No option selected</strong>
              <span>Adjust search filters to see available Da Nang places.</span>
            </div>
          )}

          <label>
            Arrival time
            <select value={startTime} disabled={!selectedListing} onChange={(event) => setStartTime(event.target.value)}>
              {(selectedListing?.startTimes || []).map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </label>

          <div className="booking-addons">
            <label className="booking-checkbox">
              <input type="checkbox" disabled={!selectedListing} checked={airportPickup} onChange={(event) => setAirportPickup(event.target.checked)} />
              Airport transfer +{formatMoney(18)}
            </label>
            <label className="booking-checkbox">
              <input type="checkbox" disabled={!selectedListing} checked={travelInsurance} onChange={(event) => setTravelInsurance(event.target.checked)} />
              Breakfast / welcome drink +{formatMoney(guests * 6)}
            </label>
          </div>

          <div className="guest-form">
            <label>
              Guest name
              <input disabled={!selectedListing} value={guest.fullName} onChange={(event) => updateGuest('fullName', event.target.value)} />
            </label>
            <label>
              Email
              <input disabled={!selectedListing} type="email" value={guest.email} onChange={(event) => updateGuest('email', event.target.value)} />
            </label>
            <label>
              Phone
              <input disabled={!selectedListing} value={guest.phone} onChange={(event) => updateGuest('phone', event.target.value)} />
            </label>
            <label>
              Room or table request
              <textarea disabled={!selectedListing} value={guest.note} onChange={(event) => updateGuest('note', event.target.value)} rows={3} />
            </label>
          </div>

          <label>
            Promo code
            <input disabled={!selectedListing} placeholder="Try LOCALIT10" value={coupon} onChange={(event) => setCoupon(event.target.value)} />
          </label>
          {hasCoupon && (
            <p className={couponValid ? 'booking-success compact' : 'booking-error compact'}>
              {couponValid ? 'Promo LOCALIT10 applied: 10% off base price.' : 'Promo code is not valid.'}
            </p>
          )}

          <div className="payment-toggle">
            <button type="button" disabled={!selectedListing} className={payLater ? 'active' : ''} onClick={() => setPayLater(true)}>Pay later</button>
            <button type="button" disabled={!selectedListing} className={!payLater ? 'active' : ''} onClick={() => setPayLater(false)}>Pay now</button>
          </div>
          <p className="payment-note">
            {payLater ? 'Your room or table is held now. Pay at the hotel or restaurant after confirmation.' : 'Mock payment: enter a card or wallet reference to complete now.'}
          </p>

          {!payLater && (
            <div className="payment-methods">
              <label>
                Payment method
                <select disabled={!selectedListing} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option value="card">Credit or debit card</option>
                  <option value="momo">MoMo wallet</option>
                  <option value="paypal">PayPal</option>
                </select>
              </label>
              <label>
                Payment reference
                <input
                  inputMode="numeric"
                  disabled={!selectedListing}
                  placeholder={paymentPlaceholder}
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                />
              </label>
            </div>
          )}

          <div className="price-lines">
            <span><em>Base</em><strong>{formatMoney(baseTotal)}</strong></span>
            <span><em>Add-ons</em><strong>{formatMoney(addons)}</strong></span>
            <span><em>Discount</em><strong>-{formatMoney(discount)}</strong></span>
            <span><em>Service fee</em><strong>{formatMoney(serviceFee)}</strong></span>
            <span><em>Tax</em><strong>{formatMoney(tax)}</strong></span>
            <span className="total"><em>Total</em><strong>{formatMoney(grandTotal)}</strong></span>
          </div>

          {dateInvalid && <p className="booking-error">Checkout date must be after check-in or visit date.</p>}
          {!selectedListing && <p className="booking-error">Choose an available result before confirming.</p>}
          {selectedListing && guests > remainingSlots && <p className="booking-error">Only {remainingSlots} spot{remainingSlots === 1 ? '' : 's'} left for this date.</p>}
          {!payLater && !paymentReady && <p className="booking-error">Enter a valid payment reference to pay now.</p>}
          {confirmation && <p className="booking-success">Confirmed: {confirmation}. See it below in Booking History.</p>}

          <button type="button" className="confirm-booking" disabled={!canBook} onClick={confirmBooking}>
            {isProcessing ? 'Processing...' : 'Confirm booking'}
          </button>
        </aside>
      </main>

      <section className="booking-history">
        <div className="booking-history-header">
          <div>
            <span className="booking-kicker">Booking History</span>
            <h2>Your confirmed Da Nang bookings</h2>
          </div>
          <Link to="/trips" className="btn btn-outline">View My Trips</Link>
        </div>
        {bookingHistory.length > 0 ? (
          <div className="booking-history-list">
            {bookingHistory.slice(0, 4).map((booking) => (
              <article key={booking.code} className="booking-history-card">
                <strong>{booking.code}</strong>
                <h3>{booking.title}</h3>
                <p>{booking.city} · {booking.checkIn} to {booking.checkOut} · {booking.guests} guest{booking.guests === 1 ? '' : 's'}</p>
                <span>{booking.payment} · {formatMoney(booking.total)}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="booking-empty inline">
            <h3>No booking history yet</h3>
            <p>Confirm a hotel or restaurant booking and it will appear here immediately for the MVP demo.</p>
          </div>
        )}
      </section>
    </div>
  )
}

export default Booking
