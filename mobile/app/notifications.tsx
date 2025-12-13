import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, Timestamp, where, deleteDoc } from 'firebase/firestore';
import { FontAwesome5 } from '@expo/vector-icons';
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
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'complaint' | 'vehicle_registration' | 'maintenance'>('all');
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
  }, [db]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!db) return;
    
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'notifications', notificationId));
            } catch (error) {
              console.error('Error deleting notification:', error);
              Alert.alert('Error', 'Failed to delete notification. Please try again.');
            }
          },
        },
      ]
    );
  }, [db]);

  const deleteAllNotifications = useCallback(async () => {
    if (!db || !user || notifications.length === 0) return;
    
    Alert.alert(
      'Delete All Notifications',
      `Are you sure you want to delete all ${notifications.length} notification${notifications.length > 1 ? 's' : ''}? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              const notificationsToDelete = notifications.map(n => n.id);
              await Promise.all(
                notificationsToDelete.map(id => deleteDoc(doc(db, 'notifications', id)))
              );
            } catch (error) {
              console.error('Error deleting all notifications:', error);
              Alert.alert('Error', 'Failed to delete all notifications. Please try again.');
            }
          },
        },
      ]
    );
  }, [db, user, notifications]);

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

  const getNotificationIcon = (type: string) => {
    if (type === 'vehicle_registration' || type === 'vehicle_registration_status') {
      return { name: 'car', color: '#1877F2' };
    } else if (type === 'complaint' || type === 'complaint_status') {
      return { name: 'exclamation-triangle', color: '#f59e0b' };
    } else if (type === 'maintenance' || type === 'maintenance_status') {
      return { name: 'tools', color: '#8b5cf6' };
    } else {
      return { name: 'bell', color: '#6b7280' };
    }
  };

  // Filter notifications based on active filter
  useEffect(() => {
    if (activeFilter === 'all') {
      setFilteredNotifications(notifications);
    } else if (activeFilter === 'complaint') {
      setFilteredNotifications(
        notifications.filter(n => 
          n.type === 'complaint' || n.type === 'complaint_status'
        )
      );
    } else if (activeFilter === 'vehicle_registration') {
      setFilteredNotifications(
        notifications.filter(n => 
          n.type === 'vehicle_registration' || n.type === 'vehicle_registration_status'
        )
      );
    } else if (activeFilter === 'maintenance') {
      setFilteredNotifications(
        notifications.filter(n => 
          n.type === 'maintenance' || n.type === 'maintenance_status'
        )
      );
    }
  }, [notifications, activeFilter]);

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
          <View style={styles.titleRow}>
            <Text style={styles.title}>Notifications</Text>
            {notifications.length > 0 && (
              <TouchableOpacity
                style={styles.deleteAllButton}
                onPress={deleteAllNotifications}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteAllButtonText}>Delete All</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Buttons */}
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                activeFilter === 'all' && styles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('all')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterButtonText,
                activeFilter === 'all' && styles.filterButtonTextActive
              ]}>
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                activeFilter === 'complaint' && styles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('complaint')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterButtonText,
                activeFilter === 'complaint' && styles.filterButtonTextActive
              ]}>
                Complaints
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                activeFilter === 'vehicle_registration' && styles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('vehicle_registration')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterButtonText,
                activeFilter === 'vehicle_registration' && styles.filterButtonTextActive
              ]}>
                Vehicle
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                activeFilter === 'maintenance' && styles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('maintenance')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterButtonText,
                activeFilter === 'maintenance' && styles.filterButtonTextActive
              ]}>
                Maintenance
              </Text>
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          ) : filteredNotifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No notifications</Text>
              <Text style={styles.emptySubtext}>
                {notifications.length === 0 
                  ? "You're all caught up!" 
                  : `No ${activeFilter === 'all' ? '' : activeFilter === 'complaint' ? 'complaint ' : activeFilter === 'vehicle_registration' ? 'vehicle registration ' : 'maintenance '}notifications`}
              </Text>
            </View>
          ) : (
            <View style={styles.notificationsList}>
              {filteredNotifications.map((notification) => (
                <View
                  key={notification.id}
                  style={[
                    styles.notificationItem,
                    !notification.isRead && styles.notificationItemUnread
                  ]}
                >
                  <TouchableOpacity
                    style={styles.notificationContent}
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
                    <View style={styles.notificationRow}>
                      <View style={styles.iconContainer}>
                        <FontAwesome5 
                          name={getNotificationIcon(notification.type).name as any} 
                          size={20} 
                          color={getNotificationIcon(notification.type).color} 
                          solid
                        />
                      </View>
                      <View style={styles.notificationTextContainer}>
                        <View style={styles.notificationHeader}>
                          <Text style={styles.notificationSubject}>
                            {notification.subject || 
                              (notification.type === 'vehicle_registration' || notification.type === 'vehicle_registration_status' 
                                ? 'Vehicle Registration Update' 
                                : notification.type === 'maintenance' || notification.type === 'maintenance_status'
                                ? 'Maintenance Update'
                                : 'Complaint Update')}
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
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteNotification(notification.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
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
    backgroundColor: '#f0f2f5',
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterButtonActive: {
    backgroundColor: '#1877F2',
    borderColor: '#1877F2',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
  deleteAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  deleteAllButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
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
    gap: 8,
  },
  notificationItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationItemUnread: {
    backgroundColor: '#ffffff',
  },
  notificationContent: {
    flex: 1,
    flexDirection: 'row',
  },
  notificationRow: {
    flexDirection: 'row',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f2f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  notificationTextContainer: {
    flex: 1,
  },
  deleteButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 14,
    backgroundColor: '#f0f2f5',
  },
  deleteButtonText: {
    fontSize: 20,
    fontWeight: '300',
    color: '#65676b',
    lineHeight: 20,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notificationSubject: {
    fontSize: 15,
    fontWeight: '600',
    color: '#050505',
    flex: 1,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1877F2',
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 15,
    color: '#050505',
    marginBottom: 6,
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

