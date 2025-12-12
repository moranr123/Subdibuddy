import { useEffect, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import Layout from '../components/Layout';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface Resident {
  id: string;
  fullName?: string;
  email: string;
  location?: UserLocation;
  createdAt?: any;
  updatedAt?: any;
}

function ResidentManagement() {
  const [user, setUser] = useState<any>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<UserLocation | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const fetchResidents = useCallback(async () => {
    if (!db) {
      console.error('Firestore db is not initialized');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Fetching residents from Firestore...');
      
      // Try with orderBy first, fallback to simple query if it fails
      let querySnapshot;
      try {
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (orderByError: any) {
        console.warn('orderBy failed, trying without orderBy:', orderByError);
        // Fallback: get all documents without ordering
        querySnapshot = await getDocs(collection(db, 'users'));
      }
      
      const residentsData: Resident[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out superadmin accounts - only include residents
        if (data.role === 'superadmin') {
          console.log('Skipping superadmin:', doc.id);
          return;
        }
        console.log('Resident data:', { id: doc.id, ...data });
        residentsData.push({
          id: doc.id,
          ...data,
        } as Resident);
      });
      
      // Sort manually if orderBy failed
      residentsData.sort((a, b) => {
        const aDate = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bDate - aDate;
      });
      
      console.log(`Fetched ${residentsData.length} residents`);
      setResidents(residentsData);
    } catch (error: any) {
      console.error('Error fetching residents:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      alert(`Failed to load residents: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    if (user) {
      console.log('User authenticated, fetching residents...', { userEmail: user.email, dbExists: !!db });
      if (db) {
        fetchResidents();
      } else {
        console.error('Firestore db is not available');
        alert('Database connection error. Please refresh the page.');
      }
    }
  }, [user, db, fetchResidents]);

  const handleLocationClick = useCallback((location: UserLocation) => {
    setSelectedLocation(location);
    setShowMapModal(true);
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    if (timestamp.toDate) {
      return new Date(timestamp.toDate()).toLocaleDateString();
    }
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <Layout>
      <div className="min-h-screen bg-white w-full">
        <header className="bg-white text-gray-900 py-4 border-b border-gray-200 sticky top-0 z-[100]">
          <div className="w-full m-0 px-8 flex justify-between items-center">
            <h1 className="text-xl m-0 text-gray-900 font-normal">Resident Management</h1>
            <div className="flex items-center gap-5">
              <span className="text-sm text-gray-500 font-normal">{user?.email || ''}</span>
            </div>
          </div>
        </header>

        <main className="w-full max-w-full m-0 p-10 box-border">
          <div className="flex flex-col gap-6 w-full max-w-full">
            <div className="w-full bg-white rounded-xl p-8 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="m-0 text-gray-900 text-lg font-normal">Residents</h2>
                <button 
                  className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={fetchResidents} 
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {loading && residents.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-gray-600 text-sm">Loading residents...</div>
              ) : residents.length === 0 ? (
                <div className="text-center py-20 px-5 text-gray-600">
                  <p className="text-base font-normal text-gray-600">No residents found.</p>
                  <p className="text-xs text-gray-400 mt-2.5">
                    Check browser console for details. Make sure users have signed up and data is saved to Firestore.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Full Name</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Email</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Location</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Created At</th>
                        <th className="px-4 py-4 text-left font-semibold text-gray-900 uppercase text-xs tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {residents.map((resident) => (
                        <tr key={resident.id} className="hover:bg-gray-50 last:border-b-0 border-b border-gray-100">
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">{resident.fullName || 'N/A'}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">{resident.email}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                            {resident.location ? (
                              <button
                                className="bg-none border-none text-primary cursor-pointer underline text-sm p-0 font-inherit hover:text-primary-dark"
                                onClick={() => handleLocationClick(resident.location!)}
                              >
                                {resident.location.latitude.toFixed(6)}, {resident.location.longitude.toFixed(6)}
                              </button>
                            ) : (
                              <span className="text-gray-400 italic">No location set</span>
                            )}
                          </td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">{formatDate(resident.createdAt)}</td>
                          <td className="px-4 py-4 border-b border-gray-100 text-gray-600">
                            {resident.location && (
                              <button
                                className="bg-primary text-white border-none px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:bg-primary-dark"
                                onClick={() => handleLocationClick(resident.location!)}
                              >
                                View Map
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>

        {showMapModal && selectedLocation && (
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[1000] p-5" onClick={() => setShowMapModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200">
                <h3 className="m-0 text-gray-900 text-xl font-normal">Resident Location</h3>
                <button 
                  className="bg-none border-none text-2xl text-gray-600 cursor-pointer p-0 w-8 h-8 flex items-center justify-center rounded transition-all hover:bg-gray-100 hover:text-gray-900"
                  onClick={() => setShowMapModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="w-full h-[500px] relative overflow-hidden">
                <iframe
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedLocation.longitude - 0.01},${selectedLocation.latitude - 0.01},${selectedLocation.longitude + 0.01},${selectedLocation.latitude + 0.01}&layer=mapnik&marker=${selectedLocation.latitude},${selectedLocation.longitude}`}
                  width="100%"
                  height="100%"
                  style={{ border: 'none' }}
                  title="Resident Location Map"
                />
              </div>
              <div className="px-6 py-5 border-t border-gray-200 flex justify-between items-center">
                <p className="m-0 text-gray-600 text-sm">
                  Coordinates: {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </p>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${selectedLocation.latitude}&mlon=${selectedLocation.longitude}&zoom=15`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-white no-underline px-5 py-2.5 rounded-md text-sm font-medium transition-all inline-block hover:bg-primary-dark hover:-translate-y-0.5"
                >
                  Open in OpenStreetMap
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default memo(ResidentManagement);
