import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { memo, useMemo } from 'react'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import CreateSuperAdmin from './pages/CreateSuperAdmin'
import Announcement from './pages/Announcement'
import Complaints from './pages/Complaints'
import VisitorPreRegistration from './pages/VisitorPreRegistration'
import ResidentManagement from './pages/ResidentManagement'
import BillingPayment from './pages/BillingPayment'
import Maintenance from './pages/Maintenance'

function App() {
  const routes = useMemo(() => (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/announcement" element={<Announcement />} />
      <Route path="/complaints" element={<Complaints />} />
      <Route path="/visitor-pre-registration" element={<VisitorPreRegistration />} />
      <Route path="/resident-management" element={<ResidentManagement />} />
      <Route path="/billing-payment" element={<BillingPayment />} />
      <Route path="/maintenance" element={<Maintenance />} />
      <Route path="/create-superadmin" element={<CreateSuperAdmin />} />
    </Routes>
  ), []);

  return (
    <Router>
      {routes}
    </Router>
  )
}

export default memo(App)

