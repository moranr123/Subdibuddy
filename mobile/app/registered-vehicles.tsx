import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Animated, Dimensions, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { FontAwesome5 } from '@expo/vector-icons';
import { getAuthService, db, storage } from '../firebase/config';
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
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);
  const { unreadCount } = useNotifications();
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRegistration | null>(null);
  const [plateNumber, setPlateNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [registrationImageUri, setRegistrationImageUri] = useState<string | null>(null);
  const [vehicleImageUri, setVehicleImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const pickImage = useCallback(async (type: 'registration' | 'vehicle') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera roll permissions to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      if (type === 'registration') {
        setRegistrationImageUri(result.assets[0].uri);
      } else {
        setVehicleImageUri(result.assets[0].uri);
      }
    }
  }, []);

  const uploadImageToStorage = useCallback(async (uri: string, folder: string): Promise<string | null> => {
    if (!storage || !user) return null;

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `${folder}/${user.uid}/${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  }, [user, storage]);

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

  const handleEdit = useCallback((vehicle: VehicleRegistration) => {
    setEditingVehicle(vehicle);
    setPlateNumber(vehicle.plateNumber);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setColor(vehicle.color);
    setYear(vehicle.year);
    setVehicleType(vehicle.vehicleType);
    setRegistrationImageUri(vehicle.registrationImageURL || null);
    setVehicleImageUri(vehicle.vehicleImageURL || null);
    setShowEditModal(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
    setEditingVehicle(null);
    setPlateNumber('');
    setMake('');
    setModel('');
    setColor('');
    setYear('');
    setVehicleType('');
    setRegistrationImageUri(null);
    setVehicleImageUri(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!db || !user || !editingVehicle) return;

    // Validation
    if (!plateNumber.trim() || !make.trim() || !model.trim() || !color.trim() || !year.trim() || !vehicleType.trim()) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    if (!vehicleImageUri) {
      Alert.alert('Validation Error', 'Vehicle image is required.');
      return;
    }

    setSubmitting(true);
    try {
      let registrationImageURL: string | null = editingVehicle.registrationImageURL || null;
      let vehicleImageURL: string | null = editingVehicle.vehicleImageURL || null;

      // Handle registration image
      if (registrationImageUri) {
        if (registrationImageUri.startsWith('file://') || registrationImageUri.startsWith('content://')) {
          // New image, upload it
          if (editingVehicle.registrationImageURL) {
            // Delete old image
            await deleteImageFromStorage(editingVehicle.registrationImageURL);
          }
          registrationImageURL = await uploadImageToStorage(registrationImageUri, 'vehicle-registrations');
          if (!registrationImageURL) {
            Alert.alert('Error', 'Failed to upload registration image. Please try again.');
            setSubmitting(false);
            return;
          }
        } else {
          // Existing image URL, keep it
          registrationImageURL = registrationImageUri;
        }
      } else if (editingVehicle.registrationImageURL) {
        // Image was removed, delete from storage
        await deleteImageFromStorage(editingVehicle.registrationImageURL);
        registrationImageURL = null;
      }

      // Handle vehicle image
      if (vehicleImageUri) {
        if (vehicleImageUri.startsWith('file://') || vehicleImageUri.startsWith('content://')) {
          // New image, upload it
          if (editingVehicle.vehicleImageURL) {
            // Delete old image
            await deleteImageFromStorage(editingVehicle.vehicleImageURL);
          }
          vehicleImageURL = await uploadImageToStorage(vehicleImageUri, 'vehicle-images');
          if (!vehicleImageURL) {
            Alert.alert('Error', 'Failed to upload vehicle image. Please try again.');
            setSubmitting(false);
            return;
          }
        } else {
          // Existing image URL, keep it
          vehicleImageURL = vehicleImageUri;
        }
      }

      // Update vehicle registration
      await updateDoc(doc(db, 'vehicleRegistrations', editingVehicle.id), {
        plateNumber: plateNumber.trim(),
        make: make.trim(),
        model: model.trim(),
        color: color.trim(),
        year: year.trim(),
        vehicleType: vehicleType.trim(),
        registrationImageURL,
        vehicleImageURL,
        updatedAt: Timestamp.now(),
      });

      Alert.alert('Success', 'Vehicle registration updated successfully.');
      handleCancelEdit();
    } catch (error) {
      console.error('Error updating vehicle:', error);
      Alert.alert('Error', 'Failed to update vehicle registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [db, user, editingVehicle, plateNumber, make, model, color, year, vehicleType, registrationImageUri, vehicleImageUri, uploadImageToStorage, deleteImageFromStorage, handleCancelEdit]);

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
                      style={[styles.actionButton, styles.editButton]}
                      onPress={() => handleEdit(vehicle)}
                      activeOpacity={0.7}
                    >
                      <FontAwesome5 name="edit" size={14} color="#ffffff" />
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
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

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="fade"
        transparent={true}
        onRequestClose={handleCancelEdit}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCenteredContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Vehicle</Text>
                <TouchableOpacity onPress={handleCancelEdit} style={styles.modalCloseButton}>
                  <FontAwesome5 name="times" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={styles.modalScrollView}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Plate Number *</Text>
                <TextInput
                  style={styles.formInput}
                  value={plateNumber}
                  onChangeText={(text) => {
                    const formatted = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    if (formatted.length <= 7) {
                      const formattedText = formatted.length > 3 
                        ? formatted.substring(0, 3) + '-' + formatted.substring(3)
                        : formatted;
                      setPlateNumber(formattedText);
                    }
                  }}
                  placeholder="ABC-1234"
                  maxLength={8}
                  autoCapitalize="characters"
                />
                <Text style={styles.formHint}>Format: ABC-1234 (3 letters, 4 numbers)</Text>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Brand *</Text>
                <TextInput
                  style={styles.formInput}
                  value={make}
                  onChangeText={setMake}
                  placeholder="e.g., Toyota"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Model *</Text>
                <TextInput
                  style={styles.formInput}
                  value={model}
                  onChangeText={setModel}
                  placeholder="e.g., Vios"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Color *</Text>
                <TextInput
                  style={styles.formInput}
                  value={color}
                  onChangeText={setColor}
                  placeholder="e.g., White"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Year *</Text>
                <TextInput
                  style={styles.formInput}
                  value={year}
                  onChangeText={setYear}
                  placeholder="e.g., 2020"
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Vehicle Type *</Text>
                <TextInput
                  style={styles.formInput}
                  value={vehicleType}
                  onChangeText={setVehicleType}
                  placeholder="e.g., Sedan, SUV, Motorcycle"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Vehicle Image *</Text>
                {vehicleImageUri ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: vehicleImageUri }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setVehicleImageUri(null)}
                    >
                      <FontAwesome5 name="times" size={16} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.imagePickerButton}
                    onPress={() => pickImage('vehicle')}
                  >
                    <FontAwesome5 name="camera" size={20} color="#1877F2" />
                    <Text style={styles.imagePickerText}>Select Vehicle Image</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Registration Document (Optional)</Text>
                {registrationImageUri ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: registrationImageUri }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setRegistrationImageUri(null)}
                    >
                      <FontAwesome5 name="times" size={16} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.imagePickerButton}
                    onPress={() => pickImage('registration')}
                  >
                    <FontAwesome5 name="file-image" size={20} color="#1877F2" />
                    <Text style={styles.imagePickerText}>Select Registration Document</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={handleCancelEdit}
                  disabled={submitting}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSaveEdit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  editButton: {
    backgroundColor: '#1877F2',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCenteredContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: Dimensions.get('window').height * 0.85,
    width: '100%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollView: {
    maxHeight: Dimensions.get('window').height * 0.65,
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 30,
  },
  formField: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  formHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    backgroundColor: '#f9fafb',
    gap: 8,
  },
  imagePickerText: {
    fontSize: 14,
    color: '#1877F2',
    fontWeight: '500',
  },
  imagePreviewContainer: {
    position: 'relative',
    marginTop: 8,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#1877F2',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

