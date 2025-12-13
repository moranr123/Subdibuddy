import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../hooks/useNotifications';

interface VehicleRegistration {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  color: string;
  year: string;
  vehicleType: string;
  registrationImageURL?: string | null;
  vehicleImageURL?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  userId: string;
  userEmail: string;
  createdAt: any;
  updatedAt?: any;
}

export default function RegisteredVehicles() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const [user, setUser] = useState<any>(null);
  const [registeredVehicles, setRegisteredVehicles] = useState<VehicleRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const { unreadCount } = useNotifications();

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

  // Fetch approved/registered vehicles
  useEffect(() => {
    if (!db || !user) {
      setRegisteredVehicles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const q = query(
      collection(db, 'vehicleRegistrations'),
      where('userId', '==', user.uid),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vehicles: VehicleRegistration[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        vehicles.push({
          id: doc.id,
          ...data,
        } as VehicleRegistration);
      });
      setRegisteredVehicles(vehicles);
      setLoading(false);
    }, (error: any) => {
      console.error('Error fetching registered vehicles:', error);
      setLoading(false);
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

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <View style={styles.container}>
      <Header 
        onMenuPress={toggleSidebar}
        onNotificationPress={() => router.push('/notifications')}
        notificationCount={unreadCount}
      />
      <Sidebar isOpen={sidebarOpen} onClose={toggleSidebar} animation={sidebarAnimation} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={styles.title}>Registered Vehicles</Text>
          <Text style={styles.description}>
            Your approved and registered vehicles
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          ) : registeredVehicles.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No registered vehicles</Text>
              <Text style={styles.emptySubtext}>
                Your approved vehicle registrations will appear here
              </Text>
            </View>
          ) : (
            <View style={styles.vehiclesList}>
              {registeredVehicles.map((vehicle) => (
                <View key={vehicle.id} style={styles.vehicleCard}>
                  <View style={styles.vehicleHeader}>
                    <View>
                      <Text style={styles.vehiclePlate}>{vehicle.plateNumber}</Text>
                      <Text style={styles.vehicleDetails}>
                        {vehicle.make} {vehicle.model} ({vehicle.year})
                      </Text>
                    </View>
                    <View style={styles.approvedBadge}>
                      <Text style={styles.approvedBadgeText}>APPROVED</Text>
                    </View>
                  </View>
                  
                  <View style={styles.vehicleInfo}>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Color:</Text>
                      <Text style={styles.infoValue}>{vehicle.color}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Type:</Text>
                      <Text style={styles.infoValue}>{vehicle.vehicleType}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Registered:</Text>
                      <Text style={styles.infoValue}>{formatDate(vehicle.updatedAt || vehicle.createdAt)}</Text>
                    </View>
                  </View>

                  {vehicle.vehicleImageURL && (
                    <View style={styles.imageContainer}>
                      <Image 
                        source={{ uri: vehicle.vehicleImageURL }} 
                        style={styles.vehicleImage} 
                      />
                    </View>
                  )}

                  {vehicle.registrationImageURL && (
                    <View style={styles.imageContainer}>
                      <Text style={styles.imageLabel}>Registration Document:</Text>
                      <Image 
                        source={{ uri: vehicle.registrationImageURL }} 
                        style={styles.vehicleImage} 
                      />
                    </View>
                  )}
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
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
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
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  vehiclesList: {
    gap: 12,
  },
  vehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  vehiclePlate: {
    fontSize: 20,
    fontWeight: '600',
    color: '#050505',
    marginBottom: 4,
  },
  vehicleDetails: {
    fontSize: 14,
    color: '#65676b',
  },
  approvedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  approvedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  vehicleInfo: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: '#65676b',
    fontWeight: '500',
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    color: '#050505',
    flex: 1,
  },
  imageContainer: {
    marginTop: 12,
  },
  imageLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 6,
  },
  vehicleImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
});

