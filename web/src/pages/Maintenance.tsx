import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, updateDoc, doc, addDoc, Timestamp, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

interface Maintenance {
  id: string;
  maintenanceType: 'Water' | 'Electricity' | 'Garbage disposal';
  description: string;
  userId: string;
  userEmail: string;
  status: 'pending' | 'in-progress' | 'resolved' | 'rejected';
  rejectionReason?: string;
  imageURL?: string;
  createdAt: any;
  updatedAt?: any;
}

function Maintenance() {
  const [user, setUser] = useState<any>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<Maintenance[]>([]);
  const [filteredMaintenance, setFilteredMaintenance] = useState<Maintenance[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingMaintenance, setViewingMaintenance] = useState<Maintenance | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [filterDate, setFilterDate] = useState<string>('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const navigate = useNavigate();

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
      setMaintenanceRequests([]);
      setLoading(false);
      return;
    }

    console.log('Setting up real-time listener for maintenance...', { userEmail: user.email, dbExists: !!db });
    setLoading(true);

    let q;
    try {
      q = query(collection(db, 'maintenance'), orderBy('createdAt', 'desc'));
    } catch (error) {
      q = query(collection(db, 'maintenance'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const maintenanceData: Maintenance[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        maintenanceData.push({
          id: doc.id,
          ...data,
        } as Maintenance);
      });
      
      maintenanceData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
          
      console.log(`Received ${maintenanceData.length} maintenance requests (real-time update)`);
      setMaintenanceRequests(maintenanceData);
      setLoading(false);
    }, (error: any) => {
      console.error('Error listening to maintenance:', error);
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(collection(db, 'maintenance'));
        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
          const maintenanceData: Maintenance[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            maintenanceData.push({
              id: doc.id,
              ...data,
            } as Maintenance);
          });
          
          maintenanceData.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bDate - aDate;
          });
          
          setMaintenanceRequests(maintenanceData);
          setLoading(false);
        }, (error2) => {
          console.error('Error listening to maintenance (fallback):', error2);
          setLoading(false);
        });
        return () => unsubscribe2();
      } else {
        setLoading(false);
        alert(`Failed to load maintenance requests: ${error.message || 'Unknown error'}`);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  // Fetch user names
  useEffect(() => {
    if (!db || maintenanceRequests.length === 0) return;

    const fetchUserNames = async () => {
      const userIds = [...new Set(maintenanceRequests.map(m => m.userId))];
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
            namesMap[userId] = maintenanceRequests.find(m => m.userId === userId)?.userEmail || 'Unknown User';
          }
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          namesMap[userId] = maintenanceRequests.find(m => m.userId === userId)?.userEmail || 'Unknown User';
        }
      }

      setUserNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchUserNames();
  }, [db, maintenanceRequests]);

  const applyFilters = useCallback((maintenanceList: Maintenance[]) => {
    let filtered = maintenanceList;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((maintenance) => maintenance.status === statusFilter);
    }

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((maintenance) => {
        const maintenanceDate = maintenance.createdAt?.toDate 
          ? maintenance.createdAt.toDate() 
          : maintenance.createdAt 
          ? new Date(maintenance.createdAt) 
          : null;
        
        if (!maintenanceDate) return false;

        const maintenanceDateOnly = new Date(maintenanceDate.getFullYear(), maintenanceDate.getMonth(), maintenanceDate.getDate());
        
        return maintenanceDateOnly.getTime() === selectedDateOnly.getTime();
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((maintenance) => {
        const userName = userNames[maintenance.userId] || maintenance.userEmail || '';
        const maintenanceType = maintenance.maintenanceType || '';
        const description = maintenance.description || '';
        
        return (
          userName.toLowerCase().includes(query) ||
          maintenanceType.toLowerCase().includes(query) ||
          description.toLowerCase().includes(query)
        );
      });
    }

    setFilteredMaintenance(filtered);
  }, [statusFilter, filterDate, searchQuery, userNames]);

  useEffect(() => {
    applyFilters(maintenanceRequests);
  }, [maintenanceRequests, statusFilter, filterDate, searchQuery, userNames, applyFilters]);

  const handleDateFilter = useCallback(() => {
    setShowDateFilter(!showDateFilter);
  }, [showDateFilter]);

  const handleClearDateFilter = useCallback(() => {
    setFilterDate('');
    setShowDateFilter(false);
  }, []);

  const handleStatusChange = useCallback(async (maintenanceId: string, newStatus: Maintenance['status']) => {
    if (!db) return;
    
    let rejectionReason: string | undefined = undefined;
    
    if (newStatus === 'resolved') {
      const confirmed = window.confirm('Are you sure you want to mark this maintenance request as resolved? This action will notify the user and they will be able to submit a new request.');
      if (!confirmed) {
        return;
      }
    }
    
    if (newStatus === 'rejected') {
      const confirmed = window.confirm('Are you sure you want to reject this maintenance request? You will be asked to provide a reason.');
      if (!confirmed) {
        return;
      }
      
      const reason = window.prompt('Please provide a reason for rejecting this maintenance request:');
      if (reason === null) {
        return;
      }
      if (!reason || !reason.trim()) {
        alert('Rejection reason is required. Please provide a reason.');
        return;
      }
      rejectionReason = reason.trim();
    }
    
    try {
      const maintenanceDoc = await getDoc(doc(db, 'maintenance', maintenanceId));
      if (!maintenanceDoc.exists()) {
        alert('Maintenance request not found');
        return;
      }
      
      const maintenanceData = maintenanceDoc.data();
      const oldStatus = maintenanceData.status;
      
      const updateData: any = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };
      
      if (newStatus === 'rejected' && rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      }
      
      await updateDoc(doc(db, 'maintenance', maintenanceId), updateData);
      
      if (oldStatus !== newStatus && maintenanceData.userId && newStatus !== 'pending') {
        let message = '';
        if (newStatus === 'rejected' && rejectionReason) {
          message = `Your maintenance request has been rejected. Reason: ${rejectionReason}`;
        } else {
          const statusMessages: Record<string, string> = {
            'in-progress': 'Your maintenance request is now being processed',
            'resolved': 'Your maintenance request has been resolved',
          };
          message = statusMessages[newStatus] || `Your maintenance request status has been updated to ${newStatus}`;
        }
        
        await addDoc(collection(db, 'notifications'), {
          type: 'maintenance_status',
          maintenanceId: maintenanceId,
          userId: maintenanceData.userId,
          userEmail: maintenanceData.userEmail || '',
          subject: `${maintenanceData.maintenanceType} Maintenance Request`,
          message: message,
          status: newStatus,
          rejectionReason: rejectionReason || null,
          recipientType: 'user',
          recipientUserId: maintenanceData.userId,
          isRead: false,
          createdAt: Timestamp.now(),
        });
      }
    } catch (error) {
      console.error('Error updating maintenance status:', error);
      alert('Failed to update maintenance request status');
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
      case 'in-progress': return '#2196F3';
      case 'resolved': return '#4CAF50';
      case 'rejected': return '#ef4444';
      default: return '#666666';
    }
  };

  const handleView = useCallback((maintenance: Maintenance) => {
    console.log('Viewing maintenance:', maintenance);
    console.log('Image URL:', maintenance.imageURL);
    setViewingMaintenance(maintenance);
    setShowViewModal(true);
  }, []);

  const handleCloseView = useCallback(() => {
    setShowViewModal(false);
    setViewingMaintenance(null);
  }, []);

  const handleArchive = useCallback(async (maintenanceId: string) => {
    if (!db) return;
    
    const confirmed = window.confirm('Are you sure you want to archive this maintenance request? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      const maintenanceDoc = await getDoc(doc(db, 'maintenance', maintenanceId));
      if (!maintenanceDoc.exists()) {
        alert('Maintenance request not found');
        return;
      }

      const maintenanceData = maintenanceDoc.data();
      
      await addDoc(collection(db, 'archivedMaintenance'), {
        ...maintenanceData,
        originalId: maintenanceId,
        archivedAt: Timestamp.now(),
        archivedBy: user?.uid || 'unknown',
      });

      await deleteDoc(doc(db, 'maintenance', maintenanceId));

      setMaintenanceRequests(prev => prev.filter(m => m.id !== maintenanceId));
      
      alert('Maintenance request archived successfully');
      
      navigate('/archived?filter=maintenance');
    } catch (error) {
      console.error('Error archiving maintenance:', error);
      alert('Failed to archive maintenance request');
    }
  }, [db, user, navigate]);

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title="Maintenance" />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
                <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">Maintenance Requests</h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 md:px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-48 md:w-64"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 md:px-4 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-auto"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="resolved">Resolved</option>
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
                      className="px-4 py-2 bg-gray-500 text-white rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-600"
                      onClick={handleClearDateFilter}
                    >
                      Clear
                    </button>
                  </div>
                  {filterDate && (
                    <div className="mt-2 text-xs text-gray-600">
                      Showing {filteredMaintenance.length} of {maintenanceRequests.length} maintenance requests
                    </div>
                  )}
                </div>
              )}

              {loading && maintenanceRequests.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading maintenance requests...</div>
              ) : (statusFilter !== 'all' || filterDate || searchQuery ? filteredMaintenance : maintenanceRequests).length === 0 ? (
                <div className="text-center py-20 px-5 text-gray-600">
                  <p className="text-base font-normal text-gray-600">No maintenance requests found.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {(statusFilter !== 'all' || filterDate || searchQuery ? filteredMaintenance : maintenanceRequests).map((maintenance) => (
                      <div key={maintenance.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm mb-1">{maintenance.maintenanceType}</h3>
                            <p className="text-xs text-gray-500 mb-2">{formatDate(maintenance.createdAt)}</p>
                          </div>
                          <span
                            className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block flex-shrink-0"
                            style={{ backgroundColor: getStatusColor(maintenance.status) }}
                          >
                            {maintenance.status.toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="space-y-2 mb-3">
                          <div>
                            <span className="text-xs font-medium text-gray-600">User: </span>
                            <span className="text-xs text-gray-900">{userNames[maintenance.userId] || maintenance.userEmail || 'Unknown User'}</span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-600">Description: </span>
                            <p className="text-xs text-gray-900 mt-1 break-words whitespace-pre-wrap">{maintenance.description}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-3 border-t border-gray-200">
                          {(maintenance.status !== 'resolved' && maintenance.status !== 'rejected') && (
                            <select
                              className="px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 cursor-pointer transition-colors hover:border-primary focus:outline-none focus:border-primary w-full"
                              value={maintenance.status}
                              onChange={(e) => handleStatusChange(maintenance.id, e.target.value as Maintenance['status'])}
                            >
                              <option value="pending">Pending</option>
                              <option value="in-progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="rejected">Reject</option>
                            </select>
                          )}
                          <div className="flex gap-2">
                            <button
                              className="flex-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                              onClick={() => handleView(maintenance)}
                            >
                              View
                            </button>
                            {maintenance.status !== 'in-progress' && (
                              <button
                                className="flex-1 px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
                                onClick={() => handleArchive(maintenance.id)}
                              >
                                Archive
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto w-full">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Date</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">User</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Type</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Description</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(statusFilter !== 'all' || filterDate || searchQuery ? filteredMaintenance : maintenanceRequests).map((maintenance) => (
                          <tr key={maintenance.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(maintenance.createdAt)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                              {userNames[maintenance.userId] || maintenance.userEmail || 'Unknown User'}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{maintenance.maintenanceType}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top max-w-[300px] break-words whitespace-pre-wrap">
                              {maintenance.description}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 align-top">
                              <span
                                className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                                style={{ backgroundColor: getStatusColor(maintenance.status) }}
                              >
                                {maintenance.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 align-top">
                              <div className="flex items-center gap-2">
                                {(maintenance.status !== 'resolved' && maintenance.status !== 'rejected') && (
                                  <select
                                    className="px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 cursor-pointer transition-colors hover:border-primary focus:outline-none focus:border-primary focus:shadow-[0_0_0_2px_rgba(30,64,175,0.1)] w-32"
                                    value={maintenance.status}
                                    onChange={(e) => handleStatusChange(maintenance.id, e.target.value as Maintenance['status'])}
                                  >
                                    <option value="pending">Pending</option>
                                    <option value="in-progress">In Progress</option>
                                    <option value="resolved">Resolved</option>
                                    <option value="rejected">Reject</option>
                                  </select>
                                )}
                                <button
                                  className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
                                  onClick={() => handleView(maintenance)}
                                >
                                  View
                                </button>
                                {maintenance.status !== 'in-progress' && (
                                  <button
                                    className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors whitespace-nowrap"
                                    onClick={() => handleArchive(maintenance.id)}
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

      {/* View Maintenance Modal */}
      {showViewModal && viewingMaintenance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 sm:p-6" onClick={handleCloseView}>
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Maintenance Request Details</h2>
              <button
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                onClick={handleCloseView}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Maintenance Type</label>
                <p className="mt-1 text-gray-900">{viewingMaintenance.maintenanceType}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="mt-1 text-gray-900 whitespace-pre-wrap">{viewingMaintenance.description}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">User Email</label>
                <p className="mt-1 text-gray-900">{viewingMaintenance.userEmail}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <span
                  className="mt-1 inline-block px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white"
                  style={{ backgroundColor: getStatusColor(viewingMaintenance.status) }}
                >
                  {viewingMaintenance.status.toUpperCase()}
                </span>
              </div>
              
              {viewingMaintenance.rejectionReason && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Rejection Reason</label>
                  <p className="mt-1 text-gray-900 bg-red-50 border border-red-200 rounded p-3">{viewingMaintenance.rejectionReason}</p>
                </div>
              )}
              
              <div>
                <label className="text-sm font-medium text-gray-700">Image</label>
                {viewingMaintenance.imageURL && viewingMaintenance.imageURL.trim() !== '' ? (
                  <div className="mt-2">
                    <img 
                      src={viewingMaintenance.imageURL} 
                      alt="Maintenance image" 
                      className="max-w-full h-auto rounded border border-gray-200"
                      style={{ maxHeight: '400px', objectFit: 'contain' }}
                      onError={(e) => {
                        console.error('Error loading maintenance image:', viewingMaintenance.imageURL);
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'text-red-500 text-sm mt-2';
                        errorDiv.textContent = 'Failed to load image. URL: ' + viewingMaintenance.imageURL;
                        e.currentTarget.parentElement?.appendChild(errorDiv);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-gray-500 text-sm italic">No image provided</p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Submitted Date</label>
                <p className="mt-1 text-gray-900">{formatDate(viewingMaintenance.createdAt)}</p>
              </div>
              
              {viewingMaintenance.updatedAt && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Last Updated</label>
                  <p className="mt-1 text-gray-900">{formatDate(viewingMaintenance.updatedAt)}</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                onClick={handleCloseView}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default memo(Maintenance);
