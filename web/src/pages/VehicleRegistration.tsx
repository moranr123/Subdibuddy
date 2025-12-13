import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, updateDoc, doc, addDoc, Timestamp, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

interface VehicleRegistration {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  color: string;
  year: string;
  vehicleType: string;
  registrationImageURL?: string;
  vehicleImageURL?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  userId: string;
  userEmail: string;
  createdAt: any;
  updatedAt?: any;
}

interface UserData {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
}

function VehicleRegistration() {
  const [user, setUser] = useState<any>(null);
  const [registrations, setRegistrations] = useState<VehicleRegistration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<VehicleRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingRegistration, setViewingRegistration] = useState<VehicleRegistration | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [filterDate, setFilterDate] = useState<string>('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active view from URL
  const activeView = location.pathname.includes('/registered') ? 'registered' : 'applications';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const isAdmin = await isSuperadmin(currentUser);
        if (isAdmin) {
          setUser(currentUser);
        } else {
          await auth.signOut();
          navigate('/');
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user || !db) {
      setRegistrations([]);
      setLoading(false);
      return;
    }

    console.log('Setting up real-time listener for vehicle registrations...');
    setLoading(true);

    let q;
    try {
      q = query(collection(db, 'vehicleRegistrations'), orderBy('createdAt', 'desc'));
    } catch (error) {
      q = query(collection(db, 'vehicleRegistrations'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const registrationsData: VehicleRegistration[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        registrationsData.push({
          id: doc.id,
          ...data,
        } as VehicleRegistration);
      });
      
      registrationsData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      // Filter based on active view
      const filtered = activeView === 'applications' 
        ? registrationsData.filter(r => r.status === 'pending' || r.status === 'rejected')
        : registrationsData.filter(r => r.status === 'approved');
      
      console.log(`Received ${filtered.length} vehicle registrations for ${activeView} (real-time update)`);
      setRegistrations(filtered);
      setLoading(false);
    }, (error: any) => {
      console.error('Error listening to vehicle registrations:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, db, activeView]);

  // Fetch user names
  useEffect(() => {
    if (!db || registrations.length === 0) return;

    const fetchUserNames = async () => {
      const userIds = [...new Set(registrations.map(r => r.userId))];
      const namesMap: Record<string, string> = {};

      for (const userId of userIds) {
        if (userNames[userId]) {
          namesMap[userId] = userNames[userId];
          continue;
        }

        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const fullName = userData.fullName || 
              `${userData.firstName || ''} ${userData.lastName || ''}`.trim() ||
              userData.email ||
              'Unknown User';
            namesMap[userId] = fullName;
          } else {
            namesMap[userId] = registrations.find(r => r.userId === userId)?.userEmail || 'Unknown User';
          }
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          namesMap[userId] = registrations.find(r => r.userId === userId)?.userEmail || 'Unknown User';
        }
      }

      setUserNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchUserNames();
  }, [db, registrations]);

  const applyFilters = useCallback((registrationsList: VehicleRegistration[]) => {
    let filtered = registrationsList;

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((registration) => {
        const registrationDate = registration.createdAt?.toDate 
          ? registration.createdAt.toDate() 
          : registration.createdAt 
          ? new Date(registration.createdAt) 
          : null;
        
        if (!registrationDate) return false;

        const registrationDateOnly = new Date(registrationDate.getFullYear(), registrationDate.getMonth(), registrationDate.getDate());
        
        return registrationDateOnly.getTime() === selectedDateOnly.getTime();
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((registration) => {
        const userName = userNames[registration.userId] || registration.userEmail || '';
        const plateNumber = registration.plateNumber || '';
        const make = registration.make || '';
        const model = registration.model || '';
        const vehicleType = registration.vehicleType || '';
        
        return (
          userName.toLowerCase().includes(query) ||
          plateNumber.toLowerCase().includes(query) ||
          make.toLowerCase().includes(query) ||
          model.toLowerCase().includes(query) ||
          vehicleType.toLowerCase().includes(query)
        );
      });
    }

    setFilteredRegistrations(filtered);
  }, [filterDate, searchQuery, userNames]);

  useEffect(() => {
    applyFilters(registrations);
  }, [registrations, filterDate, searchQuery, userNames, applyFilters]);

  const handleDateFilter = useCallback(() => {
    setShowDateFilter(!showDateFilter);
  }, [showDateFilter]);

  const handleClearDateFilter = useCallback(() => {
    setFilterDate('');
    setShowDateFilter(false);
  }, []);

  const handleStatusChange = useCallback(async (registrationId: string, newStatus: VehicleRegistration['status']) => {
    if (!db) return;

    let rejectionReason: string | undefined;

    if (newStatus === 'approved') {
      if (!window.confirm('Are you sure you want to approve this vehicle registration? This action will notify the user.')) {
        return;
      }
    } else if (newStatus === 'rejected') {
      if (!window.confirm('Are you sure you want to reject this vehicle registration? You will be asked to provide a reason.')) {
        return;
      }
      const reason = prompt('Please provide a reason for rejecting this vehicle registration:');
      if (!reason || !reason.trim()) {
        alert('Rejection reason is required. Please provide a reason.');
        return;
      }
      rejectionReason = reason.trim();
    }

    try {
      const registrationDoc = await getDoc(doc(db, 'vehicleRegistrations', registrationId));
      if (!registrationDoc.exists()) {
        alert('Vehicle registration not found');
        return;
      }
      
      const registrationData = registrationDoc.data();
      const oldStatus = registrationData.status;
      
      const updateData: any = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };
      
      if (newStatus === 'rejected' && rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      } else {
        updateData.rejectionReason = null;
      }
      
      await updateDoc(doc(db, 'vehicleRegistrations', registrationId), updateData);
      
      if (oldStatus !== newStatus && registrationData.userId && newStatus !== 'pending') {
        let message = '';
        if (newStatus === 'rejected' && rejectionReason) {
          message = `Your vehicle registration (${registrationData.plateNumber}) has been rejected. Reason: ${rejectionReason}`;
        } else if (newStatus === 'approved') {
          message = `Your vehicle registration (${registrationData.plateNumber}) has been approved.`;
        }
        
        await addDoc(collection(db, 'notifications'), {
          type: 'vehicle_registration_status',
          vehicleRegistrationId: registrationId,
          userId: registrationData.userId,
          userEmail: registrationData.userEmail || '',
          message: message,
          status: newStatus,
          rejectionReason: rejectionReason || null,
          recipientType: 'user',
          recipientUserId: registrationData.userId,
          isRead: false,
          createdAt: Timestamp.now(),
        });
      }
    } catch (error) {
      console.error('Error updating vehicle registration status:', error);
      alert('Failed to update vehicle registration status');
    }
  }, [db]);

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
      case 'rejected': return '#ef4444';
      default: return '#666666';
    }
  };

  const handleView = useCallback((registration: VehicleRegistration) => {
    setViewingRegistration(registration);
    setShowViewModal(true);
  }, []);

  const handleCloseView = useCallback(() => {
    setShowViewModal(false);
    setViewingRegistration(null);
  }, []);

  const handleArchive = useCallback(async (registrationId: string) => {
    if (!db || !user) return;
    
    const confirmed = window.confirm('Are you sure you want to archive this vehicle registration? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      // Get registration data
      const registrationDoc = await getDoc(doc(db, 'vehicleRegistrations', registrationId));
      if (!registrationDoc.exists()) {
        alert('Vehicle registration not found');
        return;
      }

      const registrationData = registrationDoc.data();
      
      // Move to archived vehicle registrations collection
      await addDoc(collection(db, 'archivedVehicleRegistrations'), {
        ...registrationData,
        originalId: registrationId,
        archivedAt: Timestamp.now(),
        archivedBy: user.uid || 'unknown',
      });

      // Delete from active vehicle registrations
      await deleteDoc(doc(db, 'vehicleRegistrations', registrationId));

      // Remove from active registrations list
      setRegistrations(prev => prev.filter(r => r.id !== registrationId));
      
      alert('Vehicle registration archived successfully');
      
      // Navigate to archived screen with vehicle-registration filter
      navigate('/archived?filter=vehicle-registration');
    } catch (error) {
      console.error('Error archiving vehicle registration:', error);
      alert('Failed to archive vehicle registration');
    }
  }, [db, user, navigate]);

  return (
    <Layout>
      <div className="min-h-screen bg-white w-full">
        <Header title="Vehicle Registration" />

        <main className="w-full max-w-full m-0 p-10 box-border">
          <div className="flex flex-col gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-8 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="m-0 text-gray-900 text-lg font-normal">
                  {activeView === 'applications' ? 'Vehicle Registration Applications' : 'Registered Vehicles'}
                </h2>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                  />
                  <button
                    className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-200"
                    onClick={handleDateFilter}
                  >
                    Filter by Date
                  </button>
                </div>
              </div>

              {showDateFilter && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-end gap-4">
                    <div className="w-48">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
                      <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <button
                      className="px-4 py-2 bg-gray-500 text-white rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-600"
                      onClick={handleClearDateFilter}
                    >
                      Clear
                    </button>
                  </div>
                  {(filterDate || searchQuery) && (
                    <div className="mt-2 text-xs text-gray-600">
                      Showing {filteredRegistrations.length} of {registrations.length} vehicle registrations
                    </div>
                  )}
                </div>
              )}

              {loading && registrations.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading vehicle registrations...</div>
              ) : (filterDate || searchQuery ? filteredRegistrations : registrations).length === 0 ? (
                <div className="text-center py-20 px-5 text-gray-600">
                  <p className="text-base font-normal text-gray-600">No vehicle registrations found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Date</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">User</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Plate Number</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Vehicle</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Type</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filterDate || searchQuery ? filteredRegistrations : registrations).map((registration) => (
                        <tr key={registration.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(registration.createdAt)}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                            {userNames[registration.userId] || registration.userEmail || 'Unknown User'}
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top font-semibold">{registration.plateNumber}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                            {registration.make} {registration.model} ({registration.year})
                            <br />
                            <span className="text-xs text-gray-500">Color: {registration.color}</span>
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{registration.vehicleType}</td>
                          <td className="px-4 py-4 border-b border-gray-100 align-top">
                            <span
                              className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                              style={{ backgroundColor: getStatusColor(registration.status) }}
                            >
                              {registration.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 align-top">
                            <div className="flex items-center gap-2">
                              {activeView === 'applications' && registration.status !== 'rejected' && (
                                <select
                                  className="px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 cursor-pointer transition-colors hover:border-primary focus:outline-none focus:border-primary focus:shadow-[0_0_0_2px_rgba(30,64,175,0.1)] w-32"
                                  value={registration.status}
                                  onChange={(e) => handleStatusChange(registration.id, e.target.value as VehicleRegistration['status'])}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="approved">Approve</option>
                                  <option value="rejected">Reject</option>
                                </select>
                              )}
                              <button
                                className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
                                onClick={() => handleView(registration)}
                              >
                                View
                              </button>
                              <button
                                className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors whitespace-nowrap"
                                onClick={() => handleArchive(registration.id)}
                              >
                                Archive
                              </button>
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

        {showViewModal && viewingRegistration && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={handleCloseView}>
            <div className="bg-white rounded-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Vehicle Registration Details</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={handleCloseView}
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Plate Number</label>
                    <p className="text-gray-900 font-medium">{viewingRegistration.plateNumber}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                    <span
                      className="px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wide text-white inline-block"
                      style={{ backgroundColor: getStatusColor(viewingRegistration.status) }}
                    >
                      {viewingRegistration.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Make</label>
                    <p className="text-gray-900 font-medium">{viewingRegistration.make}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Model</label>
                    <p className="text-gray-900 font-medium">{viewingRegistration.model}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Year</label>
                    <p className="text-gray-900 font-medium">{viewingRegistration.year}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Color</label>
                    <p className="text-gray-900 font-medium">{viewingRegistration.color}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Vehicle Type</label>
                    <p className="text-gray-900 font-medium">{viewingRegistration.vehicleType}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">User Email</label>
                    <p className="text-gray-900 font-medium">{viewingRegistration.userEmail}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Submitted Date</label>
                    <p className="text-gray-900 font-medium">{formatDate(viewingRegistration.createdAt)}</p>
                  </div>
                  {viewingRegistration.rejectionReason && (
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Rejection Reason</label>
                      <p className="text-gray-900 font-medium">{viewingRegistration.rejectionReason}</p>
                    </div>
                  )}
                </div>
                {viewingRegistration.vehicleImageURL && (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Vehicle Image</label>
                    <img 
                      src={viewingRegistration.vehicleImageURL} 
                      alt="Vehicle Image" 
                      className="w-full rounded-lg border border-gray-200"
                    />
                  </div>
                )}
                {viewingRegistration.registrationImageURL && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Registration Document</label>
                    <img 
                      src={viewingRegistration.registrationImageURL} 
                      alt="Registration Document" 
                      className="w-full rounded-lg border border-gray-200"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default memo(VehicleRegistration);

