import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { memo, useMemo } from 'react'
import { SidebarProvider } from './contexts/SidebarContext'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import CreateSuperAdmin from './pages/CreateSuperAdmin'
import Announcement from './pages/Announcement'
import Complaints from './pages/Complaints'
import VisitorPreRegistration from './pages/VisitorPreRegistration'
import ResidentManagement from './pages/ResidentManagement'
import BillingPayment from './pages/BillingPayment'
import Maintenance from './pages/Maintenance'
import VehicleRegistration from './pages/VehicleRegistration'
import Archived from './pages/Archived'
import Map from './pages/Map'

function App() {
  const routes = useMemo(() => (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/announcement" element={<Announcement />} />
      <Route path="/complaints" element={<Complaints />} />
      <Route path="/visitor-pre-registration" element={<VisitorPreRegistration />} />
      <Route path="/visitor-pre-registration/applications" element={<VisitorPreRegistration />} />
      <Route path="/visitor-pre-registration/visitors-list" element={<VisitorPreRegistration />} />
      <Route path="/resident-management" element={<ResidentManagement />} />
      <Route path="/resident-management/applications" element={<ResidentManagement />} />
      <Route path="/resident-management/registered" element={<ResidentManagement />} />
      <Route path="/billing-payment" element={<BillingPayment />} />
      <Route path="/billing-payment/water" element={<BillingPayment />} />
      <Route path="/billing-payment/electricity" element={<BillingPayment />} />
      <Route path="/maintenance" element={<Maintenance />} />
      <Route path="/vehicle-registration" element={<VehicleRegistration />} />
      <Route path="/vehicle-registration/applications" element={<VehicleRegistration />} />
      <Route path="/vehicle-registration/registered" element={<VehicleRegistration />} />
      <Route path="/archived" element={<Archived />} />
      <Route path="/map" element={<Map />} />
      <Route path="/create-superadmin" element={<CreateSuperAdmin />} />
    </Routes>
  ), []);

  return (
    <Router>
      <SidebarProvider>
      {routes}
      </SidebarProvider>
    </Router>
  )
}

export default memo(App)

