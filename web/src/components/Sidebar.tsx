import { useState, useCallback, memo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

const menuItems: MenuItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '▦' },
  { path: '/map', label: 'Map', icon: '📍' },
  { path: '/announcement', label: 'Announcement', icon: '◈' },
  { path: '/complaints', label: 'Complaints', icon: '⚠' },
  { path: '/visitor-pre-registration', label: 'Visitor Pre-Registration', icon: '○' },
  { path: '/resident-management', label: 'Resident Management', icon: '⬟' },
  { path: '/billing-payment', label: 'Billing & Payment', icon: '$' },
  { path: '/maintenance', label: 'Maintenance', icon: '⚙' },
  { path: '/vehicle-registration', label: 'Vehicle Registration', icon: '🚗' },
  { path: '/archived', label: 'Archived', icon: '' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [residentManagementOpen, setResidentManagementOpen] = useState(false);
  const [vehicleRegistrationOpen, setVehicleRegistrationOpen] = useState(false);
  const [pendingComplaintsCount, setPendingComplaintsCount] = useState(0);
  const [pendingVehicleRegistrationsCount, setPendingVehicleRegistrationsCount] = useState(0);
  const [pendingMaintenanceCount, setPendingMaintenanceCount] = useState(0);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const handleSignOut = useCallback(async () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      try {
        await signOut(auth);
        navigate('/');
      } catch (error) {
        alert('Failed to sign out. Please try again.');
        console.error('Error signing out:', error);
      }
    }
  }, [navigate]);

  // Listen to pending and in-progress complaints
  useEffect(() => {
    if (!db) return;

    let unsubscribe: (() => void) | null = null;

    const q = query(
      collection(db, 'complaints'),
      where('status', 'in', ['pending', 'in-progress'])
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingComplaintsCount(snapshot.size);
    }, (error: any) => {
      console.error('Error listening to pending complaints:', error);
      // Fallback: fetch all and filter client-side
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(collection(db, 'complaints'));
        unsubscribe = onSnapshot(q2, (snapshot2) => {
          let count = 0;
          snapshot2.forEach((doc) => {
            const data = doc.data();
            if (data.status === 'pending' || data.status === 'in-progress') {
              count++;
            }
          });
          setPendingComplaintsCount(count);
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [db]);

  // Listen to pending and in-progress vehicle registrations
  useEffect(() => {
    if (!db) return;

    let unsubscribe: (() => void) | null = null;

    const q = query(
      collection(db, 'vehicleRegistrations'),
      where('status', 'in', ['pending', 'in-progress'])
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingVehicleRegistrationsCount(snapshot.size);
    }, (error: any) => {
      console.error('Error listening to pending vehicle registrations:', error);
      // Fallback: fetch all and filter client-side
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(collection(db, 'vehicleRegistrations'));
        unsubscribe = onSnapshot(q2, (snapshot2) => {
          let count = 0;
          snapshot2.forEach((doc) => {
            const data = doc.data();
            if (data.status === 'pending' || data.status === 'in-progress') {
              count++;
            }
          });
          setPendingVehicleRegistrationsCount(count);
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [db]);

  // Listen to pending and in-progress maintenance requests
  useEffect(() => {
    if (!db) return;

    let unsubscribe: (() => void) | null = null;

    const q = query(
      collection(db, 'maintenance'),
      where('status', 'in', ['pending', 'in-progress'])
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingMaintenanceCount(snapshot.size);
    }, (error: any) => {
      console.error('Error listening to pending maintenance:', error);
      // Fallback: fetch all and filter client-side
      if (error.code === 'failed-precondition' || error.message?.includes('index')) {
        const q2 = query(collection(db, 'maintenance'));
        unsubscribe = onSnapshot(q2, (snapshot2) => {
          let count = 0;
          snapshot2.forEach((doc) => {
            const data = doc.data();
            if (data.status === 'pending' || data.status === 'in-progress') {
              count++;
            }
          });
          setPendingMaintenanceCount(count);
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [db]);

  // Listen to pending resident applications
  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, 'pendingUsers'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingApplicationsCount(snapshot.size);
    }, (error) => {
      console.error('Error listening to pending applications:', error);
    });

    return () => unsubscribe();
  }, [db]);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-[999] lg:hidden"
          onClick={onClose}
        />
      )}
      
    <aside
        className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 z-[1000] overflow-hidden transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 w-[260px] md:w-[220px]`}
    >
      <div className="flex flex-col h-full">
        <div className="px-4 py-4 flex items-center gap-3 min-h-[64px] border-b border-gray-100">
          <img 
            src="/logo.png" 
            alt="Subdibuddy Logo" 
            className="w-8 h-8 object-contain"
          />
          <h2 className="text-gray-900 text-base font-medium m-0 whitespace-nowrap">
            Subdibuddy
          </h2>
        </div>
        
        <nav className="flex-1 flex flex-col py-2 overflow-y-auto min-h-0">
          {menuItems.map((item) => {
            if (item.path === '/resident-management') {
              const isActive = location.pathname.startsWith('/resident-management');
              return (
                <div 
                  key={item.path} 
                  className="relative"
                  onMouseEnter={() => {
                    setResidentManagementOpen(true);
                  }}
                  onMouseLeave={() => {
                    setResidentManagementOpen(false);
                  }}
                >
                  <button
                    className={`flex items-center gap-3 px-4 py-2.5 mx-2 border-none rounded-md cursor-pointer transition-all duration-200 text-sm text-left whitespace-nowrap w-auto relative ${
                      isActive
                        ? 'bg-[#1877F2] text-white font-semibold'
                        : 'bg-transparent hover:bg-gray-100 hover:text-[#1877F2] text-gray-600'
                    }`}
                  >
                    <span className="font-normal text-sm flex-1">
                      {item.label}
                    </span>
                    {pendingApplicationsCount > 0 && (
                      <span className="bg-red-500 text-white text-xs font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                        {pendingApplicationsCount > 9 ? '9+' : pendingApplicationsCount}
                      </span>
                    )}
                    <span className={`text-xs transition-transform ${residentManagementOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {residentManagementOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      <button
                        className={`flex items-center gap-3 px-4 py-2 w-full border-none rounded-md cursor-pointer transition-all duration-200 text-sm text-left ${
                          location.pathname === '/resident-management/applications'
                            ? 'bg-[#1877F2] text-white font-semibold'
                            : 'bg-transparent hover:bg-gray-100 hover:text-[#1877F2] text-gray-600'
                        }`}
                        onClick={() => {
                          handleNavigation('/resident-management/applications');
                          setResidentManagementOpen(false);
                          if (window.innerWidth < 1024) {
                            onClose();
                          }
                        }}
                      >
                        <span className="text-xs">Applications</span>
                      </button>
                      <button
                        className={`flex items-center gap-3 px-4 py-2 w-full border-none rounded-md cursor-pointer transition-all duration-200 text-sm text-left ${
                          location.pathname === '/resident-management/registered'
                            ? 'bg-[#1877F2] text-white font-semibold'
                            : 'bg-transparent hover:bg-gray-100 hover:text-[#1877F2] text-gray-600'
                        }`}
                        onClick={() => {
                          handleNavigation('/resident-management/registered');
                          setResidentManagementOpen(false);
                          if (window.innerWidth < 1024) {
                            onClose();
                          }
                        }}
                      >
                        <span className="text-xs">Registered</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (item.path === '/vehicle-registration') {
              const isActive = location.pathname.startsWith('/vehicle-registration');
              return (
                <div 
                  key={item.path} 
                  className="relative"
                  onMouseEnter={() => {
                    setVehicleRegistrationOpen(true);
                  }}
                  onMouseLeave={() => {
                    setVehicleRegistrationOpen(false);
                  }}
                >
                  <button
                    className={`flex items-center gap-3 px-4 py-2.5 mx-2 border-none rounded-md cursor-pointer transition-all duration-200 text-sm text-left whitespace-nowrap w-auto relative ${
                      isActive
                        ? 'bg-[#1877F2] text-white font-semibold'
                        : 'bg-transparent hover:bg-gray-100 hover:text-[#1877F2] text-gray-600'
                    }`}
                  >
                    <span className="font-normal text-sm flex-1">
                      {item.label}
                    </span>
                    {pendingVehicleRegistrationsCount > 0 && (
                      <span className="bg-red-500 text-white text-xs font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                        {pendingVehicleRegistrationsCount > 9 ? '9+' : pendingVehicleRegistrationsCount}
                      </span>
                    )}
                    <span className={`text-xs transition-transform ${vehicleRegistrationOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {vehicleRegistrationOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      <button
                        className={`flex items-center gap-3 px-4 py-2 w-full border-none rounded-md cursor-pointer transition-all duration-200 text-sm text-left ${
                          location.pathname === '/vehicle-registration/applications'
                            ? 'bg-[#1877F2] text-white font-semibold'
                            : 'bg-transparent hover:bg-gray-100 hover:text-[#1877F2] text-gray-600'
                        }`}
                        onClick={() => {
                          handleNavigation('/vehicle-registration/applications');
                          setVehicleRegistrationOpen(false);
                          if (window.innerWidth < 1024) {
                            onClose();
                          }
                        }}
                      >
                        <span className="text-xs">Applications</span>
                      </button>
                      <button
                        className={`flex items-center gap-3 px-4 py-2 w-full border-none rounded-md cursor-pointer transition-all duration-200 text-sm text-left ${
                          location.pathname === '/vehicle-registration/registered'
                            ? 'bg-[#1877F2] text-white font-semibold'
                            : 'bg-transparent hover:bg-gray-100 hover:text-[#1877F2] text-gray-600'
                        }`}
                        onClick={() => {
                          handleNavigation('/vehicle-registration/registered');
                          setVehicleRegistrationOpen(false);
                          if (window.innerWidth < 1024) {
                            onClose();
                          }
                        }}
                      >
                        <span className="text-xs">Registered</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            // Get badge count for this item
            let badgeCount = 0;
            if (item.path === '/complaints') {
              badgeCount = pendingComplaintsCount;
            } else if (item.path === '/maintenance') {
              badgeCount = pendingMaintenanceCount;
            }

            return (
              <button
                key={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 border-none rounded-md cursor-pointer transition-all duration-200 text-sm text-left whitespace-nowrap w-auto relative ${
                  location.pathname === item.path
                    ? 'bg-[#1877F2] text-white font-semibold'
                    : 'bg-transparent hover:bg-gray-100 hover:text-[#1877F2] text-gray-600'
                }`}
                onClick={() => {
                  handleNavigation(item.path);
                  // Close sidebar on mobile after navigation
                  if (window.innerWidth < 1024) {
                    onClose();
                  }
                }}
              >
                <span className="font-normal text-sm flex-1">
                  {item.label}
                </span>
                {badgeCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-semibold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="w-full border-t border-gray-100 p-2">
          <button
            className="bg-gray-900 text-white border-none px-4 py-2 rounded-md text-sm font-normal cursor-pointer transition-all hover:bg-gray-800 w-full"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}

export default memo(Sidebar);

