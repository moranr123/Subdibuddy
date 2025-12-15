import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, Timestamp, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

interface Visitor {
  id: string;
  visitorName: string;
  visitorPhone: string;
  visitorPurpose: string;
  visitorDate: string;
  visitorTime: string;
  residentId: string;
  residentEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  gatePassVerified: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export default function VisitorPreRegistration() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorPurpose, setVisitorPurpose] = useState('');
  const [visitorDate, setVisitorDate] = useState('');
  const [visitorTime, setVisitorTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userVisitors, setUserVisitors] = useState<Visitor[]>([]);
  const [loadingVisitors, setLoadingVisitors] = useState(true);
  const [showRegistrationsModal, setShowRegistrationsModal] = useState(false);
  
  // Date and Time Picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [tempTime, setTempTime] = useState<{ hour: number; minute: number }>({ hour: 12, minute: 0 });

  // Get current user
  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
        setUser(currentUser);
        if (currentUser && db) {
          // Get user email from Firestore
          try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              setUserEmail(userData.email || currentUser.email || '');
            } else {
              setUserEmail(currentUser.email || '');
            }
          } catch (error) {
            console.error('Error fetching user data:', error);
            setUserEmail(currentUser.email || '');
          }
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Fetch user's visitor registrations
  useEffect(() => {
    if (!db || !user) {
      setUserVisitors([]);
      setLoadingVisitors(false);
      return;
    }

    setLoadingVisitors(true);
    
    const q = query(
      collection(db, 'visitors'),
      where('residentId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const visitors: Visitor[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        visitors.push({
          id: doc.id,
          ...data,
        } as Visitor);
      });
      setUserVisitors(visitors);
      setLoadingVisitors(false);
    }, (error: any) => {
      console.error('Error fetching visitors:', error);
      // If error is about missing index, try without orderBy
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(
          collection(db, 'visitors'),
          where('residentId', '==', user.uid)
        );
        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
          const visitors: Visitor[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            visitors.push({
              id: doc.id,
              ...data,
            } as Visitor);
          });
          // Sort by createdAt descending
          visitors.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bDate - aDate;
          });
          setUserVisitors(visitors);
          setLoadingVisitors(false);
        }, (error2: any) => {
          console.error('Error fetching visitors:', error2);
          setLoadingVisitors(false);
        });
        return () => unsubscribe2();
      } else {
        setLoadingVisitors(false);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    let cleaned = text.replace(/\D/g, '');
    
    // Limit to 11 digits
    if (cleaned.length > 11) {
      cleaned = cleaned.substring(0, 11);
    }
    
    // Format: 09XX-XXX-XXXX
    if (cleaned.length > 7) {
      return cleaned.substring(0, 4) + '-' + cleaned.substring(4, 7) + '-' + cleaned.substring(7);
    } else if (cleaned.length > 4) {
      return cleaned.substring(0, 4) + '-' + cleaned.substring(4);
    }
    return cleaned;
  };

  // Date Picker Helper Functions
  const getDaysInMonth = useCallback((year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  }, []);

  const getMonthOptions = useCallback(() => {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
  }, []);

  const getYearOptions = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    // Show current year and next 5 years for future dates
    for (let i = currentYear; i <= currentYear + 5; i++) {
      years.push(i);
    }
    return years;
  }, []);

  const formatDateForDisplay = useCallback((date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, []);

  const formatDateForStorage = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const formatTimeForDisplay = useCallback((hour: number, minute: number) => {
    const h = String(hour).padStart(2, '0');
    const m = String(minute).padStart(2, '0');
    return `${h}:${m}`;
  }, []);

  const formatTimeForStorage = useCallback((hour: number, minute: number) => {
    const h = String(hour).padStart(2, '0');
    const m = String(minute).padStart(2, '0');
    return `${h}:${m}`;
  }, []);

  const handleDatePickerOpen = useCallback(() => {
    if (visitorDate) {
      const [year, month, day] = visitorDate.split('-').map(Number);
      setTempDate(new Date(year, month - 1, day));
    } else {
      setTempDate(new Date());
    }
    setShowDatePicker(true);
  }, [visitorDate]);

  const handleDatePickerConfirm = useCallback(() => {
    const formattedDate = formatDateForStorage(tempDate);
    setVisitorDate(formattedDate);
    setShowDatePicker(false);
  }, [tempDate, formatDateForStorage]);

  const handleTimePickerOpen = useCallback(() => {
    if (visitorTime) {
      const [hour, minute] = visitorTime.split(':').map(Number);
      setTempTime({ hour, minute });
    } else {
      setTempTime({ hour: 12, minute: 0 });
    }
    setShowTimePicker(true);
  }, [visitorTime]);

  const handleTimePickerConfirm = useCallback(() => {
    const formattedTime = formatTimeForStorage(tempTime.hour, tempTime.minute);
    setVisitorTime(formattedTime);
    setShowTimePicker(false);
  }, [tempTime, formatTimeForStorage]);

  const getHourOptions = useCallback(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

  const getMinuteOptions = useCallback(() => {
    return Array.from({ length: 60 }, (_, i) => i);
  }, []);


  const submitVisitorRegistration = useCallback(async () => {
    if (!db || !user || !userEmail) {
      Alert.alert('Error', 'Please wait for authentication to complete.');
      return;
    }

    // Validation
    if (!visitorName.trim()) {
      Alert.alert('Validation Error', 'Please enter visitor name.');
      return;
    }

    if (!visitorPhone.trim()) {
      Alert.alert('Validation Error', 'Please enter visitor phone number.');
      return;
    }

    if (visitorPhone.replace(/\D/g, '').length < 10) {
      Alert.alert('Validation Error', 'Please enter a valid phone number (at least 10 digits).');
      return;
    }

    if (!visitorPurpose.trim()) {
      Alert.alert('Validation Error', 'Please enter the purpose of visit.');
      return;
    }

    if (!visitorDate.trim()) {
      Alert.alert('Validation Error', 'Please select visit date.');
      return;
    }

    if (!visitorTime.trim()) {
      Alert.alert('Validation Error', 'Please select visit time.');
      return;
    }

    setSubmitting(true);
    try {
      const visitorRef = await addDoc(collection(db, 'visitors'), {
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.replace(/\D/g, ''),
        visitorPurpose: visitorPurpose.trim(),
        visitorDate: visitorDate.trim(),
        visitorTime: visitorTime.trim(),
        residentId: user.uid,
        residentEmail: userEmail,
        status: 'pending',
        gatePassVerified: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Create notification for admins
      await addDoc(collection(db, 'notifications'), {
        type: 'visitor_registration',
        visitorId: visitorRef.id,
        userId: user.uid,
        userEmail: userEmail,
        subject: `New Visitor Registration: ${visitorName.trim()}`,
        message: `New visitor registration request: ${visitorName.trim()} visiting on ${visitorDate.trim()} at ${visitorTime.trim()}`,
        recipientType: 'admin',
        isRead: false,
        createdAt: Timestamp.now(),
      });

      Alert.alert(
        'Success',
        'Visitor pre-registration submitted successfully. Please wait for admin approval.',
        [{ text: 'OK', onPress: () => {
          // Reset form
          setVisitorName('');
          setVisitorPhone('');
          setVisitorPurpose('');
          setVisitorDate('');
          setVisitorTime('');
        }}]
      );
    } catch (error: any) {
      console.error('Error submitting visitor registration:', error);
      Alert.alert('Error', `Failed to submit visitor registration: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  }, [db, user, userEmail, visitorName, visitorPhone, visitorPurpose, visitorDate, visitorTime]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FFA500';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      default: return '#666666';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

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
    headerButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    keyboardAvoidingView: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    content: {
      padding: 20,
    },
    subtitle: {
      fontSize: 16,
      color: theme.textSecondary,
      marginBottom: 24,
    },
    formSection: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 20,
      marginBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 20,
    },
    inputGroup: {
      marginBottom: 16,
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
      color: theme.text,
      backgroundColor: theme.inputBackground,
    },
    textArea: {
      minHeight: 100,
      paddingTop: 12,
    },
    hint: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 4,
    },
    datePickerButton: {
      padding: 12,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 8,
      backgroundColor: theme.inputBackground,
    },
    datePickerText: {
      fontSize: 16,
      color: theme.text,
    },
    datePickerPlaceholder: {
      color: theme.placeholderText,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfWidth: {
      flex: 1,
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
    registrationsButton: {
      backgroundColor: theme.cardBackground,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
      marginTop: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    registrationsButtonText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500',
    },
    datePickerModal: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    datePickerModalContent: {
      backgroundColor: theme.cardBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    datePickerModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    datePickerModalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
    },
    datePickerModalClose: {
      padding: 4,
    },
    timePickerContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 20,
      marginVertical: 20,
    },
    timePickerColumn: {
      alignItems: 'center',
    },
    timePickerLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      marginBottom: 8,
    },
    timePickerValue: {
      fontSize: 32,
      fontWeight: '600',
      color: theme.text,
    },
    timePickerButtons: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    timePickerButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.inputBackground,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    confirmButton: {
      backgroundColor: '#1877F2',
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 20,
    },
    confirmButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    registrationsModalContainer: {
      flex: 1,
      backgroundColor: theme.background,
    },
    registrationsModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: theme.cardBackground,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    registrationsModalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
    },
    modalCloseButton: {
      padding: 4,
    },
    registrationsModalContent: {
      flex: 1,
    },
    registrationsModalScrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    visitorCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    visitorHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    visitorName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
    },
    visitorPhone: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    statusText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    registrationDetails: {
      gap: 8,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    detailText: {
      fontSize: 14,
      color: theme.textSecondary,
      flex: 1,
    },
    verifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    verifiedText: {
      fontSize: 14,
      color: '#4CAF50',
      fontWeight: '500',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      flex: 1,
    },
    modalCloseText: {
      fontSize: 24,
      color: theme.textSecondary,
      padding: 4,
    },
    datePickerModalContent: {
      backgroundColor: theme.cardBackground,
      borderRadius: 20,
      maxHeight: Math.min(height * 0.8, 600),
      width: '100%',
      maxWidth: Math.min(width * 0.9, 400),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 10,
    },
    datePickerContainer: {
      flexDirection: 'row',
      height: 300,
      padding: 16,
    },
    datePickerColumn: {
      flex: 1,
      marginHorizontal: 4,
    },
    datePickerLabel: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.textSecondary,
      marginBottom: 8,
      textAlign: 'center',
    },
    datePickerScroll: {
      flex: 1,
    },
    datePickerOption: {
      padding: 12,
      borderRadius: 8,
      marginBottom: 4,
      alignItems: 'center',
    },
    datePickerOptionSelected: {
      backgroundColor: '#1877F2',
    },
    datePickerOptionText: {
      fontSize: 14,
      color: theme.text,
    },
    datePickerOptionTextSelected: {
      color: '#ffffff',
      fontWeight: '500',
    },
    datePickerFooter: {
      flexDirection: 'row',
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: 12,
    },
    datePickerCancelButton: {
      flex: 1,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: theme.inputBackground,
    },
    datePickerCancelText: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '500',
    },
    datePickerConfirmButton: {
      flex: 1,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: '#1877F2',
    },
    datePickerConfirmText: {
      fontSize: 14,
      color: '#ffffff',
      fontWeight: '500',
    },
    registrationsSection: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: theme.textSecondary,
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.textSecondary,
      marginTop: 12,
    },
    emptySubtext: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 4,
    },
    registrationsList: {
      gap: 12,
    },
    registrationCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 16,
      backgroundColor: theme.inputBackground,
    },
    registrationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    registrationInfo: {
      flex: 1,
    },
    visitorCard: {
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
  }), [theme]);

  return (
    <View style={dynamicStyles.container}>
      {/* Header */}
      <View style={[dynamicStyles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={dynamicStyles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={dynamicStyles.headerTitle}>Visitor Pre-Registration</Text>
        <TouchableOpacity 
          onPress={() => setShowRegistrationsModal(true)}
          style={dynamicStyles.headerButton}
          activeOpacity={0.7}
        >
          <MaterialIcons name="list" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={dynamicStyles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={dynamicStyles.scrollView}
          contentContainerStyle={dynamicStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={dynamicStyles.content}>
            <Text style={dynamicStyles.subtitle}>Register your visitors in advance for easier access</Text>

          {/* Form Section */}
          <View style={dynamicStyles.formSection}>
            <Text style={dynamicStyles.sectionTitle}>Visitor Information</Text>

            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Visitor Name</Text>
              <TextInput
                style={dynamicStyles.input}
                placeholder="Enter visitor's full name"
                placeholderTextColor={theme.placeholderText}
                value={visitorName}
                onChangeText={setVisitorName}
                autoCapitalize="words"
              />
            </View>

            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Visitor Phone</Text>
              <TextInput
                style={dynamicStyles.input}
                placeholder="09XX-XXX-XXXX"
                placeholderTextColor={theme.placeholderText}
                value={visitorPhone}
                onChangeText={(text) => setVisitorPhone(formatPhoneNumber(text))}
                keyboardType="phone-pad"
                maxLength={13}
              />
            </View>

            <View style={dynamicStyles.inputGroup}>
              <Text style={dynamicStyles.label}>Purpose of Visit</Text>
              <TextInput
                style={[dynamicStyles.input, dynamicStyles.textArea]}
                placeholder="Describe the purpose of the visit"
                placeholderTextColor={theme.placeholderText}
                value={visitorPurpose}
                onChangeText={setVisitorPurpose}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={dynamicStyles.row}>
              <View style={[dynamicStyles.inputGroup, dynamicStyles.halfWidth]}>
                <Text style={dynamicStyles.label}>Visit Date</Text>
                <TouchableOpacity
                  style={dynamicStyles.datePickerButton}
                  onPress={handleDatePickerOpen}
                >
                  <Text style={[dynamicStyles.datePickerText, !visitorDate && dynamicStyles.datePickerPlaceholder]}>
                    {visitorDate ? (() => {
                      const [year, month, day] = visitorDate.split('-').map(Number);
                      return formatDateForDisplay(new Date(year, month - 1, day));
                    })() : 'Select visit date'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[dynamicStyles.inputGroup, dynamicStyles.halfWidth]}>
                <Text style={dynamicStyles.label}>Visit Time</Text>
                <TouchableOpacity
                  style={dynamicStyles.datePickerButton}
                  onPress={handleTimePickerOpen}
                >
                  <Text style={[dynamicStyles.datePickerText, !visitorTime && dynamicStyles.datePickerPlaceholder]}>
                    {visitorTime ? formatTimeForDisplay(parseInt(visitorTime.split(':')[0]), parseInt(visitorTime.split(':')[1])) : 'Select visit time'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[dynamicStyles.submitButton, submitting && dynamicStyles.submitButtonDisabled]}
              onPress={submitVisitorRegistration}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={dynamicStyles.submitButtonText}>Submit Registration</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity 
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={dynamicStyles.datePickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Select Visit Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={dynamicStyles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={dynamicStyles.datePickerContainer}>
              <View style={dynamicStyles.datePickerColumn}>
                <Text style={dynamicStyles.datePickerLabel}>Month</Text>
                <ScrollView style={dynamicStyles.datePickerScroll}>
                  {getMonthOptions().map((month, index) => (
                    <TouchableOpacity
                      key={month}
                      style={[
                        dynamicStyles.datePickerOption,
                        tempDate.getMonth() === index && dynamicStyles.datePickerOptionSelected
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
                        dynamicStyles.datePickerOptionText,
                        tempDate.getMonth() === index && dynamicStyles.datePickerOptionTextSelected
                      ]}>
                        {month}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={dynamicStyles.datePickerColumn}>
                <Text style={dynamicStyles.datePickerLabel}>Day</Text>
                <ScrollView style={dynamicStyles.datePickerScroll}>
                  {Array.from({ length: getDaysInMonth(tempDate.getFullYear(), tempDate.getMonth()) }, (_, i) => i + 1).map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        dynamicStyles.datePickerOption,
                        tempDate.getDate() === day && dynamicStyles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        const newDate = new Date(tempDate);
                        newDate.setDate(day);
                        setTempDate(newDate);
                      }}
                    >
                      <Text style={[
                        dynamicStyles.datePickerOptionText,
                        tempDate.getDate() === day && dynamicStyles.datePickerOptionTextSelected
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={dynamicStyles.datePickerColumn}>
                <Text style={dynamicStyles.datePickerLabel}>Year</Text>
                <ScrollView style={dynamicStyles.datePickerScroll}>
                  {getYearOptions().map((year) => (
                    <TouchableOpacity
                      key={year}
                      style={[
                        dynamicStyles.datePickerOption,
                        tempDate.getFullYear() === year && dynamicStyles.datePickerOptionSelected
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
                        dynamicStyles.datePickerOptionText,
                        tempDate.getFullYear() === year && dynamicStyles.datePickerOptionTextSelected
                      ]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={dynamicStyles.datePickerFooter}>
              <TouchableOpacity
                style={dynamicStyles.datePickerCancelButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={dynamicStyles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.datePickerConfirmButton}
                onPress={handleDatePickerConfirm}
              >
                <Text style={dynamicStyles.datePickerConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <TouchableOpacity 
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTimePicker(false)}
        >
          <View style={dynamicStyles.datePickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={dynamicStyles.modalHeader}>
              <Text style={dynamicStyles.modalTitle}>Select Visit Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={dynamicStyles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={dynamicStyles.datePickerContainer}>
              <View style={dynamicStyles.datePickerColumn}>
                <Text style={dynamicStyles.datePickerLabel}>Hour</Text>
                <ScrollView style={dynamicStyles.datePickerScroll}>
                  {getHourOptions().map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[
                        dynamicStyles.datePickerOption,
                        tempTime.hour === hour && dynamicStyles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        setTempTime({ ...tempTime, hour });
                      }}
                    >
                      <Text style={[
                        dynamicStyles.datePickerOptionText,
                        tempTime.hour === hour && dynamicStyles.datePickerOptionTextSelected
                      ]}>
                        {String(hour).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={dynamicStyles.datePickerColumn}>
                <Text style={dynamicStyles.datePickerLabel}>Minute</Text>
                <ScrollView style={dynamicStyles.datePickerScroll}>
                  {getMinuteOptions().map((minute) => (
                    <TouchableOpacity
                      key={minute}
                      style={[
                        dynamicStyles.datePickerOption,
                        tempTime.minute === minute && dynamicStyles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        setTempTime({ ...tempTime, minute });
                      }}
                    >
                      <Text style={[
                        dynamicStyles.datePickerOptionText,
                        tempTime.minute === minute && dynamicStyles.datePickerOptionTextSelected
                      ]}>
                        {String(minute).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={dynamicStyles.datePickerFooter}>
              <TouchableOpacity
                style={dynamicStyles.datePickerCancelButton}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={dynamicStyles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.datePickerConfirmButton}
                onPress={handleTimePickerConfirm}
              >
                <Text style={dynamicStyles.datePickerConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Registrations Modal */}
      <Modal
        visible={showRegistrationsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRegistrationsModal(false)}
      >
        <View style={dynamicStyles.registrationsModalContainer}>
          <View style={[dynamicStyles.registrationsModalHeader, { paddingTop: insets.top + 16 }]}>
            <Text style={dynamicStyles.registrationsModalTitle}>My Visitor Registrations</Text>
            <TouchableOpacity 
              onPress={() => setShowRegistrationsModal(false)}
              style={dynamicStyles.modalCloseButton}
            >
              <MaterialIcons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          <ScrollView 
            style={dynamicStyles.registrationsModalContent}
            contentContainerStyle={dynamicStyles.registrationsModalScrollContent}
          >
            {loadingVisitors ? (
              <View style={dynamicStyles.loadingContainer}>
                <ActivityIndicator size="large" color="#1877F2" />
                <Text style={dynamicStyles.loadingText}>Loading registrations...</Text>
              </View>
            ) : userVisitors.length === 0 ? (
              <View style={dynamicStyles.emptyContainer}>
                <MaterialIcons name="person-add" size={48} color={theme.textSecondary} />
                <Text style={dynamicStyles.emptyText}>No visitor registrations yet</Text>
                <Text style={dynamicStyles.emptySubtext}>Submit a form above to register a visitor</Text>
              </View>
            ) : (
              <View style={dynamicStyles.registrationsList}>
                {userVisitors.map((visitor) => (
                  <View key={visitor.id} style={dynamicStyles.registrationCard}>
                    <View style={dynamicStyles.registrationHeader}>
                      <View style={dynamicStyles.registrationInfo}>
                        <Text style={dynamicStyles.visitorName}>{visitor.visitorName}</Text>
                        <Text style={dynamicStyles.visitorPhone}>{visitor.visitorPhone}</Text>
                      </View>
                      <View style={[dynamicStyles.statusBadge, { backgroundColor: getStatusColor(visitor.status) }]}>
                        <Text style={dynamicStyles.statusText}>{getStatusText(visitor.status)}</Text>
                      </View>
                    </View>
                    
                    <View style={dynamicStyles.registrationDetails}>
                      <View style={dynamicStyles.detailRow}>
                        <MaterialIcons name="phone" size={16} color={theme.textSecondary} />
                        <Text style={dynamicStyles.detailText}>{visitor.visitorPhone}</Text>
                      </View>
                      <View style={dynamicStyles.detailRow}>
                        <MaterialIcons name="event" size={16} color={theme.textSecondary} />
                        <Text style={dynamicStyles.detailText}>{visitor.visitorDate} at {visitor.visitorTime}</Text>
                      </View>
                      <View style={dynamicStyles.detailRow}>
                        <MaterialIcons name="description" size={16} color={theme.textSecondary} />
                        <Text style={dynamicStyles.detailText} numberOfLines={2}>{visitor.visitorPurpose}</Text>
                      </View>
                      <View style={dynamicStyles.detailRow}>
                        <MaterialIcons name="schedule" size={16} color={theme.textSecondary} />
                        <Text style={dynamicStyles.detailText}>Submitted: {formatDate(visitor.createdAt)}</Text>
                      </View>
                    </View>

                    {visitor.status === 'approved' && visitor.gatePassVerified && (
                      <View style={dynamicStyles.verifiedBadge}>
                        <MaterialIcons name="verified" size={16} color="#4CAF50" />
                        <Text style={dynamicStyles.verifiedText}>Gate Pass Verified</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
