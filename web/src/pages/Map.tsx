import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

function Map() {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [map, setMap] = useState<any>(null);
  const [selectedPlace, setSelectedPlace] = useState<string>('');
  const [isViewLocked, setIsViewLocked] = useState(() => {
    // Restore lock state from localStorage
    const saved = localStorage.getItem('mapViewLocked');
    return saved === 'true';
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [residentMarkers, setResidentMarkers] = useState<any[]>([]);
  const [residentData, setResidentData] = useState<any[]>([]);
  const [residentSearchQuery, setResidentSearchQuery] = useState<string>('');
  const [residentSearchSuggestions, setResidentSearchSuggestions] = useState<any[]>([]);
  const [showResidentSuggestions, setShowResidentSuggestions] = useState(false);
  const residentSearchInputRef = useRef<HTMLInputElement>(null);
  const residentSuggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const isAdmin = await isSuperadmin(user);
        if (!isAdmin) {
          navigate('/');
        } else {
          setIsLoading(false);
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (isLoading || !mapRef.current) return;

    // Check if Google Maps script is already loaded
    if (window.google && window.google.maps) {
      initializeMap();
      return;
    }

    // Load Google Maps script with Places library for autocomplete
    const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyByXb-FgYHiNhVIsK00kM1jdXYr_OerV7Q";
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      initializeMap();
    };

    script.onerror = () => {
      console.error('Failed to load Google Maps script');
      alert('Failed to load Google Maps. Please check your API key configuration.');
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup: remove script if component unmounts
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [isLoading]);

  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps) {
      console.error('Google Maps not loaded');
      return;
    }

    // Get saved map state from localStorage
    const savedLockState = localStorage.getItem('mapViewLocked') === 'true';
    const savedCenter = localStorage.getItem('mapCenter');
    const savedZoom = localStorage.getItem('mapZoom');
    const savedPlace = localStorage.getItem('selectedPlace');
    
    // Use saved location or default to Manila
    let initialCenter = { lat: 14.5995, lng: 120.9842 };
    let initialZoom = 15;
    
    if (savedCenter) {
      try {
        const center = JSON.parse(savedCenter);
        initialCenter = { lat: center.lat, lng: center.lng };
      } catch (e) {
        console.error('Error parsing saved center:', e);
      }
    }
    
    if (savedZoom) {
      try {
        initialZoom = parseInt(savedZoom, 10);
      } catch (e) {
        console.error('Error parsing saved zoom:', e);
      }
    }
    
    if (savedPlace) {
      setSelectedPlace(savedPlace);
    }
    
    const mapInstance = new window.google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      zoomControl: true,
      zoomControlOptions: {
        position: window.google.maps.ControlPosition.LEFT_CENTER,
      },
      mapTypeId: window.google.maps.MapTypeId.SATELLITE,
      disableDefaultUI: false,
      gestureHandling: savedLockState ? 'none' : 'auto',
      draggable: !savedLockState,
    });

    // Store current map center for location bias
    setCurrentLocation(initialCenter);
    
    // Update location when map center changes and save to localStorage
    mapInstance.addListener('center_changed', () => {
      const center = mapInstance.getCenter();
      if (center) {
        const lat = typeof center.lat === 'function' ? center.lat() : center.lat;
        const lng = typeof center.lng === 'function' ? center.lng() : center.lng;
        const location = { lat, lng };
        setCurrentLocation(location);
        // Save center to localStorage
        localStorage.setItem('mapCenter', JSON.stringify(location));
      }
    });
    
    // Save zoom when it changes
    mapInstance.addListener('zoom_changed', () => {
      const zoom = mapInstance.getZoom();
      if (zoom !== undefined) {
        localStorage.setItem('mapZoom', String(zoom));
      }
    });

    // Only add marker if locked to a specific place
    if (savedLockState && savedPlace) {
      new window.google.maps.Marker({
        position: initialCenter,
        map: mapInstance,
        title: savedPlace,
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
        },
      });
    }

    // User location detection removed - do not display admin location on map

    setMap(mapInstance);
    
    // Restore lock state after map is initialized (savedLockState already declared above)
    if (savedLockState) {
      setIsViewLocked(true);
      // Lock state is already applied in map initialization, but ensure it's set
      mapInstance.setOptions({
        gestureHandling: 'none',
        draggable: false,
      });
    }
  };

  // Fetch verified residents and display markers
  const fetchAndDisplayResidents = useCallback((snapshot: any) => {
    if (!map || !db || !window.google) {
      console.log('Map, db, or google not ready:', { map: !!map, db: !!db, google: !!window.google });
      return;
    }

    try {
      console.log('Processing residents from users collection...');
      const markers: any[] = [];
      const residents: any[] = [];
      let totalUsers = 0;
      let usersWithLocation = 0;

      snapshot.forEach((doc: any) => {
        totalUsers++;
        const data = doc.data();
        
        // Skip superadmin accounts
        if (data.role === 'superadmin') {
          return;
        }

        // Filter: only include approved residents or residents without status (assume approved)
        // Exclude archived, rejected, pending, and deactivated
        const status = data.status;
        if (status === 'archived' || status === 'rejected' || status === 'pending' || status === 'deactivated') {
          return;
        }

        // Only add marker if resident has location
        // Check for both possible location formats: {latitude, longitude} or {lat, lng}
        const location = data.location;
        let lat: number | null = null;
        let lng: number | null = null;

        if (location) {
          if (location.latitude !== undefined && location.longitude !== undefined) {
            lat = typeof location.latitude === 'number' ? location.latitude : parseFloat(location.latitude);
            lng = typeof location.longitude === 'number' ? location.longitude : parseFloat(location.longitude);
          } else if (location.lat !== undefined && location.lng !== undefined) {
            lat = typeof location.lat === 'number' ? location.lat : parseFloat(location.lat);
            lng = typeof location.lng === 'number' ? location.lng : parseFloat(location.lng);
          }
        }

        const fullName = data.fullName || 
          `${data.firstName || ''} ${data.middleName || ''} ${data.lastName || ''}`.trim() ||
          'Resident';

        // Store resident data for search
        const residentInfo = {
          id: doc.id,
          fullName,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          address: data.address ? `${data.address.block || ''} ${data.address.lot || ''} ${data.address.street || ''}`.trim() : '',
          lat,
          lng,
          data,
        };
        residents.push(residentInfo);

        if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
          usersWithLocation++;
          
          // Determine if homeowner or tenant
          // A user is a tenant if: residentType === 'tenant' OR isTenant === true
          // Otherwise, they are a homeowner
          const isTenant = data.residentType === 'tenant' || data.isTenant === true;
          const isHomeowner = !isTenant;
          
          // Determine marker color: green for homeowner, grey for tenant
          // Both use the same marker style, just different colors
          let markerIcon;
          if (isHomeowner) {
            // Green marker for homeowners
            markerIcon = {
              url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
              scaledSize: new window.google.maps.Size(32, 32),
            };
          } else {
            // Blue marker for tenants - same style as homeowner, just different color
            markerIcon = {
              url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              scaledSize: new window.google.maps.Size(32, 32),
            };
          }
          
          console.log(`Adding marker for ${fullName} at ${lat}, ${lng} (${isHomeowner ? 'green' : 'grey'}, residentType: ${data.residentType}, isTenant: ${data.isTenant}, isHomeowner: ${isHomeowner})`);
          
          try {
            const marker = new window.google.maps.Marker({
              position: {
                lat: lat,
                lng: lng,
              },
              map: map,
              title: fullName,
              icon: markerIcon,
              visible: true,
              zIndex: 1000,
              animation: window.google.maps.Animation.DROP,
            });

            // Verify marker is on the map
            const markerPosition = marker.getPosition();
            const markerMap = marker.getMap();
            console.log(`Marker created successfully for ${fullName}`, {
              position: markerPosition ? { lat: markerPosition.lat(), lng: markerPosition.lng() } : null,
              map: markerMap ? 'attached' : 'not attached',
              visible: marker.getVisible(),
              iconType: isHomeowner ? 'green' : 'grey',
              isHomeowner: isHomeowner,
              isTenant: isTenant,
            });
            
            // Force marker to be visible
            if (!markerMap) {
              console.warn(`Marker for ${fullName} is not attached to map, attempting to fix...`);
              marker.setMap(map);
            }

            // Add info window with resident details
            const infoWindow = new window.google.maps.InfoWindow({
              content: `
                <div style="padding: 8px; min-width: 200px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${fullName}</h3>
                  <p style="margin: 4px 0; font-size: 12px; color: #666;">
                    <strong>Type:</strong> ${isHomeowner ? 'Homeowner' : 'Tenant'}
                  </p>
                  ${data.address ? `
                    <p style="margin: 4px 0; font-size: 12px; color: #666;">
                      <strong>Address:</strong> ${data.address.block || ''}, ${data.address.lot || ''}, ${data.address.street || ''}
                    </p>
                  ` : ''}
                </div>
              `,
            });

            marker.addListener('click', () => {
              infoWindow.open(map, marker);
            });

            // Store resident info with marker for search functionality
            (marker as any).residentInfo = residentInfo;
            (marker as any).infoWindow = infoWindow;

            markers.push(marker);
          } catch (markerError) {
            console.error(`Error creating marker for ${fullName}:`, markerError);
          }
        } else {
          console.log(`User ${doc.id} has no valid location data:`, data.location, { lat, lng });
        }
      });

      console.log(`Total users: ${totalUsers}, Users with location: ${usersWithLocation}, Markers created: ${markers.length}`);

      setResidentData(residents);
      setResidentMarkers(prevMarkers => {
        // Clear previous markers
        prevMarkers.forEach(marker => {
          marker.setMap(null);
        });
        return markers;
      });
    } catch (error) {
      console.error('Error processing residents:', error);
    }
  }, [map, db]);

  // Set up real-time listener for residents when map is ready
  useEffect(() => {
    if (!map || isLoading || !db) {
      return;
    }

    console.log('Map is ready, setting up real-time listener for residents...');
    
    // Set up real-time listener for users collection
    const usersCollection = collection(db, 'users');
    const unsubscribe = onSnapshot(
      usersCollection,
      (snapshot) => {
        console.log('Users collection updated, refreshing markers...');
        fetchAndDisplayResidents(snapshot);
      },
      (error) => {
        console.error('Error in real-time listener:', error);
      }
    );

    // Cleanup listener on unmount
    return () => {
      console.log('Cleaning up real-time listener');
      unsubscribe();
    };
  }, [map, isLoading, db, fetchAndDisplayResidents]);

  // Clean up markers when component unmounts
  useEffect(() => {
    return () => {
      residentMarkers.forEach(marker => {
        marker.setMap(null);
      });
    };
  }, [residentMarkers]);

  // Search using Geocoding API (fallback)
  const handleSearchWithGeocoding = useCallback((query: string) => {
    if (!map) return;

    setIsSearching(true);
    try {
      const geocoder = new window.google.maps.Geocoder();
      const request = {
        address: query + ', Philippines',
        region: 'ph',
      };

      geocoder.geocode(request, (results: any[], status: string) => {
        setIsSearching(false);
        
        if (status === 'OK' && results && results.length > 0) {
          const result = results[0];
          const location = result.geometry.location;
          const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
          const lng = typeof location.lng === 'function' ? location.lng() : location.lng;

          // Center map on searched location
          map.setCenter({ lat, lng });
          map.setZoom(17);
          
          // Save center and zoom to localStorage
          localStorage.setItem('mapCenter', JSON.stringify({ lat, lng }));
          localStorage.setItem('mapZoom', '17');

          // Don't add marker - just center the map

          // Don't set selectedPlace since we're not locking the view
          // Save place to localStorage for reference but don't show unlock button
          localStorage.setItem('selectedPlace', result.formatted_address);
          // Don't lock the view - allow user to pan and zoom
        } else if (status === 'ZERO_RESULTS') {
          alert('No results found for your search. Please try a different location.');
        } else {
          console.error('Geocoding error:', status);
          alert('Search failed. Please try again.');
        }
      });
    } catch (error) {
      setIsSearching(false);
      console.error('Error searching:', error);
      alert('Search failed. Please try again.');
    }
  }, [map]);

  // Handle selecting a suggestion
  const handleSelectSuggestion = useCallback((placeId: string, description: string) => {
    if (!map || !window.google?.maps?.places) return;

    setSearchQuery(description);
    setShowSuggestions(false);
    setIsSearching(true);

    const service = new window.google.maps.places.PlacesService(map);
    service.getDetails(
      {
        placeId: placeId,
        fields: ['geometry', 'formatted_address', 'name'],
      },
      (place: any, status: string) => {
        setIsSearching(false);
        
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          const location = place.geometry.location;
          const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
          const lng = typeof location.lng === 'function' ? location.lng() : location.lng;

          // Center map on searched location
          map.setCenter({ lat, lng });
          map.setZoom(17);
          
          // Save center and zoom to localStorage
          localStorage.setItem('mapCenter', JSON.stringify({ lat, lng }));
          localStorage.setItem('mapZoom', '17');

          // Don't add marker - just center the map

          const placeName = place.formatted_address || place.name || description;
          // Don't set selectedPlace since we're not locking the view
          // Save place to localStorage for reference but don't show unlock button
          localStorage.setItem('selectedPlace', placeName);
          // Don't lock the view - allow user to pan and zoom
        } else {
          // Fallback to Geocoding API if Places API fails
          handleSearchWithGeocoding(description);
        }
      }
    );
  }, [map, handleSearchWithGeocoding]);

  // Search using Geocoding API (alternative to Places Autocomplete)
  const handleSearch = useCallback(async () => {
    if (!map || !searchQuery.trim()) return;
    handleSearchWithGeocoding(searchQuery);
  }, [map, searchQuery, handleSearchWithGeocoding]);

  // Get autocomplete suggestions as user types
  useEffect(() => {
    if (!window.google?.maps?.places?.AutocompleteService || !searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const autocompleteService = new window.google.maps.places.AutocompleteService();
    const timer = setTimeout(() => {
      const request: any = {
        input: searchQuery,
        componentRestrictions: { country: 'ph' },
        types: ['geocode', 'establishment'],
      };

      // Add location bias to prioritize nearest places
      if (currentLocation) {
        // Create a circle around current location for bias
        const circle = new window.google.maps.Circle({
          center: currentLocation,
          radius: 50000, // 50km radius
        });
        request.locationBias = circle.getBounds();
      } else if (map) {
        // Fallback to map bounds if current location not available
        const bounds = map.getBounds();
        if (bounds) {
          request.locationBias = bounds;
        }
      }

      autocompleteService.getPlacePredictions(
        request,
        (predictions: any[], status: string) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            // Sort predictions by distance if we have a current location
            let sortedPredictions = predictions;
            if (currentLocation && predictions.length > 0) {
              sortedPredictions = [...predictions].sort((a, b) => {
                // Calculate approximate distance (Haversine formula simplified)
                const getDistance = (_prediction: any) => {
                  // Try to extract location from prediction if available
                  // Since we don't have coordinates in predictions, we'll use the order from Google
                  // which already prioritizes by location bias
                  return 0; // Google already sorts by relevance and location bias
                };
                return getDistance(a) - getDistance(b);
              });
            }
            setSuggestions(sortedPredictions);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        }
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, currentLocation, map]);

  // Filter markers based on resident search query
  useEffect(() => {
    if (!map || residentMarkers.length === 0) return;

    const query = residentSearchQuery.toLowerCase().trim();
    
    residentMarkers.forEach((marker) => {
      const residentInfo = (marker as any).residentInfo;
      if (!residentInfo) {
        marker.setVisible(true);
        return;
      }

      const matchesSearch = 
        !query ||
        residentInfo.fullName.toLowerCase().includes(query) ||
        residentInfo.firstName.toLowerCase().includes(query) ||
        residentInfo.lastName.toLowerCase().includes(query) ||
        residentInfo.email.toLowerCase().includes(query) ||
        residentInfo.address.toLowerCase().includes(query);

      marker.setVisible(matchesSearch);
    });
  }, [residentSearchQuery, residentMarkers, map]);

  // Generate resident search suggestions
  useEffect(() => {
    if (!residentSearchQuery.trim() || residentSearchQuery.length < 2) {
      setResidentSearchSuggestions([]);
      setShowResidentSuggestions(false);
      return;
    }

    const query = residentSearchQuery.toLowerCase().trim();
    const filtered = residentData
      .filter((resident) => {
        return (
          resident.fullName.toLowerCase().includes(query) ||
          resident.firstName.toLowerCase().includes(query) ||
          resident.lastName.toLowerCase().includes(query) ||
          resident.email.toLowerCase().includes(query) ||
          resident.address.toLowerCase().includes(query)
        );
      })
      .slice(0, 5); // Limit to 5 suggestions

    setResidentSearchSuggestions(filtered);
    setShowResidentSuggestions(filtered.length > 0);
  }, [residentSearchQuery, residentData]);

  // Handle selecting a resident from suggestions
  const handleSelectResident = useCallback((resident: any) => {
    if (!map || !resident.lat || !resident.lng) return;

    setResidentSearchQuery(resident.fullName);
    setShowResidentSuggestions(false);

    // Find the marker for this resident
    const marker = residentMarkers.find((m) => {
      const info = (m as any).residentInfo;
      return info && info.id === resident.id;
    });

    if (marker) {
      // Center map on resident location
      map.setCenter({ lat: resident.lat, lng: resident.lng });
      map.setZoom(18);

      // Open info window
      const infoWindow = (marker as any).infoWindow;
      if (infoWindow) {
        infoWindow.open(map, marker);
      }
    }
  }, [map, residentMarkers]);

  // Close suggestions when clicking outside
  useEffect(() => {
    // Use mousedown with capture phase to catch events early, but allow suggestions to handle their own clicks
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // If clicking inside suggestions, don't close
      if (suggestionsRef.current?.contains(target)) {
        return;
      }
      
      // If clicking on search input, don't close
      if (searchInputRef.current?.contains(target)) {
        return;
      }

      // If clicking inside resident suggestions, don't close
      if (residentSuggestionsRef.current?.contains(target)) {
        return;
      }
      
      // If clicking on resident search input, don't close
      if (residentSearchInputRef.current?.contains(target)) {
        return;
      }
      
      // Close if clicking outside
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(target) &&
        residentSuggestionsRef.current &&
        !residentSuggestionsRef.current.contains(target) &&
        residentSearchInputRef.current &&
        !residentSearchInputRef.current.contains(target)
      ) {
        // Use setTimeout to allow click events to fire first
        setTimeout(() => {
          setShowSuggestions(false);
          setShowResidentSuggestions(false);
        }, 0);
      }
    };

    document.addEventListener('mousedown', handleMouseDown, false);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, false);
    };
  }, []);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-600">Loading...</div>
        </div>
      </Layout>
    );
  }

  const handleUnlockView = () => {
    setIsViewLocked(false);
    // Save lock state to localStorage
    localStorage.setItem('mapViewLocked', 'false');
    localStorage.removeItem('selectedPlace');
    setSelectedPlace('');
    if (map) {
      // Save current center and zoom before unlocking
      const center = map.getCenter();
      if (center) {
        const lat = typeof center.lat === 'function' ? center.lat() : center.lat;
        const lng = typeof center.lng === 'function' ? center.lng() : center.lng;
        localStorage.setItem('mapCenter', JSON.stringify({ lat, lng }));
      }
      const zoom = map.getZoom();
      if (zoom !== undefined) {
        localStorage.setItem('mapZoom', String(zoom));
      }
      
      map.setOptions({
        gestureHandling: 'auto',
        draggable: true,
      });
    }
    setSearchQuery('');
  };

  const handleToggleLock = () => {
    if (!map) return;
    
    const newLockState = !isViewLocked;
    setIsViewLocked(newLockState);
    // Save lock state to localStorage
    localStorage.setItem('mapViewLocked', String(newLockState));
    
    // Save current center and zoom
    const center = map.getCenter();
    if (center) {
      const lat = typeof center.lat === 'function' ? center.lat() : center.lat;
      const lng = typeof center.lng === 'function' ? center.lng() : center.lng;
      localStorage.setItem('mapCenter', JSON.stringify({ lat, lng }));
    }
    const zoom = map.getZoom();
    if (zoom !== undefined) {
      localStorage.setItem('mapZoom', String(zoom));
    }
    
    if (newLockState) {
      // Lock the view
      map.setOptions({
        gestureHandling: 'none',
        draggable: false,
      });
    } else {
      // Unlock the view
      map.setOptions({
        gestureHandling: 'auto',
        draggable: true,
      });
      localStorage.removeItem('selectedPlace');
      setSelectedPlace('');
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 w-full flex flex-col" style={{ height: '100vh' }}>
        <Header 
          title="Map" 
          showSearchBar={true}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleSearch={handleSearch}
          isSearching={isSearching}
          searchInputRef={searchInputRef}
          selectedPlace={selectedPlace}
          onUnlockView={handleUnlockView}
          suggestions={suggestions}
          showSuggestions={showSuggestions}
          onSelectSuggestion={handleSelectSuggestion}
          suggestionsRef={suggestionsRef}
          isViewLocked={isViewLocked}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {isViewLocked && (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-sm text-blue-800 font-medium">
                  View is locked to selected location. Use "Unlock" to enable panning.
                </p>
              </div>
            </div>
          )}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden m-4 md:m-6 lg:m-8 min-h-0 relative">
            {/* Resident Search Bar */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-md px-4">
              <div className="relative">
                <input
                  ref={residentSearchInputRef}
                  type="text"
                  value={residentSearchQuery}
                  onChange={(e) => setResidentSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (residentSearchSuggestions.length > 0) {
                      setShowResidentSuggestions(true);
                    }
                  }}
                  placeholder="Search residents by name, email, or address..."
                  className="w-full px-4 py-2 pl-10 pr-10 border border-gray-300 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <svg
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {residentSearchQuery && (
                  <button
                    onClick={() => {
                      setResidentSearchQuery('');
                      setShowResidentSuggestions(false);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {/* Resident Suggestions Dropdown */}
                {showResidentSuggestions && residentSearchSuggestions.length > 0 && (
                  <div
                    ref={residentSuggestionsRef}
                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20"
                  >
                    {residentSearchSuggestions.map((resident) => (
                      <div
                        key={resident.id}
                        onClick={() => handleSelectResident(resident)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium text-gray-900 text-sm">{resident.fullName}</div>
                        {resident.email && (
                          <div className="text-xs text-gray-500 mt-1">{resident.email}</div>
                        )}
                        {resident.address && (
                          <div className="text-xs text-gray-500">{resident.address}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div 
              ref={mapRef} 
              className="w-full h-full"
            />
            {/* Lock/Unlock Button - Positioned bottom-right to avoid Google Maps controls */}
            <button
              onClick={handleToggleLock}
              className="absolute bottom-4 right-4 z-10 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-md px-4 py-2 flex items-center gap-2 text-sm font-medium text-gray-700 transition-colors"
              title={isViewLocked ? 'Unlock View' : 'Lock View'}
            >
              {isViewLocked ? (
                <>
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  <span className="hidden sm:inline">Unlock View</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="hidden sm:inline">Lock View</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Map;

