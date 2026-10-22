import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import * as authApi from '../api/authApi';
import { getAuthErrorMessage } from '../api/authApi';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('This reset link is missing a token. Please request a new one.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, new_password: newPassword });
      setSuccess(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a new password for your account"
    >
      {success ? (
        <div className="space-y-6 text-center animate-in zoom-in-95 duration-200">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[16px] font-extrabold text-slate-800">Password reset successfully</p>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              You can now log in with your new password.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="w-full px-4 py-2.5 bg-[#24543D] text-[#F7F5EE] rounded-xl text-[14px] font-semibold hover:bg-[#1C4430] transition-colors duration-200 shadow-sm shadow-[#24543D]/20 cursor-pointer"
          >
            Go to login
          </button>
        </div>
      ) : !token ? (
        <div className="space-y-6 text-center animate-in zoom-in-95 duration-200">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
              <XCircle size={32} className="text-rose-600" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[16px] font-extrabold text-rose-700">Invalid reset link</p>
            <p className="text-[13px] text-[#69746A] leading-relaxed">
              This link is missing or malformed. Please request a new one.
            </p>
          </div>
          <Link
            to="/forgot-password"
            className="block w-full px-4 py-2.5 bg-[#24543D] text-[#F7F5EE] rounded-xl text-[14px] font-semibold hover:bg-[#1C4430] transition-colors duration-200 text-center shadow-sm shadow-[#24543D]/20 cursor-pointer"
          >
            Request new link
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
            <label htmlFor="newPassword" className="block text-[13px] font-semibold text-[#202923] mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 pr-11 text-[14px] bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl focus:outline-none focus:border-[#24543D] focus:bg-white transition-all placeholder:text-[#69746A] text-[#202923]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#69746A] hover:text-[#202923] transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-[13px] font-semibold text-[#202923] mb-1.5">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
              autoComplete="new-password"
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
                Resetting...
              </>
            ) : (
              'Reset password'
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}