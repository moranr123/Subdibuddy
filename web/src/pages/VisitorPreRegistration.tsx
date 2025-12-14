import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, updateDoc, doc, getDoc, addDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

interface Visitor {
  id: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  visitorPurpose: string;
  visitorDate: string;
  visitorTime: string;
  residentId: string;
  residentEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  gatePassVerified: boolean;
  createdAt: any;
  updatedAt?: any;
}

function VisitorPreRegistration() {
  const [user, setUser] = useState<any>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [residentNames, setResidentNames] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check if user is a superadmin
        const isAdmin = await isSuperadmin(currentUser);
        if (isAdmin) {
          setUser(currentUser);
        } else {
          // User is not a superadmin, sign them out and redirect
          await auth.signOut();
          navigate('/');
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const fetchVisitors = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Fetching visitors from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'visitors'), orderBy('createdAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(collection(db, 'visitors'));
      }
      
      const visitorsData: Visitor[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        visitorsData.push({
          id: doc.id,
          ...data,
        } as Visitor);
      });
      
      visitorsData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${visitorsData.length} visitors`);
      setVisitors(visitorsData);
    } catch (error: any) {
      console.error('Error fetching visitors:', error);
      alert(`Failed to load visitors: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    if (user) {
      console.log('User authenticated, fetching visitors...', { userEmail: user.email, dbExists: !!db });
      if (db) {
        fetchVisitors();
      } else {
        console.error('Firestore db is not available');
        alert('Database connection error. Please refresh the page.');
      }
    }
  }, [user, db, fetchVisitors]);

  // Fetch resident names
  useEffect(() => {
    if (!db || visitors.length === 0) return;

    const fetchResidentNames = async () => {
      const residentIds = [...new Set(visitors.map(v => v.residentId))];
      const namesMap: Record<string, string> = {};

      for (const residentId of residentIds) {
        if (residentNames[residentId]) {
          namesMap[residentId] = residentNames[residentId];
          continue;
        }

        try {
          const userDoc = await getDoc(doc(db, 'users', residentId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const fullName = userData.fullName || 
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              userData.email ||
              'Unknown Resident';
            namesMap[residentId] = fullName;
          } else {
            namesMap[residentId] = visitors.find(v => v.residentId === residentId)?.residentEmail || 'Unknown Resident';
          }
        } catch (error) {
          console.error(`Error fetching resident ${residentId}:`, error);
          namesMap[residentId] = visitors.find(v => v.residentId === residentId)?.residentEmail || 'Unknown Resident';
        }
      }

      setResidentNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchResidentNames();
  }, [db, visitors]);

  const handleStatusChange = useCallback(async (visitorId: string, newStatus: Visitor['status'], currentStatus: Visitor['status']) => {
    if (!db) return;
    
    // Prevent changing status if already approved or rejected
    if (currentStatus === 'approved' || currentStatus === 'rejected') {
      alert('Cannot change status. This visitor registration has already been approved or rejected.');
      return;
    }
    
    // Show confirmation dialog when approving
    if (newStatus === 'approved') {
      const confirmed = window.confirm('Are you sure you want to approve this visitor registration? This action will notify the resident.');
      if (!confirmed) {
        return;
      }
    }
    
    // Show confirmation dialog when rejecting
    if (newStatus === 'rejected') {
      const confirmed = window.confirm('Are you sure you want to reject this visitor registration? This action will notify the resident.');
      if (!confirmed) {
        return;
      }
    }
    
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        status: newStatus,
        updatedAt: new Date(),
      });
      await fetchVisitors();
    } catch (error) {
      console.error('Error updating visitor status:', error);
      alert('Failed to update visitor status');
    }
  }, [db, fetchVisitors]);

  const handleVerifyGatePass = useCallback(async (visitorId: string) => {
    if (!db) return;
    
    if (!window.confirm('Verify this gate pass? The visitor will be marked as verified.')) {
      return;
    }
    
    try {
      await updateDoc(doc(db, 'visitors', visitorId), {
        gatePassVerified: true,
        updatedAt: new Date(),
      });
      await fetchVisitors();
      alert('Gate pass verified successfully!');
    } catch (error) {
      console.error('Error verifying gate pass:', error);
      alert('Failed to verify gate pass');
    }
  }, [db, fetchVisitors]);

  const handleArchive = useCallback(async (visitorId: string) => {
    if (!db) return;
    
    const confirmed = window.confirm('Are you sure you want to archive this visitor registration? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      // Get visitor data
      const visitorDoc = await getDoc(doc(db, 'visitors', visitorId));
      if (!visitorDoc.exists()) {
        alert('Visitor registration not found');
        return;
      }

      const visitorData = visitorDoc.data();
      
      // Move to archived visitors collection
      await addDoc(collection(db, 'archivedVisitors'), {
        ...visitorData,
        originalId: visitorId,
        archivedAt: Timestamp.now(),
        archivedBy: user?.uid || 'unknown',
      });

      // Delete from active visitors
      await deleteDoc(doc(db, 'visitors', visitorId));

      // Remove from active visitors list
      setVisitors(prev => prev.filter(v => v.id !== visitorId));
      
      alert('Visitor registration archived successfully');
      
      // Navigate to archived screen with visitors filter
      navigate('/archived?filter=visitors');
    } catch (error) {
      console.error('Error archiving visitor registration:', error);
      alert('Failed to archive visitor registration');
    }
  }, [db, user, navigate]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFA500';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#1e40af';
      default: return '#666666';
    }
  };

  const handleDateFilter = useCallback(() => {
    setShowDateFilter(!showDateFilter);
  }, [showDateFilter]);

  const handleClearDateFilter = useCallback(() => {
    setFilterDate('');
    setShowDateFilter(false);
  }, []);

  const filteredVisitors = visitors.filter(visitor => {
    // Apply status filter
    const matchesStatus = filterStatus === 'all' || visitor.status === filterStatus;
    
    // Apply date filter
    let matchesDate = true;
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      
      const visitorDate = visitor.createdAt?.toDate 
        ? visitor.createdAt.toDate() 
        : visitor.createdAt 
        ? new Date(visitor.createdAt) 
        : null;
      
      if (visitorDate) {
        const visitorDateOnly = new Date(visitorDate.getFullYear(), visitorDate.getMonth(), visitorDate.getDate());
        matchesDate = visitorDateOnly.getTime() === selectedDateOnly.getTime();
      } else {
        matchesDate = false;
      }
    }
    
    // Apply search filter
    let matchesSearch = true;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const residentName = residentNames[visitor.residentId] || visitor.residentEmail || '';
      matchesSearch = 
        visitor.visitorName.toLowerCase().includes(query) ||
        residentName.toLowerCase().includes(query) ||
        visitor.residentEmail.toLowerCase().includes(query) ||
        visitor.visitorPhone.toLowerCase().includes(query) ||
        visitor.visitorPurpose.toLowerCase().includes(query);
    }
    
    return matchesStatus && matchesDate && matchesSearch;
  });

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title="Visitor Pre-Registration" />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
                <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">Gate Pass Management</h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 md:px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-48 md:w-64"
                  />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 md:px-4 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-auto"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button
                    className="px-3 md:px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-200 whitespace-nowrap"
                    onClick={handleDateFilter}
                  >
                    Filter by Date
                  </button>
                </div>
              </div>

              {showDateFilter && (
                <div className="mb-4 md:mb-6 p-3 md:p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4">
                    <div className="w-full sm:w-48">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
                      <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <button
                      className="px-4 py-2 bg-gray-500 text-white rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-600 whitespace-nowrap"
                      onClick={handleClearDateFilter}
                    >
                      Clear
                    </button>
                  </div>
                  {(filterDate || searchQuery) && (
                    <div className="mt-2 text-xs text-gray-600">
                      Showing {filteredVisitors.length} of {visitors.length} visitors
                    </div>
                  )}
                </div>
              )}

              {loading && visitors.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading visitors...</div>
              ) : filteredVisitors.length === 0 ? (
                <div className="text-center py-20 px-5 text-gray-600">
                  <p className="text-base font-normal text-gray-600">No visitors found.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {filteredVisitors.map((visitor) => (
                      <div key={visitor.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm mb-1">{visitor.visitorName}</h3>
                            <p className="text-xs text-gray-500 mb-2">{formatDate(visitor.createdAt)}</p>
                          </div>
                          <span
                            className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block flex-shrink-0"
                            style={{ backgroundColor: getStatusColor(visitor.status) }}
                          >
                            {visitor.status.toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="space-y-2 mb-3">
                          <div>
                            <span className="text-xs font-medium text-gray-600">Phone: </span>
                            <span className="text-xs text-gray-900">{visitor.visitorPhone}</span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-600">Purpose: </span>
                            <p className="text-xs text-gray-900 mt-1 break-words whitespace-pre-wrap">{visitor.visitorPurpose}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-600">Visit Date/Time: </span>
                            <span className="text-xs text-gray-900">{visitor.visitorDate} {visitor.visitorTime}</span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-600">Resident: </span>
                            <span className="text-xs text-gray-900">{residentNames[visitor.residentId] || visitor.residentEmail || 'Unknown Resident'}</span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-600">Gate Pass: </span>
                            {visitor.gatePassVerified ? (
                              <span className="text-xs text-green-600 font-semibold">✓ Verified</span>
                            ) : (
                              <span className="text-xs text-orange-600 font-semibold">Not Verified</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-3 border-t border-gray-200">
                          <select
                            className={`px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 transition-colors hover:border-primary focus:outline-none focus:border-primary w-full ${
                              visitor.status === 'approved' || visitor.status === 'rejected' 
                                ? 'cursor-not-allowed opacity-60 bg-gray-100' 
                                : 'cursor-pointer'
                            }`}
                            value={visitor.status}
                            onChange={(e) => handleStatusChange(visitor.id, e.target.value as Visitor['status'], visitor.status)}
                            disabled={visitor.status === 'approved' || visitor.status === 'rejected'}
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approve</option>
                            <option value="rejected">Reject</option>
                          </select>
                          {visitor.status === 'approved' && !visitor.gatePassVerified && (
                            <button
                              className="w-full px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-[#45a049] transition-colors"
                              onClick={() => handleVerifyGatePass(visitor.id)}
                            >
                              Verify Gate Pass
                            </button>
                          )}
                          {(visitor.status === 'approved' || visitor.status === 'rejected') && (
                            <button
                              className="w-full px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
                              onClick={() => handleArchive(visitor.id)}
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto w-full">
                    <table className="w-full border-collapse text-sm min-w-[800px]">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Date</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Visitor Name</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Visitor Phone</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Purpose</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Visit Date/Time</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Resident</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Gate Pass</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVisitors.map((visitor) => (
                          <tr key={visitor.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(visitor.createdAt)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorName}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorPhone}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top max-w-[200px] break-words whitespace-pre-wrap">
                              {visitor.visitorPurpose}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorDate} {visitor.visitorTime}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{residentNames[visitor.residentId] || visitor.residentEmail || 'Unknown Resident'}</td>
                            <td className="px-4 py-4 border-b border-gray-100 align-top">
                              <span
                                className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                                style={{ backgroundColor: getStatusColor(visitor.status) }}
                              >
                                {visitor.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 align-top">
                              {visitor.gatePassVerified ? (
                                <span className="px-2.5 py-1 rounded bg-green-500 text-white text-xs font-semibold">✓ Verified</span>
                              ) : (
                                <span className="px-2.5 py-1 rounded bg-orange-500 text-white text-xs font-semibold">Not Verified</span>
                              )}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 align-top">
                              <div className="flex flex-col gap-2">
                                <select
                                  className={`px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 transition-colors hover:border-primary focus:outline-none focus:border-primary focus:shadow-[0_0_0_2px_rgba(30,64,175,0.1)] ${
                                    visitor.status === 'approved' || visitor.status === 'rejected' 
                                      ? 'cursor-not-allowed opacity-60 bg-gray-100' 
                                      : 'cursor-pointer'
                                  }`}
                                  value={visitor.status}
                                  onChange={(e) => handleStatusChange(visitor.id, e.target.value as Visitor['status'], visitor.status)}
                                  disabled={visitor.status === 'approved' || visitor.status === 'rejected'}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="approved">Approve</option>
                                  <option value="rejected">Reject</option>
                                </select>
                                {visitor.status === 'approved' && !visitor.gatePassVerified && (
                                  <button
                                    className="bg-green-500 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-[#45a049]"
                                    onClick={() => handleVerifyGatePass(visitor.id)}
                                  >
                                    Verify Gate Pass
                                  </button>
                                )}
                                {(visitor.status === 'approved' || visitor.status === 'rejected') && (
                                  <button
                                    className="bg-gray-500 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-600"
                                    onClick={() => handleArchive(visitor.id)}
                                  >
                                    Archive
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}

export default memo(VisitorPreRegistration);
