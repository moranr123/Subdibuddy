import { useEffect, useState, useCallback, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { isSuperadmin } from '../utils/auth'
import Layout from '../components/Layout';
import Header from '../components/Header';

interface StatCardProps {
  title: string;
  value: string | number;
  label: string;
  icon?: string;
}

const StatCard = memo(({ title, value, label, icon }: StatCardProps) => (
  <div className="bg-white rounded-lg p-6 border border-gray-200 transition-all hover:border-gray-300">
    <h2 className="text-gray-500 text-xs mb-2 font-normal uppercase tracking-wide">{title}</h2>
    <p className="text-3xl font-semibold text-gray-900 my-1">{value}</p>
    <p className="text-gray-400 text-xs m-0">{label}</p>
  </div>
));
StatCard.displayName = 'StatCard';

function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalBillings: 0,
    totalRevenue: 0,
    pendingBillings: 0,
    totalComplaints: 0,
    pendingComplaints: 0,
    totalVisitors: 0,
    pendingVisitors: 0,
  })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check if user is a superadmin
        const isAdmin = await isSuperadmin(currentUser)
        if (isAdmin) {
          setUser(currentUser)
        } else {
          // User is not a superadmin, sign them out and redirect
          await auth.signOut()
          navigate('/')
        }
      } else {
        navigate('/')
      }
    })

    return () => unsubscribe()
  }, [navigate])

  const fetchAnalytics = useCallback(async () => {
    if (!db) return;
    
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [usersSnapshot, billingsSnapshot, complaintsSnapshot, visitorsSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'billings')),
        getDocs(collection(db, 'complaints')),
        getDocs(collection(db, 'visitors')),
      ]);

      // Count users (excluding superadmins and archived residents - only count active residents)
      let totalUsers = 0;
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        // Only count residents, not superadmins or archived residents
        if (data.role !== 'superadmin' && data.status !== 'archived') {
          totalUsers++;
        }
      });

      // Calculate billings stats
      let totalBillings = 0;
      let totalRevenue = 0;
      let pendingBillings = 0;
      
      billingsSnapshot.forEach((doc) => {
        const data = doc.data();
        totalBillings++;
        const payments = data.payments || [];
        const totalPaid = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        totalRevenue += totalPaid;
        if (data.status === 'pending' || data.status === 'overdue') {
          pendingBillings++;
        }
      });

      // Count complaints
      let totalComplaints = 0;
      let pendingComplaints = 0;
      
      complaintsSnapshot.forEach((doc) => {
        const data = doc.data();
        totalComplaints++;
        if (data.status === 'pending') {
          pendingComplaints++;
        }
      });

      // Count visitors
      let totalVisitors = 0;
      let pendingVisitors = 0;
      
      visitorsSnapshot.forEach((doc) => {
        const data = doc.data();
        totalVisitors++;
        if (data.status === 'pending') {
          pendingVisitors++;
        }
      });

      setStats({
        totalUsers,
        totalBillings,
        totalRevenue,
        pendingBillings,
        totalComplaints,
        pendingComplaints,
        totalVisitors,
        pendingVisitors,
      });
      } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [db])

  useEffect(() => {
    if (user && db) {
      fetchAnalytics()
    }
  }, [user, db, fetchAnalytics])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const statsData = useMemo(() => [
    { title: 'Total Residents', value: stats.totalUsers, label: 'Registered users', icon: '' },
    { title: 'Total Billings', value: stats.totalBillings, label: `${stats.pendingBillings} pending`, icon: '' },
    { title: 'Total Revenue', value: formatCurrency(stats.totalRevenue), label: 'From payments', icon: '' },
    { title: 'Complaints', value: stats.totalComplaints, label: `${stats.pendingComplaints} pending`, icon: '' },
    { title: 'Visitors', value: stats.totalVisitors, label: `${stats.pendingVisitors} pending`, icon: '' },
  ], [stats]);


  return (
    <Layout>
      <div className="min-h-screen bg-white">
        <Header title="Dashboard" />

        <main className="max-w-[1400px] mx-auto p-8 flex flex-col items-center">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5 mb-8 w-full">
            {loading ? (
              <div className="col-span-full text-center py-[60px] px-5 text-gray-600 text-base">
                Loading analytics...
              </div>
            ) : (
              statsData.map((stat, index) => (
                <StatCard
                  key={`${stat.title}-${index}`}
                  title={stat.title}
                  value={stat.value}
                  label={stat.label}
                  icon={stat.icon}
                />
              ))
            )}
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200 w-full max-w-[800px]">
            <div>
              <h2 className="text-gray-900 mb-2 text-base font-normal">Analytics Overview</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">
                Real-time data from your Subdibuddy system. Click refresh to update statistics.
              </p>
              <button 
                className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={fetchAnalytics} 
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  )
}

export default memo(Dashboard)
