import React from 'react';

export default function BrandLogo({ size = 'md' }) {
  const isLarge = size === 'lg';

  return (
    <div className={`flex items-center gap-3 ${isLarge ? 'justify-center' : ''}`}>
      <div
        className={`rounded-xl bg-[#24543D] border border-[#C7D86B]/30 flex items-center justify-center shadow-sm shadow-[#24543D]/20 ${
          isLarge ? 'w-11 h-11' : 'w-9 h-9'
        }`}
      >
        <svg
          width={isLarge ? 24 : 20}
          height={isLarge ? 24 : 20}
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
      <div className={isLarge ? 'text-center' : ''}>
        <h1
          className={`font-serif font-bold text-[#202923] tracking-tight leading-none ${
            isLarge ? 'text-[22px]' : 'text-[17px]'
          }`}
        >
          DataWeaver <span className="text-[#24543D] font-sans font-bold text-[13px] px-1.5 py-0.5 rounded-md bg-[#24543D]/10 border border-[#24543D]/20 align-middle ml-1">AI</span>
        </h1>
        <p className="text-[10px] font-bold text-[#69746A] tracking-wider mt-1 uppercase">
          Scientific Research Workspace
        </p>
      </div>
    </div>
  );
}
