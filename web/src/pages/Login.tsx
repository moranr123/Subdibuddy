import { useState, useCallback, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase/config'

const ErrorMessage = memo(({ error }: { error: string }) => {
  if (!error) return null;
  return (
    <div className="bg-red-50 text-red-700 px-3 py-2 rounded-md border border-red-200 text-sm">
      {error}
    </div>
  );
});
ErrorMessage.displayName = 'ErrorMessage';

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/dashboard')
    } catch (err: any) {
      let errorMessage = 'An error occurred during login';
      if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (err.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [email, password, navigate])

  const buttonText = useMemo(() => loading ? 'Signing in...' : 'Sign In', [loading])

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50 p-5 w-full box-border">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-full max-w-[400px] p-8 flex flex-col items-center m-auto box-border">
        <img 
          src="/logo.png" 
          alt="Subsibuddy Logo" 
          className="w-24 h-24 object-contain mb-6"
        />
        <h1 className="text-2xl text-gray-900 font-normal mb-2">Welcome back</h1>
        <p className="text-gray-500 text-sm text-center mb-8">Sign in to continue</p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-full box-border">
          <ErrorMessage error={error} />
          
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-gray-700 text-sm font-normal">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={handleEmailChange}
              required
              placeholder="admin@subsibuddy.com"
              className="p-3 border border-gray-300 rounded-md text-sm bg-white text-gray-900 transition-colors focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-gray-700 text-sm font-normal">
              Password
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={handlePasswordChange}
                required
                placeholder="Enter your password"
                className="w-full pr-10 p-3 border border-gray-300 rounded-md text-sm bg-white text-gray-900 transition-colors focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 placeholder:text-gray-400"
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

          <button 
            type="submit" 
            disabled={loading} 
            className="bg-gray-900 text-white p-3 border-none rounded-md text-sm font-normal cursor-pointer transition-all mt-2 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Signing in...</span>
              </span>
            ) : (
              buttonText
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default memo(Login)

