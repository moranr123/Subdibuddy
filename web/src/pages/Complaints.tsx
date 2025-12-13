import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, updateDoc, doc, addDoc, Timestamp, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

interface Complaint {
  id: string;
  subject: string;
  description: string;
  userId: string;
  userEmail: string;
  status: 'pending' | 'in-progress' | 'resolved' | 'rejected';
  rejectionReason?: string;
  imageURL?: string;
  createdAt: any;
  updatedAt?: any;
}

function Complaints() {
  const [user, setUser] = useState<any>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [filteredComplaints, setFilteredComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingComplaint, setViewingComplaint] = useState<Complaint | null>(null);
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

  useEffect(() => {
    if (!user || !db) {
      setComplaints([]);
      setLoading(false);
      return;
    }
    
    console.log('Setting up real-time listener for complaints...', { userEmail: user.email, dbExists: !!db });
    setLoading(true);
      
    let q;
      try {
      q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'));
    } catch (error) {
      // If orderBy fails, use collection without orderBy
      q = query(collection(db, 'complaints'));
      }
      
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const complaintsData: Complaint[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        complaintsData.push({
          id: doc.id,
          ...data,
        } as Complaint);
      });
      
      // Sort manually if orderBy wasn't used
          complaintsData.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bDate - aDate;
          });
          
          console.log(`Received ${complaintsData.length} complaints (real-time update)`);
          setComplaints(complaintsData);
          setLoading(false);
    }, (error: any) => {
      console.error('Error listening to complaints:', error);
      // If orderBy error, try without orderBy
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(collection(db, 'complaints'));
        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
          const complaintsData: Complaint[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
        complaintsData.push({
          id: doc.id,
          ...data,
        } as Complaint);
      });
      
      complaintsData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      setComplaints(complaintsData);
          applyDateFilter(complaintsData);
          setLoading(false);
        }, (error2) => {
          console.error('Error listening to complaints (fallback):', error2);
          setLoading(false);
        });
        return () => unsubscribe2();
      } else {
        setLoading(false);
      alert(`Failed to load complaints: ${error.message || 'Unknown error'}`);
    }
    });

    return () => unsubscribe();
  }, [user, db]);

  // Fetch user names
  useEffect(() => {
    if (!db || complaints.length === 0) return;

    const fetchUserNames = async () => {
      const userIds = [...new Set(complaints.map(c => c.userId))];
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
            namesMap[userId] = complaints.find(c => c.userId === userId)?.userEmail || 'Unknown User';
          }
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          namesMap[userId] = complaints.find(c => c.userId === userId)?.userEmail || 'Unknown User';
        }
      }

      setUserNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchUserNames();
  }, [db, complaints]);

  const applyFilters = useCallback((complaintsList: Complaint[]) => {
    let filtered = complaintsList;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((complaint) => complaint.status === statusFilter);
    }

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((complaint) => {
        const complaintDate = complaint.createdAt?.toDate 
          ? complaint.createdAt.toDate() 
          : complaint.createdAt 
          ? new Date(complaint.createdAt) 
          : null;
        
        if (!complaintDate) return false;

        const complaintDateOnly = new Date(complaintDate.getFullYear(), complaintDate.getMonth(), complaintDate.getDate());
        
        return complaintDateOnly.getTime() === selectedDateOnly.getTime();
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((complaint) => {
        const userName = userNames[complaint.userId] || complaint.userEmail || '';
        const subject = complaint.subject || '';
        const description = complaint.description || '';
        
        return (
          userName.toLowerCase().includes(query) ||
          subject.toLowerCase().includes(query) ||
          description.toLowerCase().includes(query)
        );
      });
    }

    setFilteredComplaints(filtered);
  }, [statusFilter, filterDate, searchQuery, userNames]);

  useEffect(() => {
    applyFilters(complaints);
  }, [complaints, statusFilter, filterDate, searchQuery, userNames, applyFilters]);

  const handleDateFilter = useCallback(() => {
    setShowDateFilter(!showDateFilter);
  }, [showDateFilter]);

  const handleClearDateFilter = useCallback(() => {
    setFilterDate('');
    setShowDateFilter(false);
  }, []);

  const handleStatusChange = useCallback(async (complaintId: string, newStatus: Complaint['status']) => {
    if (!db) return;
    
    let rejectionReason: string | undefined = undefined;
    
    // Show confirmation dialog when resolving a complaint
    if (newStatus === 'resolved') {
      const confirmed = window.confirm('Are you sure you want to mark this complaint as resolved? This action will notify the user and they will be able to submit a new complaint.');
      if (!confirmed) {
        return;
      }
    }
    
    // Show confirmation dialog and get rejection reason when rejecting a complaint
    if (newStatus === 'rejected') {
      const confirmed = window.confirm('Are you sure you want to reject this complaint? You will be asked to provide a reason.');
      if (!confirmed) {
        return;
      }
      
      // Prompt for rejection reason
      const reason = window.prompt('Please provide a reason for rejecting this complaint:');
      if (reason === null) {
        // User cancelled
        return;
      }
      if (!reason || !reason.trim()) {
        alert('Rejection reason is required. Please provide a reason.');
        return;
      }
      rejectionReason = reason.trim();
    }
    
    try {
      // Get complaint data to get userId
      const complaintDoc = await getDoc(doc(db, 'complaints', complaintId));
      if (!complaintDoc.exists()) {
        alert('Complaint not found');
        return;
      }
      
      const complaintData = complaintDoc.data();
      const oldStatus = complaintData.status;
      
      // Update complaint status
      const updateData: any = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };
      
      // Add rejection reason if rejecting
      if (newStatus === 'rejected' && rejectionReason) {
        updateData.rejectionReason = rejectionReason;
      }
      
      await updateDoc(doc(db, 'complaints', complaintId), updateData);
      
      // Create notification for the user who submitted the complaint
      // Don't notify if status is set to pending
      if (oldStatus !== newStatus && complaintData.userId && newStatus !== 'pending') {
        let message = '';
        if (newStatus === 'rejected' && rejectionReason) {
          message = `Your complaint has been rejected. Reason: ${rejectionReason}`;
        } else {
          const statusMessages: Record<string, string> = {
            'in-progress': 'Your complaint is now being processed',
            'resolved': 'Your complaint has been resolved',
          };
          message = statusMessages[newStatus] || `Your complaint status has been updated to ${newStatus}`;
        }
        
        await addDoc(collection(db, 'notifications'), {
          type: 'complaint_status',
          complaintId: complaintId,
          userId: complaintData.userId,
          userEmail: complaintData.userEmail || '',
          subject: complaintData.subject || 'Complaint Update',
          message: message,
          status: newStatus,
          rejectionReason: rejectionReason || null,
          recipientType: 'user',
          recipientUserId: complaintData.userId,
          isRead: false,
          createdAt: Timestamp.now(),
        });
      }
      
      // Complaints will update automatically via real-time listener
    } catch (error) {
      console.error('Error updating complaint status:', error);
      alert('Failed to update complaint status');
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

  const handleView = useCallback((complaint: Complaint) => {
    console.log('Viewing complaint:', complaint);
    console.log('Image URL:', complaint.imageURL);
    setViewingComplaint(complaint);
    setShowViewModal(true);
  }, []);

  const handleCloseView = useCallback(() => {
    setShowViewModal(false);
    setViewingComplaint(null);
  }, []);

  const handleArchive = useCallback(async (complaintId: string) => {
    if (!db) return;
    
    const confirmed = window.confirm('Are you sure you want to archive this complaint? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      // Get complaint data
      const complaintDoc = await getDoc(doc(db, 'complaints', complaintId));
      if (!complaintDoc.exists()) {
        alert('Complaint not found');
        return;
      }

      const complaintData = complaintDoc.data();
      
      // Move to archived complaints collection
      await addDoc(collection(db, 'archivedComplaints'), {
        ...complaintData,
        originalId: complaintId,
        archivedAt: Timestamp.now(),
        archivedBy: user?.uid || 'unknown',
      });

      // Delete from active complaints
      await deleteDoc(doc(db, 'complaints', complaintId));

      // Remove from active complaints list
      setComplaints(prev => prev.filter(c => c.id !== complaintId));
      
      alert('Complaint archived successfully');
      
      // Navigate to archived screen with complaints filter
      navigate('/archived?filter=complaints');
    } catch (error) {
      console.error('Error archiving complaint:', error);
      alert('Failed to archive complaint');
    }
  }, [db, user]);

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title="Complaints" />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
                <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">Resident Complaints</h2>
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
                      className="px-4 py-2 bg-gray-500 text-white rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-600 whitespace-nowrap"
                      onClick={handleClearDateFilter}
                    >
                      Clear
                    </button>
                  </div>
                  {filterDate && (
                    <div className="mt-2 text-xs text-gray-600">
                      Showing {filteredComplaints.length} of {complaints.length} complaints
                    </div>
                  )}
                </div>
              )}

              {loading && complaints.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading complaints...</div>
              ) : (statusFilter !== 'all' || filterDate || searchQuery ? filteredComplaints : complaints).length === 0 ? (
                <div className="text-center py-20 px-5 text-gray-600">
                  <p className="text-base font-normal text-gray-600">No complaints found.</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {(statusFilter !== 'all' || filterDate || searchQuery ? filteredComplaints : complaints).map((complaint) => (
                      <div key={complaint.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm mb-1">{complaint.subject}</h3>
                            <p className="text-xs text-gray-500 mb-2">{formatDate(complaint.createdAt)}</p>
                          </div>
                          <span
                            className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block flex-shrink-0"
                            style={{ backgroundColor: getStatusColor(complaint.status) }}
                          >
                            {complaint.status.toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="space-y-2 mb-3">
                          <div>
                            <span className="text-xs font-medium text-gray-600">User: </span>
                            <span className="text-xs text-gray-900">{userNames[complaint.userId] || complaint.userEmail || 'Unknown User'}</span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-600">Description: </span>
                            <p className="text-xs text-gray-900 mt-1 break-words whitespace-pre-wrap">{complaint.description}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-3 border-t border-gray-200">
                          {(complaint.status !== 'resolved' && complaint.status !== 'rejected') && (
                            <select
                              className="px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 cursor-pointer transition-colors hover:border-primary focus:outline-none focus:border-primary w-full"
                              value={complaint.status}
                              onChange={(e) => handleStatusChange(complaint.id, e.target.value as Complaint['status'])}
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
                              onClick={() => handleView(complaint)}
                            >
                              View
                            </button>
                            {complaint.status !== 'in-progress' && (
                              <button
                                className="flex-1 px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
                                onClick={() => handleArchive(complaint.id)}
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
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Subject</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Description</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                        {(statusFilter !== 'all' || filterDate || searchQuery ? filteredComplaints : complaints).map((complaint) => (
                        <tr key={complaint.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(complaint.createdAt)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                              {userNames[complaint.userId] || complaint.userEmail || 'Unknown User'}
                            </td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{complaint.subject}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top max-w-[300px] break-words whitespace-pre-wrap">
                            {complaint.description}
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 align-top">
                            <span
                              className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                              style={{ backgroundColor: getStatusColor(complaint.status) }}
                            >
                              {complaint.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 align-top">
                              <div className="flex items-center gap-2">
                                {(complaint.status !== 'resolved' && complaint.status !== 'rejected') && (
                            <select
                                    className="px-2.5 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900 cursor-pointer transition-colors hover:border-primary focus:outline-none focus:border-primary focus:shadow-[0_0_0_2px_rgba(30,64,175,0.1)] w-32"
                              value={complaint.status}
                              onChange={(e) => handleStatusChange(complaint.id, e.target.value as Complaint['status'])}
                            >
                              <option value="pending">Pending</option>
                              <option value="in-progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                                    <option value="rejected">Reject</option>
                            </select>
                                )}
                                <button
                                  className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
                                  onClick={() => handleView(complaint)}
                                >
                                  View
                                </button>
                                {complaint.status !== 'in-progress' && (
                                  <button
                                    className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors whitespace-nowrap"
                                    onClick={() => handleArchive(complaint.id)}
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

      {/* View Complaint Modal */}
      {showViewModal && viewingComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleCloseView}>
          <div className="bg-white rounded-lg p-4 md:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Complaint Details</h2>
              <button
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                onClick={handleCloseView}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Subject</label>
                <p className="mt-1 text-gray-900">{viewingComplaint.subject}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="mt-1 text-gray-900 whitespace-pre-wrap">{viewingComplaint.description}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">User Email</label>
                <p className="mt-1 text-gray-900">{viewingComplaint.userEmail}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <span
                  className="mt-1 inline-block px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white"
                  style={{ backgroundColor: getStatusColor(viewingComplaint.status) }}
                >
                  {viewingComplaint.status.toUpperCase()}
                </span>
              </div>
              
              {viewingComplaint.rejectionReason && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Rejection Reason</label>
                  <p className="mt-1 text-gray-900 bg-red-50 border border-red-200 rounded p-3">{viewingComplaint.rejectionReason}</p>
                </div>
              )}
              
              <div>
                <label className="text-sm font-medium text-gray-700">Image</label>
                {viewingComplaint.imageURL && viewingComplaint.imageURL.trim() !== '' ? (
                  <div className="mt-2">
                    <img 
                      src={viewingComplaint.imageURL} 
                      alt="Complaint image" 
                      className="max-w-full h-auto rounded border border-gray-200"
                      style={{ maxHeight: '400px', objectFit: 'contain' }}
                      onError={(e) => {
                        console.error('Error loading complaint image:', viewingComplaint.imageURL);
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'text-red-500 text-sm mt-2';
                        errorDiv.textContent = 'Failed to load image. URL: ' + viewingComplaint.imageURL;
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
                <p className="mt-1 text-gray-900">{formatDate(viewingComplaint.createdAt)}</p>
              </div>
              
              {viewingComplaint.updatedAt && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Last Updated</label>
                  <p className="mt-1 text-gray-900">{formatDate(viewingComplaint.updatedAt)}</p>
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

export default memo(Complaints);
