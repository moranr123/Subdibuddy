import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc, getDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

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
  status?: string;
  createdAt?: any;
  updatedAt?: any;
}

type FilterType = 
  | 'announcement' 
  | 'complaints' 
  | 'visitor-pre-registration' 
  | 'residents-applications' 
  | 'registered-residents' 
  | 'billings-payments' 
  | 'maintenance'
  | 'all';

function Archived() {
  const [user, setUser] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [archivedResidents, setArchivedResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
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

  const fetchArchivedResidents = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Fetching archived residents from Firestore...');
      
      const residentsData: Resident[] = [];
      let querySnapshot;
      
      try {
        // Try to query with archivedAt orderBy first
        const q = query(
          collection(db, 'archivedUsers'),
          orderBy('archivedAt', 'desc')
        );
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy archivedAt failed, trying createdAt:', orderByError);
        try {
          // Fallback: try with createdAt
          const q = query(
            collection(db, 'archivedUsers'),
            orderBy('createdAt', 'desc')
          );
          querySnapshot = await getDocs(q);
        } catch (orderByError2: any) {
          console.warn('orderBy createdAt failed, trying without orderBy:', orderByError2);
          // Final fallback: query without orderBy
          querySnapshot = await getDocs(collection(db, 'archivedUsers'));
        }
      }
      
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        console.log('Processing archived resident:', docSnapshot.id, { role: data.role, status: data.status });
        // Filter out superadmin accounts - only include residents
        if (data.role === 'superadmin') {
          console.log('Skipping superadmin:', docSnapshot.id);
          return;
        }
        residentsData.push({
          id: docSnapshot.id,
          ...data,
        } as Resident);
      });
      
      // Sort manually - prefer archivedAt, fallback to createdAt
      residentsData.sort((a, b) => {
        const aDate = (a as any).archivedAt?.toDate 
          ? (a as any).archivedAt.toDate().getTime() 
          : (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
        const bDate = (b as any).archivedAt?.toDate 
          ? (b as any).archivedAt.toDate().getTime() 
          : (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
        return bDate - aDate;
      });
      
      console.log(`Fetched ${residentsData.length} archived residents from archivedUsers collection`);
      console.log('Archived residents data:', residentsData);
      setArchivedResidents(residentsData);
    } catch (error: any) {
      console.error('Error fetching archived residents:', error);
      alert(`Failed to load archived residents: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    if (user && activeFilter === 'registered-residents' && db) {
      console.log('Fetching archived residents for registered-residents filter');
      fetchArchivedResidents();
    } else if (activeFilter !== 'registered-residents') {
      // Clear archived residents when switching to a different filter
      setArchivedResidents([]);
    }
  }, [user, activeFilter, db, fetchArchivedResidents]);

  const handleRestore = useCallback(async (residentId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to restore this resident? They will be moved back to registered residents.')) {
      return;
    }
    
    setProcessingStatus(residentId);
    try {
      // Get the resident data from archivedUsers collection
      const archivedRef = doc(db, 'archivedUsers', residentId);
      const archivedDoc = await getDoc(archivedRef);
      
      if (!archivedDoc.exists()) {
        throw new Error('Archived resident not found');
      }
      
      const residentData = archivedDoc.data();
      
      // Remove archivedAt field and update status
      const { archivedAt, ...restoredData } = residentData;
      
      // Move back to users collection
      await setDoc(doc(db, 'users', residentId), {
        ...restoredData,
        status: 'approved',
        updatedAt: Timestamp.now(),
      });
      
      // Delete from archivedUsers collection
      await deleteDoc(archivedRef);
      
      // Update local state - remove from archived list
      setArchivedResidents(prev => prev.filter(r => r.id !== residentId));
      
      alert('Resident restored successfully');
    } catch (error: any) {
      console.error('Error restoring resident:', error);
      alert(`Failed to restore resident: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleViewDetails = useCallback((resident: Resident) => {
    setSelectedResident(resident);
    setShowDetailsModal(true);
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      return 'N/A';
    }
  };

  const filters = [
    { id: 'all' as FilterType, label: 'All' },
    { id: 'announcement' as FilterType, label: 'Announcement' },
    { id: 'complaints' as FilterType, label: 'Complaints' },
    { id: 'visitor-pre-registration' as FilterType, label: 'Visitor Pre-registration' },
    { id: 'residents-applications' as FilterType, label: 'Residents Applications' },
    { id: 'registered-residents' as FilterType, label: 'Registered Residents' },
    { id: 'billings-payments' as FilterType, label: 'Billings & Payments' },
    { id: 'maintenance' as FilterType, label: 'Maintenance' },
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-white w-full">
        <Header title="Archived" />

        <main className="w-full max-w-full m-0 p-10 box-border">
          <div className="flex flex-col gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-8 border border-gray-100 shadow-sm">
              <h2 className="m-0 text-gray-900 text-lg font-normal mb-6">Filter by Category</h2>
              
              <div className="flex flex-wrap gap-3 mb-6">
                {filters.map((filter) => (
                  <button
                    key={filter.id}
                    className={`px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all ${
                      activeFilter === filter.id
                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => setActiveFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="mt-8">
                {activeFilter === 'all' && (
                  <div className="text-center py-20 px-5 text-gray-600">
                    <p className="text-base font-normal text-gray-600">
                      Select a category to view archived items
                    </p>
                  </div>
                )}
                {activeFilter === 'registered-residents' && (
                  <>
                    {loading && archivedResidents.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived residents...</div>
                    ) : archivedResidents.length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          No archived residents found.
                        </p>
                        <p className="text-xs text-gray-400 mt-2.5">
                          Archived residents will appear here.
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
                            {archivedResidents.map((resident) => {
                              // Construct full name from firstName, middleName, lastName if fullName doesn't exist
                              const fullName = resident.fullName || 
                                [resident.firstName, resident.middleName, resident.lastName]
                                  .filter(Boolean)
                                  .join(' ') || 'N/A';
                              
                              return (
                              <tr key={resident.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600">{fullName}</td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                                  {resident.email || resident.phone || 'N/A'}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">Archived</span>
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
                                    <button
                                      className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => handleRestore(resident.id)}
                                      disabled={processingStatus === resident.id}
                                    >
                                      {processingStatus === resident.id ? 'Processing...' : 'Restore'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
                {activeFilter !== 'all' && activeFilter !== 'registered-residents' && (
                  <div className="text-center py-20 px-5 text-gray-600">
                    <p className="text-base font-normal text-gray-600">
                      Archived {filters.find(f => f.id === activeFilter)?.label} items will appear here
                    </p>
                    <p className="text-xs text-gray-400 mt-2.5">
                      This feature is coming soon.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {showDetailsModal && selectedResident && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={() => setShowDetailsModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Archived Resident Details</h3>
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
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">Archived</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Full Name</label>
                    <p className="text-gray-900 font-medium">
                      {selectedResident.fullName || 
                        [selectedResident.firstName, selectedResident.middleName, selectedResident.lastName]
                          .filter(Boolean)
                          .join(' ') || 'N/A'}
                    </p>
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
                <button
                  className="bg-green-600 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    handleRestore(selectedResident.id);
                    setShowDetailsModal(false);
                  }}
                  disabled={processingStatus === selectedResident.id}
                >
                  {processingStatus === selectedResident.id ? 'Processing...' : 'Restore'}
                </button>
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

export default memo(Archived);

