import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, Timestamp, where, deleteDoc } from 'firebase/firestore';
import { FontAwesome5 } from '@expo/vector-icons';
import { getAuthService, db } from '../firebase/config';
import { useTheme } from '../contexts/ThemeContext';

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
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  const [activeFilter, setActiveFilter] = useState<
    | 'all'
    | 'complaint'
    | 'vehicle_registration'
    | 'maintenance'
    | 'announcement'
    | 'visitor_registration'
    | 'billing'
  >('all');
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
    } else if (type === 'announcement') {
      return { name: 'bullhorn', color: '#10b981' };
    } else if (type === 'visitor_registration' || type === 'visitor_registration_status') {
      return { name: 'user-plus', color: '#ec4899' };
    } else if (type === 'billing' || type === 'billing_proof_status' || type === 'billing_proof') {
      return { name: 'dollar-sign', color: '#10b981' };
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
    } else if (activeFilter === 'announcement') {
      setFilteredNotifications(
        notifications.filter(n => n.type === 'announcement')
      );
    } else if (activeFilter === 'visitor_registration') {
      setFilteredNotifications(
        notifications.filter(n => 
          n.type === 'visitor_registration' || n.type === 'visitor_registration_status'
        )
      );
    } else if (activeFilter === 'billing') {
      setFilteredNotifications(
        notifications.filter((n) =>
          n.type === 'billing' ||
          n.type === 'billing_proof' ||
          n.type === 'billing_proof_status'
        )
      );
    }
  }, [notifications, activeFilter]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.headerBackground,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#ffffff',
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 36,
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
    deleteAllButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: '#ef4444',
      borderRadius: 8,
    },
    deleteAllButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
    },
    filterScrollView: {
      marginBottom: 20,
    },
    filterContainer: {
      paddingRight: 20,
      gap: 8,
    },
    filterButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.cardBackground,
      borderWidth: 1,
      borderColor: theme.border,
      marginRight: 8,
    },
    filterButtonActive: {
      backgroundColor: '#1877F2',
      borderColor: '#1877F2',
    },
    filterButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.text,
    },
    filterButtonTextActive: {
      color: '#ffffff',
      fontWeight: '600',
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
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
    },
    notificationsList: {
      gap: 12,
    },
    notificationCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    notificationContent: {
      flex: 1,
    },
    notificationRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.inputBackground,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    notificationTextContainer: {
      flex: 1,
    },
    notificationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    notificationSubject: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      flex: 1,
    },
    notificationTime: {
      fontSize: 12,
      color: theme.textSecondary,
      marginLeft: 8,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#1877F2',
      marginLeft: 8,
    },
    notificationMessage: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
      marginBottom: 8,
    },
    rejectionReasonContainer: {
      marginTop: 8,
      padding: 12,
      backgroundColor: theme.inputBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    rejectionReasonLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
    },
    rejectionReasonText: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
    },
    statusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    statusLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.text,
    },
    statusValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      textTransform: 'uppercase',
    },
    deleteButton: {
      padding: 8,
      marginLeft: 8,
    },
  }), [theme]);

  return (
    <View style={dynamicStyles.container}>
      {/* Back Button */}
      <View style={[dynamicStyles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={dynamicStyles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Notifications</Text>
        <View style={dynamicStyles.headerSpacer} />
      </View>

      <ScrollView style={dynamicStyles.content} contentContainerStyle={dynamicStyles.contentContainer}>
        <View style={dynamicStyles.section}>
          <View style={dynamicStyles.titleRow}>
            {notifications.length > 0 && (
              <TouchableOpacity
                style={dynamicStyles.deleteAllButton}
                onPress={deleteAllNotifications}
                activeOpacity={0.7}
              >
                <Text style={dynamicStyles.deleteAllButtonText}>Delete All</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Buttons */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={dynamicStyles.filterContainer}
            style={dynamicStyles.filterScrollView}
          >
            <TouchableOpacity
              style={[
                dynamicStyles.filterButton,
                activeFilter === 'all' && dynamicStyles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('all')}
              activeOpacity={0.7}
            >
              <Text style={[
                dynamicStyles.filterButtonText,
                activeFilter === 'all' && dynamicStyles.filterButtonTextActive
              ]}>
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                dynamicStyles.filterButton,
                activeFilter === 'complaint' && dynamicStyles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('complaint')}
              activeOpacity={0.7}
            >
              <Text style={[
                dynamicStyles.filterButtonText,
                activeFilter === 'complaint' && dynamicStyles.filterButtonTextActive
              ]}>
                Complaints
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                dynamicStyles.filterButton,
                activeFilter === 'vehicle_registration' && dynamicStyles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('vehicle_registration')}
              activeOpacity={0.7}
            >
              <Text style={[
                dynamicStyles.filterButtonText,
                activeFilter === 'vehicle_registration' && dynamicStyles.filterButtonTextActive
              ]}>
                Vehicle
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                dynamicStyles.filterButton,
                activeFilter === 'maintenance' && dynamicStyles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('maintenance')}
              activeOpacity={0.7}
            >
              <Text style={[
                dynamicStyles.filterButtonText,
                activeFilter === 'maintenance' && dynamicStyles.filterButtonTextActive
              ]}>
                Maintenance
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                dynamicStyles.filterButton,
                activeFilter === 'announcement' && dynamicStyles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('announcement')}
              activeOpacity={0.7}
            >
              <Text style={[
                dynamicStyles.filterButtonText,
                activeFilter === 'announcement' && dynamicStyles.filterButtonTextActive
              ]}>
                Announcements
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                dynamicStyles.filterButton,
                activeFilter === 'billing' && dynamicStyles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('billing')}
              activeOpacity={0.7}
            >
              <Text style={[
                dynamicStyles.filterButtonText,
                activeFilter === 'billing' && dynamicStyles.filterButtonTextActive
              ]}>
                Billing & Payments
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                dynamicStyles.filterButton,
                activeFilter === 'visitor_registration' && dynamicStyles.filterButtonActive
              ]}
              onPress={() => setActiveFilter('visitor_registration')}
              activeOpacity={0.7}
            >
              <Text style={[
                dynamicStyles.filterButtonText,
                activeFilter === 'visitor_registration' && dynamicStyles.filterButtonTextActive
              ]}>
                Visitor
              </Text>
            </TouchableOpacity>
          </ScrollView>
          
          {loading ? (
            <View style={dynamicStyles.loadingContainer}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          ) : filteredNotifications.length === 0 ? (
            <View style={dynamicStyles.emptyContainer}>
              <Text style={dynamicStyles.emptyText}>No notifications</Text>
              <Text style={dynamicStyles.emptySubtext}>
                {notifications.length === 0 
                  ? "You're all caught up!" 
                  : activeFilter === 'all'
                  ? 'No notifications found'
                  : `No ${activeFilter === 'complaint' ? 'complaint ' : activeFilter === 'vehicle_registration' ? 'vehicle registration ' : activeFilter === 'maintenance' ? 'maintenance ' : activeFilter === 'announcement' ? 'announcement ' : 'visitor registration '}notifications`}
              </Text>
            </View>
          ) : (
            <View style={dynamicStyles.notificationsList}>
              {filteredNotifications.map((notification) => (
                <View
                  key={notification.id}
                  style={[
                    dynamicStyles.notificationCard,
                    !notification.isRead && { borderLeftWidth: 3, borderLeftColor: '#1877F2' }
                  ]}
                >
                  <TouchableOpacity
                    style={dynamicStyles.notificationContent}
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
                    <View style={dynamicStyles.notificationRow}>
                      <View style={dynamicStyles.iconContainer}>
                        <FontAwesome5 
                          name={getNotificationIcon(notification.type).name as any} 
                          size={20} 
                          color={getNotificationIcon(notification.type).color} 
                          solid
                        />
                      </View>
                      <View style={dynamicStyles.notificationTextContainer}>
                        <View style={dynamicStyles.notificationHeader}>
                          <Text style={dynamicStyles.notificationSubject}>
                            {notification.subject || 
                              (notification.type === 'vehicle_registration' || notification.type === 'vehicle_registration_status' 
                                ? 'Vehicle Registration Update' 
                                : notification.type === 'maintenance' || notification.type === 'maintenance_status'
                                ? 'Maintenance Update'
                                : notification.type === 'announcement'
                                ? 'Announcement'
                                : notification.type === 'visitor_registration' || notification.type === 'visitor_registration_status'
                                ? 'Visitor Registration Update'
                                : 'Complaint Update')}
                          </Text>
                          {!notification.isRead && (
                            <View style={dynamicStyles.unreadDot} />
                          )}
                        </View>
                    <Text style={dynamicStyles.notificationMessage}>
                      {notification.message}
                    </Text>
                    {notification.rejectionReason && (
                      <View style={dynamicStyles.rejectionReasonContainer}>
                        <Text style={dynamicStyles.rejectionReasonLabel}>Rejection Reason: </Text>
                        <Text style={dynamicStyles.rejectionReasonText}>{notification.rejectionReason}</Text>
                      </View>
                    )}
                    {notification.status && (
                      <View style={dynamicStyles.statusContainer}>
                        <Text style={dynamicStyles.statusLabel}>Status: </Text>
                        <Text style={[
                          dynamicStyles.statusValue,
                          notification.status === 'pending' && { color: '#f59e0b' },
                          notification.status === 'in-progress' && { color: '#3b82f6' },
                          notification.status === 'resolved' && { color: '#10b981' },
                          notification.status === 'rejected' && { color: '#ef4444' },
                        ]}>
                          {notification.status}
                        </Text>
                      </View>
                    )}
                        <Text style={dynamicStyles.notificationTime}>
                          {formatTimeAgo(notification.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={dynamicStyles.deleteButton}
                    onPress={() => deleteNotification(notification.id)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome5 name="times" size={16} color={theme.textSecondary} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterScrollView: {
    marginBottom: 20,
    marginHorizontal: -20,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
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

