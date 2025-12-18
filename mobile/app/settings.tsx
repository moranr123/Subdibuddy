import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, Linking, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState, useEffect } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import Constants from 'expo-constants';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDarkMode, toggleDarkMode, theme } = useTheme();
  const [appVersion] = useState(Constants.expoConfig?.version || '1.0.0');
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isHomeowner, setIsHomeowner] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<'available' | 'unavailable'>('unavailable');
  const [loadingAvailability, setLoadingAvailability] = useState(false);

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
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 16,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 16,
      backgroundColor: theme.cardBackground,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    settingItemLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    settingIcon: {
      marginRight: 12,
    },
    settingText: {
      flex: 1,
    },
    settingTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.text,
      marginBottom: 4,
    },
    settingDescription: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    settingArrow: {
      marginLeft: 8,
    },
  }), [theme, isDarkMode]);

  // Fetch user data and check if homeowner
  useEffect(() => {
    const authInstance = getAuthService();
    if (authInstance) {
      const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
        setUser(currentUser);
        if (currentUser && db) {
          try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              setUserData(data);
              // Check if user is a homeowner (not a tenant)
              const isTenant = data.residentType === 'tenant' || data.isTenant === true;
              setIsHomeowner(!isTenant);
              // Get availability status from Firestore - preserve the last saved state
              // Only use default 'unavailable' if the field doesn't exist at all
              const savedStatus = data.availabilityStatus;
              if (savedStatus === 'available' || savedStatus === 'unavailable') {
                setAvailabilityStatus(savedStatus);
              } else {
                // If field doesn't exist, default to 'unavailable' but also save it
                setAvailabilityStatus('unavailable');
                // Optionally save the default to Firestore for consistency
                try {
                  await updateDoc(doc(db, 'users', currentUser.uid), {
                    availabilityStatus: 'unavailable',
                  });
                } catch (updateError) {
                  console.error('Error setting default availability status:', updateError);
                }
              }
            }
          } catch (error) {
            console.error('Error fetching user data:', error);
          }
        } else {
          // User logged out - reset state
          setUserData(null);
          setIsHomeowner(false);
          // Don't reset availabilityStatus here - it will be set when user logs back in
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const handleToggleAvailability = async (value: boolean) => {
    if (!user || !db || loadingAvailability) return;

    const newStatus: 'available' | 'unavailable' = value ? 'available' : 'unavailable';
    setLoadingAvailability(true);

    try {
      // Update Firestore first to ensure persistence
      await updateDoc(doc(db, 'users', user.uid), {
        availabilityStatus: newStatus,
      });
      // Update local state after successful Firestore update
      setAvailabilityStatus(newStatus);
      // Also update userData to keep it in sync
      if (userData) {
        setUserData({ ...userData, availabilityStatus: newStatus });
      }
      Alert.alert(
        'Status Updated',
        `Your marker is now ${newStatus === 'available' ? 'green (available)' : 'blue (unavailable)'} on the map.`
      );
    } catch (error) {
      console.error('Error updating availability status:', error);
      Alert.alert('Error', 'Failed to update availability status. Please try again.');
      // Revert state if update failed
      const currentStatus = userData?.availabilityStatus || 'unavailable';
      setAvailabilityStatus(currentStatus);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.error('Error opening link:', err);
      Alert.alert('Error', 'Could not open the link.');
    });
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Contact Support',
      'For support, please contact your building administrator or email support@subdibuddy.com',
      [
        {
          text: 'Email Support',
          onPress: () => handleOpenLink('mailto:support@subdibuddy.com'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

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
        <Text style={dynamicStyles.headerTitle}>Settings</Text>
        <View style={dynamicStyles.headerSpacer} />
      </View>

      <ScrollView style={dynamicStyles.content} contentContainerStyle={dynamicStyles.contentContainer}>
        {/* Appearance Section */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Appearance</Text>
          
          <View style={dynamicStyles.settingItem}>
            <View style={dynamicStyles.settingItemLeft}>
              <MaterialIcons 
                name={isDarkMode ? 'dark-mode' : 'light-mode'} 
                size={24} 
                color={theme.text} 
                style={dynamicStyles.settingIcon}
              />
              <View style={dynamicStyles.settingText}>
                <Text style={dynamicStyles.settingTitle}>Dark Mode</Text>
                <Text style={dynamicStyles.settingDescription}>
                  {isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: '#d1d5db', true: '#1877F2' }}
              thumbColor={isDarkMode ? '#ffffff' : '#ffffff'}
            />
          </View>
        </View>

        {/* Availability Section - Only for Homeowners */}
        {isHomeowner && (
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>Map Availability</Text>
            
            <View style={dynamicStyles.settingItem}>
              <View style={dynamicStyles.settingItemLeft}>
                <MaterialIcons 
                  name={availabilityStatus === 'available' ? 'location-on' : 'location-off'} 
                  size={24} 
                  color={availabilityStatus === 'available' ? '#4CAF50' : '#2196F3'} 
                  style={dynamicStyles.settingIcon}
                />
                <View style={dynamicStyles.settingText}>
                  <Text style={dynamicStyles.settingTitle}>Available on Map</Text>
                  <Text style={dynamicStyles.settingDescription}>
                    {availabilityStatus === 'available' 
                      ? 'Green marker (available)' 
                      : 'Blue marker (unavailable)'}
                  </Text>
                </View>
              </View>
              {loadingAvailability ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Switch
                  value={availabilityStatus === 'available'}
                  onValueChange={handleToggleAvailability}
                  trackColor={{ false: '#d1d5db', true: '#4CAF50' }}
                  thumbColor={availabilityStatus === 'available' ? '#ffffff' : '#ffffff'}
                />
              )}
            </View>
          </View>
        )}

        {/* Privacy & Security Section */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Privacy & Security</Text>
          
          <TouchableOpacity 
            style={dynamicStyles.settingItem}
            onPress={() => Alert.alert('Privacy Policy', 'Privacy policy content will be displayed here.')}
            activeOpacity={0.7}
          >
            <View style={dynamicStyles.settingItemLeft}>
              <MaterialIcons 
                name="privacy-tip" 
                size={24} 
                color={theme.text} 
                style={dynamicStyles.settingIcon}
              />
              <View style={dynamicStyles.settingText}>
                <Text style={dynamicStyles.settingTitle}>Privacy Policy</Text>
                <Text style={dynamicStyles.settingDescription}>
                  Read our privacy policy
                </Text>
              </View>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={theme.textSecondary} 
            />
          </TouchableOpacity>

          <TouchableOpacity 
            style={dynamicStyles.settingItem}
            onPress={() => Alert.alert('Terms of Service', 'Terms of service content will be displayed here.')}
            activeOpacity={0.7}
          >
            <View style={dynamicStyles.settingItemLeft}>
              <MaterialIcons 
                name="description" 
                size={24} 
                color={theme.text} 
                style={dynamicStyles.settingIcon}
              />
              <View style={dynamicStyles.settingText}>
                <Text style={dynamicStyles.settingTitle}>Terms of Service</Text>
                <Text style={dynamicStyles.settingDescription}>
                  Read our terms and conditions
                </Text>
              </View>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={theme.textSecondary} 
            />
          </TouchableOpacity>
        </View>

        {/* Support Section */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Support</Text>
          
          <TouchableOpacity 
            style={dynamicStyles.settingItem}
            onPress={handleContactSupport}
            activeOpacity={0.7}
          >
            <View style={dynamicStyles.settingItemLeft}>
              <MaterialIcons 
                name="help" 
                size={24} 
                color={theme.text} 
                style={dynamicStyles.settingIcon}
              />
              <View style={dynamicStyles.settingText}>
                <Text style={dynamicStyles.settingTitle}>Help & Support</Text>
                <Text style={dynamicStyles.settingDescription}>
                  Get help and contact support
                </Text>
              </View>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={theme.textSecondary} 
            />
          </TouchableOpacity>

          <TouchableOpacity 
            style={dynamicStyles.settingItem}
            onPress={() => Alert.alert('About', `Subdibuddy\nVersion ${appVersion}\n\nA resident management application for modern communities.`)}
            activeOpacity={0.7}
          >
            <View style={dynamicStyles.settingItemLeft}>
              <MaterialIcons 
                name="info" 
                size={24} 
                color={theme.text} 
                style={dynamicStyles.settingIcon}
              />
              <View style={dynamicStyles.settingText}>
                <Text style={dynamicStyles.settingTitle}>About</Text>
                <Text style={dynamicStyles.settingDescription}>
                  App version and information
                </Text>
              </View>
            </View>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={theme.textSecondary} 
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

