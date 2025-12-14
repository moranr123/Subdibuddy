import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, Timestamp, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';

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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visitor Pre-Registration</Text>
        <TouchableOpacity 
          onPress={() => setShowRegistrationsModal(true)}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <MaterialIcons name="list" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <Text style={styles.subtitle}>Register your visitors in advance for easier access</Text>

          {/* Form Section */}
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Visitor Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Visitor Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter visitor's full name"
                value={visitorName}
                onChangeText={setVisitorName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Visitor Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="09XX-XXX-XXXX"
                value={visitorPhone}
                onChangeText={(text) => setVisitorPhone(formatPhoneNumber(text))}
                keyboardType="phone-pad"
                maxLength={13}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Purpose of Visit *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe the purpose of the visit"
                value={visitorPurpose}
                onChangeText={setVisitorPurpose}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Visit Date *</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={handleDatePickerOpen}
                >
                  <Text style={[styles.datePickerText, !visitorDate && styles.datePickerPlaceholder]}>
                    {visitorDate ? (() => {
                      const [year, month, day] = visitorDate.split('-').map(Number);
                      return formatDateForDisplay(new Date(year, month - 1, day));
                    })() : 'Select visit date'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Visit Time *</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={handleTimePickerOpen}
                >
                  <Text style={[styles.datePickerText, !visitorTime && styles.datePickerPlaceholder]}>
                    {visitorTime ? formatTimeForDisplay(parseInt(visitorTime.split(':')[0]), parseInt(visitorTime.split(':')[1])) : 'Select visit time'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={submitVisitorRegistration}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Registration</Text>
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
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={styles.datePickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Visit Date</Text>
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
            <View style={styles.datePickerFooter}>
              <TouchableOpacity
                style={styles.datePickerCancelButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.datePickerConfirmButton}
                onPress={handleDatePickerConfirm}
              >
                <Text style={styles.datePickerConfirmText}>Confirm</Text>
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
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTimePicker(false)}
        >
          <View style={styles.datePickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Visit Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>Hour</Text>
                <ScrollView style={styles.datePickerScroll}>
                  {getHourOptions().map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[
                        styles.datePickerOption,
                        tempTime.hour === hour && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        setTempTime({ ...tempTime, hour });
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempTime.hour === hour && styles.datePickerOptionTextSelected
                      ]}>
                        {String(hour).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerLabel}>Minute</Text>
                <ScrollView style={styles.datePickerScroll}>
                  {getMinuteOptions().map((minute) => (
                    <TouchableOpacity
                      key={minute}
                      style={[
                        styles.datePickerOption,
                        tempTime.minute === minute && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        setTempTime({ ...tempTime, minute });
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempTime.minute === minute && styles.datePickerOptionTextSelected
                      ]}>
                        {String(minute).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.datePickerFooter}>
              <TouchableOpacity
                style={styles.datePickerCancelButton}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.datePickerConfirmButton}
                onPress={handleTimePickerConfirm}
              >
                <Text style={styles.datePickerConfirmText}>Confirm</Text>
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
        <View style={styles.registrationsModalContainer}>
          <View style={[styles.registrationsModalHeader, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.registrationsModalTitle}>My Visitor Registrations</Text>
            <TouchableOpacity 
              onPress={() => setShowRegistrationsModal(false)}
              style={styles.modalCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#111827" />
            </TouchableOpacity>
          </View>
          <ScrollView 
            style={styles.registrationsModalContent}
            contentContainerStyle={styles.registrationsModalScrollContent}
          >
            {loadingVisitors ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1877F2" />
                <Text style={styles.loadingText}>Loading registrations...</Text>
              </View>
            ) : userVisitors.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="person-add" size={48} color="#9CA3AF" />
                <Text style={styles.emptyText}>No visitor registrations yet</Text>
                <Text style={styles.emptySubtext}>Submit a form above to register a visitor</Text>
              </View>
            ) : (
              <View style={styles.registrationsList}>
                {userVisitors.map((visitor) => (
                  <View key={visitor.id} style={styles.registrationCard}>
                    <View style={styles.registrationHeader}>
                      <View style={styles.registrationInfo}>
                        <Text style={styles.visitorName}>{visitor.visitorName}</Text>
                        <Text style={styles.visitorPhone}>{visitor.visitorPhone}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(visitor.status) }]}>
                        <Text style={styles.statusText}>{getStatusText(visitor.status)}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.registrationDetails}>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="phone" size={16} color="#6B7280" />
                        <Text style={styles.detailText}>{visitor.visitorPhone}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="event" size={16} color="#6B7280" />
                        <Text style={styles.detailText}>{visitor.visitorDate} at {visitor.visitorTime}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="description" size={16} color="#6B7280" />
                        <Text style={styles.detailText} numberOfLines={2}>{visitor.visitorPurpose}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MaterialIcons name="schedule" size={16} color="#6B7280" />
                        <Text style={styles.detailText}>Submitted: {formatDate(visitor.createdAt)}</Text>
                      </View>
                    </View>

                    {visitor.status === 'approved' && visitor.gatePassVerified && (
                      <View style={styles.verifiedBadge}>
                        <MaterialIcons name="verified" size={16} color="#4CAF50" />
                        <Text style={styles.verifiedText}>Gate Pass Verified</Text>
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
  headerButton: {
    padding: 8,
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
    color: '#6B7280',
    marginBottom: 24,
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  datePickerButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  datePickerText: {
    fontSize: 16,
    color: '#111827',
  },
  datePickerPlaceholder: {
    color: '#9CA3AF',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
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
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  modalCloseText: {
    fontSize: 24,
    color: '#6b7280',
    padding: 4,
  },
  datePickerModalContent: {
    backgroundColor: '#ffffff',
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
    color: '#6b7280',
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
    backgroundColor: '#111827',
  },
  datePickerOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  datePickerOptionTextSelected: {
    color: '#ffffff',
    fontWeight: '500',
  },
  datePickerFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  datePickerCancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  datePickerCancelText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  datePickerConfirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  datePickerConfirmText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#1877F2',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  registrationsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  registrationsList: {
    gap: 12,
  },
  registrationCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#F9FAFB',
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
  visitorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  visitorPhone: {
    fontSize: 14,
    color: '#6B7280',
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
    color: '#6B7280',
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  verifiedText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  registrationsModalContainer: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  registrationsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  registrationsModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
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
});
