import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

function RestoreSuperAdmin() {
  const [user, setUser] = useState<any>(null);
  const [superadminData, setSuperadminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState<'checking' | 'not-found' | 'inactive' | 'active'>('checking');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await checkSuperadminStatus(currentUser);
      } else {
        setUser(null);
        setLoading(false);
        setStatus('not-found');
      }
    });

    return () => unsubscribe();
  }, []);

  const checkSuperadminStatus = useCallback(async (currentUser: any) => {
    if (!db || !currentUser) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const superadminRef = doc(db, 'superadmins', currentUser.uid);
      const superadminDoc = await getDoc(superadminRef);

      if (!superadminDoc.exists()) {
        setStatus('not-found');
        setSuperadminData(null);
      } else {
        const data = superadminDoc.data();
        setSuperadminData(data);
        
        if (data.isActive === true && data.role === 'superadmin') {
          setStatus('active');
        } else {
          setStatus('inactive');
        }
      }
    } catch (err: any) {
      console.error('Error checking superadmin status:', err);
      setError(`Error checking status: ${err.message}`);
      setStatus('not-found');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestore = useCallback(async () => {
    if (!user || !db) {
      setError('User not found');
      return;
    }

    setRestoring(true);
    setError('');
    setSuccess('');

    try {
      const superadminRef = doc(db, 'superadmins', user.uid);
      const superadminDoc = await getDoc(superadminRef);

      if (!superadminDoc.exists()) {
        // Create new superadmin document
        await setDoc(superadminRef, {
          email: user.email,
          role: 'superadmin',
          isActive: true,
          createdAt: new Date().toISOString(),
          restoredAt: new Date().toISOString(),
        });
        setSuccess('Superadmin account created successfully! You can now log in.');
      } else {
        // Update existing document
        await updateDoc(superadminRef, {
          role: 'superadmin',
          isActive: true,
          restoredAt: new Date().toISOString(),
        });
        setSuccess('Superadmin account restored successfully! You can now log in.');
      }

      // Refresh status
      await checkSuperadminStatus(user);
    } catch (err: any) {
      console.error('Error restoring superadmin:', err);
      setError(`Failed to restore superadmin: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  }, [user, checkSuperadminStatus]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Checking superadmin status...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 p-5">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-full max-w-[500px] p-8">
          <h1 className="text-2xl text-gray-900 font-normal mb-4">Restore Superadmin Access</h1>
          <p className="text-gray-600 mb-4">You need to be logged in to restore superadmin access.</p>
          <a
            href="/"
            className="inline-block bg-gray-900 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 p-5">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-full max-w-[600px] p-8">
        <div className="mb-6">
          <h1 className="text-2xl text-gray-900 font-normal mb-2">Superadmin Status</h1>
          <p className="text-gray-600 text-sm">Diagnostic and restoration tool for superadmin access</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md border border-red-200 text-sm mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-700 px-4 py-3 rounded-md border border-green-200 text-sm mb-4">
            {success}
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">User Email</label>
            <p className="text-gray-900 font-medium">{user.email || 'N/A'}</p>
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">User UID</label>
            <p className="text-gray-900 font-mono text-sm break-all">{user.uid}</p>
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
            <div className="mt-1">
              {status === 'checking' && (
                <span className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-800">Checking...</span>
              )}
              {status === 'active' && (
                <span className="px-3 py-1 rounded text-sm font-medium bg-green-100 text-green-800">
                  ✓ Active Superadmin
                </span>
              )}
              {status === 'inactive' && (
                <span className="px-3 py-1 rounded text-sm font-medium bg-yellow-100 text-yellow-800">
                  ⚠ Inactive Superadmin
                </span>
              )}
              {status === 'not-found' && (
                <span className="px-3 py-1 rounded text-sm font-medium bg-red-100 text-red-800">
                  ✗ Not Found
                </span>
              )}
            </div>
          </div>

          {superadminData && (
            <div className="bg-gray-50 rounded-md p-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Superadmin Document Data:</h3>
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-gray-600">Role:</span>{' '}
                  <span className="font-mono text-gray-900">{superadminData.role || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Is Active:</span>{' '}
                  <span className="font-mono text-gray-900">
                    {superadminData.isActive === true ? 'true' : 'false'}
                  </span>
                </div>
                {superadminData.email && (
                  <div>
                    <span className="text-gray-600">Email:</span>{' '}
                    <span className="font-mono text-gray-900">{superadminData.email}</span>
                  </div>
                )}
                {superadminData.createdAt && (
                  <div>
                    <span className="text-gray-600">Created At:</span>{' '}
                    <span className="font-mono text-gray-900 text-xs">
                      {new Date(superadminData.createdAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {(status === 'not-found' || status === 'inactive') && (
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Restore Access</h3>
            <p className="text-gray-600 text-sm mb-4">
              {status === 'not-found'
                ? 'No superadmin document found. Click below to create one.'
                : 'Your superadmin account is inactive. Click below to restore it.'}
            </p>
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="w-full bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restoring ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Restoring...
                </span>
              ) : (
                'Restore Superadmin Access'
              )}
            </button>
          </div>
        )}

        {status === 'active' && (
          <div className="border-t border-gray-200 pt-6">
            <p className="text-green-700 text-sm mb-4">
              ✓ Your superadmin account is active. You should be able to access all admin features.
            </p>
            <a
              href="/dashboard"
              className="inline-block bg-gray-900 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-800 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Troubleshooting</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
            <li>Make sure you're logged in with the correct account</li>
            <li>Check that the document exists in Firestore: <code className="bg-gray-100 px-1 rounded">superadmins/{user.uid}</code></li>
            <li>Verify that <code className="bg-gray-100 px-1 rounded">role</code> is set to <code className="bg-gray-100 px-1 rounded">"superadmin"</code></li>
            <li>Verify that <code className="bg-gray-100 px-1 rounded">isActive</code> is set to <code className="bg-gray-100 px-1 rounded">true</code></li>
            <li>If issues persist, try logging out and logging back in</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default RestoreSuperAdmin;
