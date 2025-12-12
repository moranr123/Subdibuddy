import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Modal, TextInput, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState, useCallback, useMemo, memo, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, query, orderBy, where, Timestamp, addDoc } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';

interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: any;
  priority?: 'low' | 'medium' | 'high';
}

function DashboardScreen() {
  const [user, setUser] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDescription, setComplaintDescription] = useState('');
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorPurpose, setVisitorPurpose] = useState('');
  const [visitorDate, setVisitorDate] = useState('');
  const [visitorTime, setVisitorTime] = useState('');
  const [submittingVisitor, setSubmittingVisitor] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billings, setBillings] = useState<any[]>([]);
  const [loadingBillings, setLoadingBillings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const router = useRouter();

  useEffect(() => {
    const authInstance = getAuthService();
    if (!authInstance) {
      router.replace('/');
      return;
    }

    const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        router.replace('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchAnnouncements = useCallback(async () => {
    if (!db) return;
    
    try {
      setLoading(true);
      const q = query(
        collection(db, 'announcements'),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const announcementsData: Announcement[] = [];
      querySnapshot.forEach((doc) => {
        announcementsData.push({
          id: doc.id,
          ...doc.data(),
        } as Announcement);
      });
      setAnnouncements(announcementsData);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user && db) {
      fetchAnnouncements();
    }
  }, [user, db, fetchAnnouncements]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const toggleSidebar = useCallback(() => {
    const toValue = sidebarOpen ? -Dimensions.get('window').width : 0;
    setSidebarOpen(!sidebarOpen);
    Animated.timing(sidebarAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [sidebarOpen, sidebarAnimation]);

  const closeSidebar = useCallback(() => {
    if (sidebarOpen) {
      setSidebarOpen(false);
      Animated.timing(sidebarAnimation, {
        toValue: -Dimensions.get('window').width,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [sidebarOpen, sidebarAnimation]);

  const handleSignOut = useCallback(async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const authInstance = getAuthService();
              if (authInstance) {
                await signOut(authInstance);
              }
              router.replace('/');
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out. Please try again.');
              console.error('Error signing out:', error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [router]);

  const handleSubmitComplaint = useCallback(async () => {
    if (!complaintSubject.trim() || !complaintDescription.trim()) {
      Alert.alert('Error', 'Please fill in both subject and description');
      return;
    }

    if (!db || !user) {
      Alert.alert('Error', 'Unable to submit complaint. Please try again.');
      return;
    }

    try {
      setSubmittingComplaint(true);
      await addDoc(collection(db, 'complaints'), {
        subject: complaintSubject.trim(),
        description: complaintDescription.trim(),
        userId: user.uid,
        userEmail: user.email,
        status: 'pending',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      Alert.alert('Success', 'Your complaint has been submitted successfully!');
      setComplaintSubject('');
      setComplaintDescription('');
      setShowComplaintModal(false);
    } catch (error) {
      console.error('Error submitting complaint:', error);
      Alert.alert('Error', 'Failed to submit complaint. Please try again.');
    } finally {
      setSubmittingComplaint(false);
    }
  }, [complaintSubject, complaintDescription, user, db]);

  const handleSubmitVisitor = useCallback(async () => {
    if (!visitorName.trim() || !visitorEmail.trim() || !visitorPhone.trim() || !visitorPurpose.trim() || !visitorDate || !visitorTime) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!db || !user) {
      Alert.alert('Error', 'Unable to submit visitor registration. Please try again.');
      return;
    }

    try {
      setSubmittingVisitor(true);
      await addDoc(collection(db, 'visitors'), {
        visitorName: visitorName.trim(),
        visitorEmail: visitorEmail.trim(),
        visitorPhone: visitorPhone.trim(),
        visitorPurpose: visitorPurpose.trim(),
        visitorDate: visitorDate,
        visitorTime: visitorTime,
        residentId: user.uid,
        residentEmail: user.email,
        status: 'pending',
        gatePassVerified: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      Alert.alert('Success', 'Visitor pre-registration submitted successfully!');
      setVisitorName('');
      setVisitorEmail('');
      setVisitorPhone('');
      setVisitorPurpose('');
      setVisitorDate('');
      setVisitorTime('');
      setShowVisitorModal(false);
    } catch (error) {
      console.error('Error submitting visitor registration:', error);
      Alert.alert('Error', 'Failed to submit visitor registration. Please try again.');
    } finally {
      setSubmittingVisitor(false);
    }
  }, [visitorName, visitorEmail, visitorPhone, visitorPurpose, visitorDate, visitorTime, user, db]);

  const fetchBillings = useCallback(async () => {
    if (!db || !user) return;
    
    try {
      setLoadingBillings(true);
      console.log('Fetching billings for user:', { uid: user.uid, email: user.email });
      
      // Try to fetch by residentId first
      let q = query(
        collection(db, 'billings'),
        where('residentId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      let querySnapshot = await getDocs(q);
      let billingsData: any[] = [];
      
      console.log(`Found ${querySnapshot.size} billings by residentId`);
      
      // If no results, try by email
      if (querySnapshot.empty && user.email) {
        console.log('No billings found by residentId, trying by email...');
        q = query(
          collection(db, 'billings'),
          where('residentEmail', '==', user.email),
          orderBy('createdAt', 'desc')
        );
        querySnapshot = await getDocs(q);
        console.log(`Found ${querySnapshot.size} billings by residentEmail`);
      }
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log('Billing data:', { id: doc.id, residentId: data.residentId, residentEmail: data.residentEmail });
        const billing = {
          id: doc.id,
          ...data,
        };
        
        // Calculate totals
        const totalPaid = billing.payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;
        billing.totalPaid = totalPaid;
        billing.balance = billing.amount - totalPaid;
        
        billingsData.push(billing);
      });
      
      console.log(`Total billings loaded: ${billingsData.length}`);
      setBillings(billingsData);
    } catch (error) {
      console.error('Error fetching billings:', error);
      // Fallback: fetch all and filter client-side
      try {
        const querySnapshot = await getDocs(collection(db, 'billings'));
        const billingsData: any[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Match by residentId or residentEmail
          if (data.residentId === user.uid || data.residentEmail === user.email) {
            const billing = {
              id: doc.id,
              ...data,
            };
            const totalPaid = billing.payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;
            billing.totalPaid = totalPaid;
            billing.balance = billing.amount - totalPaid;
            billingsData.push(billing);
          }
        });
        billingsData.sort((a, b) => {
          const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return bDate - aDate;
        });
        setBillings(billingsData);
      } catch (fallbackError) {
        console.error('Error in fallback fetch:', fallbackError);
      }
    } finally {
      setLoadingBillings(false);
    }
  }, [db, user]);

  useEffect(() => {
    if (showBillingModal && user && db) {
      fetchBillings();
    }
  }, [showBillingModal, user, db, fetchBillings]);

  const   getPriorityColor = (priority?: string) => {
    if (!priority) return '#6b7280';
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  return (
    <View style={styles.container}>
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <TouchableOpacity
          style={styles.sidebarOverlay}
          activeOpacity={1}
          onPress={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [{ translateX: sidebarAnimation }],
          },
        ]}
      >
        <View style={styles.sidebarContent}>
          <View style={styles.sidebarHeader}>
            <View style={styles.sidebarHeaderContent}>
              <View style={styles.sidebarLogoBadge}>
                <Text style={styles.sidebarLogoText}>S</Text>
              </View>
              <Text style={styles.sidebarTitle}>Subsibuddy</Text>
            </View>
            <TouchableOpacity onPress={closeSidebar} style={styles.sidebarCloseButton}>
              <Text style={styles.sidebarCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sidebarMenu}>
            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                closeSidebar();
              }}
            >
              <Text style={styles.sidebarItemIcon}>▦</Text>
              <Text style={styles.sidebarItemText}>Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                closeSidebar();
                setShowComplaintModal(true);
              }}
            >
              <Text style={styles.sidebarItemIcon}>⚠</Text>
              <Text style={styles.sidebarItemText}>Submit Complaint</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sidebarItem}
              onPress={() => {
                closeSidebar();
                setShowBillingModal(true);
              }}
            >
              <Text style={styles.sidebarItemIcon}>$</Text>
              <Text style={styles.sidebarItemText}>Billing & Payment</Text>
            </TouchableOpacity>

            <View style={styles.sidebarDivider} />

            <TouchableOpacity
              style={[styles.sidebarItem, styles.sidebarItemSignOut]}
              onPress={() => {
                closeSidebar();
                handleSignOut();
              }}
            >
              <Text style={styles.sidebarItemIcon}>→</Text>
              <Text style={styles.sidebarItemText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.mainContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={toggleSidebar} style={styles.menuButton}>
            <Text style={styles.menuButtonText}>≡</Text>
          </TouchableOpacity>
        </View>

      <View style={styles.announcementsSection}>
        <Text style={styles.sectionTitle}>Announcements</Text>
        {loading && announcements.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading announcements...</Text>
          </View>
        ) : announcements.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No announcements at the moment</Text>
          </View>
        ) : (
          announcements.map((announcement) => (
            <View key={announcement.id} style={styles.announcementCard}>
              <View style={styles.announcementHeader}>
                <Text style={styles.announcementTitle}>{announcement.title}</Text>
                {announcement.priority && (
                  <View
                    style={[
                      styles.priorityBadge,
                      { backgroundColor: getPriorityColor(announcement.priority) },
                    ]}
                  >
                    <Text style={styles.priorityText}>{announcement.priority.toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.announcementContent}>{announcement.content}</Text>
              <Text style={styles.announcementDate}>
                {announcement.createdAt?.toDate
                  ? new Date(announcement.createdAt.toDate()).toLocaleDateString()
                  : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.complaintButton}
          onPress={() => setShowComplaintModal(true)}
        >
          <Text style={styles.complaintButtonText}>Submit Complaint</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.visitorButton}
          onPress={() => setShowVisitorModal(true)}
        >
          <Text style={styles.visitorButtonText}>Visitor Pre-Registration</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showComplaintModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowComplaintModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Submit Complaint</Text>
              <TouchableOpacity
                onPress={() => setShowComplaintModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Subject *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter complaint subject"
                  value={complaintSubject}
                  onChangeText={setComplaintSubject}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description *</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  placeholder="Describe your complaint in detail"
                  value={complaintDescription}
                  onChangeText={setComplaintDescription}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  placeholderTextColor="#999"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.submitButton, submittingComplaint && styles.submitButtonDisabled]}
                onPress={handleSubmitComplaint}
                disabled={submittingComplaint}
              >
                {submittingComplaint ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowComplaintModal(false);
                  setComplaintSubject('');
                  setComplaintDescription('');
                }}
                disabled={submittingComplaint}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showVisitorModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowVisitorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Visitor Pre-Registration</Text>
              <TouchableOpacity
                onPress={() => setShowVisitorModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Visitor Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter visitor's full name"
                  value={visitorName}
                  onChangeText={setVisitorName}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Visitor Email *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter visitor's email"
                  value={visitorEmail}
                  onChangeText={setVisitorEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Visitor Phone *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter visitor's phone number"
                  value={visitorPhone}
                  onChangeText={setVisitorPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Purpose of Visit *</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  placeholder="Describe the purpose of visit"
                  value={visitorPurpose}
                  onChangeText={setVisitorPurpose}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Visit Date *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="YYYY-MM-DD"
                  value={visitorDate}
                  onChangeText={setVisitorDate}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Visit Time *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="HH:MM (24-hour format)"
                  value={visitorTime}
                  onChangeText={setVisitorTime}
                  placeholderTextColor="#999"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.submitButton, submittingVisitor && styles.submitButtonDisabled]}
                onPress={handleSubmitVisitor}
                disabled={submittingVisitor}
              >
                {submittingVisitor ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowVisitorModal(false);
                  setVisitorName('');
                  setVisitorEmail('');
                  setVisitorPhone('');
                  setVisitorPurpose('');
                  setVisitorDate('');
                  setVisitorTime('');
                }}
                disabled={submittingVisitor}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBillingModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBillingModal(false)}
      >
        <View style={styles.modalOverlayCentered}>
          <View style={styles.modalContentCentered}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Billing & Payment</Text>
              <TouchableOpacity
                onPress={() => setShowBillingModal(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {loadingBillings ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#111827" />
                  <Text style={styles.loadingText}>Loading statements...</Text>
                </View>
              ) : billings.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No billing statements found.</Text>
                </View>
              ) : (
                billings.map((billing) => {
                  const formatDate = (dateString: string) => {
                    if (!dateString) return 'N/A';
                    try {
                      if (billing.createdAt?.toDate) {
                        return new Date(billing.createdAt.toDate()).toLocaleDateString();
                      }
                      return new Date(dateString).toLocaleDateString();
                    } catch {
                      return dateString;
                    }
                  };
                  
                  const formatCurrency = (amount: number) => {
                    return `$${amount.toFixed(2)}`;
                  };

                  const getStatusColor = (status: string) => {
                    switch (status) {
                      case 'paid': return '#10b981';
                      case 'pending': return '#f59e0b';
                      case 'overdue': return '#ef4444';
                      case 'partial': return '#3b82f6';
                      default: return '#6b7280';
                    }
                  };

                  return (
                    <View key={billing.id} style={styles.billingCard}>
                      <View style={styles.billingCardHeader}>
                        <View>
                          <Text style={styles.billingCycle}>{billing.billingCycle}</Text>
                          <Text style={styles.billingDate}>Due: {new Date(billing.dueDate).toLocaleDateString()}</Text>
                        </View>
                        <View
                          style={[
                            styles.billingStatusBadge,
                            { backgroundColor: getStatusColor(billing.status) },
                          ]}
                        >
                          <Text style={styles.billingStatusText}>{billing.status.toUpperCase()}</Text>
                        </View>
                      </View>
                      
                      <Text style={styles.billingDescription}>{billing.description}</Text>
                      
                      <View style={styles.billingAmounts}>
                        <View style={styles.billingAmountRow}>
                          <Text style={styles.billingAmountLabel}>Total Amount:</Text>
                          <Text style={styles.billingAmountValue}>{formatCurrency(billing.amount)}</Text>
                        </View>
                        <View style={styles.billingAmountRow}>
                          <Text style={styles.billingAmountLabel}>Total Paid:</Text>
                          <Text style={[styles.billingAmountValue, { color: '#10b981' }]}>
                            {formatCurrency(billing.totalPaid || 0)}
                          </Text>
                        </View>
                        <View style={[styles.billingAmountRow, styles.billingBalanceRow]}>
                          <Text style={styles.billingAmountLabel}>Balance:</Text>
                          <Text style={[styles.billingAmountValue, { 
                            color: billing.balance && billing.balance > 0 ? '#ef4444' : '#10b981',
                            fontWeight: '500'
                          }]}>
                            {formatCurrency(billing.balance || billing.amount)}
                          </Text>
                        </View>
                      </View>

                      {billing.payments && billing.payments.length > 0 && (
                        <View style={styles.paymentsSection}>
                          <Text style={styles.paymentsTitle}>Payment History:</Text>
                          {billing.payments.map((payment: any, index: number) => (
                            <View key={index} style={styles.paymentItem}>
                              <View style={styles.paymentItemLeft}>
                                <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                                <Text style={styles.paymentMethod}>{payment.paymentMethod}</Text>
                              </View>
                              <Text style={styles.paymentDate}>
                                {new Date(payment.paymentDate).toLocaleDateString()}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  sidebarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 998,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: Dimensions.get('window').width * 0.75,
    maxWidth: 300,
    backgroundColor: '#ffffff',
    zIndex: 999,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 60,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sidebarHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sidebarLogoBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarLogoText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
  },
  sidebarCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarCloseText: {
    fontSize: 20,
    color: '#6b7280',
  },
  sidebarMenu: {
    flex: 1,
    paddingTop: 10,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sidebarItemIcon: {
    fontSize: 16,
    marginRight: 12,
    width: 24,
    color: '#6b7280',
  },
  sidebarItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '400',
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  sidebarItemSignOut: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '400',
  },
  announcementsSection: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 16,
  },
  announcementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  announcementContent: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  announcementDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 14,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  quickActions: {
    padding: 20,
    paddingTop: 0,
  },
  complaintButton: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  complaintButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '400',
  },
  visitorButton: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  visitorButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '400',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalOverlayCentered: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentCentered: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 500,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#111827',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 20,
    color: '#6b7280',
  },
  modalBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#374151',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  formTextArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  modalFooter: {
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  submitButton: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '400',
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '400',
  },
  billingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  billingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  billingCycle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 4,
  },
  billingDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  billingStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  billingStatusText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  billingDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  billingAmounts: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
    marginBottom: 12,
  },
  billingAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  billingBalanceRow: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
    marginTop: 4,
  },
  billingAmountLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  billingAmountValue: {
    fontSize: 14,
    fontWeight: '400',
    color: '#111827',
  },
  paymentsSection: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  paymentsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 8,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  paymentItemLeft: {
    flex: 1,
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: '400',
    color: '#10b981',
    marginBottom: 2,
  },
  paymentMethod: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'capitalize',
  },
  paymentDate: {
    fontSize: 12,
    color: '#6b7280',
  },
});

export default memo(DashboardScreen);
