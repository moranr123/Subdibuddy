import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy, addDoc, updateDoc, doc, where, Timestamp } from 'firebase/firestore';
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
}

interface Billing {
  id: string;
  residentId: string;
  residentEmail: string;
  billingCycle: string;
  dueDate: string;
  amount: number;
  description: string;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  payments?: Payment[];
  totalPaid?: number;
  balance?: number;
  createdAt: any;
  updatedAt?: any;
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
  const [formData, setFormData] = useState({
    residentId: '',
    billingCycle: '',
    dueDate: '',
    amount: '',
    description: '',
  });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    referenceNumber: '',
  });
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

  const fetchResidents = useCallback(async () => {
    if (!db) return;
    
    try {
      setLoadingResidents(true);
      const querySnapshot = await getDocs(collection(db, 'users'));
      const residentsData: Resident[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out superadmin accounts - only include residents
        if (data.role === 'superadmin') {
          return;
        }
        // Filter out archived residents - they should not appear in billing assignments
        if (data.status === 'archived') {
          return;
        }
        residentsData.push({
          id: doc.id,
          email: data.email,
          fullName: data.fullName,
        } as Resident);
      });
      
      // Sort by email
      residentsData.sort((a, b) => a.email.localeCompare(b.email));
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
        fetchBillings();
        fetchResidents();
      } else {
        console.error('Firestore db is not available');
        alert('Database connection error. Please refresh the page.');
      }
    }
  }, [user, db, fetchBillings, fetchResidents]);

  const handleSubmitBilling = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.residentId || !formData.billingCycle || !formData.dueDate || !formData.amount || !formData.description) {
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

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

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
      <div className="min-h-screen bg-white w-full">
        <Header title="Billing & Payment" />

        <main className="w-full max-w-full m-0 p-10 box-border">
          <div className="flex flex-col gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-8 border border-gray-100 shadow-sm">
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
                <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 shadow-lg mb-8">
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
                <div className="overflow-x-auto w-full">
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
                      {billings.map((billing) => (
                        <tr key={billing.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
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
                            <button
                              className="bg-green-500 text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-[#45a049]"
                              onClick={() => {
                                setSelectedBilling(billing);
                                setShowPaymentForm(true);
                              }}
                            >
                              Record Payment
                            </button>
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

        {showPaymentForm && selectedBilling && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={() => setShowPaymentForm(false)}>
            <div className="bg-gray-900 rounded-2xl w-full max-w-[600px] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </Layout>
  );
}

export default memo(BillingPayment);
