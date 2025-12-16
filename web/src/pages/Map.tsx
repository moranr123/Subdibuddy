import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
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
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

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

      // Group residents by address (block, lot, street)
      // Using plain object instead of Map to avoid naming conflicts
      const addressGroups: Record<string, {
        homeowner: any | null;
        tenants: any[];
        location: { lat: number; lng: number } | null;
      }> = {};

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

        // Determine if homeowner or tenant
        const isTenant = data.residentType === 'tenant' || data.isTenant === true;
        const isHomeowner = !isTenant;

        // Get location (only homeowners have location)
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

        // Create address key
        const addressKey = data.address 
          ? `${data.address.block || ''}_${data.address.lot || ''}_${data.address.street || ''}`
          : null;

        if (!addressKey) {
          return; // Skip residents without address
        }

        // Store resident data for search
        const availabilityStatus = data.availabilityStatus || 'unavailable';
        const residentInfo = {
          id: doc.id,
          fullName,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          address: data.address ? `${data.address.block || ''} ${data.address.lot || ''} ${data.address.street || ''}`.trim() : '',
          lat,
          lng,
          availabilityStatus,
          data,
        };
        residents.push(residentInfo);

        // Group by address
        if (!addressGroups[addressKey]) {
          addressGroups[addressKey] = {
            homeowner: null,
            tenants: [],
            location: null,
          };
        }

        const group = addressGroups[addressKey];

        if (isHomeowner) {
          group.homeowner = { doc, data, residentInfo, lat, lng };
          if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
            group.location = { lat, lng };
            usersWithLocation++;
          }
        } else {
          group.tenants.push({ doc, data, residentInfo });
        }
      });

      // Create one marker per address group
      Object.entries(addressGroups).forEach(([addressKey, group]) => {
        // Only create marker if there's a homeowner with location
        if (!group.homeowner || !group.location) {
          return;
        }

        const homeowner = group.homeowner;
        const homeownerData = homeowner.data;
        const homeownerInfo = homeowner.residentInfo;
        const availabilityStatus = homeownerData.availabilityStatus || 'unavailable';

        // Determine marker color based on homeowner availability
        let markerIcon;
        if (availabilityStatus === 'available') {
          markerIcon = {
            url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
            scaledSize: new window.google.maps.Size(32, 32),
          };
        } else {
          markerIcon = {
            url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            scaledSize: new window.google.maps.Size(32, 32),
          };
        }

        try {
          const marker = new window.google.maps.Marker({
            position: group.location,
            map: map,
            title: homeownerInfo.fullName,
            icon: markerIcon,
            visible: true,
            zIndex: 1000,
            animation: window.google.maps.Animation.DROP,
          });

          // Create info window with homeowner and tenant information
          const availabilityText = availabilityStatus === 'available' ? 'Available (Green)' : 'Unavailable (Blue)';
          
          // Build tenant names list
          const tenantNames = group.tenants.map(tenant => tenant.residentInfo.fullName);
          const tenantList = tenantNames.length > 0 ? tenantNames.join(', ') : 'None';

          const infoWindow = new window.google.maps.InfoWindow({
            content: `
              <div style="padding: 8px; min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${homeownerInfo.fullName}</h3>
                <p style="margin: 4px 0; font-size: 12px; color: #666;">
                  <strong>Type:</strong> Homeowner
                </p>
                <p style="margin: 4px 0; font-size: 12px; color: #666;">
                  <strong>Status:</strong> ${availabilityText}
                </p>
                ${homeownerData.address ? `
                  <p style="margin: 4px 0; font-size: 12px; color: #666;">
                    <strong>Address:</strong> ${homeownerData.address.block || ''}, ${homeownerData.address.lot || ''}, ${homeownerData.address.street || ''}
                  </p>
                ` : ''}
                <p style="margin: 4px 0; font-size: 12px; color: #666;">
                  <strong>Tenants:</strong> ${tenantList}
                </p>
              </div>
            `,
          });

          marker.addListener('click', () => {
            infoWindow.open(map, marker);
          });

          // Store resident info with marker for search functionality
          (marker as any).residentInfo = homeownerInfo;
          (marker as any).infoWindow = infoWindow;
          (marker as any).addressKey = addressKey;

          markers.push(marker);
        } catch (markerError) {
          console.error(`Error creating marker for address ${addressKey}:`, markerError);
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

  // Filter markers based on resident search query and availability filter
  useEffect(() => {
    if (!map || residentMarkers.length === 0 || !residentData.length) return;

    const query = residentSearchQuery.toLowerCase().trim();
    
    // If there's a search query, check if any resident (homeowner or tenant) at that address matches
    residentMarkers.forEach((marker) => {
      const residentInfo = (marker as any).residentInfo;
      if (!residentInfo) {
        marker.setVisible(false);
        return;
      }

      // Check if homeowner matches search query
      let matchesSearch = 
        !query ||
        residentInfo.fullName.toLowerCase().includes(query) ||
        residentInfo.firstName.toLowerCase().includes(query) ||
        residentInfo.lastName.toLowerCase().includes(query) ||
        residentInfo.email.toLowerCase().includes(query) ||
        residentInfo.address.toLowerCase().includes(query);

      // If homeowner doesn't match, check if any tenant at this address matches
      if (!matchesSearch && query) {
        const addressKey = (marker as any).addressKey;
        if (addressKey) {
          // Find tenants at this address by matching address key
          const tenantsAtAddress = residentData.filter((resident) => {
            const isTenant = resident.data?.isTenant === true || resident.data?.residentType === 'tenant';
            if (!isTenant) return false;
            
            // Create address key for resident
            if (resident.data?.address) {
              const residentAddressKey = `${resident.data.address.block || ''}_${resident.data.address.lot || ''}_${resident.data.address.street || ''}`;
              return residentAddressKey === addressKey;
            }
            
            // Fallback: match by address string
            const residentAddress = resident.address || '';
            const markerAddress = residentInfo.address || '';
            return residentAddress === markerAddress;
          });

          matchesSearch = tenantsAtAddress.some((tenant) => 
            tenant.fullName.toLowerCase().includes(query) ||
            tenant.firstName.toLowerCase().includes(query) ||
            tenant.lastName.toLowerCase().includes(query) ||
            tenant.email.toLowerCase().includes(query) ||
            tenant.address.toLowerCase().includes(query)
          );
        }
      }

      // Check if matches availability filter
      const matchesAvailability = 
        availabilityFilter === 'all' ||
        (availabilityFilter === 'available' && residentInfo.availabilityStatus === 'available') ||
        (availabilityFilter === 'unavailable' && (residentInfo.availabilityStatus === 'unavailable' || !residentInfo.availabilityStatus));

      marker.setVisible(matchesSearch && matchesAvailability);
    });
  }, [residentSearchQuery, availabilityFilter, residentMarkers, residentData, map]);

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
    if (!map) return;

    setResidentSearchQuery(resident.fullName);
    setShowResidentSuggestions(false);

    const isTenant = resident.data?.isTenant === true || resident.data?.residentType === 'tenant';
    
    let marker: any = null;
    
    if (isTenant) {
      // For tenants, find the homeowner's marker at the same address using addressKey
      // Create addressKey from tenant's address data
      let tenantAddressKey = '';
      if (resident.data?.address) {
        tenantAddressKey = `${resident.data.address.block || ''}_${resident.data.address.lot || ''}_${resident.data.address.street || ''}`;
      } else {
        // Fallback: try to extract from address string
        // The address format is "block lot street"
        const addressParts = (resident.address || '').trim().split(/\s+/);
        if (addressParts.length >= 3) {
          tenantAddressKey = `${addressParts[0]}_${addressParts[1]}_${addressParts.slice(2).join('_')}`;
        }
      }
      
      // Find marker with matching addressKey
      if (tenantAddressKey) {
        marker = residentMarkers.find((m) => {
          const markerAddressKey = (m as any).addressKey;
          return markerAddressKey === tenantAddressKey;
        });
      }
      
      // If still not found, try matching by address components
      if (!marker && resident.data?.address) {
        marker = residentMarkers.find((m) => {
          const info = (m as any).residentInfo;
          if (!info || !info.data?.address) return false;
          
          const markerAddr = info.data.address;
          const tenantAddr = resident.data.address;
          
          return (
            String(markerAddr.block || '').trim() === String(tenantAddr.block || '').trim() &&
            String(markerAddr.lot || '').trim() === String(tenantAddr.lot || '').trim() &&
            String(markerAddr.street || '').trim() === String(tenantAddr.street || '').trim()
          );
        });
      }
    } else {
      // For homeowners, match by ID
      marker = residentMarkers.find((m) => {
        const info = (m as any).residentInfo;
        return info && info.id === resident.id;
      });
    }

    if (marker) {
      // Ensure marker is visible (override any filters)
      marker.setVisible(true);
      
      // Get position from marker
      const position = marker.getPosition();
      if (position) {
        const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
        const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
        
        // Center map on marker location with smooth animation
        map.panTo({ lat, lng });
        map.setZoom(18);

        // Small delay to ensure map has panned before opening info window
        setTimeout(() => {
          // Open info window
          const infoWindow = (marker as any).infoWindow;
          if (infoWindow) {
            infoWindow.open(map, marker);
          }
        }, 300);
      }
    } else {
      console.warn('Marker not found for resident:', resident.fullName, isTenant ? '(tenant)' : '(homeowner)');
      // Fallback: if marker not found but we have coordinates, just center the map
      if (resident.lat && resident.lng) {
        map.panTo({ lat: resident.lat, lng: resident.lng });
        map.setZoom(18);
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

      // If clicking inside filter dropdown, don't close
      if (filterDropdownRef.current?.contains(target)) {
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
        !residentSearchInputRef.current.contains(target) &&
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(target)
      ) {
        // Use setTimeout to allow click events to fire first
        setTimeout(() => {
          setShowSuggestions(false);
          setShowResidentSuggestions(false);
          setShowFilterDropdown(false);
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
            {/* Resident Search Bar with Filter */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-2xl px-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
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
                      {residentSearchSuggestions.map((resident) => {
                        // Determine if tenant or homeowner
                        const isTenant = resident.data?.isTenant === true || resident.data?.residentType === 'tenant';
                        const residentType = isTenant ? 'Tenant' : 'Homeowner';
                        
                        return (
                          <div
                            key={resident.id}
                            onClick={() => {
                              // Tenants share the same marker as their homeowner
                              handleSelectResident(resident);
                            }}
                            className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-gray-900 text-sm flex-1">{resident.fullName}</div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                                  isTenant
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {residentType}
                              </span>
                            </div>
                            {resident.email && (
                              <div className="text-xs text-gray-500 mt-1">{resident.email}</div>
                            )}
                            {resident.address && (
                              <div className="text-xs text-gray-500">{resident.address}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Filter Button */}
                <div className="relative">
                  <button
                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium text-gray-700 flex items-center gap-2 whitespace-nowrap"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span className="hidden sm:inline">
                      {availabilityFilter === 'all' ? 'All' : availabilityFilter === 'available' ? 'Available' : 'Unavailable'}
                    </span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {/* Filter Dropdown */}
                  {showFilterDropdown && (
                    <div ref={filterDropdownRef} className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 min-w-[140px]">
                      <button
                        onClick={() => {
                          setAvailabilityFilter('all');
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                          availabilityFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => {
                          setAvailabilityFilter('available');
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg flex items-center gap-2 ${
                          availabilityFilter === 'available' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        Available
                      </button>
                      <button
                        onClick={() => {
                          setAvailabilityFilter('unavailable');
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg flex items-center gap-2 ${
                          availabilityFilter === 'unavailable' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        Unavailable
                      </button>
                    </div>
                  )}
                </div>
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

