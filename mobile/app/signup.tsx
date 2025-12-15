import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Modal, Dimensions, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, setDoc, Timestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 375;
const isMediumScreen = width >= 375 && width < 414;
const isLargeScreen = width >= 414;

interface IDImages {
  front: string | null;
  back: string | null;
}

interface DocumentImages {
  [key: string]: string | null;
}

const TOTAL_STEPS = 5;

export default function Signup() {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Step 1: Email/Phone and Password
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [isEmail, setIsEmail] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Step 2: Personal Info
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [age, setAge] = useState<number | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [showSexPicker, setShowSexPicker] = useState(false);
  
  // Step 3: Address
  const [block, setBlock] = useState('');
  const [lot, setLot] = useState('');
  const [street, setStreet] = useState('');
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState(false);
  const [showStreetPicker, setShowStreetPicker] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const mapWebViewRef = useRef<WebView>(null);
  
  // Step 4: Resident Type and ID
  const [residentType, setResidentType] = useState<'tenant' | 'homeowner' | null>(null);
  const [tenantRelation, setTenantRelation] = useState('');
  const [showRelationPicker, setShowRelationPicker] = useState(false);
  const [waterBillingDate, setWaterBillingDate] = useState<Date | null>(null);
  const [electricBillingDate, setElectricBillingDate] = useState<Date | null>(null);
  const [activeBillingType, setActiveBillingType] = useState<'water' | 'electricity' | null>(null);
  const [showBillingDatePicker, setShowBillingDatePicker] = useState(false);
  const [tempBillingDate, setTempBillingDate] = useState<Date>(new Date());
  const [billingProofImage, setBillingProofImage] = useState<string | null>(null);
  const [idImages, setIdImages] = useState<IDImages>({ front: null, back: null });
  const [documentImages, setDocumentImages] = useState<DocumentImages>({});
  
  // Step 5: Terms
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  // Error states
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Other
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Calculate age from birthdate
  const calculateAge = useCallback((date: Date) => {
    const today = new Date();
    let calculatedAge = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      calculatedAge--;
    }
    return calculatedAge;
  }, []);

  const handleDateChange = useCallback((selectedDate: Date) => {
    setBirthdate(selectedDate);
    const calculatedAge = calculateAge(selectedDate);
    setAge(calculatedAge);
    setShowDatePicker(false);
  }, [calculateAge]);

  const handleDatePickerOpen = useCallback(() => {
    setTempDate(birthdate || new Date());
    setShowDatePicker(true);
  }, [birthdate]);

  const handleDatePickerConfirm = useCallback(() => {
    handleDateChange(tempDate);
  }, [tempDate, handleDateChange]);

  const handleBillingDateChange = useCallback((selectedDate: Date) => {
    if (activeBillingType === 'water') {
      setWaterBillingDate(selectedDate);
    } else if (activeBillingType === 'electricity') {
      setElectricBillingDate(selectedDate);
    }
    setShowBillingDatePicker(false);
    setActiveBillingType(null);
  }, [activeBillingType]);

  const handleBillingDatePickerConfirm = useCallback(() => {
    handleBillingDateChange(tempBillingDate);
  }, [tempBillingDate, handleBillingDateChange]);

  // Fetch device location when map opens
  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Location permission not granted');
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (position?.coords) {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      } catch (err) {
        console.warn('Failed to fetch location', err);
      }
    };

    if (showMapModal) {
      fetchLocation();
    }
  }, [showMapModal]);

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
    for (let i = currentYear; i >= currentYear - 100; i--) {
      years.push(i);
    }
    return years;
  }, []);

  const formatDate = useCallback((date: Date) => {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }, []);

  // Detect if input is email or phone
  const handleEmailOrPhoneChange = useCallback((text: string) => {
    setEmailOrPhone(text);
    const hasAtSymbol = text.includes('@');
    const isAllDigits = /^\d+$/.test(text.replace(/[\s\-\(\)]/g, ''));
    setIsEmail(hasAtSymbol || (!isAllDigits && text.length > 0));
  }, []);

  // Image picker for ID
  const pickImage = useCallback(async (side: 'front' | 'back', source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant camera permissions to take a photo');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setIdImages(prev => ({
            ...prev,
            [side]: result.assets[0].uri,
          }));
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant camera roll permissions to upload ID');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setIdImages(prev => ({
            ...prev,
            [side]: result.assets[0].uri,
          }));
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, []);

  const showImageSourcePicker = useCallback((side: 'front' | 'back') => {
    Alert.alert(
      'Select Image Source',
      'Choose how you want to add your ID',
      [
        {
          text: 'Camera',
          onPress: () => pickImage(side, 'camera'),
        },
        {
          text: 'Gallery',
          onPress: () => pickImage(side, 'gallery'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  }, [pickImage]);

  // Generate map HTML with same view as admin map
  const generateMapHTML = useCallback((currentLocation: { latitude: number; longitude: number } | null) => {
    // Default to Manila, will try to get from AsyncStorage (matching admin map localStorage)
    let mapCenter = { lat: 14.5995, lng: 120.9842 };
    let mapZoom = 15;

    // Use current location if available
    if (currentLocation) {
      mapCenter = { lat: currentLocation.latitude, lng: currentLocation.longitude };
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          #searchContainer {
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            width: 90%;
            max-width: 400px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          @media (max-width: 480px) {
            #searchContainer {
              width: 85%;
              max-width: 350px;
            }
          }
          @media (max-width: 360px) {
            #searchContainer {
              width: 80%;
              max-width: 300px;
            }
          }
          #searchInputWrapper {
            display: flex;
            gap: 8px;
          }
          #searchInput {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            min-width: 0;
          }
          @media (max-width: 480px) {
            #searchInput {
              padding: 8px 12px;
              font-size: 13px;
            }
          }
          #searchButton {
            padding: 10px 16px;
            background: #1877F2;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            white-space: nowrap;
            flex-shrink: 0;
          }
          @media (max-width: 480px) {
            #searchButton {
              padding: 8px 14px;
              font-size: 13px;
            }
          }
          #searchButton:active {
            background: #1565C0;
          }
          #suggestionsContainer {
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            max-height: 200px;
            overflow-y: auto;
            display: none;
            width: 100%;
          }
          .suggestionItem {
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
            cursor: pointer;
            font-size: 14px;
            color: #111827;
          }
          .suggestionItem:hover,
          .suggestionItem:active {
            background: #f3f4f6;
          }
          .suggestionItem:last-child {
            border-bottom: none;
          }
          .suggestionMain {
            font-weight: 500;
            color: #111827;
          }
          .suggestionSecondary {
            font-size: 12px;
            color: #6b7280;
            margin-top: 2px;
          }
          #map { width: 100%; height: 100vh; }
          #confirmButton {
            position: absolute;
            bottom: 72px;
            left: 50%;
            transform: translateX(-50%);
            width: 90%;
            max-width: 400px;
            padding: 14px;
            background: #111827;
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          }
          @media (max-width: 480px) {
            #confirmButton {
              width: 85%;
              max-width: 350px;
              padding: 12px;
              font-size: 13px;
            }
          }
          @media (max-width: 360px) {
            #confirmButton {
              width: 80%;
              max-width: 300px;
            }
          }
          #confirmButton:active {
            background: #0f172a;
          }
        </style>
      </head>
      <body>
        <div id="searchContainer">
          <div id="searchInputWrapper">
            <input 
              type="text" 
              id="searchInput" 
              placeholder="Search for a place..."
              autocomplete="off"
            />
            <button id="searchButton">Search</button>
          </div>
          <div id="suggestionsContainer"></div>
        </div>
        <div id="map"></div>
        <button id="confirmButton">Confirm Location</button>
        <script>
          let map;
          let marker = null;
          let geocoder = null;
          let autocompleteService = null;
          let suggestionsContainer = null;
          let searchInput = null;
          let searchTimeout = null;
          
          let currentLatLng = { lat: ${mapCenter.lat}, lng: ${mapCenter.lng} };

          function initMap() {
            // Try to get saved center and zoom from localStorage (admin map settings)
            let center = { lat: ${mapCenter.lat}, lng: ${mapCenter.lng} };
            let zoom = ${mapZoom};
            
            try {
              const savedCenter = localStorage.getItem('mapCenter');
              const savedZoom = localStorage.getItem('mapZoom');
              if (savedCenter) {
                center = JSON.parse(savedCenter);
              }
              if (savedZoom) {
                zoom = parseInt(savedZoom, 10);
              }
            } catch (e) {
              console.error('Error loading saved map settings:', e);
            }
            
            map = new google.maps.Map(document.getElementById('map'), {
              center: center,
              zoom: zoom,
              mapTypeId: google.maps.MapTypeId.ROADMAP,
              mapTypeControl: true,
              streetViewControl: true,
              fullscreenControl: true,
              zoomControl: true,
            });

            geocoder = new google.maps.Geocoder();
            autocompleteService = new google.maps.places.AutocompleteService();
            suggestionsContainer = document.getElementById('suggestionsContainer');
            searchInput = document.getElementById('searchInput');

            ${currentLocation ? `
            // Add existing marker if location is already set
            marker = new google.maps.Marker({
              position: { lat: ${currentLocation.latitude}, lng: ${currentLocation.longitude} },
              map: map,
              draggable: true,
              icon: {
                url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
              },
            });
            ` : ''}
            ${currentLocation ? `currentLatLng = { lat: ${currentLocation.latitude}, lng: ${currentLocation.longitude} };` : ''}

            // Search functionality with autocomplete
            const searchButton = document.getElementById('searchButton');
            const confirmButton = document.getElementById('confirmButton');
            
            function showSuggestions(suggestions) {
              suggestionsContainer.innerHTML = '';
              if (suggestions && suggestions.length > 0) {
                suggestionsContainer.style.display = 'block';
                suggestions.forEach((suggestion) => {
                  const item = document.createElement('div');
                  item.className = 'suggestionItem';
                  item.innerHTML = \`
                    <div class="suggestionMain">\${suggestion.description}</div>
                    \${suggestion.structured_formatting?.secondary_text ? 
                      '<div class="suggestionSecondary">' + suggestion.structured_formatting.secondary_text + '</div>' : ''}
                  \`;
                  item.addEventListener('click', () => {
                    selectPlace(suggestion.place_id, suggestion.description);
                  });
                  suggestionsContainer.appendChild(item);
                });
              } else {
                suggestionsContainer.style.display = 'none';
              }
            }
            
            function selectPlace(placeId, description) {
              searchInput.value = description;
              suggestionsContainer.style.display = 'none';
              
              const service = new google.maps.places.PlacesService(map);
              service.getDetails(
                {
                  placeId: placeId,
                  fields: ['geometry', 'formatted_address', 'name'],
                },
                (place, status) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    const location = place.geometry.location;
                    const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
                    const lng = typeof location.lng === 'function' ? location.lng() : location.lng;
                    
                    // Center map on searched location
                    map.setCenter({ lat, lng });
                    map.setZoom(17);
                    
                    // Remove existing marker
                    if (marker) {
                      marker.setMap(null);
                    }
                    
                    // Add new marker
                    marker = new google.maps.Marker({
                      position: { lat, lng },
                      map: map,
                      draggable: true,
                      icon: {
                        url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                      },
                    });
                    
                    currentLatLng = { lat, lng };

                    // Send location to React Native
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'searchLocation',
                        latitude: lat,
                        longitude: lng,
                      }));
                    }
                  } else {
                    // Fallback to geocoding
                    performSearch(description);
                  }
                }
              );
            }
            
            function performSearch(address) {
              const searchAddress = address || searchInput.value.trim();
              if (!searchAddress) return;
              
              geocoder.geocode(
                { address: searchAddress + ', Philippines', region: 'ph' },
                (results, status) => {
                  if (status === 'OK' && results && results.length > 0) {
                    const result = results[0];
                    const location = result.geometry.location;
                    const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
                    const lng = typeof location.lng === 'function' ? location.lng() : location.lng;
                    
                    // Center map on searched location
                    map.setCenter({ lat, lng });
                    map.setZoom(17);
                    
                    // Remove existing marker
                    if (marker) {
                      marker.setMap(null);
                    }
                    
                    // Add new marker
                    marker = new google.maps.Marker({
                      position: { lat, lng },
                      map: map,
                      draggable: true,
                      icon: {
                        url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                      },
                    });
                    
                    currentLatLng = { lat, lng };

                    // Send location to React Native
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'searchLocation',
                        latitude: lat,
                        longitude: lng,
                      }));
                    }
                  } else {
                    alert('No results found. Please try a different location.');
                  }
                }
              );
            }
            
            // Autocomplete suggestions as user types
            searchInput.addEventListener('input', (e) => {
              const query = e.target.value.trim();
              
              if (searchTimeout) {
                clearTimeout(searchTimeout);
              }
              
              if (query.length < 2) {
                suggestionsContainer.style.display = 'none';
                return;
              }
              
              searchTimeout = setTimeout(() => {
                autocompleteService.getPlacePredictions(
                  {
                    input: query,
                    componentRestrictions: { country: 'ph' },
                    types: ['geocode', 'establishment'],
                  },
                  (predictions, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                      showSuggestions(predictions);
                    } else {
                      suggestionsContainer.style.display = 'none';
                    }
                  }
                );
              }, 300);
            });
            
            // Close suggestions when clicking outside
            document.addEventListener('click', (e) => {
              if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                suggestionsContainer.style.display = 'none';
              }
            });
            
            searchButton.addEventListener('click', () => performSearch());
            searchInput.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                suggestionsContainer.style.display = 'none';
                performSearch();
              }
            });

            // Add click listener to pin location
            map.addListener('click', (e) => {
              const lat = e.latLng.lat();
              const lng = e.latLng.lng();
              
              // Remove existing marker
              if (marker) {
                marker.setMap(null);
              }
              
              // Add new marker
              marker = new google.maps.Marker({
                position: { lat, lng },
                map: map,
                draggable: true,
                icon: {
                  url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                },
              });
              
              currentLatLng = { lat, lng };

              // Send location to React Native
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'locationPinned',
                  latitude: lat,
                  longitude: lng,
                }));
              }
            });

            // Allow dragging marker
            if (marker) {
              marker.addListener('dragend', (e) => {
                const lat = e.latLng.lat();
                const lng = e.latLng.lng();
                currentLatLng = { lat, lng };
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'locationPinned',
                    latitude: lat,
                    longitude: lng,
                  }));
                }
              });
            }

            confirmButton.addEventListener('click', () => {
              const position = marker ? marker.getPosition() : map.getCenter();
              const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
              const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
              currentLatLng = { lat, lng };
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'confirmLocation',
                  latitude: lat,
                  longitude: lng,
                }));
              }
            });
          }
        </script>
        <script async defer
          src="https://maps.googleapis.com/maps/api/js?key=AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q&libraries=places&callback=initMap">
        </script>
      </body>
      </html>
    `;
  }, []);

  const pickDocument = useCallback(async (docKey: string, source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant camera permissions to take a photo');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setDocumentImages(prev => ({
            ...prev,
            [docKey]: result.assets[0].uri,
          }));
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant camera roll permissions to upload document');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setDocumentImages(prev => ({
            ...prev,
            [docKey]: result.assets[0].uri,
          }));
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  }, []);

  const showDocumentSourcePicker = useCallback((docKey: string) => {
    Alert.alert(
      'Select Image Source',
      'Choose how you want to add your document',
      [
        {
          text: 'Camera',
          onPress: () => pickDocument(docKey, 'camera'),
        },
        {
          text: 'Gallery',
          onPress: () => pickDocument(docKey, 'gallery'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  }, [pickDocument]);

  const pickBillingProof = useCallback(async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant camera permissions to take a photo');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setBillingProofImage(result.assets[0].uri);
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant camera roll permissions to upload billing proof');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setBillingProofImage(result.assets[0].uri);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick billing proof. Please try again.');
    }
  }, []);

  const showBillingProofSourcePicker = useCallback(() => {
    Alert.alert(
      'Select Image Source',
      'Upload a photo of your latest water/electric bill',
      [
        {
          text: 'Camera',
          onPress: () => pickBillingProof('camera'),
        },
        {
          text: 'Gallery',
          onPress: () => pickBillingProof('gallery'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  }, [pickBillingProof]);

  // Address options
  const blockOptions = ['Block 1', 'Block 2', 'Block 3', 'Block 4', 'Block 5', 'Block 6', 'Block 7', 'Block 8', 'Block 9', 'Block 10'];
  const lotOptions = ['Lot 1', 'Lot 2', 'Lot 3', 'Lot 4', 'Lot 5', 'Lot 6', 'Lot 7', 'Lot 8', 'Lot 9', 'Lot 10'];
  const streetOptions = ['Main Street', 'First Street', 'Second Street', 'Third Street', 'Fourth Street', 'Fifth Street'];
  const relationOptions = ['Son', 'Daughter', 'Spouse', 'Parent', 'Sibling', 'Relative', 'Friend', 'Other'];

  // Navigation
  const nextStep = useCallback(() => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  // Clear errors for a specific field
  const clearError = useCallback((field: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  // Set error for a specific field
  const setError = useCallback((field: string, message: string) => {
    setErrors(prev => ({ ...prev, [field]: message }));
  }, []);

  // Validation for each step
  const validateStep = useCallback((step: number): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    switch (step) {
      case 1:
        if (!emailOrPhone.trim()) {
          newErrors.emailOrPhone = 'Email or phone number is required';
          isValid = false;
        } else if (isEmail) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(emailOrPhone.trim())) {
            newErrors.emailOrPhone = 'Please enter a valid email address';
            isValid = false;
          }
        } else {
          const phoneRegex = /^[0-9]{10,11}$/;
          const cleanPhone = emailOrPhone.replace(/[\s\-\(\)]/g, '');
          if (!phoneRegex.test(cleanPhone)) {
            newErrors.emailOrPhone = 'Please enter a valid phone number (10-11 digits)';
            isValid = false;
          }
        }

        if (!password) {
          newErrors.password = 'Password is required';
          isValid = false;
        } else if (password.length < 6) {
          newErrors.password = 'Password must be at least 6 characters';
          isValid = false;
        } else if (password.length > 50) {
          newErrors.password = 'Password must be less than 50 characters';
          isValid = false;
        }

        if (!confirmPassword) {
          newErrors.confirmPassword = 'Please confirm your password';
          isValid = false;
        } else if (password !== confirmPassword) {
          newErrors.confirmPassword = 'Passwords do not match';
          isValid = false;
        }
        break;

      case 2:
        if (!firstName.trim()) {
          newErrors.firstName = 'First name is required';
          isValid = false;
        } else if (firstName.trim().length < 2) {
          newErrors.firstName = 'First name must be at least 2 characters';
          isValid = false;
        } else if (firstName.trim().length > 50) {
          newErrors.firstName = 'First name must be less than 50 characters';
          isValid = false;
        }

        if (middleName.trim() && middleName.trim().length > 50) {
          newErrors.middleName = 'Middle name must be less than 50 characters';
          isValid = false;
        }

        if (!lastName.trim()) {
          newErrors.lastName = 'Last name is required';
          isValid = false;
        } else if (lastName.trim().length < 2) {
          newErrors.lastName = 'Last name must be at least 2 characters';
          isValid = false;
        } else if (lastName.trim().length > 50) {
          newErrors.lastName = 'Last name must be less than 50 characters';
          isValid = false;
        }

        if (!birthdate) {
          newErrors.birthdate = 'Please select your birthdate';
          isValid = false;
        } else if (birthdate > new Date()) {
          newErrors.birthdate = 'Birthdate cannot be in the future';
          isValid = false;
        } else {
          const today = new Date();
          const age = calculateAge(birthdate);
          if (age < 13) {
            newErrors.birthdate = 'You must be at least 13 years old to register';
            isValid = false;
          } else if (age > 120) {
            newErrors.birthdate = 'Please enter a valid birthdate';
            isValid = false;
          }
        }

        if (!sex) {
          newErrors.sex = 'Please select your sex';
          isValid = false;
        }
        break;

      case 3:
        if (!block) {
          newErrors.block = 'Please select a block';
          isValid = false;
        }
        if (!lot) {
          newErrors.lot = 'Please select a lot';
          isValid = false;
        }
        if (!street) {
          newErrors.street = 'Please select a street';
          isValid = false;
        }
        break;

      case 4:
        if (!residentType) {
          newErrors.residentType = 'Please select if you are a tenant or homeowner';
          isValid = false;
        }
        if (residentType === 'tenant' && !tenantRelation) {
          newErrors.tenantRelation = 'Please select your relation to the homeowner';
          isValid = false;
        }
        if (!waterBillingDate) {
          newErrors.waterBillingDate = 'Please select your water billing date';
          isValid = false;
        }
        if (!electricBillingDate) {
          newErrors.electricBillingDate = 'Please select your electricity billing date';
          isValid = false;
        }
        if (!billingProofImage) {
          newErrors.billingProof = 'Please upload a billing proof image';
          isValid = false;
        }
        if (!documentImages['deedOfSale']) {
          newErrors.deedOfSale = 'Please upload the Deed of Sale image';
          isValid = false;
        }
        if (!idImages.front) {
          newErrors.idFront = 'Please upload the front of your valid ID';
          isValid = false;
        }
        if (!idImages.back) {
          newErrors.idBack = 'Please upload the back of your valid ID';
          isValid = false;
        }
        break;

      case 5:
        if (!acceptedTerms) {
          newErrors.terms = 'Please accept the terms and conditions to continue';
          isValid = false;
        }
        break;

      default:
        break;
    }

    setErrors(newErrors);
    return isValid;
  }, [
    emailOrPhone,
    isEmail,
    password,
    confirmPassword,
    firstName,
    middleName,
    lastName,
    birthdate,
    sex,
    block,
    lot,
    street,
    location,
    residentType,
    tenantRelation,
    waterBillingDate,
    electricBillingDate,
    billingProofImage,
    idImages,
    documentImages,
    acceptedTerms,
    calculateAge,
  ]);

  const handleNext = useCallback(async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    // Extra duplicate check on step 1 for email/phone
    if (currentStep === 1 && db) {
      try {
        const value = emailOrPhone.trim();
        if (value) {
          if (isEmail) {
            const usersQ = query(
              collection(db, 'users'),
              where('email', '==', value),
              limit(1)
            );
            const pendingQ = query(
              collection(db, 'pendingUsers'),
              where('email', '==', value),
              limit(1)
            );
            const [usersSnap, pendingSnap] = await Promise.all([getDocs(usersQ), getDocs(pendingQ)]);
            if (!usersSnap.empty || !pendingSnap.empty) {
              setError('emailOrPhone', 'This email is already registered. Please sign in instead.');
              return;
            }
          } else {
            const usersQ = query(
              collection(db, 'users'),
              where('phone', '==', value),
              limit(1)
            );
            const pendingQ = query(
              collection(db, 'pendingUsers'),
              where('phone', '==', value),
              limit(1)
            );
            const [usersSnap, pendingSnap] = await Promise.all([getDocs(usersQ), getDocs(pendingQ)]);
            if (!usersSnap.empty || !pendingSnap.empty) {
              setError('emailOrPhone', 'This phone number is already registered. Please sign in instead.');
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Duplicate email/phone check failed', err);
      }
    }

    // Clear errors when moving to next step
    setErrors({});
    nextStep();
  }, [currentStep, db, emailOrPhone, isEmail, validateStep, nextStep, setError]);

  const handlePrev = useCallback(() => {
    // Clear errors when going back
    setErrors({});
    prevStep();
  }, [prevStep]);

  // Upload image to Firebase Storage
  const uploadImageToStorage = useCallback(async (uri: string, path: string): Promise<string | null> => {
    if (!storage) {
      console.error('Storage is not initialized');
      return null;
    }

    try {
      // For React Native, convert the local URI to a blob using XMLHttpRequest
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function() {
          resolve(xhr.response);
        };
        xhr.onerror = function() {
          reject(new Error('Failed to load image'));
        };
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });
      
      // Create a reference to the file location
      const storageRef = ref(storage, path);
      
      // Upload the file
      await uploadBytes(storageRef, blob);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  }, []);

  const handleSignUp = useCallback(async () => {
    if (!validateStep(5)) {
      // Scroll to first error if any
      return;
    }

    if (!storage) {
      setError('general', 'Storage service is not available. Please try again later.');
      Alert.alert('Error', 'Storage service is not available. Please try again later.');
      return;
    }

    if (!db) {
      setError('general', 'Database service is not available. Please try again later.');
      Alert.alert('Error', 'Database service is not available. Please try again later.');
      return;
    }

    setLoading(true);
    setErrors({}); // Clear previous errors
    
    try {
      // Generate a unique ID for the pending user (using timestamp + random)
      const pendingUserId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const username = isEmail ? emailOrPhone.trim() : `${emailOrPhone.trim()}@subdibuddy.local`;
      
      // Upload images to Firebase Storage (using pendingUserId instead of user.uid)
      let idFrontURL: string | null = null;
      let idBackURL: string | null = null;
      let billingProofURL: string | null = null;
      const documentURLs: Record<string, string> = {};

      if (idImages.front) {
        idFrontURL = await uploadImageToStorage(idImages.front, `pendingUsers/${pendingUserId}/id-front.jpg`);
        if (!idFrontURL) {
          throw new Error('Failed to upload ID front image');
        }
      }

      if (idImages.back) {
        idBackURL = await uploadImageToStorage(idImages.back, `pendingUsers/${pendingUserId}/id-back.jpg`);
        if (!idBackURL) {
          throw new Error('Failed to upload ID back image');
        }
      }

      if (billingProofImage) {
        billingProofURL = await uploadImageToStorage(billingProofImage, `pendingUsers/${pendingUserId}/billing-proof.jpg`);
        if (!billingProofURL) {
          throw new Error('Failed to upload billing proof image');
        }
      }

      // Upload deed of sale
      if (documentImages['deedOfSale']) {
        const docURL = await uploadImageToStorage(documentImages['deedOfSale'], `pendingUsers/${pendingUserId}/documents/deedOfSale.jpg`);
        if (!docURL) {
          throw new Error('Failed to upload Deed of Sale image');
        }
        documentURLs['deedOfSale'] = docURL;
      }
      
      // Save to pendingUsers collection WITHOUT creating Firebase Auth account
      await setDoc(doc(db, 'pendingUsers', pendingUserId), {
        username: username, // Store the username format for Auth creation later
        password: password, // Store password temporarily (will be used when admin approves)
        firstName: firstName.trim(),
        middleName: middleName.trim() || null,
        lastName: lastName.trim(),
        fullName: `${firstName.trim()} ${middleName.trim() ? middleName.trim() + ' ' : ''}${lastName.trim()}`.trim(),
        birthdate: Timestamp.fromDate(birthdate!),
        age: age,
        sex: sex,
        address: {
          block: block,
          lot: lot,
          street: street,
        },
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
        } : null,
        email: isEmail ? emailOrPhone.trim() : null,
        phone: !isEmail ? emailOrPhone.trim() : null,
        isTenant: residentType === 'tenant',
        residentType: residentType,
        tenantRelation: residentType === 'tenant' ? tenantRelation : null,
        waterBillingDate: waterBillingDate ? Timestamp.fromDate(waterBillingDate) : null,
        electricBillingDate: electricBillingDate ? Timestamp.fromDate(electricBillingDate) : null,
        billingProof: billingProofURL,
        idFront: idFrontURL,
        idBack: idBackURL,
        documents: documentURLs,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      Alert.alert(
        'Application Submitted', 
        'Your application has been submitted successfully. Please wait for admin approval before you can log in. You will be notified once your account is approved.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/login'),
          },
        ]
      );
    } catch (error: any) {
      let errorMessage = 'An error occurred during application submission. Please try again.';
      let errorField = 'general';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check your database permissions.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Service is temporarily unavailable. Please try again later.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorField, errorMessage);
      Alert.alert('Application Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [
    emailOrPhone, isEmail, password, firstName, middleName, lastName, birthdate, age, sex,
    block, lot, street, residentType, tenantRelation, waterBillingDate, electricBillingDate, billingProofImage, idImages, documentImages, validateStep, setError, uploadImageToStorage, formatDate
  ]);

  // Progress bar
  const progress = (currentStep / TOTAL_STEPS) * 100;

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Create Your Account</Text>
            <Text style={styles.stepSubtitle}>Step 1 of {TOTAL_STEPS}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email or Phone Number</Text>
              <TextInput
                style={[styles.input, errors.emailOrPhone && styles.inputError]}
                placeholder={isEmail ? "your.email@example.com" : "09XX XXX XXXX"}
                value={emailOrPhone}
                onChangeText={handleEmailOrPhoneChange}
                keyboardType={isEmail ? "email-address" : "phone-pad"}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#999"
                editable={!loading}
              />
              {errors.emailOrPhone && (
                <Text style={styles.errorText}>{errors.emailOrPhone}</Text>
              )}
              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => setIsEmail(!isEmail)}
                disabled={loading}
              >
                <Text style={styles.switchButtonText}>
                  Switch to {isEmail ? 'Phone' : 'Email'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.passwordInput, errors.password && styles.inputError]}
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    clearError('password');
                    if (confirmPassword && text !== confirmPassword) {
                      clearError('confirmPassword');
                    }
                  }}
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
              {errors.password && (
                <Text style={styles.errorText}>{errors.password}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.passwordInput, errors.confirmPassword && styles.inputError]}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    clearError('confirmPassword');
                  }}
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
              {errors.confirmPassword && (
                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
              )}
            </View>

            {/* Navigation Buttons */}
            <View style={styles.formNavigationButtonsStep1}>
              <TouchableOpacity
                style={[styles.nextButtonInline, styles.nextButtonInlineFull]}
                onPress={handleNext}
                disabled={loading}
              >
                <Text style={styles.nextButtonTextInline}>Next</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.signInLinkInline}
                onPress={() => router.push('/login')}
                disabled={loading}
              >
                <Text style={styles.signInLinkTextInline}>
                  Already have an account? <Text style={styles.signInLinkBoldInline}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Personal Information</Text>
            <Text style={styles.stepSubtitle}>Step 2 of {TOTAL_STEPS}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={[styles.input, errors.firstName && styles.inputError]}
                placeholder="Enter your first name"
                value={firstName}
                onChangeText={(text) => {
                  setFirstName(text);
                  clearError('firstName');
                }}
                autoCapitalize="words"
                placeholderTextColor="#999"
                editable={!loading}
              />
              {errors.firstName && (
                <Text style={styles.errorText}>{errors.firstName}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Middle Name (Optional)</Text>
              <TextInput
                style={[styles.input, errors.middleName && styles.inputError]}
                placeholder="Enter your middle name"
                value={middleName}
                onChangeText={(text) => {
                  setMiddleName(text);
                  clearError('middleName');
                }}
                autoCapitalize="words"
                placeholderTextColor="#999"
                editable={!loading}
              />
              {errors.middleName && (
                <Text style={styles.errorText}>{errors.middleName}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={[styles.input, errors.lastName && styles.inputError]}
                placeholder="Enter your last name"
                value={lastName}
                onChangeText={(text) => {
                  setLastName(text);
                  clearError('lastName');
                }}
                autoCapitalize="words"
                placeholderTextColor="#999"
                editable={!loading}
              />
              {errors.lastName && (
                <Text style={styles.errorText}>{errors.lastName}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Birthdate</Text>
              <TouchableOpacity
                style={[styles.datePickerButton, errors.birthdate && styles.inputError]}
                onPress={() => {
                  handleDatePickerOpen();
                  clearError('birthdate');
                }}
                disabled={loading}
              >
                <Text style={[styles.datePickerText, !birthdate && styles.datePickerPlaceholder]}>
                  {birthdate ? formatDate(birthdate) : 'Select your birthdate'}
                </Text>
                {birthdate && age !== null && (
                  <Text style={styles.ageText}>Age: {age}</Text>
                )}
              </TouchableOpacity>
              {errors.birthdate && (
                <Text style={styles.errorText}>{errors.birthdate}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Sex</Text>
              <TouchableOpacity
                style={[styles.pickerButton, errors.sex && styles.inputError]}
                onPress={() => {
                  setShowSexPicker(true);
                  clearError('sex');
                }}
                disabled={loading}
              >
                <Text style={[styles.pickerText, !sex && styles.pickerPlaceholder]}>
                  {sex ? (sex === 'male' ? 'Male' : 'Female') : 'Select your sex'}
                </Text>
                <Text style={styles.pickerIcon}>▼</Text>
              </TouchableOpacity>
              {errors.sex && (
                <Text style={styles.errorText}>{errors.sex}</Text>
              )}
            </View>

            {/* Navigation Buttons */}
            <View style={styles.formNavigationButtons}>
              <TouchableOpacity
                style={styles.backButtonInline}
                onPress={handlePrev}
                disabled={loading}
              >
                <Text style={styles.backButtonTextInline}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextButtonInline}
                onPress={handleNext}
                disabled={loading}
              >
                <Text style={styles.nextButtonTextInline}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Address</Text>
            <Text style={styles.stepSubtitle}>Step 3 of {TOTAL_STEPS}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Block</Text>
              <TouchableOpacity
                style={[styles.pickerButton, errors.block && styles.inputError]}
                onPress={() => {
                  setShowBlockPicker(true);
                  clearError('block');
                }}
                disabled={loading}
              >
                <Text style={[styles.pickerText, !block && styles.pickerPlaceholder]}>
                  {block || 'Select Block'}
                </Text>
                <Text style={styles.pickerIcon}>▼</Text>
              </TouchableOpacity>
              {errors.block && (
                <Text style={styles.errorText}>{errors.block}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Lot</Text>
              <TouchableOpacity
                style={[styles.pickerButton, errors.lot && styles.inputError]}
                onPress={() => {
                  setShowLotPicker(true);
                  clearError('lot');
                }}
                disabled={loading}
              >
                <Text style={[styles.pickerText, !lot && styles.pickerPlaceholder]}>
                  {lot || 'Select Lot'}
                </Text>
                <Text style={styles.pickerIcon}>▼</Text>
              </TouchableOpacity>
              {errors.lot && (
                <Text style={styles.errorText}>{errors.lot}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Street</Text>
              <TouchableOpacity
                style={[styles.pickerButton, errors.street && styles.inputError]}
                onPress={() => {
                  setShowStreetPicker(true);
                  clearError('street');
                }}
                disabled={loading}
              >
                <Text style={[styles.pickerText, !street && styles.pickerPlaceholder]}>
                  {street || 'Select Street'}
                </Text>
                <Text style={styles.pickerIcon}>▼</Text>
              </TouchableOpacity>
              {errors.street && (
                <Text style={styles.errorText}>{errors.street}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Pin Your Location on Map</Text>
              <Text style={styles.subLabel}>Tap on the map to mark your exact location</Text>
              <TouchableOpacity
                style={[styles.mapButton, errors.location && styles.inputError]}
                onPress={() => {
                  setShowMapModal(true);
                  clearError('location');
                }}
                disabled={loading}
              >
                {location ? (
                  <Text style={styles.mapButtonText}>
                    Location: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </Text>
                ) : (
                  <Text style={[styles.mapButtonText, styles.mapButtonPlaceholder]}>
                    Tap to pin your location on map
                  </Text>
                )}
              </TouchableOpacity>
              {errors.location && (
                <Text style={styles.errorText}>{errors.location}</Text>
              )}
            </View>

            {/* Navigation Buttons */}
            <View style={styles.formNavigationButtons}>
              <TouchableOpacity
                style={styles.backButtonInline}
                onPress={handlePrev}
                disabled={loading}
              >
                <Text style={styles.backButtonTextInline}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextButtonInline}
                onPress={handleNext}
                disabled={loading}
              >
                <Text style={styles.nextButtonTextInline}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Resident Type & Documents</Text>
            <Text style={styles.stepSubtitle}>Step 4 of {TOTAL_STEPS}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>I am a</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioContainer}
                  onPress={() => {
                    setResidentType('homeowner');
                    clearError('residentType');
                  }}
                  disabled={loading}
                >
                  <View style={styles.radio}>
                    <View style={[styles.radioInner, residentType === 'homeowner' && styles.radioInnerSelected]} />
                  </View>
                  <Text style={styles.radioLabel}>Homeowner</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.radioContainer}
                  onPress={() => {
                    setResidentType('tenant');
                    clearError('residentType');
                  }}
                  disabled={loading}
                >
                  <View style={styles.radio}>
                    <View style={[styles.radioInner, residentType === 'tenant' && styles.radioInnerSelected]} />
                  </View>
                  <Text style={styles.radioLabel}>Tenant</Text>
                </TouchableOpacity>
              </View>
              {errors.residentType && (
                <Text style={styles.errorText}>{errors.residentType}</Text>
              )}

              {residentType === 'tenant' && (
                <>
                  <TouchableOpacity
                    style={[styles.pickerButton, styles.pickerButtonMargin, errors.tenantRelation && styles.inputError]}
                    onPress={() => {
                      setShowRelationPicker(true);
                      clearError('tenantRelation');
                    }}
                    disabled={loading}
                  >
                    <Text style={[styles.pickerText, !tenantRelation && styles.pickerPlaceholder]}>
                      {tenantRelation || 'Select relation to homeowner'}
                    </Text>
                    <Text style={styles.pickerIcon}>▼</Text>
                  </TouchableOpacity>
                  {errors.tenantRelation && (
                    <Text style={styles.errorText}>{errors.tenantRelation}</Text>
                  )}
                </>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Billing Dates</Text>
              <Text style={styles.subLabel}>Provide separate billing dates for each utility</Text>

              <Text style={styles.subLabel}>Water</Text>
              <TouchableOpacity
                style={[styles.datePickerButton, errors.waterBillingDate && styles.inputError]}
                onPress={() => {
                  setActiveBillingType('water');
                  setTempBillingDate(waterBillingDate || new Date());
                  setShowBillingDatePicker(true);
                  clearError('waterBillingDate');
                }}
                disabled={loading}
              >
                <Text style={[styles.datePickerText, !waterBillingDate && styles.datePickerPlaceholder]}>
                  {waterBillingDate ? formatDate(waterBillingDate) : 'Select water billing date'}
                </Text>
              </TouchableOpacity>
              {errors.waterBillingDate && (
                <Text style={styles.errorText}>{errors.waterBillingDate}</Text>
              )}

              <Text style={[styles.subLabel, { marginTop: 12 }]}>Electricity</Text>
              <TouchableOpacity
                style={[styles.datePickerButton, errors.electricBillingDate && styles.inputError]}
                onPress={() => {
                  setActiveBillingType('electricity');
                  setTempBillingDate(electricBillingDate || new Date());
                  setShowBillingDatePicker(true);
                  clearError('electricBillingDate');
                }}
                disabled={loading}
              >
                <Text style={[styles.datePickerText, !electricBillingDate && styles.datePickerPlaceholder]}>
                  {electricBillingDate ? formatDate(electricBillingDate) : 'Select electricity billing date'}
                </Text>
              </TouchableOpacity>
              {errors.electricBillingDate && (
                <Text style={styles.errorText}>{errors.electricBillingDate}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Billing Proof</Text>
              <Text style={styles.subLabel}>Upload a recent water or electric bill to verify dates</Text>
              {billingProofImage ? (
                <View style={styles.documentImageContainer}>
                  <Image source={{ uri: billingProofImage }} style={styles.documentImage} />
                  <TouchableOpacity
                    style={styles.removeDocumentButton}
                    onPress={() => {
                      setBillingProofImage(null);
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.removeDocumentText}>Replace</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.documentUploadButton, errors.billingProof && styles.idUploadButtonError]}
                  onPress={() => {
                    showBillingProofSourcePicker();
                    clearError('billingProof');
                  }}
                  disabled={loading}
                >
                  <Text style={styles.documentUploadText}>Upload Billing Proof</Text>
                </TouchableOpacity>
              )}
              {errors.billingProof && (
                <Text style={styles.errorText}>{errors.billingProof}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Valid ID</Text>
              <Text style={styles.subLabel}>Upload front and back of your valid ID</Text>
              
              <View style={styles.idContainer}>
                <View style={styles.idItem}>
                  <Text style={styles.idLabel}>Front</Text>
                  {idImages.front ? (
                    <Image source={{ uri: idImages.front }} style={styles.idImage} />
                  ) : (
                    <TouchableOpacity
                      style={[styles.idUploadButton, errors.idFront && styles.idUploadButtonError]}
                      onPress={() => {
                        showImageSourcePicker('front');
                        clearError('idFront');
                      }}
                      disabled={loading}
                    >
                      <Text style={styles.idUploadText}>Upload Front</Text>
                    </TouchableOpacity>
                  )}
                  {errors.idFront && (
                    <Text style={styles.errorText}>{errors.idFront}</Text>
                  )}
                </View>

                <View style={styles.idItem}>
                  <Text style={styles.idLabel}>Back</Text>
                  {idImages.back ? (
                    <Image source={{ uri: idImages.back }} style={styles.idImage} />
                  ) : (
                    <TouchableOpacity
                      style={[styles.idUploadButton, errors.idBack && styles.idUploadButtonError]}
                      onPress={() => {
                        showImageSourcePicker('back');
                        clearError('idBack');
                      }}
                      disabled={loading}
                    >
                      <Text style={styles.idUploadText}>Upload Back</Text>
                    </TouchableOpacity>
                  )}
                  {errors.idBack && (
                    <Text style={styles.errorText}>{errors.idBack}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Deed of Sale</Text>
              <Text style={styles.subLabel}>Upload a photo of the Deed of Sale</Text>
              
              <View style={styles.documentsContainer}>
                <View style={styles.documentItem}>
                  <Text style={styles.documentLabel}>Upload Image</Text>
                  {documentImages['deedOfSale'] ? (
                    <View style={styles.documentImageContainer}>
                      <Image source={{ uri: documentImages['deedOfSale']! }} style={styles.documentImage} />
                      <TouchableOpacity
                        style={styles.removeDocumentButton}
                        onPress={() => {
                          setDocumentImages(prev => {
                            const newDocs = { ...prev };
                            delete newDocs['deedOfSale'];
                            return newDocs;
                          });
                        }}
                        disabled={loading}
                      >
                        <Text style={styles.removeDocumentText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.documentUploadButton, errors.deedOfSale && styles.idUploadButtonError]}
                      onPress={() => {
                        showDocumentSourcePicker('deedOfSale');
                      }}
                      disabled={loading}
                    >
                      <Text style={styles.documentUploadText}>Upload Deed of Sale</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {errors.deedOfSale && (
                  <Text style={styles.errorText}>{errors.deedOfSale}</Text>
                )}
              </View>
            </View>

            {/* Navigation Buttons */}
            <View style={styles.formNavigationButtons}>
              <TouchableOpacity
                style={styles.backButtonInline}
                onPress={handlePrev}
                disabled={loading}
              >
                <Text style={styles.backButtonTextInline}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextButtonInline}
                onPress={handleNext}
                disabled={loading}
              >
                <Text style={styles.nextButtonTextInline}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 5:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Review & Terms</Text>
            <Text style={styles.stepSubtitle}>Step 5 of {TOTAL_STEPS}</Text>

            <ScrollView 
              style={styles.reviewContainer}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <Text style={styles.reviewSectionTitle}>Account Information</Text>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Email/Phone:</Text>
                <Text style={styles.reviewValue}>{emailOrPhone}</Text>
              </View>

              <Text style={styles.reviewSectionTitle}>Personal Information</Text>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Full Name:</Text>
                <Text style={styles.reviewValue}>
                  {firstName} {middleName ? middleName + ' ' : ''}{lastName}
                </Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>First Name:</Text>
                <Text style={styles.reviewValue}>{firstName || 'N/A'}</Text>
              </View>
              {middleName && (
                <View style={styles.reviewSection}>
                  <Text style={styles.reviewLabel}>Middle Name:</Text>
                  <Text style={styles.reviewValue}>{middleName}</Text>
                </View>
              )}
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Last Name:</Text>
                <Text style={styles.reviewValue}>{lastName || 'N/A'}</Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Birthdate:</Text>
                <Text style={styles.reviewValue}>
                  {birthdate ? formatDate(birthdate) : 'N/A'}
                </Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Age:</Text>
                <Text style={styles.reviewValue}>{age !== null ? age : 'N/A'}</Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Sex:</Text>
                <Text style={styles.reviewValue}>
                  {sex ? (sex === 'male' ? 'Male' : 'Female') : 'N/A'}
                </Text>
              </View>

              <Text style={styles.reviewSectionTitle}>Address</Text>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Block:</Text>
                <Text style={styles.reviewValue}>{block || 'N/A'}</Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Lot:</Text>
                <Text style={styles.reviewValue}>{lot || 'N/A'}</Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Street:</Text>
                <Text style={styles.reviewValue}>{street || 'N/A'}</Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Full Address:</Text>
                <Text style={styles.reviewValue}>{block}, {lot}, {street}</Text>
              </View>

              <Text style={styles.reviewSectionTitle}>Resident Information</Text>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Resident Type:</Text>
                <Text style={styles.reviewValue}>
                  {residentType === 'homeowner' ? 'Homeowner' : residentType === 'tenant' ? 'Tenant' : 'N/A'}
                </Text>
              </View>
              {residentType === 'tenant' && (
                <View style={styles.reviewSection}>
                  <Text style={styles.reviewLabel}>Relation to Homeowner:</Text>
                  <Text style={styles.reviewValue}>{tenantRelation || 'N/A'}</Text>
                </View>
              )}
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Water Billing Date:</Text>
                <Text style={styles.reviewValue}>
                  {waterBillingDate ? formatDate(waterBillingDate) : 'N/A'}
                </Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Electricity Billing Date:</Text>
                <Text style={styles.reviewValue}>
                  {electricBillingDate ? formatDate(electricBillingDate) : 'N/A'}
                </Text>
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Billing Proof:</Text>
                {billingProofImage ? (
                  <Image source={{ uri: billingProofImage }} style={styles.reviewImage} />
                ) : (
                  <Text style={styles.reviewValue}>Not uploaded</Text>
                )}
              </View>

              <Text style={styles.reviewSectionTitle}>ID Verification</Text>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>ID Front:</Text>
                {idImages.front ? (
                  <Image source={{ uri: idImages.front }} style={styles.reviewImage} />
                ) : (
                  <Text style={styles.reviewValue}>Not uploaded</Text>
                )}
              </View>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>ID Back:</Text>
                {idImages.back ? (
                  <Image source={{ uri: idImages.back }} style={styles.reviewImage} />
                ) : (
                  <Text style={styles.reviewValue}>Not uploaded</Text>
                )}
              </View>

              {documentImages['deedOfSale'] && (
                <>
                  <Text style={styles.reviewSectionTitle}>Documents</Text>
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Deed of Sale:</Text>
                    <Image source={{ uri: documentImages['deedOfSale']! }} style={styles.reviewImage} />
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.formGroup}>
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={[styles.checkbox, errors.terms && styles.checkboxError]}
                  onPress={() => {
                    setAcceptedTerms(!acceptedTerms);
                    clearError('terms');
                  }}
                  disabled={loading}
                >
                  <Text style={styles.checkboxIcon}>{acceptedTerms ? '✓' : ''}</Text>
                </TouchableOpacity>
                <Text style={styles.checkboxLabel}>
                  I accept the terms and conditions
                </Text>
              </View>
              {errors.terms && (
                <Text style={styles.errorText}>{errors.terms}</Text>
              )}
            </View>

            {/* Navigation Buttons */}
            <View style={styles.formNavigationButtons}>
              <TouchableOpacity
                style={styles.backButtonInline}
                onPress={handlePrev}
                disabled={loading}
              >
                <Text style={styles.backButtonTextInline}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitButtonInline, 
                  styles.submitButtonInlineFull,
                  (loading || !acceptedTerms) && styles.submitButtonInlineDisabled
                ]}
                onPress={handleSignUp}
                disabled={loading || !acceptedTerms}
              >
                {loading ? (
                  <View style={styles.buttonContentInline}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.submitButtonTextInline}>Creating account...</Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.submitButtonTextInline,
                    (loading || !acceptedTerms) && styles.submitButtonTextInlineDisabled
                  ]}>Sign Up</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      enabled={true}
    >
      <View style={styles.header}>
        <Image 
          source={require('../assets/logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Create Account</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>Step {currentStep} of {TOTAL_STEPS}</Text>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View style={styles.card}>
          {renderStepContent()}
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

      {/* Billing Date Picker Modal */}
      <Modal
        visible={showBillingDatePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowBillingDatePicker(false);
          setActiveBillingType(null);
        }}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowBillingDatePicker(false);
            setActiveBillingType(null);
          }}
        >
          <View style={styles.datePickerModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeBillingType === 'water' ? 'Select Water Billing Date' : activeBillingType === 'electricity' ? 'Select Electricity Billing Date' : 'Select Billing Date'}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowBillingDatePicker(false);
                setActiveBillingType(null);
              }}>
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
                        tempBillingDate.getMonth() === index && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        const newDate = new Date(tempBillingDate);
                        newDate.setMonth(index);
                        const daysInMonth = getDaysInMonth(newDate.getFullYear(), index);
                        if (newDate.getDate() > daysInMonth) {
                          newDate.setDate(daysInMonth);
                        }
                        setTempBillingDate(newDate);
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempBillingDate.getMonth() === index && styles.datePickerOptionTextSelected
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
                  {Array.from({ length: getDaysInMonth(tempBillingDate.getFullYear(), tempBillingDate.getMonth()) }, (_, i) => i + 1).map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.datePickerOption,
                        tempBillingDate.getDate() === day && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        const newDate = new Date(tempBillingDate);
                        newDate.setDate(day);
                        setTempBillingDate(newDate);
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempBillingDate.getDate() === day && styles.datePickerOptionTextSelected
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
                        tempBillingDate.getFullYear() === year && styles.datePickerOptionSelected
                      ]}
                      onPress={() => {
                        const newDate = new Date(tempBillingDate);
                        newDate.setFullYear(year);
                        const daysInMonth = getDaysInMonth(year, newDate.getMonth());
                        if (newDate.getDate() > daysInMonth) {
                          newDate.setDate(daysInMonth);
                        }
                        setTempBillingDate(newDate);
                      }}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        tempBillingDate.getFullYear() === year && styles.datePickerOptionTextSelected
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
                onPress={() => {
                  setShowBillingDatePicker(false);
                  setActiveBillingType(null);
                }}
              >
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.datePickerConfirmButton}
                onPress={handleBillingDatePickerConfirm}
              >
                <Text style={styles.datePickerConfirmText}>Confirm</Text>
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
                  setSex('male');
                  setShowSexPicker(false);
                }}
              >
                <Text style={styles.modalOptionText}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setSex('female');
                  setShowSexPicker(false);
                }}
              >
                <Text style={styles.modalOptionText}>Female</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Block Picker Modal */}
      <Modal
        visible={showBlockPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBlockPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBlockPicker(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Block</Text>
              <TouchableOpacity onPress={() => setShowBlockPicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {blockOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.modalOption}
                  onPress={() => {
                    setBlock(option);
                    setShowBlockPicker(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Lot Picker Modal */}
      <Modal
        visible={showLotPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLotPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLotPicker(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Lot</Text>
              <TouchableOpacity onPress={() => setShowLotPicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {lotOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.modalOption}
                  onPress={() => {
                    setLot(option);
                    setShowLotPicker(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Street Picker Modal */}
      <Modal
        visible={showStreetPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowStreetPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStreetPicker(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Street</Text>
              <TouchableOpacity onPress={() => setShowStreetPicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {streetOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.modalOption}
                  onPress={() => {
                    setStreet(option);
                    setShowStreetPicker(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Map Modal for Location Pinning */}
      <Modal
        visible={showMapModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowMapModal(false)}
      >
        <View style={[styles.mapModalContainer, { paddingTop: insets.top }]}>
          <View style={styles.mapModalHeader}>
            <Text style={styles.mapModalTitle}>Pin Your Location</Text>
            <TouchableOpacity onPress={() => setShowMapModal(false)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.mapModalSubtitle}>Tap on the map to mark your exact location</Text>
          <WebView
            ref={mapWebViewRef}
            source={{ html: generateMapHTML(location) }}
            style={styles.mapWebView}
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'locationPinned' || data.type === 'searchLocation') {
                  // Update location but keep modal open
                  setLocation({
                    latitude: data.latitude,
                    longitude: data.longitude,
                  });
                  // Don't close modal - let user continue adjusting or close manually
                } else if (data.type === 'confirmLocation') {
                  setLocation({
                    latitude: data.latitude,
                    longitude: data.longitude,
                  });
                  clearError('location');
                  setShowMapModal(false);
                }
              } catch (error) {
                console.error('Error parsing map message:', error);
              }
            }}
            onLoadEnd={() => {
              // If location exists, update marker after map loads
              if (location && mapWebViewRef.current) {
                const updateMarkerScript = `
                  if (typeof map !== 'undefined' && map) {
                    if (marker) {
                      marker.setMap(null);
                    }
                    marker = new google.maps.Marker({
                      position: { lat: ${location.latitude}, lng: ${location.longitude} },
                      map: map,
                      draggable: true,
                      icon: {
                        url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                      },
                    });
                    map.setCenter({ lat: ${location.latitude}, lng: ${location.longitude} });
                    map.setZoom(17);
                    
                    marker.addListener('dragend', (e) => {
                      const lat = e.latLng.lat();
                      const lng = e.latLng.lng();
                      if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'locationPinned',
                          latitude: lat,
                          longitude: lng,
                        }));
                      }
                    });
                  }
                `;
                mapWebViewRef.current.injectJavaScript(updateMarkerScript);
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        </View>
      </Modal>

      {/* Relation Picker Modal */}
      <Modal
        visible={showRelationPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRelationPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowRelationPicker(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Relation</Text>
              <TouchableOpacity onPress={() => setShowRelationPicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {relationOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.modalOption}
                  onPress={() => {
                    setTenantRelation(option);
                    setShowRelationPicker(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 35,
    paddingBottom: Math.max(10, height * 0.012),
    paddingHorizontal: Math.max(16, width * 0.05),
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  logo: {
    width: Math.min(width * 0.35, 140),
    height: Math.min(width * 0.14, 56),
    maxWidth: 140,
    maxHeight: 56,
    minWidth: 100,
    minHeight: 40,
    marginBottom: Math.max(8, height * 0.01),
  },
  title: {
    fontSize: Math.max(16, Math.min(width * 0.045, 20)),
    fontWeight: '400',
    color: '#111827',
  },
  progressContainer: {
    padding: Math.max(12, width * 0.04),
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#111827',
    borderRadius: 2,
  },
  progressText: {
    fontSize: Math.max(11, Math.min(width * 0.03, 13)),
    color: '#6b7280',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Math.max(12, width * 0.05),
    alignItems: 'stretch',
    paddingBottom: Math.max(20, height * 0.03),
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: Math.max(16, Math.min(width * 0.08, 32)),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
  },
  stepContent: {
    width: '100%',
  },
  stepTitle: {
    fontSize: Math.max(18, Math.min(width * 0.05, 22)),
    fontWeight: '400',
    color: '#111827',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: Math.max(12, Math.min(width * 0.035, 15)),
    color: '#6b7280',
    marginBottom: Math.max(16, height * 0.02),
  },
  form: {
    width: '100%',
    gap: 16,
  },
  formGroup: {
    gap: Math.max(4, width * 0.015),
    marginBottom: Math.max(12, height * 0.015),
  },
  label: {
    color: '#374151',
    fontWeight: '400',
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
  },
  subLabel: {
    color: '#6b7280',
    fontSize: Math.max(11, Math.min(width * 0.03, 13)),
    marginBottom: 8,
  },
  input: {
    padding: Math.max(10, width * 0.03),
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
    backgroundColor: '#ffffff',
    color: '#111827',
    minHeight: 44,
  },
  inputError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: Math.max(11, Math.min(width * 0.03, 13)),
    color: '#ef4444',
    marginTop: 4,
  },
  datePickerButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  datePickerText: {
    fontSize: 14,
    color: '#111827',
  },
  datePickerPlaceholder: {
    color: '#9ca3af',
  },
  ageText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  pickerButton: {
    padding: Math.max(10, width * 0.03),
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  pickerButtonMargin: {
    marginTop: 8,
  },
  pickerText: {
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
    color: '#111827',
    flex: 1,
  },
  pickerPlaceholder: {
    color: '#9ca3af',
  },
  pickerIcon: {
    fontSize: Math.max(10, Math.min(width * 0.028, 12)),
    color: '#6b7280',
    marginLeft: 8,
  },
  switchButton: {
    marginTop: 8,
    padding: 8,
    alignItems: 'center',
  },
  switchButtonText: {
    fontSize: 12,
    color: '#111827',
    textDecorationLine: 'underline',
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
  checkboxError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
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
  radioGroup: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'transparent',
  },
  radioInnerSelected: {
    backgroundColor: '#111827',
  },
  radioLabel: {
    color: '#374151',
    fontSize: 14,
  },
  idContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  idItem: {
    flex: 1,
    gap: 8,
  },
  idLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  idImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  idUploadButton: {
    padding: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  idUploadButtonError: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
    backgroundColor: '#fef2f2',
  },
  idUploadText: {
    fontSize: 12,
    color: '#6b7280',
  },
  documentsContainer: {
    marginTop: 8,
    gap: 12,
  },
  documentItem: {
    gap: 8,
  },
  documentLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '400',
  },
  documentImageContainer: {
    gap: 8,
  },
  documentImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  removeDocumentButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
  },
  removeDocumentText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
  },
  documentUploadButton: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  documentUploadText: {
    fontSize: 12,
    color: '#6b7280',
  },
  reviewContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    maxHeight: height * 0.5,
  },
  reviewSectionTitle: {
    fontSize: Math.max(14, Math.min(width * 0.038, 16)),
    color: '#111827',
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  reviewSection: {
    marginBottom: 12,
  },
  reviewLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  reviewValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '400',
  },
  reviewImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 4,
    resizeMode: 'cover',
  },
  navigationContainer: {
    flexDirection: 'row',
    padding: Math.max(12, width * 0.04),
    gap: Math.max(8, width * 0.02),
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  backButton: {
    flex: 1,
    padding: Math.max(10, width * 0.03),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
    color: '#374151',
    fontWeight: '500',
  },
  signInButton: {
    padding: Math.max(10, width * 0.03),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    minHeight: 44,
    justifyContent: 'center',
    marginRight: Math.max(8, width * 0.02),
  },
  signInButtonText: {
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
    color: '#374151',
    fontWeight: '400',
  },
  nextButton: {
    flex: 1,
    padding: Math.max(10, width * 0.03),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#111827',
    minHeight: 44,
    justifyContent: 'center',
  },
  nextButtonFull: {
    flex: 1,
  },
  nextButtonText: {
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
    color: '#ffffff',
    fontWeight: '500',
  },
  submitButton: {
    padding: Math.max(10, width * 0.03),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#111827',
    minHeight: 44,
    justifyContent: 'center',
  },
  submitButtonFull: {
    flex: 1,
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
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
    fontWeight: '400',
  },
  formNavigationButtons: {
    flexDirection: 'row',
    marginTop: Math.max(20, height * 0.025),
    gap: Math.max(8, width * 0.02),
    paddingTop: Math.max(16, height * 0.02),
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  formNavigationButtonsStep1: {
    flexDirection: 'column',
    marginTop: Math.max(20, height * 0.025),
    gap: Math.max(12, height * 0.015),
    paddingTop: Math.max(16, height * 0.02),
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  backButtonInline: {
    flex: 1,
    padding: Math.max(12, width * 0.033),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    minHeight: 48,
    justifyContent: 'center',
  },
  backButtonTextInline: {
    fontSize: Math.max(14, Math.min(width * 0.038, 16)),
    color: '#374151',
    fontWeight: '500',
  },
  nextButtonInline: {
    flex: 1,
    padding: Math.max(12, width * 0.033),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#111827',
    minHeight: 48,
    justifyContent: 'center',
  },
  nextButtonInlineFull: {
    flex: 1,
  },
  nextButtonTextInline: {
    fontSize: Math.max(14, Math.min(width * 0.038, 16)),
    color: '#ffffff',
    fontWeight: '500',
  },
  submitButtonInline: {
    flex: 1,
    padding: Math.max(12, width * 0.033),
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#111827',
    minHeight: 48,
    justifyContent: 'center',
  },
  submitButtonInlineFull: {
    flex: 1,
  },
  submitButtonInlineDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.6,
  },
  submitButtonTextInline: {
    fontSize: Math.max(14, Math.min(width * 0.038, 16)),
    color: '#ffffff',
    fontWeight: '500',
  },
  submitButtonTextInlineDisabled: {
    color: '#6b7280',
  },
  buttonContentInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signInLinkInline: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  signInLinkTextInline: {
    color: '#6b7280',
    fontSize: 14,
  },
  signInLinkBoldInline: {
    color: '#111827',
    fontWeight: '500',
  },
  loginLink: {
    padding: 16,
    paddingTop: 16,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loginLinkText: {
    color: '#6b7280',
    fontSize: 14,
  },
  loginLinkBold: {
    color: '#111827',
    fontWeight: '500',
  },
  mapButton: {
    padding: Math.max(10, width * 0.03),
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    minHeight: 44,
    justifyContent: 'center',
  },
  mapButtonText: {
    fontSize: Math.max(13, Math.min(width * 0.037, 15)),
    color: '#111827',
  },
  mapButtonPlaceholder: {
    color: '#9ca3af',
  },
  mapModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  mapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Math.max(16, width * 0.04),
    paddingTop: Math.max(12, width * 0.03),
    paddingBottom: Math.max(12, width * 0.03),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  mapModalTitle: {
    fontSize: Math.max(18, Math.min(width * 0.05, 20)),
    fontWeight: '500',
    color: '#111827',
  },
  mapModalSubtitle: {
    fontSize: Math.max(12, Math.min(width * 0.035, 14)),
    color: '#6b7280',
    paddingHorizontal: Math.max(16, width * 0.04),
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#f9fafb',
  },
  mapWebView: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Math.max(16, width * 0.05),
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: Math.min(height * 0.8, 600),
    paddingBottom: Math.max(16, height * 0.02),
    width: '100%',
    maxWidth: Math.min(width * 0.9, 400),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalScrollView: {
    maxHeight: Math.min(height * 0.6, 500),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Math.max(12, width * 0.04),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: Math.max(16, Math.min(width * 0.045, 20)),
    fontWeight: '400',
    color: '#111827',
    flex: 1,
  },
  modalCloseText: {
    fontSize: Math.max(20, Math.min(width * 0.06, 24)),
    color: '#6b7280',
    padding: 4,
  },
  modalOption: {
    padding: Math.max(14, width * 0.04),
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    minHeight: 48,
    justifyContent: 'center',
  },
  modalOptionText: {
    fontSize: Math.max(14, Math.min(width * 0.04, 17)),
    color: '#111827',
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
});
