import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { FontAwesome5 } from '@expo/vector-icons';
import { getAuthService, db } from '../firebase/config';
import { useTheme } from '../contexts/ThemeContext';

type FilterType = 'all' | 'complaints' | 'billings-payments' | 'maintenance' | 'vehicle-registration' | 'visitor-registration';

interface Complaint {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in-progress' | 'resolved' | 'rejected';
  rejectionReason?: string;
  imageURL?: string | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

interface HistoryItem {
  id: string;
  type: FilterType;
  title: string;
  description?: string;
  status?: string;
  amount?: number;
  date: Timestamp;
  [key: string]: any;
}

export default function History() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
        setUser(currentUser);
      });
      return () => unsubscribe();
    }
  }, []);

  // Fetch complaints history
  useEffect(() => {
    if (!db || !user || !user?.uid) {
      return;
    }
    
    if (activeFilter !== 'all' && activeFilter !== 'complaints') {
      return;
    }

    if (activeFilter === 'complaints' || activeFilter === 'all') {
      if (activeFilter === 'complaints') {
        setLoading(true);
      }
      const q = query(
        collection(db, 'complaints'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: HistoryItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            type: 'complaints',
            title: data.subject || 'Complaint',
            description: data.description,
            status: data.status,
            rejectionReason: data.rejectionReason,
            date: data.createdAt,
            ...data,
          } as HistoryItem);
        });
        setHistoryItems(prev => {
          const filtered = prev.filter(item => item.type !== 'complaints');
          return [...filtered, ...items];
        });
        if (activeFilter === 'complaints') {
          setLoading(false);
        }
      }, (error: any) => {
        console.error('Error fetching complaints:', error);
        if (activeFilter === 'complaints') {
          setLoading(false);
        }
      });

      return () => unsubscribe();
    }
  }, [user, activeFilter, db]);

  // Fetch billings & payments history
  useEffect(() => {
    if (!db || !user || !user?.uid) {
      return;
    }
    
    if (activeFilter !== 'all' && activeFilter !== 'billings-payments') {
      return;
    }

    if (activeFilter === 'billings-payments' || activeFilter === 'all') {
      // Query for billings/payments - adjust collection name as needed
      const q = query(
        collection(db, 'billings'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: HistoryItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            type: 'billings-payments',
            title: data.title || data.billingType || 'Billing',
            description: data.description,
            status: data.status,
            amount: data.amount,
            date: data.createdAt || data.paymentDate,
            ...data,
          } as HistoryItem);
        });
        setHistoryItems(prev => {
          const filtered = prev.filter(item => item.type !== 'billings-payments');
          return [...filtered, ...items];
        });
      }, (error: any) => {
        console.error('Error fetching billings:', error);
        // If collection doesn't exist, just continue
      });

      return () => unsubscribe();
    }
  }, [user, activeFilter, db]);

  // Fetch maintenance history
  useEffect(() => {
    if (!db || !user || !user?.uid) {
      return;
    }
    
    if (activeFilter !== 'all' && activeFilter !== 'maintenance') {
      return;
    }

    if (activeFilter === 'maintenance' || activeFilter === 'all') {
      // Query for maintenance requests - adjust collection name as needed
      const q = query(
        collection(db, 'maintenance'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: HistoryItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            type: 'maintenance',
            title: data.maintenanceType || 'Maintenance Request',
            description: data.description,
            status: data.status,
            date: data.createdAt,
            ...data,
          } as HistoryItem);
        });
        setHistoryItems(prev => {
          const filtered = prev.filter(item => item.type !== 'maintenance');
          return [...filtered, ...items];
        });
      }, (error: any) => {
        console.error('Error fetching maintenance:', error);
        // If collection doesn't exist, just continue
      });

      return () => unsubscribe();
    }
  }, [user, activeFilter, db]);

  // Fetch vehicle registration history
  useEffect(() => {
    if (!db || !user || !user?.uid) {
      return;
    }
    
    if (activeFilter !== 'all' && activeFilter !== 'vehicle-registration') {
      return;
    }

    if (activeFilter === 'vehicle-registration' || activeFilter === 'all') {
      // Query for vehicle registrations - adjust collection name as needed
      const q = query(
        collection(db, 'vehicleRegistrations'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: HistoryItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            type: 'vehicle-registration',
            title: data.plateNumber || 'Vehicle Registration',
            description: `${data.make || ''} ${data.model || ''} (${data.year || ''})`.trim() || 'Vehicle Registration',
            status: data.status,
            date: data.createdAt,
            ...data,
          } as HistoryItem);
        });
        setHistoryItems(prev => {
          const filtered = prev.filter(item => item.type !== 'vehicle-registration');
          return [...filtered, ...items];
        });
      }, (error: any) => {
        console.error('Error fetching vehicle registrations:', error);
        // If collection doesn't exist, just continue
      });

      return () => unsubscribe();
    }
  }, [user, activeFilter, db]);

  // Fetch visitor registration history
  useEffect(() => {
    if (!db || !user || !user?.uid) {
      return;
    }
    
    if (activeFilter !== 'all' && activeFilter !== 'visitor-registration') {
      return;
    }

    if (activeFilter === 'visitor-registration' || activeFilter === 'all') {
      if (activeFilter === 'visitor-registration') {
        setLoading(true);
      }
      // Query for visitor registrations
      const q = query(
        collection(db, 'visitors'),
        where('residentId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: HistoryItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          items.push({
            id: doc.id,
            type: 'visitor-registration',
            title: data.visitorName || 'Visitor Registration',
            description: `Visit on ${data.visitorDate || 'N/A'} at ${data.visitorTime || 'N/A'}. Purpose: ${data.visitorPurpose || 'N/A'}`,
            status: data.status,
            date: data.createdAt,
            ...data,
          } as HistoryItem);
        });
        setHistoryItems(prev => {
          const filtered = prev.filter(item => item.type !== 'visitor-registration');
          return [...filtered, ...items];
        });
        if (activeFilter === 'visitor-registration') {
          setLoading(false);
        }
      }, (error: any) => {
        console.error('Error fetching visitor registrations:', error);
        // If error is about missing index, try without orderBy
        if (error.code === 'failed-precondition' || error.message?.includes('index')) {
          const q2 = query(
            collection(db, 'visitors'),
            where('residentId', '==', user.uid)
          );
          const unsubscribe2 = onSnapshot(q2, (snapshot) => {
            const items: HistoryItem[] = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              items.push({
                id: doc.id,
                type: 'visitor-registration',
                title: data.visitorName || 'Visitor Registration',
                description: `Visit on ${data.visitorDate || 'N/A'} at ${data.visitorTime || 'N/A'}. Purpose: ${data.visitorPurpose || 'N/A'}`,
                status: data.status,
                date: data.createdAt,
                ...data,
              } as HistoryItem);
            });
            // Sort by createdAt descending
            items.sort((a, b) => {
              const aDate = a.date?.toDate ? a.date.toDate().getTime() : 0;
              const bDate = b.date?.toDate ? b.date.toDate().getTime() : 0;
              return bDate - aDate;
            });
            setHistoryItems(prev => {
              const filtered = prev.filter(item => item.type !== 'visitor-registration');
              return [...filtered, ...items];
            });
            if (activeFilter === 'visitor-registration') {
              setLoading(false);
            }
          }, (error2: any) => {
            console.error('Error fetching visitor registrations:', error2);
            if (activeFilter === 'visitor-registration') {
              setLoading(false);
            }
          });
          return () => unsubscribe2();
        } else {
          if (activeFilter === 'visitor-registration') {
            setLoading(false);
          }
        }
      });

      return () => unsubscribe();
    }
  }, [user, activeFilter, db]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString();
      }
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      return 'N/A';
    }
  };

  const getStatusColor = (status?: string) => {
    if (!status) return '#6b7280';
    switch (status.toLowerCase()) {
      case 'pending': return '#FFA500';
      case 'in-progress': return '#2196F3';
      case 'resolved': return '#4CAF50';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#ef4444';
      case 'paid': return '#4CAF50';
      case 'unpaid': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getTypeLabel = (type: FilterType) => {
    switch (type) {
      case 'complaints': return 'Complaint';
      case 'billings-payments': return 'Billing & Payment';
      case 'maintenance': return 'Maintenance';
      case 'vehicle-registration': return 'Vehicle Registration';
      case 'visitor-registration': return 'Visitor Registration';
      default: return 'Unknown';
    }
  };

  const getTypeIcon = (type: FilterType) => {
    switch (type) {
      case 'complaints':
        return { name: 'exclamation-triangle', color: '#f59e0b' };
      case 'billings-payments':
        return { name: 'dollar-sign', color: '#10b981' };
      case 'maintenance':
        return { name: 'tools', color: '#8b5cf6' };
      case 'vehicle-registration':
        return { name: 'car', color: '#1877F2' };
      case 'visitor-registration':
        return { name: 'user-plus', color: '#ec4899' };
      default:
        return { name: 'bell', color: '#6b7280' };
    }
  };

  // Sort items by date when showing all
  const sortedItems = activeFilter === 'all'
    ? [...historyItems].sort((a, b) => {
        const aDate = a.date?.toDate ? a.date.toDate().getTime() : 0;
        const bDate = b.date?.toDate ? b.date.toDate().getTime() : 0;
        return bDate - aDate; // Descending order (newest first)
      })
    : historyItems;

  const filteredItems = activeFilter === 'all' 
    ? sortedItems 
    : sortedItems.filter(item => item.type === activeFilter);

  const filters: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'complaints', label: 'Complaints' },
    { id: 'billings-payments', label: 'Billings & Payments' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'vehicle-registration', label: 'Vehicle Registration' },
    { id: 'visitor-registration', label: 'Visitor Registration' },
  ];

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
      paddingBottom: 12,
      backgroundColor: theme.headerBackground,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
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
    filterContainer: {
      marginBottom: 20,
    },
    filterScroll: {
      paddingRight: 20,
    },
    filterButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
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
      color: theme.textSecondary,
    },
    filterButtonTextActive: {
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
      fontSize: 16,
      fontWeight: '500',
      color: theme.textSecondary,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    historyList: {
      gap: 8,
    },
    historyCard: {
      backgroundColor: theme.cardBackground,
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
      borderWidth: 1,
      borderColor: theme.border,
    },
    historyCardContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      flexShrink: 0,
    },
    historyCardTextContainer: {
      flex: 1,
    },
    historyCardHeader: {
      marginBottom: 8,
    },
    historyCardTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    historyCardType: {
      fontSize: 13,
      fontWeight: '600',
      color: '#1877F2',
      textTransform: 'uppercase',
    },
    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#ffffff',
    },
    historyCardDate: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    historyCardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 6,
    },
    historyCardDescription: {
      fontSize: 15,
      color: theme.text,
      marginBottom: 6,
      lineHeight: 20,
    },
    historyCardAmount: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
      marginTop: 4,
    },
    rejectionContainer: {
      marginTop: 8,
      padding: 10,
      backgroundColor: theme.inputBackground,
      borderRadius: 6,
      borderLeftWidth: 2,
      borderLeftColor: '#ef4444',
    },
    rejectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: '#ef4444',
      marginBottom: 4,
    },
    rejectionText: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
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
        <Text style={dynamicStyles.headerTitle}>History</Text>
        <View style={dynamicStyles.headerSpacer} />
      </View>

      <ScrollView style={dynamicStyles.content} contentContainerStyle={dynamicStyles.contentContainer}>
        <View style={dynamicStyles.section}>

          {/* Filter Buttons */}
          <View style={dynamicStyles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.filterScroll}>
              {filters.map((filter) => (
                <TouchableOpacity
                  key={filter.id}
                  style={[
                    dynamicStyles.filterButton,
                    activeFilter === filter.id && dynamicStyles.filterButtonActive
                  ]}
                  onPress={() => setActiveFilter(filter.id)}
                >
                  <Text style={[
                    dynamicStyles.filterButtonText,
                    activeFilter === filter.id && dynamicStyles.filterButtonTextActive
                  ]}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* History Items */}
          {loading && filteredItems.length === 0 ? (
            <View style={dynamicStyles.loadingContainer}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={dynamicStyles.emptyContainer}>
              <Text style={dynamicStyles.emptyText}>No history found</Text>
              <Text style={dynamicStyles.emptySubtext}>
                {activeFilter === 'all' 
                  ? 'No history found' 
                  : `No ${filters.find(f => f.id === activeFilter)?.label.toLowerCase()} history found`}
              </Text>
            </View>
          ) : (
            <View style={dynamicStyles.historyList}>
              {filteredItems.map((item) => {
                const icon = getTypeIcon(item.type);
                return (
                  <View key={item.id} style={dynamicStyles.historyCard}>
                    <View style={dynamicStyles.historyCardContent}>
                      <View style={[dynamicStyles.iconContainer, { backgroundColor: icon.color + '1A' }]}>
                        <FontAwesome5
                          name={icon.name as any}
                          size={24}
                          color={icon.color}
                          solid
                        />
                      </View>
                      <View style={dynamicStyles.historyCardTextContainer}>
                        <View style={dynamicStyles.historyCardHeader}>
                          <View style={dynamicStyles.historyCardTitleRow}>
                            <Text style={dynamicStyles.historyCardType}>{getTypeLabel(item.type)}</Text>
                            {item.status && (
                              <View style={[dynamicStyles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                                <Text style={dynamicStyles.statusText}>{item.status.toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={dynamicStyles.historyCardDate}>{formatDate(item.date)}</Text>
                        </View>
                        
                        <Text style={dynamicStyles.historyCardTitle}>{item.title}</Text>
                  
                  {item.description && (
                    <Text style={dynamicStyles.historyCardDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}

                  {item.amount !== undefined && (
                    <Text style={dynamicStyles.historyCardAmount}>
                      Amount: ₱{item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  )}

                        {item.rejectionReason && (
                          <View style={dynamicStyles.rejectionContainer}>
                            <Text style={dynamicStyles.rejectionLabel}>Rejection Reason:</Text>
                            <Text style={dynamicStyles.rejectionText}>{item.rejectionReason}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

