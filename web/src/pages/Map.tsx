import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, getDoc, QueryDocumentSnapshot, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import mapsImage from '../assets/maps2.png';

interface Lot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  block: string;
  lot: string;
  street?: string; // Optional for backward compatibility
  resident?: any;
}

function Map() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [residentData, setResidentData] = useState<any[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [selectedLotPosition, setSelectedLotPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedPin, setSelectedPin] = useState<{ id: string; x: number; y: number; block: string; lot: string; street?: string; isOccupied?: boolean; isAvailable?: boolean } | null>(null);
  const [selectedPinPosition, setSelectedPinPosition] = useState<{ x: number; y: number } | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingMarker, setEditingMarker] = useState<{ type: 'block' | 'lot' | 'street'; block?: string; lot?: string; street?: string } | null>(null);
  const [markerPositions, setMarkerPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isPinMode, setIsPinMode] = useState(false);
  const [pinnedLocations, setPinnedLocations] = useState<Array<{ id: string; x: number; y: number; block: string; lot: string; street?: string; isOccupied?: boolean; isAvailable?: boolean }>>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPinPosition, setNewPinPosition] = useState<{ x: number; y: number } | null>(null);
  const [pinFormData, setPinFormData] = useState({ block: '', lot: '', isOccupied: false, isAvailable: false });
  const [draggingPin, setDraggingPin] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [draggingLot, setDraggingLot] = useState<string | null>(null);
  const [residentMarkerPositions, setResidentMarkerPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const isSyncingRef = useRef(false);
  const lastSyncedResidentsRef = useRef<Record<string, string>>({}); // Track last synced status per resident
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unoccupied' | 'available' | 'unavailable'>('all');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement>(null);
  
  // Address options matching mobile signup form
  const blockOptions = ['Block 1', 'Block 2', 'Block 3', 'Block 4', 'Block 5', 'Block 6', 'Block 7', 'Block 8', 'Block 9', 'Block 10', 'Block 11', 'Block 12', 'Block 13', 'Block 14', 'Block 15', 'Block 16', 'Block 17', 'Block 18', 'Block 19', 'Block 20'];
  const lotOptions = ['Lot 1', 'Lot 2', 'Lot 3', 'Lot 4', 'Lot 5', 'Lot 6', 'Lot 7', 'Lot 8', 'Lot 9', 'Lot 10'];

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



  // Fetch verified residents
  const fetchAndDisplayResidents = useCallback((snapshot: any) => {
    if (!db) {
      console.log('Database not ready');
      return;
    }

    try {
      console.log('Processing residents from users collection...');
      const residents: any[] = [];
      let totalUsers = 0;

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

        // Check if address exists and has all required fields
        const hasAddress = data.address && 
          data.address.block && 
          data.address.lot &&
          String(data.address.block).trim() !== '' &&
          String(data.address.lot).trim() !== '';

        if (!hasAddress) {
          console.log('Skipping resident without complete address:', {
            id: doc.id,
            name: fullName,
            address: data.address
          });
          return; // Skip residents without complete address
        }

        // Create address key
        const addressKey = `${data.address.block}_${data.address.lot}`;

        // Store resident data for search
        const availabilityStatus = data.availabilityStatus || 'unavailable';
        const residentInfo = {
          id: doc.id,
          fullName,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          address: data.address ? `${data.address.block || ''} ${data.address.lot || ''}`.trim() : '',
          lat,
          lng,
          availabilityStatus,
          data,
          addressKey,
        };
        residents.push(residentInfo);
      });

      console.log(`Total users: ${totalUsers}, Residents loaded: ${residents.length}`);
      console.log('Residents with addresses:', residents.map(r => ({
        name: r.fullName,
        address: r.data?.address,
        residentType: r.data?.residentType,
        isTenant: r.data?.isTenant
      })));

      setResidentData(residents);
    } catch (error) {
      console.error('Error processing residents:', error);
    }
  }, [db]);

  // Set up real-time listener for residents
  useEffect(() => {
    if (isLoading || !db) {
      return;
    }

    console.log('Setting up real-time listener for residents...');
    
    // Set up real-time listener for users collection
    const usersCollection = collection(db, 'users');
    const unsubscribe = onSnapshot(
      usersCollection,
      (snapshot) => {
        console.log('Users collection updated, refreshing residents...');
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
  }, [isLoading, db, fetchAndDisplayResidents]);

  // Load marker positions from Firestore
  useEffect(() => {
    if (isLoading || !db) return;

    const loadMarkerPositions = async () => {
      try {
        const markerPositionsDoc = await getDoc(doc(db, 'mapSettings', 'markerPositions'));
        if (markerPositionsDoc.exists()) {
          setMarkerPositions(markerPositionsDoc.data() || {});
        }
      } catch (error) {
        console.error('Error loading marker positions:', error);
      }
    };

    loadMarkerPositions();
  }, [isLoading, db]);

  // Save marker position
  const saveMarkerPosition = useCallback(async (key: string, position: { x: number; y: number }) => {
    if (!db) return;

    try {
      const newPositions = { ...markerPositions, [key]: position };
      await setDoc(doc(db, 'mapSettings', 'markerPositions'), newPositions, { merge: true });
      setMarkerPositions(newPositions);
      console.log('Marker position saved:', key, position);
      alert('Marker position saved successfully!');
    } catch (error) {
      console.error('Error saving marker position:', error);
      alert('Failed to save marker position');
    }
  }, [db, markerPositions]);

  // Handle marker position click in edit mode
  const handleMarkerPositionClick = useCallback((e: React.MouseEvent<SVGElement>, type: 'block' | 'lot' | 'street', block?: string, lot?: string, street?: string) => {
    if (!isEditMode || !mapContainerRef.current) return;

    e.stopPropagation();
    const svgElement = e.currentTarget.closest('svg');
    
    if (svgElement) {
      const svgRect = svgElement.getBoundingClientRect();
      const viewBox = svgElement.viewBox.baseVal;
      const clickX = e.clientX - svgRect.left;
      const clickY = e.clientY - svgRect.top;
      
      // Convert screen coordinates to SVG coordinates
      const scaleX = viewBox.width / svgRect.width;
      const scaleY = viewBox.height / svgRect.height;
      
      const svgX = clickX * scaleX;
      const svgY = clickY * scaleY;
      
      // Create key for this marker
      let key = '';
      if (type === 'block' && block) {
        key = `block_${block}`;
      } else if (type === 'lot' && block && lot) {
        key = `lot_${block}_${lot}`;
      } else if (type === 'street' && street) {
        key = `street_${street}`;
      }
      
      if (key) {
        saveMarkerPosition(key, { x: svgX, y: svgY });
        setEditingMarker(null);
      }
    }
  }, [isEditMode, saveMarkerPosition]);

  // Load pinned locations from Firestore with real-time updates
  useEffect(() => {
    if (isLoading || !db) return;

    const mapPinsCollection = collection(db, 'mapPins');
    const unsubscribe = onSnapshot(mapPinsCollection, (snapshot) => {
      try {
        const pins: Array<{ id: string; x: number; y: number; block: string; lot: string; street?: string; isOccupied?: boolean; isAvailable?: boolean }> = [];
        const seenAddresses = new Set<string>();
        
        snapshot.forEach((docSnap: QueryDocumentSnapshot) => {
          const data = docSnap.data();
          
          // Create a unique key for this address combination
          const addressKey = `${data.block || ''}_${data.lot || ''}`;
          
          // Skip if we've already seen this address (keep the first one)
          if (seenAddresses.has(addressKey)) {
            console.warn(`Duplicate pin found for ${addressKey}, skipping...`);
            return;
          }
          
          seenAddresses.add(addressKey);
          pins.push({
            id: docSnap.id,
            x: data.x,
            y: data.y,
            block: data.block,
            lot: data.lot,
            street: data.street, // Optional, for backward compatibility
            isOccupied: data.isOccupied || false,
            isAvailable: data.isAvailable || false,
          });
        });
        setPinnedLocations(pins);
      } catch (error) {
        console.error('Error loading pinned locations:', error);
      }
    }, (error) => {
      console.error('Error in pinned locations snapshot:', error);
    });

    return () => unsubscribe();
  }, [isLoading, db]);


  // Save pinned location
  const savePinnedLocation = useCallback(async (position: { x: number; y: number }, block: string, lot: string, isOccupied: boolean, isAvailable: boolean) => {
    if (!db) return;

    try {
      // Check for duplicate pin (same block, lot)
      const existingPin = pinnedLocations.find(pin => 
        pin.block === block && pin.lot === lot
      );
      
      if (existingPin) {
        const confirmUpdate = window.confirm(
          `A pin already exists for ${block} ${lot}. Do you want to update its position and status?`
        );
        
        if (confirmUpdate) {
          // Update existing pin
          const pinRef = doc(db, 'mapPins', existingPin.id);
          await setDoc(pinRef, {
            x: position.x,
            y: position.y,
            block,
            lot,
            isOccupied,
            isAvailable,
            updatedAt: new Date(),
          }, { merge: true });
          
          // Update local state
          setPinnedLocations(prev => prev.map(pin => 
            pin.id === existingPin.id 
              ? { ...pin, x: position.x, y: position.y, isOccupied, isAvailable }
              : pin
          ));
          
          setShowPinModal(false);
          setNewPinPosition(null);
          setPinFormData({ block: '', lot: '', isOccupied: false, isAvailable: false });
          alert('Pin updated successfully!');
        }
        return;
      }
      
      // Create new pin if no duplicate found
      const pinData = {
        x: position.x,
        y: position.y,
        block,
        lot,
        isOccupied,
        isAvailable,
        createdAt: new Date(),
      };
      
      const newPinRef = doc(collection(db, 'mapPins'));
      await setDoc(newPinRef, pinData);
      
      // Add to local state
      setPinnedLocations(prev => [...prev, {
        id: newPinRef.id,
        x: position.x,
        y: position.y,
        block,
        lot,
        isOccupied,
        isAvailable,
      }]);
      
      setShowPinModal(false);
      setNewPinPosition(null);
      setPinFormData({ block: '', lot: '', isOccupied: false, isAvailable: false });
      alert('Pin saved successfully!');
    } catch (error) {
      console.error('Error saving pinned location:', error);
      alert('Failed to save pin');
    }
  }, [db, pinnedLocations]);

  // Update pinned location position (for dragging)
  const updatePinPosition = useCallback(async (pinId: string, newPosition: { x: number; y: number }) => {
    if (!db) return;

    try {
      const pinRef = doc(db, 'mapPins', pinId);
      await setDoc(pinRef, { x: newPosition.x, y: newPosition.y }, { merge: true });
      
      // Update local state
      setPinnedLocations(prev => prev.map(pin => 
        pin.id === pinId ? { ...pin, x: newPosition.x, y: newPosition.y } : pin
      ));
    } catch (error) {
      console.error('Error updating pin position:', error);
    }
  }, [db]);

  // Handle pin drag start
  const handlePinDragStart = useCallback((e: React.MouseEvent<SVGElement>, pinId: string, pinX: number, pinY: number) => {
    if (!isPinMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    setHasDragged(false); // Reset drag flag
    const svgElement = e.currentTarget.closest('svg') as SVGSVGElement;
    if (!svgElement) return;
    
    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    
    const clickX = (e.clientX - svgRect.left) * scaleX;
    const clickY = (e.clientY - svgRect.top) * scaleY;
    
    setDraggingPin(pinId);
    setDragOffset({
      x: clickX - pinX,
      y: clickY - pinY
    });
  }, [isPinMode]);

  // Handle pin drag
  const handlePinDrag = useCallback((e: React.MouseEvent<SVGElement>) => {
    if (!draggingPin || !dragOffset) return;
    
    e.preventDefault();
    e.stopPropagation();
    setHasDragged(true); // Mark that a drag has occurred
    
    const svgElement = e.currentTarget.closest('svg') as SVGSVGElement;
    if (!svgElement) return;
    
    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    
    const newX = (e.clientX - svgRect.left) * scaleX - dragOffset.x;
    const newY = (e.clientY - svgRect.top) * scaleY - dragOffset.y;
    
    setPinnedLocations(prev => prev.map(pin => 
      pin.id === draggingPin ? { ...pin, x: newX, y: newY } : pin
    ));
  }, [draggingPin, dragOffset]);

  // Handle pin drag end
  const handlePinDragEnd = useCallback(() => {
    if (draggingPin) {
      const pin = pinnedLocations.find(p => p.id === draggingPin);
      if (pin) {
        updatePinPosition(draggingPin, { x: pin.x, y: pin.y });
      }
    }
    setDraggingPin(null);
    setDragOffset(null);
    // Reset drag flag after a short delay to allow onClick to check it
    setTimeout(() => setHasDragged(false), 100);
  }, [draggingPin, pinnedLocations, updatePinPosition]);

  // Global mouse handlers for pin dragging (to continue drag even when mouse leaves SVG)
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPinMode && draggingPin && dragOffset && mapContainerRef.current) {
        setHasDragged(true); // Mark that a drag has occurred
        const svgElement = mapContainerRef.current.querySelector('svg') as SVGSVGElement;
        if (svgElement) {
          const svgRect = svgElement.getBoundingClientRect();
          const viewBox = svgElement.viewBox.baseVal;
          const scaleX = viewBox.width / svgRect.width;
          const scaleY = viewBox.height / svgRect.height;
          
          const newX = (e.clientX - svgRect.left) * scaleX - dragOffset.x;
          const newY = (e.clientY - svgRect.top) * scaleY - dragOffset.y;
          
          setPinnedLocations(prev => prev.map(pin => 
            pin.id === draggingPin ? { ...pin, x: newX, y: newY } : pin
          ));
        }
      }
    };

    const handleGlobalMouseUp = () => {
      if (draggingPin) {
        handlePinDragEnd();
      }
    };

    if (draggingPin) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isPinMode, draggingPin, dragOffset, handlePinDragEnd]);

  // Handle resident marker mouse down (start long press timer)
  const handleResidentMarkerMouseDown = useCallback((e: React.MouseEvent<SVGElement>, lotId: string, markerX: number, markerY: number) => {
    if (isPinMode || isEditMode) return;
    
    e.stopPropagation();
    setIsLongPress(false);
    
    // Start long press timer (500ms)
    const timer = setTimeout(() => {
      setIsLongPress(true);
      const svgElement = e.currentTarget.closest('svg') as SVGSVGElement;
      if (!svgElement) return;

      const svgRect = svgElement.getBoundingClientRect();
      const viewBox = svgElement.viewBox.baseVal;
      const scaleX = viewBox.width / svgRect.width;
      const scaleY = viewBox.height / svgRect.height;
      
      const clickX = (e.clientX - svgRect.left) * scaleX;
      const clickY = (e.clientY - svgRect.top) * scaleY;
      
      setDraggingLot(lotId);
      setDragOffset({
        x: clickX - markerX,
        y: clickY - markerY
      });
    }, 500);
    
    setLongPressTimer(timer);
  }, [isPinMode, isEditMode]);

  // Handle resident marker drag end
  const handleResidentMarkerDragEnd = useCallback(async () => {
    if (draggingLot && db) {
      const position = residentMarkerPositions[draggingLot];
      if (position) {
        try {
          const newPositions = { ...residentMarkerPositions };
          await setDoc(doc(db, 'mapSettings', 'residentMarkerPositions'), newPositions, { merge: true });
          console.log(`Updated resident marker ${draggingLot} position to x:${position.x}, y:${position.y}`);
        } catch (error) {
          console.error('Error updating resident marker position:', error);
        }
      }
    }
    setDraggingLot(null);
    setDragOffset(null);
  }, [draggingLot, residentMarkerPositions, db]);

  // Handle resident marker mouse up (cancel long press or end drag)
  const handleResidentMarkerMouseUp = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    
    if (isLongPress && draggingLot) {
      // End drag
      handleResidentMarkerDragEnd();
      setIsLongPress(false);
    } else if (!isLongPress && !draggingLot) {
      // Normal click - handled by onClick
    }
  }, [longPressTimer, isLongPress, draggingLot, handleResidentMarkerDragEnd]);

  // Handle resident marker mouse leave (cancel long press, but continue drag if already dragging)
  const handleResidentMarkerMouseLeave = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    // Don't end drag on mouse leave - let global handler handle it
  }, [longPressTimer]);

  // Handle resident marker drag
  const handleResidentMarkerDrag = useCallback((e: React.MouseEvent<SVGElement>) => {
    if (!draggingLot || !dragOffset) return;
    
    const svgElement = e.currentTarget.closest('svg') as SVGSVGElement;
    if (!svgElement) return;
    
    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    
    const newX = (e.clientX - svgRect.left) * scaleX - dragOffset.x;
    const newY = (e.clientY - svgRect.top) * scaleY - dragOffset.y;
    
    // Update local state
    setResidentMarkerPositions(prev => ({
      ...prev,
      [draggingLot]: { x: newX, y: newY }
    }));
  }, [draggingLot, dragOffset]);

  // Handle map click in pin mode
  const handleMapClickForPin = useCallback((e: React.MouseEvent<SVGElement>) => {
    if (!isPinMode || !mapContainerRef.current) return;

    const svgElement = e.currentTarget as SVGSVGElement;
    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    
    const clickX = e.clientX - svgRect.left;
    const clickY = e.clientY - svgRect.top;
    
    // Convert screen coordinates to SVG coordinates
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    
    const svgX = clickX * scaleX;
    const svgY = clickY * scaleY;
    
    setNewPinPosition({ x: svgX, y: svgY });
    setShowPinModal(true);
  }, [isPinMode]);

  // Generate subdivision map layout
  const generateSubdivisionMap = useCallback((): Lot[] => {
    const lots: Lot[] = [];
    const lotWidth = 8;
    const lotHeight = 6;
    const roadWidth = 12;
    const blockSpacing = 20;
    
    // Create blocks (A-Z, then AA-ZZ)
    const blocks = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    const streets = ['Main St', 'Oak Ave', 'Elm St', 'Maple Dr', 'Pine Rd', 'Cedar Ln', 'Birch Way', 'Willow St'];
    
    let currentY = 50; // Start position
    let maxX = 0;
    let maxY = 0;
    
    blocks.forEach((block, blockIdx) => {
      const lotsPerRow = 8;
      const rowsPerBlock = 6;
      const blockStartX = 50 + (blockIdx % 4) * (lotsPerRow * lotWidth + roadWidth + blockSpacing);
      const blockStartY = currentY + Math.floor(blockIdx / 4) * (rowsPerBlock * lotHeight + roadWidth + blockSpacing);
      
      // Create lots in this block
      for (let row = 0; row < rowsPerBlock; row++) {
        for (let col = 0; col < lotsPerRow; col++) {
          const lotNum = (row * lotsPerRow + col + 1).toString();
          const street = streets[row % streets.length];
          
          const x = blockStartX + col * (lotWidth + 1);
          const y = blockStartY + row * (lotHeight + 1);
          
          maxX = Math.max(maxX, x + lotWidth);
          maxY = Math.max(maxY, y + lotHeight);
          
          lots.push({
            id: `${block}-${lotNum}-${street}`,
            x,
            y,
            width: lotWidth,
            height: lotHeight,
            block,
            lot: lotNum,
            street,
          });
        }
      }
    });
    
    // Store max dimensions for viewBox calculation
    (lots as any).maxX = maxX;
    (lots as any).maxY = maxY;
    
    return lots;
  }, []);

  // Normalize address values from signup form
  // Handles formats like "Block 1" -> "1" or "A", "Lot 2" -> "2", "Main Street" -> "Main St"
  const normalizeAddress = useCallback((value: string, type: 'block' | 'lot' | 'street'): string => {
    if (!value) return '';
    
    const trimmed = value.trim();
    
    if (type === 'block') {
      // Extract number from "Block 1", "Block 2", etc. or return letter if it's already a letter
      const blockMatch = trimmed.match(/block\s*(\d+)/i);
      if (blockMatch) {
        const blockNum = parseInt(blockMatch[1], 10);
        // Convert block number to letter (1 -> A, 2 -> B, etc.)
        if (blockNum >= 1 && blockNum <= 26) {
          return String.fromCharCode(64 + blockNum); // 65 is 'A'
        }
        return blockMatch[1]; // Return number if > 26
      }
      // If it's already a letter or number, return as is
      return trimmed.toUpperCase();
    }
    
    if (type === 'lot') {
      // Extract number from "Lot 1", "Lot 2", etc.
      const lotMatch = trimmed.match(/lot\s*(\d+)/i);
      if (lotMatch) {
        return lotMatch[1];
      }
      // If it's already just a number, return as is
      return trimmed;
    }
    
    if (type === 'street') {
      // Map street names from signup form to map format
      // Signup form options: ['Main Street', 'First Street', 'Second Street', 'Third Street', 'Fourth Street', 'Fifth Street']
      // Map streets: ['Main St', 'Oak Ave', 'Elm St', 'Maple Dr', 'Pine Rd', 'Cedar Ln', 'Birch Way', 'Willow St']
      const streetMap: Record<string, string> = {
        'Main Street': 'Main St',      // Maps to first street in map
        'First Street': 'Main St',      // Maps to first street in map (alternative)
        'Second Street': 'Oak Ave',     // Maps to second street in map
        'Third Street': 'Elm St',       // Maps to third street in map
        'Fourth Street': 'Maple Dr',     // Maps to fourth street in map
        'Fifth Street': 'Pine Rd',      // Maps to fifth street in map
      };
      
      // Check exact match first
      if (streetMap[trimmed]) {
        return streetMap[trimmed];
      }
      
      // Normalize street names - handle variations
      const normalized = trimmed
        .replace(/\s+street\s*$/i, ' St')
        .replace(/\s+avenue\s*$/i, ' Ave')
        .replace(/\s+drive\s*$/i, ' Dr')
        .replace(/\s+road\s*$/i, ' Rd')
        .replace(/\s+lane\s*$/i, ' Ln')
        .replace(/\s+way\s*$/i, ' Way');
      
      return normalized;
    }
    
    return trimmed;
  }, []);

  // Map residents to lots
  const mapResidentsToLots = useCallback((lots: Lot[], residents: any[]): Lot[] => {
    const lotMap: Record<string, Lot> = {};
    
    // Create a map of lots by their ID
    lots.forEach(lot => {
      lotMap[lot.id] = lot;
    });
    
    // Match residents to lots based on address
    residents.forEach(resident => {
      if (!resident.data?.address) return;
      
      const rawBlock = String(resident.data.address.block || '').trim();
      const rawLot = String(resident.data.address.lot || '').trim();
      
      if (!rawBlock || !rawLot) return;
      
      // Normalize address values to match map format
      const normalizedBlock = normalizeAddress(rawBlock, 'block');
      const normalizedLot = normalizeAddress(rawLot, 'lot');
      
      // Debug logging for address matching
      console.log('Matching resident:', {
        raw: { block: rawBlock, lot: rawLot },
        normalized: { block: normalizedBlock, lot: normalizedLot },
        residentName: resident.fullName,
        residentType: resident.data?.residentType,
        isTenant: resident.data?.isTenant
      });
      
      // Try exact match first (using block and lot only)
      // Try to find lot with matching block and lot
      const exactMatch = lots.find(
        (l: Lot) => l.block === normalizedBlock && l.lot === normalizedLot
      );
      
      if (exactMatch) {
        console.log(`✓ Exact match found for ${resident.fullName} at block ${normalizedBlock}, lot ${normalizedLot}`);
        exactMatch.resident = resident;
      } else {
        console.log(`✗ No exact match for ${resident.fullName} at block ${normalizedBlock}, lot ${normalizedLot}, trying fuzzy match...`);
        // Try fuzzy matching - find first lot with matching block and lot number
        const fuzzyMatch = lots.find(
          (l: Lot) => l.block === normalizedBlock && l.lot === normalizedLot
        );
        if (fuzzyMatch) {
          console.log(`✓ Fuzzy match found for ${resident.fullName} at block ${normalizedBlock}, lot ${normalizedLot}`);
          fuzzyMatch.resident = resident;
        } else {
          console.log(`✗ No fuzzy match found for ${resident.fullName} at block ${normalizedBlock}, lot ${normalizedLot}`);
          // Last resort: try matching just by lot number (in case block format differs)
          const lotOnlyMatch = lots.find(
            (l: Lot) => l.lot === normalizedLot && !l.resident
          );
          if (lotOnlyMatch) {
            console.log(`✓ Fallback match found for ${resident.fullName} at lot ${normalizedLot} only`);
            lotOnlyMatch.resident = resident;
          } else {
            console.log(`✗ No match found for ${resident.fullName} - address: Block ${rawBlock}, Lot ${rawLot}`);
          }
        }
      }
    });
    
    return lots;
  }, [normalizeAddress]);

  // Sync pin markers with resident availability status changes
  // Only sync when residentData changes, not when pinnedLocations changes (to prevent feedback loops)
  useEffect(() => {
    if (!db || residentData.length === 0 || pinnedLocations.length === 0 || isSyncingRef.current) return;

    const syncPinsWithResidents = async () => {
      // Prevent concurrent syncs
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        // Get current pinned locations snapshot to avoid stale closures
        const currentPins = [...pinnedLocations];
        
        // Track if any updates were made
        let hasUpdates = false;
        
        // For each resident, check if there's a matching pin and sync availability status
        const updatePromises = residentData.map(async (resident) => {
          if (!resident.data?.address) return;

          const residentBlock = normalizeAddress(String(resident.data.address.block || ''), 'block');
          const residentLot = normalizeAddress(String(resident.data.address.lot || ''), 'lot');
          const availabilityStatus = resident.availabilityStatus || 'unavailable';
          const isAvailable = availabilityStatus === 'available';
          
          // Create a unique key for this resident
          const residentKey = `${residentBlock}_${residentLot}`;
          const lastSyncedStatus = lastSyncedResidentsRef.current[residentKey];
          
          // Only sync if the status has actually changed from what we last synced
          if (lastSyncedStatus === availabilityStatus) {
            return; // Already synced with this status, skip
          }

          // Find matching pin from current snapshot
          const matchingPin = currentPins.find(pin => {
            const pinBlock = normalizeAddress(pin.block, 'block');
            const pinLot = normalizeAddress(pin.lot, 'lot');
            return pinBlock === residentBlock && pinLot === residentLot;
          });

          if (matchingPin && matchingPin.isOccupied) {
            // Only update if the availability status differs from pin
            if (matchingPin.isAvailable !== isAvailable) {
              try {
                await updateDoc(doc(db, 'mapPins', matchingPin.id), {
                  isAvailable: isAvailable,
                  updatedAt: Timestamp.now(),
                });
                // Update our tracking map
                lastSyncedResidentsRef.current[residentKey] = availabilityStatus;
                hasUpdates = true;
                console.log(`Synced pin ${matchingPin.id} availability to ${availabilityStatus}`);
              } catch (error) {
                console.error(`Error syncing pin ${matchingPin.id}:`, error);
              }
            } else {
              // Pin already matches, update our tracking
              lastSyncedResidentsRef.current[residentKey] = availabilityStatus;
            }
          }
        });

        await Promise.all(updatePromises);
        
        // If no updates were made, we can exit early next time
        if (!hasUpdates) {
          // Still update tracking for residents that match pins
          residentData.forEach(resident => {
            if (!resident.data?.address) return;
            const residentBlock = normalizeAddress(String(resident.data.address.block || ''), 'block');
            const residentLot = normalizeAddress(String(resident.data.address.lot || ''), 'lot');
            const residentKey = `${residentBlock}_${residentLot}`;
            const availabilityStatus = resident.availabilityStatus || 'unavailable';
            const currentPins = [...pinnedLocations];
            const matchingPin = currentPins.find(pin => {
              const pinBlock = normalizeAddress(pin.block, 'block');
              const pinLot = normalizeAddress(pin.lot, 'lot');
              return pinBlock === residentBlock && pinLot === residentLot;
            });
            if (matchingPin && matchingPin.isOccupied && matchingPin.isAvailable === (availabilityStatus === 'available')) {
              lastSyncedResidentsRef.current[residentKey] = availabilityStatus;
            }
          });
        }
      } catch (error) {
        console.error('Error syncing pins with residents:', error);
      } finally {
        isSyncingRef.current = false;
      }
    };

    // Debounce the sync to avoid too many updates
    const timeoutId = setTimeout(syncPinsWithResidents, 1500);
    return () => {
      clearTimeout(timeoutId);
      // Don't reset isSyncingRef here as it might interrupt an ongoing sync
    };
  }, [db, residentData, normalizeAddress]); // Removed pinnedLocations from dependencies to prevent feedback loop

  // Generate lots and map residents (show all residents since there's no filtering UI)
  const allLots = generateSubdivisionMap();
  const lotsWithResidents = mapResidentsToLots(allLots, residentData);
  
  // Debug: Log coordinate system dimensions
  console.log('Coordinate system dimensions:', {
    maxX: (allLots as any).maxX,
    maxY: (allLots as any).maxY,
    viewBox: `0 0 ${(allLots as any).maxX || 1000} ${(allLots as any).maxY || 1000}`
  });

  // Debug: Log matching results
  const matchedLots = lotsWithResidents.filter(lot => lot.resident);
  console.log(`Total lots: ${allLots.length}, Lots with residents: ${matchedLots.length}`);
  console.log('Matched residents:', matchedLots.map(lot => ({
    lotId: lot.id,
    residentName: lot.resident?.fullName,
    residentType: lot.resident?.data?.residentType,
    isTenant: lot.resident?.data?.isTenant,
    address: lot.resident?.data?.address
  })));

  // Filter lots based on search query and status filter
  const visibleLots = lotsWithResidents.filter(lot => {
    if (!lot.resident) return false;
    
    // Search filter - check name, block, lot, street
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      lot.resident.fullName?.toLowerCase().includes(searchLower) ||
      lot.block?.toLowerCase().includes(searchLower) ||
      lot.lot?.toLowerCase().includes(searchLower) ||
      `${lot.block} ${lot.lot}`.toLowerCase().includes(searchLower);
    
    if (!matchesSearch) return false;
    
    // Status filter
    if (statusFilter === 'all') return true;
    
    // Check if there's a pinned location for this address
    const normalizedBlock = normalizeAddress(lot.block, 'block');
    const normalizedLot = normalizeAddress(lot.lot, 'lot');
    
    const matchingPin = pinnedLocations.find(pin => {
      const pinNormalizedBlock = normalizeAddress(pin.block, 'block');
      const pinNormalizedLot = normalizeAddress(pin.lot, 'lot');
      
      return pinNormalizedBlock === normalizedBlock && 
             pinNormalizedLot === normalizedLot;
    });
    
    if (matchingPin) {
      // Use pin status
      if (statusFilter === 'unoccupied') {
        return !matchingPin.isOccupied;
      } else if (statusFilter === 'available') {
        return matchingPin.isOccupied && matchingPin.isAvailable;
      } else if (statusFilter === 'unavailable') {
        return matchingPin.isOccupied && !matchingPin.isAvailable;
      }
    } else {
      // Use resident availability status
      const isAvailable = lot.resident?.availabilityStatus === 'available';
      if (statusFilter === 'unoccupied') {
        return false; // Resident markers are always occupied
      } else if (statusFilter === 'available') {
        return isAvailable;
      } else if (statusFilter === 'unavailable') {
        return !isAvailable;
      }
    }
    
    return true;
  });

  console.log(`Visible lots (all residents with addresses): ${visibleLots.length}`);
  
  // Filter pinned locations based on search query and status filter
  const filteredPinnedLocations = pinnedLocations.filter(pin => {
    // Search filter - check block, lot, and resident name if occupied
    const searchLower = searchQuery.toLowerCase();
    let matchesSearch = !searchQuery || 
      pin.block?.toLowerCase().includes(searchLower) ||
      pin.lot?.toLowerCase().includes(searchLower) ||
      `${pin.block} ${pin.lot}`.toLowerCase().includes(searchLower);
    
    // If occupied, also check resident name
    if (pin.isOccupied && !matchesSearch && searchQuery) {
      const matchingResident = residentData.find(resident => {
        const residentBlock = normalizeAddress(String(resident.data?.address?.block || ''), 'block');
        const residentLot = normalizeAddress(String(resident.data?.address?.lot || ''), 'lot');
        const pinBlock = normalizeAddress(pin.block, 'block');
        const pinLot = normalizeAddress(pin.lot, 'lot');
        return residentBlock === pinBlock && residentLot === pinLot;
      });
      
      if (matchingResident) {
        matchesSearch = matchingResident.fullName?.toLowerCase().includes(searchLower) || false;
      }
    }
    
    if (!matchesSearch) return false;
    
    // Status filter
    if (statusFilter === 'all') return true;
    
    if (statusFilter === 'unoccupied') {
      return !pin.isOccupied;
    } else if (statusFilter === 'available') {
      return pin.isOccupied && pin.isAvailable;
    } else if (statusFilter === 'unavailable') {
      return pin.isOccupied && !pin.isAvailable;
    }
    
    return true;
  });
  
  // Debug: Also show unmatched residents
  const unmatchedResidents = residentData.filter(resident => {
    const hasMatch = lotsWithResidents.some(lot => lot.resident?.id === resident.id);
    return !hasMatch;
  });
  if (unmatchedResidents.length > 0) {
    console.warn(`Unmatched residents (${unmatchedResidents.length}):`, unmatchedResidents.map(r => ({
      name: r.fullName,
      address: r.data?.address,
      residentType: r.data?.residentType
    })));
  }

  // Handle lot click
  const handleLotClick = (lot: Lot, event?: React.MouseEvent<SVGGElement>) => {
    setSelectedLot(lot);
    
    // Get container position
    if (mapContainerRef.current && event) {
      const containerRect = mapContainerRef.current.getBoundingClientRect();
      
      // Use the click event position directly
      const clickX = event.clientX;
      const clickY = event.clientY;
      
      // Convert to container-relative coordinates
      setSelectedLotPosition({
        x: clickX - containerRect.left,
        y: clickY - containerRect.top
      });
    } else if (mapContainerRef.current) {
      // Fallback: calculate from SVG coordinates
      const markerX = lot.x + lot.width / 2;
      const markerY = lot.y + lot.height / 2;
      
      const containerRect = mapContainerRef.current.getBoundingClientRect();
      const svgElement = mapContainerRef.current.querySelector('svg');
      
      if (svgElement) {
        const svgRect = svgElement.getBoundingClientRect();
        const viewBox = svgElement.viewBox.baseVal;
        
        if (viewBox.width > 0 && viewBox.height > 0) {
          const scaleX = svgRect.width / viewBox.width;
          const scaleY = svgRect.height / viewBox.height;
          
          setSelectedLotPosition({
            x: (markerX * scaleX),
            y: (markerY * scaleY)
          });
        } else {
          // Fallback: use percentage-based positioning
          setSelectedLotPosition({
            x: containerRect.width * 0.5,
            y: containerRect.height * 0.5
          });
        }
      } else {
        setSelectedLotPosition({
          x: containerRect.width * 0.5,
          y: containerRect.height * 0.5
        });
      }
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-600">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full h-screen bg-gray-100 overflow-hidden" style={{ display: 'flex', flexDirection: 'row' }}>
        {/* Control Buttons */}
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
          <button
            onClick={() => {
              setIsPinMode(!isPinMode);
              setIsEditMode(false);
              setEditingMarker(null);
              if (!isPinMode) {
                alert('Pin mode enabled. Click on the map to place a pin and label it.');
              } else {
                setShowPinModal(false);
                setNewPinPosition(null);
                alert('Pin mode disabled.');
              }
            }}
            className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-colors ${
              isPinMode 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isPinMode ? 'Exit Pin Mode' : 'Add Pin'}
          </button>
        </div>
        
        {/* Map Container */}
        <div 
          ref={mapContainerRef}
          className="w-full overflow-hidden bg-gray-100 relative"
          style={{ 
            userSelect: 'none',
            aspectRatio: '16/9',
            width: '100%',
            height: 'auto',
            minHeight: 'calc(100vh - 0px)',
            maxHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
          onDragStart={(e) => {
            if (isPinMode && draggingPin) {
              e.preventDefault();
            }
          }}
        >
            {/* Search Bar and Filters - Inside Map */}
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-30">
              <div className="bg-gray-800 bg-opacity-90 rounded-md shadow-lg p-1.5 flex items-center gap-1.5">
                {/* Search Bar */}
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 bg-white text-gray-900"
                />
                
                {/* Filter Buttons - Horizontal */}
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('unoccupied')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === 'unoccupied'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  Unoccupied
                </button>
                <button
                  onClick={() => setStatusFilter('available')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === 'available'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  Available
                </button>
                <button
                  onClick={() => setStatusFilter('unavailable')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === 'unavailable'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-600 text-white hover:bg-gray-500'
                  }`}
                >
                  Unavailable
                </button>
              </div>
            </div>
            
            {/* Map Image */}
            <img
              ref={mapImageRef}
              src={mapsImage}
              alt="Subdivision Map"
              className="w-full h-full object-contain"
              style={{
                userSelect: 'none',
                pointerEvents: 'none',
                transform: 'rotate(-90deg) scale(1.5)',
                transformOrigin: 'center center',
              } as React.CSSProperties}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
            
            {/* Overlay for resident markers and labels */}
            <svg
              width="100%"
              height="100%"
              className="absolute inset-0"
              style={{
                pointerEvents: 'all', // Always allow pointer events so markers can be clicked
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
              onDragStart={(e) => {
                if (isPinMode && draggingPin) {
                  e.preventDefault();
                }
              }}
              viewBox={`0 0 ${(allLots as any).maxX || 1000} ${(allLots as any).maxY || 1000}`}
              preserveAspectRatio="xMidYMid meet"
              onClick={(e) => {
                if (draggingLot || draggingPin) {
                  // Don't handle clicks while dragging
                  return;
                }
                
                // Check if click is on a marker (pin or resident)
                const target = e.target as HTMLElement;
                const isMarker = target.closest('g[data-pin-marker]') || target.closest('g[data-resident-marker]');
                
                // If clicked on a marker, don't handle map click - let marker handle it
                if (isMarker) {
                  return;
                }
                
                if (isPinMode && !draggingPin) {
                  handleMapClickForPin(e);
                  setSelectedPin(null);
                  setSelectedPinPosition(null);
                } else if (isEditMode && editingMarker) {
                  handleMarkerPositionClick(e, editingMarker.type, editingMarker.block, editingMarker.lot, editingMarker.street);
                } else {
                  // Clear selected pin and lot when clicking on map (not on a marker)
                  setSelectedPin(null);
                  setSelectedPinPosition(null);
                  setSelectedLot(null);
                  setSelectedLotPosition(null);
                }
              }}
              onMouseMove={(e) => {
                if (isPinMode && draggingPin) {
                  e.preventDefault();
                  handlePinDrag(e);
                } else if (!isPinMode && !isEditMode && draggingLot) {
                  e.preventDefault();
                  handleResidentMarkerDrag(e);
                }
              }}
            >
              {/* Display pinned locations - Google Maps style markers */}
              {filteredPinnedLocations.map((pin) => {
                // Determine marker color based on occupation status
                let markerColor = '#FF0000'; // Red = unoccupied (default)
                if (pin.isOccupied) {
                  markerColor = pin.isAvailable ? '#34C759' : '#4285F4'; // Green = occupied & available, Blue = occupied & unavailable
                }
                
                const markerSize = 20;
                const markerHeight = markerSize;
                const markerWidth = markerSize * 0.64;
                const headRadius = markerWidth / 2;
                const headCenterY = pin.y - markerHeight + headRadius;
                const pointY = pin.y;
                
                return (
                  <g 
                    key={pin.id}
                    data-pin-marker="true"
                    onMouseDown={(e) => {
                      if (isPinMode) {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePinDragStart(e, pin.id, pin.x, pin.y);
                      }
                    }}
                    onClick={(e) => {
                      // Show details if not dragging (works in both pin mode and normal mode)
                      if (!draggingPin && !hasDragged) {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedPin(pin);
                        if (mapContainerRef.current) {
                          const containerRect = mapContainerRef.current.getBoundingClientRect();
                          // Use the click event position directly for accurate positioning
                          const clickX = e.clientX;
                          const clickY = e.clientY;
                          
                          // Convert to container-relative coordinates
                          setSelectedPinPosition({
                            x: clickX - containerRect.left,
                            y: clickY - containerRect.top
                          });
                        }
                      }
                    }}
                    style={{ cursor: isPinMode ? 'move' : 'pointer' }}
                  >
                    {/* Shadow */}
                    <path
                      d={`M ${pin.x},${pointY + 1}
                          L ${pin.x - headRadius * 0.85},${headCenterY + headRadius * 0.15 + 1}
                          A ${headRadius * 0.85} ${headRadius * 0.85} 0 1 1 ${pin.x + headRadius * 0.85},${headCenterY + headRadius * 0.15 + 1}
                          Z`}
                      fill="#000000"
                      opacity="0.3"
                    />
                    
                    {/* Marker (teardrop shape) */}
                    <path
                      d={`M ${pin.x},${pointY}
                          L ${pin.x - headRadius},${headCenterY + headRadius * 0.2}
                          A ${headRadius} ${headRadius} 0 1 1 ${pin.x + headRadius},${headCenterY + headRadius * 0.2}
                          Z`}
                      fill={markerColor}
                      stroke="#000000"
                      strokeWidth={2}
                    />
                    
                    {/* Black circle/dot in the upper rounded portion */}
                    <circle
                      cx={pin.x}
                      cy={headCenterY}
                      r={headRadius * 0.35}
                      fill="#000000"
                    />
                  </g>
                );
              })}
              
              {/* Block, Lot, and Street Labels - Show for all occupied lots */}
              {visibleLots.map((lot) => {
                if (!lot.resident) return null;
                
                // Get saved positions or use defaults
                const blockKey = `block_${lot.block}`;
                const lotKey = `lot_${lot.block}_${lot.lot}`;
                const streetKey = `street_${lot.street}`;
                
                const blockPos = markerPositions[blockKey] || { x: lot.x - 5, y: lot.y - 5 };
                const lotPos = markerPositions[lotKey] || { x: lot.x + lot.width / 2, y: lot.y + lot.height / 2 + 2 };
                const streetPos = markerPositions[streetKey] || { x: lot.x - 5, y: lot.y + lot.height / 2 };
                
                return (
                  <g key={lot.id}>
                    {/* Lot number label */}
                    {lot.lot === '1' || markerPositions[lotKey] ? (
                      <text
                        x={lotPos.x}
                        y={lotPos.y}
                        fontSize="8"
                        fill="#fff"
                        fontWeight="600"
                        textAnchor="middle"
                        pointerEvents={isEditMode ? 'all' : 'none'}
                        style={{ 
                          userSelect: 'none',
                          cursor: isEditMode ? 'pointer' : 'default',
                          opacity: editingMarker?.type === 'lot' && editingMarker?.block === lot.block && editingMarker?.lot === lot.lot ? 0.5 : 1
                        }}
                        onClick={(e) => {
                          if (isEditMode) {
                            e.stopPropagation();
                            setEditingMarker({ type: 'lot', block: lot.block, lot: lot.lot });
                            alert(`Click on the map to position the Lot ${lot.lot} label for Block ${lot.block}`);
                          }
                        }}
                      >
                        {lot.lot}
                      </text>
                    ) : null}
                    
                    {/* Block label (only show once per block) */}
                    {lot.lot === '1' && (
                      <text
                        x={blockPos.x}
                        y={blockPos.y}
                        fontSize="10"
                        fill="#000"
                        fontWeight="bold"
                        textAnchor="start"
                        pointerEvents={isEditMode ? 'all' : 'none'}
                        style={{ 
                          userSelect: 'none',
                          cursor: isEditMode ? 'pointer' : 'default',
                          opacity: editingMarker?.type === 'block' && editingMarker?.block === lot.block ? 0.5 : 1
                        }}
                        onClick={(e) => {
                          if (isEditMode) {
                            e.stopPropagation();
                            setEditingMarker({ type: 'block', block: lot.block });
                            alert(`Click on the map to position the Block ${lot.block} label`);
                          }
                        }}
                      >
                        Block {lot.block}
                      </text>
                    )}
                    
                    {/* Street label (only show once per street) */}
                    {lot.lot === '1' && (
                      <text
                        x={streetPos.x}
                        y={streetPos.y}
                        fontSize="9"
                        fill="#444"
                        fontWeight="500"
                        textAnchor="start"
                        pointerEvents={isEditMode ? 'all' : 'none'}
                        style={{ 
                          userSelect: 'none',
                          cursor: isEditMode ? 'pointer' : 'default',
                          opacity: editingMarker?.type === 'street' && editingMarker?.street === lot.street ? 0.5 : 1
                        }}
                        onClick={(e) => {
                          if (isEditMode) {
                            e.stopPropagation();
                            setEditingMarker({ type: 'street', street: lot.street });
                            alert(`Click on the map to position the ${lot.street} label`);
                          }
                        }}
                      >
                        {lot.street}
                      </text>
                    )}
                  </g>
                );
              })}
              
              {/* Show all lot labels when in edit mode (not just lot 1) */}
              {isEditMode && visibleLots.map((lot) => {
                if (!lot.resident || lot.lot === '1') return null;
                
                const lotKey = `lot_${lot.block}_${lot.lot}`;
                const lotPos = markerPositions[lotKey] || { x: lot.x + lot.width / 2, y: lot.y + lot.height / 2 + 2 };
                
                return (
                  <text
                    key={`edit-lot-${lot.id}`}
                    x={lotPos.x}
                    y={lotPos.y}
                    fontSize="8"
                    fill="#fff"
                    fontWeight="600"
                    textAnchor="middle"
                    pointerEvents="all"
                    style={{ 
                      userSelect: 'none',
                      cursor: 'pointer',
                      opacity: editingMarker?.type === 'lot' && editingMarker?.block === lot.block && editingMarker?.lot === lot.lot ? 0.5 : 1
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingMarker({ type: 'lot', block: lot.block, lot: lot.lot });
                      alert(`Click on the map to position the Lot ${lot.lot} label for Block ${lot.block}`);
                    }}
                  >
                    {lot.lot}
                  </text>
                );
              })}
              
              {/* Resident markers overlay - Default Google Maps Style */}
              {visibleLots.map((lot) => {
                if (!lot.resident) return null;
                
                // Check if there's a pinned location for this address - if so, skip rendering resident marker
                const normalizedBlock = normalizeAddress(lot.block, 'block');
                const normalizedLot = normalizeAddress(lot.lot, 'lot');
                
                const hasMatchingPin = pinnedLocations.some(pin => {
                  const pinNormalizedBlock = normalizeAddress(pin.block, 'block');
                  const pinNormalizedLot = normalizeAddress(pin.lot, 'lot');
                  
                  return pinNormalizedBlock === normalizedBlock && 
                         pinNormalizedLot === normalizedLot;
                });
                
                // Skip rendering if there's a matching pinned location
                if (hasMatchingPin) return null;
                
                const isAvailable = lot.resident?.availabilityStatus === 'available';
                const isSelected = selectedLot?.id === lot.id;
                
                // Check if there's a custom position for this marker
                const customPosition = residentMarkerPositions[lot.id];
                
                // Calculate marker position - use custom position if available, otherwise use lot center
                const markerX = customPosition ? customPosition.x : lot.x + lot.width / 2;
                const markerY = customPosition ? customPosition.y : lot.y + lot.height / 2;
                
                // Reduced marker dimensions (teardrop shape)
                const markerSize = isSelected ? 24 : 20; // Reduced from 32/40
                const markerHeight = markerSize;
                const markerWidth = markerSize * 0.64; // Standard Google Maps marker aspect ratio
                const headRadius = markerWidth / 2;
                
                // Marker colors: Green = available, Blue = unavailable (homeowners default to unavailable)
                const markerColor = isAvailable ? '#34C759' : '#4285F4'; // Green = available, Blue = unavailable
                const shadowColor = '#000000';
                
                // Position: marker point (bottom tip) should be at markerX, markerY
                const centerX = markerX;
                const headCenterY = markerY - markerHeight + headRadius;
                const pointY = markerY;
                        
                return (
                  <g 
                    key={`marker-${lot.id}`}
                    data-resident-marker="true"
                    style={{ pointerEvents: 'all', cursor: draggingLot === lot.id ? 'move' : 'pointer' }} 
                    onMouseDown={(e) => {
                      if (!isPinMode && !isEditMode) {
                        handleResidentMarkerMouseDown(e, lot.id, markerX, markerY);
                      }
                    }}
                    onMouseMove={draggingLot === lot.id ? handleResidentMarkerDrag : undefined}
                    onMouseUp={handleResidentMarkerMouseUp}
                    onMouseLeave={handleResidentMarkerMouseLeave}
                    onClick={(e) => {
                      if (!isLongPress && !draggingLot && !isPinMode && !isEditMode) {
                        handleLotClick(lot, e);
                      }
                    }}
                  >
                    {/* Shadow */}
                    <path
                      d={`M ${centerX},${pointY + 1}
                          L ${centerX - headRadius * 0.85},${headCenterY + headRadius * 0.15 + 1}
                          A ${headRadius * 0.85} ${headRadius * 0.85} 0 1 1 ${centerX + headRadius * 0.85},${headCenterY + headRadius * 0.15 + 1}
                          Z`}
                      fill={shadowColor}
                      opacity="0.3"
                    />
                    
                    {/* Marker (teardrop shape) */}
                    <path
                      d={`M ${centerX},${pointY}
                          L ${centerX - headRadius},${headCenterY + headRadius * 0.2}
                          A ${headRadius} ${headRadius} 0 1 1 ${centerX + headRadius},${headCenterY + headRadius * 0.2}
                          Z`}
                      fill={markerColor}
                      stroke="#000000"
                      strokeWidth={isSelected ? 2.5 : 2}
                    />
                    
                    {/* Black circle/dot in the upper rounded portion */}
                    <circle
                      cx={centerX}
                      cy={headCenterY}
                      r={headRadius * 0.35}
                      fill="#000000"
                    />
                    
                    {/* Selection indicator */}
                    {isSelected && (
                      <circle
                        cx={centerX}
                        cy={headCenterY}
                        r={headRadius + 5}
                        fill="none"
                        stroke="#000000"
                        strokeWidth={2}
                        opacity={0.4}
                      />
                    )}
                    
                    {/* Debug label in development */}
                    {process.env.NODE_ENV === 'development' && (
                      <text
                        x={centerX}
                        y={headCenterY - headRadius - 5}
                        fontSize="8"
                        fill="#000"
                        fontWeight="bold"
                        textAnchor="middle"
                        style={{ pointerEvents: 'none' }}
                      >
                        {lot.resident.fullName.split(' ')[0]}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            
            {/* Lot Info Panel - Positioned above marker */}
            {selectedLot && selectedLot.resident && selectedLotPosition && (
              <div 
                className="absolute bg-white border border-gray-300 shadow-lg rounded-md p-2 z-20 max-w-xs"
                style={{
                  left: `${selectedLotPosition.x}px`,
                  top: `${selectedLotPosition.y}px`,
                  transform: 'translate(-50%, calc(-100% - 10px))',
                }}
              >
          <div className="flex justify-end items-start mb-1">
            <button
              onClick={() => {
                setSelectedLot(null);
                setSelectedLotPosition(null);
              }}
              className="text-gray-500 hover:text-black text-xs"
              style={{ fontSize: '12px', lineHeight: '1' }}
            >
              ✕
            </button>
          </div>
          <div className="space-y-0.5 text-xs">
            {selectedLot.resident ? (
              <>
                <p className="text-black font-semibold text-sm mb-1">{selectedLot.resident.fullName}</p>
                <div className="text-gray-600">
                  <p className="text-black text-xs"><strong>Block:</strong> {selectedLot.block}</p>
                  <p className="text-black text-xs"><strong>Lot:</strong> {selectedLot.lot}</p>
                  {/* Show tenants if homeowner */}
                  {(() => {
                    const isHomeowner = !selectedLot.resident?.data?.isTenant && selectedLot.resident?.data?.residentType !== 'tenant';
                    if (isHomeowner) {
                      // Find tenants at the same block and lot
                      const tenants = residentData.filter(resident => {
                        const isTenant = resident.data?.isTenant === true || resident.data?.residentType === 'tenant';
                        if (!isTenant) return false;
                        
                        const residentBlock = normalizeAddress(String(resident.data?.address?.block || ''), 'block');
                        const residentLot = normalizeAddress(String(resident.data?.address?.lot || ''), 'lot');
                        const lotBlock = normalizeAddress(selectedLot.block, 'block');
                        const lotLot = normalizeAddress(selectedLot.lot, 'lot');
                        
                        return residentBlock === lotBlock && residentLot === lotLot;
                      });
                      
                      if (tenants.length > 0) {
                        return (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-black text-xs font-semibold mb-1">Tenants ({tenants.length}):</p>
                            {tenants.map((tenant) => (
                              <p key={tenant.id} className="text-black text-xs ml-2">
                                • {tenant.fullName}
                              </p>
                            ))}
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-xs mt-1">No resident assigned</p>
            )}
          </div>
          {/* Arrow pointing down to marker */}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: '10px solid #000',
            }}
          />
              </div>
            )}
            
            {/* Pin Info Panel - Positioned above marker */}
            {selectedPin && selectedPinPosition && (
              <div 
                className="absolute bg-white border border-gray-300 shadow-lg rounded-md p-2 z-20 max-w-xs"
                style={{
                  left: `${selectedPinPosition.x}px`,
                  top: `${selectedPinPosition.y}px`,
                  transform: 'translate(-50%, calc(-100% - 10px))',
                }}
              >
                <div className="flex justify-end items-start mb-1">
                  <button
                    onClick={() => {
                      setSelectedPin(null);
                      setSelectedPinPosition(null);
                    }}
                    className="text-gray-500 hover:text-black text-xs"
                    style={{ fontSize: '12px', lineHeight: '1' }}
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="text-gray-600">
                    {selectedPin.isOccupied ? (() => {
                      // Find resident for this pin by matching block and lot
                      const matchingResident = residentData.find(resident => {
                        const residentBlock = normalizeAddress(String(resident.data?.address?.block || ''), 'block');
                        const residentLot = normalizeAddress(String(resident.data?.address?.lot || ''), 'lot');
                        const pinBlock = normalizeAddress(selectedPin.block, 'block');
                        const pinLot = normalizeAddress(selectedPin.lot, 'lot');
                        return residentBlock === pinBlock && residentLot === pinLot;
                      });
                      
                      const isHomeowner = matchingResident && !matchingResident.data?.isTenant && matchingResident.data?.residentType !== 'tenant';
                      
                      // Find tenants at the same block and lot
                      const tenants = residentData.filter(resident => {
                        const isTenant = resident.data?.isTenant === true || resident.data?.residentType === 'tenant';
                        if (!isTenant) return false;
                        
                        const residentBlock = normalizeAddress(String(resident.data?.address?.block || ''), 'block');
                        const residentLot = normalizeAddress(String(resident.data?.address?.lot || ''), 'lot');
                        const pinBlock = normalizeAddress(selectedPin.block, 'block');
                        const pinLot = normalizeAddress(selectedPin.lot, 'lot');
                        
                        return residentBlock === pinBlock && residentLot === pinLot;
                      });
                      
                      return (
                        <>
                          {matchingResident && (
                            <p className="text-black font-semibold text-sm mb-1">{matchingResident.fullName}</p>
                          )}
                          <p className="text-black text-xs"><strong>Block:</strong> {selectedPin.block}</p>
                          <p className="text-black text-xs"><strong>Lot:</strong> {selectedPin.lot}</p>
                          <p className="text-black text-xs">
                            <strong>Status:</strong> {
                              selectedPin.isAvailable ? 'Available' : 'Unavailable'
                            }
                          </p>
                          {/* Show tenants if homeowner */}
                          {isHomeowner && tenants.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <p className="text-black text-xs font-semibold mb-1">Tenants ({tenants.length}):</p>
                              {tenants.map((tenant) => (
                                <p key={tenant.id} className="text-black text-xs ml-2">
                                  • {tenant.fullName}
                                </p>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })() : (
                      <>
                        <p className="text-black text-xs"><strong>Block:</strong> {selectedPin.block}</p>
                        <p className="text-black text-xs"><strong>Lot:</strong> {selectedPin.lot}</p>
                        <p className="text-black text-xs"><strong>Status:</strong> Unoccupied</p>
                      </>
                    )}
                  </div>
                </div>
                {/* Arrow pointing down to marker */}
                <div
                  className="absolute top-full left-1/2 transform -translate-x-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderTop: '6px solid #d1d5db',
                  }}
                />
                <div
                  className="absolute top-full left-1/2 transform -translate-x-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '5px solid white',
                    marginTop: '-1px',
                  }}
                />
              </div>
            )}
        </div>
        
        {/* Pin Label Modal */}
        {showPinModal && newPinPosition && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <h3 className="text-lg font-bold mb-4">Label Pin Location</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Block</label>
                  <select
                    value={pinFormData.block}
                    onChange={(e) => setPinFormData({ ...pinFormData, block: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Block</option>
                    {blockOptions.map((block) => (
                      <option key={block} value={block}>{block}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lot</label>
                  <select
                    value={pinFormData.lot}
                    onChange={(e) => setPinFormData({ ...pinFormData, lot: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Lot</option>
                    {lotOptions.map((lot) => (
                      <option key={lot} value={lot}>{lot}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={pinFormData.isOccupied}
                      onChange={(e) => setPinFormData({ ...pinFormData, isOccupied: e.target.checked, isAvailable: e.target.checked ? pinFormData.isAvailable : false })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Occupied</span>
                  </label>
                </div>
                
                {pinFormData.isOccupied && (
                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={pinFormData.isAvailable}
                        onChange={(e) => setPinFormData({ ...pinFormData, isAvailable: e.target.checked })}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Available</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      {pinFormData.isAvailable ? 'Green marker (occupied & available)' : 'Blue marker (occupied & unavailable)'}
                    </p>
                  </div>
                )}
                
                {!pinFormData.isOccupied && (
                  <p className="text-xs text-gray-500">Red marker (unoccupied)</p>
                )}
              </div>
              
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowPinModal(false);
                    setNewPinPosition(null);
                    setPinFormData({ block: '', lot: '', isOccupied: false, isAvailable: false });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                    onClick={() => {
                      if (pinFormData.block && pinFormData.lot && newPinPosition) {
                        savePinnedLocation(
                          newPinPosition, 
                          pinFormData.block, 
                          pinFormData.lot, 
                          pinFormData.isOccupied,
                          pinFormData.isAvailable
                        );
                      } else {
                        alert('Please select Block and Lot');
                      }
                    }}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Save Pin
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Map;

