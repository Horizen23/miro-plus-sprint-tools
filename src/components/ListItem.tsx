import * as React from "react";

interface ListItemProps {
  title: string;
  subtitle?: string;
  checked?: boolean;
  onCheck?: () => void;
  onToggle?: () => void;
  onClick?: () => void;
  showCheckbox?: boolean;
  showBullet?: boolean;
  className?: string;
  rightElement?: React.ReactNode;
  style?: React.CSSProperties;
  icon?: string | React.ReactNode;
  disabled?: boolean;
}

export const ListItem: React.FC<ListItemProps> = ({
  title,
  subtitle,
  checked = false,
  onCheck,
  onToggle,
  onClick,
  showCheckbox = true,
  showBullet = false,
  className = "",
  rightElement,
  style,
  icon,
  disabled = false
}) => {
  const handleToggle = (e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    if (onToggle) onToggle();
    else if (onCheck) onCheck();
  };

  return (
    <div 
      className={`card-title-item ${className} ${disabled ? 'disabled' : ''}`} 
      onClick={disabled ? undefined : (onClick || handleToggle)}
      style={{ 
        cursor: disabled ? 'not-allowed' : 'pointer', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        width: '100%',
        opacity: disabled ? 0.5 : 1,
        ...style 
      }}
    >
      <div className="title-left" style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
        {showCheckbox && (
          <input 
            type="checkbox" 
            checked={checked} 
            onChange={handleToggle as unknown as (e: React.ChangeEvent<HTMLInputElement>) => void} 
            onClick={e => e.stopPropagation()} 
            disabled={disabled}
            style={{ accentColor: '#4262ff', marginRight: '8px', cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
        )}
        {icon && <span className="list-item-icon" style={{ marginRight: '8px', fontSize: '12px' }}>{icon}</span>}
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
