import * as React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "status" | "count" | "error" | "success" | "warning";
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = "status", 
  className = "",
  style 
}) => {
  const getClassName = () => {
    switch (variant) {
      case "status": return "voting-badge-status";
      case "count": return "card-count";
      case "error": return "badge-error";
      case "success": return "badge-success";
      case "warning": return "badge-warning";
      default: return "";
    }
  };

  return (
    <span className={`${getClassName()} ${className}`} style={style}>
      {children}
    </span>
  );
};
