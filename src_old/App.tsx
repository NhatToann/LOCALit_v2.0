import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Home from './pages/Home/Home'
import Login from './pages/Auth/Login'
import Register from './pages/Auth/Register'
import ForgotPassword from './pages/Auth/ForgotPassword'
import Cities from './pages/Cities/Cities'
import CityTour from './pages/CityTour/CityTour'
import Profile from './pages/Profile/Profile'
import ProfileEdit from './pages/Profile/ProfileEdit'
import TouristDashboard from './pages/Dashboard/TouristDashboard'
import BuddyDashboard from './pages/Dashboard/BuddyDashboard'
import TripCreate from './pages/Trip/TripCreate'
import AIGenerate from './pages/Trip/AIGenerate'
import ItineraryDetail from './pages/Trip/ItineraryDetail'
import ItineraryEdit from './pages/Trip/ItineraryEdit'
import SavedTrips from './pages/Trip/SavedTrips'
import Buddies from './pages/Buddies/Buddies'
import BuddyProfile from './pages/Buddies/BuddyProfile'
import BuddyRequests from './pages/Buddy/BuddyRequests'
import Matching from './pages/Matching/Matching'
import Review from './pages/Review/Review'
import MapSearch from './pages/MapSearch/MapSearch'
import Booking from './pages/Booking/Booking'
import Chat from './pages/Chat/Chat'
import Support from './pages/Support/Support'
import NotFound from './pages/Support/NotFound'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="cities" element={<Cities />} />
          <Route path="cities/:id" element={<CityTour />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<ProfileEdit />} />
          <Route path="tourist/dashboard" element={<TouristDashboard />} />
          <Route path="buddy/dashboard" element={<BuddyDashboard />} />
          <Route path="trip/create" element={<TripCreate />} />
          <Route path="trip/ai-generate" element={<AIGenerate />} />
          <Route path="trip/:id" element={<ItineraryDetail />} />
          <Route path="trip/:id/edit" element={<ItineraryEdit />} />
          <Route path="trips" element={<SavedTrips />} />
          <Route path="buddies" element={<Buddies />} />
          <Route path="buddies/:id" element={<BuddyProfile />} />
          <Route path="match/:buddyId" element={<Navigate to="/buddies" replace />} />
          <Route path="buddy/requests" element={<BuddyRequests />} />
          <Route path="matching" element={<Matching />} />
          <Route path="review/:tripId" element={<Review />} />
          <Route path="map-search" element={<MapSearch />} />
          <Route path="booking" element={<Booking />} />
          <Route path="interest" element={<Navigate to="/booking" replace />} />
          <Route path="chat" element={<Chat />} />
          <Route path="chat/:conversationId" element={<Chat />} />
          <Route path="support/:topic" element={<Support />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
