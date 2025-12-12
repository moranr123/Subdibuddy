import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Modal, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { getAuthService, db } from '../firebase/config';
import { WebView } from 'react-native-webview';

const { width, height } = Dimensions.get('window');

interface Location {
  latitude: number;
  longitude: number;
}

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [showFullMap, setShowFullMap] = useState(false);
  const fullMapWebViewRef = useRef<WebView>(null);
  const router = useRouter();

  const mapHTML = useMemo(() => {
    const lat = location?.latitude || 14.5995;
    const lng = location?.longitude || 120.9842;
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            body { margin: 0; padding: 0; }
            #map { width: 100%; height: 100vh; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            const map = L.map('map').setView([${lat}, ${lng}], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors',
              maxZoom: 19
            }).addTo(map);
            
            let marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);
            
            marker.on('dragend', function(e) {
              const pos = marker.getLatLng();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'location',
                latitude: pos.lat,
                longitude: pos.lng
              }));
            });
            
            map.on('click', function(e) {
              marker.setLatLng(e.latlng);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'location',
                latitude: e.latlng.lat,
                longitude: e.latlng.lng
              }));
            });
          </script>
        </body>
      </html>
    `;
  }, [location]);

  const smallMapHTML = useMemo(() => {
    const lat = location?.latitude || 14.5995;
    const lng = location?.longitude || 120.9842;
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            body { margin: 0; padding: 0; }
            #map { width: 100%; height: 100%; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            const map = L.map('map').setView([${lat}, ${lng}], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors',
              maxZoom: 19
            }).addTo(map);
            
            L.marker([${lat}, ${lng}]).addTo(map);
          </script>
        </body>
      </html>
    `;
  }, [location]);

  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'location') {
        setLocation({
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    } catch (error) {
      console.error('Error parsing map message:', error);
    }
  }, []);

  const handleSignUp = useCallback(async () => {
    if (!fullName.trim() || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (!acceptedTerms) {
      Alert.alert('Error', 'Please accept the terms and conditions');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Please select your location on the map');
      return;
    }

    const authInstance = getAuthService();
    if (!authInstance) {
      Alert.alert('Error', 'Authentication service is not available');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(authInstance, email.trim(), password);
      const user = userCredential.user;
      
      if (db && user && location) {
        await setDoc(doc(db, 'users', user.uid), {
          fullName: fullName.trim(),
          email: email.trim(),
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      Alert.alert('Success', 'Account created successfully!', [
        {
          text: 'OK',
          onPress: () => router.replace('/dashboard'),
        },
      ]);
    } catch (error: any) {
      let errorMessage = 'An error occurred during signup';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      } else if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Signup Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fullName, email, password, confirmPassword, acceptedTerms, location, router, db]);

  const isButtonDisabled = useMemo(() => {
    return !fullName.trim() || !email || !password || !confirmPassword || !acceptedTerms || !location || loading;
  }, [fullName, email, password, confirmPassword, acceptedTerms, location, loading]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.card}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>S</Text>
        </View>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Sign up to get started</Text>

        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              placeholderTextColor="#999"
              editable={!loading}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your.email@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
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

          <View style={styles.formGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                placeholderTextColor="#999"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                <Text style={styles.eyeIcon}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Select Your Location</Text>
            <TouchableOpacity
              style={styles.mapContainer}
              onPress={() => setShowFullMap(true)}
              disabled={loading}
            >
              <WebView
                source={{ html: smallMapHTML }}
                style={styles.smallMap}
                scrollEnabled={false}
                zoomEnabled={false}
                pointerEvents="none"
              />
              <View style={styles.mapOverlay}>
                <Text style={styles.mapOverlayText}>Tap to select location</Text>
              </View>
            </TouchableOpacity>
            {location && (
              <Text style={styles.locationText}>
                Location: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </Text>
            )}
          </View>

          <View style={styles.checkboxContainer}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setAcceptedTerms(!acceptedTerms)}
              disabled={loading}
            >
              <Text style={styles.checkboxIcon}>{acceptedTerms ? '✓' : ''}</Text>
            </TouchableOpacity>
            <Text style={styles.checkboxLabel}>
              I accept the terms and conditions
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isButtonDisabled && styles.submitButtonDisabled]}
            onPress={handleSignUp}
            disabled={isButtonDisabled}
          >
            {loading ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.submitButtonText}>Creating account...</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.push('/login')}
            disabled={loading}
          >
            <Text style={styles.loginLinkText}>
              Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showFullMap}
        animationType="slide"
        onRequestClose={() => setShowFullMap(false)}
      >
        <View style={styles.fullMapContainer}>
          <View style={styles.fullMapHeader}>
            <Text style={styles.fullMapTitle}>Select Your Location</Text>
            <TouchableOpacity
              style={styles.fullMapCloseButton}
              onPress={() => setShowFullMap(false)}
            >
              <Text style={styles.fullMapCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <WebView
            ref={fullMapWebViewRef}
            source={{ html: mapHTML }}
            style={styles.fullMap}
            onMessage={handleMapMessage}
          />
          <View style={styles.fullMapFooter}>
            <TouchableOpacity
              style={[styles.confirmButton, !location && styles.confirmButtonDisabled]}
              onPress={() => {
                if (location) {
                  setShowFullMap(false);
                }
              }}
              disabled={!location}
            >
              <Text style={styles.confirmButtonText}>Confirm Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: width > 400 ? 32 : 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
    maxWidth: 500,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '400',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 14,
  },
  form: {
    width: '100%',
    gap: 20,
  },
  formGroup: {
    gap: 8,
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
  mapContainer: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d1d5db',
    position: 'relative',
  },
  smallMap: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  mapOverlayText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '400',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 8,
    borderRadius: 8,
  },
  locationText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxIcon: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '500',
  },
  checkboxLabel: {
    flex: 1,
    color: '#374151',
    fontSize: 14,
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
  loginLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  loginLinkText: {
    color: '#6b7280',
    fontSize: 14,
  },
  loginLinkBold: {
    color: '#111827',
    fontWeight: '500',
  },
  fullMapContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  fullMapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  fullMapTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#111827',
  },
  fullMapCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullMapCloseText: {
    fontSize: 20,
    color: '#6b7280',
  },
  fullMap: {
    flex: 1,
  },
  fullMapFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  confirmButton: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '400',
  },
});

