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

const StatCard = memo(({ title, value, label, bgColor = '#ffffff' }: StatCardProps) => (
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

interface GenderByYearData {
  year: number;
  male: number;
  female: number;
}

function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    totalUsers: 0,
    tenantsCount: 0,
    homeownersCount: 0,
    totalBillings: 0,
    pendingBillings: 0,
    paidBillings: 0,
    totalComplaints: 0,
    pendingComplaints: 0,
    resolvedComplaints: 0,
    totalVisitors: 0,
    pendingVisitors: 0,
    approvedVisitors: 0,
    totalVehicles: 0,
    totalMaintenance: 0,
    pendingMaintenance: 0,
    resolvedMaintenance: 0,
  })
  const [loading, setLoading] = useState(false)
  const [residentGrowthData, setResidentGrowthData] = useState<ResidentGrowthData[]>([])
  const [genderByYearData, setGenderByYearData] = useState<GenderByYearData[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [pieChartYearFilter, setPieChartYearFilter] = useState<string>('')
  const [barChartYearFilter, setBarChartYearFilter] = useState<string>('')
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [allTenantsCount, setAllTenantsCount] = useState(0)
  const [allHomeownersCount, setAllHomeownersCount] = useState(0)
  const [tenantsByYear, setTenantsByYear] = useState<Map<number, { tenants: number; homeowners: number }>>(new Map())
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: ResidentGrowthData } | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportPage, setReportPage] = useState(1)
  const REPORT_ITEMS_PER_PAGE = 10
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

  useEffect(() => {
    setReportPage(1)
  }, [showReportModal, stats])

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
      let tenantsCount = 0;
      let homeownersCount = 0;
      const residentDates: Date[] = [];
      const yearsSet = new Set<number>();
      const genderByYearMap = new Map<number, { male: number; female: number }>();
      const tenantsByYearMap = new Map<number, { tenants: number; homeowners: number }>();
      
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        // Only count residents, not superadmins or archived residents
        if (data.role !== 'superadmin' && data.status !== 'archived' && data.status === 'approved') {
          totalUsers++;
          
          // Determine if tenant or homeowner
          const isTenant = data.residentType === 'tenant' || data.isTenant === true;
          if (isTenant) {
            tenantsCount++;
          } else {
            homeownersCount++;
          }
          
          // Track creation date for growth chart and gender by year
          if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const year = date.getFullYear();
            residentDates.push(date);
            yearsSet.add(year);
            
            // Track gender by year
            if (data.sex) {
              if (!genderByYearMap.has(year)) {
                genderByYearMap.set(year, { male: 0, female: 0 });
              }
              const yearData = genderByYearMap.get(year)!;
              if (data.sex === 'male') {
                yearData.male++;
              } else if (data.sex === 'female') {
                yearData.female++;
              }
            }
            
            // Track tenants/homeowners by year
            if (!tenantsByYearMap.has(year)) {
              tenantsByYearMap.set(year, { tenants: 0, homeowners: 0 });
            }
            const tenantYearData = tenantsByYearMap.get(year)!;
            if (isTenant) {
              tenantYearData.tenants++;
            } else {
              tenantYearData.homeowners++;
            }
          }
        }
      });
      
      // Convert gender by year map to array and sort by year
      const genderByYearArray: GenderByYearData[] = Array.from(genderByYearMap.entries())
        .map(([year, counts]) => ({
          year,
          male: counts.male,
          female: counts.female,
        }))
        .sort((a, b) => a.year - b.year);
      
      setGenderByYearData(genderByYearArray);
      setAllTenantsCount(tenantsCount);
      setAllHomeownersCount(homeownersCount);
      setTenantsByYear(tenantsByYearMap);
      
      // Generate full range of years (from 2020 to current year)
      const currentYear = new Date().getFullYear();
      const startYear = 2020;
      const allYears: number[] = [];
      for (let year = currentYear; year >= startYear; year--) {
        allYears.push(year);
      }
      setAvailableYears(allYears);
      
      // Set default chart year filters to current year or most recent year with data
      if (!pieChartYearFilter) {
        if (yearsSet.size > 0) {
          const yearsWithData = Array.from(yearsSet).sort((a, b) => b - a);
          setPieChartYearFilter(String(yearsWithData[0]));
        } else {
          setPieChartYearFilter(String(currentYear));
        }
      }
      if (!barChartYearFilter) {
        if (yearsSet.size > 0) {
          const yearsWithData = Array.from(yearsSet).sort((a, b) => b - a);
          setBarChartYearFilter(String(yearsWithData[0]));
        } else {
          setBarChartYearFilter(String(currentYear));
        }
      }
      
      // Set default year to current year or most recent year with data
      if (!selectedYear) {
        if (yearsSet.size > 0) {
          const yearsWithData = Array.from(yearsSet).sort((a, b) => b - a);
          setSelectedYear(String(yearsWithData[0]));
        } else {
          setSelectedYear(String(currentYear));
        }
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
      let resolvedComplaints = 0;
      
      complaintsSnapshot.forEach((doc) => {
        const data = doc.data();
        totalComplaints++;
        if (data.status === 'pending') {
          pendingComplaints++;
        } else if (data.status === 'resolved') {
          resolvedComplaints++;
        }
      });

      // Count visitors
      let totalVisitors = 0;
      let pendingVisitors = 0;
      let approvedVisitors = 0;
      
      visitorsSnapshot.forEach((doc) => {
        const data = doc.data();
        totalVisitors++;
        if (data.status === 'pending') {
          pendingVisitors++;
        } else if (data.status === 'approved') {
          approvedVisitors++;
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
      let resolvedMaintenance = 0;
      
      maintenanceSnapshot.forEach((doc) => {
        const data = doc.data();
        totalMaintenance++;
        if (data.status === 'pending') {
          pendingMaintenance++;
        } else if (data.status === 'resolved') {
          resolvedMaintenance++;
        }
      });

      // Calculate paid billings
      let paidBillings = totalBillings - pendingBillings;

      setStats({
        totalUsers,
        tenantsCount,
        homeownersCount,
        totalBillings,
        pendingBillings,
        paidBillings,
        totalComplaints,
        pendingComplaints,
        resolvedComplaints,
        totalVisitors,
        pendingVisitors,
        approvedVisitors,
        totalVehicles,
        totalMaintenance,
        pendingMaintenance,
        resolvedMaintenance,
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

        <main className="max-w-[1400px] mx-auto p-4 md:p-8 flex flex-col items-center w-full">
          {/* Quick Actions */}
          <div className="w-full mb-4 md:mb-6 flex flex-wrap justify-end gap-2 sm:gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8 w-full">
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
            <div className="mb-4 md:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-gray-900 mb-1 sm:mb-2 text-base sm:text-lg font-semibold">Registered Residents by Month</h2>
                <p className="text-gray-500 text-xs sm:text-sm">
                  Cumulative count of registered residents over time
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <label htmlFor="yearFilter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Year:</label>
                <select
                  id="yearFilter"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <div className="w-full h-64 sm:h-80 relative overflow-x-auto">
                  <svg width="100%" height="100%" className="overflow-visible min-w-[600px]" viewBox="0 0 1000 320" preserveAspectRatio="xMidYMid meet">
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
                          r="6"
                          fill="#1877F2"
                          stroke="white"
                          strokeWidth="2"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => {
                            setHoveredPoint({
                              x: x,
                              y: y,
                              data: d
                            });
                          }}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      );
                    })}
                    
                    {/* Tooltip */}
                    {hoveredPoint && (
                      <g>
                        {/* Tooltip background */}
                        <rect
                          x={hoveredPoint.x - 60}
                          y={hoveredPoint.y - 50}
                          width="120"
                          height="40"
                          rx="4"
                          fill="rgba(0, 0, 0, 0.8)"
                        />
                        {/* Tooltip text */}
                        <text
                          x={hoveredPoint.x}
                          y={hoveredPoint.y - 35}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="11"
                          fontWeight="600"
                        >
                          {hoveredPoint.data.date}
                        </text>
                        <text
                          x={hoveredPoint.x}
                          y={hoveredPoint.y - 20}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="10"
                        >
                          Residents: {hoveredPoint.data.count}
                        </text>
                        {/* Tooltip pointer */}
                        <polygon
                          points={`${hoveredPoint.x - 6},${hoveredPoint.y - 10} ${hoveredPoint.x + 6},${hoveredPoint.y - 10} ${hoveredPoint.x},${hoveredPoint.y - 4}`}
                          fill="rgba(0, 0, 0, 0.8)"
                        />
                      </g>
                    )}
                    
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

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 w-full mb-6 md:mb-8">
            {/* Pie Chart - Tenants vs Homeowners */}
            <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200">
              <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="text-gray-900 mb-1 sm:mb-2 text-base sm:text-lg font-semibold">Residents Distribution</h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label htmlFor="pieYearFilter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Year:</label>
                  <select
                    id="pieYearFilter"
                    value={pieChartYearFilter}
                    onChange={(e) => setPieChartYearFilter(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Years</option>
                    {availableYears.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {loading ? (
                <div className="w-full h-64 flex items-center justify-center text-gray-400">
                  <p>Loading...</p>
                </div>
              ) : stats.totalUsers > 0 ? (() => {
                // Filter by year if selected
                let homeownersCount = stats.homeownersCount;
                let tenantsCount = stats.tenantsCount;
                
                if (pieChartYearFilter) {
                  const yearData = tenantsByYear.get(parseInt(pieChartYearFilter));
                  if (yearData) {
                    homeownersCount = yearData.homeowners;
                    tenantsCount = yearData.tenants;
                  } else {
                    homeownersCount = 0;
                    tenantsCount = 0;
                  }
                }
                
                const pieData = [
                  { label: 'Homeowners', value: homeownersCount, color: '#10b981' },
                  { label: 'Tenants', value: tenantsCount, color: '#3b82f6' },
                ].filter(d => d.value > 0);
                
                if (pieData.length === 0) {
                  return (
                    <div className="w-full h-64 flex items-center justify-center text-gray-400">
                      <p>No data available for selected year</p>
                    </div>
                  );
                }
                
                const total = pieData.reduce((sum, d) => sum + d.value, 0);
                let currentAngle = -90;
                const radius = 80;
                const centerX = 120;
                const centerY = 120;
                
                return (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <svg width="240" height="240" viewBox="0 0 240 240" className="flex-shrink-0">
                      {pieData.map((segment, index) => {
                        const percentage = (segment.value / total) * 100;
                        const angle = (segment.value / total) * 360;
                        const startAngle = currentAngle;
                        const endAngle = currentAngle + angle;
                        
                        const x1 = centerX + radius * Math.cos((startAngle * Math.PI) / 180);
                        const y1 = centerY + radius * Math.sin((startAngle * Math.PI) / 180);
                        const x2 = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
                        const y2 = centerY + radius * Math.sin((endAngle * Math.PI) / 180);
                        
                        const largeArc = angle > 180 ? 1 : 0;
                        
                        const pathData = [
                          `M ${centerX} ${centerY}`,
                          `L ${x1} ${y1}`,
                          `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                          'Z'
                        ].join(' ');
                        
                        currentAngle += angle;
                        
                        return (
                          <path
                            key={index}
                            d={pathData}
                            fill={segment.color}
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                        );
                      })}
                    </svg>
                    <div className="flex-1 space-y-3">
                      {pieData.map((segment, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: segment.color }}></div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-700">{segment.label}</span>
                              <span className="text-sm font-semibold text-gray-900">{segment.value}</span>
                            </div>
                            <div className="text-xs text-gray-500">{((segment.value / total) * 100).toFixed(1)}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })() : (
                <div className="w-full h-64 flex items-center justify-center text-gray-400">
                  <p>No residents data available</p>
                </div>
              )}
            </div>

            {/* Bar Graph - Males vs Females by Year */}
            <div className="bg-white rounded-lg p-4 md:p-6 border border-gray-200">
              <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h2 className="text-gray-900 mb-1 sm:mb-2 text-base sm:text-lg font-semibold">Gender Distribution by Year</h2>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label htmlFor="barYearFilter" className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Filter Year:</label>
                  <select
                    id="barYearFilter"
                    value={barChartYearFilter}
                    onChange={(e) => setBarChartYearFilter(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Years</option>
                    {availableYears.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {loading ? (
                <div className="w-full h-64 flex items-center justify-center text-gray-400">
                  <p>Loading...</p>
                </div>
              ) : genderByYearData.length > 0 ? (() => {
                // Filter data by selected year
                let filteredData = genderByYearData;
                if (barChartYearFilter) {
                  filteredData = genderByYearData.filter(d => d.year === parseInt(barChartYearFilter));
                }
                
                if (filteredData.length === 0) {
                  return (
                    <div className="w-full h-64 flex items-center justify-center text-gray-400">
                      <p>No data available for selected year</p>
                    </div>
                  );
                }
                
                const maxValue = Math.max(...filteredData.flatMap(d => [d.male, d.female]), 1);
                const barWidth = 30;
                const maxBarHeight = 180;
                const spacing = 15;
                const groupSpacing = 40;
                const chartWidth = filteredData.length * (barWidth * 2 + spacing + groupSpacing) + spacing;
                
                return (
                  <div className="w-full overflow-x-auto">
                    <svg width="100%" height="280" viewBox={`0 0 ${chartWidth} 280`} className="overflow-visible">
                      {/* Grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                        const y = 20 + (maxBarHeight * (1 - ratio));
                        const value = Math.round(maxValue * ratio);
                        return (
                          <g key={i}>
                            <line
                              x1={spacing}
                              y1={y}
                              x2={chartWidth - spacing}
                              y2={y}
                              stroke="#e5e7eb"
                              strokeWidth="1"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={spacing - 5}
                              y={y}
                              textAnchor="end"
                              fill="#6b7280"
                              fontSize="11"
                              dominantBaseline="middle"
                            >
                              {value}
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* Bars */}
                      {filteredData.map((yearData, index) => {
                        const groupX = spacing + index * (barWidth * 2 + spacing + groupSpacing);
                        const maleX = groupX;
                        const femaleX = groupX + barWidth + spacing;
                        
                        const maleHeight = (yearData.male / maxValue) * maxBarHeight;
                        const femaleHeight = (yearData.female / maxValue) * maxBarHeight;
                        
                        const maleY = 20 + maxBarHeight - maleHeight;
                        const femaleY = 20 + maxBarHeight - femaleHeight;
                        
                        return (
                          <g key={yearData.year}>
                            {/* Male bar */}
                            <rect
                              x={maleX}
                              y={maleY}
                              width={barWidth}
                              height={maleHeight}
                              fill="#3b82f6"
                              rx="4"
                            />
                            {yearData.male > 0 && (
                              <text
                                x={maleX + barWidth / 2}
                                y={maleY - 5}
                                textAnchor="middle"
                                fill="#374151"
                                fontSize="11"
                                fontWeight="600"
                              >
                                {yearData.male}
                              </text>
                            )}
                            
                            {/* Female bar */}
                            <rect
                              x={femaleX}
                              y={femaleY}
                              width={barWidth}
                              height={femaleHeight}
                              fill="#ec4899"
                              rx="4"
                            />
                            {yearData.female > 0 && (
                              <text
                                x={femaleX + barWidth / 2}
                                y={femaleY - 5}
                                textAnchor="middle"
                                fill="#374151"
                                fontSize="11"
                                fontWeight="600"
                              >
                                {yearData.female}
                              </text>
                            )}
                            
                            {/* Year label */}
                            <text
                              x={groupX + barWidth + spacing / 2}
                              y={240}
                              textAnchor="middle"
                              fill="#6b7280"
                              fontSize="12"
                              fontWeight="500"
                            >
                              {yearData.year}
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* Legend */}
                      <g transform={`translate(${spacing}, 260)`}>
                        <rect x="0" y="0" width="12" height="12" fill="#3b82f6" rx="2" />
                        <text x="18" y="10" fill="#374151" fontSize="12" dominantBaseline="middle">Male</text>
                        <rect x="70" y="0" width="12" height="12" fill="#ec4899" rx="2" />
                        <text x="88" y="10" fill="#374151" fontSize="12" dominantBaseline="middle">Female</text>
                      </g>
                    </svg>
                  </div>
                );
              })() : (
                <div className="w-full h-64 flex items-center justify-center text-gray-400">
                  <p>No gender data available</p>
                </div>
              )}
            </div>
          </div>

          {/* Generate Report Modal */}
          {showReportModal && (
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={() => setShowReportModal(false)}>
              <div className="bg-white rounded-lg sm:rounded-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
                  <h3 className="m-0 text-gray-900 text-lg sm:text-xl font-semibold">Dashboard Report</h3>
                  <button 
                    className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                    onClick={() => setShowReportModal(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
                  <div className="mb-4">
                    <p className="text-xs sm:text-sm text-gray-600 mb-2">
                      Generated on: {new Date().toLocaleString()}
                    </p>
                  </div>
                {(() => {
                  const reportRows = [
                    { key: 'residents', label: 'Total Residents', total: stats.totalUsers, pending: '-', status: 'Active', badgeClass: 'bg-blue-100 text-blue-800' },
                    { key: 'billings', label: 'Total Billings', total: stats.totalBillings, pending: stats.pendingBillings, status: stats.pendingBillings > 0 ? 'Pending' : 'All Paid', badgeClass: 'bg-yellow-100 text-yellow-800' },
                    { key: 'complaints', label: 'Complaints', total: stats.totalComplaints, pending: stats.pendingComplaints, status: stats.pendingComplaints > 0 ? 'Pending' : 'Resolved', badgeClass: 'bg-red-100 text-red-800' },
                    { key: 'visitors', label: 'Visitors', total: stats.totalVisitors, pending: stats.pendingVisitors, status: stats.pendingVisitors > 0 ? 'Pending' : 'All Processed', badgeClass: 'bg-purple-100 text-purple-800' },
                    { key: 'vehicles', label: 'Registered Vehicles', total: stats.totalVehicles, pending: '-', status: 'Approved', badgeClass: 'bg-green-100 text-green-800' },
                    { key: 'maintenance', label: 'Maintenance Requests', total: stats.totalMaintenance, pending: stats.pendingMaintenance, status: stats.pendingMaintenance > 0 ? 'Pending' : 'All Processed', badgeClass: 'bg-indigo-100 text-indigo-800' },
                  ]

                  const totalPages = Math.max(1, Math.ceil(reportRows.length / REPORT_ITEMS_PER_PAGE))
                  const safePage = Math.min(reportPage, totalPages)
                  const startIndex = (safePage - 1) * REPORT_ITEMS_PER_PAGE
                  const paginatedRows = reportRows.slice(startIndex, startIndex + REPORT_ITEMS_PER_PAGE)

                  return (
                    <>
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
                        <table className="w-full border-collapse text-xs sm:text-sm min-w-[600px]">
                          <thead>
                            <tr className="bg-gray-50 border-b-2 border-gray-200">
                              <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Category</th>
                              <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Total</th>
                              <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Pending</th>
                              <th className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedRows.map((row) => (
                              <tr key={row.key} className="hover:bg-gray-50 border-b border-gray-100">
                                <td className="px-4 py-3 text-gray-700 font-medium">{row.label}</td>
                                <td className="px-4 py-3 text-gray-900">{row.total}</td>
                                <td className="px-4 py-3 text-gray-900">{row.pending}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${row.badgeClass}`}>{row.status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {reportRows.length > 0 && (
                        <div className="flex items-center justify-between mt-4 gap-3">
                          <span className="text-xs text-gray-600">
                            Page {safePage} of {totalPages}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              className="px-3 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => setReportPage((p) => Math.max(1, p - 1))}
                              disabled={safePage === 1}
                            >
                              Previous
                            </button>
                            <button
                              className="px-3 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => setReportPage((p) => Math.min(totalPages, p + 1))}
                              disabled={safePage === totalPages}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
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
                <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                  <button
                    className="bg-gray-900 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-gray-800 w-full sm:w-auto"
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
                    className="bg-gray-900 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-gray-800 w-full sm:w-auto"
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
