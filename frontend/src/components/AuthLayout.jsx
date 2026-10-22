import React from 'react';
import BrandLogo from './BrandLogo';

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen bg-[#F7F5EE] flex">
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 bg-gradient-to-br from-[#1C4430] via-[#24543D] to-[#163826] relative overflow-hidden text-[#F7F5EE]">
        {/* Subtle topographic contour overlay */}
        <div className="absolute inset-0 opacity-15 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M-100 200 C 150 100, 300 400, 600 250 S 900 350, 1000 200" fill="none" stroke="#C7D86B" strokeWidth="1" />
            <path d="M-100 280 C 150 180, 300 480, 600 330 S 900 430, 1000 280" fill="none" stroke="#F7F5EE" strokeWidth="1" />
            <path d="M-100 360 C 150 260, 300 560, 600 410 S 900 510, 1000 360" fill="none" stroke="#C7D86B" strokeWidth="0.8" />
            <path d="M-100 440 C 150 340, 300 640, 600 490 S 900 590, 1000 440" fill="none" stroke="#F7F5EE" strokeWidth="1" />
            <path d="M-100 520 C 150 420, 300 720, 600 570 S 900 670, 1000 520" fill="none" stroke="#C7D86B" strokeWidth="0.8" />
            <circle cx="650" cy="220" r="140" fill="none" stroke="#C7D86B" strokeWidth="0.5" strokeDasharray="4 4" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 text-[#F7F5EE]">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-11 h-11 rounded-xl bg-[#24543D] border border-[#C7D86B]/40 flex items-center justify-center shadow-md shadow-black/20">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F7F5EE"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <path d="M9 12h6" />
                  <circle cx="12" cy="12" r="2" fill="#C7D86B" />
                </svg>
              </div>
              <div>
                <h1 className="font-serif font-bold text-[22px] tracking-tight leading-none text-[#F7F5EE]">
                  DataWeaver AI
                </h1>
                <p className="text-[10px] font-bold text-[#C7D86B] tracking-wider mt-1 uppercase">
                  Scientific Research Atlas
                </p>
              </div>
            </div>

            <h2 className="font-serif text-[32px] xl:text-[36px] font-bold leading-tight tracking-tight text-[#F7F5EE]">
              Intelligent dataset engineering for research teams
            </h2>
            <p className="text-[#E7EAE4]/80 text-[15px] mt-4 leading-relaxed max-w-md">
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
                <div className="w-5 h-5 rounded-full bg-[#C7D86B]/20 border border-[#C7D86B]/50 flex items-center justify-center shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C7D86B" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <span className="text-[14px] font-medium text-[#F7F5EE]">{feature}</span>
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

          <div className="bg-white rounded-2xl border border-[#D5DCD1] shadow-[0_4px_24px_rgba(32,41,35,0.06)] p-8">
            <div className="mb-7">
              <h2 className="font-serif text-[24px] font-bold text-[#202923] tracking-tight">{title}</h2>
              {subtitle && (
                <p className="text-[14px] text-[#69746A] font-medium mt-1.5">{subtitle}</p>
              )}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
