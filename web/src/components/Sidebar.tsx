import { useState, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

const menuItems: MenuItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '▦' },
  { path: '/announcement', label: 'Announcement', icon: '◈' },
  { path: '/complaints', label: 'Complaints', icon: '⚠' },
  { path: '/visitor-pre-registration', label: 'Visitor Pre-Registration', icon: '○' },
  { path: '/resident-management', label: 'Resident Management', icon: '⬟' },
  { path: '/billing-payment', label: 'Billing & Payment', icon: '$' },
  { path: '/maintenance', label: 'Maintenance', icon: '⚙' },
  { path: '/archived', label: 'Archived', icon: '' },
];

function Sidebar() {
  const [residentManagementOpen, setResidentManagementOpen] = useState(false);
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

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-white border-r border-gray-200 z-[1000] overflow-hidden w-[260px] md:w-[220px]"
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
                    className={`flex items-center gap-3 px-4 py-2.5 mx-2 bg-transparent border-none rounded-md text-gray-700 cursor-pointer transition-all duration-200 text-sm text-left whitespace-nowrap w-auto relative ${
                      isActive
                        ? 'bg-gray-100 text-gray-900 font-medium'
                        : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <span className="font-normal text-sm flex-1">
                      {item.label}
                    </span>
                    <span className={`text-xs transition-transform ${residentManagementOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {residentManagementOpen && (
                    <div className="ml-4 mt-1 space-y-1">
                      <button
                        className={`flex items-center gap-3 px-4 py-2 w-full bg-transparent border-none rounded-md text-gray-700 cursor-pointer transition-all duration-200 text-sm text-left ${
                          location.pathname === '/resident-management/applications'
                            ? 'bg-gray-100 text-gray-900 font-medium'
                            : 'hover:bg-gray-50 text-gray-600'
                        }`}
                        onClick={() => {
                          handleNavigation('/resident-management/applications');
                          setResidentManagementOpen(false);
                        }}
                      >
                        <span className="text-xs">Applications</span>
                      </button>
                      <button
                        className={`flex items-center gap-3 px-4 py-2 w-full bg-transparent border-none rounded-md text-gray-700 cursor-pointer transition-all duration-200 text-sm text-left ${
                          location.pathname === '/resident-management/registered'
                            ? 'bg-gray-100 text-gray-900 font-medium'
                            : 'hover:bg-gray-50 text-gray-600'
                        }`}
                        onClick={() => {
                          handleNavigation('/resident-management/registered');
                          setResidentManagementOpen(false);
                        }}
                      >
                        <span className="text-xs">Registered</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button
                key={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 bg-transparent border-none rounded-md text-gray-700 cursor-pointer transition-all duration-200 text-sm text-left whitespace-nowrap w-auto relative ${
                  location.pathname === item.path
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'hover:bg-gray-50 text-gray-600'
                }`}
                onClick={() => handleNavigation(item.path)}
              >
                <span className="font-normal text-sm">
                  {item.label}
                </span>
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
  );
}

export default memo(Sidebar);

