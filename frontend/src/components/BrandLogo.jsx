import React from 'react';

export default function BrandLogo({ size = 'md' }) {
  const isLarge = size === 'lg';

  return (
    <div className={`flex items-center gap-3 ${isLarge ? 'justify-center' : ''}`}>
      <div
        className={`rounded-lg bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/10 ${
          isLarge ? 'w-11 h-11' : 'w-9 h-9'
        }`}
      >
        <svg
          width={isLarge ? 24 : 20}
          height={isLarge ? 24 : 20}
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
      <div className={isLarge ? 'text-center' : ''}>
        <h1
          className={`font-extrabold text-slate-800 tracking-tight leading-none ${
            isLarge ? 'text-[22px]' : 'text-[17px]'
          }`}
        >
          DataWeaver <span className="text-blue-600">AI</span>
        </h1>
        <p className="text-[10px] font-bold text-slate-400 tracking-wider mt-1 uppercase">
          Enterprise ML Platform
        </p>
      </div>
    </div>
  );
}
