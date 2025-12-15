import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Image, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, where, doc, getDoc, Timestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, getAuthService } from '../firebase/config';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../hooks/useNotifications';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

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
  const { theme, isDarkMode } = useTheme();
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
  const [hasPendingApplication, setHasPendingApplication] = useState(false);

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

  // Check for pending application
  useEffect(() => {
    if (!db || !user) {
      setHasPendingApplication(false);
      return;
    }

    const checkPendingApplication = async () => {
      try {
        const pendingUserDoc = await getDoc(doc(db, 'pendingUsers', user.uid));
        setHasPendingApplication(pendingUserDoc.exists());
      } catch (error) {
        console.error('Error checking pending application:', error);
        setHasPendingApplication(false);
      }
    };

    checkPendingApplication();
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

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      flex: 1,
    },
    pendingApplicationCard: {
      backgroundColor: isDarkMode ? '#1f2937' : '#fffbeb',
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDarkMode ? '#374151' : '#fde68a',
    },
    pendingApplicationContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    pendingApplicationIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDarkMode ? '#374151' : '#fef3c7',
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    pendingApplicationText: {
      flex: 1,
    },
    pendingApplicationTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkMode ? '#fbbf24' : '#92400e',
      marginBottom: 4,
    },
    pendingApplicationMessage: {
      fontSize: 14,
      color: isDarkMode ? '#d1d5db' : '#78350f',
      lineHeight: 20,
    },
    statusSection: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 12,
    },
    statusCard: {
      gap: 8,
    },
    statusItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: theme.background,
      borderRadius: 8,
    },
    statusItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statusItemLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.text,
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
    announcementsSection: {
      paddingHorizontal: 20,
      marginTop: 20,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    seeAllButton: {
      fontSize: 14,
      color: '#1877F2',
      fontWeight: '500',
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
      color: theme.textSecondary,
    },
    announcementsScrollView: {
      marginHorizontal: -20,
    },
    announcementsScrollContainer: {
      paddingHorizontal: 20,
    },
    announcementCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 12,
      marginRight: 12,
      width: Dimensions.get('window').width * 0.85,
      maxWidth: 320,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: isDarkMode ? 0.3 : 0.1,
      shadowRadius: 2,
      elevation: 2,
      borderWidth: 1,
      borderColor: theme.border,
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
      color: theme.text,
      marginBottom: 2,
    },
    postDate: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    announcementTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
    },
    announcementContent: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
      marginBottom: 12,
    },
    announcementImage: {
      width: '100%',
      height: 200,
      borderRadius: 8,
      marginTop: 4,
    },
    billingSection: {
      paddingHorizontal: 20,
      marginTop: 20,
      paddingBottom: 20,
    },
    billingCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    billingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    billingTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
    },
    billingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    billingLabelGroup: {
      flex: 1,
    },
    billingLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.text,
      marginBottom: 2,
    },
    billingSubLabel: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    billingValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: theme.cardBackground,
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
      color: theme.text,
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
      color: theme.textSecondary,
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
  }), [theme, isDarkMode]);

  return (
    <View style={dynamicStyles.container}>
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
      <ScrollView style={dynamicStyles.content}>
        {/* Pending Application Card */}
        {hasPendingApplication && (
          <View style={dynamicStyles.pendingApplicationCard}>
            <View style={dynamicStyles.pendingApplicationContent}>
              <View style={dynamicStyles.pendingApplicationIcon}>
                <MaterialIcons name="pending-actions" size={24} color="#f59e0b" />
              </View>
              <View style={dynamicStyles.pendingApplicationText}>
                <Text style={dynamicStyles.pendingApplicationTitle}>Application Pending</Text>
                <Text style={dynamicStyles.pendingApplicationMessage}>
                  Your resident application is currently under review. You'll be notified once it's approved.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Status Summary */}
        {(pendingComplaints > 0 || pendingMaintenance > 0 || pendingVehicles > 0) && (
          <View style={dynamicStyles.statusSection}>
            <Text style={dynamicStyles.sectionTitle}>Pending Items</Text>
            <View style={dynamicStyles.statusCard}>
              {pendingComplaints > 0 && (
                <TouchableOpacity
                  style={dynamicStyles.statusItem}
                  onPress={() => router.push('/complaints')}
                  activeOpacity={0.7}
                >
                  <View style={dynamicStyles.statusItemLeft}>
                    <MaterialIcons name="report-problem" size={20} color="#ef4444" />
                    <Text style={dynamicStyles.statusItemLabel}>Complaints</Text>
                  </View>
                  <View style={dynamicStyles.statusBadge}>
                    <Text style={dynamicStyles.statusBadgeText}>{pendingComplaints}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {pendingMaintenance > 0 && (
                <TouchableOpacity
                  style={dynamicStyles.statusItem}
                  onPress={() => router.push('/maintenance')}
                  activeOpacity={0.7}
                >
                  <View style={dynamicStyles.statusItemLeft}>
                    <MaterialIcons name="build" size={20} color="#8b5cf6" />
                    <Text style={dynamicStyles.statusItemLabel}>Maintenance</Text>
                  </View>
                  <View style={dynamicStyles.statusBadge}>
                    <Text style={dynamicStyles.statusBadgeText}>{pendingMaintenance}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {pendingVehicles > 0 && (
                <TouchableOpacity
                  style={dynamicStyles.statusItem}
                  onPress={() => router.push('/vehicle-registration')}
                  activeOpacity={0.7}
                >
                  <View style={dynamicStyles.statusItemLeft}>
                    <MaterialIcons name="directions-car" size={20} color="#3b82f6" />
                    <Text style={dynamicStyles.statusItemLabel}>Vehicle Registration</Text>
                  </View>
                  <View style={dynamicStyles.statusBadge}>
                    <Text style={dynamicStyles.statusBadgeText}>{pendingVehicles}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={dynamicStyles.announcementsSection}>
          <View style={dynamicStyles.sectionHeader}>
            <Text style={dynamicStyles.sectionTitle}>Announcements</Text>
            {announcements.length > 0 && (
              <TouchableOpacity 
                onPress={() => router.push('/announcements')}
                activeOpacity={0.7}
              >
                <Text style={dynamicStyles.seeAllButton}>See All</Text>
              </TouchableOpacity>
            )}
          </View>
          {loading ? (
            <View style={dynamicStyles.loadingContainer}>
              <ActivityIndicator size="small" color="#1877F2" />
            </View>
          ) : announcements.length === 0 ? (
            <View style={dynamicStyles.emptyContainer}>
              <Text style={dynamicStyles.emptyText}>No announcements at this time</Text>
            </View>
          ) : (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={dynamicStyles.announcementsScrollContainer}
              style={dynamicStyles.announcementsScrollView}
            >
              {announcements.slice(0, 3).map((announcement) => (
                <View key={announcement.id} style={dynamicStyles.announcementCard}>
                  {/* Profile Header */}
                  <View style={dynamicStyles.profileHeader}>
                    <Image 
                      source={require('../assets/logo.png')} 
                      style={dynamicStyles.profileImage}
                      resizeMode="cover"
                    />
                    <View style={dynamicStyles.profileInfo}>
                      <Text style={dynamicStyles.profileName}>Subdibuddy</Text>
                      <Text style={dynamicStyles.postDate}>{formatDate(announcement.createdAt)}</Text>
                    </View>
                  </View>
                  
                  {/* Announcement Title */}
                  <Text style={dynamicStyles.announcementTitle} numberOfLines={2}>{announcement.title}</Text>
                  
                  {/* Announcement Content */}
                  <Text style={dynamicStyles.announcementContent} numberOfLines={3}>{announcement.content}</Text>
                  
                  {/* Announcement Image */}
                  {announcement.imageURL && (
                    <Image 
                      source={{ uri: announcement.imageURL }} 
                      style={dynamicStyles.announcementImage}
                      resizeMode="cover"
                    />
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={dynamicStyles.billingSection}>
          <View style={dynamicStyles.sectionHeader}>
            <Text style={dynamicStyles.sectionTitle}>Next Billing Dates</Text>
            <TouchableOpacity 
              onPress={() => router.push('/billing')}
              activeOpacity={0.7}
            >
              <Text style={dynamicStyles.seeAllButton}>Go to Billing</Text>
            </TouchableOpacity>
          </View>
          <View style={dynamicStyles.billingCard}>
            {loadingBillingDates ? (
              <View style={dynamicStyles.billingRow}>
                <ActivityIndicator size="small" color={theme.text} />
                <Text style={[dynamicStyles.billingSubLabel, { marginLeft: 8 }]}>Loading billing dates...</Text>
              </View>
            ) : (
              <>
                <View style={dynamicStyles.billingRow}>
                  <View style={dynamicStyles.billingLabelGroup}>
                    <Text style={dynamicStyles.billingLabel}>Water</Text>
                    <Text style={dynamicStyles.billingSubLabel}>Next billing date</Text>
                  </View>
                  <Text style={dynamicStyles.billingValue}>
                    {formatBillingDate(waterNextDate)}
                  </Text>
                </View>
                <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 6 }} />
                <View style={dynamicStyles.billingRow}>
                  <View style={dynamicStyles.billingLabelGroup}>
                    <Text style={dynamicStyles.billingLabel}>Electricity</Text>
                    <Text style={dynamicStyles.billingSubLabel}>Next billing date</Text>
                  </View>
                  <Text style={dynamicStyles.billingValue}>
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
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalContent}>
            <View style={dynamicStyles.modalHeader}>
              <Image 
                source={require('../assets/logo.png')} 
                style={dynamicStyles.modalLogo}
                resizeMode="contain"
              />
            </View>
            <Text style={dynamicStyles.modalTitle}>Welcome back!</Text>
            <Text style={dynamicStyles.modalMessage}>
              {userName ? `Hello, ${userName}!` : 'Hello!'}
            </Text>
            <Text style={dynamicStyles.modalSubtext}>
              We're glad to have you back. Stay updated with the latest announcements and manage your community activities.
            </Text>
            <TouchableOpacity
              style={dynamicStyles.modalButton}
              onPress={() => setShowWelcomeModal(false)}
              activeOpacity={0.7}
            >
              <Text style={dynamicStyles.modalButtonText}>Get Started</Text>
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
  pendingApplicationCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  pendingApplicationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pendingApplicationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pendingApplicationText: {
    flex: 1,
  },
  pendingApplicationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 4,
  },
  pendingApplicationMessage: {
    fontSize: 14,
    color: '#78350f',
    lineHeight: 20,
  },
});

