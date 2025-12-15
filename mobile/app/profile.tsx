import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
              setUserData({
                id: userDoc.id,
                ...userDoc.data(),
              } as UserData);
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
  }, []);

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
      {/* Back Button */}
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

      <ScrollView style={dynamicStyles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          
          {userData ? (
            <View style={styles.profileCard}>
              {/* Personal Information */}
              <View style={dynamicStyles.sectionCard}>
                <Text style={dynamicStyles.sectionTitle}>Personal Information</Text>
                
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
});

