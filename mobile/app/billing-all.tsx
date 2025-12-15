import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';
import { FontAwesome5 } from '@expo/vector-icons';

interface Payment {
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber?: string;
}

interface Billing {
  id: string;
  billingCycle: string;
  dueDate: string;
  amount: number;
  description: string;
  billingType?: 'water' | 'electricity';
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  payments?: Payment[];
  totalPaid?: number;
  balance?: number;
  createdAt?: any;
  userProofDetails?: string;
  userProofImageUrl?: string;
  userProofStatus?: 'pending' | 'verified' | 'rejected';
  userProofSubmittedAt?: any;
}

type DateFilter = 'all' | 'thisMonth' | 'last30';

export default function BillingAll() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<any>(null);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [viewProofModalVisible, setViewProofModalVisible] = useState(false);
  const [viewProofBilling, setViewProofBilling] = useState<Billing | null>(null);

  useEffect(() => {
    const authInstance = getAuthService();
    if (!authInstance) return;
    const unsub = onAuthStateChanged(authInstance, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db || !user?.uid) return;
    setLoading(true);
    const q = query(
      collection(db, 'billings'),
      where('residentId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Billing[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const billing = {
            id: doc.id,
            ...data,
          } as Billing;
          const totalPaid =
            billing.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
          billing.totalPaid = totalPaid;
          billing.balance = (billing.amount || 0) - totalPaid;
          list.push(billing);
        });
        setBillings(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading billings:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [db, user]);

  const formatDate = (value: any) => {
    if (!value) return 'N/A';
    try {
      let date: Date;
      if (value.toDate && typeof value.toDate === 'function') {
        date = value.toDate();
      } else if (typeof value.seconds === 'number') {
        date = new Date(value.seconds * 1000);
      } else if (value instanceof Date) {
        date = value;
      } else {
        date = new Date(value);
      }
      if (Number.isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount || 0);

  const passesDateFilter = (billing: Billing) => {
    if (dateFilter === 'all') return true;
    const raw = (billing as any).createdAt || billing.dueDate;
    if (!raw) return false;
    let date: Date | null = null;
    try {
      if (raw.toDate && typeof raw.toDate === 'function') {
        date = raw.toDate();
      } else if (typeof raw.seconds === 'number') {
        date = new Date(raw.seconds * 1000);
      } else {
        date = new Date(raw);
      }
    } catch {
      date = null;
    }
    if (!date || Number.isNaN(date.getTime())) return false;

    const today = new Date();
    if (dateFilter === 'last30') {
      const past30 = new Date();
      past30.setDate(today.getDate() - 30);
      return date >= past30 && date <= today;
    }
    if (dateFilter === 'thisMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return date >= start && date <= end;
    }
    return true;
  };

  const filteredBillings = billings.filter(passesDateFilter);

  const openViewProofModal = (billing: Billing) => {
    setViewProofBilling(billing);
    setViewProofModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Billings & Proofs</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <View style={styles.filterRow}>
            <Text style={styles.sectionTitle}>Billings</Text>
            <View style={styles.filterChipRow}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  dateFilter === 'all' && styles.filterChipActive,
                ]}
                onPress={() => setDateFilter('all')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    dateFilter === 'all' && styles.filterChipTextActive,
                  ]}
                >
                  All dates
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  dateFilter === 'thisMonth' && styles.filterChipActive,
                ]}
                onPress={() => setDateFilter('thisMonth')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    dateFilter === 'thisMonth' && styles.filterChipTextActive,
                  ]}
                >
                  This month
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  dateFilter === 'last30' && styles.filterChipActive,
                ]}
                onPress={() => setDateFilter('last30')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    dateFilter === 'last30' && styles.filterChipTextActive,
                  ]}
                >
                  Last 30 days
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#111827" />
              <Text style={styles.loadingText}>Loading billings...</Text>
            </View>
          ) : filteredBillings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No billings found for this date range.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredBillings.map((billing) => (
                <View key={billing.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>
                        {billing.billingCycle || 'Billing'}
                      </Text>
                      <Text style={styles.cardSubTitle}>
                        {billing.billingType === 'water'
                          ? 'Water'
                          : billing.billingType === 'electricity'
                          ? 'Electricity'
                          : '—'}
                      </Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      billing.status === 'paid' && styles.statusBadgePaid
                    ]}>
                      <Text style={styles.statusBadgeText}>
                        {(billing.status || 'pending').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.amount}>{formatCurrency(billing.amount)}</Text>
                  <Text style={styles.rowText}>
                    Due: {formatDate(billing.dueDate)}
                  </Text>
                  <Text style={styles.rowText}>
                    Paid: {formatCurrency(billing.totalPaid || 0)} | Balance:{' '}
                    {formatCurrency(
                      typeof billing.balance === 'number'
                        ? billing.balance
                        : (billing.amount || 0) - (billing.totalPaid || 0)
                    )}
                  </Text>
                  <Text style={styles.rowText}>
                    Description: {billing.description || '—'}
                  </Text>
                  {billing.userProofStatus && (
                    <Text style={styles.rowText}>
                      Proof status: {billing.userProofStatus.toUpperCase()}
                    </Text>
                  )}
                  {(billing.userProofImageUrl || billing.userProofDetails) && (
                    <TouchableOpacity
                      style={styles.viewProofButton}
                      onPress={() => openViewProofModal(billing)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewProofButtonText}>View receipt / proof</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={viewProofModalVisible && !!viewProofBilling}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setViewProofModalVisible(false);
          setViewProofBilling(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Billing Receipt / Proof</Text>
              {viewProofBilling && (
                <Text style={styles.modalSubtitle}>
                  {viewProofBilling.billingCycle || 'Billing'} ·{' '}
                  {formatCurrency(viewProofBilling.amount)}
                </Text>
              )}
            </View>

            <View style={styles.modalBody}>
              {viewProofBilling?.userProofImageUrl ? (
                <Image
                  source={{ uri: viewProofBilling.userProofImageUrl }}
                  style={styles.proofPreview}
                />
              ) : viewProofBilling?.userProofDetails ? (
                <Text style={styles.modalHint}>{viewProofBilling.userProofDetails}</Text>
              ) : (
                <Text style={styles.modalHint}>
                  No proof image or details available.
                </Text>
              )}

              {viewProofBilling && (
                <Text style={[styles.rowText, { marginTop: 10 }]}>
                  Status:{' '}
                  {viewProofBilling.userProofStatus
                    ? viewProofBilling.userProofStatus.toUpperCase()
                    : 'N/A'}
                </Text>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmit]}
                onPress={() => {
                  setViewProofModalVisible(false);
                  setViewProofBilling(null);
                }}
              >
                <Text style={styles.modalSubmitText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  section: {
    padding: 20,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  filterChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4b5563',
  },
  filterChipTextActive: {
    color: '#f9fafb',
  },
  loadingBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#4b5563',
    fontSize: 14,
  },
  emptyBox: {
    marginTop: 16,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },
  list: {
    marginTop: 8,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  cardSubTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  statusBadgePaid: {
    backgroundColor: '#10b981',
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  amount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  rowText: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 2,
  },
  viewProofButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  viewProofButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalHeader: {
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 6,
  },
  modalBody: {
    marginTop: 4,
    gap: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 10,
  },
  modalButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalSubmit: {
    backgroundColor: '#2563eb',
  },
  modalSubmitText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  proofPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    resizeMode: 'cover',
    backgroundColor: '#f8fafc',
  },
  modalHint: {
    color: '#6b7280',
    fontSize: 13,
  },
});


