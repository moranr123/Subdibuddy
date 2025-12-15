import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, where, doc, getDoc } from 'firebase/firestore';
import { db, getAuthService } from '../firebase/config';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../hooks/useNotifications';

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
      } catch (err) {
        console.error('Error loading billing dates for home:', err);
      } finally {
        setLoadingBillingDates(false);
      }
    });

    return () => unsubscribe();
  }, []);

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
        <View style={styles.billingSection}>
          <Text style={styles.sectionTitle}>Next Billing Dates</Text>
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
      </ScrollView>
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
    paddingBottom: 0,
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
});

