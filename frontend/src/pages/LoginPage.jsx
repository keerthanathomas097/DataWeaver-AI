import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { useAuth } from '../context/AuthContext';
import { getAuthErrorMessage } from '../api/authApi';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, redirectToGoogle, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [googleNotice, setGoogleNotice] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setGoogleNotice('');

    try {
     await login({ email, password });
     navigate("/", { replace: true });
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  };

  const handleGoogleSignIn = () => {
    redirectToGoogle();
};

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your research workspace"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-[13px]">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {googleNotice && (
          <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-[13px]">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{googleNotice}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-[13px] font-semibold text-slate-700 mb-1.5">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@research.edu"
            required
            autoComplete="email"
            className="w-full px-4 py-2.5 text-[14px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-[13px] font-semibold text-slate-700">
              Password
            </label>
            <button
              type="button"
              className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="w-full px-4 py-2.5 pr-11 text-[14px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-700 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>

        <div className="relative flex items-center py-1">
          <div className="flex-1 border-t border-slate-100" />
          <span className="px-3 text-[12px] font-medium text-slate-400 uppercase tracking-wider">
            or
          </span>
          <div className="flex-1 border-t border-slate-100" />
        </div>

        <GoogleSignInButton onClick={handleGoogleSignIn} disabled={loading} />

        <p className="text-center text-[14px] text-slate-500 pt-1">
          Don&apos;t have an account?{' '}
          <Link
            to="/signup"
            className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            Create account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
