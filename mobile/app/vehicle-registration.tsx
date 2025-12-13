import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator, Animated, Dimensions, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, Timestamp, query, where, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
  rejectionReason?: string;
  userId: string;
  userEmail: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export default function VehicleRegistration() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const [plateNumber, setPlateNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [registrationImageUri, setRegistrationImageUri] = useState<string | null>(null);
  const [vehicleImageUri, setVehicleImageUri] = useState<string | null>(null);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [brandSearchQuery, setBrandSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRegistrations, setUserRegistrations] = useState<VehicleRegistration[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(true);
  const [editingRegistration, setEditingRegistration] = useState<VehicleRegistration | null>(null);
  const { unreadCount } = useNotifications();

  // Check if user has a pending vehicle registration
  const hasPendingRegistration = userRegistrations.some(r => r.status === 'pending');
  const canSubmitNew = !hasPendingRegistration;

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

  // Fetch user's vehicle registrations
  useEffect(() => {
    if (!db || !user) {
      setUserRegistrations([]);
      setLoadingRegistrations(false);
      return;
    }

    setLoadingRegistrations(true);
    
    const q = query(
      collection(db, 'vehicleRegistrations'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const registrations: VehicleRegistration[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const registration = {
          id: doc.id,
          ...data,
        } as VehicleRegistration;
        // Only include registrations that are pending (exclude approved and rejected)
        if (registration.status === 'pending') {
          registrations.push(registration);
        }
      });
      setUserRegistrations(registrations);
      setLoadingRegistrations(false);
    }, (error: any) => {
      console.error('Error fetching vehicle registrations:', error);
      // If error is about missing index, try without orderBy
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(
          collection(db, 'vehicleRegistrations'),
          where('userId', '==', user.uid)
        );
        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
          const registrations: VehicleRegistration[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            const registration = {
              id: doc.id,
              ...data,
            } as VehicleRegistration;
            // Only include registrations that are pending (exclude approved and rejected)
            if (registration.status === 'pending') {
              registrations.push(registration);
            }
          });
          // Sort by createdAt descending
          registrations.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bDate - aDate;
          });
          setUserRegistrations(registrations);
          setLoadingRegistrations(false);
        }, (error2: any) => {
          console.error('Error fetching vehicle registrations:', error2);
          setLoadingRegistrations(false);
        });
        return () => unsubscribe2();
      } else {
        setLoadingRegistrations(false);
      }
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

  const formatPlateNumber = (text: string) => {
    // Remove all non-alphanumeric characters
    let cleaned = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    
    // Limit to 7 characters (3 letters + 4 numbers for standard format)
    if (cleaned.length > 7) {
      cleaned = cleaned.substring(0, 7);
    }
    
    // Format: ABC-1234 or ABC 1234
    if (cleaned.length > 3) {
      return cleaned.substring(0, 3) + '-' + cleaned.substring(3);
    }
    return cleaned;
  };

  const vehicleBrands = [
    'Toyota', 'Honda', 'Mitsubishi', 'Nissan', 'Suzuki', 'Hyundai', 'Kia', 'Ford', 'Chevrolet',
    'Mazda', 'Isuzu', 'Subaru', 'Volkswagen', 'Mercedes-Benz', 'BMW', 'Audi', 'Lexus', 'Volvo',
    'Peugeot', 'Jeep', 'Dodge', 'Chrysler', 'Fiat', 'Renault', 'MG', 'Geely', 'Chery', 'BYD',
    'Other'
  ];

  const filteredBrands = vehicleBrands.filter(brand =>
    brand.toLowerCase().includes(brandSearchQuery.toLowerCase())
  );


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

  const handleEdit = useCallback((registration: VehicleRegistration) => {
    // Only allow editing if registration is pending
    if (registration.status === 'pending') {
      setEditingRegistration(registration);
      setPlateNumber(registration.plateNumber);
      setMake(registration.make);
      setModel(registration.model);
      setColor(registration.color);
      setYear(registration.year);
      setVehicleType(registration.vehicleType);
      setRegistrationImageUri(registration.registrationImageURL || null);
      setVehicleImageUri(registration.vehicleImageURL || null);
    } else {
      Alert.alert('Cannot Edit', 'You can only edit vehicle registrations that are pending.');
    }
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingRegistration(null);
    setPlateNumber('');
    setMake('');
    setModel('');
    setColor('');
    setYear('');
    setVehicleType('');
    setRegistrationImageUri(null);
    setVehicleImageUri(null);
  }, []);

  const submitRegistration = useCallback(async () => {
    if (!db || !user) return;

    // Validation
    if (!plateNumber.trim() || !make.trim() || !model.trim() || !color.trim() || !year.trim() || !vehicleType.trim()) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    // Validate vehicle image is required
    if (!vehicleImageUri) {
      Alert.alert('Validation Error', 'Vehicle image is required. Please upload a vehicle image.');
      return;
    }

    setSubmitting(true);
    try {
      let registrationImageURL: string | null = null;
      let vehicleImageURL: string | null = null;
      
      if (registrationImageUri) {
        // Check if it's a new image (starts with file://) or existing URL (starts with http)
        if (registrationImageUri.startsWith('file://') || registrationImageUri.startsWith('content://')) {
          // New image, upload it
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
      }

      if (vehicleImageUri) {
        // Check if it's a new image (starts with file://) or existing URL (starts with http)
        if (vehicleImageUri.startsWith('file://') || vehicleImageUri.startsWith('content://')) {
          // New image, upload it
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

      if (editingRegistration) {
        // Update existing registration
        await updateDoc(doc(db, 'vehicleRegistrations', editingRegistration.id), {
          plateNumber: plateNumber.trim(),
          make: make.trim(),
          model: model.trim(),
          color: color.trim(),
          year: year.trim(),
          vehicleType: vehicleType.trim(),
          registrationImageURL: registrationImageURL || editingRegistration.registrationImageURL || null,
          vehicleImageURL: vehicleImageURL || editingRegistration.vehicleImageURL || null,
          updatedAt: Timestamp.now(),
        });

        // Create notification for admin about the update
        await addDoc(collection(db, 'notifications'), {
          type: 'vehicle_registration',
          vehicleRegistrationId: editingRegistration.id,
          userId: user.uid,
          userEmail: user.email || '',
          message: `Vehicle registration updated: ${plateNumber.trim()} (${make.trim()} ${model.trim()})`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        // Clear form and exit edit mode
        setPlateNumber('');
        setMake('');
        setModel('');
        setColor('');
        setYear('');
        setVehicleType('');
        setRegistrationImageUri(null);
        setVehicleImageUri(null);
        setEditingRegistration(null);

        Alert.alert(
          'Registration Updated',
          'Your vehicle registration has been updated successfully.',
          [{ text: 'OK' }]
        );
      } else {
        // Create new registration
        await addDoc(collection(db, 'vehicleRegistrations'), {
          plateNumber: plateNumber.trim(),
          make: make.trim(),
          model: model.trim(),
          color: color.trim(),
          year: year.trim(),
          vehicleType: vehicleType.trim(),
          registrationImageURL,
          vehicleImageURL,
          status: 'pending',
          userId: user.uid,
          userEmail: user.email || '',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        // Create notification for admin
        await addDoc(collection(db, 'notifications'), {
          type: 'vehicle_registration',
          message: `New vehicle registration request: ${plateNumber.trim()} (${make.trim()} ${model.trim()})`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        // Reset form
        setPlateNumber('');
        setMake('');
        setModel('');
        setColor('');
        setYear('');
        setVehicleType('');
        setRegistrationImageUri(null);
        setVehicleImageUri(null);

        Alert.alert('Success', 'Vehicle registration submitted successfully. It will be reviewed by an admin.');
      }
    } catch (error: any) {
      console.error('Error submitting vehicle registration:', error);
      Alert.alert('Error', error.message || 'Failed to submit vehicle registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [plateNumber, make, model, color, year, vehicleType, registrationImageUri, vehicleImageUri, editingRegistration, user, db, uploadImageToStorage]);

  const handleSubmit = useCallback(async () => {
    // Show confirmation dialog
    Alert.alert(
      editingRegistration ? 'Update Vehicle Registration' : 'Submit Vehicle Registration',
      editingRegistration 
        ? 'Are you sure you want to update this vehicle registration?'
        : 'Are you sure you want to submit this vehicle registration? It will be reviewed by an admin.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: editingRegistration ? 'Update' : 'Submit', onPress: submitRegistration },
      ]
    );
  }, [submitRegistration, editingRegistration]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFA500';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#ef4444';
      default: return '#666666';
    }
  };

  return (
    <View style={styles.container}>
      <Header 
        onMenuPress={toggleSidebar}
        onNotificationPress={() => router.push('/notifications')}
        notificationCount={unreadCount}
      />
      <Sidebar isOpen={sidebarOpen} onClose={toggleSidebar} animation={sidebarAnimation} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
          {userRegistrations.length > 0 && (
            <>
              <Text style={styles.title}>My Vehicle Registrations</Text>
              {loadingRegistrations ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#1877F2" />
                </View>
              ) : (
                <View style={styles.registrationsList}>
                  {userRegistrations.map((registration) => (
                    <View key={registration.id} style={styles.registrationCard}>
                      <View style={styles.registrationHeader}>
                        <Text style={styles.registrationPlate}>{registration.plateNumber}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(registration.status) }]}>
                          <Text style={styles.statusText}>{registration.status.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.registrationDetails}>
                        {registration.make} {registration.model} ({registration.year})
                      </Text>
                      <Text style={styles.registrationDetails}>Color: {registration.color}</Text>
                      <Text style={styles.registrationDetails}>Type: {registration.vehicleType}</Text>
                      {registration.vehicleImageURL && (
                        <View style={styles.imageContainer}>
                          <Text style={styles.imageLabel}>Vehicle Image:</Text>
                          <Image source={{ uri: registration.vehicleImageURL }} style={styles.registrationImage} />
                        </View>
                      )}
                      {registration.registrationImageURL && (
                        <View style={styles.imageContainer}>
                          <Text style={styles.imageLabel}>Registration Document:</Text>
                          <Image source={{ uri: registration.registrationImageURL }} style={styles.registrationImage} />
                        </View>
                      )}
                      <Text style={styles.registrationDate}>
                        Submitted: {formatDate(registration.createdAt)}
                      </Text>
                      {registration.rejectionReason && (
                        <View style={styles.rejectionContainer}>
                          <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
                          <Text style={styles.rejectionText}>{registration.rejectionReason}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Submit/Edit Form - Show if user can submit new or is editing */}
          {(canSubmitNew || editingRegistration) && (
            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>
                  {editingRegistration ? 'Edit Vehicle Registration' : 'Register a Vehicle'}
                </Text>
                {editingRegistration && (
                  <TouchableOpacity
                    style={styles.cancelEditButton}
                    onPress={handleCancelEdit}
                  >
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.formDescription}>
                {editingRegistration ? 'Update your vehicle registration details below' : 'Fill out the form below to register your vehicle.'}
              </Text>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Plate Number *</Text>
                  <TextInput
                    style={styles.input}
                    value={plateNumber}
                    onChangeText={(text) => setPlateNumber(formatPlateNumber(text))}
                    placeholder="ABC-1234"
                    autoCapitalize="characters"
                    maxLength={8}
                  />
                  <Text style={styles.hintText}>Format: ABC-1234 (3 letters, 4 numbers)</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Brand *</Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setShowBrandPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pickerText, !make && styles.placeholderText]}>
                      {make || 'Select brand'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Model *</Text>
                  <TextInput
                    style={styles.input}
                    value={model}
                    onChangeText={setModel}
                    placeholder="e.g., Camry, Civic"
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Color *</Text>
                  <TextInput
                    style={styles.input}
                    value={color}
                    onChangeText={setColor}
                    placeholder="e.g., Red, Blue, Black"
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Year *</Text>
                  <TextInput
                    style={styles.input}
                    value={year}
                    onChangeText={setYear}
                    placeholder="e.g., 2020"
                    keyboardType="numeric"
                    maxLength={4}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Vehicle Type *</Text>
                  <TextInput
                    style={styles.input}
                    value={vehicleType}
                    onChangeText={setVehicleType}
                    placeholder="e.g., Sedan, SUV, Motorcycle"
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Vehicle Image *</Text>
                  <TouchableOpacity style={styles.imageButton} onPress={() => pickImage('vehicle')} activeOpacity={0.7}>
                    {vehicleImageUri ? (
                      <Image source={{ uri: vehicleImageUri }} style={styles.previewImage} />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Text style={styles.imagePlaceholderText}>Tap to add vehicle image</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {vehicleImageUri && (
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setVehicleImageUri(null)}
                    >
                      <Text style={styles.removeImageButtonText}>Remove Image</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Registration Document (Optional)</Text>
                  <TouchableOpacity style={styles.imageButton} onPress={() => pickImage('registration')} activeOpacity={0.7}>
                    {registrationImageUri ? (
                      <Image source={{ uri: registrationImageUri }} style={styles.previewImage} />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Text style={styles.imagePlaceholderText}>Tap to add registration document</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {registrationImageUri && (
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => setRegistrationImageUri(null)}
                    >
                      <Text style={styles.removeImageButtonText}>Remove Image</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {editingRegistration ? 'Update Registration' : 'Submit Registration'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Show message if user has a pending registration */}
          {!canSubmitNew && !editingRegistration && (
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>
                You have a pending vehicle registration. Please wait for it to be reviewed before submitting a new one. Once your registration is approved or rejected, you can submit a new one.
              </Text>
            </View>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Brand Picker Modal */}
      <Modal
        visible={showBrandPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowBrandPicker(false);
          setBrandSearchQuery('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCentered}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Brand</Text>
              <TouchableOpacity onPress={() => {
                setShowBrandPicker(false);
                setBrandSearchQuery('');
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search brand..."
                value={brandSearchQuery}
                onChangeText={setBrandSearchQuery}
                autoCapitalize="words"
              />
            </View>
            <FlatList
              data={filteredBrands}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setMake(item);
                    setShowBrandPicker(false);
                    setBrandSearchQuery('');
                  }}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No brands found</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  keyboardAvoidingView: {
    flex: 1,
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
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  registrationsList: {
    gap: 12,
    marginBottom: 24,
  },
  registrationCard: {
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
  registrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  registrationPlate: {
    fontSize: 18,
    fontWeight: '600',
    color: '#050505',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  registrationDetails: {
    fontSize: 14,
    color: '#65676b',
    marginBottom: 4,
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
  registrationImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  registrationActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  registrationDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1877F2',
    borderRadius: 6,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectionContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#ef4444',
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991b1b',
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 12,
    color: '#991b1b',
  },
  formSection: {
    marginTop: 24,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  cancelEditButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelEditText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  formDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  imageButton: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 14,
    color: '#6b7280',
  },
  removeImageButton: {
    marginTop: 8,
    padding: 8,
    alignItems: 'center',
  },
  removeImageButtonText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#1877F2',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  pickerText: {
    fontSize: 16,
    color: '#111827',
  },
  placeholderText: {
    color: '#9ca3af',
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
    width: '100%',
  },
  modalContentCentered: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
    width: '100%',
    maxWidth: 400,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#6b7280',
    fontWeight: '300',
  },
  modalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalItemText: {
    fontSize: 16,
    color: '#111827',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

