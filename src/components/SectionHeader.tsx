import * as React from "react";

interface SectionHeaderProps {
  title: string;
  icon: React.ReactNode;
  isExpandable?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  rightElement?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  isExpandable = false,
  isExpanded = false,
  onToggle,
  rightElement,
}) => {
  return (
    <div 
      className="config-header" 
      onClick={isExpandable ? onToggle : undefined} 
      style={{ cursor: isExpandable ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
        <h3 style={{ margin: 0 }}>
          {icon}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        </h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {rightElement}
        {isExpandable && (
          <svg 
            width="10" 
            height="10" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            style={{ 
              transform: isExpanded ? 'rotate(180deg)' : 'none', 
              transition: 'transform 0.2s', 
              opacity: 0.5 
            }}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        )}
      </div>
    </div>
  );
};
