import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const authInstance = getAuthService();
    
    if (!authInstance) {
      // If auth is not available, redirect to login
      router.replace('/login');
      return;
    }

    const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
      if (user) {
        // Check if user account is deactivated
        if (db) {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData.status === 'deactivated') {
                // User account is deactivated, sign them out
                await signOut(authInstance);
                Alert.alert(
                  'Account Deactivated',
                  'Your account has been deactivated. Please contact the administrator for assistance.'
                );
                router.replace('/login');
                setLoading(false);
                return;
              }
            }
          } catch (error) {
            console.error('Error checking user status:', error);
          }
        }
        // User is authenticated and active, redirect to dashboard
        router.replace('/dashboard');
      } else {
        // User is not authenticated, redirect to login
        router.replace('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
});

