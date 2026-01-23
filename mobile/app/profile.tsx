import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, Timestamp, collection, addDoc, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { FontAwesome5 } from '@expo/vector-icons';
import { getAuthService, db } from '../firebase/config';
import { useTheme } from '../contexts/ThemeContext';

interface UserData {
  id: string;
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthdate?: any;
  age?: number;
  sex?: string;
  address?: {
    block?: string;
    lot?: string;
    street?: string;
  };
  isTenant?: boolean;
  tenantRelation?: string;
  idFront?: string;
  idBack?: string;
  documents?: Record<string, string>;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
}

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  
  // Edit form state
  const [editFirstName, setEditFirstName] = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSex, setEditSex] = useState<'male' | 'female' | ''>('');
  const [editBirthdate, setEditBirthdate] = useState<Date | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSexPicker, setShowSexPicker] = useState(false);

  // Calculate age from birthdate
  const calculateAge = useCallback((date: Date) => {
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    return age;
  }, []);

  // Parse birthdate from Firestore timestamp
  const parseBirthdate = useCallback((timestamp: any): Date | null => {
    if (!timestamp) return null;
    try {
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
      if (timestamp instanceof Date) {
        return timestamp;
      }
      return new Date(timestamp);
    } catch (error) {
      return null;
    }
  }, []);

  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
        setUser(currentUser);
        if (currentUser && db) {
          try {
            setLoading(true);
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              setUserData({
                id: userDoc.id,
                ...data,
              } as UserData);
              
              // Initialize edit form with current data
              setEditFirstName(data.firstName || '');
              setEditMiddleName(data.middleName || '');
              setEditLastName(data.lastName || '');
              setEditPhone(data.phone || '');
              setEditEmail(data.email || '');
              setEditSex((data.sex as 'male' | 'female' | '') || '');
              const bdate = parseBirthdate(data.birthdate);
              setEditBirthdate(bdate);
              if (bdate) {
                setTempDate(bdate);
              }

            }
          } catch (error) {
            console.error('Error fetching user data:', error);
          } finally {
            setLoading(false);
          }
        } else {
          setUserData(null);
          setLoading(false);
        }
      });
      return () => unsubscribe();
    }
  }, [parseBirthdate]);

  // Set up real-time listener for pending profile edit requests
  useEffect(() => {
    if (!user || !db) {
      setPendingRequest(null);
      return;
    }

    try {
      const pendingQuery = query(
        collection(db, 'profileEditRequests'),
        where('userId', '==', user.uid),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      // Use onSnapshot for real-time updates
      const unsubscribePending = onSnapshot(
        pendingQuery,
        (snapshot) => {
          if (!snapshot.empty) {
            setPendingRequest(snapshot.docs[0].data());
          } else {
            setPendingRequest(null);
          }
        },
        (error) => {
          console.error('Error listening to pending requests:', error);
          setPendingRequest(null);
        }
      );
      
      return () => {
        unsubscribePending();
      };
    } catch (error) {
      console.error('Error setting up pending requests listener:', error);
      setPendingRequest(null);
    }
  }, [user, db]);

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

  const getFullName = () => {
    if (userData?.fullName) return userData.fullName;
    const parts = [userData?.firstName, userData?.middleName, userData?.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'N/A';
  };

  const getAddress = () => {
    if (!userData?.address) return 'N/A';
    const parts = [
      userData.address.block ? `Block ${userData.address.block}` : null,
      userData.address.lot ? `Lot ${userData.address.lot}` : null,
      userData.address.street,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  };

  // Date picker helpers
  const getMonthOptions = () => {
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  };

  const getYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 100; i--) {
      years.push(i);
    }
    return years;
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const handleDatePickerConfirm = useCallback(() => {
    setEditBirthdate(new Date(tempDate));
    setShowDatePicker(false);
  }, [tempDate]);

  // Save profile changes - submit for admin approval
  const handleSave = useCallback(async () => {
    if (!user || !db || !userData) return;

    // Check if there's already a pending request
    if (pendingRequest) {
      Alert.alert(
        'Pending Request',
        'You already have a pending profile edit request. Please wait for admin approval before submitting a new request.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Validation
    if (!editFirstName.trim()) {
      Alert.alert('Validation Error', 'First name is required');
      return;
    }
    if (!editLastName.trim()) {
      Alert.alert('Validation Error', 'Last name is required');
      return;
    }
    if (editPhone && editPhone.trim()) {
      const cleanedPhone = editPhone.replace(/[\s\-\(\)]/g, '');
      if (!/^\d{10,11}$/.test(cleanedPhone)) {
        Alert.alert('Validation Error', 'Please enter a valid phone number (10-11 digits)');
        return;
      }
    }
    if (editEmail && editEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(editEmail.trim())) {
        Alert.alert('Validation Error', 'Please enter a valid email address');
        return;
      }
    }

    setSaving(true);
    try {
      // Prepare the requested changes
      const requestedChanges: any = {
        firstName: editFirstName.trim(),
        middleName: editMiddleName.trim() || null,
        lastName: editLastName.trim(),
        fullName: `${editFirstName.trim()} ${editMiddleName.trim() ? editMiddleName.trim() + ' ' : ''}${editLastName.trim()}`.trim(),
      };

      if (editPhone.trim()) {
        requestedChanges.phone = editPhone.trim();
      }
      if (editEmail.trim()) {
        requestedChanges.email = editEmail.trim();
      }
      if (editSex) {
        requestedChanges.sex = editSex;
      }
      if (editBirthdate) {
        requestedChanges.birthdate = Timestamp.fromDate(editBirthdate);
        requestedChanges.age = calculateAge(editBirthdate);
      }

      // Create profile edit request
      const requestRef = await addDoc(collection(db, 'profileEditRequests'), {
        userId: user.uid,
        userEmail: userData.email || user.email || '',
        userName: userData.fullName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        currentData: {
          firstName: userData.firstName,
          middleName: userData.middleName,
          lastName: userData.lastName,
          fullName: userData.fullName,
          phone: userData.phone,
          email: userData.email,
          sex: userData.sex,
          birthdate: userData.birthdate,
          age: userData.age,
        },
        requestedChanges: requestedChanges,
        status: 'pending',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Create notification for admins
      await addDoc(collection(db, 'notifications'), {
        type: 'profile_edit_request',
        profileEditRequestId: requestRef.id,
        userId: user.uid,
        userEmail: userData.email || user.email || '',
        subject: `Profile Edit Request from ${userData.fullName || 'User'}`,
        message: `New profile edit request submitted. Please review and approve or reject.`,
        recipientType: 'admin',
        isRead: false,
        createdAt: Timestamp.now(),
      });

      // Update pending request state
      setPendingRequest({
        id: requestRef.id,
        ...requestedChanges,
        status: 'pending',
        createdAt: Timestamp.now(),
      });

      setIsEditMode(false);
      Alert.alert(
        'Request Submitted',
        'Your profile edit request has been submitted for admin approval. You will be notified once it is reviewed.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error submitting profile edit request:', error);
      Alert.alert('Error', `Failed to submit profile edit request: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [user, db, userData, editFirstName, editMiddleName, editLastName, editPhone, editEmail, editSex, editBirthdate, calculateAge, pendingRequest]);

  const handleCancel = useCallback(() => {
    // Reset form to original values
    if (userData) {
      setEditFirstName(userData.firstName || '');
      setEditMiddleName(userData.middleName || '');
      setEditLastName(userData.lastName || '');
      setEditPhone(userData.phone || '');
      setEditEmail(userData.email || '');
      setEditSex((userData.sex as 'male' | 'female' | '') || '');
      const bdate = parseBirthdate(userData.birthdate);
      setEditBirthdate(bdate);
      if (bdate) {
        setTempDate(bdate);
      }
    }
    setIsEditMode(false);
  }, [userData, parseBirthdate]);

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
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#ffffff',
      flex: 1,
      textAlign: 'center',
    },
    content: {
      flex: 1,
    },
    sectionCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingBottom: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.textSecondary,
      flex: 1,
    },
    value: {
      fontSize: 14,
      color: theme.text,
      flex: 2,
      textAlign: 'right',
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    imageLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.textSecondary,
      marginBottom: 8,
    },
  }), [theme]);

  if (loading) {
    return (
      <View style={dynamicStyles.container}>
        <View style={[dynamicStyles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1877F2" />
        </View>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      {/* Header */}
      <View style={[dynamicStyles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Profile</Text>
        {userData && !isEditMode && (
          <TouchableOpacity 
            onPress={() => setIsEditMode(true)}
            style={styles.editButton}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="edit" size={18} color="#ffffff" />
          </TouchableOpacity>
        )}
        {isEditMode && (
          <View style={styles.headerActions}>
            <TouchableOpacity 
              onPress={handleCancel}
              style={styles.cancelButton}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={handleSave}
              style={styles.saveButton}
              activeOpacity={0.7}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        {!isEditMode && !userData && <View style={styles.headerSpacer} />}
      </View>

      <ScrollView style={dynamicStyles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          
          {userData ? (
            <View style={styles.profileCard}>
              {/* Pending Request Banner */}
              {pendingRequest && (
                <View style={styles.pendingBanner}>
                  <FontAwesome5 name="clock" size={16} color="#FFA500" />
                  <Text style={styles.pendingBannerText}>
                    You have a pending profile edit request awaiting admin approval.
                  </Text>
                </View>
              )}
              
              {/* Personal Information */}
              <View style={dynamicStyles.sectionCard}>
                <Text style={dynamicStyles.sectionTitle}>Personal Information</Text>
                
                {!isEditMode ? (
                  <>
                    <View style={styles.infoRow}>
                      <Text style={dynamicStyles.label}>Full Name:</Text>
                      <Text style={dynamicStyles.value}>{getFullName()}</Text>
                    </View>

                    {userData.firstName && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>First Name:</Text>
                        <Text style={dynamicStyles.value}>{userData.firstName}</Text>
                      </View>
                    )}

                    {userData.middleName && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>Middle Name:</Text>
                        <Text style={dynamicStyles.value}>{userData.middleName}</Text>
                      </View>
                    )}

                    {userData.lastName && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>Last Name:</Text>
                        <Text style={dynamicStyles.value}>{userData.lastName}</Text>
                      </View>
                    )}

                    {userData.email && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>Email:</Text>
                        <Text style={dynamicStyles.value}>{userData.email}</Text>
                      </View>
                    )}

                    {userData.phone && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>Phone:</Text>
                        <Text style={dynamicStyles.value}>{userData.phone}</Text>
                      </View>
                    )}

                    {userData.birthdate && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>Birthdate:</Text>
                        <Text style={dynamicStyles.value}>{formatDate(userData.birthdate)}</Text>
                      </View>
                    )}

                    {userData.age && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>Age:</Text>
                        <Text style={dynamicStyles.value}>{userData.age}</Text>
                      </View>
                    )}

                    {userData.sex && (
                      <View style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>Sex:</Text>
                        <Text style={dynamicStyles.value}>{userData.sex}</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.editFormGroup}>
                      <Text style={styles.editLabel}>First Name *</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editFirstName}
                        onChangeText={setEditFirstName}
                        placeholder="Enter first name"
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormGroup}>
                      <Text style={styles.editLabel}>Middle Name</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editMiddleName}
                        onChangeText={setEditMiddleName}
                        placeholder="Enter middle name (optional)"
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormGroup}>
                      <Text style={styles.editLabel}>Last Name *</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editLastName}
                        onChangeText={setEditLastName}
                        placeholder="Enter last name"
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormGroup}>
                      <Text style={styles.editLabel}>Email</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editEmail}
                        onChangeText={setEditEmail}
                        placeholder="Enter email address"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormGroup}>
                      <Text style={styles.editLabel}>Phone</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editPhone}
                        onChangeText={setEditPhone}
                        placeholder="Enter phone number"
                        keyboardType="phone-pad"
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormGroup}>
                      <Text style={styles.editLabel}>Sex</Text>
                      <TouchableOpacity
                        style={styles.editPickerButton}
                        onPress={() => setShowSexPicker(true)}
                      >
                        <Text style={[styles.editPickerText, !editSex && styles.editPickerPlaceholder]}>
                          {editSex ? editSex.charAt(0).toUpperCase() + editSex.slice(1) : 'Select sex'}
                        </Text>
                        <Text style={styles.pickerIcon}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.editFormGroup}>
                      <Text style={styles.editLabel}>Birthdate</Text>
                      <TouchableOpacity
                        style={styles.editPickerButton}
                        onPress={() => {
                          if (editBirthdate) {
                            setTempDate(editBirthdate);
                          }
                          setShowDatePicker(true);
                        }}
                      >
                        <Text style={[styles.editPickerText, !editBirthdate && styles.editPickerPlaceholder]}>
                          {editBirthdate ? editBirthdate.toLocaleDateString() : 'Select birthdate'}
                        </Text>
                        <Text style={styles.pickerIcon}>▼</Text>
                      </TouchableOpacity>
                      {editBirthdate && (
                        <Text style={styles.ageText}>Age: {calculateAge(editBirthdate)}</Text>
                      )}
                    </View>
                  </>
                )}
              </View>

              {/* Address Information */}
              {userData.address && (
                <View style={dynamicStyles.sectionCard}>
                  <Text style={dynamicStyles.sectionTitle}>Address</Text>
                  
                  <View style={styles.infoRow}>
                    <Text style={dynamicStyles.label}>Address:</Text>
                    <Text style={dynamicStyles.value}>{getAddress()}</Text>
                  </View>

                  {userData.address.block && (
                    <View style={styles.infoRow}>
                      <Text style={dynamicStyles.label}>Block:</Text>
                      <Text style={dynamicStyles.value}>{userData.address.block}</Text>
                    </View>
                  )}

                  {userData.address.lot && (
                    <View style={styles.infoRow}>
                      <Text style={dynamicStyles.label}>Lot:</Text>
                      <Text style={dynamicStyles.value}>{userData.address.lot}</Text>
                    </View>
                  )}

                  {userData.address.street && (
                    <View style={styles.infoRow}>
                      <Text style={dynamicStyles.label}>Street:</Text>
                      <Text style={dynamicStyles.value}>{userData.address.street}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Tenant Information */}
              {userData.isTenant !== undefined && (
                <View style={dynamicStyles.sectionCard}>
                  <Text style={dynamicStyles.sectionTitle}>Tenant Information</Text>
                  
                  <View style={styles.infoRow}>
                    <Text style={dynamicStyles.label}>Is Tenant:</Text>
                    <Text style={dynamicStyles.value}>{userData.isTenant ? 'Yes' : 'No'}</Text>
                  </View>

                  {userData.isTenant && userData.tenantRelation && (
                    <View style={styles.infoRow}>
                      <Text style={dynamicStyles.label}>Tenant Relation:</Text>
                      <Text style={dynamicStyles.value}>{userData.tenantRelation}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* ID Images */}
              {(userData.idFront || userData.idBack) && (
                <View style={dynamicStyles.sectionCard}>
                  <Text style={dynamicStyles.sectionTitle}>ID Images</Text>
                  
                  {userData.idFront && (
                    <View style={styles.imageContainer}>
                      <Text style={dynamicStyles.imageLabel}>ID Front:</Text>
                      <Image 
                        source={{ uri: userData.idFront }} 
                        style={styles.idImage}
                        resizeMode="contain"
                      />
                    </View>
                  )}

                  {userData.idBack && (
                    <View style={styles.imageContainer}>
                      <Text style={dynamicStyles.imageLabel}>ID Back:</Text>
                      <Image 
                        source={{ uri: userData.idBack }} 
                        style={styles.idImage}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Documents */}
              {userData.documents && Object.keys(userData.documents).length > 0 && (
                <View style={dynamicStyles.sectionCard}>
                  <Text style={dynamicStyles.sectionTitle}>Documents</Text>
                  
                  {Object.entries(userData.documents).map(([key, value]) => (
                    value && typeof value === 'string' && value.startsWith('http') ? (
                      <View key={key} style={styles.imageContainer}>
                        <Text style={dynamicStyles.imageLabel}>
                          {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}:
                        </Text>
                        <Image 
                          source={{ uri: value }} 
                          style={styles.idImage}
                          resizeMode="contain"
                          onError={(error) => {
                            console.error(`Error loading document image ${key}:`, error);
                          }}
                        />
                      </View>
                    ) : (
                      <View key={key} style={styles.infoRow}>
                        <Text style={dynamicStyles.label}>
                          {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}:
                        </Text>
                        <Text style={dynamicStyles.value}>{value || 'N/A'}</Text>
                      </View>
                    )
                  ))}
                </View>
              )}

              {/* Account Information */}
              <View style={dynamicStyles.sectionCard}>
                <Text style={dynamicStyles.sectionTitle}>Account Information</Text>
                
                {userData.status && (
                  <View style={styles.infoRow}>
                    <Text style={dynamicStyles.label}>Status:</Text>
                    <Text style={[dynamicStyles.value, styles.statusValue]}>{userData.status}</Text>
                  </View>
                )}

                {userData.createdAt && (
                  <View style={styles.infoRow}>
                    <Text style={dynamicStyles.label}>Account Created:</Text>
                    <Text style={dynamicStyles.value}>{formatDate(userData.createdAt)}</Text>
                  </View>
                )}

                {userData.updatedAt && (
                  <View style={styles.infoRow}>
                    <Text style={dynamicStyles.label}>Last Updated:</Text>
                    <Text style={dynamicStyles.value}>{formatDate(userData.updatedAt)}</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={dynamicStyles.emptyText}>No profile data found</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={styles.datePickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Birthdate</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>Month</Text>
                <ScrollView style={styles.datePickerScroll}>
                  {getMonthOptions().map((month, index) => (
                    <TouchableOpacity
                      key={month}
                      style={[
                        styles.datePickerOption,
                        tempDate.getMonth() === index && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        const newDate = new Date(tempDate);
                        newDate.setMonth(index);
                        const daysInMonth = getDaysInMonth(newDate.getFullYear(), index);
                        if (newDate.getDate() > daysInMonth) {
                          newDate.setDate(daysInMonth);
                        }
                        setTempDate(newDate);
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempDate.getMonth() === index && styles.datePickerOptionTextSelected
                      ]}>
                        {month}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>Day</Text>
                <ScrollView style={styles.datePickerScroll}>
                  {Array.from({ length: getDaysInMonth(tempDate.getFullYear(), tempDate.getMonth()) }, (_, i) => i + 1).map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.datePickerOption,
                        tempDate.getDate() === day && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        const newDate = new Date(tempDate);
                        newDate.setDate(day);
                        setTempDate(newDate);
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempDate.getDate() === day && styles.datePickerOptionTextSelected
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>Year</Text>
                <ScrollView style={styles.datePickerScroll}>
                  {getYearOptions().map((year) => (
                    <TouchableOpacity
                      key={year}
                      style={[
                        styles.datePickerOption,
                        tempDate.getFullYear() === year && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        const newDate = new Date(tempDate);
                        newDate.setFullYear(year);
                        const daysInMonth = getDaysInMonth(year, newDate.getMonth());
                        if (newDate.getDate() > daysInMonth) {
                          newDate.setDate(daysInMonth);
                        }
                        setTempDate(newDate);
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempDate.getFullYear() === year && styles.datePickerOptionTextSelected
                      ]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleDatePickerConfirm}
              >
                <Text style={styles.modalButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sex Picker Modal */}
      <Modal
        visible={showSexPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSexPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSexPicker(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Sex</Text>
              <TouchableOpacity onPress={() => setShowSexPicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setEditSex('male');
                  setShowSexPicker(false);
                }}
              >
                <Text style={styles.modalOptionText}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setEditSex('female');
                  setShowSexPicker(false);
                }}
              >
                <Text style={styles.modalOptionText}>Female</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  headerSpacer: {
    width: 36,
  },
  editButton: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  contentContainer: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    padding: 20,
  },
  profileCard: {
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  statusValue: {
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  imageContainer: {
    marginBottom: 16,
  },
  idImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  // Edit form styles
  editFormGroup: {
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#000',
  },
  editPickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  editPickerText: {
    fontSize: 16,
    color: '#000',
  },
  editPickerPlaceholder: {
    color: '#999',
  },
  pickerIcon: {
    fontSize: 12,
    color: '#666',
  },
  ageText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginLeft: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '80%',
    maxHeight: '70%',
    overflow: 'hidden',
  },
  datePickerModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  modalCloseText: {
    fontSize: 24,
    color: '#666',
  },
  modalScrollView: {
    maxHeight: 300,
  },
  modalOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#000',
  },
  datePickerContainer: {
    flexDirection: 'row',
    height: 300,
  },
  datePickerColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  datePickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  datePickerScroll: {
    flex: 1,
  },
  datePickerOption: {
    padding: 12,
    alignItems: 'center',
  },
  datePickerOptionSelected: {
    backgroundColor: '#1877F2',
  },
  datePickerOptionText: {
    fontSize: 14,
    color: '#000',
  },
  datePickerOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalButton: {
    backgroundColor: '#1877F2',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    borderColor: '#FFA500',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  pendingBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
});

