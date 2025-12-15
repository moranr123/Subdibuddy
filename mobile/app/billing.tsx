import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, ActivityIndicator, Modal, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, Timestamp, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { getAuthService, db, storage } from '../firebase/config';
import { useNotifications } from '../hooks/useNotifications';
import { useTheme } from '../contexts/ThemeContext';

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
  const { theme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;

  const { unreadCount } = useNotifications();

  const [user, setUser] = useState<any>(null);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofModalVisible, setProofModalVisible] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<Billing | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [viewProofModalVisible, setViewProofModalVisible] = useState(false);
  const [viewProofBilling, setViewProofBilling] = useState<Billing | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);

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

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
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
      color: theme.text,
      marginBottom: 6,
    },
    description: {
      fontSize: 15,
      color: theme.textSecondary,
    },
    loadingBox: {
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 12,
      backgroundColor: theme.cardBackground,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    emptyBox: {
      marginHorizontal: 16,
      padding: 20,
      borderRadius: 12,
      backgroundColor: theme.cardBackground,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: 'center',
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    list: {
      paddingHorizontal: 16,
      gap: 12,
      paddingBottom: 16,
    },
    card: {
      backgroundColor: theme.cardBackground,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    },
    cardOverdue: {
      borderColor: '#fecaca',
      backgroundColor: theme.cardBackground,
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
      color: theme.text,
    },
    amount: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    rowText: {
      fontSize: 13,
      color: theme.textSecondary,
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
      color: theme.text,
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
      backgroundColor: theme.cardBackground,
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
      color: theme.text,
    },
    modalSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
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
      backgroundColor: theme.border,
    },
    modalSubmit: {
      backgroundColor: '#2563eb',
    },
    modalCancelText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '500',
    },
    modalSubmitText: {
      color: 'white',
      fontSize: 13,
      fontWeight: '600',
    },
    modalButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      alignItems: 'center',
    },
    proofActionPrimary: {
      backgroundColor: '#e0ecff',
      borderColor: '#bfdbfe',
    },
    proofActionText: {
      color: theme.text,
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
      borderColor: theme.border,
      resizeMode: 'cover',
      backgroundColor: theme.inputBackground,
    },
    modalHint: {
      color: theme.textSecondary,
      fontSize: 13,
    },
    riskChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    riskChipText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.text,
    },
    riskChipOverdue: {
      backgroundColor: '#fee2e2',
    },
    riskChipSoon: {
      backgroundColor: '#fef3c7',
    },
    riskChipSafe: {
      backgroundColor: '#dcfce7',
    },
    summaryCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 16,
      borderRadius: 14,
      backgroundColor: theme.headerBackground,
      borderWidth: 1,
      borderColor: theme.border,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    summaryMain: {
      flex: 1,
    },
    summaryLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      marginBottom: 2,
    },
    summaryValue: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700',
    },
    summaryBadgeGroup: {
      marginLeft: 8,
      alignItems: 'flex-end',
    },
    summaryPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    summaryPillOverdue: {
      backgroundColor: '#fef3c7',
    },
    summaryPillLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: '#92400e',
    },
    summaryMetaRow: {
      marginTop: 10,
    },
    summaryMetaText: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    viewProofButton: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
    },
    viewProofButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
    },
    seeAllButton: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: theme.cardBackground,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    },
    seeAllButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#2563eb',
    },
  }), [theme]);

  const renderStatus = (billing: Billing) => (
    <View style={[dynamicStyles.statusPill, { backgroundColor: getStatusColor(billing.status) }]}>
      <Text style={dynamicStyles.statusText}>{billing.status.toUpperCase()}</Text>
    </View>
  );

  const getRiskChip = (billing: Billing) => {
    if (billing.status === 'paid') {
      return (
        <View style={[dynamicStyles.riskChip, dynamicStyles.riskChipSafe]}>
          <Text style={dynamicStyles.riskChipText}>Paid</Text>
        </View>
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dueDate: Date | null = null;
    try {
      const raw = (billing as any).dueDate;
      if (raw?.toDate && typeof raw.toDate === 'function') {
        dueDate = raw.toDate();
      } else {
        dueDate = new Date(billing.dueDate);
      }
      if (Number.isNaN(dueDate.getTime())) {
        dueDate = null;
      } else {
        dueDate.setHours(0, 0, 0, 0);
      }
    } catch {
      dueDate = null;
    }

    if (!dueDate) return null;

    if (billing.status === 'overdue' || dueDate < today) {
      return (
        <View style={[styles.riskChip, styles.riskChipOverdue]}>
          <Text style={styles.riskChipText}>Overdue</Text>
        </View>
      );
    }

    const diffMs = dueDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 7) {
      return (
        <View style={[styles.riskChip, styles.riskChipSoon]}>
          <Text style={styles.riskChipText}>Due soon</Text>
        </View>
      );
    }

    return null;
  };

  const summary = (() => {
    if (!billings || billings.length === 0) {
      return {
        totalOutstanding: 0,
        overdueCount: 0,
        nextDueDate: null as Date | null,
      };
    }

    let totalOutstanding = 0;
    let overdueCount = 0;
    let nextDueDate: Date | null = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    billings.forEach((b) => {
      const isPaid = b.status === 'paid';
      const balance =
        typeof b.balance === 'number'
          ? b.balance
          : (b.amount || 0) - (b.totalPaid || 0);
      if (!isPaid && balance > 0) {
        totalOutstanding += balance;
      }

      let dueDate: Date | null = null;
      try {
        const raw = (b as any).dueDate;
        if (raw?.toDate && typeof raw.toDate === 'function') {
          dueDate = raw.toDate();
        } else {
          dueDate = new Date(b.dueDate);
        }
        if (Number.isNaN(dueDate.getTime())) {
          dueDate = null;
        } else {
          dueDate.setHours(0, 0, 0, 0);
        }
      } catch {
        dueDate = null;
      }

      if (dueDate && !isPaid && dueDate < today) {
        overdueCount += 1;
      }

      if (dueDate && !isPaid && dueDate >= today) {
        if (!nextDueDate || dueDate.getTime() < nextDueDate.getTime()) {
          nextDueDate = dueDate;
        }
      }
    });

    return { totalOutstanding, overdueCount, nextDueDate };
  })();

  const openProofModal = useCallback((billing: Billing) => {
    setSelectedBilling(billing);
    setProofImage(null);
    setProofModalVisible(true);
  }, []);

  const showImageSourcePicker = useCallback(() => {
    Alert.alert(
      'Select Image Source',
      'Choose an option',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Camera', onPress: () => pickImage('camera') },
        { text: 'Gallery', onPress: () => pickImage('gallery') },
      ]
    );
  }, []);

  const pickImage = useCallback(async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please allow camera access to proceed.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          setProofImage(result.assets[0].uri);
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please allow gallery access to proceed.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.7 });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          setProofImage(result.assets[0].uri);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, []);

  const handleSubmitProof = useCallback(async () => {
    if (!db || !selectedBilling) return;
    if (!proofImage) {
      Alert.alert('Proof required', 'Please attach an image of your payment proof.');
      return;
    }
    setSubmittingProof(true);
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
    } finally {
      setSubmittingProof(false);
    }
  }, [db, selectedBilling, proofImage, user]);

  const openViewProofModal = useCallback((billing: Billing) => {
    setViewProofBilling(billing);
    setViewProofModalVisible(true);
  }, []);

  const unpaidBillings = billings.filter((billing) => {
    const balance =
      typeof billing.balance === 'number'
        ? billing.balance
        : (billing.amount || 0) - (billing.totalPaid || 0);
    return billing.status !== 'paid' && balance > 0;
  });

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
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
      color: theme.text,
      marginBottom: 6,
    },
    description: {
      fontSize: 15,
      color: theme.textSecondary,
    },
    loadingBox: {
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 12,
      backgroundColor: theme.cardBackground,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    emptyBox: {
      marginHorizontal: 16,
      padding: 20,
      borderRadius: 12,
      backgroundColor: theme.cardBackground,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: 'center',
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    list: {
      paddingHorizontal: 16,
      gap: 12,
      paddingBottom: 16,
    },
    card: {
      backgroundColor: theme.cardBackground,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    },
    cardOverdue: {
      borderColor: '#fecaca',
      backgroundColor: theme.cardBackground,
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
      color: theme.text,
    },
    amount: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    rowText: {
      fontSize: 13,
      color: theme.textSecondary,
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
      color: theme.text,
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
      backgroundColor: theme.cardBackground,
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
      color: theme.text,
    },
    modalSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
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
      backgroundColor: theme.border,
    },
    modalSubmit: {
      backgroundColor: '#2563eb',
    },
    modalCancelText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '500',
    },
    modalSubmitText: {
      color: 'white',
      fontSize: 13,
      fontWeight: '600',
    },
    modalButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      alignItems: 'center',
    },
    proofActionPrimary: {
      backgroundColor: '#e0ecff',
      borderColor: '#bfdbfe',
    },
    proofActionText: {
      color: theme.text,
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
      borderColor: theme.border,
      resizeMode: 'cover',
      backgroundColor: theme.inputBackground,
    },
    modalHint: {
      color: theme.textSecondary,
      fontSize: 13,
    },
    riskChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    riskChipText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.text,
    },
    riskChipOverdue: {
      backgroundColor: '#fee2e2',
    },
    riskChipSoon: {
      backgroundColor: '#fef3c7',
    },
    riskChipSafe: {
      backgroundColor: '#dcfce7',
    },
    summaryCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 16,
      borderRadius: 14,
      backgroundColor: theme.headerBackground,
      borderWidth: 1,
      borderColor: theme.border,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    summaryMain: {
      flex: 1,
    },
    summaryLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      marginBottom: 2,
    },
    summaryValue: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700',
    },
    summaryBadgeGroup: {
      marginLeft: 8,
      alignItems: 'flex-end',
    },
    summaryPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    summaryPillOverdue: {
      backgroundColor: '#fef3c7',
    },
    summaryPillLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: '#92400e',
    },
    summaryMetaRow: {
      marginTop: 10,
    },
    summaryMetaText: {
      color: theme.textSecondary,
      fontSize: 12,
    },
    viewProofButton: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
    },
    viewProofButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
    },
    seeAllButton: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: theme.cardBackground,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    },
    seeAllButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#2563eb',
    },
  }), [theme]);

  return (
    <View style={dynamicStyles.container}>
      <Header
        onMenuPress={toggleSidebar}
        onNotificationPress={() => router.push('/notifications')}
        notificationCount={unreadCount}
      />
      <Sidebar isOpen={sidebarOpen} onClose={toggleSidebar} animation={sidebarAnimation} />
      <ScrollView style={dynamicStyles.content} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.title}>Billings & Payment</Text>
          <Text style={dynamicStyles.description}>Your bills and payment history.</Text>
        </View>

        {billings.length > 0 && (
          <View style={dynamicStyles.summaryCard}>
            <View style={dynamicStyles.summaryRow}>
              <View style={dynamicStyles.summaryMain}>
                <Text style={dynamicStyles.summaryLabel}>Total outstanding</Text>
                <Text style={dynamicStyles.summaryValue}>
                  {formatCurrency(summary.totalOutstanding)}
                </Text>
              </View>
              <View style={dynamicStyles.summaryBadgeGroup}>
                <View style={[dynamicStyles.summaryPill, dynamicStyles.summaryPillOverdue]}>
                  <Text style={dynamicStyles.summaryPillLabel}>
                    {summary.overdueCount} overdue
                  </Text>
                </View>
              </View>
            </View>
            <View style={dynamicStyles.summaryMetaRow}>
              <Text style={dynamicStyles.summaryMetaText}>
                Next due:{' '}
                {summary.nextDueDate
                  ? summary.nextDueDate.toLocaleDateString()
                  : 'No upcoming due'}
              </Text>
            </View>
          </View>
        )}

        {billings.length > 0 && (
          <TouchableOpacity
            style={dynamicStyles.seeAllButton}
            onPress={() => router.push('/billing-all')}
            activeOpacity={0.7}
          >
            <Text style={dynamicStyles.seeAllButtonText}>See all billings</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <View style={dynamicStyles.loadingBox}>
            <ActivityIndicator size="small" color={theme.text} />
            <Text style={dynamicStyles.loadingText}>Loading your billings...</Text>
          </View>
        ) : unpaidBillings.length === 0 ? (
          <View style={dynamicStyles.emptyBox}>
            <Text style={dynamicStyles.emptyText}>No outstanding billings.</Text>
          </View>
        ) : (
          <View style={dynamicStyles.list}>
            {unpaidBillings.slice(0, 3).map((billing) => (
              <View
                key={billing.id}
                style={[
                  dynamicStyles.card,
                  billing.status === 'overdue' ? dynamicStyles.cardOverdue : null,
                ]}
              >
                <View style={dynamicStyles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={dynamicStyles.cardTitle}>{billing.billingCycle || 'Billing'}</Text>
                    {billing.billingType && (
                      <View
                        style={[
                          dynamicStyles.typePill,
                          billing.billingType === 'water'
                            ? dynamicStyles.typePillWater
                            : dynamicStyles.typePillElectricity,
                        ]}
                      >
                        <Text style={dynamicStyles.typePillText}>
                          {billing.billingType === 'water' ? 'Water' : 'Electricity'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {renderStatus(billing)}
                    {getRiskChip(billing)}
                  </View>
                </View>
                <Text style={dynamicStyles.amount}>{formatCurrency(billing.amount)}</Text>
                <Text style={dynamicStyles.rowText}>Due: {formatDate(billing.dueDate)}</Text>
                <Text style={dynamicStyles.rowText}>Description: {billing.description || '—'}</Text>
                <Text style={dynamicStyles.rowText}>
                  Paid: {formatCurrency(billing.totalPaid || 0)} | Balance:{' '}
                  {formatCurrency(billing.balance || billing.amount)}
                </Text>

                {billing.userProofStatus === 'pending' ? (
                  <Text style={[dynamicStyles.rowText, { marginTop: 6, color: '#2563eb' }]}>
                    Proof submitted. Waiting for admin verification.
                  </Text>
                ) : billing.userProofStatus === 'verified' ? (
                  <Text style={[dynamicStyles.rowText, { marginTop: 6, color: '#16a34a' }]}>
                    Proof verified by admin.
                  </Text>
                ) : billing.userProofStatus === 'rejected' ? (
                  <Text style={[dynamicStyles.rowText, { marginTop: 6, color: '#dc2626' }]}>
                    Proof rejected. Please contact admin.
                  </Text>
                ) : billing.status !== 'paid' ? (
                  <TouchableOpacity
                    style={dynamicStyles.proofButton}
                    onPress={() => openProofModal(billing)}
                  >
                    <Text style={dynamicStyles.proofButtonText}>Send Proof of Payment</Text>
                  </TouchableOpacity>
                ) : null}

                {(billing.userProofImageUrl || billing.userProofDetails) && (
                  <TouchableOpacity
                    style={dynamicStyles.viewProofButton}
                    onPress={() => openViewProofModal(billing)}
                  >
                    <Text style={dynamicStyles.viewProofButtonText}>View receipt / proof</Text>
                  </TouchableOpacity>
                )}
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
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalCard}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Proof of Payment</Text>
              {selectedBilling && (
                <Text style={dynamicStyles.modalSubtitle}>
                  {selectedBilling.billingCycle || 'Billing'} · {formatCurrency(selectedBilling.amount)}
                </Text>
              )}
            </View>

            <View style={dynamicStyles.modalBody}>
              <View style={dynamicStyles.proofActionsRow}>
                <TouchableOpacity style={[dynamicStyles.proofActionButton, dynamicStyles.proofActionPrimary]} onPress={showImageSourcePicker}>
                  <Text style={dynamicStyles.proofActionPrimaryText}>Select Image</Text>
                </TouchableOpacity>
              </View>
              {proofImage ? (
                <Image source={{ uri: proofImage }} style={dynamicStyles.proofPreview} />
              ) : (
                <Text style={dynamicStyles.modalHint}>Attach a clear photo or screenshot of your payment.</Text>
              )}
            </View>

            <View style={dynamicStyles.modalActions}>
              <TouchableOpacity
                style={[dynamicStyles.modalButton, dynamicStyles.modalCancel]}
                onPress={() => {
                  setProofModalVisible(false);
                  setSelectedBilling(null);
                  setProofImage(null);
                }}
              >
                <Text style={dynamicStyles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[dynamicStyles.modalButton, dynamicStyles.modalSubmit, submittingProof && dynamicStyles.modalButtonDisabled]}
                onPress={handleSubmitProof}
                disabled={submittingProof}
              >
                {submittingProof ? (
                  <View style={dynamicStyles.submitButtonContent}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={dynamicStyles.modalSubmitText}>Submitting...</Text>
                  </View>
                ) : (
                  <Text style={dynamicStyles.modalSubmitText}>Submit Proof</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={viewProofModalVisible && !!viewProofBilling}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setViewProofModalVisible(false);
          setViewProofBilling(null);
        }}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalCard}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Billing Receipt / Proof</Text>
              {viewProofBilling && (
                <Text style={dynamicStyles.modalSubtitle}>
                  {viewProofBilling.billingCycle || 'Billing'} ·{' '}
                  {formatCurrency(viewProofBilling.amount)}
                </Text>
              )}
            </View>

            <View style={dynamicStyles.modalBody}>
              {viewProofBilling?.userProofImageUrl ? (
                <Image
                  source={{ uri: viewProofBilling.userProofImageUrl }}
                  style={dynamicStyles.proofPreview}
                />
              ) : viewProofBilling?.userProofDetails ? (
                <Text style={dynamicStyles.modalHint}>{viewProofBilling.userProofDetails}</Text>
              ) : (
                <Text style={dynamicStyles.modalHint}>
                  No proof image or details available.
                </Text>
              )}

              {viewProofBilling && (
                <Text style={[dynamicStyles.rowText, { marginTop: 10 }]}>
                  Status:{' '}
                  {viewProofBilling.userProofStatus
                    ? viewProofBilling.userProofStatus.toUpperCase()
                    : 'N/A'}
                </Text>
              )}
            </View>

            <View style={dynamicStyles.modalActions}>
              <TouchableOpacity
                style={[dynamicStyles.modalButton, dynamicStyles.modalSubmit]}
                onPress={() => {
                  setViewProofModalVisible(false);
                  setViewProofBilling(null);
                }}
              >
                <Text style={dynamicStyles.modalSubmitText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
