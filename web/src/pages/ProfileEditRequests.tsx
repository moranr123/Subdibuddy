import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, updateDoc, Timestamp, onSnapshot, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { sendProfileEditApprovalEmail, sendProfileEditRejectionEmail } from '../utils/emailService';

interface ProfileEditRequest {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  currentData?: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    sex?: string;
    birthdate?: any;
    age?: number;
  };
  requestedChanges?: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    sex?: string;
    birthdate?: any;
    age?: number;
  };
  status?: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
  updatedAt?: any;
  reviewedBy?: string;
  rejectionReason?: string;
}

function ProfileEditRequests() {
  const [user, setUser] = useState<any>(null);
  const [requests, setRequests] = useState<ProfileEditRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ProfileEditRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
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

  const fetchRequests = useCallback(async () => {
    if (!db) return;

    try {
      setLoading(true);
      let q;
      if (statusFilter === 'all') {
        q = query(collection(db, 'profileEditRequests'), orderBy('createdAt', 'desc'));
      } else {
        q = query(
          collection(db, 'profileEditRequests'),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      const requestsData: ProfileEditRequest[] = [];
      querySnapshot.forEach((doc) => {
        requestsData.push({
          id: doc.id,
          ...doc.data(),
        } as ProfileEditRequest);
      });

      setRequests(requestsData);
    } catch (error: any) {
      console.error('Error fetching profile edit requests:', error);
      alert(`Failed to load requests: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [db, statusFilter]);

  // Set up real-time listener
  useEffect(() => {
    if (!user || !db) return;

    console.log('Setting up real-time listener for profile edit requests...');
    setLoading(true);

    let q;
    try {
      if (statusFilter === 'all') {
        q = query(collection(db, 'profileEditRequests'), orderBy('createdAt', 'desc'));
      } else {
        q = query(
          collection(db, 'profileEditRequests'),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc')
        );
      }
    } catch (error: any) {
      console.warn('orderBy failed, trying without orderBy:', error);
      if (statusFilter === 'all') {
        q = query(collection(db, 'profileEditRequests'));
      } else {
        q = query(
          collection(db, 'profileEditRequests'),
          where('status', '==', statusFilter)
        );
      }
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const requestsData: ProfileEditRequest[] = [];
        snapshot.forEach((doc) => {
          requestsData.push({
            id: doc.id,
            ...doc.data(),
          } as ProfileEditRequest);
        });

        // Sort manually if orderBy failed
        requestsData.sort((a, b) => {
          const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return bDate - aDate;
        });

        console.log(`Real-time update: ${requestsData.length} profile edit requests`);
        setRequests(requestsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error in real-time listener:', error);
        setLoading(false);
        alert(`Failed to load requests: ${error.message || 'Unknown error'}`);
      }
    );

    return () => unsubscribe();
  }, [user, db, statusFilter]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  const handleViewDetails = useCallback((request: ProfileEditRequest) => {
    setSelectedRequest(request);
    setShowDetailsModal(true);
  }, []);

  const handleApprove = useCallback(async (requestId: string): Promise<boolean> => {
    if (!db || !auth.currentUser) return false;

    const request = requests.find((r) => r.id === requestId);
    if (!request) {
      alert('Request not found');
      return false;
    }

    const confirmed = window.confirm(
      `Are you sure you want to approve this profile edit request for ${request.userName || 'this user'}?`
    );

    if (!confirmed) {
      return false;
    }

    setProcessingStatus(requestId);
    try {
      // Update the user's profile with the requested changes
      const userRef = doc(db, 'users', request.userId);
      const updateData: any = {
        ...request.requestedChanges,
        updatedAt: Timestamp.now(),
      };

      await updateDoc(userRef, updateData);

      // Update the request status
      const requestRef = doc(db, 'profileEditRequests', requestId);
      await updateDoc(requestRef, {
        status: 'approved',
        reviewedBy: auth.currentUser?.uid,
        updatedAt: Timestamp.now(),
      });

      // Send approval email notification
      try {
        const userEmail = request.userEmail;
        const userName = request.userName || 'User';

        if (userEmail) {
          await sendProfileEditApprovalEmail(userEmail, userName);
          console.log(`Approval email sent to: ${userEmail}`);
        } else {
          console.warn('No email address found for user, skipping email notification');
        }
      } catch (emailError) {
        console.error('Error sending approval email:', emailError);
        // Don't fail the approval if email fails
      }

      // Update local state
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r))
      );

      alert('Profile edit request approved successfully');
      return true;
    } catch (error: any) {
      console.error('Error approving request:', error);
      alert(`Failed to approve request: ${error.message || 'Unknown error'}`);
      return false;
    } finally {
      setProcessingStatus(null);
    }
  }, [db, auth, requests]);

  const handleReject = useCallback(async (requestId: string): Promise<boolean> => {
    if (!db || !auth.currentUser) return false;

    const request = requests.find((r) => r.id === requestId);
    if (!request) {
      alert('Request not found');
      return false;
    }

    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      return false;
    }

    setProcessingStatus(requestId);
    try {
      // Update the request status
      const requestRef = doc(db, 'profileEditRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        rejectionReason: reason.trim(),
        reviewedBy: auth.currentUser?.uid,
        updatedAt: Timestamp.now(),
      });

      // Send rejection email notification
      try {
        const userEmail = request.userEmail;
        const userName = request.userName || 'User';

        if (userEmail) {
          await sendProfileEditRejectionEmail(userEmail, userName, reason.trim());
          console.log(`Rejection email sent to: ${userEmail}`);
        } else {
          console.warn('No email address found for user, skipping email notification');
        }
      } catch (emailError) {
        console.error('Error sending rejection email:', emailError);
        // Don't fail the rejection if email fails
      }

      // Update local state
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'rejected', rejectionReason: reason.trim() } : r))
      );

      alert('Profile edit request rejected');
      return true;
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      alert(`Failed to reject request: ${error.message || 'Unknown error'}`);
      return false;
    } finally {
      setProcessingStatus(null);
    }
  }, [db, auth, requests]);

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

  const getFieldValue = (value: any) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object' && value.toDate) {
      return formatDate(value);
    }
    return String(value);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title="Profile Edit Requests" />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
                <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">
                  Profile Edit Requests
                </h2>
                <div className="flex flex-col gap-1 md:w-[180px]">
                  <label className="text-xs text-gray-600">Status Filter</label>
                  <select
                    className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              {loading && requests.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading requests...</div>
              ) : requests.length === 0 ? (
                <div className="text-center py-20 px-5 text-gray-600">
                  <p className="text-base font-normal text-gray-600">No profile edit requests found.</p>
                  <p className="text-xs text-gray-400 mt-2.5">
                    Profile edit requests from users will appear here for review.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {requests.map((request) => (
                      <div key={request.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm mb-1">
                              {request.userName || 'Unknown User'}
                            </h3>
                            <p className="text-xs text-gray-500 mb-2">{formatDate(request.createdAt)}</p>
                          </div>
                          <div className="flex-shrink-0">{getStatusBadge(request.status)}</div>
                        </div>

                        <div className="flex flex-col gap-2 pt-3 border-t border-gray-200">
                          <button
                            className="w-full bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                            onClick={() => handleViewDetails(request)}
                          >
                            View Details
                          </button>
                          {request.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                className="flex-1 bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleApprove(request.id)}
                                disabled={processingStatus === request.id}
                              >
                                {processingStatus === request.id ? 'Processing...' : 'Approve'}
                              </button>
                              <button
                                className="flex-1 bg-red-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleReject(request.id)}
                                disabled={processingStatus === request.id}
                              >
                                {processingStatus === request.id ? 'Processing...' : 'Reject'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto w-full">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                            User Name
                          </th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                            Email
                          </th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                            Status
                          </th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                            Created At
                          </th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((request) => (
                          <tr
                            key={request.id}
                            className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100"
                          >
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                              {request.userName || 'N/A'}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                              {request.userEmail || 'N/A'}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                              {getStatusBadge(request.status)}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                              {formatDate(request.createdAt)}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                              <div className="flex gap-2 items-center">
                                <button
                                  className="bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                  onClick={() => handleViewDetails(request)}
                                >
                                  View Details
                                </button>
                                {request.status === 'pending' && (
                                  <>
                                    <button
                                      className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => handleApprove(request.id)}
                                      disabled={processingStatus === request.id}
                                    >
                                      {processingStatus === request.id ? 'Processing...' : 'Approve'}
                                    </button>
                                    <button
                                      className="bg-red-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => handleReject(request.id)}
                                      disabled={processingStatus === request.id}
                                    >
                                      {processingStatus === request.id ? 'Processing...' : 'Reject'}
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
                </>
              )}
            </div>
          </div>
        </main>

        {/* Details Modal */}
        {showDetailsModal && selectedRequest && (
          <div
            className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5"
            onClick={() => setShowDetailsModal(false)}
          >
            <div
              className="bg-white rounded-lg sm:rounded-2xl w-full max-w-[800px] max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-lg sm:text-xl font-normal">Request Details</h3>
                <button
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => setShowDetailsModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                    <div>{getStatusBadge(selectedRequest.status)}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">User Name</label>
                    <p className="text-gray-900 font-medium">{selectedRequest.userName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Email</label>
                    <p className="text-gray-900">{selectedRequest.userEmail || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Created At</label>
                    <p className="text-gray-900">{formatDate(selectedRequest.createdAt)}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Current Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedRequest.currentData && (
                      <>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">
                            First Name
                          </label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.currentData.firstName)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">
                            Middle Name
                          </label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.currentData.middleName)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Last Name</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.currentData.lastName)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.currentData.phone)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Email</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.currentData.email)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Sex</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.currentData.sex)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Birthdate</label>
                          <p className="text-gray-900">{formatDate(selectedRequest.currentData.birthdate)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Age</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.currentData.age)}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Requested Changes</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedRequest.requestedChanges && (
                      <>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">
                            First Name
                          </label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.requestedChanges.firstName)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">
                            Middle Name
                          </label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.requestedChanges.middleName)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Last Name</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.requestedChanges.lastName)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.requestedChanges.phone)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Email</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.requestedChanges.email)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Sex</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.requestedChanges.sex)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Birthdate</label>
                          <p className="text-gray-900">{formatDate(selectedRequest.requestedChanges.birthdate)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Age</label>
                          <p className="text-gray-900">{getFieldValue(selectedRequest.requestedChanges.age)}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {selectedRequest.status === 'rejected' && selectedRequest.rejectionReason && (
                  <div className="mb-6">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">
                      Rejection Reason
                    </label>
                    <p className="text-gray-900 bg-red-50 p-3 rounded border border-red-200">
                      {selectedRequest.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                {selectedRequest.status === 'pending' && (
                  <>
                    <button
                      className="bg-green-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                      onClick={async () => {
                        const success = await handleApprove(selectedRequest.id);
                        if (success) {
                          setShowDetailsModal(false);
                        }
                      }}
                      disabled={processingStatus === selectedRequest.id}
                    >
                      {processingStatus === selectedRequest.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      className="bg-red-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                      onClick={async () => {
                        const success = await handleReject(selectedRequest.id);
                        if (success) {
                          setShowDetailsModal(false);
                        }
                      }}
                      disabled={processingStatus === selectedRequest.id}
                    >
                      {processingStatus === selectedRequest.id ? 'Processing...' : 'Reject'}
                    </button>
                  </>
                )}
                <button
                  className="bg-gray-900 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-gray-800 w-full sm:w-auto"
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

export default memo(ProfileEditRequests);
