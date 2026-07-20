import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, ArrowRight, Info, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  
  const token = searchParams.get('token');
  const email = location.state?.email || user?.email || 'your email';

  const [status, setStatus] = useState(token ? 'verifying' : 'onboarding'); // onboarding | verifying | success | error
  const [message, setMessage] = useState('');
  const hasVerified = useRef(false);

  // Effect to verify token if present in URL
  useEffect(() => {
    if (!token) return;
    if (hasVerified.current) return;
    hasVerified.current = true;

    setStatus('verifying');
    
    // Call backend endpoint to verify token
    client.get(`/auth/verify-email?token=${token}`)
      .then((response) => {
        setStatus('success');
        setMessage(response.data?.message || 'Email verified successfully!');
      })
      .catch((error) => {
        setStatus('error');
        setMessage(error.response?.data?.detail || 'Verification failed. The link may have expired or is invalid.');
      });
  }, [token]);

  return (
    <AuthLayout
      title={status === 'onboarding' ? 'Verify your email' : 'Account Verification'}
      subtitle={
        status === 'onboarding' 
          ? 'One more step before you can fully access your workspace' 
          : 'Status of your DataWeaver AI registration link'
      }
    >
      {/* Onboarding View: Tell user to check their email */}
      {status === 'onboarding' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Mail size={28} className="text-blue-600" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-[14px] text-slate-600 leading-relaxed">
              We&apos;ve sent a verification link to
            </p>
            <p className="text-[15px] font-bold text-slate-800">{email}</p>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Please check your inbox and click the link to verify your account.
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/50 border border-blue-100/60 rounded-xl text-blue-800 text-[13px]">
            <Info size={16} className="shrink-0 mt-0.5" />
            <span>
              Once verified, you will be able to log in to the DataWeaver platform. Check your server console to copy the link if email delivery is blocked.
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-700 transition-colors duration-200 shadow-sm shadow-blue-600/20"
          >
            Go to Login
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Verifying View: Loader Spinner */}
      {status === 'verifying' && (
        <div className="space-y-6 text-center py-6 animate-in fade-in duration-200">
          <div className="flex justify-center">
            <Loader2 size={36} className="text-blue-600 animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="text-[15px] font-bold text-slate-800">Verifying your email...</p>
            <p className="text-[13px] text-slate-400">Connecting with DataWeaver backend service</p>
          </div>
        </div>
      )}

      {/* Success View: Verified Checkmark */}
      {status === 'success' && (
        <div className="space-y-6 animate-in zoom-in-95 duration-200">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-[16px] font-extrabold text-slate-800">Verification Successful!</p>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              {message}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-700 transition-colors duration-200 shadow-sm shadow-blue-600/20"
          >
            Go to Login
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Error View: Invalid/expired token */}
      {status === 'error' && (
        <div className="space-y-6 animate-in zoom-in-95 duration-200">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
              <XCircle size={32} className="text-rose-600" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-[16px] font-extrabold text-rose-700">Verification Failed</p>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              {message}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/signup', { replace: true })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-700 transition-colors duration-200 shadow-sm"
          >
            Go to Signup
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
