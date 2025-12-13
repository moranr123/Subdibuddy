import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, Timestamp, where } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

interface Notification {
  id: string;
  type: string;
  complaintId?: string;
  subject?: string;
  message: string;
  status?: string;
  rejectionReason?: string;
  isRead: boolean;
  createdAt: Timestamp;
}

export default function Notifications() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Get current user
  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
        setUser(currentUser);
      });
      return () => unsubscribe();
    }
  }, []);

  // Listen to notifications
  useEffect(() => {
    if (!db || !user) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientUserId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notificationList: Notification[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        notificationList.push({
          id: doc.id,
          ...data,
        } as Notification);
      });
      setNotifications(notificationList);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to notifications:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

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

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!db) return;
    
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  const formatTimeAgo = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'Just now';
    
    const now = new Date();
    const created = timestamp.toDate ? timestamp.toDate() : (timestamp as any).seconds ? new Date((timestamp as any).seconds * 1000) : new Date();
    const diffInSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return created.toLocaleDateString();
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

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
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={styles.title}>Notifications</Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No notifications</Text>
              <Text style={styles.emptySubtext}>You're all caught up!</Text>
            </View>
          ) : (
            <View style={styles.notificationsList}>
              {notifications.map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  style={[
                    styles.notificationItem,
                    !notification.isRead && styles.notificationItemUnread
                  ]}
                  onPress={() => {
                    if (!notification.isRead) {
                      markAsRead(notification.id);
                    }
                    if (notification.complaintId) {
                      router.push('/complaints');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                      <Text style={styles.notificationSubject}>
                        {notification.subject || 'Complaint Update'}
                      </Text>
                      {!notification.isRead && (
                        <View style={styles.unreadDot} />
                      )}
                    </View>
                    <Text style={styles.notificationMessage}>
                      {notification.message}
                    </Text>
                    {notification.rejectionReason && (
                      <View style={styles.rejectionReasonContainer}>
                        <Text style={styles.rejectionReasonLabel}>Rejection Reason: </Text>
                        <Text style={styles.rejectionReasonText}>{notification.rejectionReason}</Text>
                      </View>
                    )}
                    {notification.status && (
                      <View style={styles.statusContainer}>
                        <Text style={styles.statusLabel}>Status: </Text>
                        <Text style={[styles.statusValue, styles[`status${notification.status.charAt(0).toUpperCase() + notification.status.slice(1).replace('-', '')}`]]}>
                          {notification.status}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.notificationTime}>
                      {formatTimeAgo(notification.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
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
  contentContainer: {
    paddingBottom: 20,
  },
  section: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
  },
  notificationsList: {
    gap: 12,
  },
  notificationItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  notificationItemUnread: {
    borderLeftWidth: 4,
    borderLeftColor: '#1877F2',
    backgroundColor: '#f0f7ff',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  notificationSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1877F2',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusPending: {
    color: '#f59e0b',
  },
  statusInprogress: {
    color: '#3b82f6',
  },
  statusResolved: {
    color: '#10b981',
  },
  statusRejected: {
    color: '#ef4444',
  },
  rejectionReasonContainer: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  rejectionReasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991b1b',
    marginBottom: 4,
  },
  rejectionReasonText: {
    fontSize: 13,
    color: '#7f1d1d',
    lineHeight: 18,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
});

