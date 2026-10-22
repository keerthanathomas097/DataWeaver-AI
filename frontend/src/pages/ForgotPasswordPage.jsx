import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import * as authApi from '../api/authApi';
import { getAuthErrorMessage } from '../api/authApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setSubmitted(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
    >
      {submitted ? (
        <div className="space-y-6 text-center animate-in fade-in duration-200">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[15px] font-bold text-slate-800">Check your email</p>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              If an account with that email exists, a reset link has been sent.
            </p>
          </div>
          <Link
            to="/login"
            className="block w-full px-4 py-2.5 bg-[#24543D] text-[#F7F5EE] rounded-xl text-[14px] font-semibold hover:bg-[#1C4430] transition-colors duration-200 text-center shadow-sm shadow-[#24543D]/20 cursor-pointer"
          >
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[13px]">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-[13px] font-semibold text-[#202923] mb-1.5">
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
              className="w-full px-4 py-2.5 text-[14px] bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl focus:outline-none focus:border-[#24543D] focus:bg-white transition-all placeholder:text-[#69746A] text-[#202923]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#24543D] text-[#F7F5EE] rounded-xl text-[14px] font-semibold hover:bg-[#1C4430] transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-[#24543D]/20 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Sending...
              </>
            ) : (
              'Send reset link'
            )}
          </button>

          <p className="text-center text-[14px] text-[#69746A] pt-1">
            Remembered your password?{' '}
            <Link to="/login" className="font-semibold text-[#24543D] hover:text-[#1C4430] transition-colors">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}