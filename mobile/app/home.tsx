import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Image, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, where, doc, getDoc, Timestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, getAuthService } from '../firebase/config';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../hooks/useNotifications';
import { MaterialIcons } from '@expo/vector-icons';

interface Announcement {
  id: string;
  title: string;
  content: string;
  imageURL?: string;
  isActive: boolean;
  createdAt: any;
  updatedAt?: any;
}

export default function Home() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const { unreadCount } = useNotifications();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [waterNextDate, setWaterNextDate] = useState<Date | null>(null);
  const [electricNextDate, setElectricNextDate] = useState<Date | null>(null);
  const [loadingBillingDates, setLoadingBillingDates] = useState(false);
  const [pendingComplaints, setPendingComplaints] = useState(0);
  const [pendingMaintenance, setPendingMaintenance] = useState(0);
  const [pendingVehicles, setPendingVehicles] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [userName, setUserName] = useState<string>('');

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

  // Load announcements
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'announcements'),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const announcementsData: Announcement[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        announcementsData.push({
          id: doc.id,
          ...data,
        } as Announcement);
      });
      setAnnouncements(announcementsData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching announcements:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load current user and their next water/electric billing dates
  useEffect(() => {
    const authInstance = getAuthService();
    if (!authInstance || !db) return;

    const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setWaterNextDate(null);
        setElectricNextDate(null);
        return;
      }

      try {
        setLoadingBillingDates(true);
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          setWaterNextDate(null);
          setElectricNextDate(null);
          return;
        }
        const data: any = snap.data();

        // Set user name for welcome modal
        const name = data.firstName || data.fullName || data.email || 'User';
        setUserName(name);

        const parseDate = (raw: any): Date | null => {
          if (!raw) return null;
          try {
            let d: Date;
            if (raw.toDate && typeof raw.toDate === 'function') {
              d = raw.toDate();
            } else if (typeof raw.seconds === 'number') {
              d = new Date(raw.seconds * 1000);
            } else if (raw instanceof Date) {
              d = raw;
            } else {
              d = new Date(raw);
            }
            if (Number.isNaN(d.getTime())) return null;
            return d;
          } catch {
            return null;
          }
        };

        setWaterNextDate(parseDate(data.waterBillingDate));
        setElectricNextDate(parseDate(data.electricBillingDate));

        // Check if user just logged in (within last 30 seconds)
        const lastLoginTime = await AsyncStorage.getItem('lastLoginTime');
        if (lastLoginTime) {
          const loginTime = parseInt(lastLoginTime);
          const now = Date.now();
          const timeSinceLogin = now - loginTime;
          
          // Show welcome modal if login was within last 30 seconds
          if (timeSinceLogin < 30000) {
            setShowWelcomeModal(true);
            // Clear the login time after showing modal
            await AsyncStorage.removeItem('lastLoginTime');
          }
        }
      } catch (err) {
        console.error('Error loading billing dates for home:', err);
      } finally {
        setLoadingBillingDates(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load user stats (pending complaints, maintenance, vehicles)
  useEffect(() => {
    if (!db || !user) {
      setPendingComplaints(0);
      setPendingMaintenance(0);
      setPendingVehicles(0);
      setLoadingStats(false);
      return;
    }

    setLoadingStats(true);

    // Fetch pending complaints
    const complaintsQuery = query(
      collection(db, 'complaints'),
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'in-progress'])
    );

    const complaintsUnsubscribe = onSnapshot(complaintsQuery, (snapshot) => {
      setPendingComplaints(snapshot.size);
    }, (error) => {
      console.error('Error fetching complaints:', error);
    });

    // Fetch pending maintenance
    const maintenanceQuery = query(
      collection(db, 'maintenance'),
      where('userId', '==', user.uid),
      where('status', 'in', ['pending', 'in-progress'])
    );

    const maintenanceUnsubscribe = onSnapshot(maintenanceQuery, (snapshot) => {
      setPendingMaintenance(snapshot.size);
    }, (error) => {
      console.error('Error fetching maintenance:', error);
    });

    // Fetch pending vehicle registrations
    const vehiclesQuery = query(
      collection(db, 'vehicleRegistrations'),
      where('userId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const vehiclesUnsubscribe = onSnapshot(vehiclesQuery, (snapshot) => {
      setPendingVehicles(snapshot.size);
      setLoadingStats(false);
    }, (error) => {
      console.error('Error fetching vehicles:', error);
      setLoadingStats(false);
    });

    return () => {
      complaintsUnsubscribe();
      maintenanceUnsubscribe();
      vehiclesUnsubscribe();
    };
  }, [user, db]);

  const formatDate = useCallback((timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }, []);

  const formatBillingDate = (date: Date | null) => {
    if (!date) return 'Not set';
    try {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Not set';
    }
  };

  return (
    <View style={styles.container}>
      <Header 
        onMenuPress={toggleSidebar}
        onNotificationPress={() => router.push('/notifications')}
        notificationCount={unreadCount}
      />
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={toggleSidebar}
        animation={sidebarAnimation}
      />
      <ScrollView style={styles.content}>
        {/* Status Summary */}
        {(pendingComplaints > 0 || pendingMaintenance > 0 || pendingVehicles > 0) && (
          <View style={styles.statusSection}>
            <Text style={styles.sectionTitle}>Pending Items</Text>
            <View style={styles.statusCard}>
              {pendingComplaints > 0 && (
                <TouchableOpacity
                  style={styles.statusItem}
                  onPress={() => router.push('/complaints')}
                  activeOpacity={0.7}
                >
                  <View style={styles.statusItemLeft}>
                    <MaterialIcons name="report-problem" size={20} color="#ef4444" />
                    <Text style={styles.statusItemLabel}>Complaints</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{pendingComplaints}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {pendingMaintenance > 0 && (
                <TouchableOpacity
                  style={styles.statusItem}
                  onPress={() => router.push('/maintenance')}
                  activeOpacity={0.7}
                >
                  <View style={styles.statusItemLeft}>
                    <MaterialIcons name="build" size={20} color="#8b5cf6" />
                    <Text style={styles.statusItemLabel}>Maintenance</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{pendingMaintenance}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {pendingVehicles > 0 && (
                <TouchableOpacity
                  style={styles.statusItem}
                  onPress={() => router.push('/vehicle-registration')}
                  activeOpacity={0.7}
                >
                  <View style={styles.statusItemLeft}>
                    <MaterialIcons name="directions-car" size={20} color="#3b82f6" />
                    <Text style={styles.statusItemLabel}>Vehicle Registration</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{pendingVehicles}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.announcementsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Announcements</Text>
            {announcements.length > 0 && (
              <TouchableOpacity 
                onPress={() => router.push('/announcements')}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllButton}>See All</Text>
              </TouchableOpacity>
            )}
          </View>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1877F2" />
            </View>
          ) : announcements.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No announcements at this time</Text>
            </View>
          ) : (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.announcementsScrollContainer}
              style={styles.announcementsScrollView}
            >
              {announcements.slice(0, 3).map((announcement) => (
                <View key={announcement.id} style={styles.announcementCard}>
                  {/* Profile Header */}
                  <View style={styles.profileHeader}>
                    <Image 
                      source={require('../assets/logo.png')} 
                      style={styles.profileImage}
                      resizeMode="cover"
                    />
                    <View style={styles.profileInfo}>
                      <Text style={styles.profileName}>Subdibuddy</Text>
                      <Text style={styles.postDate}>{formatDate(announcement.createdAt)}</Text>
                    </View>
                  </View>
                  
                  {/* Announcement Title */}
                  <Text style={styles.announcementTitle} numberOfLines={2}>{announcement.title}</Text>
                  
                  {/* Announcement Content */}
                  <Text style={styles.announcementContent} numberOfLines={3}>{announcement.content}</Text>
                  
                  {/* Announcement Image */}
                  {announcement.imageURL && (
                    <Image 
                      source={{ uri: announcement.imageURL }} 
                      style={styles.announcementImage}
                      resizeMode="cover"
                    />
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.billingSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Next Billing Dates</Text>
            <TouchableOpacity 
              onPress={() => router.push('/billing')}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllButton}>Go to Billing</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.billingCard}>
            {loadingBillingDates ? (
              <View style={styles.billingRow}>
                <ActivityIndicator size="small" color="#111827" />
                <Text style={styles.billingLoadingText}>Loading billing dates...</Text>
              </View>
            ) : (
              <>
                <View style={styles.billingRow}>
                  <View style={styles.billingLabelGroup}>
                    <Text style={styles.billingLabel}>Water</Text>
                    <Text style={styles.billingSubLabel}>Next billing date</Text>
                  </View>
                  <Text style={styles.billingValue}>
                    {formatBillingDate(waterNextDate)}
                  </Text>
                </View>
                <View style={styles.billingDivider} />
                <View style={styles.billingRow}>
                  <View style={styles.billingLabelGroup}>
                    <Text style={styles.billingLabel}>Electricity</Text>
                    <Text style={styles.billingSubLabel}>Next billing date</Text>
                  </View>
                  <Text style={styles.billingValue}>
                    {formatBillingDate(electricNextDate)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Welcome Modal */}
      <Modal
        visible={showWelcomeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowWelcomeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Image 
                source={require('../assets/logo.png')} 
                style={styles.modalLogo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.modalTitle}>Welcome back!</Text>
            <Text style={styles.modalMessage}>
              {userName ? `Hello, ${userName}!` : 'Hello!'}
            </Text>
            <Text style={styles.modalSubtext}>
              We're glad to have you back. Stay updated with the latest announcements and manage your community activities.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowWelcomeModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalButtonText}>Get Started</Text>
            </TouchableOpacity>
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
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
  },
  announcementsSection: {
    padding: 20,
  },
  billingSection: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  billingCard: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  billingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  billingLabelGroup: {
    flexDirection: 'column',
  },
  billingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  billingSubLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  billingValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  billingDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 6,
  },
  billingLoadingText: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 8,
  },
  seeAllButton: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1877F2',
  },
  announcementsScrollView: {
    marginHorizontal: -20,
  },
  announcementsScrollContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  announcementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    width: Dimensions.get('window').width * 0.85,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  postDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  announcementContent: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  announcementImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 4,
  },
  statusSection: {
    padding: 20,
    paddingTop: 0,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 12,
    overflow: 'hidden',
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statusItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusItemLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  statusBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    marginBottom: 16,
  },
  modalLogo: {
    width: 120,
    height: 60,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1877F2',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

