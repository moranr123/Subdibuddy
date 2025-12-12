import { useEffect, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import Layout from '../components/Layout';

function Maintenance() {
  const [user, setUser] = useState<any>(null);
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


  return (
    <Layout>
      <div className="min-h-screen bg-white w-full">
        <header className="bg-white text-gray-900 py-4 border-b border-gray-200 sticky top-0 z-[100]">
          <div className="w-full m-0 px-8 flex justify-between items-center">
            <h1 className="text-xl m-0 text-gray-900 font-normal">Maintenance</h1>
            <div className="flex items-center gap-5">
              <span className="text-sm text-gray-500 font-normal">{user?.email || ''}</span>
            </div>
          </div>
        </header>

        <main className="w-full max-w-full m-0 p-10 box-border">
          <div className="flex flex-col gap-6 w-full max-w-full">
            <div className="bg-white rounded-xl p-8 border border-gray-100 shadow-sm">
              <h2 className="text-gray-900 mb-4 font-normal text-2xl tracking-tight">Maintenance Management</h2>
              <p className="text-gray-600 leading-relaxed mb-3 text-base">
                Manage maintenance requests and schedules.
              </p>
              <p className="text-gray-400 italic mt-5">This feature is coming soon.</p>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}

export default memo(Maintenance);

