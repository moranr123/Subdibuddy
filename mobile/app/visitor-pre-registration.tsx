import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Animated, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, Timestamp, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../hooks/useNotifications';
import { MaterialIcons } from '@expo/vector-icons';

interface Visitor {
  id: string;
  visitorName: string;
  visitorPhone: string;
  visitorPurpose: string;
  visitorDate: string;
  visitorTime: string;
  residentId: string;
  residentEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  gatePassVerified: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export default function VisitorPreRegistration() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorPurpose, setVisitorPurpose] = useState('');
  const [visitorDate, setVisitorDate] = useState('');
  const [visitorTime, setVisitorTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userVisitors, setUserVisitors] = useState<Visitor[]>([]);
  const [loadingVisitors, setLoadingVisitors] = useState(true);
  const { unreadCount } = useNotifications();

  // Get current user
  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
        setUser(currentUser);
        if (currentUser && db) {
          // Get user email from Firestore
          try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              setUserEmail(userData.email || currentUser.email || '');
            } else {
              setUserEmail(currentUser.email || '');
            }
          } catch (error) {
            console.error('Error fetching user data:', error);
            setUserEmail(currentUser.email || '');
          }
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Fetch user's visitor registrations
  useEffect(() => {
    if (!db || !user) {
      setUserVisitors([]);
      setLoadingVisitors(false);
      return;
    }

    setLoadingVisitors(true);
    
    const q = query(
      collection(db, 'visitors'),
      where('residentId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const visitors: Visitor[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        visitors.push({
          id: doc.id,
          ...data,
        } as Visitor);
      });
      setUserVisitors(visitors);
      setLoadingVisitors(false);
    }, (error: any) => {
      console.error('Error fetching visitors:', error);
      // If error is about missing index, try without orderBy
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(
          collection(db, 'visitors'),
          where('residentId', '==', user.uid)
        );
        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
          const visitors: Visitor[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            visitors.push({
              id: doc.id,
              ...data,
            } as Visitor);
          });
          // Sort by createdAt descending
          visitors.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bDate - aDate;
          });
          setUserVisitors(visitors);
          setLoadingVisitors(false);
        }, (error2: any) => {
          console.error('Error fetching visitors:', error2);
          setLoadingVisitors(false);
        });
        return () => unsubscribe2();
      } else {
        setLoadingVisitors(false);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

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

  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    let cleaned = text.replace(/\D/g, '');
    
    // Limit to 11 digits
    if (cleaned.length > 11) {
      cleaned = cleaned.substring(0, 11);
    }
    
    // Format: 09XX-XXX-XXXX
    if (cleaned.length > 7) {
      return cleaned.substring(0, 4) + '-' + cleaned.substring(4, 7) + '-' + cleaned.substring(7);
    } else if (cleaned.length > 4) {
      return cleaned.substring(0, 4) + '-' + cleaned.substring(4);
    }
    return cleaned;
  };


  const submitVisitorRegistration = useCallback(async () => {
    if (!db || !user || !userEmail) {
      Alert.alert('Error', 'Please wait for authentication to complete.');
      return;
    }

    // Validation
    if (!visitorName.trim()) {
      Alert.alert('Validation Error', 'Please enter visitor name.');
      return;
    }

    if (!visitorPhone.trim()) {
      Alert.alert('Validation Error', 'Please enter visitor phone number.');
      return;
    }

    if (visitorPhone.replace(/\D/g, '').length < 10) {
      Alert.alert('Validation Error', 'Please enter a valid phone number (at least 10 digits).');
      return;
    }

    if (!visitorPurpose.trim()) {
      Alert.alert('Validation Error', 'Please enter the purpose of visit.');
      return;
    }

    if (!visitorDate.trim()) {
      Alert.alert('Validation Error', 'Please select visit date.');
      return;
    }

    if (!visitorTime.trim()) {
      Alert.alert('Validation Error', 'Please select visit time.');
      return;
    }

    setSubmitting(true);
    try {
      const visitorRef = await addDoc(collection(db, 'visitors'), {
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.replace(/\D/g, ''),
        visitorPurpose: visitorPurpose.trim(),
        visitorDate: visitorDate.trim(),
        visitorTime: visitorTime.trim(),
        residentId: user.uid,
        residentEmail: userEmail,
        status: 'pending',
        gatePassVerified: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Create notification for admins
      await addDoc(collection(db, 'notifications'), {
        type: 'visitor_registration',
        visitorId: visitorRef.id,
        userId: user.uid,
        userEmail: userEmail,
        subject: `New Visitor Registration: ${visitorName.trim()}`,
        message: `New visitor registration request: ${visitorName.trim()} visiting on ${visitorDate.trim()} at ${visitorTime.trim()}`,
        recipientType: 'admin',
        isRead: false,
        createdAt: Timestamp.now(),
      });

      Alert.alert(
        'Success',
        'Visitor pre-registration submitted successfully. Please wait for admin approval.',
        [{ text: 'OK', onPress: () => {
          // Reset form
          setVisitorName('');
          setVisitorPhone('');
          setVisitorPurpose('');
          setVisitorDate('');
          setVisitorTime('');
        }}]
      );
    } catch (error: any) {
      console.error('Error submitting visitor registration:', error);
      Alert.alert('Error', `Failed to submit visitor registration: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  }, [db, user, userEmail, visitorName, visitorPhone, visitorPurpose, visitorDate, visitorTime]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFA500';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      default: return '#666666';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <View style={styles.container}>
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={toggleSidebar}
        animation={sidebarAnimation}
      />
      
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
            {/* Menu and Notification Buttons */}
            <View style={styles.headerButtons}>
              <TouchableOpacity 
                onPress={toggleSidebar}
                style={styles.menuButton}
                activeOpacity={0.7}
              >
                <MaterialIcons name="menu" size={24} color="#111827" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => router.push('/notifications')}
                style={styles.notificationButton}
                activeOpacity={0.7}
              >
                <MaterialIcons name="notifications" size={24} color="#111827" />
                {unreadCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.title}>Visitor Pre-Registration</Text>
            <Text style={styles.subtitle}>Register your visitors in advance for easier access</Text>

          {/* Form Section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Visitor Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Visitor Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter visitor's full name"
                value={visitorName}
                onChangeText={setVisitorName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Visitor Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="09XX-XXX-XXXX"
                value={visitorPhone}
                onChangeText={(text) => setVisitorPhone(formatPhoneNumber(text))}
                keyboardType="phone-pad"
                maxLength={13}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Purpose of Visit *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe the purpose of the visit"
                value={visitorPurpose}
                onChangeText={setVisitorPurpose}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Visit Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={visitorDate}
                  onChangeText={setVisitorDate}
                  keyboardType="default"
                />
                <Text style={styles.hint}>Format: YYYY-MM-DD</Text>
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Visit Time *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="HH:MM"
                  value={visitorTime}
                  onChangeText={setVisitorTime}
                  keyboardType="default"
                />
                <Text style={styles.hint}>Format: HH:MM (24-hour)</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={submitVisitorRegistration}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Registration</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Existing Registrations Section */}
          <View style={styles.registrationsSection}>
            <Text style={styles.sectionTitle}>My Visitor Registrations</Text>
            
            {loadingVisitors ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1877F2" />
                <Text style={styles.loadingText}>Loading registrations...</Text>
              </View>
            ) : userVisitors.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="person-add" size={48} color="#9CA3AF" />
                <Text style={styles.emptyText}>No visitor registrations yet</Text>
                <Text style={styles.emptySubtext}>Submit a form above to register a visitor</Text>
              </View>
            ) : (
              <View style={styles.registrationsList}>
                {userVisitors.map((visitor) => (
                  <View key={visitor.id} style={styles.registrationCard}>
                    <View style={styles.registrationHeader}>
                      <View style={styles.registrationInfo}>
                        <Text style={styles.visitorName}>{visitor.visitorName}</Text>
                        <Text style={styles.visitorPhone}>{visitor.visitorPhone}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(visitor.status) }]}>
                        <Text style={styles.statusText}>{getStatusText(visitor.status)}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.registrationDetails}>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="phone" size={16} color="#6B7280" />
                        <Text style={styles.detailText}>{visitor.visitorPhone}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="event" size={16} color="#6B7280" />
                        <Text style={styles.detailText}>{visitor.visitorDate} at {visitor.visitorTime}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="description" size={16} color="#6B7280" />
                        <Text style={styles.detailText} numberOfLines={2}>{visitor.visitorPurpose}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="schedule" size={16} color="#6B7280" />
                        <Text style={styles.detailText}>Submitted: {formatDate(visitor.createdAt)}</Text>
                      </View>
                    </View>

                    {visitor.status === 'approved' && visitor.gatePassVerified && (
                      <View style={styles.verifiedBadge}>
                        <MaterialIcons name="verified" size={16} color="#4CAF50" />
                        <Text style={styles.verifiedText}>Gate Pass Verified</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    padding: 16,
    paddingTop: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  menuButton: {
    padding: 8,
  },
  notificationButton: {
    padding: 8,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#1877F2',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  registrationsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  registrationsList: {
    gap: 12,
  },
  registrationCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  registrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  registrationInfo: {
    flex: 1,
  },
  visitorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  visitorPhone: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  registrationDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  verifiedText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
});
