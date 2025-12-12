import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import Layout from '../components/Layout';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface Resident {
  id: string;
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthdate?: any;
  age?: number;
  sex?: string;
  address?: {
    block?: string;
    lot?: string;
    street?: string;
  };
  isTenant?: boolean;
  tenantRelation?: string;
  idFront?: string;
  idBack?: string;
  documents?: Record<string, string>;
  location?: UserLocation;
  status?: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
  updatedAt?: any;
}

function ResidentManagement() {
  const [user, setUser] = useState<any>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<UserLocation | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'applications' | 'registered'>('applications');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const fetchResidents = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Fetching residents from Firestore...');
      
      const residentsData: Resident[] = [];
      
      // Fetch based on active tab
      if (activeTab === 'applications') {
        // Fetch from pendingUsers collection
        let querySnapshot;
        try {
          const q = query(collection(db, 'pendingUsers'), orderBy('createdAt', 'desc'));
          querySnapshot = await getDocs(q);
        } catch (orderByError: any) {
          console.warn('orderBy failed, trying without orderBy:', orderByError);
          querySnapshot = await getDocs(collection(db, 'pendingUsers'));
        }
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          residentsData.push({
            id: doc.id,
            ...data,
            status: 'pending', // All pendingUsers are pending
          } as Resident);
        });
      } else {
        // Fetch from users collection (approved residents)
        let querySnapshot;
        try {
          const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
          querySnapshot = await getDocs(q);
        } catch (orderByError: any) {
          console.warn('orderBy failed, trying without orderBy:', orderByError);
          querySnapshot = await getDocs(collection(db, 'users'));
        }
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Filter out superadmin accounts - only include residents
          if (data.role === 'superadmin') {
            console.log('Skipping superadmin:', doc.id);
            return;
          }
          residentsData.push({
            id: doc.id,
            ...data,
            status: 'approved', // All users are approved
          } as Resident);
        });
      }
      
      // Sort manually if orderBy failed
      residentsData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${residentsData.length} residents from ${activeTab === 'applications' ? 'pendingUsers' : 'users'}`);
      setResidents(residentsData);
    } catch (error: any) {
      console.error('Error fetching residents:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      alert(`Failed to load residents: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [db, activeTab]);

  useEffect(() => {
    if (user) {
      console.log('User authenticated, fetching residents...', { userEmail: user.email, dbExists: !!db });
      if (db) {
        fetchResidents();
      } else {
        console.error('Firestore db is not available');
        alert('Database connection error. Please refresh the page.');
      }
    }
  }, [user, db, fetchResidents]);

  const handleLocationClick = useCallback((location: UserLocation) => {
    setSelectedLocation(location);
    setShowMapModal(true);
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  const handleViewDetails = useCallback((resident: Resident) => {
    setSelectedResident(resident);
    setShowDetailsModal(true);
  }, []);

  const handleApprove = useCallback(async (residentId: string) => {
    if (!db || !auth) return;
    
    setProcessingStatus(residentId);
    try {
      // Get the pending user data
      const pendingUserRef = doc(db, 'pendingUsers', residentId);
      const pendingUserSnap = await getDoc(pendingUserRef);
      
      if (!pendingUserSnap.exists()) {
        throw new Error('Pending user not found');
      }
      
      const pendingUserData = pendingUserSnap.data();
      const { username, password, ...userData } = pendingUserData;
      
      if (!username || !password) {
        throw new Error('Missing username or password in pending user data');
      }
      
      // Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, username, password);
      const user = userCredential.user;
      
      // Move to users collection with the Firebase Auth UID
      await setDoc(doc(db, 'users', user.uid), {
        ...userData,
        status: 'approved',
        updatedAt: Timestamp.now(),
      });
      
      // Delete from pendingUsers collection
      await deleteDoc(pendingUserRef);
      
      // Update local state - remove from list
      setResidents(prev => prev.filter(r => r.id !== residentId));
      
      alert('Resident approved successfully');
    } catch (error: any) {
      console.error('Error approving resident:', error);
      let errorMessage = `Failed to approve resident: ${error.message}`;
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email or phone number is already registered. Please check the pending user data.';
      }
      alert(errorMessage);
    } finally {
      setProcessingStatus(null);
    }
  }, [db, auth]);

  const handleReject = useCallback(async (residentId: string) => {
    if (!db) return;
    
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      return;
    }
    
    setProcessingStatus(residentId);
    try {
      // Delete from pendingUsers collection (rejected applications are removed)
      await deleteDoc(doc(db, 'pendingUsers', residentId));
      
      // Update local state - remove from list
      setResidents(prev => prev.filter(r => r.id !== residentId));
      
      alert('Application rejected and removed');
    } catch (error: any) {
      console.error('Error rejecting resident:', error);
      alert(`Failed to reject application: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">Rejected</span>;
      case 'pending':
      default:
        return <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>;
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-white w-full">
        <header className="bg-white text-gray-900 py-4 border-b border-gray-200 sticky top-0 z-[100]">
          <div className="w-full m-0 px-8 flex justify-between items-center">
            <h1 className="text-xl m-0 text-gray-900 font-normal">Resident Management</h1>
            <div className="flex items-center gap-5">
              <span className="text-sm text-gray-500 font-normal">{user?.email || ''}</span>
            </div>
          </div>
        </header>

        <main className="w-full max-w-full m-0 p-10 box-border">
          <div className="flex flex-col gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-8 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="m-0 text-gray-900 text-lg font-normal">Residents</h2>
                <button 
                  className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={fetchResidents} 
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {/* Tab Buttons */}
              <div className="flex gap-2 mb-6 border-b border-gray-200">
                <button
                  className={`px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === 'applications'
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveTab('applications')}
                >
                  Applications
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === 'registered'
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveTab('registered')}
                >
                  Registered
                </button>
              </div>

              {(() => {
                // No need to filter - residents are already fetched from the correct collection
                const filteredResidents = residents;

                return (
                  <>
                    {loading && residents.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading residents...</div>
                    ) : filteredResidents.length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          {activeTab === 'applications' 
                            ? 'No pending applications found.' 
                            : 'No registered residents found.'}
                        </p>
                        <p className="text-xs text-gray-400 mt-2.5">
                          {activeTab === 'applications'
                            ? 'New signups will appear here for approval.'
                            : 'Approved residents will appear here.'}
                        </p>
                      </div>
                    ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Full Name</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Email/Phone</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Created At</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResidents.map((resident) => (
                        <tr key={resident.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">{resident.fullName || 'N/A'}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                            {resident.email || resident.phone || 'N/A'}
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                            {getStatusBadge(resident.status)}
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">{formatDate(resident.createdAt)}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                            <div className="flex gap-2 items-center">
                              <button
                                className="bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                onClick={() => handleViewDetails(resident)}
                              >
                                View Details
                              </button>
                              {resident.status === 'pending' && (
                                <>
                                  <button
                                    className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => handleApprove(resident.id)}
                                    disabled={processingStatus === resident.id}
                                  >
                                    {processingStatus === resident.id ? 'Processing...' : 'Approve'}
                                  </button>
                                  <button
                                    className="bg-red-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => handleReject(resident.id)}
                                    disabled={processingStatus === resident.id}
                                  >
                                    {processingStatus === resident.id ? 'Processing...' : 'Reject'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </main>

        {showMapModal && selectedLocation && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={() => setShowMapModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Resident Location</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => setShowMapModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="w-full h-[500px] relative overflow-hidden">
                <iframe
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedLocation.longitude - 0.01},${selectedLocation.latitude - 0.01},${selectedLocation.longitude + 0.01},${selectedLocation.latitude + 0.01}&layer=mapnik&marker=${selectedLocation.latitude},${selectedLocation.longitude}`}
                  width="100%"
                  height="100%"
                  style={{ border: 'none' }}
                  title="Resident Location Map"
                />
              </div>
              <div className="px-6 py-5 border-t border-gray-200 flex justify-between items-center">
                <p className="m-0 text-gray-600 text-sm">
                  Coordinates: {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </p>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${selectedLocation.latitude}&mlon=${selectedLocation.longitude}&zoom=15`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-white no-underline px-5 py-2.5 rounded-md text-sm font-medium transition-all inline-block hover:bg-primary-dark hover:-translate-y-0.5"
                >
                  Open in OpenStreetMap
                </a>
              </div>
            </div>
          </div>
        )}

        {showDetailsModal && selectedResident && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={() => setShowDetailsModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Resident Details</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => setShowDetailsModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                    <div>{getStatusBadge(selectedResident.status)}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Full Name</label>
                    <p className="text-gray-900 font-medium">{selectedResident.fullName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">First Name</label>
                    <p className="text-gray-900">{selectedResident.firstName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Middle Name</label>
                    <p className="text-gray-900">{selectedResident.middleName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Last Name</label>
                    <p className="text-gray-900">{selectedResident.lastName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Email</label>
                    <p className="text-gray-900">{selectedResident.email || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
                    <p className="text-gray-900">{selectedResident.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Birthdate</label>
                    <p className="text-gray-900">{formatDate(selectedResident.birthdate)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Age</label>
                    <p className="text-gray-900">{selectedResident.age || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Sex</label>
                    <p className="text-gray-900">{selectedResident.sex ? (selectedResident.sex === 'male' ? 'Male' : 'Female') : 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Block</label>
                    <p className="text-gray-900">{selectedResident.address?.block || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Lot</label>
                    <p className="text-gray-900">{selectedResident.address?.lot || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Street</label>
                    <p className="text-gray-900">{selectedResident.address?.street || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Is Tenant</label>
                    <p className="text-gray-900">{selectedResident.isTenant ? 'Yes' : 'No'}</p>
                  </div>
                  {selectedResident.isTenant && (
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Tenant Relation</label>
                      <p className="text-gray-900">{selectedResident.tenantRelation || 'N/A'}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Created At</label>
                    <p className="text-gray-900">{formatDate(selectedResident.createdAt)}</p>
                  </div>
                </div>

                {selectedResident.idFront && (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">ID Front</label>
                    <img src={selectedResident.idFront} alt="ID Front" className="max-w-full h-auto rounded border border-gray-200" />
                  </div>
                )}

                {selectedResident.idBack && (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">ID Back</label>
                    <img src={selectedResident.idBack} alt="ID Back" className="max-w-full h-auto rounded border border-gray-200" />
                  </div>
                )}

                {selectedResident.documents && Object.keys(selectedResident.documents).length > 0 && (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Documents</label>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(selectedResident.documents).map(([key, url]) => (
                        <div key={key}>
                          <label className="text-xs text-gray-600 mb-1 block">{key.replace('doc', 'Document ')}</label>
                          <img src={url} alt={key} className="max-w-full h-auto rounded border border-gray-200" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 py-5 border-t border-gray-200 flex justify-end gap-3">
                {selectedResident.status === 'pending' && (
                  <>
                    <button
                      className="bg-green-600 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-green-700"
                      onClick={() => {
                        handleApprove(selectedResident.id);
                        setShowDetailsModal(false);
                      }}
                      disabled={processingStatus === selectedResident.id}
                    >
                      {processingStatus === selectedResident.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      className="bg-red-600 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-red-700"
                      onClick={() => {
                        handleReject(selectedResident.id);
                        setShowDetailsModal(false);
                      }}
                      disabled={processingStatus === selectedResident.id}
                    >
                      {processingStatus === selectedResident.id ? 'Processing...' : 'Reject'}
                    </button>
                  </>
                )}
                <button
                  className="bg-gray-900 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-gray-800"
                  onClick={() => setShowDetailsModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default memo(ResidentManagement);
