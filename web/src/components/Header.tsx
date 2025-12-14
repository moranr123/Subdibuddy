import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useSidebar } from '../contexts/SidebarContext';

interface HeaderProps {
  title: string;
  showSearchBar?: boolean;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  handleSearch?: () => void;
  isSearching?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  selectedPlace?: string;
  onUnlockView?: () => void;
  suggestions?: any[];
  showSuggestions?: boolean;
  onSelectSuggestion?: (placeId: string, description: string) => void;
  suggestionsRef?: React.RefObject<HTMLDivElement>;
  isViewLocked?: boolean;
}

interface PendingApplication {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  createdAt?: Timestamp;
  isRead?: boolean;
}

interface Notification {
  id: string;
  type: string;
  complaintId?: string;
  userId?: string;
  userEmail?: string;
  subject?: string;
  message: string;
  recipientType: string;
  isRead: boolean;
  createdAt: Timestamp;
}

interface UnifiedNotification {
  id: string;
  type: 'application' | 'complaint' | 'vehicle_registration' | 'maintenance';
  createdAt: Timestamp;
  data: PendingApplication | Notification;
}

function Header({ 
  title, 
  showSearchBar = false,
  searchQuery = '',
  setSearchQuery,
  handleSearch,
  isSearching = false,
  searchInputRef,
  suggestions = [],
  showSuggestions = false,
  onSelectSuggestion,
  suggestionsRef
}: HeaderProps) {
  const { toggleSidebar } = useSidebar();
  const [notificationCount, setNotificationCount] = useState(0);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [complaintNotifications, setComplaintNotifications] = useState<Notification[]>([]);
  const [vehicleRegistrationNotifications, setVehicleRegistrationNotifications] = useState<Notification[]>([]);
  const [maintenanceNotifications, setMaintenanceNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!db) return;

    // Set up real-time listener for pending applications
    const q1 = query(collection(db, 'pendingUsers'), orderBy('createdAt', 'desc'));
    const unsubscribe1 = onSnapshot(q1, (snapshot) => {
      const applications: PendingApplication[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        applications.push({
          id: doc.id,
          firstName: data.firstName,
          lastName: data.lastName,
          fullName: data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          email: data.email,
          phone: data.phone,
          createdAt: data.createdAt,
        });
      });
      // Sort by createdAt descending (newest first)
      applications.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      setPendingApplications(applications);
    }, (error) => {
      console.error('Error listening to pending applications:', error);
    });

    // Set up real-time listener for admin notifications
    const q2 = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe2 = onSnapshot(q2, (snapshot) => {
      const complaintNotifs: Notification[] = [];
      const vehicleNotifs: Notification[] = [];
      const maintenanceNotifs: Notification[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Only show admin notifications that are unread
        if (data.recipientType === 'admin' && !data.isRead) {
          const notification = {
            id: doc.id,
            ...data,
          } as Notification;
          if (data.type === 'vehicle_registration' || data.type === 'vehicle_registration_status') {
            vehicleNotifs.push(notification);
          } else if (data.type === 'maintenance' || data.type === 'maintenance_status') {
            maintenanceNotifs.push(notification);
          } else if (data.type === 'complaint' || data.type === 'complaint_status') {
            complaintNotifs.push(notification);
          }
        }
      });
      // Sort by createdAt descending (newest first)
      complaintNotifs.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      vehicleNotifs.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      maintenanceNotifs.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      setComplaintNotifications(complaintNotifs);
      setVehicleRegistrationNotifications(vehicleNotifs);
      setMaintenanceNotifications(maintenanceNotifs);
    }, (error) => {
      console.error('Error listening to notifications:', error);
    });

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, []);

  // Combine and sort all notifications by newest first
  const allNotifications = (() => {
    const unified: UnifiedNotification[] = [];
    
    // Add pending applications
    pendingApplications.forEach(app => {
      unified.push({
        id: app.id,
        type: 'application',
        createdAt: app.createdAt || Timestamp.now(),
        data: app,
      });
    });
    
    // Add complaint notifications
    complaintNotifications.forEach(notif => {
      unified.push({
        id: notif.id,
        type: 'complaint',
        createdAt: notif.createdAt,
        data: notif,
      });
    });
    
    // Add vehicle registration notifications
    vehicleRegistrationNotifications.forEach(notif => {
      unified.push({
        id: notif.id,
        type: 'vehicle_registration',
        createdAt: notif.createdAt,
        data: notif,
      });
    });
    
    // Add maintenance notifications
    maintenanceNotifications.forEach(notif => {
      unified.push({
        id: notif.id,
        type: 'maintenance',
        createdAt: notif.createdAt,
        data: notif,
      });
    });
    
    // Sort by createdAt descending (newest first)
    unified.sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bTime - aTime;
    });
    
    return unified;
  })();

  // Calculate total notification count
  useEffect(() => {
    setNotificationCount(pendingApplications.length + complaintNotifications.length + vehicleRegistrationNotifications.length + maintenanceNotifications.length);
  }, [pendingApplications, complaintNotifications, vehicleRegistrationNotifications, maintenanceNotifications]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const handleViewApplications = () => {
    setShowNotifications(false);
    navigate('/resident-management/applications');
  };

  const handleViewComplaints = () => {
    setShowNotifications(false);
    navigate('/complaints');
  };

  const handleViewVehicleRegistrations = () => {
    setShowNotifications(false);
    navigate('/vehicle-registration');
  };

  const handleViewMaintenance = () => {
    setShowNotifications(false);
    navigate('/maintenance');
  };

  const formatTimeAgo = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'Just now';
    
    const now = new Date();
    const created = timestamp.toDate ? timestamp.toDate() : (timestamp as any).seconds ? new Date((timestamp as any).seconds * 1000) : new Date();
    const diffInSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return created.toLocaleDateString();
  };

  const getInitials = (fullName: string | undefined) => {
    if (!fullName) return '?';
    const names = fullName.trim().split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  };

  return (
    <header className="bg-white text-gray-900 border-b border-gray-200 sticky top-0 z-[100]">
      <div className="w-full m-0 px-4 md:px-8 py-4">
        <div className="flex flex-col gap-3 md:gap-4">
          {/* First Row: Title and Notifications */}
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Hamburger Menu Button for Mobile */}
              <button
                onClick={toggleSidebar}
                className="lg:hidden p-2 text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0"
                aria-label="Toggle menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-lg md:text-xl m-0 text-gray-900 font-normal whitespace-nowrap">{title}</h1>
            </div>
            <div className="relative flex-shrink-0" ref={notificationRef}>
            <button 
              className="relative p-1.5 sm:p-2 text-gray-600 hover:text-gray-900 transition-colors"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notificationCount > 0 && (
                <span className="absolute top-0 right-0 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-red-500 rounded-full text-white text-[10px] sm:text-xs flex items-center justify-center font-medium">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            
            {/* Notification dropdown - Facebook style */}
            {showNotifications && (
              <div className="absolute right-0 sm:right-0 mt-2 w-[calc(100vw-1rem)] sm:w-96 max-w-sm bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900">Notifications</h3>
                    {notificationCount > 0 && (
                      <span className="text-xs text-gray-500">{notificationCount} new</span>
                    )}
                  </div>
                </div>
                <div className="max-h-[60vh] sm:max-h-[500px] overflow-y-auto">
                  {notificationCount === 0 ? (
                    <div className="p-6 sm:p-8 text-center">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 font-medium">No notifications</p>
                      <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                    </div>
                  ) : (
                    <div>
                      {allNotifications.map((unified) => {
                        if (unified.type === 'application') {
                          const application = unified.data as PendingApplication;
                          return (
                        <div
                              key={unified.id}
                              className="px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer transition-colors"
                          onClick={handleViewApplications}
                        >
                              <div className="flex items-start gap-2 sm:gap-3">
                            {/* Avatar */}
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs sm:text-sm font-medium">
                                {getInitials(application.fullName)}
                              </span>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-1">
                                    {application.fullName || 'New Resident'}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                    {application.email || application.phone || 'No contact info'}
                                  </p>
                                </div>
                                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 ml-2">
                                  {formatTimeAgo(application.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1.5">
                                New resident application submitted
                              </p>
                            </div>
                          </div>
                        </div>
                          );
                        } else if (unified.type === 'complaint') {
                          const notification = unified.data as Notification;
                          return (
                            <div
                              key={unified.id}
                              className="px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer transition-colors"
                              onClick={handleViewComplaints}
                            >
                              <div className="flex items-start gap-2 sm:gap-3">
                                {/* Avatar */}
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs sm:text-sm font-medium">
                                    {getInitials(notification.userEmail || 'User')}
                                  </span>
                                </div>
                                
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-1">
                                        {notification.userEmail || 'User'}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                        {notification.subject || 'Complaint'}
                                      </p>
                                    </div>
                                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 ml-2">
                                      {formatTimeAgo(notification.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">
                                    {notification.message}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        } else if (unified.type === 'vehicle_registration') {
                          const notification = unified.data as Notification;
                          return (
                            <div
                              key={unified.id}
                              className="px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer transition-colors"
                              onClick={handleViewVehicleRegistrations}
                            >
                              <div className="flex items-start gap-2 sm:gap-3">
                                {/* Avatar */}
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs sm:text-sm font-medium">🚗</span>
                                </div>
                                
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-1">
                                        Vehicle Registration
                                      </p>
                                    </div>
                                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 ml-2">
                                      {formatTimeAgo(notification.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">
                                    {notification.message}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        } else {
                          const notification = unified.data as Notification;
                          return (
                            <div
                              key={unified.id}
                              className="px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer transition-colors"
                              onClick={handleViewMaintenance}
                            >
                              <div className="flex items-start gap-2 sm:gap-3">
                                {/* Avatar */}
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs sm:text-sm font-medium">🔧</span>
                                </div>
                                
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs sm:text-sm font-medium text-gray-900 line-clamp-1">
                                        {notification.subject || 'Maintenance Request'}
                                      </p>
                                    </div>
                                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 ml-2">
                                      {formatTimeAgo(notification.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">
                                    {notification.message}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
          {/* Second Row: Search Bar */}
          {showSearchBar && (
            <div className="w-full flex items-center gap-2 relative">
              <div className="flex-1 relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery?.(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && handleSearch) {
                      handleSearch();
                    }
                  }}
                  onFocus={() => {
                    if (suggestions && suggestions.length > 0) {
                      // showSuggestions will be managed by parent
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSearching}
                />
                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-[200] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
                    style={{ pointerEvents: 'auto' }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {suggestions.map((suggestion, index) => (
                      <div
                        key={suggestion.place_id || index}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onSelectSuggestion) {
                            onSelectSuggestion(suggestion.place_id, suggestion.description);
                          }
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onSelectSuggestion) {
                            onSelectSuggestion(suggestion.place_id, suggestion.description);
                          }
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          if (onSelectSuggestion) {
                            onSelectSuggestion(suggestion.place_id, suggestion.description);
                          }
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 active:bg-gray-200 transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer select-none"
                      >
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 truncate">{suggestion.description}</p>
                            {suggestion.structured_formatting?.secondary_text && (
                              <p className="text-xs text-gray-500 truncate">{suggestion.structured_formatting.secondary_text}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0"
              >
                {isSearching ? (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;

