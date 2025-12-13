import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator, Animated, Dimensions, Modal, KeyboardAvoidingView, Platform } from 'react-native';
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
import { FontAwesome5 } from '@expo/vector-icons';

interface Maintenance {
  id: string;
  maintenanceType: 'Water' | 'Electricity' | 'Garbage disposal';
  description: string;
  status: 'pending' | 'in-progress' | 'resolved' | 'rejected';
  rejectionReason?: string;
  imageURL?: string | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export default function Maintenance() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const [maintenanceType, setMaintenanceType] = useState<'Water' | 'Electricity' | 'Garbage disposal' | ''>('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userMaintenance, setUserMaintenance] = useState<Maintenance[]>([]);
  const [loadingMaintenance, setLoadingMaintenance] = useState(true);
  const [editingMaintenance, setEditingMaintenance] = useState<Maintenance | null>(null);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const { unreadCount } = useNotifications();

  const maintenanceTypes: ('Water' | 'Electricity' | 'Garbage disposal')[] = ['Water', 'Electricity', 'Garbage disposal'];

  // Helper function to get status style name
  const getStatusStyleName = (status: string) => {
    switch (status) {
      case 'pending': return 'statusPending';
      case 'in-progress': return 'statusInprogress';
      case 'resolved': return 'statusResolved';
      case 'rejected': return 'statusRejected';
      default: return 'statusPending';
    }
  };

  // Check if user has an active maintenance request (pending or in-progress)
  const hasActiveMaintenance = userMaintenance.some(m => m.status === 'pending' || m.status === 'in-progress');
  const canSubmitNew = !hasActiveMaintenance;

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

  // Fetch user's maintenance requests
  useEffect(() => {
    if (!db || !user) {
      setUserMaintenance([]);
      setLoadingMaintenance(false);
      return;
    }

    setLoadingMaintenance(true);
    
    const q = query(
      collection(db, 'maintenance'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const maintenance: Maintenance[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const maintenanceItem = {
          id: doc.id,
          ...data,
        } as Maintenance;
        console.log('Maintenance item status:', maintenanceItem.status, 'for item:', maintenanceItem.id);
        // Only include maintenance requests that are pending or in-progress (exclude resolved and rejected)
        if (maintenanceItem.status === 'pending' || maintenanceItem.status === 'in-progress') {
          maintenance.push(maintenanceItem);
        }
      });
      console.log('Total maintenance items found:', maintenance.length);
      setUserMaintenance(maintenance);
      setLoadingMaintenance(false);
    }, (error: any) => {
      console.error('Error fetching maintenance:', error);
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(
          collection(db, 'maintenance'),
          where('userId', '==', user.uid)
        );
        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
          const maintenance: Maintenance[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            const maintenanceItem = {
              id: doc.id,
              ...data,
            } as Maintenance;
            console.log('Maintenance item status (fallback):', maintenanceItem.status, 'for item:', maintenanceItem.id);
            if (maintenanceItem.status === 'pending' || maintenanceItem.status === 'in-progress') {
              maintenance.push(maintenanceItem);
            }
          });
          maintenance.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bDate - aDate;
          });
          setUserMaintenance(maintenance);
          setLoadingMaintenance(false);
        }, (error2) => {
          console.error('Error fetching maintenance (fallback):', error2);
          setLoadingMaintenance(false);
        });
        return () => unsubscribe2();
      } else {
        setLoadingMaintenance(false);
      }
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

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to upload images!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }, []);

  const uploadImageToStorage = useCallback(async (uri: string, path: string): Promise<string | null> => {
    if (!storage) {
      console.error('Storage is not initialized');
      return null;
    }

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function() {
          resolve(xhr.response);
        };
        xhr.onerror = function() {
          reject(new Error('Failed to load image'));
        };
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });
      
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  }, []);

  const handleEdit = useCallback((maintenance: Maintenance) => {
    if (maintenance.status === 'pending') {
      setEditingMaintenance(maintenance);
      setMaintenanceType(maintenance.maintenanceType);
      setDescription(maintenance.description);
      setImageUri(maintenance.imageURL || null);
    } else {
      Alert.alert('Cannot Edit', 'You can only edit maintenance requests that are pending.');
    }
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMaintenance(null);
    setMaintenanceType('');
    setDescription('');
    setImageUri(null);
  }, []);

  const submitMaintenance = useCallback(async () => {
    if (!user || !db) return;

    setSubmitting(true);

    try {
      let imageURL: string | null = null;

      if (imageUri) {
        if (imageUri.startsWith('file://') || imageUri.startsWith('content://')) {
          const imagePath = `maintenance/${user.uid}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          imageURL = await uploadImageToStorage(imageUri, imagePath);
          if (!imageURL) {
            Alert.alert('Upload Error', 'Failed to upload image. Please try again.');
            setSubmitting(false);
            return;
          }
        } else {
          imageURL = imageUri;
        }
      }

      if (editingMaintenance) {
        await updateDoc(doc(db, 'maintenance', editingMaintenance.id), {
          maintenanceType: maintenanceType as 'Water' | 'Electricity' | 'Garbage disposal',
          description: description.trim(),
          imageURL: imageURL || editingMaintenance.imageURL || null,
          updatedAt: Timestamp.now(),
        });

        await addDoc(collection(db, 'notifications'), {
          type: 'maintenance',
          maintenanceId: editingMaintenance.id,
          userId: user.uid,
          userEmail: user.email || '',
          subject: `${maintenanceType} Maintenance Request`,
          message: `Maintenance request updated: ${maintenanceType}`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        setMaintenanceType('');
        setDescription('');
        setImageUri(null);
        setEditingMaintenance(null);

        Alert.alert(
          'Maintenance Updated',
          'Your maintenance request has been updated successfully.',
          [{ text: 'OK' }]
        );
      } else {
        const maintenanceRef = await addDoc(collection(db, 'maintenance'), {
          maintenanceType: maintenanceType as 'Water' | 'Electricity' | 'Garbage disposal',
          description: description.trim(),
          userId: user.uid,
          userEmail: user.email || '',
          status: 'pending',
          imageURL: imageURL || null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        await addDoc(collection(db, 'notifications'), {
          type: 'maintenance',
          maintenanceId: maintenanceRef.id,
          userId: user.uid,
          userEmail: user.email || '',
          subject: `${maintenanceType} Maintenance Request`,
          message: `New maintenance request submitted: ${maintenanceType}`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        setMaintenanceType('');
        setDescription('');
        setImageUri(null);

        Alert.alert(
          'Maintenance Submitted',
          'Your maintenance request has been submitted successfully. It will be reviewed by an admin.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('Error submitting maintenance:', error);
      Alert.alert('Error', `Failed to submit maintenance request: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  }, [maintenanceType, description, imageUri, user, db, uploadImageToStorage, editingMaintenance]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmitNew && !editingMaintenance) {
      Alert.alert('Cannot Submit', 'You have an active maintenance request. Please wait for it to be reviewed before submitting a new one.');
      return;
    }

    if (!maintenanceType) {
      Alert.alert('Validation Error', 'Please select a maintenance type.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Validation Error', 'Please enter a description for your maintenance request.');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'You must be logged in to submit a maintenance request.');
      return;
    }

    if (!db) {
      Alert.alert('Error', 'Database connection error. Please try again.');
      return;
    }

    Alert.alert(
      editingMaintenance ? 'Update Maintenance Request' : 'Submit Maintenance Request',
      editingMaintenance 
        ? 'Are you sure you want to update this maintenance request?'
        : 'Are you sure you want to submit this maintenance request? It will be reviewed by an admin.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: editingMaintenance ? 'Update' : 'Submit',
          onPress: async () => {
            await submitMaintenance();
          },
        },
      ]
    );
  }, [canSubmitNew, editingMaintenance, maintenanceType, description, user, db, submitMaintenance]);

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
            {/* User's Maintenance List */}
            {!loadingMaintenance && userMaintenance.length > 0 && (
              <>
                <Text style={styles.title}>My Maintenance Requests</Text>
                <View style={styles.maintenanceList}>
                  {userMaintenance.map((maintenance) => (
                    <View key={maintenance.id} style={styles.maintenanceCard}>
                      <View style={styles.maintenanceHeader}>
                        <Text style={styles.maintenanceType}>{maintenance.maintenanceType}</Text>
                        <View style={[styles.statusBadge, styles[getStatusStyleName(maintenance.status)]]}>
                          <Text style={styles.statusText}>{maintenance.status.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.maintenanceDescription} numberOfLines={3}>
                        {maintenance.description}
                      </Text>
                      {maintenance.imageURL && (
                        <Image source={{ uri: maintenance.imageURL }} style={styles.maintenanceImage} />
                      )}
                      <View style={styles.maintenanceFooter}>
                        <Text style={styles.maintenanceDate}>
                          Submitted: {maintenance.createdAt?.toDate ? maintenance.createdAt.toDate().toLocaleDateString() : 'N/A'}
                        </Text>
                        {maintenance.status === 'pending' && (
                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => handleEdit(maintenance)}
                            disabled={editingMaintenance !== null}
                          >
                            <Text style={styles.editButtonText}>Edit</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {loadingMaintenance && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1877F2" />
              </View>
            )}

            {/* Submit/Edit Form */}
            {(canSubmitNew || editingMaintenance) && (
              <View style={styles.formSection}>
                <View style={styles.formHeader}>
                  <Text style={styles.formTitle}>
                    {editingMaintenance ? 'Edit Maintenance Request' : 'Submit a Maintenance Request'}
                  </Text>
                  {editingMaintenance && (
                    <TouchableOpacity
                      style={styles.cancelEditButton}
                      onPress={handleCancelEdit}
                    >
                      <Text style={styles.cancelEditText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.formDescription}>
                  {editingMaintenance ? 'Update your maintenance request details below' : 'Fill out the form below to submit your maintenance request'}
                </Text>

                <View style={styles.form}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Maintenance Type *</Text>
                    <TouchableOpacity
                      style={styles.dropdownButton}
                      onPress={() => setShowTypeModal(true)}
                      disabled={submitting}
                    >
                      <Text style={[styles.dropdownButtonText, !maintenanceType && styles.dropdownPlaceholder]}>
                        {maintenanceType || 'Select maintenance type'}
                      </Text>
                      <FontAwesome5 name="chevron-down" size={14} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Description *</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Describe your maintenance request in detail"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                      editable={!submitting}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Image (Optional)</Text>
                    {imageUri ? (
                      <View style={styles.imageContainer}>
                        <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => setImageUri(null)}
                          disabled={submitting}
                        >
                          <Text style={styles.removeImageText}>Remove Image</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.imagePickerButton}
                        onPress={pickImage}
                        disabled={submitting}
                      >
                        <Text style={styles.imagePickerText}>Select Image</Text>
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
                        {editingMaintenance ? 'Update Request' : 'Submit Request'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!canSubmitNew && !editingMaintenance && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  You have an active maintenance request. Please wait for it to be reviewed before submitting a new one. Once your request is resolved, you can submit a new one.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Maintenance Type Modal */}
      <Modal
        visible={showTypeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Maintenance Type</Text>
              <TouchableOpacity onPress={() => setShowTypeModal(false)}>
                <FontAwesome5 name="times" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {maintenanceTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.modalOption, maintenanceType === type && styles.modalOptionSelected]}
                  onPress={() => {
                    setMaintenanceType(type);
                    setShowTypeModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, maintenanceType === type && styles.modalOptionTextSelected]}>
                    {type}
                  </Text>
                  {maintenanceType === type && (
                    <FontAwesome5 name="check" size={16} color="#1877F2" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
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
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  maintenanceList: {
    marginBottom: 24,
    gap: 12,
  },
  maintenanceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  maintenanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  maintenanceType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
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
  statusPending: {
    backgroundColor: '#f59e0b',
  },
  statusInprogress: {
    backgroundColor: '#3b82f6',
  },
  statusResolved: {
    backgroundColor: '#10b981',
  },
  statusRejected: {
    backgroundColor: '#ef4444',
  },
  maintenanceDescription: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  maintenanceImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
  },
  maintenanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  maintenanceDate: {
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
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
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelEditButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  cancelEditText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  formSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  formDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  form: {
    marginTop: 8,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  dropdownButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#111827',
  },
  dropdownPlaceholder: {
    color: '#9ca3af',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
  imagePickerButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerText: {
    fontSize: 16,
    color: '#6b7280',
  },
  imageContainer: {
    marginTop: 8,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  removeImageButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
    paddingBottom: 20,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#111827',
  },
  modalOptionTextSelected: {
    color: '#1877F2',
    fontWeight: '600',
  },
});
