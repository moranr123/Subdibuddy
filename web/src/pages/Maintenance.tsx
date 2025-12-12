import { useEffect, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { isSuperadmin } from '../utils/auth';
import Layout from '../components/Layout';
import Header from '../components/Header';

function Maintenance() {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check if user is a superadmin
        const isAdmin = await isSuperadmin(currentUser);
        if (isAdmin) {
          setUser(currentUser);
        } else {
          // User is not a superadmin, sign them out and redirect
          await auth.signOut();
          navigate('/');
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);


  return (
    <Layout>
      <div className="min-h-screen bg-white w-full">
        <Header title="Maintenance" />

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

