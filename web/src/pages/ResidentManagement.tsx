import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, setDoc, getDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

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
  waterBillingDate?: any;
  electricBillingDate?: any;
  billingProof?: string;
  location?: UserLocation;
  status?: 'pending' | 'approved' | 'rejected' | 'deactivated' | 'archived';
  createdAt?: any;
  updatedAt?: any;
}

function ResidentManagement() {
  const [user, setUser] = useState<any>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation] = useState<UserLocation | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'deactivated' | 'archived'>('all');
  const [residentTypeFilter, setResidentTypeFilter] = useState<'all' | 'homeowner' | 'tenant'>('all');
  const [blockFilter, setBlockFilter] = useState('');
  const [streetFilter, setStreetFilter] = useState('');
  const [isApproving, setIsApproving] = useState(false); // Flag to prevent redirect during approval
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine active view from URL
  const activeView = location.pathname.includes('/registered') ? 'registered' : 'applications';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Don't redirect if we're in the middle of approving a user
      if (isApproving) {
        console.log('Approval in progress, skipping auth state check');
        return;
      }
      
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
        // Only redirect if not approving
        if (!isApproving) {
          navigate('/');
        }
      }
    });

    return () => unsubscribe();
  }, [navigate, isApproving]);

  const fetchResidents = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Fetching residents from Firestore...');
      
      const residentsData: Resident[] = [];
      
      // Fetch based on active view
      if (activeView === 'applications') {
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
          // Filter out archived residents - they should be in archivedUsers collection
          // This is a safety check in case any archived residents are still in users collection
          if (data.status === 'archived') {
            console.log('Skipping archived resident:', doc.id);
            return;
          }
          residentsData.push({
            id: doc.id,
            ...data,
            status: data.status || 'approved', // Use actual status or default to approved
          } as Resident);
        });
      }
      
      // Sort manually if orderBy failed
      residentsData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${residentsData.length} residents from ${activeView === 'applications' ? 'pendingUsers' : 'users'}`);
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
  }, [db, activeView]);

  // Set up real-time listener for applications view
  useEffect(() => {
    if (!user || !db) return;
    
    if (activeView === 'applications') {
      console.log('Setting up real-time listener for pending applications...');
      setLoading(true);
      
      // Set up real-time listener for pendingUsers collection
      let q;
      try {
        q = query(collection(db, 'pendingUsers'), orderBy('createdAt', 'desc'));
      } catch (orderByError: any) {
        console.warn('orderBy failed, trying without orderBy:', orderByError);
        q = query(collection(db, 'pendingUsers'));
      }
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const residentsData: Resident[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          residentsData.push({
            id: doc.id,
            ...data,
            status: 'pending', // All pendingUsers are pending
          } as Resident);
        });
        
        // Sort manually if orderBy failed
        residentsData.sort((a, b) => {
          const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return bDate - aDate;
        });
        
        console.log(`Real-time update: ${residentsData.length} pending applications`);
        setResidents(residentsData);
        setLoading(false);
      }, (error) => {
        console.error('Error in real-time listener:', error);
        setLoading(false);
        alert(`Failed to load applications: ${error.message || 'Unknown error'}`);
      });
      
      return () => unsubscribe();
    } else {
      // For registered view, use one-time fetch
      console.log('Fetching registered residents...');
      fetchResidents();
    }
  }, [user, db, activeView, fetchResidents]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    statusFilter,
    residentTypeFilter,
    blockFilter,
    streetFilter,
    activeView,
    residents.length,
  ]);
  
  // Redirect to applications if on base route
  useEffect(() => {
    if (location.pathname === '/resident-management') {
      navigate('/resident-management/applications', { replace: true });
    }
  }, [location.pathname, navigate]);


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

  const handleApprove = useCallback(async (residentId: string): Promise<boolean> => {
    if (!db || !auth) {
      console.error('Database or auth not available');
      return false;
    }
    
    // Get the pending user data for confirmation and processing
    const pendingUserRef = doc(db, 'pendingUsers', residentId);
    console.log(`Fetching pending user document: ${residentId}`);
    let pendingUserSnap;
    let pendingUserData;
    
    try {
      pendingUserSnap = await getDoc(pendingUserRef);
      
      if (!pendingUserSnap.exists()) {
        console.error(`Pending user document ${residentId} does not exist`);
        alert('Pending user not found');
        return false;
      }
      
      pendingUserData = pendingUserSnap.data();
      const fullName = pendingUserData.fullName || 
        `${pendingUserData.firstName || ''} ${pendingUserData.lastName || ''}`.trim() || 
        'this resident';
      
      // Show confirmation dialog
      const confirmed = window.confirm(
        `Are you sure you want to approve the application for ${fullName}?\n\n` +
        `This will create their account and allow them to log in to the mobile app.`
      );
      
      if (!confirmed) {
        return false;
      }
    } catch (error) {
      console.error('Error fetching resident data:', error);
      alert('Error loading application data. Please try again.');
      return false;
    }
    
    // Get current activeView to ensure we refresh the correct view
    const currentView = location.pathname.includes('/registered') ? 'registered' : 'applications';
    console.log(`Approving resident ${residentId} from ${currentView} view`);
    
    setProcessingStatus(residentId);
    try {
      console.log('Pending user data retrieved:', { username: pendingUserData.username, hasPassword: !!pendingUserData.password });
      const { username, password, ...userData } = pendingUserData;
      
      if (!username || !password) {
        console.error('Missing username or password in pending user data');
        throw new Error('Missing username or password in pending user data');
      }
      
      // Store current admin user info before creating new user
      const currentAdmin = auth.currentUser;
      if (!currentAdmin) {
        throw new Error('Admin session not found. Please log in again.');
      }
      const adminEmail = currentAdmin.email;
      const adminUid = currentAdmin.uid;
      console.log(`Current admin: ${adminEmail} (${adminUid})`);
      
      // Set flag to prevent redirect during approval
      setIsApproving(true);
      
      // Create a separate Firebase app instance for user creation
      // This prevents the new user from replacing the admin session
      const { initializeApp, getApp } = await import('firebase/app');
      const { getAuth: getAuthSeparate, createUserWithEmailAndPassword: createUserSeparate, signOut: signOutSeparate } = await import('firebase/auth');
      
      // Use a separate app instance with a different name
      let separateApp;
      const separateAppName = 'userCreationApp';
      
      try {
        // Try to get existing app instance
        separateApp = getApp(separateAppName);
      } catch (e) {
        // App doesn't exist, create it with the same config as the main app
        const firebaseConfig = {
          apiKey: "AIzaSyAcWeoaUkuWyODs2dLwP9wblhGm7uBg6HA",
          authDomain: "subsibuddy-88108.firebaseapp.com",
          projectId: "subsibuddy-88108",
          storageBucket: "subsibuddy-88108.firebasestorage.app",
          messagingSenderId: "9632330814",
          appId: "1:9632330814:web:a40032aa07f294eb0dcd6f",
          measurementId: "G-YTVMYLV5J2"
        };
        separateApp = initializeApp(firebaseConfig, separateAppName);
      }
      
      const separateAuth = getAuthSeparate(separateApp);
      
      // Create Firebase Auth account using the separate auth instance
      // This won't affect the main admin session
      console.log('Creating Firebase Auth account with separate instance...');
      const userCredential = await createUserSeparate(separateAuth, username, password);
      const user = userCredential.user;
      console.log(`Firebase Auth account created with UID: ${user.uid}`);
      
      // Move to users collection with the Firebase Auth UID
      console.log(`Saving to users collection with UID: ${user.uid}`);
      console.log('User data to save:', {
        hasLocation: !!userData.location,
        location: userData.location,
        residentType: userData.residentType,
        isTenant: userData.isTenant,
        fullName: userData.fullName,
      });
      await setDoc(doc(db, 'users', user.uid), {
        ...userData,
        status: 'approved',
        updatedAt: Timestamp.now(),
      });
      console.log('User saved to users collection successfully');
      
      // Delete from pendingUsers collection
      console.log(`Deleting pending user document: ${residentId}`);
      await deleteDoc(pendingUserRef);
      console.log(`Successfully deleted pending user ${residentId} from pendingUsers collection`);
      
      // Sign out the newly created user from the separate auth instance
      console.log('Signing out newly created user from separate instance...');
      await signOutSeparate(separateAuth);
      
      // Verify admin session is still intact
      const adminStillLoggedIn = auth.currentUser;
      if (!adminStillLoggedIn || adminStillLoggedIn.uid !== adminUid) {
        console.warn('Admin session was lost. This should not happen with separate app instance.');
        throw new Error('Admin session was lost during approval. Please try again.');
      }
      console.log('Admin session preserved successfully');
      
      // Clear the approval flag
      setIsApproving(false);
      
      // Update local state - remove from list immediately
      setResidents(prev => {
        const beforeCount = prev.length;
        const filtered = prev.filter(r => r.id !== residentId);
        console.log(`Removed resident ${residentId} from local state. Before: ${beforeCount}, After: ${filtered.length}`);
        return filtered;
      });
      
      alert('Resident approved successfully');
      
      // No need to manually refresh - real-time listener will update automatically
      // The application will be removed from the list when deleted from pendingUsers
      
      // Update local state - remove from list immediately for better UX
      setResidents(prev => {
        const beforeCount = prev.length;
        const filtered = prev.filter(r => {
          const shouldKeep = r.id !== residentId;
          if (!shouldKeep) {
            console.log(`Filtering out resident: ${r.id} (matches ${residentId})`);
          }
          return shouldKeep;
        });
        console.log(`Removed resident ${residentId} from local state. Before: ${beforeCount}, After: ${filtered.length}`);
        return filtered;
      });
      
      alert('Resident approved successfully');
      
      // No need to manually refresh - real-time listener will update automatically
      // The application will be removed from the list when deleted from pendingUsers
      return true;
    } catch (error: any) {
      console.error('Error approving resident:', error);
      let errorMessage = `Failed to approve resident: ${error.message}`;
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email or phone number is already registered. Please check the pending user data.';
      }
      alert(errorMessage);
      return false;
    } finally {
      setProcessingStatus(null);
    }
  }, [db, auth, fetchResidents, location.pathname]);

  const handleReject = useCallback(async (residentId: string): Promise<boolean> => {
    if (!db) return false;
    
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || reason.trim() === '') {
      return false;
    }
    
    setProcessingStatus(residentId);
    try {
      // Delete from pendingUsers collection (rejected applications are removed)
      await deleteDoc(doc(db, 'pendingUsers', residentId));
      
      // Update local state - remove from list
      setResidents(prev => prev.filter(r => r.id !== residentId));
      
      // No need to manually refresh - real-time listener will update automatically
      // The application will be removed from the list when deleted from pendingUsers
      
      alert('Application rejected and removed');
      return true;
    } catch (error: any) {
      console.error('Error rejecting resident:', error);
      alert(`Failed to reject application: ${error.message}`);
      return false;
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleDeactivate = useCallback(async (residentId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to deactivate this resident? They will not be able to log in until reactivated.')) {
      return;
    }
    
    setProcessingStatus(residentId);
    try {
      const residentRef = doc(db, 'users', residentId);
      await updateDoc(residentRef, {
        status: 'deactivated',
        updatedAt: Timestamp.now(),
      });
      
      // Update local state
      setResidents(prev => prev.map(r => 
        r.id === residentId ? { ...r, status: 'deactivated' } : r
      ));
      
      alert('Resident deactivated successfully');
    } catch (error: any) {
      console.error('Error deactivating resident:', error);
      alert(`Failed to deactivate resident: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleActivate = useCallback(async (residentId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to activate this resident? They will be able to log in again.')) {
      return;
    }
    
    setProcessingStatus(residentId);
    try {
      const residentRef = doc(db, 'users', residentId);
      await updateDoc(residentRef, {
        status: 'approved',
        updatedAt: Timestamp.now(),
      });
      
      // Update local state
      setResidents(prev => prev.map(r => 
        r.id === residentId ? { ...r, status: 'approved' } : r
      ));
      
      alert('Resident activated successfully');
    } catch (error: any) {
      console.error('Error activating resident:', error);
      alert(`Failed to activate resident: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleArchive = useCallback(async (residentId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to archive this resident? Archived residents will be moved to archive and can be restored later.')) {
      return;
    }
    
    setProcessingStatus(residentId);
    try {
      // Get the resident data from users collection
      const residentRef = doc(db, 'users', residentId);
      const residentDoc = await getDoc(residentRef);
      
      if (!residentDoc.exists()) {
        throw new Error('Resident not found');
      }
      
      const residentData = residentDoc.data();
      
      // Move to archivedUsers collection
      await setDoc(doc(db, 'archivedUsers', residentId), {
        ...residentData,
        status: 'archived',
        archivedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      // Delete from users collection
      await deleteDoc(residentRef);
      
      // Update local state - remove from list
      setResidents(prev => prev.filter(r => r.id !== residentId));
      
      alert('Resident archived successfully');
    } catch (error: any) {
      console.error('Error archiving resident:', error);
      alert(`Failed to archive resident: ${error.message}`);
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
      case 'deactivated':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">Deactivated</span>;
      case 'archived':
        return <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">Archived</span>;
      case 'pending':
      default:
        return <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>;
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title={activeView === 'applications' ? 'Applications' : 'Registered Residents'} />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
                <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">
                  {activeView === 'applications' ? 'Pending Applications' : 'Registered Residents'}
                </h2>
              </div>

              {activeView === 'registered' && (
                <div className="mb-5 md:mb-6 space-y-4">
                  <div className="flex flex-col md:flex-row gap-3 items-start md:items-center md:justify-end">
                    <input
                      type="text"
                      placeholder="Search by name, email, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full md:w-[320px] px-3 md:px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                      className="px-4 py-2 text-sm bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('all');
                        setResidentTypeFilter('all');
                        setBlockFilter('');
                        setStreetFilter('');
                      }}
                    >
                      Reset Filters
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:flex md:flex-wrap md:items-end">
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Status</label>
                      <select
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                      >
                        <option value="all">All</option>
                        <option value="approved">Approved</option>
                        <option value="deactivated">Deactivated</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Resident Type</label>
                      <select
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                        value={residentTypeFilter}
                        onChange={(e) => setResidentTypeFilter(e.target.value as any)}
                      >
                        <option value="all">All</option>
                        <option value="homeowner">Homeowner</option>
                        <option value="tenant">Tenant</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Block</label>
                      <select
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                        value={blockFilter}
                        onChange={(e) => setBlockFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        {Array.from(new Set(residents.map(r => r.address?.block).filter(Boolean))).map((block) => (
                          <option key={block as string} value={block as string}>{block as string}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Street</label>
                      <select
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                        value={streetFilter}
                        onChange={(e) => setStreetFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        {Array.from(new Set(residents.map(r => r.address?.street).filter(Boolean))).map((street) => (
                          <option key={street as string} value={street as string}>{street as string}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                // Filter residents based on search query (only for registered view)
                let filteredResidents = residents;

                if (activeView === 'registered') {
                  if (statusFilter !== 'all') {
                    filteredResidents = filteredResidents.filter(r => r.status === statusFilter);
                  }
                  if (residentTypeFilter !== 'all') {
                    if (residentTypeFilter === 'tenant') {
                      filteredResidents = filteredResidents.filter(r => r.isTenant || r.residentType === 'tenant');
                    } else {
                      filteredResidents = filteredResidents.filter(r => !(r.isTenant || r.residentType === 'tenant'));
                    }
                  }
                  if (blockFilter) {
                    filteredResidents = filteredResidents.filter(r => (r.address?.block || '').toLowerCase() === blockFilter.toLowerCase());
                  }
                  if (streetFilter) {
                    filteredResidents = filteredResidents.filter(r => (r.address?.street || '').toLowerCase() === streetFilter.toLowerCase());
                  }
                }
                if (activeView === 'registered' && searchQuery.trim()) {
                  const query = searchQuery.toLowerCase().trim();
                  filteredResidents = filteredResidents.filter(resident => {
                    const fullName = (resident.fullName || '').toLowerCase();
                    const firstName = (resident.firstName || '').toLowerCase();
                    const lastName = (resident.lastName || '').toLowerCase();
                    const email = (resident.email || '').toLowerCase();
                    const phone = (resident.phone || '').toLowerCase();
                    
                    return fullName.includes(query) ||
                           firstName.includes(query) ||
                           lastName.includes(query) ||
                           email.includes(query) ||
                           phone.includes(query);
                  });
                }

                const totalPages = Math.max(1, Math.ceil(filteredResidents.length / ITEMS_PER_PAGE));
                const safePage = Math.min(currentPage, totalPages);
                const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
                const paginatedResidents = filteredResidents.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                return (
                  <>
                    {loading && residents.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading residents...</div>
                    ) : filteredResidents.length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          {activeView === 'applications' 
                            ? 'No pending applications found.' 
                            : 'No registered residents found.'}
                        </p>
                        <p className="text-xs text-gray-400 mt-2.5">
                          {activeView === 'applications'
                            ? 'New signups will appear here for approval.'
                            : 'Approved residents will appear here.'}
                        </p>
                      </div>
                    ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {paginatedResidents.map((resident) => (
                      <div key={resident.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm mb-1">{resident.fullName || 'N/A'}</h3>
                            <p className="text-xs text-gray-500 mb-2">{formatDate(resident.createdAt)}</p>
                          </div>
                          <div className="flex-shrink-0">
                            {getStatusBadge(resident.status)}
                          </div>
                        </div>
                        
                        <div className="space-y-2 mb-3">
                          <div>
                            <span className="text-xs font-medium text-gray-600">Email/Phone: </span>
                            <span className="text-xs text-gray-900">{resident.email || resident.phone || 'N/A'}</span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-3 border-t border-gray-200">
                          <button
                            className="w-full bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                            onClick={() => handleViewDetails(resident)}
                          >
                            View Details
                          </button>
                          {activeView === 'applications' && (
                            <div className="flex gap-2">
                              <button
                                className="flex-1 bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleApprove(resident.id)}
                                disabled={processingStatus === resident.id}
                              >
                                {processingStatus === resident.id ? 'Processing...' : 'Approve'}
                              </button>
                              <button
                                className="flex-1 bg-red-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleReject(resident.id)}
                                disabled={processingStatus === resident.id}
                              >
                                {processingStatus === resident.id ? 'Processing...' : 'Reject'}
                              </button>
                            </div>
                          )}
                          {activeView === 'registered' && (
                            <div className="flex gap-2 flex-wrap">
                              {resident.status !== 'deactivated' && resident.status !== 'archived' && (
                                <button
                                  className="flex-1 bg-orange-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleDeactivate(resident.id)}
                                  disabled={processingStatus === resident.id}
                                >
                                  {processingStatus === resident.id ? 'Processing...' : 'Deactivate'}
                                </button>
                              )}
                              {resident.status === 'deactivated' && (
                                <button
                                  className="flex-1 bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleActivate(resident.id)}
                                  disabled={processingStatus === resident.id}
                                >
                                  {processingStatus === resident.id ? 'Processing...' : 'Activate'}
                                </button>
                              )}
                              {resident.status !== 'archived' && (
                                <button
                                  className="flex-1 bg-purple-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleArchive(resident.id)}
                                  disabled={processingStatus === resident.id}
                                >
                                  {processingStatus === resident.id ? 'Processing...' : 'Archive'}
                                </button>
                              )}
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
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Full Name</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Email/Phone</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Created At</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedResidents.map((resident) => (
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
                              {activeView === 'applications' && (
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
                              {activeView === 'registered' && resident.status !== 'deactivated' && resident.status !== 'archived' && (
                                <button
                                  className="bg-orange-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleDeactivate(resident.id)}
                                  disabled={processingStatus === resident.id}
                                >
                                  {processingStatus === resident.id ? 'Processing...' : 'Deactivate'}
                                </button>
                              )}
                              {activeView === 'registered' && resident.status === 'deactivated' && (
                                <button
                                  className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleActivate(resident.id)}
                                  disabled={processingStatus === resident.id}
                                >
                                  {processingStatus === resident.id ? 'Processing...' : 'Activate'}
                                </button>
                              )}
                              {activeView === 'registered' && resident.status !== 'archived' && (
                                <button
                                  className="bg-purple-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleArchive(resident.id)}
                                  disabled={processingStatus === resident.id}
                                >
                                  {processingStatus === resident.id ? 'Processing...' : 'Archive'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {filteredResidents.length > 0 && (
                        <div className="flex items-center justify-between mt-4 gap-3">
                          <span className="text-xs text-gray-600">
                            Page {safePage} of {totalPages}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              className="px-3 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={safePage === 1}
                            >
                              Previous
                            </button>
                            <button
                              className="px-3 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={safePage === totalPages}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </main>

        {showMapModal && selectedLocation && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={() => setShowMapModal(false)}>
            <div className="bg-white rounded-lg sm:rounded-2xl w-full max-w-[900px] max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-lg sm:text-xl font-normal">Resident Location</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => setShowMapModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="w-full h-[300px] sm:h-[500px] relative overflow-hidden">
                <iframe
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedLocation.longitude - 0.01},${selectedLocation.latitude - 0.01},${selectedLocation.longitude + 0.01},${selectedLocation.latitude + 0.01}&layer=mapnik&marker=${selectedLocation.latitude},${selectedLocation.longitude}`}
                  width="100%"
                  height="100%"
                  style={{ border: 'none' }}
                  title="Resident Location Map"
                />
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                <p className="m-0 text-gray-600 text-xs sm:text-sm break-all sm:break-normal">
                  Coordinates: {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </p>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${selectedLocation.latitude}&mlon=${selectedLocation.longitude}&zoom=15`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-white no-underline px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all inline-block hover:bg-primary-dark hover:-translate-y-0.5 w-full sm:w-auto text-center"
                >
                  Open in OpenStreetMap
                </a>
              </div>
            </div>
          </div>
        )}

        {showDetailsModal && selectedResident && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={() => setShowDetailsModal(false)}>
            <div className="bg-white rounded-lg sm:rounded-2xl w-full max-w-[800px] max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-lg sm:text-xl font-normal">Resident Details</h3>
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
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Water Billing Date</label>
                    <p className="text-gray-900">{formatDate(selectedResident.waterBillingDate)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Electricity Billing Date</label>
                    <p className="text-gray-900">{formatDate(selectedResident.electricBillingDate)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Created At</label>
                    <p className="text-gray-900">{formatDate(selectedResident.createdAt)}</p>
                  </div>
                </div>

                {(selectedResident.idFront ||
                  selectedResident.idBack ||
                  selectedResident.billingProof ||
                  (selectedResident.documents && Object.keys(selectedResident.documents).length > 0)) && (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Images</label>
                    <div className="flex flex-wrap gap-3">
                      {selectedResident.idFront && (
                        <button
                          type="button"
                          className="bg-transparent border-none p-0 cursor-pointer text-left"
                          onClick={() => window.open(selectedResident.idFront, '_blank')}
                        >
                          <div className="w-24 h-24 rounded border border-gray-200 overflow-hidden">
                            <img
                              src={selectedResident.idFront}
                              alt="ID Front"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="block mt-1 text-[11px] text-gray-600">ID Front</span>
                        </button>
                      )}

                      {selectedResident.idBack && (
                        <button
                          type="button"
                          className="bg-transparent border-none p-0 cursor-pointer text-left"
                          onClick={() => window.open(selectedResident.idBack, '_blank')}
                        >
                          <div className="w-24 h-24 rounded border border-gray-200 overflow-hidden">
                            <img
                              src={selectedResident.idBack}
                              alt="ID Back"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="block mt-1 text-[11px] text-gray-600">ID Back</span>
                        </button>
                      )}

                      {selectedResident.billingProof && (
                        <button
                          type="button"
                          className="bg-transparent border-none p-0 cursor-pointer text-left"
                          onClick={() => window.open(selectedResident.billingProof as string, '_blank')}
                        >
                          <div className="w-24 h-24 rounded border border-gray-200 overflow-hidden">
                            <img
                              src={selectedResident.billingProof as string}
                              alt="Billing Proof"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="block mt-1 text-[11px] text-gray-600">Billing Proof</span>
                        </button>
                      )}

                      {selectedResident.documents &&
                        Object.entries(selectedResident.documents).map(([key, url]) => (
                          <button
                            key={key}
                            type="button"
                            className="bg-transparent border-none p-0 cursor-pointer text-left"
                            onClick={() => window.open(url, '_blank')}
                          >
                            <div className="w-24 h-24 rounded border border-gray-200 overflow-hidden">
                              <img
                                src={url}
                                alt={key}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="block mt-1 text-[11px] text-gray-600">
                              {key.replace('doc', 'Document ')}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                {activeView === 'applications' && (
                  <>
                    <button
                      className="bg-green-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                      onClick={async () => {
                        const success = await handleApprove(selectedResident.id);
                        // Only close modal on success
                        if (success) {
                          setShowDetailsModal(false);
                        }
                      }}
                      disabled={processingStatus === selectedResident.id}
                    >
                      {processingStatus === selectedResident.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      className="bg-red-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                      onClick={async () => {
                        const success = await handleReject(selectedResident.id);
                        // Only close modal on success
                        if (success) {
                          setShowDetailsModal(false);
                        }
                      }}
                      disabled={processingStatus === selectedResident.id}
                    >
                      {processingStatus === selectedResident.id ? 'Processing...' : 'Reject'}
                    </button>
                  </>
                )}
                {activeView === 'registered' && selectedResident.status !== 'deactivated' && selectedResident.status !== 'archived' && (
                  <button
                    className="bg-orange-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                    onClick={() => {
                      handleDeactivate(selectedResident.id);
                      setShowDetailsModal(false);
                    }}
                    disabled={processingStatus === selectedResident.id}
                  >
                    {processingStatus === selectedResident.id ? 'Processing...' : 'Deactivate'}
                  </button>
                )}
                {activeView === 'registered' && selectedResident.status === 'deactivated' && (
                  <button
                    className="bg-green-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                    onClick={() => {
                      handleActivate(selectedResident.id);
                      setShowDetailsModal(false);
                    }}
                    disabled={processingStatus === selectedResident.id}
                  >
                    {processingStatus === selectedResident.id ? 'Processing...' : 'Activate'}
                  </button>
                )}
                {activeView === 'registered' && selectedResident.status !== 'archived' && (
                  <button
                    className="bg-purple-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                    onClick={() => {
                      handleArchive(selectedResident.id);
                      setShowDetailsModal(false);
                    }}
                    disabled={processingStatus === selectedResident.id}
                  >
                    {processingStatus === selectedResident.id ? 'Processing...' : 'Archive'}
                  </button>
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

export default memo(ResidentManagement);
