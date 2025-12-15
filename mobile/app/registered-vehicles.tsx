import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { FontAwesome5 } from '@expo/vector-icons';
import { getAuthService, db, storage } from '../firebase/config';

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
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<any>(null);
  const [registeredVehicles, setRegisteredVehicles] = useState<VehicleRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);
  

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


  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  const deleteImageFromStorage = useCallback(async (imageURL: string) => {
    if (!storage || !imageURL) return;
    
    try {
      // Extract the path from the full URL
      const urlParts = imageURL.split('/');
      const pathIndex = urlParts.findIndex(part => part === 'o');
      if (pathIndex !== -1 && pathIndex + 1 < urlParts.length) {
        const encodedPath = urlParts[pathIndex + 1].split('?')[0];
        const decodedPath = decodeURIComponent(encodedPath);
        const imageRef = ref(storage, decodedPath);
        await deleteObject(imageRef);
      }
    } catch (error) {
      console.error('Error deleting image from storage:', error);
      // Don't throw error, just log it
    }
  }, [storage]);

  const handleDelete = useCallback(async (vehicle: VehicleRegistration) => {
    Alert.alert(
      'Delete Vehicle',
      `Are you sure you want to delete the vehicle registration for ${vehicle.plateNumber}? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!db) return;
            // Set deleting state after confirmation
            setDeletingVehicleId(vehicle.id);
            try {
              // Delete images from storage
              if (vehicle.registrationImageURL) {
                await deleteImageFromStorage(vehicle.registrationImageURL);
              }
              if (vehicle.vehicleImageURL) {
                await deleteImageFromStorage(vehicle.vehicleImageURL);
              }
              
              // Delete document from Firestore
              await deleteDoc(doc(db, 'vehicleRegistrations', vehicle.id));
            } catch (error) {
              console.error('Error deleting vehicle:', error);
              Alert.alert('Error', 'Failed to delete vehicle registration. Please try again.');
            } finally {
              setDeletingVehicleId(null);
            }
          },
        },
      ]
    );
  }, [db, deleteImageFromStorage]);

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registered Vehicles</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
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
                    <View style={styles.vehicleHeaderLeft}>
                      <Text style={styles.vehiclePlate}>{vehicle.plateNumber}</Text>
                      <Text style={styles.vehicleDetails}>
                        {vehicle.make} {vehicle.model} ({vehicle.year})
                      </Text>
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

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.deleteButton, deletingVehicleId === vehicle.id && styles.actionButtonDisabled]}
                      onPress={() => handleDelete(vehicle)}
                      activeOpacity={0.7}
                      disabled={deletingVehicleId === vehicle.id}
                    >
                      {deletingVehicleId === vehicle.id ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <FontAwesome5 name="trash" size={14} color="#ffffff" />
                          <Text style={styles.actionButtonText}>Delete</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
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
  vehicleHeaderLeft: {
    flex: 1,
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
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 6,
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionButtonDisabled: {
    opacity: 0.6,
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

