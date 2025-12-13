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
  bgColor?: string;
}

const StatCard = memo(({ title, value, label, icon, bgColor = '#ffffff' }: StatCardProps) => (
  <div 
    className="rounded-lg p-4 md:p-6 border border-gray-200 transition-all hover:border-gray-300 overflow-hidden"
    style={{ backgroundColor: bgColor }}
  >
    <h2 className="text-gray-500 text-xs mb-2 font-bold uppercase tracking-wide truncate">{title}</h2>
    <p className="text-2xl md:text-3xl font-semibold text-gray-900 my-1 truncate">{value}</p>
    <p className="text-gray-400 text-xs m-0 truncate">{label}</p>
  </div>
));
StatCard.displayName = 'StatCard';

interface ResidentGrowthData {
  date: string;
  count: number;
}

function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalBillings: 0,
    pendingBillings: 0,
    totalComplaints: 0,
    pendingComplaints: 0,
    totalVisitors: 0,
    pendingVisitors: 0,
    totalVehicles: 0,
    totalMaintenance: 0,
    pendingMaintenance: 0,
  })
  const [loading, setLoading] = useState(false)
  const [residentGrowthData, setResidentGrowthData] = useState<ResidentGrowthData[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [showReportModal, setShowReportModal] = useState(false)
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
      const [usersSnapshot, billingsSnapshot, complaintsSnapshot, visitorsSnapshot, vehicleRegistrationsSnapshot, maintenanceSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'billings')),
        getDocs(collection(db, 'complaints')),
        getDocs(collection(db, 'visitors')),
        getDocs(collection(db, 'vehicleRegistrations')),
        getDocs(collection(db, 'maintenance')),
      ]);

      // Count users (excluding superadmins and archived residents - only count active residents)
      let totalUsers = 0;
      const residentDates: Date[] = [];
      const yearsSet = new Set<number>();
      
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        // Only count residents, not superadmins or archived residents
        if (data.role !== 'superadmin' && data.status !== 'archived' && data.status === 'approved') {
          totalUsers++;
          
          // Track creation date for growth chart
          if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            residentDates.push(date);
            yearsSet.add(date.getFullYear());
          }
        }
      });

      // Set available years
      const years = Array.from(yearsSet).sort((a, b) => b - a);
      setAvailableYears(years);
      
      // Set default year to current year or most recent year
      if (!selectedYear && years.length > 0) {
        setSelectedYear(String(years[0]));
      }
      
      // Calculate billings stats
      let totalBillings = 0;
      let pendingBillings = 0;
      
      billingsSnapshot.forEach((doc) => {
        const data = doc.data();
        totalBillings++;
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

      // Count registered vehicles (approved status)
      let totalVehicles = 0;
      vehicleRegistrationsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'approved') {
          totalVehicles++;
        }
      });

      // Count maintenance requests
      let totalMaintenance = 0;
      let pendingMaintenance = 0;
      
      maintenanceSnapshot.forEach((doc) => {
        const data = doc.data();
        totalMaintenance++;
        if (data.status === 'pending') {
          pendingMaintenance++;
        }
      });

      setStats({
        totalUsers,
        totalBillings,
        pendingBillings,
        totalComplaints,
        pendingComplaints,
        totalVisitors,
        pendingVisitors,
        totalVehicles,
        totalMaintenance,
        pendingMaintenance,
      });
      } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [db, selectedYear])

  // Build growth data by month for selected year
  useEffect(() => {
    if (!db || !user || !selectedYear) return;

    const fetchResidentData = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const residentDates: Date[] = [];
        
        usersSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.role !== 'superadmin' && data.status !== 'archived' && data.status === 'approved') {
            if (data.createdAt) {
              const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
              residentDates.push(date);
            }
          }
        });

        const year = parseInt(selectedYear);
        const growthData: ResidentGrowthData[] = [];
        
        // Generate monthly data points for the selected year
        for (let month = 0; month < 12; month++) {
          const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
          
          // Count all residents created on or before the end of this month (cumulative)
          const count = residentDates.filter(rd => rd <= monthEnd).length;
          
          const monthStart = new Date(year, month, 1);
          const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short' });
          growthData.push({
            date: monthLabel,
            count: count,
          });
        }
        
        setResidentGrowthData(growthData);
      } catch (error) {
        console.error('Error fetching resident growth data:', error);
      }
    };

    fetchResidentData();
  }, [db, user, selectedYear])

  useEffect(() => {
    if (user && db) {
      fetchAnalytics()
    }
  }, [user, db, fetchAnalytics])

  const statsData = useMemo(() => [
    { title: 'Total Residents', value: stats.totalUsers, label: 'Registered users', icon: '', bgColor: '#eff6ff' },
    { title: 'Total Billings', value: stats.totalBillings, label: `${stats.pendingBillings} pending`, icon: '', bgColor: '#fffbeb' },
    { title: 'Complaints', value: stats.totalComplaints, label: `${stats.pendingComplaints} pending`, icon: '', bgColor: '#fef2f2' },
    { title: 'Visitors', value: stats.totalVisitors, label: `${stats.pendingVisitors} pending`, icon: '', bgColor: '#f5f3ff' },
    { title: 'Registered Vehicles', value: stats.totalVehicles, label: 'Approved vehicles', icon: '', bgColor: '#ecfdf5' },
    { title: 'Maintenance', value: stats.totalMaintenance, label: `${stats.pendingMaintenance} pending`, icon: '', bgColor: '#f5f3ff' },
  ], [stats]);


  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <Header title="Dashboard" />

        <main className="max-w-[1400px] mx-auto p-4 md:p-8 flex flex-col items-center">
          {/* Quick Actions */}
          <div className="w-full mb-4 md:mb-6 flex justify-end gap-3">
            <button
              onClick={() => navigate('/map')}
              className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 md:px-6 py-2 md:py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm text-sm md:text-base"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Open Map</span>
              <span className="sm:hidden">Map</span>
            </button>
            <button
              onClick={() => setShowReportModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 md:px-6 py-2 md:py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm text-sm md:text-base"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Generate Report</span>
              <span className="sm:hidden">Report</span>
            </button>
            <button
              onClick={() => navigate('/announcement')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 md:px-6 py-2 md:py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm text-sm md:text-base"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              <span className="hidden sm:inline">Create Announcement</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8 w-full">
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
                  bgColor={stat.bgColor}
                />
              ))
            )}
          </div>

          {/* Registered Residents Growth Chart */}
          <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200 w-full mb-6 md:mb-8 overflow-x-auto">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 mb-2 text-lg font-semibold">Registered Residents by Month</h2>
              <p className="text-gray-500 text-sm">
                  Cumulative count of registered residents over time
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="yearFilter" className="text-sm text-gray-600">Year:</label>
                <select
                  id="yearFilter"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {residentGrowthData.length > 0 ? (() => {
              const maxCount = Math.max(...residentGrowthData.map(d => d.count), 1);
              const minCount = Math.min(...residentGrowthData.map(d => d.count), 0);
              const range = maxCount - minCount || 1;
              
              return (
                <div className="w-full h-80 relative">
                  <svg width="100%" height="100%" className="overflow-visible" viewBox="0 0 1000 320" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#1877F2" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#1877F2" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    
                    {/* Grid lines */}
                    {[0, 1, 2, 3, 4].map((i) => {
                      const y = 40 + (i * 60);
                      const value = Math.round(minCount + (range / 4) * (4 - i));
                      return (
                        <g key={i}>
                          <line
                            x1="80"
                            y1={y}
                            x2="960"
                            y2={y}
                            stroke="#e5e7eb"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x="70"
                            y={y}
                            textAnchor="end"
                            fill="#6b7280"
                            fontSize="12"
                            dominantBaseline="middle"
                          >
                            {value}
                          </text>
                        </g>
                      );
                    })}
                    
                    {/* Area under curve */}
                    {residentGrowthData.length > 1 && (
                      <path
                        d={`M 80,${280 - ((residentGrowthData[0]?.count - minCount) / range) * 240} ${residentGrowthData.map((d, i) => {
                          const x = 80 + ((i / (residentGrowthData.length - 1)) * 880);
                          const y = 280 - ((d.count - minCount) / range) * 240;
                          return `L ${x},${y}`;
                        }).join(' ')} L 960,280 L 80,280 Z`}
                        fill="url(#lineGradient)"
                      />
                    )}
                    
                    {/* Line */}
                    {residentGrowthData.length > 1 && (
                      <polyline
                        points={residentGrowthData.map((d, i) => {
                          const x = 80 + ((i / (residentGrowthData.length - 1)) * 880);
                          const y = 280 - ((d.count - minCount) / range) * 240;
                          return `${x},${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#1877F2"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    
                    {/* Data points */}
                    {residentGrowthData.map((d, i) => {
                      const x = 80 + ((i / Math.max(residentGrowthData.length - 1, 1)) * 880);
                      const y = 280 - ((d.count - minCount) / range) * 240;
                      return (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r="4"
                          fill="#1877F2"
                          stroke="white"
                          strokeWidth="2"
                        />
                      );
                    })}
                    
                    {/* X-axis labels (show all 12 months) */}
                    {residentGrowthData.length > 0 && residentGrowthData.map((d, idx) => {
                      const x = 80 + ((idx / Math.max(residentGrowthData.length - 1, 1)) * 880);
                      return (
                        <text
                          key={idx}
                          x={x}
                          y="300"
                          textAnchor="middle"
                          fill="#6b7280"
                          fontSize="11"
                        >
                          {d.date}
                        </text>
                      );
                    })}
                  </svg>
                </div>
              );
            })() : (
              <div className="w-full h-64 flex items-center justify-center text-gray-400">
                <p>No data available for selected year</p>
              </div>
            )}
          </div>

          {/* Generate Report Modal */}
          {showReportModal && (
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={() => setShowReportModal(false)}>
              <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                  <h3 className="m-0 text-gray-900 text-xl font-semibold">Dashboard Report</h3>
                  <button 
                    className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                    onClick={() => setShowReportModal(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-y-auto px-6 py-5">
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">
                      Generated on: {new Date().toLocaleString()}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Category</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Total</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Pending</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-700 font-medium">Total Residents</td>
                          <td className="px-4 py-3 text-gray-900">{stats.totalUsers}</td>
                          <td className="px-4 py-3 text-gray-600">-</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">Active</span>
                          </td>
                        </tr>
                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-700 font-medium">Total Billings</td>
                          <td className="px-4 py-3 text-gray-900">{stats.totalBillings}</td>
                          <td className="px-4 py-3 text-gray-900">{stats.pendingBillings}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {stats.pendingBillings > 0 ? 'Pending' : 'All Paid'}
                            </span>
                          </td>
                        </tr>
                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-700 font-medium">Complaints</td>
                          <td className="px-4 py-3 text-gray-900">{stats.totalComplaints}</td>
                          <td className="px-4 py-3 text-gray-900">{stats.pendingComplaints}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                              {stats.pendingComplaints > 0 ? 'Pending' : 'Resolved'}
                            </span>
                          </td>
                        </tr>
                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-700 font-medium">Visitors</td>
                          <td className="px-4 py-3 text-gray-900">{stats.totalVisitors}</td>
                          <td className="px-4 py-3 text-gray-900">{stats.pendingVisitors}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                              {stats.pendingVisitors > 0 ? 'Pending' : 'All Processed'}
                            </span>
                          </td>
                        </tr>
                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-700 font-medium">Registered Vehicles</td>
                          <td className="px-4 py-3 text-gray-900">{stats.totalVehicles}</td>
                          <td className="px-4 py-3 text-gray-600">-</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Approved</span>
                          </td>
                        </tr>
                        <tr className="hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-4 py-3 text-gray-700 font-medium">Maintenance Requests</td>
                          <td className="px-4 py-3 text-gray-900">{stats.totalMaintenance}</td>
                          <td className="px-4 py-3 text-gray-900">{stats.pendingMaintenance}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                              {stats.pendingMaintenance > 0 ? 'Pending' : 'All Processed'}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {selectedYear && residentGrowthData.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Resident Growth - {selectedYear}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b-2 border-gray-200">
                              <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Month</th>
                              <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Cumulative Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {residentGrowthData.map((data, index) => (
                              <tr key={index} className="hover:bg-gray-50 border-b border-gray-100">
                                <td className="px-4 py-3 text-gray-700">{data.date}</td>
                                <td className="px-4 py-3 text-gray-900 font-medium">{data.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-6 py-5 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    className="bg-gray-900 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-gray-800"
                    onClick={() => {
                      // Export to CSV
                      const csvData = [
                        ['Category', 'Total', 'Pending', 'Status'],
                        ['Total Residents', stats.totalUsers, '-', 'Active'],
                        ['Total Billings', stats.totalBillings, stats.pendingBillings, stats.pendingBillings > 0 ? 'Pending' : 'All Paid'],
                        ['Complaints', stats.totalComplaints, stats.pendingComplaints, stats.pendingComplaints > 0 ? 'Pending' : 'Resolved'],
                        ['Visitors', stats.totalVisitors, stats.pendingVisitors, stats.pendingVisitors > 0 ? 'Pending' : 'All Processed'],
                        ['Registered Vehicles', stats.totalVehicles, '-', 'Approved'],
                        ['Maintenance Requests', stats.totalMaintenance, stats.pendingMaintenance, stats.pendingMaintenance > 0 ? 'Pending' : 'All Processed'],
                      ];
                      
                      const csvContent = csvData.map(row => row.join(',')).join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `dashboard-report-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    }}
                  >
                    Export CSV
                  </button>
                  <button
                    className="bg-gray-900 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-gray-800"
                    onClick={() => setShowReportModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </Layout>
  )
}

export default memo(Dashboard)
