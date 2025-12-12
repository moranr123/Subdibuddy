import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Dimensions, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';

const { width } = Dimensions.get('window');

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const authInstance = getAuthService();
    if (!authInstance) {
      Alert.alert('Error', 'Authentication service is not available');
      return;
    }

    setLoading(true);
    try {
      const trimmedInput = email.trim();
      const hasAtSymbol = trimmedInput.includes('@');
      
      // Validate phone number format if it's not an email
      if (!hasAtSymbol) {
        // Remove spaces, dashes, and parentheses for validation
        const cleanedPhone = trimmedInput.replace(/[\s\-\(\)]/g, '');
        // Check if it's all digits and has reasonable length (at least 10 digits)
        if (!/^\d+$/.test(cleanedPhone) || cleanedPhone.length < 10) {
          Alert.alert('Invalid Input', 'Please enter a valid email address or phone number (at least 10 digits)');
          setLoading(false);
          return;
        }
      }
      
      // Format the username: if it's a phone number, append @subdibuddy.local
      // This matches the format used during signup
      const username = hasAtSymbol ? trimmedInput : `${trimmedInput}@subdibuddy.local`;
      
      const userCredential = await signInWithEmailAndPassword(authInstance, username, password);
      const user = userCredential.user;

      // Check if user is in pendingUsers collection (not approved yet)
      if (db && user) {
        const pendingUserDoc = await getDoc(doc(db, 'pendingUsers', user.uid));
        if (pendingUserDoc.exists()) {
          // User is still pending approval
          await signOut(authInstance);
          Alert.alert(
            'Account Pending Approval',
            'Your account is pending admin approval. Please wait for approval before logging in.'
          );
          return;
        }
        
        // Check if user exists in users collection (approved)
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          // User doesn't exist in either collection (might have been rejected)
          await signOut(authInstance);
          Alert.alert(
            'Account Not Found',
            'Your account is not found. Please contact the administrator for assistance.'
          );
          return;
        }
        
        // Check if user account is deactivated
        const userData = userDoc.data();
        if (userData.status === 'deactivated') {
          // User account is deactivated
          await signOut(authInstance);
          Alert.alert(
            'Account Deactivated',
            'Your account has been deactivated. Please contact the administrator for assistance.'
          );
          return;
        }
      }

      router.replace('/dashboard');
    } catch (error: any) {
      let errorMessage = 'An error occurred during login';
      if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address or phone number format';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email or phone number';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email/phone number or password';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection';
      } else if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image 
          source={require('../assets/logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Email or Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="your.email@example.com or 09XX XXX XXXX"
              value={email}
              onChangeText={setEmail}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#999"
              editable={!loading}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholderTextColor="#999"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Text style={styles.eyeIcon}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.submitButtonText}>Signing in...</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signupLink}
            onPress={() => router.push('/signup')}
            disabled={loading}
          >
            <Text style={styles.signupLinkText}>
              Don't have an account? <Text style={styles.signupLinkBold}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: width > 400 ? 32 : 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  logo: {
    width: width > 400 ? 200 : 160,
    height: width > 400 ? 80 : 64,
    marginBottom: 24,
  },
  subtitle: {
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    fontSize: 14,
  },
  form: {
    width: '100%',
    gap: 16,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    color: '#374151',
    fontWeight: '400',
    fontSize: 14,
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  passwordContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    paddingRight: 60,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  eyeButton: {
    position: 'absolute',
    right: 8,
    padding: 6,
  },
  eyeIcon: {
    fontSize: 14,
    color: '#6b7280',
  },
  submitButton: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '400',
  },
  signupLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  signupLinkText: {
    color: '#6b7280',
    fontSize: 14,
  },
  signupLinkBold: {
    color: '#111827',
    fontWeight: '500',
  },
});

