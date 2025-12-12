import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

interface HeaderProps {
  title: string;
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

function Header({ title }: HeaderProps) {
  const [notificationCount, setNotificationCount] = useState(0);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!db) return;

    // Set up real-time listener for pending applications
    // Notifications persist until the application is deleted from pendingUsers
    // (i.e., when approved or rejected). They will not disappear just from viewing.
    const q = query(collection(db, 'pendingUsers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const applications: PendingApplication[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Only include applications that still exist in pendingUsers
        // They will automatically disappear when approved/rejected (deleted from pendingUsers)
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
      // Update state - notifications persist until deleted from database
      setPendingApplications(applications);
      setNotificationCount(applications.length);
    }, (error) => {
      console.error('Error listening to pending applications:', error);
    });

    return () => unsubscribe();
  }, []);

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
    <header className="bg-white text-gray-900 py-4 border-b border-gray-200 sticky top-0 z-[100]">
      <div className="w-full m-0 px-8 flex justify-between items-center">
        <h1 className="text-xl m-0 text-gray-900 font-normal">{title}</h1>
        <div className="flex items-center gap-5">
          <div className="relative" ref={notificationRef}>
            <button 
              className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notificationCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-medium">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            
            {/* Notification dropdown - Facebook style */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-semibold text-gray-900">Notifications</h3>
                    {notificationCount > 0 && (
                      <span className="text-xs text-gray-500">{notificationCount} new</span>
                    )}
                  </div>
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                  {notificationCount === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500 font-medium">No notifications</p>
                      <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                    </div>
                  ) : (
                    <div>
                      {pendingApplications.map((application) => (
                        <div
                          key={application.id}
                          className="px-4 py-3 hover:bg-gray-50 border-b border-gray-100 cursor-pointer transition-colors"
                          onClick={handleViewApplications}
                        >
                          <div className="flex items-start gap-3">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-sm font-medium">
                                {getInitials(application.fullName)}
                              </span>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                    {application.fullName || 'New Resident'}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                    {application.email || application.phone || 'No contact info'}
                                  </p>
                                </div>
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                  {formatTimeAgo(application.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1.5">
                                New resident application submitted
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;

