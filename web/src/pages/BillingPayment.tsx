import { useEffect, useState, memo, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, addDoc, updateDoc, doc, Timestamp, onSnapshot, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

interface Payment {
  id?: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber?: string;
}

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
  amount: number;
  description: string;
  billingType?: 'water' | 'electricity';
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  payments?: Payment[];
  totalPaid?: number;
  balance?: number;
  createdAt: any;
  updatedAt?: any;
  userProofDetails?: string;
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
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<Billing | null>(null);
  const [showSendBillForm, setShowSendBillForm] = useState(false);
  const [sendBillResident, setSendBillResident] = useState<Resident | null>(null);
  const [sendBillData, setSendBillData] = useState({
    amount: '',
    billingCycle: '',
    dueDate: new Date().toISOString().split('T')[0],
    description: '',
    billingType: '',
  });
  const [formData, setFormData] = useState({
    residentId: '',
    billingCycle: '',
    dueDate: '',
    amount: '',
    description: '',
    billingType: '',
  });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    referenceNumber: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [showProofModal, setShowProofModal] = useState(false);
  const [proofBilling, setProofBilling] = useState<Billing | null>(null);
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
        
        // Calculate totals
        const totalPaid = billing.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        billing.totalPaid = totalPaid;
        billing.balance = billing.amount - totalPaid;
        
        // Update status based on balance
        if (billing.balance <= 0) {
          billing.status = 'paid';
        } else if (billing.balance < billing.amount) {
          billing.status = 'partial';
        } else {
          const dueDate = new Date(billing.dueDate);
          const today = new Date();
          if (dueDate < today) {
            billing.status = 'overdue';
          } else {
            billing.status = 'pending';
          }
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

  const fetchResidents = useCallback(async () => {
    if (!db) return;
    
    try {
      setLoadingResidents(true);
      const querySnapshot = await getDocs(collection(db, 'users'));
      const residentsData: Resident[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out superadmin accounts - only include residents (but include all resident statuses)
        if (data.role === 'superadmin') {
          return;
        }
        residentsData.push({
          id: doc.id,
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
    } catch (error) {
      console.error('Error fetching residents:', error);
    } finally {
      setLoadingResidents(false);
    }
  }, [db]);

  useEffect(() => {
    if (user) {
      console.log('User authenticated, fetching billings...', { userEmail: user.email, dbExists: !!db });
      if (db) {
        fetchResidents();
      } else {
        console.error('Firestore db is not available');
        alert('Database connection error. Please refresh the page.');
      }
    }
  }, [user, db, fetchBillings, fetchResidents]);

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

              const totalPaid =
                billing.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
              billing.totalPaid = totalPaid;
              billing.balance = billing.amount - totalPaid;

              if (billing.balance <= 0) {
                billing.status = 'paid';
              } else if (billing.balance < billing.amount) {
                billing.status = 'partial';
              } else {
                const dueDate = new Date(billing.dueDate);
                const today = new Date();
                if (dueDate < today) {
                  billing.status = 'overdue';
                } else {
                  billing.status = 'pending';
                }
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
    if (!formData.residentId || !formData.billingCycle || !formData.dueDate || !formData.amount || !formData.description || !formData.billingType) {
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
        amount: parseFloat(formData.amount),
        description: formData.description,
        billingType: formData.billingType as 'water' | 'electricity',
        status: 'pending' as const,
        payments: [],
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
      
      setFormData({ residentId: '', billingCycle: '', dueDate: '', amount: '', description: '' });
      setShowForm(false);
      await fetchBillings();
    } catch (error) {
      console.error('Error creating billing:', error);
      alert('Failed to create billing');
    } finally {
      setLoading(false);
    }
  }, [formData, residents, db, fetchBillings]);

  const handleSubmitPayment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentData.amount || !paymentData.paymentDate || !paymentData.paymentMethod || !selectedBilling) {
      alert('Please fill in all required fields');
      return;
    }

    if (!db) return;

    try {
      setLoading(true);
      const paymentAmount = parseFloat(paymentData.amount);
      
      const currentPayments = selectedBilling.payments || [];
      const newPayment: Payment = {
        amount: paymentAmount,
        paymentDate: paymentData.paymentDate,
        paymentMethod: paymentData.paymentMethod,
        referenceNumber: paymentData.referenceNumber || undefined,
      };
      
      const updatedPayments = [...currentPayments, newPayment];
      const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
      const balance = selectedBilling.amount - totalPaid;
      
      let newStatus: Billing['status'] = 'pending';
      if (balance <= 0) {
        newStatus = 'paid';
      } else if (balance < selectedBilling.amount) {
        newStatus = 'partial';
      } else {
        const dueDate = new Date(selectedBilling.dueDate);
        const today = new Date();
        if (dueDate < today) {
          newStatus = 'overdue';
        }
      }

      await updateDoc(doc(db, 'billings', selectedBilling.id), {
        payments: updatedPayments,
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      
      setPaymentData({ amount: '', paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'cash', referenceNumber: '' });
      setShowPaymentForm(false);
      setSelectedBilling(null);
      await fetchBillings();
      alert('Payment recorded successfully!');
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('Failed to record payment');
    } finally {
      setLoading(false);
    }
  }, [paymentData, selectedBilling, db, fetchBillings]);

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

  const summaryForUtility = useMemo(() => {
    if (!isWaterView && !isElectricView) {
      return { total: 0, withDate: 0, withoutDate: 0 };
    }
    const total = filteredResidentsForUtility.length;
    let withDate = 0;
    let withoutDate = 0;
    filteredResidentsForUtility.forEach((resident) => {
      const date = getDateFromResident(resident, !!isWaterView);
      if (date) withDate += 1;
      else withoutDate += 1;
    });
    return { total, withDate, withoutDate };
  }, [filteredResidentsForUtility, isWaterView, isElectricView]);

  const latestBillingByResidentId = useMemo(() => {
    const map = new Map<string, Billing>();
    billings.forEach((billing) => {
      if (!billing.residentId) return;
      const existing = map.get(billing.residentId);
      const createdAtTime = billing.createdAt?.toDate ? billing.createdAt.toDate().getTime() : 0;
      const existingTime = existing?.createdAt?.toDate ? existing.createdAt.toDate().getTime() : 0;
      if (!existing || createdAtTime > existingTime) {
        map.set(billing.residentId, billing);
      }
    });
    return map;
  }, [billings]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  const overdueCount = useMemo(
    () => billings.filter((b) => b.status === 'overdue').length,
    [billings]
  );

  const unpaidCount = useMemo(
    () => billings.filter((b) => b.status === 'pending' || b.status === 'partial' || b.status === 'overdue').length,
    [billings]
  );

  const resetSendBillForm = useCallback(
    (typeOverride?: 'water' | 'electricity' | '') => {
      setSendBillResident(null);
      setSendBillData({
        amount: '',
        billingCycle: '',
        dueDate: new Date().toISOString().split('T')[0],
        description: '',
        billingType: typeOverride ?? '',
      });
    },
    []
  );

  const openSendBillFormForBilling = useCallback(
    (billing: Billing) => {
      const resident = residents.find(
        (r) => r.id === billing.residentId || r.email === billing.residentEmail
      );
      if (!resident) {
        alert('Resident not found for this billing record.');
        return;
      }
      const inferredType: 'water' | 'electricity' | '' =
        billing.billingType ||
        (isWaterView ? 'water' : isElectricView ? 'electricity' : '');

      setSendBillResident(resident);
      setSendBillData({
        amount: '',
        billingCycle: '',
        dueDate: new Date().toISOString().split('T')[0],
        description: '',
        billingType: inferredType,
      });
      setShowSendBillForm(true);
    },
    [residents, isWaterView, isElectricView]
  );

  const openSendBillFormForResident = useCallback(
    (resident: Resident) => {
      const inferredType: 'water' | 'electricity' | '' =
        isWaterView ? 'water' : isElectricView ? 'electricity' : '';
      setSendBillResident(resident);
      resetSendBillForm(inferredType);
      setSendBillResident(resident);
      setShowSendBillForm(true);
    },
    [resetSendBillForm, isWaterView, isElectricView]
  );

  const handleSubmitSendBill = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sendBillResident || !sendBillData.amount || !sendBillData.dueDate || !sendBillData.billingType) {
        alert('Please fill in the amount, type, and due date.');
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
          amount: parseFloat(sendBillData.amount),
          description: sendBillData.description || 'Manual billing created by admin',
          billingType: sendBillData.billingType as 'water' | 'electricity',
          status: 'pending',
          payments: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        } as any;

        await addDoc(collection(db, 'billings'), billingData);

        // Optional: also send a notification so the resident is alerted
        await addDoc(collection(db, 'notifications'), {
          recipientUserId: sendBillResident.id,
          type: 'billing',
          subject: 'New Billing',
          message: `A new billing of ${formatCurrency(
            billingData.amount
          )} has been posted for ${billingData.billingCycle}. Due date: ${formatDate(
            billingData.dueDate
          )}.`,
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

  const getNextMonthDateString = (dateStr: string): string => {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) return dateStr;
    const next = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
    return next.toISOString().split('T')[0];
  };


  const openProofModalForBilling = useCallback((billing: Billing) => {
    setProofBilling(billing);
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
            const nextDateStr = getNextMonthDateString(proofBilling.dueDate);
            // Update both current billing's dueDate (so UI shows next cycle)
            // and keep nextBillingDate for reference if needed.
            updates.dueDate = nextDateStr;
            updates.nextBillingDate = nextDateStr;
          }
          // Also update resident's billing date (water/electricity) by +1 month
          if (proofBilling.residentId && proofBilling.dueDate && proofBilling.billingType) {
            const nextDateStr = getNextMonthDateString(proofBilling.dueDate);
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
                }" amounting to ${formatCurrency(
                  proofBilling.amount
                )} has been approved.`
              : `Your proof of payment for ${billingTypeLabel.toLowerCase()} billing "${
                  proofBilling.billingCycle
                }" amounting to ${formatCurrency(
                  proofBilling.amount
                )} has been rejected. Please contact the admin if you have questions.`;

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
        await fetchBillings();
        alert(action === 'approve' ? 'Proof approved and billing marked as paid.' : 'Proof rejected.');
      } catch (error) {
        console.error('Error verifying proof:', error);
        alert('Failed to update billing proof status.');
      } finally {
        setLoading(false);
      }
    },
    [db, proofBilling, fetchBillings]
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
      case 'paid': return '#4CAF50';
      case 'pending': return '#FFA500';
      case 'overdue': return '#1e40af';
      case 'partial': return '#2196F3';
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
              : 'Billing & Payment'
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

                      <div className="grid grid-cols-2 gap-6">
                        <div className="mb-6">
                          <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                            Amount *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            placeholder="0.00"
                            required
                            className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                          />
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
                            setFormData({ residentId: '', billingCycle: '', dueDate: '', amount: '', description: '' });
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
                        <span className="text-[11px] text-yellow-800">
                          Use "Send Bill (₱)" in the Actions column to notify residents about their dues.
                        </span>
                      </div>
                    )}
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Date</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Resident</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Billing Cycle</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Due Date</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Amount</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Paid</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Balance</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Status</th>
                          <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((billing) => (
                          <tr
                            key={billing.id}
                            className={`last:border-b-0 border-b border-gray-100 ${
                              billing.status === 'overdue' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                              {formatDate(billing.createdAt?.toDate ? billing.createdAt.toDate().toISOString() : '')}
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{billing.residentEmail}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{billing.billingCycle}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{formatDate(billing.dueDate)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{formatCurrency(billing.amount)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{formatCurrency(billing.totalPaid || 0)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">{formatCurrency(billing.balance || billing.amount)}</td>
                            <td className="px-4 py-4 border-b border-gray-100 align-middle">
                              <span
                                className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide text-white inline-block"
                                style={{ backgroundColor: getStatusColor(billing.status) }}
                              >
                                {billing.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-4 border-b border-gray-100 align-middle">
                              <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                  className="bg-green-500 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-[#45a049]"
                                  onClick={() => {
                                    setSelectedBilling(billing);
                                    setShowPaymentForm(true);
                                  }}
                                >
                                  Record Payment
                                </button>
                                <button
                                  className="bg-blue-600 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-blue-700"
                                  onClick={() => openSendBillFormForBilling(billing)}
                                >
                                  Send Bill (₱)
                                </button>
                                {billing.userProofStatus === 'pending' && (
                                  <button
                                    className="bg-yellow-500 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-yellow-600"
                                    onClick={() => openProofModalForBilling(billing)}
                                  >
                                    Review Proof
                                  </button>
                                )}
                              </div>
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
                            const billingDate = getDateFromResident(resident, !!isWaterView);
                            const isDue =
                              !!billingDate &&
                              billingDate.setHours(0, 0, 0, 0) <=
                                new Date().setHours(0, 0, 0, 0);
                            const billingDateIsFuture =
                              !!billingDate &&
                              billingDate.setHours(0, 0, 0, 0) >
                                new Date().setHours(0, 0, 0, 0);
                            const hasUnsettledBilling = billings.some(
                              (b) =>
                                b.residentId === resident.id &&
                                b.billingType === (isWaterView ? 'water' : 'electricity') &&
                                b.status !== 'paid'
                            );
                            // Allow sending if: billing date is in future (updated) OR no unsettled billings
                            const canSendBilling = billingDateIsFuture || !hasUnsettledBilling;
                            return (
                              <div
                                key={resident.id}
                                className={`border border-gray-200 rounded-lg p-4 bg-white shadow-sm ${
                                  isDue ? 'border-red-300 bg-red-50/50' : ''
                                }`}
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
                                  {isDue && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 uppercase tracking-wide">
                                      Due
                                    </span>
                                  )}
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
                                <button
                                  className={`w-full border-none px-3 py-2 rounded text-xs font-medium cursor-pointer transition-all ${
                                    !canSendBilling
                                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                      : 'bg-blue-600 text-white hover:bg-blue-700'
                                  }`}
                                  disabled={!canSendBilling}
                                  onClick={() => {
                                    if (!canSendBilling) return;
                                    const latestBilling =
                                      latestBillingByResidentId.get(resident.id);
                                    if (latestBilling) {
                                      openSendBillFormForBilling(latestBilling);
                                    } else {
                                      openSendBillFormForResident(resident);
                                    }
                                  }}
                                >
                                  {!canSendBilling ? 'Already billed' : 'Send Bill (₱)'}
                                </button>
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
                                <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedResidents.map((resident) => {
                                const billingDate = getDateFromResident(
                                  resident,
                                  !!isWaterView
                                );
                                const isDue =
                                  !!billingDate &&
                                  billingDate.setHours(0, 0, 0, 0) <=
                                    new Date().setHours(0, 0, 0, 0);
                                const billingDateIsFuture =
                                  !!billingDate &&
                                  billingDate.setHours(0, 0, 0, 0) >
                                    new Date().setHours(0, 0, 0, 0);
                                const hasUnsettledBilling = billings.some(
                                  (b) =>
                                    b.residentId === resident.id &&
                                    b.billingType === (isWaterView ? 'water' : 'electricity') &&
                                    b.status !== 'paid'
                                );
                                // Allow sending if: billing date is in future (updated) OR no unsettled billings
                                const canSendBilling = billingDateIsFuture || !hasUnsettledBilling;
                                return (
                                  <tr
                                    key={resident.id}
                                    className={`last:border-b-0 border-b border-gray-100 ${
                                      isDue
                                        ? 'bg-red-50 hover:bg-red-100'
                                        : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <td className="px-4 py-4 border-b border-gray-100 text-gray-600 align-middle">
                                      <div className="flex items-center gap-2">
                                        <span>{resident.fullName || 'N/A'}</span>
                                        {isDue && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 uppercase tracking-wide">
                                            Due
                                          </span>
                                        )}
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
                                    <td className="px-4 py-4 border-b border-gray-100 align-middle">
                                      <button
                                        className={`border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all ${
                                          !canSendBilling
                                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                        disabled={!canSendBilling}
                                        onClick={() => {
                                          if (!canSendBilling) return;
                                          const latestBilling =
                                            latestBillingByResidentId.get(
                                              resident.id
                                            );
                                          if (latestBilling) {
                                            openSendBillFormForBilling(
                                              latestBilling
                                            );
                                          } else {
                                            openSendBillFormForResident(
                                              resident
                                            );
                                          }
                                        }}
                                      >
                                        {!canSendBilling ? 'Already billed' : 'Send Bill (₱)'}
                                      </button>
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
                        Proof of Payments
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
                                  <span className="font-medium">Amount:</span>{' '}
                                  {formatCurrency(billing.amount)}
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
                                Amount
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
                                  {formatCurrency(billing.amount)}
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

        {showPaymentForm && selectedBilling && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={() => setShowPaymentForm(false)}>
            <div className="bg-gray-900 rounded-2xl w-full max-w-[600px] p-4 md:p-6 lg:p-8 shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="m-0 text-white text-xl font-normal">Record Payment</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-300 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-800 hover:text-white"
                  onClick={() => setShowPaymentForm(false)}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSubmitPayment}>
                <div className="mb-6">
                  <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                    Billing: {selectedBilling.billingCycle} - {formatCurrency(selectedBilling.amount)}
                  </label>
                  <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                    Balance: {formatCurrency(selectedBilling.balance || selectedBilling.amount)}
                  </label>
                </div>
                <div className="mb-6">
                  <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                    Payment Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    placeholder="0.00"
                    max={selectedBilling.balance || selectedBilling.amount}
                    required
                    className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="mb-6">
                    <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                      Payment Date *
                    </label>
                    <input
                      type="date"
                      value={paymentData.paymentDate}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                      required
                      className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                    />
                  </div>
                  <div className="mb-6">
                    <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                      Payment Method *
                    </label>
                    <select
                      value={paymentData.paymentMethod}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                      required
                      className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="check">Check</option>
                      <option value="online">Online Payment</option>
                    </select>
                  </div>
                </div>
                <div className="mb-6">
                  <label className="block mb-2 font-normal text-gray-300 text-xs uppercase tracking-wide">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={paymentData.referenceNumber}
                    onChange={(e) => setPaymentData({ ...paymentData, referenceNumber: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-4 py-3 border border-gray-600 rounded-lg text-base font-inherit transition-all bg-gray-950 text-white box-border focus:outline-none focus:border-primary focus:bg-gray-900 focus:shadow-[0_0_0_3px_rgba(30,64,175,0.3)]"
                  />
                </div>
                <div className="flex gap-3 mt-8 pt-6 border-t border-gray-600">
                  <button 
                    type="submit" 
                    className="bg-primary text-white border-none px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all shadow-md shadow-primary/20 hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    disabled={loading}
                  >
                    {loading ? 'Recording...' : 'Record Payment'}
                  </button>
                  <button
                    type="button"
                    className="bg-gray-800 text-white border border-gray-600 px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:border-gray-500 hover:bg-gray-700"
                    onClick={() => {
                      setShowPaymentForm(false);
                      setSelectedBilling(null);
                      setPaymentData({ amount: '', paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'cash', referenceNumber: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showProofModal && proofBilling && (
          <div
            className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5"
            onClick={() => {
              setShowProofModal(false);
              setProofBilling(null);
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
                  <span className="font-semibold">Amount:</span> {formatCurrency(proofBilling.amount)}
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
                      {loading ? 'Updating...' : 'Approve & Mark Paid (+1 month)'}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="mb-4">
                    <label className="block mb-2 font-normal text-gray-700 text-xs uppercase tracking-wide">
                      Amount (₱) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sendBillData.amount}
                      onChange={(e) =>
                        setSendBillData((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      placeholder="0.00"
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
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

                <div className="mb-6">
                  <label className="block mb-2 font-normal text-gray-700 text-xs uppercase tracking-wide">
                    Billing Type *
                  </label>
                  <select
                    value={sendBillData.billingType}
                    onChange={(e) =>
                      setSendBillData((prev) => ({ ...prev, billingType: e.target.value }))
                    }
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                  >
                    <option value="">Select type</option>
                    <option value="water">Water</option>
                    <option value="electricity">Electricity</option>
                  </select>
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
