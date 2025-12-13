import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Alert, ActivityIndicator, Animated, Dimensions } from 'react-native';
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
          // Sort manually
          complaints.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bDate - aDate;
          });
          setUserComplaints(complaints);
          setLoadingComplaints(false);
        }, (error2) => {
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
          {/* User's Complaints List - Only show if there are active complaints */}
          {!loadingComplaints && userComplaints.length > 0 && (
            <>
              <Text style={styles.title}>My Complaints</Text>
              <View style={styles.complaintsList}>
                {userComplaints.map((complaint) => (
                  <View key={complaint.id} style={styles.complaintCard}>
                    <View style={styles.complaintHeader}>
                      <Text style={styles.complaintSubject}>{complaint.subject}</Text>
                      <View style={[styles.statusBadge, styles[`status${complaint.status.charAt(0).toUpperCase() + complaint.status.slice(1).replace('-', '')}`]]}>
                        <Text style={styles.statusText}>{complaint.status.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.complaintDescription} numberOfLines={3}>
                      {complaint.description}
                    </Text>
                    {complaint.imageURL && (
                      <Image source={{ uri: complaint.imageURL }} style={styles.complaintImage} />
                    )}
                    <View style={styles.complaintFooter}>
                      <Text style={styles.complaintDate}>
                        Submitted: {complaint.createdAt?.toDate ? complaint.createdAt.toDate().toLocaleDateString() : 'N/A'}
                      </Text>
                      {complaint.status === 'pending' && (
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => handleEdit(complaint)}
                          disabled={editingComplaint !== null}
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

          {/* Loading state */}
          {loadingComplaints && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1877F2" />
            </View>
          )}

          {/* Submit/Edit Form - Show if user can submit new or is editing */}
          {(canSubmitNew || editingComplaint) && (
            <View style={styles.formSection}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>
                  {editingComplaint ? 'Edit Complaint' : 'Submit a Complaint'}
                </Text>
                {editingComplaint && (
                  <TouchableOpacity
                    style={styles.cancelEditButton}
                    onPress={handleCancelEdit}
                  >
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.formDescription}>
                {editingComplaint ? 'Update your complaint details below' : 'Fill out the form below to submit your complaint'}
              </Text>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Subject *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter complaint subject"
                    value={subject}
                    onChangeText={setSubject}
                    editable={!submitting}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Description *</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe your complaint in detail"
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
                      {editingComplaint ? 'Update Complaint' : 'Submit Complaint'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Show message if user has an active complaint */}
          {!canSubmitNew && !editingComplaint && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                You have an active complaint. Please wait for it to be reviewed before submitting a new one. Once your complaint is resolved, you can submit a new one.
              </Text>
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
    backgroundColor: '#f9fafb',
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
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  complaintsList: {
    marginBottom: 24,
    gap: 12,
  },
  complaintCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
  complaintDescription: {
    fontSize: 14,
    color: '#374151',
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
});

