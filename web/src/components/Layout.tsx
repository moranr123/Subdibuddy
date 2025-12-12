import { ReactNode, memo } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-white w-full">
      <Sidebar />
      <main className="flex-1 min-h-screen ml-[260px] md:ml-[220px] w-[calc(100%-260px)] md:w-[calc(100%-220px)]">
        {children}
      </main>
    </div>
  );
}

export default memo(Layout);

