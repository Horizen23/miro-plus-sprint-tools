import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "icon" | "delete" | "tiny" | "copy" | "point" | "outline" | "ghost-tiny";
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  loading = false,
  icon,
  fullWidth = false,
  className = "",
  style,
  disabled,
  ...props
}) => {
  const variantClasses: Record<string, string> = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    icon: "btn-icon-dark",
    delete: "btn-delete",
    tiny: "btn-tiny",
    copy: "btn-copy",
    point: "point-btn",
    outline: "btn-outline",
    "ghost-tiny": "btn-ghost-tiny"
  };

  const combinedStyle: React.CSSProperties = {
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };

  const isTinyVariant = variant === "tiny" || variant === "ghost-tiny";

  return (
    <button
      className={`${variantClasses[variant] || "btn-primary"} ${loading ? "loading" : ""} ${className}`.trim()}
      style={combinedStyle}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span 
          className="spinner" 
          style={{ 
            marginRight: children ? '4px' : '0',
            width: isTinyVariant ? '8px' : '12px',
            height: isTinyVariant ? '8px' : '12px',
            borderWidth: isTinyVariant ? '1px' : '1.5px'
          }}
        ></span>
      )}
      {!loading && icon}
      {children}
    </button>
  );
};
