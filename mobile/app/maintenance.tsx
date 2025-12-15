import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator, Animated, Dimensions, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, Timestamp, query, where, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuthService, db, storage } from '../firebase/config';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useNotifications } from '../hooks/useNotifications';
import { FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

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
  const { theme } = useTheme();
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
      // If error is about missing index, try without orderBy
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
            // Only include maintenance requests that are pending or in-progress (exclude resolved and rejected)
            if (maintenanceItem.status === 'pending' || maintenanceItem.status === 'in-progress') {
              maintenance.push(maintenanceItem);
            }
          });
          // Sort manually by createdAt descending
          maintenance.sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
          });
          setUserMaintenance(maintenance);
          setLoadingMaintenance(false);
        }, (error2: any) => {
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

  const showImageSourcePicker = () => {
    Alert.alert(
      'Select Image Source',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: () => pickImage('camera'),
        },
        {
          text: 'Gallery',
          onPress: () => pickImage('gallery'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Gallery permission is required to select images.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const uploadImageToStorage = useCallback(async (uri: string, path: string): Promise<string | null> => {
    if (!storage) {
      console.error('Storage not initialized');
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
    // Only allow editing if maintenance is pending
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

      // Upload image if selected (and it's a new image, not the existing one)
      if (imageUri) {
        // Check if it's a new image (starts with file://) or existing URL (starts with http)
        if (imageUri.startsWith('file://') || imageUri.startsWith('content://')) {
          // New image, upload it
          const imagePath = `maintenance/${user.uid}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          imageURL = await uploadImageToStorage(imageUri, imagePath);
          if (!imageURL) {
            Alert.alert('Upload Error', 'Failed to upload image. Please try again.');
            setSubmitting(false);
            return;
          }
        } else {
          // Existing image URL, keep it
          imageURL = imageUri;
        }
      }

      if (editingMaintenance) {
        // Update existing maintenance
        await updateDoc(doc(db, 'maintenance', editingMaintenance.id), {
          maintenanceType: maintenanceType.trim(),
          description: description.trim(),
          imageURL: imageURL || editingMaintenance.imageURL || null,
          updatedAt: Timestamp.now(),
        });

        // Create notification for admins about the update
        await addDoc(collection(db, 'notifications'), {
          type: 'maintenance',
          maintenanceId: editingMaintenance.id,
          userId: user.uid,
          userEmail: user.email || '',
          maintenanceType: maintenanceType.trim(),
          message: `Maintenance request updated: ${maintenanceType.trim()}`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        // Clear form and exit edit mode
        setMaintenanceType('');
        setDescription('');
        setImageUri(null);
        setEditingMaintenance(null);

        Alert.alert(
          'Maintenance Request Updated',
          'Your maintenance request has been updated successfully.',
          [{ text: 'OK' }]
        );
      } else {
        // Create new maintenance
        const maintenanceRef = await addDoc(collection(db, 'maintenance'), {
          maintenanceType: maintenanceType.trim(),
          description: description.trim(),
          userId: user.uid,
          userEmail: user.email || '',
          status: 'pending',
          imageURL: imageURL || null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        // Create notification for admins
        await addDoc(collection(db, 'notifications'), {
          type: 'maintenance',
          maintenanceId: maintenanceRef.id,
          userId: user.uid,
          userEmail: user.email || '',
          maintenanceType: maintenanceType.trim(),
          message: `New maintenance request submitted: ${maintenanceType.trim()}`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        // Clear form
        setMaintenanceType('');
        setDescription('');
        setImageUri(null);

        Alert.alert(
          'Maintenance Request Submitted',
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

    if (!maintenanceType.trim()) {
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

    // Show confirmation dialog
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

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
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
      color: theme.text,
      marginBottom: 8,
    },
    description: {
      fontSize: 16,
      color: theme.textSecondary,
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
      backgroundColor: theme.cardBackground,
      borderRadius: 8,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
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
      color: theme.text,
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
      color: theme.textSecondary,
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
      color: theme.textSecondary,
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
      borderTopColor: theme.border,
    },
    formTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
    },
    formDescription: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 16,
    },
    form: {
      marginTop: 8,
    },
    infoBox: {
      backgroundColor: theme.cardBackground,
      padding: 12,
      borderRadius: 8,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: theme.border,
    },
    infoText: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.text,
      marginBottom: 8,
    },
    dropdownButton: {
      backgroundColor: theme.inputBackground,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dropdownButtonText: {
      fontSize: 16,
      color: theme.text,
    },
    dropdownPlaceholder: {
      color: theme.placeholderText,
    },
    input: {
      backgroundColor: theme.inputBackground,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
    },
    textArea: {
      minHeight: 120,
      paddingTop: 12,
    },
    imagePickerButton: {
      backgroundColor: theme.cardBackground,
      borderWidth: 1,
      borderColor: theme.border,
      borderStyle: 'dashed',
      borderRadius: 8,
      paddingVertical: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePickerText: {
      fontSize: 16,
      color: theme.textSecondary,
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
      backgroundColor: theme.border,
      opacity: 0.6,
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
      backgroundColor: theme.cardBackground,
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
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
    },
    modalOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalOptionSelected: {
      backgroundColor: theme.sectionBackground,
    },
    modalOptionText: {
      fontSize: 16,
      color: theme.text,
    },
    modalOptionTextSelected: {
      color: '#1877F2',
      fontWeight: '600',
    },
  }), [theme]);

  return (
    <View style={dynamicStyles.container}>
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
        style={dynamicStyles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={dynamicStyles.content} 
          contentContainerStyle={dynamicStyles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={dynamicStyles.section}>
            {/* User's Maintenance List */}
            {!loadingMaintenance && userMaintenance.length > 0 && (
              <>
                <Text style={dynamicStyles.title}>My Maintenance Requests</Text>
                <View style={dynamicStyles.maintenanceList}>
                  {userMaintenance.map((maintenance) => (
                    <View key={maintenance.id} style={dynamicStyles.maintenanceCard}>
                      <View style={dynamicStyles.maintenanceHeader}>
                        <Text style={dynamicStyles.maintenanceType}>{maintenance.maintenanceType}</Text>
                        <View style={[dynamicStyles.statusBadge, dynamicStyles[getStatusStyleName(maintenance.status)]]}>
                          <Text style={dynamicStyles.statusText}>{maintenance.status.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={dynamicStyles.maintenanceDescription} numberOfLines={3}>
                        {maintenance.description}
                      </Text>
                      {maintenance.imageURL && (
                        <Image source={{ uri: maintenance.imageURL }} style={dynamicStyles.maintenanceImage} />
                      )}
                      <View style={dynamicStyles.maintenanceFooter}>
                        <Text style={dynamicStyles.maintenanceDate}>
                          Submitted: {maintenance.createdAt?.toDate ? maintenance.createdAt.toDate().toLocaleDateString() : 'N/A'}
                        </Text>
                        {maintenance.status === 'pending' && (
                          <TouchableOpacity
                            style={dynamicStyles.editButton}
                            onPress={() => handleEdit(maintenance)}
                            disabled={editingMaintenance !== null}
                          >
                            <Text style={dynamicStyles.editButtonText}>Edit</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {loadingMaintenance && (
              <View style={dynamicStyles.loadingContainer}>
                <ActivityIndicator size="large" color="#1877F2" />
              </View>
            )}

            {/* Submit/Edit Form */}
            {(canSubmitNew || editingMaintenance) && (
              <View style={dynamicStyles.formSection}>
                <View style={dynamicStyles.formHeader}>
                  <Text style={dynamicStyles.formTitle}>
                    {editingMaintenance ? 'Edit Maintenance Request' : 'Submit a Maintenance Request'}
                  </Text>
                  {editingMaintenance && (
                    <TouchableOpacity
                      style={dynamicStyles.cancelEditButton}
                      onPress={handleCancelEdit}
                    >
                      <Text style={dynamicStyles.cancelEditText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={dynamicStyles.formDescription}>
                  {editingMaintenance ? 'Update your maintenance request details below' : 'Fill out the form below to submit your maintenance request'}
                </Text>

                <View style={dynamicStyles.form}>
                  <View style={dynamicStyles.inputGroup}>
                    <Text style={dynamicStyles.label}>Maintenance Type</Text>
                    <TouchableOpacity
                      style={dynamicStyles.dropdownButton}
                      onPress={() => setShowTypeModal(true)}
                      disabled={submitting}
                    >
                      <Text style={[dynamicStyles.dropdownButtonText, !maintenanceType && dynamicStyles.dropdownPlaceholder]}>
                        {maintenanceType || 'Select maintenance type'}
                      </Text>
                      <FontAwesome5 name="chevron-down" size={14} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={dynamicStyles.inputGroup}>
                    <Text style={dynamicStyles.label}>Description</Text>
                    <TextInput
                      style={[dynamicStyles.input, dynamicStyles.textArea]}
                      placeholder="Describe your maintenance request in detail"
                      placeholderTextColor={theme.placeholderText}
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                      editable={!submitting}
                    />
                  </View>

                  <View style={dynamicStyles.inputGroup}>
                    <Text style={dynamicStyles.label}>Image (Optional)</Text>
                    {imageUri ? (
                      <View style={dynamicStyles.imageContainer}>
                        <Image source={{ uri: imageUri }} style={dynamicStyles.imagePreview} />
                        <TouchableOpacity
                          style={dynamicStyles.removeImageButton}
                          onPress={() => setImageUri(null)}
                          disabled={submitting}
                        >
                          <Text style={dynamicStyles.removeImageText}>Remove Image</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={dynamicStyles.imagePickerButton}
                        onPress={showImageSourcePicker}
                        disabled={submitting}
                      >
                        <Text style={dynamicStyles.imagePickerText}>Select Image</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[dynamicStyles.submitButton, submitting && dynamicStyles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={dynamicStyles.submitButtonText}>
                        {editingMaintenance ? 'Update Request' : 'Submit Request'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!canSubmitNew && !editingMaintenance && (
              <View style={dynamicStyles.infoBox}>
                <Text style={dynamicStyles.infoText}>
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
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalContent}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Select Maintenance Type</Text>
              <TouchableOpacity onPress={() => setShowTypeModal(false)}>
                <FontAwesome5 name="times" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {maintenanceTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[dynamicStyles.modalOption, maintenanceType === type && dynamicStyles.modalOptionSelected]}
                  onPress={() => {
                    setMaintenanceType(type);
                    setShowTypeModal(false);
                  }}
                >
                  <Text style={[dynamicStyles.modalOptionText, maintenanceType === type && dynamicStyles.modalOptionTextSelected]}>
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
