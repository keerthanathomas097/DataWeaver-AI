import React from 'react';
import BrandLogo from './BrandLogo';

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-300 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 text-white">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-11 h-11 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <path d="M9 12h6" />
                  <circle cx="12" cy="12" r="2" fill="white" />
                </svg>
              </div>
              <div>
                <h1 className="font-extrabold text-[22px] tracking-tight leading-none">
                  DataWeaver AI
                </h1>
                <p className="text-[11px] font-semibold text-blue-100 tracking-wider mt-1 uppercase">
                  Enterprise ML Platform
                </p>
              </div>
            </div>

            <h2 className="text-[32px] xl:text-[36px] font-extrabold leading-tight tracking-tight">
              Intelligent dataset engineering for research teams
            </h2>
            <p className="text-blue-100 text-[15px] mt-4 leading-relaxed max-w-md">
              Discover, profile, clean, and merge image datasets — all organized within
              workspace-centered projects built for machine learning research.
            </p>
          </div>

          <div className="space-y-4">
            {[
              'Workspace-centered dataset management',
              'AI-assisted compatibility analysis',
              'Human-in-the-loop research decisions',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <span className="text-[14px] font-medium text-blue-50">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-8 flex justify-center">
            <BrandLogo size="lg" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_24px_rgba(15,23,42,0.06)] p-8">
            <div className="mb-7">
              <h2 className="text-[22px] font-extrabold text-slate-900 tracking-tight">{title}</h2>
              {subtitle && (
                <p className="text-[14px] text-slate-500 font-medium mt-1.5">{subtitle}</p>
              )}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
