import { useState, useCallback } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

function CreateSuperAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Add user role to Firestore
      // Note: This is NOT a resident - superadmin accounts should not appear in resident lists
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        role: 'superadmin',
        createdAt: new Date().toISOString(),
        isActive: true
        // Intentionally NOT including resident fields like: fullName, location, etc.
      });

      setSuccess(true);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      
      console.log('Superadmin created successfully!');
      console.log('Email:', email);
      console.log('UID:', user.uid);
    } catch (err: any) {
      let errorMessage = 'An error occurred while creating the superadmin account';
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [email, password, confirmPassword]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 p-5 w-full box-border">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-full max-w-[400px] p-8 flex flex-col items-center m-auto box-border">
        <img 
          src="/logo.png" 
          alt="Subdibuddy Logo" 
          className="w-24 h-24 object-contain mb-6"
        />
        <h1 className="text-2xl text-gray-900 font-normal mb-2">Create Admin Account</h1>
        <p className="text-gray-500 text-sm text-center mb-8">Create a new superadmin account</p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full max-w-full box-border">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-md border border-red-200 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-100 text-green-800 px-3 py-3 rounded border border-green-300 mb-4">
              ✓ Superadmin account created successfully!
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-gray-700 text-sm font-normal">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@subdibuddy.com"
              disabled={loading}
              className="p-3 border border-gray-300 rounded-md text-sm bg-white text-gray-900 transition-colors focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-gray-700 text-sm font-normal">
              Password
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter password (min 6 characters)"
                disabled={loading}
                className="w-full pr-10 p-3 border border-gray-300 rounded-md text-sm bg-white text-gray-900 transition-colors focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                className="absolute right-2 bg-transparent border-none cursor-pointer text-sm p-1.5 flex items-center justify-center text-gray-500 transition-colors hover:text-gray-900"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirmPassword" className="text-gray-700 text-sm font-normal">
              Confirm Password
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? "text" : "password"}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm password"
                disabled={loading}
                className="w-full pr-10 p-3 border border-gray-300 rounded-md text-sm bg-white text-gray-900 transition-colors focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="bg-gray-900 text-white p-3 border-none rounded-md text-sm font-normal cursor-pointer transition-all mt-2 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Creating account...</span>
              </span>
            ) : (
              'Create Superadmin'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CreateSuperAdmin;


