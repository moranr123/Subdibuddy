import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, ActivityIndicator, Modal, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, Timestamp, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { getAuthService, db, storage } from '../firebase/config';

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

export default function Billing() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;

  const [user, setUser] = useState<any>(null);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofModalVisible, setProofModalVisible] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<Billing | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);

  const toggleSidebar = () => {
    const toValue = sidebarOpen ? -Dimensions.get('window').width : 0;
    Animated.spring(sidebarAnimation, {
      toValue,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    setSidebarOpen(!sidebarOpen);
  };

  // Auth listener
  useEffect(() => {
    const authInstance = getAuthService();
    if (!authInstance) return;
    const unsub = onAuthStateChanged(authInstance, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  // Listen to user's billings
  useEffect(() => {
    if (!db || !user?.uid) return;
    setLoading(true);
    let q = query(
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
          const totalPaid = billing.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
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
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#16a34a';
      case 'partial':
        return '#2563eb';
      case 'overdue':
        return '#dc2626';
      default:
        return '#f59e0b';
    }
  };

  const renderStatus = (billing: Billing) => (
    <View style={[styles.statusPill, { backgroundColor: getStatusColor(billing.status) }]}>
      <Text style={styles.statusText}>{billing.status.toUpperCase()}</Text>
    </View>
  );

  const openProofModal = useCallback((billing: Billing) => {
    setSelectedBilling(billing);
    setProofImage(null);
    setProofModalVisible(true);
  }, []);

  const pickImage = useCallback(async (fromCamera: boolean) => {
    const perms = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perms.granted) {
      Alert.alert('Permission needed', 'Please allow access to proceed.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.7 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProofImage(result.assets[0].uri);
    }
  }, []);

  const handleSubmitProof = useCallback(async () => {
    if (!db || !selectedBilling) return;
    if (!proofImage) {
      Alert.alert('Proof required', 'Please attach an image of your payment proof.');
      return;
    }
    try {
      // Upload image to Firebase Storage first
      let downloadUrl: string | null = null;
      if (storage) {
        const response = await fetch(proofImage);
        const blob = await response.blob();
        const filePath = `billing-proofs/${user?.uid || 'anonymous'}/${selectedBilling.id}-${Date.now()}.jpg`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, blob);
        downloadUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, 'billings', selectedBilling.id), {
        userProofDetails: null,
        userProofImageUrl: downloadUrl || proofImage || null,
        userProofStatus: 'pending',
        userProofSubmittedAt: Timestamp.now(),
      });

      // Notify admins that a new proof of payment was submitted
      try {
        const billingTypeLabel =
          selectedBilling.billingType === 'water'
            ? 'Water'
            : selectedBilling.billingType === 'electricity'
            ? 'Electricity'
            : 'Billing';
        await addDoc(collection(db, 'notifications'), {
          type: 'billing_proof',
          billingId: selectedBilling.id,
          userId: user?.uid || null,
          userEmail: user?.email || '',
          subject: `New Proof of Payment – ${billingTypeLabel}`,
          message: `A new proof of payment was submitted for ${billingTypeLabel.toLowerCase()} billing "${
            selectedBilling.billingCycle || 'Billing'
          }" amounting to ${formatCurrency(selectedBilling.amount)}.`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });
      } catch (notifyErr) {
        console.error('Error creating admin notification for billing proof:', notifyErr);
      }
      Alert.alert('Submitted', 'Your proof of payment has been sent for verification.');
      setProofModalVisible(false);
      setSelectedBilling(null);
      setProofImage(null);
    } catch (error) {
      console.error('Error submitting proof of payment:', error);
      Alert.alert('Error', 'Failed to submit proof. Please try again.');
    }
  }, [db, selectedBilling, proofImage]);

  return (
    <View style={styles.container}>
      <Header onMenuPress={toggleSidebar} />
      <Sidebar isOpen={sidebarOpen} onClose={toggleSidebar} animation={sidebarAnimation} />
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.section}>
          <Text style={styles.title}>Billings & Payment</Text>
          <Text style={styles.description}>Your bills and payment history.</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#111827" />
            <Text style={styles.loadingText}>Loading your billings...</Text>
          </View>
        ) : billings.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No billings yet.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {billings.map((billing) => (
              <View
                key={billing.id}
                style={[
                  styles.card,
                  billing.status === 'overdue' ? styles.cardOverdue : null,
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.cardTitle}>{billing.billingCycle || 'Billing'}</Text>
                    {billing.billingType && (
                      <View
                        style={[
                          styles.typePill,
                          billing.billingType === 'water'
                            ? styles.typePillWater
                            : styles.typePillElectricity,
                        ]}
                      >
                        <Text style={styles.typePillText}>
                          {billing.billingType === 'water' ? 'Water' : 'Electricity'}
                        </Text>
                      </View>
                    )}
                  </View>
                  {renderStatus(billing)}
                </View>
                <Text style={styles.amount}>{formatCurrency(billing.amount)}</Text>
                <Text style={styles.rowText}>Due: {formatDate(billing.dueDate)}</Text>
                <Text style={styles.rowText}>Description: {billing.description || '—'}</Text>
                <Text style={styles.rowText}>
                  Paid: {formatCurrency(billing.totalPaid || 0)} | Balance:{' '}
                  {formatCurrency(billing.balance || billing.amount)}
                </Text>

                {billing.userProofStatus === 'pending' ? (
                  <Text style={[styles.rowText, { marginTop: 6, color: '#2563eb' }]}>
                    Proof submitted. Waiting for admin verification.
                  </Text>
                ) : billing.userProofStatus === 'verified' ? (
                  <Text style={[styles.rowText, { marginTop: 6, color: '#16a34a' }]}>
                    Proof verified by admin.
                  </Text>
                ) : billing.userProofStatus === 'rejected' ? (
                  <Text style={[styles.rowText, { marginTop: 6, color: '#dc2626' }]}>
                    Proof rejected. Please contact admin.
                  </Text>
                ) : billing.status !== 'paid' ? (
                  <TouchableOpacity
                    style={styles.proofButton}
                    onPress={() => openProofModal(billing)}
                  >
                    <Text style={styles.proofButtonText}>Send Proof of Payment</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={proofModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setProofModalVisible(false);
          setSelectedBilling(null);
          setProofImage(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Proof of Payment</Text>
              {selectedBilling && (
                <Text style={styles.modalSubtitle}>
                  {selectedBilling.billingCycle || 'Billing'} · {formatCurrency(selectedBilling.amount)}
                </Text>
              )}
            </View>

            <View style={styles.modalBody}>
              <View style={styles.proofActionsRow}>
                <TouchableOpacity style={[styles.proofActionButton, styles.proofActionPrimary]} onPress={() => pickImage(true)}>
                  <Text style={styles.proofActionPrimaryText}>Use Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.proofActionButton} onPress={() => pickImage(false)}>
                  <Text style={styles.proofActionText}>Gallery</Text>
                </TouchableOpacity>
              </View>
              {proofImage ? (
                <Image source={{ uri: proofImage }} style={styles.proofPreview} />
              ) : (
                <Text style={styles.modalHint}>Attach a clear photo or screenshot of your payment.</Text>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setProofModalVisible(false);
                  setSelectedBilling(null);
                  setProofImage(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmit]}
                onPress={handleSubmitProof}
              >
                <Text style={styles.modalSubmitText}>Submit Proof</Text>
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
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
  },
  loadingBox: {
    marginHorizontal: 16,
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
    marginHorizontal: 16,
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
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 16,
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
  cardOverdue: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
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
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typePillWater: {
    backgroundColor: '#dbeafe',
  },
  typePillElectricity: {
    backgroundColor: '#fef3c7',
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
  },
  proofButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  proofButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
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
  modalCancel: {
    backgroundColor: '#f3f4f6',
  },
  modalSubmit: {
    backgroundColor: '#2563eb',
  },
  modalCancelText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '500',
  },
  modalSubmitText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  proofActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  proofActionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  proofActionPrimary: {
    backgroundColor: '#e0ecff',
    borderColor: '#bfdbfe',
  },
  proofActionText: {
    color: '#1f2937',
    fontSize: 13,
    fontWeight: '600',
  },
  proofActionPrimaryText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
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
