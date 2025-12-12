import { ReactNode, useState, memo } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  return (
    <div className="flex min-h-screen bg-white w-full">
      <Sidebar onHoverChange={setIsSidebarExpanded} />
      <main className={`flex-1 min-h-screen transition-all duration-300 ease-in-out ${
        isSidebarExpanded ? 'ml-[260px] w-[calc(100%-260px)]' : 'ml-[64px] w-[calc(100%-64px)]'
      }`}>
        {children}
      </main>
    </div>
  );
}

export default memo(Layout);

