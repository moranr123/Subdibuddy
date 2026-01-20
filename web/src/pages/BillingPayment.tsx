import { useEffect, useState, memo, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, addDoc, updateDoc, doc, Timestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

interface Resident {
  id: string;
  email: string;
  fullName?: string;
  waterBillingDate?: any;
  electricBillingDate?: any;
  address?: {
    block?: string;
    lot?: string;
    street?: string;
  };
}

interface Billing {
  id: string;
  residentId: string;
  residentEmail: string;
  billingCycle: string;
  dueDate: string;
  description: string;
  billingType?: 'water' | 'electricity';
  status: 'pending' | 'notified' | 'overdue';
  createdAt: any;
  updatedAt?: any;
  userProofDetails?: string;
  userProofImageUrl?: string;
  userProofStatus?: 'pending' | 'verified' | 'rejected';
  userProofSubmittedAt?: any;
  nextBillingDate?: string;
  archived?: boolean;
}

function BillingPayment() {
  const [user, setUser] = useState<any>(null);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingResidents, setLoadingResidents] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSendBillForm, setShowSendBillForm] = useState(false);
  const [sendBillResident, setSendBillResident] = useState<Resident | null>(null);
  const [sendBillData, setSendBillData] = useState({
    billingCycle: '',
    dueDate: new Date().toISOString().split('T')[0],
    description: '',
    billingType: '',
  });
  const [formData, setFormData] = useState({
    residentId: '',
    billingCycle: '',
    dueDate: '',
    description: '',
    billingType: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [showProofModal, setShowProofModal] = useState(false);
  const [proofBilling, setProofBilling] = useState<Billing | null>(null);
  const [approveMonthsAdvance, setApproveMonthsAdvance] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [streetFilter, setStreetFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'dueSoon' | 'overdue'>('all');
  const [billingMonth, setBillingMonth] = useState('');
  const [billingYear, setBillingYear] = useState('');
  const [proofStatusFilter, setProofStatusFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [proofTypeFilter, setProofTypeFilter] = useState<'all' | 'water' | 'electricity'>('all');
  const [proofSearchQuery, setProofSearchQuery] = useState('');
  const [proofFilterDate, setProofFilterDate] = useState('');
  const [proofCurrentPage, setProofCurrentPage] = useState(1);
  const PROOF_ITEMS_PER_PAGE = 10;
  const blockOptions = useMemo(() => {
    const set = new Set<string>();
    residents.forEach((r) => {
      const val = r.address?.block;
      if (val) set.add(String(val));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [residents]);
  const streetOptions = useMemo(() => {
    const set = new Set<string>();
    residents.forEach((r) => {
      const val = r.address?.street;
      if (val) set.add(String(val));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [residents]);
  const navigate = useNavigate();
  const location = useLocation();

  const isWaterView = location.pathname === '/billing-payment/water';
  const isElectricView = location.pathname === '/billing-payment/electricity';
  const isProofsView = location.pathname === '/billing-payment/proofs';

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

  const fetchBillings = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Fetching billings from Firestore...');
      
      let querySnapshot;
      try {
        const q = query(collection(db, 'billings'), orderBy('createdAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy failed, trying without orderBy:', orderByError);
        querySnapshot = await getDocs(collection(db, 'billings'));
      }
      
      const billingsData: Billing[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const billing = {
          id: doc.id,
          ...data,
        } as Billing;
        
        // Update status based on due date
        const dueDate = new Date(billing.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
        
        if (dueDate < today && billing.status !== 'notified') {
          billing.status = 'overdue';
        } else if (billing.status === 'pending') {
          billing.status = 'pending';
        }
        
        billingsData.push(billing);
      });
      
      billingsData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${billingsData.length} billings`);
      setBillings(billingsData);
    } catch (error: any) {
      console.error('Error fetching billings:', error);
      alert(`Failed to load billings: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    setCurrentPage(1);
  }, [billings.length]);

  useEffect(() => {
    setProofCurrentPage(1);
  }, [proofStatusFilter, proofTypeFilter, proofSearchQuery, proofFilterDate]);

  // Real-time listener for residents so Water and Electricity screens update live
  useEffect(() => {
    if (!user || !db) return;

    console.log('Setting up real-time listener for residents...');
    let unsubscribe: (() => void) | null = null;

    try {
      const q = query(collection(db, 'users'));

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
      const residentsData: Resident[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
        // Filter out superadmin accounts - only include residents (but include all resident statuses)
        if (data.role === 'superadmin') {
          return;
        }
        residentsData.push({
              id: docSnap.id,
          email: data.email,
          fullName: data.fullName,
          waterBillingDate: data.waterBillingDate,
          electricBillingDate: data.electricBillingDate,
          address: data.address,
        } as Resident);
      });
      
      // Sort by email (defensive for null/undefined emails)
      residentsData.sort((a, b) => {
        const emailA = (a.email || '').toLowerCase();
        const emailB = (b.email || '').toLowerCase();
        return emailA.localeCompare(emailB);
      });

      setResidents(residentsData);
          setLoadingResidents(false);
        },
        (error: any) => {
          console.error('Error in residents real-time listener:', error);
      setLoadingResidents(false);
    }
      );
    } catch (err) {
      console.error('Error setting up residents listener:', err);
      setLoadingResidents(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, db]);

  useEffect(() => {
    if (user) {
      console.log('User authenticated, setting up real-time listeners...', { userEmail: user.email, dbExists: !!db });
      if (!db) {
        console.error('Firestore db is not available');
        alert('Database connection error. Please refresh the page.');
      }
    }
  }, [user, db]);

  // Real-time listener for billings so all Billing & Payment dropdown screens update live
  useEffect(() => {
    if (!user || !db) return;

    console.log('Setting up real-time listener for billings...');
    let unsubscribe: (() => void) | null = null;

    const attachListener = (useOrderBy: boolean) => {
      try {
        const baseQuery = useOrderBy
          ? query(collection(db, 'billings'), orderBy('createdAt', 'desc'))
          : query(collection(db, 'billings'));

        unsubscribe = onSnapshot(
          baseQuery,
          (snapshot) => {
            const billingsData: Billing[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              const billing = {
                id: docSnap.id,
                ...data,
              } as Billing;

              // Update status based on due date
              const dueDate = new Date(billing.dueDate);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              dueDate.setHours(0, 0, 0, 0);
              
              if (dueDate < today && billing.status !== 'notified') {
                billing.status = 'overdue';
              } else if (billing.status === 'pending') {
                billing.status = 'pending';
              }

              billingsData.push(billing);
            });

            billingsData.sort((a, b) => {
              const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
              const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
              return bDate - aDate;
            });

            setBillings(billingsData);
          },
          (error: any) => {
            console.error('Error in billings real-time listener:', error);
            if (useOrderBy && (error.code === 'failed-precondition' || error.message?.includes('index'))) {
              console.warn('orderBy failed in listener, retrying without orderBy');
              attachListener(false);
            }
          }
        );
      } catch (err) {
        console.error('Error setting up billings listener:', err);
      }
    };

    attachListener(true);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, db]);

  const handleSubmitBilling = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.residentId || !formData.billingCycle || !formData.dueDate || !formData.description || !formData.billingType) {
      alert('Please fill in all required fields');
      return;
    }

    if (!db) return;

    try {
      setLoading(true);
      
      // Get resident details from selected ID
      const selectedResident = residents.find(r => r.id === formData.residentId);
      if (!selectedResident) {
        alert('Resident not found. Please select a valid resident.');
        return;
      }

      const billingData = {
        residentId: formData.residentId,
        residentEmail: selectedResident.email,
        billingCycle: formData.billingCycle,
        dueDate: formData.dueDate,
        description: formData.description,
        billingType: formData.billingType as 'water' | 'electricity',
        status: 'pending' as const,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      console.log('Creating billing with data:', {
        residentId: billingData.residentId,
        residentEmail: billingData.residentEmail,
        billingCycle: billingData.billingCycle,
      });

      await addDoc(collection(db, 'billings'), billingData);
      
      console.log('Billing created successfully');
      
      setFormData({ residentId: '', billingCycle: '', dueDate: '', description: '', billingType: '' });
      setShowForm(false);
      await fetchBillings();
    } catch (error) {
      console.error('Error creating billing:', error);
      alert('Failed to create billing');
    } finally {
      setLoading(false);
    }
  }, [formData, residents, db, fetchBillings]);


  const formatDate = (value: any) => {
    if (!value) return 'N/A';
    try {
      let date: Date;
      // Firestore Timestamp with toDate()
      if (value.toDate && typeof value.toDate === 'function') {
        date = value.toDate();
      } else if (typeof value.seconds === 'number') {
        // Firestore Timestamp object shape
        date = new Date(value.seconds * 1000);
      } else if (value instanceof Date) {
        date = value;
      } else if (typeof value === 'number') {
        date = new Date(value);
      } else {
        // string or other
        date = new Date(value);
      }
      if (Number.isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  const getDateFromResident = (resident: Resident, isWater: boolean): Date | null => {
    const raw = isWater ? resident.waterBillingDate : resident.electricBillingDate;
    if (!raw) return null;
    try {
      // Firestore Timestamp
      // @ts-ignore - runtime check
      if (raw.toDate && typeof raw.toDate === 'function') {
        return raw.toDate();
      }
      // ISO / string date
      return new Date(raw);
    } catch {
      return null;
    }
  };

  const filteredResidentsForUtility = useMemo(() => {
    if (!isWaterView && !isElectricView) return [];

    return residents.filter((resident) => {
      const date = getDateFromResident(resident, !!isWaterView);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Status filter based on billing risk (due / due in 7 days / overdue)
      if (statusFilter !== 'all') {
        if (!date) return false;
        const d = new Date(date.getTime());
        d.setHours(0, 0, 0, 0);
        const diffMs = d.getTime() - today.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (statusFilter === 'overdue') {
          if (!(d < today)) return false;
        } else if (statusFilter === 'dueSoon') {
          if (!(diffDays >= 0 && diffDays <= 7)) return false;
        } else if (statusFilter === 'due') {
          if (!(d.getTime() === today.getTime())) return false;
        }
      }

      // Month / Year filter
      if (date && (billingMonth || billingYear)) {
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = String(date.getFullYear());
        if (billingMonth && m !== billingMonth) return false;
        if (billingYear && y !== billingYear) return false;
      } else if (!date && (billingMonth || billingYear)) {
        return false;
      }

      // Block filter
      if (blockFilter && resident.address?.block?.toLowerCase() !== blockFilter.toLowerCase()) {
        return false;
      }

      // Street filter
      if (streetFilter && resident.address?.street?.toLowerCase() !== streetFilter.toLowerCase()) {
        return false;
      }

      // Search term (name or email)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = (resident.fullName || '').toLowerCase();
        const email = (resident.email || '').toLowerCase();
        if (!name.includes(term) && !email.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [
    residents,
    isWaterView,
    isElectricView,
    statusFilter,
    billingMonth,
    billingYear,
    blockFilter,
    streetFilter,
    searchTerm,
  ]);

  // Unused - commented out to fix build error
  // const summaryForUtility = useMemo(() => {
  //   if (!isWaterView && !isElectricView) {
  //     return { total: 0, withDate: 0, withoutDate: 0 };
  //   }
  //   const total = filteredResidentsForUtility.length;
  //   let withDate = 0;
  //   let withoutDate = 0;
  //   filteredResidentsForUtility.forEach((resident) => {
  //     const date = getDateFromResident(resident, !!isWaterView);
  //     if (date) withDate += 1;
  //     else withoutDate += 1;
  //   });
  //   return { total, withDate, withoutDate };
  // }, [filteredResidentsForUtility, isWaterView, isElectricView]);



  const overdueCount = useMemo(
    () => billings.filter((b) => b.status === 'overdue').length,
    [billings]
  );

  const unpaidCount = useMemo(
    () => billings.filter((b) => b.status === 'pending' || b.status === 'overdue').length,
    [billings]
  );

  const resetSendBillForm = useCallback(
    (typeOverride?: 'water' | 'electricity' | '') => {
      const defaultType: 'water' | 'electricity' | '' = 
        typeOverride ?? (isWaterView ? 'water' : isElectricView ? 'electricity' : '');
      setSendBillResident(null);
      setSendBillData({
        billingCycle: '',
        dueDate: new Date().toISOString().split('T')[0],
        description: '',
        billingType: defaultType,
      });
    },
    [isWaterView, isElectricView]
  );

  const handleSubmitSendBill = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sendBillResident || !sendBillData.dueDate || !sendBillData.billingType) {
        alert('Please fill in the due date and billing type.');
        return;
      }
      if (!db) return;

      try {
        setLoading(true);

        const billingData: Omit<Billing, 'id'> = {
          residentId: sendBillResident.id,
          residentEmail: sendBillResident.email,
          billingCycle: sendBillData.billingCycle || 'Manual Billing',
          dueDate: sendBillData.dueDate,
          description: sendBillData.description || 'Manual billing created by admin',
          billingType: sendBillData.billingType as 'water' | 'electricity',
          status: 'notified',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        } as any;

        await addDoc(collection(db, 'billings'), billingData);

        // Send a notification so the resident is alerted about their due date
        await addDoc(collection(db, 'notifications'), {
          recipientUserId: sendBillResident.id,
          type: 'billing',
          subject: 'Billing Due Date Notification',
          message: `You have a billing due for ${billingData.billingCycle}. Due date: ${formatDate(
            billingData.dueDate
          )}. ${billingData.description ? `Description: ${billingData.description}` : ''}`,
          isRead: false,
          createdAt: Timestamp.now(),
        });

        alert('Billing created and notification sent.');

        setShowSendBillForm(false);
        resetSendBillForm();
        await fetchBillings();
      } catch (error) {
        console.error('Error creating billing from Send Bill form:', error);
        alert('Failed to create billing.');
      } finally {
        setLoading(false);
      }
    },
    [db, sendBillResident, sendBillData, fetchBillings, resetSendBillForm]
  );

  const getNextMonthDateString = (dateStr: string, months: number = 1): string => {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) return dateStr;
    const next = new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
    return next.toISOString().split('T')[0];
  };


  const openProofModalForBilling = useCallback((billing: Billing) => {
    setProofBilling(billing);
    setApproveMonthsAdvance(1); // Reset to default 1 month
    setShowProofModal(true);
  }, []);

  const handleVerifyProof = useCallback(
    async (action: 'approve' | 'reject') => {
      if (!db || !proofBilling) return;
      try {
        setLoading(true);
        const updates: any = {
          updatedAt: Timestamp.now(),
        };
        if (action === 'approve') {
          updates.status = 'paid';
          updates.userProofStatus = 'verified';
          if (proofBilling.dueDate) {
            const nextDateStr = getNextMonthDateString(proofBilling.dueDate, approveMonthsAdvance);
            // Update both current billing's dueDate (so UI shows next cycle)
            // and keep nextBillingDate for reference if needed.
            updates.dueDate = nextDateStr;
            updates.nextBillingDate = nextDateStr;
          }
          // Also update resident's billing date (water/electricity) by selected months
          if (proofBilling.residentId && proofBilling.dueDate && proofBilling.billingType) {
            const nextDateStr = getNextMonthDateString(proofBilling.dueDate, approveMonthsAdvance);
            const residentRef = doc(db, 'users', proofBilling.residentId);
            const residentUpdates: any = {};
            if (proofBilling.billingType === 'water') {
              residentUpdates.waterBillingDate = nextDateStr;
            } else if (proofBilling.billingType === 'electricity') {
              residentUpdates.electricBillingDate = nextDateStr;
            }
            if (Object.keys(residentUpdates).length > 0) {
              residentUpdates.updatedAt = Timestamp.now();
              await updateDoc(residentRef, residentUpdates);
            }
          }
        } else {
          updates.userProofStatus = 'rejected';
        }
        await updateDoc(doc(db, 'billings', proofBilling.id), updates);

        // Notify resident about the result of their proof submission
        try {
          const statusLabel = action === 'approve' ? 'approved' : 'rejected';
          const billingTypeLabel =
            proofBilling.billingType === 'water'
              ? 'Water'
              : proofBilling.billingType === 'electricity'
              ? 'Electricity'
              : 'Billing';
          const subject =
            action === 'approve'
              ? 'Proof of Payment Approved'
              : 'Proof of Payment Rejected';
          const message =
            action === 'approve'
              ? `Your proof of payment for ${billingTypeLabel.toLowerCase()} billing "${
                  proofBilling.billingCycle
                }" has been approved.`
              : `Your proof of payment for ${billingTypeLabel.toLowerCase()} billing "${
                  proofBilling.billingCycle
                }" has been rejected. Please contact the admin if you have questions.`;

          await addDoc(collection(db, 'notifications'), {
            type: 'billing_proof_status',
            billingId: proofBilling.id,
            userId: proofBilling.residentId || null,
            userEmail: proofBilling.residentEmail || '',
            subject,
            message,
            status: statusLabel,
            recipientType: 'user',
            recipientUserId: proofBilling.residentId || null,
            isRead: false,
            createdAt: Timestamp.now(),
          });
        } catch (notifyErr) {
          console.error('Error creating user notification for billing proof status:', notifyErr);
        }
        setShowProofModal(false);
        setProofBilling(null);
        setApproveMonthsAdvance(1);
        await fetchBillings();
        alert(action === 'approve' ? `Proof approved and billing marked as paid. Billing date advanced by ${approveMonthsAdvance} ${approveMonthsAdvance === 1 ? 'month' : 'months'}.` : 'Proof rejected.');
      } catch (error) {
        console.error('Error verifying proof:', error);
        alert('Failed to update billing proof status.');
      } finally {
        setLoading(false);
      }
    },
    [db, proofBilling, fetchBillings, approveMonthsAdvance]
  );

  const handleArchiveProof = useCallback(
    async (billing: Billing) => {
      if (!db || !billing?.id) return;
      const confirm = window.confirm('Archive this proof and hide it from the list?');
      if (!confirm) return;
      try {
        setLoading(true);
        await updateDoc(doc(db, 'billings', billing.id), {
          archived: true,
          updatedAt: Timestamp.now(),
          archivedAt: Timestamp.now(),
        });
        await fetchBillings();
      } catch (error) {
        console.error('Error archiving proof:', error);
        alert('Failed to archive proof.');
      } finally {
        setLoading(false);
      }
    },
    [db, fetchBillings]
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'notified': return '#4CAF50';
      case 'pending': return '#FFA500';
      case 'overdue': return '#dc2626';
      default: return '#666666';
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full">
        <Header
          title={
            isWaterView
              ? 'Water Billing Dates'
              : isElectricView
              ? 'Electricity Billing Dates'
              : 'Billings'
          }
        />

        <main className="w-full max-w-full m-0 p-4 md:p-6 lg:p-10 box-border">
          <div className="flex flex-col gap-4 md:gap-6 w-full max-w-full">
            {!isWaterView && !isElectricView && !isProofsView && (
              <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                  <h2 className="m-0 text-gray-900 text-lg font-normal">Billing Management</h2>
                  <div className="flex gap-2">
                    <button 
                      className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => setShowForm(true)}
                    >
                      New Due
                    </button>
                    <button 
                      className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={fetchBillings} 
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                </div>

                {showForm && (
                  <div className="bg-gray-900 rounded-2xl p-4 md:p-6 lg:p-8 border border-gray-800 shadow-lg mb-6 md:mb-8">
                    <h3 className="mt-0 mb-6 text-white text-xl font-normal tracking-tight">Post New Due</h3>
                    <form onSubmit={handleSubmitBilling}>
                      <div className="mb-6">
                        <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                          Select Resident *
                        </label>
                        {loadingResidents ? (
                          <div className="p-3 text-gray-300 text-sm">Loading residents...</div>
                        ) : (
                          <select
                            value={formData.residentId}
                            onChange={(e) => setFormData({ ...formData, residentId: e.target.value })}
                            required
                            className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                          >
                            <option value="">-- Select a resident --</option>
                            {residents.map((resident) => (
                              <option key={resident.id} value={resident.id}>
                                {resident.fullName ? `${resident.fullName} (${resident.email})` : resident.email}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="mb-6">
                          <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                            Billing Cycle *
                          </label>
                          <input
                            type="text"
                            value={formData.billingCycle}
                            onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value })}
                            placeholder="e.g., January 2024"
                            required
                            className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                          />
                        </div>

                        <div className="mb-6">
                          <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                            Due Date *
                          </label>
                          <input
                            type="date"
                            value={formData.dueDate}
                            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                            required
                            className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                          />
                        </div>
                      </div>

                      <div className="mb-6">
                        <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                          Billing Type *
                        </label>
                        <select
                          value={formData.billingType}
                          onChange={(e) => setFormData({ ...formData, billingType: e.target.value })}
                          required
                          className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                        >
                          <option value="">Select type</option>
                          <option value="water">Water</option>
                          <option value="electricity">Electricity</option>
                        </select>
                      </div>

                      <div className="mb-6">
                        <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                          Description *
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Billing description..."
                          rows={3}
                          required
                          className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white resize-y min-h-[80px] box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                        />
                      </div>

                      <div className="flex gap-3 mt-8 pt-6 border-t border-gray-600">
                        <button 
                          type="submit" 
                          className="bg-primary text-white border-none px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all shadow-md shadow-primary/20 hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                          disabled={loading}
                        >
                          {loading ? 'Posting...' : 'Post Due'}
                        </button>
                        <button
                          type="button"
                          className="bg-gray-800 text-white border border-gray-600 px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:border-gray-500 hover:bg-gray-700"
                          onClick={() => {
                            setShowForm(false);
                            setFormData({ residentId: '', billingCycle: '', dueDate: '', description: '', billingType: '' });
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {loading && billings.length === 0 ? (
                  <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading billings...</div>
                ) : billings.length === 0 ? (
                  <div className="text-center py-20 px-5 text-gray-600">
                    <p className="text-base font-normal text-gray-600">No billings found.</p>
                  </div>
                ) : (
                  (() => {
                    const totalPages = Math.max(1, Math.ceil(billings.length / ITEMS_PER_PAGE));
                    const safePage = Math.min(currentPage, totalPages);
                    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
                    const paginated = billings.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                    return (
                  <div className="overflow-x-auto w-full">
                    {(overdueCount > 0 || unpaidCount > 0) && (
                      <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-900 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <span className="font-semibold">Attention:</span>{' '}
                          {overdueCount > 0 && (
                            <span>{overdueCount} billing{overdueCount > 1 ? 's' : ''} are overdue. </span>
                          )}
                          {unpaidCount > 0 && (
                            <span>{unpaidCount} resident billing{unpaidCount > 1 ? 's' : ''} are still unpaid or partially paid.</span>
                          )}
                        </div>
                      </div>
                    )}
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Date</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Resident</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Billing Cycle</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Due Date</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((billing) => (
                          <tr
                            key={billing.id}
                            className="last:border-b-0 border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                              {formatDate(billing.createdAt?.toDate ? billing.createdAt.toDate().toISOString() : '')}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{billing.residentEmail}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{billing.billingCycle}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{formatDate(billing.dueDate)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 align-middle">
                              <span
                                className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                                style={{ backgroundColor: getStatusColor(billing.status) }}
                              >
                                {billing.status.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {billings.length > 0 && (
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
                  </div>
                    );
                  })()
                )}
              </div>
            )}

            {(isWaterView || isElectricView) && (
              <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
                  <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">
                    {isWaterView ? 'Water Billing Dates' : 'Electricity Billing Dates'}
                  </h2>
                </div>

                <div className="mb-5 md:mb-6 space-y-4">
                  <div className="flex flex-col md:flex-row gap-3 items-start md:items-center md:justify-end">
                    <input
                      type="text"
                      placeholder="Search name or email..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full md:w-[320px] px-3 md:px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <button
                      type="button"
                      className="px-4 py-2 text-sm bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200"
                      onClick={() => {
                        setSearchTerm('');
                        setBlockFilter('');
                        setStreetFilter('');
                        setStatusFilter('all');
                        setBillingMonth('');
                        setBillingYear('');
                        setCurrentPage(1);
                      }}
                    >
                      Clear Filters
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:flex md:flex-wrap md:items-end">
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Block</label>
                      <select
                        value={blockFilter}
                        onChange={(e) => {
                          setBlockFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      >
                        <option value="">All Blocks</option>
                        {blockOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Street</label>
                      <select
                        value={streetFilter}
                        onChange={(e) => {
                          setStreetFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      >
                        <option value="">All Streets</option>
                        {streetOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Status</label>
                      <select
                        value={statusFilter}
                        onChange={(e) => {
                          setStatusFilter(e.target.value as 'all' | 'due' | 'dueSoon' | 'overdue');
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      >
                        <option value="all">All</option>
                        <option value="due">Due today</option>
                        <option value="dueSoon">Due in 7 days</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[160px]">
                      <label className="text-xs text-gray-600">Billing Month</label>
                      <select
                        value={billingMonth}
                        onChange={(e) => {
                          setBillingMonth(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      >
                        <option value="">All Months</option>
                        <option value="01">January</option>
                        <option value="02">February</option>
                        <option value="03">March</option>
                        <option value="04">April</option>
                        <option value="05">May</option>
                        <option value="06">June</option>
                        <option value="07">July</option>
                        <option value="08">August</option>
                        <option value="09">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[140px]">
                      <label className="text-xs text-gray-600">Billing Year</label>
                      <input
                        type="number"
                        placeholder="Year"
                        value={billingYear}
                        onChange={(e) => {
                          setBillingYear(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
                </div>

                {loadingResidents && residents.length === 0 ? (
                  <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading residents...</div>
                ) : residents.length === 0 ? (
                  <div className="text-center py-20 px-5 text-gray-600">
                    <p className="text-base font-normal text-gray-600">No residents found.</p>
                  </div>
                ) : (
                  (() => {
                    const residentsForTable = filteredResidentsForUtility;

                    if (residentsForTable.length === 0) {
                      return (
                        <div className="text-center py-20 px-5 text-gray-600">
                          <p className="text-base font-normal text-gray-600">
                            No {isWaterView ? 'water' : 'electricity'} records match the current filters.
                          </p>
                        </div>
                      );
                    }

                    const totalPages = Math.max(1, Math.ceil(residentsForTable.length / ITEMS_PER_PAGE));
                    const safePage = Math.min(currentPage, totalPages);
                    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
                    const paginatedResidents = residentsForTable.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                    return (
                      <div className="w-full">
                        {/* Mobile cards */}
                        <div className="flex flex-col gap-3 md:hidden">
                          {paginatedResidents.map((resident) => {
                            return (
                              <div
                                key={resident.id}
                                className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900">
                                      {resident.fullName || 'N/A'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {resident.email}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-xs text-gray-600 space-y-0.5 mb-3">
                                  <p>
                                    <span className="font-medium">Block:</span>{' '}
                                    {resident.address?.block || 'N/A'}
                                  </p>
                                  <p>
                                    <span className="font-medium">Lot:</span>{' '}
                                    {resident.address?.lot || 'N/A'}
                                  </p>
                                  <p>
                                    <span className="font-medium">Street:</span>{' '}
                                    {resident.address?.street || 'N/A'}
                                  </p>
                                  <p>
                                    <span className="font-medium">
                                      {isWaterView ? 'Water' : 'Electricity'} Billing Date:
                                    </span>{' '}
                                    {formatDate(
                                      (isWaterView
                                        ? resident.waterBillingDate
                                        : resident.electricBillingDate) as any
                                    )}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto w-full">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b-2 border-gray-200">
                              <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                  Resident
                              </th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                  Email
                                </th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                  Block
                                </th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                  Lot
                                </th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                  Street
                                </th>
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                  {isWaterView
                                    ? 'Water Billing Date'
                                    : 'Electricity Billing Date'}
                                </th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedResidents.map((resident) => {
                              return (
                              <tr
                                key={resident.id}
                                className="last:border-b-0 border-b border-gray-100 hover:bg-gray-50"
                              >
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                      <div className="flex items-center gap-2">
                                        <span>{resident.fullName || 'N/A'}</span>
                                      </div>
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {resident.email}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {resident.address?.block || 'N/A'}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {resident.address?.lot || 'N/A'}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {resident.address?.street || 'N/A'}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {formatDate(
                                        (isWaterView
                                          ? resident.waterBillingDate
                                          : resident.electricBillingDate) as any
                                  )}
                                </td>
                              </tr>
                                );
                              })}
                          </tbody>
                        </table>
                        </div>
                        {residentsForTable.length > 0 && (
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-4 gap-3">
                            <div className="flex items-center justify-between md:justify-end gap-2 w-full">
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
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {isProofsView && (
              <div className="w-full bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-gray-100 shadow-sm">
                <div className="flex flex-col gap-4 mb-4 md:mb-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                  <h2 className="m-0 text-gray-900 text-base md:text-lg font-normal">
                    Proof of Payment
                  </h2>
                  <p className="m-0 text-xs text-gray-500">
                    Review proofs sent by residents and mark billings as paid or reject them.
                  </p>
                    </div>
                  </div>

                  {/* Filters for proofs */}
                  <div className="flex flex-col md:flex-row gap-3 md:items-end">
                    <div className="flex flex-col gap-1 md:w-[220px]">
                      <label className="text-xs text-gray-600">Search</label>
                      <input
                        type="text"
                        placeholder="Search resident, cycle, or type..."
                        value={proofSearchQuery}
                        onChange={(e) => setProofSearchQuery(e.target.value)}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Submitted Date</label>
                      <input
                        type="date"
                        value={proofFilterDate}
                        onChange={(e) => setProofFilterDate(e.target.value)}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Proof Status</label>
                      <select
                        value={proofStatusFilter}
                        onChange={(e) =>
                          setProofStatusFilter(
                            e.target.value as 'all' | 'pending' | 'verified' | 'rejected'
                          )
                        }
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:w-[180px]">
                      <label className="text-xs text-gray-600">Billing Type</label>
                      <select
                        value={proofTypeFilter}
                        onChange={(e) =>
                          setProofTypeFilter(
                            e.target.value as 'all' | 'water' | 'electricity'
                          )
                        }
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      >
                        <option value="all">All</option>
                        <option value="water">Water</option>
                        <option value="electricity">Electricity</option>
                      </select>
                    </div>
                    <div className="flex flex-row gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 text-xs bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200"
                        onClick={() => {
                          setProofSearchQuery('');
                          setProofFilterDate('');
                          setProofStatusFilter('all');
                          setProofTypeFilter('all');
                        }}
                      >
                        Clear Filters
                      </button>
                    </div>
                  </div>
                </div>

                {loading && billings.length === 0 ? (
                  <div className="text-center py-[60px] px-5 text-gray-600 text-sm">
                    Loading proofs...
                  </div>
                ) : (
                  (() => {
                    const proofs = billings.filter(
                      (b) =>
                        !b.archived &&
                        (b.userProofImageUrl || b.userProofDetails || b.userProofStatus)
                    );

                    const filteredProofs = proofs.filter((b) => {
                      let matchesStatus = true;
                      let matchesType = true;
                      let matchesSearch = true;
                      let matchesDate = true;

                      if (proofStatusFilter !== 'all') {
                        matchesStatus = (b.userProofStatus || 'none') === proofStatusFilter;
                      }

                      if (proofTypeFilter !== 'all') {
                        matchesType = b.billingType === proofTypeFilter;
                      }

                      if (proofSearchQuery.trim()) {
                        const q = proofSearchQuery.toLowerCase().trim();
                        const residentEmail = (b.residentEmail || '').toLowerCase();
                        const billingCycle = (b.billingCycle || '').toLowerCase();
                        const billingTypeLabel = b.billingType
                          ? b.billingType === 'water'
                            ? 'water'
                            : 'electricity'
                          : '';
                        matchesSearch =
                          residentEmail.includes(q) ||
                          billingCycle.includes(q) ||
                          billingTypeLabel.includes(q);
                      }

                      if (proofFilterDate) {
                        // Check submitted date only
                        const submittedRaw = b.userProofSubmittedAt as any;
                        if (!submittedRaw) {
                          matchesDate = false;
                        } else {
                          let date: Date | null = null;
                          try {
                            if (submittedRaw.toDate && typeof submittedRaw.toDate === 'function') {
                              date = submittedRaw.toDate();
                            } else if (typeof submittedRaw.seconds === 'number') {
                              date = new Date(submittedRaw.seconds * 1000);
                            } else {
                              date = new Date(submittedRaw);
                            }
                          } catch {
                            date = null;
                          }
                          if (!date || Number.isNaN(date.getTime())) {
                            matchesDate = false;
                          } else {
                            const iso = date.toISOString().split('T')[0];
                            matchesDate = iso === proofFilterDate;
                          }
                        }
                      }

                      return matchesStatus && matchesType && matchesSearch && matchesDate;
                    });

                    if (filteredProofs.length === 0) {
                      return (
                        <div className="text-center py-20 px-5 text-gray-600">
                          <p className="text-base font-normal text-gray-600">
                            No proofs of payment match the current filters.
                          </p>
                        </div>
                      );
                    }

                    // Pagination logic
                    const totalPages = Math.max(1, Math.ceil(filteredProofs.length / PROOF_ITEMS_PER_PAGE));
                    const safePage = Math.min(proofCurrentPage, totalPages);
                    const startIndex = (safePage - 1) * PROOF_ITEMS_PER_PAGE;
                    const paginatedProofs = filteredProofs.slice(startIndex, startIndex + PROOF_ITEMS_PER_PAGE);

                    return (
                      <div className="w-full">
                        {/* Mobile cards */}
                        <div className="flex flex-col gap-3 md:hidden">
                          {paginatedProofs.map((billing) => (
                            <div
                              key={billing.id}
                              className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {(() => {
                                      const resident = residents.find(
                                        (r) =>
                                          r.id === billing.residentId ||
                                          r.email === billing.residentEmail
                                      );
                                      return (
                                        resident?.fullName ||
                                        billing.residentEmail ||
                                        'N/A'
                                      );
                                    })()}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {billing.billingCycle}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {billing.billingType
                                      ? billing.billingType === 'water'
                                        ? 'Water'
                                        : 'Electricity'
                                      : '—'}
                                  </p>
                                </div>
                                <span className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide inline-block bg-gray-100 text-gray-700">
                                  {(billing.userProofStatus || 'none').toUpperCase()}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 space-y-0.5 mb-3">
                                <p>
                                </p>
                                <p>
                                  <span className="font-medium">Submitted:</span>{' '}
                                  {billing.userProofSubmittedAt
                                    ? formatDate(
                                        (billing.userProofSubmittedAt as any).toDate
                                          ? (billing.userProofSubmittedAt as any).toDate()
                                          : billing.userProofSubmittedAt
                                      )
                                    : '—'}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  className="flex-1 bg-yellow-500 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-yellow-600"
                                  onClick={() => openProofModalForBilling(billing)}
                                >
                                  {billing.userProofStatus === 'pending'
                                    ? 'Review Proof'
                                    : 'View Proof'}
                                </button>
                                <button
                                  className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors whitespace-nowrap"
                                  onClick={() => handleArchiveProof(billing)}
                                >
                                  Archive
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto w-full">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b-2 border-gray-200">
                              <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                Resident
                              </th>
                              <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                Billing Cycle
                              </th>
                              <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                Type
                              </th>
                              <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                Submitted
                              </th>
                              <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                Proof Status
                              </th>
                              <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedProofs.map((billing) => (
                              <tr
                                key={billing.id}
                                className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100"
                              >
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {(() => {
                                    const resident = residents.find(
                                      (r) => r.id === billing.residentId || r.email === billing.residentEmail
                                    );
                                    return resident?.fullName || billing.residentEmail || 'N/A';
                                  })()}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {billing.billingCycle}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {billing.billingType
                                    ? billing.billingType === 'water'
                                      ? 'Water'
                                      : 'Electricity'
                                    : '—'}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                  {billing.userProofSubmittedAt
                                    ? formatDate(
                                        (billing.userProofSubmittedAt as any).toDate
                                          ? (billing.userProofSubmittedAt as any).toDate()
                                          : billing.userProofSubmittedAt
                                      )
                                    : '—'}
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 align-middle">
                                  <span
                                    className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${
                                      billing.userProofStatus === 'verified'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {(billing.userProofStatus || 'none').toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-4 py-4 border-b border-gray-100 align-middle">
                                  <div className="flex gap-2">
                                    <button
                                      className={
                                        billing.userProofStatus === 'pending'
                                          ? 'bg-yellow-500 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-yellow-600'
                                          : 'bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-blue-100'
                                      }
                                      onClick={() => openProofModalForBilling(billing)}
                                    >
                                      {billing.userProofStatus === 'pending' ? 'Review Proof' : 'View Proof'}
                                    </button>
                                    <button
                                      className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors whitespace-nowrap"
                                      onClick={() => handleArchiveProof(billing)}
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
                        {filteredProofs.length > 0 && (
                          <div className="flex items-center justify-between mt-4 gap-3">
                            <span className="text-xs text-gray-600">
                              Page {safePage} of {totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                className="px-3 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setProofCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={safePage === 1}
                              >
                                Previous
                              </button>
                              <button
                                className="px-3 py-1.5 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setProofCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={safePage === totalPages}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        </main>


        {showProofModal && proofBilling && (
          <div
            className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5"
            onClick={() => {
              setShowProofModal(false);
              setProofBilling(null);
              setApproveMonthsAdvance(1);
            }}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-[520px] p-4 md:p-6 lg:p-8 shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="m-0 text-gray-900 text-xl font-normal">
                  Proof of Payment – {proofBilling.billingCycle || 'Billing'}
                </h3>
                <button
                  className="bg-none border-none text-2xl text-gray-500 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => {
                    setShowProofModal(false);
                    setProofBilling(null);
                    setApproveMonthsAdvance(1);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 text-sm text-gray-700 space-y-1">
                <p>
                  <span className="font-semibold">Resident:</span> {proofBilling.residentEmail}
                </p>
                <p>
                </p>
              </div>

              <div className="mb-6 space-y-3">
                <div>
                  <label className="block mb-2 font-normal text-gray-700 text-xs uppercase tracking-wide">
                    Submitted Proof
                  </label>
                  <div className="border border-gray-200 rounded-lg p-3 text-sm text-gray-800 bg-gray-50 min-h-[80px] whitespace-pre-line">
                    {proofBilling.userProofImageUrl ? (
                      <img
                        src={proofBilling.userProofImageUrl}
                        alt="Proof of payment"
                        className="max-h-64 rounded-md object-contain"
                      />
                    ) : proofBilling.userProofDetails ? (
                      proofBilling.userProofDetails
                    ) : (
                      'No image or details provided.'
                    )}
                  </div>
                </div>
                {proofBilling.userProofStatus === 'pending' && (
                  <div>
                    <label className="block mb-2 font-normal text-gray-700 text-xs uppercase tracking-wide">
                      Advance Billing Date (Months)
                    </label>
                    <select
                      value={approveMonthsAdvance}
                      onChange={(e) => setApproveMonthsAdvance(Number(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((months) => (
                        <option key={months} value={months}>
                          {months} {months === 1 ? 'month' : 'months'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200">
                {proofBilling.userProofStatus === 'pending' ? (
                  <>
                    <button
                      type="button"
                      className="bg-green-600 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleVerifyProof('approve')}
                      disabled={loading}
                    >
                      {loading ? 'Updating...' : `Approve & Mark Paid (+${approveMonthsAdvance} ${approveMonthsAdvance === 1 ? 'month' : 'months'})`}
                    </button>
                    <button
                      type="button"
                      className="bg-red-50 text-red-700 border border-red-200 px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleVerifyProof('reject')}
                      disabled={loading}
                    >
                      Reject Proof
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="bg-gray-800 text-white border border-gray-700 px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:bg-gray-700"
                    onClick={() => {
                      setShowProofModal(false);
                      setProofBilling(null);
                      setApproveMonthsAdvance(1);
                    }}
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showSendBillForm && sendBillResident && (
          <div
            className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5"
            onClick={() => {
              setShowSendBillForm(false);
              resetSendBillForm();
            }}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-[520px] p-4 md:p-6 lg:p-8 shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="m-0 text-gray-900 text-xl font-normal">
                  Send Bill to {sendBillResident.fullName || sendBillResident.email}
                </h3>
                <button
                  className="bg-none border-none text-2xl text-gray-500 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => {
                    setShowSendBillForm(false);
                    resetSendBillForm();
                  }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitSendBill}>
                <div className="mb-4">
                  <label className="block mb-2 font-normal text-gray-700 text-xs uppercase tracking-wide">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={sendBillData.dueDate}
                    onChange={(e) =>
                      setSendBillData((prev) => ({ ...prev, dueDate: e.target.value }))
                    }
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div className="mb-4">
                  <label className="block mb-2 font-normal text-gray-700 text-xs uppercase tracking-wide">
                    Billing Cycle
                  </label>
                  <input
                    type="text"
                    value={sendBillData.billingCycle}
                    onChange={(e) =>
                      setSendBillData((prev) => ({ ...prev, billingCycle: e.target.value }))
                    }
                    placeholder="e.g., December 2025"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div className="mb-6">
                  <label className="block mb-2 font-normal text-gray-700 text-xs uppercase tracking-wide">
                    Description
                  </label>
                  <textarea
                    value={sendBillData.description}
                    onChange={(e) =>
                      setSendBillData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Optional note for this billing..."
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm transition-all resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white border-none px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    {loading ? 'Sending...' : 'Create Billing & Notify'}
                  </button>
                  <button
                    type="button"
                    className="bg-white text-gray-800 border border-gray-300 px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:bg-gray-50"
                    onClick={() => {
                      setShowSendBillForm(false);
                      resetSendBillForm();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default memo(BillingPayment);
