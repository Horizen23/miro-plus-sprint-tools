import * as React from "react";

interface ListItemProps {
  title: string;
  subtitle?: string;
  checked?: boolean;
  onCheck?: () => void;
  onClick?: () => void;
  showCheckbox?: boolean;
  showBullet?: boolean;
  className?: string;
  rightElement?: React.ReactNode;
  style?: React.CSSProperties;
}

export const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  checked = false,
  onCheck,
  onClick,
  showCheckbox = false,
  showBullet = false,
  className = "",
  rightElement,
  style,
}) => {
  return (
    <div 
      className={`card-title-item ${className}`} 
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', ...style }}
    >
      <div className="title-left" style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
        {showCheckbox && (
          <input 
            type="checkbox" 
            checked={checked} 
            onChange={onCheck} 
            onClick={e => e.stopPropagation()} 
            style={{ accentColor: '#4262ff', marginRight: '8px', cursor: 'pointer' }}
          />
        )}
        {showBullet && <span className="bullet" style={{ marginRight: '8px' }}></span>}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div className={`title-text ${checked ? 'checked' : ''}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '11px' }}>
            {title}
          </div>
          {subtitle && <div className="hint-text" style={{ margin: 0, fontSize: '9px' }}>{subtitle}</div>}
        </div>
      </div>
      {rightElement && <div className="right-element" style={{ marginLeft: '8px', flexShrink: 0 }}>{rightElement}</div>}
    </div>
  );
};
