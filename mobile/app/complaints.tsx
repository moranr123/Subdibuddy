import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator, Animated, Dimensions } from 'react-native';
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
import { useTheme } from '../contexts/ThemeContext';

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

export default function Complaints() {
  const router = useRouter();
  const { theme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(-Dimensions.get('window').width)).current;
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userComplaints, setUserComplaints] = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [editingComplaint, setEditingComplaint] = useState<Complaint | null>(null);
  const { unreadCount } = useNotifications();

  // Check if user has an active complaint (pending or in-progress)
  // Users can submit new complaint if all complaints are resolved
  const hasActiveComplaint = userComplaints.some(c => c.status === 'pending' || c.status === 'in-progress');
  const canSubmitNew = !hasActiveComplaint;

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

  // Fetch user's complaints
  useEffect(() => {
    if (!db || !user) {
      setUserComplaints([]);
      setLoadingComplaints(false);
      return;
    }

    setLoadingComplaints(true);
    
    // Try with orderBy first
    const q = query(
      collection(db, 'complaints'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const complaints: Complaint[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const complaint = {
          id: doc.id,
          ...data,
        } as Complaint;
        // Only include complaints that are pending or in-progress (exclude resolved and rejected)
        if (complaint.status === 'pending' || complaint.status === 'in-progress') {
          complaints.push(complaint);
        }
      });
      setUserComplaints(complaints);
      setLoadingComplaints(false);
    }, (error: any) => {
      console.error('Error fetching complaints:', error);
      // If error is about missing index, try without orderBy
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(
          collection(db, 'complaints'),
          where('userId', '==', user.uid)
        );
        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
          const complaints: Complaint[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            const complaint = {
              id: doc.id,
              ...data,
            } as Complaint;
            // Only include complaints that are pending or in-progress (exclude resolved and rejected)
            if (complaint.status === 'pending' || complaint.status === 'in-progress') {
              complaints.push(complaint);
            }
          });
          // Sort manually by createdAt descending
          complaints.sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
          });
          setUserComplaints(complaints);
          setLoadingComplaints(false);
        }, (error2: any) => {
          console.error('Error fetching complaints (fallback):', error2);
          setLoadingComplaints(false);
        });
        return () => unsubscribe2();
      } else {
        setLoadingComplaints(false);
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

  const handleEdit = useCallback((complaint: Complaint) => {
    // Only allow editing if complaint is pending
    if (complaint.status === 'pending') {
      setEditingComplaint(complaint);
      setSubject(complaint.subject);
      setDescription(complaint.description);
      setImageUri(complaint.imageURL || null);
    } else {
      Alert.alert('Cannot Edit', 'You can only edit complaints that are pending.');
    }
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingComplaint(null);
    setSubject('');
    setDescription('');
    setImageUri(null);
  }, []);

  const submitComplaint = useCallback(async () => {
    if (!user || !db) return;

    setSubmitting(true);

    try {
      let imageURL: string | null = null;

      // Upload image if selected (and it's a new image, not the existing one)
      if (imageUri) {
        // Check if it's a new image (starts with file://) or existing URL (starts with http)
        if (imageUri.startsWith('file://') || imageUri.startsWith('content://')) {
          // New image, upload it
          const imagePath = `complaints/${user.uid}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
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

      if (editingComplaint) {
        // Update existing complaint
        await updateDoc(doc(db, 'complaints', editingComplaint.id), {
          subject: subject.trim(),
          description: description.trim(),
          imageURL: imageURL || editingComplaint.imageURL || null,
          updatedAt: Timestamp.now(),
        });

        // Create notification for admins about the update
        await addDoc(collection(db, 'notifications'), {
          type: 'complaint',
          complaintId: editingComplaint.id,
          userId: user.uid,
          userEmail: user.email || '',
          subject: subject.trim(),
          message: `Complaint updated: ${subject.trim()}`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        // Clear form and exit edit mode
        setSubject('');
        setDescription('');
        setImageUri(null);
        setEditingComplaint(null);

        Alert.alert(
          'Complaint Updated',
          'Your complaint has been updated successfully.',
          [{ text: 'OK' }]
        );
      } else {
        // Create new complaint
        const complaintRef = await addDoc(collection(db, 'complaints'), {
          subject: subject.trim(),
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
          type: 'complaint',
          complaintId: complaintRef.id,
          userId: user.uid,
          userEmail: user.email || '',
          subject: subject.trim(),
          message: `New complaint submitted: ${subject.trim()}`,
          recipientType: 'admin',
          isRead: false,
          createdAt: Timestamp.now(),
        });

        // Clear form
        setSubject('');
        setDescription('');
        setImageUri(null);

        Alert.alert(
          'Complaint Submitted',
          'Your complaint has been submitted successfully. It will be reviewed by an admin.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('Error submitting complaint:', error);
      Alert.alert('Error', `Failed to submit complaint: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  }, [subject, description, imageUri, user, db, uploadImageToStorage, editingComplaint]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmitNew && !editingComplaint) {
      Alert.alert('Cannot Submit', 'You have an active complaint. Please wait for it to be reviewed before submitting a new one.');
      return;
    }

    if (!subject.trim()) {
      Alert.alert('Validation Error', 'Please enter a subject for your complaint.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Validation Error', 'Please enter a description for your complaint.');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'You must be logged in to submit a complaint.');
      return;
    }

    if (!db) {
      Alert.alert('Error', 'Database connection error. Please try again.');
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      editingComplaint ? 'Update Complaint' : 'Submit Complaint',
      editingComplaint 
        ? 'Are you sure you want to update this complaint?'
        : 'Are you sure you want to submit this complaint? It will be reviewed by an admin.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: editingComplaint ? 'Update' : 'Submit',
          onPress: async () => {
            await submitComplaint();
          },
        },
      ]
    );
  }, [canSubmitNew, editingComplaint, subject, description, user, db, submitComplaint]);

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
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
    emptyContainer: {
      padding: 20,
      alignItems: 'center',
      backgroundColor: theme.cardBackground,
      borderRadius: 8,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: theme.border,
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    complaintsList: {
      marginBottom: 24,
      gap: 12,
    },
    complaintCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: 8,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    complaintHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    complaintSubject: {
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
    complaintDescription: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 8,
      lineHeight: 20,
    },
    complaintImage: {
      width: '100%',
      height: 150,
      borderRadius: 8,
      marginBottom: 8,
    },
    complaintFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
    },
    complaintDate: {
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
    formGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.text,
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.inputBackground,
      color: theme.text,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
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
    imageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.cardBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    imageButtonText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 8,
    },
    submitButton: {
      backgroundColor: '#1877F2',
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
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
    removeImageButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: '#ef4444',
      borderRadius: 6,
      alignItems: 'center',
    },
    removeImageText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '500',
    },
    imagePickerButton: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.cardBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
    },
    imagePickerText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500',
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
      <ScrollView style={dynamicStyles.content} contentContainerStyle={dynamicStyles.contentContainer}>
        <View style={dynamicStyles.section}>
          {/* User's Complaints List - Only show if there are active complaints */}
          {!loadingComplaints && userComplaints.length > 0 && (
            <>
              <Text style={dynamicStyles.title}>My Complaints</Text>
              <View style={dynamicStyles.complaintsList}>
                {userComplaints.map((complaint) => (
                  <View key={complaint.id} style={dynamicStyles.complaintCard}>
                    <View style={dynamicStyles.complaintHeader}>
                      <Text style={dynamicStyles.complaintSubject}>{complaint.subject}</Text>
                      <View style={[dynamicStyles.statusBadge, dynamicStyles[`status${complaint.status.charAt(0).toUpperCase() + complaint.status.slice(1).replace('-', '')}`]]}>
                        <Text style={dynamicStyles.statusText}>{complaint.status.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={dynamicStyles.complaintDescription} numberOfLines={3}>
                      {complaint.description}
                    </Text>
                    {complaint.imageURL && (
                      <Image source={{ uri: complaint.imageURL }} style={dynamicStyles.complaintImage} />
                    )}
                    <View style={dynamicStyles.complaintFooter}>
                      <Text style={dynamicStyles.complaintDate}>
                        Submitted: {complaint.createdAt?.toDate ? complaint.createdAt.toDate().toLocaleDateString() : 'N/A'}
                      </Text>
                      {complaint.status === 'pending' && (
                        <TouchableOpacity
                          style={dynamicStyles.editButton}
                          onPress={() => handleEdit(complaint)}
                          disabled={editingComplaint !== null}
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

          {/* Loading state */}
          {loadingComplaints && (
            <View style={dynamicStyles.loadingContainer}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          )}

          {/* Submit/Edit Form - Show if user can submit new or is editing */}
          {(canSubmitNew || editingComplaint) && (
            <View style={dynamicStyles.formSection}>
              <View style={dynamicStyles.formHeader}>
                <Text style={dynamicStyles.formTitle}>
                  {editingComplaint ? 'Edit Complaint' : 'Submit a Complaint'}
                </Text>
                {editingComplaint && (
                  <TouchableOpacity
                    style={dynamicStyles.cancelEditButton}
                    onPress={handleCancelEdit}
                  >
                    <Text style={dynamicStyles.cancelEditText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={dynamicStyles.description}>
                {editingComplaint ? 'Update your complaint details below' : 'Fill out the form below to submit your complaint'}
              </Text>

              <View>
                <View style={dynamicStyles.formGroup}>
                  <Text style={dynamicStyles.label}>Subject</Text>
                  <TextInput
                    style={dynamicStyles.input}
                    placeholder="Enter complaint subject"
                    placeholderTextColor={theme.placeholderText}
                    value={subject}
                    onChangeText={setSubject}
                    editable={!submitting}
                  />
                </View>

                <View style={dynamicStyles.formGroup}>
                  <Text style={dynamicStyles.label}>Description</Text>
                  <TextInput
                    style={[dynamicStyles.input, dynamicStyles.textArea]}
                    placeholder="Describe your complaint in detail"
                    placeholderTextColor={theme.placeholderText}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    editable={!submitting}
                  />
                </View>

                <View style={dynamicStyles.formGroup}>
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
                      {editingComplaint ? 'Update Complaint' : 'Submit Complaint'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Show message if user has an active complaint */}
          {!canSubmitNew && !editingComplaint && (
            <View style={dynamicStyles.infoBox}>
              <Text style={dynamicStyles.infoText}>
                You have an active complaint. Please wait for it to be reviewed before submitting a new one. Once your complaint is resolved, you can submit a new one.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
