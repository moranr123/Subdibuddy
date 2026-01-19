import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, ActivityIndicator, Modal, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, Timestamp } from 'firebase/firestore';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { getAuthService, db } from '../firebase/config';
import { useNotifications } from '../hooks/useNotifications';
import { useTheme } from '../contexts/ThemeContext';

interface Billing {
  id: string;
  billingCycle: string;
  dueDate: string;
  description: string;
  billingType?: 'water' | 'electricity';
  status: 'pending' | 'notified' | 'overdue';
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
  const [viewProofModalVisible, setViewProofModalVisible] = useState(false);
  const [viewProofBilling, setViewProofBilling] = useState<Billing | null>(null);
  const [markingAsPaid, setMarkingAsPaid] = useState<string | null>(null);

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
      borderRadius: 16,
      padding: 0,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 10,
      elevation: 3,
      overflow: 'hidden',
    },
    cardOverdue: {
      borderColor: '#fecaca',
      borderWidth: 2,
      backgroundColor: '#fef2f2',
    },
    cardContent: {
      padding: 18,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14,
      gap: 12,
    },
    notificationIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#e0f2fe',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    notificationIconOverdue: {
      backgroundColor: '#fee2e2',
    },
    notificationIconText: {
      fontSize: 20,
      fontWeight: '700',
      color: '#0369a1',
    },
    notificationIconTextOverdue: {
      color: '#dc2626',
    },
    cardTextContainer: {
      flex: 1,
    },
    notificationTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    dueDateText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#0369a1',
    },
    dueDateTextOverdue: {
      color: '#dc2626',
    },
    messageContainer: {
      backgroundColor: theme.inputBackground || '#f9fafb',
      padding: 12,
      borderRadius: 10,
      marginBottom: 12,
    },
    notificationMessage: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.text,
      fontWeight: '500',
    },
    markPaidButton: {
      marginTop: 12,
      backgroundColor: '#16a34a',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    markPaidButtonDisabled: {
      opacity: 0.6,
    },
    markPaidButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '600',
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
    rowText: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
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
  }), [theme]);


  const openViewProofModal = useCallback((billing: Billing) => {
    setViewProofBilling(billing);
    setViewProofModalVisible(true);
  }, []);

  const handleMarkAsPaid = useCallback(async (billingId: string) => {
    if (!db) return;
    
    setMarkingAsPaid(billingId);
    try {
      await updateDoc(doc(db, 'billings', billingId), {
        status: 'notified',
        updatedAt: Timestamp.now(),
      });
      Alert.alert('Success', 'Billing marked as paid.');
    } catch (error) {
      console.error('Error marking billing as paid:', error);
      Alert.alert('Error', 'Failed to mark billing as paid. Please try again.');
    } finally {
      setMarkingAsPaid(null);
    }
  }, [db]);

  const unpaidBillings = billings.filter((billing) => {
    // Parse due date
    let dueDate: Date | null = null;
    try {
      const raw = (billing as any).dueDate;
      if (raw?.toDate && typeof raw.toDate === 'function') {
        dueDate = raw.toDate();
      } else {
        dueDate = new Date(billing.dueDate);
      }
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        dueDate = null;
      } else if (dueDate) {
        dueDate.setHours(0, 0, 0, 0);
      }
    } catch {
      dueDate = null;
    }

    if (!dueDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Show card exactly 1 week (7 days) before due date
    const diffMs = dueDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Show if due date is exactly 7 days from today (1 week before)
    if (diffDays === 7) {
      return true;
    }

    // Also show if already past due date (overdue)
    if (diffDays < 0) {
      return true;
    }

    return false;
  });

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
          <Text style={dynamicStyles.title}>Billings</Text>
          <Text style={dynamicStyles.description}>Your bills and payment history.</Text>
        </View>



        {loading ? (
          <View style={dynamicStyles.loadingBox}>
            <ActivityIndicator size="small" color={theme.text} />
            <Text style={dynamicStyles.loadingText}>Loading your billings...</Text>
          </View>
        ) : unpaidBillings.length === 0 ? (
          <View style={dynamicStyles.emptyBox}>
            <Text style={dynamicStyles.emptyText}>No billings due.</Text>
          </View>
        ) : (
          <View style={dynamicStyles.list}>
            {unpaidBillings.map((billing) => {
              // Calculate days until due
              let dueDate: Date | null = null;
              try {
                const raw = (billing as any).dueDate;
                if (raw?.toDate && typeof raw.toDate === 'function') {
                  dueDate = raw.toDate();
                } else {
                  dueDate = new Date(billing.dueDate);
                }
                if (dueDate && Number.isNaN(dueDate.getTime())) {
                  dueDate = null;
                } else if (dueDate) {
                  dueDate.setHours(0, 0, 0, 0);
                }
              } catch {
                dueDate = null;
              }

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffMs = dueDate ? dueDate.getTime() - today.getTime() : 0;
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const isOverdue = diffDays < 0;

              return (
                <View
                  key={billing.id}
                  style={[
                    dynamicStyles.card,
                    isOverdue && dynamicStyles.cardOverdue
                  ]}
                >
                  <View style={dynamicStyles.cardContent}>
                    <View style={dynamicStyles.cardHeaderRow}>
                      <View style={[
                        dynamicStyles.notificationIcon,
                        isOverdue && dynamicStyles.notificationIconOverdue
                      ]}>
                        <Text style={[
                          dynamicStyles.notificationIconText,
                          isOverdue && dynamicStyles.notificationIconTextOverdue
                        ]}>
                          {isOverdue ? '!' : '📅'}
                        </Text>
                      </View>
                      <View style={dynamicStyles.cardTextContainer}>
                        <Text style={dynamicStyles.notificationTitle}>
                          {isOverdue ? 'Billing Due' : 'Upcoming Billing'}
                        </Text>
                        <Text style={[
                          dynamicStyles.dueDateText,
                          isOverdue && dynamicStyles.dueDateTextOverdue
                        ]}>
                          Due: {formatDate(billing.dueDate)}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={dynamicStyles.messageContainer}>
                      <Text style={dynamicStyles.notificationMessage}>
                        {isOverdue 
                          ? 'Your billing is now due. Please take action.'
                          : `Your billing will be due in ${diffDays} day${diffDays !== 1 ? 's' : ''}.`}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        dynamicStyles.markPaidButton,
                        markingAsPaid === billing.id && dynamicStyles.markPaidButtonDisabled
                      ]}
                      onPress={() => handleMarkAsPaid(billing.id)}
                      disabled={markingAsPaid === billing.id}
                      activeOpacity={0.7}
                    >
                      {markingAsPaid === billing.id ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={dynamicStyles.markPaidButtonText}>
                          Mark as Paid
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
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
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalCard}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Billing Receipt / Proof</Text>
              {viewProofBilling && (
                <Text style={dynamicStyles.modalSubtitle}>
                  {viewProofBilling.billingCycle || 'Billing'}
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
