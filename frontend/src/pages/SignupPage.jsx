import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { useAuth } from '../context/AuthContext';
import { getAuthErrorMessage } from '../api/authApi';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup, redirectToGoogle, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [googleNotice, setGoogleNotice] = useState('');

  // Live Validation States
  const [emailError, setEmailError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  
  const [passwordCriteria, setPasswordCriteria] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });

  const validateEmail = (value) => {
    if (!value) {
      setEmailError('Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    if (emailTouched) {
      validateEmail(val);
    }
  };

  const handleEmailBlur = () => {
    setEmailTouched(true);
    validateEmail(email);
  };

  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    setPasswordCriteria({
      length: val.length >= 8,
      uppercase: /[A-Z]/.test(val),
      lowercase: /[a-z]/.test(val),
      number: /[0-9]/.test(val),
      special: /[^A-Za-z0-9]/.test(val),
    });
  };

  const metCount = Object.values(passwordCriteria).filter(Boolean).length;
  const passwordsMatch = password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setGoogleNotice('');

    if (!validateEmail(email)) {
      setError('Please provide a valid email address.');
      return;
    }

    if (metCount < 5) {
      setError('Password must meet all strength criteria.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    try {
      await signup({ email, password, full_name: fullName });
      navigate('/verify-email', { replace: true, state: { email } });
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  };

  const handleGoogleSignIn = () => {
    redirectToGoogle();
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start building intelligent datasets for your research"
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
          <label htmlFor="fullName" className="block text-[13px] font-semibold text-slate-700 mb-1.5">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dr. Jane Doe"
            required
            autoComplete="name"
            className="w-full px-4 py-2.5 text-[14px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-400"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-[13px] font-semibold text-slate-700 mb-1.5 flex justify-between items-center">
            <span>Email address</span>
            {emailTouched && !emailError && email && (
              <span className="text-[11px] font-semibold text-emerald-600 transition-opacity duration-300">Valid email</span>
            )}
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            placeholder="you@research.edu"
            required
            autoComplete="email"
            className={`w-full px-4 py-2.5 text-[14px] bg-slate-50 border rounded-xl focus:outline-none transition-all placeholder:text-slate-400 ${
              emailTouched && emailError
                ? 'border-rose-300 focus:border-rose-400 focus:bg-white bg-rose-50/10'
                : emailTouched && !emailError && email
                ? 'border-emerald-300 focus:border-emerald-400 focus:bg-white bg-emerald-50/10'
                : 'border-slate-200 focus:border-blue-400 focus:bg-white'
            }`}
          />
          {emailTouched && emailError && (
            <p className="mt-1.5 text-[12px] text-rose-600 font-medium flex items-center gap-1">
              <AlertCircle size={13} className="shrink-0" />
              {emailError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-[13px] font-semibold text-slate-700 mb-1.5 flex justify-between items-center">
            <span>Password</span>
            {passwordTouched && password && (
              <span className={`text-[11px] font-bold ${
                metCount <= 2 ? 'text-rose-500' : metCount === 3 ? 'text-amber-500' : 'text-emerald-500'
              }`}>
                {metCount <= 1 ? 'Very Weak' : metCount === 2 ? 'Weak' : metCount === 3 ? 'Fair' : metCount === 4 ? 'Good' : 'Strong'}
              </span>
            )}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={handlePasswordChange}
              onFocus={() => setPasswordTouched(true)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
              className={`w-full px-4 py-2.5 pr-11 text-[14px] bg-slate-50 border rounded-xl focus:outline-none transition-all placeholder:text-slate-400 ${
                passwordTouched && password
                  ? metCount < 3
                    ? 'border-rose-300 focus:border-rose-400 focus:bg-white bg-rose-50/10'
                    : metCount >= 4
                    ? 'border-emerald-300 focus:border-emerald-400 focus:bg-white bg-emerald-50/10'
                    : 'border-slate-200 focus:border-blue-400 focus:bg-white'
                  : 'border-slate-200 focus:border-blue-400 focus:bg-white'
              }`}
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

          {passwordTouched && password && (
            <div className="mt-3 p-3.5 bg-slate-50/50 border border-slate-100 rounded-xl space-y-2.5 transition-all duration-300">
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((level) => {
                  let barColor = 'bg-slate-200';
                  if (level <= metCount) {
                    if (metCount <= 2) barColor = 'bg-rose-500';
                    else if (metCount === 3) barColor = 'bg-amber-500';
                    else barColor = 'bg-emerald-500';
                  }
                  return (
                    <div key={level} className={`h-1.5 rounded-full transition-all duration-300 ${barColor}`} />
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 pt-1.5 border-t border-slate-100/70">
                <CriteriaItem met={passwordCriteria.length} text="8+ characters" />
                <CriteriaItem met={passwordCriteria.uppercase} text="Uppercase letter" />
                <CriteriaItem met={passwordCriteria.lowercase} text="Lowercase letter" />
                <CriteriaItem met={passwordCriteria.number} text="Number (0-9)" />
                <CriteriaItem met={passwordCriteria.special} text="Special character" />
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-[13px] font-semibold text-slate-700 mb-1.5 flex justify-between items-center">
            <span>Confirm password</span>
            {confirmPasswordTouched && confirmPassword && (
              <span className={`text-[11px] font-semibold ${passwordsMatch ? 'text-emerald-600' : 'text-rose-500'}`}>
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </span>
            )}
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setConfirmPasswordTouched(true)}
            placeholder="Re-enter your password"
            required
            autoComplete="new-password"
            className={`w-full px-4 py-2.5 text-[14px] bg-slate-50 border rounded-xl focus:outline-none transition-all placeholder:text-slate-400 ${
              confirmPasswordTouched && confirmPassword
                ? passwordsMatch
                  ? 'border-emerald-300 focus:border-emerald-400 focus:bg-white bg-emerald-50/10'
                  : 'border-rose-300 focus:border-rose-400 focus:bg-white bg-rose-50/10'
                : 'border-slate-200 focus:border-blue-400 focus:bg-white'
            }`}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-700 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Creating account...
            </>
          ) : (
            'Create account'
          )}
        </button>

        <div className="relative flex items-center py-1">
          <div className="flex-1 border-t border-slate-100" />
          <span className="px-3 text-[12px] font-medium text-slate-400 uppercase tracking-wider">
            or
          </span>
          <div className="flex-1 border-t border-slate-100" />
        </div>

        <GoogleSignInButton onClick={handleGoogleSignIn} disabled={loading} label="Sign up with Google" />

        <p className="text-center text-[14px] text-slate-500 pt-1">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function CriteriaItem({ met, text }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium transition-colors">
      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300 ${
        met 
          ? 'bg-emerald-500 border-emerald-500 text-white' 
          : 'border-slate-300 text-slate-300 bg-white'
      }`}>
        <svg className="w-2 h-2 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className={met ? 'text-slate-700' : 'text-slate-400'}>{text}</span>
    </div>
  );
}
