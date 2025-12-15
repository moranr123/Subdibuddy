import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc, getDoc, Timestamp, addDoc, where, updateDoc } from 'firebase/firestore';
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
  | 'vehicle-registration'

interface ArchivedBilling {
  id: string;
  residentEmail?: string;
  billingCycle?: string;
  amount?: number;
  dueDate?: any;
  billingType?: string;
  status?: string;
  userProofStatus?: string;
  archivedAt?: any;
  updatedAt?: any;
}

interface ArchivedComplaint {
  id: string;
  subject: string;
  description: string;
  userId: string;
  userEmail: string;
  status: string;
  rejectionReason?: string;
  imageURL?: string;
  createdAt: any;
  updatedAt?: any;
  archivedAt: any;
  archivedBy: string;
}

interface ArchivedVehicleRegistration {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  color: string;
  year: string;
  vehicleType: string;
  registrationImageURL?: string;
  vehicleImageURL?: string;
  status: string;
  rejectionReason?: string;
  userId: string;
  userEmail: string;
  createdAt: any;
  updatedAt?: any;
  archivedAt: any;
  archivedBy: string;
}

interface ArchivedMaintenance {
  id: string;
  maintenanceType: 'Water' | 'Electricity' | 'Garbage disposal';
  description: string;
  status: string;
  rejectionReason?: string;
  imageURL?: string;
  userId: string;
  userEmail: string;
  createdAt: any;
  updatedAt?: any;
  archivedAt: any;
  archivedBy: string;
}

interface ArchivedVisitor {
  id: string;
  visitorName: string;
  visitorEmail?: string;
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
  archivedAt: any;
  archivedBy: string;
  originalId?: string;
}

interface ArchivedAnnouncement {
  id: string;
  title: string;
  content: string;
  imageURL?: string;
  isActive: boolean;
  priority?: 'low' | 'medium' | 'high';
  createdAt: any;
  updatedAt?: any;
  archivedAt: any;
  archivedBy: string;
  originalId?: string;
}

function Archived() {
  const [user, setUser] = useState<any>(null);
  const [searchParams] = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<FilterType>('announcement');
  const [archivedResidents, setArchivedResidents] = useState<Resident[]>([]);
  const [archivedComplaints, setArchivedComplaints] = useState<ArchivedComplaint[]>([]);
  const [archivedVehicleRegistrations, setArchivedVehicleRegistrations] = useState<ArchivedVehicleRegistration[]>([]);
  const [archivedMaintenance, setArchivedMaintenance] = useState<ArchivedMaintenance[]>([]);
  const [archivedBillings, setArchivedBillings] = useState<ArchivedBilling[]>([]);
  const [archivedVisitors, setArchivedVisitors] = useState<ArchivedVisitor[]>([]);
  const [archivedAnnouncements, setArchivedAnnouncements] = useState<ArchivedAnnouncement[]>([]);
  const [filteredArchivedComplaints, setFilteredArchivedComplaints] = useState<ArchivedComplaint[]>([]);
  const [filteredArchivedResidents, setFilteredArchivedResidents] = useState<Resident[]>([]);
  const [filteredArchivedVehicleRegistrations, setFilteredArchivedVehicleRegistrations] = useState<ArchivedVehicleRegistration[]>([]);
  const [filteredArchivedMaintenance, setFilteredArchivedMaintenance] = useState<ArchivedMaintenance[]>([]);
  const [filteredArchivedBillings, setFilteredArchivedBillings] = useState<ArchivedBilling[]>([]);
  const [filteredArchivedVisitors, setFilteredArchivedVisitors] = useState<ArchivedVisitor[]>([]);
  const [filteredArchivedAnnouncements, setFilteredArchivedAnnouncements] = useState<ArchivedAnnouncement[]>([]);
  const [vehicleRegistrationUserNames, setVehicleRegistrationUserNames] = useState<Record<string, string>>({});
  const [complaintUserNames, setComplaintUserNames] = useState<Record<string, string>>({});
  const [maintenanceUserNames, setMaintenanceUserNames] = useState<Record<string, string>>({});
  const [visitorResidentNames, setVisitorResidentNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [loadingVehicleRegistrations, setLoadingVehicleRegistrations] = useState(false);
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [loadingBillings, setLoadingBillings] = useState(false);
  const [loadingVisitors, setLoadingVisitors] = useState(false);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [viewingComplaint, setViewingComplaint] = useState<ArchivedComplaint | null>(null);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [viewingVehicleRegistration, setViewingVehicleRegistration] = useState<ArchivedVehicleRegistration | null>(null);
  const [showVehicleRegistrationModal, setShowVehicleRegistrationModal] = useState(false);
  const [viewingMaintenance, setViewingMaintenance] = useState<ArchivedMaintenance | null>(null);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [filterDate, setFilterDate] = useState<string>('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
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

  // Set filter from URL parameter
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam && ['announcement', 'complaints', 'visitor-pre-registration', 'residents-applications', 'registered-residents', 'billings-payments', 'maintenance', 'vehicle-registration'].includes(filterParam)) {
      setActiveFilter(filterParam as FilterType);
    }
  }, [searchParams]);

  const fetchArchivedComplaints = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoadingComplaints(true);
      console.log('Fetching archived complaints from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'archivedComplaints'), orderBy('archivedAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(collection(db, 'archivedComplaints'));
      }
      
      const complaintsData: ArchivedComplaint[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        complaintsData.push({
          id: doc.id,
          ...data,
        } as ArchivedComplaint);
      });
      
      complaintsData.sort((a, b) => {
        const aDate = a.archivedAt?.toDate ? a.archivedAt.toDate().getTime() : 0;
        const bDate = b.archivedAt?.toDate ? b.archivedAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${complaintsData.length} archived complaints`);
      setArchivedComplaints(complaintsData);
    } catch (error: any) {
      console.error('Error fetching archived complaints:', error);
      alert(`Failed to load archived complaints: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingComplaints(false);
    }
  }, [db]);

  const fetchArchivedBillings = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoadingBillings(true);
      console.log('Fetching archived billings from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'billings'), where('archived', '==', true), orderBy('updatedAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(query(collection(db, 'billings'), where('archived', '==', true)));
      }
      
      const billingsData: ArchivedBilling[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        billingsData.push({
          id: docSnap.id,
          ...data,
        } as ArchivedBilling);
      });
      
      billingsData.sort((a, b) => {
        const aDate = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
        const bDate = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${billingsData.length} archived billings`);
      setArchivedBillings(billingsData);
    } catch (error: any) {
      console.error('Error fetching archived billings:', error);
      alert(`Failed to load archived billings: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingBillings(false);
    }
  }, [db]);

  const handleRestoreBilling = useCallback(async (billingId: string) => {
    if (!db) return;

    if (!window.confirm('Are you sure you want to restore this billing?')) {
      return;
    }

    try {
      await updateDoc(doc(db, 'billings', billingId), {
        archived: false,
        archivedAt: null,
        updatedAt: Timestamp.now(),
      });

      setArchivedBillings(prev => prev.filter(b => b.id !== billingId));
      setFilteredArchivedBillings(prev => prev.filter(b => b.id !== billingId));

      alert('Billing restored successfully');
    } catch (error: any) {
      console.error('Error restoring billing:', error);
      alert(`Failed to restore billing: ${error.message || 'Unknown error'}`);
    }
  }, [db]);

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

  const fetchArchivedVehicleRegistrations = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoadingVehicleRegistrations(true);
      console.log('Fetching archived vehicle registrations from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'archivedVehicleRegistrations'), orderBy('archivedAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy archivedAt failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(collection(db, 'archivedVehicleRegistrations'));
      }
      
      const registrationsData: ArchivedVehicleRegistration[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        registrationsData.push({
          id: doc.id,
          ...data,
        } as ArchivedVehicleRegistration);
      });
      
      registrationsData.sort((a, b) => {
        const aDate = a.archivedAt?.toDate ? a.archivedAt.toDate().getTime() : 0;
        const bDate = b.archivedAt?.toDate ? b.archivedAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${registrationsData.length} archived vehicle registrations`);
      setArchivedVehicleRegistrations(registrationsData);
    } catch (error: any) {
      console.error('Error fetching archived vehicle registrations:', error);
      alert(`Failed to load archived vehicle registrations: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingVehicleRegistrations(false);
    }
  }, [db]);

  // Fetch user names for archived vehicle registrations
  useEffect(() => {
    if (!db || archivedVehicleRegistrations.length === 0) return;

    const fetchUserNames = async () => {
      const userIds = [...new Set(archivedVehicleRegistrations.map(r => r.userId))];
      const namesMap: Record<string, string> = {};

      for (const userId of userIds) {
        if (vehicleRegistrationUserNames[userId]) {
          namesMap[userId] = vehicleRegistrationUserNames[userId];
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
            namesMap[userId] = archivedVehicleRegistrations.find(r => r.userId === userId)?.userEmail || 'Unknown User';
          }
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          namesMap[userId] = archivedVehicleRegistrations.find(r => r.userId === userId)?.userEmail || 'Unknown User';
        }
      }

      setVehicleRegistrationUserNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchUserNames();
  }, [db, archivedVehicleRegistrations]);

  // Fetch user names for archived complaints
  useEffect(() => {
    if (!db || archivedComplaints.length === 0) return;

    const fetchUserNames = async () => {
      const userIds = [...new Set(archivedComplaints.map(c => c.userId))];
      const namesMap: Record<string, string> = {};

      for (const userId of userIds) {
        if (complaintUserNames[userId]) {
          namesMap[userId] = complaintUserNames[userId];
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
            namesMap[userId] = archivedComplaints.find(c => c.userId === userId)?.userEmail || 'Unknown User';
          }
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          namesMap[userId] = archivedComplaints.find(c => c.userId === userId)?.userEmail || 'Unknown User';
        }
      }

      setComplaintUserNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchUserNames();
  }, [db, archivedComplaints]);

  const fetchArchivedMaintenance = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoadingMaintenance(true);
      console.log('Fetching archived maintenance from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'archivedMaintenance'), orderBy('archivedAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy archivedAt failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(collection(db, 'archivedMaintenance'));
      }
      
      const maintenanceData: ArchivedMaintenance[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        maintenanceData.push({
          id: doc.id,
          ...data,
        } as ArchivedMaintenance);
      });
      
      maintenanceData.sort((a, b) => {
        const aDate = a.archivedAt?.toDate ? a.archivedAt.toDate().getTime() : 0;
        const bDate = b.archivedAt?.toDate ? b.archivedAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${maintenanceData.length} archived maintenance requests`);
      setArchivedMaintenance(maintenanceData);
    } catch (error: any) {
      console.error('Error fetching archived maintenance:', error);
      alert(`Failed to load archived maintenance: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingMaintenance(false);
    }
  }, [db]);

  // Fetch user names for archived maintenance
  useEffect(() => {
    if (!db || archivedMaintenance.length === 0) return;

    const fetchUserNames = async () => {
      const userIds = [...new Set(archivedMaintenance.map(m => m.userId))];
      const namesMap: Record<string, string> = {};

      for (const userId of userIds) {
        if (maintenanceUserNames[userId]) {
          namesMap[userId] = maintenanceUserNames[userId];
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
            namesMap[userId] = archivedMaintenance.find(m => m.userId === userId)?.userEmail || 'Unknown User';
          }
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          namesMap[userId] = archivedMaintenance.find(m => m.userId === userId)?.userEmail || 'Unknown User';
        }
      }

      setMaintenanceUserNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchUserNames();
  }, [db, archivedMaintenance]);

  const fetchArchivedVisitors = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoadingVisitors(true);
      console.log('Fetching archived visitors from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'archivedVisitors'), orderBy('archivedAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy archivedAt failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(collection(db, 'archivedVisitors'));
      }
      
      const visitorsData: ArchivedVisitor[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        visitorsData.push({
          id: doc.id,
          ...data,
        } as ArchivedVisitor);
      });
      
      visitorsData.sort((a, b) => {
        const aDate = a.archivedAt?.toDate ? a.archivedAt.toDate().getTime() : 0;
        const bDate = b.archivedAt?.toDate ? b.archivedAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${visitorsData.length} archived visitors`);
      setArchivedVisitors(visitorsData);
    } catch (error: any) {
      console.error('Error fetching archived visitors:', error);
      alert(`Failed to load archived visitors: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingVisitors(false);
    }
  }, [db]);

  const fetchArchivedAnnouncements = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoadingAnnouncements(true);
      console.log('Fetching archived announcements from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'archivedAnnouncements'), orderBy('archivedAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy archivedAt failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(collection(db, 'archivedAnnouncements'));
      }
      
      const announcementsData: ArchivedAnnouncement[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        announcementsData.push({
          id: doc.id,
          ...data,
        } as ArchivedAnnouncement);
      });
      
      announcementsData.sort((a, b) => {
        const aDate = a.archivedAt?.toDate ? a.archivedAt.toDate().getTime() : 0;
        const bDate = b.archivedAt?.toDate ? b.archivedAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${announcementsData.length} archived announcements`);
      setArchivedAnnouncements(announcementsData);
    } catch (error: any) {
      console.error('Error fetching archived announcements:', error);
      alert(`Failed to load archived announcements: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingAnnouncements(false);
    }
  }, [db]);

  // Fetch resident names for archived visitors
  useEffect(() => {
    if (!db || archivedVisitors.length === 0) return;

    const fetchResidentNames = async () => {
      const residentIds = [...new Set(archivedVisitors.map(v => v.residentId))];
      const namesMap: Record<string, string> = {};

      for (const residentId of residentIds) {
        if (visitorResidentNames[residentId]) {
          namesMap[residentId] = visitorResidentNames[residentId];
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
            namesMap[residentId] = archivedVisitors.find(v => v.residentId === residentId)?.residentEmail || 'Unknown Resident';
          }
        } catch (error) {
          console.error(`Error fetching resident ${residentId}:`, error);
          namesMap[residentId] = archivedVisitors.find(v => v.residentId === residentId)?.residentEmail || 'Unknown Resident';
        }
      }

      setVisitorResidentNames(prev => ({ ...prev, ...namesMap }));
    };

    fetchResidentNames();
  }, [db, archivedVisitors]);

  useEffect(() => {
    if (user && db) {
      if (activeFilter === 'registered-residents') {
      console.log('Fetching archived residents for registered-residents filter');
      fetchArchivedResidents();
      } else if (activeFilter === 'complaints') {
        fetchArchivedComplaints();
      } else if (activeFilter === 'vehicle-registration') {
        fetchArchivedVehicleRegistrations();
      } else if (activeFilter === 'maintenance') {
        fetchArchivedMaintenance();
      } else if (activeFilter === 'billings-payments') {
        fetchArchivedBillings();
      } else if (activeFilter === 'visitor-pre-registration') {
        fetchArchivedVisitors();
      } else if (activeFilter === 'announcement') {
        fetchArchivedAnnouncements();
      } else {
        // Clear data when switching to a different filter
      setArchivedResidents([]);
        setArchivedComplaints([]);
        setArchivedVehicleRegistrations([]);
        setArchivedMaintenance([]);
        setArchivedBillings([]);
        setArchivedVisitors([]);
        setArchivedAnnouncements([]);
    }
    }
  }, [user, activeFilter, db, fetchArchivedResidents, fetchArchivedComplaints, fetchArchivedVehicleRegistrations, fetchArchivedMaintenance, fetchArchivedBillings, fetchArchivedVisitors, fetchArchivedAnnouncements]);

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

  const handleRestoreComplaint = useCallback(async (complaintId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to restore this complaint? It will be moved back to the complaints screen.')) {
      return;
    }
    
    setProcessingStatus(complaintId);
    try {
      // Get the complaint data from archivedComplaints collection
      const archivedRef = doc(db, 'archivedComplaints', complaintId);
      const archivedDoc = await getDoc(archivedRef);
      
      if (!archivedDoc.exists()) {
        throw new Error('Archived complaint not found');
      }
      
      const complaintData = archivedDoc.data();
      
      // Remove archivedAt and archivedBy fields
      const { archivedAt, archivedBy, originalId, ...restoredData } = complaintData;
      
      // Move back to complaints collection
      await addDoc(collection(db, 'complaints'), {
        ...restoredData,
        updatedAt: Timestamp.now(),
      });
      
      // Delete from archivedComplaints collection
      await deleteDoc(archivedRef);
      
      // Update local state - remove from archived list
      setArchivedComplaints(prev => prev.filter(c => c.id !== complaintId));
      
      alert('Complaint restored successfully');
    } catch (error: any) {
      console.error('Error restoring complaint:', error);
      alert(`Failed to restore complaint: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleRestoreAnnouncement = useCallback(async (announcementId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to restore this announcement? It will be moved back to the announcements screen.')) {
      return;
    }
    
    setProcessingStatus(announcementId);
    try {
      // Get the announcement data from archivedAnnouncements collection
      const archivedRef = doc(db, 'archivedAnnouncements', announcementId);
      const archivedDoc = await getDoc(archivedRef);
      
      if (!archivedDoc.exists()) {
        throw new Error('Archived announcement not found');
      }
      
      const announcementData = archivedDoc.data();
      
      // Remove archivedAt and archivedBy fields
      const { archivedAt, archivedBy, originalId, ...restoredData } = announcementData;
      
      // Move back to announcements collection
      await addDoc(collection(db, 'announcements'), {
        ...restoredData,
        updatedAt: Timestamp.now(),
      });
      
      // Delete from archivedAnnouncements collection
      await deleteDoc(archivedRef);
      
      // Update local state - remove from archived list
      setArchivedAnnouncements(prev => prev.filter(a => a.id !== announcementId));
      setFilteredArchivedAnnouncements(prev => prev.filter(a => a.id !== announcementId));
      
      alert('Announcement restored successfully');
    } catch (error: any) {
      console.error('Error restoring announcement:', error);
      alert(`Failed to restore announcement: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleRestoreVehicleRegistration = useCallback(async (registrationId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to restore this vehicle registration? It will be moved back to the vehicle registration screen.')) {
      return;
    }
    
    setProcessingStatus(registrationId);
    try {
      // Get the registration data from archivedVehicleRegistrations collection
      const archivedRef = doc(db, 'archivedVehicleRegistrations', registrationId);
      const archivedDoc = await getDoc(archivedRef);
      
      if (!archivedDoc.exists()) {
        throw new Error('Archived vehicle registration not found');
      }
      
      const registrationData = archivedDoc.data();
      
      // Remove archivedAt and archivedBy fields
      const { archivedAt, archivedBy, originalId, ...restoredData } = registrationData;
      
      // Move back to vehicleRegistrations collection
      await addDoc(collection(db, 'vehicleRegistrations'), {
        ...restoredData,
        updatedAt: Timestamp.now(),
      });
      
      // Delete from archivedVehicleRegistrations collection
      await deleteDoc(archivedRef);
      
      // Update local state - remove from archived list
      setArchivedVehicleRegistrations(prev => prev.filter(r => r.id !== registrationId));
      
      alert('Vehicle registration restored successfully');
    } catch (error: any) {
      console.error('Error restoring vehicle registration:', error);
      alert(`Failed to restore vehicle registration: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleRestoreVisitor = useCallback(async (visitorId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to restore this visitor pre-registration? It will be moved back to the visitor pre-registration screen.')) {
      return;
    }
    
    setProcessingStatus(visitorId);
    try {
      // Get the visitor data from archivedVisitors collection
      const archivedRef = doc(db, 'archivedVisitors', visitorId);
      const archivedDoc = await getDoc(archivedRef);
      
      if (!archivedDoc.exists()) {
        throw new Error('Archived visitor not found');
      }
      
      const visitorData = archivedDoc.data();
      
      // Remove archivedAt and archivedBy fields, use originalId if available
      const { archivedAt, archivedBy, originalId, ...restoredData } = visitorData;
      
      // Move back to visitors collection (use originalId if available, otherwise use current id)
      const targetId = originalId || visitorId;
      await setDoc(doc(db, 'visitors', targetId), {
        ...restoredData,
        updatedAt: Timestamp.now(),
      });
      
      // Delete from archivedVisitors collection
      await deleteDoc(archivedRef);
      
      // Update local state - remove from archived list
      setArchivedVisitors(prev => prev.filter(v => v.id !== visitorId));
      setFilteredArchivedVisitors(prev => prev.filter(v => v.id !== visitorId));
      
      alert('Visitor pre-registration restored successfully');
    } catch (error: any) {
      console.error('Error restoring visitor:', error);
      alert(`Failed to restore visitor: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const handleViewComplaint = useCallback((complaint: ArchivedComplaint) => {
    setViewingComplaint(complaint);
    setShowComplaintModal(true);
  }, []);

  const handleCloseComplaintModal = useCallback(() => {
    setShowComplaintModal(false);
    setViewingComplaint(null);
  }, []);

  const handleViewVehicleRegistration = useCallback((registration: ArchivedVehicleRegistration) => {
    setViewingVehicleRegistration(registration);
    setShowVehicleRegistrationModal(true);
  }, []);

  const handleCloseVehicleRegistrationModal = useCallback(() => {
    setShowVehicleRegistrationModal(false);
    setViewingVehicleRegistration(null);
  }, []);

  const handleViewMaintenance = useCallback((maintenance: ArchivedMaintenance) => {
    setViewingMaintenance(maintenance);
    setShowMaintenanceModal(true);
  }, []);

  const handleCloseMaintenanceModal = useCallback(() => {
    setShowMaintenanceModal(false);
    setViewingMaintenance(null);
  }, []);

  const handleRestoreMaintenance = useCallback(async (maintenanceId: string) => {
    if (!db) return;
    
    if (!window.confirm('Are you sure you want to restore this maintenance request? It will be moved back to the maintenance screen.')) {
      return;
    }
    
    setProcessingStatus(maintenanceId);
    try {
      // Get the maintenance data from archivedMaintenance collection
      const archivedRef = doc(db, 'archivedMaintenance', maintenanceId);
      const archivedDoc = await getDoc(archivedRef);
      
      if (!archivedDoc.exists()) {
        throw new Error('Archived maintenance request not found');
      }
      
      const maintenanceData = archivedDoc.data();
      
      // Remove archivedAt and archivedBy fields
      const { archivedAt, archivedBy, originalId, ...restoredData } = maintenanceData;
      
      // Move back to maintenance collection
      await addDoc(collection(db, 'maintenance'), {
        ...restoredData,
        updatedAt: Timestamp.now(),
      });
      
      // Delete from archivedMaintenance collection
      await deleteDoc(archivedRef);
      
      // Update local state - remove from archived list
      setArchivedMaintenance(prev => prev.filter(m => m.id !== maintenanceId));
      
      alert('Maintenance request restored successfully');
    } catch (error: any) {
      console.error('Error restoring maintenance request:', error);
      alert(`Failed to restore maintenance request: ${error.message}`);
    } finally {
      setProcessingStatus(null);
    }
  }, [db]);

  const applyDateFilterComplaints = useCallback((complaintsList: ArchivedComplaint[]) => {
    let filtered = complaintsList;

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((complaint) => {
        const complaintDate = complaint.archivedAt?.toDate 
          ? complaint.archivedAt.toDate() 
          : complaint.archivedAt 
          ? new Date(complaint.archivedAt) 
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
        const userName = complaintUserNames[complaint.userId] || complaint.userEmail || '';
        const subject = complaint.subject || '';
        const description = complaint.description || '';
        
        return (
          userName.toLowerCase().includes(query) ||
          subject.toLowerCase().includes(query) ||
          description.toLowerCase().includes(query)
        );
      });
    }

    setFilteredArchivedComplaints(filtered);
  }, [filterDate, searchQuery, complaintUserNames]);

  const applyDateFilterAnnouncements = useCallback((announcementsList: ArchivedAnnouncement[]) => {
    let filtered = [...announcementsList];

    // Apply date filter
    if (filterDate) {
      const filterDateObj = new Date(filterDate);
      filterDateObj.setHours(0, 0, 0, 0);
      const nextDay = new Date(filterDateObj);
      nextDay.setDate(nextDay.getDate() + 1);

      filtered = filtered.filter((announcement) => {
        const archivedDate = announcement.archivedAt?.toDate 
          ? announcement.archivedAt.toDate()
          : announcement.archivedAt 
          ? new Date(announcement.archivedAt)
          : null;
        
        if (!archivedDate) return false;
        
        archivedDate.setHours(0, 0, 0, 0);
        return archivedDate >= filterDateObj && archivedDate < nextDay;
      });
    }

    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((announcement) => {
        return (
          announcement.title?.toLowerCase().includes(query) ||
          announcement.content?.toLowerCase().includes(query)
        );
      });
    }

    setFilteredArchivedAnnouncements(filtered);
  }, [filterDate, searchQuery]);

  const applyDateFilterVisitors = useCallback((visitorsList: ArchivedVisitor[]) => {
    let filtered = visitorsList;

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((visitor) => {
        const visitorDate = visitor.archivedAt?.toDate 
          ? visitor.archivedAt.toDate() 
          : visitor.archivedAt 
          ? new Date(visitor.archivedAt) 
          : null;
        
        if (!visitorDate) return false;

        const visitorDateOnly = new Date(visitorDate.getFullYear(), visitorDate.getMonth(), visitorDate.getDate());
        
        return visitorDateOnly.getTime() === selectedDateOnly.getTime();
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((visitor) => {
        const residentName = visitorResidentNames[visitor.residentId] || visitor.residentEmail || '';
        const visitorName = visitor.visitorName || '';
        const visitorPurpose = visitor.visitorPurpose || '';
        
        return (
          residentName.toLowerCase().includes(query) ||
          visitorName.toLowerCase().includes(query) ||
          visitorPurpose.toLowerCase().includes(query) ||
          visitor.visitorPhone?.toLowerCase().includes(query)
        );
      });
    }

    setFilteredArchivedVisitors(filtered);
  }, [filterDate, searchQuery, visitorResidentNames]);

  const applyDateFilterResidents = useCallback((residentsList: Resident[]) => {
    let filtered = residentsList;

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((resident) => {
        // Try archivedAt first, then createdAt
        const residentDate = (resident as any).archivedAt?.toDate 
          ? (resident as any).archivedAt.toDate() 
          : (resident as any).archivedAt 
          ? new Date((resident as any).archivedAt) 
          : resident.createdAt?.toDate 
          ? resident.createdAt.toDate() 
          : resident.createdAt 
          ? new Date(resident.createdAt) 
          : null;
        
        if (!residentDate) return false;

        const residentDateOnly = new Date(residentDate.getFullYear(), residentDate.getMonth(), residentDate.getDate());
        
        return residentDateOnly.getTime() === selectedDateOnly.getTime();
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((resident) => {
        const fullName = (resident.fullName || '').toLowerCase();
        const firstName = (resident.firstName || '').toLowerCase();
        const middleName = (resident.middleName || '').toLowerCase();
        const lastName = (resident.lastName || '').toLowerCase();
        const email = (resident.email || '').toLowerCase();
        const phone = (resident.phone || '').toLowerCase();
        
        return (
          fullName.includes(query) ||
          firstName.includes(query) ||
          middleName.includes(query) ||
          lastName.includes(query) ||
          email.includes(query) ||
          phone.includes(query)
        );
      });
    }

    setFilteredArchivedResidents(filtered);
  }, [filterDate, searchQuery]);

  const applyDateFilterVehicleRegistrations = useCallback((registrationsList: ArchivedVehicleRegistration[]) => {
    let filtered = registrationsList;

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((registration) => {
        const registrationDate = registration.archivedAt?.toDate 
          ? registration.archivedAt.toDate() 
          : registration.archivedAt 
          ? new Date(registration.archivedAt) 
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
        const userName = vehicleRegistrationUserNames[registration.userId] || registration.userEmail || '';
        const plateNumber = registration.plateNumber || '';
        const make = registration.make || '';
        const model = registration.model || '';
        const color = registration.color || '';
        const vehicleType = registration.vehicleType || '';
        
        return (
          userName.toLowerCase().includes(query) ||
          plateNumber.toLowerCase().includes(query) ||
          make.toLowerCase().includes(query) ||
          model.toLowerCase().includes(query) ||
          color.toLowerCase().includes(query) ||
          vehicleType.toLowerCase().includes(query)
        );
      });
    }

    setFilteredArchivedVehicleRegistrations(filtered);
  }, [filterDate, searchQuery, vehicleRegistrationUserNames]);

  const applyDateFilterMaintenance = useCallback((maintenanceList: ArchivedMaintenance[]) => {
    let filtered = maintenanceList;

    // Apply date filter
    if (filterDate) {
      const selectedDate = new Date(filterDate);
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

      filtered = filtered.filter((maintenance) => {
        const maintenanceDate = maintenance.archivedAt?.toDate 
          ? maintenance.archivedAt.toDate() 
          : maintenance.archivedAt 
          ? new Date(maintenance.archivedAt) 
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
        const userName = maintenanceUserNames[maintenance.userId] || maintenance.userEmail || '';
        const maintenanceType = maintenance.maintenanceType || '';
        const description = maintenance.description || '';
        
        return (
          userName.toLowerCase().includes(query) ||
          maintenanceType.toLowerCase().includes(query) ||
          description.toLowerCase().includes(query)
        );
      });
    }

    setFilteredArchivedMaintenance(filtered);
  }, [filterDate, searchQuery, maintenanceUserNames]);

  useEffect(() => {
    if (activeFilter === 'complaints') {
      applyDateFilterComplaints(archivedComplaints);
    } else if (activeFilter === 'registered-residents') {
      applyDateFilterResidents(archivedResidents);
    } else if (activeFilter === 'vehicle-registration') {
      applyDateFilterVehicleRegistrations(archivedVehicleRegistrations);
    } else if (activeFilter === 'maintenance') {
      applyDateFilterMaintenance(archivedMaintenance);
    } else if (activeFilter === 'billings-payments') {
      // Simple filter: date filter checks updatedAt or archivedAt; search by email or billingCycle
      const list = archivedBillings;
      let filtered = list;
      if (filterDate) {
        filtered = filtered.filter((item) => {
          const d = item.archivedAt || item.updatedAt;
          if (!d) return false;
          const dateStr = d.toDate ? d.toDate().toISOString().split('T')[0] : new Date(d).toISOString().split('T')[0];
          return dateStr === filterDate;
        });
      }
      if (searchQuery) {
        const term = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (b) =>
            (b.residentEmail || '').toLowerCase().includes(term) ||
            (b.billingCycle || '').toLowerCase().includes(term)
        );
      }
      setFilteredArchivedBillings(filtered);
    } else if (activeFilter === 'visitor-pre-registration') {
      applyDateFilterVisitors(archivedVisitors);
    }
  }, [archivedComplaints, archivedResidents, archivedVehicleRegistrations, archivedMaintenance, archivedBillings, archivedVisitors, filterDate, searchQuery, activeFilter, applyDateFilterComplaints, applyDateFilterResidents, applyDateFilterVehicleRegistrations, applyDateFilterMaintenance, applyDateFilterVisitors]);

  const handleDateFilter = useCallback(() => {
    setShowDateFilter(!showDateFilter);
  }, [showDateFilter]);

  const handleClearDateFilter = useCallback(() => {
    setFilterDate('');
    setShowDateFilter(false);
  }, []);

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
    { id: 'announcement' as FilterType, label: 'Announcement' },
    { id: 'complaints' as FilterType, label: 'Complaints' },
    { id: 'visitor-pre-registration' as FilterType, label: 'Visitor Pre-registration' },
    { id: 'residents-applications' as FilterType, label: 'Residents Applications' },
    { id: 'registered-residents' as FilterType, label: 'Registered Residents' },
    { id: 'billings-payments' as FilterType, label: 'Billings & Payments' },
    { id: 'maintenance' as FilterType, label: 'Maintenance' },
    { id: 'vehicle-registration' as FilterType, label: 'Vehicle Registration' },
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header title="Archived" />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
                <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">Archived</h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 md:px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-48 md:w-64"
                  />
                  <button
                    className="px-3 md:px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-200 whitespace-nowrap"
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
                      {activeFilter === 'complaints' && (
                        <>Showing {filteredArchivedComplaints.length} of {archivedComplaints.length} archived complaints</>
                      )}
                      {activeFilter === 'registered-residents' && (
                        <>Showing {filteredArchivedResidents.length} of {archivedResidents.length} archived residents</>
                      )}
                      {activeFilter === 'vehicle-registration' && (
                        <>Showing {filteredArchivedVehicleRegistrations.length} of {archivedVehicleRegistrations.length} archived vehicle registrations</>
                      )}
                      {activeFilter === 'maintenance' && (
                        <>Showing {filteredArchivedMaintenance.length} of {archivedMaintenance.length} archived maintenance requests</>
                      )}
                      {activeFilter === 'billings-payments' && (
                        <>Showing {filteredArchivedBillings.length} of {archivedBillings.length} archived billings</>
                      )}
                      {activeFilter === 'visitor-pre-registration' && (
                        <>Showing {filteredArchivedVisitors.length} of {archivedVisitors.length} archived visitor pre-registrations</>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Category</label>
                {/* Mobile: Dropdown */}
                <select
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value as FilterType)}
                  className="md:hidden w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                >
                  {filters.map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
                {/* Desktop: Button Row */}
                <div className="hidden md:flex gap-2 overflow-x-auto">
                  {filters.map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setActiveFilter(filter.id)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                        activeFilter === filter.id
                          ? 'bg-[#1877F2] text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8">
                {activeFilter === 'complaints' && (
                  <>
                    {loadingComplaints && archivedComplaints.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived complaints...</div>
                    ) : (filterDate || searchQuery ? filteredArchivedComplaints : archivedComplaints).length === 0 ? (
                  <div className="text-center py-20 px-5 text-gray-600">
                    <p className="text-base font-normal text-gray-600">
                          No archived complaints found.
                        </p>
                        <p className="text-xs text-gray-400 mt-2.5">
                          Archived complaints will appear here.
                    </p>
                  </div>
                    ) : (
                      <>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                          {(filterDate || searchQuery ? filteredArchivedComplaints : archivedComplaints).map((complaint) => (
                            <div key={complaint.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{complaint.subject}</h3>
                                  <p className="text-xs text-gray-500 mb-2">{formatDate(complaint.createdAt)}</p>
                                </div>
                                <span className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block flex-shrink-0 bg-purple-600">
                                  {complaint.status.toUpperCase()}
                                </span>
                              </div>
                              
                              <div className="space-y-2 mb-3">
                                <div>
                                  <span className="text-xs font-medium text-gray-600">User: </span>
                                  <span className="text-xs text-gray-900">{complaintUserNames[complaint.userId] || complaint.userEmail || 'Unknown User'}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Description: </span>
                                  <p className="text-xs text-gray-900 mt-1 break-words whitespace-pre-wrap">{complaint.description}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Archived At: </span>
                                  <span className="text-xs text-gray-900">{formatDate(complaint.archivedAt)}</span>
                                </div>
                              </div>

                              <div className="flex gap-2 pt-3 border-t border-gray-200">
                                <button
                                  className="flex-1 bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                  onClick={() => handleViewComplaint(complaint)}
                                >
                                  View
                                </button>
                                <button
                                  className="flex-1 bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleRestoreComplaint(complaint.id)}
                                  disabled={processingStatus === complaint.id}
                                >
                                  {processingStatus === complaint.id ? 'Processing...' : 'Restore'}
                                </button>
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
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Archived At</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(filterDate || searchQuery ? filteredArchivedComplaints : archivedComplaints).map((complaint) => (
                                <tr key={complaint.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(complaint.createdAt)}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                                    {complaintUserNames[complaint.userId] || complaint.userEmail || 'Unknown User'}
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{complaint.subject}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top max-w-[300px] break-words whitespace-pre-wrap">
                                    {complaint.description}
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 align-top">
                                    <span className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block bg-purple-600">
                                      {complaint.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(complaint.archivedAt)}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                                    <div className="flex gap-2 items-center">
                                      <button
                                        className="bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                        onClick={() => handleViewComplaint(complaint)}
                                      >
                                        View
                                      </button>
                                      <button
                                        className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={() => handleRestoreComplaint(complaint.id)}
                                        disabled={processingStatus === complaint.id}
                                      >
                                        {processingStatus === complaint.id ? 'Processing...' : 'Restore'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
                {activeFilter === 'registered-residents' && (
                  <>
                    {loading && archivedResidents.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived residents...</div>
                    ) : (filterDate || searchQuery ? filteredArchivedResidents : archivedResidents).length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          No archived residents found.
                        </p>
                        <p className="text-xs text-gray-400 mt-2.5">
                          Archived residents will appear here.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                          {(filterDate || searchQuery ? filteredArchivedResidents : archivedResidents).map((resident) => {
                            const fullName = resident.fullName || 
                              [resident.firstName, resident.middleName, resident.lastName]
                                .filter(Boolean)
                                .join(' ') || 'N/A';
                            
                            return (
                              <div key={resident.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900 text-sm mb-1">{fullName}</h3>
                                    <p className="text-xs text-gray-500 mb-2">{formatDate(resident.createdAt)}</p>
                                  </div>
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 flex-shrink-0">Archived</span>
                                </div>
                                
                                <div className="space-y-2 mb-3">
                                  <div>
                                    <span className="text-xs font-medium text-gray-600">Email/Phone: </span>
                                    <span className="text-xs text-gray-900">{resident.email || resident.phone || 'N/A'}</span>
                                  </div>
                                </div>

                                <div className="flex gap-2 pt-3 border-t border-gray-200">
                                  <button
                                    className="flex-1 bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                    onClick={() => handleViewDetails(resident)}
                                  >
                                    View Details
                                  </button>
                                  <button
                                    className="flex-1 bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => handleRestore(resident.id)}
                                    disabled={processingStatus === resident.id}
                                  >
                                    {processingStatus === resident.id ? 'Processing...' : 'Restore'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
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
                              {(filterDate || searchQuery ? filteredArchivedResidents : archivedResidents).map((resident) => {
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
                      </>
                    )}
                  </>
                )}
                {activeFilter === 'vehicle-registration' && (
                  <>
                    {loadingVehicleRegistrations && archivedVehicleRegistrations.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived vehicle registrations...</div>
                    ) : (filterDate || searchQuery ? filteredArchivedVehicleRegistrations : archivedVehicleRegistrations).length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          No archived vehicle registrations found.
                        </p>
                        <p className="text-xs text-gray-400 mt-2.5">
                          Archived vehicle registrations will appear here.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                          {(filterDate || searchQuery ? filteredArchivedVehicleRegistrations : archivedVehicleRegistrations).map((registration) => (
                            <div key={registration.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{registration.plateNumber}</h3>
                                  <p className="text-xs text-gray-500 mb-2">{formatDate(registration.createdAt)}</p>
                                </div>
                                <span
                                  className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block flex-shrink-0"
                                  style={{ 
                                    backgroundColor: registration.status === 'approved' ? '#4CAF50' : 
                                                    registration.status === 'rejected' ? '#ef4444' : '#FFA500' 
                                  }}
                                >
                                  {registration.status.toUpperCase()}
                                </span>
                              </div>
                              
                              <div className="space-y-2 mb-3">
                                <div>
                                  <span className="text-xs font-medium text-gray-600">User: </span>
                                  <span className="text-xs text-gray-900">{vehicleRegistrationUserNames[registration.userId] || registration.userEmail || 'Unknown User'}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Vehicle: </span>
                                  <span className="text-xs text-gray-900">{registration.make} {registration.model} ({registration.year})</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Color: </span>
                                  <span className="text-xs text-gray-900">{registration.color}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Type: </span>
                                  <span className="text-xs text-gray-900">{registration.vehicleType}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Archived At: </span>
                                  <span className="text-xs text-gray-900">{formatDate(registration.archivedAt)}</span>
                                </div>
                              </div>

                              <div className="flex gap-2 pt-3 border-t border-gray-200">
                                <button
                                  className="flex-1 bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                  onClick={() => handleViewVehicleRegistration(registration)}
                                >
                                  View
                                </button>
                                <button
                                  className="flex-1 bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleRestoreVehicleRegistration(registration.id)}
                                  disabled={processingStatus === registration.id}
                                >
                                  {processingStatus === registration.id ? 'Processing...' : 'Restore'}
                                </button>
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
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Plate Number</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Vehicle</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Type</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Archived At</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(filterDate || searchQuery ? filteredArchivedVehicleRegistrations : archivedVehicleRegistrations).map((registration) => (
                                <tr key={registration.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(registration.createdAt)}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                                    {vehicleRegistrationUserNames[registration.userId] || registration.userEmail || 'Unknown User'}
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
                                      style={{ 
                                        backgroundColor: registration.status === 'approved' ? '#4CAF50' : 
                                                        registration.status === 'rejected' ? '#ef4444' : '#FFA500' 
                                      }}
                                    >
                                      {registration.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(registration.archivedAt)}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                                    <div className="flex gap-2 items-center">
                                      <button
                                        className="bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                        onClick={() => handleViewVehicleRegistration(registration)}
                                      >
                                        View
                                      </button>
                                      <button
                                        className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={() => handleRestoreVehicleRegistration(registration.id)}
                                        disabled={processingStatus === registration.id}
                                      >
                                        {processingStatus === registration.id ? 'Processing...' : 'Restore'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
                {activeFilter === 'maintenance' && (
                  <>
                    {loadingMaintenance && archivedMaintenance.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived maintenance requests...</div>
                    ) : (filterDate || searchQuery ? filteredArchivedMaintenance : archivedMaintenance).length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          No archived maintenance requests found.
                        </p>
                        <p className="text-xs text-gray-400 mt-2.5">
                          Archived maintenance requests will appear here.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                          {(filterDate || searchQuery ? filteredArchivedMaintenance : archivedMaintenance).map((maintenance) => (
                            <div key={maintenance.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{maintenance.maintenanceType}</h3>
                                  <p className="text-xs text-gray-500 mb-2">{formatDate(maintenance.createdAt)}</p>
                                </div>
                                <span
                                  className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block flex-shrink-0"
                                  style={{ 
                                    backgroundColor: maintenance.status === 'resolved' ? '#4CAF50' : 
                                                    maintenance.status === 'rejected' ? '#ef4444' : 
                                                    maintenance.status === 'in-progress' ? '#2196F3' : '#FFA500' 
                                  }}
                                >
                                  {maintenance.status.toUpperCase()}
                                </span>
                              </div>
                              
                              <div className="space-y-2 mb-3">
                                <div>
                                  <span className="text-xs font-medium text-gray-600">User: </span>
                                  <span className="text-xs text-gray-900">{maintenanceUserNames[maintenance.userId] || maintenance.userEmail || 'Unknown User'}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Description: </span>
                                  <p className="text-xs text-gray-900 mt-1 break-words whitespace-pre-wrap">{maintenance.description}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Archived At: </span>
                                  <span className="text-xs text-gray-900">{formatDate(maintenance.archivedAt)}</span>
                                </div>
                              </div>

                              <div className="flex gap-2 pt-3 border-t border-gray-200">
                                <button
                                  className="flex-1 bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                  onClick={() => handleViewMaintenance(maintenance)}
                                >
                                  View
                                </button>
                                <button
                                  className="flex-1 bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleRestoreMaintenance(maintenance.id)}
                                  disabled={processingStatus === maintenance.id}
                                >
                                  {processingStatus === maintenance.id ? 'Processing...' : 'Restore'}
                                </button>
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
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Archived At</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(filterDate || searchQuery ? filteredArchivedMaintenance : archivedMaintenance).map((maintenance) => (
                                <tr key={maintenance.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(maintenance.createdAt)}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                                    {maintenanceUserNames[maintenance.userId] || maintenance.userEmail || 'Unknown User'}
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{maintenance.maintenanceType}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top max-w-[300px] break-words whitespace-pre-wrap">
                                    {maintenance.description}
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 align-top">
                                    <span
                                      className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                                      style={{ 
                                        backgroundColor: maintenance.status === 'resolved' ? '#4CAF50' : 
                                                        maintenance.status === 'rejected' ? '#ef4444' : 
                                                        maintenance.status === 'in-progress' ? '#2196F3' : '#FFA500' 
                                      }}
                                    >
                                      {maintenance.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(maintenance.archivedAt)}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                                    <div className="flex gap-2 items-center">
                                      <button
                                        className="bg-gray-900 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-gray-800"
                                        onClick={() => handleViewMaintenance(maintenance)}
                                      >
                                        View
                                      </button>
                                      <button
                                        className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={() => handleRestoreMaintenance(maintenance.id)}
                                        disabled={processingStatus === maintenance.id}
                                      >
                                        {processingStatus === maintenance.id ? 'Processing...' : 'Restore'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
                {activeFilter === 'announcement' && (
                  <>
                    {loadingAnnouncements && archivedAnnouncements.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived announcements...</div>
                    ) : (filterDate || searchQuery ? filteredArchivedAnnouncements : archivedAnnouncements).length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          No archived announcements found.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b-2 border-gray-200">
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Title</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Content</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Created</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Archived At</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(filterDate || searchQuery ? filteredArchivedAnnouncements : archivedAnnouncements).map((announcement) => (
                                <tr key={announcement.id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="px-4 py-3 text-gray-700 font-medium">{announcement.title}</td>
                                  <td className="px-4 py-3 text-gray-700 max-w-md">
                                    <div className="truncate" title={announcement.content}>
                                      {announcement.content}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">
                                    <span className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${
                                      announcement.isActive 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {announcement.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">{formatDate(announcement.createdAt)}</td>
                                  <td className="px-4 py-3 text-gray-700">{formatDate(announcement.archivedAt)}</td>
                                  <td className="px-4 py-3 text-gray-700">
                                    <button
                                      className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => handleRestoreAnnouncement(announcement.id)}
                                      disabled={processingStatus === announcement.id}
                                    >
                                      {processingStatus === announcement.id ? 'Restoring...' : 'Restore'}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden space-y-4">
                          {(filterDate || searchQuery ? filteredArchivedAnnouncements : archivedAnnouncements).map((announcement) => (
                            <div key={announcement.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{announcement.title}</h3>
                                  <p className="text-xs text-gray-500 mb-2">{formatDate(announcement.createdAt)}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-[9px] font-medium ${
                                  announcement.isActive 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {announcement.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700 mb-3 line-clamp-3">{announcement.content}</p>
                              {announcement.imageURL && (
                                <div className="mb-3">
                                  <img 
                                    src={announcement.imageURL} 
                                    alt={announcement.title}
                                    className="w-full h-auto rounded-lg border border-gray-200 object-cover max-h-48"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                                <span className="text-xs text-gray-500">Archived: {formatDate(announcement.archivedAt)}</span>
                                <button
                                  className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleRestoreAnnouncement(announcement.id)}
                                  disabled={processingStatus === announcement.id}
                                >
                                  {processingStatus === announcement.id ? 'Restoring...' : 'Restore'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
                {activeFilter !== 'registered-residents' && activeFilter !== 'complaints' && activeFilter !== 'vehicle-registration' && activeFilter !== 'maintenance' && activeFilter !== 'billings-payments' && activeFilter !== 'visitor-pre-registration' && activeFilter !== 'announcement' && (
                  <div className="text-center py-20 px-5 text-gray-600">
                    <p className="text-base font-normal text-gray-600">
                      Archived {filters.find(f => f.id === activeFilter)?.label} items will appear here
                    </p>
                    <p className="text-xs text-gray-400 mt-2.5">
                      This feature is coming soon.
                    </p>
                  </div>
                )}
                {activeFilter === 'billings-payments' && (
                  <>
                    {loadingBillings && archivedBillings.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived billings...</div>
                    ) : filteredArchivedBillings.length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          No archived billings found.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b-2 border-gray-200">
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Resident</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Billing Cycle</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Type</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Amount</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Due Date</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Proof Status</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Archived At</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredArchivedBillings.map((b) => (
                                <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="px-4 py-3 text-gray-700">{b.residentEmail || 'N/A'}</td>
                                  <td className="px-4 py-3 text-gray-700">{b.billingCycle || 'N/A'}</td>
                                  <td className="px-4 py-3 text-gray-700">
                                    {b.billingType ? (b.billingType === 'water' ? 'Water' : 'Electricity') : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">
                                    {typeof b.amount === 'number'
                                      ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(b.amount)
                                      : 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">{formatDate(b.dueDate)}</td>
                                  <td className="px-4 py-3 text-gray-700">
                                    <span
                                      className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${
                                        b.userProofStatus === 'pending'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : b.userProofStatus === 'verified'
                                          ? 'bg-green-100 text-green-800'
                                          : b.userProofStatus === 'rejected'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}
                                    >
                                      {(b.userProofStatus || 'None').toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">
                                    {formatDate(b.archivedAt || b.updatedAt)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">
                                    <button
                                      className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => handleRestoreBilling(b.id)}
                                    >
                                      Restore
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden space-y-4">
                          {filteredArchivedBillings.map((b) => (
                            <div key={b.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-900 text-sm mb-1">
                                    {b.billingCycle || 'Billing'}
                                  </h3>
                                  <p className="text-xs text-gray-500">
                                    {formatDate(b.archivedAt || b.updatedAt)}
                                  </p>
                                </div>
                                <span
                                  className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${
                                    b.userProofStatus === 'pending'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : b.userProofStatus === 'verified'
                                      ? 'bg-green-100 text-green-800'
                                      : b.userProofStatus === 'rejected'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {(b.userProofStatus || 'None').toUpperCase()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 mb-1">
                                {b.residentEmail || 'N/A'}
                              </p>
                              <p className="text-sm text-gray-700 mb-1">
                                Type: {b.billingType ? (b.billingType === 'water' ? 'Water' : 'Electricity') : '—'}
                              </p>
                              <p className="text-sm text-gray-700 mb-1">
                                Amount:{' '}
                                {typeof b.amount === 'number'
                                  ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(b.amount)
                                  : 'N/A'}
                              </p>
                              <p className="text-sm text-gray-700 mb-1">
                                Due: {formatDate(b.dueDate)}
                              </p>
                              <div className="mt-2">
                                <button
                                  className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleRestoreBilling(b.id)}
                                >
                                  Restore
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
                {activeFilter === 'visitor-pre-registration' && (
                  <>
                    {loadingVisitors && archivedVisitors.length === 0 ? (
                      <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading archived visitor pre-registrations...</div>
                    ) : (filterDate || searchQuery ? filteredArchivedVisitors : archivedVisitors).length === 0 ? (
                      <div className="text-center py-20 px-5 text-gray-600">
                        <p className="text-base font-normal text-gray-600">
                          No archived visitor pre-registrations found.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                          {(filterDate || searchQuery ? filteredArchivedVisitors : archivedVisitors).map((visitor) => (
                            <div key={visitor.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{visitor.visitorName}</h3>
                                  <p className="text-xs text-gray-500 mb-2">{formatDate(visitor.createdAt)}</p>
                                </div>
                                <span
                                  className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block flex-shrink-0"
                                  style={{
                                    backgroundColor:
                                      visitor.status === 'approved'
                                        ? '#4CAF50'
                                        : visitor.status === 'rejected'
                                        ? '#ef4444'
                                        : '#FFA500',
                                  }}
                                >
                                  {visitor.status.toUpperCase()}
                                </span>
                              </div>
                              
                              <div className="space-y-2 mb-3">
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Resident: </span>
                                  <span className="text-xs text-gray-900">{visitorResidentNames[visitor.residentId] || visitor.residentEmail || 'Unknown Resident'}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Purpose: </span>
                                  <span className="text-xs text-gray-900">{visitor.visitorPurpose}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Date: </span>
                                  <span className="text-xs text-gray-900">{visitor.visitorDate}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Time: </span>
                                  <span className="text-xs text-gray-900">{visitor.visitorTime}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Phone: </span>
                                  <span className="text-xs text-gray-900">{visitor.visitorPhone}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-600">Archived: </span>
                                  <span className="text-xs text-gray-900">{formatDate(visitor.archivedAt)}</span>
                                </div>
                              </div>

                              <div className="flex gap-2 pt-3 border-t border-gray-200">
                                <button
                                  className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleRestoreVisitor(visitor.id)}
                                  disabled={processingStatus === visitor.id}
                                >
                                  {processingStatus === visitor.id ? 'Restoring...' : 'Restore'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto w-full">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b-2 border-gray-200">
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Visitor Name</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Resident</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Purpose</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Date</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Time</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Phone</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Archived At</th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(filterDate || searchQuery ? filteredArchivedVisitors : archivedVisitors).map((visitor) => (
                                <tr key={visitor.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorName}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">
                                    {visitorResidentNames[visitor.residentId] || visitor.residentEmail || 'Unknown Resident'}
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorPurpose}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorDate}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorTime}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{visitor.visitorPhone}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 align-top">
                                    <span
                                      className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                                      style={{
                                        backgroundColor:
                                          visitor.status === 'approved'
                                            ? '#4CAF50'
                                            : visitor.status === 'rejected'
                                            ? '#ef4444'
                                            : '#FFA500',
                                      }}
                                    >
                                      {visitor.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-top">{formatDate(visitor.archivedAt)}</td>
                                  <td className="px-4 py-4 border-b border-gray-100 align-top">
                                    <button
                                      className="bg-green-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={() => handleRestoreVisitor(visitor.id)}
                                      disabled={processingStatus === visitor.id}
                                    >
                                      {processingStatus === visitor.id ? 'Restoring...' : 'Restore'}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>

        {showDetailsModal && selectedResident && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={() => setShowDetailsModal(false)}>
            <div className="bg-white rounded-lg sm:rounded-2xl w-full max-w-[800px] max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-lg sm:text-xl font-normal">Archived Resident Details</h3>
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
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  className="bg-green-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  onClick={() => {
                    handleRestore(selectedResident.id);
                    setShowDetailsModal(false);
                  }}
                  disabled={processingStatus === selectedResident.id}
                >
                  {processingStatus === selectedResident.id ? 'Processing...' : 'Restore'}
                </button>
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

        {/* View Complaint Modal */}
        {showComplaintModal && viewingComplaint && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={handleCloseComplaintModal}>
            <div className="bg-white rounded-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Archived Complaint Details</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={handleCloseComplaintModal}
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Subject</label>
                    <p className="text-gray-900 font-medium">{viewingComplaint.subject}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Description</label>
                    <p className="text-gray-900 whitespace-pre-wrap">{viewingComplaint.description}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">User Email</label>
                    <p className="text-gray-900">{viewingComplaint.userEmail}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                    <span className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block bg-purple-600">
                      {viewingComplaint.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Created At</label>
                    <p className="text-gray-900">{formatDate(viewingComplaint.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Archived At</label>
                    <p className="text-gray-900">{formatDate(viewingComplaint.archivedAt)}</p>
                  </div>
                  {viewingComplaint.rejectionReason && (
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Rejection Reason</label>
                      <p className="text-gray-900">{viewingComplaint.rejectionReason}</p>
                    </div>
                  )}
                  {viewingComplaint.imageURL && (
                    <div>
                      <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Image</label>
                      <img 
                        src={viewingComplaint.imageURL} 
                        alt="Complaint Image" 
                        className="w-full rounded-lg border border-gray-200"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  className="bg-green-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  onClick={() => {
                    handleRestoreComplaint(viewingComplaint.id);
                    setShowComplaintModal(false);
                  }}
                  disabled={processingStatus === viewingComplaint.id}
                >
                  {processingStatus === viewingComplaint.id ? 'Processing...' : 'Restore'}
                </button>
                <button
                  className="bg-gray-900 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-gray-800 w-full sm:w-auto"
                  onClick={handleCloseComplaintModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Vehicle Registration Modal */}
        {showVehicleRegistrationModal && viewingVehicleRegistration && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={handleCloseVehicleRegistrationModal}>
            <div className="bg-white rounded-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Archived Vehicle Registration Details</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={handleCloseVehicleRegistrationModal}
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Plate Number</label>
                    <p className="text-gray-900 font-medium">{viewingVehicleRegistration.plateNumber}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                    <span
                      className="px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wide text-white inline-block"
                      style={{ 
                        backgroundColor: viewingVehicleRegistration.status === 'approved' ? '#4CAF50' : 
                                        viewingVehicleRegistration.status === 'rejected' ? '#ef4444' : '#FFA500' 
                      }}
                    >
                      {viewingVehicleRegistration.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Make</label>
                    <p className="text-gray-900 font-medium">{viewingVehicleRegistration.make}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Model</label>
                    <p className="text-gray-900 font-medium">{viewingVehicleRegistration.model}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Year</label>
                    <p className="text-gray-900 font-medium">{viewingVehicleRegistration.year}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Color</label>
                    <p className="text-gray-900 font-medium">{viewingVehicleRegistration.color}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Vehicle Type</label>
                    <p className="text-gray-900 font-medium">{viewingVehicleRegistration.vehicleType}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">User Email</label>
                    <p className="text-gray-900 font-medium">{viewingVehicleRegistration.userEmail}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Submitted Date</label>
                    <p className="text-gray-900 font-medium">{formatDate(viewingVehicleRegistration.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Archived At</label>
                    <p className="text-gray-900 font-medium">{formatDate(viewingVehicleRegistration.archivedAt)}</p>
                  </div>
                  {viewingVehicleRegistration.rejectionReason && (
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Rejection Reason</label>
                      <p className="text-gray-900 font-medium">{viewingVehicleRegistration.rejectionReason}</p>
                    </div>
                  )}
                </div>
                {viewingVehicleRegistration.vehicleImageURL && (
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Vehicle Image</label>
                    <img 
                      src={viewingVehicleRegistration.vehicleImageURL} 
                      alt="Vehicle Image" 
                      className="w-full rounded-lg border border-gray-200"
                    />
                  </div>
                )}
                {viewingVehicleRegistration.registrationImageURL && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Registration Document</label>
                    <img 
                      src={viewingVehicleRegistration.registrationImageURL} 
                      alt="Registration Document" 
                      className="w-full rounded-lg border border-gray-200"
                    />
                  </div>
                )}
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  className="bg-green-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  onClick={() => {
                    handleRestoreVehicleRegistration(viewingVehicleRegistration.id);
                    setShowVehicleRegistrationModal(false);
                  }}
                  disabled={processingStatus === viewingVehicleRegistration.id}
                >
                  {processingStatus === viewingVehicleRegistration.id ? 'Processing...' : 'Restore'}
                </button>
                <button
                  className="bg-gray-900 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-gray-800 w-full sm:w-auto"
                  onClick={handleCloseVehicleRegistrationModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {showMaintenanceModal && viewingMaintenance && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-4 sm:p-5" onClick={handleCloseMaintenanceModal}>
            <div className="bg-white rounded-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Archived Maintenance Request Details</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={handleCloseMaintenanceModal}
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Maintenance Type</label>
                    <p className="text-gray-900 font-medium">{viewingMaintenance.maintenanceType}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                    <span
                      className="px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wide text-white inline-block"
                      style={{ 
                        backgroundColor: viewingMaintenance.status === 'resolved' ? '#4CAF50' : 
                                        viewingMaintenance.status === 'rejected' ? '#ef4444' : 
                                        viewingMaintenance.status === 'in-progress' ? '#2196F3' : '#FFA500' 
                      }}
                    >
                      {viewingMaintenance.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Description</label>
                    <p className="text-gray-900 font-medium whitespace-pre-wrap">{viewingMaintenance.description}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">User Email</label>
                    <p className="text-gray-900 font-medium">{viewingMaintenance.userEmail}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Submitted Date</label>
                    <p className="text-gray-900 font-medium">{formatDate(viewingMaintenance.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Archived At</label>
                    <p className="text-gray-900 font-medium">{formatDate(viewingMaintenance.archivedAt)}</p>
                  </div>
                  {viewingMaintenance.rejectionReason && (
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Rejection Reason</label>
                      <p className="text-gray-900 font-medium bg-red-50 border border-red-200 rounded p-3">{viewingMaintenance.rejectionReason}</p>
                    </div>
                  )}
                </div>
                {viewingMaintenance.imageURL && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">Image</label>
                    <img 
                      src={viewingMaintenance.imageURL} 
                      alt="Maintenance Image" 
                      className="w-full rounded-lg border border-gray-200"
                      onError={(e) => {
                        console.error('Error loading maintenance image:', viewingMaintenance.imageURL);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  className="bg-green-600 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  onClick={() => {
                    handleRestoreMaintenance(viewingMaintenance.id);
                    setShowMaintenanceModal(false);
                  }}
                  disabled={processingStatus === viewingMaintenance.id}
                >
                  {processingStatus === viewingMaintenance.id ? 'Processing...' : 'Restore'}
                </button>
                <button
                  className="bg-gray-900 text-white border-none px-4 sm:px-5 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all hover:bg-gray-800 w-full sm:w-auto"
                  onClick={handleCloseMaintenanceModal}
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

