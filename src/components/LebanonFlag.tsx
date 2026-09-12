import React from 'react';

export const LebanonFlag: React.FC<{ className?: string }> = ({ className = "w-5 h-3.5" }) => (
  <svg 
    viewBox="0 0 60 40" 
    className={`inline-block rounded-xs shadow-xs shrink-0 overflow-hidden border border-slate-200/60 ${className}`}
    aria-label="Lebanese Flag"
  >
    {/* Top Red Stripe */}
    <rect width="60" height="10" fill="#ED1C24" />
    {/* Middle White Stripe */}
    <rect y="10" width="60" height="20" fill="#FFFFFF" />
    {/* Bottom Red Stripe */}
    <rect y="30" width="60" height="10" fill="#ED1C24" />
    {/* Green Cedar Tree of Lebanon */}
    <path 
      d="M30 10.2 L33.2 15 L31.5 15 L35.2 20.2 L33.2 20.2 L37.5 25.2 L34.5 25.2 L39.2 29.8 L31.6 29.8 L31.6 30 L28.4 30 L28.4 29.8 L20.8 29.8 L25.5 25.2 L22.5 25.2 L26.8 20.2 L24.8 20.2 L28.5 15 L26.8 15 Z" 
      fill="#007A3D" 
    />
  </svg>
);
