import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuthService } from '../firebase/config';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const authInstance = getAuthService();
    
    if (!authInstance) {
      // If auth is not available, redirect to login
      router.replace('/login');
      return;
    }

    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      if (user) {
        // User is authenticated - redirect to login for now
        // (You can change this to your main screen when you create it)
        router.replace('/login');
      } else {
        // User is not authenticated, redirect to login
        router.replace('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Show loading screen while checking auth state
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1877F2" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});


