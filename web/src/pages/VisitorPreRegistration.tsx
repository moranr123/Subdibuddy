import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, updateDoc, doc } from 'firebase/firestore';
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

  const handleStatusChange = useCallback(async (visitorId: string, newStatus: Visitor['status']) => {
    if (!db) return;
    
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

  const filteredVisitors = visitors.filter(visitor => {
    const matchesSearch = 
      visitor.visitorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visitor.visitorEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visitor.residentEmail.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || visitor.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title="Visitor Pre-Registration" />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="m-0 text-gray-900 text-lg font-normal">Gate Pass Management</h2>
                <button 
                  className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={fetchVisitors} 
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-md text-sm transition-colors focus:outline-none focus:border-primary"
                  placeholder="Search by name, email, or resident..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="px-4 py-2.5 border border-gray-200 rounded-md text-sm bg-white cursor-pointer transition-colors focus:outline-none focus:border-primary"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {loading && visitors.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading visitors...</div>
              ) : filteredVisitors.length === 0 ? (
                <div className="text-center py-20 px-5 text-gray-600">
                  <p className="text-base font-normal text-gray-600">No visitors found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Date</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Visitor Name</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Visitor Email</th>
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
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorEmail}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorPhone}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top max-w-[200px] break-words whitespace-pre-wrap">
                            {visitor.visitorPurpose}
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorDate} {visitor.visitorTime}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.residentEmail}</td>
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
                                className="px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 cursor-pointer transition-colors hover:border-primary focus:outline-none focus:border-primary focus:shadow-[0_0_0_2px_rgba(30,64,175,0.1)]"
                                value={visitor.status}
                                onChange={(e) => handleStatusChange(visitor.id, e.target.value as Visitor['status'])}
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
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}

export default memo(VisitorPreRegistration);
