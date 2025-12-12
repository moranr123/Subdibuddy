import { useState, useCallback, memo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

interface SidebarProps {
  onHoverChange?: (isExpanded: boolean) => void;
}

const menuItems: MenuItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '▦' },
  { path: '/announcement', label: 'Announcement', icon: '◈' },
  { path: '/complaints', label: 'Complaints', icon: '⚠' },
  { path: '/visitor-pre-registration', label: 'Visitor Pre-Registration', icon: '○' },
  { path: '/resident-management', label: 'Resident Management', icon: '⬟' },
  { path: '/billing-payment', label: 'Billing & Payment', icon: '$' },
  { path: '/maintenance', label: 'Maintenance', icon: '⚙' },
];

function Sidebar({ onHoverChange }: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (onHoverChange) {
      onHoverChange(isHovered);
    }
  }, [isHovered, onHoverChange]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

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
      className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 ease-in-out z-[1000] overflow-hidden ${
        isHovered ? 'w-[260px] md:w-[220px]' : 'w-[64px] md:w-[56px]'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex flex-col h-full">
        <div className={`px-4 py-4 flex items-center gap-3 min-h-[64px] border-b border-gray-100 ${
          !isHovered ? 'justify-center' : ''
        }`}>
          {!isHovered ? (
            <img 
              src="/logo.png" 
              alt="Subsibuddy Logo" 
              className="w-8 h-8 object-contain"
            />
          ) : (
            <>
              <img 
                src="/logo.png" 
                alt="Subsibuddy Logo" 
                className="w-8 h-8 object-contain"
              />
              <h2 className="text-gray-900 text-base font-medium m-0 whitespace-nowrap animate-fadeIn">
                Subsibuddy
              </h2>
            </>
          )}
        </div>
        
        <nav className="flex-1 flex flex-col py-2 overflow-y-auto min-h-0">
          {menuItems.map((item) => (
            <button
              key={item.path}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 bg-transparent border-none rounded-md text-gray-700 cursor-pointer transition-all duration-200 text-sm text-left whitespace-nowrap w-auto relative ${
                location.pathname === item.path
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'hover:bg-gray-50 text-gray-600'
              }`}
              onClick={() => handleNavigation(item.path)}
              title={!isHovered ? item.label : undefined}
            >
              <span className="text-base min-w-[20px] flex items-center justify-center font-normal leading-none">{item.icon}</span>
              {isHovered && (
                <span className="font-normal animate-fadeIn text-sm">
                  {item.label}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-gray-100">
          <button
            className="flex items-center gap-3 px-4 py-2.5 mx-2 bg-transparent border-none rounded-md text-gray-600 cursor-pointer transition-all duration-200 text-sm text-left whitespace-nowrap w-auto hover:bg-gray-50"
            onClick={handleSignOut}
            title={!isHovered ? 'Sign Out' : undefined}
          >
            <span className="text-base min-w-[20px] flex items-center justify-center leading-none">→</span>
            {isHovered && (
              <span className="font-normal animate-fadeIn text-sm">
                Sign Out
              </span>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

