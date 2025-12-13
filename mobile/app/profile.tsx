import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { FontAwesome5 } from '@expo/vector-icons';
import { getAuthService, db } from '../firebase/config';

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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1877F2" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          
          {userData ? (
            <View style={styles.profileCard}>
              {/* Personal Information */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Personal Information</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Full Name:</Text>
                  <Text style={styles.value}>{getFullName()}</Text>
                </View>

                {userData.firstName && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>First Name:</Text>
                    <Text style={styles.value}>{userData.firstName}</Text>
                  </View>
                )}

                {userData.middleName && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Middle Name:</Text>
                    <Text style={styles.value}>{userData.middleName}</Text>
                  </View>
                )}

                {userData.lastName && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Last Name:</Text>
                    <Text style={styles.value}>{userData.lastName}</Text>
                  </View>
                )}

                {userData.email && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Email:</Text>
                    <Text style={styles.value}>{userData.email}</Text>
                  </View>
                )}

                {userData.phone && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Phone:</Text>
                    <Text style={styles.value}>{userData.phone}</Text>
                  </View>
                )}

                {userData.birthdate && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Birthdate:</Text>
                    <Text style={styles.value}>{formatDate(userData.birthdate)}</Text>
                  </View>
                )}

                {userData.age && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Age:</Text>
                    <Text style={styles.value}>{userData.age}</Text>
                  </View>
                )}

                {userData.sex && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Sex:</Text>
                    <Text style={styles.value}>{userData.sex}</Text>
                  </View>
                )}
              </View>

              {/* Address Information */}
              {userData.address && (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Address</Text>
                  
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Address:</Text>
                    <Text style={styles.value}>{getAddress()}</Text>
                  </View>

                  {userData.address.block && (
                    <View style={styles.infoRow}>
                      <Text style={styles.label}>Block:</Text>
                      <Text style={styles.value}>{userData.address.block}</Text>
                    </View>
                  )}

                  {userData.address.lot && (
                    <View style={styles.infoRow}>
                      <Text style={styles.label}>Lot:</Text>
                      <Text style={styles.value}>{userData.address.lot}</Text>
                    </View>
                  )}

                  {userData.address.street && (
                    <View style={styles.infoRow}>
                      <Text style={styles.label}>Street:</Text>
                      <Text style={styles.value}>{userData.address.street}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Tenant Information */}
              {userData.isTenant !== undefined && (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Tenant Information</Text>
                  
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Is Tenant:</Text>
                    <Text style={styles.value}>{userData.isTenant ? 'Yes' : 'No'}</Text>
                  </View>

                  {userData.isTenant && userData.tenantRelation && (
                    <View style={styles.infoRow}>
                      <Text style={styles.label}>Tenant Relation:</Text>
                      <Text style={styles.value}>{userData.tenantRelation}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* ID Images */}
              {(userData.idFront || userData.idBack) && (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>ID Images</Text>
                  
                  {userData.idFront && (
                    <View style={styles.imageContainer}>
                      <Text style={styles.imageLabel}>ID Front:</Text>
                      <Image 
                        source={{ uri: userData.idFront }} 
                        style={styles.idImage}
                        resizeMode="contain"
                      />
                    </View>
                  )}

                  {userData.idBack && (
                    <View style={styles.imageContainer}>
                      <Text style={styles.imageLabel}>ID Back:</Text>
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
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Documents</Text>
                  
                  {Object.entries(userData.documents).map(([key, value]) => (
                    <View key={key} style={styles.infoRow}>
                      <Text style={styles.label}>{key}:</Text>
                      <Text style={styles.value}>{value}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Account Information */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Account Information</Text>
                
                {userData.status && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Status:</Text>
                    <Text style={[styles.value, styles.statusValue]}>{userData.status}</Text>
                  </View>
                )}

                {userData.createdAt && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Account Created:</Text>
                    <Text style={styles.value}>{formatDate(userData.createdAt)}</Text>
                  </View>
                )}

                {userData.updatedAt && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>Last Updated:</Text>
                    <Text style={styles.value}>{formatDate(userData.updatedAt)}</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No profile data found</Text>
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
  content: {
    flex: 1,
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
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  profileCard: {
    gap: 16,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 8,
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
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: '#111827',
    flex: 2,
    textAlign: 'right',
  },
  statusValue: {
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  imageContainer: {
    marginBottom: 16,
  },
  imageLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
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
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
});

