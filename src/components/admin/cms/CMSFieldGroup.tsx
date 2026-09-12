import React, { useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CMSFieldGroupProps {
  id?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const CMSFieldGroup: React.FC<CMSFieldGroupProps> = ({
  id,
  title,
  description,
  icon,
  badge,
  defaultExpanded = true,
  isExpanded: controlledExpanded,
  onToggle,
  children,
  className = ''
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(prev => !prev);
    }
  };

  const reactId = useId();
  const safeId = id || `fg-${reactId.replace(/:/g, '_')}`;
  const headerId = `${safeId}-header`;
  const contentId = `${safeId}-content`;

  return (
    <div id={id} className={`bg-[#121222] border border-white/10 rounded-3xl overflow-hidden transition-all duration-300 ${className}`}>
      <button
        type="button"
        id={headerId}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={handleToggle}
        className="w-full p-6 text-left flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {icon}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-tight">
                {title}
              </h3>
              {badge}
            </div>
            {description && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            {isExpanded ? 'Collapse' : 'Expand'}
          </span>
          <div className={`w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div 
          id={contentId} 
          role="region" 
          aria-labelledby={headerId} 
          className="p-6 pt-0 space-y-5 border-t border-white/5"
        >
          {children}
        </div>
      )}
    </div>
  );
};
